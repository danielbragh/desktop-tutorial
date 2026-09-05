const express = require('express');
const dayjs = require('dayjs');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireLogin, (req, res) => {
  const inicio = req.query.inicio || dayjs().startOf('year').format('YYYY-MM-DD');
  const fim = req.query.fim || dayjs().format('YYYY-MM-DD');
  const anoPL = Number(req.query.anoPL) || dayjs().year();

  const totalFuncionariosAtivos = db.prepare("SELECT COUNT(*) AS n FROM funcionarios WHERE status = 'ativo'").get().n;
  const totalObrasAtivas = db.prepare("SELECT COUNT(*) AS n FROM obras WHERE status = 'ativa'").get().n;
  const totalOcorrenciasPeriodo = db
    .prepare('SELECT COUNT(*) AS n FROM ocorrencias WHERE data_inicio BETWEEN ? AND ?')
    .get(inicio, fim).n;

  const cargosComMaisFaltas = db
    .prepare(
      `SELECT f.cargo AS cargo, COUNT(*) AS qtd_ocorrencias, SUM(oc.dias) AS total_dias
       FROM ocorrencias oc
       JOIN funcionarios f ON f.id = oc.funcionario_id
       WHERE oc.data_inicio BETWEEN ? AND ?
       GROUP BY f.cargo
       ORDER BY total_dias DESC
       LIMIT 15`
    )
    .all(inicio, fim);

  const faltasPorTipo = db
    .prepare(
      `SELECT oc.tipo AS tipo, COUNT(*) AS qtd, SUM(oc.dias) AS total_dias
       FROM ocorrencias oc
       WHERE oc.data_inicio BETWEEN ? AND ?
       GROUP BY oc.tipo`
    )
    .all(inicio, fim);

  const massaSalarialPorCargo = db
    .prepare(
      `SELECT cargo, COUNT(*) AS qtd_funcionarios, SUM(salario) AS total_salarios
       FROM funcionarios
       WHERE status = 'ativo'
       GROUP BY cargo
       ORDER BY total_salarios DESC`
    )
    .all();

  const plPorCargo = db
    .prepare(
      `SELECT f.cargo AS cargo, COUNT(*) AS qtd_funcionarios, SUM(c.valor_liquido) AS total_pl
       FROM pl_calculos c
       JOIN funcionarios f ON f.id = c.funcionario_id
       WHERE c.ano = ?
       GROUP BY f.cargo
       ORDER BY total_pl DESC`
    )
    .all(anoPL);

  const totalPLAno = plPorCargo.reduce((soma, r) => soma + (r.total_pl || 0), 0);

  const anosComCalculoPL = db
    .prepare('SELECT DISTINCT ano FROM pl_calculos ORDER BY ano DESC')
    .all()
    .map((r) => r.ano);

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
