'use client';
import {useState} from 'react';
import GoogleCalendarControl from './google-calendar-control';
import {GoogleCalendarContext,type GoogleEvent} from './google-calendar-context';
export default function DispatchViews({initialView,week,dayBoard,teamBoard,timelineBoard,createAction,google}:{initialView:'week'|'team'|'timeline';week:string;dayBoard:React.ReactNode;teamBoard:React.ReactNode;timelineBoard:React.ReactNode;createAction?:React.ReactNode;google?:{connected:boolean;email:string|null;events:GoogleEvent[];error:boolean;canManage:boolean}}){
 const [view,setView]=useState(initialView);
 const [showGoogle,setShowGoogle]=useState(true);
 const change=(next:'week'|'team'|'timeline')=>{
  setView(next);
  const url=new URL(window.location.href);
  url.searchParams.set('view',next);
  url.searchParams.set('week',week);
  window.history.replaceState(window.history.state,'',url.toString());
 };
 return <GoogleCalendarContext.Provider value={{show:showGoogle&&!!google?.connected,events:google?.events??[]}}>
  <nav className="ee-dispatch-view-switch" aria-label="Schedule layout"><button type="button" aria-pressed={view==='week'} className={view==='week'?'is-active':''} onClick={()=>change('week')}>By day</button><button type="button" aria-pressed={view==='team'} className={view==='team'?'is-active':''} onClick={()=>change('team')}>By electrician</button><button type="button" aria-pressed={view==='timeline'} className={view==='timeline'?'is-active':''} onClick={()=>change('timeline')}>Time grid</button>{createAction}{google&&<GoogleCalendarControl connected={google.connected} email={google.email} error={google.error} canManage={google.canManage} show={showGoogle} onToggle={()=>setShowGoogle(v=>!v)}/>}</nav>
  <div hidden={view!=='week'}>{dayBoard}</div><div hidden={view!=='team'}>{teamBoard}</div><div hidden={view!=='timeline'}>{timelineBoard}</div>
 </GoogleCalendarContext.Provider>;
}
