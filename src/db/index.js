const path = require('path');
const fs = require('fs');
const { Pool, types } = require('pg');
const argon2 = require('argon2');

// NUMERIC volta como string por padrão (evita perda de precisão em valores
// monetários arbitrários), mas aqui tratamos como float em JS deliberadamente.
types.setTypeParser(1700, (valor) => (valor === null ? null : parseFloat(valor)));
// DATE volta como string 'YYYY-MM-DD' sem conversão de fuso horário, que é
// como as views já esperam consumir essas colunas.
types.setTypeParser(1082, (valor) => valor);

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/sistema_rh';

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX) || 10,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool de conexões do PostgreSQL:', err);
});

function wrap(executor) {
  return {
    async query(text, params) {
      return executor(text, params);
    },
    async all(text, params) {
      const result = await executor(text, params);
      return result.rows;
    },
    async get(text, params) {
      const result = await executor(text, params);
      return result.rows[0] || null;
    },
    async run(text, params) {
      const result = await executor(text, params);
      return { rowCount: result.rowCount, rows: result.rows };
    },
  };
}

const db = wrap((text, params) => pool.query(text, params));

async function transaction(callback) {
  const client = await pool.connect();
  const scoped = wrap((text, params) => client.query(text, params));
  try {
    await client.query('BEGIN');
    const result = await callback(scoped);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
}

async function seedAdmin() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM users');
  if (rows[0].total === 0) {
    const senha = process.env.ADMIN_SENHA_INICIAL || 'MudeEssaSenha#2026';
    const hash = await argon2.hash(senha, { type: argon2.argon2id });
    await pool.query(
      'INSERT INTO users (nome, email, senha_hash, papel) VALUES ($1, $2, $3, $4)',
      ['Administrador', 'admin@empresa.com', hash, 'admin']
    );
    console.log('----------------------------------------------------');
    console.log('Usuário admin inicial criado:');
    console.log('  E-mail: admin@empresa.com');
    console.log(`  Senha:  ${senha}`);
    console.log('  Troque essa senha assim que possível.');
    console.log('----------------------------------------------------');
  }
}

async function init() {
  await migrate();
  await seedAdmin();
}

module.exports = { pool, db, transaction, init };
