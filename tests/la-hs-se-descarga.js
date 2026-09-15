/* Prueba de regresion — la HS y la CT se pueden DESCARGAR, diga lo que diga el texto del trabajo.

   Caso HS 796863 / COT 15092601 (15-09-2026). El supervisor de SMU y Pedro no pudieron bajar la
   HS: ERR_INVALID_RESPONSE en el PC, "descarga pendiente" en el celular. El archivo estaba
   intacto; lo roto era el ENLACE. Desde 943888e cada descarga de una HS le pega el nombre con
   `fl_attachment:<nombre>`, y el nombre traia "Venta Asistida.-".

   🔬 Medido con curl contra Cloudinary (15-09-2026), caracter por caracter: dentro de
   `fl_attachment:` solo pasan [A-Za-z0-9], espacio, '-', '_', '!' y '$'. Con '.', ',', '(', ')',
   "'", '#', '&', '+', ';', '=', '@', '~', '%', '"', '/', ':' o no-ASCII responde 400. Barrido de
   produccion: 99 de 276 HS armaban un enlace roto, y 1 CT ("…termo, retiro termo malo").

   La suite quedaba en verde (24/24) porque ningun fixture traia puntuacion. Por eso aca:

   1. LOS TEXTOS SON LOS DE PRODUCCION, y ademas se barre TODO el ASCII imprimible y un poco de
      Unicode: el segmento `fl_attachment:` que sale tiene que cumplir la lista blanca, venga el
      nombre de donde venga (se prueba `_urlPDFDescarga` con nombres crudos, no solo con los que
      ya arma `_nombrePDFHoja`).
   2. UN SOLO SITIO ARMA `fl_attachment:` en la app (mas `_urlDescargaCot`, que usa la misma
      limpieza). Un tercero con su propia limpieza es como volvio a entrar el punto.
   3. EL LINK A LA APP NO SE TOCA: pegarle '.pdf' a `?pdf=<id>` dejaba el correo al local con
      "No encontramos el PDF" justo cuando Cloudinary fallo.
   4. SI LA DESCARGA NOMBRADA FALLA por un 400 se abre el archivo SIN `fl_attachment`; si fue la red,
      la URL nombrada (valida). Y el correo "Enviar hojas" de preventivos lleva la nomenclatura.
   5. Con --prod: HEAD de verdad a Cloudinary con las URLs que arma el codigo para los casos reales
      (796863 con punto, 9618 con parentesis, 01082617 con coma). Tienen que responder 200/206 con
      Content-Disposition. Son GET de rango publicos: no suben nada ni gastan cuota.
      Contraprueba: con el codigo de 943888e los tres dan 400.

   Uso:  node tests/la-hs-se-descarga.js index.html [--prod] */

const fs = require('fs');
const { execFileSync } = require('child_process');
const ruta = process.argv[2] || 'index.html';
const PROD = process.argv.includes('--prod');
const src = fs.readFileSync(ruta, 'utf8');

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); }

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

const NOMBRES = ['_normTexto', '_localCanonico', '_indexarCadenas', '_nombreAdjuntoSeguro',
  '_urlPDFDescarga', '_urlPDFSinNombre', '_recortarPalabras', '_cecoDocumento', '_cecoDelCatalogo',
  '_cecoDe', '_nombreDocumento', '_trabajoDocumento', '_nombrePDFHoja', '_datosHojaConCot',
  '_nombrePDFCot', '_urlDescargaCot'];
const fuentes = NOMBRES.map(texto);
const faltan = NOMBRES.filter((n, i) => !fuentes[i]);
if (faltan.length) {
  console.error('No se encontro en ' + ruta + ': ' + faltan.join(', '));
  console.error('Si se renombraron, este test hay que revalidarlo — no solo arreglarlo.');
  process.exit(1);
}
const meses = (src.match(/const _MESES_DOC = (\[[^\]]*\]);/) || [])[1] || '[]';
const F = new Function(
  'var window = { ALIAS_LOCALES: { "s10 concepcion": "M10 CONCEPCION" } };\n' +
  'var _store = { emval_cadenas_cache: JSON.stringify([{ nombre: "M10", sucursales: [{ nombre: "M10 CONCEPCION", centro: "3164" }] }]) };\n' +
  'var localStorage = { getItem: function(k){ return _store[k] == null ? null : _store[k]; } };\n' +
  'var _cecoIdxCache = { raw: null, idx: null };\n' +
  'const _MESES_DOC = ' + meses + ';\n' +
  fuentes.join('\n\n') + '\nreturn { ' + NOMBRES.map(n => n + ': ' + n).join(', ') + ' };')();

