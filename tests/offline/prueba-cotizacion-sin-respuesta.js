/* Prueba de flujo real — guardar una cotizacion desde el detalle de un tecnico con mala señal.

   Caso real, 06-11-2026, 12:09: Pedro guardo una cotizacion y leyo "Sin respuesta del servidor",
   con el formulario abierto. Despues de guardar, `guardarCotizacion` volvia a bajar la coleccion
   `ordenes` ENTERA con tope de 25 s para repintar la lista del tecnico; con datos moviles el tope
   se pasa. tests/cotizacion-guardada-no-dice-sin-respuesta.js lo mide con la funcion suelta; este
   guion lo corre en la app entera, por la interfaz, en un telefono emulado:

     Pedro entra → Ver OTs → Correctivos → el tecnico → "+ Cotización" → llena un item → Guardar,
     con `ordenes` colgada desde que se abre el formulario (la promesa no resuelve nunca, como el SDK).

   Se mide, a los 30 s (el tope real es de 25 s):
     1. linea de control: el formulario se abrio y Guardar corrio (hubo un add en `cotizaciones`);
     2. hay UNA cotizacion en la nube, con el item y el total;
     3. ningun mensaje dice "Sin respuesta del servidor";
     4. la pantalla volvio al detalle del tecnico (no quedo el formulario abierto);
     5. en ese detalle la OT ya figura cotizada (sin "+ Cotización").

   Firestore es la nube falsa de nube-compartida.js y Cloudinary se corta: no toca produccion.
   Datos de prueba, ninguno del cliente.

   Uso:
     export NODE_PATH="C:/Users/corex/AppData/Roaming/npm/node_modules"
     node tests/offline/preparar.js 7680ada          # index.html (rama) y prefix.html (main del 06-11)
     node tests/offline/prueba-cotizacion-sin-respuesta.js index.html
     node tests/offline/prueba-cotizacion-sin-respuesta.js prefix.html   # CONTRAPRUEBA: debe fallar */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { crearNube, STUB_NUBE } = require('./nube-compartida');

const ARCHIVO = process.argv[2] || 'index.html';
const SITIO = path.join(__dirname, 'sitio');
const PUERTO = 8793;
const fallos = [];
const P = (...a) => console.log(...a);
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); return !!ok; }

const CLAVE_PRUEBA = 'clave-solo-de-prueba';   // no es la de nadie: el arnes siembra su hash
const HASH_PEDRO = require('crypto').createHash('sha256').update(CLAVE_PRUEBA).digest('hex');
const TEC = 'Tecnico Prueba';

const nube = crearNube({
  tecnicos: [
    { _id: 'u_pedro', nombre: 'Pedro Arce', cargo: 'Administrador', letra: 'P', passwordHash: HASH_PEDRO },
    { _id: 'u_tec', nombre: TEC, cargo: 'Tecnico en terreno', pin: '2222', letra: 'T' }
  ],
  cadenas: [
    { _id: 'c1', nombre: 'UNIMARC', color: '#DC2626', logo: '', letra: 'U', orden: 0,
      sucursales: [{ nombre: 'UNIMARC PRUEBA', centro: '999' }] }
  ],
  ordenes: [
    { _id: 'ot_corr', numero: 900900, local: 'UNIMARC PRUEBA', cadena: 'UNIMARC', tecnico: TEC,
      tipo: 'correctivo', fecha: '05-11-2026', firmada: true, estado: 'Terminada',
      descripcionTrabajo: 'Trabajo de prueba', creadoEn: { __ts: Date.now() - 86400000 } }
  ],
  pdfs: [],
  cotizaciones: []
});

