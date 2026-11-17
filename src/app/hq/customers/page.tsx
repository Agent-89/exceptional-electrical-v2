import CustomerCreate from './customer-create';
import CustomerDirectory from './customer-directory';
import Link from 'next/link';
import {dbAdmin,requireOfficeUser} from '@/lib/hq-auth';
import '../hq.css';
export const dynamic='force-dynamic';
type Customer={id:string;name:string;email:string|null;phone:string|null;created_at:string};
export default async function CustomersPage(){
 await requireOfficeUser();
 const db=dbAdmin();
 const {data,error}=await db.from('customers').select('id,name,email,phone,created_at').order('created_at',{ascending:false}).limit(500);
 const customers=(data??[]) as Customer[];
 return <main className="hq-detail"><div className="hq-detail-inner"><Link className="hq-back" href="/hq">← HQ overview</Link><div className="hq-detail-head"><div><div className="hq-kicker">CUSTOMER RELATIONSHIPS</div><h1>Customers</h1></div><CustomerCreate/></div><section className="hq-panel"><div className="hq-panel-heading"><div><div className="hq-kicker">DIRECTORY</div><h2>Customer records</h2></div></div>{error?<p role="alert">Unable to load customers.</p>:<CustomerDirectory customers={customers}/>}</section></div></main>;
}
