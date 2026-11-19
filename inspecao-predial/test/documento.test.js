import test from 'node:test';
import assert from 'node:assert/strict';
import { novoRelatorio, relatorioExemplo, sugerirItem, CHECKLIST } from '../site/js/modelo.js';
import {
  montarDocumento,
  pendencias,
  fotosNumeradas,
  legendaFoto,
  linhasChecklist,
  resumoSugerido,
  acoesSugeridas,
  resolucao,
  numero,
  formatarData,
  nomeArquivo,
  idAnomalia,
} from '../site/js/documento.js';

const textoDe = (doc) =>
  doc.blocos
    .map((b) => {
      if (b.tipo === 'tabela') return b.linhas.map((l) => l.celulas.map((c) => c.runs.map((r) => r.t).join('')).join(' | ')).join('\n');
      if (b.runs) return b.runs.map((r) => r.t).join('');
      if (b.itens) return b.itens.map((i) => (typeof i === 'string' ? i : i.legenda)).join('\n');
      if (b.linhas) return b.linhas.map((l) => l.map((r) => r.t).join('')).join('\n');
      return b.texto || '';
    })
    .join('\n');

test('números aceitam vírgula, ponto e milhar', () => {
  assert.equal(numero('4,5'), 4.5);
  assert.equal(numero('4.5'), 4.5);
  assert.equal(numero('1.250,5'), 1250.5);
  assert.equal(numero('1.250'), 1250);
  assert.equal(numero('uns 30'), null);
  assert.equal(numero(''), null);
});

test('data ISO vira dd/mm/aaaa', () => {
  assert.equal(formatarData('2026-11-05'), '05/11/2026');
  assert.equal(formatarData(''), '');
});

test('resolução = distância × fator da aeronave', () => {
  const r = novoRelatorio();
  r.equip.distanciaDetalhe = '5';
  assert.equal(resolucao(r).texto, '1,65 mm/px');
  r.equip.distanciaDetalhe = '';
  assert.equal(resolucao(r).valor, null);
});

test('fotos gerais vêm antes das fotos de anomalia, na ordem das anomalias', () => {
  const r = relatorioExemplo();
  const [a1, , a3] = r.anomalias;
  r.fotos = [
    { id: 'x', legenda: '', anomaliaId: a3.id },
    { id: 'g1', legenda: 'Vista geral', anomaliaId: null },
    { id: 'y', legenda: 'Detalhe da telha', anomaliaId: a1.id },
    { id: 'orfa', legenda: 'Sem dono', anomaliaId: 'anomalia-apagada' },
  ];
  const n = fotosNumeradas(r);
  assert.deepEqual(n.map((f) => [f.numero, f.foto.id]), [['01', 'g1'], ['02', 'orfa'], ['03', 'y'], ['04', 'x']]);
  assert.equal(legendaFoto(n[2]), 'Detalhe da telha – anomalia A01');
  assert.equal(legendaFoto(n[3]), `${a3.anomalia} – anomalia A03`);

  const doc = montarDocumento(r);
  const tabela = doc.blocos.find((b) => b.tipo === 'tabela' && b.cabecalho[0] === 'ID');
  const colunaFoto = tabela.linhas.map((l) => l.celulas[4].runs[0].t);
  assert.deepEqual(colunaFoto, ['03', '—', '04', '—', '—']);
});

test('checklist marca "Anomalia" com as referências', () => {
  const r = relatorioExemplo();
  const linhas = linhasChecklist(r);
  assert.deepEqual(linhas[0], { nome: CHECKLIST[0].nome, situacao: 'Anomalia', ref: 'A01' });
  assert.equal(linhas[3].situacao, 'OK');
  assert.equal(linhas[9].situacao, 'Não inspecionado');
  r.anomalias[4].item = '0';
  assert.equal(linhasChecklist(r)[0].ref, 'A01, A05');
});

