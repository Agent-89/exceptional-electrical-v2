'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { assertOfficeOps,dbAdmin,requireHqUser } from '@/lib/hq-auth';
import { canManageOfficeOps, hqHomePath } from '@/lib/hq-roles';
import { isEnquiryStatus } from '@/lib/enquiry-status';
import { findCustomerMatches } from '@/lib/customer-match';
import { loadCustomersForMatch } from '@/lib/load-customers-for-match';

export async function loginAction(form:FormData){
 const email=String(form.get('email')??'').trim().toLowerCase();
 const password=String(form.get('password')??'');
 if(!email||!password)redirect('/hq/login?error=credentials');
 const db=dbAdmin();
 const {data,error}=await db.auth.signInWithPassword({email,password});
 if(error||!data.session||!data.user)redirect('/hq/login?error=credentials');
 const {data:staff}=await db.from('staff_profiles').select('active,role').eq('user_id',data.user.id).eq('active',true).maybeSingle();
 if(!staff)redirect('/hq/login?error=access');
 const remember=form.get('remember')==='on';
 const jar=await cookies();
 const secure=process.env.NODE_ENV==='production';
 // Expire legacy path-scoped cookies before setting the shared secure session.
 jar.set('ee_hq_access','',{path:'/hq',maxAge:0});
 jar.set('ee_hq_refresh','',{path:'/hq',maxAge:0});
 jar.set('ee_hq_access',data.session.access_token,{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:data.session.expires_in});
 jar.set('ee_hq_refresh',data.session.refresh_token,{httpOnly:true,secure,sameSite:'lax',path:'/',...(remember?{maxAge:60*60*24*30}:{})});
 redirect(hqHomePath(String(staff.role)));
}
export async function logoutAction(){
 const jar=await cookies();
 jar.set('ee_hq_access','',{path:'/',maxAge:0});jar.set('ee_hq_refresh','',{path:'/',maxAge:0});
 jar.set('ee_hq_access','',{path:'/hq',maxAge:0});jar.set('ee_hq_refresh','',{path:'/hq',maxAge:0});
 redirect('/hq/login');
}
export async function updateEnquiryAction(form:FormData){
 const user=await requireHqUser();
 assertOfficeOps(user);
 const id=String(form.get('id')??'');
 const status=String(form.get('status')??'');
 if(!/^[0-9a-f-]{36}$/i.test(id)||!isEnquiryStatus(status))throw new Error('Invalid enquiry update');
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
 assertOfficeOps(user);
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
 if(!canManageOfficeOps(user.role))return {ok:false,message:'Insufficient permissions'};
 if(!/^[0-9a-f-]{36}$/i.test(id)||!isEnquiryStatus(status))return {ok:false,message:'Invalid status'};
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
 if(!canManageOfficeOps(user.role))return {ok:false,message:'Insufficient permissions'};
 const note=noteInput.trim();
 if(!/^[0-9a-f-]{36}$/i.test(id)||note.length<2||note.length>3000)return {ok:false,message:'Enter a note between 2 and 3000 characters'};
 const db=dbAdmin();
 const {data:existing}=await db.from('enquiries').select('id').eq('id',id).maybeSingle();
 if(!existing)return {ok:false,message:'Enquiry not found'};
 const {data:activity,error}=await db.from('enquiry_activity').insert({enquiry_id:id,actor_id:user.id,action:'note_added',note}).select('id,actor_id,action,note,created_at').single();
 if(error||!activity)return {ok:false,message:'Could not save note. Please try again.'};
 return {ok:true,message:'Note added',activity:{...activity,actor_name:user.name}};
}

export type ConvertCustomerResult={
 ok:boolean;
 message:string;
 customerId?:string;
 conflict?:'single'|'multiple';
 matches?:{id:string;name:string;email:string|null;phone:string|null;company_name?:string|null}[];
};

