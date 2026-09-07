const express = require('express');
const argon2 = require('argon2');
const { body, validationResult } = require('express-validator');
const { db } = require('../db');
const auditLog = require('../utils/auditLog');
const { requireLogin, requireAdmin } = require('../middleware/auth');
const { senhaForte, MENSAGEM_REGRA } = require('../utils/senha');

const router = express.Router();

async function carregarUsuarios() {
  return db.all(
    'SELECT id, nome, email, papel, ativo, criado_em FROM users ORDER BY nome'
  );
}

router.get('/usuarios', requireLogin, requireAdmin, async (req, res) => {
  const usuarios = await carregarUsuarios();
  res.render('auth/usuarios', { usuarios, erro: null, usuario: req.session.usuario });
});

const validarNovoUsuario = [
  body('nome').trim().notEmpty().withMessage('Nome é obrigatório.'),
  body('email').trim().isEmail().withMessage('E-mail inválido.').normalizeEmail(),
  body('senha').custom((valor) => senhaForte(valor)).withMessage(MENSAGEM_REGRA),
  body('papel').isIn(['admin', 'rh']).withMessage('Papel inválido.'),
];

router.post('/usuarios', requireLogin, requireAdmin, validarNovoUsuario, async (req, res) => {
  const erros = validationResult(req);
  if (!erros.isEmpty()) {
    const usuarios = await carregarUsuarios();
    return res.status(400).render('auth/usuarios', {
      usuarios,
      erro: erros.array()[0].msg,
      usuario: req.session.usuario,
    });
  }

  const { nome, email, senha, papel } = req.body;

  try {
    const hash = await argon2.hash(senha, { type: argon2.argon2id });
    const criado = await db.get(
      'INSERT INTO users (nome, email, senha_hash, papel) VALUES ($1, $2, $3, $4) RETURNING id',
      [nome, email, hash, papel === 'admin' ? 'admin' : 'rh']
    );
    await auditLog.registrar(req, { acao: 'usuario_criado', entidade: 'users', entidadeId: criado.id });
    res.redirect('/usuarios');
  } catch (e) {
    const usuarios = await carregarUsuarios();
    res.status(400).render('auth/usuarios', {
      usuarios,
      erro: 'Não foi possível criar o usuário (e-mail já cadastrado?).',
      usuario: req.session.usuario,
    });
  }
});

router.post('/usuarios/:id/alternar-ativo', requireLogin, requireAdmin, async (req, res) => {
  const usuarioAlvo = await db.get('SELECT * FROM users WHERE id = $1', [req.params.id]);
  if (usuarioAlvo) {
    await db.run('UPDATE users SET ativo = $1 WHERE id = $2', [!usuarioAlvo.ativo, usuarioAlvo.id]);
    await auditLog.registrar(req, {
      acao: usuarioAlvo.ativo ? 'usuario_desativado' : 'usuario_ativado',
      entidade: 'users',
      entidadeId: usuarioAlvo.id,
    });
  }
  res.redirect('/usuarios');
});

module.exports = router;
