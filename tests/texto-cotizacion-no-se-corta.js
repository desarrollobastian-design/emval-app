/* Prueba de regresion — el texto de un item se imprime COMPLETO en la cotizacion.

   Caso que lo origino (19-08-2026, Pedro): la cotizacion 19082601 salio a UNIMARC Pioneros
   diciendo "Reparacion de piso en pasillo central y venta asistida 50" — sin el "palmetas de
   50x50cm." — y en el item de al lado se comio la cantidad entera ("50 palmetas de 50x50cm.").
   La causa era una linea:

       var descI = doc.splitTextToSize(item.desc, colAncho[1]-2);   // parte en N lineas
       doc.text(descI[0], ...);                                     // ...y dibuja solo la [0]

   La fila media 7mm fijos y no cabia mas de una linea. jsPDF no avisa: dibuja y calla. Al barrer
   las 132 cotizaciones de produccion, 11 tenian al menos un item cortado. El tecnico no tiene
   como notarlo, porque la vista previa de la app es HTML y ahi el texto SI se ve completo.

   Lo que vigila, y por que cada cosa:

   1. NADA SE PIERDE. Lo que se dibuja en la columna Detalle, junto, es el texto completo del
      item. Es el invariante entero de este arreglo.
   2. El texto CABE en su columna. Envolver mal es tan malo como cortar: el texto se monta encima
      del precio y la cotizacion llega ilegible igual. Se mide con las metricas reales de
      Helvetica, no se asume.
   3. Las columnas suman los 180mm utiles. Antes sumaban 172 y la ultima celda quedaba coja: el
      titulo 'Total' y los montos salian corridos de su columna.
   4. La cotizacion de siempre NO SE MUEVE. Una fila de una linea mide 7mm y su texto va en y+5,
      igual que antes; y el cuerpo conserva sus 98mm rellenando con las filas vacias de siempre,
      para que el TOTAL NETO, la firma y la nota de validez queden donde Pedro las conoce.
   5. NADA se dibuja fuera de la hoja. Si los items no caben, se abre una hoja de continuacion —
      jamas se recorta el texto, que es el bug que este archivo existe para que no vuelva.
   6. LOS DOS generadores usan la funcion compartida. `generarPDFCotizacionGuardada` es la que
      emite hoy; `generarPDFCotizacion` es un duplicado que no llama nadie. El bug estaba en los
      dos porque el codigo estaba copiado. Se exige un solo sitio.

   Uso:  node tests/texto-cotizacion-no-se-corta.js index.html
   Sale 0 si los seis se sostienen; 1 si alguno se rompio. */

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); }

// ---- extraer las funciones reales de index.html, como hacen los demas tests de esta carpeta ---
function cuerpo(nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  let prof = 0, fin = -1;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (prof === 0) { fin = k + 1; break; } }
  }
  return fin < 0 ? null : src.slice(i, fin);
}
function constante(nombre) {
  const m = src.match(new RegExp('var\\s+' + nombre + '\\s*=\\s*([0-9.]+)'));
  return m ? Number(m[1]) : null;
}

const nombres = ['_colsCot', '_lineasItemCot', '_altoFilaCot', '_dibujarTablaItemsCot'];
const faltan = nombres.filter(n => !cuerpo(n));
if (faltan.length) {
  console.error('No se encontro en index.html: ' + faltan.join(', '));
  console.error('Si las renombraste, revisa que el arreglo del texto cortado siga en pie.');
  process.exit(1);
}
const CONST = ['_COT_FILA_H', '_COT_INTERLINEA', '_COT_CUERPO_H', '_COT_Y_LIMITE'];
const valores = {};
CONST.forEach(c => { valores[c] = constante(c); });
if (CONST.some(c => valores[c] == null)) {
  console.error('No se encontraron las medidas de la tabla (' + CONST.join(', ') + ')');
  process.exit(1);
}

const api = new Function(
  CONST.join(','),
  nombres.map(cuerpo).join('\n') + '\nreturn {' + nombres.map(n => n + ':' + n).join(',') + '};'
)(...CONST.map(c => valores[c]));

