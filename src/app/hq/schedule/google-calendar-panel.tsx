'use client';
import {useState} from 'react';
type Event={id:string;title:string;start:string;end:string;busy:boolean;url:string|null};
export default function GoogleCalendarPanel({connected,email,events,error,canManage}:{connected:boolean;email:string|null;events:Event[];error:boolean;canManage:boolean}){
 const [show,setShow]=useState(true);
 const fmt=(s:string)=>new Date(s).toLocaleString('en-AU',{timeZone:'Australia/Perth',weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
 return <section className="hq-panel" style={{padding:16,marginBottom:14}}>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
   <div><strong>Google Calendar · Neil&apos;s availability</strong><p style={{margin:'4px 0',fontSize:12,color:'#64748b'}}>{connected?'Connected: '+(email??'Google account')+' · Test connection':'No Google Calendar connected'}</p></div>
   <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
    {connected&&<label style={{fontSize:13,display:'flex',alignItems:'center',gap:6}}><input type="checkbox" checked={show} onChange={e=>setShow(e.target.checked)}/>Show external events</label>}
    {canManage&&(connected?<form action="/api/integrations/google-calendar/disconnect" method="post"><button type="submit" style={{padding:'8px 12px'}}>Disconnect</button></form>:<a href="/hq/google-calendar/connect" style={{padding:'9px 12px',background:'#1688e9',color:'white',borderRadius:8,textDecoration:'none'}}>Connect Google Calendar</a>)}
   </div>
  </div>
  {connected&&error&&<p role="alert" style={{color:'#b45309'}}>Google Calendar events could not be refreshed. Do not assume Neil is available until the connection is checked.</p>}
  {connected&&!error&&show&&<div style={{marginTop:10,display:'grid',gap:6}}>{events.length===0?<p style={{fontSize:13,color:'#64748b'}}>No external events this week.</p>:events.map(e=><div key={e.id} style={{borderLeft:'4px solid '+(e.busy?'#ef6469':'#94a3b8'),padding:'7px 10px',background:'#f8fafc',borderRadius:6,fontSize:13}}><strong>{e.title}</strong><span style={{marginLeft:8,color:'#475569'}}>{fmt(e.start)} – {fmt(e.end)} · {e.busy?'Neil unavailable':'Free'}</span>{e.url&&<a href={e.url} target="_blank" rel="noopener noreferrer" style={{marginLeft:8}}>Open in Google</a>}</div>)}</div>}
  {connected&&<p style={{fontSize:12,color:'#64748b',marginBottom:0}}>External events are read-only. Hiding them does not change Neil&apos;s availability. Automated appointment conflict enforcement is being added separately.</p>}
 </section>;
}
