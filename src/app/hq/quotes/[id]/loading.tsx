export default function QuoteDetailLoading(){
 return <div className="hq-quote-route-loading" role="status" aria-live="polite" aria-label="Loading quote">
  <style>{`
   .hq-quote-route-loading{height:3px;width:100%;background:linear-gradient(90deg,#dbeaf5,#0878b9,#dbeaf5);background-size:200% 100%;animation:hq-quote-route-pulse 1s linear infinite}
   @keyframes hq-quote-route-pulse{0%{background-position:100% 0}100%{background-position:-100% 0}}
   @media(prefers-reduced-motion:reduce){.hq-quote-route-loading{animation:none;background:#0878b9}}
  `}</style>
 </div>;
}
