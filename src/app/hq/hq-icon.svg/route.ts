export function GET(){
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="100" fill="#092b49"/><path d="M286 64 136 274h114l-26 174 155-235H264z" fill="#21a4f5"/><text x="256" y="480" fill="#ffffff" font-family="Arial,sans-serif" font-size="43" font-weight="bold" text-anchor="middle">HQ</text></svg>';
 return new Response(svg,{headers:{'Content-Type':'image/svg+xml','Cache-Control':'public,max-age=86400','X-Content-Type-Options':'nosniff'}});
}
