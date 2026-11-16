// Transforma os dados de um relatório em uma lista de blocos (títulos,
// parágrafos, tabelas, fotos). Os geradores de DOCX, PDF e a pré-visualização
// leem essa mesma lista, então os três saem sempre com o mesmo conteúdo.

import { TITULO, SUBTITULO, CRITERIOS, COR_GRAU, CHECKLIST, PRE_VOO, TEXTOS } from './modelo.js';

export const VAZIO = '—';

const BRANCO = 'FFFFFF';
const ZEBRA = 'EEF1F5';

// ---------- formatação ----------

export function formatarData(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '').trim();
}

export function numero(v) {
  const s = String(v ?? '').trim();
  // "1.250,5" (milhar com ponto) antes de "1250,5" / "1250.5"
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
  if (/^\d+([.,]\d+)?$/.test(s)) return Number(s.replace(',', '.'));
  return null;
}

export function formatarNumero(n, casas = 2) {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

// "30" -> "30 m"; texto livre fica como foi digitado.
function comUnidade(v, unidade) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const n = numero(s);
  return n === null ? s : `${formatarNumero(n)} ${unidade}`;
}

export function idAnomalia(indice) {
  return 'A' + String(indice + 1).padStart(2, '0');
}

const dois = (n) => String(n).padStart(2, '0');
const txt = (v) => String(v ?? '').trim();
const ou = (v) => txt(v) || VAZIO;

// ---------- valores derivados ----------

// Fotos na ordem do relatório: primeiro as gerais, depois as de cada anomalia.
export function fotosNumeradas(rel) {
  const ids = new Set(rel.anomalias.map((a) => a.id));
  const gerais = rel.fotos.filter((f) => !f.anomaliaId || !ids.has(f.anomaliaId));
  const lista = gerais.map((f) => ({ foto: f, anomalia: null, indiceAnomalia: -1 }));
  rel.anomalias.forEach((a, i) => {
    for (const f of rel.fotos) {
      if (f.anomaliaId === a.id) lista.push({ foto: f, anomalia: a, indiceAnomalia: i });
    }
  });
  return lista.map((item, i) => ({ ...item, numero: dois(i + 1) }));
}

export function legendaFoto(item) {
  const legenda = txt(item.foto.legenda);
  if (!item.anomalia) return legenda || VAZIO;
  const base = legenda || txt(item.anomalia.anomalia) || 'Detalhe';
  return `${base} – anomalia ${idAnomalia(item.indiceAnomalia)}`;
}

export function resolucao(rel) {
  const d = numero(rel.equip.distanciaDetalhe);
  const fator = numero(rel.equip.fatorResolucao) ?? 0.33;
  const valor = d === null ? null : d * fator;
  return {
    fator,
    valor,
    texto: valor === null ? '' : `${formatarNumero(valor)} mm/px`,
  };
}

export function contarGraus(rel) {
  const c = { 'Crítico': 0, 'Médio': 0, 'Mínimo': 0, 'Observação': 0, semGrau: 0 };
  for (const a of rel.anomalias) {
    if (a.grau in c) c[a.grau] += 1;
    else c.semGrau += 1;
  }
  return c;
}

const PRIORIDADES = [
  { chave: 'imediata', rotulo: 'Imediata', grau: 'Crítico', cor: 'FBE3E1' },
  { chave: 'curto', rotulo: 'Curto prazo', grau: 'Médio', cor: 'FFF4D6' },
  { chave: 'medio', rotulo: 'Médio prazo', grau: 'Mínimo', cor: 'E3F2E6' },
];

// Ações de cada prioridade montadas a partir das recomendações das anomalias.
export function acoesSugeridas(rel) {
  const r = {};
  for (const p of PRIORIDADES) {
    const linhas = [];
    rel.anomalias.forEach((a, i) => {
      if (a.grau === p.grau) linhas.push(`${idAnomalia(i)}: ${txt(a.recomendacao) || 'definir a ação'}`);
    });
    r[p.chave] = linhas.length ? linhas.join('\n') : 'Nenhuma ação nesta prioridade.';
  }
  return r;
}

function plural(n, um, varios) {
  return `${n} ${n === 1 ? um : varios}`;
}

