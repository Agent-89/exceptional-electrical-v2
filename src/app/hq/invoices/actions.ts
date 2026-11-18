'use server';
import {revalidatePath} from 'next/cache';
import {requireHqUser,dbAdmin} from '@/lib/hq-auth';
import {canManageAdminOps,canManageOfficeOps} from '@/lib/hq-roles';
import {defaultInvoiceTermsAndPayment} from '@/lib/business-profile';
import {
  canLinkInvoiceToJob,
  canRecordInvoicePayment,
  canVoidInvoice,
  FIXED_INVOICE_LINE,
  invoiceTotalsCents,
  isInvoicePaymentMethod,
  isMissingInvoiceSchemaError,
  missingInvoiceSchemaMessage,
} from '@/lib/invoice-commercial';

type Line={description:string;category:string;quantity:number;unit:string;price:number;cost:number|null;gst:boolean};

export type InvoiceDraft={
  id?:string;
  customerId:string;
  jobId:string;
  quoteId:string;
  addressId:string;
  address:string;
  title:string;
  description:string;
  notes:string;
  internalNotes:string;
  termsAndPayment:string;
  display:string;
  mode:string;
  customerReference?:string;
  issueDate:string;
  dueDate:string;
  lines:Line[];
};

export type InvoiceSaveResult={ok:boolean;message:string;id?:string};

const validId=(s:string)=>/^[0-9a-f-]{36}$/i.test(s);

function perthToday(){
  return new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Perth'});
}

function addDaysPerthIso(days:number):string{
  const issue=perthToday();
  const [y,m,d]=issue.split('-').map(Number);
  const next=new Date(Date.UTC(y,m-1,d+days));
  return next.toISOString().slice(0,10);
}

function addressSnapshot(address:string){
  const trimmed=address.trim();
  return trimmed?{address:trimmed}:{};
}

async function loadCustomerSnapshot(db:ReturnType<typeof dbAdmin>,customerId:string){
  const {data}=await db.from('customers').select('id,name,email,phone').eq('id',customerId).maybeSingle();
  if(!data)return null;
  return {id:data.id,name:data.name,email:data.email,phone:data.phone};
}

async function loadJobSnapshot(db:ReturnType<typeof dbAdmin>,jobId:string){
  const {data}=await db.from('jobs').select('id,job_number,title,site_address_text,customer_id').eq('id',jobId).maybeSingle();
  if(!data)return null;
  return {
    id:data.id,
    job_number:data.job_number,
    title:data.title,
    site_address:data.site_address_text,
    customer_id:data.customer_id,
  };
}

export async function searchInvoiceCustomers(query:string):Promise<{id:string;name:string;email:string|null;phone:string|null}[]>{
  const user=await requireHqUser();
  if(!canManageOfficeOps(user.role))return [];
  const q=query.trim().replace(/[%_,]/g,' ').slice(0,80);
  const db=dbAdmin();
  let req=db.from('customers').select('id,name,email,phone').order('name').limit(40);
  if(q)req=req.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
  const {data}=await req;
  return data||[];
}

export async function loadCustomerAddressesForInvoice(customerId:string){
  const user=await requireHqUser();
  if(!canManageOfficeOps(user.role)||!validId(customerId))return [];
  const db=dbAdmin();
  const {data}=await db
    .from('customer_addresses')
    .select('id,customer_id,label,address_line1,suburb,state,postcode')
    .eq('customer_id',customerId)
    .limit(100);
  return data||[];
}

export async function loadCustomerJobsForInvoice(customerId:string){
  const user=await requireHqUser();
  if(!canManageOfficeOps(user.role)||!validId(customerId))return [];
  const db=dbAdmin();
  const {data}=await db
    .from('jobs')
    .select('id,job_number,title,status')
    .eq('customer_id',customerId)
    .order('updated_at',{ascending:false})
    .limit(80);
  return (data||[]).map(j=>({
    id:String(j.id),
    jobNumber:j.job_number as string|null,
    title:j.title as string|null,
    status:String(j.status||''),
  }));
}