// El segmento que Cloudinary lee, ya decodificado como lo decodifica su servidor.
const PERMITIDO = /^[A-Za-z0-9 _!$-]*$/;
function segmento(url) {
  const m = String(url).match(/\/raw\/upload\/fl_attachment:([^/]*)\//);
  return m ? decodeURIComponent(m[1]) : null;
}

const RAW_796863 = 'https://res.cloudinary.com/dcrf29tna/raw/upload/v1789395715/emval/pdfs/Recepcion_Obra_OT796863_qp9imoz.pdf';
const RAW_9618 = 'https://res.cloudinary.com/dcrf29tna/raw/upload/emval/pdfs/Recepcion_Obra_OT9618.pdf';
const RAW_01082617 = 'https://res.cloudinary.com/dcrf29tna/raw/upload/v1785638841/emval/cotizaciones/Cotizacion_UNIMARC_GOMEZ_CARRENO_Cambio_ubicacion_termo_retiro_termo_malo_2026-08-02_833331.pdf';

// Textos reales de produccion que rompian el enlace, con el caracter culpable.
const REALES = [
  { url: RAW_796863, datos: { otNumero: 796863, local: 'S10 Concepcion', ceco: '', tipo: 'correctivo', cotizacionNumero: '15092601',
      descripcionTrabajo: 'Asistencia por piletas tapadas en sector Venta Asistida.\n- Se realiza limpieza de cañerías de desagüe desde venta asistida (Carnicería y Fiambrería) hasta cámara de inspección.' } },
  { url: RAW_9618, datos: { otNumero: 9618, ceco: '745', tipo: 'correctivo', local: 'x',
      descripcionTrabajo: '- Se cambia 1 Mango Palanca completa (Manilla y Cadena) a transpaleta N°2.' } }
];
const COT_REAL = { pdfUrl: RAW_01082617, numeroCotizacion: '01082617', centro: '713',
  nombreServicio: 'Cambio ubicacion termo, retiro termo malo', local: 'UNIMARC GOMEZ CARRENO' };

console.log('La HS y la CT se pueden descargar\n');

// ── 1. Los nombres reales y un barrido de caracteres cumplen la lista blanca ──────────────────
{
  const urls = REALES.map(r => F._urlPDFDescarga(r.url, F._nombrePDFHoja(r.datos)))
    .concat([F._urlDescargaCot(COT_REAL)]);
  urls.forEach(u => {
    const s = segmento(u);
    chequear(s !== null && PERMITIDO.test(s), 'enlace real con caracteres que Cloudinary rechaza: "' + s + '"');
  });
  // Nombre crudo, sin pasar por el armador: la URL se defiende sola.
  let malos = 0;
  const imprimibles = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');
  const crudos = [imprimibles, 'Destape baño y reparación', 'N°2 · ½" — “ok”', 'a.b,c(d)e\'f#g&h+i;j=k@l~m%n"o/p:q', '\n\t.-', '...'];
  crudos.forEach(c => {
    const s = segmento(F._urlPDFDescarga(RAW_796863, 'HS - 1 - ' + c + '.pdf'));
    if (s !== null && !PERMITIDO.test(s)) { malos++; chequear(false, 'nombre crudo "' + c.slice(0, 30) + '" dejo pasar: "' + s + '"'); }
  });
  // La lista blanca no puede comerse letras: sin el normalize, "baño" salia "ba o" (47 nombres reales).
  const tildes = segmento(F._urlPDFDescarga(RAW_796863, 'HS - 1 - Destape baño y reparación Fijación.pdf'));
  chequear(tildes === 'HS - 1 - Destape bano y reparacion Fijacion', 'las tildes y la ñ no se transliteran: "' + tildes + '"');
  // Y el nombre que baja el navegador (a.download, File, doc.save) usa la misma lista blanca.
  const archivo = F._nombrePDFHoja(REALES[0].datos);
  chequear(PERMITIDO.test(archivo.replace(/\.pdf$/, '')), 'el nombre del archivo local trae caracteres fuera de la lista: "' + archivo + '"');
  console.log('1) Lista blanca: ' + (malos === 0 ? 'los 3 casos reales y el barrido de caracteres salen limpios ✓' : malos + ' nombres se cuelan ✗'));
  console.log('   ' + segmento(urls[0]) + '\n   ' + segmento(urls[1]) + '\n   ' + segmento(urls[2]));
}

// ── 2. `fl_attachment` solo aparece dentro de las funciones que lo manejan ────────────────────
{
  /* No se busca una forma de escribirlo (comillas, template, concatenado): se busca la PALABRA en el
     codigo y se exige que cada aparicion caiga DENTRO de _urlPDFDescarga (la unica que lo arma) o
     de _urlPDFSinNombre (la que lo saca). La revision del 15-09 armo un tercer sitio con
     `url.replace('/raw/upload/', '/raw/upload/fl_attachment:' + …)` y el guardia anterior, que
     buscaba el literal entre comillas, no lo vio.
     Los comentarios se enmascaran con espacios (mismo largo) para no correr las posiciones. */
  const enmascarado = src
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, m => m.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*\/\/.*$/gm, m => ' '.repeat(m.length))
    .replace(/[ \t]\/\/ .*$/gm, m => ' '.repeat(m.length));
  const rangos = ['_urlPDFDescarga', '_urlPDFSinNombre'].map(n => {
    const i = src.indexOf('function ' + n + '(');
    return [i, i + (texto(n) || '').length];
  });
  const fuera = [];
  let k = enmascarado.indexOf('fl_attachment');
  while (k !== -1) {
    if (!rangos.some(([a, b]) => k >= a && k < b)) {
      const linea = src.slice(0, k).split('\n').length;
      fuera.push(linea + ': ' + src.split('\n')[linea - 1].trim().slice(0, 90));
    }
    k = enmascarado.indexOf('fl_attachment', k + 1);
  }
  chequear(!fuera.length, 'fl_attachment aparece fuera de _urlPDFDescarga/_urlPDFSinNombre:\n      ' + fuera.join('\n      '));
  const limpia = /_nombreAdjuntoSeguro\(nombre\)/.test(texto('_urlPDFDescarga'));
  const delega = /_urlPDFDescarga\(url, _nombrePDFCot\(cot\)\)/.test(texto('_urlDescargaCot'));
  chequear(limpia, '_urlPDFDescarga no pasa el nombre por _nombreAdjuntoSeguro');
  chequear(delega, '_urlDescargaCot no delega en _urlPDFDescarga: hay otro sitio armando el enlace');
  // Y la URL se defiende sola: una que ya trae un nombre sucio (otro camino, un correo viejo) sale limpia.
  const sucia = RAW_796863.replace('/raw/upload/', '/raw/upload/fl_attachment:' + encodeURIComponent('HS - 1 - Venta Asistida.- (x)') + '/');
  const rearmada = F._urlPDFDescarga(sucia, '');
  chequear(segmento(rearmada) === 'HS - 1 - Venta Asistida - x', 'una URL con nombre sucio no se rearmo: "' + segmento(rearmada) + '"');
  const limpiaYa = F._urlPDFDescarga(RAW_796863, 'HS - 1 - ok');
  chequear(F._urlPDFDescarga(limpiaYa, 'otro') === limpiaYa, 'una URL con nombre limpio recibio otro');
  console.log('2) Un solo criterio: ' + (!fuera.length && limpia && delega ? 'fl_attachment vive en una sola funcion ✓' : 'hay otro camino ✗'));
}

