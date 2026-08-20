// 最小キャッシュ制御
const BUILD='pulse-202608202136';
const CACHE='pulse-assets';
const ASSETS=["./app.88a0647902.css", "./app.3fbd5c01d8.js"];
const CORE=['./index.html','./manifest.json','./icons/icon-192.png','./icons/icon-512.png'];
const isAsset=p=>/\/app\.[0-9a-f]{10}\.(css|js)$/.test(p);
// ハッシュ付きファイルは既にキャッシュにあれば取り直さない(それ以外の殻は毎回更新する)
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.all(
CORE.map(u=>c.add(u).catch(()=>null)).concat(
ASSETS.map(u=>c.match(u).then(hit=>hit?null:c.add(u).catch(()=>null)))))));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(
caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
.then(()=>caches.open(CACHE)).then(c=>c.keys().then(rs=>Promise.all(rs.filter(r=>{
const p=new URL(r.url).pathname; return isAsset(p)&&!ASSETS.some(a=>p.endsWith(a.slice(1)));
}).map(r=>c.delete(r))))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;
const u=new URL(e.request.url);
if(u.origin!==location.origin)return; // 音声ストリーム等の外部リクエストは触らない(キャッシュしない)
// 内容ハッシュ付きの静的ファイルは中身が変わればファイル名も変わるためキャッシュ優先で返す
if(isAsset(u.pathname)){
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));return res;})));
  return;
}
// ページ遷移/再読込は必ず最新を取りに行く(古い表示の残留を防ぐ)
if(e.request.mode==='navigate'){
  e.respondWith(fetch(e.request,{cache:'reload'}).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));return res;}).catch(()=>caches.match('./index.html')));
  return;
}
// ナビゲーション以外(market.json 等)は、キャッシュに無くても index.html を返さない。
// HTMLがJSONとして返ると JSON.parse が意味不明な例外になり原因を追えなくなるため。
e.respondWith(fetch(e.request).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));return res;})
.catch(()=>caches.match(e.request).then(r=>r||new Response('',{status:504,statusText:'offline'}))));});
