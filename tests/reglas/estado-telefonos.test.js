/* Prueba de tools/estado-telefonos.js contra el EMULADOR de Firestore (nada de produccion).

   Que se exige:
   1. Cada telefono sale con el estado correcto: LISTO, VERSION VIEJA (reporte sin `auth`/`colas`),
      SIN SESION, CON COLA (cualquier cola > 0, o una que el telefono no pudo contar), SIN NOTICIAS (su
      reporte tiene mas de 3 dias) y OLVIDADO (mas de 30 dias: aparte, no cuenta).
   2. EL CASO DE CODEX (P2-7): un reporte del telefono de hace 10 dias con un reporte de correos de hoy
      sale SIN NOTICIAS, no LISTO: el correo reciente no refresca la sesion ni la cola.
   3. Un reporte de correos reciente con pendientes suma cola aunque el reporte principal diga 0.
   4. Con un telefono no listo: "todavia NO", exit 2. Con todos los activos listos: luz verde, exit 0.
   5. La herramienta no escribe nada.
   6. (Revision final de Codex, nuevo 5) Un reporte de formato viejo (solo `otsPendientes`) es VERSION
      VIEJA; `colas: {}` o sin alguna de las seis es REPORTE INCOMPLETO: nunca LISTO.
   7. Un telefono con el reporte principal de hace 40 dias pero correos de HOY no es OLVIDADO: sigue
      contando (SIN NOTICIAS) y bloquea la luz verde.

   Uso (desde tests/reglas, con Java 21 en el PATH y `npm --prefix ../../tools install` hecho):
     npm run estado
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
const vacias = { ots: 0, pausadas: 0, correos: 0, enlaces: 0, cierres: 0, bajas: 0 };

(async () => {
  initializeApp({ projectId: 'demo-emval' });
  const db = getFirestore();
  const auth = (sesion) => ({ etapa: 1, sesion, uid: sesion ? 'u_x' : '' });
  const reportes = {
    'pausadas_dev_listo':  { tipo: 'pausadas', usuario: 'Ana Prueba', auth: auth(true), colas: vacias, items: [], actualizadoEn: hace(2) },
    'pausadas_dev_viejo':  { tipo: 'pausadas', usuario: 'Beto Prueba', items: [], actualizadoEn: hace(5) },
    'pausadas_dev_sinses': { tipo: 'pausadas', usuario: 'Ciro Prueba', auth: auth(false), colas: vacias, items: [], actualizadoEn: hace(1) },
    'pausadas_dev_cola':   { tipo: 'pausadas', usuario: 'Dora Prueba', auth: auth(true), colas: Object.assign({}, vacias, { ots: 1, enlaces: 2 }), items: [], actualizadoEn: hace(1) },
    'pausadas_dev_mudo':   { tipo: 'pausadas', usuario: 'Eva Prueba', auth: auth(true), colas: vacias, items: [], actualizadoEn: hace(24 * 5) },
    'pausadas_dev_olvido': { tipo: 'pausadas', usuario: 'Fito Prueba', items: [], actualizadoEn: hace(24 * 40) },
    // El caso de Codex: reporte principal de hace 10 dias, reporte de correos de hoy.
    'pausadas_dev_codex':  { tipo: 'pausadas', usuario: 'Gabi Prueba', auth: auth(true), colas: vacias, items: [], actualizadoEn: hace(24 * 10) },
    'correos_dev_codex':   { tipo: 'correos', usuario: 'Gabi Prueba', pendientes: 0, actualizadoEn: hace(1) },
    // Reporte principal en 0, pero el de correos (reciente) dice que hay 3 sin salir.
    'pausadas_dev_correo': { tipo: 'pausadas', usuario: 'Hugo Prueba', auth: auth(true), colas: vacias, items: [], actualizadoEn: hace(1) },
    'correos_dev_correo':  { tipo: 'correos', usuario: 'Hugo Prueba', pendientes: 3, actualizadoEn: hace(1) },
    // Una cola que el telefono no pudo contar (null): no se sabe, no es "vacia".
    'pausadas_dev_nose':   { tipo: 'pausadas', usuario: 'Ines Prueba', auth: auth(true), colas: Object.assign({}, vacias, { bajas: null }), items: [], actualizadoEn: hace(1) },
    // Revision final de Codex (nuevo 5): reportes que no dicen sus seis colas.
    'pausadas_dev_formviejo': { tipo: 'pausadas', usuario: 'Jose Prueba', auth: auth(true), otsPendientes: 0, items: [], actualizadoEn: hace(1) },
    'pausadas_dev_vacio':  { tipo: 'pausadas', usuario: 'Kike Prueba', auth: auth(true), colas: {}, items: [], actualizadoEn: hace(1) },
    'pausadas_dev_falta':  { tipo: 'pausadas', usuario: 'Lola Prueba', auth: auth(true), colas: { ots: 0, pausadas: 0, correos: 0, enlaces: 0, cierres: 0 }, items: [], actualizadoEn: hace(1) },
    // Reporte principal de hace 40 dias, pero correos de hoy: el telefono sigue en uso.
    'pausadas_dev_reciente': { tipo: 'pausadas', usuario: 'Mario Prueba', auth: auth(true), colas: vacias, items: [], actualizadoEn: hace(24 * 40) },
    'correos_dev_reciente':  { tipo: 'correos', usuario: 'Mario Prueba', pendientes: 2, actualizadoEn: hace(1) },
    'descartes_pausadas':  { items: [] }   // otro documento de alertas: no es un telefono
  };
  for (const [id, d] of Object.entries(reportes)) await db.doc('alertas/' + id).set(d);
  const foto = async () => JSON.stringify((await db.collection('alertas').get()).docs.map(d => [d.id, d.data()]).sort());
  const antes = await foto();

  const r = correr();
  const esperado = { 'Ana Prueba': 'LISTO', 'Beto Prueba': 'VERSION VIEJA', 'Ciro Prueba': 'SIN SESION', 'Dora Prueba': 'CON COLA',
    'Eva Prueba': 'SIN NOTICIAS', 'Fito Prueba': 'OLVIDADO', 'Gabi Prueba': 'SIN NOTICIAS', 'Hugo Prueba': 'CON COLA', 'Ines Prueba': 'CON COLA',
    'Jose Prueba': 'VERSION VIEJA', 'Kike Prueba': 'REPORTE INCOMPLETO', 'Lola Prueba': 'REPORTE INCOMPLETO', 'Mario Prueba': 'SIN NOTICIAS' };
  const mal = Object.entries(esperado).filter(([u, e]) => !lineaDe(r.salida, u).startsWith(e));
  const dora = lineaDe(r.salida, 'Dora Prueba');
  console.log('1) Estados      → ' + (mal.length ? mal.map(([u, e]) => u + ' deberia ser ' + e + ' (es: ' + lineaDe(r.salida, u).slice(0, 18) + ') ✗').join('; ') : Object.keys(esperado).length + ' telefonos, cada uno con su estado ✓') +
    (/1 OT/.test(dora) && /2 enlaces/.test(dora) ? ', la cola dice que hay ✓' : ', LA COLA NO DICE QUE HAY ✗'));
  chequear(mal.length === 0, 'estados mal asignados: ' + mal.map(m => m[0]).join(', '));
  chequear(/1 OT/.test(dora) && /2 enlaces/.test(dora), 'el telefono con cola no detalla que tiene sin subir');
  console.log('2) Caso Codex   → reporte de hace 10 dias + correos de hoy: ' + (lineaDe(r.salida, 'Gabi Prueba').startsWith('SIN NOTICIAS') ? 'SIN NOTICIAS ✓' : 'LO DA POR LISTO ✗'));
  chequear(lineaDe(r.salida, 'Gabi Prueba').startsWith('SIN NOTICIAS'), 'un reporte de correos reciente hizo pasar por fresco un reporte viejo (Codex P2-7)');
  console.log('3) Correos      → el reporte de correos reciente con pendientes: ' + (lineaDe(r.salida, 'Hugo Prueba').startsWith('CON COLA') ? 'suma cola ✓' : 'NO ✗'));
  const noListo = u => !lineaDe(r.salida, u).startsWith('LISTO') && lineaDe(r.salida, u) !== '';
  console.log('6) Seis colas   → formato viejo: ' + (lineaDe(r.salida, 'Jose Prueba').startsWith('VERSION VIEJA') ? 'version vieja ✓' : 'LISTO ✗') +
    ' · colas {}: ' + (lineaDe(r.salida, 'Kike Prueba').startsWith('REPORTE INCOMPLETO') ? 'incompleto ✓' : 'LISTO ✗') +
    ' · sin bajas: ' + (lineaDe(r.salida, 'Lola Prueba').startsWith('REPORTE INCOMPLETO') ? 'incompleto ✓' : 'LISTO ✗'));
  chequear(noListo('Jose Prueba') && noListo('Kike Prueba') && noListo('Lola Prueba'), 'un reporte que no dice sus seis colas dio LISTO (Codex, nuevo 5)');
  const mario = lineaDe(r.salida, 'Mario Prueba');
  console.log('7) Reciente     → reporte de hace 40 dias + correos de hoy: ' + (mario.startsWith('SIN NOTICIAS') ? 'sigue contando, SIN NOTICIAS ✓' : (mario.slice(0, 18) || 'no aparece') + ' ✗'));
  chequear(mario.startsWith('SIN NOTICIAS'), 'un telefono con actividad de hoy quedo como OLVIDADO y no bloquea la luz verde (Codex, nuevo 5)');
  console.log('4) Veredicto    → ' + (r.status === 2 && /Todavia NO/.test(r.salida) ? '"todavia NO", exit 2 ✓' : 'exit ' + r.status + ' ✗'));
  chequear(r.status === 2 && /Todavia NO/.test(r.salida), 'con telefonos no listos no dice "todavia NO" o no sale con 2');
  chequear(!/descartes/.test(r.salida), 'trato descartes_pausadas como si fuera un telefono');

  const despues = await foto();
  console.log('5) Solo lectura → ' + (antes === despues ? 'alertas queda igual ✓' : 'CAMBIO ALGO ✗'));
  chequear(antes === despues, 'la herramienta escribio en alertas');

  for (const id of Object.keys(reportes).filter(k => k !== 'pausadas_dev_listo' && k !== 'pausadas_dev_olvido' && k !== 'descartes_pausadas')) await db.doc('alertas/' + id).delete();
  const r2 = correr();
  console.log('4b) Todos listos→ ' + (r2.status === 0 && /se pueden publicar/.test(r2.salida) ? '"se pueden publicar", exit 0 ✓' : 'exit ' + r2.status + ' ✗') +
    (/Fito Prueba/.test(r2.salida) ? ' (el olvidado se lista aparte ✓)' : ''));
  chequear(r2.status === 0 && /se pueden publicar/.test(r2.salida), 'con todos los activos listos no da luz verde');

  console.log('');
  if (fallos.length) { console.log('FALLA (' + fallos.length + '):'); fallos.forEach(f => console.log(f)); process.exit(1); }
  console.log('OK — la herramienta dice telefono por telefono si se pueden publicar las reglas, con la fecha de su propio reporte, y no escribe nada.');
  process.exit(0);
})().catch(e => { console.error('FALLA — la prueba se cayo:', e && (e.code || e.message)); process.exit(1); });
