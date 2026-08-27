/* Prueba de regresion — la baja de activo es un COMPROBANTE, no un trabajo cobrable.

   Pedido de Pedro el 27-08-2026, en cinco audios. El caso que lo motiva esta fechado: la OT
   #586729 (Alvi Concepcion, 21-07-2026, Lucas) dice "Se da de baja 1 transpaleta marca Stax
   (N1) (NSerie 26215-39) ... No Reparable" y llevaba 37 dias trabada en la lista de pendientes
   de cotizar, porque la app solo sabia de preventivos y correctivos y todo correctivo espera su
   cotizacion. Pedro: "esa hoja no deberia llevar cotizacion ni nada. Tampoco genera una
   planilla, pero yo deberia enviarsela a los locales".

   Los invariantes que vigila, cada uno por una razon concreta de este proyecto:

   1. LA BAJA NO PUEDE TOCAR LA COBRANZA. Es el invariante central. Vive en su propia coleccion
      (`bajas`) y NO como un tercer valor de `tipo` en `ordenes`, porque `_normTipo()` es binaria
      A PROPOSITO —"todo lo que no es preventivo es correctivo"— para que ninguna OT desaparezca
      de las listas por traer el tipo nulo (las 7 OT de Chillan Viejo, 17-07-2026). Un
      `tipo:'baja'` seria tratado como CORRECTIVO por las comparaciones directas que hay en el
      archivo: entraria en la planilla que se le cobra a SMU y volveria a aparecer como
      pendiente de cotizar, que es justo el bug que esto arregla.
   2. NO GENERA COTIZACION NI ORDEN DE COMPRA. Es lo que Pedro pidio textual, tres veces.
   3. LA HOJA SALE CON LAS DOS FIRMAS — la del tecnico que la emitio y el timbre de EMVAL
      (audio 5). Y por la MISMA funcion que firma las hojas de servicio: abrir un segundo
      criterio de firma es como se termina con la mitad de los documentos sin firmar.
   4. NO SE CONFUNDE CON LA FIRMA DEL RECEPTOR. En esta app conviven tres firmas distintas y ya
      se confundieron una vez. La baja no lee `firmaImagen` ni `fotoTimbre`, que son del local.
   5. EL TEXTO LARGO NO SE RECORTA. jsPDF no avisa cuando algo se sale de la hoja: recorta en
      silencio. Asi se perdieron lineas enteras de items en 11 de 132 cotizaciones (19-08). Con
      un detalle largo se abren TANTAS hojas de continuacion como haga falta.
   6. TODA LLAMADA A LA NUBE VA CON GUARDIA DE TIEMPO. Con la señal muerta el SDK no resuelve ni
      rechaza — se cuelga — y lo que viene despues no corre nunca, en silencio. Es el cuelgue que
      dejo a administracion sin enterarse de las hojas de julio.
   7. EL FOLIO SE RESERVA CON TRANSACCION Y EN SU PROPIO CONTADOR. `size + 1` no es atomico: con
      el '01' hardcodeado, 39 de 45 cotizaciones compartieron numero y una llego a SMU. Y el
      contador es `baja_<ddmmaa>`, no el de cotizaciones: compartirlo le abriria huecos a la
      numeracion de las cotizaciones, que es la que ve SMU.
   8. EL NOMBRE DEL PDF ES ASCII. Viaja dentro de la URL como `fl_attachment:<nombre>` y un
      caracter fuera de ASCII hace que Cloudinary responda 400: la descarga se ROMPE, no sale
      fea. Medido con HEAD contra produccion el 14-08-2026.
   9. EL NOMBRE DEL LOCAL NO SE CORTA A 16 CARACTERES. Esa mutilacion ya la tienen las hojas
      viejas (25 de 50 locales; los cuatro UNIMARC CHILLAN salen identicos) y quedo pendiente el
      19-08. No se hereda en una hoja nueva.
  10. EL CORREO VA POR LA COLA, nunca por `emailjs.send` directo: si no sale ahora, sale al
      recuperar la señal en vez de morir en un toast. Es el cambio del commit 9e7801f.
  11. EL DATO VIAJA CONGELADO. La instantanea se toma antes del primer await, como en
      `guardarYEnviarPDF`: `estado` y el DOM cambian bajo los pies de un guardado en vuelo, y esa
      es la causa raiz de las hojas perdidas de julio.

   Uso:  node tests/baja-de-activo-no-cobra.js index.html
   Sale 0 si se sostienen todos; 1 si alguno se rompio. */

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); }