// ---- un jsPDF de mentira que mide de verdad -------------------------------------------------
// splitTextToSize con las metricas reales de Helvetica (las mismas widths que usa jsPDF para las
// fuentes estandar del PDF). Sin esto el test aprobaria un envoltorio que se sale de la celda.
const AW = { 32:278, 33:278, 34:355, 35:556, 36:556, 37:889, 38:667, 39:191, 40:333, 41:333,
  42:389, 43:584, 44:278, 45:333, 46:278, 47:278, 58:278, 59:278, 60:584, 61:584, 62:584,
  63:556, 64:1015, 91:278, 92:278, 93:278, 94:469, 95:556, 96:333, 123:334, 124:260, 125:334, 126:584 };
for (let c = 48; c <= 57; c++) AW[c] = 556;
'AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz'.split('').forEach(() => {});
const MAY = { A:667,B:667,C:722,D:722,E:667,F:611,G:778,H:722,I:278,J:500,K:667,L:556,M:833,
  N:722,O:778,P:667,Q:778,R:722,S:667,T:611,U:722,V:667,W:944,X:667,Y:667,Z:611 };
const MIN = { a:556,b:556,c:500,d:556,e:556,f:278,g:556,h:556,i:222,j:222,k:500,l:222,m:833,
  n:556,o:556,p:556,q:556,r:333,s:500,t:278,u:556,v:500,w:722,x:500,y:500,z:500 };
Object.keys(MAY).forEach(k => { AW[k.charCodeAt(0)] = MAY[k]; });
Object.keys(MIN).forEach(k => { AW[k.charCodeAt(0)] = MIN[k]; });
function anchoChar(ch) {
  const c = ch.charCodeAt(0);
  if (AW[c] !== undefined) return AW[c];
  const base = ch.normalize('NFD')[0].charCodeAt(0);   // tildes y ñ: pesan como su letra base
  return AW[base] !== undefined ? AW[base] : 556;
}
function anchoMM(txt, fs, bold) {
  let u = 0;
  for (const ch of String(txt)) u += anchoChar(ch) * (bold ? 1.08 : 1);
  return (u / 1000) * fs / (72 / 25.4);
}

function docFalso() {
  const d = {
    fs: 12, bold: false, textos: [], rects: [], lineas: [], paginas: 1,
    setFont: function (f, e) { d.bold = e === 'bold'; },
    setFontSize: function (v) { d.fs = v; },
    setTextColor: function () {}, setDrawColor: function () {}, setFillColor: function () {},
    addPage: function () { d.paginas++; },
    rect: function (x, y, w, h) { d.rects.push({ x, y, w, h }); },
    line: function (x1, y1, x2, y2) { d.lineas.push({ x1, y1, x2, y2 }); },
    text: function (t, x, y, o) {
      (Array.isArray(t) ? t : [t]).forEach(function (uno, i) {
        d.textos.push({ t: String(uno), x, y: y + i * 4, align: (o || {}).align || 'left',
                        fs: d.fs, ancho: anchoMM(uno, d.fs, d.bold) });
      });
    },
    splitTextToSize: function (txt, maxW) {
      const out = []; let cur = '';
      String(txt).split(/\s+/).filter(Boolean).forEach(function (p) {
        const t = cur ? cur + ' ' + p : p;
        if (anchoMM(t, d.fs, d.bold) <= maxW) cur = t;
        else { if (cur) out.push(cur); cur = p; }
      });
      if (cur) out.push(cur);
      return out.length ? out : [''];
    }
  };
  return d;
}

const MARGEN = 15, W = 210, VERDE = [100, 180, 150], TAB_Y = 98;
const COLS = api._colsCot(MARGEN);
function dibujar(items, tabY) {
  const doc = docFalso();
  const fin = api._dibujarTablaItemsCot(doc, items, tabY === undefined ? TAB_Y : tabY, MARGEN, W, VERDE);
  // Lo que cayo dentro de la columna Detalle (x = inicio de la celda + 2mm de aire)
  doc.detalle = doc.textos.filter(t => Math.abs(t.x - (COLS.x[1] + 2)) < 0.01);
  doc.fin = fin;
  return doc;
}
const norm = s => String(s).replace(/\s+/g, ' ').trim();

