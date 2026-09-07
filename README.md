# Sistema de RH

Aplicação web para apoiar a rotina do setor de RH: cadastro de funcionários e
obras, lançamento de faltas/atestados, cálculo da PL (Participação nos
Lucros) e um dashboard com indicadores.

## Funcionalidades

- **Cadastro de funcionários**: nome, CPF (com validação), matrícula/ID,
  cargo, data de admissão, salário e tipo de vínculo (escritório ou obra).
  Funcionários de obra ficam vinculados à obra em que trabalham.
- **Cadastro de obras**: já que a empresa tem mais de uma obra, cada
  funcionário de obra é associado a um canteiro específico.
- **Faltas e atestados**: lançamento de falta justificada, falta
  injustificada ou atestado médico, com dias, CID (opcional) e anexo do
  atestado (PDF/PNG/JPG, validado pelo conteúdo real do arquivo).
- **Cálculo de PL**: parâmetros configuráveis por ano-base (parcela fixa,
  percentual sobre o salário, limite de faltas injustificadas por mês,
  limite de faltas que zera o benefício) e relatório com o valor calculado
  por funcionário. **Veja o aviso importante no final deste documento.**
- **Dashboard**: cargos com mais faltas, ocorrências por tipo, massa
  salarial por cargo e valor de PL pago por cargo.
- **Login multiusuário** com papéis RH/Administrador, troca de senha e
  bloqueio de conta por tentativas indevidas.

## Banco de dados

PostgreSQL. A conexão é configurada via `DATABASE_URL` (padrão
`postgres://sistema_rh:troque_esta_senha@localhost:5432/sistema_rh`). O
schema (`src/db/schema.sql`) é aplicado automaticamente na primeira
execução (`CREATE TABLE IF NOT EXISTS`), sem necessidade de ferramenta de
migração externa.

Para desenvolvimento local com Docker:

```bash
docker compose up -d      # sobe um PostgreSQL em localhost:5432
cp .env.example .env      # ajuste DATABASE_URL, SESSION_SECRET etc.
npm install
npm start
```

Sem Docker, aponte `DATABASE_URL` para qualquer PostgreSQL 13+ acessível
(local, RDS, Cloud SQL etc.).

## Segurança

Este backend segue um conjunto de práticas reconhecidas pela indústria
(OWASP ASVS/Top 10) — não existe "segurança total", mas o conjunto abaixo
cobre as camadas mais relevantes para uma aplicação de RH que guarda dados
pessoais (CPF, salário, atestados médicos):

| Camada | O que foi implementado |
|---|---|
| Senha | Hash com **Argon2id** (vencedor da Password Hashing Competition, recomendação atual da OWASP), política mínima de 10 caracteres com maiúscula/minúscula/número |
| Força bruta | Rate limiting no `/login` (express-rate-limit) + **bloqueio de conta** por 15 min após 5 tentativas falhas, registrado por usuário no banco |
| Sessão | Cookie `httpOnly`, `sameSite=lax`, `secure` em produção, sessão persistida no PostgreSQL (`connect-pg-simple`) em vez de memória do processo, regenerada a cada login (mitiga session fixation) |
| CSRF | Token por sessão validado em toda requisição que altera estado (padrão *synchronizer token*), com tratamento específico para o único formulário multipart (upload de atestado) |
| XSS / injeção de conteúdo | CSP estrita via Helmet: `script-src` restrito a `'self'` + nonce por requisição (sem `unsafe-inline` em scripts); EJS escapa HTML por padrão |
| Cabeçalhos HTTP | Helmet: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, HSTS em produção |
| SQL injection | 100% de queries parametrizadas (`$1, $2...`) via `pg`, nenhuma concatenação de string em SQL |
| Upload de arquivo | Validação por **assinatura binária real** do arquivo (magic bytes de PDF/PNG/JPEG), não apenas pelo `Content-Type` declarado pelo navegador; nome de arquivo gerado aleatoriamente; servido só para usuários autenticados |
| Autorização | Middleware de papel (`admin` vs `rh`) nas rotas administrativas |
| Auditoria | Tabela `audit_log` registra login (sucesso/falha/bloqueio), criação/edição de registros, troca de senha e cálculo de PL, com IP e usuário |
| Validação de entrada | `express-validator` nas rotas de escrita (funcionários, obras, usuários, configuração de PL) |
| Configuração | Segredos fora do código-fonte (`.env`), com checagem que **recusa subir em produção** com `SESSION_SECRET` ou senha de admin padrão/fracos |
| DoS básico | Limite de tamanho de payload (100kb) e rate limiting global (600 req/15min por IP) |

