/* PRUEBA REAL — el aviso de una OT no llega dos veces. Chromium, telefono emulado, app entera.

   node tests/offline/prueba-duplicado.js <index.html|prefix.html>

   REPRODUCE EL CASO OT #614727 (14 y 15-08-2026). Pedro recibio dos veces el correo
   "OT #614727 completada — UNIMARC QUILLON" y creyo que se habia duplicado el trabajo.

   🔑 Lo que hace distinto a este escenario de los de `prueba-offline.js`: aca el cierre FUNCIONA.
   Firestore responde y Cloudinary sube — igual que en Quillon, donde la OT quedo guardada a las
   21:38:49 y el PDF subio sin problemas. Lo unico que se rompe es la CONFIRMACION del correo: el
   POST llega al servidor, EmailJS manda el correo, y la respuesta muere en el camino. Para la app
   es un fallo; para Pedro es un correo entregado. Ese desacuerdo es todo el bug.

   Se mide en dos tramos, con una RECARGA de la pagina en el medio (el tecnico cerro la app y la
   abrio al dia siguiente, que es lo que dejo 24 h entre un correo y el otro):
     tramo 1 — cerrar la OT: salen 2 POST y los 2 quedan encolados como "pudo haber salido"
     tramo 2 — abrir la app con señal buena: salen 2 POST mas y tienen que ir MARCADOS

   CONTRAPRUEBA OBLIGATORIA contra `prefix.html` (una version anterior al fix): ahi el tramo 2
   manda los mismos 2 correos SIN ninguna marca — son los correos del 15-08 16:59. Si el guion
   pasa contra las dos versiones, no esta midiendo nada.

   Firestore y EmailJS son espias (imposible tocar produccion ni gastar cuota del plan de
   200 correos/mes). Cloudinary se intercepta con page.route. */

const { chromium, devices } = require('playwright');

