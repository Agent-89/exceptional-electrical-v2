'use client';
import {useCallback,useEffect,useMemo,useState,useTransition} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import AppointmentRange from '../../appointment-range';
import HqToast, {type HqToastMessage} from '../../hq-toast';
import {staffColor} from '@/lib/staff-color';
import {addJobAppointment} from '../actions';

type StaffOption={
 id:string;
 full_name:string;
 initials:string|null;
 avatar_color:string|null;
};

function staffInitials(person:StaffOption):string{
 const raw=(person.initials||'').trim();
 if(raw)return raw.slice(0,2).toUpperCase();
 return person.full_name.trim().split(/\s+/).map(part=>part[0]).filter(Boolean).slice(0,2).join('').toUpperCase()||'?';
}

function ScheduleAppointmentFields({
 jobId,
 staff,
 defaultStaffIds,
 pending,
 onSubmit,
}:{
 jobId:string;
 staff:StaffOption[];
 defaultStaffIds:string[];
 pending:boolean;
 onSubmit:(data:FormData)=>void;
}){
 const staffById=useMemo(()=>new Map(staff.map(person=>[person.id,person])),[staff]);
 const [selectedIds,setSelectedIds]=useState(()=>[...defaultStaffIds]);
 const [pickerOpen,setPickerOpen]=useState(false);
 const [draftIds,setDraftIds]=useState<string[]>([]);

 const selectedPeople=selectedIds
  .map(id=>staffById.get(id))
  .filter((person):person is StaffOption=>Boolean(person));

 useEffect(()=>{
  if(!pickerOpen)return;
  const onKeyDown=(event:KeyboardEvent)=>{
   if(event.key==='Escape')setPickerOpen(false);
  };
  document.addEventListener('keydown',onKeyDown);
  return()=>document.removeEventListener('keydown',onKeyDown);
 },[pickerOpen]);

 const openPicker=()=>{
  setDraftIds([...selectedIds]);
  setPickerOpen(true);
 };

 return <>
  <form
   className="ee-edit-form ee-schedule-appointment-form"
   onSubmit={e=>{
    e.preventDefault();
    if(pending)return;
    onSubmit(new FormData(e.currentTarget));
   }}
  >
   <input type="hidden" name="job_id" value={jobId}/>
   <p className="ee-schedule-slot-link">
    <Link href={'/hq/schedule?view=timeline&job='+jobId}>Find a free slot on Schedule</Link>
   </p>
   <AppointmentRange/>
   <fieldset className="ee-create-staff">
    <legend>Electricians for this visit</legend>
    <p className="ee-create-staff-hint">
     Selected crew is assigned to this visit. Job team on Overview reflects electricians from active visits.
    </p>
    <input type="hidden" name="explicit_visit_staff" value="yes"/>
    {selectedIds.map(id=><input key={id} type="hidden" name="staff_id" value={id}/>)}
    <div className="ee-create-staff-selected">
     {selectedPeople.map(person=>{
      const color=staffColor(person.id,person.avatar_color);
      return (
       <div key={person.id} className="ee-create-staff-pill">
        <span className="ee-create-staff-avatar" style={{backgroundColor:color}} aria-hidden="true">
         {staffInitials(person)}
        </span>
        <span className="ee-create-staff-name">{person.full_name}</span>
        <button
         type="button"
         className="ee-create-staff-remove"
         aria-label={'Remove '+person.full_name}
         onClick={()=>setSelectedIds(ids=>ids.filter(id=>id!==person.id))}
        >
         Remove
        </button>
       </div>
      );
     })}
     {selectedPeople.length===0?(
      <p className="ee-create-staff-empty">No electricians selected — visit will be unassigned.</p>
     ):null}
    </div>
    <button type="button" className="ee-create-staff-add" onClick={openPicker} disabled={staff.length===0}>
     + Add electrician
    </button>
    {staff.length===0?<span className="ee-create-staff-empty">No active electricians available.</span>:null}
   </fieldset>
   <label>Instructions (optional)<textarea name="notes" rows={2} maxLength={2000} placeholder="Access details, preparation..."/></label>
   <button className="hq-detail-action-primary" type="submit" disabled={pending} aria-busy={pending}>
    {pending?'Scheduling…':'Add appointment'}
   </button>
  </form>
  <p className="ee-muted">Times are in Perth local time (AWST).</p>
  {pickerOpen?(
   <div
    className="ee-staff-picker-backdrop"
    onMouseDown={e=>{if(e.target===e.currentTarget)setPickerOpen(false);}}
   >
    <div
     className="ee-staff-picker-dialog"
     role="dialog"
     aria-modal="true"
     aria-labelledby="ee-staff-picker-title"
    >
     <div className="ee-staff-picker-head">
      <strong id="ee-staff-picker-title">Add electricians</strong>
      <button type="button" aria-label="Close" onClick={()=>setPickerOpen(false)}>×</button>
     </div>
     <p className="ee-staff-picker-hint">Select who should be on this visit, then confirm.</p>
     <div className="ee-staff-picker-list">
      {staff.map(person=>{
       const color=staffColor(person.id,person.avatar_color);
       const checked=draftIds.includes(person.id);
       return (
        <label key={person.id} className={'ee-staff-picker-option'+(checked?' is-selected':'')}>
         <input
          type="checkbox"
          checked={checked}
          onChange={e=>{
           setDraftIds(ids=>e.target.checked
            ?[...ids,person.id]
            :ids.filter(id=>id!==person.id));
          }}
         />
         <span className="ee-avatar" style={{backgroundColor:color}} aria-hidden="true">
          {staffInitials(person)}
         </span>
         <span className="ee-staff-picker-name">{person.full_name}</span>
        </label>
       );
      })}
     </div>
     <div className="ee-staff-picker-actions">
      <button type="button" onClick={()=>setPickerOpen(false)}>Cancel</button>
      <button
       type="button"
       className="ee-staff-picker-confirm"
       onClick={()=>{
        setSelectedIds([...draftIds]);
        setPickerOpen(false);
       }}
      >
       Confirm
      </button>
     </div>
    </div>
   </div>
  ):null}
 </>;
}

export default function ScheduleAppointmentForm({
 jobId,
 staff,
 defaultStaffIds,
}:{
 jobId:string;
 staff:StaffOption[];
 defaultStaffIds:string[];
}){
 const router=useRouter();
 const [pending,startTransition]=useTransition();
 const [toast,setToast]=useState<HqToastMessage|null>(null);
 const [formKey,setFormKey]=useState(0);
 const [open,setOpen]=useState(false);
 const dismiss=useCallback(()=>setToast(null),[]);

 return <>
  <details
   className="ee-expand"
   open={open}
   onToggle={e=>setOpen(e.currentTarget.open)}
  >
   <summary>
    + Schedule a visit
    <span className="ee-expand-mark" aria-hidden="true">＋</span>
   </summary>
   <ScheduleAppointmentFields
    key={formKey}
    jobId={jobId}
    staff={staff}
    defaultStaffIds={defaultStaffIds}
    pending={pending}
    onSubmit={data=>{
     startTransition(async()=>{
      const result=await addJobAppointment(data);
      if(result.ok){
       setToast({id:Date.now(),tone:'success',text:result.message||'Job scheduled successfully'});
       setOpen(false);
       setFormKey(key=>key+1);
       router.refresh();
      }else{
       setToast({id:Date.now(),tone:'error',text:result.message||'Could not schedule appointment.'});
      }
     });
    }}
   />
  </details>
  <HqToast toast={toast} onDismiss={dismiss}/>
 </>;
}