### O que fica fora do escopo deste código (responsabilidade de infraestrutura)

- **TLS/HTTPS**: a aplicação espera rodar atrás de um proxy reverso (nginx,
  load balancer, Cloudflare etc.) que termine TLS. Configure `TRUST_PROXY=true`
  nesse cenário para que rate limiting e cookies `secure` funcionem com o IP
  real do cliente.
- **Backups e criptografia em repouso do banco**: configure no provedor do
  PostgreSQL.
- **WAF / proteção contra DDoS de rede**: geralmente feita na borda (CDN/LB),
  não no processo Node.
- **2FA**: não implementado nesta versão: pode ser adicionado (TOTP) na
  tabela `users` se o negócio exigir esse nível adicional.

## Como rodar

Pré-requisitos: Node.js 18+, PostgreSQL 13+ (local ou via `docker compose`).

```bash
cp .env.example .env   # edite DATABASE_URL, SESSION_SECRET, etc.
npm install
npm start
```

A aplicação sobe em `http://localhost:3000`. No primeiro start, um usuário
administrador é criado automaticamente e as credenciais aparecem no
terminal (e-mail `admin@empresa.com`). **Troque essa senha em "Minha conta"
assim que possível.**

Para desenvolvimento com reinício automático ao salvar arquivos:

```bash
npm run dev
```

Para rodar os testes automatizados (lógica de cálculo da PL):

```bash
npm test
```

## Variáveis de ambiente

Veja `.env.example`. As mais importantes:

- `DATABASE_URL`: string de conexão do PostgreSQL.
- `SESSION_SECRET`: segredo para assinar o cookie de sessão. Gere um com
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
  **Obrigatório e não pode ser o valor padrão quando `NODE_ENV=production`.**
- `ADMIN_SENHA_INICIAL`: senha do admin criado na primeira execução.
  Obrigatória (mínimo 10 caracteres) quando `NODE_ENV=production`.
- `TRUST_PROXY`: `true` se a aplicação roda atrás de um proxy reverso.
- `PORT`: porta HTTP (padrão `3000`).

## Estrutura do projeto

```
src/
  db/            schema SQL (PostgreSQL) e conexão (pool + helpers async)
  services/      lógica de cálculo da PL (isolada, testável)
  routes/        rotas HTTP por módulo (funcionários, obras, ocorrências, PL, dashboard, auth)
  middleware/     autenticação/autorização e CSRF
  utils/         validação de CPF, formatação, política de senha, assinatura de arquivo, auditoria
views/           templates EJS (uma pasta por módulo)
public/          CSS e assets estáticos
test/            testes automatizados
docker-compose.yml  PostgreSQL para desenvolvimento local
```

## Aviso importante sobre o cálculo da PL

O cálculo implementado é um **modelo genérico e configurável**, não é a
transcrição de nenhuma Convenção Coletiva de Trabalho (CCT) específica do
SINDUSCON. A regra de PL varia por sindicato, região e ano. Antes de usar
os valores para pagamento:

1. Consulte a CCT vigente da categoria.
2. Ajuste os parâmetros em **Configurar PL** (parcela fixa, percentual
   variável, limite de faltas por mês, limite de faltas que zera o
   benefício) para refletir a regra real.
3. Se a fórmula da CCT for muito diferente do modelo (proporcional a meses
   trabalhados, com desconto por faltas), a lógica em
   `src/services/plCalculator.js` precisará ser adaptada — ela é isolada do
   resto do sistema justamente para facilitar esse ajuste.
