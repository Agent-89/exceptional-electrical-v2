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
 if(!v.title.trim())return {ok:false,message:'Enter a quote title'};
 if(v.title.length>200||v.scope.length>12000||v.address.length>1500||v.internalNotes.length>6000||v.lines.length>100)return {ok:false,message:'Quote exceeds field limits'};
 if(!['itemised','total_only'].includes(v.display)||!['fixed','detailed','mixed'].includes(v.mode))return {ok:false,message:'Invalid quote options'};
 for(const line of v.lines)if(!line.description.trim()||line.description.length>500||!['labour','material','equipment','subcontractor','other'].includes(line.category)||!Number.isFinite(line.quantity)||line.quantity<=0||line.quantity>100000||!Number.isInteger(line.price)||line.price<0||line.price>1000000000||(line.cost!==null&&(!Number.isInteger(line.cost)||line.cost<0||line.cost>1000000000)))return {ok:false,message:'Check line item values'};
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

export async function approveQuote(id:string):Promise<{ok:boolean;message:string}>{
 const user=await requireHqUser();
 if(!['owner','admin'].includes(user.role))return {ok:false,message:'Only an owner or admin can approve quotes.'};
 if(!validId(id))return {ok:false,message:'Invalid quote reference'};
 const db=dbAdmin();
 const {data:q}=await db.from('quotes').select('id,status,customer_id,title,scope_of_work,site_address_snapshot').eq('id',id).maybeSingle();
 if(!q||!['draft','changes_requested','pending_approval'].includes(q.status))return {ok:false,message:'Quote cannot be approved in its current status.'};
 if(!q.customer_id||!q.title?.trim())return {ok:false,message:'Select a customer and enter a title before approval.'};
 const {data:items,error:itemsError}=await db.from('quote_items').select('quantity,unit_price_cents,description').eq('quote_id',id);
 if(itemsError||!items?.length||items.some(l=>!l.description?.trim()||Number(l.quantity)<=0||Number(l.unit_price_cents)<0))return {ok:false,message:'Add at least one valid priced item before approval.'};
 const {data:approved,error}=await db.from('quotes').update({status:'approved',approved_by:user.id,approved_at:new Date().toISOString(),issue_date:new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Perth'})}).eq('id',id).eq('status',q.status).select('id').maybeSingle();
 if(error||!approved)return {ok:false,message:'Approval failed or quote was changed. Refresh and try again.'};
 const {error:logError}=await db.from('quote_activity').insert({quote_id:id,actor_id:user.id,action:'approved'});
 revalidatePath('/hq/quotes');revalidatePath('/hq/quotes/'+id);revalidatePath('/hq/quotes/'+id+'/preview');
 return {ok:true,message:logError?'Quote approved, but the activity log needs review.':'Quote approved and ready for PDF export.'};
}
export async function saveAndApproveQuote(v:QuoteDraft):Promise<{ok:boolean;message:string;id?:string}>{
 const user=await requireHqUser();
 if(!['owner','admin'].includes(user.role))return {ok:false,message:'Only an owner or admin can approve quotes.'};
 const saved=await saveQuoteDraft(v);
 if(!saved.ok||!saved.id)return saved;
 const approved=await approveQuote(saved.id);
 return {...approved,id:saved.id,message:approved.ok?'Quote saved and approved.':approved.message+' Draft was saved.'};
}

type QuoteLifecycleStatus='sent'|'accepted'|'declined';

async function advanceQuoteStatus(id:string,next:QuoteLifecycleStatus):Promise<{ok:boolean;message:string}>{
 const user=await requireHqUser();
 if(!['owner','admin','office'].includes(user.role))return {ok:false,message:'No permission to update quote status.'};
 if(!validId(id))return {ok:false,message:'Invalid quote reference'};
 const db=dbAdmin();
 const {data:q}=await db.from('quotes').select('id,status').eq('id',id).maybeSingle();
 if(!q)return {ok:false,message:'Quote not found.'};

 const allowedFrom:Record<QuoteLifecycleStatus,string[]>={
  sent:['approved'],
  accepted:['approved','sent'],
  declined:['approved','sent'],
 };
 if(!allowedFrom[next].includes(q.status)){
  return {ok:false,message:`Cannot mark as ${next} from status "${q.status}".`};
 }

 const now=new Date().toISOString();
 const patch:Record<string,unknown>={status:next,updated_at:now};
 if(next==='sent')patch.sent_at=now;
 if(next==='accepted')patch.accepted_at=now;

 const {data:updated,error}=await db.from('quotes').update(patch).eq('id',id).eq('status',q.status).select('id').maybeSingle();
 if(error||!updated)return {ok:false,message:'Status update failed or quote was changed. Refresh and try again.'};

 const action=next==='sent'?'marked_sent':next;
 await db.from('quote_activity').insert({quote_id:id,actor_id:user.id,action});
 revalidatePath('/hq/quotes');revalidatePath('/hq/quotes/'+id);revalidatePath('/hq/quotes/'+id+'/preview');
 if(next==='sent')return {ok:true,message:'Marked as sent. This does not email the customer.'};
 if(next==='accepted')return {ok:true,message:'Quote marked as accepted.'};
 return {ok:true,message:'Quote marked as declined.'};
}

/** Records that the office issued the quote. Does not send email. */
export async function markQuoteSent(id:string){return advanceQuoteStatus(id,'sent')}
export async function markQuoteAccepted(id:string){return advanceQuoteStatus(id,'accepted')}
export async function markQuoteDeclined(id:string){return advanceQuoteStatus(id,'declined')}
