import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {
  evaluateCustomerEmptyDelete,
  evaluateEnquiryEmptyDelete,
  evaluateJobEmptyDelete,
  evaluateQuoteEmptyDelete,
  evaluateVisitEmptyDelete,
  formatEmptyDeleteBlockers,
  type EmptyDeleteVerdict,
} from '@/lib/hq-empty-delete';

async function countRows(
  db:SupabaseClient,
  table:string,
  column:string,
  id:string,
):Promise<number>{
  const {count,error}=await db.from(table).select('id',{count:'exact',head:true}).eq(column,id);
  if(error)throw new Error(`Unable to check ${table}.`);
  return count??0;
}

export async function assessJobEmptyDelete(
  db:SupabaseClient,
  jobId:string,
):Promise<EmptyDeleteVerdict>{
  const [
    appointmentCount,
    timeEntryCount,
    jobQuoteCount,
    noteCount,
    attachmentCount,
    {count:activityTotal},
    {count:createdOnly},
  ]=await Promise.all([
    countRows(db,'job_appointments','job_id',jobId),
    countRows(db,'job_time_entries','job_id',jobId),
    countRows(db,'job_quotes','job_id',jobId),
    countRows(db,'job_notes','job_id',jobId),
    countRows(db,'job_attachments','job_id',jobId),
    db.from('job_activity').select('id',{count:'exact',head:true}).eq('job_id',jobId),
    db.from('job_activity').select('id',{count:'exact',head:true}).eq('job_id',jobId).eq('action','created'),
  ]);
  const meaningfulActivityCount=Math.max(0,(activityTotal??0)-(createdOnly??0));
  return evaluateJobEmptyDelete({
    appointmentCount,
    timeEntryCount,
    jobQuoteCount,
    noteCount,
    attachmentCount,
    meaningfulActivityCount,
  });
}

export async function assessQuoteEmptyDelete(
  db:SupabaseClient,
  quoteId:string,
):Promise<EmptyDeleteVerdict>{
  const {data:quote,error}=await db
    .from('quotes')
    .select('id,status,is_commercial_current')
    .eq('id',quoteId)
    .maybeSingle();
  if(error||!quote)throw new Error('Quote not found.');
  const [
    jobQuoteCount,
    childVariationCount,
    {count:activityTotal},
    {count:createdOnly},
  ]=await Promise.all([
    countRows(db,'job_quotes','quote_id',quoteId),
    countRows(db,'quotes','parent_quote_id',quoteId),
    db.from('quote_activity').select('id',{count:'exact',head:true}).eq('quote_id',quoteId),
    db.from('quote_activity').select('id',{count:'exact',head:true}).eq('quote_id',quoteId).in('action',['created','draft_saved','draft_created']),
  ]);
  const meaningfulActivityCount=Math.max(0,(activityTotal??0)-(createdOnly??0));
  return evaluateQuoteEmptyDelete({
    status:String(quote.status||''),
    jobQuoteCount,
    childVariationCount,
    isCommercialCurrent:Boolean(quote.is_commercial_current),
    meaningfulActivityCount,
  });
}

export async function assessEnquiryEmptyDelete(
  db:SupabaseClient,
  enquiryId:string,
):Promise<EmptyDeleteVerdict>{
  const {data:enquiry,error}=await db
    .from('enquiries')
    .select('id,customer_id')
    .eq('id',enquiryId)
    .maybeSingle();
  if(error||!enquiry)throw new Error('Enquiry not found.');
  const [linkedQuoteCount,linkedJobCount]=await Promise.all([
    countRows(db,'quotes','enquiry_id',enquiryId),
    countRows(db,'jobs','enquiry_id',enquiryId),
  ]);
  return evaluateEnquiryEmptyDelete({
    customerId:enquiry.customer_id?String(enquiry.customer_id):null,
    linkedQuoteCount,
    linkedJobCount,
  });
}

export async function assessCustomerEmptyDelete(
  db:SupabaseClient,
  customerId:string,
):Promise<EmptyDeleteVerdict>{
  const [jobCount,quoteCount,enquiryCount,noteCount]=await Promise.all([
    countRows(db,'jobs','customer_id',customerId),
    countRows(db,'quotes','customer_id',customerId),
    countRows(db,'enquiries','customer_id',customerId),
    countRows(db,'customer_notes','customer_id',customerId),
  ]);
  return evaluateCustomerEmptyDelete({
    jobCount,
    quoteCount,
    enquiryCount,
    noteCount,
  });
}

export async function assessVisitEmptyDelete(
  db:SupabaseClient,
  appointmentId:string,
):Promise<EmptyDeleteVerdict&{jobId?:string}>{
  const {data:visit,error}=await db
    .from('job_appointments')
    .select('id,job_id,field_status,field_completion_note,field_outstanding_work,field_issues,field_follow_up_required')
    .eq('id',appointmentId)
    .maybeSingle();
  if(error||!visit)throw new Error('Visit not found.');
  const [timeEntryCount,techReportCount]=await Promise.all([
    countRows(db,'job_time_entries','appointment_id',appointmentId),
    countRows(db,'job_appointment_tech_reports','appointment_id',appointmentId),
  ]);
  const verdict=evaluateVisitEmptyDelete({
    timeEntryCount,
    fieldStatus:visit.field_status?String(visit.field_status):null,
    fieldCompletionNote:visit.field_completion_note?String(visit.field_completion_note):null,
    fieldOutstandingWork:visit.field_outstanding_work?String(visit.field_outstanding_work):null,
    fieldIssues:visit.field_issues?String(visit.field_issues):null,
    fieldFollowUpRequired:Boolean(visit.field_follow_up_required),
    techReportCount,
  });
  return {...verdict,jobId:String(visit.job_id)};
}

export {formatEmptyDeleteBlockers};