// ── Sacar el cuerpo de una funcion de index.html, balanceando llaves ────────────────────────
// ⚠️ Si alguien renombra una de estas funciones, esto se cae con "No se encontro" — y eso es a
// proposito: avisa que el arreglo hay que revalidarlo, no que el test este malo.
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

/* Quita comentarios antes de buscar. NO es un detalle: el codigo de la baja EXPLICA en sus
   comentarios lo que no se debe hacer —"un `tipo:'baja'` caeria en la planilla", "nunca por
   emailjs.send directo", "se confundieron con la del receptor"— y un test que busca sobre el
   texto crudo se dispara con la advertencia que existe para evitar el bug. Paso en la primera
   corrida: 3 de 3 fallos eran comentarios. Un test que no distingue codigo de comentario no
   esta midiendo el codigo. */
function sinComentarios(txt) {
  let out = '', modo = 'codigo';
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i], d = txt[i + 1];
    if (modo === 'codigo') {
      if (c === '/' && d === '*') { modo = 'bloque'; i++; continue; }
      if (c === '/' && d === '/') { modo = 'linea'; i++; continue; }
      if (c === "'" || c === '"' || c === '`') { modo = c; out += c; continue; }
      out += c;
    } else if (modo === 'bloque') {
      if (c === '*' && d === '/') { modo = 'codigo'; i++; }
    } else if (modo === 'linea') {
      if (c === '\n') { modo = 'codigo'; out += c; }
    } else {                       // dentro de un string: se copia tal cual
      out += c;
      if (c === '\\') { out += txt[i + 1] || ''; i++; continue; }
      if (c === modo) modo = 'codigo';
    }
  }
  return out;
}

const F = {
  generarPDFBaja: cuerpoDe('async function generarPDFBaja('),
  guardarYEnviarBaja: cuerpoDe('async function guardarYEnviarBaja('),
  cargarBajas: cuerpoDe('async function cargarBajas('),
  cargarCadenasBaja: cuerpoDe('async function cargarCadenasBaja('),
  asignarFolio: cuerpoDe('async function _asignarFolioBaja('),
  nombrePDF: cuerpoDe('function _nombrePDFBaja('),
  slugPDF: cuerpoDe('function _slugPDFBaja('),
  enviarSel: cuerpoDe('async function enviarBajasSeleccionadas('),
  seleccionarCadena: cuerpoDe('function seleccionarCadenaBaja(')
};
Object.keys(F).forEach(function(k) {
  if (!F[k]) fallos.push('  ✗ No se encontro la funcion ' + k + ' en index.html');
});
if (fallos.length) { console.log('BAJA DE ACTIVO — NO SE PUDO LEER EL CODIGO\n' + fallos.join('\n')); process.exit(1); }

// `F` conserva el codigo TAL CUAL (es el que se ejecuta mas abajo); `C` es el mismo codigo sin
// comentarios, y es sobre C que se buscan los patrones prohibidos.
const C = {};
Object.keys(F).forEach(function(k) { C[k] = sinComentarios(F[k]); });
// Los comentarios HTML se quitan ANTES que los de JS: el bloque de pantallas de la baja
// tambien explica, en un <!-- -->, por que no puede existir un `tipo:'baja'`.
const SRC_LIMPIO = sinComentarios(src.replace(/<!--[\s\S]*?-->/g, ''));
const TODAS = Object.keys(C).map(function(k) { return C[k]; }).join('\n');

