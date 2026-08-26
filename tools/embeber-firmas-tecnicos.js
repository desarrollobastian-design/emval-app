#!/usr/bin/env node
/* Embebe las firmas de los tecnicos dentro de index.html, como base64.

   Pedido de Pedro el 25-08-2026: SMU (Santiago) exige que la hoja de servicio salga firmada
   por el tecnico que ejecuto el trabajo. Motivo del propio SMU: supervisores de otras zonas
   se conseguian documentos en blanco y los adulteraban.

   ⚠️ NO confundir con las otras dos firmas que ya viven en la app:
     · `FIRMA_EMVAL`        — la de Pedro, EMISOR, va en la COTIZACION. Una sola, fija.
     · `estado.fotoTimbre`  — el timbre del RECEPTOR, el local de SMU, fotografiado cada visita.
     · `FIRMAS_TECNICOS`    — esto: una por TECNICO, va al pie de la HOJA DE SERVICIO.

   Van en base64 dentro del propio index.html y no como archivos aparte por la misma razon que
   la de EMVAL: el PDF se genera en el telefono del tecnico, muchas veces sin señal, y algo que
   haya que ir a buscar por red saldria en blanco justo en terreno.

   Uso:
     node tools/embeber-firmas-tecnicos.js multimedia/Firmas/               # SIMULA
     node tools/embeber-firmas-tecnicos.js multimedia/Firmas/ --ejecutar    # escribe

   Opciones:
     --sin-verificar   no consultar Firestore para cruzar los nombres (usalo solo sin red)

   Que espera de cada archivo:
     - PNG ya limpio y recortado. Lo produce  tools/preparar-firma.js  a partir de la foto
       que manda el tecnico por WhatsApp. No le pases la foto cruda: sale a 14 mm e ilegible.
     - El NOMBRE DEL ARCHIVO tiene que corresponder al del tecnico en la coleccion `tecnicos`,
       sin tildes y con guiones:  José Quiroz -> jose-quiroz.png

   🔑 POR QUE CRUZA CONTRA FIRESTORE
   La firma se busca en tiempo de dibujo por el nombre del tecnico de la OT. Si la clave no
   calza — un apellido mal escrito, una tilde de mas, un tecnico que se llama distinto en la
   app— no pasa NADA visible: la hoja sale sin firma y nadie se entera hasta que SMU la
   rechaza. Un archivo mal nombrado es exactamente el modo de fallo que este proyecto ya
   conoce, asi que el cruce se hace aca, una vez, y no se confia en que el nombre este bien.

   🔒 SEGURIDAD: index.html es PUBLICO (GitHub Pages). Cualquiera que abra el codigo fuente
   puede extraer de aqui las firmas de los tecnicos como imagen. Es inevitable si el PDF debe
   funcionar sin conexion — la firma de EMVAL ya viaja asi desde el 13-08 — pero es una
   decision del cliente, no tecnica, y aca hay firmas de TERCEROS, no solo la del dueño.
   Las fotos y los PNG fuente NO van al repo (.gitignore: multimedia/). */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const ejecutar = args.includes('--ejecutar');
const verificar = !args.includes('--sin-verificar');
const dir = args.filter(a => !a.startsWith('--'))[0];
const destino = path.join(__dirname, '..', 'index.html');

if (!dir || !fs.existsSync(dir)) {
  console.error('Falta la carpeta con los PNG de las firmas, o no existe: ' + dir);
  console.error('  node tools/embeber-firmas-tecnicos.js multimedia/Firmas/ [--ejecutar]');
  process.exit(1);
}

