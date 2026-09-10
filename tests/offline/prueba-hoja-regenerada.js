/* PRUEBA REAL — corregir el texto de una hoja ya cerrada produce un ARCHIVO NUEVO en Cloudinary.

   node tests/offline/prueba-hoja-regenerada.js <index.html|prefix.html>

   Caso: cotizacion 19082601 / OT 347723, 09-09-2026. Pedro corrige el texto de la hoja por
   `editarOTTerminada`, la app dice "OT actualizada ✓"… y Cloudinary sigue sirviendo el PDF viejo,
   porque el `public_id` era determinista y el preset `emval_pdf` NO SOBRESCRIBE (medido contra
   produccion: la OT 9016 subio dos veces con 28,6 h de diferencia y conserva la misma version
   `v1783459002` y el mismo Last-Modified).

   Lo que mide, y por que hay que EJECUTARLO en vez de leerlo:
     · el `public_id` que la app manda de verdad en el POST multipart a Cloudinary, en los tres
       cierres (original + dos correcciones). Ningun test de lectura ve lo que viaja en el body.
     · que el texto corregido este DENTRO del PDF regenerado — se abre el base64 que la app subio.
     · que la generacion quede escrita en la orden, que es lo que hace que la 2a correccion no
       repita `_v2`.
     · que corregir NO gaste cuota de EmailJS (las dos guardias de `editandoOTId`).

   CONTRAPRUEBA obligatoria contra `prefix.html` (una version anterior al fix): ahi los tres
   cierres tienen que salir con el MISMO public_id. Si el guion pasa contra las dos, no mide nada.

   Firestore y EmailJS son espias del arnes (imposible tocar produccion ni gastar cuota) y
   Cloudinary se intercepta con page.route. El navegador, la app, jsPDF, el canvas de la firma,
   IndexedDB y localStorage son reales. */

const { chromium, devices } = require('playwright');

const ARCHIVO = process.argv[2] || 'index.html';
const BASE = 'http://localhost:8765/';
const FOTO = __dirname + '/foto-prueba.png';

const log = (...a) => console.log(...a);
let okN = 0, malN = 0;
const ok = m => { okN++; log('  ok  ' + m); };
const mal = (m, d) => { malN++; log('  MAL ' + m + (d ? '\n        ' + String(d).replace(/\n/g, '\n        ') : '')); };

