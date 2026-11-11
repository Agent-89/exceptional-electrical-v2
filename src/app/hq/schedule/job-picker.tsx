'use client';
import {useMemo,useState} from 'react';
type JobOption={id:string;label:string};
export default function JobPicker({jobs}:{jobs:JobOption[]}){
 const [query,setQuery]=useState('');
 const [selected,setSelected]=useState('');
 const [open,setOpen]=useState(false);
 const matches=useMemo(()=>jobs.filter(j=>j.label.toLowerCase().includes(query.toLowerCase())).slice(0,40),[jobs,query]);
 const chosen=jobs.find(j=>j.id===selected);
 return <div className="ee-job-picker">
  <label htmlFor="ee-job-search">Job</label>
  <input id="ee-job-search" type="search" autoComplete="off" value={open?query:(chosen?.label??query)} placeholder="Search job number, customer, title or address" onFocus={()=>{setOpen(true);setQuery('')}} onChange={e=>{setQuery(e.target.value);setSelected('');setOpen(true)}} aria-expanded={open} aria-controls="ee-job-options" required={!selected}/>
  <input type="hidden" name="job_id" value={selected}/>
  {open&&<div id="ee-job-options" className="ee-job-picker-options" role="listbox">{matches.map(j=><button type="button" role="option" aria-selected={selected===j.id} key={j.id} onClick={()=>{setSelected(j.id);setQuery(j.label);setOpen(false)}}>{j.label}</button>)}{matches.length===0&&<p>No matching active jobs</p>}</div>}
  {open&&<button className="ee-job-picker-dismiss" type="button" onClick={()=>setOpen(false)}>Close results</button>}
  <style jsx>{`.ee-job-picker{position:relative;display:grid;gap:6px}.ee-job-picker>label{font-size:12px;font-weight:750}.ee-job-picker>input[type=search]{width:100%;border:1px solid #cbd8e6;border-radius:9px;padding:12px;background:#fff;color:#17364b;font:inherit;font-size:15px}.ee-job-picker-options{position:absolute;top:100%;left:0;right:0;z-index:35;background:#fff;border:1px solid #cbd8e6;border-radius:10px;box-shadow:0 12px 25px #1233;max-height:260px;overflow:auto}.ee-job-picker-options button{display:block;width:100%;text-align:left;background:#fff;border:0;border-bottom:1px solid #eef2f6;padding:11px;color:#17364b;cursor:pointer}.ee-job-picker-options button:hover,.ee-job-picker-options button:focus{background:#e8f3ff}.ee-job-picker-options p{padding:10px;font-size:13px}.ee-job-picker-dismiss{justify-self:start;background:none;border:0;color:#0875c9;cursor:pointer;font-size:12px}`}</style>
 </div>;
}
