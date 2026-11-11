'use server';
import {revalidatePath} from 'next/cache';
import {dbAdmin,requireHqUser} from '@/lib/hq-auth';
const parsePerth=(s:string)=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)?new Date(s+':00+08:00'):new Date(NaN);

const CONFLICT_PREFIX='SCHEDULING_CONFLICT: ';
async function checkVisitConflicts(db:ReturnType<typeof dbAdmin>,visitId:string,startIso:string,endIso:string,staffIds:string[]){
 if(!staffIds.length)return [];
 const {data:overlapping,error}=await db.from('job_appointments')
  .select('id,job_id,starts_at,ends_at')
  .eq('status','scheduled').neq('id',visitId)
  .lt('starts_at',endIso).gt('ends_at',startIso).limit(500);
 if(error)throw new Error('Unable to check scheduling conflicts. Try again.');
 if(!overlapping?.length)return [];
 if(overlapping.length===500)throw new Error('Too many overlapping visits to verify safely.');
 const ids=overlapping.map(v=>v.id);
 const {data:assigned,error:assignedError}=await db.from('job_appointment_staff').select('appointment_id,staff_id').in('appointment_id',ids).in('staff_id',staffIds);
 if(assignedError)throw new Error('Unable to check electrician availability.');
 const clashingIds=new Set((assigned??[]).map(a=>a.appointment_id));
 if(!clashingIds.size)return [];
 const {data:profiles,error:profileError}=await db.from('staff_profiles').select('user_id,full_name').in('user_id',staffIds);
 if(profileError)throw new Error('Unable to identify conflicting electricians.');
 const names=new Map((profiles??[]).map(p=>[p.user_id,p.full_name]));
 const descriptions=overlapping.filter(v=>clashingIds.has(v.id)).slice(0,8).map(v=>{
  const crew=(assigned??[]).filter(a=>a.appointment_id===v.id).map(a=>names.get(a.staff_id)??'Electrician').join(', ');
  const time=new Date(v.starts_at).toLocaleString('en-AU',{timeZone:'Australia/Perth',weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
  return crew+' — '+time;
 });
 return descriptions;
}
function enforceConflictOverride(formData:FormData,conflicts:string[]){
 if(conflicts.length&&formData.get('confirm_conflict')!=='yes')throw new Error(CONFLICT_PREFIX+conflicts.join('; '));
}

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
  const {data:crew,error:crewError}=await db.from('job_appointment_staff').select('staff_id').eq('appointment_id',id);
  if(crewError)throw new Error('Unable to verify assigned electricians.');
  enforceConflictOverride(formData,await checkVisitConflicts(db,id,start.toISOString(),end.toISOString(),(crew??[]).map(a=>a.staff_id)));
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
 const {data:visit}=await db.from('job_appointments').select('job_id,status,starts_at,ends_at').eq('id',id).maybeSingle();
 if(!visit||visit.status!=='scheduled')throw new Error('Scheduled visit not found.');
 if(staffIds.length){
  const {data:active,error:staffError}=await db.from('staff_profiles').select('user_id').eq('active',true).in('user_id',staffIds);
  if(staffError||active?.length!==staffIds.length)throw new Error('Choose active staff members.');
 }
 enforceConflictOverride(formData,await checkVisitConflicts(db,id,visit.starts_at,visit.ends_at,staffIds));
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
