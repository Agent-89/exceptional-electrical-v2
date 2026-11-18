export function GET() {
  const js = `const VERSION='exceptional-hq-v3';
self.addEventListener('install',event=>{self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim())});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
 // Never cache private HQ pages, API responses, or customer information.
});
self.addEventListener('push',event=>{
 let data={title:'New enquiry',body:'Open HQ to review',url:'/hq/enquiries',tag:'enquiry'};
 try{
  if(event.data){
   const parsed=event.data.json();
   if(parsed&&typeof parsed==='object')data={...data,...parsed};
  }
 }catch(_){ /* keep defaults */ }
 const title=typeof data.title==='string'&&data.title?data.title:'New enquiry';
 const options={
  body:typeof data.body==='string'?data.body:'Open HQ to review',
  icon:'/hq/icon.png?size=192&v=4',
  badge:'/hq/icon.png?size=192&v=4',
  tag:typeof data.tag==='string'&&data.tag?data.tag:'enquiry',
  data:{url:typeof data.url==='string'&&data.url.startsWith('/hq')?data.url:'/hq/enquiries'},
  renotify:true
 };
 event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const target=(event.notification&&event.notification.data&&event.notification.data.url)||'/hq/enquiries';
 const absolute=new URL(target,self.location.origin).href;
 event.waitUntil((async()=>{
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of clients){
   if('focus' in client){
    const url=new URL(client.url);
    if(url.origin===self.location.origin&&url.pathname.startsWith('/hq')){
     await client.focus();
     if('navigate' in client)await client.navigate(absolute);
     return;
    }
   }
  }
  if(self.clients.openWindow)await self.clients.openWindow(absolute);
 })());
});`;
  return new Response(js, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'Service-Worker-Allowed': '/hq/',
    },
  });
}
