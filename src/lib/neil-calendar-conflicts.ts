import 'server-only';
import {dbAdmin} from '@/lib/hq-auth';
import {calendarEvents} from '@/lib/google-calendar';

/** Resolve Neil by exact first name; fail closed if staff identities are ambiguous. */
export async function neilStaffId(){
 const {data,error}=await dbAdmin().from('staff_profiles').select('user_id,full_name').eq('active',true).ilike('full_name','Neil %');
 if(error)throw new Error('Unable to verify Neil’s staff profile.');
 if(!data?.length)return null;
 if(data.length!==1)throw new Error('Multiple active Neil profiles exist. Resolve the staff mapping before scheduling.');
 return data[0].user_id as string;
}
export async function neilCalendarConflicts(staffIds:string[],start:Date,end:Date){
 const neil=await neilStaffId();
 if(!neil||!staffIds.includes(neil))return [];
 const events=await calendarEvents(start.toISOString(),end.toISOString());
 return events.filter(e=>e.busy&&new Date(e.start)<end&&new Date(e.end)>start)
  .map(e=>({title:e.title,start:e.start,end:e.end}));
}
export async function requireNeilAvailability(staffIds:string[],start:Date,end:Date,override:boolean,role:string){
 const conflicts=await neilCalendarConflicts(staffIds,start,end);
 if(conflicts.length&&!override){
  const label=conflicts.map(e=>e.title+' ('+new Date(e.start).toLocaleString('en-AU',{timeZone:'Australia/Perth',dateStyle:'medium',timeStyle:'short'})+' – '+new Date(e.end).toLocaleTimeString('en-AU',{timeZone:'Australia/Perth',timeStyle:'short'})+')').join('; ');
  throw new Error('Neil is unavailable in Google Calendar: '+label+'. To proceed, tick “Override Neil’s Google Calendar conflict” and save again.');
 }
 if(conflicts.length&&override&&!['owner','admin'].includes(role))throw new Error('Only an owner or admin may override Neil’s Google Calendar conflict.');
 return conflicts;
}
