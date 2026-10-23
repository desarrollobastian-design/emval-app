/* Prueba de regresion — entrar a la app con Firebase Auth (etapa 1, 23-10-2026).

   Ejecuta el bloque REAL de index.html (desde `const AUTH_ETAPA` hasta verificarPasswordAdmin) con
   un firebase.auth() falso y un localStorage en memoria. Que se exige:
   1. Con señal y el PIN de siempre: entra, y el telefono guarda un verificador (PBKDF2) que NO
      contiene el PIN ni la clave.
   2. Con señal y otro PIN: no entra y dice "PIN incorrecto".
   3. Sin señal, en un telefono donde ya entro: entra "sin señal", y el PIN queda solo en memoria
      para iniciar sesion en Firebase al volver la señal (y se usa).
   4. Sin señal, con otro PIN: no entra. Sin señal y sin haber entrado nunca en ese telefono: no
      entra y dice que la primera vez hay que tener señal.
   5. Firebase bloquea por intentos / cuenta desactivada / persona fuera del directorio: no entra y
      dice por que. Un timeout es "sin señal" (no saber no es un rechazo).
   6. Sin el SDK de Auth (arranque en frio sin señal): el verificador local igual sirve.
   7. verificarPasswordAdmin: con su clave confirma; con otra no; sin verificador lo confirma Firebase.

   Uso:  node tests/entrar-con-firebase-auth.js index.html
   Sale 0 si todo se cumple; 1 si no. */

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); return !!ok; }

function extraer(desde, hasta, nombre) {
  const i = src.indexOf(desde);
  if (i < 0) { chequear(false, 'no se encontro ' + nombre + ' (¿se renombro?)'); return null; }
  const j = src.indexOf(hasta, i);
  if (j < 0) { chequear(false, 'no se encontro el final de ' + nombre); return null; }
  return src.slice(i, j);
}
const bloque = extraer('const AUTH_ETAPA = 1;', '// =========== NAVEGACION', 'el bloque de Firebase Auth');
const mTimeout = src.match(/function _conTimeout\(promise, ms, etiqueta\) \{[\s\S]*?\n\}/);
chequear(!!mTimeout, 'no se encontro _conTimeout');

// Valores SOLO de prueba.
const PIN_ANA = '4821', CLAVE_PEDRO = 'clave-solo-de-prueba-admin';

function montar() {
  const mem = {};
  const localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  const cuentas = {};            // correo -> clave (lo que "sabe" Firebase)
  const modo = { red: true, codigo: null, cuelga: false, intentos: [] };
  let actual = null;
  const auth = {
    get currentUser() { return actual; },
    onAuthStateChanged(cb) { setTimeout(() => cb(actual), 0); return () => {}; },
    signInWithEmailAndPassword(correo, clave) {
      modo.intentos.push(correo);
      if (modo.cuelga) return new Promise(() => {});
      if (!modo.red) return Promise.reject(Object.assign(new Error('red'), { code: 'auth/network-request-failed' }));
      if (modo.codigo) return Promise.reject(Object.assign(new Error('x'), { code: modo.codigo }));
      if (cuentas[correo] !== undefined && cuentas[correo] === clave) { actual = { uid: correo.split('@')[0] }; return Promise.resolve({ user: actual }); }
      return Promise.reject(Object.assign(new Error('x'), { code: 'auth/invalid-credential' }));
    }
  };
  const window = { firebase: { auth: () => auth } };
  const toasts = [];
  const estado = { usuario: null };
  let respuestaPedir = null;
  const codigo = mTimeout[0] + '\n' + bloque.replace('const AUTH_MS_INICIO = 15000;', 'const AUTH_MS_INICIO = 300;') +
    '\nreturn { _entrarConCuenta, _reintentarSesionPendiente, verificarPasswordAdmin, _correoDeCuenta, _claveFirebaseDePin,' +
    ' FICHAS: _FICHAS, pendiente: () => _credPendiente, PRIMERA_VEZ_CON_SENAL, ACCESO_DESACTIVADO };';
  const api = new Function('window', 'localStorage', 'toast', '_pedirTexto', 'estado', codigo)(
    window, localStorage, m => toasts.push(m), async () => respuestaPedir, estado);
  return { api, mem, cuentas, modo, toasts, estado, auth, setPedir: v => { respuestaPedir = v; }, setActual: u => { actual = u; } };
}

