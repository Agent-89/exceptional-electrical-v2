import Link from 'next/link';
import {dbAdmin,requireHqUser} from '@/lib/hq-auth';
import JobCreateForm from '../job-create-form';
import '../../hq.css';
export const dynamic='force-dynamic';

const uuid=/^[0-9a-f-]{36}$/i;

export default async function NewJobPage({searchParams}:{searchParams:Promise<{customer?:string;enquiry?:string;quote?:string}>}){
 const user=await requireHqUser();
 const canEdit=['owner','admin','office'].includes(user.role);
 const params=await searchParams;
 const db=dbAdmin();
 const quoteId=params.quote&&uuid.test(params.quote)?params.quote:'';
 const enquiryId=params.enquiry&&uuid.test(params.enquiry)?params.enquiry:'';
 const customerParam=params.customer&&uuid.test(params.customer)?params.customer:'';

 let prefill={
  customerId:customerParam,
  enquiryId,
  quoteId,
  title:'',
  description:'',
  siteAddress:'',
 };

 if(canEdit&&quoteId){
  const {data:quote}=await db.from('quotes').select('id,customer_id,enquiry_id,title,scope_of_work,site_address_snapshot').eq('id',quoteId).maybeSingle();
  if(quote){
   const snap=quote.site_address_snapshot as {address?:string;address_line1?:string;suburb?:string;state?:string;postcode?:string}|null;
   const addressFromSnap=snap?.address
    ||[snap?.address_line1,snap?.suburb,snap?.state,snap?.postcode].filter(Boolean).join(', ');
   prefill={
    customerId:quote.customer_id||prefill.customerId,
    enquiryId:quote.enquiry_id||prefill.enquiryId,
    quoteId:quote.id,
    title:quote.title||'',
    description:quote.scope_of_work||'',
    siteAddress:addressFromSnap||'',
   };
  }
 }else if(canEdit&&enquiryId){
  const {data:enquiry}=await db.from('enquiries').select('id,customer_id,service,message,suburb').eq('id',enquiryId).maybeSingle();
  if(enquiry){
   prefill={
    ...prefill,
    customerId:enquiry.customer_id||prefill.customerId,
    enquiryId:enquiry.id,
    title:enquiry.service?`${enquiry.service.replaceAll('_',' ')} work`:'',
    description:enquiry.message||'',
    siteAddress:enquiry.suburb||'',
   };
  }
 }

 const {data:customers}=canEdit?await db.from('customers').select('id,name').order('name').limit(1000):{data:[]};

 return <main className="hq-detail"><div className="hq-detail-inner" style={{maxWidth:780}}><Link className="hq-back" href="/hq/jobs">← Jobs</Link><div className="hq-detail-head"><div><div className="hq-kicker">NEW WORK ORDER</div><h1>Create job</h1><p>Capture the essentials now. Assign and schedule when ready.</p></div></div>{canEdit?<section className="hq-panel"><JobCreateForm customers={customers??[]} prefill={prefill}/></section>:<p>You do not have permission to create jobs.</p>}</div><style>{`.ee-create-form{display:grid;gap:12px;max-width:100%}.ee-label-inline{display:inline-flex;align-items:baseline;gap:5px;flex-wrap:wrap}.ee-optional{color:var(--hq-muted,#738396);font-weight:400;font-size:13px}.ee-create-form label{display:grid;gap:6px;font-weight:600}.ee-create-form input,.ee-create-form select,.ee-create-form textarea{width:100%;box-sizing:border-box;padding:13px;border:1px solid #cdd9e5;border-radius:11px;background:var(--hq-card,#fff);color:inherit;font:inherit;font-size:16px}.ee-create-actions{display:flex;justify-content:flex-end;align-items:center;gap:20px;padding-top:8px}.ee-create-actions a{color:inherit}.ee-create-actions button:disabled{opacity:.65;cursor:wait}@media(min-width:850px){.ee-create-form{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:22px}.ee-create-form>label:nth-of-type(1),.ee-create-form>label:nth-of-type(5),.ee-create-actions{grid-column:1/-1}.ee-create-form textarea{resize:vertical}}@media(max-width:600px){.ee-create-actions{gap:12px}.ee-create-actions button{flex:1}.ee-create-form{gap:12px}}`}</style></main>;
}