const TEXTO_ORIGINAL = 'Se cambian 50 palmetas';
const TEXTO_CORREGIDO = 'Reparacion de piso en sector bebidas, licores y lineal de cajas 50 palmetas de 50x50cm.';
const TEXTO_CORREGIDO_2 = 'Reparacion de piso en pasillo central y venta asistida 50 palmetas de 50x50cm.';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(Object.assign({}, devices['Pixel 7']));
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message.slice(0, 160)));

  /* Cloudinary NUNCA sale a internet. Se guarda el `public_id` de cada POST: es exactamente el
     dato que decide si el archivo nuevo pisa al anterior o convive con el. */
  const subidas = [];   // solo las del PDF de la hoja
  let fotos = 0;
  await page.route('**api.cloudinary.com/**', route => {
    const url = route.request().url();
    /* Por el mismo endpoint viajan las FOTOS (`/image/upload`, sin public_id) y la hoja
       (`/raw/upload`). Contarlas juntas daba 6 subidas y hacia fallar el conteo: son 3 fotos
       —antes, despues y timbre— mas los 3 PDF. Se separan por el endpoint, no por el body. */
    if (url.indexOf('/raw/upload') < 0) {
      fotos++;
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ secure_url: 'https://res.cloudinary.com/dcrf29tna/image/upload/emval/foto' + fotos + '.jpg' })
      });
    }
    let body = '';
    try { body = (route.request().postDataBuffer() || Buffer.alloc(0)).toString('utf8'); } catch (e) {}
    const m = body.match(/name="public_id"\r?\n\r?\n([^\r\n]*)/);
    const pid = m ? m[1] : '(no se encontro public_id en el body)';
    subidas.push(pid);
    return route.fulfill({
      status: 200, contentType: 'application/json',
      // URL distinta por subida: si la app se quedara con la vieja, se veria aca.
      body: JSON.stringify({ secure_url: 'https://res.cloudinary.com/dcrf29tna/raw/upload/v' + (1000 + subidas.length) + '/emval/pdfs/' + pid })
    });
  });

  log('\n══ ' + ARCHIVO + ' — la hoja regenerada no pisa a la anterior ══');
  await page.goto(BASE + ARCHIVO);
  await page.waitForTimeout(2500);

  // ── 1. Cierre normal, por la interfaz ─────────────────────────────────────────────────────
  await page.locator('.usuario-item').first().click();
  await page.waitForTimeout(500);
  for (const d of '1111') await page.locator('button.pin-btn', { hasText: new RegExp('^' + d + '$') }).first().click();
  await page.waitForTimeout(1200);
  await page.locator('text=UNIMARC').first().click();
  await page.waitForTimeout(800);
  await page.locator('text=PRUEBA ARNES 1').first().click();
  await page.waitForTimeout(800);
  await page.locator('#t-corr').click();
  await page.locator('#desc-problema').fill('Reparacion de piso (PRUEBA ARNES)');
  await page.locator('button.btn', { hasText: 'Continuar' }).first().click();
  await page.waitForTimeout(800);
  await page.evaluate(() => { estado.fotoActualId = 'foto-antes-0'; estado.fotoActualTipo = 'antes'; estado.fotoActualIdx = 0; });
  await page.locator('#input-foto-galeria').setInputFiles(FOTO);
  await page.waitForTimeout(1800);
  await page.locator('button.btn', { hasText: 'Iniciar trabajo' }).first().click();
  await page.waitForTimeout(900);

  await page.locator('#desc-trabajo').fill(TEXTO_ORIGINAL);
  await page.locator('#email-admin').fill('local.prueba@ejemplo.cl');
  for (const t of ['despues', 'timbre']) {
    await page.evaluate(tt => { estado.fotoActualId = 'foto-' + tt + '-0'; estado.fotoActualTipo = tt; estado.fotoActualIdx = 0; }, t);
    await page.locator('#input-foto-galeria').setInputFiles(FOTO);
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

  const antes = await page.evaluate(() => ({ num: estado.otNumero, firmada: estado.firmada }));
  if (!antes.firmada) { log('✗ la firma no quedo registrada; se aborta'); await browser.close(); process.exit(2); }
  log('OT #' + antes.num + ' lista. Cerrando…');

  await page.locator('#btn-cerrar-ot').click();
  await esperarSubidas(1, 45000);

  // ── 2. Dos correcciones seguidas, por el camino real de edicion ───────────────────────────
  for (const [i, texto] of [[1, TEXTO_CORREGIDO], [2, TEXTO_CORREGIDO_2]]) {
    const abrio = await page.evaluate(() => {
      /* El unico atajo del guion: se pone el rol a mano. El boton "Editar OT" solo se dibuja si
         `estado.cargo === 'Administrador'` y la propia funcion lo revalida — es un `if` de una
         linea, no es lo que esta a prueba. De aca en adelante corre el camino real:
         editarOTTerminada → abrirOTGuardada → el mismo boton #btn-cerrar-ot. */
      estado.cargo = 'Administrador';
      /* 🔴 Y el administrador NO es el técnico. Es la condición que destapó el bug del 10-09:
         `snap.tecnico` salía de `_tecnicoActual()`, así que la hoja corregida se re-emitía con el
         nombre de quien la editaba. Si este guion editara con el mismo usuario que cerró la OT,
         el defecto pasaría invisible — que es exactamente lo que pasó en la primera versión. */
      estado.usuario = 'PEDRO ADMIN';
      try { localStorage.setItem('emval_ultimo_usuario', 'PEDRO ADMIN'); } catch (e) {}
      const clave = Object.keys(window.__DOCS).find(k => k.indexOf('ordenes/') === 0);
      if (!clave) return { error: 'la OT no quedo guardada en la base del arnes' };
      const doc = window.__DOCS[clave];
      const ot = Object.assign({ id: clave.split('/')[1] }, doc);
      window.__otEnEdicion = ot;
      editarOTTerminada(ot);
      return { ok: true, id: ot.id, genGuardada: doc.pdfHojaGen === undefined ? '(sin campo)' : doc.pdfHojaGen };
    });
    if (abrio.error) { log('✗ ' + abrio.error); await browser.close(); process.exit(2); }
    await page.waitForTimeout(2500);

    const enModo = await page.evaluate(() => ({
      editando: !!estado.editandoOTId,
      boton: (document.getElementById('btn-cerrar-ot') || {}).textContent || '',
      genEnEstado: estado.pdfHojaGen,
    }));
    log('  edicion ' + i + ': editandoOTId=' + enModo.editando + ' · boton "' + enModo.boton.trim() +
        '" · pdfHojaGen en estado=' + enModo.genEnEstado + ' · guardada en el doc=' + abrio.genGuardada);

    await page.locator('#desc-trabajo').fill(texto);
    await page.waitForTimeout(300);
    await page.locator('#btn-cerrar-ot').click();
    await esperarSubidas(1 + i, 45000);
  }

  // ── 3. Lo que quedo ───────────────────────────────────────────────────────────────────────
  const estadoFinal = await page.evaluate(() => {
    const clave = Object.keys(window.__DOCS).find(k => k.indexOf('ordenes/') === 0);
    const doc = clave ? window.__DOCS[clave] : {};
    const pdfs = window.__ESCRITURAS.filter(e => e.op === 'add' && e.coleccion === 'pdfs');
    return {
      docOrden: { pdfHojaGen: doc.pdfHojaGen, pdfUrlCloudinary: doc.pdfUrlCloudinary, descripcionTrabajo: doc.descripcionTrabajo },
      pdfsAdds: pdfs.length,
      // Solo el ultimo PDF, para no arrastrar megas por el puente de Playwright.
      ultimoPDF: pdfs.length ? String((pdfs[pdfs.length - 1].datos || {}).pdfData || '').slice(0, 400000) : '',
      correos: window.__CORREOS.length,
      erroresJS: [],
    };
  });

  log('\n─ public_id de cada subida ─');
  subidas.forEach((s, i) => log('  ' + (i + 1) + '. ' + s));

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  log('\n1 · Cada regeneracion sube a un archivo DISTINTO');
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  if (subidas.length !== 3) {
    mal('se esperaban 3 subidas a Cloudinary (cierre + 2 correcciones)', 'hubo ' + subidas.length);
  } else {
    const unicos = new Set(subidas);
    if (unicos.size !== 3) {
      mal('dos subidas comparten public_id: la correccion rebota contra el archivo viejo',
        subidas.join('\n        '));
    } else ok('los 3 public_id son distintos');

    if (/_v\d/.test(subidas[0])) mal('el cierre original ya lleva sufijo: rompe las 253 URL ya subidas', subidas[0]);
    else ok('el cierre original va SIN sufijo (las hojas ya subidas conservan su URL)');

    if (!/_v2\.pdf$/.test(subidas[1])) mal('la 1a correccion no subio como _v2', subidas[1]);
    else ok('la 1a correccion sube a _v2');

    if (!/_v3\.pdf$/.test(subidas[2])) mal('la 2a correccion no subio como _v3 (la generacion no se persistio)', subidas[2]);
    else ok('la 2a correccion sube a _v3: la generacion se guardo entre una y otra');

    const raiz = subidas[0].replace(/\.pdf$/, '');
    if (subidas[1].indexOf(raiz) !== 0 || subidas[2].indexOf(raiz) !== 0) {
      mal('los archivos regenerados no comparten la raiz del original: el rescate no los deriva',
        subidas.join('\n        '));
    } else ok('las 3 comparten numero y clientId: siguen siendo derivables');
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  log('\n2 · El texto corregido esta DENTRO del PDF que se subio');
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  {
    let texto = '';
    try { texto = Buffer.from(estadoFinal.ultimoPDF.split(',').pop(), 'base64').toString('latin1'); } catch (e) {}
    // Linea de control: si el PDF no se genero, "no aparece el texto viejo" seria cierto y no
    // probaria nada. Un espia sin linea de control da falsos negativos.
    if (!/ORDEN DE TRABAJO/.test(texto)) {
      mal('el PDF medido no parece una hoja (falta el encabezado): la medicion no vale',
        'largo: ' + texto.length);
    } else {
      ok('el PDF se genero de verdad (trae el encabezado ORDEN DE TRABAJO)');
      const hayNuevo = texto.indexOf('venta asistida') >= 0 || texto.indexOf('pasillo central') >= 0;
      if (!hayNuevo) mal('el texto corregido NO esta en el PDF regenerado');
      else ok('el texto corregido viaja dentro del PDF');

      /* Y la firma tiene que seguir siendo la del TECNICO, no la del admin que corrigio.
         Una hoja que dice que la ejecuto otro es peor que una con el texto abreviado: es lo que
         SMU prohibio expresamente el 25-08. */
      const dice = [...texto.matchAll(/\(([^)]*)\)\s*Tj/g)].map(m => m[1]);
      const i = dice.findIndex(t => /EJECUTADO POR/.test(t));
      const firmante = i >= 0 ? String(dice[i + 1] || '').trim() : '(no se encontro)';
      if (!/NELSON/i.test(firmante)) {
        mal('la hoja corregida quedo firmada por quien la edito, no por quien la ejecuto',
          'EJECUTADO POR: "' + firmante + '" — deberia decir el tecnico de la OT');
      } else ok('la hoja sigue firmada por el tecnico que ejecuto ("' + firmante + '")');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  log('\n3 · Lo que queda escrito, y lo que no se gasta');
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  {
    const d = estadoFinal.docOrden;
    if (Number(d.pdfHojaGen) !== 3) mal('la orden no quedo con la generacion 3', 'pdfHojaGen = ' + d.pdfHojaGen);
    else ok('la orden guarda pdfHojaGen = 3');

    if (!/_v3\.pdf$/.test(String(d.pdfUrlCloudinary || ''))) {
      mal('la orden no apunta al ultimo PDF', d.pdfUrlCloudinary);
    } else ok('la orden apunta al ultimo archivo, no al primero');

    if (String(d.descripcionTrabajo || '').indexOf('pasillo central') < 0) {
      mal('el texto corregido no quedo en la orden', d.descripcionTrabajo);
    } else ok('el texto corregido quedo en la orden');

    // Corregir no puede gastar de los 200 correos/mes: solo el cierre original avisa.
    if (estadoFinal.correos > 2) {
      mal('corregir mando correos: ' + estadoFinal.correos + ' en total (el cierre manda 2)',
        'las guardias de editandoOTId no estan frenando el envio');
    } else ok('las 2 correcciones no mandaron ningun correo (' + estadoFinal.correos + ' en total, los del cierre)');
  }

  if (errores.length) {
    mal('hubo ' + errores.length + ' error(es) de JS en la pagina', errores.slice(0, 4).join('\n        '));
  } else ok('sin errores de JS en la pagina');

  await browser.close();

  log('\n' + '─'.repeat(92));
  log(okN + ' comprobaciones ok, ' + malN + ' fallidas');
  if (malN) {
    log('\nFALLA: una hoja corregida puede volver a rebotar contra el PDF viejo de Cloudinary.');
    process.exit(1);
  }
  log('\nOK: cada correccion sube a un archivo nuevo, el original conserva su URL, el texto');
  log('    corregido viaja dentro del PDF y corregir no gasta cuota de correo.');

  // ── auxiliar ────────────────────────────────────────────────────────────────────────────
  async function esperarSubidas(n, ms) {
    const t0 = Date.now();
    while (subidas.length < n && Date.now() - t0 < ms) await page.waitForTimeout(500);
    if (subidas.length < n) {
      log('  ⚠ se esperaba la subida ' + n + ' y no llego en ' + Math.round(ms / 1000) + ' s');
    }
    await page.waitForTimeout(2500);   // margen para que terminen las escrituras posteriores
  }
})().catch(e => { console.error('\nFALLA (excepcion): ' + e.message); process.exit(1); });
