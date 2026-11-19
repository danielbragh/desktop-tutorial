// Dois "aparelhos" (cada um com seu armazenamento local e seu cookie de
// sessão) contra o Neon falso: login, aprovação, envio, recebimento,
// conflito, exclusão e fotos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarNeonFalso } from './neon-falso.mjs';
import { criarNuvem } from '../site/js/nuvem.js';
import { criarSincronizador, paraServidor } from '../site/js/sync.js';
import { novoRelatorio, relatorioExemplo } from '../site/js/modelo.js';

const JPEG = (n) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, n, n, n]).buffer;
let contador = 0;

async function aparelho(neon) {
  // Cada import com outra query cria um armazenamento separado (em memória no Node).
  const store = await import(`../site/js/store.js?aparelho=${++contador}`);
  let cookie = '';
  const rede = { online: true };
  const buscar = async (url, init = {}) => {
    if (!rede.online) throw new TypeError('Failed to fetch');
    const req = new Request('http://local' + url, { ...init, headers: { ...(init.headers || {}), ...(cookie ? { cookie } : {}) } });
    const u = new URL(req.url);
    const m = /^\/api\/fotos\/([^/]+)\/([^/]+)$/.exec(u.pathname);
    const r = m ? await neon.fotos(req, { relatorio: m[1], foto: m[2] }) : await neon.neon(req);
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = /sessao=([^;]*)/.exec(sc)[1] ? `sessao=${/sessao=([^;]*)/.exec(sc)[1]}` : '';
    return r;
  };
  const nuvem = criarNuvem({ buscar });
  const mudancas = [];
  const sinc = criarSincronizador({ store, nuvem, aoMudar: (ids) => mudancas.push(...ids) });
  return { store, nuvem, sinc, rede, mudancas };
}

async function salvarComoApp(store, rel) {
  rel.atualizadoEm = Date.now();
  rel.pendente = !rel.exemplo;
  await store.salvarRelatorio(rel);
  await new Promise((r) => setTimeout(r, 2)); // horários de edição distintos
}

async function equipeComDois() {
  const neon = criarNeonFalso();
  const a = await aparelho(neon);
  const b = await aparelho(neon);
  await a.nuvem.cadastrar('Daniel', 'daniel@exemplo.com', 'senha-forte-1');
  const ma = await a.nuvem.membro();
  await b.nuvem.cadastrar('Ana', 'ana@exemplo.com', 'senha-forte-2');
  const mb = await b.nuvem.membro();
  return { neon, a, b, ma, mb };
}

test('primeira conta vira administradora; a segunda espera aprovação', async () => {
  const { a, b, ma, mb } = await equipeComDois();
  assert.equal(ma.papel, 'admin');
  assert.equal(ma.aprovado, true);
  assert.equal(mb.papel, 'tecnico');
  assert.equal(mb.aprovado, false);

  // Não aprovada: não envia nada.
  const rel = novoRelatorio(undefined, '2026-001');
  await salvarComoApp(b.store, rel);
  await b.sinc.sincronizar();
  assert.equal(b.sinc.estado().situacao, 'nao-aprovado');

  // Administradora aprova; agora vai.
  const equipe = await a.nuvem.equipe();
  assert.equal(equipe.length, 2);
  await a.nuvem.atualizarMembro(mb.user_id, null, true);
  await b.sinc.sincronizar();
  assert.equal(b.sinc.estado().situacao, 'ok');
  assert.equal(b.sinc.estado().pendentes, 0);
});

test('técnico não altera a equipe e o último administrador não pode sair', async () => {
  const { a, b, ma, mb } = await equipeComDois();
  await a.nuvem.atualizarMembro(mb.user_id, null, true);
  await assert.rejects(b.nuvem.atualizarMembro(ma.user_id, 'tecnico', null), { status: 403 });
  await assert.rejects(a.nuvem.atualizarMembro(ma.user_id, 'tecnico', null), /pelo menos um administrador/);
  await assert.rejects(a.nuvem.removerMembro(ma.user_id), { status: 403 });
});

