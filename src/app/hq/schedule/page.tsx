import {calendarEvents} from '@/lib/google-calendar';
import AppointmentRange from '../appointment-range';
import JobPicker from './job-picker';
import ElectricianDay from './electrician-day';
import NeilGoogleEvents from './neil-google-events';
import Link from 'next/link';
import {dbAdmin,requireHqUser} from '@/lib/hq-auth';
import ScheduleCreateForm from './schedule-create-form';
import DispatchViews from './view-switch';
import DispatchTimeline from './dispatch-timeline';
import VisitPreview from './visit-preview';
import ScheduleVisitModal from './schedule-visit-modal';
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
export default async function SchedulePage({searchParams}:{searchParams:Promise<{week?:string;view?:string;focus?:string}>}){
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
 const view=params.view==='team'?'team':params.view==='week'?'week':'timeline';
 const viewQuery=(v:string,w=dayKey(monday))=>'/hq/schedule?week='+w+'&view='+v;
 const db=dbAdmin();
 const [{data:visits,error},{data:jobs},{data:assignments},{data:staff},{data:customers},{data:visitStaff}]=await Promise.all([
  db.from('job_appointments').select('id,job_id,starts_at,ends_at,notes,status').eq('status','scheduled').gte('starts_at',monday.toISOString()).lt('starts_at',next.toISOString()).order('starts_at',{ascending:true}).limit(500),
  db.from('jobs').select('id,job_number,title,customer_id,site_address_text,status').limit(1000),
  db.from('job_assignments').select('job_id,staff_id').limit(3000),
  db.from('scheduling_staff').select('id,full_name,initials,avatar_color').eq('active',true).limit(300),
  db.from('customers').select('id,name').limit(1000),
  db.from('job_appointment_staff').select('appointment_id,staff_id').limit(5000)
 ]);
 const all=(visits??[]) as Visit[];
 const jobMap=new Map(((jobs??[]) as Job[]).map(j=>[j.id,j]));
 const staffMap=new Map((staff??[]).map(s=>[s.id,s.full_name]));
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
   (a.job_id===b.job_id||(visitAssigned.get(a.id)??[]).some(id=>(visitAssigned.get(b.id)??[]).includes(id))) ){clashes.add(a.id);clashes.add(b.id);
   const describe=(v:Visit,other:Visit)=>{const common=(visitAssigned.get(v.id)??[]).filter(id=>(visitAssigned.get(other.id)??[]).includes(id)).map(id=>staffMap.get(id)??'Electrician');return `${v.job_id===other.job_id?'Duplicate/overlapping visit for same job: ':''}${jobMap.get(v.job_id)?.title??'Job'} (${dayLabel(new Date(v.starts_at))}, ${timeLabel(v.starts_at)}–${timeLabel(v.ends_at)}) · ${common.length?common.join(', ')+(common.length===1?' is':' are')+' assigned to both':'same job is booked more than once'}`;};
   conflictDetails.set(a.id,[...(conflictDetails.get(a.id)??[]),describe(b,a)]);
   conflictDetails.set(b.id,[...(conflictDetails.get(b.id)??[]),describe(a,b)]);
  }
 }
 const timelineVisits=all.map(v=>{const job=jobMap.get(v.job_id);const start=new Date(v.starts_at).toLocaleTimeString('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).split(':').map(Number);const end=new Date(v.ends_at).toLocaleTimeString('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).split(':').map(Number);return {id:v.id,startIso:v.starts_at,endIso:v.ends_at,day:dayKey(v.starts_at),startMinutes:start[0]*60+start[1],endMinutes:dayKey(v.starts_at)===dayKey(v.ends_at)?end[0]*60+end[1]:1440,title:job?.title??'Job',jobNumber:'JB'+String(job?.job_number??0).padStart(5,'0'),jobHref:'/hq/jobs/'+v.job_id,time:timeLabel(v.starts_at)+' – '+timeLabel(v.ends_at),customer:job?.customer_id?customerMap.get(job.customer_id)??'Customer':'No customer',electricians:(visitAssigned.get(v.id)??[]).map(id=>staffMap.get(id)??'Team member'),staffIds:visitAssigned.get(v.id)??[],address:job?.site_address_text,notes:v.notes,conflict:clashes.has(v.id)?'Overlaps with '+(conflictDetails.get(v.id)??[]).join('; '):null};});
 const focus=params.focus==='conflicts'||params.focus==='unassigned'?params.focus:'all';
 const displayedVisits=all.filter(v=>focus==='all'||(focus==='conflicts'?clashes.has(v.id):(visitAssigned.get(v.id)??[]).length===0));
 const displayedIds=new Set(displayedVisits.map(v=>v.id));
 const displayedTimelineVisits=timelineVisits.filter(v=>displayedIds.has(v.id));
 const metricHref=(target:string)=>viewQuery(view)+(target==='all'||target===focus?'':'&focus='+target);
 const {data:googleConnection}=await db.from('google_calendar_connections').select('google_email').eq('id',1).maybeSingle();
 let externalEvents:Awaited<ReturnType<typeof calendarEvents>>=[];
 let googleError=false;
 if(googleConnection){try{externalEvents=await calendarEvents(monday.toISOString(),next.toISOString());}catch{googleError=true;}}
 const metrics=<div className="ee-dispatch-metrics ee-dispatch-metrics-compact ee-dispatch-metrics-actionable ee-dispatch-metrics-inline" aria-label="Schedule filters"><Link className={focus==='all'?'is-selected':''} aria-current={focus==='all'?'true':undefined} href={metricHref('all')}><small>Scheduled</small><strong>{all.length}</strong></Link><Link className={focus==='conflicts'?'is-selected':''} aria-current={focus==='conflicts'?'true':undefined} href={metricHref('conflicts')}><small>Conflicts</small><strong>{clashes.size}</strong></Link><Link className={focus==='unassigned'?'is-selected':''} aria-current={focus==='unassigned'?'true':undefined} href={metricHref('unassigned')}><small>Unassigned</small><strong>{all.filter(v=>(visitAssigned.get(v.id)??[]).length===0).length}</strong></Link></div>;
 const date=<div className="ee-schedule-date-nav"><Link aria-label="Previous week" href={viewQuery(view,dayKey(prev))}>‹</Link><strong>{dayLabel(monday)} – {dayLabel(addDays(monday,6))}</strong><Link aria-label="Next week" href={viewQuery(view,dayKey(next))}>›</Link><Link className="ee-schedule-today" href={viewQuery(view,today)}>This week</Link></div>;
 const renderVisit=(v:Visit)=>{
  const job=jobMap.get(v.job_id);const names=(visitAssigned.get(v.id)??[]).map(id=>staffMap.get(id)??'Team member');
  return <article key={v.id} className={'ee-dispatch-visit'+(clashes.has(v.id)?' has-conflict':'')}>
   <VisitPreview appointmentId={v.id} startIso={v.starts_at} endIso={v.ends_at} canEdit={canEdit} staff={[...staffMap].map(([id,name])=>({id,name}))} title={job?.title??'Job'} jobNumber={'JB'+String(job?.job_number??0).padStart(5,'0')} jobHref={'/hq/jobs/'+v.job_id} time={timeLabel(v.starts_at)+' – '+(dayKey(v.starts_at)===dayKey(v.ends_at)?timeLabel(v.ends_at):dayLabel(new Date(v.ends_at))+', '+timeLabel(v.ends_at))} customer={job?.customer_id?customerMap.get(job.customer_id)??'Customer':'No customer'} electricians={names} staffIds={visitAssigned.get(v.id)??[]} address={job?.site_address_text} notes={v.notes} conflict={clashes.has(v.id)?'Overlaps with '+(conflictDetails.get(v.id)??[]).join('; '):null}/>

  </article>;
 };
 return <main className="hq-detail"><div className="hq-detail-inner ee-dispatch">
 <div className="ee-schedule-header-group"><div className="ee-schedule-topline"><h1 className="ee-sr-only">Schedule</h1><div className="ee-schedule-date-nav"><Link aria-label="Previous week" href={viewQuery(view,dayKey(prev))}>‹</Link><strong>{dayLabel(monday)} – {dayLabel(addDays(monday,6))}</strong><Link aria-label="Next week" href={viewQuery(view,dayKey(next))}>›</Link><Link className="ee-schedule-today" href={viewQuery(view,today)}>This week</Link></div></div>
 <div className="ee-dispatch-metrics ee-dispatch-metrics-compact ee-dispatch-metrics-actionable ee-dispatch-metrics-inline" aria-label="Schedule filters"><Link className={focus==='all'?'is-selected':''} aria-current={focus==='all'?'true':undefined} href={metricHref('all')}><small>Scheduled</small><strong>{all.length}</strong></Link><Link className={focus==='conflicts'?'is-selected':''} aria-current={focus==='conflicts'?'true':undefined} href={metricHref('conflicts')}><small>Conflicts</small><strong>{clashes.size}</strong></Link><Link className={focus==='unassigned'?'is-selected':''} aria-current={focus==='unassigned'?'true':undefined} href={metricHref('unassigned')}><small>Unassigned</small><strong>{all.filter(v=>(visitAssigned.get(v.id)??[]).length===0).length}</strong></Link></div></div>
 {error&&<p role="alert">Unable to load appointments. Please try again.</p>}

 {displayedVisits.length===0&&<p className="ee-dispatch-zero">{all.length===0?'No visits scheduled for this week. Select Schedule visit to add one.':'No appointments match this filter for the selected week.'}</p>}
 <DispatchViews weekNavigation={date} metrics={metrics} google={{connected:!!googleConnection,email:googleConnection?.google_email??null,events:externalEvents,error:googleError,canManage:['owner','admin'].includes(user.role)}} createAction={canEdit?<ScheduleVisitModal><div className="ee-dispatch-create"><ScheduleCreateForm><JobPicker jobs={((jobs??[]) as Job[]).filter(j=>!['cancelled','completed','archived'].includes(j.status)).sort((a,b)=>b.job_number-a.job_number).map(j=>({id:j.id,label:'JB'+String(j.job_number).padStart(5,'0')+' — '+j.title+(j.customer_id?' · '+(customerMap.get(j.customer_id)??''):'')+(j.site_address_text?' · '+j.site_address_text:'')}))}/><AppointmentRange/><fieldset className="ee-create-staff"><legend>Electricians for this visit</legend><p>Choose the crew for this appointment. Leave all unchecked to schedule as unassigned.</p><input type="hidden" name="explicit_visit_staff" value="yes"/><div className="ee-create-staff-list">{[...staffMap.entries()].map(([id,name])=><label key={id}><input type="checkbox" name="staff_id" value={id}/>{name}</label>)}{staffMap.size===0&&<span>No active electricians available.</span>}</div></fieldset><label className="ee-create-notes">Instructions (optional)<textarea name="notes" maxLength={2000} rows={2} placeholder="Access details or notes for the crew"/></label>{['owner','admin'].includes(user.role)&&<label className="ee-neil-override"><input type="checkbox" name="override_neil_calendar" value="yes"/> Override Neil’s Google Calendar conflict if one is detected (owner/admin only)</label>}<div className="ee-create-actions"><small>Perth time (AWST) · Choose electricians for this visit</small><button type="submit">Schedule visit</button></div></ScheduleCreateForm></div></ScheduleVisitModal>:null} initialView={view} week={dayKey(monday)} timelineBoard={<DispatchTimeline googleSettings={{connected:!!googleConnection,email:googleConnection?.google_email??null,error:googleError,canManage:['owner','admin'].includes(user.role)}} canEdit={canEdit} canOverrideNeil={['owner','admin'].includes(user.role)} today={today} nowMinutes={Number(new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now).split(':')[0])*60+Number(new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now).split(':')[1])} days={days.map(d=>({key:dayKey(d),label:dayLabel(d)}))} staff={[...staffMap].map(([id,name])=>({id,name}))} visits={displayedTimelineVisits}/>} dayBoard={<section className="ee-dispatch-board" aria-label="Weekly appointments">{days.map(d=>{const key=dayKey(d),entries=displayedVisits.filter(v=>dayKey(v.starts_at)===key);return <div key={key} className={'ee-dispatch-day'+(key===today?' is-today':'')+(entries.length?'':' is-empty')}><div className="ee-dispatch-day-head"><strong>{dayLabel(d)}</strong><span>{entries.length} {entries.length===1?'visit':'visits'}</span></div>{entries.length?entries.map(renderVisit):<p className="ee-dispatch-empty">No visits</p>}<NeilGoogleEvents day={key}/></div>})}</section>} teamBoard={<ElectricianDay canEdit={canEdit} visits={timelineVisits} days={days.map(d=>({key:dayKey(d),label:dayLabel(d)}))} staff={[...staffMap].map(([id,name])=>({id,name}))} today={today} weekBoard={<section className="ee-dispatch-team-board" aria-label="Appointments by electrician">{[...staffMap.entries(),['unassigned','Unassigned'] as [string,string]].map(([id,name])=>{const entries=displayedVisits.filter(v=>{const crew=visitAssigned.get(v.id)??[];return id==='unassigned'?crew.length===0:crew.includes(id);});return <div className="ee-dispatch-team-row" key={id}><header><strong>{name}</strong><span>{entries.length} {entries.length===1?'visit':'visits'}</span></header><div className="ee-dispatch-team-days">{days.map(d=>{const key=dayKey(d);const dayVisits=entries.filter(v=>dayKey(v.starts_at)===key);return <div className="ee-dispatch-team-day" key={key}><small>{dayLabel(d)}</small>{dayVisits.map(renderVisit)}{name.toLowerCase().includes('neil')&&<NeilGoogleEvents day={key} compact/>}</div>})}</div></div>})}</section>}/>} />
 
 </div><style>{`
/* Spread primary schedule controls across the available desktop width */
@media(min-width:1051px){
.ee-dispatch .ee-dispatch-view-switch{width:100%!important;max-width:none!important;box-sizing:border-box;display:flex;align-items:center;gap:8px!important;padding:5px 9px!important}
.ee-dispatch .ee-dispatch-view-switch>button{flex:0 0 auto!important;padding-left:14px!important;padding-right:14px!important}
.ee-dispatch .ee-dispatch-top-week{flex:1 1 auto!important;margin-left:12px!important;justify-content:center!important}
.ee-dispatch .ee-dispatch-top-week .ee-schedule-date-nav{justify-content:center;gap:9px}
.ee-dispatch .ee-dispatch-view-switch .ee-create-open{flex:0 0 auto!important;margin-left:auto!important}
.ee-dispatch .ee-dispatch-view-switch .ee-google-control{margin-left:0!important}
}
/* Schedule navigation: compact primary row, secondary filters */
.ee-dispatch-top-week{display:flex;align-items:center;margin-left:auto;min-width:0}.ee-dispatch-top-week .ee-schedule-date-nav{gap:5px;white-space:nowrap}.ee-dispatch-top-week .ee-schedule-date-nav>a:not(.ee-schedule-today){width:28px;height:30px;font-size:19px}.ee-dispatch-top-week .ee-schedule-date-nav strong{font-size:12px}.ee-dispatch-top-week .ee-schedule-today{font-size:12px;margin-left:3px}.ee-dispatch-view-switch{display:flex;align-items:center;gap:5px;flex-wrap:wrap}.ee-dispatch .ee-timeline-extra-controls{margin-left:auto}.ee-dispatch .ee-timeline-toolbar .ee-timeline-staff-filter>span{display:none!important}.ee-dispatch .ee-timeline-toolbar .ee-timeline-staff-filter select{min-width:136px}.ee-dispatch .ee-timeline-toolbar .ee-dispatch-metrics-inline{gap:5px!important}.ee-dispatch .ee-timeline-toolbar .ee-dispatch-metrics-inline>a{padding:3px 8px!important;min-height:35px!important}.ee-dispatch .ee-timeline-toolbar .ee-dispatch-metrics-inline>a small{font-size:10px!important}.ee-dispatch .ee-timeline-toolbar .ee-dispatch-metrics-inline>a strong{font-size:15px!important}.ee-dispatch .ee-timeline-toolbar{align-items:center!important}.ee-dispatch .ee-timeline-toolbar .ee-timeline-density{margin-left:0!important}@media(max-width:1050px){.ee-dispatch-top-week{order:5;width:100%;justify-content:flex-start;margin-left:0}.ee-dispatch .ee-timeline-extra-controls{margin-left:0}}@media(max-width:760px){.ee-dispatch-top-week .ee-schedule-date-nav{width:auto;flex-wrap:wrap}.ee-dispatch .ee-timeline-toolbar .ee-timeline-staff-filter{flex:1 1 130px!important}}

.ee-schedule-topline{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}.ee-schedule-topline h1{font-size:clamp(24px,3vw,30px);line-height:1.2;margin:0}.ee-schedule-date-nav{display:flex;align-items:center;gap:10px}.ee-schedule-date-nav>a:not(.ee-schedule-today){display:grid;place-items:center;width:34px;height:34px;border:1px solid #d4e1ed;border-radius:9px;background:white;text-decoration:none;color:#0875c9;font-size:23px}.ee-schedule-date-nav strong{font-size:14px;white-space:nowrap}.ee-schedule-today{color:#0875c9;font-weight:700;text-decoration:none;margin-left:5px}@media(max-width:760px){.ee-schedule-topline{align-items:flex-start;gap:8px;margin-bottom:10px}.ee-schedule-topline h1{font-size:27px}.ee-schedule-date-nav{width:100%;justify-content:space-between;gap:5px}.ee-schedule-date-nav strong{font-size:12px}.ee-schedule-today{font-size:12px;margin-left:0}}
.ee-metric-short{display:none}.ee-dispatch-heading{margin:0 0 12px;align-items:center}.ee-dispatch-heading h1{margin:0;font-size:clamp(24px,3vw,30px);line-height:1.15}@media(max-width:760px){.ee-dispatch-heading{margin:0 0 12px}.ee-dispatch-jobs-link{display:none!important}.ee-metric-long{display:none}.ee-metric-short{display:inline}.ee-dispatch-metrics-actionable>a span:not(.ee-metric-short):not(.ee-metric-long){display:none}.ee-dispatch-metrics-actionable>a{padding:11px 9px;gap:4px}.ee-dispatch-metrics-actionable>a small{font-size:11px;line-height:1.25}.ee-dispatch-metrics-actionable>a strong{font-size:23px}.ee-dispatch-metrics{gap:8px;margin-bottom:12px}}
.ee-create-open{margin-left:auto;background:#1688e9;border:0;color:white;border-radius:9px;padding:10px 16px;font-weight:800;cursor:pointer;white-space:nowrap}.ee-create-dialog{position:fixed;inset:0;margin:auto;width:min(820px,calc(100vw - 28px));max-height:min(88dvh,900px);box-sizing:border-box;border:1px solid #dce5ee;border-radius:16px;background:white;color:#17364b;padding:0;box-shadow:0 25px 75px #102b4860;overflow:hidden}.ee-create-dialog::backdrop{background:#15344c88}.ee-create-dialog-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:18px 22px;border-bottom:1px solid #dce5ee}.ee-create-dialog-head strong{font-size:20px}.ee-create-dialog-head p{font-size:12px;color:#647d91;margin:4px 0 0}.ee-create-dialog-head button{display:grid;place-items:center;border:0;border-radius:10px;background:#edf4fa;color:#31536c;font-size:30px;line-height:1;font-weight:700;cursor:pointer;width:44px;height:44px;flex:none}.ee-create-dialog-body{padding:18px 22px;max-height:calc(88dvh - 85px);overflow-y:auto;overscroll-behavior:contain}.ee-create-dialog .ee-dispatch-create{margin:0;padding:0;border:0}.ee-create-dialog .ee-dispatch-create .ee-time-picker-toggle{background:#1688e9;color:#fff;border:1px solid #1688e9;border-radius:8px;padding:9px 13px;font-weight:800}.ee-create-dialog .ee-dispatch-create .ee-time-picker-toggle:hover{background:#0875c9}.ee-create-dialog .ee-create-actions button[type=submit]{background:#1688e9;color:#fff;border:0;border-radius:9px;padding:12px 18px;font-weight:800}.ee-create-dialog .ee-create-actions button[type=submit]:hover{background:#0875c9}.ee-dispatch-view-switch{width:100%;align-items:center}.ee-dispatch-view-switch .ee-create-open{flex:0 0 auto;background:#1688e9;color:white;padding:10px 16px;font-weight:800}@media(max-width:760px){.ee-create-dialog{width:calc(100vw - 12px);max-height:95dvh}.ee-create-dialog-body{padding:14px;max-height:calc(95dvh - 80px)}.ee-dispatch-view-switch{flex-wrap:wrap}.ee-dispatch-view-switch .ee-create-open{width:100%;margin-left:0;background:#1688e9;color:white}}

.ee-dispatch{max-width:1450px}.ee-dispatch-metrics-actionable>a{display:flex;flex-direction:column;gap:4px;padding:14px 18px;border:1px solid #dce5ee;border-radius:13px;background:white;text-decoration:none;color:inherit;cursor:pointer;min-width:0}.ee-dispatch-metrics-actionable>a span{font-size:11px;color:#6b8498}.ee-dispatch-metrics-actionable>a.is-selected{outline:2px solid #1688e9;outline-offset:-2px;background:#f1f8ff}.ee-dispatch-metrics-actionable>a:hover{background:#f1f8ff}.ee-dispatch-create .ee-create-form{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;margin-top:14px}.ee-create-dates{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.ee-create-dates .ee-appointment-datetime{padding:12px;border:1px solid #dce5ee;border-radius:10px;background:#f8fbfe}.ee-create-dates .ee-appointment-datetime legend{margin-bottom:0;padding:0 4px}.ee-create-dates .ee-appointment-datetime>small{display:none}.ee-create-dates .ee-appointment-fields input{min-height:40px;padding:7px 9px}.ee-create-dates .ee-appointment-shortcuts button{min-height:30px}.ee-create-staff{min-width:0;border:1px solid #dce5ee;border-radius:10px;padding:12px}.ee-create-staff legend{font-size:13px;font-weight:800;padding:0 5px}.ee-create-staff p{font-size:12px;color:#61788c;margin:0 0 10px}.ee-create-staff-list{display:flex;flex-wrap:wrap;gap:10px 20px}.ee-dispatch-create .ee-create-staff-list label{display:flex;align-items:center;gap:7px;font-size:13px}.ee-dispatch-create .ee-create-staff-list input{width:auto;min-width:0}.ee-create-notes textarea{min-height:58px}.ee-create-actions{display:flex;justify-content:space-between;align-items:center;gap:16px}.ee-dispatch-create .ee-create-actions button{width:auto;min-width:170px}.ee-dispatch-create .ee-create-actions small{font-size:12px}@media(max-width:850px){.ee-create-dates{grid-template-columns:1fr}.ee-create-actions{flex-wrap:wrap}.ee-dispatch-create .ee-create-actions button{width:100%}}.ee-dispatch-create summary{display:flex;align-items:center;justify-content:space-between;list-style:none}.ee-dispatch-create summary::-webkit-details-marker{display:none}.ee-create-chevron{font-size:22px;transition:transform .18s}.ee-dispatch-create[open] .ee-create-chevron{transform:rotate(180deg)}.ee-dispatch-crew{display:flex;align-items:center;gap:4px;flex-wrap:wrap}.ee-dispatch-avatar{display:inline-grid;place-items:center;width:25px;height:25px;flex:none;border-radius:50%;background:#e4f0fc;color:#185d90;font-weight:800;font-size:10px;border:1px solid white}.ee-dispatch-crew-count,.ee-dispatch-unassigned{font-size:11px;color:#61788c;margin-left:4px}.ee-dispatch-preview{display:none;position:absolute;z-index:12;top:calc(100% - 3px);left:5px;width:min(300px,80vw);padding:14px;background:#fff;border:1px solid #cbd8e6;border-radius:12px;box-shadow:0 12px 30px #193b5b24;gap:6px;font-size:12px;color:#496479;overflow-wrap:anywhere}.ee-dispatch-preview strong{color:#17364b}.ee-dispatch-visit{position:relative;overflow:visible}.ee-dispatch-visit:hover .ee-dispatch-preview,.ee-dispatch-visit:focus-within .ee-dispatch-preview,.ee-dispatch-visit:focus .ee-dispatch-preview{display:grid}.ee-dispatch-visit:focus{outline:2px solid #1688e9;outline-offset:-2px}@media(hover:none){.ee-dispatch-visit:hover .ee-dispatch-preview{display:none}.ee-dispatch-visit:focus .ee-dispatch-preview,.ee-dispatch-visit:focus-within .ee-dispatch-preview{display:grid}}.ee-dispatch-create{margin:0 0 16px;background:white;border:1px solid #dce5ee;border-radius:12px;padding:14px 18px}.ee-dispatch-create summary{cursor:pointer;color:#0875c9;font-weight:800}.ee-dispatch-create form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:16px}.ee-dispatch-create label{display:grid;gap:5px;font-size:13px;font-weight:700}.ee-dispatch-create input,.ee-dispatch-create select,.ee-dispatch-create textarea{width:100%;min-width:0;box-sizing:border-box;border:1px solid #cbd8e6;border-radius:9px;padding:10px;font:inherit;font-size:16px;background:white;color:#17364b}.ee-dispatch-create button{border:0;border-radius:9px;background:#1688e9;color:white;padding:12px;font-weight:800;cursor:pointer}.ee-dispatch-create small{align-self:center;color:#647d91}.ee-dispatch-zero{color:#647d91;font-size:13px;margin:0 0 12px}.ee-dispatch-view-switch{display:flex;gap:5px;margin:0 0 16px;padding:4px;width:max-content;background:#e7eef6;border-radius:11px}.ee-dispatch-view-switch>button{border:0;background:transparent;cursor:pointer;padding:9px 14px;color:#45677e;font-weight:750;text-decoration:none;border-radius:8px;font-size:13px}.ee-dispatch-view-switch>button.is-active{background:white;color:#0875c9;box-shadow:0 1px 3px #1233}.ee-dispatch-team-board{display:grid;gap:12px}.ee-dispatch-team-row{border:1px solid #dce5ee;border-radius:13px;background:white;overflow:visible}.ee-dispatch-team-row>header{display:flex;justify-content:space-between;padding:13px 16px;background:#f4f8fc}.ee-dispatch-team-row>header span{color:#647d91;font-size:13px}.ee-dispatch-team-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}.ee-dispatch-team-day{min-width:0;border-right:1px solid #e2eaf2;min-height:65px}.ee-dispatch-team-day>small{display:block;padding:8px 10px;color:#647d91}.ee-dispatch-team-day .ee-dispatch-visit{padding:10px}.ee-dispatch-heading{display:flex;justify-content:space-between;align-items:center;gap:16px;margin:12px 0 22px}.ee-dispatch-heading h1{font-size:clamp(28px,4vw,38px);margin:5px 0}.ee-dispatch-heading p,.ee-dispatch-footnote{color:var(--hq-muted,#72869b);margin:0}.ee-dispatch-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.ee-dispatch-toolbar>a{color:#0875c9;text-decoration:none;font-weight:700}.ee-dispatch-week{display:flex;align-items:center;gap:13px}.ee-dispatch-week>a{display:grid;place-items:center;width:34px;height:34px;border:1px solid #d6e1ec;border-radius:9px;text-decoration:none;color:#0875c9;font-size:25px;background:white}.ee-dispatch-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:16px}.ee-dispatch-metrics>div{display:grid;gap:5px;padding:14px 18px;border:1px solid #dce5ee;border-radius:13px;background:white}.ee-dispatch-metrics small{color:#647d91}.ee-dispatch-metrics strong{font-size:25px}.ee-dispatch-board{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:9px;align-items:start}.ee-dispatch-day{background:white;border:1px solid #dce5ee;border-radius:13px;min-height:190px;min-width:0;overflow:visible}.ee-dispatch-day.is-today{border-color:#1688e9}.ee-dispatch-day-head{padding:13px 10px;background:#f5f8fc;display:grid;gap:3px}.ee-dispatch-day.is-today .ee-dispatch-day-head{background:#e9f4ff}.ee-dispatch-day-head strong{font-size:13px}.ee-dispatch-day-head span{font-size:11px;color:#718397}.ee-dispatch-empty{color:#8798a7;font-size:12px;padding:12px 10px}.ee-dispatch-visit{border-top:1px solid #e0e9f1;padding:12px 10px;display:grid;gap:6px;overflow-wrap:anywhere}.ee-dispatch-visit.has-conflict{background:#fff7eb;border-left:3px solid #dc8a22}.ee-dispatch-time{font-size:12px;font-weight:800;color:#116eae}.ee-dispatch-job{color:#17364b;text-decoration:none;font-weight:750;font-size:13px}.ee-dispatch-job span{display:block;color:#73889b;font-size:11px;font-weight:500;margin-top:3px}.ee-dispatch-meta,.ee-dispatch-note{font-size:11px;color:#64798a;margin:0}.ee-dispatch-meta-label{font-weight:700;color:#45677e}.ee-dispatch-conflict{font-size:11px;color:#a65d11;display:grid;gap:4px;line-height:1.35}.ee-dispatch-edit{font-size:12px;border-top:1px solid #e2eaf2;padding-top:8px}.ee-dispatch-edit summary{color:#0875c9;font-weight:700;cursor:pointer}.ee-dispatch-edit form{display:grid;gap:8px;margin-top:10px}.ee-dispatch-edit label{display:grid;gap:3px;font-weight:650}.ee-dispatch-edit input{width:100%;min-width:0;box-sizing:border-box;border:1px solid #cbd8e6;border-radius:8px;padding:7px 4px;font-size:12px;background:white;color:#17364b}.ee-dispatch-edit button{border:0;background:#1688e9;color:white;border-radius:8px;padding:9px;font-weight:700;cursor:pointer}.ee-dispatch-staff-options{display:grid;gap:7px}.ee-dispatch-staff-options label{display:flex;align-items:center;gap:8px}.ee-dispatch-staff-options input{width:auto;accent-color:#1688e9}.ee-dispatch-edit .ee-dispatch-cancel{background:#fff;color:#9b3e36;border:1px solid #efc9c5}.ee-dispatch-footnote{font-size:12px;margin:18px 0 30px;line-height:1.5}@media(max-width:1190px){.ee-dispatch-board{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:760px){.ee-dispatch-create form{grid-template-columns:1fr}.ee-dispatch-day.is-empty .ee-dispatch-empty{display:none}.ee-dispatch-team-days{grid-template-columns:1fr}.ee-dispatch-team-day{min-height:0;border-right:0;border-bottom:1px solid #edf1f6}.ee-dispatch-team-day:not(:has(.ee-dispatch-visit)){display:none}.ee-dispatch-team-row:has(.ee-dispatch-team-day .ee-dispatch-visit) .ee-dispatch-team-day>small{background:#f7fafd}.ee-dispatch-toolbar{flex-wrap:wrap}.ee-dispatch-week{flex:1;justify-content:space-between}.ee-dispatch-view-switch{width:100%;box-sizing:border-box}.ee-dispatch-view-switch>button{flex:1;text-align:center}.ee-dispatch-heading{align-items:flex-start}.ee-dispatch-heading .hq-detail-action-primary{white-space:nowrap;font-size:12px;padding:10px}.ee-dispatch-board{grid-template-columns:minmax(0,1fr);gap:10px}.ee-dispatch-day{min-height:0}.ee-dispatch-day-head{display:flex;justify-content:space-between;padding:12px 15px}.ee-dispatch-day-head strong{font-size:15px}.ee-dispatch-empty{margin:0;padding:10px 15px}.ee-dispatch-visit{padding:14px 15px}.ee-dispatch-job{font-size:16px}.ee-dispatch-time{font-size:14px}.ee-dispatch-meta,.ee-dispatch-note{font-size:13px}.ee-dispatch-edit input{font-size:16px;padding:10px}.ee-dispatch-metrics>div{padding:10px}.ee-dispatch-metrics small{font-size:11px}.ee-dispatch-metrics strong{font-size:21px}.ee-dispatch-week{gap:7px}.ee-dispatch-week strong{font-size:13px}.ee-dispatch-toolbar>a{font-size:13px}}

/* Compact dispatch header: prioritize the calendar without removing controls */
.ee-dispatch:has(.ee-dispatch-view-switch>button:nth-child(3)[aria-pressed="true"]) .ee-schedule-header-group .ee-dispatch-metrics-inline,.ee-dispatch:has(.ee-dispatch-view-switch>button:nth-child(3)[aria-pressed="true"]) .ee-schedule-header-group .ee-schedule-date-nav{display:none!important}.ee-dispatch:has(.ee-dispatch-view-switch>button:nth-child(3)[aria-pressed="true"]) .ee-schedule-header-group{margin-bottom:5px}.ee-dispatch:has(.ee-dispatch-view-switch>button:nth-child(3)[aria-pressed="true"]) .ee-schedule-topline h1{font-size:22px}

.ee-schedule-header-group{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:0 0 7px}.ee-schedule-header-group .ee-schedule-topline{display:contents}.ee-schedule-header-group .ee-schedule-topline h1{margin:0;font-size:24px;flex:none}.ee-schedule-header-group .ee-schedule-date-nav{order:3;margin-left:auto}.ee-schedule-header-group .ee-dispatch-metrics-inline{order:2;margin:0!important;gap:5px!important}.ee-schedule-header-group .ee-dispatch-metrics-inline>a{min-height:32px!important;padding:4px 9px!important}.ee-dispatch-view-switch{margin-bottom:5px!important}.ee-dispatch-view-switch .ee-google-control{margin-left:0!important}@media(max-width:900px){.ee-schedule-header-group{gap:7px 10px}.ee-schedule-header-group .ee-schedule-date-nav{order:4;flex:1 1 100%;margin-left:0;justify-content:flex-start}}@media(max-width:760px){.ee-schedule-header-group .ee-schedule-topline h1{font-size:22px}.ee-schedule-header-group .ee-dispatch-metrics-inline{flex:1 1 auto;justify-content:flex-end}.ee-schedule-header-group .ee-dispatch-metrics-inline>a{flex:0 0 auto;padding:5px!important}.ee-schedule-header-group .ee-schedule-date-nav{justify-content:space-between}.ee-dispatch-view-switch .ee-create-open{width:auto!important;flex:1 1 auto}}

.ee-dispatch-metrics-inline{display:flex!important;flex-wrap:wrap;gap:6px!important;margin-bottom:7px!important}.ee-dispatch-metrics-inline>a{display:inline-flex!important;flex:0 0 auto;align-items:center;justify-content:center;gap:7px!important;min-height:34px!important;padding:5px 11px!important;border-radius:8px!important}.ee-dispatch-metrics-inline>a small{font-size:11px!important;white-space:nowrap}.ee-dispatch-metrics-inline>a strong{font-size:16px!important;line-height:1!important}.ee-dispatch-metrics-inline>a.is-selected{background:#eaf5ff;border-color:#1688e9}@media(max-width:760px){.ee-dispatch-metrics-inline{gap:4px!important}.ee-dispatch-metrics-inline>a{flex:1 1 0;padding:5px 6px!important;min-width:0}.ee-dispatch-metrics-inline>a small{font-size:10px!important}}

.ee-schedule-topline{margin-bottom:8px;gap:8px}
.ee-schedule-topline h1{font-size:25px}
.ee-schedule-date-nav{gap:7px}
.ee-schedule-date-nav>a:not(.ee-schedule-today){width:30px;height:30px}
.ee-schedule-date-nav strong{font-size:13px}
.ee-dispatch-metrics{gap:8px!important;margin-bottom:8px!important}
.ee-dispatch-metrics-actionable>a{padding:9px 13px;gap:2px;border-radius:10px;min-height:58px;justify-content:center}
.ee-dispatch-metrics-actionable>a small{font-size:11px}
.ee-dispatch-metrics-actionable>a strong{font-size:21px;line-height:1.1}
.ee-dispatch-metrics-actionable>a>span{display:none}
.ee-dispatch-view-switch{padding:4px 6px;gap:4px;margin-bottom:8px}
.ee-dispatch-view-switch>button{padding:8px 11px;font-size:12px;min-height:36px}
.ee-dispatch-view-switch .ee-create-open{padding:8px 12px;min-height:36px;font-size:12px}
.ee-dispatch-view-switch .ee-google-control{margin-left:auto}
@media(max-width:760px){
 .ee-schedule-topline{margin-bottom:7px;gap:5px}
 .ee-schedule-topline h1{font-size:24px}
 .ee-schedule-date-nav{gap:4px}
 .ee-dispatch-metrics{gap:5px!important;margin-bottom:7px!important}
 .ee-dispatch-metrics-actionable>a{padding:7px 6px;gap:2px;min-height:53px}
 .ee-dispatch-metrics-actionable>a strong{font-size:20px}
 .ee-dispatch-metrics-actionable>a small{font-size:10px}
 .ee-dispatch-view-switch{flex-wrap:wrap;gap:4px;padding:5px;margin-bottom:7px}
 .ee-dispatch-view-switch>button{flex:1 1 auto;padding:7px 5px;font-size:11px;min-height:36px}
 .ee-dispatch-view-switch .ee-create-open{width:auto;flex:1 1 auto;padding:7px 8px;min-height:36px}
 .ee-dispatch-view-switch .ee-google-control{margin-left:0}
}

/* Mobile-only scheduling refinements; desktop styles intentionally unchanged. */
@media(max-width:760px){
 .ee-dispatch .ee-schedule-header-group{margin-bottom:6px!important}
 .ee-dispatch .ee-schedule-topline{margin-bottom:5px!important}
 .ee-dispatch .ee-schedule-topline .ee-schedule-date-nav{display:none!important}
 .ee-dispatch .ee-dispatch-view-switch{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px!important;padding:7px!important;margin-bottom:8px!important;width:100%!important;box-sizing:border-box}
 .ee-dispatch .ee-dispatch-view-switch>button{grid-row:1;min-width:0;padding:10px 3px!important;font-size:12px;white-space:nowrap}
 .ee-dispatch .ee-dispatch-view-switch .ee-create-open{grid-column:1/-1;grid-row:2;width:100%;margin:0!important;min-height:42px}
 .ee-dispatch .ee-dispatch-top-week{grid-column:1/-1;grid-row:3;order:initial!important;margin:0!important;justify-content:center!important;width:100%}
 .ee-dispatch .ee-dispatch-top-week .ee-schedule-date-nav{width:100%;justify-content:space-between!important;gap:4px!important}
 .ee-dispatch .ee-dispatch-top-week .ee-schedule-date-nav strong{font-size:12px;min-width:0;white-space:normal;text-align:center}
 .ee-dispatch .ee-dispatch-view-switch .ee-google-control{grid-column:1/-1;grid-row:4;justify-self:start;margin:0!important}
 .ee-dispatch .ee-dispatch-board{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}
 .ee-dispatch .ee-dispatch-day{min-height:0;border-radius:12px;overflow:visible}
 .ee-dispatch .ee-dispatch-day-head{padding:9px 12px;display:flex;justify-content:space-between;align-items:center}
 .ee-dispatch .ee-dispatch-day .ee-dispatch-visit{padding:10px 12px}
 .ee-dispatch .ee-dispatch-visit .ee-visit-preview-trigger{gap:4px}
 .ee-dispatch .ee-dispatch-visit .ee-dispatch-edit{margin-top:5px}
 .ee-dispatch .ee-dispatch-team-board{gap:9px}
 .ee-dispatch .ee-dispatch-team-row>header{padding:10px 12px}
 .ee-dispatch .ee-dispatch-team-days{display:flex;flex-direction:column}
 .ee-dispatch .ee-dispatch-team-day{min-height:0;border-right:0;border-top:1px solid #e2eaf2}
 .ee-dispatch .ee-dispatch-team-day>small{padding:7px 12px}
 .ee-dispatch .ee-dispatch-team-day .ee-dispatch-visit{padding:10px 12px}
 .ee-dispatch .ee-dispatch-team-day:has(>small:only-child){display:none}
 .ee-dispatch .ee-dispatch-metrics-inline>a{min-width:0!important}
 .ee-dispatch .ee-dispatch-metrics-inline>a small{font-size:10px!important}
 .ee-dispatch .ee-dispatch-metrics-inline>a strong{font-size:16px!important}
 .ee-dispatch .ee-dispatch-edit summary{font-size:12px}
}
/* Second-pass mobile toolbar: compact, desktop untouched */
@media(max-width:760px){
.ee-dispatch .ee-schedule-header-group{display:flex!important;align-items:center;gap:8px;flex-wrap:wrap}
.ee-dispatch .ee-schedule-topline{flex:1 1 auto;margin:0!important}
.ee-dispatch .ee-schedule-topline h1{font-size:25px!important}
.ee-dispatch .ee-schedule-header-group>.ee-dispatch-metrics{flex:0 1 auto;margin:0!important;gap:4px!important}
.ee-dispatch .ee-schedule-header-group>.ee-dispatch-metrics>a{min-height:36px!important;padding:4px 6px!important;min-width:0!important}
.ee-dispatch .ee-schedule-header-group>.ee-dispatch-metrics>a small{font-size:9px!important}
.ee-dispatch .ee-schedule-header-group>.ee-dispatch-metrics>a strong{font-size:15px!important}
.ee-dispatch .ee-dispatch-view-switch{row-gap:6px!important}
.ee-dispatch .ee-dispatch-view-switch .ee-create-open{min-height:36px!important;padding:8px!important;font-size:13px!important}
.ee-dispatch .ee-dispatch-view-switch .ee-dispatch-top-week{grid-row:2!important}
.ee-dispatch .ee-dispatch-view-switch .ee-create-open{grid-row:3!important}
.ee-dispatch .ee-dispatch-view-switch .ee-google-control{grid-row:4!important}
.ee-dispatch .ee-dispatch-view-switch .ee-dispatch-top-week .ee-schedule-date-nav>a:not(.ee-schedule-today){width:32px;height:32px}
.ee-dispatch .ee-dispatch-view-switch .ee-dispatch-top-week .ee-schedule-date-nav strong{font-size:12px!important}
.ee-dispatch .ee-dispatch-view-switch .ee-dispatch-top-week .ee-schedule-today{font-size:12px}
.ee-dispatch .ee-timeline-toolbar .ee-timeline-extra-controls{display:none!important}
.ee-dispatch .ee-dispatch-day .ee-dispatch-edit:not([open]),.ee-dispatch .ee-dispatch-team-day .ee-dispatch-edit:not([open]){margin:0!important}
.ee-dispatch .ee-dispatch-day .ee-dispatch-edit summary,.ee-dispatch .ee-dispatch-team-day .ee-dispatch-edit summary{padding:7px 0!important}
}

@media(min-width:761px){.ee-dispatch-google-details{display:contents}.ee-dispatch-google-details>summary{display:none}}
@media(max-width:760px){
.ee-dispatch .ee-dispatch-view-switch .ee-dispatch-google-details{grid-column:1/-1;grid-row:4;justify-self:stretch}
.ee-dispatch-google-details>summary{cursor:pointer;list-style:none;font-size:12px;font-weight:700;color:#0875c9;padding:6px 2px}
.ee-dispatch-google-details>summary::-webkit-details-marker{display:none}
.ee-dispatch-google-details:not([open])>.ee-google-control{display:none!important}
.ee-dispatch-google-details[open]>.ee-google-control{display:flex!important;margin:4px 0 0!important}
}

/* Final mobile schedule layout; desktop selectors unchanged */
@media(max-width:760px){
.ee-dispatch:has(.ee-dispatch-view-switch>button:nth-child(3)[aria-pressed="true"]) .ee-schedule-header-group .ee-dispatch-metrics-inline{display:flex!important}
.ee-dispatch .ee-schedule-header-group{display:flex!important;flex-wrap:wrap;gap:5px!important;margin-bottom:7px!important}
.ee-dispatch .ee-schedule-header-group .ee-schedule-topline{flex:0 0 auto!important;display:contents!important}
.ee-dispatch .ee-schedule-header-group h1{font-size:23px!important;line-height:1.2!important}
.ee-dispatch .ee-schedule-header-group>.ee-dispatch-metrics-inline{display:flex!important;flex:1 1 auto!important;justify-content:flex-end!important;margin:0!important;gap:3px!important}
.ee-dispatch .ee-schedule-header-group>.ee-dispatch-metrics-inline>a{padding:3px 5px!important;min-height:34px!important;gap:2px!important}
.ee-dispatch .ee-schedule-header-group>.ee-dispatch-metrics-inline>a small{font-size:9px!important}
.ee-dispatch .ee-schedule-header-group>.ee-dispatch-metrics-inline>a strong{font-size:15px!important}
.ee-dispatch .ee-dispatch-view-switch{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:5px!important;padding:6px!important}
.ee-dispatch .ee-dispatch-view-switch>button{grid-row:1!important;min-width:0!important;padding:9px 2px!important;min-height:38px!important;font-size:12px!important}
.ee-dispatch .ee-dispatch-view-switch .ee-dispatch-top-week{grid-column:1/-1!important;grid-row:2!important;margin:0!important;min-width:0!important}
.ee-dispatch .ee-dispatch-view-switch .ee-dispatch-top-week .ee-schedule-date-nav{display:flex!important;justify-content:space-between!important;gap:3px!important}
.ee-dispatch .ee-dispatch-view-switch .ee-dispatch-top-week .ee-schedule-date-nav strong{font-size:12px!important}
.ee-dispatch .ee-dispatch-view-switch .ee-create-open{grid-column:1/3!important;grid-row:3!important;min-height:36px!important;padding:7px!important;width:100%!important;margin:0!important;font-size:13px!important}
.ee-dispatch .ee-dispatch-view-switch .ee-dispatch-google-details{grid-column:3!important;grid-row:3!important;align-self:center!important;justify-self:stretch!important;min-width:0!important}
.ee-dispatch .ee-dispatch-google-details>summary{display:flex!important;justify-content:center;align-items:center;min-height:36px;padding:6px!important;border:1px solid #d4e1ed;border-radius:8px;background:white;font-size:11px!important}
.ee-dispatch .ee-dispatch-google-details>summary{font-size:0!important}
.ee-dispatch .ee-dispatch-google-details>summary::after{content:"Calendar";font-size:12px}
.ee-dispatch .ee-dispatch-google-details[open]{grid-column:1/-1!important;grid-row:4!important}
.ee-dispatch .ee-dispatch-google-details[open]>summary{justify-content:flex-start!important}
.ee-dispatch .ee-dispatch-day .ee-dispatch-visit,.ee-dispatch .ee-dispatch-team-day .ee-dispatch-visit{padding:8px 11px!important}
.ee-dispatch .ee-dispatch-visit .ee-visit-preview-trigger{gap:3px!important}
.ee-dispatch .ee-dispatch-visit .ee-dispatch-edit{margin:0!important}
.ee-dispatch .ee-dispatch-visit .ee-dispatch-edit summary{padding:5px 0!important;line-height:1.3!important}
}

/* Schedule: one compact control area across desktop and mobile */
.ee-dispatch .ee-schedule-header-group{margin:0 0 4px!important;gap:0!important}
.ee-dispatch .ee-schedule-header-group .ee-schedule-topline{display:contents!important}
.ee-dispatch .ee-schedule-header-group .ee-schedule-topline>.ee-schedule-date-nav{display:none!important}
.ee-dispatch .ee-schedule-header-group>.ee-dispatch-metrics-inline{display:flex!important;justify-content:flex-start!important;flex:0 1 auto!important;margin:0 0 3px!important;gap:4px!important}
.ee-dispatch .ee-schedule-header-group>.ee-dispatch-metrics-inline>a{min-height:30px!important;padding:3px 8px!important;gap:5px!important}
.ee-dispatch .ee-schedule-header-group>.ee-dispatch-metrics-inline>a small{font-size:11px!important}
.ee-dispatch .ee-schedule-header-group>.ee-dispatch-metrics-inline>a strong{font-size:15px!important}
.ee-dispatch .ee-dispatch-view-switch{margin-bottom:7px!important}
.ee-dispatch .ee-dispatch-visit{padding:9px 12px!important}
.ee-dispatch .ee-dispatch-visit .ee-visit-preview-trigger{gap:4px!important}
.ee-sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
@media(min-width:761px){
.ee-dispatch .ee-dispatch-view-switch{gap:6px!important;padding:5px 8px!important}
.ee-dispatch .ee-dispatch-top-week{margin-left:6px!important}
}
@media(max-width:760px){
.ee-dispatch .ee-schedule-header-group{display:block!important}
.ee-dispatch .ee-schedule-header-group>.ee-dispatch-metrics-inline{width:100%!important;justify-content:space-between!important}
.ee-dispatch .ee-schedule-header-group>.ee-dispatch-metrics-inline>a{flex:1 1 0!important;min-width:0!important;min-height:32px!important;padding:4px 5px!important}
.ee-dispatch .ee-schedule-header-group>.ee-dispatch-metrics-inline>a small{font-size:10px!important}
.ee-dispatch .ee-dispatch-view-switch{row-gap:5px!important}
.ee-dispatch .ee-dispatch-day .ee-dispatch-visit,.ee-dispatch .ee-dispatch-team-day .ee-dispatch-visit{padding:9px 11px!important}
}

/* Unified schedule toolbar: always-visible Google event visibility, compact metrics */
.ee-dispatch .ee-dispatch-google-visible{display:flex;align-items:center;gap:4px;margin-left:0}
.ee-dispatch .ee-google-visibility{display:flex;align-items:center;gap:5px;height:32px;padding:3px 8px;border:1px solid #cbddeb;background:#fff;border-radius:8px;color:#33566e;font-size:11px;font-weight:700;cursor:pointer}
.ee-dispatch .ee-google-visibility.is-on{background:#eaf5ff;border-color:#8bc5fa;color:#0878cb}
.ee-dispatch .ee-google-visibility:disabled{opacity:.65;cursor:not-allowed}
.ee-dispatch .ee-google-visibility .ee-google-g{font-size:17px;letter-spacing:-1px}
.ee-dispatch .ee-dispatch-google-settings{position:relative}
.ee-dispatch .ee-dispatch-google-settings>summary{display:flex;align-items:center;justify-content:center;list-style:none;cursor:pointer;height:32px;width:32px;border:1px solid #d4e2ee;background:#fff;border-radius:8px;color:#3c647d}
.ee-dispatch .ee-dispatch-google-settings>summary::-webkit-details-marker{display:none}
.ee-dispatch .ee-dispatch-google-settings-body{position:absolute;right:0;top:37px;z-index:50;min-width:110px;padding:7px;border:1px solid #d4e2ee;background:#fff;box-shadow:0 8px 24px #14354a20;border-radius:10px}
.ee-dispatch .ee-dispatch-google-settings-body .ee-google-control{margin:0}
.ee-dispatch .ee-dispatch-view-switch{justify-content:space-between}
.ee-dispatch .ee-schedule-header-group>.ee-dispatch-metrics-inline{display:flex!important}
.ee-dispatch .ee-dispatch-metrics-inline>a{display:flex!important;flex-direction:row!important;align-items:center!important;gap:4px!important;min-height:27px!important;padding:3px 7px!important}
.ee-dispatch .ee-dispatch-metrics-inline>a small{font-size:10px!important}
.ee-dispatch .ee-dispatch-metrics-inline>a strong{font-size:13px!important}
@media(min-width:761px){
.ee-dispatch .ee-dispatch-google-visible{order:7}
.ee-dispatch .ee-schedule-header-group{margin-bottom:0!important}
.ee-dispatch .ee-schedule-header-group>.ee-dispatch-metrics-inline{position:static;visibility:visible;justify-content:flex-end!important;width:100%;margin-bottom:3px!important}
.ee-dispatch .ee-dispatch-view-switch{position:relative;padding-right:8px!important}
.ee-dispatch .ee-dispatch-view-switch::after{content:"";display:none}
.ee-dispatch .ee-dispatch-google-visible{position:static;transform:none}
}
@media(max-width:760px){
.ee-dispatch .ee-schedule-header-group>.ee-dispatch-metrics-inline{display:flex!important;gap:4px!important;margin:0 0 4px!important}
.ee-dispatch .ee-dispatch-view-switch .ee-dispatch-google-visible{grid-column:3!important;grid-row:3!important;min-width:0!important;display:flex!important;justify-content:flex-end!important;align-self:center!important}
.ee-dispatch .ee-dispatch-view-switch .ee-google-visibility{font-size:11px!important;padding:4px 6px!important;height:36px!important;min-width:0!important}
.ee-dispatch .ee-dispatch-view-switch .ee-google-visibility .ee-google-g{font-size:16px}
.ee-dispatch .ee-dispatch-view-switch .ee-dispatch-google-settings>summary{height:36px;width:30px}
.ee-dispatch .ee-dispatch-view-switch .ee-create-open{grid-column:1/3!important}
}

/* November schedule toolbar consolidation */
.ee-dispatch .ee-google-visibility{width:33px!important;min-width:33px!important;height:33px!important;padding:3px!important;justify-content:center!important}
.ee-dispatch .ee-google-visibility .ee-google-g{font-size:21px!important}
.ee-dispatch-timeline-controls[hidden]{display:none!important}
@media(min-width:1000px){
.ee-dispatch .ee-dispatch-view-switch{display:flex!important;flex-wrap:nowrap!important;align-items:center!important;gap:5px!important;min-height:44px!important;padding:4px 7px!important}
.ee-dispatch .ee-dispatch-view-switch>button{flex:0 0 auto!important}
.ee-dispatch .ee-dispatch-top-week{flex:0 0 auto!important;width:auto!important;order:0!important;margin:0 auto!important}
.ee-dispatch .ee-dispatch-top-week .ee-schedule-date-nav{gap:3px!important;flex-wrap:nowrap!important}
.ee-dispatch .ee-dispatch-timeline-controls{display:flex;align-items:center;gap:5px;flex:0 0 auto;min-width:0}
.ee-dispatch .ee-dispatch-timeline-controls .ee-timeline-toolbar{display:flex!important;flex-wrap:nowrap!important;align-items:center!important;border:0!important;background:transparent!important;padding:0!important;margin:0!important;min-height:0!important;gap:5px!important}
.ee-dispatch .ee-dispatch-timeline-controls .ee-timeline-tabs{padding:2px!important}
.ee-dispatch .ee-dispatch-timeline-controls .ee-timeline-tabs button{padding:5px 8px!important;min-height:29px!important}
.ee-dispatch .ee-dispatch-timeline-controls .ee-timeline-mobile-filters>summary{min-height:30px!important;padding:4px 8px!important}
.ee-dispatch .ee-dispatch-timeline-controls .ee-timeline-day-picker{display:flex!important;align-items:center;gap:3px!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;max-width:180px}
.ee-dispatch .ee-dispatch-timeline-controls .ee-timeline-day-picker button{height:31px!important;min-width:26px!important;padding:2px!important}
.ee-dispatch .ee-dispatch-timeline-controls .ee-timeline-day-picker select{height:31px!important;min-width:95px!important;width:108px!important;padding:3px!important;font-size:11px!important}
.ee-dispatch .ee-dispatch-google-visible{order:0!important;margin:0!important}
.ee-dispatch .ee-dispatch-create{order:0!important}
.ee-dispatch .ee-schedule-header-group{display:none!important}
}
@media(max-width:760px){
.ee-dispatch .ee-dispatch-google-visible{grid-column:3!important;grid-row:3!important}
.ee-dispatch .ee-dispatch-google-visible .ee-google-visibility{height:36px!important;width:38px!important}
.ee-dispatch .ee-schedule-header-group>.ee-dispatch-metrics-inline{display:none!important}
.ee-dispatch .ee-schedule-header-group{display:none!important}
.ee-dispatch .ee-dispatch-timeline-controls{display:none!important}
}

/* Desktop schedule: two purposeful rows and no former header gutter. */
@media(min-width:1000px){
.hq-shell-content:has(> .hq-detail .ee-dispatch){padding-top:0!important;margin-top:0!important}
.hq-shell-content>.hq-detail:has(.ee-dispatch){padding-top:8px!important;margin-top:0!important}
.hq-shell-content>.hq-detail .ee-dispatch{padding-top:0!important;margin-top:0!important}
.ee-dispatch .ee-dispatch-view-switch{
display:grid!important;
grid-template-columns:max-content max-content max-content minmax(0,1fr) max-content!important;
grid-template-rows:minmax(38px,auto) minmax(38px,auto)!important;
column-gap:8px!important;row-gap:5px!important;
align-items:center!important;justify-content:stretch!important;
padding:7px 10px!important;min-height:0!important;
}
.ee-dispatch .ee-dispatch-view-switch>button:nth-child(1){grid-column:1;grid-row:1}
.ee-dispatch .ee-dispatch-view-switch>button:nth-child(2){grid-column:2;grid-row:1}
.ee-dispatch .ee-dispatch-view-switch>button:nth-child(3){grid-column:3;grid-row:1}
.ee-dispatch .ee-dispatch-view-switch .ee-dispatch-top-week{
grid-column:4!important;grid-row:1!important;
justify-self:center!important;justify-content:center!important;
margin:0!important;width:auto!important;min-width:0!important;
}
.ee-dispatch .ee-dispatch-view-switch .ee-create-open{
grid-column:5!important;grid-row:1!important;
margin:0!important;justify-self:end!important;
}
.ee-dispatch .ee-dispatch-view-switch .ee-dispatch-timeline-controls{
grid-column:1/5!important;grid-row:2!important;
justify-self:start!important;align-self:center!important;
min-height:34px!important;
}
.ee-dispatch .ee-dispatch-view-switch .ee-dispatch-google-visible{
grid-column:5!important;grid-row:2!important;
justify-self:end!important;align-self:center!important;
}
.ee-dispatch .ee-dispatch-view-switch .ee-dispatch-top-week .ee-schedule-date-nav{
gap:7px!important;
}
.ee-dispatch .ee-dispatch-timeline-controls .ee-timeline-day-picker{
max-width:none!important;
}
.ee-dispatch .ee-dispatch-timeline-controls .ee-timeline-day-picker select{
width:130px!important;
}
}

/* Desktop scheduling toolbar: navigation first, filters and actionable metrics second */
@media(min-width:1000px){
.ee-dispatch .ee-dispatch-view-switch{
background:#f3f7fb!important;border:1px solid #e1eaf2!important;border-radius:12px!important;
grid-template-columns:max-content max-content max-content minmax(0,1fr) max-content!important;
grid-template-rows:38px 38px!important;gap:6px 9px!important;padding:7px 10px!important;
}
.ee-dispatch .ee-dispatch-view-switch>button:nth-child(-n+3){height:34px!important;min-height:34px!important;border-radius:8px!important}
.ee-dispatch .ee-dispatch-view-switch .ee-dispatch-timeline-controls{grid-column:1/4!important;grid-row:2!important}
.ee-dispatch .ee-dispatch-view-switch .ee-dispatch-toolbar-metrics{grid-column:4!important;grid-row:2!important;justify-self:end!important;align-self:center!important;min-width:0}
.ee-dispatch .ee-dispatch-view-switch .ee-dispatch-google-visible{grid-column:5!important;grid-row:2!important}
.ee-dispatch .ee-dispatch-toolbar-metrics .ee-dispatch-metrics{display:flex!important;align-items:center!important;gap:5px!important;margin:0!important;padding:0!important;background:transparent!important;border:0!important}
.ee-dispatch .ee-dispatch-toolbar-metrics .ee-dispatch-metrics a{display:flex!important;flex-direction:row!important;align-items:center!important;gap:7px!important;min-height:32px!important;min-width:0!important;padding:5px 9px!important;border:1px solid #d5e2ef!important;border-radius:8px!important;background:#fff!important;text-decoration:none!important}
.ee-dispatch .ee-dispatch-toolbar-metrics .ee-dispatch-metrics a.is-selected{background:#e7f3ff!important;border-color:#1986e5!important;box-shadow:inset 0 0 0 1px #1986e5}
.ee-dispatch .ee-dispatch-toolbar-metrics .ee-dispatch-metrics a small{font-size:11px!important;white-space:nowrap!important}
.ee-dispatch .ee-dispatch-toolbar-metrics .ee-dispatch-metrics a strong{font-size:14px!important}
.ee-dispatch .ee-timeline-quick-staff{display:block!important}
.ee-dispatch .ee-timeline-quick-staff select{height:32px!important;max-width:165px!important;min-width:125px!important;border:1px solid #d5e2ef;border-radius:8px;background:#fff;padding:3px 8px;font-size:12px;color:#1a405c}
.ee-dispatch .ee-dispatch-timeline-controls .ee-timeline-toolbar{gap:7px!important}
.ee-dispatch .ee-dispatch-timeline-controls .ee-timeline-day-picker{max-width:180px!important}
.ee-dispatch .ee-dispatch-timeline-controls .ee-timeline-day-picker select{width:110px!important}
}
@media(max-width:999px){.ee-dispatch .ee-dispatch-toolbar-metrics{display:none!important}.ee-dispatch .ee-timeline-quick-staff{display:none!important}}
.ee-timeline-google-settings{display:flex;flex-direction:column;gap:5px;padding:9px 0 0;border-top:1px solid #dbe6f0;font-size:12px}
.ee-timeline-google-settings span{color:#637c90}
.ee-timeline-google-settings button,.ee-timeline-google-settings a{align-self:flex-start;border:1px solid #d1e1ef;background:#fff;border-radius:7px;padding:6px 9px;color:#1479c5;font-size:12px;cursor:pointer}

/* Desktop unified scheduling controls: consistent hierarchy across views. */
@media(min-width:1000px){
.ee-dispatch .ee-dispatch-view-switch{grid-template-columns:max-content max-content max-content minmax(0,1fr) max-content max-content!important;grid-template-rows:40px 38px!important}
.ee-dispatch .ee-dispatch-top-week{grid-column:4!important;grid-row:1!important;justify-self:center!important}
.ee-dispatch .ee-dispatch-top-week .ee-schedule-date-nav strong{font-size:14px!important}
.ee-dispatch .ee-dispatch-top-week .ee-schedule-date-nav>a:not(.ee-schedule-today){width:34px!important;height:34px!important}
.ee-dispatch .ee-dispatch-view-switch .ee-create-open{grid-column:5!important;grid-row:1!important}
.ee-dispatch .ee-dispatch-view-switch .ee-dispatch-google-visible{grid-column:6!important;grid-row:1!important}
.ee-dispatch .ee-dispatch-view-switch .ee-dispatch-toolbar-metrics{grid-column:4/7!important;grid-row:2!important;justify-self:end!important}
.ee-dispatch .ee-dispatch-view-switch .ee-dispatch-timeline-controls{grid-column:1/4!important;grid-row:2!important}
.ee-dispatch .ee-timeline-density-shortcut{border:1px solid #cbddeb;background:#fff;border-radius:8px;padding:6px 11px;min-height:32px;color:#176ba7;font-size:12px;font-weight:700;cursor:pointer}
.ee-dispatch .ee-timeline-density-shortcut[aria-pressed="true"]{background:#e5f3ff;border-color:#1688e9}
.ee-dispatch .ee-dispatch-timeline-controls .ee-timeline-toolbar{display:flex!important;align-items:center!important}
}

@media(min-width:1000px){
.ee-dispatch .ee-dispatch-view-switch #ee-dispatch-team-controls{grid-column:1/4!important;grid-row:2!important;justify-self:start!important;align-self:center!important}
.ee-dispatch .ee-dispatch-view-switch #ee-dispatch-team-controls[hidden],
.ee-dispatch .ee-dispatch-view-switch #ee-dispatch-timeline-controls[hidden]{display:none!important}
.ee-dispatch .ee-dispatch-view-switch #ee-dispatch-team-controls:not([hidden]),
.ee-dispatch .ee-dispatch-view-switch #ee-dispatch-timeline-controls:not([hidden]){display:flex!important}
.ee-dispatch .ee-dispatch-view-switch .ee-dispatch-toolbar-metrics{display:flex!important}
}
`}</style></main>;
}
