'use strict';
// ═══════════════════════════════════════════════
// SW.JS — Service Worker: cache-first + Background Sync
// ═══════════════════════════════════════════════

const CACHE_NAME = 'rotina-estudos-v3';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './db.js',
];

// ── Instalar: cacheia recursos estáticos ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// ── Ativar: remove caches de versões anteriores ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: cache-first para assets estáticos; pass-through para Supabase ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API Supabase: sempre rede (não cacheia dados dinâmicos)
  if (url.hostname.endsWith('.supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(() => Response.error())
    );
    return;
  }

  // Apenas GET é cacheado
  if (event.request.method !== 'GET') return;

  // Cache-first com atualização em background
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
        }
        return response;
      }).catch(() => cached || Response.error());
      return cached || fetchPromise;
    })
  );
});

// ── Background Sync: avisa clientes para processar a fila offline ──
// Disparado quando a conexão é restaurada e o SW detecta a tag 'sync-presencas'
self.addEventListener('sync', event => {
  if (event.tag === 'sync-presencas') {
    event.waitUntil(
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then(clients => {
          // Envia mensagem para o(s) cliente(s) aberto(s) processarem a fila
          clients.forEach(client => client.postMessage({ type: 'SYNC_QUEUE' }));
        })
    );
  }
});
