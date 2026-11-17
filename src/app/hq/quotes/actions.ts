'use server';
import {revalidatePath} from 'next/cache';
import {requireHqUser,dbAdmin} from '@/lib/hq-auth';
import {canManageAdminOps,canManageOfficeOps} from '@/lib/hq-roles';
import {
  QUOTE_PARENT_ANCESTOR_MAX_DEPTH,
  canChangePersistedQuoteCustomer,
  canProceedToApproveAfterSave,
  commercialSchemaMissingMessage,
  interpretMakeCurrentResult,
  interpretSaveDraftAndLinkResult,
  isDuplicateAssociationMessage,
  isEligibleVariationParentStatus,
  isMissingCommercialSchemaError,
  isMissingSaveAndLinkJobsRpcError,
  isValidVariationParentCandidate,
  parentChainIntroducesCycle,
  parentRevisionChainTooDeepMessage,
  partialJobLinkFailureMessage,
  uniqueJobIds,
  validateVariationParentSelection,
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
  /** @deprecated Prefer linkedJobIds. Kept for callers that pass a single job. */
  linkedJobId?:string;
  /** Jobs to associate after save (same customer; duplicates ignored). */
  linkedJobIds?:string[];
  /** Valid-for days used when approving (14 | 30 | 60). Defaults to 30. */
  validityDays?:number;
};

export type QuoteSaveResult={
  ok:boolean;
  message:string;
  id?:string;
  linkStatus?:'none'|'complete'|'partial'|'failed'|'rolled_back';
  linkedJobIds?:string[];
  failedJobIds?:string[];
};

const validId=(s:string)=>/^[0-9a-f-]{36}$/i.test(s);

function missingJobQuoteRpc(error:{message?:string;code?:string}|null):boolean{
  if(!error)return false;
  const message=error.message||'';
  return(
    error.code==='PGRST202'||
    /job_quote_link_atomic|job_quote_unlink_atomic/i.test(message)||
    /could not find the function/i.test(message)
  );
}

async function linkQuoteAfterSave(args:{
  db:ReturnType<typeof dbAdmin>;
  jobId:string;
  quoteId:string;
  actorId:string;
  associationKind:'quote'|'variation';
}):Promise<{ok:boolean;message?:string;duplicate?:boolean}>{
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
    return{ok:false,message:'Job linking needs the job_quotes migration.'};
  }
  const result=interpretJobQuoteAtomicResult(data,'Linking to the job failed.');
  if(result.ok)return{ok:true};
  if(isDuplicateAssociationMessage(result.message||error?.message)){
    return{ok:true,duplicate:true,message:result.message};
  }
  if(error||!result.ok){
    return{ok:false,message:result.message||error?.message||'Linking to the job failed.'};
  }
  return{ok:true};
}

async function loadParentAncestorIds(args:{
  db:ReturnType<typeof dbAdmin>;
  parentId:string;
  maxDepth?:number;
}):Promise<{ok:true;ancestorIds:string[];chainExceedsMaxDepth:boolean}|{ok:false;message:string}>{
  const maxDepth=args.maxDepth??QUOTE_PARENT_ANCESTOR_MAX_DEPTH;
  const ancestorIds:string[]=[];
  const seen=new Set<string>([args.parentId]);
  let currentId:string|null=args.parentId;
  for(let depth=0;depth<maxDepth;depth++){
    if(!currentId)break;
    const lookupId:string=currentId;
    const {data,error}:{data:{parent_quote_id?:string|null}|null;error:{message?:string}|null}=await args.db
      .from('quotes')
      .select('parent_quote_id')
      .eq('id',lookupId)
      .maybeSingle();
    if(error)return{ok:false,message:'Unable to validate parent revision chain.'};
    const nextId:string|null=data?.parent_quote_id?String(data.parent_quote_id):null;
    if(!nextId)return{ok:true,ancestorIds,chainExceedsMaxDepth:false};
    if(seen.has(nextId)){
      return{ok:false,message:'That parent has a circular revision chain and cannot be used.'};
    }
    seen.add(nextId);
    ancestorIds.push(nextId);
    currentId=nextId;
  }
  // Exhausted supported depth while the chain may continue — fail closed.
  if(currentId){
    const {data,error}:{data:{parent_quote_id?:string|null}|null;error:{message?:string}|null}=await args.db
      .from('quotes')
      .select('parent_quote_id')
      .eq('id',currentId)
      .maybeSingle();
    if(error)return{ok:false,message:'Unable to validate parent revision chain.'};
    if(data?.parent_quote_id){
      return{ok:false,message:parentRevisionChainTooDeepMessage()};
    }
  }
  return{ok:true,ancestorIds,chainExceedsMaxDepth:false};
}

