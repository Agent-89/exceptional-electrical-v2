import {notFound} from 'next/navigation';
import {requireOfficeUser,dbAdmin} from '@/lib/hq-auth';
import {canManageOfficeOps} from '@/lib/hq-roles';
import {isMissingCommercialSchemaError,quoteTypeFromParent} from '@/lib/quote-commercial';
import {isMissingJobQuotesRelation} from '@/lib/job-quotes-store';
import QuoteEditor from '../quote-editor';
import '../../hq.css';

export const dynamic='force-dynamic';

export default async function QuoteDetail({
  params,
  searchParams,
}:{
  params:Promise<{id:string}>;
  searchParams:Promise<{job?:string}>;
}){
  const user=await requireOfficeUser();
  const {id}=await params;
  const sp=await searchParams;
  const db=dbAdmin();

  const {data:q}=await db.from('quotes').select('*').eq('id',id).maybeSingle();
  if(!q)notFound();

  const {error:commercialProbeError}=await db
    .from('quotes')
    .select('is_commercial_current,commercial_family_id')
    .eq('id',id)
    .maybeSingle();
  const commercialAvailable=!isMissingCommercialSchemaError(commercialProbeError);

  const isCommercialCurrent=commercialAvailable
    ?Boolean((q as {is_commercial_current?:boolean}).is_commercial_current)
    :false;
  const parentQuoteId=(q as {parent_quote_id?:string|null}).parent_quote_id||null;
  const revisionNumber=Number((q as {revision_number?:number}).revision_number||0);

  const [{data:items},{data:customers},{data:enquiries},{data:addresses}]=await Promise.all([
    db.from('quote_items').select('*').eq('quote_id',id).order('position'),
    db.from('customers').select('id,name,email,phone').order('name').limit(1000),
    db.from('enquiries').select('id,name,customer_id,message,service_category').order('created_at',{ascending:false}).limit(200),
    db.from('customer_addresses').select('id,customer_id,label,address_line1,suburb,state,postcode').limit(1000),
  ]);

  let parentQuoteNumber:string|null=null;
  if(parentQuoteId){
    const {data:parent}=await db.from('quotes').select('quote_number').eq('id',parentQuoteId).maybeSingle();
    parentQuoteNumber=parent?.quote_number||null;
  }

  let parentOptions:{id:string;quote_number:string;title:string|null;status:string;revision_number?:number|null}[]=[];
  if(q.customer_id){
    const {data:parents}=await db
      .from('quotes')
      .select('id,quote_number,title,status,revision_number')
      .eq('customer_id',q.customer_id)
      .neq('id',id)
      .not('status','eq','cancelled')
      .order('created_at',{ascending:false})
      .limit(100);
    parentOptions=parents||[];
  }

  let jobContext:{jobId:string;jobNumber?:string|null;jobTitle?:string|null}|null=null;
  const preferredJob=sp.job&&/^[0-9a-f-]{36}$/i.test(sp.job)?sp.job:null;
  if(preferredJob){
    const {data:job}=await db.from('jobs').select('id,job_number,title').eq('id',preferredJob).maybeSingle();
    if(job)jobContext={jobId:job.id,jobNumber:job.job_number,jobTitle:job.title};
  }
  if(!jobContext){
    const {data:link,error:linkError}=await db
      .from('job_quotes')
      .select('job_id')
      .eq('quote_id',id)
      .order('linked_at',{ascending:true})
      .limit(1)
      .maybeSingle();
    if(link?.job_id&&!(linkError&&isMissingJobQuotesRelation(linkError))){
      const {data:job}=await db.from('jobs').select('id,job_number,title').eq('id',link.job_id).maybeSingle();
      if(job)jobContext={jobId:job.id,jobNumber:job.job_number,jobTitle:job.title};
    }else{
      const {data:legacy}=await db.from('jobs').select('id,job_number,title').eq('quote_id',id).limit(1).maybeSingle();
      if(legacy)jobContext={jobId:legacy.id,jobNumber:legacy.job_number,jobTitle:legacy.title};
    }
  }

  let linkedJobOptions:{id:string;job_number:string|null;title:string|null}[]=[];
  if(q.customer_id&&!jobContext){
    const {data:jobs}=await db
      .from('jobs')
      .select('id,job_number,title')
      .eq('customer_id',q.customer_id)
      .order('updated_at',{ascending:false})
      .limit(50);
    linkedJobOptions=jobs||[];
  }

  return (
    <QuoteEditor
      canApprove={['owner','admin'].includes(user.role)}
      canMakeCurrent={canManageOfficeOps(user.role)}
      customers={customers||[]}
      enquiries={enquiries||[]}
      addresses={addresses||[]}
      locked={!['draft','changes_requested'].includes(q.status)}
      jobContext={jobContext}
      parentOptions={parentOptions}
      linkedJobOptions={linkedJobOptions}
      commercial={{
        parentQuoteId,
        parentQuoteNumber,
        revisionNumber,
        isCommercialCurrent,
        schemaAvailable:commercialAvailable,
      }}
      initial={{
        id:q.id,
        number:q.quote_number,
        status:q.status,
        customerId:q.customer_id||'',
        enquiryId:q.enquiry_id||'',
        addressId:q.site_address_id||'',
        address:q.site_address_snapshot?.address||'',
        title:q.title,
        scope:q.scope_of_work,
        inclusions:q.inclusions||'',
        exclusions:q.exclusions||'',
        notes:q.customer_notes||'',
        internalNotes:q.internal_notes||'',
        display:q.customer_display,
        mode:q.pricing_mode,
        quoteType:quoteTypeFromParent(parentQuoteId),
        parentQuoteId:parentQuoteId||'',
        linkedJobId:jobContext?.jobId||'',
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
