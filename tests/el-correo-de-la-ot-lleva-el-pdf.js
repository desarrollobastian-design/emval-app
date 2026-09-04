/* Prueba de regresion — el correo de la OT llega con el enlace al PDF, o dice por que no.

   EL CASO (OT #484304, 03-09-2026, UNIMARC CORONEL 3, Nelson Herrera). Pedro: "Mira, llego sin
   archivo adjunto". En la captura, el texto "Descargar PDF de Recepcion de Obra" sale en NEGRO
   y sin ser enlace: Gmail descarta un <a href=""> y lo deja como texto muerto.

   NADA SE PERDIO. Verificado por REST y con un HEAD a Cloudinary:
     - el PDF esta arriba, integro: 183.959 bytes, guardado a las 21:47:34 UTC
     - pdfs/P5hAmmJNCtZgZtB1v7vM quedo con pdfUrlCloudinary = "" (string vacio)
     - ordenes/ot_mtm21do0_83gl1f0 tiene pdfUrlCloudinary PERO NO tiene el campo pdfUrl

   Ese ultimo detalle es la prueba dura de la causa: el bloque que enlaza el PDF en el cierre
   escribe SIEMPRE las dos claves juntas, aunque vayan vacias. Que `pdfUrl` este AUSENTE
   significa que ese bloque nunca corrio — o sea que al armar los correos NO se conocia ninguna
   URL. La que si tiene la orden la escribio despues la cola, que es el unico camino que toca
   `pdfUrlCloudinary` sin tocar `pdfUrl`.

   LA SECUENCIA:
     21:47:13  el telefono se rinde con las dos llamadas (guardias de tiempo). Las dos SI habian
               llegado al servidor: un timeout no es un fallo, es NO SABER.
     21:47:33  sale el aviso a administracion con pdf_url = ''  <- el que Pedro fotografio
     21:47:34  Cloudinary termina de guardar el PDF (21 s despues del abort)
     21:47:55  la cola offline rescata la URL, la enlaza en la orden y vuelve a llamar al aviso
               CON el enlace bueno... y `_yaDespachado` lo suprime por compartir sello.

   EL BUG DE FONDO: el libro de despachos sabia reconocer "el mismo aviso", pero no "el mismo
   aviso con MEJOR CONTENIDO". El correo bueno existia y se tiraba a la basura.

   Frecuencia medida: 1 caso en los 155 registros modernos de `pdfs` y 1 en las 50 OT cerradas
   desde el fix del 13-08. Aislado en frecuencia — pero el mecanismo le vuelve a pegar a
   cualquier hoja que se cierre sin señal.

   Uso:  node tests/el-correo-de-la-ot-lleva-el-pdf.js index.html   (desde la raiz del repo)
   Sale 0 si el aviso corregido puede salir y ninguno se duplica; 1 si alguna garantia se cayo. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RUTA = process.argv[2] || 'index.html';
// index.html se guarda con CRLF. Se normaliza para que los marcadores de extraccion —que llevan
// saltos de linea— no dependan del final de linea con que quedo guardado el archivo.
const src = fs.readFileSync(RUTA, 'utf8').replace(/\r\n/g, '\n');

let fallos = 0, oks = 0;
function ok(msg) { oks++; console.log('  ok  ' + msg); }
function mal(msg, detalle) {
  fallos++;
  console.log('  MAL ' + msg + (detalle ? '\n        ' + detalle : ''));
}
function bloque(t) { console.log('\n' + t); }

function extraer(desde, hasta) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('No se encontro: ' + desde);
  const j = src.indexOf(hasta, i + desde.length);
  if (j < 0) throw new Error('No se encontro el fin de: ' + desde);
  return src.slice(i, j);
}

/* Despojador de comentarios. El codigo de este proyecto EXPLICA lo que no se debe hacer, asi
   que un test que busca sobre el texto crudo se dispara con la propia advertencia que existe
   para evitar el bug. Misma leccion que en baja-de-activo-no-cobra.js. */
