// Conteúdo fixo do modelo de relatório e estrutura de dados de um relatório.
// Tudo aqui vem do "Modelo_Relatorio_Inspecao_Cobertura_Drone.docx".

export const TITULO = 'Relatório de Inspeção Visual de Cobertura';
export const SUBTITULO = 'com apoio de aeronave remotamente pilotada (drone)';

export const GRAUS = ['Crítico', 'Médio', 'Mínimo', 'Observação'];

export const CRITERIOS = [
  {
    grau: 'Crítico',
    significado: 'Risco à segurança de pessoas ou à edificação, ou infiltração ativa e significativa',
    prioridade: 'Imediata',
    cor: 'FBE3E1',
  },
  {
    grau: 'Médio',
    significado: 'Perda de desempenho com tendência de agravamento; infiltração provável no período chuvoso',
    prioridade: 'Curto prazo — antes do período chuvoso',
    cor: 'FFF4D6',
  },
  {
    grau: 'Mínimo',
    significado: 'Desgaste ou falha estética sem risco imediato',
    prioridade: 'Médio prazo / manutenção programada',
    cor: 'E3F2E6',
  },
  {
    grau: 'Observação',
    significado: 'Não é anomalia, mas merece acompanhamento',
    prioridade: 'Monitorar na próxima inspeção',
    cor: 'FFFFFF',
  },
];

export const COR_GRAU = Object.fromEntries(CRITERIOS.map((c) => [c.grau, c.cor]));

export const USOS = ['Residencial multifamiliar', 'Residencial unifamiliar', 'Comercial', 'Galpão', 'Misto'];

export const TIPOS_COBERTURA = [
  'Telha cerâmica',
  'Telha de fibrocimento',
  'Telha metálica',
  'Laje impermeabilizada',
  'Mista',
];

export const ELEMENTOS_SUGERIDOS = [
  'Telhas',
  'Cumeeira',
  'Calha',
  'Rufo',
  'Contrarrufo',
  'Condutor',
  'Ralo',
  'Platibanda',
  'Impermeabilização',
  'Reservatório',
  'Tampa',
  'Estrutura de apoio',
  'Equipamento',
  'Antena',
  'SPDA',
];

// Itens do checklist (Seção 8). `chaves` serve para sugerir o item a partir
// do texto digitado no campo "Elemento" de uma anomalia.
export const CHECKLIST = [
  { nome: 'Telhas e cumeeiras', chaves: ['telha', 'cumeeira'] },
  { nome: 'Calhas', chaves: ['calha'] },
  { nome: 'Rufos e contrarrufos', chaves: ['rufo'] },
  { nome: 'Condutores e ralos visíveis', chaves: ['condutor', 'ralo'] },
  { nome: 'Platibandas', chaves: ['platibanda'] },
  { nome: 'Impermeabilizações expostas', chaves: ['imperm', 'manta'] },
  { nome: 'Reservatórios', chaves: ['reservat', 'caixa d', 'tampa'] },
  { nome: 'Estrutura de apoio visível', chaves: ['estrutura', 'madeiramento', 'tesoura', 'terça', 'caibro', 'ripa'] },
  { nome: 'Equipamentos e antenas', chaves: ['equipamento', 'antena', 'condensadora', 'exaustor', 'placa solar'] },
  { nome: 'Captores e cordoalhas de SPDA (observação visual)', chaves: ['spda', 'captor', 'cordoalha', 'para-raio', 'para raio'] },
];

export const SITUACOES = ['OK', 'Não inspecionado'];

export const PRE_VOO = [
  'Autorização SARPAS válida para local, horário e altura',
  'Seguro RETA vigente',
  'Comunicado aos moradores/usuários enviado',
  'Vento previsto dentro do limite do equipamento',
  'Baterias: ciclos, tensão das células e ausência de estufamento verificados',
  'Mínimo de 3 baterias carregadas',
  'Hélices sem trincas ou deformações',
  'Bússola calibrada no local',
  'Área de decolagem e pouso isolada',
  'Observador auxiliar presente (voos próximos a paredes)',
  'Ponto de retorno (home point) registrado e altura de retorno definida',
  'Distância mínima padrão das superfícies definida',
];

