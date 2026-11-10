import Link from 'next/link';
import Image from 'next/image';
import {ArrowRight,LockKeyhole,ShieldCheck} from 'lucide-react';
import {loginAction} from '../actions';
import '../hq.css';
export const dynamic='force-dynamic';
export default async function Login({searchParams}:{searchParams:Promise<{error?:string}>}){
 const {error}=await searchParams;
 return <main className="hq-login hq-login-premium">
  <div className="hq-login-ambient" aria-hidden="true"/>
  <div className="hq-login-layout">
   <div className="hq-login-brand"><Link href="/" aria-label="Exceptional Electrical website"><Image src="/exceptional-electrical-logo.png" alt="Exceptional Electrical" width={250} height={92} priority unoptimized/></Link><span className="hq-login-brand-tag">OPERATIONS PORTAL</span></div>
   <section className="hq-login-card" aria-labelledby="hq-login-title">
    <div className="hq-login-card-top"><span className="hq-login-icon"><LockKeyhole size={22} strokeWidth={1.8}/></span><span>STAFF ACCESS</span></div>
    <h1 id="hq-login-title">Welcome back<span>.</span></h1>
    <p>Sign in to manage your enquiries, customers and day-to-day operations.</p>
    {error&&<div role="alert" className="hq-alert">{error==='access'?'This account has not been approved for HQ access.':'Email or password not recognised.'}</div>}
    <form action={loginAction}><label htmlFor="hq-login-email">Email address<input id="hq-login-email" name="email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder="you@example.com" required/></label><label htmlFor="hq-login-password">Password<input id="hq-login-password" name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required/></label><button className="hq-primary hq-login-submit" type="submit"><span>Sign in to HQ</span><ArrowRight size={19}/></button></form>
    <div className="hq-login-secure"><ShieldCheck size={17} aria-hidden="true"/> Authorised Exceptional Electrical staff only</div>
   </section>
   <div className="hq-login-footer"><span>EXCEPTIONAL ELECTRICAL HQ</span><Link href="/">Return to website</Link></div>
  </div>
 </main>;
}