'use server';
import {
  buildOverlapConflictLines,
  formatHqElectricianOverlapMessage,
  hasElectricianOverlap,
} from '@/lib/hq-electrician-overlaps';
import {requireNeilAvailability} from '@/lib/neil-calendar-conflicts';
import type {ScheduleMutationResult} from '@/lib/schedule-mutation-result';
import {revalidatePath} from 'next/cache';
import {assertOfficeOps,dbAdmin,requireHqUser} from '@/lib/hq-auth';

const parsePerth=(s:string)=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)?new Date(s+':00+08:00'):new Date(NaN);

function asFailure(code:'hq_overlap'|'neil_conflict'|'validation'|'conflict'|'error', message:string):ScheduleMutationResult{
 return {ok:false,code,message};
}

/** Hard-block HQ crew double-booking (same rule as appointment creation). Excludes the visit being edited. */
async function findHqElectricianOverlapMessage(
 db:ReturnType<typeof dbAdmin>,
 visitId:string,
 startIso:string,
 endIso:string,
 staffIds:string[],
):Promise<string|null>{
 if(!staffIds.length)return null;
 const {data:overlapping,error}=await db.from('job_appointments')
  .select('id,starts_at,ends_at,job_id')
  .eq('status','scheduled')
  .neq('id',visitId)
  .lt('starts_at',endIso)
  .gt('ends_at',startIso)
  .limit(200);
 if(error)throw new Error('Unable to check existing bookings. Please retry.');
 const overlapRows=overlapping??[];
 if(!overlapRows.length)return null;
 const overlapIds=overlapRows.map(v=>v.id);
 const {data:booked,error:bookedError}=await db.from('job_appointment_staff')
  .select('appointment_id,staff_id')
  .in('appointment_id',overlapIds);
 if(bookedError)throw new Error('Unable to check electrician availability.');
 const bookedRows=booked??[];
 if(!hasElectricianOverlap(staffIds,bookedRows))return null;

 const jobIds=[...new Set(overlapRows.map(v=>v.job_id).filter(Boolean))];
 const [{data:profiles},{data:jobs}]=await Promise.all([
  db.from('scheduling_staff').select('id,full_name').in('id',staffIds),
  jobIds.length
   ?db.from('jobs').select('id,job_number,title,customer_id').in('id',jobIds)
   :Promise.resolve({data:[] as {id:string;job_number:number|null;title:string|null;customer_id:string|null}[]}),
 ]);
 const jobRows=jobs??[];
 const customerIds=[...new Set(jobRows.map(j=>j.customer_id).filter((id):id is string=>Boolean(id)))];
 const {data:customerRows}=customerIds.length
  ?await db.from('customers').select('id,name').in('id',customerIds)
  :{data:[] as {id:string;name:string|null}[]};
 const customerMap=new Map((customerRows??[]).map(c=>[c.id,c.name||'Customer']));
 const jobMap=new Map(jobRows.map(j=>[j.id,j]));
 const staffNames=new Map((profiles??[]).map(p=>[p.id,p.full_name||'Electrician']));
 const lines=buildOverlapConflictLines({
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
 });
 return formatHqElectricianOverlapMessage(lines);
}

function neilFailureMessage(error:unknown):ScheduleMutationResult{
 const message=error instanceof Error?error.message:'Unable to verify Google Calendar availability.';
 if(/Google Calendar|override/i.test(message))return asFailure('neil_conflict',message);
 return asFailure('error',message);
}

