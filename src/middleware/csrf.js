const crypto = require('crypto');

function safeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function csrfToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function isSafeMethod(method) {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

function verifyCsrf(req, res, next) {
  if (isSafeMethod(req.method)) return next();

  const contentType = req.headers['content-type'] || '';
  if (contentType.startsWith('multipart/form-data')) {
    // Corpo multipart ainda não foi processado (multer roda depois, dentro
    // da própria rota). A verificação nesse caso é feita manualmente com
    // verifyCsrfManual() após o multer popular req.body.
    return next();
  }

  if (verifyCsrfManual(req)) return next();

  res.status(403).render('erro', {
    titulo: 'Requisição inválida',
    mensagem: 'Token de segurança ausente ou expirado. Recarregue a página e tente novamente.',
    usuario: req.session.usuario,
  });
}

function verifyCsrfManual(req) {
  const provided = req.body && req.body._csrf;
  const expected = req.session && req.session.csrfToken;
  return Boolean(provided) && Boolean(expected) && safeCompare(provided, expected);
}

module.exports = { csrfToken, verifyCsrf, verifyCsrfManual };
