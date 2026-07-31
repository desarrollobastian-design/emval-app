/* Prueba de regresion — el N° de OT no se puede cruzar entre dos hojas cerradas seguidas.
   Extrae _nombreArchivoPDF() y guardarYEnviarPDF() TAL CUAL estan en index.html y las corre con
   stubs, pisando `estado` en pleno await de Cloudinary (que es lo que hace nuevaOT() cuando el
   tecnico arranca la hoja siguiente sin esperar).

   Uso:  node test-numero-ot.js <ruta-al-index.html>
   Sale 0 si el numero sobrevive en los 4 escritos; 1 si se cruza. */

const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

function extraer(desde, hasta) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('No se encontro: ' + desde);
  const j = src.indexOf(hasta, i);
  if (j < 0) throw new Error('No se encontro el fin de: ' + desde);
  return src.slice(i, j);
}

const codNombre = extraer('function _nombreArchivoPDF(', '\nasync function guardarYEnviarPDF()');
const codGuardar = extraer('async function guardarYEnviarPDF()', '\nasync function verCotizacionDirecta(');

// ── El escenario ─────────────────────────────────────────────────────────────────────────────
// OT real de produccion (30-jul-2026): la que quedo con el archivo 673113 y el registro 535219.
const OT_A = {
  otNumero: 673113, tipo: 'correctivo', ceco: '',
  local: 'UNIMARC CABRERO', usuario: 'José Quiroz',
  otClientId: 'ot_ms7ua516_sgf2bhl', editandoOTId: '',
  emailAdmin: 'admin.cabrero@smu.cl', emailSucursal: '',
  serviciosPreventivo: [], fotosAntes: [], fotosDespues: []
};
const OT_PREV = Object.assign({}, OT_A, {
  otNumero: 394984, tipo: 'preventivo', ceco: '716',
  local: 'UNIMARC LAS VIOLETAS', otClientId: 'ot_prev_7k2m9x1',
  serviciosPreventivo: new Array(11).fill('si')
});

