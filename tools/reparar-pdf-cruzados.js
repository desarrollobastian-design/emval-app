/* Reparacion de los PDF que quedaron con el numero de OT cruzado (datos anteriores al fix
   fix/numero-ot-cruzado, PR #30, desplegado 31-jul-2026).

   ─── QUE ARREGLA ──────────────────────────────────────────────────────────────────────────────
   Antes del fix, `guardarYEnviarPDF` leia el `estado` global DESPUES del await de Cloudinary. Si
   el tecnico arrancaba la OT siguiente en esa ventana, el registro de `pdfs` quedaba con el numero
   de la OT NUEVA y con `otClientId` VACIO, mientras el archivo ya subido conservaba el numero y el
   clientId de la OT REAL. Resultado: un PDF que existe, pero que la app no puede enlazar.

   El nombre del archivo es lo que salva el caso — trae las dos mitades de la identidad real:
       Recepcion_Obra_OT673113_sgf2bhl.pdf
                       ^numero  ^ultimos 7 del docId de la orden
       716-HS 394984-MP Transpaletas Julio 2026_dkcwj8s.pdf
              ^numero                           ^ultimos 7 del docId

   ─── LA DOBLE LLAVE (lo que hace que esto no sea adivinar) ────────────────────────────────────
   Un registro solo se repara si el numero del archivo Y el sufijo del docId apuntan a LA MISMA
   orden. Con una sola de las dos no se toca nada: el numero solo no basta (hay numeros duplicados
   por la colision vieja) y el sufijo solo tampoco (no se puede consultar por sufijo de docId).
   Ademas se exige que el PDF responda en Cloudinary antes de enlazarlo.

   ─── USO ──────────────────────────────────────────────────────────────────────────────────────
   node tools/reparar-pdf-cruzados.js              → SIMULACION. No escribe nada. Es el default.
   node tools/reparar-pdf-cruzados.js --ejecutar   → escribe en produccion (pide confirmacion).

   ⚠️ Escribir es PRODUCCION y requiere autorizacion explicita de Pedro. El respaldo de todos los
   documentos afectados se guarda ANTES de tocar nada en 08_Soporte_Postventa/Tickets/.
   ────────────────────────────────────────────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');

const API_KEY = 'AIzaSyAlIQW1wl8rRx4MlbOBz3Zgq9pS01Ys7B4';
const BASE = 'https://firestore.googleapis.com/v1/projects/emval-app/databases/(default)/documents';
const DIR_RESPALDO = 'F:/CorexOn/08_Soporte_Postventa/Tickets';

const EJECUTAR = process.argv.includes('--ejecutar');

// ── Utilidades de Firestore REST ──────────────────────────────────────────────────────────────
const val = v => v == null ? null : Object.values(v)[0];
const campos = doc => {
  const o = {};
  for (const [k, v] of Object.entries(doc.fields || {})) o[k] = val(v);
  return o;
};
const idDe = doc => doc.name.split('/').pop();

async function traerColeccion(col, fields) {
  const body = {
    structuredQuery: {
      from: [{ collectionId: col }],
      select: { fields: fields.map(f => ({ fieldPath: f })) }
    }
  };
  const r = await fetch(`${BASE}:runQuery?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error('Firestore respondio raro: ' + JSON.stringify(j).slice(0, 300));
  return j.filter(x => x.document).map(x => x.document);
}

async function parchar(col, docId, fields) {
  const mask = Object.keys(fields).map(f => `updateMask.fieldPaths=${f}`).join('&');
  const r = await fetch(`${BASE}/${col}/${docId}?key=${API_KEY}&${mask}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  if (!r.ok) throw new Error(`PATCH ${col}/${docId} fallo: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function pdfExiste(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok;
  } catch { return false; }
}

// ── Leer la identidad real desde el nombre del archivo ─────────────────────────────────────────
// Devuelve { numero, sufijo, tipo } o null si el nombre no sigue ninguno de los dos formatos.
function identidadDelArchivo(urlCloudinary) {
  if (!urlCloudinary) return null;
  const nombre = decodeURIComponent(String(urlCloudinary).split('/').pop() || '');
  // Correctivo: Recepcion_Obra_OT<numero>_<sufijo>.pdf
  let m = nombre.match(/^Recepcion_Obra_OT(\d+)_([a-z0-9]+)\.pdf$/i);
  if (m) return { numero: m[1], sufijo: m[2], tipo: 'correctivo', nombre };
  // Preventivo: <ceco>-HS <numero>-MP Transpaletas <Mes> <Año>_<sufijo>.pdf
  m = nombre.match(/-HS (\d+)-MP Transpaletas .*_([a-z0-9]+)\.pdf$/i);
  if (m) return { numero: m[1], sufijo: m[2], tipo: 'preventivo', nombre };
  return null; // nombre viejo sin sufijo (pre-clientId) → no reparable por esta via
}

/* ── LA DECISION, aislada y sin efectos ────────────────────────────────────────────────────────
   Recibe los documentos crudos de las dos colecciones y devuelve que se repara y que no.
   Es pura a proposito: asi la prueba (tests/reparar-pdf-cruzados.test.js) puede meterle los casos
   peligrosos —numeros duplicados, sufijo que no calza, enlaces ya correctos— sin tocar produccion.
   Nada de lo que decide depende de la red: el HEAD a Cloudinary es un veto POSTERIOR, nunca una
   razon para reparar. ─────────────────────────────────────────────────────────────────────────*/
