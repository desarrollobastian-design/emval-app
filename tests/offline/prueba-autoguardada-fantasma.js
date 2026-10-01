/* Reproduce el caso del 30-09-2026 por la interfaz y comprueba el arreglo de punta a punta.

   Pedro: en su panel aparecieron 103 "trabajos pausados" que antes no veia. 77 eran hojas VACIAS
   que nacian al cerrar una OT: "Hacer otra OT" deja puesto el local del trabajo recien cerrado, y
   al salir de la app el autoguardado guardaba esa hoja nueva como "Autoguardada" (otro numero,
   mismo local, mismo dia). Aca, con la nube falsa compartida (nube-compartida.js; el SDK de
   Firebase ni se carga, EmailJS es un espia y Cloudinary se intercepta):

     A. El telefono de Jose cierra una OT COMPLETA por la interfaz en UNIMARC YUNGAY, toca "Hacer
        otra OT" y sale de la app (visibilitychange + pagehide, lo mismo que bloquear el telefono).
        → no queda ninguna Autoguardada; al volver a abrir la app, 0 pausados.
        (LINEA DE CONTROL: la OT se cerro de verdad — esta en 'emval_ots' y en la nube, firmada.)
     B. Otro telefono de Jose ya trae los fantasmas de antes: al abrir la app con la version nueva
        se va el fantasma VACIO y se quedan la hoja con texto y la En Pausa. Su reporte lo refleja.
     C. Pedro abre su panel. Hay ademas un reporte de un telefono con la version ANTERIOR (sin el
        dato de contenido). El panel no muestra ni el fantasma vacio ni la OT que ya se cerro, y
        si muestra lo que tiene texto y lo que no calza con ningun cierre.

   Uso:
     export NODE_PATH="C:/Users/corex/AppData/Roaming/npm/node_modules"
     node tests/offline/preparar.js origin/main        # sitio/index.html (arreglo) + sitio/prefix.html (antes)
     node tests/offline/prueba-autoguardada-fantasma.js index.html     # 0
     node tests/offline/prueba-autoguardada-fantasma.js prefix.html    # CONTRAPRUEBA: 1
   El guion sirve tests/offline/sitio en un puerto libre por su cuenta: no hace falta otro servidor. */

const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { crearNube, STUB_NUBE } = require('./nube-compartida');

const ARCHIVO = process.argv[2] || 'index.html';
const SITIO = path.join(__dirname, 'sitio');
const CAPTURAS = process.env.EMVAL_CAPTURAS || SITIO;
const fallos = [];
const P = (...a) => console.log(...a);
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); return !!ok; }
let llegoAlFinal = false;

// sha256('Pedro123') — la contraseña temporal que la propia app asigna al Administrador.
const HASH_PEDRO = 'cefdf4148cc0bdd9b6b4e6f125a65088e5340d9cf15d58000015b254bcf5168d';
const JOSE = 'José Quiroz';
const AHORA = Date.now();
const iso = ms => new Date(ms).toISOString();

function item(numero, local, fecha, autoDraft, descripcion) {
  return { numero, local, cadena: 'UNIMARC', cadenaColor: '#DC2626', cadenaLetra: 'U', tipo: 'correctivo', tecnico: JOSE,
    ceco: '', fecha, hora: '8:14:22 p. m.', descripcion, creadoEn: '2026-09-29T23:14:12.186Z',
    actualizadoEn: '2026-09-29T23:14:22.418Z', autoDraft, pendienteSync: false, enEspera: false, cotizacionNumero: '' };
}

