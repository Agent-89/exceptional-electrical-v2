'use client';

export default function HqError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="hq-detail" role="alert">
      <div className="hq-panel" style={{ background: '#fff', border: '1px solid #dce7ef', maxWidth: 520 }}>
        <div className="hq-kicker">SOMETHING WENT WRONG</div>
        <h1 style={{ margin: '8px 0 10px', fontSize: 24 }}>Unable to load this page</h1>
        <p style={{ margin: '0 0 18px', color: '#718294', lineHeight: 1.45 }}>
          {error.message || 'An unexpected error occurred. Try again, or go back to HQ home.'}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button type="button" className="hq-detail-action-primary" onClick={() => reset()} style={{ border: 0, cursor: 'pointer' }}>
            Try again
          </button>
          <a href="/hq" className="hq-detail-action-secondary">
            Back to HQ
          </a>
        </div>
      </div>
    </div>
  );
}
