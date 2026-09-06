const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const { db } = require('../db');
const auditLog = require('../utils/auditLog');
const { requireLogin } = require('../middleware/auth');
const { verifyCsrfManual } = require('../middleware/csrf');
const { assinaturaValida } = require('../utils/fileSignature');

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

async function carregarFuncionariosAtivos() {
  return db.all("SELECT id, nome, matricula FROM funcionarios WHERE status = 'ativo' ORDER BY nome");
}

router.get('/ocorrencias', requireLogin, async (req, res) => {
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
    params.push(funcionario_id);
    sql += ` AND oc.funcionario_id = $${params.length}`;
  }
  if (tipo) {
    params.push(tipo);
    sql += ` AND oc.tipo = $${params.length}`;
  }
  sql += ' ORDER BY oc.data_inicio DESC';

  const ocorrencias = await db.all(sql, params);
  const funcionarios = await carregarFuncionariosAtivos();

  res.render('ocorrencias/list', {
    ocorrencias,
    funcionarios,
    filtros: { funcionario_id, tipo },
    usuario: req.session.usuario,
  });
});

router.get('/ocorrencias/nova', requireLogin, async (req, res) => {
  const funcionarios = await carregarFuncionariosAtivos();
  res.render('ocorrencias/form', {
    funcionarios,
    erro: null,
    usuario: req.session.usuario,
    funcionarioSelecionado: req.query.funcionario_id || '',
  });
});

function removerArquivoSeExistir(nomeArquivo) {
  if (!nomeArquivo) return;
  const caminho = path.join(UPLOAD_DIR, nomeArquivo);
  fs.unlink(caminho, () => {});
}

router.post(
  '/ocorrencias',
  requireLogin,
  (req, res, next) => {
    upload.single('anexo')(req, res, async (err) => {
      if (err) {
        const funcionarios = await carregarFuncionariosAtivos();
        return res.status(400).render('ocorrencias/form', {
          funcionarios,
          erro: err.message,
          usuario: req.session.usuario,
          funcionarioSelecionado: req.body.funcionario_id || '',
        });
      }
      next();
    });
  },
  async (req, res) => {
    // O corpo multipart não passa pelo verificador global de CSRF (o
    // body só existe depois do multer rodar), então validamos aqui.
    if (!verifyCsrfManual(req)) {
      if (req.file) removerArquivoSeExistir(req.file.filename);
      return res.status(403).render('erro', {
        titulo: 'Requisição inválida',
        mensagem: 'Token de segurança ausente ou expirado. Recarregue a página e tente novamente.',
        usuario: req.session.usuario,
      });
    }

    const { funcionario_id, tipo, data_inicio, dias, cid, observacao } = req.body;
    const funcionarios = await carregarFuncionariosAtivos();

    if (!funcionario_id || !tipo || !data_inicio || !dias) {
      if (req.file) removerArquivoSeExistir(req.file.filename);
      return res.status(400).render('ocorrencias/form', {
        funcionarios,
        erro: 'Preencha funcionário, tipo, data e quantidade de dias.',
        usuario: req.session.usuario,
        funcionarioSelecionado: funcionario_id || '',
      });
    }

    if (!['falta_justificada', 'falta_injustificada', 'atestado'].includes(tipo)) {
      if (req.file) removerArquivoSeExistir(req.file.filename);
      return res.status(400).render('ocorrencias/form', {
        funcionarios,
        erro: 'Tipo de ocorrência inválido.',
        usuario: req.session.usuario,
        funcionarioSelecionado: funcionario_id || '',
      });
    }

    let anexo = null;
    if (req.file) {
      const buffer = fs.readFileSync(req.file.path);
      if (!assinaturaValida(buffer, req.file.mimetype)) {
        removerArquivoSeExistir(req.file.filename);
        return res.status(400).render('ocorrencias/form', {
          funcionarios,
          erro: 'O conteúdo do arquivo não corresponde a um PDF, PNG ou JPG válido.',
          usuario: req.session.usuario,
          funcionarioSelecionado: funcionario_id || '',
        });
      }
      anexo = req.file.filename;
    }

    const criada = await db.get(
      `INSERT INTO ocorrencias (funcionario_id, tipo, data_inicio, dias, cid, observacao, anexo, lancado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        Number(funcionario_id),
        tipo,
        data_inicio,
        Number(dias),
        cid || null,
        observacao || null,
        anexo,
        req.session.usuario.id,
      ]
    );

    await auditLog.registrar(req, {
      acao: 'ocorrencia_criada',
      entidade: 'ocorrencias',
      entidadeId: criada.id,
      detalhes: { funcionario_id, tipo },
    });

    res.redirect(`/funcionarios/${funcionario_id}`);
  }
);

router.post('/ocorrencias/:id/excluir', requireLogin, async (req, res) => {
  const ocorrencia = await db.get('SELECT * FROM ocorrencias WHERE id = $1', [req.params.id]);
  if (ocorrencia) {
    await db.run('DELETE FROM ocorrencias WHERE id = $1', [req.params.id]);
    removerArquivoSeExistir(ocorrencia.anexo);
    await auditLog.registrar(req, { acao: 'ocorrencia_excluida', entidade: 'ocorrencias', entidadeId: ocorrencia.id });
  }
  res.redirect(req.get('Referrer') || '/ocorrencias');
});

module.exports = router;
