/* Prueba de regresion — la cotizacion sale firmada y timbrada, y la firma no rompe el PDF.

   Pedido de Pedro el 13-08-2026: que la firma y el timbre de EMVAL vayan impresos en la
   cotizacion, en el hueco que queda bajo el TOTAL NETO.

   Los cuatro invariantes que vigila, cada uno por una razon concreta de este proyecto:

   1. LOS DOS generadores dibujan la firma. `generarPDFCotizacionGuardada` es la que emite
      hoy; `generarPDFCotizacion` es un duplicado que NO llama nadie (verificado el
      13-08-2026). Se exige que ambas firmen porque el dia que alguien reconecte la huerfana,
      el sintoma seria una cotizacion sin firma llegando a SMU sin que nadie lo asocie a este
      cambio. Es el mismo tipo de error que el numero de cotizacion armado en 3 lugares con
      el '01' hardcodeado: 39 de 45 cotizaciones salieron con el mismo folio.
   2. La firma CABE en el hueco. Va anclada a totY y el hueco vale (firmY - totY) mm. Si
      alguien agranda la firma o achica el hueco, la imagen pisa la nota de validez o la
      tabla de items. El test lee las dos cifras del codigo, no las asume.
   3. Sin imagen cargada NO se dibuja nada. Mientras Pedro no entregue el PNG definitivo,
      `FIRMA_EMVAL.img` esta vacio: la cotizacion tiene que salir exactamente como antes, no
      con un recuadro vacio que en el local parezca un error de impresion.
   4. La firma NUNCA bota el PDF. Si `addImage` falla, se emite igual sin firma. Una
      cotizacion sin firma se re-emite en 10 segundos; una que no se genera deja al tecnico
      parado en el local.

   Uso:  node tests/cotizacion-lleva-firma-emval.js index.html
   Sale 0 si los cuatro se sostienen; 1 si alguno se rompio. */

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); }

// Extrae una funcion por nombre y la deja ejecutable, como hacen los demas tests de esta
// carpeta. `_dibujarFirmaEmval` lee la global FIRMA_EMVAL, asi que se la pasamos como
// parametro para poder probarla vacia y cargada sin tocar index.html.
function extraer(nombre, firmaEmval) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  let j = src.indexOf('{', i), prof = 0, fin = -1;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (prof === 0) { fin = k + 1; break; } }
  }
  if (fin < 0) return null;
  try {
    return new Function('FIRMA_EMVAL', 'console', 'return ' + src.slice(i, fin) + ';')(
      firmaEmval, { warn: function () {}, log: function () {} }
    );
  } catch (e) { return null; }
}

// Un jsPDF de mentira que solo anota que le pidieron dibujar y con que medidas.
function docFalso(explota) {
  const dibujos = [];
  return {
    dibujos: dibujos,
    addImage: function (img, fmt, x, y, w, h) {
      if (explota) throw new Error('addImage reviento (imagen corrupta)');
      dibujos.push({ img: img, fmt: fmt, x: x, y: y, w: w, h: h });
    }
  };
}

console.log('La cotizacion tiene que salir firmada\n');

// ── 1. Los DOS generadores dibujan la firma ──────────────────────────────────────────────────
{
  const generadores = ['generarPDFCotizacionGuardada', 'generarPDFCotizacion'];
  let ok = true;
  generadores.forEach(function (nombre) {
    const i = src.indexOf('async function ' + nombre + '(');
    if (i < 0) { ok = false; chequear(false, 'no se encontro el generador ' + nombre); return; }
    let j = src.indexOf('{', i), prof = 0, fin = -1;
    for (let k = j; k < src.length; k++) {
      if (src[k] === '{') prof++;
      else if (src[k] === '}') { prof--; if (prof === 0) { fin = k + 1; break; } }
    }
    const cuerpo = src.slice(i, fin > 0 ? fin : src.length);
    if (cuerpo.indexOf('_dibujarFirmaEmval(') < 0) {
      ok = false;
      chequear(false, nombre + ' NO dibuja la firma: sus cotizaciones saldrian sin firmar');
    }
  });
  console.log('1) Los dos generadores: ' + (ok ? 'ambos firman ✓' : 'uno quedo sin firmar ✗'));
}

