/* PRUEBA REAL — el administrador descarga una cotización y el archivo llega con el nombre nuevo.

   node tests/offline/prueba-nombre-pdf.js [index.html|prefix.html]

   Ejecuta el flujo entero por la interfaz: login como Administrador con contraseña, panel,
   "Cotizaciones", y click en "Ver PDF". Lo que se mide es el `suggestedFilename()` de la descarga
   que dispara el navegador — o sea el nombre con el que el archivo cae en la carpeta de Pedro,
   no lo que dice una función.

   Qué es real y qué no:
     Real   — el navegador, la app entera, el login con hash, el render de la lista, el click, y
              **Cloudinary de verdad**: la URL apunta a dos PDF que existen en la cuenta. Es una
              LECTURA pública (GET); no sube nada, no borra nada y no gasta cuota de ningún plan.
              El nombre lo pone Cloudinary en el Content-Disposition, no este guion.
     Espía  — Firestore y EmailJS (el SDK ni se carga: tocar producción es imposible).
     Bloqueado — api.cloudinary.com (las SUBIDAS), por si algún camino intentara escribir.

   Se prueban los dos casos que Pedro definió:
     1. Cotización con OT   -> "<folio> HS <N° OT> <servicio> <local>.pdf"
     2. Cotización previa   -> sin "HS" y sin número de OT en ninguna parte.
   Y los dos caminos del nombre del local: uno con `localCorto` guardado en el documento y otro
   sin él, que tiene que resolverse contra el catálogo de cadenas. */

const { chromium, devices } = require('playwright');

const ARCHIVO = process.argv[2] || 'index.html';
const HASH_PEDRO123 = 'cefdf4148cc0bdd9b6b4e6f125a65088e5340d9cf15d58000015b254bcf5168d';

// Dos PDF que existen de verdad en la cuenta de Cloudinary de EMVAL (verificados con HEAD 200).
const PDF_1 = 'https://res.cloudinary.com/dcrf29tna/raw/upload/v1785636717/emval/cotizaciones/Cotizacion_Alvi_Chillan_Correctivo_transpaletas_2026-08-02_715194.pdf';
const PDF_2 = 'https://res.cloudinary.com/dcrf29tna/raw/upload/v1785729228/emval/cotizaciones/Cotizacion_Alvi_Concepcion_Cierre_estacionamiento_2026-08-03_224195.pdf';

