/* Entrar con Firebase Auth en un telefono real (emulado): con señal, sin señal y la primera vez.

   Etapa 1 de Auth (23-10-2026). El PIN de cada tecnico es EL DE SIEMPRE; lo que cambia es quien lo
   verifica: con señal Firebase, sin señal un verificador que el telefono guardo cuando esa persona
   entro con señal. Esta prueba lo recorre por la interfaz, como lo haria un tecnico:

     1. LINEA DE CONTROL: con señal, Ana entra con su PIN (el teclado de siempre).
     2. Sale, se corta la señal y vuelve a entrar con su PIN: entra "sin señal".
     3. Sin señal, Beto (que nunca entro en ESTE telefono) no entra, y se le dice que necesita señal.
        ← aca falla la version anterior (#63): sin señal entraba cualquiera de la lista.
     4. Sin señal, Ana con un PIN equivocado no entra.
     5. Vuelve la señal: el telefono inicia sesion en Firebase como Ana sin pedirle nada.
     6. El telefono no guarda PIN ni hash: ni el cache de la lista ni los verificadores los tienen, y
        el cache viejo (emval_users_cache) no existe.
     7. Pedro entra con su contraseña de siempre (con señal).

   Usa la nube falsa de nube-compartida.js y el Auth falso de stub-auth.js: no toca Firebase.
   Uso:
     export NODE_PATH="C:/Users/corex/AppData/Roaming/npm/node_modules"
     node tests/offline/preparar.js <ref-sin-el-cambio>
     cd tests/offline/sitio && python -m http.server 8765
     node tests/offline/prueba-entrar-sin-senal.js http://127.0.0.1:8765/index.html    # 0
     node tests/offline/prueba-entrar-sin-senal.js http://127.0.0.1:8765/prefix.html   # CONTRAPRUEBA: 1 */

const { chromium } = require('playwright');
const crypto = require('crypto');
const { crearNube, STUB_NUBE } = require('./nube-compartida');

const URL = process.argv[2] || 'http://127.0.0.1:8765/index.html';
const fallos = [];
const P = (...a) => console.log(...a);
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); return !!ok; }

// Valores SOLO de prueba (no son de nadie).
const PIN_ANA = '4821', PIN_BETO = '7305';
const CLAVE_PRUEBA = 'clave-solo-de-prueba';
const HASH_PEDRO = crypto.createHash('sha256').update(CLAVE_PRUEBA).digest('hex');
const ANA = 'Ana Prueba', BETO = 'Beto Prueba';

const nube = crearNube({
  tecnicos: [
    { _id: 'u_pedro', nombre: 'Pedro Arce', cargo: 'Administrador', letra: 'P', passwordHash: HASH_PEDRO },
    { _id: 'u_ana', nombre: ANA, cargo: 'Tecnico en terreno', pin: PIN_ANA, letra: 'A' },
    { _id: 'u_beto', nombre: BETO, cargo: 'Tecnico en terreno', pin: PIN_BETO, letra: 'B' }
  ],
  cadenas: [{ _id: 'c1', nombre: 'UNIMARC', color: '#DC2626', logo: '', letra: 'U', orden: 0,
    sucursales: [{ nombre: 'UNIMARC PENCO', centro: '720' }] }],
  ordenes: [], cotizaciones: []
});

