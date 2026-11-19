// Assinatura AWS Signature V4 para o armazenamento de objetos do Neon (API
// compatível com S3). Implementação própria e pequena para a função não
// depender de pacotes externos.

import { createHash, createHmac } from 'node:crypto';

const sha256 = (dados) => createHash('sha256').update(dados).digest('hex');
const hmac = (chave, texto) => createHmac('sha256', chave).update(texto).digest();

// Codificação de caminho exigida pela SigV4 (RFC 3986, mantendo as barras).
export function codificarCaminho(caminho) {
  return caminho
    .split('/')
    .map((parte) => encodeURIComponent(parte).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()))
    .join('/');
}

function dataAmz(agora) {
  const iso = agora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return { amz: iso, dia: iso.slice(0, 8) };
}

/**
 * Monta os cabeçalhos assinados de uma requisição.
 * @param {object} p
 * @param {string} p.metodo         GET, PUT, DELETE…
 * @param {string} p.url            URL completa (endpoint + /bucket/chave)
 * @param {Record<string,string>} [p.cabecalhos] cabeçalhos extras a assinar
 * @param {Uint8Array|string} [p.corpo]
 * @param {{ chave: string, segredo: string, regiao: string }} p.credencial
 * @param {Date} [p.agora]
 * @param {boolean} [p.corpoSemAssinatura] usa UNSIGNED-PAYLOAD
 */
export function assinar({ metodo, url, cabecalhos = {}, corpo = '', credencial, agora = new Date(), corpoSemAssinatura = false }) {
  const u = new URL(url);
  const { amz, dia } = dataAmz(agora);
  const hashCorpo = corpoSemAssinatura ? 'UNSIGNED-PAYLOAD' : sha256(corpo);
  const todos = { ...cabecalhos, host: u.host, 'x-amz-content-sha256': hashCorpo, 'x-amz-date': amz };
  const nomes = Object.keys(todos).map((n) => n.toLowerCase()).sort();
  const minusculos = Object.fromEntries(Object.entries(todos).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')]));
  const consulta = [...u.searchParams.entries()]
    .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)])
    .sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const canonica = [
    metodo,
    codificarCaminho(decodeURIComponent(u.pathname)),
    consulta,
    nomes.map((n) => `${n}:${minusculos[n]}\n`).join(''),
    nomes.join(';'),
    hashCorpo,
  ].join('\n');
  const escopo = `${dia}/${credencial.regiao}/s3/aws4_request`;
  const texto = ['AWS4-HMAC-SHA256', amz, escopo, sha256(canonica)].join('\n');
  const chave = hmac(hmac(hmac(hmac('AWS4' + credencial.segredo, dia), credencial.regiao), 's3'), 'aws4_request');
  const assinatura = createHmac('sha256', chave).update(texto).digest('hex');
  const saida = { ...cabecalhos, 'x-amz-content-sha256': hashCorpo, 'x-amz-date': amz };
  saida.authorization = `AWS4-HMAC-SHA256 Credential=${credencial.chave}/${escopo}, SignedHeaders=${nomes.join(';')}, Signature=${assinatura}`;
  return saida;
}

export function clienteS3({ endpoint, bucket, credencial, buscar = fetch }) {
  const urlObjeto = (chave) => `${endpoint.replace(/\/$/, '')}/${bucket}/${chave}`;
  return {
    async obter(chave) {
      const url = urlObjeto(chave);
      return buscar(url, { method: 'GET', headers: assinar({ metodo: 'GET', url, credencial }) });
    },
    async gravar(chave, corpo, tipo) {
      const url = urlObjeto(chave);
      const cabecalhos = { 'content-type': tipo };
      return buscar(url, { method: 'PUT', body: corpo, headers: assinar({ metodo: 'PUT', url, cabecalhos, corpo, credencial }) });
    },
    async apagar(chave) {
      const url = urlObjeto(chave);
      return buscar(url, { method: 'DELETE', headers: assinar({ metodo: 'DELETE', url, credencial }) });
    },
  };
}
