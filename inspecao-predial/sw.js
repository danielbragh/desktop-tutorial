// Deixa o app disponível sem internet. Troque VERSAO ao publicar mudanças
// para os aparelhos baixarem os arquivos novos.
const VERSAO = 'inspecao-v1';

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
  'vendor/jszip.min.js',
  'vendor/pdfmake.min.js',
  'vendor/fonts/LiberationSans-Regular.ttf',
  'vendor/fonts/LiberationSans-Bold.ttf',
  'vendor/fonts/LiberationSans-Italic.ttf',
  'assets/modelo-base.docx',
  'assets/logo.png',
  'assets/icone.svg',
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
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
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
