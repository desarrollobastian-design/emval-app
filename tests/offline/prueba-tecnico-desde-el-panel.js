/* Pedro agrega a un tecnico desde el panel, el tecnico entra desde SU telefono con el PIN que Pedro le
   dio, y Pedro le cambia el PIN, lo da de baja y lo reactiva (14-11-2026, pedido de Pedro).

   La prueba unitaria (tests/tecnicos-se-gestionan-desde-el-panel.js) corre las funciones sueltas. Esta
   entra por la interfaz, en dos telefonos que comparten la misma nube y las mismas cuentas de Firebase
   (falsas: el SDK ni se carga), para ver que todo calce: boton → formulario → cuenta → fichas →
   pantalla de entrada del otro telefono → su PIN.

   Tramos:
     1. LINEA DE CONTROL: Pedro entra y abre Administrar → Personal; ve a Lucas, Rosa y a si mismo.
     2. "+ Agregar técnico": Nelson con PIN 5678. Quedan su cuenta y sus dos fichas con el uid y el
        correo de esa cuenta, y aparece en la lista.            ← aca falla la version publicada
     3. Un nombre repetido (tildes y mayusculas) no crea nada.
     4. El telefono de Nelson lo ve en la pantalla de entrada y entra con 5678.
     5. Pedro le cambia el PIN a 1357: con señal, 5678 ya no entra y 1357 si.
     6. Pedro lo da de baja: desaparece de la entrada. Lo reactiva: vuelve.
     7. Rosa (Supervisor) y Pedro no tienen botones en su fila: eso lo hace CorexOn.
     8. La sesion de Pedro sigue siendo la de Pedro (la cuenta de Nelson se creo aparte).

   Uso:
     export NODE_PATH="C:/Users/corex/AppData/Roaming/npm/node_modules"
     node tests/offline/preparar.js origin/main
     cd tests/offline/sitio && python -m http.server 8765
     node tests/offline/prueba-tecnico-desde-el-panel.js http://127.0.0.1:8765/index.html    # 0
     node tests/offline/prueba-tecnico-desde-el-panel.js http://127.0.0.1:8765/prefix.html   # CONTRAPRUEBA: 1 */

const { chromium } = require('playwright');
const { crearNube, STUB_NUBE } = require('./nube-compartida');

const URL = process.argv[2] || 'http://127.0.0.1:8765/index.html';
const fallos = [];
const P = (...a) => console.log(...a);
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); return !!ok; }

const DOM = 'emval-app.firebaseapp.com';
const CLAVE_PRUEBA = 'clave-solo-de-prueba';   // no es la de nadie
const LUCAS = 'Lucas Fernández';
const NELSON = 'Nelson Prueba';

const nube = crearNube({
  tecnicos: [
    { _id: 'u_pedro', nombre: 'Pedro Arce', cargo: 'Administrador', letra: 'P', passwordHash: 'x' },
    { _id: 'u_lucas', nombre: LUCAS, cargo: 'Tecnico en terreno', pin: '2222', letra: 'L' },
    { _id: 'u_rosa', nombre: 'Rosa Pinto', cargo: 'Supervisor', pin: '4444', letra: 'R' }
  ],
  directorio: [
    { _id: 'u_pedro', nombre: 'Pedro Arce', cargo: 'Administrador', letra: 'P', correo: 'u_pedro@' + DOM, activo: true },
    { _id: 'u_lucas', nombre: LUCAS, cargo: 'Tecnico en terreno', letra: 'L', correo: 'u_lucas@' + DOM, activo: true },
    { _id: 'u_rosa', nombre: 'Rosa Pinto', cargo: 'Supervisor', letra: 'R', correo: 'u_rosa@' + DOM, activo: true }
  ],
  cadenas: [{ _id: 'c1', nombre: 'UNIMARC', color: '#DC2626', logo: '', letra: 'U', orden: 0, sucursales: [{ nombre: 'UNIMARC PENCO', centro: '720' }] }],
  ordenes: [], pdfs: [], cotizaciones: []
});

