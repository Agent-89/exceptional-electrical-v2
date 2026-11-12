'use client';
import {useState} from 'react';
import {addJobAppointment} from '../jobs/actions';
export default function ScheduleCreateForm({children}:{children:React.ReactNode}){
 const [error,setError]=useState('');const [saving,setSaving]=useState(false);
 return <form className="ee-create-form" onSubmit={async e=>{
  e.preventDefault();if(saving)return;setSaving(true);setError('');
  try{await addJobAppointment(new FormData(e.currentTarget));window.location.reload();}
  catch(err){setError(err instanceof Error?err.message:'Unable to schedule visit.');setSaving(false);}
 }}>
 {children}
 {error&&<p role="alert" style={{color:'#b42318',fontSize:13,whiteSpace:'pre-wrap'}}>{error}</p>}
 {saving&&<p role="status" style={{fontSize:12}}>Saving appointment…</p>}
 </form>;
}
