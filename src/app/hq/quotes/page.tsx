import Link from 'next/link';
import {requireHqUser,dbAdmin} from '@/lib/hq-auth';
import '../hq.css';
export const dynamic='force-dynamic';
export default async function QuotesPage(){
 await requireHqUser();
 const {data,error}=await dbAdmin().from('quotes').select('id,quote_number,title,status').order('created_at',{ascending:false}).limit(100);
 return <main className="hq-detail"><div className="hq-detail-inner"><Link className="hq-back" href="/hq">← HQ overview</Link><div className="hq-detail-head"><div><div className="hq-kicker">EXCEPTIONAL ELECTRICAL HQ</div><h1>Quotes</h1><p>Create and manage draft quotations.</p></div><Link className="hq-detail-action-primary" href="/hq/quotes/new">+ New quote</Link></div><section className="hq-panel"><h2>Quote register</h2>{error?<p>Unable to load quotes.</p>:!data?.length?<p>No quotes yet.</p>:<ul>{data.map(q=><li key={q.id}><Link href={'/hq/quotes/'+q.id}>{q.quote_number} · {q.title||'Untitled quote'} · {q.status}</Link></li>)}</ul>}</section></div></main>;
}