function planificar(pdfs, ordenes) {
  const plan = [];
  const revisarAMano = [];

  for (const p of pdfs) {
    const c = campos(p);
    const ident = identidadDelArchivo(c.pdfUrlCloudinary);
    if (!ident) continue;

    const numeroOk = String(c.otNumero ?? '') === ident.numero;
    const cidOk = !!c.otClientId && c.otClientId.endsWith(ident.sufijo);
    if (numeroOk && cidOk) continue; // sano

    // ─── DOBLE LLAVE: la orden tiene que calzar por numero Y por sufijo del docId ───
    const candidatas = ordenes.filter(o => {
      const oc = campos(o);
      return String(oc.numero ?? '') === ident.numero && idDe(o).endsWith(ident.sufijo);
    });

    if (candidatas.length !== 1) {
      revisarAMano.push({
        pdfDocId: idDe(p), c, ident,
        motivo: candidatas.length === 0
          ? 'ninguna orden calza por numero Y sufijo a la vez'
          : `${candidatas.length} ordenes calzan — ambiguo`
      });
      continue;
    }

    const orden = candidatas[0];
    const ordenId = idDe(orden);
    const oc = campos(orden);

    // Que escribir en 'pdfs': solo los campos que estan mal. Se preserva el tipo del dato.
    const fixPdfs = {};
    if (!numeroOk) fixPdfs.otNumero = { stringValue: ident.numero };
    if (!cidOk) fixPdfs.otClientId = { stringValue: ordenId };

    // Que escribir en 'ordenes': completar el enlace SOLO si falta o si apunta a otro archivo.
    // Nunca se pisa un enlace que ya apunta al archivo correcto.
    const fixOrden = {};
    const urlVisor = 'https://desarrollobastian-design.github.io/emval-app/?pdf=' + idDe(p);
    const cloudApuntaBien = String(oc.pdfUrlCloudinary || '').includes(ident.sufijo);
    if (!cloudApuntaBien) fixOrden.pdfUrlCloudinary = { stringValue: c.pdfUrlCloudinary };
    if (String(oc.pdfUrl || '') !== urlVisor) fixOrden.pdfUrl = { stringValue: urlVisor };

    plan.push({ pdfDocId: idDe(p), ordenId, c, oc, ident, fixPdfs, fixOrden, urlVisor });
  }

  return { plan, revisarAMano };
}

// Cargado por la prueba → solo exporta. Ejecutado a mano → corre.
if (require.main !== module) {
  module.exports = { identidadDelArchivo, planificar };
  return;
}

