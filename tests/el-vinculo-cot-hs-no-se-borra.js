/* Prueba de regresion — corregirle el precio a una cotizacion no puede borrarle su hoja.

   Caso REAL del 17-09-2026, cotizacion 17092602 (UNIMARC CHIGUAYANTE 2) / HS 425996:
   Pedro corrigio un item ($32.500 -> $32.700 neto c/u, +$400 neto en total) y al guardar,
   `guardarCotizacion` escribio `otId: null` y `otNumero: ''` INCONDICIONALMENTE porque el
   documento es `tipoCot:'previa'`. El vinculo lo habia dejado bien "Adjuntar previa" el 27-08
   —el PDF de ese dia se llama `28072602_HS_425996_...` y adentro dice "N OT : 425996"— y 39
   segundos despues del borrado salio el correo a SMU: sin HS, sin avisar que faltaba, y con la
   CT impresa con el campo "N OT" EN BLANCO.

   El mismo guardado le reservo ademas un folio NUEVO (28072602 -> 17092602), porque la guarda
   "una edicion conserva su numero" mira `cotizacionActual.numeroCotizacion` y `editarCotizacion`
   nunca lo carga. Es un chequeo mal anclado: el codigo correcto encima del dato que nunca llega.

   Lo que se vigila, y por que cada uno esta aca:

     1. editar una previa YA vinculada conserva `otId`/`otNumero`  <- el bug que se reporto
     2. editar conserva el folio y no quema un correlativo del dia  <- el folio ya lo tiene SMU
     3. editar no reescribe `creadoEn`  <- un documento de julio no puede figurar creado hoy
     4. una previa NUEVA sigue naciendo sin OT y con folio nuevo    <- no romper lo que servia
     5. `_obtenerHojaDeCot` rescata la hoja por `otCompletadaNumero`, el tercer campo del
        vinculo, que estaba escrito en el documento y no lo miraba nadie
     6. ...y NO la rescata si el N de OT es de otro local o es ambiguo (9016 y 9502 ya colisionaron)
     7. "Adjuntar" ofrece la previa Realizada que perdio su vinculo, y SOLO en su propia OT
     8. una OT que ya trae `cotizacionId` no vuelve a listarse como "sin cotizar"
     9. una previa Realizada sigue sumando a la deuda y una Pendiente sigue fuera
    10. `_vincularCotizacionRealizada` escribe el vinculo, no solo `otCompletadaNumero`

   Uso:  node tests/el-vinculo-cot-hs-no-se-borra.js index.html
   Sale 0 si todas pasan; 1 si alguna falla. */

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const fallos = [];
const check = (ok, msg) => { if (!ok) fallos.push('  X ' + msg); return ok; };

function cuerpo(decl) {
  const i = src.indexOf(decl);
  if (i < 0) return '';
  let nivel = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') nivel++;
    else if (src[k] === '}' && --nivel === 0) return src.slice(i, k + 1);
  }
  return '';
}
function exigir(nombres) {
  const fuentes = nombres.map(n => cuerpo(n));
  const faltan = nombres.filter((n, i) => !fuentes[i]);
  if (faltan.length) { check(false, 'No se encontro: ' + faltan.join(' . ')); return null; }
  return fuentes;
}

console.log('El vinculo COT <-> HS no se borra al corregir una cotizacion\n');

/* Firestore espia: registra cada escritura sin tocar la red. `runTransaction` se cuenta
   aparte porque reservar un correlativo es exactamente lo que una EDICION no debe hacer. */
function espiaDB(docs) {
  const esc = [], tx = [];
  const D = docs || {};
  function snap(lista) {
    return { empty: !lista.length, docs: lista.map(x => ({ id: x.id, data: () => x })) };
  }
  return {
    esc: esc, tx: tx,
    collection: function (col) {
      return {
        doc: function (id) {
          return {
            update: async function (obj) { esc.push({ op: 'update', col: col, id: id, obj: obj }); },
            set: async function (obj, opt) { esc.push({ op: 'set', col: col, id: id, obj: obj, opt: opt }); },
            get: async function () {
              const d = (D[col] || []).filter(x => x.id === id)[0];
              return { exists: !!d, id: id, data: () => d };
            }
          };
        },
        add: async function (obj) { esc.push({ op: 'add', col: col, obj: obj }); return { id: 'DOC_NUEVO' }; },
        get: async function () { return snap(D[col] || []); },
        where: function (campo, op, valor) {
          const api = {
            limit: function () { return api; },
            get: async function () { return snap((D[col] || []).filter(x => x[campo] === valor)); }
          };
          return api;
        }
      };
    },
    runTransaction: async function (fn) {
      tx.push(1);
      return fn({
        get: async function () { return { exists: true, data: () => ({ n: 1 }) }; },
        set: function (ref, obj) { esc.push({ op: 'tx.set', obj: obj }); }
      });
    }
  };
}
const escrito = (db, col, id) => db.esc.filter(e => e.col === col && (!id || e.id === id));

