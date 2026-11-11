'use client';
import {useState} from 'react';

type Props={name:string;label:string;defaultValue?:string};
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
export default function AppointmentDateTime({name,label,defaultValue=''}:Props){
 const [date,setDate]=useState(defaultValue.slice(0,10));
 const [time,setTime]=useState(defaultValue?displayTime(defaultValue.slice(11,16)):name==='end'?'3:00 PM':'7:00 AM');
 const parsed=parseTime(time);
 const valid=Boolean(date&&parsed);
 const minutes=parsed?parsed.slice(3):'00';
 const chooseHour=(hour:number)=>{const base=parsed??'07:00';const oldHour=Number(base.slice(0,2));const newHour=hour%12+(oldHour>=12?12:0);setTime(displayTime(String(newHour).padStart(2,'0')+base.slice(2)));};
 const choosePeriod=(period:'AM'|'PM')=>{const base=parsed??'07:00';const hour=Number(base.slice(0,2))%12+(period==='PM'?12:0);setTime(displayTime(String(hour).padStart(2,'0')+base.slice(2)));};
 const chosenHour=parsed?Number(parsed.slice(0,2))%12||12:7;
 const chosenPeriod=parsed&&Number(parsed.slice(0,2))>=12?'PM':'AM';
 const chooseMinute=(minute:string)=>{
  const base=parsed??'07:00';
  setTime(displayTime(base.slice(0,3)+minute));
 };
 return <fieldset className="ee-appointment-datetime">
  <legend>{label}</legend>
  <div className="ee-appointment-fields">
   <label>Date<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label>
   <label>Time (Perth)<input type="text" inputMode="text" autoComplete="off" value={time} onChange={e=>setTime(e.target.value)} onBlur={()=>{if(parsed)setTime(displayTime(parsed));}} placeholder="7:00 AM" required aria-invalid={time.trim()!==''&&!parsed} aria-describedby={name+'-time-help'}/></label>
  </div>
  <div className="ee-appointment-hour-grid" aria-label="Select hour">{Array.from({length:12},(_,i)=>i+1).map(hour=><button key={hour} type="button" onClick={()=>chooseHour(hour)} aria-pressed={chosenHour===hour}>{hour}</button>)}</div>
  <div className="ee-appointment-period" aria-label="Select AM or PM">{(['AM','PM'] as const).map(period=><button key={period} type="button" onClick={()=>choosePeriod(period)} aria-pressed={chosenPeriod===period}>{period}</button>)}</div>
  <div className="ee-appointment-shortcuts" aria-label="Quick minute selection">{['00','15','30','45'].map(m=><button type="button" key={m} onClick={()=>chooseMinute(m)} aria-pressed={minutes===m}>{m}</button>)}</div>
  <small id={name+'-time-help'}>{parsed?'Enter any time, or tap a 15-minute shortcut.':'Enter a time such as 7:00 AM or 14:30.'}</small>
  <input type="hidden" name={name} value={valid?date+'T'+parsed:''}/>
  <style>{`
  .ee-appointment-datetime{border:0;padding:0;margin:0;min-width:0;display:grid;gap:8px}
  .ee-appointment-datetime legend{font-size:13px;font-weight:750;margin-bottom:8px}
  .ee-appointment-fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}
  .ee-appointment-fields label{display:grid;gap:5px;font-size:12px;font-weight:650}
  .ee-appointment-fields input{width:100%;min-width:0;box-sizing:border-box;border:1px solid #cbd8e6;border-radius:9px;padding:11px 10px;background:#fff;color:#17364b;font-size:16px;min-height:46px}
  .ee-appointment-fields input[aria-invalid="true"]{border-color:#cc6156}
  .ee-appointment-hour-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px}
  .ee-appointment-hour-grid button,.ee-appointment-period button{min-height:36px;border:1px solid #d1e0ee;border-radius:8px;background:#f3f8fc;color:#426b87;font-size:13px;font-weight:700;cursor:pointer}
  .ee-appointment-hour-grid button[aria-pressed="true"],.ee-appointment-period button[aria-pressed="true"]{background:#e0f0ff;border-color:#1688e9;color:#0875c9}
  .ee-appointment-period{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
  .ee-appointment-shortcuts{display:flex;gap:6px}
  .ee-appointment-shortcuts button{flex:1;min-height:35px;border:1px solid #d1e0ee;border-radius:8px;background:#f3f8fc;color:#426b87;font-size:13px;font-weight:700;cursor:pointer;padding:6px}
  .ee-appointment-shortcuts button[aria-pressed="true"]{background:#e0f0ff;border-color:#1688e9;color:#0875c9}
  .ee-appointment-datetime>small{font-size:11px;color:#718397;line-height:1.35}
  @media(max-width:420px){.ee-appointment-fields{grid-template-columns:1fr}}
  `}</style>
 </fieldset>;
}
