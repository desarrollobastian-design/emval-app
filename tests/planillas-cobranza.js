/* Prueba de regresion — las planillas de cobranza no cobran de mas ni se comen un trabajo.

   Extrae _plDatosPreventivos() y _plDatosCorrectivos() TAL CUAL estan en index.html, junto con
   los helpers reales de los que dependen (_dedupeOTs, _fechaOTms, _localCanonico, _hojaLista...),
   y las corre contra un set de OT y cotizaciones armado para pisar las reglas que costaron plata:

     · una cotizacion `previa` sumada a la deuda la infla al doble y SMU rechaza el paquete entero
     · un local cobrado dos veces (la misma OT guardada en dos documentos)
     · una hoja preventiva que quedo con tipo 'correctivo' por el bug del estado global (31-jul):
       si se la trata por el tipo, desaparece de la planilla y nadie la cobra
     · una hoja ejecutada en agosto pertenece al ciclo de julio — con seis columnas de meses
       impares se caia de la matriz
     · la OT de una cuenta de prueba no puede viajar dentro de un documento que va a SMU

   Uso:  node tests/planillas-cobranza.js index.html            (offline, sin dependencias)
         node tests/planillas-cobranza.js index.html --prod     (ademas cuadra contra produccion)

   Sale 0 si todas pasan; 1 si alguna falla. */

const fs = require('fs');
const vm = require('vm');
const ARCHIVO = process.argv[2] || 'index.html';
const CONTRA_PRODUCCION = process.argv.indexOf('--prod') !== -1;
const src = fs.readFileSync(ARCHIVO, 'utf8');

function extraer(desde, hasta) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('No se encontro: ' + desde);
  const j = src.indexOf(hasta, i);
  if (j < 0) throw new Error('No se encontro el fin de: ' + desde);
  return src.slice(i, j);
}

// El codigo REAL de la app, no una copia. Si alguien renombra una de estas funciones el test se
// cae con "No se encontro" — a proposito: avisa que la planilla hay que revalidarla.
const codigo = [
  extraer('function _normTipo(tipo)', '\n// Texto normalizado para comparar'),
  extraer('function _normTexto(s) {', '\n// =========== LOGIN ==========='),
  extraer('const OCULTOS_TECNICOS', '\n// Escapa texto para meterlo seguro'),
  extraer('var PL_TARIFA_TRANSPALETA = 37000;', '\nfunction planillaTab('),
  extraer('function _plDatosPreventivos()', '\nfunction _plRenderPreventivos('),
  extraer('function _plDatosCorrectivos()', '\nfunction _plGuardarCampo(')
].join('\n');

const sandbox = { window: {}, console: { log() {}, warn() {}, error() {} }, _plCache: null, _plAnio: 2026 };
vm.createContext(sandbox);
vm.runInContext(codigo, sandbox, { filename: 'index.html (extraido)' });

let fallos = 0, pasadas = 0;
function ok(cond, etiqueta, detalle) {
  if (cond) { pasadas++; console.log('  PASA   ' + etiqueta); }
  else { fallos++; console.log('  FALLA  ' + etiqueta + (detalle ? '\n           -> ' + detalle : '')); }
}
function igual(real, esperado, etiqueta) {
  ok(real === esperado, etiqueta, 'esperado ' + JSON.stringify(esperado) + ', obtenido ' + JSON.stringify(real));
}

// ── El escenario ─────────────────────────────────────────────────────────────────────────────
const PAUTA = new Array(11).fill('si');
const SUCURSALES = [
  { formato: 'Unimarc', nombre: 'UNIMARC PENCO',      centro: '71',  supervisor: 'C. Zapata' },
  { formato: 'Unimarc', nombre: 'UNIMARC HIGUERAS',   centro: '74',  supervisor: 'R. Abedrapo' },
  { formato: 'Alvi',    nombre: 'ALVI CANETE',        centro: '3235', supervisor: 'P. Blake' },
  { formato: 'M10',     nombre: 'M10 LOS ANGELES',    centro: '3020', supervisor: 'C. Zapata' },
  { formato: 'Unimarc', nombre: 'UNIMARC SIN VISITA', centro: '999', supervisor: 'P. Blake' }
];

