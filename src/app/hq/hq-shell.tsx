'use client';
import Link from 'next/link';
import Image from 'next/image';
import {logoutAction} from './actions';
import {usePathname} from 'next/navigation';
import {useEffect,useRef,useState} from 'react';
import {House,Inbox,UsersRound,FileText,Menu,X,LogOut} from 'lucide-react';

const items=[{href:'/hq',label:'Home',icon:House},{href:'/hq/enquiries',label:'Enquiries',icon:Inbox},{href:'/hq/customers',label:'Customers',icon:UsersRound},{href:'/hq/quotes',label:'Quotes',icon:FileText}];
export default function HqShell({children}:{children:React.ReactNode}){
 const pathname=usePathname();
 const [menu,setMenu]=useState(false);
 const [showStartup,setShowStartup]=useState(true);
 useEffect(()=>{if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){setShowStartup(false);return}try{if(sessionStorage.getItem('ee-hq-startup-seen')){setShowStartup(false);return}sessionStorage.setItem('ee-hq-startup-seen','1')}catch{/* Still show the opening on storage-restricted browsers. */}const timer=setTimeout(()=>setShowStartup(false),1400);return()=>clearTimeout(timer)},[]);
 const [navigating,setNavigating]=useState(false);
 const navigationDelay=useRef<ReturnType<typeof setTimeout>|null>(null);
 const clearNavigation=()=>{if(navigationDelay.current)clearTimeout(navigationDelay.current);navigationDelay.current=null;setNavigating(false)};
 useEffect(()=>{clearNavigation();return ()=>{if(navigationDelay.current)clearTimeout(navigationDelay.current)}},[pathname]);
 useEffect(()=>{const onClick=(event:MouseEvent)=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;const target=event.target;if(!(target instanceof Element))return;const anchor=target.closest('a[href]') as HTMLAnchorElement|null;if(!anchor||anchor.target==='_blank'||anchor.hasAttribute('download'))return;const url=new URL(anchor.href,window.location.href);if(url.origin!==window.location.origin||!url.pathname.startsWith('/hq')||url.pathname===window.location.pathname&&url.search===window.location.search)return;if(navigationDelay.current)clearTimeout(navigationDelay.current);navigationDelay.current=setTimeout(()=>setNavigating(true),180)};document.addEventListener('click',onClick,true);const onPageShow=()=>clearNavigation();window.addEventListener('pageshow',onPageShow);return()=>{document.removeEventListener('click',onClick,true);window.removeEventListener('pageshow',onPageShow)}},[]);
 useEffect(()=>setMenu(false),[pathname]);
 if(pathname==='/hq/login'||pathname.startsWith('/hq/login/')||/^\/hq\/quotes\/[^/]+\/preview\/?$/.test(pathname))return <>{children}</>;
 const active=(href:string)=>href==='/hq'?pathname==='/hq':pathname===href||pathname.startsWith(href+'/');
 return <div className="hq-shell">
  {navigating&&<div className="hq-navigation-progress" role="progressbar" aria-label="Opening page"/>}
  {showStartup&&<div className="hq-startup" role="status" aria-label="Opening Exceptional Electrical HQ" onClick={()=>setShowStartup(false)}><div className="hq-startup-brand"><div className="hq-startup-mark"><Image className="hq-startup-outline" src="/exceptional-electrical-logo.png" alt="" width={240} height={88} unoptimized priority/><div className="hq-startup-fill" aria-hidden="true"><Image src="/exceptional-electrical-logo.png" alt="" width={240} height={88} unoptimized priority/></div></div><strong>EXCEPTIONAL ELECTRICAL</strong><span>HQ</span></div></div>}
  <header className="hq-shell-header">
   <button type="button" className="hq-shell-icon-button" aria-label="Open navigation menu" aria-expanded={menu} onClick={()=>setMenu(v=>!v)}><Menu size={23} strokeWidth={2}/></button>
   <Link href="/hq" className="hq-shell-logo" aria-label="Exceptional Electrical HQ home"><Image src="/exceptional-electrical-logo.png" alt="Exceptional Electrical" width={240} height={88} priority unoptimized/></Link>
   <span className="hq-shell-header-spacer" aria-hidden="true"/>
  </header>
  <><button className={`hq-shell-scrim${menu?' is-open':''}`} aria-label="Close navigation menu" tabIndex={menu?0:-1} aria-hidden={!menu} onClick={()=>setMenu(false)}/><aside className={`hq-shell-drawer${menu?' is-open':''}`} aria-label="HQ menu" aria-hidden={!menu} inert={!menu}>
   <div className="hq-shell-drawer-heading"><Link href="/hq" className="hq-shell-drawer-brand" aria-label="Exceptional Electrical HQ home"><Image src="/exceptional-electrical-logo.png" alt="Exceptional Electrical" width={180} height={66} unoptimized/><span>HQ</span></Link><button onClick={()=>setMenu(false)} aria-label="Close menu"><X size={20}/></button></div>
   <nav>{items.map(item=><Link key={item.href} href={item.href} aria-current={active(item.href)?'page':undefined}><item.icon size={19} strokeWidth={1.9} aria-hidden="true"/><span>{item.label}</span></Link>)}</nav>
   <div className="hq-shell-drawer-future"><span>Coming later</span><p>Jobs · Scheduling · Inventory · Purchasing · Reports</p></div><form action={logoutAction} className="hq-shell-logout-form"><button type="submit" className="hq-shell-logout"><LogOut size={19} strokeWidth={1.9} aria-hidden="true"/><span>Log out</span></button></form>
  </aside></>
  <div className="hq-shell-content" id="hq-main-content">{children}</div>
  <nav className="hq-shell-bottom" aria-label="HQ sections">{items.map(item=><Link key={item.href} href={item.href} prefetch aria-current={active(item.href)?'page':undefined}><span aria-hidden="true" className="hq-shell-nav-icon"><item.icon size={22} strokeWidth={1.9}/></span><span>{item.label}</span></Link>)}</nav>
  <style>{` .hq-navigation-progress{position:fixed;top:0;left:0;right:0;height:3px;z-index:10000;pointer-events:none;background:linear-gradient(90deg,#0878b9 0%,#3bb5f0 50%,#0878b9 100%);background-size:200% 100%;animation:hq-progress-shift 1.1s linear infinite}@keyframes hq-progress-shift{to{background-position:-200% 0}}@media(prefers-reduced-motion:reduce){.hq-navigation-progress{animation:none}} `}</style>
 </div>;
}