// Mismo criterio que _normTexto() en index.html: sin tildes, sin espacios sobrantes, minusculas.
// Si alla cambia, aca tambien — o las claves dejan de calzar y las hojas salen sin firma.
function normTexto(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

function medirPNG(buf) {
  if (buf.length > 24 && buf.toString('hex', 0, 8) === '89504e470d0a1a0a') {
    return { fmt: 'PNG', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
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

// Las cotas reales del hueco en la hoja. Si en index.html cambian, aca tambien: si no, este
// script informa un tamaño que no es el que sale impreso.
const ALTO_MAX = 22, ANCHO_MAX = 62;

(async () => {
  const archivos = fs.readdirSync(dir)
    .filter(f => /\.(png|jpe?g)$/i.test(f))
    .sort();
  if (!archivos.length) {
    console.error('No hay PNG en ' + dir + '. Genéralos con tools/preparar-firma.js');
    process.exit(1);
  }

  // ── Cruce contra la coleccion real de tecnicos ────────────────────────────────────────
  let tecnicos = null;
  if (verificar) {
    // Solo LECTURA. La API key del cliente esta en index.html y las reglas permiten leer sin
    // autenticacion (ver la seccion de Firestore por REST en CLAUDE.md).
    const src0 = fs.readFileSync(destino, 'utf8');
    const mk = src0.match(/apiKey:\s*"([^"]+)"/);
    if (!mk) { console.error('No se encontro la apiKey en index.html.'); process.exit(1); }
    const url = 'https://firestore.googleapis.com/v1/projects/emval-app/databases/(default)' +
                '/documents/tecnicos?key=' + mk[1] + '&pageSize=200&mask.fieldPaths=nombre';
    try {
      const r = await fetch(url);
      const j = await r.json();
      tecnicos = (j.documents || [])
        .map(d => (d.fields && d.fields.nombre && d.fields.nombre.stringValue) || '')
        .filter(Boolean);
    } catch (e) {
      console.error('\n⚠ No se pudo consultar `tecnicos` (' + e.message + ').');
      console.error('  Sin ese cruce, un archivo mal nombrado se embebe igual y la hoja sale');
      console.error('  sin firma sin avisar. Vuelve a intentar con red, o usa --sin-verificar.\n');
      process.exit(1);
    }
  }

  const entradas = [];
  const huerfanos = [];
  let totalB64 = 0;

  archivos.forEach(f => {
    const bin = fs.readFileSync(path.join(dir, f));
    const info = medirPNG(bin);
    if (!info) { huerfanos.push({ f, motivo: 'no es PNG ni JPEG' }); return; }

    const claveArchivo = normTexto(path.basename(f).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
    let nombre = null;
    if (tecnicos) {
      const hit = tecnicos.find(t => normTexto(t) === claveArchivo);
      if (!hit) { huerfanos.push({ f, motivo: 'ningun tecnico se llama asi en `tecnicos`' }); return; }
      nombre = hit;
    }

    const b64 = bin.toString('base64');
    const ratio = +(info.w / info.h).toFixed(4);
    let altoMM = ALTO_MAX, anchoMM = ALTO_MAX * ratio;
    if (anchoMM > ANCHO_MAX) { anchoMM = ANCHO_MAX; altoMM = ANCHO_MAX / ratio; }
    totalB64 += b64.length;

    entradas.push({
      clave: claveArchivo, nombre: nombre || claveArchivo, archivo: f,
      dataUrl: 'data:' + (info.fmt === 'PNG' ? 'image/png' : 'image/jpeg') + ';base64,' + b64,
      fmt: info.fmt, ratio, w: info.w, h: info.h, kb: b64.length / 1024, anchoMM, altoMM
    });
  });

  console.log('\nFirmas de tecnicos — ' + dir + '\n');
  entradas.forEach(e => {
    console.log('  ' + e.nombre.padEnd(20) + e.archivo.padEnd(24) +
      e.w + 'x' + e.h + '  ratio ' + e.ratio.toFixed(3).padStart(6) +
      '   ' + e.kb.toFixed(1).padStart(6) + ' KB b64   ->  ' +
      e.anchoMM.toFixed(1) + ' x ' + e.altoMM.toFixed(1) + ' mm');
  });
  console.log('\n  Total en base64: ' + (totalB64 / 1024).toFixed(1) + ' KB');

  if (huerfanos.length) {
    console.log('\n  ⚠ Archivos que NO se van a embeber:');
    huerfanos.forEach(h => console.log('     ' + h.f + '  —  ' + h.motivo));
  }
  if (tecnicos) {
    const conFirma = new Set(entradas.map(e => e.clave));
    const sinFirma = tecnicos.filter(t => !conFirma.has(normTexto(t)));
    if (sinFirma.length) {
      console.log('\n  Tecnicos SIN firma (sus hojas van a salir sin firmar):');
      sinFirma.forEach(t => console.log('     · ' + t));
    }
  }

  if (!entradas.length) { console.error('\nNo quedo ninguna firma que embeber.\n'); process.exit(1); }

  // ── Armar el bloque ───────────────────────────────────────────────────────────────────
  const bloque =
    'var FIRMAS_TECNICOS = {\n' +
    '  // Generado con: node tools/embeber-firmas-tecnicos.js ' + dir + ' --ejecutar\n' +
    '  // Clave = _normTexto(nombre del tecnico): sin tildes, minusculas. La OT guarda el nombre\n' +
    '  // con tildes ("José Quiroz") y hay OT viejas guardadas sin ellas, asi que la busqueda\n' +
    '  // normaliza los dos lados. NO cambiar el criterio sin cambiar _firmaDeTecnico().\n' +
    entradas.map(e =>
      "  '" + e.clave + "': {\n" +
      '    // ' + e.nombre + ' — ' + e.archivo + ', ' + e.w + 'x' + e.h + ' ' + e.fmt +
        '. En la hoja sale a ~' + e.anchoMM.toFixed(0) + 'x' + e.altoMM.toFixed(0) + 'mm.\n' +
      "    nombre: '" + e.nombre.replace(/'/g, "\\'") + "',\n" +
      "    img: '" + e.dataUrl + "',\n" +
      "    fmt: '" + e.fmt + "',\n" +
      '    ratio: ' + e.ratio + '\n' +
      '  }'
    ).join(',\n') + '\n' +
    '};\n';

  const src = fs.readFileSync(destino, 'utf8');
  /* index.html esta en CRLF. Buscar '\n};\n' a secas no encuentra NADA y el script se cae
     diciendo que el bloque "quedo sin cerrar" — un diagnostico falso que manda a revisar el
     archivo equivocado. Y el bloque que se inserta tiene que salir en CRLF tambien, o el diff
     muestra las 14.315 lineas del archivo como cambiadas y la revision se vuelve imposible. */
  const CRLF = src.indexOf('\r\n') >= 0;
  const nl = txt => CRLF ? txt.replace(/\r?\n/g, '\r\n') : txt.replace(/\r\n/g, '\n');
  const bloqueNL = nl(bloque);
  // Un '};' solo en su propia linea. El base64 viaja entre comillas en UNA linea, asi que este
  // patron no puede caer dentro de los datos.
  function finDeBloque(desde) {
    const re = /\r?\n\};\r?\n/g;
    re.lastIndex = desde;
    const m = re.exec(src);
    return m ? { fin: m.index + m[0].length } : null;
  }

  let nuevo, donde;
  const ini = src.indexOf('var FIRMAS_TECNICOS = {');
  if (ini >= 0) {
    const f = finDeBloque(ini);
    if (!f) { console.error('El bloque FIRMAS_TECNICOS quedo sin cerrar en index.html.'); process.exit(1); }
    nuevo = src.slice(0, ini) + bloqueNL + src.slice(f.fin);
    donde = 'reemplazado';
  } else {
    // Va justo despues de FIRMA_EMVAL: las dos firmas viven juntas y se leen juntas, que es
    // lo unico que evita volver a confundir la del emisor con la del tecnico.
    const anc = src.indexOf('var FIRMA_EMVAL = {');
    if (anc < 0) { console.error('No se encontro "var FIRMA_EMVAL = {" en index.html para anclar el bloque.'); process.exit(1); }
    const f = finDeBloque(anc);
    if (!f) { console.error('El bloque FIRMA_EMVAL quedo sin cerrar en index.html.'); process.exit(1); }
    nuevo = src.slice(0, f.fin) + nl('\n') + bloqueNL + src.slice(f.fin);
    donde = 'insertado despues de FIRMA_EMVAL';
  }

  console.log('\n  index.html: ' + (src.length / 1024).toFixed(0) + ' KB  ->  ' +
              (nuevo.length / 1024).toFixed(0) + ' KB   (bloque ' + donde + ')');

  if (!ejecutar) {
    console.log('\n  SIMULACION — no se escribio nada. Repite con --ejecutar\n');
    return;
  }

  const respaldo = destino + '.antes-de-firmas-tecnicos-' +
    new Date().toISOString().slice(0, 19).replace(/[:T]/g, '') + '.bak';
  fs.writeFileSync(respaldo, src, 'utf8');
  fs.writeFileSync(destino, nuevo, 'utf8');
  console.log('\n  ✓ index.html actualizado');
  console.log('  ✓ Respaldo en ' + path.basename(respaldo) + '\n');
  console.log('  Falta todavia, y esto NO lo hace el script:');
  console.log('   1. node tests/hoja-lleva-firma-del-tecnico.js index.html');
  console.log('   2. Subir CACHE_NAME en sw.js, o los telefonos siguen con la version vieja.');
  console.log('   3. Abrir una hoja de verdad y MIRAR el PDF: que la firma no pise el timbre');
  console.log('      del receptor ni se salga de la A4.\n');
})().catch(e => { console.error(e); process.exit(1); });
