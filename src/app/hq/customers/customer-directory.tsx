'use client';
import {useMemo,useState} from 'react';
import Link from 'next/link';
import {ChevronRight} from 'lucide-react';

type Customer={id:string;name:string;email:string|null;phone:string|null;created_at:string;updated_at:string|null};
type SortId='name_asc'|'name_desc'|'newest'|'oldest'|'updated';

const SORT_OPTIONS:{id:SortId;label:string}[]=[
 {id:'name_asc',label:'Name A–Z'},
 {id:'name_desc',label:'Name Z–A'},
 {id:'newest',label:'Newest added'},
 {id:'oldest',label:'Oldest added'},
 {id:'updated',label:'Recently updated'},
];

const addedDate=(iso:string)=>new Date(iso).toLocaleDateString('en-AU',{timeZone:'Australia/Perth'});

function compareCustomers(a:Customer,b:Customer,sort:SortId){
 if(sort==='name_asc')return a.name.localeCompare(b.name,undefined,{sensitivity:'base'});
 if(sort==='name_desc')return b.name.localeCompare(a.name,undefined,{sensitivity:'base'});
 if(sort==='newest')return b.created_at.localeCompare(a.created_at);
 if(sort==='oldest')return a.created_at.localeCompare(b.created_at);
 const aUpdated=a.updated_at||a.created_at;
 const bUpdated=b.updated_at||b.created_at;
 return bUpdated.localeCompare(aUpdated);
}

export default function CustomerDirectory({customers}:{customers:Customer[]}){
 const [query,setQuery]=useState('');
 const [sort,setSort]=useState<SortId>('name_asc');
 const filtered=useMemo(()=>{
  const q=query.toLowerCase().trim();
  const matched=customers.filter(c=>[c.name,c.email,c.phone].some(v=>String(v??'').toLowerCase().includes(q)));
  return [...matched].sort((a,b)=>compareCustomers(a,b,sort));
 },[customers,query,sort]);

 return <><div className="hq-crm-search">
  <input aria-label="Search customers" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, email or phone…"/>
  <label className="hq-crm-sort">
   <span>Sort by</span>
   <select aria-label="Sort customers" value={sort} onChange={e=>setSort(e.target.value as SortId)}>
    {SORT_OPTIONS.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}
   </select>
  </label>
  <span>{filtered.length} of {customers.length} customers</span>
 </div>{filtered.length===0?<p>{customers.length?'No matching customers.':'No customers yet. Create one or convert an enquiry.'}</p>:<>
  <div className="hq-inbox-desktop hq-table-wrap"><table><thead><tr><th>NAME</th><th>EMAIL</th><th>PHONE</th><th>ADDED</th></tr></thead><tbody>{filtered.map(c=><tr key={c.id}><td><Link href={'/hq/customers/'+c.id}><strong>{c.name}</strong></Link></td><td>{c.email||'—'}</td><td>{c.phone||'—'}</td><td>{addedDate(c.created_at)}</td></tr>)}</tbody></table></div>
  <div className="hq-inbox-mobile hq-inbox-compact-list">{filtered.map(c=><Link key={c.id} href={'/hq/customers/'+c.id} className="hq-inbox-compact-row"><div className="hq-inbox-compact-avatar" aria-hidden="true">{(c.name||'?').trim().slice(0,1).toUpperCase()}</div><div className="hq-inbox-compact-body"><div className="hq-inbox-compact-heading"><strong>{c.name}</strong><time dateTime={c.created_at}>{addedDate(c.created_at)}</time></div><div className="hq-inbox-compact-subtitle">{[c.phone,c.email].filter(Boolean).join(' · ')||'No contact details'}</div></div><ChevronRight className="hq-inbox-compact-chevron" size={18} strokeWidth={2.2} aria-hidden="true"/></Link>)}</div>
 </>}</>;
}