// Cuentas de Firebase Auth, compartidas entre telefonos (viven en Node, como en el servidor de Firebase).
const cuentas = new Map([
  ['u_pedro@' + DOM, { uid: 'u_pedro', clave: CLAVE_PRUEBA }],
  ['u_lucas@' + DOM, { uid: 'u_lucas', clave: 'emval-pin-2222' }],
  ['u_rosa@' + DOM, { uid: 'u_rosa', clave: 'emval-pin-4444' }]
]);
const registro = [];   // { op, correo, app }
let nUid = 0;
function manejarCuenta(op) {
  registro.push({ op: op.tipo, correo: op.correo, app: op.app });
  if (op.tipo === 'entrar') {
    const c = cuentas.get(String(op.correo).toLowerCase());
    if (!c || c.clave !== op.clave) return { error: 'auth/invalid-credential' };
    return { uid: c.uid };
  }
  if (op.tipo === 'crear') {
    if (cuentas.has(op.correo)) return { error: 'auth/email-already-in-use' };
    const uid = 'FbUid' + (++nUid) + 'QwErTy';
    cuentas.set(op.correo, { uid, clave: op.clave });
    return { uid };
  }
  if (op.tipo === 'clave') {
    for (const [, c] of cuentas) if (c.uid === op.uid) { c.clave = op.clave; return {}; }
    return { error: 'auth/user-not-found' };
  }
  return {};
}

// Firebase Auth falso para esta prueba: la instancia principal (persistente, la de quien esta en la app)
// y las instancias aparte que abre el panel (firebase.initializeApp(opts, nombre)).
const STUB_CUENTAS = `(function(){
  if (window.__CUENTAS_STUB) return; window.__CUENTAS_STUB = true;
  function err(c){ return Object.assign(new Error(c), { code: c }); }
  function crearAuth(app, persistente) {
    var actual = null, oyentes = [];
    if (persistente) { try { var u = localStorage.getItem('__auth_stub_uid'); if (u) actual = { uid: u }; } catch (e) {} }
    function poner(uid, correo) {
      actual = uid ? { uid: uid, email: correo, updatePassword: function(clave){
        return window.__cuentas({ tipo: 'clave', uid: uid, clave: clave, app: app }).then(function(r){ if (r.error) throw err(r.error); }); } } : null;
      if (persistente) { try { uid ? localStorage.setItem('__auth_stub_uid', uid) : localStorage.removeItem('__auth_stub_uid'); } catch (e) {} }
      oyentes.forEach(function(cb){ try { cb(actual); } catch (e) {} });
    }
    return {
      get currentUser() { return actual; },
      onAuthStateChanged: function(cb){ oyentes.push(cb); setTimeout(function(){ try { cb(actual); } catch (e) {} }, 0); return function(){}; },
      setPersistence: function(){ return Promise.resolve(); },
      signInWithEmailAndPassword: function(correo, clave) {
        return window.__cuentas({ tipo: 'entrar', correo: correo, clave: clave, app: app }).then(function(r){
          if (r.error) throw err(r.error); poner(r.uid, correo); return { user: actual }; });
      },
      createUserWithEmailAndPassword: function(correo, clave) {
        return window.__cuentas({ tipo: 'crear', correo: correo, clave: clave, app: app }).then(function(r){
          if (r.error) throw err(r.error); poner(r.uid, correo); return { user: actual }; });
      },
      signOut: function(){ poner(null); return Promise.resolve(); }
    };
  }
  var principal = crearAuth('principal', true);
  window.firebase.auth = Object.assign(function(){ return principal; }, { Auth: { Persistence: { NONE: 'none', LOCAL: 'local' } } });
  window.firebase.app = function(){ return { options: { projectId: 'demo-emval' } }; };
  window.__appsAparte = 0; window.__appsCerradas = 0;
  window.firebase.initializeApp = function(opts, nombre) {
    window.__appsAparte++;
    var a = crearAuth(nombre || 'aparte', false);
    return { name: nombre, auth: function(){ return a; }, delete: function(){ window.__appsCerradas++; return Promise.resolve(); } };
  };
})()`;

