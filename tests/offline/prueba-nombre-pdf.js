/* PRUEBA REAL — el administrador descarga la CT y la HS y los archivos llegan con el nombre que
   exige SMU. Caso COT 15092601 / OT 796863 (15-09-2026).

   node tests/offline/prueba-nombre-pdf.js [index.html|prefix.html]

   Ejecuta el flujo por la interfaz: login como Administrador con contraseña, panel,
   "Cotizaciones", y click en cada "Ver PDF". Hasta el 25-09-2026 ese boton descargaba y se media
   el `suggestedFilename()` de la descarga; desde la decision de Bastian de ese dia abre la VISTA,
   y se mide como los pasos 5 a 7 (ver abajo): la URL de la pestana que abre (/files/ con el nombre
   de la CT en la ruta), su HEAD y, si Chromium headless la guarda, el nombre sugerido.
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
     Bloqueado — api.cloudinary.com (las SUBIDAS). En el paso 8a se responde ahi mismo, en el
              navegador, con la URL de un PDF que ya existe: tampoco sale nada.

   Los datos son los de producción TAL CUAL, incluido lo que falta: la COT 15092601 y la OT 796863
   tienen el CECO vacío y el local "S10 Concepcion", una ficha sin centro. El CECO 3164 tiene que
   salir del catálogo por ALIAS_LOCALES.

   24-09-2026 — decision de Bastian: Compartir y los "Ver PDF" de la app pasan a VISTA PREVIA.
   Despues de la CT y la HS, el guion recorre por la interfaz lo que cambio:
     5. Compartir la cotizacion 15092601 (CT + HS) con el menu del sistema espiado.
     6. Preventivos: "Ver PDF" y "Compartir" de la hoja 247863.
     7. Ver OTs por tecnico: "Ver PDF" y "Compartir" de la OT 796863, y "Abrir el PDF" del menu
        propio (sin menu del sistema, como en un PC).
   Lo que se mide ahi no es una descarga: es la URL que la app abre o entrega (tiene que ser
   /files/ con el nombre de SMU en la ruta) y un HEAD real a esa URL (200 application/pdf SIN
   `Content-Disposition: attachment`, o sea: el navegador la muestra). Chromium headless no trae
   visor de PDF y la guarda igual; si lo hace, el nombre sugerido tiene que ser el de SMU.
   25-09-2026 — decision de Bastian: el "Ver PDF" de Cotizaciones (paso 3) tambien abre la vista.
     8. "Ver PDF" de dos CT que hay que REGENERAR (formato viejo). La subida a api.cloudinary.com no
        sale nunca: en 8a la intercepta `page.route` y responde con la URL de un PDF que ya existe
        (CT 15092601), en 8b se corta. 8a: la pestana se abre en el mismo toque, ANTES de la
        subida, y es esa misma pestana la que termina en la vista con el nombre de la CT. 8b: la
        subida falla, la pestana del toque se cierra y la app avisa.
     9. La app instalada de iPhone (`navigator.standalone`), EMULADA: ahi window.open devuelve null
        y no abre nada (web.dev, "Window management"; no medido en un iPhone). 9a: la CT vigente
        abre la vista por un enlace, en el mismo toque, sin aviso. 9b: la CT que hay que regenerar
        no abre nada hasta que se toca "Abrir el PDF" del aviso "PDF listo", y ese toque abre la
        vista. Es la logica de la app contra el comportamiento documentado, no un iPhone.
   BLOQUEADOR REAL: Playwright lanza Chromium con el bloqueador de ventanas APAGADO
   (--disable-popup-blocking). Aca se lanza el Chromium completo (channel 'chromium', headless
   nuevo) sin ese flag, y en 8a la subida tarda 6,5 s: un window.open despues de ese await queda
   fuera del toque (Chromium lo da por vencido a los ~5 s) y el bloqueador lo corta de verdad.
   Medido el 25-09-2026 con una pagina minima: tras 1 s abre, tras 6 s devuelve null y no abre, y
   la pestana abierta en el toque se deja llevar a la URL a los 6 s.
   El "Descargar HS" (paso 4) sigue DESCARGANDO con nombre: esta fuera de esas decisiones.
   Unico atajo: para volver al Panel Supervisor se llama `go('s-supervisor')`; los botones que
   cargan cada lista ("Ver OTs", "Preventivos", "Correctivos", el tecnico) se aprietan de verdad.

   Puerto y host: EMVAL_PUERTO / EMVAL_HOST (por defecto localhost:8765).

   CONTRAPRUEBA: prefix.html armado desde 943888e. Ahí la CT sale "COT - … - ceco SIN-CECO", la de
   la coma y la HS dan 400 y no se descarga nada. Armado desde origin/main (4e61b64, antes del
   24-09), los pasos 5 a 7 entregan `fl_attachment` (HEAD con attachment), los pasos 3 y 8
   descargan en vez de abrir una pestana, y el guion falla. */

const { chromium, devices } = require('playwright');

