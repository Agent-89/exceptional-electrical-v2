'use client';
import Link from 'next/link';
import {useEffect,useId,useRef,useState,useTransition} from 'react';
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
  searchQuoteCustomers,
  loadCustomerAddressesForQuote,
  type QuoteDraft,
} from './actions';
import HqToast, {type HqToastMessage} from '../hq-toast';
import {createQuoteCustomer} from './customer-action';
import type {CustomerMatchRecord} from '@/lib/customer-match';
import {
  buildVariationPrefillFromParent,
  canChangePersistedQuoteCustomer,
  draftHasUnsavedCommercialContent,
  groupParentQuotesByJob,
  parentSwitchConfirmMessage,
  quoteBuilderHeading,
  quoteCustomerChangeBlockedMessage,
  quoteEditorReturnHref,
  quoteLineExGstCents,
  quoteLineGstCents,
  quoteTypeFromParent,
  reconcileLinkedJobsForCustomerChange,
  uniqueJobIds,
  type ParentQuoteOption,
  type QuoteSaveIntent,
} from '@/lib/quote-commercial';
import {
  prettyServiceCategory,
  stripEnquiryMetaForQuoteScope,
} from '@/lib/quote-prefill';

type Customer={id:string;name:string;email:string|null;phone:string|null};
type Enquiry={id:string;name:string;customer_id:string|null;message:string;service_category:string|null;suburb?:string|null};
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
  quoteType:'standard',parentQuoteId:'',linkedJobId:'',linkedJobIds:[],validityDays:30,
};
const FIXED='Fixed-price electrical work';
const isFixed=(l:QuoteDraft['lines'][number])=>l.category==='other'&&l.description===FIXED;
const money=(n:number)=>(n/100).toLocaleString('en-AU',{style:'currency',currency:'AUD'});
const statusLabel=(s:string)=>s.replaceAll('_',' ');
type Choice={id:string;label:string;detail?:string};

