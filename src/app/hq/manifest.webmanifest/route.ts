import {NextResponse} from 'next/server';
export function GET(){
 return NextResponse.json({
  id:'/hq/',name:'Exceptional Electrical HQ',short_name:'Electrical HQ',
  description:'Exceptional Electrical staff operations',
  start_url:'/hq',scope:'/hq',display:'standalone',
  background_color:'#f2f6fb',theme_color:'#f2f6fb',
  icons:[{src:'/hq/icon.png?v=3',sizes:'512x512',type:'image/png',purpose:'any maskable'}]
 },{headers:{'Content-Type':'application/manifest+json; charset=utf-8','Cache-Control':'public, max-age=300'}});
}
