/* Prueba de regresion — entrar a la app con Firebase Auth (etapa 1, 23-10-2026), con las
   correcciones de la revision de Codex del PR #64.

   Ejecuta el bloque REAL de index.html (desde `const AUTH_ETAPA` hasta verificarPasswordAdmin) y
   cerrarSesion, con un firebase.auth() falso y un localStorage en memoria. Que se exige:
   1. Con señal y el PIN de siempre entra, y el telefono guarda un verificador sin el PIN.
   2. Con señal y otro PIN no entra ("PIN incorrecto").
   3. Sin señal, en un telefono donde ya entro: entra "sin señal"; al volver la señal se abre su
      sesion de Firebase y el PIN se olvida de la memoria.
   4. Sin señal: otro PIN no entra; quien nunca entro aqui no entra y se le dice que necesita señal.
   5. Bloqueos de Firebase, cuenta desactivada, persona fuera del directorio y timeout.
   6. Sin el SDK de Auth (arranque en frio): sin señal sirve el verificador; con señal SE RECARGA el
      SDK y se entra (Codex P2-6).
   7. Firebase devuelve un UID que no es el de la ficha: no entra y se sale (Codex P1-2).
   8. Limite persistente: tras 5 fallos hay espera, ni el PIN correcto entra, y sobrevive a "recargar".
   9. El verificador se borra tras 5 fallos sin señal y vence a los 14 dias sin entrar con señal; lo que
      queda no tiene sal ni hash, y el mensaje dice cual de las dos paso (no "la primera vez").
   10. Administrador: no deja verificador; sin señal no entra; confirmar acciones lo hace Firebase.
   11. Entrar sin señal cierra la sesion de Firebase de OTRA persona que hubiera en el telefono.
   12. Salir cierra la sesion de Firebase: el Administrador en el acto; el tecnico con trabajo sin
       subir, cuando su cola se vacia (Codex P1-2).
   13. La entrada no esta habilitada en Firebase (proveedor apagado, apiKey o dominio no autorizados):
       dice eso y que se avise a CorexOn, no "sin señal"; no entra con el verificador, no cuenta como
       fallo y la sesion pendiente se conserva (revisor del PR #64, punto 2).
   14. (Revision final de Codex, P1-2) Una respuesta de Firebase que llega DESPUES del timeout no deja
       abierta otra cuenta (ni la de alguien que no esta en la app); la de quien entro, si.
   15. (P1-2) La salida diferida: sobrevive a recargar; elegir a alguien sin entrar no la frena; y quien
       entro sin señal y salio con cola conserva su credencial: al volver la señal la cola sube con su
       sesion y recien despues se cierra.
   16. (nuevo 7) Seis intentos equivocados A LA VEZ sin señal (seis pestañas) borran el verificador:
       los fallos no se pisan entre si.

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
const mSalir = src.match(/function cerrarSesion\(\) \{[\s\S]*?\n\}/);
chequear(!!mTimeout, 'no se encontro _conTimeout');
chequear(!!mSalir, 'no se encontro cerrarSesion');

// Valores SOLO de prueba.
const PIN_ANA = '4821', CLAVE_PEDRO = 'clave-solo-de-prueba-admin';
const DIA = 86400000;

function montar(op) {
  op = op || {};
  const mem = op.mem || {};
  const localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  const cuentas = {};
  const modo = { red: true, codigo: null, cuelga: false, tarda: 0, uidTarde: null, uidForzado: null, intentos: [], salidas: 0 };
  let actual = op.actual || null;
  const auth = {
    get currentUser() { return actual; },
    onAuthStateChanged(cb) { setTimeout(() => cb(actual), 0); return () => {}; },
    signOut() { modo.salidas++; actual = null; return Promise.resolve(); },
    signInWithEmailAndPassword(correo, clave) {
      modo.intentos.push(correo);
      if (modo.tarda) return new Promise(res => setTimeout(() => { actual = { uid: modo.uidTarde || correo.split('@')[0] }; res({ user: actual }); }, modo.tarda));
      if (modo.cuelga) return new Promise(() => {});
      if (!modo.red) return Promise.reject(Object.assign(new Error('red'), { code: 'auth/network-request-failed' }));
      if (modo.codigo) return Promise.reject(Object.assign(new Error('x'), { code: modo.codigo }));
      if (cuentas[correo] !== undefined && cuentas[correo] === clave) {
        actual = { uid: modo.uidForzado || correo.split('@')[0] };
        return Promise.resolve({ user: actual });
      }
      return Promise.reject(Object.assign(new Error('x'), { code: 'auth/invalid-credential' }));
    }
  };
  const window = { firebase: op.sinSdk ? {} : { auth: () => auth } };
  const scripts = [];
  const document = { head: { appendChild(s) { scripts.push(s); if (op.alCargarScript) op.alCargarScript(s, window, auth); } },
    createElement: () => ({}) };
  const navigator = { get onLine() { return modo.red; } };
  const toasts = [];
  const estado = { usuario: null, cargo: null };
  const colas = op.colas || { ots: [] };
  let respuestaPedir = null;
  const nav = [];
  const codigo = mTimeout[0] + '\n' + bloque.replace('const AUTH_MS_INICIO = 15000;', 'const AUTH_MS_INICIO = 300;') + '\n' + mSalir[0] +
    '\nreturn { _entrarConCuenta, _reintentarSesionPendiente, verificarPasswordAdmin, _correoDeCuenta, _claveFirebaseDePin,' +
    ' cerrarSesion, FICHAS: _FICHAS, pendiente: () => _credPendiente, PRIMERA_VEZ_CON_SENAL, ACCESO_DESACTIVADO, VERIF_KEY,' +
    // Con el codigo anterior a la revision no existen: la prueba falla en su tramo, no se cae.
    ' _completarSalidaDiferida: typeof _completarSalidaDiferida === "function" ? _completarSalidaDiferida : async function(){},' +
    ' diferida: function(){ return typeof _salidaDiferida !== "undefined" && _salidaDiferida; },' +
    ' enLaApp: function(){ return typeof _uidEnLaApp !== "undefined" ? _uidEnLaApp : "(no existe)"; },' +
    ' SIN_SENAL_VENCIDO: typeof SIN_SENAL_VENCIDO !== "undefined" ? SIN_SENAL_VENCIDO : "(no existe)",' +
    ' SIN_SENAL_TRAS_FALLOS: typeof SIN_SENAL_TRAS_FALLOS !== "undefined" ? SIN_SENAL_TRAS_FALLOS : "(no existe)",' +
    ' ENTRADA_NO_ACTIVADA: typeof ENTRADA_NO_ACTIVADA !== "undefined" ? ENTRADA_NO_ACTIVADA : "(no existe)",' +
    ' SIN_SENAL_PRIVILEGIADO: typeof SIN_SENAL_PRIVILEGIADO !== "undefined" ? SIN_SENAL_PRIVILEGIADO : "(no existe)" };';
  const api = new Function('window', 'localStorage', 'toast', '_pedirTexto', 'estado', 'document', 'navigator',
    '_obtenerOTsPendientes', 'cargarOTsPausadas', '_cargarCorreosPendientes', '_leerEnlacesPDFPendientes',
    '_leerCierresPausadaPendientes', '_leerBajasPendientes', 'guardarBorradorOTActual', 'go', codigo)(
    window, localStorage, m => toasts.push(m), async () => respuestaPedir, estado, document, navigator,
    async () => colas.ots, () => [], () => [], () => [], () => [], () => [], () => {}, id => nav.push(id));
  return { api, mem, cuentas, modo, toasts, estado, auth, scripts, colas, window,
    setPedir: v => { respuestaPedir = v; }, setActual: u => { actual = u; } };
}
function fichas(t) {
  t.api.FICHAS['Ana Prueba'] = { uid: 'u_ana', correo: t.api._correoDeCuenta('u_ana'), cargo: 'Tecnico en terreno' };
  t.api.FICHAS['Beto Prueba'] = { uid: 'u_beto', correo: t.api._correoDeCuenta('u_beto'), cargo: 'Tecnico en terreno' };
  t.api.FICHAS['Pedro Prueba'] = { uid: 'u_pedro', correo: t.api._correoDeCuenta('u_pedro'), cargo: 'Administrador' };
  t.cuentas[t.api._correoDeCuenta('u_ana')] = t.api._claveFirebaseDePin(PIN_ANA);
  t.cuentas[t.api._correoDeCuenta('u_beto')] = t.api._claveFirebaseDePin('7305');
  t.cuentas[t.api._correoDeCuenta('u_pedro')] = CLAVE_PEDRO;
}
const verifDe = (t, uid) => { try { return JSON.parse(t.mem[t.api.VERIF_KEY] || '{}')[uid]; } catch (e) { return undefined; } };

(async () => {
  console.log('Entrar con Firebase Auth: con señal, sin señal, la primera vez y los bloqueos\n');
  if (!bloque || !mTimeout || !mSalir) { terminar(); return; }
  const t = montar(); fichas(t); const { api } = t;

  // 1. Con señal
  const r1 = await api._entrarConCuenta('Ana Prueba', PIN_ANA, false);
  const verif = t.mem[api.VERIF_KEY] || '';
  const sinSecreto = verif && !verif.includes(PIN_ANA) && !verif.includes(api._claveFirebaseDePin(PIN_ANA));
  console.log('1) Con señal     → ' + (r1.ok && !r1.sinSenal ? 'entra ✓' : 'NO ENTRA ✗') + ', verificador ' + (verifDe(t, 'u_ana') ? 'guardado' : 'NO GUARDADO') + (sinSecreto ? ' sin el PIN ✓' : ' ✗'));
  chequear(r1.ok && !r1.sinSenal, 'con señal y su PIN, Ana no entra');
  chequear(!!verifDe(t, 'u_ana') && sinSecreto, 'no se guardo el verificador, o guarda el PIN en claro');

  // 2. PIN ajeno con señal
  const r2 = await api._entrarConCuenta('Ana Prueba', '0000', false);
  console.log('2) PIN ajeno     → ' + (r2.ok ? 'ENTRA ✗' : 'no entra ✓'));
  chequear(!r2.ok && /PIN incorrecto/.test(r2.msg), 'con señal y un PIN ajeno, Ana entra o no dice "PIN incorrecto"');

  // 3. Sin señal y vuelta de la señal
  t.setActual(null); t.modo.red = false;
  const r3 = await api._entrarConCuenta('Ana Prueba', PIN_ANA, false);
  const pend = api.pendiente();
  t.modo.red = true;
  await api._reintentarSesionPendiente();
  const usada = t.auth.currentUser && t.auth.currentUser.uid === 'u_ana';
  console.log('3) Sin señal     → ' + (r3.ok && r3.sinSenal ? 'entra sin señal ✓' : 'NO ✗') + '; vuelve la señal: ' + (usada && !api.pendiente() ? 'sesion de Firebase y PIN olvidado ✓' : 'NO ✗'));
  chequear(r3.ok && r3.sinSenal && pend && pend.uid === 'u_ana', 'sin señal, Ana no entra o no queda su sesion pendiente');
  chequear(usada && !api.pendiente(), 'al volver la señal no se abrio la sesion o el PIN siguio en memoria');

  // 4. Sin señal: PIN ajeno y primera vez
  t.modo.red = false;
  const r4 = await api._entrarConCuenta('Ana Prueba', '0000', false);
  const r5 = await api._entrarConCuenta('Beto Prueba', '7305', false);
  console.log('4) Sin señal     → PIN ajeno: ' + (r4.ok ? 'ENTRA ✗' : 'no ✓') + '; primera vez: ' + (!r5.ok && r5.msg === api.PRIMERA_VEZ_CON_SENAL ? 'pide señal ✓' : 'NO ✗'));
  chequear(!r4.ok && /PIN incorrecto/.test(r4.msg), 'sin señal, un PIN ajeno entra');
  chequear(!r5.ok && r5.msg === api.PRIMERA_VEZ_CON_SENAL, 'sin señal y sin haber entrado nunca, Beto entra o no se le dice que necesita señal');

  // 5. Rechazos de Firebase y timeout
  t.modo.red = true;
  t.modo.codigo = 'auth/too-many-requests'; const r6 = await api._entrarConCuenta('Beto Prueba', '7305', false);
  t.modo.codigo = 'auth/user-disabled'; const r7 = await api._entrarConCuenta('Beto Prueba', '7305', false);
  t.modo.codigo = null; const r8 = await api._entrarConCuenta('Nadie Prueba', '1234', false);
  t.modo.cuelga = true; const t0 = Date.now(); const r9 = await api._entrarConCuenta('Beto Prueba', '7305', false); const ms = Date.now() - t0; t.modo.cuelga = false;
  console.log('5) Rechazos      → bloqueo, desactivada, fuera del directorio, timeout (' + ms + ' ms): ' +
    [!r6.ok && /intentos/.test(r6.msg), !r7.ok && r7.msg === api.ACCESO_DESACTIVADO, !r8.ok, !r9.ok && r9.msg === api.PRIMERA_VEZ_CON_SENAL && ms < 5000].map(x => x ? '✓' : '✗').join(' '));
  chequear(!r6.ok && /intentos/.test(r6.msg), 'con demasiados intentos no se explica la causa');
  chequear(!r7.ok && r7.msg === api.ACCESO_DESACTIVADO, 'una cuenta desactivada entra o no dice por que');
  chequear(!r8.ok && r8.msg === api.ACCESO_DESACTIVADO, 'alguien fuera del directorio entra');
  chequear(!r9.ok && r9.msg === api.PRIMERA_VEZ_CON_SENAL && ms < 5000, 'un timeout no se trata como "sin señal" (o se cuelga)');

  // 6. Sin el SDK de Auth: sin señal el verificador; con señal se recarga
  const memAna = { [api.VERIF_KEY]: t.mem[api.VERIF_KEY] };
  const s1 = montar({ sinSdk: true, mem: Object.assign({}, memAna) }); fichas(s1);
  s1.modo.red = false;
  const r10 = await s1.api._entrarConCuenta('Ana Prueba', PIN_ANA, false);
  const s2 = montar({ sinSdk: true, mem: Object.assign({}, memAna), alCargarScript: (s, w, a) => setTimeout(() => { w.firebase.auth = () => a; s.onload(); }, 10) }); fichas(s2);
  const r11 = await s2.api._entrarConCuenta('Ana Prueba', PIN_ANA, false);
  const recargo = s2.scripts.length === 1 && /firebase-auth-compat\.js$/.test(s2.scripts[0].src || '');
  console.log('6) Sin SDK Auth  → sin señal: ' + (r10.ok && r10.sinSenal ? 'entra con el verificador ✓' : 'NO ✗') + '; con señal: ' + (recargo ? 'recarga el SDK' : 'NO LO RECARGA') + (r11.ok && !r11.sinSenal ? ' y entra con Firebase ✓' : ' ✗'));
  chequear(r10.ok && r10.sinSenal, 'sin el SDK de Auth y sin señal no se entra con el verificador local');
  chequear(recargo && r11.ok && !r11.sinSenal, 'con señal y sin el SDK de Auth no se recarga el SDK ni se entra con Firebase (Codex P2-6)');

  // 7. UID distinto
  const u = montar(); fichas(u);
  u.modo.uidForzado = 'u_otro';
  const r12 = await u.api._entrarConCuenta('Ana Prueba', PIN_ANA, false);
  console.log('7) UID distinto  → ' + (r12.ok ? 'ENTRA ✗' : 'no entra' + (u.auth.currentUser ? ', PERO QUEDA LA SESION ✗' : ' y se sale ✓')));
  chequear(!r12.ok && !u.auth.currentUser, 'Firebase devolvio otro UID y se entro igual, o quedo esa sesion (Codex P1-2)');

  // 8. Limite persistente de intentos
  const l = montar(); fichas(l);
  for (let k = 0; k < 5; k++) await l.api._entrarConCuenta('Beto Prueba', '0000', false);
  const r13 = await l.api._entrarConCuenta('Beto Prueba', '7305', false);   // el correcto, durante la espera
  const intentosAntes = l.modo.intentos.length;
  const l2 = montar({ mem: l.mem }); fichas(l2);                              // "recarga la pagina"
  const r14 = await l2.api._entrarConCuenta('Beto Prueba', '7305', false);
  console.log('8) Intentos      → tras 5 fallos, el PIN correcto: ' + (r13.ok ? 'ENTRA ✗' : 'espera ✓') + ', tras recargar: ' + (r14.ok ? 'ENTRA ✗' : 'sigue esperando ✓') +
    (intentosAntes === 5 && l2.modo.intentos.length === 0 ? ', sin preguntarle a Firebase ✓' : ', LE PREGUNTA A FIREBASE ✗'));
  chequear(!r13.ok && /Espera/.test(r13.msg) && !r14.ok, 'tras 5 fallos se puede seguir probando (o el limite no sobrevive a recargar)');
  chequear(intentosAntes === 5 && l2.modo.intentos.length === 0, 'durante la espera se le sigue preguntando a Firebase');

  // 9. El verificador se borra tras 5 fallos sin señal y vence a los 14 dias
  const v = montar(); fichas(v);
  await v.api._entrarConCuenta('Ana Prueba', PIN_ANA, false);      // con señal: deja verificador
  v.modo.red = false;
  for (let k = 0; k < 5; k++) await v.api._entrarConCuenta('Ana Prueba', '000' + k, false);
  const sinMaterial = x => !x || (!x.sal && !x.h);
  const sinVerif = sinMaterial(verifDe(v, 'u_ana'));
  delete v.mem['emval_intentos'];                                    // paso la espera de los 5 fallos
  const r15f = await v.api._entrarConCuenta('Ana Prueba', PIN_ANA, false);
  const v2 = montar({ mem: Object.assign({}, memAna) }); fichas(v2);
  const viejo = JSON.parse(v2.mem[v2.api.VERIF_KEY]); viejo['u_ana'].en = Date.now() - 15 * DIA; v2.mem[v2.api.VERIF_KEY] = JSON.stringify(viejo);
  v2.modo.red = false;
  const r15 = await v2.api._entrarConCuenta('Ana Prueba', PIN_ANA, false);
  const r15b = await v2.api._entrarConCuenta('Ana Prueba', PIN_ANA, false);   // y la vez siguiente
  const vencidoSinMaterial = sinMaterial(verifDe(v2, 'u_ana'));
  console.log('9) Verificador   → tras 5 fallos sin señal: ' + (sinVerif ? 'borrado ✓' : 'SIGUE ✗') + (r15f.msg === v.api.SIN_SENAL_TRAS_FALLOS ? ', lo dice ✓' : ', dice otra cosa ✗') +
    '; con 15 dias sin señal: ' + (!r15.ok && vencidoSinMaterial ? 'vencido, borrado' : 'ENTRA o SIGUE ✗') + (r15.msg === v2.api.SIN_SENAL_VENCIDO && r15b.msg === v2.api.SIN_SENAL_VENCIDO ? ', lo dice (tambien despues) ✓' : ', dice otra cosa ✗'));
  chequear(sinVerif, 'el verificador sobrevive a 5 PIN equivocados sin señal (se puede seguir probando fuera de linea)');
  chequear(!r15f.ok && r15f.msg === v.api.SIN_SENAL_TRAS_FALLOS, 'tras 5 PIN equivocados sin señal, el mensaje no dice por que hay que entrar con señal (dice "' + r15f.msg + '")');
  chequear(!r15.ok && !r15b.ok && vencidoSinMaterial, 'un verificador de 15 dias sin entrar con señal sigue sirviendo, o queda guardado');
  chequear(r15.msg === v2.api.SIN_SENAL_VENCIDO && r15b.msg === v2.api.SIN_SENAL_VENCIDO, 'con el verificador vencido, el mensaje dice "la primera vez" u otra cosa (regla 11)');

  // 10. Administrador
  const a = montar(); fichas(a);
  const r16 = await a.api._entrarConCuenta('Pedro Prueba', CLAVE_PEDRO, true);
  const pedroSinVerif = !verifDe(a, 'u_pedro');
  a.modo.red = false;
  const r17 = await a.api._entrarConCuenta('Pedro Prueba', CLAVE_PEDRO, true);
  a.modo.red = true; a.estado.usuario = 'Pedro Prueba';
  a.setPedir(CLAVE_PEDRO); const c1 = await a.api.verificarPasswordAdmin();
  a.setPedir('otra-clave'); const c2 = await a.api.verificarPasswordAdmin();
  a.modo.red = false; a.setPedir(CLAVE_PEDRO); const c3 = await a.api.verificarPasswordAdmin();
  console.log('10) Pedro        → con señal entra: ' + (r16.ok ? '✓' : '✗') + ', verificador: ' + (pedroSinVerif ? 'no deja ✓' : 'DEJA ✗') +
    ', sin señal: ' + (!r17.ok && r17.msg === a.api.SIN_SENAL_PRIVILEGIADO ? 'no entra ✓' : 'ENTRA ✗') + '; confirmar: su clave ' + (c1 ? '✓' : '✗') + ', otra ' + (c2 ? '✗' : '✓') + ', sin señal ' + (c3 ? '✗' : '✓'));
  chequear(r16.ok && pedroSinVerif, 'Pedro no entra con su clave, o deja un verificador de su clave en el telefono (Codex P1-1)');
  chequear(!r17.ok && r17.msg === a.api.SIN_SENAL_PRIVILEGIADO, 'Pedro entra sin señal sin que nadie verifique su clave');
  chequear(c1 && !c2 && !c3, 'confirmar acciones de Pedro no lo verifica Firebase (con su clave si, con otra no, sin señal no)');

  // 11. Entrar sin señal cierra la sesion de OTRA persona
  const o = montar({ mem: Object.assign({}, memAna), actual: { uid: 'u_pedro' } }); fichas(o);
  o.modo.red = false;
  const r18 = await o.api._entrarConCuenta('Ana Prueba', PIN_ANA, false);
  console.log('11) Sesion ajena → Ana entra sin señal con la sesion de Pedro abierta: ' + (r18.ok && !o.auth.currentUser ? 'la cierra ✓' : 'SIGUE LA DE PEDRO ✗'));
  chequear(r18.ok && !o.auth.currentUser, 'entrar sin señal deja la sesion de Firebase de otra persona (con sus permisos) abierta');

  // 12. Salir
  const x = montar(); fichas(x);
  await x.api._entrarConCuenta('Pedro Prueba', CLAVE_PEDRO, true); x.estado.usuario = 'Pedro Prueba'; x.estado.cargo = 'Administrador';
  x.api.cerrarSesion(); await new Promise(r => setTimeout(r, 30));
  const adminFuera = !x.auth.currentUser;
  const y = montar({ colas: { ots: [{ id: 1 }] } }); fichas(y);
  await y.api._entrarConCuenta('Ana Prueba', PIN_ANA, false); y.estado.usuario = 'Ana Prueba'; y.estado.cargo = 'Tecnico en terreno';
  y.api.cerrarSesion(); await new Promise(r => setTimeout(r, 30));
  const conservada = !!y.auth.currentUser && y.api.diferida();
  y.colas.ots = [];
  await y.api._completarSalidaDiferida();
  const cerradaAlVaciar = !y.auth.currentUser && !y.api.diferida();
  console.log('12) Salir        → Pedro: ' + (adminFuera ? 'sesion cerrada ✓' : 'SIGUE ABIERTA ✗') + '; tecnico con cola: ' + (conservada ? 'la conserva' : 'NO LA CONSERVA') +
    (cerradaAlVaciar ? ' y la cierra al vaciarse ✓' : ' ✗'));
  chequear(adminFuera, 'al salir, la sesion de Firebase del Administrador sigue abierta en el navegador (Codex P1-2)');
  chequear(conservada && cerradaAlVaciar, 'al salir, la sesion del tecnico con trabajo sin subir se cierra antes de tiempo o no se cierra nunca');

  // 13. La entrada no esta habilitada en el proyecto
  const CODIGOS = ['auth/operation-not-allowed', 'auth/app-not-authorized', 'auth/invalid-api-key', 'auth/unauthorized-domain'];
  const res13 = [];
  for (const cod of CODIGOS) {
    const n = montar({ mem: Object.assign({}, memAna) }); fichas(n);
    n.modo.codigo = cod;
    const msg = n.api.ENTRADA_NO_ACTIVADA;
    const rA = await n.api._entrarConCuenta('Ana Prueba', PIN_ANA, false);       // tiene verificador
    const rB = await n.api._entrarConCuenta('Beto Prueba', '7305', false);       // no tiene
    const rP = await n.api._entrarConCuenta('Pedro Prueba', CLAVE_PEDRO, true);
    for (let k = 0; k < 5; k++) await n.api._entrarConCuenta('Beto Prueba', '7305', false);
    n.estado.usuario = 'Pedro Prueba'; n.setPedir(CLAVE_PEDRO);
    const conf = await n.api.verificarPasswordAdmin();
    const toastConf = n.toasts[n.toasts.length - 1];
    n.modo.codigo = null;
    const rB2 = await n.api._entrarConCuenta('Beto Prueba', '7305', false);      // ya habilitada: sin espera
    const p = montar({ mem: Object.assign({}, memAna) }); fichas(p);
    p.modo.red = false; await p.api._entrarConCuenta('Ana Prueba', PIN_ANA, false);
    p.modo.red = true; p.modo.codigo = cod; await p.api._reintentarSesionPendiente();
    const ok = { avisa: [rA, rB, rP].every(r => !r.ok && r.msg === msg), conf: !conf && toastConf === msg, sinFallo: rB2.ok, pendiente: !!p.api.pendiente() };
    res13.push(Object.assign({ cod }, ok));
    chequear(ok.avisa, cod + ': no dice que la entrada no esta activada (o entra con el verificador, o dice "sin señal")');
    chequear(ok.conf, cod + ': al confirmar una accion del administrador no dice que la entrada no esta activada');
    chequear(ok.sinFallo, cod + ': cuenta como intento fallido (despues de habilitarla, el PIN correcto queda esperando)');
    chequear(ok.pendiente, cod + ': se descarto la sesion pendiente de quien entro sin señal');
  }
  const todo = k => res13.every(r => r[k]) ? '✓' : '✗';
  console.log('13) No activada  → ' + CODIGOS.length + ' codigos: lo dice (tecnico con y sin verificador, Pedro) ' + todo('avisa') + ', al confirmar ' + todo('conf') +
    ', no cuenta como fallo ' + todo('sinFallo') + ', conserva la pendiente ' + todo('pendiente'));

  // 14. Respuesta de Firebase despues del timeout
  const espera = ms => new Promise(r => setTimeout(r, ms));
  const t1 = montar(); fichas(t1);
  t1.modo.tarda = 500; t1.modo.uidTarde = 'u_otro';
  const r19 = await t1.api._entrarConCuenta('Beto Prueba', '7305', false);   // sin verificador: no entra
  await espera(700);
  const otraCerrada = !t1.auth.currentUser;
  const t2 = montar(); fichas(t2);
  t2.modo.tarda = 500;                                                       // la cuenta correcta, pero nadie entro
  await t2.api._entrarConCuenta('Beto Prueba', '7305', false);
  await espera(700);
  const nadieCerrada = !t2.auth.currentUser;
  const t3 = montar({ mem: Object.assign({}, memAna) }); fichas(t3);
  t3.modo.tarda = 500;                                                       // Ana entra sin señal (verificador) y la respuesta llega
  const r20 = await t3.api._entrarConCuenta('Ana Prueba', PIN_ANA, false);
  await espera(700);
  const anaQueda = !!t3.auth.currentUser && t3.auth.currentUser.uid === 'u_ana' && !t3.api.pendiente();
  console.log('14) Tardia      → otra cuenta: ' + (otraCerrada ? 'se cierra ✓' : 'QUEDA ABIERTA ✗') + ' · la correcta sin nadie en la app: ' +
    (nadieCerrada ? 'se cierra ✓' : 'QUEDA ABIERTA ✗') + ' · la de quien entro: ' + (r20.ok && anaQueda ? 'se queda ✓' : 'NO ✗'));
  chequear(!r19.ok && otraCerrada, 'una respuesta tardia de Firebase dejo autenticada otra cuenta (Codex P1-2)');
  chequear(nadieCerrada, 'una respuesta tardia dejo una sesion abierta sin nadie en la app');
  chequear(r20.ok && anaQueda, 'la respuesta tardia de quien si entro no le dejo su sesion');

  // 15. Salida diferida
  // a) recargar
  const d1 = montar({ colas: { ots: [{ id: 1 }] } }); fichas(d1);
  await d1.api._entrarConCuenta('Ana Prueba', PIN_ANA, false); d1.estado.usuario = 'Ana Prueba'; d1.estado.cargo = 'Tecnico en terreno';
  d1.api.cerrarSesion(); await espera(30);
  const d1b = montar({ mem: d1.mem, actual: d1.auth.currentUser, colas: { ots: [] } }); fichas(d1b);   // "recarga"; la sesion de Firebase persiste
  await d1b.api._completarSalidaDiferida();
  const trasRecargar = !d1b.auth.currentUser;
  // b) elegir a otra persona en la lista, sin entrar
  const d2 = montar({ colas: { ots: [{ id: 1 }] } }); fichas(d2);
  await d2.api._entrarConCuenta('Ana Prueba', PIN_ANA, false); d2.estado.usuario = 'Ana Prueba'; d2.estado.cargo = 'Tecnico en terreno';
  d2.api.cerrarSesion(); await espera(30);
  d2.estado.usuario = 'Beto Prueba';                                          // la eligieron en la lista; no puso su PIN
  d2.colas.ots = [];
  await d2.api._completarSalidaDiferida();
  const trasElegir = !d2.auth.currentUser;
  // c) entrar sin señal (sin sesion), salir con cola y volver la señal
  const d3 = montar({ mem: Object.assign({}, memAna), colas: { ots: [{ id: 1 }] } }); fichas(d3);
  d3.modo.red = false;
  await d3.api._entrarConCuenta('Ana Prueba', PIN_ANA, false); d3.estado.usuario = 'Ana Prueba'; d3.estado.cargo = 'Tecnico en terreno';
  d3.api.cerrarSesion(); await espera(30);
  const credGuardada = !!d3.api.pendiente();
  d3.modo.red = true;
  await d3.api._reintentarSesionPendiente();
  const subeConSesion = !!d3.auth.currentUser && d3.auth.currentUser.uid === 'u_ana';
  d3.colas.ots = [];
  await d3.api._completarSalidaDiferida();
  const cerradaDespues = !d3.auth.currentUser;
  console.log('15) Diferida    → tras recargar: ' + (trasRecargar ? 'se cierra al vaciarse ✓' : 'QUEDA ABIERTA ✗') + ' · eligiendo a otro sin entrar: ' +
    (trasElegir ? 'se cierra ✓' : 'QUEDA ABIERTA ✗') + ' · sin señal y con cola: ' + (credGuardada && subeConSesion ? 'la cola sube con su sesion' : 'SIN SESION PARA SUBIR') +
    (cerradaDespues ? ' y despues se cierra ✓' : ' ✗'));
  chequear(trasRecargar, 'al recargar se pierde la salida diferida y la sesion queda abierta para siempre (Codex P1-2)');
  chequear(trasElegir, 'elegir a alguien en la lista sin entrar frena el cierre de la salida diferida (Codex P1-2)');
  chequear(credGuardada && subeConSesion && cerradaDespues, 'quien entro sin señal y salio con cola no sube su cola con su sesion al volver la señal, o la sesion no se cierra despues (Codex P1-2)');

  // 16. Seis intentos equivocados a la vez, sin señal
  const c6 = montar({ mem: Object.assign({}, memAna) }); fichas(c6);
  c6.modo.red = false;
  await Promise.all([0, 1, 2, 3, 4, 5].map(k => c6.api._entrarConCuenta('Ana Prueba', '000' + k, false)));
  const v6 = verifDe(c6, 'u_ana');
  const borrado6 = !v6 || (!v6.sal && !v6.h);
  console.log('16) A la vez    → seis PIN equivocados juntos sin señal: verificador ' + (borrado6 ? 'borrado ✓' : 'SIGUE (' + (v6.fallos || 0) + ' fallos guardados) ✗'));
  chequear(borrado6, 'seis intentos simultaneos dejaron el verificador: los fallos se pisaron entre si (Codex, nuevo 7)');

  terminar();
})().catch(e => { console.error('FALLA — la prueba se cayo:', e && e.message); process.exit(1); });

function terminar() {
  console.log('');
  if (fallos.length) { console.log('FALLA (' + fallos.length + '):'); fallos.forEach(f => console.log(f)); process.exit(1); }
  console.log('OK — con señal entra Firebase (y el UID calza), sin señal el verificador del telefono, y los intentos y la salida quedan acotados.');
  process.exit(0);
}
