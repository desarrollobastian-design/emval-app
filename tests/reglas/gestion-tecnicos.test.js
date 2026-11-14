/* Prueba de las reglas de GESTION DE TECNICOS DESDE EL PANEL (gestion-tecnicos.rules) contra el EMULADOR.

   Pedro (Administrador, con su sesion de Firebase) agrega tecnicos en terreno, les cambia el PIN y los
   da de baja desde la app: eso escribe `tecnicos/{uid}` y `directorio/{uid}`. Que se exige:
   1. El Administrador crea y cambia fichas de TECNICOS EN TERRENO, en las dos colecciones, con lo
      mismo que manda la app (_altaTecnico, _cambiarPinTecnico, _activarTecnico).
   2. Nadie se convierte en Supervisor o Administrador por aqui, ni el Administrador: ni al crear ni al
      cambiar, y la ficha de un Supervisor o Administrador no se toca (tampoco la de Pedro).
   3. Sin sesion, con una cuenta sin ficha, con un tecnico, un supervisor o un administrador DE BAJA:
      nada. Nadie borra.
   4. Lo del paso 1b sigue igual: sin sesion se lee el directorio y la version vieja lee tecnicos.
   5. CONTRAPRUEBA dentro de la misma prueba: con transicion-etapa1.rules (lo publicado hoy) el
      Administrador NO puede agregar un tecnico. Si pudiera, esta prueba no mide el cambio.

   Uso (desde tests/reglas, con Java 21 en el PATH): npm run gestion
   Sale 0 si todo se cumple; 1 si no. */

const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, writeBatch, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');

const fallos = [];
const T = 'Tecnico en terreno';
const ahora = '2026-11-14T12:00:00.000Z';

async function sembrar(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'directorio/u_admin'), { nombre: 'Pedro Prueba', cargo: 'Administrador', letra: 'P', activo: true });
    await setDoc(doc(db, 'directorio/u_adminbaja'), { nombre: 'Ana Baja', cargo: 'Administrador', letra: 'A', activo: false });
    await setDoc(doc(db, 'directorio/u_sup'), { nombre: 'Sara Prueba', cargo: 'Supervisor', letra: 'S', activo: true });
    await setDoc(doc(db, 'directorio/u_tec'), { nombre: 'Tomas Prueba', cargo: T, letra: 'T', activo: true });
    await setDoc(doc(db, 'tecnicos/u_admin'), { nombre: 'Pedro Prueba', cargo: 'Administrador', passwordHash: 'x' });
    await setDoc(doc(db, 'tecnicos/u_sup'), { nombre: 'Sara Prueba', cargo: 'Supervisor', pin: '1111' });
    await setDoc(doc(db, 'tecnicos/u_tec'), { nombre: 'Tomas Prueba', cargo: T, pin: '2222' });
  });
}

async function correrCasos(etiqueta, casos) {
  let ok = 0;
  for (const [desc, hacer, debe] of casos) {
    let paso;
    try { await (debe ? assertSucceeds(hacer()) : assertFails(hacer())); paso = true; } catch (e) { paso = false; }
    if (paso) ok++; else fallos.push('  ✗ [' + etiqueta + '] ' + desc + (debe ? ' (lo NEGO)' : ' (lo PERMITIO)'));
    console.log('   ' + (paso ? '✓ ' : '✗ ') + desc);
  }
  return ok;
}

// Lo mismo que escribe la app al agregar (_altaTecnico): un lote con las dos fichas.
function alta(db, uid, nombre, cargo) {
  const b = writeBatch(db);
  b.set(doc(db, 'tecnicos/' + uid), { nombre, cargo, pin: '4321', letra: nombre.charAt(0), correo: 'nuevo@emval-app.firebaseapp.com',
    activo: true, creadoEn: ahora, creadoPor: 'u_admin' });
  b.set(doc(db, 'directorio/' + uid), { nombre, cargo, letra: nombre.charAt(0), correo: 'nuevo@emval-app.firebaseapp.com',
    activo: true, actualizadoEn: ahora });
  return b.commit();
}

