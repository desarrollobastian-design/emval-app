/* Prueba de regresion — cuando una foto se rechaza, el mensaje tiene que decir POR QUE.

   Caso real, 21-08-2026, turno nocturno. Pedro, por don Nelson (Samsung Galaxy S21):
   "hay una pura foto que me logra cargar (...) acabo de tomar como cinco fotos distintas y no
   me carga ninguna. Si son fotos de WhatsApp, tampoco". La app le contestaba SIEMPRE lo mismo:
   "No se pudo procesar la imagen. Usa una foto JPG/PNG (evita HEIC)".

   Ese texto era un cajon de sastre: salia igual si la foto era HEIC, si el archivo llego vacio
   por falta de espacio, si el decodificador del telefono murio o si el canvas no se pudo
   exportar. Y encima apuntaba a HEIC, que era la causa MENOS probable en ese equipo — una foto
   bajada de WhatsApp es JPEG siempre. El unico detalle real iba a console.warn, que nadie ve
   parado en un local a las 2 de la manana.

   Se vigila ademas el bug latente que aparecio arreglando esto: toDataURL no lanza cuando el
   canvas no se puede exportar, devuelve "data:," — un string truthy que pasaba el `if (!data)`
   y se guardaba COMO SI FUERA UNA FOTO. Esa foto sale en blanco en la hoja que recibe SMU, y
   para cuando alguien lo nota el tecnico ya se fue del local.

   Uso:  node tests/la-foto-rechazada-dice-por-que.js index.html
   Sale 0 si el mensaje distingue las causas; 1 si vuelve a ser un texto unico. */

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); }

// ── Se extraen los helpers REALES del archivo, no una copia ──────────────────────────────────
const iniH = src.indexOf('function _pesoArchivoFoto');
const finH = src.indexOf('// Compress image - si es URL externa');
if (iniH < 0 || finH < 0 || finH < iniH) {
  console.error('No se encontro el bloque de helpers de diagnostico en index.html');
  process.exit(1);
}
const helpers = src.slice(iniH, finH);
const H = new Function(helpers + '\nreturn { _pesoArchivoFoto, _esFotoHEIC, _esDataURLImagen, _motivoFotoRechazada };')();

// La duracion del toast tambien se lee del codigo: si alguien cambia la formula o el techo,
// esta prueba tiene que enterarse. Medir con una copia seria medir otra cosa.
const iniT = src.indexOf('var TOAST_MIN_MS');
const finT = src.indexOf('/* EL TOAST NO PUEDE TAPAR LAS BARRAS DE ESTADO.');
const T = new Function(src.slice(iniT, finT) + '\nreturn { _toastDuracion, TOAST_MAX_MS };')();

// Un data URL JPEG minimo pero real (mas de 128 caracteres, como uno de verdad).
const DATAURL_OK = 'data:image/jpeg;base64,' + 'A'.repeat(200);

console.log('La foto rechazada tiene que decir por que\n');

// ── 1. Archivo vacio: es espacio/permisos, NO formato ────────────────────────────────────────
{
  const msg = H._motivoFotoRechazada({ type: 'image/jpeg', size: 0, name: 'IMG_001.jpg' }, { paso: 'bitmap' });
  const hablaDeEspacio = /espacio/i.test(msg);
  const culpaAlFormato = /HEIC|HEIF|JPG\/PNG/i.test(msg);
  console.log('1) Archivo de 0 bytes → ' + (hablaDeEspacio && !culpaAlFormato ? 'habla de espacio ✓' : 'sigue culpando al formato ✗'));
  chequear(hablaDeEspacio, 'un archivo vacio no menciona el espacio del telefono: ' + msg);
  chequear(!culpaAlFormato, 'un archivo vacio sigue culpando al formato, que es la pista falsa del caso Nelson');
}

// ── 2. HEIC de verdad: ahi si, y con la instruccion concreta del Samsung ─────────────────────
{
  const msg = H._motivoFotoRechazada({ type: 'image/heic', size: 3145728, name: 'IMG_002.heic' }, { paso: 'bitmap' });
  const dice = /HEIF|HEIC/.test(msg) && /Formatos avanzados|ajustes/i.test(msg);
  console.log('2) Foto HEIC real → ' + (dice ? 'dice donde apagarlo ✓' : 'no dice que hacer ✗'));
  chequear(dice, 'con un HEIC real el mensaje no indica donde apagar el formato: ' + msg);
}

