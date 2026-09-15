/* 공항콜 기록기 — 서비스 워커 v2
   앱을 휴대폰에 저장해 둔다. 지하차도나 터널에서도 열린다.
   앱을 새로 올릴 때는 아래 CACHE 번호를 하나 올린다. */
var CACHE = 'airportcall-v2';

var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(c){
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

/* 앱에서 보낸 신호로 곧장 새 버전으로 넘어간다 */
self.addEventListener('message', function(e){
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function(e){
  var req = e.request, url;
  if (req.method !== 'GET') return;
  try { url = new URL(req.url); } catch(err){ return; }

  /* 지도 타일, 경로 API, 날씨는 저장하지 않는다.
     오래된 교통정보를 보여주면 없느니만 못하다 */
  if (/openstreetmap|tile|dapi\.kakao|apis\.openapi\.sk|open-meteo|api\.anthropic/.test(url.href)) return;

  /* 앱 화면은 늘 새 것을 받는다.
     no-store 를 붙여야 한다. 깃허브 페이지가 10분간 캐시하라고 내려보내서,
     그냥 fetch 하면 브라우저가 들고 있던 옛 파일을 그대로 돌려준다.
     이게 앱을 고쳐 올려도 안 바뀌던 진짜 원인이었다 */
  if (req.mode === 'navigate' || /\.html($|\?)/.test(url.pathname)){
    e.respondWith(
      fetch(req.url, {cache:'no-store'}).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put('./index.html', copy); });
        return res;
      }).catch(function(){
        return caches.match(req).then(function(r){
          return r || caches.match('./index.html');
        });
      })
    );
    return;
  }

  /* 아이콘 같은 것은 저장해 둔 것을 먼저 쓴다. 빠르고 데이터도 아낀다 */
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