export async function saveInvoiceDraft(draft:InvoiceDraft):Promise<InvoiceSaveResult>{
  const user=await requireHqUser();
  if(!canManageOfficeOps(user.role))return {ok:false,message:'Not authorised to edit invoices'};
  if(draft.id&&!validId(draft.id))return {ok:false,message:'Invalid invoice reference'};
  if(!validId(draft.customerId))return {ok:false,message:'Select a customer'};
  if(draft.jobId&&!validId(draft.jobId))return {ok:false,message:'Invalid job reference'};
  if(draft.quoteId&&!validId(draft.quoteId))return {ok:false,message:'Invalid quote reference'};

  const db=dbAdmin();
  const customer=await loadCustomerSnapshot(db,draft.customerId);
  if(!customer)return {ok:false,message:'Customer not found'};

  let jobSnapshot:Record<string,unknown>={};
  if(draft.jobId){
    const job=await loadJobSnapshot(db,draft.jobId);
    if(!job)return {ok:false,message:'Linked job not found'};
    const link=canLinkInvoiceToJob(draft.customerId,job.customer_id as string|null);
    if(!link.ok)return link;
    jobSnapshot={
      id:job.id,
      job_number:job.job_number,
      title:job.title,
      site_address:job.site_address,
    };
  }

  if(draft.quoteId){
    const {data:quote}=await db.from('quotes').select('id,customer_id').eq('id',draft.quoteId).maybeSingle();
    if(!quote)return {ok:false,message:'Linked quote not found'};
    if(quote.customer_id&&quote.customer_id!==draft.customerId){
      return {ok:false,message:'Linked quote must belong to the same customer'};
    }
  }

  const lines=draft.lines
    .filter(l=>l.description.trim()||l.price>0)
    .map((l,i)=>({
      position:i,
      description:l.description.trim()||(l.category=== 'other'&&draft.mode==='fixed'?FIXED_INVOICE_LINE:'Line item'),
      category:l.category||'other',
      quantity:Number(l.quantity)||0,
      unit:l.unit||'each',
      unit_price_cents:Math.round(Number(l.price)||0),
      internal_unit_cost_cents:l.cost===null||l.cost===undefined?null:Math.round(Number(l.cost)),
      gst_applicable:l.gst!==false,
    }));

  const values={
    customer_id:draft.customerId,
    job_id:draft.jobId||null,
    quote_id:draft.quoteId||null,
    site_address_id:draft.addressId&&validId(draft.addressId)?draft.addressId:null,
    customer_snapshot:customer,
    site_address_snapshot:addressSnapshot(draft.address),
    job_snapshot:jobSnapshot,
    title:(draft.title||'').trim()||customer.name,
    description:draft.description.trim(),
    customer_notes:draft.notes,
    internal_notes:draft.internalNotes,
    terms_and_payment:(draft.termsAndPayment||'').trim()||defaultInvoiceTermsAndPayment(),
    customer_display:draft.display==='total_only'?'total_only':'itemised',
    pricing_mode:['fixed','detailed','mixed'].includes(draft.mode)?draft.mode:'detailed',
    customer_reference:(draft.customerReference||'').trim()||null,
    issue_date:draft.issueDate||null,
    due_date:draft.dueDate||null,
  };

  const {data:id,error}=await db.rpc('save_invoice_draft_atomic',{
    p_invoice_id:draft.id||null,
    p_values:values,
    p_lines:lines,
    p_actor:user.id,
  });

  if(error||!id){
    if(isMissingInvoiceSchemaError(error))return {ok:false,message:missingInvoiceSchemaMessage()};
    return {ok:false,message:error?.message||'Unable to save invoice draft'};
  }

  const invoiceId=String(id);
  revalidatePath('/hq/invoices');
  revalidatePath('/hq/invoices/'+invoiceId);
  if(draft.jobId)revalidatePath('/hq/jobs/'+draft.jobId);
  return {ok:true,message:'Draft saved',id:invoiceId};
}

export async function saveAndApproveInvoice(draft:InvoiceDraft):Promise<InvoiceSaveResult>{
  const saved=await saveInvoiceDraft(draft);
  if(!saved.ok||!saved.id)return saved;
  const approved=await approveInvoice(saved.id);
  return {ok:approved.ok,message:approved.message,id:saved.id};
}

export async function approveInvoice(id:string):Promise<{ok:boolean;message:string}>{
  const user=await requireHqUser();
  if(!canManageAdminOps(user.role))return {ok:false,message:'Only an owner or admin can approve invoices.'};
  if(!validId(id))return {ok:false,message:'Invalid invoice reference'};
  const db=dbAdmin();
  const {data:invoice,error}=await db
    .from('invoices')
    .select('id,status,customer_id,title,issue_date,due_date')
    .eq('id',id)
    .maybeSingle();
  if(error&&isMissingInvoiceSchemaError(error))return {ok:false,message:missingInvoiceSchemaMessage()};
  if(!invoice||invoice.status!=='draft')return {ok:false,message:'Only draft invoices can be approved.'};
  if(!invoice.customer_id)return {ok:false,message:'Select a customer before approval.'};

  const {data:items,error:itemsError}=await db
    .from('invoice_items')
    .select('description,quantity,unit_price_cents')
    .eq('invoice_id',id);
  if(itemsError||!items?.length||items.some(l=>!l.description?.trim()||Number(l.quantity)<=0||Number(l.unit_price_cents)<0)){
    return {ok:false,message:'Add at least one valid priced item before approval.'};
  }

  const issueDate=invoice.issue_date||perthToday();
  const dueDate=invoice.due_date||addDaysPerthIso(0);
  const {data:updated,error:updateError}=await db.from('invoices').update({
    status:'approved',
    issue_date:issueDate,
    due_date:dueDate,
    approved_by:user.id,
    approved_at:new Date().toISOString(),
    updated_at:new Date().toISOString(),
  }).eq('id',id).eq('status','draft').select('id,job_id').maybeSingle();

  if(updateError||!updated)return {ok:false,message:updateError?.message||'Unable to approve invoice.'};
  await db.from('invoice_activity').insert({
    invoice_id:id,
    event_type:'approved',
    message:'Invoice approved',
    actor_id:user.id,
  });
  revalidatePath('/hq/invoices');
  revalidatePath('/hq/invoices/'+id);
  if(updated.job_id)revalidatePath('/hq/jobs/'+updated.job_id);
  return {ok:true,message:'Invoice approved'};
}

