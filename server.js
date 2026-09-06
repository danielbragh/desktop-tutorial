require('dotenv').config();

const PRODUCAO = process.env.NODE_ENV === 'production';
const SEGREDO_PADRAO = 'rh-sistema-segredo-de-sessao-troque-em-producao';

if (PRODUCAO && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === SEGREDO_PADRAO)) {
  console.error(
    'SESSION_SECRET não configurado (ou usando o valor padrão) com NODE_ENV=production. ' +
      'Defina um segredo forte antes de subir em produção. Gere um com:\n' +
      '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
  );
  process.exit(1);
}

if (PRODUCAO && (!process.env.ADMIN_SENHA_INICIAL || process.env.ADMIN_SENHA_INICIAL.length < 10)) {
  console.error(
    'ADMIN_SENHA_INICIAL não configurada (ou muito curta) com NODE_ENV=production. ' +
      'Defina uma senha forte para o usuário admin criado na primeira execução.'
  );
  process.exit(1);
}

const { init } = require('./src/db');
const app = require('./src/app');

const PORT = process.env.PORT || 3000;

init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Sistema de RH rodando em http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Falha ao inicializar o banco de dados:', err);
    process.exit(1);
  });