test('relatório e fotos feitos num aparelho chegam ao outro', async () => {
  const { neon, a, b, mb } = await equipeComDois();
  await a.nuvem.atualizarMembro(mb.user_id, null, true);

  const rel = novoRelatorio(undefined, '2026-002');
  rel.ident.cliente = 'Condomínio Teste';
  rel.fotos.push({ id: 'foto-0000001', legenda: 'Vista geral', anomaliaId: null, w: 4, h: 3 });
  await a.store.salvarFoto({ id: 'foto-0000001', relatorioId: rel.id, tipo: 'image/jpeg', w: 4, h: 3, dados: JPEG(7), enviada: false });
  await salvarComoApp(a.store, rel);

  await a.sinc.sincronizar();
  assert.equal(a.sinc.estado().situacao, 'ok');
  assert.equal(neon.relatorios.get(rel.id).dados.ident.cliente, 'Condomínio Teste');
  assert.equal(neon.relatorios.get(rel.id).dados.pendente, undefined, 'campos locais não vão para o servidor');
  assert.ok(neon.objetos.has(`${rel.id}/foto-0000001`));
  assert.equal((await a.store.obterFoto('foto-0000001')).enviada, true);
  assert.equal((await a.store.obterRelatorio(rel.id)).pendente, false);

  await b.sinc.sincronizar();
  const noB = await b.store.obterRelatorio(rel.id);
  assert.equal(noB.ident.cliente, 'Condomínio Teste');
  assert.deepEqual(b.mudancas, [rel.id]);
  assert.equal(await b.store.obterFoto('foto-0000001'), undefined, 'fotos baixam quando o relatório é aberto');
  const r = await b.sinc.baixarFotos(noB);
  assert.deepEqual(r, { faltando: 1, baixadas: 1 });
  assert.deepEqual(new Uint8Array((await b.store.obterFoto('foto-0000001')).dados), new Uint8Array(JPEG(7)));
});

test('edições sem internet nos dois aparelhos: vale a mais recente', async () => {
  const { a, b, mb } = await equipeComDois();
  await a.nuvem.atualizarMembro(mb.user_id, null, true);
  const rel = novoRelatorio(undefined, '2026-003');
  await salvarComoApp(a.store, rel);
  await a.sinc.sincronizar();
  await b.sinc.sincronizar();

  a.rede.online = false;
  b.rede.online = false;
  const ra = await a.store.obterRelatorio(rel.id);
  ra.caracterizacao = 'Versão do aparelho A';
  await salvarComoApp(a.store, ra);
  const rb = await b.store.obterRelatorio(rel.id);
  rb.caracterizacao = 'Versão do aparelho B (mais recente)';
  await salvarComoApp(b.store, rb);

  await a.sinc.sincronizar();
  assert.equal(a.sinc.estado().situacao, 'offline');
  assert.equal(a.sinc.estado().pendentes, 1);

  a.rede.online = true;
  b.rede.online = true;
  await a.sinc.sincronizar(); // A envia primeiro
  await b.sinc.sincronizar(); // B é mais recente: substitui
  await a.sinc.sincronizar(); // A recebe a de B
  assert.equal((await a.store.obterRelatorio(rel.id)).caracterizacao, 'Versão do aparelho B (mais recente)');
  assert.equal((await b.store.obterRelatorio(rel.id)).caracterizacao, 'Versão do aparelho B (mais recente)');
  assert.equal((await a.store.obterRelatorio(rel.id)).pendente, false);
});

test('versão antiga enviada depois não sobrescreve a mais nova', async () => {
  const { neon, a, b, mb } = await equipeComDois();
  await a.nuvem.atualizarMembro(mb.user_id, null, true);
  const rel = novoRelatorio(undefined, '2026-004');
  await salvarComoApp(a.store, rel);
  await a.sinc.sincronizar();
  await b.sinc.sincronizar();

  a.rede.online = false;
  const ra = await a.store.obterRelatorio(rel.id);
  ra.caracterizacao = 'Antiga (A, sem internet)';
  await salvarComoApp(a.store, ra);
  const rb = await b.store.obterRelatorio(rel.id);
  rb.caracterizacao = 'Nova (B)';
  await salvarComoApp(b.store, rb);
  await b.sinc.sincronizar();

  a.rede.online = true;
  await a.sinc.sincronizar();
  assert.equal(neon.relatorios.get(rel.id).dados.caracterizacao, 'Nova (B)');
  assert.equal((await a.store.obterRelatorio(rel.id)).caracterizacao, 'Nova (B)');
});

