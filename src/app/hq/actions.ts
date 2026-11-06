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

export async function convertEnquiryToCustomer(id:string):Promise<{ok:boolean;message:string;customerId?:string}>{
 const user=await requireHqUser();
 if(!['owner','admin','office'].includes(user.role))return {ok:false,message:'Insufficient permissions'};
 if(!/^[0-9a-f-]{36}$/i.test(id))return {ok:false,message:'Invalid enquiry'};
 const db=dbAdmin();
 const {data:e,error}=await db.from('enquiries').select('id,name,email,phone,customer_id').eq('id',id).single();
 if(error||!e)return {ok:false,message:'Enquiry not found'};
 if(e.customer_id)return {ok:true,message:'Already linked to a customer',customerId:e.customer_id};
 const phone=String(e.phone??'').replace(/[^0-9+]/g,'');
 const email=String(e.email??'').trim().toLowerCase();
 const {data:existing,error:lookupError}=await db.from('customers').select('id,name,email,phone').limit(500);
 if(lookupError)return {ok:false,message:'Unable to check existing customers'};
 const matches=(existing??[]).filter(c=>(phone.length>=8&&String(c.phone??'').replace(/[^0-9+]/g,'')===phone)||(email&&String(c.email??'').trim().toLowerCase()===email));
 if(matches.length>1)return {ok:false,message:'Multiple matching customers found. Review them before linking.'};
 let customerId=matches[0]?.id as string|undefined;
 let created=false;
 if(!customerId){
  const {data:createdCustomer,error:createError}=await db.from('customers').insert({name:e.name,email:e.email||null,phone:e.phone||null}).select('id').single();
  if(createError||!createdCustomer)return {ok:false,message:'Could not create customer'};
  customerId=createdCustomer.id;created=true;
 }
 const {data:linked,error:linkError}=await db.from('enquiries').update({customer_id:customerId,updated_at:new Date().toISOString()}).eq('id',id).is('customer_id',null).select('id').maybeSingle();
 if(linkError||!linked)return {ok:false,message:created?'Customer created, but enquiry linking failed. Refresh before retrying.':'Enquiry was updated elsewhere. Refresh and try again.'};
 const {error:auditError}=await db.from('enquiry_activity').insert({enquiry_id:id,actor_id:user.id,action:'customer_linked',note:created?'Customer profile created':'Linked to existing customer'});
 if(auditError)console.error('Customer linking audit failed',auditError.code);
 revalidatePath('/hq');revalidatePath('/hq/customers');revalidatePath('/hq/enquiries/'+id);
 return {ok:true,message:created?'Customer created and linked':'Existing customer linked',customerId};
}

export async function saveEnquiryFollowUp(id:string,required:boolean,dueDate:string):Promise<MutationResult>{
 const user=await requireHqUser();
 if(!['owner','admin','office'].includes(user.role))return {ok:false,message:'Insufficient permissions'};
 if(!/^[0-9a-f-]{36}$/i.test(id)||!/^\\d{4}-\\d{2}-\\d{2}$/.test(dueDate)&&dueDate!=='')return {ok:false,message:'Invalid follow-up details'};
 const due=required&&dueDate?new Date(dueDate+'T09:00:00+08:00'):null;
 if(due&&Number.isNaN(due.getTime()))return {ok:false,message:'Invalid follow-up date'};
 const db=dbAdmin();
 const {data:updated,error}=await db.from('enquiries').update({follow_up_required:required,follow_up_due_at:due?.toISOString()??null,updated_at:new Date().toISOString()}).eq('id',id).select('id').maybeSingle();
 if(error||!updated)return {ok:false,message:'Could not save follow-up'};
 const {data:activity,error:auditError}=await db.from('enquiry_activity').insert({enquiry_id:id,actor_id:user.id,action:'follow_up_updated',note:required?'Follow-up required'+(dueDate?' · due '+dueDate:''):'Follow-up cleared'}).select('id,actor_id,action,note,created_at').single();
 if(auditError)console.error('Follow-up audit insert failed',auditError.code);
 revalidatePath('/hq');revalidatePath('/hq/enquiries/'+id);
 return {ok:true,message:'Follow-up saved',activity:activity?{...activity,actor_name:user.name}:undefined};
}
