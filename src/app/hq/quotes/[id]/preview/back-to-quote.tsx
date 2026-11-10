'use client';
import Link from 'next/link';
import {useState} from 'react';
export default function BackToQuote({href}:{href:string}){
 const [leaving,setLeaving]=useState(false);
 return <><Link href={href} onClick={()=>setLeaving(true)}>← Back to quote</Link>{leaving&&<div className="quote-return-overlay" role="status" aria-live="polite"><div className="quote-return-card"><span className="quote-return-spinner" aria-hidden="true"/><strong>Opening quotation</strong><p>Loading the saved quote details…</p></div></div>}<style>{`
 .quote-return-overlay{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:#f2f6fb;padding:24px;color:#17334a;font-family:Arial,Helvetica,sans-serif}
 .quote-return-card{width:min(100%,390px);background:#fff;border:1px solid #dae5ee;border-radius:14px;padding:42px 28px;text-align:center;box-shadow:0 12px 36px #17334a0d}
 .quote-return-card strong{display:block;font-size:18px;margin:20px 0 8px}.quote-return-card p{color:#657d90;font-size:13px;margin:0}
 .quote-return-spinner{display:block;width:40px;height:40px;border:3px solid #dbeaf5;border-top-color:#0878b9;border-radius:50%;animation:quote-return-spin .85s linear infinite;margin:auto}
 @keyframes quote-return-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.quote-return-spinner{animation:none;border-color:#0878b9}}
 `}</style></>;
}
