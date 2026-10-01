/* Prueba de regresion — el enlace del correo de la HS se ABRE en el navegador (vista previa) y
   conserva el nombre que exige SMU.

   Caso Pedro, 24-09-2026 (audio): "Antiguamente, cuando me llegaba el correo (...) pinchaba el link
   y se hacia como una vista previa. Y ahora no, volvio al antiguo otra vez: volvio a que tenis que
   descargar el archivo". Es la copia que le llega a cotizaciones.emval@gmail.com
   (_notificarOTCompletada), y el local recibe el mismo enlace en su correo.

   Causa: 943888e (14-09-2026) paso el `pdf_url` de los cinco productores del correo de la HS por
   `_urlPDFDescarga`, que le pega `fl_attachment:<nombre>`. Cloudinary responde entonces
   `Content-Disposition: attachment` y el navegador DESCARGA. El arreglo es `_urlPDFVista`:
   `/files/<v>/<public_id sin .pdf>/<nombre SMU>.pdf`, que responde 200 application/pdf SIN
   Content-Disposition (se ve en linea) y deja el nombre de SMU en la ruta.

   Que se vigila:
   1. Las formas REALES de URL (barrido del 24-09 sobre las 561 de Cloudinary guardadas en
      Firestore) salen en /files/ bien armadas: con y sin version, %20 en el public_id, legacy sin
      sufijo de 7, `_v2`, cotizaciones y bajas.
   2. El nombre de SMU queda en el sufijo, limpio con la MISMA lista blanca que la descarga: el
      archivo guardado desde la vista se llama igual que el de la descarga nombrada.
   3. Lo que no se toca: el link a la app (`?pdf=`) sale intacto, vacio da vacio, una URL que no es
      de Cloudinary sale igual, y un public_id legacy sin '.pdf' NO recibe '.pdf' (daria 404).
      Nunca devuelve vacio si recibio algo: de eso dependen `_SELLO_SIN_PDF` y `_NOTA_SIN_PDF`.
   4. Un `fl_attachment` previo se QUITA (sobre /files/ tambien obliga a descargar), y su nombre
      sirve de respaldo si no llega uno nuevo.
   5. Los CINCO productores del correo de la HS usan `_urlPDFVista` y ninguno `_urlPDFDescarga`.
   6. ALCANCE, decision de Bastian del 24-09-2026 ("Compartir y los Ver PDF de la app tambien pasan
      a vista previa"): Compartir (el enlace de texto, el `url` de `navigator.share` con un
      documento y "Abrir el PDF" del menu propio) y los "Ver PDF" de Preventivos y de "Ver OTs por
      tecnico" usan `_urlPDFVista`. Y por decision de Bastian del 25-09-2026, tambien el "Ver PDF"
      de Cotizaciones, que descargaba con nombre desde f61bae9 (14-08, no es de 943888e): ahora
      abre la vista por `_abrirPDFEnPestana`, sin pasar por `_descargarPDFNombrado` (que queda sin
      llamadores y se conserva). Siguen con `_urlPDFDescarga`, y se vigila que sigan: los bytes
      que Compartir adjunta (_archivosParaCompartir), Descargar CT (_urlDescargaCot) y Descargar HS
      del correo de cotizaciones a SMU, "Ver / Descargar hoja" de "Enviar hojas" y el "Ver PDF" de
      Bajas. El conteo de llamadas a `_urlPDFVista` queda cerrado en 12: una mas es ampliar el
      alcance sin pasar por la decision.
   6b. Compartir, EJECUTADO con el codigo real (`navigator.share`, `window.open`, el portapapeles y
      `fetch` espiados): con un documento, con varios, por WhatsApp, correo, "Copiar enlace" y
      "Abrir el PDF", lo que recibe la otra persona es /files/ con el nombre de SMU y sin
      `fl_attachment`. Los bytes adjuntos se siguen bajando por la descarga nombrada, el `File`
      lleva el nombre de SMU y el `share` con archivos no lleva `url`. El link a la app (`?pdf=`)
      no se comparte.
   6c. Los dos "Ver PDF", EJECUTADOS (el `onclick` real, sacado del archivo): Cloudinary abre la
      vista con el nombre de SMU y el link a la app sale intacto.
   6d. El "Ver PDF" de Cotizaciones, EJECUTADO (el `onclick` real, con `window.open` espiado y la
      regeneracion simulada, lenta y rapida). Sin regenerar: un solo window.open, en el mismo toque,
      con la vista /files/ y el nombre de la CT. Regenerando: la pestana se abre ANTES del primer
      await (un window.open despues de la subida lo bloquea el navegador, iOS sobre todo) y recibe
      la vista del PDF nuevo al terminar, con "Preparando el PDF..." mientras tanto. Regeneracion
      fallida (o que lanza): la pestana se cierra y se avisa como siempre, TAMBIEN si el navegador
      bloqueo la pestana del toque (sin pestana ni aviso quedaria en silencio). Con el bloqueador
      devolviendo null: al terminar se intenta otra pestana y, si tampoco, se ofrece el enlace con
      _avisar ("Abrir el PDF", un toque nuevo). Si la pestana del toque no se deja llevar al PDF
      (lanza), se abre otra. El espia de window.open sigue la norma: con `noopener` abre y devuelve
      null, que en el codigo seria un aviso falso y una pestana doble. En la app instalada de iPhone
      (`navigator.standalone`), donde window.open no abre nada: ningun window.open; sin regenerar,
      un enlace target _blank en el mismo toque; regenerando, el aviso "PDF listo" y el enlace
      solo con su toque. El link a la app sale intacto, y la app nunca se navega a si misma hacia
      el PDF.
   7. El rescate de la cola de enlaces se EJECUTA con el codigo real (caso 484304): los dos correos
      que manda —administracion y local— salen con el enlace /files/ y el sello de siempre.
   7b. La cola de correos, EJECUTADA con el codigo real: un aviso que la version anterior dejo
      encolado en el telefono (params congelados con `fl_attachment`; el caso inferido de la OT
      271080 del 24-09, ver `_paramsCorreoCola`) sale igual en vista previa y con el nombre de SMU,
      tambien si va como REENVIO. Solo el template del aviso de OT: la baja, el link a la app y el
      template de cotizaciones salen identicos. El aviso guardado no se toca, y uno que no sale sigue
      en la cola tal como estaba. Las funciones de la cola se sacan del archivo (transitivo, con
      tope), asi que corre igual contra main y contra la rama del correo mal escrito.
   8. Con --prod: HEAD real a Cloudinary con las URLs que arma el codigo. Tienen que responder 200,
      application/pdf, SIN attachment y con el mismo ETag/largo que la raw (el mismo archivo).
      Linea de control: la URL de DESCARGA del mismo archivo SI trae attachment; si no lo trae, el
      HEAD no esta midiendo nada. Son HEAD publicos: no suben nada ni gastan cuota.
   9. El service worker sube de version cuando hay algo que publicar: si el index.html medido
      difiere del de origin/main, el CACHE_NAME del sw.js que va a su lado tiene que ser MAYOR que
      el de origin/main. Sin el bump, el telefono sigue con la app vieja en cache y el arreglo no
      llega. Si el index.html es igual al de origin/main (ya fusionado), no hay nada que publicar y
      se omite con aviso. Si no hay sw.js al lado o git no responde, tambien se omite con aviso; si
      no se puede leer el CACHE_NAME, falla.

   🐛 Trae su propio despojador de comentarios: el compartido de otros guiones se traga 1.070 lineas
   por el `accept="image/*"` del HTML. Aca un comentario de bloque solo cuenta si ABRE la linea.

   CONTRAPRUEBA: contra origin/main (4e61b64) `_urlPDFVista` no existe, los productores arman
   `fl_attachment`, el aviso rescatado sale con descarga forzada, Compartir y los dos "Ver PDF"
   entregan la descarga y el "Ver PDF" de Cotizaciones descarga en vez de abrir: el guion falla.

   Uso:  node tests/el-correo-de-la-hs-abre-en-linea.js index.html [--prod] */

const fs = require('fs');
const vm = require('vm');
const { execFileSync } = require('child_process');

const RUTA = process.argv[2] || 'index.html';
const PROD = process.argv.includes('--prod');
// index.html se guarda con CRLF: se normaliza para que los marcadores no dependan del final de linea.
const src = fs.readFileSync(RUTA, 'utf8').replace(/\r\n/g, '\n');

const fallos = [];
let oks = 0;
function chequear(ok, detalle) { if (ok) oks++; else fallos.push('  ✗ ' + detalle); return ok; }

// Una funcion de nivel superior: desde su `function X(` hasta la primera linea que es solo `}`.
// Todo el codigo del archivo esta indentado dentro de sus funciones, asi que esa llave es la suya.
function fuente(nombre) {
  const m = new RegExp('(^|\\n)(async )?function ' + nombre.replace(/\$/g, '\\$') + '\\(').exec(src);
  if (!m) return null;
  const ini = m.index + m[1].length;
  const fin = src.slice(ini).search(/\n\}(\n|$)/);
  return fin < 0 ? null : src.slice(ini, ini + fin + 2);
}
function declaracion(re) { const m = src.match(re); return m ? m[0] : null; }

// Despojador PROPIO: un `/*` cuenta como comentario solo si abre la linea. Los `//` se sacan si abren
// la linea o si van tras un espacio y seguidos de espacio (el estilo del archivo). Las URL
// ('https://') no se tocan: el `//` va pegado a ':'.
function sinComentarios(txt) {
  return txt
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, m => m.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/[ \t]\/\/ .*$/gm, '');
}
const plano = sinComentarios(src);
// Linea de control del despojador: si se come codigo, todo lo de abajo "pasaria" por vacio.
chequear(plano.indexOf('async function sincronizarOTsPendientes(') !== -1 &&
         plano.indexOf('async function guardarYEnviarPDF(') !== -1,
  'el despojador de comentarios se comio codigo: los chequeos de abajo no medirian nada');

// ── Funciones reales de index.html ────────────────────────────────────────────────────────────
const NOMBRES = ['_normTexto', '_localCanonico', '_indexarCadenas', '_nombreAdjuntoSeguro',
  '_urlPDFDescarga', '_urlPDFSinNombre', '_recortarPalabras', '_cecoDocumento', '_cecoDelCatalogo',
  '_cecoDe', '_nombreDocumento', '_trabajoDocumento', '_nombrePDFHoja'];
const cod = {};
NOMBRES.concat(['_urlPDFVista']).forEach(n => { cod[n] = fuente(n); });
const faltan = NOMBRES.filter(n => !cod[n]);
if (faltan.length) {
  console.error('No se encontro en ' + RUTA + ': ' + faltan.join(', '));
  console.error('Si se renombraron, este test hay que revalidarlo — no solo arreglarlo.');
  process.exit(1);
}
const HAY_VISTA = !!cod._urlPDFVista;
const MESES = declaracion(/const _MESES_DOC = \[[^\]]*\];/) || 'const _MESES_DOC = [];';
const CATALOGO = 'var window = { ALIAS_LOCALES: { "s10 concepcion": "M10 CONCEPCION" } };\n' +
  'var _store = { emval_cadenas_cache: JSON.stringify([{ nombre: "M10", sucursales: [{ nombre: "M10 CONCEPCION", centro: "3164" }] }, ' +
  '{ nombre: "Unimarc", sucursales: [{ nombre: "UNIMARC PRUEBA", centro: "713" }] }]) };\n' +
  'var localStorage = { getItem: function(k){ return _store[k] == null ? null : _store[k]; } };\n' +
  'var _cecoIdxCache = { raw: null, idx: null };\n' + MESES + '\n';
const exportar = NOMBRES.concat(HAY_VISTA ? ['_urlPDFVista'] : []);
const F = new Function(CATALOGO + exportar.map(n => cod[n]).join('\n\n') +
  '\nreturn { ' + exportar.map(n => n + ': ' + n).join(', ') + ' };')();

