'use client';
import {createContext,useCallback,useContext,useMemo,useRef,useState} from 'react';
import {suppressGridInteraction} from './suppress-grid-interaction';

export type BookingDraft={
 day:string;
 startMinutes:number;
 endMinutes:number;
};

type BookingContextValue={
 open:boolean;
 draft:BookingDraft|null;
 openCreate:(draft?:BookingDraft|null)=>void;
 closeCreate:()=>void;
};

const BookingContext=createContext<BookingContextValue>({
 open:false,
 draft:null,
 openCreate:()=>{},
 closeCreate:()=>{},
});

export function useScheduleBooking(){
 return useContext(BookingContext);
}

export function ScheduleBookingProvider({children}:{children:React.ReactNode}){
 const [open,setOpen]=useState(false);
 const [draft,setDraft]=useState<BookingDraft|null>(null);
 const openRef=useRef(false);
 openRef.current=open;
 const openCreate=useCallback((next:BookingDraft|null=null)=>{
  setDraft(next);
  setOpen(true);
 },[]);
 const closeCreate=useCallback(()=>{
  if(openRef.current)suppressGridInteraction();
  setOpen(false);
  setDraft(null);
 },[]);
 const value=useMemo(()=>({open,draft,openCreate,closeCreate}),[open,draft,openCreate,closeCreate]);
 return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function minutesToHm(minutes:number):string{
 const clamped=Math.max(0,Math.min(24*60-1,Math.round(minutes)));
 return String(Math.floor(clamped/60)).padStart(2,'0')+':'+String(clamped%60).padStart(2,'0');
}

export function draftToDateTimes(draft:BookingDraft):{start:string;end:string}{
 return {
  start:draft.day+'T'+minutesToHm(draft.startMinutes),
  end:draft.day+'T'+minutesToHm(draft.endMinutes),
 };
}
