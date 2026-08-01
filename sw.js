// 最小キャッシュ制御
const CACHE='pulse-202608020006';
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
// ナビゲーション以外(market.json 等)は、キャッシュに無くても index.html を返さない。
// HTMLがJSONとして返ると JSON.parse が意味不明な例外になり原因を追えなくなるため。
e.respondWith(fetch(e.request).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));return res;})
.catch(()=>caches.match(e.request).then(r=>r||new Response('',{status:504,statusText:'offline'}))));});
