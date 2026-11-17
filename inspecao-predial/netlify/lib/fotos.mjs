// Lógica da rota /api/fotos/:relatorio/:foto, separada do formato de função
// do Netlify para poder ser testada e usada pelo servidor local.
//
// Quem pode acessar: qualquer membro aprovado da equipe. Quem decide é o
// próprio banco: a função repassa o token do usuário para a API de dados do
// Neon e pergunta `eh_membro()`. Um token falso, vencido ou de alguém ainda
// não aprovado recebe 401/403 sem tocar no armazenamento.

import { clienteS3 } from './s3.mjs';

const ID = /^[A-Za-z0-9-]{8,64}$/;
const TAMANHO_MAXIMO = 4 * 1024 * 1024; // abaixo do limite de 6 MB do Netlify
const CACHE_MS = 60 * 1000;

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47];
const comeca = (bytes, assinatura) => assinatura.every((b, i) => bytes[i] === b);

function tipoDaImagem(bytes) {
  if (comeca(bytes, JPEG)) return 'image/jpeg';
  if (comeca(bytes, PNG)) return 'image/png';
  return null;
}

const erro = (status, mensagem) =>
  new Response(JSON.stringify({ erro: mensagem }), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/**
 * @param {object} cfg
 * @param {string} cfg.dataApiUrl  URL da API de dados do Neon (…/rest/v1)
 * @param {{ endpoint, bucket, credencial: { chave, segredo, regiao } }} cfg.armazenamento
 * @param {typeof fetch} [cfg.buscar]
 */
export function criarRotaFotos(cfg) {
  const buscar = cfg.buscar || fetch;
  const s3 = clienteS3({ ...cfg.armazenamento, buscar });
  const aprovados = new Map(); // token -> validade

  async function ehMembro(token) {
    const agora = Date.now();
    const ate = aprovados.get(token);
    if (ate && ate > agora) return true;
    const r = await buscar(`${cfg.dataApiUrl}/rpc/eh_membro`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
      body: '{}',
    });
    if (r.status === 401) return null;
    if (!r.ok) throw new Error(`API de dados respondeu ${r.status}`);
    const ok = (await r.json()) === true;
    if (ok) {
      if (aprovados.size > 500) aprovados.clear();
      aprovados.set(token, agora + CACHE_MS);
    }
    return ok;
  }

  return async function rota(req, params) {
    const { relatorio, foto } = params;
    if (!ID.test(relatorio || '') || !ID.test(foto || '')) return erro(400, 'Identificador inválido.');
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || '')?.[1];
    if (!token) return erro(401, 'Faça login para acessar as fotos.');

    let membro;
    try {
      membro = await ehMembro(token);
    } catch (e) {
      console.error(e);
      return erro(502, 'Não foi possível verificar o acesso agora.');
    }
    if (membro === null) return erro(401, 'Sessão expirada. Entre de novo.');
    if (!membro) return erro(403, 'Sua conta ainda não foi aprovada.');

    const chave = `${relatorio}/${foto}`;
    if (req.method === 'GET') {
      const r = await s3.obter(chave);
      if (r.status === 404) return erro(404, 'Foto não encontrada.');
      if (!r.ok) return erro(502, `Armazenamento respondeu ${r.status}.`);
      return new Response(r.body, {
        status: 200,
        headers: {
          'content-type': r.headers.get('content-type') || 'image/jpeg',
          'cache-control': 'private, max-age=31536000, immutable',
        },
      });
    }
    if (req.method === 'PUT') {
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (!bytes.length) return erro(400, 'Arquivo vazio.');
      if (bytes.length > TAMANHO_MAXIMO) return erro(413, 'Foto maior que 4 MB.');
      const tipo = tipoDaImagem(bytes);
      if (!tipo) return erro(415, 'Só são aceitas fotos JPEG ou PNG.');
      const r = await s3.gravar(chave, bytes, tipo);
      if (!r.ok) return erro(502, `Armazenamento respondeu ${r.status}.`);
      return new Response(null, { status: 204 });
    }
    if (req.method === 'DELETE') {
      const r = await s3.apagar(chave);
      if (!r.ok && r.status !== 404) return erro(502, `Armazenamento respondeu ${r.status}.`);
      return new Response(null, { status: 204 });
    }
    return erro(405, 'Método não permitido.');
  };
}
