const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../db');
const auditLog = require('../utils/auditLog');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

const validarObra = [
  body('nome').trim().notEmpty().withMessage('Nome da obra é obrigatório.'),
  body('codigo').trim().notEmpty().withMessage('Código da obra é obrigatório.'),
  body('endereco').optional({ checkFalsy: true }).trim(),
  body('status').optional().isIn(['ativa', 'encerrada']),
];

router.get('/obras', requireLogin, async (req, res) => {
  const obras = await db.all('SELECT * FROM obras ORDER BY nome');
  res.render('obras/list', { obras, usuario: req.session.usuario });
});

router.get('/obras/nova', requireLogin, (req, res) => {
  res.render('obras/form', { obra: null, erro: null, usuario: req.session.usuario });
});

router.post('/obras', requireLogin, validarObra, async (req, res) => {
  const erros = validationResult(req);
  if (!erros.isEmpty()) {
    return res.status(400).render('obras/form', {
      obra: req.body,
      erro: erros.array()[0].msg,
      usuario: req.session.usuario,
    });
  }

  const { nome, codigo, endereco, status } = req.body;
  try {
    const criada = await db.get(
      'INSERT INTO obras (nome, codigo, endereco, status) VALUES ($1, $2, $3, $4) RETURNING id',
      [nome, codigo, endereco || null, status === 'encerrada' ? 'encerrada' : 'ativa']
    );
    await auditLog.registrar(req, { acao: 'obra_criada', entidade: 'obras', entidadeId: criada.id });
    res.redirect('/obras');
  } catch (e) {
    res.status(400).render('obras/form', {
      obra: req.body,
      erro: 'Não foi possível salvar (código já cadastrado?).',
      usuario: req.session.usuario,
    });
  }
});

router.get('/obras/:id/editar', requireLogin, async (req, res) => {
  const obra = await db.get('SELECT * FROM obras WHERE id = $1', [req.params.id]);
  if (!obra) return res.redirect('/obras');
  res.render('obras/form', { obra, erro: null, usuario: req.session.usuario });
});

router.post('/obras/:id', requireLogin, validarObra, async (req, res) => {
  const erros = validationResult(req);
  if (!erros.isEmpty()) {
    return res.status(400).render('obras/form', {
      obra: { ...req.body, id: req.params.id },
      erro: erros.array()[0].msg,
      usuario: req.session.usuario,
    });
  }

  const { nome, codigo, endereco, status } = req.body;
  try {
    await db.run('UPDATE obras SET nome = $1, codigo = $2, endereco = $3, status = $4 WHERE id = $5', [
      nome,
      codigo,
      endereco || null,
      status === 'encerrada' ? 'encerrada' : 'ativa',
      req.params.id,
    ]);
    await auditLog.registrar(req, { acao: 'obra_editada', entidade: 'obras', entidadeId: req.params.id });
    res.redirect('/obras');
  } catch (e) {
    res.status(400).render('obras/form', {
      obra: { ...req.body, id: req.params.id },
      erro: 'Não foi possível salvar (código já cadastrado?).',
      usuario: req.session.usuario,
    });
  }
});

module.exports = router;