// ── 2. La firma NUNCA se sale de la hoja, por larga que sea la descripcion ───────────────────
{
  // Este es el invariante caro. La descripcion del trabajo es texto libre y empuja la tabla
  // entera hacia abajo: con 8 lineas, una firma de alto fijo terminaria fuera de la A4. jsPDF
  // no avisa — recorta en silencio, y la cotizacion llega a SMU con media firma.
  // Se prueba la funcion real con los totY medidos con pdf.js sobre PDF de verdad (13-08-2026)
  // y con los extremos que todavia no se han visto en produccion.
  const f = extraer('_altoFirmaCot', {});
  chequear(!!f, 'no se encontro _altoFirmaCot en index.html');

  const llamadas = [...src.matchAll(/_dibujarFirmaEmval\(\s*doc\s*,\s*margin\s*,\s*totY \+ (\d+)\s*,\s*altoFirma\s*,\s*(\d+)\s*\)/g)];
  chequear(llamadas.length === 2,
    'se esperaban 2 llamadas con la forma (doc, margin, totY + N, altoFirma, ancho), hay ' + llamadas.length);

  let ok = !!f && llamadas.length === 2;
  if (f && llamadas.length) {
    const offset = +llamadas[0][1];
    const HOJA = 297, MARGEN_MINIMO = 10;
    // totY medidos de verdad: 228 = descripcion corta, 238 = 4 lineas. El resto son extremos.
    [228, 238, 250, 258, 270, 275, 281, 290].forEach(function (totY) {
      const alto = f(totY);
      if (alto === 0) return;                       // no dibuja: no puede salirse
      const abajo = totY + offset + alto;
      if (abajo > HOJA - MARGEN_MINIMO) {
        ok = false;
        chequear(false, 'con el TOTAL NETO en ' + totY + 'mm la firma termina en ' + abajo +
          'mm: se sale de la hoja o queda sin margen de impresion');
      }
      if (alto < 8) {
        ok = false;
        chequear(false, 'con totY=' + totY + ' devolvio ' + alto + 'mm: una firma de menos de 8mm no se lee');
      }
    });
    // Y con la hoja ya llena, la respuesta correcta es 0 (sin firma), no una firma minuscula.
    if (f(295) !== 0) { ok = false; chequear(false, 'con la hoja llena (totY=295) deberia devolver 0 y devolvio ' + f(295)); }
    if (f(228) < 30) { ok = false; chequear(false, 'en el caso normal (totY=228) la firma quedo en ' + f(228) + 'mm: se pidio ~38mm para que el timbre se lea'); }

    if (ok) console.log('2) No se sale de la hoja: ' + f(228) + 'mm normal, ' + f(258) + 'mm apretado, 0 con la hoja llena ✓');
  }
  if (!ok) console.log('2) No se sale de la hoja: puede salirse ✗');
}

// ── 2b. La nota de validez sigue a la firma, y sin firma vuelve a su sitio de siempre ────────
{
  const conFirma = [...src.matchAll(/var firmY = conFirma \? totY \+ (\d+) \+ altoFirma : totY \+ (\d+)/g)];
  const ok = conFirma.length === 2 && conFirma.every(m => +m[2] === 30);
  chequear(ok, 'la nota de validez no acompaña a la firma, o sin firma no vuelve a totY+30 ' +
    '(el layout de siempre, para que una cotizacion sin firma salga identica a las de antes)');
  console.log('2b) Nota de validez: ' + (ok ? 'sigue a la firma y sin firma vuelve a totY+30 ✓' : 'quedo descolgada ✗'));
}

// ── 3. Sin imagen cargada no se dibuja nada ──────────────────────────────────────────────────
{
  const f = extraer('_dibujarFirmaEmval', { img: '', fmt: 'PNG', ratio: 1 });
  chequear(!!f, 'no se encontro _dibujarFirmaEmval en index.html');
  let ok = false;
  if (f) {
    const doc = docFalso(false);
    const r = f(doc, 15, 231, 23, 70);
    ok = (doc.dibujos.length === 0) && !r;
    chequear(ok, 'con FIRMA_EMVAL.img vacio dibujo igual: la cotizacion saldria con una mancha');
    console.log('3) Sin imagen cargada: ' + (ok ? 'no dibuja nada ✓' : 'dibuja algo ✗'));
  }
}