const ARCHIVO = process.argv[2] || 'index.html';
const HASH_PEDRO123 = 'cefdf4148cc0bdd9b6b4e6f125a65088e5340d9cf15d58000015b254bcf5168d';

// PDF reales de la cuenta de EMVAL (verificados con HEAD el 15-09-2026).
const CT_15092601 = 'https://res.cloudinary.com/dcrf29tna/raw/upload/v1789474108/emval/cotizaciones/COT_15092601_ceco_SIN_CECO_Destape_piletas_y_camara_107503.pdf';
const HS_796863 = 'https://res.cloudinary.com/dcrf29tna/raw/upload/v1789395715/emval/pdfs/Recepcion_Obra_OT796863_qp9imoz.pdf';
const CT_01082617 = 'https://res.cloudinary.com/dcrf29tna/raw/upload/v1785638841/emval/cotizaciones/Cotizacion_UNIMARC_GOMEZ_CARRENO_Cambio_ubicacion_termo_retiro_termo_malo_2026-08-02_833331.pdf';
const PDF_PREVIA = 'https://res.cloudinary.com/dcrf29tna/raw/upload/v1785729228/emval/cotizaciones/Cotizacion_Alvi_Concepcion_Cierre_estacionamiento_2026-08-03_224195.pdf';
// Hoja preventiva real (UNIMARC, CECO 713), verificada con HEAD el 24-09-2026.
const HS_247863 = 'https://res.cloudinary.com/dcrf29tna/raw/upload/v1790265011/emval/pdfs/713-HS%20247863-MP%20Transpaletas%20Septiembre%202026_yrh74lk.pdf';
const NOMBRE_CT = 'CT - 15092601 - ceco 3164 - Destape piletas y camara.pdf';
const NOMBRE_HS = 'HS - 796863 - CT 15092601 - ceco 3164 - Destape piletas y camara.pdf';
const NOMBRE_HS_PREV = 'HS - 247863 - ceco 0713 - MP Transpaletas Septiembre 2026.pdf';
const BASE = 'http://' + (process.env.EMVAL_HOST || 'localhost') + ':' + (process.env.EMVAL_PUERTO || '8765') + '/';

const DESC_796863 = 'Asistencia por piletas tapadas en sector Venta Asistida.\n- Se realiza limpieza de cañerías de desagüe desde venta asistida (Carnicería y Fiambrería) hasta cámara de inspección.\nQuedando cañerías de desagüe limpias sin problemas de rebalse.';

const fallos = [];
const chequear = (ok, d) => { if (!ok) fallos.push('  ✗ ' + d); };

// El sello de formato de las cotizaciones de prueba es EL VIGENTE de la version que se prueba.
// Estaba fijo en 4, y el 19-09-2026 (4a359f9) `_PDF_COT_FORMATO` subio a 5: "Ver PDF" intentaba
// regenerar la CT (la subida esta bloqueada), un cuadro de error tapaba la lista y el guion moria
// en el segundo click — contra main tambien. Medido 24-09-2026. Se lee del mismo archivo que se sirve.
const FORMATO = Number((require('fs').readFileSync(require('path').join(__dirname, 'sitio', ARCHIVO), 'utf8')
  .match(/var _PDF_COT_FORMATO = (\d+)/) || [])[1]) || 0;
chequear(FORMATO > 0, 'no se encontro _PDF_COT_FORMATO en sitio/' + ARCHIVO);
const log = (...a) => console.log(...a);

