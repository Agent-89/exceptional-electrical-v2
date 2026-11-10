'use client';
import {useState} from 'react';
export default function DispatchViews({initialView,week,dayBoard,teamBoard}:{initialView:'week'|'team';week:string;dayBoard:React.ReactNode;teamBoard:React.ReactNode}){
 const [view,setView]=useState(initialView);
 const change=(next:'week'|'team')=>{
  setView(next);
  const url=new URL(window.location.href);
  url.searchParams.set('view',next);
  url.searchParams.set('week',week);
  window.history.replaceState(window.history.state,'',url.toString());
 };
 return <>
  <nav className="ee-dispatch-view-switch" aria-label="Schedule layout"><button type="button" aria-pressed={view==='week'} className={view==='week'?'is-active':''} onClick={()=>change('week')}>By day</button><button type="button" aria-pressed={view==='team'} className={view==='team'?'is-active':''} onClick={()=>change('team')}>By electrician</button></nav>
  <div hidden={view!=='week'}>{dayBoard}</div><div hidden={view!=='team'}>{teamBoard}</div>
 </>;
}