// ── 1. La baja NO puede tocar la cobranza ───────────────────────────────────────────────────
chequear(/collection\(['"]bajas['"]\)/.test(C.guardarYEnviarBaja),
  'guardarYEnviarBaja no escribe en la coleccion `bajas`');
chequear(!/collection\(['"]ordenes['"]\)/.test(TODAS),
  'la baja de activo escribe o lee `ordenes`: no puede — ahi vive lo que se cobra');
chequear(!/collection\(['"]cotizaciones['"]\)/.test(TODAS),
  'la baja de activo toca `cotizaciones`: es justo lo que Pedro pidio que NO hiciera');
chequear(!/tipo\s*:\s*['"]baja['"]/.test(SRC_LIMPIO),
  'aparece un `tipo: "baja"`: _normTipo() lo normaliza a CORRECTIVO y entraria en la planilla de SMU');
// Ninguna funcion de planilla puede leer la coleccion nueva.
const zonaPlanillas = SRC_LIMPIO.slice(SRC_LIMPIO.indexOf('function _plEsPreventiva('));
chequear(!/collection\(['"]bajas['"]\)/.test(zonaPlanillas),
  'una funcion de planillas lee `bajas`: la baja no se cobra');

// ── 2. No genera cotizacion ni orden de compra ──────────────────────────────────────────────
['_asignarNumeroCotizacion', 'guardarCotizacion', 'generarPDFCotizacion', 'iniciarCotizacionPrevia'].forEach(function(fn) {
  chequear(C.guardarYEnviarBaja.indexOf(fn) === -1,
    'guardarYEnviarBaja llama a ' + fn + ': la baja no genera cotizacion');
});

// ── 3 y 4. Las dos firmas, y ninguna del receptor ───────────────────────────────────────────
chequear(/_firmarHojaTecnico\s*\(/.test(C.generarPDFBaja),
  'la hoja de baja no pasa por _firmarHojaTecnico: sale sin el tecnico que la emitio');
chequear(/_dibujarFirmaEmval\s*\(/.test(C.generarPDFBaja),
  'la hoja de baja no lleva la firma y timbre de EMVAL (audio 5 de Pedro)');
chequear(!/firmaImagen|fotoTimbre/.test(C.generarPDFBaja),
  'la hoja de baja lee firmaImagen/fotoTimbre: esas son del RECEPTOR, no de EMVAL');
chequear(!/Receptor/i.test(C.generarPDFBaja),
  'la hoja de baja dice "Receptor": este documento no lo firma el local');

// ── 6. Guardias de tiempo en todo lo que sale a la red ──────────────────────────────────────
[['guardarYEnviarBaja', C.guardarYEnviarBaja], ['cargarBajas', C.cargarBajas],
 ['cargarCadenasBaja', C.cargarCadenasBaja], ['_asignarFolioBaja', C.asignarFolio]].forEach(function(par) {
  const nombre = par[0], cuerpo = par[1];
  // Cada .get()/.set()/.add()/.update()/runTransaction tiene que ir dentro de _conTimeout.
  const llamadas = cuerpo.match(/db\s*\.\s*(collection|runTransaction)[\s\S]*?(?=;)/g) || [];
  llamadas.forEach(function(ll) {
    if (!/\.(get|set|add|update)\s*\(|runTransaction/.test(ll)) return;
    const idx = cuerpo.indexOf(ll);
    const antes = cuerpo.slice(Math.max(0, idx - 220), idx);
    chequear(/_conTimeout\s*\($/.test(antes.replace(/\s+$/, '')) || antes.indexOf('_conTimeout(') !== -1,
      nombre + ': una llamada a Firestore quedo SIN _conTimeout — con la señal muerta se cuelga y lo de abajo no corre');
  });
  if (/fetch\s*\(/.test(cuerpo)) {
    chequear(!/[^n]\bfetch\s*\(/.test(cuerpo.replace(/_fetchConTimeout\s*\(/g, '_fetchConTimeoutOK(')),
      nombre + ': hay un fetch pelado — con la señal muerta no se rinde nunca');
  }
});
chequear(/_fetchConTimeout\s*\(/.test(C.guardarYEnviarBaja),
  'la subida a Cloudinary no usa _fetchConTimeout');

// ── 7. El folio: transaccion y contador propio ──────────────────────────────────────────────
chequear(/runTransaction/.test(C.asignarFolio),
  'el folio de la baja no se reserva con transaccion: dos hojas del mismo dia compartirian numero');
chequear(/['"]baja_['"]?\s*\+|['"]baja_/.test(C.asignarFolio),
  'el folio de la baja no usa su propio contador `baja_<ddmmaa>`');
chequear(C.asignarFolio.indexOf("'cot_'") === -1 && C.asignarFolio.indexOf('"cot_"') === -1,
  'la baja usa el contador de COTIZACIONES: le abriria huecos a la numeracion que ve SMU');

// ── 10 y 11. Cola de correos y dato congelado ───────────────────────────────────────────────
chequear(/_enviarCorreo\s*\(/.test(C.guardarYEnviarBaja),
  'el correo de la baja no pasa por _enviarCorreo (la cola): se perderia con un toast');
chequear(!/emailjs\s*\.\s*send/.test(TODAS),
  'la baja manda con emailjs.send directo en vez de la cola');
chequear(/_enviarCorreo\s*\(/.test(C.enviarSel) && !/emailjs\s*\.\s*send/.test(C.enviarSel),
  'el envio al supervisor no pasa por la cola de correos');
// La instantanea: despues del primer await no se vuelve a leer la seleccion ni el DOM.
const trasPrimerAwait = C.guardarYEnviarBaja.slice(C.guardarYEnviarBaja.indexOf('await'));
const cuerpoTrasSnap = C.guardarYEnviarBaja.slice(C.guardarYEnviarBaja.indexOf('const snap = {'));
chequear(!/_bajaSel\s*\./.test(cuerpoTrasSnap.slice(cuerpoTrasSnap.indexOf('toast('))),
  'guardarYEnviarBaja vuelve a leer _bajaSel despues de la instantanea: el dato puede haber cambiado');
chequear(!/getElementById\(['"]baja-detalle['"]\)\s*\.\s*value/.test(trasPrimerAwait),
  'guardarYEnviarBaja lee el textarea despues de un await: para entonces puede tener otro texto');

// ── 9. El local NO se corta ─────────────────────────────────────────────────────────────────
chequear(!/substring\(\s*0\s*,\s*16\s*\)/.test(C.generarPDFBaja),
  'la hoja de baja corta el nombre del local a 16 caracteres: es el bug que quedo pendiente el 19-08');

// ── Ejecucion real de las funciones puras: nombre del archivo ───────────────────────────────
const ctx = {};
new Function('ctx', F.nombrePDF + '\n' + F.slugPDF + '\nctx._nombrePDFBaja=_nombrePDFBaja;ctx._slugPDFBaja=_slugPDFBaja;')(ctx);

const conTildes = { folio: '27082601', local: 'UNIMARC CHILLÁN 2 — Ñuñoa' };
chequear(ctx._nombrePDFBaja(conTildes).indexOf('27082601') === 0,
  'el folio no va primero en el nombre: la carpeta de Pedro no ordena sola');
chequear(/Baja de activo/.test(ctx._nombrePDFBaja(conTildes)),
  'el nombre del archivo no dice que es una baja de activo');
// 8. ASCII puro: un caracter fuera de ASCII rompe la descarga con un 400 de Cloudinary.
const slug = ctx._slugPDFBaja(conTildes);
chequear(/^[A-Za-z0-9_]+$/.test(slug),
  'el public_id de la baja trae caracteres fuera de ASCII ("' + slug + '"): Cloudinary devuelve 400');
chequear(slug.indexOf('CHILLAN') !== -1,
  'la normalizacion se comio el nombre del local en vez de solo quitarle las tildes');
chequear(ctx._nombrePDFBaja({ local: 'ALVI CONCEPCION' }).indexOf('SIN-NUMERO') !== -1,
  'una baja sin folio no deja el hueco a la vista: hay que verlo antes de entregarla');

// ── 5. El texto largo no se recorta: se ejecuta el generador real con un jsPDF espia ────────
function correrPDF(detalle) {
  const dibujado = [], estado = { paginas: 1 };
  const doc = {
    internal: { scaleFactor: 2.83 },
    setFontSize: function() {}, setFont: function() {}, setDrawColor: function() {},
    setLineWidth: function() {}, setTextColor: function() {}, rect: function() {},
    line: function() {}, addImage: function() {}, getStringUnitWidth: function(s) { return String(s).length * 0.5; },
    addPage: function() { estado.paginas++; },
    splitTextToSize: function(txt, ancho) {
      return String(txt).split('\n').filter(function(l) { return l.length; });
    },
    text: function(t) { dibujado.push(String(t)); }
  };
  const ventana = { jspdf: { jsPDF: function() { return doc; } } };
  const fn = new Function('window', 'String_', '_firmarHojaTecnico', '_dibujarFirmaEmval', 'console',
    F.generarPDFBaja + '\nreturn generarPDFBaja;')(
      ventana, String, function() { return 0; }, function() { return true; }, console);
  return fn({ folio: '27082601', local: 'ALVI CONCEPCION', ceco: '3089', tecnico: 'Lucas Fernández',
              fecha: '27-08-2026', detalle: detalle })
    .then(function(d) { return { doc: d, dibujado: dibujado, paginas: estado.paginas }; });
}

const lineasLargas = Array.from({ length: 60 }, function(_, i) { return 'linea-de-detalle-numero-' + (i + 1); }).join('\n');

Promise.all([
  correrPDF('Se da de baja 1 transpaleta marca Stax (N1) por trizaduras. No reparable.'),
  correrPDF(lineasLargas),
  correrPDF('')
]).then(function(r) {
  const corto = r[0], largo = r[1], vacio = r[2];

  chequear(corto.doc !== null, 'el generador devolvio null con un detalle normal');
  chequear(corto.dibujado.some(function(t) { return /BAJA DE ACTIVO/.test(t); }),
    'la hoja no lleva el titulo "BAJA DE ACTIVO" que Pedro pidio en el audio 5');
  chequear(corto.dibujado.some(function(t) { return /CECO/.test(t); }) &&
           corto.dibujado.some(function(t) { return /LOCAL/.test(t); }),
    'la hoja no trae el CECO y el nombre del local arriba');
  chequear(corto.dibujado.some(function(t) { return /FECHA/.test(t); }),
    'la hoja no trae la fecha');
  chequear(corto.dibujado.some(function(t) { return /ALVI CONCEPCION/.test(t); }),
    'el nombre del local no se imprime entero');

  // El invariante 5, medido: las 60 lineas se dibujan, ninguna se pierde.
  const dibujadasLargo = largo.dibujado.filter(function(t) { return /^linea-de-detalle-numero-/.test(t); });
  chequear(dibujadasLargo.length === 60,
    'de 60 lineas de detalle se dibujaron ' + dibujadasLargo.length + ': jsPDF recorta en silencio y el resto se pierde');
  chequear(largo.paginas > 1,
    'con un detalle largo no se abrio hoja de continuacion');
  chequear(dibujadasLargo[59] === 'linea-de-detalle-numero-60',
    'la ultima linea del detalle no llego a la hoja');

  // Una hoja sin detalle escrito sale igual, con sus lineas para llenar a mano.
  chequear(vacio.doc !== null && vacio.paginas === 1,
    'una baja sin texto escrito no genera su hoja: Pedro la pidio para rellenar a mano');

  if (fallos.length) {
    console.log('BAJA DE ACTIVO — ' + fallos.length + ' INVARIANTE(S) ROTO(S)\n' + fallos.join('\n'));
    process.exit(1);
  }
  console.log('BAJA DE ACTIVO — OK. La hoja no cotiza, no cobra, va firmada por las dos partes y no recorta el texto.');
}).catch(function(e) {
  console.log('BAJA DE ACTIVO — el guion murio antes de terminar: ' + (e && e.message));
  process.exit(1);
});
