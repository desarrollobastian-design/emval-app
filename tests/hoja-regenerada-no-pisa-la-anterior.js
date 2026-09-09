#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════════════════════
   LA HOJA REGENERADA NO PISA A LA ANTERIOR — caso cotizacion 19082601 / OT 347723, 09-09-2026

   Pedro: "necesito corregir el texto ya que no fue lo que yo escribi". La app YA tenia el
   camino (`editarOTTerminada` → Guardar cambios) y ese camino no cumplia: el `public_id` de la
   hoja era determinista y SIN version, y el preset `emval_pdf` NO SOBRESCRIBE.

   📊 Medido contra produccion el 09-09-2026: la OT 9016 subio su hoja DOS veces —`pdfs`
   PInGX4gjKyJNIVyeG73G (07-jul 21:16:45) y JJIPqSEjf2Qykly785wY (09-jul 01:53:00, 28,6 h
   despues)— y los dos registros guardan la MISMA version `v1783459002`. El archivo responde
   `Last-Modified: 07 Jul 2026 21:16:43`, 86.502 bytes: la segunda subida no cambio un byte.

   Resultado para el cliente: el texto quedaba corregido en Firestore, la app decia
   "OT actualizada ✓", y Cloudinary seguia sirviendo el PDF viejo por la misma URL — la que ya
   tiene SMU. Y como `verPDFById` prefiere `pdfUrlCloudinary`, el texto corregido no se veia NI
   dentro de la app.

   Lo que este guion vigila, y por que cada cosa:
     1. Un cierre normal produce EXACTAMENTE el id de siempre — las ~253 hojas ya subidas
        conservan su URL, y con ella el barrido de huerfanos de CLAUDE.md y el rescate del 484304.
     2. Regenerar produce un id DISTINTO. Es el bug entero.
     3. Dos regeneraciones seguidas no chocan entre si.
     4. El sufijo es DETERMINISTA: nada de Date.now() ni random, o las dos redes de rescate
        —que derivan la URL con solo el documento en la mano— quedan ciegas.
     5. La generacion se congela en el snap ANTES del primer await (regla del proyecto).
     6. La generacion se PERSISTE, o la segunda edicion vuelve a pedir `_v2` y rebota.
     7. `nuevaOT()` la resetea, o la OT siguiente nace con `_v2` sin que nadie la regenerara.
     8. Los sitios que suben la hoja usan la MISMA funcion, no una copia pegada.

   Uso:  node tests/hoja-regenerada-no-pisa-la-anterior.js index.html
   ═══════════════════════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const archivo = process.argv[2] || path.join(__dirname, '..', 'index.html');
// Normalizado a LF como en el resto de los guiones: index.html viene con CRLF y los marcadores
// de extraccion llevan '\n\n' — sin esto, todo marcador de dos saltos falla en silencio.
const src = fs.readFileSync(archivo, 'utf8').replace(/\r\n/g, '\n');

let okN = 0, malN = 0;
function ok(m) { okN++; console.log('  ok  ' + m); }
function mal(m, det) { malN++; console.log('  MAL ' + m + (det ? '\n        ' + String(det).replace(/\n/g, '\n        ') : '')); }
function bloque(t) { console.log('\n' + t); }

function extraer(desde, hasta) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('No se encontro: ' + desde);
  const j = src.indexOf(hasta, i + desde.length);
  if (j < 0) throw new Error('No se encontro el fin de: ' + desde);
  return src.slice(i, j);
}

/* Despojador de comentarios. El codigo de este proyecto EXPLICA lo que no se debe hacer —este
   fix trae escrito "NO se usa Date.now() como sufijo"— asi que un test que busque sobre el texto
   crudo se dispara con la propia advertencia que existe para evitar el bug. Misma leccion que en
   baja-de-activo-no-cobra.js. */
