export function GET() {
  const js = `const VERSION='exceptional-field-v2';
const SHELL_CACHE='ee-field-shell-v2';
const FIELD_SHELL=[
  '/field',
  '/field/jobs',
  '/field/account',
  '/field/login',
  '/field/manifest.webmanifest',
  '/field/icon.png?size=192&v=5',
  '/field/icon.png?size=512&v=5'
];

function isFieldPath(pathname){
  return pathname==='/field'||pathname.startsWith('/field/');
}

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.addAll(FIELD_SHELL)).catch(()=>undefined));
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('ee-field-shell-')&&k!==SHELL_CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(!isFieldPath(url.pathname) && !url.pathname.startsWith('/_next/static/') && !url.pathname.startsWith('/field/icon.png')) return;

  if(url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/field/icon.png')){
    event.respondWith((async()=>{
      const cache=await caches.open(SHELL_CACHE);
      const cached=await cache.match(request);
      if(cached)return cached;
      const fresh=await fetch(request);
      if(fresh.ok)cache.put(request,fresh.clone());
      return fresh;
    })());
    return;
  }

  if(isFieldPath(url.pathname)){
    event.respondWith((async()=>{
      const cache=await caches.open(SHELL_CACHE);
      try{
        const fresh=await fetch(request);
        if(fresh.ok && (request.mode==='navigate' || url.pathname.endsWith('manifest.webmanifest'))){
          cache.put(request,fresh.clone());
        }
        return fresh;
      }catch{
        const cached=await cache.match(request);
        if(cached)return cached;
        if(request.mode==='navigate'){
          const fallback=await cache.match('/field');
          if(fallback)return fallback;
        }
        throw new Error('offline');
      }
    })());
  }
});`;

  return new Response(js, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'Service-Worker-Allowed': '/field/',
    },
  });
}
