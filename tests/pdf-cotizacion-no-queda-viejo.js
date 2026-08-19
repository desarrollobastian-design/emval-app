/* Prueba de regresion — el PDF de una cotizacion no puede quedar describiendo otra cosa.

   Caso real, OT #597587 (UNIMARC CARRERA), detectado el 05-08-2026: la cotizacion nacio como
   PREVIA el 6-jul y se genero su PDF (1 pagina, 0 imagenes). Cuatro semanas despues se fusiono
   con la OT y se le sumaron el numero de OT, la fecha, el tecnico y las fotos antes/despues.
   `pdfUrl` no se invalidaba nunca, y todos los caminos preguntan lo mismo: "si hay pdfUrl, abre
   ese; si no, genera". Resultado: el PDF del 6-jul se abria y SE ENVIABA por correo — 28 dias
   mas viejo que el trabajo que describe. Los dos PDF hubo que mandarlos a mano a SMU.

   Extrae los helpers TAL CUAL estan en index.html y prueba la decision: vigente o caduco.

   Uso:  node tests/pdf-cotizacion-no-queda-viejo.js index.html   (desde la raiz del repo)
   Sale 0 si un PDF viejo se detecta como caduco; 1 si volveria a enviarse. */

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

const DESDE = '/* =========== PDF DE COTIZACION: VIGENTE O CADUCO — INICIO';
const HASTA = '/* =========== PDF DE COTIZACION: VIGENTE O CADUCO — FIN';
const i = src.indexOf(DESDE);
const j = src.indexOf(HASTA);
if (i < 0 || j < 0) throw new Error('No se encontro el bloque de vigencia del PDF en index.html');
const cod = src.slice(i, j);

// 19-08-2026: `_pdfCotObsoleto` gano una SEGUNDA razon para caducar — el formato del PDF, o sea
// como se dibuja el documento. Un PDF sin `pdfFormato` fue dibujado antes del sello y por lo tanto
// es viejo aunque su contenido no haya cambiado nunca. Por eso los casos que aqui significan
// "PDF vigente" tienen que traerlo: sin el, este test exigiria que NO se regenere justo el PDF que
// le salia cortado a Pedro. Ver tests/pdf-cotizacion-con-formato-viejo-se-regenera.js.
const FORMATO = Number((src.match(/var\s+_PDF_COT_FORMATO\s*=\s*(\d+)/) || [0, 1])[1]);
const api = new Function(cod + `
  return { caduco: _cotPdfCaduco, obsoleto: _pdfCotObsoleto, fusionada: _cotFusionada };
`)();

// Los dos caminos de UNION tienen que invalidar el PDF. Se comprueba sobre el codigo real, no
// sobre una copia: si alguien agrega un tercer camino de union sin invalidar, esto lo delata.
function unionInvalida(nombreDeLaLlamada) {
  const k = src.indexOf(nombreDeLaLlamada);
  if (k < 0) return 'no se encontro la llamada: ' + nombreDeLaLlamada;
  const bloque = src.slice(k, k + 1400);
  return bloque.includes('_cotPdfCaduco()') ? null : 'el update no invalida el PDF';
}

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); }

const JUL6  = Date.parse('2026-07-06T10:00:00Z');
const AGO3  = Date.parse('2026-08-03T17:00:00Z');

console.log('PDF de cotizacion — vigente o caduco\n');

// ── 1. El caso #597587 exacto: previa del 6-jul fusionada despues, sin sello de generacion ──
{
  const cot597587 = {
    id: 'cot_597587', pdfUrl: 'https://res.cloudinary.com/.../cot_6jul.pdf',
    otCompletadaNumero: '597587', fotosAntes: ['a.jpg'], fotosDespues: ['b.jpg', 'c.jpg']
    // sin pdfGeneradoEn ni contenidoActualizadoEn: asi esta HOY en Firestore
  };
  const esObsoleto = api.obsoleto(cot597587);
  console.log('1) OT #597587 (previa del 6-jul fusionada el 3-ago): ' + (esObsoleto ? 'se regenera ✓' : 'se enviaria el viejo ✗'));
  chequear(esObsoleto, 'el PDF del 6-jul de la #597587 se daria por vigente y volveria a salir a SMU');
}