// ---- los items REALES de la cotizacion 19082601, tal como estan en Firestore ------------------
const REAL = [
  { desc: 'Reparación de piso en pasillo central y venta asistida 50 palmetas de 50x50cm. ', qty: 50, precio: 16000 },
  { desc: 'Reparación de piso en sector bebidas, licores y lineal de cajas 50 palmetas de 50x50cm.', qty: 50, precio: 16000 }
];

// 1 · NADA SE PIERDE ---------------------------------------------------------------------------
{
  const doc = dibujar(REAL);
  REAL.forEach(function (it, i) {
    const suyas = doc.detalle.filter(t => norm(it.desc).startsWith(norm(t.t)) || norm(it.desc).includes(norm(t.t)));
    chequear(suyas.length > 0, 'item ' + (i + 1) + ': no se dibujo nada en la columna Detalle');
  });
  const dibujado = norm(doc.detalle.map(t => t.t).join(' '));
  chequear(dibujado === norm(REAL[0].desc) + ' ' + norm(REAL[1].desc),
    'el texto dibujado no es el texto completo de los items.\n      dibujado: ' + dibujado);
  chequear(dibujado.includes('palmetas de 50x50cm.'),
    'se perdio "palmetas de 50x50cm." — es exactamente lo que le llego cortado a SMU');
  // contraprueba de la regla vieja: con el codigo anterior estos textos daban UNA linea
  chequear(doc.detalle.length >= 4,
    'cada item de estos ocupa 2 lineas: si se dibujan menos de 4, se esta cortando igual que antes');
}

// 2 · EL TEXTO CABE EN SU COLUMNA --------------------------------------------------------------
{
  const doc = dibujar(REAL.concat([
    { desc: 'Fabricación de puertas en tubular de aluminio 80x40 con vidrio laminado en la parte superior y placa doble en la parte inferior con sus respectivos picaporte, manillas y chapa.', qty: 1, precio: 900000 }
  ]));
  const anchoCelda = COLS.ancho[1];
  doc.detalle.forEach(function (t) {
    chequear(t.ancho <= anchoCelda - 2,
      'una linea se sale de la celda Detalle (' + t.ancho.toFixed(1) + 'mm de ' + anchoCelda + 'mm): "' + t.t + '"');
  });
  const largo = doc.detalle.filter(t => t.t.indexOf('tubular') >= 0 || t.t.indexOf('picaporte') >= 0);
  chequear(largo.length > 0, 'la descripcion larga de 3 lineas no se dibujo');
}

// 3 · LAS COLUMNAS SUMAN EL ANCHO UTIL ---------------------------------------------------------
{
  const suma = COLS.ancho.reduce((a, b) => a + b, 0);
  chequear(suma === W - MARGEN * 2,
    'las columnas suman ' + suma + 'mm y la tabla mide ' + (W - MARGEN * 2) + 'mm: la ultima celda queda coja');
  chequear(COLS.ancho[1] >= 80, 'la columna Detalle no puede achicarse: es donde falta espacio');
}

// 4 · LA COTIZACION DE SIEMPRE NO SE MUEVE -----------------------------------------------------
{
  chequear(api._altoFilaCot(1) === valores._COT_FILA_H,
    'una fila de una sola linea tiene que seguir midiendo ' + valores._COT_FILA_H + 'mm');
  const doc = dibujar([{ desc: 'Asistencia gasfiteria', qty: 1, precio: 150000 }]);
  const y0 = TAB_Y + valores._COT_FILA_H;             // primera fila, bajo el encabezado
  const t = doc.detalle[0];
  chequear(t && Math.abs(t.y - (y0 + 5)) < 0.01,
    'el texto de una fila normal se movio de y+5 (ahora en ' + (t ? (t.y - y0).toFixed(2) : '?') + ')');
  const cuerpo = doc.fin - y0;
  chequear(Math.abs(cuerpo - valores._COT_CUERPO_H) < 0.01,
    'el cuerpo mide ' + cuerpo.toFixed(1) + 'mm y tiene que medir ' + valores._COT_CUERPO_H +
    ': si cambia, se mueven el TOTAL NETO, la firma y la nota de validez');
}
{
  // ...y tampoco se mueve cuando los items ocupan dos y tres lineas, ni con la cotizacion mas
  // larga que hay en produccion (11 items, UNIMARC MANQUIMAVIDA).
  const once = [];
  for (let i = 0; i < 11; i++) once.push({ desc: 'Servicio ' + (i + 1), qty: 1, precio: 10000 });
  [REAL, once, REAL.concat(once)].forEach(function (items, i) {
    const doc = dibujar(items);
    const cuerpo = doc.fin - (TAB_Y + valores._COT_FILA_H);
    chequear(Math.abs(cuerpo - valores._COT_CUERPO_H) < 0.01,
      'escenario ' + (i + 1) + ': el cuerpo mide ' + cuerpo.toFixed(1) + 'mm en vez de ' + valores._COT_CUERPO_H);
  });
}

