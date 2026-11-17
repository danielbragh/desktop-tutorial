# Inspeção de Cobertura

App para preencher em campo o **Relatório de Inspeção Visual de Cobertura com
drone** e emitir o documento em **DOCX** ou **PDF**, no mesmo formato do modelo
`Modelo_Relatorio_Inspecao_Cobertura_Drone.docx`.

É um PWA: abre no navegador do celular, do tablet ou do computador, pode ser
instalado na tela inicial e funciona sem internet. Os dados ficam num banco
de dados na nuvem, compartilhado pela equipe.

## Onde ficam os dados

| O quê | Onde | Observação |
|---|---|---|
| Relatórios, equipe, "Meus dados" | Banco PostgreSQL no **Neon**, projeto `inspecao-predial` (região EUA Leste) | Tabelas `relatorios`, `membros`, `perfis`. Esquema em `banco/esquema.sql`. |
| Fotos | **Armazenamento de objetos do Neon**, bucket privado `fotos` | Um arquivo por foto, em `<relatório>/<foto>`. |
| Contas (e-mail e senha) | **Neon Auth** | Senhas guardadas pelo serviço de login, nunca pelo app. |
| Cópia de trabalho | IndexedDB do navegador de cada aparelho | Permite usar sem internet. Apagada ao sair da conta. |

Plano gratuito do Neon: 1 GB de banco e 5 GB de fotos por projeto. Cada foto
fica com cerca de 200 a 400 KB, o que dá algo como 12 a 25 mil fotos.

### Quem vê o quê

- A **primeira conta** criada vira administradora.
- As seguintes ficam **aguardando aprovação** até um administrador liberar em
  *Conta > Equipe*.
- Todos os aprovados veem e editam todos os relatórios da equipe.
- As regras ficam no próprio banco (Row Level Security): mesmo quem tiver o
  endereço da API não lê nada sem uma conta aprovada.

### Sincronização

O aparelho grava primeiro na cópia local e envia ao banco em seguida. Sem
internet, as alterações esperam e são enviadas quando a conexão volta; o
indicador no topo mostra "Sincronizado", "N a enviar" ou "Sem conexão".

Se o mesmo relatório for editado em dois aparelhos sem internet, vale a edição
mais recente. Um relatório excluído não volta. O relatório de exemplo fica só
no aparelho.

## O que faz

- **Lista de relatórios** com numeração automática `AAAA-NNN`, contagem de
  anomalias por grau e quantos campos ainda faltam.
- **Formulário por seções**, na ordem do modelo: identificação, objetivo e
  escopo, metodologia (equipamento, conformidade, procedimento), caracterização
  da cobertura, anomalias, fotos, checklist, conclusão, limitações,
  responsabilidade técnica e Anexo A (registro do voo).
- **Campos a preencher em amarelo**, como no modelo, e lista de pendências
  antes de emitir. Campo em branco sai como "—" no documento.
- **Anomalias** com ID automático (A01, A02…), grau (Crítico, Médio, Mínimo,
  Observação) e fotos próprias. Reordenar ou excluir renumera tudo.
- **Fotos** da galeria ou da câmera, reduzidas para 1600 px. São numeradas
  sozinhas (vistas gerais primeiro, depois as de cada anomalia) e a coluna
  "Foto" da tabela de anomalias é preenchida com esses números.
- **Checklist** ligado às anomalias: o item que tem anomalia já aparece como
  "Anomalia" com a referência (A0x).
- **Cálculos automáticos**: resolução no objeto (distância × fator da
  aeronave), ações por prioridade a partir das recomendações e sugestão de
  texto para o resumo da conclusão.
- **Meus dados**: responsável técnico, registro, cidade, aeronave, SISANT,
  seguro RETA e logo do cabeçalho entram prontos em cada relatório novo.
- **Anexo A** (uso interno) só entra no arquivo quando marcado na emissão.
- **Cópia de segurança**: exporta e importa todos os relatórios em um arquivo
  `.json`, para backup ou para levar a outro aparelho.

## Como usar no computador

```bash
npm install
npm start
```

Abre em `http://localhost:4173`, já ligado ao Neon de verdade. Para as fotos
sincronizarem localmente, defina antes `NEON_S3_ACCESS_KEY_ID` e
`NEON_S3_SECRET_ACCESS_KEY` (a chave fica nas variáveis de ambiente do site no
Netlify e pode ser criada de novo no console do Neon, em *Settings >
Credentials*).

## Publicação (Netlify)