/** Count job_quotes + legacy jobs.quote_id associations for a persisted quote. */
async function countQuoteJobAssociations(args:{
  db:ReturnType<typeof dbAdmin>;
  quoteId:string;
}):Promise<{ok:true;count:number}|{ok:false;message:string}>{
  const ids=new Set<string>();
  const {data:links,error:linkError}=await args.db
    .from('job_quotes')
    .select('job_id')
    .eq('quote_id',args.quoteId);
  if(linkError&&!isMissingJobQuotesRelation(linkError)){
    return{ok:false,message:'Unable to verify job associations before changing customer.'};
  }
  if(!(linkError&&isMissingJobQuotesRelation(linkError))){
    for(const row of links||[]){
      if(row.job_id)ids.add(String(row.job_id));
    }
  }
  const {data:legacy,error:legacyError}=await args.db
    .from('jobs')
    .select('id')
    .eq('quote_id',args.quoteId);
  if(legacyError)return{ok:false,message:'Unable to verify legacy job associations before changing customer.'};
  for(const row of legacy||[]){
    if(row.id)ids.add(String(row.id));
  }
  return{ok:true,count:ids.size};
}

async function assertVariationParent(args:{
  db:ReturnType<typeof dbAdmin>;
  quoteType:'standard'|'variation';
  parentQuoteId:string;
  customerId:string;
  editingQuoteId?:string;
}):Promise<{ok:true;parent:{id:string;customer_id:string|null;revision_number:number}}|{ok:false;message:string}>{
  if(args.quoteType!=='variation'){
    return{ok:true,parent:{id:'',customer_id:null,revision_number:0}};
  }
  if(!validId(args.parentQuoteId)){
    return{ok:false,message:'Select the quote this variation revises.'};
  }
  if(args.editingQuoteId&&args.parentQuoteId===args.editingQuoteId){
    return{ok:false,message:'A quote cannot revise itself.'};
  }
  const {data:parent,error}=await args.db
    .from('quotes')
    .select('id,customer_id,revision_number,status')
    .eq('id',args.parentQuoteId)
    .maybeSingle();
  if(error||!parent)return{ok:false,message:'Parent quote not found.'};

  if(!isValidVariationParentCandidate({
    candidateId:parent.id,
    candidateStatus:String(parent.status||''),
    candidateCustomerId:parent.customer_id,
    quoteCustomerId:args.customerId,
    editingQuoteId:args.editingQuoteId||null,
  })){
    if(!isEligibleVariationParentStatus(String(parent.status||''))){
      return{ok:false,message:'That quote cannot be used as a variation parent.'};
    }
    const customerCheck=validateVariationParentSelection({
      quoteType:'variation',
      parentQuoteId:parent.id,
      customerId:args.customerId,
      parentCustomerId:parent.customer_id,
    });
    if(!customerCheck.ok)return customerCheck;
    return{ok:false,message:'That quote cannot be used as a variation parent.'};
  }

  const chain=await loadParentAncestorIds({db:args.db,parentId:parent.id});
  if(!chain.ok)return chain;
  const cycle=parentChainIntroducesCycle({
    parentId:parent.id,
    editingQuoteId:args.editingQuoteId||null,
    parentAncestorIds:chain.ancestorIds,
    chainExceedsMaxDepth:chain.chainExceedsMaxDepth,
  });
  if(!cycle.ok)return cycle;

  return{ok:true,parent:{id:parent.id,customer_id:parent.customer_id,revision_number:Number(parent.revision_number)||0}};
}

function resolveLinkedJobIds(v:QuoteDraft):string[]{
  return uniqueJobIds([...(v.linkedJobIds||[]),v.linkedJobId||'']).filter(validId);
}

