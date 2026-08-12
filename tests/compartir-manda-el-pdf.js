/* Prueba de regresion — el boton Compartir manda EL PDF, y no gasta cuota de correo.

   Pedido de Pedro, 12-08-2026: "que tenga la opcion de compartir por WhatsApp o correo, la que
   tienen todas las apps". Se implemento con la Web Share API (`navigator.share`).

   Compartir es la salida al cliente MAS expuesta que tiene la app: lo que sale por aca llega a
   un supervisor de SMU sin que nadie lo revise despues. Por eso este test vigila los tres
   invariantes que ya se rompieron antes en este mismo proyecto, cada uno con su caso real:

   1. NUNCA se comparte el link a la app. `ot.pdfUrl` guarda `.../?pdf=<id>`, que es la
      aplicacion entera, no un documento. A Pedro le abria bien —la app arma el PDF en su
      telefono— y a SMU le daba 404 (OT #597587, 05-08-2026). Ver link-pdf-es-compartible.js.
   2. NUNCA se comparte un PDF viejo. La misma #597587 mando por correo un PDF 28 dias mas
      antiguo que el trabajo que describia. Compartir pasa por la misma regeneracion.
   3. Compartir NO toca EmailJS. El plan es de 200 correos/mes y la cola ya lo quemo una vez
      (03-08-2026). Si compartir empezara a mandar correos por EmailJS, cada vez que Pedro
      comparte una cotizacion se come una del cupo del mes.

   Uso:  node tests/compartir-manda-el-pdf.js index.html
   Sale 0 si los tres invariantes se sostienen; 1 si alguno se rompio. */

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); }

// Extrae una funcion por nombre y la deja ejecutable, como hacen los demas tests de esta carpeta.
function extraer(nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  // Corte por llaves balanceadas desde la primera '{' de la firma.
  let j = src.indexOf('{', i), prof = 0, fin = -1;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (prof === 0) { fin = k + 1; break; } }
  }
  if (fin < 0) return null;
  try { return new Function('return ' + src.slice(i, fin) + ';')(); }
  catch (e) { return null; }
}

console.log('Compartir tiene que mandar el PDF\n');

// ── 1. _esPDFCompartible rechaza el link a la app ────────────────────────────────────────────
{
  const f = extraer('_esPDFCompartible');
  chequear(!!f, 'no se encontro _esPDFCompartible en index.html');
  if (f) {
    // Los datos reales de la OT #597587 tal como estaban en Firestore el 05-08-2026.
    const linkApp = 'https://desarrollobastian-design.github.io/emval-app/?pdf=KRUvZwab3Zb7QeebOBdv';
    const pdfReal = 'https://res.cloudinary.com/dcrf29tna/raw/upload/v1785791175/emval/pdfs/Recepcion_Obra_OT597587_rml807w.pdf';
    const casos = [
      [linkApp, false, 'el link a la app (?pdf=)'],
      ['https://desarrollobastian-design.github.io/emval-app/', false, 'la app sin parametros'],
      ['', false, 'vacio'],
      [null, false, 'null'],
      [pdfReal, true, 'el PDF de Cloudinary'],
    ];
    let ok = true;
    casos.forEach(function (c) {
      const r = !!f(c[0]);
      if (r !== c[1]) { ok = false; chequear(false, '_esPDFCompartible(' + c[2] + ') devolvio ' + r + ', se esperaba ' + c[1]); }
    });
    console.log('1) _esPDFCompartible: ' + (ok ? 'deja pasar solo el PDF ✓' : 'deja pasar algo que no es el PDF ✗'));
  }
}

// ── 2. El PDF se comparte con extension: sin ella llega como archivo sin tipo ────────────────
{
  const f = extraer('_urlPDFDescarga');
  chequear(!!f, 'no se encontro _urlPDFDescarga en index.html');
  if (f) {
    const sinExt = 'https://res.cloudinary.com/dcrf29tna/raw/upload/emval/pdfs/Cotizacion_Unimarc';
    const conExt = sinExt + '.pdf';
    const ok = f(sinExt) === conExt && f(conExt) === conExt;
    console.log('2) URL compartida: ' + (ok ? 'siempre termina en .pdf ✓' : 'puede salir sin extension ✗'));
    chequear(ok, '_urlPDFDescarga no normaliza la extension: ' + f(sinExt));
  }
}

