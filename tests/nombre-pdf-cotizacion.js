/* Prueba de regresion — el PDF de una cotizacion sale con el nombre con que Pedro archiva.

   Pedido de Pedro, 14-08-2026. Formato:

       <N° cotizacion> HS <N° OT> <servicio> <local>.pdf
       31082601 HS 9464 Cambio de lamas Chillan 2.pdf

   El nombre viejo (`Cotizacion_<local>_<servicio>_<fecha>_<6 digitos>`) empezaba con la misma
   palabra en las 45 cotizaciones, asi que ordenar la carpeta por nombre no servia de nada.

   Lo que vigila este test, y por que cada cosa:

   1. EL FOLIO VA PRIMERO Y TAL CUAL. `numeroCotizacion` es ddmmaa + correlativo del dia, asignado
      UNA vez con transaccion (`_asignarNumeroCotizacion`). Este archivo no lo recalcula ni lo
      rearma: rearmarlo fue el bug del '01' hardcodeado que mando 39 cotizaciones con el mismo
      numero a los supervisores de SMU.
   2. SIN N° DE OT NO APARECE "HS" EN NINGUNA PARTE. Una cotizacion previa se emite antes de que
      exista la OT (`otNumero: ''`, puesto a proposito al guardar). Un "HS" suelto sin numero se
      lee como un dato que se perdio.
   3. SIN FOLIO EL HUECO SE VE. Si el contador no respondio, la cotizacion nace provisoria; el
      nombre dice 'SIN-NUMERO' para que se corrija ANTES de mandarla, no despues.
   4. EL NOMBRE TIENE QUE PODER SER UN ARCHIVO. La descripcion del trabajo es texto libre: basta
      un "cambio 1/2 pulgada" para que Windows y Android rechacen el archivo entero.
   5. RECORTAR LA CADENA NO PUEDE COMERSE EL LOCAL. Sin el catalogo cargado se devuelve el nombre
      completo — largo se entiende, cortado a medias no.
   6. `_urlDescargaCot` NO TOCA lo que no es de Cloudinary. Meterle una transformacion al link de
      la app lo rompe, y un link roto es peor que un nombre feo (caso #597587).

   Uso:  node tests/nombre-pdf-cotizacion.js index.html
   Sale 0 si los invariantes se sostienen; 1 si alguno se rompio. */

const fs = require('fs');
const ruta = process.argv[2] || 'index.html';
const src = fs.readFileSync(ruta, 'utf8');

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); }

// Recorta el texto de una funcion por llaves balanceadas.
function texto(nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  let j = src.indexOf('{', i), prof = 0, fin = -1;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (prof === 0) { fin = k + 1; break; } }
  }
  return fin < 0 ? null : src.slice(i, fin);
}

/* Las cuatro se llaman entre si, asi que se evaluan JUNTAS y en un scope propio con su `window`.
   Extraerlas de a una las dejaria sin sus dependencias y el test pasaria por la razon equivocada. */
const NOMBRES = ['_localSinCadena', '_recortarPalabras', '_nombrePDFCot', '_slugPDFCot', '_urlDescargaCot'];
const fuentes = NOMBRES.map(texto);
const faltan = NOMBRES.filter((n, i) => !fuentes[i]);
if (faltan.length) {
  console.error('No se encontro en ' + ruta + ': ' + faltan.join(', '));
  console.error('Si se renombraron, este test hay que revalidarlo — no solo arreglarlo.');
  process.exit(1);
}

const api = new Function('mapaCadenas',
  'var window = { _cadenasMapaCot: mapaCadenas };\n' +
  fuentes.join('\n\n') + '\n' +
  'return { ' + NOMBRES.map(n => n + ': ' + n).join(', ') + ' };'
);

// Catalogo tal como lo deja `cargarCotizaciones` en window._cadenasMapaCot: local -> doc de cadena.
const CATALOGO = {
  'S10 Chillan 2': { nombre: 'S10' },
  'Alvi Chillan': { nombre: 'Alvi' },
  'UNIMARC HIGUERAS': { nombre: 'UNIMARC' },
  'Chillan': { nombre: 'Chillan' }           // sucursal que se llama igual que su cadena
};
const F = api(CATALOGO);
const SIN_CATALOGO = api(undefined);

