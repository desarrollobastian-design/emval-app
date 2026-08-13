#!/usr/bin/env node
/* Embebe la firma y el timbre de EMVAL dentro de index.html.

   Pedido de Pedro el 13-08-2026: que las cotizaciones salgan ya firmadas y timbradas.
   La imagen no puede vivir como archivo suelto porque el PDF se genera en el telefono del
   tecnico, muchas veces sin señal — un archivo que hay que ir a buscar por red sale en blanco
   justo cuando importa. Por eso va en base64 dentro del propio index.html.

   Este script existe porque un base64 de una firma son ~50.000 caracteres: no se pega a mano
   sin equivocarse, y el ratio hay que medirlo del archivo o la firma sale estirada.

   Uso:
     node tools/embeber-firma-emval.js firma-timbre.png              # SIMULA: mide y te dice como quedaria
     node tools/embeber-firma-emval.js firma-timbre.png --ejecutar   # escribe index.html (deja respaldo)

   Que espera del archivo:
     - PNG o JPEG, ya RECORTADO (solo firma y timbre, sin el resto de la hoja).
     - Fondo BLANCO, no transparente. La transparencia en PDF se imprime distinto segun el
       visor y puede salir con un recuadro gris en la impresora del local.
     - Ancho de unos 600-1000px. Mas grande solo engorda index.html sin verse mejor: en el
       PDF se dibuja a unos 3cm.

   ⚠️ SEGURIDAD: index.html es un archivo PUBLICO. Cualquiera que abra el codigo fuente de la
   app puede extraer de aqui la firma y el timbre de EMVAL como imagen. Es inevitable si el
   PDF tiene que funcionar sin conexion, pero es una decision del cliente, no tecnica. */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const ejecutar = args.includes('--ejecutar');
const origen = args.filter(a => !a.startsWith('--'))[0];
const destino = path.join(__dirname, '..', 'index.html');

if (!origen) {
  console.error('Falta el archivo de la firma.\n  node tools/embeber-firma-emval.js <firma.png> [--ejecutar]');
  process.exit(1);
}
if (!fs.existsSync(origen)) {
  console.error('No existe el archivo: ' + origen);
  process.exit(1);
}

const bin = fs.readFileSync(origen);

