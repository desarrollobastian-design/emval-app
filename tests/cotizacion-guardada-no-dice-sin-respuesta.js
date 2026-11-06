/* Prueba de regresion — una cotizacion ya guardada no dice "Sin respuesta del servidor".

   Caso real, 06-11-2026, 12:09. Pedro (Administrador) lleno una cotizacion y al guardar leyo
   "Sin respuesta del servidor. Revisa la lista antes de volver a guardar: la cotizacion puede
   haberse creado igual.", con el formulario todavia abierto. Le escribio a Bastian "No puedo hacer
   cotizaciones".

   Por que pasaba: cuando la cotizacion se abre desde el detalle de un tecnico (Correctivos ->
   tecnico -> OT -> Cotizar), `guardarCotizacion`, DESPUES de guardarla, volvia a bajar la coleccion
   `ordenes` ENTERA (7 MB el 02-10-2026, con las fotos dentro de cada OT) con tope de 25 s, para
   repintar la lista de ese tecnico. Con datos moviles el tope se pasa, el error cae en el mismo
   catch que el del guardado y el mensaje dice que quizas no se guardo. El formulario queda abierto:
   un segundo "Guardar" crea OTRA cotizacion con otro folio (y en una edicion, una copia nueva).

   Lo que se vigila:
   1. Desde el detalle del tecnico, con `ordenes` colgada: la cotizacion se guarda UNA vez, el
      mensaje es "Cotizacion guardada" (nunca "Sin respuesta"), se vuelve al detalle con las OT que
      ya tenia, y `guardarCotizacion` no baja `ordenes`.
   2. Si algo falla DESPUES de guardar, el mensaje dice que se guardo y se sale del formulario.
   3. Si falla el guardado mismo, los mensajes de siempre: timeout -> "Sin respuesta del servidor",
      otro error -> "No se pudo guardar". No se miente en ninguno de los dos sentidos.
   4. Sin el grupo del detalle en memoria, se vuelve a la lista de tecnicos (que carga sin tope).
   5. `verOTsTecnico` deja el grupo en `window._grupoTecnicoActivo`.

   Trae linea de control: un guion que muere a medias se parece demasiado a uno que aprueba.

   Uso:  node tests/cotizacion-guardada-no-dice-sin-respuesta.js index.html
   Sale 0 si todo se cumple; 1 si no. Contra 7680ada (main del 06-11-2026) tiene que fallar. */

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8').replace(/\r\n/g, '\n');
const fallos = [];
const check = (ok, msg) => { if (!ok) fallos.push('  X ' + msg); return ok; };

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

const FN = ['function _fechaCodigoHoy(', 'function _localSinCadena(',
  'async function _asignarNumeroCotizacion(', 'async function guardarCotizacion('];
const fuentes = FN.map(cuerpo);
const faltan = FN.filter((n, i) => !fuentes[i]);
if (faltan.length) {
  console.log('No se encontro: ' + faltan.join(' . '));
  process.exit(1);
}

const CUELGA = new Promise(function () {});   // una lectura que nunca vuelve (la red movil)

/* Firestore espia. `ordenes.get()` devuelve una promesa que no resuelve nunca; `_conTimeout` la
   convierte en el error de timeout, igual que el real a los 25 s. `falla` controla el add/update. */
