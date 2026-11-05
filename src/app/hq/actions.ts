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
 jar.set('ee_hq_access','',{path:'/hq',maxAge:0});jar.set('ee_hq_refresh','',{path:'/hq',maxAge:0});
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

type MutationResult={ok:boolean;message:string;status?:string;activity?:{id:string;actor_id:string|null;action:string;note:string|null;created_at:string;actor_name:string}};
export async function saveEnquiryStatus(id:string,status:string):Promise<MutationResult>{
 const user=await requireHqUser();
 if(!['owner','admin','office'].includes(user.role))return {ok:false,message:'Insufficient permissions'};
 if(!/^[0-9a-f-]{36}$/i.test(id)||!allowed.some(x=>x===status))return {ok:false,message:'Invalid status'};
 const db=dbAdmin();
 const {data:previous,error:readError}=await db.from('enquiries').select('status').eq('id',id).single();
 if(readError||!previous)return {ok:false,message:'Enquiry not found'};
 if(previous.status===status)return {ok:true,message:'Already up to date',status};
 const {error}=await db.from('enquiries').update({status,updated_at:new Date().toISOString()}).eq('id',id).eq('status',previous.status).select('id').single();
 if(error)return {ok:false,message:'Unable to save. Refresh and try again.'};
 const {data:activity,error:auditError}=await db.from('enquiry_activity').insert({enquiry_id:id,actor_id:user.id,action:'status_changed',note:previous.status+' → '+status}).select('id,actor_id,action,note,created_at').single();
 if(auditError)console.error('Audit insert failed',auditError.code);
 revalidatePath('/hq');
 return {ok:true,message:'Status saved',status,activity:activity?{...activity,actor_name:user.name}:undefined};
}
export async function saveEnquiryNote(id:string,noteInput:string):Promise<MutationResult>{
 const user=await requireHqUser();
 if(!['owner','admin','office'].includes(user.role))return {ok:false,message:'Insufficient permissions'};
 const note=noteInput.trim();
 if(!/^[0-9a-f-]{36}$/i.test(id)||note.length<2||note.length>3000)return {ok:false,message:'Enter a note between 2 and 3000 characters'};
 const db=dbAdmin();
 const {data:existing}=await db.from('enquiries').select('id').eq('id',id).maybeSingle();
 if(!existing)return {ok:false,message:'Enquiry not found'};
 const {data:activity,error}=await db.from('enquiry_activity').insert({enquiry_id:id,actor_id:user.id,action:'note_added',note}).select('id,actor_id,action,note,created_at').single();
 if(error||!activity)return {ok:false,message:'Could not save note. Please try again.'};
 return {ok:true,message:'Note added',activity:{...activity,actor_name:user.name}};
}
