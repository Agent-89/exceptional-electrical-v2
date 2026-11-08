import Link from 'next/link';
import {requireHqUser,dbAdmin} from '@/lib/hq-auth';
import './hq.css';
export const dynamic='force-dynamic';
type Enquiry={id:string;name:string|null;service:string|null;status:string;follow_up_required:boolean|null;intake_needs_review:boolean|null;created_at:string;suburb:string|null};
type Quote={id:string;quote_number:string;title:string|null;status:string;updated_at:string};
export default async function HQ(){
 const user=await requireHqUser();
 const db=dbAdmin();
 const [enquiryResult,quoteResult]=await Promise.all([
  db.from('enquiries').select('id,name,service,status,follow_up_required,intake_needs_review,created_at,suburb').order('created_at',{ascending:false}).limit(100),
  db.from('quotes').select('id,quote_number,title,status,updated_at').order('updated_at',{ascending:false}).limit(100)
 ]);
 const enquiries=(enquiryResult.data??[]) as Enquiry[];
 const quotes=(quoteResult.data??[]) as Quote[];
 const newEnquiries=enquiries.filter(e=>e.status==='new');
 const followUps=enquiries.filter(e=>e.follow_up_required===true);
 const review=enquiries.filter(e=>e.intake_needs_review===true);
 const pendingQuotes=quotes.filter(q=>['pending_approval','awaiting_approval','submitted_for_approval','ready_for_approval'].includes(q.status));
 const attention=[...newEnquiries.slice(0,3).map(e=>({id:'e'+e.id,href:'/hq/enquiries/'+e.id,title:e.name||'Unknown caller',detail:e.service||'New enquiry',label:'New enquiry'})),...review.filter(e=>!newEnquiries.some(n=>n.id===e.id)).slice(0,2).map(e=>({id:'r'+e.id,href:'/hq/enquiries/'+e.id,title:e.name||'Unknown caller',detail:'Verify call details',label:'Needs review'})),...followUps.filter(e=>!newEnquiries.some(n=>n.id===e.id)&&!review.some(r=>r.id===e.id)).slice(0,2).map(e=>({id:'f'+e.id,href:'/hq/enquiries/'+e.id,title:e.name||'Unknown caller',detail:'Follow-up required',label:'Follow-up'})),...pendingQuotes.slice(0,2).map(q=>({id:'q'+q.id,href:'/hq/quotes/'+q.id,title:q.quote_number,detail:q.title||'Quote awaiting approval',label:'Quote approval'}))].slice(0,6);
 const hasErrors=Boolean(enquiryResult.error||quoteResult.error);
 return <main className="hq-dashboard"><div className="hq-dashboard-inner">
  <div className="hq-dashboard-heading"><div className="hq-kicker">EXCEPTIONAL ELECTRICAL HQ · OPERATIONS</div><h1>Home</h1><p>Welcome back, {user.name}. Here’s what needs attention.</p></div>
  {hasErrors&&<p className="hq-dashboard-alert" role="alert">Some dashboard data could not be loaded. Counts may be incomplete.</p>}
  <section className="hq-dashboard-section" aria-labelledby="attention-title">
   <div className="hq-dashboard-section-head"><div><div className="hq-kicker">YOUR PRIORITIES</div><h2 id="attention-title">Needs attention</h2></div><Link href="/hq/enquiries">Open inbox →</Link></div>
   <div className="hq-dashboard-metrics">
    <Link href="/hq/enquiries"><span>New enquiries</span><strong>{newEnquiries.length}</strong><small>Review incoming requests →</small></Link>
    <Link href="/hq/enquiries"><span>Follow-ups flagged</span><strong>{followUps.length}</strong><small>Check who needs a response →</small></Link>
    <Link href="/hq/enquiries"><span>Call details to verify</span><strong>{review.length}</strong><small>Confirm receptionist intake →</small></Link>
    <Link href="/hq/quotes"><span>Quotes awaiting approval</span><strong>{pendingQuotes.length}</strong><small>Review quote register →</small></Link>
   </div>
   <div className="hq-dashboard-queue">
    <div className="hq-dashboard-queue-title"><h3>Priority inbox</h3><span>Recent items requiring action</span></div>
    {attention.length?attention.map(item=><Link key={item.id} href={item.href} className="hq-dashboard-queue-item"><div><strong>{item.title}</strong><small>{item.detail}</small></div><span>{item.label} <b aria-hidden="true">→</b></span></Link>):<p className="hq-dashboard-empty">No outstanding items in the current dashboard results.</p>}
   </div>
  </section>
  <section className="hq-dashboard-section" aria-labelledby="quick-title"><div className="hq-dashboard-section-head"><div><div className="hq-kicker">GET THINGS DONE</div><h2 id="quick-title">Quick actions</h2></div></div>
   <div className="hq-dashboard-actions"><Link href="/hq/quotes/new"><span aria-hidden="true">＋</span><strong>Create quote</strong><small>Start a new quotation</small></Link><Link href="/hq/customers"><span aria-hidden="true">♙</span><strong>Customers</strong><small>Find or add a customer</small></Link><Link href="/hq/enquiries"><span aria-hidden="true">▤</span><strong>Enquiry inbox</strong><small>Review all requests</small></Link></div>
  </section>
  <section className="hq-dashboard-section" aria-labelledby="activity-title"><div className="hq-dashboard-section-head"><div><div className="hq-kicker">BUSINESS ACTIVITY</div><h2 id="activity-title">Recently updated quotes</h2></div><Link href="/hq/quotes">All quotes →</Link></div>
   <div className="hq-dashboard-queue">{quotes.length?quotes.slice(0,4).map(q=><Link key={q.id} href={'/hq/quotes/'+q.id} className="hq-dashboard-queue-item"><div><strong>{q.quote_number} · {q.title||'Untitled quote'}</strong><small>Updated {new Date(q.updated_at).toLocaleDateString('en-AU',{timeZone:'Australia/Perth'})}</small></div><span>{q.status.replaceAll('_',' ')} <b aria-hidden="true">→</b></span></Link>):<p className="hq-dashboard-empty">No quotes yet. Create one to get started.</p>}</div>
  </section>
  <p className="hq-dashboard-footnote">Dashboard figures reflect the latest 100 enquiries and 100 quotes. Follow-up counts represent flagged enquiries, not overdue deadlines.</p>
 </div></main>;
}
