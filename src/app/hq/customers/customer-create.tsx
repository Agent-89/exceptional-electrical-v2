'use client';
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {createCustomer} from '../customer-actions';
export default function CustomerCreate(){
 const [open,setOpen]=useState(false),[message,setMessage]=useState(''),[pending,start]=useTransition();
 const router=useRouter();
 return <div><button className="hq-crm-button" onClick={()=>setOpen(v=>!v)} type="button">{open?'Cancel':'+ Add customer'}</button>{open&&<form className="hq-crm-form hq-crm-create" onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);start(async()=>{try{const r=await createCustomer(form);setMessage(r.message);if(r.ok&&r.id)router.push('/hq/customers/'+r.id);}catch{setMessage('Unable to create customer');}})}}><label>Name<input name="name" required minLength={2}/></label><label>Email<input name="email" type="email"/></label><label>Phone<input name="phone" type="tel"/></label><button className="hq-crm-button" disabled={pending}>{pending?'Creating…':'Create customer'}</button>{message&&<p role="status">{message}</p>}</form>}</div>;
}