export default function HqLoading(){
 return <main className="hq-route-pending" aria-busy="true" aria-label="Loading page">
  <div className="hq-route-pending-inner"><div className="hq-route-pending-line" aria-hidden="true"/><div className="hq-route-pending-heading" aria-hidden="true"/><div className="hq-route-pending-subheading" aria-hidden="true"/><div className="hq-route-pending-grid" aria-hidden="true">{[0,1,2].map(n=><div key={n}/>)}</div></div>
  <style>{`
   .hq-route-pending{min-height:65vh;background:#f2f6fb;padding:28px 20px;font-family:Arial,Helvetica,sans-serif}
   .hq-route-pending-inner{max-width:1100px;margin:0 auto}
   .hq-route-pending-line{height:3px;background:linear-gradient(90deg,#0878b9,#59b4e6,#0878b9);background-size:200% 100%;animation:hq-pending-shift 1.2s linear infinite;margin-bottom:28px;border-radius:3px}
   .hq-route-pending-heading,.hq-route-pending-subheading,.hq-route-pending-grid>div{background:#e1eaf2;border-radius:8px}
   .hq-route-pending-heading{width:185px;height:24px;margin-bottom:15px}.hq-route-pending-subheading{width:min(75%,390px);height:13px;margin-bottom:30px}
   .hq-route-pending-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.hq-route-pending-grid>div{height:112px}
   @keyframes hq-pending-shift{to{background-position:-200% 0}}
   @media(max-width:600px){.hq-route-pending-grid{grid-template-columns:1fr 1fr}.hq-route-pending-grid>div{height:85px}}
   @media(prefers-reduced-motion:reduce){.hq-route-pending-line{animation:none}}
  `}</style>
 </main>;
}
