'use server';
import {revalidatePath} from 'next/cache';
import {requireHqUser,dbAdmin} from '@/lib/hq-auth';
import {canManageAdminOps,canManageOfficeOps} from '@/lib/hq-roles';
import {
  commercialSchemaMissingMessage,
  interpretMakeCurrentResult,
  isMissingCommercialSchemaError,
  validateVariationParentSelection,
  variationParentJobCompatible,
} from '@/lib/quote-commercial';
import {canLinkQuoteToJob,interpretJobQuoteAtomicResult} from '@/lib/job-quotes';
import {isMissingJobQuotesRelation} from '@/lib/job-quotes-store';

type Line={description:string;category:string;quantity:number;unit:string;price:number;cost:number|null;gst:boolean};
export type QuoteDraft={
  id?:string;
  customerId:string;
  enquiryId:string;
  addressId:string;
  address:string;
  title:string;
  scope:string;
  inclusions:string;
  exclusions:string;
  notes:string;
  internalNotes:string;
  display:string;
  mode:string;
  lines:Line[];
  /** standard | variation — variation requires parentQuoteId */
  quoteType?:'standard'|'variation';
  parentQuoteId?:string;
  /** Optional / contextual job to link after save (does not set commercial current). */
  linkedJobId?:string;
};

const validId=(s:string)=>/^[0-9a-f-]{36}$/i.test(s);

function missingJobQuoteRpc(error:{message?:string;code?:string}|null):boolean{
  if(!error)return false;
  const message=error.message||'';
  return(
    error.code==='PGRST202'||
    /job_quote_link_atomic/i.test(message)||
    /could not find the function/i.test(message)
  );
}

async function linkQuoteAfterSave(args:{
  db:ReturnType<typeof dbAdmin>;
  jobId:string;
  quoteId:string;
  actorId:string;
  associationKind:'quote'|'variation';
}):Promise<{ok:boolean;message?:string}>{
  const {data:job}=await args.db.from('jobs').select('id,customer_id').eq('id',args.jobId).maybeSingle();
  if(!job)return{ok:false,message:'Linked job not found.'};
  const {data:quote}=await args.db.from('quotes').select('id,customer_id').eq('id',args.quoteId).maybeSingle();
  if(!quote)return{ok:false,message:'Quote not found for job link.'};
  const compatibility=canLinkQuoteToJob(job.customer_id,quote.customer_id);
  if(!compatibility.ok)return{ok:false,message:compatibility.message};

  const {data,error}=await args.db.rpc('job_quote_link_atomic',{
    p_job_id:args.jobId,
    p_quote_id:args.quoteId,
    p_actor:args.actorId,
    p_association_kind:args.associationKind,
    p_label:args.associationKind==='variation'?'Variation':null,
    p_make_primary:false,
  });
  if(error&&(isMissingJobQuotesRelation(error)||missingJobQuoteRpc(error))){
    return{ok:false,message:'Quote saved, but job linking needs the job_quotes migration.'};
  }
  const result=interpretJobQuoteAtomicResult(data,'Quote saved, but linking to the job failed.');
  if(error||!result.ok){
    return{ok:false,message:result.message||error?.message||'Quote saved, but linking to the job failed.'};
  }
  return{ok:true};
}

