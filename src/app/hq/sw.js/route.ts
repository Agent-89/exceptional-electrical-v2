export function GET(){
 const js=`const VERSION='exceptional-hq-v1';
self.addEventListener('install',event=>{self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim())});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
 // Never cache private HQ pages, API responses, or customer information.
 // Network requests remain authoritative and require normal authentication.
});`;
 return new Response(js,{headers:{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store','Service-Worker-Allowed':'/hq/'}});
}