/** Fail closed before save: every requested job must exist and match the quote customer. */
async function assertJobsCompatibleWithCustomer(args:{
  db:ReturnType<typeof dbAdmin>;
  customerId:string;
  jobIds:string[];
}):Promise<{ok:true}|{ok:false;message:string}>{
  if(!args.jobIds.length)return{ok:true};
  if(!args.customerId||!validId(args.customerId)){
    return{ok:false,message:'Select a customer before linking jobs.'};
  }
  const {data:jobs,error}=await args.db
    .from('jobs')
    .select('id,customer_id,job_number')
    .in('id',args.jobIds);
  if(error)return{ok:false,message:'Unable to validate linked jobs.'};
  const found=new Map((jobs||[]).map(j=>[String(j.id),j]));
  for(const jobId of args.jobIds){
    const job=found.get(jobId);
    if(!job)return{ok:false,message:'Linked job not found.'};
    const compatibility=canLinkQuoteToJob(job.customer_id,args.customerId);
    if(!compatibility.ok){
      return{ok:false,message:compatibility.message};
    }
  }
  return{ok:true};
}

export async function saveQuoteDraft(v:QuoteDraft):Promise<QuoteSaveResult>{
 const user=await requireHqUser();
 if(!canManageOfficeOps(user.role))return {ok:false,message:'No permission to edit quotes'};
 if((v.id&&!validId(v.id))||(v.customerId&&!validId(v.customerId))||(v.enquiryId&&!validId(v.enquiryId))||(v.addressId&&!validId(v.addressId)))return {ok:false,message:'Invalid record reference'};
 if(v.parentQuoteId&&!validId(v.parentQuoteId))return {ok:false,message:'Invalid parent quote reference'};
 const linkedJobIds=resolveLinkedJobIds(v);
 if(linkedJobIds.some(id=>!validId(id)))return {ok:false,message:'Invalid linked job reference'};
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
  });
  if(!parentCheck.ok)return parentCheck;
 }else{
  // Parent/family immutable after save — ignore client parent and validate stored parent vs customer.
  const {data:existing}=await db
    .from('quotes')
    .select('parent_quote_id,customer_id')
    .eq('id',v.id)
    .maybeSingle();
  if(!existing)return{ok:false,message:'Quote not found.'};
  const storedCustomer=existing.customer_id?String(existing.customer_id):'';
  if(storedCustomer!==(v.customerId||'')){
   const assoc=await countQuoteJobAssociations({db,quoteId:v.id});
   if(!assoc.ok)return assoc;
   const customerChange=canChangePersistedQuoteCustomer({
    quoteIsPersisted:true,
    previousCustomerId:storedCustomer,
    nextCustomerId:v.customerId,
    associatedJobCount:assoc.count,
   });
   if(!customerChange.ok)return customerChange;
  }
  const storedParent=existing.parent_quote_id?String(existing.parent_quote_id):'';
  if(storedParent){
   const parentCheck=await assertVariationParent({
    db,
    quoteType:'variation',
    parentQuoteId:storedParent,
    customerId:v.customerId,
    editingQuoteId:v.id,
   });
   if(!parentCheck.ok)return parentCheck;
  }
  // Existing quotes cannot gain/change parent_quote_id here (immutable in save_quote_draft_atomic).
 }

 const jobsCheck=await assertJobsCompatibleWithCustomer({
  db,
  customerId:v.customerId,
  jobIds:linkedJobIds,
 });
 if(!jobsCheck.ok)return jobsCheck;

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
 const associationKind=quoteType==='variation'?'variation':'quote';

 // Prefer single-transaction save + multi-job link when associations are requested.
 if(linkedJobIds.length){
  const {data,error}=await db.rpc('save_quote_draft_and_link_jobs_atomic',{
   p_quote_id:v.id||null,
   p_values:values,
   p_lines:lines,
   p_actor:user.id,
   p_job_ids:linkedJobIds,
   p_association_kind:associationKind,
  });

  if(!error){
   const parsed=interpretSaveDraftAndLinkResult(data);
   if(parsed.ok&&parsed.quoteId){
    for(const jobId of parsed.linkedJobIds)revalidatePath(`/hq/jobs/${jobId}`);
    revalidatePath('/hq/quotes');revalidatePath('/hq/quotes/'+parsed.quoteId);
    return{
     ok:true,
     message:parsed.message,
     id:parsed.quoteId,
     linkStatus:'complete',
     linkedJobIds:parsed.linkedJobIds,
    };
   }
   // Function returned ok:false without raising (should not happen for raise path).
   return{
    ok:false,
    message:parsed.message,
    linkStatus:'rolled_back',
   };
  }

  if(!isMissingSaveAndLinkJobsRpcError(error)){
   if(isMissingCommercialSchemaError(error)&&quoteType==='variation'){
    return{ok:false,message:commercialSchemaMissingMessage(),linkStatus:'failed'};
   }
   // Raised link/customer failure rolled back the save.
   return{
    ok:false,
    message:error.message||'Unable to save and link. No partial changes were made.',
    linkStatus:'rolled_back',
   };
  }
  // Fall through to legacy path when multi-job RPC is not installed yet.
 }

 // Legacy / no-jobs path: save first, then link individually (no unsafe delete rollback).
 const {data:id,error}=await db.rpc('save_quote_draft_atomic',{p_quote_id:v.id||null,p_values:values,p_lines:lines,p_actor:user.id});
 if(error||!id){
  if(isMissingCommercialSchemaError(error)&&quoteType==='variation'){
   return{ok:false,message:commercialSchemaMissingMessage(),linkStatus:'failed'};
  }
  return {ok:false,message:error?.message||'Unable to save draft. No partial changes were made.',linkStatus:'failed'};
 }

 if(!linkedJobIds.length){
  revalidatePath('/hq/quotes');revalidatePath('/hq/quotes/'+id);
  return{ok:true,message:'Draft saved',id:String(id),linkStatus:'none',linkedJobIds:[]};
 }

 const linked:string[]=[];
 const failed:string[]=[];
 const failMessages:string[]=[];
 for(const jobId of linkedJobIds){
  const link=await linkQuoteAfterSave({
   db,
   jobId,
   quoteId:String(id),
   actorId:user.id,
   associationKind,
  });
  if(link.ok){
   linked.push(jobId);
   revalidatePath(`/hq/jobs/${jobId}`);
  }else{
   failed.push(jobId);
   failMessages.push(link.message||'Job link needs review.');
  }
 }

 revalidatePath('/hq/quotes');revalidatePath('/hq/quotes/'+id);

 if(failed.length){
  return{
   ok:false,
   id:String(id),
   linkStatus:linked.length?'partial':'failed',
   linkedJobIds:linked,
   failedJobIds:failed,
   message:partialJobLinkFailureMessage({
    savedQuoteId:String(id),
    failedMessages:failMessages,
    linkedCount:linked.length,
    requestedCount:linkedJobIds.length,
   }),
  };
 }

 return{
  ok:true,
  message:linkedJobIds.length>1?'Draft saved and linked to jobs.':'Draft saved and linked to job.',
  id:String(id),
  linkStatus:'complete',
  linkedJobIds:linked,
 };
}