const TIPOS = { '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.js': 'application/javascript' };
function servir() {
  return new Promise(function (ok) {
    const s = http.createServer(function (req, res) {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
      const f = path.join(SITIO, rel);
      if (!f.startsWith(SITIO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' });
      res.end(fs.readFileSync(f));
    });
    s.listen(PUERTO, function () { ok(s); });
  });
}

(async () => {
  const server = await servir();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
  await nube.conectar(ctx);
  await ctx.route('**/api.cloudinary.com/**', r => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', e => P('  [error en el telefono]', String(e).slice(0, 200)));

  try {
    await page.goto('http://127.0.0.1:' + PUERTO + '/' + ARCHIVO);
    await page.waitForTimeout(600);
    await page.evaluate(STUB_NUBE);
    await page.evaluate(() => {
      cargarUsuariosApp(); cargarCadenasApp();
      // Todo mensaje en pantalla queda anotado: el toast se pisa y a los 30 s ya no se ve.
      window.__toasts = [];
      const t0 = window.toast;
      window.toast = function (m) { window.__toasts.push(String(m)); return t0.apply(this, arguments); };
    });
    await page.waitForTimeout(700);

    await page.click('text=Pedro Arce');
    await page.waitForTimeout(400);
    await page.fill('#admin-pass-input', CLAVE_PRUEBA);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);

    // Ver OTs → (Correctivos) → el tecnico → "+ Cotización"
    await page.click('button[onclick*="cargarOTsTecnicos"]');
    await page.waitForTimeout(900);
    await page.click('#correctivos-card');
    await page.waitForTimeout(400);
    await page.locator('#lista-tecnicos-ots >> text=' + TEC).first().click();
    await page.waitForTimeout(900);
    await page.locator('#lista-ots-tecnico-detalle button', { hasText: '+ Cotización' }).first().click();
    await page.waitForTimeout(900);
    const enForm = await page.evaluate(() => (document.querySelector('.screen.active') || {}).id);

    // Desde aca `ordenes` no responde mas: get() de la coleccion entera se cuelga, como con datos moviles.
    await page.evaluate(() => {
      window.__ordenesColgadas = 0;
      const fsOrig = window.firebase.firestore;
      const envuelto = function () {
        const db = fsOrig.apply(this, arguments);
        const col0 = db.collection;
        return Object.assign({}, db, {
          collection: function (c) {
            const col = col0.call(db, c);
            if (c !== 'ordenes') return col;
            return Object.assign({}, col, { get: function () { window.__ordenesColgadas++; return new Promise(function () {}); } });
          }
        });
      };
      Object.keys(fsOrig).forEach(function (k) { envuelto[k] = fsOrig[k]; });
      window.firebase.firestore = envuelto;
    });

    await page.fill('[aria-label="Precio unitario del ítem 1"]', '75000');
    await page.fill('#cot-nombre-servicio', 'Servicio de prueba');
    await page.evaluate(() => document.getElementById('btn-guardar-cot').click());   // el boton vive en la vista previa
    P('… Guardar pulsado; espero 30 s (el tope real es de 25 s)');
    await page.waitForTimeout(30000);

    const r = await page.evaluate(() => ({
      pantalla: (document.querySelector('.screen.active') || {}).id,
      toasts: window.__toasts,
      colgadas: window.__ordenesColgadas,
      botonCotizar: [...document.querySelectorAll('#lista-ots-tecnico-detalle button')].some(b => b.textContent === '+ Cotización')
    }));
    const cots = nube.docs('cotizaciones');

    P('1) Formulario abierto (' + enForm + ') y guardado intentado: ' +
      (chequear(enForm === 's-cotizacion' && nube.log.some(e => e.op === 'add' && e.col === 'cotizaciones'),
        'LINEA DE CONTROL: no se llego a guardar (pantalla ' + enForm + ')') ? 'OK' : 'FALLA'));
    P('2) Una cotizacion en la nube: ' + cots.length + ' · ' +
      (chequear(cots.length === 1 && cots[0].datos.total === 75000, 'se esperaba 1 cotizacion de $75.000 y hay ' +
        JSON.stringify(cots.map(c => c.datos.total))) ? 'OK' : 'FALLA'));
    P('3) Mensajes: ' + JSON.stringify(r.toasts) + ' · ' +
      (chequear(!r.toasts.some(t => /Sin respuesta/.test(t)), 'con la cotizacion guardada salio "Sin respuesta del servidor"') ? 'OK' : 'FALLA'));
    P('4) Pantalla a los 30 s: ' + r.pantalla + ' (lecturas colgadas de ordenes: ' + r.colgadas + ') · ' +
      (chequear(r.pantalla === 's-ots-tecnico-detalle', 'el formulario quedo abierto: un segundo Guardar duplica la cotizacion') ? 'OK' : 'FALLA'));
    P('5) La OT figura cotizada en el detalle: ' +
      (chequear(r.pantalla === 's-ots-tecnico-detalle' && !r.botonCotizar, 'la OT sigue ofreciendo "+ Cotización"') ? 'OK' : 'FALLA'));
  } catch (e) {
    fallos.push('  ✗ el guion se cayo: ' + (e && e.message || e));
  } finally {
    await browser.close();
    server.close();
  }

  console.log('');
  if (fallos.length) { console.log('FALLA (' + fallos.length + '):\n' + fallos.join('\n')); process.exit(1); }
  console.log('Todo OK: 5 de 5');
  process.exit(0);
})();
