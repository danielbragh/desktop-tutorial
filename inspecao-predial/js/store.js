// Armazenamento local (IndexedDB). Os relatórios e as fotos ficam só neste
// aparelho; se o navegador bloquear o IndexedDB, o app continua funcionando
// em memória até a página ser fechada.

const NOME = 'inspecao-predial';
const VERSAO = 1;

let conexao = null;
let memoria = null; // { relatorios: Map, fotos: Map, config: Map }

function usarMemoria() {
  memoria = memoria || { relatorios: new Map(), fotos: new Map(), config: new Map() };
  return null;
}

function abrir() {
  if (memoria) return Promise.resolve(null);
  if (conexao) return conexao;
  conexao = new Promise((ok) => {
    let pedido;
    try {
      pedido = indexedDB.open(NOME, VERSAO);
    } catch {
      ok(usarMemoria());
      return;
    }
    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      if (!db.objectStoreNames.contains('relatorios')) db.createObjectStore('relatorios', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('fotos')) {
        db.createObjectStore('fotos', { keyPath: 'id' }).createIndex('relatorioId', 'relatorioId');
      }
      if (!db.objectStoreNames.contains('config')) db.createObjectStore('config');
    };
    pedido.onsuccess = () => ok(pedido.result);
    pedido.onerror = () => ok(usarMemoria());
    pedido.onblocked = () => ok(usarMemoria());
  });
  return conexao;
}

export function persistente() {
  return !memoria;
}

function pedir(req) {
  return new Promise((ok, erro) => {
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error);
  });
}

async function operar(loja, modo, fn) {
  const db = await abrir();
  if (!db) return fn(null, memoria[loja]);
  const tx = db.transaction(loja, modo);
  const fim = new Promise((ok, erro) => {
    tx.oncomplete = ok;
    tx.onerror = () => erro(tx.error);
    tx.onabort = () => erro(tx.error || new Error('Gravação interrompida'));
  });
  const resultado = await fn(tx.objectStore(loja), null);
  await fim;
  return resultado;
}

const copia = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

export async function listarRelatorios() {
  const todos = await operar('relatorios', 'readonly', (s, m) => (s ? pedir(s.getAll()) : [...m.values()].map(copia)));
  return todos.sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));
}

export function obterRelatorio(id) {
  return operar('relatorios', 'readonly', (s, m) => (s ? pedir(s.get(id)) : copia(m.get(id))));
}

export function salvarRelatorio(rel) {
  return operar('relatorios', 'readwrite', (s, m) => (s ? pedir(s.put(rel)) : void m.set(rel.id, copia(rel))));
}

export async function excluirRelatorio(id) {
  const fotos = await obterFotos(id);
  await operar('fotos', 'readwrite', (s, m) => {
    for (const f of fotos) s ? s.delete(f.id) : m.delete(f.id);
  });
  await operar('relatorios', 'readwrite', (s, m) => (s ? pedir(s.delete(id)) : void m.delete(id)));
}

// foto: { id, relatorioId, tipo, w, h, dados: ArrayBuffer }
export function salvarFoto(foto) {
  return operar('fotos', 'readwrite', (s, m) => (s ? pedir(s.put(foto)) : void m.set(foto.id, foto)));
}

export function obterFotos(relatorioId) {
  return operar('fotos', 'readonly', (s, m) =>
    s ? pedir(s.index('relatorioId').getAll(relatorioId)) : [...m.values()].filter((f) => f.relatorioId === relatorioId)
  );
}

export function excluirFoto(id) {
  return operar('fotos', 'readwrite', (s, m) => (s ? pedir(s.delete(id)) : void m.delete(id)));
}

export function obterConfig(chave) {
  return operar('config', 'readonly', (s, m) => (s ? pedir(s.get(chave)) : copia(m.get(chave))));
}

export function salvarConfig(chave, valor) {
  return operar('config', 'readwrite', (s, m) => (s ? pedir(s.put(valor, chave)) : void m.set(chave, copia(valor))));
}
