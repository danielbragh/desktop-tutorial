const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'rh.sqlite');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

function seedAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS total FROM users').get().total;
  if (count === 0) {
    const senha = process.env.ADMIN_SENHA_INICIAL || 'admin123';
    const hash = bcrypt.hashSync(senha, 10);
    db.prepare(
      'INSERT INTO users (nome, email, senha_hash, papel) VALUES (?, ?, ?, ?)'
    ).run('Administrador', 'admin@empresa.com', hash, 'admin');
    console.log('----------------------------------------------------');
    console.log('Usuário admin inicial criado:');
    console.log('  E-mail: admin@empresa.com');
    console.log(`  Senha:  ${senha}`);
    console.log('  Troque essa senha assim que possível.');
    console.log('----------------------------------------------------');
  }
}

seedAdmin();

module.exports = db;
