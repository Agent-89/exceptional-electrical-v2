import {requireOfficeUser,dbAdmin} from '@/lib/hq-auth';
import {canManageOfficeOps} from '@/lib/hq-roles';
import {isMissingCommercialSchemaError} from '@/lib/quote-commercial';
import {isMissingJobQuotesRelation} from '@/lib/job-quotes-store';
import {loadCustomerJobs,loadParentQuoteOptions,type ParentOptionsDb} from '@/lib/quote-parent-options';
import QuoteEditor from '../quote-editor';
import '../../hq.css';

export const dynamic='force-dynamic';

const uuid=/^[0-9a-f-]{36}$/i;

export default async function NewQuote({
  searchParams,
}:{
  searchParams:Promise<{enquiry?:string;job?:string;type?:string;parent?:string;returnTo?:string}>;
}){
  const user=await requireOfficeUser();
  const db=dbAdmin();
  const params=await searchParams;
  const jobId=params.job&&uuid.test(params.job)?params.job:null;
  const parentId=params.parent&&uuid.test(params.parent)?params.parent:null;
  const asVariation=params.type==='variation'||Boolean(parentId);

  const [{data:customers},{data:enquiries},{data:addresses}]=await Promise.all([
    db.from('customers').select('id,name,email,phone').order('name').limit(1000),
    db.from('enquiries').select('id,name,customer_id,message,service_category').order('created_at',{ascending:false}).limit(200),
    db.from('customer_addresses').select('id,customer_id,label,address_line1,suburb,state,postcode').limit(1000),
  ]);

  const {data:lastQuote}=await db.from('quotes').select('quote_number').like('quote_number','EEQ-%').order('quote_number',{ascending:false}).limit(1).maybeSingle();
  const lastNumber=Number(lastQuote?.quote_number?.match(/^EEQ-(\d+)$/)?.[1]||0);
  const nextQuoteNumber=`EEQ-${String(lastNumber+1).padStart(6,'0')}`;

  const e=(enquiries||[]).find(x=>x.id===params.enquiry);

  let jobContext: {jobId:string;jobNumber?:string|null;jobTitle?:string|null}|null=null;
  let jobCustomerId:string|null=null;
  let jobTitleSeed='';
  let jobScopeSeed='';
  let jobAddressSeed='';
  let jobEnquiryId='';

  if(jobId){
    const {data:job}=await db
      .from('jobs')
      .select('id,job_number,title,description,customer_id,enquiry_id,site_address_text')
      .eq('id',jobId)
      .maybeSingle();
    if(job){
      jobContext={jobId:job.id,jobNumber:job.job_number,jobTitle:job.title};
      jobCustomerId=job.customer_id;
      jobTitleSeed=String(job.title||'').trim();
      jobScopeSeed=String(job.description||'').trim();
      jobAddressSeed=String(job.site_address_text||'').trim();
      jobEnquiryId=job.enquiry_id||'';
    }
  }

  let parentQuote:{
    id:string;
    quote_number:string;
    title:string|null;
    customer_id:string|null;
    revision_number:number|null;
    scope_of_work?:string|null;
    inclusions?:string|null;
    exclusions?:string|null;
    customer_notes?:string|null;
    internal_notes?:string|null;
    customer_display?:string|null;
    pricing_mode?:string|null;
    site_address_id?:string|null;
    site_address_snapshot?:{address?:string}|null;
  }|null=null;
  let parentLines:{description:string;category:string;quantity:number;unit:string;price:number;cost:number|null;gst:boolean}[]=[];

  if(parentId){
    const {data:parent}=await db
      .from('quotes')
      .select('id,quote_number,title,customer_id,revision_number,scope_of_work,inclusions,exclusions,customer_notes,internal_notes,customer_display,pricing_mode,site_address_id,site_address_snapshot')
      .eq('id',parentId)
      .maybeSingle();
    parentQuote=parent;
    if(parent){
      const {data:items}=await db
        .from('quote_items')
        .select('description,category,quantity,unit,unit_price_cents,internal_unit_cost_cents,gst_applicable')
        .eq('quote_id',parent.id)
        .order('position');
      parentLines=(items||[]).map(i=>({
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

  const customerId=jobCustomerId||parentQuote?.customer_id||e?.customer_id||'';

  // Prefer commercial current / primary as default parent for job variations.
  let defaultParentId=parentQuote?.id||'';
  if(asVariation&&!defaultParentId&&jobId){
    const {data:links,error:linkError}=await db
      .from('job_quotes')
      .select('quote_id,is_primary')
      .eq('job_id',jobId);
    if(!linkError||!isMissingJobQuotesRelation(linkError)){
      const quoteIds=(links||[]).map(l=>String(l.quote_id));
      if(quoteIds.length){
        const {data:linkedQuotes,error:cqError}=await db
          .from('quotes')
          .select('id,is_commercial_current,status,created_at')
          .in('id',quoteIds)
          .order('created_at',{ascending:false});
        if(cqError&&isMissingCommercialSchemaError(cqError)){
          const primary=links?.find(l=>l.is_primary);
          defaultParentId=primary?String(primary.quote_id):quoteIds[0];
        }else{
          const current=(linkedQuotes||[]).find(q=>q.is_commercial_current&&q.status!=='superseded');
          const primary=links?.find(l=>l.is_primary);
          defaultParentId=current?.id||(primary?String(primary.quote_id):quoteIds[0]);
        }
      }
    }
  }

  // Load prefill parent if default differs from URL parent
  if(asVariation&&defaultParentId&&defaultParentId!==parentQuote?.id){
    const {data:parent}=await db
      .from('quotes')
      .select('id,quote_number,title,customer_id,revision_number,scope_of_work,inclusions,exclusions,customer_notes,internal_notes,customer_display,pricing_mode,site_address_id,site_address_snapshot')
      .eq('id',defaultParentId)
      .maybeSingle();
    if(parent){
      parentQuote=parent;
      const {data:items}=await db
        .from('quote_items')
        .select('description,category,quantity,unit,unit_price_cents,internal_unit_cost_cents,gst_applicable')
        .eq('quote_id',parent.id)
        .order('position');
      parentLines=(items||[]).map(i=>({
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

  const parentDb=db as unknown as ParentOptionsDb;
  const parentOptions=customerId
    ?await loadParentQuoteOptions({db:parentDb,customerId})
    :[];

  const linkedJobOptions=customerId
    ?await loadCustomerJobs({db:parentDb,customerId})
    :[];

  const linkedJobs=jobContext
    ?[{id:jobContext.jobId,jobNumber:jobContext.jobNumber||null,title:jobContext.jobTitle||null}]
    :[];

  const titleSeed=asVariation&&parentQuote
    ?(`Variation — ${parentQuote.title||jobTitleSeed||'Electrical work'}`).slice(0,200)
    :asVariation
      ?`Variation — ${(jobTitleSeed||e?.service_category?.replaceAll('_',' ')||'Electrical work')}`.slice(0,200)
      :(jobTitleSeed||e?.service_category?.replaceAll('_',' ')||'Electrical work');

  const useParentPrefill=asVariation&&Boolean(parentQuote)&&parentLines.length>=0&&Boolean(defaultParentId);

  return (
    <QuoteEditor
      canApprove={['owner','admin'].includes(user.role)}
      canMakeCurrent={canManageOfficeOps(user.role)}
      nextQuoteNumber={nextQuoteNumber}
      customers={customers||[]}
      enquiries={enquiries||[]}
      addresses={addresses||[]}
      jobContext={jobContext}
      parentOptions={parentOptions}
      linkedJobOptions={linkedJobOptions.map(j=>({id:j.id,job_number:j.jobNumber,jobNumber:j.jobNumber,title:j.title}))}
      linkedJobs={linkedJobs}
      commercial={{
        parentQuoteId:defaultParentId||null,
        parentQuoteNumber:parentQuote?.quote_number||null,
        revisionNumber:parentQuote?Number(parentQuote.revision_number||0)+1:null,
        schemaAvailable:true,
      }}
      initial={{
        customerId,
        enquiryId:jobEnquiryId||e?.id||'',
        addressId:useParentPrefill?String(parentQuote?.site_address_id||''):'',
        address:useParentPrefill
          ?String(parentQuote?.site_address_snapshot?.address||jobAddressSeed||'')
          :jobAddressSeed,
        title:useParentPrefill?titleSeed:titleSeed,
        scope:useParentPrefill?String(parentQuote?.scope_of_work||jobScopeSeed||e?.message||''):jobScopeSeed||e?.message||'',
        inclusions:useParentPrefill?String(parentQuote?.inclusions||''):'',
        exclusions:useParentPrefill?String(parentQuote?.exclusions||''):'',
        notes:useParentPrefill?String(parentQuote?.customer_notes||''):'',
        internalNotes:useParentPrefill?String(parentQuote?.internal_notes||''):'',
        display:useParentPrefill?(parentQuote?.customer_display||'itemised'):'itemised',
        mode:useParentPrefill?(parentQuote?.pricing_mode||'detailed'):'detailed',
        lines:useParentPrefill?parentLines:[],
        quoteType:asVariation?'variation':'standard',
        parentQuoteId:defaultParentId,
        linkedJobId:jobId||'',
        linkedJobIds:jobId?[jobId]:[],
      }}
    />
  );
}
