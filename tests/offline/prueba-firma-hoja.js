/* Prueba de flujo real — la hoja de servicio sale firmada por el tecnico, en el PDF de verdad.

   `tests/hoja-lleva-firma-del-tecnico.js` lee el codigo y lo ejecuta con un jsPDF de mentira.
   Este genera las DOS hojas —preventivo y correctivo— con el jsPDF REAL dentro de Chromium,
   llamando a las mismas funciones que corren cuando el tecnico cierra la OT, y despues ABRE el
   archivo para leer que quedo escrito, en que coordenada, y si la imagen de la firma llego a
   incrustarse. Es la unica forma de comprobarlo: jsPDF no avisa cuando dibuja fuera de la hoja
   ni cuando recorta — lo hace en silencio.

   Que se mide, en las dos hojas:
     1. LINEA DE CONTROL: el PDF se genero de verdad (trae el encabezado y el folio). Un espia
        roto da un PDF vacio, y ahi "no aparece la firma" seria cierto sin probar nada — paso
        el 13-08-2026 midiendo el campo de pendientes.
     2. Dice EJECUTADO POR y el NOMBRE del tecnico que ejecuto.
     3. El bloque va DEBAJO del de "Firma del Receptor", no encima ni al lado: son dos firmas
        distintas y confundirlas es el error que este proyecto ya cometio con el timbre.
     4. Todo cae dentro de la A4 (<= 285 mm), que es lo que jsPDF recorta callado.
     5. La IMAGEN de la firma esta incrustada y una sola vez por hoja (alias funcionando).
     6. El PDF no se disparo de tamaño: sin alias ni compresion, jsPDF mete el PNG en crudo y
        la cotizacion paso de 26 KB a 1,24 MB (medido el 13-08). Este archivo lo sube el
        tecnico desde el telefono y muchas veces con mala señal.

   🔑 La contraprueba no es opcional: contra `prefix.html` (una version anterior al cambio) los
   puntos 2 y 5 tienen que FALLAR. Si pasa contra las dos, no esta midiendo nada.

   Uso:
     node tests/offline/preparar.js HEAD        # deja index.html y prefix.html en sitio/
     node tests/offline/prueba-firma-hoja.js index.html
     node tests/offline/prueba-firma-hoja.js prefix.html    # CONTRAPRUEBA: debe fallar

   Necesita Playwright global:
     export NODE_PATH="C:/Users/corex/AppData/Roaming/npm/node_modules"
*/

const fs = require('fs');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const { chromium } = require('playwright');

const ARCHIVO = process.argv[2] || 'index.html';
const GUARDAR = process.argv.includes('--guardar');
const SITIO = path.join(__dirname, 'sitio');
const PUERTO = 8793;
const PT_POR_MM = 72 / 25.4;
const PIE_A4 = 285;

// El tecnico con mas hojas cerradas en produccion (93 de 202) y firma cargada.
const TECNICO = 'Lucas Fernández';

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

// ---- leer el PDF: que texto hay y en que coordenada (mismo lector que prueba-texto-cotizacion)
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

/* Cuantas imagenes distintas incrusto el PDF y cuantas veces se dibujaron. jsPDF declara un
   XObject por imagen y lo invoca con "/I<n> Do" cada vez que la pinta. Si el alias se repite
   entre tecnicos, aparece UNA imagen invocada N veces — que es exactamente el sintoma de que
   todas las hojas salen con la firma del mismo. */