async function abrirApp(page) {
  await page.goto(URL);
  await page.waitForTimeout(600);
  await page.evaluate(STUB_NUBE);
  await page.evaluate(() => { cargarUsuariosApp(); cargarCadenasApp(); });
  await page.waitForTimeout(700);
}
async function volverALista(page) {
  await page.evaluate(() => { if (typeof cerrarSesion === 'function' && estado.usuario) cerrarSesion(); go('s-usuarios'); });
  await page.waitForTimeout(300);
}
async function entrarConPin(page, nombre, pin) {
  await page.locator('.usuario-item', { hasText: nombre }).first().click();
  await page.waitForTimeout(300);
  for (const d of pin) await page.locator('button.pin-btn', { hasText: new RegExp('^' + d + '$') }).first().click();
  await page.waitForTimeout(1800);   // 200 ms de la validacion + Firebase o el PBKDF2 del verificador
  return page.evaluate(() => ({ usuario: estado.usuario, pantalla: (document.querySelector('.screen.active') || {}).id || '',
    toast: ((document.getElementById('toast') || {}).textContent || '') }));
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
  await nube.conectar(ctx);
  await ctx.route('**/api.cloudinary.com/**', r => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', e => P('  [error en el telefono]', String(e).slice(0, 200)));

  // 1. Linea de control: con señal, Ana entra
  await abrirApp(page);
  const r1 = await entrarConPin(page, ANA, PIN_ANA);
  const entro1 = r1.pantalla !== 's-pin' && r1.pantalla !== 's-usuarios';
  P('1) Con señal    → Ana ' + (entro1 ? 'entra (' + r1.pantalla + ') ✓' : 'NO ENTRA (' + r1.pantalla + ') ✗'));
  chequear(entro1, 'LINEA DE CONTROL: con señal Ana no entra con su PIN — el guion no llega a la app');

  // 2. Sin señal, Ana otra vez
  await volverALista(page);
  await ctx.setOffline(true);
  await page.waitForTimeout(300);
  const r2 = await entrarConPin(page, ANA, PIN_ANA);
  const entro2 = r2.pantalla !== 's-pin' && r2.pantalla !== 's-usuarios';
  P('2) Sin señal    → Ana ' + (entro2 ? 'entra ✓' : 'NO ENTRA ✗') + (/sin señal/i.test(r2.toast) ? ' y se le dice que fue sin señal ✓' : ' (aviso: "' + r2.toast.slice(0, 60) + '")'));
  chequear(entro2, 'sin señal, Ana (que ya entro con señal en este telefono) no entra');

  // 3. Sin señal, Beto nunca entro en este telefono
  await volverALista(page);
  const r3 = await entrarConPin(page, BETO, PIN_BETO);
  const entro3 = r3.pantalla !== 's-pin' && r3.pantalla !== 's-usuarios';
  P('3) Primera vez  → Beto sin señal ' + (entro3 ? 'ENTRA ✗' : 'no entra ✓') + (/primera vez/i.test(r3.toast) ? ', y dice que necesita señal ✓' : ', aviso: "' + r3.toast.slice(0, 70) + '" ✗'));
  chequear(!entro3, 'sin señal entra alguien que nunca entro con señal en este telefono');
  chequear(/primera vez/i.test(r3.toast), 'a quien entra por primera vez sin señal no se le dice que necesita señal');

  // 4. Sin señal, PIN equivocado
  await volverALista(page);
  const r4 = await entrarConPin(page, ANA, '0000');
  const entro4 = r4.pantalla !== 's-pin' && r4.pantalla !== 's-usuarios';
  P('4) PIN ajeno    → Ana sin señal con otro PIN: ' + (entro4 ? 'ENTRA ✗' : 'no entra ✓'));
  chequear(!entro4, 'sin señal, un PIN equivocado entra');

  // 5. Vuelve la señal: sesion de Firebase sin pedir nada
  await volverALista(page);
  await entrarConPin(page, ANA, PIN_ANA);          // entra sin señal: la clave queda en memoria
  await page.evaluate(() => { try { firebase.auth().signOut(); } catch (e) {} });   // el telefono sin sesion
  await ctx.setOffline(false);
  await page.waitForTimeout(2500);                 // el evento 'online' reintenta la sesion
  const uid5 = await page.evaluate(() => { const a = firebase.auth(); return (a && a.currentUser && a.currentUser.uid) || ''; });
  P('5) Vuelve señal → sesion de Firebase: ' + (uid5 === 'u_ana' ? 'Ana, sin pedirle nada ✓' : (uid5 || 'NINGUNA') + ' ✗'));
  chequear(uid5 === 'u_ana', 'al volver la señal el telefono no inicio sesion en Firebase como Ana');

  // 6. Nada secreto en el telefono
  const ls = await page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
  const todo = JSON.stringify(ls);
  const claveAna = 'emval-pin-' + PIN_ANA;
  const conSecreto = [PIN_ANA, PIN_BETO, HASH_PEDRO, CLAVE_PRUEBA, claveAna].filter(s => todo.includes(s));
  const cacheViejo = 'emval_users_cache' in ls;
  P('6) Telefono     → cache viejo con PIN: ' + (cacheViejo ? 'EXISTE ✗' : 'no existe ✓') + ', secretos en localStorage: ' + (conSecreto.length ? conSecreto.length + ' ✗' : 'ninguno ✓') +
    ', verificadores: ' + (Object.keys(ls).filter(k => k.indexOf('emval_verif_') === 0).map(k => k.slice(12)).join(', ') || 'NINGUNO'));
  chequear(!cacheViejo, 'el telefono sigue guardando emval_users_cache (la coleccion tecnicos entera, PIN y hash)');
  chequear(conSecreto.length === 0, 'el telefono guarda un PIN, una clave o un hash en localStorage (' + conSecreto.length + ')');

  // 7. Pedro con su contraseña de siempre
  await volverALista(page);
  await page.locator('.usuario-item', { hasText: 'Pedro Arce' }).first().click();
  await page.waitForTimeout(400);
  await page.fill('#admin-pass-input', CLAVE_PRUEBA);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1800);
  const r7 = await page.evaluate(() => ({ usuario: estado.usuario, cargo: estado.cargo, pantalla: (document.querySelector('.screen.active') || {}).id }));
  P('7) Pedro        → con su contraseña: ' + (r7.pantalla === 's-supervisor' ? 'entra al panel ✓' : 'NO ENTRA (' + r7.pantalla + ') ✗'));
  chequear(r7.pantalla === 's-supervisor', 'Pedro no entra con su contraseña de siempre');

  await browser.close();
  if (fallos.length) {
    console.log('\nFALLA — ' + fallos.length + ' problema(s):');
    fallos.forEach(f => console.log(f));
    process.exit(1);
  }
  console.log('\nOK — con señal entra Firebase, sin señal el verificador del telefono, la primera vez pide señal, y el telefono no guarda secretos.');
  process.exit(0);
})().catch(e => { console.error('\nFALLA — el guion se cayo:', e); process.exit(1); });
