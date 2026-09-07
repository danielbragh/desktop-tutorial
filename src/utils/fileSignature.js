// Verifica os "magic bytes" do arquivo em vez de confiar apenas no
// Content-Type enviado pelo navegador, que pode ser forjado facilmente.
const ASSINATURAS = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
];

function tipoReal(buffer) {
  if (!buffer || buffer.length === 0) return null;
  const match = ASSINATURAS.find((assinatura) =>
    assinatura.bytes.every((byte, i) => buffer[i] === byte)
  );
  return match ? match.mime : null;
}

function assinaturaValida(buffer, mimeDeclarado) {
  const real = tipoReal(buffer);
  return real !== null && real === mimeDeclarado;
}

module.exports = { tipoReal, assinaturaValida };