(async () => {
  console.log('Entrar con Firebase Auth: con señal, sin señal y la primera vez\n');
  if (!bloque || !mTimeout) { terminar(); return; }
  const t = montar();
  const { api } = t;
  api.FICHAS['Ana Prueba'] = { uid: 'u_ana', correo: api._correoDeCuenta('u_ana'), cargo: 'Tecnico en terreno' };
  api.FICHAS['Beto Prueba'] = { uid: 'u_beto', correo: api._correoDeCuenta('u_beto'), cargo: 'Tecnico en terreno' };
  api.FICHAS['Pedro Prueba'] = { uid: 'u_pedro', correo: api._correoDeCuenta('u_pedro'), cargo: 'Administrador' };
  t.cuentas[api._correoDeCuenta('u_ana')] = api._claveFirebaseDePin(PIN_ANA);
  t.cuentas[api._correoDeCuenta('u_beto')] = api._claveFirebaseDePin('7305');
  t.cuentas[api._correoDeCuenta('u_pedro')] = CLAVE_PEDRO;

  // 1. Con señal
  const r1 = await api._entrarConCuenta('Ana Prueba', PIN_ANA, false);
  const verif = t.mem['emval_verificadores'] || '';
  const sinSecreto = verif && !verif.includes(PIN_ANA) && !verif.includes(api._claveFirebaseDePin(PIN_ANA));
  console.log('1) Con señal    → ' + (r1.ok && !r1.sinSenal ? 'entra ✓' : 'NO ENTRA ✗') + ', verificador ' + (verif.includes('u_ana') ? 'guardado' : 'NO GUARDADO') + (sinSecreto ? ' sin el PIN ✓' : ' ✗'));
  chequear(r1.ok && !r1.sinSenal, 'con señal y su PIN, Ana no entra');
  chequear(verif.includes('u_ana'), 'no se guardo el verificador local tras entrar con señal');
  chequear(sinSecreto, 'el verificador del telefono contiene el PIN o la clave en claro');

  // 2. Con señal, PIN ajeno
  const r2 = await api._entrarConCuenta('Ana Prueba', '0000', false);
  console.log('2) PIN ajeno    → ' + (r2.ok ? 'ENTRA ✗' : 'no entra: "' + r2.msg + '" ✓'));
  chequear(!r2.ok && /PIN incorrecto/.test(r2.msg), 'con señal y un PIN ajeno, Ana entra o no se le dice "PIN incorrecto"');

  // 3. Sin señal, ya entro antes en este telefono
  t.setActual(null);
  t.modo.red = false;
  const r3 = await api._entrarConCuenta('Ana Prueba', PIN_ANA, false);
  const pend = api.pendiente();
  console.log('3) Sin señal    → ' + (r3.ok && r3.sinSenal ? 'entra sin señal ✓' : 'NO ENTRA ✗') + ', sesion pendiente ' + (pend && pend.uid === 'u_ana' ? 'en memoria ✓' : 'NO ✗') +
    (JSON.stringify(t.mem).includes(api._claveFirebaseDePin(PIN_ANA)) ? ', PIN EN EL TELEFONO ✗' : ', nada en el telefono ✓'));
  chequear(r3.ok && r3.sinSenal, 'sin señal, Ana (que ya entro en este telefono) no entra');
  chequear(pend && pend.uid === 'u_ana', 'la sesion de Firebase no quedo pendiente para cuando vuelva la señal');
  chequear(!JSON.stringify(t.mem).includes(api._claveFirebaseDePin(PIN_ANA)), 'la clave quedo guardada en el telefono');
  t.modo.red = true;
  await api._reintentarSesionPendiente();
  const usada = t.auth.currentUser && t.auth.currentUser.uid === api._correoDeCuenta('u_ana').split('@')[0];
  console.log('   vuelve señal → ' + (usada && !api.pendiente() ? 'inicia sesion en Firebase y olvida el PIN ✓' : 'NO ✗'));
  chequear(usada && !api.pendiente(), 'al volver la señal no se inicio sesion en Firebase o el PIN siguio en memoria');

  // 4. Sin señal: PIN ajeno, y primera vez en el telefono
  t.modo.red = false;
  const r4 = await api._entrarConCuenta('Ana Prueba', '0000', false);
  const r5 = await api._entrarConCuenta('Beto Prueba', '7305', false);
  console.log('4) Sin señal    → PIN ajeno: ' + (r4.ok ? 'ENTRA ✗' : 'no ✓') + '; primera vez en el telefono: ' + (r5.ok ? 'ENTRA ✗' : (r5.msg === api.PRIMERA_VEZ_CON_SENAL ? 'no, y dice que entre con señal ✓' : 'no, pero dice "' + r5.msg + '" ✗')));
  chequear(!r4.ok && /PIN incorrecto/.test(r4.msg), 'sin señal, un PIN ajeno entra o no dice "PIN incorrecto"');
  chequear(!r5.ok && r5.msg === api.PRIMERA_VEZ_CON_SENAL, 'sin señal y sin haber entrado nunca, Beto entra o no se le dice que necesita señal');

  // 5. Rechazos de Firebase y timeout
  t.modo.red = true;
  t.modo.codigo = 'auth/too-many-requests';
  const r6 = await api._entrarConCuenta('Beto Prueba', '7305', false);
  t.modo.codigo = 'auth/user-disabled';
  const r7 = await api._entrarConCuenta('Beto Prueba', '7305', false);
  t.modo.codigo = null;
  const r8 = await api._entrarConCuenta('Nadie Prueba', '1234', false);
  t.modo.cuelga = true;
  const t0 = Date.now();
  const r9 = await api._entrarConCuenta('Beto Prueba', '7305', false);
  const ms = Date.now() - t0;
  t.modo.cuelga = false;
  console.log('5) Rechazos     → bloqueo: ' + (!r6.ok && /intentos/.test(r6.msg) ? 'dice por que ✓' : 'NO ✗') + ', desactivado: ' + (!r7.ok && r7.msg === api.ACCESO_DESACTIVADO ? 'dice por que ✓' : 'NO ✗') +
    ', fuera del directorio: ' + (!r8.ok && r8.msg === api.ACCESO_DESACTIVADO ? 'no entra ✓' : 'ENTRA ✗') + ', timeout (' + ms + ' ms): ' + (!r9.ok && r9.msg === api.PRIMERA_VEZ_CON_SENAL ? 'se trata como sin señal ✓' : 'NO ✗'));
  chequear(!r6.ok && /intentos/.test(r6.msg), 'con demasiados intentos no se explica la causa');
  chequear(!r7.ok && r7.msg === api.ACCESO_DESACTIVADO, 'una cuenta desactivada entra o no dice por que');
  chequear(!r8.ok && r8.msg === api.ACCESO_DESACTIVADO, 'alguien fuera del directorio entra');
  chequear(!r9.ok && r9.msg === api.PRIMERA_VEZ_CON_SENAL && ms < 5000, 'un timeout no se trata como "sin señal" (o se cuelga)');

  // 6. Sin el SDK de Auth
  // Un window sin firebase.auth: arranque en frio sin el script de Auth, con el verificador de (1).
  const sinSdk = new Function('window', 'localStorage', 'toast', '_pedirTexto', 'estado',
    mTimeout[0] + '\n' + bloque + '\nreturn { _entrarConCuenta, FICHAS: _FICHAS };')(
    { firebase: {} }, { getItem: k => (k === 'emval_verificadores' ? t.mem['emval_verificadores'] : null), setItem() {}, removeItem() {} },
    () => {}, async () => null, {});
  sinSdk.FICHAS['Ana Prueba'] = { uid: 'u_ana', correo: 'u_ana@x', cargo: 'Tecnico en terreno' };
  const r10 = await sinSdk._entrarConCuenta('Ana Prueba', PIN_ANA, false);
  console.log('6) Sin SDK Auth → ' + (r10.ok && r10.sinSenal ? 'entra con el verificador del telefono ✓' : 'NO ENTRA ✗'));
  chequear(r10.ok && r10.sinSenal, 'sin el SDK de Auth (arranque en frio sin señal) no se entra con el verificador local');

  // 7. Confirmar acciones de administrador
  t.modo.red = true;
  t.estado.usuario = 'Pedro Prueba';
  await api._entrarConCuenta('Pedro Prueba', CLAVE_PEDRO, true);   // deja su verificador
  t.setPedir(CLAVE_PEDRO);
  const c1 = await api.verificarPasswordAdmin();
  t.setPedir('otra-clave');
  const c2 = await api.verificarPasswordAdmin();
  const vs = JSON.parse(t.mem['emval_verificadores']); delete vs['u_pedro']; t.mem['emval_verificadores'] = JSON.stringify(vs);
  t.setPedir(CLAVE_PEDRO);
  const c3 = await api.verificarPasswordAdmin();
  console.log('7) Confirmar    → con su clave: ' + (c1 ? 'si ✓' : 'NO ✗') + ', con otra: ' + (c2 ? 'SI ✗' : 'no ✓') + ', sin verificador: ' + (c3 ? 'lo confirma Firebase ✓' : 'NO ✗'));
  chequear(c1, 'Pedro no puede confirmar acciones con su clave');
  chequear(!c2, 'Pedro confirma acciones con una clave que no es la suya');
  chequear(c3, 'sin verificador en el telefono, Firebase no confirma la clave de Pedro');

  terminar();
})().catch(e => { console.error('FALLA — la prueba se cayo:', e && e.message); process.exit(1); });

function terminar() {
  console.log('');
  if (fallos.length) { console.log('FALLA (' + fallos.length + '):'); fallos.forEach(f => console.log(f)); process.exit(1); }
  console.log('OK — con señal entra Firebase, sin señal el verificador del telefono, y la primera vez exige señal.');
  process.exit(0);
}
