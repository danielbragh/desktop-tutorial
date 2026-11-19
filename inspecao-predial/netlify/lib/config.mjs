// Endereços do projeto Neon "inspecao-predial" (não são segredos).
// As chaves do armazenamento ficam só nas variáveis de ambiente do Netlify:
// NEON_S3_ACCESS_KEY_ID e NEON_S3_SECRET_ACCESS_KEY.

export const NEON = {
  authUrl: 'https://ep-crimson-bar-bbrxpsx8.neonauth.c-15.us-east-1.aws.neon.tech/neondb/auth',
  dataApiUrl: 'https://ep-crimson-bar-bbrxpsx8.apirest.c-15.us-east-1.aws.neon.tech/neondb/rest/v1',
  s3Endpoint: 'https://br-dry-wave-bbpsd0kw.storage.c-15.us-east-1.aws.neon.tech',
  s3Regiao: 'us-east-1',
  bucket: 'fotos',
};

export function configFotos(lerVariavel) {
  const ler = (nome, padrao) => lerVariavel(nome) || padrao;
  const chave = ler('NEON_S3_ACCESS_KEY_ID');
  const segredo = ler('NEON_S3_SECRET_ACCESS_KEY');
  if (!chave || !segredo) throw new Error('Defina NEON_S3_ACCESS_KEY_ID e NEON_S3_SECRET_ACCESS_KEY.');
  return {
    dataApiUrl: ler('NEON_DATA_API_URL', NEON.dataApiUrl),
    armazenamento: {
      endpoint: ler('NEON_S3_ENDPOINT', NEON.s3Endpoint),
      bucket: ler('NEON_S3_BUCKET', NEON.bucket),
      credencial: { chave, segredo, regiao: ler('NEON_S3_REGIAO', NEON.s3Regiao) },
    },
  };
}
