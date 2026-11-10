'use client';
import {useState} from 'react';
import {Eye,EyeOff,ArrowRight} from 'lucide-react';
import {loginAction} from '../actions';

export default function LoginForm(){
 const [showPassword,setShowPassword]=useState(false);
 return <form action={loginAction}>
  <label htmlFor="hq-login-email">Email address<input id="hq-login-email" name="email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder="you@example.com" required/></label>
  <label htmlFor="hq-login-password">Password
   <span className="hq-login-password-wrap"><input id="hq-login-password" name="password" type={showPassword?'text':'password'} autoComplete="current-password" placeholder="Enter your password" required/>
   <button type="button" className="hq-login-password-toggle" aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword} onClick={()=>setShowPassword(v=>!v)}>{showPassword?<EyeOff size={20}/>:<Eye size={20}/>}</button></span>
  </label>
  <label className="hq-login-remember"><input type="checkbox" name="remember" value="on"/><span>Remember me on this device</span></label>
  <button className="hq-primary hq-login-submit" type="submit"><span>Sign in to HQ</span><ArrowRight size={19}/></button>
 </form>;
}
