-- Esquema do banco de dados do Sistema de RH (PostgreSQL)

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'rh' CHECK (papel IN ('admin', 'rh')),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  falhas_login INTEGER NOT NULL DEFAULT 0,
  bloqueado_ate TIMESTAMPTZ,
  senha_alterada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS obras (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  codigo TEXT NOT NULL UNIQUE,
  endereco TEXT,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'encerrada')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS funcionarios (
  id SERIAL PRIMARY KEY,
  matricula TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL UNIQUE,
  cargo TEXT NOT NULL,
  data_admissao DATE NOT NULL,
  data_desligamento DATE,
  salario NUMERIC(12,2) NOT NULL,
  tipo_vinculo TEXT NOT NULL CHECK (tipo_vinculo IN ('escritorio', 'obra')),
  obra_id INTEGER REFERENCES obras(id),
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'desligado')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (tipo_vinculo = 'obra' AND obra_id IS NOT NULL) OR
    (tipo_vinculo = 'escritorio' AND obra_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS ocorrencias (
  id SERIAL PRIMARY KEY,
  funcionario_id INTEGER NOT NULL REFERENCES funcionarios(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('falta_justificada', 'falta_injustificada', 'atestado')),
  data_inicio DATE NOT NULL,
  dias INTEGER NOT NULL DEFAULT 1,
  cid TEXT,
  observacao TEXT,
  anexo TEXT,
  lancado_por INTEGER REFERENCES users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pl_config (
  id SERIAL PRIMARY KEY,
  ano INTEGER NOT NULL UNIQUE,
  periodo_inicio DATE NOT NULL,
  periodo_fim DATE NOT NULL,
  valor_fixo NUMERIC(12,2) NOT NULL DEFAULT 0,
  percentual_variavel NUMERIC(6,3) NOT NULL DEFAULT 0,
  meses_totais_periodo INTEGER NOT NULL DEFAULT 12,
  limite_faltas_injustificadas_mes INTEGER NOT NULL DEFAULT 1,
  descontar_mes_por_excesso_faltas BOOLEAN NOT NULL DEFAULT TRUE,
  limite_faltas_zerar INTEGER,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pl_calculos (
  id SERIAL PRIMARY KEY,
  ano INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL REFERENCES funcionarios(id),
  meses_computados NUMERIC(6,2) NOT NULL,
  total_faltas_injustificadas INTEGER NOT NULL,
  zerado_por_faltas BOOLEAN NOT NULL DEFAULT FALSE,
  valor_base NUMERIC(12,2) NOT NULL,
  fracao NUMERIC(6,4) NOT NULL,
  valor_bruto NUMERIC(12,2) NOT NULL,
  valor_liquido NUMERIC(12,2) NOT NULL,
  detalhes_json JSONB,
  calculado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  calculado_por INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  ocorrido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_id INTEGER REFERENCES users(id),
  usuario_email TEXT,
  acao TEXT NOT NULL,
  entidade TEXT,
  entidade_id TEXT,
  ip TEXT,
  detalhes JSONB
);

CREATE INDEX IF NOT EXISTS idx_funcionarios_obra ON funcionarios(obra_id);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_funcionario ON ocorrencias(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_data ON ocorrencias(data_inicio);
CREATE INDEX IF NOT EXISTS idx_pl_calculos_ano ON pl_calculos(ano);
CREATE INDEX IF NOT EXISTS idx_audit_log_ocorrido_em ON audit_log(ocorrido_em);
CREATE INDEX IF NOT EXISTS idx_audit_log_usuario ON audit_log(usuario_id);