const CLD = 'https://res.cloudinary.com/dcrf29tna';
const RAW_796863 = CLD + '/raw/upload/v1789395715/emval/pdfs/Recepcion_Obra_OT796863_qp9imoz.pdf';
const DATOS_796863 = { otNumero: 796863, cotizacionNumero: '15092601', local: 'S10 Concepcion', ceco: '',
  tipo: 'correctivo', nombreServicio: 'Destape piletas y camara' };
const NOMBRE_SMU = 'HS - 796863 - CT 15092601 - ceco 3164 - Destape piletas y camara.pdf';   // el del supervisor, 15-09

// El sufijo que ve el usuario, decodificado.
function sufijo(u) {
  const m = String(u).match(/\/files\/.*\/([^/]+)$/);
  try { return m ? decodeURIComponent(m[1]) : null; } catch (e) { return null; }
}
function adjunto(u) { return /fl_attachment/.test(String(u)); }

console.log('El correo de la HS abre en linea y conserva el nombre de SMU\n');

if (!chequear(HAY_VISTA, 'no existe _urlPDFVista en ' + RUTA + ': el correo de la HS sigue armando la descarga forzada')) {
  console.log('0) _urlPDFVista: NO EXISTE ✗ (se sigue con lo que se puede medir)');
}
const vista = HAY_VISTA ? F._urlPDFVista : () => null;

// ── 1. Las formas reales de URL salen en /files/ bien armadas ────────────────────────────────────
{
  // [raw guardada en Firestore, /files/ esperado SIN el sufijo del nombre] — ejemplos del barrido.
  const FORMAS = [
    ['correctiva moderna con version', RAW_796863,
      CLD + '/files/v1789395715/emval/pdfs/Recepcion_Obra_OT796863_qp9imoz/'],
    ['preventiva con %20 en el public_id', CLD + '/raw/upload/v1783960112/emval/pdfs/736-HS%209840-MP%20Transpaletas%20Julio%202026_DLARC0E.pdf',
      CLD + '/files/v1783960112/emval/pdfs/736-HS%209840-MP%20Transpaletas%20Julio%202026_DLARC0E/'],
    ['legacy sin sufijo de 7', CLD + '/raw/upload/v1782514734/emval/pdfs/Recepcion_Obra_OT9555.pdf',
      CLD + '/files/v1782514734/emval/pdfs/Recepcion_Obra_OT9555/'],
    ['sin version (rescate de la cola)', CLD + '/raw/upload/emval/pdfs/Recepcion_Obra_OT119335_wkovvwr.pdf',
      CLD + '/files/emval/pdfs/Recepcion_Obra_OT119335_wkovvwr/'],
    ['preventiva sin version con %20', CLD + '/raw/upload/emval/pdfs/733-HS%20274992-MP%20Transpaletas%20Julio%202026_yeymcar.pdf',
      CLD + '/files/emval/pdfs/733-HS%20274992-MP%20Transpaletas%20Julio%202026_yeymcar/'],
    ['hoja regenerada _v2', CLD + '/raw/upload/v1789071876/emval/pdfs/Recepcion_Obra_OT347723_eepszxb_v2.pdf',
      CLD + '/files/v1789071876/emval/pdfs/Recepcion_Obra_OT347723_eepszxb_v2/'],
    ['cotizacion', CLD + '/raw/upload/v1787838031/emval/cotizaciones/27082606_HS_825533_Retiro_bandera_CHILLAN_4_030087.pdf',
      CLD + '/files/v1787838031/emval/cotizaciones/27082606_HS_825533_Retiro_bandera_CHILLAN_4_030087/'],
    ['baja de activo', CLD + '/raw/upload/v1788193245/emval/bajas/31082601_Baja_de_activo_UNIMARC_YUMBEL_s01lkwh.pdf',
      CLD + '/files/v1788193245/emval/bajas/31082601_Baja_de_activo_UNIMARC_YUMBEL_s01lkwh/']
  ];
  let bien = 0;
  FORMAS.forEach(([etq, raw, base]) => {
    const r = vista(raw, 'HS - 1 - x.pdf');
    const ok = r === base + encodeURIComponent('HS - 1 - x') + '.pdf';
    if (chequear(ok, etq + ': salio "' + r + '"')) bien++;
  });
  console.log('1) Formas reales: ' + bien + ' de ' + FORMAS.length + ' salen en /files/ con el public_id intacto' + (bien === FORMAS.length ? ' ✓' : ' ✗'));
}