export const TEXTOS = {
  // O trecho entre ** sai em negrito no documento.
  objetivo:
    'Este relatório registra a **inspeção visual** da cobertura do imóvel identificado, realizada com apoio de drone e, onde houve acesso seguro, com verificação complementar no local. O objetivo é identificar anomalias aparentes que possam causar infiltrações, danos ou riscos, classificá-las por gravidade e indicar as ações recomendadas e sua prioridade, especialmente antes do período chuvoso (fevereiro a maio).',
  escopoIncluido:
    'telhas e cumeeiras, calhas, rufos e contrarrufos, condutores e ralos visíveis, platibandas, impermeabilizações expostas, reservatórios e equipamentos instalados na cobertura.',
  escopoNaoIncluido:
    'ensaios, testes de estanqueidade, avaliação estrutural, inspeção de elementos ocultos e análise de instalações elétricas ou de SPDA além da observação visual.',
  procedimento: [
    'Voo de reconhecimento e registro da visão geral da cobertura.',
    'Varredura sistemática por setores, com imagens verticais e oblíquas.',
    'Registro de detalhe das anomalias, com aproximação controlada.',
    'Verificação complementar no local, onde houve acesso seguro.',
    'Análise das imagens em escritório, classificação das anomalias e elaboração das recomendações.',
  ],
  limitacoes: [
    'A inspeção é visual e se limita às condições aparentes na data e no horário da vistoria.',
    'Não foram realizados ensaios, testes de estanqueidade nem avaliação estrutural.',
    'Anomalias menores que a resolução de imagem indicada na Seção 3.1 (por exemplo, fissuras finas) podem não ter sido detectadas.',
    'Elementos ocultos, encobertos ou sem visada adequada não foram avaliados.',
    'Este documento não substitui o laudo de inspeção predial previsto na ABNT NBR 16747 nem avaliações de especialistas que se mostrem necessárias.',
  ],
  novaInspecao: ['ao final do período chuvoso', 'anualmente'],
  anexoIntro: 'Preencher em todo serviço e arquivar com as imagens. Serve como evidência de operação segura e regular.',
};

// Dados que se repetem em todo relatório. O usuário ajusta em "Meus dados".
export const PERFIL_PADRAO = {
  nome: 'Daniel Braga de Souza',
  titulo: 'Técnico em Edificações',
  registro: 'CFT/CRT-02',
  cidade: 'Fortaleza/CE',
  // Dados da certidão de cadastro da ANAC (SISANT), emitida em 19/11/2026.
  aeronave:
    'DJI Mavic Pro (modelo M1P), nº de série 08QUE8A10100B2, PMD 0,720 kg — câmera de 12 MP, sensor 1/2,3", estabilização em 3 eixos',
  fatorResolucao: 0.33, // mm/pixel a cada metro de distância
  tipoImagens:
    'Vertical (nadir) para visão geral; oblíquas para calhas, rufos e platibandas; vídeo de reconhecimento',
  sisant: 'PP-417653154 (uso não recreativo, válido até 19/11/2028)',
  reta: '',
  logo: null, // data URL PNG; null = logo do modelo
  logoProporcao: null, // largura / altura do logo personalizado
};

export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function hojeISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function novaAnomalia() {
  return { id: uid(), local: '', elemento: '', item: '', anomalia: '', causa: '', grau: '', recomendacao: '' };
}

export function novoRelatorio(perfil = PERFIL_PADRAO, numero = '') {
  const hoje = hojeISO();
  return {
    id: uid(),
    versao: 1,
    criadoEm: Date.now(),
    atualizadoEm: Date.now(),
    exemplo: false,
    numero,
    dataEmissao: hoje,
    ident: {
      cliente: '',
      representante: '',
      endereco: '',
      uso: '',
      pavimentos: '',
      tipoCobertura: '',
      area: '',
      dataInspecao: hoje,
      horaInicio: '',
      horaFim: '',
      trt: '',
    },
    resp: {
      nome: perfil.nome,
      titulo: perfil.titulo,
      registro: perfil.registro,
      cidade: perfil.cidade,
    },
    escopo: {
      objetivo: TEXTOS.objetivo,
      incluido: TEXTOS.escopoIncluido,
      naoIncluido: TEXTOS.escopoNaoIncluido,
    },
    equip: {
      aeronave: perfil.aeronave,
      alturaVoo: '',
      distanciaDetalhe: '',
      fatorResolucao: perfil.fatorResolucao,
      tipoImagens: perfil.tipoImagens,
      meteo: '',
    },
    conform: {
      sisant: perfil.sisant || '',
      sarpas: '',
      reta: perfil.reta || '',
      comunicacao: '',
    },
    procedimento: [...TEXTOS.procedimento],
    caracterizacao: '',
    anomalias: [],
    fotos: [], // { id, legenda, anomaliaId }
    checklist: CHECKLIST.map(() => ''), // '' | 'OK' | 'Não inspecionado' (Anomalia vem das anomalias)
    conclusao: {
      resumo: '',
      acoes: { imediata: '', curto: '', medio: '' },
      prazos: { imediata: 'Imediato', curto: 'Antes de fevereiro', medio: 'Manutenção programada' },
      novaInspecao: TEXTOS.novaInspecao[0],
    },
    limitacoes: [...TEXTOS.limitacoes],
    anexo: {
      preVoo: PRE_VOO.map(() => ''), // '' | 'Sim' | 'Não'
      piloto: perfil.nome,
      observador: '',
      horario: '',
      voos: '',
      ocorrencias: '',
      pasta: '',
    },
  };
}

