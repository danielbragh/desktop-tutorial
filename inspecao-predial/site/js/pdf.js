// Monta a definição de documento do pdfmake a partir dos blocos de
// documento.js, com as mesmas medidas do modelo em Word (A4, margens de 2 cm,
// larguras de coluna em dxa convertidas para pontos).

import { encaixar } from './docx.js';

// Liberation Sans tem as mesmas medidas da Arial usada no modelo, então o PDF
// quebra linhas e páginas como o Word. Os arquivos ficam em vendor/fonts/.
export const FONTES_PDF = {
  normal: 'LiberationSans-Regular.ttf',
  bold: 'LiberationSans-Bold.ttf',
  italics: 'LiberationSans-Italic.ttf',
  bolditalics: 'LiberationSans-Bold.ttf',
};

// `arquivos`: { 'LiberationSans-Regular.ttf': conteúdo em base64, ... }
export function registrarFontes(pdfMake, arquivos) {
  pdfMake.vfs = { ...(pdfMake.vfs || {}), ...arquivos };
  pdfMake.fonts = { ...(pdfMake.fonts || {}), Liberation: FONTES_PDF };
}

const PT = (dxa) => dxa / 20;
const MARGEM = 56.7; // 2 cm
const LARGURA_UTIL = 481.9;
const TINTA = '#222222';
const AZUL_ESCURO = '#1B2430';
const CINZA = '#3A4350';
const LINHA = '#D5DAE1';
const PAD_H = 4.5;
const PAD_V = 3;
const TRACO = 0.5;

const layoutTabela = {
  hLineWidth: () => TRACO,
  vLineWidth: () => TRACO,
  hLineColor: () => LINHA,
  vLineColor: () => LINHA,
  paddingLeft: () => PAD_H,
  paddingRight: () => PAD_H,
  paddingTop: () => PAD_V,
  paddingBottom: () => PAD_V,
};

// O pdfmake soma preenchimento e traços à largura da coluna; desconta aqui
// para a tabela fechar exatamente na largura útil da página.
const larguras = (dxas) => dxas.map((d) => PT(d) - 2 * PAD_H - TRACO * (1 + 1 / dxas.length));

const texto = (runs, base = {}) => ({
  text: runs.map((r) => ({ text: r.t, bold: !!r.b, italics: !!r.i })),
  ...base,
});

function blocoTabela(b) {
  const cab = b.cabecalho.map((t) => ({ text: t, bold: true, color: '#FFFFFF', fillColor: AZUL_ESCURO, fontSize: 8.5 }));
  const linhas = b.linhas.map((linha) =>
    linha.celulas.map((cel) => texto(cel.runs, { fillColor: '#' + (cel.fill || linha.fill || 'FFFFFF'), fontSize: 8.5 }))
  );
  return {
    table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 1, widths: larguras(b.larguras), body: [cab, ...linhas] },
    layout: layoutTabela,
    margin: [0, 0, 0, 2],
  };
}

