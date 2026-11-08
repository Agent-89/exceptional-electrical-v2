import type {Metadata,Viewport} from 'next';
import HQPwaRegister from './pwa-register';
export const metadata:Metadata={
 title:{default:'Exceptional Electrical HQ',template:'%s | Exceptional Electrical HQ'},
 description:'Exceptional Electrical operations, enquiries, customers and quotes.',
 applicationName:'Exceptional Electrical HQ',
 manifest:'/hq/manifest.webmanifest',
 appleWebApp:{capable:true,title:'Electrical HQ',statusBarStyle:'default'},
 icons:{icon:'/hq/hq-icon.svg',apple:'/exceptional-electrical-logo.png'}
};
export const viewport:Viewport={themeColor:'#f2f6fb'};
export default function HQLayout({children}:{children:React.ReactNode}){return <><HQPwaRegister/>{children}</>}
