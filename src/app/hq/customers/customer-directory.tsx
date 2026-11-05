'use client';
import {useMemo,useState} from 'react';
import Link from 'next/link';
type Customer={id:string;name:string;email:string|null;phone:string|null;created_at:string};
export default function CustomerDirectory({customers}:{customers:Customer[]}){
 const [query,setQuery]=useState('');
 const filtered=useMemo(()=>customers.filter(c=>[c.name,c.email,c.phone].some(v=>String(v??'').toLowerCase().includes(query.toLowerCase().trim()))),[customers,query]);
 return <><div className="hq-crm-search"><input aria-label="Search customers" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, email or phone…"/><span>{filtered.length} of {customers.length} customers</span></div>{filtered.length===0?<p>{customers.length?'No matching customers.':'No customers yet. Create one or convert an enquiry.'}</p>:<div className="hq-table-wrap"><table><thead><tr><th>NAME</th><th>EMAIL</th><th>PHONE</th><th>ADDED</th></tr></thead><tbody>{filtered.map(c=><tr key={c.id}><td><Link href={'/hq/customers/'+c.id}><strong>{c.name}</strong></Link></td><td>{c.email||'—'}</td><td>{c.phone||'—'}</td><td>{new Date(c.created_at).toLocaleDateString('en-AU',{timeZone:'Australia/Perth'})}</td></tr>)}</tbody></table></div>}</>;
}