// ── Programa ──────────────────────────────────────────────────────────────────────────────────
(async () => {
  console.log(EJECUTAR
    ? '\n🔴 MODO EJECUCION — se va a ESCRIBIR en produccion\n'
    : '\n🔵 SIMULACION — no se escribe nada. Usar --ejecutar para aplicar.\n');

  console.log('Leyendo produccion...');
  const [pdfs, ordenes] = await Promise.all([
    traerColeccion('pdfs', ['otNumero', 'otClientId', 'local', 'tecnico', 'fecha', 'pdfUrl', 'pdfUrlCloudinary']),
    traerColeccion('ordenes', ['numero', 'local', 'tipo', 'fecha', 'pdfUrl', 'pdfUrlCloudinary'])
  ]);
  console.log(`  ${pdfs.length} registros en 'pdfs' · ${ordenes.length} en 'ordenes'\n`);

  const { plan, revisarAMano } = planificar(pdfs, ordenes);

  // ── Informe ────────────────────────────────────────────────────────────────────────────────
  if (!plan.length) console.log('✅ No hay registros cruzados reparables.\n');

  for (const it of plan) {
    console.log('─'.repeat(92));
    console.log(`📄 pdfs/${it.pdfDocId}   (${it.c.fecha} · ${it.c.local} · ${it.c.tecnico})`);
    console.log(`   archivo    : ${it.ident.nombre}`);
    console.log(`   → OT real  : #${it.ident.numero} ${it.ident.tipo} · ordenes/${it.ordenId} · ${it.oc.local}`);
    const vivo = await pdfExiste(it.c.pdfUrlCloudinary);
    it.pdfVivo = vivo;
    console.log(`   PDF en Cloudinary: ${vivo ? '✅ responde' : '❌ NO responde — no se enlaza'}`);
    if (it.ident.tipo !== it.oc.tipo)
      console.log(`   ⚠️  el nombre dice ${it.ident.tipo} y la orden dice ${it.oc.tipo}`);
    for (const [k, v] of Object.entries(it.fixPdfs))
      console.log(`   pdfs.${k}: ${JSON.stringify(it.c[k])} → ${JSON.stringify(val(v))}`);
    for (const [k, v] of Object.entries(it.fixOrden))
      console.log(`   ordenes.${k}: ${JSON.stringify(it.oc[k])} → ${JSON.stringify(val(v))}`);
    if (!Object.keys(it.fixPdfs).length && !Object.keys(it.fixOrden).length)
      console.log('   (nada que cambiar)');
  }

  if (revisarAMano.length) {
    console.log('\n' + '─'.repeat(92));
    console.log('⚠️  NO SE TOCAN — la doble llave no calza, hay que mirarlos a mano:\n');
    for (const r of revisarAMano) {
      console.log(`   pdfs/${r.pdfDocId} · ${r.c.fecha} · ${r.c.local}`);
      console.log(`     archivo: ${r.ident.nombre}  (dice OT #${r.ident.numero}, sufijo ${r.ident.sufijo})`);
      console.log(`     registro: otNumero=${JSON.stringify(r.c.otNumero)} otClientId=${JSON.stringify(r.c.otClientId)}`);
      console.log(`     motivo: ${r.motivo}\n`);
    }
  }

  const aplicables = plan.filter(it => it.pdfVivo && (Object.keys(it.fixPdfs).length || Object.keys(it.fixOrden).length));
  console.log('─'.repeat(92));
  console.log(`\nRESUMEN: ${aplicables.length} registro(s) a reparar · ${revisarAMano.length} a revisar a mano\n`);

  if (!EJECUTAR) {
    console.log('Simulacion terminada. Nada se escribio.');
    console.log('Para aplicar:  node tools/reparar-pdf-cruzados.js --ejecutar\n');
    return;
  }
  if (!aplicables.length) { console.log('Nada que aplicar.\n'); return; }

  // ── Respaldo ANTES de escribir ─────────────────────────────────────────────────────────────
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/(\d{8})(\d{4})/, '$1_$2');
  const archivoResp = path.join(DIR_RESPALDO, `emval_${stamp}_respaldo-pdf-cruzados.json`);
  const respaldo = aplicables.map(it => ({
    pdfDocId: it.pdfDocId, pdfsAntes: it.c,
    ordenId: it.ordenId, ordenesAntes: it.oc,
    seEscribe: { pdfs: it.fixPdfs, ordenes: it.fixOrden }
  }));
  fs.writeFileSync(archivoResp, JSON.stringify(respaldo, null, 2), 'utf8');
  console.log('💾 Respaldo escrito en:\n   ' + archivoResp + '\n');

  // ── Confirmacion humana ────────────────────────────────────────────────────────────────────
  process.stdout.write(`Escribir ${aplicables.length} reparacion(es) en PRODUCCION. Escribe REPARAR y Enter: `);
  const resp = await new Promise(res => {
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', d => res(String(d).trim()));
  });
  if (resp !== 'REPARAR') { console.log('\nCancelado. No se escribio nada.\n'); process.exit(1); }

  console.log('');
  let ok = 0;
  for (const it of aplicables) {
    try {
      if (Object.keys(it.fixPdfs).length) await parchar('pdfs', it.pdfDocId, it.fixPdfs);
      if (Object.keys(it.fixOrden).length) await parchar('ordenes', it.ordenId, it.fixOrden);
      console.log(`   ✅ ${it.pdfDocId} → OT #${it.ident.numero} (${it.oc.local})`);
      ok++;
    } catch (e) {
      console.log(`   ❌ ${it.pdfDocId}: ${e.message}`);
    }
  }
  console.log(`\n${ok}/${aplicables.length} reparados. El respaldo con el estado anterior quedo en:\n   ${archivoResp}\n`);
  process.exit(0);
})().catch(e => { console.error('\n💥 ' + e.message + '\n'); process.exit(1); });
