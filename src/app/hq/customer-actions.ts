'use server';
import {revalidatePath} from 'next/cache';
import {dbAdmin,requireHqUser} from '@/lib/hq-auth';
import {canManageOfficeOps} from '@/lib/hq-roles';
import {
  findCustomerMatches,
  normalizeCustomerEmail,
  type CustomerMatchRecord,
} from '@/lib/customer-match';
import {loadCustomersForMatch} from '@/lib/load-customers-for-match';

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

export async function createCustomer(form:FormData):Promise<Result>{
 if(!await staff())return {ok:false,message:'Insufficient permissions'};
 const name=text(form.get('name'));
 const email=normalizeCustomerEmail(text(form.get('email')));
 const phone=text(form.get('phone'));
 const allowDuplicate=form.get('allow_duplicate')==='yes';
 if(name.length<2||name.length>150||email.length>254||phone.length>40||(!email&&!phone))return {ok:false,message:'Enter a name and at least one contact method'};
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return {ok:false,message:'Invalid email address'};
 const {customers,error:lookupError}=await loadCustomersForMatch();
 if(lookupError)return {ok:false,message:lookupError};
 if(!allowDuplicate){
  const matches=findCustomerMatches(customers,email,phone);
  if(matches.length)return conflictResult(matches,'create');
 }
 const {data,error}=await dbAdmin().from('customers').insert({name,email:email||null,phone:phone||null}).select('id,name,email,phone').single();
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
 const allowDuplicate=form.get('allow_duplicate')==='yes';
 if(name.length<2||name.length>150||email.length>254||phone.length>40||(!email&&!phone))return {ok:false,message:'Enter a name and contact method'};
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return {ok:false,message:'Invalid email address'};
 const {customers,error:lookupError}=await loadCustomersForMatch();
 if(lookupError)return {ok:false,message:lookupError};
 if(!allowDuplicate){
  const matches=findCustomerMatches(customers,email,phone,id);
  if(matches.length)return conflictResult(matches,'update');
 }
 const {error}=await dbAdmin().from('customers').update({name,email:email||null,phone:phone||null,updated_at:new Date().toISOString()}).eq('id',id);
 if(error)return {ok:false,message:'Could not save customer'};
 revalidatePath('/hq/customers');revalidatePath('/hq/customers/'+id);
 return {ok:true,message:allowDuplicate?'Customer details saved with shared contact details':'Customer details saved'};
}

export async function addCustomerAddress(id:string,form:FormData):Promise<Result>{
 if(!await staff())return {ok:false,message:'Insufficient permissions'};
 if(!uuid(id))return {ok:false,message:'Invalid customer'};
 const label=text(form.get('label'))||'Service address',address_line1=text(form.get('address_line1')),address_line2=text(form.get('address_line2')),suburb=text(form.get('suburb')),state=text(form.get('state'))||'WA',postcode=text(form.get('postcode')),notes=text(form.get('notes'));
 if(!address_line1||!suburb||!/^[0-9]{4}$/.test(postcode)||[label,address_line1,address_line2,suburb,state].some(x=>x.length>160)||notes.length>1000)return {ok:false,message:'Enter a valid street address, suburb and four-digit postcode'};
 const {error}=await dbAdmin().from('customer_addresses').insert({customer_id:id,label,address_line1,address_line2:address_line2||null,suburb,state,postcode,notes:notes||null});
 if(error)return {ok:false,message:'Unable to add address'};
 revalidatePath('/hq/customers/'+id);return {ok:true,message:'Service address added'};
}

export async function addCustomerNote(id:string,note:string):Promise<Result>{
 const user=await staff();if(!user)return {ok:false,message:'Insufficient permissions'};
 if(!uuid(id)||note.trim().length<2||note.length>3000)return {ok:false,message:'Enter a note between 2 and 3000 characters'};
 const {error}=await dbAdmin().from('customer_notes').insert({customer_id:id,actor_id:user.id,note:note.trim()});
 if(error)return {ok:false,message:'Unable to add note'};
 revalidatePath('/hq/customers/'+id);return {ok:true,message:'Note added'};
}
