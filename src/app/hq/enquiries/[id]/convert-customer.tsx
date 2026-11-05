'use client';
import {useState,useTransition} from 'react';
import Link from 'next/link';
import {convertEnquiryToCustomer} from '../../actions';
export default function ConvertCustomer({enquiryId,initialCustomerId}:{enquiryId:string;initialCustomerId:string|null}){
 const [customerId,setCustomerId]=useState(initialCustomerId);
 const [message,setMessage]=useState('');
 const [pending,start]=useTransition();
 if(customerId)return <p className="hq-customer-link"><Link href={'/hq/customers/'+customerId}>View linked customer →</Link></p>;
 return <div className="hq-convert-customer"><button type="button" className="hq-primary" disabled={pending} onClick={()=>start(async()=>{try{const result=await convertEnquiryToCustomer(enquiryId);setMessage(result.message);if(result.ok&&result.customerId)setCustomerId(result.customerId);}catch{setMessage('Unable to convert enquiry. Please try again.');}})}>{pending?'LINKING CUSTOMER…':'CONVERT TO CUSTOMER'}</button>{message&&<p role="status" className="hq-inline-feedback">{message}</p>}</div>;
}