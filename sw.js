/* 공항콜 기록기 — 서비스 워커
   앱을 휴대폰에 저장해 둔다. 지하차도나 터널에서도 열린다.
   앱을 새로 올릴 때는 아래 CACHE 번호를 하나 올린다. */
var CACHE = 'airportcall-v1';

/* 미리 받아 둘 것. 앱 본체와 아이콘 */
var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function(e){
  /* 새 버전을 받으면 기다리지 않고 바로 넘어간다 */
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      /* 한 개라도 실패하면 전체가 실패하므로 하나씩 담는다 */
      return Promise.all(SHELL.map(function(u){
        return c.add(u).catch(function(){});
      }));
    })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(ks){
      return Promise.all(ks.map(function(k){
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request, url;
  if (req.method !== 'GET') return;
  try { url = new URL(req.url); } catch(err){ return; }

  /* 지도 타일, 경로 API, 날씨는 저장하지 않는다.
     오래된 교통정보를 보여주면 없느니만 못하다 */
  if (/openstreetmap|tile|dapi\.kakao|apis\.openapi\.sk|open-meteo|api\.anthropic/.test(url.href)) return;

  /* 앱 화면은 새 것을 먼저 찾고, 안 되면 저장해 둔 것을 쓴다.
     그래야 앱을 고쳐 올렸을 때 바로 반영되고, 터널에서도 열린다 */
  if (req.mode === 'navigate' || /\.html($|\?)/.test(url.pathname)){
    e.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); });
        return res;
      }).catch(function(){
        return caches.match(req).then(function(r){
          return r || caches.match('./index.html');
        });
      })
    );
    return;
  }

  /* 아이콘, 글꼴 같은 것은 저장해 둔 것을 먼저 쓴다. 빠르고 데이터도 아낀다 */
  e.respondWith(
    caches.match(req).then(function(r){
      if (r) return r;
      return fetch(req).then(function(res){
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); });
        }
        return res;
      }).catch(function(){ return r; });
    })
  );
});
