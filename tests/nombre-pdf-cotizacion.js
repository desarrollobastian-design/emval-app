/* Prueba de regresion — la cotizacion (CT) y la hoja de servicio (HS) salen con el nombre que
   exige SMU para emitir la HES.

   Exigencia de SMU Procurement (correo del 14-09-2026) y correccion por escrito del supervisor de
   SMU sobre la COT 15092601 (15-09-2026). Decision de Bastian, 15-09-2026:

       CT - <N° cotizacion> - ceco <CECO> - <texto breve>.pdf
       HS - <N° OT> - CT <N° cotizacion> - ceco <CECO> - <texto breve>.pdf

   La primera version (943888e) salio con "COT" y "ceco SIN-CECO", y SMU la devolvio.

   Lo que vigila este test, y por que cada cosa:

   1. EL CASO REAL, CON SUS DATOS DE PRODUCCION. La COT 15092601 / OT 796863 tienen `centro` y
      `ceco` VACIOS y el local "S10 Concepcion", una ficha sin centro. Tiene que salir ceco 3164
      (M10 CONCEPCION, por ALIAS_LOCALES) — no "SIN-CECO". Los fixtures llevan el centro vacio A
      PROPOSITO: la version anterior del test traia un centro inventado y por eso pasaba en verde.
   2. "CT", NUNCA "COT" — ni en el nombre de la CT ni dentro del de la HS.
   3. EL TEXTO BREVE ES EL MISMO EN CT Y HS: el `nombreServicio` de la cotizacion. La HS no toma
      la descripcion larga de la OT (en las 168 OT cotizadas no calzaba con su CT).
   4. EL CECO DEL DOCUMENTO GANA sobre el catalogo; el catalogo se consulta solo si viene vacio; y
      si nadie lo sabe, "SIN-CECO" queda a la vista (nunca uno adivinado).
   5. EL FOLIO SE COPIA TAL CUAL y, si falta, se ve ("SIN-NUMERO"). Rearmarlo fue el bug del '01'.
   6. UNA PREVIA SIN OT NO LLEVA N° DE HS en su CT, y la CT nunca lleva el N° de la OT.
   7. PREVENTIVO: el texto breve es "MP Transpaletas <Mes> <Año>", no sus Observaciones.
   8. `_urlDescargaCot` NO TOCA lo que no es de Cloudinary (caso #597587).

   La lista blanca de caracteres de `fl_attachment` (el 400 de la HS) la vigila
   tests/la-hs-se-descarga.js.

   Uso:  node tests/nombre-pdf-cotizacion.js index.html
   Sale 0 si los invariantes se sostienen; 1 si alguno se rompio. */

const fs = require('fs');
const ruta = process.argv[2] || 'index.html';
const src = fs.readFileSync(ruta, 'utf8');

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); }

// Recorta el texto de una funcion por llaves balanceadas.
function texto(nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  let j = src.indexOf('{', i), prof = 0, fin = -1;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (prof === 0) { fin = k + 1; break; } }
  }
  return fin < 0 ? null : src.slice(i, fin);
}

/* Se llaman entre si, asi que se evaluan JUNTAS y en un scope propio con su `window` y su
   `localStorage`. Extraerlas de a una las dejaria sin sus dependencias y el test pasaria por la
   razon equivocada. `_indexarCadenas`, `_localCanonico` y `_normTexto` son las REALES: el CECO
   se resuelve con el mismo codigo que usan Preventivos y Planillas. */
const NOMBRES = ['_normTexto', '_localCanonico', '_indexarCadenas', '_nombreAdjuntoSeguro',
  '_localSinCadena', '_recortarPalabras', '_cecoDocumento', '_cecoDelCatalogo', '_cecoDe',
  '_nombreDocumento', '_trabajoDocumento', '_nombrePDFHoja', '_datosHojaConCot', '_nombrePDFCot',
  '_slugPDFCot', '_urlPDFDescarga', '_urlPDFSinNombre', '_urlDescargaCot'];
const fuentes = NOMBRES.map(texto);
const faltan = NOMBRES.filter((n, i) => !fuentes[i]);
if (faltan.length) {
  console.error('No se encontro en ' + ruta + ': ' + faltan.join(', '));
  console.error('Si se renombraron, este test hay que revalidarlo — no solo arreglarlo.');
  process.exit(1);
}
const alias = (src.match(/window\.ALIAS_LOCALES\s*=\s*window\.ALIAS_LOCALES\s*\|\|\s*(\{[\s\S]*?\});/) || [])[1];
chequear(!!alias, 'no se encontro ALIAS_LOCALES en ' + ruta);
const meses = (src.match(/const _MESES_DOC = (\[[^\]]*\]);/) || [])[1];
chequear(!!meses, 'no se encontro _MESES_DOC en ' + ruta);

