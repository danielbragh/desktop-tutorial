// Deixa o app disponível sem internet. Troque VERSAO ao publicar mudanças
// para os aparelhos baixarem os arquivos novos.
const VERSAO = 'inspecao-v4';

const ARQUIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/modelo.js',
  'js/documento.js',
  'js/docx.js',
  'js/pdf.js',
  'js/previa.js',
  'js/store.js',
  'js/fotos.js',
  'js/nuvem.js',
  'js/sync.js',
  'vendor/jszip.min.js',
  'vendor/pdfmake.min.js',
  'fonts/ibm-plex-sans-latin-400-normal.woff2',
  'fonts/ibm-plex-sans-latin-500-normal.woff2',
  'fonts/ibm-plex-sans-latin-600-normal.woff2',
  'fonts/ibm-plex-mono-latin-400-normal.woff2',
  'fonts/ibm-plex-mono-latin-500-normal.woff2',
  'vendor/fonts/LiberationSans-Regular.ttf',
  'vendor/fonts/LiberationSans-Bold.ttf',
  'vendor/fonts/LiberationSans-Italic.ttf',
  'assets/modelo-base.docx',
  'assets/logo.png',
  'assets/favicon.png',
  'assets/marca-db.png',
  'assets/icone-192.png',
  'assets/icone-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(VERSAO)
      .then((cache) => cache.addAll(ARQUIVOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Responde do cache e atualiza em segundo plano quando há rede.
self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Login, banco e fotos sempre vão à rede.
  if (url.pathname.startsWith('/neondb/') || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    caches.open(VERSAO).then(async (cache) => {
      const guardado = await cache.match(request, { ignoreSearch: true });
      const daRede = fetch(request)
        .then((resposta) => {
          if (resposta.ok) cache.put(request, resposta.clone());
          return resposta;
        })
        .catch(() => guardado);
      return guardado || daRede;
    })
  );
});
