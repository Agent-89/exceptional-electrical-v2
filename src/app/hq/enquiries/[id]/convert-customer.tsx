'use client';
import {useEffect,useState,useTransition} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {convertEnquiryToCustomer,type ConvertCustomerResult} from '../../actions';
import type {CustomerMatchRecord} from '@/lib/customer-match';

export type ConvertPrefill={
 name:string;
 email:string;
 phone:string;
 suburb:string;
};

export default function ConvertCustomer({
 enquiryId,
 initialCustomerId,
 prefill,
}:{
 enquiryId:string;
 initialCustomerId:string|null;
 prefill:ConvertPrefill;
}){
 const router=useRouter();
 const [customerId,setCustomerId]=useState(initialCustomerId);
 const [open,setOpen]=useState(false);
 const [message,setMessage]=useState('');
 const [matches,setMatches]=useState<CustomerMatchRecord[]>([]);
 const [conflict,setConflict]=useState<'single'|'multiple'|null>(null);
 const [pending,start]=useTransition();

 function resetConflict(){setMatches([]);setConflict(null);}

 useEffect(()=>{
  if(!open)return;
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!pending)setOpen(false)};
  window.addEventListener('keydown',onKey);
  return()=>window.removeEventListener('keydown',onKey);
 },[open,pending]);

 function handleResult(r:ConvertCustomerResult){
  setMessage(r.message);
  if(r.ok&&r.customerId){
   setCustomerId(r.customerId);
   setOpen(false);
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

 function submit(form:FormData){
  setMessage('');
  start(async()=>{
   try{handleResult(await convertEnquiryToCustomer(enquiryId,form))}
   catch{setMessage('Unable to convert enquiry. Please try again.');resetConflict()}
  });
 }

 if(customerId){
  return <p className="hq-customer-link hq-detail-convert-linked"><Link href={'/hq/customers/'+customerId}>View linked customer →</Link></p>;
 }

 return <>
  <div className="hq-detail-convert">
   <button
    type="button"
    className="hq-detail-action-secondary hq-detail-convert-trigger"
    disabled={pending}
    onClick={()=>{setMessage('');resetConflict();setOpen(true)}}
   >
    + Customer
   </button>
  </div>
  {open&&<div className="hq-crm-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!pending)setOpen(false)}}>
   <section role="dialog" aria-modal="true" aria-labelledby="hq-convert-customer" className="hq-crm-modal hq-crm-modal-wide">
    <header className="hq-crm-modal-header">
     <div>
      <div className="hq-kicker">ENQUIRY</div>
      <h2 id="hq-convert-customer">Convert to customer</h2>
      <p>Confirm contact details after speaking with the caller. Add an address and note when you have them.</p>
     </div>
     <button type="button" aria-label="Close" className="hq-crm-close" onClick={()=>setOpen(false)} disabled={pending}>×</button>
    </header>
    <form className="hq-crm-form hq-crm-modal-form" onSubmit={e=>{
     e.preventDefault();
     const form=new FormData(e.currentTarget);
     const submitter=(e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null;
     if(submitter?.name==='allow_duplicate')form.set('allow_duplicate',submitter.value||'yes');
     if(submitter?.name==='link_customer_id')form.set('link_customer_id',submitter.value);
     submit(form);
    }}>
     <label className="hq-crm-full">Full name<input name="name" required minLength={2} maxLength={150} defaultValue={prefill.name} autoFocus onChange={resetConflict}/></label>
     <label className="hq-crm-full">Company name<input name="company_name" maxLength={150} placeholder="Optional — for commercial customers" onChange={resetConflict}/></label>
     <label>Email<input name="email" type="email" maxLength={254} defaultValue={prefill.email} onChange={resetConflict}/></label>
     <label>Phone<input name="phone" type="tel" maxLength={40} defaultValue={prefill.phone} onChange={resetConflict}/></label>
     <p className="hq-crm-hint hq-crm-full">Provide at least an email or phone number.</p>

     <div className="hq-crm-full hq-crm-section-title">Service address <span>(optional)</span></div>
     <label className="hq-crm-full">Street address<input name="address_line1" maxLength={160} placeholder="Street number and name"/></label>
     <label className="hq-crm-full">Unit / additional<input name="address_line2" maxLength={160}/></label>
     <label>Suburb<input name="suburb" maxLength={160} defaultValue={prefill.suburb}/></label>
     <label>State<input name="state" maxLength={160} defaultValue="WA"/></label>
     <label>Postcode<input name="postcode" maxLength={4} pattern="[0-9]{4}" inputMode="numeric" placeholder="4 digits"/></label>
     <label className="hq-crm-full">Access notes<textarea name="address_notes" rows={2} maxLength={1000} placeholder="Gate code, parking, dogs…"/></label>

     <label className="hq-crm-full">Internal note<textarea name="customer_note" rows={3} maxLength={3000} placeholder="Contact preferences, follow-up details, relevant context…"/></label>

     {conflict&&matches.length>0&&<div className="hq-crm-full hq-customer-match-panel" role="status">
      <p><strong>{conflict==='single'?'Existing customer found':'Multiple matching customers'}</strong></p>
      <p>{message}</p>
      <ul className="hq-customer-match-list">{matches.map(m=><li key={m.id}>
       <strong>{m.name}</strong>
       {m.company_name?<span>{m.company_name}</span>:null}
       <span>{[m.phone,m.email].filter(Boolean).join(' · ')||'No contact details'}</span>
       <span className="hq-customer-match-actions">
        <Link href={'/hq/customers/'+m.id}>Open profile →</Link>
        <button type="submit" name="link_customer_id" value={m.id} className="hq-crm-button" disabled={pending}>
         {pending?'Linking…':'Link this customer'}
        </button>
       </span>
      </li>)}</ul>
      <button type="submit" name="allow_duplicate" value="yes" className="hq-crm-button hq-crm-secondary" disabled={pending}>
       {pending?'Creating…':'Create separate customer anyway'}
      </button>
     </div>}

     {message&&!conflict&&<p className="hq-crm-full" role="status">{message}</p>}

     <div className="hq-crm-modal-footer hq-crm-full">
      <button type="button" className="hq-crm-button hq-crm-secondary" onClick={()=>setOpen(false)} disabled={pending}>Cancel</button>
      {!conflict&&<button className="hq-crm-button" disabled={pending}>{pending?'Converting…':'Convert to customer'}</button>}
     </div>
    </form>
   </section>
  </div>}
  <style>{`.hq-customer-match-panel{display:grid;gap:10px;padding:12px;border:1px solid #d7e3ee;border-radius:10px;background:#f7fbff}.hq-customer-match-list{list-style:none;margin:0;padding:0;display:grid;gap:8px}.hq-customer-match-list li{display:grid;gap:2px}.hq-customer-match-list span{color:#6b8498;font-size:13px}.hq-customer-match-list a{color:#0875c9;text-decoration:none;font-weight:700}.hq-customer-match-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:6px}.hq-crm-section-title{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#435c6d;margin-top:4px}.hq-crm-section-title span{font-weight:600;letter-spacing:0;text-transform:none;color:#718294}`}</style>
 </>;
}
