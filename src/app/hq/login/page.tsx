import Link from 'next/link';
import { loginAction } from '../actions';
import '../hq.css';
export const dynamic='force-dynamic';
export default async function Login({searchParams}:{searchParams:Promise<{error?:string}>}){
 const {error}=await searchParams;
 return <main className="hq-login"><section className="hq-login-card"><div className="hq-kicker">EXCEPTIONAL ELECTRICAL</div><h1>Welcome to HQ.</h1><p>Sign in with your approved staff account to manage enquiries and operations.</p>
 {error&&<div role="alert" className="hq-alert">{error==='access'?'This account has not been approved for HQ access.':'Email or password not recognised.'}</div>}
 <form action={loginAction}><label>Email address<input name="email" type="email" autoComplete="username" required/></label><label>Password<input name="password" type="password" autoComplete="current-password" required/></label><button className="hq-primary" type="submit">SIGN IN TO HQ →</button></form>
 <Link className="hq-back" href="/">← Back to website</Link></section></main>;
}