async function correr(otInicial, etiqueta) {
  const escritos = { pdfs: null, correo: null, notificacion: null, publicId: null, ordenDoc: null };
  const estado = Object.assign({}, otInicial);
  let pisado = false;

  // nuevaOT() real (index.html 2035): numero nuevo, clientId VACIO, tipo null.
  function pisarConLaOTSiguiente() {
    pisado = true;
    estado.otNumero = 535219;
    estado.otClientId = '';
    estado.editandoOTId = '';
    estado.tipo = null;
    estado.local = '';
    estado.ceco = '';
    estado.serviciosPreventivo = [];
    estado.emailAdmin = '';
    estado.emailSucursal = '';
  }

  const sandbox = {
    estado,
    console: { log(){}, error(){}, warn(){} },
    toast(){}, _error(){},
    async _avisar(m){ throw new Error('_avisar no deberia dispararse: ' + m); },
    SERVICIOS_PREVENTIVO: new Array(11).fill(0),
    _pautaCompleta: p => Array.isArray(p) && p.length === 11 && p.every(Boolean),
    _numOTCorreo: n => (n == null || n === '') ? '' : String(n),
    _tecnicoActual: () => estado.usuario || '',
    _uid: () => 'uid_' + Math.random().toString(36).slice(2, 10),
    _agregarPDFaColaPendiente(){},
    CLOUDINARY: { cloudName: 'dcrf29tna' },
    async generarPDFRecepcionObra(){ return { output: t => t === 'blob' ? { size: 1 } : 'data:application/pdf;base64,AAAA' }; },
    async agregarFotosAlPDF(){},
    document: { getElementById: id => id === 'desc-trabajo' ? { value: pisado ? '' : 'Cambio de rodamiento' } : null },

    // El await largo: aca es donde el tecnico toca "Nueva OT".
    async fetch(url, opts) {
      for (const [k, v] of opts.body._campos) if (k === 'public_id') escritos.publicId = v;
      pisarConLaOTSiguiente();
      return { json: async () => ({ secure_url: 'https://res.cloudinary.com/dcrf29tna/raw/upload/emval/pdfs/x.pdf' }) };
    },
    FormData: class { constructor(){ this._campos = []; } append(k, v){ this._campos.push([k, v]); } },

    async _enviarCorreo(p) {
      if (p.email_admin === 'notif@emval') escritos.notificacion = p; else escritos.correo = p;
      return true;
    },
    window: {
      PEDRO_NOTIF_EMAIL: 'notif@emval',
      _firebaseReady: true,
      firebase: {
        firestore: Object.assign(() => ({
          collection: name => ({
            add: async d => { if (name === 'pdfs') escritos.pdfs = d; return { id: 'pdfdoc1' }; },
            doc: id => ({
              set: async () => { escritos.ordenDoc = id; },
              update: async () => { escritos.ordenDoc = id; }
            }),
            where: () => ({ get: async () => ({ empty: true, docs: [] }) })
          })
        }), { FieldValue: { serverTimestamp: () => 'ts' } })
      }
    }
  };
  sandbox.window.firebase.firestore.FieldValue = { serverTimestamp: () => 'ts' };

  const nombres = Object.keys(sandbox);
  const fn = new Function(...nombres, `
    ${codNombre}
    ${codGuardar}
    return async function(){
      // _notificarOTCompletada real (index.html 3174), sin recortar.
      globalThis._notificarOTCompletada = async function(numero, local, tecnico, tipo, fecha, pdfUrl, nota) {
        return _enviarCorreo({
          email_admin: window.PEDRO_NOTIF_EMAIL,
          ot_numero: _numOTCorreo(numero),
          local: String(local), fecha: String(fecha), tecnico: String(tecnico),
          tipo: tipo === 'preventivo' ? 'Preventivo' : 'Correctivo',
          trabajo: String(nota || ''), pdf_url: pdfUrl || ''
        });
      };
      var _notificarOTCompletada = globalThis._notificarOTCompletada;
      return guardarYEnviarPDF();
    };
  `)(...nombres.map(n => sandbox[n]));

  await fn();

  const esperado = String(otInicial.otNumero);
  const fallos = [];
  const chequeo = (que, valor) => { if (String(valor) !== esperado) fallos.push(`  ✗ ${que}: ${valor} (esperado ${esperado})`); };

  chequeo('nombre del archivo (Cloudinary public_id)', (escritos.publicId || '').match(/\d{5,}/)?.[0]);
  chequeo('coleccion pdfs → otNumero', escritos.pdfs && escritos.pdfs.otNumero);
  chequeo('correo al local → ot_numero', escritos.correo && escritos.correo.ot_numero);
  chequeo('aviso a administracion → ot_numero', escritos.notificacion && escritos.notificacion.ot_numero);

  if (escritos.pdfs && escritos.pdfs.otClientId !== otInicial.otClientId)
    fallos.push(`  ✗ pdfs.otClientId: "${escritos.pdfs.otClientId}" (esperado "${otInicial.otClientId}") — sin el, el PDF no se re-enlaza`);
  if (escritos.ordenDoc !== otInicial.otClientId)
    fallos.push(`  ✗ ordenes: se enlazo el doc "${escritos.ordenDoc}" (esperado "${otInicial.otClientId}")`);
  if (otInicial.tipo === 'preventivo' && !/^716-HS/.test(escritos.publicId || ''))
    fallos.push(`  ✗ el archivo perdio el formato de PREVENTIVO: ${escritos.publicId}`);
  if (escritos.correo && escritos.correo.tipo !== (otInicial.tipo === 'preventivo' ? 'Preventivo' : 'Correctivo'))
    fallos.push(`  ✗ el correo cambio de tipo: ${escritos.correo.tipo}`);
  if (escritos.notificacion && escritos.notificacion.local !== otInicial.local)
    fallos.push(`  ✗ el aviso a administracion cambio de local: "${escritos.notificacion.local}"`);

  console.log((fallos.length ? '❌ FALLA' : '✅ OK   ') + '  ' + etiqueta);
  fallos.forEach(f => console.log(f));
  return fallos.length === 0;
}

(async () => {
  console.log('Cierre de dos hojas seguidas — el estado se pisa durante la subida a Cloudinary\n');
  const a = await correr(OT_A, 'Correctivo #673113 (caso real 30-jul, 1,5 s entre escritos)');
  const b = await correr(OT_PREV, 'Preventivo #394984 (caso real 23-jul, LAS VIOLETAS)');
  console.log('');
  process.exit(a && b ? 0 : 1);
})();
