'use server';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {dbAdmin,requireHqUser} from '@/lib/hq-auth';
export async function createJob(formData:FormData){
 const user=await requireHqUser();
 if(!['owner','admin','office'].includes(user.role))throw new Error('You do not have permission to create jobs.');
 const title=String(formData.get('title')||'').trim();
 const customerId=String(formData.get('customer_id')||'').trim();
 const description=String(formData.get('description')||'').trim();
 const priority=String(formData.get('priority')||'normal');
 const siteAddress=String(formData.get('site_address_text')||'').trim();
 if(siteAddress.length>500)throw new Error('Site address is too long.');
 if(title.length<2||title.length>200||description.length>5000||!['low','normal','high','urgent'].includes(priority))throw new Error('Please check the job details.');
 const db=dbAdmin();
 if(customerId){const {data:customer}=await db.from('customers').select('id').eq('id',customerId).maybeSingle();if(!customer)throw new Error('Customer not found.');}
 const {data,error}=await db.from('jobs').insert({title,description:description||null,customer_id:customerId||null,site_address_text:siteAddress||null,priority,created_by:user.id}).select('id').single();
 if(error||!data)throw new Error('Unable to create job.');
 await db.from('job_activity').insert({job_id:data.id,actor_id:user.id,action:'created'});
 revalidatePath('/hq/jobs');
 redirect('/hq/jobs/'+data.id);
}
export async function updateJob(formData:FormData){
 const user=await requireHqUser();
 if(!['owner','admin','office'].includes(user.role))throw new Error('You do not have permission to update jobs.');
 const id=String(formData.get('id')||'');
 const status=String(formData.get('status')||'');
 const note=String(formData.get('note')||'').trim();
 if(!/^[a-f0-9-]{36}$/i.test(id)||!['unassigned','assigned','scheduled','in_progress','on_hold','completed','cancelled'].includes(status)||note.length>2000)throw new Error('Invalid update.');
 const db=dbAdmin();
 const {data:before}=await db.from('jobs').select('status').eq('id',id).maybeSingle();
 if(!before)throw new Error('Job not found.');
 const {error}=await db.from('jobs').update({status,updated_at:new Date().toISOString(),completed_at:status==='completed'?new Date().toISOString():null}).eq('id',id);
 if(error)throw new Error('Unable to update job.');
 if(before.status!==status||note)await db.from('job_activity').insert({job_id:id,actor_id:user.id,action:before.status===status?'note_added':'status_changed',note:note||('Status: '+before.status+' → '+status)});
 revalidatePath('/hq/jobs');revalidatePath('/hq/jobs/'+id);revalidatePath('/hq/schedule');
}

export async function updateJobDetails(formData:FormData){
 const user=await requireHqUser();if(!['owner','admin','office'].includes(user.role))throw new Error('Not permitted.');
 const id=String(formData.get('id')||'');const title=String(formData.get('title')||'').trim();const description=String(formData.get('description')||'').trim();const priority=String(formData.get('priority')||'normal');const customerId=String(formData.get('customer_id')||'');const siteAddress=String(formData.get('site_address_text')||'').trim();
 if(siteAddress.length>500)throw new Error('Site address is too long.');
 if(!/^[0-9a-f-]{36}$/i.test(id)||title.length<2||title.length>200||description.length>5000||!['low','normal','high','urgent'].includes(priority))throw new Error('Invalid job details.');
 const db=dbAdmin();const {error}=await db.from('jobs').update({title,description:description||null,priority,customer_id:customerId||null,site_address_text:siteAddress||null,updated_at:new Date().toISOString()}).eq('id',id);
 if(error)throw new Error('Could not save job details.');
 await db.from('job_activity').insert({job_id:id,actor_id:user.id,action:'details_updated'});
 revalidatePath('/hq/jobs');revalidatePath('/hq/jobs/'+id);
}
export async function assignJobStaff(formData:FormData){
 const user=await requireHqUser();if(!['owner','admin','office'].includes(user.role))throw new Error('Not permitted.');
 const jobId=String(formData.get('job_id')||'');const staffId=String(formData.get('staff_id')||'');
 const db=dbAdmin();const {data:staff}=await db.from('staff_profiles').select('user_id').eq('user_id',staffId).eq('active',true).maybeSingle();
 if(!staff)throw new Error('Staff member not found.');
 const {error}=await db.from('job_assignments').upsert({job_id:jobId,staff_id:staffId},{onConflict:'job_id,staff_id',ignoreDuplicates:true});
 if(error)throw new Error('Could not assign staff.');
 await db.from('job_activity').insert({job_id:jobId,actor_id:user.id,action:'staff_assigned'});
 revalidatePath('/hq/jobs/'+jobId);revalidatePath('/hq/jobs');revalidatePath('/hq/schedule');revalidatePath('/hq/schedule');
}
export async function removeJobStaff(formData:FormData){
 const user=await requireHqUser();if(!['owner','admin','office'].includes(user.role))throw new Error('Not permitted.');
 const jobId=String(formData.get('job_id')||'');const staffId=String(formData.get('staff_id')||'');
 const db=dbAdmin();const {error}=await db.from('job_assignments').delete().eq('job_id',jobId).eq('staff_id',staffId);
 if(error)throw new Error('Could not remove assignment.');
 await db.from('job_activity').insert({job_id:jobId,actor_id:user.id,action:'staff_unassigned'});
 revalidatePath('/hq/jobs/'+jobId);revalidatePath('/hq/jobs');revalidatePath('/hq/schedule');
}
export async function addJobAppointment(formData:FormData){
 const user=await requireHqUser();if(!['owner','admin','office'].includes(user.role))throw new Error('Not permitted.');
 const jobId=String(formData.get('job_id')||'');const start=String(formData.get('start')||'');const end=String(formData.get('end')||'');const notes=String(formData.get('notes')||'').trim();
 // HTML datetime-local inputs are interpreted in Perth local time, independent of server timezone.
 const parse=(s:string)=>/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(s)?new Date(s+':00+08:00'):new Date(NaN);
 const begins=parse(start),ends=parse(end);
 if(!Number.isFinite(begins.getTime())||!Number.isFinite(ends.getTime())||ends<=begins||notes.length>2000)throw new Error('Please enter a valid appointment.');
 const db=dbAdmin();const {error}=await db.from('job_appointments').insert({job_id:jobId,starts_at:begins.toISOString(),ends_at:ends.toISOString(),notes:notes||null});
 if(error)throw new Error('Could not schedule appointment.');
 await db.from('job_activity').insert({job_id:jobId,actor_id:user.id,action:'appointment_added',note:start+' – '+end});
 revalidatePath('/hq/jobs/'+jobId);revalidatePath('/hq/jobs');revalidatePath('/hq/schedule');revalidatePath('/hq/jobs');
}
