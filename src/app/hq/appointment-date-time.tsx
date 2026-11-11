'use client';
import {useEffect,useRef,useState} from 'react';

type Props={name:string;label:string;defaultValue?:string;linkedDate?:string;onDateChange?:(date:string)=>void;hideDate?:boolean;compactDate?:boolean};
const parseTime=(value:string)=>{
 const s=value.trim().toLowerCase().replace(/\s+/g,'');
 const m=s.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm)?$/);
 if(!m)return null;
 let h=Number(m[1]);const minute=m[2]===undefined?0:Number(m[2]);
 if(minute>59||h>23||(m[3]&&(h<1||h>12)))return null;
 if(m[3])h=h%12+(m[3]==='pm'?12:0);
 return String(h).padStart(2,'0')+':'+String(minute).padStart(2,'0');
};
const displayTime=(s:string)=>{const t=parseTime(s);if(!t)return s;const [h,m]=t.split(':').map(Number);return String(h%12||12)+':'+String(m).padStart(2,'0')+' '+(h>=12?'PM':'AM');};
export default function AppointmentDateTime({name,label,defaultValue='',linkedDate,onDateChange,hideDate=false,compactDate=false}:Props){
 const [date,setDate]=useState(defaultValue.slice(0,10));
 const effectiveDate=linkedDate!==undefined?linkedDate:date;
 const [time,setTime]=useState(defaultValue?displayTime(defaultValue.slice(11,16)):name==='end'?'3:00 PM':'7:00 AM');
 const parsed=parseTime(time);
 const valid=Boolean(effectiveDate&&parsed);
 const [pickerOpen,setPickerOpen]=useState(false);
 const pickerRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!pickerOpen)return;const selected=pickerRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]');if(selected&&pickerRef.current){pickerRef.current.scrollTop=selected.offsetTop-pickerRef.current.offsetTop-pickerRef.current.clientHeight/2+selected.clientHeight/2;}},[pickerOpen]);
 const choices=Array.from({length:96},(_,i)=>displayTime(String(Math.floor(i/4)).padStart(2,'0')+':'+String(i%4*15).padStart(2,'0')));
 return <fieldset className={"ee-appointment-datetime"+(compactDate?" compact-date":"")}>
  {!compactDate&&!hideDate&&<legend>{label}</legend>}
  <div className={"ee-appointment-fields"+(hideDate?" time-only":"")}>
   {!hideDate&&<label>Date<input type="date" value={effectiveDate} onChange={e=>{setDate(e.target.value);onDateChange?.(e.target.value)}} required/></label>}
   <label>{compactDate?"Start time (Perth)":hideDate?"End time (Perth)":"Time (Perth)"}<input type="text" inputMode="text" autoComplete="off" value={time} onChange={e=>setTime(e.target.value)} onBlur={()=>{if(parsed)setTime(displayTime(parsed));}} placeholder="7:00 AM" required aria-invalid={time.trim()!==''&&!parsed} aria-describedby={name+'-time-help'}/></label>
  </div>
  <div className="ee-time-picker-row"><button type="button" className="ee-time-picker-toggle" aria-expanded={pickerOpen} onClick={()=>setPickerOpen(v=>!v)}>{pickerOpen?'Close time options':'Choose time ▾'}</button>{pickerOpen&&<div ref={pickerRef} className="ee-time-picker-options" role="group" aria-label={label+' time options'}>{choices.map(choice=><button type="button" key={choice} aria-pressed={displayTime(time)===choice} onClick={()=>{setTime(choice);setPickerOpen(false)}}>{choice}</button>)}</div>}</div>
  <small id={name+'-time-help'}>{parsed?'Type a time or choose from the list.':'Enter a time such as 7:00 AM or 14:30.'}</small>
  <input type="hidden" name={name} value={valid?effectiveDate+'T'+parsed:''}/>
  <style>{`
  .ee-appointment-datetime{border:0;padding:0;margin:0;min-width:0;display:grid;gap:8px}
  .ee-appointment-datetime legend{font-size:13px;font-weight:750;margin-bottom:8px}
  .ee-appointment-fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}
  .ee-appointment-fields.time-only{grid-template-columns:1fr}.ee-appointment-fields label{display:grid;gap:5px;font-size:12px;font-weight:650}
  .ee-appointment-fields input{width:100%;min-width:0;box-sizing:border-box;border:1px solid #cbd8e6;border-radius:9px;padding:11px 10px;background:#fff;color:#17364b;font-size:16px;min-height:46px}
  .ee-appointment-fields input[aria-invalid="true"]{border-color:#cc6156}
  .ee-appointment-datetime.compact-date .ee-time-picker-row,.ee-appointment-datetime.compact-date>small{margin-left:calc(50% + 5px)}
  .ee-time-picker-row{position:relative}.ee-time-picker-toggle{border:1px solid #d1e0ee;border-radius:8px;background:#f3f8fc;color:#176ba7;padding:7px 12px;font-size:12px;font-weight:750;cursor:pointer}.ee-time-picker-options{position:absolute;top:100%;left:0;z-index:30;width:min(350px,90vw);max-height:210px;overflow:auto;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;background:white;padding:8px;border:1px solid #cbd8e6;border-radius:9px;box-shadow:0 12px 25px #1233}.ee-time-picker-options button{border:0;border-radius:6px;background:#f3f8fc;padding:8px 3px;color:#17364b;cursor:pointer}.ee-time-picker-options button[aria-pressed="true"]{background:#d8ecff;color:#0875c9;font-weight:800}
  .ee-appointment-datetime>small{font-size:11px;color:#718397;line-height:1.35}
  @media(max-width:420px){.ee-appointment-fields{grid-template-columns:1fr}.ee-appointment-datetime.compact-date .ee-time-picker-row,.ee-appointment-datetime.compact-date>small{margin-left:0}}
  `}</style>
 </fieldset>;
}
