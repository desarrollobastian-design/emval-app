/* Prueba de regresion — cerrar una OT no deja una "Autoguardada" fantasma.

   Caso del 30-09-2026. Pedro: en su panel aparecieron 103 "trabajos pausados" que antes no veia.
   Leido de produccion ese dia (solo lectura, sin tocar nada): 81 venian del telefono de Jose, que
   reporto por primera vez la noche anterior. De las 109 "Autoguardada" que reportaban los
   telefonos, 77 estaban VACIAS (sin texto) y calzaban con una OT que el mismo tecnico cerro ese
   dia en ese local, con OTRO numero; 58 nacieron a menos de 2 minutos de ese cierre.

   Lo que pasaba, comprobado en el codigo publicado (v65):
     · nuevaOT() —el boton "Hacer otra OT"— limpia la hoja pero NO estado.local: la hoja nueva
       nace con el local del trabajo recien cerrado.
     · _hayDatosOTEnCurso() contaba el local (y el tipo, y el N° de equipos que queda en el
       formulario) como "dato": al bloquear el telefono, cambiar de app o cerrar sesion, el
       autoguardado guardaba esa hoja vacia como "Autoguardada".
     · La limpieza de borradores solo la reconocia por el numero, y el del fantasma es otro: no se
       iba nunca. El tecnico no puede borrar autoguardadas; solo el administrador.
     · Desde el v62 (PR #55) cada telefono reporta lo que guarda y el panel las mostro todas.

   Los invariantes que vigila este test:
     1. Cerrar una OT y tocar "Hacer otra OT" no guarda ninguna hoja al salir de la app, ni despues
        de un correctivo ni despues de un preventivo.
     2. El autoguardado sigue protegiendo el trabajo de verdad —texto, fotos, timbre, firma, pauta—
        y cualquier hoja ligada a una cotizacion. Solo deja de guardar la hoja SIN contenido.
     3. La limpieza del telefono quita la autoguardada vacia que calza con una OT cerrada y FIRMADA
        en ese telefono —mismo tecnico, mismo local, mismo dia— y nada mas: ni la que tiene algo
        propio, ni otro local/dia/tecnico, ni una En Pausa, ni una ligada a cotizacion, ni la hoja
        abierta, ni una sin fecha.
     4. El panel no muestra lo que ya se cerro: la misma OT (numero + local) cerrada y firmada, o una
        autoguardada vacia del mismo tecnico, local y dia. Lo que tiene texto o fotos sigue saliendo.
        Sin las fichas cargadas no esconde nada.
     5. El reporte del telefono dice si cada hoja tiene contenido, sin mandar fotos ni firmas.

   Uso:  node tests/cerrar-no-deja-autoguardada-fantasma.js index.html
   Sale 0 si todo se sostiene; 1 si algo se rompio.
   CONTRAPRUEBA: contra `git show origin/main:index.html` (antes del arreglo) tiene que fallar. */

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); return !!ok; }
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
  let i = src.indexOf('\nfunction ' + nombre + '(');
  if (i < 0) i = src.indexOf('\nasync function ' + nombre + '(');
  if (i < 0) return null;
  const fin = hastaCierre(i + 1);
  return fin < 0 ? null : src.slice(i + 1, fin);
}
function hecho(f0, texto) { console.log(texto + (fallos.length === f0 ? ' ✓' : ' ✗')); }
function tramo(titulo, fn) {
  try { fn(); } catch (e) { fallos.push('  ✗ ' + titulo + ' — el guion se cayo: ' + (e && e.message)); }
}
async function tramoAsync(titulo, fn) {
  try { await fn(); } catch (e) { fallos.push('  ✗ ' + titulo + ' — el guion se cayo: ' + (e && e.message)); }
}

