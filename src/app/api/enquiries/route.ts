import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { dbAdmin } from '@/lib/hq-auth';
export const runtime='nodejs';
const schema=z.object({
 name:z.string().trim().min(2).max(120),
 phone:z.string().trim().min(6).max(30),
 email:z.email().max(254),
 suburb:z.string().trim().max(120).optional().default(''),
 contact_preference:z.enum(['either','phone','email']).default('either'),
 service:z.enum(['residential','commercial','lighting','maintenance','switchboards','ev_chargers','other']),
 message:z.string().trim().min(10).max(3000),
 website:z.string().optional().default('')
});
export async function POST(req:NextRequest){
 const length=Number(req.headers.get('content-length')||0);
 if(length>12000)return NextResponse.json({error:'Request too large.'},{status:413});
 let raw:unknown;
 try{raw=await req.json();}catch{return NextResponse.json({error:'Invalid request.'},{status:400});}
 const result=schema.safeParse(raw);
 if(!result.success)return NextResponse.json({error:'Please check the form and try again.'},{status:400});
 if(result.data.website)return NextResponse.json({ok:true},{status:202});
 let db;
 try{db=dbAdmin();}catch{console.error('Enquiry storage not configured');return NextResponse.json({error:'Enquiries are temporarily unavailable.'},{status:503});}
 const newServiceLabel=result.data.service==='switchboards'?'Switchboard upgrades':result.data.service==='ev_chargers'?'EV charger installation':null;
 const storedService=newServiceLabel?'other':result.data.service;
 const storedMessage=newServiceLabel?`Service requested: ${newServiceLabel}\n\n${result.data.message}`:result.data.message;
 const {error}=await db.from('enquiries').insert({name:result.data.name,phone:result.data.phone,email:result.data.email.toLowerCase(),suburb:result.data.suburb||null,contact_preference:result.data.contact_preference,service:storedService,message:storedMessage,source:'website',status:'new'});
 if(error){console.error('Enquiry insert failed',error.code);return NextResponse.json({error:'Unable to submit your enquiry right now.'},{status:500});}
 return NextResponse.json({ok:true},{status:201});
}