test('elemento digitado sugere o item do checklist', () => {
  assert.equal(sugerirItem('Calha frontal'), '1');
  assert.equal(sugerirItem('Rufo'), '2');
  assert.equal(sugerirItem('Manta asfáltica'), '5');
  assert.equal(sugerirItem('Cordoalha do SPDA'), '9');
  assert.equal(sugerirItem('Algo sem relação'), '');
  assert.equal(sugerirItem(''), '');
});

test('resumo e ações sugeridas seguem os graus', () => {
  const r = relatorioExemplo();
  assert.equal(
    resumoSugerido(r),
    'Foram registradas 5 anomalias na cobertura: 1 de grau crítico, 3 de grau médio e 1 de grau mínimo. ' +
      'O item crítico (A03) exige intervenção imediata. ' +
      'Os itens de grau médio (A01, A02 e A04) devem ser tratados antes do período chuvoso. ' +
      'O item de grau mínimo (A05) pode seguir a manutenção programada.'
  );
  const a = acoesSugeridas(r);
  assert.equal(a.imediata, 'A03: Refixar e revedar; verificar infiltração no pavimento abaixo');
  assert.equal(a.curto.split('\n').length, 3);
  const vazio = novoRelatorio();
  assert.match(resumoSugerido(vazio), /Não foram identificadas anomalias/);
  assert.equal(acoesSugeridas(vazio).imediata, 'Nenhuma ação nesta prioridade.');
});

test('pendências: relatório novo tem, exemplo completo não', () => {
  const novo = novoRelatorio(undefined, '2026-001');
  const p = pendencias(novo);
  assert.ok(p.some((x) => x.texto === 'Cliente / contratante'));
  assert.ok(p.some((x) => x.secao === 'checklist'));
  const ex = relatorioExemplo(undefined, '2026-000');
  ex.conclusao.resumo = resumoSugerido(ex);
  ex.fotos = [{ id: 'f', legenda: 'Vista geral', anomaliaId: null }];
  assert.deepEqual(pendencias(ex), []);
  ex.anomalias[1].grau = '';
  assert.deepEqual(pendencias(ex), [{ secao: 'anomalias', texto: 'A02: falta grau' }]);
});

test('documento tem as 11 seções do modelo; Anexo A só quando pedido', () => {
  const r = relatorioExemplo(undefined, '2026-000');
  const titulos = (doc) => doc.blocos.filter((b) => b.tipo === 'h1').map((b) => b.texto);
  const sem = montarDocumento(r);
  assert.deepEqual(titulos(sem), [
    '1. Identificação',
    '2. Objetivo e escopo',
    '3. Metodologia',
    '4. Critérios de classificação',
    '5. Caracterização da cobertura',
    '6. Registro das anomalias',
    '7. Registro fotográfico',
    '8. Checklist dos elementos inspecionados',
    '9. Conclusão e recomendações',
    '10. Limitações',
    '11. Responsabilidade técnica',
  ]);
  const com = montarDocumento(r, { anexo: true });
  assert.equal(titulos(com).length, 12);
  assert.match(textoDe(com), /\[X\] Sim   \[  \] Não/);
  assert.doesNotMatch(textoDe(sem), /pré-voo|Piloto/);
});

test('campos em branco saem como travessão e nenhum marcador do modelo sobra', () => {
  const doc = montarDocumento(novoRelatorio(), { anexo: true });
  const t = textoDe(doc);
  assert.match(t, /Cliente \/ contratante \| —/);
  assert.doesNotMatch(t, /\[\.\.\.|\[dd\/mm|\[AAAA|MODELO|\[Inserir/);
  assert.match(t, /Não foram identificadas anomalias aparentes/);
  assert.match(t, /Sem registro fotográfico anexado/);
});

test('nome do arquivo sem acentos nem símbolos', () => {
  const r = novoRelatorio(undefined, '2026-014');
  r.ident.cliente = 'Condomínio São João / Bloco "A"';
  assert.equal(nomeArquivo(r), 'Relatorio_2026-014_Condominio_Sao_Joao_Bloco_A');
  assert.equal(idAnomalia(11), 'A12');
});
