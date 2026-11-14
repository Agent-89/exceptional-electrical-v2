import 'server-only';
import {dbAdmin} from '@/lib/hq-auth';
import type {CustomerMatchRecord} from '@/lib/customer-match';

/** Page through all customers for duplicate checks (no silent 1000-row cap). */
export async function loadCustomersForMatch():Promise<{customers:CustomerMatchRecord[];error:string|null}>{
 const db=dbAdmin();
 const customers:CustomerMatchRecord[]=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await db.from('customers').select('id,name,email,phone').order('id').range(offset,offset+499);
  if(error)return {customers:[],error:'Unable to check for duplicate customers'};
  if(!data?.length)break;
  customers.push(...(data as CustomerMatchRecord[]));
  if(data.length<500)break;
 }
 return {customers,error:null};
}