export async function updateScheduledVisit(formData:FormData):Promise<ScheduleMutationResult>{
 try{
  const user=await requireHqUser();
  assertOfficeOps(user);
  const id=String(formData.get('appointment_id')||'');
  const action=String(formData.get('operation')||'reschedule');
  if(!/^[0-9a-f-]{36}$/i.test(id)||!['reschedule','cancel'].includes(action))return asFailure('validation','Invalid appointment action.');
  const db=dbAdmin();
  const {data:visit,error:lookupError}=await db.from('job_appointments').select('id,job_id,status,starts_at,ends_at').eq('id',id).maybeSingle();
  if(lookupError||!visit)return asFailure('validation','Appointment not found.');
  if(visit.status!=='scheduled')return asFailure('validation','Only scheduled visits can be changed.');
  let update:Record<string,string|null>;
  if(action==='cancel')update={status:'cancelled'};
  else{
   const start=parsePerth(String(formData.get('start')||''));
   const end=parsePerth(String(formData.get('end')||''));
   if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)return asFailure('validation','Enter a valid start and end time.');
   const notes=String(formData.get('notes')??'').trim();
   if(notes.length>2000)return asFailure('validation','Instructions must be 2000 characters or fewer.');
   update={starts_at:start.toISOString(),ends_at:end.toISOString(),notes:notes||null};
  }
  const {data:crew}=await db.from('job_appointment_staff').select('staff_id').eq('appointment_id',id);
  const crewIds=(crew??[]).map(c=>c.staff_id);
  if(action==='reschedule'){
   const overlap=await findHqElectricianOverlapMessage(db,id,update.starts_at!,update.ends_at!,crewIds);
   if(overlap)return asFailure('hq_overlap',overlap);
  }
  let conflicts:Awaited<ReturnType<typeof requireNeilAvailability>>=[];
  if(action==='reschedule'){
   try{
    conflicts=await requireNeilAvailability(crewIds,new Date(update.starts_at!),new Date(update.ends_at!),formData.get('override_neil_calendar')==='yes',user.role);
   }catch(error){
    return neilFailureMessage(error);
   }
  }
  const {data:changed,error}=await db.from('job_appointments').update(update).eq('id',id).eq('status','scheduled').select('id').maybeSingle();
  if(error||!changed)return asFailure('conflict','Could not update appointment; it may have changed since opening.');
  await db.from('job_activity').insert({job_id:visit.job_id,actor_id:user.id,action:action==='cancel'?'appointment_cancelled':'appointment_rescheduled',note:action==='cancel'?'Visit cancelled':update.starts_at+' – '+update.ends_at+(conflicts.length?' · Neil Google Calendar override by '+user.id:'')});
  revalidatePath('/hq/schedule');revalidatePath('/hq/jobs');revalidatePath('/hq/jobs/'+visit.job_id);
  return {ok:true};
 }catch(error){
  return asFailure('error',error instanceof Error?error.message:'Unable to update appointment.');
 }
}

export async function updateVisitStaff(formData:FormData):Promise<ScheduleMutationResult>{
 try{
  const user=await requireHqUser();
  assertOfficeOps(user);
  const id=String(formData.get('appointment_id')||'');
  const staffIds=[...new Set(formData.getAll('staff_id').map(String).filter(Boolean))];
  if(!/^[0-9a-f-]{36}$/i.test(id)||staffIds.some(v=>!/^[0-9a-f-]{36}$/i.test(v)))return asFailure('validation','Invalid visit assignment.');
  const db=dbAdmin();
  const {data:visit}=await db.from('job_appointments').select('job_id,status').eq('id',id).maybeSingle();
  if(!visit||visit.status!=='scheduled')return asFailure('validation','Scheduled visit not found.');
  if(staffIds.length){
   const {data:active,error:staffError}=await db.from('scheduling_staff').select('id').eq('active',true).in('id',staffIds);
   if(staffError||active?.length!==staffIds.length)return asFailure('validation','Choose active staff members.');
  }
  const {data:existing,error:readError}=await db.from('job_appointment_staff').select('staff_id').eq('appointment_id',id);
  if(readError)return asFailure('error','Unable to read current visit staff.');
  const oldIds=new Set((existing??[]).map(row=>row.staff_id));
  const {data:appointmentTimes}=await db.from('job_appointments').select('starts_at,ends_at').eq('id',id).single();
  if(!appointmentTimes)return asFailure('error','Unable to verify appointment time.');
  const overlap=await findHqElectricianOverlapMessage(db,id,appointmentTimes.starts_at,appointmentTimes.ends_at,staffIds);
  if(overlap)return asFailure('hq_overlap',overlap);
  let conflicts:Awaited<ReturnType<typeof requireNeilAvailability>>=[];
  try{
   conflicts=await requireNeilAvailability(staffIds,new Date(appointmentTimes.starts_at),new Date(appointmentTimes.ends_at),formData.get('override_neil_calendar')==='yes',user.role);
  }catch(error){
   return neilFailureMessage(error);
  }
  const toAdd=staffIds.filter(staffId=>!oldIds.has(staffId));
  const toRemove=[...oldIds].filter(staffId=>!staffIds.includes(staffId));
  // Add before removing existing crew so a failed insert never clears the roster.
  if(toAdd.length){const {error:addError}=await db.from('job_appointment_staff').insert(toAdd.map(staff_id=>({appointment_id:id,staff_id})));if(addError)return asFailure('error','Unable to assign visit staff.');}
  if(toRemove.length){const {error:removeError}=await db.from('job_appointment_staff').delete().eq('appointment_id',id).in('staff_id',toRemove);if(removeError)return asFailure('error','Unable to remove previous visit staff.');}
  await db.from('job_activity').insert({job_id:visit.job_id,actor_id:user.id,action:'visit_staff_updated',note:staffIds.length+' electrician(s) assigned to visit'+(conflicts.length?' · Neil Google Calendar override by '+user.id:'')});
  revalidatePath('/hq/schedule');revalidatePath('/hq/jobs/'+visit.job_id);
  return {ok:true};
 }catch(error){
  return asFailure('error',error instanceof Error?error.message:'Unable to update visit staff.');
 }
}

