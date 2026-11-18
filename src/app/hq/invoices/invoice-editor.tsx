'use client';
import Link from 'next/link';
import {useEffect,useId,useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {ChevronRight,ChevronUp,MoreHorizontal} from 'lucide-react';
import {
  addInvoicePayment,
  approveInvoice,
  deleteEmptyInvoice,
  deleteInvoicePayment,
  loadCustomerAddressesForInvoice,
  loadCustomerJobsForInvoice,
  markInvoiceSent,
  saveAndApproveInvoice,
  saveInvoiceDraft,
  searchInvoiceCustomers,
  voidInvoice,
  type InvoiceDraft,
} from './actions';
import {createQuoteCustomer} from '../quotes/customer-action';
import HqToast, {type HqToastMessage} from '../hq-toast';
import {
  FIXED_INVOICE_LINE,
  formatAudFromCents,
  formatJobRef,
  invoiceAmountDueCents,
  invoiceBuilderHeading,
  invoicePaidCents,
  invoiceStatusLabel,
} from '@/lib/invoice-commercial';
import {quoteLineExGstCents,quoteLineGstCents} from '@/lib/quote-commercial';
import {defaultInvoiceTermsAndPayment} from '@/lib/business-profile';
import type {CustomerMatchRecord} from '@/lib/customer-match';

type Customer={id:string;name:string;email:string|null;phone:string|null};
type Address={id:string;customer_id:string;label:string;address_line1:string;suburb:string;state:string;postcode:string};
type JobOption={id:string;jobNumber:string|null;title:string|null;status?:string};
type JobContext={jobId:string;jobNumber?:string|null;jobTitle?:string|null};
type PaymentRow={
  id:string;
  amount_cents:number;
  payment_date:string;
  reference:string|null;
  payment_method:string;
  notes:string|null;
};
type Initial=Partial<Omit<InvoiceDraft,'lines'>> & {
  lines?:InvoiceDraft['lines'];
  number?:string;
  status?:string;
};

const empty:InvoiceDraft={
  customerId:'',jobId:'',quoteId:'',addressId:'',address:'',title:'',description:'',
  notes:'',internalNotes:'',termsAndPayment:defaultInvoiceTermsAndPayment(),
  display:'itemised',mode:'detailed',customerReference:'',issueDate:'',dueDate:'',lines:[],
};

const isFixed=(l:InvoiceDraft['lines'][number])=>l.category==='other'&&l.description===FIXED_INVOICE_LINE;
const money=(n:number)=>formatAudFromCents(n);
const addressLabel=(a:Address)=>[a.address_line1,a.suburb,a.state,a.postcode].filter(Boolean).join(', ');

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
        onChange={e=>{setQuery(e.target.value);setOpen(true);setActive(0);onQuery?.(e.target.value)}}
        onKeyDown={e=>{
          if(!open)return;
          if(e.key==='ArrowDown'){e.preventDefault();setActive(i=>Math.min(i+1,filtered.length-1))}
          if(e.key==='ArrowUp'){e.preventDefault();setActive(i=>Math.max(i-1,0))}
          if(e.key==='Enter'){e.preventDefault();const hit=filtered[active];if(hit)pick(hit.id);else if(optional&&!query.trim())pick('')}
          if(e.key==='Escape'){setOpen(false);setQuery('')}
        }}
      />
      {optional&&value?<button type="button" className="hq-search-picker-clear" disabled={disabled} onClick={()=>onSelect('')}>Clear</button>:null}
    </div>
    {open?<ul id={listId} role="listbox" className="hq-search-picker-list">
      {filtered.map((c,i)=>(
        <li key={c.id}>
          <button type="button" role="option" aria-selected={i===active} className={i===active?'is-active':undefined} onMouseDown={e=>e.preventDefault()} onClick={()=>pick(c.id)}>
            <strong>{c.label}</strong>{c.detail?<span>{c.detail}</span>:null}
          </button>
        </li>
      ))}
      {!filtered.length?<li className="hq-search-picker-empty">No matches</li>:null}
    </ul>:null}
  </div>;
}

