'use client';
import {createContext,useContext,useEffect,useRef,useState} from 'react';
const CloseContext=createContext<()=>void>(()=>{});
export const useCloseScheduleModal=()=>useContext(CloseContext);

export default function ScheduleVisitModal({children}:{children:React.ReactNode}){
 const [open,setOpen]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const node=dialog.current;if(!node)return;if(open&&!node.open)node.showModal();if(!open&&node.open)node.close();},[open]);
 return <>
  <button type="button" className="ee-create-open" onClick={()=>setOpen(true)}>＋ Schedule visit</button>
  <dialog ref={dialog} className="ee-create-dialog" aria-label="Schedule a visit" onClose={()=>setOpen(false)} onClick={e=>{if(e.target===dialog.current)setOpen(false)}}>
   <div className="ee-create-dialog-head"><div><strong>Schedule visit</strong><p>Choose a job, time and electricians.</p></div><button type="button" aria-label="Close schedule visit" onClick={()=>setOpen(false)}>×</button></div>
   <CloseContext.Provider value={()=>setOpen(false)}><div className="ee-create-dialog-body">{children}</div></CloseContext.Provider>
  </dialog>
 </>;
}