export async function convertEnquiryToCustomer(enquiryId:string,form:FormData):Promise<ConvertCustomerResult>{
 const user=await requireHqUser();
 if(!canManageOfficeOps(user.role))return {ok:false,message:'Insufficient permissions'};
 if(!/^[0-9a-f-]{36}$/i.test(enquiryId))return {ok:false,message:'Invalid enquiry'};

 const text=(v:FormDataEntryValue|null)=>String(v??'').trim();
 const name=text(form.get('name'));
 const email=text(form.get('email')).toLowerCase();
 const phone=text(form.get('phone'));
 const companyName=text(form.get('company_name'));
 const allowDuplicate=form.get('allow_duplicate')==='yes';
 const linkCustomerId=text(form.get('link_customer_id'));
 const addressLabel=text(form.get('label'));
 const addressLine1=text(form.get('address_line1'));
 const addressLine2=text(form.get('address_line2'));
 const suburb=text(form.get('suburb'));
 const state=text(form.get('state'))||'WA';
 const postcode=text(form.get('postcode'));
 const addressNotes=text(form.get('address_notes'));
 const customerNote=text(form.get('customer_note'));

 if(name.length<2||name.length>150)return {ok:false,message:'Enter a valid full name'};
 if(companyName.length>150)return {ok:false,message:'Company name is too long'};
 if(email.length>254||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))return {ok:false,message:'Invalid email address'};
 if(phone.length>40)return {ok:false,message:'Phone number is too long'};
 if(!email&&!phone)return {ok:false,message:'Enter a name and at least one contact method'};
 if(customerNote&&(customerNote.length<2||customerNote.length>3000))return {ok:false,message:'Enter a note between 2 and 3000 characters'};
 if(linkCustomerId&&!/^[0-9a-f-]{36}$/i.test(linkCustomerId))return {ok:false,message:'Invalid customer'};

 // Suburb may be prefilled from the enquiry; only treat as an address when staff starts one.
 const addressTouched=Boolean(addressLabel||addressLine1||addressLine2||postcode||addressNotes||(state&&state!=='WA'));
 if(addressTouched){
  if(!addressLine1||!suburb||!/^[0-9]{4}$/.test(postcode)||[addressLabel||'Service address',addressLine1,addressLine2,suburb,state].some(x=>x.length>160)||addressNotes.length>1000){
   return {ok:false,message:'Enter a valid street address, suburb and four-digit postcode'};
  }
 }

 const db=dbAdmin();
 const {data:e,error}=await db.from('enquiries').select('id,customer_id').eq('id',enquiryId).single();
 if(error||!e)return {ok:false,message:'Enquiry not found'};
 if(e.customer_id)return {ok:true,message:'Already linked to a customer',customerId:e.customer_id};

 if(!allowDuplicate&&!linkCustomerId){
  const {customers,error:lookupError}=await loadCustomersForMatch();
  if(lookupError)return {ok:false,message:lookupError};
  const matches=findCustomerMatches(customers,email,phone);
  if(matches.length===1){
   return {
    ok:false,
    conflict:'single',
    matches,
    customerId:matches[0].id,
    message:'A customer with this email or phone already exists. Link the existing profile, or confirm creating a separate customer.',
   };
  }
  if(matches.length>1){
   return {
    ok:false,
    conflict:'multiple',
    matches,
    message:'Multiple matching customers found. Review them before linking or creating another record.',
   };
  }
 }

 const {data:result,error:conversionError}=await db.rpc('convert_enquiry_customer_atomic',{
  p_enquiry_id:enquiryId,
  p_actor:user.id,
  p_name:name,
  p_email:email||null,
  p_phone:phone||null,
  p_company_name:companyName||null,
  p_allow_duplicate:allowDuplicate,
  p_link_customer_id:linkCustomerId||null,
  p_address_label:addressTouched?(addressLabel||'Service address'):null,
  p_address_line1:addressTouched?addressLine1:null,
  p_address_line2:addressTouched?(addressLine2||null):null,
  p_suburb:addressTouched?suburb:null,
  p_state:addressTouched?state:null,
  p_postcode:addressTouched?postcode:null,
  p_address_notes:addressTouched?(addressNotes||null):null,
  p_customer_note:customerNote||null,
 });
 if(conversionError){
  console.error('Atomic customer conversion failed',conversionError.code);
  return {ok:false,message:'Could not convert enquiry. No partial changes were saved.'};
 }

 type RpcOutcome={
  ok:boolean;
  message:string;
  customerId?:string;
  conflict?:'single'|'multiple';
  matchIds?:string[];
 };
 const outcome=result as RpcOutcome|null;
 if(!outcome)return {ok:false,message:'Could not convert enquiry'};

 if(!outcome.ok&&outcome.conflict&&outcome.matchIds?.length){
  const {data:matchRows}=await db.from('customers').select('id,name,email,phone,company_name').in('id',outcome.matchIds);
  return {
   ok:false,
   conflict:outcome.conflict,
   matches:(matchRows??[]) as ConvertCustomerResult['matches'],
   customerId:outcome.conflict==='single'?outcome.matchIds[0]:undefined,
   message:outcome.message,
  };
 }

 if(!outcome.ok||!outcome.customerId)return {ok:false,message:outcome.message||'Could not convert enquiry'};
 revalidatePath('/hq');revalidatePath('/hq/customers');revalidatePath('/hq/customers/'+outcome.customerId);revalidatePath('/hq/enquiries/'+enquiryId);
 return {ok:true,message:outcome.message,customerId:outcome.customerId};
}

