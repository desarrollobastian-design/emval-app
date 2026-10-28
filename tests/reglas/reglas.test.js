/* Prueba de las reglas de Firestore de la etapa 2 (firestore.rules) contra el EMULADOR.

   Que se exige: cada rol puede justo lo que la app le pide (inventario de operaciones del 23-10-2026,
   progress/2026-10-22_2100_chat-proyecto_emval-auth-diseno.md, D) y nada mas. Lo mas importante:
   - sin sesion solo se lee el directorio y un PDF por su id (visor publico ?pdf=);
   - una cuenta de Firebase SIN ficha en el directorio no es nadie, y no se puede dar una ficha;
   - un tecnico desactivado no es nadie;
   - el tecnico borra pausadas, no hojas firmadas; tecnicos/cadenas/directorio solo el Administrador.

   Uso (desde tests/reglas, con Java 21 en el PATH):
     npm install                       # una vez
     npx firebase emulators:exec --only firestore --project demo-emval "node reglas.test.js"
     npx firebase emulators:exec --only firestore --project demo-emval "node reglas.test.js --capa1"
   La segunda es la CONTRAPRUEBA: con las reglas de hoy (capa1-referencia.rules) TIENE que fallar.
   Sale 0 si todo se comporta como se espera; 1 si no. */

const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, query, where, runTransaction, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');   // los PERMISSION_DENIED esperados no son ruido que leer

const CAPA1 = process.argv.includes('--capa1');
const ARCHIVO = CAPA1 ? 'capa1-referencia.rules' : 'firestore.rules';