async function assertVariationParent(args:{
  db:ReturnType<typeof dbAdmin>;
  quoteType:'standard'|'variation';
  parentQuoteId:string;
  customerId:string;
  linkedJobId:string;
}):Promise<{ok:true;parent:{id:string;customer_id:string|null;revision_number:number}}|{ok:false;message:string}>{
  if(args.quoteType!=='variation'){
    return{ok:true,parent:{id:'',customer_id:null,revision_number:0}};
  }
  if(!validId(args.parentQuoteId)){
    return{ok:false,message:'Select the quote this variation revises.'};
  }
  const {data:parent,error}=await args.db
    .from('quotes')
    .select('id,customer_id,revision_number')
    .eq('id',args.parentQuoteId)
    .maybeSingle();
  if(error||!parent)return{ok:false,message:'Parent quote not found.'};

  const customerCheck=validateVariationParentSelection({
    quoteType:'variation',
    parentQuoteId:parent.id,
    customerId:args.customerId,
    parentCustomerId:parent.customer_id,
  });
  if(!customerCheck.ok)return customerCheck;

  if(args.linkedJobId&&validId(args.linkedJobId)){
    const parentJobIds:string[]=[];
    const {data:links,error:linkError}=await args.db
      .from('job_quotes')
      .select('job_id')
      .eq('quote_id',parent.id);
    if(linkError&&!isMissingJobQuotesRelation(linkError)){
      return{ok:false,message:'Unable to validate parent job compatibility.'};
    }
    for(const row of links||[]){
      if(row.job_id)parentJobIds.push(String(row.job_id));
    }
    const {data:legacyJobs}=await args.db.from('jobs').select('id').eq('quote_id',parent.id);
    for(const row of legacyJobs||[]){
      if(row.id&&!parentJobIds.includes(String(row.id)))parentJobIds.push(String(row.id));
    }
    const jobCheck=variationParentJobCompatible({
      jobId:args.linkedJobId,
      parentLinkedJobIds:parentJobIds,
    });
    if(!jobCheck.ok)return jobCheck;
  }

  return{ok:true,parent:{id:parent.id,customer_id:parent.customer_id,revision_number:Number(parent.revision_number)||0}};
}

