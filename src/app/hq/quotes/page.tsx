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

const STATUS_FILTERS=[
  {id:'all',label:'All'},
  {id:'draft',label:'Draft'},
  {id:'approved',label:'Approved'},
  {id:'sent',label:'Sent'},
  {id:'accepted',label:'Accepted'},
  {id:'declined',label:'Declined'},
  {id:'current',label:'Current commercial'},
] as const;

function statusClass(status:string){
  if(status==='accepted')return 'hq-status hq-status-ok';
  if(status==='declined')return 'hq-status hq-status-bad';
  if(status==='sent'||status==='approved')return 'hq-status hq-status-warn';
  return 'hq-status';
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

export default async function QuotesPage({searchParams}:{searchParams:Promise<{q?:string;status?:string}>}){
  await requireOfficeUser();
  const params=await searchParams;
  const q=(params.q??'').trim().toLowerCase();
  const filter=params.status??'all';
  const db=dbAdmin();
  const {data,error}=await db
    .from('quotes')
    .select('id,quote_number,title,status,pricing_mode,customer_id,updated_at,expiry_date,is_commercial_current,parent_quote_id,customer_snapshot')
    .order('created_at',{ascending:false})
    .limit(100);
  const quotes=(data||[]) as QuoteRow[];
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

  const visible=quotes.filter(row=>{
    const statusOk=
      filter==='all'||
      (filter==='current'?Boolean(row.is_commercial_current):row.status===filter);
    if(!statusOk)return false;
    if(!q)return true;
    const customer=row.customer_snapshot?.name||'';
    return `${row.quote_number} ${row.title||''} ${customer} ${row.status}`.toLowerCase().includes(q);
  });

  const qs=(status:string)=>{
    const sp=new URLSearchParams();
    if(q)sp.set('q',params.q??'');
    if(status&&status!=='all')sp.set('status',status);
    const s=sp.toString();
    return s?'?'+s:'';
  };

  return <main className="hq-detail"><div className="hq-detail-inner">
    <Link className="hq-back" href="/hq">← HQ overview</Link>
    <div className="hq-detail-head">
      <div>
        <div className="hq-kicker">EXCEPTIONAL ELECTRICAL HQ</div>
        <h1>Quotes</h1>
        <p>Create and manage draft quotations.</p>
      </div>
      <Link className="hq-detail-action-primary" href="/hq/quotes/new">+ New quote</Link>
    </div>
    <section className="hq-panel">
      <h2>Quote register</h2>
      <form method="get" className="ee-jobs-filters" style={{maxWidth:'100%'}}>
        <input name="q" defaultValue={params.q??''} placeholder="Search quote number, title or customer" aria-label="Search quotes"/>
        <input type="hidden" name="status" value={filter==='all'?'':filter}/>
        <button type="submit">Search</button>
      </form>
      <div className="hq-inbox-primary-tabs" role="tablist" aria-label="Quote status" style={{display:'flex',flexWrap:'wrap',gap:8,margin:'0 0 16px'}}>
        {STATUS_FILTERS.map(item=>(
          <Link
            key={item.id}
            href={'/hq/quotes'+qs(item.id)}
            className={filter===item.id?'is-selected':undefined}
            style={{
              display:'inline-flex',
              alignItems:'center',
              minHeight:36,
              padding:'6px 12px',
              borderRadius:999,
              border:'1px solid #d4e1ed',
              background:filter===item.id?'#eaf5ff':'#fff',
              color:'#17364b',
              textDecoration:'none',
              fontWeight:700,
              fontSize:13,
            }}
          >
            {item.label}
          </Link>
        ))}
      </div>
      {error?<p role="alert">Unable to load quotes.</p>:!visible.length?(
        <div className="ee-jobs-empty">
          <strong>{q||filter!=='all'?'No matching quotes':'No quotes yet'}</strong>
          <p>{q||filter!=='all'?'Try another search or filter.':'Create a quote to get started.'}</p>
          {!q&&filter==='all'&&<Link href="/hq/quotes/new">Create a quote →</Link>}
        </div>
      ):(
        <div className="hq-quote-list">
          {visible.map(row=>{
            const customer=row.customer_snapshot;
            const total=totals.get(row.id)||0;
            const expiry=expiryLabel(row.expiry_date);
            return (
              <Link key={row.id} href={'/hq/quotes/'+row.id}>
                <div>
                  <strong>{row.quote_number} · {row.title||'Untitled quote'}</strong>
                  <p>
                    {customer?.name||'Customer not selected'} · Updated{' '}
                    {new Date(row.updated_at).toLocaleDateString('en-AU',{timeZone:'Australia/Perth'})}
                    {row.is_commercial_current?' · Current commercial':''}
                  </p>
                </div>
                <div>
                  <strong>{formatAudFromCents(total)}</strong>
                  <span className={statusClass(row.status)}>{row.status.replaceAll('_',' ')}</span>
                  {expiry?<span className="hq-quote-expiry-chip">{expiry}</span>:null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
    <style>{`
      .hq-quote-list a>div:last-child{display:grid;justify-items:end;gap:6px}
      .hq-quote-expiry-chip{font-size:11px;color:#875b19;font-weight:700}
      .hq-status{display:inline-flex;align-items:center;padding:4px 9px;border-radius:999px;background:#e8f0fa;color:#194f7d;font-size:12px;font-weight:750;text-transform:capitalize}
      .hq-status-ok{background:#e4f6eb;color:#17633b}
      .hq-status-warn{background:#fff1db;color:#8c520b}
      .hq-status-bad{background:#fdecec;color:#9b3e36}
    `}</style>
  </div></main>;
}
