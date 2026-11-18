'use client';
import Link from 'next/link';
import {useEffect,useId,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {MoreHorizontal} from 'lucide-react';
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
  invoiceTotalsCents,
} from '@/lib/invoice-commercial';
import {defaultInvoiceTermsAndPayment} from '@/lib/business-profile';
import type {CustomerMatchRecord} from '@/lib/customer-match';

type Customer={id:string;name:string;email:string|null;phone:string|null};
type Address={id:string;customer_id:string;label:string;address_line1:string;suburb:string;state:string;postcode:string};
type JobOption={id:string;jobNumber:string|null;title:string|null;status?:string};
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

function addressLabel(a:Address){
  return [a.label,a.address_line1,a.suburb,a.state,a.postcode].filter(Boolean).join(' · ');
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
  initial?:Initial;
  nextInvoiceNumber?:string;
}){
  const router=useRouter();
  const [pending,startTransition]=useTransition();
  const [draft,setDraft]=useState<InvoiceDraft>({...empty,...initial,lines:initial?.lines||[],termsAndPayment:initial?.termsAndPayment||defaultInvoiceTermsAndPayment()});
  const [customerList,setCustomerList]=useState(customers);
  const [addressList,setAddressList]=useState(addresses);
  const [jobList,setJobList]=useState(jobs);
  const [toast,setToast]=useState<HqToastMessage|null>(null);
  const [busy,setBusy]=useState('');
  const [newCustomer,setNewCustomer]=useState(false);
  const [customerForm,setCustomerForm]=useState({name:'',email:'',phone:''});
  const [paymentForm,setPaymentForm]=useState({amount:'',date:'',reference:'',method:'bank_transfer'});

  const status=initial?.status||'draft';
  const invoiceNumber=initial?.number||nextInvoiceNumber||'';
  const totals=invoiceTotalsCents(draft.lines.map(l=>({
    description:l.description,category:l.category,quantity:l.quantity,unit_price_cents:l.price,gst_applicable:l.gst,
  })),draft.mode);
  const paid=invoicePaidCents(payments);
  const due=invoiceAmountDueCents({
    items:draft.lines.map(l=>({description:l.description,category:l.category,quantity:l.quantity,unit_price_cents:l.price,gst_applicable:l.gst})),
    payments,
    pricingMode:draft.mode,
    status,
  });

  useEffect(()=>{setCustomerList(customers)},[customers]);
  useEffect(()=>{setAddressList(addresses)},[addresses]);
  useEffect(()=>{setJobList(jobs)},[jobs]);

  const set=<K extends keyof InvoiceDraft>(key:K,value:InvoiceDraft[K])=>setDraft(d=>({...d,[key]:value}));
  const flash=(tone:HqToastMessage['tone'],text:string)=>setToast({id:Date.now(),tone,text});

  const run=async(label:string,fn:()=>Promise<{ok:boolean;message:string;id?:string}>,opts?:{redirect?:boolean})=>{
    setBusy(label);
    try{
      const result=await fn();
      if(!result.ok){flash('error',result.message);return}
      flash('success',result.message);
      if(opts?.redirect!==false&&result.id&&!draft.id){
        startTransition(()=>router.replace('/hq/invoices/'+result.id));
      }else{
        startTransition(()=>router.refresh());
      }
    }finally{
      setBusy('');
    }
  };

  const addLine=(category:string)=>{
    if(locked)return;
    setDraft(d=>({
      ...d,
      lines:[...d.lines,{description:'',category,quantity:1,unit:category==='labour'?'hour':'each',price:0,cost:null,gst:true}],
    }));
  };

  const updateLine=(index:number,patch:Partial<InvoiceDraft['lines'][number]>)=>{
    setDraft(d=>({...d,lines:d.lines.map((line,i)=>i===index?{...line,...patch}:line)}));
  };

  const removeLine=(index:number)=>{
    setDraft(d=>({...d,lines:d.lines.filter((_,i)=>i!==index)}));
  };

  const lineRows=draft.mode==='fixed'
    ?draft.lines.filter(isFixed)
    :draft.lines.filter(l=>!isFixed(l));

  return <div className="hq-quote-editor hq-qw">
    <HqToast toast={toast} onDismiss={()=>setToast(null)}/>
    <header className="hq-qw-header">
      <div className="hq-qw-title-row">
        <div className="hq-qw-title-block">
          <div className="hq-kicker">EXCEPTIONAL ELECTRICAL HQ</div>
          <h1 className={invoiceNumber?'hq-quote-ref':undefined}>
            {invoiceBuilderHeading({invoiceNumber:initial?.number,isNew:!draft.id})}
          </h1>
          <div className="hq-qw-meta">
            <span className={'hq-status hq-qw-status'}>{invoiceStatusLabel(status)}</span>
            {invoiceNumber?<span className="hq-qw-meta-text">{invoiceNumber}</span>:null}
            {draft.jobId?<span className="hq-qw-meta-text">{formatJobRef(jobList.find(j=>j.id===draft.jobId)?.jobNumber)||'Linked job'}</span>:null}
          </div>
        </div>
        <div className="hq-qw-header-actions">
          {draft.id?(
            <div className="hq-qw-view-switch" aria-label="Invoice views">
              <span className="is-active">Edit</span>
              <Link href={`/hq/invoices/${draft.id}/preview`}>Preview</Link>
            </div>
          ):null}
          <details className="hq-qw-actions-menu">
            <summary aria-label="Invoice actions"><MoreHorizontal size={18}/></summary>
            <div className="hq-qw-actions-panel">
              {!locked?<button type="button" disabled={Boolean(busy)||pending} onClick={()=>void run('save',()=>saveInvoiceDraft(draft))}>Save draft</button>:null}
              {!locked&&canApprove?<button type="button" disabled={Boolean(busy)||pending} onClick={()=>void run('approve',()=>saveAndApproveInvoice(draft))}>Save &amp; approve</button>:null}
              {draft.id&&status==='draft'&&canApprove?<button type="button" disabled={Boolean(busy)||pending} onClick={()=>void run('approve',()=>approveInvoice(draft.id!))}>Approve</button>:null}
              {draft.id&&(status==='approved'||status==='sent')?<button type="button" disabled={Boolean(busy)||pending} onClick={()=>void run('sent',()=>markInvoiceSent(draft.id!))}>Mark sent</button>:null}
              {draft.id?<a href={`/hq/invoices/${draft.id}/pdf`}>Download PDF</a>:null}
              {draft.id&&canDelete&&status==='draft'?(
                <button type="button" disabled={Boolean(busy)||pending} onClick={()=>{
                  if(!window.confirm('Delete this draft invoice?'))return;
                  void run('delete',async()=>{
                    const result=await deleteEmptyInvoice(draft.id!);
                    if(result.ok)startTransition(()=>router.replace('/hq/invoices'));
                    return result;
                  },{redirect:false});
                }}>Delete draft</button>
              ):null}
              {draft.id&&status!=='void'&&status!=='paid'&&canApprove?(
                <button type="button" disabled={Boolean(busy)||pending} onClick={()=>{
                  const reason=window.prompt('Void reason (optional)')||'';
                  void run('void',()=>voidInvoice(draft.id!,reason));
                }}>Void invoice</button>
              ):null}
            </div>
          </details>
        </div>
      </div>
    </header>

    <section className="hq-panel hq-qw-section">
      <div className="hq-qw-section-head">
        <div>
          <div className="hq-kicker">CUSTOMER</div>
          <h2>Bill to</h2>
        </div>
      </div>
      <div className="hq-qw-customer-row">
        <label>Customer
          <SearchPicker
            value={draft.customerId}
            placeholder="Search customers"
            disabled={locked}
            choices={customerList.map(c=>({id:c.id,label:c.name,detail:[c.email,c.phone].filter(Boolean).join(' · ')}))}
            onQuery={(q)=>{void searchInvoiceCustomers(q).then(rows=>{if(rows.length)setCustomerList(prev=>{const map=new Map(prev.map(c=>[c.id,c]));for(const row of rows)map.set(row.id,row);return [...map.values()]})})}}
            onSelect={(id)=>{
              setDraft(d=>({...d,customerId:id,jobId:id===d.customerId?d.jobId:'',quoteId:id===d.customerId?d.quoteId:''}));
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
        {!locked?<button type="button" className="hq-qw-link-btn" onClick={()=>setNewCustomer(true)}>+ New customer</button>:null}
      </div>
      {newCustomer&&!locked?(
        <div className="hq-qw-new-customer">
          <label>Name<input value={customerForm.name} onChange={e=>setCustomerForm(f=>({...f,name:e.target.value}))}/></label>
          <label>Email<input value={customerForm.email} onChange={e=>setCustomerForm(f=>({...f,email:e.target.value}))}/></label>
          <label>Phone<input value={customerForm.phone} onChange={e=>setCustomerForm(f=>({...f,phone:e.target.value}))}/></label>
          <div className="hq-qw-inline-actions">
            <button type="button" disabled={Boolean(busy)} onClick={()=>void run('customer',async()=>{
              const result=await createQuoteCustomer(customerForm.name,customerForm.email,customerForm.phone);
              if(!result.ok){
                if('conflict' in result&&result.matches?.length){
                  const match=result.matches[0] as CustomerMatchRecord;
                  setDraft(d=>({...d,customerId:match.id}));
                  setCustomerList(prev=>prev.some(c=>c.id===match.id)?prev:[...prev,{id:match.id,name:match.name,email:match.email,phone:match.phone}]);
                  setNewCustomer(false);
                  return {ok:true,message:'Using existing customer'};
                }
                return {ok:false,message:result.message};
              }
              if(result.id){
                setDraft(d=>({...d,customerId:result.id!}));
                setCustomerList(prev=>[...prev,{id:result.id!,name:customerForm.name,email:customerForm.email||null,phone:customerForm.phone||null}]);
                setNewCustomer(false);
                setCustomerForm({name:'',email:'',phone:''});
              }
              return {ok:true,message:result.message||'Customer created',id:result.id};
            })}>Create customer</button>
            <button type="button" onClick={()=>setNewCustomer(false)}>Cancel</button>
          </div>
        </div>
      ):null}
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
          }}
        />
        <datalist id="invoice-addresses">{addressList.filter(a=>a.customer_id===draft.customerId).map(a=><option key={a.id} value={addressLabel(a)}/>)}</datalist>
      </label>
      <label>Your reference / PO
        <input type="text" maxLength={120} disabled={locked} value={draft.customerReference||''} onChange={e=>set('customerReference',e.target.value)} placeholder="Customer PO or order number"/>
      </label>
      <div className="hq-qw-optional-block">
        <div className="hq-qw-optional-head">
          <h3>Optional links</h3>
          <span className="hq-quote-optional">Job and quote are optional</span>
        </div>
        <div className="hq-qw-links-row">
          <div className="hq-qw-jobs">
            <div className="hq-qw-jobs-head">
              <h3>Linked job</h3>
              <span className="hq-quote-optional">Same customer</span>
            </div>
            {draft.jobId?(
              <ul className="hq-linked-job-list hq-qw-job-chips">
                <li>
                  <div>
                    <strong>{formatJobRef(jobList.find(j=>j.id===draft.jobId)?.jobNumber)||'Job'}</strong>
                    <span>{jobList.find(j=>j.id===draft.jobId)?.title||'Untitled job'}</span>
                  </div>
                  <div className="hq-linked-job-actions">
                    <Link href={`/hq/jobs/${draft.jobId}`}>View</Link>
                    {!locked?<button type="button" onClick={()=>setDraft(d=>({...d,jobId:'',quoteId:''}))}>Remove</button>:null}
                  </div>
                </li>
              </ul>
            ):!locked&&draft.customerId?(
              <SearchPicker
                value=""
                placeholder="Link a job for this customer"
                choices={jobList.map(j=>({id:j.id,label:formatJobRef(j.jobNumber)||'Job',detail:j.title||''}))}
                onSelect={(id)=>setDraft(d=>({...d,jobId:id}))}
              />
            ):<p className="hq-quote-field-hint">{draft.customerId?'No job linked.':'Select a customer before linking a job.'}</p>}
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
                    <span>Seeded commercial source</span>
                  </div>
                  <div className="hq-linked-job-actions">
                    <Link href={`/hq/quotes/${draft.quoteId}`}>View</Link>
                    {!locked?<button type="button" onClick={()=>set('quoteId','')}>Remove</button>:null}
                  </div>
                </li>
              </ul>
            ):<p className="hq-quote-field-hint">No quote linked. Create from a job to seed from the commercial-current quote.</p>}
          </div>
        </div>
      </div>
    </section>

    <section className="hq-panel hq-qw-section">
      <div className="hq-qw-section-head">
        <div>
          <div className="hq-kicker">DETAILS</div>
          <h2>Invoice details</h2>
        </div>
      </div>
      <label>Title<input disabled={locked} value={draft.title} onChange={e=>set('title',e.target.value)} placeholder="Short invoice title"/></label>
      <label>Description<textarea disabled={locked} rows={3} value={draft.description} onChange={e=>set('description',e.target.value)} placeholder="What this invoice covers"/></label>
      <div className="hq-qw-grid-2">
        <label>Invoice date<input type="date" disabled={locked} value={draft.issueDate} onChange={e=>set('issueDate',e.target.value)}/></label>
        <label>Due date<input type="date" disabled={locked} value={draft.dueDate} onChange={e=>set('dueDate',e.target.value)}/></label>
      </div>
      <div className="hq-qw-grid-2">
        <label>Pricing
          <select disabled={locked} value={draft.mode} onChange={e=>{
            const mode=e.target.value;
            setDraft(d=>({
              ...d,
              mode,
              lines:mode==='fixed'&&!d.lines.some(isFixed)
                ?[...d.lines,{description:FIXED_INVOICE_LINE,category:'other',quantity:1,unit:'each',price:0,cost:null,gst:true}]
                :d.lines,
            }));
          }}>
            <option value="detailed">Detailed</option>
            <option value="fixed">Lump sum</option>
            <option value="mixed">Mixed</option>
          </select>
        </label>
        <label>Customer display
          <select disabled={locked} value={draft.display} onChange={e=>set('display',e.target.value)}>
            <option value="itemised">Itemised</option>
            <option value="total_only">Total only</option>
          </select>
        </label>
      </div>
    </section>

    <section className="hq-panel hq-qw-section">
      <div className="hq-qw-section-head">
        <div>
          <div className="hq-kicker">LINE ITEMS</div>
          <h2>What you are charging</h2>
        </div>
        <div className="hq-qw-totals-chip">
          <span>Total</span>
          <strong>{money(totals.totalIncGstCents)}</strong>
        </div>
      </div>
      {!lineRows.length?<p className="hq-quote-field-hint">No line items yet. Add labour, materials, or a custom item.</p>:null}
      <div className="hq-quote-lines">
        {lineRows.map((line)=>{
          const index=draft.lines.indexOf(line);
          return (
            <div className="hq-quote-line" key={`${index}-${line.category}`}>
              <label>Description<input disabled={locked||(draft.mode==='fixed'&&isFixed(line))} value={line.description} onChange={e=>updateLine(index,{description:e.target.value})}/></label>
              <label>Category
                <select disabled={locked||draft.mode==='fixed'} value={line.category} onChange={e=>updateLine(index,{category:e.target.value,unit:e.target.value==='labour'?'hour':line.unit})}>
                  {['labour','material','equipment','subcontractor','other'].map(x=><option key={x} value={x}>{x}</option>)}
                </select>
              </label>
              <label>Qty<input type="number" min={0} step="0.01" disabled={locked} value={line.quantity} onChange={e=>updateLine(index,{quantity:Number(e.target.value)||0})}/></label>
              <label>Unit<input disabled={locked} value={line.unit} onChange={e=>updateLine(index,{unit:e.target.value})}/></label>
              <label>Unit price (ex GST)
                <input type="number" min={0} step="0.01" disabled={locked} value={(line.price/100).toFixed(2)} onChange={e=>updateLine(index,{price:Math.round((Number(e.target.value)||0)*100)})}/>
              </label>
              <label className="hq-quote-line-gst">GST
                <input type="checkbox" disabled={locked} checked={line.gst} onChange={e=>updateLine(index,{gst:e.target.checked})}/>
              </label>
              {!locked&&draft.mode!=='fixed'?<button type="button" onClick={()=>removeLine(index)}>Remove</button>:null}
            </div>
          );
        })}
      </div>
      {!locked&&draft.mode!=='fixed'?(
        <div className="hq-qw-line-actions">
          <button type="button" onClick={()=>addLine('labour')}>+ Labour</button>
          <button type="button" onClick={()=>addLine('material')}>+ Material</button>
          <button type="button" onClick={()=>addLine('other')}>+ Custom item</button>
        </div>
      ):null}
      <div className="hq-qw-money-summary">
        <div><span>Subtotal (ex GST)</span><strong>{money(totals.subtotalExGstCents)}</strong></div>
        <div><span>GST</span><strong>{money(totals.gstCents)}</strong></div>
        <div><span>Total (AUD)</span><strong>{money(totals.totalIncGstCents)}</strong></div>
        <div><span>Amount paid</span><strong>{money(paid)}</strong></div>
        <div className="hq-qw-amount-due"><span>Amount due</span><strong>{money(due)}</strong></div>
      </div>
    </section>

    <section className="hq-panel hq-qw-section">
      <div className="hq-qw-section-head">
        <div>
          <div className="hq-kicker">TERMS</div>
          <h2>Terms &amp; payment information</h2>
        </div>
      </div>
      <label>Shown on the PDF
        <textarea disabled={locked} rows={6} value={draft.termsAndPayment} onChange={e=>set('termsAndPayment',e.target.value)}/>
      </label>
      <label>Customer notes<textarea disabled={locked} rows={2} value={draft.notes} onChange={e=>set('notes',e.target.value)}/></label>
      <label>Internal notes<textarea disabled={locked} rows={2} value={draft.internalNotes} onChange={e=>set('internalNotes',e.target.value)}/></label>
    </section>

    {draft.id?(
      <section className="hq-panel hq-qw-section">
        <div className="hq-qw-section-head">
          <div>
            <div className="hq-kicker">PAYMENTS</div>
            <h2>Payments received</h2>
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
                  <button type="button" disabled={Boolean(busy)} onClick={()=>void run('payment-del',()=>deleteInvoicePayment({invoiceId:draft.id!,paymentId:payment.id}))}>Remove</button>
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
            <button type="button" disabled={Boolean(busy)} onClick={()=>void run('payment',async()=>{
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

    <div className="hq-qw-footer-actions">
      <Link href="/hq/invoices">← Back to invoices</Link>
      {!locked?(
        <div className="hq-qw-footer-buttons">
          <button type="button" className="hq-quote-button-secondary" disabled={Boolean(busy)||pending} onClick={()=>void run('save',()=>saveInvoiceDraft(draft))}>
            {busy==='save'?'Saving…':'Save draft'}
          </button>
          {canApprove?(
            <button type="button" className="hq-quote-button" disabled={Boolean(busy)||pending} onClick={()=>void run('approve',()=>saveAndApproveInvoice(draft))}>
              {busy==='approve'?'Approving…':'Save & approve'}
            </button>
          ):null}
        </div>
      ):null}
    </div>
    <style>{`
      .hq-qw-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .hq-qw-money-summary{display:grid;gap:8px;margin-top:16px;max-width:360px;margin-left:auto}
      .hq-qw-money-summary>div,.hq-invoice-payment-row{display:flex;justify-content:space-between;gap:12px;align-items:center}
      .hq-qw-amount-due{padding-top:8px;border-top:2px solid #1176b5;font-size:16px}
      .hq-invoice-payments{display:grid;gap:8px;margin-bottom:14px}
      .hq-invoice-payment-row{padding:10px 12px;border:1px solid #dce6ef;border-radius:10px;background:#f8fbfd;font-size:13px}
      .hq-invoice-payment-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;align-items:end}
      .hq-qw-footer-actions{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:18px 0 40px;flex-wrap:wrap}
      .hq-qw-footer-buttons{display:flex;gap:8px;flex-wrap:wrap}
      .hq-qw-totals-chip{display:flex;flex-direction:column;align-items:flex-end;gap:2px;font-size:12px;color:#4f677a}
      .hq-qw-totals-chip strong{font-size:18px;color:#0f2a3d}
      .hq-qw-inline-actions{display:flex;gap:8px}
      .hq-qw-new-customer{display:grid;gap:10px;padding:12px;border:1px dashed #c9dae8;border-radius:10px}
      @media(max-width:720px){.hq-qw-grid-2{grid-template-columns:1fr}}
    `}</style>
  </div>;
}