// ── 3. El nombre del archivo sale de la URL, que ya lo trae bien ─────────────────────────────
{
  const f = extraer('_nombreDesdeURL');
  chequear(!!f, 'no se encontro _nombreDesdeURL en index.html');
  if (f) {
    const u = 'https://res.cloudinary.com/dcrf29tna/raw/upload/v1785791175/emval/pdfs/Recepcion_Obra_OT597587_rml807w.pdf';
    const n = f(u, 'x.pdf');
    const ok = n === 'Recepcion_Obra_OT597587_rml807w.pdf';
    console.log('3) Nombre del adjunto: ' + (ok ? 'el mismo que ya conoce el cliente ✓' : 'se inventa uno distinto ✗'));
    chequear(ok, '_nombreDesdeURL devolvio "' + n + '"');
  }
}

// ── 4. Compartir una cotizacion regenera el PDF si quedo viejo (regla 2) ─────────────────────
{
  const i = src.indexOf('async function compartirCotizacion(');
  chequear(i > 0, 'no se encontro compartirCotizacion en index.html');
  const bloque = i > 0 ? src.slice(i, i + 900) : '';
  const regenera = /_asegurarPDFCotizacion\s*\(/.test(bloque);
  console.log('4) Compartir cotización: ' + (regenera ? 'regenera el PDF viejo antes de mandarlo ✓' : 'puede mandar un PDF viejo ✗'));
  chequear(regenera, 'compartirCotizacion no pasa por _asegurarPDFCotizacion');

  const j = src.indexOf('async function _asegurarPDFCotizacion(');
  const bloqueAseg = j > 0 ? src.slice(j, j + 900) : '';
  const miraObsoleto = /_pdfCotObsoleto\s*\(/.test(bloqueAseg);
  chequear(miraObsoleto, '_asegurarPDFCotizacion no consulta _pdfCotObsoleto: dejaria pasar el PDF viejo');
}

// ── 5. Compartir NO manda correos por EmailJS (regla 3: la cuota es de 200/mes) ──────────────
{
  const i = src.indexOf('// =========== COMPARTIR DOCUMENTOS');
  const fin = src.indexOf('// =========== NOTA DE VOZ', i);
  chequear(i > 0 && fin > i, 'no se encontro la seccion COMPARTIR DOCUMENTOS en index.html');
  const seccion = (i > 0 && fin > i) ? src.slice(i, fin) : '';
  // `mailto:` si vale: lo abre el cliente de correo del equipo, no consume cuota de EmailJS.
  const usaEmailjs = /emailjs\s*\.\s*send|_enviarCorreo\s*\(/.test(seccion);
  console.log('5) Cuota de EmailJS: ' + (usaEmailjs ? 'compartir empezó a gastar correos ✗' : 'compartir no gasta ninguno ✓'));
  chequear(!usaEmailjs, 'la sección de compartir llama a EmailJS: cada compartida gastaría del cupo de 200/mes');
}

// ── 6. Cancelar el menú del sistema no se trata como error ───────────────────────────────────
{
  const i = src.indexOf('async function compartirDocumentos(');
  const bloque = i > 0 ? src.slice(i, i + 3000) : '';
  const ok = /AbortError/.test(bloque);
  console.log('6) Usuario cierra el menú: ' + (ok ? 'no se le muestra ningún error ✓' : 'le aparece un error falso ✗'));
  chequear(ok, 'compartirDocumentos no distingue AbortError: cerrar el menú mostraría un error que no ocurrió');
}

// ── 7. Los botones Compartir de la lista solo aparecen con un PDF real ───────────────────────
{
  // En las tarjetas de OT y de hoja, el boton se dibuja dentro de un if de _esPDFCompartible.
  const guardas = (src.match(/if \(_esPDFCompartible\(/g) || []).length;
  console.log('7) Botones en las listas: ' + (guardas >= 2 ? 'solo se dibujan si hay PDF ✓' : 'se dibujan sin comprobar ✗'));
  chequear(guardas >= 2, 'faltan guardas _esPDFCompartible antes de dibujar el boton Compartir (hay ' + guardas + ', se esperan 2)');
}

console.log('');
if (fallos.length) { console.log('❌ FALLA'); fallos.forEach(f => console.log(f)); }
else console.log('✅ OK — se comparte el PDF vigente, y sin gastar cuota de correo');
console.log('');
process.exit(fallos.length ? 1 : 0);
