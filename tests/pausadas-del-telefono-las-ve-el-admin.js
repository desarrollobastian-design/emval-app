/* Prueba de regresion — lo que un tecnico tiene pausado en SU telefono lo ve y lo borra el admin.

   Caso del 25-09-2026. Pedro, por WhatsApp: *"A Lucas cuando abre su sesión le aparecen esas
   pausadas pero no me aparecen a mí como administrador para eliminarlas"*. Lucas tenia 10 en
   "Trabajos pausados"; el panel de Pedro, ninguna.

   Lo que pasaba, comprobado leyendo el codigo publicado (v59):
     · La lista del tecnico sale del localStorage de SU telefono; el panel solo lee la nube
       (ordenes con pausa == true). Son dos listas distintas.
     · Una "Autoguardada" no se sube nunca a la nube.
     · Una "En Pausa" cuyo documento se borro (a mano el 24-08, o con el boton Eliminar) la
       conservaba PARA SIEMPRE el paso 1 de _reconciliarPausadasFirebase ("no esta en Firebase →
       mantener").
     · Y ningun camino llevaba un borrado del administrador al telefono.

   El arreglo: el telefono reporta lo que tiene guardado (alertas/pausadas_<dispositivo>), el
   panel muestra lo que no esta en la nube, y Eliminar deja una lapida (alertas/descartes_pausadas)
   que el telefono aplica al sincronizar. Los invariantes que vigila este test:
     1. La lapida cubre numero + local + tecnico (tolerando tildes, mayusculas y espacios) y SOLO
        si la hoja no se toco despues. Nunca el numero solo: ya colisionaron.
     2. Aplicarla quita lo cubierto —de cualquier tecnico del telefono—, respeta la hoja abierta y
        encola el borrado en la nube por si alcanzo a subir.
     3. Una pausa pendiente que el admin borro NO se vuelve a subir.
     4. El reporte no lleva fotos ni firmas, incluye todos los tecnicos, no se confunde con la
        alerta de correos y no se reescribe si nada cambio.
     5. La reconciliacion no vuelve a bajar al telefono lo que el admin descarto.
     6. Eliminar escribe la lapida ANTES de borrar el documento; si la lapida falla no borra nada.
        Una hoja que vive solo en el telefono no toca `ordenes`.
     7. El panel muestra las del telefono que no estan en la nube, aunque la nube este vacia, sin
        repetir y sin telefonos que no reportan hace semanas.
     8. "Ver OTs por tecnico" ya no dice "OT eliminada" sobre una tarjeta que solo existe en el
        telefono; y el encabezado deja espacio a la barra de estado del iPhone.

   Uso:  node tests/pausadas-del-telefono-las-ve-el-admin.js index.html
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
function tramo(titulo, fn) {
  try { fn(); } catch (e) { fallos.push('  ✗ ' + titulo + ' — el guion se cayo: ' + (e && e.message)); }
}
async function tramoAsync(titulo, fn) {
  try { await fn(); } catch (e) { fallos.push('  ✗ ' + titulo + ' — el guion se cayo: ' + (e && e.message)); }
}

const NUEVAS = ['_versionPausadaMs', '_descarteCubrePausada', '_leerDescartesPausadas', '_aplicarDescartesPausadas',
  '_sincronizarDescartesPausadas', '_reportarPausadasDelTelefono', '_registrarDescartePausada', '_pausadasSoloTelefono'];
const REALES = ['_normTexto', '_claveOT', '_creadoEnMs', '_msCreado', '_haceCuantoDesde', '_mismoTecnico',
  'cargarOTsPausadas', 'guardarOTsPausadas', 'sincronizarPausadasPendientes', 'eliminarPausadaSup',
  '_renderPausadasSup', '_reconciliarPausadasFirebase', '_firebaseADTOPausada'];

console.log('Las pausadas que viven solo en el telefono las ve y las borra el administrador\n');

const faltan = NUEVAS.concat(REALES).filter(function (n) { return !cuerpoDe(n); });
chequear(faltan.length === 0,
  'no existen en index.html: ' + faltan.join(', ') + '. Sin ellas el panel no ve lo que guarda el ' +
  'telefono y nada lleva un borrado del administrador hasta el — es el caso de Lucas del 25-09');

/* Motor: los cuerpos REALES de index.html con el mundo alrededor falseado. Cada llamada arma un
   telefono nuevo (su localStorage, su nube) para que los tramos no se contaminen entre si. */
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
  if (op.cacheDescartes) almacen.emval_descartes_pausadas = JSON.stringify(op.cacheDescartes);

  const nube = Object.assign({}, op.nube || {});   // 'coleccion/id' → datos
  const escrituras = [];                              // orden real de lo que se escribio en la nube
  const consultas = op.consultas || {};               // coleccion → [docs] para where().get()
  const db = {
    collection: function (col) {
      return {
        doc: function (id) {
          return {
            get: function () {
              if (op.fallaGet) return Promise.reject(op.fallaGet);
              const d = nube[col + '/' + id];
              return Promise.resolve({ exists: !!d, id: id, data: function () { return d; } });
            },
            set: function (d, o) {
              if (op.fallaSet && op.fallaSet(col, id)) return Promise.reject(op.fallaSet(col, id));
              escrituras.push({ op: 'set', col: col, id: id, datos: d, opts: o });
              return Promise.resolve();
            },
            delete: function () { escrituras.push({ op: 'delete', col: col, id: id }); return Promise.resolve(); },
            update: function (d) { escrituras.push({ op: 'update', col: col, id: id, datos: d }); return Promise.resolve(); }
          };
        },
        where: function () {
          const q = { where: function () { return q; },
            get: function () {
              const docs = (consultas[col] || []).map(function (d) { return { id: d._id || 'x', data: function () { return d; } }; });
              return Promise.resolve({ docs: docs, empty: !docs.length, forEach: function (f) { docs.forEach(f); } });
            } };
          return q;
        },
        add: function (d) { escrituras.push({ op: 'add', col: col, datos: d }); return Promise.resolve({ id: 'nuevo' }); }
      };
    }
  };
  const firestore = function () { return db; };
  firestore.FieldValue = {
    serverTimestamp: function () { return { __serverTimestamp: true }; },
    arrayUnion: function () { return { __arrayUnion: [].slice.call(arguments) }; },
    arrayRemove: function () { return { __arrayRemove: [].slice.call(arguments) }; }
  };
  const win = { _firebaseReady: true, firebase: { firestore: firestore } };
  const nav = { onLine: op.offline ? false : true };
  const estado = Object.assign({ usuario: 'Lucas Fernández', cargo: 'Tecnico en terreno', otNumero: null }, op.estado || {});
  const esp = { encolados: [], toasts: [], subidas: [], renders: 0, errores: [], dialogos: [], cards: [] };
  const docFalso = {
    getElementById: function () { return op.pantallaCadena ? { classList: { contains: function () { return true; } } } : null; },
    querySelectorAll: function () { return []; },
    createElement: function () { return { className: '', textContent: '' }; }
  };

  const iVars = src.indexOf('var _KEY_DESCARTES_PAUSADAS');
  const vars = iVars >= 0 ? src.slice(iVars, src.indexOf('\n', src.indexOf('var _ultimoReportePausadas', iVars))) : '';
  const cuerpos = NUEVAS.concat(REALES).map(function (n) { return cuerpoDe(n) || ''; }).join('\n');
  const api = new Function(
    'localStorage', 'sessionStorage', 'window', 'navigator', 'console', 'document', 'estado', 'esp', 'op',
    'var _descartesPausadasSup = [], _reportesPausadasSup = [], _cadenaMapSup = {};\n' +
    'function toast(t) { esp.toasts.push(t); }\n' +
    'function _conTimeout(p) { return p; }\n' +
    'function _encolarCierrePausada(n, t) { esp.encolados.push(String(n) + "|" + t); }\n' +
    'function _deviceIdCorreos() { return "dev_prueba"; }\n' +
    'function _tecnicoActual() { return estado.usuario; }\n' +
    'function _renderPausadasEnCadena() { esp.renders++; }\n' +
    'function _sincronizarPausadaFirebase(ot) { esp.subidas.push(String(ot.numero)); }\n' +
    'function _ocultoTecnico(t) { return t === "Bastian Baeza"; }\n' +
    'function _numerosCerradosLocalmente() { return {}; }\n' +
    'async function _urlsABase64(a) { return a || []; }\n' +
    'function _confirmar(texto, o) { esp.dialogos.push({ texto: texto, titulo: o && o.titulo }); return Promise.resolve(op.confirmar !== false); }\n' +
    'function verificarPasswordAdmin() { return Promise.resolve(true); }\n' +
    'function _error(que, e) { esp.errores.push(que + ": " + (e && e.message)); }\n' +
    'function _dedupeOTs(l) { return { lista: l, duplicados: 0 }; }\n' +
    'function _crearCardPausadaSup(id, d, m, tel) { var c = { id: id, d: d, tel: tel, style: {} }; esp.cards.push(c); return c; }\n' +
    vars + '\n' + cuerpos + '\n' +
    'return { cubre: _descarteCubrePausada, aplicar: _aplicarDescartesPausadas, sincronizar: sincronizarPausadasPendientes,' +
    ' reportar: _reportarPausadasDelTelefono, reconciliar: _reconciliarPausadasFirebase, eliminar: eliminarPausadaSup,' +
    ' soloTelefono: _pausadasSoloTelefono, render: _renderPausadasSup, cargar: cargarOTsPausadas,' +
    ' adto: _firebaseADTOPausada, setLeidos: function (ms) { _descartesLeidosEn = ms; },' +
    ' setSup: function (r, d) { _reportesPausadasSup = r; _descartesPausadasSup = d; },' +
    ' reiniciarReporte: function () { _ultimoReportePausadas = { firma: "", en: 0 }; } };'
  )(ls, ss, win, nav, { log: function () {}, warn: function () {}, error: function () {} }, docFalso, estado, esp, op);
  return { api: api, almacen: almacen, escriturasLS: escriturasLS, escrituras: escrituras, esp: esp, estado: estado };
}

