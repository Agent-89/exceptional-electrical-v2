'use client';
import {useState} from 'react';
import AppointmentDateTime from './appointment-date-time';

type Props={
 defaultStart?:string;
 defaultEnd?:string;
};

export default function AppointmentRange({defaultStart='',defaultEnd=''}:Props){
 const initialDate=defaultStart.slice(0,10);
 const [date,setDate]=useState(initialDate);
 return <div className="ee-appointment-range">
  <AppointmentDateTime name="start" label="Date" defaultValue={defaultStart} onDateChange={setDate} compactDate/>
  <AppointmentDateTime name="end" label="End time" defaultValue={defaultEnd} linkedDate={date||initialDate} hideDate/>
  <style jsx>{`.ee-appointment-range{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);align-items:start;gap:12px}@media(max-width:760px){.ee-appointment-range{grid-template-columns:1fr}}`}</style>
 </div>;
}
