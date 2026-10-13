/* Prueba de regresion — el folio de una cotizacion nueva va sin cero adelante, y no se repite.

   Caso real, 09-10-2026. Pedro buscaba en Gmail una cotizacion de agosto por su numero, sin el 0,
   y no aparecia: Gmail busca palabras completas y el correo decia "02082608". Desde el 13-07-2026
   el dia del folio llevaba cero a la izquierda. Bastian decidio sacarlo para las cotizaciones
   NUEVAS (dentro de la mantencion): del 1 al 9 el folio tiene 7 digitos ("2082608"), del 10 al
   31 tiene 8. Los ya emitidos quedan como estan: no se renumera nada hacia atras.

   Lo que se vigila:
   1. El folio nuevo no empieza con 0, y del 10 al 31 sigue igual que antes.
   2. El contador sigue siendo `cot_<ddmmaa>` CON cero: si cambiara la clave, el dia del
      despliegue el correlativo partiria de nuevo en 01. Un telefono con la version anterior y
      uno con la nueva comparten contador, asi que tampoco se pisan durante la transicion.
   3. Sin contador el folio sigue saliendo PROVISORIO (vacio), nunca inventado.
   4. Ningun folio se repite: se generan con la funcion real todos los de 09-10-2026 a 2030, con
      99 por dia. Y ninguno coincide con los 2 folios de 7 digitos que ya existen en produccion
      (1072601 y 6072601, de julio, anteriores al cero). Los de 8 digitos no pueden chocar: los
      que llevan 0 nunca los genera el formato nuevo, y los demas son de fechas ya pasadas.
      (El 09-10-2026 se cruzo ademas contra las 233 cotizaciones de produccion: 0 coincidencias.)
   5. La baja de activo NO cambia: el pedido fue solo para cotizaciones.

   Trae linea de control: un guion que muere a medias se parece demasiado a uno que aprueba.

   Uso:  node tests/numero-cotizacion-sin-cero.js index.html
   Sale 0 si todo se cumple; 1 si no. Contra el codigo anterior (folio con 0) tiene que fallar. */

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8').replace(/\r\n/g, '\n');

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); return ok; }
function extraer(desde) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('No se encontro: ' + desde);
  const j = src.indexOf('\n}\n', i);
  if (j < 0) throw new Error('No se encontro el fin de: ' + desde);
  return src.slice(i, j + 2);
}

// Las funciones reales, con un reloj fijo y un Firestore de mentira que guarda los contadores.
function armar() {
  const reloj = { ahora: new Date(2026, 9, 9, 10, 0, 0) };
  class RelojFijo extends Date {
    constructor(...a) { if (a.length) super(...a); else super(reloj.ahora.getTime()); }
  }
  const contadores = {};
  const db = {
    falla: false,
    collection(col) { return { doc(id) { return { col: col, id: id }; } }; },
    runTransaction(fn) {
      if (db.falla) return Promise.reject(new Error('unavailable'));
      const tx = {
        get(ref) {
          const k = ref.col + '/' + ref.id;
          return Promise.resolve({ exists: k in contadores, data: () => contadores[k] });
        },
        set(ref, datos) { contadores[ref.col + '/' + ref.id] = Object.assign({}, contadores[ref.col + '/' + ref.id], datos); }
      };
      return fn(tx);
    }
  };
  const codigo = [
    extraer('function _fechaCodigoHoy('),
    extraer('async function _asignarNumeroCotizacion('),
    extraer('async function _asignarFolioBaja(')
  ].join('\n');
  const api = new Function('Date', '_conTimeout', 'console',
    codigo + '\nreturn { cot: _asignarNumeroCotizacion, baja: _asignarFolioBaja };')(
    RelojFijo, function(p) { return p; }, { error: function() {} });
  return { reloj, contadores, db, cot: () => api.cot(db), baja: () => api.baja(db) };
}

let llegoAlFinal = false;

