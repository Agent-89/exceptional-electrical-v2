'use client';
import {useMemo,useState} from 'react';
import Link from 'next/link';
type Enquiry={id:string;name:string;service:string;status:string;suburb:string|null;created_at:string;email:string};
const statuses=['all','new','contacted','qualified','scheduled','closed','spam'];
export default function EnquiryInbox({enquiries}:{enquiries:Enquiry[]}){
 const [search,setSearch]=useState('');
 const [status,setStatus]=useState('all');
 const filtered=useMemo(()=>enquiries.filter(e=>(status==='all'||e.status===status)&&[e.name,e.email,e.service,e.suburb??''].join(' ').toLowerCase().includes(search.trim().toLowerCase())),[enquiries,search,status]);
 return <><div className="hq-filters"><label>Search enquiries<input type="search" placeholder="Customer, email, suburb or service" value={search} onChange={e=>setSearch(e.target.value)}/></label><label>Status<select value={status} onChange={e=>setStatus(e.target.value)}>{statuses.map(s=><option value={s} key={s}>{s==='all'?'All statuses':s[0].toUpperCase()+s.slice(1)}</option>)}</select></label><span>{filtered.length} result{filtered.length===1?'':'s'}</span></div>{filtered.length===0?<p>No enquiries match your filters.</p>:<div className="hq-table-wrap"><table><thead><tr><th>CUSTOMER</th><th>SERVICE</th><th>LOCATION</th><th>RECEIVED</th><th>STATUS</th><th></th></tr></thead><tbody>{filtered.map(e=><tr key={e.id}><td><strong>{e.name}</strong><small>{e.email}</small></td><td>{e.service}</td><td>{e.suburb||'—'}</td><td>{new Date(e.created_at).toLocaleDateString('en-AU',{timeZone:'Australia/Perth',day:'numeric',month:'short',year:'numeric'})}</td><td><span className={'hq-status hq-status-'+e.status}>{e.status}</span></td><td><Link href={'/hq/enquiries/'+e.id}>View →</Link></td></tr>)}</tbody></table></div>}</>;
}
