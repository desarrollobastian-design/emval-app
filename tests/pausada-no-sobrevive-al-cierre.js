/* Prueba de regresion — un trabajo cerrado no puede seguir apareciendo como "pausado".

   Caso del 23-08-2026. Pedro, por audio: *"me aparecen esos tres trabajos pausados. Yo los
   verifique y ya estan hechas sus cotizaciones (…) los trate de eliminar y no pude (…) lo mismo
   le pasa a Lucas, a don Jose y a don Nelson"*.

   Lo que estaba pasando de verdad, comprobado contra los datos de produccion:
     · ALVI CAÑETE #862089 tenia DOS documentos: uno "En Pausa" del 19-08 y su OT cerrada y
       firmada del 21-08. El cierre de la hoja intenta borrar el registro "En Pausa", pero esa
       llamada iba SIN `_conTimeout` y estaba firmada como best-effort: con mala señal el SDK no
       resuelve ni rechaza —se cuelga— y el borrado no ocurria nunca.
     · Peor: `_reconciliarPausadasFirebase()` vuelve a BAJAR al telefono del tecnico todo lo que
       en la nube siga pausado. Asi que no era un registro colgado en el servidor: era un trabajo
       terminado que reaparecia como pendiente al dia siguiente, y al otro. Ese es el bucle que
       les llenaba la lista a Lucas, Jose y Nelson.
     · Y la fecha decia "hace 19949 día(s)" en las TRES tarjetas: habia dos funciones llamadas
       `_haceCuanto` y la segunda pisaba a la primera (JS no avisa). La que quedaba viva espera
       milisegundos, y recibia el Timestamp de Firestore, cuyo `valueOf()` devuelve
       "segundos-desde-el-año-1" — un string para ORDENAR, no una fecha.

   Los invariantes que vigila este test:
     1. NINGUNA funcion global se define dos veces en index.html. Es el guardia que habria
        cazado el bug de la fecha el dia que se escribio.
     2. `_haceCuanto` sobre un Timestamp de Firestore da los dias reales.
     3. El borrado del registro "En Pausa" va con guardia de tiempo y, si no se logra, se ENCOLA.
     4. La cola nunca borra una OT firmada ni la de otro tecnico, y no olvida lo que no aplico.
     5. La limpieza local exige numero + tecnico + LOCAL (los numeros de OT son aleatorios y ya
        colisionaron: la 9530 quedo en dos trabajos distintos).
     6. La tarjeta solo dice "ya cerrada / ya cotizada" cuando lo puede comprobar, y avisa
        cuando la cotizacion apunta a esa misma hoja.

   Uso:  node tests/pausada-no-sobrevive-al-cierre.js index.html
   Sale 0 si los seis invariantes se sostienen; 1 si alguno se rompio. */

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); }

/* LINEA DE CONTROL. Contra el codigo anterior al fix faltan funciones enteras y el guion se
   caeria a medias; un guion que muere en silencio se parece demasiado a uno que aprueba. */
let llegoAlFinal = false;

function hastaCierre(desde) {
  let j = src.indexOf('{', desde), prof = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (prof === 0) return k + 1; }
  }
  return -1;
}
function cuerpoDe(nombre) {
  let i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  const fin = hastaCierre(i);
  return fin < 0 ? null : src.slice(i, fin);
}

/* La ULTIMA definicion del archivo, que es la que efectivamente corre: si el nombre esta
   repetido, JS se queda con esa. Medir la primera es justamente lo que hacia invisible el bug
   —el codigo bueno estaba escrito, pero no era el que se ejecutaba. */
function cuerpoDeUltima(nombre) {
  let i = src.lastIndexOf('function ' + nombre + '(');
  if (i < 0) return null;
  const fin = hastaCierre(i);
  return fin < 0 ? null : src.slice(i, fin);
}

// Nada de este guion puede morir a media prueba: un test que revienta se parece demasiado a uno
// que aprueba. Cada bloque se corre aqui adentro y una excepcion es un fallo con nombre.
function tramo(titulo, fn) {
  try { fn(); } catch (e) { fallos.push('  ✗ ' + titulo + ' — el guion se cayo: ' + (e && e.message)); }
}
async function tramoAsync(titulo, fn) {
  try { await fn(); } catch (e) { fallos.push('  ✗ ' + titulo + ' — el guion se cayo: ' + (e && e.message)); }
}

