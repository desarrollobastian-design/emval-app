/* PRUEBA REAL — cerrar una OT en un telefono sin señal, en Chromium, con la app entera.

   node tests/offline/prueba-offline.js <index.html|prefix.html> <A|B|C>

   Escenario A — SIN SEÑAL TOTAL: Cloudinary no responde y Firestore tampoco.
     Es el cierre en terreno. Lo que se comprueba: que guardarYEnviarPDF NO se cuelga, y que
     el correo al local y el aviso a administracion alcanzan a ENTRAR en su cola de reintento.
     Medido el 13-08-2026: con el fix salen los 2 correos a los 26 s. Contra `prefix.html`
     (codigo anterior al fix) seguian en 0 a los 130 s — colgado en add:pdfs para siempre.
   Escenario B — SEÑAL INTERMITENTE: el PDF sube a Cloudinary y Firestore se cae justo despues.
     Es el que fabrica los PDF huerfanos. Lo que se comprueba: que el enlace queda encolado en
     el dispositivo y que al volver la señal se aplica con update(), escribiendo SOLO la URL que
     traia (no pisa con '' la que ya estaba buena).
   Escenario C — el reintento llega ANTES de que la OT exista en la base (sigue en la cola del
     telefono). Lo que se comprueba: que update() lo rechaza con not-found, que el enlace SIGUE
     pendiente y que NO se crea una orden fantasma. Es el invariante que hace peligroso usar
     set({merge}) aqui.

   Firestore y EmailJS son espias (imposible tocar produccion ni gastar cuota). Cloudinary se
   intercepta con page.route: tampoco se sube nada a la cuenta real. Todo lo demas —el navegador,
   la app, jsPDF, el canvas de la firma, IndexedDB, localStorage, el teclado del telefono— es real. */

const { chromium, devices } = require('playwright');

const ARCHIVO = process.argv[2] || 'index.html';
const ESC = (process.argv[3] || 'A').toUpperCase();
const VENTANA_MS = 130000;   // margen para los timeouts de 25 s encadenados

