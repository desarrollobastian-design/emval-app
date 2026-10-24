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
function crearNube(docs) {
  const escrituras = [];
  let ts = 0;
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function revisar(id, nuevo) {
    const prev = docs[id];
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
    get: async () => {
      const d = docs[id] ? JSON.parse(JSON.stringify(docs[id])) : undefined;
      const pendiente = !!(d && d.__pendiente); if (d) delete d.__pendiente;
      return { exists: !!d, data: () => d, metadata: { hasPendingWrites: pendiente } };
    },
    set: async (d, op) => { revisar(id, d); escrituras.push({ id, campos: Object.keys(d) }); docs[id] = Object.assign(op && op.merge ? (docs[id] || {}) : {}, d); },
    update: async d => {
      if (!docs[id]) throw Object.assign(new Error('no existe'), { code: 'not-found' });
      revisar(id, d); escrituras.push({ id, campos: Object.keys(d) }); Object.assign(docs[id], d);
    }
  });
  const fs_ = { collection: col => ({ doc: id => ref(col, id), add: async d => { const id = 'auto' + (++ts); docs[id] = d; return { id }; } }) };
  const firestore = () => fs_;
  firestore.FieldValue = { serverTimestamp: () => ({ ts: ++ts }) };
  return { firebase: { firestore }, escrituras, docs };
}

async function correr(docs, ot) {
  const nube = crearNube(docs);
  const r = { subidas: 0, pdfs: 0, eliminadas: [], errores: [], avisos: [], vinculos: 0 };
  const window = { firebase: nube.firebase, _firebaseReady: true };
  const deps = {
    navigator: { onLine: true }, window, document: { getElementById: () => null },
    _obtenerOTsPendientes: async () => [ot],
    toast: () => {}, actualizarIndicadorPendientes: () => {},
    subirCloudinary: async (b, n, nombre) => { r.subidas++; return 'https://res.cloudinary.com/x/nueva_' + nombre; },
    _subirPDFaCloudinary: async () => { r.pdfs++; return 'https://res.cloudinary.com/x/hoja_nueva.pdf'; },
    _vincularCotizacionRealizada: async () => { r.vinculos++; },
    _enviarCorreo: async p => { r.avisos.push(p.pdf_url); },
    _eliminarOTPendiente: async id => { r.eliminadas.push(id); },
    _notificarOTCompletada: async () => {},
    _error: (que, e, msg) => { r.errores.push(String(msg || que)); },
    _encolarEnlacePDF: () => {},
    _normTipo: t => t, _tecnicoActual: () => 'Tomas Prueba', _conTimeout: p => p,
    _numOTCorreo: n => String(n), _urlPDFVista: u => u, _nombrePDFHoja: () => 'HS',
    _uidSesionFirebase: () => 'u_tec'
  };
  const nombres = Object.keys(deps);
  const fn = new Function(...nombres, src.slice(i, j) + '\nreturn sincronizarOTsPendientes;')(...nombres.map(k => deps[k]));
  const _log = console.error, _warn = console.warn; console.error = () => {}; console.warn = () => {};
  try { await fn(); } finally { console.error = _log; console.warn = _warn; }
  return Object.assign(r, { escrituras: nube.escrituras, docs: nube.docs });
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

  terminar();
})().catch(e => { console.error('FALLA — la prueba se cayo:', e && e.message); process.exit(1); });

function terminar() {
  console.log('');
  if (fallos.length) { console.log('FALLA (' + fallos.length + '):'); fallos.forEach(f => console.log(f)); process.exit(1); }
  console.log('OK — si la hoja ya esta firmada arriba, el reintento no le reescribe nada: completa el enlace y sale de la cola.');
  process.exit(0);
}