// === 1-4 · guardarCotizacion + editarCotizacion, EJECUTADAS de verdad ===================
async function bloqueGuardar() {
  const FN = ['function _fechaCodigoHoy(', 'function _localSinCadena(',
    'async function _asignarNumeroCotizacion(', 'async function editarCotizacion(',
    'async function guardarCotizacion('];
  const fuentes = exigir(FN);
  if (!fuentes) return;

  const DOM = {};
  function el(id) {
    if (!DOM[id]) DOM[id] = { id: id, value: '', textContent: '', disabled: false };
    return DOM[id];
  }

  function armar() {
    const db = espiaDB();
    const win = {
      _editandoCotizacionId: null, _cotizacionOrigen: 's-carpetas',
      _cotizacionTecnicoActivo: null, _modoCotPrevia: false,
      firebase: {
        firestore: Object.assign(function () { return db; }, {
          FieldValue: { serverTimestamp: function () { return '<serverTimestamp>'; } }
        })
      }
    };
    const preludio = [
      'var cotizacionActual = null, itemsCot = [];',
      'function calcTotalCot(){ return { subtotal: 100, desc: 0, descMonto: 0, total: 100 }; }',
      'function _bloquear(){ return function(){}; }',
      'function _conTimeout(p){ return p; }',
      'function _esTimeout(){ return false; }',
      'function toast(){} function go(){} function cargarCarpetas(){} function cargarPreventivos(){}',
      'function cargarOTsSupervisor(){} function renderItemsCot(){} function _llenarSupervisoresSelect(){}',
      'function _camposPDFCot(u){ return { pdfUrl: u }; }',
      'function verOTsTecnico(){ return Promise.resolve(); }',
      'function _fechaOTms(){ return 0; }',
      'function generarPDFCotizacionGuardada(){ return Promise.resolve(null); }'
    ].join('\n');
    const f = new Function('window', 'document', 'console',
      preludio + '\n' + fuentes.join('\n') +
      '\nreturn { editar: editarCotizacion, guardar: guardarCotizacion,' +
      ' setActual: function(v){ cotizacionActual = v; },' +
      ' setItems: function(v){ itemsCot = v; } };');
    return { api: f(win, { getElementById: el }, { log() {}, warn() {}, error() {} }), db: db, win: win };
  }

  // --- 1/2/3 · EDITAR una previa ya vinculada a su OT --------------------------------
  const A = armar();
  await A.api.editar({
    id: 'COT_CHIGUAYANTE', tipoCot: 'previa', estadoCot: 'Realizada',
    numeroCotizacion: '28072602', fechaCodigo: '280726',
    otId: 'ot_msz6tmso_ko60cfs', otNumero: '425996', otCompletadaNumero: '425996',
    local: 'UNIMARC CHIGUAYANTE 2', cadena: 'Unimarc', centro: '601',
    tecnico: '', fecha: '28-07-2026', nombreServicio: 'Mejoramiento circuito estanques',
    descripcionTrabajo: 'Mejoramiento circuito estanques', carpeta: 'R. Abedrapo',
    items: [{ desc: 'Llave de paso corte rapido 1 1/2"', qty: 2, precio: 32700 }]
  });
  await A.api.guardar();

  const upd = escrito(A.db, 'cotizaciones', 'COT_CHIGUAYANTE').filter(e => e.op === 'update')[0];
  if (!check(!!upd, '1) editar una previa no genero ningun update sobre su propio documento')) {
    console.log('1-3) no se pudo medir la edicion');
  } else {
    const o = upd.obj;
    const ok1 = check(o.otId === 'ot_msz6tmso_ko60cfs',
      '1) editar una previa vinculada BORRA su otId: quedo ' + JSON.stringify(o.otId) +
      ' (se esperaba "ot_msz6tmso_ko60cfs"). Es el bug de la 17092602: sin otId el correo sale sin HS.') &
      check(String(o.otNumero) === '425996',
      '1) editar una previa vinculada BORRA su otNumero: quedo ' + JSON.stringify(o.otNumero) +
      ' (se esperaba "425996"). La CT impresa sale con el campo "N OT" en blanco.');
    console.log('1) Editar una previa conserva su vinculo con la HS: ' + (ok1 ? 'OK' : 'FALLA'));

    const ok2 = check(o.numeroCotizacion === '28072602',
      '2) editar RENUMERA el folio: quedo ' + JSON.stringify(o.numeroCotizacion) +
      ' (se esperaba "28072602"). SMU ya tiene ese numero en la mano.') &
      check(o.fechaCodigo === '280726',
      '2) editar cambia fechaCodigo: quedo ' + JSON.stringify(o.fechaCodigo) + ' (se esperaba "280726")') &
      check(A.db.tx.length === 0,
      '2) editar reservo un correlativo del contador (' + A.db.tx.length + ' transaccion/es): ' +
      'la edicion se mete en la secuencia de las cotizaciones nuevas del dia');
    console.log('2) Editar conserva el folio y no quema correlativo: ' + (ok2 ? 'OK' : 'FALLA'));

    const ok3 = check(!('creadoEn' in o),
      '3) editar reescribe creadoEn (' + JSON.stringify(o.creadoEn) + '): un documento de julio ' +
      'pasa a figurar como creado hoy y salta al tope de Carpetas, Facturar y Ventas');
    console.log('3) Editar no reescribe creadoEn: ' + (ok3 ? 'OK' : 'FALLA'));
  }

  // --- 4 · CREAR una previa nueva sigue funcionando ----------------------------------
  const B = armar();
  B.api.setActual({
    id: null, otId: null, numero: '', local: 'UNIMARC PIONEROS', tecnico: '',
    fecha: '17-09-2026', descripcionTrabajo: '', centroSucursal: '', esPrevia: true,
    estadoCot: 'Pendiente', cadena: 'Unimarc', cadenaLogo: '', cadenaColor: '', cadenaLetra: 'U'
  });
  B.api.setItems([{ desc: 'Mano de obra', qty: 1, precio: 100 }]);
  await B.api.guardar();
  const nueva = escrito(B.db, 'cotizaciones').filter(e => e.op === 'add')[0];
  if (!check(!!nueva, '4) crear una previa nueva ya no hace add() en cotizaciones')) {
    console.log('4) Una previa nueva se sigue creando: FALLA');
  } else {
    const ok4 = check(!nueva.obj.otId && !nueva.obj.otNumero,
        '4) una previa NUEVA nace vinculada a una OT: ' + JSON.stringify(nueva.obj.otId)) &
      check(B.db.tx.length === 1, '4) una previa nueva ya no reserva su correlativo con transaccion') &
      check(/^\d{8}$/.test(String(nueva.obj.numeroCotizacion || '')),
        '4) una previa nueva salio sin folio: ' + JSON.stringify(nueva.obj.numeroCotizacion)) &
      check('creadoEn' in nueva.obj, '4) una previa nueva ya no guarda creadoEn');
    console.log('4) Una previa nueva nace sin OT, con folio nuevo y con creadoEn: ' + (ok4 ? 'OK' : 'FALLA'));
  }
}

