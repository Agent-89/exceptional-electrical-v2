import Link from 'next/link';
import {requireOfficeUser,dbAdmin} from '@/lib/hq-auth';
import {formatAudFromCents,quoteTotalIncGstCents} from '@/lib/job-quotes';
import '../hq.css';

export const dynamic='force-dynamic';

type QuoteRow={
  id:string;
  quote_number:string;
  title:string|null;
  status:string;
  pricing_mode:string|null;
  customer_id:string|null;
  updated_at:string;
  expiry_date:string|null;
  is_commercial_current?:boolean|null;
  parent_quote_id?:string|null;
  customer_snapshot:{name?:string}|null;
};

type ItemRow={
  quote_id:string;
  description:string;
  category:string;
  quantity:number;
  unit_price_cents:number;
  gst_applicable:boolean;
};

const PAGE_SIZE=80;

const STATUS_FILTERS=[
  {id:'all',label:'All'},
  {id:'draft',label:'Draft'},
  {id:'pending_approval',label:'Pending approval'},
  {id:'changes_requested',label:'Changes requested'},
  {id:'approved',label:'Approved'},
  {id:'sent',label:'Sent'},
  {id:'accepted',label:'Accepted'},
  {id:'declined',label:'Declined'},
  {id:'superseded',label:'Superseded'},
  {id:'current',label:'Current commercial'},
] as const;

type StatusFilterId=(typeof STATUS_FILTERS)[number]['id'];

const STATUS_FILTER_IDS=new Set<string>(STATUS_FILTERS.map(item=>item.id));

function isStatusFilterId(value:string):value is StatusFilterId{
  return STATUS_FILTER_IDS.has(value);
}

function statusClass(status:string){
  if(status==='accepted')return 'hq-status hq-status-ok';
  if(status==='declined')return 'hq-status hq-status-bad';
  if(status==='sent'||status==='approved')return 'hq-status hq-status-warn';
  if(status==='pending_approval')return 'hq-status hq-status-pending';
  if(status==='changes_requested')return 'hq-status hq-status-changes';
  if(status==='superseded')return 'hq-status hq-status-muted';
  return 'hq-status';
}

function statusLabel(status:string){
  return status.replaceAll('_',' ');
}

function expiryLabel(expiry:string|null){
  if(!expiry)return null;
  const today=new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Perth'});
  const days=Math.round((Date.parse(expiry+'T00:00:00+08:00')-Date.parse(today+'T00:00:00+08:00'))/86400000);
  if(Number.isNaN(days))return null;
  if(days<0)return 'Expired';
  if(days===0)return 'Expires today';
  return `Expires in ${days} day${days===1?'':'s'}`;
}

function sanitizeSearch(raw:string){
  return raw.replace(/[%_,]/g,' ').slice(0,80).trim();
}

