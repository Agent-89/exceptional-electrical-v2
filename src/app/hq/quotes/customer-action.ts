'use server';
import {revalidatePath} from 'next/cache';
import {requireHqUser,dbAdmin} from '@/lib/hq-auth';
import {canManageOfficeOps} from '@/lib/hq-roles';
import {
  findCustomerMatches,
  normalizeCustomerEmail,
  type CustomerMatchRecord,
} from '@/lib/customer-match';
import {loadCustomersForMatch} from '@/lib/load-customers-for-match';
import type {CustomerMutationResult} from '../customer-actions';

export async function createQuoteCustomer(
 name:string,
 email:string,
 phone:string,
 allowDuplicate=false
):Promise<CustomerMutationResult>{
 const user=await requireHqUser();
 if(!canManageOfficeOps(user.role))return {ok:false,message:'Not authorised'};
 const trimmedName=name.trim();
 const normalizedEmail=normalizeCustomerEmail(email);
 const trimmedPhone=phone.trim();
 if(trimmedName.length<2||trimmedName.length>150||normalizedEmail.length>254||trimmedPhone.length>40||(!normalizedEmail&&!trimmedPhone)){
  return {ok:false,message:'Enter a name and email or phone'};
 }
 if(normalizedEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)){
  return {ok:false,message:'Invalid email address'};
 }
 const {customers,error:lookupError}=await loadCustomersForMatch();
 if(lookupError)return {ok:false,message:lookupError};
 if(!allowDuplicate){
  const matches=findCustomerMatches(customers,normalizedEmail,trimmedPhone);
  if(matches.length===1){
   const match=matches[0];
   return {
    ok:false,
    conflict:'single',
    matches,
    id:match.id,
    customer:match,
    message:'A customer with this email or phone already exists. Select the existing customer, or confirm creating a separate customer.',
   };
  }
  if(matches.length>1){
   return {
    ok:false,
    conflict:'multiple',
    matches,
    message:'Multiple customers match this email or phone. Review them before creating another record, or confirm creating a separate customer.',
   };
  }
 }
 const db=dbAdmin();
 const {data,error}=await db.from('customers').insert({
  name:trimmedName,
  email:normalizedEmail||null,
  phone:trimmedPhone||null,
 }).select('id,name,email,phone').single();
 if(error||!data)return {ok:false,message:'Could not create customer'};
 revalidatePath('/hq/customers');
 return {
  ok:true,
  message:allowDuplicate?'Separate customer created':'Customer created',
  id:data.id,
  customer:data as CustomerMatchRecord,
 };
}
