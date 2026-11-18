import {notFound} from 'next/navigation';
import {requireOfficeUser,dbAdmin} from '@/lib/hq-auth';
import {canManageAdminOps} from '@/lib/hq-roles';
import {isMissingInvoiceSchemaError} from '@/lib/invoice-commercial';
import InvoiceEditor from '../invoice-editor';
import '../../hq.css';

export const dynamic='force-dynamic';

export default async function InvoiceDetail({params}:{params:Promise<{id:string}>}){
  const user=await requireOfficeUser();
  const {id}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
  const db=dbAdmin();

  const {data:invoice,error}=await db.from('invoices').select('*').eq('id',id).maybeSingle();
  if(error&&isMissingInvoiceSchemaError(error))notFound();
  if(!invoice)notFound();

  const customerId=(invoice.customer_id as string|null)||null;

  const [
    {data:items},
    {data:payments},
    {data:seedCustomers},
    {data:selectedCustomer},
    {data:addresses},
    {data:quote},
  ]=await Promise.all([
    db.from('invoice_items').select('*').eq('invoice_id',id).order('position'),
    db.from('invoice_payments').select('id,amount_cents,payment_date,reference,payment_method,notes').eq('invoice_id',id).order('payment_date',{ascending:false}),
    db.from('customers').select('id,name,email,phone').order('name').limit(80),
    customerId
      ? db.from('customers').select('id,name,email,phone').eq('id',customerId).maybeSingle()
      : Promise.resolve({data:null}),
    customerId
      ? db.from('customer_addresses').select('id,customer_id,label,address_line1,suburb,state,postcode').eq('customer_id',customerId).limit(100)
      : Promise.resolve({data:[] as {id:string;customer_id:string;label:string|null;address_line1:string;suburb:string|null;state:string|null;postcode:string|null}[]}),
    invoice.quote_id
      ? db.from('quotes').select('quote_number').eq('id',invoice.quote_id).maybeSingle()
      : Promise.resolve({data:null}),
  ]);

  let jobs:{id:string;jobNumber:string|null;title:string|null;status?:string}[]=[];
  if(customerId){
    const {data:customerJobs}=await db
      .from('jobs')
      .select('id,job_number,title,status')
      .eq('customer_id',customerId)
      .order('updated_at',{ascending:false})
      .limit(80);
    jobs=(customerJobs||[]).map(j=>({
      id:String(j.id),
      jobNumber:j.job_number as string|null,
      title:j.title as string|null,
      status:String(j.status||''),
    }));
  }
  if(invoice.job_id&&!jobs.some(j=>j.id===invoice.job_id)){
    const snap=invoice.job_snapshot as {job_number?:string|null;title?:string|null}|null;
    jobs=[{
      id:String(invoice.job_id),
      jobNumber:snap?.job_number||null,
      title:snap?.title||null,
    },...jobs];
  }

  const customersById=new Map((seedCustomers||[]).map(c=>[c.id,c]));
  if(selectedCustomer)customersById.set(selectedCustomer.id,selectedCustomer);
  const customers=[...customersById.values()];

  return (
    <InvoiceEditor
      canApprove={['owner','admin'].includes(user.role)}
      canDelete={canManageAdminOps(user.role)}
      locked={invoice.status!=='draft'}
      customers={customers}
      addresses={(addresses||[]).map(a=>({
        id:a.id,
        customer_id:a.customer_id,
        label:a.label||'',
        address_line1:a.address_line1,
        suburb:a.suburb||'',
        state:a.state||'',
        postcode:a.postcode||'',
      }))}
      jobs={jobs}
      payments={(payments||[]).map(p=>({
        id:p.id,
        amount_cents:Number(p.amount_cents),
        payment_date:p.payment_date,
        reference:p.reference,
        payment_method:p.payment_method,
        notes:p.notes,
      }))}
      linkedQuoteNumber={quote?.quote_number||null}
      initial={{
        id:invoice.id,
        number:invoice.invoice_number,
        status:invoice.status,
        customerId:invoice.customer_id||'',
        jobId:invoice.job_id||'',
        quoteId:invoice.quote_id||'',
        addressId:invoice.site_address_id||'',
        address:(invoice.site_address_snapshot as {address?:string}|null)?.address||'',
        title:invoice.title||'',
        description:invoice.description||'',
        notes:invoice.customer_notes||'',
        internalNotes:invoice.internal_notes||'',
        termsAndPayment:invoice.terms_and_payment||'',
        display:invoice.customer_display,
        mode:invoice.pricing_mode,
        customerReference:invoice.customer_reference||'',
        issueDate:invoice.issue_date||'',
        dueDate:invoice.due_date||'',
        lines:(items||[]).map(i=>({
          description:i.description,
          category:i.category,
          quantity:Number(i.quantity),
          unit:i.unit,
          price:Number(i.unit_price_cents),
          cost:i.internal_unit_cost_cents===null?null:Number(i.internal_unit_cost_cents),
          gst:i.gst_applicable,
        })),
      }}
    />
  );
}
