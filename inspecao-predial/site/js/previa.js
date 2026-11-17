// Pré-visualização do relatório na tela, a partir dos mesmos blocos usados
// para gerar o DOCX e o PDF.

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const runs = (lista) =>
  lista
    .map((r) => {
      let t = esc(r.t).replace(/\n/g, '<br>');
      if (r.b) t = `<strong>${t}</strong>`;
      if (r.i) t = `<em>${t}</em>`;
      return t;
    })
    .join('');

function tabela(b) {
  const total = b.larguras.reduce((a, c) => a + c, 0);
  const cols = b.larguras.map((w) => `<col style="width:${((w / total) * 100).toFixed(2)}%">`).join('');
  const cab = b.cabecalho.map((t) => `<th>${esc(t)}</th>`).join('');
  const linhas = b.linhas
    .map(
      (l) =>
        '<tr>' +
        l.celulas.map((c) => `<td style="background:#${c.fill || l.fill || 'FFFFFF'}">${runs(c.runs)}</td>`).join('') +
        '</tr>'
    )
    .join('');
  return `<div class="papel-rolagem"><table class="papel-tabela"><colgroup>${cols}</colgroup><thead><tr>${cab}</tr></thead><tbody>${linhas}</tbody></table></div>`;
}

// `urlFoto(id)` devolve a URL da imagem ou null.
export function htmlPrevia(doc, urlFoto) {
  const h = [];
  for (const b of doc.blocos) {
    switch (b.tipo) {
      case 'titulo':
        h.push(`<p class="papel-titulo">${esc(b.texto)}</p>`);
        break;
      case 'subtitulo':
        h.push(`<p class="papel-subtitulo">${esc(b.texto)}</p>`);
        break;
      case 'meta':
        h.push(`<p class="papel-meta">${runs(b.runs)}</p>`);
        break;
      case 'h1':
        h.push(`<h3 class="papel-h1">${esc(b.texto)}</h3>`);
        break;
      case 'h2':
        h.push(`<h4 class="papel-h2">${esc(b.texto)}</h4>`);
        break;
      case 'p':
        h.push(`<p class="papel-p">${runs(b.runs)}</p>`);
        break;
      case 'lista': {
        const tag = b.estilo === 'numerada' ? 'ol' : 'ul';
        h.push(`<${tag} class="papel-lista">${b.itens.map((t) => `<li>${esc(t)}</li>`).join('')}</${tag}>`);
        break;
      }
      case 'tabela':
        h.push(tabela(b));
        break;
      case 'fotos':
        h.push(
          '<div class="papel-fotos">' +
            b.itens
              .map((f) => {
                const url = urlFoto(f.id);
                const img = url ? `<img src="${esc(url)}" alt="Foto ${esc(f.numero)}">` : '<span>[Foto não encontrada]</span>';
                return `<figure><div class="papel-quadro">${img}</div><figcaption><strong>Foto ${esc(f.numero)} – </strong>${esc(f.legenda)}</figcaption></figure>`;
              })
              .join('') +
            '</div>'
        );
        break;
      case 'espaco':
        h.push('<div class="papel-espaco"></div>');
        break;
      case 'assinatura':
        h.push(
          `<div class="papel-assinatura"><div class="papel-traco"></div>${b.linhas.map((l) => `<p>${runs(l)}</p>`).join('')}</div>`
        );
        break;
      case 'quebra':
        h.push('<hr class="papel-quebra">');
        break;
      default:
        break;
    }
  }
  return h.join('');
}
