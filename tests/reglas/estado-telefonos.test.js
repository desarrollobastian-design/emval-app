/* Prueba de tools/estado-telefonos.js contra el EMULADOR de Firestore (nada de produccion).

   Que se exige:
   1. Cada telefono sale con el estado correcto: LISTO, VERSION VIEJA (reporte sin `auth`), SIN SESION,
      CON COLA (OT, pausadas o correos sin subir), SIN NOTICIAS (no reporta hace mas de 3 dias) y
      OLVIDADO (mas de 30 dias: aparte, no cuenta).
   2. Con UN telefono no listo, la respuesta es "todavia NO" y sale con 2.
   3. Con todos los activos listos, la respuesta es "se pueden publicar" y sale con 0.
   4. La herramienta no escribe nada: `alertas` queda igual, documento por documento.

   Uso (desde tests/reglas, con Java 21 en el PATH y `npm --prefix ../../tools install` hecho):
     npx firebase emulators:exec --only firestore --project demo-emval "node estado-telefonos.test.js"
   Sale 0 si todo se cumple; 1 si no. */

const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..', '..');
const HERRAMIENTA = path.join(RAIZ, 'tools', 'estado-telefonos.js');
const NM = path.join(RAIZ, 'tools', 'node_modules');
const { initializeApp } = require(path.join(NM, 'firebase-admin', 'lib', 'app'));
const { getFirestore, Timestamp } = require(path.join(NM, 'firebase-admin', 'lib', 'firestore'));

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); return !!ok; }
const hace = h => Timestamp.fromMillis(Date.now() - h * 3600000);
function correr() {
  const r = spawnSync('node', [HERRAMIENTA], { cwd: RAIZ, encoding: 'utf8',
    env: Object.assign({}, process.env, { GCLOUD_PROJECT: 'demo-emval' }) });
  return { status: r.status, salida: (r.stdout || '') + (r.stderr || '') };
}
const lineaDe = (salida, usuario) => (salida.split('\n').find(l => l.includes(usuario)) || '').trim();

(async () => {
  initializeApp({ projectId: 'demo-emval' });
  const db = getFirestore();
  const auth = (sesion) => ({ etapa: 1, sesion, uid: sesion ? 'u_x' : '' });
  const reportes = {
    'pausadas_dev_listo':  { tipo: 'pausadas', usuario: 'Ana Prueba', auth: auth(true), otsPendientes: 0, items: [], actualizadoEn: hace(2) },
    'correos_dev_listo':   { tipo: 'correos', usuario: 'Ana Prueba', pendientes: 0, actualizadoEn: hace(2) },
    'pausadas_dev_viejo':  { tipo: 'pausadas', usuario: 'Beto Prueba', items: [], actualizadoEn: hace(5) },
    'pausadas_dev_sinses': { tipo: 'pausadas', usuario: 'Ciro Prueba', auth: auth(false), otsPendientes: 0, items: [], actualizadoEn: hace(1) },
    'pausadas_dev_cola':   { tipo: 'pausadas', usuario: 'Dora Prueba', auth: auth(true), otsPendientes: 1, items: [{ numero: '1', pendienteSync: true }], actualizadoEn: hace(1) },
    'correos_dev_cola':    { tipo: 'correos', usuario: 'Dora Prueba', pendientes: 2, actualizadoEn: hace(1) },
    'pausadas_dev_mudo':   { tipo: 'pausadas', usuario: 'Eva Prueba', auth: auth(true), otsPendientes: 0, items: [], actualizadoEn: hace(24 * 5) },
    'pausadas_dev_olvido': { tipo: 'pausadas', usuario: 'Fito Prueba', items: [], actualizadoEn: hace(24 * 40) },
    'descartes_pausadas':  { items: [] }   // otro documento de alertas: no es un telefono
  };
  for (const [id, d] of Object.entries(reportes)) await db.doc('alertas/' + id).set(d);
  const foto = async () => JSON.stringify((await db.collection('alertas').get()).docs.map(d => [d.id, d.data()]).sort());
  const antes = await foto();

  // 1 y 2. Un telefono de cada estado
  const r = correr();
  const esperado = { 'Ana Prueba': 'LISTO', 'Beto Prueba': 'VERSION VIEJA', 'Ciro Prueba': 'SIN SESION',
    'Dora Prueba': 'CON COLA', 'Eva Prueba': 'SIN NOTICIAS', 'Fito Prueba': 'OLVIDADO' };
  const mal = Object.entries(esperado).filter(([u, e]) => !lineaDe(r.salida, u).startsWith(e));
  const dora = lineaDe(r.salida, 'Dora Prueba');
  console.log('1) Estados      → ' + (mal.length ? mal.map(([u, e]) => u + ' deberia ser ' + e + ' ✗').join('; ') : '6 telefonos, cada uno con su estado ✓') +
    (/1 OT/.test(dora) && /1 pausadas/.test(dora) && /2 correos/.test(dora) ? ', la cola dice que hay ✓' : ', LA COLA NO DICE QUE HAY ✗'));
  chequear(mal.length === 0, 'estados mal asignados: ' + mal.map(m => m[0]).join(', '));
  chequear(/1 OT/.test(dora) && /1 pausadas/.test(dora) && /2 correos/.test(dora), 'el telefono con cola no detalla que tiene sin subir');
  console.log('2) Veredicto    → ' + (r.status === 2 && /Todavia NO/.test(r.salida) ? '"todavia NO", exit 2 ✓' : 'exit ' + r.status + ' ✗'));
  chequear(r.status === 2 && /Todavia NO/.test(r.salida), 'con telefonos no listos no dice "todavia NO" o no sale con 2');
  chequear(!/descartes/.test(r.salida), 'trato descartes_pausadas como si fuera un telefono');

  // 4. No escribe
  const despues = await foto();
  console.log('4) Solo lectura → ' + (antes === despues ? 'alertas queda igual ✓' : 'CAMBIO ALGO ✗'));
  chequear(antes === despues, 'la herramienta escribio en alertas');

  // 3. Todos los activos listos
  for (const id of ['pausadas_dev_viejo', 'pausadas_dev_sinses', 'pausadas_dev_cola', 'correos_dev_cola', 'pausadas_dev_mudo']) await db.doc('alertas/' + id).delete();
  const r2 = correr();
  console.log('3) Todos listos → ' + (r2.status === 0 && /se pueden publicar/.test(r2.salida) ? '"se pueden publicar", exit 0 ✓' : 'exit ' + r2.status + ' ✗') +
    (/Fito Prueba/.test(r2.salida) ? ' (el olvidado se lista aparte ✓)' : ''));
  chequear(r2.status === 0 && /se pueden publicar/.test(r2.salida), 'con todos los activos listos no da luz verde');

  console.log('');
  if (fallos.length) { console.log('FALLA (' + fallos.length + '):'); fallos.forEach(f => console.log(f)); process.exit(1); }
  console.log('OK — la herramienta dice telefono por telefono si se pueden publicar las reglas, y no escribe nada.');
  process.exit(0);
})().catch(e => { console.error('FALLA — la prueba se cayo:', e && (e.code || e.message)); process.exit(1); });
