import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, Check, Phone } from 'lucide-react';
import { services, type ServiceKey } from '@/lib/services';
export function generateStaticParams(){ return Object.keys(services).map(slug=>({slug})); }
export default async function ServicePage({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;
 if(!(slug in services))notFound();
 const service=services[slug as ServiceKey];
 return <main className="service-detail-page">
  <header className="service-detail-header shell"><Link href="/" className="service-back"><ArrowLeft size={17}/> BACK TO HOME</Link><a href="tel:0413781938"><Phone size={16}/> 0413 781 938</a></header>
  <section className="service-detail-hero"><div className="shell"><p className="eyebrow light"><span className="eyebrow-line"/>{service.eyebrow}</p><h1>{service.title}<span>.</span></h1><p>{service.intro}</p><a className="button button-blue" href={`/?service=${slug}#contact`}>ENQUIRE ABOUT THIS SERVICE <ArrowUpRight size={17}/></a></div></section>
  <section className="service-detail-content shell"><div><div className="eyebrow"><span className="eyebrow-line"/> WHAT WE CAN HELP WITH</div><h2>Considered solutions.<br/><span>Quality workmanship.</span></h2><p>Every project is different. Get in touch to discuss your requirements and we&apos;ll help you work through the next steps.</p></div><ul>{service.details.map(item=><li key={item}><Check size={19}/>{item}</li>)}</ul></section>
  <section className="service-detail-end"><div className="shell"><h2>Have a project in mind?</h2><a href={`/?service=${slug}#contact`} className="button button-blue">START AN ENQUIRY <ArrowUpRight size={17}/></a></div></section>
 </main>;
}
