/* Repone el vinculo COT <-> HS que el guardado de una correccion de precio borro.
   Caso 17-09-2026: cotizacion 17092602 (UNIMARC CHIGUAYANTE 2) / HS 425996.

   QUE PASO. `guardarCotizacion` escribia `otId: null` y `otNumero: ''` cada vez que guardaba una
   cotizacion `tipoCot:'previa'`, tambien dentro del `update` de una EDICION. Pedro corrigio
   $400 neto de un item y el guardado le borro el vinculo con su hoja: el correo a SMU salio sin
   HS, la CT impresa salio con el campo "N OT" en blanco y la OT volvio a figurar "sin cotizar".
   El arreglo del codigo ya esta en index.html; esto es para el documento que quedo roto.

   ⚠️ ANTES DE USAR ESTO, considera el camino de la app: con el fix desplegado, "Adjuntar previa"
   ofrece la cotizacion bajo el boton **Reponer** en su propia OT, y al apretarlo la app escribe
   el vinculo por los dos lados Y caduca el PDF (`_cotPdfCaduco`), asi que la CT se vuelve a
   dibujar con su N de OT. Esta herramienta NO caduca el PDF salvo que se le pida con --caducar.

   SOLO LECTURA POR DEFECTO. Sin `--ejecutar` simula: muestra el antes, el despues y el respaldo
   que escribiria, y no toca nada. Con `--ejecutar` pide confirmacion tecleada, escribe el
   respaldo y recien ahi hace el PATCH con `updateMask` (nunca un set completo).

   Uso:
     node tools/reponer-vinculo-cot-hs.js                     # simula el caso 17092602
     node tools/reponer-vinculo-cot-hs.js --caducar           # ademas invalida el PDF viejo
     node tools/reponer-vinculo-cot-hs.js --creado            # ademas restaura creadoEn
     node tools/reponer-vinculo-cot-hs.js --respaldo <ruta>   # donde dejar el respaldo
     node tools/reponer-vinculo-cot-hs.js --ejecutar          # escribe (pide confirmacion)

   ⛔ Es PRODUCCION y es un documento de cobranza: lo autoriza Pedro. */

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const KEY = (fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8').match(/apiKey:\s*"([^"]+)"/) || [])[1];
const BASE = 'https://firestore.googleapis.com/v1/projects/emval-app/databases/(default)/documents';
if (!KEY) { console.error('No se pudo leer la apiKey de index.html.'); process.exit(1); }

const args = process.argv.slice(2);
const EJECUTAR = args.includes('--ejecutar');
const CADUCAR = args.includes('--caducar');
const CREADO = args.includes('--creado');
// El folio en la OT es cosmetico (la nomenclatura lo resuelve desde la propia cotizacion): va
// aparte para poder escribir SOLO los dos campos del vinculo cuando eso es lo autorizado.
const CON_OT = args.includes('--con-ot');
const RESPALDO = (function () {
  const i = args.indexOf('--respaldo');
  return i >= 0 && args[i + 1] ? args[i + 1] : path.join(__dirname, 'respaldos');
})();

/* El caso, con TODO lo que hay que comprobar antes de escribir. No se repara "la cotizacion X":
   se repara un documento cuyo estado coincide exactamente con el dano conocido. Si algo no calza
   —porque alguien ya la reparo, o porque el documento es otro— la herramienta se niega. */
const CASOS = [{
  etiqueta: '17092602 / HS 425996 (UNIMARC CHIGUAYANTE 2)',
  cotId: 'VTgrtHCjJ9pEnRAmDcIg',
  otId: 'ot_msz6tmso_ko60cfs',
  otNumero: '425996',
  local: 'UNIMARC CHIGUAYANTE 2'
}];

// ---- REST -------------------------------------------------------------------------------
function plano(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) { const o = {}; for (const k in (v.mapValue.fields || {})) o[k] = plano(v.mapValue.fields[k]); return o; }
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(plano);
  return v;
}
async function leer(col, id) {
  const r = await fetch(`${BASE}/${col}/${id}?key=${KEY}`);
  if (!r.ok) return { ok: false, estado: r.status };
  const j = await r.json();
  const o = { _id: id, _createTime: j.createTime, _updateTime: j.updateTime };
  for (const k in (j.fields || {})) o[k] = plano(j.fields[k]);
  return { ok: true, doc: o, crudo: j };
}
async function parchar(col, id, campos) {
  const mask = Object.keys(campos).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const r = await fetch(`${BASE}/${col}/${id}?key=${KEY}&${mask}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: campos })
  });
  if (!r.ok) throw new Error('PATCH ' + col + '/' + id + ' -> ' + r.status + ' ' + (await r.text()).slice(0, 300));
  return r.json();
}
const S = v => ({ stringValue: String(v) });
const T = v => ({ timestampValue: v });

// ---- Diagnostico ------------------------------------------------------------------------
function vacio(v) { return v === null || v === undefined || String(v).trim() === ''; }

async function diagnosticar(caso) {
  const c = await leer('cotizaciones', caso.cotId);
  const o = await leer('ordenes', caso.otId);
  const problemas = [];
  if (!c.ok) problemas.push('la cotizacion ' + caso.cotId + ' no responde (HTTP ' + c.estado + ')');
  if (!o.ok) problemas.push('la OT ' + caso.otId + ' no responde (HTTP ' + o.estado + ')');
  if (!c.ok || !o.ok) return { problemas: problemas };
  const cot = c.doc, ot = o.doc;

  // Precondiciones: sin las cuatro, no se escribe. El vinculo NO se deduce por parecido.
  if (!vacio(cot.otId) || !vacio(cot.otNumero))
    problemas.push('la cotizacion YA tiene vinculo (otId=' + JSON.stringify(cot.otId) + ', otNumero=' +
      JSON.stringify(cot.otNumero) + '): puede haberla reparado alguien mas. No se toca.');
  if (ot.cotizacionId !== caso.cotId)
    problemas.push('la OT no apunta a esta cotizacion (ordenes.cotizacionId=' + JSON.stringify(ot.cotizacionId) + ')');
  if (String(cot.otCompletadaNumero || '') !== caso.otNumero)
    problemas.push('la cotizacion declara otra hoja (otCompletadaNumero=' + JSON.stringify(cot.otCompletadaNumero) + ')');
  if (String(ot.numero) !== caso.otNumero)
    problemas.push('el N de la OT no es el esperado (ordenes.numero=' + JSON.stringify(ot.numero) + ')');
  if (String(cot.local || '').trim().toUpperCase() !== String(ot.local || '').trim().toUpperCase())
    problemas.push('el local no coincide: COT "' + cot.local + '" vs OT "' + ot.local + '"');

  const cambiosCot = { otId: S(caso.otId), otNumero: S(caso.otNumero) };
  if (CREADO && cot._createTime) cambiosCot.creadoEn = T(cot._createTime);
  if (CADUCAR) { cambiosCot.pdfUrl = S(''); cambiosCot.contenidoActualizadoEn = { integerValue: String(Date.now()) }; }
  const cambiosOT = {};
  if (CON_OT && vacio(ot.cotizacionNumero) && !vacio(cot.numeroCotizacion))
    cambiosOT.cotizacionNumero = S(String(cot.numeroCotizacion));

  return { problemas: problemas, cot: cot, ot: ot, cambiosCot: cambiosCot, cambiosOT: cambiosOT, crudo: { cot: c.crudo, ot: o.crudo } };
}

function mostrar(caso, d) {
  console.log('\n=== ' + caso.etiqueta + ' ===');
  console.log('  cotizaciones/' + caso.cotId);
  console.log('    numeroCotizacion  : ' + JSON.stringify(d.cot.numeroCotizacion) + '   (fechaCodigo ' + JSON.stringify(d.cot.fechaCodigo) + ')');
  console.log('    tipoCot/estadoCot : ' + d.cot.tipoCot + ' / ' + d.cot.estadoCot);
  console.log('    local / centro    : ' + d.cot.local + ' / ' + d.cot.centro);
  console.log('    total             : $' + Number(d.cot.total || 0).toLocaleString('es-CL') + '  (sin apellido: la app no guarda si es neto o c/IVA)');
  console.log('    otId              : ' + JSON.stringify(d.cot.otId) + '   <-- se repone');
  console.log('    otNumero          : ' + JSON.stringify(d.cot.otNumero) + '   <-- se repone');
  console.log('    otCompletadaNumero: ' + JSON.stringify(d.cot.otCompletadaNumero) + '   (el rastro que quedo)');
  console.log('    creadoEn          : ' + JSON.stringify(d.cot.creadoEn) + '   (_createTime real: ' + d.cot._createTime + ')');
  console.log('  ordenes/' + caso.otId);
  console.log('    numero            : ' + JSON.stringify(d.ot.numero) + '  local ' + d.ot.local + '  firmada ' + d.ot.firmada);
  console.log('    cotizacionId      : ' + JSON.stringify(d.ot.cotizacionId) + '   (este lado NUNCA se rompio)');
  console.log('    cotizacionNumero  : ' + JSON.stringify(d.ot.cotizacionNumero));
  console.log('\n  CAMBIOS PROPUESTOS (PATCH con updateMask, nada mas se toca):');
  console.log('    cotizaciones/' + caso.cotId + ' -> ' + JSON.stringify(d.cambiosCot));
  if (Object.keys(d.cambiosOT).length) console.log('    ordenes/' + caso.otId + '       -> ' + JSON.stringify(d.cambiosOT));
  else console.log('    ordenes/' + caso.otId + '       -> (sin cambios)');
  console.log('\n  LO QUE ESTO NO HACE: no cambia el folio (17092602 sigue siendo 17092602; volver a');
  console.log('  28072602 es decision de Pedro, porque SMU recibio los DOS numeros), no reenvia');
  console.log('  ningun correo, y sin --caducar tampoco regenera el PDF que ya tiene SMU.');
}

(async function () {
  console.log('Reponer el vinculo COT <-> HS' + (EJECUTAR ? '  [MODO ESCRITURA]' : '  [SIMULACION — no escribe nada]'));
  const listos = [];
  for (const caso of CASOS) {
    const d = await diagnosticar(caso);
    if (d.problemas.length) {
      console.log('\n=== ' + caso.etiqueta + ' ===');
      console.log('  NO SE REPARA:');
      d.problemas.forEach(p => console.log('    - ' + p));
      continue;
    }
    mostrar(caso, d);
    listos.push({ caso: caso, d: d });
  }
  if (!listos.length) { console.log('\nNada que reparar.'); return; }

  if (!EJECUTAR) {
    console.log('\nSimulacion terminada. Para escribir de verdad: --ejecutar (pide confirmacion tecleada).');
    return;
  }

  fs.mkdirSync(RESPALDO, { recursive: true });
  const sello = new Date().toISOString().replace(/[:.]/g, '-');
  for (const { caso, d } of listos) {
    const f = path.join(RESPALDO, 'respaldo_' + caso.cotId + '_' + sello + '.json');
    fs.writeFileSync(f, JSON.stringify({ cuando: new Date().toISOString(), caso: caso.etiqueta,
      documentos: d.crudo, cambiosPropuestos: { cot: d.cambiosCot, ot: d.cambiosOT } }, null, 1));
    console.log('\n  Respaldo escrito: ' + f);
  }

  const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  const resp = await new Promise(r => rl.question('\nEscribe REPONER para aplicar los cambios en PRODUCCION: ', a => { rl.close(); r(a); }));
  if (String(resp).trim() !== 'REPONER') { console.log('Cancelado. No se escribio nada.'); return; }

  for (const { caso, d } of listos) {
    await parchar('cotizaciones', caso.cotId, d.cambiosCot);
    console.log('  cotizaciones/' + caso.cotId + ' actualizada.');
    if (Object.keys(d.cambiosOT).length) {
      await parchar('ordenes', caso.otId, d.cambiosOT);
      console.log('  ordenes/' + caso.otId + ' actualizada.');
    }
  }
  console.log('\nListo. Verifica en la app: la OT debe volver a decir "Cotizacion realizada" y el');
  console.log('envio de la cotizacion debe adjuntar su HS como archivo separado.');
})().catch(e => { console.error('\nERROR: ' + e.message); process.exit(1); });
