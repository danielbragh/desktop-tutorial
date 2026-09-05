const express = require('express');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');
const { cpfValido, limparCpf } = require('../utils/cpf');

const router = express.Router();

function carregarObras() {
  return db.prepare("SELECT * FROM obras WHERE status = 'ativa' ORDER BY nome").all();
}

router.get('/funcionarios', requireLogin, (req, res) => {
  const { busca, tipo_vinculo, obra_id, status } = req.query;
  let sql = `
    SELECT f.*, o.nome AS obra_nome
    FROM funcionarios f
    LEFT JOIN obras o ON o.id = f.obra_id
    WHERE 1 = 1
  `;
  const params = [];

  if (busca) {
    sql += ' AND (f.nome LIKE ? OR f.cpf LIKE ? OR f.matricula LIKE ?)';
    const termo = `%${busca}%`;
    params.push(termo, termo, termo);
  }
  if (tipo_vinculo) {
    sql += ' AND f.tipo_vinculo = ?';
    params.push(tipo_vinculo);
  }
  if (obra_id) {
    sql += ' AND f.obra_id = ?';
    params.push(obra_id);
  }
  if (status) {
    sql += ' AND f.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY f.nome';

  const funcionarios = db.prepare(sql).all(...params);
  const obras = db.prepare('SELECT * FROM obras ORDER BY nome').all();

  res.render('funcionarios/list', {
    funcionarios,
    obras,
    filtros: { busca, tipo_vinculo, obra_id, status },
    usuario: req.session.usuario,
  });
});

router.get('/funcionarios/novo', requireLogin, (req, res) => {
  res.render('funcionarios/form', {
    funcionario: null,
    obras: carregarObras(),
    erro: null,
    usuario: req.session.usuario,
  });
});

function validarDados(body) {
  const { nome, matricula, cpf, cargo, data_admissao, salario, tipo_vinculo, obra_id } = body;

  if (!nome || !matricula || !cpf || !cargo || !data_admissao || !salario || !tipo_vinculo) {
    return 'Preencha todos os campos obrigatórios.';
  }
  if (!cpfValido(cpf)) {
    return 'CPF inválido.';
  }
  if (Number(salario) <= 0) {
    return 'Salário deve ser maior que zero.';
  }
  if (tipo_vinculo === 'obra' && !obra_id) {
    return 'Funcionários de obra precisam estar vinculados a uma obra.';
  }
  return null;
}

router.post('/funcionarios', requireLogin, (req, res) => {
  const erro = validarDados(req.body);
  if (erro) {
    return res.status(400).render('funcionarios/form', {
      funcionario: req.body,
      obras: carregarObras(),
      erro,
      usuario: req.session.usuario,
    });
  }

  const { nome, matricula, cpf, cargo, data_admissao, salario, tipo_vinculo, obra_id } = req.body;

  try {
    db.prepare(
      `INSERT INTO funcionarios
        (nome, matricula, cpf, cargo, data_admissao, salario, tipo_vinculo, obra_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ativo')`
    ).run(
      nome,
      matricula,
      limparCpf(cpf),
      cargo,
      data_admissao,
      Number(salario),
      tipo_vinculo,
      tipo_vinculo === 'obra' ? Number(obra_id) : null
    );
    res.redirect('/funcionarios');
  } catch (e) {
    res.status(400).render('funcionarios/form', {
      funcionario: req.body,
      obras: carregarObras(),
      erro: 'Não foi possível salvar (matrícula ou CPF já cadastrado?).',
      usuario: req.session.usuario,
    });
  }
});

router.get('/funcionarios/:id/editar', requireLogin, (req, res) => {
  const funcionario = db.prepare('SELECT * FROM funcionarios WHERE id = ?').get(req.params.id);
  if (!funcionario) return res.redirect('/funcionarios');
  res.render('funcionarios/form', {
    funcionario,
    obras: carregarObras(),
    erro: null,
    usuario: req.session.usuario,
  });
});

router.post('/funcionarios/:id', requireLogin, (req, res) => {
  const erro = validarDados(req.body);
  if (erro) {
    return res.status(400).render('funcionarios/form', {
      funcionario: { ...req.body, id: req.params.id },
      obras: carregarObras(),
      erro,
      usuario: req.session.usuario,
    });
  }

  const { nome, matricula, cpf, cargo, data_admissao, salario, tipo_vinculo, obra_id, status, data_desligamento } =
    req.body;

  try {
    db.prepare(
      `UPDATE funcionarios SET
        nome = ?, matricula = ?, cpf = ?, cargo = ?, data_admissao = ?, salario = ?,
        tipo_vinculo = ?, obra_id = ?, status = ?, data_desligamento = ?
       WHERE id = ?`
    ).run(
      nome,
      matricula,
      limparCpf(cpf),
      cargo,
      data_admissao,
      Number(salario),
      tipo_vinculo,
      tipo_vinculo === 'obra' ? Number(obra_id) : null,
      status === 'desligado' ? 'desligado' : 'ativo',
      status === 'desligado' ? data_desligamento || null : null,
      req.params.id
    );
    res.redirect('/funcionarios');
  } catch (e) {
    res.status(400).render('funcionarios/form', {
      funcionario: { ...req.body, id: req.params.id },
      obras: carregarObras(),
      erro: 'Não foi possível salvar (matrícula ou CPF já cadastrado em outro funcionário?).',
      usuario: req.session.usuario,
    });
  }
});

router.get('/funcionarios/:id', requireLogin, (req, res) => {
  const funcionario = db
    .prepare(
      `SELECT f.*, o.nome AS obra_nome FROM funcionarios f
       LEFT JOIN obras o ON o.id = f.obra_id WHERE f.id = ?`
    )
    .get(req.params.id);
  if (!funcionario) return res.redirect('/funcionarios');

  const ocorrencias = db
    .prepare('SELECT * FROM ocorrencias WHERE funcionario_id = ? ORDER BY data_inicio DESC')
    .all(req.params.id);

  res.render('funcionarios/detalhe', { funcionario, ocorrencias, usuario: req.session.usuario });
});

module.exports = router;