const nube = crearNube({
  tecnicos: [
    { _id: 'u_pedro', nombre: 'Pedro Arce', cargo: 'Administrador', letra: 'P', passwordHash: HASH_PEDRO },
    { _id: 'u_jose', nombre: JOSE, cargo: 'Tecnico en terreno', pin: '3333', letra: 'J' }
  ],
  cadenas: [
    { _id: 'c1', nombre: 'UNIMARC', color: '#DC2626', logo: '', letra: 'U', orden: 0,
      sucursales: [{ nombre: 'UNIMARC YUNGAY', centro: '732' }, { nombre: 'UNIMARC BULNES', centro: '740' }] }
  ],
  ordenes: [
    // Cerrada y firmada el 29-09 por Jose en YUNGAY (la del caso real, #670510).
    { _id: 'd_670510', numero: 670510, local: 'UNIMARC YUNGAY', cadena: 'UNIMARC', tecnico: JOSE, tipo: 'correctivo',
      pausa: false, estado: 'Terminada', firmada: true, fecha: '29-09-2026', creadoEn: { __ts: Date.parse('2026-09-29T23:14:00Z') } },
    // La misma OT (numero + local) que un telefono aun guarda "En Pausa": ya se cerro y firmo.
    { _id: 'd_518336', numero: 518336, local: 'UNIMARC BULNES', cadena: 'UNIMARC', tecnico: JOSE, tipo: 'correctivo',
      pausa: false, estado: 'Terminada', firmada: true, fecha: '31-08-2026', creadoEn: { __ts: Date.parse('2026-08-31T15:00:00Z') } }
  ],
  cotizaciones: [],
  alertas: [
    // Reporte de un telefono con la version ANTERIOR: sus items no traen `conContenido`.
    { _id: 'pausadas_dev_viejo', tipo: 'pausadas', dispositivo: 'dev_viejo', usuario: JOSE, total: 4,
      actualizadoEn: { __ts: AHORA - 3600000 }, items: [
        item('859502', 'UNIMARC YUNGAY', '29-09-2026', true, ''),                              // fantasma          → no sale
        item('208838', 'UNIMARC YUNGAY', '29-09-2026', true, 'Trabajos en reparación baños'),  // tiene texto       → sale
        item('518336', 'UNIMARC BULNES', '26-08-2026', false, 'Instalacion de electrovalvula'),// ya cerrada        → no sale
        item('569320', 'UNIMARC BULNES', '16-09-2026', true, '')                               // sin cierre ese dia → sale
      ] }
  ]
});

// El telefono B de Jose: los fantasmas que ya tenia antes del arreglo.
const HOJA = (numero, extra) => Object.assign({ numero, local: 'UNIMARC YUNGAY', cadena: 'UNIMARC', tipo: 'correctivo',
  tecnico: JOSE, fecha: '29-09-2026', hora: '8:14:22 p. m.', descripcionProblema: '', descripcion: '', descripcionTrabajo: '',
  pendientesMateriales: '', fotosAntes: [], fotosDespues: [], fotoTimbre: null, serviciosPreventivo: [], firmada: false,
  firmaImagen: '', estado: 'En Pausa', pausa: true, enEspera: false, cotizacionId: '', cotizacionNumero: '', autoDraft: true,
  creadoEn: '2026-09-29T23:14:12.186Z', actualizadoEn: '2026-09-29T23:14:22.418Z' }, extra || {});
const TELEFONO_B = {
  cerradas: [{ numero: 670510, local: 'UNIMARC YUNGAY', tipo: 'correctivo', tecnico: JOSE, fecha: '29-09-2026',
    descripcion: 'Cambio de flotador', fotosAntes: 1, fotosDespues: 1, firmada: true }],
  pausadas: [
    HOJA(859502),                                                            // el fantasma: vacio
    HOJA(208838, { descripcionProblema: 'Trabajos en reparación baños' }),   // tiene texto: se queda
    HOJA(300004, { autoDraft: false, descripcionProblema: 'Sellar techo' })  // En Pausa real: se queda
  ]
};

