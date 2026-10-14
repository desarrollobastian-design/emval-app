/* Pedro ve los "Pendientes y materiales" de los preventivos y los descarga en Excel; el
   Supervisor no ve ninguna de las dos cosas.

   Caso del 13-10-2026 (audio de Pedro): "no sé dónde está esa planilla". El campo existía desde
   el 13-08 y el recuadro que lo muestra estaba en verOTsTecnico, que filtra los preventivos: Pedro
   nunca vio un pendiente. La prueba unitaria pasaba porque corría el bloque suelto. Esta entra por
   la interfaz, como Pedro, a "Trabajos Preventivos".

   Tramos:
     1. LINEA DE CONTROL: Pedro abre Trabajos Preventivos y ve las 3 hojas (no la del correctivo
        ni la de la cuenta de prueba).
     2. La carpeta de septiembre dice "1 con pendientes" y la tarjeta muestra el texto tal cual
        (con su "<", sin interpretarlo como HTML).   ← aca falla la version publicada (v70)
     3. El boton descarga un Excel con 1 fila: la nota de la cuenta de prueba, el correctivo y la
        nota en blanco no entran; el CECO es el de la sucursal; la primera fila dice "uso interno".
     4. El Supervisor entra a la misma pantalla: ni recuadro, ni boton, ni Excel.

   Usa la nube falsa de nube-compartida.js: el SDK de Firebase ni se carga.

   Uso:
     export NODE_PATH="C:/Users/corex/AppData/Roaming/npm/node_modules"
     node tests/offline/preparar.js origin/main
     cd tests/offline/sitio && python -m http.server 8765
     node tests/offline/prueba-pendientes-los-ve-pedro.js http://127.0.0.1:8765/index.html    # 0
     node tests/offline/prueba-pendientes-los-ve-pedro.js http://127.0.0.1:8765/prefix.html   # CONTRAPRUEBA: 1 */

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
const NOTA = 'Faltaron 2 neumáticos para la transpaleta N°2.\nComprar rueda <grande> para la próxima visita.';
const PDF = 'https://res.cloudinary.com/demo/raw/upload/emval/hojas/prueba.pdf';

const ot = (id, numero, local, fecha, extra) => Object.assign({
  _id: id, numero, local, cadena: 'UNIMARC', tecnico: LUCAS, tipo: 'preventivo', fecha,
  firmada: true, pausa: false, estado: 'Terminada', pdfUrlCloudinary: PDF,
  creadoEn: { __ts: AHORA - 86400000 }
}, extra || {});

const nube = crearNube({
  tecnicos: [
    { _id: 'u_pedro', nombre: 'Pedro Arce', cargo: 'Administrador', letra: 'P', passwordHash: HASH_PEDRO },
    { _id: 'u_lucas', nombre: LUCAS, cargo: 'Tecnico en terreno', pin: '2222', letra: 'L' },
    { _id: 'u_rosa', nombre: 'Rosa Pinto', cargo: 'Supervisor', pin: '4444', letra: 'R' }
  ],
  cadenas: [
    { _id: 'c1', nombre: 'SUPER 10', color: '#F59E0B', logo: '', letra: 'S', orden: 0,
      sucursales: [{ nombre: 'S10 Concepcion', centro: '3164' }, { nombre: 'S10 TOME', centro: '3170' }] },
    { _id: 'c2', nombre: 'UNIMARC', color: '#DC2626', logo: '', letra: 'U', orden: 1,
      sucursales: [{ nombre: 'UNIMARC PENCO', centro: '720' }, { nombre: 'UNIMARC YUMBEL', centro: '734' }] }
  ],
  ordenes: [
    ot('d_con', 501501, 'UNIMARC PENCO', '15-09-2026', { pendientesMateriales: NOTA }),
    ot('d_sin', 502502, 'UNIMARC YUMBEL', '16-09-2026'),
    ot('d_blanco', 505505, 'S10 Concepcion', '02-10-2026', { cadena: 'SUPER 10', pendientesMateriales: '   ' }),
    // No son hojas de preventivo de un tecnico real: no van en la pantalla ni en el Excel.
    ot('d_corr', 503503, 'S10 TOME', '17-09-2026', { cadena: 'SUPER 10', tipo: 'correctivo', pendientesMateriales: 'correctivo: no va' }),
    ot('d_prueba', 504504, 'S10 Concepcion', '18-09-2026', { cadena: 'SUPER 10', tecnico: 'Bastian Baeza', pendientesMateriales: 'cuenta de prueba: no va' })
  ],
  pdfs: [],
  cotizaciones: []
});

