export default function Loading(){
 return <main className="hq-dashboard" aria-busy="true" aria-label="Loading operations dashboard"><div className="hq-dashboard-inner">
  <div className="hq-dashboard-heading"><div className="hq-kicker">EXCEPTIONAL ELECTRICAL HQ · OPERATIONS</div><h1>Home</h1><p>Loading your priorities…</p></div>
  <section className="hq-dashboard-section"><div className="hq-dashboard-section-head"><div><div className="hq-kicker">YOUR PRIORITIES</div><h2>Needs attention</h2></div></div>
  <div className="hq-dashboard-metrics">{[0,1,2,3].map(i=><div key={i} className="hq-dashboard-loading-card"><span className="hq-dashboard-skeleton hq-dashboard-skeleton-label"/><span className="hq-dashboard-skeleton hq-dashboard-skeleton-number"/><span className="hq-dashboard-skeleton hq-dashboard-skeleton-label"/></div>)}</div>
  <div className="hq-dashboard-queue"><div className="hq-dashboard-queue-title"><h3>Priority inbox</h3></div>{[0,1,2].map(i=><div key={i} className="hq-dashboard-loading-row"><span className="hq-dashboard-skeleton hq-dashboard-skeleton-label"/><span className="hq-dashboard-skeleton hq-dashboard-skeleton-label"/></div>)}</div>
  </section>
 </div></main>;
}
