// Comunicação com o servidor: login (Neon Auth), banco (API de dados do
// Neon) e fotos (função /api/fotos). Tudo passa pelo mesmo endereço do app,
// então o cookie de sessão é do próprio site.

export const CAMINHOS = {
  auth: '/neondb/auth',
  dados: '/neondb/rest/v1',
  fotos: '/api/fotos',
};

export class ErroNuvem extends Error {
  constructor(mensagem, { status = 0, codigo = '', offline = false } = {}) {
    super(mensagem);
    this.name = 'ErroNuvem';
    this.status = status;
    this.codigo = codigo;
    this.offline = offline;
  }
}

const MENSAGENS = {
  INVALID_EMAIL_OR_PASSWORD: 'E-mail ou senha incorretos.',
  INVALID_EMAIL: 'E-mail inválido.',
  INVALID_PASSWORD: 'Senha inválida.',
  USER_ALREADY_EXISTS: 'Já existe uma conta com este e-mail. Use "Entrar".',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Já existe uma conta com este e-mail. Use "Entrar".',
  PASSWORD_TOO_SHORT: 'A senha precisa ter pelo menos 8 caracteres.',
  PASSWORD_TOO_LONG: 'A senha é longa demais.',
  INVALID_OTP: 'Código incorreto.',
  OTP_EXPIRED: 'O código expirou. Peça outro.',
  TOO_MANY_ATTEMPTS: 'Muitas tentativas. Peça um novo código.',
  USER_NOT_FOUND: 'Não há conta com este e-mail.',
  EMAIL_NOT_VERIFIED: 'Confirme o e-mail antes de entrar.',
};

function decodificarJwt(jwt) {
  try {
    const parte = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(parte))));
  } catch {
    return null;
  }
}

// Respostas de "servidor ocupado ou iniciando": valem uma nova tentativa.
// O banco do plano gratuito desliga após alguns minutos parado e, ao religar,
// a API de dados responde 503 por alguns segundos enquanto carrega o esquema.
const STATUS_PASSAGEIRO = new Set([502, 503, 504]);
const ESPERAS_MS = [400, 800, 1500, 2500, 4000, 6000]; // ~15 s no total
const LIMITE_MS = 20000; // tempo máximo de uma requisição

