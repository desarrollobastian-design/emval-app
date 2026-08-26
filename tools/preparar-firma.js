#!/usr/bin/env node
/* Deja lista para el PDF una firma fotografiada sobre papel.

   Las firmas llegan por WhatsApp: una hoja completa fotografiada con la camara del telefono,
   con la firma ocupando un tercio, el papel gris, sombras y pliegues. Embebida asi, la firma
   de Pedro habria salido a 12,9 x 23 mm — ilegible. Hubo que recortarla y blanquearla a mano
   el 13-08-2026, midiendo el umbral. Este script hace ese trabajo, medido, y repetible para
   los tecnicos que vengan.

   Uso:
     node tools/preparar-firma.js <foto.jpg>                    # SIMULA: mide y reporta
     node tools/preparar-firma.js <foto.jpg> -o <salida.png>    # escribe el PNG limpio

   Opciones:
     -o <archivo>     PNG de salida (sin esto solo mide)
     --ancho <px>     ancho objetivo del PNG (default 520). En la hoja la firma se dibuja a
                      unos 30 mm: 520 px son ~440 dpi, de sobra para imprimir. Subirlo solo
                      engorda index.html, que el Service Worker cachea entero y cada tecnico
                      se baja completo en cada version desde el celular.
     --umbral <0-255> forzar el umbral en vez de calcularlo con Otsu
     --margen <%>     margen alrededor de la firma (default 4)
     --fondo <px>     ventana del filtro de fondo (default 72). Mas chica aplana sombras mas
                      duras, pero por debajo del grosor del trazo se come la propia tinta.
     --sin-limpiar    no descartar manchas sueltas lejos de la firma

   ─── POR QUE NO ES UN SIMPLE "SUBIR EL CONTRASTE" ──────────────────────────────────────────
   La foto de Jose Quiroz trae una banda de sombra horizontal (el pliegue de la hoja) mas
   oscura que partes del trazo de Nelson Herrera. Un umbral global sobre el gris crudo hace
   una de dos cosas: se come el pliegue como si fuera tinta —y el recorte se va a la sombra—
   o sube tanto que borra el trazo fino. Las dos salen mal y ninguna avisa.

   Por eso primero se ESTIMA EL FONDO: el papel es lo mas claro de cada zona, asi que un
   filtro de maximo sobre una version reducida da "de que color es el papel AQUI". Dividir
   por ese fondo aplana el pliegue, la sombra y el tinte del papel de una vez, y recien ahi
   el umbral global significa algo. Es correccion de iluminacion, no contraste.

   El color de la tinta SE CONSERVA (azul de Jose y Lucas, negro de Nelson): la normalizacion
   va por canal. Blanquear a negro puro inventaria un documento que no es el que firmaron.

   ⚠️ La foto de origen es un dato personal de un tercero y NO va al repo (.gitignore).
   El PNG de salida tampoco: lo unico que se versiona es el base64 dentro de index.html. */

const fs = require('fs');
const path = require('path');
const { chromium } = require(require('child_process')
  .execSync('npm root -g', { encoding: 'utf8' }).trim() + '/playwright');

const args = process.argv.slice(2);
function opt(nombre, porDefecto) {
  const i = args.indexOf(nombre);
  return i >= 0 && args[i + 1] ? args[i + 1] : porDefecto;
}
const origen = args.filter((a, i) => !a.startsWith('-') && !String(args[i - 1] || '').startsWith('-'))[0];
const salida = opt('-o', null);
const anchoObjetivo = parseInt(opt('--ancho', '520'), 10);
const umbralForzado = args.includes('--umbral') ? parseInt(opt('--umbral', '0'), 10) : null;
const margenPct = parseFloat(opt('--margen', '4'));
const ventanaFondo = parseInt(opt('--fondo', '72'), 10);
const limpiar = !args.includes('--sin-limpiar');

if (!origen || !fs.existsSync(origen)) {
  console.error('Falta la foto de la firma, o no existe: ' + origen);
  console.error('  node tools/preparar-firma.js <foto.jpg> [-o salida.png]');
  process.exit(1);
}

