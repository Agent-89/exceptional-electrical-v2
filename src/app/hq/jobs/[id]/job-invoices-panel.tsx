import Link from 'next/link';
import type {JobInvoiceDisplay} from '@/lib/job-invoices-store';

function statusClass(status:string){
  if(status==='paid')return 'hq-status hq-status-ok';
  if(status==='void')return 'hq-status hq-status-bad';
  if(status==='sent'||status==='approved')return 'hq-status hq-status-warn';
  if(status==='part_paid')return 'hq-status hq-status-pending';
  return 'hq-status';
}

export default function JobInvoicesPanel({
  jobId,
  customerId,
  invoices,
  tableAvailable,
  loadError,
  canEdit,
}:{
  jobId:string;
  customerId:string|null;
  invoices:JobInvoiceDisplay[];
  tableAvailable:boolean;
  loadError:string|null;
  canEdit:boolean;
}){
  return (
    <section className="hq-panel ee-compact-panel" id="job-invoices">
      <div className="ee-section-title">
        <div>
          <span className="ee-eyebrow">INVOICES</span>
          <h2>Billing</h2>
        </div>
        {canEdit&&tableAvailable?(
          customerId?(
            <Link className="hq-detail-action-primary" href={`/hq/invoices/new?job=${jobId}`}>
              New invoice
            </Link>
          ):(
            <button type="button" className="hq-detail-action-primary" disabled>
              New invoice
            </button>
          )
        ):null}
      </div>

      {loadError?<p className="ee-form-error" role="alert">{loadError}</p>:null}

      {!tableAvailable?(
        <p className="ee-muted" style={{marginTop:0}}>
          Invoice tables are not available yet. Apply the hq_invoices_c2 migration after owner approval.
        </p>
      ):!customerId?(
        <p className="ee-muted" style={{marginTop:0}}>
          Assign a customer to this job before creating an invoice.
        </p>
      ):!invoices.length?(
        <p className="ee-muted" style={{marginTop:0}}>
          No invoices linked to this job yet.
        </p>
      ):(
        <div className="hq-quote-list">
          {invoices.map(invoice=>(
            <Link key={invoice.id} href={`/hq/invoices/${invoice.id}`} className="hq-quote-row">
              <div className="hq-quote-row-primary">
                <div className="hq-quote-row-identity">
                  <strong className="hq-quote-row-number">{invoice.invoiceNumber}</strong>
                  <span className="hq-quote-row-customer">{invoice.title}</span>
                </div>
                <div className="hq-quote-row-meta">
                  <strong className="hq-quote-row-price">{invoice.totalLabel}</strong>
                  <span className={statusClass(invoice.status)}>{invoice.statusLabel}</span>
                </div>
              </div>
              <p className="hq-quote-row-secondary">
                {[
                  `Updated ${new Date(invoice.updatedAt).toLocaleDateString('en-AU',{timeZone:'Australia/Perth'})}`,
                  invoice.status!=='paid'&&invoice.status!=='void'?`Due ${invoice.amountDueLabel}`:null,
                ].filter(Boolean).join(' · ')}
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
