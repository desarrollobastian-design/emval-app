/* Prueba de flujo real — el texto del item sale completo en el PDF de verdad.

   Los tests de `tests/*.js` leen el codigo y lo ejecutan con un jsPDF de mentira. Este genera el
   PDF con el jsPDF REAL, dentro de Chromium, llamando al mismo `generarPDFCotizacionGuardada` que
   corre cuando el administrador envia la cotizacion — y despues ABRE el archivo y lee lo que
   quedo escrito y en que coordenada. Es la unica forma de comprobar que el texto no se recorto:
   jsPDF no avisa cuando recorta, ni cuando dibuja fuera de la hoja.

   Los datos son los de la cotizacion 19082601 (UNIMARC Pioneros, 19-08-2026), la que Pedro
   reporto: le llego diciendo "...venta asistida 50" sin el "palmetas de 50x50cm.".

   Que se mide:
     1. El texto completo de los dos items esta en el PDF.
     2. Cada linea cae dentro de la columna Detalle (no se monta sobre el precio).
     3. El TOTAL NETO y la nota de validez quedaron en la MISMA coordenada que antes del arreglo
        — es decir, la cotizacion de siempre no se movio. Se compara contra prefix.html.

   🔑 La contraprueba no es opcional: contra `prefix.html` (una version anterior al arreglo) el
   punto 1 tiene que FALLAR. Si pasa contra las dos, no esta midiendo nada.

   Uso:
     node tests/offline/preparar.js HEAD        # deja index.html y prefix.html
     node tests/offline/prueba-texto-cotizacion.js index.html
     node tests/offline/prueba-texto-cotizacion.js prefix.html    # CONTRAPRUEBA: debe fallar

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
const PUERTO = 8791;
const PT_POR_MM = 72 / 25.4;

// La cotizacion 19082601 tal como esta guardada en Firestore.
const COT = {
  otId: '',                      // una previa no tiene OT: asi el PDF queda en su pagina 1
  otNumero: '',
  numeroCotizacion: '19082601',
  local: 'UNIMARC Pioneros',
  localCorto: 'Pioneros',
  supervisor: 'R. Abedrapo',
  tecnico: 'R. Abedrapo',
  fecha: '18-08-2026',
  nombreServicio: 'Cambio porcelanato sala',
  descripcionTrabajo: 'Se solicita el retiro de porcelanatos rotos en piso sala ventas e instalación de porcelanatos nuevos.\n\nTrabajo a realizar en horario nocturno.',
  items: [
    { desc: 'Reparación de piso en pasillo central y venta asistida 50 palmetas de 50x50cm. ', qty: 50, precio: 16000 },
    { desc: 'Reparación de piso en sector bebidas, licores y lineal de cajas 50 palmetas de 50x50cm.', qty: 50, precio: 16000 }
  ]
};

// ---- servidor estatico, para no depender de otra terminal -------------------------------------
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

// ---- leer el PDF: que texto hay y en que coordenada --------------------------------------------
// jsPDF escribe el contenido en claro salvo que se le pida comprimir; se contemplan los dos casos.
function textosDelPDF(buf) {
  const crudo = buf.toString('latin1');
  const trozos = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = re.exec(crudo))) {
    const datos = Buffer.from(m[1], 'latin1');
    try { trozos.push(zlib.inflateSync(datos).toString('latin1')); }
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

  try {
    const page = await (await navegador.newContext()).newPage();
    page.on('pageerror', e => console.log('   [error de la app] ' + e.message));
    await page.goto('http://localhost:' + PUERTO + '/' + ARCHIVO, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.jspdf && window.jspdf.jsPDF, null, { timeout: 30000 });
    await page.waitForFunction(() => typeof window.generarPDFCotizacionGuardada === 'function', null, { timeout: 30000 });

    const uri = await page.evaluate(async function (cot) {
      // Capturar el PDF que se genera, sin abrir ni subir nada.
      // jsPDF 2.x no pone `output` en el prototipo: se lo cuelga a cada instancia. Por eso se
      // envuelve el constructor y se parchea el documento recien creado, no la clase.
      const Orig = window.jspdf.jsPDF;
      function Espia() {
        const d = new Orig(...arguments);
        const o = d.output.bind(d);
        d.output = function () {
          if (!window.__PDF) { try { window.__PDF = o('datauristring'); } catch (e) { window.__errOut = e.message; } }
          return o.apply(null, arguments);
        };
        return d;
      }
      Espia.prototype = Orig.prototype;
      Object.keys(Orig).forEach(function (k) { try { Espia[k] = Orig[k]; } catch (e) {} });
      window.jspdf = Object.assign({}, window.jspdf, { jsPDF: Espia });
      window.open = function () { return null; };
      await window.generarPDFCotizacionGuardada(cot);
      return window.__PDF || null;
    }, COT);

    if (!uri) throw new Error('la app no genero ningun PDF');
    const pdf = Buffer.from(String(uri).split(',')[1], 'base64');
    const textos = textosDelPDF(pdf);
    console.log('PDF generado: ' + (pdf.length / 1024).toFixed(0) + ' KB, ' + textos.length + ' textos');

    // Linea de control: si el PDF salio vacio, "no aparece el texto" seria cierto y no probaria
    // nada. Un espia sin linea de control da falsos negativos (lo enseño el 13-08-2026).
    const todo = sinTildes(textos.map(t => t.txt).join(' '));
    chequear(todo.includes('DETALLE DE TRABAJOS') && todo.includes('19082601') && todo.includes('TOTAL NETO'),
      'el PDF no trae ni el encabezado ni el folio: no se genero de verdad, la medicion no vale');

    // 1 · el texto completo de los dos items --------------------------------------------------
    COT.items.forEach(function (it, i) {
      chequear(todo.includes(sinTildes(it.desc)),
        'item ' + (i + 1) + ': el texto NO esta completo en el PDF.\n      falta: "' + norm(it.desc) + '"');
    });
    chequear(todo.includes('palmetas de 50x50cm.'),
      'se perdio "palmetas de 50x50cm." — es exactamente lo que le llego cortado a SMU');

    // 2 · cada linea dentro de su columna ------------------------------------------------------
    const enDetalle = textos.filter(t => t.xmm > 27 && t.xmm < 32 && /[a-zA-Z]/.test(t.txt));
    chequear(enDetalle.length >= 4, 'la columna Detalle trae ' + enDetalle.length + ' lineas; los dos items ocupan 4');
    const inicioPrecio = 15 + 12 + 92 + 14;    // donde empieza la columna "$ unitario"
    enDetalle.forEach(function (t) {
      chequear(t.xmm + 2 < inicioPrecio, 'una linea arranca fuera de la columna Detalle: "' + t.txt + '"');
    });

    // 3 · la cotizacion de siempre no se movio -------------------------------------------------
    const hito = t => { const h = textos.find(x => sinTildes(x.txt).includes(t)); return h ? +h.ymm.toFixed(1) : null; };
    const medidas = { 'TOTAL NETO': hito('TOTAL NETO'), 'nota de validez': hito('Cotizacion valida por 10 dias a partir') };
    console.log('   TOTAL NETO en y=' + medidas['TOTAL NETO'] + 'mm · nota en y=' + medidas['nota de validez'] + 'mm');
    Object.keys(medidas).forEach(k => chequear(medidas[k] !== null, 'no se encontro "' + k + '" en el PDF'));
    fs.writeFileSync(path.join(SITIO, 'medidas-' + ARCHIVO + '.json'), JSON.stringify(medidas, null, 1));
    const otro = path.join(SITIO, 'medidas-' + (ARCHIVO === 'index.html' ? 'prefix.html' : 'index.html') + '.json');
    if (fs.existsSync(otro)) {
      const ref = JSON.parse(fs.readFileSync(otro, 'utf8'));
      Object.keys(medidas).forEach(function (k) {
        chequear(Math.abs(medidas[k] - ref[k]) < 0.6,
          k + ' se movio: ' + ref[k] + 'mm antes del arreglo, ' + medidas[k] + 'mm ahora');
      });
      console.log('   comparado contra ' + path.basename(otro) + ': el layout se mantiene');
    } else {
      console.log('   (corre tambien la otra version para comparar que el layout no se movio)');
    }
  } finally {
    await navegador.close();
    server.close();
  }

  if (fallos.length) {
    console.error('\n✗ ' + ARCHIVO + ' — el texto de la cotizacion NO sale completo:\n');
    console.error(fallos.join('\n'));
    process.exit(1);
  }
  console.log('\n✓ ' + ARCHIVO + ' — el PDF real trae el texto completo de los dos items, dentro de su columna');
  process.exit(0);
})().catch(function (e) { console.error('✗ reviento la prueba: ' + e.message); process.exit(1); });
