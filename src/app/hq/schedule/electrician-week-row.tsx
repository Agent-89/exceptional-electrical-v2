'use client';
import {useState} from 'react';
export default function ElectricianWeekRow({name,count,children}:{name:string;count:number;children:React.ReactNode}){
 const [expanded,setExpanded]=useState(true);
 return <div className={'ee-dispatch-team-row'+(expanded?'':' ee-team-collapsed')}>
  <header><div className="ee-team-row-label"><strong>{name}</strong><span>{count} {count===1?'visit':'visits'}</span></div><button type="button" className="ee-team-collapse-toggle" aria-expanded={expanded} aria-label={(expanded?'Collapse ':'Expand ')+name+' appointments'} onClick={()=>setExpanded(v=>!v)}><span>{expanded?'Collapse':'Expand'}</span><span aria-hidden="true">{expanded?'⌃':'⌄'}</span></button></header>
  <div className="ee-dispatch-team-days">{children}</div>
  <style jsx global>{`
.ee-team-row-label{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ee-team-collapse-toggle{display:none}
@media(max-width:999px){
.ee-dispatch-team-row>header{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px}
.ee-team-collapse-toggle{display:inline-flex;align-items:center;gap:7px;min-height:36px;padding:7px 11px;border:1px solid #d3e2ef;border-radius:8px;background:#fff;color:#176ba7;font-weight:700;cursor:pointer}
.ee-dispatch-team-row.ee-team-collapsed>.ee-dispatch-team-days{display:none!important}
}
`}</style>
 </div>;
}