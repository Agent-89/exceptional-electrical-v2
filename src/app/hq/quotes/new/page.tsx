import {requireHqUser,dbAdmin} from '@/lib/hq-auth';
import QuoteEditor from '../quote-editor';
import '../../hq.css';
export const dynamic='force-dynamic';
export default async function NewQuote({searchParams}:{searchParams:Promise<{enquiry?:string}>}){
 await requireHqUser();const db=dbAdmin();const params=await searchParams;
 const [{data:customers},{data:enquiries},{data:addresses}]=await Promise.all([db.from('customers').select('id,name,email,phone').order('name').limit(1000),db.from('enquiries').select('id,name,customer_id,message,service_category').order('created_at',{ascending:false}).limit(200),db.from('customer_addresses').select('id,customer_id,label,address_line1,suburb,state,postcode').limit(1000)]);
 const e=(enquiries||[]).find(x=>x.id===params.enquiry);
 return <QuoteEditor customers={customers||[]} enquiries={enquiries||[]} addresses={addresses||[]} initial={e?{customerId:e.customer_id||'',enquiryId:e.id,title:e.service_category?.replaceAll('_',' ')||'Electrical work',scope:e.message}:undefined}/>;
}