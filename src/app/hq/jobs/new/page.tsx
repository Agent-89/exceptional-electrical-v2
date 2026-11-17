import Link from 'next/link';
import {dbAdmin,requireOfficeUser} from '@/lib/hq-auth';
import JobCreateForm from '../job-create-form';
import '../../hq.css';
export const dynamic='force-dynamic';

const uuid=/^[0-9a-f-]{36}$/i;

function enquiryRef(referenceNumber:number|null|undefined){
 if(referenceNumber==null||!Number.isFinite(referenceNumber))return 'Enquiry';
 return 'ENQ-'+String(referenceNumber).padStart(4,'0');
}

export default async function NewJobPage({searchParams}:{searchParams:Promise<{customer?:string;enquiry?:string;quote?:string}>}){
 await requireOfficeUser();
 const canEdit=true;
 const params=await searchParams;
 const db=dbAdmin();
 const quoteId=params.quote&&uuid.test(params.quote)?params.quote:'';
 const enquiryId=params.enquiry&&uuid.test(params.enquiry)?params.enquiry:'';
 const customerParam=params.customer&&uuid.test(params.customer)?params.customer:'';

 let prefill={
  customerId:customerParam,
  enquiryId,
  quoteId,
  description:'',
  siteAddress:'',
 };
 let provenance:{
  quoteId:string;
  quoteNumber:string;
  enquiryId:string;
  enquiryRef:string;
 }|null=null;

 if(canEdit&&quoteId){
  const {data:quote}=await db.from('quotes').select('id,quote_number,customer_id,enquiry_id,scope_of_work,site_address_snapshot').eq('id',quoteId).maybeSingle();
  if(quote){
   const snap=quote.site_address_snapshot as {address?:string;address_line1?:string;suburb?:string;state?:string;postcode?:string}|null;
   const addressFromSnap=snap?.address
    ||[snap?.address_line1,snap?.suburb,snap?.state,snap?.postcode].filter(Boolean).join(', ');
   const linkedEnquiryId=quote.enquiry_id||prefill.enquiryId;
   let linkedEnquiryRef='';
   if(linkedEnquiryId){
    const {data:enquiry}=await db.from('enquiries').select('id,reference_number').eq('id',linkedEnquiryId).maybeSingle();
    if(enquiry)linkedEnquiryRef=enquiryRef(enquiry.reference_number as number|null);
   }
   prefill={
    customerId:quote.customer_id||prefill.customerId,
    enquiryId:linkedEnquiryId,
    quoteId:quote.id,
    description:quote.scope_of_work||'',
    siteAddress:addressFromSnap||'',
   };
   provenance={
    quoteId:quote.id,
    quoteNumber:quote.quote_number||'Quote',
    enquiryId:linkedEnquiryId,
    enquiryRef:linkedEnquiryRef,
   };
  }
 }else if(canEdit&&enquiryId){
  const {data:enquiry}=await db.from('enquiries').select('id,customer_id,service,message,suburb,reference_number').eq('id',enquiryId).maybeSingle();
  if(enquiry){
   prefill={
    ...prefill,
    customerId:enquiry.customer_id||prefill.customerId,
    enquiryId:enquiry.id,
    description:enquiry.message||(enquiry.service?`${String(enquiry.service).replaceAll('_',' ')} work`:''),
    siteAddress:enquiry.suburb||'',
   };
   provenance={
    quoteId:'',
    quoteNumber:'',
    enquiryId:enquiry.id,
    enquiryRef:enquiryRef(enquiry.reference_number as number|null),
   };
  }
 }

 const {data:customers}=canEdit
  ? await db.from('customers').select('id,name').order('name').limit(1000)
  : {data: [] as {id:string;name:string}[]};

 const backHref=prefill.quoteId?`/hq/quotes/${prefill.quoteId}`:prefill.enquiryId?`/hq/enquiries/${prefill.enquiryId}`:'/hq/jobs';
 const backLabel=prefill.quoteId?'← Quote':prefill.enquiryId?'← Enquiry':'← Jobs';
 const cancelHref=backHref;

 return <main className="hq-detail"><div className="hq-detail-inner" style={{maxWidth:780}}>
  <Link className="hq-back" href={backHref}>{backLabel}</Link>
  <div className="hq-detail-head"><div>
   <div className="hq-kicker">NEW WORK ORDER</div>
   <h1>Create job</h1>
  </div></div>
  {canEdit?(
   <section className="hq-panel">
    <JobCreateForm
     customers={customers??[]}
     prefill={prefill}
     provenance={provenance}
     cancelHref={cancelHref}
    />
   </section>
  ):<p>You do not have permission to create jobs.</p>}
 </div>
 <style>{`
.ee-create-form{display:grid;gap:12px;max-width:100%}
.ee-label-inline{display:inline-flex;align-items:baseline;gap:5px;flex-wrap:wrap}
.ee-optional{color:var(--hq-muted,#738396);font-weight:400;font-size:13px}
.ee-create-form label{display:grid;gap:6px;font-weight:600}
.ee-create-form input,.ee-create-form select,.ee-create-form textarea{width:100%;box-sizing:border-box;padding:13px;border:1px solid #cdd9e5;border-radius:11px;background:var(--hq-card,#fff);color:inherit;font:inherit;font-size:16px}
.ee-create-provenance{margin:0 0 4px;color:var(--hq-muted,#738396);font-size:14px}
.ee-create-provenance a{color:var(--hq-accent,#1688e9);font-weight:600;text-decoration:none}
.ee-create-provenance a:hover{text-decoration:underline}
.ee-create-title-preview{display:block;margin-top:2px;color:var(--hq-muted,#738396);font-size:13px;font-weight:400}
.ee-create-actions{display:flex;justify-content:flex-end;align-items:center;gap:20px;padding-top:8px}
.ee-create-actions a{color:inherit}
.ee-create-actions button:disabled{opacity:.65;cursor:wait}
@media(min-width:850px){
 .ee-create-form{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:22px}
 .ee-create-form>.ee-create-span,.ee-create-form>.ee-create-provenance,.ee-create-actions{grid-column:1/-1}
 .ee-create-form textarea{resize:vertical}
}
@media(max-width:600px){
 .ee-create-form{gap:12px;padding-bottom:12px}
 .ee-create-actions{position:sticky;bottom:72px;z-index:2;gap:12px;margin:4px -4px 0;padding:12px 4px;background:linear-gradient(180deg,rgba(248,251,254,0),var(--hq-card,#fff) 28%);border-top:1px solid #e6eef5}
 .ee-create-actions button{flex:1}
}
`}</style>
 </main>;
}
