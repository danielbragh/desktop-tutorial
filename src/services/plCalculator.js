const dayjs = require('dayjs');

/**
 * Modelo GENÉRICO e CONFIGURÁVEL de cálculo de PL.
 *
 * Este modelo não reproduz nenhuma Convenção Coletiva de Trabalho (CCT)
 * específica do SINDUSCON — ele foi desenhado para ser ajustável via
 * parâmetros (tela de Configuração da PL) até refletir a regra vigente
 * da categoria/ano/região da empresa. Antes de usar o valor calculado
 * para pagamento, valide com a CCT em vigor.
 *
 * Regra implementada:
 *  - O período de apuração é dividido em meses calendário.
 *  - Um mês só é contado se o funcionário trabalhou pelo menos 15 dias
 *    dele (mesma lógica de fração de mês usada em outros cálculos
 *    trabalhistas no Brasil, ex.: 13º salário).
 *  - Se configurado, um mês em que o funcionário teve faltas
 *    injustificadas acima do limite mensal deixa de ser contado.
 *  - Se o total de faltas injustificadas no período atingir o limite
 *    de perda total (quando configurado), o valor final é zerado.
 *  - Valor base = valor fixo + percentual variável sobre o salário.
 *  - Valor final = valor base * (meses computados / meses totais do período).
 */

function paraData(valor) {
  return dayjs(valor);
}

function diasDeSobreposicao(inicioA, fimA, inicioB, fimB) {
  const inicio = inicioA.isAfter(inicioB) ? inicioA : inicioB;
  const fim = fimA.isBefore(fimB) ? fimA : fimB;
  const diff = fim.diff(inicio, 'day') + 1;
  return Math.max(0, diff);
}

function faltasInjustificadasNoMes(ocorrencias, inicioMes, fimMes) {
  let dias = 0;
  for (const oc of ocorrencias) {
    if (oc.tipo !== 'falta_injustificada') continue;
    const inicioOc = paraData(oc.data_inicio);
    const fimOc = inicioOc.add((oc.dias || 1) - 1, 'day');
    dias += diasDeSobreposicao(inicioOc, fimOc, inicioMes, fimMes);
  }
  return dias;
}

function calcularPL({ salario, dataAdmissao, dataDesligamento, ocorrencias = [], config }) {
  const {
    periodoInicio,
    periodoFim,
    valorFixo = 0,
    percentualVariavel = 0,
    mesesTotaisPeriodo = 12,
    limiteFaltasInjustificadasMes = 1,
    descontarMesPorExcessoFaltas = true,
    limiteFaltasZerar = null,
  } = config;

  const inicioPeriodo = paraData(periodoInicio).startOf('day');
  const fimPeriodo = paraData(periodoFim).startOf('day');
  const admissao = paraData(dataAdmissao).startOf('day');
  const desligamento = dataDesligamento ? paraData(dataDesligamento).startOf('day') : null;

  const inicioEfetivo = admissao.isAfter(inicioPeriodo) ? admissao : inicioPeriodo;
  const fimEfetivo = desligamento && desligamento.isBefore(fimPeriodo) ? desligamento : fimPeriodo;

  const detalhesPorMes = [];
  let mesesComputados = 0;
  let mesesDescontadosPorFalta = 0;

  let cursor = inicioPeriodo.startOf('month');
  while (cursor.isBefore(fimPeriodo) || cursor.isSame(fimPeriodo, 'month')) {
    const inicioMes = cursor;
    const fimMes = cursor.endOf('month');

    const diasTrabalhadosNoMes = diasDeSobreposicao(inicioEfetivo, fimEfetivo, inicioMes, fimMes);
    const elegivelPorPresenca = diasTrabalhadosNoMes >= 15;

    const faltasNoMes = faltasInjustificadasNoMes(ocorrencias, inicioMes, fimMes);
    const excedeuLimiteMes = faltasNoMes > limiteFaltasInjustificadasMes;

    let contaMes = elegivelPorPresenca;
    if (elegivelPorPresenca && descontarMesPorExcessoFaltas && excedeuLimiteMes) {
      contaMes = false;
      mesesDescontadosPorFalta += 1;
    }

    if (contaMes) mesesComputados += 1;

    detalhesPorMes.push({
      mes: inicioMes.format('YYYY-MM'),
      diasTrabalhadosNoMes,
      faltasInjustificadasNoMes: faltasNoMes,
      contou: contaMes,
    });

    cursor = cursor.add(1, 'month');
  }

  const totalFaltasInjustificadas = ocorrencias
    .filter((oc) => oc.tipo === 'falta_injustificada')
    .reduce((soma, oc) => soma + (oc.dias || 1), 0);

  const zeradoPorFaltas =
    Number.isFinite(limiteFaltasZerar) && limiteFaltasZerar !== null && totalFaltasInjustificadas >= limiteFaltasZerar;

  const valorBase = Number(valorFixo) + (Number(percentualVariavel) / 100) * Number(salario);
  const fracao = Math.min(1, mesesComputados / mesesTotaisPeriodo);
  const valorBruto = valorBase * fracao;
  const valorLiquido = zeradoPorFaltas ? 0 : valorBruto;

  return {
    mesesComputados,
    mesesDescontadosPorFalta,
    totalFaltasInjustificadas,
    zeradoPorFaltas,
    valorBase,
    fracao,
    valorBruto,
    valorLiquido,
    detalhesPorMes,
  };
}

module.exports = { calcularPL };
