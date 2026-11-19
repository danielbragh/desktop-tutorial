// Deixa o app disponível sem internet.
// VERSAO é preenchida no deploy por scripts/versao.mjs (resumo dos arquivos
// do site); o servidor local faz o mesmo. Não precisa editar à mão.
const VERSAO = 'inspecao-dev';

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

// Código do app (HTML, JS, CSS): busca na internet primeiro, para uma versão
// publicada valer já na próxima abertura; sem conexão (ou se a rede demorar
// mais que ESPERA_MS), usa a cópia guardada.
// Bibliotecas, fontes e imagens: usa a cópia guardada e atualiza em segundo plano.
const ESPERA_MS = 4000;
const PESADOS = /\/(vendor|fonts|assets)\//;

function daRedeEGuarda(cache, request) {
  return fetch(request).then((resposta) => {
    if (resposta.ok) cache.put(request, resposta.clone());
    return resposta;
  });
}

async function redePrimeiro(cache, request) {
  const rede = daRedeEGuarda(cache, request);
  const tempo = new Promise((ok) => setTimeout(ok, ESPERA_MS));
  try {
    const resposta = await Promise.race([rede, tempo]);
    if (resposta) return resposta;
  } catch {
    /* sem rede: cai para a cópia guardada */
  }
  const guardado =
    (await cache.match(request, { ignoreSearch: true })) ||
    (request.mode === 'navigate' ? await cache.match('index.html') : undefined);
  return guardado || rede;
}

async function guardadoPrimeiro(cache, request) {
  const guardado = await cache.match(request, { ignoreSearch: true });
  const rede = daRedeEGuarda(cache, request).catch(() => guardado);
  return guardado || rede;
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Login, banco e fotos sempre vão à rede.
  if (url.pathname.startsWith('/neondb/') || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    caches.open(VERSAO).then((cache) => (PESADOS.test(url.pathname) ? guardadoPrimeiro(cache, request) : redePrimeiro(cache, request)))
  );
});
