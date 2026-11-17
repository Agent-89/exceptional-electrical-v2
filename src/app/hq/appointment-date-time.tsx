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
 const rootRef=useRef<HTMLFieldSetElement>(null);
 const pickerRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!pickerOpen)return;
  const selected=pickerRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
  if(selected&&pickerRef.current){
   pickerRef.current.scrollTop=selected.offsetTop-pickerRef.current.offsetTop-pickerRef.current.clientHeight/2+selected.clientHeight/2;
  }
  const onPointerDown=(event:PointerEvent)=>{
   if(rootRef.current&&!rootRef.current.contains(event.target as Node))setPickerOpen(false);
  };
  const onKeyDown=(event:KeyboardEvent)=>{
   if(event.key==='Escape')setPickerOpen(false);
  };
  document.addEventListener('pointerdown',onPointerDown);
  document.addEventListener('keydown',onKeyDown);
  return()=>{
   document.removeEventListener('pointerdown',onPointerDown);
   document.removeEventListener('keydown',onKeyDown);
  };
 },[pickerOpen]);
 const choices=Array.from({length:96},(_,i)=>displayTime(String(Math.floor(i/4)).padStart(2,'0')+':'+String(i%4*15).padStart(2,'0')));
 const timeLabel=compactDate?'Start time (Perth)':hideDate?'End time (Perth)':'Time (Perth)';
 return <fieldset ref={rootRef} className={"ee-appointment-datetime"+(compactDate?" compact-date":"")+(hideDate?" time-only-fieldset":"")}>
  {!compactDate&&!hideDate&&<legend>{label}</legend>}
  <div className={"ee-appointment-fields"+(hideDate?" time-only":"")}>
   {!hideDate&&<label>Date<input type="date" value={effectiveDate} onChange={e=>{setDate(e.target.value);onDateChange?.(e.target.value)}} required/></label>}
   <label className="ee-appointment-time-field">
    {timeLabel}
    <div className="ee-appointment-time-wrap">
     <input
      type="text"
      inputMode="text"
      autoComplete="off"
      value={time}
      onChange={e=>setTime(e.target.value)}
      onFocus={()=>setPickerOpen(true)}
      onClick={()=>setPickerOpen(true)}
      onBlur={()=>{if(parsed)setTime(displayTime(parsed));}}
      placeholder="7:00 AM"
      required
      aria-invalid={time.trim()!==''&&!parsed}
      aria-expanded={pickerOpen}
      aria-controls={name+'-time-options'}
      aria-describedby={name+'-time-help'}
     />
     {pickerOpen?(
      <div
       ref={pickerRef}
       id={name+'-time-options'}
       className="ee-time-picker-options"
       role="listbox"
       aria-label={label+' time options'}
      >
       {choices.map(choice=>(
        <button
         type="button"
         key={choice}
         role="option"
         aria-selected={displayTime(time)===choice}
         aria-pressed={displayTime(time)===choice}
         onMouseDown={e=>e.preventDefault()}
         onClick={()=>{setTime(choice);setPickerOpen(false);}}
        >
         {choice}
        </button>
       ))}
      </div>
     ):null}
    </div>
   </label>
  </div>
  <small id={name+'-time-help'}>{parsed?'Type a time or pick from the list.':'Enter a time such as 7:00 AM or 14:30.'}</small>
  <input type="hidden" name={name} value={valid?effectiveDate+'T'+parsed:''}/>
  <style>{`
  .ee-appointment-datetime{border:0;padding:0;margin:0;min-width:0;display:grid;gap:8px}
  .ee-appointment-datetime legend{font-size:13px;font-weight:750;margin-bottom:8px}
  .ee-appointment-fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}
  .ee-appointment-fields.time-only{grid-template-columns:1fr}
  .ee-appointment-fields label{display:grid;gap:5px;font-size:12px;font-weight:650}
  .ee-appointment-fields input{width:100%;min-width:0;box-sizing:border-box;border:1px solid #cbd8e6;border-radius:9px;padding:11px 10px;background:#fff;color:#17364b;font-size:16px;min-height:46px}
  .ee-appointment-fields input[aria-invalid="true"]{border-color:#cc6156}
  .ee-appointment-time-wrap{position:relative;min-width:0}
  .ee-appointment-datetime.compact-date>small{margin-left:calc(50% + 5px)}
  .ee-appointment-datetime.time-only-fieldset>small{margin-left:0}
  .ee-time-picker-options{position:absolute;top:calc(100% + 4px);left:0;z-index:30;width:100%;min-width:140px;max-height:220px;overflow:auto;display:grid;grid-template-columns:1fr;gap:2px;background:white;padding:6px;border:1px solid #cbd8e6;border-radius:9px;box-shadow:0 12px 25px #1233}
  .ee-time-picker-options button{border:0;border-radius:6px;background:transparent;padding:9px 10px;color:#17364b;cursor:pointer;text-align:left;font:inherit;font-size:14px}
  .ee-time-picker-options button:hover{background:#f3f8fc}
  .ee-time-picker-options button[aria-pressed="true"]{background:#d8ecff;color:#0875c9;font-weight:800}
  .ee-appointment-datetime>small{font-size:11px;color:#718397;line-height:1.35}
  @media(max-width:420px){.ee-appointment-fields{grid-template-columns:1fr}.ee-appointment-datetime.compact-date>small{margin-left:0}}
  `}</style>
 </fieldset>;
}
