/* 공항콜 기록기 — 서비스 워커 v3
   앱을 휴대폰에 저장해 둔다. 지하차도나 터널에서도 열린다.
   앱을 새로 올릴 때는 아래 CACHE 번호를 하나 올린다.

   v3에서 고친 것 (2026-09-24)
   - 예전에는 받은 화면(html)을 무엇이든 './index.html' 이름으로 저장했다.
     관리 앱(manage.html)을 열면 저장된 운행 앱이 관리 앱으로 덮여서,
     인터넷이 끊긴 곳에서 운행 앱 대신 관리 앱이 뜰 수 있었다.
     → 이제 페이지마다 제 이름으로 저장한다.
   - 404 같은 오류 응답도 저장하던 것을, 정상 응답만 저장하게 했다.
   - 관리 앱 파일도 미리 저장해서 터널에서도 열린다.
   - 번호를 v3로 올려 오염된 v2 저장본은 지운다. */
var CACHE = 'airportcall-v4';

var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './manage.html',
  './manifest-manage.json',
  './manage-icon-192.png',
  './manage-icon-512.png'
];

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      return Promise.all(SHELL.map(function(u){
        return fetch(u, {cache:'no-store'}).then(function(res){
          if (res && res.ok) return c.put(u, res);
        }).catch(function(){});
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

/* 화면을 저장할 이름: 주소 뒤의 ?·# 는 떼고, '/'는 index.html로 본다 */
function pageKey(url){
  var p = url.pathname;
  if (/\/$/.test(p)) p += 'index.html';
  return url.origin + p;
}

/* v4 (2026-10-12) — [공유] → 공항콜 받기
   안드로이드 공유 목록에서 공항콜을 고르면 manifest.json share_target 이 이 주소로 POST 한다.
   - 사진(콜카드 캡처)은 'share-inbox' 저장소에 잠깐 넣고 index.html?share_img=1 로 넘긴다 → 앱이 글자를 읽는다
   - 글자만 공유하면 예전처럼 ?share_text=… 로 넘긴다 */
self.addEventListener('fetch', function(e){
  var req=e.request, url;
  if (req.method !== 'POST') return;
  try { url = new URL(req.url); } catch(err){ return; }
  if (!/[?&]share-target=1/.test(url.search)) return;
  e.respondWith(req.formData().then(function(fd){
    var file=fd.get('share_image'), base=new URL('./index.html', self.location).href, q=new URLSearchParams();
    ['share_title','share_text','share_url'].forEach(function(k){ var v=fd.get(k); if (v) q.set(k, String(v).slice(0,2000)); });
    if (file && file.size){
      return caches.open('share-inbox').then(function(c){
        return c.put('./__shared_image', new Response(file, {headers:{'content-type': file.type || 'image/png'}}));
      }).then(function(){ q.set('share_img','1'); return Response.redirect(base+'?'+q.toString(), 303); });
    }
    return Response.redirect(base+(q.toString() ? '?'+q.toString() : ''), 303);
  }).catch(function(){ return Response.redirect(new URL('./index.html', self.location).href, 303); }));
});

self.addEventListener('fetch', function(e){
  var req = e.request, url, key;
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
    key = pageKey(url);
    e.respondWith(
      fetch(req.url, {cache:'no-store'}).then(function(res){
        if (res && res.ok && url.origin === self.location.origin){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(key, copy); });
        }
        return res;
      }).catch(function(){
        /* 인터넷이 끊겼을 때: 그 페이지의 저장본 → 없으면 운행 앱 */
        return caches.match(key).then(function(r){
          return r || caches.match(self.location.origin + '/index.html');
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
