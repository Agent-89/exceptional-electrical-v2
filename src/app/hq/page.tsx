import Link from 'next/link';
import {FilePlus2,UsersRound,Inbox} from 'lucide-react';
import {requireOfficeUser,dbAdmin} from '@/lib/hq-auth';
import './hq.css';
export const dynamic='force-dynamic';
type Enquiry={id:string;name:string|null;service:string|null;status:string;follow_up_required:boolean|null;intake_needs_review:boolean|null;created_at:string;suburb:string|null};
type Quote={id:string;quote_number:string;title:string|null;status:string;updated_at:string};
export default async function HQ(){
 const user=await requireOfficeUser();
 const db=dbAdmin();
 const [enquiryResult,quoteResult,newCount,followUpCount,reviewCount,pendingCount]=await Promise.all([
  db.from('enquiries').select('id,name,service,status,follow_up_required,intake_needs_review,created_at,suburb').order('created_at',{ascending:false}).limit(30),
  db.from('quotes').select('id,quote_number,title,status,updated_at').order('updated_at',{ascending:false}).limit(12),
  db.from('enquiries').select('id',{count:'exact',head:true}).eq('status','new'),
  db.from('enquiries').select('id',{count:'exact',head:true}).eq('follow_up_required',true),
  db.from('enquiries').select('id',{count:'exact',head:true}).eq('intake_needs_review',true),
  db.from('quotes').select('id',{count:'exact',head:true}).in('status',['pending_approval','awaiting_approval','submitted_for_approval','ready_for_approval'])
 ]);
 const enquiries=(enquiryResult.data??[]) as Enquiry[];
 const quotes=(quoteResult.data??[]) as Quote[];
 const newEnquiries=enquiries.filter(e=>e.status==='new');
 const followUps=enquiries.filter(e=>e.follow_up_required===true);
 const review=enquiries.filter(e=>e.intake_needs_review===true);
 const pendingQuotes=quotes.filter(q=>['pending_approval','awaiting_approval','submitted_for_approval','ready_for_approval'].includes(q.status));
 const seen=new Set<string>();
 const attention=[
  ...review.map(e=>({id:e.id,href:'/hq/enquiries/'+e.id,title:e.name||'Unknown caller',detail:'Confirm receptionist intake details',label:'Verify call'})),
  ...followUps.map(e=>({id:e.id,href:'/hq/enquiries/'+e.id,title:e.name||'Unknown caller',detail:'Customer follow-up required',label:'Follow up'})),
  ...pendingQuotes.map(q=>({id:'q'+q.id,href:'/hq/quotes/'+q.id,title:q.quote_number,detail:q.title||'Owner review required',label:'Approve quote'})),
  ...newEnquiries.map(e=>({id:e.id,href:'/hq/enquiries/'+e.id,title:e.name||'Unknown caller',detail:e.service||'Awaiting first contact',label:'New enquiry'}))
 ].filter(item=>{if(seen.has(item.id))return false;seen.add(item.id);return true}).slice(0,6);
 const hasErrors=Boolean(enquiryResult.error||quoteResult.error||newCount.error||followUpCount.error||reviewCount.error||pendingCount.error);
 return <main className="hq-dashboard"><div className="hq-dashboard-inner">
  <div className="hq-dashboard-heading"><div className="hq-kicker">EXCEPTIONAL ELECTRICAL HQ · OPERATIONS</div><h1>Home</h1><p>Welcome back, {user.name}. Here’s what needs attention.</p></div>
  {hasErrors&&<p className="hq-dashboard-alert" role="alert">Some dashboard data could not be loaded. Counts may be incomplete.</p>}
  <section className="hq-dashboard-section" aria-labelledby="attention-title">
   <div className="hq-dashboard-section-head"><div><div className="hq-kicker">YOUR PRIORITIES</div><h2 id="attention-title">Needs attention</h2></div><Link href="/hq/enquiries">Open inbox →</Link></div>
   <div className="hq-dashboard-metrics">
    <Link href="/hq/enquiries"><span>New enquiries</span><strong>{newCount.count??'—'}</strong><small>Review incoming requests →</small></Link>
    <Link href="/hq/enquiries"><span>Follow-ups flagged</span><strong>{followUpCount.count??'—'}</strong><small>Check who needs a response →</small></Link>
    <Link href="/hq/enquiries"><span>Call details to verify</span><strong>{reviewCount.count??'—'}</strong><small>Confirm receptionist intake →</small></Link>
    <Link href="/hq/quotes"><span>Quotes awaiting approval</span><strong>{pendingCount.count??'—'}</strong><small>Review quote register →</small></Link>
   </div>
   <div className="hq-dashboard-queue">
    <div className="hq-dashboard-queue-title"><h3>Priority inbox</h3><span>Recent items requiring action</span></div>
    {attention.length?attention.map(item=><Link key={item.id} href={item.href} className="hq-dashboard-queue-item"><div><strong>{item.title}</strong><small>{item.detail}</small></div><span>{item.label} <b aria-hidden="true">→</b></span></Link>):<p className="hq-dashboard-empty">No outstanding items in the current dashboard results.</p>}
   </div>
  </section>
  <section className="hq-dashboard-section" aria-labelledby="quick-title"><div className="hq-dashboard-section-head"><div><div className="hq-kicker">GET THINGS DONE</div><h2 id="quick-title">Quick actions</h2></div></div>
   <div className="hq-dashboard-actions"><Link href="/hq/quotes/new"><span aria-hidden="true"><FilePlus2 size={22} strokeWidth={1.9}/></span><strong>Create quote</strong><small>Start a new quotation</small></Link><Link href="/hq/customers"><span aria-hidden="true"><UsersRound size={22} strokeWidth={1.9}/></span><strong>Customers</strong><small>Find or add a customer</small></Link><Link href="/hq/enquiries"><span aria-hidden="true"><Inbox size={22} strokeWidth={1.9}/></span><strong>Enquiry inbox</strong><small>Review all requests</small></Link></div>
  </section>
  <section className="hq-dashboard-section" aria-labelledby="activity-title"><div className="hq-dashboard-section-head"><div><div className="hq-kicker">BUSINESS ACTIVITY</div><h2 id="activity-title">Recently updated quotes</h2></div><Link href="/hq/quotes">All quotes →</Link></div>
   <div className="hq-dashboard-queue">{quotes.length?quotes.slice(0,4).map(q=><Link key={q.id} href={'/hq/quotes/'+q.id} className="hq-dashboard-queue-item"><div><strong>{q.quote_number} · {q.title||'Untitled quote'}</strong><small>Updated {new Date(q.updated_at).toLocaleDateString('en-AU',{timeZone:'Australia/Perth'})}</small></div><span>{q.status.replaceAll('_',' ')} <b aria-hidden="true">→</b></span></Link>):<p className="hq-dashboard-empty">No quotes yet. Create one to get started.</p>}</div>
  </section>

 </div></main>;
}
