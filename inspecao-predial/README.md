# Inspeção de Cobertura

App para preencher em campo o **Relatório de Inspeção Visual de Cobertura com
drone** e emitir o documento em **DOCX** ou **PDF**, no mesmo formato do modelo
`Modelo_Relatorio_Inspecao_Cobertura_Drone.docx`.

É um site estático (PWA): abre no navegador do celular, do tablet ou do
computador, pode ser instalado na tela inicial e funciona sem internet. Não tem
servidor nem login. Os relatórios e as fotos ficam guardados no próprio
aparelho.

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
npm start
```

Abre em `http://localhost:4173`. Não há etapa de build.

## Como publicar

Hospede a pasta `inspecao-predial/` em qualquer serviço de site estático
(Netlify, GitHub Pages, Cloudflare Pages…). É preciso HTTPS para o app poder
ser instalado e funcionar offline. No celular, abra o endereço e use "Adicionar
à tela inicial".

Ao publicar uma versão nova, troque `VERSAO` em `sw.js` para os aparelhos
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
index.html            página única
css/app.css           estilos (tema claro e escuro)
js/modelo.js          textos e listas do modelo; estrutura de um relatório
js/documento.js       regras: numeração, pendências, resumo, blocos do documento
js/docx.js            gerador de DOCX
js/pdf.js             gerador de PDF
js/previa.js          pré-visualização em HTML
js/store.js           armazenamento no aparelho (IndexedDB)
js/fotos.js           redução e conversão de imagens
js/app.js             interface
sw.js                 funcionamento offline
assets/               modelo base, logo e ícones
vendor/               JSZip, pdfmake e fontes Liberation Sans
test/                 testes automatizados
```

## Testes

```bash
npm install
npm test
```

Cobrem as regras do relatório (numeração de fotos e anomalias, checklist,
pendências, resumo) e a geração dos arquivos DOCX e PDF.

## Bibliotecas incluídas

- [JSZip](https://stuk.github.io/jszip/) 3.10.1 (MIT)
- [pdfmake](https://pdfmake.github.io/docs/) 0.2.20 (MIT)
- [Liberation Sans](https://github.com/liberationfonts) 2.1.5 (SIL OFL 1.1, ver `vendor/fonts/LICENSE-OFL.txt`)

`npm run vendor` copia as bibliotecas de `node_modules` para `vendor/` depois
de uma atualização de versão.

## Limites conhecidos

- Os dados ficam só no navegador do aparelho. Limpar os dados do navegador
  apaga os relatórios: exporte uma cópia com frequência.
- Não há sincronização entre aparelhos; use exportar/importar cópia.
- O relatório segue este modelo (cobertura com drone). Outros tipos de
  inspeção predial pedem um novo conjunto de seções em `js/modelo.js` e
  `js/documento.js`.
