/* Reproduce el caso del 25-09-2026 con DOS telefonos y comprueba el arreglo de punta a punta.

   Pedro: "A Lucas cuando abre su sesión le aparecen esas pausadas pero no me aparecen a mí como
   administrador para eliminarlas". Aca:
     · el telefono de Lucas trae guardadas las hojas de su captura: una Autoguardada, dos En Pausa
       que ya no estan en la nube (una con el numero de 4 digitos de antes de julio), una que SI
       esta en la nube, y una Autoguardada de otro tecnico que uso el mismo telefono;
     · Pedro entra a su panel en OTRO telefono.
   Los dos hablan con la misma nube falsa (nube-compartida.js): el SDK de Firebase ni se carga,
   asi que tocar produccion es imposible.

   Tramos:
     1. LINEA DE CONTROL: Lucas entra con su PIN y ve sus 4 pausadas (como en la captura).
     2. Su telefono reporta lo que guarda: 5 hojas, sin fotos.
     3. Pedro ve las 5 en su panel: la de la nube UNA vez, y las demas "Solo en un teléfono".
        ← aca es donde falla la version publicada (v59): Pedro ve solo 1.
     4. Pedro elimina, por la interfaz, una Autoguardada, la de la nube y la del otro tecnico.
        La de la nube: primero la lapida, despues el documento.
     5. Lucas vuelve a abrir la app: las 3 desaparecen de su telefono y quedan las otras 2.
     6. El panel de Pedro se actualiza solo: quedan 2 tarjetas.

   Uso:
     export NODE_PATH="C:/Users/corex/AppData/Roaming/npm/node_modules"
     node tests/offline/preparar.js origin/main          # index.html (arreglo) + prefix.html (antes)
     cd tests/offline/sitio && python -m http.server 8765
     node tests/offline/prueba-pausadas-del-telefono.js http://127.0.0.1:8765/index.html    # 0
     node tests/offline/prueba-pausadas-del-telefono.js http://127.0.0.1:8765/prefix.html   # CONTRAPRUEBA: 1 */

const { chromium } = require('playwright');
const { crearNube, STUB_NUBE } = require('./nube-compartida');

const URL = process.argv[2] || 'http://127.0.0.1:8765/index.html';
const fallos = [];
const P = (...a) => console.log(...a);
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); return !!ok; }

// sha256('Pedro123') — la contraseña temporal que la propia app asigna al Administrador.
const HASH_PEDRO = 'cefdf4148cc0bdd9b6b4e6f125a65088e5340d9cf15d58000015b254bcf5168d';
const LUCAS = 'Lucas Fernández';
const AHORA = Date.now();
const iso = ms => new Date(ms).toISOString();

const nube = crearNube({
  tecnicos: [
    { _id: 'u_pedro', nombre: 'Pedro Arce', cargo: 'Administrador', letra: 'P', passwordHash: HASH_PEDRO },
    { _id: 'u_lucas', nombre: LUCAS, cargo: 'Tecnico en terreno', pin: '2222', letra: 'L' },
    { _id: 'u_jose', nombre: 'José Soto', cargo: 'Tecnico en terreno', pin: '3333', letra: 'J' }
  ],
  cadenas: [
    { _id: 'c1', nombre: 'SUPER 10', color: '#F59E0B', logo: '', letra: 'S', orden: 0,
      sucursales: [{ nombre: 'S10 Concepcion', centro: '3164' }, { nombre: 'S10 TOME', centro: '3170' }] },
    { _id: 'c2', nombre: 'UNIMARC', color: '#DC2626', logo: '', letra: 'U', orden: 1,
      sucursales: [{ nombre: 'UNIMARC PENCO', centro: '720' }, { nombre: 'UNIMARC YUMBEL', centro: '734' }] }
  ],
  ordenes: [
    // La unica que Pedro alcanzaba a ver: esta en la nube Y en el telefono de Lucas.
    { _id: 'd_nube', numero: 700700, local: 'UNIMARC PENCO', cadena: 'UNIMARC', tecnico: LUCAS, tipo: 'correctivo',
      pausa: true, estado: 'En Pausa', firmada: false, enEspera: false, fecha: '23-09-2026', creadoEn: { __ts: AHORA - 2 * 86400000 } },
    // Una OT cerrada cualquiera: sin ninguna, el panel no llega a escuchar las pausadas.
    { _id: 'd_cerrada', numero: 300300, local: 'UNIMARC YUMBEL', cadena: 'UNIMARC', tecnico: LUCAS, tipo: 'correctivo',
      pausa: false, estado: 'Terminada', firmada: true, fecha: '25-09-2026', creadoEn: { __ts: AHORA - 86400000 } }
  ],
  cotizaciones: []
});

