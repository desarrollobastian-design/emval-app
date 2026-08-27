/* Prueba de flujo real — la hoja de BAJA DE ACTIVO, con el jsPDF de verdad.

   `tests/baja-de-activo-no-cobra.js` lee el codigo y lo ejecuta con un jsPDF de mentira. Este
   genera la hoja con el jsPDF REAL dentro de Chromium, llamando a la misma funcion que corre
   cuando el tecnico la emite, y despues ABRE el archivo para leer que quedo escrito y en que
   coordenada. Es la unica forma de comprobarlo: jsPDF no avisa cuando dibuja fuera de la hoja
   ni cuando recorta — lo hace en silencio, y asi se perdieron lineas enteras de items en 11 de
   las 132 cotizaciones (19-08-2026).

   Que se mide:
     1. LINEA DE CONTROL: el PDF se genero de verdad (trae el encabezado de la empresa y el
        folio). Un espia roto da un PDF vacio, y ahi "no aparece la firma" seria cierto sin
        probar nada — paso el 13-08-2026 midiendo el campo de pendientes.
     2. Dice BAJA DE ACTIVO arriba, y trae la FECHA, el CECO y el nombre del local — los cuatro
        datos que Pedro pidio en el audio 5.
     3. El nombre del local sale ENTERO, no cortado a 16 caracteres como en las hojas viejas
        (25 de 50 locales; los cuatro UNIMARC CHILLAN salen identicos).
     4. Van LAS DOS FIRMAS: "EJECUTADO POR" con el nombre del tecnico, y "Firma y timbre EMVAL".
        Son dos imagenes DISTINTAS incrustadas: con el alias repetido jsPDF reutiliza la primera
        y las dos firmas saldrian siendo la misma.
     5. Todo cae dentro de la A4 (<= 285 mm), que es lo que jsPDF recorta callado.
     6. Con un detalle largo se abren hojas de continuacion y NO se pierde ninguna linea.
     7. El PDF no se disparo de tamaño: sin alias ni compresion jsPDF mete el PNG en crudo y la
        cotizacion paso de 26 KB a 1,24 MB (medido el 13-08). Este archivo lo sube el tecnico
        desde el telefono, muchas veces con mala señal.

   🔑 La contraprueba no es opcional: contra `prefix.html` (la version anterior al cambio) la
   funcion NI SIQUIERA EXISTE y el guion tiene que fallar. Si pasa contra las dos, no mide nada.

   Uso:
     node tests/offline/preparar.js HEAD          # deja index.html y prefix.html en sitio/
     node tests/offline/prueba-baja-activo.js index.html
     node tests/offline/prueba-baja-activo.js prefix.html    # CONTRAPRUEBA: debe fallar

   Necesita Playwright global:
     export NODE_PATH="C:/Users/corex/AppData/Roaming/npm/node_modules"
*/

const fs = require('fs');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const { chromium } = require('playwright');

const ARCHIVO = process.argv[2] || 'index.html';
const SITIO = path.join(__dirname, 'sitio');
const PUERTO = 8795;
const PT_POR_MM = 72 / 25.4;
const PIE_A4 = 285;

// El tecnico con firma cargada y mas hojas cerradas en produccion.
const TECNICO = 'Lucas Fernández';
// El local del caso real: la OT #586729 que quedo 37 dias trabada.
const LOCAL = 'ALVI CONCEPCION';
const CECO = '3089';

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

// ---- leer el PDF: que texto hay y en que coordenada (mismo lector que prueba-firma-hoja) ----
function textosDelPDF(buf) {
  const crudo = buf.toString('latin1');
  const trozos = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = re.exec(crudo))) {
    try { trozos.push(zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1')); }
    catch (e) { trozos.push(m[1]); }
  }
  const salida = [];
  trozos.forEach(function (c) {
    let x = 0, y = 0;
    const tk = /(-?[\d.]+)\s+(-?[\d.]+)\s+(Td|TD)|1\s+0\s+0\s+1\s+(-?[\d.]+)\s+(-?[\d.]+)\s+Tm|\(((?:\\.|[^\\)])*)\)\s*Tj/g;
    let t;
    while ((t = tk.exec(c))) {
      if (t[3]) { x = parseFloat(t[1]); y = parseFloat(t[2]); }
      else if (t[4] !== undefined) { x = parseFloat(t[4]); y = parseFloat(t[5]); }
      else {
        const txt = t[6]
          .replace(/\\([()\\])/g, '$1')
          .replace(/\\([0-7]{1,3})/g, function (_, o) { return String.fromCharCode(parseInt(o, 8)); });
        salida.push({ txt: txt, xmm: x / PT_POR_MM, ymm: 297 - y / PT_POR_MM });
      }
    }
  });
  return salida;
}

