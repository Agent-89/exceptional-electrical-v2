'use client';
import {useRef,useState} from 'react';
import {addJobAppointment} from '../jobs/actions';
export default function ScheduleCreateForm({children,onSaved}:{children:React.ReactNode;onSaved:()=>void}){
 const [error,setError]=useState('');const [saving,setSaving]=useState(false);
 const locked=useRef(false);
 return <form className="ee-create-form" onSubmit={async e=>{
  e.preventDefault();if(locked.current)return;
  const form=e.currentTarget;const data=new FormData(form);
  locked.current=true;setSaving(true);setError('');
  try{await addJobAppointment(data);onSaved();window.location.reload();}
  catch(err){setError(err instanceof Error?err.message:'Unable to schedule visit.');locked.current=false;setSaving(false);}
 }}>
 <fieldset disabled={saving} style={{border:0,padding:0,margin:0,minWidth:0,display:'contents'}}>{children}</fieldset>
 {error&&<p role="alert" style={{color:'#b42318',fontSize:13,whiteSpace:'pre-wrap'}}>{error}</p>}
 {saving&&<p role="status" style={{fontSize:12}}>Saving appointment…</p>}
 </form>;
}