// ── 3. HEIC sin MIME declarado — varios proveedores de galeria de Android no lo declaran ─────
{
  const msg = H._motivoFotoRechazada({ type: '', size: 2500000, name: 'PXL_20260821_014233.HEIC' }, {});
  console.log('3) HEIC sin MIME (galeria Android) → ' + (/HEIF/.test(msg) ? 'lo reconoce por extension ✓' : 'se le escapa ✗'));
  chequear(/HEIF|HEIC/.test(msg), 'un HEIC sin MIME declarado cae en el mensaje generico');
  chequear(H._esFotoHEIC({ type: '', name: 'foto.HEIC' }), '_esFotoHEIC no reconoce la extension cuando el MIME viene vacio');
  chequear(H._esFotoHEIC({ type: 'image/heif', name: '' }), '_esFotoHEIC no reconoce el MIME heif');
  chequear(!H._esFotoHEIC({ type: 'image/jpeg', name: 'foto.jpg' }), '_esFotoHEIC marca como HEIC un JPEG normal');
}

// ── 4. JPEG normal que falla: no se inventa una causa, se entrega la ficha ───────────────────
{
  const msg = H._motivoFotoRechazada({ type: 'image/jpeg', size: 4194304, name: 'WhatsApp Image.jpg' }, { paso: 'decode' });
  const inventa = /HEIC|HEIF/.test(msg);
  const traeFicha = msg.indexOf('image/jpeg') >= 0 && msg.indexOf('4.0 MB') >= 0 && msg.indexOf('decode') >= 0;
  console.log('4) JPEG de WhatsApp que falla → ' + (!inventa && traeFicha ? 'ficha sin inventar causa ✓' : 'inventa o no informa ✗'));
  chequear(!inventa, 'a un JPEG se le sigue diciendo que evite HEIC — el error que costo el caso Nelson');
  chequear(traeFicha, 'el mensaje no trae tipo, peso y paso para Soporte: ' + msg);
}

// ── 5. La ficha va en las TRES causas, no solo en la desconocida ─────────────────────────────
{
  const casos = [
    { type: 'image/jpeg', size: 0, name: 'a.jpg' },
    { type: 'image/heic', size: 3000000, name: 'b.heic' },
    { type: 'image/png', size: 900000, name: 'c.png' }
  ];
  const todas = casos.every(function(f) {
    const m = H._motivoFotoRechazada(f, { paso: 'bitmap' });
    return m.indexOf('[') >= 0 && m.indexOf(f.type) >= 0 && m.indexOf('bitmap') >= 0;
  });
  console.log('5) Ficha tecnica en las 3 causas → ' + (todas ? 'siempre ✓' : 'falta en alguna ✗'));
  chequear(todas, 'alguna causa no entrega la ficha: Soporte vuelve a quedar sin el dato');
}

// ── 6. El bug latente: "data:," no es una foto ───────────────────────────────────────────────
{
  const rechaza = !H._esDataURLImagen('data:,') && !H._esDataURLImagen('') &&
                  !H._esDataURLImagen(null) && !H._esDataURLImagen('data:image/jpeg;base64,AAA');
  const acepta = H._esDataURLImagen(DATAURL_OK);
  console.log('6) toDataURL devuelve "data:," → ' + (rechaza && acepta ? 'se rechaza ✓' : 'se guardaria como foto ✗'));
  chequear(rechaza, '"data:," pasa como foto valida: la hoja del cliente sale con un recuadro en blanco');
  chequear(acepta, 'un data URL bueno se esta rechazando');
}