(async function() {
  console.log('El folio de una cotizacion nueva va sin cero adelante, y no se repite\n');

  // ── 1. Sin cero del 1 al 9, igual que antes del 10 al 31 ─────────────────────────────────
  {
    const casos = [
      [new Date(2026, 7, 2), 8, '2082608'],    // el caso de Pedro: 2-ago, la 8va
      [new Date(2026, 9, 9), 1, '9102601'],    // hoy, la primera
      [new Date(2026, 7, 15), 3, '15082603'],  // del 10 en adelante no cambia
      [new Date(2026, 11, 31), 12, '31122612'],
      [new Date(2027, 0, 1), 1, '1012701']     // el mes conserva su cero
    ];
    let todos = true;
    for (const [fecha, cuantas, esperado] of casos) {
      const A = armar();
      A.reloj.ahora = fecha;
      let r;
      for (let k = 0; k < cuantas; k++) r = await A.cot();
      todos = chequear(r.numeroCotizacion === esperado,
        fecha.toLocaleDateString('es-CL') + ', la ' + cuantas + ': salio ' + JSON.stringify(r.numeroCotizacion) +
        ', se esperaba ' + esperado) && todos;
    }
    console.log('1) 2-ago la 8va -> 2082608; del 10 al 31 sigue igual: ' + (todos ? 'OK' : 'FALLA'));
  }

  // ── 2. El contador sigue con cero y se comparte con la version anterior ─────────────────
  {
    const A = armar();
    A.reloj.ahora = new Date(2026, 9, 9);
    A.contadores['contadores/cot_091026'] = { n: 5, fechaCodigo: '091026' };   // 5 hechas con la version anterior
    const r = await A.cot();
    const ok = chequear(r.numeroCotizacion === '9102606',
        'con 5 ya emitidas hoy por la version anterior, la siguiente debia ser 9102606 y salio ' + JSON.stringify(r.numeroCotizacion)) &
      chequear(A.contadores['contadores/cot_091026'].n === 6 && !('contadores/cot_91026' in A.contadores),
        'el contador cambio de clave: el dia del despliegue el correlativo partiria de nuevo en 01') &
      chequear(r.fechaCodigo === '091026', 'el fechaCodigo guardado perdio su cero: ' + JSON.stringify(r.fechaCodigo));
    console.log('2) Contador cot_<ddmmaa> con cero, compartido con la version anterior: ' + (ok ? 'OK' : 'FALLA'));
  }

  // ── 3. Sin contador, el folio sigue saliendo provisorio ──────────────────────────────────
  {
    const A = armar();
    A.db.falla = true;
    const r = await A.cot();
    const ok = chequear(r.numeroCotizacion === '' && r.numeroProvisorio === true,
      'sin contador se invento un folio: ' + JSON.stringify(r));
    console.log('3) Sin contador el folio queda provisorio y vacio: ' + (ok ? 'OK' : 'FALLA'));
  }

  // ── 4. Ningun folio se repite, ni con los de 7 digitos que ya existen ────────────────────
  {
    const YA_EXISTEN = ['1072601', '6072601'];   // produccion, 01-07 y 06-07-2026
    const A = armar();
    const vistos = new Map();
    let generados = 0, conCero = 0, repetidos = 0, chocan = [];
    for (let d = new Date(2026, 9, 9); d <= new Date(2030, 11, 31); d.setDate(d.getDate() + 1)) {
      A.reloj.ahora = new Date(d);
      for (let c = 1; c <= 99; c++) {
        const n = (await A.cot()).numeroCotizacion;
        generados++;
        if (n[0] === '0') conCero++;
        if (vistos.has(n)) repetidos++; else vistos.set(n, d.toISOString().slice(0, 10) + ' #' + c);
        if (YA_EXISTEN.includes(n)) chocan.push(n);
      }
    }
    const ok = chequear(generados > 140000, 'se generaron solo ' + generados + ' folios: el barrido no corrio completo') &
      chequear(conCero === 0, conCero + ' folios nuevos empiezan con 0') &
      chequear(repetidos === 0, repetidos + ' folios repetidos entre fechas distintas') &
      chequear(chocan.length === 0, 'coinciden con folios de produccion: ' + chocan.join(', '));
    console.log('4) ' + generados + ' folios de 09-10-2026 a 2030 (99 por dia): ' + repetidos + ' repetidos, ' +
      chocan.length + ' choques con produccion: ' + (ok ? 'OK' : 'FALLA'));
  }

  // ── 5. La baja de activo no cambia ───────────────────────────────────────────────────────
  {
    const A = armar();
    A.reloj.ahora = new Date(2026, 9, 9);
    const r = await A.baja();
    const ok = chequear(r.folio === '09102601', 'el folio de la baja cambio de formato: ' + JSON.stringify(r.folio));
    console.log('5) La baja de activo conserva su formato (09102601): ' + (ok ? 'OK' : 'FALLA'));
  }

  llegoAlFinal = true;
})().catch(function(e) {
  fallos.push('  ✗ el guion murio: ' + e.message);
}).then(function() {
  chequear(llegoAlFinal, 'linea de control: el guion no llego al final');
  console.log('');
  if (fallos.length) { console.log('❌ FALLA'); fallos.forEach(f => console.log(f)); }
  else console.log('✅ OK — el folio nuevo va sin cero, el contador no cambia y ningun folio se repite');
  console.log('');
  process.exit(fallos.length ? 1 : 0);
});
