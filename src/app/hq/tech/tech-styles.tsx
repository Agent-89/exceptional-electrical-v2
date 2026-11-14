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
@media(min-width:700px){.ee-tech{padding:24px 20px 36px}}
`}</style>
  );
}