export async function saveQuoteDraft(v:QuoteDraft):Promise<{ok:boolean;message:string;id?:string}>{
 const user=await requireHqUser();
 if(!canManageOfficeOps(user.role))return {ok:false,message:'No permission to edit quotes'};
 if((v.id&&!validId(v.id))||(v.customerId&&!validId(v.customerId))||(v.enquiryId&&!validId(v.enquiryId))||(v.addressId&&!validId(v.addressId)))return {ok:false,message:'Invalid record reference'};
 if(v.parentQuoteId&&!validId(v.parentQuoteId))return {ok:false,message:'Invalid parent quote reference'};
 if(v.linkedJobId&&!validId(v.linkedJobId))return {ok:false,message:'Invalid linked job reference'};
 if(!v.title.trim())return {ok:false,message:'Enter a quote title'};
 if(v.title.length>200||v.scope.length>12000||v.address.length>1500||v.internalNotes.length>6000||v.lines.length>100)return {ok:false,message:'Quote exceeds field limits'};
 if(!['itemised','total_only'].includes(v.display)||!['fixed','detailed','mixed'].includes(v.mode))return {ok:false,message:'Invalid quote options'};
 for(const line of v.lines)if(!line.description.trim()||line.description.length>500||!['labour','material','equipment','subcontractor','other'].includes(line.category)||!Number.isFinite(line.quantity)||line.quantity<=0||line.quantity>100000||!Number.isInteger(line.price)||line.price<0||line.price>1000000000||(line.cost!==null&&(!Number.isInteger(line.cost)||line.cost<0||line.cost>1000000000)))return {ok:false,message:'Check line item values'};

 const quoteType=v.quoteType==='variation'?'variation':'standard';
 const db=dbAdmin();

 if(!v.id){
  const parentCheck=await assertVariationParent({
    db,
    quoteType,
    parentQuoteId:v.parentQuoteId||'',
    customerId:v.customerId,
    linkedJobId:v.linkedJobId||'',
  });
  if(!parentCheck.ok)return parentCheck;
 }

 let customerSnapshot={};
 if(v.customerId){const {data:c}=await db.from('customers').select('name,email,phone').eq('id',v.customerId).maybeSingle();if(!c)return {ok:false,message:'Customer not found'};customerSnapshot=c}
 if(v.enquiryId){const {data:e}=await db.from('enquiries').select('customer_id').eq('id',v.enquiryId).maybeSingle();if(!e)return {ok:false,message:'Enquiry not found'};if(e.customer_id&&v.customerId&&e.customer_id!==v.customerId)return {ok:false,message:'Customer does not match enquiry'}}
 let addressSnapshot:{address:string}&Record<string,unknown>={address:v.address.trim()};
 if(v.addressId){const {data:a}=await db.from('customer_addresses').select('address_line1,address_line2,suburb,state,postcode').eq('id',v.addressId).eq('customer_id',v.customerId).maybeSingle();if(!a)return {ok:false,message:'Invalid customer address'};addressSnapshot={...a,address:v.address.trim()||[a.address_line1,a.address_line2,a.suburb,a.state,a.postcode].filter(Boolean).join(', ')}}

 const values:Record<string,unknown>={
  customer_id:v.customerId||null,
  enquiry_id:v.enquiryId||null,
  site_address_id:v.addressId||null,
  site_address_snapshot:addressSnapshot,
  customer_snapshot:customerSnapshot,
  title:v.title.trim(),
  scope_of_work:v.scope.trim(),
  inclusions:v.inclusions,
  exclusions:v.exclusions,
  customer_notes:v.notes,
  internal_notes:v.internalNotes,
  customer_display:v.display,
  pricing_mode:v.mode,
  updated_at:new Date().toISOString(),
 };
 if(!v.id&&quoteType==='variation'&&v.parentQuoteId){
  values.parent_quote_id=v.parentQuoteId;
 }

 const lines=v.lines.map((l,i)=>({position:i,description:l.description.trim(),category:l.category,quantity:l.quantity,unit:l.unit||'each',unit_price_cents:l.price,internal_unit_cost_cents:l.cost,gst_applicable:l.gst}));
 const {data:id,error}=await db.rpc('save_quote_draft_atomic',{p_quote_id:v.id||null,p_values:values,p_lines:lines,p_actor:user.id});
 if(error||!id){
  if(isMissingCommercialSchemaError(error)&&quoteType==='variation'){
   return{ok:false,message:commercialSchemaMissingMessage()};
  }
  return {ok:false,message:error?.message||'Unable to save draft. No partial changes were made.'};
 }

 let message='Draft saved';
 if(v.linkedJobId){
  const link=await linkQuoteAfterSave({
   db,
   jobId:v.linkedJobId,
   quoteId:String(id),
   actorId:user.id,
   associationKind:quoteType==='variation'?'variation':'quote',
  });
  if(!link.ok){
   message=`Draft saved. ${link.message||'Job link needs review.'}`;
  }else{
   message='Draft saved and linked to job.';
   revalidatePath(`/hq/jobs/${v.linkedJobId}`);
  }
 }

 revalidatePath('/hq/quotes');revalidatePath('/hq/quotes/'+id);
 return {ok:true,message,id:String(id)};
}

export async function approveQuote(id:string):Promise<{ok:boolean;message:string}>{
 const user=await requireHqUser();
 if(!canManageAdminOps(user.role))return {ok:false,message:'Only an owner or admin can approve quotes.'};
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
 if(!canManageAdminOps(user.role))return {ok:false,message:'Only an owner or admin can approve quotes.'};
 const saved=await saveQuoteDraft(v);
 if(!saved.ok||!saved.id)return saved;
 const approved=await approveQuote(saved.id);
 return {...approved,id:saved.id,message:approved.ok?'Quote saved and approved.':approved.message+' Draft was saved.'};
}

type QuoteLifecycleStatus='sent'|'accepted'|'declined';

async function makeCommercialCurrentInternal(args:{
  db:ReturnType<typeof dbAdmin>;
  quoteId:string;
  actorId:string;
  requireAccepted:boolean;
}):Promise<{ok:boolean;message:string;requiresReview?:boolean}>{
  const {data,error}=await args.db.rpc('make_quote_commercial_current_atomic',{
    p_quote_id:args.quoteId,
    p_actor:args.actorId,
    p_require_accepted:args.requireAccepted,
  });
  if(error){
    if(isMissingCommercialSchemaError(error)){
      return{ok:false,message:commercialSchemaMissingMessage()};
    }
    return{ok:false,message:error.message||'Unable to update commercial current version.'};
  }
  return interpretMakeCurrentResult(data);
}