export async function associateQuoteWithJob(args:{
  quoteId:string;
  jobId:string;
}):Promise<{ok:boolean;message:string}>{
 const user=await requireHqUser();
 if(!canManageOfficeOps(user.role))return{ok:false,message:'No permission to link quotes'};
 if(!validId(args.quoteId)||!validId(args.jobId))return{ok:false,message:'Invalid record reference'};
 const db=dbAdmin();
 const {data:quote}=await db.from('quotes').select('id,customer_id,parent_quote_id').eq('id',args.quoteId).maybeSingle();
 if(!quote)return{ok:false,message:'Quote not found.'};
 const jobsCheck=await assertJobsCompatibleWithCustomer({
  db,
  customerId:String(quote.customer_id||''),
  jobIds:[args.jobId],
 });
 if(!jobsCheck.ok)return jobsCheck;
 const link=await linkQuoteAfterSave({
  db,
  jobId:args.jobId,
  quoteId:args.quoteId,
  actorId:user.id,
  associationKind:quote.parent_quote_id?'variation':'quote',
 });
 if(!link.ok)return{ok:false,message:link.message||'Unable to link job.'};
 revalidatePath(`/hq/quotes/${args.quoteId}`);
 revalidatePath(`/hq/jobs/${args.jobId}`);
 return{ok:true,message:link.duplicate?'Job already linked to quote.':'Job linked to quote.'};
}