const api = new Function('catalogo',
  'var window = { ALIAS_LOCALES: ' + (alias || '{}') + ' };\n' +
  'var _store = catalogo ? { emval_cadenas_cache: JSON.stringify(catalogo) } : {};\n' +
  'var localStorage = { getItem: function(k){ return _store[k] == null ? null : _store[k]; } };\n' +
  'var _cecoIdxCache = { raw: null, idx: null };\n' +
  'const _MESES_DOC = ' + (meses || '[]') + ';\n' +
  fuentes.join('\n\n') + '\n' +
  'return { ' + NOMBRES.map(n => n + ': ' + n).join(', ') + ' };'
);

// Catalogo tal como lo cachea `cargarCadenasApp` (emval_cadenas_cache), con fichas REALES de
// produccion leidas el 15-09-2026. "S10 Concepcion" es la ficha de relleno sin centro.
const CATALOGO = [
  { id: 'm10', nombre: 'M10', sucursales: [
    { nombre: 'M10 CONCEPCION', centro: '3164', direccion: 'Los Carrera 637 Concepcion' },
    { nombre: 'M10 LOS ANGELES', centro: '3020' } ] },
  { id: 's10', nombre: 'S10', sucursales: [
    { nombre: 'S10 Concepcion', email: '' },
    { nombre: 'S10 Chillan 2', centro: '3554' } ] },
  { id: 'uni', nombre: 'Unimarc', sucursales: [
    { nombre: 'UNIMARC CHILLAN VIEJO', centro: '733' },
    { nombre: 'Unimarc Concepcion', email: '' } ] },
  { id: 'alvi', nombre: 'Alvi', sucursales: [ { nombre: 'Alvi Concepcion', centro: '3089' } ] }
];
const F = api(CATALOGO);
const SIN_CATALOGO = api(null);

console.log('La CT y la HS salen con el nombre que exige SMU\n');

// ── 1. El caso real: COT 15092601 / OT 796863, con los campos TAL COMO estan en Firestore ──────
const COT_15092601 = {
  numeroCotizacion: '15092601', otNumero: 796863, otId: 'ot_mu1by0re_qp9imoz',
  centro: '', local: 'S10 Concepcion', localCorto: 'S10 Concepcion',
  nombreServicio: 'Destape piletas y camara',
  descripcionTrabajo: 'Asistencia por piletas tapadas en sector Venta Asistida.\n- Se realiza limpieza de cañerías de desagüe desde venta asistida (Carnicería y Fiambrería) hasta cámara de inspección.\nQuedando cañerías de desagüe limpias sin problemas de rebalse.'
};
const OT_796863 = {
  id: 'ot_mu1by0re_qp9imoz', numero: 796863, local: 'S10 Concepcion', ceco: '', tipo: 'correctivo',
  cotizacionNumero: '15092601', tecnico: 'Lucas Fernández', fecha: '14-09-2026',
  descripcionTrabajo: COT_15092601.descripcionTrabajo
};
{
  const ct = F._nombrePDFCot(COT_15092601);
  const esperadoCT = 'CT - 15092601 - ceco 3164 - Destape piletas y camara.pdf';
  chequear(ct === esperadoCT, 'CT 15092601: se esperaba "' + esperadoCT + '" y salio "' + ct + '"');

  const hs = F._nombrePDFHoja(F._datosHojaConCot(OT_796863, COT_15092601, COT_15092601.centro));
  const esperadoHS = 'HS - 796863 - CT 15092601 - ceco 3164 - Destape piletas y camara.pdf';
  chequear(hs === esperadoHS, 'HS 796863: se esperaba "' + esperadoHS + '" y salio "' + hs + '"');
  console.log('1) Caso 15092601 / 796863:\n   ' + ct + (ct === esperadoCT ? ' ✓' : ' ✗') +
    '\n   ' + hs + (hs === esperadoHS ? ' ✓' : ' ✗'));
}

