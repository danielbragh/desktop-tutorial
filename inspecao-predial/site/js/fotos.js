// Tratamento de imagens no aparelho: reduz as fotos antes de guardar (as do
// drone têm 12 MP; 1600 px no lado maior sobram para o relatório) e converte
// entre os formatos que o DOCX e o PDF precisam.

const LADO_MAXIMO = 1600;
const QUALIDADE = 0.82;

async function decodificar(arquivo) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
    } catch {
      /* cai para <img> */
    }
  }
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function paraCanvas(imagem, ladoMaximo) {
  const w0 = imagem.naturalWidth || imagem.width;
  const h0 = imagem.naturalHeight || imagem.height;
  const k = Math.min(1, ladoMaximo / Math.max(w0, h0));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w0 * k));
  canvas.height = Math.max(1, Math.round(h0 * k));
  canvas.getContext('2d').drawImage(imagem, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasParaBlob(canvas, tipo, qualidade) {
  return new Promise((ok, erro) => {
    canvas.toBlob((b) => (b ? ok(b) : erro(new Error('Não foi possível converter a imagem'))), tipo, qualidade);
  });
}

// Arquivo escolhido -> { tipo, w, h, dados } pronto para guardar.
export async function prepararFoto(arquivo) {
  const imagem = await decodificar(arquivo);
  const canvas = paraCanvas(imagem, LADO_MAXIMO);
  imagem.close?.();
  const blob = await canvasParaBlob(canvas, 'image/jpeg', QUALIDADE);
  return { tipo: 'image/jpeg', w: canvas.width, h: canvas.height, dados: await blob.arrayBuffer() };
}

// Logo do cabeçalho: PNG com até 300 px de altura.
export async function prepararLogo(arquivo) {
  const imagem = await decodificar(arquivo);
  const w0 = imagem.naturalWidth || imagem.width;
  const h0 = imagem.naturalHeight || imagem.height;
  const canvas = paraCanvas(imagem, Math.max(300, Math.round((300 * w0) / h0)));
  imagem.close?.();
  return { dataUrl: canvas.toDataURL('image/png'), proporcao: canvas.width / canvas.height };
}

// Imagem ilustrativa para o relatório de exemplo.
export async function fotoExemplo(rotulo, cor) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 900;
  const c = canvas.getContext('2d');
  c.fillStyle = cor;
  c.fillRect(0, 0, 1200, 900);
  c.strokeStyle = 'rgba(0,0,0,0.18)';
  c.lineWidth = 3;
  for (let y = 45; y < 900; y += 45) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(1200, y);
    c.stroke();
  }
  for (let x = 0; x < 1200; x += 60) {
    for (let y = 0; y < 900; y += 90) {
      c.strokeRect(x + (Math.floor(y / 90) % 2 ? 30 : 0), y, 60, 45);
    }
  }
  c.fillStyle = 'rgba(255,255,255,0.92)';
  c.fillRect(300, 380, 600, 140);
  c.fillStyle = '#1B2430';
  c.textAlign = 'center';
  c.font = 'bold 44px Arial, sans-serif';
  c.fillText('IMAGEM DE EXEMPLO', 600, 440);
  c.font = '30px Arial, sans-serif';
  c.fillText(rotulo, 600, 490);
  const blob = await canvasParaBlob(canvas, 'image/jpeg', 0.8);
  return { tipo: 'image/jpeg', w: 1200, h: 900, dados: await blob.arrayBuffer() };
}

export function paraBase64(dados) {
  const bytes = new Uint8Array(dados);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function deBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export const paraDataUrl = (foto) => `data:${foto.tipo};base64,${paraBase64(foto.dados)}`;

export const bytesDeDataUrl = (dataUrl) => deBase64(dataUrl.slice(dataUrl.indexOf(',') + 1));

// URLs temporárias para mostrar as fotos na tela.
const urls = new Map();

export function urlDaFoto(foto) {
  if (!urls.has(foto.id)) urls.set(foto.id, URL.createObjectURL(new Blob([foto.dados], { type: foto.tipo })));
  return urls.get(foto.id);
}

export function liberarUrl(id) {
  if (urls.has(id)) {
    URL.revokeObjectURL(urls.get(id));
    urls.delete(id);
  }
}

// Largura e altura de uma imagem guardada (para fotos baixadas do servidor).
export async function medirImagem(dados, tipo = 'image/jpeg') {
  const img = await decodificar(new Blob([dados], { type: tipo }));
  const medida = { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
  img.close?.();
  return medida;
}
