/** Shared technician mobile styles (HQ design tokens). */
export default function TechStyles() {
  return (
    <style>{`
.ee-tech{max-width:720px;margin:0 auto;padding:18px 16px 28px}
.ee-tech-head{margin:4px 0 18px}
.ee-tech-head h1{margin:8px 0 6px;font-size:clamp(28px,6vw,36px);letter-spacing:-.03em;line-height:1.15}
.ee-tech-head p{margin:0;color:var(--hq-muted,#718294);font-size:14px;line-height:1.45}
.ee-tech-section{margin:22px 0 10px}
.ee-tech-section h2{margin:0 0 10px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#5f7a8f}
.ee-tech-card{display:grid;gap:10px;padding:16px;margin:0 0 12px;background:#fff;border:1px solid #e1eaf1;border-radius:14px;text-decoration:none;color:inherit}
.ee-tech-card-meta{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}
.ee-tech-card-meta strong{font-size:15px}
.ee-tech-card-meta span,.ee-tech-muted{color:#667e91;font-size:13px}
.ee-tech-card h3{margin:0;font-size:18px;letter-spacing:-.02em;line-height:1.25}
.ee-tech-card p{margin:0;color:#435a6d;font-size:14px;line-height:1.45}
.ee-tech-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}
.ee-tech-actions a,.ee-tech-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 14px;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none}
.ee-tech-btn-primary{background:#1689ed;color:#fff}
.ee-tech-btn-secondary{background:#eef5fb;color:#0d649f;border:1px solid #d3e4f2}
.ee-tech-empty{padding:28px 18px;text-align:center;background:#fff;border:1px dashed #d5e1eb;border-radius:14px;color:#53697b}
.ee-tech-empty strong{display:block;font-size:16px;margin-bottom:6px;color:#123047}
.ee-tech-empty p{margin:0;font-size:13px;line-height:1.5;color:#667e91}
.ee-tech-alert{padding:12px 14px;margin:0 0 14px;border-radius:10px;background:#fff4e5;color:#8a5a12;font-size:13px}
.ee-tech-alert-error{background:#fff0f0;color:#9d3030}
.ee-tech-status{display:inline-flex;align-items:center;padding:5px 9px;border-radius:999px;background:#eaf2fa;color:#18577d;font-size:11px;font-weight:750;text-transform:capitalize}
.ee-tech-panel{padding:18px;margin:0 0 12px;background:#fff;border:1px solid #e1eaf1;border-radius:14px}
.ee-tech-panel h2{margin:0 0 12px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#1689ed}
.ee-tech-dl{display:grid;gap:12px;margin:0}
.ee-tech-dl div{display:grid;gap:3px}
.ee-tech-dl dt{font-size:11px;font-weight:750;letter-spacing:.06em;text-transform:uppercase;color:#718294}
.ee-tech-dl dd{margin:0;font-size:15px;overflow-wrap:anywhere}
.ee-tech-dl a{color:#0875c9;font-weight:700;text-decoration:none}
.ee-tech-visit{display:grid;gap:6px;padding:12px 0;border-bottom:1px solid #e8eef3}
.ee-tech-visit:last-child{border-bottom:0;padding-bottom:0}
.ee-tech-account{display:grid;gap:10px}
.ee-tech-account p{margin:0;font-size:15px}
.ee-tech-account small{color:#718294}
.ee-tech-logout{margin-top:18px}
.ee-tech-logout button{width:100%;min-height:48px;border:0;border-radius:10px;background:#123047;color:#fff;font-weight:750;cursor:pointer}
.ee-tech-card-compact{padding:14px}
.ee-tech-cal{margin:0 0 18px}
.ee-tech-cal-nav{display:grid;grid-template-columns:44px minmax(0,1fr) 44px auto;gap:8px;align-items:center;margin-bottom:10px}
.ee-tech-cal-arrow{display:grid;place-items:center;min-height:44px;border:1px solid #d4e1ed;border-radius:10px;background:#fff;color:#0d649f;font-size:28px;line-height:1;text-decoration:none}
.ee-tech-cal-day{min-width:0;text-align:center}
.ee-tech-cal-day strong{display:block;font-size:15px;color:#123047}
.ee-tech-cal-day span{display:block;font-size:12px;color:#667e91;margin-top:2px}
.ee-tech-cal-today{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 12px;border-radius:10px;border:1px solid #d3e4f2;background:#eef5fb;color:#0d649f;font-size:13px;font-weight:750;text-decoration:none}
.ee-tech-cal-today.is-current{background:#e8f3ff;border-color:#95c9f0;color:#0875c9}
.ee-tech-cal-scroll{max-height:min(62vh,560px);overflow:auto;border:1px solid #dce5ee;border-radius:14px;background:#fff;-webkit-overflow-scrolling:touch}
.ee-tech-cal-grid{display:grid;grid-template-columns:52px minmax(0,1fr);position:relative;min-height:100%}
.ee-tech-cal-hours{position:relative;border-right:1px solid #e0e9f1;background:#f9fbfd}
.ee-tech-cal-hours span{position:absolute;right:6px;transform:translateY(-50%);font-size:10px;color:#718397}
.ee-tech-cal-lane{position:relative;background-image:linear-gradient(to bottom,#e8edf3 1px,transparent 1px)}
.ee-tech-cal-now{position:absolute;left:0;right:0;height:2px;background:#ec5a56;z-index:5;pointer-events:none}
.ee-tech-cal-now span{position:absolute;right:4px;top:-14px;font-size:10px;font-weight:800;color:#c83e39}
.ee-tech-cal-block{position:absolute;z-index:2;display:flex;flex-direction:column;gap:2px;padding:7px 8px;box-sizing:border-box;overflow:hidden;border:1px solid #95c9f0;border-left:3px solid #1688e9;border-radius:8px;background:#e8f3ff;color:inherit;text-decoration:none;min-width:0}
.ee-tech-cal-block:active,.ee-tech-cal-block:hover{border-color:#1688e9;background:#dff0ff}
.ee-tech-cal-job{font-size:12px;line-height:1.25;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.ee-tech-cal-meta{font-size:11px;color:#4d687d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ee-tech-cal-status{align-self:flex-start;margin-top:auto;font-size:10px;font-weight:750;text-transform:capitalize;color:#18577d;background:#fff;border-radius:999px;padding:2px 7px}
.ee-tech-cal-empty{position:absolute;inset:18px 12px;display:grid;place-content:center;text-align:center;color:#667e91;padding:12px}
.ee-tech-cal-empty strong{color:#123047;font-size:15px;margin-bottom:4px}
.ee-tech-cal-empty p{margin:0;font-size:13px;line-height:1.45}
.ee-tech-stack{display:grid;gap:12px}
.ee-tech-timer{display:grid;gap:10px}
.ee-tech-timer-readout{display:grid;gap:4px;padding:14px;border-radius:12px;background:#f4f8fc;border:1px solid #e1eaf1}
.ee-tech-timer-readout strong{font-size:28px;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.ee-tech-timer-readout span{font-size:13px;color:#667e91}
.ee-tech-btn-danger{background:#fff0f0;color:#9d3030;border:1px solid #f0d0d0}
.ee-tech-btn-ghost{background:#fff;color:#435a6d;border:1px solid #d5e1eb}
.ee-tech-btn:disabled{opacity:.55;cursor:not-allowed}
.ee-tech-form{display:grid;gap:10px}
.ee-tech-form label{display:grid;gap:5px;font-size:13px;font-weight:700;color:#123047}
.ee-tech-form input,.ee-tech-form textarea,.ee-tech-form select{width:100%;box-sizing:border-box;min-height:44px;padding:10px 12px;border:1px solid #cbd8e6;border-radius:10px;font:inherit;font-size:16px;background:#fff}
.ee-tech-form textarea{min-height:88px;resize:vertical}
.ee-tech-form .ee-tech-check{display:flex;align-items:center;gap:8px;font-weight:650}
.ee-tech-form .ee-tech-check input{width:18px;height:18px;min-height:0}
.ee-tech-note{display:grid;gap:4px;padding:12px 0;border-bottom:1px solid #e8eef3}
.ee-tech-note:last-child{border-bottom:0}
.ee-tech-note p{margin:0;font-size:14px;line-height:1.45;overflow-wrap:anywhere}
.ee-tech-note small{color:#718294}
.ee-tech-gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.ee-tech-gallery a,.ee-tech-gallery figure{margin:0;aspect-ratio:1;border-radius:10px;overflow:hidden;border:1px solid #e1eaf1;background:#f4f8fc}
.ee-tech-gallery img{width:100%;height:100%;object-fit:cover;display:block}
.ee-tech-time-row{display:grid;gap:4px;padding:10px 0;border-bottom:1px solid #e8eef3;font-size:13px}
.ee-tech-time-row strong{font-size:14px}
@media(min-width:700px){.ee-tech{padding:24px 20px 36px;max-width:860px}.ee-tech-cal-scroll{max-height:min(70vh,720px)}.ee-tech-cal-grid{grid-template-columns:62px minmax(0,1fr)}.ee-tech-gallery{grid-template-columns:repeat(4,minmax(0,1fr))}}
`}</style>
  );
}