export async function markInvoiceSent(id:string):Promise<{ok:boolean;message:string}>{
  const user=await requireHqUser();
  if(!canManageOfficeOps(user.role))return {ok:false,message:'Not authorised'};
  if(!validId(id))return {ok:false,message:'Invalid invoice reference'};
  const db=dbAdmin();
  const {data:invoice}=await db.from('invoices').select('id,status,job_id').eq('id',id).maybeSingle();
  if(!invoice||!['approved','sent'].includes(invoice.status)){
    return {ok:false,message:'Approve the invoice before marking it sent.'};
  }
  const {error}=await db.from('invoices').update({
    status:'sent',
    sent_at:new Date().toISOString(),
    updated_at:new Date().toISOString(),
  }).eq('id',id);
  if(error)return {ok:false,message:error.message||'Unable to mark invoice sent.'};
  await db.from('invoice_activity').insert({
    invoice_id:id,
    event_type:'sent',
    message:'Invoice marked sent',
    actor_id:user.id,
  });
  revalidatePath('/hq/invoices');
  revalidatePath('/hq/invoices/'+id);
  if(invoice.job_id)revalidatePath('/hq/jobs/'+invoice.job_id);
  return {ok:true,message:'Invoice marked as sent'};
}

export async function voidInvoice(id:string,reason?:string):Promise<{ok:boolean;message:string}>{
  const user=await requireHqUser();
  if(!canManageAdminOps(user.role))return {ok:false,message:'Only an owner or admin can void invoices.'};
  if(!validId(id))return {ok:false,message:'Invalid invoice reference'};
  const db=dbAdmin();
  const {data:invoice}=await db.from('invoices').select('id,status,job_id').eq('id',id).maybeSingle();
  if(!invoice||!canVoidInvoice(invoice.status)){
    return {ok:false,message:'This invoice cannot be voided.'};
  }
  const {error}=await db.from('invoices').update({
    status:'void',
    voided_at:new Date().toISOString(),
    void_reason:(reason||'').trim()||null,
    updated_at:new Date().toISOString(),
  }).eq('id',id);
  if(error)return {ok:false,message:error.message||'Unable to void invoice.'};
  await db.from('invoice_activity').insert({
    invoice_id:id,
    event_type:'voided',
    message:(reason||'').trim()||'Invoice voided',
    actor_id:user.id,
  });
  revalidatePath('/hq/invoices');
  revalidatePath('/hq/invoices/'+id);
  if(invoice.job_id)revalidatePath('/hq/jobs/'+invoice.job_id);
  return {ok:true,message:'Invoice voided'};
}

async function loadInvoiceTotalsForSync(db:ReturnType<typeof dbAdmin>,invoiceId:string){
  const [{data:invoice},{data:items}]=await Promise.all([
    db.from('invoices').select('pricing_mode').eq('id',invoiceId).maybeSingle(),
    db.from('invoice_items').select('description,category,quantity,unit_price_cents,gst_applicable').eq('invoice_id',invoiceId),
  ]);
  return invoiceTotalsCents(items||[],invoice?.pricing_mode).totalIncGstCents;
}

