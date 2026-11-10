import Link from 'next/link';
import Image from 'next/image';
import {LockKeyhole,ShieldCheck} from 'lucide-react';
import LoginForm from './login-form';
import '../hq.css';
export const dynamic='force-dynamic';
export default async function Login({searchParams}:{searchParams:Promise<{error?:string}>}){
 const {error}=await searchParams;
 return <main className="hq-login hq-login-premium hq-login-refined">
  <div className="hq-login-ambient" aria-hidden="true"/>
  <div className="hq-login-layout">
   <div className="hq-login-brand"><Link href="/" aria-label="Exceptional Electrical website"><span className="hq-login-logo-stack"><Image className="hq-login-logo-light" src="/exceptional-electrical-logo.png" alt="Exceptional Electrical" width={250} height={92} priority unoptimized/><Image className="hq-login-logo-blue" src="/exceptional-electrical-logo.png" alt="" aria-hidden="true" width={250} height={92} unoptimized/></span></Link><span className="hq-login-brand-tag">HQ</span></div>
   <section className="hq-login-card" aria-labelledby="hq-login-title">
    <div className="hq-login-card-top"><span className="hq-login-icon"><LockKeyhole size={20} strokeWidth={1.8}/></span><span>STAFF ACCESS</span></div>
    <h1 id="hq-login-title">Welcome back<span>.</span></h1>
    <p>Sign in to your workspace.</p>
    {error&&<div role="alert" className="hq-alert">{error==='access'?'This account has not been approved for HQ access.':'Email or password not recognised.'}</div>}
    <LoginForm/>
    <div className="hq-login-secure"><ShieldCheck size={17} aria-hidden="true"/> Authorised Exceptional Electrical staff only</div>
   </section>
   <div className="hq-login-footer"><Link href="/">Return to website</Link></div>
  </div>
 </main>;
}