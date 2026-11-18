import Link from 'next/link';
import {requireOfficeUser,dbAdmin} from '@/lib/hq-auth';
import {
  formatAudFromCents,
  formatJobRef,
  invoiceAmountDueCents,
  invoiceStatusLabel,
  invoiceTotalsCents,
  isInvoiceStatus,
  isMissingInvoiceSchemaError,
  missingInvoiceSchemaMessage,
} from '@/lib/invoice-commercial';
import '../hq.css';

export const dynamic='force-dynamic';

type InvoiceRow={
  id:string;
  invoice_number:string;
  title:string|null;
  status:string;
  pricing_mode:string|null;
  updated_at:string;
  due_date:string|null;
  issue_date:string|null;
  customer_snapshot:{name?:string}|null;
  job_snapshot:{job_number?:string|null}|null;
};

type ItemRow={
  invoice_id:string;
  description:string;
  category:string;
  quantity:number;
  unit_price_cents:number;
  gst_applicable:boolean;
};

type PaymentRow={invoice_id:string;amount_cents:number};

const PAGE_SIZE=80;

const STATUS_FILTERS=[
  {id:'all',label:'All'},
  {id:'draft',label:'Draft'},
  {id:'approved',label:'Approved'},
  {id:'sent',label:'Sent'},
  {id:'part_paid',label:'Part paid'},
  {id:'paid',label:'Paid'},
  {id:'void',label:'Void'},
] as const;

type StatusFilterId=(typeof STATUS_FILTERS)[number]['id'];

function isStatusFilterId(value:string):value is StatusFilterId{
  return STATUS_FILTERS.some(item=>item.id===value);
}

function statusClass(status:string){
  if(status==='paid')return 'hq-status hq-status-ok';
  if(status==='void')return 'hq-status hq-status-bad';
  if(status==='sent'||status==='approved')return 'hq-status hq-status-warn';
  if(status==='part_paid')return 'hq-status hq-status-pending';
  return 'hq-status';
}

function sanitizeSearch(raw:string){
  return raw.replace(/[%_,]/g,' ').slice(0,80).trim();
}

function dueLabel(due:string|null,status:string){
  if(!due||status==='paid'||status==='void')return null;
  const today=new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Perth'});
  const days=Math.round((Date.parse(due+'T00:00:00+08:00')-Date.parse(today+'T00:00:00+08:00'))/86400000);
  if(Number.isNaN(days))return null;
  if(days<0)return 'Overdue';
  if(days===0)return 'Due today';
  return `Due in ${days} day${days===1?'':'s'}`;
}

