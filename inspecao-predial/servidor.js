// Servidor local que faz o mesmo papel do Netlify: serve site/, repassa
// /neondb/* ao Neon e atende /api/fotos/* com a mesma função da produção.
//
//   npm start                          usa o Neon de verdade (precisa das
//                                      variáveis NEON_S3_ACCESS_KEY_ID e
//                                      NEON_S3_SECRET_ACCESS_KEY para as fotos)
//
// Os testes usam criarServidor() com um Neon falso (test/neon-falso.mjs).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NEON, configFotos } from './netlify/lib/config.mjs';
import { criarRotaFotos } from './netlify/lib/fotos.mjs';

const RAIZ = fileURLToPath(new URL('./site/', import.meta.url));
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

// Mesmos cabeçalhos de segurança do netlify.toml.
const toml = readFileSync(new URL('./netlify.toml', import.meta.url), 'utf8');
const CABECALHOS = Object.fromEntries(
  [...toml.matchAll(/^\s{4}([A-Za-z-]+) = "(.*)"$/gm)].filter(([, k]) => k !== 'Cache-Control').map(([, k, v]) => [k, v])
);

async function lerCorpo(req) {
  const partes = [];
  for await (const p of req) partes.push(p);
  return Buffer.concat(partes);
}

// Converte a requisição do Node em Request (API fetch) e responde com Response.
async function paraRequest(req, base) {
  const corpo = ['GET', 'HEAD'].includes(req.method) ? undefined : await lerCorpo(req);
  const cabecalhos = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => cabecalhos.append(k, x));
    else if (v !== undefined) cabecalhos.set(k, v);
  }
  return new Request(new URL(req.url, base), { method: req.method, headers: cabecalhos, body: corpo });
}

async function responder(res, resposta, extras = {}) {
  const cabecalhos = {};
  resposta.headers.forEach((v, k) => {
    if (k === 'set-cookie' || k === 'content-encoding' || k === 'content-length' || k === 'transfer-encoding') return;
    cabecalhos[k] = v;
  });
  const cookies = resposta.headers.getSetCookie?.() || [];
  if (cookies.length) cabecalhos['set-cookie'] = cookies;
  res.writeHead(resposta.status, { ...cabecalhos, ...extras });
  res.end(Buffer.from(await resposta.arrayBuffer()));
}

/**
 * @param {object} o
 * @param {(req: Request) => Promise<Response>} o.neon   destino de /neondb/*
 * @param {((req: Request, params) => Promise<Response>) | null} o.fotos
 */
export function criarServidor({ neon, fotos }) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://local');
      if (url.pathname.startsWith('/neondb/')) {
        const pedido = await paraRequest(req, 'http://local');
        return await responder(res, await neon(pedido), { 'cache-control': 'no-store' });
      }
      const m = /^\/api\/fotos\/([^/]+)\/([^/]+)$/.exec(url.pathname);
      if (m) {
        if (!fotos) return await responder(res, Response.json({ erro: 'Fotos desativadas: defina NEON_S3_ACCESS_KEY_ID e NEON_S3_SECRET_ACCESS_KEY.' }, { status: 503 }));
        const pedido = await paraRequest(req, 'http://local');
        return await responder(res, await fotos(pedido, { relatorio: decodeURIComponent(m[1]), foto: decodeURIComponent(m[2]) }));
      }
      const caminho = decodeURIComponent(url.pathname);
      const relativo = normalize(caminho === '/' ? '/index.html' : caminho).replace(/^(\.\.[/\\])+/, '');
      const arquivo = join(RAIZ, relativo);
      if (!arquivo.startsWith(RAIZ)) {
        res.writeHead(403).end('Proibido');
        return;
      }
      const dados = await readFile(arquivo);
      res.writeHead(200, { ...CABECALHOS, 'Content-Type': TIPOS[extname(arquivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(dados);
    } catch (e) {
      if (e?.code === 'ENOENT' || e?.code === 'EISDIR') {
        res.writeHead(404).end('Não encontrado');
        return;
      }
      console.error(e);
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Erro no servidor local: ' + (e?.message || e));
    }
  });
}

// Repasse ao Neon de verdade (equivale aos redirects do netlify.toml).
export function proxyNeon(destinos = { '/neondb/auth/': NEON.authUrl + '/', '/neondb/rest/v1/': NEON.dataApiUrl + '/' }) {
  return async (req) => {
    const url = new URL(req.url);
    const prefixo = Object.keys(destinos).find((p) => url.pathname.startsWith(p));
    if (!prefixo) return new Response('Não encontrado', { status: 404 });
    const alvo = destinos[prefixo] + url.pathname.slice(prefixo.length) + url.search;
    const cabecalhos = new Headers(req.headers);
    cabecalhos.delete('host');
    cabecalhos.delete('accept-encoding');
    return fetch(alvo, {
      method: req.method,
      headers: cabecalhos,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer(),
      redirect: 'manual',
    });
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const porta = Number(process.env.PORT) || 4173;
  let fotos = null;
  try {
    fotos = criarRotaFotos(configFotos((nome) => process.env[nome]));
  } catch (e) {
    console.warn(`Aviso: ${e.message} Sem isso, as fotos não sincronizam.`);
  }
  criarServidor({ neon: proxyNeon(), fotos }).listen(porta, () => console.log(`Inspeção de Cobertura em http://localhost:${porta}`));
}
