'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { dbAdmin,requireHqUser } from '@/lib/hq-auth';

export async function loginAction(form:FormData){
 const email=String(form.get('email')??'').trim().toLowerCase();
 const password=String(form.get('password')??'');
 if(!email||!password)redirect('/hq/login?error=credentials');
 const db=dbAdmin();
 const {data,error}=await db.auth.signInWithPassword({email,password});
 if(error||!data.session||!data.user)redirect('/hq/login?error=credentials');
 const {data:staff}=await db.from('staff_profiles').select('active').eq('user_id',data.user.id).eq('active',true).maybeSingle();
 if(!staff)redirect('/hq/login?error=access');
 const jar=await cookies();
 const secure=process.env.NODE_ENV==='production';
 jar.set('ee_hq_access',data.session.access_token,{httpOnly:true,secure,sameSite:'lax',path:'/hq',maxAge:data.session.expires_in});
 jar.set('ee_hq_refresh',data.session.refresh_token,{httpOnly:true,secure,sameSite:'lax',path:'/hq',maxAge:60*60*24*30});
 redirect('/hq');
}
export async function logoutAction(){
 const jar=await cookies();
 jar.delete('ee_hq_access');jar.delete('ee_hq_refresh');
 redirect('/hq/login');
}
const allowed=['new','contacted','qualified','scheduled','closed','spam'] as const;
export async function updateEnquiryAction(form:FormData){
 const user=await requireHqUser();
 if(!['owner','admin','office'].includes(user.role))throw new Error('Insufficient permissions');
 const id=String(form.get('id')??'');
 const status=String(form.get('status')??'');
 if(!/^[0-9a-f-]{36}$/i.test(id)||!allowed.some(x=>x===status))throw new Error('Invalid enquiry update');
 const db=dbAdmin();
 const {data:previous,error:readError}=await db.from('enquiries').select('status').eq('id',id).single();
 if(readError||!previous)throw new Error('Enquiry not found');
 if(previous.status!==status){
  const {error}=await db.from('enquiries').update({status,updated_at:new Date().toISOString()}).eq('id',id);
  if(error)throw new Error('Unable to update enquiry');
  const {error:activityError}=await db.from('enquiry_activity').insert({enquiry_id:id,actor_id:user.id,action:'status_changed',note:previous.status+' → '+status});
  if(activityError)console.error('Enquiry status audit insert failed',activityError.code);
 }
 revalidatePath('/hq');revalidatePath('/hq/enquiries/'+id);
 redirect('/hq/enquiries/'+id);
}

export async function addEnquiryNoteAction(form:FormData){
 const user=await requireHqUser();
 if(!['owner','admin','office'].includes(user.role))throw new Error('Insufficient permissions');
 const id=String(form.get('id')??'');
 const note=String(form.get('note')??'').trim();
 if(!/^[0-9a-f-]{36}$/i.test(id)||note.length<2||note.length>3000)throw new Error('Please enter a note between 2 and 3000 characters');
 const db=dbAdmin();
 const {data:existing}=await db.from('enquiries').select('id').eq('id',id).maybeSingle();
 if(!existing)throw new Error('Enquiry not found');
 const {error}=await db.from('enquiry_activity').insert({enquiry_id:id,actor_id:user.id,action:'note_added',note});
 if(error)throw new Error('Unable to save note');
 revalidatePath('/hq/enquiries/'+id);
 redirect('/hq/enquiries/'+id);
}