const LUCAS = 'Lucas Fernández';
const T = Date.parse('2026-09-24T19:37:00Z');
const iso = function (ms) { return new Date(ms).toISOString(); };
function entrada(numero, local, extra) {
  return Object.assign({ numero: numero, local: local, tecnico: LUCAS, tipo: 'correctivo', cadena: 'SUPER 10',
    creadoEn: iso(T - 3600000), actualizadoEn: iso(T - 60000), autoDraft: true }, extra || {});
}
function lapida(numero, local, tecnico, hastaMs) {
  return { numero: String(numero), local: local, tecnico: tecnico || LUCAS, hastaMs: hastaMs || T };
}

(async function () {
  if (faltan.length) { llegoAlFinal = true; return cerrar(); }

  // ── 1. Que cubre una lapida ─────────────────────────────────────────────────────────────────
  tramo('1) que cubre una lapida', function () {
    const m = motor();
    const l = lapida('829795', 'S10 Concepcion');
    chequear(m.api.cubre(l, entrada(829795, 's10  concepcion', { tecnico: 'LUCAS FERNANDEZ ' })),
      'no reconoce la misma hoja escrita con otras tildes, mayusculas o espacios (numero 829795 vs "829795")');
    chequear(!m.api.cubre(l, entrada(829795, 'S10 TOME')), 'cubre una hoja de OTRO local con el mismo numero');
    chequear(!m.api.cubre(l, entrada(829795, 'S10 Concepcion', { tecnico: 'José Soto' })), 'cubre la hoja de OTRO tecnico');
    chequear(!m.api.cubre(l, entrada(829796, 'S10 Concepcion')), 'cubre otro numero');
    chequear(!m.api.cubre(l, entrada(829795, 'S10 Concepcion', { actualizadoEn: iso(T + 1000) })),
      'le quita al tecnico una hoja que siguio trabajando DESPUES del borrado');
    chequear(m.api.cubre(l, entrada(829795, 'S10 Concepcion', { actualizadoEn: '', creadoEn: '' })),
      'una hoja sin fecha no queda cubierta (las entradas viejas no traen version)');
    console.log('1) La lapida cubre numero + local + tecnico, y solo lo que no se toco despues ✓');
  });

  // ── 2. Aplicarla en el telefono ─────────────────────────────────────────────────────────────
  tramo('2) aplicar las lapidas', function () {
    const m = motor({
      estado: { otNumero: 807581 },
      pausadas: [
        entrada(829795, 'S10 Concepcion'),                                   // cubierta
        entrada(111111, 'UNIMARC TOME', { tecnico: 'José Soto' }),           // de otro tecnico, cubierta
        entrada(807581, 'M10 CONCEPCION', { autoDraft: false }),             // cubierta pero ABIERTA
        entrada(484622, 'UNIMARC YUMBEL', { autoDraft: false }),             // sin lapida
        entrada(602751, 'S10 TOME', { actualizadoEn: iso(T + 5000) })        // tocada despues
      ]
    });
    const lapidas = [lapida('829795', 'S10 Concepcion'), lapida('111111', 'UNIMARC TOME', 'José Soto'),
      lapida('807581', 'M10 CONCEPCION'), lapida('602751', 'S10 TOME')];
    const n = m.api.aplicar(lapidas);
    const quedan = m.api.cargar().map(function (o) { return String(o.numero); }).sort();
    chequear(n === 2, 'quito ' + n + ' en vez de 2');
    chequear(JSON.stringify(quedan) === JSON.stringify(['484622', '602751', '807581']),
      'quedaron ' + quedan.join(', ') + ' (esperado 484622, 602751, 807581)');
    chequear(m.esp.encolados.length === 0,
      'aplicar una lapida encolo borrados en la nube: esa cola borra por numero + tecnico sin mirar local ni ' +
      'version, y podria llevarse una hoja mas nueva de otro telefono');

    const antes = m.escriturasLS.length;
    chequear(m.api.aplicar([lapida('000001', 'NADA')]) === 0 && m.escriturasLS.length === antes,
      'reescribe el localStorage aunque no haya nada que quitar (arriesga la cuota por las fotos)');
    console.log('2) Quita lo cubierto de cualquier tecnico, respeta la hoja abierta y la tocada despues ✓');
  });

  // ── 3. Lo que el admin borro no se vuelve a subir ───────────────────────────────────────────
  await tramoAsync('3) no se re-sube lo descartado', async function () {
    const m = motor({
      pausadas: [
        entrada(700001, 'UNIMARC PENCO', { autoDraft: false, pendienteSync: true }),
        entrada(700002, 'UNIMARC LIRQUEN', { autoDraft: false, pendienteSync: true })
      ],
      nube: { 'alertas/descartes_pausadas': { tipo: 'descartes_pausadas', items: [lapida('700001', 'UNIMARC PENCO')] } }
    });
    await m.api.sincronizar();
    chequear(m.esp.subidas.indexOf('700001') < 0, 'volvio a subir la pausa que el administrador elimino: reaparece en su panel');
    chequear(m.esp.subidas.indexOf('700002') >= 0, 'dejo de subir una pausa pendiente que nadie elimino');
    chequear(!m.api.cargar().some(function (o) { return String(o.numero) === '700001'; }), 'la eliminada sigue en el telefono');
    chequear(/700001/.test(m.almacen.emval_descartes_pausadas || ''),
      'las lapidas no quedan guardadas en el telefono (sin señal no se podrian aplicar)');
    // Lapidas leidas hace 3 min (dentro de la espera de 10) y Pedro borra ahora: con algo por
    // subir se leen igual, antes de subir.
    const pend = function () { return [entrada(700001, 'UNIMARC PENCO', { autoDraft: false, pendienteSync: true })]; };
    const m2 = motor({ pausadas: pend(), nube: { 'alertas/descartes_pausadas': { items: [lapida('700001', 'UNIMARC PENCO')] } } });
    m2.api.setLeidos(Date.now() - 180000);
    await m2.api.sincronizar();
    chequear(m2.esp.subidas.length === 0, 'con las lapidas leidas hace 3 min subio una pausa que Pedro acababa de borrar');
    const m3 = motor({ pausadas: pend(), fallaGet: new Error('unavailable') });
    await m3.api.sincronizar();
    chequear(m3.esp.subidas.length === 0, 'sin poder leer las lapidas igual subio: una lectura atrasada revive un borrado');
    const m4 = motor({ pausadas: pend(), fallaGet: Object.assign(new Error('denied'), { code: 'permission-denied' }) });
    await m4.api.sincronizar();
    chequear(m4.esp.subidas.length === 1, 'si las reglas no dejan leer las lapidas, las pausas no se suben nunca mas');
    console.log('3) La pausa que el admin elimino no se vuelve a subir; las demas si ✓');
  });

  // ── 4. El reporte del telefono ──────────────────────────────────────────────────────────────
  await tramoAsync('4) reporte del telefono', async function () {
    const foto = 'data:image/jpeg;base64,' + 'A'.repeat(300000);
    const m = motor({ pausadas: [
      entrada(829795, 'S10 Concepcion', { fotosAntes: [foto], fotosDespues: [foto], fotoTimbre: foto, firmaImagen: foto,
        descripcionProblema: 'x'.repeat(500) }),
      entrada(111111, 'UNIMARC TOME', { tecnico: 'José Soto', autoDraft: false, pendienteSync: true })
    ] });
    await m.api.reportar();
    const w = m.escrituras.filter(function (e) { return e.col === 'alertas'; });
    chequear(w.length === 1 && w[0].id === 'pausadas_dev_prueba', 'no escribio alertas/pausadas_<dispositivo>');
    if (w.length) {
      const d = w[0].datos, json = JSON.stringify(d);
      chequear(json.length < 10000, 'el reporte pesa ' + json.length + ' bytes: se estan colando fotos o firmas');
      chequear(!/fotosAntes|fotosDespues|fotoTimbre|firmaImagen|base64/.test(json), 'el reporte lleva fotos o firmas');
      chequear(d.tipo === 'pausadas' && !('activa' in d), 'el reporte no es tipo "pausadas" o lleva `activa` (lo leeria la alerta de correos)');
      chequear((d.items || []).length === 2 && d.items.some(function (i) { return i.tecnico === 'José Soto' && i.pendienteSync === true; }),
        'el reporte no trae las hojas de todos los tecnicos del telefono');
      chequear(w[0].opts == null || !w[0].opts.merge, 'el reporte se mezcla (merge) con el anterior: lo quitado no desapareceria del panel');
    }
    await m.api.reportar();
    chequear(m.escrituras.length === 1, 'reescribe el reporte aunque nada cambio (gasta escrituras cada 90 s)');
    await m.api.reportar(true);
    chequear(m.escrituras.length === 2, 'con `forzar` no reporta');
    console.log('4) El reporte va sin fotos, con todos los tecnicos, y solo cuando algo cambia ✓');
  });

  // ── 5. La reconciliacion no baja lo descartado ──────────────────────────────────────────────
  await tramoAsync('5) reconciliacion', async function () {
    const m = motor({
      cacheDescartes: [lapida('700001', 'UNIMARC PENCO')],
      consultas: { ordenes: [
        { _id: 'a', numero: 700001, local: 'UNIMARC PENCO', tecnico: LUCAS, pausa: true, creadoEn: iso(T - 7200000) },
        { _id: 'b', numero: 700002, local: 'UNIMARC LIRQUEN', tecnico: LUCAS, pausa: true, creadoEn: iso(T - 7200000) }
      ] }
    });
    await m.api.reconciliar();
    const nums = m.api.cargar().map(function (o) { return String(o.numero); });
    chequear(nums.indexOf('700001') < 0, 'la reconciliacion volvio a bajar al telefono una hoja que el admin descarto');
    chequear(nums.indexOf('700002') >= 0, 'la reconciliacion dejo de bajar una hoja legitima del tecnico');
    console.log('5) La reconciliacion no revive lo descartado ✓');
  });

  // ── 6. Eliminar: lapida primero, y nada a medias ────────────────────────────────────────────
  await tramoAsync('6) eliminar', async function () {
    const d = { numero: 862089, local: 'ALVI CANETE', tecnico: 'Nelson Herrera', actualizadoEn: iso(T - 5000) };

    let m = motor({ fallaSet: function () { return new Error('unavailable'); }, estado: { cargo: 'Administrador', usuario: 'Pedro Arce' } });
    let r = await m.api.eliminar('doc1', d, null, null);
    chequear(r === false && !m.escrituras.some(function (e) { return e.op === 'delete'; }),
      'sin poder escribir la lapida igual borro el documento: la copia del telefono quedaria para siempre');
    chequear(m.esp.errores.length === 1, 'fallo sin avisarle a Pedro');

    m = motor({ estado: { cargo: 'Administrador', usuario: 'Pedro Arce' } });
    r = await m.api.eliminar('doc1', d, null, null);
    const orden = m.escrituras.map(function (e) { return e.op + ':' + e.col + '/' + e.id; });
    chequear(r === true && JSON.stringify(orden) === JSON.stringify(['set:alertas/descartes_pausadas', 'delete:ordenes/doc1']),
      'el orden fue ' + orden.join(' → ') + ' (esperado: lapida y despues borrar el documento)');
    const lap = m.escrituras[0] && m.escrituras[0].datos.items && m.escrituras[0].datos.items.__arrayUnion
      ? m.escrituras[0].datos.items.__arrayUnion[0] : null;
    chequear(lap && lap.numero === '862089' && lap.tecnico === 'Nelson Herrera' && lap.local === 'ALVI CANETE' && lap.origen === 'nube',
      'la lapida no lleva numero, tecnico, local y origen');
    chequear(lap && lap.hastaMs === T - 5000,
      'la lapida de una hoja de la nube cubre "hasta ahora" (' + (lap && lap.hastaMs) + ') y no la version que Pedro vio: ' +
      'si Lucas siguio trabajando esa hoja sin subirla, se le borran las fotos y la firma');
    m = motor({ estado: { cargo: 'Administrador', usuario: 'Pedro Arce' } });
    await m.api.eliminar('doc2', { numero: 1, local: 'L', tecnico: LUCAS, creadoEn: { toMillis: function () { return T - 9000; } } }, null, null);
    chequear(m.escrituras[0] && m.escrituras[0].datos.items.__arrayUnion[0].hastaMs === T - 9000,
      'un documento viejo sin actualizadoEn no usa su creadoEn como version');
    chequear(lap && Object.keys(lap).every(function (k) { return lap[k] === null || typeof lap[k] !== 'object'; }),
      'la lapida lleva objetos (Firestore rechaza serverTimestamp dentro de un arreglo)');
    chequear(/tel[eé]fono/.test((m.esp.dialogos[0] || {}).texto || ''), 'el cuadro no avisa que tambien se quita del telefono');

    m = motor({ estado: { cargo: 'Administrador', usuario: 'Pedro Arce' } });
    r = await m.api.eliminar('', d, null, null);
    const lap2 = m.escrituras[0] && m.escrituras[0].datos.items.__arrayUnion[0];
    chequear(r === true && m.escrituras.length === 1 && m.escrituras[0].id === 'descartes_pausadas',
      'una hoja que vive solo en el telefono toco `ordenes` o no dejo lapida');
    chequear(lap2 && lap2.hastaMs === T - 5000 && lap2.origen === 'telefono',
      'la lapida de una hoja del telefono no queda en la version reportada (hastaMs ' + (lap2 && lap2.hastaMs) + ')');
    chequear(/solo en un tel[eé]fono/i.test((m.esp.dialogos[0] || {}).texto || ''),
      'el cuadro no dice que la hoja vive solo en un telefono (y que se pierde lo guardado)');

    // La tarjeta cambia sin esperar a la escucha en vivo (puede estar cortada).
    const boton = { reemplazo: null, replaceWith: function (x) { this.reemplazo = x; } };
    m = motor({ estado: { cargo: 'Administrador', usuario: 'Pedro Arce' } });
    await m.api.eliminar('', d, { querySelector: function () { return boton; } }, null);
    chequear(boton.reemplazo && /se borrará/.test(boton.reemplazo.textContent),
      'tras eliminar una hoja del telefono la tarjeta sigue igual (con la escucha cortada, parece que no hizo nada)');

    // Poda: nunca reescribe el arreglo (perderia lapidas recien escritas por otro equipo).
    const viejaL = function (i) { return { numero: String(900000 + i), tecnico: LUCAS, local: 'X', hastaMs: 1, descartadaEnMs: T - 200 * 86400000 }; };
    const nuevaL = function (i) { return { numero: String(800000 + i), tecnico: LUCAS, local: 'X', hastaMs: 1, descartadaEnMs: Date.now() - 86400000 }; };
    m = motor({ estado: { cargo: 'Administrador', usuario: 'Pedro Arce' } });
    const cache = []; for (let i = 0; i < 150; i++) cache.push(viejaL(i)); for (let i = 0; i < 60; i++) cache.push(nuevaL(i));
    m.api.setSup([], cache);
    await m.api.eliminar('', d, null, null);
    const setP = m.escrituras.filter(function (e) { return e.op === 'set'; })[0];
    const updP = m.escrituras.filter(function (e) { return e.op === 'update'; })[0];
    chequear(setP && setP.datos.items && setP.datos.items.__arrayUnion, 'con mas de 200 lapidas se reescribe el arreglo entero en vez de agregar con arrayUnion');
    chequear(updP && updP.datos.items.__arrayRemove && updP.datos.items.__arrayRemove.length === 150,
      'la poda no quita exactamente las 150 lapidas de mas de 120 dias');

    const denegado = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    m = motor({ fallaSet: function () { return denegado; }, estado: { cargo: 'Administrador', usuario: 'Pedro Arce' } });
    r = await m.api.eliminar('doc1', d, null, null);
    chequear(r === true && m.escrituras.some(function (e) { return e.op === 'delete' && e.id === 'doc1'; }),
      'si las reglas rechazan la lapida, Pedro pierde el borrado de la nube que tenia antes');
    chequear(m.esp.toasts.some(function (t) { return /no se pudo avisar/i.test(t); }), 'no dice que el telefono no fue avisado');
    console.log('6) Eliminar deja la lapida antes de borrar y no deja nada a medias ✓');
  });

  // ── 7. El panel muestra lo del telefono ─────────────────────────────────────────────────────
  tramo('7) panel', function () {
    const m = motor({ estado: { cargo: 'Administrador', usuario: 'Pedro Arce' } });
    const ahora = Date.now();
    const rep = function (usuario, visto, items) { return { tipo: 'pausadas', usuario: usuario, actualizadoEn: { toDate: function () { return new Date(visto); } }, items: items }; };
    const A = { numero: '829795', local: 'S10 Concepcion', tecnico: LUCAS, actualizadoEn: iso(T) };
    const Aviejo = Object.assign({}, A, { actualizadoEn: iso(T - 99999) });
    const X = { numero: '555555', local: 'UNIMARC PENCO', tecnico: LUCAS, actualizadoEn: iso(T) };
    const J = { numero: '111111', local: 'UNIMARC TOME', tecnico: 'José Soto', actualizadoEn: iso(T) };
    const Z = { numero: '999999', local: 'S10 ANTIGUO', tecnico: LUCAS, actualizadoEn: iso(T) };
    m.api.setSup([rep(LUCAS, ahora - 60000, [A, X, J]), rep(LUCAS, ahora - 20 * 86400000, [Z]), rep('José Soto', ahora - 3600000, [Aviejo])],
      [lapida('111111', 'UNIMARC TOME', 'José Soto', T)]);
    const solo = m.api.soloTelefono([{ numero: 555555, local: 'UNIMARC PENCO', tecnico: 'José Soto' }]);
    const nums = solo.map(function (x) { return x.ot.numero; }).sort();
    chequear(JSON.stringify(nums) === JSON.stringify(['111111', '829795']),
      'solo-telefono dio ' + nums.join(', ') + ' (esperado 111111 y 829795: sin la de la nube ni la del telefono de hace 20 dias)');
    const a = solo.filter(function (x) { return x.ot.numero === '829795'; })[0];
    chequear(a && a.ot.actualizadoEn === iso(T), 'con dos telefonos trayendo la misma hoja no gano el reporte mas reciente');
    const j = solo.filter(function (x) { return x.ot.numero === '111111'; })[0];
    chequear(j && j.tel.pendiente === true && a && a.tel.pendiente === false, 'no marca como "pendiente" la que ya se elimino');

    const seccion = { style: {} }, countEl = { style: {}, textContent: '' };
    const hijos = [];
    const listaEl = { innerHTML: 'x', appendChild: function (c) { hijos.push(c); } };
    // Con la nube VACIA, la 555555 tambien es "solo del telefono": son tres.
    m.api.render({ docs: [], empty: true }, seccion, listaEl, countEl);
    chequear(seccion.style.display === 'block' && String(countEl.textContent) === '3' && hijos.length === 3,
      'con la nube vacia el panel oculta la seccion aunque haya pausadas en los telefonos (display=' +
      seccion.style.display + ', contador=' + countEl.textContent + ') — es exactamente lo que vio Pedro');
    chequear(hijos.every(function (c) { return c.id === '' && c.tel; }), 'las tarjetas del telefono no van marcadas como tales');
    console.log('7) El panel muestra lo que solo esta en los telefonos, aunque la nube este vacia ✓');
  });

  // ── 8. Lo que se comprueba leyendo ──────────────────────────────────────────────────────────
  tramo('8) estaticos', function () {
    const ver = cuerpoDe('verOTsTecnico') || '';
    chequear(/indexOf\('local_'\)/.test(ver) && /eliminarPausadaSup\(/.test(ver),
      '"Ver OTs por tecnico" sigue borrando doc(\'local_N\') y diciendo "OT eliminada" sin borrar nada');

    const sinc = cuerpoDe('sincronizarPausadasPendientes') || '';
    chequear(sinc.indexOf('await _sincronizarDescartesPausadas(') >= 0 &&
      sinc.indexOf('await _sincronizarDescartesPausadas(') < sinc.indexOf('let pendientes'),
      'sincronizarPausadasPendientes no aplica las lapidas ANTES de elegir que subir');
    chequear(/_aplicarDescartesPausadas\(\)/.test(cuerpoDe('_renderPausadasEnCadena') || ''),
      'la lista del tecnico no aplica las lapidas guardadas (sin señal seguiria mostrando lo eliminado)');
    chequear(/_unsubTelefonosSup\(\)/.test(cuerpoDe('detenerPausadasSupervisor') || ''),
      'al salir del panel queda escuchando los reportes de los telefonos');
    chequear(/where\('tipo', 'in', \['pausadas', 'descartes_pausadas'\]\)/.test(cuerpoDe('cargarPausadasSupervisor') || ''),
      'el panel no escucha los reportes de los telefonos');

    chequear(/actualizadoEn: ot\.actualizadoEn/.test(cuerpoDe('_sincronizarPausadaFirebase') || ''),
      'la subida de una pausa no lleva su version (actualizadoEn): la lapida de la nube no tiene con que compararse');
    const go = cuerpoDe('go') || '';
    chequear(/id === 's-supervisor'/.test(go) && /cargarPausadasSupervisor\(\)/.test(go),
      'volver al panel con la flecha no reanuda la escucha de pausadas (quedan congeladas)');
    const nuevas = NUEVAS.map(function (n) { return cuerpoDe(n) || ''; }).join('\n');
    chequear(!/\.add\(/.test(nuevas), 'el codigo nuevo crea documentos con add(): cada ciclo dejaria uno mas');

    ['.topbar {', '.login-hero {', '.success-hero {', '.dlg-overlay {'].forEach(function (sel) {
      const i = src.indexOf('  ' + sel);
      const regla = i >= 0 ? src.slice(i, src.indexOf('}', i)) : '';
      chequear(/env\(safe-area-inset-top/.test(regla),
        sel + ' no reserva el espacio de la barra del iPhone: la hora y la bateria tapan el encabezado');
    });
    chequear(/viewport-fit=cover/.test(src), 'se perdio viewport-fit=cover (sin el, env(safe-area-inset-*) vale 0)');
    console.log('8) Ver OTs por tecnico, el orden del ciclo y el encabezado del iPhone ✓');
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
  console.log('\nOK — lo que el tecnico tiene pausado en su telefono lo ve el admin, y lo que el admin borra se va del telefono.');
}

process.on('uncaughtException', function (e) {
  console.log('\nFALLA — excepcion no controlada: ' + (e && e.message));
  process.exit(1);
});
