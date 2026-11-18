import {NextRequest,NextResponse} from 'next/server';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {businessProfile,documentFooterIdentityLines,letterheadDetailLines} from '@/lib/business-profile';
import {requireOfficeUser,dbAdmin} from '@/lib/hq-auth';
import {
  FIXED_INVOICE_LINE,
  filterInvoiceLinesForPricing,
  formatJobRef,
  invoiceAmountDueCents,
  invoicePaidCents,
  invoiceTotalsCents,
  isPrintableInvoiceStatus,
} from '@/lib/invoice-commercial';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const fmt=(n:number)=>'$'+(n/100).toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc=(s:string)=>s.normalize('NFKD').replace(/[^\x20-\x7e]/g,' ').replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)');

type Item={description:string;category:string;quantity:number;unit:string;unit_price_cents:number;gst_applicable:boolean};

export async function GET(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
  await requireOfficeUser();
  const {id}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(id))return new NextResponse('Invalid invoice',{status:400});
  const db=dbAdmin();
  const {data:invoice}=await db
    .from('invoices')
    .select('invoice_number,status,title,description,customer_notes,terms_and_payment,customer_display,pricing_mode,customer_reference,customer_snapshot,site_address_snapshot,job_snapshot,issue_date,due_date,created_at')
    .eq('id',id)
    .maybeSingle();
  if(!invoice)return new NextResponse('Invoice not found',{status:404});

  const [{data:raw,error},{data:payments}]=await Promise.all([
    db.from('invoice_items').select('description,category,quantity,unit,unit_price_cents,gst_applicable').eq('invoice_id',id).order('position'),
    db.from('invoice_payments').select('amount_cents').eq('invoice_id',id),
  ]);
  if(error)return new NextResponse('Unable to load invoice items',{status:500});

  const items=filterInvoiceLinesForPricing((raw||[]) as Item[],invoice.pricing_mode) as Item[];
  const totals=invoiceTotalsCents(items,invoice.pricing_mode);
  const paid=invoicePaidCents(payments||[]);
  const due=invoiceAmountDueCents({
    items,
    payments:payments||[],
    pricingMode:invoice.pricing_mode,
    status:invoice.status,
  });
  const customer=invoice.customer_snapshot as {name?:string;email?:string;phone?:string}|null;
  const site=invoice.site_address_snapshot as {address?:string}|null;
  const job=invoice.job_snapshot as {job_number?:string|null;site_address?:string|null}|null;
  const draft=!isPrintableInvoiceStatus(invoice.status);
  const letterhead=letterheadDetailLines();
  const footerIdentity=documentFooterIdentityLines();
  const jobRef=formatJobRef(job?.job_number)||'';
  const siteAddress=site?.address||job?.site_address||'';

  const objects:(string|Buffer)[]=[];
  const add=(s:string|Buffer)=>{objects.push(s);return objects.length};
  const catalog=add('');const pagesRef=add('');
  const font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const bold=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  let logoRef=0;let logoSize={width:1,height:1};
  try{
    const bytes=await readFile(path.join(process.cwd(),'public','exceptional-electrical-logo.png'));
    const {data,info}=await sharp(bytes).flatten({background:'#ffffff'}).jpeg({quality:90}).toBuffer({resolveWithObject:true});
    logoSize={width:info.width,height:info.height};
    logoRef=add(Buffer.concat([
      Buffer.from('<< /Type /XObject /Subtype /Image /Width '+info.width+' /Height '+info.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+data.length+' >>\nstream\n'),
      data,
      Buffer.from('\nendstream'),
    ]));
  }catch{ /* fallback to text brand */ }

  const pageRefs:number[]=[];let cmds:string[]=[];let y=0;
  const text=(s:string,x:number,at:number,size=10,isBold=false)=>{cmds.push('BT /F'+(isBold?'2':'1')+' '+size+' Tf '+x+' '+at+' Td ('+esc(s)+') Tj ET')};
  const right=(s:string,edge:number,at:number,size=10,isBold=false)=>text(s,Math.max(40,edge-s.length*size*(isBold?0.55:0.5)),at,size,isBold);
  const blue=()=>cmds.push('0.035 0.46 0.72 rg');
  const dark=()=>cmds.push('0.09 0.18 0.26 rg');
  const muted=()=>cmds.push('0.38 0.46 0.54 rg');
  const displayDate=(v:string|null)=>v?new Date(v.slice(0,10)+'T12:00:00Z').toLocaleDateString('en-AU',{timeZone:'UTC'}):'—';
  const rule=(at:number)=>cmds.push('0.75 0.83 0.89 RG 40 '+at+' m 555 '+at+' l S');
  const begin=()=>{
    cmds=[];dark();
    let brandBottom=760;
    if(logoRef){
      const width=185;
      const height=Math.min(72,width*logoSize.height/logoSize.width);
      const logoBottom=800-height;
      cmds.push('q '+width.toFixed(2)+' 0 0 '+height.toFixed(2)+' 40 '+logoBottom.toFixed(2)+' cm /Im1 Do Q');
      brandBottom=logoBottom-8;
    }else{
      text('EXCEPTIONAL ELECTRICAL',40,782,16,true);
      brandBottom=764;
    }
    right('TAX INVOICE',555,786,14,true);blue();right(invoice.invoice_number,555,763,15,true);
    muted();
    let letterY=brandBottom-4;
    for(const line of letterhead){text(line,40,letterY,8);letterY-=12}
    const ruleY=Math.min(letterY-10,720);
    cmds.push('0.035 0.46 0.72 RG 1.7 w 40 '+ruleY+' m 555 '+ruleY+' l S');
    dark();
    y=ruleY-28;
    if(draft){
      cmds.push('0.97 0.92 0.80 rg 40 '+(y-20)+' 515 30 re f');
      dark();
      text(invoice.status==='void'?'VOID - NOT FOR PAYMENT':'DRAFT - NOT APPROVED FOR SENDING',53,y-9,10,true);
      y-=48;
    }
  };
  const finish=()=>{
    const stream=cmds.join('\n');
    const ref=add('<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream');
    const page=add('<< /Type /Page /Parent '+pagesRef+' 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 '+font+' 0 R /F2 '+bold+' 0 R >> '+(logoRef?'/XObject << /Im1 '+logoRef+' 0 R >>':'')+' >> /Contents '+ref+' 0 R >>');
    pageRefs.push(page);
  };
  const need=(height:number)=>{if(y-height<58){finish();begin()}};
  const wrap=(s:string,max=90)=>{
    const result:string[]=[];
    for(const paragraph of s.split(/\r?\n/)){
      let current='';
      for(const word of paragraph.split(/\s+/)){
        if((current+' '+word).trim().length>max){if(current)result.push(current);current=word}
        else current=(current+' '+word).trim();
      }
      result.push(current);
    }
    return result;
  };
  const section=(title:string,body:string)=>{
    if(!body.trim())return;
    need(45);y-=8;text(title.toUpperCase(),40,y,10,true);y-=20;
    for(const ln of wrap(body)){need(15);text(ln,40,y,9);y-=15}
    y-=12;
  };

  begin();
  const metaY=y;
  blue();text('BILL TO',40,metaY,9,true);dark();
  text(customer?.name||'Customer not selected',40,metaY-22,12,true);
  let customerY=metaY-41;
  if(customer?.email){text(customer.email,40,customerY,9);customerY-=17}
  if(customer?.phone){text(customer.phone,40,customerY,9);customerY-=17}
  if(siteAddress){
    customerY-=14;blue();text('JOB SITE',40,customerY,9,true);dark();customerY-=20;
    for(const ln of wrap(siteAddress,48)){text(ln,40,customerY,9);customerY-=15}
  }
  const detail=(label:string,value:string,at:number)=>{text(label,326,at,9);right(value,555,at,10,true)};
  const customerReference=String(invoice.customer_reference||'').trim();
  detail('Invoice number',invoice.invoice_number,metaY);
  let metaRightY=metaY-24;
  if(customerReference){detail('Your reference',customerReference,metaRightY);metaRightY-=24}
  if(jobRef){detail('Job number',jobRef,metaRightY);metaRightY-=24}
  detail('Invoice date',displayDate(invoice.issue_date||invoice.created_at),metaRightY);
  detail('Due date',displayDate(invoice.due_date),metaRightY-24);
  y=Math.min(customerY,metaRightY-43)-27;

  section('Description',invoice.description||invoice.title||'Electrical work');

  if(invoice.customer_display==='itemised'&&items.length){
    need(45);
    cmds.push('0.92 0.96 0.98 rg 40 '+(y-13)+' 515 27 re f');dark();
    text('Description',48,y-3,9,true);text('Qty',325,y-3,9,true);text('Unit price',407,y-3,9,true);right('Amount (ex GST)',548,y-3,9,true);y-=41;
    for(const item of items){
      const label=item.description===FIXED_INVOICE_LINE?'Electrical work':item.description;
      const desc=wrap(label,48);
      need(desc.length*14+12);
      text(String(item.quantity)+' '+item.unit,325,y,9);
      right(fmt(item.unit_price_cents),464,y,9);
      right(fmt(Math.round(item.quantity*item.unit_price_cents)),548,y,9);
      for(const ln of desc){text(ln,48,y,9);y-=14}
      cmds.push('0.86 0.90 0.94 RG 0.4 w 40 '+(y+3)+' m 555 '+(y+3)+' l S');y-=13;
    }
  }

  need(150);y-=17;
  text('Subtotal (ex GST)',365,y,10);right(fmt(totals.subtotalExGstCents),548,y,10,true);y-=24;
  text('GST',365,y,10);right(fmt(totals.gstCents),548,y,10,true);y-=14;
  cmds.push('0.035 0.46 0.72 RG 1.4 w 365 '+y+' m 555 '+y+' l S');y-=25;
  text('TOTAL (AUD)',365,y,13,true);right(fmt(totals.totalIncGstCents),548,y,13,true);y-=24;
  text('Less amount paid',365,y,10);right(fmt(paid),548,y,10,true);y-=14;
  cmds.push('0.09 0.18 0.26 RG 1.4 w 365 '+y+' m 555 '+y+' l S');y-=25;
  text('AMOUNT DUE',365,y,13,true);right(fmt(due),548,y,13,true);y-=39;

  section('Additional notes',invoice.customer_notes||'');
  section('Terms & payment information',invoice.terms_and_payment||'');

  need(120);y-=12;rule(y);y-=18;muted();
  for(const line of footerIdentity){need(14);text(line,40,y,8);y-=12}
  dark();y-=6;
  text('Thank you for choosing '+businessProfile.shortName+'.',40,y,9);y-=17;
  text('Tax invoice '+invoice.invoice_number+'. Payment is due by the date shown above.',40,y,8);
  finish();

  objects[catalog-1]='<< /Type /Catalog /Pages '+pagesRef+' 0 R >>';
  objects[pagesRef-1]='<< /Type /Pages /Kids ['+pageRefs.map(x=>x+' 0 R').join(' ')+'] /Count '+pageRefs.length+' >>';
  const chunks:Buffer[]=[Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n','binary')];
  const offsets=[0];let offset=chunks[0].length;
  for(let i=0;i<objects.length;i++){
    offsets.push(offset);
    const body=Buffer.isBuffer(objects[i])?objects[i] as Buffer:Buffer.from(objects[i] as string);
    const chunk=Buffer.concat([Buffer.from((i+1)+' 0 obj\n'),body,Buffer.from('\nendobj\n')]);
    chunks.push(chunk);offset+=chunk.length;
  }
  const start=offset;
  let xref='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
  for(let i=1;i<offsets.length;i++)xref+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  xref+='trailer\n<< /Size '+(objects.length+1)+' /Root '+catalog+' 0 R >>\nstartxref\n'+start+'\n%%EOF';
  chunks.push(Buffer.from(xref));
  const pdf=Buffer.concat(chunks);
  return new NextResponse(new Uint8Array(pdf),{
    headers:{
      'Content-Type':'application/pdf',
      'Content-Disposition':'attachment; filename="'+invoice.invoice_number+'.pdf"',
      'Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff',
    },
  });
}