// ── 2. "CT", nunca "COT" ────────────────────────────────────────────────────────────────────────
{
  const muestras = [
    F._nombrePDFCot(COT_15092601),
    F._nombrePDFHoja(F._datosHojaConCot(OT_796863, COT_15092601, '')),
    F._nombrePDFHoja({ otNumero: 6537, cotizacionNumero: '5454', ceco: '474', local: 'x', nombreServicio: 'Reparacion' }),
    F._slugPDFCot(COT_15092601)
  ];
  const conCOT = muestras.filter(m => /\bCOT\b/.test(m));
  chequear(!conCOT.length, 'aparece "COT" en: ' + conCOT.join(' | '));
  chequear(/^CT - /.test(muestras[0]), 'la CT no empieza con "CT - ": "' + muestras[0] + '"');
  chequear(/^HS - \d+ - CT \d+ - /.test(muestras[1]), 'la HS no nombra su cotizacion con "CT": "' + muestras[1] + '"');
  console.log('2) Sigla: ' + (!conCOT.length ? 'CT en la cotizacion y dentro de la HS ✓' : 'se cuela "COT" ✗'));
}

// ── 3. El texto breve es el mismo en CT y HS ───────────────────────────────────────────────────
{
  const texto = n => n.replace(/\.pdf$/, '').split(' - ').pop();
  const ct = texto(F._nombrePDFCot(COT_15092601));
  const hs = texto(F._nombrePDFHoja(F._datosHojaConCot(OT_796863, COT_15092601, '')));
  chequear(ct === hs, 'CT y HS no comparten el texto breve: "' + ct + '" vs "' + hs + '"');
  // Sin cotizacion, la HS usa la PRIMERA linea de la descripcion, sin puntuacion.
  const sola = texto(F._nombrePDFHoja(OT_796863));
  chequear(sola === 'Asistencia por piletas tapadas en sector Venta Asistida',
    'HS sin cotizacion: se esperaba la primera linea limpia y salio "' + sola + '"');
  console.log('3) Texto breve: ' + (ct === hs ? '"' + ct + '" en los dos archivos ✓' : 'distinto ✗'));
}

// ── 4. De donde sale el CECO ────────────────────────────────────────────────────────────────────
{
  const ceco = n => (n.match(/ - ceco (\S+) - /) || [])[1];
  // El del documento gana, aunque el catalogo diga otra cosa (S10 Chillan 2: OT de julio con 3027).
  const propio = ceco(F._nombrePDFHoja({ otNumero: 453221, local: 'S10 Chillan 2', ceco: '3027', descripcionTrabajo: 'x' }));
  chequear(propio === '3027', 'el ceco guardado en la OT no gano sobre el catalogo: ' + propio);
  // Vacio -> catalogo por nombre normalizado (mayusculas/tildes distintas).
  const norm = ceco(F._nombrePDFCot({ numeroCotizacion: '1', centro: '', local: 'alvi concepción', nombreServicio: 'x' }));
  chequear(norm === '3089', 'el catalogo no resolvio por nombre normalizado: ' + norm);
  // Sin rellenar a 4 cuando ya tiene 4; 3 digitos se completan (decision 15-09, ver _cecoDocumento).
  const tres = ceco(F._nombrePDFCot({ numeroCotizacion: '1', local: 'UNIMARC CHILLAN VIEJO', nombreServicio: 'x' }));
  chequear(tres === '0733', 'CECO de 3 digitos: se esperaba 0733 y salio ' + tres);
  // Nadie lo sabe -> SIN-CECO a la vista: ficha sin centro y sin alias, local fuera del catalogo, sin catalogo.
  const huecos = [
    F._nombrePDFCot({ numeroCotizacion: '1', local: 'Unimarc Concepcion', nombreServicio: 'x' }),
    F._nombrePDFCot({ numeroCotizacion: '1', local: 'Bodega Inventada', nombreServicio: 'x' }),
    SIN_CATALOGO._nombrePDFCot(COT_15092601)
  ].map(ceco);
  chequear(huecos.every(c => c === 'SIN-CECO'), 'un CECO desconocido no quedo a la vista: ' + huecos.join(', '));
  console.log('4) CECO: ' + (propio === '3027' && norm === '3089' && huecos.every(c => c === 'SIN-CECO')
    ? 'documento > catalogo con alias > SIN-CECO visible ✓' : 'se resuelve mal ✗'));
}

