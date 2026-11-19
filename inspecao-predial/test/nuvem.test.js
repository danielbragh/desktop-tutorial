import test from 'node:test';
import assert from 'node:assert/strict';
import { criarNuvem } from '../site/js/nuvem.js';
import { criarNeonFalso } from './neon-falso.mjs';

const resposta = (status, corpo = {}) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

function nuvemCom(respostas) {
  const chamadas = [];
  const esperas = [];
  const nuvem = criarNuvem({
    buscar: async (url) => {
      chamadas.push(url);
      const r = respostas.shift();
      if (r instanceof Error) throw r;
      return r;
    },
    esperar: async (ms) => void esperas.push(ms),
  });
  return { nuvem, chamadas, esperas };
}

test('servidor iniciando (503) é tentado de novo até responder', async () => {
  const { nuvem, chamadas, esperas } = nuvemCom([resposta(503), resposta(502), resposta(200, null)]);
  assert.equal(await nuvem.sessao(), null);
  assert.equal(chamadas.length, 3);
  assert.equal(esperas.length, 2);
});

test('desiste depois de umas 15 s e informa o erro', async () => {
  const { nuvem, chamadas, esperas } = nuvemCom(Array.from({ length: 10 }, () => resposta(503, { message: 'ocupado' })));
  await assert.rejects(nuvem.sessao(), { status: 503 });
  assert.equal(chamadas.length, 7);
  assert.ok(esperas.reduce((a, b) => a + b, 0) >= 15000);
});

test('sem internet falha na hora, sem esperar', async () => {
  const { nuvem, esperas } = nuvemCom([new TypeError('Failed to fetch')]);
  await assert.rejects(nuvem.sessao(), { offline: true });
  assert.equal(esperas.length, 0);
});

test('erro definitivo (401, 400) não é repetido', async () => {
  const { nuvem, chamadas } = nuvemCom([resposta(401, { code: 'INVALID_EMAIL_OR_PASSWORD' })]);
  await assert.rejects(nuvem.entrar('a@b.c', 'x'), /E-mail ou senha incorretos/);
  assert.equal(chamadas.length, 1);
});

test('banco religando: login e consulta à equipe passam sem erro', async () => {
  const neon = criarNeonFalso();
  let cookie = '';
  const nuvem = criarNuvem({
    esperar: async () => {},
    buscar: async (url, init = {}) => {
      const req = new Request('http://local' + url, { ...init, headers: { ...(init.headers || {}), ...(cookie ? { cookie } : {}) } });
      const r = await neon.neon(req);
      const sc = r.headers.get('set-cookie');
      if (sc) cookie = sc.split(';')[0];
      return r;
    },
  });
  await nuvem.cadastrar('Daniel', 'd@exemplo.com', 'senha-forte-1');
  neon.frio.chamadas = 3;
  const membro = await nuvem.membro();
  assert.equal(membro.papel, 'admin');
  assert.equal(neon.frio.chamadas, 0);
});
