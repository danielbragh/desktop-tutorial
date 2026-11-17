import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { relatorioExemplo, novoRelatorio } from '../site/js/modelo.js';
import { montarDocumento, resumoSugerido } from '../site/js/documento.js';
import { gerarDocx, escaparXml, encaixar } from '../site/js/docx.js';
import { definicaoPdf, registrarFontes, FONTES_PDF } from '../site/js/pdf.js';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const raiz = new URL('../site/', import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, raiz));

// JPEG mínimo válido (1×1), suficiente para os geradores.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=',
  'base64'
);

function exemploComFotos() {
  const rel = relatorioExemplo(undefined, '2026-007');
  rel.ident.cliente = 'Condomínio <Teste> & "Cia"';
  rel.conclusao.resumo = resumoSugerido(rel);
  rel.fotos = [
    { id: 'g1', legenda: 'Vista geral', anomaliaId: null },
    { id: 'd1', legenda: '', anomaliaId: rel.anomalias[2].id },
    { id: 'd2', legenda: 'Outro ângulo', anomaliaId: rel.anomalias[2].id },
  ];
  const imagens = new Map(
    rel.fotos.map((f) => [
      f.id,
      { bytes: JPEG, tipo: 'image/jpeg', w: 1600, h: 1200, dataUrl: 'data:image/jpeg;base64,' + JPEG.toString('base64') },
    ])
  );
  return { rel, imagens };
}

test('escaparXml remove caracteres de controle e escapa símbolos', () => {
  assert.equal(escaparXml('a<b>&"c"\u0001\u000b'), 'a&lt;b&gt;&amp;&quot;c&quot;');
});

test('encaixar mantém a proporção dentro da caixa', () => {
  assert.deepEqual(encaixar(1600, 1200, 216, 162), { w: 216, h: 162 });
  const retrato = encaixar(1200, 1600, 216, 162);
  assert.equal(retrato.h, 162);
  assert.equal(Math.round(retrato.w * 10) / 10, 121.5);
});

test('DOCX: corpo novo, partes do modelo preservadas, fotos vinculadas', async () => {
  const { rel, imagens } = exemploComFotos();
  const doc = montarDocumento(rel, { anexo: true });
  const bytes = await gerarDocx(JSZip, ler('assets/modelo-base.docx'), doc, imagens);
  const zip = await JSZip.loadAsync(bytes);
  const original = await JSZip.loadAsync(ler('assets/modelo-base.docx'));

  // Estilos, cabeçalho e numeração são os do modelo, byte a byte.
  for (const parte of ['word/styles.xml', 'word/header1.xml', 'word/numbering.xml', 'word/settings.xml', '[Content_Types].xml']) {
    assert.equal(await zip.file(parte).async('string'), await original.file(parte).async('string'), parte);
  }

  const corpo = await zip.file('word/document.xml').async('string');
  assert.ok(corpo.startsWith('<?xml'));
  assert.ok(corpo.endsWith('</w:sectPr></w:body></w:document>'));
  assert.match(corpo, /Condomínio &lt;Teste&gt; &amp; &quot;Cia&quot;/);
  assert.doesNotMatch(corpo, /MODELO —|\[AAAA-NNN\]|w:highlight|\[Inserir foto\]/);
  assert.match(corpo, /Anexo A — Registro operacional do voo/);
  assert.equal((corpo.match(/<w:drawing>/g) || []).length, 3);
  assert.equal((corpo.match(/<w:tbl>/g) || []).length, 10 + 3); // as 10 tabelas do modelo + o quadro de cada foto
  assert.match(corpo, /<w:pgSz w:w="11906" w:h="16838"/);

  const rels = await zip.file('word/_rels/document.xml.rels').async('string');
  for (const n of [1, 2, 3]) {
    assert.match(rels, new RegExp(`Id="rIdFoto${n}"[^>]*Target="media/foto${n}.jpeg"`));
    assert.ok(zip.file(`word/media/foto${n}.jpeg`), `foto${n}.jpeg`);
    assert.match(corpo, new RegExp(`r:embed="rIdFoto${n}"`));
  }

  const rodape = await zip.file('word/footer1.xml').async('string');
  assert.match(rodape, /Relatório nº 2026-007 · Página/);
  const props = await zip.file('docProps/core.xml').async('string');
  assert.match(props, /<dc:title>Relatório de Inspeção Visual de Cobertura nº 2026-007<\/dc:title>/);
});

test('DOCX: sem fotos e sem anexo continua válido', async () => {
  const doc = montarDocumento(novoRelatorio(undefined, '2026-001'));
  const zip = await JSZip.loadAsync(await gerarDocx(JSZip, ler('assets/modelo-base.docx'), doc));
  const corpo = await zip.file('word/document.xml').async('string');
  assert.doesNotMatch(corpo, /<w:drawing>|Anexo A/);
  assert.match(corpo, /Sem registro fotográfico anexado/);
  assert.equal(zip.file(/^word\/media\/./).length, 1); // só o logo
});

test('DOCX: logo personalizado troca a imagem e ajusta a largura', async () => {
  const doc = montarDocumento(novoRelatorio(undefined, '2026-001'));
  const logo = { bytes: Buffer.from('png-de-teste'), proporcao: 2 };
  const zip = await JSZip.loadAsync(await gerarDocx(JSZip, ler('assets/modelo-base.docx'), doc, new Map(), { logo }));
  const [midia] = zip.file(/^word\/media\/./);
  assert.equal(await midia.async('string'), 'png-de-teste');
  assert.match(await zip.file('word/header1.xml').async('string'), /cx="571500" cy="285750"/);
});

test('PDF: gera arquivo com as fontes embutidas', async () => {
  const pdfMake = require('pdfmake/build/pdfmake.js');
  const fontes = Object.fromEntries(
    [...new Set(Object.values(FONTES_PDF))].map((f) => [f, ler(`vendor/fonts/${f}`).toString('base64')])
  );
  registrarFontes(pdfMake, fontes);
  const { rel, imagens } = exemploComFotos();
  const doc = montarDocumento(rel, { anexo: true });
  const logo = { dataUrl: 'data:image/png;base64,' + ler('assets/logo.png').toString('base64'), proporcao: 900 / 284 };
  const def = definicaoPdf(doc, imagens, logo);
  assert.equal(def.pageSize, 'A4');
  assert.equal(def.footer(3).text, 'Relatório nº 2026-007 · Página 3');
  const pdf = await new Promise((ok) => pdfMake.createPdf(def).getBuffer(ok));
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString(), '%PDF-');
  assert.ok(pdf.length > 40000, `tamanho ${pdf.length}`);
});

test('service worker lista todos os arquivos que o app usa', () => {
  const sw = ler('sw.js').toString();
  const listados = [...sw.matchAll(/'([^']+\.(?:js|css|html|ttf|docx|png|svg|webmanifest))'/g)].map((m) => m[1]);
  for (const arquivo of listados) assert.doesNotThrow(() => ler(arquivo), arquivo);
  for (const modulo of ['app', 'modelo', 'documento', 'docx', 'pdf', 'previa', 'store', 'fotos']) {
    assert.ok(listados.includes(`js/${modulo}.js`), modulo);
  }
});
