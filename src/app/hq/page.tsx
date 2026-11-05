import Link from 'next/link';
import {requireHqUser,dbAdmin} from '@/lib/hq-auth';
import {logoutAction} from './actions';
import './hq.css';
export const dynamic='force-dynamic';
type Enquiry={id:string;name:string;service:string;status:string;suburb:string|null;created_at:string;email:string};
export default async function HQ(){
 const user=await requireHqUser();
 const {data,error}=await dbAdmin().from('enquiries').select('id,name,service,status,suburb,created_at,email').order('created_at',{ascending:false}).limit(100);
 const enquiries=(data??[]) as Enquiry[];
 const count=(status:string)=>enquiries.filter(e=>e.status===status).length;
 return <main className="hq-app"><aside className="hq-sidebar"><div className="hq-brand">EXCEPTIONAL <span>ELECTRICAL</span><small>HQ / OPERATIONS</small></div><nav><Link href="/hq" className="selected">▦ &nbsp; Overview</Link><a href="#enquiries">▤ &nbsp; Enquiries</a><span className="hq-nav-disabled">Customers <small>COMING SOON</small></span><span className="hq-nav-disabled">Jobs <small>COMING SOON</small></span><span className="hq-nav-disabled">Scheduling <small>COMING SOON</small></span></nav><div className="hq-sidebar-bottom"><div>{user.name}<small>{user.role.toUpperCase()}</small></div><form action={logoutAction}><button type="submit">Sign out ↗</button></form></div></aside>
 <div className="hq-main"><header className="hq-top"><span>OPERATIONS / OVERVIEW</span><span className="hq-online">● Secure staff workspace</span></header><div className="hq-content"><div className="hq-heading"><div><div className="hq-kicker">EXCEPTIONAL ELECTRICAL HQ</div><h1>Good to see you.</h1><p>Here’s what’s happening with your incoming enquiries.</p></div><div className="hq-user">{user.name} <span>· {user.role}</span></div></div>
 <section className="hq-stats"><div><span>RECENT ENQUIRIES</span><strong>{enquiries.length}</strong></div><div><span>NEW</span><strong>{count('new')}</strong></div><div><span>CONTACTED</span><strong>{count('contacted')}</strong></div><div><span>QUALIFIED</span><strong>{count('qualified')}</strong></div></section>
 <section className="hq-panel" id="enquiries"><div className="hq-panel-heading"><div><div className="hq-kicker">INBOX</div><h2>Recent enquiries</h2></div><span>Latest 100</span></div>
 {error?<p role="alert">Enquiries could not be loaded. Please try again.</p>:enquiries.length===0?<p>No enquiries yet. Website submissions will appear here.</p>:<div className="hq-table-wrap"><table><thead><tr><th>CUSTOMER</th><th>SERVICE</th><th>LOCATION</th><th>RECEIVED</th><th>STATUS</th><th></th></tr></thead><tbody>{enquiries.map(e=><tr key={e.id}><td><strong>{e.name}</strong><small>{e.email}</small></td><td>{e.service}</td><td>{e.suburb||'—'}</td><td>{new Date(e.created_at).toLocaleDateString('en-AU',{timeZone:'Australia/Perth',day:'numeric',month:'short',year:'numeric'})}</td><td><span className={'hq-status hq-status-'+e.status}>{e.status}</span></td><td><Link href={'/hq/enquiries/'+e.id}>View →</Link></td></tr>)}</tbody></table></div>}</section></div></div></main>;
}