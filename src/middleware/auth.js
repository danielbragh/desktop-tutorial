function requireLogin(req, res, next) {
  if (!req.session.usuario) {
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.usuario || req.session.usuario.papel !== 'admin') {
    req.flash = 'Apenas administradores podem acessar essa página.';
    return res.status(403).render('erro', {
      titulo: 'Acesso negado',
      mensagem: 'Apenas administradores podem acessar essa página.',
      usuario: req.session.usuario,
    });
  }
  next();
}

module.exports = { requireLogin, requireAdmin };
