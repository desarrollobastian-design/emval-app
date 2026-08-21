/* Prueba de regresion — las planillas de cobranza no cobran de mas ni se comen un trabajo.

   Extrae _plDatosPreventivos() y _plDatosCorrectivos() TAL CUAL estan en index.html, junto con
   los helpers reales de los que dependen (_dedupeOTs, _fechaOTms, _localCanonico, _hojaLista...),
   y las corre contra un set de OT y cotizaciones armado para pisar las reglas que costaron plata:

     · una cotizacion `previa` SIN ejecutar sumada a la deuda la infla y SMU rechaza el paquete entero
     · la misma `previa` YA EJECUTADA (fusionada con su OT) sacada de la deuda esconde plata cobrada:
       son los dos lados del mismo criterio, y cada uno solo se ve si el otro esta en el set
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
  // _localCanonico y _indexarCadenas: los usa _plClienteDe para saber de que cliente es cada
  // documento. Sin cliente resuelto, ningun documento pertenece a ninguna planilla.
  extraer('window.ALIAS_LOCALES = window.ALIAS_LOCALES', '\n// Indexa las cadenas por local'),
  extraer('function _indexarCadenas(docs)', '\n// Identidad de una OT para detectar duplicados'),
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
    numeroCotizacion: '13072603', total: 4390000, fecha: '30-06-2026', tipoCot: 'previa', estadoCot: 'Pendiente' },
  // NACIO como presupuesto y el trabajo YA SE EJECUTO: se fusiono con su OT y quedo firmada.
  // Es deuda. El caso real es UNIMARC CARRERA (cot. 6072601, $1.475.000), que la app tenia
  // listada como "presupuesto sin respuesta" mientras Pedro la daba por cobrada.
  { id: 'c4-realizada', local: 'UNIMARC CARRERA', centro: '812', nombreServicio: 'Camara para bomba en anden',
    numeroCotizacion: '13072606', otNumero: 7003, total: 1475000, fecha: '06-07-2026', enviado: true,
    tipoCot: 'previa', estadoCot: 'Realizada' }
];

/* Igual que produccion: cargarPlanillas() le resuelve el cliente a CADA documento antes de
   meterlo al cache, y las planillas solo muestran los del cliente seleccionado. Sin este paso
   ningun documento pertenece a ninguna planilla y todos los totales dan 0.
   Se pasa `null` como indice a proposito: estos locales no vienen de un catalogo, asi que caen
   en el rescate por el nombre (PL_RE_SMU) — que es como se salvan los 2 locales reales que no
   resuelven contra `cadenas` y arrastran $740.000 en cotizaciones. */
function _conCliente(docs) {
  docs.forEach(d => { d._cliente = sandbox._plClienteDe(d, null); });
  return docs;
}
SUCURSALES.forEach(x => { x._cliente = sandbox._plClienteDe({ cadena: x.formato }, null); });

