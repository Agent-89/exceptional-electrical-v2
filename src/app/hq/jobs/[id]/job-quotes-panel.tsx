import Link from 'next/link';
import {
  associationKindLabel,
  formatAudFromCents,
  type JobQuoteDisplay,
} from '@/lib/job-quotes';
import { quoteBuilderNewHref } from '@/lib/quote-commercial';
import { setPrimaryJobQuote } from '../job-quote-actions';
import UnlinkJobQuoteButton from './unlink-job-quote-button';

function statusLabel(status: string): string {
  return status.replaceAll('_', ' ');
}

export default function JobQuotesPanel({
  jobId,
  customerId,
  quotes,
  tableAvailable,
  loadError,
  notice,
  actionError,
  canEdit,
}: {
  jobId: string;
  customerId: string | null;
  quotes: JobQuoteDisplay[];
  tableAvailable: boolean;
  loadError: string | null;
  notice?: string | null;
  actionError?: string | null;
  canEdit: boolean;
}) {
  const createActions =
    canEdit && tableAvailable ? (
      <div className="ee-job-quote-create-actions">
        {customerId ? (
          <>
            <Link
              className="hq-detail-action-primary"
              href={quoteBuilderNewHref({ jobId, type: 'standard' })}
            >
              New quote
            </Link>
            <Link
              className="hq-detail-action-secondary"
              href={quoteBuilderNewHref({
                jobId,
                type: 'variation',
                parentQuoteId:
                  quotes.find((q) => q.isCommercialCurrent)?.id ||
                  quotes.find((q) => q.isPrimary)?.id ||
                  quotes[0]?.id ||
                  null,
              })}
            >
              New variation
            </Link>
          </>
        ) : (
          <>
            <button type="button" className="hq-detail-action-primary" disabled>
              New quote
            </button>
            <button type="button" disabled>
              New variation
            </button>
          </>
        )}
      </div>
    ) : null;

  return (
    <section className="hq-panel ee-compact-panel" id="job-quotes">
      <div className="ee-section-title">
        <div>
          <span className="ee-eyebrow">QUOTES</span>
          <h2>Quotes &amp; variations</h2>
        </div>
        {createActions}
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

      {canEdit && tableAvailable && !customerId ? (
        <p className="ee-muted" style={{ marginTop: 0 }}>
          A customer is required before creating a quote.
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
                  {quote.isCommercialCurrent ? (
                    <span className="ee-job-quote-current">Current commercial</span>
                  ) : null}
                  {quote.parentQuoteNumber ? (
                    <span className="ee-job-quote-kind">Rev of {quote.parentQuoteNumber}</span>
                  ) : null}
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

      {canEdit && !tableAvailable ? (
        <p className="ee-muted" style={{ marginBottom: 0 }}>
          Linking extra quotes needs the job_quotes migration. The primary quote from this job still
          shows above when present.
        </p>
      ) : null}
    </section>
  );
}
