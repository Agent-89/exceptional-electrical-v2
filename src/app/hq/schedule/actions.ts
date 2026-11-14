'use server';
import {requireNeilAvailability} from '@/lib/neil-calendar-conflicts';
import {revalidatePath} from 'next/cache';
import {assertOfficeOps,dbAdmin,requireHqUser} from '@/lib/hq-auth';
const parsePerth=(s:string)=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)?new Date(s+':00+08:00'):new Date(NaN);
export async function updateScheduledVisit(formData:FormData){
 const user=await requireHqUser();
 assertOfficeOps(user);
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
 const {data:crew}=await db.from('job_appointment_staff').select('staff_id').eq('appointment_id',id);
 const conflicts=action==='reschedule'?await requireNeilAvailability((crew??[]).map(c=>c.staff_id),new Date(update.starts_at!),new Date(update.ends_at!),formData.get('override_neil_calendar')==='yes',user.role):[];
 const {data:changed,error}=await db.from('job_appointments').update(update).eq('id',id).eq('status','scheduled').select('id').maybeSingle();
 if(error||!changed)throw new Error('Could not update appointment; it may have changed since opening.');
 await db.from('job_activity').insert({job_id:visit.job_id,actor_id:user.id,action:action==='cancel'?'appointment_cancelled':'appointment_rescheduled',note:action==='cancel'?'Visit cancelled':update.starts_at+' – '+update.ends_at+(conflicts.length?' · Neil Google Calendar override by '+user.id:'')});
 revalidatePath('/hq/schedule');revalidatePath('/hq/jobs');revalidatePath('/hq/jobs/'+visit.job_id);
}

export async function updateVisitStaff(formData:FormData){
 const user=await requireHqUser();
 assertOfficeOps(user);
 const id=String(formData.get('appointment_id')||'');
 const staffIds=[...new Set(formData.getAll('staff_id').map(String).filter(Boolean))];
 if(!/^[0-9a-f-]{36}$/i.test(id)||staffIds.some(v=>!/^[0-9a-f-]{36}$/i.test(v)))throw new Error('Invalid visit assignment.');
 const db=dbAdmin();
 const {data:visit}=await db.from('job_appointments').select('job_id,status').eq('id',id).maybeSingle();
 if(!visit||visit.status!=='scheduled')throw new Error('Scheduled visit not found.');
 if(staffIds.length){
  const {data:active,error:staffError}=await db.from('scheduling_staff').select('id').eq('active',true).in('id',staffIds);
  if(staffError||active?.length!==staffIds.length)throw new Error('Choose active staff members.');
 }
 const {data:existing,error:readError}=await db.from('job_appointment_staff').select('staff_id').eq('appointment_id',id);
 if(readError)throw new Error('Unable to read current visit staff.');
 const oldIds=new Set((existing??[]).map(row=>row.staff_id));
 const {data:appointmentTimes}=await db.from('job_appointments').select('starts_at,ends_at').eq('id',id).single();
 if(!appointmentTimes)throw new Error('Unable to verify appointment time.');
 const conflicts=await requireNeilAvailability(staffIds,new Date(appointmentTimes.starts_at),new Date(appointmentTimes.ends_at),formData.get('override_neil_calendar')==='yes',user.role);
 const toAdd=staffIds.filter(staffId=>!oldIds.has(staffId));
 const toRemove=[...oldIds].filter(staffId=>!staffIds.includes(staffId));
 // Add before removing existing crew so a failed insert never clears the roster.
 if(toAdd.length){const {error:addError}=await db.from('job_appointment_staff').insert(toAdd.map(staff_id=>({appointment_id:id,staff_id})));if(addError)throw new Error('Unable to assign visit staff.');}
 if(toRemove.length){const {error:removeError}=await db.from('job_appointment_staff').delete().eq('appointment_id',id).in('staff_id',toRemove);if(removeError)throw new Error('Unable to remove previous visit staff.');}
 await db.from('job_activity').insert({job_id:visit.job_id,actor_id:user.id,action:'visit_staff_updated',note:staffIds.length+' electrician(s) assigned to visit'+(conflicts.length?' · Neil Google Calendar override by '+user.id:'')});
 revalidatePath('/hq/schedule');revalidatePath('/hq/jobs/'+visit.job_id);
}

/** Persist a calendar drag or resize without changing its crew or notes. */
export async function setScheduledVisitTimes(id:string,startIso:string,endIso:string,expectedStartIso:string,overrideNeil=false){
 const user=await requireHqUser();
 assertOfficeOps(user);
 if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Invalid appointment.');
 const start=new Date(startIso),end=new Date(endIso),expected=new Date(expectedStartIso);
 if(![start,end,expected].every(d=>Number.isFinite(d.getTime()))||end<=start||end.getTime()-start.getTime()>7*86400000||start.getTime()%900000!==0||end.getTime()%900000!==0)throw new Error('Choose valid 15-minute appointment times.');
 const db=dbAdmin();
 const {data:visit,error:lookupError}=await db.from('job_appointments').select('id,job_id,status,starts_at').eq('id',id).maybeSingle();
 if(lookupError||!visit||visit.status!=='scheduled')throw new Error('Scheduled visit not found.');
 const {data:crew}=await db.from('job_appointment_staff').select('staff_id').eq('appointment_id',id);
 const conflicts=await requireNeilAvailability((crew??[]).map(c=>c.staff_id),start,end,overrideNeil,user.role);
 const {data:changed,error}=await db.from('job_appointments').update({starts_at:start.toISOString(),ends_at:end.toISOString()}).eq('id',id).eq('status','scheduled').eq('starts_at',expected.toISOString()).select('id').maybeSingle();
 if(error||!changed)throw new Error('Visit changed since loading. Refresh and retry.');
 // Keep the critical update fast; log and cache refresh are best effort.
 await db.from('job_activity').insert({job_id:visit.job_id,actor_id:user.id,action:'appointment_rescheduled',note:start.toISOString()+' – '+end.toISOString()+(conflicts.length?' · Neil Google Calendar override by '+user.id:'')});
 revalidatePath('/hq/schedule');revalidatePath('/hq/jobs');revalidatePath('/hq/jobs/'+visit.job_id);
 return {starts_at:start.toISOString(),ends_at:end.toISOString()};
}
/** Compatibility for existing Move dialog. */
export async function moveScheduledVisit(id:string,day:string,startMinutes:number){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isInteger(startMinutes)||startMinutes<0||startMinutes>=1440||startMinutes%15!==0)throw new Error('Invalid appointment time.');
 const db=dbAdmin();
 await requireHqUser();
 const {data:v}=await db.from('job_appointments').select('starts_at,ends_at').eq('id',id).maybeSingle();
 if(!v)throw new Error('Appointment not found.');
 const start=new Date(day+'T00:00:00+08:00');
 if(!Number.isFinite(start.getTime()))throw new Error('Invalid date.');
 const next=new Date(start.getTime()+startMinutes*60000);
 return setScheduledVisitTimes(id,next.toISOString(),new Date(next.getTime()+new Date(v.ends_at).getTime()-new Date(v.starts_at).getTime()).toISOString(),v.starts_at);
}
