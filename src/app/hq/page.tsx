import Link from 'next/link';
import EnquiryInbox from './enquiry-inbox';
import {requireHqUser,dbAdmin} from '@/lib/hq-auth';
import {logoutAction} from './actions';
import './hq.css';
export const dynamic='force-dynamic';
type Enquiry={id:string;name:string;service:string;service_category:string|null;enquiry_type:string|null;issue_tags:string[]|null;urgency:string|null;follow_up_required:boolean|null;intake_needs_review:boolean|null;requested_date:string|null;status:string;suburb:string|null;created_at:string;email:string};
export default async function HQ(){
 const user=await requireHqUser();
 const {data,error}=await dbAdmin().from('enquiries').select('id,name,service,service_category,enquiry_type,issue_tags,urgency,follow_up_required,intake_needs_review,requested_date,status,suburb,created_at,email').order('created_at',{ascending:false}).limit(100);
 const enquiries=(data??[]) as Enquiry[];
 const count=(status:string)=>enquiries.filter(e=>e.status===status).length;
 return <main className="hq-app"><aside className="hq-sidebar"><div className="hq-brand"><img src="/exceptional-electrical-logo.png" alt="Exceptional Electrical Services" /><small>HQ / OPERATIONS</small></div><nav><Link href="/hq" className="selected">▦ &nbsp; Overview</Link><a href="#enquiries">▤ &nbsp; Enquiries</a><Link href="/hq/customers">♙ &nbsp; Customers</Link><Link href="/hq/quotes">▤ &nbsp; Quotes</Link><span className="hq-nav-disabled">Jobs <small>COMING SOON</small></span><span className="hq-nav-disabled">Scheduling <small>COMING SOON</small></span></nav><div className="hq-sidebar-bottom"><div>{user.name}<small>{user.role.toUpperCase()}</small></div><form action={logoutAction}><button type="submit">Sign out ↗</button></form></div></aside>
 <div className="hq-main"><header className="hq-top"><span>OPERATIONS / OVERVIEW</span><span className="hq-online">● Secure staff workspace</span></header><div className="hq-content"><div className="hq-heading"><div><div className="hq-kicker">EXCEPTIONAL ELECTRICAL HQ</div><h1>Operations overview</h1><p>Manage incoming requests and keep customers moving.</p></div><div className="hq-user">{user.name} <span>· {user.role}</span></div></div>
 <section className="hq-stats"><div><span>RECENT ENQUIRIES</span><strong>{enquiries.length}</strong></div><div><span>NEW</span><strong>{count('new')}</strong></div><div><span>CONTACTED</span><strong>{count('contacted')}</strong></div><div><span>QUALIFIED</span><strong>{count('qualified')}</strong></div></section>
 <section className="hq-panel" id="enquiries"><div className="hq-panel-heading"><div><div className="hq-kicker">INBOX</div><h2>Recent enquiries</h2></div><span>Latest 100</span></div>
 {error?<p role="alert">Enquiries could not be loaded. Please try again.</p>:enquiries.length===0?<p>No enquiries yet. Website submissions will appear here.</p>:<EnquiryInbox enquiries={enquiries}/>}</section></div></div><nav className="hq-mobile-nav" aria-label="Mobile navigation"><Link href="/hq">⌂ <span>Home</span></Link><a href="/hq#enquiries">▤ <span>Enquiries</span></a><Link href="/hq/customers">♙ <span>Customers</span></Link><Link href="/hq/quotes">▤ <span>Quotes</span></Link></nav></main>;
}