/* Timestamp de Firestore TAL COMO lo entrega el SDK. El valueOf() es el del firebase-js-sdk:
   los segundos desplazados al año 1 y formateados como string, para poder ordenar. Es
   exactamente lo que hacia que la resta diera 19949 dias. */
function timestampFirestore(iso) {
  const ms = Date.parse(iso), secs = Math.floor(ms / 1000), nanos = (ms % 1000) * 1e6;
  return {
    seconds: secs, nanoseconds: nanos,
    toDate: function () { return new Date(ms); },
    valueOf: function () {
      return String(secs - (-62135596800)).padStart(12, '0') + '.' + String(nanos).padStart(9, '0');
    }
  };
}

console.log('Un trabajo cerrado no sigue apareciendo como pausado\n');

// ── 1. Ninguna funcion global definida dos veces ─────────────────────────────────────────────
{
  // Solo las de columna 0: las anidadas (como los cuatro `td` de las tablas) tienen su propio
  // ambito y no se pisan.
  const nombres = (src.match(/^(?:async )?function [A-Za-z_$][A-Za-z0-9_$]*/gm) || [])
    .map(function (s) { return s.replace(/^(?:async )?function /, ''); });
  const cuenta = {};
  nombres.forEach(function (n) { cuenta[n] = (cuenta[n] || 0) + 1; });
  const repetidas = Object.keys(cuenta).filter(function (n) { return cuenta[n] > 1; });
  chequear(repetidas.length === 0,
    'hay funcion(es) globales definidas dos veces: ' + repetidas.join(', ') +
    '. La segunda PISA a la primera en silencio — es el bug del "hace 19949 día(s)"');
  console.log('1) Funciones globales sin nombre repetido: ' + (repetidas.length === 0 ? 'ok ✓' : repetidas.join(', ') + ' ✗'));
}

// ── 2. La fecha de la tarjeta, calculada de verdad ───────────────────────────────────────────
tramo('2) fecha de la tarjeta', function () {
  // ULTIMA definicion a proposito: es la que gana en el navegador. Con el codigo anterior al
  // fix, aca entra la de la cola de correos y el test ve el "hace 19949 día(s)" de verdad.
  const bloque = (cuerpoDe('_msCreado') || '') + '\n' + (cuerpoDeUltima('_haceCuanto') || '');
  chequear(bloque.indexOf('_msCreado') >= 0 && bloque.indexOf('_haceCuanto') >= 0,
    'no se encontro _msCreado o _haceCuanto en index.html');

  const api = new Function(bloque + '\n return { haceCuanto: _haceCuanto };')();
  const hace3dias = new Date(Date.now() - 3 * 86400000).toISOString();

  const conTimestamp = api.haceCuanto(timestampFirestore(hace3dias));
  chequear(/^Hace 3 días$/.test(conTimestamp),
    'con un Timestamp de Firestore la tarjeta dice "' + conTimestamp + '" en vez de "Hace 3 días" ' +
    '(es el sintoma exacto que reporto Pedro)');
  chequear(!/199\d\d/.test(conTimestamp), 'volvio a salir el numero absurdo de dias');

  chequear(api.haceCuanto(hace3dias) === 'Hace 3 días', 'con un string ISO tampoco calcula bien');
  chequear(api.haceCuanto(Date.now()) === 'Hoy', 'con milisegundos no dice "Hoy"');
  chequear(api.haceCuanto(null) === '', 'sin fecha deberia no decir nada, no inventar una');
  console.log('2) Fecha real en la tarjeta: "' + conTimestamp + '" ' + (/^Hace 3 días$/.test(conTimestamp) ? '✓' : '✗'));
});

