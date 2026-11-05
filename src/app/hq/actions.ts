'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { dbAdmin,requireHqUser } from '@/lib/hq-auth';

export async function loginAction(form:FormData){
 const email=String(form.get('email')??'').trim().toLowerCase();
 const password=String(form.get('password')??'');
 if(!email||!password)redirect('/hq/login?error=credentials');
 const db=dbAdmin();
 const {data,error}=await db.auth.signInWithPassword({email,password});
 if(error||!data.session||!data.user)redirect('/hq/login?error=credentials');
 const {data:staff}=await db.from('staff_profiles').select('active').eq('user_id',data.user.id).eq('active',true).maybeSingle();
 if(!staff)redirect('/hq/login?error=access');
 const jar=await cookies();
 const secure=process.env.NODE_ENV==='production';
 jar.set('ee_hq_access',data.session.access_token,{httpOnly:true,secure,sameSite:'lax',path:'/hq',maxAge:data.session.expires_in});
 jar.set('ee_hq_refresh',data.session.refresh_token,{httpOnly:true,secure,sameSite:'lax',path:'/hq',maxAge:60*60*24*30});
 redirect('/hq');
}
export async function logoutAction(){
 const jar=await cookies();
 jar.delete('ee_hq_access');jar.delete('ee_hq_refresh');
 redirect('/hq/login');
}
const allowed=['new','contacted','qualified','scheduled','closed','spam'] as const;
export async function updateEnquiryAction(form:FormData){
 const user=await requireHqUser();
 if(!['owner','admin','office'].includes(user.role))throw new Error('Insufficient permissions');
 const id=String(form.get('id')??'');
 const status=String(form.get('status')??'');
 if(!/^[0-9a-f-]{36}$/i.test(id)||!allowed.some(x=>x===status))throw new Error('Invalid enquiry update');
 const {error}=await dbAdmin().from('enquiries').update({status,updated_at:new Date().toISOString()}).eq('id',id);
 if(error)throw new Error('Unable to update enquiry');
 revalidatePath('/hq');revalidatePath('/hq/enquiries/'+id);
 redirect('/hq/enquiries/'+id);
}
