'use client';
import {useState} from 'react';
import AppointmentDateTime from './appointment-date-time';
export default function AppointmentRange(){
 const [startDate,setStartDate]=useState('');
 const [sameDay,setSameDay]=useState(true);
 return <div className="ee-appointment-range">
  <div className="ee-appointment-range-top"><label><input type="checkbox" checked={sameDay} onChange={e=>setSameDay(e.target.checked)}/> End on the same day</label></div>
  <div className="ee-create-dates"><AppointmentDateTime name="start" label="Start" onDateChange={setStartDate}/><AppointmentDateTime key={sameDay?'linked':'independent'} name="end" label="End" linkedDate={sameDay?startDate:undefined} defaultValue={startDate?startDate+'T15:00':''}/></div>
  <style jsx>{`.ee-appointment-range{display:grid;gap:10px}.ee-appointment-range-top{display:flex;justify-content:flex-end}.ee-appointment-range-top label{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:650;color:#45677e}.ee-appointment-range-top input{width:auto;accent-color:#1688e9}`}</style>
 </div>;
}