export default async function InvoicesPage({searchParams}:{searchParams:Promise<{q?:string;status?:string;page?:string}>}){
  await requireOfficeUser();
  const params=await searchParams;
  const qRaw=(params.q??'').trim();
  const q=sanitizeSearch(qRaw);
  const filter=isStatusFilterId(params.status??'all')?(params.status??'all'):'all';
  const page=Math.max(1,Number.parseInt(params.page??'1',10)||1);
  const from=(page-1)*PAGE_SIZE;
  const to=from+PAGE_SIZE-1;
  const db=dbAdmin();

  let invoicesQuery=db
    .from('invoices')
    .select('id,invoice_number,title,status,pricing_mode,updated_at,due_date,issue_date,customer_snapshot,job_snapshot',{count:'exact'})
    .order('updated_at',{ascending:false})
    .range(from,to);

  if(filter!=='all'&&isInvoiceStatus(filter)){
    invoicesQuery=invoicesQuery.eq('status',filter);
  }
  if(q){
    invoicesQuery=invoicesQuery.or(
      `invoice_number.ilike.%${q}%,title.ilike.%${q}%,customer_snapshot->>name.ilike.%${q}%`,
    );
  }

  const {data,error,count}=await invoicesQuery;
  if(error&&isMissingInvoiceSchemaError(error)){
    return <main className="hq-detail"><div className="hq-detail-inner hq-quotes-page">
      <Link className="hq-back" href="/hq">← HQ overview</Link>
      <div className="hq-detail-head"><div><div className="hq-kicker">EXCEPTIONAL ELECTRICAL HQ</div><h1>Invoices</h1></div></div>
      <section className="hq-panel"><p role="alert">{missingInvoiceSchemaMessage()}</p></section>
    </div></main>;
  }

  const invoices=(data||[]) as InvoiceRow[];
  const total=count??invoices.length;
  const showingLabel=`Showing ${invoices.length} of ${total}`;

  const invoiceIds=invoices.map(row=>row.id);
  const totals=new Map<string,number>();
  const dues=new Map<string,number>();
  if(invoiceIds.length){
    const [{data:items},{data:payments}]=await Promise.all([
      db.from('invoice_items').select('invoice_id,description,category,quantity,unit_price_cents,gst_applicable').in('invoice_id',invoiceIds),
      db.from('invoice_payments').select('invoice_id,amount_cents').in('invoice_id',invoiceIds),
    ]);
    const itemsByInvoice=new Map<string,ItemRow[]>();
    for(const item of (items||[]) as ItemRow[]){
      const list=itemsByInvoice.get(item.invoice_id)||[];
      list.push(item);
      itemsByInvoice.set(item.invoice_id,list);
    }
    const paymentsByInvoice=new Map<string,PaymentRow[]>();
    for(const payment of (payments||[]) as PaymentRow[]){
      const list=paymentsByInvoice.get(payment.invoice_id)||[];
      list.push(payment);
      paymentsByInvoice.set(payment.invoice_id,list);
    }
    for(const row of invoices){
      const lineItems=itemsByInvoice.get(row.id)||[];
      totals.set(row.id,invoiceTotalsCents(lineItems,row.pricing_mode).totalIncGstCents);
      dues.set(row.id,invoiceAmountDueCents({
        items:lineItems,
        payments:paymentsByInvoice.get(row.id)||[],
        pricingMode:row.pricing_mode,
        status:row.status,
      }));
    }
  }

  const qs=(extra:Record<string,string>={})=>{
    const sp=new URLSearchParams();
    if(qRaw)sp.set('q',qRaw);
    const nextStatus=Object.prototype.hasOwnProperty.call(extra,'status')
      ?extra.status
      :(filter!=='all'?filter:'');
    if(nextStatus)sp.set('status',nextStatus);
    const nextPage=Object.prototype.hasOwnProperty.call(extra,'page')?extra.page:'';
    if(nextPage&&nextPage!=='1')sp.set('page',nextPage);
    const s=sp.toString();
    return s?'?'+s:'';
  };

  const hasActiveQuery=Boolean(qRaw)||filter!=='all';

  return <main className="hq-detail"><div className="hq-detail-inner hq-quotes-page">
    <Link className="hq-back" href="/hq">← HQ overview</Link>
    <div className="hq-detail-head">
      <div>
        <div className="hq-kicker">EXCEPTIONAL ELECTRICAL HQ</div>
        <h1>Invoices</h1>
      </div>
      <Link className="hq-detail-action-primary" href="/hq/invoices/new">+ New invoice</Link>
    </div>
    <section className="hq-panel hq-quotes-register">
      <div className="hq-quotes-register-heading">
        <h2>Invoice register</h2>
        <span>{showingLabel}</span>
      </div>
      <form method="get" className="hq-quotes-search">
        <input name="q" defaultValue={params.q??''} placeholder="Invoice #, title, customer" aria-label="Search invoices"/>
        <input type="hidden" name="status" value={filter==='all'?'':filter}/>
        <button type="submit">Search</button>
      </form>
      <div className="hq-quotes-filters" aria-label="Invoice filters">
        {STATUS_FILTERS.map(item=>(
          <Link
            key={item.id}
            href={'/hq/invoices'+qs({status:item.id==='all'?'':item.id,page:''})}
            className={filter===item.id?'is-selected':undefined}
            aria-current={filter===item.id?'page':undefined}
          >
            {item.label}
          </Link>
        ))}
      </div>
      {error?<p role="alert">Unable to load invoices.</p>:!invoices.length?(
        <div className="ee-jobs-empty">
          <strong>{hasActiveQuery?'No matching invoices':'No invoices yet'}</strong>
          <p>{hasActiveQuery?'Try another search or filter.':'Create an invoice to get started.'}</p>
          {!hasActiveQuery&&<Link href="/hq/invoices/new">Create an invoice →</Link>}
        </div>
      ):(
        <div className="hq-quote-list">
          {invoices.map(row=>{
            const customerName=row.customer_snapshot?.name||'Customer not selected';
            const totalInc=totals.get(row.id)||0;
            const amountDue=dues.get(row.id)??totalInc;
            const due=dueLabel(row.due_date,row.status);
            const jobRef=formatJobRef(row.job_snapshot?.job_number);
            const secondary=[
              `Updated ${new Date(row.updated_at).toLocaleDateString('en-AU',{timeZone:'Australia/Perth'})}`,
              jobRef,
              due,
              row.status!=='paid'&&row.status!=='void'?`Due ${formatAudFromCents(amountDue)}`:null,
            ].filter(Boolean).join(' · ');
            return (
              <Link key={row.id} href={'/hq/invoices/'+row.id} className="hq-quote-row">
                <div className="hq-quote-row-primary">
                  <div className="hq-quote-row-identity">
                    <strong className="hq-quote-row-number">{row.invoice_number}</strong>
                    <span className="hq-quote-row-customer">{customerName}</span>
                  </div>
                  <div className="hq-quote-row-meta">
                    <strong className="hq-quote-row-price">{formatAudFromCents(totalInc)}</strong>
                    <span className={statusClass(row.status)}>{invoiceStatusLabel(row.status)}</span>
                  </div>
                </div>
                {secondary?<p className="hq-quote-row-secondary">{secondary}</p>:null}
              </Link>
            );
          })}
        </div>
      )}
      {total>PAGE_SIZE&&(
        <div className="hq-quotes-pagination">
          {page>1&&<Link href={'/hq/invoices'+qs({page:String(page-1)})}>← Previous</Link>}
          <span>Page {page}</span>
          {from+invoices.length<total&&<Link href={'/hq/invoices'+qs({page:String(page+1)})}>Next →</Link>}
        </div>
      )}
    </section>
  </div></main>;
}
