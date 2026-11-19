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
import { criarNuvem } from './nuvem.js';
import { criarSincronizador } from './sync.js';
import {
  prepararFoto,
  medirImagem,
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
  busca: '',
  filtro: 'todos', // todos | andamento | completos
  alvoFoto: null, // anomalia que vai receber as próximas fotos
  ocupado: false,
  conta: null, // { id, email, nome } de quem entrou
  membro: null, // { papel, aprovado } na equipe
  sinc: { situacao: 'parado', pendentes: 0, mensagem: '' },
};

const nuvem = criarNuvem({
  // Na abertura, sem dados guardados, avisa que o servidor está iniciando.
  aoEsperar: (n) => {
    const el = $('.carregando');
    if (el && n >= 2) el.textContent = 'Conectando ao servidor… o banco de dados está iniciando.';
  },
});
const sinc = criarSincronizador({
  store,
  nuvem,
  medir: medirImagem,
  aoEstado: (e) => {
    estado.sinc = e;
    mostrarSinc();
    if (e.situacao === 'sem-login' && estado.conta) estado.sessaoExpirada = true;
  },
  aoMudar: (ids) => aoMudarRemoto(ids).catch((e) => console.error(e)),
});

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

// Toque fora da janela (na área escurecida) fecha, como "Cancelar". O clique
// no fundo chega ao próprio <dialog>; dentro dele chega ao conteúdo.
$('#dialogo').addEventListener('click', (e) => {
  const d = e.currentTarget;
  if (e.target !== d || !d.open) return;
  const r = d.getBoundingClientRect();
  const dentro = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  if (!dentro) d.close('nao');
});

// Fecha o diálogo aberto e espera o evento "close", para o próximo diálogo
// não receber o fechamento do anterior.
function fecharDialogo() {
  const d = $('#dialogo');
  if (!d.open) return Promise.resolve();
  return new Promise((ok) => {
    d.addEventListener('close', () => ok(), { once: true });
    d.close('nao');
  });
}

// Diálogo de confirmação próprio (não depende de confirm() do navegador).
async function confirmar({ titulo, texto, botao = 'Confirmar', perigo = false }) {
  await fecharDialogo();
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
  rel.pendente = !rel.exemplo;
  gravando = gravando
    .then(() => store.salvarRelatorio(rel))
    .then(() => {
      const s = $('#situacao');
      if (s && estado.rel === rel) s.textContent = textoSituacao();
      if (!rel.exemplo && estado.conta) {
        sinc.atualizarContagem().catch(() => {});
        agendarSinc();
      }
    })
    .catch((e) => mostrarErro(e, 'Não foi possível salvar'));
  return gravando;
}

