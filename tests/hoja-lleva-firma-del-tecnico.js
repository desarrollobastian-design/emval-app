/* Prueba de regresion — la hoja de servicio sale firmada por el tecnico que la ejecuto.

   Pedido de Pedro el 25-08-2026, bajado desde SMU Santiago: la hoja de servicio (la "HS")
   tiene que llevar la firma Y el nombre del tecnico que hizo el trabajo, tanto en correctivo
   como en preventivo. El motivo lo dio el propio SMU: en otras zonas los supervisores se
   conseguian documentos en blanco y los adulteraban. O sea, este no es un detalle estetico:
   una hoja sin firma es una hoja que SMU puede rechazar.

   Los invariantes que vigila, cada uno por una razon concreta de este proyecto:

   1. LOS CINCO sitios que dibujan una hoja la firman. La hoja se dibuja en
      generarPDFPreventivo, en generarPDFRecepcionObra y OTRA VEZ como pagina 2 dentro de los
      dos generadores de cotizacion (uno de ellos huerfano). Cuando la tabla de items estaba
      copiada en dos sitios, el bug del texto cortado vivio duplicado y se arreglo una sola
      copia: a SMU le siguieron llegando cotizaciones cortadas. Aca se exige que las cinco
      pasen por la misma funcion.
   2. NO SE CONFUNDE CON LA FIRMA DEL RECEPTOR. En esta app conviven tres firmas distintas
      —la del local que recibe, la de Pedro como emisor en la cotizacion, y esta— y ya se
      confundieron una vez. El bloque del tecnico no puede decir "Receptor" ni leer
      `firmaImagen` / `fotoTimbre`, que son del local.
   3. CABE EN LA A4. La tabla de arriba es de alto variable (el texto del trabajo en el
      correctivo, las observaciones en el preventivo) y jsPDF NO AVISA cuando algo se sale de
      la hoja: lo recorta en silencio. Es exactamente como se perdio media firma en la
      cotizacion y como se comio lineas enteras de los items.
   4. SI NO CABE, HOJA NUEVA — no se encoge hasta lo ilegible ni se omite. Misma decision que
      la tabla de items: el contenido no se recorta nunca.
   5. SIN FIRMA CARGADA, EL BLOQUE SALE IGUAL. Un tecnico nuevo entra a la app el dia que lo
      contratan y su firma se embebe despues. Hasta entonces su hoja tiene que salir con el
      nombre y la linea para firmar a mano, no sin ningun rastro de quien ejecuto.
   6. EL NOMBRE SE BUSCA NORMALIZADO. La OT guarda el nombre tal como estaba el dia del
      cierre: hay OT con "Jose Quiroz" sin tilde y otras con "José". Comparar los strings
      crudos dejaria sin firma a la mitad de las hojas, y en silencio.
   7. ALIAS DISTINTO POR TECNICO + compresion FAST. Sin alias jsPDF incrusta el PNG en crudo
      (medido con la firma de EMVAL: de 26 KB a 1,24 MB) y con el alias REPETIDO reutiliza la
      primera imagen para todas — las tres hojas saldrian con la firma del mismo tecnico.
   8. UNA IMAGEN CORRUPTA NO BOTA EL PDF. El tecnico esta parado en un local; sin documento
      no puede cerrar.
   9. EL TECNICO VIAJA CONGELADO. `guardarYEnviarPDF` toma una instantanea antes del primer
      await justamente porque `estado` cambia bajo los pies del guardado en vuelo. Si la firma
      se leyera de `estado`, la hoja saldria firmada por quien quedo cargado, no por quien
      ejecuto — el mismo bug que cruzo numeros de OT y PDF.
  10. AL CAMBIAR EL DIBUJO DEL PDF DE COTIZACION SUBE `_PDF_COT_FORMATO`. Un PDF ya subido a
      Cloudinary es un archivo estatico: sin subir el sello, las cotizaciones existentes
      siguen mostrando la pagina 2 SIN firma por todos los caminos. Paso el 19-08 con el
      texto cortado y por poco deja el arreglo inservible.
  11. LAS FIRMAS EMBEBIDAS SON APAISADAS. Una firma que quedo mas alta que ancha es una foto
      mal recortada: se dibuja al alto maximo y sale angosta e ilegible (la de EMVAL habria
      salido a 12,9 mm). Lo produce tools/preparar-firma.js, que ya avisa; esto lo sostiene.

   Uso:  node tests/hoja-lleva-firma-del-tecnico.js index.html
   Sale 0 si se sostienen todos; 1 si alguno se rompio. */

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); }