export async function addInvoicePayment(args:{
  invoiceId:string;
  amountCents:number;
  paymentDate:string;
  reference?:string;
  paymentMethod?:string;
  notes?:string;
}):Promise<{ok:boolean;message:string}>{
  const user=await requireHqUser();
  if(!canManageOfficeOps(user.role))return {ok:false,message:'Not authorised'};
  if(!validId(args.invoiceId))return {ok:false,message:'Invalid invoice reference'};
  const amount=Math.round(Number(args.amountCents)||0);
  if(amount<=0)return {ok:false,message:'Enter a payment amount greater than zero.'};
  const method=isInvoicePaymentMethod(args.paymentMethod||'bank_transfer')
    ?(args.paymentMethod as string)
    :'bank_transfer';
  const paymentDate=(args.paymentDate||'').trim()||perthToday();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate))return {ok:false,message:'Enter a valid payment date.'};

  const db=dbAdmin();
  const {data:invoice,error}=await db.from('invoices').select('id,status,job_id').eq('id',args.invoiceId).maybeSingle();
  if(error&&isMissingInvoiceSchemaError(error))return {ok:false,message:missingInvoiceSchemaMessage()};
  if(!invoice||!canRecordInvoicePayment(invoice.status)){
    return {ok:false,message:'Payments can only be recorded on approved or sent invoices.'};
  }

  const {error:insertError}=await db.from('invoice_payments').insert({
    invoice_id:args.invoiceId,
    amount_cents:amount,
    payment_date:paymentDate,
    reference:(args.reference||'').trim()||null,
    payment_method:method,
    notes:(args.notes||'').trim()||null,
    created_by:user.id,
  });
  if(insertError)return {ok:false,message:insertError.message||'Unable to record payment.'};

  const total=await loadInvoiceTotalsForSync(db,args.invoiceId);
  await db.rpc('sync_invoice_payment_status',{
    p_invoice_id:args.invoiceId,
    p_total_inc_gst_cents:total,
  });
  await db.from('invoice_activity').insert({
    invoice_id:args.invoiceId,
    event_type:'payment_recorded',
    message:`Payment of $${(amount/100).toFixed(2)} recorded`,
    actor_id:user.id,
  });

  revalidatePath('/hq/invoices');
  revalidatePath('/hq/invoices/'+args.invoiceId);
  if(invoice.job_id)revalidatePath('/hq/jobs/'+invoice.job_id);
  return {ok:true,message:'Payment recorded'};
}

export async function deleteInvoicePayment(args:{
  invoiceId:string;
  paymentId:string;
}):Promise<{ok:boolean;message:string}>{
  const user=await requireHqUser();
  if(!canManageOfficeOps(user.role))return {ok:false,message:'Not authorised'};
  if(!validId(args.invoiceId)||!validId(args.paymentId))return {ok:false,message:'Invalid payment reference'};
  const db=dbAdmin();
  const {data:invoice}=await db.from('invoices').select('id,status,job_id').eq('id',args.invoiceId).maybeSingle();
  if(!invoice||invoice.status==='void')return {ok:false,message:'Unable to change payments on this invoice.'};

  const {error}=await db.from('invoice_payments').delete().eq('id',args.paymentId).eq('invoice_id',args.invoiceId);
  if(error)return {ok:false,message:error.message||'Unable to remove payment.'};

  const total=await loadInvoiceTotalsForSync(db,args.invoiceId);
  await db.rpc('sync_invoice_payment_status',{
    p_invoice_id:args.invoiceId,
    p_total_inc_gst_cents:total,
  });
  await db.from('invoice_activity').insert({
    invoice_id:args.invoiceId,
    event_type:'payment_removed',
    message:'Payment removed',
    actor_id:user.id,
  });

  revalidatePath('/hq/invoices');
  revalidatePath('/hq/invoices/'+args.invoiceId);
  if(invoice.job_id)revalidatePath('/hq/jobs/'+invoice.job_id);
  return {ok:true,message:'Payment removed'};
}

export async function deleteEmptyInvoice(id:string):Promise<{ok:boolean;message:string}>{
  const user=await requireHqUser();
  if(!canManageAdminOps(user.role))return {ok:false,message:'Only an owner or admin can delete invoices.'};
  if(!validId(id))return {ok:false,message:'Invalid invoice reference'};
  const db=dbAdmin();
  const {data:invoice}=await db.from('invoices').select('id,status,job_id').eq('id',id).maybeSingle();
  if(!invoice)return {ok:false,message:'Invoice not found.'};
  if(invoice.status!=='draft')return {ok:false,message:'Only draft invoices can be deleted.'};

  const {count:paymentCount}=await db
    .from('invoice_payments')
    .select('id',{count:'exact',head:true})
    .eq('invoice_id',id);
  if((paymentCount||0)>0)return {ok:false,message:'Remove payments before deleting this invoice.'};

  const {error}=await db.from('invoices').delete().eq('id',id).eq('status','draft');
  if(error)return {ok:false,message:error.message||'Unable to delete invoice.'};
  revalidatePath('/hq/invoices');
  if(invoice.job_id)revalidatePath('/hq/jobs/'+invoice.job_id);
  return {ok:true,message:'Invoice deleted'};
}
