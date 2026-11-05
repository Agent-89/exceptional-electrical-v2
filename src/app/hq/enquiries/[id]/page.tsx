import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireHqUser,dbAdmin} from '@/lib/hq-auth';
import EnquiryWorkspace from './enquiry-workspace';
import '../../hq.css';
export const dynamic='force-dynamic';
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
 return <main className="hq-detail"><div className="hq-detail-inner"><Link href="/hq" className="hq-back">← Back to HQ</Link><div className="hq-kicker">CUSTOMER ENQUIRY</div><h1>{e.name}</h1><p>Received {new Date(e.created_at).toLocaleString('en-AU',{timeZone:'Australia/Perth'})}</p><div className="hq-detail-grid"><section className="hq-panel"><h2>Enquiry details</h2><dl><dt>Service</dt><dd>{e.service}</dd><dt>Suburb / postcode</dt><dd>{e.suburb||'Not provided'}</dd><dt>Contact preference</dt><dd>{e.contact_preference||'Either'}</dd><dt>Email</dt><dd><a href={'mailto:'+e.email}>{e.email}</a></dd><dt>Phone</dt><dd><a href={'tel:'+e.phone}>{e.phone}</a></dd><dt>Message</dt><dd className="hq-message">{e.message}</dd></dl></section></div><EnquiryWorkspace id={e.id} initialStatus={e.status} initialActivity={(activity??[]).map(item=>({...item,actor_name:item.actor_id?actorNames.get(item.actor_id)||'Staff member':'System'}))}/>
 <div className="hq-footer-user">Signed in as {user.name}</div></div></main>;
}
