const express = require('express');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');
const { calcularPL } = require('../services/plCalculator');

const router = express.Router();

router.get('/pl/config', requireLogin, (req, res) => {
  const ano = Number(req.query.ano) || new Date().getFullYear();
  const config = db.prepare('SELECT * FROM pl_config WHERE ano = ?').get(ano);
  const anos = db.prepare('SELECT DISTINCT ano FROM pl_config ORDER BY ano DESC').all().map((r) => r.ano);

  res.render('pl/config', { config, ano, anos, erro: null, usuario: req.session.usuario });
});

router.post('/pl/config', requireLogin, (req, res) => {
  const {
    ano,
    periodo_inicio,
    periodo_fim,
    valor_fixo,
    percentual_variavel,
    meses_totais_periodo,
    limite_faltas_injustificadas_mes,
    descontar_mes_por_excesso_faltas,
    limite_faltas_zerar,
  } = req.body;

  if (!ano || !periodo_inicio || !periodo_fim) {
    return res.status(400).render('pl/config', {
      config: req.body,
      ano: Number(ano) || new Date().getFullYear(),
      anos: [],
      erro: 'Preencha ano e período de apuração.',
      usuario: req.session.usuario,
    });
  }

  const existente = db.prepare('SELECT id FROM pl_config WHERE ano = ?').get(Number(ano));

  const params = [
    periodo_inicio,
    periodo_fim,
    Number(valor_fixo) || 0,
    Number(percentual_variavel) || 0,
    Number(meses_totais_periodo) || 12,
    Number(limite_faltas_injustificadas_mes) || 0,
    descontar_mes_por_excesso_faltas === 'on' ? 1 : 0,
    limite_faltas_zerar ? Number(limite_faltas_zerar) : null,
  ];

  if (existente) {
    db.prepare(
      `UPDATE pl_config SET periodo_inicio=?, periodo_fim=?, valor_fixo=?, percentual_variavel=?,
        meses_totais_periodo=?, limite_faltas_injustificadas_mes=?, descontar_mes_por_excesso_faltas=?,
        limite_faltas_zerar=?, atualizado_em = datetime('now') WHERE ano = ?`
    ).run(...params, Number(ano));
  } else {
    db.prepare(
      `INSERT INTO pl_config
        (ano, periodo_inicio, periodo_fim, valor_fixo, percentual_variavel, meses_totais_periodo,
         limite_faltas_injustificadas_mes, descontar_mes_por_excesso_faltas, limite_faltas_zerar)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(Number(ano), ...params);
  }

  res.redirect(`/pl/config?ano=${ano}`);
});

router.post('/pl/calcular', requireLogin, (req, res) => {
  const ano = Number(req.body.ano);
  const config = db.prepare('SELECT * FROM pl_config WHERE ano = ?').get(ano);

  if (!config) {
    return res.redirect(`/pl/config?ano=${ano}`);
  }

  // Calcula para todos os funcionários; quem não tiver nenhum mês elegível no
  // período (ex.: admitido depois do fim do período) recebe valor zero.
  const funcionarios = db.prepare('SELECT * FROM funcionarios').all();

  const configCalculo = {
    periodoInicio: config.periodo_inicio,
    periodoFim: config.periodo_fim,
    valorFixo: config.valor_fixo,
    percentualVariavel: config.percentual_variavel,
    mesesTotaisPeriodo: config.meses_totais_periodo,
    limiteFaltasInjustificadasMes: config.limite_faltas_injustificadas_mes,
    descontarMesPorExcessoFaltas: !!config.descontar_mes_por_excesso_faltas,
    limiteFaltasZerar: config.limite_faltas_zerar,
  };

  const inserir = db.prepare(
    `INSERT INTO pl_calculos
      (ano, funcionario_id, meses_computados, total_faltas_injustificadas, zerado_por_faltas,
       valor_base, fracao, valor_bruto, valor_liquido, detalhes_json, calculado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const apagar = db.prepare('DELETE FROM pl_calculos WHERE ano = ?');

  const transacao = db.transaction(() => {
    apagar.run(ano);
    for (const f of funcionarios) {
      const ocorrencias = db
        .prepare(
          "SELECT * FROM ocorrencias WHERE funcionario_id = ? AND data_inicio BETWEEN ? AND ?"
        )
        .all(f.id, config.periodo_inicio, config.periodo_fim);

      const resultado = calcularPL({
        salario: f.salario,
        dataAdmissao: f.data_admissao,
        dataDesligamento: f.data_desligamento,
        ocorrencias,
        config: configCalculo,
      });

      inserir.run(
        ano,
        f.id,
        resultado.mesesComputados,
        resultado.totalFaltasInjustificadas,
        resultado.zeradoPorFaltas ? 1 : 0,
        resultado.valorBase,
        resultado.fracao,
        resultado.valorBruto,
        resultado.valorLiquido,
        JSON.stringify(resultado.detalhesPorMes),
        req.session.usuario.id
      );
    }
  });

  transacao();

  res.redirect(`/pl/relatorio?ano=${ano}`);
});

router.get('/pl/relatorio', requireLogin, (req, res) => {
  const ano = Number(req.query.ano) || new Date().getFullYear();

  const calculos = db
    .prepare(
      `SELECT c.*, f.nome, f.matricula, f.cargo, f.tipo_vinculo, o.nome AS obra_nome
       FROM pl_calculos c
       JOIN funcionarios f ON f.id = c.funcionario_id
       LEFT JOIN obras o ON o.id = f.obra_id
       WHERE c.ano = ?
       ORDER BY f.nome`
    )
    .all(ano);

  const totalGeral = calculos.reduce((soma, c) => soma + c.valor_liquido, 0);
  const anos = db.prepare('SELECT DISTINCT ano FROM pl_calculos ORDER BY ano DESC').all().map((r) => r.ano);

  res.render('pl/relatorio', { calculos, totalGeral, ano, anos, usuario: req.session.usuario });
});

module.exports = router;
