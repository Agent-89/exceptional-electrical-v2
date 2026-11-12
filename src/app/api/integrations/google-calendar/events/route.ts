import {NextRequest,NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {dbAdmin} from '@/lib/hq-auth';
import {calendarEvents} from '@/lib/google-calendar';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const noStore={'Cache-Control':'private, no-store, max-age=0'};
export async function GET(request:NextRequest){
 const jar=await cookies(),token=jar.get('ee_hq_access')?.value;
 if(!token)return NextResponse.json({error:'Unauthorized'},{status:401,headers:noStore});
 const db=dbAdmin();
 const {data:{user},error}=await db.auth.getUser(token);
 if(error||!user)return NextResponse.json({error:'Unauthorized'},{status:401,headers:noStore});
 const {data:staff}=await db.from('staff_profiles').select('active').eq('user_id',user.id).eq('active',true).maybeSingle();
 if(!staff)return NextResponse.json({error:'Forbidden'},{status:403,headers:noStore});
 const start=request.nextUrl.searchParams.get('start'),end=request.nextUrl.searchParams.get('end');
 if(!start||!end||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(end)<=Date.parse(start)||Date.parse(end)-Date.parse(start)>32*86400000)
  return NextResponse.json({error:'Invalid date range'},{status:400,headers:noStore});
 try{
  const events=await calendarEvents(new Date(start).toISOString(),new Date(end).toISOString());
  return NextResponse.json({events,updatedAt:new Date().toISOString()},{headers:noStore});
 }catch{
  return NextResponse.json({error:'Google Calendar refresh failed'},{status:502,headers:noStore});
 }
}