/** Office staff may designate commercial current for an already-accepted quote. */
export async function makeQuoteCommercialCurrent(id:string):Promise<{ok:boolean;message:string;requiresReview?:boolean}>{
  const user=await requireHqUser();
  if(!canManageOfficeOps(user.role))return{ok:false,message:'No permission to update commercial current version.'};
  if(!validId(id))return{ok:false,message:'Invalid quote reference'};
  const db=dbAdmin();
  const result=await makeCommercialCurrentInternal({
    db,
    quoteId:id,
    actorId:user.id,
    requireAccepted:true,
  });
  revalidatePath('/hq/quotes');
  revalidatePath('/hq/quotes/'+id);
  revalidatePath('/hq/quotes/'+id+'/preview');
  return result;
}

async function advanceQuoteStatus(id:string,next:Exclude<QuoteLifecycleStatus,'accepted'>):Promise<{ok:boolean;message:string}>{
 const user=await requireHqUser();
 if(!canManageOfficeOps(user.role))return {ok:false,message:'No permission to update quote status.'};
 if(!validId(id))return {ok:false,message:'Invalid quote reference'};
 const db=dbAdmin();
 const {data:q}=await db.from('quotes').select('id,status').eq('id',id).maybeSingle();
 if(!q)return {ok:false,message:'Quote not found.'};

 const allowedFrom:Record<Exclude<QuoteLifecycleStatus,'accepted'>,string[]>={
  sent:['approved'],
  declined:['approved','sent'],
 };
 if(!allowedFrom[next].includes(q.status)){
  return {ok:false,message:`Cannot mark as ${next} from status "${q.status}".`};
 }

 const now=new Date().toISOString();
 const patch:Record<string,unknown>={status:next,updated_at:now};
 if(next==='sent')patch.sent_at=now;

 const {data:updated,error}=await db.from('quotes').update(patch).eq('id',id).eq('status',q.status).select('id').maybeSingle();
 if(error||!updated)return {ok:false,message:'Status update failed or quote was changed. Refresh and try again.'};

 const action=next==='sent'?'marked_sent':next;
 await db.from('quote_activity').insert({quote_id:id,actor_id:user.id,action});

 const message=
  next==='sent'?'Marked as sent. This does not email the customer.':
  'Quote marked as declined.';

 revalidatePath('/hq/quotes');revalidatePath('/hq/quotes/'+id);revalidatePath('/hq/quotes/'+id+'/preview');
 return {ok:true,message};
}

/**
 * Accept + (when eligible) commercial-current transition in one DB transaction via accept_quote_atomic.
 * Failure rolls back acceptance evidence and supersession together.
 */
export async function markQuoteAccepted(id:string):Promise<{ok:boolean;message:string;requiresReview?:boolean}>{
  const user=await requireHqUser();
  if(!canManageOfficeOps(user.role))return{ok:false,message:'No permission to update quote status.'};
  if(!validId(id))return{ok:false,message:'Invalid quote reference'};
  const db=dbAdmin();
  const {data,error}=await db.rpc('accept_quote_atomic',{p_quote_id:id,p_actor:user.id});
  if(error){
    if(isMissingCommercialSchemaError(error)){
      return{ok:false,message:commercialSchemaMissingMessage()};
    }
    return{ok:false,message:error.message||'Unable to accept quote.'};
  }
  const result=interpretMakeCurrentResult(data,'Unable to accept quote.');
  revalidatePath('/hq/quotes');
  revalidatePath('/hq/quotes/'+id);
  revalidatePath('/hq/quotes/'+id+'/preview');
  return result;
}

/** Records that the office issued the quote. Does not send email. */
export async function markQuoteSent(id:string){return advanceQuoteStatus(id,'sent')}
export async function markQuoteDeclined(id:string){return advanceQuoteStatus(id,'declined')}
