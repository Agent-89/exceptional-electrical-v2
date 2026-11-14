import CustomerEditor, {CustomerNoteForm} from './customer-editor';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {dbAdmin,requireHqUser} from '@/lib/hq-auth';
import '../../hq.css';
export const dynamic='force-dynamic';

function quoteAmountIncGst(items:{quantity:number|string;unit_price_cents:number|string;gst_applicable:boolean|null}[]|null|undefined){
 if(!items?.length)return 0;
 return items.reduce((sum,item)=>{
  const qty=Number(item.quantity)||0;
  const unit=Number(item.unit_price_cents)||0;
  const ex=Math.round(qty*unit);
  return sum+ex+(item.gst_applicable===false?0:Math.round(ex*0.1));
 },0);
}

const money=(cents:number)=>cents.toLocaleString('en-AU',{style:'currency',currency:'AUD'});

export default async function CustomerDetail({params}:{params:Promise<{id:string}>}){
 await requireHqUser();
 const {id}=await params;
 if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
 const db=dbAdmin();
 const {data:c}=await db.from('customers').select('id,name,email,phone,created_at').eq('id',id).maybeSingle();
 if(!c)notFound();
 const {data:enquiries}=await db.from('enquiries').select('id,service,status,created_at,message').eq('customer_id',id).order('created_at',{ascending:false}).limit(100);
 const [{data:addresses},{data:notes},{data:jobs},{data:quotes}]=await Promise.all([
  db.from('customer_addresses').select('id,label,address_line1,address_line2,suburb,state,postcode,notes').eq('customer_id',id).order('created_at',{ascending:false}),
  db.from('customer_notes').select('id,note,created_at').eq('customer_id',id).order('created_at',{ascending:false}).limit(100),
  db.from('jobs').select('id,job_number,title,status,created_at').eq('customer_id',id).order('created_at',{ascending:false}).limit(50),
  db.from('quotes').select('id,quote_number,title,status,created_at,quote_items(quantity,unit_price_cents,gst_applicable)').eq('customer_id',id).order('created_at',{ascending:false}).limit(50),
 ]);
 const enquiryCount=(enquiries??[]).length;
 const quoteCount=(quotes??[]).length;
 const jobCount=(jobs??[]).length;
 return <main className="hq-detail"><div className="hq-detail-inner"><Link href="/hq/customers" className="hq-back">← Back to customers</Link><div className="hq-kicker" style={{marginTop:28}}>CUSTOMER PROFILE</div><h1>{c.name}</h1><CustomerEditor customer={c}/><div className="hq-detail-grid hq-crm-profile-grid"><section className="hq-panel"><h2>Contact details</h2><dl><dt>Email</dt><dd>{c.email?<a href={'mailto:'+c.email}>{c.email}</a>:'Not provided'}</dd><dt>Phone</dt><dd>{c.phone?<a href={'tel:'+c.phone}>{c.phone}</a>:'Not provided'}</dd><dt>Customer since</dt><dd>{new Date(c.created_at).toLocaleDateString('en-AU',{timeZone:'Australia/Perth'})}</dd></dl></section><section className="hq-panel"><h2>Service addresses</h2>{!addresses?.length?<p>No addresses added yet. Use + Service address above to add a property.</p>:<div className="hq-crm-records">{addresses.map(a=><div key={a.id}><strong>{a.label}</strong><p>{a.address_line1}{a.address_line2?', '+a.address_line2:''}, {a.suburb} {a.state} {a.postcode}</p>{a.notes&&<small>{a.notes}</small>}</div>)}</div>}</section></div><div className="hq-detail-grid hq-crm-profile-grid"><section className="hq-panel"><h2>Customer history</h2><p>{enquiryCount} linked {enquiryCount===1?'enquiry':'enquiries'} · {quoteCount} {quoteCount===1?'quote':'quotes'} · {jobCount} {jobCount===1?'job':'jobs'}</p>{!jobs?.length?<p>No jobs yet.</p>:<div className="hq-crm-records">{jobs.map(j=><div key={j.id}><strong>JB{String(j.job_number).padStart(5,'0')}</strong> · <span className="hq-status">{j.status}</span><p>{j.title}</p><Link href={'/hq/jobs/'+j.id}>View job →</Link></div>)}</div>}</section><section className="hq-panel"><h2>Internal notes</h2>{!notes?.length?<p>No notes yet.</p>:<div className="hq-crm-records">{notes.map(n=><div key={n.id}><small>{new Date(n.created_at).toLocaleString('en-AU',{timeZone:'Australia/Perth'})}</small><p>{n.note}</p></div>)}</div>}<CustomerNoteForm customerId={id}/></section></div><section className="hq-panel" style={{marginTop:20}}><h2>Quotes</h2>{!quotes?.length?<p>No linked quotes yet.</p>:<div className="hq-table-wrap"><table><thead><tr><th>REFERENCE</th><th>STATUS</th><th>DATE</th><th>AMOUNT</th><th>DETAILS</th></tr></thead><tbody>{quotes.map(q=>{const items=Array.isArray(q.quote_items)?q.quote_items:[];const amount=quoteAmountIncGst(items);return <tr key={q.id}><td><strong>{q.quote_number}</strong><div className="hq-crm-quote-title">{q.title||'Untitled quote'}</div></td><td><span className="hq-status">{q.status}</span></td><td>{new Date(q.created_at).toLocaleDateString('en-AU',{timeZone:'Australia/Perth'})}</td><td>{money(amount)}</td><td><Link href={'/hq/quotes/'+q.id}>View quote →</Link></td></tr>})}</tbody></table></div>}</section><section className="hq-panel" style={{marginTop:20}}><h2>Enquiries</h2>{!enquiries?.length?<p>No linked enquiries yet.</p>:<div className="hq-table-wrap"><table><thead><tr><th>DATE</th><th>SERVICE</th><th>STATUS</th><th>DETAILS</th></tr></thead><tbody>{enquiries.map(e=><tr key={e.id}><td>{new Date(e.created_at).toLocaleDateString('en-AU',{timeZone:'Australia/Perth'})}</td><td>{e.service}</td><td><span className="hq-status">{e.status}</span></td><td><Link href={'/hq/enquiries/'+e.id}>View enquiry →</Link></td></tr>)}</tbody></table></div>}</section></div><style>{`.hq-crm-quote-title{margin-top:4px;color:#718294;font-size:12px;font-weight:500;line-height:1.4}`}</style></main>;
}
