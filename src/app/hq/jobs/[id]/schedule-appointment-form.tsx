'use client';
import {useCallback,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import AppointmentDateTime from '../../appointment-date-time';
import HqToast, {type HqToastMessage} from '../../hq-toast';
import {addJobAppointment} from '../actions';

export default function ScheduleAppointmentForm({jobId}:{jobId:string}){
 const router=useRouter();
 const [pending,startTransition]=useTransition();
 const [toast,setToast]=useState<HqToastMessage|null>(null);
 const dismiss=useCallback(()=>setToast(null),[]);

 return <>
  <form className="ee-edit-form" onSubmit={e=>{
   e.preventDefault();
   if(pending)return;
   const form=e.currentTarget;
   const data=new FormData(form);
   startTransition(async()=>{
    const result=await addJobAppointment(data);
    if(result.ok){
     setToast({id:Date.now(),tone:'success',text:result.message||'Job scheduled successfully'});
     form.reset();
     router.refresh();
    }else{
     setToast({id:Date.now(),tone:'error',text:result.message||'Could not schedule appointment.'});
    }
   });
  }}>
   <input type="hidden" name="job_id" value={jobId}/>
   <AppointmentDateTime name="start" label="Start"/>
   <AppointmentDateTime name="end" label="End"/>
   <label>Instructions (optional)<textarea name="notes" rows={2} maxLength={2000} placeholder="Access details, preparation..."/></label>
   <button className="hq-detail-action-primary" type="submit" disabled={pending} aria-busy={pending}>
    {pending?'Scheduling…':'Add appointment'}
   </button>
  </form>
  <p className="ee-muted">Times are in Perth local time (AWST).</p>
  <HqToast toast={toast} onDismiss={dismiss}/>
 </>;
}
