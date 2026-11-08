'use client';
import {useEffect} from 'react';
export default function HQPwaRegister(){
 useEffect(()=>{
  if(!('serviceWorker' in navigator))return;
  navigator.serviceWorker.register('/hq/sw.js',{scope:'/hq/'}).catch(error=>console.warn('HQ offline worker unavailable',error));
 },[]);
 return null;
}