Site `inspecao-cobertura` no Netlify, configurado por `netlify.toml`:

- publica a pasta `site/`;
- a função `netlify/functions/fotos.mjs` atende `/api/fotos/...`;
- `/neondb/auth/*` e `/neondb/rest/v1/*` são repassados ao Neon, para o login
  funcionar no mesmo endereço do app (o Safari bloqueia cookies de outro
  domínio).

Variáveis de ambiente do site: `NEON_S3_ACCESS_KEY_ID` e
`NEON_S3_SECRET_ACCESS_KEY`. Os demais endereços do Neon estão em
`netlify/lib/config.mjs` (não são segredos).

Se o endereço do site mudar (domínio próprio, por exemplo), inclua o novo
endereço em *Neon > Auth > Trusted domains*, senão o login recusa o acesso.

Ao publicar uma versão nova, troque `VERSAO` em `site/sw.js` para os aparelhos
baixarem os arquivos atualizados.

## Como o documento é gerado

`js/documento.js` transforma os dados do relatório em uma lista de blocos
(títulos, parágrafos, tabelas, fotos). Três leitores usam essa mesma lista, então
o conteúdo é sempre igual nos três:

| Arquivo | Saída |
|---|---|
| `js/docx.js` | DOCX. Usa `assets/modelo-base.docx` (o modelo original) como base: estilos, cabeçalho com logo, rodapé, numeração e margens vêm dele sem alteração; só o corpo é reescrito. |
| `js/pdf.js` | PDF, via pdfmake, com as mesmas medidas (A4, margens de 2 cm, larguras de coluna do modelo). |
| `js/previa.js` | Pré-visualização na tela. |

Para mudar textos fixos, itens do checklist, verificações pré-voo ou os dados
padrão do responsável técnico, edite `js/modelo.js`.

O PDF usa a fonte Liberation Sans, que tem as mesmas medidas da Arial do
modelo, para as linhas e páginas quebrarem como no Word.

## Estrutura

```
site/index.html              página única
site/css/app.css             estilos (tema claro e escuro)
site/js/modelo.js            textos e listas do modelo; estrutura de um relatório
site/js/documento.js         regras: numeração, pendências, resumo, blocos do documento
site/js/docx.js              gerador de DOCX
site/js/pdf.js               gerador de PDF
site/js/previa.js            pré-visualização em HTML
site/js/store.js             cópia local (IndexedDB)
site/js/nuvem.js             login, banco e fotos no servidor
site/js/sync.js              sincronização aparelho <-> banco
site/js/fotos.js             redução e conversão de imagens
site/js/app.js               interface
site/sw.js                   funcionamento offline
site/assets/                 modelo base, logo e ícones
site/vendor/                 JSZip, pdfmake e fontes Liberation Sans
netlify/functions/fotos.mjs  função das fotos (Netlify)
netlify/lib/                 lógica da função, assinatura S3, endereços do Neon
banco/esquema.sql            tabelas, regras de acesso e funções do banco
servidor.js                  servidor local equivalente ao Netlify
test/                        testes automatizados (com um Neon falso)
```

## Testes

```bash
npm install
npm test
```

Cobrem as regras do relatório, a geração de DOCX e PDF, a assinatura das
requisições ao armazenamento (conferida com os exemplos oficiais da AWS), a
função das fotos e a sincronização entre dois aparelhos (login, aprovação,
conflitos, exclusão, falta de internet). Os testes usam um Neon falso em
memória (`test/neon-falso.mjs`), sem acessar a internet.

## Bibliotecas incluídas

- [JSZip](https://stuk.github.io/jszip/) 3.10.1 (MIT)
- [pdfmake](https://pdfmake.github.io/docs/) 0.2.20 (MIT)
- [Liberation Sans](https://github.com/liberationfonts) 2.1.5 (SIL OFL 1.1, ver `vendor/fonts/LICENSE-OFL.txt`)

`npm run vendor` copia as bibliotecas de `node_modules` para `site/vendor/` depois
de uma atualização de versão.

## Limites conhecidos

- Conflito entre dois aparelhos é resolvido pelo relatório inteiro: vale a
  edição mais recente, e a outra se perde.
- As fotos de um relatório feito em outro aparelho são baixadas quando ele é
  aberto. Para emitir sem internet, abra o relatório antes, com conexão.
- O relatório segue este modelo (cobertura com drone). Outros tipos de
  inspeção predial pedem um novo conjunto de seções em `site/js/modelo.js` e
  `site/js/documento.js`.
