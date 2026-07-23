// 最小キャッシュ制御
const CACHE='pulse-202607240506';
const CORE=['./','./index.html','./manifest.json','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;
const u=new URL(e.request.url);
if(u.origin!==location.origin)return; // 音声ストリーム等の外部リクエストは触らない(キャッシュしない)
// ページ遷移/再読込は必ず最新を取りに行く(古い表示の残留を防ぐ)
if(e.request.mode==='navigate'){
  e.respondWith(fetch(e.request,{cache:'reload'}).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));return res;}).catch(()=>caches.match('./index.html')));
  return;
}
e.respondWith(fetch(e.request).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));return res;})
.catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));});