const fallos = [];
const chequear = (ok, d) => { if (!ok) fallos.push('  ✗ ' + d); };
const log = (...a) => console.log(...a);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(Object.assign({}, devices['Pixel 7'], { acceptDownloads: true }));
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message.slice(0, 140)));

  // Las SUBIDAS a Cloudinary quedan cortadas. Las lecturas (res.cloudinary.com) pasan.
  await page.route('**api.cloudinary.com/**', r => r.abort('internetdisconnected'));

  /* El arnés asigna `window.__SEMILLA` al cargar, así que se intercepta la asignación para
     fusionarle los documentos de esta prueba. Inyectarlos después no sirve: la app lee usuarios
     apenas arranca. */
  await page.addInitScript(({ hash, pdf1, pdf2 }) => {
    window.__EXTRA = {
      tecnicos: [
        { _id: 'adm1', nombre: 'PEDRO PRUEBA', cargo: 'Administrador', letra: 'P', passwordHash: hash }
      ],
      cadenas: [
        { _id: 'c1', nombre: 'Alvi', color: '#1B3A6B', logo: '', letra: 'A', orden: 0,
          sucursales: [{ nombre: 'Alvi Chillan', centro: '474' }] },
        { _id: 'c2', nombre: 'S10', color: '#1B3A6B', logo: '', letra: 'S', orden: 1,
          sucursales: [{ nombre: 'S10 Chillan 2', centro: '907' }] }
      ],
      cotizaciones: [
        // CON OT. A propósito SIN `localCorto`: obliga a resolver "Alvi Chillan" -> "Chillan"
        // contra el catálogo, que es como estan las 103 cotizaciones que ya existen.
        { _id: 'cot1', numeroCotizacion: '01082604', otNumero: 301143, local: 'Alvi Chillan',
          nombreServicio: 'Correctivo transpaletas', descripcionTrabajo: 'Correctivo transpaletas',
          carpeta: 'PRUEBA ARNES', enviado: false, total: 120000, fecha: '02-08-2026',
          pdfUrl: pdf1, pdfGeneradoEn: 4102444800000, items: [] },
        // PREVIA: sin OT. Con `localCorto` guardado, como las que se creen de ahora en adelante.
        { _id: 'cot2', numeroCotizacion: '01082605', otNumero: '', tipoCot: 'previa',
          estadoCot: 'Pendiente', local: 'S10 Chillan 2', localCorto: 'Chillan 2',
          nombreServicio: 'Cambio de lamas', descripcionTrabajo: 'Cambio de lamas',
          carpeta: 'PRUEBA ARNES', enviado: false, total: 90000, fecha: '02-08-2026',
          pdfUrl: pdf2, pdfGeneradoEn: 4102444800000, items: [] }
      ]
    };
    let real = null;
    Object.defineProperty(window, '__SEMILLA', {
      configurable: true,
      get() { return real; },
      set(v) { real = Object.assign(v || {}, window.__EXTRA); }
    });
  }, { hash: HASH_PEDRO123, pdf1: PDF_1, pdf2: PDF_2 });

  // Toda descarga, venga de la pestaña principal o del popup que abre window.open.
  const descargas = [];
  const escuchar = p => p.on('download', d => descargas.push(d.suggestedFilename()));
  escuchar(page);
  ctx.on('page', escuchar);

  log('\n══ ' + ARCHIVO + ' · descarga de cotización por el administrador ══');
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
  // La pantalla a la que cae el Administrador es el panel de supervisión (`s-supervisor`): Pedro
  // usa ese panel, no una pantalla propia. Se afirma que salió del login, no un id concreto.
  const pantalla = await page.evaluate(() => {
    const s = document.querySelector('.screen.active');
    return s ? s.id : '(ninguna)';
  });
  const entro = pantalla !== 's-usuarios' && pantalla !== 's-pin';
  chequear(entro, 'el login de administrador no salió de la pantalla de acceso (quedó en ' + pantalla + ')');
  log('1) Login como Administrador: ' + (entro ? 'entró a ' + pantalla + ' ✓' : 'quedó en ' + pantalla + ' ✗'));

  // ── 2. Panel -> Cotizaciones ────────────────────────────────────────────────────────────────
  await page.locator('button', { hasText: /^Cotizaciones$/ }).first().click();
  await page.waitForTimeout(2000);
  // Las cotizaciones se agrupan por carpeta de supervisor; hay que abrir la carpeta.
  const carpeta = page.locator('text=PRUEBA ARNES').first();
  if (await carpeta.count()) { await carpeta.click(); await page.waitForTimeout(1200); }
  const botones = page.locator('button', { hasText: /^Ver PDF$/ });
  const cuantos = await botones.count();
  chequear(cuantos >= 2, 'se esperaban 2 botones "Ver PDF" y hay ' + cuantos);
  log('2) Lista de cotizaciones: ' + cuantos + ' botones "Ver PDF" ✓');

  // ── 3. Descargar la cotización CON N° de OT ────────────────────────────────────────────────
  await botones.nth(0).click();
  await page.waitForTimeout(6000);
  // ── 4. Descargar la PREVIA ─────────────────────────────────────────────────────────────────
  await botones.nth(1).click();
  await page.waitForTimeout(6000);

  log('\nArchivos que descargó el navegador:');
  descargas.forEach(n => log('   · ' + n));

  const conOT = descargas.find(n => n.indexOf('01082604') === 0);
  const previa = descargas.find(n => n.indexOf('01082605') === 0);

  const esperadoOT = '01082604 HS 301143 Correctivo transpaletas Chillan.pdf';
  chequear(conOT === esperadoOT, 'con OT llegó "' + conOT + '", se esperaba "' + esperadoOT + '"');

  const esperadoPrev = '01082605 Cambio de lamas Chillan 2.pdf';
  chequear(previa === esperadoPrev, 'la previa llegó "' + previa + '", se esperaba "' + esperadoPrev + '"');
  chequear(previa ? !/\bHS\b/.test(previa) : false, 'la previa trae "HS" en el nombre: "' + previa + '"');
  chequear(previa ? !/301143|\b\d{6}\b/.test(previa.replace(/^01082605/, '')) : false,
    'la previa trae un número de OT: "' + previa + '"');

  log('\n3) Con N° de OT:  ' + (conOT === esperadoOT ? conOT + ' ✓' : 'llegó "' + conOT + '" ✗'));
  log('4) Previa sin OT: ' + (previa === esperadoPrev ? previa + ' ✓' : 'llegó "' + previa + '" ✗'));

  if (errores.length) log('\nErrores de JS en la página: ' + errores.join(' | '));
  chequear(errores.length === 0, 'la página lanzó errores de JS: ' + errores.join(' | '));

  await browser.close();

  log('');
  if (fallos.length) { console.error('FALLOS:\n' + fallos.join('\n')); process.exit(1); }
  log('OK — el archivo llega a la carpeta con el nombre que pidió Pedro.');
})();