// ── Medir la imagen leyendo su cabecera, para no depender de ninguna libreria ────────────────
function medir(buf) {
  // PNG: firma de 8 bytes, despues el chunk IHDR con ancho y alto en big-endian.
  if (buf.length > 24 && buf.toString('hex', 0, 8) === '89504e470d0a1a0a') {
    return { fmt: 'PNG', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  // JPEG: recorrer los segmentos hasta dar con un marcador SOF (el que trae las dimensiones).
  if (buf.length > 4 && buf[0] === 0xFF && buf[1] === 0xD8) {
    let p = 2;
    while (p + 9 < buf.length) {
      if (buf[p] !== 0xFF) { p++; continue; }
      const m = buf[p + 1];
      const esSOF = (m >= 0xC0 && m <= 0xC3) || (m >= 0xC5 && m <= 0xC7) ||
                    (m >= 0xC9 && m <= 0xCB) || (m >= 0xCD && m <= 0xCF);
      if (esSOF) return { fmt: 'JPEG', h: buf.readUInt16BE(p + 5), w: buf.readUInt16BE(p + 7) };
      if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { p += 2; continue; }
      p += 2 + buf.readUInt16BE(p + 2);
    }
  }
  return null;
}

const info = medir(bin);
if (!info) {
  console.error('No se reconocio el formato. Tiene que ser PNG o JPEG (no WEBP, no HEIC).');
  console.error('Si viene del telefono, lo mas probable es que sea HEIC: abrelo y guardalo como PNG.');
  process.exit(1);
}

const b64 = bin.toString('base64');
const mime = info.fmt === 'PNG' ? 'image/png' : 'image/jpeg';
const dataUrl = 'data:' + mime + ';base64,' + b64;
const ratio = +(info.w / info.h).toFixed(4);

// Las mismas cotas que usa la llamada a _dibujarFirmaEmval en index.html. Si alla cambian,
// aca tambien: si no, este script informa un tamaño que no es el que sale impreso.
const ALTO_MAX = 38, ANCHO_MAX = 80;
let altoMM = ALTO_MAX, anchoMM = ALTO_MAX * ratio;
if (anchoMM > ANCHO_MAX) { anchoMM = ANCHO_MAX; altoMM = ANCHO_MAX / ratio; }

console.log('\nFirma y timbre de EMVAL — ' + path.basename(origen) + '\n');
console.log('  Formato        : ' + info.fmt);
console.log('  Dimensiones    : ' + info.w + ' x ' + info.h + ' px   (ratio ' + ratio + ')');
console.log('  Peso original  : ' + (bin.length / 1024).toFixed(1) + ' KB');
console.log('  Peso en base64 : ' + (b64.length / 1024).toFixed(1) + ' KB  (esto es lo que engorda index.html)');
console.log('  En el PDF sale : ' + anchoMM.toFixed(1) + ' x ' + altoMM.toFixed(1) + ' mm\n');

const avisos = [];
if (b64.length > 150 * 1024) {
  avisos.push('Pesa mas de 150 KB en base64. index.html entero se guarda en el cache del Service Worker\n' +
              '     y lo descarga cada tecnico en cada version: conviene bajarle la resolucion.');
}
if (info.w > 1400) {
  avisos.push('Mas de 1400px de ancho para dibujarse a ' + anchoMM.toFixed(0) + 'mm. Sobra resolucion; achicala.');
}
if (info.w < 300) {
  avisos.push('Menos de 300px de ancho: es probable que el timbre salga pixelado al imprimir.');
}
if (anchoMM >= ANCHO_MAX - 0.1) {
  avisos.push('La imagen es muy apaisada y toca el ancho maximo de ' + ANCHO_MAX + 'mm.\n' +
              '     Va a salir mas baja que el hueco disponible. Recortala mas ajustada si se ve chica.');
}
if (avisos.length) {
  console.log('  Avisos:');
  avisos.forEach(a => console.log('   ⚠ ' + a));
  console.log('');
}

// ── Reemplazar el bloque FIRMA_EMVAL dentro de index.html ────────────────────────────────────
const src = fs.readFileSync(destino, 'utf8');
const ini = src.indexOf('var FIRMA_EMVAL = {');
if (ini < 0) {
  console.error('No se encontro "var FIRMA_EMVAL = {" en index.html.');
  console.error('Si lo renombraron, hay que actualizar este script Y el test cotizacion-lleva-firma-emval.js.');
  process.exit(1);
}
const fin = src.indexOf('};', ini);
if (fin < 0) { console.error('El bloque FIRMA_EMVAL quedo sin cerrar en index.html.'); process.exit(1); }

const bloque =
  'var FIRMA_EMVAL = {\n' +
  '  // Cargada con: node tools/embeber-firma-emval.js ' + path.basename(origen) + '\n' +
  '  // Original: ' + info.w + 'x' + info.h + 'px ' + info.fmt + '. En el PDF se dibuja a ~' +
      anchoMM.toFixed(0) + 'x' + altoMM.toFixed(0) + 'mm.\n' +
  "  img: '" + dataUrl + "',\n" +
  "  fmt: '" + info.fmt + "',\n" +
  '  ratio: ' + ratio + '\n';

const nuevo = src.slice(0, ini) + bloque + src.slice(fin);

if (!ejecutar) {
  const yaTenia = /img:\s*'data:/.test(src.slice(ini, fin));
  console.log('  SIMULACION — no se escribio nada.');
  console.log('  index.html ' + (yaTenia ? 'YA tiene una firma cargada y seria REEMPLAZADA' : 'todavia no tiene firma'));
  console.log('  Pasaria de ' + (src.length / 1024).toFixed(0) + ' KB a ' + (nuevo.length / 1024).toFixed(0) + ' KB.\n');
  console.log('  Para escribirlo de verdad, repite el comando con --ejecutar\n');
  process.exit(0);
}

const respaldo = destino + '.antes-de-firma-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '') + '.bak';
fs.writeFileSync(respaldo, src, 'utf8');
fs.writeFileSync(destino, nuevo, 'utf8');

console.log('  ✓ index.html actualizado (' + (nuevo.length / 1024).toFixed(0) + ' KB)');
console.log('  ✓ Respaldo en ' + path.basename(respaldo) + '\n');
console.log('  Falta todavia, y esto NO lo hace el script:');
console.log('   1. node tests/cotizacion-lleva-firma-emval.js index.html');
console.log('   2. Subir el numero de CACHE_NAME en sw.js, o los telefonos siguen con la version vieja.');
console.log('   3. Abrir una cotizacion de verdad y MIRAR el PDF: que la firma no pise la tabla');
console.log('      ni el texto de validez, y que se lea el RUT del timbre.\n');
