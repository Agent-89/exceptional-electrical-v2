import 'server-only';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';

export function dbAdmin() {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_SECRET_KEY;
 if(!url||!key)throw new Error('Supabase server configuration missing');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function hqUser() {
 const jar=await cookies();
 const token=jar.get('ee_hq_access')?.value;
 if(!token)return null;
 const db=dbAdmin();
 const {data:{user},error}=await db.auth.getUser(token);
 if(error||!user)return null;
 const {data:staff}=await db.from('staff_profiles').select('user_id,full_name,role,active').eq('user_id',user.id).eq('active',true).maybeSingle();
 if(!staff)return null;
 return {id:user.id,email:user.email??'',name:staff.full_name,role:staff.role};
}
export async function requireHqUser(){
 const user=await hqUser();
 if(!user)redirect('/hq/login');
 return user;
}