(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');
  const env = await initializeTestEnvironment({ projectId: 'demo-emval-gestion',
    firestore: { rules: fs.readFileSync(path.join(__dirname, 'gestion-tecnicos.rules'), 'utf8'), host, port: Number(port) } });
  await sembrar(env);
  const adm = env.authenticatedContext('u_admin').firestore();
  const admBaja = env.authenticatedContext('u_adminbaja').firestore();
  const sup = env.authenticatedContext('u_sup').firestore();
  const tec = env.authenticatedContext('u_tec').firestore();
  const extrano = env.authenticatedContext('u_extrano').firestore();
  const anon = env.unauthenticatedContext().firestore();

  console.log('gestion-tecnicos.rules:');
  const casos = [
    // 1. Lo que hace la app
    ['admin agrega un tecnico (tecnicos + directorio en un lote)', () => alta(adm, 'u_nuevo', 'Nuevo Prueba', T), true],
    ['admin cambia el PIN de un tecnico (anota pinNuevo)', () => updateDoc(doc(adm, 'tecnicos/u_tec'), { pin: '2222', pinNuevo: '3333' }), true],
    ['admin da de baja a un tecnico (tecnicos + directorio)', () => { const b = writeBatch(adm);
      b.update(doc(adm, 'tecnicos/u_tec'), { activo: false }); b.update(doc(adm, 'directorio/u_tec'), { activo: false, actualizadoEn: ahora }); return b.commit(); }, true],
    ['admin reactiva a un tecnico', () => updateDoc(doc(adm, 'directorio/u_tec'), { activo: true, actualizadoEn: ahora }), true],
    // 2. Nadie sube de cargo
    ['admin NO agrega un Administrador', () => alta(adm, 'u_x1', 'Falso Admin', 'Administrador'), false],
    ['admin NO agrega un Supervisor', () => alta(adm, 'u_x2', 'Falso Sup', 'Supervisor'), false],
    ['admin NO convierte a un tecnico en Supervisor (directorio)', () => updateDoc(doc(adm, 'directorio/u_tec'), { cargo: 'Supervisor' }), false],
    ['admin NO convierte a un tecnico en Administrador (tecnicos)', () => updateDoc(doc(adm, 'tecnicos/u_tec'), { cargo: 'Administrador' }), false],
    ['admin NO baja de cargo a un Supervisor a tecnico', () => updateDoc(doc(adm, 'directorio/u_sup'), { cargo: T }), false],
    ['admin NO da de baja a un Supervisor', () => updateDoc(doc(adm, 'directorio/u_sup'), { activo: false }), false],
    ['admin NO toca su propia ficha (directorio)', () => updateDoc(doc(adm, 'directorio/u_admin'), { activo: true, actualizadoEn: ahora }), false],
    ['admin NO toca la ficha de un Administrador en tecnicos', () => updateDoc(doc(adm, 'tecnicos/u_admin'), { pin: '0000' }), false],
    ['admin NO pisa su ficha con una de tecnico', () => setDoc(doc(adm, 'directorio/u_admin'), { nombre: 'Pedro Prueba', cargo: T, letra: 'P', correo: 'x@emval-app.firebaseapp.com', activo: true }), false],
    ['admin NO escribe campos de mas en el directorio', () => updateDoc(doc(adm, 'directorio/u_tec'), { pin: '9999' }), false],
    ['admin NO escribe un passwordHash en tecnicos', () => updateDoc(doc(adm, 'tecnicos/u_tec'), { passwordHash: 'x' }), false],
    ['admin NO crea una ficha sin nombre', () => setDoc(doc(adm, 'directorio/u_x3'), { nombre: '', cargo: T, activo: true }), false],
    // 3. Nadie mas, y nadie borra
    ['admin NO borra un tecnico', () => deleteDoc(doc(adm, 'tecnicos/u_tec')), false],
    ['admin NO borra una ficha del directorio', () => deleteDoc(doc(adm, 'directorio/u_tec')), false],
    ['admin DE BAJA NO agrega un tecnico', () => alta(admBaja, 'u_x4', 'Otro Prueba', T), false],
    ['supervisor NO agrega un tecnico', () => alta(sup, 'u_x5', 'Otro Prueba', T), false],
    ['supervisor NO cambia el PIN de un tecnico', () => updateDoc(doc(sup, 'tecnicos/u_tec'), { pin: '0000' }), false],
    ['tecnico NO se cambia su propio PIN en tecnicos', () => updateDoc(doc(tec, 'tecnicos/u_tec'), { pin: '0000' }), false],
    ['tecnico NO se reactiva ni se da de baja', () => updateDoc(doc(tec, 'directorio/u_tec'), { activo: false }), false],
    ['cuenta sin ficha NO se da una ficha de tecnico', () => setDoc(doc(extrano, 'directorio/u_extrano'), { nombre: 'X', cargo: T, letra: 'X', activo: true }), false],
    ['sin sesion NO agrega un tecnico', () => alta(anon, 'u_x6', 'Otro Prueba', T), false],
    ['sin sesion NO cambia un tecnico', () => updateDoc(doc(anon, 'tecnicos/u_tec'), { pin: '0000' }), false],
    // 4. El paso 1b sigue
    ['sin sesion lee el directorio (pantalla de entrada)', () => getDocs(collection(anon, 'directorio')), true],
    ['la version vieja sigue leyendo tecnicos para entrar', () => getDoc(doc(anon, 'tecnicos/u_tec')), true]
  ];
  const ok = await correrCasos('gestion-tecnicos.rules', casos);
  await env.cleanup();

  // 5. Contraprueba: con lo publicado hoy (paso 1b), el Administrador no puede agregar a nadie.
  const env0 = await initializeTestEnvironment({ projectId: 'demo-emval-transicion', firestore: {
    rules: fs.readFileSync(path.join(__dirname, 'transicion-etapa1.rules'), 'utf8'), host, port: Number(port) } });
  await sembrar(env0);
  let hoyPuede = false;
  try { await assertSucceeds(alta(env0.authenticatedContext('u_admin').firestore(), 'u_nuevo', 'Nuevo Prueba', T)); hoyPuede = true; } catch (e) { hoyPuede = false; }
  await env0.cleanup();
  console.log('Contraprueba: con el paso 1b (lo publicado hoy) el Administrador ' +
    (hoyPuede ? 'YA agrega un tecnico ✗ (la prueba no mide el cambio)' : 'NO agrega un tecnico ✓ (es lo que cambia)'));
  if (hoyPuede) fallos.push('  ✗ CONTRAPRUEBA: con transicion-etapa1.rules el Administrador ya podia agregar: la prueba no mide el cambio');

  console.log('\nGestion de tecnicos: ' + ok + '/' + casos.length);
  if (fallos.length) { console.log('FALLA (' + fallos.length + '):'); fallos.forEach(f => console.log(f)); process.exit(1); }
  console.log('OK — el Administrador gestiona tecnicos en terreno y a nadie mas; nadie sube de cargo ni borra.');
  process.exit(0);
})().catch(e => { console.error('FALLA — el guion se cayo:', e && e.message); process.exit(1); });
