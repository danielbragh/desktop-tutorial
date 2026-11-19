// Gera o .docx a partir dos blocos de documento.js.
//
// O arquivo assets/modelo-base.docx (o modelo original) é usado como base:
// estilos, cabeçalho com o logo, rodapé, numeração e margens vêm dele sem
// alteração. Só o corpo do documento é reescrito, com a mesma formatação
// que o modelo usa em cada tipo de elemento.

const FONTE = '<w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/>';
const BORDA_CELULA =
  '<w:tcBorders><w:top w:val="single" w:color="D5DAE1" w:sz="4"/><w:left w:val="single" w:color="D5DAE1" w:sz="4"/>' +
  '<w:bottom w:val="single" w:color="D5DAE1" w:sz="4"/><w:right w:val="single" w:color="D5DAE1" w:sz="4"/></w:tcBorders>';
const BORDA_TABELA =
  '<w:tblBorders><w:top w:val="single" w:color="auto" w:sz="4"/><w:left w:val="single" w:color="auto" w:sz="4"/>' +
  '<w:bottom w:val="single" w:color="auto" w:sz="4"/><w:right w:val="single" w:color="auto" w:sz="4"/>' +
  '<w:insideH w:val="single" w:color="auto" w:sz="4"/><w:insideV w:val="single" w:color="auto" w:sz="4"/></w:tblBorders>';
const margem = (v, h) =>
  `<w:tcMar><w:top w:type="dxa" w:w="${v}"/><w:left w:type="dxa" w:w="${h}"/><w:bottom w:type="dxa" w:w="${v}"/><w:right w:type="dxa" w:w="${h}"/></w:tcMar>`;

const EMU_POR_PT = 12700;
const FOTO_LARGURA_PT = 216; // cabe na célula de 4619 dxa
const FOTO_ALTURA_PT = 162;

export function escaparXml(s) {
  return String(s ?? '')
    .replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Um run de texto; quebras de linha viram <w:br/>.
function run(texto, { b = false, i = false, cor = '222222', tam = 20 } = {}) {
  const props =
    FONTE +
    (b ? '<w:b/><w:bCs/>' : '') +
    (i ? '<w:i/><w:iCs/>' : '') +
    `<w:color w:val="${cor}"/><w:sz w:val="${tam}"/><w:szCs w:val="${tam}"/>`;
  const partes = String(texto ?? '').split('\n');
  const conteudo = partes
    .map((p, n) => (n ? '<w:br/>' : '') + `<w:t xml:space="preserve">${escaparXml(p)}</w:t>`)
    .join('');
  return `<w:r><w:rPr>${props}</w:rPr>${conteudo}</w:r>`;
}

const runs = (lista, base) => lista.map((r) => run(r.t, { ...base, b: !!r.b, i: !!r.i })).join('');
const p = (pPr, conteudo = '') => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${conteudo}</w:p>`;

function celula(largura, fill, conteudo, extra = margem(60, 90)) {
  const shd = fill ? `<w:shd w:fill="${fill}" w:color="auto" w:val="clear"/>` : '';
  return `<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="${largura}"/>${BORDA_CELULA}${shd}${extra}</w:tcPr>${conteudo}</w:tc>`;
}

function tabela(larguras, linhas) {
  const total = larguras.reduce((a, c) => a + c, 0);
  const grade = larguras.map((w) => `<w:gridCol w:w="${w}"/>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:type="dxa" w:w="${total}"/>${BORDA_TABELA}</w:tblPr><w:tblGrid>${grade}</w:tblGrid>${linhas.join('')}</w:tbl>`;
}

function blocoTabela(bloco) {
  const { larguras } = bloco;
  const cab =
    '<w:tr><w:trPr><w:tblHeader/></w:trPr>' +
    bloco.cabecalho
      .map((t, c) => celula(larguras[c], '1B2430', p('<w:spacing w:after="40"/>', run(t, { b: true, cor: 'FFFFFF', tam: 17 }))))
      .join('') +
    '</w:tr>';
  const linhas = bloco.linhas.map(
    (linha) =>
      '<w:tr><w:trPr><w:cantSplit/></w:trPr>' +
      linha.celulas
        .map((cel, c) => celula(larguras[c], cel.fill || linha.fill, p('<w:spacing w:after="40"/>', runs(cel.runs, { tam: 17 }))))
        .join('') +
      '</w:tr>'
  );
  return tabela(larguras, [cab, ...linhas]);
}

function desenho(rId, id, nome, larguraPt, alturaPt) {
  const cx = Math.round(larguraPt * EMU_POR_PT);
  const cy = Math.round(alturaPt * EMU_POR_PT);
  return (
    '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${id}" name="${escaparXml(nome)}"/>` +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<pic:nvPicPr><pic:cNvPr id="${id}" name="${escaparXml(nome)}"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
  );
}

