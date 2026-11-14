import CustomerCreate from './customer-create';
import CustomerDirectory from './customer-directory';
import Link from 'next/link';
import {dbAdmin,requireOfficeUser} from '@/lib/hq-auth';
import {logoutAction} from '../actions';
import '../hq.css';
export const dynamic='force-dynamic';
type Customer={id:string;name:string;email:string|null;phone:string|null;created_at:string};
export default async function CustomersPage(){
 const user=await requireOfficeUser();
 const db=dbAdmin();
 const {data,error}=await db.from('customers').select('id,name,email,phone,created_at').order('created_at',{ascending:false}).limit(500);
 const customers=(data??[]) as Customer[];
 return <main className="hq-app"><aside className="hq-sidebar"><div className="hq-brand">EXCEPTIONAL <span>ELECTRICAL</span><small>HQ / OPERATIONS</small></div><nav><Link href="/hq">▦ &nbsp; Overview</Link><Link href="/hq#enquiries">▤ &nbsp; Enquiries</Link><Link href="/hq/customers" className="selected">♙ &nbsp; Customers</Link><span className="hq-nav-disabled">Jobs <small>COMING SOON</small></span><span className="hq-nav-disabled">Scheduling <small>COMING SOON</small></span></nav><div className="hq-sidebar-bottom"><div>{user.name}<small>{user.role.toUpperCase()}</small></div><form action={logoutAction}><button type="submit">Sign out ↗</button></form></div></aside><div className="hq-main"><header className="hq-top"><span>OPERATIONS / CUSTOMERS</span><span className="hq-online">● Secure staff workspace</span></header><div className="hq-content"><div className="hq-heading"><div><div className="hq-kicker">CUSTOMER RELATIONSHIPS</div><h1>Customers</h1><p>Customer profiles linked to incoming enquiries and future jobs.</p></div><div className="hq-user">{user.name}</div></div><section className="hq-panel"><div className="hq-panel-heading"><div><div className="hq-kicker">DIRECTORY</div><h2>Customer records</h2></div><CustomerCreate/></div>{error?<p role="alert">Unable to load customers.</p>:<CustomerDirectory customers={customers}/>} </section></div></div></main>;
}