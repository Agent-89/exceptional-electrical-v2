import Link from 'next/link';
import {
  associationKindLabel,
  formatAudFromCents,
  type JobQuoteDisplay,
} from '@/lib/job-quotes';
import {
  createLinkedQuoteFromJob,
  linkQuoteToJob,
  setPrimaryJobQuote,
} from '../job-quote-actions';
import UnlinkJobQuoteButton from './unlink-job-quote-button';

export type LinkableQuoteOption = {
  id: string;
  quote_number: string;
  title: string | null;
  status: string;
};

function statusLabel(status: string): string {
  return status.replaceAll('_', ' ');
}

export default function JobQuotesPanel({
  jobId,
  customerId,
  quotes,
  linkableQuotes,
  tableAvailable,
  loadError,
  notice,
  actionError,
  canEdit,
}: {
  jobId: string;
  customerId: string | null;
  quotes: JobQuoteDisplay[];
  linkableQuotes: LinkableQuoteOption[];
  tableAvailable: boolean;
  loadError: string | null;
  notice?: string | null;
  actionError?: string | null;
  canEdit: boolean;
}) {
  return (
    <section className="hq-panel ee-compact-panel" id="job-quotes">
      <div className="ee-section-title">
        <div>
          <span className="ee-eyebrow">QUOTES</span>
          <h2>Quotes &amp; variations</h2>
        </div>
      </div>

      {notice ? (
        <p className="ee-form-success ee-time-flash" role="status">
          {notice}
        </p>
      ) : null}
      {actionError ? (
        <p className="ee-form-error" role="alert">
          {actionError}
        </p>
      ) : null}
      {loadError ? (
        <p className="ee-form-error" role="alert">
          {loadError}
        </p>
      ) : null}

      {!loadError && quotes.length === 0 ? (
        <p className="ee-muted" style={{ marginTop: 0 }}>
          No quotes linked to this job yet.
        </p>
      ) : null}

      {quotes.length > 0 ? (
        <div className="ee-job-quotes">
          {quotes.map((quote) => (
            <article className="ee-visit ee-job-quote" key={quote.id}>
              <div className="ee-job-quote-head">
                <strong>
                  {quote.quoteNumber}
                  {quote.title ? ` · ${quote.title}` : ''}
                </strong>
                <span className="ee-job-quote-badges">
                  {quote.isPrimary ? <span className="ee-job-quote-primary">Primary</span> : null}
                  {quote.associationKind !== 'quote' || quote.label ? (
                    <span className="ee-job-quote-kind">
                      {quote.label || associationKindLabel(quote.associationKind)}
                    </span>
                  ) : null}
                </span>
              </div>
              <span>
                {statusLabel(quote.status)} · {formatAudFromCents(quote.totalCentsIncGst)}
              </span>
              <span className="ee-quote-links">
                <Link href={'/hq/quotes/' + quote.id}>Open</Link>
                <Link href={'/hq/quotes/' + quote.id + '/preview'}>Preview</Link>
              </span>
              {canEdit && tableAvailable ? (
                <div className="ee-job-quote-actions">
                  {!quote.isPrimary ? (
                    <form action={setPrimaryJobQuote}>
                      <input type="hidden" name="job_id" value={jobId} />
                      <input type="hidden" name="quote_id" value={quote.id} />
                      <button type="submit" className="ee-text-action">
                        Make primary
                      </button>
                    </form>
                  ) : null}
                  <UnlinkJobQuoteButton
                    jobId={jobId}
                    quoteId={quote.id}
                    quoteNumber={quote.quoteNumber}
                    isPrimary={quote.isPrimary}
                  />
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {canEdit && tableAvailable ? (
        <div className="ee-job-quote-forms">
          <form action={linkQuoteToJob} className="ee-job-quote-link-form">
            <h3>Link existing quote</h3>
            {!customerId ? (
              <p className="ee-muted" style={{ marginBottom: 0 }}>
                Add a customer to this job before linking a quote. Jobs without a customer cannot
                link customer quotes.
              </p>
            ) : linkableQuotes.length === 0 ? (
              <p className="ee-muted" style={{ marginBottom: 0 }}>
                No other quotes are available to link for this customer.
              </p>
            ) : (
              <>
                <label>
                  Quote
                  <select name="quote_id" required defaultValue="">
                    <option value="" disabled>
                      Select a quote
                    </option>
                    {linkableQuotes.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.quote_number}
                        {option.title ? ` · ${option.title}` : ''} · {statusLabel(option.status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Type
                  <select name="association_kind" defaultValue="quote">
                    <option value="quote">Quote</option>
                    <option value="variation">Variation</option>
                    <option value="additional_works">Additional works</option>
                  </select>
                </label>
                <label>
                  Label (optional)
                  <input
                    name="label"
                    maxLength={80}
                    placeholder="e.g. Variation — switchboard"
                  />
                </label>
                <label className="ee-job-quote-check">
                  <input type="checkbox" name="make_primary" value="yes" />
                  Set as primary quote
                </label>
                <input type="hidden" name="job_id" value={jobId} />
                <button type="submit" className="hq-detail-action-primary">
                  Link quote
                </button>
              </>
            )}
          </form>

          <div className="ee-job-quote-create">
            <h3>Create from this job</h3>
            <p className="ee-muted" style={{ marginTop: 0 }}>
              Opens a new draft linked to this job. Edit pricing on the quote screen.
            </p>
            <div className="ee-job-quote-create-actions">
              <form action={createLinkedQuoteFromJob}>
                <input type="hidden" name="job_id" value={jobId} />
                <input type="hidden" name="association_kind" value="quote" />
                <button type="submit" className="hq-detail-action-primary" disabled={!customerId}>
                  New quote
                </button>
              </form>
              <form action={createLinkedQuoteFromJob}>
                <input type="hidden" name="job_id" value={jobId} />
                <input type="hidden" name="association_kind" value="variation" />
                <input type="hidden" name="label" value="Variation" />
                <button type="submit" disabled={!customerId}>
                  New variation
                </button>
              </form>
            </div>
            {!customerId ? (
              <p className="ee-muted">A customer is required before creating a quote.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {canEdit && !tableAvailable ? (
        <p className="ee-muted" style={{ marginBottom: 0 }}>
          Linking extra quotes needs the job_quotes migration. The primary quote from this job still
          shows above when present.
        </p>
      ) : null}
    </section>
  );
}
