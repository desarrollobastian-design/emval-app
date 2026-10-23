/* Prueba de la TRANSICION de la etapa 1 (Codex P1-5) contra el EMULADOR.

   Con las reglas de hoy ("capa 1", reconstruccion en capa1-referencia.rules) `directorio` no se puede
   leer: un telefono sin cache se quedaria sin lista de entrada. La transicion le agrega a esas reglas
   SOLO lo necesario (transicion-etapa1.rules), y opcionalmente cierra la escritura de `tecnicos`
   (transicion-etapa1-recomendada.rules). Que se exige:
   1. Con la transicion, sin sesion se LEE el directorio y NADIE lo escribe (ni sin sesion ni con una
      cuenta cualquiera).
   2. Todo lo demas sigue como hoy: la version vieja (v72 o menos) sigue funcionando (lee y escribe
      ordenes y lee tecnicos para entrar).
   3. La recomendada ademas niega crear o cambiar `tecnicos` sin sesion, y sigue dejando leerlo.
   4. CONTRAPRUEBA dentro de la misma prueba: con capa1-referencia.rules sola, leer el directorio FALLA
      (es el problema que se arregla).

   Uso (desde tests/reglas, con Java 21 en el PATH): npm run transicion
   Sale 0 si todo se cumple; 1 si no. */

const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, getDocs, setDoc, updateDoc, addDoc, collection, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');

const fallos = [];
async function probar(env, archivo, casos) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'directorio/u_tec'), { nombre: 'Tomas Prueba', cargo: 'Tecnico en terreno', activo: true });
    await setDoc(doc(db, 'tecnicos/u_tec'), { nombre: 'Tomas Prueba', cargo: 'Tecnico en terreno' });
    await setDoc(doc(db, 'ordenes/o1'), { numero: 1 });
  });
  await env.withSecurityRulesDisabled(() => Promise.resolve());
  let ok = 0;
  for (const [desc, hacer, debe] of casos) {
    let paso;
    try { await (debe ? assertSucceeds(hacer()) : assertFails(hacer())); paso = true; } catch (e) { paso = false; }
    if (paso) ok++; else fallos.push('  ✗ [' + archivo + '] ' + desc + (debe ? ' (lo NEGO)' : ' (lo PERMITIO)'));
    console.log('   ' + (paso ? '✓ ' : '✗ ') + desc);
  }
  return ok;
}

(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');
  const correr = async (archivo, armar) => {
    const env = await initializeTestEnvironment({ projectId: 'demo-emval-' + archivo.replace(/\W/g, ''),
      firestore: { rules: fs.readFileSync(path.join(__dirname, archivo), 'utf8'), host, port: Number(port) } });
    const anon = env.unauthenticatedContext().firestore();
    const cuenta = env.authenticatedContext('u_cualquiera').firestore();
    console.log(archivo + ':');
    const casos = armar(anon, cuenta);
    const ok = await probar(env, archivo, casos);
    await env.cleanup();
    return { ok, total: casos.length };
  };
  const comunes = (anon, cuenta) => [
    ['sin sesion lee el directorio (pantalla de entrada)', () => getDocs(collection(anon, 'directorio')), true],
    ['sin sesion NO escribe el directorio', () => setDoc(doc(anon, 'directorio/u_falso'), { nombre: 'X', cargo: 'Administrador', activo: true }), false],
    ['una cuenta cualquiera NO escribe el directorio', () => updateDoc(doc(cuenta, 'directorio/u_tec'), { cargo: 'Administrador' }), false],
    ['la version vieja sigue leyendo ordenes', () => getDocs(collection(anon, 'ordenes')), true],
    ['la version vieja sigue creando ordenes', () => addDoc(collection(anon, 'ordenes'), { numero: 9 }), true],
    ['la version vieja sigue leyendo tecnicos para entrar', () => getDoc(doc(anon, 'tecnicos/u_tec')), true]
  ];
  const r1 = await correr('transicion-etapa1.rules', comunes);
  const r2 = await correr('transicion-etapa1-recomendada.rules', (anon, cuenta) => comunes(anon, cuenta).concat([
    ['sin sesion NO agrega un Administrador a tecnicos', () => setDoc(doc(anon, 'tecnicos/u_falso'), { nombre: 'X', cargo: 'Administrador', passwordHash: 'x' }), false],
    ['sin sesion NO cambia un tecnico', () => updateDoc(doc(anon, 'tecnicos/u_tec'), { cargo: 'Administrador' }), false]
  ]));
  // Contraprueba: con las reglas de hoy, el directorio no se puede leer.
  const env0 = await initializeTestEnvironment({ projectId: 'demo-emval-capa1', firestore: {
    rules: fs.readFileSync(path.join(__dirname, 'capa1-referencia.rules'), 'utf8'), host, port: Number(port) } });
  let leeHoy = true;
  try { await assertFails(getDocs(collection(env0.unauthenticatedContext().firestore(), 'directorio'))); leeHoy = false; } catch (e) { leeHoy = true; }
  await env0.cleanup();
  console.log('Contraprueba: con las reglas de hoy (reconstruccion) el directorio ' + (leeHoy ? 'SE LEE ✗ (la prueba no mide nada)' : 'NO se lee ✓ (es lo que arregla la transicion)'));
  if (leeHoy) fallos.push('  ✗ CONTRAPRUEBA: con las reglas de hoy el directorio ya se lee: la transicion no arregla nada que mida esta prueba');

  console.log('\nTransicion: ' + r1.ok + '/' + r1.total + ' y recomendada: ' + r2.ok + '/' + r2.total);
  if (fallos.length) { console.log('FALLA (' + fallos.length + '):'); fallos.forEach(f => console.log(f)); process.exit(1); }
  console.log('OK — con la transicion se lee el directorio, nadie lo escribe y la version vieja sigue andando.');
  process.exit(0);
})().catch(e => { console.error('FALLA — el guion se cayo:', e && e.message); process.exit(1); });