// === 5-6 · _obtenerHojaDeCot rescata por otCompletadaNumero, sin adivinar ===============
async function bloqueHoja() {
  {
    const NOMBRES = ['function _normTexto(', 'function _localCanonico(', 'function _indexarCadenas(',
      'function _esPDFCompartible(', 'function _pdfDeOT(', 'function _nombreAdjuntoSeguro(',
      'function _recortarPalabras(', 'function _cecoDocumento(', 'function _cecoDelCatalogo(',
      'function _cecoDe(', 'function _nombreDocumento(', 'function _trabajoDocumento(',
      'function _nombrePDFHoja(', 'function _datosHojaConCot(', 'function _urlHojaMasReciente(',
      'async function _obtenerHojaDeCot('];
    const fuentes = exigir(NOMBRES);
    if (!fuentes) return;
    const meses = (src.match(/const _MESES_DOC = (\[[^\]]*\]);/) || [])[1] || '[]';
    const extra = cuerpo('function _numOTComparable(');   // helper del arreglo; vacio antes de el

    function hacer(datos) {
      const db = espiaDB(datos);
      const f = new Function('DB',
        'var window = { ALIAS_LOCALES: {}, _firebaseReady: true, firebase: { firestore: function(){ return DB; } } };\n' +
        'var localStorage = { getItem: function(){ return null; } };\n' +
        'var _cecoIdxCache = { raw: null, idx: null };\n' +
        'const _MESES_DOC = ' + meses + ';\n' +
        'function _conTimeout(p){ return p; }\n' +
        'var console = { warn: function(){}, error: function(){} };\n' +
        extra + '\n' + fuentes.join('\n') + '\nreturn _obtenerHojaDeCot;');
      return { fn: f(db), db: db };
    }
    const RAW = 'https://res.cloudinary.com/dcrf29tna/raw/upload/emval/pdfs/';
    const HS = RAW + 'Recepcion_Obra_OT425996_ko60cfs.pdf';

    // El documento REAL de la 17092602: sin otId, sin otNumero, con otCompletadaNumero.
    const cotRota = {
      id: 'VTgrtHCjJ9pEnRAmDcIg', numeroCotizacion: '17092602', tipoCot: 'previa',
      estadoCot: 'Realizada', otId: null, otNumero: '', otCompletadaNumero: '425996',
      local: 'UNIMARC CHIGUAYANTE 2', centro: '601', nombreServicio: 'Mejoramiento circuito estanques'
    };
    /* `ordenes.numero` es NUMERICO en los 286 documentos de produccion, y `otCompletadaNumero`
       viaja como TEXTO en los 5 que lo traen: comparar sin convertir devuelve vacio y no falla. */
    const OT = { id: 'ot_msz6tmso_ko60cfs', numero: 425996, local: 'UNIMARC CHIGUAYANTE 2',
      firmada: true, tipo: 'correctivo', ceco: '601', pdfUrlCloudinary: HS };

    const r5 = await hacer({ ordenes: [OT] }).fn(cotRota);
    const ok5 = check(!!r5 && r5.url === HS,
      '5) _obtenerHojaDeCot NO rescata la hoja por otCompletadaNumero: devolvio ' +
      (r5 ? r5.url : 'null') + '. El numero 425996 esta escrito en la propia cotizacion y la ' +
      'funcion corta antes de mirarlo — es el correo que Pedro tuvo que mandar a mano.');
    if (r5) check(/425996/.test(r5.nombre), '5) la HS rescatada sale con un nombre sin su N de OT: ' + r5.nombre);
    console.log('5) La hoja se rescata por otCompletadaNumero: ' + (ok5 ? r5.nombre : 'FALLA'));

    const r6a = await hacer({ ordenes: [{ id: 'ot_otro', numero: 425996, local: 'ENTEL TALCAHUANO',
      firmada: true, pdfUrlCloudinary: RAW + 'Recepcion_Obra_OT425996_otro.pdf' }] }).fn(cotRota);
    const r6b = await hacer({ ordenes: [
      { id: 'ot_a', numero: 425996, local: 'UNIMARC CHIGUAYANTE 2', firmada: true, pdfUrlCloudinary: RAW + 'a.pdf' },
      { id: 'ot_b', numero: 425996, local: 'UNIMARC CHIGUAYANTE 2', firmada: true, pdfUrlCloudinary: RAW + 'b.pdf' }
    ] }).fn(cotRota);
    const r6c = await hacer({ ordenes: [OT] }).fn({ id: 'x', local: 'UNIMARC CHIGUAYANTE 2', numeroCotizacion: '1' });
    const r6d = await hacer({ ordenes: [OT] }).fn({ id: 'y', otId: 'ot_msz6tmso_ko60cfs',
      otNumero: 425996, local: 'UNIMARC CHIGUAYANTE 2', numeroCotizacion: '9' });
    // (e) la OT existe y es del local, pero NO esta firmada: una hoja a medio cerrar no se manda.
    const r6e = await hacer({ ordenes: [Object.assign({}, OT, { firmada: false })] }).fn(cotRota);
    const ok6 = check(r6a === null, '6) rescata la HS de OTRO LOCAL con el mismo N de OT: ' + (r6a ? r6a.url : 'null')) &
      check(r6b === null, '6) con DOS hojas candidatas del mismo local elige una a ojo: ' + (r6b ? r6b.url : 'null')) &
      check(r6c === null, '6) una cotizacion sin ningun campo de vinculo devuelve una hoja: ' + (r6c ? r6c.url : 'null')) &
      check(r6e === null, '6) rescata una hoja SIN FIRMAR: una OT a medio cerrar no es un documento entregable') &
      check(!!r6d && r6d.url === HS, '6) se rompio el camino normal (con otId): ' + (r6d ? r6d.url : 'null'));
    console.log('6) No se adivina la hoja (otro local, ambiguo, sin firmar, sin vinculo) y el camino normal sigue: ' +
      (ok6 ? 'OK' : 'FALLA'));

    /* (f) La guarda de ENTRADA del rescate. Si se relaja, el rescate correria tambien cuando la
       cotizacion YA trae vinculo, y una consulta de mas por cada cotizacion enviada. Aca la COT
       tiene `otId` a una OT que no existe: el rescate NO debe salvarla por `otCompletadaNumero`. */
    const r7a = await hacer({ ordenes: [OT] }).fn({ id: 'z', otId: 'ot_borrada', otNumero: '',
      otCompletadaNumero: '425996', local: 'UNIMARC CHIGUAYANTE 2', numeroCotizacion: '7' });
    check(r7a === null, '7pre) el rescate por otCompletadaNumero corre aunque la cotizacion YA tenga otId: ' +
      'es una lectura de mas por cotizacion enviada y relaja la guarda de entrada');

    /* (g) Despues de rescatar la OT, la hoja puede vivir SOLO en el indice `pdfs` (las hojas
       legacy que nunca se re-enlazaron por mala senal). El rescate tiene que pasarle a esa
       busqueda el id y el numero de la OT que encontro, o la hoja sigue sin salir. */
    const APP = 'https://desarrollobastian-design.github.io/emval-app/?pdf=abc';
    const HS_LEGACY = RAW + 'Recepcion_Obra_OT425996_legacy.pdf';
    const r7b = await hacer({
      ordenes: [Object.assign({}, OT, { pdfUrlCloudinary: '', pdfUrl: APP })],
      pdfs: [{ id: 'p1', otClientId: 'ot_msz6tmso_ko60cfs', local: 'UNIMARC CHIGUAYANTE 2', pdfUrlCloudinary: HS_LEGACY }]
    }).fn(cotRota);
    check(!!r7b && r7b.url === HS_LEGACY,
      '7pre) tras rescatar la OT, el indice `pdfs` no recibe su id: una hoja legacy rescatada por ' +
      'numero sigue sin salir. Devolvio ' + (r7b ? r7b.url : 'null'));
    const r7c = await hacer({
      ordenes: [Object.assign({}, OT, { pdfUrlCloudinary: '', pdfUrl: APP })],
      pdfs: [{ id: 'p2', otNumero: 425996, local: 'UNIMARC CHIGUAYANTE 2', pdfUrlCloudinary: HS_LEGACY }]
    }).fn(cotRota);
    check(!!r7c && r7c.url === HS_LEGACY,
      '7pre) el indice `pdfs` por N de OT no recibe el numero de la OT rescatada (y el tipo tiene ' +
      'que ser el numerico: pdfs.otNumero es number en 328 de 330). Devolvio ' + (r7c ? r7c.url : 'null'));
    /* (i) El caso REAL del tipo: 12 de las 185 cotizaciones traen `otNumero` como TEXTO y
       `pdfs.otNumero` es numerico en 328 de 330. Una consulta de Firestore compara tipo Y valor:
       preguntar con "425996" contra el integer 425996 devuelve cero documentos SIN error, y el
       correo sale sin HS teniendo la hoja en Cloudinary. */
    const r7t = await hacer({
      ordenes: [{ id: 'ot_txt', numero: 425996, local: 'UNIMARC CHIGUAYANTE 2', firmada: true, pdfUrl: APP }],
      pdfs: [{ id: 'p4', otNumero: 425996, local: 'UNIMARC CHIGUAYANTE 2', pdfUrlCloudinary: HS_LEGACY }]
    }).fn({ id: 'v', otId: '', otNumero: '425996', local: 'UNIMARC CHIGUAYANTE 2',
            centro: '601', numeroCotizacion: '17092602' });
    check(!!r7t && r7t.url === HS_LEGACY,
      '7pre) con el N de OT guardado como TEXTO, la consulta al indice `pdfs` no encuentra la hoja ' +
      '(pdfs.otNumero es numerico en 328 de 330): devolvio ' + (r7t ? r7t.url : 'null'));

    /* (h) Con la OT borrada, la hoja aparece por `pdfs` y `ot` viene VACIO: el nombre tiene que
       sacar el N de OT de la propia cotizacion o la HS sale sin el numero que SMU necesita. */
    const r7d = await hacer({
      ordenes: [],
      pdfs: [{ id: 'p3', otNumero: 425996, local: 'UNIMARC CHIGUAYANTE 2', pdfUrlCloudinary: HS_LEGACY }]
    }).fn({ id: 'w', otId: '', otNumero: '', otCompletadaNumero: '425996',
            local: 'UNIMARC CHIGUAYANTE 2', centro: '601', numeroCotizacion: '17092602',
            nombreServicio: 'Mejoramiento circuito estanques' });
    check(!!r7d && /425996/.test(r7d.nombre),
      '7pre) sin la OT en la mano el nombre de la HS sale sin su N de OT: ' + (r7d ? r7d.nombre : 'null'));
  }
}

