import {requireOfficeUser,dbAdmin} from '@/lib/hq-auth';
import {defaultInvoiceTermsAndPayment} from '@/lib/business-profile';
import {isMissingJobQuotesRelation} from '@/lib/job-quotes-store';
import InvoiceEditor from '../invoice-editor';
import '../../hq.css';

export const dynamic='force-dynamic';

const uuid=/^[0-9a-f-]{36}$/i;
const FIXED='Fixed-price electrical work';

function perthToday(){
  return new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Perth'});
}

export default async function NewInvoice({
  searchParams,
}:{
  searchParams:Promise<{job?:string;quote?:string}>;
}){
  const user=await requireOfficeUser();
  const db=dbAdmin();
  const params=await searchParams;
  const jobId=params.job&&uuid.test(params.job)?params.job:null;
  const quoteIdParam=params.quote&&uuid.test(params.quote)?params.quote:null;

  const [{data:customers},{data:addresses}]=await Promise.all([
    db.from('customers').select('id,name,email,phone').order('name').limit(1000),
    db.from('customer_addresses').select('id,customer_id,label,address_line1,suburb,state,postcode').limit(1000),
  ]);

  const {data:lastInvoice}=await db
    .from('invoices')
    .select('invoice_number')
    .like('invoice_number','EEI-%')
    .order('invoice_number',{ascending:false})
    .limit(1)
    .maybeSingle();
  const lastNumber=Number(lastInvoice?.invoice_number?.match(/^EEI-(\d+)$/)?.[1]||0);
  const nextInvoiceNumber=`EEI-${String(lastNumber+1).padStart(6,'0')}`;

  let customerId='';
  let addressSeed='';
  let addressId='';
  let titleSeed='';
  let descriptionSeed='';
  let customerReference='';
  let linkedJobId='';
  let linkedQuoteId='';
  let linkedQuoteNumber:string|null=null;
  let lines:{description:string;category:string;quantity:number;unit:string;price:number;cost:number|null;gst:boolean}[]=[];
  let mode='detailed';
  let display='itemised';
  let jobs:{id:string;jobNumber:string|null;title:string|null;status?:string}[]=[];

  if(jobId){
    const {data:job}=await db
      .from('jobs')
      .select('id,job_number,title,description,customer_id,site_address_text')
      .eq('id',jobId)
      .maybeSingle();
    if(job){
      linkedJobId=job.id;
      customerId=job.customer_id||'';
      addressSeed=String(job.site_address_text||'').trim();
      titleSeed=String(job.title||'').trim();
      descriptionSeed=String(job.description||'').trim();
      jobs=[{id:job.id,jobNumber:job.job_number,title:job.title}];

      let seedQuoteId=quoteIdParam;
      if(!seedQuoteId){
        const {data:links,error:linkError}=await db
          .from('job_quotes')
          .select('quote_id,is_primary')
          .eq('job_id',jobId);
        if(!linkError||!isMissingJobQuotesRelation(linkError)){
          const quoteIds=(links||[]).map(l=>String(l.quote_id));
          if(quoteIds.length){
            const {data:linkedQuotes}=await db
              .from('quotes')
              .select('id,quote_number,is_commercial_current,customer_reference,pricing_mode,customer_display,scope_of_work,title,site_address_id,site_address_snapshot')
              .in('id',quoteIds)
              .order('created_at',{ascending:false});
            const current=(linkedQuotes||[]).find(q=>q.is_commercial_current);
            const primary=links?.find(l=>l.is_primary);
            const primaryQuote=(linkedQuotes||[]).find(q=>q.id===primary?.quote_id);
            const chosen=current||primaryQuote||(linkedQuotes||[])[0];
            if(chosen)seedQuoteId=String(chosen.id);
          }
        }
      }

      if(seedQuoteId){
        const {data:quote}=await db
          .from('quotes')
          .select('id,quote_number,customer_id,customer_reference,pricing_mode,customer_display,scope_of_work,title,site_address_id,site_address_snapshot')
          .eq('id',seedQuoteId)
          .maybeSingle();
        if(quote&&(!quote.customer_id||quote.customer_id===customerId)){
          linkedQuoteId=quote.id;
          linkedQuoteNumber=quote.quote_number;
          customerReference=String(quote.customer_reference||'').trim();
          mode=quote.pricing_mode||'detailed';
          display=quote.customer_display||'itemised';
          titleSeed=titleSeed||String(quote.title||'').trim();
          descriptionSeed=descriptionSeed||String(quote.scope_of_work||'').trim();
          addressId=quote.site_address_id||'';
          addressSeed=addressSeed||String((quote.site_address_snapshot as {address?:string}|null)?.address||'').trim();
          const {data:items}=await db
            .from('quote_items')
            .select('description,category,quantity,unit,unit_price_cents,internal_unit_cost_cents,gst_applicable')
            .eq('quote_id',quote.id)
            .order('position');
          lines=(items||[])
            .filter(i=>mode==='fixed'?(i.category==='other'&&i.description===FIXED):!(i.category==='other'&&i.description===FIXED))
            .map(i=>({
              description:i.description,
              category:i.category,
              quantity:Number(i.quantity),
              unit:i.unit,
              price:Number(i.unit_price_cents),
              cost:i.internal_unit_cost_cents===null?null:Number(i.internal_unit_cost_cents),
              gst:i.gst_applicable,
            }));
        }
      }
    }
  }else if(quoteIdParam){
    const {data:quote}=await db
      .from('quotes')
      .select('id,quote_number,customer_id,customer_reference,pricing_mode,customer_display,scope_of_work,title,site_address_id,site_address_snapshot')
      .eq('id',quoteIdParam)
      .maybeSingle();
    if(quote){
      linkedQuoteId=quote.id;
      linkedQuoteNumber=quote.quote_number;
      customerId=quote.customer_id||'';
      customerReference=String(quote.customer_reference||'').trim();
      mode=quote.pricing_mode||'detailed';
      display=quote.customer_display||'itemised';
      titleSeed=String(quote.title||'').trim();
      descriptionSeed=String(quote.scope_of_work||'').trim();
      addressId=quote.site_address_id||'';
      addressSeed=String((quote.site_address_snapshot as {address?:string}|null)?.address||'').trim();
      const {data:items}=await db
        .from('quote_items')
        .select('description,category,quantity,unit,unit_price_cents,internal_unit_cost_cents,gst_applicable')
        .eq('quote_id',quote.id)
        .order('position');
      lines=(items||[]).map(i=>({
        description:i.description,
        category:i.category,
        quantity:Number(i.quantity),
        unit:i.unit,
        price:Number(i.unit_price_cents),
        cost:i.internal_unit_cost_cents===null?null:Number(i.internal_unit_cost_cents),
        gst:i.gst_applicable,
      }));
    }
  }

  if(customerId&&!jobs.length){
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

  const customerNameSeed=String((customers||[]).find(c=>c.id===customerId)?.name||'').trim();
  const today=perthToday();

  return (
    <InvoiceEditor
      canApprove={['owner','admin'].includes(user.role)}
      nextInvoiceNumber={nextInvoiceNumber}
      customers={customers||[]}
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
      linkedQuoteNumber={linkedQuoteNumber}
      initial={{
        customerId,
        jobId:linkedJobId,
        quoteId:linkedQuoteId,
        addressId,
        address:addressSeed,
        title:titleSeed||customerNameSeed,
        description:descriptionSeed,
        notes:'',
        internalNotes:'',
        termsAndPayment:defaultInvoiceTermsAndPayment(),
        display,
        mode,
        customerReference,
        issueDate:today,
        dueDate:today,
        lines,
      }}
    />
  );
}
