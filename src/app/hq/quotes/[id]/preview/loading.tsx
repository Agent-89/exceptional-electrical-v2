export default function QuotePreviewLoading(){
 return <main className="quote-preview-loading" role="status" aria-live="polite" aria-label="Loading quotation preview">
  <div className="quote-preview-loading-card">
   <div className="quote-preview-loading-spinner" aria-hidden="true"/>
   <strong>Preparing quotation preview</strong>
   <p>Loading the latest saved quote…</p>
  </div>
  <style>{`
   .quote-preview-loading{min-height:100dvh;display:grid;place-items:center;background:#eef3f8;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#17334a}
   .quote-preview-loading-card{width:min(100%,390px);background:#fff;border:1px solid #dae5ee;border-radius:14px;padding:42px 28px;text-align:center;box-shadow:0 12px 36px #17334a0d}
   .quote-preview-loading-card strong{display:block;font-size:18px;margin:20px 0 8px}
   .quote-preview-loading-card p{color:#657d90;font-size:13px;margin:0}
   .quote-preview-loading-spinner{width:40px;height:40px;border:3px solid #dbeaf5;border-top-color:#0878b9;border-radius:50%;animation:quote-preview-spin .85s linear infinite;margin:auto}
   @keyframes quote-preview-spin{to{transform:rotate(360deg)}}
   @media(prefers-reduced-motion:reduce){.quote-preview-loading-spinner{animation:none;border-color:#0878b9}}
  `}</style>
 </main>;
}
