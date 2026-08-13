const CACHE_NAME = 'emval-v41';
// El SDK de EmailJS se precachea junto al shell: si se baja recien cuando hace falta enviar,
// una carga fria sin red deja `emailjs` en undefined y todo se encola en silencio.
const APP_SHELL = [
  './',
  './index.html',
  './vendor/emailjs-browser-4.min.js'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(APP_SHELL);
    }).then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  const url = e.request.url;

  // No interceptar Firebase, Cloudinary, EmailJS ni APIs externas
  if (url.includes('firestore.googleapis.com') ||
      url.includes('firebase') ||
      url.includes('cloudinary.com') ||
      url.includes('emailjs.com') ||
      url.includes('googleapis.com') ||
      url.includes('gstatic.com') ||
      e.request.method !== 'GET') {
    return;
  }

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(function(res) {
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function(c){ c.put(e.request, clone); });
        return res;
      }).catch(function() {
        return caches.match('./index.html');
      })
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(res) {
        if (res && res.ok) {
          var clone = res.clone();
          caches.open(CACHE_NAME).then(function(c){ c.put(e.request, clone); });
        }
        return res;
      }).catch(function() {
        return new Response('', { status: 503 });
      });
    })
  );
});
