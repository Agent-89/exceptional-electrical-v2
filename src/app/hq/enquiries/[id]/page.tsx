import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireHqUser,dbAdmin} from '@/lib/hq-auth';
import {updateEnquiryAction,addEnquiryNoteAction} from '../../actions';
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
 return <main className="hq-detail"><div className="hq-detail-inner"><Link href="/hq" className="hq-back">← Back to HQ</Link><div className="hq-kicker">CUSTOMER ENQUIRY</div><h1>{e.name}</h1><p>Received {new Date(e.created_at).toLocaleString('en-AU',{timeZone:'Australia/Perth'})}</p><div className="hq-detail-grid"><section className="hq-panel"><h2>Enquiry details</h2><dl><dt>Service</dt><dd>{e.service}</dd><dt>Suburb / postcode</dt><dd>{e.suburb||'Not provided'}</dd><dt>Contact preference</dt><dd>{e.contact_preference||'Either'}</dd><dt>Email</dt><dd><a href={'mailto:'+e.email}>{e.email}</a></dd><dt>Phone</dt><dd><a href={'tel:'+e.phone}>{e.phone}</a></dd><dt>Message</dt><dd className="hq-message">{e.message}</dd></dl></section><section className="hq-panel"><h2>Manage enquiry</h2><form action={updateEnquiryAction}><input type="hidden" name="id" value={e.id}/><label>Status<select name="status" defaultValue={e.status}>{['new','contacted','qualified','scheduled','closed','spam'].map(s=><option key={s} value={s}>{s[0].toUpperCase()+s.slice(1)}</option>)}</select></label><button className="hq-primary" type="submit">SAVE STATUS</button></form><div className="hq-note-editor"><h2>Internal note</h2><p>Only approved staff can see these notes.</p><form action={addEnquiryNoteAction}><input type="hidden" name="id" value={e.id}/><label htmlFor="hq-note">Add a note<textarea id="hq-note" name="note" minLength={2} maxLength={3000} rows={5} required placeholder="Call summary, next steps, or important customer details..."/></label><button className="hq-primary" type="submit">ADD NOTE</button></form></div></section></div>
 <section className="hq-panel hq-activity"><div className="hq-kicker">AUDIT TRAIL</div><h2>Activity history</h2>{!activity?.length?<p>No activity recorded yet.</p>:<ol>{activity.map(item=><li key={item.id}><div><strong>{item.action==='note_added'?'Internal note':item.action==='status_changed'?'Status changed':item.action.replaceAll('_',' ')}</strong><span>{new Date(item.created_at).toLocaleString('en-AU',{timeZone:'Australia/Perth'})} · {item.actor_id?actorNames.get(item.actor_id)||'Staff member':'System'}</span></div>{item.note&&<p>{item.note}</p>}</li>)}</ol>}</section>
 <div className="hq-footer-user">Signed in as {user.name}</div></div></main>;
}