const NUEVAS = ['_hojaTieneContenido', '_indiceTrabajosCerrados', '_borradorVacioDeTrabajoCerrado'];
const REALES = ['sincronizarCamposOTEnEstado', '_conteoFotos', '_hayDatosOTEnCurso', '_capturarFirmaBorrador',
  '_crearOTPausadaDesdeEstado', 'guardarBorradorOTActual', 'nuevaOT', 'cargarOTsPausadas', 'guardarOTsPausadas',
  '_generarNumeroOTUnico', '_normTipo', '_tipoActual', '_normTexto', '_localCanonico', '_claveOT', '_creadoEnMs',
  '_fechaOTms', '_mismoTecnico', '_limpiarBorradoresCompletados', '_versionPausadaMs', '_descarteCubrePausada',
  '_msCreado', '_pausadasSoloTelefono', '_reportarPausadasDelTelefono'];

console.log('Cerrar una OT no deja una Autoguardada fantasma, y el panel no muestra lo que ya se cerro\n');

const faltan = NUEVAS.concat(REALES).filter(function (n) { return !cuerpoDe(n); });
chequear(faltan.length === 0,
  'no existen en index.html: ' + faltan.join(', ') + '. Sin ellas el autoguardado no distingue una hoja ' +
  'vacia de una con trabajo, y ni el telefono ni el panel reconocen la autoguardada de un trabajo ya ' +
  'cerrado — es el caso de los 103 pausados del 30-09');

/* Motor: los cuerpos REALES de index.html con el mundo alrededor falseado. Cada llamada arma un
   telefono nuevo (su localStorage, su formulario, su nube) para que los tramos no se contaminen. */
function motor(op) {
  op = op || {};
  const almacen = {}, sesion = {};
  const escriturasLS = [];
  const ls = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(almacen, k) ? almacen[k] : null; },
    setItem: function (k, v) { escriturasLS.push(k); almacen[k] = String(v); },
    removeItem: function (k) { delete almacen[k]; }
  };
  const ss = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(sesion, k) ? sesion[k] : null; },
    setItem: function (k, v) { sesion[k] = String(v); }
  };
  if (op.pausadas) almacen.emval_ots_pausadas = JSON.stringify(op.pausadas);
  if (op.cerradas) almacen.emval_ots = JSON.stringify(op.cerradas);

  // El formulario: cada id es un elemento que conserva su valor, como en el telefono.
  const dom = {};
  function el(id) {
    if (!dom[id]) {
      dom[id] = { id: id, value: '', textContent: '', innerHTML: '', style: {}, width: 300, height: 150,
        classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } } };
    }
    return dom[id];
  }
  const docFalso = {
    getElementById: el,
    querySelectorAll: function () { return []; },
    createElement: function () {
      return { style: {}, getContext: function () { return { fillRect: function () {}, drawImage: function () {} }; },
        toDataURL: function () { return 'data:image/jpeg;base64,FIRMA'; } };
    }
  };

  const escrituras = [];
  const db = {
    collection: function (col) {
      return { doc: function (id) {
        return { set: function (d) { escrituras.push({ col: col, id: id, datos: d }); return Promise.resolve(); } };
      } };
    }
  };
  const firestore = function () { return db; };
  firestore.FieldValue = { serverTimestamp: function () { return { __serverTimestamp: true }; } };
  const win = {
    _firebaseReady: true, firebase: { firestore: firestore },
    ALIAS_LOCALES: { 's10 los angeles': 'M10 LOS ANGELES', 's10 concepcion': 'M10 CONCEPCION' }
  };
  if (op.fichas) win._supFichas = op.fichas;
  const nav = { onLine: true };
  const estado = Object.assign({ usuario: JOSE, cargo: 'Tecnico en terreno', otNumero: null, local: null, tipo: null,
    fotosAntes: [], fotosDespues: [], fotoTimbre: null, serviciosPreventivo: [], descripcion: '', descripProblema: '',
    pendientesMateriales: '', firmada: false, firmaImagen: '', cotizacionId: '', enEspera: false, editandoOTId: '' },
    op.estado || {});
  const esp = { navegaciones: [] };

  const cuerpos = NUEVAS.concat(REALES).map(function (n) { return cuerpoDe(n) || ''; }).join('\n');
  const api = new Function(
    'localStorage', 'sessionStorage', 'window', 'navigator', 'console', 'document', 'estado', 'esp',
    'var vozGrabaciones = [], cadenaSeleccionada = null;\n' +
    'var EMVAL_AUTOSAVE_VERSION = 1, _autoSaveTimer = null, _restaurandoBorradorOT = false, _otFinalizada = false;\n' +
    'var _reportesPausadasSup = [], _descartesPausadasSup = [], _ultimoReportePausadas = { firma: "", en: 0 };\n' +
    'function _tecnicoActual() { return estado.usuario || ""; }\n' +
    'function _ocultoTecnico(t) { return t === "Bastian Baeza"; }\n' +
    'function _conTimeout(p) { return p; }\n' +
    'function _deviceIdCorreos() { return "dev_prueba"; }\n' +
    'function inicializarFotos() { estado.fotosAntes = []; estado.fotosDespues = []; }\n' +
    'function limpiarFirma() {}\n' +
    'function _setVozBtn() {}\n' +
    'function _actualizarBadgesOT() {}\n' +
    // Desde el caso OT #271080 (24-09-2026) nuevaOT limpia el aviso del correo del local escrito a
    // mano. Son pintura del formulario: lo que este test vigila son las autoguardadas.
    'function _avisarEmailAdminMalo() {}\n' +
    'function _actualizarHintEmail() {}\n' +
    'function go(id) { esp.navegaciones.push(id); }\n' +
    'function cargarOTsPausadasEnCadena() {}\n' +
    'function cargarCadenasApp() {}\n' +
    cuerpos + '\n' +
    'return { nuevaOT: nuevaOT, guardarBorrador: guardarBorradorOTActual, hayDatos: _hayDatosOTEnCurso,' +
    ' cargar: cargarOTsPausadas, limpiar: _limpiarBorradoresCompletados, contenido: _hojaTieneContenido,' +
    ' soloTelefono: _pausadasSoloTelefono, reportar: _reportarPausadasDelTelefono,' +
    ' setFinalizada: function (v) { _otFinalizada = v; },' +
    ' setSup: function (r, d) { _reportesPausadasSup = r; _descartesPausadasSup = d || []; } };'
  )(ls, ss, win, nav, { log: function () {}, warn: function () {}, error: function () {} }, docFalso, estado, esp);
  return { api: api, almacen: almacen, escriturasLS: escriturasLS, escrituras: escrituras, estado: estado, dom: el, win: win };
}