// Encaixa a imagem na caixa mantendo a proporção.
export function encaixar(w, h, maxW, maxH) {
  if (!w || !h) return { w: maxW, h: maxH };
  const k = Math.min(maxW / w, maxH / h);
  return { w: w * k, h: h * k };
}

function blocoFotos(bloco, imagens, registrar) {
  const LARG = 4819;
  const INTERNA = 4619;
  const celFoto = (item) => {
    if (!item) return celula(LARG, null, p(''), margem(80, 90));
    const img = imagens.get(item.id);
    let interior;
    if (img) {
      const { w, h } = encaixar(img.w, img.h, FOTO_LARGURA_PT, FOTO_ALTURA_PT);
      const ref = registrar(img);
      interior = p('<w:jc w:val="center"/>', desenho(ref.rId, ref.id, `Foto ${item.numero}`, w, h));
    } else {
      interior = p('<w:jc w:val="center"/>', run('[Foto não encontrada]', { i: true, cor: '8A8F98', tam: 17 }));
    }
    const quadro =
      `<w:tbl><w:tblPr><w:tblW w:type="dxa" w:w="${INTERNA}"/>${BORDA_TABELA}</w:tblPr><w:tblGrid><w:gridCol w:w="${INTERNA}"/></w:tblGrid>` +
      '<w:tr><w:trPr><w:trHeight w:val="2600" w:hRule="atLeast"/></w:trPr>' +
      `<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="${INTERNA}"/>${BORDA_CELULA}<w:shd w:fill="EEF1F5" w:color="auto" w:val="clear"/><w:vAlign w:val="center"/></w:tcPr>${interior}</w:tc>` +
      '</w:tr></w:tbl>';
    const legenda = p(
      '<w:spacing w:before="80"/>',
      run(`Foto ${item.numero} – `, { b: true, tam: 17 }) + run(item.legenda, { tam: 17 })
    );
    return celula(LARG, null, quadro + legenda, margem(80, 90));
  };
  const linhas = [];
  for (let n = 0; n < bloco.itens.length; n += 2) {
    linhas.push(`<w:tr><w:trPr><w:cantSplit/></w:trPr>${celFoto(bloco.itens[n])}${celFoto(bloco.itens[n + 1])}</w:tr>`);
  }
  return tabela([LARG, LARG], linhas);
}

function corpo(doc, imagens, registrar) {
  const xml = [];
  for (const b of doc.blocos) {
    switch (b.tipo) {
      case 'titulo':
        xml.push(p('<w:spacing w:after="60"/>', run(b.texto, { b: true, cor: '1B2430', tam: 38 })));
        break;
      case 'subtitulo':
        xml.push(p('<w:spacing w:after="200"/>', run(b.texto, { cor: '3A4350', tam: 24 })));
        break;
      case 'meta':
        xml.push(p('<w:spacing w:after="200"/>', runs(b.runs, { tam: 20 })));
        break;
      case 'h1':
        xml.push(
          p(
            '<w:pStyle w:val="Heading1"/><w:keepNext/><w:pBdr><w:bottom w:val="single" w:color="1B2430" w:sz="8" w:space="4"/></w:pBdr><w:spacing w:after="140" w:before="320"/>',
            run(b.texto, { b: true, cor: '1B2430', tam: 26 })
          )
        );
        break;
      case 'h2':
        xml.push(
          p('<w:pStyle w:val="Heading2"/><w:keepNext/><w:spacing w:after="100" w:before="200"/>', run(b.texto, { b: true, cor: '3A4350', tam: 22 }))
        );
        break;
      case 'p':
        xml.push(p('<w:spacing w:after="120" w:line="276"/><w:jc w:val="both"/>', runs(b.runs, { tam: 20 })));
        break;
      case 'lista': {
        const numId = b.estilo === 'numerada' ? 2 : 3; // definidos no numbering.xml do modelo
        for (const item of b.itens) {
          xml.push(
            p(
              `<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr><w:spacing w:after="60" w:line="276"/><w:jc w:val="left"/>`,
              run(item, { tam: 20 })
            )
          );
        }
        break;
      }
      case 'tabela':
        xml.push(blocoTabela(b));
        break;
      case 'fotos':
        xml.push(blocoFotos(b, imagens, registrar));
        break;
      case 'espaco':
        xml.push(p('<w:spacing w:after="120"/>'));
        break;
      case 'assinatura':
        xml.push(p('<w:spacing w:before="600"/><w:jc w:val="center"/>', run('_______________________________________________', { tam: 20 })));
        for (const linha of b.linhas) xml.push(p('<w:jc w:val="center"/>', runs(linha, { tam: 20 })));
        break;
      case 'quebra':
        xml.push(p('<w:pageBreakBefore/>'));
        break;
      default:
        throw new Error(`Bloco desconhecido: ${b.tipo}`);
    }
  }
  return xml.join('');
}