function SearchPicker({value,placeholder,choices,onSelect,optional=false,disabled=false,onQuery}:{value:string;placeholder:string;choices:Choice[];onSelect:(id:string)=>void;optional?:boolean;disabled?:boolean;onQuery?:(query:string)=>void}){
 const [open,setOpen]=useState(false);const [query,setQuery]=useState('');const [active,setActive]=useState(0);
 const listId=useId();
 const selected=choices.find(c=>c.id===value);
 const filtered=choices.filter(c=>(c.label+' '+(c.detail||'')).toLowerCase().includes(query.toLowerCase())).slice(0,60);
 const pick=(id:string)=>{onSelect(id);setQuery('');setOpen(false);setActive(0)};
 return <div className="hq-search-picker" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node)){setOpen(false);setQuery('')}}}>
  <div className="hq-search-picker-control">
   <input
    role="combobox"
    aria-autocomplete="list"
    aria-expanded={open}
    aria-controls={open?listId:undefined}
    placeholder={selected?selected.label:placeholder}
    value={open?query:selected?.label||''}
    disabled={disabled}
    onFocus={()=>{if(!disabled){setOpen(true);onQuery?.('')}}}
    onChange={e=>{const next=e.target.value;setQuery(next);setOpen(true);setActive(0);onQuery?.(next)}}
    onKeyDown={e=>{
     if(e.key==='Escape'){setOpen(false);setQuery('')}
     if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);setActive(i=>Math.min(i+1,filtered.length-1))}
     if(e.key==='ArrowUp'){e.preventDefault();setActive(i=>Math.max(0,i-1))}
     if(e.key==='Enter'&&open&&filtered[active]){e.preventDefault();pick(filtered[active].id)}
    }}
   />
   <button type="button" aria-label="Show choices" disabled={disabled} onClick={()=>{setOpen(v=>!v);setQuery('');if(!open)onQuery?.('')}}>⌄</button>
  </div>
  {open&&!disabled&&<div className="hq-search-picker-menu" role="listbox" id={listId}>{optional&&<button type="button" className="hq-search-picker-option" onMouseDown={e=>e.preventDefault()} onClick={()=>pick('')}>No linked enquiry (standalone)</button>}{filtered.length?filtered.map((c,i)=><button type="button" role="option" aria-selected={c.id===value} key={c.id} className={'hq-search-picker-option'+(i===active?' is-active':'')} onMouseDown={e=>e.preventDefault()} onClick={()=>pick(c.id)}><strong>{c.label}</strong>{c.detail?<small>{c.detail}</small>:null}</button>):<p className="hq-search-picker-empty">No matches found</p>}</div>}
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
 const actionsRef=useRef<HTMLDetailsElement|null>(null);
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
 const enquiryLabel=(e:Enquiry)=>{
  const service=prettyServiceCategory(e.service_category)||e.service_category||'Enquiry';
  return `${e.name} · ${service}${e.suburb?` · ${e.suburb}`:''}`;
 };
 const linkedEnquiry=enquiries.find(e=>e.id===draft.enquiryId)||null;
 const addressLabel=(a:Address)=>[a.address_line1,a.suburb,a.state,a.postcode].filter(Boolean).join(', ');
 const [,setCustomerSearch]=useState(customers.find(c=>c.id===initial?.customerId)?customerLabel(customers.find(c=>c.id===initial?.customerId)!):'');
 const [customerList,setCustomerList]=useState(customers);
 const [addressList,setAddressList]=useState(addresses);
 const customerSearchTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [newCustomer,setNewCustomer]=useState(false);
 const [customerForm,setCustomerForm]=useState({name:'',email:'',phone:''});
 const [customerBusy,setCustomerBusy]=useState(false);
 const [customerMatches,setCustomerMatches]=useState<CustomerMatchRecord[]>([]);
 const [customerConflict,setCustomerConflict]=useState<'single'|'multiple'|null>(null);
 const [,setEnquirySearch]=useState(enquiries.find(e=>e.id===initial?.enquiryId)?enquiryLabel(enquiries.find(e=>e.id===initial?.enquiryId)!):'');
 const [pending,start]=useTransition();
 const [busyAction,setBusyAction]=useState('');
 const [feedback,setFeedback]=useState('');
 const [toast,setToast]=useState<HqToastMessage|null>(null);
 const [dirty,setDirty]=useState(false);
 const [parentQuery,setParentQuery]=useState('');
 const [jobSearchId,setJobSearchId]=useState('');
 const [menuOpen,setMenuOpen]=useState(false);
 const [collapsedLines,setCollapsedLines]=useState<Record<number,boolean>>({});
 const parents=normalizeParentOptions(parentOptions as ParentQuoteOption[]);
 const markDirty=()=>setDirty(true);
 const set=(key:keyof QuoteDraft,value:unknown)=>{markDirty();setDraft(d=>({...d,[key]:value}));};
 const showToast=(tone:HqToastMessage['tone'],text:string)=>setToast({id:Date.now(),tone,text});
 const editLine=(i:number,key:string,value:unknown)=>{markDirty();setDraft(d=>({...d,lines:d.lines.map((l,j)=>j===i?{...l,[key]:value}:l)}));};
 const visibleLines=draft.lines.filter(l=>draft.mode==='fixed'?isFixed(l):!isFixed(l));
 const subtotal=visibleLines.reduce((s,l)=>s+quoteLineExGstCents(l.quantity,l.price),0);
 const gst=visibleLines.reduce((s,l)=>s+quoteLineGstCents(l.quantity,l.price,l.gst),0);
 const estimatedCost=visibleLines.reduce((s,l)=>s+(l.cost===null?0:Math.round(l.quantity*l.cost)),0);
 const hasMissingCosts=visibleLines.some(l=>l.cost===null);
 const hasInvalidLines=draft.lines.some(l=>!l.description.trim()||!Number.isFinite(l.quantity)||l.quantity<=0||!Number.isFinite(l.price)||l.price<0);
 const [fixedIncludesGst,setFixedIncludesGst]=useState(false);
 const remapCollapsedLines=(removedIndex:number)=>{
  setCollapsedLines(prev=>{
   const next:Record<number,boolean>={};
   for(const [key,value] of Object.entries(prev)){
    const idx=Number(key);
    if(!value||idx===removedIndex)continue;
    next[idx>removedIndex?idx-1:idx]=true;
   }
   return next;
  });
 };
 const toggleLineCollapsed=(i:number)=>setCollapsedLines(prev=>({...prev,[i]:!prev[i]}));
 const addLine=(category='other')=>{
  const nextLines=[...draft.lines,{description:'',category,quantity:1,unit:category==='labour'?'hour':'each',price:0,cost:null,gst:true}];
  set('lines',nextLines);
  setCollapsedLines(prev=>{
   const next={...prev};
   // Keep the new row expanded; collapse any previously expanded detailed rows for denser scrolling.
   for(let i=0;i<draft.lines.length;i++){
    if(draft.mode==='fixed'?isFixed(draft.lines[i]):!isFixed(draft.lines[i]))next[i]=true;
   }
   delete next[nextLines.length-1];
   return next;
  });
 };
 const removeLine=(i:number)=>{
  set('lines',draft.lines.filter((_,j)=>j!==i));
  remapCollapsedLines(i);
 };
 const parentLocked=Boolean(draft.id);
 const primaryJobId=jobContext?.jobId||associatedJobs[0]?.id||draft.linkedJobIds?.[0]||'';
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
 const canApproveNow=canApprove&&['draft','changes_requested','pending_approval'].includes(status);
 const associatedJobCount=new Set([
  ...associatedJobs.map(j=>j.id),
  ...pendingJobIds,
  ...(draft.linkedJobIds||[]),
 ]).size;
 const customerChangeBlocked=Boolean(draft.id)&&associatedJobCount>0;

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

 useEffect(()=>{
  if(!dirty||locked)return;
  const onBeforeUnload=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};
  window.addEventListener('beforeunload',onBeforeUnload);
  return()=>window.removeEventListener('beforeunload',onBeforeUnload);
 },[dirty,locked]);

 useEffect(()=>{
  if(!menuOpen)return;
  const onPointer=(e:MouseEvent)=>{
   if(actionsRef.current&&!actionsRef.current.contains(e.target as Node)){
    actionsRef.current.open=false;
    setMenuOpen(false);
   }
  };
  const onKey=(e:KeyboardEvent)=>{
   if(e.key==='Escape'&&actionsRef.current){
    actionsRef.current.open=false;
    setMenuOpen(false);
   }
  };
  document.addEventListener('mousedown',onPointer);
  document.addEventListener('keydown',onKey);
  return()=>{
   document.removeEventListener('mousedown',onPointer);
   document.removeEventListener('keydown',onKey);
  };
 },[menuOpen]);

 useEffect(()=>{
  if(!newCustomer)return;
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!customerBusy){setNewCustomer(false);resetCustomerConflict()}};
  window.addEventListener('keydown',onKey);
  return()=>window.removeEventListener('keydown',onKey);
 },[newCustomer,customerBusy]);

 function resetCustomerConflict(){setCustomerMatches([]);setCustomerConflict(null)}
 function clearJobsForCustomerChange(){
  setPendingJobIds([]);
  setAssociatedJobs([]);
  setJobSearchId('');
 }
 function selectMatchedCustomer(match:CustomerMatchRecord){
  if(match.id!==draft.customerId){
   const gate=canChangePersistedQuoteCustomer({
    quoteIsPersisted:Boolean(draft.id),
    previousCustomerId:draft.customerId,
    nextCustomerId:match.id,
    associatedJobCount,
   });
   if(!gate.ok){
    setFeedback(gate.message||quoteCustomerChangeBlockedMessage());
    return;
   }
   clearJobsForCustomerChange();
  }
  setCustomerList(x=>x.some(c=>c.id===match.id)?x:[...x,match]);
  setDraft(d=>({
   ...d,
   customerId:match.id,
   enquiryId:'',
   addressId:'',
   address:'',
   parentQuoteId:match.id===d.customerId?d.parentQuoteId:'',
   linkedJobId:match.id===d.customerId?d.linkedJobId:'',
   linkedJobIds:reconcileLinkedJobsForCustomerChange({
    previousCustomerId:d.customerId,
    nextCustomerId:match.id,
    linkedJobIds:d.linkedJobIds||[],
   }),
  }));
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
    const gate=canChangePersistedQuoteCustomer({
     quoteIsPersisted:Boolean(draft.id),
     previousCustomerId:draft.customerId,
     nextCustomerId:result.customer.id,
     associatedJobCount,
    });
    if(!gate.ok){
     setFeedback(gate.message||quoteCustomerChangeBlockedMessage());
     return;
    }
    setCustomerList(x=>x.some(c=>c.id===result.customer!.id)?x:[...x,result.customer!]);
    clearJobsForCustomerChange();
    setDraft(d=>({
     ...d,
     customerId:result.customer!.id,
     enquiryId:'',
     addressId:'',
     address:'',
     parentQuoteId:'',
     linkedJobId:'',
     linkedJobIds:[],
    }));
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
   const result=await getParentQuotePrefill(parentId,draft.customerId||undefined);
   if(!result.ok||!result.prefill){
    setFeedback(result.message||'Unable to load parent quote.');
    return;
   }
   if(draft.customerId&&result.prefill.customerId&&result.prefill.customerId!==draft.customerId){
    setFeedback('Variation parent must belong to the same customer.');
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
  if(!nextCustomerId||nextCustomerId===draft.customerId)return true;
  const persistedGate=canChangePersistedQuoteCustomer({
   quoteIsPersisted:Boolean(draft.id),
   previousCustomerId:draft.customerId,
   nextCustomerId,
   associatedJobCount,
  });
  if(!persistedGate.ok){
   setFeedback(persistedGate.message||quoteCustomerChangeBlockedMessage());
   return false;
  }
  const hasJobs=associatedJobCount>0;
  const hasParent=draft.quoteType==='variation'&&Boolean(draft.parentQuoteId);
  if(hasParent||hasJobs){
   const parts=[
    hasParent?'clears the selected variation parent':'',
    hasJobs?'clears linked jobs from the previous customer':'',
   ].filter(Boolean).join(' and ');
   if(!window.confirm(`Changing the customer ${parts}. Continue?`))return false;
  }
  clearJobsForCustomerChange();
  setDraft(d=>({
   ...d,
   customerId:nextCustomerId,
   enquiryId:'',
   addressId:'',
   address:'',
   parentQuoteId:'',
   linkedJobId:'',
   linkedJobIds:reconcileLinkedJobsForCustomerChange({
    previousCustomerId:d.customerId,
    nextCustomerId,
    linkedJobIds:d.linkedJobIds||[],
   }),
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
  if(hasInvalidLines){setFeedback('Check item descriptions, quantities and prices before saving.');showToast('error','Check item descriptions, quantities and prices before saving.');return;}
  if(draft.quoteType==='variation'&&!draft.parentQuoteId){setFeedback('Select the quote this variation revises.');showToast('error','Select the quote this variation revises.');return;}
  if(approve&&!window.confirm('Approve this quote? It will be locked for editing and get a valid-until date.'))return;
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
    const autoTitle=resolveAutoTitle();
    const payload:QuoteDraft={
     ...draft,
     title:autoTitle,
     validityDays:draft.validityDays||30,
     parentQuoteId:draft.quoteType==='variation'?draft.parentQuoteId:'',
     linkedJobId:jobIds[0]||'',
     linkedJobIds:jobIds,
    };
    if(autoTitle!==draft.title)setDraft(d=>({...d,title:autoTitle}));
    const result=approve?await saveAndApproveQuote(payload):await saveQuoteDraft(payload);
    setFeedback(result.message);
    showToast(result.ok?'success':'error',result.message);
    if(result.ok)setDirty(false);
    if(!result.ok){
     if(result.id&&!draft.id)router.replace('/hq/quotes/'+result.id);
     else if(result.id)router.refresh();
     return;
    }
    if(result.ok&&result.id){
     const resolvedIntent:QuoteSaveIntent=
      intent==='exit'
        ?'exit'
        :intent==='return_to_job'&&!(primaryJobId||jobIds[0])?'return_to_quotes':intent;
     const returnHref=quoteEditorReturnHref({
      jobId:primaryJobId||jobIds[0]||null,
      intent:resolvedIntent,
      quoteId:result.id,
     });
     if(returnHref){
      router.push(returnHref);
      return;
     }
     if(!draft.id)router.replace('/hq/quotes/'+result.id);
     else router.refresh();
    }
   }catch{setFeedback('Unable to save. Try again.');showToast('error','Unable to save. Try again.');}
   finally{
    saveLock.current=false;
    setBusyAction('');
   }
  });
 }

 function runLifecycle(label:string,fn:()=>Promise<{ok:boolean;message:string}>,confirmText?:string){
  if(saveLock.current||pending)return;
  if(confirmText&&!window.confirm(confirmText))return;
  saveLock.current=true;
  setBusyAction(label);
  if(actionsRef.current)actionsRef.current.open=false;
  setMenuOpen(false);
  start(async()=>{
   try{
    const r=await fn();
    setFeedback(r.message);
    showToast(r.ok?'success':'error',r.message);
    router.refresh();
   }catch{setFeedback('Unable to update quote status.');showToast('error','Unable to update quote status.');}
   finally{
    saveLock.current=false;
    setBusyAction('');
   }
  });
 }

 const selectedCustomer=customerList.find(c=>c.id===draft.customerId)||customers.find(c=>c.id===draft.customerId)||null;
 const selectedCustomerName=selectedCustomer?.name?.trim()||'';
 const customerEmail=selectedCustomer?.email||'';
 const mailtoHref=draft.id
  ?`mailto:${customerEmail}?subject=${encodeURIComponent(`Quote ${initial?.number||''}`.trim())}&body=${encodeURIComponent(`Hi,\n\nPlease find our quotation ${initial?.number||''}.\n\nOpen the PDF preview from HQ Quotes, or reply to this email and we can send the PDF.\n\nThanks,\nExceptional Electrical`)}`
  :'';
 const resolveAutoTitle=()=>{
  if(selectedCustomerName)return selectedCustomerName.slice(0,200);
  const existing=draft.title.trim();
  if(existing)return existing.slice(0,200);
  return 'Quote';
 };
 const primaryLifecycle=
  canApproveNow&&locked
   ?{label:busyAction==='approve-saved'?'Approving…':'Approve',run:()=>runLifecycle('approve-saved',()=>approveQuote(draft.id!,draft.validityDays||30),'Approve this quote?')}
   :status==='approved'
    ?{label:busyAction==='sent'?'Saving…':'Mark as sent',run:()=>runLifecycle('sent',()=>markQuoteSent(draft.id!))}
    :status==='sent'
     ?{label:busyAction==='accepted'?'Saving…':'Mark as accepted',run:()=>runLifecycle('accepted',()=>markQuoteAccepted(draft.id!),'Mark this quote as accepted?')}
     :null;

 const saving=pending&&(busyAction==='save'||busyAction==='approve');
 const displayJobs=associatedJobs.length
  ?associatedJobs
  :pendingJobIds.map(id=>{
   const job=customerJobs.find(j=>j.id===id);
   return job||{id,jobNumber:null,title:'Pending link'};
  });

 const lineRows=draft.lines
  .map((l,i)=>({l,i}))
  .filter(({l})=>draft.mode==='fixed'?isFixed(l):!isFixed(l));

 return <main className="hq-detail hq-quote-builder-page hq-quote-workspace"><div className="hq-detail-inner">
  <header className="hq-qw-header">
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

   <div className="hq-qw-title-row">
    <div className="hq-qw-title-block">
     <h1 className={initial?.number?'hq-quote-ref':undefined}>{heading}</h1>
     {selectedCustomerName?<p className="hq-qw-customer-label">{selectedCustomerName}</p>:null}
     <div className="hq-qw-meta">
      <span className="hq-status hq-qw-status">{statusLabel(status)}</span>
      {dirty&&!locked?<span className="hq-quote-dirty-chip" role="status">Unsaved changes</span>:null}
      {commercial?.parentQuoteNumber?(
       <span className="hq-qw-meta-text">Rev of <strong>{commercial.parentQuoteNumber}</strong>{(commercial.revisionNumber||0)>0?` · ${commercial.revisionNumber}`:''}</span>
      ):null}
      {commercial?.isCommercialCurrent?<span className="hq-quote-current-chip">Current commercial</span>:null}
     </div>
    </div>
    <div className="hq-qw-header-actions">
     {primaryLifecycle?(
      <button type="button" className="hq-detail-action-primary" disabled={pending} onClick={primaryLifecycle.run} style={{border:0,cursor:'pointer'}}>
       {primaryLifecycle.label}
      </button>
     ):null}
     {draft.id?(
      <div className="hq-qw-view-switch" role="navigation" aria-label="Quote views">
       <span className="is-active" aria-current="page">Quote details</span>
       <Link href={`/hq/quotes/${draft.id}/preview`} target="_blank" rel="noopener noreferrer">PDF preview</Link>
      </div>
     ):null}
     {draft.id?(
      <details
       className="hq-qw-actions-menu"
       ref={actionsRef}
       onToggle={e=>setMenuOpen((e.target as HTMLDetailsElement).open)}
      >
       <summary aria-label="More quote actions">Actions</summary>
       <div className="hq-qw-actions-panel" role="menu">
        <Link role="menuitem" href={`/hq/quotes/${draft.id}/preview`} target="_blank" rel="noopener noreferrer">PDF preview</Link>
        <a role="menuitem" href={`/hq/quotes/${draft.id}/pdf`} download>Download PDF</a>
        {customerEmail?(
         <a role="menuitem" href={mailtoHref}>Email customer (mailto)</a>
        ):(
         <button type="button" role="menuitem" disabled title="Add a customer email first">Email customer (mailto)</button>
        )}
        {displayJobs.length===1?(
         <Link role="menuitem" href={`/hq/jobs/${displayJobs[0].id}`}>View job</Link>
        ):displayJobs.length>1?(
         <button type="button" role="menuitem" onClick={()=>document.getElementById('qw-jobs')?.scrollIntoView({behavior:'smooth',block:'start'})}>Linked jobs</button>
        ):null}
        {['approved','sent','accepted'].includes(status)?(
         <Link role="menuitem" href={'/hq/jobs/new?quote='+draft.id}>{displayJobs.length?'Create another job':'Create job'}</Link>
        ):null}
        {canApproveNow&&locked?(
         <button type="button" role="menuitem" disabled={pending} onClick={()=>runLifecycle('approve-saved',()=>approveQuote(draft.id!,draft.validityDays||30),'Approve this quote?')}>
          {busyAction==='approve-saved'?'Approving…':'Approve saved quote'}
         </button>
        ):null}
        {status==='approved'?(
         <button type="button" role="menuitem" disabled={pending} onClick={()=>runLifecycle('sent',()=>markQuoteSent(draft.id!))}>
          {busyAction==='sent'?'Saving…':'Mark as sent'}
         </button>
        ):null}
        {(status==='approved'||status==='sent')?(
         <button type="button" role="menuitem" disabled={pending} onClick={()=>runLifecycle('accepted',()=>markQuoteAccepted(draft.id!),'Mark this quote as accepted?')}>
          {busyAction==='accepted'?'Saving…':'Mark as accepted'}
         </button>
        ):null}
        {(status==='approved'||status==='sent')?(
         <button type="button" role="menuitem" disabled={pending} onClick={()=>runLifecycle('declined',()=>markQuoteDeclined(draft.id!),'Mark this quote as declined?')}>
          {busyAction==='declined'?'Saving…':'Mark as declined'}
         </button>
        ):null}
        {canOfferMakeCurrent?(
         <button type="button" role="menuitem" disabled={pending} onClick={()=>runLifecycle('current',()=>makeQuoteCommercialCurrent(draft.id!),'Make this the current commercial quote?')}>
          {busyAction==='current'?'Updating…':'Make current commercial'}
         </button>
        ):null}
       </div>
      </details>
     ):null}
    </div>
   </div>
   {feedback&&draft.id&&locked?<p className="hq-qw-feedback" role="status">{feedback}</p>:null}
   {status==='approved'&&!feedback?<p className="hq-quote-lifecycle-hint">“Mark as sent” records that the quote was issued. It does not email the customer — use Email customer (mailto) or Download PDF.</p>:null}
  </header>

  <fieldset disabled={locked||pending} className="hq-qw-fieldset">
   <div className="hq-quote-editor hq-qw-editor">

    <section className="hq-qw-section" aria-labelledby="qw-customer-heading">
     <div className="hq-qw-section-head">
      <div>
       <div className="hq-kicker">CUSTOMER</div>
       <h2 id="qw-customer-heading">Customer &amp; site</h2>
      </div>
      <div className="hq-qw-type-inline" role="radiogroup" aria-label="Standard quote or variation">
       <label className={draft.quoteType!=='variation'?'is-active':''}>
        <input type="radio" name="quoteType" disabled={parentLocked} checked={draft.quoteType!=='variation'} onChange={()=>setDraft(d=>({...d,quoteType:'standard',parentQuoteId:''}))}/>
        Standard
       </label>
       <label className={draft.quoteType==='variation'?'is-active':''}>
        <input type="radio" name="quoteType" disabled={parentLocked} checked={draft.quoteType==='variation'} onChange={()=>setDraft(d=>({...d,quoteType:'variation'}))}/>
        Variation
       </label>
      </div>
     </div>

     <div className="hq-qw-grid-2">
      <div className="hq-qw-customer-field">
       <label>Customer
        <SearchPicker
         value={draft.customerId}
         placeholder="Search name, phone or email"
         choices={customerList.map(c=>({id:c.id,label:c.name,detail:c.phone||c.email||''}))}
         onQuery={(q)=>{
          if(customerSearchTimer.current)clearTimeout(customerSearchTimer.current);
          customerSearchTimer.current=setTimeout(()=>{
           void searchQuoteCustomers(q).then(rows=>{
            setCustomerList(prev=>{
             const byId=new Map(prev.map(c=>[c.id,c]));
             for(const row of rows)byId.set(row.id,row);
             return [...byId.values()];
            });
           });
          },220);
         }}
         onSelect={id=>{
          if(handleCustomerChange(id)){
           setEnquirySearch('');
           resetCustomerConflict();
           if(id){
            void loadCustomerAddressesForQuote(id).then(rows=>{
             setAddressList(prev=>{
              const others=prev.filter(a=>a.customer_id!==id);
              const next=rows.map(a=>({
               id:a.id,
               customer_id:a.customer_id,
               label:a.label||'',
               address_line1:a.address_line1,
               suburb:a.suburb||'',
               state:a.state||'',
               postcode:a.postcode||'',
              }));
              return [...others,...next];
             });
            });
           }
          }
         }}
        />
       </label>
       {!locked&&!customerChangeBlocked?(
        <button type="button" className="hq-qw-link-btn" onClick={()=>{setNewCustomer(true);resetCustomerConflict();setFeedback('')}}>
         + New customer
        </button>
       ):null}
      </div>
      <label>Job site address
       <input
        list="quote-addresses"
        placeholder="Saved address or type a new site"
        value={draft.address}
        onChange={e=>{
         const value=e.target.value;
         const match=addressList.filter(a=>a.customer_id===draft.customerId).find(a=>addressLabel(a)===value);
         setDraft(d=>({...d,address:value,addressId:match?.id||''}));
        }}
       />
       <datalist id="quote-addresses">{addressList.filter(a=>a.customer_id===draft.customerId).map(a=><option key={a.id} value={addressLabel(a)}/>)}</datalist>
      </label>
     </div>
     {customerChangeBlocked?(
      <p className="hq-quote-field-hint hq-qw-warn" role="status">{quoteCustomerChangeBlockedMessage()}</p>
     ):null}

     <div className="hq-qw-optional-block">
      <div className="hq-qw-optional-head">
       <h3>Optional links</h3>
       <span className="hq-quote-optional">Enquiry and jobs are optional</span>
      </div>

      {draft.quoteType==='variation'?(
       <div className="hq-quote-parent-picker hq-qw-parent">
        <label className="hq-quote-parent-label">Parent quote
         <input
          type="search"
          placeholder={draft.customerId?'Search EEQ number or title':'Select a customer first'}
          value={parentQuery}
          disabled={parentLocked||!draft.customerId||busyAction==='prefill'}
          onChange={e=>setParentQuery(e.target.value)}
         />
        </label>
        <label className="hq-visually-hidden" htmlFor="qw-parent-select">Select parent quote</label>
        <select
         id="qw-parent-select"
         value={draft.parentQuoteId||''}
         disabled={parentLocked||!draft.customerId||busyAction==='prefill'}
         onChange={e=>void selectParent(e.target.value)}
        >
         <option value="">{draft.customerId?'Select parent quote':'Select a customer first'}</option>
         {parentGroups.map(group=>(
          <optgroup key={group.key} label={group.label}>
           {group.quotes.map(p=>(
            <option key={p.id} value={p.id}>
             {p.quoteNumber}{p.title?` · ${p.title}`:''} · {statusLabel(p.status)}
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

      <div className="hq-qw-links-row">
       <label className="hq-qw-enquiry">Linked enquiry
        <SearchPicker
         value={draft.enquiryId}
         placeholder="Search customer or service"
         optional
         choices={enquiries.filter(e=>!draft.customerId||!e.customer_id||e.customer_id===draft.customerId).map(e=>({id:e.id,label:enquiryLabel(e),detail:prettyServiceCategory(e.service_category)||'Enquiry'}))}
         onSelect={id=>{
          const source=enquiries.find(e=>e.id===id);
          const scope=source?stripEnquiryMetaForQuoteScope(source.message):'';
          setDraft(d=>({
           ...d,
           enquiryId:id,
           customerId:source?.customer_id||d.customerId,
           scope:d.scope.trim()?d.scope:scope,
          }));
         }}
        />
       </label>

       <div id="qw-jobs" className="hq-qw-jobs">
        <div className="hq-qw-jobs-head">
         <h3>Linked jobs</h3>
         <span className="hq-quote-optional">Same customer</span>
        </div>
        {displayJobs.length?(
         <ul className="hq-linked-job-list hq-qw-job-chips">
          {displayJobs.map(job=>{
           const pendingLink=!draft.id&&pendingJobIds.includes(job.id);
           return (
            <li key={job.id}>
             <div>
              <strong>{job.jobNumber||job.id.slice(0,8)}</strong>
              <span>{job.title||'Untitled job'}{pendingLink?' · pending':''}</span>
             </div>
             <div className="hq-linked-job-actions">
              <Link href={`/hq/jobs/${job.id}`}>View</Link>
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
           placeholder="Add a job for this customer"
           choices={availableJobs.map(j=>({id:j.id,label:j.jobNumber||j.id.slice(0,8),detail:j.title||''}))}
           onSelect={id=>{setJobSearchId(id);if(id)addPendingJob(id)}}
          />
         </div>
        ):!draft.customerId?<p className="hq-quote-field-hint">Select a customer before linking jobs.</p>:null}
       </div>
      </div>
     </div>
    </section>

    <section className="hq-qw-section" aria-labelledby="qw-scope-heading">
     <div className="hq-qw-section-head">
      <div>
       <div className="hq-kicker">SCOPE</div>
       <h2 id="qw-scope-heading">Description</h2>
      </div>
     </div>
     <label>Description
      <textarea rows={3} value={draft.scope} onChange={e=>set('scope',e.target.value)} placeholder="What the customer is getting done"/>
      {linkedEnquiry?<span className="hq-quote-field-hint">From enquiry · {enquiryLabel(linkedEnquiry)}. Intake metadata is stripped for customer-facing wording.</span>:null}
     </label>
     <details className="hq-quote-optional-details" open={Boolean(initial?.inclusions||initial?.exclusions)}>
      <summary>Inclusions &amp; exclusions <span className="hq-quote-optional">(optional)</span></summary>
      <label>Inclusions<textarea rows={2} value={draft.inclusions} onChange={e=>set('inclusions',e.target.value)}/></label>
      <label>Exclusions<textarea rows={2} value={draft.exclusions} onChange={e=>set('exclusions',e.target.value)}/></label>
     </details>
    </section>

    <section className="hq-qw-section" aria-labelledby="qw-pricing-heading">
     <div className="hq-qw-section-head">
      <div>
       <div className="hq-kicker">PRICING</div>
       <h2 id="qw-pricing-heading">Line items</h2>
      </div>
      <div className="hq-qw-pricing-controls">
       <label className="hq-qw-compact-label">Pricing
        <select value={draft.mode} onChange={e=>{
         const mode=e.target.value;
         setDraft(d=>({...d,mode,lines:mode==='fixed'&&!d.lines.some(isFixed)?[...d.lines,{description:FIXED,category:'other',quantity:1,unit:'each',price:0,cost:null,gst:true}]:d.lines}));
        }}>
         <option value="detailed">Detailed</option>
         <option value="fixed">Fixed price</option>
         <option value="mixed">Mixed</option>
        </select>
       </label>
       <label className="hq-qw-compact-label">Presentation
        <select value={draft.display} onChange={e=>set('display',e.target.value)}>
         <option value="itemised">Itemised</option>
         <option value="total_only">Total only</option>
        </select>
       </label>
      </div>
     </div>

     {draft.mode==='fixed'?(
      <div className="hq-quote-fixed">
       {(()=>{
        const l=draft.lines.find(isFixed);
        const i=draft.lines.findIndex(isFixed);
        const amount=l?.price||0;
        const includes=fixedIncludesGst&&l?.gst;
        return <>
         <div className="hq-qw-grid-2">
          <label>Fixed quote amount (AUD)
           <input type="number" min="0" step=".01" placeholder="Enter fixed amount" value={amount?String((includes?Math.round(amount*1.1):amount)/100):''} onFocus={e=>e.currentTarget.select()} onChange={e=>{const raw=Math.max(0,Math.round(Number(e.target.value)*100));editLine(i,'price',includes?Math.round(raw/1.1):raw)}}/>
          </label>
          <label>Estimated internal job cost (AUD)
           <input type="number" min="0" step=".01" placeholder="Optional" value={l?.cost==null||l.cost===0?'':String(l.cost/100)} onFocus={e=>e.currentTarget.select()} onChange={e=>editLine(i,'cost',e.target.value===''?null:Math.round(Number(e.target.value)*100))}/>
          </label>
         </div>
         <label className="hq-quote-gst"><input type="checkbox" checked={l?.gst??true} onChange={e=>editLine(i,'gst',e.target.checked)}/> GST applies (10%)</label>
         {l?.gst&&<label className="hq-quote-gst"><input type="checkbox" checked={fixedIncludesGst} onChange={e=>setFixedIncludesGst(e.target.checked)}/> Entered amount includes GST</label>}
         <p className="hq-quote-fixed-note">A single fixed-price line is saved for the customer quote. Detailed line items are retained if you switch pricing modes.</p>
         {l?.cost!==null&&<p className="hq-quote-profit">Estimated gross profit (ex GST): <strong>{money(amount-(l?.cost||0))}</strong></p>}
        </>;
       })()}
      </div>
     ):(
      <>
       <div className="hq-qw-lines">
        <div className="hq-qw-lines-head" aria-hidden="true">
         <span>Description</span>
         <span>Cat</span>
         <span>Qty</span>
         <span>Unit</span>
         <span>Price</span>
         <span>Cost</span>
         <span>GST</span>
         <span>Amount</span>
         <span/>
        </div>
        {lineRows.map(({l,i})=>{
         const collapsed=Boolean(collapsedLines[i]);
         const amount=money(quoteLineExGstCents(l.quantity,l.price));
         const summaryLabel=l.description.trim()||`Item ${i+1}`;
         return (
         <div key={i} className={'hq-qw-line-row'+(collapsed?' is-collapsed':'')}>
          {collapsed?(
           <>
            <button
             type="button"
             className="hq-qw-line-summary"
             aria-expanded={false}
             aria-label={`Expand item ${i+1}: ${summaryLabel}`}
             onClick={()=>toggleLineCollapsed(i)}
            >
             <span className="hq-qw-line-chevron" aria-hidden="true">›</span>
             <span className="hq-qw-line-summary-main">
              <strong>{summaryLabel}</strong>
              <small>{l.category} · {l.quantity||0} {l.unit||'each'}</small>
             </span>
             <span className="hq-qw-line-summary-amount">{amount}</span>
            </button>
            <button type="button" className="hq-qw-line-remove" aria-label={`Remove item ${i+1}`} onClick={()=>removeLine(i)}>×</button>
           </>
          ):(
           <>
            <button
             type="button"
             className="hq-qw-line-collapse"
             aria-expanded={true}
             aria-label={`Minimize item ${i+1}`}
             onClick={()=>toggleLineCollapsed(i)}
            >
             <span aria-hidden="true">⌃</span>
            </button>
            <label className="hq-qw-line-desc">
             <span className="hq-qw-mobile-label">Description</span>
             <input
              aria-label={`Item ${i+1} description`}
              value={l.description}
              placeholder="Description"
              onChange={e=>editLine(i,'description',e.target.value)}
              onKeyDown={e=>{
               if(e.key==='Enter'){e.preventDefault();(e.currentTarget.closest('.hq-qw-line-row')?.querySelector('.hq-qw-line-qty') as HTMLInputElement|null)?.focus()}
              }}
             />
            </label>
            <label>
             <span className="hq-qw-mobile-label">Category</span>
             <select aria-label={`Item ${i+1} category`} value={l.category} onChange={e=>editLine(i,'category',e.target.value)}>
              {['labour','material','equipment','subcontractor','other'].map(x=><option key={x} value={x}>{x}</option>)}
             </select>
            </label>
            <label>
             <span className="hq-qw-mobile-label">Qty</span>
             <input
              className="hq-qw-line-qty"
              aria-label={`Item ${i+1} quantity`}
              type="number"
              min="0"
              step=".001"
              inputMode="decimal"
              value={l.quantity===0?'':l.quantity}
              placeholder="0"
              onFocus={e=>e.currentTarget.select()}
              onChange={e=>editLine(i,'quantity',e.target.value===''?0:Number(e.target.value))}
             />
            </label>
            <label>
             <span className="hq-qw-mobile-label">Unit</span>
             <input aria-label={`Item ${i+1} unit`} value={l.unit} onChange={e=>editLine(i,'unit',e.target.value)}/>
            </label>
            <label>
             <span className="hq-qw-mobile-label">Unit price</span>
             <input
              aria-label={`Item ${i+1} unit price AUD`}
              type="number"
              min="0"
              step=".01"
              inputMode="decimal"
              value={l.price===0?'':String(l.price/100)}
              onFocus={e=>e.currentTarget.select()}
              onChange={e=>editLine(i,'price',Math.round(Number(e.target.value)*100))}
             />
            </label>
            <label>
             <span className="hq-qw-mobile-label">Unit cost</span>
             <input
              aria-label={`Item ${i+1} internal unit cost AUD`}
              type="number"
              min="0"
              step=".01"
              inputMode="decimal"
              placeholder="—"
              value={l.cost===null||l.cost===0?'':String(l.cost/100)}
              onFocus={e=>e.currentTarget.select()}
              onChange={e=>editLine(i,'cost',e.target.value===''?null:Math.round(Number(e.target.value)*100))}
             />
            </label>
            <label className="hq-qw-line-gst">
             <span className="hq-qw-mobile-label">GST</span>
             <input aria-label={`Item ${i+1} GST`} type="checkbox" checked={l.gst} onChange={e=>editLine(i,'gst',e.target.checked)}/>
            </label>
            <div className="hq-qw-line-amount" aria-live="polite">
             <span className="hq-qw-mobile-label">Amount</span>
             <strong>{amount}</strong>
            </div>
            <button type="button" className="hq-qw-line-remove" aria-label={`Remove item ${i+1}`} onClick={()=>removeLine(i)}>×</button>
           </>
          )}
         </div>
         );
        })}
        {!lineRows.length?<p className="hq-quote-field-hint">No line items yet. Add labour, materials or a custom item.</p>:null}
       </div>
       <div className="hq-quote-add-actions">
        <button type="button" className="hq-quote-button" onClick={()=>addLine()}>+ Custom item</button>
        <button type="button" onClick={()=>addLine('labour')}>+ Labour</button>
        <button type="button" onClick={()=>addLine('material')}>+ Material</button>
        <button type="button" onClick={()=>addLine('equipment')}>+ Equipment</button>
       </div>
      </>
     )}

     <div className="hq-quote-totals hq-qw-totals" aria-live="polite">
      <p><span>Subtotal</span> <strong>{money(subtotal)}</strong></p>
      <p><span>GST</span> <strong>{money(gst)}</strong></p>
      <p className="hq-qw-total"><span>Total inc GST</span> <strong>{money(subtotal+gst)}</strong></p>
     </div>
     {draft.mode!=='fixed'?(
      <details className="hq-quote-cost-summary">
       <summary>Internal costing — staff only</summary>
       <p><span>Estimated costs entered</span> <strong>{money(estimatedCost)}</strong></p>
       <p><span>Estimated gross profit (ex GST)</span> <strong>{money(subtotal-estimatedCost)}</strong></p>
       {hasMissingCosts&&<p className="hq-quote-cost-warning">Some items have no internal cost entered. Profit is incomplete until costs are added.</p>}
      </details>
     ):null}
    </section>

    <section className="hq-qw-section hq-quote-notes-panel" aria-labelledby="qw-notes-heading">
     <div className="hq-qw-section-head">
      <div>
       <div className="hq-kicker">DETAILS</div>
       <h2 id="qw-notes-heading">Validity &amp; notes</h2>
      </div>
     </div>
     <div className="hq-qw-notes-grid">
      <label className="hq-qw-validity">Valid for
       <select value={String(draft.validityDays||30)} onChange={e=>set('validityDays',Number(e.target.value))} disabled={locked}>
        <option value="14">14 days</option>
        <option value="30">30 days</option>
        <option value="60">60 days</option>
       </select>
       <span className="hq-quote-field-hint">Applied as Valid until when the quote is approved.</span>
      </label>
      <label>Customer-facing notes<textarea rows={3} value={draft.notes} onChange={e=>set('notes',e.target.value)}/></label>
      <label className="hq-qw-full">Internal notes (staff only)<textarea rows={2} value={draft.internalNotes} onChange={e=>set('internalNotes',e.target.value)}/></label>
     </div>
    </section>
   </div>
  </fieldset>

  {!locked&&(
   <div className="hq-quote-save hq-qw-footer" aria-busy={saving}>
    <div className="hq-qw-footer-actions">
     <button type="button" className="hq-quote-button" disabled={pending} onClick={()=>save(false,'continue')}>
      {busyAction==='save'?'Saving…':'Save & Continue'}
     </button>
     <button type="button" className="hq-quote-button hq-quote-button-secondary" disabled={pending} onClick={()=>save(false,'exit')}>
      {busyAction==='save'?'Saving…':'Save & Exit'}
     </button>
     {canApproveNow?(
      <button type="button" className="hq-quote-button hq-qw-approve" disabled={pending} onClick={()=>save(true,'continue')}>
       {busyAction==='approve'?'Working…':'Approve'}
      </button>
     ):null}
    </div>
    <span className="hq-qw-footer-status" role="status">{feedback||(dirty?'Unsaved changes':(draft.id?'Preview uses the last saved version.':''))}</span>
   </div>
  )}

  {newCustomer&&(
   <div className="hq-crm-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!customerBusy){setNewCustomer(false);resetCustomerConflict()}}}>
    <section role="dialog" aria-modal="true" aria-labelledby="hq-quote-new-customer" className="hq-crm-modal">
     <header className="hq-crm-modal-header">
      <div>
       <div className="hq-kicker">QUOTES</div>
       <h2 id="hq-quote-new-customer">Add customer</h2>
       <p>Create a customer and select them on this quote.</p>
      </div>
      <button type="button" aria-label="Close" className="hq-crm-close" disabled={customerBusy} onClick={()=>{setNewCustomer(false);resetCustomerConflict()}}>×</button>
     </header>
     <div className="hq-crm-form hq-crm-modal-form">
      <label className="hq-crm-full">Full name<input value={customerForm.name} autoFocus minLength={2} maxLength={150} onChange={e=>{setCustomerForm(x=>({...x,name:e.target.value}));resetCustomerConflict()}}/></label>
      <label>Email<input type="email" value={customerForm.email} maxLength={254} onChange={e=>{setCustomerForm(x=>({...x,email:e.target.value}));resetCustomerConflict()}}/></label>
      <label>Phone<input type="tel" value={customerForm.phone} maxLength={40} onChange={e=>{setCustomerForm(x=>({...x,phone:e.target.value}));resetCustomerConflict()}}/></label>
      <p className="hq-crm-hint hq-crm-full">Provide at least an email or phone number.</p>
      {customerConflict&&customerMatches.length>0&&(
       <div className="hq-crm-full hq-quote-customer-match" role="status">
        <p><strong>{customerConflict==='single'?'Existing customer found':'Multiple matching customers'}</strong></p>
        <p>{feedback}</p>
        <ul>{customerMatches.map(m=><li key={m.id}><strong>{m.name}</strong><span>{[m.phone,m.email].filter(Boolean).join(' · ')||'No contact details'}</span><button type="button" disabled={customerBusy} onClick={()=>selectMatchedCustomer(m)}>Select this customer</button></li>)}</ul>
        <button type="button" disabled={customerBusy} onClick={()=>addCustomer(true)}>{customerBusy?'Creating…':'Create separate customer anyway'}</button>
       </div>
      )}
      {feedback&&!customerConflict?<p className="hq-crm-full" role="status">{feedback}</p>:null}
      <div className="hq-crm-modal-footer hq-crm-full">
       <button type="button" className="hq-crm-button hq-crm-secondary" disabled={customerBusy} onClick={()=>{setNewCustomer(false);resetCustomerConflict()}}>Cancel</button>
       {!customerConflict&&<button type="button" className="hq-crm-button" disabled={customerBusy} onClick={()=>addCustomer(false)}>{customerBusy?'Creating…':'Create and select'}</button>}
      </div>
     </div>
    </section>
   </div>
  )}

  <HqToast toast={toast} onDismiss={()=>setToast(null)}/>
  <style>{`
   .hq-quote-dirty-chip{display:inline-flex;align-items:center;padding:4px 9px;border-radius:999px;background:#fff1db;color:#8c520b;font-size:12px;font-weight:750}
   .hq-quote-field-hint{display:block;margin-top:6px;color:#718294;font-size:12px;font-weight:500}
   .hq-qw-full{grid-column:1/-1}
  `}</style>
 </div>
 </main>;
}
