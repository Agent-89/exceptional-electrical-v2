'use client';
import {useState,useTransition} from 'react';
import {saveEnquiryStatus,saveEnquiryNote} from '../../actions';
type Activity={id:string;actor_id:string|null;action:string;note:string|null;created_at:string;actor_name:string};
const statuses=['new','contacted','qualified','scheduled','closed','spam'];
export default function EnquiryWorkspace({id,initialStatus,initialActivity}:{id:string;initialStatus:string;initialActivity:Activity[]}){
 const [status,setStatus]=useState(initialStatus);
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
 return <><section className="hq-panel hq-detail-management"><div className="hq-kicker">WORKFLOW</div><h2>Manage enquiry</h2><div className="hq-inline-form"><label>Status<select value={status} disabled={statusPending} onChange={e=>{setStatus(e.target.value);setStatusMessage('');}}>{statuses.map(s=><option key={s} value={s}>{s[0].toUpperCase()+s.slice(1)}</option>)}</select></label>{status===savedStatus?<span className="hq-saved-indicator">✓ Status saved</span>:<button className="hq-primary" type="button" disabled={statusPending} onClick={updateStatus}>{statusPending?'SAVING…':'SAVE STATUS'}</button>}<p className="hq-inline-feedback" role="status" aria-live="polite">{statusMessage}</p></div><div className="hq-note-editor"><h2>Internal note</h2><p>Only approved staff can see these notes.</p><div className="hq-inline-form"><label htmlFor="hq-note">Add a note<textarea id="hq-note" value={note} onChange={e=>{setNote(e.target.value);setNoteMessage('');}} maxLength={3000} rows={5} placeholder="Call summary, next steps, or important customer details..."/></label><button className="hq-primary" type="button" disabled={notePending||note.trim().length<2} onClick={addNote}>{notePending?'ADDING NOTE…':'ADD NOTE'}</button><p className="hq-inline-feedback" role="status" aria-live="polite">{noteMessage}</p></div></div></section><section className="hq-panel hq-activity"><div className="hq-kicker">AUDIT TRAIL</div><h2>Activity history</h2>{!activity.length?<p>No activity recorded yet.</p>:<ol>{activity.map(item=><li key={item.id}><div><strong>{item.action==='note_added'?'Internal note':item.action==='status_changed'?'Status changed':item.action.replaceAll('_',' ')}</strong><span>{new Date(item.created_at).toLocaleString('en-AU',{timeZone:'Australia/Perth'})} · {item.actor_name}</span></div>{item.note&&<p>{item.note}</p>}</li>)}</ol>}</section></>;
}