const JOSE = 'José Quiroz', NELSON = 'Nelson Herrera';
const DIA = '29-09-2026';
const iso = function (ms) { return new Date(ms).toISOString(); };
const AHORA = Date.now();
function hoja(numero, local, extra) {
  return Object.assign({ numero: numero, local: local, tecnico: JOSE, tipo: 'correctivo', fecha: DIA, hora: '8:14:22 p. m.',
    cadena: 'Unimarc', descripcionProblema: '', descripcion: '', descripcionTrabajo: '', pendientesMateriales: '',
    fotosAntes: [], fotosDespues: [], fotoTimbre: null, serviciosPreventivo: [], firmada: false, firmaImagen: '',
    estado: 'En Pausa', pausa: true, enEspera: false, cotizacionId: '', cotizacionNumero: '', autoDraft: true,
    creadoEn: '2026-09-29T23:14:12.186Z', actualizadoEn: '2026-09-29T23:14:22.418Z' }, extra || {});
}
function numeros(lista) { return lista.map(function (o) { return String(o.numero); }).sort(); }
function igual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

(async function () {
  if (faltan.length) { llegoAlFinal = true; return cerrar(); }

  // ── 1. Cerrar y "Hacer otra OT" no deja fantasma ────────────────────────────────────────────
  tramo('1) cerrar y Hacer otra OT', function () {
    const f0 = fallos.length;
    // Lo que deja cerrarOT(): la hoja cerrada sigue en `estado` y _otFinalizada = true.
    const cerrada = { otNumero: 670510, local: 'UNIMARC YUNGAY', tipo: 'correctivo', descripcion: 'Cambio de flotador',
      descripProblema: 'Fuga en el baño', fotosAntes: ['data:image/jpeg;base64,A'], fotosDespues: ['data:image/jpeg;base64,D'],
      fotoTimbre: 'data:image/jpeg;base64,T', firmada: true, firmaImagen: 'data:image/jpeg;base64,F' };
    const m = motor({ estado: cerrada });
    m.dom('desc-trabajo').value = 'Cambio de flotador';
    m.api.setFinalizada(true);
    m.api.nuevaOT();                       // "Hacer otra OT"
    m.api.guardarBorrador();               // bloquear el telefono / cambiar de app / cerrar sesion
    m.api.nuevaOT();                       // tocarlo dos veces: nuevaOT() guarda la hoja en curso primero
    m.api.guardarBorrador();
    const quedaron = m.api.cargar();
    chequear(quedaron.length === 0,
      'tras cerrar la OT #670510 de UNIMARC YUNGAY y tocar "Hacer otra OT", salir de la app guardo ' +
      quedaron.length + ' Autoguardada(s) (' + quedaron.map(function (o) { return '#' + o.numero + ' ' + o.local; }).join(', ') +
      '): es la hoja fantasma del caso del 30-09 — nace con el local del trabajo recien cerrado y nadie la toco');

    // Despues de un PREVENTIVO el N° de equipos queda escrito en el formulario (nuevaOT no lo borra).
    const m2 = motor({ estado: Object.assign({}, cerrada, { otNumero: 423001, tipo: 'preventivo', local: 'UNIMARC CHILLAN 4',
      serviciosPreventivo: [{ respuesta: 'Si' }] }) });
    m2.dom('num-equipos').value = '04';
    m2.api.setFinalizada(true);
    m2.api.nuevaOT();
    m2.api.guardarBorrador();
    const q2 = m2.api.cargar();
    chequear(q2.length === 0,
      'tras cerrar un PREVENTIVO y tocar "Hacer otra OT" quedo una Autoguardada (#' + (q2[0] && q2[0].numero) +
      ', N° equipos "' + (q2[0] && q2[0].numEquipos) + '"): el N° de equipos que quedo en el formulario no es trabajo de la hoja nueva');
    hecho(f0, '1) Cerrar una OT y tocar "Hacer otra OT" no guarda ninguna hoja al salir de la app');
  });

  // ── 2. El autoguardado sigue protegiendo el trabajo de verdad ───────────────────────────────
  tramo('2) el autoguardado protege lo que tiene contenido', function () {
    const f0 = fallos.length;
    const casos = [
      ['problema escrito', function (m) { m.dom('desc-problema').value = 'Fuga en el baño'; }],
      ['trabajo escrito', function (m) { m.dom('desc-trabajo').value = 'Se cambia el flotador'; }],
      ['pendientes y materiales', function (m) { m.estado.pendientesMateriales = 'Falta 1 flotador'; }],
      ['foto de antes', function (m) { m.estado.fotosAntes = ['data:image/jpeg;base64,A']; }],
      ['foto de despues', function (m) { m.estado.fotosDespues = [null, 'data:image/jpeg;base64,D']; }],
      ['foto del timbre', function (m) { m.estado.fotoTimbre = 'data:image/jpeg;base64,T'; }],
      ['firma', function (m) { m.estado.firmada = true; }],
      ['pauta respondida', function (m) { m.estado.tipo = 'preventivo'; m.estado.serviciosPreventivo = [{ respuesta: 'Si' }]; }],
      ['ligada a una cotizacion', function (m) { m.estado.cotizacionId = 'cot_123'; }],
      ['en espera de una cotizacion', function (m) { m.estado.enEspera = true; }]
    ];
    casos.forEach(function (c) {
      const m = motor({ estado: { otNumero: 604102, local: 'UNIMARC SAN CARLOS 2', tipo: 'correctivo' } });
      c[1](m);
      m.api.guardarBorrador();
      const q = m.api.cargar();
      chequear(q.length === 1 && String(q[0].numero) === '604102' && q[0].autoDraft === true,
        'una hoja con ' + c[0] + ' NO se autoguardo: eso es trabajo que se pierde si el telefono cierra la app');
    });

    // Elegir el local y el tipo no es trabajo: se repite en tres toques.
    const m = motor({ estado: { otNumero: 604103, local: 'UNIMARC SAN CARLOS 2', tipo: 'correctivo' } });
    m.dom('num-equipos').value = '02';
    m.api.guardarBorrador();
    chequear(m.api.cargar().length === 0,
      'una hoja con SOLO el local, el tipo y el N° de equipos se guardo como Autoguardada: asi nace el fantasma');

    // Y una hoja que ya estaba guardada no se borra por quedar vacia: simplemente no se reescribe.
    const previa = hoja(604104, 'UNIMARC SAN CARLOS 2', { descripcionProblema: 'Revisar bomba' });
    const m3 = motor({ pausadas: [previa], estado: { otNumero: 604105, local: 'UNIMARC SAN CARLOS 2' } });
    m3.api.guardarBorrador();
    chequear(igual(numeros(m3.api.cargar()), ['604104']), 'guardar la hoja vacia #604105 cambio la lista guardada: quedaron ' + numeros(m3.api.cargar()).join(', ') + ' (esperado solo 604104)');
    hecho(f0, '2) El autoguardado guarda texto, fotos, timbre, firma, pauta y hojas de cotizacion; no la hoja vacia');
  });

  // ── 3. La limpieza del telefono ─────────────────────────────────────────────────────────────
  tramo('3) limpieza del telefono', function () {
    const f0 = fallos.length;
    const cerradas = [
      { numero: 670510, local: 'UNIMARC YUNGAY', tipo: 'correctivo', tecnico: JOSE, fecha: DIA, firmada: true },
      { numero: 916655, local: 'UNIMARC BULNES', tipo: 'correctivo', tecnico: JOSE, fecha: '24-09-2026', firmada: false },
      { numero: 322596, local: 'S10 Concepcion', tipo: 'correctivo', tecnico: NELSON, fecha: '07-09-2026', firmada: true },
      { numero: 322597, local: 'M10 LOS ANGELES', tipo: 'correctivo', tecnico: NELSON, fecha: '08-09-2026', firmada: true }
    ];
    const pausadas = [
      hoja(859502, 'UNIMARC YUNGAY'),                                                        // fantasma → se va
      hoja(208838, ' unimarc  yungay', { tecnico: 'JOSE QUIROZ', tipo: '' }),                 // mismo, otra escritura → se va
      hoja(800383, 'M10 CONCEPCION', { tecnico: NELSON, fecha: '07-09-2026' }),              // alias: nombre viejo en el cierre → se va
      hoja(800384, 'S10 Los Angeles', { tecnico: NELSON, fecha: '08-09-2026' }),             // alias: nombre viejo en la hoja → se va
      hoja(670510, 'UNIMARC YUNGAY', { descripcionProblema: 'x' }),                           // mismo numero: regla de siempre → se va
      hoja(100001, 'UNIMARC YUNGAY', { fotosAntes: ['data:image/jpeg;base64,A'] }),           // tiene foto
      hoja(100002, 'UNIMARC YUNGAY', { descripcionProblema: 'Trabajos en reparación baños' }),// tiene texto
      hoja(100003, 'UNIMARC YUNGAY', { serviciosPreventivo: [{ respuesta: 'No' }] }),         // pauta respondida
      hoja(100004, 'UNIMARC YUNGAY', { firmada: true, firmaImagen: 'data:image/jpeg;base64,F' }), // firmada
      hoja(100005, 'UNIMARC YUNGAY', { fecha: '28-09-2026' }),                                // otro dia
      hoja(100006, 'UNIMARC EL CARMEN'),                                                      // otro local
      hoja(100007, 'UNIMARC YUNGAY', { tecnico: NELSON }),                                    // otro tecnico
      hoja(100008, 'UNIMARC YUNGAY', { autoDraft: false }),                                   // En Pausa real
      hoja(100009, 'UNIMARC YUNGAY', { enEspera: true, cotizacionId: 'cot_1', cotizacionNumero: '29092601' }), // de cotizacion
      hoja(100010, 'UNIMARC YUNGAY'),                                                         // la hoja ABIERTA
      hoja(100011, 'UNIMARC BULNES', { fecha: '24-09-2026' }),                                // su cierre no esta firmado
      hoja(100012, 'UNIMARC YUNGAY', { fecha: '' }),                                          // sin fecha
      hoja(100013, 'UNIMARC YUNGAY', { cotizacionId: 'cot_2' })                               // previa adjuntada, sin "en espera"
    ];
    const m = motor({ pausadas: pausadas, cerradas: cerradas, estado: { otNumero: 100010 } });
    const hubo = m.api.limpiar();
    const quedan = numeros(m.api.cargar());
    const esperado = ['100001', '100002', '100003', '100004', '100005', '100006', '100007', '100008', '100009',
      '100010', '100011', '100012', '100013'];
    chequear(hubo === true, 'la limpieza dijo que no hubo cambios');
    chequear(igual(quedan, esperado), 'quedaron ' + quedan.join(', ') + '\n      esperado ' + esperado.join(', ') +
      '\n      (se van solo las autoguardadas VACIAS del mismo tecnico, local y dia de una OT cerrada y firmada, y la del mismo numero)');

    // Sin nada que quitar no reescribe el localStorage (anda al borde de la cuota por las fotos).
    const m2 = motor({ pausadas: [hoja(100001, 'UNIMARC YUNGAY', { fotosAntes: ['data:x'] })], cerradas: cerradas });
    const antes = m2.escriturasLS.length;
    chequear(m2.api.limpiar() === false && m2.escriturasLS.length === antes,
      'reescribe el localStorage aunque no haya nada que quitar');

    // Sin OT cerradas en el telefono no toca nada.
    const m3 = motor({ pausadas: [hoja(859502, 'UNIMARC YUNGAY')] });
    chequear(m3.api.limpiar() === false && m3.api.cargar().length === 1, 'sin OT cerradas en el telefono igual quito algo');
    hecho(f0, '3) El telefono quita solo la autoguardada vacia de un trabajo que ese tecnico ya cerro y firmo ahi');
  });

  // ── 4. El panel no muestra lo que ya se cerro ───────────────────────────────────────────────
  tramo('4) panel del administrador', function () {
    const f0 = fallos.length;
    const fichas = { ots: [
      { id: 'a', numero: 670510, local: 'UNIMARC YUNGAY', tecnico: JOSE, tipo: 'correctivo', fecha: DIA,
        pausa: false, firmada: true, creadoEn: { seconds: Date.parse('2026-09-29T23:14:00Z') / 1000 } },
      { id: 'b', numero: 518336, local: 'UNIMARC MANQUIMAVIDA', tecnico: NELSON, tipo: 'correctivo', fecha: '31-08-2026',
        pausa: false, firmada: true },
      { id: 'c', numero: 604102, local: 'UNIMARC SAN CARLOS 2', tecnico: JOSE, tipo: 'correctivo', fecha: '25-09-2026',
        pausa: true, firmada: true }    // firmada pero todavia PAUSADA en la nube: no prueba que se cerro
    ] };
    function item(numero, local, extra) {
      const h = hoja(numero, local, extra);
      return { numero: String(h.numero), local: h.local, tecnico: h.tecnico, tipo: h.tipo, fecha: h.fecha,
        descripcion: h.descripcion || h.descripcionProblema || '', creadoEn: h.creadoEn, actualizadoEn: h.actualizadoEn,
        autoDraft: h.autoDraft, pendienteSync: false, enEspera: h.enEspera, cotizacionNumero: h.cotizacionNumero,
        conContenido: extra && 'conContenido' in extra ? extra.conContenido : undefined };
    }
    const reporte = { usuario: JOSE, actualizadoEn: iso(AHORA - 3600000), items: [
      item(859502, 'UNIMARC YUNGAY'),                                              // fantasma (telefono viejo)  → no sale
      item(208838, 'UNIMARC YUNGAY', { conContenido: false }),                     // fantasma (telefono nuevo)  → no sale
      item(518336, 'UNIMARC MANQUIMAVIDA', { tecnico: NELSON, autoDraft: false,    // la misma OT, ya cerrada    → no sale
        descripcion: 'Instalacion de electrovalvula', fecha: '26-08-2026' }),
      item(300001, 'UNIMARC YUNGAY', { conContenido: true }),                      // tiene fotos                → sale
      item(300002, 'UNIMARC YUNGAY', { descripcion: 'Trabajos en reparación baños' }), // tiene texto            → sale
      item(300003, 'UNIMARC YUNGAY', { fecha: '28-09-2026' }),                     // otro dia                   → sale
      item(300004, 'UNIMARC YUNGAY', { autoDraft: false }),                        // En Pausa sin cierre        → sale
      item(300005, 'UNIMARC SAN CARLOS 2', { fecha: '25-09-2026' })                // solo calza con una pausada → sale
    ] };
    const m = motor({ fichas: fichas });
    m.api.setSup([reporte], []);
    const salen = numeros(m.api.soloTelefono([]).map(function (x) { return x.ot; }));
    const esperado = ['300001', '300002', '300003', '300004', '300005'];
    chequear(igual(salen, esperado), 'el panel muestra ' + salen.join(', ') + '\n      esperado ' + esperado.join(', ') +
      '\n      (no salen: la autoguardada vacia de un trabajo ya cerrado ni la misma OT ya cerrada)');

    // Sin las fichas cargadas no se puede afirmar nada: no esconde ninguna.
    const m2 = motor({});
    m2.api.setSup([reporte], []);
    chequear(m2.api.soloTelefono([]).length === reporte.items.length,
      'sin las fichas de OT cargadas el panel escondio hojas: esconder sin haberlo comprobado es peor que mostrar');
    hecho(f0, '4) El panel no muestra la autoguardada vacia de un trabajo cerrado ni la OT ya cerrada');
  });

  // ── 5. El reporte dice si la hoja tiene contenido ───────────────────────────────────────────
  await tramoAsync('5) reporte del telefono', async function () {
    const f0 = fallos.length;
    const m = motor({ pausadas: [
      hoja(859502, 'UNIMARC YUNGAY'),
      hoja(100001, 'UNIMARC YUNGAY', { fotosAntes: ['data:image/jpeg;base64,AAAA'], firmada: true, firmaImagen: 'data:image/jpeg;base64,F' })
    ] });
    await m.api.reportar(true);
    const w = m.escrituras.filter(function (e) { return e.col === 'alertas'; });
    chequear(w.length === 1, 'no escribio el reporte del telefono');
    const items = (w[0] && w[0].datos && w[0].datos.items) || [];
    const porNum = {}; items.forEach(function (i) { porNum[i.numero] = i; });
    chequear(porNum['859502'] && porNum['859502'].conContenido === false, 'el reporte no dice que la hoja vacia esta vacia');
    chequear(porNum['100001'] && porNum['100001'].conContenido === true,
      'el reporte no dice que la hoja con foto y firma tiene contenido: el panel la esconderia como si estuviera vacia');
    chequear(!/data:image/.test(JSON.stringify(items)), 'el reporte lleva fotos o firmas (el documento topa en 1 MB)');

    // Una hoja con datos mal formados no puede callar el reporte entero.
    const m2 = motor({ pausadas: [hoja(859502, 'UNIMARC YUNGAY', { fotosAntes: 'rota', fotosDespues: { a: 1 }, serviciosPreventivo: 'x' })] });
    await m2.api.reportar(true);
    const w2 = m2.escrituras.filter(function (e) { return e.col === 'alertas'; });
    chequear(w2.length === 1 && w2[0].datos.items.length === 1,
      'una hoja con fotos o pauta mal formadas hizo fallar el reporte del telefono: el panel se queda con el anterior');
    hecho(f0, '5) El reporte dice si cada hoja tiene contenido, sin fotos ni firmas');
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
  console.log('\nOK — cerrar una OT no deja fantasmas, el telefono los limpia y el panel no los muestra.');
}

process.on('uncaughtException', function (e) {
  console.log('\nFALLA — excepcion no controlada: ' + (e && e.message));
  process.exit(1);
});