// === 7-10 · Adjuntar, planilla, cobrabilidad y el escritor del vinculo ==================
async function bloqueResto() {
  // --- 7 · el selector "Adjuntar" ---------------------------------------------------
  const candidato = cuerpo('function _previaAdjuntable(');
  const paraEsta = cuerpo('function _previasParaOT(');
  if (!check(!!candidato && !!paraEsta,
      '7) no existen _previaAdjuntable / _previasParaOT: el filtro de hoy exige ' +
      "estadoCot === 'Pendiente', asi que una previa Realizada que perdio su otId no tiene " +
      'NINGUN camino en la interfaz para volver a unirse a su OT')) {
    console.log('7) Adjuntar ofrece la previa desvinculada: FALLA');
  } else {
    const f7 = new Function(
      'function _normTexto(s){ return String(s==null?"":s).toLowerCase().normalize("NFD")' +
      '.replace(/[\\u0300-\\u036f]/g,"").replace(/\\s+/g," ").trim(); }\n' +
      'function _localCanonico(s){ return String(s==null?"":s); }\n' +
      candidato + '\n' + paraEsta + '\nreturn { adj: _previaAdjuntable, para: _previasParaOT };')();
    const pendiente = { id: 'p1', tipoCot: 'previa', estadoCot: 'Pendiente', local: 'UNIMARC PIONEROS' };
    const rota = { id: 'p2', tipoCot: 'previa', estadoCot: 'Realizada', otCompletadaNumero: '425996',
      local: 'UNIMARC CHIGUAYANTE 2' };
    const yaUnida = { id: 'p3', tipoCot: 'previa', estadoCot: 'Realizada', otId: 'ot_z',
      otNumero: '879946', otCompletadaNumero: '879946', local: 'UNIMARC MANQUIMAVIDA' };
    // Realizada, sin otId y SIN declarar a que hoja pertenece: no hay como saber de quien es.
    // Si entrara como candidata, `_previasParaOT` la ofreceria en CUALQUIER OT de cualquier local.
    const huerfana = { id: 'p4', tipoCot: 'previa', estadoCot: 'Realizada', local: 'UNIMARC YUNGAY' };
    const cands = [pendiente, rota, yaUnida, huerfana].filter(f7.adj);
    const okA = check(cands.indexOf(rota) !== -1, '7) la previa Realizada sin otId no entra como candidata') &
      check(cands.indexOf(pendiente) !== -1, '7) se perdio la previa Pendiente de siempre') &
      check(cands.indexOf(yaUnida) === -1, '7) una previa YA vinculada vuelve a ofrecerse para adjuntar') &
      check(cands.indexOf(huerfana) === -1,
        '7) una previa Realizada que no declara su hoja entra como candidata: se ofreceria en ' +
        'cualquier OT de cualquier local, que es como se cobra el trabajo de otro local');

    const ids = (ot) => f7.para(cands, ot).map(p => p.id);
    const suya = ids({ id: 'ot_msz6tmso_ko60cfs', numero: 425996, local: 'UNIMARC CHIGUAYANTE 2' });
    const ajena = ids({ id: 'ot_otra', numero: 999111, local: 'UNIMARC CHIGUAYANTE 2' });
    const otroLocal = ids({ id: 'ot_x', numero: 425996, local: 'ENTEL TALCAHUANO' });
    // Una OT sin numero no puede reclamar una previa que declara pertenecer a otra hoja.
    const sinNumero = ids({ id: 'ot_sn', numero: '', local: 'UNIMARC CHIGUAYANTE 2' });
    const okB = check(suya.indexOf('p2') !== -1, '7) la previa desvinculada no se ofrece en SU propia OT 425996') &
      check(suya.indexOf('p1') !== -1, '7) la previa Pendiente dejo de ofrecerse') &
      check(ajena.indexOf('p2') === -1, '7) la previa desvinculada se ofrece en una OT que NO es la suya') &
      check(otroLocal.indexOf('p2') === -1, '7) se ofrece en una OT de OTRO LOCAL con el mismo N de OT') &
      check(sinNumero.indexOf('p2') === -1, '7) una OT SIN NUMERO se lleva una previa que declara otra hoja');
    console.log('7) Adjuntar ofrece la previa desvinculada solo en su propia OT: ' + (okA && okB ? 'OK' : 'FALLA'));

    /* 13 · EL CHEQUEO ANCLADO A LA PANTALLA, no a las funciones sueltas.
       El primer intento de este arreglo construyo el boton "Reponer" y, en el mismo cambio, lo
       dejo inalcanzable: vivia en la rama `else` de `if (yaCotizada)` y la otra mitad del arreglo
       hizo `yaCotizada` verdadero para el unico documento que calificaba. El test pasaba igual
       porque llamaba a `_previaAdjuntable`/`_previasParaOT` sueltas. Es el mismo patron que el
       27-08: chequeo bien escrito, mal anclado. */
    const medias = cuerpo('function _vinculoAMedias(');
    if (!check(!!medias, '13) no existe _vinculoAMedias: la pregunta "esta cotizada" y la pregunta ' +
        '"el vinculo esta completo" se estan respondiendo con una sola condicion')) {
      console.log('13) El vinculo a medias se puede reparar desde la pantalla: FALLA');
    } else {
      const f13 = new Function(medias + '\nreturn _vinculoAMedias;')();
      const otSuya = { id: 'ot_msz6tmso_ko60cfs', numero: 425996, local: 'UNIMARC CHIGUAYANTE 2' };
      const okC = check(f13(rota, otSuya) === true, '13) no se detecta el vinculo a medias de la 17092602') &
        check(f13(yaUnida, { id: 'ot_z', numero: 879946 }) === false, '13) una cotizacion sana se marca como rota') &
        check(f13(rota, { id: 'ot_otra', numero: 999111, local: 'UNIMARC CHIGUAYANTE 2' }) === false,
          '13) se ofrece reponer contra una OT que no es la que la cotizacion declara') &
        check(f13(huerfana, otSuya) === false, '13) una previa que no declara su hoja se da por reparable') &
        check(f13(rota, { id: 'ot_sn', numero: '', local: 'UNIMARC CHIGUAYANTE 2' }) === false,
          '13) una OT sin numero se da por duena del vinculo');
      // Y que la pantalla la USE: sin esto el boton vuelve a ser codigo muerto.
      const tec = cuerpo('async function verOTsTecnico(');
      const sup = cuerpo('async function cargarOTsSupervisor(');
      const dibuja = /\n\s*if \(_vinculoAMedias\(/;
      const okD = check(dibuja.test(tec),
          '13) el perfil del tecnico no dibuja "Reponer vinculo" con esa condicion SOLA: si la ' +
          'guarda lleva algo mas adelante, el boton vuelve a ser codigo muerto como en el primer intento') &
        check(dibuja.test(sup), '13) el panel supervisor no dibuja "Reponer vinculo"') &
        check((tec.match(/Reponer vínculo/g) || []).length === 1 && (sup.match(/Reponer vínculo/g) || []).length === 1,
          '13) el boton "Reponer vinculo" no esta exactamente una vez en cada pantalla');
      console.log('13) El vinculo a medias se puede reparar desde la pantalla: ' + (okC && okD ? 'OK' : 'FALLA'));
    }
  }

  // --- 8/9 · la planilla de deuda ----------------------------------------------------
  const F9 = ['function _normTipo(', 'function _normTexto(', 'function _creadoEnMs(',
    'function _fechaOTms(', 'function _localCanonico(', 'function _claveOT(', 'function _dedupeOTs(',
    'function _plEsPreventiva(', 'function _esCobrable(', 'function _plDelCliente(',
    'function _plDatosCorrectivos('];
  const f9 = exigir(F9);
  if (!f9) { console.log('8-9) no se pudo medir la planilla'); return; }

  const COT_OK = { id: 'c1', _cliente: 'SMU', tipoCot: 'previa', estadoCot: 'Realizada',
    otId: 'otA', otNumero: 879946, total: 1489600, local: 'UNIMARC MANQUIMAVIDA', fecha: '28-07-2026' };
  const COT_ROTA = { id: 'c2', _cliente: 'SMU', tipoCot: 'previa', estadoCot: 'Realizada',
    otId: null, otNumero: '', otCompletadaNumero: '425996', total: 1478850,
    local: 'UNIMARC CHIGUAYANTE 2', fecha: '28-07-2026' };
  const COT_PENDIENTE = { id: 'c3', _cliente: 'SMU', tipoCot: 'previa', estadoCot: 'Pendiente',
    otId: null, otNumero: '', total: 2951900, local: 'UNIMARC PIONEROS', fecha: '17-09-2026' };
  const OT_ROTA = { id: 'ot_msz6tmso_ko60cfs', _cliente: 'SMU', numero: 425996, tipo: 'correctivo',
    local: 'UNIMARC CHIGUAYANTE 2', fecha: '18-08-2026', firmada: true, cotizacionId: 'c2', serviciosPreventivo: [] };
  const OT_OK = { id: 'otA', _cliente: 'SMU', numero: 879946, tipo: 'correctivo',
    local: 'UNIMARC MANQUIMAVIDA', fecha: '09-09-2026', firmada: true, cotizacionId: 'c1', serviciosPreventivo: [] };
  const OT_HUERFANA = { id: 'otH', _cliente: 'SMU', numero: 111222, tipo: 'correctivo',
    local: 'UNIMARC YUNGAY', fecha: '15-09-2026', firmada: true, serviciosPreventivo: [] };
  // Una OT cuyo cotizacionId apunta a un documento BORRADO sigue siendo trabajo sin cobrar.
  const OT_COT_FANTASMA = { id: 'otF', _cliente: 'SMU', numero: 333444, tipo: 'correctivo',
    local: 'UNIMARC CARRERA', fecha: '16-09-2026', firmada: true, cotizacionId: 'YA_NO_EXISTE',
    serviciosPreventivo: [] };
  /* Y una cuya cotizacion EXISTE pero no se esta cobrando: una previa 'Aceptada' cuyo cierre no
     logro pasarla a 'Realizada'. Si se la saca de "sin cotizar", el trabajo no queda en ningun
     bloque con monto ni en ninguna lista de pendientes: desaparece de la planilla entera. */
  const COT_ACEPTADA = { id: 'c4', _cliente: 'SMU', tipoCot: 'previa', estadoCot: 'Aceptada',
    otId: null, otNumero: '', total: 800000, local: 'UNIMARC HIGUERAS', fecha: '16-09-2026' };
  const OT_ACEPTADA = { id: 'otAc', _cliente: 'SMU', numero: 555666, tipo: 'correctivo',
    local: 'UNIMARC HIGUERAS', fecha: '16-09-2026', firmada: true, cotizacionId: 'c4',
    serviciosPreventivo: [] };

  const correr = new Function('CACHE',
    'var window = { ALIAS_LOCALES: {} };\nvar _plCliente = "SMU";\nvar _plCache = CACHE;\n' +
    f9.join('\n') + '\nreturn _plDatosCorrectivos();');
  const r9 = correr({
    ordenes: [OT_ROTA, OT_OK, OT_HUERFANA, OT_COT_FANTASMA, OT_ACEPTADA],
    cotizaciones: [COT_OK, COT_ROTA, COT_PENDIENTE, COT_ACEPTADA], sucursales: []
  });

  const sin = r9.sinCotizar.map(o => String(o.numero));
  const ok8 = check(sin.indexOf('425996') === -1,
      '8) la OT 425996 sale como "trabajo ejecutado sin cotizar" teniendo su cotizacionId = c2: ' +
      'el mismo trabajo aparece DOS veces en la misma planilla, arriba cobrado y abajo sin cotizar') &
    check(sin.indexOf('111222') !== -1, '8) una OT realmente sin cotizar dejo de listarse') &
    check(sin.indexOf('879946') === -1, '8) una OT con su cotizacion normal se lista como sin cotizar') &
    check(sin.indexOf('333444') !== -1,
      '8) una OT cuyo cotizacionId apunta a una cotizacion BORRADA se da por cotizada: ese trabajo ' +
      'no esta en ninguna planilla ni en ninguna factura y desaparece de la vista') &
    check(sin.indexOf('555666') !== -1,
      '8) una OT cuya cotizacion EXISTE pero NO es cobrable (previa Aceptada que no llego a ' +
      'Realizada) se saca de "sin cotizar": el trabajo queda fuera de los dos bloques de la ' +
      'planilla, sin monto y sin pendiente. Existir no es estar cobrandose.');
  console.log('8) Una OT con cotizacionId vivo y cobrable no vuelve a figurar "sin cotizar": ' + (ok8 ? 'OK' : 'FALLA'));

  const cob = r9.cobrables.map(c => c.id), pre = r9.previas.map(c => c.id);
  const ok9 = check(cob.indexOf('c1') !== -1 && cob.indexOf('c2') !== -1,
      '9) una previa YA REALIZADA dejo de sumar a la deuda (c1/c2 fuera de cobrables)') &
    check(pre.indexOf('c3') !== -1 && cob.indexOf('c3') === -1,
      '9) una previa PENDIENTE entro a la deuda: eso infla la cobranza y SMU rechaza el paquete') &
    check(r9.total === 1489600 + 1478850, '9) el total cobrable cambio: ' + r9.total);
  console.log('9) Previa realizada suma, previa pendiente no: ' + (ok9 ? 'OK' : 'FALLA'));

  // --- 10 · quien escribe el vinculo cuando la OT nace de una previa aceptada ---------
  //     EJECUTADA, no leida: lo que importa es el payload que llega a Firestore.
  const F10 = ['function _cotPdfCaduco(', 'async function _vincularCotizacionRealizada('];
  const f10 = exigir(F10);
  if (!f10) { console.log('10) no se pudo medir el vinculo del cierre'); return; }
  async function unir(datos) {
    const db = espiaDB();
    const fn = new Function('DB',
      'var window = { _firebaseReady: true, firebase: { firestore: function(){ return DB; } } };\n' +
      'var console = { error: function(){} };\nfunction _conTimeout(p){ return p; }\n' + f10.join('\n') +
      '\nreturn _vincularCotizacionRealizada;')(db);
    await fn('COT_X', datos);
    const u = db.esc.filter(e => e.col === 'cotizaciones' && e.op === 'update')[0];
    return u ? u.obj : null;
  }
  /* El arnes le presta un `_conTimeout` que no hace nada, asi que la ejecucion no puede ver si
     la guardia esta. Se mira aparte: era la UNICA llamada a Firestore sin guardia del bucle de
     `sincronizarOTsPendientes`, que corre en serie — un cuelgue aca se lleva por delante el
     correo al local, el desencolado, el aviso a administracion y las OT siguientes. */
  check(/_conTimeout\(\s*db\.collection\('cotizaciones'\)\.doc\(cotId\)\.update\(_union\)/.test(f10[1]),
    '10) el update de _vincularCotizacionRealizada NO va con guardia de tiempo: es el bug de julio ' +
    'de guardarYEnviarPDF escrito de nuevo, y dentro del bucle de la cola offline');
  // (a) el cierre normal: la OT existe y pasa su id -> el vinculo queda completo.
  const p10a = await unir({ otDocId: 'ot_msz6tmso_ko60cfs', numero: 425996, fecha: '18-08-2026',
    tecnico: 'Nelson Herrera', urlsAntes: [], urlsDespues: [] });
  // (b) sin el id de la OT no se inventa nada NI se pisa con vacio el vinculo que ya hubiera.
  const p10b = await unir({ numero: '', fecha: '18-08-2026', tecnico: 'Nelson Herrera' });
  const ok10 = check(!!p10a && p10a.otId === 'ot_msz6tmso_ko60cfs' && String(p10a.otNumero) === '425996',
      '10) _vincularCotizacionRealizada escribe estadoCot y otCompletadaNumero pero NO otId/otNumero ' +
      '(quedo otId=' + (p10a ? JSON.stringify(p10a.otId) : 'sin update') + '): toda previa unida por ' +
      'ese camino (aceptar -> OT en espera -> cierre) nace ya sin HS en su correo, que es el mismo ' +
      'hueco que dejo la 17092602') &
    check(!!p10a && p10a.estadoCot === 'Realizada' && String(p10a.otCompletadaNumero) === '425996',
      '10) se perdio lo que la funcion ya hacia bien (estadoCot / otCompletadaNumero)') &
    check(!!p10b && !('otId' in p10b) && !('otNumero' in p10b),
      '10) sin el id de la OT igual escribe el vinculo: un vacio con merge borra el que ' +
      '"Adjuntar previa" pudo haber dejado antes');
  console.log('10) El cierre de una previa aceptada deja el vinculo completo: ' + (ok10 ? 'OK' : 'FALLA'));

  // --- 11 · el correo no se calla que falta la HS -------------------------------------
  //     No se puede ejecutar: es una plantilla HTML armada dentro del bucle de envio. Se
  //     vigila la CONDICION, que es lo unico que decide si el aviso se dibuja o no.
  const envio = cuerpo('async function _procesarEnvioCotizaciones(');
  const ok11 = check(/const faltaHs = \(it\.otId \|\| it\.otNumero \|\| it\.otCompletadaNumero\)/.test(envio),
    '11) el aviso "HS no disponible" solo se dibuja si la cotizacion declara otId u otNumero: con ' +
    'el vinculo borrado la guardia se apaga justo cuando hace falta y el correo sale sin HS y sin ' +
    'decirlo, como si fuera un presupuesto. Es el patron del caso 484304.');
  console.log('11) El correo avisa si la HS no viajo: ' + (ok11 ? 'OK' : 'FALLA'));

  // --- 12 · entrar a cotizar una OT cancela la edicion abierta -------------------------
  const abrir = cuerpo('async function abrirCotizacion(');
  const ok12 = check(/window\._editandoCotizacionId = null;/.test(abrir),
    '12) abrirCotizacion no limpia window._editandoCotizacionId: salir de "Editar cotizacion" sin ' +
    'guardar deja la bandera encendida, y el siguiente guardado hace update sobre la cotizacion ' +
    'ANTERIOR con los datos de esta OT en vez de crear una nueva');
  console.log('12) Cotizar una OT cancela la edicion abierta: ' + (ok12 ? 'OK' : 'FALLA'));

  /* --- 14 · el N de OT que se IMPRIME y se EXPORTA ------------------------------------
     El nombre de la HS cae a `otCompletadaNumero` (bloque 5). Si el cuerpo de la CT y la
     planilla no hacen lo mismo, a SMU le llegan dos archivos que se contradicen: la HS
     nombrada "HS - 425996 - ..." junto a una CT con el recuadro "N OT" vacio, y una fila de
     planilla sin el numero. Es justo el dato con el que Procurement parea los dos para la HES.
     Son plantillas y filas de tabla: no se pueden ejecutar sueltas, se vigila la expresion. */
  const pdfCot = cuerpo('async function generarPDFCotizacionGuardada(');
  const render = cuerpo('function _plRenderCorrectivos(');
  const excel = cuerpo('function descargarExcelPlanilla(');
  const ok14 = check(/cotData\.otNumero \|\| cotData\.otCompletadaNumero/.test(pdfCot),
      '14) el cuerpo del PDF de la CT imprime solo `cotData.otNumero`: con el vinculo a medias sale ' +
      'el recuadro "N OT" vacio al lado de una HS que si lleva el numero en el nombre') &
    check(/otCompletadaNumero/.test(render),
      '14) la fila de la planilla (columna "HS (N OT)" y el buscador) no cae a otCompletadaNumero: ' +
      'buscar "425996" en la planilla no devuelve la fila de ese trabajo') &
    check(/otCompletadaNumero/.test(excel),
      '14) el Excel que se le manda a SMU exporta la celda del N de OT vacia');
  console.log('14) La CT, la planilla y el Excel imprimen el N de OT que la app conoce: ' + (ok14 ? 'OK' : 'FALLA'));

  /* --- 15 · los documentos que recibe SMU dicen HS, no OT -----------------------------
     SMU dejo de llamarlo orden de trabajo (decision de Bastian, 19-09-2026). El archivo ya se
     llamaba `HS - 425996 - CT 17092602 - …`, asi que un recuadro que decia "N OT" contradecia
     al nombre del propio documento. Son TRES documentos: la CT, la hoja de servicio (3
     generadores: la suelta y las dos copias como pagina 2 de la cotizacion) y el registro
     fotografico (3 sitios). Firmar uno solo deja la mitad del paquete diciendo lo contrario. */
  // Linea por linea y sin comentarios: un `[^)]*` cruza lineas y se lleva por delante el
  // comentario de al lado, que es justo donde el codigo EXPLICA el cambio.
  const impresos = src.split('\n')
    .map(l => l.replace(/\/\/.*$/, '').trim())
    .filter(l => /doc\.text\(/.test(l) && /(['"])[^'"]*\bOT\b[^'"]*\1/.test(l));
  const subHS = (src.match(/'mero de HS\)'/g) || []).length;
  const regHS = (src.match(/'HS #'\s*\+/g) || []).length;
  const formato = Number((src.match(/var\s+_PDF_COT_FORMATO\s*=\s*(\d+)/) || [0, 0])[1]);
  const ok15 = check(!impresos.length,
      '15) todavia se IMPRIME "OT" en un PDF que recibe SMU: ' + impresos.join(' | ')) &
    check(/doc\.text\('N' \+ String\.fromCharCode\(176\) \+ ' HS'/.test(src),
      '15) el recuadro de la CT no dice "N° HS"') &
    check(subHS === 3, '15) el subtitulo del folio dice HS en ' + subHS + ' de los 3 generadores de hoja') &
    check(regHS === 3, '15) el registro fotografico dice HS en ' + regHS + ' de los 3 sitios') &
    check(formato >= 5,
      '15) no subio _PDF_COT_FORMATO (esta en ' + formato + '): cambio COMO se dibuja el PDF, y sin ' +
      'subir el sello las cotizaciones ya subidas no se redibujan y el cliente no ve el cambio por ' +
      'ningun camino');
  console.log('15) Los 3 documentos que recibe SMU dicen HS (formato ' + formato + '): ' + (ok15 ? 'OK' : 'FALLA'));
}

/* Linea de control: cada bloque corre UNA vez y en orden. Si uno revienta se declara en falla
   y los siguientes igual corren — un guion que muere a medias se parece demasiado a uno que aprueba. */
(async function main() {
  for (const [nombre, fn] of [['guardarCotizacion', bloqueGuardar], ['_obtenerHojaDeCot', bloqueHoja], ['Adjuntar/planilla/vinculo', bloqueResto]]) {
    try { await fn(); }
    catch (e) { check(false, 'el bloque de ' + nombre + ' revento: ' + (e && e.stack || e)); }
  }
  fin();
})();

function fin() {
  if (fallos.length) {
    console.error('\nFALLOS:\n' + fallos.join('\n'));
    console.error('\n' + fallos.length + ' comprobacion(es) fallaron.');
    process.exit(1);
  }
  console.log('\nTodas las comprobaciones pasan.');
  process.exit(0);
}