function blocoFotos(b, imagens, registro) {
  const CAIXA_L = 222;
  const CAIXA_A = 166;
  const celula = (item) => {
    if (!item) return { text: '' };
    const img = imagens.get(item.id);
    let interior;
    if (img) {
      const chave = 'foto_' + item.numero;
      registro[chave] = img.dataUrl;
      const { w, h } = encaixar(img.w, img.h, CAIXA_L - 6, CAIXA_A - 6);
      interior = { image: chave, width: w, height: h, alignment: 'center', margin: [0, (CAIXA_A - h) / 2, 0, (CAIXA_A - h) / 2] };
    } else {
      interior = { text: '[Foto não encontrada]', italics: true, color: '#8A8F98', alignment: 'center', margin: [0, CAIXA_A / 2 - 5, 0, CAIXA_A / 2 - 5] };
    }
    return {
      stack: [
        {
          table: { widths: [CAIXA_L], body: [[{ ...interior, fillColor: '#EEF1F5' }]] },
          layout: { ...layoutTabela, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
        },
        {
          text: [{ text: `Foto ${item.numero} – `, bold: true }, item.legenda],
          fontSize: 8.5,
          margin: [0, 5, 0, 0],
        },
      ],
    };
  };
  const corpo = [];
  for (let n = 0; n < b.itens.length; n += 2) corpo.push([celula(b.itens[n]), celula(b.itens[n + 1])]);
  return {
    table: { dontBreakRows: true, widths: larguras([4819, 4819]), body: corpo },
    layout: { ...layoutTabela, paddingTop: () => 4, paddingBottom: () => 4 },
  };
}

/**
 * @param doc      resultado de montarDocumento()
 * @param imagens  Map(id da foto -> { dataUrl, w, h })
 * @param logo     { dataUrl, proporcao } do cabeçalho
 */
export function definicaoPdf(doc, imagens = new Map(), logo = null) {
  const registro = {};
  const conteudo = [];

  // Espaço (pt) que um título precisa ter na página junto com o que vem depois
  // dele; sem isso, vai para a página seguinte. O valor viaja no `id` do nó,
  // que é o que o pdfmake entrega para pageBreakBefore.
  const espacoPara = (indice) => {
    const proximo = doc.blocos[indice + 1]?.tipo;
    if (proximo === 'fotos') return 250;
    if (proximo === 'h2') return 150;
    if (proximo === 'tabela') return 110;
    return 70;
  };

  for (const [indice, b] of doc.blocos.entries()) {
    switch (b.tipo) {
      case 'titulo':
        conteudo.push({ text: b.texto, fontSize: 19, bold: true, color: AZUL_ESCURO, margin: [0, 0, 0, 3] });
        break;
      case 'subtitulo':
        conteudo.push({ text: b.texto, fontSize: 12, color: CINZA, margin: [0, 0, 0, 10] });
        break;
      case 'meta':
        conteudo.push(texto(b.runs, { margin: [0, 0, 0, 4] }));
        break;
      case 'h1':
        conteudo.push({
          headlineLevel: 1,
          id: `titulo${indice}:${espacoPara(indice)}`,
          stack: [
            { text: b.texto, fontSize: 13, bold: true, color: AZUL_ESCURO },
            { canvas: [{ type: 'line', x1: 0, y1: 4, x2: LARGURA_UTIL, y2: 4, lineWidth: 1, lineColor: AZUL_ESCURO }] },
          ],
          margin: [0, 16, 0, 9],
        });
        break;
      case 'h2':
        conteudo.push({ headlineLevel: 2, id: `titulo${indice}:${espacoPara(indice) - 20}`, text: b.texto, fontSize: 11, bold: true, color: CINZA, margin: [0, 10, 0, 5] });
        break;
      case 'p':
        conteudo.push(texto(b.runs, { alignment: 'justify', lineHeight: 1.25, margin: [0, 0, 0, 6] }));
        break;
      case 'lista': {
        const itens = b.itens.map((t) => ({ text: t, lineHeight: 1.25, margin: [0, 0, 0, 3] }));
        conteudo.push(b.estilo === 'numerada' ? { ol: itens, margin: [12, 0, 0, 0] } : { ul: itens, margin: [12, 0, 0, 0] });
        break;
      }
      case 'tabela':
        conteudo.push(blocoTabela(b));
        break;
      case 'fotos':
        conteudo.push(blocoFotos(b, imagens, registro));
        break;
      case 'espaco':
        conteudo.push({ text: '', margin: [0, 0, 0, 8] });
        break;
      case 'assinatura':
        conteudo.push({
          unbreakable: true,
          alignment: 'center',
          margin: [0, 34, 0, 0],
          stack: [{ text: '_______________________________________________' }, ...b.linhas.map((l) => texto(l))],
        });
        break;
      case 'quebra':
        conteudo.push({ text: '', pageBreak: 'after' });
        break;
      default:
        throw new Error(`Bloco desconhecido: ${b.tipo}`);
    }
  }

  const ALTURA_LOGO = 22.5;
  const larguraLogo = logo ? Math.min(ALTURA_LOGO * (logo.proporcao || 3.17), 190) : 0;
  if (logo) registro.logo = logo.dataUrl;

  return {
    pageSize: 'A4',
    pageMargins: [MARGEM, 68, MARGEM, 58],
    info: { title: `${doc.titulo} nº ${doc.numero}`, author: doc.autor },
    defaultStyle: { font: 'Liberation', fontSize: 10, color: TINTA, lineHeight: 1.05 },
    images: registro,
    header: () => ({
      margin: [MARGEM, 34, MARGEM, 0],
      stack: [
        {
          columns: [
            logo ? { image: 'logo', width: larguraLogo, height: ALTURA_LOGO } : { text: '', width: 1 },
            { text: doc.titulo, alignment: 'right', fontSize: 8, color: CINZA, margin: [0, 12, 0, 0] },
          ],
        },
        { canvas: [{ type: 'line', x1: 0, y1: 3, x2: LARGURA_UTIL, y2: 3, lineWidth: 0.5, lineColor: LINHA }] },
      ],
    }),
    footer: (pagina) => ({
      text: `Relatório nº ${doc.numero} · Página ${pagina}`,
      alignment: 'center',
      fontSize: 8,
      color: CINZA,
      margin: [0, 14, 0, 0],
    }),
    // Não deixa um título sozinho no fim da página.
    pageBreakBefore: (no) => {
      if (!no.headlineLevel || !no.startPosition) return false;
      const { pageInnerHeight, verticalRatio } = no.startPosition;
      const restante = pageInnerHeight * (1 - verticalRatio);
      return restante < Number(String(no.id).split(':')[1] || 70);
    },
    content: conteudo,
  };
}
