'use server';
import {revalidatePath} from 'next/cache';
import {assertAdminOps,dbAdmin,requireHqUser} from '@/lib/hq-auth';
import {canManageOfficeOps} from '@/lib/hq-roles';
import {
  findCustomerMatches,
  normalizeCustomerEmail,
  type CustomerMatchRecord,
} from '@/lib/customer-match';
import {loadCustomersForMatch} from '@/lib/load-customers-for-match';
import {
  assessCustomerEmptyDelete,
  formatEmptyDeleteBlockers,
} from '@/lib/hq-empty-delete-assess';

export type CustomerMutationResult={
 ok:boolean;
 message:string;
 id?:string;
 customer?:CustomerMatchRecord;
 matches?:CustomerMatchRecord[];
 conflict?:'single'|'multiple';
};

type Result=CustomerMutationResult;
const uuid=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const text=(v:FormDataEntryValue|null)=>String(v??'').trim();
async function staff(){const u=await requireHqUser();return canManageOfficeOps(u.role)?u:null;}

function conflictResult(matches:CustomerMatchRecord[],action:'create'|'update'):Result{
 if(matches.length===1){
  const match=matches[0];
  return {
   ok:false,
   conflict:'single',
   matches,
   id:match.id,
   customer:match,
   message:action==='create'
    ?'A customer with this email or phone already exists. Open the existing profile, or confirm creating a separate customer.'
    :'Another customer already uses this email or phone. Review that profile, or confirm saving these details anyway.',
  };
 }
 return {
  ok:false,
  conflict:'multiple',
  matches,
  message:action==='create'
   ?'Multiple customers match this email or phone. Review them before creating another record, or confirm creating a separate customer.'
   :'Multiple customers match this email or phone. Review them before saving, or confirm keeping these shared contact details.',
 };
}

function parseCompany(form:FormData){
 const company=text(form.get('company_name'));
 if(company.length>150)return {ok:false as const,message:'Company name is too long'};
 return {ok:true as const,company:company||null};
}

export async function createCustomer(form:FormData):Promise<Result>{
 if(!await staff())return {ok:false,message:'Insufficient permissions'};
 const name=text(form.get('name'));
 const email=normalizeCustomerEmail(text(form.get('email')));
 const phone=text(form.get('phone'));
 const companyParsed=parseCompany(form);
 if(!companyParsed.ok)return {ok:false,message:companyParsed.message};
 const allowDuplicate=form.get('allow_duplicate')==='yes';
 if(name.length<2||name.length>150||email.length>254||phone.length>40||(!email&&!phone))return {ok:false,message:'Enter a name and at least one contact method'};
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return {ok:false,message:'Invalid email address'};
 const {customers,error:lookupError}=await loadCustomersForMatch();
 if(lookupError)return {ok:false,message:lookupError};
 if(!allowDuplicate){
  const matches=findCustomerMatches(customers,email,phone);
  if(matches.length)return conflictResult(matches,'create');
 }
 const {data,error}=await dbAdmin().from('customers').insert({
  name,
  email:email||null,
  phone:phone||null,
  company_name:companyParsed.company,
 }).select('id,name,email,phone,company_name').single();
 if(error||!data)return {ok:false,message:'Unable to create customer'};
 revalidatePath('/hq/customers');
 return {ok:true,message:allowDuplicate?'Separate customer created':'Customer created',id:data.id,customer:data as CustomerMatchRecord};
}

export async function updateCustomer(id:string,form:FormData):Promise<Result>{
 if(!await staff())return {ok:false,message:'Insufficient permissions'};
 if(!uuid(id))return {ok:false,message:'Invalid customer'};
 const name=text(form.get('name'));
 const email=normalizeCustomerEmail(text(form.get('email')));
 const phone=text(form.get('phone'));
 const companyParsed=parseCompany(form);
 if(!companyParsed.ok)return {ok:false,message:companyParsed.message};
 const allowDuplicate=form.get('allow_duplicate')==='yes';
 if(name.length<2||name.length>150||email.length>254||phone.length>40||(!email&&!phone))return {ok:false,message:'Enter a name and contact method'};
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return {ok:false,message:'Invalid email address'};
 const {customers,error:lookupError}=await loadCustomersForMatch();
 if(lookupError)return {ok:false,message:lookupError};
 if(!allowDuplicate){
  const matches=findCustomerMatches(customers,email,phone,id);
  if(matches.length)return conflictResult(matches,'update');
 }
 const {error}=await dbAdmin().from('customers').update({
  name,
  email:email||null,
  phone:phone||null,
  company_name:companyParsed.company,
  updated_at:new Date().toISOString(),
 }).eq('id',id);
 if(error)return {ok:false,message:'Could not save customer'};
 revalidatePath('/hq/customers');revalidatePath('/hq/customers/'+id);
 return {ok:true,message:allowDuplicate?'Customer details saved with shared contact details':'Customer details saved'};
}