function lista(itens) {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

// Texto inicial da conclusão, só com o que os dados já dizem. O técnico revisa.
export function resumoSugerido(rel) {
  const c = contarGraus(rel);
  const idsDe = (grau) => rel.anomalias.map((a, i) => (a.grau === grau ? idAnomalia(i) : null)).filter(Boolean);
  const anomalias = c['Crítico'] + c['Médio'] + c['Mínimo'];
  const frases = [];
  if (!anomalias) {
    frases.push('Não foram identificadas anomalias aparentes na cobertura na data da inspeção.');
  } else {
    const partes = [];
    if (c['Crítico']) partes.push(`${c['Crítico']} de grau crítico`);
    if (c['Médio']) partes.push(`${c['Médio']} de grau médio`);
    if (c['Mínimo']) partes.push(`${c['Mínimo']} de grau mínimo`);
    frases.push(
      `${anomalias === 1 ? 'Foi registrada' : 'Foram registradas'} ${plural(anomalias, 'anomalia', 'anomalias')} na cobertura: ${lista(partes)}.`
    );
    if (c['Crítico']) {
      frases.push(
        `${c['Crítico'] === 1 ? 'O item crítico' : 'Os itens críticos'} (${lista(idsDe('Crítico'))}) ${c['Crítico'] === 1 ? 'exige' : 'exigem'} intervenção imediata.`
      );
    }
    if (c['Médio']) {
      frases.push(
        `${c['Médio'] === 1 ? 'O item de grau médio' : 'Os itens de grau médio'} (${lista(idsDe('Médio'))}) ${c['Médio'] === 1 ? 'deve ser tratado' : 'devem ser tratados'} antes do período chuvoso.`
      );
    }
    if (c['Mínimo']) {
      frases.push(
        `${c['Mínimo'] === 1 ? 'O item de grau mínimo' : 'Os itens de grau mínimo'} (${lista(idsDe('Mínimo'))}) ${c['Mínimo'] === 1 ? 'pode' : 'podem'} seguir a manutenção programada.`
      );
    }
  }
  if (c['Observação']) {
    frases.push(
      `${c['Observação'] === 1 ? 'Há 1 ponto' : `Há ${c['Observação']} pontos`} de observação (${lista(idsDe('Observação'))}) a acompanhar na próxima inspeção.`
    );
  }
  return frases.join(' ');
}

export function linhasChecklist(rel) {
  return CHECKLIST.map((item, i) => {
    const refs = [];
    rel.anomalias.forEach((a, j) => {
      if (String(a.item) === String(i)) refs.push(idAnomalia(j));
    });
    return {
      nome: item.nome,
      situacao: refs.length ? 'Anomalia' : rel.checklist[i] || '',
      ref: refs.join(', '),
    };
  });
}

// O que ainda falta preencher para o relatório sair completo.
export function pendencias(rel) {
  const p = [];
  const falta = (secao, cond, texto) => {
    if (cond) p.push({ secao, texto });
  };
  const i = rel.ident;
  falta('ident', !txt(rel.numero), 'Número do relatório');
  falta('ident', !txt(rel.dataEmissao), 'Data de emissão');
  falta('ident', !txt(i.cliente), 'Cliente / contratante');
  falta('ident', !txt(i.representante), 'Representante');
  falta('ident', !txt(i.endereco), 'Endereço do imóvel');
  falta('ident', !txt(i.uso), 'Uso da edificação');
  falta('ident', !txt(i.pavimentos), 'Nº de pavimentos / blocos');
  falta('ident', !txt(i.tipoCobertura), 'Tipo de cobertura');
  falta('ident', !txt(i.area), 'Área aproximada da cobertura');
  falta('ident', !txt(i.dataInspecao), 'Data da inspeção');
  falta('ident', !txt(i.horaInicio) || !txt(i.horaFim), 'Horário da inspeção');
  falta('ident', !txt(i.trt), 'TRT nº');
  falta('voo', !txt(rel.equip.alturaVoo), 'Altura de voo');
  falta('voo', !txt(rel.equip.distanciaDetalhe), 'Distância nas imagens de detalhe');
  falta('voo', !txt(rel.equip.meteo), 'Condições meteorológicas');
  falta('voo', !txt(rel.conform.sisant), 'Cadastro da aeronave (SISANT)');
  falta('voo', !txt(rel.conform.sarpas), 'Autorização de voo (SARPAS)');
  falta('voo', !txt(rel.conform.reta), 'Seguro RETA');
  falta('voo', !txt(rel.conform.comunicacao), 'Comunicação prévia');
  falta('cobertura', !txt(rel.caracterizacao), 'Caracterização da cobertura');
  rel.anomalias.forEach((a, j) => {
    const id = idAnomalia(j);
    const faltam = [];
    if (!txt(a.local)) faltam.push('local');
    if (!txt(a.elemento)) faltam.push('elemento');
    if (!txt(a.anomalia)) faltam.push('descrição');
    if (!txt(a.causa)) faltam.push('causa provável');
    if (!a.grau) faltam.push('grau');
    if (!txt(a.recomendacao)) faltam.push('recomendação');
    falta('anomalias', faltam.length, `${id}: falta ${lista(faltam)}`);
  });
  const numeradas = fotosNumeradas(rel);
  falta('fotos', !numeradas.length, 'Nenhuma foto adicionada');
  numeradas.forEach((f) => {
    falta('fotos', !f.anomalia && !txt(f.foto.legenda), `Foto ${f.numero} sem legenda`);
  });
  linhasChecklist(rel).forEach((l) => falta('checklist', !l.situacao, `${l.nome}: situação não informada`));
  falta('conclusao', !txt(rel.conclusao.resumo), 'Resumo do estado geral da cobertura');
  falta('conclusao', !txt(rel.resp.nome), 'Nome do responsável técnico');
  return p;
}

// ---------- montagem dos blocos ----------

const r = (t, estilo = {}) => ({ t: String(t), ...estilo });

// "texto **em negrito** texto" -> runs
function comNegrito(texto) {
  return String(texto)
    .split('**')
    .map((parte, i) => r(parte, i % 2 ? { b: true } : {}))
    .filter((x) => x.t);
}

function paragrafos(texto, prefixo) {
  const linhas = String(texto || '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!linhas.length) linhas.push(VAZIO);
  return linhas.map((l, i) => ({
    tipo: 'p',
    runs: [...(prefixo && i === 0 ? [r(prefixo, { b: true })] : []), ...comNegrito(l)],
  }));
}

function tabela(larguras, cabecalho, linhas) {
  return { tipo: 'tabela', larguras, cabecalho, linhas };
}

// Tabela "campo | valor": primeira coluna em negrito, linhas zebradas.
function tabelaCampos(larguras, cabecalho, pares) {
  return tabela(
    larguras,
    cabecalho,
    pares.map(([campo, valor], i) => ({
      fill: i % 2 ? ZEBRA : BRANCO,
      celulas: [{ runs: [r(campo, { b: true })] }, { runs: [r(ou(valor))] }],
    }))
  );
}

function tabelaSimples(larguras, cabecalho, linhas) {
  return tabela(
    larguras,
    cabecalho,
    linhas.map((cels, i) => ({
      fill: i % 2 ? ZEBRA : BRANCO,
      celulas: cels.map((c) => (typeof c === 'object' ? c : { runs: [r(ou(c))] })),
    }))
  );
}

export function montarDocumento(rel, opcoes = {}) {
  const incluirAnexo = !!opcoes.anexo;
  const i = rel.ident;
  const resp = rel.resp;
  const emissao = formatarData(rel.dataEmissao);
  const b = [];

  b.push({ tipo: 'titulo', texto: TITULO });
  b.push({ tipo: 'subtitulo', texto: SUBTITULO });
  b.push({
    tipo: 'meta',
    runs: [r('Relatório nº ', { b: true }), r(ou(rel.numero)), r('   ·   Data de emissão: ', { b: true }), r(ou(emissao))],
  });

  // 1
  b.push({ tipo: 'h1', texto: '1. Identificação' });
  const horario = txt(i.horaInicio) && txt(i.horaFim) ? `${i.horaInicio} às ${i.horaFim}` : txt(i.horaInicio) || txt(i.horaFim);
  const quando = [formatarData(i.dataInspecao), horario].filter(Boolean).join(', ');
  const respLinha = [txt(resp.nome), [txt(resp.titulo), txt(resp.registro)].filter(Boolean).join(', ')].filter(Boolean).join(' — ');
  b.push(
    tabelaCampos([3000, 6638], ['Campo', 'Preenchimento'], [
      ['Cliente / contratante', i.cliente],
      ['Representante (síndico/gestor)', i.representante],
      ['Endereço do imóvel', i.endereco],
      ['Uso da edificação', i.uso],
      ['Nº de pavimentos / blocos', i.pavimentos],
      ['Tipo de cobertura', i.tipoCobertura],
      ['Área aproximada da cobertura', comUnidade(i.area, 'm²')],
      ['Data e horário da inspeção', quando],
      ['Responsável técnico', respLinha],
      ['TRT nº', i.trt],
    ])
  );

  // 2
  b.push({ tipo: 'h1', texto: '2. Objetivo e escopo' });
  b.push(...paragrafos(rel.escopo.objetivo));
  b.push(...paragrafos(rel.escopo.incluido, 'Escopo incluído: '));
  b.push(...paragrafos(rel.escopo.naoIncluido, 'Escopo não incluído: '));

  // 3
  b.push({ tipo: 'h1', texto: '3. Metodologia' });
  b.push({ tipo: 'h2', texto: '3.1 Equipamento e parâmetros de voo' });
  const res = resolucao(rel);
  b.push(
    tabelaCampos([3400, 6238], ['Item', 'Dado'], [
      ['Aeronave', rel.equip.aeronave],
      ['Altura de voo (vista geral)', comUnidade(rel.equip.alturaVoo, 'm acima da cobertura')],
      ['Distância nas imagens de detalhe', comUnidade(rel.equip.distanciaDetalhe, 'm')],
      [
        'Resolução aproximada no objeto',
        res.valor === null
          ? ''
          : `≈ ${formatarNumero(numero(rel.equip.distanciaDetalhe))} m × ${formatarNumero(res.fator)} mm/pixel = ${res.texto}`,
      ],
      ['Tipo de imagens', rel.equip.tipoImagens],
      ['Condições meteorológicas', rel.equip.meteo],
    ])
  );
  b.push({ tipo: 'h2', texto: '3.2 Conformidade regulatória da operação' });
  b.push(
    tabelaCampos([3400, 6238], ['Item', 'Registro'], [
      ['Cadastro da aeronave (SISANT/ANAC)', rel.conform.sisant],
      ['Autorização de voo (SARPAS/DECEA)', rel.conform.sarpas],
      ['Seguro RETA', rel.conform.reta],
      ['Comunicação prévia', rel.conform.comunicacao],
    ])
  );
  b.push({ tipo: 'h2', texto: '3.3 Procedimento' });
  b.push({ tipo: 'lista', estilo: 'numerada', itens: rel.procedimento.map(txt).filter(Boolean) });

  // 4
  b.push({ tipo: 'h1', texto: '4. Critérios de classificação' });
  b.push(
    tabela(
      [1900, 4300, 3438],
      ['Grau', 'Significado', 'Prioridade de intervenção'],
      CRITERIOS.map((c) => ({
        fill: c.cor,
        celulas: [{ runs: [r(c.grau, { b: true })] }, { runs: [r(c.significado)] }, { runs: [r(c.prioridade)] }],
      }))
    )
  );

  // 5
  b.push({ tipo: 'h1', texto: '5. Caracterização da cobertura' });
  b.push(...paragrafos(rel.caracterizacao));

  // 6
  b.push({ tipo: 'h1', texto: '6. Registro das anomalias' });
  const numeradas = fotosNumeradas(rel);
  if (!rel.anomalias.length) {
    b.push(...paragrafos('Não foram identificadas anomalias aparentes na data da inspeção.'));
  } else {
    b.push(
      tabelaSimples(
        [600, 1250, 1250, 1950, 650, 1400, 900, 1638],
        ['ID', 'Local', 'Elemento', 'Anomalia observada', 'Foto', 'Causa provável', 'Grau', 'Recomendação'],
        rel.anomalias.map((a, j) => [
          idAnomalia(j),
          a.local,
          a.elemento,
          a.anomalia,
          numeradas.filter((f) => f.anomalia === a).map((f) => f.numero).join(', '),
          a.causa,
          { runs: [r(ou(a.grau))], fill: COR_GRAU[a.grau] },
          a.recomendacao,
        ])
      )
    );
  }

  // 7
  b.push({ tipo: 'h1', texto: '7. Registro fotográfico' });
  if (!numeradas.length) {
    b.push(...paragrafos('Sem registro fotográfico anexado.'));
  } else {
    b.push({
      tipo: 'fotos',
      itens: numeradas.map((f) => ({ id: f.foto.id, numero: f.numero, legenda: legendaFoto(f) })),
    });
  }

  // 8
  b.push({ tipo: 'h1', texto: '8. Checklist dos elementos inspecionados' });
  b.push(
    tabelaSimples(
      [3800, 3000, 2838],
      ['Elemento', 'Situação', 'Referência (ID)'],
      linhasChecklist(rel).map((l) => [l.nome, l.situacao, l.ref])
    )
  );

  // 9
  b.push({ tipo: 'h1', texto: '9. Conclusão e recomendações' });
  b.push(...paragrafos(rel.conclusao.resumo));
  const sugeridas = acoesSugeridas(rel);
  b.push(
    tabela(
      [2200, 4600, 2838],
      ['Prioridade', 'Ações', 'Prazo sugerido'],
      PRIORIDADES.map((p) => ({
        fill: p.cor,
        celulas: [
          { runs: [r(p.rotulo, { b: true })] },
          { runs: [r(txt(rel.conclusao.acoes[p.chave]) || sugeridas[p.chave])] },
          { runs: [r(ou(rel.conclusao.prazos[p.chave]))] },
        ],
      }))
    )
  );
  b.push({ tipo: 'espaco' });
  b.push(
    ...paragrafos(
      `Recomenda-se nova inspeção ${txt(rel.conclusao.novaInspecao) || TEXTOS.novaInspecao[0]}, para acompanhar a evolução das anomalias e a eficácia das intervenções.`
    )
  );

  // 10
  b.push({ tipo: 'h1', texto: '10. Limitações' });
  b.push({ tipo: 'lista', estilo: 'marcadores', itens: rel.limitacoes.map(txt).filter(Boolean) });

  // 11
  b.push({ tipo: 'h1', texto: '11. Responsabilidade técnica' });
  b.push({
    tipo: 'assinatura',
    linhas: [
      [r(ou(resp.nome), { b: true })],
      [r([txt(resp.titulo), txt(resp.registro)].filter(Boolean).join(' — ') || VAZIO)],
      [r(`TRT nº ${ou(i.trt)}   ·   ${[txt(resp.cidade), emissao].filter(Boolean).join(', ') || VAZIO}`)],
    ],
  });

  if (incluirAnexo) {
    b.push({ tipo: 'quebra' });
    b.push({ tipo: 'h1', texto: 'Anexo A — Registro operacional do voo (uso interno, não entregar ao cliente)' });
    b.push({ tipo: 'p', runs: [r(TEXTOS.anexoIntro, { i: true })] });
    b.push(
      tabelaSimples(
        [6200, 3438],
        ['Verificação pré-voo', 'Status'],
        PRE_VOO.map((item, j) => {
          const s = rel.anexo.preVoo[j];
          return [item, `[${s === 'Sim' ? 'X' : '  '}] Sim   [${s === 'Não' ? 'X' : '  '}] Não`];
        })
      )
    );
    b.push({ tipo: 'espaco' });
    b.push(
      tabelaCampos([3400, 6238], ['Registro do voo', 'Dado'], [
        ['Piloto', rel.anexo.piloto],
        ['Observador', rel.anexo.observador],
        ['Horário de início e fim', rel.anexo.horario],
        ['Nº de voos / baterias usadas', rel.anexo.voos],
        ['Ocorrências', rel.anexo.ocorrencias],
        ['Pasta dos arquivos de imagem', rel.anexo.pasta],
      ])
    );
  }

  return {
    titulo: TITULO,
    numero: ou(rel.numero),
    autor: txt(resp.nome),
    blocos: b,
  };
}

// Nome de arquivo seguro: "Relatorio_2026-001_Condominio_Exemplo"
export function nomeArquivo(rel) {
  const limpar = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);
  return ['Relatorio', limpar(rel.numero), limpar(rel.ident.cliente)].filter(Boolean).join('_');
}