const ORDENES = [
  // Julio: 3 transpaletas -> $111.000, columna Jul
  { id: 'a', numero: 9001, local: 'UNIMARC PENCO', tipo: 'preventivo', tecnico: 'Lucas Fernández',
    fecha: '10-07-2026', ceco: '71', numEquipos: '03', firmada: true, pdfUrlCloudinary: 'x.pdf', serviciosPreventivo: PAUTA },
  // EL MISMO trabajo guardado dos veces (pausada + cierre). No puede cobrarse dos veces.
  { id: 'a-dup', numero: 9001, local: 'UNIMARC PENCO', tipo: 'preventivo', tecnico: 'Lucas Fernández',
    fecha: '10-07-2026', ceco: '71', numEquipos: '03', firmada: false, serviciosPreventivo: [] },
  // AGOSTO: pertenece al ciclo de julio, no puede caerse de la matriz
  { id: 'b', numero: 9002, local: 'UNIMARC HIGUERAS', tipo: 'preventivo', tecnico: 'Lucas Fernández',
    fecha: '01-08-2026', ceco: '74', numEquipos: '2', firmada: true, pdfUrlCloudinary: 'x.pdf', serviciosPreventivo: PAUTA },
  // Hoja preventiva que el bug del estado global guardo como 'correctivo': la pauta la delata
  { id: 'c', numero: 9003, local: 'ALVI CANETE', tipo: 'correctivo', tecnico: 'Lucas Fernández',
    fecha: '15-03-2026', ceco: '3235', numEquipos: '5', firmada: true, pdfUrlCloudinary: 'x.pdf', serviciosPreventivo: PAUTA },
  // Sin N de transpaletas: aparece, pero no inventa monto
  { id: 'd', numero: 9004, local: 'M10 LOS ANGELES', tipo: 'preventivo', tecnico: 'Lucas Fernández',
    fecha: '12-07-2026', ceco: '', numEquipos: '', firmada: true, pdfUrlCloudinary: 'x.pdf', serviciosPreventivo: PAUTA },
  // Local que no esta en el catalogo: se cobra igual, con su propia fila
  { id: 'e', numero: 9005, local: 'UNIMARC FUERA DE CATALOGO', tipo: 'preventivo', tecnico: 'Lucas Fernández',
    fecha: '20-07-2026', ceco: '555', numEquipos: '4', firmada: true, pdfUrlCloudinary: 'x.pdf', serviciosPreventivo: PAUTA },
  // Cuenta de prueba: NO puede viajar en un documento que va a SMU
  { id: 'f', numero: 9678, local: 'Entel Talcahuano', tipo: 'preventivo', tecnico: 'Bastian Baeza',
    fecha: '09-07-2026', ceco: '1111', numEquipos: '9', firmada: true, serviciosPreventivo: PAUTA },
  // Ano anterior: fuera de la matriz de 2026
  { id: 'g', numero: 8001, local: 'UNIMARC PENCO', tipo: 'preventivo', tecnico: 'Lucas Fernández',
    fecha: '10-07-2025', ceco: '71', numEquipos: '7', firmada: true, serviciosPreventivo: PAUTA },
  // Correctivas: una cotizada y otra no
  { id: 'h', numero: 7001, local: 'UNIMARC PENCO', tipo: 'correctivo', tecnico: 'José Quiroz',
    fecha: '05-07-2026', descripcionTrabajo: 'Cambio de llave', serviciosPreventivo: [] },
  { id: 'i', numero: 7002, local: 'UNIMARC HIGUERAS', tipo: 'correctivo', tecnico: 'José Quiroz',
    fecha: '22-07-2026', descripcionTrabajo: 'Sanitizado de estanque', serviciosPreventivo: [] }
];

const COTIZACIONES = [
  { id: 'c1', local: 'UNIMARC PENCO', centro: '71', nombreServicio: 'Cambio de llave',
    numeroCotizacion: '13072601', otNumero: 7001, total: 120000, fecha: '05-07-2026', enviado: true },
  { id: 'c2', local: 'ALVI CANETE', centro: '3235', nombreServicio: 'Ruedas motriz',
    numeroCotizacion: '13072602', otNumero: 7050, total: 80000, fecha: '06-07-2026', enviado: false },
  // PRESUPUESTO DE OBRA: no hay trabajo detras. No suma.
  { id: 'c3', local: 'UNIMARC HUALQUI', centro: '737', nombreServicio: 'Plan de invierno',
    numeroCotizacion: '13072603', total: 4390000, fecha: '30-06-2026', tipoCot: 'previa', estadoCot: 'Pendiente' }
];

