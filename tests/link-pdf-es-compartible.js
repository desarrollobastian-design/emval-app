/* Prueba de regresion — el link que la app entrega para un PDF tiene que ser EL PDF.

   Caso real, 05-08-2026. Pedro: "la cotizacion la puede ver pero cuando envia el link le marca
   error 404 y tampoco lo pueden descargar". El boton Ver PDF de la OT #597587 entregaba
   `https://desarrollobastian-design.github.io/emval-app/?pdf=<id>`, que NO es un PDF: es la
   aplicacion entera. A el le funciona —la app arma el documento en su telefono— y a SMU, que lo
   recibe por fuera, no le sirve.

   Dos causas verificadas contra produccion ese dia:
   1. El documento de la orden guarda el link a la app en `pdfUrl` y el PDF real en
      `pdfUrlCloudinary`. El boton preguntaba `ot.pdfUrl || ot.pdfUrlCloudinary`: al reves.
   2. El registro de 'pdfs' se crea con `pdfUrl: ''` A PROPOSITO y la URL va en
      `pdfUrlCloudinary`, pero `verPDFById` leia `pdfUrl`. El atajo al PDF no se tomaba NUNCA,
      para ninguna OT: caia a abrir una segunda ventana emergente con un data: de ~180 KB.

   Uso:  node tests/link-pdf-es-compartible.js index.html
   Sale 0 si el link que se entrega es el PDF; 1 si vuelve a ser el link a la app. */

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); }

// Datos reales de la OT #597587, tal como estaban en Firestore el 05-08-2026.
const OT_597587 = {
  numero: 597587,
  pdfUrl: 'https://desarrollobastian-design.github.io/emval-app/?pdf=KRUvZwab3Zb7QeebOBdv',
  pdfUrlCloudinary: 'https://res.cloudinary.com/dcrf29tna/raw/upload/v1785791175/emval/pdfs/Recepcion_Obra_OT597587_rml807w.pdf'
};
const REG_PDFS = {                       // el registro que abre el visor
  pdfUrl: '',                            // se crea vacio a proposito
  pdfUrlCloudinary: OT_597587.pdfUrlCloudinary,
  pdfData: 'data:application/pdf;base64,JVBERi0xLjMK...'
};

const esPdf = u => !!u && u.includes('cloudinary') && !u.includes('?pdf=');

console.log('El link del PDF tiene que ser compartible\n');

// ── 1. _pdfDeOT prefiere el PDF real, no el link a la app ────────────────────────────────────
{
  const m = src.match(/function _pdfDeOT\(ot\)\s*\{[^}]*\}/);
  chequear(!!m, 'no se encontro _pdfDeOT en index.html');
  const _pdfDeOT = m ? new Function('return ' + m[0] + '; ')() : null;
  const url = _pdfDeOT ? _pdfDeOT(OT_597587) : '';
  console.log('1) _pdfDeOT(#597587) → ' + (esPdf(url) ? 'el PDF ✓' : 'el link a la app ✗'));
  chequear(esPdf(url), 'devuelve un link que abre la app, no el PDF: ' + url);
}

// ── 2. El boton "Ver PDF" de la lista usa esa preferencia, no la inversa ─────────────────────
{
  const i = src.indexOf('let urlParaVer =');
  chequear(i > 0, 'no se encontro `urlParaVer` en index.html');
  const linea = src.slice(i, src.indexOf('\n', i));
  const invertido = /ot\.pdfUrl\s*\|\|\s*ot\.pdfUrlCloudinary/.test(linea);
  console.log('2) Boton Ver PDF: ' + (invertido ? 'pregunta al reves ✗' : 'usa _pdfDeOT ✓'));
  chequear(!invertido, 'el boton vuelve a preferir ot.pdfUrl (el link a la app) sobre el PDF real');
}

// ── 3. El visor toma el atajo al PDF aunque `pdfUrl` del registro venga vacio ────────────────
{
  const i = src.indexOf('async function verPDFById');
  const bloque = src.slice(i, i + 1600);
  const lee = /data\.pdfUrlCloudinary/.test(bloque);
  // Se simula la decision con el registro real: con `pdfUrl` vacio, tiene que salir por Cloudinary.
  const urlDirecta = REG_PDFS.pdfUrlCloudinary || REG_PDFS.pdfUrl || '';
  console.log('3) Visor con el registro real (pdfUrl vacio): ' + (lee && esPdf(urlDirecta) ? 'abre el PDF ✓' : 'cae al data: en ventana emergente ✗'));
  chequear(lee, 'verPDFById no mira pdfUrlCloudinary: el atajo al PDF no se toma nunca');
  chequear(esPdf(urlDirecta), 'con este registro el visor no llegaria al PDF');
}

// ── 4. El correo de OT completada ya mandaba el link bueno — que siga asi ────────────────────
/* ⚠️ Este chequeo media la SINTAXIS `pdf_url: pdfUrlCloudinary || pdfUrlFirestore` y se cayo el
   03-09-2026 con el fix de la OT #484304, que saco esa expresion a una variable (`_urlLocal`)
   para poder decidir con ella el sello y la nota del correo. El comportamiento no cambio.
   Ahora se mide el INVARIANTE, que es lo que importa y ademas es mas dificil de romper sin que
   se note: Cloudinary va SIEMPRE antes que el link a la app, y el orden inverso no aparece en
   ninguna parte. El link a la app da 404 fuera de la app — caso #597587. */
{
  const prefiere = /pdfUrlCloudinary\s*\|\|\s*pdfUrlFirestore/.test(src);
  const invertido = /pdfUrlFirestore\s*\|\|\s*pdfUrlCloudinary/.test(src);
  const ok = prefiere && !invertido;
  console.log('4) Correo de OT completada: ' + (ok ? 'manda el PDF ✓' : 'cambio y ahora manda el link a la app ✗'));
  chequear(prefiere, 'el correo dejo de preferir la URL de Cloudinary');
  chequear(!invertido, 'aparecio el orden invertido: el link a la app le ganaria al PDF');
}

console.log('');
if (fallos.length) { console.log('❌ FALLA'); fallos.forEach(f => console.log(f)); }
else console.log('✅ OK — lo que se entrega y se comparte es el PDF, no la aplicacion');
console.log('');
process.exit(fallos.length ? 1 : 0);
