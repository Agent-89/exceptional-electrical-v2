import {NextResponse} from 'next/server';
import {randomBytes} from 'node:crypto';
import {hqUser} from '@/lib/hq-auth';
import {googleAuthUrl} from '@/lib/google-calendar';
export const runtime='nodejs';
export async function GET(request:Request){
 const user=await hqUser();
 if(!user)return NextResponse.redirect(new URL('/hq/login',request.url));
 if(!['owner','admin'].includes(user.role))return NextResponse.redirect(new URL('/hq/schedule?google=not-authorised',request.url));
 const state=randomBytes(24).toString('hex');
 const response=NextResponse.redirect(googleAuthUrl(state));
 response.cookies.set('ee_google_oauth_state',state,{httpOnly:true,secure:true,sameSite:'lax',maxAge:600,path:'/api/integrations/google-calendar'});
 return response;
}
