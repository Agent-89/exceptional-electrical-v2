'use client';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import Link from 'next/link';

type Props={title:string;jobNumber:string;jobHref:string;time:string;customer:string;electricians:string[];staffIds?:string[];address?:string|null;notes?:string|null;conflict?:string|null};

export default function VisitPreview({title,jobNumber,jobHref,time,customer,electricians,staffIds=[],address,notes,conflict}:Props){
 const [open,setOpen]=useState(false);
 const [hover,setHover]=useState(false);
 const [hoverPosition,setHoverPosition]=useState({top:0,left:0});
 const positionHover=()=>{const r=trigger.current?.getBoundingClientRect();if(!r)return;const width=Math.min(290,window.innerWidth-24);const height=195;setHoverPosition({left:Math.max(12,Math.min(r.left,window.innerWidth-width-12)),top:r.bottom+height+10>window.innerHeight?Math.max(12,r.top-height-8):r.bottom+8});};
 const trigger=useRef<HTMLButtonElement>(null);
 const [mounted,setMounted]=useState(false);
 useEffect(()=>setMounted(true),[]);
 useEffect(()=>{if(!open)return;const old=document.body.style.overflow;document.body.style.overflow='hidden';return ()=>{document.body.style.overflow=old}},[open]);
 useEffect(()=>{
  if(!open)return;
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)};
  window.addEventListener('keydown',onKey);
  return ()=>window.removeEventListener('keydown',onKey);
 },[open]);
 const palette=['#1676c4','#a34ecb','#0e9875','#d16a21','#d34876','#6b65c8','#138d9b','#7a8533'];
 const staffColor=(i:number)=>{const id=staffIds[i]??electricians[i]??'';let hash=0;for(const ch of id)hash=(hash*31+ch.charCodeAt(0))|0;return palette[Math.abs(hash)%palette.length]};
 const initials=(name:string)=>name.trim().split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase();
 return <div className="ee-visit-preview-root" onMouseEnter={()=>{positionHover();setHover(true)}} onMouseLeave={()=>setHover(false)}>
  <button ref={trigger} type="button" className="ee-visit-preview-trigger" aria-label={`View visit details: ${title}, ${time}`} onClick={()=>{setHover(false);setOpen(true)}}>
   <span className="ee-dispatch-time">{time}</span>
   <strong className="ee-visit-preview-title">{title}</strong>
   <span className="ee-visit-preview-number">{jobNumber}</span>
   <span className="ee-visit-preview-avatars">{electricians.length?electricians.slice(0,4).map((name,i)=><span className="ee-visit-preview-avatar" style={{backgroundColor:staffColor(i),color:"#fff"}} title={name} key={i}>{initials(name)}</span>):<span className="ee-visit-preview-empty">Unassigned</span>}{electricians.length>4&&<span className="ee-visit-preview-avatar">+{electricians.length-4}</span>}</span>
  </button>
  {hover&&!open&&mounted&&createPortal(<div className="ee-visit-hover" role="tooltip" style={{top:hoverPosition.top,left:hoverPosition.left}}><strong>{title}</strong><span>{time}</span><span>Customer: {customer}</span><span>Electricians: {electricians.join(', ')||'Unassigned'}</span>{address&&<span>{address}</span>}<span className="ee-visit-hover-hint">Click for appointment details</span></div>,document.body)}
  {open&&mounted&&createPortal(<div className="ee-visit-modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false)}}>
   <section className="ee-visit-modal" role="dialog" aria-modal="true" aria-label={`Appointment details: ${title}`}>
    <header><div><small>APPOINTMENT · {jobNumber}</small><h2>{title}</h2></div><button type="button" className="ee-visit-close" aria-label="Close appointment details" onClick={()=>{setOpen(false);trigger.current?.focus()}}>×</button></header>
    <div className="ee-visit-modal-body"><div><small>TIME</small><strong>{time}</strong></div><div><small>CUSTOMER</small><strong>{customer}</strong></div><div><small>ELECTRICIANS</small><div className="ee-visit-modal-crew">{electricians.length?electricians.map((name,i)=><span key={i}><b style={{backgroundColor:staffColor(i),color:"#fff"}}>{initials(name)}</b>{name}</span>):'Unassigned'}</div></div>{address&&<div><small>WORKSITE</small><span>{address}</span></div>}{notes&&<div><small>INSTRUCTIONS</small><span>{notes}</span></div>}{conflict&&<div className="ee-visit-modal-warning"><small>CONFLICT</small><span>{conflict}</span></div>}</div>
    <footer><Link href={jobHref}>Open job details</Link><button type="button" onClick={()=>{setOpen(false);trigger.current?.focus()}}>Back to schedule</button></footer>
   </section>
  </div>,document.body)}
  <style jsx global>{`
   .ee-visit-preview-root{position:relative;min-width:0;height:100%;display:flex;flex-direction:column}
   .ee-visit-preview-trigger{display:grid;gap:5px;text-align:left;border:0;padding:0;background:transparent;width:100%;height:100%;min-height:100%;flex:1;cursor:pointer;color:#17364b;font:inherit;overflow-wrap:anywhere;align-content:start}
   .ee-visit-preview-trigger:hover .ee-visit-preview-title{color:#0875c9}
   .ee-visit-preview-trigger:focus-visible{outline:2px solid #1688e9;outline-offset:3px;border-radius:3px}
   .ee-visit-preview-title{font-size:13px;line-height:1.3}
   .ee-visit-preview-number{font-size:11px;color:#73889b}
   .ee-visit-preview-avatars{display:flex;align-items:center;gap:3px;margin-top:3px}
   .ee-visit-preview-avatar{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:#e4f0fc;color:#185d90;border:1px solid #fff;font-size:10px;font-weight:800}
   .ee-visit-preview-empty{font-size:11px;color:#64798a}
   .ee-visit-hover{position:fixed;z-index:2147482000;width:min(290px,calc(100vw - 24px));background:white;border:1px solid #d0dfe9;border-radius:12px;box-shadow:0 14px 36px #153c5b30;padding:13px;display:grid;gap:7px;font-size:12px;color:#4d6477;pointer-events:none}
   .ee-visit-hover strong{font-size:14px;color:#17364b}.ee-visit-hover-hint{color:#0875c9;font-weight:700}
   .ee-visit-modal-backdrop{position:fixed;inset:0;z-index:2147483000;background:#102c4280;display:grid;place-items:center;padding:20px}
   .ee-visit-modal{width:min(460px,100%);max-height:min(85dvh,750px);overflow:auto;background:white;border-radius:18px;box-shadow:0 24px 65px #102c4250;color:#17364b}
   .ee-visit-modal header{display:flex;align-items:flex-start;justify-content:space-between;padding:20px 22px;border-bottom:1px solid #e1eaf2;gap:12px}
   .ee-visit-modal header small,.ee-visit-modal-body small{font-size:10px;letter-spacing:.09em;color:#6b8498;font-weight:800}
   .ee-visit-modal h2{margin:7px 0 0;font-size:22px;line-height:1.2}
   .ee-visit-close{border:0;background:#eef4fa;border-radius:9px;width:36px;height:36px;cursor:pointer;font-size:26px;color:#34576f;flex:none}
   .ee-visit-modal-body{display:grid;gap:18px;padding:22px}
   .ee-visit-modal-body>div{display:grid;gap:6px}.ee-visit-modal-body strong{font-size:15px}
   .ee-visit-modal-crew{display:flex;flex-wrap:wrap;gap:8px}.ee-visit-modal-crew>span{display:flex;align-items:center;gap:7px;background:#f1f7fc;padding:6px 10px 6px 6px;border-radius:30px;font-size:12px}.ee-visit-modal-crew b{display:grid;place-items:center;background:#d8ebfc;color:#176aa8;border-radius:50%;width:27px;height:27px;font-size:10px}
   .ee-visit-modal-warning{background:#fff7e8;padding:12px;border-radius:9px;color:#97571c}
   .ee-visit-modal footer{display:flex;gap:10px;flex-wrap:wrap;padding:16px 22px 22px;border-top:1px solid #e1eaf2}
   .ee-visit-modal footer a,.ee-visit-modal footer button{padding:11px 14px;border-radius:9px;font-size:13px;font-weight:750;text-decoration:none;cursor:pointer}
   .ee-visit-modal footer a{background:#1688e9;color:white}.ee-visit-modal footer button{border:1px solid #d4e1ed;background:white;color:#34576f}
   @media(hover:none){.ee-visit-hover{display:none}}
   @media(max-width:760px){.ee-visit-preview-title{font-size:16px}.ee-visit-preview-number{font-size:13px}.ee-visit-modal-backdrop{align-items:end;padding:0}.ee-visit-modal{width:100%;max-height:88dvh;border-radius:18px 18px 0 0}}
  `}</style>
 </div>;
}
