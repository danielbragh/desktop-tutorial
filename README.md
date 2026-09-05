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
  atestado (PDF/PNG/JPG).
- **Cálculo de PL**: parâmetros configuráveis por ano-base (parcela fixa,
  percentual sobre o salário, limite de faltas injustificadas por mês,
  limite de faltas que zera o benefício) e relatório com o valor calculado
  por funcionário. **Veja o aviso importante abaixo.**
- **Dashboard**: cargos com mais faltas/atestados, ocorrências por tipo,
  massa salarial por cargo e valor de PL pago por cargo.
- **Login**: cada pessoa do RH tem seu próprio usuário e senha
  (administradores podem cadastrar novos usuários em "Usuários").

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

## Como rodar

Pré-requisitos: Node.js 18 ou superior.

```bash
npm install
npm start
```

A aplicação sobe em `http://localhost:3000`. No primeiro start, um usuário
administrador é criado automaticamente e as credenciais aparecem no
terminal:

```
E-mail: admin@empresa.com
Senha:  admin123
```

Troque essa senha (crie um novo usuário e desative o padrão, ou simplesmente
use-o para criar os usuários reais do RH em **Usuários**).

Para desenvolvimento com reinício automático ao salvar arquivos:

```bash
npm run dev
```

Para rodar os testes automatizados (incluem a lógica de cálculo da PL):

```bash
npm test
```

## Configuração

- `PORT`: porta do servidor (padrão `3000`).
- `SESSION_SECRET`: segredo usado para assinar o cookie de sessão — defina
  um valor próprio em produção.
- `ADMIN_SENHA_INICIAL`: senha do usuário admin criado no primeiro start
  (padrão `admin123`).
- `DB_PATH`: caminho do arquivo do banco SQLite (padrão `data/rh.sqlite`).

## Dados e armazenamento

Os dados ficam em um arquivo SQLite local (`data/rh.sqlite`, criado
automaticamente) e os anexos de atestado em `uploads/atestados/`. Nenhuma
dessas pastas é versionada no Git (veja `.gitignore`) — faça backup desses
arquivos periodicamente, pois eles contêm os dados reais da empresa.

## Estrutura do projeto

```
src/
  db/            esquema SQL e conexão com o SQLite
  services/      lógica de cálculo da PL (isolada, testável)
  routes/        rotas HTTP por módulo (funcionários, obras, ocorrências, PL, dashboard)
  middleware/     autenticação/autorização
  utils/         validação de CPF, formatação
views/           templates EJS (uma pasta por módulo)
public/          CSS e assets estáticos
test/            testes automatizados
```
