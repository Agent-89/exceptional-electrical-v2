'use client';
import Link from 'next/link';
import {useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {
  saveQuoteDraft,
  saveAndApproveQuote,
  approveQuote,
  markQuoteSent,
  markQuoteAccepted,
  markQuoteDeclined,
  makeQuoteCommercialCurrent,
  associateQuoteWithJob,
  unlinkQuoteFromJob,
  getParentQuotePrefill,
  type QuoteDraft,
} from './actions';
import {createQuoteCustomer} from './customer-action';
import type {CustomerMatchRecord} from '@/lib/customer-match';
import {
  buildVariationPrefillFromParent,
  draftHasUnsavedCommercialContent,
  groupParentQuotesByJob,
  parentSwitchConfirmMessage,
  quoteBuilderHeading,
  quoteEditorReturnHref,
  quoteTypeFromParent,
  uniqueJobIds,
  type ParentQuoteOption,
  type QuoteSaveIntent,
} from '@/lib/quote-commercial';

type Customer={id:string;name:string;email:string|null;phone:string|null};
type Enquiry={id:string;name:string;customer_id:string|null;message:string;service_category:string|null};
type Address={id:string;customer_id:string;label:string;address_line1:string;suburb:string;state:string;postcode:string};
type JobOption={id:string;jobNumber:string|null;title:string|null};
type JobContext={jobId:string;jobNumber?:string|null;jobTitle?:string|null};
type CommercialMeta={
  parentQuoteId?:string|null;
  parentQuoteNumber?:string|null;
  revisionNumber?:number|null;
  isCommercialCurrent?:boolean;
  schemaAvailable?:boolean;
};
type Initial=Partial<Omit<QuoteDraft,'lines'>> & {lines?:QuoteDraft['lines'];number?:string;status?:string};

const empty:QuoteDraft={
  customerId:'',enquiryId:'',addressId:'',address:'',title:'',scope:'',inclusions:'',exclusions:'',
  notes:'',internalNotes:'',display:'itemised',mode:'detailed',lines:[],
  quoteType:'standard',parentQuoteId:'',linkedJobId:'',linkedJobIds:[],
};
const FIXED='Fixed-price electrical work';
const isFixed=(l:QuoteDraft['lines'][number])=>l.category==='other'&&l.description===FIXED;
const money=(n:number)=>(n/100).toLocaleString('en-AU',{style:'currency',currency:'AUD'});
type Choice={id:string;label:string;detail?:string};

function SearchPicker({value,placeholder,choices,onSelect,optional=false}:{value:string;placeholder:string;choices:Choice[];onSelect:(id:string)=>void;optional?:boolean}){
 const [open,setOpen]=useState(false);const [query,setQuery]=useState('');const [active,setActive]=useState(0);
 const selected=choices.find(c=>c.id===value);
 const filtered=choices.filter(c=>(c.label+' '+(c.detail||'')).toLowerCase().includes(query.toLowerCase())).slice(0,60);
 const pick=(id:string)=>{onSelect(id);setQuery('');setOpen(false);setActive(0)};
 return <div className="hq-search-picker" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node)){setOpen(false);setQuery('')}}}>
  <div className="hq-search-picker-control"><input role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open?'hq-picker-list':undefined} placeholder={selected?selected.label:placeholder} value={open?query:selected?.label||''} onFocus={()=>setOpen(true)} onChange={e=>{setQuery(e.target.value);setOpen(true);setActive(0)}} onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);setQuery('')}if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);setActive(i=>Math.min(i+1,filtered.length-1))}if(e.key==='ArrowUp'){e.preventDefault();setActive(i=>Math.max(0,i-1))}if(e.key==='Enter'&&open&&filtered[active]){e.preventDefault();pick(filtered[active].id)}}}/><button type="button" aria-label="Show choices" onClick={()=>{setOpen(v=>!v);setQuery('')}}>⌄</button></div>
  {open&&<div className="hq-search-picker-menu" role="listbox">{optional&&<button type="button" className="hq-search-picker-option" onMouseDown={e=>e.preventDefault()} onClick={()=>pick('')}>No linked enquiry (standalone)</button>}{filtered.length?filtered.map((c,i)=><button type="button" role="option" aria-selected={c.id===value} key={c.id} className={'hq-search-picker-option'+(i===active?' is-active':'')} onMouseDown={e=>e.preventDefault()} onClick={()=>pick(c.id)}><strong>{c.label}</strong>{c.detail&&<small>{c.detail}</small>}</button>):<p className="hq-search-picker-empty">No matches found</p>}</div>}
 </div>;
}

type LegacyParent={
 id:string;
 quote_number?:string;
 quoteNumber?:string;
 title:string|null;
 status:string;
 revision_number?:number|null;
 revisionNumber?:number|null;
 parentQuoteNumber?:string|null;
 linkedJobs?:{id:string;jobNumber?:string|null;job_number?:string|null;title:string|null}[];
};

function normalizeParentOptions(raw:ParentQuoteOption[]|LegacyParent[]):ParentQuoteOption[]{
 return (raw||[]).map((p:LegacyParent|ParentQuoteOption)=>{
  const legacy=p as LegacyParent;
  return {
   id:p.id,
   quoteNumber:legacy.quoteNumber||legacy.quote_number||'',
   title:p.title??null,
   status:p.status||'',
   revisionNumber:legacy.revisionNumber??legacy.revision_number??null,
   parentQuoteNumber:legacy.parentQuoteNumber??null,
   linkedJobs:(legacy.linkedJobs||[]).map((j)=>({
    id:j.id,
    jobNumber:j.jobNumber??j.job_number??null,
    title:j.title??null,
   })),
  };
 });
}

