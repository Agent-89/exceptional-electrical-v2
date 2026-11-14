'use client';
import Link from 'next/link';
import {useState} from 'react';
import {useFormStatus} from 'react-dom';
import {createJob} from './actions';

type Customer={id:string;name:string};
type Prefill={
 customerId:string;
 enquiryId:string;
 quoteId:string;
 title:string;
 description:string;
 siteAddress:string;
};

function SubmitButton(){
 const {pending}=useFormStatus();
 return <button type="submit" className="hq-detail-action-primary" disabled={pending} aria-busy={pending}>
  {pending?'Creating job…':'Create job'}
 </button>;
}

function newIdempotencyKey(){
 if(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function')return crypto.randomUUID();
 // RFC4122-ish fallback so the server UUID check still passes offline/old browsers.
 const hex=(n:number)=>n.toString(16).padStart(2,'0');
 const bytes=Array.from({length:16},()=>Math.floor(Math.random()*256));
 bytes[6]=(bytes[6]&0x0f)|0x40;bytes[8]=(bytes[8]&0x3f)|0x80;
 const h=bytes.map(hex).join('');
 return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

export default function JobCreateForm({customers,prefill}:{customers:Customer[];prefill:Prefill}){
 // Generate once on mount so retries reuse the same key; never submit an empty key.
 const [idempotencyKey]=useState(newIdempotencyKey);

 return <form action={createJob} className="ee-create-form">
  <input type="hidden" name="idempotency_key" value={idempotencyKey}/>
  {prefill.enquiryId?<input type="hidden" name="enquiry_id" value={prefill.enquiryId}/>:null}
  {prefill.quoteId?<input type="hidden" name="quote_id" value={prefill.quoteId}/>:null}
  <label>What needs to be done?<input name="title" required minLength={2} maxLength={200} defaultValue={prefill.title} placeholder="e.g. Replace faulty kitchen downlights"/></label>
  <label>Customer<select name="customer_id" defaultValue={prefill.customerId}><option value="">Select later</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
  <label><span className="ee-label-inline">Site address <span className="ee-optional">(optional)</span></span><input name="site_address_text" maxLength={500} autoComplete="street-address" defaultValue={prefill.siteAddress} placeholder="Street, suburb, postcode"/></label>
  <label>Priority<select name="priority"><option value="normal">Normal</option><option value="low">Low</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
  <label>Work description<textarea name="description" rows={4} maxLength={5000} defaultValue={prefill.description} placeholder="Add details for the electrician"/></label>
  <div className="ee-create-actions"><Link href="/hq/jobs">Cancel</Link><SubmitButton/></div>
 </form>;
}