// ── 4b. La CT y su HS, que viajan JUNTAS a Procurement, dicen el mismo CECO y el mismo texto ───
{
  // Pares reales del barrido del 15-09: la OT guardo 3027 y la ficha de S10 Chillan 2 dice 3554; y
  // una cotizacion sin `nombreServicio`. Se parean por esos datos: si difieren, no calzan.
  const pares = [
    [{ numeroCotizacion: '01082603', centro: '3554', local: 'S10 Chillan 2', nombreServicio: 'Correctivo transpaletas' },
     { numero: 574856, ceco: '3027', local: 'S10 Chillan 2', descripcionTrabajo: 'Se cambia rueda de carga.' }],
    [{ numeroCotizacion: '15092601', centro: '', local: 'S10 Concepcion', nombreServicio: '',
       descripcionTrabajo: 'Destape de piletas, camara y cañeria.\n- Se realiza limpieza.' },
     { numero: 796863, ceco: '', local: 'S10 Concepcion', descripcionTrabajo: 'Asistencia por piletas tapadas.' }]
  ];
  const partes = n => { const p = n.replace(/\.pdf$/, '').split(' - '); return { ceco: p[p.length - 2], texto: p[p.length - 1] }; };
  let ok = true;
  pares.forEach(([cot, ot]) => {
    const ct = partes(F._nombrePDFCot(cot));
    const hs = partes(F._nombrePDFHoja(F._datosHojaConCot(ot, cot, cot.centro)));
    if (ct.ceco !== hs.ceco || ct.texto !== hs.texto) {
      ok = false;
      chequear(false, 'CT ' + cot.numeroCotizacion + ' y su HS no calzan: "' + ct.ceco + ' / ' + ct.texto + '" vs "' + hs.ceco + ' / ' + hs.texto + '"');
    }
  });
  console.log('4b) Par CT-HS: ' + (ok ? 'mismo CECO y mismo texto breve en los dos archivos ✓' : 'no calzan ✗'));
}

// ── 4c. Tildes y ñ se transliteran, no se borran ─────────────────────────────────────────────
{
  // Reales: COT 13072606 "Destape baño" y COT 27082612 "Fijación estanco". Sin el normalize la lista
  // blanca las borraba: "Destape ba o", "Fijaci n estanco" (47 nombres de produccion).
  const a = F._nombrePDFCot({ numeroCotizacion: '13072606', centro: '748', local: 'x', nombreServicio: 'Destape baño' });
  const b = F._nombrePDFCot({ numeroCotizacion: '27082612', centro: '709', local: 'x', nombreServicio: 'Fijación estanco' });
  chequear(a === 'CT - 13072606 - ceco 0748 - Destape bano.pdf', 'tildes: salio "' + a + '"');
  chequear(b === 'CT - 27082612 - ceco 0709 - Fijacion estanco.pdf', 'tildes: salio "' + b + '"');
  console.log('4c) Tildes: ' + a + (a === 'CT - 13072606 - ceco 0748 - Destape bano.pdf' ? ' ✓' : ' ✗'));
}

// ── 5. El folio se copia, no se rearma; y si falta, se ve ────────────────────────────────────────
{
  const base = { otNumero: 9464, nombreServicio: 'Cambio de lamas', local: 'S10 Chillan 2' };
  const viejo = F._nombrePDFCot(Object.assign({}, base, { numeroCotizacion: '13072601' }));
  const respeta = viejo.indexOf('CT - 13072601 - ') === 0;
  chequear(respeta, 'el folio del documento no quedo al principio: "' + viejo + '"');
  const sinFolio = F._nombrePDFCot(Object.assign({}, base, { numeroCotizacion: '' }));
  const seVe = sinFolio.indexOf('CT - SIN-NUMERO - ') === 0;
  chequear(seVe, 'sin folio el nombre no lo delata: "' + sinFolio + '"');
  // La cotizacion en la mano gana sobre un folio viejo copiado en la OT.
  const hs = F._nombrePDFHoja(F._datosHojaConCot({ numero: 1, cotizacionNumero: '01010101', local: 'x' },
    { numeroCotizacion: '15092601', nombreServicio: 'x' }, ''));
  chequear(hs.indexOf('CT 15092601') > 0, 'el folio viejo de la OT le gano a la cotizacion vigente: "' + hs + '"');
  console.log('5) Folio: ' + (respeta && seVe ? 'se copia tal cual, y si falta se ve ✓' : 'se altera o se disimula ✗'));
}

