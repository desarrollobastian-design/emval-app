/* Prueba de tools/cuentas-auth.js contra los EMULADORES de Auth y Firestore (nada de produccion), con
   las correcciones de la revision de Codex del PR #64 (23-10-2026).

   Que se exige:
   1. Simular no escribe nada, avisa la clave quemada y sale con 2 si alguien quedaria sin cuenta.
   2. Ejecutar sin --autorizar: crea al tecnico nuevo con SU PIN de siempre; una cuenta que YA existe
      no se toca (sigue deshabilitada, con sus datos y su clave: Codex P1-4); Administrador y
      Supervisor no se crean sin autorizacion (Codex P1-5); sale con 2 (Codex P2-9).
   3. La ficha del directorio queda con SOLO los campos permitidos aunque la vieja tuviera mas, y el
      respaldo no guarda esos valores, solo sus nombres (Codex P2-8).
   4. Con --autorizar: el Administrador conserva SU clave (en el emulador la autoprueba de la
      importacion falla siempre —no verifica hashes SHA-256—, asi que se prueba --clave-admin) y el
      Supervisor entra con su PIN; el de la clave quemada no recibe cuenta ni autorizado.
   5. Correrla otra vez no cambia ninguna cuenta.
   6. --deshacer con el respaldo de la corrida 2 borra lo que esa corrida creo y deja el directorio
      como estaba (sin los campos de mas).
   7. Modo emulador incompleto (un solo host, o un proyecto que no es demo-): se detiene antes de
      conectarse (Codex P2-10).
   8. Ni la salida ni los respaldos muestran un PIN, una clave o un hash.

   Uso (desde tests/reglas, con Java 21 en el PATH y `npm --prefix ../../tools install` hecho):
     npm run cuentas
   Sale 0 si todo se cumple; 1 si no. */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..', '..');
const HERRAMIENTA = path.join(RAIZ, 'tools', 'cuentas-auth.js');
const NM = path.join(RAIZ, 'tools', 'node_modules');
const { initializeApp } = require(path.join(NM, 'firebase-admin', 'lib', 'app'));
const { getFirestore } = require(path.join(NM, 'firebase-admin', 'lib', 'firestore'));
const { getAuth } = require(path.join(NM, 'firebase-admin', 'lib', 'auth'));
const { _claveFirebaseDePin, _correoDeCuenta, hashDeLaClaveQuemada } = require(HERRAMIENTA);
// Lo que puede tener una ficha publica: lo fija la PRUEBA, no lo que declare la herramienta.
const CAMPOS_FICHA = ['nombre', 'cargo', 'letra', 'correo', 'activo', 'actualizadoEn'];

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); return !!ok; }
const sha = t => crypto.createHash('sha256').update(t).digest('hex');

// Valores SOLO de prueba (no son de nadie).
const PIN_A = '4821', PIN_B = '7305', PIN_S = '6190';
const CLAVE_ADMIN = 'clave-solo-de-prueba-admin', CLAVE_VIEJA_B = 'clave-vieja-de-beto';
const SECRETOS = [PIN_A, PIN_B, PIN_S, CLAVE_ADMIN, CLAVE_VIEJA_B, sha(CLAVE_ADMIN), 'nota-secreta-de-prueba'];
const UID = { a: 'tecA0000000000000001', b: 'tecB0000000000000002', c: 'tecC0000000000000003',
  p: 'admP0000000000000004', q: 'admQ0000000000000005', s: 'supS0000000000000006' };
const DIR_RESP = path.join(RAIZ, 'tools', 'respaldos');

async function entra(uid, clave) {
  const r = await fetch('http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST +
    '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=x', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: _correoDeCuenta(uid), password: clave, returnSecureToken: true })
  });
  return r.ok;
}
const salidas = [];
function correr(extra, opciones) {
  opciones = opciones || {};
  const env = Object.assign({}, process.env, { EMVAL_CONFIRMAR_CUENTAS: opciones.confirmar || 'CREAR CUENTAS', GCLOUD_PROJECT: 'demo-emval' }, opciones.env || {});
  if (opciones.claveAdmin) env.EMVAL_CLAVE_ADMIN_PRUEBA = opciones.claveAdmin;
  (opciones.sacar || []).forEach(k => delete env[k]);
  const r = spawnSync('node', [HERRAMIENTA].concat(extra), { cwd: RAIZ, env, encoding: 'utf8' });
  const salida = (r.stdout || '') + (r.stderr || '');
  salidas.push(salida);
  return { status: r.status, salida };
}
const respaldos = () => fs.existsSync(DIR_RESP) ? fs.readdirSync(DIR_RESP).filter(f => f.startsWith('cuentas-auth-antes-')).sort() : [];

