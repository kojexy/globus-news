const CACHE='moon-image-papers-v7';
const ASSETS=['./','./index.html','./style.css','./app.js','./core.mjs','./editorial.mjs','./typeset.mjs','./radio.mjs','./runtime.js','./assets/moon-icon.png','./assets/newsprint.webp','./manifest.webmanifest','./assets/fonts/PTSerif-Regular.ttf','./assets/fonts/PTSerif-Bold.ttf','./assets/fonts/PTSerif-Italic.ttf','./assets/fonts/Oswald.ttf','./assets/papers/fresh.webp','./assets/papers/broadsheet.webp','./assets/papers/coffee.webp','./assets/papers/archive.webp','./assets/papers/northern.webp','./assets/papers/letterpress.webp','./assets/papers/sunday.webp','./assets/papers/telegram.webp','./assets/papers/moon.webp','./assets/papers/evening.webp'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  // News is network-first with the last successful edition as an offline fallback.
  if(url.origin!==self.location.origin)return;
  if(url.pathname.endsWith('/data/news.json')){
    event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));}return response;}).catch(()=>caches.match(event.request).then(r=>{if(!r)return Response.error();const headers=new Headers(r.headers);headers.set('X-Globus-Offline','1');return new Response(r.body,{status:200,headers});})));return;
  }
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));}return response;}).catch(()=>caches.match(event.request).then(r=>r||caches.match('./index.html'))));
});
