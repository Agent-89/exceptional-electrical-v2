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

export default async function QuotesPage(){
  await requireOfficeUser();
  const db=dbAdmin();
  const {data,error}=await db
    .from('quotes')
    .select('id,quote_number,title,status,pricing_mode,customer_id,updated_at,customer_snapshot')
    .order('created_at',{ascending:false})
    .limit(100);
  const quotes=(data||[]) as QuoteRow[];
  const quoteIds=quotes.map(q=>q.id);
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
    for(const q of quotes){
      totals.set(q.id,quoteTotalIncGstCents(byQuote.get(q.id)||[],q.pricing_mode));
    }
  }

  return <main className="hq-detail"><div className="hq-detail-inner"><Link className="hq-back" href="/hq">← HQ overview</Link><div className="hq-detail-head"><div><div className="hq-kicker">EXCEPTIONAL ELECTRICAL HQ</div><h1>Quotes</h1><p>Create and manage draft quotations.</p></div><Link className="hq-detail-action-primary" href="/hq/quotes/new">+ New quote</Link></div><section className="hq-panel"><h2>Quote register</h2>{error?<p>Unable to load quotes.</p>:!quotes.length?<p>No quotes yet.</p>:<div className="hq-quote-list">{quotes.map(q=>{const customer=q.customer_snapshot;const total=totals.get(q.id)||0;return <Link key={q.id} href={'/hq/quotes/'+q.id}><div><strong>{q.quote_number} · {q.title||'Untitled quote'}</strong><p>{customer?.name||'Customer not selected'} · Updated {new Date(q.updated_at).toLocaleDateString('en-AU',{timeZone:'Australia/Perth'})}</p></div><div><strong>{formatAudFromCents(total)}</strong><span>{q.status.replaceAll('_',' ')}</span></div></Link>})}</div>}</section></div></main>;
}
