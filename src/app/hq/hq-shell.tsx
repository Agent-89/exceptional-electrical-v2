'use client';
import Link from 'next/link';
import Image from 'next/image';
import {usePathname} from 'next/navigation';
import {useEffect,useRef,useState} from 'react';

const items=[{href:'/hq',label:'Home',icon:'⌂'},{href:'/hq/enquiries',label:'Enquiries',icon:'▤'},{href:'/hq/customers',label:'Customers',icon:'♙'},{href:'/hq/quotes',label:'Quotes',icon:'▧'}];
export default function HqShell({children}:{children:React.ReactNode}){
 const pathname=usePathname();
 const [menu,setMenu]=useState(false);
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
  <header className="hq-shell-header">
   <button type="button" className="hq-shell-icon-button" aria-label="Open navigation menu" aria-expanded={menu} onClick={()=>setMenu(v=>!v)}>☰</button>
   <Link href="/hq" className="hq-shell-logo" aria-label="Exceptional Electrical HQ home"><Image src="/exceptional-electrical-logo.png" alt="Exceptional Electrical" width={240} height={88} priority unoptimized/></Link>
   <button type="button" className="hq-shell-icon-button hq-shell-profile" aria-label="Open staff menu" onClick={()=>setMenu(v=>!v)}>♙</button>
  </header>
  {menu&&<><button className="hq-shell-scrim" aria-label="Close navigation menu" onClick={()=>setMenu(false)}/><aside className="hq-shell-drawer" aria-label="HQ menu">
   <div className="hq-shell-drawer-heading"><strong>Exceptional Electrical HQ</strong><button onClick={()=>setMenu(false)} aria-label="Close menu">✕</button></div>
   <nav>{items.map(item=><Link key={item.href} href={item.href} aria-current={active(item.href)?'page':undefined}>{item.label}</Link>)}</nav>
   <div className="hq-shell-drawer-future"><span>Coming later</span><p>Jobs · Scheduling · Inventory · Purchasing · Reports</p></div>
  </aside></>}
  <div className="hq-shell-content" id="hq-main-content">{children}</div>
  <nav className="hq-shell-bottom" aria-label="HQ sections">{items.map(item=><Link key={item.href} href={item.href} prefetch aria-current={active(item.href)?'page':undefined}><span aria-hidden="true" className="hq-shell-nav-icon">{item.icon}</span><span>{item.label}</span></Link>)}</nav>
  <style>{` .hq-navigation-progress{position:fixed;top:0;left:0;right:0;height:3px;z-index:10000;pointer-events:none;background:linear-gradient(90deg,#0878b9 0%,#3bb5f0 50%,#0878b9 100%);background-size:200% 100%;animation:hq-progress-shift 1.1s linear infinite}@keyframes hq-progress-shift{to{background-position:-200% 0}}@media(prefers-reduced-motion:reduce){.hq-navigation-progress{animation:none}} `}</style>
 </div>;
}
