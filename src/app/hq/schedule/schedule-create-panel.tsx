'use client';
import AppointmentRange from '../appointment-range';
import JobPicker from './job-picker';
import ScheduleCreateForm from './schedule-create-form';
import {draftToDateTimes,useScheduleBooking} from './booking-context';

type JobOption={id:string;label:string};
type StaffOption={id:string;name:string};

export default function ScheduleCreatePanel({
 jobs,
 lockedJob=null,
 staff,
 defaultStaffIds=[],
}:{
 jobs:JobOption[];
 lockedJob?:JobOption|null;
 staff:StaffOption[];
 defaultStaffIds?:string[];
}){
 const {draft}=useScheduleBooking();
 const defaults=draft?draftToDateTimes(draft):{start:'',end:''};
 const draftKey=draft?`${draft.day}-${draft.startMinutes}-${draft.endMinutes}`:'manual';

 return <div className="ee-dispatch-create">
  <ScheduleCreateForm key={draftKey}>
   <JobPicker jobs={jobs} lockedJob={lockedJob}/>
   <AppointmentRange defaultStart={defaults.start} defaultEnd={defaults.end}/>
   <fieldset className="ee-create-staff">
    <legend>Electricians for this visit</legend>
    <p>Choose the crew for this appointment. Leave all unchecked to schedule as unassigned.</p>
    <input type="hidden" name="explicit_visit_staff" value="yes"/>
    <div className="ee-create-staff-list">
     {staff.map(({id,name})=>(
      <label key={id}>
       <input type="checkbox" name="staff_id" value={id} defaultChecked={defaultStaffIds.includes(id)}/>
       {name}
      </label>
     ))}
     {staff.length===0&&<span>No active electricians available.</span>}
    </div>
   </fieldset>
   <label className="ee-create-notes">Instructions (optional)<textarea name="notes" maxLength={2000} rows={2} placeholder="Access details or notes for the crew"/></label>
   <div className="ee-create-actions"><small>Perth time (AWST) · Choose electricians for this visit</small><button type="submit">Schedule visit</button></div>
  </ScheduleCreateForm>
 </div>;
}
