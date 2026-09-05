const express = require('express');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'atestados');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const nomeUnico = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname)}`;
    cb(null, nomeUnico);
  },
});

const TIPOS_PERMITIDOS = new Set(['application/pdf', 'image/png', 'image/jpeg']);

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (TIPOS_PERMITIDOS.has(file.mimetype)) return cb(null, true);
    cb(new Error('Formato de arquivo não suportado. Envie PDF, PNG ou JPG.'));
  },
});

router.get('/ocorrencias', requireLogin, (req, res) => {
  const { funcionario_id, tipo } = req.query;
  let sql = `
    SELECT oc.*, f.nome AS funcionario_nome, f.cargo, u.nome AS lancado_por_nome
    FROM ocorrencias oc
    JOIN funcionarios f ON f.id = oc.funcionario_id
    LEFT JOIN users u ON u.id = oc.lancado_por
    WHERE 1 = 1
  `;
  const params = [];
  if (funcionario_id) {
    sql += ' AND oc.funcionario_id = ?';
    params.push(funcionario_id);
  }
  if (tipo) {
    sql += ' AND oc.tipo = ?';
    params.push(tipo);
  }
  sql += ' ORDER BY oc.data_inicio DESC';

  const ocorrencias = db.prepare(sql).all(...params);
  const funcionarios = db.prepare("SELECT id, nome, matricula FROM funcionarios WHERE status = 'ativo' ORDER BY nome").all();

  res.render('ocorrencias/list', { ocorrencias, funcionarios, filtros: { funcionario_id, tipo }, usuario: req.session.usuario });
});

router.get('/ocorrencias/nova', requireLogin, (req, res) => {
  const funcionarios = db.prepare("SELECT id, nome, matricula FROM funcionarios WHERE status = 'ativo' ORDER BY nome").all();
  res.render('ocorrencias/form', { funcionarios, erro: null, usuario: req.session.usuario, funcionarioSelecionado: req.query.funcionario_id || '' });
});

router.post('/ocorrencias', requireLogin, (req, res, next) => {
  upload.single('anexo')(req, res, (err) => {
    if (err) {
      const funcionarios = db.prepare("SELECT id, nome, matricula FROM funcionarios WHERE status = 'ativo' ORDER BY nome").all();
      return res.status(400).render('ocorrencias/form', {
        funcionarios,
        erro: err.message,
        usuario: req.session.usuario,
        funcionarioSelecionado: req.body.funcionario_id || '',
      });
    }
    next();
  });
}, (req, res) => {
  const { funcionario_id, tipo, data_inicio, dias, cid, observacao } = req.body;

  if (!funcionario_id || !tipo || !data_inicio || !dias) {
    const funcionarios = db.prepare("SELECT id, nome, matricula FROM funcionarios WHERE status = 'ativo' ORDER BY nome").all();
    return res.status(400).render('ocorrencias/form', {
      funcionarios,
      erro: 'Preencha funcionário, tipo, data e quantidade de dias.',
      usuario: req.session.usuario,
      funcionarioSelecionado: funcionario_id || '',
    });
  }

  const anexo = req.file ? req.file.filename : null;

  db.prepare(
    `INSERT INTO ocorrencias (funcionario_id, tipo, data_inicio, dias, cid, observacao, anexo, lancado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    Number(funcionario_id),
    tipo,
    data_inicio,
    Number(dias),
    cid || null,
    observacao || null,
    anexo,
    req.session.usuario.id
  );

  res.redirect(`/funcionarios/${funcionario_id}`);
});

router.post('/ocorrencias/:id/excluir', requireLogin, (req, res) => {
  const ocorrencia = db.prepare('SELECT * FROM ocorrencias WHERE id = ?').get(req.params.id);
  if (ocorrencia) {
    db.prepare('DELETE FROM ocorrencias WHERE id = ?').run(req.params.id);
  }
  res.redirect(req.get('Referrer') || '/ocorrencias');
});

module.exports = router;
