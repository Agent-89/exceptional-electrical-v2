export default function HqLoading(){
 return <main className="hq-global-loading" role="status" aria-live="polite" aria-label="Loading page">
  <div className="hq-global-loading-card">
   <span className="hq-global-loading-spinner" aria-hidden="true"/>
   <strong>Loading page</strong>
   <p>Getting everything ready…</p>
  </div>
  <style>{`
   .hq-global-loading{min-height:calc(100dvh - 100px);display:grid;place-items:center;background:#f2f6fb;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#17334a}
   .hq-global-loading-card{width:min(100%,390px);background:#fff;border:1px solid #dae5ee;border-radius:14px;padding:42px 28px;text-align:center;box-shadow:0 12px 36px #17334a0d}
   .hq-global-loading-card strong{display:block;font-size:18px;margin:20px 0 8px}
   .hq-global-loading-card p{color:#657d90;font-size:13px;margin:0}
   .hq-global-loading-spinner{display:block;width:40px;height:40px;border:3px solid #dbeaf5;border-top-color:#0878b9;border-radius:50%;animation:hq-global-spin .85s linear infinite;margin:auto}
   @keyframes hq-global-spin{to{transform:rotate(360deg)}}
   @media(prefers-reduced-motion:reduce){.hq-global-loading-spinner{animation:none;border-color:#0878b9}}
  `}</style>
 </main>;
}
