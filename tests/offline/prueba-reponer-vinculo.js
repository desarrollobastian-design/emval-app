/* El caso 17-09-2026, por la interfaz: cotizacion 17092602 (UNIMARC CHIGUAYANTE 2) / HS 425996.

   Los dos documentos se siembran con su estado REAL de produccion, leido por REST el 17-09:
   la OT apunta a su cotizacion (`cotizacionId`) y la cotizacion NO apunta a su OT (`otId: null`,
   `otNumero: ''`) porque el guardado de una correccion de precio se lo borro. Firestore y EmailJS
   son espias —el SDK ni se carga— asi que tocar produccion es imposible.

   Lo que se ejecuta de verdad en el navegador:

     1. La OT 425996 muestra el badge "Cotizacion realizada" y NO ofrece "+ Generar cotizacion":
        antes del arreglo ofrecia crear una SEGUNDA cotizacion del mismo trabajo.
     2. ...y ofrece "Reponer vinculo", que es la unica salida que la app tiene para este estado.
     3. El cuadro de confirmacion dice que el vinculo se repone, no que se va a aprobar algo.
     4. Al confirmar, la app escribe el vinculo por los DOS lados en una sola accion.
     5. Con el vinculo roto, el envio igual encuentra la HS por `otCompletadaNumero` (el correo
        que Pedro tuvo que mandar a mano) y la nombra con la nomenclatura que exige SMU.
     6. El PDF de la CT, generado con el jsPDF REAL, imprime "N HS: 425996" en vez del recuadro
        vacio (y ya no dice "N OT": SMU dejo de llamarlo orden de trabajo).

   Uso:
     node tests/offline/preparar.js HEAD
     cd tests/offline/sitio && python -m http.server 8765
     node tests/offline/prueba-reponer-vinculo.js [http://127.0.0.1:8765/index.html]

   CONTRAPRUEBA: correrla contra prefix.html (generado de un commit anterior al arreglo). Ahi la
   OT ofrece "+ Generar cotizacion", no existe "Reponer vinculo" y el envio no encuentra la HS. */

const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://127.0.0.1:8765/index.html';
const ES_PREFIX = /prefix\.html/.test(URL);
const fallos = [];
const P = (...a) => console.log(...a);
function chequear(ok, detalle) { if (!ok) fallos.push('  X ' + detalle); return ok; }

// sha256('Pedro123') — la contraseña temporal que la propia app asigna al Administrador.
const HASH_PEDRO = 'cefdf4148cc0bdd9b6b4e6f125a65088e5340d9cf15d58000015b254bcf5168d';
const COT_ID = 'VTgrtHCjJ9pEnRAmDcIg';
const OT_ID = 'ot_msz6tmso_ko60cfs';
const HS_URL = 'https://res.cloudinary.com/dcrf29tna/raw/upload/v1787089888/emval/pdfs/Recepcion_Obra_OT425996_ko60cfs.pdf';