const FOTO = 'data:image/jpeg;base64,' + 'A'.repeat(200000);
const hoja = (numero, local, extra) => Object.assign({
  numero, local, tecnico: LUCAS, tipo: 'correctivo', cadena: 'SUPER 10', fecha: '24-09-2026', hora: '16:37:00',
  creadoEn: iso(AHORA - 3 * 86400000), actualizadoEn: iso(AHORA - 2 * 86400000), autoDraft: false, pausa: true,
  estado: 'En Pausa', fotosAntes: [], fotosDespues: []
}, extra || {});
const TELEFONO_LUCAS = [
  hoja(829795, 'S10 Concepcion', { autoDraft: true }),
  hoja(807581, 'M10 CONCEPCION', { tipo: 'preventivo', pendienteSync: false }),
  hoja(9101, 'UNIMARC PENUELAS', { tipo: 'preventivo', cadena: 'UNIMARC', creadoEn: iso(AHORA - 70 * 86400000), actualizadoEn: '' }),
  hoja(700700, 'UNIMARC PENCO', { cadena: 'UNIMARC', pendienteSync: false }),
  hoja(111111, 'S10 TOME', { tecnico: 'José Soto', autoDraft: true, fotosAntes: [FOTO] })
];

async function abrirApp(page) {
  await page.goto(URL);
  await page.waitForTimeout(600);
  await page.evaluate(STUB_NUBE);
  await page.evaluate(() => { cargarUsuariosApp(); cargarCadenasApp(); });
  await page.waitForTimeout(700);
}
async function entrarComoLucas(page) {
  await page.locator('.usuario-item', { hasText: LUCAS }).first().click();
  await page.waitForTimeout(300);
  for (const d of '2222') await page.locator('button.pin-btn', { hasText: new RegExp('^' + d + '$') }).first().click();
  await page.waitForTimeout(1500);
}
async function esperar(cond, ms, paso) {
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) { if (await cond()) return true; await new Promise(r => setTimeout(r, 250)); }
  return false;
}
const tarjetasPanel = page => page.$$eval('#sup-pausadas-lista .ot-card', els => els.map(e => e.innerText.replace(/\n/g, ' | ')));

async function eliminarDesdePanel(page, numero) {
  const btn = await page.$('#sup-pausadas-lista .ot-card:has-text("#' + numero + '") button:has-text("Eliminar")');
  if (!chequear(!!btn, 'la tarjeta #' + numero + ' no tiene boton Eliminar')) return '';
  await btn.click();
  await page.waitForTimeout(400);
  const msg = await page.evaluate(() => (document.getElementById('dlg-msg') || {}).textContent || '');
  await page.click('#dlg-ok');
  await page.waitForTimeout(400);
  await page.fill('#dlg-input', 'Pedro123');
  await page.click('#dlg-ok');
  await page.waitForTimeout(1200);
  return msg;
}

