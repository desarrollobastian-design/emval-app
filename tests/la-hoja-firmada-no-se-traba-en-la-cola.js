/* Prueba de regresion — una OT que YA quedo firmada en el servidor no se traba en la cola
   (revision final de Codex del PR #64, P1 nuevo 2, 24-10-2026).

   Con mala señal el primer intento puede guardarse sin que el telefono lo sepa, y la OT sigue en la
   cola. El reintento volvia a subir las fotos (Cloudinary entrega URLs nuevas) y a reescribir con
   set(merge) el contenido de la hoja firmada. Las reglas de la etapa 2 no se lo permiten a un tecnico:
   el reintento quedaba rechazado para siempre. Ejecuta la funcion REAL `sincronizarOTsPendientes` de
   index.html contra un Firestore falso que aplica a un tecnico la MISMA regla de `ordenes` de
   tests/reglas/firestore.rules (la lista de campos se lee de ese archivo). Que se exige:
   1. La OT ya firmada arriba, sin enlace: no se vuelven a subir las fotos ni se toca su contenido; se
      rellena el enlace del PDF; sale de la cola y no hay rechazo.
   2. La OT ya firmada arriba CON enlace: tampoco se vuelve a subir el PDF; el aviso usa ese enlace.
   3. La OT que no esta arriba: el camino de siempre (sube fotos, la crea firmada con `subidoPor`).
   4. La escritura del cierre SIGUE PENDIENTE en el SDK (la lectura la ve firmada solo por la
      compensacion local): la OT NO sale de la cola (regla 4) y no se sube ni se escribe nada; se
      confirma en la vuelta siguiente.
   5. (Codex, ronda 3) La CACHE tiene una copia firmada vieja que el servidor ya no tiene: la lectura va al
      servidor (`source: 'server'`) y la OT se vuelve a subir; no sale de la cola por la cache.
   6. Rechazo sin sesion de Firebase: si la sesion viene en camino (quien entro sin señal), no se avisa
      nada; si no, el aviso dice que hay que entrar con señal (no "avisale a CorexOn"). La OT se queda.
      (Ronda 4) Mientras no haya sesion, NO se vuelve a intentar (no se suben fotos para nada); y ese aviso
      no tapa un rechazo distinto que llegue despues, con sesion. Con tope: si la sesion "en camino" no se
      abre en 3 vueltas con señal, se avisa UNA vez (revisor, ronda 4).
   7. (Ronda 4) Dos corridas a la vez de la misma cola: una sola sube y escribe; la otra corre despues y
      ve la hoja ya firmada.
   8. (Ronda 5) Guardian: un candado tomado hace mas de 15 min (una corrida colgada) no deja la cola
      trabada: la corrida nueva corre. Uno recien tomado si la frena.
   9. (Ronda 6) La corrida VIEJA que el guardian dejo atras y despierta tarde no escribe: no pisa la OT
      que ya subio la nueva ni una correccion posterior (reloj simulado, sin reglas, como la etapa 1).
  10. (Ronda 7) Lo mismo con la vieja dormida en la subida del PDF (hasta 30 s): al despertar no escribe el
      enlace ni lo encola; el enlace corregido despues queda intacto. En el tramo 9, ademas, la vieja no
      sigue subiendo fotos: solo termina la que tenia en vuelo.
  11. (Ronda 7) Sacar la OT de la cola espera a IndexedDB: la funcion REAL `_eliminarOTPendiente` no borra
      si al abrir la base la corrida ya no es la vigente, y la cola le pasa esa pregunta.

   Uso:  node tests/la-hoja-firmada-no-se-traba-en-la-cola.js index.html
   Sale 0 si todo se cumple; 1 si no. */

const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8').replace(/\r\n/g, '\n');
const reglas = fs.readFileSync(path.join(__dirname, 'reglas', 'firestore.rules'), 'utf8');

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); return !!ok; }

const i = src.indexOf('async function sincronizarOTsPendientes() {');
const j = src.indexOf("\nwindow.addEventListener('online'", i);
chequear(i >= 0 && j > i, 'no se encontro sincronizarOTsPendientes (¿se renombro?)');
const m = reglas.match(/cambia\(\)\.hasOnly\(\[([^\]]*)\]\)/);
chequear(!!m, 'no se encontro en firestore.rules la lista de campos que un tecnico toca en una hoja firmada');
const PERMITIDOS = m ? m[1].split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean) : [];

