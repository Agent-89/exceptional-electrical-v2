/** Shared technician mobile styles (HQ design tokens). */
export default function TechStyles() {
  return (
    <style>{`
.ee-tech{
  --ee-text:#123047;
  --ee-text-secondary:#2f4a5e;
  --ee-muted:#5f768a;
  --ee-label:#5a7388;
  --ee-surface:#ffffff;
  --ee-surface-2:#f4f8fc;
  --ee-surface-3:#eef5fb;
  --ee-border:#d7e5f1;
  --ee-border-soft:#e1eaf1;
  --ee-accent:#1689ed;
  --ee-accent-strong:#0d649f;
  --ee-link:#0875c9;
  --ee-bg:transparent;
  --ee-success-bg:#eef8f1;
  --ee-success-text:#1f6b3a;
  --ee-warn-bg:#fff4e5;
  --ee-warn-text:#8a5a12;
  --ee-danger-bg:#fff0f0;
  --ee-danger-text:#9d3030;
  --ee-chip-bg:#eaf2fa;
  --ee-chip-text:#18577d;
  max-width:720px;margin:0 auto;padding:14px 16px 24px;color:var(--ee-text);background:var(--ee-bg)
}
.ee-tech-head{margin:2px 0 12px}
.ee-tech-head h1{margin:8px 0 6px;font-size:clamp(28px,6vw,36px);letter-spacing:-.03em;line-height:1.15;color:var(--ee-text)}
.ee-tech-head p{margin:0;color:var(--ee-muted);font-size:14px;line-height:1.45}
.ee-tech-section{margin:16px 0 8px}
.ee-tech-hint{margin:0 0 10px;padding:0;font-size:12px;line-height:1.4;color:var(--ee-muted)}
.ee-tech-section h2{margin:0 0 10px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--ee-label)}
.ee-tech-card{display:grid;gap:10px;padding:16px;margin:0 0 12px;background:var(--ee-surface);border:1px solid var(--ee-border-soft);border-radius:14px;text-decoration:none;color:inherit}
.ee-tech-card-meta{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}
.ee-tech-card-meta strong{font-size:15px;color:var(--ee-text)}
.ee-tech-card-meta span,.ee-tech-muted{color:var(--ee-muted);font-size:13px}
.ee-tech-card h3{margin:0;font-size:18px;letter-spacing:-.02em;line-height:1.25;color:var(--ee-text)}
.ee-tech-card p{margin:0;color:var(--ee-text-secondary);font-size:14px;line-height:1.45}
.ee-tech-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}
.ee-tech-actions a,.ee-tech-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 14px;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none;border:0;cursor:pointer;font:inherit}
.ee-tech-btn-primary{background:var(--ee-accent);color:#fff}
.ee-tech-btn-secondary{background:var(--ee-surface-3);color:var(--ee-accent-strong);border:1px solid var(--ee-border)}
.ee-tech-empty{padding:28px 18px;text-align:center;background:var(--ee-surface);border:1px dashed var(--ee-border);border-radius:14px;color:var(--ee-muted)}
.ee-tech-empty strong{display:block;font-size:16px;margin-bottom:6px;color:var(--ee-text)}
.ee-tech-empty p{margin:0;font-size:13px;line-height:1.5;color:var(--ee-muted)}
.ee-tech-empty-compact{padding:16px 14px;margin:0 0 12px}
.ee-tech-alert{padding:12px 14px;margin:0 0 14px;border-radius:10px;background:var(--ee-warn-bg);color:var(--ee-warn-text);font-size:13px}
.ee-tech-alert-error{background:var(--ee-danger-bg);color:var(--ee-danger-text)}
.ee-tech-offline-banner{position:sticky;top:0;z-index:40;margin:0 0 12px;padding:10px 12px;border-radius:10px;background:#e8f1fa;color:#18577d;font-size:13px;line-height:1.4;border:1px solid #c5dbeb}
.ee-tech-offline-banner.is-offline{background:var(--ee-warn-bg);color:var(--ee-warn-text);border-color:#f0d7a8}
.ee-tech-offline-banner button{margin-left:8px;border:0;background:transparent;color:inherit;font:inherit;font-weight:700;text-decoration:underline;cursor:pointer;padding:0}
.ee-tech-alert-success{background:var(--ee-success-bg);color:var(--ee-success-text);display:grid;gap:4px}
.ee-tech-outcome{margin:0;padding:0;border:0;display:grid;gap:8px}
.ee-tech-outcome legend{padding:0;margin:0 0 2px;font-size:13px;font-weight:700;color:var(--ee-text)}
.ee-tech-outcome-option{display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;align-items:start;padding:12px;border:1px solid var(--ee-border);border-radius:12px;background:var(--ee-surface-2);font-weight:650}
.ee-tech-outcome-option input{margin-top:3px;width:18px;height:18px}
.ee-tech-outcome-option span{display:grid;gap:2px}
.ee-tech-outcome-option strong{font-size:14px;color:var(--ee-text)}
.ee-tech-outcome-option small{font-size:12px;font-weight:500;color:var(--ee-muted);line-height:1.4}
.ee-tech-status{display:inline-flex;align-items:center;padding:5px 9px;border-radius:999px;background:var(--ee-chip-bg);color:var(--ee-chip-text);font-size:11px;font-weight:750;text-transform:capitalize}
.ee-tech-panel{padding:18px;margin:0 0 12px;background:var(--ee-surface);border:1px solid var(--ee-border-soft);border-radius:14px}
.ee-tech-panel h2{margin:0 0 12px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--ee-accent)}
.ee-tech-dl{display:grid;gap:12px;margin:0}
.ee-tech-dl div{display:grid;gap:3px}
.ee-tech-dl dt{font-size:11px;font-weight:750;letter-spacing:.06em;text-transform:uppercase;color:var(--ee-label)}
.ee-tech-dl dd{margin:0;font-size:15px;overflow-wrap:anywhere;color:var(--ee-text)}
.ee-tech-dl a{color:var(--ee-link);font-weight:700;text-decoration:none}
.ee-tech-visit{display:grid;gap:6px;padding:12px 0;border-bottom:1px solid var(--ee-border-soft)}
.ee-tech-visit:last-child{border-bottom:0;padding-bottom:0}
.ee-tech-account{display:grid;gap:10px}
.ee-tech-account p{margin:0;font-size:15px}
.ee-tech-account small{color:var(--ee-muted)}
.ee-tech-logout{margin-top:18px}
.ee-tech-logout button{width:100%;min-height:48px;border:0;border-radius:10px;background:#123047;color:#fff;font-weight:750;cursor:pointer}
.ee-tech-card-compact{padding:14px}
.ee-tech-cal{margin:0 0 18px}
.ee-tech-cal-nav{display:grid;grid-template-columns:44px minmax(0,1fr) 44px auto;gap:8px;align-items:center;margin-bottom:10px}
.ee-tech-cal-arrow{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border:1px solid var(--ee-border);border-radius:10px;background:var(--ee-surface);color:var(--ee-accent-strong);line-height:1;text-decoration:none}
.ee-tech-cal-day{min-width:0;text-align:center}
.ee-tech-cal-day strong{display:block;font-size:15px;color:var(--ee-text)}
.ee-tech-cal-day span{display:block;font-size:12px;color:var(--ee-muted);margin-top:2px}
.ee-tech-cal-today{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 12px;border-radius:10px;border:1px solid var(--ee-border);background:var(--ee-surface-3);color:var(--ee-accent-strong);font-size:13px;font-weight:750;text-decoration:none}
.ee-tech-cal-today.is-current{background:#e8f3ff;border-color:#95c9f0;color:var(--ee-link)}
.ee-tech-cal-scroll{max-height:min(62vh,560px);overflow:auto;border:1px solid var(--ee-border);border-radius:14px;background:var(--ee-surface);-webkit-overflow-scrolling:touch}
.ee-tech-cal-grid{display:grid;grid-template-columns:52px minmax(0,1fr);position:relative;min-height:100%}
.ee-tech-cal-hours{position:relative;border-right:1px solid var(--ee-border-soft);background:var(--ee-surface-2)}
.ee-tech-cal-hours span{position:absolute;right:6px;transform:translateY(-50%);font-size:10px;color:var(--ee-muted)}
.ee-tech-cal-lane{position:relative;background-image:linear-gradient(to bottom,var(--ee-border-soft) 1px,transparent 1px)}
.ee-tech-cal-now{position:absolute;left:0;right:0;height:2px;background:#ec5a56;z-index:5;pointer-events:none}
.ee-tech-cal-now span{position:absolute;right:4px;top:-14px;font-size:10px;font-weight:800;color:#c83e39}
.ee-tech-cal-block{position:absolute;z-index:2;display:flex;flex-direction:column;gap:2px;padding:7px 8px;box-sizing:border-box;overflow:hidden;border:1px solid #95c9f0;border-left:3px solid #1688e9;border-radius:8px;background:#e8f3ff;color:inherit;text-decoration:none;min-width:0}
.ee-tech-cal-block:active,.ee-tech-cal-block:hover{border-color:#1688e9;background:#dff0ff}
.ee-tech-cal-job{font-size:12px;line-height:1.25;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;color:var(--ee-text)}
.ee-tech-cal-meta{font-size:11px;color:var(--ee-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ee-tech-cal-status{align-self:flex-start;margin-top:auto;font-size:10px;font-weight:750;text-transform:capitalize;color:var(--ee-chip-text);background:var(--ee-surface);border-radius:999px;padding:2px 7px}
.ee-tech-cal-empty{position:absolute;inset:18px 12px;display:grid;place-content:center;text-align:center;color:var(--ee-muted);padding:12px}
.ee-tech-cal-empty strong{color:var(--ee-text);font-size:15px;margin-bottom:4px}
.ee-tech-cal-empty p{margin:0;font-size:13px;line-height:1.45}
.ee-tech-stack{display:grid;gap:8px}
.ee-tech-timer{display:grid;gap:10px}
.ee-tech-timer-readout{display:grid;gap:4px;padding:14px;border-radius:12px;background:var(--ee-surface-2);border:1px solid var(--ee-border-soft)}
.ee-tech-timer-readout strong{font-size:28px;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.ee-tech-timer-readout span{font-size:13px;color:var(--ee-muted)}
.ee-tech-btn-danger{background:var(--ee-danger-bg);color:var(--ee-danger-text);border:1px solid #f0d0d0}
.ee-tech-btn-ghost{background:var(--ee-surface);color:var(--ee-text-secondary);border:1px solid var(--ee-border)}
.ee-tech-btn:disabled{opacity:.55;cursor:not-allowed}
.ee-tech-form{display:grid;gap:10px}
.ee-tech-form label{display:grid;gap:5px;font-size:13px;font-weight:700;color:var(--ee-text)}
.ee-tech-form input,.ee-tech-form textarea,.ee-tech-form select{width:100%;box-sizing:border-box;min-height:44px;padding:10px 12px;border:1px solid #cbd8e6;border-radius:10px;font:inherit;font-size:16px;background:var(--ee-surface);color:var(--ee-text)}
.ee-tech-form textarea{min-height:88px;resize:vertical}
.ee-tech-form .ee-tech-check{display:flex;align-items:center;gap:8px;font-weight:650}
.ee-tech-form .ee-tech-check input{width:18px;height:18px;min-height:0}
.ee-tech-note{display:grid;gap:4px;padding:12px 0;border-bottom:1px solid var(--ee-border-soft)}
.ee-tech-note:last-child{border-bottom:0}
.ee-tech-note p{margin:0;font-size:14px;line-height:1.45;overflow-wrap:anywhere;color:var(--ee-text)}
.ee-tech-note small{color:var(--ee-muted)}
.ee-tech-gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.ee-tech-gallery a,.ee-tech-gallery figure{margin:0;aspect-ratio:1;border-radius:10px;overflow:hidden;border:1px solid var(--ee-border-soft);background:var(--ee-surface-2)}
.ee-tech-gallery img{width:100%;height:100%;object-fit:cover;display:block}
.ee-tech-time-row{display:grid;gap:4px;padding:10px 0;border-bottom:1px solid var(--ee-border-soft);font-size:13px;color:var(--ee-text-secondary)}
.ee-tech-time-row strong{font-size:14px;color:var(--ee-text)}
.ee-tech-entry-status{display:inline-flex;align-items:center;width:fit-content;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.02em;text-transform:uppercase}
.ee-tech-entry-active{background:var(--ee-success-bg);color:var(--ee-success-text)}
.ee-tech-entry-break{background:var(--ee-warn-bg);color:var(--ee-warn-text)}
.ee-tech-entry-submitted{background:var(--ee-surface-3);color:var(--ee-accent-strong)}
.ee-tech-entry-other{background:#f2f4f6;color:#526a7c}
.ee-tech-visit-page{padding-bottom:20px}
.ee-tech-overview{margin:2px 0 10px;display:grid;gap:8px}
.ee-tech-overview-top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
.ee-tech-overview h1{margin:0;font-size:clamp(24px,6vw,32px);letter-spacing:-.03em;line-height:1.15;color:var(--ee-text)}
.ee-tech-overview-meta{display:grid;gap:10px}
.ee-tech-overview-line{display:grid;gap:3px;margin:0;font-size:15px;line-height:1.4;color:var(--ee-text-secondary);font-weight:550}
.ee-tech-overview-label{font-size:11px;font-weight:750;letter-spacing:.06em;text-transform:uppercase;color:var(--ee-label)}
.ee-tech-overview-line a{color:var(--ee-link);font-weight:700;text-decoration:none}
.ee-tech-status-field{background:var(--ee-surface-3);color:var(--ee-accent-strong)}
.ee-tech-timer-hero{display:grid;gap:12px;padding:16px;border-radius:16px;background:var(--ee-surface);border:1px solid var(--ee-border);box-shadow:0 1px 0 rgba(16,43,64,.04)}
.ee-tech-timer-hero-working{border-color:#95c9f0;background:linear-gradient(180deg,#f3f9ff 0%,var(--ee-surface) 55%)}
.ee-tech-timer-hero-on_break{border-color:#f0d4a8;background:linear-gradient(180deg,#fff8ee 0%,var(--ee-surface) 55%)}
.ee-tech-timer-hero-finished{border-color:#b7dfc4;background:linear-gradient(180deg,#f1faf4 0%,var(--ee-surface) 55%)}
.ee-tech-timer-hero-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ee-tech-timer-hero-head h2{margin:0;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--ee-accent)}
.ee-tech-timer-phase{display:inline-flex;align-items:center;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:750;background:var(--ee-chip-bg);color:var(--ee-chip-text)}
.ee-tech-timer-phase-working{background:var(--ee-success-bg);color:var(--ee-success-text)}
.ee-tech-timer-phase-on_break{background:var(--ee-warn-bg);color:var(--ee-warn-text)}
.ee-tech-timer-phase-finished{background:var(--ee-success-bg);color:var(--ee-success-text)}
.ee-tech-timer-phase-not_started{background:var(--ee-surface-3);color:var(--ee-accent-strong)}
.ee-tech-timer-readout-hero{padding:16px 14px;text-align:center;border-radius:14px;background:var(--ee-surface-2);border:1px solid var(--ee-border-soft);display:grid;gap:10px}
.ee-tech-timer-primary{display:grid;gap:4px}
.ee-tech-timer-primary strong{display:block;font-size:clamp(40px,12vw,52px);letter-spacing:-.04em;font-variant-numeric:tabular-nums;line-height:1;color:var(--ee-text)}
.ee-tech-timer-caption{display:block;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--ee-label)}
.ee-tech-timer-metrics{display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:left}
.ee-tech-timer-metric{padding:10px 12px;border-radius:10px;background:var(--ee-surface);border:1px solid var(--ee-border-soft)}
.ee-tech-timer-metric.is-live{border-color:#f0d4a8;background:#fff8ee}
.ee-tech-timer-metric span{display:block;font-size:11px;font-weight:750;letter-spacing:.04em;text-transform:uppercase;color:var(--ee-label)}
.ee-tech-timer-metric strong{display:block;margin-top:4px;font-size:18px;font-variant-numeric:tabular-nums;color:var(--ee-text)}
.ee-tech-timer-schedule{font-size:13px;color:var(--ee-muted)}
.ee-tech-actions-timer{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:0}
.ee-tech-actions-timer .ee-tech-btn{width:100%;min-height:52px;font-size:15px}
.ee-tech-quick{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.ee-tech-quick-btn{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:56px;padding:10px 8px;border-radius:12px;border:1px solid var(--ee-border);background:var(--ee-surface-3);color:var(--ee-accent-strong);font-size:13px;font-weight:750;cursor:pointer}
.ee-tech-quick-btn:active{filter:brightness(.97)}
.ee-tech-quick-count{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--ee-accent);color:#fff;font-size:11px;font-weight:800}
.ee-tech-fold{margin:0;border:1px solid var(--ee-border-soft);border-radius:14px;background:var(--ee-surface);overflow:hidden;scroll-margin-top:72px}
.ee-tech-fold>summary{list-style:none;cursor:pointer;padding:12px 14px;font-size:13px;font-weight:750;color:var(--ee-text);user-select:none}
.ee-tech-fold>summary::-webkit-details-marker{display:none}
.ee-tech-fold>summary::after{content:'▾';float:right;color:var(--ee-muted);font-weight:700}
.ee-tech-fold[open]>summary::after{content:'▴'}
.ee-tech-fold-body{padding:0 14px 14px;border-top:1px solid var(--ee-border-soft)}
.ee-tech-section-block{padding:16px;border:1px solid var(--ee-border-soft);border-radius:14px;background:var(--ee-surface);scroll-margin-top:72px}
.ee-tech-section-block h2{margin:0 0 12px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--ee-accent)}
.ee-tech-dl-compact{gap:10px}
.ee-tech-subhead{margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--ee-label)}
.ee-tech-footer-link{margin-top:4px}
.ee-tech-footer-link .ee-tech-btn{width:100%}
.ee-tech-file-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.ee-tech-photo-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ee-tech-photo-actions .ee-tech-btn{width:100%;min-height:48px}
.ee-tech-photo-chosen{margin:0;padding:10px 12px;border-radius:10px;background:var(--ee-surface-2);border:1px solid var(--ee-border-soft);font-size:13px;color:var(--ee-text-secondary);overflow-wrap:anywhere}
@media(min-width:700px){.ee-tech{padding:20px 20px 28px;max-width:860px}.ee-tech-cal-scroll{max-height:min(70vh,720px)}.ee-tech-cal-grid{grid-template-columns:62px minmax(0,1fr)}.ee-tech-gallery{grid-template-columns:repeat(4,minmax(0,1fr))}.ee-tech-quick{max-width:420px}}
@media(prefers-color-scheme:dark){
.ee-tech{
  --ee-text:#eef4fa;
  --ee-text-secondary:#c9d8e6;
  --ee-muted:#9ab6c7;
  --ee-label:#8aa0b3;
  --ee-surface:#152433;
  --ee-surface-2:#101c28;
  --ee-surface-3:#1b3144;
  --ee-border:#35536b;
  --ee-border-soft:#2a3f52;
  --ee-accent:#4da3ef;
  --ee-accent-strong:#8ec7f3;
  --ee-link:#6eb8f0;
  --ee-bg:#0d1822;
  --ee-success-bg:#173226;
  --ee-success-text:#9fd6b2;
  --ee-warn-bg:#3a2c14;
  --ee-warn-text:#f0d19a;
  --ee-danger-bg:#3a1f22;
  --ee-danger-text:#f0a8a8;
  --ee-chip-bg:#1b3144;
  --ee-chip-text:#8ec7f3;
  border-radius:0
}
.ee-tech-timer-hero-working{background:linear-gradient(180deg,#163248 0%,var(--ee-surface) 60%);border-color:#2f6fa0}
.ee-tech-timer-hero-on_break{background:linear-gradient(180deg,#2f2718 0%,var(--ee-surface) 60%);border-color:#8a6a2e}
.ee-tech-timer-hero-finished{background:linear-gradient(180deg,#173226 0%,var(--ee-surface) 60%);border-color:#3d7a55}
.ee-tech-timer-metric.is-live{background:#2f2718;border-color:#8a6a2e}
.ee-tech-cal-today.is-current{background:#1b3144;border-color:#2f6fa0;color:var(--ee-link)}
.ee-tech-cal-block{background:#1b3144;border-color:#2f6fa0;color:var(--ee-text)}
.ee-tech-cal-lane{background-image:linear-gradient(to bottom,var(--ee-border-soft) 1px,transparent 1px)}
.ee-tech-btn-danger{border-color:#6e3a3f}
.ee-tech-entry-other{background:#1b2430;color:#9ab6c7}
.ee-tech-form input,.ee-tech-form textarea,.ee-tech-form select{border-color:var(--ee-border)}
}
`}</style>
  );
}
