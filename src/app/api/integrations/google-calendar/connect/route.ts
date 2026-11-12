import {NextResponse} from 'next/server';
import {randomBytes} from 'node:crypto';
import {hqUser} from '@/lib/hq-auth';
import {googleAuthUrl} from '@/lib/google-calendar';
export async function GET(){const user=await hqUser();if(!user||!['owner','admin'].includes(user.role))return NextResponse.json({error:'Forbidden'},{status:403});const state=randomBytes(24).toString('hex');const response=NextResponse.redirect(googleAuthUrl(state));response.cookies.set('ee_google_oauth_state',state,{httpOnly:true,secure:true,sameSite:'lax',maxAge:600,path:'/api/integrations/google-calendar'});return response;}
