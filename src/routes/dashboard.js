const express = require('express');
const dayjs = require('dayjs');
const { db } = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireLogin, async (req, res) => {
  const inicio = req.query.inicio || dayjs().startOf('year').format('YYYY-MM-DD');
  const fim = req.query.fim || dayjs().format('YYYY-MM-DD');
  const anoPL = Number(req.query.anoPL) || dayjs().year();

  const totalFuncionariosAtivos = (
    await db.get("SELECT COUNT(*)::int AS n FROM funcionarios WHERE status = 'ativo'")
  ).n;
  const totalObrasAtivas = (
    await db.get("SELECT COUNT(*)::int AS n FROM obras WHERE status = 'ativa'")
  ).n;
  const totalOcorrenciasPeriodo = (
    await db.get('SELECT COUNT(*)::int AS n FROM ocorrencias WHERE data_inicio BETWEEN $1 AND $2', [
      inicio,
      fim,
    ])
  ).n;

  const cargosComMaisFaltas = await db.all(
    `SELECT f.cargo AS cargo, COUNT(*)::int AS qtd_ocorrencias, SUM(oc.dias)::int AS total_dias
     FROM ocorrencias oc
     JOIN funcionarios f ON f.id = oc.funcionario_id
     WHERE oc.data_inicio BETWEEN $1 AND $2
     GROUP BY f.cargo
     ORDER BY total_dias DESC
     LIMIT 15`,
    [inicio, fim]
  );

  const faltasPorTipo = await db.all(
    `SELECT oc.tipo AS tipo, COUNT(*)::int AS qtd, SUM(oc.dias)::int AS total_dias
     FROM ocorrencias oc
     WHERE oc.data_inicio BETWEEN $1 AND $2
     GROUP BY oc.tipo`,
    [inicio, fim]
  );

  const massaSalarialPorCargo = await db.all(
    `SELECT cargo, COUNT(*)::int AS qtd_funcionarios, SUM(salario)::float AS total_salarios
     FROM funcionarios
     WHERE status = 'ativo'
     GROUP BY cargo
     ORDER BY total_salarios DESC`
  );

  const plPorCargo = await db.all(
    `SELECT f.cargo AS cargo, COUNT(*)::int AS qtd_funcionarios, SUM(c.valor_liquido)::float AS total_pl
     FROM pl_calculos c
     JOIN funcionarios f ON f.id = c.funcionario_id
     WHERE c.ano = $1
     GROUP BY f.cargo
     ORDER BY total_pl DESC`,
    [anoPL]
  );

  const totalPLAno = plPorCargo.reduce((soma, r) => soma + (r.total_pl || 0), 0);

  const anosComCalculoPL = (
    await db.all('SELECT DISTINCT ano FROM pl_calculos ORDER BY ano DESC')
  ).map((r) => r.ano);

  res.render('dashboard/index', {
    usuario: req.session.usuario,
    filtros: { inicio, fim, anoPL },
    totalFuncionariosAtivos,
    totalObrasAtivas,
    totalOcorrenciasPeriodo,
    totalPLAno,
    cargosComMaisFaltas,
    faltasPorTipo,
    massaSalarialPorCargo,
    plPorCargo,
    anosComCalculoPL,
  });
});

module.exports = router;
