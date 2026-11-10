import Link from 'next/link';
import Image from 'next/image';
import {ShieldCheck} from 'lucide-react';
import LoginForm from './login-form';
import '../hq.css';
export const dynamic='force-dynamic';
export default async function Login({searchParams}:{searchParams:Promise<{error?:string}>}){
 const {error}=await searchParams;
 return <main className="hq-login hq-login-premium hq-login-refined">
  <div className="hq-login-ambient" aria-hidden="true"/>
  <div className="hq-login-layout">
   <section className="hq-login-card" aria-labelledby="hq-login-title">
    <div className="hq-login-card-brand"><Image src="/exceptional-electrical-logo.png" alt="Exceptional Electrical" width={270} height={100} priority unoptimized/><span>HQ</span></div>
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