sandbox._plCache = {
  ordenes: _conCliente(ORDENES).filter(sandbox._plVisible),
  cotizaciones: _conCliente(COTIZACIONES),
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
igual(C.total, 200000 + 1475000, 'la deuda incluye la previa EJECUTADA y excluye la pendiente');
igual(C.cobrables.length, 3, 'tres trabajos cobrables');
igual(C.previas.length, 1, 'solo la previa sin ejecutar va al bloque aparte');
igual(C.totalPrevias, 4390000, 'con su propio total, separado de la deuda');
igual(C.sumaEnviadas, 120000 + 1475000, 'suma de enviadas');
igual(C.sumaSinEnviar, 80000, 'suma de sin enviar');
igual(C.sumaEnviadas + C.sumaSinEnviar, C.total, 'enviadas + sin enviar = total cobrable');

/* Los DOS lados del criterio, uno por uno. Cada atajo "obvio" rompe exactamente uno de estos
   dos, y los dos cuestan plata en direcciones opuestas: */
const enDeuda = {};
C.cobrables.forEach(function(c) { enDeuda[c.id] = true; });
ok(enDeuda['c4-realizada'],
   'la previa YA EJECUTADA entra a la deuda  (filtrar solo por tipoCot!==previa la escondia)');
ok(C.previas.every(function(c) { return c.id !== 'c4-realizada'; }),
   'y no queda ademas duplicada en el bloque de presupuestos');
ok(!enDeuda['c3'], 'la previa SIN ejecutar sigue fuera de la deuda');
ok(enDeuda['c1'] && enDeuda['c2'],
   'las cotizaciones normales (que NO tienen el campo estadoCot) siguen en la deuda  ' +
   '(filtrar solo por estadoCot===Realizada borraba la cobranza entera)');
igual(C.cobrables.length + C.previas.length, sandbox._plCache.cotizaciones.length,
   'ninguna cotizacion se pierde entre los dos bloques');
const sinCot = C.sinCotizar.map(o => o.numero);
ok(sinCot.indexOf(7002) !== -1, 'el trabajo ejecutado sin cotizar aparece listado');
ok(sinCot.indexOf(7001) === -1, 'el trabajo que SI tiene cotizacion no aparece como pendiente');
ok(sinCot.indexOf(9001) === -1, 'una hoja preventiva no se cuenta como correctivo sin cotizar');
ok(C.sinCotizar.every(o => o.monto === undefined), 'a los trabajos sin cotizar no se les inventa monto');

// El N 9001 esta cobrado como preventivo (PENCO) y ademas como correctivo: si las dos planillas
// llegan juntas, SMU ve el mismo numero dos veces. La app no lo arregla sola, pero avisa.
// El caso real de la 9530: DOS correctivos comparten el numero con UN preventivo. Se agrupa por
// numero — decir "2 numeros repetidos" mandaria a Pedro a buscar un segundo que no existe.
sandbox._plCache.cotizaciones = _conCliente(COTIZACIONES.concat([{
  id: 'c4', local: 'UNIMARC HUALPEN', centro: '740', nombreServicio: 'Sanitizacion estanque',
  numeroCotizacion: '13072604', otNumero: 9001, total: 350000, fecha: '25-06-2026', enviado: true
}, {
  id: 'c5', local: 'S10 Los Angeles', centro: '', nombreServicio: 'Correctivo transpaletas',
  numeroCotizacion: '13072605', otNumero: 9001, total: 79800, fecha: '01-07-2026', enviado: false
}]));
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
    if (s && typeof s === 'object' && s.nombre) sucursales.push({ formato: c.nombre || '', nombre: s.nombre, centro: s.centro || '', supervisor: s.supervisor || '',
      _cliente: sandbox._plClienteDe({ cadena: c.nombre }, null) });
  }));
  /* Con el catalogo REAL, igual que la app. Los numeros del informe de Soporte son de SMU: si el
     reparto por cliente se comiera una hoja de SMU, los tres asserts de abajo lo dicen. */
  const idxProd = sandbox._indexarCadenas(cadenas);
  ordenes.forEach(o => { o._cliente = sandbox._plClienteDe(o, idxProd); });
  cotizaciones.forEach(c => { c._cliente = sandbox._plClienteDe(c, idxProd); });
  sandbox._plCache = { ordenes: ordenes.filter(sandbox._plVisible), cotizaciones, sucursales };
  const Pp = sandbox._plDatosPreventivos();
  const Cc = sandbox._plDatosCorrectivos();
  // Informe de Soporte del 01-ago: 59 hojas, 229 transpaletas, $8.473.000 (julio 2026).
  igual(Pp.totalBim[3], 8473000, 'preventivos jul-ago cuadra con el informe del 01-ago ($8.473.000)');
  igual(Pp.transpTotal, 229, 'las 229 transpaletas del informe');
  igual(Pp.hojas, 59, 'las 59 hojas cobrables del informe');
  /* ⚠️ Estos dos numeros SUBEN solos cuando Pedro cotiza o marca una cotizacion como enviada:
     son datos, no codigo. Iban clavados con `===` a la foto del informe del 02-ago (23 enviadas =
     $4.374.700) y para el 05-ago ya daban $18.992.580 SIN QUE NADIE TOCARA EL CODIGO — el test
     quedo rojo por deriva y dejo de mirarse, que es como se cuela una regresion de verdad.
     Van como PISO: pueden crecer, nunca bajar. Si bajan, se perdio trabajo cobrable. */
  ok(Cc.sumaEnviadas >= 4374700, 'los correctivos enviados no bajan del informe del 02-ago ($4.374.700), obtenido: $' + Cc.sumaEnviadas.toLocaleString('es-CL'));
  ok(Cc.total >= 13029680, 'la deuda cobrable no baja del total del informe ($13.029.680), obtenido: ' + Cc.total);

  /* ── El criterio de cobrabilidad contra los datos REALES ─────────────────────────────────
     Invariantes, no fotos: valen con 101 cotizaciones y con 500. Son los tres errores que
     costaron plata, cada uno comprobado sobre produccion. */
  const previaEjecutada = cotizaciones.filter(function(c) { return c.tipoCot === 'previa' && c.estadoCot === 'Realizada'; });
  const previaPendiente = cotizaciones.filter(function(c) { return c.tipoCot === 'previa' && c.estadoCot !== 'Realizada'; });
  const normales       = cotizaciones.filter(function(c) { return c.tipoCot !== 'previa'; });
  const enDeudaProd = {};
  Cc.cobrables.forEach(function(c) { enDeudaProd[c.id] = true; });

  ok(previaEjecutada.length > 0,
     'hay al menos una previa ya ejecutada en produccion (si no, este bloque no prueba nada)');
  ok(previaEjecutada.every(function(c) { return enDeudaProd[c.id]; }),
     'TODO trabajo previo ya ejecutado esta en la deuda: ' + previaEjecutada.length + ' cotizacion(es), $' +
     previaEjecutada.reduce(function(s, c) { return s + (c.total || 0); }, 0).toLocaleString('es-CL'));
  ok(previaPendiente.every(function(c) { return !enDeudaProd[c.id]; }),
     'NINGUN presupuesto sin ejecutar suma a la deuda: ' + previaPendiente.length + ' cotizacion(es) fuera');
  ok(normales.every(function(c) { return enDeudaProd[c.id]; }),
     'las ' + normales.length + ' cotizaciones normales siguen cobrandose (no tienen estadoCot: ' +
     'un filtro que lo exigiera se comeria $' + normales.reduce(function(s, c) { return s + (c.total || 0); }, 0).toLocaleString('es-CL') + ')');
  /* Ninguna cotizacion se pierde AL SEPARAR POR CLIENTE. Este assert comparaba contra el total
     de la coleccion y dejo de valer el 21-08-2026, cuando la planilla dejo de mostrar todos los
     clientes juntos: la N 133 es la de Megacentro Hualpen (Entel) y NO tiene que aparecer en la
     de SMU — que es exactamente lo que Pedro pidio. Lo que sigue valiendo, y es mas fuerte, es
     que sumando TODAS las planillas vuelva la coleccion entera: separar no puede tragarse un
     documento, y "Sin clasificar" existe justo para que ninguno se quede sin planilla. */
  const clientesProd = {};
  cotizaciones.forEach(function(c) { clientesProd[c._cliente] = true; });
  let sumaProd = 0;
  Object.keys(clientesProd).forEach(function(cli) {
    sandbox._plCliente = cli;
    const D = sandbox._plDatosCorrectivos();
    sumaProd += D.cobrables.length + D.previas.length;
  });
  sandbox._plCliente = sandbox.PL_CLIENTE_SMU;
  igual(sumaProd, cotizaciones.length,
     'sumando TODAS las planillas vuelven las ' + cotizaciones.length + ' cotizaciones: separar no pierde ninguna');
  ok(Cc.cobrables.concat(Cc.previas).every(function(c) { return c._cliente === sandbox.PL_CLIENTE_SMU; }),
     'y en la planilla de SMU no se colo ninguna cotizacion de otro cliente',
     'clientes encontrados: ' + Object.keys(clientesProd).join(', '));

  /* Foto del 05-ago-2026, para que el numero se pueda mirar de un vistazo. Si esto falla y los
     invariantes de arriba pasan, es que Pedro cotizo mas — se actualiza el numero. Si falla
     junto con alguno de arriba, es una regresion del criterio. */
  const HOY = { cobrables: 96, total: 20467580, previas: 5, totalPrevias: 10634050 };
  ok(Cc.cobrables.length >= HOY.cobrables && Cc.total >= HOY.total,
     'foto 05-ago: ' + HOY.cobrables + ' cobrables por $' + HOY.total.toLocaleString('es-CL') +
     ' — hoy ' + Cc.cobrables.length + ' por $' + Cc.total.toLocaleString('es-CL'));
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
