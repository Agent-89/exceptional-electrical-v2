import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {
  formatAudFromCents,
  invoiceAmountDueCents,
  invoiceStatusLabel,
  invoiceTotalsCents,
  isMissingInvoiceSchemaError,
} from '@/lib/invoice-commercial';

export type JobInvoiceDisplay={
  id:string;
  invoiceNumber:string;
  title:string;
  status:string;
  statusLabel:string;
  updatedAt:string;
  dueDate:string|null;
  totalCentsIncGst:number;
  amountDueCents:number;
  totalLabel:string;
  amountDueLabel:string;
};

export async function loadJobInvoices(args:{
  db:SupabaseClient;
  jobId:string;
}):Promise<{
  invoices:JobInvoiceDisplay[];
  tableAvailable:boolean;
  error:string|null;
}>{
  const {data,error}=await args.db
    .from('invoices')
    .select('id,invoice_number,title,status,pricing_mode,updated_at,due_date')
    .eq('job_id',args.jobId)
    .order('updated_at',{ascending:false});

  if(error){
    if(isMissingInvoiceSchemaError(error)){
      return {invoices:[],tableAvailable:false,error:null};
    }
    return {invoices:[],tableAvailable:true,error:error.message||'Unable to load invoices.'};
  }

  const rows=data||[];
  if(!rows.length)return {invoices:[],tableAvailable:true,error:null};

  const ids=rows.map(row=>String(row.id));
  const [{data:items},{data:payments}]=await Promise.all([
    args.db
      .from('invoice_items')
      .select('invoice_id,description,category,quantity,unit_price_cents,gst_applicable')
      .in('invoice_id',ids),
    args.db
      .from('invoice_payments')
      .select('invoice_id,amount_cents')
      .in('invoice_id',ids),
  ]);

  const itemsByInvoice=new Map<string,{
    description:string;
    category:string;
    quantity:number;
    unit_price_cents:number;
    gst_applicable:boolean;
  }[]>();
  const paymentsByInvoice=new Map<string,{amount_cents:number}[]>();

  for(const item of items||[]){
    const invoiceId=String(item.invoice_id);
    const list=itemsByInvoice.get(invoiceId)||[];
    list.push({
      description:String(item.description||''),
      category:String(item.category||'other'),
      quantity:Number(item.quantity)||0,
      unit_price_cents:Number(item.unit_price_cents)||0,
      gst_applicable:Boolean(item.gst_applicable),
    });
    itemsByInvoice.set(invoiceId,list);
  }
  for(const payment of payments||[]){
    const invoiceId=String(payment.invoice_id);
    const list=paymentsByInvoice.get(invoiceId)||[];
    list.push({amount_cents:Number(payment.amount_cents)||0});
    paymentsByInvoice.set(invoiceId,list);
  }

  const invoices:JobInvoiceDisplay[]=rows.map(row=>{
    const id=String(row.id);
    const pricingMode=String(row.pricing_mode||'detailed');
    const status=String(row.status||'draft');
    const lineItems=itemsByInvoice.get(id)||[];
    const paymentRows=paymentsByInvoice.get(id)||[];
    const total=invoiceTotalsCents(lineItems,pricingMode).totalIncGstCents;
    const due=invoiceAmountDueCents({
      items:lineItems,
      payments:paymentRows,
      pricingMode,
      status,
    });
    return {
      id,
      invoiceNumber:String(row.invoice_number||''),
      title:String(row.title||'Untitled invoice'),
      status,
      statusLabel:invoiceStatusLabel(status),
      updatedAt:String(row.updated_at||''),
      dueDate:(row.due_date as string|null)||null,
      totalCentsIncGst:total,
      amountDueCents:due,
      totalLabel:formatAudFromCents(total),
      amountDueLabel:formatAudFromCents(due),
    };
  });

  return {invoices,tableAvailable:true,error:null};
}
