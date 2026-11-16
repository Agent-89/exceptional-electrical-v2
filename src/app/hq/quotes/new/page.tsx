import {requireOfficeUser,dbAdmin} from '@/lib/hq-auth';
import {canManageOfficeOps} from '@/lib/hq-roles';
import {isMissingCommercialSchemaError} from '@/lib/quote-commercial';
import {isMissingJobQuotesRelation} from '@/lib/job-quotes-store';
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

  let parentQuote:{id:string;quote_number:string;title:string|null;customer_id:string|null;revision_number:number|null}|null=null;
  if(parentId){
    const {data:parent}=await db
      .from('quotes')
      .select('id,quote_number,title,customer_id,revision_number')
      .eq('id',parentId)
      .maybeSingle();
    parentQuote=parent;
  }

  const customerId=jobCustomerId||parentQuote?.customer_id||e?.customer_id||'';

  let parentOptions:{id:string;quote_number:string;title:string|null;status:string;revision_number?:number|null}[]=[];
  if(customerId){
    const {data:parents}=await db
      .from('quotes')
      .select('id,quote_number,title,status,revision_number')
      .eq('customer_id',customerId)
      .not('status','eq','cancelled')
      .order('created_at',{ascending:false})
      .limit(100);
    parentOptions=parents||[];
  }

  let linkedJobOptions:{id:string;job_number:string|null;title:string|null}[]=[];
  if(customerId&&!jobContext){
    const {data:jobs}=await db
      .from('jobs')
      .select('id,job_number,title')
      .eq('customer_id',customerId)
      .order('updated_at',{ascending:false})
      .limit(50);
    linkedJobOptions=jobs||[];
  }

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

  const titleSeed=asVariation
    ?`Variation — ${(jobTitleSeed||parentQuote?.title||e?.service_category?.replaceAll('_',' ')||'Electrical work')}`.slice(0,200)
    :(jobTitleSeed||e?.service_category?.replaceAll('_',' ')||'Electrical work');

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
      linkedJobOptions={linkedJobOptions}
      commercial={{
        parentQuoteId:defaultParentId||null,
        parentQuoteNumber:parentQuote?.quote_number||null,
        revisionNumber:parentQuote?Number(parentQuote.revision_number||0)+1:null,
        schemaAvailable:true,
      }}
      initial={{
        customerId,
        enquiryId:jobEnquiryId||e?.id||'',
        address:jobAddressSeed,
        title:titleSeed,
        scope:jobScopeSeed||e?.message||'',
        quoteType:asVariation?'variation':'standard',
        parentQuoteId:defaultParentId,
        linkedJobId:jobId||'',
      }}
    />
  );
}
