'use client';
import {createContext,useContext,useEffect,useRef} from 'react';
import {useScheduleBooking} from './booking-context';

const CloseContext=createContext<()=>void>(()=>{});
export const useCloseScheduleModal=()=>useContext(CloseContext);

export default function ScheduleVisitModal({children}:{children?:React.ReactNode}){
 const {open,draft,openCreate,closeCreate}=useScheduleBooking();
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const node=dialog.current;
  if(!node)return;
  if(open&&!node.open)node.showModal();
  if(!open&&node.open)node.close();
 },[open]);

 return <>
  <button type="button" className="ee-create-open" onClick={()=>openCreate(null)}>＋ Schedule visit</button>
  <dialog
   ref={dialog}
   className="ee-create-dialog"
   aria-label="Schedule a visit"
   onClose={closeCreate}
   onClick={e=>{if(e.target===dialog.current)closeCreate();}}
  >
   <div className="ee-create-dialog-head">
    <div>
     <strong>Schedule visit</strong>
     <p>{draft?'Confirm the selected time and electricians.':'Choose a job, time and electricians.'}</p>
    </div>
    <button type="button" aria-label="Close schedule visit" onClick={closeCreate}>×</button>
   </div>
   <CloseContext.Provider value={closeCreate}>
    <div className="ee-create-dialog-body">{children}</div>
   </CloseContext.Provider>
  </dialog>
 </>;
}
