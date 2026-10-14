// Service Worker do Inventário Sh (v2-inventario)
// - Arquivos do app (JS/CSS/ícones): guarda em cache e atualiza em segundo plano.
// - Páginas: tenta a rede primeiro; sem internet, abre a última versão guardada.
// - NUNCA guarda dados: banco (Supabase), /api e fotos passam direto pela rede.
const CACHE = 'inv-shell-v2';
const OFFLINE_URL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_URL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // Supabase, fotos etc.: rede direta
  if (url.pathname.startsWith('/api/')) return;             // Functions: rede direta

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(OFFLINE_URL, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error())),
    );
    return;
  }

  const isAsset = url.pathname.startsWith('/assets/') || /\.(png|svg|ico|webmanifest|json|woff2?)$/.test(url.pathname);
  if (!isAsset) return;
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
          return res;
        })
        .catch(() => hit || Response.error());
      return hit || net;
    }),
  );
});
