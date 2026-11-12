'use client';
import {useGoogleCalendar} from './google-calendar-context';
import {useEffect,useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {setScheduledVisitTimes} from './actions';
import VisitPreview from './visit-preview';

export type TimelineVisit={startIso:string;endIso:string;id:string;day:string;startMinutes:number;endMinutes:number;title:string;jobNumber:string;jobHref:string;time:string;customer:string;electricians:string[];staffIds:string[];address?:string|null;notes?:string|null;conflict?:string|null};
type Props={toolbarExtras?:React.ReactNode;canEdit:boolean;canOverrideNeil:boolean;visits:TimelineVisit[];days:{key:string;label:string}[];staff:{id:string;name:string}[];today:string;nowMinutes:number};
const START=6*60,END=18*60,COMFORTABLE_HOUR_HEIGHT=64;
const palette=['#1676c4','#a34ecb','#0e9875','#d16a21','#d34876','#6b65c8','#138d9b','#7a8533'];
const staffColor=(id:string)=>{let h=0;for(const ch of id)h=(h*31+ch.charCodeAt(0))|0;return palette[Math.abs(h)%palette.length]};
const hourLabel=(h:number)=>`${h%12||12} ${h<12?'am':'pm'}`;
export default function DispatchTimeline({toolbarExtras,canEdit,canOverrideNeil,visits,days,staff,today,nowMinutes}:Props){
 const router=useRouter();
 const [density,setDensity]=useState<'fit'|'comfortable'>('fit');
 const [hourHeight,setHourHeight]=useState(40);
 useEffect(()=>{const update=()=>{const top=document.querySelector('.ee-timeline-scroll')?.getBoundingClientRect().top??360;const available=Math.max(300,window.innerHeight-top-18-48);setHourHeight(Math.max(28,Math.min(64,Math.floor(available/12))));};update();window.addEventListener('resize',update);const observer=new ResizeObserver(update);const toolbar=document.querySelector('.ee-timeline-toolbar');if(toolbar)observer.observe(toolbar);return()=>{window.removeEventListener('resize',update);observer.disconnect()};},[]);
 const HOUR_HEIGHT=density==='fit'?hourHeight:COMFORTABLE_HOUR_HEIGHT;
 const [moving,setMoving]=useState<TimelineVisit|null>(null);
 const [proposed,setProposed]=useState<{visit:TimelineVisit;day:string;start:number;end:number;warning:string}|null>(null);
 const [overrideNeil,setOverrideNeil]=useState(false);
 const [serverWarning,setServerWarning]=useState('');
 const [moveDay,setMoveDay]=useState('');
 const [moveTime,setMoveTime]=useState('07:00');
 const [moveEnd,setMoveEnd]=useState('08:00');
 const [moveError,setMoveError]=useState('');
 const [preview,setPreview]=useState<{id:string;day:string;start:number;end:number}|null>(null);
 const [overrides,setOverrides]=useState<Record<string,{day:string;start:number;end:number;startIso:string;endIso:string}>>({});
 const previewRef=useRef<{id:string;day:string;start:number;end:number}|null>(null);
 const gesture=useRef<{id:string;kind:'move'|'start'|'end';day:string;start:number;end:number;anchorY:number;anchorX:number;anchorMinute:number;originStart:number;originEnd:number;originDay:string;pointerId:number;active:boolean;armed:boolean;touch:boolean}|null>(null);
 const {show:showGoogle,events:googleEvents}=useGoogleCalendar();
 const lanes=useRef<Record<string,HTMLDivElement|null>>({});
 const holdTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const clearHold=()=>{if(holdTimer.current!==null){clearTimeout(holdTimer.current);holdTimer.current=null;}};
 const cancelGesture=()=>{clearHold();gesture.current=null;previewRef.current=null;setPreview(null);};
 useEffect(()=>{
  const stopScroll=(e:TouchEvent)=>{if(gesture.current?.touch&&gesture.current.armed)e.preventDefault();};
  document.addEventListener('touchmove',stopScroll,{passive:false});
  return ()=>{document.removeEventListener('touchmove',stopScroll);if(holdTimer.current!==null)clearTimeout(holdTimer.current);};
 },[]);
 const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
 const snap=(v:number)=>Math.round(v/15)*15;
 const toIso=(day:string,minutes:number)=>new Date(new Date(day+'T00:00:00+08:00').getTime()+minutes*60000).toISOString();
 const effective=visits.map(v=>{const o=overrides[v.id];return o?{...v,day:o.day,startMinutes:o.start,endMinutes:o.end,startIso:o.startIso,endIso:o.endIso,time:new Date(o.startIso).toLocaleTimeString('en-AU',{timeZone:'Australia/Perth',hour:'numeric',minute:'2-digit'})+' – '+new Date(o.endIso).toLocaleTimeString('en-AU',{timeZone:'Australia/Perth',hour:'numeric',minute:'2-digit'})}:v;});
 const format=(m:number)=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
 const beginGesture=(e:React.PointerEvent, v:TimelineVisit,kind:'move'|'start'|'end')=>{
  if(!canEdit||pending||(e.pointerType==='mouse'&&e.button!==0))return;
  if(e.pointerType!=='touch')e.preventDefault();e.stopPropagation();
  const lane=lanes.current[v.day];if(!lane)return;
  const rect=lane.getBoundingClientRect();
  gesture.current={id:v.id,kind,day:v.day,start:v.startMinutes,end:v.endMinutes,anchorY:e.clientY,anchorX:e.clientX,anchorMinute:snap(START+(e.clientY-rect.top)/HOUR_HEIGHT*60),originStart:v.startMinutes,originEnd:v.endMinutes,originDay:v.day,pointerId:e.pointerId,active:false,armed:e.pointerType!=='touch',touch:e.pointerType==='touch'};
  if(e.pointerType==='touch'){
   clearHold();
   holdTimer.current=setTimeout(()=>{
    const g=gesture.current;
    if(g&&g.pointerId===e.pointerId){g.armed=true;if(navigator.vibrate)navigator.vibrate(20);}
    holdTimer.current=null;
   },450);
  }
 };
 const moveGesture=(e:React.PointerEvent)=>{
  const g=gesture.current;if(!g||g.pointerId!==e.pointerId)return;
  if(!g.armed){
   if(Math.hypot(e.clientX-g.anchorX,e.clientY-g.anchorY)>9)cancelGesture();
   return;
  }
  if(Math.hypot(e.clientX-g.anchorX,e.clientY-g.anchorY)<6&&!g.active)return;
  g.active=true;
  const target=Object.entries(lanes.current).find(([,el])=>{if(!el)return false;const r=el.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<r.right})?.[0]??g.day;
  const lane=lanes.current[g.kind==='move'?target:g.originDay];if(!lane)return;
  const rect=lane.getBoundingClientRect();const minute=snap(START+(e.clientY-rect.top)/HOUR_HEIGHT*60);
  const duration=g.originEnd-g.originStart;
  let start=g.originStart,end=g.originEnd,day=g.originDay;
  if(g.kind==='move'){day=target;start=clamp(minute-(g.anchorMinute-g.originStart),START,END-duration);start=snap(start);end=start+duration;}
  else if(g.kind==='start')start=clamp(minute,START,g.originEnd-15);
  else end=clamp(minute,g.originStart+15,END);
  previewRef.current={id:g.id,day,start,end};setPreview(previewRef.current);
 };
 const endGesture=(e:React.PointerEvent)=>{
  const g=gesture.current;if(!g||g.pointerId!==e.pointerId)return;
  clearHold();gesture.current=null;
  const p=previewRef.current;previewRef.current=null;setPreview(null);
  if(!g.active||!p)return;
  const v=effective.find(x=>x.id===g.id);if(v)confirmTimes(v,p.day,p.start,p.end);
 };
 const [pending,startTransition]=useTransition();
 const beginMove=(v:TimelineVisit)=>{setMoveError('');setMoving(v);setMoveDay(v.day);setMoveTime(format(v.startMinutes));setMoveEnd(format(v.endMinutes));};
 const confirmTimes=(v:TimelineVisit,day:string,start:number,end:number)=>{
  if(!canEdit||pending||end<=start)return;
  const nextStart=toIso(day,start),nextEnd=toIso(day,end);
  if(nextStart===v.startIso&&nextEnd===v.endIso)return;
  const overlaps=effective.filter(other=>other.id!==v.id&&v.staffIds.some(id=>other.staffIds.includes(id))&&new Date(other.startIso)<new Date(nextEnd)&&new Date(other.endIso)>new Date(nextStart));
  const warning=overlaps.length?'\n\nStaff conflict with: '+overlaps.map(x=>x.customer+' — '+x.title).join('; '):'';
  setMoving(null);setOverrideNeil(false);setServerWarning('');setProposed({visit:v,day,start,end,warning});
 };
 const applyTimes=(v:TimelineVisit,day:string,start:number,end:number,override=false)=>{
  const nextStart=toIso(day,start),nextEnd=toIso(day,end);
  const previous=overrides[v.id];
  setOverrides(old=>({...old,[v.id]:{day,start,end,startIso:nextStart,endIso:nextEnd}}));
  startTransition(async()=>{try{await setScheduledVisitTimes(v.id,nextStart,nextEnd,v.startIso,override);setMoving(null);router.refresh();}catch(e){setOverrides(old=>{const copy={...old};if(previous)copy[v.id]=previous;else delete copy[v.id];return copy;});setServerWarning(e instanceof Error?e.message:'Unable to reschedule visit.');setOverrideNeil(false);setProposed({visit:v,day,start,end,warning:''})}})
 };
 const [mode,setMode]=useState<'week'|'day'>(()=>typeof window!=='undefined'&&window.matchMedia('(max-width: 760px)').matches?'day':'week');
 const [selected,setSelected]=useState(days.find(d=>d.key===today)?.key??days[0]?.key??'');
 const [staffId,setStaffId]=useState('all');
 const [showUnassigned,setShowUnassigned]=useState(true);
 const visible=effective.filter(v=>(staffId==='all'||(staffId==='unassigned'?v.staffIds.length===0:v.staffIds.includes(staffId)))&&(showUnassigned||v.staffIds.length>0));
 const shownDays=mode==='week'?days:days.filter(d=>d.key===selected);
 const layoutForDay=(day:string)=>{
  type Slot={id:string;start:number;end:number};
  const slots:Slot[]=[...visible.filter(v=>v.day===day).map(v=>({id:'visit-'+v.id,start:v.startMinutes,end:v.endMinutes})),...(showGoogle?googleEvents.filter(e=>e.busy).flatMap(e=>{const base=new Date(day+'T00:00:00+08:00').getTime();const start=Math.max(0,(new Date(e.start).getTime()-base)/60000),end=Math.min(1440,(new Date(e.end).getTime()-base)/60000);return end>start?[{id:'google-'+e.id,start,end}]:[]}):[])];
  const sorted=slots.sort((a,b)=>a.start-b.start||b.end-a.end||a.id.localeCompare(b.id));
  const positions=new Map<string,{index:number;count:number}>();
  let group:Slot[]=[],groupEnd=-Infinity;
  const flush=()=>{if(!group.length)return;const lanes:number[]=[];const placed:{slot:Slot;index:number}[]=[];for(const slot of group){let index=lanes.findIndex(end=>end<=slot.start);if(index<0){index=lanes.length;lanes.push(slot.end)}else lanes[index]=slot.end;placed.push({slot,index});}for(const {slot,index} of placed)positions.set(slot.id,{index,count:lanes.length});};
  for(const slot of sorted){if(group.length&&slot.start>=groupEnd){flush();group=[];groupEnd=-Infinity;}group.push(slot);groupEnd=Math.max(groupEnd,slot.end);}flush();return positions;
 };
 const dayLayouts=new Map(shownDays.map(d=>[d.key,layoutForDay(d.key)]));
 const minHeight=(END-START)/60*HOUR_HEIGHT;
 return <section className="ee-timeline">
  <div className="ee-timeline-toolbar"><div className="ee-timeline-tabs"><button type="button" className={mode==='week'?'active':''} onClick={()=>setMode('week')}>Week</button><button type="button" className={mode==='day'?'active':''} onClick={()=>setMode('day')}>Day</button></div><label className="ee-timeline-staff-filter"><span>Electrician</span><select value={staffId} onChange={e=>setStaffId(e.target.value)}><option value="all">All electricians</option>{staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}<option value="unassigned">Unassigned</option></select></label><label className="ee-timeline-check" title="Show unassigned visits"><input type="checkbox" checked={showUnassigned} onChange={e=>setShowUnassigned(e.target.checked)}/> <span>Unassigned</span></label>{toolbarExtras&&<div className="ee-timeline-extra-controls">{toolbarExtras}</div>}<div className="ee-timeline-density" role="group" aria-label="Calendar density" title="Fit compresses hours to the viewport; Comfortable uses larger hour spacing and page scrolling"><button type="button" className={density==='fit'?'active':''} onClick={()=>setDensity('fit')}>Fit</button><button type="button" className={density==='comfortable'?'active':''} onClick={()=>setDensity('comfortable')}>Comfortable</button></div></div>
  {mode==='day'&&<div className="ee-timeline-day-picker"><button type="button" onClick={()=>setSelected(days[Math.max(0,days.findIndex(d=>d.key===selected)-1)]?.key??selected)} aria-label="Previous day">‹</button><select value={selected} onChange={e=>setSelected(e.target.value)}>{days.map(d=><option value={d.key} key={d.key}>{d.label}</option>)}</select><button type="button" onClick={()=>setSelected(days[Math.min(days.length-1,days.findIndex(d=>d.key===selected)+1)]?.key??selected)} aria-label="Next day">›</button></div>}
  {visits.some(v=>v.startMinutes<START||v.endMinutes>END)&&<p className="ee-timeline-outside" role="status">Some appointments fall outside 6 am–6 pm. View their full times in By day or By electrician.</p>}
  
  <div className="ee-timeline-scroll"><div className="ee-timeline-grid" style={{gridTemplateColumns:`62px repeat(${shownDays.length},minmax(0,1fr))`}}>
   <div className="ee-timeline-corner">AWST</div>{shownDays.map(d=><div key={d.key} className={'ee-timeline-day-header'+(d.key===today?' today':'')}>{d.label}<small>{visible.filter(v=>v.day===d.key).length} visits</small></div>)}
   <div className="ee-timeline-hours" style={{height:minHeight}}>{Array.from({length:END/60-START/60+1},(_,i)=><span key={i} style={{top:i*HOUR_HEIGHT}}>{hourLabel(START/60+i)}</span>)}</div>
   {shownDays.map(d=><div className="ee-timeline-lane" key={d.key} ref={el=>{lanes.current[d.key]=el}} style={{height:minHeight,backgroundSize:`100% ${HOUR_HEIGHT}px`}}>
    {showGoogle&&googleEvents.filter(e=>e.busy).flatMap(e=>{
     const dayStart=new Date(d.key+'T00:00:00+08:00').getTime(),dayEnd=dayStart+86400000;
     const from=Math.max(dayStart,new Date(e.start).getTime()),to=Math.min(dayEnd,new Date(e.end).getTime());
     if(to<=from)return [];
     const start=Math.max(START,(from-dayStart)/60000),end=Math.min(END,(to-dayStart)/60000);
     if(end<=start)return [];
     return [<a key={'google-'+e.id+'-'+d.key} className="ee-timeline-google-event" href={e.url??'#'} target={e.url?'_blank':undefined} rel="noopener noreferrer" title={e.title+' · '+new Date(e.start).toLocaleTimeString('en-AU',{timeZone:'Australia/Perth',hour:'numeric',minute:'2-digit'})+'–'+new Date(e.end).toLocaleTimeString('en-AU',{timeZone:'Australia/Perth',hour:'numeric',minute:'2-digit'})} style={{top:(start-START)/60*HOUR_HEIGHT+2,height:Math.max(24,(end-start)/60*HOUR_HEIGHT-4),left:`calc(${(dayLayouts.get(d.key)?.get('google-'+e.id)?.index??0)/(dayLayouts.get(d.key)?.get('google-'+e.id)?.count??1)*100}% + 3px)`,width:`calc(${100/(dayLayouts.get(d.key)?.get('google-'+e.id)?.count??1)}% - 6px)`,right:'auto'}}><strong>{e.title}</strong><span>{new Date(e.start).toLocaleTimeString('en-AU',{timeZone:'Australia/Perth',hour:'numeric',minute:'2-digit'})} – {new Date(e.end).toLocaleTimeString('en-AU',{timeZone:'Australia/Perth',hour:'numeric',minute:'2-digit'})}</span><small>Neil unavailable · Google</small></a>];
    })}
    {preview?.day===d.key&&<div className="ee-timeline-ghost" style={{top:(preview.start-START)/60*HOUR_HEIGHT+2,height:Math.max(22,(preview.end-preview.start)/60*HOUR_HEIGHT-4)}}><strong>{effective.find(v=>v.id===preview.id)?.customer}</strong><span>{format(preview.start)} – {format(preview.end)}</span></div>}
    {d.key===today&&nowMinutes>=START&&nowMinutes<=END&&<div className="ee-timeline-now" style={{top:(nowMinutes-START)/60*HOUR_HEIGHT}}><span>Now</span></div>}
    {visible.filter(v=>v.day===d.key).map(v=>{
     const start=Math.max(START,v.startMinutes),end=Math.min(END,v.endMinutes);
     if(end<=start)return null;
     const {index,count}=dayLayouts.get(d.key)?.get('visit-'+v.id)??{index:0,count:1};
     return <div className={'ee-timeline-event'+(v.conflict?' conflict':'')+(preview?.id===v.id?' is-dragging':'')} key={v.id} onPointerDown={e=>beginGesture(e,v,'move')} onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={cancelGesture} style={{top:(start-START)/60*HOUR_HEIGHT+2,height:Math.max(30,(end-start)/60*HOUR_HEIGHT-4),left:`calc(${index/count*100}% + 3px)`,width:`calc(${100/count}% - 6px)`,borderLeftColor:v.conflict?'#d99034':'#1688e9'}}>{canEdit&&<div className="ee-timeline-resize top" onPointerDown={e=>beginGesture(e,v,'start')} title="Drag to adjust start time"/>}<VisitPreview appointmentId={v.id} startIso={v.startIso} endIso={v.endIso} canEdit={canEdit} staff={staff} title={v.title} jobNumber={v.jobNumber} jobHref={v.jobHref} time={v.time} customer={v.customer} electricians={v.electricians} staffIds={v.staffIds} address={v.address} notes={v.notes} conflict={v.conflict} compact/>{canEdit&&<div className="ee-timeline-resize bottom" onPointerDown={e=>beginGesture(e,v,'end')} title="Drag to adjust end time"/>}</div>;
    })}
   </div>)}
  </div></div>

  {proposed&&<div className="ee-timeline-move-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setProposed(null)}}><div className="ee-timeline-move-dialog" role="dialog" aria-modal="true" aria-label="Confirm appointment change"><h2>Confirm appointment change</h2><p><strong>{proposed.visit.customer} — {proposed.visit.title}</strong></p><p>Current: {proposed.visit.day} · {format(proposed.visit.startMinutes)}–{format(proposed.visit.endMinutes)}</p><p>New: <strong>{proposed.day} · {format(proposed.start)}–{format(proposed.end)}</strong></p>{proposed.warning&&<p className="ee-timeline-conflict-warning">{proposed.warning.trim()}</p>}{serverWarning&&<p role="alert" className="ee-timeline-conflict-warning">{serverWarning}</p>}{canOverrideNeil&&<label className="ee-neil-override"><input type="checkbox" checked={overrideNeil} onChange={e=>setOverrideNeil(e.target.checked)}/> Override Neil’s Google Calendar conflict (if applicable)</label>}<div><button type="button" onClick={()=>setProposed(null)}>Keep original</button><button type="button" disabled={pending} onClick={()=>{const p=proposed;setProposed(null);applyTimes(p.visit,p.day,p.start,p.end,overrideNeil)}}>Confirm change</button></div></div></div>}
  {moving&&<div className="ee-timeline-move-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setMoving(null)}}><form className="ee-timeline-move-dialog" onSubmit={e=>{e.preventDefault();const [sh,sm]=moveTime.split(':').map(Number),[eh,em]=moveEnd.split(':').map(Number);const start=snap(sh*60+sm),end=snap(eh*60+em);if(end<=start){setMoveError('End time must be after start time.');return;}setMoveError('');confirmTimes(moving,moveDay,start,end)}}><h2>Change appointment</h2><p>{moving.customer} — {moving.title}</p><label>Date<input type="date" required value={moveDay} onChange={e=>setMoveDay(e.target.value)}/></label><label>Start time<input type="time" required step={900} value={moveTime} onChange={e=>{setMoveTime(e.target.value);setMoveError('')}}/></label><label>End time<input type="time" required step={900} value={moveEnd} onChange={e=>{setMoveEnd(e.target.value);setMoveError('')}}/></label>{moveError&&<p role="alert" className="ee-timeline-conflict-warning">{moveError}</p>}<div><button type="button" onClick={()=>setMoving(null)}>Cancel</button><button type="submit" disabled={pending}>Review change</button></div></form></div>}
  <style jsx global>{`
  @media(max-width:760px){.ee-timeline-toolbar{display:grid!important;grid-template-columns:minmax(0,1fr) auto;gap:7px!important;padding:8px!important}.ee-timeline-toolbar .ee-timeline-tabs{width:100%;grid-column:1;grid-row:1}.ee-timeline-toolbar .ee-timeline-tabs button{flex:1}.ee-timeline-toolbar .ee-timeline-staff-filter{grid-column:1/-1;grid-row:2;flex:none!important}.ee-timeline-toolbar .ee-timeline-staff-filter select{width:100%;max-width:none!important}.ee-timeline-toolbar .ee-timeline-check{grid-column:2;grid-row:1;align-self:center;white-space:nowrap}.ee-timeline-toolbar .ee-timeline-extra-controls{grid-column:1/-1;grid-row:3;order:initial!important;display:flex;justify-content:space-between;width:100%;flex:none!important}.ee-timeline-toolbar .ee-timeline-density{grid-column:1/-1;grid-row:4;width:100%;margin:0}.ee-timeline-day-picker{justify-content:space-between;gap:6px}.ee-timeline-day-picker select{flex:1;min-width:0}.ee-timeline-scroll{overflow-x:hidden!important}.ee-timeline-grid{grid-template-columns:52px minmax(0,1fr)!important}.ee-timeline-corner{padding:8px 4px}.ee-timeline-day-header{font-size:12px;padding:8px}.ee-timeline-hours span{right:4px}.ee-timeline-event .ee-visit-preview-trigger{gap:4px}.ee-timeline-event .ee-visit-preview-number{white-space:normal;overflow-wrap:anywhere}.ee-timeline-event .ee-visit-preview-avatars{display:flex;flex-wrap:wrap}.ee-timeline-google-event strong{overflow-wrap:anywhere}.ee-timeline-event{padding:5px}}

  .ee-timeline-density{display:flex;gap:2px;padding:2px;border-radius:8px;background:#e7eef6;margin-left:auto}.ee-timeline-density button{border:0;background:transparent;border-radius:6px;padding:7px 9px;font-size:11px;font-weight:750;color:#47657c;cursor:pointer;white-space:nowrap}.ee-timeline-density button.active{background:white;color:#0875c9;box-shadow:0 1px 3px #1232}.ee-timeline-scroll{overflow-y:clip!important;max-height:none!important;height:auto!important;overscroll-behavior-y:auto}.ee-timeline-day-header,.ee-timeline-corner{top:0;z-index:15}.ee-timeline-corner{z-index:17}@media(max-width:760px){.ee-timeline-density{width:100%;justify-content:center;margin-left:0}.ee-timeline-density button{flex:1}}
  .ee-timeline-scroll{min-height:0;overflow-y:clip!important;max-height:none!important;contain:none!important}.ee-timeline-grid{height:auto!important;max-height:none!important}.ee-timeline-extra-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-left:auto}.ee-timeline-extra-controls .ee-dispatch-metrics-inline{display:flex;gap:4px!important;margin:0!important}.ee-timeline-extra-controls .ee-dispatch-metrics-inline>a{min-height:30px!important;padding:3px 7px!important}.ee-timeline-extra-controls .ee-schedule-date-nav{display:flex;width:auto;gap:5px}.ee-timeline-extra-controls .ee-schedule-date-nav strong{font-size:11px}.ee-timeline-toolbar .ee-timeline-staff-filter{align-items:center!important}.ee-timeline-toolbar .ee-timeline-staff-filter>span{display:inline!important;line-height:32px}.ee-timeline-toolbar{align-items:center!important}@media(max-width:1000px){.ee-timeline-extra-controls{order:4;flex:1 1 100%;justify-content:space-between}.ee-timeline-density{margin-left:auto}}@media(max-width:760px){.ee-timeline-toolbar .ee-timeline-staff-filter>span{display:none!important}.ee-timeline-extra-controls{gap:6px}.ee-timeline-extra-controls .ee-schedule-date-nav{flex-wrap:wrap}.ee-timeline-extra-controls .ee-dispatch-metrics-inline>a small{font-size:10px!important}}
  .ee-timeline-google-event{min-width:0;position:absolute;z-index:1;left:3px;right:3px;display:flex;flex-direction:column;gap:4px;padding:7px;background:#ffe0e0;border:1px solid #f4a5a5;border-left:4px solid #ef6268;border-radius:7px;color:#772e32;font-size:11px;overflow:hidden;text-decoration:none;box-sizing:border-box}.ee-timeline-google-event strong{font-size:12px;line-height:1.25}.ee-timeline-google-event span,.ee-timeline-google-event small{font-size:10px;line-height:1.3}.ee-timeline-google-event:hover{z-index:4;background:#ffd1d1}
  .ee-timeline-conflict-warning{background:#fff4e4;border:1px solid #e4b16d;padding:10px;border-radius:8px;white-space:pre-line;color:#865a1a}.ee-timeline-help{font-size:12px;color:#647d91;margin:0 0 8px}.ee-timeline-help summary{cursor:pointer;width:max-content}.ee-timeline-help p{margin:6px 0}.ee-timeline-ghost{position:absolute;z-index:20;left:3px;right:3px;border:2px dashed #0875c9;border-radius:8px;background:#1688e955;pointer-events:none;display:flex;flex-direction:column;padding:8px;gap:4px;color:#07558c;font-size:12px;box-sizing:border-box;overflow:hidden}.ee-timeline-event.is-dragging{opacity:.25}.ee-timeline-resize{position:absolute;left:8px;right:8px;height:18px;z-index:12;cursor:ns-resize;touch-action:none}.ee-timeline-resize.top{top:0}.ee-timeline-resize.bottom{bottom:0}.ee-timeline-resize:hover{background:#1688e955;border-radius:5px}.ee-timeline-event{touch-action:pan-x pan-y;user-select:none;-webkit-user-select:none}.ee-timeline-move-hint{font-size:12px;color:#647d91;margin:0 0 8px}.ee-timeline-lane.is-drop-target{background-color:#eff8ff;outline:2px dashed #1688e9;outline-offset:-3px}.ee-timeline-move{align-self:flex-start;border:0;border-radius:5px;padding:2px 5px;font-size:10px;color:#0875c9;background:#fff;cursor:pointer;margin-top:auto}.ee-timeline-event{cursor:grab}.ee-timeline-event:active{cursor:grabbing}.ee-timeline-move-backdrop{position:fixed;inset:0;z-index:2147483500;background:#102c4280;display:grid;place-items:center;padding:16px}.ee-timeline-move-dialog{display:grid;gap:14px;background:white;padding:22px;border-radius:14px;width:min(400px,100%);box-shadow:0 20px 60px #102c4250}.ee-timeline-move-dialog h2{margin:0;font-size:20px}.ee-timeline-move-dialog p{margin:0;color:#647d91}.ee-timeline-move-dialog label{display:grid;gap:5px;font-weight:700;font-size:13px}.ee-timeline-move-dialog input{font:inherit;font-size:16px;padding:10px;border:1px solid #cbd8e6;border-radius:8px}.ee-timeline-move-dialog>div{display:flex;justify-content:flex-end;gap:8px}.ee-timeline-move-dialog button{border:1px solid #cbd8e6;border-radius:8px;background:white;padding:10px 14px;cursor:pointer}.ee-timeline-move-dialog button[type=submit],.ee-timeline-move-dialog button:last-child{background:#1688e9;color:white;border-color:#1688e9}.ee-timeline{margin-bottom:18px}.ee-timeline-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;padding:8px 10px;background:#fff;border:1px solid #dce5ee;border-radius:11px}.ee-timeline-tabs{display:flex;padding:4px;background:#e7eef6;border-radius:10px;gap:3px}.ee-timeline-tabs button{border:0;background:transparent;padding:9px 12px;border-radius:8px;color:#47657c;font-weight:750;cursor:pointer}.ee-timeline-tabs button.active{background:#fff;color:#0875c9;box-shadow:0 1px 3px #1232}.ee-timeline-toolbar label{display:flex;align-items:center;gap:8px;color:#4d687d;font-size:12px;font-weight:700;white-space:nowrap}.ee-timeline-toolbar select,.ee-timeline-day-picker select{padding:9px 12px;border:1px solid #d4e1ed;border-radius:9px;background:white;color:#17364b;font:inherit;min-width:150px}.ee-timeline-toolbar .ee-timeline-check{display:inline-flex;align-items:center;gap:5px;padding:0;white-space:nowrap;margin:0}.ee-timeline-check input{margin:0;width:16px;height:16px;flex:none}.ee-timeline-check input{accent-color:#1688e9}@media(max-width:760px){.ee-timeline-toolbar{gap:8px;padding:8px}.ee-timeline-toolbar label{white-space:normal}.ee-timeline-toolbar label:not(.ee-timeline-check){flex:1;min-width:0}.ee-timeline-toolbar label:not(.ee-timeline-check) select{flex:1;min-width:0;max-width:100%}.ee-timeline-toolbar .ee-timeline-check{flex:none;font-size:11px}.ee-timeline-tabs button{padding:8px 12px}}.ee-timeline-day-picker{display:flex;gap:8px;align-items:center;margin-bottom:12px}.ee-timeline-day-picker button{background:#fff;border:1px solid #d4e1ed;border-radius:8px;padding:7px 13px;color:#0875c9;font-size:22px;cursor:pointer}.ee-timeline-scroll{overflow-x:auto;overflow-y:clip;border:1px solid #dce5ee;border-radius:13px;background:white;max-height:none;height:auto;overscroll-behavior-x:contain}.ee-timeline-outside{font-size:12px;color:#865a1a;background:#fff7e8;border:1px solid #efdcb7;border-radius:8px;padding:9px 12px;margin:0 0 10px}.ee-timeline-grid{display:grid;width:100%;min-width:0}.ee-timeline-corner,.ee-timeline-day-header{position:sticky;top:0;z-index:5;background:#f4f8fc;border-bottom:1px solid #dce5ee;padding:10px;font-size:12px;font-weight:800;color:#17364b}.ee-timeline-corner{font-size:10px;color:#7a8fa0;left:0;z-index:9}.ee-timeline-day-header{border-left:1px solid #dce5ee;display:grid;gap:4px;min-width:0;overflow:hidden;padding:8px 4px;font-size:11px}.ee-timeline-day-header small{font-weight:500;color:#718397}.ee-timeline-day-header.today{background:#e8f3ff;color:#0875c9}.ee-timeline-hours{position:sticky;left:0;z-index:8;background:#f9fbfd;border-right:1px solid #dce5ee}.ee-timeline-hours span{position:absolute;right:7px;transform:translateY(-50%);font-size:10px;color:#718397}.ee-timeline-lane{position:relative;border-left:1px solid #e0e9f1;background-image:linear-gradient(to bottom,#e8edf3 1px,transparent 1px)}.ee-timeline-now{position:absolute;left:0;right:0;height:2px;background:#ec5a56;z-index:10;pointer-events:none}.ee-timeline-now span{position:absolute;right:0;top:-15px;font-size:10px;font-weight:800;color:#c83e39}.ee-timeline-event{min-width:0;position:absolute;z-index:2;cursor:pointer;background:#e8f3ff;border:1px solid #95c9f0;border-left:3px solid #1688e9;border-radius:8px;padding:4px;overflow:visible;box-sizing:border-box;display:flex;flex-direction:column} .ee-timeline-event:hover{z-index:3;border-color:#1688e9;box-shadow:0 3px 12px #164a7525}.ee-timeline-event>.ee-visit-preview-root{flex:1;min-height:0}.ee-timeline-event.conflict{background:#fff4e4;border-color:#d99034}.ee-timeline-event .ee-visit-preview-trigger{gap:3px}.ee-timeline-event .ee-visit-preview-title{font-size:11px}.ee-timeline-event .ee-dispatch-time{font-size:11px}.ee-timeline-event .ee-visit-preview-avatars{margin-top:1px}.ee-timeline-event .ee-visit-preview-avatar{width:21px;height:21px}.ee-timeline-caption{color:#72869b;font-size:12px;line-height:1.5;margin:10px 0 0}@media(max-width:760px){.ee-timeline-toolbar{align-items:stretch}.ee-timeline-toolbar label{flex:1;justify-content:space-between}.ee-timeline-tabs{width:100%}.ee-timeline-tabs button{flex:1} .ee-timeline-scroll{max-height:none}.ee-timeline-event .ee-visit-preview-title{font-size:12px}}

/* Compact schedule filters: retain touch targets while saving vertical space */
.ee-timeline-toolbar{border-radius:9px!important;min-height:38px!important;padding:3px 7px!important;margin-bottom:5px!important;gap:7px!important}.ee-timeline-tabs button{min-height:32px!important;padding:6px 10px!important}.ee-timeline-toolbar select{min-height:32px!important;padding:5px 9px!important}.ee-timeline-density button{min-height:30px;padding:5px 9px}.ee-timeline-toolbar .ee-timeline-staff-filter{gap:5px}.ee-timeline-help{margin:0 0 4px!important}

.ee-timeline-toolbar{gap:10px;margin-bottom:6px;padding:5px 9px;min-height:43px;border-radius:10px}
.ee-timeline-tabs{padding:2px;border-radius:8px}
.ee-timeline-tabs button{padding:7px 11px;min-height:34px}
.ee-timeline-toolbar select{padding:7px 10px;min-width:140px;min-height:34px}
.ee-timeline-toolbar .ee-timeline-check{gap:5px;font-size:12px}
.ee-timeline-help{margin:2px 0 6px}
@media(max-width:760px){
 .ee-timeline-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:5px 7px}
 .ee-timeline-tabs{width:auto;flex:0 0 auto}
 .ee-timeline-tabs button{flex:0 0 auto;padding:7px 10px}
 .ee-timeline-toolbar label:not(.ee-timeline-check){flex:1 1 120px;gap:4px}
 .ee-timeline-staff-filter>span{display:none}
 .ee-timeline-toolbar label:not(.ee-timeline-check) select{width:100%;min-width:0;padding:7px 5px}
 .ee-timeline-toolbar .ee-timeline-check{flex:0 0 auto;justify-content:flex-start;font-size:11px}
 .ee-timeline-day-picker{margin-bottom:6px}
}
  `}</style>
 </section>;
}
