'use client';
import Link from 'next/link';
import Image from 'next/image';
import {usePathname} from 'next/navigation';
import {useEffect,useState} from 'react';

const items=[{href:'/hq',label:'Home',icon:'⌂'},{href:'/hq/enquiries',label:'Enquiries',icon:'▤'},{href:'/hq/customers',label:'Customers',icon:'♙'},{href:'/hq/quotes',label:'Quotes',icon:'▧'}];
export default function HqShell({children}:{children:React.ReactNode}){
 const pathname=usePathname();
 const [menu,setMenu]=useState(false);
 useEffect(()=>setMenu(false),[pathname]);
 if(pathname==='/hq/login'||pathname.startsWith('/hq/login/'))return <>{children}</>;
 const active=(href:string)=>href==='/hq'?pathname==='/hq':pathname===href||pathname.startsWith(href+'/');
 return <div className="hq-shell">
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
 </div>;
}