export default async function QuotesPage({searchParams}:{searchParams:Promise<{q?:string;status?:string;page?:string}>}){
  await requireOfficeUser();
  const params=await searchParams;
  const qRaw=(params.q??'').trim();
  const q=sanitizeSearch(qRaw);
  const filter=isStatusFilterId(params.status??'all')?(params.status??'all'):'all';
  const page=Math.max(1,Number.parseInt(params.page??'1',10)||1);
  const from=(page-1)*PAGE_SIZE;
  const to=from+PAGE_SIZE-1;
  const db=dbAdmin();

  let quotesQuery=db
    .from('quotes')
    .select('id,quote_number,title,status,pricing_mode,customer_id,updated_at,expiry_date,is_commercial_current,parent_quote_id,customer_snapshot',{count:'exact'})
    .order('updated_at',{ascending:false})
    .range(from,to);

  if(filter==='current'){
    quotesQuery=quotesQuery.eq('is_commercial_current',true);
  }else if(filter!=='all'){
    quotesQuery=quotesQuery.eq('status',filter);
  }

  if(q){
    quotesQuery=quotesQuery.or(
      `quote_number.ilike.%${q}%,title.ilike.%${q}%,customer_snapshot->>name.ilike.%${q}%`,
    );
  }

  const {data,error,count}=await quotesQuery;
  const quotes=(data||[]) as QuoteRow[];
  const total=count??quotes.length;
  const showingLabel=`Showing ${quotes.length} of ${total}`;

  const quoteIds=quotes.map(row=>row.id);
  const totals=new Map<string,number>();
  if(quoteIds.length){
    const {data:items}=await db
      .from('quote_items')
      .select('quote_id,description,category,quantity,unit_price_cents,gst_applicable')
      .in('quote_id',quoteIds);
    const byQuote=new Map<string,ItemRow[]>();
    for(const item of (items||[]) as ItemRow[]){
      const list=byQuote.get(item.quote_id)||[];
      list.push(item);
      byQuote.set(item.quote_id,list);
    }
    for(const row of quotes){
      totals.set(row.id,quoteTotalIncGstCents(byQuote.get(row.id)||[],row.pricing_mode));
    }
  }

  const qs=(extra:Record<string,string>={})=>{
    const sp=new URLSearchParams();
    if(qRaw)sp.set('q',qRaw);
    const nextStatus=Object.prototype.hasOwnProperty.call(extra,'status')
      ?extra.status
      :(filter!=='all'?filter:'');
    if(nextStatus)sp.set('status',nextStatus);
    const nextPage=Object.prototype.hasOwnProperty.call(extra,'page')
      ?extra.page
      :'';
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
        <h1>Quotes</h1>
      </div>
      <Link className="hq-detail-action-primary" href="/hq/quotes/new">+ New quote</Link>
    </div>
    <section className="hq-panel hq-quotes-register">
      <div className="hq-quotes-register-heading">
        <h2>Quote register</h2>
        <span>{showingLabel}</span>
      </div>
      <form method="get" className="hq-quotes-search">
        <input
          name="q"
          defaultValue={params.q??''}
          placeholder="Quote #, title, customer"
          aria-label="Search quotes"
        />
        <input type="hidden" name="status" value={filter==='all'?'':filter}/>
        <button type="submit">Search</button>
      </form>
      <div className="hq-quotes-filters" aria-label="Quote filters">
        {STATUS_FILTERS.map(item=>(
          <Link
            key={item.id}
            href={'/hq/quotes'+qs({status:item.id==='all'?'':item.id,page:''})}
            className={filter===item.id?'is-selected':undefined}
            aria-current={filter===item.id?'page':undefined}
          >
            {item.label}
          </Link>
        ))}
      </div>
      {error?<p role="alert">Unable to load quotes.</p>:!quotes.length?(
        <div className="ee-jobs-empty">
          <strong>{hasActiveQuery?'No matching quotes':'No quotes yet'}</strong>
          <p>{hasActiveQuery?'Try another search or filter.':'Create a quote to get started.'}</p>
          {!hasActiveQuery&&<Link href="/hq/quotes/new">Create a quote →</Link>}
        </div>
      ):(
        <div className="hq-quote-list">
          {quotes.map(row=>{
            const customerName=row.customer_snapshot?.name||'Customer not selected';
            const totalInc=totals.get(row.id)||0;
            const showExpiry=row.status!=='accepted'&&row.status!=='superseded';
            const expiry=showExpiry?expiryLabel(row.expiry_date):null;
            const secondary=[
              `Updated ${new Date(row.updated_at).toLocaleDateString('en-AU',{timeZone:'Australia/Perth'})}`,
              row.parent_quote_id?'Variation':null,
              expiry,
            ].filter(Boolean).join(' · ');
            return (
              <Link key={row.id} href={'/hq/quotes/'+row.id} className="hq-quote-row">
                <div className="hq-quote-row-primary">
                  <div className="hq-quote-row-identity">
                    <strong className="hq-quote-row-number">{row.quote_number}</strong>
                    <span className="hq-quote-row-customer">{customerName}</span>
                  </div>
                  <div className="hq-quote-row-meta">
                    <strong className="hq-quote-row-price">{formatAudFromCents(totalInc)}</strong>
                    <span className={statusClass(row.status)}>{statusLabel(row.status)}</span>
                    {row.is_commercial_current?<span className="hq-quote-current-badge">Current</span>:null}
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
          {page>1&&<Link href={'/hq/quotes'+qs({page:String(page-1)})}>← Previous</Link>}
          <span>Page {page}</span>
          {from+quotes.length<total&&<Link href={'/hq/quotes'+qs({page:String(page+1)})}>Next →</Link>}
        </div>
      )}
    </section>
  </div></main>;
}
