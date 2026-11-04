'use client';
import { useState, type FormEvent } from 'react';
import { ArrowUpRight, CheckCircle2 } from 'lucide-react';
export function EnquiryForm(){
 const [status,setStatus]=useState<'idle'|'sending'|'success'|'error'>('idle');
 const [error,setError]=useState('');
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault(); if(status==='sending')return;
  const form=e.currentTarget; const data=new FormData(form);
  setStatus('sending');setError('');
  try {const res=await fetch('/api/enquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(data.entries()))});
   if(!res.ok){const body=await res.json().catch(()=>({}));throw new Error(body.error||'Please try again.');}
   form.reset();setStatus('success');
  }catch(err){setError(err instanceof Error?err.message:'Please try again.');setStatus('error');}
 }
 return <form className="enquiry-form" onSubmit={submit}><div className="form-head"><span>YOUR ENQUIRY</span><span>01 — 04</span></div><div className="form-row"><label>YOUR NAME<input name="name" required minLength={2} maxLength={120} autoComplete="name" placeholder="Full name"/></label><label>PHONE NUMBER<input name="phone" required maxLength={30} autoComplete="tel" placeholder="Best contact number"/></label></div><div className="form-row"><label>EMAIL ADDRESS<input type="email" name="email" required maxLength={254} autoComplete="email" placeholder="you@example.com"/></label><label>SERVICE TYPE<select name="service" required defaultValue=""><option value="" disabled>Select a service</option><option value="residential">Residential</option><option value="commercial">Commercial</option><option value="lighting">Lighting & design</option><option value="maintenance">Maintenance</option><option value="other">Something else</option></select></label></div><label>ABOUT YOUR PROJECT<textarea name="message" required minLength={10} maxLength={3000} rows={4} placeholder="Tell us what you have in mind..."/></label><input type="text" name="website" tabIndex={-1} autoComplete="off" className="honeypot" aria-hidden="true"/><div className="form-bottom"><p>By submitting, you agree to be contacted about your enquiry.</p><button className="button button-blue" disabled={status==='sending'} type="submit">{status==='sending'?'SENDING...':'SEND ENQUIRY'} <ArrowUpRight size={18}/></button></div>{status==='success'&&<p className="form-success" role="status"><CheckCircle2 size={18}/> Thanks — your enquiry has been received.</p>}{status==='error'&&<p className="form-error" role="alert">{error}</p>}</form>;
}
