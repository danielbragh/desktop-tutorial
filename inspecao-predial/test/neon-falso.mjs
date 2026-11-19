// Neon falso para testes: login (rotas do Better Auth), API de dados (as
// funções RPC de banco/esquema.sql, com as mesmas regras) e armazenamento de
// fotos. Tudo em memória.

import { createHmac, randomUUID } from 'node:crypto';
import { criarRotaFotos } from '../netlify/lib/fotos.mjs';

const SEGREDO = 'segredo-de-teste';
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

export function criarNeonFalso({ minutosToken = 15 } = {}) {
  const usuarios = new Map(); // email -> { id, nome, email, senha }
  const sessoes = new Map(); // token opaco -> userId
  const codigos = new Map(); // email -> otp
  const membros = new Map(); // userId -> linha
  const relatorios = new Map(); // id -> linha
  const perfis = new Map();
  const objetos = new Map(); // chave -> { tipo, bytes }
  let relogio = Date.parse('2026-11-17T12:00:00Z');
  const agoraIso = () => new Date((relogio += 1)).toISOString();
  const chamadas = [];

  function jwt(u) {
    const corpo = b64({ sub: u.id, id: u.id, email: u.email, name: u.nome, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + minutosToken * 60 });
    const cab = b64({ alg: 'HS256', typ: 'JWT' });
    const sig = createHmac('sha256', SEGREDO).update(`${cab}.${corpo}`).digest('base64url');
    return `${cab}.${corpo}.${sig}`;
  }

  function lerJwt(token) {
    const [cab, corpo, sig] = (token || '').split('.');
    if (!sig || createHmac('sha256', SEGREDO).update(`${cab}.${corpo}`).digest('base64url') !== sig) return null;
    const p = JSON.parse(Buffer.from(corpo, 'base64url').toString());
    return p.exp * 1000 > Date.now() ? p : null;
  }

  const json = (dados, status = 200, cabecalhos = {}) =>
    new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json', ...cabecalhos } });

  const cookieSessao = (req) => /(?:^|;\s*)sessao=([^;]+)/.exec(req.headers.get('cookie') || '')?.[1];

  // ---------- login ----------
  async function auth(req, caminho) {
    const corpo = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const criarSessao = (u) => {
      const t = randomUUID();
      sessoes.set(t, u.id);
      return json({ user: { id: u.id, email: u.email, name: u.nome }, token: t }, 200, {
        'set-cookie': `sessao=${t}; Path=/neondb/auth; HttpOnly; SameSite=Strict`,
      });
    };
    const usuarioDaSessao = () => {
      const id = sessoes.get(cookieSessao(req));
      return [...usuarios.values()].find((u) => u.id === id);
    };
    switch (caminho) {
      case 'sign-up/email': {
        if (usuarios.has(corpo.email)) return json({ code: 'USER_ALREADY_EXISTS', message: 'User already exists' }, 422);
        if ((corpo.password || '').length < 8) return json({ code: 'PASSWORD_TOO_SHORT', message: 'Password too short' }, 400);
        const u = { id: randomUUID(), nome: corpo.name, email: corpo.email, senha: corpo.password };
        usuarios.set(u.email, u);
        return criarSessao(u);
      }
      case 'sign-in/email': {
        const u = usuarios.get(corpo.email);
        if (!u || u.senha !== corpo.password) return json({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }, 401);
        return criarSessao(u);
      }
      case 'sign-out':
        sessoes.delete(cookieSessao(req));
        return json({ success: true }, 200, { 'set-cookie': 'sessao=; Path=/neondb/auth; Max-Age=0' });
      case 'get-session': {
        const u = usuarioDaSessao();
        if (!u) return json(null);
        return json({ user: { id: u.id, email: u.email, name: u.nome }, session: { token: cookieSessao(req), userId: u.id } }, 200, { 'set-auth-jwt': jwt(u) });
      }
      case 'token': {
        const u = usuarioDaSessao();
        return u ? json({ token: jwt(u) }) : json({ code: 'UNAUTHORIZED', message: 'Unauthorized' }, 401);
      }
      case 'email-otp/send-verification-otp':
        codigos.set(corpo.email, '123456');
        return json({ success: true });
      case 'email-otp/reset-password': {
        if (codigos.get(corpo.email) !== corpo.otp) return json({ code: 'INVALID_OTP', message: 'Invalid OTP' }, 400);
        usuarios.get(corpo.email).senha = corpo.password;
        codigos.delete(corpo.email);
        return json({ success: true });
      }
      default:
        return json({ message: 'Not found' }, 404);
    }
  }

  // ---------- banco (mesma lógica das funções SQL) ----------
  const ehMembro = (uid) => !!membros.get(uid)?.aprovado;
  const ehAdmin = (uid) => ehMembro(uid) && membros.get(uid).papel === 'admin';
  const negado = (msg) => json({ code: '42501', message: msg }, 403);
  const adminsAprovados = () => [...membros.values()].filter((m) => m.papel === 'admin' && m.aprovado);

  function rpc(nome, args, claims) {
    const uid = claims.sub;
    switch (nome) {
      case 'eh_membro':
        return json(ehMembro(uid));
      case 'eh_admin':
        return json(ehAdmin(uid));
      case 'entrar': {
        let m = membros.get(uid);
        if (!m) {
          const primeiro = !adminsAprovados().length;
          m = { user_id: uid, email: claims.email, nome: claims.name || '', papel: primeiro ? 'admin' : 'tecnico', aprovado: primeiro, criado_em: agoraIso() };
          membros.set(uid, m);
        }
        return json(m);
      }
      case 'salvar_relatorio': {
        if (!ehMembro(uid)) return negado('Acesso não aprovado');
        const atual = relatorios.get(args.p_id);
        if (!atual || (Date.parse(atual.atualizado_em) <= Date.parse(args.p_atualizado_em) && !atual.excluido)) {
          const linha = {
            id: args.p_id,
            dados: args.p_dados,
            atualizado_em: new Date(args.p_atualizado_em).toISOString(),
            excluido: !!args.p_excluido,
            criado_por: atual?.criado_por || uid,
            atualizado_por: uid,
            sincronizado_em: agoraIso(),
          };
          relatorios.set(args.p_id, linha);
          return json(linha);
        }
        return json(atual);
      }
      case 'relatorios_desde': {
        if (!ehMembro(uid)) return json([]);
        const desde = args.p_desde === '-infinity' ? -Infinity : Date.parse(args.p_desde);
        return json(
          [...relatorios.values()]
            .filter((r) => Date.parse(r.sincronizado_em) > desde)
            .sort((a, b) => Date.parse(a.sincronizado_em) - Date.parse(b.sincronizado_em))
            .slice(0, 500)
        );
      }
      case 'equipe':
        if (!ehMembro(uid)) return json([...membros.values()].filter((m) => m.user_id === uid));
        return json([...membros.values()].sort((a, b) => a.aprovado - b.aprovado || a.criado_em.localeCompare(b.criado_em)));
      case 'atualizar_membro': {
        if (!ehAdmin(uid)) return negado('Só administradores alteram a equipe');
        const m = membros.get(args.p_user_id);
        const novo = { ...m, papel: args.p_papel ?? m.papel, aprovado: args.p_aprovado ?? m.aprovado };
        if (m.papel === 'admin' && m.aprovado && !(novo.papel === 'admin' && novo.aprovado) && adminsAprovados().length === 1)
          return json({ code: 'P0001', message: 'A equipe precisa de pelo menos um administrador aprovado' }, 400);
        membros.set(m.user_id, novo);
        return json(novo);
      }
      case 'remover_membro':
        if (!ehAdmin(uid)) return negado('Só administradores alteram a equipe');
        if (args.p_user_id === uid) return negado('Você não pode remover a própria conta');
        membros.delete(args.p_user_id);
        return new Response(null, { status: 204 });
      case 'meu_perfil':
        return json(perfis.get(uid) || {});
      case 'salvar_perfil':
        perfis.set(uid, args.p_dados);
        return new Response(null, { status: 204 });
      default:
        return json({ code: 'PGRST202', message: `Function ${nome} not found` }, 404);
    }
  }

  // Simula o banco religando: as próximas `frio.chamadas` respostas da API de
  // dados são 503 "carregando o esquema", como o PostgREST faz.
  const frio = { chamadas: 0 };

  async function dados(req, caminho) {
    if (frio.chamadas > 0) {
      frio.chamadas -= 1;
      return json({ code: 'PGRST002', message: 'Could not query the database for the schema cache. Retrying.' }, 503);
    }
    const claims = lerJwt(/^Bearer (.+)$/.exec(req.headers.get('authorization') || '')?.[1]);
    if (!claims) return json({ code: 'PGRST301', message: 'JWT invalid' }, 401);
    const m = /^rpc\/([a-z_]+)$/.exec(caminho);
    if (!m) return json({ message: 'Not found' }, 404);
    chamadas.push(m[1]);
    return rpc(m[1], await req.json().catch(() => ({})), claims);
  }

  async function neon(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/neondb/auth/')) return auth(req, url.pathname.slice('/neondb/auth/'.length));
    if (url.pathname.startsWith('/neondb/rest/v1/')) return dados(req, url.pathname.slice('/neondb/rest/v1/'.length));
    return json({ message: 'Not found' }, 404);
  }

  // Fetch usado pela função das fotos: API de dados e S3 falsos.
  async function buscarInterno(url, init = {}) {
    const u = new URL(url);
    if (u.host === 'neon-falso') return neon(new Request(url, init));
    if (u.host === 's3-falso') {
      if (!/AWS4-HMAC-SHA256 Credential=chave-teste\//.test(init.headers?.authorization || '')) return new Response('', { status: 403 });
      const chave = decodeURIComponent(u.pathname.replace(/^\/fotos\//, ''));
      if (init.method === 'PUT') {
        objetos.set(chave, { tipo: init.headers['content-type'], bytes: Buffer.from(init.body) });
        return new Response(null, { status: 200 });
      }
      if (init.method === 'DELETE') {
        objetos.delete(chave);
        return new Response(null, { status: 204 });
      }
      const o = objetos.get(chave);
      return o ? new Response(o.bytes, { headers: { 'content-type': o.tipo } }) : new Response('', { status: 404 });
    }
    throw new Error(`Rede bloqueada nos testes: ${url}`);
  }

  const fotos = criarRotaFotos({
    dataApiUrl: 'http://neon-falso/neondb/rest/v1',
    armazenamento: { endpoint: 'http://s3-falso', bucket: 'fotos', credencial: { chave: 'chave-teste', segredo: 'segredo', regiao: 'us-east-1' } },
    buscar: buscarInterno,
  });

  return { neon, fotos, usuarios, membros, relatorios, perfis, objetos, chamadas, jwt, codigos, frio };
}
