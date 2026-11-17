/** Shared RSC skeleton used by route loading.tsx files (keep out of loading.tsx itself). */
export default function HqRouteSkeleton() {
  return (
    <div className="hq-route-loading" role="status" aria-live="polite" aria-label="Loading">
      <div className="hq-route-loading-bar" aria-hidden="true" />
      <div className="hq-dashboard-heading" style={{ marginBottom: 18 }}>
        <span className="hq-dashboard-skeleton hq-dashboard-skeleton-label" style={{ width: 120, height: 12 }} />
        <span className="hq-dashboard-skeleton" style={{ display: 'block', width: '42%', height: 28, marginTop: 10 }} />
        <span className="hq-dashboard-skeleton" style={{ display: 'block', width: '68%', height: 14, marginTop: 10 }} />
      </div>
      <div
        className="hq-dashboard-metrics"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 18 }}
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className="hq-dashboard-loading-card">
            <span className="hq-dashboard-skeleton hq-dashboard-skeleton-label" />
            <span className="hq-dashboard-skeleton hq-dashboard-skeleton-number" />
          </div>
        ))}
      </div>
      <div className="hq-panel" style={{ background: '#fff', border: '1px solid #dce7ef' }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="hq-dashboard-loading-row">
            <span className="hq-dashboard-skeleton" style={{ height: 14, width: '55%' }} />
            <span className="hq-dashboard-skeleton" style={{ height: 12, width: '28%' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