// Firestore falso: aplica a un TECNICO la regla de `ordenes` de la etapa 2 en una hoja ya firmada.
function crearNube(docs, opciones) {
  opciones = opciones || {};
  const escrituras = [], lecturas = [];
  let ts = 0;
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function revisar(id, nuevo) {
    if (opciones.sinReglas) return;
    if (opciones.sinSesion || opciones.rechazarTodo) throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    const prev = docs[id] && !docs[id].__soloCache ? docs[id] : null;   // lo que solo esta en la cache no existe para el servidor
    if (!prev || prev.firmada !== true) return;
    const cambian = Object.keys(nuevo).filter(k => !igual(nuevo[k], prev[k]));
    const fuera = cambian.filter(k => PERMITIDOS.indexOf(k) < 0);
    const reemplaza = ['pdfUrl', 'pdfUrlCloudinary'].filter(k => k in nuevo && (prev[k] || '') !== '' && nuevo[k] !== prev[k]);
    if (fuera.length || reemplaza.length) {
      escrituras.push({ id, rechazada: true, campos: fuera.concat(reemplaza) });
      throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    }
  }
  const ref = (col, id) => ({
    id,
    get: async (op) => {
      const alServidor = !!(op && op.source === 'server');
      lecturas.push(alServidor ? 'servidor' : 'cache-o-servidor');
      let d = docs[id] ? JSON.parse(JSON.stringify(docs[id])) : undefined;
      // __soloCache: la copia vive en la cache del telefono, el servidor ya no la tiene.
      if (d && d.__soloCache && alServidor) d = undefined;
      const desdeCache = !!(d && d.__soloCache);
      const pendiente = !!(d && d.__pendiente); if (d) { delete d.__pendiente; delete d.__soloCache; }
      return { exists: !!d, data: () => d, metadata: { hasPendingWrites: pendiente, fromCache: desdeCache } };
    },
    set: async (d, op) => { revisar(id, d); escrituras.push({ id, campos: Object.keys(d) }); const base = docs[id] && !docs[id].__soloCache ? docs[id] : {}; docs[id] = Object.assign(op && op.merge ? base : {}, d); },
    update: async d => {
      if (!docs[id]) throw Object.assign(new Error('no existe'), { code: 'not-found' });
      revisar(id, d); escrituras.push({ id, campos: Object.keys(d) }); Object.assign(docs[id], d);
    }
  });
  const fs_ = { collection: col => ({ doc: id => ref(col, id), add: async d => { const id = 'auto' + (++ts); docs[id] = d; return { id }; } }) };
  const firestore = () => fs_;
  firestore.FieldValue = { serverTimestamp: () => ({ ts: ++ts }) };
  return { firebase: { firestore }, escrituras, lecturas, docs };
}

