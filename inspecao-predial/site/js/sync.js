// Sincronização entre o aparelho (IndexedDB) e o banco (Neon).
//
// O aparelho é a cópia de trabalho: tudo é gravado nele primeiro, e funciona
// sem internet. Quando há conexão, a sincronização:
//   1. envia as fotos novas e apaga do servidor as fotos removidas;
//   2. envia os relatórios alterados (marcados com `pendente`);
//   3. busca o que outros aparelhos mudaram desde a última vez.
//
// Conflito (o mesmo relatório editado em dois aparelhos sem conexão): vale a
// edição mais recente, comparando a hora da última alteração de cada um.
// Um relatório excluído não volta, mesmo que outro aparelho o edite depois.

// Campos que só existem no aparelho e não vão para o servidor.
const CAMPOS_LOCAIS = ['pendente', 'excluido'];
const SOBREPOSICAO_MS = 5000; // relê os últimos segundos para não perder gravações simultâneas
const LOTE = 500; // igual ao limite de relatorios_desde() no banco

export function paraServidor(rel) {
  const dados = { ...rel };
  for (const campo of CAMPOS_LOCAIS) delete dados[campo];
  return dados;
}

export function doServidor(linha) {
  return { ...linha.dados, id: linha.id, atualizadoEm: Date.parse(linha.atualizado_em), pendente: false };
}

function classificar(e) {
  if (e?.offline) return { situacao: 'offline', mensagem: 'Sem conexão. As alterações ficam guardadas no aparelho.' };
  if (e?.status === 401) return { situacao: 'sem-login', mensagem: 'Sessão expirada. Entre de novo para sincronizar.' };
  if (e?.status === 403) return { situacao: 'nao-aprovado', mensagem: 'Sua conta não tem acesso aprovado.' };
  return { situacao: 'erro', mensagem: e?.message || String(e) };
}

/**
 * @param {object} o
 * @param {object} o.store     funções de store.js
 * @param {object} o.nuvem     funções de nuvem.js
 * @param {(ids: Set<string>) => void} [o.aoMudar]  relatórios trocados por versões do servidor
 * @param {(estado: object) => void} [o.aoEstado]   situação para mostrar na tela
 * @param {(dados: ArrayBuffer, tipo: string) => Promise<{w:number,h:number}>} [o.medir]
 */
