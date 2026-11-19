// Fotos dos relatórios: GET baixa, PUT envia, DELETE apaga.
// Rota: /api/fotos/:relatorio/:foto (ver netlify/lib/fotos.mjs).

import { configFotos } from '../lib/config.mjs';
import { criarRotaFotos } from '../lib/fotos.mjs';

let rota = null;

export default async (req, context) => {
  rota = rota || criarRotaFotos(configFotos((nome) => Netlify.env.get(nome)));
  return rota(req, context.params);
};

export const config = {
  path: '/api/fotos/:relatorio/:foto',
  method: ['GET', 'PUT', 'DELETE'],
};
