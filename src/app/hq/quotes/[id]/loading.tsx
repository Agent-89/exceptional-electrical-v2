export default function QuoteDetailLoading(){
 return <main className="hq-quote-loading" role="status" aria-live="polite" aria-label="Loading quote">
  <div className="hq-quote-loading-card">
   <div className="hq-quote-loading-spinner" aria-hidden="true"/>
   <strong>Opening quotation</strong>
   <p>Loading the saved quote details…</p>
  </div>
  <style>{`
   .hq-quote-loading{min-height:calc(100dvh - 100px);display:grid;place-items:center;background:#f2f6fb;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#17334a}
   .hq-quote-loading-card{width:min(100%,390px);background:white;border:1px solid #dae5ee;border-radius:14px;padding:42px 28px;text-align:center;box-shadow:0 12px 36px #17334a0d}
   .hq-quote-loading-card strong{display:block;font-size:18px;margin:20px 0 8px}
   .hq-quote-loading-card p{color:#657d90;font-size:13px;margin:0}
   .hq-quote-loading-spinner{width:40px;height:40px;border:3px solid #dbeaf5;border-top-color:#0878b9;border-radius:50%;animation:hq-quote-spin .85s linear infinite;margin:auto}
   @keyframes hq-quote-spin{to{transform:rotate(360deg)}}
   @media(prefers-reduced-motion:reduce){.hq-quote-loading-spinner{animation:none;border-color:#0878b9}}
  `}</style>
 </main>;
}