export function criarNuvem({ buscar = (...a) => fetch(...a), agora = () => Date.now(), esperar = (ms) => new Promise((ok) => setTimeout(ok, ms)), aoEsperar = () => {} } = {}) {
  let jwt = null;
  let jwtExpira = 0;

  async function umaVez(url, init) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const relogio = ctrl ? setTimeout(() => ctrl.abort(), LIMITE_MS) : null;
    try {
      return await buscar(url, ctrl ? { ...init, signal: ctrl.signal } : init);
    } catch (e) {
      if (e?.name === 'AbortError') return null; // demorou demais: conta como passageiro
      throw new ErroNuvem('Sem conexão com o servidor.', { offline: true });
    } finally {
      if (relogio) clearTimeout(relogio);
    }
  }

  async function requisitar(url, init) {
    for (let tentativa = 0; ; tentativa += 1) {
      const r = await umaVez(url, init);
      if (r && !STATUS_PASSAGEIRO.has(r.status)) return r;
      if (tentativa >= ESPERAS_MS.length) {
        if (r) return r;
        throw new ErroNuvem('O servidor demorou demais para responder.', { status: 504 });
      }
      aoEsperar(tentativa + 1);
      await esperar(ESPERAS_MS[tentativa]);
    }
  }

  function guardarJwt(valor) {
    const p = valor ? decodificarJwt(valor) : null;
    jwt = p ? valor : null;
    jwtExpira = p?.exp ? p.exp * 1000 : 0;
  }

  async function auth(caminho, { metodo = 'GET', corpo } = {}) {
    const r = await requisitar(CAMINHOS.auth + caminho, {
      method: metodo,
      credentials: 'same-origin',
      headers: corpo ? { 'content-type': 'application/json' } : {},
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    let dados = null;
    try {
      dados = await r.json();
    } catch {
      dados = null;
    }
    const novoJwt = r.headers.get('set-auth-jwt');
    if (novoJwt) guardarJwt(novoJwt);
    if (!r.ok) {
      const codigo = dados?.code || '';
      const msg =
        MENSAGENS[codigo] ||
        (r.status === 429 ? 'Muitas tentativas. Aguarde um minuto.' : dados?.message || `O servidor de login respondeu ${r.status}.`);
      throw new ErroNuvem(msg, { status: r.status, codigo });
    }
    return dados;
  }

  // Sessão atual ({ user, session }) ou null.
  async function sessao() {
    const dados = await auth('/get-session');
    if (!dados?.user) {
      guardarJwt(null);
      return null;
    }
    if (dados.session?.token && dados.session.token.split('.').length === 3) guardarJwt(dados.session.token);
    return dados;
  }

  async function token() {
    if (jwt && jwtExpira - agora() > 60 * 1000) return jwt;
    const s = await sessao();
    if (!s) throw new ErroNuvem('Sessão expirada. Entre de novo.', { status: 401, codigo: 'SEM_SESSAO' });
    if (jwt && jwtExpira - agora() > 0) return jwt;
    const t = await auth('/token');
    if (!t?.token) throw new ErroNuvem('Não foi possível obter o token de acesso.', { status: 401, codigo: 'SEM_TOKEN' });
    guardarJwt(t.token);
    return jwt;
  }

  async function comToken(fazer) {
    let t = await token();
    let r = await fazer(t);
    if (r.status === 401) {
      guardarJwt(null);
      t = await token();
      r = await fazer(t);
    }
    return r;
  }

  async function rpc(nome, args = {}) {
    const r = await comToken((t) =>
      requisitar(`${CAMINHOS.dados}/rpc/${nome}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(args),
      })
    );
    const texto = await r.text();
    let dados = null;
    try {
      dados = texto ? JSON.parse(texto) : null;
    } catch {
      dados = texto;
    }
    if (!r.ok) {
      const msg = (dados && (dados.message || dados.erro)) || `O banco de dados respondeu ${r.status}.`;
      throw new ErroNuvem(msg, { status: r.status, codigo: dados?.code || '' });
    }
    return dados;
  }

  async function fotos(metodo, relatorioId, fotoId, corpo) {
    const url = `${CAMINHOS.fotos}/${encodeURIComponent(relatorioId)}/${encodeURIComponent(fotoId)}`;
    const r = await comToken((t) =>
      requisitar(url, {
        method: metodo,
        headers: { authorization: `Bearer ${t}`, ...(corpo ? { 'content-type': 'application/octet-stream' } : {}) },
        body: corpo,
      })
    );
    if (!r.ok && !(metodo === 'DELETE' && r.status === 404)) {
      let msg = `O servidor de fotos respondeu ${r.status}.`;
      try {
        msg = (await r.json()).erro || msg;
      } catch {
        /* sem corpo */
      }
      throw new ErroNuvem(msg, { status: r.status });
    }
    return r;
  }

  return {
    sessao,
    token,
    rpc,
    async entrar(email, senha) {
      return auth('/sign-in/email', { metodo: 'POST', corpo: { email, password: senha, rememberMe: true } });
    },
    async cadastrar(nome, email, senha) {
      return auth('/sign-up/email', { metodo: 'POST', corpo: { name: nome, email, password: senha } });
    },
    async sair() {
      guardarJwt(null);
      try {
        await auth('/sign-out', { metodo: 'POST', corpo: {} });
      } catch (e) {
        if (!e.offline) throw e;
      }
    },
    async enviarCodigoSenha(email) {
      return auth('/email-otp/send-verification-otp', { metodo: 'POST', corpo: { email, type: 'forget-password' } });
    },
    async redefinirSenha(email, codigo, senha) {
      return auth('/email-otp/reset-password', { metodo: 'POST', corpo: { email, otp: codigo, password: senha } });
    },

    // Banco
    membro: () => rpc('entrar'),
    salvarRelatorio: (r) =>
      rpc('salvar_relatorio', { p_id: r.id, p_dados: r.dados, p_atualizado_em: r.atualizadoEm, p_excluido: !!r.excluido }),
    relatoriosDesde: (cursor) => rpc('relatorios_desde', { p_desde: cursor || '-infinity' }),
    equipe: () => rpc('equipe'),
    atualizarMembro: (userId, papel, aprovado) => rpc('atualizar_membro', { p_user_id: userId, p_papel: papel ?? null, p_aprovado: aprovado ?? null }),
    removerMembro: (userId) => rpc('remover_membro', { p_user_id: userId }),
    meuPerfil: () => rpc('meu_perfil'),
    salvarPerfil: (dados) => rpc('salvar_perfil', { p_dados: dados }),

    // Fotos
    enviarFoto: (relatorioId, fotoId, bytes) => fotos('PUT', relatorioId, fotoId, bytes),
    async baixarFoto(relatorioId, fotoId) {
      const r = await fotos('GET', relatorioId, fotoId);
      return { tipo: r.headers.get('content-type') || 'image/jpeg', dados: await r.arrayBuffer() };
    },
    apagarFoto: (relatorioId, fotoId) => fotos('DELETE', relatorioId, fotoId),
  };
}