function textoSituacao() {
  const r = estado.rel;
  const hora = new Date(r.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${r.exemplo ? 'Exemplo, só neste aparelho · ' : ''}Salvo às ${hora}`;
}

// ---------- sincronização ----------

let temporizadorSinc = null;

function agendarSinc(atraso = 3000) {
  if (!estado.conta) return;
  clearTimeout(temporizadorSinc);
  temporizadorSinc = setTimeout(() => {
    temporizadorSinc = null;
    sinc.sincronizar();
  }, atraso);
}

function textoSinc() {
  const e = estado.sinc;
  const p = e.pendentes ? ` · ${e.pendentes} a enviar` : '';
  switch (e.situacao) {
    case 'sincronizando':
      return 'Sincronizando…';
    case 'ok':
      return e.pendentes ? `${e.pendentes} a enviar` : 'Sincronizado';
    case 'offline':
      return `Sem conexão${p}`;
    case 'sem-login':
      return 'Entrar de novo';
    case 'nao-aprovado':
      return 'Acesso suspenso';
    case 'erro':
      return `Erro ao sincronizar${p}`;
    default:
      return e.pendentes ? `${e.pendentes} a enviar` : 'Aguardando';
  }
}

// Indicador de sincronização. Aparece na barra lateral, na barra superior do
// celular e no editor; todos são atualizados juntos.
function htmlSinc(variante = 'lateral') {
  const e = estado.sinc;
  const texto = textoSinc();
  return `<button type="button" class="sinc sinc-${h(e.situacao)} sinc-${variante}" data-sinc="${variante}" data-acao="sincronizar" title="${h(e.mensagem || `${texto}. Toque para sincronizar agora.`)}"><span class="sinc-ponto" aria-hidden="true"></span><span class="sinc-texto">${h(texto)}</span></button>`;
}

function mostrarSinc() {
  document.querySelectorAll('[data-sinc]').forEach((el) => {
    el.outerHTML = htmlSinc(el.dataset.sinc);
  });
}

// Outro aparelho mudou relatórios: atualiza a tela sem perder o que está sendo digitado.
async function aoMudarRemoto(ids) {
  if (estado.tela === 'lista') {
    estado.lista = (await store.listarRelatorios()).filter((r) => !r.excluido);
    desenharLista();
    return;
  }
  if (estado.tela !== 'editor' || !estado.rel || !ids.has(estado.rel.id) || temporizador) return;
  const novo = await store.obterRelatorio(estado.rel.id);
  if (!novo || novo.excluido) {
    avisar('Este relatório foi excluído em outro aparelho.', true);
    await irParaLista({ historico: false });
    return;
  }
  if (novo.atualizadoEm === estado.rel.atualizadoEm) return;
  estado.rel = novo;
  estado.fotos = new Map((await store.obterFotos(novo.id)).map((f) => [f.id, f]));
  atualizarTitulo(novo);
  const situacao = $('#situacao');
  if (situacao) situacao.textContent = textoSituacao();
  desenharSecao();
  avisar('Relatório atualizado com alterações de outro aparelho.');
  baixarFotosDoRelatorio(novo);
}

// Baixa em segundo plano as fotos que outro aparelho enviou.
async function baixarFotosDoRelatorio(rel) {
  if (rel.exemplo || !estado.conta) return;
  try {
    const { baixadas } = await sinc.baixarFotos(rel);
    if (baixadas && estado.rel?.id === rel.id) {
      estado.fotos = new Map((await store.obterFotos(rel.id)).map((f) => [f.id, f]));
      desenharSecao();
    }
  } catch (e) {
    if (!e?.offline) console.warn('Fotos:', e);
  }
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

// Ícones de traço (24×24), desenhados para este app.
const ICONE = {
  relatorios: '<path d="M7 3.5h7l4.5 4.5v12.5H7z"/><path d="M14 3.5V8h4.5M10 12.5h5.5M10 16h5.5"/>',
  equipe: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.6-3.3 2.8-5.2 5.5-5.2s4.9 1.9 5.5 5.2"/><path d="M15.3 5.6a3 3 0 0 1 0 5.8M17.4 14.6c1.6.7 2.6 2.2 3 4.9"/>',
  perfil: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.7 3.6-5.6 7-5.6s6.2 1.9 7 5.6"/>',
  exportar: '<path d="M12 4v10.5M7.5 10 12 14.5 16.5 10M5 19.5h14"/>',
  importar: '<path d="M12 14.5V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>',
  sair: '<path d="M14 4.5h4.5v15H14M10 8l-4 4 4 4M6.5 12H16"/>',
  mais: '<path d="M5.5 12h.01M12 12h.01M18.5 12h.01"/>',
  voltar: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  busca: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  novo: '<path d="M12 5v14M5 12h14"/>',
  ok: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  abaixo: '<path d="m7 10 5 5 5-5"/>',
};
const icone = (nome, cls = '') =>
  `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONE[nome]}</svg>`;

function iniciais(nome, email) {
  const base = (nome || email || '?').trim();
  const partes = base.split(/[\s@.]+/).filter(Boolean);
  return ((partes[0]?.[0] || '?') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

const marcaHtml = (clara = false) =>
  `<div class="marca${clara ? ' marca-clara' : ''}"><img src="assets/marca-db.png" alt="DB" width="36" height="36"><span><strong>Inspeção de Cobertura</strong><small>Relatórios técnicos</small></span></div>`;

// Estrutura comum das telas principais: barra lateral (computador) ou barra superior (celular).
function casca(conteudo, ativo = 'relatorios') {
  const admin = estado.membro?.papel === 'admin';
  const item = (acao, nome, rotulo) =>
    `<button type="button" class="nav-item" data-acao="${acao}"${ativo === nome ? ' aria-current="page"' : ''}>${icone(nome)}<span>${rotulo}</span></button>`;
  const c = estado.conta || {};
  return `<div class="casca">
    <aside class="lateral" aria-label="Navegação principal">
      ${marcaHtml(true)}
      <nav class="nav">
        ${item('lista', 'relatorios', 'Relatórios')}
        ${admin ? item('equipe', 'equipe', 'Equipe') : ''}
        ${item('perfil', 'perfil', 'Meus dados')}
      </nav>
      <div class="nav nav-secundaria">
        <p class="nav-titulo">Cópia de segurança</p>
        ${item('exportar', 'exportar', 'Exportar')}
        ${item('importar', 'importar', 'Importar')}
      </div>
      <div class="lateral-pe">
        ${htmlSinc('lateral')}
        <div class="usuario">
          <span class="avatar" aria-hidden="true">${h(iniciais(c.nome, c.email))}</span>
          <span class="usuario-txt"><strong>${h(c.nome || 'Sem nome')}</strong><small>${h(c.email || '')}</small></span>
          <button type="button" class="botao-icone botao-icone-claro" data-acao="sair" aria-label="Sair deste aparelho" title="Sair deste aparelho">${icone('sair')}</button>
        </div>
      </div>
    </aside>
    <div class="principal">
      <header class="topo-movel">
        <button type="button" class="marca-botao" data-acao="menu-conta" aria-haspopup="dialog" aria-label="Abrir menu: Meus dados, equipe, cópia de segurança e sair">
          ${marcaHtml(true)}${icone('abaixo', 'marca-seta')}
        </button>
        ${htmlSinc('topo')}
      </header>
      <main class="conteudo">${conteudo}</main>
    </div>
  </div>`;
}

function contarPorSecao() {
  const c = {};
  for (const p of pendencias(estado.rel)) c[p.secao] = (c[p.secao] || 0) + 1;
  return c;
}

function htmlNavegacao() {
  const c = contarPorSecao();
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  const etapas = SECOES.filter((s) => s.id !== 'emitir');
  const completas = etapas.filter((s) => !c[s.id]).length;
  const pct = Math.round((completas / etapas.length) * 100);
  const progresso = `<div class="progresso">
      <div class="progresso-txt"><span>Preenchimento</span><span class="mono">${completas}/${etapas.length} seções</span></div>
      <div class="progresso-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Seções completas"><span style="width:${pct}%"></span></div>
    </div>`;
  const lista = SECOES.map((s) => {
    const n = s.id === 'emitir' ? total : c[s.id] || 0;
    const marca = s.id === 'emitir' ? icone('exportar') : n ? `<span class="mono">${s.num}</span>` : icone('ok');
    return `<button type="button" class="etapa${!n && s.id !== 'emitir' ? ' etapa-ok' : ''}${s.id === 'emitir' ? ' etapa-emitir' : ''}" data-acao="ir" data-secao="${s.id}"${s.id === estado.secao ? ' aria-current="step"' : ''}>
      <span class="etapa-marca">${marca}</span><span class="etapa-nome">${h(s.nome)}</span>${n ? `<span class="etapa-falta" title="${n} campo(s) a preencher">${n}</span>` : ''}</button>`;
  }).join('');
  return progresso + `<nav class="etapas-lista">${lista}</nav>`;
}

function htmlSeletorSecao() {
  const c = contarPorSecao();
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  return SECOES.map((s) => {
    const n = s.id === 'emitir' ? total : c[s.id] || 0;
    const rotulo = `${s.num ? s.num + '. ' : ''}${s.nome}${n ? ` · ${n} pendente${n === 1 ? '' : 's'}` : ''}`;
    return `<option value="${s.id}"${s.id === estado.secao ? ' selected' : ''}>${h(rotulo)}</option>`;
  }).join('');
}

function desenharSecao({ rolar = false } = {}) {
  const i = SECOES.findIndex((s) => s.id === estado.secao);
  const ant = SECOES[i - 1];
  const prox = SECOES[i + 1];
  $('#secao').innerHTML =
    telas[estado.secao]() +
    `<div class="passos">
      ${ant ? `<button type="button" class="botao" data-acao="ir" data-secao="${ant.id}">${icone('voltar')}<span>${h(ant.nome)}</span></button>` : '<span></span>'}
      ${prox ? `<button type="button" class="botao destaque" data-acao="ir" data-secao="${prox.id}"><span>${prox.id === 'emitir' ? 'Revisar e emitir' : 'Próxima: ' + h(prox.nome)}</span></button>` : ''}
    </div>`;
  atualizarNavegacao();
  if (rolar) window.scrollTo({ top: 0 });
}

function atualizarNavegacao() {
  const nav = $('.etapas');
  if (nav) nav.innerHTML = htmlNavegacao();
  const sel = $('#seletor-secao');
  if (sel) sel.innerHTML = htmlSeletorSecao();
}

function atualizarTitulo(rel) {
  const t = $('#titulo-rel');
  if (t) t.textContent = rel.ident.cliente || 'Cliente não informado';
  const n = $('#numero-rel');
  if (n) n.textContent = rel.numero || 'Sem número';
}

function desenharEditor() {
  const rel = estado.rel;
  app.innerHTML = `<div class="editor-casca">
    <header class="editor-topo">
      <button type="button" class="botao-icone" data-acao="voltar-lista" aria-label="Voltar para Relatórios">${icone('voltar')}</button>
      <div class="editor-titulo">
        <div class="trilha"><button type="button" data-acao="voltar-lista">Relatórios</button><span aria-hidden="true">/</span><span class="mono" id="numero-rel">${h(rel.numero || 'Sem número')}</span>${rel.exemplo ? '<span class="etiqueta">Exemplo</span>' : ''}</div>
        <strong id="titulo-rel">${h(rel.ident.cliente || 'Cliente não informado')}</strong>
      </div>
      <span class="editor-salvo" id="situacao">${h(textoSituacao())}</span>
      ${rel.exemplo ? '' : htmlSinc('editor')}
      <button type="button" class="botao destaque editor-emitir" data-acao="ir" data-secao="emitir">Emitir</button>
    </header>
    <div class="editor-corpo">
      <aside class="etapas" aria-label="Seções do relatório"></aside>
      <div class="seletor-secao"><label for="seletor-secao" class="visualmente-oculto">Seção do relatório</label><select id="seletor-secao"></select></div>
      <section class="secao" id="secao"></section>
    </div>
  </div>`;
  desenharSecao({ rolar: true });
}

const tituloRel = (rel) => `${rel.numero || 'Sem número'} · ${rel.ident.cliente || 'Cliente não informado'}`;

const semAcento = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function situacaoRel(r) {
  const p = pendencias(r).length;
  return { pendencias: p, completo: p === 0 };
}

function relatoriosFiltrados() {
  const termo = semAcento(estado.busca).trim();
  return estado.lista.filter((r) => {
    const { completo } = situacaoRel(r);
    if (estado.filtro === 'andamento' && completo) return false;
    if (estado.filtro === 'completos' && !completo) return false;
    if (!termo) return true;
    return [r.numero, r.ident.cliente, r.ident.endereco, r.ident.representante].some((v) => semAcento(v).includes(termo));
  });
}

function htmlGraus(r) {
  const c = contarGraus(r);
  const itens = [
    ['Crítico', 'g-critico'],
    ['Médio', 'g-medio'],
    ['Mínimo', 'g-minimo'],
    ['Observação', 'g-observacao'],
  ]
    .filter(([g]) => c[g])
    .map(([g, cls]) => `<span class="grau ${cls}" title="${c[g]} ${g.toLowerCase()}">${c[g]}<span class="visualmente-oculto"> ${g}</span></span>`)
    .join('');
  return itens ? `<span class="graus">${itens}</span>` : '<span class="mudo">Nenhuma</span>';
}

function htmlLinhas() {
  const lista = relatoriosFiltrados();
  if (!lista.length) {
    const msg = estado.lista.length
      ? 'Nenhum relatório corresponde à busca ou ao filtro.'
      : 'Nenhum relatório ainda. Use "Novo relatório" para começar uma inspeção.';
    return `<tr class="linha-vazia"><td colspan="7">${msg}</td></tr>`;
  }
  return lista
    .map((r) => {
      const { pendencias: p, completo } = situacaoRel(r);
      const situacao = completo
        ? '<span class="status status-ok">Completo</span>'
        : `<span class="status status-falta">${p} pendência${p === 1 ? '' : 's'}</span>`;
      const marcas = [
        r.exemplo ? '<span class="etiqueta" title="O exemplo fica só neste aparelho">Exemplo</span>' : '',
        r.pendente && !r.exemplo ? '<span class="etiqueta etiqueta-envio">A enviar</span>' : '',
      ].join('');
      return `<tr data-acao="abrir" data-id="${h(r.id)}">
        <td class="c-num"><span class="mono">${h(r.numero || '—')}</span></td>
        <td class="c-cliente"><button type="button" class="link-linha" data-acao="abrir" data-id="${h(r.id)}">${h(r.ident.cliente || 'Cliente não informado')}</button><span class="mudo c-endereco">${h(r.ident.endereco || 'Endereço não informado')}</span></td>
        <td class="c-data"><span class="mono">${h(formatarData(r.ident.dataInspecao) || '—')}</span></td>
        <td class="c-anom">${htmlGraus(r)}</td>
        <td class="c-fotos"><span class="mono">${r.fotos.length}</span></td>
        <td class="c-situacao">${situacao}${marcas}</td>
        <td class="c-acoes">
          <details class="menu-linha">
            <summary data-acao="nada" aria-label="Ações do relatório ${h(r.numero || '')}">${icone('mais')}</summary>
            <div class="menu-pop" role="menu">
              <button type="button" role="menuitem" data-acao="abrir" data-id="${h(r.id)}">Abrir</button>
              <button type="button" role="menuitem" data-acao="duplicar" data-id="${h(r.id)}">Nova inspeção deste imóvel</button>
              <button type="button" role="menuitem" class="perigo" data-acao="excluir-relatorio" data-id="${h(r.id)}">Excluir</button>
            </div>
          </details>
        </td>
      </tr>`;
    })
    .join('');
}

function htmlFiltros() {
  const n = { todos: estado.lista.length, andamento: 0, completos: 0 };
  for (const r of estado.lista) n[situacaoRel(r).completo ? 'completos' : 'andamento'] += 1;
  return [
    ['todos', 'Todos'],
    ['andamento', 'Em preenchimento'],
    ['completos', 'Completos'],
  ]
    .map(
      ([id, rotulo]) =>
        `<button type="button" class="segmento" data-acao="filtrar" data-filtro="${id}" aria-pressed="${estado.filtro === id}">${rotulo}<span class="mono">${n[id]}</span></button>`
    )
    .join('');
}

function desenharLista() {
  const total = estado.lista.length;
  const aEnviar = estado.lista.filter((r) => r.pendente && !r.exemplo).length;
  const avisos = [
    store.persistente() ? '' : '<div class="aviso-faixa">Este navegador não deixou guardar dados no aparelho. Os relatórios ficam só até fechar a página.</div>',
    estado.sessaoExpirada
      ? '<div class="aviso-faixa">Sua sessão expirou. As alterações continuam guardadas neste aparelho. <button type="button" class="botao pequeno" data-acao="entrar-de-novo">Entrar de novo</button></div>'
      : '',
  ].join('');
  app.innerHTML = casca(`
    <div class="pagina-topo">
      <div>
        <h1>Relatórios</h1>
        <p class="sub">${total ? `${total} relatório${total === 1 ? '' : 's'} da equipe` : 'Nenhum relatório ainda'}${aEnviar ? ` · ${aEnviar} a enviar` : ''}</p>
      </div>
      <button type="button" class="botao destaque" data-acao="novo">${icone('novo')}<span>Novo relatório</span></button>
    </div>
    ${avisos}
    <div class="ferramentas">
      <label class="busca">${icone('busca')}<span class="visualmente-oculto">Buscar relatórios</span>
        <input id="busca" type="search" placeholder="Buscar por número, cliente ou endereço" value="${h(estado.busca)}" autocomplete="off"></label>
      <div class="segmentos" role="group" aria-label="Filtrar relatórios" id="filtros">${htmlFiltros()}</div>
    </div>
    <div class="tabela-caixa">
      <table class="tabela">
        <thead><tr>
          <th scope="col" class="c-num">Nº</th><th scope="col" class="c-cliente">Cliente e endereço</th><th scope="col" class="c-data">Inspeção</th>
          <th scope="col" class="c-anom">Anomalias</th><th scope="col" class="c-fotos">Fotos</th><th scope="col" class="c-situacao">Situação</th><th scope="col" class="c-acoes"><span class="visualmente-oculto">Ações</span></th>
        </tr></thead>
        <tbody id="lista-corpo">${htmlLinhas()}</tbody>
      </table>
    </div>
    <p class="nota">Os relatórios ficam no banco de dados da equipe e também neste aparelho, para funcionar sem internet. Sem conexão, as alterações esperam aqui e são enviadas quando a internet voltar.</p>`);
}

async function irParaLista({ historico = true } = {}) {
  if (temporizador) await salvarAgora();
  estado.rel = null;
  estado.fotos = new Map();
  estado.tela = 'lista';
  estado.lista = (await store.listarRelatorios()).filter((r) => !r.excluido);
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
  if ((rel.fotos || []).some((f) => !estado.fotos.has(f.id))) baixarFotosDoRelatorio(rel);
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

async function abrirPerfil() {
  await fecharDialogo();
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
      await store.salvarConfig('perfilPendente', true);
      agendarSinc(500);
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
      const foto = { id: uid(), relatorioId: rel.id, ...tratada, enviada: rel.exemplo ? null : false };
      await store.salvarFoto(foto);
      estado.fotos.set(foto.id, foto);
      rel.fotos.push({ id: foto.id, legenda: '', anomaliaId: alvo, w: foto.w, h: foto.h });
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
  const local = estado.fotos.get(id);
  estado.fotos.delete(id);
  liberarUrl(id);
  await store.excluirFoto(id);
  // Só fotos que já foram para o servidor precisam ser apagadas lá.
  if (!rel.exemplo && local?.enviada !== false) await enfileirarApagarFotos(rel.id, [id]);
  await salvarAgora();
  desenharSecao();
}

async function enfileirarApagarFotos(relatorioId, ids) {
  if (!ids.length) return;
  const fila = (await store.obterConfig('fotosApagar')) || [];
  for (const fotoId of ids) if (!fila.some((x) => x.fotoId === fotoId)) fila.push({ relatorioId, fotoId });
  await store.salvarConfig('fotosApagar', fila);
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

async function garantirFotos(rel) {
  const faltando = () => (rel.fotos || []).filter((f) => !estado.fotos.has(f.id)).length;
  if (!faltando()) return;
  if (!rel.exemplo && estado.conta) {
    try {
      await sinc.baixarFotos(rel);
    } catch (e) {
      if (!e?.offline) throw e;
    }
    estado.fotos = new Map((await store.obterFotos(rel.id)).map((f) => [f.id, f]));
  }
  const n = faltando();
  if (n) throw new Error(`${n} foto(s) deste relatório ainda não foram baixadas para este aparelho. Conecte-se à internet e tente de novo.`);
}

async function gerarArquivo(formato) {
  const rel = estado.rel;
  await garantirFotos(rel);
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
    const rel = { ...item.rel, pendente: !item.rel.exemplo, excluido: false };
    await store.salvarRelatorio(rel);
    for (const f of item.fotos || []) {
      await store.salvarFoto({ id: f.id, relatorioId: rel.id, tipo: f.tipo, w: f.w, h: f.h, dados: deBase64(f.b64).buffer, enviada: rel.exemplo ? null : false });
    }
  }
  avisar(`${dados.relatorios.length} relatório(s) importado(s).`);
  await irParaLista({ historico: false });
  agendarSinc(500);
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
      texto: r?.exemplo
        ? 'O relatório de exemplo será apagado deste aparelho.'
        : `O relatório ${r?.numero || ''} (${r?.ident.cliente || 'sem cliente'}) e suas ${r?.fotos.length || 0} foto(s) serão apagados para toda a equipe. Não dá para desfazer.`,
      botao: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    const id = el.dataset.id;
    if (r?.exemplo) {
      await store.excluirRelatorio(id);
    } else {
      const fotos = await store.obterFotos(id);
      const noServidor = new Set((r?.fotos || []).map((f) => f.id));
      for (const f of fotos) if (f.enviada === false) noServidor.delete(f.id);
      await enfileirarApagarFotos(id, [...noServidor]);
      for (const f of fotos) {
        liberarUrl(f.id);
        await store.excluirFoto(f.id);
      }
      // Fica marcado como excluído até o servidor confirmar.
      await store.atualizarRelatorio(id, (x) => (x ? { ...x, excluido: true, pendente: true, atualizadoEm: Date.now() } : undefined));
      agendarSinc(300);
    }
    await irParaLista({ historico: false });
  },
  perfil: () => abrirPerfil(),
  'menu-conta': () => abrirMenuConta(),
  lista() {
    if (estado.tela === 'lista') return;
    return irParaLista();
  },
  filtrar(el) {
    estado.filtro = el.dataset.filtro;
    $('#filtros').innerHTML = htmlFiltros();
    $('#lista-corpo').innerHTML = htmlLinhas();
  },
  nada() {},
  equipe: () => abrirEquipe(),
  membro: (el) => alterarMembro(el),
  sair: () => sair(),
  sincronizar() {
    if (estado.sinc.situacao === 'sem-login') return acoes['entrar-de-novo']();
    return sinc.sincronizar();
  },
  'entrar-de-novo'() {
    telaConta.modo = 'entrar';
    telaConta.email = estado.conta?.email || '';
    telaConta.mensagem = 'Suas alterações continuam guardadas neste aparelho.';
    desenharLogin();
  },
  'modo-conta'(el) {
    telaConta.modo = el.dataset.modo;
    telaConta.erro = '';
    telaConta.mensagem = '';
    desenharLogin();
  },
  async 'verificar-aprovacao'() {
    try {
      await aposEntrar();
    } catch (e) {
      mostrarErro(e, 'Não foi possível verificar');
    }
  },
  recarregar: () => location.reload(),
  'fechar-dialogo': () => $('#dialogo').close('nao'),
  async exportar() {
    await fecharDialogo();
    return exportarCopia();
  },
  importar() {
    // O seletor de arquivo precisa abrir no mesmo toque, antes de qualquer espera.
    $('#seletor-copia').click();
    fecharDialogo();
  },
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
  for (const menu of document.querySelectorAll('details.menu-linha[open]')) {
    if (!menu.contains(e.target) || e.target.closest('.menu-pop button')) menu.open = false;
  }
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
  if (el.id === 'busca') {
    estado.busca = el.value;
    $('#lista-corpo').innerHTML = htmlLinhas();
    return;
  }
  if (el.id === 'seletor-secao') {
    if (e.type !== 'change') return;
    estado.secao = el.value;
    desenharSecao({ rolar: true });
    return;
  }
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
  if (caminho === 'numero' || caminho === 'ident.cliente') atualizarTitulo(estado.rel);
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

// Junta o perfil salvo com o padrão; campo salvo vazio não apaga o padrão
// (ex.: cadastro do drone atualizado depois que a pessoa salvou "Meus dados").
function comPadrao(salvo) {
  const p = { ...PERFIL_PADRAO };
  for (const [k, v] of Object.entries(salvo || {})) {
    if (v === '' && typeof PERFIL_PADRAO[k] === 'string' && PERFIL_PADRAO[k]) continue;
    p[k] = v;
  }
  return p;
}

// ---------- conta e equipe ----------

const telaConta = { modo: 'entrar', email: '', mensagem: '', erro: '' };

function desenharLogin() {
  estado.tela = 'login';
  const t = telaConta;
  const campo = (id, rotulo, tipo, extra = '') =>
    `<div class="campo"><label for="${id}">${rotulo}</label><input id="${id}" name="${id}" type="${tipo}" ${extra}></div>`;
  const abas = [
    ['entrar', 'Entrar'],
    ['cadastrar', 'Criar conta'],
  ]
    .map(([m, r]) => `<button type="button" role="tab" aria-selected="${t.modo === m}" data-acao="modo-conta" data-modo="${m}">${r}</button>`)
    .join('');
  let corpo;
  if (t.modo === 'cadastrar') {
    corpo = `${campo('conta-nome', 'Seu nome', 'text', 'autocomplete="name" required')}
      ${campo('conta-email', 'E-mail', 'email', `autocomplete="email" required value="${h(t.email)}"`)}
      ${campo('conta-senha', 'Senha', 'password', 'autocomplete="new-password" minlength="8" required')}
      <p class="dica">Pelo menos 8 caracteres. A primeira conta criada vira administradora da equipe; as seguintes precisam ser aprovadas por ela.</p>
      <button class="botao destaque" type="submit">Criar conta</button>`;
  } else if (t.modo === 'esqueci') {
    corpo = `<p class="dica">Enviaremos um código de 6 dígitos para o seu e-mail.</p>
      ${campo('conta-email', 'E-mail', 'email', `autocomplete="email" required value="${h(t.email)}"`)}
      <button class="botao destaque" type="submit">Enviar código</button>
      <button type="button" class="botao discreto" data-acao="modo-conta" data-modo="entrar">Voltar</button>`;
  } else if (t.modo === 'codigo') {
    corpo = `<p class="dica">Digite o código enviado para ${h(t.email)} e a nova senha.</p>
      ${campo('conta-codigo', 'Código', 'text', 'inputmode="numeric" autocomplete="one-time-code" required maxlength="6"')}
      ${campo('conta-senha', 'Nova senha', 'password', 'autocomplete="new-password" minlength="8" required')}
      <button class="botao destaque" type="submit">Trocar senha e entrar</button>
      <button type="button" class="botao discreto" data-acao="modo-conta" data-modo="esqueci">Pedir outro código</button>`;
  } else {
    corpo = `${campo('conta-email', 'E-mail', 'email', `autocomplete="email" required value="${h(t.email)}"`)}
      ${campo('conta-senha', 'Senha', 'password', 'autocomplete="current-password" required')}
      <button class="botao destaque" type="submit">Entrar</button>
      <button type="button" class="botao discreto" data-acao="modo-conta" data-modo="esqueci">Esqueci a senha</button>`;
  }
  const titulo = { entrar: 'Acesse sua conta', cadastrar: 'Acesse sua conta', esqueci: 'Recuperar senha', codigo: 'Definir nova senha' }[t.modo];
  app.innerHTML = telaAcesso(`
      <h2>${titulo}</h2>
      ${t.modo === 'entrar' || t.modo === 'cadastrar' ? `<div class="abas" role="tablist" aria-label="Acesso">${abas}</div>` : ''}
      ${t.erro ? `<p class="conta-erro" role="alert">${h(t.erro)}</p>` : ''}
      ${t.mensagem ? `<p class="conta-msg" role="status">${h(t.mensagem)}</p>` : ''}
      <form id="form-conta" class="conta-form" novalidate>${corpo}</form>`);
  $('#form-conta input')?.focus();
}

async function enviarFormConta(form) {
  const t = telaConta;
  const v = (id) => (form.querySelector('#' + id)?.value || '').trim();
  const senha = form.querySelector('#conta-senha')?.value || '';
  t.erro = '';
  t.mensagem = '';
  const botao = form.querySelector('button[type="submit"]');
  botao.disabled = true;
  try {
    if (t.modo === 'cadastrar') {
      if (!v('conta-nome')) throw new Error('Informe seu nome.');
      if (senha.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
      t.email = v('conta-email');
      await nuvem.cadastrar(v('conta-nome'), t.email, senha);
      await aposEntrar();
    } else if (t.modo === 'esqueci') {
      t.email = v('conta-email');
      if (!t.email) throw new Error('Informe o e-mail.');
      await nuvem.enviarCodigoSenha(t.email);
      t.modo = 'codigo';
      t.mensagem = 'Código enviado. Veja sua caixa de entrada e o spam.';
      desenharLogin();
    } else if (t.modo === 'codigo') {
      if (senha.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
      await nuvem.redefinirSenha(t.email, v('conta-codigo'), senha);
      await nuvem.entrar(t.email, senha);
      await aposEntrar();
    } else {
      t.email = v('conta-email');
      if (!t.email || !senha) throw new Error('Informe e-mail e senha.');
      await nuvem.entrar(t.email, senha);
      await aposEntrar();
    }
  } catch (e) {
    t.erro = e?.offline ? 'Sem conexão. Para entrar pela primeira vez neste aparelho é preciso internet.' : e?.message || String(e);
    desenharLogin();
  }
}

// Depois do login: registra na equipe e decide a próxima tela.
async function aposEntrar() {
  const s = await nuvem.sessao();
  if (!s) throw new Error('O login não foi concluído. Tente de novo.');
  const anterior = await store.obterConfig('conta');
  estado.conta = { id: s.user.id, email: s.user.email, nome: s.user.name || '' };
  if (anterior && anterior.id !== estado.conta.id) {
    // Outra pessoa neste aparelho: não mistura o perfil e a fila de envio.
    await store.salvarConfig('perfil', null);
    await store.salvarConfig('perfilPendente', false);
  }
  await store.salvarConfig('conta', estado.conta);
  estado.sessaoExpirada = false;
  const membro = await nuvem.membro();
  estado.membro = { papel: membro.papel, aprovado: membro.aprovado };
  await store.salvarConfig('membro', estado.membro);
  if (!membro.aprovado) {
    desenharAguardando();
    return;
  }
  await carregarPerfil();
  await abrirApp();
}

async function carregarPerfil() {
  try {
    if (await store.obterConfig('perfilPendente')) return;
    const remoto = await nuvem.meuPerfil();
    if (remoto && Object.keys(remoto).length) {
      estado.perfil = comPadrao(remoto);
      await store.salvarConfig('perfil', estado.perfil);
    } else {
      const local = await store.obterConfig('perfil');
      estado.perfil = comPadrao(local);
      if (local) {
        await store.salvarConfig('perfilPendente', true);
      }
    }
  } catch (e) {
    if (!e?.offline) console.warn('Perfil:', e);
  }
}

function desenharAguardando() {
  estado.tela = 'aguardando';
  app.innerHTML = telaAcesso(`
        <h2>Aguardando aprovação</h2>
        <p>Sua conta <strong>${h(estado.conta?.email)}</strong> foi criada. Um administrador da equipe precisa liberar o acesso no app, em <em>Conta &gt; Equipe</em>.</p>
        <div class="acoes">
          <button type="button" class="botao destaque" data-acao="verificar-aprovacao">Verificar de novo</button>
          <button type="button" class="botao" data-acao="sair">Sair</button>
        </div>`);
}

// Planta de cobertura em quatro águas com a rota do drone e anomalias marcadas.
const DESENHO_COBERTURA = `<svg class="acesso-desenho" viewBox="0 0 420 270" aria-hidden="true" focusable="false">
  <g class="d-grade">${Array.from({ length: 13 }, (_, i) => `<path d="M${15 + i * 32.5} 5v260"/>`).join('')}${Array.from({ length: 9 }, (_, i) => `<path d="M5 ${12 + i * 31}h410"/>`).join('')}</g>
  <g class="d-telhado">
    <rect x="50" y="45" width="320" height="180"/>
    <path d="M50 45 140 135M370 45 280 135M50 225 140 135M370 225 280 135M140 135h140"/>
    <rect x="300" y="160" width="40" height="34"/>
  </g>
  <path class="d-rota" d="M30 30h360v40H30v40h360v40H30v40h360v40H30"/>
  <g class="d-ponto"><circle cx="100" cy="70" r="9"/><text x="114" y="66">A01</text></g>
  <g class="d-ponto"><circle cx="250" cy="200" r="9"/><text x="264" y="196">A02</text></g>
  <g class="d-ponto d-critico"><circle cx="330" cy="110" r="9"/><text x="344" y="106">A03</text></g>
  <text class="d-cota" x="50" y="252">32,0 × 18,0 m</text>
</svg>`;

function telaAcesso(conteudo) {
  return `<div class="acesso">
    <section class="acesso-marca">
      ${marcaHtml(true)}
      <div class="acesso-texto">
        <p class="sobretitulo">Inspeção visual com drone</p>
        <h1>Registre em campo.<br>Emita no escritório.</h1>
        <ul class="acesso-lista">
          <li>Funciona sem internet na cobertura</li>
          <li>Anomalias, fotos e checklist numerados automaticamente</li>
          <li>DOCX e PDF no padrão do seu modelo de relatório</li>
        </ul>
      </div>
      ${DESENHO_COBERTURA}
    </section>
    <main class="acesso-form">
      <div class="acesso-topo-movel">${marcaHtml()}</div>
      <section class="conta">${conteudo}</section>
    </main>
  </div>`;
}

async function abrirMenuConta() {
  await fecharDialogo();
  const d = $('#dialogo');
  const admin = estado.membro?.papel === 'admin';
  d.innerHTML = `<form method="dialog" class="dialogo-corpo">
    <h2>Conta</h2>
    <p>${h(estado.conta?.nome || '')}${estado.conta?.nome ? '<br>' : ''}${h(estado.conta?.email || 'Sem login')}${admin ? '<br><span class="selo">Administrador</span>' : ''}</p>
    <div class="menu-conta">
      <button type="button" class="botao" data-acao="perfil">Meus dados</button>
      ${admin ? '<button type="button" class="botao" data-acao="equipe">Equipe</button>' : ''}
      <button type="button" class="botao" data-acao="exportar">Exportar cópia</button>
      <button type="button" class="botao" data-acao="importar">Importar cópia</button>
      <button type="button" class="botao perigo" data-acao="sair">Sair deste aparelho</button>
    </div>
    <div class="dialogo-pe"><button type="button" class="botao" data-acao="fechar-dialogo">Fechar</button></div>
  </form>`;
  d.showModal();
}

async function abrirEquipe() {
  const d = $('#dialogo');
  d.innerHTML = '<div class="dialogo-corpo"><h2>Equipe</h2><p>Carregando…</p></div>';
  if (!d.open) d.showModal();
  let membros;
  try {
    membros = await nuvem.equipe();
  } catch (e) {
    d.innerHTML = `<div class="dialogo-corpo"><h2>Equipe</h2><p>${h(e.offline ? 'Sem conexão. A equipe só pode ser alterada com internet.' : e.message)}</p>
      <div class="dialogo-pe"><button type="button" class="botao" data-acao="fechar-dialogo">Fechar</button></div></div>`;
    return;
  }
  const linhas = membros
    .map((m) => {
      const eu = m.user_id === estado.conta?.id;
      const botoes = [];
      if (!m.aprovado) botoes.push(`<button type="button" class="botao pequeno destaque" data-acao="membro" data-id="${h(m.user_id)}" data-op="aprovar">Aprovar</button>`);
      if (m.aprovado && !eu) {
        botoes.push(
          m.papel === 'admin'
            ? `<button type="button" class="botao pequeno" data-acao="membro" data-id="${h(m.user_id)}" data-op="tecnico">Tirar de administrador</button>`
            : `<button type="button" class="botao pequeno" data-acao="membro" data-id="${h(m.user_id)}" data-op="admin">Tornar administrador</button>`
        );
        botoes.push(`<button type="button" class="botao pequeno" data-acao="membro" data-id="${h(m.user_id)}" data-op="suspender">Suspender</button>`);
      }
      if (!eu) botoes.push(`<button type="button" class="botao pequeno discreto perigo" data-acao="membro" data-id="${h(m.user_id)}" data-op="remover">Remover</button>`);
      return `<li class="membro">
        <div><strong>${h(m.nome || m.email)}</strong>${eu ? ' <span class="selo">Você</span>' : ''}<br><span class="dica">${h(m.email)}</span></div>
        <div class="membro-situacao">${m.aprovado ? `<span class="selo ${m.papel === 'admin' ? '' : 'g-minimo'}">${m.papel === 'admin' ? 'Administrador' : 'Técnico'}</span>` : '<span class="selo g-sem">Aguardando aprovação</span>'}</div>
        <div class="acoes">${botoes.join('')}</div>
      </li>`;
    })
    .join('');
  d.innerHTML = `<div class="dialogo-corpo">
    <h2>Equipe</h2>
    <p>Para incluir alguém, peça que abra o app e toque em "Criar conta". A pessoa aparece aqui para você aprovar. Todos os aprovados veem e editam os relatórios da equipe.</p>
    <ul class="membros">${linhas}</ul>
    <div class="dialogo-pe"><button type="button" class="botao" data-acao="fechar-dialogo">Fechar</button></div>
  </div>`;
}

async function alterarMembro(el) {
  const { id, op } = el.dataset;
  if (op === 'remover') {
    const ok = await confirmarNoDialogo('Remover da equipe?', 'A pessoa perde o acesso aos relatórios. Para voltar, ela precisa ser aprovada de novo.');
    if (!ok) return abrirEquipe();
    await nuvem.removerMembro(id);
  } else if (op === 'aprovar') await nuvem.atualizarMembro(id, null, true);
  else if (op === 'suspender') await nuvem.atualizarMembro(id, null, false);
  else if (op === 'admin') await nuvem.atualizarMembro(id, 'admin', null);
  else if (op === 'tecnico') await nuvem.atualizarMembro(id, 'tecnico', null);
  await abrirEquipe();
}

// Confirmação dentro do diálogo já aberto (não dá para abrir um segundo).
function confirmarNoDialogo(titulo, texto) {
  const d = $('#dialogo');
  d.innerHTML = `<div class="dialogo-corpo"><h2>${h(titulo)}</h2><p>${h(texto)}</p>
    <div class="dialogo-pe"><button type="button" class="botao" data-resposta="nao">Cancelar</button><button type="button" class="botao destaque perigo" data-resposta="sim">Confirmar</button></div></div>`;
  return new Promise((ok) => {
    const responder = (sim) => {
      d.removeEventListener('click', clique);
      d.removeEventListener('close', fechou);
      ok(sim);
    };
    const clique = (e) => {
      const b = e.target.closest('[data-resposta]');
      if (b) responder(b.dataset.resposta === 'sim');
    };
    const fechou = () => responder(false); // toque fora ou Esc
    d.addEventListener('click', clique);
    d.addEventListener('close', fechou);
  });
}

async function sair() {
  await sinc.atualizarContagem().catch(() => {});
  const pendentes = estado.sinc.pendentes;
  const ok = await confirmar({
    titulo: 'Sair deste aparelho?',
    texto: pendentes
      ? `Há ${pendentes} alteração(ões) que ainda não foram enviadas e serão perdidas. Conecte-se à internet e espere "Sincronizado" para não perder nada.`
      : 'Os relatórios continuam no banco da equipe. Neste aparelho, a cópia local é apagada.',
    botao: pendentes ? 'Sair e perder alterações' : 'Sair',
    perigo: !!pendentes,
  });
  if (!ok) return;
  try {
    await nuvem.sair();
  } catch (e) {
    console.warn(e);
  }
  await store.apagarTudo();
  estado.conta = null;
  estado.membro = null;
  estado.rel = null;
  estado.lista = [];
  estado.perfil = { ...PERFIL_PADRAO };
  estado.sinc = { situacao: 'parado', pendentes: 0, mensagem: '' };
  telaConta.modo = 'entrar';
  telaConta.erro = '';
  telaConta.mensagem = 'Você saiu.';
  desenharLogin();
}

async function abrirApp() {
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
  await retomarAposAtualizacao();
  await sinc.atualizarContagem().catch(() => {});
  sinc.sincronizar();
}

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
    const foto = { id: uid(), relatorioId: rel.id, ...(await fotoExemplo(rotulo, cor)), enviada: null };
    await store.salvarFoto(foto);
    rel.fotos.push({ id: foto.id, legenda, anomaliaId, w: foto.w, h: foto.h });
  }
  rel.conclusao.resumo = resumoSugerido(rel);
  await store.salvarRelatorio(rel);
}

async function iniciar() {
  try {
    estado.perfil = comPadrao(await store.obterConfig('perfil'));
    estado.conta = (await store.obterConfig('conta')) || null;
    estado.membro = (await store.obterConfig('membro')) || null;
  } catch (e) {
    console.error(e);
    app.innerHTML = telaAcesso(`<h2>Não foi possível abrir o app</h2><p>${h(e?.message || e)}</p>
      <button type="button" class="botao destaque" data-acao="recarregar">Tentar de novo</button>`);
    iniciarAtualizacaoAutomatica();
    return;
  }

  iniciarAtualizacaoAutomatica();
  if (estado.conta && estado.membro?.aprovado) {
    // Já entrou neste aparelho: abre na hora com os dados guardados e confere
    // a sessão em segundo plano (funciona igual sem internet).
    try {
      await abrirApp();
    } catch (e) {
      console.error(e);
      app.innerHTML = telaAcesso(`<h2>Não foi possível abrir o app</h2><p>${h(e?.message || e)}</p>
        <button type="button" class="botao destaque" data-acao="recarregar">Tentar de novo</button>`);
      return;
    }
    conferirSessao();
  } else {
    await entrarSemDadosGuardados();
  }
}

// Primeira abertura no aparelho (ou conta ainda sem aprovação): precisa do servidor.
async function entrarSemDadosGuardados() {
  try {
    const sessao = await nuvem.sessao();
    if (!sessao) {
      telaConta.email = estado.conta?.email || '';
      desenharLogin();
      return;
    }
    await aposEntrar();
  } catch (e) {
    console.warn('Abertura:', e);
    telaConta.email = estado.conta?.email || '';
    telaConta.erro = e?.offline
      ? 'Sem conexão. Para entrar pela primeira vez neste aparelho é preciso internet.'
      : 'O servidor não respondeu agora. Aguarde alguns segundos e entre de novo.';
    desenharLogin();
  }
}

// Confere, sem travar a tela, se a sessão ainda vale e se a conta continua aprovada.
async function conferirSessao() {
  let sessao;
  try {
    sessao = await nuvem.sessao();
  } catch (e) {
    if (!e?.offline) console.warn('Sessão:', e);
    return; // sem internet ou servidor indisponível: segue com os dados do aparelho
  }
  if (!sessao) {
    estado.sessaoExpirada = true;
    if (estado.tela === 'lista') desenharLista();
    return;
  }
  if (sessao.user.id !== estado.conta?.id) {
    // Outra conta neste navegador: refaz a entrada completa.
    try {
      await aposEntrar();
    } catch (e) {
      console.warn('Entrada:', e);
    }
    return;
  }
  try {
    const membro = await nuvem.membro();
    estado.membro = { papel: membro.papel, aprovado: membro.aprovado };
    await store.salvarConfig('membro', estado.membro);
    if (!membro.aprovado) {
      desenharAguardando();
      return;
    }
    if (estado.tela === 'lista') desenharLista(); // ex.: virou administrador
    await carregarPerfil();
  } catch (e) {
    if (!e?.offline) console.warn('Equipe:', e);
  }
}

// ---------- atualização automática ----------
//
// A cada publicação o sw.js muda (scripts/versao.mjs). O app pergunta ao
// navegador se há versão nova a cada 5 minutos, quando volta a ficar visível e
// quando a internet volta. Quando a versão nova assume, o app espera a pessoa
// parar de mexer, salva, recarrega e volta para a mesma tela e seção.

const CHAVE_RETOMAR = 'inspecao-retomar';
const PAUSA_MS = 6000; // tempo sem tocar na tela antes de recarregar
let atualizacaoPendente = false;
let ultimaInteracao = Date.now();

for (const evento of ['pointerdown', 'keydown', 'input', 'wheel', 'touchstart']) {
  document.addEventListener(evento, () => (ultimaInteracao = Date.now()), { passive: true, capture: true });
}

function podeRecarregar() {
  if (estado.ocupado || temporizador || $('#dialogo')?.open) return false;
  if (document.visibilityState === 'hidden') return true; // app em segundo plano
  if (Date.now() - ultimaInteracao < PAUSA_MS) return false;
  // Formulário de login com algo digitado: espera terminar.
  if (estado.tela === 'login' && [...document.querySelectorAll('#form-conta input')].some((i) => i.value)) return false;
  return true;
}

async function aplicarAtualizacao() {
  if (!atualizacaoPendente) return;
  if (!podeRecarregar()) {
    setTimeout(aplicarAtualizacao, 2000);
    return;
  }
  atualizacaoPendente = false;
  try {
    await salvarAgora();
    await gravando;
    sessionStorage.setItem(
      CHAVE_RETOMAR,
      JSON.stringify({
        tela: estado.tela,
        rel: estado.tela === 'editor' ? estado.rel?.id : null,
        secao: estado.secao,
        abertas: [...estado.abertas],
        rolagem: window.scrollY,
        busca: estado.busca,
        filtro: estado.filtro,
      })
    );
  } catch {
    /* sem sessionStorage: recarrega mesmo assim, os dados já estão salvos */
  }
  location.reload();
}

// Depois de recarregar por atualização: volta para onde a pessoa estava.
async function retomarAposAtualizacao() {
  let r = null;
  try {
    r = JSON.parse(sessionStorage.getItem(CHAVE_RETOMAR) || 'null');
    sessionStorage.removeItem(CHAVE_RETOMAR);
  } catch {
    return;
  }
  if (!r) return;
  estado.busca = r.busca || '';
  estado.filtro = r.filtro || 'todos';
  if (r.tela === 'editor' && r.rel && (await store.obterRelatorio(r.rel))) {
    await abrirRelatorio(r.rel, { secao: r.secao || 'ident' });
    estado.abertas = new Set(r.abertas || []);
    desenharSecao();
  } else if (estado.tela === 'lista') {
    desenharLista();
  }
  setTimeout(() => window.scrollTo({ top: r.rolagem || 0 }), 50);
  avisar('App atualizado para a versão mais recente.');
}

function iniciarAtualizacaoAutomatica() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http') || window.claude) return;
  let temVersao = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!temVersao) {
      temVersao = true; // primeira instalação nesta aba: já está rodando a versão atual
      return;
    }
    atualizacaoPendente = true;
    aplicarAtualizacao();
  });
  navigator.serviceWorker
    .register('sw.js')
    .then((registro) => {
      if (!registro) return; // navegador sem suporte ou com o recurso bloqueado
      const verificar = () => registro.update().catch(() => {});
      setInterval(() => {
        if (document.visibilityState === 'visible') verificar();
      }, 5 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') verificar();
        else if (atualizacaoPendente) aplicarAtualizacao();
      });
      window.addEventListener('online', verificar);
    })
    .catch(() => {});
}

// Sincroniza quando a internet volta, quando o app volta a ficar visível e a cada 2 minutos.
window.addEventListener('online', () => agendarSinc(500));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') agendarSinc(1000);
});
setInterval(() => {
  if (document.visibilityState === 'visible' && estado.conta && estado.tela !== 'login') sinc.sincronizar();
}, 2 * 60 * 1000);

app.addEventListener('submit', (e) => {
  if (e.target.id !== 'form-conta') return;
  e.preventDefault();
  enviarFormConta(e.target);
});

iniciar();