// ── 3. El link a la app no se toca ───────────────────────────────────────────────────────────────
{
  const app = 'https://desarrollobastian-design.github.io/emval-app/?pdf=QymC3p15Nvh793cfvRcb';
  const r = F._urlPDFDescarga(app, 'HS - 574797 - ceco 0966 - x.pdf');
  chequear(r === app, 'el link a la app salio modificado: "' + r + '"');
  const sinExt = 'https://res.cloudinary.com/dcrf29tna/raw/upload/emval/pdfs/Recepcion_Obra_OT1';
  chequear(F._urlPDFDescarga(sinExt) === sinExt + '.pdf', 'un raw de Cloudinary sin extension no recibio .pdf');
  chequear(F._urlPDFDescarga('') === '', 'vacio no devolvio vacio');
  const ya = F._urlPDFDescarga(RAW_796863, 'HS - 1 - x');
  chequear(F._urlPDFDescarga(ya, 'otro') === ya, 'una URL con fl_attachment recibio un segundo');
  console.log('3) Link a la app: ' + (r === app ? 'intacto, sin ".pdf" pegado ✓' : 'modificado ✗'));
}

// ── 4. Si la descarga nombrada falla, se abre el archivo sin fl_attachment ────────────────────
{
  const conNombre = F._urlPDFDescarga(RAW_796863, 'HS - 796863 - x');
  chequear(F._urlPDFSinNombre(conNombre) === RAW_796863, '_urlPDFSinNombre no devolvio el raw: "' + F._urlPDFSinNombre(conNombre) + '"');
  // Un 400 (nombre rechazado) abre el raw; un corte de red o de tiempo reabre la URL NOMBRADA, que
  // es valida — abrir el raw ahi bajaba la CT como "COT_…_SIN_CECO_…" (revision del 15-09).
  const d = texto('_descargarPDFNombrado') || '';
  const respaldo = /window\.open\(\s*\/HTTP 400\/\.test\(.*?\)\)\s*\?\s*_urlPDFSinNombre\(u\)\s*:\s*u\s*,/.test(d);
  chequear(respaldo, '_descargarPDFNombrado no distingue el 400 (raw) de un corte de red (URL nombrada)');
  // El correo "Enviar hojas" de preventivos tambien sale con la nomenclatura y la lista blanca.
  const envioHojas = /_urlPDFDescarga\(h\.pdfUrl, _nombrePDFHoja\(h\)\)/.test(src.slice(src.indexOf('async function _procesarEnvioHojas(')));
  chequear(envioHojas, 'el correo de hojas preventivas manda el enlace crudo, sin la nomenclatura HS');
  console.log('4) Respaldo y correo de hojas: ' + (respaldo && envioHojas ? '400 -> raw, red -> nombrada; hojas con nombre ✓' : '✗'));
}

