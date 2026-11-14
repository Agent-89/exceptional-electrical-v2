import {requireOfficeUser,dbAdmin} from '@/lib/hq-auth';
import QuoteEditor from '../quote-editor';
import '../../hq.css';
export const dynamic='force-dynamic';
export default async function NewQuote({searchParams}:{searchParams:Promise<{enquiry?:string}>}){
 const user=await requireOfficeUser();const db=dbAdmin();const params=await searchParams;
 const [{data:customers},{data:enquiries},{data:addresses}]=await Promise.all([db.from('customers').select('id,name,email,phone').order('name').limit(1000),db.from('enquiries').select('id,name,customer_id,message,service_category').order('created_at',{ascending:false}).limit(200),db.from('customer_addresses').select('id,customer_id,label,address_line1,suburb,state,postcode').limit(1000)]);
 const {data:lastQuote}=await db.from('quotes').select('quote_number').like('quote_number','EEQ-%').order('quote_number',{ascending:false}).limit(1).maybeSingle();
 const lastNumber=Number(lastQuote?.quote_number?.match(/^EEQ-(\d+)$/)?.[1]||0);
 const nextQuoteNumber=`EEQ-${String(lastNumber+1).padStart(6,'0')}`;
 const e=(enquiries||[]).find(x=>x.id===params.enquiry);
 return <QuoteEditor canApprove={['owner','admin'].includes(user.role)} nextQuoteNumber={nextQuoteNumber} customers={customers||[]} enquiries={enquiries||[]} addresses={addresses||[]} initial={e?{customerId:e.customer_id||'',enquiryId:e.id,title:e.service_category?.replaceAll('_',' ')||'Electrical work',scope:e.message}:undefined}/>;
}