async function correr(docs, ot, opciones) {
  opciones = opciones || {};
  const nube = crearNube(docs, opciones);
  const r = { subidas: 0, pdfs: 0, eliminadas: [], errores: [], avisos: [], vinculos: 0, encolados: 0 };
  const window = { firebase: nube.firebase, _firebaseReady: true };
  const deps = {
    navigator: { onLine: true }, window, document: { getElementById: () => null },
    _obtenerOTsPendientes: async () => [ot],
    toast: () => {}, actualizarIndicadorPendientes: () => {},
    subirCloudinary: async (b, n, nombre) => {
      if (opciones.compuerta) { const g = opciones.compuerta; opciones.compuerta = null; await g; }   // la primera subida se queda dormida
      r.subidas++; return 'https://res.cloudinary.com/x/nueva_' + nombre;
    },
    _subirPDFaCloudinary: async () => {
      if (opciones.compuertaPDF) { const g = opciones.compuertaPDF; opciones.compuertaPDF = null; await g; }   // la primera subida del PDF se queda dormida
      r.pdfs++; return 'https://res.cloudinary.com/x/hoja_nueva.pdf';
    },
    _vincularCotizacionRealizada: async () => { r.vinculos++; },
    _enviarCorreo: async p => { r.avisos.push(p.pdf_url); },
    _eliminarOTPendiente: async id => { r.eliminadas.push(id); },
    _notificarOTCompletada: async () => {},
    _error: (que, e, msg) => { r.errores.push(String(msg || que)); },
    _encolarEnlacePDF: () => { r.encolados++; },
    _normTipo: t => t, _tecnicoActual: () => 'Tomas Prueba', _conTimeout: p => p,
    _numOTCorreo: n => String(n), _urlPDFVista: u => u, _nombrePDFHoja: () => 'HS',
    _uidSesionFirebase: () => (opciones.sinSesion ? '' : 'u_tec'),
    _credPendiente: opciones.credPendiente || null
  };
  const nombres = Object.keys(deps);
  const fn = new Function(...nombres, src.slice(i, j) + '\nreturn sincronizarOTsPendientes;')(...nombres.map(k => deps[k]));
  const _log = console.error, _warn = console.warn; console.error = () => {}; console.warn = () => {};
  const silencio = async (p) => { const a = console.error, b = console.warn, c = console.log; console.error = () => {}; console.warn = () => {}; console.log = () => {};
    try { return await p(); } finally { console.error = a; console.warn = b; console.log = c; } };
  console.error = _log; console.warn = _warn;
  if (opciones.antes) opciones.antes(fn);
  if (opciones.manual) return Object.assign(r, { fn, silencio, escrituras: nube.escrituras, docs: nube.docs });
  if (opciones.concurrentes) await silencio(async () => { await Promise.all([fn(), fn()]); await new Promise(res => setTimeout(res, 150)); });
  else await silencio(fn);
  return Object.assign(r, { escrituras: nube.escrituras, lecturas: nube.lecturas, docs: nube.docs, otra: () => silencio(fn) });
}

const otCola = (extra) => Object.assign({ id: 41, clientId: 'cli_1', numero: 425996, local: 'Local Prueba', tipo: 'correctivo',
  tecnico: 'Tomas Prueba', fecha: '24-10-2026', descripcionTrabajo: 'cambio de rueda', fotosAntes: ['data:image/jpeg;base64,AAA'],
  fotosDespues: ['data:image/jpeg;base64,BBB'], fotoTimbre: 'data:image/jpeg;base64,CCC', firmaBase64: 'data:firma',
  pdfBase64: 'data:application/pdf;base64,PDF', emailLocal: 'local@prueba.test' }, extra || {});
const arriba = (extra) => Object.assign({ numero: 425996, tecnico: 'Tomas Prueba', firmada: true, estado: 'Terminada',
  fotosAntes: ['https://res.cloudinary.com/x/antes_0.jpg'], fotosDespues: ['https://res.cloudinary.com/x/despues_0.jpg'],
  fotoTimbre: 'https://res.cloudinary.com/x/timbre.jpg', descripcionTrabajo: 'cambio de rueda', subidoPor: 'u_tec' }, extra || {});