// ── 5. Contra Cloudinary de verdad ──────────────────────────────────────────────────────────────
if (PROD) {
  const casos = [
    ['HS 796863 (punto)', F._urlPDFDescarga(REALES[0].url, F._nombrePDFHoja(REALES[0].datos))],
    ['HS 9618 (parentesis)', F._urlPDFDescarga(REALES[1].url, F._nombrePDFHoja(REALES[1].datos))],
    ['CT 01082617 (coma)', F._urlDescargaCot(COT_REAL)]
  ];
  casos.forEach(([etiqueta, url]) => {
    let cab = '';
    try { cab = execFileSync('curl', ['-s', '-o', '/dev/null', '-D', '-', '-r', '0-0', '--max-time', '25', url], { encoding: 'utf8' }); }
    catch (e) { cab = String(e.stdout || ''); }
    const code = (cab.match(/^HTTP\/\S+\s+(\d+)/m) || [])[1];
    const disp = (cab.match(/^content-disposition:\s*(.*)$/mi) || [])[1] || '';
    const ok = (code === '200' || code === '206') && /attachment; filename=/.test(disp);
    chequear(ok, etiqueta + ': HTTP ' + code + ' ' + disp.trim());
    console.log('5) ' + etiqueta + ': HTTP ' + code + ' ' + disp.trim() + (ok ? ' ✓' : ' ✗'));
  });
} else {
  console.log('5) Cloudinary: omitido (correr con --prod para el HEAD de verdad)');
}

console.log('');
if (fallos.length) {
  console.error('FALLOS:\n' + fallos.join('\n'));
  process.exit(1);
}
console.log('OK — los enlaces de descarga de HS y CT abren.');
