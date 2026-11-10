import Link from 'next/link';
import {notFound} from 'next/navigation';
import {dbAdmin,requireHqUser} from '@/lib/hq-auth';
import {updateJob} from '../actions';
import '../../hq.css';
export const dynamic='force-dynamic';
const statuses=['unassigned','scheduled','in_progress','on_hold','completed','cancelled'];
export default async function JobPage({params}:{params:Promise<{id:string}>}){
 const user=await requireHqUser();const {id}=await params;const db=dbAdmin();
 const {data:job}=await db.from('jobs').select('*').eq('id',id).maybeSingle();if(!job)notFound();
 const [{data:customer},{data:activity}]=await Promise.all([job.customer_id?db.from('customers').select('name,email,phone').eq('id',job.customer_id).maybeSingle():Promise.resolve({data:null}),db.from('job_activity').select('id,action,note,created_at').eq('job_id',id).order('created_at',{ascending:false}).limit(50)]);
 return <main className="hq-detail"><div className="hq-detail-inner"><Link className="hq-back" href="/hq/jobs">← All jobs</Link><div className="hq-detail-head"><div><div className="hq-kicker">JOB JB{String(job.job_number).padStart(5,'0')}</div><h1>{job.title}</h1><p>{customer?.name??'Customer not assigned'} · {job.priority} priority</p></div></div><section className="hq-panel"><h2>Job overview</h2><p>{job.description||'No description yet.'}</p><p><strong>Site:</strong> {job.site_address_text||'Not set'}</p><p><strong>Scheduled:</strong> {job.scheduled_start?new Date(job.scheduled_start).toLocaleString('en-AU',{timeZone:'Australia/Perth'}):'Not scheduled'}</p><p><strong>Contact:</strong> {customer?.phone||customer?.email||'Not provided'}</p>{job.tradify_reference&&<p><strong>Tradify reference:</strong> {job.tradify_reference}</p>}</section>
 {['owner','admin','office'].includes(user.role)&&<section className="hq-panel"><h2>Update job</h2><form action={updateJob} style={{display:'grid',gap:12,maxWidth:560}}><input type="hidden" name="id" value={job.id}/><label htmlFor="job-status">Status</label><select id="job-status" name="status" defaultValue={job.status} style={{padding:12,fontSize:16}}>{statuses.map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select><label htmlFor="job-note">Update note (optional)</label><textarea id="job-note" name="note" rows={3} maxLength={2000} style={{padding:12,fontSize:16}}/><button type="submit" className="hq-detail-action-primary">Save update</button></form></section>}
 <section className="hq-panel"><h2>Activity</h2>{activity?.length?activity.map(a=><div key={a.id} style={{padding:'12px 0',borderBottom:'1px solid #dce5ee'}}><strong>{a.action.replaceAll('_',' ')}</strong><p>{a.note||'—'}</p><small>{new Date(a.created_at).toLocaleString('en-AU',{timeZone:'Australia/Perth'})}</small></div>):<p>No updates yet.</p>}</section></div></main>;
}
