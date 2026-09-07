const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../db');
const auditLog = require('../utils/auditLog');
const { requireLogin } = require('../middleware/auth');
const { cpfValido, limparCpf } = require('../utils/cpf');

const router = express.Router();

async function carregarObras() {
  return db.all("SELECT * FROM obras WHERE status = 'ativa' ORDER BY nome");
}

router.get('/funcionarios', requireLogin, async (req, res) => {
  const { busca, tipo_vinculo, obra_id, status } = req.query;
  let sql = `
    SELECT f.*, o.nome AS obra_nome
    FROM funcionarios f
    LEFT JOIN obras o ON o.id = f.obra_id
    WHERE 1 = 1
  `;
  const params = [];

  if (busca) {
    params.push(`%${busca}%`, `%${busca}%`, `%${busca}%`);
    sql += ` AND (f.nome ILIKE $${params.length - 2} OR f.cpf ILIKE $${params.length - 1} OR f.matricula ILIKE $${params.length})`;
  }
  if (tipo_vinculo) {
    params.push(tipo_vinculo);
    sql += ` AND f.tipo_vinculo = $${params.length}`;
  }
  if (obra_id) {
    params.push(obra_id);
    sql += ` AND f.obra_id = $${params.length}`;
  }
  if (status) {
    params.push(status);
    sql += ` AND f.status = $${params.length}`;
  }
  sql += ' ORDER BY f.nome';

  const funcionarios = await db.all(sql, params);
  const obras = await db.all('SELECT * FROM obras ORDER BY nome');

  res.render('funcionarios/list', {
    funcionarios,
    obras,
    filtros: { busca, tipo_vinculo, obra_id, status },
    usuario: req.session.usuario,
  });
});

router.get('/funcionarios/novo', requireLogin, async (req, res) => {
  res.render('funcionarios/form', {
    funcionario: null,
    obras: await carregarObras(),
    erro: null,
    usuario: req.session.usuario,
  });
});

const validarFuncionario = [
  body('nome').trim().notEmpty().withMessage('Nome é obrigatório.'),
  body('matricula').trim().notEmpty().withMessage('Matrícula é obrigatória.'),
  body('cpf')
    .customSanitizer((v) => limparCpf(v))
    .custom((v) => cpfValido(v))
    .withMessage('CPF inválido.'),
  body('cargo').trim().notEmpty().withMessage('Cargo é obrigatório.'),
  body('data_admissao').isISO8601().withMessage('Data de admissão inválida.'),
  body('salario').isFloat({ gt: 0 }).withMessage('Salário deve ser maior que zero.'),
  body('tipo_vinculo').isIn(['escritorio', 'obra']).withMessage('Tipo de vínculo inválido.'),
  body('obra_id').custom((valor, { req }) => {
    if (req.body.tipo_vinculo === 'obra' && !valor) {
      throw new Error('Funcionários de obra precisam estar vinculados a uma obra.');
    }
    return true;
  }),
];

router.post('/funcionarios', requireLogin, validarFuncionario, async (req, res) => {
  const erros = validationResult(req);
  if (!erros.isEmpty()) {
    return res.status(400).render('funcionarios/form', {
      funcionario: req.body,
      obras: await carregarObras(),
      erro: erros.array()[0].msg,
      usuario: req.session.usuario,
    });
  }

  const { nome, matricula, cpf, cargo, data_admissao, salario, tipo_vinculo, obra_id } = req.body;

  try {
    const criado = await db.get(
      `INSERT INTO funcionarios
        (nome, matricula, cpf, cargo, data_admissao, salario, tipo_vinculo, obra_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ativo') RETURNING id`,
      [
        nome,
        matricula,
        cpf,
        cargo,
        data_admissao,
        Number(salario),
        tipo_vinculo,
        tipo_vinculo === 'obra' ? Number(obra_id) : null,
      ]
    );
    await auditLog.registrar(req, { acao: 'funcionario_criado', entidade: 'funcionarios', entidadeId: criado.id });
    res.redirect('/funcionarios');
  } catch (e) {
    res.status(400).render('funcionarios/form', {
      funcionario: req.body,
      obras: await carregarObras(),
      erro: 'Não foi possível salvar (matrícula ou CPF já cadastrado?).',
      usuario: req.session.usuario,
    });
  }
});

router.get('/funcionarios/:id/editar', requireLogin, async (req, res) => {
  const funcionario = await db.get('SELECT * FROM funcionarios WHERE id = $1', [req.params.id]);
  if (!funcionario) return res.redirect('/funcionarios');
  res.render('funcionarios/form', {
    funcionario,
    obras: await carregarObras(),
    erro: null,
    usuario: req.session.usuario,
  });
});

router.post('/funcionarios/:id', requireLogin, validarFuncionario, async (req, res) => {
  const erros = validationResult(req);
  if (!erros.isEmpty()) {
    return res.status(400).render('funcionarios/form', {
      funcionario: { ...req.body, id: req.params.id },
      obras: await carregarObras(),
      erro: erros.array()[0].msg,
      usuario: req.session.usuario,
    });
  }

  const { nome, matricula, cpf, cargo, data_admissao, salario, tipo_vinculo, obra_id, status, data_desligamento } =
    req.body;

  try {
    await db.run(
      `UPDATE funcionarios SET
        nome = $1, matricula = $2, cpf = $3, cargo = $4, data_admissao = $5, salario = $6,
        tipo_vinculo = $7, obra_id = $8, status = $9, data_desligamento = $10
       WHERE id = $11`,
      [
        nome,
        matricula,
        cpf,
        cargo,
        data_admissao,
        Number(salario),
        tipo_vinculo,
        tipo_vinculo === 'obra' ? Number(obra_id) : null,
        status === 'desligado' ? 'desligado' : 'ativo',
        status === 'desligado' ? data_desligamento || null : null,
        req.params.id,
      ]
    );
    await auditLog.registrar(req, { acao: 'funcionario_editado', entidade: 'funcionarios', entidadeId: req.params.id });
    res.redirect('/funcionarios');
  } catch (e) {
    res.status(400).render('funcionarios/form', {
      funcionario: { ...req.body, id: req.params.id },
      obras: await carregarObras(),
      erro: 'Não foi possível salvar (matrícula ou CPF já cadastrado em outro funcionário?).',
      usuario: req.session.usuario,
    });
  }
});

router.get('/funcionarios/:id', requireLogin, async (req, res) => {
  const funcionario = await db.get(
    `SELECT f.*, o.nome AS obra_nome FROM funcionarios f
     LEFT JOIN obras o ON o.id = f.obra_id WHERE f.id = $1`,
    [req.params.id]
  );
  if (!funcionario) return res.redirect('/funcionarios');

  const ocorrencias = await db.all(
    'SELECT * FROM ocorrencias WHERE funcionario_id = $1 ORDER BY data_inicio DESC',
    [req.params.id]
  );

  res.render('funcionarios/detalhe', { funcionario, ocorrencias, usuario: req.session.usuario });
});

module.exports = router;
