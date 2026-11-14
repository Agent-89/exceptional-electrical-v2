'use client';
import Link from 'next/link';
import Image from 'next/image';
import {logoutAction} from './actions';
import {usePathname} from 'next/navigation';
import {useEffect,useRef,useState} from 'react';
import {House,Inbox,UsersRound,FileText,BriefcaseBusiness,CalendarDays,Menu,X,LogOut,PanelLeftClose,PanelLeftOpen,CalendarCheck2,Wrench,CircleUserRound} from 'lucide-react';
import type {HqRole} from '@/lib/hq-roles';
import {isTechnicianRole} from '@/lib/hq-roles';

const officeItems=[{href:'/hq',label:'Home',icon:House},{href:'/hq/enquiries',label:'Enquiries',icon:Inbox},{href:'/hq/customers',label:'Customers',icon:UsersRound},{href:'/hq/quotes',label:'Quotes',icon:FileText},{href:'/hq/jobs',label:'Jobs',icon:BriefcaseBusiness}];
const officeDrawer=[...officeItems,{href:'/hq/schedule',label:'Schedule',icon:CalendarDays}];
const techItems=[{href:'/hq/tech',label:'Today',icon:CalendarCheck2},{href:'/hq/tech/jobs',label:'My Jobs',icon:Wrench},{href:'/hq/tech/account',label:'Account',icon:CircleUserRound}];