// ── 2. El nombre de SMU queda en el sufijo, igual al de la descarga nombrada ─────────────────────
{
  const nombre = F._nombrePDFHoja(DATOS_796863);
  chequear(nombre === NOMBRE_SMU, 'el armador de nombres cambio: "' + nombre + '" (esperado "' + NOMBRE_SMU + '")');
  const v = vista(RAW_796863, nombre);
  const s = sufijo(v);
  chequear(s === NOMBRE_SMU, 'el sufijo no es el nombre de SMU: "' + s + '"');
  chequear(!adjunto(v), 'el enlace de la vista trae fl_attachment: obliga a descargar');
  // El mismo nombre que baja la descarga nombrada (fl_attachment), para que no haya dos nombres.
  const d = F._urlPDFDescarga(RAW_796863, nombre).match(/fl_attachment:([^/]*)\//);
  chequear(!!d && decodeURIComponent(d[1]) + '.pdf' === s, 'la vista y la descarga nombran distinto el archivo');
  // Nombre crudo, sin pasar por el armador: la lista blanca es la de la descarga (tildes transliteradas).
  const crudo = sufijo(vista(RAW_796863, 'HS - 1 - Destape baño y reparación (Fijación). Venta Asistida.-'));
  chequear(crudo === 'HS - 1 - Destape bano y reparacion Fijacion Venta Asistida.pdf', 'la lista blanca no se aplico: "' + crudo + '"');
  console.log('2) Nombre: ' + (s === NOMBRE_SMU ? s + ' ✓' : '"' + s + '" ✗'));
}

// ── 3. Lo que no se toca ─────────────────────────────────────────────────────────────────────────
{
  const app = 'https://desarrollobastian-design.github.io/emval-app/?pdf=QymC3p15Nvh793cfvRcb';
  chequear(vista(app, 'HS - 1 - x.pdf') === app, 'el link a la app salio modificado: "' + vista(app, 'x') + '"');
  chequear(vista('', 'HS - 1 - x.pdf') === '', 'vacio no devolvio vacio');
  chequear(vista(null, 'x') === '' && vista(undefined) === '', 'null/undefined no devolvieron vacio');
  const ajena = 'https://ejemplo.cl/archivo.pdf';
  chequear(vista(ajena, 'x') === ajena, 'una URL que no es de Cloudinary salio modificada');
  // Legacy de mayo con public_id SIN '.pdf' (OT_9502): /files/ da 404 y raw + '.pdf' tambien.
  const legacy = CLD + '/raw/upload/v1780088835/emval/pdfs/OT_9502';
  chequear(vista(legacy, 'HS - 9502 - x') === legacy, 'un public_id sin .pdf se transformo o recibio ".pdf" (404): "' + vista(legacy, 'x') + '"');
  // Sin nombre: la raw, sin descarga forzada.
  chequear(vista(RAW_796863, '') === RAW_796863, 'sin nombre no devolvio la raw: "' + vista(RAW_796863, '') + '"');
  chequear(vista(RAW_796863, '...') === RAW_796863, 'un nombre que la lista blanca deja vacio armo un sufijo "/.pdf" (404)');
  // Ya en vista: pasa igual (idempotente).
  const ya = vista(RAW_796863, NOMBRE_SMU);
  chequear(vista(ya, 'otro') === ya, 'una URL que ya es de vista se volvio a transformar');
  // Nunca vacio si recibio algo: el sello __sinpdf y la nota se deciden por "hay URL".
  const entradas = [RAW_796863, app, legacy, ajena, ' ' + RAW_796863 + ' ', CLD + '/raw/upload/x'];
  chequear(entradas.every(e => !!vista(e, 'HS - 1 - x')), 'con una URL de entrada devolvio vacio: el aviso pasaria a "sin PDF"');
  // Un espacio de sobra no se cuela en el enlace.
  chequear(vista(' ' + RAW_796863 + ' ', 'HS - 1 - x') === vista(RAW_796863, 'HS - 1 - x'), 'los espacios de sobra no se recortaron');
  console.log('3) Link a la app, vacio, ajena y legacy sin .pdf: ' + (HAY_VISTA && vista(app, 'x') === app && vista(legacy, 'x') === legacy ? 'intactos ✓' : '✗'));
}

// ── 4. Un fl_attachment previo se quita ──────────────────────────────────────────────────────────
{
  const sucia = RAW_796863.replace('/raw/upload/', '/raw/upload/fl_attachment:' + encodeURIComponent('HS - 1 - Venta Asistida.-') + '/');
  const r1 = vista(sucia, NOMBRE_SMU);
  chequear(!adjunto(r1) && sufijo(r1) === NOMBRE_SMU, 'con fl_attachment previo y nombre nuevo: "' + r1 + '"');
  // Sin nombre nuevo, el viejo sirve (limpio con la lista blanca) antes que perderlo.
  const r2 = vista(sucia, '');
  chequear(!adjunto(r2) && sufijo(r2) === 'HS - 1 - Venta Asistida.pdf', 'sin nombre nuevo no uso el viejo: "' + r2 + '"');
  // fl_attachment pelado (sin nombre) y sin nombre nuevo: la raw.
  const pelado = RAW_796863.replace('/raw/upload/', '/raw/upload/fl_attachment/');
  chequear(vista(pelado, '') === RAW_796863, 'fl_attachment sin nombre no se quito: "' + vista(pelado, '') + '"');
  // Lo que arma hoy _urlPDFDescarga, pasado por la vista, vuelve a abrir en linea con el mismo nombre.
  const r3 = vista(F._urlPDFDescarga(RAW_796863, NOMBRE_SMU), '');
  chequear(!adjunto(r3) && sufijo(r3) === NOMBRE_SMU, 'la URL de descarga no se convirtio en vista: "' + r3 + '"');
  // Dos segmentos: si queda el segundo, Cloudinary lo aplica sobre /files/ y vuelve a descargar.
  const doble = RAW_796863.replace('/raw/upload/', '/raw/upload/fl_attachment:Viejo%20A/fl_attachment:Viejo%20B/');
  const r4 = vista(doble, NOMBRE_SMU);
  chequear(!adjunto(r4) && String(r4).indexOf('fl_attachment') === -1 && sufijo(r4) === NOMBRE_SMU, 'con dos fl_attachment quedo uno: "' + r4 + '"');
  console.log('4) fl_attachment previo: ' + (r1 && r2 && r4 && !adjunto(r1) && !adjunto(r2) && !adjunto(r4) ? 'se quita (tambien si vienen dos), y el nombre viejo sirve de respaldo ✓' : '✗'));
}

// ── 5. Los cinco productores del correo de la HS usan la vista ──────────────────────────────────
{
  const cuerpos = {
    guardarYEnviarPDF: sinComentarios(fuente('guardarYEnviarPDF') || ''),
    sincronizarEnlacesPDFPendientes: sinComentarios(fuente('sincronizarEnlacesPDFPendientes') || ''),
    sincronizarOTsPendientes: sinComentarios(fuente('sincronizarOTsPendientes') || '')
  };
  // Linea de control: cada cuerpo tiene que traer los correos que se miden. El correo al local sale
  // por `_enviarCorreo` en main y por `_enviarCorreoConDetalle` en la rama del correo mal escrito.
  chequear(/_enviarCorreo(ConDetalle)?\(\{/.test(cuerpos.guardarYEnviarPDF) && /_notificarOTCompletada\(/.test(cuerpos.guardarYEnviarPDF) &&
           /return pdfUrlCloudinary \|\| pdfUrlFirestore;/.test(cuerpos.guardarYEnviarPDF),
    'no se pudo aislar guardarYEnviarPDF entero: el chequeo no mediria nada');
  chequear(/_urlHSRescatada/.test(cuerpos.sincronizarEnlacesPDFPendientes), 'no se pudo aislar el rescate de la cola de enlaces');
  chequear(/pdfUrlSync/.test(cuerpos.sincronizarOTsPendientes) && /_notificarOTCompletada\(/.test(cuerpos.sincronizarOTsPendientes),
    'no se pudo aislar sincronizarOTsPendientes');

  Object.keys(cuerpos).forEach(n => {
    chequear(cuerpos[n].indexOf('_urlPDFDescarga') === -1,
      n + ' usa _urlPDFDescarga: el correo de la HS vuelve a obligar a descargar (943888e)');
  });
  const g = cuerpos.guardarYEnviarPDF, r = cuerpos.sincronizarEnlacesPDFPendientes, s = cuerpos.sincronizarOTsPendientes;
  const sitios = [
    ['cierre · correo al local', /_urlLocalEntrega = \(typeof _urlPDFVista === 'function'[^;]*\? _urlPDFVista\(_urlLocal, _nombrePDFHoja\(snap\)\)/.test(g) &&
                                 /pdf_url: _urlLocalEntrega\b/.test(g)],
    ['cierre · aviso a administracion', /_notificarOTCompletada\([\s\S]{0,300}\? _urlPDFVista\(pdfUrlCloudinary \|\| pdfUrlFirestore \|\| '', _nombrePDFHoja\(snap\)\)/.test(g)],
    ['rescate · aviso y local', /_urlHSRescatada = _urlPDFVista\(it\.pdfUrlCloudinary, _nombreHSRescatada\)/.test(r) &&
                                /_notificarOTCompletada\([^;]*_urlHSRescatada/.test(r) && /pdf_url: _urlHSRescatada\b/.test(r)],
    ['cola offline · correo al local', /pdf_url: \(typeof _urlPDFVista === 'function'[^}]*\? _urlPDFVista\(pdfUrlSync, _nombrePDFHoja\(ot\)\)/.test(s)],
    ['cola offline · aviso a administracion', /_notificarOTCompletada\(ot\.numero[\s\S]{0,300}\? _urlPDFVista\(pdfUrlSync, _nombrePDFHoja\(ot\)\)/.test(s)]
  ];
  sitios.forEach(([etq, ok]) => chequear(ok, etq + ': no arma el enlace con _urlPDFVista'));
  // El sumidero comun deja pasar la URL tal cual: el cambio va en los productores (los correos al
  // local no pasan por aca) y el sello no depende de la URL.
  const notif = sinComentarios(fuente('_notificarOTCompletada') || '');
  chequear(/pdf_url: _url\b/.test(notif) && notif.indexOf('_urlPDFDescarga') === -1 && notif.indexOf('_urlPDFVista') === -1,
    '_notificarOTCompletada transforma la URL: se normaliza en un solo lado y el correo al local queda fuera');
  const buenos = sitios.filter(x => x[1]).length;
  console.log('5) Productores: ' + buenos + ' de ' + sitios.length + ' arman el enlace con _urlPDFVista' + (buenos === sitios.length ? ' ✓' : ' ✗'));
}

// ── 6. Alcance: la app abre la vista (24-09) y lo que promete "Descargar" sigue descargando ─────
{
  const cuerpo = n => sinComentarios(fuente(n) || '');
  // Decision de Bastian del 24-09-2026: son las regresiones de 943888e en la app.
  const VISTA = [
    ['Compartir: enlace de texto (WhatsApp, correo, copiar, varios documentos)', 'compartirDocumentos',
      /var enlaces = validos\.map\(function\(d\)\{ return _urlPDFVista\(d\.url, d\.nombre\); \}\)\.join\('\\n'\);/],
    ['Compartir: navigator.share de un documento', 'compartirDocumentos',
      /await navigator\.share\(\{ title: titulo, text: texto, url: _urlPDFVista\(validos\[0\]\.url, validos\[0\]\.nombre\) \}\);/],
    ['Compartir: "Abrir el PDF" del menu propio', '_compartirPor',
      /window\.open\(_urlPDFVista\(c\.docs\[0\]\.url, c\.docs\[0\]\.nombre\), '_blank'\);/],
    ['Preventivos: Ver PDF', 'cargarPreventivos', /a\.href = cUrl \? _urlPDFVista\(cUrl, _nombrePDFHoja\(hoja\)\) : fUrl;/],
    ['Ver OTs por tecnico: Ver PDF', 'verOTsTecnico', /a\.href = _urlPDFVista\(url, _nombrePDFHoja\(hoja\)\);/],
    // Decision de Bastian del 25-09-2026: el de Cotizaciones tambien.
    ['Cotizaciones: Ver PDF (25-09)', '_renderItemsCotizacion',
      /await _abrirPDFEnPestana\(_urlPDFVista\(url, _nombrePDFCot\(data\)\), pestana, regenera\);/]
  ];
  VISTA.forEach(([etq, fn, re]) => chequear(re.test(cuerpo(fn)),
    etq + ': no entrega la vista con _urlPDFVista (decisiones de Bastian del 24 y 25-09-2026)'));
  // Y ninguno de esos conserva una descarga al lado: ni forzada (_urlPDFDescarga, _urlDescargaCot)
  // ni por bytes (_descargarPDFNombrado). `_abrirPDFEnPestana` y `_abrirConEnlace` reciben la vista
  // ya armada.
  ['compartirDocumentos', '_compartirPor', 'cargarPreventivos', 'verOTsTecnico', '_renderItemsCotizacion', '_abrirPDFEnPestana',
   '_abrirConEnlace'].forEach(fn => {
    const c = cuerpo(fn);
    const usa = ['_urlPDFDescarga', '_urlDescargaCot', '_descargarPDFNombrado'].filter(x => c.indexOf(x) !== -1);
    chequear(!!c && !usa.length, fn + (c ? ' usa ' + usa.join(', ') : ' no existe') +
      ': lo que se comparte o se abre en la app vuelve a obligar a descargar');
  });

  // Lo que se queda con la descarga nombrada, a proposito. Los enlaces del cuerpo de los correos van
  // anclados al `<a href="' + ... + '"` completo: envolverlos en otra funcion (p. ej.
  // `_urlPDFSinNombre(...)`, que les saca el nombre de SMU) tambien es cambiarlos.
  const DESCARGA = [
    ['Compartir: los bytes que se adjuntan', '_archivosParaCompartir', /fetch\(_urlPDFDescarga\(docs\[i\]\.url, docs\[i\]\.nombre\)/],
    // Sin llamadores desde el 25-09-2026 y conservada a proposito: si vuelve a usarse, que descargue.
    ['_descargarPDFNombrado (conservada) arma la descarga nombrada', '_descargarPDFNombrado', /var u = _urlPDFDescarga\(url, nombre\);/],
    ['_urlDescargaCot delega en la descarga nombrada', '_urlDescargaCot', /: _urlPDFDescarga\(url, _nombrePDFCot\(cot\)\);/],
    ['correo de cotizaciones: Descargar CT', '_procesarEnvioCotizaciones', /'<a href="' \+ _urlDescargaCot\(it\) \+ '"/],
    ['correo de cotizaciones: Descargar HS', '_procesarEnvioCotizaciones',
      /'<a href="' \+ _urlPDFDescarga\(it\._hojaEntrega\.url, it\._hojaEntrega\.nombre\) \+ '"/],
    ['correo "Enviar hojas" de preventivos', '_procesarEnvioHojas', /'<a href="' \+ _urlPDFDescarga\(h\.pdfUrl, _nombrePDFHoja\(h\)\) \+ '"/],
    ['Bajas: Ver PDF (ya abre en linea)', 'cargarBajas', /window\.open\(_urlPDFDescarga\(b\.pdfUrlCloudinary\), '_blank'\)/]
  ];
  DESCARGA.forEach(([etq, fn, re]) => chequear(re.test(cuerpo(fn)),
    etq + ': dejo de usar _urlPDFDescarga (fuera del alcance de las decisiones del 24 y 25-09-2026)'));
  ['_archivosParaCompartir', '_descargarPDFNombrado', '_urlDescargaCot', '_procesarEnvioCotizaciones',
   '_procesarEnvioHojas', 'cargarBajas'].forEach(fn =>
    chequear(!!cuerpo(fn) && cuerpo(fn).indexOf('_urlPDFVista') === -1,
      fn + ' usa _urlPDFVista: lo que promete "Descargar" dejaria de descargar (fuera del alcance de las decisiones del 24 y 25-09-2026)'));

  // Exactamente doce llamadas: los cinco productores del correo de la HS, la de la cola
  // (_paramsCorreoCola, que convierte los avisos que dejo encolados la version anterior), las tres
  // de Compartir y los tres "Ver PDF" (Preventivos, Ver OTs por tecnico y, desde el 25-09,
  // Cotizaciones). Una decimotercera es ampliar el alcance sin pasar por una decision.
  const ESPERADAS = 12;
  const llamadas = (plano.match(/(?<!function |typeof )_urlPDFVista\(/g) || []).length;
  const enCola = (sinComentarios(fuente('_paramsCorreoCola') || '').match(/(?<!function |typeof )_urlPDFVista\(/g) || []).length;
  chequear(llamadas === ESPERADAS && enCola === 1, '_urlPDFVista se llama ' + llamadas + ' veces, ' + enCola +
    ' dentro de _paramsCorreoCola (esperado ' + ESPERADAS + ': 5 productores del correo de la HS + 1 en la cola + 3 de Compartir + ' +
    '3 "Ver PDF": Preventivos, Ver OTs por tecnico y Cotizaciones)');
  // La cola la usa en el despacho, y el reenvio marcado se arma SOBRE los params ya convertidos.
  const cola = sinComentarios(fuente('sincronizarCorreosPendientes') || '');
  chequear(/const _base = _paramsCorreoCola\(c\.params, c\.template\);/.test(cola) &&
           /const envio = c\.posibleEnvio \? _paramsReenvio\(_base, c\) : _base;/.test(cola) &&
           /_emailjsSend\(envio, c\.service, c\.template\)/.test(cola),
    'sincronizarCorreosPendientes no despacha con _paramsCorreoCola: un aviso encolado por la version anterior sale con la descarga forzada');
  const nVista = VISTA.filter(([, fn, re]) => re.test(cuerpo(fn))).length;
  const nDesc = DESCARGA.filter(([, fn, re]) => re.test(cuerpo(fn))).length;
  console.log('6) Alcance: ' + nVista + ' de ' + VISTA.length + ' sitios de la app en vista; ' + nDesc + ' de ' + DESCARGA.length +
    ' sitios de descarga intactos; _urlPDFVista en ' + llamadas + ' llamadas (' + enCola + ' en la cola)' +
    (nVista === VISTA.length && nDesc === DESCARGA.length && llamadas === ESPERADAS && enCola === 1 ? ' ✓' : ' ✗'));
}

// Lo que se espera que reciba la otra persona: la vista, con el nombre de SMU en la ruta. Literal,
// no calculado con `_urlPDFVista`: si la funcion cambia, esto no cambia con ella.
const CT_15092601 = CLD + '/raw/upload/v1789474108/emval/cotizaciones/COT_15092601_ceco_SIN_CECO_Destape_piletas_y_camara_107503.pdf';
const NOMBRE_CT = 'CT - 15092601 - ceco 3164 - Destape piletas y camara.pdf';
const VISTA_HS = CLD + '/files/v1789395715/emval/pdfs/Recepcion_Obra_OT796863_qp9imoz/' +
  encodeURIComponent('HS - 796863 - CT 15092601 - ceco 3164 - Destape piletas y camara') + '.pdf';
const VISTA_CT = CLD + '/files/v1789474108/emval/cotizaciones/COT_15092601_ceco_SIN_CECO_Destape_piletas_y_camara_107503/' +
  encodeURIComponent('CT - 15092601 - ceco 3164 - Destape piletas y camara') + '.pdf';
const APP_796863 = 'https://desarrollobastian-design.github.io/emval-app/?pdf=sBE6AgdWrO9XFi9r1q42';

// ── 6b. Compartir, EJECUTADO: lo que recibe la otra persona es la vista ─────────────────────────
async function probarCompartir() {
  const FN = ['_esPDFCompartible', '_nombreDesdeURL', '_archivosParaCompartir', 'compartirDocumentos',
    '_abrirModalCompartir', 'cerrarModalCompartir', '_compartirPor', '_copiarAlPortapapeles'];
  const codC = FN.map(fuente);
  const decls = [/var _COMPARTIR_TIMEOUT_MS = [^;]*;/, /var _compartirActual = [^;]*;/].map(declaracion);
  const faltanC = FN.filter((n, i) => !codC[i]).concat(decls.some(d => !d) ? ['_COMPARTIR_TIMEOUT_MS/_compartirActual'] : []);
  if (faltanC.length) {
    chequear(false, 'no se pudo ejecutar Compartir: falta ' + faltanC.join(', '));
    console.log('6b) Compartir: NO SE PUDO EJECUTAR ✗');
    return;
  }
  // `share`: con menu nativo · `archivos`: el telefono deja adjuntar (canShare + File).
  const montar = ({ share, archivos }) => {
    const reg = { shares: [], abiertos: [], fetches: [], copiado: [], avisos: [], modal: 0 };
    const nodo = () => ({ style: {}, textContent: '', setAttribute() {}, select() {} });
    const sb = {
      console: { log() {}, warn() {}, error() {} },
      toast() {}, _avisar: async m => { reg.avisos.push(String(m)); },
      _modalMostrar() { reg.modal++; }, _modalOcultar() {},
      setTimeout, clearTimeout, AbortController,
      document: { getElementById: () => nodo(), createElement: () => nodo(),
        body: { appendChild() {}, removeChild() {} }, execCommand: () => false },
      navigator: { clipboard: { writeText: async t => { reg.copiado.push(t); } } },
      fetch: async u => { reg.fetches.push(u); return { ok: true, blob: async () => ({ size: 1234 }) }; },
      window: { open: u => { reg.abiertos.push(u); }, location: {} }
    };
    if (share) sb.navigator.share = async d => { reg.shares.push(d); };
    if (archivos) {
      sb.navigator.canShare = () => true;
      sb.File = function (partes, nombre, o) { this.name = nombre; this.type = (o || {}).type; };
    }
    vm.createContext(sb);
    vm.runInContext(decls.join('\n') + '\n' + [cod._nombreAdjuntoSeguro, cod._urlPDFSinNombre, cod._urlPDFDescarga]
      .concat(HAY_VISTA ? [cod._urlPDFVista] : [], codC).join('\n\n'), sb);
    return { sb, reg };
  };
  const HS = { url: RAW_796863, nombre: NOMBRE_SMU }, CT = { url: CT_15092601, nombre: NOMBRE_CT };
  const bien = [];
  const ver = (ok, etq) => { if (chequear(ok, 'Compartir · ' + etq)) bien.push(etq); };
  try {
    // A. Un documento, menu nativo, sin adjuntar: el `url` del share.
    {
      const { sb, reg } = montar({ share: true });
      await sb.compartirDocumentos([HS], { titulo: 't', texto: 'x' });
      const u = reg.shares[0] && reg.shares[0].url;
      ver(u === VISTA_HS, 'un documento por el menu del sistema: se entrego "' + u + '" (esperado la vista ' + VISTA_HS + ')');
    }
    // B. CT + HS, menu nativo, sin adjuntar: los dos enlaces van en el texto.
    {
      const { sb, reg } = montar({ share: true });
      await sb.compartirDocumentos([CT, HS], { titulo: 't', texto: 'x' });
      const d = reg.shares[0] || {};
      const t = String(d.text || '');
      ver(t.indexOf(VISTA_CT) !== -1 && t.indexOf(VISTA_HS) !== -1 && !adjunto(t) && !d.url,
        'CT y HS por el menu del sistema: el texto no trae las dos vistas: ' + JSON.stringify(d));
    }
    // C. Sin menu nativo (PC): el menu propio, con sus cuatro salidas.
    {
      const { sb, reg } = montar({ share: false });
      await sb.compartirDocumentos([HS], { titulo: 'Recepcion de obra', texto: 'x' });
      ver(reg.modal === 1 && reg.shares.length === 0, 'sin menu nativo no se abrio el menu propio');
      await sb._compartirPor('abrir');
      ver(reg.abiertos[0] === VISTA_HS, '"Abrir el PDF" abrio "' + reg.abiertos[0] + '" (esperado la vista)');
      await sb._compartirPor('whatsapp');
      const wa = String(reg.abiertos[1] || '');
      ver(/^https:\/\/wa\.me\/\?text=/.test(wa) && decodeURIComponent(wa).indexOf(VISTA_HS) !== -1 && !adjunto(decodeURIComponent(wa)),
        'WhatsApp no lleva la vista: ' + wa);
      await sb._compartirPor('copiar');
      ver(reg.copiado[0] === VISTA_HS, '"Copiar enlace" copio "' + reg.copiado[0] + '"');
      await sb._compartirPor('correo');
      const mail = decodeURIComponent(String(sb.window.location.href || ''));
      ver(/^mailto:/.test(mail) && mail.indexOf(VISTA_HS) !== -1 && !adjunto(mail), 'el correo del equipo no lleva la vista: ' + mail);
    }
    // D. El telefono deja adjuntar: los BYTES bajan por la descarga nombrada y el archivo lleva el
    //    nombre de SMU. Nadie ve esa URL, y un share con archivos no lleva `url`.
    {
      const { sb, reg } = montar({ share: true, archivos: true });
      await sb.compartirDocumentos([HS], { titulo: 't', texto: 'x' });
      const d = reg.shares[0] || {};
      const f = (d.files || [])[0] || {};
      ver(reg.fetches.length === 1 && adjunto(reg.fetches[0]) && reg.fetches[0] === F._urlPDFDescarga(RAW_796863, NOMBRE_SMU),
        'los bytes adjuntos no se bajaron por la descarga nombrada: ' + reg.fetches.join(' | '));
      ver(f.name === NOMBRE_SMU && f.type === 'application/pdf' && !('url' in d),
        'el archivo adjunto no lleva el nombre de SMU o el share con archivos trae url: ' + JSON.stringify({ name: f.name, type: f.type, url: d.url }));
    }
    // E. El link a la app no se comparte: solo, avisa; junto a un PDF, sale solo el PDF.
    {
      const { sb, reg } = montar({ share: true });
      await sb.compartirDocumentos([{ url: APP_796863, nombre: NOMBRE_SMU }], { titulo: 't', texto: 'x' });
      ver(reg.shares.length === 0 && reg.avisos.length === 1, 'el link a la app se compartio (o no se aviso): ' + JSON.stringify(reg.shares));
      await sb.compartirDocumentos([{ url: APP_796863, nombre: NOMBRE_SMU }, HS], { titulo: 't', texto: 'x' });
      const d = reg.shares[0] || {};
      ver(d.url === VISTA_HS && JSON.stringify(reg.shares).indexOf('?pdf=') === -1,
        'con el link a la app y un PDF no salio solo la vista del PDF: ' + JSON.stringify(d));
    }
  } catch (e) {
    chequear(false, 'Compartir murio al ejecutarse: ' + (e && e.message || e));
  }
  console.log('6b) Compartir ejecutado: ' + bien.length + ' de 11 comprobaciones' + (bien.length === 11 ? ' ✓' : ' ✗') +
    '\n    enlace entregado: ' + VISTA_HS);
}

// ── 6c. Los dos "Ver PDF", EJECUTADOS: el onclick real ───────────────────────────────────────────
function probarVerPDF() {
  // El `(function(...){ return function(){ ... }; })` que se asigna al onclick, sacado tal cual.
  // Los argumentos con que se invoca van LITERALES: la prueba ejecuta la fabrica con sus propios
  // datos, asi que cambiar lo que le pasa la pantalla (la `ot` pelada en vez de
  // `_datosHojaConCot(...)`, que es la que trae la CT y el CECO) no se veria de otra forma.
  const fabrica = re => { const m = src.match(re); return m ? m[1] : null; };
  const txtPrev = fabrica(/btnDesc\.onclick = (\(function\(cUrl, fUrl, hoja\)\{ return function\(\)\{(?:(?!onclick)[\s\S])*?\}; \}\))\(pdfCloudUrl, pdfFirestoreUrl, _datosHojaConCot\(ot, null, cecoValPrev\)\);/);
  const txtOT = fabrica(/btnPdf\.onclick = (\(function\(url, hoja\)\{ return function\(\)\{(?:(?!onclick)[\s\S])*?\}; \}\))\(urlParaVer, datosNombreHojaT\);/);
  if (!txtPrev || !txtOT) {
    chequear(false, 'no se pudo sacar el onclick de "Ver PDF" de ' + (!txtPrev ? 'Preventivos ' : '') + (!txtOT ? 'Ver OTs por tecnico' : '') +
      ' (o cambio lo que le pasa la pantalla: se esperaba (pdfCloudUrl, pdfFirestoreUrl, _datosHojaConCot(ot, null, cecoValPrev))' +
      ' y (urlParaVer, datosNombreHojaT))');
    console.log('6c) Ver PDF: NO SE PUDO EJECUTAR ✗');
    return;
  }
  const reg = { clicks: [], abiertos: [] };
  const sb = {
    console: { log() {}, warn() {}, error() {} },
    document: { createElement: () => ({ click() { reg.clicks.push({ href: this.href, target: this.target }); } }) },
    localStorage: { getItem: k => (k === 'emval_cadenas_cache' ? JSON.stringify([{ nombre: 'M10', sucursales: [{ nombre: 'M10 CONCEPCION', centro: '3164' }] },
      { nombre: 'Unimarc', sucursales: [{ nombre: 'UNIMARC PRUEBA', centro: '713' }] }]) : null) },
    _cecoIdxCache: { raw: null, idx: null }
  };
  sb.window = { ALIAS_LOCALES: { 's10 concepcion': 'M10 CONCEPCION' }, open: (u, t) => { reg.abiertos.push({ u, t }); } };
  vm.createContext(sb);
  vm.runInContext([MESES].concat(NOMBRES.map(n => cod[n]), HAY_VISTA ? [cod._urlPDFVista] : []).join('\n\n') +
    '\nvar __prev = ' + txtPrev + ';\nvar __ot = ' + txtOT + ';', sb);
  const bien = [];
  const ver = (ok, etq) => { if (chequear(ok, 'Ver PDF · ' + etq)) bien.push(etq); };
  const RAW_247863 = CLD + '/raw/upload/v1790265011/emval/pdfs/713-HS%20247863-MP%20Transpaletas%20Septiembre%202026_yrh74lk.pdf';
  const HOJA_247863 = { otNumero: 247863, numero: 247863, tipo: 'preventivo', ceco: '713', local: 'UNIMARC PRUEBA',
    fecha: '15-09-2026', descripcionTrabajo: 'MP Transpaletas' };
  const nombrePrev = F._nombrePDFHoja(HOJA_247863);
  const VISTA_247863 = CLD + '/files/v1790265011/emval/pdfs/713-HS%20247863-MP%20Transpaletas%20Septiembre%202026_yrh74lk/' +
    encodeURIComponent(String(nombrePrev).replace(/\.pdf$/, '')) + '.pdf';
  try {
    chequear(/^HS - 247863 - ceco 0713 - MP Transpaletas /.test(nombrePrev), 'el nombre de la hoja preventiva cambio: "' + nombrePrev + '"');
    // Preventivos
    sb.__prev(RAW_247863, APP_796863, HOJA_247863)();
    ver(reg.clicks[0] && reg.clicks[0].href === VISTA_247863 && reg.clicks[0].target === '_blank',
      'Preventivos con Cloudinary abrio ' + JSON.stringify(reg.clicks[0]) + ' (esperado la vista ' + VISTA_247863 + ')');
    sb.__prev('', APP_796863, HOJA_247863)();
    ver(reg.clicks[1] && reg.clicks[1].href === APP_796863, 'Preventivos sin Cloudinary no abrio el link a la app intacto: ' + JSON.stringify(reg.clicks[1]));
    // Ver OTs por tecnico
    sb.__ot(RAW_796863, DATOS_796863)();
    ver(reg.clicks[2] && reg.clicks[2].href === VISTA_HS && reg.clicks[2].target === '_blank',
      'Ver OTs por tecnico con Cloudinary abrio ' + JSON.stringify(reg.clicks[2]) + ' (esperado la vista)');
    sb.__ot(APP_796863, DATOS_796863)();
    ver(reg.abiertos.length === 1 && reg.abiertos[0].u === APP_796863 && reg.clicks.length === 3,
      'Ver OTs por tecnico con el link a la app no lo abrio intacto: ' + JSON.stringify(reg.abiertos));
  } catch (e) {
    chequear(false, 'Ver PDF murio al ejecutarse: ' + (e && e.message || e));
  }
  console.log('6c) Ver PDF ejecutado (Preventivos y Ver OTs por tecnico): ' + bien.length + ' de 4' + (bien.length === 4 ? ' ✓' : ' ✗') +
    '\n    Preventivos -> ' + ((reg.clicks[0] || {}).href || '(nada)'));
}

// ── 6d. El "Ver PDF" de Cotizaciones, EJECUTADO: el onclick real (decision del 25-09) ─────────────
async function probarVerPDFCotizacion() {
  // La fabrica del onclick, sacada tal cual, con la `data` que se le pase. En main existe igual
  // (descargaba): ahi `_descargarPDFNombrado` es un espia que anota la descarga.
  const m = src.match(/btnPdf\.onclick = (\(function\(data\)\{ return async function\(\)\{(?:(?!onclick)[\s\S])*?\}; \}\))\(it\);/);
  const FN = ['_nombrePDFCot', '_cotFusionada', '_pdfCotObsoleto', '_urlDescargaCot'];
  const codCot = FN.map(fuente);
  const decFormato = declaracion(/var _PDF_COT_FORMATO = \d+;/);
  // No existen en main.
  const ayudantes = ['_esAppInstaladaIOS', '_abrirConEnlace', '_abrirPDFEnPestana'].map(fuente).filter(Boolean);
  const faltanCot = FN.filter((n, i) => !codCot[i])
    .concat(!m ? ['el onclick de "Ver PDF" de Cotizaciones (btnPdf.onclick = (function(data){ ... })(it))'] : [])
    .concat(!decFormato ? ['_PDF_COT_FORMATO'] : []);
  if (faltanCot.length) {
    chequear(false, 'no se pudo ejecutar el "Ver PDF" de Cotizaciones: falta ' + faltanCot.join(', '));
    console.log('6d) Ver PDF de Cotizaciones: NO SE PUDO EJECUTAR ✗');
    return;
  }
  const FORMATO = Number(decFormato.match(/\d+/)[0]);
  // La regeneracion devuelve un PDF NUEVO (otra version, otro public_id), como la subida real.
  const NUEVA = CLD + '/raw/upload/v1790400000/emval/cotizaciones/CT_15092601_ceco_3164_Destape_piletas_y_camara_654321.pdf';
  const VISTA_NUEVA = CLD + '/files/v1790400000/emval/cotizaciones/CT_15092601_ceco_3164_Destape_piletas_y_camara_654321/' +
    encodeURIComponent('CT - 15092601 - ceco 3164 - Destape piletas y camara') + '.pdf';
  // Como esta en Firestore: centro VACIO (el CECO 3164 sale del catalogo por el alias) y PDF vigente.
  const COT = extra => Object.assign({ id: 'cot1', numeroCotizacion: '15092601', local: 'S10 Concepcion', centro: '',
    nombreServicio: 'Destape piletas y camara', descripcionTrabajo: 'Destape piletas y camara',
    pdfUrl: CT_15092601, pdfGeneradoEn: 4102444800000, pdfFormato: FORMATO }, extra || {});
  const VIEJA = { pdfFormato: FORMATO - 1 };   // dibujada por una version anterior: se regenera
  const destino = t => (t ? String(typeof t.location === 'string' ? t.location : (t.location || {}).href) : null);
  const esCld = u => /res\.cloudinary\.com/.test(String(u || ''));

  // window.open con `noopener`/`noreferrer` ABRE y devuelve null (norma HTML): en el codigo eso es
  // un aviso falso de bloqueo, una pestana doble o una pestana del toque sin dueno. Se anota aca.
  const conNoopener = [];

  // abre: lo que devuelve cada window.open, en orden (null = el navegador lo bloqueo; por defecto una
  // pestana) · lento: la regeneracion espera un timer · asegurar: 'ok' | 'falla' | 'lanza' ·
  // avisar: lo que devuelve el aviso (true = tocaron su boton) · cierraAntes: el usuario cierra la
  // pestana del toque mientras se regenera · replaceLanza: la pestana del toque no se deja llevar
  // a otra URL · appIOS: la app instalada de iPhone (`navigator.standalone === true`).
  const correr = async (cot, { abre = [], lento = false, asegurar = 'ok', avisar, cierraAntes = false, replaceLanza = false, appIOS = false } = {}) => {
    const reg = { abiertos: [], pestanas: [], avisos: [], copiados: [], descargas: [], navApp: [], enlaces: [] };
    // La propia app: cualquier intento de llevarla al PDF queda anotado.
    const locApp = { get href() { return 'https://desarrollobastian-design.github.io/emval-app/'; }, set href(u) { reg.navApp.push(String(u)); },
      assign(u) { reg.navApp.push(String(u)); }, replace(u) { reg.navApp.push(String(u)); } };
    const pestanaNueva = u => {
      const t = { closed: false, opener: 'la app', inicial: u, navs: [], document: { title: '', body: { textContent: '' } },
        close() { this.closed = true; } };
      const ir = function (v) { if (replaceLanza) throw new Error('la pestana no se deja navegar'); this.href = v; t.navs.push(v); };
      t.location = { href: 'about:blank', replace: ir, assign: ir };
      return t;
    };
    const sb = {
      console: { log() {}, warn() {}, error() {} },
      setTimeout, clearTimeout,
      toast() {},
      _avisar: async (msg, o) => { reg.avisos.push({ msg: String(msg), o: o || {} }); return avisar; },
      _copiarAlPortapapeles: async t => { reg.copiados.push(t); return true; },
      _descargarPDFNombrado: async (u, n) => { reg.descargas.push({ u, n }); return true; },
      _asegurarPDFCotizacion: async c => {
        if (lento) await new Promise(r => setTimeout(r, 20));
        if (cierraAntes && reg.pestanas[0]) reg.pestanas[0].closed = true;
        if (asegurar === 'lanza') throw new Error('sin señal');
        if (asegurar === 'falla') return '';
        c.pdfUrl = NUEVA;
        return NUEVA;
      },
      localStorage: { getItem: k => (k === 'emval_cadenas_cache' ? JSON.stringify([{ nombre: 'M10', sucursales: [{ nombre: 'M10 CONCEPCION', centro: '3164' }] }]) : null) },
      _cecoIdxCache: { raw: null, idx: null },
      location: locApp,
      // Fuera de la app de iPhone, `navigator.standalone` no existe (Android, PC) o es false.
      navigator: appIOS ? { standalone: true } : {},
      document: {
        location: locApp,
        // Un enlace creado por codigo: su click queda anotado. Sin target _blank llevaria la app.
        createElement: tag => ({ tag: String(tag).toLowerCase(), href: '', target: '', rel: '',
          click() {
            reg.enlaces.push({ tag: this.tag, u: String(this.href), t: this.target, rel: this.rel });
            if (this.target !== '_blank') reg.navApp.push(String(this.href));
          } })
      }
    };
    sb.window = {
      ALIAS_LOCALES: { 's10 concepcion': 'M10 CONCEPCION' },
      location: locApp,
      open: (u, t, f) => {
        reg.abiertos.push({ u: u == null ? '' : String(u), t: t, f: f });
        if (t !== '_blank') reg.navApp.push(String(u));   // '_self' / '_top' llevan la app al PDF
        // En la app instalada de iPhone devuelve null y no abre nada (web.dev, "Window management").
        if (appIOS || abre[reg.abiertos.length - 1] === null) return null;
        const p = pestanaNueva(u);
        reg.pestanas.push(p);
        if (/noopener|noreferrer/i.test(String(f || ''))) { conNoopener.push({ u: String(u || ''), f: String(f) }); return null; }
        return p;
      }
    };
    vm.createContext(sb);
    vm.runInContext([MESES, decFormato].concat(NOMBRES.map(n => cod[n]), HAY_VISTA ? [cod._urlPDFVista] : [], codCot,
      ayudantes).join('\n\n') + '\nvar __cot = ' + m[1] + ';', sb);
    const toque = sb.__cot(cot);
    const p = toque();
    // Lo que paso DENTRO del toque, antes de que corra cualquier await: es lo unico que el navegador
    // deja abrir como pestana.
    const alToque = { n: reg.abiertos.length, primera: reg.abiertos[0] ? reg.abiertos[0].u : null,
      destino: destino(reg.pestanas[0]), enlaces: reg.enlaces.length,
      texto: reg.pestanas[0] ? reg.pestanas[0].document.body.textContent : null };
    let fallo = null;
    try { await p; } catch (e) { fallo = e; }
    return { reg, alToque, fallo, nombre: sb._nombrePDFCot(cot) };
  };

  const bien = [];
  const ver = (ok, etq) => { if (chequear(ok, 'Ver PDF de Cotizaciones · ' + etq)) bien.push(etq); };
  const navApp = [];
  const TOTAL = 26;
  let muestra = '';
  try {
    // A. PDF vigente, sin regenerar: un solo window.open, en el mismo toque, con la vista.
    {
      const r = await correr(COT());
      navApp.push(...r.reg.navApp);
      chequear(r.nombre === NOMBRE_CT, 'Ver PDF de Cotizaciones · el nombre de la CT cambio: "' + r.nombre + '" (esperado "' + NOMBRE_CT + '")');
      muestra = r.reg.abiertos[0] ? r.reg.abiertos[0].u : '(nada)';
      ver(r.alToque.n === 1 && r.alToque.primera === VISTA_CT && r.reg.abiertos.length === 1 && r.reg.abiertos[0].t === '_blank',
        'sin regenerar: se esperaba 1 window.open en el mismo toque con la vista ' + VISTA_CT + '; hubo ' + JSON.stringify(r.reg.abiertos) +
        (r.reg.descargas.length ? ' y DESCARGO ' + JSON.stringify(r.reg.descargas) : ''));
      ver(!r.reg.avisos.length && !r.reg.descargas.length && !r.reg.enlaces.length && !r.fallo,
        'sin regenerar: aviso, descargo, uso un enlace fuera de la app de iPhone o murio: ' +
        JSON.stringify({ avisos: r.reg.avisos, descargas: r.reg.descargas, enlaces: r.reg.enlaces, fallo: r.fallo && r.fallo.message }));
    }
    // B. PDF viejo, regeneracion LENTA: la pestana se abre en el toque y recibe la URL despues.
    {
      const r = await correr(COT(VIEJA), { lento: true });
      navApp.push(...r.reg.navApp);
      const t = r.reg.pestanas[0];
      ver(r.alToque.n === 1 && !esCld(r.alToque.primera) && !esCld(r.alToque.destino),
        'regenerando: la pestana no se abrio en el mismo toque, antes del primer await (el navegador la bloquearia): ' + JSON.stringify(r.alToque));
      ver(!!t && destino(t) === VISTA_NUEVA && !t.closed && r.reg.abiertos.length === 1 && !r.reg.descargas.length,
        'regenerando: la pestana del toque no recibio la vista del PDF nuevo (esperado ' + VISTA_NUEVA + '): ' +
        JSON.stringify({ destino: destino(t), abiertos: r.reg.abiertos, descargas: r.reg.descargas }));
      ver(!!t && t.opener === null && !r.reg.avisos.length && !r.fallo,
        'regenerando: la pestana quedo con acceso a la app (opener) o hubo aviso: ' + JSON.stringify({ opener: t && t.opener, avisos: r.reg.avisos }));
      ver(/Preparando el PDF/.test(r.alToque.texto || ''),
        'regenerando: la pestana del toque queda en blanco mientras sube (sin "Preparando el PDF..."): ' + JSON.stringify(r.alToque.texto));
    }
    // C. Sin PDF todavia, regeneracion RAPIDA (resuelve en el microtask siguiente): igual.
    {
      const r = await correr(COT({ pdfUrl: '' }));
      navApp.push(...r.reg.navApp);
      const t = r.reg.pestanas[0];
      ver(r.alToque.n === 1 && !esCld(r.alToque.primera) && !!t && destino(t) === VISTA_NUEVA && r.reg.abiertos.length === 1 && !t.closed,
        'sin PDF, regeneracion rapida: ' + JSON.stringify({ alToque: r.alToque, destino: destino(t), abiertos: r.reg.abiertos }));
    }
    // D. La regeneracion falla: la pestana del toque se cierra y se avisa como siempre.
    {
      const r = await correr(COT(VIEJA), { lento: true, asegurar: 'falla' });
      navApp.push(...r.reg.navApp);
      const t = r.reg.pestanas[0];
      ver(r.alToque.n === 1 && !!t && t.closed && !t.navs.length && !esCld(destino(t)) && r.reg.abiertos.length === 1,
        'regeneracion fallida: la pestana del toque no se cerro, recibio algo o se abrio otra: ' +
        JSON.stringify({ cerrada: t && t.closed, destino: destino(t), abiertos: r.reg.abiertos }));
      ver(r.reg.avisos.length === 1 && /No se pudo preparar el PDF separado/.test(r.reg.avisos[0].msg) && !r.fallo,
        'regeneracion fallida: no aviso como siempre: ' + JSON.stringify(r.reg.avisos));
    }
    // E. La regeneracion LANZA: el error no escapa del boton y la pestana tampoco queda en blanco.
    {
      const r = await correr(COT(VIEJA), { lento: true, asegurar: 'lanza' });
      navApp.push(...r.reg.navApp);
      const t = r.reg.pestanas[0];
      ver(!r.fallo && !!t && t.closed && r.reg.avisos.length === 1 && /No se pudo preparar el PDF separado/.test(r.reg.avisos[0].msg),
        'regeneracion que lanza: ' + JSON.stringify({ escapo: r.fallo && r.fallo.message, cerrada: t && t.closed, avisos: r.reg.avisos }));
    }
    // D2/E2. Falla (o lanza) Y el navegador bloqueo la pestana del toque: el caso tipico de un
    //    telefono con bloqueador y sin senal. Igual se avisa, una vez, y no se abre nada de Cloudinary.
    //    Sin pestana y sin aviso, el toque quedaria en silencio.
    for (const asegurar of ['falla', 'lanza']) {
      const r = await correr(COT(VIEJA), { lento: true, asegurar, abre: [null] });
      navApp.push(...r.reg.navApp);
      ver(!r.fallo && r.reg.avisos.length === 1 && /No se pudo preparar el PDF separado/.test(r.reg.avisos[0].msg) &&
          r.reg.abiertos.length === 1 && !r.reg.abiertos.some(x => esCld(x.u)) && !r.reg.enlaces.length,
        'regeneracion ' + (asegurar === 'falla' ? 'fallida' : 'que lanza') + ' con la pestana del toque bloqueada: se esperaba 1 aviso y nada abierto: ' +
        JSON.stringify({ escapo: r.fallo && r.fallo.message, avisos: r.reg.avisos, abiertos: r.reg.abiertos }));
    }
    // F. El bloqueador devuelve null incluso en el toque: al terminar se intenta otra pestana y, si
    //    tambien es null, se ofrece el enlace con un boton.
    {
      const r = await correr(COT(VIEJA), { lento: true, abre: [null, null] });
      navApp.push(...r.reg.navApp);
      ver(r.alToque.n === 1 && r.reg.abiertos.length === 2 && r.reg.abiertos[1].u === VISTA_NUEVA && r.reg.abiertos[1].t === '_blank',
        'bloqueador: al terminar no se intento window.open con la vista: ' + JSON.stringify(r.reg.abiertos));
      ver(r.reg.avisos.length === 1 && r.reg.avisos[0].o.okTexto === 'Abrir el PDF' && !r.reg.copiados.length,
        'bloqueador: no se ofrecio el enlace con _avisar (boton "Abrir el PDF"): ' + JSON.stringify(r.reg.avisos));
    }
    // G. ... y el toque en "Abrir el PDF" (un gesto nuevo) abre la vista.
    {
      const r = await correr(COT(VIEJA), { lento: true, abre: [null, null], avisar: true });
      navApp.push(...r.reg.navApp);
      ver(r.reg.abiertos.length === 3 && r.reg.abiertos[2].u === VISTA_NUEVA && r.reg.abiertos[2].t === '_blank',
        '"Abrir el PDF" del aviso no abrio la vista: ' + JSON.stringify(r.reg.abiertos));
    }
    // H. ... y si ni asi se abre, el enlace queda copiado.
    {
      const r = await correr(COT(VIEJA), { lento: true, abre: [null, null, null], avisar: true });
      navApp.push(...r.reg.navApp);
      ver(r.reg.copiados.length === 1 && r.reg.copiados[0] === VISTA_NUEVA,
        'con todo bloqueado, el enlace no quedo copiado: ' + JSON.stringify(r.reg.copiados));
    }
    // I. Sin regenerar y bloqueado tambien: se ofrece el enlace.
    {
      const r = await correr(COT(), { abre: [null] });
      navApp.push(...r.reg.navApp);
      ver(r.reg.abiertos.length === 1 && r.reg.abiertos[0].u === VISTA_CT && r.reg.avisos.length === 1 && r.reg.avisos[0].o.okTexto === 'Abrir el PDF',
        'sin regenerar y bloqueado: no se ofrecio el enlace: ' + JSON.stringify({ abiertos: r.reg.abiertos, avisos: r.reg.avisos }));
    }
    // J. El usuario cerro la pestana del toque mientras se regeneraba: se abre otra, no se escribe
    //    en la cerrada.
    {
      const r = await correr(COT(VIEJA), { lento: true, cierraAntes: true });
      navApp.push(...r.reg.navApp);
      const t = r.reg.pestanas[0];
      ver(r.reg.abiertos.length === 2 && r.reg.abiertos[1].u === VISTA_NUEVA && !!t && !t.navs.length,
        'con la pestana del toque cerrada no se abrio otra con la vista: ' + JSON.stringify({ abiertos: r.reg.abiertos, navsCerrada: t && t.navs }));
    }
    // J2. La pestana del toque no se deja llevar al PDF (lanza al navegarla): se abre otra con la
    //    vista, sin rendirse en silencio.
    {
      const r = await correr(COT(VIEJA), { lento: true, replaceLanza: true });
      navApp.push(...r.reg.navApp);
      ver(r.reg.abiertos.length === 2 && r.reg.abiertos[1].u === VISTA_NUEVA && r.reg.abiertos[1].t === '_blank' && !r.reg.avisos.length && !r.fallo,
        'la pestana del toque no se dejo llevar al PDF y no se abrio otra con la vista: ' +
        JSON.stringify({ abiertos: r.reg.abiertos, avisos: r.reg.avisos, fallo: r.fallo && r.fallo.message }));
    }
    // K. El link a la app (`?pdf=`) sale intacto.
    {
      const r = await correr(COT({ pdfUrl: APP_796863 }));
      navApp.push(...r.reg.navApp);
      ver(r.alToque.n === 1 && r.reg.abiertos.length === 1 && r.reg.abiertos[0].u === APP_796863,
        'el link a la app no se abrio intacto: ' + JSON.stringify({ abiertos: r.reg.abiertos, descargas: r.reg.descargas }));
    }
    // L. App instalada de iPhone (`navigator.standalone`): ahi window.open devuelve null y no abre
    //    nada. Sin regenerar: un enlace target _blank en el mismo toque, con la vista; ningun
    //    window.open y ningun aviso de bloqueo falso.
    {
      const r = await correr(COT(), { appIOS: true });
      navApp.push(...r.reg.navApp);
      ver(r.alToque.enlaces === 1 && r.reg.enlaces.length === 1 && r.reg.enlaces[0].u === VISTA_CT && r.reg.enlaces[0].t === '_blank' &&
          !r.reg.abiertos.length && !r.reg.avisos.length && !r.fallo,
        'app de iPhone, sin regenerar: se esperaba un enlace target _blank en el mismo toque con la vista y ningun window.open: ' +
        JSON.stringify({ alToque: r.alToque, enlaces: r.reg.enlaces, abiertos: r.reg.abiertos, avisos: r.reg.avisos }));
    }
    // M. ... regenerando: sin pestana previa (no la hay que abrir) y, al terminar, el aviso "PDF
    //    listo". Sin su toque no se abre nada: el toque del boton ya vencio.
    {
      const r = await correr(COT(VIEJA), { appIOS: true, lento: true });
      navApp.push(...r.reg.navApp);
      ver(!r.reg.abiertos.length && !r.reg.enlaces.length && r.reg.avisos.length === 1 &&
          r.reg.avisos[0].o.okTexto === 'Abrir el PDF' && !/bloque/i.test(r.reg.avisos[0].msg) && !r.fallo,
        'app de iPhone, regenerando: se esperaba el aviso "PDF listo" con "Abrir el PDF" y nada abierto sin su toque: ' +
        JSON.stringify({ abiertos: r.reg.abiertos, enlaces: r.reg.enlaces, avisos: r.reg.avisos }));
    }
    // N. ... y su toque abre el enlace con la vista del PDF nuevo.
    {
      const r = await correr(COT(VIEJA), { appIOS: true, lento: true, avisar: true });
      navApp.push(...r.reg.navApp);
      ver(!r.reg.abiertos.length && r.reg.enlaces.length === 1 && r.reg.enlaces[0].u === VISTA_NUEVA && r.reg.enlaces[0].t === '_blank',
        'app de iPhone: el toque en "Abrir el PDF" no abrio la vista nueva: ' + JSON.stringify({ abiertos: r.reg.abiertos, enlaces: r.reg.enlaces }));
    }
    // O. ... y si la regeneracion falla, el aviso de siempre, sin enlace ni pestana.
    {
      const r = await correr(COT(VIEJA), { appIOS: true, lento: true, asegurar: 'falla', avisar: true });
      navApp.push(...r.reg.navApp);
      ver(!r.reg.abiertos.length && !r.reg.enlaces.length && r.reg.avisos.length === 1 && /No se pudo preparar el PDF separado/.test(r.reg.avisos[0].msg),
        'app de iPhone, regeneracion fallida: ' + JSON.stringify({ abiertos: r.reg.abiertos, enlaces: r.reg.enlaces, avisos: r.reg.avisos }));
    }
    // Ningun window.open con noopener/noreferrer: abre y devuelve null (norma HTML).
    ver(!conNoopener.length, 'window.open con noopener/noreferrer devuelve null aunque abra (aviso falso, pestana doble o pestana del toque sin dueno): ' +
      JSON.stringify(conNoopener));
    // Y en ningun caso la app se lleva a si misma al PDF: en la app instalada no queda como volver.
    ver(!navApp.length, 'la app se navego a si misma hacia el PDF: ' + navApp.join(' | '));
  } catch (e) {
    chequear(false, 'Ver PDF de Cotizaciones murio al ejecutarse: ' + (e && e.message || e));
  }
  console.log('6d) Ver PDF de Cotizaciones ejecutado: ' + bien.length + ' de ' + TOTAL + (bien.length === TOTAL ? ' ✓' : ' ✗') +
    '\n    sin regenerar -> ' + muestra);
}

// ── 7. El rescate de la cola, EJECUTADO: los dos correos salen con el enlace de vista ──────────
(async function () {
  await probarCompartir();
  probarVerPDF();
  await probarVerPDFCotizacion();

  const extra = ['_numOTCorreo', '_notificarOTCompletada', '_urlPDFSiYaEsta', '_leerEnlacesPDFPendientes',
    '_escribirEnlacesPDFPendientes', '_encolarEnlacePDF', 'sincronizarEnlacesPDFPendientes'];
  const codExtra = extra.map(fuente);
  const decl = [/const _SELLO_SIN_PDF = [^;]*;/, /const _NOTA_SIN_PDF = [\s\S]*?;\n/, /var _KEY_ENLACES_PDF = [^;]*;/].map(declaracion);
  if (codExtra.some(c => !c) || decl.some(d => !d)) {
    chequear(false, 'no se pudo extraer el rescate de la cola de enlaces: ' +
      extra.filter((n, i) => !codExtra[i]).join(', '));
  } else {
    const store = {
      emval_cadenas_cache: JSON.stringify([{ nombre: 'M10', sucursales: [{ nombre: 'M10 CONCEPCION', centro: '3164' }] }])
    };
    const enviados = [];
    const sandbox = {
      console: { log() {}, warn() {}, error() {} },
      localStorage: {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; }
      },
      navigator: { onLine: true },
      CLOUDINARY: { cloudName: 'dcrf29tna' },
      _enviarCorreo: async (params, opts) => { enviados.push({ params, sello: (opts || {}).sello || '' }); return true; },
      _fetchConTimeout: async () => ({ ok: true }),     // el HEAD del rescate: el archivo ya esta arriba
      _conTimeout: async p => await p,
      toast() {}, _bloqueoCorreosVigente: () => null, _textoBloqueoCorreos: () => '',
      _cecoIdxCache: { raw: null, idx: null }
    };
    sandbox.window = {
      ALIAS_LOCALES: { 's10 concepcion': 'M10 CONCEPCION' },
      PEDRO_NOTIF_EMAIL: 'cotizaciones.emval@gmail.com',
      _firebaseReady: true,
      firebase: { firestore: () => ({ collection: () => ({ doc: () => ({ update: async () => true }) }) }) }
    };
    vm.createContext(sandbox);
    vm.runInContext([MESES].concat(decl, NOMBRES.map(n => cod[n]), HAY_VISTA ? [cod._urlPDFVista] : [], codExtra).join('\n\n'), sandbox);

    // Tal como el cierre sin señal: ninguna URL, solo el public_id y el aviso congelado del snap.
    sandbox._encolarEnlacePDF('ot_mu1by0re_qp9imoz', '', '', {
      publicId: 'emval/pdfs/Recepcion_Obra_OT796863_qp9imoz.pdf',
      aviso: { numero: 796863, local: 'S10 Concepcion', tecnico: 'Lucas Fernandez', tipo: 'correctivo',
        fecha: '14-09-2026', clientId: 'ot_mu1by0re_qp9imoz', emailLocal: 'local.prueba@ejemplo.cl',
        trabajo: 'Asistencia por piletas tapadas en sector Venta Asistida.\n- Se realiza limpieza.',
        ceco: '', cotizacionNumero: '15092601' }
    });
    await sandbox.sincronizarEnlacesPDFPendientes();

    const admin = enviados.find(e => e.params.email_admin === 'cotizaciones.emval@gmail.com');
    const local = enviados.find(e => e.params.email_admin === 'local.prueba@ejemplo.cl');
    chequear(enviados.length === 2 && !!admin && !!local, 'el rescate no mando los dos correos (salieron ' + enviados.length + ')');
    const base = CLD + '/files/emval/pdfs/Recepcion_Obra_OT796863_qp9imoz/';
    [['administracion (la copia de Pedro)', admin], ['local', local]].forEach(([etq, c]) => {
      const u = c ? String(c.params.pdf_url || '') : '';
      chequear(!adjunto(u), 'rescate · ' + etq + ': el enlace trae fl_attachment, obliga a descargar: ' + u);
      chequear(u.indexOf(base) === 0 && /^HS - 796863 - CT 15092601 - ceco 3164 - /.test(sufijo(u) || ''),
        'rescate · ' + etq + ': el enlace no es la vista con el nombre de SMU: ' + u);
    });
    // El sello no cambio: el aviso rescatado es CON PDF (sin __sinpdf).
    chequear(!!admin && admin.sello === 'ot_ot_mu1by0re_qp9imoz__admin', 'el sello del aviso rescatado cambio: ' + (admin && admin.sello));
    console.log('7) Rescate ejecutado: ' + (admin ? 'administracion -> ' + admin.params.pdf_url : 'sin correo') +
      (admin && !adjunto(admin.params.pdf_url) && String(admin.params.pdf_url).indexOf(base) === 0 ? ' ✓' : ' ✗'));
  }

  // ── 7b. La cola de correos, EJECUTADA: lo que dejo encolado la version anterior sale en vista ──
  {
    // Las funciones de la cola se sacan del propio archivo, no de una lista fija: las `_xxx(` que usa
    // sincronizarCorreosPendientes y existen como `function` de nivel superior, y las que usan esas
    // (transitivo, con tope). Asi el guion corre igual contra main y contra una rama que le sume
    // ayudantes a la cola (la del correo mal escrito agrega _problemaDireccionCorreo,
    // _textoDireccionMala y _textoEsDeDestinatario). Lo que el sandbox espia NO se extrae: el envio
    // real (`_emailjsSend`) nunca entra al sandbox.
    const ESPIAS_COLA = ['toast', 'actualizarIndicadorPendientes', '_reportarEstadoCorreos', '_ejecutarPostCorreo', '_emailjsSend'];
    const TOPE_COLA = 40;
    const depsCola = raiz => {
      const orden = [], vistos = new Set(ESPIAS_COLA), porVer = [raiz];
      while (porVer.length) {
        const n = porVer.shift();
        if (vistos.has(n)) continue;
        vistos.add(n);
        const f = fuente(n);
        if (!f) continue;   // no es una function de nivel superior del archivo: no se extrae
        orden.push(n);
        if (orden.length > TOPE_COLA) return { orden, tope: true };
        (sinComentarios(f).match(/(?<![\w$.])_[\w$]+(?=\()/g) || []).forEach(u => { if (!vistos.has(u)) porVer.push(u); });
      }
      return { orden, tope: false };
    };
    const extCola = depsCola('sincronizarCorreosPendientes');
    const COLA_FN = extCola.orden;
    const codCola = COLA_FN.map(fuente);
    const consts = (src.match(/^const _CORREOS_[A-Z_]+ = [^\n]*;/gm) || []).join('\n') + '\n' +
      (src.match(/^const _EMAILJS_(SERVICE|TEMPLATE)_OT += [^\n]*;/gm) || []).join('\n') + '\nlet _sincronizandoCorreos = false;\n';
    const motivoCola = COLA_FN.indexOf('sincronizarCorreosPendientes') === -1 ? 'no esta sincronizarCorreosPendientes'
      : extCola.tope ? 'arrastra mas de ' + TOPE_COLA + ' funciones, revisar la extraccion (' + COLA_FN.join(', ') + ')'
      : !HAY_VISTA ? 'falta _urlPDFVista' : '';
    if (motivoCola) {
      chequear(false, 'no se pudo ejecutar la cola de correos: ' + motivoCola +
        ' — un aviso encolado por la version anterior sale con la descarga forzada');
      console.log('7b) Cola de correos: NO SE PUDO EJECUTAR ✗');
    } else {
      // Como los arma la v59: params congelados con `fl_attachment`. Es el caso inferido del telefono
      // de Lucas (OT 271080, 24-09, ver `_paramsCorreoCola`): `alertas` conto 2 pendientes.
      const RAW_271080 = CLD + '/raw/upload/v1790277412/emval/pdfs/-HS%20271080-MP%20Transpaletas%20Septiembre%202026_03wt921.pdf';
      const NOMBRE_271080 = 'HS - 271080 - ceco 3164 - MP Transpaletas Septiembre 2026.pdf';
      const FL_271080 = F._urlPDFDescarga(RAW_271080, NOMBRE_271080);
      const BAJA = CLD + '/raw/upload/v1788193245/emval/bajas/31082601_Baja_de_activo_UNIMARC_YUMBEL_s01lkwh.pdf';
      const APP = 'https://desarrollobastian-design.github.io/emval-app/?pdf=9aOCvw35QWBX5ARqrlPS';
      const it = (email, pdf, extra) => Object.assign({ clave: email + '|271080', intentos: 0, creadoEn: Date.now(), fallido: false,
        proximoIntento: 0, ultimoError: 'sin conexión', service: '', template: '', post: null, despacho: '', posibleEnvio: false, intentadoEn: 0,
        params: { email_admin: email, ot_numero: '271080', local: 'S10 Concepcion', tipo: 'Preventivo', trabajo: 'x', pdf_url: pdf } }, extra || {});
      const correr = async (cola, falla) => {
        const store = { emval_correos_pendientes: JSON.stringify(cola) };
        const posts = [];
        const sb = {
          console: { log() {}, warn() {}, error() {} },
          localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
          navigator: { onLine: true }, emailjs: {}, window: {},
          toast() {}, actualizarIndicadorPendientes() {}, _reportarEstadoCorreos: async () => {}, _ejecutarPostCorreo: async () => {},
          _emailjsSend: async (params, service, template) => {
            posts.push({ params: JSON.parse(JSON.stringify(params)), template: template || '' });
            if (falla) { const e = new Error('Failed to fetch'); e._fase = 'no-salio'; throw e; }
            return { status: 200 };
          }
        };
        // Ningun espia puede quedar pisado por la funcion real del archivo.
        const pisados = COLA_FN.filter(n => n in sb);
        if (pisados.length) throw new Error('la extraccion de la cola iba a pisar espias del sandbox: ' + pisados.join(', '));
        vm.createContext(sb);
        vm.runInContext(consts + codCola.join('\n\n'), sb);
        await sb.sincronizarCorreosPendientes();
        return { posts, store, libro: JSON.parse(store.emval_correos_despachados || '{}'), quedan: JSON.parse(store.emval_correos_pendientes || '[]') };
      };
      const cola = [
        it('local.s10@ejemplo.cl', FL_271080, { despacho: 'ot_ot_muftutz1_03wt921__local' }),
        it('cotizaciones.emval@gmail.com', FL_271080, { despacho: 'ot_ot_muftutz1_03wt921__admin' }),
        it('supervisor@ejemplo.cl', FL_271080, { despacho: 'ot_dudoso', posibleEnvio: true, intentadoEn: Date.now() }),
        it('local.baja@ejemplo.cl', BAJA, { clave: 'baja', despacho: 'baja_1__local' }),
        it('local.app@ejemplo.cl', APP, { clave: 'app', despacho: 'ot_app__local' }),
        it('local.raw@ejemplo.cl', RAW_271080, { clave: 'raw', despacho: 'ot_raw__local' }),
        it('sup@smu.cl', FL_271080, { clave: 'cot', template: 'template_63rsw4i', despacho: 'cot_1' })
      ];
      const r = await correr(JSON.parse(JSON.stringify(cola)), false);
      const de = email => r.posts.find(p => p.params.email_admin === email) || { params: {} };
      const baseV = CLD + '/files/v1790277412/emval/pdfs/-HS%20271080-MP%20Transpaletas%20Septiembre%202026_03wt921/';
      chequear(r.posts.length === cola.length, 'la cola no despacho los ' + cola.length + ' avisos (salieron ' + r.posts.length + ')');
      [['correo al local', 'local.s10@ejemplo.cl'], ['copia a administracion (la de Pedro)', 'cotizaciones.emval@gmail.com'],
       ['reenvio marcado', 'supervisor@ejemplo.cl']].forEach(([etq, email]) => {
        const u = String(de(email).params.pdf_url || '');
        chequear(!adjunto(u) && u.indexOf(baseV) === 0 && sufijo(u) === NOMBRE_271080,
          'cola · ' + etq + ': un aviso encolado por la version anterior sale con "' + u + '" (esperado la vista con el nombre de SMU)');
      });
      chequear(de('supervisor@ejemplo.cl').params.ot_numero === '271080 (REENVIO)', 'cola · el reenvio perdio su marca: ' + de('supervisor@ejemplo.cl').params.ot_numero);
      chequear(de('local.baja@ejemplo.cl').params.pdf_url === BAJA, 'cola · la baja salio con otro enlace: ' + de('local.baja@ejemplo.cl').params.pdf_url);
      chequear(de('local.app@ejemplo.cl').params.pdf_url === APP, 'cola · el link a la app salio modificado: ' + de('local.app@ejemplo.cl').params.pdf_url);
      chequear(de('local.raw@ejemplo.cl').params.pdf_url === RAW_271080, 'cola · una raw sin nombre forzado salio modificada: ' + de('local.raw@ejemplo.cl').params.pdf_url);
      chequear(de('sup@smu.cl').params.pdf_url === FL_271080, 'cola · el template de cotizaciones se toco (alcance cerrado): ' + de('sup@smu.cl').params.pdf_url);
      chequear(cola.every(c => r.libro[c.despacho]), 'cola · el libro de despachos no anoto los despachos de siempre: el sello cambio');
      // Un envio que falla: nada sale, y lo que queda en la cola es el aviso TAL COMO ESTABA.
      const f = await correr(JSON.parse(JSON.stringify(cola.slice(0, 2))), true);
      chequear(f.quedan.length === 2 && f.quedan.every((c, i) => c.params.pdf_url === cola[i].params.pdf_url && c.clave === cola[i].clave),
        'cola · un aviso que no salio quedo distinto en la cola');
      const u = String(de('cotizaciones.emval@gmail.com').params.pdf_url || '');
      console.log('7b) Cola de correos (' + COLA_FN.length + ' funciones sacadas del archivo): aviso encolado por la version anterior -> ' + u +
        (!adjunto(u) && u.indexOf(baseV) === 0 ? ' ✓' : ' ✗'));
    }
  }

  // ── 8. Contra Cloudinary de verdad ─────────────────────────────────────────────────────────────
  if (PROD) {
    const head = url => {
      let cab = '';
      try { cab = execFileSync('curl', ['-s', '-I', '--max-time', '25', url], { encoding: 'utf8' }); }
      catch (e) { cab = String(e.stdout || ''); }
      // Con redirecciones se miran las ultimas cabeceras.
      const bloques = cab.split(/\r?\n\r?\n/).filter(b => /^HTTP\//.test(b));
      const ult = bloques[bloques.length - 1] || '';
      const h = n => ((ult.match(new RegExp('^' + n + ':\\s*(.*)$', 'mi')) || [])[1] || '').trim();
      return { code: (ult.match(/^HTTP\/\S+\s+(\d+)/) || [])[1], tipo: h('content-type'), disp: h('content-disposition'),
               etag: h('etag'), largo: h('content-length') };
    };
    const CASOS = [
      ['HS 796863 correctiva con version', RAW_796863, NOMBRE_SMU],
      ['HS 247863 preventiva con %20', CLD + '/raw/upload/v1790265011/emval/pdfs/713-HS%20247863-MP%20Transpaletas%20Septiembre%202026_yrh74lk.pdf',
        'HS - 247863 - ceco 0713 - MP Transpaletas Septiembre 2026.pdf'],
      ['HS 119335 sin version (rescate)', CLD + '/raw/upload/emval/pdfs/Recepcion_Obra_OT119335_wkovvwr.pdf', 'HS - 119335 - ceco 0000 - Rescate.pdf'],
      ['HS 347723 regenerada _v2', CLD + '/raw/upload/v1789071876/emval/pdfs/Recepcion_Obra_OT347723_eepszxb_v2.pdf',
        'HS - 347723 - CT 19082601 - ceco 0000 - Palmetas 50x50.pdf'],
      ['HS 796863 con fl_attachment previo sucio',
        RAW_796863.replace('/raw/upload/', '/raw/upload/fl_attachment:' + encodeURIComponent('HS - Venta Asistida.-') + '/'), NOMBRE_SMU],
      // El enlace con que la v59 encola el aviso de la OT 271080 (el caso inferido del 24-09), tal
      // como lo convierte la cola al despacharlo: sin nombre nuevo, con el que traia el fl_attachment.
      ['HS 271080 encolada por la v59 (cola de correos)',
        F._urlPDFDescarga(CLD + '/raw/upload/v1790277412/emval/pdfs/-HS%20271080-MP%20Transpaletas%20Septiembre%202026_03wt921.pdf',
          'HS - 271080 - ceco 3164 - MP Transpaletas Septiembre 2026.pdf'), ''],
      // Compartir tambien entrega CT y bajas (decision del 24-09): otras carpetas de Cloudinary. La CT
      // es tambien la que abre el "Ver PDF" de Cotizaciones sin regenerar (decision del 25-09, 6d).
      ['CT 15092601 (Compartir y Ver PDF de Cotizaciones)', CT_15092601, NOMBRE_CT],
      ['Baja 31082601 (Compartir baja)', CLD + '/raw/upload/v1788193245/emval/bajas/31082601_Baja_de_activo_UNIMARC_YUMBEL_s01lkwh.pdf',
        'Baja de activo - 31082601 - UNIMARC YUMBEL.pdf']
    ];
    CASOS.forEach(([etq, raw, nombre]) => {
      const url = vista(raw, nombre);
      if (!url) { chequear(false, etq + ': sin _urlPDFVista no hay enlace que medir'); return; }
      const v = head(url), c = head(F._urlPDFSinNombre(raw));
      const ok = v.code === '200' && /^application\/pdf/i.test(v.tipo) && !/attachment/i.test(v.disp) &&
        !!v.etag && v.etag === c.etag && v.largo === c.largo;
      chequear(ok, etq + ': HTTP ' + v.code + ' ' + v.tipo + ' disp="' + v.disp + '" etag ' + v.etag + ' vs raw ' + c.etag);
      console.log('8) ' + etq + ': HTTP ' + v.code + ' ' + v.tipo + (v.disp ? ' disp="' + v.disp + '"' : ' sin Content-Disposition') +
        (v.etag === c.etag ? ' · mismo archivo que la raw' : ' · ETag distinto') + (ok ? ' ✓' : ' ✗'));
      console.log('   ' + url);
    });
    // Linea de control: la DESCARGA nombrada del mismo archivo si trae attachment.
    const ctrl = head(F._urlPDFDescarga(RAW_796863, NOMBRE_SMU));
    chequear(ctrl.code === '200' && /attachment/i.test(ctrl.disp),
      'linea de control: la URL de descarga no trajo attachment (' + ctrl.code + ' "' + ctrl.disp + '"): el HEAD no esta midiendo');
    console.log('8) Control, descarga nombrada: HTTP ' + ctrl.code + ' disp="' + ctrl.disp + '"' + (/attachment/i.test(ctrl.disp) ? ' ✓' : ' ✗'));
  } else {
    console.log('8) Cloudinary: omitido (correr con --prod para el HEAD de verdad)');
  }

  // ── 9. El service worker sube de version respecto de origin/main, si hay algo que publicar ──────
  // Sin el bump el telefono sigue sirviendo el index.html viejo desde la cache y el arreglo no llega.
  // Al integrar esta rama encima de otra que ya subio el SW (la del correo mal escrito sube a v60),
  // quedarse con el numero de la otra rama es el olvido tipico: por eso se compara contra main.
  // Pero solo cuando el index.html medido DIFIERE del de origin/main: ya fusionado, main contra si
  // mismo no tiene nada que publicar, y exigir "mayor" lo haria fallar para siempre.
  {
    const path = require('path');
    const dir = path.dirname(path.resolve(RUTA));
    const swAlLado = path.join(dir, 'sw.js');
    const verSW = t => { const m = String(t || '').match(/const CACHE_NAME = 'emval-v(\d+)';/); return m ? Number(m[1]) : null; };
    const gitShow = ref => {
      try {
        return { txt: execFileSync('git', ['-C', dir, 'show', ref], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }), err: '' };
      } catch (e) { return { txt: null, err: String((e && (e.stderr || e.message)) || e).trim().split(/\r?\n/)[0] }; }
    };
    if (!fs.existsSync(swAlLado)) {
      console.log('9) Service worker: OMITIDO, AVISO — no hay sw.js junto a ' + RUTA + ': el bump del CACHE_NAME no se midio');
    } else {
      const idxMain = gitShow('origin/main:index.html');
      if (idxMain.txt === null) {
        console.log('9) Service worker: OMITIDO, AVISO — git no pudo leer origin/main:index.html (' + idxMain.err + '): el bump del CACHE_NAME no se midio');
      } else if (idxMain.txt.replace(/\r\n/g, '\n') === src) {
        // `src` ya viene normalizado a LF.
        console.log('9) Service worker: OMITIDO, AVISO — ' + path.basename(RUTA) + ' es igual al de origin/main: nada que publicar, el bump no aplica');
      } else {
        const swMain = gitShow('origin/main:sw.js');
        const vAca = verSW(fs.readFileSync(swAlLado, 'utf8'));
        const vMain = swMain.txt === null ? null : verSW(swMain.txt);
        if (vAca === null || vMain === null) {
          chequear(false, 'no se pudo leer el CACHE_NAME de sw.js (' +
            (vAca === null ? 'junto a ' + path.basename(RUTA) : 'en origin/main' + (swMain.err ? ': ' + swMain.err : '')) +
            '): se esperaba "const CACHE_NAME = \'emval-v<N>\';" y sin eso el bump no se puede medir');
          console.log('9) Service worker: no se pudo leer el CACHE_NAME de sw.js ✗');
        } else {
          const ok = vAca > vMain;
          chequear(ok, 'sw.js: CACHE_NAME emval-v' + vAca + ' no es mayor que el de origin/main (emval-v' + vMain +
            '), y ' + path.basename(RUTA) + ' difiere de origin/main: el telefono seguiria con la app vieja en cache');
          console.log('9) Service worker: ' + path.basename(RUTA) + ' difiere de origin/main; emval-v' + vAca + ' a su lado, emval-v' + vMain +
            ' en origin/main (ref local, sin fetch)' + (ok ? ' ✓' : ' ✗'));
        }
      }
    }
  }

  console.log('');
  if (fallos.length) {
    console.error('FALLOS (' + fallos.length + '):\n' + fallos.join('\n'));
    process.exit(1);
  }
  console.log('OK (' + oks + ' comprobaciones) — el correo de la HS abre en linea y el archivo conserva el nombre de SMU.');
})().catch(e => { console.error('FALLA: el guion murio — ' + (e && e.stack || e)); process.exit(1); });
