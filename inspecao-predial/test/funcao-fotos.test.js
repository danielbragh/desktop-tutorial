import test from 'node:test';
import assert from 'node:assert/strict';
import { criarNeonFalso } from './neon-falso.mjs';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const REL = '11111111-1111-4111-8111-111111111111';
const FOTO = '22222222-2222-4222-8222-222222222222';

function pedido(metodo, token, corpo) {
  return new Request(`http://local/api/fotos/${REL}/${FOTO}`, {
    method: metodo,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: corpo,
  });
}

function preparar() {
  const neon = criarNeonFalso();
  const usuario = (email, aprovado) => {
    const u = { id: crypto.randomUUID(), nome: email, email, senha: 'x' };
    neon.usuarios.set(email, u);
    neon.membros.set(u.id, { user_id: u.id, email, papel: 'tecnico', aprovado, criado_em: '' });
    return neon.jwt(u);
  };
  return { neon, aprovado: usuario('a@x.com', true), pendente: usuario('b@x.com', false) };
}

const rota = (neon, req) => neon.fotos(req, { relatorio: REL, foto: FOTO });

test('sem login, token falso ou conta não aprovada não acessam', async () => {
  const { neon, pendente } = preparar();
  assert.equal((await rota(neon, pedido('GET'))).status, 401);
  assert.equal((await rota(neon, pedido('GET', 'a.b.c'))).status, 401);
  assert.equal((await rota(neon, pedido('PUT', pendente, JPEG))).status, 403);
  assert.equal(neon.objetos.size, 0);
});

test('membro aprovado envia, baixa e apaga uma foto', async () => {
  const { neon, aprovado } = preparar();
  assert.equal((await rota(neon, pedido('PUT', aprovado, JPEG))).status, 204);
  assert.deepEqual([...neon.objetos.keys()], [`${REL}/${FOTO}`]);
  const r = await rota(neon, pedido('GET', aprovado));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), JPEG);
  assert.equal((await rota(neon, pedido('DELETE', aprovado))).status, 204);
  assert.equal((await rota(neon, pedido('GET', aprovado))).status, 404);
});

test('recusa arquivo que não é imagem e identificador inválido', async () => {
  const { neon, aprovado } = preparar();
  assert.equal((await rota(neon, pedido('PUT', aprovado, new TextEncoder().encode('<html>')))).status, 415);
  const r = await neon.fotos(pedido('GET', aprovado), { relatorio: '../etc', foto: FOTO });
  assert.equal(r.status, 400);
});

test('aprovação é verificada uma vez por minuto por token', async () => {
  const { neon, aprovado } = preparar();
  await rota(neon, pedido('PUT', aprovado, JPEG));
  await rota(neon, pedido('GET', aprovado));
  await rota(neon, pedido('GET', aprovado));
  assert.equal(neon.chamadas.filter((c) => c === 'eh_membro').length, 1);
});