// Linhas de exemplo do próprio modelo, para o relatório de demonstração.
export function relatorioExemplo(perfil = PERFIL_PADRAO, numero = '') {
  const r = novoRelatorio(perfil, numero);
  r.exemplo = true;
  Object.assign(r.ident, {
    cliente: 'Condomínio Exemplo (dados fictícios)',
    representante: 'Maria Exemplo — síndica, (85) 90000-0000',
    endereco: 'Rua de Exemplo, 100, Aldeota, Fortaleza/CE',
    uso: 'Residencial multifamiliar',
    pavimentos: '4 pavimentos / 2 blocos',
    tipoCobertura: 'Mista',
    area: '620',
    horaInicio: '08:00',
    horaFim: '09:30',
    trt: 'EXEMPLO-0000',
  });
  Object.assign(r.equip, {
    alturaVoo: '30',
    distanciaDetalhe: '5',
    meteo: 'Céu parcialmente nublado, vento fraco (até 10 km/h), sem chuva nas últimas 48 h',
  });
  Object.assign(r.conform, {
    sisant: 'PP-000000000',
    sarpas: 'EXEMPLO-0000',
    reta: 'Seguradora Exemplo, apólice 000000',
    comunicacao: 'Comunicado aos moradores via síndica, na véspera',
  });
  r.caracterizacao =
    'Cobertura em telha cerâmica sobre estrutura de madeira nos dois blocos, com inclinação aparente de cerca de 30%, e laje técnica impermeabilizada sobre a caixa de escada. Drenagem por calhas metálicas frontais e condutores verticais externos. Platibandas em alvenaria com rufos metálicos. Dois reservatórios de fibra sobre a laje técnica.';
  const linhas = [
    ['Bloco A, água sul', 'Telhas', 'Telhas cerâmicas quebradas e deslocadas (aprox. 12 un.)', 'Impacto, dilatação ou manutenção inadequada', 'Médio', 'Substituir e realinhar as telhas antes das chuvas'],
    ['Calha frontal', 'Calha', 'Acúmulo de folhas e detritos; obstrução parcial do condutor', 'Ausência de limpeza periódica', 'Médio', 'Limpeza e teste de escoamento; limpeza semestral'],
    ['Platibanda leste', 'Rufo', 'Rufo descolado em trecho de aprox. 3 m', 'Falha de fixação ou vedação', 'Crítico', 'Refixar e revedar; verificar infiltração no pavimento abaixo'],
    ['Laje técnica', 'Impermeabilização', 'Manta exposta com bolhas e descolamento localizado', 'Degradação por UV, sem proteção mecânica', 'Médio', 'Avaliação detalhada e recuperação localizada'],
    ['Reservatório', 'Tampa', 'Tampa sem vedação adequada', 'Desgaste', 'Mínimo', 'Substituir a vedação'],
  ];
  r.anomalias = linhas.map(([local, elemento, anomalia, causa, grau, recomendacao]) => ({
    ...novaAnomalia(),
    local,
    elemento,
    item: sugerirItem(elemento),
    anomalia,
    causa,
    grau,
    recomendacao,
  }));
  r.checklist = CHECKLIST.map((_, i) => (i === 9 ? 'Não inspecionado' : 'OK'));
  r.conclusao.resumo = '';
  r.anexo.preVoo = PRE_VOO.map(() => 'Sim');
  Object.assign(r.anexo, {
    observador: 'Auxiliar Exemplo',
    horario: '08:00 às 09:30',
    voos: '3 voos / 3 baterias',
    ocorrencias: 'Sem ocorrências',
    pasta: 'Inspeções/Exemplo',
  });
  return r;
}

// Índice (como texto) do item do checklist que combina com o elemento digitado.
export function sugerirItem(elemento) {
  const t = (elemento || '').toLowerCase();
  if (!t.trim()) return '';
  const i = CHECKLIST.findIndex((c) => c.chaves.some((k) => t.includes(k)));
  return i < 0 ? '' : String(i);
}