// ── 7. procesarFoto valida el CONTENIDO, no solo que haya algo ───────────────────────────────
{
  const i = src.indexOf('async function procesarFoto');
  const bloque = src.slice(i, i + 1800);
  const valida = /_esDataURLImagen\(data\)/.test(bloque);
  const textoUnico = /No se pudo procesar la imagen\. Usa una foto JPG\/PNG/.test(bloque);
  const pasaDiag = /comprimirArchivoImagen\(file,\s*1200,\s*0\.72,\s*diag\)/.test(bloque);
  console.log('7) procesarFoto → ' + (valida && !textoUnico && pasaDiag ? 'valida, diagnostica y reporta ✓' : 'volvio al texto unico ✗'));
  chequear(valida, 'procesarFoto volvio a aceptar cualquier cosa truthy en vez de validar el data URL');
  chequear(!textoUnico, 'volvio el mensaje unico "usa JPG/PNG (evita HEIC)" para todas las causas');
  chequear(pasaDiag, 'procesarFoto ya no le pasa `diag` al compresor: el mensaje pierde el paso que fallo');
}

// ── 8. El compresor marca el paso donde murio, y sigue siendo retrocompatible ────────────────
{
  const i = src.indexOf('async function comprimirArchivoImagen');
  const bloque = src.slice(i, src.indexOf('async function comprimirImagen'));
  const pasos = ['bitmap', 'canvas', 'lectura'].filter(function(p) { return bloque.indexOf("diag.paso = '" + p + "'") >= 0; });
  const limpia = /diag\.paso = ''/.test(bloque);
  const opcional = /diag = diag \|\| \{\}/.test(bloque);
  const cortaCanvasVacio = /_esDataURLImagen\(salida\)/.test(bloque);
  console.log('8) comprimirArchivoImagen → ' + pasos.length + '/3 pasos marcados' + (limpia ? ', se limpia al exito ✓' : ' ✗'));
  chequear(pasos.length === 3, 'faltan pasos por marcar (' + pasos.join(', ') + '): el mensaje no dira donde murio');
  chequear(limpia, 'el paso no se limpia al exito: una foto buena arrastraria la etiqueta de un fallo anterior');
  chequear(opcional, '`diag` dejo de ser opcional: los llamadores que no lo pasan se caerian');
  chequear(cortaCanvasVacio, 'ya no se valida la salida del canvas: vuelve a poder devolver "data:," como foto');
}

// ── 9. comprimirImagen sigue aceptando 3 argumentos (los otros 12 sitios) ────────────────────
{
  const m = src.match(/async function comprimirImagen\(([^)]*)\)/);
  const params = m ? m[1] : '';
  const ok = /dataUrl/.test(params) && /diag/.test(params) && params.indexOf('diag') > params.indexOf('quality');
  const guarda = /if \(diag\) diag\.paso = 'decode'/.test(src);
  console.log('9) comprimirImagen(' + params + ') → ' + (ok && guarda ? 'diag va al final y protegido ✓' : 'rompe a los otros llamadores ✗'));
  chequear(ok, '`diag` no es el ultimo parametro de comprimirImagen: los 12 sitios que llaman con 3 argumentos se romperian');
  chequear(guarda, 'se toca diag sin comprobar que exista: los llamadores que no lo pasan reventarian en el onerror');
}

// ── 10. Los tres mensajes caben en el toast (se corta a los 9 s y tocarlo lo CIERRA) ─────────
{
  const casos = [
    ['vacio', { type: 'image/jpeg', size: 0, name: 'a.jpg' }],
    ['heic',  { type: 'image/heic', size: 3145728, name: 'b.heic' }],
    ['otro',  { type: 'image/jpeg', size: 4194304, name: 'c.jpg' }]
  ];
  casos.forEach(function(par) {
    const msg = H._motivoFotoRechazada(par[1], { paso: 'bitmap' });
    const ms = T._toastDuracion(msg);
    const cabe = ms < T.TOAST_MAX_MS;
    console.log('10) mensaje "' + par[0] + '": ' + msg.length + ' car → ' + (ms / 1000).toFixed(1) + ' s ' + (cabe ? '✓' : '✗ se corta'));
    chequear(cabe, 'el mensaje "' + par[0] + '" (' + msg.length + ' car) llega al techo de ' + T.TOAST_MAX_MS + ' ms y el tecnico no alcanza a leerlo');
  });
}

// ── Resultado ────────────────────────────────────────────────────────────────────────────────
console.log('');
if (fallos.length) {
  console.log('FALLA — la foto rechazada volvio a no decir por que:');
  fallos.forEach(function(f) { console.log(f); });
  process.exit(1);
}
console.log('OK — cada causa dice lo suyo, con la ficha que Soporte necesita.');
process.exit(0);