function imagenesDelPDF(buf) {
  const crudo = buf.toString('latin1');
  const declaradas = new Set((crudo.match(/\/Subtype\s*\/Image/g) || []).map((_, i) => i));
  const trozos = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = re.exec(crudo))) {
    try { trozos.push(zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1')); }
    catch (e) { trozos.push(m[1]); }
  }
  const invocaciones = [];
  trozos.forEach(function (c) {
    // "q  w 0 0 h x y cm  /I0 Do  Q" — la matriz cm trae el tamaño y la posicion en puntos.
    const re2 = /([\d.]+)\s+0\s+0\s+([\d.]+)\s+([\d.-]+)\s+([\d.-]+)\s+cm\s*\/(\w+)\s+Do/g;
    let t;
    while ((t = re2.exec(c))) {
      invocaciones.push({
        nombre: t[5],
        wmm: parseFloat(t[1]) / PT_POR_MM, hmm: parseFloat(t[2]) / PT_POR_MM,
        xmm: parseFloat(t[3]) / PT_POR_MM,
        ymm: 297 - (parseFloat(t[4]) + parseFloat(t[2])) / PT_POR_MM   // borde superior
      });
    }
  });
  return { declaradas: declaradas.size, invocaciones };
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
    await page.waitForFunction(() => typeof window.generarPDFRecepcionObra === 'function', null, { timeout: 30000 });

    for (const caso of [{ tipo: 'preventivo', titulo: 'MANTENIMIENTO PREVENTIVO' },
                        { tipo: 'correctivo', titulo: 'ORDEN DE TRABAJO' }]) {

      const uri = await page.evaluate(async function (p) {
        // Espiar el output sin abrir ni subir nada. jsPDF 2.x cuelga `output` en la instancia,
        // no en el prototipo: por eso se envuelve el constructor.
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
        window.open = function () { return null; };

        /* Una OT cerrada de verdad: la pauta completa respondida, el local, el CECO.
           ⚠️ `estado` y `SERVICIOS_PREVENTIVO` estan declarados con `let`/`const` en el script
           global, asi que NO son propiedades de `window`. Escribiendo en `window.estado` se
           crea un objeto PARALELO, la app sigue con el suyo y el PDF sale con los datos por
           defecto — que es lo que paso en el primer intento: la linea de control lo caz. */
        Object.assign(estado, {
          tipo: p.tipo, otNumero: '904118', ceco: '474', local: 'UNIMARC CHILLAN 2',
          numEquipos: 3, usuario: p.tecnico, fotoTimbre: null, firmada: true,
          serviciosPreventivo: SERVICIOS_PREVENTIVO.map(function (n) {
            return { nombre: n, respuesta: 'si' };
          })
        });
        const el = document.getElementById('desc-trabajo');
        if (el) el.value = p.tipo === 'preventivo'
          ? 'Mantencion realizada sin novedades.'
          : 'Cambio de rodamientos y revision general de transpaleta manual.';

        const doc = await window.generarPDFRecepcionObra(p.tecnico);
        if (!doc) return null;
        doc.output('datauristring');
        return window.__PDF;
      }, { tipo: caso.tipo, tecnico: TECNICO });

      if (!uri) { chequear(false, caso.tipo + ': la app no genero ningun PDF'); continue; }
      const pdf = Buffer.from(String(uri).split(',')[1], 'base64');
      const textos = textosDelPDF(pdf);
      const img = imagenesDelPDF(pdf);
      const todo = sinTildes(textos.map(t => t.txt).join(' '));

      console.log('\n── ' + caso.tipo.toUpperCase() + ' ── ' + (pdf.length / 1024).toFixed(0) +
                  ' KB, ' + textos.length + ' textos, ' + img.declaradas + ' imagen(es)');

      // 1 · LINEA DE CONTROL --------------------------------------------------------------
      const seGenero = todo.includes(sinTildes(caso.titulo)) && todo.includes('904118');
      chequear(seGenero, caso.tipo + ': el PDF no trae el encabezado ni el folio — no se genero ' +
        'de verdad y ninguna de las mediciones de abajo vale');
      if (!seGenero) continue;

      // 2 · dice EJECUTADO POR y el nombre -------------------------------------------------
      const ejec = textos.find(t => /EJECUTADO POR/i.test(t.txt));
      const nombre = textos.find(t => sinTildes(t.txt).includes(sinTildes(TECNICO)));
      chequear(!!ejec, caso.tipo + ': la hoja NO dice "EJECUTADO POR"');
      chequear(!!nombre, caso.tipo + ': la hoja no trae el NOMBRE del tecnico que ejecuto — ' +
        'es la mitad de lo que pidio SMU');
      const rol = textos.find(t => /ejecut.* el trabajo/i.test(sinTildes(t.txt)));
      chequear(!!rol, caso.tipo + ': falta la linea que dice que ese es el ejecutor');

      // 3 · va DEBAJO del bloque del receptor ----------------------------------------------
      const receptor = textos.find(t => /Firma del Receptor/i.test(t.txt));
      const timbre = textos.find(t => /Timbre/i.test(t.txt));
      chequear(!!receptor, caso.tipo + ': desaparecio la firma del RECEPTOR, que ya estaba');
      if (ejec && receptor) {
        chequear(ejec.ymm > receptor.ymm, caso.tipo + ': el bloque del tecnico quedo ARRIBA del ' +
          'del receptor (' + ejec.ymm.toFixed(0) + ' vs ' + receptor.ymm.toFixed(0) + ' mm)');
      }
      if (ejec && timbre) {
        chequear(ejec.ymm > timbre.ymm, caso.tipo + ': el bloque del tecnico se monta sobre el ' +
          'timbre del receptor (' + ejec.ymm.toFixed(0) + ' vs ' + timbre.ymm.toFixed(0) + ' mm)');
      }

      // 4 · todo dentro de la A4 -----------------------------------------------------------
      const masBajoTexto = Math.max(...textos.map(t => t.ymm));
      const masBajoImg = img.invocaciones.length ? Math.max(...img.invocaciones.map(i => i.ymm + i.hmm)) : 0;
      const masBajo = Math.max(masBajoTexto, masBajoImg);
      chequear(masBajo <= PIE_A4, caso.tipo + ': algo llega a ' + masBajo.toFixed(1) +
        ' mm, pasado el borde util de ' + PIE_A4 + ': jsPDF lo recorta EN SILENCIO');

      // 5 · la IMAGEN de la firma esta incrustada, una sola vez -----------------------------
      const firmas = img.invocaciones.filter(i => i.ymm > (ejec ? ejec.ymm - 2 : 240));
      chequear(firmas.length === 1, caso.tipo + ': se esperaba 1 firma de tecnico dibujada y hay ' +
        firmas.length + ' — si son 0 la hoja sale sin firma; si son 2, se dibujo de mas');
      if (firmas.length === 1) {
        const f = firmas[0];
        chequear(f.wmm > 12 && f.hmm > 6, caso.tipo + ': la firma se dibujo a ' + f.wmm.toFixed(1) +
          'x' + f.hmm.toFixed(1) + ' mm: a ese tamaño no se lee');
        chequear(f.wmm <= 62.5 && f.hmm <= 22.5, caso.tipo + ': la firma se dibujo a ' +
          f.wmm.toFixed(1) + 'x' + f.hmm.toFixed(1) + ' mm, sobre el tope de 62x22');
        console.log('   firma dibujada a ' + f.wmm.toFixed(1) + ' x ' + f.hmm.toFixed(1) +
                    ' mm en y=' + f.ymm.toFixed(0) + ' mm');
      }
      if (ejec) console.log('   "EJECUTADO POR" en y=' + ejec.ymm.toFixed(0) +
                            ' mm  ·  lo mas bajo de la hoja: ' + masBajo.toFixed(0) + ' mm de ' + PIE_A4);

      // 6 · el PDF no se disparo de tamaño --------------------------------------------------
      chequear(pdf.length < 400 * 1024, caso.tipo + ': el PDF pesa ' + (pdf.length / 1024).toFixed(0) +
        ' KB. Sin alias ni compresion FAST jsPDF incrusta el PNG en crudo, y esto lo sube el ' +
        'tecnico desde el telefono con mala señal');

      if (GUARDAR) {
        const f = path.join(__dirname, 'hoja-' + caso.tipo + '.pdf');
        fs.writeFileSync(f, pdf);
        console.log('   guardado: ' + path.basename(f));
      }
    }
  } catch (e) {
    fallos.push('  ✗ reviento: ' + e.message);
  } finally {
    await navegador.close();
    server.close();
  }

  // LINEA DE CONTROL del guion: contra prefix.html el flujo llega hasta aca igual, pero con
  // fallos. Un guion que muere a medias se parece demasiado a uno que aprueba.
  console.log('\n-- fin de los 2 casos --');

  if (fallos.length) {
    console.error('\nFALLA — ' + ARCHIVO + ':\n' + fallos.join('\n') + '\n');
    process.exit(1);
  }
  console.log('\nOK — las dos hojas salen firmadas por el tecnico, dentro de la A4.\n');
})();