const ARCHIVO = process.argv[2] || 'index.html';
const COLA_KEY = 'emval_correos_pendientes';
const log = (...a) => console.log(...a);
const fallos = [];
const chequear = (ok, detalle) => { if (!ok) fallos.push('  ✗ ' + detalle); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(Object.assign({}, devices['Pixel 7']));
  const page = await ctx.newPage();
  page.on('pageerror', e => log('  [error de pagina] ' + e.message.slice(0, 120)));

  // Cloudinary NUNCA sale a internet: responde OK sin subir nada a la cuenta real.
  await page.route('**api.cloudinary.com/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ secure_url: 'https://res.cloudinary.com/dcrf29tna/raw/upload/emval/pdfs/PRUEBA_ARNES.pdf' })
  }));

  log('\n══ ' + ARCHIVO + ' · el aviso de OT no se manda dos veces ══');
  await page.goto('http://localhost:8765/' + ARCHIVO);
  await page.waitForTimeout(2500);

  // El correo "sale" (queda registrado) y aun asi la app lo da por fallido, a los 3 s: por encima
  // del umbral de conexion, asi que tiene que leerse como "pudo haber salido", no como "no salio".
  await page.evaluate(() => { window.__CORREO_MODO = 'sale-y-falla'; window.__CORREO_MS = 3000; });

  // ── Flujo del tecnico, por la interfaz (identico al de prueba-offline.js) ──────────────────
  await page.locator('.usuario-item').first().click();
  await page.waitForTimeout(500);
  for (const d of '1111') await page.locator('button.pin-btn', { hasText: new RegExp('^' + d + '$') }).first().click();
  await page.waitForTimeout(1200);
  await page.locator('text=UNIMARC').first().click();
  await page.waitForTimeout(800);
  await page.locator('text=PRUEBA ARNES 1').first().click();
  await page.waitForTimeout(800);
  await page.locator('#t-corr').click();
  await page.locator('#desc-problema').fill('Transpaleta no levanta carga (PRUEBA ARNES)');
  await page.locator('button.btn', { hasText: 'Continuar' }).first().click();
  await page.waitForTimeout(800);
  await page.evaluate(() => { estado.fotoActualId = 'foto-antes-0'; estado.fotoActualTipo = 'antes'; estado.fotoActualIdx = 0; });
  await page.locator('#input-foto-galeria').setInputFiles(__dirname + '/foto-prueba.png');
  await page.waitForTimeout(1800);
  await page.locator('button.btn', { hasText: 'Iniciar trabajo' }).first().click();
  await page.waitForTimeout(900);
  await page.locator('#desc-trabajo').fill('Reparacion cielo de baño (PRUEBA ARNES)');
  await page.locator('#email-admin').fill('local.prueba@ejemplo.cl');
  for (const [tipo, idx] of [['despues', 0], ['timbre', 0]]) {
    await page.evaluate(([t, i]) => {
      estado.fotoActualId = 'foto-' + t + '-' + i; estado.fotoActualTipo = t; estado.fotoActualIdx = i;
    }, [tipo, idx]);
    await page.locator('#input-foto-galeria').setInputFiles(__dirname + '/foto-prueba.png');
    await page.waitForTimeout(1600);
  }
  const c = page.locator('#firma-canvas');
  const b = await c.boundingBox();
  await page.mouse.move(b.x + 20, b.y + b.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.3, { steps: 10 });
  await page.mouse.move(b.x + b.width - 25, b.y + b.height * 0.7, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.locator('button.btn', { hasText: 'Confirmar firma' }).click();
  await page.waitForTimeout(600);

  const listo = await page.evaluate(() => ({ firmada: estado.firmada, num: estado.otNumero }));
  log('OT lista para cerrar: #' + listo.num + ' · firmada: ' + listo.firmada);
  if (!listo.firmada) { log('✗ la firma no quedo registrada; se aborta'); await browser.close(); process.exit(2); }

  // ── TRAMO 1: se cierra la OT. Todo funciona menos la confirmacion del correo ───────────────
  await page.locator('#btn-cerrar-ot').click();
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const n = await page.evaluate(() => window.__CORREOS.length);
    if (n >= 2) break;
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(4000);   // que termine de encolar

  const tramo1 = await page.evaluate((k) => ({
    posts: window.__CORREOS.map(c => ({ a: c.params && c.params.email_admin, ot: String(c.params && c.params.ot_numero) })),
    cola: (JSON.parse(localStorage.getItem(k) || '[]') || []).map(c => ({
      a: c.params && c.params.email_admin, dudoso: c.posibleEnvio === true, despacho: c.despacho || ''
    }))
  }), COLA_KEY);

  log('\nTRAMO 1 — al cerrar la OT (' + Math.round((Date.now() - t0) / 1000) + 's)');
  log('  POST que llegaron al servidor: ' + tramo1.posts.length + '  ' + JSON.stringify(tramo1.posts));
  log('  avisos encolados: ' + tramo1.cola.length + '  ' + JSON.stringify(tramo1.cola));

  // 🔑 LINEA DE CONTROL. Si no salio ningun POST, el guion no midio nada: no habria duplicado que
  // evitar y todo lo de abajo "pasaria" por vacio. Es la leccion del PDF vacio del 13-08.
  chequear(tramo1.posts.length === 2,
    'LINEA DE CONTROL: tienen que salir 2 POST (local + administracion), salieron ' + tramo1.posts.length +
    '. Sin eso el guion no esta midiendo el duplicado.');
  chequear(tramo1.cola.length === 2, 'los 2 avisos tienen que quedar encolados (quedaron ' + tramo1.cola.length + ')');
  chequear(tramo1.cola.every(c => c.dudoso),
    'un fallo a los 3 s con señal es "pudo haber salido": los 2 tienen que quedar marcados como dudosos');

  // ── RECARGA: el tecnico cerro la app. Al dia siguiente la abre con señal buena ─────────────
  log('\n— se recarga la pagina (el tecnico cerro la app) y vuelve con señal buena');
  await page.evaluate(() => { window.__RECARGA = true; });
  await page.reload();
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.__CORREO_MODO = 'ok'; });   // ahora el correo sale de verdad

  // ── TRAMO 2: los gatillos de la cola corren solos ──────────────────────────────────────────
  const t1 = Date.now();
  while (Date.now() - t1 < 30000) {
    const n = await page.evaluate(() => window.__CORREOS.length);
    if (n >= 2) break;
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(3000);

  const tramo2 = await page.evaluate((k) => ({
    posts: window.__CORREOS.map(c => ({ a: c.params && c.params.email_admin, ot: String(c.params && c.params.ot_numero), trabajo: String((c.params && c.params.trabajo) || '').slice(0, 60) })),
    cola: (JSON.parse(localStorage.getItem(k) || '[]') || []).length,
    libro: Object.keys(JSON.parse(localStorage.getItem('emval_correos_despachados') || '{}')).length
  }), COLA_KEY);

  log('\nTRAMO 2 — con la app abierta de nuevo (' + Math.round((Date.now() - t1) / 1000) + 's)');
  log('  POST tras la recarga: ' + tramo2.posts.length);
  tramo2.posts.forEach(p => log('    → ' + p.a + '  ot_numero="' + p.ot + '"'));
  log('  cola despues: ' + tramo2.cola + ' · avisos en el libro de despachos: ' + tramo2.libro);

  chequear(tramo2.posts.length === 2,
    'el reenvio tiene que salir UNA vez por aviso: salieron ' + tramo2.posts.length + ' POST');
  chequear(tramo2.posts.length > 0 && tramo2.posts.every(p => /REENVIO/.test(p.ot)),
    'CADA reenvio tiene que ir MARCADO en el asunto (ot_numero), que es donde se ve sin abrir el correo. ' +
    'Salieron: ' + JSON.stringify(tramo2.posts.map(p => p.ot)));
  chequear(tramo2.posts.every(p => String(p.ot).includes(String(listo.num))),
    'el numero de OT completo se conserva, para que buscarlo en Gmail encuentre los dos correos');
  chequear(tramo2.cola === 0, 'despachados los reenvios la cola queda vacia (quedaron ' + tramo2.cola + ')');

  // ── TRAMO 3: ya despachados, no vuelven a salir nunca mas ──────────────────────────────────
  await page.evaluate(() => { window.__CORREOS.length = 0; });
  await page.evaluate(() => { if (typeof sincronizarCorreosPendientes === 'function') return sincronizarCorreosPendientes(); });
  await page.waitForTimeout(2500);
  const tramo3 = await page.evaluate(() => window.__CORREOS.length);
  log('\nTRAMO 3 — se fuerza otro ciclo de la cola: ' + tramo3 + ' POST (tiene que ser 0)');
  chequear(tramo3 === 0, 'un aviso ya despachado no puede volver a salir (salieron ' + tramo3 + ')');

  await browser.close();

  log('');
  if (fallos.length) {
    log('❌ FALLA — el aviso se manda dos veces o el reenvio no se distingue del original:');
    log(fallos.join('\n'));
    process.exit(1);
  }
  log('✅ OK — el reenvio sale una sola vez y va marcado: no se lee como un trabajo nuevo');
})();