function servir() {
  const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png' };
  return new Promise(res => {
    const srv = http.createServer((req, resp) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
      const f = path.join(SITIO, rel);
      if (!f.startsWith(SITIO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { resp.writeHead(404); return resp.end(); }
      resp.writeHead(200, { 'content-type': tipos[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(resp);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}
async function esperar(cond, ms) {
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) { if (await cond()) return true; await new Promise(r => setTimeout(r, 250)); }
  return false;
}
async function telefono(browser, opciones, deviceId, semilla) {
  const ctx = await browser.newContext(opciones);
  await nube.conectar(ctx);
  // Nada sale a internet: Cloudinary contesta una URL falsa y EmailJS se corta (ademas de ser un espia).
  await ctx.route('**/api.cloudinary.com/**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ secure_url: 'https://res.cloudinary.com/dcrf29tna/image/upload/v1/prueba_arnes.jpg', public_id: 'prueba_arnes' }) }));
  await ctx.route('**/res.cloudinary.com/**', r => r.abort());
  await ctx.route('**/api.emailjs.com/**', r => r.abort());
  await ctx.addInitScript(([id, s]) => {
    if (localStorage.getItem('__sembrado')) return;
    localStorage.setItem('emval_device_id', id);
    if (s) {
      localStorage.setItem('emval_ots', JSON.stringify(s.cerradas));
      localStorage.setItem('emval_ots_pausadas', JSON.stringify(s.pausadas));
    }
    localStorage.setItem('__sembrado', '1');
  }, [deviceId, semilla || null]);
  const page = await ctx.newPage();
  page.on('pageerror', e => P('  [error en ' + deviceId + ']', String(e).slice(0, 200)));
  return page;
}
async function abrirApp(page, url) {
  await page.goto(url);
  await page.waitForTimeout(600);
  await page.evaluate(STUB_NUBE);
  await page.evaluate(() => { cargarUsuariosApp(); cargarCadenasApp(); });
  await page.waitForTimeout(700);
}
async function entrarComoJose(page) {
  await page.locator('.usuario-item', { hasText: JOSE }).first().click();
  await page.waitForTimeout(300);
  for (const d of '3333') await page.locator('button.pin-btn', { hasText: new RegExp('^' + d + '$') }).first().click();
  await page.waitForTimeout(1500);
}
const pausadasDelTelefono = page => page.evaluate(() => JSON.parse(localStorage.getItem('emval_ots_pausadas') || '[]')
  .map(o => ({ numero: String(o.numero), local: o.local, autoDraft: o.autoDraft === true })));
const contador = page => page.evaluate(() => (document.getElementById('contador-pausadas') || {}).textContent);
async function foto(page, tipo, idx) {
  await page.evaluate(([t, i]) => { estado.fotoActualId = 'foto-' + t + '-' + i; estado.fotoActualTipo = t; estado.fotoActualIdx = i; }, [tipo, idx]);
  await page.locator('#input-foto-galeria').setInputFiles(path.join(__dirname, 'foto-prueba.png'));
  await page.waitForTimeout(1600);
}

(async () => {
  if (!fs.existsSync(path.join(SITIO, ARCHIVO))) {
    P('No existe ' + path.join(SITIO, ARCHIVO) + '. Primero: node tests/offline/preparar.js origin/main');
    process.exit(2);
  }
  const srv = await servir();
  const URL = 'http://127.0.0.1:' + srv.address().port + '/' + ARCHIVO;
  const browser = await chromium.launch();
  P('\n══ ' + ARCHIVO + ' ══');

  // ── A. Jose cierra una OT por la interfaz, toca "Hacer otra OT" y sale de la app ───────────────
  const telA = await telefono(browser, Object.assign({}, devices['Pixel 7']), 'dev_jose_a');
  await abrirApp(telA, URL);
  await entrarComoJose(telA);
  await telA.locator('text=UNIMARC').first().click();
  await telA.waitForTimeout(800);
  await telA.locator('text=UNIMARC YUNGAY').first().click();
  await telA.waitForTimeout(800);
  await telA.locator('#t-corr').click();
  await telA.locator('#desc-problema').fill('Fuga en el baño de clientes (PRUEBA ARNES)');
  await telA.locator('button.btn', { hasText: 'Continuar' }).first().click();
  await telA.waitForTimeout(800);
  await foto(telA, 'antes', 0);
  await telA.locator('button.btn', { hasText: 'Iniciar trabajo' }).first().click();
  await telA.waitForTimeout(900);
  await telA.locator('#desc-trabajo').fill('Cambio de flotador (PRUEBA ARNES)');
  await telA.locator('#email-admin').fill('local.prueba@ejemplo.cl');
  await foto(telA, 'despues', 0);
  await foto(telA, 'timbre', 0);
  const c = telA.locator('#firma-canvas');
  const b = await c.boundingBox();
  await telA.mouse.move(b.x + 20, b.y + b.height * 0.6);
  await telA.mouse.down();
  await telA.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.3, { steps: 10 });
  await telA.mouse.move(b.x + b.width - 25, b.y + b.height * 0.7, { steps: 10 });
  await telA.mouse.up();
  await telA.waitForTimeout(300);
  await telA.locator('button.btn', { hasText: 'Confirmar firma' }).click();
  await telA.waitForTimeout(600);
  const cerrada = await telA.evaluate(() => ({ numero: estado.otNumero, local: estado.local, firmada: estado.firmada }));
  await telA.locator('#btn-cerrar-ot').click();
  const enCierre = await esperar(() => telA.evaluate(() => document.getElementById('s-cierre').classList.contains('active')), 20000);
  chequear(enCierre, 'LINEA DE CONTROL: la OT no llego a la pantalla de cierre — el guion no reproduce el caso');
  const enOts = await telA.evaluate(n => JSON.parse(localStorage.getItem('emval_ots') || '[]').some(o => String(o.numero) === String(n) && o.firmada === true), cerrada.numero);
  const enNube = await esperar(() => nube.docs('ordenes').some(d => String(d.datos.numero) === String(cerrada.numero) && d.datos.firmada === true), 20000);
  chequear(enOts && enNube, 'LINEA DE CONTROL: la OT #' + cerrada.numero + ' no quedo cerrada y firmada (emval_ots: ' + enOts + ', nube: ' + enNube + ')');
  P('A) Jose cerro la OT #' + cerrada.numero + ' de ' + cerrada.local + ' por la interfaz (en el telefono: ' + enOts + ', en la nube: ' + enNube + ')');

  await telA.locator('button', { hasText: 'Hacer otra OT' }).first().click();
  await telA.waitForTimeout(800);
  await telA.evaluate(() => {   // bloquear el telefono / cambiar de app: lo que hace el tecnico
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
  });
  await telA.waitForTimeout(500);
  const trasSalir = await pausadasDelTelefono(telA);
  chequear(trasSalir.length === 0, 'tras cerrar la #' + cerrada.numero + ' y tocar "Hacer otra OT", salir de la app dejo ' +
    trasSalir.length + ' hoja(s) guardada(s): ' + trasSalir.map(o => '#' + o.numero + ' ' + o.local + (o.autoDraft ? ' (Autoguardada)' : '')).join(', ') +
    ' — es el fantasma del 30-09');
  P('   Hacer otra OT + salir de la app → hojas guardadas: ' + (trasSalir.map(o => '#' + o.numero + ' ' + o.local).join(', ') || 'ninguna'));

  await telA.reload();
  await abrirApp(telA, URL);
  await entrarComoJose(telA);
  const nA = await contador(telA);
  chequear(nA === '0', 'al volver a abrir la app Jose ve ' + nA + ' pausado(s) y no tiene ninguno pendiente');
  P('   Al volver a abrir la app, Jose ve ' + nA + ' pausados');

  // ── B. Un telefono que ya traia fantasmas los limpia al abrir la app ─────────────────────────────
  const telB = await telefono(browser, { viewport: { width: 412, height: 915 } }, 'dev_jose_b', TELEFONO_B);
  await abrirApp(telB, URL);
  await entrarComoJose(telB);
  const nB = await contador(telB);
  const quedanB = (await pausadasDelTelefono(telB)).map(o => o.numero).sort();
  chequear(nB === '2' && JSON.stringify(quedanB) === JSON.stringify(['208838', '300004']),
    'el telefono con fantasmas ve ' + nB + ' pausados y guarda ' + quedanB.join(', ') + ' (esperado 2: 208838 con texto y 300004 En Pausa)');
  const reportoB = await esperar(() => { const r = nube.doc('alertas', 'pausadas_dev_jose_b'); return r && (r.items || []).length === quedanB.length; }, 12000);
  const repB = nube.doc('alertas', 'pausadas_dev_jose_b');
  chequear(reportoB, 'el reporte del telefono B no refleja lo que guarda: ' + JSON.stringify(repB && repB.items && repB.items.map(i => i.numero)));
  P('B) Telefono con fantasmas: ve ' + nB + ' pausados (' + quedanB.join(', ') + '); reporto ' + (repB ? repB.items.length : 'nada'));

  // ── C. El panel de Pedro ───────────────────────────────────────────────────────────────────────
  // Espera a que el telefono A tambien haya reportado (tiene que decir 0 hojas).
  await esperar(() => !!nube.doc('alertas', 'pausadas_dev_jose_a'), 12000);
  const telP = await telefono(browser, { viewport: { width: 1280, height: 950 } }, 'dev_pedro');
  await abrirApp(telP, URL);
  await telP.click('text=Pedro Arce');
  await telP.waitForTimeout(400);
  await telP.fill('#admin-pass-input', 'Pedro123');
  await telP.keyboard.press('Enter');
  await telP.waitForTimeout(1200);
  await telP.evaluate(() => cargarOTsSupervisor());
  await telP.waitForTimeout(2500);
  const tarjetas = await telP.$$eval('#sup-pausadas-lista .ot-card', els => els.map(e => e.innerText.replace(/\n/g, ' | ')));
  const cuenta = await telP.evaluate(() => (document.getElementById('sup-pausadas-count') || {}).textContent);
  const numerosPanel = tarjetas.map(t => (t.match(/#(\d+)/) || [])[1]).filter(Boolean).sort();
  P('C) Pedro ve TRABAJOS PAUSADOS ' + cuenta + ':');
  tarjetas.forEach(t => P('   · ' + t.slice(0, 140)));
  const esperado = ['208838', '300004', '569320'];
  chequear(JSON.stringify(numerosPanel) === JSON.stringify(esperado) && cuenta === String(esperado.length),
    'el panel muestra ' + (numerosPanel.join(', ') || 'nada') + ' (contador ' + cuenta + '); esperado ' + esperado.join(', ') +
    ' — no deben salir el fantasma vacio #859502, la OT ya cerrada #518336 ni la hoja que dejo el cierre de A');
  await telP.screenshot({ path: path.join(CAPTURAS, 'autoguardada-fantasma-panel-' + ARCHIVO.replace('.html', '') + '.png'), fullPage: true });

  llegoAlFinal = true;
  await browser.close();
  srv.close();
  cerrar();
})().catch(e => { fallos.push('  ✗ el guion se cayo: ' + (e && e.message)); cerrar(); });

function cerrar() {
  if (!llegoAlFinal) fallos.push('  ✗ el guion no llego al final: no probo lo que dice probar');
  if (fallos.length) {
    P('\nFALLA — ' + fallos.length + ' invariante(s) roto(s):');
    fallos.forEach(f => P(f));
    process.exit(1);
  }
  P('\nOK — cerrar una OT no deja fantasmas, el telefono limpia los que tenia y el panel de Pedro no los muestra.');
  process.exit(0);
}
