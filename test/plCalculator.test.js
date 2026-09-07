const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularPL } = require('../src/services/plCalculator');

const configPadrao = {
  periodoInicio: '2025-01-01',
  periodoFim: '2025-12-31',
  valorFixo: 500,
  percentualVariavel: 10,
  mesesTotaisPeriodo: 12,
  limiteFaltasInjustificadasMes: 1,
  descontarMesPorExcessoFaltas: true,
  limiteFaltasZerar: null,
};

test('funcionário que trabalhou o ano todo sem faltas recebe 100% do valor base', () => {
  const resultado = calcularPL({
    salario: 3000,
    dataAdmissao: '2020-01-01',
    dataDesligamento: null,
    ocorrencias: [],
    config: configPadrao,
  });

  assert.equal(resultado.mesesComputados, 12);
  assert.equal(resultado.fracao, 1);
  assert.equal(resultado.valorBase, 500 + 0.1 * 3000);
  assert.equal(resultado.valorLiquido, resultado.valorBase);
});

test('admissão no meio do ano gera proporcionalidade', () => {
  const resultado = calcularPL({
    salario: 2000,
    dataAdmissao: '2025-07-20',
    dataDesligamento: null,
    ocorrencias: [],
    config: configPadrao,
  });

  // Julho: só 12 dias trabalhados (20 a 31) -> não conta (< 15)
  // Agosto a dezembro contam -> 5 meses
  assert.equal(resultado.mesesComputados, 5);
  assert.equal(resultado.fracao, 5 / 12);
});

test('mês com faltas injustificadas acima do limite não é contado', () => {
  const resultado = calcularPL({
    salario: 2500,
    dataAdmissao: '2020-01-01',
    dataDesligamento: null,
    ocorrencias: [{ tipo: 'falta_injustificada', data_inicio: '2025-03-10', dias: 3 }],
    config: configPadrao,
  });

  assert.equal(resultado.mesesDescontadosPorFalta, 1);
  assert.equal(resultado.mesesComputados, 11);
});

test('faltas justificadas e atestados não afetam o cálculo', () => {
  const resultado = calcularPL({
    salario: 2500,
    dataAdmissao: '2020-01-01',
    dataDesligamento: null,
    ocorrencias: [
      { tipo: 'atestado', data_inicio: '2025-03-10', dias: 10 },
      { tipo: 'falta_justificada', data_inicio: '2025-04-01', dias: 5 },
    ],
    config: configPadrao,
  });

  assert.equal(resultado.mesesComputados, 12);
});

test('total de faltas injustificadas acima do limite de perda zera o valor', () => {
  const resultado = calcularPL({
    salario: 2500,
    dataAdmissao: '2020-01-01',
    dataDesligamento: null,
    ocorrencias: [{ tipo: 'falta_injustificada', data_inicio: '2025-05-01', dias: 20 }],
    config: { ...configPadrao, limiteFaltasZerar: 15 },
  });

  assert.equal(resultado.zeradoPorFaltas, true);
  assert.equal(resultado.valorLiquido, 0);
  assert.ok(resultado.valorBruto > 0);
});

test('desligamento antes do fim do período limita os meses computados', () => {
  const resultado = calcularPL({
    salario: 2500,
    dataAdmissao: '2020-01-01',
    dataDesligamento: '2025-06-10',
    ocorrencias: [],
    config: configPadrao,
  });

  // Jan-Mai completos (5), Junho com 10 dias (< 15, não conta)
  assert.equal(resultado.mesesComputados, 5);
});

test('funcionário admitido depois do fim do período não recebe nada', () => {
  const resultado = calcularPL({
    salario: 2500,
    dataAdmissao: '2026-01-01',
    dataDesligamento: null,
    ocorrencias: [],
    config: configPadrao,
  });

  assert.equal(resultado.mesesComputados, 0);
  assert.equal(resultado.valorLiquido, 0);
});
