'use server';
import {
 buildOverlapConflictLines,
 formatHqElectricianOverlapMessage,
 hasElectricianOverlap,
} from '@/lib/hq-electrician-overlaps';
import {requireNeilAvailability} from '@/lib/neil-calendar-conflicts';
import {isJobStatus,isSchedulableJobStatus} from '@/lib/job-statuses';
import {applyJobStatusSync} from '@/lib/job-status-sync';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {assertAdminOps,assertOfficeOps,dbAdmin,requireHqUser} from '@/lib/hq-auth';
import {
  assessJobEmptyDelete,
  formatEmptyDeleteBlockers,
} from '@/lib/hq-empty-delete-assess';
import {jobTitleFromDescription} from '@/lib/job-title-from-description';
import {syncPrimaryJobQuoteAfterCreate} from './job-quote-actions';

export type JobMutationResult={ok:boolean;message:string};

export async function createJob(formData:FormData){
 const user=await requireHqUser();
 assertOfficeOps(user);
 const customerId=String(formData.get('customer_id')||'').trim();
 const description=String(formData.get('description')||'').trim();
 const title=jobTitleFromDescription(description);
 const priority=String(formData.get('priority')||'normal');
 const siteAddress=String(formData.get('site_address_text')||'').trim();
 const enquiryId=String(formData.get('enquiry_id')||'').trim();
 const quoteId=String(formData.get('quote_id')||'').trim();
 const idempotencyKey=String(formData.get('idempotency_key')||'').trim();
 const uuid=/^[0-9a-f-]{36}$/i;
 if(siteAddress.length>500)throw new Error('Site address is too long.');
 if(description.length<2||description.length>5000||title.length<2||title.length>200||!['low','normal','high','urgent'].includes(priority))throw new Error('Please check the job details.');
 if(enquiryId&&!uuid.test(enquiryId))throw new Error('Invalid enquiry link.');
 if(quoteId&&!uuid.test(quoteId))throw new Error('Invalid quote link.');
 if(!uuid.test(idempotencyKey))throw new Error('Missing create token. Refresh the page and try again.');
 const db=dbAdmin();
 const {data:existing}=await db.from('jobs').select('id').eq('create_idempotency_key',idempotencyKey).maybeSingle();
 if(existing){revalidatePath('/hq/jobs');redirect('/hq/jobs/'+existing.id)}
 if(customerId){const {data:customer}=await db.from('customers').select('id').eq('id',customerId).maybeSingle();if(!customer)throw new Error('Customer not found.');}
 if(enquiryId){const {data:enquiry}=await db.from('enquiries').select('id').eq('id',enquiryId).maybeSingle();if(!enquiry)throw new Error('Enquiry not found.');}
 if(quoteId){const {data:quote}=await db.from('quotes').select('id').eq('id',quoteId).maybeSingle();if(!quote)throw new Error('Quote not found.');}
 const {data,error}=await db.from('jobs').insert({title,description,customer_id:customerId||null,site_address_text:siteAddress||null,priority,enquiry_id:enquiryId||null,quote_id:quoteId||null,create_idempotency_key:idempotencyKey,created_by:user.id}).select('id').single();
 if(error){
  // Unique violation on create_idempotency_key: a concurrent retry already inserted this job.
  if(String(error.code)==='23505'||/create_idempotency_key|duplicate key/i.test(error.message||'')){
   const {data:raced}=await db.from('jobs').select('id').eq('create_idempotency_key',idempotencyKey).maybeSingle();
   if(raced){revalidatePath('/hq/jobs');redirect('/hq/jobs/'+raced.id)}
  }
  throw new Error('Unable to create job.');
 }
 if(!data)throw new Error('Unable to create job.');
 await db.from('job_activity').insert({job_id:data.id,actor_id:user.id,action:'created'});
 if(quoteId){
  const sync=await syncPrimaryJobQuoteAfterCreate({jobId:data.id,quoteId,actorId:user.id});
  if(sync.status==='failed'){
   // Migrations are present but sync failed. Clear the legacy pointer so the two
   // representations stay consistent (neither claims a primary), then fail loudly
   // with a recoverable path that identifies the quote.
   await db.from('jobs').update({quote_id:null,updated_at:new Date().toISOString()}).eq('id',data.id);
   await db.from('job_activity').insert({
    job_id:data.id,
    actor_id:user.id,
    action:'quote_primary_sync_failed',
    note:`Cleared jobs.quote_id after sync failure for ${quoteId}. ${sync.message}`,
   });
   revalidatePath('/hq/jobs');
   revalidatePath('/hq/jobs/'+data.id);
   throw new Error(
    `Job was created, but the primary quote could not be associated (${sync.message}). `+
    `Open the job Quotes tab and link quote ${quoteId}.`,
   );
  }
 }
 revalidatePath('/hq/jobs');
 revalidatePath('/hq/jobs/'+data.id);
 revalidatePath('/hq/schedule');
 redirect('/hq/jobs/'+data.id);
}
export async function updateJob(formData:FormData){
 const user=await requireHqUser();
 assertOfficeOps(user);
 const id=String(formData.get('id')||'');
 const status=String(formData.get('status')||'');
 const note=String(formData.get('note')||'').trim();
 if(!/^[a-f0-9-]{36}$/i.test(id)||!isJobStatus(status)||note.length>2000)throw new Error('Invalid update.');
 const db=dbAdmin();
 const {data:before}=await db.from('jobs').select('status').eq('id',id).maybeSingle();
 if(!before)throw new Error('Job not found.');
 const {error}=await db.from('jobs').update({status,updated_at:new Date().toISOString(),completed_at:status==='completed'?new Date().toISOString():null}).eq('id',id);
 if(error)throw new Error('Unable to update job.');
 if(before.status!==status||note)await db.from('job_activity').insert({job_id:id,actor_id:user.id,action:before.status===status?'note_added':'status_changed',note:note||('Status: '+before.status+' → '+status)});
 revalidatePath('/hq/jobs');revalidatePath('/hq/jobs/'+id);revalidatePath('/hq/schedule');
}

