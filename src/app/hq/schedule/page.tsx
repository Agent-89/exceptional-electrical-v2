import AppointmentDateTime from '../appointment-date-time';
import Link from 'next/link';
import {dbAdmin,requireHqUser} from '@/lib/hq-auth';
import {updateScheduledVisit,updateVisitStaff} from './actions';
import {addJobAppointment} from '../jobs/actions';
import DispatchViews from './view-switch';
import '../hq.css';
export const dynamic='force-dynamic';
type Visit={id:string;job_id:string;starts_at:string;ends_at:string;notes:string|null;status:string};
type Job={id:string;job_number:number;title:string;customer_id:string|null;site_address_text:string|null;status:string};
const zone='Australia/Perth';
const dayLabel=(date:Date)=>new Intl.DateTimeFormat('en-AU',{timeZone:zone,weekday:'short',day:'numeric',month:'short'}).format(date);
const timeLabel=(s:string)=>new Date(s).toLocaleTimeString('en-AU',{timeZone:zone,hour:'numeric',minute:'2-digit'});
const inputDate=(s:string)=>new Date(s).toLocaleString('sv-SE',{timeZone:zone,hour12:false}).replace(' ','T').slice(0,16);
const dayKey=(s:string|Date)=>(typeof s==='string'?new Date(s):s).toLocaleDateString('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
const dateAt=(s:string)=>new Date(s+'T00:00:00+08:00');
const addDays=(d:Date,n:number)=>new Date(d.getTime()+n*86400000);
export default async function SchedulePage({searchParams}:{searchParams:Promise<{week?:string;view?:string}>}){
 const user=await requireHqUser();const canEdit=['owner','admin','office'].includes(user.role);
 const params=await searchParams;
 const now=new Date();
 const today=dayKey(now);
 const selected=/^\d{4}-\d{2}-\d{2}$/.test(params.week??'')&&!Number.isNaN(dateAt(params.week!).getTime())?params.week!:today;
 const selectedDate=dateAt(selected);
 const perthWeekday=new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short'}).format(selectedDate);
 const monday=addDays(selectedDate,-(['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(perthWeekday)));
 const next=addDays(monday,7),prev=addDays(monday,-7);
 const days=Array.from({length:7},(_,i)=>addDays(monday,i));
 const view=params.view==='team'?'team':'week';
 const viewQuery=(v:string,w=dayKey(monday))=>'/hq/schedule?week='+w+'&view='+v;
 const db=dbAdmin();
 const [{data:visits,error},{data:jobs},{data:assignments},{data:staff},{data:customers},{data:visitStaff}]=await Promise.all([
  db.from('job_appointments').select('id,job_id,starts_at,ends_at,notes,status').eq('status','scheduled').gte('starts_at',monday.toISOString()).lt('starts_at',next.toISOString()).order('starts_at',{ascending:true}).limit(500),
  db.from('jobs').select('id,job_number,title,customer_id,site_address_text,status').limit(1000),
  db.from('job_assignments').select('job_id,staff_id').limit(3000),
  db.from('staff_profiles').select('user_id,full_name').eq('active',true).limit(300),
  db.from('customers').select('id,name').limit(1000),
  db.from('job_appointment_staff').select('appointment_id,staff_id').limit(5000)
 ]);
 const all=(visits??[]) as Visit[];
 const jobMap=new Map(((jobs??[]) as Job[]).map(j=>[j.id,j]));
 const staffMap=new Map((staff??[]).map(s=>[s.user_id,s.full_name]));
 const customerMap=new Map((customers??[]).map(c=>[c.id,c.name]));
 const assigned=new Map<string,string[]>();
 for(const a of assignments??[])assigned.set(a.job_id,[...(assigned.get(a.job_id)??[]),a.staff_id]);
 const visitAssigned=new Map<string,string[]>();
 for(const a of visitStaff??[])visitAssigned.set(a.appointment_id,[...(visitAssigned.get(a.appointment_id)??[]),a.staff_id]);
 const clashes=new Set<string>();
 const conflictDetails=new Map<string,string[]>();
 for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
  const a=all[i],b=all[j];
  if(new Date(a.starts_at)<new Date(b.ends_at)&&new Date(b.starts_at)<new Date(a.ends_at)&&
   (visitAssigned.get(a.id)??[]).some(id=>(visitAssigned.get(b.id)??[]).includes(id)) ){clashes.add(a.id);clashes.add(b.id);
   const describe=(v:Visit)=>`${jobMap.get(v.job_id)?.title??'Job'} (${dayLabel(new Date(v.starts_at))}, ${timeLabel(v.starts_at)}–${timeLabel(v.ends_at)})`;
   conflictDetails.set(a.id,[...(conflictDetails.get(a.id)??[]),describe(b)]);
   conflictDetails.set(b.id,[...(conflictDetails.get(b.id)??[]),describe(a)]);
  }
 }
 const renderVisit=(v:Visit)=>{
  const job=jobMap.get(v.job_id);const names=(visitAssigned.get(v.id)??[]).map(id=>staffMap.get(id)??'Team member');
  return <article key={v.id} className={'ee-dispatch-visit'+(clashes.has(v.id)?' has-conflict':'')}>
   <div className="ee-dispatch-time">{timeLabel(v.starts_at)} – {timeLabel(v.ends_at)}</div>
   <Link className="ee-dispatch-job" href={'/hq/jobs/'+v.job_id}>{job?.title??'Job'} <span>JB{String(job?.job_number??0).padStart(5,'0')}</span></Link>
   <div className="ee-dispatch-meta"><span className="ee-dispatch-meta-label">Customer:</span> {job?.customer_id?customerMap.get(job.customer_id)??'Customer':'No customer'}</div>
   <div className="ee-dispatch-meta"><span className="ee-dispatch-meta-label">{names.length===1?'Electrician:':'Electricians:'}</span> {names.length?names.join(', '):'Unassigned'}</div>
   {job?.site_address_text&&<div className="ee-dispatch-meta">{job.site_address_text}</div>}
   {clashes.has(v.id)&&<div className="ee-dispatch-conflict"><strong>Scheduling conflict — shared electrician</strong><span>Overlaps with: {(conflictDetails.get(v.id)??[]).join("; ")}</span></div>}
   {v.notes&&<p className="ee-dispatch-note">{v.notes}</p>}
   {canEdit&&<details className="ee-dispatch-edit"><summary>Assign electricians</summary><form action={updateVisitStaff}><input type="hidden" name="appointment_id" value={v.id}/><div className="ee-dispatch-staff-options">{[...staffMap.entries()].map(([id,name])=><label key={id}><input type="checkbox" name="staff_id" value={id} defaultChecked={(visitAssigned.get(v.id)??[]).includes(id)}/>{name}</label>)}</div><button type="submit">Save electricians</button></form></details>}
   {canEdit&&<details className="ee-dispatch-edit"><summary>Manage visit</summary><form action={updateScheduledVisit}><input type="hidden" name="appointment_id" value={v.id}/><AppointmentDateTime name="start" label="Start" defaultValue={inputDate(v.starts_at)}/><AppointmentDateTime name="end" label="End" defaultValue={inputDate(v.ends_at)}/><button type="submit" name="operation" value="reschedule">Save time</button><button className="ee-dispatch-cancel" type="submit" name="operation" value="cancel" formNoValidate>Cancel visit</button></form></details>}
  </article>;
 };
 return <main className="hq-detail"><div className="hq-detail-inner ee-dispatch">
 <div className="ee-dispatch-heading"><div><div className="hq-kicker">OPERATIONS</div><h1>Scheduling &amp; dispatch</h1><p>Plan visits and keep the team coordinated.</p></div><Link href="/hq/jobs" className="hq-detail-action-primary">View jobs</Link></div>
 <div className="ee-dispatch-toolbar"><div className="ee-dispatch-week"><Link aria-label="Previous week" href={viewQuery(view,dayKey(prev))}>‹</Link><strong>{dayLabel(monday)} – {dayLabel(addDays(monday,6))}</strong><Link aria-label="Next week" href={viewQuery(view,dayKey(next))}>›</Link></div><Link href={viewQuery(view,today)}>This week</Link></div>
 <div className="ee-dispatch-metrics"><div><small>Visits this week</small><strong>{all.length}</strong></div><div><small>Staff conflicts</small><strong>{clashes.size}</strong></div><div><small>Unassigned visits</small><strong>{all.filter(v=>!(visitAssigned.get(v.id)??[]).length).length}</strong></div></div>
 {error&&<p role="alert">Unable to load appointments. Please try again.</p>}
 {canEdit&&<details className="ee-dispatch-create"><summary>+ Schedule visit</summary><form action={addJobAppointment}><label>Job<select name="job_id" required defaultValue=""><option value="" disabled>Select a job</option>{((jobs??[]) as Job[]).filter(j=>!['cancelled','completed'].includes(j.status)).sort((a,b)=>b.job_number-a.job_number).map(j=><option value={j.id} key={j.id}>JB{String(j.job_number).padStart(5,'0')} — {j.title}</option>)}</select></label><AppointmentDateTime name="start" label="Start"/><AppointmentDateTime name="end" label="End"/><label>Instructions<textarea name="notes" maxLength={2000} rows={2}/></label><button type="submit">Schedule visit</button><small>Uses the electricians already assigned to the selected job. Times are AWST.</small></form></details>}
 {all.length===0&&<p className="ee-dispatch-zero">No visits scheduled for this week. Select <strong>Schedule visit</strong> to add one.</p>}
 <DispatchViews initialView={view} week={dayKey(monday)} dayBoard={<section className="ee-dispatch-board" aria-label="Weekly appointments">{days.map(d=>{const key=dayKey(d),entries=all.filter(v=>dayKey(v.starts_at)===key);return <div key={key} className={'ee-dispatch-day'+(key===today?' is-today':'')+(entries.length?'':' is-empty')}><div className="ee-dispatch-day-head"><strong>{dayLabel(d)}</strong><span>{entries.length} {entries.length===1?'visit':'visits'}</span></div>{entries.length?entries.map(renderVisit):<p className="ee-dispatch-empty">No visits</p>}</div>})}</section>} teamBoard={<section className="ee-dispatch-team-board" aria-label="Appointments by electrician">{[...staffMap.entries(),['unassigned','Unassigned'] as [string,string]].map(([id,name])=>{const entries=all.filter(v=>id==='unassigned'?!(visitAssigned.get(v.id)??[]).length:(visitAssigned.get(v.id)??[]).includes(id));return <div className="ee-dispatch-team-row" key={id}><header><strong>{name}</strong><span>{entries.length} {entries.length===1?'visit':'visits'}</span></header><div className="ee-dispatch-team-days">{days.map(d=>{const key=dayKey(d);const dayVisits=entries.filter(v=>dayKey(v.starts_at)===key);return <div className="ee-dispatch-team-day" key={key}><small>{dayLabel(d)}</small>{dayVisits.map(renderVisit)}</div>})}</div></div>})}</section>}/>
 <p className="ee-dispatch-footnote">All times shown in Perth local time (AWST). Appointments are managed from the same records used in Jobs. Conflicts highlight overlapping visits assigned to the same electrician.</p>
 </div><style>{`
.ee-dispatch{max-width:1450px}.ee-dispatch-create{margin:0 0 16px;background:white;border:1px solid #dce5ee;border-radius:12px;padding:14px 18px}.ee-dispatch-create summary{cursor:pointer;color:#0875c9;font-weight:800}.ee-dispatch-create form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:16px}.ee-dispatch-create label{display:grid;gap:5px;font-size:13px;font-weight:700}.ee-dispatch-create input,.ee-dispatch-create select,.ee-dispatch-create textarea{width:100%;min-width:0;box-sizing:border-box;border:1px solid #cbd8e6;border-radius:9px;padding:10px;font:inherit;font-size:16px;background:white;color:#17364b}.ee-dispatch-create button{border:0;border-radius:9px;background:#1688e9;color:white;padding:12px;font-weight:800;cursor:pointer}.ee-dispatch-create small{align-self:center;color:#647d91}.ee-dispatch-zero{color:#647d91;font-size:13px;margin:0 0 12px}.ee-dispatch-view-switch{display:flex;gap:5px;margin:0 0 16px;padding:4px;width:max-content;background:#e7eef6;border-radius:11px}.ee-dispatch-view-switch button{border:0;background:transparent;cursor:pointer;padding:9px 14px;color:#45677e;font-weight:750;text-decoration:none;border-radius:8px;font-size:13px}.ee-dispatch-view-switch button.is-active{background:white;color:#0875c9;box-shadow:0 1px 3px #1233}.ee-dispatch-team-board{display:grid;gap:12px}.ee-dispatch-team-row{border:1px solid #dce5ee;border-radius:13px;background:white;overflow:hidden}.ee-dispatch-team-row>header{display:flex;justify-content:space-between;padding:13px 16px;background:#f4f8fc}.ee-dispatch-team-row>header span{color:#647d91;font-size:13px}.ee-dispatch-team-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}.ee-dispatch-team-day{min-width:0;border-right:1px solid #e2eaf2;min-height:65px}.ee-dispatch-team-day>small{display:block;padding:8px 10px;color:#647d91}.ee-dispatch-team-day .ee-dispatch-visit{padding:10px}.ee-dispatch-heading{display:flex;justify-content:space-between;align-items:center;gap:16px;margin:12px 0 22px}.ee-dispatch-heading h1{font-size:clamp(28px,4vw,38px);margin:5px 0}.ee-dispatch-heading p,.ee-dispatch-footnote{color:var(--hq-muted,#72869b);margin:0}.ee-dispatch-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.ee-dispatch-toolbar>a{color:#0875c9;text-decoration:none;font-weight:700}.ee-dispatch-week{display:flex;align-items:center;gap:13px}.ee-dispatch-week>a{display:grid;place-items:center;width:34px;height:34px;border:1px solid #d6e1ec;border-radius:9px;text-decoration:none;color:#0875c9;font-size:25px;background:white}.ee-dispatch-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:16px}.ee-dispatch-metrics>div{display:grid;gap:5px;padding:14px 18px;border:1px solid #dce5ee;border-radius:13px;background:white}.ee-dispatch-metrics small{color:#647d91}.ee-dispatch-metrics strong{font-size:25px}.ee-dispatch-board{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:9px;align-items:start}.ee-dispatch-day{background:white;border:1px solid #dce5ee;border-radius:13px;min-height:190px;min-width:0;overflow:hidden}.ee-dispatch-day.is-today{border-color:#1688e9}.ee-dispatch-day-head{padding:13px 10px;background:#f5f8fc;display:grid;gap:3px}.ee-dispatch-day.is-today .ee-dispatch-day-head{background:#e9f4ff}.ee-dispatch-day-head strong{font-size:13px}.ee-dispatch-day-head span{font-size:11px;color:#718397}.ee-dispatch-empty{color:#8798a7;font-size:12px;padding:12px 10px}.ee-dispatch-visit{border-top:1px solid #e0e9f1;padding:12px 10px;display:grid;gap:6px;overflow-wrap:anywhere}.ee-dispatch-visit.has-conflict{background:#fff7eb;border-left:3px solid #dc8a22}.ee-dispatch-time{font-size:12px;font-weight:800;color:#116eae}.ee-dispatch-job{color:#17364b;text-decoration:none;font-weight:750;font-size:13px}.ee-dispatch-job span{display:block;color:#73889b;font-size:11px;font-weight:500;margin-top:3px}.ee-dispatch-meta,.ee-dispatch-note{font-size:11px;color:#64798a;margin:0}.ee-dispatch-meta-label{font-weight:700;color:#45677e}.ee-dispatch-conflict{font-size:11px;color:#a65d11;display:grid;gap:4px;line-height:1.35}.ee-dispatch-edit{font-size:12px;border-top:1px solid #e2eaf2;padding-top:8px}.ee-dispatch-edit summary{color:#0875c9;font-weight:700;cursor:pointer}.ee-dispatch-edit form{display:grid;gap:8px;margin-top:10px}.ee-dispatch-edit label{display:grid;gap:3px;font-weight:650}.ee-dispatch-edit input{width:100%;min-width:0;box-sizing:border-box;border:1px solid #cbd8e6;border-radius:8px;padding:7px 4px;font-size:12px;background:white;color:#17364b}.ee-dispatch-edit button{border:0;background:#1688e9;color:white;border-radius:8px;padding:9px;font-weight:700;cursor:pointer}.ee-dispatch-staff-options{display:grid;gap:7px}.ee-dispatch-staff-options label{display:flex;align-items:center;gap:8px}.ee-dispatch-staff-options input{width:auto;accent-color:#1688e9}.ee-dispatch-edit .ee-dispatch-cancel{background:#fff;color:#9b3e36;border:1px solid #efc9c5}.ee-dispatch-footnote{font-size:12px;margin:18px 0 30px;line-height:1.5}@media(max-width:1190px){.ee-dispatch-board{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:760px){.ee-dispatch-create form{grid-template-columns:1fr}.ee-dispatch-day.is-empty .ee-dispatch-empty{display:none}.ee-dispatch-team-days{grid-template-columns:1fr}.ee-dispatch-team-day{min-height:0;border-right:0;border-bottom:1px solid #edf1f6}.ee-dispatch-team-day:not(:has(.ee-dispatch-visit)){display:none}.ee-dispatch-team-row:has(.ee-dispatch-team-day .ee-dispatch-visit) .ee-dispatch-team-day>small{background:#f7fafd}.ee-dispatch-toolbar{flex-wrap:wrap}.ee-dispatch-week{flex:1;justify-content:space-between}.ee-dispatch-view-switch{width:100%;box-sizing:border-box}.ee-dispatch-view-switch button{flex:1;text-align:center}.ee-dispatch-heading{align-items:flex-start}.ee-dispatch-heading .hq-detail-action-primary{white-space:nowrap;font-size:12px;padding:10px}.ee-dispatch-board{grid-template-columns:minmax(0,1fr);gap:10px}.ee-dispatch-day{min-height:0}.ee-dispatch-day-head{display:flex;justify-content:space-between;padding:12px 15px}.ee-dispatch-day-head strong{font-size:15px}.ee-dispatch-empty{margin:0;padding:10px 15px}.ee-dispatch-visit{padding:14px 15px}.ee-dispatch-job{font-size:16px}.ee-dispatch-time{font-size:14px}.ee-dispatch-meta,.ee-dispatch-note{font-size:13px}.ee-dispatch-edit input{font-size:16px;padding:10px}.ee-dispatch-metrics>div{padding:10px}.ee-dispatch-metrics small{font-size:11px}.ee-dispatch-metrics strong{font-size:21px}.ee-dispatch-week{gap:7px}.ee-dispatch-week strong{font-size:13px}.ee-dispatch-toolbar>a{font-size:13px}}
`}</style></main>;
}
