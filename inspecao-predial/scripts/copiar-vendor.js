// Copia as bibliotecas de node_modules para site/vendor/ (usadas pelo app sem etapa de build).
// Rode `npm install && npm run vendor` depois de atualizar as versões no package.json.
import { copyFileSync } from 'node:fs';

const arquivos = [
  ['node_modules/jszip/dist/jszip.min.js', 'site/vendor/jszip.min.js'],
  ['node_modules/pdfmake/build/pdfmake.min.js', 'site/vendor/pdfmake.min.js'],
];
for (const [de, para] of arquivos) {
  copyFileSync(de, para);
  console.log(`${de} -> ${para}`);
}
