'use client';
import {useState} from 'react';
import {useFormStatus} from 'react-dom';
import {updateScheduledVisit,updateVisitStaff} from './actions';
type Staff={id:string;name:string};
type Props={id:string;start:string;end:string;notes?:string|null;staffIds:string[];staff:Staff[];onClose:()=>void};
function Submit({children}:{children:React.ReactNode}){const {pending}=useFormStatus();return <button type="submit" disabled={pending}>{pending?'Saving…':children}</button>}
const perthInput=(iso:string)=>new Date(iso).toLocaleString('sv-SE',{timeZone:'Australia/Perth',hour12:false}).replace(' ','T').slice(0,16);
export default function VisitEditor({id,start,end,notes,staffIds,staff,onClose}:Props){
 const [tab,setTab]=useState<'details'|'crew'>('details');
 const [startValue,setStartValue]=useState(perthInput(start));
 const [endValue,setEndValue]=useState(perthInput(end));
 const [error,setError]=useState('');
 const [saving,setSaving]=useState(false);
 const save=async(form:FormData,action:'details'|'crew')=>{
  setError('');setSaving(true);
  try{if(action==='crew')await updateVisitStaff(form);else await updateScheduledVisit(form);onClose();window.location.reload();}
  catch(e){setError(e instanceof Error?e.message:'Unable to save changes.');}
  finally{setSaving(false);}
 };
 return <div className="ee-visit-editor">
  <div className="ee-visit-editor-tabs"><button type="button" className={tab==='details'?'active':''} onClick={()=>setTab('details')}>Date, time & notes</button><button type="button" className={tab==='crew'?'active':''} onClick={()=>setTab('crew')}>Electricians</button></div>
  {tab==='details'?<form action={form=>save(form,'details')}><input type="hidden" name="appointment_id" value={id}/><input type="hidden" name="operation" value="reschedule"/><div className="ee-visit-editor-times"><label>Start (Perth)<input type="datetime-local" name="start" required value={startValue} onChange={e=>setStartValue(e.target.value)}/></label><label>End (Perth)<input type="datetime-local" name="end" required value={endValue} min={startValue} onChange={e=>setEndValue(e.target.value)}/></label></div><label>Instructions<textarea name="notes" rows={3} maxLength={2000} defaultValue={notes??''} placeholder="Notes for the crew"/></label><div className="ee-visit-editor-actions"><button type="submit" disabled={saving}>Save changes</button></div></form>:
  <form action={form=>save(form,'crew')}><input type="hidden" name="appointment_id" value={id}/><div className="ee-visit-editor-staff">{staff.map(person=><label key={person.id}><input type="checkbox" name="staff_id" value={person.id} defaultChecked={staffIds.includes(person.id)}/>{person.name}</label>)}{!staff.length&&<p>No active electricians available.</p>}</div><div className="ee-visit-editor-actions"><button type="submit" disabled={saving}>Save electricians</button></div></form>}
  {error&&<p role="alert" className="ee-visit-editor-error">{error}</p>}
  <button type="button" className="ee-visit-editor-cancel" disabled={saving} onClick={async()=>{if(!window.confirm('Cancel this scheduled visit? This will remove it from the active calendar but retain its record.'))return;setSaving(true);setError('');const form=new FormData();form.set('appointment_id',id);form.set('operation','cancel');try{await updateScheduledVisit(form);onClose();window.location.reload()}catch(e){setError(e instanceof Error?e.message:'Unable to cancel visit.')}finally{setSaving(false)}}}>Cancel this visit</button>
  <style jsx>{`
   .ee-visit-editor{padding:16px 22px 22px;display:grid;gap:14px;border-top:1px solid #e1eaf2}.ee-visit-editor-tabs{display:flex;gap:6px;background:#eef4fa;border-radius:9px;padding:4px}.ee-visit-editor-tabs button{flex:1;border:0;background:transparent;color:#45657b;border-radius:7px;padding:9px;font-weight:700;cursor:pointer}.ee-visit-editor-tabs button.active{background:#fff;color:#0875c9;box-shadow:0 1px 4px #1232}.ee-visit-editor form{display:grid;gap:12px}.ee-visit-editor form label{display:grid;gap:6px;font-size:12px;font-weight:700}.ee-visit-editor input[type="datetime-local"],.ee-visit-editor textarea{width:100%;box-sizing:border-box;border:1px solid #cbd8e6;border-radius:8px;padding:10px;font:inherit;font-size:16px;color:#17364b}.ee-visit-editor-times{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ee-visit-editor-staff{display:grid;gap:10px;max-height:190px;overflow:auto}.ee-visit-editor-staff label{display:flex!important;align-items:center;gap:10px;font-size:14px!important}.ee-visit-editor-actions{display:flex;justify-content:flex-end}.ee-visit-editor-actions button{border:0;border-radius:9px;background:#1688e9;color:#fff;padding:11px 15px;font-weight:750;cursor:pointer}.ee-visit-editor-cancel{justify-self:start;border:0;background:transparent;color:#ad3b3b;font-size:12px;font-weight:700;cursor:pointer}.ee-visit-editor-error{color:#b42318;font-size:12px}.ee-visit-editor button:disabled{opacity:.55;cursor:wait}@media(max-width:550px){.ee-visit-editor-times{grid-template-columns:1fr}}
  `}</style>
 </div>;
}
