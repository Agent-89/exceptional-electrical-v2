'use server';
import {requireHqUser,dbAdmin} from '@/lib/hq-auth';
export async function createQuoteCustomer(name:string,email:string,phone:string){
 const user=await requireHqUser();
 if(!['owner','admin','office'].includes(user.role))return {ok:false,message:'Not authorised'};
 if(name.trim().length<2||name.length>150||email.length>254||phone.length>40||(!email.trim()&&!phone.trim()))return {ok:false,message:'Enter a name and email or phone'};
 const db=dbAdmin();
 const {data,error}=await db.from('customers').insert({name:name.trim(),email:email.trim()||null,phone:phone.trim()||null}).select('id,name,email,phone').single();
 return error||!data?{ok:false,message:'Could not create customer'}:{ok:true,message:'Customer created',customer:data};
}
