const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.usuario) return res.redirect('/');
  res.render('auth/login', { erro: null });
});

router.post('/login', (req, res) => {
  const { email, senha } = req.body;
  const usuario = db.prepare('SELECT * FROM users WHERE email = ? AND ativo = 1').get(email || '');

  if (!usuario || !bcrypt.compareSync(senha || '', usuario.senha_hash)) {
    return res.status(401).render('auth/login', { erro: 'E-mail ou senha inválidos.' });
  }

  req.session.usuario = { id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel };
  res.redirect('/');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
