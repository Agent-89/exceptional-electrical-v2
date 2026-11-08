'use client';
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {saveEnquiryStatus,saveEnquiryNote,saveEnquiryFollowUp,verifyEnquiryCallDetails} from '../../actions';
type Activity={id:string;actor_id:string|null;action:string;note:string|null;created_at:string;actor_name:string};
const statuses=['new','contacted','qualified','scheduled','closed','spam'];
export default function EnquiryWorkspace({id,initialStatus,initialActivity,initialFollowUp,initialDueDate,initialReceivedAt,initialNeedsReview,initialHasConcern,initialRequestedDate}:{id:string;initialStatus:string;initialActivity:Activity[];initialFollowUp:boolean;initialDueDate:string;initialReceivedAt:string;initialNeedsReview:boolean;initialHasConcern:boolean;initialRequestedDate:string}){
 const router=useRouter();
 const [needsReview,setNeedsReview]=useState(initialNeedsReview);
 const [verifyPending,startVerify]=useTransition();
 const [verifyMessage,setVerifyMessage]=useState('');
 const perthTime=(value:string)=>new Date(value).toLocaleString('en-AU',{timeZone:'Australia/Perth',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'});
 const [followUp,setFollowUp]=useState(initialFollowUp);
 const [dueDate,setDueDate]=useState(initialDueDate);
 const [followUpMessage,setFollowUpMessage]=useState('');
 const [followUpPending,startFollowUp]=useTransition();
 const [status,setStatus]=useState(initialStatus);
 const nextAction=status==='closed'||status==='spam'?'No further action required':status==='scheduled'?'Review the scheduled work and keep the customer informed':status==='qualified'?'Prepare the next step for this qualified enquiry':needsReview?'Verify the call details, then contact the customer':initialHasConcern?'Contact the customer about the request and previous-work concern':initialRequestedDate?'Contact the customer to confirm the requested date and requirements':'Contact the customer to confirm their requirements';
 const [savedStatus,setSavedStatus]=useState(initialStatus);
 const [note,setNote]=useState('');
 const [activity,setActivity]=useState(initialActivity);
 const [statusMessage,setStatusMessage]=useState('');
 const [noteMessage,setNoteMessage]=useState('');
 const [statusPending,startStatus]=useTransition();
 const [notePending,startNote]=useTransition();
 function updateStatus(){
  setStatusMessage('');
  startStatus(async()=>{
   try{
    const result=await saveEnquiryStatus(id,status);
    setStatusMessage(result.message);
    if(result.ok){setSavedStatus(result.status??status);if(result.activity)setActivity(current=>[result.activity!,...current]);}
   }catch{setStatusMessage('Could not save status. Please try again.');}
  });
 }
 function saveFollowUp(){startFollowUp(async()=>{try{const result=await saveEnquiryFollowUp(id,followUp,dueDate);setFollowUpMessage(result.message);if(result.ok&&result.activity)setActivity(current=>[result.activity!,...current]);}catch{setFollowUpMessage('Could not save follow-up. Please try again.');}})}
 function verifyDetails(){startVerify(async()=>{try{const result=await verifyEnquiryCallDetails(id);setVerifyMessage(result.message);if(result.ok){setNeedsReview(false);if(result.activity)setActivity(current=>[result.activity!,...current]);router.refresh();}}catch{setVerifyMessage('Could not verify details. Please try again.');}})}
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
 return <><section className="hq-panel hq-detail-management"><div className="hq-kicker">WORKFLOW</div><h2>Manage enquiry</h2><div className="hq-next-action"><div className="hq-next-action-heading"><span>RECOMMENDED NEXT ACTION</span><span className="hq-next-action-state">{status==="closed"||status==="spam"?"Complete":"To do"}</span></div><strong>{nextAction}</strong>{needsReview&&status!=='closed'&&status!=='spam'&&<button className="hq-primary hq-next-action-button" type="button" disabled={verifyPending} onClick={verifyDetails}>{verifyPending?"VERIFYING…":"VERIFY CALL DETAILS"}</button>}{followUp&&<p>{dueDate?"Follow-up due "+new Date(dueDate+"T12:00:00+08:00").toLocaleDateString("en-AU",{timeZone:"Australia/Perth",day:"numeric",month:"short",year:"numeric"}):"Follow-up required · No due date set"}</p>}</div><div className="hq-verify-panel"><h2>Call details</h2>{needsReview?<><p>Check the original call record and customer information before confirming.</p><p className="hq-verify-hint">Use the verification action above after checking the call record.</p></>:<p className="hq-verified-state">✓ Call details verified</p>}<p className="hq-inline-feedback" role="status" aria-live="polite">{verifyMessage}</p></div><div className="hq-inline-form"><label>Status<select value={status} disabled={statusPending} onChange={e=>{setStatus(e.target.value);setStatusMessage('');}}>{statuses.map(s=><option key={s} value={s}>{s[0].toUpperCase()+s.slice(1)}</option>)}</select></label>{status===savedStatus?<span className="hq-saved-indicator">✓ Status saved</span>:<button className="hq-primary" type="button" disabled={statusPending} onClick={updateStatus}>{statusPending?'SAVING…':'SAVE STATUS'}</button>}<p className="hq-inline-feedback" role="status" aria-live="polite">{statusMessage}</p></div><div className="hq-follow-up"><h2>Follow-up</h2><label className="hq-follow-checkbox"><input type="checkbox" checked={followUp} onChange={e=>setFollowUp(e.target.checked)}/> Follow-up required</label>{followUp&&<label className="hq-follow-date">Follow-up due date (optional)<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>}<button className="hq-primary" type="button" disabled={followUpPending} onClick={saveFollowUp}>{followUpPending?'SAVING…':'SAVE FOLLOW-UP'}</button><p role="status" className="hq-inline-feedback">{followUpMessage}</p></div><div className="hq-note-editor"><h2>Internal note</h2><p>Only approved staff can see these notes.</p><div className="hq-inline-form"><label htmlFor="hq-note">Add a note<textarea id="hq-note" value={note} onChange={e=>{setNote(e.target.value);setNoteMessage('');}} maxLength={3000} rows={5} placeholder="Call summary, next steps, or important customer details..."/></label><button className="hq-primary" type="button" disabled={notePending||note.trim().length<2} onClick={addNote}>{notePending?'ADDING NOTE…':'ADD NOTE'}</button><p className="hq-inline-feedback" role="status" aria-live="polite">{noteMessage}</p></div></div></section><section className="hq-panel hq-activity"><div className="hq-kicker">AUDIT TRAIL</div><h2>Activity history</h2>{!activity.length?<p>No activity recorded yet.</p>:<ol>{activity.map(item=><li key={item.id}><div><strong>{item.action==='note_added'?'Internal note added':item.action==='status_changed'?'Status updated':item.action==='enquiry_received'?'Enquiry received':item.action==='follow_up_updated'?'Follow-up updated':item.action==='customer_linked'?'Customer linked':item.action==='call_details_verified'?'Call details verified':item.action.replaceAll('_',' ')}</strong><span>{item.action==='enquiry_received'&&item.note?.includes('historical entry')?'Received '+perthTime(initialReceivedAt)+' · Recorded '+perthTime(item.created_at):perthTime(item.created_at)} · {item.actor_name}</span></div>{item.note&&<p>{item.action==='enquiry_received'&&item.note.includes('historical entry')?'Historical entry added after the original call.':item.note}</p>}</li>)}</ol>}</section></>;
}