function sinComentarios(txt) {
  return txt.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Se extrae el codigo REAL de index.html. Si alguien renombra una de estas funciones el test se
// cae con "No se encontro", y eso es a proposito: avisa que el fix hay que revalidarlo.
// ─────────────────────────────────────────────────────────────────────────────────────────────
let codSellos, codClave, codDesp, codNumOT, codNotificar, codNombre, codRescate, codEnlaces;
try {
  codSellos    = extraer('const _CORREOS_DESPACHADOS_KEY =', '// Espera antes del proximo intento');
  codClave     = extraer('function _claveCorreo(params, template)', 'function _cargarDespachados');
  codDesp      = extraer('function _cargarDespachados()', '// Cuanto tardan en morir los envios');
  codNumOT     = extraer('function _numOTCorreo(n)', '\n}') + '\n}';
  codNotificar = extraer('async function _notificarOTCompletada(', '\nasync function guardarEnFirebase');
  codNombre    = extraer('function _nombreArchivoPDF(snap)', '\n\n/* ─── RESCATE');
  codRescate   = extraer('function _publicIdPDFCloudinary(snap)', '\nasync function guardarYEnviarPDF');
  codEnlaces   = extraer('var _KEY_ENLACES_PDF =', '\nfunction _abrirDBOffline');
} catch (e) {
  // Contra el codigo anterior al fix estas funciones NO EXISTEN. Se reporta como falla legible
  // y no como un stack trace: un guion que muere feo se parece demasiado a uno que aprueba.
  console.log('\nFALLA: no se pudo extraer el codigo del fix — ' + e.message);
  console.log('       El aviso de la OT puede volver a salir sin su PDF.');
  process.exit(1);
}

const TODO = [codSellos, codClave, codDesp, codNumOT, codNotificar, codNombre, codRescate, codEnlaces].join('\n');

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Arnes: localStorage, fetch y Firestore falsos. No toca la red ni produccion.
// ─────────────────────────────────────────────────────────────────────────────────────────────
function montar(opciones) {
  opciones = opciones || {};
  const store = {};
  const enviados = [];          // cada correo que _enviarCorreo dejo pasar
  const headsPedidos = [];      // cada URL a la que se le pregunto
  const updates = [];           // cada update() a 'ordenes'

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    Date, JSON, Math, Object, String, Number, Boolean, Array, Promise, encodeURI,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    navigator: { onLine: opciones.online !== false },
    _EMAILJS_TEMPLATE_OT: 'template_agzfcux',
    CLOUDINARY: { cloudName: 'dcrf29tna', apiKey: '791549653552789', uploadPreset: 'emval_unsigned' },
    // El envio real no se ejecuta: se registra que salio y con que. Marca el despacho igual que
    // la app, que es lo que hace posible medir la dedupe.
    _enviarCorreo: async function (params, opts) {
      const id = sandbox._idDespacho(params, opts || {});
      if (sandbox._yaDespachado(id)) return true;      // suprimido por el libro
      enviados.push({ params, sello: (opts || {}).sello || '', despacho: id });
      sandbox._marcarDespachado(id);
      return true;
    },
    _fetchConTimeout: async function (url, opts) {
      headsPedidos.push({ url, metodo: (opts || {}).method || 'GET' });
      if (opciones.headTira) throw new Error('red caida');
      return { ok: !!opciones.headOk };
    },
    _conTimeout: async function (p) {
      if (opciones.updateFalla) throw new Error('unavailable');
      return await p;
    },
    toast() {}, _error() {}, _avisar: async () => {},
    estado: {}
  };
  sandbox.window = {
    PEDRO_NOTIF_EMAIL: 'cotizaciones.emval@gmail.com',
    _firebaseReady: true,
    firebase: {
      firestore: () => ({
        collection: () => ({
          doc: () => ({ update: async c => { updates.push(c); return true; } })
        })
      })
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(TODO, sandbox);
  return { sandbox, enviados, headsPedidos, updates, store };
}

const AVISO = {
  numero: 484304, local: 'UNIMARC CORONEL 3', tecnico: 'Nelson Herrera', tipo: 'correctivo',
  fecha: '03-09-2026', clientId: 'ot_mtm21do0_83gl1f0'
};
const URL_PDF = 'https://res.cloudinary.com/dcrf29tna/raw/upload/emval/pdfs/x.pdf';

(async function main() {

  // ===========================================================================================
  bloque('1 · El aviso corregido SALE — es el correo que la OT 484304 perdio');
  // ===========================================================================================
  {
    const { sandbox, enviados } = montar();
    // Tal como paso: primero el aviso sin enlace (cierre sin señal)...
    await sandbox._notificarOTCompletada(AVISO.numero, AVISO.local, AVISO.tecnico, AVISO.tipo,
      AVISO.fecha, '', '', AVISO.clientId);
    // ...y 22 s despues la cola rescata la URL y vuelve a avisar, ahora CON el enlace.
    await sandbox._notificarOTCompletada(AVISO.numero, AVISO.local, AVISO.tecnico, AVISO.tipo,
      AVISO.fecha, URL_PDF, '', AVISO.clientId);

    if (enviados.length !== 2) {
      mal('el aviso corregido no salio: se despacharon ' + enviados.length + ' de 2',
        'Es el bug exacto de la 484304: el libro de despachos se comio el unico correo con enlace.');
    } else if (!enviados[1].params.pdf_url) {
      mal('el segundo aviso salio sin enlace');
    } else {
      ok('el aviso sin PDF y el aviso con PDF son DOS despachos distintos');
    }

    if (enviados[0] && enviados[1] && enviados[0].despacho === enviados[1].despacho) {
      mal('los dos avisos comparten el id de despacho', enviados[0].despacho);
    } else {
      ok('los sellos difieren: ' + (enviados[0] || {}).despacho + '  vs  ' + (enviados[1] || {}).despacho);
    }

    // Y al reves tambien: si el bueno sale primero, el "sin pdf" que llegue despues no lo pisa
    // ni se pierde. El orden entre los dos productores no esta garantizado.
    const b = montar();
    await b.sandbox._notificarOTCompletada(1, 'L', 'T', 'correctivo', 'f', URL_PDF, '', 'ot_r');
    await b.sandbox._notificarOTCompletada(1, 'L', 'T', 'correctivo', 'f', '', '', 'ot_r');
    if (b.enviados.length !== 2) mal('en orden inverso se perdio un aviso');
    else ok('en orden inverso tambien salen los dos');
  }

  // ===========================================================================================
  bloque('2 · La dedupe sigue viva: nadie recibe el mismo aviso dos veces');
  // ===========================================================================================
  {
    const { sandbox, enviados } = montar();
    // Dos avisos CON pdf (los dos productores: el cierre y la cola offline).
    await sandbox._notificarOTCompletada(484304, 'L', 'T', 'correctivo', 'f', URL_PDF, '', 'ot_a');
    await sandbox._notificarOTCompletada(484304, 'L', 'T', 'correctivo', 'f', URL_PDF, '', 'ot_a');
    const conPdf = enviados.filter(e => e.params.pdf_url).length;
    if (conPdf !== 1) mal('el aviso CON pdf se duplico (' + conPdf + ' envios)');
    else ok('dos avisos con PDF → sale uno solo');

    // Y dos avisos SIN pdf tampoco se duplican entre si.
    await sandbox._notificarOTCompletada(999999, 'L2', 'T', 'correctivo', 'f', '', '', 'ot_b');
    await sandbox._notificarOTCompletada(999999, 'L2', 'T', 'correctivo', 'f', '', '', 'ot_b');
    const sinPdf = enviados.filter(e => !e.params.pdf_url).length;
    if (sinPdf !== 1) mal('el aviso SIN pdf se duplico (' + sinPdf + ' envios)');
    else ok('dos avisos sin PDF → sale uno solo');
  }

  // ===========================================================================================
  bloque('3 · Un aviso sin enlace DICE que no lo trae');
  // ===========================================================================================
  {
    const { sandbox, enviados } = montar();
    await sandbox._notificarOTCompletada(484304, 'L', 'T', 'correctivo', 'f', '', '', 'ot_c');
    const cuerpo = String(((enviados[0] || {}).params || {}).trabajo || '');
    if (!cuerpo.includes('segundo correo')) {
      mal('el aviso sin PDF no avisa que el comprobante viene despues',
        'Sin esto el correo llega con el "Descargar PDF" muerto y se lee como que el sistema fallo.');
    } else ok('el cuerpo explica que el PDF llega en un segundo correo');

    // Y la nota NO puede aparecer cuando el enlace si viaja.
    await sandbox._notificarOTCompletada(1, 'L', 'T', 'correctivo', 'f', URL_PDF, '', 'ot_d');
    const conLink = enviados.find(e => e.params.pdf_url);
    if (conLink && String(conLink.params.trabajo).includes('no se pudo confirmar')) {
      mal('el aviso CON enlace igual dice que el PDF no esta');
    } else ok('con enlace, el aviso no arrastra la nota');
  }

  // ===========================================================================================
  bloque('4 · La nota no pisa el aviso de "el local no tiene correo configurado"');
  // ===========================================================================================
  {
    const { sandbox, enviados } = montar();
    // Los dos motivos a la vez. Ninguno puede tapar al otro: el segundo es como se supo que
    // 17 de 147 OT no le llegaban al local.
    await sandbox._notificarOTCompletada(484304, 'L', 'T', 'correctivo', 'f', '',
      'ATENCION: el local "L" no tiene correo configurado, no se le envio la OT.', 'ot_e');
    const cuerpo = String((enviados[0] || {}).params.trabajo || '');
    if (!cuerpo.includes('no tiene correo configurado')) mal('se perdio el aviso de local sin correo');
    else if (!cuerpo.includes('segundo correo')) mal('se perdio la nota del PDF pendiente');
    else ok('los dos avisos conviven en el cuerpo');
  }

  // ===========================================================================================
  bloque('5 · La URL derivada se COMPRUEBA, nunca se adivina');
  // ===========================================================================================
  {
    const pub = 'emval/pdfs/Recepcion_Obra_OT484304_83gl1f0.pdf';
    const a = montar({ headOk: true });     // el archivo esta arriba
    const b = montar({ headOk: false });    // no esta
    const c = montar({ headTira: true });   // no se pudo preguntar

    const rA = await a.sandbox._urlPDFSiYaEsta(pub);
    const rB = await b.sandbox._urlPDFSiYaEsta(pub);
    const rC = await c.sandbox._urlPDFSiYaEsta(pub);

    if (!rA || !rA.includes(pub)) mal('con el archivo arriba no devolvio la URL', String(rA));
    else ok('archivo presente → devuelve la URL derivada');

    if (rB !== '') mal('con 404 devolvio una URL igual', String(rB));
    else ok('archivo ausente → vacio (no se manda un enlace roto)');

    if (rC !== '') mal('con la red caida invento una URL', String(rC));
    else ok('red caida → vacio: "no pude preguntar" no es "si esta"');

    if (!a.headsPedidos.length || a.headsPedidos[0].metodo !== 'HEAD') {
      mal('la comprobacion no usa HEAD',
        'Un GET baja los 180 KB del PDF en el plan de datos del tecnico, en terreno.');
    } else ok('se comprueba con HEAD, no bajando el archivo');

    // La URL derivada NO lleva el segmento de version: es lo que la hace construible.
    if (/\/v\d+\//.test(rA)) mal('la URL derivada trae un numero de version inventado', rA);
    else ok('la URL derivada va sin el segmento /v<numero>/');

    const d = montar({ headOk: true });
    const rD = await d.sandbox._urlPDFSiYaEsta('');
    if (rD !== '' || d.headsPedidos.length) mal('pregunto por un publicId vacio');
    else ok('sin publicId no se pregunta nada');
  }

  // ===========================================================================================
  bloque('6 · El public_id derivado es EL MISMO que se sube');
  // ===========================================================================================
  {
    const { sandbox } = montar();
    const snap = { tipo: 'correctivo', otNumero: 484304, clientId: 'ot_mtm21do0_83gl1f0', ceco: '966' };
    const pub = sandbox._publicIdPDFCloudinary(snap);
    // El de produccion, leido de la URL real de la OT 484304.
    const ESPERADO = 'emval/pdfs/Recepcion_Obra_OT484304_83gl1f0.pdf';
    if (pub !== ESPERADO) {
      mal('el public_id derivado no calza con el de produccion',
        'derivado: ' + pub + '\n        real:     ' + ESPERADO);
    } else ok('coincide con la URL real de la OT 484304');

    // Y tiene que seguir el MISMO formato que arma la subida, o el rescate apunta a otro archivo.
    const subida = src.match(/formData\.append\('public_id',([^\n]+)\);/);
    if (!subida) mal('no se encontro el public_id de la subida a Cloudinary');
    else if (!/_nombreArchivoPDF\(snap\)[\s\S]*slice\(-7\)/.test(subida[1])) {
      mal('la subida ya no arma el public_id como el rescate lo deriva', subida[1].trim());
    } else ok('la subida y el rescate arman el mismo nombre');

    // Sin clientId no se puede derivar nada: mejor vacio que un nombre a medias que da 404.
    if (sandbox._publicIdPDFCloudinary({ tipo: 'correctivo', otNumero: 1 }) !== '') {
      mal('deriva un public_id sin clientId');
    } else ok('sin clientId no inventa un nombre');
  }

  // ===========================================================================================
  bloque('7 · La red de seguridad ya no se apaga cuando mas se necesita');
  // ===========================================================================================
  {
    // Antes: con las dos URLs vacias, _encolarEnlacePDF hacia return y no quedaba nada. Ese era
    // justo el escenario de la 484304.
    const { sandbox } = montar();
    sandbox._encolarEnlacePDF('ot_x', '', '', { publicId: 'emval/pdfs/a.pdf', aviso: AVISO });
    const lista = sandbox._leerEnlacesPDFPendientes();
    if (lista.length !== 1) mal('sin URL pero con publicId no se encolo nada');
    else if (!lista[0].publicId) mal('se encolo sin el publicId: no hay por que preguntar');
    else ok('sin URL, queda encargado el rescate');

    // Pero sin nada que preguntar tampoco se encola basura.
    const s2 = montar().sandbox;
    s2._encolarEnlacePDF('ot_y', '', '', null);
    if (s2._leerEnlacesPDFPendientes().length !== 0) mal('encolo un enlace sin URL y sin publicId');
    else ok('sin URL y sin publicId → no se encola nada');

    // Y sin documento al que enlazar, nunca.
    const s3 = montar().sandbox;
    s3._encolarEnlacePDF('', '', '', { publicId: 'emval/pdfs/a.pdf' });
    if (s3._leerEnlacesPDFPendientes().length !== 0) mal('encolo un enlace sin OT a la que aplicarlo');
    else ok('sin OT destino → no se encola');
  }

  // ===========================================================================================
  bloque('8 · El rescate: si el PDF no aparecio, el enlace NO se descarta');
  // ===========================================================================================
  {
    const { sandbox, updates, enviados } = montar({ headOk: false });
    sandbox._encolarEnlacePDF('ot_mtm21do0_83gl1f0', '', '', { publicId: 'emval/pdfs/a.pdf', aviso: AVISO });
    await sandbox.sincronizarEnlacesPDFPendientes();
    if (sandbox._leerEnlacesPDFPendientes().length !== 1) {
      mal('el enlace se perdio al no encontrar el PDF',
        'Invariante de las cuatro colas: el codigo nunca borra lo que no logro aplicar.');
    } else ok('el PDF todavia no esta → el enlace sigue pendiente');
    if (updates.length) mal('escribio en la orden sin tener URL');
    else ok('no toca la orden sin URL');
    if (enviados.length) mal('mando un aviso prometiendo un PDF que no encontro');
    else ok('no manda ningun correo');
  }

  // ===========================================================================================
  bloque('9 · El rescate exitoso enlaza la OT y manda el aviso corregido');
  // ===========================================================================================
  {
    const { sandbox, updates, enviados } = montar({ headOk: true });
    const aviso = Object.assign({}, AVISO, { emailLocal: 'local@unimarc.cl', trabajo: 'Se cambiaron enchufes' });
    sandbox._encolarEnlacePDF('ot_mtm21do0_83gl1f0', '', '', { publicId: 'emval/pdfs/a.pdf', aviso });
    await sandbox.sincronizarEnlacesPDFPendientes();

    if (sandbox._leerEnlacesPDFPendientes().length !== 0) mal('el enlace aplicado siguio en la cola');
    else ok('aplicado → sale de la cola');

    if (!updates.length || !updates[0].pdfUrlCloudinary) mal('no enlazo la URL en la orden');
    else ok('la orden queda enlazada');

    // Y NUNCA se pisa pdfUrl con vacio: dejaria la OT peor que antes de reintentar.
    if (updates.length && 'pdfUrl' in updates[0] && !updates[0].pdfUrl) {
      mal('escribio pdfUrl vacio y piso un enlace que podia estar bueno');
    } else ok('solo escribe los campos con valor');

    const admin = enviados.filter(e => e.params.email_admin === 'cotizaciones.emval@gmail.com');
    const local = enviados.filter(e => e.params.email_admin === 'local@unimarc.cl');
    if (admin.length !== 1 || !admin[0].params.pdf_url) mal('administracion no recibio el aviso corregido');
    else ok('administracion recibe el aviso CON el enlace');
    if (local.length !== 1 || !local[0].params.pdf_url) mal('el local no recibio su comprobante');
    else ok('el local recibe su comprobante con el enlace');
  }

  // ===========================================================================================
  bloque('10 · Si el enlace no se pudo escribir, NO se promete el PDF por correo');
  // ===========================================================================================
  {
    const { sandbox, enviados } = montar({ headOk: true, updateFalla: true });
    const aviso = Object.assign({}, AVISO, { emailLocal: 'local@unimarc.cl' });
    sandbox._encolarEnlacePDF('ot_z', '', '', { publicId: 'emval/pdfs/a.pdf', aviso });
    await sandbox.sincronizarEnlacesPDFPendientes();
    if (enviados.length) {
      mal('mando el aviso aunque la orden no quedo enlazada',
        'El correo iria antes que el dato, como en la baja cuyo Cloudinary fallaba.');
    } else ok('sin enlace escrito, no sale correo');
    if (sandbox._leerEnlacesPDFPendientes().length !== 1) mal('ademas perdio el enlace');
    else ok('y el enlace sigue pendiente para el proximo ciclo');
  }

  // ===========================================================================================
  bloque('11 · Guardias estructurales del archivo');
  // ===========================================================================================
  {
    // El cierre no puede volver a mandar el aviso con un sello ciego al PDF.
    if (!/_SELLO_SIN_PDF/.test(sinComentarios(codNotificar))) {
      mal('_notificarOTCompletada ya no distingue el aviso sin PDF',
        'Sin el sufijo, el aviso corregido vuelve a morir en el libro de despachos.');
    } else ok('_notificarOTCompletada aplica el sufijo del sello');

    // Ninguna llamada de red sin guardia de tiempo. Es la regla que el proyecto ya tenia escrita
    // y que el propio caso 484304 volvio a cobrar.
    if (/[^_]\bfetch\s*\(/.test(sinComentarios(codRescate))) {
      mal('el rescate usa fetch pelado', 'Con la señal MUERTA un fetch no se rinde nunca.');
    } else ok('el rescate va con _fetchConTimeout');

    // El aviso corregido tiene que dispararse DESPUES del update, no antes.
    const cola = sinComentarios(codEnlaces);
    const iUpdate = cola.indexOf('reintento enlace pdf');
    const iAviso = cola.indexOf('_notificarOTCompletada');
    if (iUpdate < 0 || iAviso < 0) mal('no se encontro el orden update → aviso en la cola de enlaces');
    else if (iAviso < iUpdate) mal('el aviso corregido sale antes de escribir el enlace');
    else ok('primero se escribe el enlace, despues se avisa');

    // El toast del cierre no puede prometer un PDF que no viajo.
    const cierre = sinComentarios(extraer('const email = snap.email;', '// --- Actualizar orden en Firestore'));
    if (!/segundo correo/.test(cierre)) {
      mal('el toast del cierre sigue diciendo "Email enviado con PDF" sin comprobarlo');
    } else ok('el toast dice la verdad cuando el PDF no viajo');

    /* El correo al LOCAL necesita el mismo sufijo que el de administracion, y por la misma
       razon: la cola offline reenvia ese correo con el enlace bueno (`ot_<id>__local`) y sin el
       sufijo en el primero, el libro de despachos se come el segundo. El local se queda sin su
       comprobante y nadie se entera — es el aviso que a UNIMARC CORONEL 3 todavia no le llega.
       Se vigila aqui y no ejecutandolo porque vive dentro de guardarYEnviarPDF, que necesita
       jsPDF, camara y canvas: eso lo cubre la prueba de navegador. */
    const selloLocal = cierre.match(/sello:\s*'ot_'\s*\+\s*snap\.clientId\s*\+\s*'__local'([^}]*)}/);
    if (!selloLocal) mal('no se encontro el sello del correo al local en el cierre');
    else if (!/_SELLO_SIN_PDF/.test(selloLocal[1])) {
      mal('el correo al local vuelve a llevar un sello ciego al PDF',
        'Sin el sufijo, el reenvio con el enlace bueno lo suprime el libro de despachos.');
    } else ok('el correo al local tambien distingue el aviso sin PDF');

    // El Service Worker tiene que subir, o el tecnico se queda con la version vieja cacheada.
    try {
      const sw = fs.readFileSync(path.join(path.dirname(RUTA) || '.', 'sw.js'), 'utf8');
      const m = sw.match(/emval-v(\d+)/);
      if (!m || parseInt(m[1], 10) < 53) {
        mal('el Service Worker no subio de version (' + (m ? m[0] : '?') + ')',
          'Sin eso, el telefono sigue sirviendo el index.html cacheado y el fix no llega.');
      } else ok('Service Worker en ' + m[0]);
    } catch (e) { mal('no se pudo leer sw.js', e.message); }
  }

  // ===========================================================================================
  // Linea de control. Contra el codigo anterior faltan funciones enteras y el guion muere a
  // mitad de camino — y un guion que muere en silencio se parece demasiado a uno que aprueba.
  // ===========================================================================================
  console.log('\n' + '─'.repeat(78));
  console.log(oks + ' comprobaciones ok, ' + fallos + ' fallidas');
  if (fallos) {
    console.log('\nFALLA: el correo de la OT puede volver a llegar sin su PDF.');
    process.exit(1);
  }
  console.log('\nOK: el aviso corregido sale, ninguno se duplica, y ningun enlace se pierde.');
  process.exit(0);
})().catch(function (e) {
  console.log('\nFALLA: el guion murio antes de terminar — ' + (e && e.message));
  process.exit(1);
});
