'use client';
import {useState} from 'react';
import AppointmentDateTime from './appointment-date-time';
export default function AppointmentRange(){
 const [date,setDate]=useState('');
 return <div className="ee-appointment-range">
  <AppointmentDateTime name="start" label="Date & start time" onDateChange={setDate}/>
  <AppointmentDateTime name="end" label="End time" linkedDate={date} hideDate/>
  <style jsx>{`.ee-appointment-range{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}@media(max-width:760px){.ee-appointment-range{grid-template-columns:1fr}}`}</style>
 </div>;
}
