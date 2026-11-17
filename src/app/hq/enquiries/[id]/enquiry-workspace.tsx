'use client';
import {useState,useTransition} from 'react';
import {ChevronDown,ChevronUp} from 'lucide-react';
import {ENQUIRY_STATUSES,enquiryStatusLabel,normalizeEnquiryStatus} from '@/lib/enquiry-status';
import {saveEnquiryStatus,saveEnquiryNote} from '../../actions';
type Activity={id:string;actor_id:string|null;action:string;note:string|null;created_at:string;actor_name:string};
export default function EnquiryWorkspace({id,initialStatus,initialActivity,initialReceivedAt,initialHasConcern,initialRequestedDate}:{id:string;initialStatus:string;initialActivity:Activity[];initialReceivedAt:string;initialHasConcern:boolean;initialRequestedDate:string}){
 const normalized=normalizeEnquiryStatus(initialStatus);
 const [status,setStatus]=useState(normalized);
 const nextAction=status==='closed'||status==='spam'?'No further action required':initialHasConcern?'Contact the customer about the request and previous-work concern':initialRequestedDate?'Contact the customer to confirm the requested date and requirements':status==='new'?'Call or email the customer about this enquiry':'Keep the customer updated and close the enquiry when done';
 const [savedStatus,setSavedStatus]=useState(normalized);
 const [note,setNote]=useState('');
 const [activity,setActivity]=useState(initialActivity);
 const [statusMessage,setStatusMessage]=useState('');
 const [noteMessage,setNoteMessage]=useState('');
 const [statusPending,startStatus]=useTransition();
 const [notePending,startNote]=useTransition();
 const [manageOpen,setManageOpen]=useState(false);
 const [notesOpen,setNotesOpen]=useState(false);
 const perthTime=(value:string)=>new Date(value).toLocaleString('en-AU',{timeZone:'Australia/Perth',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'});
 function updateStatus(){
  setStatusMessage('');
  startStatus(async()=>{
   try{
    const result=await saveEnquiryStatus(id,status);
    setStatusMessage(result.message);
    if(result.ok){setSavedStatus(normalizeEnquiryStatus(result.status??status));if(result.activity)setActivity(current=>[result.activity!,...current]);}
   }catch{setStatusMessage('Could not save status. Please try again.');}
  });
 }
 function addNote(){
  setNoteMessage('');
  startNote(async()=>{
   try{
    const result=await saveEnquiryNote(id,note);
    setNoteMessage(result.message);
    if(result.ok){setNote('');if(result.activity)setActivity(current=>[result.activity!,...current]);}
   }catch{setNoteMessage('Could not save note. Please try again.');}
  });
 }
 return <><section className="hq-panel hq-detail-management"><button type="button" className="hq-manage-toggle" aria-expanded={manageOpen} onClick={()=>setManageOpen(v=>!v)}><span><strong>Manage enquiry</strong><small>{enquiryStatusLabel(savedStatus)}</small></span><span aria-hidden="true">{manageOpen?<ChevronUp size={18} strokeWidth={2.2}/>:<ChevronDown size={18} strokeWidth={2.2}/>}</span></button>{manageOpen&&<div className="hq-manage-body"><div className="hq-next-action"><div className="hq-next-action-heading"><span>RECOMMENDED NEXT ACTION</span><span className="hq-next-action-state">{status==="closed"||status==="spam"?"Complete":"To do"}</span></div><strong>{nextAction}</strong></div><div className="hq-inline-form"><label>Status<select value={status} disabled={statusPending} onChange={e=>{setStatus(normalizeEnquiryStatus(e.target.value));setStatusMessage('');}}>{ENQUIRY_STATUSES.map(s=><option key={s} value={s}>{enquiryStatusLabel(s)}</option>)}</select></label>{status===savedStatus?null:<button className="hq-primary" type="button" disabled={statusPending} onClick={updateStatus}>{statusPending?'SAVING…':'SAVE STATUS'}</button>}<p className="hq-inline-feedback" role="status" aria-live="polite">{statusMessage}</p></div><div className="hq-note-editor hq-workflow-compact"><button type="button" className="hq-workflow-expand" aria-expanded={notesOpen} onClick={()=>setNotesOpen(v=>!v)}><span>Internal notes</span><span aria-hidden="true">{notesOpen?<ChevronUp size={18} strokeWidth={2.2}/>:<ChevronDown size={18} strokeWidth={2.2}/>}</span></button>{notesOpen&&<div className="hq-workflow-expanded"><p>Only approved staff can see these notes.</p><div className="hq-inline-form"><label htmlFor="hq-note">Add a note<textarea id="hq-note" value={note} onChange={e=>{setNote(e.target.value);setNoteMessage('');}} maxLength={3000} rows={5} placeholder="Call summary, next steps, or important customer details..."/></label><button className="hq-primary" type="button" disabled={notePending||note.trim().length<2} onClick={addNote}>{notePending?'ADDING NOTE…':'ADD NOTE'}</button><p className="hq-inline-feedback" role="status" aria-live="polite">{noteMessage}</p></div></div>}</div></div>}</section><section className="hq-panel hq-activity"><div className="hq-kicker">AUDIT TRAIL</div><h2>Activity history</h2>{!activity.length?<p>No activity recorded yet.</p>:<ol>{activity.map(item=><li key={item.id}><div><strong>{item.action==='note_added'?'Internal note added':item.action==='status_changed'?'Status updated':item.action==='enquiry_received'?'Enquiry received':item.action==='follow_up_updated'?'Follow-up updated':item.action==='customer_linked'?'Customer linked':item.action==='call_details_verified'?'Intake review completed':item.action.replaceAll('_',' ')}</strong><span>{item.action==='enquiry_received'&&item.note?.includes('historical entry')?'Received '+perthTime(initialReceivedAt)+' · Recorded '+perthTime(item.created_at):perthTime(item.created_at)} · {item.actor_name}</span></div>{item.note&&<p>{item.action==='enquiry_received'&&item.note.includes('historical entry')?'Historical entry added after the original call.':item.note}</p>}</li>)}</ol>}</section></>;
}
