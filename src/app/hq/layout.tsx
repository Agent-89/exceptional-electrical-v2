import type {Metadata,Viewport} from 'next';
import HQPwaRegister from './pwa-register';
import HqShell from './hq-shell';
import {hqUser} from '@/lib/hq-auth';
import './hq.css';
export const metadata:Metadata={
 title:{default:'Exceptional Electrical HQ',template:'%s | Exceptional Electrical HQ'},
 description:'Exceptional Electrical operations, enquiries, customers and quotes.',
 applicationName:'Exceptional Electrical HQ',
 manifest:'/hq/manifest.webmanifest',
 appleWebApp:{capable:true,title:'Electrical HQ',statusBarStyle:'default'},
 icons:{icon:[{url:'/hq/icon.png?v=3',type:'image/png',sizes:'512x512'}],apple:[{url:'/hq/icon.png?v=3',sizes:'512x512',type:'image/png'}]}
};
export const viewport:Viewport={themeColor:'#f2f6fb'};
export default async function HQLayout({children}:{children:React.ReactNode}){
 const user=await hqUser();
 return <><HQPwaRegister/><HqShell role={user?.role??null}>{children}</HqShell></>;
}
