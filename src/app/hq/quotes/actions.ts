'use server';
import {revalidatePath} from 'next/cache';
import {requireHqUser,dbAdmin} from '@/lib/hq-auth';
type Line={description:string;category:string;quantity:number;unit:string;price:number;cost:number|null;gst:boolean};
export type QuoteDraft={id?:string;customerId:string;enquiryId:string;addressId:string;address:string;title:string;scope:string;inclusions:string;exclusions:string;notes:string;internalNotes:string;display:string;mode:string;lines:Line[]};
const validId=(s:string)=>/^[0-9a-f-]{36}$/i.test(s);
export async function saveQuoteDraft(v:QuoteDraft):Promise<{ok:boolean;message:string;id?:string}>{
 const user=await requireHqUser();
 if(!['owner','admin','office'].includes(user.role))return {ok:false,message:'No permission to edit quotes'};
 if((v.id&&!validId(v.id))||(v.customerId&&!validId(v.customerId))||(v.enquiryId&&!validId(v.enquiryId))||(v.addressId&&!validId(v.addressId)))return {ok:false,message:'Invalid record reference'};
 if(v.title.length>200||v.scope.length>12000||v.address.length>1500||v.internalNotes.length>6000||v.lines.length>100)return {ok:false,message:'Quote exceeds field limits'};
 if(!['itemised','total_only'].includes(v.display)||!['fixed','detailed','mixed'].includes(v.mode))return {ok:false,message:'Invalid quote options'};
 for(const line of v.lines)if(!line.description.trim()||line.description.length>500||!['labour','material','equipment','subcontractor','other'].includes(line.category)||!Number.isFinite(line.quantity)||line.quantity<0||line.quantity>100000||!Number.isInteger(line.price)||line.price<0||line.price>1000000000||(line.cost!==null&&(!Number.isInteger(line.cost)||line.cost<0||line.cost>1000000000)))return {ok:false,message:'Check line item values'};
 const db=dbAdmin();
 let customerSnapshot={};
 if(v.customerId){const {data:c}=await db.from('customers').select('name,email,phone').eq('id',v.customerId).maybeSingle();if(!c)return {ok:false,message:'Customer not found'};customerSnapshot=c}
 if(v.enquiryId){const {data:e}=await db.from('enquiries').select('customer_id').eq('id',v.enquiryId).maybeSingle();if(!e)return {ok:false,message:'Enquiry not found'};if(e.customer_id&&v.customerId&&e.customer_id!==v.customerId)return {ok:false,message:'Customer does not match enquiry'}}
 let addressSnapshot={address:v.address.trim()};
 if(v.addressId){const {data:a}=await db.from('customer_addresses').select('address_line1,address_line2,suburb,state,postcode').eq('id',v.addressId).eq('customer_id',v.customerId).maybeSingle();if(!a)return {ok:false,message:'Invalid customer address'};addressSnapshot={...a,address:v.address.trim()||[a.address_line1,a.address_line2,a.suburb,a.state,a.postcode].filter(Boolean).join(', ')}}
 const values={customer_id:v.customerId||null,enquiry_id:v.enquiryId||null,site_address_id:v.addressId||null,site_address_snapshot:addressSnapshot,customer_snapshot:customerSnapshot,title:v.title.trim(),scope_of_work:v.scope.trim(),inclusions:v.inclusions,exclusions:v.exclusions,customer_notes:v.notes,internal_notes:v.internalNotes,customer_display:v.display,pricing_mode:v.mode,updated_at:new Date().toISOString()};
 const lines=v.lines.map((l,i)=>({position:i,description:l.description.trim(),category:l.category,quantity:l.quantity,unit:l.unit||'each',unit_price_cents:l.price,internal_unit_cost_cents:l.cost,gst_applicable:l.gst}));
 const {data:id,error}=await db.rpc('save_quote_draft_atomic',{p_quote_id:v.id||null,p_values:values,p_lines:lines,p_actor:user.id});
 if(error||!id)return {ok:false,message:'Unable to save draft. No partial changes were made.'};
 revalidatePath('/hq/quotes');revalidatePath('/hq/quotes/'+id);
 return {ok:true,message:'Draft saved',id};
}