(async () => {
  console.log('La hoja ya firmada en el servidor no se traba en la cola (etapa 2)\n');
  if (i < 0 || j <= i || !m) return terminar();

  // 1. Ya firmada arriba, sin enlace del PDF
  const a = await correr({ cli_1: arriba() }, otCola());
  const rechazos = a.escrituras.filter(e => e.rechazada);
  const fotosIguales = JSON.stringify(a.docs.cli_1.fotosAntes) === JSON.stringify(arriba().fotosAntes);
  console.log('1) Firmada arriba, sin PDF → fotos: ' + (a.subidas === 0 ? 'no se vuelven a subir ✓' : a.subidas + ' SUBIDAS DE NUEVO ✗') +
    ' · contenido: ' + (fotosIguales && !rechazos.length ? 'intacto, sin rechazo ✓' : 'RECHAZADO (' + rechazos.map(e => e.campos.join(',')).join(' | ') + ') ✗') +
    ' · enlace: ' + (a.docs.cli_1.pdfUrlCloudinary ? 'rellenado ✓' : 'SIN ENLACE ✗') + ' · cola: ' + (a.eliminadas.length === 1 ? 'sale ✓' : 'SE QUEDA ✗'));
  chequear(a.subidas === 0, 'el reintento volvio a subir las fotos de una hoja que ya estaba firmada en el servidor');
  chequear(!rechazos.length && fotosIguales, 'el reintento intento reescribir el contenido de una hoja firmada: las reglas lo rechazan (' + rechazos.length + ')');
  chequear(!!a.docs.cli_1.pdfUrlCloudinary, 'al reintentar no se relleno el enlace del PDF que faltaba');
  chequear(a.eliminadas.length === 1 && a.eliminadas[0] === 41, 'la OT ya subida se quedo en la cola (se reintentaria para siempre)');

  // 2. Ya firmada arriba CON enlace
  const b = await correr({ cli_1: arriba({ pdfUrlCloudinary: 'https://res.cloudinary.com/x/hoja_buena.pdf' }) }, otCola());
  console.log('2) Firmada arriba, con PDF → PDF: ' + (b.pdfs === 0 ? 'no se vuelve a subir ✓' : 'SUBIDO DE NUEVO ✗') +
    ' · aviso: ' + (b.avisos[0] === 'https://res.cloudinary.com/x/hoja_buena.pdf' ? 'con el enlace que ya tenia ✓' : (b.avisos[0] || 'sin aviso') + ' ✗') +
    ' · enlace: ' + (b.docs.cli_1.pdfUrlCloudinary === 'https://res.cloudinary.com/x/hoja_buena.pdf' ? 'el mismo ✓' : 'CAMBIADO ✗') + ' · cola: ' + (b.eliminadas.length === 1 ? 'sale ✓' : 'SE QUEDA ✗'));
  chequear(b.pdfs === 0 && b.docs.cli_1.pdfUrlCloudinary === 'https://res.cloudinary.com/x/hoja_buena.pdf', 'el reintento subio otra vez el PDF o le cambio el enlace a una hoja que ya lo tenia');
  chequear(b.avisos[0] === 'https://res.cloudinary.com/x/hoja_buena.pdf' && b.eliminadas.length === 1, 'el aviso no llevo el enlace que ya estaba, o la OT se quedo en la cola');

  // 3. No esta arriba: el camino de siempre
  const c = await correr({}, otCola());
  const creada = c.docs.cli_1 || {};
  console.log('3) No esta arriba        → fotos subidas: ' + c.subidas + (c.subidas === 3 ? ' ✓' : ' ✗') + ' · hoja: ' +
    (creada.firmada === true && creada.subidoPor === 'u_tec' ? 'creada firmada, con subidoPor ✓' : 'NO ✗') + ' · cola: ' + (c.eliminadas.length === 1 ? 'sale ✓' : 'SE QUEDA ✗'));
  chequear(c.subidas === 3 && creada.firmada === true && c.eliminadas.length === 1, 'la OT que no estaba arriba no se subio por el camino de siempre');
  chequear(creada.subidoPor === 'u_tec', 'la hoja subida desde la cola no dice que sesion la subio (subidoPor)');

  // 4. La escritura del cierre sigue pendiente en el SDK
  const d = await correr({ cli_1: arriba({ __pendiente: true }) }, otCola());
  const escribio = d.escrituras.length;
  console.log('4) Escritura pendiente → cola: ' + (d.eliminadas.length === 0 ? 'se queda ✓' : 'LA BORRA SIN CONFIRMAR ✗') +
    ' · subidas: ' + (d.subidas === 0 && d.pdfs === 0 ? 'ninguna ✓' : (d.subidas + d.pdfs) + ' ✗') + ' · escrituras: ' + (escribio === 0 ? 'ninguna ✓' : escribio + ' ✗'));
  chequear(d.eliminadas.length === 0, 'con la escritura del cierre todavia pendiente en el SDK, la OT se saco de la cola sin que el servidor la tuviera (regla 4)');
  chequear(d.subidas === 0 && d.pdfs === 0 && escribio === 0, 'con la escritura pendiente se volvio a subir o a escribir');

  // 5. La cache tiene una copia firmada vieja; el servidor ya no la tiene
  const e5 = await correr({ cli_1: arriba({ __soloCache: true, pdfUrlCloudinary: 'https://res.cloudinary.com/x/hoja_vieja.pdf' }) }, otCola());
  const subioDeNuevo = e5.subidas === 3 && e5.escrituras.some(w => w.id === 'cli_1' && !w.rechazada && w.campos.indexOf('firmada') >= 0);
  console.log('5) Copia vieja en cache → lectura: ' + (e5.lecturas.every(l => l === 'servidor') ? 'al servidor ✓' : 'PUEDE SER DE LA CACHE ✗') +
    ' · OT: ' + (subioDeNuevo ? 'se vuelve a subir ✓' : 'SALE DE LA COLA SIN ESTAR ARRIBA ✗'));
  chequear(e5.lecturas.length > 0 && e5.lecturas.every(l => l === 'servidor'), 'la lectura previa de la cola no se le pide al servidor (puede venir de la cache) (Codex, ronda 3)');
  chequear(subioDeNuevo, 'una copia firmada vieja en la cache saco la OT de la cola aunque el servidor no la tenia (Codex, ronda 3)');

  // 6. Rechazo sin sesion de Firebase
  const o6a = { sinSesion: true, credPendiente: { uid: 'u_tec' } };
  const f6a = await correr({}, otCola(), o6a);
  const subidas6a = f6a.subidas; await f6a.otra();                        // otra vuelta, todavia sin sesion
  const enCamino = f6a.errores.length === 0 && f6a.eliminadas.length === 0;
  const suspende6a = f6a.subidas === subidas6a;
  await f6a.otra(); await f6a.otra(); await f6a.otra();                  // tres vueltas mas, con señal y sin sesion
  const conTope = f6a.errores.length === 1 && /entrar con señal/.test(f6a.errores[0]) && f6a.subidas === subidas6a;
  const o6b = { sinSesion: true };
  const f6b = await correr({}, otCola(), o6b);
  const diceSenal = f6b.errores.length === 1 && /entrar con señal/.test(f6b.errores[0]) && !/CorexOn/.test(f6b.errores[0]) && f6b.eliminadas.length === 0;
  const subidas6b = f6b.subidas; await f6b.otra();
  const suspende6b = f6b.subidas === subidas6b && f6b.errores.length === 1;
  o6b.sinSesion = false; o6b.rechazarTodo = true; await f6b.otra();       // ya con sesion, un rechazo DISTINTO
  const distintoVisible = f6b.errores.length === 2 && /CorexOn/.test(f6b.errores[1]);
  console.log('6) Sin sesion           → con la sesion en camino: ' + (enCamino ? 'no avisa, se queda' : 'AVISA') + (suspende6a ? ', no reintenta ✓' : ', REINTENTA (sube fotos) ✗') +
    ' · sin forma de abrirla: ' + (diceSenal ? 'dice que entre con señal, se queda' : (f6b.errores[0] || 'sin aviso')) + (suspende6b ? ', no reintenta ✓' : ', REINTENTA ✗') +
    ' · rechazo distinto despues: ' + (distintoVisible ? 'se ve ✓' : 'TAPADO ✗') + ' · en camino 3 vueltas: ' + (conTope ? 'avisa una vez ✓' : f6a.errores.length + ' avisos ✗'));
  chequear(enCamino, 'con la sesion de quien entro sin señal en camino, el rechazo avisa al tecnico de un problema que se arregla solo (revisor, obs. 1)');
  chequear(diceSenal, 'sin sesion el aviso no dice que hay que entrar con señal (dice avisar a CorexOn), o la OT salio de la cola');
  chequear(suspende6a && suspende6b, 'sin sesion se sigue reintentando (y subiendo fotos) en cada vuelta (Codex, ronda 4)');
  chequear(distintoVisible, 'el aviso de "falta entrar con señal" tapo un rechazo distinto que llego despues, con sesion (Codex, ronda 4)');
  chequear(conTope, 'con la sesion "en camino" que nunca se abre, el tecnico no recibe ningun aviso tras 3 vueltas con señal (revisor, ronda 4)');

  // 7. Dos corridas a la vez
  const g7 = await correr({}, otCola(), { concurrentes: true });
  const sets7 = g7.escrituras.filter(w => w.id === 'cli_1' && !w.rechazada && w.campos.indexOf('firmada') >= 0).length;
  console.log('7) Dos a la vez         → fotos subidas: ' + g7.subidas + (g7.subidas === 3 ? ' ✓' : ' ✗') + ' · hojas escritas: ' + sets7 + (sets7 === 1 ? ' ✓' : ' ✗') +
    ' · la segunda: ' + (g7.eliminadas.length >= 1 ? 'corre despues y la ve arriba ✓' : 'NO CORRIO ✗'));
  chequear(g7.subidas === 3 && sets7 === 1, 'dos corridas a la vez de la cola subieron y escribieron la misma OT dos veces (Codex, ronda 4)');
  chequear(g7.eliminadas.length >= 1, 'con dos corridas a la vez, la OT no salio de la cola');

  // 8. Guardian del candado
  const h8 = await correr({}, otCola(), { antes: fn => { fn._corriendo = true; fn._desde = Date.now() - 16 * 60000; } });
  const h8b = await correr({}, otCola(), { antes: fn => { fn._corriendo = true; fn._desde = Date.now(); } });
  console.log('8) Guardian             → candado de hace 16 min: ' + (h8.subidas === 3 && h8.eliminadas.length === 1 ? 'se libera y la cola corre ✓' : 'LA COLA SIGUE TRABADA ✗') +
    ' · candado recien tomado: ' + (h8b.subidas === 0 ? 'sigue frenando ✓' : 'NO FRENA ✗'));
  chequear(h8.subidas === 3 && h8.eliminadas.length === 1, 'una corrida colgada deja la cola trabada para siempre (sin guardian) (Codex, ronda 5)');
  chequear(h8b.subidas === 0, 'el guardian libera un candado recien tomado: dos corridas a la vez otra vez');

  // 9. La corrida vieja despierta tarde
  let soltar; const o9 = { sinReglas: true, manual: true, compuerta: new Promise(res => { soltar = res; }) };
  const k = await correr({}, otCola(), o9);
  const vieja = k.silencio(k.fn);                                   // se duerme en su primera subida
  await new Promise(res => setTimeout(res, 20));
  k.fn._desde = Date.now() - 16 * 60000;                            // reloj del guardian: pasaron 16 min
  await k.silencio(k.fn);                                           // la nueva entra, sube y escribe la OT
  const nuevaEscribio = !!(k.docs.cli_1 && k.docs.cli_1.firmada === true);
  k.docs.cli_1.descripcionTrabajo = 'corregido por el administrador';  // correccion posterior
  const escriturasAntes = k.escrituras.length, subidasAntes = k.subidas;
  soltar(); await vieja;                                            // la vieja despierta
  const escribioLaVieja = k.escrituras.length - escriturasAntes;
  const subioLaVieja = k.subidas - subidasAntes;                    // 1 = solo la que tenia en vuelo
  const correccionIntacta = k.docs.cli_1.descripcionTrabajo === 'corregido por el administrador';
  console.log('9) Corrida vieja tarde  → la nueva: ' + (nuevaEscribio ? 'subio la OT ✓' : 'NO ✗') + ' · la vieja al despertar: ' +
    (escribioLaVieja === 0 ? 'no escribe ✓' : escribioLaVieja + ' escrituras ✗') + ' · la correccion: ' + (correccionIntacta ? 'intacta ✓' : 'PISADA ✗') +
    ' · fotos que siguio subiendo: ' + (subioLaVieja <= 1 ? 'ninguna mas ✓' : (subioLaVieja - 1) + ' ✗'));
  chequear(nuevaEscribio, 'la corrida nueva (por el guardian) no subio la OT');
  chequear(escribioLaVieja === 0 && correccionIntacta, 'la corrida vieja que el guardian dejo atras escribio al despertar y piso una correccion posterior (Codex, ronda 6)');
  chequear(subioLaVieja <= 1, 'la corrida vieja que el guardian dejo atras siguio subiendo fotos a Cloudinary al despertar (Codex, ronda 7)');

  // 10. La corrida vieja despierta tarde en la subida del PDF
  let soltar10; const o10 = { sinReglas: true, manual: true, compuertaPDF: new Promise(res => { soltar10 = res; }) };
  const q = await correr({}, otCola(), o10);
  const vieja10 = q.silencio(q.fn);                                 // sube fotos, escribe la OT y se duerme en el PDF
  await new Promise(res => setTimeout(res, 20));
  const laViejaLlegoAlPDF = !!(q.docs.cli_1 && q.docs.cli_1.firmada === true) && !q.docs.cli_1.pdfUrlCloudinary;
  q.fn._desde = Date.now() - 16 * 60000;                            // reloj del guardian: pasaron 16 min
  await q.silencio(q.fn);                                           // la nueva la ve arriba y completa el enlace
  const nuevaEnlazo = !!(q.docs.cli_1 && q.docs.cli_1.pdfUrlCloudinary);
  q.docs.cli_1.pdfUrlCloudinary = 'https://res.cloudinary.com/x/hoja_v2.pdf';   // el administrador corrige la hoja
  const escrituras10 = q.escrituras.length, encolados10 = q.encolados;
  soltar10(); await vieja10;                                        // la vieja despierta con su PDF
  const escribio10 = q.escrituras.length - escrituras10, encolo10 = q.encolados - encolados10;
  const enlaceIntacto = q.docs.cli_1.pdfUrlCloudinary === 'https://res.cloudinary.com/x/hoja_v2.pdf';
  console.log('10) Vieja en el PDF     → llego al PDF: ' + (laViejaLlegoAlPDF ? 'si (control) ✓' : 'NO ✗') + ' · la nueva: ' + (nuevaEnlazo ? 'enlazo ✓' : 'NO ✗') +
    ' · la vieja al despertar: ' + (escribio10 + encolo10 === 0 ? 'no escribe ni encola ✓' : escribio10 + ' escrituras y ' + encolo10 + ' encolados ✗') +
    ' · el enlace corregido: ' + (enlaceIntacto ? 'intacto ✓' : 'PISADO ✗'));
  chequear(laViejaLlegoAlPDF && nuevaEnlazo, 'el tramo 10 no llego a la ventana que mide (la vieja no se durmio en el PDF o la nueva no enlazo)');
  chequear(escribio10 + encolo10 === 0 && enlaceIntacto, 'la corrida vieja dormida en la subida del PDF escribio el enlace al despertar y piso el corregido (Codex, ronda 7)');

  // 11. Sacar la OT de la cola despues de esperar a IndexedDB
  const i11 = src.indexOf('async function _eliminarOTPendiente(');
  const j11 = i11 >= 0 ? src.indexOf('\n}\n', i11) : -1;
  chequear(i11 >= 0 && j11 > i11, 'no se encontro _eliminarOTPendiente (¿se renombro?)');
  if (i11 >= 0 && j11 > i11) {
    const borrados = [];
    const dbFalsa = { transaction: () => { const tx = { objectStore: () => ({ delete: id => { borrados.push(id); setTimeout(() => tx.oncomplete && tx.oncomplete(), 0); } }) }; return tx; } };
    const eliminar = new Function('_abrirDBOffline', src.slice(i11, j11 + 2) + '\nreturn _eliminarOTPendiente;')(async () => dbFalsa);
    let vigente = true;
    const r11a = await eliminar(41, () => vigente);                 // sigue siendo la vigente: borra
    vigente = false;
    const r11b = await eliminar(42, () => vigente);                 // dejo de serlo mientras abria la base
    await eliminar(43);                                             // sin pregunta (el otro llamador): borra
    const pasaLaPregunta = /_eliminarOTPendiente\(ot\.id,\s*function\s*\(\)\s*\{\s*return yo\._turno === turno;\s*\}\)\)\s*===\s*false\)\s*return;/.test(src.slice(i, j));
    const ok11 = borrados.join(',') === '41,43' && r11b === false && r11a !== false;
    console.log('11) Borrar tras IndexedDB → vigente: ' + (borrados.indexOf(41) >= 0 ? 'borra ✓' : 'NO ✗') + ' · ya no vigente: ' +
      (borrados.indexOf(42) < 0 && r11b === false ? 'no borra, la OT se queda ✓' : 'BORRA ✗') + ' · sin pregunta: ' + (borrados.indexOf(43) >= 0 ? 'borra ✓' : 'NO ✗') +
      ' · la cola le pasa el turno: ' + (pasaLaPregunta ? 'si ✓' : 'NO ✗'));
    chequear(ok11, 'la corrida vieja saca la OT de la cola aunque deje de ser la vigente mientras espera a IndexedDB (Codex, ronda 7)');
    chequear(pasaLaPregunta, 'sincronizarOTsPendientes no le pasa el control de turno a _eliminarOTPendiente o no sale si no se borro');
  }

  terminar();
})().catch(e => { console.error('FALLA — la prueba se cayo:', e && e.message); process.exit(1); });

function terminar() {
  console.log('');
  if (fallos.length) { console.log('FALLA (' + fallos.length + '):'); fallos.forEach(f => console.log(f)); process.exit(1); }
  console.log('OK — si la hoja ya esta firmada arriba, el reintento no le reescribe nada: completa el enlace y sale de la cola.');
  process.exit(0);
}