export async function unlinkQuoteFromJob(args:{
  quoteId:string;
  jobId:string;
}):Promise<{ok:boolean;message:string}>{
 const user=await requireHqUser();
 if(!canManageOfficeOps(user.role))return{ok:false,message:'No permission to unlink quotes'};
 if(!validId(args.quoteId)||!validId(args.jobId))return{ok:false,message:'Invalid record reference'};
 const db=dbAdmin();
 const {data,error}=await db.rpc('job_quote_unlink_atomic',{
  p_job_id:args.jobId,
  p_quote_id:args.quoteId,
  p_actor:user.id,
 });
 if(error&&(isMissingJobQuotesRelation(error)||missingJobQuoteRpc(error))){
  return{ok:false,message:'Unlinking needs the job_quotes migration.'};
 }
 const result=interpretJobQuoteAtomicResult(data,'Unable to unlink job.');
 if(error||!result.ok)return{ok:false,message:result.message||error?.message||'Unable to unlink job.'};
 revalidatePath(`/hq/quotes/${args.quoteId}`);
 revalidatePath(`/hq/jobs/${args.jobId}`);
 return{ok:true,message:result.message||'Job unlinked from quote.'};
}

function addDaysPerthIso(days:number):string{
  const issue=new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Perth'});
  const [y,m,d]=issue.split('-').map(Number);
  const next=new Date(Date.UTC(y,m-1,d+days));
  return next.toISOString().slice(0,10);
}

export async function approveQuote(id:string,validityDays:number=30):Promise<{ok:boolean;message:string}>{
 const user=await requireHqUser();
 if(!canManageAdminOps(user.role))return {ok:false,message:'Only an owner or admin can approve quotes.'};
 if(!validId(id))return {ok:false,message:'Invalid quote reference'};
 const days=[14,30,60].includes(Number(validityDays))?Number(validityDays):30;
 const db=dbAdmin();
 const {data:q}=await db.from('quotes').select('id,status,customer_id,title,scope_of_work,site_address_snapshot').eq('id',id).maybeSingle();
 if(!q||!['draft','changes_requested','pending_approval'].includes(q.status))return {ok:false,message:'Quote cannot be approved in its current status.'};
 if(!q.customer_id||!q.title?.trim())return {ok:false,message:'Select a customer and enter a title before approval.'};
 const {data:items,error:itemsError}=await db.from('quote_items').select('quantity,unit_price_cents,description').eq('quote_id',id);
 if(itemsError||!items?.length||items.some(l=>!l.description?.trim()||Number(l.quantity)<=0||Number(l.unit_price_cents)<0))return {ok:false,message:'Add at least one valid priced item before approval.'};
 const issueDate=new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Perth'});
 const expiryDate=addDaysPerthIso(days);
 const {data:approved,error}=await db.from('quotes').update({
  status:'approved',
  approved_by:user.id,
  approved_at:new Date().toISOString(),
  issue_date:issueDate,
  expiry_date:expiryDate,
 }).eq('id',id).eq('status',q.status).select('id').maybeSingle();
 if(error||!approved)return {ok:false,message:'Approval failed or quote was changed. Refresh and try again.'};
 const {error:logError}=await db.from('quote_activity').insert({quote_id:id,actor_id:user.id,action:'approved'});
 revalidatePath('/hq/quotes');revalidatePath('/hq/quotes/'+id);revalidatePath('/hq/quotes/'+id+'/preview');
 return {ok:true,message:logError?'Quote approved, but the activity log needs review.':`Quote approved (valid until ${expiryDate}). Ready for PDF export.`};
}