const SEMILLA = `(function(){
  function ts(iso) {
    var ms = Date.parse(iso), secs = Math.floor(ms/1000);
    return { seconds: secs, nanoseconds: 0, toDate: function(){ return new Date(ms); },
             valueOf: function(){ return String(secs + 62135596800).padStart(12,'0') + '.000000000'; } };
  }
  // ordenes/${OT_ID} — el lado que NUNCA se rompio.
  window.__SEMILLA.ordenes = [{
    _id: '${OT_ID}', numero: 425996, tipo: 'correctivo', estado: 'Terminada',
    local: 'UNIMARC CHIGUAYANTE 2', ceco: '601', tecnico: 'Nelson Herrera',
    fecha: '18-08-2026', firmada: true, pausa: false, enEspera: false,
    descripcionProblema: 'Reparacion de tablero electrico estanques de agua',
    descripcionTrabajo: 'Se realiza reparacion y mejoramiento de circuito electrico y circuito de sistema de estanques de agua de emergencia.',
    cotizacionId: '${COT_ID}',
    pdfUrlCloudinary: '${HS_URL}',
    pdfUrl: 'https://desarrollobastian-design.github.io/emval-app/?pdf=OAXSUwRcmV3xLAMnABzk',
    serviciosPreventivo: [], fotosAntes: [], fotosDespues: [],
    creadoEn: ts('2026-08-18T21:51:34.806Z')
  }];
  // cotizaciones/${COT_ID} — el documento roto, tal cual quedo.
  window.__SEMILLA.cotizaciones = [{
    _id: '${COT_ID}', numeroCotizacion: '17092602', fechaCodigo: '170926',
    tipoCot: 'previa', estadoCot: 'Realizada',
    otId: null, otNumero: '', otCompletadaNumero: '425996',
    local: 'UNIMARC CHIGUAYANTE 2', localCorto: 'CHIGUAYANTE 2', centro: '601',
    cadena: 'Unimarc', carpeta: 'R. Abedrapo', supervisor: 'R. Abedrapo',
    nombreServicio: 'Mejoramiento circuito estanques',
    descripcionTrabajo: 'Se solicita reparacion y mejoramiento de circuito electrico y circuito de agua en sistema de estanques de agua de emergencia',
    tecnico: '', tecnicoRealizo: 'Nelson Herrera', fecha: '28-07-2026', fechaRealizada: '18-08-2026',
    items: [{ desc: 'M.O. Gasfiteria y Electrica', qty: 1, precio: 620000 },
            { desc: 'Llave de paso corte rapido 1 1/2\\"', qty: 2, precio: 32700 }],
    subtotal: 1478850, total: 1478850, descuento: 0, descuentoMonto: 0,
    enviado: true, pdfFormato: 4, creadoEn: ts('2026-07-29T02:18:10.943Z')
  }];
  // El indice de PDFs, con el registro real de la hoja.
  window.__SEMILLA.pdfs = [{ _id: 'OAXSUwRcmV3xLAMnABzk', otNumero: 425996, otClientId: '${OT_ID}',
    local: 'UNIMARC CHIGUAYANTE 2', tipo: 'correctivo', pdfUrlCloudinary: '${HS_URL}' }];
  window.__SEMILLA.cadenas = [{ _id: 'c_unimarc', nombre: 'Unimarc',
    sucursales: [{ nombre: 'UNIMARC CHIGUAYANTE 2', centro: '601', supervisor: 'R. Abedrapo' }] }];
  window.__SEMILLA.tecnicos = [
    { _id: 'u_pedro', nombre: 'Pedro Arce', cargo: 'Administrador', letra: 'P', passwordHash: '${HASH_PEDRO}' },
    { _id: 'u_nelson', nombre: 'Nelson Herrera', cargo: 'Tecnico en terreno', pin: '1111', letra: 'N' }
  ];
  window.__SEMILLA.supervisores = [{ _id: 's1', nombre: 'R. Abedrapo', email: 'rabedrapog@smu.cl' }];
  /* collection().get() del arnes lee __SEMILLA y doc().get() lee __DOCS: los caminos que
     resuelven un documento por id (el envio, el generador del PDF) usan el segundo. */
  Object.keys(window.__SEMILLA).forEach(function(col){
    (window.__SEMILLA[col] || []).forEach(function(d){ window.__DOCS[col + '/' + d._id] = d; });
  });
  /* El arnes base no implementa where(): sin esto, el rescate de la HS revienta dentro de su
     propio try/catch y devuelve null — el guion mediria la limitacion del arnes, no la app. */
  if (!window.__CONWHERE) {
    window.__CONWHERE = true;
    var base = window.firebase.firestore;
    window.firebase.firestore = function() {
      var db = base(), colBase = db.collection;
      db.collection = function(nombre) {
        var c = colBase(nombre);
        c.where = function(campo, op, valor) {
          var api = {
            limit: function(){ return api; },
            onSnapshot: function(){ return function(){}; },
            get: function() {
              var docs = (window.__SEMILLA[nombre] || [])
                .filter(function(d){ return d[campo] === valor; })
                .map(function(d){ return { id: d._id, exists: true, data: function(){ return d; } }; });
              return Promise.resolve({ docs: docs, size: docs.length, empty: docs.length === 0,
                                       forEach: function(f){ docs.forEach(f); } });
            }
          };
          return api;
        };
        return c;
      };
      return db;
    };
  }
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => P('  [error de la pagina]', String(e).slice(0, 220)));

  await page.goto(URL);
  await page.waitForTimeout(1200);
  await page.evaluate(SEMILLA);
  await page.evaluate(() => cargarUsuariosApp());
  await page.waitForTimeout(700);

  await page.click('text=Pedro Arce');
  await page.waitForTimeout(400);
  await page.fill('#admin-pass-input', 'Pedro123');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  const quien = await page.evaluate(() => estado.usuario + ' / ' + estado.cargo);
  chequear(/Administrador/.test(quien), 'no entro como Administrador: ' + quien);
  P('Entro como ' + quien + (ES_PREFIX ? '   [CONTRAPRUEBA: codigo SIN el arreglo]' : ''));

  /* ── 1 y 2 · la tarjeta de la OT 425996 en el perfil de Nelson ──────────────────────
     Es la pantalla del reporte de Pedro ("en el perfil de Nelson la HS aparecia como pendiente
     de cotizar"). El Panel Supervisor solo lista las OT de HOY y esta es del 18-08. */
  await page.evaluate(async (otId) => {
    const s = await window.firebase.firestore().collection('ordenes').get();
    const ots = s.docs.map(d => Object.assign({ id: d.id }, d.data()));
    await verOTsTecnico('Nelson Herrera', { nombre: 'Nelson Herrera', ots: ots });
  }, OT_ID);
  await page.waitForTimeout(2500);
  const tarjeta = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.card'));
    const c = cards.find(e => /425996/.test(e.innerText) && /CHIGUAYANTE/.test(e.innerText));
    return c ? c.innerText.replace(/\n+/g, ' | ') : null;
  });
  if (!chequear(!!tarjeta, 'no se dibujo la tarjeta de la OT 425996 en el Panel Supervisor')) {
    P('  (no se pudo seguir sin la tarjeta)');
  } else {
    P('\nTarjeta: ' + tarjeta.slice(0, 190));
    const cotizada = /Cotizacion realizada|Cotización realizada/.test(tarjeta);
    const ofreceNueva = /Generar cotización|\+ Cotización/.test(tarjeta);
    const ofreceReponer = /Reponer vínculo/.test(tarjeta);
    chequear(cotizada, '1) la OT no muestra el badge "Cotizacion realizada" teniendo su cotizacionId');
    chequear(!ofreceNueva,
      '1) la OT ofrece crear una SEGUNDA cotizacion del mismo trabajo: apretarlo mete otro monto en la planilla');
    chequear(ofreceReponer,
      '2) la OT no ofrece "Reponer vinculo": el documento queda sin ninguna salida dentro de la app ' +
      'y su CT sigue saliendo con el recuadro "N OT" vacio');
    P('1) Badge "Cotizacion realizada" y sin "+ Generar cotizacion": ' + (cotizada && !ofreceNueva ? 'OK' : 'FALLA'));
    P('2) Ofrece "Reponer vinculo": ' + (ofreceReponer ? 'OK' : 'FALLA'));

    // ── 3 y 4 · reponer por la interfaz ──────────────────────────────────────────────
    if (ofreceReponer) {
      /* Se dispara sobre el elemento real (su onclick es el de la app). Playwright pide que el
         nodo sea visible y la tarjeta vive en una pantalla que el guion no trajo al frente. */
      const hizo = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.card'));
        const c = cards.find(e => /425996/.test(e.innerText) && /CHIGUAYANTE/.test(e.innerText));
        if (!c) return false;
        const b = Array.from(c.querySelectorAll('button')).find(x => /Reponer vínculo/.test(x.textContent));
        if (!b) return false;
        b.click();
        return true;
      });
      chequear(hizo, '3) no se pudo accionar el boton "Reponer vinculo"');
      await page.waitForTimeout(600);
      const dlg = await page.evaluate(() => ({
        visible: !document.getElementById('dlg-overlay').hidden,
        titulo: (document.getElementById('dlg-title') || {}).textContent || '',
        msg: (document.getElementById('dlg-msg') || {}).textContent || ''
      }));
      chequear(dlg.visible, '3) "Reponer vinculo" no abre ninguna confirmacion');
      chequear(/perdió el vínculo|perdio el vinculo/i.test(dlg.msg),
        '3) el cuadro no dice que se esta REPONIENDO un vinculo perdido. Decia: "' + dlg.msg + '"');
      chequear(!/quedará aprobada/i.test(dlg.msg),
        '3) el cuadro dice que la cotizacion "quedara aprobada": ya estaba aprobada y ejecutada');
      P('3) La confirmacion dice: "' + dlg.msg.slice(0, 120) + '"');

      await page.evaluate(() => document.getElementById('dlg-ok').click());
      await page.waitForTimeout(2500);

      const esc = await page.evaluate(() => (window.__ESCRITURAS || [])
        .filter(e => e.op === 'update')
        .map(e => ({ col: e.coleccion, id: e.docId, datos: e.datos })));
      const uCot = esc.find(e => e.col === 'cotizaciones');
      const uOT = esc.find(e => e.col === 'ordenes');
      chequear(!!uCot && uCot.datos.otId === OT_ID,
        '4) no se escribio otId en la cotizacion: quedo ' + JSON.stringify(uCot && uCot.datos.otId));
      chequear(!!uCot && String(uCot.datos.otNumero) === '425996',
        '4) no se escribio otNumero: quedo ' + JSON.stringify(uCot && uCot.datos.otNumero));
      chequear(!!uCot && uCot.datos.estadoCot === 'Realizada', '4) se perdio el estado Realizada');
      chequear(!!uCot && uCot.datos.pdfUrl === '',
        '4) no se caduco el PDF: la CT que se vuelva a mandar sale con el recuadro "N OT" vacio igual');
      chequear(!!uOT && uOT.datos.cotizacionId === COT_ID,
        '4) el lado de la OT no quedo escrito: ' + JSON.stringify(uOT && uOT.datos));
      chequear(!!uOT && String(uOT.datos.cotizacionNumero) === '17092602',
        '4) la OT no recibio el folio de su cotizacion');
      P('4) Escrituras: cotizaciones -> ' + JSON.stringify(uCot && { otId: uCot.datos.otId, otNumero: uCot.datos.otNumero }) +
        ' | ordenes -> ' + JSON.stringify(uOT && uOT.datos));
    }
  }

  // ── 5 · con el vinculo ROTO, el envio igual encuentra la HS ─────────────────────────
  //     Se vuelve a cargar la pagina para partir del estado roto otra vez.
  await page.goto(URL);
  await page.waitForTimeout(1200);
  await page.evaluate(SEMILLA);
  await page.waitForTimeout(400);
  const hoja = await page.evaluate(async (id) => {
    if (typeof _obtenerHojaDeCot !== 'function') return { error: 'no existe _obtenerHojaDeCot' };
    const db = window.firebase.firestore();
    const d = await db.collection('cotizaciones').doc(id).get();
    const cot = Object.assign({ id: id }, d.data());
    const r = await _obtenerHojaDeCot(cot);
    return r ? { url: r.url, nombre: r.nombre } : { url: null };
  }, COT_ID);
  const okHS = chequear(!!hoja.url && /Recepcion_Obra_OT425996/.test(hoja.url),
    '5) con el vinculo roto el envio NO encuentra la HS: ' + JSON.stringify(hoja) +
    '. Es el correo que Pedro tuvo que mandar a mano.');
  if (hoja.nombre) chequear(/^HS - 425996 - CT 17092602 - ceco 0601 - /.test(hoja.nombre),
    '5) la HS no sale con la nomenclatura que exige SMU: ' + hoja.nombre);
  P('\n5) La HS que viajaria en el correo: ' + (hoja.nombre || JSON.stringify(hoja)));

  // ── 6 · el PDF de la CT, con el jsPDF REAL, imprime su N de OT ──────────────────────
  const pdf = await page.evaluate(async (id) => {
    const escritos = [];
    if (!window.jspdf || !window.jspdf.jsPDF) return { error: 'no se encontro jsPDF' };
    /* jsPDF copia sus metodos de API a CADA INSTANCIA al construirla, asi que parchar el
       prototipo no alcanza: se envuelve el constructor y se espia el `text` de la instancia. */
    const J0 = window.jspdf.jsPDF;
    const jspdfOrig = window.jspdf;
    function JEspia() {
      const d = new J0(...arguments);
      const t = d.text.bind(d);
      d.text = function (txt, x, y) { escritos.push({ t: String(txt), x: x, y: y }); return t.apply(null, arguments); };
      return d;
    }
    JEspia.prototype = J0.prototype;
    window.jspdf = Object.create(jspdfOrig, { jsPDF: { value: JEspia, configurable: true } });
    const orig = J0.prototype.text;
    const J = { prototype: { text: orig } };   // para el `finally` de abajo
    try {
      const db = window.firebase.firestore();
      const d = await db.collection('cotizaciones').doc(id).get();
      const cot = Object.assign({ id: id }, d.data());
      await generarPDFCotizacionGuardada(cot, { modoSubir: true });
    } catch (e) { return { error: String(e).slice(0, 180), escritos: escritos.length }; }
    finally { window.jspdf = jspdfOrig; }
    const etiqueta = escritos.find(e => /^N.? ?HS$/i.test(e.t.trim()));
    const enLinea = etiqueta ? escritos.filter(e => Math.abs(e.y - etiqueta.y) < 1.5 && e.x > etiqueta.x) : [];
    return { total: escritos.length, etiqueta: !!etiqueta, rotulo: etiqueta ? etiqueta.t : null,
             enLinea: enLinea.map(e => e.t) };
  }, COT_ID);
  if (pdf.error) {
    chequear(false, '6) no se pudo generar el PDF de la CT: ' + pdf.error);
  } else {
    const dice = (pdf.enLinea || []).join(' ');
    chequear(pdf.etiqueta, '6) el PDF de la CT no imprime la etiqueta "N HS": SMU dejo de llamarlo OT ' +
      'y el archivo ya se llama HS - ... , asi que el recuadro contradecia al propio documento');
    chequear(/425996/.test(dice),
      '6) el recuadro "N HS" de la CT sale VACIO (dice ' + JSON.stringify(dice) + '): a SMU le llega ' +
      'una CT sin el numero junto a una HS que si lo lleva, y es el dato con el que parean para la HES');
    P('6) El PDF de la CT imprime: "' + (pdf.rotulo || '?') + ' ' + dice.trim() + '"  (' + pdf.total + ' textos dibujados)');
  }

  await page.screenshot({ path: 'tests/offline/reponer-vinculo.png', fullPage: false }).catch(() => {});
  await browser.close();

  if (fallos.length) {
    console.error('\nFALLOS:\n' + fallos.join('\n'));
    console.error('\n' + fallos.length + ' comprobacion(es) fallaron.');
    process.exit(1);
  }
  console.log('\nTodas las comprobaciones pasan.');
  process.exit(0);
})().catch(e => { console.error('\nEl guion revento: ' + (e && e.stack || e)); process.exit(1); });