function armar(opts) {
  opts = opts || {};
  const reg = { esc: [], lecturas: [], toasts: [], go: [], ver: [], cargarTec: 0 };
  const db = {
    collection: function (col) {
      return {
        doc: function (id) {
          return {
            update: async function (obj) {
              if (col === 'cotizaciones' && opts.falla) throw opts.falla;
              reg.esc.push({ op: 'update', col: col, id: id, obj: obj });
            },
            set: async function () {}
          };
        },
        add: async function (obj) {
          if (col === 'cotizaciones' && opts.falla) throw opts.falla;
          reg.esc.push({ op: 'add', col: col, obj: obj });
          return { id: 'COT_NUEVA' };
        },
        get: function () { reg.lecturas.push(col); return col === 'ordenes' ? CUELGA : Promise.resolve({ docs: [] }); },
        where: function () { return { get: function () { reg.lecturas.push(col + '.where'); return CUELGA; } }; }
      };
    },
    runTransaction: async function (fn) {
      return fn({
        get: async function () { return { exists: true, data: () => ({ n: 1 }) }; },
        set: function () {}
      });
    }
  };
  const GRUPO = { nombre: 'Jose Quiroz', ots: [{ id: 'OT_1', numero: '500100', tecnico: 'Jose Quiroz' }] };
  const win = {
    _editandoCotizacionId: null,
    _cotizacionOrigen: opts.origen || 's-ots-tecnico-detalle',
    _cotizacionTecnicoActivo: 'Jose Quiroz',
    _grupoTecnicoActivo: opts.sinGrupo ? undefined : { nombre: 'Jose Quiroz', grupo: GRUPO },
    _modoCotPrevia: false,
    firebase: {
      firestore: Object.assign(function () { return db; }, {
        FieldValue: { serverTimestamp: function () { return '<serverTimestamp>'; } }
      })
    }
  };
  const DOM = {};
  const doc = { getElementById: function (id) { return DOM[id] || (DOM[id] = { id: id, value: '', textContent: '' }); } };
  const hooks = {
    toast: function (m) { reg.toasts.push(String(m)); },
    go: function (s) { reg.go.push(s); },
    ver: async function (n, g) { reg.ver.push({ n: n, g: g }); if (opts.verFalla) throw new Error('repintar fallo'); },
    cargarTec: function () { reg.cargarTec++; }
  };
  const preludio = [
    'var cotizacionActual = null, itemsCot = [];',
    'function calcTotalCot(){ return { subtotal: 996800, desc: 0, descMonto: 0, total: 996800 }; }',
    'function _bloquear(){ return function(){}; }',
    'function _conTimeout(p, ms, et){ return p === CUELGA ? Promise.reject(Object.assign(new Error("Timeout: " + et), { _timeout: true })) : p; }',
    'function _esTimeout(e){ return !!(e && e._timeout); }',
    'function toast(m){ hooks.toast(m); } function go(s){ hooks.go(s); }',
    'function cargarCarpetas(){} function cargarPreventivos(){} function cargarOTsSupervisor(){}',
    'function cargarOTsTecnicos(){ hooks.cargarTec(); }',
    'function _camposPDFCot(u){ return { pdfUrl: u }; }',
    'function verOTsTecnico(n, g){ return hooks.ver(n, g); }',
    'function _fechaOTms(){ return 0; }',
    'function generarPDFCotizacionGuardada(){ return Promise.resolve(null); }'
  ].join('\n');
  const api = new Function('window', 'document', 'console', 'CUELGA', 'hooks',
    preludio + '\n' + fuentes.join('\n') +
    '\nreturn { guardar: guardarCotizacion, setActual: function(v){ cotizacionActual = v; },' +
    ' setItems: function(v){ itemsCot = v; } };')(win, doc, { log() {}, warn() {}, error() {} }, CUELGA, hooks);
  // Datos de mentira (ningun dato del cliente): una OT correctiva de un tecnico ficticio.
  api.setActual({ id: 'OT_1', numero: '500100', local: 'LOCAL DE PRUEBA', tecnico: 'Jose Quiroz',
    fecha: '06-11-2026', descripcionTrabajo: 'Trabajo de prueba', centroSucursal: '', esPrevia: false });
  api.setItems([{ desc: 'Item de prueba', qty: 1, precio: 75000 }]);
  return { api: api, reg: reg, GRUPO: GRUPO };
}

// Ninguna espera puede quedar colgada: si el codigo espera la lectura que no vuelve, se nota aca.
function conPlazo(p) {
  return Promise.race([p.then(() => 'termino'), new Promise(r => setTimeout(() => r('colgado'), 2000))]);
}

let llegoAlFinal = false;