export async function updateJobDetails(formData:FormData){
 const user=await requireHqUser();assertOfficeOps(user);
 const id=String(formData.get('id')||'');const title=String(formData.get('title')||'').trim();const description=String(formData.get('description')||'').trim();const priority=String(formData.get('priority')||'normal');const customerId=String(formData.get('customer_id')||'');const siteAddress=String(formData.get('site_address_text')||'').trim();
 if(siteAddress.length>500)throw new Error('Site address is too long.');
 if(!/^[0-9a-f-]{36}$/i.test(id)||title.length<2||title.length>200||description.length>5000||!['low','normal','high','urgent'].includes(priority))throw new Error('Invalid job details.');
 const db=dbAdmin();const {error}=await db.from('jobs').update({title,description:description||null,priority,customer_id:customerId||null,site_address_text:siteAddress||null,updated_at:new Date().toISOString()}).eq('id',id);
 if(error)throw new Error('Could not save job details.');
 await db.from('job_activity').insert({job_id:id,actor_id:user.id,action:'details_updated'});
 revalidatePath('/hq/jobs');revalidatePath('/hq/jobs/'+id);
}

/** Soft-close a job as cancelled. Job number is retained and never reused. */
export async function cancelJob(jobId:string):Promise<JobMutationResult>{
 try{
  const user=await requireHqUser();
  assertOfficeOps(user);
  if(!/^[0-9a-f-]{36}$/i.test(jobId))return {ok:false,message:'Invalid job.'};
  const db=dbAdmin();
  const {data:before}=await db.from('jobs').select('id,status,job_number').eq('id',jobId).maybeSingle();
  if(!before)return {ok:false,message:'Job not found.'};
  if(before.status==='cancelled')return {ok:true,message:'Job is already cancelled.'};
  if(before.status==='completed')return {ok:false,message:'Completed jobs cannot be cancelled.'};
  const {error}=await db.from('jobs').update({status:'cancelled',updated_at:new Date().toISOString(),completed_at:null}).eq('id',jobId);
  if(error)return {ok:false,message:'Unable to cancel job.'};
  await db.from('job_activity').insert({
   job_id:jobId,
   actor_id:user.id,
   action:'status_changed',
   note:`Status: ${before.status} → cancelled`,
  });
  revalidatePath('/hq/jobs');
  revalidatePath('/hq/jobs/'+jobId);
  revalidatePath('/hq/schedule');
  return {ok:true,message:'Job cancelled. The job number is retained and will not be reused.'};
 }catch(error){
  return {ok:false,message:error instanceof Error?error.message:'Unable to cancel job.'};
 }
}