sandbox._plCache = {
  ordenes: ORDENES.filter(sandbox._plVisible),
  cotizaciones: COTIZACIONES,
  sucursales: SUCURSALES
};

// ── Preventivos ──────────────────────────────────────────────────────────────────────────────
console.log('\n  Planilla de preventivos');
const P = sandbox._plDatosPreventivos();
const porLocal = {};
P.filas.forEach(f => { porLocal[f.nombre] = f; });

igual(P.total, (3 + 2 + 5 + 4) * 37000, 'el total suma solo las hojas cobrables del ano');
igual(P.hojas, 5, 'cuenta 5 hojas (la duplicada colapsa, la de prueba y la de 2025 quedan fuera)');
igual(P.duplicados, 1, 'detecta y colapsa el documento duplicado');
igual(porLocal['UNIMARC PENCO'].celdas[3].length, 1, 'PENCO tiene UNA sola hoja en el bimestre de julio');
igual(porLocal['UNIMARC PENCO'].total, 111000, 'PENCO se cobra una vez: 3 x 37.000');
igual(porLocal['UNIMARC HIGUERAS'].celdas[3].length, 1, 'la hoja del 1-ago cae en la columna Jul (ciclo bimestral)');
igual(porLocal['ALVI CANETE'].celdas[1].length, 1, 'la hoja con tipo cruzado se cobra igual: la pauta de 11 la delata');
igual(porLocal['ALVI CANETE'].total, 185000, 'y con su monto correcto');
igual(porLocal['M10 LOS ANGELES'].total, 0, 'la hoja sin N de transpaletas no inventa monto');
ok(!!porLocal['UNIMARC FUERA DE CATALOGO'], 'el local que no esta en el catalogo NO se pierde: tiene su fila');
igual(porLocal['UNIMARC FUERA DE CATALOGO'].enCatalogo, false, 'y queda marcado como fuera del catalogo');
ok(!porLocal['Entel Talcahuano'], 'la OT de la cuenta de prueba no aparece en la planilla');
igual(porLocal['UNIMARC SIN VISITA'].total, 0, 'el local sin preventivo aparece en la lista, en cero');
igual(P.totalBim[3], (3 + 2 + 4) * 37000, 'el total del bimestre julio-agosto cuadra');
igual(P.totalBim[1], 5 * 37000, 'el total del bimestre marzo-abril cuadra');
igual(P.totalBim.reduce((a, b) => a + b, 0), P.total, 'la suma de los bimestres es el total');
igual(porLocal['UNIMARC PENCO'].supervisor, 'C. Zapata', 'la fila trae el supervisor del catalogo');

// ── Correctivos ──────────────────────────────────────────────────────────────────────────────
console.log('\n  Planilla de correctivos');
const C = sandbox._plDatosCorrectivos();
igual(C.total, 200000, 'la deuda NO incluye la cotizacion previa');
igual(C.cobrables.length, 2, 'dos trabajos cobrables');
igual(C.previas.length, 1, 'la previa va en su propio bloque');
igual(C.totalPrevias, 4390000, 'con su propio total, separado de la deuda');
igual(C.sumaEnviadas, 120000, 'suma de enviadas');
igual(C.sumaSinEnviar, 80000, 'suma de sin enviar');
igual(C.sumaEnviadas + C.sumaSinEnviar, C.total, 'enviadas + sin enviar = total cobrable');
const sinCot = C.sinCotizar.map(o => o.numero);
ok(sinCot.indexOf(7002) !== -1, 'el trabajo ejecutado sin cotizar aparece listado');
ok(sinCot.indexOf(7001) === -1, 'el trabajo que SI tiene cotizacion no aparece como pendiente');
ok(sinCot.indexOf(9001) === -1, 'una hoja preventiva no se cuenta como correctivo sin cotizar');
ok(C.sinCotizar.every(o => o.monto === undefined), 'a los trabajos sin cotizar no se les inventa monto');

