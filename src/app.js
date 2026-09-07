const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pgSession = require('connect-pg-simple')(session);

const { pool } = require('./db');
const { csrfToken, verifyCsrf } = require('./middleware/csrf');
const authRoutes = require('./routes/auth');
const usuariosRoutes = require('./routes/usuarios');
const obrasRoutes = require('./routes/obras');
const funcionariosRoutes = require('./routes/funcionarios');
const ocorrenciasRoutes = require('./routes/ocorrencias');
const plRoutes = require('./routes/pl');
const dashboardRoutes = require('./routes/dashboard');
const { requireLogin } = require('./middleware/auth');

const PRODUCAO = process.env.NODE_ENV === 'production';

const app = express();

if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// Gera um nonce por requisição para permitir os poucos <script> inline que
// renderizam dados dinâmicos (dashboard, formulários), sem precisar
// enfraquecer a CSP com 'unsafe-inline'.
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`],
        // style-src permanece com 'unsafe-inline' porque as views usam
        // atributos style="" para pequenos ajustes de espaçamento; o risco
        // de XSS via CSS é muito menor do que via script-src, que fica
        // restrito por nonce acima.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: PRODUCAO ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: PRODUCAO ? undefined : false,
  })
);

const limitadorGeral = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limitadorGeral);

app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(express.json({ limit: '100kb' }));

app.use(
  session({
    store: new pgSession({ pool, tableName: 'session', createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || 'rh-sistema-segredo-de-sessao-troque-em-producao',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      maxAge: 1000 * 60 * 60 * 8,
      httpOnly: true,
      secure: PRODUCAO,
      sameSite: 'lax',
    },
  })
);

app.use(csrfToken);
app.use(verifyCsrf);

app.use('/css', express.static(path.join(__dirname, '..', 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, '..', 'public', 'js')));
app.use(
  '/vendor/chart.js',
  express.static(path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist', 'chart.umd.js'))
);
app.use('/uploads/atestados', requireLogin, express.static(path.join(__dirname, '..', 'uploads', 'atestados')));

app.use(authRoutes);
app.use(usuariosRoutes);
app.use(obrasRoutes);
app.use(funcionariosRoutes);
app.use(ocorrenciasRoutes);
app.use(plRoutes);
app.use(dashboardRoutes);

app.use((req, res) => {
  res.status(404).render('erro', {
    titulo: 'Página não encontrada',
    mensagem: 'A página que você tentou acessar não existe.',
    usuario: req.session.usuario,
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('erro', {
    titulo: 'Erro inesperado',
    mensagem: 'Ocorreu um erro ao processar sua solicitação.',
    usuario: req.session?.usuario,
  });
});

module.exports = app;
