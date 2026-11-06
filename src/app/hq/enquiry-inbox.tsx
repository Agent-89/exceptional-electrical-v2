'use client';
import {useMemo,useState} from 'react';
import Link from 'next/link';
type Enquiry={id:string;name:string;service:string;status:string;suburb:string|null;created_at:string;email:string};
const statuses=['all','new','contacted','qualified','scheduled','closed','spam'];
const label=(v:string)=>v==='all'?'All':v.charAt(0).toUpperCase()+v.slice(1);
const date=(v:string)=>new Date(v).toLocaleDateString('en-AU',{timeZone:'Australia/Perth',day:'numeric',month:'short',year:'numeric'});
const time=(v:string)=>new Date(v).toLocaleTimeString('en-AU',{timeZone:'Australia/Perth',hour:'numeric',minute:'2-digit'});
export default function EnquiryInbox({enquiries}:{enquiries:Enquiry[]}){
 const [search,setSearch]=useState('');
 const [status,setStatus]=useState('all');
 const [sort,setSort]=useState('newest');
 const filtered=useMemo(()=>enquiries.filter(e=>(status==='all'||e.status===status)&&[e.name,e.email,e.service,e.suburb??''].join(' ').toLowerCase().includes(search.trim().toLowerCase())).sort((a,b)=>sort==='oldest'?Date.parse(a.created_at)-Date.parse(b.created_at):Date.parse(b.created_at)-Date.parse(a.created_at)),[enquiries,search,status,sort]);
 const counts=(s:string)=>s==='all'?enquiries.length:enquiries.filter(e=>e.status===s).length;
 return <div className="hq-inbox">
 <div className="hq-inbox-toolbar"><label className="hq-search-label"><span className="hq-visually-hidden">Search enquiries</span><input type="search" placeholder="Search customer, service or suburb…" value={search} onChange={e=>setSearch(e.target.value)}/></label><label className="hq-sort-label"><span className="hq-visually-hidden">Sort enquiries</span><select value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label></div>
 <div className="hq-inbox-tabs" role="group" aria-label="Filter by status">{statuses.map(s=><button key={s} type="button" className={status===s?'active':''} aria-pressed={status===s} onClick={()=>setStatus(s)}>{label(s)} <span>{counts(s)}</span></button>)}</div>
 <div className="hq-inbox-count" aria-live="polite">{filtered.length} enquir{filtered.length===1?'y':'ies'} found</div>
 {filtered.length===0?<div className="hq-inbox-empty"><strong>No enquiries found</strong><p>Try a different search or status filter.</p><button type="button" onClick={()=>{setSearch('');setStatus('all')}}>Clear filters</button></div>:<>
 <div className="hq-inbox-desktop"><table><thead><tr><th>Customer</th><th>Request</th><th>Location</th><th>Received</th><th>Status</th><th><span className="hq-visually-hidden">Open</span></th></tr></thead><tbody>{filtered.map(e=><tr key={e.id}><td><Link className="hq-inbox-name" href={'/hq/enquiries/'+e.id}>{e.name||'Unknown caller'}</Link>{e.email&&<small>{e.email}</small>}</td><td><span className="hq-service">{e.service||'General enquiry'}</span></td><td>{e.suburb||'Not provided'}</td><td>{date(e.created_at)}<small>{time(e.created_at)}</small></td><td><span className={'hq-status hq-status-'+e.status}>{label(e.status)}</span></td><td><Link className="hq-open-link" href={'/hq/enquiries/'+e.id}>Open →</Link></td></tr>)}</tbody></table></div>
 <div className="hq-inbox-mobile">{filtered.map(e=><Link key={e.id} href={'/hq/enquiries/'+e.id} className="hq-inbox-card"><div className="hq-card-top"><strong>{e.name||'Unknown caller'}</strong><span className={'hq-status hq-status-'+e.status}>{label(e.status)}</span></div><div className="hq-card-service">{e.service||'General enquiry'}</div><div className="hq-card-meta"><span>{e.suburb||'Location not provided'}</span><span>{date(e.created_at)} · {time(e.created_at)}</span></div><span className="hq-card-open">View enquiry →</span></Link>)}</div>
 </>}</div>;
}
