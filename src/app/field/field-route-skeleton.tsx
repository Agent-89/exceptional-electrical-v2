import TechStyles from './tech-styles';

/** Shared Field RSC skeleton for route loading.tsx files. */
export default function FieldRouteSkeleton() {
  return (
    <main className="ee-tech" aria-busy="true">
      <TechStyles />
      <div className="ee-tech-loading" role="status" aria-live="polite" aria-label="Loading">
        <div className="ee-tech-loading-bar" aria-hidden="true" />
        <header className="ee-tech-head">
          <span className="ee-tech-loading-line" style={{ width: 140, height: 10 }} />
          <span className="ee-tech-loading-line" style={{ width: '46%', height: 28, marginTop: 10 }} />
          <span className="ee-tech-loading-line" style={{ width: '62%', height: 14 }} />
        </header>
        <div className="ee-tech-loading-block" style={{ minHeight: 220 }} aria-hidden="true" />
        <div className="ee-tech-loading-block" style={{ minHeight: 96 }} aria-hidden="true" />
        <div className="ee-tech-loading-block" style={{ minHeight: 96 }} aria-hidden="true" />
      </div>
    </main>
  );
}
