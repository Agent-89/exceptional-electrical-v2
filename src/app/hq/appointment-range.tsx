'use client';
import {useState} from 'react';
import AppointmentDateTime from './appointment-date-time';
export default function AppointmentRange(){
 const [date,setDate]=useState('');
 return <div className="ee-appointment-range">
  <AppointmentDateTime name="start" label="Date" onDateChange={setDate} compactDate/>
  <AppointmentDateTime name="end" label="End time" linkedDate={date} hideDate/>
  <style jsx>{`.ee-appointment-range{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);align-items:start;gap:12px}@media(max-width:760px){.ee-appointment-range{grid-template-columns:1fr}}`}</style>
 </div>;
}
