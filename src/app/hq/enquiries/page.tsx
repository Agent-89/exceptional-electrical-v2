import EnquiryInbox from '../enquiry-inbox';
import {requireOfficeUser,dbAdmin} from '@/lib/hq-auth';
import '../hq.css';
export const dynamic='force-dynamic';
type Enquiry={reference_number:number;id:string;name:string;service:string;service_category:string|null;enquiry_type:string|null;issue_tags:string[]|null;urgency:string|null;follow_up_required:boolean|null;intake_needs_review:boolean|null;requested_date:string|null;status:string;suburb:string|null;created_at:string;email:string};
export default async function EnquiriesPage(){
 await requireOfficeUser();
 const {data,error}=await dbAdmin().from('enquiries').select('id,reference_number,name,service,service_category,enquiry_type,issue_tags,urgency,follow_up_required,intake_needs_review,requested_date,status,suburb,created_at,email').order('created_at',{ascending:false}).limit(100);
 const enquiries=(data??[]) as Enquiry[];
 return <main className="hq-detail hq-enquiries-page"><div className="hq-detail-inner hq-enquiries-inner"><div className="hq-detail-head hq-enquiries-heading"><div><div className="hq-kicker">CUSTOMER ENQUIRIES</div><h1>Enquiries</h1><p>Review requests, follow-ups and calls needing attention.</p></div></div><section className="hq-panel hq-enquiries-panel">{error?<p role="alert">Enquiries could not be loaded.</p>:<EnquiryInbox enquiries={enquiries}/>}</section></div></main>;
}
