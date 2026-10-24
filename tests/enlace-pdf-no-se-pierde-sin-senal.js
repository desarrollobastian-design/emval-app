/* Prueba de regresion — cerrar una OT sin señal no puede colgar la app ni perder el enlace del PDF.

   Hallazgo del 13-08-2026, mientras se probaba otra cosa (el campo de pendientes y materiales en
   un teléfono emulado sin señal). El arnes reporto "1 escritura a la nube estando sin señal" y al
   mirarla aparecio un problema PREEXISTENTE, ajeno a ese campo:

   `guardarYEnviarPDF` hacia TRES llamadas a Firestore sin `_conTimeout`. El propio proyecto ya
   tenia la regla escrita —"el SDK de Firestore, con mala señal y sin persistencia, deja el
   add()/set() colgado sin resolver ni rechazar"— y este sitio se habia quedado fuera de la lista.

   Lo que pasaba de verdad al cerrar sin señal (peor que "falla callada"):
     1. `db.collection('pdfs').add(...)` NO fallaba: se colgaba para siempre.
     2. Como estaba con `await`, la funcion moria ahi. Nunca corria el correo al local, nunca
        corria `_notificarOTCompletada` (el aviso a administracion) — y ninguno de los dos
        alcanzaba siquiera a entrar en su cola de reintento, que existe justo para esto.
     3. El enlace del PDF en el documento de la orden se perdia sin dejar rastro reintentable:
        el PDF quedaba en Cloudinary y Firestore nunca lo apuntaba. Es el escenario que la
        memoria `pdf-en-cloudinary-fuente-paralela` documenta como ya ocurrido en produccion.

   Los invariantes que vigila este test:
     1. Ninguna escritura/lectura a Firestore dentro de `guardarYEnviarPDF` queda sin `_conTimeout`
        (ni la subida a Cloudinary sin `_fetchConTimeout`). Es el error concreto que se cometio.
     2. El enlace que no se logro escribir se ENCOLA en el dispositivo, no se pierde.
     3. El reintento usa `update()`, NUNCA `set({merge})`: la OT puede no existir todavia en
        Firestore (sigue en la cola del telefono) y un merge la crearia con dos campos sueltos —
        una orden fantasma, sin numero ni tipo, colandose en las listas.
     4. El reintento NO pisa con '' un enlace que ya estaba bueno.
     5. Un enlace que no se logra aplicar NO se borra de la cola (mismo invariante que la cola
        de correos: o se escribe, o sigue pendiente).
     6. (Revision de Codex, ronda 4 del PR #64) Dos corridas a la vez de la cola no aplican el mismo
        enlace dos veces: corre una, y la otra despues.

   Uso:  node tests/enlace-pdf-no-se-pierde-sin-senal.js index.html
   Sale 0 si los cinco invariantes se sostienen; 1 si alguno se rompio. */

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); }

// Corta un bloque de codigo por llaves balanceadas desde un indice dado.
function hastaCierre(desde) {
  let j = src.indexOf('{', desde), prof = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (prof === 0) return k + 1; }
  }
  return -1;
}

function cuerpoDe(nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  const fin = hastaCierre(i);
  return fin < 0 ? null : src.slice(i, fin);
}

console.log('Cerrar sin señal no cuelga la app ni pierde el enlace del PDF\n');

