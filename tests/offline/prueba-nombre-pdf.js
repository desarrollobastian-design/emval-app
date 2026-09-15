/* PRUEBA REAL — el administrador descarga la CT y la HS y los archivos llegan con el nombre que
   exige SMU. Caso COT 15092601 / OT 796863 (15-09-2026).

   node tests/offline/prueba-nombre-pdf.js [index.html|prefix.html]

   Ejecuta el flujo por la interfaz: login como Administrador con contraseña, panel,
   "Cotizaciones", y click en cada "Ver PDF". Se mide el `suggestedFilename()` de la descarga que
   dispara el navegador — el nombre con el que el archivo cae en la carpeta de Pedro.
   Para la HS se pide a la app, con su catálogo y sus datos, el enlace que manda en el correo
   "Descargar HS" (`_obtenerHojaDeCot`), y se abre en el navegador como lo abre el supervisor.

   Qué es real y qué no:
     Real   — el navegador, la app entera, el login con hash, el catálogo cacheado por
              `cargarCadenasApp`, el render de la lista, el click, y **Cloudinary de verdad**: las
              URLs apuntan a PDF que existen en la cuenta, con el `fl_attachment` que arma la app.
              Son LECTURAS públicas (GET); no suben nada ni gastan cuota.
              Si Cloudinary rechaza el nombre (400), no hay descarga y la prueba falla: eso es lo que
              le pasó al supervisor de SMU con la HS 796863.
     Espía  — Firestore y EmailJS (el SDK ni se carga: tocar producción es imposible).
     Bloqueado — api.cloudinary.com (las SUBIDAS).

   Los datos son los de producción TAL CUAL, incluido lo que falta: la COT 15092601 y la OT 796863
   tienen el CECO vacío y el local "S10 Concepcion", una ficha sin centro. El CECO 3164 tiene que
   salir del catálogo por ALIAS_LOCALES.

   CONTRAPRUEBA: prefix.html armado desde 943888e. Ahí la CT sale "COT - … - ceco SIN-CECO", la de
   la coma y la HS dan 400 y no se descarga nada. */

const { chromium, devices } = require('playwright');

const ARCHIVO = process.argv[2] || 'index.html';
const HASH_PEDRO123 = 'cefdf4148cc0bdd9b6b4e6f125a65088e5340d9cf15d58000015b254bcf5168d';

// PDF reales de la cuenta de EMVAL (verificados con HEAD el 15-09-2026).
const CT_15092601 = 'https://res.cloudinary.com/dcrf29tna/raw/upload/v1789474108/emval/cotizaciones/COT_15092601_ceco_SIN_CECO_Destape_piletas_y_camara_107503.pdf';
const HS_796863 = 'https://res.cloudinary.com/dcrf29tna/raw/upload/v1789395715/emval/pdfs/Recepcion_Obra_OT796863_qp9imoz.pdf';
const CT_01082617 = 'https://res.cloudinary.com/dcrf29tna/raw/upload/v1785638841/emval/cotizaciones/Cotizacion_UNIMARC_GOMEZ_CARRENO_Cambio_ubicacion_termo_retiro_termo_malo_2026-08-02_833331.pdf';
const PDF_PREVIA = 'https://res.cloudinary.com/dcrf29tna/raw/upload/v1785729228/emval/cotizaciones/Cotizacion_Alvi_Concepcion_Cierre_estacionamiento_2026-08-03_224195.pdf';

const DESC_796863 = 'Asistencia por piletas tapadas en sector Venta Asistida.\n- Se realiza limpieza de cañerías de desagüe desde venta asistida (Carnicería y Fiambrería) hasta cámara de inspección.\nQuedando cañerías de desagüe limpias sin problemas de rebalse.';

