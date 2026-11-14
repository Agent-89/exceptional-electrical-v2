'use client';
import Link from 'next/link';
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {updateCustomer,addCustomerAddress,addCustomerNote,type CustomerMutationResult} from '../../customer-actions';
import type {CustomerMatchRecord} from '@/lib/customer-match';

type Customer={id:string;name:string;email:string|null;phone:string|null};

export default function CustomerEditor({customer}:{customer:Customer}){
 const [editing,setEditing]=useState(false);
 const [addressOpen,setAddressOpen]=useState(false);
 const [feedback,setFeedback]=useState('');
 const [matches,setMatches]=useState<CustomerMatchRecord[]>([]);
 const [conflict,setConflict]=useState<'single'|'multiple'|null>(null);
 const [pending,start]=useTransition();
 const router=useRouter();

 function resetConflict(){setMatches([]);setConflict(null);}

 function handleCustomerResult(r:CustomerMutationResult){
  setFeedback(r.message);
  if(r.ok){
   setEditing(false);
   resetConflict();
   router.refresh();
   return;
  }
  if(r.conflict&&r.matches?.length){
   setConflict(r.conflict);
   setMatches(r.matches);
   return;
  }
  resetConflict();
 }

 function submitCustomer(form:FormData){
  setFeedback('');
  start(async()=>{
   try{handleCustomerResult(await updateCustomer(customer.id,form))}
   catch{setFeedback('Unable to save. Please try again.');resetConflict()}
  });
 }

 function submitAddress(form:FormData){
  setFeedback('');
  resetConflict();
  start(async()=>{
   try{
    const r=await addCustomerAddress(customer.id,form);
    setFeedback(r.message);
    if(r.ok){setAddressOpen(false);router.refresh()}
   }catch{setFeedback('Unable to save. Please try again.')}
  });
 }

 return <div className="hq-crm-tools">
  <div className="hq-crm-actions">
   <button type="button" onClick={()=>{setEditing(v=>!v);resetConflict();setFeedback('')}} className="hq-crm-button">{editing?'Cancel edit':'Edit contact details'}</button>
   <button type="button" onClick={()=>setAddressOpen(v=>!v)} className="hq-crm-button hq-crm-secondary">{addressOpen?'Cancel address':'+ Service address'}</button>
  </div>
  {editing&&<form className="hq-crm-form" onSubmit={e=>{
   e.preventDefault();
   const form=new FormData(e.currentTarget);
   const submitter=(e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null;
   if(submitter?.name==='allow_duplicate')form.set('allow_duplicate',submitter.value||'yes');
   submitCustomer(form);
  }}>
   <label>Name<input name="name" defaultValue={customer.name} required minLength={2} onChange={resetConflict}/></label>
   <label>Email<input type="email" name="email" defaultValue={customer.email??''} onChange={resetConflict}/></label>
   <label>Phone<input type="tel" name="phone" defaultValue={customer.phone??''} onChange={resetConflict}/></label>
   {conflict&&matches.length>0&&<div className="hq-customer-match-panel" role="status">
    <p><strong>{conflict==='single'?'Another customer uses these details':'Multiple customers match these details'}</strong></p>
    <p>{feedback}</p>
    <ul className="hq-customer-match-list">{matches.map(m=><li key={m.id}><strong>{m.name}</strong><span>{[m.phone,m.email].filter(Boolean).join(' · ')||'No contact details'}</span><Link href={'/hq/customers/'+m.id}>Open profile →</Link></li>)}</ul>
    <button type="submit" name="allow_duplicate" value="yes" className="hq-crm-button hq-crm-secondary" disabled={pending}>{pending?'Saving…':'Save with shared contact details anyway'}</button>
   </div>}
   {!conflict&&<button disabled={pending} className="hq-crm-button">{pending?'Saving…':'Save changes'}</button>}
  </form>}
  {addressOpen&&<form className="hq-crm-form" onSubmit={e=>{e.preventDefault();submitAddress(new FormData(e.currentTarget))}}>
   <label>Label<input name="label" placeholder="Home, rental property, office…"/></label>
   <label>Street address<input name="address_line1" required/></label>
   <label>Unit / additional address<input name="address_line2"/></label>
   <label>Suburb<input name="suburb" required/></label>
   <label>State<input name="state" defaultValue="WA" required/></label>
   <label>Postcode<input name="postcode" required pattern="[0-9]{4}" maxLength={4}/></label>
   <label className="hq-crm-full">Access notes<textarea name="notes" rows={2}/></label>
   <button disabled={pending} className="hq-crm-button">{pending?'Saving…':'Add address'}</button>
  </form>}
  {feedback&&!conflict&&<p role="status" className="hq-inline-feedback">{feedback}</p>}
  <style>{`.hq-customer-match-panel{display:grid;gap:10px;padding:12px;border:1px solid #d7e3ee;border-radius:10px;background:#f7fbff;margin-top:8px}.hq-customer-match-list{list-style:none;margin:0;padding:0;display:grid;gap:8px}.hq-customer-match-list li{display:grid;gap:2px}.hq-customer-match-list span{color:#6b8498;font-size:13px}.hq-customer-match-list a{color:#0875c9;text-decoration:none;font-weight:700}`}</style>
 </div>;
}

export function CustomerNoteForm({customerId}:{customerId:string}){
 const [note,setNote]=useState(''),[feedback,setFeedback]=useState(''),[pending,start]=useTransition();
 const router=useRouter();
 return <form className="hq-crm-note" onSubmit={e=>{e.preventDefault();start(async()=>{try{const r=await addCustomerNote(customerId,note);setFeedback(r.message);if(r.ok){setNote('');router.refresh();}}catch{setFeedback('Could not save note');}})}}><label htmlFor="customer-note">Add internal note</label><textarea id="customer-note" value={note} onChange={e=>setNote(e.target.value)} rows={3} maxLength={3000} placeholder="Contact preferences, follow-up details, relevant context…"/><button disabled={pending||note.trim().length<2} className="hq-crm-button">{pending?'Saving…':'Add note'}</button>{feedback&&<p role="status" className="hq-inline-feedback">{feedback}</p>}</form>;
}
