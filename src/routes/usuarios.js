const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireLogin, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/usuarios', requireLogin, requireAdmin, (req, res) => {
  const usuarios = db.prepare('SELECT id, nome, email, papel, ativo, criado_em FROM users ORDER BY nome').all();
  res.render('auth/usuarios', { usuarios, erro: null, usuario: req.session.usuario });
});

router.post('/usuarios', requireLogin, requireAdmin, (req, res) => {
  const { nome, email, senha, papel } = req.body;

  if (!nome || !email || !senha) {
    const usuarios = db.prepare('SELECT id, nome, email, papel, ativo, criado_em FROM users ORDER BY nome').all();
    return res.status(400).render('auth/usuarios', {
      usuarios,
      erro: 'Preencha nome, e-mail e senha.',
      usuario: req.session.usuario,
    });
  }

  try {
    const hash = bcrypt.hashSync(senha, 10);
    db.prepare('INSERT INTO users (nome, email, senha_hash, papel) VALUES (?, ?, ?, ?)').run(
      nome,
      email,
      hash,
      papel === 'admin' ? 'admin' : 'rh'
    );
    res.redirect('/usuarios');
  } catch (e) {
    const usuarios = db.prepare('SELECT id, nome, email, papel, ativo, criado_em FROM users ORDER BY nome').all();
    res.status(400).render('auth/usuarios', {
      usuarios,
      erro: 'Não foi possível criar o usuário (e-mail já cadastrado?).',
      usuario: req.session.usuario,
    });
  }
});

router.post('/usuarios/:id/alternar-ativo', requireLogin, requireAdmin, (req, res) => {
  const usuario = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (usuario) {
    db.prepare('UPDATE users SET ativo = ? WHERE id = ?').run(usuario.ativo ? 0 : 1, usuario.id);
  }
  res.redirect('/usuarios');
});

module.exports = router;
