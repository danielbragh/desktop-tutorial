const { db } = require('../db');

function clientIp(req) {
  return req.ip || (req.socket && req.socket.remoteAddress) || null;
}

async function registrar(req, { acao, entidade = null, entidadeId = null, detalhes = null, usuario = null }) {
  const usuarioAtual = usuario || req.session?.usuario || null;
  try {
    await db.run(
      `INSERT INTO audit_log (usuario_id, usuario_email, acao, entidade, entidade_id, ip, detalhes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        usuarioAtual ? usuarioAtual.id : null,
        usuarioAtual ? usuarioAtual.email : null,
        acao,
        entidade,
        entidadeId !== null && entidadeId !== undefined ? String(entidadeId) : null,
        clientIp(req),
        detalhes ? JSON.stringify(detalhes) : null,
      ]
    );
  } catch (err) {
    // Auditoria não deve derrubar a requisição principal.
    console.error('Falha ao gravar log de auditoria:', err.message);
  }
}

module.exports = { registrar };