// El N 9001 esta cobrado como preventivo (PENCO) y ademas como correctivo: si las dos planillas
// llegan juntas, SMU ve el mismo numero dos veces. La app no lo arregla sola, pero avisa.
// El caso real de la 9530: DOS correctivos comparten el numero con UN preventivo. Se agrupa por
// numero — decir "2 numeros repetidos" mandaria a Pedro a buscar un segundo que no existe.
sandbox._plCache.cotizaciones = COTIZACIONES.concat([{
  id: 'c4', local: 'UNIMARC HUALPEN', centro: '740', nombreServicio: 'Sanitizacion estanque',
  numeroCotizacion: '13072604', otNumero: 9001, total: 350000, fecha: '25-06-2026', enviado: true
}, {
  id: 'c5', local: 'S10 Los Angeles', centro: '', nombreServicio: 'Correctivo transpaletas',
  numeroCotizacion: '13072605', otNumero: 9001, total: 79800, fecha: '01-07-2026', enviado: false
}]);
const C2 = sandbox._plDatosCorrectivos();
igual(C2.chocanConPreventivos.length, 1, 'un solo N de OT repetido, aunque lo usen dos cotizaciones');
igual(C2.chocanConPreventivos[0].otNumero, 9001, 'y dice cual es');
igual(C2.chocanConPreventivos[0].correctivos.length, 2, 'nombrando los dos correctivos que lo comparten');
igual(C2.chocanConPreventivos[0].preventivo, 'UNIMARC PENCO', 'y contra que preventivo choca');

// ── Cuadre contra produccion (opcional) ──────────────────────────────────────────────────────
async function contraProduccion() {
  const KEY = (src.match(/apiKey:\s*"([^"]+)"/) || [])[1];
  const BASE = 'https://firestore.googleapis.com/v1/projects/emval-app/databases/(default)/documents';
  function val(v) {
    if (v == null) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('booleanValue' in v) return v.booleanValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(val);
    if ('mapValue' in v) { const o = {}; const f = v.mapValue.fields || {}; for (const k in f) o[k] = val(f[k]); return o; }
    return null;
  }
  async function leer(collectionId) {
    const r = await fetch(BASE + ':runQuery?key=' + KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId }] } })
    });
    const j = await r.json();
    return j.filter(x => x.document).map(x => {
      const o = { id: x.document.name.split('/').pop() };
      const f = x.document.fields || {};
      for (const k in f) o[k] = val(f[k]);
      return o;
    });
  }
  console.log('\n  Cuadre contra produccion (solo lectura)');
  const [ordenes, cotizaciones, cadenas] = await Promise.all([leer('ordenes'), leer('cotizaciones'), leer('cadenas')]);
  const sucursales = [];
  cadenas.forEach(c => (c.sucursales || []).forEach(s => {
    if (s && typeof s === 'object' && s.nombre) sucursales.push({ formato: c.nombre || '', nombre: s.nombre, centro: s.centro || '', supervisor: s.supervisor || '' });
  }));
  sandbox._plCache = { ordenes: ordenes.filter(sandbox._plVisible), cotizaciones, sucursales };
  const Pp = sandbox._plDatosPreventivos();
  const Cc = sandbox._plDatosCorrectivos();
  // Informe de Soporte del 01-ago: 59 hojas, 229 transpaletas, $8.473.000 (julio 2026).
  igual(Pp.totalBim[3], 8473000, 'preventivos jul-ago cuadra con el informe del 01-ago ($8.473.000)');
  igual(Pp.transpTotal, 229, 'las 229 transpaletas del informe');
  igual(Pp.hojas, 59, 'las 59 hojas cobrables del informe');
  // Informe del 02-ago: enviadas 23 = $4.374.700 (el total sube solo si Pedro sigue cotizando).
  igual(Cc.sumaEnviadas, 4374700, 'correctivos enviados cuadra con el informe del 02-ago');
  igual(Cc.previas.length, 6, 'las 6 cotizaciones previas siguen separadas de la deuda');
  ok(Cc.total >= 13029680, 'la deuda cobrable no baja del total del informe ($13.029.680), obtenido: ' + Cc.total);
  console.log('           deuda correctivos hoy: $' + Cc.total.toLocaleString('es-CL') +
              '  ·  previas (no suman): $' + Cc.totalPrevias.toLocaleString('es-CL') +
              '  ·  sin cotizar: ' + Cc.sinCotizar.length + ' trabajos');
}

(async () => {
  if (CONTRA_PRODUCCION) {
    try { await contraProduccion(); }
    catch (e) { fallos++; console.log('  FALLA  no se pudo cuadrar contra produccion: ' + e.message); }
  }
  console.log('\n  ' + pasadas + ' pasaron, ' + fallos + ' fallaron' + (CONTRA_PRODUCCION ? '' : '   (usa --prod para cuadrar contra los datos reales)') + '\n');
  process.exit(fallos ? 1 : 0);
})();