// ── 2. Una cotizacion normal, sin fusionar, no se regenera al pedo ───────────────────────────
{
  const normal = { id: 'cot_x', pdfUrl: 'https://.../cot.pdf', pdfFormato: FORMATO };
  const conSello = { id: 'cot_y', pdfUrl: 'https://.../cot.pdf', pdfGeneradoEn: AGO3, pdfFormato: FORMATO };
  console.log('2) Cotizacion intacta: ' + (!api.obsoleto(normal) && !api.obsoleto(conSello) ? 'se reusa ✓' : 'regenera de mas ✗'));
  chequear(!api.obsoleto(normal), 'una cotizacion sin fusionar se regeneraria sin motivo');
  chequear(!api.obsoleto(conSello), 'un PDF con sello y sin cambios posteriores no debe regenerarse');
}

// ── 3. Con sello: manda la cronologia, no la existencia del archivo ──────────────────────────
{
  const viejo  = { pdfUrl: 'u', pdfGeneradoEn: JUL6, contenidoActualizadoEn: AGO3 };
  const nuevo  = { pdfUrl: 'u', pdfGeneradoEn: AGO3, contenidoActualizadoEn: JUL6, pdfFormato: FORMATO };
  console.log('3) Sello vs cambio: PDF anterior al cambio → ' + (api.obsoleto(viejo) ? 'caduco ✓' : '✗') +
              ' · PDF posterior → ' + (!api.obsoleto(nuevo) ? 'vigente ✓' : '✗'));
  chequear(api.obsoleto(viejo), 'un PDF generado ANTES del ultimo cambio debe darse por caduco');
  chequear(!api.obsoleto(nuevo), 'un PDF generado DESPUES del cambio no debe regenerarse');
}

// ── 4. Sin PDF no hay nada que invalidar (el flujo de generar ya lo cubre) ───────────────────
{
  chequear(!api.obsoleto({ otCompletadaNumero: '123' }), 'una cotizacion sin pdfUrl no puede marcarse como caduca');
  chequear(!api.obsoleto(null), 'obsoleto(null) tiene que ser falso, no reventar');
  console.log('4) Sin pdfUrl / sin cotizacion: no revienta ✓');
}

// ── 5. La marca deja el PDF invalidado Y sellado ─────────────────────────────────────────────
{
  const m = api.caduco();
  chequear(m.pdfUrl === '', 'la marca no vacia el pdfUrl: el viejo seguiria enlazado');
  chequear(typeof m.contenidoActualizadoEn === 'number' && m.contenidoActualizadoEn > 0,
    'la marca no deja fecha de cambio: no se podria comparar despues');
  console.log('5) Marca de caducidad: pdfUrl vacio + fecha de cambio ✓');
}

// ── 6. Los caminos de UNION del codigo real invalidan ────────────────────────────────────────
{
  const a = unionInvalida("db.collection('cotizaciones').doc(cotId).update(");
  const b = unionInvalida("db.collection('cotizaciones').doc(previa.id).update(");
  console.log('6) Union en el codigo real: vincular-realizada ' + (a ? '✗' : '✓') + ' · adjuntar-previa ' + (b ? '✗' : '✓'));
  chequear(!a, 'vincular cotizacion realizada: ' + a);
  chequear(!b, 'adjuntar previa a la OT: ' + b);
}

console.log('');
if (fallos.length) { console.log('❌ FALLA'); fallos.forEach(f => console.log(f)); }
else console.log('✅ OK — un PDF que quedo viejo se regenera antes de abrirse o enviarse');
console.log('');
process.exit(fallos.length ? 1 : 0);