/** Hard-delete only empty / no-merit jobs. Admin/owner only; numbers are never reused. */
export async function deleteEmptyJob(jobId:string):Promise<JobMutationResult>{
 try{
  const user=await requireHqUser();
  assertAdminOps(user);
  if(!/^[0-9a-f-]{36}$/i.test(jobId))return {ok:false,message:'Invalid job.'};
  const db=dbAdmin();
  const {data:job}=await db.from('jobs').select('id,job_number').eq('id',jobId).maybeSingle();
  if(!job)return {ok:false,message:'Job not found.'};
  const verdict=await assessJobEmptyDelete(db,jobId);
  if(!verdict.eligible)return {ok:false,message:formatEmptyDeleteBlockers(verdict.blockers)};
  await db.from('job_activity').delete().eq('job_id',jobId);
  const {error}=await db.from('jobs').delete().eq('id',jobId);
  if(error)return {ok:false,message:'Unable to delete job.'};
  revalidatePath('/hq/jobs');
  revalidatePath('/hq/schedule');
  return {
   ok:true,
   message:`Job JB${String(job.job_number).padStart(5,'0')} deleted. That number will not be reused.`,
  };
 }catch(error){
  return {ok:false,message:error instanceof Error?error.message:'Unable to delete job.'};
 }
}