// ── 1. Ninguna llamada a la nube sin guardia de tiempo, dentro de guardarYEnviarPDF ──────────
{
  const cuerpo = cuerpoDe('guardarYEnviarPDF');
  chequear(!!cuerpo, 'no se encontro guardarYEnviarPDF en index.html');
  if (cuerpo) {
    // `await db.collection(...)` a secas es exactamente la forma que se colgaba. La forma
    // correcta es `await _conTimeout(db.collection(...)...)`.
    const desnudas = (cuerpo.match(/await\s+db\s*\.\s*collection\(/g) || []).length;
    chequear(desnudas === 0,
      'hay ' + desnudas + ' llamada(s) a Firestore sin _conTimeout dentro de guardarYEnviarPDF ' +
      '(sin señal se cuelgan y matan el correo y el aviso a administracion)');

    const fetchPelado = (cuerpo.match(/await\s+fetch\(/g) || []).length;
    chequear(fetchPelado === 0,
      'la subida a Cloudinary usa fetch() pelado: con la señal muerta no se rinde nunca. ' +
      'Va con _fetchConTimeout, igual que su gemelo _subirPDFaCloudinary');

    chequear(/_conTimeout\(db\.collection\('pdfs'\)\.add\(/.test(cuerpo.replace(/\s+/g, ' ')) ||
             /_conTimeout\(\s*db\.collection\('pdfs'\)\.add\(/.test(cuerpo),
      'el add() a la coleccion pdfs perdio su _conTimeout — era el punto exacto del cuelgue');

    console.log('1) Llamadas a la nube con guardia de tiempo: ' +
      (desnudas === 0 && fetchPelado === 0 ? 'todas ✓' : 'quedo alguna suelta ✗'));
  }
}

// ── 2. El enlace que no se pudo escribir se encola en vez de perderse ────────────────────────
{
  const cuerpo = cuerpoDe('guardarYEnviarPDF') || '';
  // El catch del bloque que enlaza el PDF en la orden tiene que dejar rastro reintentable.
  chequear(/_encolarEnlacePDF\(/.test(cuerpo),
    'guardarYEnviarPDF ya no encola el enlace del PDF cuando la escritura falla: vuelve a ' +
    'quedar un PDF en Cloudinary que Firestore no apunta, sin nadie que lo reintente');
  console.log('2) El enlace fallido se encola: ' + (/_encolarEnlacePDF\(/.test(cuerpo) ? 'si ✓' : 'no ✗'));
}

// ── 3, 4 y 5. La cola de enlaces, ejecutada de verdad con stubs ──────────────────────────────
{
  const iKey = src.indexOf('var _KEY_ENLACES_PDF');
  const iSync = src.indexOf('async function sincronizarEnlacesPDFPendientes(');
  chequear(iKey >= 0 && iSync > iKey, 'no se encontro la cola de enlaces de PDF en index.html');

  if (iKey >= 0 && iSync > iKey) {
    const bloque = src.slice(iKey, hastaCierre(iSync));

    // Stubs minimos: un localStorage de mentira y un Firestore que anota lo que le piden.
    const almacen = {};
    const localStorageFalso = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(almacen, k) ? almacen[k] : null; },
      setItem: function (k, v) { almacen[k] = String(v); },
    };
    const escrituras = [];
    let fallarEscritura = false, demora = 0, compuerta = null, avisos = 0, compuertaAviso = null, correosLocal = 0;
    const docFalso = {
      update: function (campos) {
        escrituras.push({ tipo: 'update', campos: campos });
        if (fallarEscritura) return Promise.reject(new Error('unavailable'));
        if (compuerta) { const g = compuerta; compuerta = null; return g; }   // el primer update se queda dormido
        return demora ? new Promise(function (r) { setTimeout(r, demora); }) : Promise.resolve();
      },
      set: function (campos, opts) {
        escrituras.push({ tipo: 'set', campos: campos, opts: opts });
        return Promise.resolve();
      },
    };
    const windowFalso = {
      _firebaseReady: true,
      firebase: { firestore: function () { return { collection: function () { return { doc: function () { return docFalso; } }; } }; } },
    };

    const fabricar = new Function(
      'localStorage', 'window', 'navigator', 'console', '_conTimeout', '_notificarOTCompletada', '_numOTCorreo', '_enviarCorreo',
      bloque + '\n return { encolar: _encolarEnlacePDF, leer: _leerEnlacesPDFPendientes, sincronizar: sincronizarEnlacesPDFPendientes };'
    );
    const api = fabricar(
      localStorageFalso, windowFalso, { onLine: true },
      { log: function () {}, warn: function () {} },
      function (p) { return p; },         // _conTimeout transparente: aca no se prueba el timeout
      async function () {                 // el aviso a administracion, contado
        if (compuertaAviso) { const g = compuertaAviso; compuertaAviso = null; await g; }
        avisos++;
      },
      function (n) { return String(n); },
      async function () { correosLocal++; }   // el correo al local, contado
    );

    (async function () {
      // a) No se encola basura: sin doc o sin ninguna URL no hay nada que enlazar.
      api.encolar('', 'https://x/a.pdf', '');
      api.encolar('ot-1', '', '');
      chequear(api.leer().length === 0, 'se encolo un enlace sin documento o sin ninguna URL');

      // b) Dedupe por OT: si se regenera el PDF, el enlace bueno es el ultimo.
      api.encolar('ot-1', 'https://app/?pdf=viejo', 'https://cloud/viejo.pdf');
      api.encolar('ot-1', 'https://app/?pdf=nuevo', 'https://cloud/nuevo.pdf');
      const cola = api.leer();
      chequear(cola.length === 1 && cola[0].pdfUrl === 'https://app/?pdf=nuevo',
        'la cola guarda dos enlaces de la misma OT o se quedo con el viejo');

      // c) INVARIANTE: el reintento no pisa con '' un enlace que ya estaba bueno.
      almacen[Object.keys(almacen)[0]] = JSON.stringify([
        { otDocId: 'ot-2', pdfUrl: '', pdfUrlCloudinary: 'https://cloud/solo-cloudinary.pdf' }
      ]);
      escrituras.length = 0;
      await api.sincronizar();
      const esc = escrituras[0];
      chequear(!!esc, 'el reintento no escribio nada');
      if (esc) {
        chequear(esc.tipo === 'update',
          'el reintento usa ' + esc.tipo + '() en vez de update(): con set({merge}) crearia una ' +
          'orden fantasma si la OT todavia no subio desde la cola del telefono');
        chequear(!('pdfUrl' in esc.campos),
          'el reintento escribe pdfUrl vacio y pisa el enlace bueno que ya tenia la OT');
        chequear(esc.campos.pdfUrlCloudinary === 'https://cloud/solo-cloudinary.pdf',
          'el reintento no escribio la URL que si traia');
      }
      chequear(api.leer().length === 0, 'el enlace aplicado no se saco de la cola');

      // d) INVARIANTE: lo que no se logra aplicar NO se borra.
      api.encolar('ot-3', '', 'https://cloud/pendiente.pdf');
      fallarEscritura = true;
      await api.sincronizar();
      const quedan = api.leer();
      chequear(quedan.length === 1 && quedan[0].otDocId === 'ot-3',
        'un enlace que no se pudo aplicar se borro de la cola: se pierde igual que antes');

      // e) Dos corridas a la vez (la sesion recien abierta y el 'online', por ejemplo).
      fallarEscritura = false; demora = 40;
      almacen[Object.keys(almacen)[0]] = JSON.stringify([{ otDocId: 'ot-4', pdfUrl: '', pdfUrlCloudinary: 'https://cloud/una-vez.pdf' }]);
      escrituras.length = 0;
      await Promise.all([api.sincronizar(), api.sincronizar()]);
      await new Promise(function (r) { setTimeout(r, 150); });   // la segunda corre despues
      const aplicadas = escrituras.filter(function (e) { return e.campos.pdfUrlCloudinary === 'https://cloud/una-vez.pdf'; }).length;
      chequear(aplicadas === 1, 'dos corridas a la vez de la cola de enlaces aplicaron el mismo enlace ' + aplicadas + ' veces (Codex, ronda 4)');
      chequear(api.leer().length === 0, 'tras dos corridas a la vez el enlace aplicado no salio de la cola');
      demora = 0;

      // h) (Codex, ronda 7) La corrida vieja que el guardian dejo atras despierta despues de su update:
      //    no manda el aviso del enlace rescatado; lo manda la vigente, que reaplica el mismo enlace.
      let soltarH; compuerta = new Promise(function (r) { soltarH = r; });
      almacen[Object.keys(almacen)[0]] = JSON.stringify([{ otDocId: 'ot-8', pdfUrl: '', pdfUrlCloudinary: 'https://cloud/rescatado.pdf',
        aviso: { numero: 8, local: 'Local Prueba', tecnico: 'Tomas Prueba', tipo: 'correctivo', fecha: '24-10-2026', clientId: 'c8' } }]);
      avisos = 0;
      const viejaH = api.sincronizar();                                 // se duerme en su update
      await new Promise(function (r) { setTimeout(r, 20); });
      api.sincronizar._desde = Date.now() - 16 * 60000;                 // reloj del guardian: pasaron 16 min
      await api.sincronizar();                                          // la nueva aplica el enlace y avisa
      const avisosNueva = avisos;
      soltarH(); await viejaH;                                          // la vieja despierta
      const avisosVieja = avisos - avisosNueva;
      chequear(avisosNueva === 1, 'el tramo h no llego a la ventana que mide: la corrida nueva no mando el aviso del enlace rescatado');
      chequear(avisosVieja === 0, 'la corrida vieja de la cola de enlaces mando el aviso al despertar, ademas de la vigente (Codex, ronda 7)');

      // i) (Codex, ronda 7) Igual, con la vieja dormida en el aviso a administracion: al despertar no manda
      //    el correo al local; lo manda la vigente.
      let soltarI; compuertaAviso = new Promise(function (r) { soltarI = r; });
      almacen[Object.keys(almacen)[0]] = JSON.stringify([{ otDocId: 'ot-9', pdfUrl: '', pdfUrlCloudinary: 'https://cloud/rescatado-9.pdf',
        aviso: { numero: 9, local: 'Local Prueba', tecnico: 'Tomas Prueba', tipo: 'correctivo', fecha: '24-10-2026', clientId: 'c9', emailLocal: 'local@prueba.test' } }]);
      correosLocal = 0;
      const viejaI = api.sincronizar();                                 // se duerme en el aviso a administracion
      await new Promise(function (r) { setTimeout(r, 20); });
      api.sincronizar._desde = Date.now() - 16 * 60000;                 // reloj del guardian: pasaron 16 min
      await api.sincronizar();                                          // la nueva avisa y le manda al local
      const correosNueva = correosLocal;
      soltarI(); await viejaI;                                          // la vieja despierta
      const correosVieja = correosLocal - correosNueva;
      chequear(correosNueva === 1, 'el tramo i no llego a la ventana que mide: la corrida nueva no mando el correo al local');
      chequear(correosVieja === 0, 'la corrida vieja de la cola de enlaces mando el correo al local al despertar, ademas de la vigente (Codex, ronda 7)');

      console.log('3) Reintento con update(), nunca set({merge}): ' + (escrituras[0] && escrituras[0].tipo === 'update' ? 'ok ✓' : 'roto ✗'));
      console.log('4) No pisa un enlace bueno con vacio: ' + (escrituras[0] && !('pdfUrl' in escrituras[0].campos) ? 'ok ✓' : 'roto ✗'));
      console.log('5) Lo que no se aplica sigue pendiente: ' + (quedan.length === 1 ? 'ok ✓' : 'roto ✗'));
      console.log('6) Dos corridas a la vez, un solo update: ' + (aplicadas === 1 ? 'ok ✓' : aplicadas + ' updates ✗'));
      console.log('7) La corrida vieja no repite el aviso: ' + (avisosNueva === 1 && avisosVieja === 0 ? 'ok ✓' : 'la nueva ' + avisosNueva + ', la vieja ' + avisosVieja + ' ✗') +
        ' · ni el correo al local: ' + (correosNueva === 1 && correosVieja === 0 ? 'ok ✓' : 'la nueva ' + correosNueva + ', la vieja ' + correosVieja + ' ✗'));

      cerrar();
    })();
    return;
  }
}

cerrar();

function cerrar() {
  if (fallos.length) {
    console.log('\nFALLOS:\n' + fallos.join('\n'));
    process.exit(1);
  }
  console.log('\nTodo en orden: cerrar sin señal no cuelga la app y el enlace del PDF no se pierde.');
  process.exit(0);
}
