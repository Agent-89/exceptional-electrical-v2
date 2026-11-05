import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireHqUser,dbAdmin} from '@/lib/hq-auth';
import {updateEnquiryAction} from '../../actions';
import '../../hq.css';
export const dynamic='force-dynamic';
export default async function EnquiryDetail({params}:{params:Promise<{id:string}>}){
 await requireHqUser();
 const {id}=await params;
 if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
 const {data:e,error}=await dbAdmin().from('enquiries').select('*').eq('id',id).maybeSingle();
 if(error||!e)notFound();
 return <main className="hq-detail"><div className="hq-detail-inner"><Link href="/hq" className="hq-back">← Back to HQ</Link><div className="hq-kicker">CUSTOMER ENQUIRY</div><h1>{e.name}</h1><p>Received {new Date(e.created_at).toLocaleString('en-AU',{timeZone:'Australia/Perth'})}</p><div className="hq-detail-grid"><section className="hq-panel"><h2>Enquiry details</h2><dl><dt>Service</dt><dd>{e.service}</dd><dt>Suburb / postcode</dt><dd>{e.suburb||'Not provided'}</dd><dt>Contact preference</dt><dd>{e.contact_preference||'Either'}</dd><dt>Email</dt><dd><a href={'mailto:'+e.email}>{e.email}</a></dd><dt>Phone</dt><dd><a href={'tel:'+e.phone}>{e.phone}</a></dd><dt>Message</dt><dd className="hq-message">{e.message}</dd></dl></section><section className="hq-panel"><h2>Manage enquiry</h2><form action={updateEnquiryAction}><input type="hidden" name="id" value={e.id}/><label>Status<select name="status" defaultValue={e.status}>{['new','contacted','quoted','won','lost'].map(s=><option key={s} value={s}>{s[0].toUpperCase()+s.slice(1)}</option>)}</select></label><button className="hq-primary" type="submit">SAVE STATUS</button></form></section></div></div></main>;
}
