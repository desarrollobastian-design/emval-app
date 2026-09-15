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
//    No se busca UNA forma de escribirlo mal (la revision del 15-09 encontro tres que pasaban):
//    se listan las UNICAS lineas de esas dos funciones que pueden nombrar el vinculo, y cualquier
//    otra —dentro del objeto, asignada despues, con o sin `|| ''`— hace fallar el test.
const guardarOT = cuerpo('async function guardarEnFirebase(');
const colaOT = cuerpo('async function sincronizarOTsPendientes(');
const PERMITIDAS = [
  /^cotizacion(Id|Numero): estado\.cotizacion\1 \|\| '',$/,                                  // snap: lee del estado
  /^cotizacionId: snap\.cotizacionId, cotizacionNumero: snap\.cotizacionNumero,$/,             // payload de la cola local
  /^if \((snap|ot)\.cotizacion(Id|Numero)\) (otData|otDoc)\.cotizacion\2 = \1\.cotizacion\2;$/, // escritura con valor
  /^(if \(!esEdicion && snap\.cotizacionId && snap\.enEspera === true\) \{|if \(ot\.cotizacionId\) \{|await _vincularCotizacionRealizada\((snap|ot)\.cotizacionId, \{|\} catch\(evc\) \{ console\.error\('Error vinculando cotizacion:', evc\); \})$/
];
const intrusas = [guardarOT, colaOT].join('\n').split('\n')
  .map(l => l.trim())
  .filter(l => /cotizacion(Id|Numero)/.test(l) && !/^\/\//.test(l))
  .filter(l => !PERMITIDAS.some(re => re.test(l)));
const condiciona = /if \(snap\.cotizacionNumero\) otData\.cotizacionNumero = snap\.cotizacionNumero;/.test(guardarOT) &&
  /if \(ot\.cotizacionNumero\) otDoc\.cotizacionNumero = ot\.cotizacionNumero;/.test(colaOT);
check(guardarOT && colaOT, 'no se encontraron guardarEnFirebase / sincronizarOTsPendientes');
check(!intrusas.length, 'el vinculo con la COT se escribe por otro camino (puede pisarlo con vacio):\n    ' + intrusas.join('\n    '));
check(condiciona, 'el cierre o la cola ya no condicionan cotizacionNumero a que traiga valor');
console.log('5) El vinculo COT-HS no se pisa con vacio: ' + (!intrusas.length && condiciona ? '✓' : '✗'));

// 6) _obtenerHojaDeCot, EJECUTADA con un Firestore espia. Lo que la HS que viaja a SMU no puede ser:
//    (a) la OT solo tiene el link a la app -> se busca en `pdfs` por otClientId y se encuentra;
//    (b) varias hojas de la misma OT -> la generacion MAS ALTA (_v2), no la primera por id
//        (OT 347723: el original sin corregir venia antes que la corregida);
//    (c) por N° de OT solo vale la del MISMO local (9016 y 9502 colisionaron entre locales);
//    (d) solo registros de otro local -> null, y el correo dice "HS no disponible".
(async function () {
  const FN = ['_normTexto', '_localCanonico', '_indexarCadenas', '_esPDFCompartible', '_pdfDeOT',
    '_nombreAdjuntoSeguro', '_recortarPalabras', '_cecoDocumento', '_cecoDelCatalogo', '_cecoDe',
    '_nombreDocumento', '_trabajoDocumento', '_nombrePDFHoja', '_datosHojaConCot', '_urlHojaMasReciente'];
  const fuentes = FN.map(n => cuerpo('function ' + n + '('));
  const obt = cuerpo('async function _obtenerHojaDeCot(');
  const faltan = FN.filter((n, i) => !fuentes[i]).concat(obt ? [] : ['_obtenerHojaDeCot']);
  if (faltan.length) { check(false, 'no se encontro: ' + faltan.join(', ')); return fin(); }
  const meses = (src.match(/const _MESES_DOC = (\[[^\]]*\]);/) || [])[1] || '[]';
  const hacer = new Function('DB',
    'var window = { ALIAS_LOCALES: {}, _firebaseReady: true, firebase: { firestore: function(){ return DB; } } };\n' +
    'var localStorage = { getItem: function(){ return null; } };\nvar _cecoIdxCache = { raw: null, idx: null };\n' +
    'const _MESES_DOC = ' + meses + ';\nfunction _conTimeout(p){ return p; }\nvar console = { warn: function(){} };\n' +
    fuentes.join('\n') + '\n' + obt + '\nreturn _obtenerHojaDeCot;');
  const RAW = 'https://res.cloudinary.com/dcrf29tna/raw/upload/emval/pdfs/';
  function db(ordenes, pdfs) {
    const snap = docs => ({ empty: !docs.length, docs: docs.map(d => ({ data: () => d })) });
    return { collection: col => ({
      doc: id => ({ get: async () => ({ exists: !!(ordenes[id]), id: id, data: () => ordenes[id] }) }),
      where: (campo, op, valor) => ({ limit: () => ({ get: async () =>
        snap(col === 'pdfs' ? pdfs.filter(p => p[campo] === valor) : []) }) })
    }) };
  }
  const app = 'https://desarrollobastian-design.github.io/emval-app/?pdf=abc';
  const casos = [
    ['a) OT con link a la app', { otId: 'ot1', otNumero: 1, local: 'UNIMARC A', numeroCotizacion: '1' },
      { ot1: { numero: 1, local: 'UNIMARC A', pdfUrl: app } },
      [{ otClientId: 'ot1', local: 'UNIMARC A', pdfUrlCloudinary: RAW + 'Recepcion_Obra_OT1_x.pdf' }],
      RAW + 'Recepcion_Obra_OT1_x.pdf'],
    ['b) la generacion mas alta', { otId: 'ot2', otNumero: 2, local: 'UNIMARC A', numeroCotizacion: '2' },
      { ot2: { numero: 2, local: 'UNIMARC A', pdfUrl: app } },
      [{ otClientId: 'ot2', local: 'UNIMARC A', pdfUrlCloudinary: RAW + 'Recepcion_Obra_OT2_x.pdf' },
       { otClientId: 'ot2', local: 'UNIMARC A', pdfUrlCloudinary: RAW + 'Recepcion_Obra_OT2_x_v3.pdf' },
       { otClientId: 'ot2', local: 'UNIMARC A', pdfUrlCloudinary: RAW + 'Recepcion_Obra_OT2_x_v2.pdf' }],
      RAW + 'Recepcion_Obra_OT2_x_v3.pdf'],
    ['c) por numero, el del mismo local', { otNumero: 9016, local: 'UNIMARC YUNGAY', numeroCotizacion: '3' }, {},
      [{ otNumero: 9016, local: 'Entel Talcahuano', pdfUrlCloudinary: RAW + 'otro_local.pdf' },
       { otNumero: 9016, local: 'unimarc yungay', pdfUrlCloudinary: RAW + 'Recepcion_Obra_OT9016.pdf' }],
      RAW + 'Recepcion_Obra_OT9016.pdf'],
    ['d) solo de otro local', { otNumero: 9502, local: 'Papa Johns Concepcion', numeroCotizacion: '4' }, {},
      [{ otNumero: 9502, local: 'Entel Talcahuano', pdfUrlCloudinary: RAW + 'otro_local.pdf' }],
      null]
  ];
  let ok = true;
  for (const [etq, cot, ordenes, pdfs, esperado] of casos) {
    const r = await hacer(db(ordenes, pdfs))(cot);
    const url = r ? r.url : null;
    if (url !== esperado) { ok = false; check(false, '_obtenerHojaDeCot ' + etq + ': devolvio ' + url + ', se esperaba ' + esperado); }
  }
  console.log('6) _obtenerHojaDeCot ejecutada: ' + (ok ? 'link a la app, version corregida y local propio ✓' : '✗'));
  fin();
})().catch(e => { check(false, '_obtenerHojaDeCot revento al ejecutarse: ' + e.message); fin(); });

function fin() {

if (fallos.length) {
  console.error('\nFALLOS:\n' + fallos.join('\n'));
  process.exit(1);
}
console.log('\nOK — COT y HS salen separadas y correlacionadas.');
}