export async function addCustomerAddress(id:string,form:FormData):Promise<Result>{
 if(!await staff())return {ok:false,message:'Insufficient permissions'};
 if(!uuid(id))return {ok:false,message:'Invalid customer'};
 const label=text(form.get('label'))||'Service address',address_line1=text(form.get('address_line1')),address_line2=text(form.get('address_line2')),suburb=text(form.get('suburb')),state=text(form.get('state'))||'WA',postcode=text(form.get('postcode')),notes=text(form.get('notes'));
 if(!address_line1||!suburb||!/^[0-9]{4}$/.test(postcode)||[label,address_line1,address_line2,suburb,state].some(x=>x.length>160)||notes.length>1000)return {ok:false,message:'Enter a valid street address, suburb and four-digit postcode'};
 const db=dbAdmin();
 const {count}=await db.from('customer_addresses').select('id',{count:'exact',head:true}).eq('customer_id',id);
 const {error}=await db.from('customer_addresses').insert({
  customer_id:id,
  label,
  address_line1,
  address_line2:address_line2||null,
  suburb,
  state,
  postcode,
  notes:notes||null,
  is_primary:(count??0)===0,
 });
 if(error)return {ok:false,message:'Unable to add address'};
 revalidatePath('/hq/customers/'+id);return {ok:true,message:'Service address added'};
}

export async function updateCustomerAddress(customerId:string,addressId:string,form:FormData):Promise<Result>{
 if(!await staff())return {ok:false,message:'Insufficient permissions'};
 if(!uuid(customerId)||!uuid(addressId))return {ok:false,message:'Invalid address'};
 const label=text(form.get('label'))||'Service address',address_line1=text(form.get('address_line1')),address_line2=text(form.get('address_line2')),suburb=text(form.get('suburb')),state=text(form.get('state'))||'WA',postcode=text(form.get('postcode')),notes=text(form.get('notes'));
 const makePrimary=form.get('is_primary')==='yes'||form.get('is_primary')==='on'||form.get('is_primary')==='true';
 if(!address_line1||!suburb||!/^[0-9]{4}$/.test(postcode)||[label,address_line1,address_line2,suburb,state].some(x=>x.length>160)||notes.length>1000)return {ok:false,message:'Enter a valid street address, suburb and four-digit postcode'};
 const db=dbAdmin();
 const {data:existing,error:lookupError}=await db.from('customer_addresses').select('id').eq('id',addressId).eq('customer_id',customerId).maybeSingle();
 if(lookupError||!existing)return {ok:false,message:'Address not found'};
 if(makePrimary){
  await db.from('customer_addresses').update({is_primary:false}).eq('customer_id',customerId).neq('id',addressId);
 }
 const {error}=await db.from('customer_addresses').update({
  label,
  address_line1,
  address_line2:address_line2||null,
  suburb,
  state,
  postcode,
  notes:notes||null,
  is_primary:makePrimary,
 }).eq('id',addressId).eq('customer_id',customerId);
 if(error)return {ok:false,message:'Could not save address'};
 revalidatePath('/hq/customers/'+customerId);return {ok:true,message:'Service address updated'};
}

export async function addCustomerNote(id:string,note:string):Promise<Result>{
 const user=await staff();if(!user)return {ok:false,message:'Insufficient permissions'};
 if(!uuid(id)||note.trim().length<2||note.length>3000)return {ok:false,message:'Enter a note between 2 and 3000 characters'};
 const {error}=await dbAdmin().from('customer_notes').insert({customer_id:id,actor_id:user.id,note:note.trim()});
 if(error)return {ok:false,message:'Unable to add note'};
 revalidatePath('/hq/customers/'+id);return {ok:true,message:'Note added'};
}

/** Hard-delete only customers with no jobs/quotes/enquiries/notes. Addresses are removed with the customer. */
export async function deleteEmptyCustomer(customerId:string):Promise<Result>{
 try{
  const user=await requireHqUser();
  assertAdminOps(user);
  if(!uuid(customerId))return {ok:false,message:'Invalid customer'};
  const db=dbAdmin();
  const {data:customer}=await db.from('customers').select('id,name').eq('id',customerId).maybeSingle();
  if(!customer)return {ok:false,message:'Customer not found'};
  const verdict=await assessCustomerEmptyDelete(db,customerId);
  if(!verdict.eligible)return {ok:false,message:formatEmptyDeleteBlockers(verdict.blockers)};
  await db.from('customer_addresses').delete().eq('customer_id',customerId);
  const {error}=await db.from('customers').delete().eq('id',customerId);
  if(error)return {ok:false,message:'Unable to delete customer'};
  revalidatePath('/hq/customers');
  return {ok:true,message:`Customer “${customer.name}” deleted.`};
 }catch(error){
  return {ok:false,message:error instanceof Error?error.message:'Unable to delete customer'};
 }
}