async function abrirApp(page) {
  await page.goto(URL);
  await page.waitForTimeout(600);
  await page.evaluate(STUB_NUBE);
  await page.evaluate(() => { cargarUsuariosApp(); cargarCadenasApp(); });
  await page.waitForTimeout(700);
  // Espia del Excel: deja que SheetJS arme el libro de verdad (si cargo) y en vez de bajar el
  // archivo guarda sus filas. Sin SheetJS (sin internet) un sustituto minimo guarda las filas igual.
  await page.evaluate(() => {
    window.__excel = [];
    if (typeof XLSX !== 'undefined') {
      XLSX.writeFile = function(wb, nombre) {
        const ws = wb.Sheets[wb.SheetNames[0]];
        window.__excel.push({ nombre, real: true, filtro: ws['!autofilter'] || null,
          filas: XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) });
      };
    } else {
      window.XLSX = {
        utils: {
          aoa_to_sheet: aoa => ({ aoa }), encode_range: () => 'A3', book_new: () => ({ hojas: [] }),
          book_append_sheet: (wb, ws) => wb.hojas.push(ws)
        },
        writeFile: (wb, nombre) => window.__excel.push({ nombre, real: false, filas: wb.hojas[0].aoa })
      };
    }
  });
}
// El camino de Pedro: panel → "Ver OTs" → "Trabajos Preventivos".
async function abrirPreventivos(page) {
  await page.click('button[onclick*="cargarOTsTecnicos"]');
  await page.waitForTimeout(800);
  await page.click('div[onclick*="cargarPreventivos"]');
  await page.waitForSelector('#lista-preventivos .prev-hoja-row', { state: 'attached', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);
}
const carpetas = page => page.$$eval('#lista-preventivos .prev-mes-folder', els => els.map(e => e.innerText.split('\n').slice(0, 2).join(' | ')));

(async () => {
  const browser = await chromium.launch();
  const telPedro = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
  const telRosa = await browser.newContext({ viewport: { width: 412, height: 915 } });
  for (const ctx of [telPedro, telRosa]) {
    await nube.conectar(ctx);
    await ctx.route('**/api.cloudinary.com/**', r => r.abort());
  }
  const pedro = await telPedro.newPage();
  const rosa = await telRosa.newPage();
  for (const [n, p] of [['Pedro', pedro], ['Rosa', rosa]]) {
    p.on('pageerror', e => P('  [error en el telefono de ' + n + ']', String(e).slice(0, 200)));
  }

  // 1. Linea de control
  await abrirApp(pedro);
  await pedro.click('text=Pedro Arce');
  await pedro.waitForTimeout(400);
  await pedro.fill('#admin-pass-input', 'Pedro123');
  await pedro.keyboard.press('Enter');
  await pedro.waitForTimeout(1200);
  await abrirPreventivos(pedro);
  const hojas = await pedro.$$eval('#lista-preventivos .prev-hoja-row', els => els.length);
  chequear(hojas === 3, 'LINEA DE CONTROL: Pedro deberia ver 3 hojas de preventivo y ve ' + hojas + ' — el guion no llega a la pantalla');
  P('1) Pedro abre Trabajos Preventivos: ' + hojas + ' hojas');

  // 2. La carpeta avisa y la tarjeta muestra la nota
  const cps = await carpetas(pedro);
  P('2) Carpetas: ' + cps.join('  ·  '));
  const sep = cps.find(c => /Septiembre 2026/.test(c)) || '';
  const oct = cps.find(c => /Octubre 2026/.test(c)) || '';
  chequear(/2 hojas · 1 con pendientes/.test(sep), 'la carpeta de septiembre no dice "2 hojas · 1 con pendientes": "' + sep + '"');
  chequear(/1 hoja/.test(oct) && !/con pendientes/.test(oct), 'la nota en blanco de octubre cuenta como pendiente: "' + oct + '"');
  await pedro.click('#lista-preventivos .prev-mes-folder:has-text("Septiembre 2026") >> div >> nth=0');
  await pedro.waitForTimeout(400);
  const recuadros = await pedro.$$eval('#lista-preventivos .pend-materiales-admin', els => els.map(e => ({
    texto: e.innerText, visible: e.offsetParent !== null,
    hoja: (e.closest('.prev-hoja-row') || {}).innerText || ''
  })));
  const r = recuadros[0] || {};
  chequear(recuadros.length === 1, 'Pedro ve ' + recuadros.length + ' recuadros de pendientes (esperado 1: el de la #501501)');
  chequear(r.visible && /#501501/.test(r.hoja), 'el recuadro no esta visible en la tarjeta de la #501501');
  chequear(r.texto && r.texto.indexOf('Comprar rueda <grande>') >= 0 && /neumáticos/.test(r.texto),
    'el texto del pendiente no se ve tal cual lo escribio el tecnico: ' + JSON.stringify(r.texto));
  P('   recuadro en la #501501: ' + JSON.stringify((r.texto || '').slice(0, 90)));
  await pedro.waitForTimeout(800);
  // Una captura por version: la contraprueba no pisa la del arreglo.
  const version = (URL.split('/').pop() || 'index.html').replace(/\.html$/, '');
  await pedro.screenshot({ path: 'tests/offline/pendientes-los-ve-pedro-' + version + '.png', fullPage: true });

  // 3. El Excel
  const btn = await pedro.$('#prev-pendientes-xlsx');
  const btnTxt = btn ? await btn.evaluate(b => b.offsetParent !== null ? b.textContent : '') : '';
  chequear(/\(1\)/.test(btnTxt), 'el boton de descarga no esta visible o no dice cuantos son: "' + btnTxt + '"');
  if (btnTxt) await btn.click();
  await pedro.waitForTimeout(600);
  const xl = (await pedro.evaluate(() => window.__excel))[0];
  if (chequear(!!xl, 'el boton no genero ningun Excel')) {
    const datos = xl.filas.slice(3).filter(f => f.some(c => String(c).trim()));
    P('3) Excel ' + xl.nombre + (xl.real ? ' (SheetJS real' + (xl.filtro ? ', con autofiltro ' + xl.filtro.ref : '') + ')' : ' (sustituto: sin internet)') + ': ' + datos.length + ' fila(s)');
    datos.forEach(f => P('   · ' + JSON.stringify(f).slice(0, 160)));
    chequear(/USO INTERNO/.test(String(xl.filas[0][0])), 'la primera fila no dice que es de uso interno');
    chequear(JSON.stringify(xl.filas[2]) === JSON.stringify(['Mes', 'Fecha', 'Técnico', 'Local', 'CECO', 'N° OT', 'Pendientes y materiales']),
      'el encabezado no es el esperado: ' + JSON.stringify(xl.filas[2]));
    chequear(datos.length === 1, 'el Excel trae ' + datos.length + ' filas (esperado 1: ni el correctivo, ni la cuenta de prueba, ni la nota en blanco)');
    const f = datos[0] || [];
    chequear(f[0] === 'Septiembre 2026' && f[1] === '15-09-2026' && f[2] === LUCAS && f[3] === 'UNIMARC PENCO' &&
      String(f[4]) === '720' && String(f[5]) === '501501' && f[6] === NOTA,
      'la fila del Excel no corresponde a la hoja #501501: ' + JSON.stringify(f));
    if (xl.real) chequear(!!xl.filtro, 'el Excel no trae autofiltro');
  }

  // 4. El Supervisor
  await abrirApp(rosa);
  await rosa.locator('.usuario-item', { hasText: 'Rosa Pinto' }).first().click();
  await rosa.waitForTimeout(300);
  for (const d of '4444') await rosa.locator('button.pin-btn', { hasText: new RegExp('^' + d + '$') }).first().click();
  await rosa.waitForTimeout(1500);
  await abrirPreventivos(rosa);
  const hojasRosa = await rosa.$$eval('#lista-preventivos .prev-hoja-row', els => els.length);
  const recRosa = await rosa.$$eval('#lista-preventivos .pend-materiales-admin', els => els.length);
  // "Comprar rueda" y no "neumáticos": ese ya esta en el placeholder del campo del tecnico.
  const notaEnDom = await rosa.evaluate(() => document.body.innerHTML.indexOf('Comprar rueda') >= 0);
  const btnRosa = await rosa.$eval('#prev-pendientes-xlsx', b => b.offsetParent !== null).catch(() => false);
  const cpsRosa = await carpetas(rosa);
  await rosa.evaluate(() => { try { descargarExcelPendientes(); } catch (e) {} });
  await rosa.waitForTimeout(300);
  const xlRosa = await rosa.evaluate(() => window.__excel.length);
  P('4) Rosa (Supervisor): ' + hojasRosa + ' hojas, ' + recRosa + ' recuadros, boton ' + (btnRosa ? 'VISIBLE' : 'oculto') + ', Excel ' + xlRosa);
  chequear(hojasRosa === 3, 'LINEA DE CONTROL: la Supervisora deberia ver las mismas 3 hojas y ve ' + hojasRosa);
  chequear(recRosa === 0 && !notaEnDom, 'la Supervisora ve el pendiente (decision de Pedro: solo el administrador)');
  chequear(!btnRosa, 'la Supervisora ve el boton de descargar pendientes');
  chequear(!cpsRosa.some(c => /con pendientes/.test(c)), 'la carpeta le dice a la Supervisora que hay pendientes');
  chequear(xlRosa === 0, 'la Supervisora descarga el Excel de pendientes llamando a la funcion');

  await browser.close();
  if (fallos.length) {
    console.log('\nFALLA — ' + fallos.length + ' problema(s):');
    fallos.forEach(f => console.log(f));
    process.exit(1);
  }
  console.log('\nOK — Pedro ve los pendientes en la hoja de preventivo y los baja en Excel; la Supervisora no.');
  process.exit(0);
})().catch(e => { console.error('\nFALLA — el guion se cayo:', e); process.exit(1); });
