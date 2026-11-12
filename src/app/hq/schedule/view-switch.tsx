'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {GoogleCalendarContext,type GoogleEvent} from './google-calendar-context';
export default function DispatchViews({initialView,week,weekNavigation,dayBoard,teamBoard,timelineBoard,createAction,google}:{initialView:'week'|'team'|'timeline';week:string;weekNavigation?:React.ReactNode;dayBoard:React.ReactNode;teamBoard:React.ReactNode;timelineBoard:React.ReactNode;createAction?:React.ReactNode;google?:{connected:boolean;email:string|null;events:GoogleEvent[];error:boolean;canManage:boolean}}){
 const [view,setView]=useState(initialView);
 const [showGoogle,setShowGoogle]=useState(true);
 const [events,setEvents]=useState<GoogleEvent[]>(google?.events??[]);
 const [refreshError,setRefreshError]=useState(google?.error??false);
 const inFlight=useRef(false);
 const refresh=useCallback(async()=>{
  if(!google?.connected||inFlight.current||typeof document==='undefined'||document.visibilityState==='hidden')return;
  inFlight.current=true;
  try{
   const start=new Date(week+'T00:00:00+08:00');
   if(Number.isNaN(start.getTime()))throw new Error('Invalid week');
   const end=new Date(start.getTime()+7*86400000);
   const res=await fetch('/api/integrations/google-calendar/events?'+new URLSearchParams({start:start.toISOString(),end:end.toISOString()}),{cache:'no-store',credentials:'same-origin'});
   if(!res.ok)throw new Error('Calendar refresh failed');
   const data=await res.json() as {events:GoogleEvent[];updatedAt:string};
   if(!Array.isArray(data.events))throw new Error('Invalid events');
   setEvents(data.events);setRefreshError(false);
  }catch{setRefreshError(true);}
  finally{inFlight.current=false;}
 },[google?.connected,week]);
 useEffect(()=>{
  setEvents(google?.events??[]);setRefreshError(google?.error??false);
 },[google?.events,google?.error,week]);
 useEffect(()=>{
  if(!google?.connected)return;
  const onFocus=()=>{if(document.visibilityState==='visible')void refresh();};
  const onVisibility=()=>{if(document.visibilityState==='visible')void refresh();};
  const interval=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},30000);
  window.addEventListener('focus',onFocus);
  document.addEventListener('visibilitychange',onVisibility);
  return()=>{window.clearInterval(interval);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onVisibility);};
 },[google?.connected,refresh]);
 const change=(next:'week'|'team'|'timeline')=>{
  setView(next);
  const url=new URL(window.location.href);
  url.searchParams.set('view',next);
  url.searchParams.set('week',week);
  window.history.replaceState(window.history.state,'',url.toString());
 };
 return <GoogleCalendarContext.Provider value={{show:showGoogle&&!!google?.connected,events}}>
  <nav className="ee-dispatch-view-switch" aria-label="Schedule layout"><button type="button" aria-pressed={view==='week'} className={view==='week'?'is-active':''} onClick={()=>change('week')}>By day</button><button type="button" aria-pressed={view==='team'} className={view==='team'?'is-active':''} onClick={()=>change('team')}>By electrician</button><button type="button" aria-pressed={view==='timeline'} className={view==='timeline'?'is-active':''} onClick={()=>change('timeline')}>Time grid</button><div id="ee-dispatch-timeline-controls" className="ee-dispatch-timeline-controls" hidden={view!=='timeline'}/>{weekNavigation&&<div className="ee-dispatch-top-week">{weekNavigation}</div>}{createAction}{google&&<div className="ee-dispatch-google-visible"><button type="button" className={"ee-google-visibility"+(showGoogle&&google.connected?" is-on":"")} aria-pressed={showGoogle&&google.connected} disabled={!google.connected} onClick={()=>setShowGoogle(v=>!v)} aria-label={showGoogle&&google.connected?"Hide Google Calendar events":"Show Google Calendar events"} title={google.connected?(showGoogle?"Hide Google Calendar events":"Show Google Calendar events"):"Google Calendar not connected"}><span className="ee-google-g">G</span></button></div>}</nav>
  <div hidden={view!=='week'}>{dayBoard}</div><div hidden={view!=='team'}>{teamBoard}</div><div hidden={view!=='timeline'}>{timelineBoard}</div>
 </GoogleCalendarContext.Provider>;
}
