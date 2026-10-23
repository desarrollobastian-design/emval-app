/* Prueba de tools/cuentas-auth.js contra los EMULADORES de Auth y Firestore (nada de produccion).

   Que se exige:
   1. Sin --ejecutar no escribe nada (ni cuentas ni directorio) y avisa del Administrador con la clave
      quemada (la del historial, sacada al correr y nunca impresa).
   2. Con --ejecutar: cada tecnico entra con la clave que sale de SU PIN (el PIN no cambia) y no con
      el de otro. El Administrador:
        - si la autoprueba de importacion SHA-256 pasa, entra con SU MISMA clave;
        - si no pasa, su cuenta NO se toca y la herramienta sale con 2 (ojo: el EMULADOR acepta importar
          hashes SHA-256 pero no los verifica al iniciar sesion — 🔬 23-10-2026 —, asi que aca la
          autoprueba falla siempre; en produccion es la autoprueba la que decide).
   3. --clave-admin: con una clave que no es la suya no hace nada; con la suya, entra con ESA clave.
   4. No reciben cuenta: el Administrador con la clave quemada y el tecnico sin PIN valido.
   5. El directorio, el respaldo y la salida no guardan ni muestran PIN, clave ni hash.
   6. Correrla dos veces no rompe nada.

   Uso (desde tests/reglas, con Java 21 en el PATH y `npm --prefix ../../tools install` hecho):
     npx firebase emulators:exec --only auth,firestore --project demo-emval "node cuentas-auth.test.js"
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

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); return !!ok; }
const sha = t => crypto.createHash('sha256').update(t).digest('hex');

// Valores SOLO de prueba (no son de nadie).
const PIN_A = '4821', PIN_B = '7305';
const CLAVE_ADMIN = 'clave-solo-de-prueba-admin';
const SECRETOS = [PIN_A, PIN_B, CLAVE_ADMIN, sha(CLAVE_ADMIN)];
const UID = { a: 'tecA0000000000000001', b: 'tecB0000000000000002', c: 'tecC0000000000000003', p: 'admP0000000000000004', q: 'admQ0000000000000005' };

async function entra(uid, clave) {
  const r = await fetch('http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST +
    '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=x', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: _correoDeCuenta(uid), password: clave, returnSecureToken: true })
  });
  return r.ok;
}
function correr(extra, claveAdmin) {
  const env = Object.assign({}, process.env, { EMVAL_CONFIRMAR_CUENTAS: 'CREAR CUENTAS', GCLOUD_PROJECT: 'demo-emval' });
  if (claveAdmin) env.EMVAL_CLAVE_ADMIN_PRUEBA = claveAdmin;
  const r = spawnSync('node', [HERRAMIENTA].concat(extra), { cwd: RAIZ, env, encoding: 'utf8' });
  return { status: r.status, salida: (r.stdout || '') + (r.stderr || '') };
}
const salidas = [];

(async () => {
  chequear(!!process.env.FIREBASE_AUTH_EMULATOR_HOST && !!process.env.FIRESTORE_EMULATOR_HOST, 'faltan los emuladores (correr con emulators:exec)');
  const quemado = hashDeLaClaveQuemada();
  chequear(!!quemado, 'la herramienta no logra sacar la clave quemada del historial');

  initializeApp({ projectId: 'demo-emval' });
  const db = getFirestore(), auth = getAuth();
  const existe = async uid => { try { await auth.getUser(uid); return true; } catch (e) { return false; } };
  await db.doc('tecnicos/' + UID.a).set({ nombre: 'Ana Prueba', cargo: 'Tecnico en terreno', pin: PIN_A, letra: 'A' });
  await db.doc('tecnicos/' + UID.b).set({ nombre: 'Beto Prueba', cargo: 'Tecnico en terreno', pin: PIN_B, letra: 'B' });
  await db.doc('tecnicos/' + UID.c).set({ nombre: 'Ciro SinPin', cargo: 'Tecnico en terreno', letra: 'C' });
  await db.doc('tecnicos/' + UID.p).set({ nombre: 'Pedro Prueba', cargo: 'Administrador', pin: '0000', passwordHash: sha(CLAVE_ADMIN), letra: 'P' });
  await db.doc('tecnicos/' + UID.q).set({ nombre: 'Quemado Prueba', cargo: 'Administrador', passwordHash: quemado || 'x', letra: 'Q' });

  // 1. Simulacion
  const sim = correr([]); salidas.push(sim.salida);
  const cuentas0 = (await auth.listUsers()).users.length, fichas0 = (await db.collection('directorio').get()).size;
  console.log('1) Simulacion   → exit ' + sim.status + ', cuentas ' + cuentas0 + ', fichas ' + fichas0 + (cuentas0 || fichas0 ? ' ✗' : ' ✓') +
    (/CLAVE QUEMADA/.test(sim.salida) ? ', avisa la clave quemada ✓' : ', NO AVISA LA CLAVE QUEMADA ✗'));
  chequear(sim.status === 0, 'la simulacion no termino bien: ' + sim.salida.slice(-300));
  chequear(cuentas0 === 0 && fichas0 === 0, 'la simulacion escribio (' + cuentas0 + ' cuentas, ' + fichas0 + ' fichas)');
  chequear(/CLAVE QUEMADA/.test(sim.salida), 'la simulacion no avisa del Administrador con la clave quemada');

  // 2. Ejecutar
  const ej = correr(['--ejecutar']); salidas.push(ej.salida);
  const autoOk = /Autoprueba de importacion SHA-256: OK/.test(ej.salida);
  const a = await entra(UID.a, _claveFirebaseDePin(PIN_A)), b = await entra(UID.b, _claveFirebaseDePin(PIN_B));
  const bMal = await entra(UID.b, _claveFirebaseDePin(PIN_A));
  const pTras = await existe(UID.p);
  const pEntra = pTras && await entra(UID.p, CLAVE_ADMIN);
  console.log('2) Ejecutar     → exit ' + ej.status + ' · tecnicos con su PIN: ' + (a && b ? 'entran ✓' : 'NO ENTRAN ✗') + ', con PIN ajeno: ' + (bMal ? 'ENTRA ✗' : 'no ✓') +
    ' · autoprueba ' + (autoOk ? 'OK → admin ' + (pEntra ? 'entra con su clave ✓' : 'NO ENTRA ✗') : 'no pasa (emulador) → admin ' + (pTras ? 'TOCADO ✗' : 'sin tocar ✓') + (ej.status === 2 ? ', exit 2 ✓' : ', exit ' + ej.status + ' ✗')));
  chequear(a && b, 'un tecnico no entra con la clave que sale de su PIN');
  chequear(!bMal, 'un tecnico entra con el PIN de otro');
  if (autoOk) chequear(pEntra && ej.status === 0, 'la autoprueba paso pero el Administrador no entra con su clave');
  else {
    chequear(!pTras, 'la autoprueba no paso y aun asi se toco la cuenta del Administrador');
    chequear(ej.status === 2, 'dejo a un Administrador sin cuenta y salio con ' + ej.status + ' (esperado 2)');
  }

  // 3. --clave-admin
  if (!autoOk) {
    const mal = correr(['--ejecutar', '--clave-admin'], 'una-clave-que-no-es-la-suya'); salidas.push(mal.salida);
    const pTrasMal = await existe(UID.p);
    const bien = correr(['--ejecutar', '--clave-admin'], CLAVE_ADMIN); salidas.push(bien.salida);
    const pOk = await entra(UID.p, CLAVE_ADMIN), pOtra = await entra(UID.p, 'otra-clave-cualquiera');
    console.log('3) --clave-admin→ con clave ajena: ' + (pTrasMal ? 'CREO LA CUENTA ✗' : 'no hace nada ✓') + ' (exit ' + mal.status + ')' +
      '; con la suya: ' + (pOk ? 'entra con ESA clave ✓' : 'NO ENTRA ✗') + ', con otra: ' + (pOtra ? 'ENTRA ✗' : 'no ✓') + ' (exit ' + bien.status + ')');
    chequear(!pTrasMal && mal.status === 2, 'con una clave que no es la suya, --clave-admin toco la cuenta o no aviso');
    chequear(pOk && !pOtra && bien.status === 0, 'con su clave, el Administrador no quedo entrando con ella (y solo con ella)');
  }

  // 4. Omitidos
  const qCuenta = await existe(UID.q), cCuenta = await existe(UID.c);
  console.log('4) Omitidos     → admin con clave quemada: ' + (qCuenta ? 'TIENE CUENTA ✗' : 'sin cuenta ✓') + ', tecnico sin PIN: ' + (cCuenta ? 'TIENE CUENTA ✗' : 'sin cuenta ✓'));
  chequear(!qCuenta, 'el Administrador con la clave quemada recibio cuenta');
  chequear(!cCuenta, 'un tecnico sin PIN valido recibio cuenta');

  // 5. Sin secretos
  const fichas = (await db.collection('directorio').get()).docs.map(d => ({ id: d.id, ...d.data() }));
  const conSecreto = fichas.filter(f => 'pin' in f || 'passwordHash' in f || SECRETOS.some(s => JSON.stringify(f).includes(s)));
  const pedro = fichas.find(f => f.id === UID.p) || {};
  const dirResp = path.join(RAIZ, 'tools', 'respaldos');
  const resp = fs.readdirSync(dirResp).filter(f => f.startsWith('cuentas-auth-antes-')).map(f => fs.readFileSync(path.join(dirResp, f), 'utf8')).join('\n');
  const fuga = SECRETOS.concat([quemado || '¬']).filter(s => (salidas.join('\n') + resp).includes(s));
  console.log('5) Sin secretos → ' + fichas.length + ' fichas' + (fichas.length === 3 ? ' ✓' : ' ✗') + ', fichas con secretos ' + conSecreto.length + (conSecreto.length ? ' ✗' : ' ✓') +
    ', Pedro ' + (pedro.cargo === 'Administrador' && pedro.activo === true && pedro.correo === _correoDeCuenta(UID.p) ? 'completo ✓' : 'INCOMPLETO ✗') +
    ', salida+respaldo: ' + (fuga.length ? fuga.length + ' FUGAS ✗' : 'sin secretos ✓'));
  chequear(fichas.length === 3, 'el directorio tiene ' + fichas.length + ' fichas (esperado 3: Ana, Beto y Pedro)');
  chequear(conSecreto.length === 0, 'el directorio guarda PIN o hash');
  chequear(pedro.cargo === 'Administrador' && pedro.activo === true, 'la ficha del Administrador no dice su cargo o no esta activa');
  chequear(fuga.length === 0, 'la salida o el respaldo muestran un PIN, una clave o un hash (' + fuga.length + ')');

  // 6. Dos veces
  const ej2 = correr(['--ejecutar', '--clave-admin'], CLAVE_ADMIN);
  const a2 = await entra(UID.a, _claveFirebaseDePin(PIN_A)), p2 = await entra(UID.p, CLAVE_ADMIN);
  console.log('6) Dos veces    → ' + (ej2.status === 0 && a2 && p2 ? 'sigue funcionando ✓' : 'SE ROMPIO ✗ (exit ' + ej2.status + ')'));
  chequear(ej2.status === 0 && a2 && p2, 'correrla dos veces rompio algo: ' + ej2.salida.slice(-200));

  console.log('');
  if (fallos.length) { console.log('FALLA (' + fallos.length + '):'); fallos.forEach(f => console.log(f)); process.exit(1); }
  console.log('OK — cuentas con el PIN y la clave de siempre, directorio sin secretos, clave quemada rechazada.');
  process.exit(0);
})().catch(e => { console.error('FALLA — la prueba se cayo:', e && (e.code || e.message)); process.exit(1); });