// 5 · NADA SE DIBUJA FUERA DE LA HOJA ----------------------------------------------------------
{
  const muchos = [];
  for (let i = 0; i < 30; i++) {
    muchos.push({ desc: 'Suministro e instalacion de circuito de agua caliente para venta asistida, carniceria y lacteos ' + (i + 1), qty: 1, precio: 50000 });
  }
  const doc = dibujar(muchos);
  chequear(doc.paginas > 1, '30 items no caben en una hoja: tiene que abrirse una de continuacion');
  const maxY = Math.max.apply(null, doc.rects.map(r => r.y + r.h));
  chequear(maxY <= valores._COT_Y_LIMITE + 0.01,
    'hay filas dibujadas hasta ' + maxY.toFixed(1) + 'mm, pasado el limite de ' + valores._COT_Y_LIMITE + 'mm');
  const dibujado = norm(doc.detalle.map(t => t.t).join(' '));
  muchos.forEach(function (it, i) {
    chequear(dibujado.includes(norm(it.desc)), 'con 30 items se perdio el texto del item ' + (i + 1));
  });
}

// 6 · LOS DOS GENERADORES USAN LA FUNCION COMPARTIDA -------------------------------------------
{
  ['generarPDFCotizacionGuardada', 'generarPDFCotizacion'].forEach(function (g) {
    const c = cuerpo(g);
    chequear(!!c && c.indexOf('_dibujarTablaItemsCot') >= 0,
      g + ' no dibuja la tabla con la funcion compartida: el texto cortado puede volver por ahi');
  });
  chequear(src.indexOf('descI[0]') < 0 && src.indexOf('descItem[0]') < 0,
    'volvio la linea que dibujaba solo la primera linea del item');
  // Ninguno de los dos generadores puede volver a tocar el texto del item por su cuenta: si lo
  // hace, es que se copio la tabla otra vez y el arreglo vuelve a estar duplicado.
  ['generarPDFCotizacionGuardada', 'generarPDFCotizacion'].forEach(function (g) {
    chequear(cuerpo(g).indexOf('item.desc') < 0,
      g + ' vuelve a dibujar el texto del item por su cuenta, fuera de la funcion compartida');
  });
}

// 7 · CASOS BORDE QUE NO PUEDEN BOTAR EL PDF ---------------------------------------------------
{
  const doc = dibujar([{ desc: '', qty: 1, precio: 0 }, { qty: 2, precio: 500 }, { desc: null, qty: 1, precio: 100 }]);
  chequear(doc.fin > 0, 'un item sin descripcion no puede botar la tabla');
  chequear(dibujar([]).fin > 0, 'una cotizacion sin items no puede botar la tabla');
  const sinItems = dibujar([]);
  chequear(Math.abs((sinItems.fin - (TAB_Y + valores._COT_FILA_H)) - valores._COT_CUERPO_H) < 0.01,
    'sin items la tabla tiene que seguir midiendo lo de siempre (14 filas vacias)');
}

// ---- resultado -------------------------------------------------------------------------------
if (fallos.length) {
  console.error('\n✗ EL TEXTO DE LA COTIZACION SE ESTA CORTANDO O EL LAYOUT SE MOVIO:\n');
  console.error(fallos.join('\n'));
  console.error('\n' + fallos.length + ' fallo(s).');
  process.exit(1);
}
console.log('✓ el texto del item se imprime completo, cabe en su columna y el layout no se movio');
console.log('  (probado con los items reales de la cotizacion 19082601 y con 30 items)');
process.exit(0);