console.log('El PDF de la cotizacion sale con el nombre de Pedro\n');

// ── 1. El formato completo, con los datos reales de una cotizacion de produccion ─────────────
{
  const cot = {
    numeroCotizacion: '01082604', otNumero: 301143,
    nombreServicio: 'Correctivo transpaletas', local: 'Alvi Chillan'
  };
  const n = F._nombrePDFCot(cot);
  const esperado = '01082604 HS 301143 Correctivo transpaletas Chillan.pdf';
  chequear(n === esperado, 'nombre con OT: se esperaba "' + esperado + '" y salio "' + n + '"');
  console.log('1) Con N° de OT: ' + (n === esperado ? n + ' ✓' : 'salio "' + n + '" ✗'));
}

// ── 2. Cotizacion previa: sin OT, y sin rastro de "HS" ───────────────────────────────────────
{
  // Tal como la guarda el codigo: `otNumero: ''` explicito (no undefined).
  const previa = {
    numeroCotizacion: '01082604', otNumero: '', tipoCot: 'previa',
    nombreServicio: 'Cambio de lamas', local: 'S10 Chillan 2', cadena: 'S10'
  };
  const n = F._nombrePDFCot(previa);
  const esperado = '01082604 Cambio de lamas Chillan 2.pdf';
  const sinHS = !/\bHS\b/.test(n);
  chequear(n === esperado, 'previa: se esperaba "' + esperado + '" y salio "' + n + '"');
  chequear(sinHS, 'previa: el nombre trae "HS" sin numero -> "' + n + '"');
  // Y las otras formas en que puede llegar un otNumero vacio.
  [null, undefined, 0, '  '].forEach(function (v) {
    const r = F._nombrePDFCot(Object.assign({}, previa, { otNumero: v }));
    chequear(!/\bHS\b/.test(r), 'con otNumero=' + JSON.stringify(v) + ' aparecio "HS": "' + r + '"');
  });
  console.log('2) Previa sin OT: ' + (n === esperado && sinHS ? n + ' ✓' : 'salio "' + n + '" ✗'));
}

// ── 3. El folio se copia, no se rearma; y si falta, se ve ────────────────────────────────────
{
  const base = { otNumero: 9464, nombreServicio: 'Cambio de lamas', local: 'S10 Chillan 2', cadena: 'S10' };
  // El folio del documento manda aunque sea de otro dia: el archivo es del documento, no de hoy.
  const viejo = F._nombrePDFCot(Object.assign({}, base, { numeroCotizacion: '13072601' }));
  const respeta = viejo.indexOf('13072601 ') === 0;
  chequear(respeta, 'el folio del documento no quedo al principio: "' + viejo + '"');

  const sinFolio = F._nombrePDFCot(Object.assign({}, base, { numeroCotizacion: '' }));
  const seVe = sinFolio.indexOf('SIN-NUMERO') === 0;
  chequear(seVe, 'sin folio el nombre no lo delata: "' + sinFolio + '"');
  console.log('3) Folio: ' + (respeta && seVe ? 'se copia tal cual, y si falta se ve ✓' : 'se altera o se disimula ✗'));
}

