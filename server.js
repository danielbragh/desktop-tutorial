require('./src/db');
const app = require('./src/app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Sistema de RH rodando em http://localhost:${PORT}`);
});