/**
 * @param JSZip   construtor do JSZip
 * @param modelo  bytes de assets/modelo-base.docx
 * @param doc     resultado de montarDocumento()
 * @param imagens Map(id da foto -> { bytes, tipo, w, h })
 * @param opcoes  { logo: { bytes (PNG), proporcao } } para trocar o logo do cabeçalho
 * @returns Uint8Array do .docx
 */
export async function gerarDocx(JSZip, modelo, doc, imagens = new Map(), opcoes = {}) {
  const zip = await JSZip.loadAsync(modelo);
  const ler = (caminho) => zip.file(caminho).async('string');

  const midias = [];
  const registrar = (img) => {
    let m = midias.find((x) => x.img === img);
    if (!m) {
      const n = midias.length + 1;
      const ext = img.tipo === 'image/png' ? 'png' : 'jpeg';
      m = { img, rId: `rIdFoto${n}`, id: 100 + n, arquivo: `foto${n}.${ext}` };
      midias.push(m);
    }
    return m;
  };

  // Corpo: mantém a abertura (<w:document ...>) e as configurações de página do modelo.
  const original = await ler('word/document.xml');
  const inicio = original.indexOf('<w:body>');
  const secao = original.lastIndexOf('<w:sectPr');
  const fimSecao = original.indexOf('</w:sectPr>', secao);
  if (inicio < 0 || secao < 0 || fimSecao < 0) throw new Error('modelo-base.docx fora do formato esperado');
  const sectPr = original.slice(secao, fimSecao + '</w:sectPr>'.length);
  zip.file(
    'word/document.xml',
    original.slice(0, inicio) + '<w:body>' + corpo(doc, imagens, registrar) + sectPr + '</w:body></w:document>'
  );

  // Fotos e seus vínculos.
  if (midias.length) {
    const TIPO_IMAGEM = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
    const rels = await ler('word/_rels/document.xml.rels');
    const novos = midias
      .map((m) => `<Relationship Id="${m.rId}" Type="${TIPO_IMAGEM}" Target="media/${m.arquivo}"/>`)
      .join('');
    zip.file('word/_rels/document.xml.rels', rels.replace('</Relationships>', novos + '</Relationships>'));
    for (const m of midias) zip.file(`word/media/${m.arquivo}`, m.img.bytes);
  }

  // Rodapé: número do relatório.
  const rodape = await ler('word/footer1.xml');
  zip.file('word/footer1.xml', rodape.replace('[AAAA-NNN]', escaparXml(doc.numero)));

  // Cabeçalho: logo personalizado, se houver (mesma altura, largura proporcional).
  if (opcoes.logo?.bytes) {
    const relsCab = await ler('word/_rels/header1.xml.rels');
    const alvo = /Target="(media\/[^"]+)"/.exec(relsCab);
    if (alvo) {
      zip.file(`word/${alvo[1]}`, opcoes.logo.bytes);
      const cy = 285750;
      const cx = Math.round(Math.min(cy * (opcoes.logo.proporcao || 904875 / cy), 2400000));
      const cab = await ler('word/header1.xml');
      zip.file('word/header1.xml', cab.replace(/cx="904875" cy="285750"/g, `cx="${cx}" cy="${cy}"`));
    }
  }

  // Propriedades do arquivo.
  const agora = new Date().toISOString();
  const core = await ler('docProps/core.xml');
  zip.file(
    'docProps/core.xml',
    core
      .replace(/<dc:title>[^<]*<\/dc:title>/, `<dc:title>${escaparXml(`${doc.titulo} nº ${doc.numero}`)}</dc:title>`)
      .replace(/<dc:creator>[^<]*<\/dc:creator>/, `<dc:creator>${escaparXml(doc.autor)}</dc:creator>`)
      .replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/, `<cp:lastModifiedBy>${escaparXml(doc.autor)}</cp:lastModifiedBy>`)
      .replace(/(<dcterms:created[^>]*>)[^<]*/, `$1${agora}`)
      .replace(/(<dcterms:modified[^>]*>)[^<]*/, `$1${agora}`)
  );

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: MIME_DOCX });
}

export const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
