// Service Worker básico para permitir instalação PWA
// v1-inventario
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Apenas repassa as requisições (necessário para ser instalável)
  event.respondWith(fetch(event.request));
});
