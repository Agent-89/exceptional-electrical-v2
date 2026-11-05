import Link from 'next/link';
import {notFound} from 'next/navigation';
import {dbAdmin,requireHqUser} from '@/lib/hq-auth';
import '../../hq.css';
export const dynamic='force-dynamic';
export default async function CustomerDetail({params}:{params:Promise<{id:string}>}){
 await requireHqUser();
 const {id}=await params;
 if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
 const db=dbAdmin();
 const {data:c}=await db.from('customers').select('id,name,email,phone,created_at').eq('id',id).maybeSingle();
 if(!c)notFound();
 const {data:enquiries}=await db.from('enquiries').select('id,service,status,created_at,message').eq('customer_id',id).order('created_at',{ascending:false}).limit(100);
 return <main className="hq-detail"><div className="hq-detail-inner"><Link href="/hq/customers" className="hq-back">← Back to customers</Link><div className="hq-kicker" style={{marginTop:28}}>CUSTOMER PROFILE</div><h1>{c.name}</h1><div className="hq-detail-grid"><section className="hq-panel"><h2>Contact details</h2><dl><dt>Email</dt><dd>{c.email?<a href={'mailto:'+c.email}>{c.email}</a>:'Not provided'}</dd><dt>Phone</dt><dd>{c.phone?<a href={'tel:'+c.phone}>{c.phone}</a>:'Not provided'}</dd><dt>Customer since</dt><dd>{new Date(c.created_at).toLocaleDateString('en-AU',{timeZone:'Australia/Perth'})}</dd></dl></section><section className="hq-panel"><h2>Customer history</h2><p>{(enquiries??[]).length} linked enquiries</p><p>Service addresses and job history will be added in the next CRM milestone.</p></section></div><section className="hq-panel" style={{marginTop:20}}><h2>Enquiries</h2>{!enquiries?.length?<p>No linked enquiries yet.</p>:<div className="hq-table-wrap"><table><thead><tr><th>DATE</th><th>SERVICE</th><th>STATUS</th><th>DETAILS</th></tr></thead><tbody>{enquiries.map(e=><tr key={e.id}><td>{new Date(e.created_at).toLocaleDateString('en-AU',{timeZone:'Australia/Perth'})}</td><td>{e.service}</td><td><span className="hq-status">{e.status}</span></td><td><Link href={'/hq/enquiries/'+e.id}>View enquiry →</Link></td></tr>)}</tbody></table></div>}</section></div></main>;
}