async function abrirApp(page) {
  await page.goto(URL);
  await page.waitForTimeout(600);
  await page.evaluate(STUB_NUBE);
  await page.evaluate(STUB_CUENTAS);
  await page.evaluate(() => { cargarUsuariosApp(); cargarCadenasApp(); });
  await page.waitForTimeout(700);
}
async function entrarConPin(page, nombre, pin) {
  await page.locator('.usuario-item', { hasText: nombre }).first().click();
  await page.waitForTimeout(300);
  for (const d of pin) await page.locator('button.pin-btn', { hasText: new RegExp('^' + d + '$') }).first().click();
  await page.waitForTimeout(1500);
  // `estado.usuario` queda puesto desde que se toca el nombre (seleccionarUsuario), ANTES del PIN: entro
  // solo si salio de la pantalla del PIN.
  return page.evaluate(() => {
    const activa = (document.querySelector('.screen.active') || {}).id || '';
    return (activa && activa !== 's-pin' && activa !== 's-usuarios' && typeof estado !== 'undefined' && estado.usuario) || '';
  });
}
async function salir(page) {
  await page.evaluate(() => { try { cerrarSesion(); } catch (e) {} });
  await page.waitForTimeout(600);
  await page.evaluate(() => { try { go('s-usuarios'); cargarUsuariosApp(); } catch (e) {} });
  await page.waitForTimeout(600);
}
const enEntrada = page => page.$$eval('#lista-usuarios .usuario-item', els => els.map(e => e.innerText.split('\n').join(' ')));
const filas = page => page.$$eval('#lista-tecnicos-admin .card', els => els.map(e => ({
  nombre: e.getAttribute('data-tecnico'), texto: e.innerText, botones: [...e.querySelectorAll('button')].map(b => b.textContent) })));
const toast = page => page.$eval('#toast', t => t.style.display !== 'none' ? t.textContent : '').catch(() => '');