(async () => {
  chequear(!!process.env.FIREBASE_AUTH_EMULATOR_HOST && !!process.env.FIRESTORE_EMULATOR_HOST, 'faltan los emuladores (correr con emulators:exec)');
  const quemado = hashDeLaClaveQuemada();
  chequear(!!quemado, 'la herramienta no logra sacar la clave quemada del historial');
  fs.rmSync(DIR_RESP, { recursive: true, force: true });

  initializeApp({ projectId: 'demo-emval' });
  const db = getFirestore(), auth = getAuth();
  const cuenta = async uid => { try { return await auth.getUser(uid); } catch (e) { return null; } };
  await db.doc('tecnicos/' + UID.a).set({ nombre: 'Ana Prueba', cargo: 'Tecnico en terreno', pin: PIN_A, letra: 'A' });
  await db.doc('tecnicos/' + UID.b).set({ nombre: 'Beto Prueba', cargo: 'Tecnico en terreno', pin: PIN_B, letra: 'B' });
  await db.doc('tecnicos/' + UID.c).set({ nombre: 'Ciro SinPin', cargo: 'Tecnico en terreno', letra: 'C' });
  await db.doc('tecnicos/' + UID.p).set({ nombre: 'Pedro Prueba', cargo: 'Administrador', pin: '0000', passwordHash: sha(CLAVE_ADMIN), letra: 'P' });
  await db.doc('tecnicos/' + UID.q).set({ nombre: 'Quemado Prueba', cargo: 'Administrador', passwordHash: quemado || 'x', letra: 'Q' });
  await db.doc('tecnicos/' + UID.s).set({ nombre: 'Sara Prueba', cargo: 'Supervisor', pin: PIN_S, letra: 'S' });
  // Beto ya tiene cuenta: DESHABILITADA, con un dato propio y otra clave. No se puede tocar.
  await auth.createUser({ uid: UID.b, email: _correoDeCuenta(UID.b), password: CLAVE_VIEJA_B, displayName: 'Beto (cuenta vieja)', disabled: true });
  await auth.setCustomUserClaims(UID.b, { marca: 'no-tocar' });
  const betoAntes = (await cuenta(UID.b)).toJSON();
  // La ficha vieja de Ana trae campos que no van en un directorio publico.
  await db.doc('directorio/' + UID.a).set({ nombre: 'Ana Vieja', cargo: 'Tecnico en terreno', letra: 'A', activo: true, pin: PIN_A, notaInterna: 'nota-secreta-de-prueba' });

  // 1. Simulacion
  const sim = correr([]);
  const fichas0 = (await db.collection('directorio').get()).size;
  console.log('1) Simulacion   → exit ' + sim.status + (sim.status === 2 ? ' ✓' : ' ✗') + ', nadie creado: ' + (!(await cuenta(UID.a)) && fichas0 === 1 ? '✓' : '✗') +
    ', clave quemada: ' + (/CLAVE QUEMADA/.test(sim.salida) ? 'avisa ✓' : 'NO AVISA ✗'));
  chequear(sim.status === 2, 'la simulacion con gente que quedaria sin cuenta no sale con 2 (sale ' + sim.status + ')');
  chequear(!(await cuenta(UID.a)) && fichas0 === 1, 'la simulacion escribio');
  chequear(/CLAVE QUEMADA/.test(sim.salida), 'la simulacion no avisa del Administrador con la clave quemada');

  // 2. Ejecutar sin autorizar a nadie
  const ej = correr(['--ejecutar']);
  const respaldo2 = respaldos().slice(-1)[0];
  const ana = await entra(UID.a, _claveFirebaseDePin(PIN_A));
  const betoDespues = (await cuenta(UID.b)).toJSON();
  const betoIntacto = betoDespues.disabled === true && JSON.stringify(betoDespues.customClaims) === JSON.stringify(betoAntes.customClaims) &&
    betoDespues.displayName === betoAntes.displayName && betoDespues.passwordHash === betoAntes.passwordHash;
  const sinPrivilegiados = !(await cuenta(UID.p)) && !(await cuenta(UID.s));
  console.log('2) Ejecutar     → exit ' + ej.status + (ej.status === 2 ? ' ✓' : ' ✗') + ' · Ana con su PIN: ' + (ana ? 'entra ✓' : 'NO ✗') +
    ' · Beto (ya existia, deshabilitado): ' + (betoIntacto ? 'intacto ✓' : 'LO TOCO ✗') + ' · Admin/Supervisor sin autorizar: ' + (sinPrivilegiados ? 'sin cuenta ✓' : 'CREADOS ✗'));
  chequear(ej.status === 2, 'quedo gente sin cuenta y la herramienta salio con ' + ej.status + ' (Codex P2-9)');
  chequear(ana, 'el tecnico nuevo no entra con la clave que sale de su PIN');
  chequear(betoIntacto, 'una cuenta que ya existia fue modificada o reactivada (Codex P1-4)');
  chequear(sinPrivilegiados, 'se creo un Administrador o Supervisor sin --autorizar (Codex P1-5)');

  // 3. Ficha limpia y respaldo sin valores de mas
  const fichaAna = (await db.doc('directorio/' + UID.a).get()).data() || {};
  const fichaBeto = (await db.doc('directorio/' + UID.b).get()).data() || {};
  const soloPermitidos = Object.keys(fichaAna).every(k => CAMPOS_FICHA.includes(k)) && fichaAna.nombre === 'Ana Prueba';
  const resp2 = respaldo2 ? JSON.parse(fs.readFileSync(path.join(DIR_RESP, respaldo2), 'utf8')) : {};
  const fichaRespAna = (resp2.directorio || []).find(f => f.id === UID.a) || {};
  console.log('3) Ficha limpia → Ana: ' + (soloPermitidos ? 'solo campos permitidos ✓' : 'CAMPOS DE MAS: ' + Object.keys(fichaAna).join(',') + ' ✗') +
    ' · Beto deshabilitado: ' + (fichaBeto.activo === false ? 'ficha inactiva ✓' : 'FICHA ACTIVA ✗') +
    ' · respaldo: ' + (JSON.stringify(fichaRespAna.camposQuitados || []) === JSON.stringify(['pin', 'notaInterna']) ? 'nombra los campos quitados, sin valores ✓' : 'NO ✗'));
  chequear(soloPermitidos, 'la ficha conservo campos que no van en un directorio publico (Codex P2-8)');
  chequear(fichaBeto.activo === false, 'la ficha de una cuenta deshabilitada quedo activa');
  chequear(JSON.stringify(fichaRespAna.camposQuitados || []) === JSON.stringify(['pin', 'notaInterna']), 'el respaldo no dice que campos se quitaron de la ficha');

  // 4. Autorizando al Administrador y a la Supervisora
  const aut = correr(['--ejecutar', '--autorizar', UID.p + ',' + UID.s + ',' + UID.q, '--clave-admin'], { claveAdmin: CLAVE_ADMIN });
  const pOk = await entra(UID.p, CLAVE_ADMIN), pOtra = await entra(UID.p, 'otra-clave-cualquiera');
  const sOk = await entra(UID.s, _claveFirebaseDePin(PIN_S));
  const qCuenta = !!(await cuenta(UID.q));
  console.log('4) Autorizados  → Pedro con SU clave: ' + (pOk && !pOtra ? 'entra (y no con otra) ✓' : 'NO ✗') + ' · Sara con su PIN: ' + (sOk ? 'entra ✓' : 'NO ✗') +
    ' · clave quemada aun autorizado: ' + (qCuenta ? 'TIENE CUENTA ✗' : 'sin cuenta ✓') + ' · exit ' + aut.status + (aut.status === 2 ? ' (quedan Ciro y el quemado) ✓' : ' ✗'));
  chequear(pOk && !pOtra, 'el Administrador autorizado no quedo con su misma clave (y solo con ella)');
  chequear(sOk, 'la Supervisora autorizada no entra con su PIN');
  chequear(!qCuenta, 'el Administrador con la clave quemada recibio cuenta por estar autorizado');
  chequear(aut.status === 2, 'quedando gente sin cuenta, salio con ' + aut.status);

  // 5. Otra vez: nada cambia en las cuentas
  const foto = async () => JSON.stringify(await Promise.all(Object.values(UID).map(async u => { const c = await cuenta(u); return c ? [u, c.disabled, c.passwordHash, JSON.stringify(c.customClaims || {})] : [u, null]; })));
  const f1 = await foto();
  const otra = correr(['--ejecutar', '--autorizar', UID.p + ',' + UID.s, '--clave-admin'], { claveAdmin: CLAVE_ADMIN });
  const f2 = await foto();
  console.log('5) Otra vez     → cuentas: ' + (f1 === f2 ? 'iguales ✓' : 'CAMBIARON ✗') + ' (exit ' + otra.status + ')');
  chequear(f1 === f2, 'correrla otra vez cambio cuentas que ya existian');

  // 6. Deshacer la corrida 2
  const des = correr(['--deshacer', path.join(DIR_RESP, respaldo2 || 'x')], { confirmar: 'DESHACER' });
  const anaBorrada = !(await cuenta(UID.a));
  const fichaAnaRest = (await db.doc('directorio/' + UID.a).get()).data() || {};
  const betoSigue = !!(await cuenta(UID.b));
  const fichaBetoBorrada = !(await db.doc('directorio/' + UID.b).get()).exists;
  console.log('6) Deshacer     → exit ' + des.status + ' · cuenta de Ana (la creo esa corrida): ' + (anaBorrada ? 'borrada ✓' : 'SIGUE ✗') +
    ' · ficha de Ana: ' + (fichaAnaRest.nombre === 'Ana Vieja' && !('pin' in fichaAnaRest) ? 'la de antes, sin campos de mas ✓' : 'NO ✗') +
    ' · cuenta de Beto (no la creo): ' + (betoSigue ? 'sigue ✓' : 'BORRADA ✗') + ' · ficha de Beto (la creo): ' + (fichaBetoBorrada ? 'borrada ✓' : 'SIGUE ✗'));
  chequear(des.status === 0 && anaBorrada && betoSigue, '--deshacer no borro lo que creo esa corrida, o borro algo que no creo');
  chequear(fichaAnaRest.nombre === 'Ana Vieja' && !('pin' in fichaAnaRest) && fichaBetoBorrada, '--deshacer no dejo el directorio como estaba');

  // 7. Modo emulador incompleto
  const g1 = correr([], { sacar: ['FIREBASE_AUTH_EMULATOR_HOST'] });
  const g2 = correr([], { env: { GCLOUD_PROJECT: 'emval-app' } });
  console.log('7) Emulador     → un solo host: ' + (g1.status === 1 && /incompleto/.test(g1.salida) ? 'se detiene ✓' : 'SIGUE ✗') +
    ' · proyecto real: ' + (g2.status === 1 && /demo-/.test(g2.salida) ? 'se detiene ✓' : 'SIGUE ✗'));
  chequear(g1.status === 1 && /incompleto/.test(g1.salida), 'con un solo host de emulador la herramienta siguio (el otro servicio iria a produccion)');
  chequear(g2.status === 1 && /demo-/.test(g2.salida), 'en modo emulador con un proyecto real la herramienta siguio');

  // 8. Sin secretos
  const textoResp = respaldos().map(f => fs.readFileSync(path.join(DIR_RESP, f), 'utf8')).join('\n');
  const fuga = SECRETOS.concat([quemado || '¬']).filter(s => (salidas.join('\n') + textoResp).includes(s));
  console.log('8) Sin secretos → salida y respaldos: ' + (fuga.length ? fuga.length + ' FUGAS ✗' : 'ninguno ✓'));
  chequear(fuga.length === 0, 'la salida o un respaldo muestran un PIN, una clave o un hash (' + fuga.length + ')');

  console.log('');
  if (fallos.length) { console.log('FALLA (' + fallos.length + '):'); fallos.forEach(f => console.log(f)); process.exit(1); }
  console.log('OK — crea solo lo que falta, con el PIN y la clave de siempre; lo existente no se toca; se puede deshacer.');
  process.exit(0);
})().catch(e => { console.error('FALLA — la prueba se cayo:', e && (e.code || e.message)); process.exit(1); });