(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');
  const env = await initializeTestEnvironment({
    projectId: 'demo-emval',
    firestore: { rules: fs.readFileSync(path.join(__dirname, ARCHIVO), 'utf8'), host, port: Number(port) }
  });

  // Semilla, sin reglas. Nada de esto es un dato real.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'directorio/u_admin'), { nombre: 'Pedro Prueba', cargo: 'Administrador', letra: 'P', activo: true });
    await setDoc(doc(db, 'directorio/u_sup'), { nombre: 'Sara Prueba', cargo: 'Supervisor', letra: 'S', activo: true });
    await setDoc(doc(db, 'directorio/u_tec'), { nombre: 'Tomas Prueba', cargo: 'Tecnico en terreno', letra: 'T', activo: true });
    await setDoc(doc(db, 'directorio/u_baja'), { nombre: 'Beto Prueba', cargo: 'Tecnico en terreno', letra: 'B', activo: false });
    await setDoc(doc(db, 'tecnicos/u_tec'), { nombre: 'Tomas Prueba', cargo: 'Tecnico en terreno' });
    await setDoc(doc(db, 'ordenes/o_pausa'), { numero: 1, pausa: true, estado: 'En Pausa', firmada: false, tecnico: 'Tomas Prueba' });
    await setDoc(doc(db, 'ordenes/o_firmada'), { numero: 2, pausa: false, estado: 'Terminada', firmada: true, tecnico: 'Tomas Prueba' });
    await setDoc(doc(db, 'ordenes/o_pausa_firmada'), { numero: 3, pausa: true, estado: 'En Pausa', firmada: true });
    await setDoc(doc(db, 'cotizaciones/c1'), { numeroCotizacion: '1102601' });
    await setDoc(doc(db, 'ordenes/o_firmada2'), { numero: 4, pausa: false, estado: 'Terminada', firmada: true, tecnico: 'Tomas Prueba', descripcionTrabajo: 'cambio de rueda' });
    await setDoc(doc(db, 'ordenes/o_pausa2'), { numero: 5, pausa: true, estado: 'En Pausa', firmada: false, tecnico: 'Tomas Prueba' });
    await setDoc(doc(db, 'cotizaciones/c2'), { numeroCotizacion: '1102602', total: 100000, estadoCot: 'Pendiente', items: [{ d: 'x', v: 100000 }] });
    // Revision final de Codex (P1-3): autoria (`subidoPor`) y transiciones.
    const T = { pausa: false, estado: 'Terminada', firmada: true };
    await setDoc(doc(db, 'ordenes/o_cierre_c1'), Object.assign({ numero: 7, tecnico: 'Tomas Prueba', subidoPor: 'u_tec', cotizacionId: 'c1' }, T));
    await setDoc(doc(db, 'ordenes/o_c2'), Object.assign({ numero: 8, tecnico: 'Tomas Prueba', subidoPor: 'u_tec', cotizacionId: 'c2' }, T));
    await setDoc(doc(db, 'ordenes/o_con_pdf'), Object.assign({ numero: 11, tecnico: 'Tomas Prueba', subidoPor: 'u_tec', pdfUrlCloudinary: 'https://viejo', pdfHojaGen: 1 }, T));
    await setDoc(doc(db, 'ordenes/o_ajena'), Object.assign({ numero: 12, tecnico: 'Tomas Prueba', subidoPor: 'u_otro' }, T));
    // Telefono compartido: la hoja es de otro tecnico, pero la subio la sesion de Tomas desde la cola.
    await setDoc(doc(db, 'ordenes/o_propia'), Object.assign({ numero: 13, tecnico: 'Otro Prueba', subidoPor: 'u_tec' }, T));
    await setDoc(doc(db, 'cotizaciones/c3'), { numeroCotizacion: '1102603', estadoCot: 'Aceptada' });
    await setDoc(doc(db, 'ordenes/o_c3_sinfirma'), { numero: 14, tecnico: 'Tomas Prueba', subidoPor: 'u_tec', cotizacionId: 'c3', firmada: false, pausa: true });
    await setDoc(doc(db, 'ordenes/o_c3_ajena'), Object.assign({ numero: 15, tecnico: 'Otro Prueba', subidoPor: 'u_otro', cotizacionId: 'c3' }, T));
    await setDoc(doc(db, 'cotizaciones/c4'), { numeroCotizacion: '1102604', estadoCot: 'Aceptada', otId: 'o_c4' });
    await setDoc(doc(db, 'ordenes/o_c4b'), Object.assign({ numero: 16, tecnico: 'Tomas Prueba', subidoPor: 'u_tec', cotizacionId: 'c4' }, T));
    await setDoc(doc(db, 'cadenas/k1'), { nombre: 'CADENA PRUEBA' });
    await setDoc(doc(db, 'pdfs/p_aleatorio'), { otNumero: 2 });
    await setDoc(doc(db, 'contadores/cot_011026'), { n: 1 });
    await setDoc(doc(db, 'correos_purgados/x1'), { a: 'prueba' });
  });

  const anon = env.unauthenticatedContext().firestore();
  const extrano = env.authenticatedContext('u_extrano').firestore();   // cuenta de Auth sin ficha
  const baja = env.authenticatedContext('u_baja').firestore();
  const tec = env.authenticatedContext('u_tec').firestore();
  const sup = env.authenticatedContext('u_sup').firestore();
  const adm = env.authenticatedContext('u_admin').firestore();

  // [descripcion, promesa (fabrica), true = debe poder, false = no debe poder]
  const casos = [
    // ── sin sesion ──
    ['sin sesion lee el directorio (pantalla de entrada)', () => getDocs(collection(anon, 'directorio')), true],
    ['sin sesion abre un PDF por su id (visor ?pdf=)', () => getDoc(doc(anon, 'pdfs/p_aleatorio')), true],
    ['sin sesion NO lista los PDF', () => getDocs(collection(anon, 'pdfs')), false],
    ['sin sesion NO lee tecnicos (PIN y hash)', () => getDoc(doc(anon, 'tecnicos/u_tec')), false],
    ['sin sesion NO lee ordenes', () => getDocs(collection(anon, 'ordenes')), false],
    ['sin sesion NO crea ordenes', () => addDoc(collection(anon, 'ordenes'), { numero: 9 }), false],
    ['sin sesion NO escribe alertas', () => setDoc(doc(anon, 'alertas/pausadas_dev'), { items: [] }), false],
    ['sin sesion NO escribe el directorio', () => setDoc(doc(anon, 'directorio/u_nuevo'), { cargo: 'Administrador' }), false],
    // ── cuenta de Firebase sin ficha (cualquiera puede crear una) ──
    ['cuenta sin ficha NO lee ordenes', () => getDocs(collection(extrano, 'ordenes')), false],
    ['cuenta sin ficha NO crea ordenes', () => addDoc(collection(extrano, 'ordenes'), { numero: 9 }), false],
    ['cuenta sin ficha NO se da una ficha de Administrador', () => setDoc(doc(extrano, 'directorio/u_extrano'), { nombre: 'X', cargo: 'Administrador', activo: true }), false],
    ['cuenta sin ficha NO lee cadenas', () => getDocs(collection(extrano, 'cadenas')), false],
    // ── tecnico desactivado ──
    ['tecnico desactivado NO lee ordenes', () => getDocs(collection(baja, 'ordenes')), false],
    ['tecnico desactivado NO se reactiva', () => updateDoc(doc(baja, 'directorio/u_baja'), { activo: true }), false],
    // ── tecnico ──
    ['tecnico lee ordenes (consulta pausa==true, no filtra por tecnico)', () => getDocs(query(collection(tec, 'ordenes'), where('pausa', '==', true))), true],
    ['tecnico crea una orden', () => setDoc(doc(tec, 'ordenes/o_nueva'), { numero: 10, pausa: false, firmada: true, tecnico: 'Tomas Prueba' }), true],
    ['tecnico NO crea una orden sin el campo tecnico (fantasma con solo el enlace del PDF)', () => setDoc(doc(tec, 'ordenes/o_fantasma'), { pdfUrlCloudinary: 'x', pdfHojaGen: 1 }, { merge: true }), false],
    ['tecnico rellena el enlace vacio del PDF (hoja anterior a subidoPor)', () => updateDoc(doc(tec, 'ordenes/o_firmada'), { pdfUrlCloudinary: 'x' }), true],
    ['tecnico borra una pausada', () => deleteDoc(doc(tec, 'ordenes/o_pausa')), true],
    ['tecnico NO borra una hoja firmada', () => deleteDoc(doc(tec, 'ordenes/o_firmada')), false],
    ['tecnico NO borra una pausada ya firmada', () => deleteDoc(doc(tec, 'ordenes/o_pausa_firmada')), false],
    ['tecnico NO lee tecnicos', () => getDoc(doc(tec, 'tecnicos/u_tec')), false],
    ['tecnico NO se cambia el cargo en el directorio', () => updateDoc(doc(tec, 'directorio/u_tec'), { cargo: 'Administrador' }), false],
    ['tecnico lee cadenas', () => getDocs(collection(tec, 'cadenas')), true],
    ['tecnico NO escribe cadenas', () => updateDoc(doc(tec, 'cadenas/k1'), { nombre: 'Y' }), false],
    ['tecnico sube el registro de un PDF', () => addDoc(collection(tec, 'pdfs'), { otNumero: 10 }), true],
    ['tecnico lista PDF', () => getDocs(query(collection(tec, 'pdfs'), where('otNumero', '==', 2))), true],
    ['tecnico NO modifica un PDF', () => updateDoc(doc(tec, 'pdfs/p_aleatorio'), { otNumero: 99 }), false],
    ['tecnico marca Realizada la cotizacion de SU hoja firmada (cierre de OT en espera)', () => updateDoc(doc(tec, 'cotizaciones/c1'), { estadoCot: 'Realizada', otId: 'o_cierre_c1', otNumero: '7' }), true],
    ['tecnico NO crea cotizaciones', () => addDoc(collection(tec, 'cotizaciones'), { x: 1 }), false],
    ['tecnico NO borra cotizaciones', () => deleteDoc(doc(tec, 'cotizaciones/c1')), false],
    ['tecnico usa el correlativo de bajas (transaccion)', () => runTransaction(tec, async (t) => {
      const r = doc(tec, 'contadores/baja_011026'); const s = await t.get(r);
      t.set(r, { n: (s.exists() ? s.data().n : 0) + 1 });
    }), true],
    ['tecnico escribe el reporte del telefono', () => setDoc(doc(tec, 'alertas/pausadas_dev1'), { items: [] }), true],
    ['tecnico NO borra alertas', () => deleteDoc(doc(tec, 'alertas/pausadas_dev1')), false],
    ['tecnico guarda una baja de activo', () => setDoc(doc(tec, 'bajas/b1'), { folio: 'B1' }), true],
    ['tecnico deja constancia de una purga de correos', () => addDoc(collection(tec, 'correos_purgados'), { a: 'x' }), true],
    ['tecnico NO lee las purgas de correos', () => getDocs(collection(tec, 'correos_purgados')), false],
    ['tecnico NO escribe en una coleccion que no existe', () => setDoc(doc(tec, 'otra/x'), { a: 1 }), false],
    // ── supervisor ──
    ['supervisor crea una cotizacion', () => addDoc(collection(sup, 'cotizaciones'), { x: 1 }), true],
    ['supervisor borra una cotizacion (hoy lo hace sin clave)', () => setDoc(doc(sup, 'cotizaciones/c_borrar'), { x: 1 }).then(() => deleteDoc(doc(sup, 'cotizaciones/c_borrar'))), true],
    ['supervisor lee las purgas de correos', () => getDocs(collection(sup, 'correos_purgados')), true],
    ['supervisor NO borra una hoja firmada', () => deleteDoc(doc(sup, 'ordenes/o_firmada')), false],
    ['supervisor NO lee tecnicos', () => getDoc(doc(sup, 'tecnicos/u_tec')), false],
    ['supervisor NO escribe cadenas', () => updateDoc(doc(sup, 'cadenas/k1'), { nombre: 'Z' }), false],
    ['supervisor NO escribe el directorio', () => updateDoc(doc(sup, 'directorio/u_tec'), { activo: false }), false],
    // ── ataques de la revision de Codex del PR #64 ──
    ['tecnico NO desfirma una hoja firmada (para despues borrarla)', () => updateDoc(doc(tec, 'ordenes/o_firmada2'), { firmada: false, pausa: true }), false],
    ['tecnico NO cambia el texto de una hoja firmada', () => updateDoc(doc(tec, 'ordenes/o_firmada2'), { descripcionTrabajo: 'otro trabajo' }), false],
    ['tecnico NO cambia el tecnico de una hoja', () => updateDoc(doc(tec, 'ordenes/o_pausa2'), { tecnico: 'Otro Prueba' }), false],
    ['tecnico reenvia su hoja firmada desde la cola (mismos datos, creadoEn nuevo)', () => setDoc(doc(tec, 'ordenes/o_firmada2'), { numero: 4, pausa: false, estado: 'Terminada', firmada: true, tecnico: 'Tomas Prueba', descripcionTrabajo: 'cambio de rueda', creadoEn: new Date() }, { merge: true }), true],
    ['tecnico edita su pausada (sin firmar)', () => updateDoc(doc(tec, 'ordenes/o_pausa2'), { descripcionTrabajo: 'avance', fotosAntes: ['a'] }), true],
    ['tecnico cierra (firma) una pausada', () => updateDoc(doc(tec, 'ordenes/o_pausa2'), { firmada: true, pausa: false, estado: 'Terminada' }), true],
    ['supervisor NO desfirma una hoja', () => updateDoc(doc(sup, 'ordenes/o_firmada2'), { firmada: false }), false],
    ['admin NO desfirma una hoja', () => updateDoc(doc(adm, 'ordenes/o_firmada2'), { firmada: false }), false],
    ['supervisor reasigna el tecnico (panel)', () => updateDoc(doc(sup, 'ordenes/o_firmada2'), { tecnico: 'Otro Prueba' }), true],
    ['tecnico NO cambia el total de una cotizacion', () => updateDoc(doc(tec, 'cotizaciones/c2'), { total: 1 }), false],
    ['tecnico NO la marca Realizada y le cambia los items', () => updateDoc(doc(tec, 'cotizaciones/c2'), { estadoCot: 'Realizada', items: [] }), false],
    ['tecnico NO le cambia el estado a otro que Realizada', () => updateDoc(doc(tec, 'cotizaciones/c2'), { estadoCot: 'Aceptada' }), false],
    ['tecnico la marca Realizada con lo que manda la app', () => updateDoc(doc(tec, 'cotizaciones/c2'), { estadoCot: 'Realizada', otCompletadaNumero: '8', tecnicoRealizo: 'Tomas Prueba', otId: 'o_c2', otNumero: '8', fotosAntes: ['a'], firmaImagen: 'f', pdfUrl: '', contenidoActualizadoEn: 1 }), true],
    // ── revision final de Codex del PR #64 (P1-3): autoria y transiciones ──
    ['tecnico NO reemplaza el PDF de una hoja firmada', () => updateDoc(doc(tec, 'ordenes/o_con_pdf'), { pdfUrlCloudinary: 'https://otro' }), false],
    ['tecnico reenvia el MISMO enlace (reintento de la cola)', () => updateDoc(doc(tec, 'ordenes/o_con_pdf'), { pdfUrlCloudinary: 'https://viejo' }), true],
    ['tecnico NO sube la generacion del PDF (regenerar es del panel)', () => updateDoc(doc(tec, 'ordenes/o_con_pdf'), { pdfHojaGen: 2 }), false],
    ['tecnico NO rellena el PDF de una hoja firmada que subio otra sesion', () => updateDoc(doc(tec, 'ordenes/o_ajena'), { pdfUrlCloudinary: 'x' }), false],
    ['tecnico NO se pone de subidoPor en una hoja firmada ajena', () => updateDoc(doc(tec, 'ordenes/o_ajena'), { subidoPor: 'u_tec' }), false],
    // El payload REAL que mandaba sincronizarOTsPendientes hasta bf16f79 al reintentar una hoja que ya
    // estaba firmada: fotos re-subidas (URL nueva) y todo el contenido. La regla lo niega a proposito
    // (el contenido firmado no se reescribe); la app ya no lo manda: lee primero y, si esta firmada, solo
    // rellena el PDF (tests/la-hoja-firmada-no-se-traba-en-la-cola.js). Revisor y Codex, 24-10-2026.
    ['la cola NO reescribe las fotos ni la firma de una hoja ya firmada (payload real del reintento viejo)', () => setDoc(doc(tec, 'ordenes/o_propia'), {
      numero: 13, local: 'Local Prueba', tipo: 'correctivo', tecnico: 'Otro Prueba', fecha: '24-10-2026', descripcionProblema: '', ceco: '',
      descripcionTrabajo: 'x', pendientesMateriales: '', numEquipos: '', serviciosPreventivo: [],
      fotosAntes: ['https://res.cloudinary.com/x/nueva_antes_0.jpg'], fotosDespues: ['https://res.cloudinary.com/x/nueva_despues_0.jpg'],
      fotoTimbre: 'https://res.cloudinary.com/x/nueva_timbre.jpg', audios: [], firmada: true, firmaImagen: 'data:firma',
      pausa: false, enEspera: false, estado: 'Terminada', creadoEn: new Date(), subidoPor: 'u_tec' }, { merge: true }), false],
    ['tecnico rellena el PDF de la hoja que subio su sesion (telefono compartido)', () => updateDoc(doc(tec, 'ordenes/o_propia'), { pdfUrl: 'p', pdfUrlCloudinary: 'c', pdfHojaGen: 1 }), true],
    ['tecnico NO crea una orden con la sesion de otro en subidoPor', () => setDoc(doc(tec, 'ordenes/o_nueva_ajena'), { numero: 17, firmada: true, tecnico: 'Tomas Prueba', subidoPor: 'u_otro' }), false],
    ['tecnico crea una orden con su sesion en subidoPor', () => setDoc(doc(tec, 'ordenes/o_nueva_propia'), { numero: 18, firmada: true, tecnico: 'Tomas Prueba', subidoPor: 'u_tec' }), true],
    ['tecnico NO marca Realizada con una hoja que no declara esa cotizacion', () => updateDoc(doc(tec, 'cotizaciones/c3'), { estadoCot: 'Realizada', otId: 'o_cierre_c1' }), false],
    ['tecnico NO marca Realizada con una hoja sin firmar', () => updateDoc(doc(tec, 'cotizaciones/c3'), { estadoCot: 'Realizada', otId: 'o_c3_sinfirma' }), false],
    ['tecnico NO marca Realizada con la hoja de otro tecnico (le pega firma y fotos ajenas)', () => updateDoc(doc(tec, 'cotizaciones/c3'), { estadoCot: 'Realizada', otId: 'o_c3_ajena', firmaImagen: 'x', fotosAntes: ['y'] }), false],
    ['tecnico NO le cambia el vinculo (otId) a una cotizacion', () => updateDoc(doc(tec, 'cotizaciones/c4'), { estadoCot: 'Realizada', otId: 'o_c4b' }), false],
    ['tecnico NO vuelve a tocar una cotizacion ya Realizada (fotos, firma)', () => updateDoc(doc(tec, 'cotizaciones/c2'), { estadoCot: 'Realizada', fotosAntes: ['otra'] }), false],
    // ── administrador ──
    ['admin lee tecnicos', () => getDoc(doc(adm, 'tecnicos/u_tec')), true],
    ['admin NO escribe tecnicos desde la app (D1-B: lo hace el Admin SDK)', () => updateDoc(doc(adm, 'tecnicos/u_tec'), { pin: '0000' }), false],
    ['admin NO escribe el directorio desde la app (solo el Admin SDK)', () => setDoc(doc(adm, 'directorio/u_otro'), { nombre: 'Otro', cargo: 'Tecnico en terreno', activo: true }), false],
    ['admin escribe cadenas', () => updateDoc(doc(adm, 'cadenas/k1'), { nombre: 'CADENA 2' }), true],
    ['admin borra una hoja firmada', () => deleteDoc(doc(adm, 'ordenes/o_firmada')), true],
    ['admin NO borra un PDF', () => deleteDoc(doc(adm, 'pdfs/p_aleatorio')), false]
  ];

  let ok = 0, mal = 0;
  for (const [desc, hacer, debe] of casos) {
    let paso;
    try { await (debe ? assertSucceeds(hacer()) : assertFails(hacer())); paso = true; }
    catch (e) { paso = false; }
    if (paso) ok++; else mal++;
    console.log((paso ? '  ✓ ' : '  ✗ ') + desc + (paso ? '' : (debe ? '  (lo NEGO)' : '  (lo PERMITIO)')));
  }
  await env.cleanup();

  // Linea de control: si el guion se corta a medias no puede parecer aprobado.
  const total = ok + mal;
  console.log('\nReglas: ' + ARCHIVO + ' · ' + ok + ' de ' + total + ' casos como se espera' +
    (total === casos.length ? '' : ' · LINEA DE CONTROL: corrieron ' + total + ' de ' + casos.length));
  if (mal || total !== casos.length) { console.log('FALLA'); process.exit(1); }
  console.log('OK — cada rol puede lo que la app necesita, y nada mas.');
  process.exit(0);
})().catch(e => { console.error('FALLA — el guion se cayo:', e && e.message); process.exit(1); });
