/* Prueba de regresion — un PDF dibujado por una version anterior de la app se regenera solo.

   Caso (19-08-2026): se arreglo el texto cortado del item y se desplego. Pedro volvio a abrir SU
   cotizacion y le seguia saliendo cortada. No era el fix: el PDF de esa cotizacion estaba en
   Cloudinary desde las 09:40 —antes del despliegue— y un PDF es un archivo ESTATICO. Peor: al
   reenviarla tampoco se regeneraba, porque `_pdfCotObsoleto` solo miraba si habia cambiado el
   CONTENIDO de la cotizacion, y el contenido no habia cambiado; lo que cambio fue el FORMATO.

   Resultado: un arreglo desplegado que el cliente no podia ver por ningun camino.

   El sello `pdfFormato` cierra eso: al subir `_PDF_COT_FORMATO` todo PDF anterior queda obsoleto y
   el proximo Ver PDF / envio / compartir lo vuelve a dibujar con el codigo nuevo.

   Lo que vigila:
   1. Un PDF sin sello (todos los anteriores al 19-08) esta obsoleto.
   2. Un PDF con el formato vigente NO se regenera: regenerar de gratis gasta subida de Cloudinary
      desde el telefono del tecnico, muchas veces con mala senal.
   3. Sin PDF no hay nada que invalidar (no se inventa trabajo).
   4. LOS TRES sitios que guardan un pdfUrl escriben el sello. El que se olvide deja un PDF sin
      version, que para la app es igual a uno viejo: se regeneraria en cada envio, para siempre.
   5. El numero de formato solo sube. Bajarlo deja PDF nuevos marcados como viejos.

   Uso:  node tests/pdf-cotizacion-con-formato-viejo-se-regenera.js index.html */

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const fallos = [];
const chequear = (ok, d) => { if (!ok) fallos.push('  ✗ ' + d); };

function cuerpo(nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  let p = 0, f = -1;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') p++;
    else if (src[k] === '}') { p--; if (!p) { f = k + 1; break; } }
  }
  return f < 0 ? null : src.slice(i, f);
}

const mFormato = src.match(/var\s+_PDF_COT_FORMATO\s*=\s*(\d+)/);
if (!mFormato || !cuerpo('_pdfCotObsoleto') || !cuerpo('_camposPDFCot')) {
  console.error('No se encontro _PDF_COT_FORMATO / _pdfCotObsoleto / _camposPDFCot en index.html.');
  console.error('Si los renombraste, revisa que el PDF viejo siga regenerandose solo.');
  process.exit(1);
}
const FORMATO = Number(mFormato[1]);
const obsoleto = new Function('_PDF_COT_FORMATO',
  cuerpo('_pdfCotObsoleto') + '\n' + cuerpo('_cotFusionada') + '\nreturn _pdfCotObsoleto;')(FORMATO);
const campos = new Function('_PDF_COT_FORMATO', cuerpo('_camposPDFCot') + '\nreturn _camposPDFCot;')(FORMATO);

// 1 · el PDF de Pedro: subido antes del arreglo, sin sello
chequear(obsoleto({ pdfUrl: 'https://res.cloudinary.com/x.pdf', pdfGeneradoEn: 1787146850068 }) === true,
  'un PDF sin `pdfFormato` es anterior al sello: tiene que regenerarse, o el cliente nunca ve el arreglo');
chequear(obsoleto({ pdfUrl: 'x', pdfFormato: FORMATO - 1 }) === true,
  'un PDF de un formato anterior tiene que regenerarse');

// 2 · el vigente no se toca
chequear(obsoleto({ pdfUrl: 'x', pdfGeneradoEn: 5000, pdfFormato: FORMATO }) === false,
  'un PDF del formato vigente NO puede regenerarse de gratis: cada regeneracion es una subida a ' +
  'Cloudinary desde el telefono del tecnico, muchas veces con mala senal');

// 3 · sin PDF no hay nada que invalidar
chequear(obsoleto({ pdfUrl: '' }) === false && obsoleto(null) === false,
  'sin PDF guardado no hay nada que invalidar');

// 4 · los tres sitios escriben el sello
{
  const c = campos('https://x/y.pdf');
  chequear(c.pdfUrl === 'https://x/y.pdf' && Number(c.pdfFormato) === FORMATO && Number(c.pdfGeneradoEn) > 0,
    '_camposPDFCot no devuelve los tres campos');
  const sitios = (src.match(/_camposPDFCot\(/g) || []).length;
  chequear(sitios >= 4, 'se esperaban los 3 sitios que guardan un pdfUrl usando _camposPDFCot (hay ' + (sitios - 1) + ')');
  // Ninguno puede volver a escribir el pdfUrl a mano, sin sello.
  chequear(!/update\(\{\s*pdfUrl:[^}]*pdfGeneradoEn[^}]*\}\)/.test(src),
    'hay un sitio que guarda pdfUrl + pdfGeneradoEn a mano, sin el sello de formato');
}

// 5 · el numero solo sube
chequear(FORMATO >= 2, 'el formato vigente es ' + FORMATO + ': bajarlo deja los PDF nuevos marcados como viejos');

if (fallos.length) {
  console.error('\n✗ UN PDF DIBUJADO POR LA VERSION ANTERIOR NO SE ESTA REGENERANDO:\n');
  console.error(fallos.join('\n'));
  process.exit(1);
}
console.log('✓ el PDF de un formato anterior se regenera solo (formato vigente: ' + FORMATO + ')');
process.exit(0);
