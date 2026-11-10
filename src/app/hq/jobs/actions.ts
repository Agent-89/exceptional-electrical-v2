'use server';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {dbAdmin,requireHqUser} from '@/lib/hq-auth';
export async function createJob(formData:FormData){
 const user=await requireHqUser();
 if(!['owner','admin','office'].includes(user.role))throw new Error('You do not have permission to create jobs.');
 const title=String(formData.get('title')||'').trim();
 const customerId=String(formData.get('customer_id')||'').trim();
 const description=String(formData.get('description')||'').trim();
 const priority=String(formData.get('priority')||'normal');
 if(title.length<2||title.length>200||description.length>5000||!['low','normal','high','urgent'].includes(priority))throw new Error('Please check the job details.');
 const db=dbAdmin();
 if(customerId){const {data:customer}=await db.from('customers').select('id').eq('id',customerId).maybeSingle();if(!customer)throw new Error('Customer not found.');}
 const {data,error}=await db.from('jobs').insert({title,description:description||null,customer_id:customerId||null,priority,created_by:user.id}).select('id').single();
 if(error||!data)throw new Error('Unable to create job.');
 await db.from('job_activity').insert({job_id:data.id,actor_id:user.id,action:'created'});
 revalidatePath('/hq/jobs');
 redirect('/hq/jobs/'+data.id);
}
export async function updateJob(formData:FormData){
 const user=await requireHqUser();
 if(!['owner','admin','office'].includes(user.role))throw new Error('You do not have permission to update jobs.');
 const id=String(formData.get('id')||'');
 const status=String(formData.get('status')||'');
 const note=String(formData.get('note')||'').trim();
 if(!/^[a-f0-9-]{36}$/i.test(id)||!['unassigned','scheduled','in_progress','on_hold','completed','cancelled'].includes(status)||note.length>2000)throw new Error('Invalid update.');
 const db=dbAdmin();
 const {data:before}=await db.from('jobs').select('status').eq('id',id).maybeSingle();
 if(!before)throw new Error('Job not found.');
 const {error}=await db.from('jobs').update({status,updated_at:new Date().toISOString(),completed_at:status==='completed'?new Date().toISOString():null}).eq('id',id);
 if(error)throw new Error('Unable to update job.');
 if(before.status!==status||note)await db.from('job_activity').insert({job_id:id,actor_id:user.id,action:before.status===status?'note_added':'status_changed',note:note||('Status: '+before.status+' → '+status)});
 revalidatePath('/hq/jobs');revalidatePath('/hq/jobs/'+id);
}