// ── 3. El borrado del registro "En Pausa" ya no es best-effort ───────────────────────────────
tramo('3) borrado con guardia y cola', function () {
  const cuerpo = cuerpoDe('eliminarOTPausada') || '';
  chequear(cuerpo.length > 0, 'no se encontro eliminarOTPausada');
  const desnudas = (cuerpo.match(/db\s*\.\s*collection\('ordenes'\)[\s\S]{0,120}?\.get\(\)/g) || []).length;
  chequear(desnudas === 0,
    'eliminarOTPausada volvio a consultar Firestore por su cuenta y sin guardia: con mala señal ' +
    'el .get() se cuelga y el registro pausado sobrevive al cierre');
  chequear(/_cerrarPausadaEnLaNube\(/.test(cuerpo),
    'eliminarOTPausada ya no delega en _cerrarPausadaEnLaNube: el borrado dejo de tener reintento');

  const cierre = cuerpoDe('_cerrarPausadaEnLaNube') || '';
  chequear(/_conTimeout\(/.test(cierre), '_cerrarPausadaEnLaNube perdio su guardia de tiempo');
  chequear(/_encolarCierrePausada\(/.test(cierre),
    'lo que no se puede borrar ya no se encola: vuelve a perderse el borrado');
  console.log('3) Borrado con guardia y con cola: ' + (desnudas === 0 && /_conTimeout\(/.test(cierre) ? 'ok ✓' : 'roto ✗'));
});

// ── 4, 5 y 6. Ejecutando el codigo real con stubs ────────────────────────────────────────────
(async function () {
  await tramoAsync('4) cola de cierres', async function () {
  const iKey = src.indexOf('var _KEY_CIERRES_PAUSADA');
  const iSync = src.indexOf('async function sincronizarCierresPausadaPendientes(');
  chequear(iKey >= 0 && iSync > iKey, 'no se encontro la cola de cierres de pausada en index.html');

  if (iKey >= 0 && iSync > iKey) {
    const bloque = (cuerpoDe('_mismoTecnico') || '') + '\n' + src.slice(iKey, hastaCierre(iSync));

    const almacen = {};
    const localStorageFalso = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(almacen, k) ? almacen[k] : null; },
      setItem: function (k, v) { almacen[k] = String(v); },
    };
    // Base falsa: dos documentos con el MISMO numero. Uno pausado (el fantasma) y uno firmado
    // (el trabajo de verdad). Mas uno pausado de otro tecnico, que no se puede tocar.
    let docs = [];
    const borrados = [];
    let fallarBorrado = false, fallarConsulta = false;
    const dbFalso = {
      collection: function () {
        return {
          where: function () {
            return { get: function () {
              if (fallarConsulta) return Promise.reject(new Error('unavailable'));
              return Promise.resolve({ docs: docs.map(function (d) {
                return { id: d.id, data: function () { return d; } };
              }) });
            } };
          },
          doc: function (id) {
            return { delete: function () {
              if (fallarBorrado) return Promise.reject(new Error('unavailable'));
              borrados.push(id);
              docs = docs.filter(function (d) { return d.id !== id; });
              return Promise.resolve();
            } };
          }
        };
      }
    };
    const windowFalso = { _firebaseReady: true, firebase: { firestore: function () { return dbFalso; } } };
    const navegador = { onLine: true };

    const api = new Function(
      'localStorage', 'window', 'navigator', 'console', '_conTimeout',
      bloque + '\n return { encolar: _encolarCierrePausada, leer: _leerCierresPausadaPendientes,' +
      ' cerrar: _cerrarPausadaEnLaNube, sincronizar: sincronizarCierresPausadaPendientes };'
    )(localStorageFalso, windowFalso, navegador, { log: function () {}, warn: function () {} },
      function (p) { return p; });

    function sembrar() {
      docs = [
        { id: 'fantasma', numero: 862089, tecnico: 'Nelson Herrera', local: 'ALVI CANETE', pausa: true, estado: 'En Pausa', firmada: false },
        { id: 'cerrada',  numero: 862089, tecnico: 'Nelson Herrera', local: 'ALVI CANETE', pausa: false, estado: 'Terminada', firmada: true },
        { id: 'de-otro',  numero: 862089, tecnico: 'Lucas Fernández', local: 'OTRO LOCAL', pausa: true, estado: 'En Pausa', firmada: false },
      ];
      borrados.length = 0;
    }

    // a) Con señal: borra el fantasma y NADA mas.
    sembrar();
    await api.cerrar(862089, 'Nelson Herrera');
    chequear(borrados.length === 1 && borrados[0] === 'fantasma',
      'el borrado toco ' + JSON.stringify(borrados) + ' — tenia que borrar solo el registro pausado');
    chequear(docs.some(function (d) { return d.id === 'cerrada'; }),
      'BORRO LA OT FIRMADA. Es el trabajo cerrado, no un borrador');
    chequear(docs.some(function (d) { return d.id === 'de-otro'; }),
      'borro la pausada de OTRO tecnico, que comparte numero por la colision de numeros aleatorios');
    chequear(api.leer().length === 0, 'encolo un borrado que si logro hacer');

    // b) Sin señal: no se pierde, se encola.
    sembrar();
    navegador.onLine = false;
    await api.cerrar(862089, 'Nelson Herrera');
    chequear(borrados.length === 0, 'intento borrar estando sin señal');
    chequear(api.leer().length === 1, 'sin señal el borrado se perdio en vez de encolarse');

    // c) Vuelve la señal: la cola lo aplica y se vacia.
    navegador.onLine = true;
    await api.sincronizar();
    chequear(borrados.length === 1 && borrados[0] === 'fantasma', 'la cola no aplico el borrado al volver la señal');
    chequear(api.leer().length === 0, 'la cola no se vacio despues de aplicar el borrado');

    // d) INVARIANTE: lo que no se logra borrar sigue pendiente.
    sembrar();
    fallarBorrado = true;
    await api.cerrar(862089, 'Nelson Herrera');
    chequear(api.leer().length === 1, 'un borrado que fallo se olvido: el fantasma se queda para siempre');
    await api.sincronizar();
    chequear(api.leer().length === 1, 'el reintento fallido borro el pendiente de la cola');
    fallarBorrado = false;
    await api.sincronizar();
    chequear(api.leer().length === 0, 'al funcionar, el pendiente no se saco de la cola');

    // e) La consulta que se cuelga tambien encola (era el cuelgue sin guardia).
    sembrar();
    fallarConsulta = true;
    await api.cerrar(999999, 'Nelson Herrera');
    chequear(api.leer().length === 1, 'si la consulta falla, el borrado no queda pendiente');
    fallarConsulta = false;
    almacen[Object.keys(almacen)[0]] = '[]';

    // f) No se encola dos veces la misma OT.
    api.encolar(862089, 'Nelson Herrera');
    api.encolar(862089, 'Nelson Herrera');
    chequear(api.leer().length === 1, 'la cola guarda dos veces el mismo borrado');

    console.log('4) La cola borra el fantasma, respeta la OT firmada y la de otro tecnico, y no olvida ✓');
  }
  });

  // ── 5. La limpieza local no se come trabajo ajeno ──────────────────────────────────────────
  tramo('5) limpieza local', function () {
    const bloque = (cuerpoDe('_mismoTecnico') || '') + '\n'
      + (cuerpoDe('_numerosCerradosLocalmente') || '') + '\n'
      + (cuerpoDe('_limpiarPausadasYaCerradas') || '');
    chequear(bloque.indexOf('_limpiarPausadasYaCerradas') >= 0, 'no se encontro _limpiarPausadasYaCerradas');

    let guardadas = null;
    const encoladas = [];
    let pausadas = [
      { numero: 862089, tecnico: 'Nelson Herrera', local: 'ALVI CANETE' },          // ya cerrada → fuera
      { numero: 111111, tecnico: 'Nelson Herrera', local: 'OTRO LOCAL' },           // mismo numero, otro local → SE QUEDA
      { numero: 222222, tecnico: 'Nelson Herrera', local: 'UNIMARC QUILLON' },      // sin cerrar → se queda
      { numero: 333333, tecnico: 'Nelson Herrera', local: 'UNIMARC CHILLAN 1', autoDraft: true },
    ];
    const completadas = [
      { numero: 862089, tecnico: 'Nelson Herrera', local: 'ALVI CANETE', firmada: true },
      { numero: 111111, tecnico: 'Nelson Herrera', local: 'UNIMARC HIGUERAS', firmada: true },
      { numero: 222222, tecnico: 'Nelson Herrera', local: 'UNIMARC QUILLON', firmada: false }, // sin firmar: no prueba nada
    ];
    const api = new Function(
      'localStorage', 'cargarOTsPausadas', 'guardarOTsPausadas', '_encolarCierrePausada', 'console',
      bloque + '\n return { limpiar: _limpiarPausadasYaCerradas };'
    )(
      { getItem: function () { return JSON.stringify(completadas); } },
      function () { return pausadas.slice(); },
      function (l) { guardadas = l; },
      function (n, t) { encoladas.push(n); },
      { error: function () {} }
    );

    api.limpiar();
    chequear(!!guardadas, 'la limpieza no guardo nada: el fantasma local sigue ahi');
    if (guardadas) {
      const quedan = guardadas.map(function (o) { return o.numero; });
      chequear(quedan.indexOf(862089) < 0, 'no quito la pausada cuyo trabajo este telefono ya cerro y firmo');
      chequear(quedan.indexOf(111111) >= 0,
        'SE COMIO trabajo real: quito una pausada porque el numero coincidia, con el local distinto');
      chequear(quedan.indexOf(222222) >= 0, 'quito una pausada cuya "completada" no estaba firmada');
      chequear(quedan.indexOf(333333) >= 0, 'toco un autoDraft, que no le corresponde');
      chequear(encoladas.length === 1 && encoladas[0] === 862089,
        'no encolo el borrado en la nube de lo que limpio del telefono: reaparece al reconciliar');
    }
    console.log('5) Limpieza local por numero + tecnico + local: ' + (guardadas && guardadas.length === 3 ? 'ok ✓' : 'roto ✗'));
  });

  // ── 6. La tarjeta solo afirma lo que puede comprobar ───────────────────────────────────────
  tramo('6) la tarjeta solo afirma lo comprobable', function () {
    const bloque = cuerpoDe('_estadoRealPausada') || '';
    chequear(bloque.length > 0, 'no se encontro _estadoRealPausada');
    const win = {};
    const api = new Function('window', bloque + '\n return { estado: _estadoRealPausada };')(win);

    const pausada = { numero: 862089, local: 'ALVI CANETE', tecnico: 'Nelson Herrera' };

    // Sin fichas cargadas no se afirma nada.
    chequear(api.estado('fantasma', pausada) === null,
      'sin las fichas del panel afirma algo igual: diria "ya cerrada" sin haberlo comprobado');

    win._supFichas = {
      ots: [
        { id: 'cerrada', numero: 862089, local: 'ALVI CANETE', firmada: true, pausa: false, fecha: '21-08-2026' },
        { id: 'otra', numero: 853260, local: 'OTRO LOCAL', firmada: true, pausa: false },
      ],
      cots: [
        { id: 'c1', numeroCotizacion: '01082608', otId: 'pausada-sc2', otNumero: 853260, local: 'UNIMARC SAN CARLOS 2', enviado: true },
      ]
    };

    const r1 = api.estado('fantasma', pausada);
    chequear(r1 && r1.tipo === 'cerrada', 'no reconoce la hoja cuyo trabajo ya esta cerrado y firmado');

    // El mismo numero en OTRO local no es la misma OT.
    const r2 = api.estado('fantasma', { numero: 853260, local: 'UNIMARC SAN CARLOS 2' });
    chequear(!r2 || r2.tipo !== 'cerrada',
      'dio por cerrada una hoja porque el numero coincidia con una OT de otro local');
    chequear(r2 && r2.tipo === 'cotizada', 'no reconoce que ese trabajo ya tiene cotizacion');

    // La cotizacion apunta a ESTA hoja: borrarla no es gratis y hay que decirlo.
    const r3 = api.estado('pausada-sc2', { numero: 853260, local: 'UNIMARC SAN CARLOS 2' });
    chequear(r3 && r3.tipo === 'cotizada' && r3.enlazada === true,
      'no avisa que la cotizacion apunta a esta misma hoja (es lo que Pedro temia perder)');

    // Una hoja sin nada que la respalde no se marca.
    chequear(api.estado('x', { numero: 777777, local: 'UNIMARC NUEVO' }) === null,
      'marco como hecha una hoja que no tiene ni OT cerrada ni cotizacion');

    // Y el cuadro de borrado tiene que nombrar la cotizacion.
    const dialogo = cuerpoDe('eliminarPausadaSup') || '';
    chequear(/numeroCotizacion/.test(dialogo),
      'el cuadro de "Eliminar OT pausada" no dice que pasa con la cotizacion: es exactamente la ' +
      'duda que dejo a Pedro sin borrar nada');
    chequear(/_conTimeout\(/.test(dialogo),
      'el borrado del panel volvio a quedar sin guardia: con mala señal el boton no hace nada visible');
    console.log('6) La tarjeta afirma solo lo comprobable y avisa del vinculo con la cotizacion ✓');
  });

  llegoAlFinal = true;
  cerrar();
})();

function cerrar() {
  if (!llegoAlFinal) fallos.push('  ✗ el guion no llego al final: no probo lo que dice probar');
  if (fallos.length) {
    console.log('\nFALLA — ' + fallos.length + ' invariante(s) roto(s):');
    fallos.forEach(function (f) { console.log(f); });
    process.exit(1);
  }
  console.log('\nOK — el trabajo cerrado no vuelve como pausado, y lo que no se puede borrar no se olvida.');
}

// Si algo revienta fuera de los tramos, el proceso no puede salir en 0.
process.on('uncaughtException', function (e) {
  console.log('\nFALLA — excepcion no controlada: ' + (e && e.message));
  process.exit(1);
});