function imagenesDelPDF(buf) {
  const crudo = buf.toString('latin1');
  const declaradas = (crudo.match(/\/Subtype\s*\/Image/g) || []).length;
  const trozos = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = re.exec(crudo))) {
    try { trozos.push(zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1')); }
    catch (e) { trozos.push(m[1]); }
  }
  const invocaciones = [];
  trozos.forEach(function (c) {
    const re2 = /([\d.]+)\s+0\s+0\s+([\d.]+)\s+([\d.-]+)\s+([\d.-]+)\s+cm\s*\/(\w+)\s+Do/g;
    let t;
    while ((t = re2.exec(c))) {
      invocaciones.push({
        nombre: t[5],
        wmm: parseFloat(t[1]) / PT_POR_MM, hmm: parseFloat(t[2]) / PT_POR_MM,
        xmm: parseFloat(t[3]) / PT_POR_MM,
        ymm: 297 - (parseFloat(t[4]) + parseFloat(t[2])) / PT_POR_MM
      });
    }
  });
  return { declaradas, invocaciones };
}

const norm = s => String(s).replace(/\s+/g, ' ').trim();
const sinTildes = s => norm(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

(async function () {
  if (!fs.existsSync(path.join(SITIO, ARCHIVO))) {
    console.error('Falta ' + ARCHIVO + ' en tests/offline/sitio/. Corre antes:');
    console.error('  node tests/offline/preparar.js HEAD');
    process.exit(1);
  }
  const server = await servir();
  const navegador = await chromium.launch();
  const fallos = [];
  const chequear = (ok, d) => { if (!ok) fallos.push('  ✗ ' + d); };
  let llegoAlFinal = false;

  try {
    const page = await (await navegador.newContext()).newPage();
    page.on('pageerror', e => console.log('   [error de la app] ' + e.message));
    await page.goto('http://localhost:' + PUERTO + '/' + ARCHIVO, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.jspdf && window.jspdf.jsPDF, null, { timeout: 30000 });

    // La contraprueba muere aca, y esa es la gracia: en la version anterior la funcion no existe.
    const existe = await page.evaluate(() => typeof window.generarPDFBaja === 'function');
    if (!existe) {
      console.log('\n✗ Esta version no tiene generarPDFBaja: la hoja de baja de activo no existe.');
      console.log('  (Es lo que se espera de la CONTRAPRUEBA contra prefix.html.)');
      process.exitCode = 1;
      return;
    }

    const DETALLE_CORTO = 'Se da de baja 1 transpaleta marca Stax (N1) (NSerie 26215-39), ya que presenta ' +
      'trizaduras en su estructura. No reparable. Se recomienda no ocupar.';
    // 60 lineas marcadas: si alguna no llega al PDF, se sabe cual.
    const DETALLE_LARGO = Array.from({ length: 60 }, (_, i) => 'renglon-de-control-' + (i + 1)).join('\n');

    async function generar(detalle) {
      const uri = await page.evaluate(async function (p) {
        window.__PDF = null;
        const Orig = window.jspdf.jsPDF.__orig || window.jspdf.jsPDF;
        function Espia() {
          const d = new Orig(...arguments);
          const o = d.output.bind(d);
          d.output = function () {
            if (!window.__PDF) { try { window.__PDF = o('datauristring'); } catch (e) {} }
            return o.apply(null, arguments);
          };
          return d;
        }
        Espia.prototype = Orig.prototype;
        Espia.__orig = Orig;
        Object.keys(Orig).forEach(function (k) { try { Espia[k] = Orig[k]; } catch (e) {} });
        window.jspdf = Object.assign({}, window.jspdf, { jsPDF: Espia });

        const doc = await window.generarPDFBaja({
          folio: '27082601', local: p.local, ceco: p.ceco, tecnico: p.tecnico,
          fecha: '27-08-2026', detalle: p.detalle
        });
        if (!doc) return null;
        doc.output('datauristring');
        return window.__PDF;
      }, { local: LOCAL, ceco: CECO, tecnico: TECNICO, detalle });
      if (!uri) return null;
      return Buffer.from(String(uri).split(',')[1], 'base64');
    }

    // ───────────────────────── HOJA NORMAL ─────────────────────────
    const pdf = await generar(DETALLE_CORTO);
    if (!pdf) { chequear(false, 'la app no genero ningun PDF de baja'); throw new Error('sin PDF'); }
    const textos = textosDelPDF(pdf);
    const img = imagenesDelPDF(pdf);
    const todo = sinTildes(textos.map(t => t.txt).join(' '));

    console.log('\n── HOJA DE BAJA ── ' + (pdf.length / 1024).toFixed(0) + ' KB, ' +
                textos.length + ' textos, ' + img.declaradas + ' imagen(es)');

    // 1. Linea de control: el PDF se genero de verdad.
    chequear(/Servicios Emval/i.test(todo), 'LINEA DE CONTROL: el PDF no trae el encabezado de la empresa — no se genero bien y lo demas no probaria nada');
    chequear(/27082601/.test(todo), 'LINEA DE CONTROL: el folio no aparece en la hoja');

    // 2. Los cuatro datos del audio 5.
    const titulo = textos.find(t => /BAJA DE ACTIVO/i.test(t.txt));
    chequear(!!titulo, 'la hoja no dice "BAJA DE ACTIVO"');
    if (titulo) {
      chequear(titulo.ymm < 25, 'el titulo "BAJA DE ACTIVO" no esta arriba (y=' + titulo.ymm.toFixed(0) + ' mm)');
      console.log('   titulo en y=' + titulo.ymm.toFixed(1) + ' mm');
    }
    chequear(/27-08-2026/.test(todo), 'la hoja no trae la fecha');
    chequear(new RegExp('CECO:\\s*' + CECO).test(todo), 'la hoja no trae el CECO del local');

    // 3. El local ENTERO, no cortado a 16.
    chequear(todo.indexOf(LOCAL) !== -1,
      'el nombre del local no sale entero (se busco "' + LOCAL + '"): es la mutilacion de las hojas viejas');

    // 4. Las dos firmas, y son dos imagenes distintas.
    chequear(/EJECUTADO POR/i.test(todo), 'la hoja no dice "EJECUTADO POR"');
    chequear(sinTildes(todo).indexOf(sinTildes(TECNICO)) !== -1, 'la hoja no trae el nombre del tecnico que la emitio');
    chequear(/Firma y timbre EMVAL/i.test(todo), 'la hoja no trae el bloque de firma y timbre de EMVAL');
    chequear(!/Receptor/i.test(todo), 'la hoja dice "Receptor": este documento no lo firma el local');
    chequear(img.declaradas >= 2,
      'se incrustaron ' + img.declaradas + ' imagen(es): tienen que ser 2 (tecnico + EMVAL). Con el alias repetido jsPDF reutiliza la primera');
    const nombresImg = [...new Set(img.invocaciones.map(i => i.nombre))];
    chequear(nombresImg.length >= 2,
      'las dos firmas apuntan al mismo XObject (' + nombresImg.join(',') + '): saldria la misma firma dos veces');
    img.invocaciones.forEach(function (i) {
      console.log('   imagen ' + i.nombre + ': ' + i.wmm.toFixed(1) + ' x ' + i.hmm.toFixed(1) +
                  ' mm en (' + i.xmm.toFixed(0) + ', ' + i.ymm.toFixed(0) + ')');
    });

    // 5. Todo dentro de la A4.
    const masBajo = textos.reduce((a, t) => Math.max(a, t.ymm), 0);
    const imgMasBaja = img.invocaciones.reduce((a, i) => Math.max(a, i.ymm + i.hmm), 0);
    console.log('   lo mas bajo: texto en ' + masBajo.toFixed(0) + ' mm, imagen en ' + imgMasBaja.toFixed(0) + ' mm (A4 util: ' + PIE_A4 + ')');
    chequear(masBajo <= PIE_A4, 'hay texto por debajo de los ' + PIE_A4 + ' mm: jsPDF lo recorta sin avisar');
    chequear(imgMasBaja <= PIE_A4, 'una firma cae por debajo de los ' + PIE_A4 + ' mm: sale cortada');

    // 7. Tamaño razonable.
    chequear(pdf.length < 400 * 1024,
      'el PDF pesa ' + (pdf.length / 1024).toFixed(0) + ' KB: sin alias ni compresion FAST jsPDF incrusta el PNG en crudo');

    // ───────────────────────── DETALLE LARGO ─────────────────────────
    const pdfLargo = await generar(DETALLE_LARGO);
    if (!pdfLargo) { chequear(false, 'no se genero el PDF con detalle largo'); }
    else {
      const tl = textosDelPDF(pdfLargo);
      const juntos = tl.map(t => t.txt).join(' ');
      const faltan = [];
      for (let i = 1; i <= 60; i++) if (juntos.indexOf('renglon-de-control-' + i) === -1) faltan.push(i);
      const paginas = (pdfLargo.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
      console.log('\n── DETALLE LARGO ── ' + (pdfLargo.length / 1024).toFixed(0) + ' KB, ' +
                  paginas + ' pagina(s), ' + (60 - faltan.length) + '/60 renglones impresos');
      chequear(faltan.length === 0,
        'se perdieron ' + faltan.length + ' renglones del detalle (' + faltan.slice(0, 8).join(',') +
        '...): jsPDF recorta en silencio');
      chequear(paginas > 1, 'con 60 renglones no se abrio hoja de continuacion');
      const masBajoL = tl.reduce((a, t) => Math.max(a, t.ymm), 0);
      chequear(masBajoL <= PIE_A4, 'en la hoja de continuacion hay texto bajo los ' + PIE_A4 + ' mm');
    }

    // ───────────────── FLUJO REAL POR LA INTERFAZ ─────────────────
    /* Lo anterior prueba el DIBUJO. Esto prueba el CABLEADO, que es donde este proyecto se ha
       roto: el 14-08 el campo `localCorto` se quedo fuera de `cargarCarpetas()` y el dato
       guardado no llegaba nunca al boton. No lo caza un test unitario que le pasa los datos a
       mano — solo trazar la ruta real hasta el boton. */
    await page.route('**/api.cloudinary.com/**', function (ruta) {
      ruta.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ secure_url: 'https://res.cloudinary.com/dcrf29tna/raw/upload/emval/bajas/prueba.pdf' }) });
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.nuevaBaja === 'function', null, { timeout: 30000 });

    // Entrar como tecnico POR LA INTERFAZ, con su PIN, igual que en terreno.
    await page.waitForTimeout(1500);
    await page.locator('.usuario-item').first().click();
    await page.waitForTimeout(500);
    for (const d of '1111') {
      await page.locator('button.pin-btn', { hasText: new RegExp('^' + d + '$') }).first().click();
    }
    await page.waitForTimeout(1500);

    // El acceso que ve el tecnico, clickeado de verdad.
    const btnEmitir = page.locator('#s-cadena button', { hasText: 'Emitir una baja de activo' });
    chequear(await btnEmitir.count() > 0, 'el tecnico no tiene el boton para emitir una baja en la pantalla de cadenas');
    await btnEmitir.first().click();

    await page.waitForSelector('#baja-lista-cadenas .cadena-card', { timeout: 15000 });
    await page.locator('#baja-lista-cadenas .cadena-card').first().click();
    await page.waitForSelector('#baja-lista-sucursales [data-baja-sucursal]', { timeout: 15000 });
    await page.locator('#baja-lista-sucursales [data-baja-sucursal]').first().click();

    // El local elegido tiene que verse en el formulario: es el paso que fallo con `localCorto`.
    const localEnForm = norm(await page.locator('#baja-local-nombre').textContent());
    chequear(localEnForm === 'PRUEBA ARNES 1',
      'el formulario no muestra el local elegido (dice "' + localEnForm + '"): el dato no llega desde el catalogo');
    const detalleEnForm = norm(await page.locator('#baja-local-detalle').textContent());
    chequear(/999/.test(detalleEnForm), 'el CECO del local no llega al formulario (dice "' + detalleEnForm + '")');

    await page.fill('#baja-detalle', DETALLE_CORTO);
    await page.click('#btn-generar-baja');
    await page.waitForFunction(
      () => (window.__ESCRITURAS || []).some(e => e.coleccion === 'bajas'),
      null, { timeout: 20000 });

    const r = await page.evaluate(() => ({
      escrituras: window.__ESCRITURAS.map(e => ({ op: e.op, col: e.coleccion, datos: e.datos })),
      correos: window.__CORREOS.map(c => c.params)
    }));
    const enBajas = r.escrituras.filter(e => e.col === 'bajas');
    const enOrdenes = r.escrituras.filter(e => e.col === 'ordenes');
    const enCot = r.escrituras.filter(e => e.col === 'cotizaciones');

    console.log('\n── FLUJO POR LA INTERFAZ ── ' + r.escrituras.length + ' escritura(s), ' +
                r.correos.length + ' correo(s)');
    console.log('   colecciones tocadas: ' + [...new Set(r.escrituras.map(e => e.col))].join(', '));

    chequear(enBajas.length === 1, 'se escribieron ' + enBajas.length + ' documentos en `bajas` (deberia ser 1)');
    // EL INVARIANTE CENTRAL, medido sobre el flujo real y no sobre el codigo.
    chequear(enOrdenes.length === 0, 'la baja escribio en `ordenes`: entraria en la planilla que se le cobra a SMU');
    chequear(enCot.length === 0, 'la baja creo una cotizacion: es justo lo que Pedro pidio que NO pasara');

    const doc = enBajas[0] && enBajas[0].datos;
    if (doc) {
      console.log('   guardado: folio ' + doc.folio + ' · ' + doc.local + ' · CECO ' + doc.ceco +
                  ' · tecnico ' + doc.tecnico);
      chequear(!!doc.folio, 'la baja se guardo sin folio');
      chequear(doc.local === 'PRUEBA ARNES 1', 'el local no se guardo bien (quedo "' + doc.local + '")');
      chequear(String(doc.ceco) === '999', 'el CECO no se guardo (quedo "' + doc.ceco + '")');
      chequear(!!doc.tecnico, 'la baja se guardo sin el tecnico que la emitio');
      chequear(norm(doc.detalle) === norm(DETALLE_CORTO), 'el detalle escrito por el tecnico no se guardo igual');
      chequear(doc.pdfFormato === 1, 'la baja se guardo sin el sello de formato del PDF');
      chequear(/res\.cloudinary\.com/.test(doc.pdfUrlCloudinary || ''), 'no quedo enlazado el PDF subido');
    }

    const correoBaja = r.correos.find(c => c && c.tipo === 'Baja de activo');
    chequear(!!correoBaja, 'no salio el correo de la baja al local');
    if (correoBaja) {
      console.log('   correo a ' + correoBaja.email_admin + ' · asunto lleva ' + correoBaja.ot_numero);
      chequear(correoBaja.email_admin === 'local.prueba@ejemplo.cl',
        'el correo no fue al local (fue a "' + correoBaja.email_admin + '")');
      chequear(!!correoBaja.pdf_url, 'el correo salio sin el enlace al PDF');
    }

    llegoAlFinal = true;
  } catch (e) {
    fallos.push('  ✗ el guion murio: ' + (e && e.message));
  } finally {
    await navegador.close();
    server.close();
  }

  // Linea de control del propio guion: si no llego al final, se declara en falla. Contra una
  // version sin la funcion el guion muere antes, y uno que muere callado se parece demasiado a
  // uno que aprueba.
  if (!llegoAlFinal) fallos.push('  ✗ el guion no llego al final de las comprobaciones');

  console.log('');
  if (fallos.length) {
    console.log('BAJA DE ACTIVO (PDF real) — ' + fallos.length + ' PROBLEMA(S)\n' + fallos.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('BAJA DE ACTIVO (PDF real) — OK. La hoja sale con sus cuatro datos, las dos firmas, dentro de la A4 y sin perder texto.');
  }
})();
