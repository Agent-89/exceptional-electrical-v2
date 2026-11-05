import {NextRequest,NextResponse} from 'next/server';
import {dbAdmin} from '@/lib/hq-auth';
export const runtime='nodejs';
export async function GET(request:NextRequest){
 const login=new URL('/hq/login',request.url);
 const refresh=request.cookies.get('ee_hq_refresh')?.value;
 if(!refresh)return NextResponse.redirect(login);
 const db=dbAdmin();
 const {data,error}=await db.auth.refreshSession({refresh_token:refresh});
 if(error||!data.session||!data.user){
  const response=NextResponse.redirect(login);
  response.cookies.set('ee_hq_access','',{path:'/hq',maxAge:0});response.cookies.set('ee_hq_refresh','',{path:'/hq',maxAge:0});
  return response;
 }
 const {data:staff}=await db.from('staff_profiles').select('active').eq('user_id',data.user.id).eq('active',true).maybeSingle();
 if(!staff){
  const response=NextResponse.redirect(login);
  response.cookies.set('ee_hq_access','',{path:'/hq',maxAge:0});response.cookies.set('ee_hq_refresh','',{path:'/hq',maxAge:0});
  return response;
 }
 const response=NextResponse.redirect(new URL('/hq',request.url));
 const opts={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/hq'};
 response.cookies.set('ee_hq_access',data.session.access_token,{...opts,maxAge:data.session.expires_in});
 response.cookies.set('ee_hq_refresh',data.session.refresh_token,{...opts,maxAge:60*60*24*30});
 return response;
}
