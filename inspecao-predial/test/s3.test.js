import test from 'node:test';
import assert from 'node:assert/strict';
import { AwsV4Signer } from 'aws4fetch';
import { assinar, codificarCaminho } from '../netlify/lib/s3.mjs';

const credencial = { chave: 'AKIAIOSFODNN7EXAMPLE', segredo: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', regiao: 'us-east-1' };
const agora = new Date('2013-05-24T00:00:00Z');

test('exemplo oficial da AWS (GET com Range) gera a mesma assinatura', () => {
  // docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
  const h = assinar({ metodo: 'GET', url: 'https://examplebucket.s3.amazonaws.com/test.txt', cabecalhos: { range: 'bytes=0-9' }, credencial, agora });
  assert.equal(
    h.authorization,
    'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41'
  );
});

test('PUT com corpo assina igual ao aws4fetch (mesmos cabeçalhos)', async () => {
  const url = 'https://br-exemplo.storage.c-15.us-east-1.aws.neon.tech/fotos/rel-0001/foto-0001';
  const corpo = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
  // O aws4fetch usa UNSIGNED-PAYLOAD no S3 e não assina content-type; aqui os dois fazem igual.
  const meu = assinar({ metodo: 'PUT', url, corpo, credencial, agora, corpoSemAssinatura: true });
  const ref = await new AwsV4Signer({
    url,
    method: 'PUT',
    body: corpo,
    accessKeyId: credencial.chave,
    secretAccessKey: credencial.segredo,
    region: 'us-east-1',
    service: 's3',
    datetime: '20130524T000000Z',
  }).sign();
  assert.equal(meu.authorization, ref.headers.get('authorization'));
  assert.equal(meu['x-amz-content-sha256'], ref.headers.get('x-amz-content-sha256'));
});

test('exemplo oficial da AWS (PUT com corpo assinado) gera a mesma assinatura', () => {
  const h = assinar({
    metodo: 'PUT',
    url: 'https://examplebucket.s3.amazonaws.com/test$file.text',
    cabecalhos: { date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-storage-class': 'REDUCED_REDUNDANCY' },
    corpo: 'Welcome to Amazon S3.',
    credencial,
    agora,
  });
  assert.match(h.authorization, /Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd$/);
});

test('caminho com caracteres especiais é codificado como a SigV4 pede', () => {
  assert.equal(codificarCaminho("/fotos/a b/c(1)!*'"), '/fotos/a%20b/c%281%29%21%2A%27');
});
