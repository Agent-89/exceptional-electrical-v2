import {notFound} from 'next/navigation';
import {requireHqUser,dbAdmin} from '@/lib/hq-auth';
import QuoteEditor from '../quote-editor';
import '../../hq.css';
export const dynamic='force-dynamic';
export default async function QuoteDetail({params}:{params:Promise<{id:string}>}){
 const user=await requireHqUser();const {id}=await params;const db=dbAdmin();
 const {data:q}=await db.from('quotes').select('*').eq('id',id).maybeSingle();if(!q)notFound();
 const [{data:items},{data:customers},{data:enquiries},{data:addresses}]=await Promise.all([db.from('quote_items').select('*').eq('quote_id',id).order('position'),db.from('customers').select('id,name,email,phone').order('name').limit(1000),db.from('enquiries').select('id,name,customer_id,message,service_category').order('created_at',{ascending:false}).limit(200),db.from('customer_addresses').select('id,customer_id,label,address_line1,suburb,state,postcode').limit(1000)]);
 return <QuoteEditor canApprove={['owner','admin'].includes(user.role)} customers={customers||[]} enquiries={enquiries||[]} addresses={addresses||[]} locked={!['draft','changes_requested'].includes(q.status)} initial={{id:q.id,number:q.quote_number,status:q.status,customerId:q.customer_id||'',enquiryId:q.enquiry_id||'',addressId:q.site_address_id||'',address:q.site_address_snapshot?.address||'',title:q.title,scope:q.scope_of_work,inclusions:q.inclusions||'',exclusions:q.exclusions||'',notes:q.customer_notes||'',internalNotes:q.internal_notes||'',display:q.customer_display,mode:q.pricing_mode,lines:(items||[]).map(i=>({description:i.description,category:i.category,quantity:Number(i.quantity),unit:i.unit,price:Number(i.unit_price_cents),cost:i.internal_unit_cost_cents===null?null:Number(i.internal_unit_cost_cents),gst:i.gst_applicable}))}}/>;
}