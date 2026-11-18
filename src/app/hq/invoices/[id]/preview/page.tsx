import BackToInvoice from './back-to-invoice';
import PrintInvoiceButton from './print-button';
import {notFound} from 'next/navigation';
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

export const dynamic='force-dynamic';

const aud=(c:number)=>(c/100).toLocaleString('en-AU',{style:'currency',currency:'AUD'});
const date=(v:string|null)=>v?new Date(v+'T12:00:00').toLocaleDateString('en-AU',{timeZone:'Australia/Perth'}):'—';

type Item={
  id:string;
  description:string;
  category:string;
  quantity:number;
  unit:string;
  unit_price_cents:number;
  gst_applicable:boolean;
  position:number;
};

export default async function InvoicePreview({params}:{params:Promise<{id:string}>}){
  await requireOfficeUser();
  const {id}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
  const db=dbAdmin();
  const {data:invoice,error}=await db
    .from('invoices')
    .select('id,invoice_number,status,title,description,customer_notes,terms_and_payment,customer_display,pricing_mode,customer_reference,customer_snapshot,site_address_snapshot,job_snapshot,issue_date,due_date,created_at')
    .eq('id',id)
    .maybeSingle();
  if(error||!invoice)notFound();

  const [{data:allItems},{data:payments}]=await Promise.all([
    db.from('invoice_items').select('id,description,category,quantity,unit,unit_price_cents,gst_applicable,position').eq('invoice_id',id).order('position'),
    db.from('invoice_payments').select('amount_cents').eq('invoice_id',id),
  ]);

  const items=filterInvoiceLinesForPricing((allItems||[]) as Item[],invoice.pricing_mode) as Item[];
  const totals=invoiceTotalsCents(items,invoice.pricing_mode);
  const paid=invoicePaidCents(payments||[]);
  const due=invoiceAmountDueCents({
    items,
    payments:payments||[],
    pricingMode:invoice.pricing_mode,
    status:invoice.status,
  });
  const customer=(invoice.customer_snapshot||{}) as {name?:string;email?:string;phone?:string};
  const site=(invoice.site_address_snapshot||{}) as {address?:string};
  const job=(invoice.job_snapshot||{}) as {job_number?:string|null;site_address?:string|null};
  const printable=isPrintableInvoiceStatus(invoice.status);
  const letterhead=letterheadDetailLines();
  const footerIdentity=documentFooterIdentityLines();
  const jobRef=formatJobRef(job.job_number);
  const siteAddress=site.address||job.site_address||'';

  return <main className="quote-preview-shell">
    <div className="quote-preview-toolbar">
      <BackToInvoice href={'/hq/invoices/'+invoice.id}/>
      <span>{printable?'Tax invoice':invoice.status==='void'?'VOID — NOT FOR PAYMENT':'DRAFT PREVIEW — NOT FOR SENDING'}</span>
      <PrintInvoiceButton invoiceId={invoice.id}/>
    </div>
    <article className="quote-paper">
      {!printable&&invoice.status!=='void'&&<div className="quote-watermark">DRAFT — NOT APPROVED FOR SENDING</div>}
      {invoice.status==='void'&&<div className="quote-watermark">VOID</div>}
      <header className="quote-paper-header">
        <div className="quote-brand-block">
          <img className="quote-brand-logo" src="/exceptional-electrical-logo.png" alt={businessProfile.tradingName} width="250" height="95"/>
          <div className="quote-letterhead">{letterhead.map(line=><p key={line}>{line}</p>)}</div>
        </div>
        <div className="quote-document-label"><span>TAX INVOICE</span><strong>{invoice.invoice_number}</strong></div>
      </header>
      <div className="quote-paper-meta">
        <section>
          <div className="quote-caption">BILL TO</div>
          <strong>{customer.name||'Customer not selected'}</strong>
          {customer.email&&<p>{customer.email}</p>}
          {customer.phone&&<p>{customer.phone}</p>}
          {siteAddress&&<><div className="quote-caption quote-site-label">JOB SITE</div><p>{siteAddress}</p></>}
        </section>
        <section className="quote-meta-right">
          <div><span>Invoice number</span><strong>{invoice.invoice_number}</strong></div>
          {invoice.customer_reference?<div><span>Your reference</span><strong>{invoice.customer_reference}</strong></div>:null}
          {jobRef?<div><span>Job number</span><strong>{jobRef}</strong></div>:null}
          <div><span>Invoice date</span><strong>{date(invoice.issue_date||invoice.created_at.slice(0,10))}</strong></div>
          <div><span>Due date</span><strong>{date(invoice.due_date)}</strong></div>
        </section>
      </div>
      {(invoice.description||invoice.title)&&(
        <div className="quote-paper-section">
          <div className="quote-caption">DESCRIPTION</div>
          <p className="quote-multiline">{invoice.description||invoice.title}</p>
        </div>
      )}
      {invoice.customer_display==='itemised'&&items.length>0&&(
        <table className="quote-items-table">
          <thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount (ex GST)</th></tr></thead>
          <tbody>
            {items.map(l=>(
              <tr key={l.id}>
                <td>{l.description===FIXED_INVOICE_LINE?'Electrical work':l.description}</td>
                <td>{Number(l.quantity)} {l.unit}</td>
                <td>{aud(Number(l.unit_price_cents))}</td>
                <td>{aud(Math.round(Number(l.quantity)*Number(l.unit_price_cents)))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="quote-totals">
        <div><span>Subtotal (ex GST)</span><strong>{aud(totals.subtotalExGstCents)}</strong></div>
        <div><span>GST</span><strong>{aud(totals.gstCents)}</strong></div>
        <div className="quote-grand-total"><span>TOTAL (AUD)</span><strong>{aud(totals.totalIncGstCents)}</strong></div>
        <div><span>Less amount paid</span><strong>{aud(paid)}</strong></div>
        <div className="quote-grand-total"><span>AMOUNT DUE</span><strong>{aud(due)}</strong></div>
      </div>
      {invoice.customer_notes&&(
        <div className="quote-paper-section">
          <div className="quote-caption">ADDITIONAL NOTES</div>
          <p className="quote-multiline">{invoice.customer_notes}</p>
        </div>
      )}
      {invoice.terms_and_payment&&(
        <div className="quote-paper-section">
          <div className="quote-caption">TERMS &amp; PAYMENT INFORMATION</div>
          <p className="quote-multiline">{invoice.terms_and_payment}</p>
        </div>
      )}
      <footer className="quote-paper-footer">
        <div className="quote-footer-identity">{footerIdentity.map(line=><p key={line}>{line}</p>)}</div>
        <p>Thank you for choosing {businessProfile.shortName}.</p>
        <p>Tax invoice {invoice.invoice_number}. Payment is due by the date shown above.</p>
      </footer>
    </article>
    <style>{`
      .quote-preview-shell{min-height:100vh;background:#e8eef4;padding:24px;color:#172d42;font-family:Arial,Helvetica,sans-serif}.quote-preview-toolbar{max-width:900px;margin:0 auto 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px}.quote-preview-toolbar a{color:#0b5b9e}.quote-print-button{background:#0876bc;color:white;border:0;border-radius:8px;padding:12px 16px;font-weight:700;cursor:pointer}.quote-paper{max-width:820px;min-height:1050px;margin:auto;background:#fff;padding:54px 60px;box-shadow:0 12px 35px #20394b18;position:relative}.quote-watermark{border:2px solid #d28b35;color:#995b1c;padding:10px 14px;margin-bottom:26px;text-align:center;font-size:12px;font-weight:800;letter-spacing:.08em}.quote-paper-header{display:flex;justify-content:space-between;align-items:start;padding-bottom:28px;border-bottom:3px solid #1176b5}.quote-brand-block{display:flex;flex-direction:column;gap:10px;max-width:280px}.quote-brand-logo{display:block;width:235px;height:auto;max-height:100px;object-fit:contain;object-position:left center}.quote-letterhead{display:flex;flex-direction:column;gap:2px}.quote-letterhead p,.quote-paper-header p{margin:0;font-size:11px;line-height:1.35;color:#60758a}.quote-document-label{display:flex;flex-direction:column;align-items:flex-end;gap:8px;font-size:16px;letter-spacing:.1em;font-weight:800}.quote-document-label strong{font-size:19px;letter-spacing:0;color:#0878b9}.quote-paper-meta{display:grid;grid-template-columns:1fr 1fr;gap:40px;padding:34px 0}.quote-paper-meta p{font-size:13px;margin:7px 0}.quote-caption{font-size:10px;font-weight:800;color:#55758f;letter-spacing:.13em;margin-bottom:9px}.quote-site-label{margin-top:24px}.quote-meta-right>div{display:flex;justify-content:space-between;gap:15px;margin-bottom:13px;font-size:13px}.quote-meta-right span{color:#60758a}.quote-paper-section{margin:18px 0 28px}.quote-multiline{white-space:pre-wrap;line-height:1.6;font-size:13px}.quote-items-table{width:100%;border-collapse:collapse;margin-top:32px;font-size:12px}.quote-items-table th{background:#edf5fa;color:#335a76;text-align:left;padding:12px 10px}.quote-items-table th:not(:first-child),.quote-items-table td:not(:first-child){text-align:right}.quote-items-table td{padding:13px 10px;border-bottom:1px solid #e0e9f0;vertical-align:top}.quote-totals{margin:28px 0 40px auto;width:min(100%,340px);font-size:13px}.quote-totals>div{display:flex;justify-content:space-between;padding:9px 0}.quote-grand-total{border-top:2px solid #1176b5;font-size:17px;font-weight:800}.quote-paper-footer{border-top:1px solid #dce6ee;margin-top:50px;padding-top:16px;color:#60758a;font-size:11px;line-height:1.5}.quote-paper-footer p{margin:0 0 6px}.quote-footer-identity{margin-bottom:12px}.quote-footer-identity p{margin:0 0 3px}@media(max-width:640px){.quote-preview-shell{padding:10px}.quote-preview-toolbar{flex-wrap:wrap}.quote-paper{padding:26px 20px;min-height:0}.quote-brand-logo{width:160px}.quote-document-label{font-size:13px}.quote-paper-meta{gap:16px}.quote-items-table{font-size:10px}.quote-items-table td,.quote-items-table th{padding:8px 4px}}@page{size:A4;margin:12mm}@media print{html,body{margin:0!important;padding:0!important;background:#fff!important;height:auto!important;overflow:visible!important}body:has(.quote-preview-shell) .hq-shell-header,body:has(.quote-preview-shell) .hq-shell-bottom,body:has(.quote-preview-shell) .hq-shell-drawer,body:has(.quote-preview-shell) .hq-shell-scrim{display:none!important}body:has(.quote-preview-shell) .hq-shell,body:has(.quote-preview-shell) .hq-shell-content,body:has(.quote-preview-shell) #hq-main-content{display:block!important;position:static!important;min-height:0!important;height:auto!important;overflow:visible!important;margin:0!important;padding:0!important;max-width:none!important;width:100%!important}.quote-preview-shell{background:#fff;padding:0}.quote-preview-toolbar{display:none}.quote-paper{box-shadow:none;max-width:none;min-height:0;padding:0;margin:0;width:100%}}
    `}</style>
  </main>;
}
