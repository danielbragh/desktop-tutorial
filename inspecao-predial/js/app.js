// Interface do app: lista de relatórios, formulário por seções e emissão.

import {
  GRAUS,
  CRITERIOS,
  USOS,
  TIPOS_COBERTURA,
  ELEMENTOS_SUGERIDOS,
  CHECKLIST,
  SITUACOES,
  PRE_VOO,
  TEXTOS,
  PERFIL_PADRAO,
  uid,
  hojeISO,
  novaAnomalia,
  novoRelatorio,
  relatorioExemplo,
  sugerirItem,
} from './modelo.js';
import {
  montarDocumento,
  pendencias,
  fotosNumeradas,
  idAnomalia,
  resolucao,
  numero,
  formatarNumero,
  formatarData,
  contarGraus,
  acoesSugeridas,
  resumoSugerido,
  linhasChecklist,
  nomeArquivo,
} from './documento.js';
import { gerarDocx, MIME_DOCX } from './docx.js';
import { definicaoPdf, registrarFontes, FONTES_PDF } from './pdf.js';
import { htmlPrevia } from './previa.js';
import * as store from './store.js';
import {
  prepararFoto,
  prepararLogo,
  fotoExemplo,
  paraBase64,
  deBase64,
  paraDataUrl,
  bytesDeDataUrl,
  urlDaFoto,
  liberarUrl,
} from './fotos.js';

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const app = $('#app');

const SECOES = [
  { id: 'ident', num: '1', nome: 'Identificação' },
  { id: 'escopo', num: '2', nome: 'Objetivo e escopo' },
  { id: 'voo', num: '3', nome: 'Metodologia e voo' },
  { id: 'cobertura', num: '5', nome: 'Cobertura' },
  { id: 'anomalias', num: '6', nome: 'Anomalias' },
  { id: 'fotos', num: '7', nome: 'Fotos' },
  { id: 'checklist', num: '8', nome: 'Checklist' },
  { id: 'conclusao', num: '9', nome: 'Conclusão' },
  { id: 'anexo', num: 'A', nome: 'Registro do voo' },
  { id: 'emitir', num: '', nome: 'Emitir' },
];

const estado = {
  tela: 'lista',
  lista: [],
  perfil: { ...PERFIL_PADRAO },
  rel: null,
  fotos: new Map(), // id -> { id, relatorioId, tipo, w, h, dados }
  secao: 'ident',
  abertas: new Set(), // anomalias expandidas
  incluirAnexo: false,
  alvoFoto: null, // anomalia que vai receber as próximas fotos
  ocupado: false,
};

// ---------- utilidades ----------

const h = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function ler(obj, caminho) {
  return caminho.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function gravar(obj, caminho, valor) {
  const partes = caminho.split('.');
  const ultima = partes.pop();
  const alvo = partes.reduce((o, k) => o[k], obj);
  alvo[ultima] = valor;
}

const classeGrau = (g) =>
  ({ 'Crítico': 'g-critico', 'Médio': 'g-medio', 'Mínimo': 'g-minimo', 'Observação': 'g-observacao' })[g] || 'g-sem';

function avisar(texto, erro = false) {
  const el = document.createElement('div');
  el.className = 'aviso' + (erro ? ' erro' : '');
  el.textContent = texto;
  $('#avisos').append(el);
  setTimeout(() => el.remove(), erro ? 7000 : 3200);
}

function mostrarErro(e, contexto) {
  console.error(e);
  avisar(`${contexto}: ${e?.message || e}`, true);
}

// Diálogo de confirmação próprio (não depende de confirm() do navegador).
function confirmar({ titulo, texto, botao = 'Confirmar', perigo = false }) {
  const d = $('#dialogo');
  d.innerHTML = `<form method="dialog" class="dialogo-corpo">
    <h2>${h(titulo)}</h2>
    <p>${h(texto)}</p>
    <div class="dialogo-pe">
      <button type="button" class="botao" data-acao="fechar-dialogo">Cancelar</button>
      <button class="botao destaque${perigo ? ' perigo' : ''}" value="sim">${h(botao)}</button>
    </div>
  </form>`;
  d.returnValue = 'nao';
  d.showModal();
  return new Promise((ok) => d.addEventListener('close', () => ok(d.returnValue === 'sim'), { once: true }));
}

const carregados = new Map();
function carregarScript(src) {
  if (!carregados.has(src)) {
    carregados.set(
      src,
      new Promise((ok, erro) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = ok;
        s.onerror = () => {
          carregados.delete(src);
          erro(new Error(`Não foi possível carregar ${src}`));
        };
        document.head.append(s);
      })
    );
  }
  return carregados.get(src);
}

async function buscarBytes(caminho) {
  const r = await fetch(caminho);
  if (!r.ok) throw new Error(`Não foi possível carregar ${caminho}`);
  return r.arrayBuffer();
}

// ---------- salvamento ----------

let temporizador = null;
let gravando = Promise.resolve();

function agendarSalvar() {
  if (!estado.rel) return;
  clearTimeout(temporizador);
  temporizador = setTimeout(salvarAgora, 500);
  const s = $('#situacao');
  if (s) s.textContent = 'Salvando…';
}

function salvarAgora() {
  clearTimeout(temporizador);
  temporizador = null;
  const rel = estado.rel;
  if (!rel) return gravando;
  rel.atualizadoEm = Date.now();
  gravando = gravando
    .then(() => store.salvarRelatorio(rel))
    .then(() => {
      const s = $('#situacao');
      if (s && estado.rel === rel) s.textContent = textoSituacao();
    })
    .catch((e) => mostrarErro(e, 'Não foi possível salvar'));
  return gravando;
}