/* ⚠️ El bloque solo cuenta si el `/*` ABRE la linea. No es cosmetica: index.html:829 tiene un
   `accept="image/*"` en el HTML, y con el despojador ingenuo —el que usan los otros guiones de
   `tests/`— ese `/*` abre un comentario falso que se come 1.070 lineas (829 a 1899, hasta el
   primer `*​/` real). Todo chequeo estructural sobre ese rango mira un archivo vacio y pasa
   siempre. Aca cae justo `_cargarEstadoDesdeOTGuardada`, que es lo que este guion tiene que
   vigilar. Los comentarios de bloque de este proyecto abren linea; el atributo HTML no. */
function sinComentarios(txt) {
  return txt.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Se extrae el codigo REAL de index.html. Si alguien renombra una de estas funciones el guion se
// cae con "No se encontro", y eso es a proposito: avisa que el fix hay que revalidarlo.
// ─────────────────────────────────────────────────────────────────────────────────────────────
let codNombre, codIds;
try {
  codNombre = extraer('function _nombreArchivoPDF(snap)', '\n\n/* ─── RESCATE');
  codIds    = extraer('function _sufijoGenPDF(gen)', '\n// Devuelve la URL SOLO si');
} catch (e) {
  console.log('\nFALLA: no se pudo extraer el codigo del fix — ' + e.message);
  console.log('       Contra el codigo anterior al 09-09-2026 estas funciones NO EXISTEN: la hoja');
  console.log('       regenerada volveria a rebotar contra el archivo viejo de Cloudinary.');
  process.exit(1);
}

const sandbox = {};
try {
  // `estado` existe solo como red del fallback de _nombreArchivoPDF; los tests siempre pasan snap.
  new Function('sandbox', 'var estado = {};\n' + codNombre + '\n' + codIds + '\n' +
    'sandbox._nombreArchivoPDF = _nombreArchivoPDF;' +
    'sandbox._sufijoGenPDF = _sufijoGenPDF;' +
    'sandbox._nombrePublicIdPDF = _nombrePublicIdPDF;' +
    'sandbox._publicIdPDFCloudinary = _publicIdPDFCloudinary;')(sandbox);
} catch (e) {
  console.log('\nFALLA: el codigo extraido no corre — ' + e.message);
  process.exit(1);
}

const LIMPIO = sinComentarios(src);

console.log('═'.repeat(94));
console.log('LA HOJA REGENERADA NO PISA A LA ANTERIOR — ' + path.basename(archivo));
console.log('═'.repeat(94));

// ═════════════════════════════════════════════════════════════════════════════════════════════
bloque('1 · Las hojas que YA estan arriba conservan su URL exacta');
// ═════════════════════════════════════════════════════════════════════════════════════════════
{
  // Los tres ids son de produccion, leidos de `ordenes.pdfUrlCloudinary` el 09-09-2026.
  const REALES = [
    { snap: { tipo: 'correctivo', otNumero: 347723, clientId: 'ot_mtrhpajk_eepszxb' },
      id: 'emval/pdfs/Recepcion_Obra_OT347723_eepszxb.pdf' },
    { snap: { tipo: 'correctivo', otNumero: 571937, clientId: 'ot_mtrhtv2h_v5a0iy1' },
      id: 'emval/pdfs/Recepcion_Obra_OT571937_v5a0iy1.pdf' },
    { snap: { tipo: 'correctivo', otNumero: 484304, clientId: 'ot_mtm21do0_83gl1f0' },
      id: 'emval/pdfs/Recepcion_Obra_OT484304_83gl1f0.pdf' },
  ];
  let todas = true;
  REALES.forEach(function (r) {
    const got = sandbox._publicIdPDFCloudinary(r.snap);
    if (got !== r.id) { todas = false; mal('la OT ' + r.snap.otNumero + ' cambio de URL', 'ahora: ' + got + '\n        antes: ' + r.id); }
  });
  if (todas) ok('las 3 URL reales de produccion salen identicas (sin pdfGen = generacion 1)');

  // Y explicitamente con pdfGen: 1, que es lo que pone el cierre normal.
  const g1 = sandbox._publicIdPDFCloudinary({ tipo: 'correctivo', otNumero: 347723, clientId: 'ot_mtrhpajk_eepszxb', pdfGen: 1 });
  if (g1 !== 'emval/pdfs/Recepcion_Obra_OT347723_eepszxb.pdf') {
    mal('la generacion 1 le agrega sufijo — las hojas viejas quedarian sin URL derivable', g1);
  } else ok('la generacion 1 NO lleva sufijo: el barrido de huerfanos sigue funcionando');

  // La hoja de preventivo lleva otro nombre y tambien tiene que respetarlo.
  const prev = sandbox._publicIdPDFCloudinary({ tipo: 'preventivo', otNumero: 305239, ceco: '747', clientId: 'ot_abcdefg_hijklmn' });
  if (!/^emval\/pdfs\/747-HS 305239-MP Transpaletas .+ \d{4}_hijklmn\.pdf$/.test(prev)) {
    mal('el preventivo perdio su formato de nombre', prev);
  } else ok('el preventivo conserva su nombre (el unico indicio confiable del tipo)');
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
bloque('2 · Regenerar produce un archivo NUEVO — el bug entero');
// ═════════════════════════════════════════════════════════════════════════════════════════════
{
  const base = { tipo: 'correctivo', otNumero: 347723, clientId: 'ot_mtrhpajk_eepszxb' };
  const v1 = sandbox._publicIdPDFCloudinary(Object.assign({}, base, { pdfGen: 1 }));
  const v2 = sandbox._publicIdPDFCloudinary(Object.assign({}, base, { pdfGen: 2 }));
  const v3 = sandbox._publicIdPDFCloudinary(Object.assign({}, base, { pdfGen: 3 }));

  if (v2 === v1) mal('regenerar apunta al MISMO archivo: Cloudinary devuelve el viejo y SMU no ve la correccion', v2);
  else ok('la 2a generacion tiene id propio  → ' + v2.replace('emval/pdfs/', ''));

  if (v3 === v2 || v3 === v1) mal('la 3a generacion choca con una anterior', v3);
  else ok('la 3a generacion tambien  → ' + v3.replace('emval/pdfs/', ''));

  // El sufijo no puede colarse en medio del nombre ni romper la extension.
  if (!/\.pdf$/.test(v2)) mal('el id regenerado ya no termina en .pdf', v2);
  else ok('sigue terminando en .pdf');

  if (v2.indexOf('Recepcion_Obra_OT347723_eepszxb') !== 0 &&
      v2.indexOf('emval/pdfs/Recepcion_Obra_OT347723_eepszxb') !== 0) {
    mal('el id regenerado ya no arranca con el nombre + clientId: el rescate no lo puede derivar', v2);
  } else ok('conserva numero y clientId: sigue siendo derivable desde el documento');
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
bloque('3 · El sufijo es DETERMINISTA, o las dos redes de rescate quedan ciegas');
// ═════════════════════════════════════════════════════════════════════════════════════════════
{
  /* `_urlPDFSiYaEsta` (caso 484304) y el barrido de huerfanos de CLAUDE.md derivan la URL con
     solo el documento en la mano. Un sufijo aleatorio —como el que SI usa la cotizacion, que
     guarda su id y no lo vuelve a calcular— los deja sin poder reconstruir nada. */
  const snap = { tipo: 'correctivo', otNumero: 347723, clientId: 'ot_mtrhpajk_eepszxb', pdfGen: 2 };
  const a = sandbox._publicIdPDFCloudinary(snap);
  const b = sandbox._publicIdPDFCloudinary(snap);
  const c = sandbox._publicIdPDFCloudinary(Object.assign({}, snap));
  if (a !== b || b !== c) mal('el mismo snap da dos ids distintos: el sufijo no es determinista', a + ' vs ' + b + ' vs ' + c);
  else ok('el mismo snap da siempre el mismo id');

  const cuerpo = sinComentarios(codIds);
  if (/Date\.now\(|Math\.random\(|new Date\(/.test(cuerpo)) {
    mal('el id de la hoja se arma con reloj o azar: deja de ser derivable',
      (cuerpo.match(/.*(Date\.now\(|Math\.random\(|new Date\().*/) || [])[0]);
  } else ok('no hay reloj ni azar en la construccion del id');
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
bloque('4 · Solo REGENERAR sube la generacion');
// ═════════════════════════════════════════════════════════════════════════════════════════════
{
  const m = LIMPIO.match(/snap\.pdfGen\s*=\s*([^\n;]+);/);
  if (!m) mal('no se encontro donde se calcula snap.pdfGen');
  else {
    const expr = m[1];
    if (!/editandoOTId/.test(expr)) {
      mal('la generacion no depende de si esto es una edicion: un cierre normal subiria a _v2', expr.trim());
    } else ok('solo sube cuando hay editandoOTId (un cierre normal siempre es la generacion 1)');

    if (!/\+\s*1/.test(expr)) mal('la generacion no se incrementa', expr.trim());
    else ok('la edicion incrementa en 1');
  }

  // Y la generacion tiene que salir del documento, no de un contador global.
  if (!/estado\.pdfHojaGen\s*=\s*Number\(ot\.pdfHojaGen\)/.test(LIMPIO) &&
      !/estado\.pdfHojaGen\s*=\s*[^\n;]*ot\.pdfHojaGen/.test(LIMPIO)) {
    mal('la generacion no se lee de la OT guardada al abrirla para editar');
  } else ok('se lee de la OT guardada al abrirla');
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
bloque('5 · La generacion se congela ANTES del primer await');
// ═════════════════════════════════════════════════════════════════════════════════════════════
{
  /* Regla del proyecto (`estado-global-pisado-por-la-ot-siguiente`): `estado` es global y esta
     funcion la arranca cerrarOT con un setTimeout sin await. Leer estado.pdfHojaGen despues de
     subir a Cloudinary lo lee de la OT SIGUIENTE. */
  const fn = LIMPIO.slice(LIMPIO.indexOf('async function guardarYEnviarPDF()'));
  const hastaAwait = fn.slice(0, fn.indexOf('await'));
  if (hastaAwait.indexOf('snap.pdfGen') < 0) {
    mal('snap.pdfGen se calcula DESPUES del primer await: puede quedar con la generacion de otra OT');
  } else ok('snap.pdfGen se calcula dentro de la instantanea, antes del primer await');

  /* Y despues de esa sentencia nadie puede volver a leer estado.pdfHojaGen. Se corta DESPUES del
     `;` que la cierra: la propia asignacion lee `estado.pdfHojaGen`, que es lo correcto — es el
     acto de congelarlo. */
  const iAsig = fn.indexOf('snap.pdfGen');
  const cuerpoTrasSnap = fn.slice(fn.indexOf(';', iAsig) + 1);
  if (/estado\.pdfHojaGen/.test(cuerpoTrasSnap)) {
    mal('se vuelve a leer estado.pdfHojaGen despues de congelarlo');
  } else ok('despues de congelarlo se usa snap.pdfGen y nunca estado');
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
bloque('6 · La generacion queda PERSISTIDA, o la segunda correccion rebota igual');
// ═════════════════════════════════════════════════════════════════════════════════════════════
{
  /* TODA escritura que enlace el PDF tiene que llevar la generacion — no "alguna". Son dos: el
     enlace por clientId y el fallback legacy por numero. Contar >= 1 dejaba pasar que una de las
     dos se quedara sin ella, y entonces la OT que cae en ese camino repite `_v2` y rebota. */
  const fnPDF = LIMPIO.slice(LIMPIO.indexOf('async function guardarYEnviarPDF()'));
  const cuerpoPDF = fnPDF.slice(0, fnPDF.indexOf('\nasync function '));
  const enlaces = [...cuerpoPDF.matchAll(/pdfUrl:\s*pdfUrlFirestore/g)].map(m => m.index);
  if (enlaces.length < 2) {
    mal('se esperaban 2 escrituras de enlace (normal + legacy)', 'encontradas: ' + enlaces.length);
  } else {
    const sinGen = enlaces.filter(i => cuerpoPDF.slice(i, i + 320).indexOf('pdfHojaGen') < 0);
    if (sinGen.length) {
      mal(sinGen.length + ' de las ' + enlaces.length + ' escrituras de enlace no llevan la generacion',
        'la OT que caiga en ese camino vuelve a pedir _v2 y rebota contra el archivo viejo');
    } else ok('las ' + enlaces.length + ' escrituras de enlace la llevan (normal y legacy)');
  }

  /* Tiene que ir junto al enlace del PDF, no en una escritura aparte que puede fallar sola.
     El ancla es CODIGO (`const _otDocId = ...`), no el comentario que lo encabeza: un guion
     anclado a un comentario se cae el dia que alguien lo reescribe, y peor, pasa en silencio. */
  const iEnlace = LIMPIO.indexOf('const _otDocId = snap.editandoOTId');
  if (iEnlace < 0) mal('no se encontro el bloque que enlaza el PDF en la orden');
  else {
    const trozo = LIMPIO.slice(iEnlace, iEnlace + 900);
    if (!/pdfUrlCloudinary/.test(trozo)) mal('el bloque encontrado no es el del enlace');
    else if (trozo.indexOf('pdfHojaGen') < 0) {
      mal('la generacion no viaja en la misma escritura que pdfUrl/pdfUrlCloudinary');
    } else ok('viaja en la misma escritura que el enlace: o quedan los dos, o no queda ninguno');
  }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
bloque('7 · La OT siguiente no hereda la generacion de la que se acaba de editar');
// ═════════════════════════════════════════════════════════════════════════════════════════════
{
  const nueva = LIMPIO.slice(LIMPIO.indexOf('function nuevaOT()'));
  const cuerpo = nueva.slice(0, nueva.indexOf('\n}'));
  if (!/estado\.pdfHojaGen\s*=\s*1/.test(cuerpo)) {
    mal('nuevaOT() no resetea la generacion: la hoja siguiente nacer1a como _v2 sin que nadie la regenerara');
  } else ok('nuevaOT() la vuelve a 1');

  // Y el objeto `estado` inicial tambien, para el primer cierre despues de abrir la app.
  if (!/pdfHojaGen:\s*1/.test(LIMPIO)) mal('el estado inicial no declara pdfHojaGen');
  else ok('el estado inicial arranca en 1');
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
bloque('8 · Un solo sitio arma el nombre: ninguna copia pegada');
// ═════════════════════════════════════════════════════════════════════════════════════════════
{
  const subidas = [...LIMPIO.matchAll(/formData\.append\('public_id',([^\n]+)\);/g)].map(m => m[1].trim());
  if (subidas.length < 2) {
    mal('se esperaban al menos 2 sitios que suban la hoja (cierre online + cola offline)', 'encontrados: ' + subidas.length);
  } else {
    const pegadas = subidas.filter(s => !/_nombrePublicIdPDF\(/.test(s));
    if (pegadas.length) mal('hay ' + pegadas.length + ' subida(s) que arman el id por su cuenta', pegadas.join('\n        '));
    else ok('los ' + subidas.length + ' sitios que suben pasan por _nombrePublicIdPDF');
  }

  // La cola offline sube OT que nunca se editaron: siempre generacion 1, o le cambia la URL a
  // una hoja que se cerro sin senal.
  const cola = LIMPIO.slice(LIMPIO.indexOf('async function _subirPDFaCloudinary'));
  const cuerpoCola = cola.slice(0, cola.indexOf('\n}'));
  if (!/pdfGen:\s*1/.test(cuerpoCola)) {
    mal('la cola offline no fija la generacion 1: una hoja subida desde la cola podria cambiar de URL');
  } else ok('la cola offline sube siempre la generacion 1');
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
bloque('9 · Lo que ya estaba y no se puede perder');
// ═════════════════════════════════════════════════════════════════════════════════════════════
{
  // Sin clientId no se deriva nada: mejor vacio que un nombre a medias que da 404 (caso 597587).
  if (sandbox._publicIdPDFCloudinary({ tipo: 'correctivo', otNumero: 1 }) !== '') {
    mal('deriva un public_id sin clientId');
  } else ok('sin clientId sigue devolviendo vacio');

  if (sandbox._publicIdPDFCloudinary(null) !== '') mal('con snap nulo no devuelve vacio');
  else ok('con snap nulo devuelve vacio');

  /* Pero la guardia vive SOLO en el derivador. `_nombrePublicIdPDF` arma el nombre y punto: si le
     ponen la misma guardia, la cola offline —que llama con el clientId que traiga el item— pasaria
     a subir con `public_id` vacio y Cloudinary le inventaria un nombre aleatorio, irrecuperable
     para el barrido de huerfanos. Son dos preguntas distintas: "¿puedo DERIVAR la URL?" y
     "¿como se llama el archivo?". */
  const sinCliente = sandbox._nombrePublicIdPDF({ tipo: 'correctivo', otNumero: 9016, pdfGen: 1 });
  if (!sinCliente || sinCliente.indexOf('Recepcion_Obra_OT9016') !== 0) {
    mal('_nombrePublicIdPDF se quedo sin nombre cuando falta el clientId: la cola subiria con public_id vacio',
      JSON.stringify(sinCliente));
  } else ok('el armador de nombre NO tiene la guardia del derivador (la cola conserva su id)');

  // El sufijo tiene que aguantar basura sin romper el nombre.
  const raros = [undefined, null, 0, -1, '', 'x', NaN, 1.5];
  const malos = raros.filter(function (g) { return sandbox._sufijoGenPDF(g) !== ''; });
  if (malos.length) mal('un valor no valido genera sufijo', JSON.stringify(malos));
  else ok('generaciones invalidas (null, 0, "x", NaN…) no generan sufijo: cae a la URL de siempre');

  if (sandbox._sufijoGenPDF(2) !== '_v2' || sandbox._sufijoGenPDF('3') !== '_v3') {
    mal('el sufijo no tiene el formato esperado', sandbox._sufijoGenPDF(2) + ' / ' + sandbox._sufijoGenPDF('3'));
  } else ok('el sufijo es _v2, _v3… (tambien si llega como string)');

  // El Service Worker tiene que subir, o Pedro corrige el texto en la version cacheada —la que
  // NO tiene el fix— y la hoja vuelve a rebotar sin que nadie entienda por que.
  try {
    const sw = fs.readFileSync(path.join(path.dirname(archivo) || '.', 'sw.js'), 'utf8');
    const m = sw.match(/emval-v(\d+)/);
    if (!m || parseInt(m[1], 10) < 54) {
      mal('el Service Worker no subio de version (' + (m ? m[0] : '?') + ')',
        'Sin eso el telefono sigue sirviendo el index.html cacheado y el fix no llega.');
    } else ok('Service Worker en ' + m[0]);
  } catch (e) { mal('no se pudo leer sw.js', e.message); }
}

console.log('\n' + '─'.repeat(94));
console.log(okN + ' comprobaciones ok, ' + malN + ' fallidas');
if (malN) {
  console.log('\nFALLA: una hoja corregida puede volver a rebotar contra el PDF viejo de Cloudinary.');
  console.log('       Es el caso de la OT 347723: el texto queda bien y SMU sigue viendo el anterior.');
  process.exit(1);
}
console.log('\nOK: regenerar la hoja produce un archivo nuevo, las hojas ya subidas conservan su URL,');
console.log('    y el id sigue siendo derivable con solo el documento en la mano.');
