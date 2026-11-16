import {notFound} from 'next/navigation';
import {requireOfficeUser,dbAdmin} from '@/lib/hq-auth';
import {canManageOfficeOps} from '@/lib/hq-roles';
import {isMissingCommercialSchemaError,quoteTypeFromParent} from '@/lib/quote-commercial';
import {isMissingJobQuotesRelation} from '@/lib/job-quotes-store';
import {loadCustomerJobs,loadLinkedJobsForQuote,loadParentQuoteOptions,type ParentOptionsDb} from '@/lib/quote-parent-options';
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
  const ancestorIds:string[]=[];
  if(parentQuoteId){
    const {data:parent}=await db.from('quotes').select('quote_number,parent_quote_id').eq('id',parentQuoteId).maybeSingle();
    parentQuoteNumber=parent?.quote_number||null;
    ancestorIds.push(parentQuoteId);
    if(parent?.parent_quote_id)ancestorIds.push(String(parent.parent_quote_id));
  }

  const parentDb=db as unknown as ParentOptionsDb;
  const parentOptions=q.customer_id
    ?await loadParentQuoteOptions({
      db:parentDb,
      customerId:q.customer_id,
      editingQuoteId:id,
      editingAncestorIds:ancestorIds,
    })
    :[];

  const linkedJobs=await loadLinkedJobsForQuote({db:parentDb,quoteId:id});

  let jobContext:{jobId:string;jobNumber?:string|null;jobTitle?:string|null}|null=null;
  const preferredJob=sp.job&&/^[0-9a-f-]{36}$/i.test(sp.job)?sp.job:null;
  if(preferredJob){
    const match=linkedJobs.find(j=>j.id===preferredJob);
    if(match)jobContext={jobId:match.id,jobNumber:match.jobNumber,jobTitle:match.title};
    else{
      const {data:job}=await db.from('jobs').select('id,job_number,title').eq('id',preferredJob).maybeSingle();
      if(job)jobContext={jobId:job.id,jobNumber:job.job_number,jobTitle:job.title};
    }
  }
  if(!jobContext&&linkedJobs[0]){
    jobContext={jobId:linkedJobs[0].id,jobNumber:linkedJobs[0].jobNumber,jobTitle:linkedJobs[0].title};
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
    }
  }

  const linkedJobOptions=q.customer_id
    ?await loadCustomerJobs({
      db:parentDb,
      customerId:q.customer_id,
      excludeJobIds:linkedJobs.map(j=>j.id),
    })
    :[];

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
      linkedJobOptions={linkedJobOptions.map(j=>({id:j.id,job_number:j.jobNumber,jobNumber:j.jobNumber,title:j.title}))}
      linkedJobs={linkedJobs}
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
        linkedJobId:jobContext?.jobId||linkedJobs[0]?.id||'',
        linkedJobIds:linkedJobs.map(j=>j.id),
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
