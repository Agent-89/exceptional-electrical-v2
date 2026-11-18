/** Shared RSC skeleton used by route loading.tsx files (keep out of loading.tsx itself). */
export default function HqRouteSkeleton() {
  return (
    <div className="hq-route-loading" role="status" aria-live="polite" aria-label="Loading">
      <div className="hq-route-loading-bar" aria-hidden="true" />
      <div className="hq-dashboard-heading" style={{ marginBottom: 18 }}>
        <span className="hq-dashboard-skeleton hq-dashboard-skeleton-label" style={{ width: 120, height: 12 }} />
        <span className="hq-dashboard-skeleton" style={{ display: 'block', width: '42%', height: 28, marginTop: 10 }} />
      </div>
      <div className="hq-dashboard-pulse" style={{ marginBottom: 18 }}>
        {[0, 1].map((i) => (
          <div key={i} className="hq-dashboard-loading-card">
            <span className="hq-dashboard-skeleton hq-dashboard-skeleton-label" />
            <span className="hq-dashboard-skeleton hq-dashboard-skeleton-number" />
            <span className="hq-dashboard-skeleton" style={{ height: 12, width: '55%', marginTop: 10 }} />
          </div>
        ))}
      </div>
      <div className="hq-panel" style={{ background: '#fff', border: '1px solid #dce7ef', marginBottom: 18 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="hq-dashboard-loading-row">
            <span className="hq-dashboard-skeleton" style={{ height: 14, width: '55%' }} />
            <span className="hq-dashboard-skeleton" style={{ height: 12, width: '70%' }} />
          </div>
        ))}
      </div>
      <div
        className="hq-dashboard-actions hq-dashboard-actions-4"
        style={{ marginBottom: 18 }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="hq-dashboard-loading-card" style={{ minHeight: 108 }}>
            <span className="hq-dashboard-skeleton" style={{ height: 18, width: 24 }} />
            <span className="hq-dashboard-skeleton hq-dashboard-skeleton-label" />
          </div>
        ))}
      </div>
      <div
        className="hq-dashboard-metrics hq-dashboard-metrics-4"
        style={{ display: 'grid', gap: 12 }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="hq-dashboard-loading-card" style={{ minHeight: 108 }}>
            <span className="hq-dashboard-skeleton hq-dashboard-skeleton-label" />
            <span className="hq-dashboard-skeleton hq-dashboard-skeleton-number" />
          </div>
        ))}
      </div>
    </div>
  );
}