export async function saveAndApproveQuote(v:QuoteDraft):Promise<QuoteSaveResult>{
 const user=await requireHqUser();
 if(!canManageAdminOps(user.role))return {ok:false,message:'Only an owner or admin can approve quotes.'};
 const saved=await saveQuoteDraft(v);
 if(!canProceedToApproveAfterSave({
  saveOk:saved.ok,
  linkStatus:saved.linkStatus||(saved.ok?'none':'failed'),
 })){
  if(saved.id&&(saved.linkStatus==='partial'||saved.linkStatus==='failed')){
   return{
    ...saved,
    ok:false,
    message:`${saved.message} Approval was not applied.`,
   };
  }
  return saved;
 }
 const approved=await approveQuote(saved.id!,v.validityDays??30);
 if(!approved.ok){
  return{ok:false,id:saved.id,linkStatus:saved.linkStatus,message:approved.message+' Draft was saved.'};
 }
 return{ok:true,id:saved.id,linkStatus:saved.linkStatus,linkedJobIds:saved.linkedJobIds,message:approved.message};
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

/** Immediate-parent commercial snapshot for variation prefill (deep-copied lines; no ids/status). */
export async function getParentQuotePrefill(parentId:string,expectedCustomerId?:string):Promise<{
  ok:boolean;
  message?:string;
  prefill?:{
    title:string;
    scope:string;
    inclusions:string;
    exclusions:string;
    notes:string;
    internalNotes:string;
    display:string;
    mode:string;
    address:string;
    addressId:string;
    customerId:string;
    lines:{description:string;category:string;quantity:number;unit:string;price:number;cost:number|null;gst:boolean}[];
  };
}>{
  const user=await requireHqUser();
  if(!canManageOfficeOps(user.role))return{ok:false,message:'No permission'};
  if(!validId(parentId))return{ok:false,message:'Invalid parent quote'};
  if(expectedCustomerId&&!validId(expectedCustomerId))return{ok:false,message:'Invalid customer reference'};
  const db=dbAdmin();
  const {data:parent}=await db
    .from('quotes')
    .select('id,title,scope_of_work,inclusions,exclusions,customer_notes,internal_notes,customer_display,pricing_mode,site_address_id,site_address_snapshot,customer_id,status')
    .eq('id',parentId)
    .maybeSingle();
  if(!parent)return{ok:false,message:'Parent quote not found'};
  if(!isEligibleVariationParentStatus(String(parent.status||''))){
    return{ok:false,message:'That quote cannot be used as a variation parent.'};
  }
  if(expectedCustomerId&&parent.customer_id!==expectedCustomerId){
    return{ok:false,message:'Variation parent must belong to the same customer.'};
  }
  const {data:items}=await db
    .from('quote_items')
    .select('description,category,quantity,unit,unit_price_cents,internal_unit_cost_cents,gst_applicable')
    .eq('quote_id',parentId)
    .order('position');
  const snap=parent.site_address_snapshot as {address?:string}|null;
  return{
    ok:true,
    prefill:{
      title:String(parent.title||''),
      scope:String(parent.scope_of_work||''),
      inclusions:String(parent.inclusions||''),
      exclusions:String(parent.exclusions||''),
      notes:String(parent.customer_notes||''),
      internalNotes:String(parent.internal_notes||''),
      display:String(parent.customer_display||'itemised'),
      mode:String(parent.pricing_mode||'detailed'),
      address:String(snap?.address||''),
      addressId:String(parent.site_address_id||''),
      customerId:String(parent.customer_id||''),
      lines:(items||[]).map(i=>({
        description:String(i.description||''),
        category:String(i.category||'other'),
        quantity:Number(i.quantity)||0,
        unit:String(i.unit||'each'),
        price:Number(i.unit_price_cents)||0,
        cost:i.internal_unit_cost_cents===null||i.internal_unit_cost_cents===undefined?null:Number(i.internal_unit_cost_cents),
        gst:Boolean(i.gst_applicable),
      })),
    },
  };
}

/** On-demand customer search for quote pickers (avoids shipping 1000 customers in RSC). */
export async function searchQuoteCustomers(query:string):Promise<{id:string;name:string;email:string|null;phone:string|null}[]>{
  await requireHqUser();
  const q=query.trim().replace(/[%_,()"]/g,'').slice(0,80);
  const db=dbAdmin();
  if(!q){
    const {data}=await db.from('customers').select('id,name,email,phone').order('name').limit(40);
    return (data||[]) as {id:string;name:string;email:string|null;phone:string|null}[];
  }
  const pattern=`%${q}%`;
  const {data}=await db
    .from('customers')
    .select('id,name,email,phone')
    .or(`name.ilike."${pattern}",email.ilike."${pattern}",phone.ilike."${pattern}"`)
    .order('name')
    .limit(40);
  return (data||[]) as {id:string;name:string;email:string|null;phone:string|null}[];
}

/** Addresses for a selected customer (loaded when the customer changes). */
export async function loadCustomerAddressesForQuote(customerId:string):Promise<{id:string;customer_id:string;label:string|null;address_line1:string;suburb:string|null;state:string|null;postcode:string|null}[]>{
  await requireHqUser();
  if(!customerId||!/^[0-9a-f-]{36}$/i.test(customerId))return [];
  const {data}=await dbAdmin()
    .from('customer_addresses')
    .select('id,customer_id,label,address_line1,suburb,state,postcode')
    .eq('customer_id',customerId)
    .limit(100);
  return (data||[]) as {id:string;customer_id:string;label:string|null;address_line1:string;suburb:string|null;state:string|null;postcode:string|null}[];
}
