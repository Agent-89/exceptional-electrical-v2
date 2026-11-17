export function GET(request: Request) {
  let surface = 'hq';
  try {
    surface = new URL(request.url).searchParams.get('surface') === 'field' ? 'field' : 'hq';
  } catch {
    /* default hq */
  }

  const js = `const VERSION='exceptional-${surface}-v2';
const SHELL_CACHE='ee-field-shell-v2';
const FIELD_SHELL=[
  '/hq/tech',
  '/hq/tech/jobs',
  '/hq/tech/account',
  '/hq/tech/manifest.webmanifest',
  '/hq/icon.png?size=192&v=4',
  '/hq/icon.png?size=512&v=4'
];

function isFieldPath(pathname){
  return pathname==='/hq/tech'||pathname.startsWith('/hq/tech/');
}
function isOfficePath(pathname){
  if(!pathname.startsWith('/hq')) return false;
  if(isFieldPath(pathname)) return false;
  if(pathname.startsWith('/hq/login')||pathname.startsWith('/hq/session')||pathname.startsWith('/hq/sw.js')||pathname.startsWith('/hq/manifest')||pathname.startsWith('/hq/icon')) return false;
  return true;
}

self.addEventListener('install',event=>{
  self.skipWaiting();
  if(${surface === 'field' ? 'true' : 'false'}){
    event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.addAll(FIELD_SHELL)).catch(()=>undefined));
  }
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

  // Never cache private office HQ pages or API-like routes.
  if(isOfficePath(url.pathname))return;

  // Static Next assets: cache-first for Field shell performance.
  if(url.pathname.startsWith('/_next/static/')){
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

  // Field navigations: network-first, fall back to cached shell/page when offline.
  if(isFieldPath(url.pathname)){
    event.respondWith((async()=>{
      const cache=await caches.open(SHELL_CACHE);
      try{
        const fresh=await fetch(request);
        if(fresh.ok && (request.mode==='navigate' || url.pathname.endsWith('manifest.webmanifest') || url.pathname.includes('/hq/icon.png'))){
          cache.put(request,fresh.clone());
        }
        return fresh;
      }catch{
        const cached=await cache.match(request);
        if(cached)return cached;
        if(request.mode==='navigate'){
          const fallback=await cache.match('/hq/tech');
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
      'Service-Worker-Allowed': '/hq/',
    },
  });
}