// ── 6. La CT no lleva el N° de OT; una HS sin numero lo delata ────────────────────────────────
{
  const previa = { numeroCotizacion: '14092601', otNumero: '', tipoCot: 'previa', local: 'Alvi Concepcion', nombreServicio: 'Cambio de lamas' };
  const n = F._nombrePDFCot(previa);
  chequear(n === 'CT - 14092601 - ceco 3089 - Cambio de lamas.pdf', 'previa: salio "' + n + '"');
  const conOT = F._nombrePDFCot(COT_15092601);
  chequear(conOT.indexOf('796863') < 0 && !/\bHS\b/.test(conOT), 'la CT trae el N° o la sigla de la HS: "' + conOT + '"');
  [0, '', null, undefined].forEach(function (v) {
    const r = F._nombrePDFHoja({ otNumero: v, numero: v, local: 'x', descripcionTrabajo: 'x' });
    chequear(r.indexOf('HS - SIN-NUMERO - ') === 0, 'HS con otNumero=' + JSON.stringify(v) + ' salio "' + r + '"');
  });
  console.log('6) Previa y numero: ' + (n.indexOf('CT - 14092601') === 0 ? n + ' ✓' : 'salio "' + n + '" ✗'));
}

// ── 7. Preventivo: el servicio y su mes, nunca las Observaciones ───────────────────────────────
{
  const hoja = { otNumero: 9464, tipo: 'preventivo', ceco: '531', local: 'x', fecha: '07-07-2026',
    descripcionTrabajo: 'Para la proxima visita solicitar el cambio de 4 ruedas.' };
  const n = F._nombrePDFHoja(hoja);
  const esperado = 'HS - 9464 - ceco 0531 - MP Transpaletas Julio 2026.pdf';
  chequear(n === esperado, 'preventivo: se esperaba "' + esperado + '" y salio "' + n + '"');
  console.log('7) Preventivo: ' + (n === esperado ? n + ' ✓' : 'salio "' + n + '" ✗'));
}

// ── 8. Descarga: public_id limpio, nombre por fl_attachment, y lo ajeno intacto ────────────────
{
  const slug = F._slugPDFCot(COT_15092601);
  chequear(!/\s/.test(slug) && slug.length > 0, 'el public_id trae espacios: "' + slug + '"');
  const url = 'https://res.cloudinary.com/dcrf29tna/raw/upload/v1789474108/emval/cotizaciones/COT_15092601_ceco_SIN_CECO_Destape_piletas_y_camara_107503.pdf';
  const conNombre = F._urlDescargaCot(Object.assign({}, COT_15092601, { pdfUrl: url }));
  const lleva = conNombre === 'https://res.cloudinary.com/dcrf29tna/raw/upload/fl_attachment:CT%20-%2015092601%20-%20ceco%203164%20-%20Destape%20piletas%20y%20camara/v1789474108/emval/cotizaciones/COT_15092601_ceco_SIN_CECO_Destape_piletas_y_camara_107503.pdf';
  chequear(lleva, 'la URL de descarga de la CT no es la verificada contra Cloudinary: "' + conNombre + '"');
  const linkApp = 'https://desarrollobastian-design.github.io/emval-app/?pdf=KRUvZwab3Zb7QeebOBdv';
  chequear(F._urlDescargaCot(Object.assign({}, COT_15092601, { pdfUrl: linkApp })) === linkApp, 'el link a la app fue modificado por _urlDescargaCot');
  chequear(F._urlDescargaCot({}) === '', 'sin pdfUrl no devolvio vacio');
  chequear(F._urlDescargaCot({ pdfUrl: conNombre }) === conNombre, 'una URL que ya trae fl_attachment recibio un segundo');
  console.log('8) Descarga: ' + (lleva ? 'fl_attachment con el nombre nuevo ✓' : 'algo se rompio ✗'));
}

// ── 9. El generador huerfano no reinventa el formato ─────────────────────────────────────────
{
  const i = src.indexOf('async function generarPDFCotizacion(');
  chequear(i > 0, 'no se encontro generarPDFCotizacion en ' + ruta);
  const bloque = i > 0 ? src.slice(i) : '';
  const usaLaComun = /doc\.save\(\s*_nombrePDFCot\(/.test(bloque);
  chequear(usaLaComun, 'generarPDFCotizacion volvio a armar su propio nombre en vez de usar _nombrePDFCot');
  console.log('9) Generador huerfano: ' + (usaLaComun ? 'usa el mismo nombre que el resto ✓' : 'tiene su propio formato ✗'));
}

console.log('');
if (fallos.length) {
  console.error('FALLOS:\n' + fallos.join('\n'));
  process.exit(1);
}
console.log('OK — la CT y la HS salen con el nombre que exige SMU.');