(async function () {
  console.log('Una cotizacion ya guardada no dice "Sin respuesta del servidor"\n');

  // ── 1. El caso de Pedro: desde el detalle del tecnico, con `ordenes` colgada ─────────────
  {
    const A = armar();
    const fin = await conPlazo(A.api.guardar());
    const adds = A.reg.esc.filter(e => e.op === 'add' && e.col === 'cotizaciones');
    const ok = check(fin === 'termino', '1) guardarCotizacion quedo colgado esperando la red') &
      check(adds.length === 1, '1) se esperaba 1 add en cotizaciones y hubo ' + adds.length) &
      check(!A.reg.toasts.some(t => /Sin respuesta/.test(t)),
        '1) con la cotizacion YA guardada, el mensaje dice "Sin respuesta del servidor": ' + JSON.stringify(A.reg.toasts)) &
      check(A.reg.toasts.some(t => /^Cotización guardada/.test(t)),
        '1) no aparece "Cotización guardada": ' + JSON.stringify(A.reg.toasts)) &
      check(A.reg.lecturas.indexOf('ordenes') < 0 && A.reg.lecturas.indexOf('ordenes.where') < 0,
        '1) guardarCotizacion vuelve a bajar `ordenes` despues de guardar: ' + JSON.stringify(A.reg.lecturas)) &
      check(A.reg.ver.length === 1 && A.reg.ver[0].g === A.GRUPO,
        '1) no volvio al detalle del tecnico con las OT que ya tenia (' + A.reg.ver.length + ' llamadas a verOTsTecnico)');
    console.log('1) Desde el detalle del tecnico, sin red para `ordenes`: guardada, sin "Sin respuesta": ' + (ok ? 'OK' : 'FALLA'));
  }

  // ── 2. Algo falla DESPUES de guardar: se dice que se guardo y se sale del formulario ────
  {
    const A = armar({ verFalla: true });
    await conPlazo(A.api.guardar());
    const ultimo = A.reg.toasts[A.reg.toasts.length - 1] || '';
    const ok = check(/^Cotización guardada/.test(ultimo) && !/Sin respuesta|No se pudo guardar/.test(ultimo),
        '2) fallo el repintado y el ultimo mensaje es ' + JSON.stringify(ultimo) + ': invita a guardar otra vez') &
      check(A.reg.go.length > 0 && A.reg.go[A.reg.go.length - 1] !== 's-cotizacion',
        '2) el formulario queda abierto: un segundo Guardar crea otra cotizacion');
    console.log('2) Si falla algo despues de guardar, dice que se guardo y sale del formulario: ' + (ok ? 'OK' : 'FALLA'));
  }

  // ── 3. Si falla el guardado mismo, los mensajes de siempre ───────────────────────────────
  {
    const T = armar({ falla: Object.assign(new Error('Timeout: add cotizacion'), { _timeout: true }) });
    await conPlazo(T.api.guardar());
    const P = armar({ falla: new Error('permission-denied') });
    await conPlazo(P.api.guardar());
    const ok = check(T.reg.toasts.length === 1 && /^Sin respuesta del servidor/.test(T.reg.toasts[0]),
        '3) si el add se cuelga, el mensaje debe seguir siendo "Sin respuesta del servidor…": ' + JSON.stringify(T.reg.toasts)) &
      check(P.reg.toasts.length === 1 && /^No se pudo guardar la cotización/.test(P.reg.toasts[0]),
        '3) si el add se rechaza, el mensaje debe ser "No se pudo guardar…": ' + JSON.stringify(P.reg.toasts)) &
      check(T.reg.go.length === 0 && P.reg.go.length === 0,
        '3) sin guardar, el formulario debe quedar abierto para reintentar');
    console.log('3) Si el guardado mismo falla, "Sin respuesta" o "No se pudo guardar", como antes: ' + (ok ? 'OK' : 'FALLA'));
  }

  // ── 4. Sin el grupo en memoria, vuelve a la lista de tecnicos ───────────────────────────
  {
    const A = armar({ sinGrupo: true });
    const fin = await conPlazo(A.api.guardar());
    const ok = check(fin === 'termino' && !A.reg.toasts.some(t => /Sin respuesta/.test(t)),
        '4) sin grupo en memoria vuelve a colgarse o a decir "Sin respuesta": ' + JSON.stringify(A.reg.toasts)) &
      check(A.reg.go.indexOf('s-ots-tecnicos') >= 0 && A.reg.cargarTec === 1,
        '4) sin grupo en memoria no vuelve a la lista de tecnicos (go: ' + JSON.stringify(A.reg.go) + ')');
    console.log('4) Sin el grupo del detalle, vuelve a la lista de tecnicos: ' + (ok ? 'OK' : 'FALLA'));
  }

  // ── 5. verOTsTecnico deja el grupo para la vuelta ────────────────────────────────────────
  {
    const v = cuerpo('async function verOTsTecnico(');
    const ok = check(/window\._grupoTecnicoActivo\s*=\s*\{\s*nombre:\s*nombre,\s*grupo:\s*grupo\s*\}/.test(v),
      '5) verOTsTecnico no guarda { nombre, grupo } en window._grupoTecnicoActivo');
    console.log('5) verOTsTecnico deja el grupo en window._grupoTecnicoActivo: ' + (ok ? 'OK' : 'FALLA'));
  }

  llegoAlFinal = true;
})().catch(function (e) {
  fallos.push('  X el guion se cayo: ' + (e && e.stack || e));
}).then(function () {
  if (!llegoAlFinal) fallos.push('  X control: el guion no llego al final');
  console.log('');
  if (fallos.length) { console.log('FALLA (' + fallos.length + '):\n' + fallos.join('\n')); process.exit(1); }
  console.log('Todo OK: 5 de 5 (linea de control: el guion llego al final)');
  process.exit(0);
});