export default function InvoiceEditor({
  canApprove,
  canDelete=false,
  locked=false,
  customers,
  addresses,
  jobs,
  payments=[],
  linkedQuoteNumber=null,
  jobContext=null,
  initial,
  nextInvoiceNumber,
}:{
  canApprove:boolean;
  canDelete?:boolean;
  locked?:boolean;
  customers:Customer[];
  addresses:Address[];
  jobs:JobOption[];
  payments?:PaymentRow[];
  linkedQuoteNumber?:string|null;
  jobContext?:JobContext|null;
  initial?:Initial;
  nextInvoiceNumber?:string;
}){
  const router=useRouter();
  const actionsRef=useRef<HTMLDetailsElement|null>(null);
  const customerSearchTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [pending,startTransition]=useTransition();
  const [draft,setDraft]=useState<InvoiceDraft>({
    ...empty,
    ...initial,
    lines:initial?.lines||[],
    termsAndPayment:initial?.termsAndPayment||defaultInvoiceTermsAndPayment(),
  });
  const [customerList,setCustomerList]=useState(customers);
  const [addressList,setAddressList]=useState(addresses);
  const [jobList,setJobList]=useState(jobs);
  const [toast,setToast]=useState<HqToastMessage|null>(null);
  const [busyAction,setBusyAction]=useState('');
  const [feedback,setFeedback]=useState('');
  const [dirty,setDirty]=useState(false);
  const [newCustomer,setNewCustomer]=useState(false);
  const [customerForm,setCustomerForm]=useState({name:'',email:'',phone:''});
  const [customerBusy,setCustomerBusy]=useState(false);
  const [customerMatches,setCustomerMatches]=useState<CustomerMatchRecord[]>([]);
  const [customerConflict,setCustomerConflict]=useState<'single'|'multiple'|null>(null);
  const [paymentForm,setPaymentForm]=useState({amount:'',date:'',reference:'',method:'bank_transfer'});
  const [collapsedLines,setCollapsedLines]=useState<Record<number,boolean>>({});
  const [collapseEnabled,setCollapseEnabled]=useState(false);
  const [fixedIncludesGst,setFixedIncludesGst]=useState(false);
  const [jobSearchId,setJobSearchId]=useState('');

  const status=initial?.status||'draft';
  const invoiceNumber=initial?.number||nextInvoiceNumber||'';
  const heading=invoiceBuilderHeading({invoiceNumber:initial?.number,isNew:!draft.id});
  const selectedCustomer=customerList.find(c=>c.id===draft.customerId)||null;
  const selectedCustomerName=selectedCustomer?.name||'';
  const linkedJob=jobList.find(j=>j.id===draft.jobId)||null;

  const visibleLines=draft.lines.filter(l=>draft.mode==='fixed'?isFixed(l):!isFixed(l));
  const subtotal=visibleLines.reduce((s,l)=>s+quoteLineExGstCents(l.quantity,l.price),0);
  const gst=visibleLines.reduce((s,l)=>s+quoteLineGstCents(l.quantity,l.price,l.gst),0);
  const estimatedCost=visibleLines.reduce((s,l)=>s+(l.cost===null?0:Math.round(l.quantity*l.cost)),0);
  const hasMissingCosts=visibleLines.some(l=>l.cost===null);
  const paid=invoicePaidCents(payments);
  const due=invoiceAmountDueCents({
    items:draft.lines.map(l=>({description:l.description,category:l.category,quantity:l.quantity,unit_price_cents:l.price,gst_applicable:l.gst})),
    payments,
    pricingMode:draft.mode,
    status,
  });
  const lineRows=draft.lines.map((l,i)=>({l,i})).filter(({l})=>draft.mode==='fixed'?isFixed(l):!isFixed(l));
  const canApproveNow=canApprove&&status==='draft';
  const saving=pending&&(busyAction==='save'||busyAction==='approve');

  const primaryAction=
    canApproveNow&&locked
      ?{kind:'button' as const,label:busyAction==='approve-saved'?'Approving…':'Approve',run:()=>void runLifecycle('approve-saved',()=>approveInvoice(draft.id!),'Approve this invoice?')}
      :status==='approved'
        ?{kind:'button' as const,label:busyAction==='sent'?'Saving…':'Mark as sent',run:()=>void runLifecycle('sent',()=>markInvoiceSent(draft.id!))}
        :null;

  useEffect(()=>{setCustomerList(customers)},[customers]);
  useEffect(()=>{setAddressList(addresses)},[addresses]);
  useEffect(()=>{setJobList(jobs)},[jobs]);
  useEffect(()=>{
    if(typeof window==='undefined'||!window.matchMedia)return;
    const mq=window.matchMedia('(max-width:900px)');
    const sync=()=>setCollapseEnabled(mq.matches);
    sync();
    mq.addEventListener('change',sync);
    return()=>mq.removeEventListener('change',sync);
  },[]);

  const markDirty=()=>setDirty(true);
  const set=<K extends keyof InvoiceDraft>(key:K,value:InvoiceDraft[K])=>{markDirty();setDraft(d=>({...d,[key]:value}))};
  const showToast=(tone:HqToastMessage['tone'],text:string)=>setToast({id:Date.now(),tone,text});
  const editLine=(i:number,key:string,value:unknown)=>{markDirty();setDraft(d=>({...d,lines:d.lines.map((l,j)=>j===i?{...l,[key]:value}:l)}))};
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
  const toggleLineCollapsed=(i:number)=>{
    if(!collapseEnabled)return;
    setCollapsedLines(prev=>({...prev,[i]:!prev[i]}));
  };
  const addLine=(category='other')=>{
    const nextLines=[...draft.lines,{description:'',category,quantity:1,unit:category==='labour'?'hour':'each',price:0,cost:null,gst:true}];
    set('lines',nextLines);
    if(!collapseEnabled)return;
    setCollapsedLines(prev=>{
      const next={...prev};
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

  const resetCustomerConflict=()=>{setCustomerConflict(null);setCustomerMatches([]);setFeedback('')};

  const runLifecycle=async(label:string,fn:()=>Promise<{ok:boolean;message:string}>,confirm?:string)=>{
    if(confirm&&!window.confirm(confirm))return;
    setBusyAction(label);
    try{
      const result=await fn();
      if(!result.ok){showToast('error',result.message);setFeedback(result.message);return}
      showToast('success',result.message);
      setFeedback(result.message);
      setDirty(false);
      startTransition(()=>router.refresh());
    }finally{
      setBusyAction('');
      if(actionsRef.current)actionsRef.current.open=false;
    }
  };

  const save=async(approve:boolean,intent:'continue'|'exit')=>{
    setBusyAction(approve?'approve':'save');
    setFeedback('');
    try{
      const result=approve?await saveAndApproveInvoice(draft):await saveInvoiceDraft(draft);
      if(!result.ok){showToast('error',result.message);setFeedback(result.message);return}
      showToast('success',result.message);
      setFeedback(result.message);
      setDirty(false);
      if(intent==='exit'){
        startTransition(()=>router.push('/hq/invoices'));
        return;
      }
      if(result.id&&!draft.id){
        startTransition(()=>router.replace('/hq/invoices/'+result.id));
      }else{
        startTransition(()=>router.refresh());
      }
    }finally{
      setBusyAction('');
    }
  };

  const addCustomer=async(allowDuplicate=false)=>{
    setCustomerBusy(true);
    try{
      const result=await createQuoteCustomer(customerForm.name,customerForm.email,customerForm.phone,allowDuplicate);
      if(!result.ok){
        if(result.conflict&&result.matches?.length){
          setCustomerConflict(result.conflict);
          setCustomerMatches(result.matches);
          setFeedback(result.message);
          return;
        }
        setFeedback(result.message);
        showToast('error',result.message);
        return;
      }
      if(result.id){
        setDraft(d=>({...d,customerId:result.id!}));
        setCustomerList(prev=>prev.some(c=>c.id===result.id)?prev:[...prev,{id:result.id!,name:customerForm.name,email:customerForm.email||null,phone:customerForm.phone||null}]);
        setNewCustomer(false);
        setCustomerForm({name:'',email:'',phone:''});
        resetCustomerConflict();
        markDirty();
        showToast('success',result.message||'Customer created');
      }
    }finally{
      setCustomerBusy(false);
    }
  };

  const selectMatchedCustomer=(match:CustomerMatchRecord)=>{
    setDraft(d=>({...d,customerId:match.id,jobId:d.customerId===match.id?d.jobId:'',quoteId:d.customerId===match.id?d.quoteId:''}));
    setCustomerList(prev=>prev.some(c=>c.id===match.id)?prev:[...prev,{id:match.id,name:match.name,email:match.email,phone:match.phone}]);
    setNewCustomer(false);
    resetCustomerConflict();
    markDirty();
    void loadCustomerAddressesForInvoice(match.id).then(rows=>setAddressList(prev=>{
      const others=prev.filter(a=>a.customer_id!==match.id);
      return [...others,...rows.map(a=>({...a,label:a.label||''}))];
    }));
    void loadCustomerJobsForInvoice(match.id).then(setJobList);
  };

  const crumbJob=jobContext||(linkedJob?{jobId:linkedJob.id,jobNumber:linkedJob.jobNumber,jobTitle:linkedJob.title}:null);

  return <main className="hq-detail hq-quote-builder-page hq-quote-workspace"><div className="hq-detail-inner">
    <header className="hq-qw-header">
      <nav className="hq-quote-breadcrumbs" aria-label="Breadcrumb">
        {crumbJob?.jobId?(
          <>
            <Link href="/hq/jobs">Jobs</Link>
            <span aria-hidden="true">/</span>
            <Link href={`/hq/jobs/${crumbJob.jobId}`}>{formatJobRef(crumbJob.jobNumber)||'Job'}</Link>
            <span aria-hidden="true">/</span>
            <Link href={`/hq/jobs/${crumbJob.jobId}?tab=invoices`}>Invoices</Link>
            <span aria-hidden="true">/</span>
            <span>{initial?.number||heading}</span>
          </>
        ):(
          <>
            <Link href="/hq/invoices">Invoices</Link>
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
            <span className="hq-status hq-qw-status">{invoiceStatusLabel(status)}</span>
            {dirty&&!locked?<span className="hq-quote-dirty-chip" role="status">Unsaved changes</span>:null}
            {invoiceNumber?<span className="hq-qw-meta-text">{invoiceNumber}</span>:null}
            {linkedJob?<span className="hq-qw-meta-text">{formatJobRef(linkedJob.jobNumber)||'Linked job'}</span>:null}
          </div>
        </div>
        {draft.id?(
          <details className="hq-qw-actions-menu" ref={actionsRef}>
            <summary aria-label="More invoice actions" title="More actions">
              <MoreHorizontal size={20} strokeWidth={2.2} aria-hidden="true"/>
            </summary>
            <div className="hq-qw-actions-panel" role="menu">
              <Link role="menuitem" href={`/hq/invoices/${draft.id}/preview`} target="_blank" rel="noopener noreferrer">PDF preview</Link>
              <a role="menuitem" href={`/hq/invoices/${draft.id}/pdf`} download>Download PDF</a>
              {draft.jobId?<Link role="menuitem" href={`/hq/jobs/${draft.jobId}`}>View job</Link>:null}
              {draft.quoteId?<Link role="menuitem" href={`/hq/quotes/${draft.quoteId}`}>View quote</Link>:null}
              {canApproveNow&&locked?(
                <button type="button" role="menuitem" disabled={pending} onClick={()=>void runLifecycle('approve-saved',()=>approveInvoice(draft.id!),'Approve this invoice?')}>
                  {busyAction==='approve-saved'?'Approving…':'Approve saved invoice'}
                </button>
              ):null}
              {(status==='approved'||status==='sent')?(
                <button type="button" role="menuitem" disabled={pending} onClick={()=>void runLifecycle('sent',()=>markInvoiceSent(draft.id!))}>
                  {busyAction==='sent'?'Saving…':'Mark as sent'}
                </button>
              ):null}
              {canDelete&&status==='draft'?(
                <button
                  type="button"
                  role="menuitem"
                  className="hq-qw-actions-danger"
                  disabled={pending}
                  onClick={()=>void runLifecycle('delete',async()=>{
                    const result=await deleteEmptyInvoice(draft.id!);
                    if(result.ok){router.push('/hq/invoices');router.refresh()}
                    return result;
                  },'Permanently delete this draft invoice?')}
                >
                  {busyAction==='delete'?'Deleting…':'Delete invoice'}
                </button>
              ):null}
              {status!=='void'&&status!=='paid'&&canApprove?(
                <button
                  type="button"
                  role="menuitem"
                  className="hq-qw-actions-danger"
                  disabled={pending}
                  onClick={()=>{
                    const reason=window.prompt('Void reason (optional)')||'';
                    void runLifecycle('void',()=>voidInvoice(draft.id!,reason));
                  }}
                >
                  {busyAction==='void'?'Voiding…':'Void invoice'}
                </button>
              ):null}
            </div>
          </details>
        ):null}
      </div>

      {(primaryAction||draft.id)?(
        <div className="hq-qw-header-actions">
          {primaryAction?(
            <button type="button" className="hq-detail-action-primary" disabled={pending} onClick={primaryAction.run} style={{border:0,cursor:'pointer'}}>
              {primaryAction.label}
            </button>
          ):null}
          {draft.id?(
            <div className="hq-qw-view-switch" role="navigation" aria-label="Invoice views">
              <span className="is-active" aria-current="page">Invoice details</span>
              <Link href={`/hq/invoices/${draft.id}/preview`} target="_blank" rel="noopener noreferrer">PDF preview</Link>
            </div>
          ):null}
        </div>
      ):null}
      {feedback&&draft.id&&locked?<p className="hq-qw-feedback" role="status">{feedback}</p>:null}
    </header>

    <div className={'hq-qw-fieldset'+(locked?' is-locked':'')}>
      <div className="hq-quote-editor hq-qw-editor">

        <section className="hq-qw-section" aria-labelledby="inv-customer-heading">
          <div className="hq-qw-section-head">
            <div>
              <div className="hq-kicker">CUSTOMER</div>
              <h2 id="inv-customer-heading">Customer &amp; site</h2>
            </div>
          </div>

          <div className="hq-qw-grid-2">
            <div className="hq-qw-customer-field">
              <label>Customer
                <SearchPicker
                  value={draft.customerId}
                  placeholder="Search name, phone or email"
                  disabled={locked}
                  choices={customerList.map(c=>({id:c.id,label:c.name,detail:c.phone||c.email||''}))}
                  onQuery={(q)=>{
                    if(customerSearchTimer.current)clearTimeout(customerSearchTimer.current);
                    customerSearchTimer.current=setTimeout(()=>{
                      void searchInvoiceCustomers(q).then(rows=>{
                        setCustomerList(prev=>{
                          const byId=new Map(prev.map(c=>[c.id,c]));
                          for(const row of rows)byId.set(row.id,row);
                          return [...byId.values()];
                        });
                      });
                    },220);
                  }}
                  onSelect={(id)=>{
                    setDraft(d=>({...d,customerId:id,jobId:id===d.customerId?d.jobId:'',quoteId:id===d.customerId?d.quoteId:''}));
                    markDirty();
                    if(id){
                      void loadCustomerAddressesForInvoice(id).then(rows=>setAddressList(prev=>{
                        const others=prev.filter(a=>a.customer_id!==id);
                        return [...others,...rows.map(a=>({...a,label:a.label||''}))];
                      }));
                      void loadCustomerJobsForInvoice(id).then(setJobList);
                    }
                  }}
                />
              </label>
              {!locked?(
                <button type="button" className="hq-qw-link-btn" onClick={()=>{setNewCustomer(true);resetCustomerConflict()}}>
                  + New customer
                </button>
              ):null}
            </div>
            <label>Job site address
              <input
                list="invoice-addresses"
                placeholder="Saved address or type a new site"
                value={draft.address}
                disabled={locked}
                onChange={e=>{
                  const value=e.target.value;
                  const match=addressList.filter(a=>a.customer_id===draft.customerId).find(a=>addressLabel(a)===value);
                  setDraft(d=>({...d,address:value,addressId:match?.id||''}));
                  markDirty();
                }}
              />
              <datalist id="invoice-addresses">{addressList.filter(a=>a.customer_id===draft.customerId).map(a=><option key={a.id} value={addressLabel(a)}/>)}</datalist>
            </label>
          </div>

          <label>Your reference / PO
            <input
              type="text"
              placeholder="Customer PO or order number"
              value={draft.customerReference||''}
              disabled={locked}
              maxLength={120}
              onChange={e=>set('customerReference',e.target.value)}
            />
          </label>

          <div className="hq-qw-optional-block">
            <div className="hq-qw-optional-head">
              <h3>Optional links</h3>
              <span className="hq-quote-optional">Job and quote are optional</span>
            </div>
            <div className="hq-qw-links-row">
              <div id="inv-jobs" className="hq-qw-jobs">
                <div className="hq-qw-jobs-head">
                  <h3>Linked job</h3>
                  <span className="hq-quote-optional">Same customer</span>
                </div>
                {draft.jobId&&linkedJob?(
                  <ul className="hq-linked-job-list hq-qw-job-chips">
                    <li>
                      <div>
                        <strong>{formatJobRef(linkedJob.jobNumber)||'Job'}</strong>
                        <span>{linkedJob.title||'Untitled job'}</span>
                      </div>
                      <div className="hq-linked-job-actions">
                        <Link href={`/hq/jobs/${draft.jobId}`}>View</Link>
                        {!locked?<button type="button" onClick={()=>{setDraft(d=>({...d,jobId:''}));markDirty()}}>Remove</button>:null}
                      </div>
                    </li>
                  </ul>
                ):!locked&&draft.customerId?(
                  <div className="hq-linked-job-add">
                    <SearchPicker
                      value={jobSearchId}
                      placeholder="Add a job for this customer"
                      choices={jobList.filter(j=>j.id!==draft.jobId).map(j=>({id:j.id,label:formatJobRef(j.jobNumber)||'Job',detail:j.title||''}))}
                      onSelect={(id)=>{setJobSearchId('');if(id){setDraft(d=>({...d,jobId:id}));markDirty()}}}
                    />
                  </div>
                ):(
                  <p className="hq-quote-field-hint">{draft.customerId?'No job linked yet.':'Select a customer before linking a job.'}</p>
                )}
              </div>
              <div className="hq-qw-enquiry">
                <div className="hq-qw-jobs-head">
                  <h3>Linked quote</h3>
                  <span className="hq-quote-optional">Optional</span>
                </div>
                {draft.quoteId?(
                  <ul className="hq-linked-job-list hq-qw-job-chips">
                    <li>
                      <div>
                        <strong>{linkedQuoteNumber||'Quote'}</strong>
                        <span>Commercial source</span>
                      </div>
                      <div className="hq-linked-job-actions">
                        <Link href={`/hq/quotes/${draft.quoteId}`}>View</Link>
                        {!locked?<button type="button" onClick={()=>set('quoteId','')}>Remove</button>:null}
                      </div>
                    </li>
                  </ul>
                ):(
                  <p className="hq-quote-field-hint">No quote linked. Create from a job to seed from the commercial-current quote.</p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="hq-qw-section" aria-labelledby="inv-scope-heading">
          <div className="hq-qw-section-head">
            <div>
              <div className="hq-kicker">DETAILS</div>
              <h2 id="inv-scope-heading">Description</h2>
            </div>
          </div>
          <label>Title
            <input disabled={locked} value={draft.title} onChange={e=>set('title',e.target.value)} placeholder="Short invoice title"/>
          </label>
          <label>Description
            <textarea disabled={locked} rows={3} value={draft.description} onChange={e=>set('description',e.target.value)} placeholder="What this invoice covers"/>
          </label>
          <div className="hq-qw-grid-2">
            <label>Invoice date
              <input type="date" disabled={locked} value={draft.issueDate} onChange={e=>set('issueDate',e.target.value)}/>
            </label>
            <label>Due date
              <input type="date" disabled={locked} value={draft.dueDate} onChange={e=>set('dueDate',e.target.value)}/>
            </label>
          </div>
        </section>

        <section className="hq-qw-section" aria-labelledby="inv-pricing-heading">
          <div className="hq-qw-section-head">
            <div>
              <div className="hq-kicker">PRICING</div>
              <h2 id="inv-pricing-heading">Line items</h2>
            </div>
            <div className="hq-qw-pricing-controls">
              <label className="hq-qw-compact-label">Pricing
                <select disabled={locked} value={draft.mode} onChange={e=>{
                  const mode=e.target.value;
                  setDraft(d=>({
                    ...d,
                    mode,
                    lines:mode==='fixed'&&!d.lines.some(isFixed)
                      ?[...d.lines,{description:FIXED_INVOICE_LINE,category:'other',quantity:1,unit:'each',price:0,cost:null,gst:true}]
                      :d.lines,
                  }));
                  markDirty();
                }}>
                  <option value="detailed">Detailed</option>
                  <option value="fixed">Fixed price</option>
                  <option value="mixed">Mixed</option>
                </select>
              </label>
              <label className="hq-qw-compact-label">Presentation
                <select disabled={locked} value={draft.display} onChange={e=>set('display',e.target.value)}>
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
                    <label>Fixed invoice amount (AUD)
                      <input
                        type="number"
                        min="0"
                        step=".01"
                        disabled={locked}
                        placeholder="Enter fixed amount"
                        value={amount?String((includes?Math.round(amount*1.1):amount)/100):''}
                        onFocus={e=>e.currentTarget.select()}
                        onChange={e=>{
                          const raw=Math.max(0,Math.round(Number(e.target.value)*100));
                          editLine(i,'price',includes?Math.round(raw/1.1):raw);
                        }}
                      />
                    </label>
                    <label>Estimated internal job cost (AUD)
                      <input
                        type="number"
                        min="0"
                        step=".01"
                        disabled={locked}
                        placeholder="Optional"
                        value={l?.cost==null||l.cost===0?'':String(l.cost/100)}
                        onFocus={e=>e.currentTarget.select()}
                        onChange={e=>editLine(i,'cost',e.target.value===''?null:Math.round(Number(e.target.value)*100))}
                      />
                    </label>
                  </div>
                  <label className="hq-quote-gst">
                    <input type="checkbox" disabled={locked} checked={l?.gst??true} onChange={e=>editLine(i,'gst',e.target.checked)}/> GST applies (10%)
                  </label>
                  {l?.gst?(
                    <label className="hq-quote-gst">
                      <input type="checkbox" disabled={locked} checked={fixedIncludesGst} onChange={e=>setFixedIncludesGst(e.target.checked)}/> Entered amount includes GST
                    </label>
                  ):null}
                  <p className="hq-quote-fixed-note">A single fixed-price line is saved for the customer invoice. Detailed line items are retained if you switch pricing modes.</p>
                  {l?.cost!==null?<p className="hq-quote-profit">Estimated gross profit (ex GST): <strong>{money(amount-(l?.cost||0))}</strong></p>:null}
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
                  <span className="hq-qw-head-gst">GST</span>
                  <span>Amount</span>
                  <span/>
                </div>
                {lineRows.map(({l,i})=>{
                  const collapsed=collapseEnabled&&Boolean(collapsedLines[i]);
                  const amountEx=quoteLineExGstCents(l.quantity,l.price);
                  const amountInc=amountEx+quoteLineGstCents(l.quantity,l.price,l.gst);
                  const amount=money(amountEx);
                  const customerPrice=money(amountInc);
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
                            onClick={e=>{e.preventDefault();e.stopPropagation();toggleLineCollapsed(i)}}
                          >
                            <span className="hq-qw-line-chevron" aria-hidden="true"><ChevronRight size={18} strokeWidth={2.2}/></span>
                            <span className="hq-qw-line-summary-main"><strong>{summaryLabel}</strong></span>
                            <span className="hq-qw-line-summary-amount">{customerPrice}</span>
                          </button>
                          {!locked?(
                            <button type="button" className="hq-qw-line-remove" aria-label={`Remove item ${i+1}`} onClick={()=>removeLine(i)}>×</button>
                          ):null}
                        </>
                      ):(
                        <>
                          <div className="hq-qw-line-top">
                            <button
                              type="button"
                              className="hq-qw-line-collapse"
                              aria-expanded={true}
                              aria-label={`Minimize item ${i+1}`}
                              onClick={e=>{e.preventDefault();e.stopPropagation();toggleLineCollapsed(i)}}
                            >
                              <ChevronUp size={18} strokeWidth={2.2} aria-hidden="true"/>
                            </button>
                            <label className="hq-qw-line-desc">
                              <span className="hq-qw-mobile-label">Description</span>
                              <input
                                aria-label={`Item ${i+1} description`}
                                disabled={locked}
                                value={l.description}
                                placeholder="Description"
                                onChange={e=>editLine(i,'description',e.target.value)}
                                onKeyDown={e=>{
                                  if(e.key==='Enter'){e.preventDefault();(e.currentTarget.closest('.hq-qw-line-row')?.querySelector('.hq-qw-line-qty') as HTMLInputElement|null)?.focus()}
                                }}
                              />
                            </label>
                            {!locked?(
                              <button type="button" className="hq-qw-line-remove" aria-label={`Remove item ${i+1}`} onClick={()=>removeLine(i)}>×</button>
                            ):<span/>}
                          </div>
                          <label className="hq-qw-line-cat">
                            <span className="hq-qw-mobile-label">Category</span>
                            <select aria-label={`Item ${i+1} category`} disabled={locked} value={l.category} onChange={e=>editLine(i,'category',e.target.value)}>
                              {['labour','material','equipment','subcontractor','other'].map(x=><option key={x} value={x}>{x}</option>)}
                            </select>
                          </label>
                          <div className="hq-qw-line-pair hq-qw-line-pair-qty">
                            <label className="hq-qw-line-qty-field">
                              <span className="hq-qw-mobile-label">Qty</span>
                              <input
                                className="hq-qw-line-qty"
                                aria-label={`Item ${i+1} quantity`}
                                type="number"
                                min="0"
                                step=".001"
                                inputMode="decimal"
                                disabled={locked}
                                value={l.quantity===0?'':l.quantity}
                                placeholder="0"
                                onFocus={e=>e.currentTarget.select()}
                                onChange={e=>editLine(i,'quantity',e.target.value===''?0:Number(e.target.value))}
                              />
                            </label>
                            <label className="hq-qw-line-unit">
                              <span className="hq-qw-mobile-label">Unit</span>
                              <input aria-label={`Item ${i+1} unit`} disabled={locked} value={l.unit} onChange={e=>editLine(i,'unit',e.target.value)}/>
                            </label>
                          </div>
                          <div className="hq-qw-line-pair hq-qw-line-pair-money">
                            <label className="hq-qw-line-price">
                              <span className="hq-qw-mobile-label">Unit price</span>
                              <input
                                aria-label={`Item ${i+1} unit price AUD`}
                                type="number"
                                min="0"
                                step=".01"
                                inputMode="decimal"
                                disabled={locked}
                                value={l.price===0?'':String(l.price/100)}
                                onFocus={e=>e.currentTarget.select()}
                                onChange={e=>editLine(i,'price',Math.round(Number(e.target.value)*100))}
                              />
                            </label>
                            <label className="hq-qw-line-cost">
                              <span className="hq-qw-mobile-label">Unit cost</span>
                              <input
                                aria-label={`Item ${i+1} internal unit cost AUD`}
                                type="number"
                                min="0"
                                step=".01"
                                inputMode="decimal"
                                disabled={locked}
                                placeholder="—"
                                value={l.cost===null||l.cost===0?'':String(l.cost/100)}
                                onFocus={e=>e.currentTarget.select()}
                                onChange={e=>editLine(i,'cost',e.target.value===''?null:Math.round(Number(e.target.value)*100))}
                              />
                            </label>
                          </div>
                          <div className="hq-qw-line-footer">
                            <label className="hq-qw-line-gst">
                              <input aria-label={`Item ${i+1} GST`} type="checkbox" disabled={locked} checked={l.gst} onChange={e=>editLine(i,'gst',e.target.checked)}/>
                              <span>GST</span>
                            </label>
                            <div className="hq-qw-line-amount" aria-live="polite">
                              <span className="hq-qw-mobile-label">Amount</span>
                              <strong>{amount}</strong>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
                {!lineRows.length?<p className="hq-quote-field-hint">No line items yet. Add labour, materials or a custom item.</p>:null}
              </div>
              {!locked?(
                <div className="hq-quote-add-actions">
                  <button type="button" className="hq-quote-button" onClick={()=>addLine()}>+ Custom item</button>
                  <button type="button" onClick={()=>addLine('labour')}>+ Labour</button>
                  <button type="button" onClick={()=>addLine('material')}>+ Material</button>
                  <button type="button" onClick={()=>addLine('equipment')}>+ Equipment</button>
                </div>
              ):null}
            </>
          )}

          <div className="hq-quote-totals hq-qw-totals" aria-live="polite">
            <p><span>Subtotal</span> <strong>{money(subtotal)}</strong></p>
            <p><span>GST</span> <strong>{money(gst)}</strong></p>
            <p className="hq-qw-total"><span>Total inc GST</span> <strong>{money(subtotal+gst)}</strong></p>
            <p><span>Amount paid</span> <strong>{money(paid)}</strong></p>
            <p className="hq-qw-total"><span>Amount due</span> <strong>{money(due)}</strong></p>
          </div>
          {draft.mode!=='fixed'?(
            <details className="hq-quote-cost-summary">
              <summary>Internal costing — staff only</summary>
              <p><span>Estimated costs entered</span> <strong>{money(estimatedCost)}</strong></p>
              <p><span>Estimated gross profit (ex GST)</span> <strong>{money(subtotal-estimatedCost)}</strong></p>
              {hasMissingCosts?<p className="hq-quote-cost-warning">Some items have no internal cost entered. Profit is incomplete until costs are added.</p>:null}
            </details>
          ):null}
        </section>

        <section className="hq-qw-section hq-quote-notes-panel" aria-labelledby="inv-notes-heading">
          <div className="hq-qw-section-head">
            <div>
              <div className="hq-kicker">DETAILS</div>
              <h2 id="inv-notes-heading">Terms &amp; notes</h2>
            </div>
          </div>
          <div className="hq-qw-notes-grid">
            <label className="hq-qw-full">Terms &amp; payment information
              <textarea disabled={locked} rows={5} value={draft.termsAndPayment} onChange={e=>set('termsAndPayment',e.target.value)}/>
              <span className="hq-quote-field-hint">Shown on the PDF. Edit per invoice if bank details or payment wording change.</span>
            </label>
            <label>Customer-facing notes<textarea disabled={locked} rows={3} value={draft.notes} onChange={e=>set('notes',e.target.value)}/></label>
            <label className="hq-qw-full">Internal notes (staff only)<textarea disabled={locked} rows={2} value={draft.internalNotes} onChange={e=>set('internalNotes',e.target.value)}/></label>
          </div>
        </section>

        {draft.id?(
          <section className="hq-qw-section" aria-labelledby="inv-payments-heading">
            <div className="hq-qw-section-head">
              <div>
                <div className="hq-kicker">PAYMENTS</div>
                <h2 id="inv-payments-heading">Payments received</h2>
              </div>
            </div>
            {payments.length?(
              <div className="hq-invoice-payments">
                {payments.map(payment=>(
                  <div className="hq-invoice-payment-row" key={payment.id}>
                    <strong>{money(payment.amount_cents)}</strong>
                    <span>{payment.payment_date}</span>
                    <span>{payment.payment_method.replaceAll('_',' ')}</span>
                    <span>{payment.reference||'—'}</span>
                    {status!=='void'?(
                      <button type="button" disabled={Boolean(busyAction)} onClick={()=>void runLifecycle('payment-del',()=>deleteInvoicePayment({invoiceId:draft.id!,paymentId:payment.id}))}>Remove</button>
                    ):null}
                  </div>
                ))}
              </div>
            ):<p className="hq-quote-field-hint">No payments recorded yet.</p>}
            {status!=='draft'&&status!=='void'?(
              <div className="hq-invoice-payment-form">
                <label>Amount (AUD)
                  <input type="number" min={0} step="0.01" value={paymentForm.amount} onChange={e=>setPaymentForm(f=>({...f,amount:e.target.value}))}/>
                </label>
                <label>Payment date
                  <input type="date" value={paymentForm.date} onChange={e=>setPaymentForm(f=>({...f,date:e.target.value}))}/>
                </label>
                <label>Reference
                  <input value={paymentForm.reference} onChange={e=>setPaymentForm(f=>({...f,reference:e.target.value}))}/>
                </label>
                <label>Method
                  <select value={paymentForm.method} onChange={e=>setPaymentForm(f=>({...f,method:e.target.value}))}>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="card">Card</option>
                    <option value="cash">Cash</option>
                    <option value="cheque">Cheque</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <button type="button" className="hq-quote-button" disabled={Boolean(busyAction)} onClick={()=>void runLifecycle('payment',async()=>{
                  const amountCents=Math.round((Number(paymentForm.amount)||0)*100);
                  const result=await addInvoicePayment({
                    invoiceId:draft.id!,
                    amountCents,
                    paymentDate:paymentForm.date,
                    reference:paymentForm.reference,
                    paymentMethod:paymentForm.method,
                  });
                  if(result.ok)setPaymentForm({amount:'',date:'',reference:'',method:'bank_transfer'});
                  return result;
                })}>Add payment</button>
              </div>
            ):status==='draft'?<p className="hq-quote-field-hint">Approve the invoice before recording payments.</p>:null}
          </section>
        ):null}
      </div>
    </div>

    {!locked?(
      <div className="hq-quote-save hq-qw-footer" aria-busy={saving}>
        <div className="hq-qw-footer-actions">
          <button type="button" className="hq-quote-button" disabled={pending} onClick={()=>void save(false,'continue')}>
            {busyAction==='save'?'Saving…':'Save & Continue'}
          </button>
          <button type="button" className="hq-quote-button hq-quote-button-secondary" disabled={pending} onClick={()=>void save(false,'exit')}>
            {busyAction==='save'?'Saving…':'Save & Exit'}
          </button>
          {canApproveNow?(
            <button type="button" className="hq-quote-button hq-qw-approve" disabled={pending} onClick={()=>void save(true,'continue')}>
              {busyAction==='approve'?'Working…':'Approve'}
            </button>
          ):null}
        </div>
        <span className="hq-qw-footer-status" role="status">{feedback||(dirty?'Unsaved changes':(draft.id?'Preview uses the last saved version.':''))}</span>
      </div>
    ):null}

    {newCustomer?(
      <div className="hq-crm-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!customerBusy){setNewCustomer(false);resetCustomerConflict()}}}>
        <section role="dialog" aria-modal="true" aria-labelledby="hq-invoice-new-customer" className="hq-crm-modal">
          <header className="hq-crm-modal-header">
            <div>
              <div className="hq-kicker">INVOICES</div>
              <h2 id="hq-invoice-new-customer">Add customer</h2>
              <p>Create a customer and select them on this invoice.</p>
            </div>
            <button type="button" aria-label="Close" className="hq-crm-close" disabled={customerBusy} onClick={()=>{setNewCustomer(false);resetCustomerConflict()}}>×</button>
          </header>
          <div className="hq-crm-form hq-crm-modal-form">
            <label className="hq-crm-full">Full name<input value={customerForm.name} autoFocus minLength={2} maxLength={150} onChange={e=>{setCustomerForm(x=>({...x,name:e.target.value}));resetCustomerConflict()}}/></label>
            <label>Email<input type="email" value={customerForm.email} maxLength={254} onChange={e=>{setCustomerForm(x=>({...x,email:e.target.value}));resetCustomerConflict()}}/></label>
            <label>Phone<input type="tel" value={customerForm.phone} maxLength={40} onChange={e=>{setCustomerForm(x=>({...x,phone:e.target.value}));resetCustomerConflict()}}/></label>
            <p className="hq-crm-hint hq-crm-full">Provide at least an email or phone number.</p>
            {customerConflict&&customerMatches.length>0?(
              <div className="hq-crm-full hq-quote-customer-match" role="status">
                <p><strong>{customerConflict==='single'?'Existing customer found':'Multiple matching customers'}</strong></p>
                <p>{feedback}</p>
                <ul>{customerMatches.map(m=><li key={m.id}><strong>{m.name}</strong><span>{[m.phone,m.email].filter(Boolean).join(' · ')||'No contact details'}</span><button type="button" disabled={customerBusy} onClick={()=>selectMatchedCustomer(m)}>Select this customer</button></li>)}</ul>
                <button type="button" disabled={customerBusy} onClick={()=>void addCustomer(true)}>{customerBusy?'Creating…':'Create separate customer anyway'}</button>
              </div>
            ):null}
            {feedback&&!customerConflict?<p className="hq-crm-full" role="status">{feedback}</p>:null}
            <div className="hq-crm-modal-footer hq-crm-full">
              <button type="button" className="hq-crm-button hq-crm-secondary" disabled={customerBusy} onClick={()=>{setNewCustomer(false);resetCustomerConflict()}}>Cancel</button>
              {!customerConflict?<button type="button" className="hq-crm-button" disabled={customerBusy} onClick={()=>void addCustomer(false)}>{customerBusy?'Creating…':'Create and select'}</button>:null}
            </div>
          </div>
        </section>
      </div>
    ):null}

    <HqToast toast={toast} onDismiss={()=>setToast(null)}/>
    <style>{`
      .hq-quote-dirty-chip{display:inline-flex;align-items:center;padding:4px 9px;border-radius:999px;background:#fff1db;color:#8c520b;font-size:12px;font-weight:750}
      .hq-quote-field-hint{display:block;margin-top:6px;color:#718294;font-size:12px;font-weight:500}
      .hq-qw-full{grid-column:1/-1}
      .hq-invoice-payments{display:grid;gap:8px;margin-bottom:14px}
      .hq-invoice-payment-row{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;padding:10px 12px;border:1px solid #dce6ef;border-radius:10px;background:#f8fbfd;font-size:13px}
      .hq-invoice-payment-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;align-items:end}
    `}</style>
  </div></main>;
}