test('exclusão vale para a equipe e apaga as fotos do servidor', async () => {
  const { neon, a, b, mb } = await equipeComDois();
  await a.nuvem.atualizarMembro(mb.user_id, null, true);
  const rel = novoRelatorio(undefined, '2026-005');
  rel.fotos.push({ id: 'foto-0000009', legenda: '', anomaliaId: null });
  await a.store.salvarFoto({ id: 'foto-0000009', relatorioId: rel.id, tipo: 'image/jpeg', w: 4, h: 3, dados: JPEG(9), enviada: false });
  await salvarComoApp(a.store, rel);
  await a.sinc.sincronizar();
  await b.sinc.sincronizar();
  assert.ok(await b.store.obterRelatorio(rel.id));

  // Como o app faz: fila de fotos a apagar + marca de excluído.
  await b.store.salvarConfig('fotosApagar', [{ relatorioId: rel.id, fotoId: 'foto-0000009' }]);
  await b.store.atualizarRelatorio(rel.id, (x) => ({ ...x, excluido: true, pendente: true, atualizadoEm: Date.now() }));
  await b.sinc.sincronizar();
  assert.equal(await b.store.obterRelatorio(rel.id), undefined);
  assert.equal(neon.relatorios.get(rel.id).excluido, true);
  assert.equal(neon.objetos.size, 0);

  await a.sinc.sincronizar();
  assert.equal(await a.store.obterRelatorio(rel.id), undefined);
  assert.equal(await a.store.obterFoto('foto-0000009'), undefined);

  // Editar depois de excluído não traz de volta.
  const velho = { ...rel, caracterizacao: 'tarde demais' };
  await salvarComoApp(a.store, velho);
  await a.sinc.sincronizar();
  assert.equal(await a.store.obterRelatorio(rel.id), undefined);
  assert.equal(neon.relatorios.get(rel.id).excluido, true);
});

test('relatório de exemplo nunca vai para o servidor', async () => {
  const { neon, a } = await equipeComDois();
  const ex = relatorioExemplo(undefined, '2026-000');
  await salvarComoApp(a.store, ex);
  await a.store.salvarFoto({ id: 'foto-exemplo1', relatorioId: ex.id, tipo: 'image/jpeg', w: 4, h: 3, dados: JPEG(1), enviada: null });
  await a.sinc.sincronizar();
  assert.equal(neon.relatorios.size, 0);
  assert.equal(neon.objetos.size, 0);
  assert.equal(a.sinc.estado().pendentes, 0);
});

test('sessão expirada e falta de internet aparecem no estado, sem perder nada', async () => {
  const { a } = await equipeComDois();
  const rel = novoRelatorio(undefined, '2026-006');
  await salvarComoApp(a.store, rel);
  a.rede.online = false;
  await a.sinc.sincronizar();
  assert.equal(a.sinc.estado().situacao, 'offline');
  a.rede.online = true;
  await a.nuvem.sair();
  await a.sinc.sincronizar();
  assert.equal(a.sinc.estado().situacao, 'sem-login');
  assert.equal((await a.store.obterRelatorio(rel.id)).pendente, true);
  await a.nuvem.entrar('daniel@exemplo.com', 'senha-forte-1');
  await a.sinc.sincronizar();
  assert.equal(a.sinc.estado().situacao, 'ok');
  assert.equal((await a.store.obterRelatorio(rel.id)).pendente, false);
});

test('login: erros em português e troca de senha por código', async () => {
  const neon = criarNeonFalso();
  const a = await aparelho(neon);
  await a.nuvem.cadastrar('Daniel', 'd@exemplo.com', 'senha-forte-1');
  await a.nuvem.sair();
  await assert.rejects(a.nuvem.entrar('d@exemplo.com', 'errada'), /E-mail ou senha incorretos/);
  await assert.rejects(a.nuvem.cadastrar('Outro', 'd@exemplo.com', 'senha-forte-9'), /Já existe uma conta/);
  await a.nuvem.enviarCodigoSenha('d@exemplo.com');
  await assert.rejects(a.nuvem.redefinirSenha('d@exemplo.com', '000000', 'nova-senha-123'), /Código incorreto/);
  await a.nuvem.redefinirSenha('d@exemplo.com', '123456', 'nova-senha-123');
  await a.nuvem.entrar('d@exemplo.com', 'nova-senha-123');
  assert.equal((await a.nuvem.sessao()).user.email, 'd@exemplo.com');
});

test('paraServidor remove só os campos locais', () => {
  const rel = { ...novoRelatorio(), pendente: true, excluido: false };
  const d = paraServidor(rel);
  assert.equal('pendente' in d, false);
  assert.equal('excluido' in d, false);
  assert.equal(d.id, rel.id);
});
