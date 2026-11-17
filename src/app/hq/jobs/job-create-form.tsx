'use client';
import Link from 'next/link';
import {useState} from 'react';
import {useFormStatus} from 'react-dom';
import {jobTitleFromDescription} from '@/lib/job-title-from-description';
import {staffColor} from '@/lib/staff-color';
import {createJob} from './actions';

type Customer={id:string;name:string};
type Staff={id:string;full_name:string;initials?:string|null;avatar_color?:string|null};
type Prefill={
 customerId:string;
 enquiryId:string;
 quoteId:string;
 description:string;
 siteAddress:string;
};
type Provenance={
 quoteId:string;
 quoteNumber:string;
 enquiryId:string;
 enquiryRef:string;
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

function staffInitials(person:Staff){
 const raw=(person.initials||'').trim();
 if(raw)return raw.slice(0,2).toUpperCase();
 return person.full_name.trim().split(/\s+/).map(part=>part[0]).filter(Boolean).slice(0,2).join('').toUpperCase()||'?';
}

export default function JobCreateForm({
 customers,
 staff,
 prefill,
 provenance,
 cancelHref='/hq/jobs',
}:{
 customers:Customer[];
 staff:Staff[];
 prefill:Prefill;
 provenance:Provenance|null;
 cancelHref?:string;
}){
 // Generate once on mount so retries reuse the same key; never submit an empty key.
 const [idempotencyKey]=useState(newIdempotencyKey);
 const [description,setDescription]=useState(prefill.description);
 const titlePreview=jobTitleFromDescription(description);

 return <form action={createJob} className="ee-create-form">
  <input type="hidden" name="idempotency_key" value={idempotencyKey}/>
  {prefill.enquiryId?<input type="hidden" name="enquiry_id" value={prefill.enquiryId}/>:null}
  {prefill.quoteId?<input type="hidden" name="quote_id" value={prefill.quoteId}/>:null}

  {provenance?(
   <p className="ee-create-provenance" role="note">
    {provenance.quoteId?(
     <>Quote · <Link href={`/hq/quotes/${provenance.quoteId}`}>{provenance.quoteNumber||'Quote'}</Link></>
    ):null}
    {provenance.quoteId&&provenance.enquiryId?' · ':null}
    {provenance.enquiryId?(
     <>Enquiry · <Link href={`/hq/enquiries/${provenance.enquiryId}`}>{provenance.enquiryRef||'Enquiry'}</Link></>
    ):null}
   </p>
  ):null}

  <label>Customer<select name="customer_id" defaultValue={prefill.customerId}><option value="">Select later</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
  <label><span className="ee-label-inline">Site address <span className="ee-optional">(optional)</span></span><input name="site_address_text" maxLength={500} autoComplete="street-address" defaultValue={prefill.siteAddress} placeholder="Street, suburb, postcode"/></label>
  <label>Priority<select name="priority" defaultValue="normal"><option value="normal">Normal</option><option value="low">Low</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
  <label className="ee-create-span">Work description
   <textarea
    name="description"
    rows={4}
    required
    minLength={2}
    maxLength={5000}
    value={description}
    onChange={(event)=>setDescription(event.target.value)}
    placeholder="What needs to be done for the electrician"
   />
   {description.trim().length>=2?(
    <span className="ee-create-title-preview">Job title · {titlePreview}</span>
   ):null}
  </label>

  <fieldset className="ee-create-staff ee-create-span">
   <legend>Assign staff <span className="ee-optional">(optional)</span></legend>
   <p className="ee-create-staff-hint">Default crew for this job. Book visits on the job page after create.</p>
   <div className="ee-create-staff-list">
    {staff.map(person=>{
     const color=staffColor(person.id,person.avatar_color);
     return (
      <label key={person.id} className="ee-create-staff-option">
       <input type="checkbox" name="staff_id" value={person.id}/>
       <span className="ee-create-staff-avatar" style={{backgroundColor:color}} aria-hidden="true">{staffInitials(person)}</span>
       <span className="ee-create-staff-name">{person.full_name}</span>
      </label>
     );
    })}
    {staff.length===0?<span className="ee-create-staff-empty">No active electricians available.</span>:null}
   </div>
  </fieldset>

  <div className="ee-create-actions"><Link href={cancelHref}>Cancel</Link><SubmitButton/></div>
 </form>;
}
