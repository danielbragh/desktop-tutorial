const express = require('express');
const argon2 = require('argon2');
const rateLimit = require('express-rate-limit');
const { db } = require('../db');
const auditLog = require('../utils/auditLog');
const { requireLogin } = require('../middleware/auth');
const { senhaForte, MENSAGEM_REGRA } = require('../utils/senha');

const router = express.Router();

const MAX_TENTATIVAS = 5;
const BLOQUEIO_MINUTOS = 15;

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Muitas tentativas de login a partir deste endereço. Tente novamente mais tarde.',
});

router.get('/login', (req, res) => {
  if (req.session.usuario) return res.redirect('/');
  res.render('auth/login', { erro: null });
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, senha } = req.body;

  const usuario = await db.get('SELECT * FROM users WHERE email = $1 AND ativo = TRUE', [
    email || '',
  ]);

  if (usuario && usuario.bloqueado_ate && new Date(usuario.bloqueado_ate) > new Date()) {
    await auditLog.registrar(req, { acao: 'login_bloqueado', entidade: 'users', entidadeId: usuario.id });
    return res.status(423).render('auth/login', {
      erro: `Conta temporariamente bloqueada por excesso de tentativas. Tente novamente em alguns minutos.`,
    });
  }

  const senhaValida = usuario ? await argon2.verify(usuario.senha_hash, senha || '') : false;

  if (!usuario || !senhaValida) {
    if (usuario) {
      const falhas = usuario.falhas_login + 1;
      const bloquear = falhas >= MAX_TENTATIVAS;
      await db.run(
        `UPDATE users SET falhas_login = $1, bloqueado_ate = $2 WHERE id = $3`,
        [
          bloquear ? 0 : falhas,
          bloquear ? new Date(Date.now() + BLOQUEIO_MINUTOS * 60 * 1000) : null,
          usuario.id,
        ]
      );
      await auditLog.registrar(req, {
        acao: bloquear ? 'login_falhou_bloqueou' : 'login_falhou',
        entidade: 'users',
        entidadeId: usuario.id,
      });
    }
    return res.status(401).render('auth/login', { erro: 'E-mail ou senha inválidos.' });
  }

  await db.run('UPDATE users SET falhas_login = 0, bloqueado_ate = NULL WHERE id = $1', [
    usuario.id,
  ]);

  req.session.regenerate((err) => {
    if (err) {
      console.error('Erro ao regenerar sessão:', err);
      return res.status(500).render('erro', {
        titulo: 'Erro inesperado',
        mensagem: 'Não foi possível iniciar a sessão.',
        usuario: null,
      });
    }
    req.session.usuario = { id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel };
    auditLog.registrar(req, { acao: 'login_sucesso', entidade: 'users', entidadeId: usuario.id });
    res.redirect('/');
  });
});

router.post('/logout', requireLogin, (req, res) => {
  const usuario = req.session.usuario;
  req.session.destroy(() => {
    auditLog.registrar(req, { acao: 'logout', entidade: 'users', entidadeId: usuario?.id, usuario });
    res.redirect('/login');
  });
});

router.get('/minha-conta', requireLogin, (req, res) => {
  res.render('auth/minha-conta', { erro: null, sucesso: null, usuario: req.session.usuario });
});

router.post('/minha-conta/senha', requireLogin, async (req, res) => {
  const { senha_atual, nova_senha, confirmar_senha } = req.body;

  const usuario = await db.get('SELECT * FROM users WHERE id = $1', [req.session.usuario.id]);
  const senhaAtualValida = await argon2.verify(usuario.senha_hash, senha_atual || '');

  if (!senhaAtualValida) {
    return res.status(400).render('auth/minha-conta', {
      erro: 'Senha atual incorreta.',
      sucesso: null,
      usuario: req.session.usuario,
    });
  }

  if (nova_senha !== confirmar_senha) {
    return res.status(400).render('auth/minha-conta', {
      erro: 'A confirmação não corresponde à nova senha.',
      sucesso: null,
      usuario: req.session.usuario,
    });
  }

  if (!senhaForte(nova_senha)) {
    return res.status(400).render('auth/minha-conta', {
      erro: MENSAGEM_REGRA,
      sucesso: null,
      usuario: req.session.usuario,
    });
  }

  const hash = await argon2.hash(nova_senha, { type: argon2.argon2id });
  await db.run('UPDATE users SET senha_hash = $1, senha_alterada_em = now() WHERE id = $2', [
    hash,
    usuario.id,
  ]);

  await auditLog.registrar(req, { acao: 'senha_alterada', entidade: 'users', entidadeId: usuario.id });

  res.render('auth/minha-conta', {
    erro: null,
    sucesso: 'Senha alterada com sucesso.',
    usuario: req.session.usuario,
  });
});

module.exports = router;