// ── Sacar el cuerpo de una funcion de index.html, balanceando llaves ────────────────────────
function cuerpoDe(decl) {
  const i = src.indexOf(decl);
  if (i < 0) return null;
  let prof = 0, fin = -1;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (prof === 0) { fin = k + 1; break; } }
  }
  return fin < 0 ? null : src.slice(i, fin);
}

/* El bloque entero de la firma del tecnico, evaluado de una sola vez. Se le inyectan las dos
   cosas que lee de afuera: `_normTexto` (el criterio de comparacion de nombres del proyecto) y
   `FIRMAS_TECNICOS` (que en el archivo real trae 63 KB de base64 y no hace falta evaluar aca).
   ⚠️ Si alguien renombra una de estas funciones, esto se cae con "No se encontro" — y eso es a
   proposito: avisa que el arreglo hay que revalidarlo, no que el test este malo. */
const PIEZAS = ['var _FT_TEXTO_MM', 'function _firmaDeTecnico(',
                'function _altoFirmaTecnico(', 'function _dibujarFirmaTecnico(',
                'function _firmarHojaTecnico('];
const faltantes = PIEZAS.filter(p => src.indexOf(p) < 0);
if (faltantes.length) {
  console.error('No se encontro en index.html: ' + faltantes.join(', '));
  console.error('Si se renombraron, hay que revalidar el arreglo y actualizar este test.');
  process.exit(1);
}
const iConst = src.indexOf('var _FT_TEXTO_MM');
const finBloque = cuerpoDe('function _firmarHojaTecnico(');
const bloque = src.slice(iConst, src.indexOf(finBloque) + finBloque.length);

function cargar(firmas) {
  const normTexto = s => String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();
  return new Function('FIRMAS_TECNICOS', '_normTexto', 'console',
    bloque + '\nreturn { _firmaDeTecnico, _altoFirmaTecnico, _dibujarFirmaTecnico,' +
    ' _firmarHojaTecnico, _FT_TEXTO_MM, _FT_ALTO_MAX, _FT_ANCHO_MAX, _FT_PIE_A4 };'
  )(firmas, normTexto, { warn() {}, log() {} });
}

// ── Un jsPDF de mentira que anota todo lo que le piden dibujar ──────────────────────────────
function docFalso(explota) {
  const d = {
    imagenes: [], textos: [], lineas: [], paginas: 1, fs: 10, bold: false,
    setFont(f, e) { d.bold = e === 'bold'; },
    setFontSize(v) { d.fs = v; },
    setTextColor() {}, setDrawColor() {}, setLineWidth() {},
    addPage() { d.paginas++; },
    line(x1, y1, x2, y2) { d.lineas.push({ x1, y1, x2, y2 }); },
    text(t, x, y) { d.textos.push({ t: String(t), x, y, fs: d.fs, bold: d.bold }); },
    addImage(img, fmt, x, y, w, h, alias, comp) {
      if (explota) throw new Error('addImage reviento (PNG corrupto)');
      d.imagenes.push({ img, fmt, x, y, w, h, alias, comp });
    }
  };
  return d;
}

