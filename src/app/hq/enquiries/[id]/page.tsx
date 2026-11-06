import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireHqUser,dbAdmin} from '@/lib/hq-auth';
import EnquiryWorkspace from './enquiry-workspace';
import ConvertCustomer from './convert-customer';
import '../../hq.css';
export const dynamic='force-dynamic';
function readMeta(message:string,key:string){
 const line=message.split(/\r?\n/).find(l=>l.toLowerCase().startsWith(key.toLowerCase()+':'));
 return line?.slice(key.length+1).trim()||null;
}
function messageSummary(message:string){
 const lines=message.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const content=lines.filter(s=>!(/^(call id|urgency|time preference|unverified preferred date|preferred date):/i.test(s)));
 const first=content[0]||'';
 return [first,...content.slice(1).filter(s=>!(/^(customer prefers|original date wording)/i.test(s))&&!first.toLowerCase().includes(s.toLowerCase()))].filter(Boolean).join(' ');
}
function formattedDate(value:string|null){
 if(!value)return null;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
 const date=new Date(value+'T12:00:00+08:00');
 return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Perth',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(date);
}
function pretty(value:string|null|undefined){return value?value.charAt(0).toUpperCase()+value.slice(1):'Not provided'}
export default async function EnquiryDetail({params}:{params:Promise<{id:string}>}){
 const user=await requireHqUser();
 const {id}=await params;
 if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
 const {data:e,error}=await dbAdmin().from('enquiries').select('*').eq('id',id).maybeSingle();
 if(error||!e)notFound();
 const {data:activity}=await dbAdmin().from('enquiry_activity').select('id,actor_id,action,note,created_at').eq('enquiry_id',id).order('created_at',{ascending:false}).limit(100);
 const actorIds=[...new Set((activity??[]).map(item=>item.actor_id).filter((value):value is string=>Boolean(value)))];
 const {data:staff}=actorIds.length?await dbAdmin().from('staff_profiles').select('user_id,full_name').in('user_id',actorIds):{data:[] as {user_id:string;full_name:string}[]};
 const actorNames=new Map((staff??[]).map(item=>[item.user_id,item.full_name]));
 const msg=String(e.message||'');
 const summary=messageSummary(msg);
 const complaint=/\b(complaint|dissatisf|unhappy|concern|feedback|cleanup|clean.up)\b/i.test(summary);
 const requestedDate=readMeta(msg,'Unverified preferred date (staff review)')||readMeta(msg,'Preferred date');
 const urgency=readMeta(msg,'Urgency');
 const timePreference=readMeta(msg,'Time preference');
 const contactPreference=String(e.contact_preference||'').toLowerCase();
 const phoneOnly=/\b(phone contact only|prefers phone contact only|phone only)\b/i.test(msg);
 const displayedPreference=contactPreference==='either'&&phoneOnly?'Phone requested (verify)':pretty(e.contact_preference);
 const phone=String(e.phone||'').trim();
 const email=String(e.email||'').trim();
 const isEv=/\b(ev charger|electric vehicle charger)\b/i.test(msg);
 const requestLabel=isEv?'EV charger installation':complaint?'Quote request + customer concern':pretty(e.service)+' enquiry';
 const received=new Date(e.created_at).toLocaleString('en-AU',{timeZone:'Australia/Perth',dateStyle:'medium',timeStyle:'short'});
 return <main className="hq-detail"><div className="hq-detail-inner">
  <Link href="/hq#enquiries" className="hq-back">← Back to enquiries</Link>
  <div className="hq-detail-head"><div><div className="hq-kicker">CUSTOMER ENQUIRY</div><div className="hq-detail-type">{requestLabel}</div><h1>{e.name||'Unknown caller'}</h1><p>{pretty(e.service)}{e.suburb?' · '+e.suburb:''} · Received {received}</p></div><span className={'hq-status hq-status-'+e.status}>{pretty(e.status)}</span></div>
  <div className="hq-detail-actions">{phone&&<a className="hq-detail-action-primary" href={'tel:'+phone}>Call customer</a>}{email&&<a className="hq-detail-action-secondary" href={'mailto:'+email}>Send email</a>}<div className="hq-detail-convert"><ConvertCustomer enquiryId={e.id} initialCustomerId={e.customer_id??null}/></div></div>
  <div className="hq-detail-grid">
   <div className="hq-detail-main">
    {complaint&&<div className="hq-detail-alert"><strong>Customer concern mentioned</strong><p>This enquiry includes feedback or a concern about previous work. Review the details and arrange follow-up where appropriate.</p></div>}
    <section className="hq-panel hq-detail-summary"><div className="hq-kicker">REQUEST OVERVIEW</div><h2>What the customer needs</h2><p className="hq-detail-summary-text">{summary||'No request summary provided.'}</p></section>
    <section className="hq-panel hq-detail-facts"><h2>Enquiry information</h2><div className="hq-fact-grid">
     <div><span>Service</span><strong>{pretty(e.service)}</strong></div>
     <div><span>Location</span><strong>{e.suburb||'Not provided'}</strong></div>
     <div><span>Phone</span><strong>{phone?<a href={'tel:'+phone}>{phone}</a>:'Not provided'}</strong></div>
     <div><span>Email</span><strong>{email?<a href={'mailto:'+email}>{email}</a>:'Not provided'}</strong></div>
     <div><span>Contact preference</span><strong>{displayedPreference}</strong></div>
     <div><span>Urgency</span><strong>{pretty(urgency)}</strong></div>
     <div><span>Requested date</span><strong>{formattedDate(requestedDate)||'Not specified'}</strong>{requestedDate&&<small>Staff confirmation required — not a booking</small>}</div>
     <div><span>Preferred time</span><strong>{pretty(timePreference)}</strong></div>
    </div></section>
    <details className="hq-panel hq-detail-original"><summary>Original enquiry record</summary><p className="hq-message">{msg||'No message provided.'}</p></details>
   </div>
   <EnquiryWorkspace id={e.id} initialStatus={e.status} initialActivity={(activity??[]).map(item=>({...item,actor_name:item.actor_id?actorNames.get(item.actor_id)||'Staff member':'System'}))}/>
  </div><div className="hq-footer-user">Signed in as {user.name}</div></div></main>;
}
