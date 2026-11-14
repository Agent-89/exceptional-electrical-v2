'use client';
import Link from 'next/link';
import {useEffect,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {createCustomer,type CustomerMutationResult} from '../customer-actions';
import type {CustomerMatchRecord} from '@/lib/customer-match';

export default function CustomerCreate(){
 const [open,setOpen]=useState(false);
 const [message,setMessage]=useState('');
 const [matches,setMatches]=useState<CustomerMatchRecord[]>([]);
 const [conflict,setConflict]=useState<'single'|'multiple'|null>(null);
 const [pending,start]=useTransition();
 const router=useRouter();

 function resetConflict(){setMatches([]);setConflict(null);}

 useEffect(()=>{
  if(!open)return;
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!pending)setOpen(false)};
  window.addEventListener('keydown',onKey);
  return()=>window.removeEventListener('keydown',onKey);
 },[open,pending]);

 function handleResult(r:CustomerMutationResult){
  setMessage(r.message);
  if(r.ok&&r.id){
   setOpen(false);
   resetConflict();
   router.push('/hq/customers/'+r.id);
   return;
  }
  if(r.conflict&&r.matches?.length){
   setConflict(r.conflict);
   setMatches(r.matches);
   return;
  }
  resetConflict();
 }

 return <>
  <button className="hq-crm-button" onClick={()=>{setMessage('');resetConflict();setOpen(true)}} type="button">+ Add customer</button>
  {open&&<div className="hq-crm-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!pending)setOpen(false)}}>
   <section role="dialog" aria-modal="true" aria-labelledby="hq-new-customer" className="hq-crm-modal">
    <header className="hq-crm-modal-header">
     <div><div className="hq-kicker">CUSTOMERS</div><h2 id="hq-new-customer">Add customer</h2><p>Create a customer profile without an enquiry.</p></div>
     <button type="button" aria-label="Close" className="hq-crm-close" onClick={()=>setOpen(false)} disabled={pending}>×</button>
    </header>
    <form className="hq-crm-form hq-crm-modal-form" onSubmit={e=>{
     e.preventDefault();
     const form=new FormData(e.currentTarget);
     const submitter=(e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null;
     if(submitter?.name==='allow_duplicate')form.set('allow_duplicate',submitter.value||'yes');
     start(async()=>{
      try{handleResult(await createCustomer(form))}
      catch{setMessage('Unable to create customer');resetConflict()}
     });
    }}>
     <label className="hq-crm-full">Full name<input name="name" required minLength={2} maxLength={150} autoFocus onChange={resetConflict}/></label>
     <label className="hq-crm-full">Email<input name="email" type="email" maxLength={254} onChange={resetConflict}/></label>
     <label className="hq-crm-full">Phone<input name="phone" type="tel" maxLength={40} onChange={resetConflict}/></label>
     <p className="hq-crm-hint hq-crm-full">Provide at least an email or phone number.</p>
     {conflict&&matches.length>0&&<div className="hq-crm-full hq-customer-match-panel" role="status">
      <p><strong>{conflict==='single'?'Existing customer found':'Multiple matching customers'}</strong></p>
      <p>{message}</p>
      <ul className="hq-customer-match-list">{matches.map(m=><li key={m.id}><strong>{m.name}</strong><span>{[m.phone,m.email].filter(Boolean).join(' · ')||'No contact details'}</span><Link href={'/hq/customers/'+m.id}>Open profile →</Link></li>)}</ul>
      {conflict==='single'&&matches[0]&&<Link className="hq-crm-button" href={'/hq/customers/'+matches[0].id}>Use existing customer</Link>}
      <button type="submit" name="allow_duplicate" value="yes" className="hq-crm-button hq-crm-secondary" disabled={pending}>{pending?'Creating…':'Create separate customer anyway'}</button>
     </div>}
     {message&&!conflict&&<p className="hq-crm-full" role="status">{message}</p>}
     <div className="hq-crm-modal-footer hq-crm-full">
      <button type="button" className="hq-crm-button hq-crm-secondary" onClick={()=>setOpen(false)} disabled={pending}>Cancel</button>
      {!conflict&&<button className="hq-crm-button" disabled={pending}>{pending?'Creating…':'Create customer'}</button>}
     </div>
    </form>
   </section>
  </div>}
  <style>{`.hq-customer-match-panel{display:grid;gap:10px;padding:12px;border:1px solid #d7e3ee;border-radius:10px;background:#f7fbff}.hq-customer-match-list{list-style:none;margin:0;padding:0;display:grid;gap:8px}.hq-customer-match-list li{display:grid;gap:2px}.hq-customer-match-list span{color:#6b8498;font-size:13px}.hq-customer-match-list a{color:#0875c9;text-decoration:none;font-weight:700}`}</style>
 </>;
}