// HEAD publico a Cloudinary (no sube nada ni gasta cuota): lo que decide si el navegador MUESTRA el
// PDF o lo descarga es el Content-Disposition.
const { execFileSync } = require('child_process');
function head(url) {
  let cab = '';
  try { cab = execFileSync('curl', ['-s', '-I', '--max-time', '25', url], { encoding: 'utf8' }); }
  catch (e) { cab = String(e.stdout || ''); }
  const bloques = cab.split(/\r?\n\r?\n/).filter(b => /^HTTP\//.test(b));
  const ult = bloques[bloques.length - 1] || '';
  const h = n => ((ult.match(new RegExp('^' + n + ':\\s*(.*)$', 'mi')) || [])[1] || '').trim();
  return { code: (ult.match(/^HTTP\/\S+\s+(\d+)/) || [])[1] || '', tipo: h('content-type'), disp: h('content-disposition') };
}
function sufijo(u) {
  const m = String(u || '').match(/\/files\/.*\/([^/?#]+)$/);
  try { return m ? decodeURIComponent(m[1]) : null; } catch (e) { return null; }
}
// La URL que entrega la app tiene que ser la VISTA: /files/ con el nombre de SMU, y Cloudinary la
// sirve sin attachment.
function medirVista(etq, url, nombre) {
  const h = url ? head(url) : {};
  const ok = !!url && /^https:\/\/res\.cloudinary\.com\/dcrf29tna\/files\//.test(url) && !/fl_attachment/.test(url) &&
    sufijo(url) === nombre && h.code === '200' && /^application\/pdf/i.test(h.tipo || '') && !/attachment/i.test(h.disp || '');
  chequear(ok, etq + ': entrego "' + url + '" -> HTTP ' + h.code + ' ' + (h.tipo || '') + ' disp="' + (h.disp || '') +
    '" (esperado la vista /files/ con "' + nombre + '" y sin attachment)');
  log(etq + ': ' + (ok ? 'VISTA, HTTP 200 ' + h.tipo + ' sin attachment · ' + nombre + ' ✓'
                       : 'NO es la vista ✗\n     ' + url + '\n     HTTP ' + h.code + ' disp="' + (h.disp || '') + '"'));
  return ok;
}

(async () => {
  // El bloqueador de ventanas ENCENDIDO (ver la cabecera): Playwright lo apaga por defecto.
  const browser = await chromium.launch({ channel: 'chromium', ignoreDefaultArgs: ['--disable-popup-blocking'] });
  const ctx = await browser.newContext(Object.assign({}, devices['Pixel 7'], { acceptDownloads: true }));
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message.slice(0, 140)));
  page.on('console', m => { if (m.type() === 'error') log('   navegador: ' + m.text().slice(0, 160)); });

  // Las SUBIDAS nunca salen. Solo en el paso 8a se responde aca mismo, con la URL de un PDF que ya
  // existe, para que la regeneracion termine; nada llega a Cloudinary.
  let subida = 'bloqueada';
  let demoraSubida = 0;   // 8a: mas que el toque, para que el bloqueador real corte lo que se abra despues
  const subidas = [];
  await page.route('**api.cloudinary.com/**', async r => {
    subidas.push(Date.now());
    if (subida === 'simulada') {
      if (demoraSubida) await new Promise(ok => setTimeout(ok, demoraSubida));
      return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ secure_url: CT_15092601 }) });
    }
    return r.abort('internetdisconnected');
  });

  await page.addInitScript(({ hash, ct1, ct2, previa, hs, hsPrev, desc, formato }) => {
    // Menu del sistema ESPIADO: registra lo que la app entrega y no abre nada. Sin `canShare`, la
    // app comparte el ENLACE (no adjunta los bytes), que es lo que cambio el 24-09-2026.
    // `__SIN_SHARE = true` simula un PC sin menu del sistema: la app abre su menu propio.
    window.__SHARES = [];
    window.__SIN_SHARE = false;
    // Paso 8: el ORDEN real, medido dentro de la pagina, entre el window.open y la subida. Envolturas
    // transparentes: llaman al original en la misma pila, asi que el toque sigue siendo el mismo.
    window.__ORDEN = [];
    // Paso 9: `__IOS_APP = true` emula la app instalada de iPhone, con lo documentado (web.dev,
    // "Window management"): `navigator.standalone` es true y window.open devuelve null sin abrir nada.
    window.__IOS_APP = false;
    try {
      Object.defineProperty(Navigator.prototype, 'standalone', { configurable: true, get() { return window.__IOS_APP ? true : undefined; } });
    } catch (e) {}
    const _openReal = window.open, _fetchReal = window.fetch;
    window.open = function (u) {
      if (window.__IOS_APP) {
        window.__ORDEN.push({ que: 'open', u: String(u || ''), abrio: false, ios: true, t: performance.now() });
        return null;
      }
      const w = _openReal.apply(this, arguments);
      window.__ORDEN.push({ que: 'open', u: String(u || ''), abrio: !!w, t: performance.now() });
      return w;
    };
    window.fetch = function (u) {
      try { if (/api\.cloudinary\.com/.test(String((u && u.url) || u))) window.__ORDEN.push({ que: 'subida', t: performance.now() }); } catch (e) {}
      return _fetchReal.apply(this, arguments);
    };
    try {
      Object.defineProperty(Navigator.prototype, 'share', { configurable: true, get() {
        if (window.__SIN_SHARE) return undefined;
        return function (d) {
          d = d || {};
          window.__SHARES.push({ title: d.title || '', text: d.text || '', url: d.url || '',
            files: Array.from(d.files || []).map(f => ({ name: f.name, type: f.type })) });
          return Promise.resolve();
        };
      } });
      Object.defineProperty(Navigator.prototype, 'canShare', { configurable: true, get() { return undefined; } });
    } catch (e) {}
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
          pdfUrlCloudinary: hs, pdfUrl: 'https://desarrollobastian-design.github.io/emval-app/?pdf=sBE6AgdWrO9XFi9r1q42' },
        // Hoja preventiva con su PDF real: la de "Ver PDF" / "Compartir" de Preventivos.
        { _id: 'ot_prev_yrh74lk', numero: 247863, local: 'UNIMARC GOMEZ CARRENO', ceco: '', tipo: 'preventivo',
          tecnico: 'Lucas Fernández', fecha: '15-09-2026', descripcionTrabajo: 'MP Transpaletas', firmada: true,
          estado: 'Terminada', pdfUrlCloudinary: hsPrev, pdfUrl: 'https://desarrollobastian-design.github.io/emval-app/?pdf=prevArnes247863' }
      ],
      cotizaciones: [
        // El caso: centro VACIO, como esta en Firestore.
        { _id: 'cot1', numeroCotizacion: '15092601', otNumero: 796863, otId: 'ot_mu1by0re_qp9imoz',
          local: 'S10 Concepcion', localCorto: 'S10 Concepcion', centro: '',
          nombreServicio: 'Destape piletas y camara', descripcionTrabajo: desc,
          carpeta: 'PRUEBA ARNES', enviado: false, total: 130000, fecha: '15-09-2026',
          pdfUrl: ct1, pdfGeneradoEn: 4102444800000, pdfFormato: formato, items: [] },
        // Coma en el servicio: la unica CT de produccion que armaba un enlace roto.
        { _id: 'cot2', numeroCotizacion: '01082617', otNumero: '', local: 'UNIMARC GOMEZ CARRENO', centro: '713',
          nombreServicio: 'Cambio ubicacion termo, retiro termo malo', descripcionTrabajo: 'Cambio ubicacion termo, retiro termo malo',
          carpeta: 'PRUEBA ARNES', enviado: false, total: 90000, fecha: '02-08-2026',
          pdfUrl: ct2, pdfGeneradoEn: 4102444800000, pdfFormato: formato, items: [] },
        // PREVIA: sin OT.
        { _id: 'cot3', numeroCotizacion: '01082605', otNumero: '', tipoCot: 'previa',
          estadoCot: 'Pendiente', local: 'S10 Chillan 2', localCorto: 'Chillan 2', centro: '907',
          nombreServicio: 'Cambio de lamas', descripcionTrabajo: 'Cambio de lamas',
          carpeta: 'PRUEBA ARNES', enviado: false, total: 90000, fecha: '02-08-2026',
          pdfUrl: previa, pdfGeneradoEn: 4102444800000, pdfFormato: formato, items: [] },
        // Paso 8: dibujadas por una version anterior (formato - 1): "Ver PDF" las REGENERA.
        { _id: 'cot4', numeroCotizacion: '15092602', otNumero: '', local: 'S10 Concepcion', localCorto: 'S10 Concepcion', centro: '',
          nombreServicio: 'Destape piletas y camara', descripcionTrabajo: 'Destape piletas y camara',
          carpeta: 'PRUEBA ARNES', enviado: false, total: 130000, fecha: '15-09-2026',
          pdfUrl: ct1, pdfGeneradoEn: 4102444800000, pdfFormato: formato - 1, items: [] },
        { _id: 'cot5', numeroCotizacion: '15092603', otNumero: '', local: 'S10 Concepcion', localCorto: 'S10 Concepcion', centro: '',
          nombreServicio: 'Destape piletas y camara', descripcionTrabajo: 'Destape piletas y camara',
          carpeta: 'PRUEBA ARNES', enviado: false, total: 130000, fecha: '15-09-2026',
          pdfUrl: ct1, pdfGeneradoEn: 4102444800000, pdfFormato: formato - 1, items: [] },
        // Paso 9b: la app de iPhone, tambien una que hay que regenerar.
        { _id: 'cot6', numeroCotizacion: '15092604', otNumero: '', local: 'S10 Concepcion', localCorto: 'S10 Concepcion', centro: '',
          nombreServicio: 'Destape piletas y camara', descripcionTrabajo: 'Destape piletas y camara',
          carpeta: 'PRUEBA ARNES', enviado: false, total: 130000, fecha: '15-09-2026',
          pdfUrl: ct1, pdfGeneradoEn: 4102444800000, pdfFormato: formato - 1, items: [] }
      ]
    };
    let real = null;
    Object.defineProperty(window, '__SEMILLA', {
      configurable: true,
      get() { return real; },
      set(v) { real = Object.assign(v || {}, window.__EXTRA); }
    });
  }, { hash: HASH_PEDRO123, ct1: CT_15092601, ct2: CT_01082617, previa: PDF_PREVIA, hs: HS_796863, hsPrev: HS_247863, desc: DESC_796863, formato: FORMATO });

  const descargas = [];
  const escuchar = p => p.on('download', d => descargas.push(d.suggestedFilename()));
  escuchar(page);
  ctx.on('page', escuchar);
  const navegaciones = [];
  const navPaginas = [];   // la pestana que hizo cada navegacion de `navegaciones`
  ctx.on('request', r => {
    if (r.isNavigationRequest() && /res\.cloudinary\.com/.test(r.url())) {
      let p = null, hijo = false;
      try { const f = r.frame(); p = f.page(); hijo = !!f.parentFrame(); } catch (e) {}
      // El visor de PDF del Chromium completo vuelve a pedir el archivo desde un marco hijo de la
      // MISMA pestana (medido el 25-09-2026): no es otra apertura y no se cuenta.
      if (hijo) return;
      navegaciones.push(r.url());
      navPaginas.push(p);
    }
  });
  // Cada pestana nueva y cuando se abrio (paso 8: tiene que ser ANTES de la subida).
  const pestanas = [];
  ctx.on('page', p => pestanas.push({ p, t: Date.now() }));

  log('\n══ ' + ARCHIVO + ' · la CT (vista) y la HS (descarga) por el administrador ══');
  await page.goto(BASE + ARCHIVO);
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

  // ── Lo que cambio el 24 y el 25-09-2026: Compartir y los "Ver PDF" abren la VISTA ─────────────
  // Abre algo con un click y mide la pestana que se abrio: su URL, su HEAD y, si Chromium headless
  // la guarda (no trae visor de PDF), el nombre sugerido. Devuelve la URL que se abrio.
  const abrirYMedir = async (etq, click, nombre) => {
    const n0 = navegaciones.length, d0 = descargas.length;
    await click();
    const t0 = Date.now();
    while (navegaciones.length === n0 && Date.now() - t0 < 15000) await page.waitForTimeout(250);
    await page.waitForTimeout(3000);
    medirVista(etq, navegaciones[n0] || '', nombre);
    const bajo = descargas.slice(d0);
    if (bajo.length) {
      chequear(bajo.every(n => n === nombre), etq + ': el nombre sugerido al guardarlo no es el de SMU: ' + bajo.join(', '));
      log('     nombre sugerido al guardarlo: ' + bajo.join(', ') + (bajo.every(n => n === nombre) ? ' ✓' : ' ✗'));
    }
    for (const p of ctx.pages()) if (p !== page) await p.close().catch(() => {});
    return navegaciones[n0] || '';
  };
  // Compartir con el menu del sistema espiado: lo que recibe la otra persona.
  const compartirYMedir = async (etq, click) => {
    const s0 = await page.evaluate(() => window.__SHARES.length);
    await click();
    const t0 = Date.now();
    let d = null;
    while (!d && Date.now() - t0 < 20000) {
      d = await page.evaluate(n => window.__SHARES[n] || null, s0);
      if (!d) await page.waitForTimeout(250);
    }
    chequear(!!d, etq + ': la app no llamo al menu de compartir');
    return d || { text: '', url: '', files: [] };
  };
  const hayModal = () => page.evaluate(() => { const m = document.getElementById('modal-compartir'); return !!m && getComputedStyle(m).display !== 'none'; });
  // El "Ver PDF" de una cotizacion de la lista, por su folio.
  const verPDFCot = folio => page.locator('div').filter({ hasText: folio })
    .filter({ has: page.locator('button', { hasText: /^Ver PDF$/ }) }).last()
    .locator('button', { hasText: /^Ver PDF$/ }).first();

  // ── 3. "Ver PDF" en cada cotización: abre la VISTA (decision de Bastian del 25-09-2026) ─────────
  const CTS = [
    ['3a) CT del caso', '15092601', 'CT - 15092601 - ceco 3164 - Destape piletas y camara.pdf'],
    ['3b) CT con coma', '01082617', 'CT - 01082617 - ceco 0713 - Cambio ubicacion termo retiro termo malo.pdf'],
    ['3c) CT previa', '01082605', 'CT - 01082605 - ceco 0907 - Cambio de lamas.pdf']
  ];
  const vistasCT = {};
  for (const [etq, folio, nombre] of CTS) {
    vistasCT[folio] = await abrirYMedir(etq + ' · Ver PDF', () => verPDFCot(folio).click(), nombre);
  }
  // La previa no tiene HS: su nombre no puede traer un N° de HS/OT.
  const previa = sufijo(vistasCT['01082605']) || '';
  chequear(/^CT - 01082605/.test(previa) && !/\bHS\b/.test(previa) && !/\b\d{6}\b/.test(previa.replace(/^CT - 01082605/, '')),
    '3c) la previa trae un N° de HS/OT en el nombre (o no se abrio): "' + previa + '"');

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

  // Guarda las descargas hasta el paso 4 (la HS) antes de que los pasos siguientes agreguen las suyas.
  const descargasCTHS = descargas.slice();

  // ── 5. Compartir la cotizacion 15092601: CT y HS, las dos en vista ─────────────────────────────
  {
    const tarjeta = page.locator('div').filter({ hasText: '15092601' })
      .filter({ has: page.locator('button', { hasText: /^Compartir$/ }) }).last();
    const d = await compartirYMedir('5) Compartir cotizacion', () => tarjeta.locator('button', { hasText: /^Compartir$/ }).first().click());
    const urls = String(d.text || '').match(/https:\/\/res\.cloudinary\.com\/\S+/g) || [];
    log('5) Compartir la cotizacion 15092601 (CT + HS): ' + urls.length + ' enlaces en el texto');
    chequear(urls.length === 2 && !d.url, '5) Compartir cotizacion: se esperaban 2 enlaces en el texto y sin url suelta: ' + JSON.stringify(d));
    medirVista('5a) CT compartida', urls.find(u => /cotizaciones/.test(u)) || '', NOMBRE_CT);
    medirVista('5b) HS compartida', urls.find(u => /\/pdfs\//.test(u)) || '', NOMBRE_HS);
  }

  // ── 6. Preventivos: Ver PDF y Compartir ──────────────────────────────────────────────────────
  await page.evaluate(() => go('s-supervisor'));
  await page.waitForTimeout(500);
  await page.locator('#s-supervisor button', { hasText: /^Ver OTs$/ }).first().click();
  await page.waitForTimeout(1500);
  await page.locator('#s-ots-tecnicos', { hasText: 'Ver todos los trabajos preventivos' }).locator('text=Ver todos los trabajos preventivos').click();
  await page.waitForTimeout(2000);
  await page.locator('#lista-preventivos .prev-mes-folder', { hasText: 'Septiembre 2026' }).locator('text=Septiembre 2026').first().click();
  await page.waitForTimeout(500);
  {
    const hoja = page.locator('#lista-preventivos .prev-hoja-row', { hasText: '247863' });
    chequear(await hoja.count() === 1, '6) no aparecio la hoja 247863 en Preventivos');
    await abrirYMedir('6a) Preventivos · Ver PDF', () => hoja.locator('button', { hasText: /^Ver PDF$/ }).click(), NOMBRE_HS_PREV);
    const d = await compartirYMedir('6b) Preventivos · Compartir', () => hoja.locator('button', { hasText: /^Compartir$/ }).click());
    medirVista('6b) Preventivos · Compartir', d.url, NOMBRE_HS_PREV);
  }

  // ── 7. Ver OTs por tecnico: Ver PDF, Compartir y "Abrir el PDF" del menu propio ────────────────
  await page.evaluate(() => go('s-supervisor'));
  await page.waitForTimeout(500);
  await page.locator('#s-supervisor button', { hasText: /^Ver OTs$/ }).first().click();
  await page.waitForTimeout(1500);
  await page.locator('#correctivos-card').click();
  await page.waitForTimeout(500);
  await page.locator('#lista-tecnicos-ots .usuario-item', { hasText: 'Lucas' }).first().click();
  await page.waitForTimeout(2500);
  const cotizadas = page.locator('#lista-ots-tecnico-detalle', { hasText: 'Ya cotizadas' }).locator('text=/^Ya cotizadas/');
  if (await cotizadas.count()) { await cotizadas.first().click(); await page.waitForTimeout(500); }
  {
    const tarjeta = page.locator('#lista-ots-tecnico-detalle .card', { hasText: 'S10 Concepcion' })
      .filter({ has: page.locator('button', { hasText: /^Ver PDF$/ }) }).last();
    chequear(await tarjeta.count() === 1, '7) no aparecio la OT 796863 en Ver OTs por tecnico');
    await abrirYMedir('7a) Ver OTs por tecnico · Ver PDF', () => tarjeta.locator('button', { hasText: /^Ver PDF$/ }).first().click(), NOMBRE_HS);
    const d = await compartirYMedir('7b) Ver OTs por tecnico · Compartir', () => tarjeta.locator('button', { hasText: /^Compartir$/ }).first().click());
    medirVista('7b) Ver OTs por tecnico · Compartir', d.url, NOMBRE_HS);
    // Sin menu del sistema (PC): el menu propio, y su "Abrir el PDF".
    await page.evaluate(() => { window.__SIN_SHARE = true; });
    await tarjeta.locator('button', { hasText: /^Compartir$/ }).first().click();
    await page.waitForTimeout(1500);
    const modal = await hayModal();
    chequear(modal, '7c) sin menu del sistema no se abrio el menu propio de Compartir');
    if (modal) await abrirYMedir('7c) Menu propio · Abrir el PDF', () => page.locator('#modal-compartir-abrir').click(), NOMBRE_HS);
  }

  // ── 8. "Ver PDF" de una CT que hay que REGENERAR: la pestana se abre en el mismo toque ─────────
  // Regenerar sube un PDF y tarda: un window.open despues de ese await ya no cuenta como toque. La
  // app abre la pestana ANTES de subir y le asigna la URL al terminar. La subida no sale: 8a la
  // responde `page.route` con la URL de la CT 15092601 (existe), 8b la corta.
  await page.evaluate(() => go('s-supervisor'));
  await page.waitForTimeout(500);
  await page.locator('button', { hasText: /^Cotizaciones$/ }).first().click();
  await page.waitForTimeout(2000);
  if (!(await verPDFCot('15092602').isVisible().catch(() => false))) {
    const carpeta8 = page.locator('text=PRUEBA ARNES').first();
    if (await carpeta8.count()) { await carpeta8.click(); await page.waitForTimeout(1200); }
  }
  const dialogoVisible = () => page.evaluate(() => { const o = document.getElementById('dlg-overlay'); return !!o && !o.hidden; });
  {
    // 8a. La subida responde, 6,5 s despues: la MISMA pestana del toque termina en la vista. Con el
    //     bloqueador real, una pestana abierta despues de la subida no se abriria.
    const NOMBRE_8A = 'CT - 15092602 - ceco 3164 - Destape piletas y camara.pdf';
    subida = 'simulada';
    demoraSubida = 6500;
    const o0 = await page.evaluate(() => window.__ORDEN.length);
    const s0 = subidas.length, p0 = pestanas.length, n0 = navegaciones.length, d0 = descargas.length;
    await verPDFCot('15092602').click();
    const t0 = Date.now();
    while (navegaciones.length === n0 && Date.now() - t0 < 30000) await page.waitForTimeout(250);
    await page.waitForTimeout(3000);
    subida = 'bloqueada';
    demoraSubida = 0;
    const nuevas = pestanas.slice(p0), sub = subidas.slice(s0);
    const orden = await page.evaluate(n => window.__ORDEN.slice(n), o0);
    const iOpen = orden.findIndex(x => x.que === 'open'), iSub = orden.findIndex(x => x.que === 'subida');
    const ms = iOpen !== -1 && iSub !== -1 ? Math.round(orden[iSub].t - orden[iOpen].t) : null;
    const antes = nuevas.length === 1 && sub.length === 1 && iOpen !== -1 && iSub !== -1 && iOpen < iSub &&
      orden.filter(x => x.que === 'open').length === 1;
    chequear(antes, '8a) CT regenerada: se esperaba UN window.open, antes de la subida, y una sola pestana; orden ' +
      JSON.stringify(orden) + ', pestanas ' + nuevas.length + ', subidas ' + sub.length);
    log('8a) CT regenerada: ' + (antes ? 'la pestana se abrio en el toque, ' + ms + ' ms ANTES de la subida ✓'
                                       : 'la pestana NO se abrio en el toque ✗ ' + JSON.stringify(orden)));
    const misma = nuevas.length === 1 && navPaginas[n0] === nuevas[0].p;
    chequear(misma, '8a) CT regenerada: la vista no se cargo en la pestana del toque');
    medirVista('8a) CT regenerada · Ver PDF', navegaciones[n0] || '', NOMBRE_8A);
    const bajo = descargas.slice(d0);
    if (bajo.length) {
      chequear(bajo.every(n => n === NOMBRE_8A), '8a) el nombre sugerido al guardarlo no es el de la CT: ' + bajo.join(', '));
      log('     nombre sugerido al guardarlo: ' + bajo.join(', ') + (bajo.every(n => n === NOMBRE_8A) ? ' ✓' : ' ✗'));
    }
    chequear(!(await dialogoVisible()), '8a) aparecio un cuadro de aviso con la regeneracion exitosa');
    // Si aparecio (p. ej. el bloqueador corto la pestana), se cierra sin tocar su boton: tocarlo seria
    // un toque nuevo que abre el PDF, y el cuadro abierto taparia el paso 8b.
    if (await dialogoVisible()) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
    for (const p of ctx.pages()) if (p !== page) await p.close().catch(() => {});
  }
  {
    // 8b. La subida falla: la pestana del toque se cierra y la app avisa, como siempre.
    const o0 = await page.evaluate(() => window.__ORDEN.length);
    const s0 = subidas.length, p0 = pestanas.length, n0 = navegaciones.length;
    await verPDFCot('15092603').click();
    const t0 = Date.now();
    while (!(await dialogoVisible()) && Date.now() - t0 < 30000) await page.waitForTimeout(250);
    await page.waitForTimeout(500);
    const nuevas = pestanas.slice(p0), sub = subidas.slice(s0);
    const orden = await page.evaluate(n => window.__ORDEN.slice(n), o0);
    const iOpen = orden.findIndex(x => x.que === 'open'), iSub = orden.findIndex(x => x.que === 'subida');
    const aviso = (await dialogoVisible()) ? String(await page.locator('#dlg-msg').textContent()) : '';
    const cerrada = nuevas.length === 1 && nuevas[0].p.isClosed() && sub.length >= 1 && iOpen !== -1 && iSub !== -1 && iOpen < iSub &&
      orden.filter(x => x.que === 'open').length === 1;
    chequear(cerrada, '8b) subida fallida: se esperaba UN window.open antes de la subida y esa pestana cerrada despues; orden ' +
      JSON.stringify(orden) + ', pestanas ' + nuevas.length + ', cerrada ' + (nuevas[0] ? nuevas[0].p.isClosed() : '-') + ', subidas ' + sub.length);
    chequear(navegaciones.length === n0, '8b) subida fallida: algo navego a Cloudinary: ' + navegaciones.slice(n0).join(' | '));
    chequear(/No se pudo preparar el PDF separado/.test(aviso), '8b) subida fallida: no aparecio el aviso de siempre ("' + aviso + '")');
    log('8b) CT que no se pudo regenerar: ' + (cerrada && /No se pudo preparar/.test(aviso)
      ? 'la pestana del toque se cerro y la app aviso ✓' : 'pestana o aviso fuera de lo esperado ✗'));
    if (await dialogoVisible()) await page.locator('#dlg-ok').click();
    for (const p of ctx.pages()) if (p !== page) await p.close().catch(() => {});
  }

  // ── 9. La app instalada de iPhone, EMULADA: window.open no abre nada ahi ─────────────────────
  // `__IOS_APP` enciende `navigator.standalone` y deja window.open devolviendo null sin abrir nada,
  // que es lo documentado (web.dev, "Window management"). La app tiene que abrir la vista por un
  // enlace target _blank, dentro de un toque.
  await page.evaluate(() => { window.__IOS_APP = true; });
  {
    // 9a. CT vigente: el enlace se abre en el mismo toque, sin aviso de bloqueo falso.
    const o0 = await page.evaluate(() => window.__ORDEN.length);
    const p0 = pestanas.length;
    const url = await abrirYMedir('9a) App de iPhone · Ver PDF de la CT vigente', () => verPDFCot('15092601').click(), NOMBRE_CT);
    const orden = await page.evaluate(n => window.__ORDEN.slice(n), o0);
    const ok = !!url && pestanas.length - p0 === 1 && !orden.some(x => x.que === 'open' && x.abrio) && !(await dialogoVisible());
    chequear(ok, '9a) app de iPhone, CT vigente: se esperaba una pestana por enlace, sin window.open que abra y sin aviso; orden ' +
      JSON.stringify(orden) + ', pestanas ' + (pestanas.length - p0));
    log('9a) App de iPhone, CT vigente: ' + (ok ? 'abrio la vista por enlace, sin aviso ✓' : 'fuera de lo esperado ✗'));
    if (await dialogoVisible()) await page.locator('#dlg-ok').click();
  }
  {
    // 9b. CT que hay que regenerar: nada se abre hasta el toque en "Abrir el PDF" del aviso.
    const NOMBRE_9B = 'CT - 15092604 - ceco 3164 - Destape piletas y camara.pdf';
    subida = 'simulada';
    const p0 = pestanas.length, n0 = navegaciones.length;
    await verPDFCot('15092604').click();
    const t0 = Date.now();
    while (!(await dialogoVisible()) && Date.now() - t0 < 30000) await page.waitForTimeout(250);
    subida = 'bloqueada';
    const aviso = (await dialogoVisible()) ? String(await page.locator('#dlg-msg').textContent()) : '';
    const boton = (await dialogoVisible()) ? String(await page.locator('#dlg-ok').textContent()) : '';
    const antesDelToque = pestanas.length - p0;
    chequear(/PDF está listo/.test(aviso) && boton === 'Abrir el PDF' && antesDelToque === 0,
      '9b) app de iPhone, CT regenerada: se esperaba el aviso "PDF listo" con "Abrir el PDF" y ninguna pestana antes del toque; aviso "' +
      aviso + '", boton "' + boton + '", pestanas ' + antesDelToque);
    let url = '';
    if (await dialogoVisible()) {
      url = await abrirYMedir('9b) App de iPhone · "Abrir el PDF" tras regenerar', () => page.locator('#dlg-ok').click(), NOMBRE_9B);
    }
    // Una sola navegacion a Cloudinary en todo el paso, y es la del toque.
    const navs = navegaciones.slice(n0);
    const ok = /PDF está listo/.test(aviso) && antesDelToque === 0 && !!url && navs.length === 1 && navs[0] === url;
    chequear(ok, '9b) app de iPhone, CT regenerada: se esperaba UNA navegacion a Cloudinary y solo tras el toque: ' + JSON.stringify(navs));
    log('9b) App de iPhone, CT regenerada: ' + (ok ? 'aviso "PDF listo" y la vista solo con su toque ✓' : 'fuera de lo esperado ✗ ' + JSON.stringify(navs)));
  }
  await page.evaluate(() => { window.__IOS_APP = false; });

  log('\nArchivos que descargó el navegador:');
  descargas.forEach(n => log('   · ' + n));

  // La CT ya no se descarga (paso 3, vista desde el 25-09-2026): lo unico que tiene que llegar como
  // descarga es la HS del "Descargar HS".
  const esperados = [
    ['4)  HS del caso', 'HS - 796863 - CT 15092601 - ceco 3164 - Destape piletas y camara.pdf']
  ];
  log('');
  esperados.forEach(([etq, nombre]) => {
    const ok = descargasCTHS.indexOf(nombre) >= 0;
    chequear(ok, etq + ': no llegó "' + nombre + '"');
    log(etq + ': ' + (ok ? nombre + ' ✓' : 'no llegó "' + nombre + '" ✗'));
  });
  chequear(!descargas.some(n => /\bCOT\b|SIN-CECO/.test(n)), 'alguna descarga salió con "COT" o "SIN-CECO"');

  if (errores.length) log('\nErrores de JS en la página: ' + errores.join(' | '));
  chequear(errores.length === 0, 'la página lanzó errores de JS: ' + errores.join(' | '));

  await browser.close();

  log('');
  if (fallos.length) { console.error('FALLOS:\n' + fallos.join('\n')); process.exit(1); }
  log('OK — la HS se descarga con el nombre que exige SMU; el "Ver PDF" de Cotizaciones (tambien regenerando, con el bloqueador real y en la app de iPhone emulada), Compartir y los "Ver PDF" de Preventivos y Ver OTs abren la vista con ese mismo nombre.');
})();
