/* Regresion del pedido de Gerencia/Procurement recibido el 14-09-2026:
   la COT y la HS se entregan como PDF independientes y con nomenclatura correlacionada. */

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const fallos = [];
const check = (ok, msg) => { if (!ok) fallos.push('  ✗ ' + msg); };

function cuerpo(decl) {
  const i = src.indexOf(decl);
  if (i < 0) return '';
  let nivel = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') nivel++;
    else if (src[k] === '}' && --nivel === 0) return src.slice(i, k + 1);
  }
  return '';
}

console.log('COT y HS deben salir en documentos separados\n');

const guardada = cuerpo('async function generarPDFCotizacionGuardada(');
const huerfana = cuerpo('async function generarPDFCotizacion(');
const separada = /var\s+_COTIZACION_INCLUYE_HS\s*=\s*false/.test(src);
check(separada, 'la bandera que impide incrustar la HS no esta desactivada');
check(/_COTIZACION_INCLUYE_HS\s*&&\s*otData/.test(guardada),
  'el generador vigente puede agregar la pagina 2 de HS');
check(/_COTIZACION_INCLUYE_HS\s*&&\s*window\._firebaseReady/.test(huerfana),
  'el generador legacy puede volver a combinar la HS');
console.log('1) PDF de cotizacion sin pagina HS: ' + (separada ? '✓' : '✗'));

const formato = Number((src.match(/var\s+_PDF_COT_FORMATO\s*=\s*(\d+)/) || [0, 0])[1]);
check(formato >= 4, 'los PDF combinados existentes no se regeneraran (formato ' + formato + ')');
console.log('2) Cotizaciones antiguas se regeneran: formato ' + formato + (formato >= 4 ? ' ✓' : ' ✗'));

const compartir = cuerpo('async function compartirCotizacion(');
check(/_obtenerHojaDeCot\(cot\)/.test(compartir), 'Compartir cotizacion no busca su HS');
check(/compartirDocumentos\(docs/.test(compartir), 'Compartir sigue entregando un solo PDF combinado');
const enviar = cuerpo('async function _procesarEnvioCotizaciones(');
check(/Descargar CT/.test(enviar) && /Descargar HS/.test(enviar),
  'el correo no ofrece COT y HS como enlaces separados');
console.log('3) Compartir y correo entregan dos documentos: ' +
  (/_obtenerHojaDeCot\(cot\)/.test(compartir) && /Descargar HS/.test(enviar) ? '✓' : '✗'));

const guardar = cuerpo('async function guardarCotizacion(');
check(/cotizacionNumero:\s*cotData\.numeroCotizacion/.test(guardar),
  'al guardar la COT no se vincula su folio a la HS');
check(/cotizacionNumero:\s*previa\.numeroCotizacion/.test(src),
  'al adjuntar una previa no se vincula su folio a la HS');
console.log('4) El folio COT queda vinculado a la HS: ' +
  (/cotizacionNumero:\s*cotData\.numeroCotizacion/.test(guardar) ? '✓' : '✗'));

// 5) El vinculo COT-HS no se pisa con vacio. Un correctivo se cierra ANTES de que exista su COT:
//    si el cierre, la edicion o la cola escriben cotizacionId/cotizacionNumero = '' con merge,
//    borran el folio que guardarCotizacion ya dejo en la OT (revision del 15-09-2026).
const guardarOT = cuerpo('async function guardarEnFirebase(');
const colaOT = cuerpo('async function sincronizarOTsPendientes(');
const cierreCondiciona = /if \(snap\.cotizacionId\) otData\.cotizacionId/.test(guardarOT) &&
  /if \(snap\.cotizacionNumero\) otData\.cotizacionNumero/.test(guardarOT) &&
  !/otData\s*=\s*\{[^}]*cotizacion(Id|Numero):/.test(guardarOT);
const colaCondiciona = /if \(ot\.cotizacionId\) otDoc\.cotizacionId/.test(colaOT) &&
  /if \(ot\.cotizacionNumero\) otDoc\.cotizacionNumero/.test(colaOT) &&
  !/cotizacion(Id|Numero):\s*ot\.cotizacion(Id|Numero)\s*\|\|\s*''/.test(colaOT);
check(guardarOT && cierreCondiciona, 'el cierre/edicion de la OT escribe el vinculo con la COT aunque venga vacio');
check(colaOT && colaCondiciona, 'la cola offline escribe el vinculo con la COT aunque venga vacio');
console.log('5) El vinculo COT-HS no se pisa con vacio: ' + (cierreCondiciona && colaCondiciona ? '✓' : '✗'));

if (fallos.length) {
  console.error('\nFALLOS:\n' + fallos.join('\n'));
  process.exit(1);
}
console.log('\nOK — COT y HS salen separadas y correlacionadas.');
