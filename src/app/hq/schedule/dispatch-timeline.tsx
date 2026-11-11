'use client';
import {useMemo,useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {setScheduledVisitTimes} from './actions';
import VisitPreview from './visit-preview';

export type TimelineVisit={startIso:string;endIso:string;id:string;day:string;startMinutes:number;endMinutes:number;title:string;jobNumber:string;jobHref:string;time:string;customer:string;electricians:string[];staffIds:string[];address?:string|null;notes?:string|null;conflict?:string|null};
type Props={canEdit:boolean;visits:TimelineVisit[];days:{key:string;label:string}[];staff:{id:string;name:string}[];today:string;nowMinutes:number};
const START=6*60,END=18*60,HOUR_HEIGHT=64;
const palette=['#1676c4','#a34ecb','#0e9875','#d16a21','#d34876','#6b65c8','#138d9b','#7a8533'];
const staffColor=(id:string)=>{let h=0;for(const ch of id)h=(h*31+ch.charCodeAt(0))|0;return palette[Math.abs(h)%palette.length]};
const hourLabel=(h:number)=>`${h%12||12} ${h<12?'am':'pm'}`;
export default function DispatchTimeline({canEdit,visits,days,staff,today,nowMinutes}:Props){
 const router=useRouter();
 const [moving,setMoving]=useState<TimelineVisit|null>(null);
 const [moveDay,setMoveDay]=useState('');
 const [moveTime,setMoveTime]=useState('07:00');
 const [preview,setPreview]=useState<{id:string;day:string;start:number;end:number}|null>(null);
 const [overrides,setOverrides]=useState<Record<string,{day:string;start:number;end:number;startIso:string;endIso:string}>>({});
 const gesture=useRef<{id:string;kind:'move'|'start'|'end';day:string;start:number;end:number;anchorY:number;anchorMinute:number;originStart:number;originEnd:number;originDay:string;pointerId:number;active:boolean}|null>(null);
 const lanes=useRef<Record<string,HTMLDivElement|null>>({});
 const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
 const snap=(v:number)=>Math.round(v/15)*15;
 const toIso=(day:string,minutes:number)=>new Date(new Date(day+'T00:00:00+08:00').getTime()+minutes*60000).toISOString();
 const effective=visits.map(v=>{const o=overrides[v.id];return o?{...v,day:o.day,startMinutes:o.start,endMinutes:o.end,startIso:o.startIso,endIso:o.endIso,time:new Date(o.startIso).toLocaleTimeString('en-AU',{timeZone:'Australia/Perth',hour:'numeric',minute:'2-digit'})+' – '+new Date(o.endIso).toLocaleTimeString('en-AU',{timeZone:'Australia/Perth',hour:'numeric',minute:'2-digit'})}:v;});
 const format=(m:number)=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
 const beginGesture=(e:React.PointerEvent, v:TimelineVisit,kind:'move'|'start'|'end')=>{
  if(!canEdit||pending||e.button!==0||e.pointerType==='touch')return;
  e.preventDefault();e.stopPropagation();
  const lane=lanes.current[v.day];if(!lane)return;
  const rect=lane.getBoundingClientRect();
  gesture.current={id:v.id,kind,day:v.day,start:v.startMinutes,end:v.endMinutes,anchorY:e.clientY,anchorMinute:snap(START+(e.clientY-rect.top)/HOUR_HEIGHT*60),originStart:v.startMinutes,originEnd:v.endMinutes,originDay:v.day,pointerId:e.pointerId,active:false};
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
 };
 const moveGesture=(e:React.PointerEvent)=>{
  const g=gesture.current;if(!g||g.pointerId!==e.pointerId)return;
  if(Math.abs(e.clientY-g.anchorY)<4&&!g.active)return;
  g.active=true;
  const target=Object.entries(lanes.current).find(([,el])=>{if(!el)return false;const r=el.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<r.right})?.[0]??g.day;
  const lane=lanes.current[g.kind==='move'?target:g.originDay];if(!lane)return;
  const rect=lane.getBoundingClientRect();const minute=snap(START+(e.clientY-rect.top)/HOUR_HEIGHT*60);
  const duration=g.originEnd-g.originStart;
  let start=g.originStart,end=g.originEnd,day=g.originDay;
  if(g.kind==='move'){day=target;start=clamp(minute-(g.anchorMinute-g.originStart),START,END-duration);start=snap(start);end=start+duration;}
  else if(g.kind==='start')start=clamp(minute,START,g.originEnd-15);
  else end=clamp(minute,g.originStart+15,END);
  setPreview({id:g.id,day,start,end});
 };
 const endGesture=(e:React.PointerEvent)=>{
  const g=gesture.current;if(!g||g.pointerId!==e.pointerId)return;
  gesture.current=null;
  const p=preview;setPreview(null);
  if(!g.active||!p)return;
  const v=effective.find(x=>x.id===g.id);if(v)confirmTimes(v,p.day,p.start,p.end);
 };
 const [pending,startTransition]=useTransition();
 const beginMove=(v:TimelineVisit)=>{setMoving(v);setMoveDay(v.day);setMoveTime(String(Math.floor(v.startMinutes/60)).padStart(2,'0')+':'+String(v.startMinutes%60).padStart(2,'0'));};
 const confirmTimes=(v:TimelineVisit,day:string,start:number,end:number)=>{
  if(!canEdit||pending||end<=start)return;
  const nextStart=toIso(day,start),nextEnd=toIso(day,end);
  if(nextStart===v.startIso&&nextEnd===v.endIso)return;
  const overlaps=effective.filter(other=>other.id!==v.id&&v.staffIds.some(id=>other.staffIds.includes(id))&&new Date(other.startIso)<new Date(nextEnd)&&new Date(other.endIso)>new Date(nextStart));
  const warning=overlaps.length?'\n\nStaff conflict with: '+overlaps.map(x=>x.customer+' — '+x.title).join('; '):'';
  if(!window.confirm('Reschedule '+v.customer+' — '+v.title+' to '+day+' '+format(start)+'–'+format(end)+'?'+warning))return;
  const previous=overrides[v.id];
  setOverrides(old=>({...old,[v.id]:{day,start,end,startIso:nextStart,endIso:nextEnd}}));
  startTransition(async()=>{try{await setScheduledVisitTimes(v.id,nextStart,nextEnd,v.startIso);setMoving(null);router.refresh();}catch(e){setOverrides(old=>{const copy={...old};if(previous)copy[v.id]=previous;else delete copy[v.id];return copy;});window.alert(e instanceof Error?e.message:'Unable to reschedule visit.')}})
 };
 const [mode,setMode]=useState<'week'|'day'>('week');
 const [selected,setSelected]=useState(days.find(d=>d.key===today)?.key??days[0]?.key??'');
 const [staffId,setStaffId]=useState('all');
 const [showUnassigned,setShowUnassigned]=useState(true);
 const visible=effective.filter(v=>(staffId==='all'||(staffId==='unassigned'?v.staffIds.length===0:v.staffIds.includes(staffId)))&&(showUnassigned||v.staffIds.length>0));
 const shownDays=mode==='week'?days:days.filter(d=>d.key===selected);
 const minHeight=(END-START)/60*HOUR_HEIGHT;
 return <section className="ee-timeline">
  <div className="ee-timeline-toolbar"><div className="ee-timeline-tabs"><button type="button" className={mode==='week'?'active':''} onClick={()=>setMode('week')}>Week timeline</button><button type="button" className={mode==='day'?'active':''} onClick={()=>setMode('day')}>Day timeline</button></div><label>Electrician<select value={staffId} onChange={e=>setStaffId(e.target.value)}><option value="all">All electricians</option>{staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}<option value="unassigned">Unassigned</option></select></label><label className="ee-timeline-check"><input type="checkbox" checked={showUnassigned} onChange={e=>setShowUnassigned(e.target.checked)}/> Include unassigned</label></div>
  {mode==='day'&&<div className="ee-timeline-day-picker"><button type="button" onClick={()=>setSelected(days[Math.max(0,days.findIndex(d=>d.key===selected)-1)]?.key??selected)} aria-label="Previous day">‹</button><select value={selected} onChange={e=>setSelected(e.target.value)}>{days.map(d=><option value={d.key} key={d.key}>{d.label}</option>)}</select><button type="button" onClick={()=>setSelected(days[Math.min(days.length-1,days.findIndex(d=>d.key===selected)+1)]?.key??selected)} aria-label="Next day">›</button></div>}
  {visits.some(v=>v.startMinutes<START||v.endMinutes>END)&&<p className="ee-timeline-outside" role="status">Some appointments fall outside 6 am–6 pm. View their full times in By day or By electrician.</p>}
  {canEdit&&<p className="ee-timeline-move-hint">Drag an appointment to move it. Drag its top or bottom edge to resize it. Times snap to 15 minutes.</p>}
  <div className="ee-timeline-scroll"><div className="ee-timeline-grid" style={{gridTemplateColumns:`62px repeat(${shownDays.length},minmax(${mode==='day'?260:155}px,1fr))`}}>
   <div className="ee-timeline-corner">AWST</div>{shownDays.map(d=><div key={d.key} className={'ee-timeline-day-header'+(d.key===today?' today':'')}>{d.label}<small>{visible.filter(v=>v.day===d.key).length} visits</small></div>)}
   <div className="ee-timeline-hours" style={{height:minHeight}}>{Array.from({length:END/60-START/60+1},(_,i)=><span key={i} style={{top:i*HOUR_HEIGHT}}>{hourLabel(START/60+i)}</span>)}</div>
   {shownDays.map(d=><div className="ee-timeline-lane" key={d.key} ref={el=>{lanes.current[d.key]=el}} style={{height:minHeight,backgroundSize:`100% ${HOUR_HEIGHT}px`}}>
    {preview?.day===d.key&&<div className="ee-timeline-ghost" style={{top:(preview.start-START)/60*HOUR_HEIGHT+2,height:Math.max(22,(preview.end-preview.start)/60*HOUR_HEIGHT-4)}}><strong>{effective.find(v=>v.id===preview.id)?.customer}</strong><span>{format(preview.start)} – {format(preview.end)}</span></div>}
    {d.key===today&&nowMinutes>=START&&nowMinutes<=END&&<div className="ee-timeline-now" style={{top:(nowMinutes-START)/60*HOUR_HEIGHT}}><span>Now</span></div>}
    {visible.filter(v=>v.day===d.key).map(v=>{
     const start=Math.max(START,v.startMinutes),end=Math.min(END,v.endMinutes);
     if(end<=start)return null;
     const overlap=visible.filter(other=>other.id!==v.id&&other.day===v.day&&other.startMinutes<v.endMinutes&&other.endMinutes>v.startMinutes);
     const cluster=[v,...overlap].sort((a,b)=>a.startMinutes-b.startMinutes||a.id.localeCompare(b.id));
     const index=cluster.findIndex(x=>x.id===v.id),count=cluster.length;
     return <div className={'ee-timeline-event'+(v.conflict?' conflict':'')+(preview?.id===v.id?' is-dragging':'')} key={v.id} onPointerDown={e=>beginGesture(e,v,'move')} onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={()=>{gesture.current=null;setPreview(null)}} style={{top:(start-START)/60*HOUR_HEIGHT+2,height:Math.max(30,(end-start)/60*HOUR_HEIGHT-4),left:`calc(${index/count*100}% + 3px)`,width:`calc(${100/count}% - 6px)`,borderLeftColor:v.conflict?'#d99034':'#1688e9'}}>{canEdit&&<div className="ee-timeline-resize top" onPointerDown={e=>beginGesture(e,v,'start')} title="Drag to adjust start time"/>}<VisitPreview appointmentId={v.id} startIso={v.startIso} endIso={v.endIso} canEdit={canEdit} staff={staff} title={v.title} jobNumber={v.jobNumber} jobHref={v.jobHref} time={v.time} customer={v.customer} electricians={v.electricians} staffIds={v.staffIds} address={v.address} notes={v.notes} conflict={v.conflict}/>{canEdit&&<button type="button" className="ee-timeline-move" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();beginMove(v)}}>Move</button>}{canEdit&&<div className="ee-timeline-resize bottom" onPointerDown={e=>beginGesture(e,v,'end')} title="Drag to adjust end time"/>}</div>;
    })}
   </div>)}
  </div></div>

  {moving&&<div className="ee-timeline-move-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setMoving(null)}}><form className="ee-timeline-move-dialog" onSubmit={e=>{e.preventDefault();const [h,m]=moveTime.split(":").map(Number);confirmTimes(moving,moveDay,Math.round((h*60+m)/15)*15,Math.round((h*60+m)/15)*15+(moving.endMinutes-moving.startMinutes))}}><h2>Move appointment</h2><p>{moving.customer} — {moving.title}</p><label>Date<input type="date" required value={moveDay} onChange={e=>setMoveDay(e.target.value)}/></label><label>Start time<input type="time" required step={900} value={moveTime} onChange={e=>setMoveTime(e.target.value)}/></label><div><button type="button" onClick={()=>setMoving(null)}>Cancel</button><button type="submit" disabled={pending}>Confirm move</button></div></form></div>}
  <style jsx global>{`
  .ee-timeline-ghost{position:absolute;z-index:20;left:3px;right:3px;border:2px dashed #0875c9;border-radius:8px;background:#1688e955;pointer-events:none;display:flex;flex-direction:column;padding:8px;gap:4px;color:#07558c;font-size:12px;box-sizing:border-box;overflow:hidden}.ee-timeline-event.is-dragging{opacity:.25}.ee-timeline-resize{position:absolute;left:12px;right:12px;height:10px;z-index:12;cursor:ns-resize;touch-action:none}.ee-timeline-resize.top{top:-4px}.ee-timeline-resize.bottom{bottom:-4px}.ee-timeline-resize:hover{background:#1688e955;border-radius:5px}.ee-timeline-event{touch-action:pan-y}.ee-timeline-move-hint{font-size:12px;color:#647d91;margin:0 0 8px}.ee-timeline-lane.is-drop-target{background-color:#eff8ff;outline:2px dashed #1688e9;outline-offset:-3px}.ee-timeline-move{align-self:flex-start;border:0;border-radius:5px;padding:2px 5px;font-size:10px;color:#0875c9;background:#fff;cursor:pointer;margin-top:auto}.ee-timeline-event{cursor:grab}.ee-timeline-event:active{cursor:grabbing}.ee-timeline-move-backdrop{position:fixed;inset:0;z-index:2147483500;background:#102c4280;display:grid;place-items:center;padding:16px}.ee-timeline-move-dialog{display:grid;gap:14px;background:white;padding:22px;border-radius:14px;width:min(400px,100%);box-shadow:0 20px 60px #102c4250}.ee-timeline-move-dialog h2{margin:0;font-size:20px}.ee-timeline-move-dialog p{margin:0;color:#647d91}.ee-timeline-move-dialog label{display:grid;gap:5px;font-weight:700;font-size:13px}.ee-timeline-move-dialog input{font:inherit;font-size:16px;padding:10px;border:1px solid #cbd8e6;border-radius:8px}.ee-timeline-move-dialog>div{display:flex;justify-content:flex-end;gap:8px}.ee-timeline-move-dialog button{border:1px solid #cbd8e6;border-radius:8px;background:white;padding:10px 14px;cursor:pointer}.ee-timeline-move-dialog button[type=submit]{background:#1688e9;color:white;border-color:#1688e9}.ee-timeline{margin-bottom:18px}.ee-timeline-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;padding:8px 10px;background:#fff;border:1px solid #dce5ee;border-radius:11px}.ee-timeline-tabs{display:flex;padding:4px;background:#e7eef6;border-radius:10px;gap:3px}.ee-timeline-tabs button{border:0;background:transparent;padding:9px 12px;border-radius:8px;color:#47657c;font-weight:750;cursor:pointer}.ee-timeline-tabs button.active{background:#fff;color:#0875c9;box-shadow:0 1px 3px #1232}.ee-timeline-toolbar label{display:flex;align-items:center;gap:8px;color:#4d687d;font-size:12px;font-weight:700;white-space:nowrap}.ee-timeline-toolbar select,.ee-timeline-day-picker select{padding:9px 12px;border:1px solid #d4e1ed;border-radius:9px;background:white;color:#17364b;font:inherit;min-width:150px}.ee-timeline-toolbar .ee-timeline-check{display:flex;align-items:center;gap:6px;padding-bottom:0}.ee-timeline-check input{accent-color:#1688e9}.ee-timeline-day-picker{display:flex;gap:8px;align-items:center;margin-bottom:12px}.ee-timeline-day-picker button{background:#fff;border:1px solid #d4e1ed;border-radius:8px;padding:7px 13px;color:#0875c9;font-size:22px;cursor:pointer}.ee-timeline-scroll{overflow-x:auto;overflow-y:hidden;border:1px solid #dce5ee;border-radius:13px;background:white;max-height:none;height:auto;overscroll-behavior-x:contain}.ee-timeline-outside{font-size:12px;color:#865a1a;background:#fff7e8;border:1px solid #efdcb7;border-radius:8px;padding:9px 12px;margin:0 0 10px}.ee-timeline-grid{display:grid;min-width:max-content}.ee-timeline-corner,.ee-timeline-day-header{position:sticky;top:0;z-index:5;background:#f4f8fc;border-bottom:1px solid #dce5ee;padding:10px;font-size:12px;font-weight:800;color:#17364b}.ee-timeline-corner{font-size:10px;color:#7a8fa0;left:0;z-index:9}.ee-timeline-day-header{border-left:1px solid #dce5ee;display:grid;gap:4px}.ee-timeline-day-header small{font-weight:500;color:#718397}.ee-timeline-day-header.today{background:#e8f3ff;color:#0875c9}.ee-timeline-hours{position:sticky;left:0;z-index:8;background:#f9fbfd;border-right:1px solid #dce5ee}.ee-timeline-hours span{position:absolute;right:7px;transform:translateY(-50%);font-size:10px;color:#718397}.ee-timeline-lane{position:relative;border-left:1px solid #e0e9f1;background-image:linear-gradient(to bottom,#e8edf3 1px,transparent 1px)}.ee-timeline-now{position:absolute;left:0;right:0;height:2px;background:#ec5a56;z-index:10;pointer-events:none}.ee-timeline-now span{position:absolute;right:0;top:-15px;font-size:10px;font-weight:800;color:#c83e39}.ee-timeline-event{position:absolute;z-index:2;cursor:pointer;background:#e8f3ff;border:1px solid #95c9f0;border-left:3px solid #1688e9;border-radius:8px;padding:6px;overflow:visible;box-sizing:border-box;display:flex;flex-direction:column} .ee-timeline-event:hover{z-index:3;border-color:#1688e9;box-shadow:0 3px 12px #164a7525}.ee-timeline-event>.ee-visit-preview-root{flex:1}.ee-timeline-event.conflict{background:#fff4e4;border-color:#d99034}.ee-timeline-event .ee-visit-preview-trigger{gap:3px}.ee-timeline-event .ee-visit-preview-title{font-size:12px}.ee-timeline-event .ee-dispatch-time{font-size:11px}.ee-timeline-event .ee-visit-preview-avatars{margin-top:1px}.ee-timeline-event .ee-visit-preview-avatar{width:21px;height:21px}.ee-timeline-caption{color:#72869b;font-size:12px;line-height:1.5;margin:10px 0 0}@media(max-width:760px){.ee-timeline-toolbar{align-items:stretch}.ee-timeline-toolbar label{flex:1;justify-content:space-between}.ee-timeline-tabs{width:100%}.ee-timeline-tabs button{flex:1} .ee-timeline-scroll{max-height:none}.ee-timeline-event .ee-visit-preview-title{font-size:12px}}
  `}</style>
 </section>;
}