const FIRMAS = {
  'jose quiroz':     { nombre: 'José Quiroz',     img: 'data:image/png;base64,AAA', fmt: 'PNG', ratio: 1.4016 },
  'lucas fernandez': { nombre: 'Lucas Fernández', img: 'data:image/png;base64,BBB', fmt: 'PNG', ratio: 1.3542 }
};
// El punto mas bajo que alcanza el bloque del RECEPTOR, medido sobre los 202 documentos de
// produccion el 25-08-2026: 231 mm en los correctivos, 230 en los preventivos. Mas los 8 mm
// de aire que deja el codigo antes del bloque del tecnico.
const Y_REAL = 231 + 8;

console.log('La hoja de servicio tiene que salir firmada por quien la ejecuto\n');

// ── 1. Los CINCO sitios que dibujan una hoja la firman ──────────────────────────────────────
{
  const generadores = [
    ['async function generarPDFPreventivo(', 1, 'la hoja de preventivo que se emite sola'],
    ['async function generarPDFRecepcionObra(', 1, 'la hoja de correctivo que se emite sola'],
    // Dos ramas: la pagina 2 puede ser preventivo o recepcion de obra. Las dos son hojas.
    ['async function generarPDFCotizacionGuardada(', 2, 'la hoja dentro del PDF de cotizacion'],
    ['async function generarPDFCotizacion(', 1, 'la hoja dentro de la cotizacion HUERFANA']
  ];
  let total = 0, ok = true;
  generadores.forEach(function ([decl, esperadas, quien]) {
    const cuerpo = cuerpoDe(decl);
    if (!cuerpo) { ok = false; chequear(false, 'no se encontro ' + decl); return; }
    const n = (cuerpo.match(/_firmarHojaTecnico\(/g) || []).length;
    total += n;
    if (n < esperadas) {
      ok = false;
      chequear(false, quien + ' no se firma (' + n + ' de ' + esperadas + ' en ' +
        decl.replace('async function ', '').replace('(', '') + '): esas hojas llegan a SMU sin firma');
    }
  });
  console.log('1) Los cinco sitios: ' + total + ' llamadas a _firmarHojaTecnico ' + (ok ? '✓' : '✗'));
}

// ── 2. No se confunde con la firma del RECEPTOR ─────────────────────────────────────────────
{
  const dib = cuerpoDe('function _dibujarFirmaTecnico(');
  const tocaReceptor = /firmaImagen|fotoTimbre/.test(dib);
  const diceReceptor = /Receptor/i.test(dib);
  const diceEjecuto = dib.indexOf('EJECUTADO POR') >= 0;
  chequear(!tocaReceptor, 'el bloque del tecnico lee firmaImagen/fotoTimbre, que son del LOCAL que recibe');
  chequear(!diceReceptor, 'el bloque del tecnico dice "Receptor": dos bloques con la misma etiqueta es el error de siempre');
  chequear(diceEjecuto, 'el bloque no dice EJECUTADO POR: nada lo distingue del bloque del receptor');
  console.log('2) Emisor vs receptor: ' + (!tocaReceptor && !diceReceptor && diceEjecuto ? 'separados ✓' : 'se mezclaron ✗'));
}

// ── 3. Cabe en la A4, con el peor caso REAL y con uno inventado peor ─────────────────────────
{
  const F = cargar(FIRMAS);
  const d = docFalso(false);
  const yFin = F._firmarHojaTecnico(d, 'Lucas Fernández', 15, Y_REAL);
  const masBajo = Math.max(
    yFin,
    ...d.textos.map(t => t.y),
    ...d.lineas.map(l => l.y1),
    ...d.imagenes.map(i => i.y + i.h)
  );
  chequear(d.paginas === 1, 'con el peor caso real (' + Y_REAL + ' mm) abre hoja nueva sin necesidad: sobran 54 mm');
  chequear(masBajo <= F._FT_PIE_A4,
    'el bloque termina en ' + masBajo.toFixed(1) + ' mm y el borde util es ' + F._FT_PIE_A4 +
    ': jsPDF lo recorta EN SILENCIO');
  chequear(d.imagenes.length === 1, 'no se dibujo la firma en el caso normal');
  console.log('3) Cabe en la A4: termina en ' + masBajo.toFixed(1) + ' mm de ' + F._FT_PIE_A4 +
    ' ' + (masBajo <= F._FT_PIE_A4 && d.paginas === 1 ? '✓' : '✗'));
}

// ── 4. Si no cabe: hoja nueva, y el bloque sale COMPLETO ────────────────────────────────────
{
  const F = cargar(FIRMAS);
  // Una observacion larguisima empuja el bloque del receptor hasta aca. No pasa hoy en
  // produccion, pero el campo es texto libre y nadie lo topa.
  const d = docFalso(false);
  const yFin = F._firmarHojaTecnico(d, 'Lucas Fernández', 15, 279);
  const nombreImpreso = d.textos.some(t => t.t.indexOf('Lucas Fern') >= 0);
  const masBajo = Math.max(yFin, ...d.textos.map(t => t.y), ...d.imagenes.map(i => i.y + i.h));
  chequear(d.paginas === 2, 'no cabia y NO abrio hoja nueva: el bloque se dibujo fuera de la A4');
  chequear(nombreImpreso, 'en la hoja nueva se perdio el nombre del tecnico');
  chequear(masBajo <= F._FT_PIE_A4, 'en la hoja nueva tampoco cabe (' + masBajo.toFixed(1) + ' mm)');
  // Y el alto nunca pasa del tope ni queda negativo.
  chequear(F._altoFirmaTecnico(10) === F._FT_ALTO_MAX, 'con toda la hoja libre no usa el alto maximo');
  chequear(F._altoFirmaTecnico(279) === 0, 'a 279 mm dice que cabe una firma que no cabe');
  chequear(F._altoFirmaTecnico(260) > 0 && F._altoFirmaTecnico(260) < F._FT_ALTO_MAX,
    'a 260 mm no esta achicando la firma: o la corta o abre hoja de mas');
  console.log('4) Cuando no cabe: hoja nueva con el bloque completo ' +
    (d.paginas === 2 && nombreImpreso ? '✓' : '✗'));
}

// ── 5. Sin firma cargada, el bloque sale igual (tecnico nuevo) ──────────────────────────────
{
  const F = cargar(FIRMAS);
  const d = docFalso(false);
  F._firmarHojaTecnico(d, 'Nelson Herrera', 15, Y_REAL);   // no esta en FIRMAS
  const nombre = d.textos.some(t => t.t.indexOf('Nelson Herrera') >= 0);
  const linea = d.lineas.length >= 1;
  chequear(d.imagenes.length === 0, 'dibujo una imagen para un tecnico que no tiene firma cargada');
  chequear(nombre, 'un tecnico sin firma cargada sale SIN NOMBRE: la hoja no dice quien ejecuto');
  chequear(linea, 'no queda la linea para firmar a mano mientras no este su firma');
  // Y sin nombre ninguno, el hueco no puede quedar mudo.
  const d2 = docFalso(false);
  F._firmarHojaTecnico(d2, '', 15, Y_REAL);
  chequear(d2.textos.some(t => /no registrado/i.test(t.t)),
    'sin nombre de tecnico el bloque queda mudo: no se ve que falta un dato');
  console.log('5) Tecnico sin firma cargada: nombre + linea ' + (nombre && linea && !d.imagenes.length ? '✓' : '✗'));
}

// ── 6. El nombre se busca NORMALIZADO ───────────────────────────────────────────────────────
{
  const F = cargar(FIRMAS);
  const variantes = ['José Quiroz', 'Jose Quiroz', 'JOSE QUIROZ', '  josé   quiroz  '];
  const encontradas = variantes.filter(v => F._firmaDeTecnico(v));
  chequear(encontradas.length === variantes.length,
    'estas variantes del mismo nombre NO encuentran su firma: ' +
    variantes.filter(v => !F._firmaDeTecnico(v)).map(v => JSON.stringify(v)).join(', '));
  chequear(!F._firmaDeTecnico('Pedro Arce'), 'le asigna una firma a alguien que no la tiene');
  chequear(!F._firmaDeTecnico(''), 'con el nombre vacio devuelve una firma cualquiera');
  chequear(!F._firmaDeTecnico(null), 'con el nombre nulo se cae o devuelve una firma');
  console.log('6) Busqueda por nombre: ' + encontradas.length + '/' + variantes.length + ' variantes ' +
    (encontradas.length === variantes.length ? '✓' : '✗'));
}

// ── 7. Alias distinto por tecnico, y compresion FAST ────────────────────────────────────────
{
  const F = cargar(FIRMAS);
  const a = docFalso(false), b = docFalso(false);
  F._firmarHojaTecnico(a, 'José Quiroz', 15, Y_REAL);
  F._firmarHojaTecnico(b, 'Lucas Fernández', 15, Y_REAL);
  const ia = a.imagenes[0] || {}, ib = b.imagenes[0] || {};
  chequear(!!ia.alias && !!ib.alias, 'addImage va SIN alias: jsPDF incrusta el PNG en crudo (26 KB -> 1,24 MB)');
  chequear(ia.alias !== ib.alias,
    'dos tecnicos comparten el alias "' + ia.alias + '": jsPDF reutiliza la primera imagen y ' +
    'todas las hojas salen con la firma del mismo');
  chequear(ia.comp === 'FAST', 'addImage va sin compresion FAST');
  console.log('7) Alias por tecnico: ' + JSON.stringify(ia.alias) + ' vs ' + JSON.stringify(ib.alias) +
    ' ' + (ia.alias && ib.alias && ia.alias !== ib.alias && ia.comp === 'FAST' ? '✓' : '✗'));
}

// ── 8. Una imagen corrupta no bota el PDF ───────────────────────────────────────────────────
{
  const F = cargar(FIRMAS);
  const d = docFalso(true);   // addImage explota
  let reviento = false, y = -1;
  try { y = F._firmarHojaTecnico(d, 'José Quiroz', 15, Y_REAL); } catch (e) { reviento = true; }
  chequear(!reviento, 'una firma corrupta bota el PDF entero y deja al tecnico sin documento');
  chequear(d.textos.some(t => t.t.indexOf('José Quiroz') >= 0),
    'con la imagen rota se pierde tambien el nombre, que no depende de la imagen');
  console.log('8) Firma corrupta: la hoja se emite igual ' + (!reviento && y > 0 ? '✓' : '✗'));
}

// ── 9. El tecnico viaja CONGELADO desde guardarYEnviarPDF ───────────────────────────────────
{
  const g = cuerpoDe('async function guardarYEnviarPDF(');
  const congelado = /generarPDFRecepcionObra\(\s*snap\.tecnico\s*\)/.test(g);
  chequear(congelado,
    'guardarYEnviarPDF genera el PDF sin pasarle snap.tecnico: la firma se leeria de `estado`, ' +
    'que ya puede ser el de la OT siguiente');
  // Y los generadores tienen que aceptarlo, no ignorarlo.
  const prev = cuerpoDe('async function generarPDFPreventivo(');
  const corr = cuerpoDe('async function generarPDFRecepcionObra(');
  chequear(/generarPDFPreventivo\(\s*tecnicoNombre\s*\)/.test(src.slice(0, src.length)),
    'generarPDFRecepcionObra no le pasa el tecnico a generarPDFPreventivo: los preventivos ' +
    'perderian el congelado al desviarse');
  chequear(prev.indexOf('tecnicoNombre') >= 0 && corr.indexOf('tecnicoNombre') >= 0,
    'algun generador ignora el parametro y vuelve a leer el estado global');
  console.log('9) Tecnico congelado: ' + (congelado ? 'snap.tecnico ✓' : 'lee el estado global ✗'));
}

// ── 10. Al cambiar el dibujo de la cotizacion, sube el sello de formato ─────────────────────
{
  const m = src.match(/var\s+_PDF_COT_FORMATO\s*=\s*(\d+)/);
  const v = m ? Number(m[1]) : 0;
  chequear(v >= 3,
    '_PDF_COT_FORMATO sigue en ' + v + '. La pagina 2 de la cotizacion cambio (ahora lleva firma) ' +
    'y sin subir el sello los PDF ya subidos NO se regeneran: el cliente no ve el cambio por ningun camino');
  console.log('10) Sello de formato del PDF de cotizacion: v' + v + ' ' + (v >= 3 ? '✓' : '✗'));
}

// ── 11. Las firmas embebidas estan apaisadas y no engordan de mas el archivo ────────────────
{
  const i = src.indexOf('var FIRMAS_TECNICOS = {');
  chequear(i >= 0, 'no existe el bloque FIRMAS_TECNICOS: ninguna hoja saldria firmada');
  if (i >= 0) {
    const re = /\r?\n\};\r?\n/g; re.lastIndex = i;
    const m = re.exec(src);
    const bloqueF = src.slice(i, m ? m.index : src.length);
    const claves = [...bloqueF.matchAll(/^\s{2}'([^']+)':\s*\{/gm)].map(x => x[1]);
    const ratios = [...bloqueF.matchAll(/ratio:\s*([\d.]+)/g)].map(x => Number(x[1]));
    const pesos = [...bloqueF.matchAll(/img:\s*'data:image\/[a-z]+;base64,([A-Za-z0-9+/=]+)'/g)]
      .map(x => x[1].length / 1024);
    chequear(claves.length > 0, 'FIRMAS_TECNICOS esta vacio');
    chequear(claves.every(k => k === k.toLowerCase() && !/[À-ɏ]/.test(k)),
      'hay claves con mayusculas o tildes (' + claves.filter(k => k !== k.toLowerCase() ||
      /[À-ɏ]/.test(k)).join(', ') + '): no van a calzar con _normTexto y esas hojas salen sin firma');
    const verticales = ratios.filter(r => r <= 1);
    chequear(verticales.length === 0,
      verticales.length + ' firma(s) quedaron mas altas que anchas (ratio ' + verticales.join(', ') +
      '): es una foto mal recortada y sale angosta e ilegible. Rehacela con tools/preparar-firma.js');
    const total = pesos.reduce((a, b) => a + b, 0);
    chequear(total < 150,
      'las firmas suman ' + total.toFixed(0) + ' KB en base64. index.html entero se cachea en el ' +
      'Service Worker y cada tecnico lo descarga en cada version: baja --ancho en preparar-firma.js');
    console.log('11) Firmas embebidas: ' + claves.length + ' (' + claves.join(', ') + '), ' +
      total.toFixed(0) + ' KB, ratios ' + ratios.map(r => r.toFixed(2)).join('/') + ' ' +
      (verticales.length === 0 && total < 150 ? '✓' : '✗'));
  }
}

// ── LINEA DE CONTROL ────────────────────────────────────────────────────────────────────────
// Contra el codigo anterior a este cambio faltan funciones enteras y el guion muere arriba.
// Un guion que se corta a medias se parece demasiado a uno que aprueba.
console.log('\n-- fin de los 11 bloques --');

if (fallos.length) {
  console.error('\nFALLA — la hoja puede salir sin firmar:\n' + fallos.join('\n') + '\n');
  process.exit(1);
}
console.log('\nOK — la hoja de servicio sale firmada por quien la ejecuto, en los cinco sitios.\n');
