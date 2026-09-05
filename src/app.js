const path = require('path');
const express = require('express');
const session = require('express-session');

const authRoutes = require('./routes/auth');
const usuariosRoutes = require('./routes/usuarios');
const obrasRoutes = require('./routes/obras');
const funcionariosRoutes = require('./routes/funcionarios');
const ocorrenciasRoutes = require('./routes/ocorrencias');
const plRoutes = require('./routes/pl');
const dashboardRoutes = require('./routes/dashboard');
const { requireLogin } = require('./middleware/auth');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'rh-sistema-segredo-de-sessao-troque-em-producao',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 },
  })
);

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
    usuario: req.session.usuario,
  });
});

module.exports = app;