export async function addJobAppointment(formData:FormData):Promise<{ok:boolean;message:string}>{
 try{
  const user=await requireHqUser();assertOfficeOps(user);
  const jobId=String(formData.get('job_id')||'');const start=String(formData.get('start')||'');const end=String(formData.get('end')||'');const notes=String(formData.get('notes')||'').trim();
  // HTML datetime-local inputs are interpreted in Perth local time, independent of server timezone.
  const parse=(s:string)=>/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(s)?new Date(s+':00+08:00'):new Date(NaN);
  const begins=parse(start),ends=parse(end);
  if(!Number.isFinite(begins.getTime())||!Number.isFinite(ends.getTime())||ends<=begins||notes.length>2000)throw new Error('Please enter a valid appointment.');
  const db=dbAdmin();
  const explicit=formData.get('explicit_visit_staff')==='yes';
  const chosen=[...new Set(formData.getAll('staff_id').map(String))];
  if(chosen.some(id=>!/^[0-9a-f-]{36}$/i.test(id)))throw new Error('Invalid electrician selection.');
  const {data:job,error:jobError}=await db.from('jobs').select('id,status').eq('id',jobId).maybeSingle();
  if(jobError||!job||!isSchedulableJobStatus(job.status))throw new Error('Select an active job.');
  let staffIds:string[];
  if(explicit)staffIds=chosen;
  else{
   // Fallback for callers without explicit visit crew: derive from non-cancelled visits.
   const {data:activeVisits,error:visitLookupError}=await db.from('job_appointments').select('id').eq('job_id',jobId).neq('status','cancelled');
   if(visitLookupError)throw new Error('Unable to read job visits.');
   const visitIds=(activeVisits??[]).map(v=>v.id);
   if(!visitIds.length)staffIds=[];
   else{
    const {data:visitStaff,error:staffLookupError}=await db.from('job_appointment_staff').select('staff_id').in('appointment_id',visitIds);
    if(staffLookupError)throw new Error('Unable to read job electricians.');
    staffIds=[...new Set((visitStaff??[]).map(a=>a.staff_id))];
   }
  }
  if(staffIds.length){
   const {data:active,error:staffError}=await db.from('scheduling_staff').select('id').eq('active',true).in('id',staffIds);
   if(staffError||active?.length!==staffIds.length)throw new Error('Choose active electricians only.');
  }
  const {data:overlapping,error:overlapError}=await db.from('job_appointments').select('id,job_id,starts_at,ends_at').eq('status','scheduled').lt('starts_at',ends.toISOString()).gt('ends_at',begins.toISOString()).limit(200);
  if(overlapError)throw new Error('Unable to check existing bookings. Please retry.');
  const overlapRows=overlapping??[];
  if(overlapRows.some(v=>v.job_id===jobId&&v.starts_at===begins.toISOString()&&v.ends_at===ends.toISOString()))
   throw new Error('This job already has a visit booked for exactly these times. No duplicate was created.');
  const overlapIds=overlapRows.map(v=>v.id);
  if(staffIds.length&&overlapIds.length){
   const {data:booked,error:bookedError}=await db.from('job_appointment_staff').select('appointment_id,staff_id').in('appointment_id',overlapIds);
   if(bookedError)throw new Error('Unable to check electrician availability.');
   const bookedRows=booked??[];
   if(hasElectricianOverlap(staffIds,bookedRows)){
    const jobIds=[...new Set(overlapRows.map(v=>v.job_id))];
    const [{data:profiles},{data:jobs}]=await Promise.all([
     db.from('scheduling_staff').select('id,full_name').in('id',staffIds),
     db.from('jobs').select('id,job_number,title,customer_id').in('id',jobIds),
    ]);
    const jobRows=jobs??[];
    const customerIds=[...new Set(jobRows.map(j=>j.customer_id).filter((id):id is string=>Boolean(id)))];
    const {data:customerRows}=customerIds.length?await db.from('customers').select('id,name').in('id',customerIds):{data:[] as {id:string;name:string|null}[]};
    const customerMap=new Map((customerRows??[]).map(c=>[c.id,c.name||'Customer']));
    const jobMap=new Map(jobRows.map(j=>[j.id,j]));
    const staffNames=new Map((profiles??[]).map(p=>[p.id,p.full_name||'Electrician']));
    throw new Error(formatHqElectricianOverlapMessage(buildOverlapConflictLines({
     staffIds,
     staffNames,
     bookedOnOverlaps:bookedRows,
     visits:overlapRows.map(v=>{
      const job=jobMap.get(v.job_id);
      return {
       id:v.id,
       starts_at:v.starts_at,
       ends_at:v.ends_at,
       job_number:job?.job_number??null,
       job_title:job?.title??null,
       customer_name:job?.customer_id?customerMap.get(job.customer_id)??null:null,
      };
     }),
    })));
   }
  }
  try{
   await requireNeilAvailability(staffIds,begins,ends);
  }catch(error){
   return {ok:false,message:error instanceof Error?error.message:'Unable to verify Google Calendar availability.'};
  }
  const {data:visit,error}=await db.from('job_appointments').insert({job_id:jobId,starts_at:begins.toISOString(),ends_at:ends.toISOString(),notes:notes||null}).select('id').single();
  if(error||!visit)throw new Error('Could not schedule appointment.');
  if(staffIds.length){
   const {error:staffError}=await db.from('job_appointment_staff').insert(staffIds.map(staff_id=>({appointment_id:visit.id,staff_id})));
   if(staffError){
    const {error:rollbackError}=await db.from('job_appointments').delete().eq('id',visit.id);
    if(rollbackError)throw new Error('Visit was created but assigning electricians failed. Please review the calendar before retrying.');
    throw new Error('Unable to assign electricians. No appointment was saved.');
   }
  }
  await applyJobStatusSync(db,{jobId,trigger:'appointment_created',actorId:user.id});
  await db.from('job_activity').insert({job_id:jobId,actor_id:user.id,action:'appointment_added',note:start+' – '+end});
  revalidatePath('/hq/jobs/'+jobId);revalidatePath('/hq/jobs');revalidatePath('/hq/schedule');revalidatePath('/hq/jobs');
  return {ok:true,message:'Job scheduled successfully'};
 }catch(error){
  return {ok:false,message:error instanceof Error?error.message:'Could not schedule appointment.'};
 }
}