/** Persist a calendar drag or resize without changing its crew or notes. */
export async function setScheduledVisitTimes(id:string,startIso:string,endIso:string,expectedStartIso:string,overrideNeil=false):Promise<ScheduleMutationResult>{
 try{
  const user=await requireHqUser();
  assertOfficeOps(user);
  if(!/^[0-9a-f-]{36}$/i.test(id))return asFailure('validation','Invalid appointment.');
  const start=new Date(startIso),end=new Date(endIso),expected=new Date(expectedStartIso);
  if(![start,end,expected].every(d=>Number.isFinite(d.getTime()))||end<=start||end.getTime()-start.getTime()>7*86400000||start.getTime()%900000!==0||end.getTime()%900000!==0)return asFailure('validation','Choose valid 15-minute appointment times.');
  const db=dbAdmin();
  const {data:visit,error:lookupError}=await db.from('job_appointments').select('id,job_id,status,starts_at').eq('id',id).maybeSingle();
  if(lookupError||!visit||visit.status!=='scheduled')return asFailure('validation','Scheduled visit not found.');
  const {data:crew}=await db.from('job_appointment_staff').select('staff_id').eq('appointment_id',id);
  const crewIds=(crew??[]).map(c=>c.staff_id);
  const overlap=await findHqElectricianOverlapMessage(db,id,start.toISOString(),end.toISOString(),crewIds);
  if(overlap)return asFailure('hq_overlap',overlap);
  let conflicts:Awaited<ReturnType<typeof requireNeilAvailability>>=[];
  try{
   conflicts=await requireNeilAvailability(crewIds,start,end,overrideNeil,user.role);
  }catch(error){
   return neilFailureMessage(error);
  }
  const {data:changed,error}=await db.from('job_appointments').update({starts_at:start.toISOString(),ends_at:end.toISOString()}).eq('id',id).eq('status','scheduled').eq('starts_at',expected.toISOString()).select('id').maybeSingle();
  if(error||!changed)return asFailure('conflict','Visit changed since loading. Refresh and retry.');
  // Keep the critical update fast; log and cache refresh are best effort.
  await db.from('job_activity').insert({job_id:visit.job_id,actor_id:user.id,action:'appointment_rescheduled',note:start.toISOString()+' – '+end.toISOString()+(conflicts.length?' · Neil Google Calendar override by '+user.id:'')});
  revalidatePath('/hq/schedule');revalidatePath('/hq/jobs');revalidatePath('/hq/jobs/'+visit.job_id);
  return {ok:true,starts_at:start.toISOString(),ends_at:end.toISOString()};
 }catch(error){
  return asFailure('error',error instanceof Error?error.message:'Unable to reschedule visit.');
 }
}

/** Compatibility for existing Move dialog. */
export async function moveScheduledVisit(id:string,day:string,startMinutes:number):Promise<ScheduleMutationResult>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isInteger(startMinutes)||startMinutes<0||startMinutes>=1440||startMinutes%15!==0)return asFailure('validation','Invalid appointment time.');
 const db=dbAdmin();
 await requireHqUser();
 const {data:v}=await db.from('job_appointments').select('starts_at,ends_at').eq('id',id).maybeSingle();
 if(!v)return asFailure('validation','Appointment not found.');
 const start=new Date(day+'T00:00:00+08:00');
 if(!Number.isFinite(start.getTime()))return asFailure('validation','Invalid date.');
 const next=new Date(start.getTime()+startMinutes*60000);
 return setScheduledVisitTimes(id,next.toISOString(),new Date(next.getTime()+new Date(v.ends_at).getTime()-new Date(v.starts_at).getTime()).toISOString(),v.starts_at);
}