(async () => {
  const browser = await chromium.launch();
  const telLucas = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const telPedro = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  await nube.conectar(telLucas);
  await nube.conectar(telPedro);
  for (const ctx of [telLucas, telPedro]) {
    await ctx.route('**/api.cloudinary.com/**', r => r.abort());
  }
  // El telefono de Lucas ya trae su historia (solo la primera vez: sobrevive a la recarga).
  await telLucas.addInitScript(([pausadas]) => {
    if (localStorage.getItem('__sembrado')) return;
    localStorage.setItem('emval_device_id', 'dev_lucas');
    localStorage.setItem('emval_ots_pausadas', JSON.stringify(pausadas));
    localStorage.setItem('__sembrado', '1');
  }, [TELEFONO_LUCAS]);

  const lucas = await telLucas.newPage();
  const pedro = await telPedro.newPage();
  for (const [n, p] of [['Lucas', lucas], ['Pedro', pedro]]) {
    p.on('pageerror', e => P('  [error en el telefono de ' + n + ']', String(e).slice(0, 200)));
  }

  // 1. Linea de control
  await abrirApp(lucas);
  await entrarComoLucas(lucas);
  const cuantasLucas = await lucas.evaluate(() => (document.getElementById('contador-pausadas') || {}).textContent);
  chequear(cuantasLucas === '4', 'LINEA DE CONTROL: Lucas deberia ver sus 4 pausadas y ve ' + cuantasLucas + ' — el guion no reproduce el caso');
  P('1) Lucas entra y ve ' + cuantasLucas + ' pausadas en su telefono');

  // 2. El reporte
  const reporto = await esperar(() => {
    const r = nube.doc('alertas', 'pausadas_dev_lucas');
    return r && (r.items || []).length === 5;
  }, 12000);
  const rep = nube.doc('alertas', 'pausadas_dev_lucas');
  chequear(reporto, 'el telefono de Lucas no reporto sus 5 hojas (reporte: ' + JSON.stringify(rep && rep.items && rep.items.length) + ')');
  if (rep) {
    const peso = JSON.stringify(rep).length;
    chequear(peso < 20000 && !/base64/.test(JSON.stringify(rep)), 'el reporte pesa ' + peso + ' bytes o lleva fotos');
  }
  P('2) El telefono reporto ' + (rep ? rep.items.length + ' hojas, ' + JSON.stringify(rep).length + ' bytes' : 'NADA'));

  // 3. El panel de Pedro
  await abrirApp(pedro);
  await pedro.click('text=Pedro Arce');
  await pedro.waitForTimeout(400);
  await pedro.fill('#admin-pass-input', 'Pedro123');
  await pedro.keyboard.press('Enter');
  await pedro.waitForTimeout(1200);
  await pedro.evaluate(() => cargarOTsSupervisor());
  await esperar(async () => (await tarjetasPanel(pedro)).length >= 5, 8000);
  let tarjetas = await tarjetasPanel(pedro);
  P('3) Pedro ve ' + tarjetas.length + ' tarjetas:');
  tarjetas.forEach(t => P('   · ' + t.slice(0, 150)));
  chequear(tarjetas.length === 5, 'Pedro ve ' + tarjetas.length + ' pausadas y Lucas tiene 5 en su telefono — es el reclamo del 25-09');
  chequear(tarjetas.filter(t => /#700700/.test(t)).length === 1, 'la hoja que esta en la nube y en el telefono no sale exactamente una vez');
  ['829795', '807581', '9101', '111111'].forEach(n => {
    const t = tarjetas.find(x => x.indexOf('#' + n) >= 0) || '';
    chequear(/Solo en un teléfono/.test(t), 'la #' + n + ' no aparece como "Solo en un teléfono"');
  });
  chequear(/AUTOGUARDADA/.test(tarjetas.find(t => /#829795/.test(t)) || ''), 'la Autoguardada no se nombra como tal en el panel');
  await pedro.waitForTimeout(1500);   // que termine la animacion de entrada de las tarjetas
  await pedro.screenshot({ path: 'tests/offline/pausadas-del-telefono-panel.png', fullPage: true });

  // 4. Pedro elimina tres
  const msgTel = await eliminarDesdePanel(pedro, '829795');
  chequear(/solo en un teléfono/i.test(msgTel), 'el cuadro no avisa que la hoja vive solo en un telefono. Decia: "' + msgTel.replace(/\n/g, ' ') + '"');
  const lapidas = () => ((nube.doc('alertas', 'descartes_pausadas') || {}).items || []);
  const l1 = lapidas().find(l => l.numero === '829795');
  chequear(l1 && l1.hastaMs === Date.parse(TELEFONO_LUCAS[0].actualizadoEn) && l1.tecnico === LUCAS,
    'la lapida de la #829795 no quedo con la version reportada: ' + JSON.stringify(l1));
  chequear(!nube.log.some(e => e.op === 'delete' && e.col === 'ordenes'), 'borrar una hoja del telefono toco la coleccion ordenes');
  tarjetas = await tarjetasPanel(pedro);
  chequear(/se borrará de ese teléfono/.test(tarjetas.find(t => /#829795/.test(t)) || ''),
    'la tarjeta eliminada no dice que se borrara del telefono al abrir la app');

  const msgNube = await eliminarDesdePanel(pedro, '700700');
  chequear(/también se quitará del teléfono/i.test(msgNube), 'el cuadro de la hoja de la nube no avisa que tambien se quita del telefono');
  const iSet = nube.log.findIndex(e => e.op === 'set' && e.col === 'alertas' && e.id === 'descartes_pausadas'
    && (e.datos.items || []).some(l => l.numero === '700700'));
  const iDel = nube.log.findIndex(e => e.op === 'delete' && e.col === 'ordenes' && e.id === 'd_nube');
  chequear(iSet >= 0 && iDel > iSet, 'la hoja de la nube no se borro DESPUES de dejar su lapida (set ' + iSet + ', delete ' + iDel + ')');

  await eliminarDesdePanel(pedro, '111111');
  chequear(lapidas().some(l => l.numero === '111111' && l.tecnico === 'José Soto'), 'no quedo la lapida de la hoja del otro tecnico');
  P('4) Pedro elimino 3: lapidas ' + lapidas().map(l => l.numero + '(' + l.origen + ')').join(', ') + '; documento de la nube borrado despues de su lapida');

  // 5. Lucas vuelve a abrir la app
  await abrirApp(lucas);
  await entrarComoLucas(lucas);
  const limpio = await esperar(async () => (await lucas.evaluate(() => (document.getElementById('contador-pausadas') || {}).textContent)) === '2', 15000);
  const quedan = await lucas.evaluate(() => JSON.parse(localStorage.getItem('emval_ots_pausadas') || '[]').map(o => String(o.numero)).sort());
  chequear(limpio, 'el telefono de Lucas no quedo con 2 pausadas tras volver a abrir la app');
  chequear(JSON.stringify(quedan) === JSON.stringify(['807581', '9101']),
    'en el telefono quedaron ' + quedan.join(', ') + ' (esperado 807581 y 9101: la de José tambien se quita)');
  P('5) Lucas abre la app de nuevo: quedan ' + quedan.join(', '));
  await lucas.screenshot({ path: 'tests/offline/pausadas-del-telefono-lucas.png' });

  // 6. El panel se actualiza solo
  const panelOk = await esperar(async () => (await tarjetasPanel(pedro)).length === 2, 12000);
  tarjetas = await tarjetasPanel(pedro);
  chequear(panelOk, 'el panel de Pedro no se actualizo: quedan ' + tarjetas.length + ' tarjetas en vez de 2');
  chequear(tarjetas.every(t => /#807581|#9101/.test(t)), 'en el panel quedaron tarjetas que no son las 2 esperadas');
  P('6) El panel de Pedro queda con ' + tarjetas.length + ' tarjetas');
  await pedro.waitForTimeout(1500);
  await pedro.screenshot({ path: 'tests/offline/pausadas-del-telefono-panel-despues.png', fullPage: true });

  await browser.close();
  if (fallos.length) {
    console.log('\nFALLA — ' + fallos.length + ' problema(s):');
    fallos.forEach(f => console.log(f));
    process.exit(1);
  }
  console.log('\nOK — Pedro ve lo que Lucas guarda en su telefono, lo elimina, y se va del telefono de Lucas.');
  process.exit(0);
})().catch(e => { console.error('\nFALLA — el guion se cayo:', e); process.exit(1); });
