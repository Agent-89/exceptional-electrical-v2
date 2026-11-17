import {notFound} from 'next/navigation';
import {requireOfficeUser,dbAdmin} from '@/lib/hq-auth';
import {canManageAdminOps,canManageOfficeOps} from '@/lib/hq-roles';
import {assessQuoteEmptyDelete} from '@/lib/hq-empty-delete-assess';
import {quoteTypeFromParent} from '@/lib/quote-commercial';
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

  // Commercial columns arrive via select('*') when present — no second probe query.
  const schemaAvailable=
    Object.prototype.hasOwnProperty.call(q,'is_commercial_current')
    || Object.prototype.hasOwnProperty.call(q,'commercial_family_id');
  const isCommercialCurrent=schemaAvailable
    ?Boolean((q as {is_commercial_current?:boolean}).is_commercial_current)
    :false;
  const parentQuoteId=(q as {parent_quote_id?:string|null}).parent_quote_id||null;
  const revisionNumber=Number((q as {revision_number?:number}).revision_number||0);
  const preferredJob=sp.job&&/^[0-9a-f-]{36}$/i.test(sp.job)?sp.job:null;
  const parentDb=db as unknown as ParentOptionsDb;
  const customerId=(q.customer_id as string|null)||null;

  const [
    {data:items},
    {data:seedCustomers},
    {data:selectedCustomer},
    {data:enquiries},
    {data:addresses},
    {data:parent},
    linkedJobs,
  ]=await Promise.all([
    db.from('quote_items').select('*').eq('quote_id',id).order('position'),
    db.from('customers').select('id,name,email,phone').order('name').limit(80),
    customerId
      ? db.from('customers').select('id,name,email,phone').eq('id',customerId).maybeSingle()
      : Promise.resolve({data:null}),
    customerId
      ? db.from('enquiries').select('id,name,customer_id,message,service_category,suburb,reference_number').or(`customer_id.eq.${customerId},customer_id.is.null`).order('created_at',{ascending:false}).limit(80)
      : db.from('enquiries').select('id,name,customer_id,message,service_category,suburb,reference_number').order('created_at',{ascending:false}).limit(80),
    customerId
      ? db.from('customer_addresses').select('id,customer_id,label,address_line1,suburb,state,postcode').eq('customer_id',customerId).limit(100)
      : Promise.resolve({data:[] as {id:string;customer_id:string;label:string|null;address_line1:string;suburb:string|null;state:string|null;postcode:string|null}[]}),
    parentQuoteId
      ? db.from('quotes').select('quote_number,parent_quote_id').eq('id',parentQuoteId).maybeSingle()
      : Promise.resolve({data:null}),
    loadLinkedJobsForQuote({db:parentDb,quoteId:id}),
  ]);

  const parentQuoteNumber=parent?.quote_number||null;
  const ancestorIds:string[]=[];
  if(parentQuoteId){
    ancestorIds.push(parentQuoteId);
    if(parent?.parent_quote_id)ancestorIds.push(String(parent.parent_quote_id));
  }

  const [parentOptions,linkedJobOptions,preferredJobRow]=await Promise.all([
    customerId
      ? loadParentQuoteOptions({
          db:parentDb,
          customerId,
          editingQuoteId:id,
          editingAncestorIds:ancestorIds,
        })
      : Promise.resolve([]),
    customerId
      ? loadCustomerJobs({
          db:parentDb,
          customerId,
          excludeJobIds:linkedJobs.map(j=>j.id),
        })
      : Promise.resolve([]),
    preferredJob && !linkedJobs.some(j=>j.id===preferredJob)
      ? db.from('jobs').select('id,job_number,title').eq('id',preferredJob).maybeSingle()
      : Promise.resolve({data:null}),
  ]);

  let jobContext:{jobId:string;jobNumber?:string|null;jobTitle?:string|null}|null=null;
  if(preferredJob){
    const match=linkedJobs.find(j=>j.id===preferredJob);
    if(match)jobContext={jobId:match.id,jobNumber:match.jobNumber,jobTitle:match.title};
    else if(preferredJobRow.data){
      jobContext={
        jobId:String(preferredJobRow.data.id),
        jobNumber:preferredJobRow.data.job_number as string|null,
        jobTitle:preferredJobRow.data.title as string|null,
      };
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

  const customersById=new Map((seedCustomers||[]).map(c=>[c.id,c]));
  if(selectedCustomer)customersById.set(selectedCustomer.id,selectedCustomer);
  const customers=[...customersById.values()];

  const emptyDelete=await assessQuoteEmptyDelete(db,id);

  return (
    <QuoteEditor
      canApprove={['owner','admin'].includes(user.role)}
      canMakeCurrent={canManageOfficeOps(user.role)}
      canDelete={canManageAdminOps(user.role)}
      deleteEligible={emptyDelete.eligible}
      deleteBlockers={emptyDelete.blockers}
      customers={customers}
      enquiries={enquiries||[]}
      addresses={(addresses||[]).map(a=>({
        id:a.id,
        customer_id:a.customer_id,
        label:a.label||'',
        address_line1:a.address_line1,
        suburb:a.suburb||'',
        state:a.state||'',
        postcode:a.postcode||'',
      }))}
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
        schemaAvailable,
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
        customerReference:(q as {customer_reference?:string|null}).customer_reference||'',
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
