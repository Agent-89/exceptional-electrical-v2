'use client';
import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {useGoogleCalendar} from './google-calendar-context';
import VisitPreview from './visit-preview';
import type {TimelineVisit} from './dispatch-timeline';

type Props={canEdit:boolean;visits:TimelineVisit[];days:{key:string;label:string}[];staff:{id:string;name:string}[];today:string;weekBoard:React.ReactNode};
const START=6*60,END=20*60,WIDTH=90;
const palette=['#1676c4','#a34ecb','#0e9875','#d16a21','#d34876','#6b65c8','#138d9b','#7a8533'];
const color=(id:string)=>{let h=0;for(const ch of id)h=(h*31+ch.charCodeAt(0))|0;return palette[Math.abs(h)%palette.length]};
export default function ElectricianDay({canEdit,visits,days,staff,today,weekBoard}:Props){
 const [selected,setSelected]=useState(days.find(d=>d.key===today)?.key??days[0]?.key??'');
 const [mode,setMode]=useState<'week'|'day'>('week');
 const {show:showGoogle,events:googleEvents}=useGoogleCalendar();
 const [desktopSlot,setDesktopSlot]=useState<HTMLElement|null>(null);
 useEffect(()=>{const media=window.matchMedia('(min-width:1000px)');const update=()=>setDesktopSlot(media.matches?document.getElementById('ee-dispatch-team-controls'):null);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 const index=days.findIndex(d=>d.key===selected);
 const entries=visits.filter(v=>v.day===selected);
 const groups=[...staff.map(s=>({id:s.id,name:s.name})),{id:'unassigned',name:'Unassigned'}];
 const controls=<div className="ee-electrician-controls"><div className="ee-timeline-tabs"><button type="button" className={mode==='week'?'active':''} onClick={()=>setMode('week')}>Week</button><button type="button" className={mode==='day'?'active':''} onClick={()=>setMode('day')}>Day</button></div>{mode==='day'&&<div className="ee-electrician-nav"><button type="button" disabled={index<=0} onClick={()=>setSelected(days[index-1].key)} aria-label="Previous day">‹</button><select value={selected} onChange={e=>setSelected(e.target.value)} aria-label="Selected day">{days.map(d=><option key={d.key} value={d.key}>{d.label}</option>)}</select><button type="button" disabled={index>=days.length-1} onClick={()=>setSelected(days[index+1].key)} aria-label="Next day">›</button><button type="button" onClick={()=>setSelected(days.find(d=>d.key===today)?.key??days[0].key)}>Today</button></div>}</div>
  {mode==='week'?<>{weekBoard}</>:<div className="ee-electrician-scroll"><div className="ee-electrician-chart">
   <div className="ee-electrician-chart-head"><strong>Electrician</strong><div className="ee-electrician-ruler">{Array.from({length:END/60-START/60+1},(_,i)=><span key={i} style={{left:(i/(END/60-START/60))*100+'%'}}>{(START/60+i)%12||12}{START/60+i<12?'am':'pm'}</span>)}</div></div>
   {groups.map(g=>{const matches=entries.filter(v=>g.id==='unassigned'?v.staffIds.length===0:v.staffIds.includes(g.id));return <div className="ee-electrician-resource" key={g.id}><div className="ee-electrician-name">{g.id!=='unassigned'&&<span style={{background:color(g.id)}}>{g.name.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()}</span>}<strong>{g.name}</strong></div><div className="ee-electrician-lane">{showGoogle&&g.name.toLowerCase().includes('neil')&&googleEvents.filter(e=>new Date(e.start).getTime()<new Date(selected+'T00:00:00+08:00').getTime()+86400000&&new Date(e.end).getTime()>new Date(selected+'T00:00:00+08:00').getTime()).map(e=>{const base=new Date(selected+'T00:00:00+08:00').getTime();const start=Math.max(START,(new Date(e.start).getTime()-base)/60000),end=Math.min(END,(new Date(e.end).getTime()-base)/60000);return end>start?<div key={'google-'+e.id} className="ee-electrician-event ee-electrician-google" title={'Neil · '+e.title} style={{left:((start-START)/(END-START))*100+'%',width:Math.max(2,((end-start)/(END-START))*100)+'%'}}><strong>{e.title||'Google event'}</strong></div>:null})}{matches.map(v=>{const start=Math.max(START,v.startMinutes),end=Math.min(END,v.endMinutes);if(end<=start)return null;return <div className={'ee-electrician-event'+(v.conflict?' conflict':'')} key={v.id} style={{left:((start-START)/(END-START))*100+'%',width:Math.max(2,((end-start)/(END-START))*100)+'%',borderTopColor:v.conflict?'#d99034':'#1688e9'}}><VisitPreview appointmentId={v.id} startIso={v.startIso} endIso={v.endIso} canEdit={canEdit} staff={staff} title={v.title} jobNumber={v.jobNumber} jobHref={v.jobHref} time={v.time} customer={v.customer} electricians={v.electricians} staffIds={v.staffIds} address={v.address} notes={v.notes} conflict={v.conflict}/></div>})}</div></div>})}
  </div></div>}
  <style jsx global>{`
   .ee-electrician-controls{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:12px}.ee-electrician-nav{display:flex;align-items:center;gap:6px}.ee-electrician-nav button,.ee-electrician-nav select{border:1px solid #d4e1ed;border-radius:8px;background:#fff;color:#176ba7;padding:8px;cursor:pointer}.ee-electrician-nav button:disabled{opacity:.4;cursor:default}.ee-electrician-scroll{overflow:auto;border:1px solid #dce5ee;border-radius:12px;background:#fff}.ee-electrician-chart{min-width:950px}.ee-electrician-chart-head,.ee-electrician-resource{display:grid;grid-template-columns:175px minmax(0,1fr)}.ee-electrician-chart-head{position:sticky;top:0;z-index:5;background:#f4f8fc;border-bottom:1px solid #dce5ee;padding:12px 0}.ee-electrician-chart-head>strong{padding-left:14px;font-size:12px}.ee-electrician-ruler{position:relative;margin:0 18px;height:20px}.ee-electrician-ruler span{position:absolute;transform:translateX(-50%);font-size:10px;color:#647d91}.ee-electrician-resource{min-height:84px;border-bottom:1px solid #e3ebf2}.ee-electrician-name{display:flex;align-items:center;gap:8px;padding:12px;font-size:12px;background:#f8fbfd;border-right:1px solid #e3ebf2}.ee-electrician-name span{display:grid;place-items:center;width:29px;height:29px;flex:none;border-radius:50%;color:white;font-size:10px;font-weight:800}.ee-electrician-lane{position:relative;margin:0 18px;background:repeating-linear-gradient(to right,#e7edf4 0 1px,transparent 1px calc(100% / 14));min-height:84px}.ee-electrician-event{position:absolute;top:9px;height:65px;border:1px solid #b9d6eb;border-top:4px solid #1688e9;border-radius:7px;background:#e8f3ff;box-sizing:border-box;padding:5px;min-width:24px;overflow:visible}.ee-electrician-event.conflict{background:#fff4e4;border-color:#d99034}.ee-electrician-event .ee-visit-preview-trigger{gap:2px;overflow:hidden}.ee-electrician-event .ee-visit-preview-number,.ee-electrician-event .ee-visit-preview-avatars{display:none}.ee-electrician-event .ee-visit-preview-title{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ee-electrician-event .ee-dispatch-time{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}@media(max-width:760px){.ee-electrician-chart{min-width:820px}.ee-electrician-chart-head,.ee-electrician-resource{grid-template-columns:130px minmax(0,1fr)}}

/* Keep electrician identity visible while panning the resource timeline */
.ee-electrician-chart-head>strong{position:sticky;left:0;z-index:9;background:#f4f8fc;display:flex;align-items:center}
.ee-electrician-name{position:sticky;left:0;z-index:8;min-width:0;box-shadow:2px 0 4px #153c5b12}
.ee-electrician-chart-head{z-index:10}
@media(max-width:760px){.ee-electrician-name{padding:9px 7px!important;gap:5px!important}.ee-electrician-name strong{overflow-wrap:anywhere;font-size:11px}}
.ee-electrician-google{background:#ffe7e9!important;border:1px solid #e46c76!important;border-top:4px solid #e46c76!important;color:#81313a!important;z-index:1;overflow:hidden!important;font-size:11px}
@media(min-width:1000px){#ee-dispatch-team-controls .ee-electrician-controls{margin:0!important;display:flex!important;align-items:center!important;gap:8px!important}#ee-dispatch-team-controls .ee-electrician-nav{margin:0!important}}
  @media(max-width:760px){
.ee-electrician-controls{display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:8px!important}
.ee-electrician-controls>.ee-timeline-tabs{align-self:flex-start}
.ee-electrician-controls .ee-electrician-nav{display:grid!important;grid-template-columns:38px minmax(0,1fr) 38px auto!important;width:100%!important;box-sizing:border-box;gap:5px!important;align-items:center}
.ee-electrician-controls .ee-electrician-nav select{width:100%!important;min-width:0!important;height:40px!important;box-sizing:border-box}
.ee-electrician-controls .ee-electrician-nav button{min-width:0!important;height:40px!important;padding:5px 8px!important}
.ee-electrician-controls .ee-electrician-nav button:last-child{white-space:nowrap}
}
  `}</style>
 </section>;
}
