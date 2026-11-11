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
 let update:Record<string,string|null>;
 if(action==='cancel')update={status:'cancelled'};
 else{
  const start=parsePerth(String(formData.get('start')||''));
  const end=parsePerth(String(formData.get('end')||''));
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)throw new Error('Enter a valid start and end time.');
  const notes=String(formData.get('notes')??'').trim();
  if(notes.length>2000)throw new Error('Instructions must be 2000 characters or fewer.');
  update={starts_at:start.toISOString(),ends_at:end.toISOString(),notes:notes||null};
 }
 const {data:changed,error}=await db.from('job_appointments').update(update).eq('id',id).eq('status','scheduled').select('id').maybeSingle();
 if(error||!changed)throw new Error('Could not update appointment; it may have changed since opening.');
 await db.from('job_activity').insert({job_id:visit.job_id,actor_id:user.id,action:action==='cancel'?'appointment_cancelled':'appointment_rescheduled',note:action==='cancel'?'Visit cancelled':update.starts_at+' – '+update.ends_at});
 revalidatePath('/hq/schedule');revalidatePath('/hq/jobs');revalidatePath('/hq/jobs/'+visit.job_id);
}

export async function updateVisitStaff(formData:FormData){
 const user=await requireHqUser();
 if(!['owner','admin','office'].includes(user.role))throw new Error('Not permitted to dispatch staff.');
 const id=String(formData.get('appointment_id')||'');
 const staffIds=[...new Set(formData.getAll('staff_id').map(String).filter(Boolean))];
 if(!/^[0-9a-f-]{36}$/i.test(id)||staffIds.some(v=>!/^[0-9a-f-]{36}$/i.test(v)))throw new Error('Invalid visit assignment.');
 const db=dbAdmin();
 const {data:visit}=await db.from('job_appointments').select('job_id,status').eq('id',id).maybeSingle();
 if(!visit||visit.status!=='scheduled')throw new Error('Scheduled visit not found.');
 if(staffIds.length){
  const {data:active,error:staffError}=await db.from('staff_profiles').select('user_id').eq('active',true).in('user_id',staffIds);
  if(staffError||active?.length!==staffIds.length)throw new Error('Choose active staff members.');
 }
 const {data:existing,error:readError}=await db.from('job_appointment_staff').select('staff_id').eq('appointment_id',id);
 if(readError)throw new Error('Unable to read current visit staff.');
 const oldIds=new Set((existing??[]).map(row=>row.staff_id));
 const toAdd=staffIds.filter(staffId=>!oldIds.has(staffId));
 const toRemove=[...oldIds].filter(staffId=>!staffIds.includes(staffId));
 // Add before removing existing crew so a failed insert never clears the roster.
 if(toAdd.length){const {error:addError}=await db.from('job_appointment_staff').insert(toAdd.map(staff_id=>({appointment_id:id,staff_id})));if(addError)throw new Error('Unable to assign visit staff.');}
 if(toRemove.length){const {error:removeError}=await db.from('job_appointment_staff').delete().eq('appointment_id',id).in('staff_id',toRemove);if(removeError)throw new Error('Unable to remove previous visit staff.');}
 await db.from('job_activity').insert({job_id:visit.job_id,actor_id:user.id,action:'visit_staff_updated',note:staffIds.length+' electrician(s) assigned to visit'});
 revalidatePath('/hq/schedule');revalidatePath('/hq/jobs/'+visit.job_id);
}

/** Move a visit while preserving its duration and assigned crew. */
export async function moveScheduledVisit(id:string,day:string,startMinutes:number){
 const user=await requireHqUser();
 if(!['owner','admin','office'].includes(user.role))throw new Error('Not permitted to reschedule visits.');
 if(!/^[0-9a-f-]{36}$/i.test(id)||!/^\\d{4}-\\d{2}-\\d{2}$/.test(day)||!Number.isInteger(startMinutes)||startMinutes<0||startMinutes>=1440||startMinutes%15!==0)throw new Error('Invalid appointment time.');
 const start=new Date(day+'T00:00:00+08:00');
 if(!Number.isFinite(start.getTime())||day!==new Date(start.getTime()+8*3600000).toISOString().slice(0,10))throw new Error('Invalid appointment date.');
 const db=dbAdmin();
 const {data:visit,error:lookupError}=await db.from('job_appointments').select('id,job_id,status,starts_at,ends_at').eq('id',id).maybeSingle();
 if(lookupError||!visit||visit.status!=='scheduled')throw new Error('Scheduled visit not found.');
 const duration=new Date(visit.ends_at).getTime()-new Date(visit.starts_at).getTime();
 if(duration<=0||duration>7*86400000)throw new Error('Invalid existing visit duration.');
 const nextStart=new Date(start.getTime()+startMinutes*60000);
 const nextEnd=new Date(nextStart.getTime()+duration);
 const {data:changed,error}=await db.from('job_appointments').update({starts_at:nextStart.toISOString(),ends_at:nextEnd.toISOString()}).eq('id',id).eq('status','scheduled').eq('starts_at',visit.starts_at).select('id').maybeSingle();
 if(error||!changed)throw new Error('Visit changed while you were moving it. Refresh and retry.');
 await db.from('job_activity').insert({job_id:visit.job_id,actor_id:user.id,action:'appointment_rescheduled',note:nextStart.toISOString()+' – '+nextEnd.toISOString()});
 revalidatePath('/hq/schedule');revalidatePath('/hq/jobs');revalidatePath('/hq/jobs/'+visit.job_id);
}