export function criarSincronizador({ store, nuvem, aoMudar = () => {}, aoEstado = () => {}, medir = null }) {
  const estado = { situacao: 'parado', pendentes: 0, ultima: null, mensagem: '' };
  let rodando = null;
  let deNovo = false;

  const publicar = (mudanca) => {
    Object.assign(estado, mudanca);
    aoEstado({ ...estado });
  };

  async function contarPendentes() {
    const rels = await store.listarRelatorios();
    const fotos = await store.fotosNaoEnviadas();
    const apagar = (await store.obterConfig('fotosApagar')) || [];
    const perfil = (await store.obterConfig('perfilPendente')) ? 1 : 0;
    return rels.filter((r) => r.pendente && !r.exemplo).length + fotos.length + apagar.length + perfil;
  }

  async function apagarLocal(id) {
    await store.excluirRelatorio(id);
  }

  // Grava a versão do servidor, a menos que o aparelho tenha uma edição mais nova.
  async function aplicar(linha, mudou) {
    if (linha.excluido) {
      if (await store.obterRelatorio(linha.id)) {
        await apagarLocal(linha.id);
        mudou.add(linha.id);
      }
      return;
    }
    const doSrv = doServidor(linha);
    let trocou = false;
    await store.atualizarRelatorio(linha.id, (local) => {
      if (local && local.pendente && local.atualizadoEm > doSrv.atualizadoEm) return undefined;
      if (local && !local.pendente && local.atualizadoEm === doSrv.atualizadoEm) return undefined;
      trocou = true;
      return doSrv;
    });
    if (!trocou) return;
    mudou.add(linha.id);
    // Fotos que saíram do relatório nesta versão.
    const manter = new Set((doSrv.fotos || []).map((f) => f.id));
    for (const f of await store.obterFotos(linha.id)) {
      if (!manter.has(f.id)) await store.excluirFoto(f.id);
    }
  }

  async function enviarFotos() {
    for (const f of await store.fotosNaoEnviadas()) {
      try {
        await nuvem.enviarFoto(f.relatorioId, f.id, f.dados);
        await store.atualizarFoto(f.id, (x) => (x ? { ...x, enviada: true } : undefined));
      } catch (e) {
        // Arquivo recusado pelo servidor (tipo ou tamanho): não adianta tentar de novo.
        if (e?.status === 413 || e?.status === 415 || e?.status === 400) {
          await store.atualizarFoto(f.id, (x) => (x ? { ...x, enviada: 'recusada' } : undefined));
          continue;
        }
        throw e;
      }
    }
    let fila = (await store.obterConfig('fotosApagar')) || [];
    while (fila.length) {
      const [item] = fila;
      await nuvem.apagarFoto(item.relatorioId, item.fotoId);
      fila = ((await store.obterConfig('fotosApagar')) || []).filter((x) => x.fotoId !== item.fotoId);
      await store.salvarConfig('fotosApagar', fila);
    }
  }

  async function enviarRelatorios(mudou) {
    const pendentes = (await store.listarRelatorios()).filter((r) => r.pendente && !r.exemplo);
    for (const rel of pendentes) {
      const linha = await nuvem.salvarRelatorio({
        id: rel.id,
        dados: paraServidor(rel),
        atualizadoEm: new Date(rel.atualizadoEm).toISOString(),
        excluido: !!rel.excluido,
      });
      if (!linha) continue;
      if (linha.excluido) {
        await apagarLocal(rel.id);
        if (!rel.excluido) mudou.add(rel.id);
        continue;
      }
      const noServidor = Date.parse(linha.atualizado_em);
      if (noServidor > rel.atualizadoEm) {
        await aplicar(linha, mudou); // outro aparelho tinha uma versão mais nova
        continue;
      }
      // Gravado. Só tira a marca se ninguém editou de novo enquanto enviava.
      await store.atualizarRelatorio(rel.id, (atual) =>
        atual && atual.atualizadoEm === rel.atualizadoEm ? { ...atual, pendente: false } : undefined
      );
    }
  }

  async function receber(mudou) {
    let cursor = await store.obterConfig('cursor');
    let desde = cursor ? new Date(Date.parse(cursor) - SOBREPOSICAO_MS).toISOString() : null;
    for (;;) {
      const linhas = (await nuvem.relatoriosDesde(desde)) || [];
      for (const linha of linhas) {
        await aplicar(linha, mudou);
        if (!cursor || Date.parse(linha.sincronizado_em) > Date.parse(cursor)) cursor = linha.sincronizado_em;
      }
      if (cursor) await store.salvarConfig('cursor', cursor);
      if (linhas.length < LOTE) break;
      desde = cursor;
    }
  }

  async function enviarPerfil() {
    if (!(await store.obterConfig('perfilPendente'))) return;
    await nuvem.salvarPerfil(await store.obterConfig('perfil'));
    await store.salvarConfig('perfilPendente', false);
  }

  async function rodar() {
    const mudou = new Set();
    publicar({ situacao: 'sincronizando', mensagem: '' });
    try {
      await enviarPerfil();
      await enviarFotos();
      await enviarRelatorios(mudou);
      await receber(mudou);
      publicar({ situacao: 'ok', ultima: new Date(), mensagem: '', pendentes: await contarPendentes() });
    } catch (e) {
      const c = classificar(e);
      if (c.situacao === 'erro') console.warn('Sincronização:', e);
      publicar({ ...c, pendentes: await contarPendentes().catch(() => estado.pendentes) });
    }
    if (mudou.size) aoMudar(mudou);
  }

  return {
    estado: () => ({ ...estado }),

    // Uma sincronização por vez; pedidos durante uma rodada geram mais uma no fim.
    sincronizar() {
      if (rodando) {
        deNovo = true;
        return rodando;
      }
      rodando = (async () => {
        do {
          deNovo = false;
          await rodar();
        } while (deNovo && estado.situacao === 'ok');
      })().finally(() => {
        rodando = null;
      });
      return rodando;
    },

    async atualizarContagem() {
      publicar({ pendentes: await contarPendentes() });
    },

    // Baixa as fotos de um relatório que ainda não estão no aparelho.
    async baixarFotos(rel) {
      const faltando = [];
      for (const f of rel.fotos || []) {
        if (!(await store.obterFoto(f.id))) faltando.push(f);
      }
      let baixadas = 0;
      for (const f of faltando) {
        const { tipo, dados } = await nuvem.baixarFoto(rel.id, f.id);
        let { w, h } = f;
        if ((!w || !h) && medir) ({ w, h } = await medir(dados, tipo));
        await store.salvarFoto({ id: f.id, relatorioId: rel.id, tipo, w, h, dados, enviada: true });
        baixadas += 1;
      }
      return { faltando: faltando.length, baixadas };
    },
  };
}