// ── 4. Con imagen: respeta la proporcion y el ancho maximo ───────────────────────────────────
{
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  let ok = true;

  // 4a. Imagen alta y angosta: manda el alto del hueco, el ancho sale del ratio.
  {
    const f = extraer('_dibujarFirmaEmval', { img: png, fmt: 'PNG', ratio: 1.3 });
    const doc = docFalso(false);
    f(doc, 15, 231, 23, 70);
    const d = doc.dibujos[0];
    if (!d) { ok = false; chequear(false, 'con imagen cargada no dibujo nada'); }
    else {
      if (Math.abs(d.h - 23) > 0.01) { ok = false; chequear(false, 'no uso el alto del hueco: ' + d.h + 'mm en vez de 23mm'); }
      if (Math.abs(d.w / d.h - 1.3) > 0.01) { ok = false; chequear(false, 'deformo la firma: ratio dibujado ' + (d.w / d.h).toFixed(2) + ' en vez de 1.3'); }
      if (d.x !== 15 || d.y !== 231) { ok = false; chequear(false, 'la dibujo en (' + d.x + ',' + d.y + ') en vez de (15,231)'); }
    }
  }

  // 4b. Imagen muy apaisada: el ancho maximo manda y el alto BAJA, no se estira.
  {
    const f = extraer('_dibujarFirmaEmval', { img: png, fmt: 'PNG', ratio: 6 });
    const doc = docFalso(false);
    f(doc, 15, 231, 23, 70);
    const d = doc.dibujos[0];
    if (!d) { ok = false; chequear(false, 'con imagen apaisada no dibujo nada'); }
    else {
      if (d.w > 70.01) { ok = false; chequear(false, 'se paso del ancho maximo: ' + d.w + 'mm, se sale de la hoja'); }
      if (Math.abs(d.w / d.h - 6) > 0.01) { ok = false; chequear(false, 'deformo la firma apaisada: ratio ' + (d.w / d.h).toFixed(2) + ' en vez de 6'); }
      if (d.h > 23.01) { ok = false; chequear(false, 'quedo mas alta que el hueco: ' + d.h + 'mm'); }
    }
  }

  console.log('4) Con imagen: ' + (ok ? 'no la deforma ni se sale ✓' : 'la deforma o se sale ✗'));
}

// ── 5. Si addImage revienta, la cotizacion se emite igual ────────────────────────────────────
{
  const f = extraer('_dibujarFirmaEmval', { img: 'data:image/png;base64,ROTO', fmt: 'PNG', ratio: 1 });
  let ok = false;
  if (f) {
    const doc = docFalso(true);
    let reviento = false;
    try { f(doc, 15, 231, 23, 70); } catch (e) { reviento = true; }
    ok = !reviento;
    chequear(ok, 'una imagen corrupta bota el PDF entero: el tecnico se queda sin cotizacion en el local');
  }
  console.log('5) Imagen corrupta: ' + (ok ? 'la cotizacion se emite igual ✓' : 'bota el PDF ✗'));
}

// ── 6. No se confunde con el timbre del RECEPTOR ─────────────────────────────────────────────
{
  const i = src.indexOf('function _dibujarFirmaEmval(');
  let fin = src.indexOf('\n}', i);
  const cuerpo = i >= 0 ? src.slice(i, fin > 0 ? fin : i + 2000) : '';
  // estado.fotoTimbre es el timbre del local que se fotografia en cada OT. Son cosas distintas
  // y mezclarlas pondria el timbre de SMU firmando una cotizacion de EMVAL.
  const ok = i >= 0 && cuerpo.indexOf('fotoTimbre') < 0 && cuerpo.indexOf('firmaImagen') < 0;
  chequear(ok, '_dibujarFirmaEmval toca fotoTimbre/firmaImagen, que son del RECEPTOR, no de EMVAL');
  console.log('6) Emisor vs receptor: ' + (ok ? 'no los mezcla ✓' : 'los mezclo ✗'));
}

console.log('');
if (fallos.length) {
  console.log('FALLO:\n' + fallos.join('\n') + '\n');
  process.exit(1);
}
console.log('Todo en orden: la cotizacion sale firmada, la firma cabe y nunca bota el PDF.\n');
process.exit(0);