const log = (...a) => console.log(...a);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(Object.assign({}, devices['Pixel 7']));
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message.slice(0, 120)));

  // Cloudinary NUNCA sale a internet en esta prueba.
  let cloudinarySube = (ESC === 'B' || ESC === 'C');
  await page.route('**api.cloudinary.com/**', route => {
    if (!cloudinarySube) return route.abort('internetdisconnected');
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ secure_url: 'https://res.cloudinary.com/dcrf29tna/raw/upload/emval/pdfs/PRUEBA_ARNES.pdf' })
    });
  });

  log('\n══ ' + ARCHIVO + ' · escenario ' + ESC + ' ══');
  await page.goto('http://localhost:8765/' + ARCHIVO);
  await page.waitForTimeout(2500);

  // ── Flujo del tecnico, por la interfaz ────────────────────────────────────────────────────
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

  await page.locator('#desc-trabajo').fill('Cambio de sello hidraulico (PRUEBA ARNES)');
  await page.locator('#email-admin').fill('local.prueba@ejemplo.cl');

  // cerrarOT exige tambien >=1 foto del trabajo terminado y la foto del timbre del local.
  for (const [tipo, idx] of [['despues', 0], ['timbre', 0]]) {
    await page.evaluate(([t, i]) => {
      estado.fotoActualId = 'foto-' + t + '-' + i; estado.fotoActualTipo = t; estado.fotoActualIdx = i;
    }, [tipo, idx]);
    await page.locator('#input-foto-galeria').setInputFiles(__dirname + '/foto-prueba.png');
    await page.waitForTimeout(1600);
  }

  // Firma con el dedo, sobre el canvas real.
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

  const listo = await page.evaluate(() => ({ firmada: estado.firmada, num: estado.otNumero, tipo: estado.tipo }));
  log('OT lista para cerrar: #' + listo.num + ' · tipo ' + listo.tipo + ' · firmada: ' + listo.firmada);
  if (!listo.firmada) { log('✗ la firma no quedo registrada; se aborta'); await browser.close(); process.exit(2); }

  // ── SE CAE LA SEÑAL, justo antes de cerrar ────────────────────────────────────────────────
  await page.evaluate(() => { window.__OFFLINE = true; window.__t0 = Date.now(); });
  if (ESC === 'A') await ctx.setOffline(true);
  log('— señal caida (Firestore no responde' + (ESC === 'B' ? '; Cloudinary si)' : '; Cloudinary tampoco)'));

  await page.evaluate(() => { window.__cerrado = false; });
  await page.locator('#btn-cerrar-ot').click();

  // Observar hasta que la app haga lo que tenga que hacer.
  const t0 = Date.now();
  let ultimo = '';
  while (Date.now() - t0 < VENTANA_MS) {
    const s = await page.evaluate(() => ({
      correos: window.__CORREOS.length,
      colgadas: window.__COLGADAS.slice(),
      pantalla: (([...document.querySelectorAll('.screen')].find(x => x.classList.contains('active')) || {}).id) || '?',
      // La clave real de la cola de correos es `emval_correos_pendientes` (_CORREOS_KEY). Este
      // contador leia 'emval_cola_correos', que no existe: mostraba 0 siempre y no medía nada.
      colaCorreos: (JSON.parse(localStorage.getItem('emval_correos_pendientes') || '[]') || []).length,
      colaEnlaces: (JSON.parse(localStorage.getItem('emval_enlaces_pdf_pendientes') || '[]') || []).length,
    }));
    const t = Math.round((Date.now() - t0) / 1000);
    const linea = 'correos=' + s.correos + ' colgadas=' + s.colgadas.length + ' colaCorreos=' + s.colaCorreos + ' colaEnlaces=' + s.colaEnlaces + ' pantalla=' + s.pantalla;
    if (linea !== ultimo) { log('  [' + t + 's] ' + linea); ultimo = linea; }
    // Local + administracion: la cadena completa. Lo que se mide es que los DOS avisos lleguen a
    // su cola de reintento — que es el invariante—, no que se intente el POST.
    // 🔄 16-08-2026: sin señal DECLARADA (navigator.onLine === false) la app ya no le pega al
    // servidor; encola directo. Gastar 2 requests de las 200 del mes contra una red que se sabe
    // caida no servia de nada. Por eso el escenario A ahora corta por `colaCorreos`, no por
    // `correos`: el aviso entra en la cola en el mismo segundo 26 en que antes salia el POST.
    if (s.correos >= 2 || s.colaCorreos >= 2) break;
    await page.waitForTimeout(1500);
  }

  const fin = await page.evaluate(() => ({
    correos: window.__CORREOS.map(c => ({ a: c.params && c.params.email_admin, ot: c.params && c.params.ot_numero })),
    colaCorreos: (JSON.parse(localStorage.getItem('emval_correos_pendientes') || '[]') || [])
      .map(c => ({ a: c.params && c.params.email_admin, ot: c.params && c.params.ot_numero })),
    colgadas: window.__COLGADAS,
    escrituras: window.__ESCRITURAS.filter(e => e.op).map(e => e.op + ':' + e.coleccion + (e.docId ? '/' + e.docId : '')),
    colaEnlaces: JSON.parse(localStorage.getItem('emval_enlaces_pdf_pendientes') || '[]'),
  }));

  log('\nRESULTADO (' + Math.round((Date.now() - t0) / 1000) + 's despues de tocar "Cerrar y generar OT")');
  log('  correos que alcanzaron a intentarse: ' + fin.correos.length + '  ' + JSON.stringify(fin.correos));
  // Lo que de verdad importa en el escenario A: los 2 avisos existen y se van a reintentar solos.
  log('  avisos a salvo en la cola de reintento: ' + fin.colaCorreos.length + '  ' + JSON.stringify(fin.colaCorreos));
  log('  llamadas que quedaron colgadas: ' + fin.colgadas.length + '  [' + fin.colgadas.join(', ') + ']');
  log('  escrituras intentadas: ' + JSON.stringify(fin.escrituras));
  log('  cola de enlaces de PDF: ' + JSON.stringify(fin.colaEnlaces));

  // ── Vuelve la señal ───────────────────────────────────────────────────────────────────────
  if (ESC === 'B' || ESC === 'C') {
    log('\n— vuelve la señal: se sincroniza como lo hace la app sola');
    await page.evaluate(() => { window.__OFFLINE = false; });
    if (ESC === 'C') {
      // El caso peligroso: el enlace se reintenta ANTES de que la OT haya subido desde la cola
      // del telefono. Con set({merge}) esto crearia una orden fantasma. Con update() no.
      log('  (escenario C: la OT todavia NO existe en la base — no se sincronizan las OT)');
    } else {
      await page.evaluate(() => sincronizarOTsPendientes());
    }
    await page.waitForTimeout(2500);
    await page.evaluate(() => sincronizarEnlacesPDFPendientes());
    await page.waitForTimeout(2500);
    const tras = await page.evaluate(() => ({
      cola: JSON.parse(localStorage.getItem('emval_enlaces_pdf_pendientes') || '[]'),
      updates: window.__ESCRITURAS.filter(e => e.op === 'update' && e.coleccion === 'ordenes').map(e => e.datos),
      sets: window.__ESCRITURAS.filter(e => e.op === 'set' && e.coleccion === 'ordenes').length,
      notFound: window.__ESCRITURAS.filter(e => e.op === 'update-not-found').length,
    }));
    log('  cola de enlaces despues de sincronizar: ' + JSON.stringify(tras.cola));
    log('  updates a ordenes: ' + JSON.stringify(tras.updates));
    log('  ordenes creadas con set: ' + tras.sets + ' · updates rechazados por doc inexistente: ' + tras.notFound);
  }

  if (errores.length) log('\nerrores JS: ' + errores.slice(0, 3).join(' | '));
  await page.screenshot({ path: __dirname + '/final-' + ARCHIVO.replace('.html', '') + '-' + ESC + '.png' });
  await browser.close();
})();
