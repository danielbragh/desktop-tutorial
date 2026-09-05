-- Esquema do banco de dados do Sistema de RH
-- SQLite

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'rh' CHECK (papel IN ('admin', 'rh')),
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS obras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  codigo TEXT NOT NULL UNIQUE,
  endereco TEXT,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'encerrada')),
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL UNIQUE,
  cargo TEXT NOT NULL,
  data_admissao TEXT NOT NULL,
  data_desligamento TEXT,
  salario REAL NOT NULL,
  tipo_vinculo TEXT NOT NULL CHECK (tipo_vinculo IN ('escritorio', 'obra')),
  obra_id INTEGER REFERENCES obras(id),
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'desligado')),
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (tipo_vinculo = 'obra' AND obra_id IS NOT NULL) OR
    (tipo_vinculo = 'escritorio' AND obra_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS ocorrencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL REFERENCES funcionarios(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('falta_justificada', 'falta_injustificada', 'atestado')),
  data_inicio TEXT NOT NULL,
  dias INTEGER NOT NULL DEFAULT 1,
  cid TEXT,
  observacao TEXT,
  anexo TEXT,
  lancado_por INTEGER REFERENCES users(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pl_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ano INTEGER NOT NULL UNIQUE,
  periodo_inicio TEXT NOT NULL,
  periodo_fim TEXT NOT NULL,
  valor_fixo REAL NOT NULL DEFAULT 0,
  percentual_variavel REAL NOT NULL DEFAULT 0,
  meses_totais_periodo INTEGER NOT NULL DEFAULT 12,
  limite_faltas_injustificadas_mes INTEGER NOT NULL DEFAULT 1,
  descontar_mes_por_excesso_faltas INTEGER NOT NULL DEFAULT 1,
  limite_faltas_zerar INTEGER,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pl_calculos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ano INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL REFERENCES funcionarios(id),
  meses_computados REAL NOT NULL,
  total_faltas_injustificadas INTEGER NOT NULL,
  zerado_por_faltas INTEGER NOT NULL DEFAULT 0,
  valor_base REAL NOT NULL,
  fracao REAL NOT NULL,
  valor_bruto REAL NOT NULL,
  valor_liquido REAL NOT NULL,
  detalhes_json TEXT,
  calculado_em TEXT NOT NULL DEFAULT (datetime('now')),
  calculado_por INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_funcionarios_obra ON funcionarios(obra_id);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_funcionario ON ocorrencias(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_data ON ocorrencias(data_inicio);
CREATE INDEX IF NOT EXISTS idx_pl_calculos_ano ON pl_calculos(ano);
