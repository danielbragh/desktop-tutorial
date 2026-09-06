const express = require('express');
const { body, validationResult } = require('express-validator');
const { db, transaction } = require('../db');
const auditLog = require('../utils/auditLog');
const { requireLogin } = require('../middleware/auth');
const { calcularPL } = require('../services/plCalculator');

const router = express.Router();

router.get('/pl/config', requireLogin, async (req, res) => {
  const ano = Number(req.query.ano) || new Date().getFullYear();
  const config = await db.get('SELECT * FROM pl_config WHERE ano = $1', [ano]);
  const linhasAnos = await db.all('SELECT DISTINCT ano FROM pl_config ORDER BY ano DESC');
  const anos = linhasAnos.map((r) => r.ano);

  res.render('pl/config', { config, ano, anos, erro: null, usuario: req.session.usuario });
});

const validarConfig = [
  body('ano').isInt({ min: 2000, max: 2100 }).withMessage('Ano inválido.'),
  body('periodo_inicio').isISO8601().withMessage('Início do período inválido.'),
  body('periodo_fim').isISO8601().withMessage('Fim do período inválido.'),
  body('valor_fixo').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('percentual_variavel').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('meses_totais_periodo').optional({ checkFalsy: true }).isInt({ min: 1 }),
  body('limite_faltas_injustificadas_mes').optional({ checkFalsy: true }).isInt({ min: 0 }),
  body('limite_faltas_zerar').optional({ checkFalsy: true }).isInt({ min: 0 }),
];

router.post('/pl/config', requireLogin, validarConfig, async (req, res) => {
  const erros = validationResult(req);
  if (!erros.isEmpty()) {
    return res.status(400).render('pl/config', {
      config: req.body,
      ano: Number(req.body.ano) || new Date().getFullYear(),
      anos: [],
      erro: erros.array()[0].msg,
      usuario: req.session.usuario,
    });
  }

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

  const params = [
    Number(ano),
    periodo_inicio,
    periodo_fim,
    Number(valor_fixo) || 0,
    Number(percentual_variavel) || 0,
    Number(meses_totais_periodo) || 12,
    Number(limite_faltas_injustificadas_mes) || 0,
    descontar_mes_por_excesso_faltas === 'on',
    limite_faltas_zerar ? Number(limite_faltas_zerar) : null,
  ];

  await db.run(
    `INSERT INTO pl_config
      (ano, periodo_inicio, periodo_fim, valor_fixo, percentual_variavel, meses_totais_periodo,
       limite_faltas_injustificadas_mes, descontar_mes_por_excesso_faltas, limite_faltas_zerar)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (ano) DO UPDATE SET
       periodo_inicio = EXCLUDED.periodo_inicio,
       periodo_fim = EXCLUDED.periodo_fim,
       valor_fixo = EXCLUDED.valor_fixo,
       percentual_variavel = EXCLUDED.percentual_variavel,
       meses_totais_periodo = EXCLUDED.meses_totais_periodo,
       limite_faltas_injustificadas_mes = EXCLUDED.limite_faltas_injustificadas_mes,
       descontar_mes_por_excesso_faltas = EXCLUDED.descontar_mes_por_excesso_faltas,
       limite_faltas_zerar = EXCLUDED.limite_faltas_zerar,
       atualizado_em = now()`,
    params
  );

  await auditLog.registrar(req, { acao: 'pl_config_salva', entidade: 'pl_config', entidadeId: ano });

  res.redirect(`/pl/config?ano=${ano}`);
});

router.post('/pl/calcular', requireLogin, async (req, res) => {
  const ano = Number(req.body.ano);
  const config = await db.get('SELECT * FROM pl_config WHERE ano = $1', [ano]);

  if (!config) {
    return res.redirect(`/pl/config?ano=${ano}`);
  }

  const configCalculo = {
    periodoInicio: config.periodo_inicio,
    periodoFim: config.periodo_fim,
    valorFixo: Number(config.valor_fixo),
    percentualVariavel: Number(config.percentual_variavel),
    mesesTotaisPeriodo: config.meses_totais_periodo,
    limiteFaltasInjustificadasMes: config.limite_faltas_injustificadas_mes,
    descontarMesPorExcessoFaltas: !!config.descontar_mes_por_excesso_faltas,
    limiteFaltasZerar: config.limite_faltas_zerar,
  };

  // Calcula para todos os funcionários; quem não tiver nenhum mês elegível no
  // período (ex.: admitido depois do fim do período) recebe valor zero.
  const funcionarios = await db.all('SELECT * FROM funcionarios');

  await transaction(async (tx) => {
    await tx.run('DELETE FROM pl_calculos WHERE ano = $1', [ano]);

    for (const f of funcionarios) {
      const ocorrencias = await tx.all(
        'SELECT * FROM ocorrencias WHERE funcionario_id = $1 AND data_inicio BETWEEN $2 AND $3',
        [f.id, config.periodo_inicio, config.periodo_fim]
      );

      const resultado = calcularPL({
        salario: Number(f.salario),
        dataAdmissao: f.data_admissao,
        dataDesligamento: f.data_desligamento,
        ocorrencias,
        config: configCalculo,
      });

      await tx.run(
        `INSERT INTO pl_calculos
          (ano, funcionario_id, meses_computados, total_faltas_injustificadas, zerado_por_faltas,
           valor_base, fracao, valor_bruto, valor_liquido, detalhes_json, calculado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          ano,
          f.id,
          resultado.mesesComputados,
          resultado.totalFaltasInjustificadas,
          resultado.zeradoPorFaltas,
          resultado.valorBase,
          resultado.fracao,
          resultado.valorBruto,
          resultado.valorLiquido,
          JSON.stringify(resultado.detalhesPorMes),
          req.session.usuario.id,
        ]
      );
    }
  });

  await auditLog.registrar(req, {
    acao: 'pl_calculada',
    entidade: 'pl_calculos',
    entidadeId: ano,
    detalhes: { total_funcionarios: funcionarios.length },
  });

  res.redirect(`/pl/relatorio?ano=${ano}`);
});

router.get('/pl/relatorio', requireLogin, async (req, res) => {
  const ano = Number(req.query.ano) || new Date().getFullYear();

  const calculos = await db.all(
    `SELECT c.*, f.nome, f.matricula, f.cargo, f.tipo_vinculo, o.nome AS obra_nome
     FROM pl_calculos c
     JOIN funcionarios f ON f.id = c.funcionario_id
     LEFT JOIN obras o ON o.id = f.obra_id
     WHERE c.ano = $1
     ORDER BY f.nome`,
    [ano]
  );

  const totalGeral = calculos.reduce((soma, c) => soma + Number(c.valor_liquido), 0);
  const linhasAnos = await db.all('SELECT DISTINCT ano FROM pl_calculos ORDER BY ano DESC');
  const anos = linhasAnos.map((r) => r.ano);

  res.render('pl/relatorio', { calculos, totalGeral, ano, anos, usuario: req.session.usuario });
});

module.exports = router;
