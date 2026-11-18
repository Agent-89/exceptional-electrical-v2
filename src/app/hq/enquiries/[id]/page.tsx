import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireOfficeUser,dbAdmin} from '@/lib/hq-auth';
import {canManageAdminOps} from '@/lib/hq-roles';
import {assessEnquiryEmptyDelete} from '@/lib/hq-empty-delete-assess';
import {enquiryUrgencyLabel,resolveEnquiryUrgency} from '@/lib/enquiry-urgency';
import {normalizeEnquiryStatus} from '@/lib/enquiry-status';
import EnquiryWorkspace from './enquiry-workspace';
import ConvertCustomer from './convert-customer';
import EnquiryDangerActions from './enquiry-danger-actions';
import EnquiryStatusPill from './enquiry-status-pill';
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
 return first;
}
function formattedDate(value:string|null){
 if(!value)return null;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
 const date=new Date(value+'T12:00:00+08:00');
 return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Perth',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(date);
}
function serviceName(value:string){const names:Record<string,string>={ev_charger:'EV charger installation',power_points:'Power points',fault_finding:'Fault finding',safety_inspection:'Safety inspection',solar_battery:'Solar & battery',switchboard:'Switchboard',lighting:'Lighting',commercial:'Commercial electrical',maintenance:'Maintenance'};return names[value]||value.replaceAll('_',' ')}
function pretty(value:string|null|undefined){return value?value.charAt(0).toUpperCase()+value.slice(1):'Not provided'}
export default async function EnquiryDetail({params}:{params:Promise<{id:string}>}){
 const user=await requireOfficeUser();
 const {id}=await params;
 if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
 const db=dbAdmin();
 const {data:e,error}=await db.from('enquiries').select('*').eq('id',id).maybeSingle();
 if(error||!e)notFound();
 const emptyDelete=await assessEnquiryEmptyDelete(db,id);
 const {data:activity}=await db.from('enquiry_activity').select('id,actor_id,action,note,created_at').eq('enquiry_id',id).order('created_at',{ascending:false}).limit(100);
 const actorIds=[...new Set((activity??[]).map(item=>item.actor_id).filter((value):value is string=>Boolean(value)))];
 const {data:staff}=actorIds.length?await db.from('staff_profiles').select('user_id,full_name').in('user_id',actorIds):{data:[] as {user_id:string;full_name:string}[]};
 const actorNames=new Map((staff??[]).map(item=>[item.user_id,item.full_name]));
 const msg=String(e.message||'');
 const summary=messageSummary(msg);
 const complaintTags=Array.isArray(e.issue_tags)?e.issue_tags as string[]:[];
 const complaintStructured=complaintTags.includes('customer_concern')||complaintTags.includes('complaint')||e.enquiry_type==='complaint';
 const complaint=/\b(complaint|dissatisf|unhappy|concern|feedback|cleanup|clean.up)\b/i.test(summary);
 const requestedDate=readMeta(msg,'Unverified preferred date (staff review)')||readMeta(msg,'Preferred date');
 const urgencyMeta=readMeta(msg,'Urgency');
 const displayedUrgency=resolveEnquiryUrgency(e.urgency,urgencyMeta);
 const timePreference=readMeta(msg,'Time preference');
 const contactPreference=String(e.contact_preference||'').toLowerCase();
 const phoneOnly=/\b(phone contact only|prefers phone contact only|phone only)\b/i.test(msg);
 const displayedPreference=contactPreference==='either'&&phoneOnly?'Phone requested (verify)':pretty(e.contact_preference);
 const phone=String(e.phone||'').trim();
 const email=String(e.email||'').trim();
 const isEv=/\b(?:ev|av|electric vehicle) charger\b/i.test(msg);
 const serviceDisplay=e.service_category&&e.service_category!=='other'?serviceName(String(e.service_category)):isEv?'EV charger installation':pretty(e.service);
 const hasSecondaryConcern=complaintStructured||complaint;
 const requestLabel=complaintTags.includes('quote_request')||e.enquiry_type==='new_job'?'Quote request':e.enquiry_type==='complaint'?'Customer concern':serviceDisplay+' enquiry';
 const received=new Date(e.created_at).toLocaleString('en-AU',{timeZone:'Australia/Perth',dateStyle:'medium',timeStyle:'short'});
 const status=normalizeEnquiryStatus(e.status);
 return <main className="hq-detail"><div className="hq-detail-inner">
  <Link href="/hq/enquiries" className="hq-back">← Back to enquiries</Link>
  <div className="hq-detail-head"><div><div className="hq-kicker">CUSTOMER ENQUIRY · {'ENQ-'+String(e.reference_number).padStart(4,'0')}</div><div className="hq-detail-labels"><span className="hq-detail-type">{requestLabel}</span>{hasSecondaryConcern&&<span className="hq-detail-type hq-detail-type-warning">Customer concern</span>}</div><h1>{e.name||'Unknown caller'}</h1><p>{serviceDisplay}{e.suburb?' · '+e.suburb:''} · Received {received}</p></div><div className="hq-detail-head-trail"><EnquiryStatusPill enquiryId={e.id} initialStatus={status}/><EnquiryDangerActions enquiryId={e.id} canDelete={canManageAdminOps(user.role)} deleteEligible={emptyDelete.eligible} deleteBlockers={emptyDelete.blockers}/></div></div>
  <div className="hq-detail-actions hq-detail-actions-compact">
   <Link className="hq-detail-action-secondary" href={"/hq/quotes/new?enquiry="+e.id}>+ Create quote</Link>
   {phone&&<a className="hq-detail-action-primary" href={'tel:'+phone}>Call customer</a>}
   {email&&!phone&&<a className="hq-detail-action-secondary" href={'mailto:'+email}>Send email</a>}
   <ConvertCustomer
    enquiryId={e.id}
    initialCustomerId={e.customer_id??null}
    prefill={{
     name:String(e.name||''),
     email,
     phone,
     suburb:String(e.suburb||''),
    }}
   />
  </div>
  <div className="hq-detail-grid hq-detail-grid-action-first"><EnquiryWorkspace id={e.id} initialStatus={e.status} initialReceivedAt={e.created_at} initialHasConcern={hasSecondaryConcern} initialRequestedDate={e.requested_date||requestedDate||''} initialActivity={(activity??[]).map(item=>({...item,actor_name:item.actor_id?actorNames.get(item.actor_id)||'Staff member':'System'}))}/>
   <div className="hq-detail-main">
    {(complaintStructured||complaint)&&<div className="hq-detail-alert"><strong>Customer concern mentioned</strong><p>This enquiry includes feedback or a concern about previous work. Review the details and arrange follow-up where appropriate.</p></div>}
    <section className="hq-panel hq-detail-summary"><div className="hq-kicker">REQUEST OVERVIEW</div><h2>What the customer needs</h2><p className="hq-detail-summary-text">{summary||'No request summary provided.'}</p></section>
    <section className="hq-panel hq-detail-facts"><h2>Enquiry information</h2><div className="hq-fact-grid">
     <div><span>Phone</span><strong>{phone?<a href={'tel:'+phone}>{phone}</a>:'Not provided'}</strong></div>
     <div><span>Email</span><strong>{email?<a href={'mailto:'+email}>{email}</a>:'Not provided'}</strong></div>
     <div><span>Service</span><strong>{serviceDisplay}</strong></div>
     <div><span>Location</span><strong>{e.suburb||'Not provided'}</strong></div>
     <div><span>Contact preference</span><strong>{displayedPreference}</strong></div>
     <div><span>Urgency</span><strong>{enquiryUrgencyLabel(displayedUrgency)}</strong></div>
     <div><span>Requested date</span><strong>{formattedDate(e.requested_date||requestedDate)||'Not specified'}</strong></div>
     <div><span>Preferred time</span><strong>{pretty(e.preferred_time_window||timePreference)}</strong></div>
     <div><span>Request type</span><strong>{requestLabel}</strong></div>
    </div></section>
    <details className="hq-panel hq-detail-original"><summary>Original enquiry record</summary><p className="hq-message">{msg||'No message provided.'}</p></details>
   </div>
   
  </div><div className="hq-footer-user">Signed in as {user.name}</div></div></main>;
}