function textoSituacao() {
  const r = estado.rel;
  const hora = new Date(r.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${r.exemplo ? 'Exemplo · ' : ''}Salvo às ${hora}`;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && temporizador) salvarAgora();
});
window.addEventListener('pagehide', () => {
  if (temporizador) salvarAgora();
});

// ---------- numeração dos relatórios ----------

function proximoNumero() {
  const ano = new Date().getFullYear();
  let maior = 0;
  for (const r of estado.lista) {
    const m = new RegExp(`^${ano}-(\\d+)$`).exec(String(r.numero || '').trim());
    if (m) maior = Math.max(maior, Number(m[1]));
  }
  return `${ano}-${String(maior + 1).padStart(3, '0')}`;
}

// ---------- componentes de formulário ----------

function campo({ rotulo, caminho, tipo = 'text', obrig = false, dica = '', largo = false, lista = null, opcoes = null, unidade = '', linhas = 0, modo = '', placeholder = '' }) {
  const valor = ler(estado.rel, caminho) ?? '';
  const id = 'c-' + caminho.replace(/\./g, '-');
  const pend = obrig && !String(valor).trim();
  const comum = `id="${id}" data-campo="${caminho}"${obrig ? ' data-obrig' : ''}${placeholder ? ` placeholder="${h(placeholder)}"` : ''}`;
  let controle;
  if (linhas) {
    controle = `<textarea ${comum} rows="${linhas}">${h(valor)}</textarea>`;
  } else if (opcoes) {
    const ops = ['', ...opcoes].map((o) => `<option value="${h(o)}"${o === valor ? ' selected' : ''}>${o ? h(o) : 'Selecione'}</option>`);
    if (valor && !opcoes.includes(valor)) ops.push(`<option value="${h(valor)}" selected>${h(valor)}</option>`);
    controle = `<select ${comum}>${ops.join('')}</select>`;
  } else {
    const dl = lista ? ` list="${id}-lista"` : '';
    const im = modo ? ` inputmode="${modo}"` : '';
    controle = `<input ${comum} type="${tipo}" value="${h(valor)}"${dl}${im} autocomplete="off">`;
    if (lista) controle += `<datalist id="${id}-lista">${lista.map((o) => `<option value="${h(o)}">`).join('')}</datalist>`;
    if (unidade) controle = `<div class="com-unidade">${controle}<span>${h(unidade)}</span></div>`;
  }
  return `<div class="campo${largo ? ' largo' : ''}${pend ? ' pendente' : ''}">
    <label for="${id}">${h(rotulo)}</label>${controle}${dica ? `<span class="dica">${h(dica)}</span>` : ''}
  </div>`;
}

function escolha({ caminho, opcoes, classes = () => '', nome }) {
  const valor = ler(estado.rel, caminho) ?? '';
  const grupo = nome || 'e-' + caminho.replace(/\./g, '-');
  return `<div class="escolha" role="radiogroup">${opcoes
    .map(
      (o, i) => `<label><input type="radio" id="${grupo}-${i}" name="${grupo}" value="${h(o)}" data-campo="${caminho}"${o === valor ? ' checked' : ''}><span class="${classes(o)}">${h(o)}</span></label>`
    )
    .join('')}</div>`;
}

function listaEditavel(caminho, numerada) {
  const itens = ler(estado.rel, caminho);
  return `<div class="cartao-lista" style="display:grid;gap:8px">${itens
    .map(
      (t, i) => `<div class="item-lista">
        <span class="ordem">${numerada ? i + 1 + '.' : '•'}</span>
        <textarea id="l-${caminho}-${i}" data-campo="${caminho}.${i}" rows="2" aria-label="Item ${i + 1}">${h(t)}</textarea>
        <button type="button" class="botao pequeno discreto perigo" data-acao="remover-item" data-caminho="${caminho}" data-i="${i}" aria-label="Remover item ${i + 1}">Remover</button>
      </div>`
    )
    .join('')}</div>
    <div class="acoes">
      <button type="button" class="botao pequeno" data-acao="adicionar-item" data-caminho="${caminho}">Adicionar item</button>
      <button type="button" class="botao pequeno discreto" data-acao="restaurar-lista" data-caminho="${caminho}">Restaurar texto do modelo</button>
    </div>`;
}

function cartaoFoto(item, { grande = false } = {}) {
  const f = item.foto;
  const dados = estado.fotos.get(f.id);
  const i = estado.rel.fotos.indexOf(f);
  const img = dados ? `<img src="${h(urlDaFoto(dados))}" alt="Foto ${item.numero}">` : '<span class="dica">Imagem não encontrada</span>';
  const vinculo = grande
    ? `<div class="campo"><label for="f-vinc-${i}">Vincular a</label><select id="f-vinc-${i}" data-campo="fotos.${i}.anomaliaId" data-estrutura>
        <option value="">Vista geral (sem anomalia)</option>
        ${estado.rel.anomalias.map((a, j) => `<option value="${h(a.id)}"${a.id === f.anomaliaId ? ' selected' : ''}>${idAnomalia(j)} — ${h(a.local || a.elemento || 'sem descrição')}</option>`).join('')}
      </select></div>`
    : '';
  const semLegenda = !item.anomalia && !String(f.legenda || '').trim();
  return `<div class="foto">
    <div class="foto-topo"><span class="codigo">Foto ${item.numero}</span>
      <button type="button" class="botao pequeno discreto perigo" data-acao="excluir-foto" data-id="${h(f.id)}">Excluir</button></div>
    <div class="foto-imagem">${img}</div>
    <div class="campo${semLegenda ? ' pendente' : ''}"><label for="f-leg-${i}">Legenda</label>
      <input id="f-leg-${i}" data-campo="fotos.${i}.legenda"${item.anomalia ? '' : ' data-obrig'} value="${h(f.legenda)}" placeholder="${h(item.anomalia ? item.anomalia.anomalia || 'Descrição da foto' : 'Ex.: Vista geral da cobertura (vertical)')}" autocomplete="off">
      ${item.anomalia ? '<span class="dica">Em branco, usa a descrição da anomalia.</span>' : ''}</div>
    ${vinculo}
  </div>`;
}

function botoesFoto(anomaliaId) {
  return `<div class="acoes">
    <button type="button" class="botao pequeno" data-acao="adicionar-fotos" data-anomalia="${h(anomaliaId)}">Adicionar fotos</button>
    <button type="button" class="botao pequeno discreto" data-acao="tirar-foto" data-anomalia="${h(anomaliaId)}">Usar a câmera</button>
  </div>`;
}

// ---------- seções do formulário ----------

const telas = {
  ident: () => `
    <div class="secao-topo"><h2>1. Identificação</h2><p>Dados do cliente, do imóvel e da vistoria. Os campos em amarelo ainda faltam.</p></div>
    <div class="cartao"><h3>Relatório</h3><div class="grade">
      ${campo({ rotulo: 'Relatório nº', caminho: 'numero', obrig: true, dica: 'Formato AAAA-NNN' })}
      ${campo({ rotulo: 'Data de emissão', caminho: 'dataEmissao', tipo: 'date', obrig: true })}
    </div></div>
    <div class="cartao"><h3>Cliente e imóvel</h3><div class="grade">
      ${campo({ rotulo: 'Cliente / contratante', caminho: 'ident.cliente', obrig: true, placeholder: 'Nome do condomínio ou empresa' })}
      ${campo({ rotulo: 'Representante (síndico/gestor)', caminho: 'ident.representante', obrig: true, placeholder: 'Nome e contato' })}
      ${campo({ rotulo: 'Endereço do imóvel', caminho: 'ident.endereco', obrig: true, largo: true, placeholder: `Rua, nº, bairro, ${estado.rel.resp.cidade || 'cidade/UF'}` })}
      ${campo({ rotulo: 'Uso da edificação', caminho: 'ident.uso', obrig: true, lista: USOS })}
      ${campo({ rotulo: 'Nº de pavimentos / blocos', caminho: 'ident.pavimentos', obrig: true, placeholder: 'Ex.: 4 pavimentos / 2 blocos' })}
      ${campo({ rotulo: 'Tipo de cobertura', caminho: 'ident.tipoCobertura', obrig: true, lista: TIPOS_COBERTURA })}
      ${campo({ rotulo: 'Área aproximada da cobertura', caminho: 'ident.area', obrig: true, unidade: 'm²', modo: 'decimal' })}
    </div></div>
    <div class="cartao"><h3>Vistoria</h3><div class="grade">
      ${campo({ rotulo: 'Data da inspeção', caminho: 'ident.dataInspecao', tipo: 'date', obrig: true })}
      ${campo({ rotulo: 'Início', caminho: 'ident.horaInicio', tipo: 'time', obrig: true })}
      ${campo({ rotulo: 'Fim', caminho: 'ident.horaFim', tipo: 'time', obrig: true })}
      ${campo({ rotulo: 'TRT nº', caminho: 'ident.trt', obrig: true, placeholder: 'Número do TRT do serviço' })}
    </div></div>`,

  escopo: () => `
    <div class="secao-topo"><h2>2. Objetivo e escopo</h2><p>Texto padrão do modelo. Ajuste só se este serviço tiver escopo diferente.</p></div>
    <div class="cartao">
      ${campo({ rotulo: 'Objetivo', caminho: 'escopo.objetivo', linhas: 7, dica: 'O trecho entre ** e ** sai em negrito.' })}
      ${campo({ rotulo: 'Escopo incluído', caminho: 'escopo.incluido', linhas: 4 })}
      ${campo({ rotulo: 'Escopo não incluído', caminho: 'escopo.naoIncluido', linhas: 4 })}
      <div class="acoes"><button type="button" class="botao pequeno discreto" data-acao="restaurar-escopo">Restaurar texto do modelo</button></div>
    </div>`,

  voo: () => `
    <div class="secao-topo"><h2>3. Metodologia</h2><p>Equipamento, parâmetros de voo e registros da operação.</p></div>
    <div class="cartao"><h3>3.1 Equipamento e parâmetros de voo</h3><div class="grade">
      ${campo({ rotulo: 'Aeronave', caminho: 'equip.aeronave', largo: true })}
      ${campo({ rotulo: 'Altura de voo (vista geral)', caminho: 'equip.alturaVoo', obrig: true, unidade: 'm acima da cobertura', modo: 'decimal' })}
      ${campo({ rotulo: 'Distância nas imagens de detalhe', caminho: 'equip.distanciaDetalhe', obrig: true, unidade: 'm', modo: 'decimal' })}
      <div class="campo largo"><span class="rotulo">Resolução aproximada no objeto</span><div class="calculo" id="resolucao">${htmlResolucao()}</div></div>
      ${campo({ rotulo: 'Tipo de imagens', caminho: 'equip.tipoImagens', linhas: 2, largo: true })}
      ${campo({ rotulo: 'Condições meteorológicas', caminho: 'equip.meteo', obrig: true, largo: true, placeholder: 'Céu, vento estimado, chuva nas últimas 48 h' })}
    </div></div>
    <div class="cartao"><h3>3.2 Conformidade regulatória da operação</h3><div class="grade">
      ${campo({ rotulo: 'Cadastro da aeronave (SISANT/ANAC)', caminho: 'conform.sisant', obrig: true, placeholder: 'Nº do cadastro' })}
      ${campo({ rotulo: 'Autorização de voo (SARPAS/DECEA)', caminho: 'conform.sarpas', obrig: true, placeholder: 'Nº da autorização' })}
      ${campo({ rotulo: 'Seguro RETA', caminho: 'conform.reta', obrig: true, placeholder: 'Seguradora e nº da apólice' })}
      ${campo({ rotulo: 'Comunicação prévia', caminho: 'conform.comunicacao', obrig: true, placeholder: 'Comunicado aos moradores via síndico em dd/mm' })}
    </div></div>
    <div class="cartao"><h3>3.3 Procedimento</h3>${listaEditavel('procedimento', true)}</div>`,

  cobertura: () => `
    <div class="secao-topo"><h2>5. Caracterização da cobertura</h2><p>Descreva o sistema de cobertura como foi encontrado.</p></div>
    <div class="cartao">
      ${campo({
        rotulo: 'Descrição',
        caminho: 'caracterizacao',
        obrig: true,
        linhas: 9,
        dica: 'Tipo e estado geral das telhas, inclinação aparente, estrutura de apoio visível, drenagem (calhas, condutores, ralos), platibandas e rufos, impermeabilizações, reservatórios e equipamentos.',
      })}
    </div>`,

  anomalias: () => {
    const rel = estado.rel;
    const numeradas = fotosNumeradas(rel);
    const cartoes = rel.anomalias
      .map((a, i) => {
        const fotos = numeradas.filter((f) => f.anomalia === a);
        const p = `anomalias.${i}`;
        return `<details class="anomalia" data-id="${h(a.id)}"${estado.abertas.has(a.id) ? ' open' : ''}>
          <summary><span class="codigo">${idAnomalia(i)}</span><span class="selo ${classeGrau(a.grau)}" data-selo="${i}">${h(a.grau || 'Sem grau')}</span>
            <span class="resumo" data-resumo="${i}">${h([a.local, a.elemento].filter(Boolean).join(' · ') || 'Nova anomalia')}</span></summary>
          <div class="anomalia-corpo">
            <div class="grade">
              ${campo({ rotulo: 'Local', caminho: `${p}.local`, obrig: true, placeholder: 'Ex.: Bloco A, água sul' })}
              ${campo({ rotulo: 'Elemento', caminho: `${p}.elemento`, obrig: true, lista: ELEMENTOS_SUGERIDOS })}
              <div class="campo"><label for="c-${p.replace('.', '-')}-item">Item do checklist</label>
                <select id="c-${p.replace('.', '-')}-item" data-campo="${p}.item">
                  <option value="">Nenhum</option>
                  ${CHECKLIST.map((c, j) => `<option value="${j}"${String(a.item) === String(j) ? ' selected' : ''}>${h(c.nome)}</option>`).join('')}
                </select><span class="dica">Marca o item como "Anomalia" na Seção 8.</span></div>
              ${campo({ rotulo: 'Anomalia observada', caminho: `${p}.anomalia`, obrig: true, linhas: 2, largo: true })}
              ${campo({ rotulo: 'Causa provável', caminho: `${p}.causa`, obrig: true, linhas: 2, largo: true })}
              <div class="campo largo"><span class="rotulo">Grau</span>
                ${escolha({ caminho: `${p}.grau`, opcoes: GRAUS, classes: classeGrau, nome: `grau-${a.id}` })}</div>
              ${campo({ rotulo: 'Recomendação', caminho: `${p}.recomendacao`, obrig: true, linhas: 2, largo: true })}
            </div>
            <div class="campo"><span class="rotulo">Fotos desta anomalia</span>
              ${fotos.length ? `<div class="miniaturas">${fotos.map((f) => cartaoFoto(f)).join('')}</div>` : ''}
              ${botoesFoto(a.id)}</div>
            <div class="acoes">
              <button type="button" class="botao pequeno" data-acao="mover-anomalia" data-i="${i}" data-d="-1"${i === 0 ? ' disabled' : ''}>Subir</button>
              <button type="button" class="botao pequeno" data-acao="mover-anomalia" data-i="${i}" data-d="1"${i === rel.anomalias.length - 1 ? ' disabled' : ''}>Descer</button>
              <button type="button" class="botao pequeno discreto perigo" data-acao="excluir-anomalia" data-i="${i}">Excluir anomalia</button>
            </div>
          </div>
        </details>`;
      })
      .join('');
    return `
      <div class="secao-topo"><h2>6. Registro das anomalias</h2><p>Cada anomalia recebe um ID (A01, A02…) na ordem da lista. As fotos e o checklist se ligam a ela automaticamente.</p></div>
      ${cartoes || '<div class="vazio">Nenhuma anomalia registrada. Sem anomalias, o relatório informa que nada foi identificado.</div>'}
      <div class="acoes"><button type="button" class="botao destaque" data-acao="nova-anomalia">Adicionar anomalia</button></div>
      <div class="cartao"><h3>4. Critérios de classificação<small>Tabela fixa do relatório, para consulta.</small></h3>
        <div class="legenda-criterios">${CRITERIOS.map((c) => `<div><span><span class="selo ${classeGrau(c.grau)}">${h(c.grau)}</span></span><span>${h(c.significado)}. <strong>${h(c.prioridade)}</strong>.</span></div>`).join('')}</div>
      </div>`;
  },

  fotos: () => {
    const rel = estado.rel;
    const numeradas = fotosNumeradas(rel);
    const gerais = numeradas.filter((f) => !f.anomalia);
    const grupos = rel.anomalias
      .map((a, i) => {
        const fs = numeradas.filter((f) => f.anomalia === a);
        return `<div class="cartao"><h3><span class="codigo">${idAnomalia(i)}</span> ${h(a.local || a.elemento || 'Anomalia')} <span class="selo ${classeGrau(a.grau)}">${h(a.grau || 'Sem grau')}</span></h3>
          ${fs.length ? `<div class="miniaturas fotos-grandes">${fs.map((f) => cartaoFoto(f, { grande: true })).join('')}</div>` : '<p class="dica">Sem fotos.</p>'}
          ${botoesFoto(a.id)}</div>`;
      })
      .join('');
    return `
      <div class="secao-topo"><h2>7. Registro fotográfico</h2><p>As fotos saem numeradas nesta ordem: vistas gerais primeiro, depois as de cada anomalia. São reduzidas para 1600 px antes de guardar.</p></div>
      <div class="cartao"><h3>Vistas gerais<small>Vertical (nadir) e oblíquas da cobertura inteira.</small></h3>
        ${gerais.length ? `<div class="miniaturas fotos-grandes">${gerais.map((f) => cartaoFoto(f, { grande: true })).join('')}</div>` : '<p class="dica">Sem fotos.</p>'}
        ${botoesFoto('')}</div>
      ${grupos}`;
  },

  checklist: () => {
    const linhas = linhasChecklist(estado.rel);
    return `
      <div class="secao-topo"><h2>8. Checklist dos elementos inspecionados</h2><p>Itens com anomalia registrada já aparecem marcados, com a referência. Informe a situação dos demais.</p></div>
      <div class="cartao"><div class="linhas">${linhas
        .map((l, i) => {
          const direita = l.ref
            ? `<span><span class="selo g-medio">Anomalia</span> <span class="codigo">${h(l.ref)}</span></span>`
            : escolha({ caminho: `checklist.${i}`, opcoes: SITUACOES, nome: `chk-${i}` });
          return `<div class="linha${l.situacao ? '' : ' sem-situacao'}"><span>${h(l.nome)}</span>${direita}</div>`;
        })
        .join('')}</div>
        <div class="acoes"><button type="button" class="botao pequeno" data-acao="checklist-ok">Marcar os que faltam como OK</button></div>
      </div>`;
  },

  conclusao: () => {
    const rel = estado.rel;
    const c = contarGraus(rel);
    const sug = acoesSugeridas(rel);
    const acao = (chave, rotulo, grau) => `
      <div class="campo largo"><label for="c-conclusao-acoes-${chave}"><span class="selo ${classeGrau(grau)}">${rotulo}</span> Ações</label>
        <textarea id="c-conclusao-acoes-${chave}" data-campo="conclusao.acoes.${chave}" rows="3" placeholder="${h(sug[chave])}">${h(rel.conclusao.acoes[chave])}</textarea>
        <span class="dica">Em branco, usa as recomendações das anomalias de grau ${grau.toLowerCase()} (o texto em cinza).</span></div>
      ${campo({ rotulo: `Prazo sugerido — ${rotulo.toLowerCase()}`, caminho: `conclusao.prazos.${chave}`, largo: true })}`;
    return `
      <div class="secao-topo"><h2>9. Conclusão e recomendações</h2><p>Fecha o relatório: resumo, ações por prioridade, limitações e responsabilidade técnica.</p></div>
      <div class="cartao"><h3>Resumo do estado geral</h3>
        <div class="contagem">
          <span class="selo g-critico">${c['Crítico']} crítico${c['Crítico'] === 1 ? '' : 's'}</span>
          <span class="selo g-medio">${c['Médio']} médio${c['Médio'] === 1 ? '' : 's'}</span>
          <span class="selo g-minimo">${c['Mínimo']} mínimo${c['Mínimo'] === 1 ? '' : 's'}</span>
          <span class="selo g-observacao">${c['Observação']} observaç${c['Observação'] === 1 ? 'ão' : 'ões'}</span>
        </div>
        ${campo({ rotulo: 'Resumo', caminho: 'conclusao.resumo', obrig: true, linhas: 6, dica: '3 a 5 linhas: quantidade de anomalias por grau, principais riscos e o que precisa ser feito antes do período chuvoso.' })}
        <div class="acoes"><button type="button" class="botao pequeno" data-acao="sugerir-resumo">Sugerir texto a partir das anomalias</button></div>
      </div>
      <div class="cartao"><h3>Ações por prioridade</h3><div class="grade">
        ${acao('imediata', 'Imediata', 'Crítico')}
        ${acao('curto', 'Curto prazo', 'Médio')}
        ${acao('medio', 'Médio prazo', 'Mínimo')}
        ${campo({ rotulo: 'Recomenda-se nova inspeção…', caminho: 'conclusao.novaInspecao', lista: TEXTOS.novaInspecao, largo: true })}
      </div></div>
      <div class="cartao"><h3>10. Limitações</h3>${listaEditavel('limitacoes', false)}</div>
      <div class="cartao"><h3>11. Responsabilidade técnica<small>Vem de "Meus dados"; mude aqui só para este relatório.</small></h3><div class="grade">
        ${campo({ rotulo: 'Nome', caminho: 'resp.nome', obrig: true })}
        ${campo({ rotulo: 'Título profissional', caminho: 'resp.titulo' })}
        ${campo({ rotulo: 'Registro', caminho: 'resp.registro' })}
        ${campo({ rotulo: 'Cidade/UF', caminho: 'resp.cidade' })}
      </div></div>`;
  },

  anexo: () => `
    <div class="secao-topo"><h2>Anexo A — Registro operacional do voo</h2><p>Uso interno. Preencha em todo serviço; só entra no arquivo se você marcar a opção na hora de emitir.</p></div>
    <div class="cartao"><h3>Verificação pré-voo</h3><div class="linhas">${PRE_VOO.map(
      (item, i) => `<div class="linha"><span>${h(item)}</span>${escolha({ caminho: `anexo.preVoo.${i}`, opcoes: ['Sim', 'Não'], nome: `pv-${i}` })}</div>`
    ).join('')}</div>
      <div class="acoes"><button type="button" class="botao pequeno" data-acao="prevoo-sim">Marcar tudo como Sim</button></div>
    </div>
    <div class="cartao"><h3>Registro do voo</h3><div class="grade">
      ${campo({ rotulo: 'Piloto', caminho: 'anexo.piloto' })}
      ${campo({ rotulo: 'Observador', caminho: 'anexo.observador' })}
      ${campo({ rotulo: 'Horário de início e fim', caminho: 'anexo.horario', placeholder: 'Ex.: 08:00 às 09:30' })}
      ${campo({ rotulo: 'Nº de voos / baterias usadas', caminho: 'anexo.voos' })}
      ${campo({ rotulo: 'Ocorrências', caminho: 'anexo.ocorrencias', linhas: 2, largo: true })}
      ${campo({ rotulo: 'Pasta dos arquivos de imagem', caminho: 'anexo.pasta', largo: true })}
    </div></div>`,

  emitir: () => {
    const rel = estado.rel;
    const pend = pendencias(rel);
    const porSecao = SECOES.map((s) => ({ s, itens: pend.filter((p) => p.secao === s.id) })).filter((g) => g.itens.length);
    const doc = montarDocumento(rel, { anexo: estado.incluirAnexo });
    return `
      <div class="secao-topo"><h2>Emitir relatório</h2><p>Confira as pendências e a pré-visualização, depois baixe o arquivo.</p></div>
      <div class="cartao"><h3>${pend.length ? `${pend.length} pendência${pend.length === 1 ? '' : 's'}` : 'Nenhuma pendência'}<small>${pend.length ? 'Campo em branco sai como "—" no documento. Você pode emitir assim mesmo.' : 'Todos os campos do modelo estão preenchidos.'}</small></h3>
        ${porSecao.length ? `<ul class="pendencias">${porSecao.map((g) => `<li><button type="button" data-acao="ir" data-secao="${g.s.id}">${h(g.s.nome)}</button>: ${h(g.itens.map((x) => x.texto).join('; '))}</li>`).join('')}</ul>` : ''}
      </div>
      <div class="cartao"><h3>Arquivo</h3>
        <label class="opcao" for="opcao-anexo"><input type="checkbox" id="opcao-anexo"${estado.incluirAnexo ? ' checked' : ''}>
          <span>Incluir o Anexo A (registro operacional do voo). <span class="dica">É de uso interno: deixe desmarcado na via do cliente.</span></span></label>
        <div class="acoes">
          <button type="button" class="botao destaque" data-acao="emitir" data-formato="docx">Baixar DOCX</button>
          <button type="button" class="botao destaque" data-acao="emitir" data-formato="pdf">Baixar PDF</button>
          ${podeCompartilhar() ? '<button type="button" class="botao" data-acao="emitir" data-formato="compartilhar">Compartilhar PDF</button>' : ''}
        </div>
        <p class="dica">Nome do arquivo: ${h(nomeArquivo(rel))}</p>
      </div>
      <div class="secao-topo"><h2>Pré-visualização</h2><p>O conteúdo é o mesmo do DOCX e do PDF; cabeçalho, rodapé e quebras de página aparecem no arquivo.</p></div>
      <div class="papel">${htmlPrevia(doc, (id) => (estado.fotos.has(id) ? urlDaFoto(estado.fotos.get(id)) : null))}</div>`;
  },
};

function htmlResolucao() {
  const res = resolucao(estado.rel);
  const d = numero(estado.rel.equip.distanciaDetalhe);
  if (res.valor === null) return `Informe a distância para calcular (distância × ${formatarNumero(res.fator)} mm/pixel).`;
  return `≈ ${formatarNumero(d)} m × ${formatarNumero(res.fator)} mm/pixel = <strong>${h(res.texto)}</strong>`;
}

function podeCompartilhar() {
  try {
    return !!navigator.canShare?.({ files: [new File(['x'], 'relatorio.pdf', { type: 'application/pdf' })] });
  } catch {
    return false;
  }
}

// ---------- telas ----------

function contarPorSecao() {
  const c = {};
  for (const p of pendencias(estado.rel)) c[p.secao] = (c[p.secao] || 0) + 1;
  return c;
}

function htmlNavegacao() {
  const c = contarPorSecao();
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  return SECOES.map((s) => {
    const n = s.id === 'emitir' ? total : c[s.id] || 0;
    return `<button type="button" data-acao="ir" data-secao="${s.id}"${s.id === estado.secao ? ' aria-current="true"' : ''}>
      ${s.num ? `<span class="num">${s.num}</span>` : ''}<span>${h(s.nome)}</span>${n ? `<span class="falta" title="${n} campo(s) a preencher">${n}</span>` : ''}</button>`;
  }).join('');
}

function desenharSecao({ rolar = false } = {}) {
  const i = SECOES.findIndex((s) => s.id === estado.secao);
  const ant = SECOES[i - 1];
  const prox = SECOES[i + 1];
  $('#secao').innerHTML =
    telas[estado.secao]() +
    `<div class="passos">
      ${ant ? `<button type="button" class="botao" data-acao="ir" data-secao="${ant.id}">Voltar: ${h(ant.nome)}</button>` : '<span></span>'}
      ${prox ? `<button type="button" class="botao destaque" data-acao="ir" data-secao="${prox.id}">${prox.id === 'emitir' ? 'Emitir' : 'Avançar: ' + h(prox.nome)}</button>` : ''}
    </div>`;
  atualizarNavegacao();
  if (rolar) {
    window.scrollTo({ top: 0 });
    $('.secoes [aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
}

function atualizarNavegacao() {
  const nav = $('.secoes');
  if (nav) nav.innerHTML = htmlNavegacao();
}

function desenharEditor() {
  const rel = estado.rel;
  app.innerHTML = `
    <header class="barra"><div class="barra-dentro">
      <button type="button" class="botao pequeno" data-acao="voltar-lista" aria-label="Voltar para a lista de relatórios">Relatórios</button>
      <div class="barra-titulo"><strong id="titulo-rel">${h(tituloRel(rel))}</strong><span id="situacao">${h(textoSituacao())}</span></div>
      <button type="button" class="botao pequeno destaque" data-acao="ir" data-secao="emitir">Emitir</button>
    </div></header>
    <main class="pagina"><div class="editor">
      <nav class="secoes" aria-label="Seções do relatório"></nav>
      <section class="secao" id="secao"></section>
    </div></main>`;
  desenharSecao({ rolar: true });
}

const tituloRel = (rel) => `${rel.numero || 'Sem número'} · ${rel.ident.cliente || 'Cliente não informado'}`;

function desenharLista() {
  const itens = estado.lista
    .map((r) => {
      const c = contarGraus(r);
      const p = pendencias(r).length;
      return `<li class="relatorio">
        <button type="button" class="relatorio-abrir" data-acao="abrir" data-id="${h(r.id)}">
          <span class="relatorio-linha"><span class="codigo">${h(r.numero || 'Sem número')}</span><span>${h(formatarData(r.ident.dataInspecao) || 'sem data')}</span>${r.exemplo ? '<span class="selo">Exemplo</span>' : ''}</span>
          <span class="relatorio-cliente">${h(r.ident.cliente || 'Cliente não informado')}</span>
          <span class="relatorio-linha">
            ${c['Crítico'] ? `<span class="selo g-critico">${c['Crítico']} crítico${c['Crítico'] === 1 ? '' : 's'}</span>` : ''}
            ${c['Médio'] ? `<span class="selo g-medio">${c['Médio']} médio${c['Médio'] === 1 ? '' : 's'}</span>` : ''}
            ${c['Mínimo'] ? `<span class="selo g-minimo">${c['Mínimo']} mínimo${c['Mínimo'] === 1 ? '' : 's'}</span>` : ''}
            ${r.anomalias.length ? '' : '<span>Sem anomalias</span>'}
            <span>${r.fotos.length} foto${r.fotos.length === 1 ? '' : 's'}</span>
            ${p ? `<span class="falta">${p} a preencher</span>` : '<span class="selo g-minimo">Completo</span>'}
          </span>
        </button>
        <div class="relatorio-pe">
          <button type="button" class="botao pequeno discreto" data-acao="duplicar" data-id="${h(r.id)}">Nova inspeção deste imóvel</button>
          <button type="button" class="botao pequeno discreto perigo" data-acao="excluir-relatorio" data-id="${h(r.id)}">Excluir</button>
        </div>
      </li>`;
    })
    .join('');
  app.innerHTML = `
    <header class="barra"><div class="barra-dentro">
      <div class="barra-titulo"><strong>Inspeção de Cobertura</strong><span>Relatórios de inspeção visual com drone</span></div>
      <button type="button" class="botao pequeno" data-acao="perfil">Meus dados</button>
    </div></header>
    <main class="pagina">
      ${store.persistente() ? '' : '<div class="aviso-topo">Este navegador não deixou guardar dados no aparelho. Os relatórios ficam só até fechar a página: exporte uma cópia antes de sair.</div>'}
      <div class="inicio-topo">
        <div><h1>Relatórios</h1><p>${estado.lista.length ? `${estado.lista.length} guardado${estado.lista.length === 1 ? '' : 's'} neste aparelho` : 'Nenhum relatório ainda'}</p></div>
        <div class="acoes">
          <button type="button" class="botao destaque" data-acao="novo">Novo relatório</button>
          <button type="button" class="botao" data-acao="exportar">Exportar cópia</button>
          <button type="button" class="botao" data-acao="importar">Importar cópia</button>
        </div>
      </div>
      ${itens ? `<ul class="relatorios">${itens}</ul>` : '<div class="vazio">Toque em "Novo relatório" para começar uma inspeção.</div>'}
      <p class="nota">Os relatórios e as fotos ficam guardados só neste aparelho e funcionam sem internet. Use "Exportar cópia" para fazer backup ou levar para outro aparelho.</p>
    </main>`;
}

async function irParaLista({ historico = true } = {}) {
  if (temporizador) await salvarAgora();
  estado.rel = null;
  estado.fotos = new Map();
  estado.tela = 'lista';
  estado.lista = await store.listarRelatorios();
  desenharLista();
  if (historico) registrarHistorico(false);
}

async function abrirRelatorio(id, { secao = 'ident', historico = true } = {}) {
  const rel = await store.obterRelatorio(id);
  if (!rel) {
    avisar('Relatório não encontrado.', true);
    return;
  }
  const fotos = await store.obterFotos(id);
  estado.rel = rel;
  estado.fotos = new Map(fotos.map((f) => [f.id, f]));
  estado.secao = secao;
  estado.tela = 'editor';
  estado.abertas = new Set();
  estado.incluirAnexo = false;
  desenharEditor();
  if (historico) registrarHistorico(true);
}

// Botão "voltar" do aparelho leva do relatório para a lista.
function registrarHistorico(noEditor) {
  try {
    if (noEditor) history.pushState({ rel: estado.rel.id }, '');
    else if (history.state?.rel) history.replaceState(null, '');
  } catch {
    /* sem histórico disponível */
  }
}

window.addEventListener('popstate', (e) => {
  if (e.state?.rel) abrirRelatorio(e.state.rel, { historico: false });
  else if (estado.tela === 'editor') irParaLista({ historico: false });
});

// ---------- perfil ("Meus dados") ----------

function abrirPerfil() {
  const p = estado.perfil;
  const antes = { ...p };
  const linha = (rotulo, chave, extra = '') =>
    `<div class="campo${extra.includes('largo') ? ' largo' : ''}"><label for="p-${chave}">${rotulo}</label><input id="p-${chave}" name="${chave}" value="${h(p[chave] ?? '')}" autocomplete="off"${extra.includes('decimal') ? ' inputmode="decimal"' : ''}></div>`;
  const d = $('#dialogo');
  d.innerHTML = `<form method="dialog" class="dialogo-corpo" id="form-perfil">
    <h2>Meus dados</h2>
    <p>Entram prontos em cada relatório novo. Relatórios já criados não mudam.</p>
    <div class="grade">
      ${linha('Nome do responsável técnico', 'nome', 'largo')}
      ${linha('Título profissional', 'titulo')}
      ${linha('Registro (conselho)', 'registro')}
      ${linha('Cidade/UF', 'cidade')}
      ${linha('Fator de resolução (mm/pixel por metro)', 'fatorResolucao', 'decimal')}
      ${linha('Aeronave', 'aeronave', 'largo')}
      ${linha('Tipo de imagens', 'tipoImagens', 'largo')}
      ${linha('Cadastro SISANT/ANAC', 'sisant')}
      ${linha('Seguro RETA', 'reta')}
    </div>
    <div class="campo"><span class="rotulo">Logo do cabeçalho</span>
      <div class="logo-atual"><img id="p-logo" src="${h(p.logo || 'assets/logo.png')}" alt="Logo atual">
        <button type="button" class="botao pequeno" data-acao="trocar-logo">Trocar imagem</button>
        ${p.logo ? '<button type="button" class="botao pequeno discreto" data-acao="logo-padrao">Voltar ao logo do modelo</button>' : ''}
      </div></div>
    <div class="dialogo-pe">
      <button type="button" class="botao" data-acao="fechar-dialogo">Cancelar</button>
      <button class="botao destaque" value="sim">Salvar</button>
    </div>
  </form>`;
  d.returnValue = 'nao';
  d.showModal();
  d.addEventListener(
    'close',
    async () => {
      if (d.returnValue !== 'sim') {
        estado.perfil = antes;
        return;
      }
      const dados = Object.fromEntries(new FormData($('#form-perfil')));
      const fator = numero(dados.fatorResolucao);
      estado.perfil = { ...estado.perfil, ...dados, fatorResolucao: fator && fator > 0 ? fator : PERFIL_PADRAO.fatorResolucao };
      await store.salvarConfig('perfil', estado.perfil);
      avisar('Dados salvos.');
    },
    { once: true }
  );
}

// ---------- fotos ----------

async function receberFotos(arquivos) {
  const rel = estado.rel;
  if (!rel || !arquivos.length) return;
  const alvo = estado.alvoFoto || null;
  avisar(arquivos.length === 1 ? 'Processando 1 foto…' : `Processando ${arquivos.length} fotos…`);
  let falhas = 0;
  for (const arquivo of arquivos) {
    try {
      const tratada = await prepararFoto(arquivo);
      const foto = { id: uid(), relatorioId: rel.id, ...tratada };
      await store.salvarFoto(foto);
      estado.fotos.set(foto.id, foto);
      rel.fotos.push({ id: foto.id, legenda: '', anomaliaId: alvo });
    } catch (e) {
      console.error(e);
      falhas += 1;
    }
  }
  await salvarAgora();
  if (estado.rel === rel) desenharSecao();
  if (falhas) avisar(`${falhas} arquivo(s) não puderam ser lidos como imagem.`, true);
}

async function excluirFoto(id) {
  const rel = estado.rel;
  rel.fotos = rel.fotos.filter((f) => f.id !== id);
  estado.fotos.delete(id);
  liberarUrl(id);
  await store.excluirFoto(id);
  await salvarAgora();
  desenharSecao();
}

// ---------- emissão ----------

let fontesProntas = null;
function prepararPdf() {
  if (!fontesProntas) {
    fontesProntas = (async () => {
      await carregarScript('vendor/pdfmake.min.js');
      const nomes = [...new Set(Object.values(FONTES_PDF))];
      const arquivos = {};
      for (const nome of nomes) arquivos[nome] = paraBase64(await buscarBytes(`vendor/fonts/${nome}`));
      registrarFontes(window.pdfMake, arquivos);
    })().catch((e) => {
      fontesProntas = null;
      throw e;
    });
  }
  return fontesProntas;
}

async function logoAtual() {
  const p = estado.perfil;
  if (p.logo) return { dataUrl: p.logo, proporcao: p.logoProporcao || 3.17, personalizado: true };
  const bytes = await buscarBytes('assets/logo.png');
  return { dataUrl: `data:image/png;base64,${paraBase64(bytes)}`, proporcao: 900 / 284, personalizado: false };
}

async function gerarArquivo(formato) {
  const rel = estado.rel;
  const doc = montarDocumento(rel, { anexo: estado.incluirAnexo });
  const base = nomeArquivo(rel) + (estado.incluirAnexo ? '_com_Anexo_A' : '');
  const logo = await logoAtual();
  if (formato === 'docx') {
    await carregarScript('vendor/jszip.min.js');
    const modelo = await buscarBytes('assets/modelo-base.docx');
    const imagens = new Map([...estado.fotos].map(([id, f]) => [id, { bytes: new Uint8Array(f.dados), tipo: f.tipo, w: f.w, h: f.h }]));
    const opcoes = logo.personalizado ? { logo: { bytes: bytesDeDataUrl(logo.dataUrl), proporcao: logo.proporcao } } : {};
    const bytes = await gerarDocx(window.JSZip, modelo, doc, imagens, opcoes);
    return { blob: new Blob([bytes], { type: MIME_DOCX }), nome: `${base}.docx` };
  }
  await prepararPdf();
  const imagens = new Map([...estado.fotos].map(([id, f]) => [id, { dataUrl: paraDataUrl(f), w: f.w, h: f.h }]));
  const def = definicaoPdf(doc, imagens, logo);
  const blob = await new Promise((ok, erro) => {
    try {
      window.pdfMake.createPdf(def).getBlob(ok);
    } catch (e) {
      erro(e);
    }
  });
  return { blob, nome: `${base}.pdf` };
}

// Entrega o arquivo: pelo recurso de download do visualizador do Claude quando
// o app roda lá dentro; nos demais casos, download normal do navegador.
async function entregar(blob, nome) {
  let downloads = null;
  try {
    downloads = window.claude?.use ? await window.claude.use('downloads') : null;
  } catch {
    downloads = null;
  }
  if (downloads) {
    await downloads.save({ filename: nome, data: blob });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function emitir(formato, botao) {
  if (estado.ocupado) return;
  estado.ocupado = true;
  const original = botao.textContent;
  botao.disabled = true;
  botao.textContent = 'Gerando…';
  try {
    await salvarAgora();
    const { blob, nome } = await gerarArquivo(formato === 'docx' ? 'docx' : 'pdf');
    if (formato === 'compartilhar') {
      const arquivo = new File([blob], nome, { type: 'application/pdf' });
      try {
        await navigator.share({ files: [arquivo], title: nome });
      } catch (e) {
        if (e?.name !== 'NotAllowedError') throw e;
        // O navegador só abre o compartilhamento logo após o toque; se a geração demorou, baixa o arquivo.
        await entregar(blob, nome);
        avisar(`${nome} baixado. Compartilhe a partir dos seus downloads.`);
      }
    } else {
      await entregar(blob, nome);
      avisar(`${nome} gerado.`);
    }
  } catch (e) {
    if (e?.name === 'AbortError' || e?.code === 'declined') avisar('Envio cancelado.');
    else mostrarErro(e, 'Não foi possível gerar o arquivo');
  } finally {
    estado.ocupado = false;
    botao.disabled = false;
    botao.textContent = original;
  }
}

// ---------- cópia de segurança ----------

async function exportarCopia() {
  const relatorios = [];
  for (const rel of await store.listarRelatorios()) {
    const fotos = await store.obterFotos(rel.id);
    relatorios.push({ rel, fotos: fotos.map((f) => ({ id: f.id, tipo: f.tipo, w: f.w, h: f.h, b64: paraBase64(f.dados) })) });
  }
  const conteudo = JSON.stringify({ app: 'inspecao-predial', versao: 1, exportadoEm: new Date().toISOString(), perfil: estado.perfil, relatorios });
  await entregar(new Blob([conteudo], { type: 'application/json' }), `inspecoes_copia_${hojeISO()}.json`);
  avisar(`Cópia com ${relatorios.length} relatório(s) gerada.`);
}

async function importarCopia(arquivo) {
  const dados = JSON.parse(await arquivo.text());
  if (dados?.app !== 'inspecao-predial' || !Array.isArray(dados.relatorios)) throw new Error('o arquivo não é uma cópia deste app');
  for (const item of dados.relatorios) {
    if (!item?.rel?.id) continue;
    await store.salvarRelatorio(item.rel);
    for (const f of item.fotos || []) {
      await store.salvarFoto({ id: f.id, relatorioId: item.rel.id, tipo: f.tipo, w: f.w, h: f.h, dados: deBase64(f.b64).buffer });
    }
  }
  avisar(`${dados.relatorios.length} relatório(s) importado(s).`);
  await irParaLista({ historico: false });
}

// ---------- ações ----------

const acoes = {
  async novo() {
    const rel = novoRelatorio(estado.perfil, proximoNumero());
    await store.salvarRelatorio(rel);
    await abrirRelatorio(rel.id);
  },
  abrir: (el) => abrirRelatorio(el.dataset.id),
  'voltar-lista'() {
    // Volta pelo histórico quando possível, para o botão "voltar" do aparelho não reabrir o relatório.
    if (history.state?.rel) history.back();
    else return irParaLista();
  },
  async duplicar(el) {
    const origem = await store.obterRelatorio(el.dataset.id);
    const rel = novoRelatorio(estado.perfil, proximoNumero());
    Object.assign(rel.ident, origem.ident, { dataInspecao: hojeISO(), horaInicio: '', horaFim: '', trt: '' });
    rel.escopo = { ...origem.escopo };
    rel.equip = { ...origem.equip };
    rel.conform = { ...origem.conform, sarpas: '', comunicacao: '' };
    rel.procedimento = [...origem.procedimento];
    rel.limitacoes = [...origem.limitacoes];
    rel.caracterizacao = origem.caracterizacao;
    if (origem.exemplo) rel.exemplo = true;
    await store.salvarRelatorio(rel);
    await abrirRelatorio(rel.id);
    avisar('Dados do imóvel copiados. Anomalias e fotos começam em branco.');
  },
  async 'excluir-relatorio'(el) {
    const r = estado.lista.find((x) => x.id === el.dataset.id);
    const ok = await confirmar({
      titulo: 'Excluir relatório?',
      texto: `O relatório ${r?.numero || ''} (${r?.ident.cliente || 'sem cliente'}) e suas ${r?.fotos.length || 0} foto(s) serão apagados deste aparelho. Não dá para desfazer.`,
      botao: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    await store.excluirRelatorio(el.dataset.id);
    await irParaLista({ historico: false });
  },
  perfil: () => abrirPerfil(),
  'fechar-dialogo': () => $('#dialogo').close('nao'),
  exportar: () => exportarCopia(),
  importar: () => $('#seletor-copia').click(),
  'trocar-logo': () => $('#seletor-logo').click(),
  'logo-padrao'() {
    estado.perfil.logo = null;
    estado.perfil.logoProporcao = null;
    $('#p-logo').src = 'assets/logo.png';
  },

  ir(el) {
    estado.secao = el.dataset.secao;
    desenharSecao({ rolar: true });
  },
  'nova-anomalia'() {
    const a = novaAnomalia();
    estado.rel.anomalias.push(a);
    estado.abertas.add(a.id);
    agendarSalvar();
    desenharSecao();
    $(`.anomalia[data-id="${a.id}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    $(`.anomalia[data-id="${a.id}"] input`)?.focus({ preventScroll: true });
  },
  'mover-anomalia'(el) {
    const i = Number(el.dataset.i);
    const j = i + Number(el.dataset.d);
    const l = estado.rel.anomalias;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    agendarSalvar();
    desenharSecao();
  },
  async 'excluir-anomalia'(el) {
    const i = Number(el.dataset.i);
    const a = estado.rel.anomalias[i];
    const n = estado.rel.fotos.filter((f) => f.anomaliaId === a.id).length;
    const ok = await confirmar({
      titulo: `Excluir ${idAnomalia(i)}?`,
      texto: n ? `As ${n} foto(s) desta anomalia continuam no relatório, como vistas gerais. As anomalias seguintes são renumeradas.` : 'As anomalias seguintes são renumeradas.',
      botao: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    for (const f of estado.rel.fotos) if (f.anomaliaId === a.id) f.anomaliaId = null;
    estado.rel.anomalias.splice(i, 1);
    agendarSalvar();
    desenharSecao();
  },
  'adicionar-fotos'(el) {
    estado.alvoFoto = el.dataset.anomalia || null;
    $('#seletor-fotos').click();
  },
  'tirar-foto'(el) {
    estado.alvoFoto = el.dataset.anomalia || null;
    $('#seletor-camera').click();
  },
  'excluir-foto': (el) => excluirFoto(el.dataset.id),
  'adicionar-item'(el) {
    ler(estado.rel, el.dataset.caminho).push('');
    agendarSalvar();
    desenharSecao();
    const itens = document.querySelectorAll(`[data-campo^="${el.dataset.caminho}."]`);
    itens[itens.length - 1]?.focus();
  },
  'remover-item'(el) {
    ler(estado.rel, el.dataset.caminho).splice(Number(el.dataset.i), 1);
    agendarSalvar();
    desenharSecao();
  },
  'restaurar-lista'(el) {
    gravar(estado.rel, el.dataset.caminho, [...TEXTOS[el.dataset.caminho]]);
    agendarSalvar();
    desenharSecao();
  },
  'restaurar-escopo'() {
    estado.rel.escopo = { objetivo: TEXTOS.objetivo, incluido: TEXTOS.escopoIncluido, naoIncluido: TEXTOS.escopoNaoIncluido };
    agendarSalvar();
    desenharSecao();
  },
  'checklist-ok'() {
    linhasChecklist(estado.rel).forEach((l, i) => {
      if (!l.situacao) estado.rel.checklist[i] = 'OK';
    });
    agendarSalvar();
    desenharSecao();
  },
  'prevoo-sim'() {
    estado.rel.anexo.preVoo = PRE_VOO.map(() => 'Sim');
    agendarSalvar();
    desenharSecao();
  },
  'sugerir-resumo'() {
    estado.rel.conclusao.resumo = resumoSugerido(estado.rel);
    agendarSalvar();
    desenharSecao();
  },
  emitir: (el) => emitir(el.dataset.formato, el),
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-acao]');
  if (!el || el.disabled) return;
  Promise.resolve(acoes[el.dataset.acao]?.(el)).catch((erro) => mostrarErro(erro, 'Algo deu errado'));
});

// Guarda quais anomalias estão abertas para manter ao redesenhar.
document.addEventListener(
  'toggle',
  (e) => {
    const d = e.target;
    if (!d.classList?.contains('anomalia')) return;
    if (d.open) estado.abertas.add(d.dataset.id);
    else estado.abertas.delete(d.dataset.id);
  },
  true
);

function aoEditar(e) {
  const el = e.target;
  if (el.id === 'opcao-anexo') {
    estado.incluirAnexo = el.checked;
    desenharSecao();
    return;
  }
  const caminho = el.dataset?.campo;
  if (!caminho || !estado.rel) return;
  if (el.type === 'radio' && !el.checked) return;
  gravar(estado.rel, caminho, el.value === '' && caminho.endsWith('.anomaliaId') ? null : el.value);
  agendarSalvar();

  el.closest('.campo')?.classList.toggle('pendente', el.hasAttribute('data-obrig') && !el.value.trim());

  // Efeitos de um campo sobre outros.
  const m = /^anomalias\.(\d+)\.(\w+)$/.exec(caminho);
  if (m) {
    const i = Number(m[1]);
    const a = estado.rel.anomalias[i];
    if (m[2] === 'elemento') {
      const sugestao = sugerirItem(a.elemento);
      const seletor = $(`[data-campo="anomalias.${i}.item"]`);
      if (sugestao !== '' && seletor && (a.item === '' || a.itemSugerido)) {
        a.item = sugestao;
        a.itemSugerido = true;
        seletor.value = sugestao;
      }
    }
    if (m[2] === 'item') a.itemSugerido = false;
    if (m[2] === 'grau') {
      const selo = $(`[data-selo="${i}"]`);
      if (selo) {
        selo.className = `selo ${classeGrau(a.grau)}`;
        selo.textContent = a.grau;
      }
    }
    const resumo = $(`[data-resumo="${i}"]`);
    if (resumo) resumo.textContent = [a.local, a.elemento].filter(Boolean).join(' · ') || 'Nova anomalia';
  }
  if (caminho === 'equip.distanciaDetalhe') $('#resolucao').innerHTML = htmlResolucao();
  if (caminho === 'numero' || caminho === 'ident.cliente') $('#titulo-rel').textContent = tituloRel(estado.rel);
  if (/^checklist\./.test(caminho)) el.closest('.linha')?.classList.remove('sem-situacao');
  if (el.hasAttribute('data-estrutura')) {
    if (e.type === 'change') desenharSecao();
    return;
  }
  atualizarNavegacao();
}

app.addEventListener('input', aoEditar);
app.addEventListener('change', (e) => {
  // "input" já tratou texto; "change" cobre seletores, datas e escolhas.
  if (e.target.matches('select, input[type="radio"], input[type="checkbox"], input[type="date"], input[type="time"]')) aoEditar(e);
});

// Seletores de arquivo (ficam fora de #app para não serem redesenhados).
for (const id of ['seletor-fotos', 'seletor-camera']) {
  $('#' + id).addEventListener('change', (e) => {
    const arquivos = [...e.target.files];
    e.target.value = '';
    receberFotos(arquivos).catch((erro) => mostrarErro(erro, 'Não foi possível adicionar as fotos'));
  });
}
$('#seletor-copia').addEventListener('change', (e) => {
  const [arquivo] = e.target.files;
  e.target.value = '';
  if (arquivo) importarCopia(arquivo).catch((erro) => mostrarErro(erro, 'Não foi possível importar'));
});
$('#seletor-logo').addEventListener('change', async (e) => {
  const [arquivo] = e.target.files;
  e.target.value = '';
  if (!arquivo) return;
  try {
    const logo = await prepararLogo(arquivo);
    estado.perfil.logo = logo.dataUrl;
    estado.perfil.logoProporcao = logo.proporcao;
    const img = $('#p-logo');
    if (img) img.src = logo.dataUrl;
  } catch (erro) {
    mostrarErro(erro, 'Não foi possível usar essa imagem');
  }
});

// ---------- início ----------

async function criarExemplo() {
  const rel = relatorioExemplo(estado.perfil, `${new Date().getFullYear()}-000`);
  const fotos = [
    ['Vista geral (vertical)', '#b9785a', 'Vista geral da cobertura (vertical)', null],
    ['Vista oblíqua', '#8f9aa8', 'Vista oblíqua da cobertura', null],
    ['Detalhe A01', '#c08a6c', '', rel.anomalias[0].id],
    ['Detalhe A03', '#9aa3a0', '', rel.anomalias[2].id],
  ];
  for (const [rotulo, cor, legenda, anomaliaId] of fotos) {
    const foto = { id: uid(), relatorioId: rel.id, ...(await fotoExemplo(rotulo, cor)) };
    await store.salvarFoto(foto);
    rel.fotos.push({ id: foto.id, legenda, anomaliaId });
  }
  rel.conclusao.resumo = resumoSugerido(rel);
  await store.salvarRelatorio(rel);
}

async function iniciar() {
  try {
    estado.perfil = { ...PERFIL_PADRAO, ...((await store.obterConfig('perfil')) || {}) };
    if (!(await store.obterConfig('exemploCriado'))) {
      if (!(await store.listarRelatorios()).length) await criarExemplo();
      await store.salvarConfig('exemploCriado', true);
    }
    try {
      if (history.state?.rel) history.replaceState(null, '');
    } catch {
      /* sem histórico disponível */
    }
    await irParaLista({ historico: false });
  } catch (e) {
    console.error(e);
    app.innerHTML = `<p class="carregando">Não foi possível abrir o app: ${h(e?.message || e)}</p>`;
  }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.claude) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

iniciar();
