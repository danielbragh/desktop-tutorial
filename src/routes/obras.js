const express = require('express');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

router.get('/obras', requireLogin, (req, res) => {
  const obras = db.prepare('SELECT * FROM obras ORDER BY nome').all();
  res.render('obras/list', { obras, usuario: req.session.usuario });
});

router.get('/obras/nova', requireLogin, (req, res) => {
  res.render('obras/form', { obra: null, erro: null, usuario: req.session.usuario });
});

router.post('/obras', requireLogin, (req, res) => {
  const { nome, codigo, endereco, status } = req.body;
  if (!nome || !codigo) {
    return res.status(400).render('obras/form', {
      obra: req.body,
      erro: 'Nome e código da obra são obrigatórios.',
      usuario: req.session.usuario,
    });
  }
  try {
    db.prepare('INSERT INTO obras (nome, codigo, endereco, status) VALUES (?, ?, ?, ?)').run(
      nome,
      codigo,
      endereco || null,
      status === 'encerrada' ? 'encerrada' : 'ativa'
    );
    res.redirect('/obras');
  } catch (e) {
    res.status(400).render('obras/form', {
      obra: req.body,
      erro: 'Não foi possível salvar (código já cadastrado?).',
      usuario: req.session.usuario,
    });
  }
});

router.get('/obras/:id/editar', requireLogin, (req, res) => {
  const obra = db.prepare('SELECT * FROM obras WHERE id = ?').get(req.params.id);
  if (!obra) return res.redirect('/obras');
  res.render('obras/form', { obra, erro: null, usuario: req.session.usuario });
});

router.post('/obras/:id', requireLogin, (req, res) => {
  const { nome, codigo, endereco, status } = req.body;
  try {
    db.prepare('UPDATE obras SET nome = ?, codigo = ?, endereco = ?, status = ? WHERE id = ?').run(
      nome,
      codigo,
      endereco || null,
      status === 'encerrada' ? 'encerrada' : 'ativa',
      req.params.id
    );
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