export default function QuoteEditor({
  customers,enquiries,addresses,initial,locked=false,canApprove=false,
  jobContext=null,parentOptions=[],linkedJobOptions=[],linkedJobs=[],commercial=null,canMakeCurrent=false,
}:{
  customers:Customer[];
  enquiries:Enquiry[];
  addresses:Address[];
  initial?:Initial;
  locked?:boolean;
  /** Kept for callers; EEQ is shown only after save. */
  nextQuoteNumber?:string;
  canApprove?:boolean;
  jobContext?:JobContext|null;
  parentOptions?:ParentQuoteOption[]|{id:string;quote_number:string;title:string|null;status:string;revision_number?:number|null}[];
  /** Customer jobs available to associate (search). */
  linkedJobOptions?:{id:string;job_number?:string|null;jobNumber?:string|null;title:string|null}[];
  /** Jobs already associated (saved) or pending from job context. */
  linkedJobs?:JobOption[];
  commercial?:CommercialMeta|null;
  canMakeCurrent?:boolean;
}){
 const router=useRouter();
 const saveLock=useRef(false);
 const inferredType=quoteTypeFromParent(initial?.parentQuoteId||commercial?.parentQuoteId);
 const initialLinked=uniqueJobIds([
  ...(initial?.linkedJobIds||[]),
  initial?.linkedJobId||'',
  jobContext?.jobId||'',
  ...linkedJobs.map(j=>j.id),
 ]);
 const [draft,setDraft]=useState<QuoteDraft>({
  ...empty,
  ...initial,
  quoteType:initial?.quoteType||inferredType,
  parentQuoteId:initial?.parentQuoteId||commercial?.parentQuoteId||'',
  linkedJobId:initialLinked[0]||'',
  linkedJobIds:initialLinked,
  lines:initial?.mode==='fixed'&&!(initial?.lines||[]).some(l=>l.category==='other'&&l.description==='Fixed-price electrical work')
    ?[...(initial?.lines||[]),{description:'Fixed-price electrical work',category:'other',quantity:1,unit:'each',price:0,cost:null,gst:true}]
    :initial?.lines||[],
 });
 const [associatedJobs,setAssociatedJobs]=useState<JobOption[]>(()=>{
  const fromProp=linkedJobs.length?linkedJobs:[];
  if(fromProp.length)return fromProp;
  if(jobContext?.jobId){
   return[{id:jobContext.jobId,jobNumber:jobContext.jobNumber||null,title:jobContext.jobTitle||null}];
  }
  return[];
 });
 const [pendingJobIds,setPendingJobIds]=useState<string[]>(()=>draft.id?[]:initialLinked.filter(id=>!linkedJobs.some(j=>j.id===id)));
 const customerLabel=(c:Customer)=>`${c.name} · ${c.phone||c.email||'No contact details'} (${c.id.slice(0,8)})`;
 const enquiryLabel=(e:Enquiry)=>`${e.name} · ${e.service_category||'Enquiry'} (${e.id.slice(0,8)})`;
 const addressLabel=(a:Address)=>[a.address_line1,a.suburb,a.state,a.postcode].filter(Boolean).join(', ');
 const [,setCustomerSearch]=useState(customers.find(c=>c.id===initial?.customerId)?customerLabel(customers.find(c=>c.id===initial?.customerId)!):'');
 const [customerList,setCustomerList]=useState(customers);
 const [newCustomer,setNewCustomer]=useState(false);
 const [customerForm,setCustomerForm]=useState({name:'',email:'',phone:''});
 const [customerBusy,setCustomerBusy]=useState(false);
 const [customerMatches,setCustomerMatches]=useState<CustomerMatchRecord[]>([]);
 const [customerConflict,setCustomerConflict]=useState<'single'|'multiple'|null>(null);
 const [,setEnquirySearch]=useState(enquiries.find(e=>e.id===initial?.enquiryId)?enquiryLabel(enquiries.find(e=>e.id===initial?.enquiryId)!):'');
 const [pending,start]=useTransition();
 const [busyAction,setBusyAction]=useState('');
 const [feedback,setFeedback]=useState('');
 const [parentQuery,setParentQuery]=useState('');
 const [jobSearchId,setJobSearchId]=useState('');
 const parents=normalizeParentOptions(parentOptions as ParentQuoteOption[]);
 const set=(key:keyof QuoteDraft,value:unknown)=>setDraft(d=>({...d,[key]:value}));
 const editLine=(i:number,key:string,value:unknown)=>setDraft(d=>({...d,lines:d.lines.map((l,j)=>j===i?{...l,[key]:value}:l)}));
 const visibleLines=draft.lines.filter(l=>draft.mode==='fixed'?isFixed(l):!isFixed(l));
 const subtotal=visibleLines.reduce((s,l)=>s+Math.round(l.quantity*l.price),0);
 const gst=visibleLines.reduce((s,l)=>s+(l.gst?Math.round(l.quantity*l.price*0.1):0),0);
 const estimatedCost=visibleLines.reduce((s,l)=>s+(l.cost===null?0:Math.round(l.quantity*l.cost)),0);
 const hasMissingCosts=visibleLines.some(l=>l.cost===null);
 const hasInvalidLines=draft.lines.some(l=>!l.description.trim()||!Number.isFinite(l.quantity)||l.quantity<=0||!Number.isFinite(l.price)||l.price<0);
 const [fixedIncludesGst,setFixedIncludesGst]=useState(false);
 const [expanded,setExpanded]=useState<number[]>([]);
 const addLine=(category='other')=>{setExpanded(x=>[...x,draft.lines.length]);set('lines',[...draft.lines,{description:'',category,quantity:1,unit:category==='labour'?'hour':'each',price:0,cost:null,gst:true}])};
 const parentLocked=Boolean(draft.id);
 const showJobReturn=Boolean(jobContext?.jobId||associatedJobs[0]?.id||draft.linkedJobIds?.[0]);
 const primaryJobId=jobContext?.jobId||associatedJobs[0]?.id||draft.linkedJobIds?.[0]||'';
 const jobHref=primaryJobId?`/hq/jobs/${primaryJobId}?tab=quotes`:null;
 const status=initial?.status||'draft';
 const heading=quoteBuilderHeading({
  savedNumber:initial?.number||null,
  quoteType:draft.quoteType==='variation'?'variation':'standard',
 });
 const canOfferMakeCurrent=
  canMakeCurrent&&
  Boolean(draft.id)&&
  status==='accepted'&&
  !commercial?.isCommercialCurrent&&
  commercial?.schemaAvailable!==false;

 const customerJobs:JobOption[]=(linkedJobOptions||[]).map(j=>({
  id:j.id,
  jobNumber:j.jobNumber??j.job_number??null,
  title:j.title,
 }));
 const availableJobs=customerJobs.filter(j=>!associatedJobs.some(a=>a.id===j.id)&&!pendingJobIds.includes(j.id));

 const filteredParents=parents.filter(p=>{
  if(p.id===draft.id)return false;
  const q=parentQuery.trim().toLowerCase();
  if(!q)return true;
  return `${p.quoteNumber} ${p.title||''} ${p.status}`.toLowerCase().includes(q);
 });
 const parentGroups=groupParentQuotesByJob(filteredParents);

 function resetCustomerConflict(){setCustomerMatches([]);setCustomerConflict(null)}
 function selectMatchedCustomer(match:CustomerMatchRecord){
  setCustomerList(x=>x.some(c=>c.id===match.id)?x:[...x,match]);
  setDraft(d=>({...d,customerId:match.id,enquiryId:'',addressId:'',parentQuoteId:d.quoteType==='variation'?'':d.parentQuoteId}));
  setCustomerSearch(customerLabel(match));
  setNewCustomer(false);
  setCustomerForm({name:'',email:'',phone:''});
  resetCustomerConflict();
  setFeedback('Existing customer selected');
 }
 async function addCustomer(allowDuplicate=false){
  setCustomerBusy(true);
  try{
   const result=await createQuoteCustomer(customerForm.name,customerForm.email,customerForm.phone,allowDuplicate);
   setFeedback(result.message);
   if(result.ok&&result.customer){
    setCustomerList(x=>x.some(c=>c.id===result.customer!.id)?x:[...x,result.customer!]);
    setDraft(d=>({...d,customerId:result.customer!.id,enquiryId:'',addressId:'',parentQuoteId:''}));
    setNewCustomer(false);
    setCustomerForm({name:'',email:'',phone:''});
    resetCustomerConflict();
    setCustomerSearch(customerLabel(result.customer));
    return;
   }
   if(result.conflict&&result.matches?.length){
    setCustomerConflict(result.conflict);
    setCustomerMatches(result.matches);
    setCustomerList(x=>{
     const ids=new Set(x.map(c=>c.id));
     return [...x,...result.matches!.filter(m=>!ids.has(m.id))];
    });
    return;
   }
   resetCustomerConflict();
  }finally{setCustomerBusy(false)}
 }

 function applyPrefill(prefill:ReturnType<typeof buildVariationPrefillFromParent>,parentId:string,customerId?:string){
  setDraft(d=>({
   ...d,
   quoteType:'variation',
   parentQuoteId:parentId,
   customerId:customerId||d.customerId,
   title:prefill.title,
   scope:prefill.scope,
   inclusions:prefill.inclusions,
   exclusions:prefill.exclusions,
   notes:prefill.notes,
   internalNotes:prefill.internalNotes,
   display:prefill.display,
   mode:prefill.mode,
   address:prefill.address,
   addressId:prefill.addressId,
   lines:prefill.lines.map(l=>({...l})),
  }));
  setExpanded([]);
 }

 async function selectParent(parentId:string){
  if(parentLocked)return;
  if(!parentId){
   set('parentQuoteId','');
   return;
  }
  if(draft.parentQuoteId===parentId)return;
  const hasContent=draftHasUnsavedCommercialContent(draft)&&(draft.parentQuoteId||draft.title||draft.lines.length);
  if(hasContent&&draft.parentQuoteId&&draft.parentQuoteId!==parentId){
   if(!window.confirm(parentSwitchConfirmMessage()))return;
  }else if(hasContent&&!draft.parentQuoteId&&(draft.scope.trim()||draft.lines.some(l=>l.price>0||l.description.trim()))){
   if(!window.confirm(parentSwitchConfirmMessage()))return;
  }
  setBusyAction('prefill');
  try{
   const result=await getParentQuotePrefill(parentId);
   if(!result.ok||!result.prefill){
    setFeedback(result.message||'Unable to load parent quote.');
    return;
   }
   const built=buildVariationPrefillFromParent(result.prefill);
   applyPrefill(built,parentId,result.prefill.customerId||undefined);
   setFeedback('Variation prefilled from parent quote.');
  }catch{
   setFeedback('Unable to load parent quote.');
  }finally{
   setBusyAction('');
  }
 }

 function handleCustomerChange(nextCustomerId:string):boolean{
  const parent=parents.find(p=>p.id===draft.parentQuoteId);
  if(draft.quoteType==='variation'&&draft.parentQuoteId&&parent&&nextCustomerId&&nextCustomerId!==draft.customerId){
   // Parent options are customer-scoped; changing customer invalidates parent.
   if(!window.confirm('Changing the customer clears the selected variation parent. Continue?'))return false;
   setDraft(d=>({...d,customerId:nextCustomerId,enquiryId:'',addressId:'',address:'',parentQuoteId:''}));
   return true;
  }
  setDraft(d=>({
   ...d,
   customerId:nextCustomerId,
   enquiryId:nextCustomerId===d.customerId?d.enquiryId:'',
   addressId:nextCustomerId===d.customerId?d.addressId:'',
   address:nextCustomerId===d.customerId?d.address:'',
   parentQuoteId:nextCustomerId===d.customerId?d.parentQuoteId:'',
  }));
  return true;
 }

 function addPendingJob(jobId:string){
  if(!jobId)return;
  const job=customerJobs.find(j=>j.id===jobId)||availableJobs.find(j=>j.id===jobId);
  if(!job)return;
  if(associatedJobs.some(j=>j.id===jobId)||pendingJobIds.includes(jobId)){
   setFeedback('That job is already linked.');
   return;
  }
  if(draft.id){
   start(async()=>{
    setBusyAction('link');
    try{
     const r=await associateQuoteWithJob({quoteId:draft.id!,jobId});
     setFeedback(r.message);
     if(r.ok){
      setAssociatedJobs(x=>[...x,job]);
      setDraft(d=>({...d,linkedJobIds:uniqueJobIds([...(d.linkedJobIds||[]),jobId]),linkedJobId:d.linkedJobId||jobId}));
      router.refresh();
     }
    }finally{setBusyAction('')}
   });
   return;
  }
  setPendingJobIds(x=>uniqueJobIds([...x,jobId]));
  setAssociatedJobs(x=>x.some(j=>j.id===jobId)?x:[...x,job]);
  setDraft(d=>({...d,linkedJobIds:uniqueJobIds([...(d.linkedJobIds||[]),jobId]),linkedJobId:d.linkedJobId||jobId}));
  setJobSearchId('');
 }

 function removeJob(jobId:string){
  if(draft.id){
   start(async()=>{
    setBusyAction('unlink');
    try{
     const r=await unlinkQuoteFromJob({quoteId:draft.id!,jobId});
     setFeedback(r.message);
     if(r.ok){
      setAssociatedJobs(x=>x.filter(j=>j.id!==jobId));
      setDraft(d=>{
       const ids=uniqueJobIds((d.linkedJobIds||[]).filter(id=>id!==jobId));
       return{...d,linkedJobIds:ids,linkedJobId:ids[0]||''};
      });
      router.refresh();
     }
    }finally{setBusyAction('')}
   });
   return;
  }
  setPendingJobIds(x=>x.filter(id=>id!==jobId));
  setAssociatedJobs(x=>x.filter(j=>j.id!==jobId));
  setDraft(d=>{
   const ids=uniqueJobIds((d.linkedJobIds||[]).filter(id=>id!==jobId));
   return{...d,linkedJobIds:ids,linkedJobId:ids[0]||''};
  });
 }

 function save(approve=false,intent:QuoteSaveIntent='continue'){
  if(saveLock.current||pending)return;
  if(!draft.title.trim()){setFeedback('Enter a quote title before saving.');return;}
  if(hasInvalidLines){setFeedback('Check item descriptions, quantities and prices before saving.');return;}
  if(draft.quoteType==='variation'&&!draft.parentQuoteId){setFeedback('Select the quote this variation revises.');return;}
  saveLock.current=true;
  setBusyAction(approve?'approve':'save');
  start(async()=>{
   try{
    const jobIds=uniqueJobIds([
     ...(draft.linkedJobIds||[]),
     ...pendingJobIds,
     ...associatedJobs.map(j=>j.id),
     jobContext?.jobId||'',
    ]);
    const payload:QuoteDraft={
     ...draft,
     parentQuoteId:draft.quoteType==='variation'?draft.parentQuoteId:'',
     linkedJobId:jobIds[0]||'',
     linkedJobIds:jobIds,
    };
    const result=approve?await saveAndApproveQuote(payload):await saveQuoteDraft(payload);
    setFeedback(result.message);
    if(result.ok&&result.id){
     const returnHref=quoteEditorReturnHref({
      jobId:primaryJobId||jobIds[0]||null,
      intent:intent==='return_to_job'&&!(primaryJobId||jobIds[0])?'return_to_quotes':intent,
      quoteId:result.id,
     });
     if(returnHref){
      router.push(returnHref);
      return;
     }
     if(!draft.id)router.replace('/hq/quotes/'+result.id);
     else router.refresh();
    }
   }catch{setFeedback('Unable to save. Try again.')}
   finally{
    saveLock.current=false;
    setBusyAction('');
   }
  });
 }

 function runLifecycle(label:string,fn:()=>Promise<{ok:boolean;message:string}>){
  if(saveLock.current||pending)return;
  saveLock.current=true;
  setBusyAction(label);
  start(async()=>{
   try{
    const r=await fn();
    setFeedback(r.message);
    router.refresh();
   }catch{setFeedback('Unable to update quote status.')}
   finally{
    saveLock.current=false;
    setBusyAction('');
   }
  });
 }

 const saving=pending&&(busyAction==='save'||busyAction==='approve');
 const displayJobs=associatedJobs.length
  ?associatedJobs
  :pendingJobIds.map(id=>{
   const job=customerJobs.find(j=>j.id===id);
   return job||{id,jobNumber:null,title:'Pending link'};
  });

 return <main className="hq-detail hq-quote-builder-page"><div className="hq-detail-inner">
  <nav className="hq-quote-breadcrumbs" aria-label="Breadcrumb">
   {jobContext?.jobId?(
    <>
     <Link href="/hq/jobs">Jobs</Link>
     <span aria-hidden="true">/</span>
     <Link href={`/hq/jobs/${jobContext.jobId}`}>{jobContext.jobNumber||'Job'}</Link>
     <span aria-hidden="true">/</span>
     <Link href={`/hq/jobs/${jobContext.jobId}?tab=quotes`}>Quotes</Link>
     <span aria-hidden="true">/</span>
     <span>{initial?.number||heading}</span>
    </>
   ):(
    <>
     <Link href="/hq/quotes">Quotes</Link>
     <span aria-hidden="true">/</span>
     <span>{initial?.number||heading}</span>
    </>
   )}
  </nav>
  {jobHref?<Link href={jobHref} className="hq-back">← Back to job</Link>:<Link href="/hq/quotes" className="hq-back">← Quotes</Link>}

  <div className="hq-quote-builder-head">
   <div className="hq-quote-builder-head-main">
    <h1 className={initial?.number?'hq-quote-ref':undefined}>{heading}</h1>
    {(commercial?.parentQuoteNumber||commercial?.isCommercialCurrent)&&(
     <p className="hq-quote-builder-meta">
      {commercial?.parentQuoteNumber?<>Revision of <strong>{commercial.parentQuoteNumber}</strong>{(commercial.revisionNumber||0)>0?` · rev ${commercial.revisionNumber}`:''}</>:null}
      {commercial?.isCommercialCurrent?<span className="hq-quote-current-chip">Current commercial</span>:null}
     </p>
    )}
   </div>
   <span className="hq-status">{initial?.status||'Draft'}</span>
  </div>

  <fieldset disabled={locked||pending} style={{border:0,padding:0,minWidth:0}}><div className="hq-quote-editor">
 <section className="hq-quote-type-bar" aria-label="Quote type">
  <div className="hq-segmented" role="radiogroup" aria-label="Standard quote or variation">
   <label className={draft.quoteType!=='variation'?'is-active':''}>
    <input type="radio" name="quoteType" disabled={parentLocked} checked={draft.quoteType!=='variation'} onChange={()=>setDraft(d=>({...d,quoteType:'standard',parentQuoteId:''}))}/>
    Standard quote
   </label>
   <label className={draft.quoteType==='variation'?'is-active':''}>
    <input type="radio" name="quoteType" disabled={parentLocked} checked={draft.quoteType==='variation'} onChange={()=>setDraft(d=>({...d,quoteType:'variation'}))}/>
    Variation
   </label>
  </div>
  {draft.quoteType==='variation'?(
   <div className="hq-quote-parent-picker">
    <label className="hq-quote-parent-label">Parent quote
     <input
      type="search"
      placeholder={draft.customerId?'Search EEQ number or title':'Select a customer first'}
      value={parentQuery}
      disabled={parentLocked||!draft.customerId||busyAction==='prefill'}
      onChange={e=>setParentQuery(e.target.value)}
     />
    </label>
    <select
     value={draft.parentQuoteId||''}
     disabled={parentLocked||!draft.customerId||busyAction==='prefill'}
     onChange={e=>void selectParent(e.target.value)}
     aria-label="Select parent quote"
    >
     <option value="">{draft.customerId?'Select parent quote':'Select a customer first'}</option>
     {parentGroups.map(group=>(
      <optgroup key={group.key} label={group.label}>
       {group.quotes.map(p=>(
        <option key={p.id} value={p.id}>
         {p.quoteNumber}{p.title?` · ${p.title}`:''} · {p.status.replaceAll('_',' ')}
         {p.parentQuoteNumber?` · rev of ${p.parentQuoteNumber}`:''}
         {(p.revisionNumber||0)>0?` · rev ${p.revisionNumber}`:''}
        </option>
       ))}
      </optgroup>
     ))}
    </select>
    {busyAction==='prefill'?<p className="hq-quote-field-hint" role="status">Copying commercial content from parent…</p>:null}
    {parentLocked&&commercial?.parentQuoteNumber?<p className="hq-quote-field-hint">Parent is locked after save ({commercial.parentQuoteNumber}).</p>:null}
   </div>
  ):null}
 </section>

 <section className="hq-panel hq-quote-linked-jobs"><h2>Linked jobs</h2>
  <p className="hq-quote-field-hint">Jobs associated with this quote (same customer). Separate from the customer and site address below.</p>
  {displayJobs.length?(
   <ul className="hq-linked-job-list">
    {displayJobs.map(job=>{
     const pending=!draft.id&&pendingJobIds.includes(job.id);
     return (
      <li key={job.id}>
       <div>
        <strong>{job.jobNumber||job.id.slice(0,8)}</strong>
        <span>{job.title||'Untitled job'}{pending?' · pending link':''}</span>
       </div>
       <div className="hq-linked-job-actions">
        <Link href={`/hq/jobs/${job.id}`}>View Job</Link>
        {!locked?<button type="button" disabled={busyAction==='unlink'} onClick={()=>removeJob(job.id)}>Remove</button>:null}
       </div>
      </li>
     );
    })}
   </ul>
  ):<p className="hq-quote-field-hint">No jobs linked yet.</p>}
  {!locked&&draft.customerId?(
   <div className="hq-linked-job-add">
    <SearchPicker
     value={jobSearchId}
     placeholder="Search jobs for this customer"
     choices={availableJobs.map(j=>({id:j.id,label:j.jobNumber||j.id.slice(0,8),detail:j.title||''}))}
     onSelect={id=>{setJobSearchId(id);if(id)addPendingJob(id)}}
    />
   </div>
  ):!draft.customerId?<p className="hq-quote-field-hint">Select a customer before linking jobs.</p>:null}
 </section>

 <section className="hq-panel"><h2>Customer and location</h2><label>Customer<SearchPicker value={draft.customerId} placeholder="Search name, phone or email" choices={customerList.map(c=>({id:c.id,label:c.name,detail:c.phone||c.email||''}))} onSelect={id=>{if(handleCustomerChange(id)){setEnquirySearch('');resetCustomerConflict()}}}/></label><button type="button" className="hq-quote-add-customer" onClick={()=>{setNewCustomer(x=>!x);resetCustomerConflict();setFeedback('')}}>{newCustomer?'Cancel new customer':'+ Create new customer'}</button>{newCustomer&&<div className="hq-quote-new-customer"><label>Name<input value={customerForm.name} onChange={e=>{setCustomerForm(x=>({...x,name:e.target.value}));resetCustomerConflict()}}/></label><label>Email<input type="email" value={customerForm.email} onChange={e=>{setCustomerForm(x=>({...x,email:e.target.value}));resetCustomerConflict()}}/></label><label>Phone<input type="tel" value={customerForm.phone} onChange={e=>{setCustomerForm(x=>({...x,phone:e.target.value}));resetCustomerConflict()}}/></label>{!customerConflict&&<button type="button" disabled={customerBusy} onClick={()=>addCustomer(false)}>{customerBusy?'Creating…':'Create and select customer'}</button>}{customerConflict&&customerMatches.length>0&&<div className="hq-quote-customer-match" role="status"><p><strong>{customerConflict==='single'?'Existing customer found':'Multiple matching customers'}</strong></p><p>{feedback}</p><ul>{customerMatches.map(m=><li key={m.id}><strong>{m.name}</strong><span>{[m.phone,m.email].filter(Boolean).join(' · ')||'No contact details'}</span><button type="button" disabled={customerBusy} onClick={()=>selectMatchedCustomer(m)}>Select this customer</button></li>)}</ul><button type="button" disabled={customerBusy} onClick={()=>addCustomer(true)}>{customerBusy?'Creating…':'Create separate customer anyway'}</button></div>}</div>}<label>Linked enquiry <span className="hq-quote-optional">(optional)</span><SearchPicker value={draft.enquiryId} placeholder="Search customer or service" optional choices={enquiries.filter(e=>!draft.customerId||!e.customer_id||e.customer_id===draft.customerId).map(e=>({id:e.id,label:enquiryLabel(e),detail:e.service_category||'Enquiry'}))} onSelect={id=>{const source=enquiries.find(e=>e.id===id);setDraft(d=>({...d,enquiryId:id,customerId:source?.customer_id||d.customerId,title:d.title||source?.service_category?.replaceAll('_',' ')||'',scope:d.scope||source?.message||''}))}}/></label><label>Job site address<input list="quote-addresses" placeholder="Select a saved address or type a new site address" value={draft.address} onChange={e=>{const value=e.target.value;const match=addresses.filter(a=>a.customer_id===draft.customerId).find(a=>addressLabel(a)===value);setDraft(d=>({...d,address:value,addressId:match?.id||''}));}}/><datalist id="quote-addresses">{addresses.filter(a=>a.customer_id===draft.customerId).map(a=><option key={a.id} value={addressLabel(a)}/>)}</datalist></label><p className="hq-quote-field-hint">{draft.addressId?'Using a saved customer site address.':'New site? Type the full address here. It will be stored on this quote; adding it to the customer address book is a separate step.'}</p></section>
 <section className="hq-panel"><h2>Scope of work</h2><label>Quote title<input value={draft.title} maxLength={200} onChange={e=>set('title',e.target.value)}/></label><label>Description<textarea rows={5} value={draft.scope} onChange={e=>set('scope',e.target.value)}/></label><details className="hq-quote-optional-details" open={Boolean(initial?.inclusions||initial?.exclusions)}><summary>Optional inclusions and exclusions</summary><label>Inclusions<textarea rows={3} value={draft.inclusions} onChange={e=>set('inclusions',e.target.value)}/></label><label>Exclusions<textarea rows={3} value={draft.exclusions} onChange={e=>set('exclusions',e.target.value)}/></label></details></section>
 <section className="hq-panel"><h2>Pricing</h2><label>Pricing approach<select value={draft.mode} onChange={e=>{const mode=e.target.value;setDraft(d=>({...d,mode,lines:mode==='fixed'&&!d.lines.some(isFixed)?[...d.lines,{description:FIXED,category:'other',quantity:1,unit:'each',price:0,cost:null,gst:true}]:d.lines}))}}><option value="detailed">Detailed line items</option><option value="fixed">Fixed price</option><option value="mixed">Mixed</option></select></label><label>Customer presentation<select value={draft.display} onChange={e=>set('display',e.target.value)}><option value="itemised">Itemised (default)</option><option value="total_only">Total only</option></select></label>{draft.mode==='fixed'?<div className="hq-quote-fixed">{(()=>{const l=draft.lines.find(isFixed);const i=draft.lines.findIndex(isFixed);const amount=l?.price||0;const includes=fixedIncludesGst&&l?.gst;return <><label>Fixed quote amount (AUD)<input type="number" min="0" step=".01" placeholder="Enter fixed amount" value={amount?String((includes?Math.round(amount*1.1):amount)/100):''} onFocus={e=>e.currentTarget.select()} onChange={e=>{const raw=Math.max(0,Math.round(Number(e.target.value)*100));editLine(i,'price',includes?Math.round(raw/1.1):raw)}}/></label><label className="hq-quote-gst"><input type="checkbox" checked={l?.gst??true} onChange={e=>editLine(i,'gst',e.target.checked)}/> GST applies (10%)</label>{l?.gst&&<label className="hq-quote-gst"><input type="checkbox" checked={fixedIncludesGst} onChange={e=>setFixedIncludesGst(e.target.checked)}/> Entered amount includes GST</label>}<label>Estimated internal job cost (AUD) — staff only<input type="number" min="0" step=".01" placeholder="Optional" value={l?.cost==null||l.cost===0?'':String(l.cost/100)} onFocus={e=>e.currentTarget.select()} onChange={e=>editLine(i,'cost',e.target.value===''?null:Math.round(Number(e.target.value)*100))}/></label><p className="hq-quote-fixed-note">A single fixed-price line is saved for the customer quote. Detailed line items are retained if you switch pricing modes.</p>{l?.cost!==null&&<p className="hq-quote-profit">Estimated gross profit (ex GST): <strong>{money(amount-(l?.cost||0))}</strong></p>}</>})()}</div>:<>{draft.lines.map((l,i)=>isFixed(l)?null:<div key={i} className="hq-quote-line"><button className="hq-quote-line-toggle" type="button" aria-expanded={expanded.includes(i)} onClick={()=>setExpanded(x=>x.includes(i)?x.filter(n=>n!==i):[...x,i])}><span>{l.description||`Item ${i+1}`} · {money(Math.round(l.quantity*l.price))}</span><span>{expanded.includes(i)?"−":"+"}</span></button>{expanded.includes(i)&&<div className="hq-quote-line-fields"><label>Description<input value={l.description} onChange={e=>editLine(i,'description',e.target.value)}/></label><label>Category<select value={l.category} onChange={e=>editLine(i,'category',e.target.value)}>{['labour','material','equipment','subcontractor','other'].map(x=><option key={x} value={x}>{x}</option>)}</select></label><div className="hq-quote-line-grid"><label>Qty<input type="number" min="0" step=".001" value={l.quantity===0?"":l.quantity} placeholder="0" onChange={e=>editLine(i,'quantity',e.target.value===""?0:Number(e.target.value))}/></label><label>Unit<input value={l.unit} onChange={e=>editLine(i,'unit',e.target.value)}/></label><label>Unit price (AUD)<input type="number" min="0" step=".01" value={l.price===0?"":String(l.price/100)} onFocus={e=>e.currentTarget.select()} onChange={e=>editLine(i,'price',Math.round(Number(e.target.value)*100))}/></label><label>Internal unit cost (AUD)<input type="number" min="0" step=".01" placeholder="Optional" value={l.cost===null||l.cost===0?"":String(l.cost/100)} onFocus={e=>e.currentTarget.select()} onChange={e=>editLine(i,'cost',e.target.value===''?null:Math.round(Number(e.target.value)*100))}/></label></div><label className="hq-quote-gst"><input type="checkbox" checked={l.gst} onChange={e=>editLine(i,'gst',e.target.checked)}/> GST applies</label><div className="hq-quote-line-footer"><strong>{money(Math.round(l.quantity*l.price))}</strong><button type="button" onClick={()=>set('lines',draft.lines.filter((_,j)=>j!==i))}>Remove item</button></div></div>}</div>)}<div className="hq-quote-add-actions"><button type="button" className="hq-quote-button" onClick={()=>addLine()}>+ Custom item</button><button type="button" onClick={()=>addLine("labour")}>+ Labour</button><button type="button" onClick={()=>addLine("material")}>+ Material</button><button type="button" onClick={()=>addLine("equipment")}>+ Equipment</button></div></>}<div className="hq-quote-totals"><p>Subtotal <strong>{money(subtotal)}</strong></p><p>GST <strong>{money(gst)}</strong></p><p>Total inc GST <strong>{money(subtotal+gst)}</strong></p></div><details className="hq-quote-cost-summary"><summary>Internal costing — staff only</summary><p>Estimated costs entered: <strong>{money(estimatedCost)}</strong></p><p>Estimated gross profit (ex GST): <strong>{money(subtotal-estimatedCost)}</strong></p>{hasMissingCosts&&<p className="hq-quote-cost-warning">Some items have no internal cost entered. Profit is incomplete until costs are added.</p>}</details></section>
 <section className="hq-panel hq-quote-notes-panel"><h2>Notes</h2><label>Customer-facing notes<textarea rows={3} value={draft.notes} onChange={e=>set('notes',e.target.value)}/></label><label>Internal notes (staff only)<textarea rows={4} value={draft.internalNotes} onChange={e=>set('internalNotes',e.target.value)}/></label></section></div></fieldset>
 {draft.id&&<div className="hq-quote-save hq-quote-lifecycle">
  <Link className="hq-quote-button" href={'/hq/quotes/'+draft.id+'/preview'} target="_blank" rel="noopener noreferrer">Preview quote ↗</Link>
  {displayJobs.length===1?(
   <Link className="hq-quote-button hq-quote-button-secondary" href={`/hq/jobs/${displayJobs[0].id}`}>View Job</Link>
  ):displayJobs.length>1?(
   <a className="hq-quote-button hq-quote-button-secondary" href="#linked-jobs" onClick={e=>{e.preventDefault();document.querySelector('.hq-quote-linked-jobs')?.scrollIntoView({behavior:'smooth'})}}>Linked Jobs</a>
  ):null}
  {['approved','sent','accepted'].includes(status)?(
   <Link className="hq-quote-button" href={'/hq/jobs/new?quote='+draft.id}>{displayJobs.length?'+ Create another job':'+ Create job'}</Link>
  ):null}
  {canApprove&&['draft','changes_requested','pending_approval'].includes(status)&&<button type="button" className="hq-quote-button" disabled={pending} onClick={()=>runLifecycle('approve-saved',()=>approveQuote(draft.id!))}>{busyAction==='approve-saved'?'Approving…':'Approve saved quote'}</button>}
  {status==='approved'&&<button type="button" className="hq-quote-button hq-quote-button-secondary" disabled={pending} onClick={()=>runLifecycle('sent',()=>markQuoteSent(draft.id!))}>{busyAction==='sent'?'Saving…':'Mark as sent'}</button>}
  {(status==='approved'||status==='sent')&&<button type="button" className="hq-quote-button hq-quote-button-secondary" disabled={pending} onClick={()=>runLifecycle('accepted',()=>markQuoteAccepted(draft.id!))}>{busyAction==='accepted'?'Saving…':'Mark as accepted'}</button>}
  {(status==='approved'||status==='sent')&&<button type="button" className="hq-quote-button hq-quote-button-secondary" disabled={pending} onClick={()=>runLifecycle('declined',()=>markQuoteDeclined(draft.id!))}>{busyAction==='declined'?'Saving…':'Mark as declined'}</button>}
  {canOfferMakeCurrent&&<button type="button" className="hq-quote-button hq-quote-button-secondary" disabled={pending} onClick={()=>runLifecycle('current',()=>makeQuoteCommercialCurrent(draft.id!))}>{busyAction==='current'?'Updating…':'Make current commercial version'}</button>}
  <span role="status">{feedback||(locked?'Quote is locked. Status changes above do not edit pricing.':'Preview uses the last saved version. Save changes first.')}</span>
  {status==='approved'&&!feedback&&<span className="hq-quote-lifecycle-hint">“Mark as sent” records that the quote was issued. It does not email the customer.</span>}
 </div>}
 {!locked&&<div className="hq-quote-save hq-quote-save-sticky" aria-busy={saving}>
  <button className="hq-quote-button" disabled={pending} onClick={()=>save(false,'continue')}>{busyAction==='save'?'Saving…':'Save & continue'}</button>
  {showJobReturn?(
   <button className="hq-quote-button hq-quote-button-secondary" disabled={pending} onClick={()=>save(false,'return_to_job')}>{busyAction==='save'?'Saving…':'Save & return to job'}</button>
  ):(
   <button className="hq-quote-button hq-quote-button-secondary" disabled={pending} onClick={()=>save(false,'return_to_quotes')}>{busyAction==='save'?'Saving…':'Save & view quote'}</button>
  )}
  {canApprove&&<button className="hq-quote-button" disabled={pending} onClick={()=>save(true,'continue')}>{busyAction==='approve'?'Working…':'Save & approve'}</button>}
  <span role="status">{feedback}</span>
 </div>}
 </div>
 <style>{`
 .hq-quote-breadcrumbs{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 10px;font-size:13px;color:#5b7386}
 .hq-quote-breadcrumbs a{color:#18577d;text-decoration:none;font-weight:650}
 .hq-quote-builder-page .hq-detail-inner{padding-bottom:calc(160px + env(safe-area-inset-bottom,0px))}
 .hq-quote-builder-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin:0 0 18px}
 .hq-quote-builder-head h1{margin:0;font-size:28px;line-height:1.15;letter-spacing:-.02em}
 .hq-quote-builder-head h1.hq-quote-ref{font-size:30px;font-weight:800;letter-spacing:.01em}
 .hq-quote-builder-meta{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:6px 0 0;font-size:13px;color:#4f677a}
 .hq-quote-type-bar{display:grid;gap:10px;margin:0 0 4px}
 .hq-segmented{display:inline-grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #c9dae8;border-radius:10px;overflow:hidden;max-width:360px;background:#fff}
 .hq-segmented label{display:flex;align-items:center;justify-content:center;gap:0;margin:0;padding:10px 14px;font-size:13px;font-weight:700;color:#3d5a70;cursor:pointer;background:#f7fafc}
 .hq-segmented label.is-active{background:#0875bd;color:#fff}
 .hq-segmented input{position:absolute;opacity:0;pointer-events:none}
 .hq-quote-parent-picker{display:grid;gap:8px;max-width:640px}
 .hq-quote-parent-label{display:grid;gap:6px;font-size:13px;font-weight:650;color:#355468}
 .hq-quote-parent-picker select,.hq-quote-parent-picker input[type=search]{width:100%;box-sizing:border-box}
 .hq-quote-linked-jobs .hq-linked-job-list{list-style:none;margin:0;padding:0;display:grid;gap:10px}
 .hq-quote-linked-jobs .hq-linked-job-list li{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid #e4edf4}
 .hq-quote-linked-jobs .hq-linked-job-list li:last-child{border-bottom:0}
 .hq-quote-linked-jobs .hq-linked-job-list strong{display:block}
 .hq-quote-linked-jobs .hq-linked-job-list span{color:#6b8498;font-size:13px}
 .hq-linked-job-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
 .hq-linked-job-actions a,.hq-linked-job-actions button{font-size:13px}
 .hq-linked-job-add{margin-top:8px;max-width:420px}
 .hq-quote-notes-panel{scroll-margin-bottom:140px}
 .hq-quote-current-chip{display:inline-flex;align-items:center;border-radius:8px;padding:2px 8px;background:#e7f3ff;color:#076ab5;font-size:12px;font-weight:800}
 .hq-quote-customer-match{display:grid;gap:10px;margin-top:10px;padding:12px;border:1px solid #d7e3ee;border-radius:10px;background:#f7fbff}
 .hq-quote-customer-match ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}
 .hq-quote-customer-match li{display:grid;gap:4px}
 .hq-quote-customer-match span{color:#6b8498;font-size:13px}
 .hq-quote-customer-match button{justify-self:start}
 @media (max-width:720px){
  .hq-quote-builder-head h1,.hq-quote-builder-head h1.hq-quote-ref{font-size:24px}
  .hq-segmented{max-width:none;width:100%}
 }
 `}</style>
 </main>;
}
