import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calcularVersao, carimbarSw } from '../scripts/versao.mjs';

function siteFalso() {
  const dir = mkdtempSync(join(tmpdir(), 'site-'));
  mkdirSync(join(dir, 'js'));
  writeFileSync(join(dir, 'index.html'), '<p>oi</p>');
  writeFileSync(join(dir, 'js', 'app.js'), 'console.log(1)');
  writeFileSync(join(dir, 'sw.js'), "const VERSAO = 'inspecao-dev';\nself.x = 1;");
  return dir;
}

test('versão muda quando qualquer arquivo do site muda', () => {
  const dir = siteFalso();
  const v1 = calcularVersao(dir);
  assert.match(v1, /^[0-9a-f]{12}$/);
  assert.equal(calcularVersao(dir), v1, 'mesmo conteúdo, mesma versão');
  writeFileSync(join(dir, 'js', 'app.js'), 'console.log(2)');
  assert.notEqual(calcularVersao(dir), v1);
});

test('carimbar o sw.js não altera a versão calculada', () => {
  const dir = siteFalso();
  const v = calcularVersao(dir);
  writeFileSync(join(dir, 'sw.js'), carimbarSw("const VERSAO = 'inspecao-dev';\nself.x = 1;", v));
  assert.equal(calcularVersao(dir), v);
});

test('carimbo troca só a linha da versão', () => {
  const sw = "// x\nconst VERSAO = 'inspecao-dev';\nconst ARQUIVOS = [];";
  assert.equal(carimbarSw(sw, 'abc123'), "// x\nconst VERSAO = 'inspecao-abc123';\nconst ARQUIVOS = [];");
  assert.throws(() => carimbarSw('sem versão', 'x'), /não encontrada/);
});