/* ─── PNG INDEXADO, escrito a mano ───────────────────────────────────────────────────────
   Una firma limpia tiene 33 colores: el blanco del papel y la rampa del trazo. Guardarla en
   RGBA es pagar 4 bytes por pixel para representar 33 valores. Indexada es 1 byte, y las
   franjas enteras de papel blanco se vuelven ceros al filtrar, que es lo que el deflate
   comprime bien.
   Medido con la firma de Lucas: 62 KB por `canvas.toDataURL('image/png')` de Chromium (RGBA,
   deflate rapido) contra lo que sale de aca. Son 3 firmas viviendo dentro de index.html, que
   el Service Worker cachea entera y cada tecnico se baja en cada version desde el celular.

   No se usa una libreria porque el proyecto no tiene ninguna: `tests/*.js` corren con Node
   pelado a proposito, y zlib viene en Node. */
function escribirPNGIndexado(w, h, paleta, idx) {
  const zlib = require('zlib');
  const tablaCRC = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c; }
    return t;
  })();
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = tablaCRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function chunk(tipo, datos) {
    const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length, 0);
    const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(cuerpo), 0);
    return Buffer.concat([largo, cuerpo, crc]);
  }

  // Filtro por scanline: se prueban None(0), Sub(1), Up(2) y se elige el de menor suma
  // absoluta — la heuristica estandar de libpng. En una firma gana casi siempre Up: las
  // filas de papel quedan identicas a la anterior y se van a cero.
  const crudo = Buffer.alloc(h * (w + 1));
  for (let y = 0; y < h; y++) {
    const fila = idx.subarray(y * w, y * w + w);
    const prev = y > 0 ? idx.subarray((y - 1) * w, (y - 1) * w + w) : null;
    const cand = [Buffer.from(fila), Buffer.alloc(w), Buffer.alloc(w)];
    for (let x = 0; x < w; x++) {
      cand[1][x] = (fila[x] - (x > 0 ? fila[x - 1] : 0)) & 0xFF;
      cand[2][x] = (fila[x] - (prev ? prev[x] : 0)) & 0xFF;
    }
    let mejor = 0, mejorSuma = Infinity;
    for (let f = 0; f < 3; f++) {
      let sum = 0;
      for (let x = 0; x < w; x++) { const v = cand[f][x]; sum += v < 128 ? v : 256 - v; }
      if (sum < mejorSuma) { mejorSuma = sum; mejor = f; }
    }
    crudo[y * (w + 1)] = mejor;
    cand[mejor].copy(crudo, y * (w + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;    // bits por muestra
  ihdr[9] = 3;    // color type 3 = indexado
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const plte = Buffer.alloc(paleta.length * 3);
  paleta.forEach((c, i) => { plte[i * 3] = c[0]; plte[i * 3 + 1] = c[1]; plte[i * 3 + 2] = c[2]; });

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('IDAT', zlib.deflateSync(crudo, { level: 9, memLevel: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

(async () => {
  const bin = fs.readFileSync(origen);
  const ext = path.extname(origen).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  const dataUrl = 'data:' + mime + ';base64,' + bin.toString('base64');

  // Chromium decodifica el JPEG y hace el trabajo de canvas. Es la misma dependencia que ya usa
  // tests/offline/: no se agrega ninguna libreria de imagenes al proyecto.
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const r = await page.evaluate(async (p) => {
    const img = new Image();
    await new Promise((ok, mal) => { img.onload = ok; img.onerror = mal; img.src = p.dataUrl; });
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const src = ctx.getImageData(0, 0, W, H).data;

    // ── 1. FONDO POR CANAL, sobre una version reducida ──────────────────────────────────
    // El papel es lo mas claro de su vecindad. El maximo local sobre la imagen reducida da
    // "de que color es el papel aqui", incluida la sombra del pliegue. Reducir 8x es lo que
    // hace esto barato: el fondo es suave por definicion, no necesita resolucion.
    const ESC = 8;
    const w2 = Math.max(1, Math.ceil(W / ESC)), h2 = Math.max(1, Math.ceil(H / ESC));
    const chico = new Float32Array(w2 * h2 * 3);
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
      let mr = 0, mg = 0, mb = 0;
      for (let dy = 0; dy < ESC; dy++) for (let dx = 0; dx < ESC; dx++) {
        const sy = y * ESC + dy, sx = x * ESC + dx;
        if (sy >= H || sx >= W) continue;
        const o = (sy * W + sx) * 4;
        if (src[o] > mr) mr = src[o];
        if (src[o + 1] > mg) mg = src[o + 1];
        if (src[o + 2] > mb) mb = src[o + 2];
      }
      const o2 = (y * w2 + x) * 3;
      chico[o2] = mr; chico[o2 + 1] = mg; chico[o2 + 2] = mb;
    }
    // Maximo separable con ventana R sobre la reducida (R*2+1 celdas ≈ ventanaFondo px).
    // ⚠️ El limite inferior lo pone el GROSOR DEL TRAZO: si la ventana es mas angosta que el
    // trazo, el maximo local dentro del trazo es el propio trazo, se normaliza a blanco y la
    // firma se borra sola. Por eso baja hasta donde la sombra lo exija y no mas.
    const R = Math.max(1, Math.round(p.ventanaFondo / (ESC * 2)));
    function maxSep(buf, w, h) {
      const tmp = new Float32Array(buf.length);
      for (let ch = 0; ch < 3; ch++) {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let m = 0;
          for (let k = -R; k <= R; k++) { const xx = Math.min(w - 1, Math.max(0, x + k));
            const v = buf[(y * w + xx) * 3 + ch]; if (v > m) m = v; }
          tmp[(y * w + x) * 3 + ch] = m;
        }
      }
      const out = new Float32Array(buf.length);
      for (let ch = 0; ch < 3; ch++) {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let m = 0;
          for (let k = -R; k <= R; k++) { const yy = Math.min(h - 1, Math.max(0, y + k));
            const v = tmp[(yy * w + x) * 3 + ch]; if (v > m) m = v; }
          out[(y * w + x) * 3 + ch] = m;
        }
      }
      return out;
    }
    const fondo = maxSep(chico, w2, h2);

    function fondoEn(x, y, ch) {   // bilineal desde la reducida
      const fx = Math.min(w2 - 1.001, x / ESC), fy = Math.min(h2 - 1.001, y / ESC);
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const g = (xx, yy) => fondo[((yy * w2) + xx) * 3 + ch];
      return g(x0, y0) * (1 - tx) * (1 - ty) + g(x0 + 1, y0) * tx * (1 - ty)
           + g(x0, y0 + 1) * (1 - tx) * ty + g(x0 + 1, y0 + 1) * tx * ty;
    }

    // ── 2. NORMALIZAR: papel -> blanco en todas partes, pliegue incluido ─────────────────
    const norm = new Uint8ClampedArray(W * H * 3);
    const lum = new Uint8ClampedArray(W * H);
    const histo = new Uint32Array(256);
    const mx = Math.round(W * 0.04), my = Math.round(H * 0.04);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4, o3 = (y * W + x) * 3;
      for (let ch = 0; ch < 3; ch++) {
        const f = Math.max(1, fondoEn(x, y, ch));
        norm[o3 + ch] = Math.min(255, src[o + ch] / f * 255);
      }
      const L = 0.299 * norm[o3] + 0.587 * norm[o3 + 1] + 0.114 * norm[o3 + 2];
      lum[y * W + x] = L;
      // El histograma que alimenta a Otsu EXCLUYE un marco del 4%. Ahi vive el borde de la
      // hoja y la sombra del encuadre, que son oscuros y grandes: dejandolos entrar, Otsu
      // deja de separar "tinta vs papel" y separa "borde vs hoja". Medido con la foto de
      // Jose Quiroz: con marco, umbral 191 y la caja arrancando en x=0.
      if (x >= mx && x < W - mx && y >= my && y < H - my) histo[Math.round(L)]++;
    }

    // ── 3. UMBRAL: Otsu sobre la luminancia YA normalizada ──────────────────────────────
    // Sobre el gris crudo, Otsu de esta foto separa "sombra vs papel", no "tinta vs papel".
    // Sobre la normalizada, el papel es un pico unico en 255 y el minimo entre clases cae
    // donde debe. El umbral igual se REPORTA: se mira, no se cree.
    let t = p.umbralForzado;
    if (!t) {
      let total = 0; for (let i = 0; i < 256; i++) total += histo[i];
      let sum = 0; for (let i = 0; i < 256; i++) sum += i * histo[i];
      let sumB = 0, wB = 0, mejor = -1, tOtsu = 200;
      for (let i = 0; i < 256; i++) {
        wB += histo[i]; if (!wB) continue;
        const wF = total - wB; if (!wF) break;
        sumB += i * histo[i];
        const mB = sumB / wB, mF = (sum - sumB) / wF;
        const entre = wB * wF * (mB - mF) * (mB - mF);
        if (entre > mejor) { mejor = entre; tOtsu = i; }
      }
      t = tOtsu;
    }

    // ── 4. MASCARA DE TINTA + componentes conexas ───────────────────────────────────────
    const tinta = new Uint8Array(W * H);
    let nTinta = 0;
    for (let i = 0; i < W * H; i++) if (lum[i] < t) { tinta[i] = 1; nTinta++; }

    const comp = new Int32Array(W * H).fill(-1);
    const cajas = [];
    const pila = new Int32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      if (!tinta[i] || comp[i] >= 0) continue;
      const id = cajas.length;
      let sp = 0; pila[sp++] = i; comp[i] = id;
      let x0 = W, y0 = H, x1 = -1, y1 = -1, area = 0;
      while (sp > 0) {
        const q = pila[--sp], qx = q % W, qy = (q / W) | 0;
        area++;
        if (qx < x0) x0 = qx; if (qx > x1) x1 = qx;
        if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = qx + dx, ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const n = ny * W + nx;
          if (tinta[n] && comp[n] < 0) { comp[n] = id; pila[sp++] = n; }
        }
      }
      cajas.push({ id, area, x0, y0, x1, y1 });
    }
    cajas.sort((a, b) => b.area - a.area);

    // ── 5. QUE ES FIRMA Y QUE ES BASURA ─────────────────────────────────────────────────
    // No se borra por tamaño: el punto de una "i" y la barra de una "t" son minusculos y son
    // firma. Se borra por DISTANCIA: primero se arma la caja con las componentes grandes
    // (>=2% de la mayor) y despues se readmite todo lo que caiga cerca de esa caja. Lo que
    // queda lejos —el pelo en la foto de Nelson, el borde de la hoja— se descarta.
    // Lo que TOCA EL BORDE de la foto no es firma: es el canto de la hoja, la mesa o la
    // sombra del encuadre. Nadie firma pegado al filo del papel, y estas tres fotos son de
    // la hoja completa. Sin esta regla la banda del borde izquierdo de Jose —una componente
    // enorme, que pasa cualquier filtro por area— arrastraba la caja a 774x1231 y la firma
    // salia a 14 mm de ancho dentro de un mar de papel.
    let porBorde = 0;
    if (p.limpiar) {
      cajas.forEach(c => { c.borde = (c.x0 === 0 || c.y0 === 0 || c.x1 === W - 1 || c.y1 === H - 1); });
      const utiles = cajas.filter(c => !c.borde);
      porBorde = cajas.length - utiles.length;
      cajas.length = 0; Array.prototype.push.apply(cajas, utiles);
    }
    const mayor = cajas[0] ? cajas[0].area : 0;
    const grandes = cajas.filter(c => c.area >= mayor * 0.02);
    let bx0 = W, by0 = H, bx1 = -1, by1 = -1;
    grandes.forEach(c => {
      if (c.x0 < bx0) bx0 = c.x0; if (c.x1 > bx1) bx1 = c.x1;
      if (c.y0 < by0) by0 = c.y0; if (c.y1 > by1) by1 = c.y1;
    });
    const tolX = (bx1 - bx0) * 0.15, tolY = (by1 - by0) * 0.15;
    const dentro = new Uint8Array(cajas.length ? Math.max(...cajas.map(c => c.id)) + 1 : 0);
    let descartadas = 0;
    cajas.forEach(c => {
      const cerca = c.x1 >= bx0 - tolX && c.x0 <= bx1 + tolX
                 && c.y1 >= by0 - tolY && c.y0 <= by1 + tolY;
      if (!p.limpiar || cerca || c.area >= mayor * 0.02) { dentro[c.id] = 1; }
      else descartadas++;
    });
    let fx0 = W, fy0 = H, fx1 = -1, fy1 = -1;
    cajas.forEach(c => { if (!dentro[c.id]) return;
      if (c.x0 < fx0) fx0 = c.x0; if (c.x1 > fx1) fx1 = c.x1;
      if (c.y0 < fy0) fy0 = c.y0; if (c.y1 > fy1) fy1 = c.y1; });
    if (fx1 < 0) { fx0 = 0; fy0 = 0; fx1 = W - 1; fy1 = H - 1; }

    // ── 6. PINTAR: papel blanco puro, tinta de UN color con rampa de 32 niveles ─────────
    // La tinta se pinta con un solo color y una rampa de opacidad, no con el pixel crudo.
    // Motivo medido: pintando el pixel crudo, el moteado JPEG dentro del trazo genera miles
    // de colores unicos y el PNG de Lucas pesaba 88 KB. Son 3 firmas dentro de index.html,
    // que el Service Worker cachea entera y cada tecnico descarga en cada version.
    // Cuantizado son 33 colores y baja a una fraccion, sin que el trazo cambie: la tinta ES
    // de un color, el moteado es ruido del sensor. No se binariza duro —eso saldria dentado
    // al imprimir—, se conserva el antialiasing en la rampa.
    // ── El nucleo se define por PERCENTIL, no por una fraccion del umbral ───────────────
    // Con `lum < t/2` un trazo fino y parejo no tiene ni un pixel de "nucleo" y el color
    // salia del promedio de TODO el trazo, bordes incluidos: la firma de Nelson Herrera
    // quedaba en rgb(86,78,81), gris claro, casi una marca de agua a 26 mm.
    const lumsTinta = [];
    for (let i = 0; i < W * H; i++) if (tinta[i] && dentro[comp[i]]) lumsTinta.push(lum[i]);
    lumsTinta.sort((a, b) => a - b);
    const pct = q => lumsTinta.length ? lumsTinta[Math.min(lumsTinta.length - 1,
      Math.floor(lumsTinta.length * q))] : 0;
    const lumRef = pct(0.20);   // el grueso del trazo llega al color pleno, no solo su centro

    // 🔴 El color sale de la imagen ORIGINAL (`src`), no de la normalizada.
    // La normalizacion divide por el papel para blanquearlo — y de paso ACLARA la tinta en la
    // misma proporcion. Sacando el color de ahi, la firma se imprime mas palida de lo que se
    // firmo: es la normalizacion filtrandose a un dato que no le toca. `norm` sirve para
    // decidir DONDE hay tinta; de que color es, lo dice la foto.
    let tr = 0, tg = 0, tb = 0, nNucleo = 0;
    for (let i = 0; i < W * H; i++) {
      if (!tinta[i] || !dentro[comp[i]] || lum[i] > lumRef) continue;
      const o4 = i * 4;
      tr += src[o4]; tg += src[o4 + 1]; tb += src[o4 + 2]; nNucleo++;
    }
    const colorTinta = nNucleo
      ? [Math.round(tr / nNucleo), Math.round(tg / nNucleo), Math.round(tb / nNucleo)]
      : [0, 0, 0];
    const rango = Math.max(1, t - lumRef);
    const NIVELES = 32;

    const out = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const o4 = i * 4;
      const esTinta = tinta[i] && dentro[comp[i]];
      if (!esTinta) { out.data[o4] = 255; out.data[o4 + 1] = 255; out.data[o4 + 2] = 255; }
      else {
        const a = Math.min(1, Math.max(0, (t - lum[i]) / rango));  // 1 = nucleo, 0 = borde
        for (let ch = 0; ch < 3; ch++) {
          out.data[o4 + ch] = Math.round(255 + (colorTinta[ch] - 255) * a);
        }
      }
      out.data[o4 + 3] = 255;                        // opaco: la transparencia en PDF se
    }                                                // imprime distinto segun el visor
    ctx.putImageData(out, 0, 0);

    // ── 7. RECORTAR Y ESCALAR ───────────────────────────────────────────────────────────
    const m = Math.round(Math.max(fx1 - fx0, fy1 - fy0) * (p.margenPct / 100));
    const rx0 = Math.max(0, fx0 - m), ry0 = Math.max(0, fy0 - m);
    const rw = Math.min(W - rx0, fx1 - fx0 + 1 + 2 * m);
    const rh = Math.min(H - ry0, fy1 - fy0 + 1 + 2 * m);

    const dst = document.createElement('canvas');
    const escala = Math.min(1, p.anchoObjetivo / rw);
    dst.width = Math.round(rw * escala); dst.height = Math.round(rh * escala);
    const dctx = dst.getContext('2d');
    dctx.imageSmoothingEnabled = true; dctx.imageSmoothingQuality = 'high';
    dctx.fillStyle = '#FFFFFF'; dctx.fillRect(0, 0, dst.width, dst.height);
    dctx.drawImage(c, rx0, ry0, rw, rh, 0, 0, dst.width, dst.height);

    // ── 7b. CUANTIZAR, Y RECIEN AHORA ──────────────────────────────────────────────────
    // ⚠️ Va DESPUES del resize, no antes. Cuantizando primero, el drawImage interpola entre
    // los 33 niveles y vuelve a inventar miles de colores: medido, el PNG de Lucas quedaba
    // en 62 KB igual que sin cuantizar. Reescalar es lo ultimo que toca los pixeles, asi
    // que la cuantizacion tiene que ir despues o no sirve de nada.
    const fin = dctx.getImageData(0, 0, dst.width, dst.height);
    const lumTinta = 0.299 * colorTinta[0] + 0.587 * colorTinta[1] + 0.114 * colorTinta[2];
    const rangoT = Math.max(1, 255 - lumTinta);
    let oscuros = 0;
    for (let i = 0; i < fin.data.length; i += 4) {
      const L = 0.299 * fin.data[i] + 0.587 * fin.data[i + 1] + 0.114 * fin.data[i + 2];
      if (L < 200) oscuros++;
      let a = Math.min(1, Math.max(0, (255 - L) / rangoT));
      a = Math.round(a * NIVELES) / NIVELES;
      for (let ch = 0; ch < 3; ch++) {
        fin.data[i + ch] = Math.round(255 + (colorTinta[ch] - 255) * a);
      }
      fin.data[i + 3] = 255;
    }
    dctx.putImageData(fin, 0, 0);

    // ── 7c. PALETA ─────────────────────────────────────────────────────────────────────
    // El PNG lo escribe Node, INDEXADO. `dst.toDataURL('image/png')` de Chromium sale RGBA
    // con un deflate rapido: medido, dejaba el PNG de Lucas en 62 KB con solo 33 colores
    // dentro. Con paleta + filtro por scanline + deflate 9 baja a una fraccion. Aca solo se
    // arma la tabla y el mapa de indices; escribir el archivo es cosa de Node.
    const paleta = [], indiceDe = new Map();
    const idx = new Uint8Array(dst.width * dst.height);
    for (let i = 0, k = 0; i < fin.data.length; i += 4, k++) {
      const key = (fin.data[i] << 16) | (fin.data[i + 1] << 8) | fin.data[i + 2];
      let ix = indiceDe.get(key);
      if (ix === undefined) {
        ix = paleta.length;
        if (ix > 255) ix = 0;                       // no puede pasar con NIVELES=32
        else { paleta.push([fin.data[i], fin.data[i + 1], fin.data[i + 2]]); indiceDe.set(key, ix); }
      }
      idx[k] = ix;
    }
    const vistos = indiceDe;

    return {
      W, H, umbral: t, nTinta, componentes: cajas.length, descartadas, porBorde, ventana: R * ESC * 2 + ESC,
      caja: { x0: fx0, y0: fy0, x1: fx1, y1: fy1 },
      colorTinta: colorTinta,
      recorte: { w: rw, h: rh },
      final: { w: dst.width, h: dst.height },
      cobertura: oscuros / (dst.width * dst.height),
      paleta: paleta,
      indices: Array.from(idx)
    };
  }, { dataUrl, umbralForzado, anchoObjetivo, margenPct, limpiar, ventanaFondo });

  await browser.close();

  const bytes = escribirPNGIndexado(r.final.w, r.final.h, r.paleta, Uint8Array.from(r.indices));
  const b64 = bytes.toString('base64');
  const ratio = +(r.final.w / r.final.h).toFixed(4);

  // Las cotas reales del hueco en la hoja (ver _dibujarFirmaTecnico en index.html). Si alla
  // cambian, aca tambien: si no, este script informa un tamaño que no es el que sale impreso.
  const ALTO_MAX = 22, ANCHO_MAX = 62;
  let altoMM = ALTO_MAX, anchoMM = ALTO_MAX * ratio;
  if (anchoMM > ANCHO_MAX) { anchoMM = ANCHO_MAX; altoMM = ANCHO_MAX / ratio; }

  console.log('\nFirma — ' + path.basename(origen) + '\n');
  console.log('  Original       : ' + r.W + ' x ' + r.H + ' px');
  console.log('  Ventana fondo  : ' + r.ventana + ' px');
  console.log('  Umbral usado   : ' + r.umbral + (umbralForzado ? '  (forzado)' : '  (Otsu sobre la luminancia normalizada)'));
  console.log('  Pixeles tinta  : ' + r.nTinta.toLocaleString('es-CL') + '   en ' + r.componentes + ' trazos'
              + (r.descartadas ? '   (' + r.descartadas + ' manchas sueltas' : '')
              + (r.porBorde ? (r.descartadas ? ' y ' : '   (') + r.porBorde + ' pegadas al borde' : '')
              + (r.descartadas || r.porBorde ? ' descartadas)' : ''));
  console.log('  Caja de firma  : ' + (r.caja.x1 - r.caja.x0 + 1) + ' x ' + (r.caja.y1 - r.caja.y0 + 1)
              + ' px  en (' + r.caja.x0 + ',' + r.caja.y0 + ')');
  console.log('  PNG resultante : ' + r.final.w + ' x ' + r.final.h + ' px   (ratio ' + ratio + ')');
  console.log('  Peso PNG       : ' + (bytes.length / 1024).toFixed(1) + ' KB'
              + '   ->  base64 ' + (b64.length / 1024).toFixed(1) + ' KB');
  console.log('  Color de tinta : rgb(' + r.colorTinta.join(', ') + ')   ' + r.paleta.length + ' colores en la paleta');
  console.log('  Cobertura tinta: ' + (r.cobertura * 100).toFixed(1) + '% del recuadro');
  console.log('  En el PDF sale : ' + anchoMM.toFixed(1) + ' x ' + altoMM.toFixed(1) + ' mm\n');

  const avisos = [];
  if (r.cobertura < 0.01) avisos.push('Casi no quedo tinta: el umbral se comio el trazo. Prueba --umbral mas alto.');
  if (r.cobertura > 0.35) avisos.push('Demasiado oscuro: puede haber entrado sombra como tinta. Prueba --umbral mas bajo.');
  const lumT = 0.299 * r.colorTinta[0] + 0.587 * r.colorTinta[1] + 0.114 * r.colorTinta[2];
  if (lumT > 140) avisos.push('La tinta quedo clara (luminancia ' + Math.round(lumT) + '): a ' +
    anchoMM.toFixed(0) + 'mm va a verse como marca de agua. Pide la firma con lapiz mas oscuro, o baja --umbral.');
  if (ratio < 1) avisos.push('La firma quedo mas ALTA que ancha (ratio ' + ratio + '). Casi seguro sobro papel en el recorte, o entro una sombra.');
  if (b64.length > 60 * 1024) avisos.push('Mas de 60 KB en base64. Son 3+ firmas dentro de index.html, que cada tecnico descarga entera en cada version: baja --ancho.');
  if (r.descartadas > 6) avisos.push(r.descartadas + ' manchas descartadas es mucho. Mira el PNG antes de embeberlo.');
  if (avisos.length) { console.log('  Avisos:'); avisos.forEach(a => console.log('   ⚠ ' + a)); console.log(''); }

  if (!salida) {
    console.log('  SIMULACION — no se escribio nada. Agrega  -o <archivo.png>  para guardarlo.\n');
    return;
  }
  fs.writeFileSync(salida, bytes);
  console.log('  ✓ ' + salida + '\n');
  console.log('  MIRA EL ARCHIVO antes de embeberlo. Este script mide, no juzga si se lee.\n');
})().catch(e => { console.error(e); process.exit(1); });
