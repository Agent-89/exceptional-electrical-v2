'use server';
import {revalidatePath} from 'next/cache';
import {dbAdmin,requireHqUser} from '@/lib/hq-auth';
const parsePerth=(s:string)=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)?new Date(s+':00+08:00'):new Date(NaN);
export async function updateScheduledVisit(formData:FormData){
 const user=await requireHqUser();
 if(!['owner','admin','office'].includes(user.role))throw new Error('Not permitted to manage scheduling.');
 const id=String(formData.get('appointment_id')||'');
 const action=String(formData.get('operation')||'reschedule');
 if(!/^[0-9a-f-]{36}$/i.test(id)||!['reschedule','cancel'].includes(action))throw new Error('Invalid appointment action.');
 const db=dbAdmin();
 const {data:visit,error:lookupError}=await db.from('job_appointments').select('id,job_id,status,starts_at,ends_at').eq('id',id).maybeSingle();
 if(lookupError||!visit)throw new Error('Appointment not found.');
 if(visit.status!=='scheduled')throw new Error('Only scheduled visits can be changed.');
 let update:Record<string,string>;
 if(action==='cancel')update={status:'cancelled'};
 else{
  const start=parsePerth(String(formData.get('start')||''));
  const end=parsePerth(String(formData.get('end')||''));
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)throw new Error('Enter a valid start and end time.');
  update={starts_at:start.toISOString(),ends_at:end.toISOString()};
 }
 const {error}=await db.from('job_appointments').update(update).eq('id',id).eq('status','scheduled');
 if(error)throw new Error('Could not update appointment.');
 await db.from('job_activity').insert({job_id:visit.job_id,actor_id:user.id,action:action==='cancel'?'appointment_cancelled':'appointment_rescheduled',note:action==='cancel'?'Visit cancelled':update.starts_at+' – '+update.ends_at});
 revalidatePath('/hq/schedule');revalidatePath('/hq/jobs');revalidatePath('/hq/jobs/'+visit.job_id);
}
