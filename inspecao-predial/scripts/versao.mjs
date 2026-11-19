// Versão do app: um resumo (hash) de todos os arquivos de site/. Muda sempre
// que qualquer arquivo publicado muda.
//
// No deploy (comando de build do netlify.toml) o número é gravado em
// site/sw.js. Como o sw.js muda a cada publicação, os aparelhos com o app
// aberto percebem a versão nova e se atualizam sozinhos (ver site/js/app.js).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const LINHA_VERSAO = /const VERSAO = '[^']*';/;

function arquivos(dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((nome) => {
      const caminho = join(dir, nome);
      return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
    });
}

export function calcularVersao(dirSite) {
  const hash = createHash('sha256');
  for (const caminho of arquivos(dirSite)) {
    let conteudo = readFileSync(caminho);
    if (relative(dirSite, caminho) === 'sw.js') conteudo = Buffer.from(conteudo.toString('utf8').replace(LINHA_VERSAO, ''));
    hash.update(relative(dirSite, caminho)).update('\0').update(conteudo).update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

export function carimbarSw(textoSw, versao) {
  if (!LINHA_VERSAO.test(textoSw)) throw new Error('Linha "const VERSAO = ..." não encontrada em sw.js');
  return textoSw.replace(LINHA_VERSAO, `const VERSAO = 'inspecao-${versao}';`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const site = fileURLToPath(new URL('../site/', import.meta.url));
  const versao = calcularVersao(site);
  const sw = join(site, 'sw.js');
  writeFileSync(sw, carimbarSw(readFileSync(sw, 'utf8'), versao));
  console.log(`Versão do app: ${versao}`);
}