(async () => {
  const browser = await chromium.launch();
  const telPedro = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
  const telNelson = await browser.newContext({ viewport: { width: 412, height: 915 } });
  for (const ctx of [telPedro, telNelson]) {
    await nube.conectar(ctx);
    await ctx.exposeBinding('__cuentas', (_s, op) => manejarCuenta(op));
    await ctx.route('**/api.cloudinary.com/**', r => r.abort());
  }
  const pedro = await telPedro.newPage();
  const nelson = await telNelson.newPage();
  for (const [n, p] of [['Pedro', pedro], ['Nelson', nelson]]) p.on('pageerror', e => P('  [error en el telefono de ' + n + ']', String(e).slice(0, 200)));
  pedro.on('dialog', d => d.accept());

  // 1. Linea de control
  await abrirApp(pedro);
  await pedro.click('text=Pedro Arce');
  await pedro.waitForTimeout(400);
  await pedro.fill('#admin-pass-input', CLAVE_PRUEBA);
  await pedro.keyboard.press('Enter');
  await pedro.waitForTimeout(1500);
  await pedro.click('#btn-administrar');
  await pedro.waitForTimeout(1200);
  const f0 = await filas(pedro);
  P('1) Personal: ' + f0.map(f => f.nombre).join(', '));
  chequear(f0.length === 3 && f0.some(f => f.nombre === LUCAS), 'LINEA DE CONTROL: Pedro deberia ver 3 personas en Personal y ve ' + f0.length + ' — el guion no llega al panel');

  // 2. Agregar
  const boton = await pedro.$('#btn-agregar-tecnico');
  chequear(!!boton, 'el panel no tiene el boton "+ Agregar técnico"');
  if (boton) {
    await boton.click();
    await pedro.waitForTimeout(300);
    await pedro.fill('#tec-nombre', NELSON);
    await pedro.fill('#tec-pin', '5678');
    await pedro.click('#btn-guardar-tecnico');
    await pedro.waitForTimeout(2000);
  }
  const msg2 = await toast(pedro);
  const fichaT = nube.docs('tecnicos').find(d => d.datos.nombre === NELSON);
  const fichaD = fichaT ? nube.doc('directorio', fichaT.id) : null;
  const cuentaN = [...cuentas].find(([, c]) => fichaT && c.uid === fichaT.id);
  const okFichas = !!fichaT && !!fichaD && !!cuentaN && fichaT.datos.correo === cuentaN[0] && fichaD.correo === cuentaN[0] &&
    fichaD.cargo === 'Tecnico en terreno' && fichaD.activo === true && cuentaN[1].clave === 'emval-pin-5678' &&
    Object.keys(fichaD).every(k => ['nombre', 'cargo', 'letra', 'correo', 'activo', 'actualizadoEn'].includes(k));
  const f2 = await filas(pedro);
  P('2) Agregar: toast "' + msg2 + '" · cuenta y fichas: ' + (okFichas ? 'calzan ✓' : 'NO ✗') + ' · lista: ' + f2.map(f => f.nombre).join(', '));
  chequear(okFichas, 'el alta no dejo cuenta + tecnicos + directorio con el mismo uid y correo, y la clave del PIN');
  chequear(f2.some(f => f.nombre === NELSON), 'Nelson no aparece en la lista de Personal despues de agregarlo');
  const version = (URL.split('/').pop() || 'index.html').replace(/\.html$/, '');
  await pedro.screenshot({ path: 'tests/offline/tecnico-desde-el-panel-' + version + '.png', fullPage: true });

  // 3. Nombre repetido
  if (boton) {
    await pedro.click('#btn-agregar-tecnico');
    await pedro.fill('#tec-nombre', 'nelson  PRUEBA');
    await pedro.fill('#tec-pin', '1111');
    await pedro.click('#btn-guardar-tecnico');
    await pedro.waitForTimeout(1200);
    const msg3 = await toast(pedro);
    const cuantos = nube.docs('tecnicos').filter(d => /nelson/i.test(d.datos.nombre)).length;
    P('3) Repetido: "' + msg3 + '" · fichas de Nelson: ' + cuantos);
    chequear(cuantos === 1 && /Ya hay alguien/.test(msg3), 'un nombre repetido creo otra ficha o no lo dijo');
    await pedro.evaluate(() => cancelarFormTecnico());
  }

  // 4. Nelson entra desde su telefono
  await abrirApp(nelson);
  const entrada4 = await enEntrada(nelson);
  const quien4 = entrada4.some(t => t.includes(NELSON)) ? await entrarConPin(nelson, NELSON, '5678') : '';
  P('4) Telefono de Nelson: en la entrada ' + (entrada4.some(t => t.includes(NELSON)) ? 'si' : 'NO') + ' · entra con 5678: ' + (quien4 === NELSON ? 'si ✓' : 'NO ✗ (' + quien4 + ')'));
  chequear(quien4 === NELSON, 'Nelson no puede entrar desde su telefono con el PIN que le dio Pedro');

  // 5. Cambio de PIN
  if (fichaT) {
    await pedro.locator('#lista-tecnicos-admin .card[data-tecnico="' + NELSON + '"] button', { hasText: 'Cambiar PIN' }).click();
    await pedro.waitForTimeout(300);
    const nombreBloqueado = await pedro.$eval('#tec-nombre', i => i.disabled);
    await pedro.fill('#tec-pin', '1357');
    await pedro.click('#btn-guardar-tecnico');
    await pedro.waitForTimeout(2000);
    const msg5 = await toast(pedro);
    await salir(nelson);
    const conViejo = await entrarConPin(nelson, NELSON, '5678');
    await salir(nelson);
    const conNuevo = await entrarConPin(nelson, NELSON, '1357');
    const t5 = nube.doc('tecnicos', fichaT.id);
    P('5) Cambio de PIN: "' + msg5 + '" · nombre bloqueado: ' + nombreBloqueado + ' · con 5678: ' + (conViejo ? 'ENTRA ✗' : 'no ✓') + ' · con 1357: ' + (conNuevo === NELSON ? 'entra ✓' : 'NO ✗'));
    chequear(!conViejo && conNuevo === NELSON, 'despues del cambio de PIN, el viejo sigue entrando o el nuevo no');
    chequear(t5 && t5.pin === '1357' && !('pinNuevo' in t5), 'la ficha no quedo con el PIN nuevo: ' + JSON.stringify(t5 && { pin: t5.pin, pinNuevo: t5.pinNuevo }));
    chequear(nombreBloqueado, 'al cambiar el PIN se puede cambiar el nombre (las hojas lo buscan por nombre)');
  }

  // 6. Baja y reactivacion
  if (fichaT) {
    await pedro.locator('#lista-tecnicos-admin .card[data-tecnico="' + NELSON + '"] button', { hasText: 'Dar de baja' }).click();
    await pedro.waitForTimeout(400);
    await pedro.click('#dlg-ok');
    await pedro.waitForTimeout(1500);
    await salir(nelson);
    await abrirApp(nelson);
    const tras = await enEntrada(nelson);
    const dBaja = nube.doc('directorio', fichaT.id);
    const filaBaja = (await filas(pedro)).find(f => f.nombre === NELSON) || {};
    await pedro.locator('#lista-tecnicos-admin .card[data-tecnico="' + NELSON + '"] button', { hasText: 'Reactivar' }).click();
    await pedro.waitForTimeout(1500);
    await abrirApp(nelson);
    const vuelve = await enEntrada(nelson);
    P('6) Baja: en la entrada ' + (tras.some(t => t.includes(NELSON)) ? 'SIGUE ✗' : 'ya no ✓') + ', fila "' + (filaBaja.texto || '').replace(/\n/g, ' · ') + '" · reactivado: ' + (vuelve.some(t => t.includes(NELSON)) ? 'vuelve ✓' : 'NO ✗'));
    chequear(dBaja && dBaja.activo === false && !tras.some(t => t.includes(NELSON)), 'dado de baja, Nelson sigue en la pantalla de entrada');
    chequear(/Dado de baja/.test(filaBaja.texto || '') && (filaBaja.botones || []).includes('Reactivar'), 'la fila no dice que esta de baja o no ofrece Reactivar');
    chequear(vuelve.some(t => t.includes(NELSON)), 'reactivado, Nelson no vuelve a la pantalla de entrada');
  }

  // 7 y 8. Sin botones para Supervisor y Administrador; la sesion de Pedro es la suya
  const f7 = await filas(pedro);
  const sinBotones = f7.filter(f => f.nombre === 'Rosa Pinto' || f.nombre === 'Pedro Arce').every(f => f.botones.length === 0);
  const sesion = await pedro.evaluate(() => ({ uid: firebase.auth().currentUser && firebase.auth().currentUser.uid, aparte: window.__appsAparte, cerradas: window.__appsCerradas }));
  const principalSoloPedro = registro.filter(r => r.app === 'principal' && r.op !== 'entrar').length === 0;
  P('7) Rosa y Pedro sin botones: ' + (sinBotones ? '✓' : '✗') + ' · 8) sesion de Pedro: ' + sesion.uid + ' · instancias aparte abiertas/cerradas: ' + sesion.aparte + '/' + sesion.cerradas);
  chequear(sinBotones, 'la fila de un Supervisor o Administrador tiene botones de gestion');
  chequear(sesion.uid === 'u_pedro' && principalSoloPedro, 'la sesion de Pedro cambio o se uso para crear o tocar la cuenta de otro');
  chequear(sesion.aparte > 0 && sesion.aparte === sesion.cerradas, 'quedaron instancias aparte de Firebase sin cerrar');

  await browser.close();
  if (fallos.length) { console.log('\nFALLA — ' + fallos.length + ' problema(s):'); fallos.forEach(f => console.log(f)); process.exit(1); }
  console.log('\nOK — Pedro agrega a un tecnico, el tecnico entra desde su telefono, y Pedro le cambia el PIN, lo da de baja y lo reactiva.');
  process.exit(0);
})().catch(e => { console.error('\nFALLA — el guion se cayo:', e); process.exit(1); });
