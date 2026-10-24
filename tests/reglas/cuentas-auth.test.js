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
   4b. El camino de la IMPORTACION del hash, forzado con EMVAL_PRUEBA_IMPORTACION (solo vale en el
      emulador): si Firebase la rechaza, sale con 2 y esa persona queda sin cuenta ni ficha (revisor del
      PR #64, punto 1); si la acepta, crea la cuenta; una segunda corrida NO la reimporta (punto 6).
   2b. (Codex, revision final, P1 nuevo 1) Una cuenta que YA existe, con ficha de tecnico, y que en
      `tecnicos` figura como Administrador: sin --autorizar NO se le publica ese cargo (queda pendiente,
      exit 2); con --autorizar, si.
   2c. (nuevo 6) Una cuenta existente con OTRO correo: no se toca, no se le publica ficha, se informa
      (sin imprimir su correo) y sale con 2.
   3b. (P2-8) Las fichas que la corrida no escribe —de una persona omitida y una huerfana— tambien
      quedan solo con los campos permitidos; la huerfana se informa.
   5. Correrla otra vez no cambia ninguna cuenta.
   6. --deshacer (P1 nuevo 3): se niega con un respaldo de otro proyecto o de formato viejo; con el de la
      corrida 2 revierte SOLO lo que esa corrida cambio y no pisa lo que cambio despues (la ficha de
      Beto); repetido despues de que la herramienta vuelve a crear la cuenta de Ana, no la borra ni le
      pisa la ficha. (Ronda 3 de Codex) Si la ficha de alguien que creo esa corrida cambio despues (Tito),
      su cuenta tampoco se borra; ni una cuenta que cambio despues (Uma, deshabilitada).
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
const PIN_A = '4821', PIN_B = '7305', PIN_S = '6190', PIN_C_VIEJO = '5511', PIN_H = '6622', PIN_M = '3141', PIN_T = '2718', PIN_U = '1618';
const CLAVE_ADMIN = 'clave-solo-de-prueba-admin', CLAVE_VIEJA_B = 'clave-vieja-de-beto', CLAVE_RITA = 'clave-solo-de-prueba-rita';
const CLAVE_E = 'clave-solo-de-prueba-esteban', CLAVE_M = 'clave-solo-de-prueba-marta';
const CORREO_REAL_M = 'marta.otra@ejemplo.test';
const SECRETOS = [PIN_A, PIN_B, PIN_S, PIN_C_VIEJO, PIN_H, PIN_M, PIN_T, PIN_U, CLAVE_ADMIN, CLAVE_VIEJA_B, CLAVE_RITA, CLAVE_E, CLAVE_M,
  sha(CLAVE_ADMIN), sha(CLAVE_RITA), sha(CLAVE_E), 'nota-secreta-de-prueba'];
// El correo real de una cuenta no es un secreto (el respaldo local lo guarda para reconocerla), pero la
// herramienta no lo imprime: se revisa aparte, solo en las salidas.
const UID = { a: 'tecA0000000000000001', b: 'tecB0000000000000002', c: 'tecC0000000000000003',
  p: 'admP0000000000000004', q: 'admQ0000000000000005', s: 'supS0000000000000006', r: 'admR0000000000000007',
  e: 'admE0000000000000008', m: 'tecM0000000000000009', t: 'tecT0000000000000011', u: 'tecU0000000000000012' };
const HUERFANA = 'huerH000000000000010';
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
const lineaRita = s => (s.split('\n').find(l => l.includes('Rita Prueba')) || '');
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
  // Otra Administradora, para recorrer el camino de la IMPORTACION del hash (revisor del PR #64).
  await db.doc('tecnicos/' + UID.r).set({ nombre: 'Rita Prueba', cargo: 'Administrador', passwordHash: sha(CLAVE_RITA), letra: 'R' });
  // Beto ya tiene cuenta: DESHABILITADA, con un dato propio y otra clave. No se puede tocar.
  await auth.createUser({ uid: UID.b, email: _correoDeCuenta(UID.b), password: CLAVE_VIEJA_B, displayName: 'Beto (cuenta vieja)', disabled: true });
  await auth.setCustomUserClaims(UID.b, { marca: 'no-tocar' });
  const betoAntes = (await cuenta(UID.b)).toJSON();
  // La ficha vieja de Ana trae campos que no van en un directorio publico.
  await db.doc('directorio/' + UID.a).set({ nombre: 'Ana Vieja', cargo: 'Tecnico en terreno', letra: 'A', activo: true, pin: PIN_A, notaInterna: 'nota-secreta-de-prueba' });
  // Ciro queda omitido (sin PIN), pero tiene una ficha vieja con un PIN adentro (P2-8).
  await db.doc('directorio/' + UID.c).set({ nombre: 'Ciro SinPin', cargo: 'Tecnico en terreno', letra: 'C', activo: true, pin: PIN_C_VIEJO });
  // Una ficha HUERFANA: no hay nadie con ese id en tecnicos, y trae un PIN (P2-8).
  await db.doc('directorio/' + HUERFANA).set({ nombre: 'Hugo Huerfano', cargo: 'Tecnico en terreno', letra: 'H', activo: true, pin: PIN_H });
  // Esteban YA tiene cuenta y ficha de tecnico, pero en tecnicos figura como Administrador (P1 nuevo 1).
  await db.doc('tecnicos/' + UID.e).set({ nombre: 'Esteban Prueba', cargo: 'Administrador', passwordHash: sha(CLAVE_E), letra: 'E' });
  await auth.createUser({ uid: UID.e, email: _correoDeCuenta(UID.e), password: CLAVE_E, displayName: 'Esteban Prueba' });
  await db.doc('directorio/' + UID.e).set({ nombre: 'Esteban Prueba', cargo: 'Tecnico en terreno', letra: 'E', correo: _correoDeCuenta(UID.e), activo: true });
  const estebanAntes = (await cuenta(UID.e)).toJSON();
  // Tito y Uma: tecnicos nuevos que crea la corrida 2 (para --deshacer, ronda 3 de Codex).
  await db.doc('tecnicos/' + UID.t).set({ nombre: 'Tito Prueba', cargo: 'Tecnico en terreno', pin: PIN_T, letra: 'T' });
  await db.doc('tecnicos/' + UID.u).set({ nombre: 'Uma Prueba', cargo: 'Tecnico en terreno', pin: PIN_U, letra: 'U' });
  // Marta YA tiene cuenta, pero con OTRO correo que el que usa la app (nuevo 6).
  await db.doc('tecnicos/' + UID.m).set({ nombre: 'Marta Prueba', cargo: 'Tecnico en terreno', pin: PIN_M, letra: 'M' });
  await auth.createUser({ uid: UID.m, email: CORREO_REAL_M, password: CLAVE_M, displayName: 'Marta Prueba' });
  const martaAntes = (await cuenta(UID.m)).toJSON();

  // 1. Simulacion
  const sim = correr([]);
  const fichas0 = (await db.collection('directorio').get()).size;
  console.log('1) Simulacion   → exit ' + sim.status + (sim.status === 2 ? ' ✓' : ' ✗') + ', nadie creado: ' + (!(await cuenta(UID.a)) && fichas0 === 4 ? '✓' : '✗') +
    ', clave quemada: ' + (/CLAVE QUEMADA/.test(sim.salida) ? 'avisa ✓' : 'NO AVISA ✗'));
  chequear(sim.status === 2, 'la simulacion con gente que quedaria sin cuenta no sale con 2 (sale ' + sim.status + ')');
  chequear(!(await cuenta(UID.a)) && fichas0 === 4, 'la simulacion escribio');
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

  // 2b. Cuenta existente + cargo privilegiado en tecnicos, sin --autorizar (Codex, revision final, P1 nuevo 1)
  const fichaE2 = (await db.doc('directorio/' + UID.e).get()).data() || {};
  const estebanIgual = JSON.stringify((await cuenta(UID.e)).toJSON()) === JSON.stringify(estebanAntes);
  const lineaE = (ej.salida.split('\n').find(l => l.includes('Esteban Prueba')) || '');
  console.log('2b) Cargo       → Esteban (cuenta existente, Administrador en tecnicos) sin --autorizar: ficha ' +
    (fichaE2.cargo === 'Tecnico en terreno' ? 'sigue de tecnico ✓' : 'PUBLICADA COMO ' + fichaE2.cargo + ' ✗') +
    ', ' + (/no se publica sin --autorizar/.test(lineaE) ? 'queda pendiente ✓' : 'NO LO DICE ✗') + ', cuenta ' + (estebanIgual ? 'intacta ✓' : 'TOCADA ✗'));
  chequear(fichaE2.cargo === 'Tecnico en terreno', 'sin --autorizar, a una cuenta existente se le publico el cargo de Administrador tomado de tecnicos (Codex P1 nuevo 1)');
  chequear(/no se publica sin --autorizar/.test(lineaE), 'el cargo privilegiado sin autorizar de una cuenta existente no queda como pendiente');
  chequear(estebanIgual, 'la cuenta existente de Esteban fue modificada');

  // 2c. Cuenta existente con OTRO correo (Codex, revision final, nuevo 6)
  const martaDespues = (await cuenta(UID.m)).toJSON();
  const fichaM = (await db.doc('directorio/' + UID.m).get()).exists;
  const lineaM = (ej.salida.split('\n').find(l => l.includes('Marta Prueba')) || '');
  console.log('2c) Otro correo → Marta: cuenta ' + (JSON.stringify(martaDespues) === JSON.stringify(martaAntes) ? 'intacta ✓' : 'CAMBIADA ✗') +
    ', ficha ' + (!fichaM ? 'no publicada ✓' : 'PUBLICADA ✗') + ', ' + (/OTRO correo/.test(lineaM) ? 'lo informa ✓' : 'NO LO DICE ✗') +
    (ej.salida.includes(CORREO_REAL_M) ? ', IMPRIME SU CORREO ✗' : ', sin imprimir su correo ✓'));
  chequear(JSON.stringify(martaDespues) === JSON.stringify(martaAntes), 'la cuenta existente con otro correo se cambio (nuevo 6)');
  chequear(!fichaM, 'a una cuenta con otro correo se le publico una ficha con el correo derivado: la app no podria entrar (nuevo 6)');
  chequear(/OTRO correo/.test(lineaM) && !ej.salida.includes(CORREO_REAL_M), 'la cuenta con otro correo no se informa, o se imprime su correo');

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

  // 3b. Fichas que la corrida no escribe: la de Ciro (omitido) y una huerfana (Codex P2-8, revision final)
  const fichaC = (await db.doc('directorio/' + UID.c).get()).data() || null;
  const fichaH = (await db.doc('directorio/' + HUERFANA).get()).data() || null;
  const limpia = f => !!f && Object.keys(f).every(k => CAMPOS_FICHA.includes(k));
  console.log('3b) Sin escribir → ficha de Ciro (omitido): ' + (limpia(fichaC) && fichaC.nombre === 'Ciro SinPin' ? 'limpia, con sus datos ✓' : 'CON CAMPOS DE MAS ✗') +
    ' · huerfana: ' + (limpia(fichaH) && fichaH.activo === true ? 'limpia' : 'CON CAMPOS DE MAS') + (/HUERFANA/.test(ej.salida) ? ' e informada ✓' : ', NO INFORMADA ✗'));
  chequear(limpia(fichaC) && fichaC.nombre === 'Ciro SinPin', 'la ficha de una persona omitida conservo campos de mas, o perdio sus datos (Codex P2-8)');
  chequear(limpia(fichaH) && fichaH.activo === true && /HUERFANA/.test(ej.salida), 'la ficha huerfana conservo campos de mas o no se informo (Codex P2-8)');

  // 4. Autorizando al Administrador y a la Supervisora (y la concesion del cargo de Esteban)
  const aut = correr(['--ejecutar', '--autorizar', UID.p + ',' + UID.s + ',' + UID.q + ',' + UID.e, '--clave-admin'], { claveAdmin: CLAVE_ADMIN });
  const fichaE4 = (await db.doc('directorio/' + UID.e).get()).data() || {};
  console.log('4) Concesion    → Esteban con --autorizar: ficha ' + (fichaE4.cargo === 'Administrador' ? 'de Administrador ✓' : fichaE4.cargo + ' ✗'));
  chequear(fichaE4.cargo === 'Administrador', 'con --autorizar, a la cuenta existente no se le publico el cargo autorizado');
  const pOk = await entra(UID.p, CLAVE_ADMIN), pOtra = await entra(UID.p, 'otra-clave-cualquiera');
  const sOk = await entra(UID.s, _claveFirebaseDePin(PIN_S));
  const qCuenta = !!(await cuenta(UID.q));
  console.log('4) Autorizados  → Pedro con SU clave: ' + (pOk && !pOtra ? 'entra (y no con otra) ✓' : 'NO ✗') + ' · Sara con su PIN: ' + (sOk ? 'entra ✓' : 'NO ✗') +
    ' · clave quemada aun autorizado: ' + (qCuenta ? 'TIENE CUENTA ✗' : 'sin cuenta ✓') + ' · exit ' + aut.status + (aut.status === 2 ? ' (quedan Ciro y el quemado) ✓' : ' ✗'));
  chequear(pOk && !pOtra, 'el Administrador autorizado no quedo con su misma clave (y solo con ella)');
  chequear(sOk, 'la Supervisora autorizada no entra con su PIN');
  chequear(!qCuenta, 'el Administrador con la clave quemada recibio cuenta por estar autorizado');
  chequear(aut.status === 2, 'quedando gente sin cuenta, salio con ' + aut.status);

  // 4b. El camino de la IMPORTACION (revisor del PR #64, puntos 1 y 6). El emulador no deja recorrerlo
  //     (no verifica hashes SHA-256): la herramienta acepta forzarlo SOLO con el emulador.
  const rech = correr(['--ejecutar', '--autorizar', UID.r], { env: { EMVAL_PRUEBA_IMPORTACION: 'rechazar' } });
  // El exit 2 ya salia por Ciro, el quemado y otros: lo que prueba el punto 1 es que el rechazo SUME uno
  // a los pendientes del plan (Rita entra al plan como importar-hash, no como omitida). Las huerfanas se
  // suman al final, aparte.
  const nPlan = +((rech.salida.match(/(\d+) pendientes \(sin cuenta o sin ficha\)/) || [])[1]);
  const nHuerf = +((rech.salida.match(/(\d+) fichas huerfanas/) || [])[1] || 0);
  const nFinal = +((rech.salida.match(/(\d+) PENDIENTES/) || [])[1] || 0);
  const rechazoCuenta = Number.isFinite(nPlan) && nFinal === nPlan + nHuerf + 1;
  const ritaTrasRechazo = !!(await cuenta(UID.r)), fichaRitaTrasRechazo = (await db.doc('directorio/' + UID.r).get()).exists;
  const imp = correr(['--ejecutar', '--autorizar', UID.r], { env: { EMVAL_PRUEBA_IMPORTACION: 'autoprueba-ok' } });
  const ritaImportada = await cuenta(UID.r);
  const ritaAntes = ritaImportada ? ritaImportada.toJSON() : null;
  const imp2 = correr(['--ejecutar', '--autorizar', UID.r], { env: { EMVAL_PRUEBA_IMPORTACION: 'autoprueba-ok' } });
  const ritaDespues = (await cuenta(UID.r) || { toJSON: () => null }).toJSON();
  const ritaIgual = !!ritaAntes && !!ritaDespues && ritaAntes.passwordHash === ritaDespues.passwordHash &&
    ritaAntes.metadata.creationTime === ritaDespues.metadata.creationTime && ritaAntes.displayName === ritaDespues.displayName;
  console.log('4b) Importacion → rechazada: ' + (rech.status === 2 && rechazoCuenta && !ritaTrasRechazo && !fichaRitaTrasRechazo && /rechazo la importacion/.test(rech.salida) ? 'exit 2, contada entre los sin cuenta, sin cuenta ni ficha ✓' : 'exit ' + rech.status + ', sin cuenta: plan ' + nPlan + ' → final ' + nFinal + ' ✗') +
    ' · aceptada: ' + (ritaImportada && (await db.doc('directorio/' + UID.r).get()).exists ? 'cuenta y ficha ✓' : 'NO ✗') +
    ' · otra vez: ' + (ritaIgual && /ya existe: no se toca/.test(lineaRita(imp2.salida)) ? 'no la reimporta ✓' : 'LA TOCA ✗'));
  chequear(rech.status === 2 && rechazoCuenta && /rechazo la importacion/.test(rech.salida), 'Firebase rechazo la importacion y la herramienta no la conto como sin cuenta o no salio con 2 (revisor del PR #64, punto 1)');
  chequear(!ritaTrasRechazo && !fichaRitaTrasRechazo, 'tras un rechazo de la importacion quedo una cuenta o una ficha');
  chequear(!!ritaImportada && imp.status !== 1, 'la importacion aceptada no creo la cuenta');
  chequear(ritaIgual && /ya existe: no se toca/.test(lineaRita(imp2.salida)), 'una segunda corrida reimporto o toco la cuenta importada (revisor, punto 6)');

  // 5. Otra vez: nada cambia en las cuentas
  const foto = async () => JSON.stringify(await Promise.all(Object.values(UID).map(async u => { const c = await cuenta(u); return c ? [u, c.disabled, c.passwordHash, JSON.stringify(c.customClaims || {})] : [u, null]; })));
  const f1 = await foto();
  const otra = correr(['--ejecutar', '--autorizar', UID.p + ',' + UID.s, '--clave-admin'], { claveAdmin: CLAVE_ADMIN });
  const f2 = await foto();
  console.log('5) Otra vez     → cuentas: ' + (f1 === f2 ? 'iguales ✓' : 'CAMBIARON ✗') + ' (exit ' + otra.status + ')');
  chequear(f1 === f2, 'correrla otra vez cambio cuentas que ya existian');

  // 6. Deshacer la corrida 2 (Codex, revision final, P1 nuevo 3)
  const archivoResp2 = path.join(DIR_RESP, respaldo2 || 'x');
  const r2 = respaldo2 ? JSON.parse(fs.readFileSync(archivoResp2, 'utf8')) : {};
  // 6a. Un respaldo de OTRO proyecto, y uno de formato viejo (sin diario): no se toca nada.
  const otroProy = path.join(DIR_RESP, 'prueba-otro-proyecto.json');
  fs.writeFileSync(otroProy, JSON.stringify(Object.assign({}, r2, { proyecto: 'otro-proyecto' })));
  const viejo = path.join(DIR_RESP, 'prueba-formato-viejo.json');
  fs.writeFileSync(viejo, JSON.stringify({ creado: r2.creado, proyecto: r2.proyecto, creadas: [UID.a], directorio: [] }));
  const dOtro = correr(['--deshacer', otroProy], { confirmar: 'DESHACER' });
  const dViejo = correr(['--deshacer', viejo], { confirmar: 'DESHACER' });
  const anaTrasNegativas = !!(await cuenta(UID.a));
  console.log('6a) Deshacer    → respaldo de otro proyecto: ' + (dOtro.status === 2 && /proyecto/.test(dOtro.salida) ? 'se niega ✓' : 'exit ' + dOtro.status + ' ✗') +
    ' · de formato viejo: ' + (dViejo.status === 2 && /formato viejo/.test(dViejo.salida) ? 'se niega ✓' : 'exit ' + dViejo.status + ' ✗') +
    ' · cuenta de Ana: ' + (anaTrasNegativas ? 'sigue ✓' : 'BORRADA ✗'));
  chequear(dOtro.status === 2 && /proyecto/.test(dOtro.salida) && anaTrasNegativas, '--deshacer aplico un respaldo de otro proyecto (Codex P1 nuevo 3)');
  chequear(dViejo.status === 2 && /formato viejo/.test(dViejo.salida) && anaTrasNegativas, '--deshacer aplico un respaldo sin diario');
  // 6b. Algo cambia DESPUES de la corrida 2 (la ficha de Beto) y se deshace la corrida 2.
  // (set y no update: con una herramienta que ya la borro en 6a, la prueba falla en su tramo, no se cae)
  await db.doc('directorio/' + UID.b).set(Object.assign({}, (await db.doc('directorio/' + UID.b).get()).data() || {}, { letra: 'Z' }));
  // Ronda 3 de Codex: la ficha de Tito (cuenta creada por la corrida 2) cambia despues, y la cuenta de Uma
  // (tambien creada por la corrida 2) se deshabilita despues.
  const titoCreado = !!(await cuenta(UID.t)), umaCreada = !!(await cuenta(UID.u));
  await db.doc('directorio/' + UID.t).set(Object.assign({}, (await db.doc('directorio/' + UID.t).get()).data() || {}, { letra: 'Q' }));
  if (umaCreada) await auth.updateUser(UID.u, { disabled: true });
  const des = correr(['--deshacer', archivoResp2], { confirmar: 'DESHACER' });
  const anaBorrada = !(await cuenta(UID.a));
  const fichaAnaRest = (await db.doc('directorio/' + UID.a).get()).data() || {};
  const betoSigue = !!(await cuenta(UID.b));
  const fichaBeto6 = (await db.doc('directorio/' + UID.b).get()).data() || null;
  const otrosIntactos = !!(await cuenta(UID.p)) && !!(await cuenta(UID.s)) && ((await db.doc('directorio/' + UID.e).get()).data() || {}).cargo === 'Administrador';
  console.log('6b) Deshacer    → exit ' + des.status + ' · cuenta de Ana (la creo esa corrida): ' + (anaBorrada ? 'borrada ✓' : 'SIGUE ✗') +
    ' · ficha de Ana: ' + (fichaAnaRest.nombre === 'Ana Vieja' && !('pin' in fichaAnaRest) ? 'la de antes, sin campos de mas ✓' : 'NO ✗') +
    ' · cuenta de Beto (no la creo): ' + (betoSigue ? 'sigue ✓' : 'BORRADA ✗') +
    ' · ficha de Beto (cambio despues): ' + (fichaBeto6 && fichaBeto6.letra === 'Z' ? 'no la pisa ✓' : 'LA PISO ✗') +
    ' · lo de otras corridas: ' + (otrosIntactos ? 'intacto ✓' : 'TOCADO ✗'));
  chequear(anaBorrada && betoSigue, '--deshacer no borro lo que creo esa corrida, o borro algo que no creo');
  chequear(fichaAnaRest.nombre === 'Ana Vieja' && !('pin' in fichaAnaRest), '--deshacer no dejo la ficha de Ana como estaba');
  chequear(fichaBeto6 && fichaBeto6.letra === 'Z' && des.status === 2 && /cambio despues/.test(des.salida), '--deshacer piso una ficha que cambio despues de esa corrida, o no lo informo con exit 2 (Codex P1 nuevo 3)');
  chequear(otrosIntactos, '--deshacer de la corrida 2 toco cuentas o fichas de otras corridas');
  const titoSigue = !!(await cuenta(UID.t)), fichaTito = (await db.doc('directorio/' + UID.t).get()).data() || {};
  const umaSigue = !!(await cuenta(UID.u));
  console.log('6b) Ficha+cuenta → Tito (ficha cambio despues): cuenta ' + (titoCreado && titoSigue && fichaTito.letra === 'Q' ? 'y ficha se conservan ✓' : 'BORRADA o ficha pisada ✗') +
    ' · Uma (cuenta deshabilitada despues): ' + (umaCreada && umaSigue ? 'no se borra ✓' : 'BORRADA ✗'));
  chequear(titoCreado && titoSigue && fichaTito.letra === 'Q', '--deshacer conservo la ficha que cambio despues pero borro su cuenta (Codex, ronda 3)');
  chequear(umaCreada && umaSigue, '--deshacer borro una cuenta que cambio despues de esa corrida (deshabilitada) (Codex, ronda 3)');
  // 6c. La herramienta vuelve a crear la cuenta de Ana; repetir el deshacer NO la borra ni le pisa la ficha.
  correr(['--ejecutar']);
  const anaNueva = await cuenta(UID.a);
  const des2 = correr(['--deshacer', archivoResp2], { confirmar: 'DESHACER' });
  const anaSigue = await cuenta(UID.a);
  const fichaAna7 = (await db.doc('directorio/' + UID.a).get()).data() || {};
  const mismaCuenta = !!anaNueva && !!anaSigue && anaNueva.metadata.creationTime === anaSigue.metadata.creationTime;
  console.log('6c) Otra vez    → la cuenta nueva de Ana: ' + (mismaCuenta ? 'sigue ✓' : 'BORRADA ✗') + ' · su ficha: ' +
    (fichaAna7.nombre === 'Ana Prueba' ? 'no se revierte ✓' : 'REVERTIDA ✗') + ' · exit ' + des2.status + (des2.status === 2 ? ' ✓' : ' ✗'));
  chequear(mismaCuenta && fichaAna7.nombre === 'Ana Prueba' && des2.status === 2, 'repetir --deshacer despues de cambios posteriores volvio a aplicar el estado viejo (Codex P1 nuevo 3)');

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
  const correoImpreso = salidas.join('\n').includes(CORREO_REAL_M);
  console.log('8) Sin secretos → salida y respaldos: ' + (fuga.length ? fuga.length + ' FUGAS ✗' : 'ninguno ✓') +
    ' · correo real en la salida: ' + (correoImpreso ? 'IMPRESO ✗' : 'no ✓'));
  chequear(fuga.length === 0, 'la salida o un respaldo muestran un PIN, una clave o un hash (' + fuga.length + ')');
  chequear(!correoImpreso, 'la herramienta imprimio el correo real de una cuenta');

  console.log('');
  if (fallos.length) { console.log('FALLA (' + fallos.length + '):'); fallos.forEach(f => console.log(f)); process.exit(1); }
  console.log('OK — crea solo lo que falta, con el PIN y la clave de siempre; lo existente no se toca; se puede deshacer.');
  process.exit(0);
})().catch(e => { console.error('FALLA — la prueba se cayo:', e && (e.code || e.message)); process.exit(1); });