const fallos = [];
const chequear = (ok, d) => { if (!ok) fallos.push('  ✗ ' + d); };
const log = (...a) => console.log(...a);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(Object.assign({}, devices['Pixel 7'], { acceptDownloads: true }));
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message.slice(0, 140)));
  page.on('console', m => { if (m.type() === 'error') log('   navegador: ' + m.text().slice(0, 160)); });

  await page.route('**api.cloudinary.com/**', r => r.abort('internetdisconnected'));

  await page.addInitScript(({ hash, ct1, ct2, previa, hs, desc }) => {
    window.__EXTRA = {
      tecnicos: [
        { _id: 'adm1', nombre: 'PEDRO PRUEBA', cargo: 'Administrador', letra: 'P', passwordHash: hash }
      ],
      // Fichas reales: "S10 Concepcion" sin centro (relleno) y "M10 CONCEPCION" con 3164.
      cadenas: [
        { _id: 'c1', nombre: 'M10', color: '#1B3A6B', logo: '', letra: 'M', orden: 0,
          sucursales: [{ nombre: 'M10 CONCEPCION', centro: '3164', direccion: 'Los Carrera 637 Concepcion' }] },
        { _id: 'c2', nombre: 'S10', color: '#1B3A6B', logo: '', letra: 'S', orden: 1,
          sucursales: [{ nombre: 'S10 Concepcion', email: '' }, { nombre: 'S10 Chillan 2', centro: '907' }] },
        { _id: 'c3', nombre: 'Unimarc', color: '#1B3A6B', logo: '', letra: 'U', orden: 2,
          sucursales: [{ nombre: 'UNIMARC GOMEZ CARRENO', centro: '713' }] }
      ],
      ordenes: [
        { _id: 'ot_mu1by0re_qp9imoz', numero: 796863, local: 'S10 Concepcion', ceco: '', tipo: 'correctivo',
          tecnico: 'Lucas Fernández', fecha: '14-09-2026', cotizacionNumero: '15092601',
          cotizacionId: 'cot1', descripcionTrabajo: desc, firmada: true, estado: 'Terminada',
          pdfUrlCloudinary: hs, pdfUrl: 'https://desarrollobastian-design.github.io/emval-app/?pdf=sBE6AgdWrO9XFi9r1q42' }
      ],
      cotizaciones: [
        // El caso: centro VACIO, como esta en Firestore.
        { _id: 'cot1', numeroCotizacion: '15092601', otNumero: 796863, otId: 'ot_mu1by0re_qp9imoz',
          local: 'S10 Concepcion', localCorto: 'S10 Concepcion', centro: '',
          nombreServicio: 'Destape piletas y camara', descripcionTrabajo: desc,
          carpeta: 'PRUEBA ARNES', enviado: false, total: 130000, fecha: '15-09-2026',
          pdfUrl: ct1, pdfGeneradoEn: 4102444800000, pdfFormato: 4, items: [] },
        // Coma en el servicio: la unica CT de produccion que armaba un enlace roto.
        { _id: 'cot2', numeroCotizacion: '01082617', otNumero: '', local: 'UNIMARC GOMEZ CARRENO', centro: '713',
          nombreServicio: 'Cambio ubicacion termo, retiro termo malo', descripcionTrabajo: 'Cambio ubicacion termo, retiro termo malo',
          carpeta: 'PRUEBA ARNES', enviado: false, total: 90000, fecha: '02-08-2026',
          pdfUrl: ct2, pdfGeneradoEn: 4102444800000, pdfFormato: 4, items: [] },
        // PREVIA: sin OT.
        { _id: 'cot3', numeroCotizacion: '01082605', otNumero: '', tipoCot: 'previa',
          estadoCot: 'Pendiente', local: 'S10 Chillan 2', localCorto: 'Chillan 2', centro: '907',
          nombreServicio: 'Cambio de lamas', descripcionTrabajo: 'Cambio de lamas',
          carpeta: 'PRUEBA ARNES', enviado: false, total: 90000, fecha: '02-08-2026',
          pdfUrl: previa, pdfGeneradoEn: 4102444800000, pdfFormato: 4, items: [] }
      ]
    };
    let real = null;
    Object.defineProperty(window, '__SEMILLA', {
      configurable: true,
      get() { return real; },
      set(v) { real = Object.assign(v || {}, window.__EXTRA); }
    });
  }, { hash: HASH_PEDRO123, ct1: CT_15092601, ct2: CT_01082617, previa: PDF_PREVIA, hs: HS_796863, desc: DESC_796863 });

  const descargas = [];
  const escuchar = p => p.on('download', d => descargas.push(d.suggestedFilename()));
  escuchar(page);
  ctx.on('page', escuchar);

  log('\n══ ' + ARCHIVO + ' · descarga de CT y HS por el administrador ══');
  await page.goto('http://localhost:8765/' + ARCHIVO);
  await page.waitForTimeout(2500);

  // ── 1. Login real como Administrador ────────────────────────────────────────────────────────
  await page.locator('.usuario-item', { hasText: 'PEDRO PRUEBA' }).first().click();
  await page.waitForTimeout(600);
  const campoPass = page.locator('#admin-pass-input');
  chequear(await campoPass.isVisible(), 'no apareció el campo de contraseña del administrador');
  await campoPass.fill('Pedro123');
  await page.locator('button', { hasText: 'Ingresar' }).first().click();
  await page.waitForTimeout(1500);
  const pantalla = await page.evaluate(() => { const s = document.querySelector('.screen.active'); return s ? s.id : '(ninguna)'; });
  const entro = pantalla !== 's-usuarios' && pantalla !== 's-pin';
  chequear(entro, 'el login de administrador no salió de la pantalla de acceso (quedó en ' + pantalla + ')');
  log('1) Login como Administrador: ' + (entro ? 'entró a ' + pantalla + ' ✓' : 'quedó en ' + pantalla + ' ✗'));
  // El catálogo del que sale el CECO es el que cacheó la app al arrancar, no uno inyectado.
  const cache = await page.evaluate(() => (localStorage.getItem('emval_cadenas_cache') || '').indexOf('M10 CONCEPCION') >= 0);
  chequear(cache, 'la app no dejó el catálogo en emval_cadenas_cache');

  // ── 2. Panel -> Cotizaciones ────────────────────────────────────────────────────────────────
  await page.locator('button', { hasText: /^Cotizaciones$/ }).first().click();
  await page.waitForTimeout(2000);
  const carpeta = page.locator('text=PRUEBA ARNES').first();
  if (await carpeta.count()) { await carpeta.click(); await page.waitForTimeout(1200); }
  const botones = page.locator('button', { hasText: /^Ver PDF$/ });
  const cuantos = await botones.count();
  chequear(cuantos >= 3, 'se esperaban 3 botones "Ver PDF" y hay ' + cuantos);
  log('2) Lista de cotizaciones: ' + cuantos + ' botones "Ver PDF"');

  // ── 3. "Ver PDF" en cada cotización ─────────────────────────────────────────────────────────
  for (let i = 0; i < cuantos; i++) {
    await botones.nth(i).click();
    await page.waitForTimeout(6000);
  }

  // ── 4. La HS, por el mismo camino que el botón "Descargar HS" del correo ──────────────────────
  const hoja = await page.evaluate(async () => {
    const cot = Object.values(window._todasCotizaciones || {}).find(c => c.numeroCotizacion === '15092601');
    if (!cot || typeof _obtenerHojaDeCot !== 'function') return null;
    // El espía sirve `doc(id).get()` desde __DOCS: la OT se deja donde la leería Firestore.
    const ot = (window.__SEMILLA.ordenes || []).find(o => o._id === cot.otId);
    if (ot) window.__DOCS['ordenes/' + ot._id] = ot;
    const h = await _obtenerHojaDeCot(cot);
    return h ? { nombre: h.nombre, url: _urlPDFDescarga(h.url, h.nombre) } : null;
  });
  chequear(!!hoja, 'la app no encontró la HS de la cotización 15092601');
  if (hoja) {
    log('   Enlace "Descargar HS" que arma la app:\n   ' + hoja.url);
    const pestana = await ctx.newPage();
    const espera = pestana.waitForEvent('download', { timeout: 20000 }).catch(() => null);
    await pestana.goto(hoja.url).catch(() => {});   // una descarga aborta la navegación: es lo esperado
    const d = await espera;
    if (!d) chequear(false, 'abrir el enlace de la HS no descargó nada (Cloudinary lo rechazó)');
    await pestana.close();
  }

  log('\nArchivos que descargó el navegador:');
  descargas.forEach(n => log('   · ' + n));

  const esperados = [
    ['3a) CT del caso', 'CT - 15092601 - ceco 3164 - Destape piletas y camara.pdf'],
    ['3b) CT con coma', 'CT - 01082617 - ceco 0713 - Cambio ubicacion termo retiro termo malo.pdf'],
    ['3c) CT previa', 'CT - 01082605 - ceco 0907 - Cambio de lamas.pdf'],
    ['4)  HS del caso', 'HS - 796863 - CT 15092601 - ceco 3164 - Destape piletas y camara.pdf']
  ];
  log('');
  esperados.forEach(([etq, nombre]) => {
    const ok = descargas.indexOf(nombre) >= 0;
    chequear(ok, etq + ': no llegó "' + nombre + '"');
    log(etq + ': ' + (ok ? nombre + ' ✓' : 'no llegó "' + nombre + '" ✗'));
  });
  const previa = descargas.find(n => n.indexOf('CT - 01082605') === 0) || '';
  chequear(!/\bHS\b/.test(previa) && !/\b\d{6}\b/.test(previa.replace(/^CT - 01082605/, '')),
    'la previa trae un N° de HS/OT en el nombre: "' + previa + '"');
  chequear(!descargas.some(n => /\bCOT\b|SIN-CECO/.test(n)), 'alguna descarga salió con "COT" o "SIN-CECO"');

  if (errores.length) log('\nErrores de JS en la página: ' + errores.join(' | '));
  chequear(errores.length === 0, 'la página lanzó errores de JS: ' + errores.join(' | '));

  await browser.close();

  log('');
  if (fallos.length) { console.error('FALLOS:\n' + fallos.join('\n')); process.exit(1); }
  log('OK — la CT y la HS llegan a la carpeta con el nombre que exige SMU, y se descargan.');
})();