export default function HqShell({children,role}:{children:React.ReactNode;role:HqRole|null}){
 const pathname=usePathname();
 const technician=role?isTechnicianRole(role):pathname.startsWith('/hq/tech');
 const items=technician?techItems:officeItems;
 const drawerItems=technician?techItems:officeDrawer;
 const homeHref=technician?'/hq/tech':'/hq';
 const [menu,setMenu]=useState(false);
 const [compactSidebar,setCompactSidebar]=useState(false);
 const [showStartup,setShowStartup]=useState(true);
 useEffect(()=>{if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){setShowStartup(false);return}try{if(sessionStorage.getItem('ee-hq-startup-seen')){setShowStartup(false);return}sessionStorage.setItem('ee-hq-startup-seen','1')}catch{/* Still show the opening on storage-restricted browsers. */}const timer=setTimeout(()=>setShowStartup(false),1400);return()=>clearTimeout(timer)},[]);
 const [navigating,setNavigating]=useState(false);
 const navigationDelay=useRef<ReturnType<typeof setTimeout>|null>(null);
 const clearNavigation=()=>{if(navigationDelay.current)clearTimeout(navigationDelay.current);navigationDelay.current=null;setNavigating(false)};
 useEffect(()=>{clearNavigation();return ()=>{if(navigationDelay.current)clearTimeout(navigationDelay.current)}},[pathname]);
 useEffect(()=>{const onClick=(event:MouseEvent)=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;const target=event.target;if(!(target instanceof Element))return;const anchor=target.closest('a[href]') as HTMLAnchorElement|null;if(!anchor||anchor.target==='_blank'||anchor.hasAttribute('download'))return;const url=new URL(anchor.href,window.location.href);if(url.origin!==window.location.origin||!url.pathname.startsWith('/hq')||url.pathname===window.location.pathname&&url.search===window.location.search)return;if(navigationDelay.current)clearTimeout(navigationDelay.current);navigationDelay.current=setTimeout(()=>setNavigating(true),180)};document.addEventListener('click',onClick,true);const onPageShow=()=>clearNavigation();window.addEventListener('pageshow',onPageShow);return()=>{document.removeEventListener('click',onClick,true);window.removeEventListener('pageshow',onPageShow)}},[]);
 useEffect(()=>setMenu(false),[pathname]);
 useEffect(()=>{try{setCompactSidebar(localStorage.getItem('ee-hq-sidebar-compact')==='yes')}catch{}},[]);
 const toggleSidebar=()=>setCompactSidebar(v=>{const next=!v;try{localStorage.setItem('ee-hq-sidebar-compact',next?'yes':'no')}catch{}return next});
 if(pathname==='/hq/login'||pathname.startsWith('/hq/login/')||/^\/hq\/quotes\/[^/]+\/preview\/?$/.test(pathname))return <>{children}</>;
 const active=(href:string)=>{
  if(href==='/hq')return pathname==='/hq';
  if(href==='/hq/tech')return pathname==='/hq/tech';
  return pathname===href||pathname.startsWith(href+'/');
 };
 return <div className={'hq-shell'+(compactSidebar?' hq-sidebar-compact':'')}>
  {navigating&&<div className="hq-navigation-progress" role="progressbar" aria-label="Opening page"/>}
  {showStartup&&<div className="hq-startup" role="status" aria-label="Opening Exceptional Electrical HQ" onClick={()=>setShowStartup(false)}><div className="hq-startup-brand"><div className="hq-startup-mark"><Image className="hq-startup-outline" src="/exceptional-electrical-logo.png" alt="" width={240} height={88} unoptimized priority/><div className="hq-startup-fill" aria-hidden="true"><Image src="/exceptional-electrical-logo.png" alt="" width={240} height={88} unoptimized priority/></div></div><strong>EXCEPTIONAL ELECTRICAL</strong><span>HQ</span></div></div>}
  <header className="hq-shell-header">
   <button type="button" className="hq-shell-icon-button" aria-label="Open navigation menu" aria-expanded={menu} onClick={()=>setMenu(v=>!v)}><Menu size={23} strokeWidth={2}/></button>
   <Link href={homeHref} className="hq-shell-logo" aria-label="Exceptional Electrical HQ home"><Image src="/exceptional-electrical-logo.png" alt="Exceptional Electrical" width={240} height={88} priority unoptimized/></Link>
   <span className="hq-shell-header-spacer" aria-hidden="true"/>
  </header>
  <><button className={`hq-shell-scrim${menu?' is-open':''}`} aria-label="Close navigation menu" tabIndex={menu?0:-1} aria-hidden={!menu} onClick={()=>setMenu(false)}/><aside className={`hq-shell-drawer${menu?' is-open':''}`} aria-label="HQ menu" aria-hidden={!menu} inert={!menu}>
   <div className="hq-shell-drawer-heading"><Link href={homeHref} className="hq-shell-drawer-brand" aria-label="Exceptional Electrical HQ home"><Image src="/exceptional-electrical-logo.png" alt="Exceptional Electrical" width={180} height={66} unoptimized/><span>HQ</span></Link><button onClick={()=>setMenu(false)} aria-label="Close menu"><X size={20}/></button></div>
   <nav>{drawerItems.map(item=><Link key={item.href} href={item.href} aria-current={active(item.href)?'page':undefined}><item.icon size={19} strokeWidth={1.9} aria-hidden="true"/><span>{item.label}</span></Link>)}</nav>
   <div className="hq-shell-drawer-future"><span>Coming later</span><p>{technician?'Visit updates · Photos · Time':'Inventory · Purchasing · Reports'}</p></div><form action={logoutAction} className="hq-shell-logout-form"><button type="submit" className="hq-shell-logout"><LogOut size={19} strokeWidth={1.9} aria-hidden="true"/><span>Log out</span></button></form>
  </aside></>
  <aside className="hq-shell-desktop-sidebar" aria-label="Desktop HQ navigation"><div className="hq-desktop-nav-heading"><Link href={homeHref} className="hq-desktop-sidebar-brand" aria-label="Exceptional Electrical HQ home"><Image src="/exceptional-electrical-logo.png" alt="Exceptional Electrical" width={130} height={48} unoptimized/></Link><button type="button" onClick={toggleSidebar} aria-label={compactSidebar?'Expand sidebar':'Collapse sidebar'} title={compactSidebar?'Expand sidebar':'Collapse sidebar'}>{compactSidebar?<PanelLeftOpen size={18}/>:<PanelLeftClose size={18}/>}</button></div><nav>{drawerItems.map(item=><Link key={item.href} href={item.href} prefetch aria-current={active(item.href)?'page':undefined}><item.icon size={19} strokeWidth={1.9}/><span>{item.label}</span></Link>)}</nav><div className="hq-desktop-sidebar-bottom"><span>Exceptional Electrical HQ</span><form action={logoutAction}><button type="submit"><LogOut size={18}/> Log out</button></form></div></aside>
  <div className="hq-shell-content" id="hq-main-content">{children}</div>
  <nav className="hq-shell-bottom" aria-label="HQ sections">{items.map(item=><Link key={item.href} href={item.href} prefetch aria-current={active(item.href)?'page':undefined}><span aria-hidden="true" className="hq-shell-nav-icon"><item.icon size={22} strokeWidth={1.9}/></span><span>{item.label}</span></Link>)}</nav>
  <style>{` @media(min-width:1000px){.hq-shell{--hq-desktop-sidebar-width:232px}.hq-shell-header{margin-left:var(--hq-desktop-sidebar-width)}.hq-shell-content{margin-left:var(--hq-desktop-sidebar-width);padding-bottom:0}.hq-shell-bottom{display:none}.hq-shell-header>.hq-shell-icon-button{visibility:hidden;pointer-events:none}.hq-shell-desktop-sidebar{position:fixed;left:0;top:0;bottom:0;width:var(--hq-desktop-sidebar-width);box-sizing:border-box;background:#fff;border-right:1px solid #e0e9f1;z-index:61;display:flex;flex-direction:column;padding:32px 13px 20px}.hq-desktop-nav-heading{display:flex;align-items:center;justify-content:space-between}.hq-desktop-nav-heading button{border:0;background:transparent;color:#607e93;cursor:pointer;padding:4px;display:grid;place-items:center}.hq-sidebar-compact{--hq-desktop-sidebar-width:68px!important}.hq-sidebar-compact .hq-shell-desktop-sidebar{padding-left:8px;padding-right:8px}.hq-sidebar-compact .hq-desktop-nav-heading{padding:8px 8px 18px;justify-content:center}.hq-sidebar-compact .hq-desktop-nav-heading span,.hq-sidebar-compact .hq-shell-desktop-sidebar nav a span,.hq-sidebar-compact .hq-desktop-sidebar-bottom{display:none}.hq-sidebar-compact .hq-shell-desktop-sidebar nav a{justify-content:center;padding:13px 8px}.hq-desktop-nav-heading{font-size:11px;font-weight:800;letter-spacing:.13em;color:#8195a7;padding:8px 15px 18px}.hq-shell-desktop-sidebar nav{display:grid;gap:5px}.hq-shell-desktop-sidebar nav a{display:flex;align-items:center;gap:13px;padding:13px 15px;border-radius:10px;color:#476579;text-decoration:none;font-size:14px;font-weight:700}.hq-shell-desktop-sidebar nav a[aria-current=page]{background:#e9f4ff;color:#0877c7}.hq-shell-desktop-sidebar nav a:hover{background:#f0f6fb}.hq-desktop-sidebar-bottom{margin-top:auto;border-top:1px solid #e1eaf1;padding:18px 12px 0;color:#8495a3;font-size:12px}.hq-desktop-sidebar-bottom button{display:flex;align-items:center;gap:10px;background:none;border:0;color:#476579;font-weight:700;margin-top:15px;cursor:pointer}}@media(min-width:1000px){.hq-shell-header{display:none!important}.hq-shell-content{min-height:100vh}.hq-desktop-nav-heading{padding:0 3px 15px!important;gap:4px}.hq-desktop-sidebar-brand{display:flex;min-width:0;align-items:center;overflow:hidden}.hq-desktop-sidebar-brand img{width:145px;height:auto;object-fit:contain}.hq-sidebar-compact .hq-desktop-nav-heading{flex-direction:column;gap:4px;padding:4px 0 12px!important}.hq-sidebar-compact .hq-desktop-sidebar-brand{display:flex!important;width:43px;justify-content:center;overflow:hidden}.hq-sidebar-compact .hq-desktop-sidebar-brand img{width:43px;min-width:43px;height:30px;object-fit:cover;object-position:left center}.hq-sidebar-compact .hq-desktop-nav-heading button{padding:3px}}@media(max-width:999px){.hq-shell-desktop-sidebar{display:none}} .hq-navigation-progress{position:fixed;top:0;left:0;right:0;height:3px;z-index:10000;pointer-events:none;background:linear-gradient(90deg,#0878b9 0%,#3bb5f0 50%,#0878b9 100%);background-size:200% 100%;animation:hq-progress-shift 1.1s linear infinite}@keyframes hq-progress-shift{to{background-position:-200% 0}}@media(prefers-reduced-motion:reduce){.hq-navigation-progress{animation:none}} `}</style>
 </div>;
}