// ── 4. El nombre tiene que poder ser un archivo ──────────────────────────────────────────────
{
  const cot = {
    numeroCotizacion: '01082604', otNumero: 9464, local: 'Alvi Chillan',
    descripcionTrabajo: 'Cambio llave 1/2" y sello: revision <urgente> | anden*'
  };
  const n = F._nombrePDFCot(cot);
  const prohibidos = /[\\/:*?"<>|]/.test(n);
  chequear(!prohibidos, 'el nombre trae caracteres que el sistema de archivos rechaza: "' + n + '"');
  chequear(!/\s{2,}/.test(n), 'el nombre quedo con espacios dobles: "' + n + '"');
  chequear(/\.pdf$/.test(n), 'el nombre no termina en .pdf: "' + n + '"');
  console.log('4) Texto libre: ' + (!prohibidos ? 'los caracteres prohibidos se limpian ✓' : 'se cuelan ✗'));
}

// ── 4b. Sin tildes ni ñ: fuera de ASCII, Cloudinary responde 400 y la descarga se ROMPE ──────
{
  // "Destape baño" es una descripcion real de produccion (cot 13072606). Con la ñ dentro del
  // fl_attachment, el HEAD del 14-08-2026 devolvia 400 e "inline" en vez del nombre.
  const cot = { numeroCotizacion: '13072606', otNumero: 9350,
                nombreServicio: 'Destape baño y reparación', local: 'UNIMARC PENUELAS' };
  const n = F._nombrePDFCot(cot);
  const soloAscii = /^[\x20-\x7E]+$/.test(n);
  chequear(soloAscii, 'el nombre trae caracteres fuera de ASCII (rompen la descarga): "' + n + '"');
  chequear(n.indexOf('Destape bano y reparacion') > 0, 'la normalizacion deformo el texto: "' + n + '"');
  console.log('4b) Tildes y ñ: ' + (soloAscii ? n + ' ✓' : 'se cuelan y rompen la descarga ✗'));
}

// ── 4c. La descripcion larga se recorta por palabra entera ───────────────────────────────────
{
  // Real: "Normalizacion circuito electrico y circuito d LOMAS SAN ANDRES" — cortado a mitad de
  // palabra el archivo se lee como corrupto.
  const cot = { numeroCotizacion: '10072601', otNumero: '', local: 'LOMAS SAN ANDRES',
                descripcionTrabajo: 'Normalizacion circuito electrico y circuito de fuerza del anden' };
  const n = F._nombrePDFCot(cot);
  const entero = !/\bd\s+LOMAS/.test(n) && n.indexOf('circuito ') > 0;
  chequear(entero, 'la descripcion quedo cortada a mitad de palabra: "' + n + '"');
  chequear(F._recortarPalabras('unapalabraexcesivamentelargasinespacios', 10).length <= 10,
    '_recortarPalabras no acota una palabra unica larguisima');
  console.log('4c) Descripcion larga: ' + (entero ? n + ' ✓' : 'corta a mitad de palabra ✗'));
}

// ── 5. Recortar la cadena no puede comerse el local ──────────────────────────────────────────
{
  const casos = [
    [['S10 Chillan 2', ''], 'Chillan 2', 'recorta la cadena del catalogo'],
    [['Alvi Chillan', 'Alvi'], 'Chillan', 'recorta la cadena que viene en el documento'],
    [['UNIMARC HIGUERAS', ''], 'HIGUERAS', 'recorta sin importar mayusculas'],
    [['Chillan', ''], 'Chillan', 'la sucursal que se llama igual que su cadena se deja entera'],
    [['S10Chillan', 'S10'], 'S10Chillan', 'sin espacio no es un prefijo: no se corta'],
    [['Bulnes', ''], 'Bulnes', 'local que no esta en el catalogo se deja igual'],
    [['', ''], '', 'vacio']
  ];
  let ok = true;
  casos.forEach(function (c) {
    const r = F._localSinCadena(c[0][0], c[0][1]);
    if (r !== c[1]) { ok = false; chequear(false, c[2] + ': "' + c[0][0] + '" -> "' + r + '", se esperaba "' + c[1] + '"'); }
  });
  // Sin catalogo cargado: nombre COMPLETO, nunca uno cortado a medias.
  const entero = SIN_CATALOGO._localSinCadena('S10 Chillan 2', '');
  chequear(entero === 'S10 Chillan 2', 'sin catalogo el local salio "' + entero + '" en vez del nombre completo');
  console.log('5) Local sin cadena: ' + (ok && entero === 'S10 Chillan 2' ? 'recorta solo el prefijo exacto ✓' : 'se come parte del local ✗'));
}

// ── 6. El local guardado en el documento gana sobre el catalogo ──────────────────────────────
{
  // `localCorto` se denormaliza al guardar justo para esto: el nombre del archivo no puede
  // depender de que la pantalla de cotizaciones se haya visitado antes en esta sesion.
  const cot = { numeroCotizacion: '01082604', otNumero: 9464, nombreServicio: 'Gasfiteria',
                local: 'S10 Chillan 2', localCorto: 'Chillan 2' };
  const conCat = F._nombrePDFCot(cot);
  const sinCat = SIN_CATALOGO._nombrePDFCot(cot);
  chequear(conCat === sinCat, 'la misma cotizacion sale con dos nombres: "' + conCat + '" y "' + sinCat + '"');
  console.log('6) Estabilidad: ' + (conCat === sinCat ? 'mismo nombre con y sin catalogo cargado ✓' : 'el nombre cambia segun la pantalla ✗'));
}

// ── 7. public_id sin espacios, y el nombre bueno viaja en fl_attachment ──────────────────────
{
  const cot = { numeroCotizacion: '01082604', otNumero: 301143,
                nombreServicio: 'Correctivo transpaletas', local: 'Alvi Chillan' };
  const slug = F._slugPDFCot(cot);
  const sinEspacios = !/\s/.test(slug) && slug.length > 0;
  chequear(sinEspacios, 'el public_id trae espacios: "' + slug + '"');

  const url = 'https://res.cloudinary.com/dcrf29tna/raw/upload/v1785636717/emval/cotizaciones/Cotizacion_Alvi_Chillan_x.pdf';
  const conNombre = F._urlDescargaCot({ pdfUrl: url, ...cot });
  const lleva = conNombre.indexOf('/raw/upload/fl_attachment:') > 0 &&
                conNombre.indexOf('01082604%20HS%20301143') > 0 &&
                conNombre.endsWith('/v1785636717/emval/cotizaciones/Cotizacion_Alvi_Chillan_x.pdf');
  chequear(lleva, 'la URL de descarga no lleva el nombre: "' + conNombre + '"');

  // Lo que NO es de Cloudinary se devuelve intacto: el link a la app se rompe con cualquier
  // transformacion, y ese fue el 404 que le llego a SMU en la #597587.
  const linkApp = 'https://desarrollobastian-design.github.io/emval-app/?pdf=KRUvZwab3Zb7QeebOBdv';
  const intacto = F._urlDescargaCot({ pdfUrl: linkApp, ...cot }) === linkApp;
  chequear(intacto, 'el link a la app fue modificado por _urlDescargaCot');
  chequear(F._urlDescargaCot({}) === '', 'sin pdfUrl no devolvio vacio');
  console.log('7) Descarga: ' + (sinEspacios && lleva && intacto ? 'public_id limpio + nombre por fl_attachment ✓' : 'algo se rompio ✗'));
}

// ── 8. El generador huerfano no reinventa el formato ─────────────────────────────────────────
{
  // `generarPDFCotizacion` hoy no la llama nadie, pero tenia SU PROPIA version del nombre (decia
  // "OT" donde el resto dice "HS"). Si alguien la reconecta, tiene que salir el mismo nombre.
  const i = src.indexOf('async function generarPDFCotizacion(');
  chequear(i > 0, 'no se encontro generarPDFCotizacion en ' + ruta);
  const bloque = i > 0 ? src.slice(i) : '';
  const usaLaComun = /doc\.save\(\s*_nombrePDFCot\(/.test(bloque);
  chequear(usaLaComun, 'generarPDFCotizacion volvio a armar su propio nombre en vez de usar _nombrePDFCot');
  console.log('8) Generador huerfano: ' + (usaLaComun ? 'usa el mismo nombre que el resto ✓' : 'tiene su propio formato ✗'));
}

console.log('');
if (fallos.length) {
  console.error('FALLOS:\n' + fallos.join('\n'));
  process.exit(1);
}
console.log('OK — el nombre del PDF de cotizacion se sostiene.');
