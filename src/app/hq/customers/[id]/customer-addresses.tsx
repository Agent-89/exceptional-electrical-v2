'use client';
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {updateCustomerAddress} from '../../customer-actions';
import type {CustomerAddress} from './customer-editor';

export default function CustomerAddresses({customerId,addresses}:{customerId:string;addresses:CustomerAddress[]}){
 const [editingAddressId,setEditingAddressId]=useState<string|null>(null);
 const [feedback,setFeedback]=useState('');
 const [pending,start]=useTransition();
 const router=useRouter();

 if(!addresses.length){
  return <p>No addresses added yet. Use + Service address above to add a property.</p>;
 }

 return <>
  <div className="hq-crm-records">
   {addresses.map(a=>{
    const editingThis=editingAddressId===a.id;
    return <div key={a.id}>
     <strong>{a.label}{a.is_primary?<span className="hq-crm-primary-badge">Primary</span>:null}</strong>
     <p>{a.address_line1}{a.address_line2?', '+a.address_line2:''}, {a.suburb} {a.state} {a.postcode}</p>
     {a.notes&&<small>{a.notes}</small>}
     <div className="hq-crm-actions" style={{marginTop:8}}>
      <button type="button" className="hq-crm-button hq-crm-secondary" onClick={()=>{setEditingAddressId(editingThis?null:a.id);setFeedback('')}}>
       {editingThis?'Cancel':'Edit address'}
      </button>
     </div>
     {editingThis&&<form className="hq-crm-form" onSubmit={e=>{
      e.preventDefault();
      const form=new FormData(e.currentTarget);
      setFeedback('');
      start(async()=>{
       try{
        const r=await updateCustomerAddress(customerId,a.id,form);
        setFeedback(r.message);
        if(r.ok){setEditingAddressId(null);router.refresh()}
       }catch{setFeedback('Unable to save. Please try again.')}
      });
     }}>
      <label>Label<input name="label" defaultValue={a.label}/></label>
      <label>Street address<input name="address_line1" defaultValue={a.address_line1} required/></label>
      <label>Unit / additional address<input name="address_line2" defaultValue={a.address_line2??''}/></label>
      <label>Suburb<input name="suburb" defaultValue={a.suburb} required/></label>
      <label>State<input name="state" defaultValue={a.state||'WA'} required/></label>
      <label>Postcode<input name="postcode" defaultValue={a.postcode} required pattern="[0-9]{4}" maxLength={4}/></label>
      <label className="hq-crm-full">Access notes<textarea name="notes" rows={2} defaultValue={a.notes??''}/></label>
      <label className="hq-crm-full"><input type="checkbox" name="is_primary" value="yes" defaultChecked={Boolean(a.is_primary)}/> Mark as primary service address</label>
      <button disabled={pending} className="hq-crm-button">{pending?'Saving…':'Save address'}</button>
     </form>}
    </div>;
   })}
  </div>
  {feedback&&<p role="status" className="hq-inline-feedback">{feedback}</p>}
 </>;
}
