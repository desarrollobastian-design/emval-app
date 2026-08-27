#!/usr/bin/env node
/* migrar-ot-a-baja.js — pasa a la carpeta "Bajas de activo" una OT que en realidad era una baja.

   POR QUE EXISTE
   La app no tenia donde registrar una baja de activo hasta el 27-08-2026, asi que los tecnicos
   la escribieron dentro de una hoja correctiva — y una correctiva sin cotizacion se queda para
   siempre en la lista de pendientes de cotizar de Pedro. Caso: la OT #586729 (Alvi Concepcion,
   CECO 3089, Lucas Fernandez, 21-07-2026), 37 dias trabada al 27-08.

   QUE HACE
   1. Lee la OT de produccion por REST y guarda un RESPALDO completo antes de tocar nada.
   2. Crea el documento equivalente en la coleccion `bajas`, con el detalle que escribio el
      tecnico, para que el comprobante exista y se le pueda mandar al local.
   3. Con la OT original hace lo que se le diga, y NADA por defecto:
        --dejar-ot   (por defecto) la OT queda como esta. El comprobante existe, pero la hoja
                     sigue apareciendo como pendiente de cotizar.
        --borrar-ot  borra el documento de `ordenes`. Lo saca de la lista, y PIERDE el registro
                     del trabajo en `ordenes`.

   🔴 CUAL DE LAS DOS ES, LO DECIDE PEDRO. No es una decision tecnica:
      - En #586729 la hoja pausada/correctiva es el unico registro de esa visita en `ordenes`.
      - Y las cotizaciones apuntan a la OT por `otId`: si alguna apuntara a esta, borrarla la
        dejaria sin su hoja. El guion lo COMPRUEBA y se niega a borrar si encuentra una.
   El cobro no se ve afectado en ningun caso: la planilla de correctivos suma `cotizaciones`,
   no `ordenes`, y esta OT no tiene ninguna.

   ⚠️ LA HOJA MIGRADA NACE SIN PDF. En la app, la carpeta "Bajas de activo" muestra un boton
   "Generar PDF" para ese caso: hasta que alguien lo toque, la hoja existe pero no se puede
   enviar ni compartir. (Antes ese boton no existia y la hoja migrada quedaba inservible para
   siempre — el comentario prometia un camino que no estaba escrito.)

   USO
     node tools/migrar-ot-a-baja.js 586729                    # simula, no escribe nada
     node tools/migrar-ot-a-baja.js 586729 --ejecutar         # crea la baja, deja la OT
     node tools/migrar-ot-a-baja.js 586729 --ejecutar --borrar-ot
   Con --ejecutar pide confirmacion tecleada. Es produccion.
*/

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const PROY = 'emval-app';
const API_KEY = 'AIzaSyAlIQW1wl8rRx4MlbOBz3Zgq9pS01Ys7B4';
const BASE = 'https://firestore.googleapis.com/v1/projects/' + PROY + '/databases/(default)/documents';
const RESPALDOS = path.resolve(__dirname, '..', '..', '..', '..',
  '08_Soporte_Postventa', 'Tickets');

const numero = String(process.argv[2] || '').trim();
const EJECUTAR = process.argv.includes('--ejecutar');
const BORRAR_OT = process.argv.includes('--borrar-ot');

if (!numero) {
  console.error('Falta el numero de OT.\n  node tools/migrar-ot-a-baja.js 586729');
  process.exit(1);
}

const V = f => f ? (f.stringValue ?? f.integerValue ?? f.doubleValue ?? f.timestampValue ?? f.booleanValue ?? '') : '';

function aCampos(obj) {
  const out = {};
  Object.keys(obj).forEach(function (k) {
    const v = obj[k];
    if (v === null || v === undefined) out[k] = { nullValue: null };
    else if (typeof v === 'number') out[k] = { integerValue: String(v) };
    else if (typeof v === 'boolean') out[k] = { booleanValue: v };
    else out[k] = { stringValue: String(v) };
  });
  return out;
}

function preguntar(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(q, a => { rl.close(); r(a); }));
}

(async function () {
  console.log('Buscando la OT #' + numero + ' en produccion...\n');

  /* Con MASCARA y PAGINANDO. Sin mascara la respuesta trae los base64 de las fotos y la firma,
     se corta por tamaño y devuelve solo una parte de las OT — la #586729 quedaba fuera y el
     guion decia "no existe", que es justo el error que este proyecto tiene documentado: nunca
     concluir que algo no existe habiendo mirado una fuente a medias. */
  const CAMPOS = ['numero', 'local', 'ceco', 'tecnico', 'tipo', 'firmada', 'fecha', 'cadena',
                  'descripcionTrabajo', 'descripcionProblema']
    .map(c => 'mask.fieldPaths=' + c).join('&');
  const ordenes = [];
  let token = '';
  do {
    const r = await fetch(BASE + '/ordenes?pageSize=300&key=' + API_KEY + '&' + CAMPOS +
      (token ? '&pageToken=' + encodeURIComponent(token) : ''));
    const j = await r.json();
    (j.documents || []).forEach(d => ordenes.push(d));
    token = j.nextPageToken || '';
  } while (token);
  console.log('  (' + ordenes.length + ' OT leidas de produccion)');
  const doc = ordenes.find(d => String(V(d.fields?.numero)) === numero);
  if (!doc) { console.error('No hay ninguna OT con el numero ' + numero + ' en `ordenes`.'); process.exit(1); }

  const id = doc.name.split('/').pop();
  const f = doc.fields || {};
  const detalle = String(V(f.descripcionTrabajo) || V(f.descripcionProblema) || '').trim();

  console.log('  OT #' + numero + '  id ' + id);
  console.log('  local:   ' + V(f.local) + '  (CECO ' + V(f.ceco) + ')');
  console.log('  tecnico: ' + V(f.tecnico));
  console.log('  tipo:    ' + (V(f.tipo) || '(null)') + '   firmada: ' + V(f.firmada));
  console.log('  detalle: "' + detalle.replace(/\s+/g, ' ').slice(0, 150) + '"\n');

  // Cotizaciones que apunten a esta OT: si existe alguna, borrar la OT la deja huerfana.
  const rCot = await fetch(BASE + '/cotizaciones?pageSize=300&key=' + API_KEY +
    '&mask.fieldPaths=numero&mask.fieldPaths=otId&mask.fieldPaths=otNumero&mask.fieldPaths=total');
  const cots = ((await rCot.json()).documents || []).filter(function (c) {
    return V(c.fields?.otId) === id || String(V(c.fields?.otNumero)) === numero;
  });
  if (cots.length) {
    console.log('  ⚠ Esta OT TIENE ' + cots.length + ' cotizacion(es) asociada(s):');
    cots.forEach(c => console.log('      ' + V(c.fields?.numero) + '  $' + V(c.fields?.total)));
    console.log('    Entonces no estaba trabada por falta de cotizacion: revisar antes de migrar.\n');
  } else {
    console.log('  Sin cotizacion asociada: es de las que se quedan en "pendientes de cotizar".\n');
  }

  const hoy = new Date();
  const ddmmaa = String(hoy.getDate()).padStart(2, '0') + String(hoy.getMonth() + 1).padStart(2, '0') +
                 String(hoy.getFullYear()).slice(2);
  const baja = {
    folio: ddmmaa + '90',              // 90+ = migracion manual, no choca con el correlativo del dia
    migradaDeOT: numero,
    migradaDeOTId: id,
    cadena: V(f.cadena) || '',
    local: V(f.local) || '',
    ceco: String(V(f.ceco) || ''),
    detalle: detalle,
    tecnico: V(f.tecnico) || '',
    fecha: V(f.fecha) || '',
    emailLocal: '', supervisor: '', emailSupervisor: '',
    pdfUrlCloudinary: '',              // nace sin PDF: se genera con el boton de la app (ver cabecera)
    pdfFormato: 1
  };

  console.log('SE VA A CREAR en `bajas`:');
  Object.keys(baja).forEach(k => console.log('  ' + k.padEnd(16) + (String(baja[k]).slice(0, 90) || '(vacio)')));
  console.log('\nCON LA OT ORIGINAL: ' + (BORRAR_OT ? '🔴 SE BORRA de `ordenes`' : 'se DEJA como esta (no se toca)'));
  if (BORRAR_OT && cots.length) {
    console.error('\n⛔ NO se borra: hay ' + cots.length + ' cotizacion(es) apuntando a esta OT y quedarian sin su hoja.');
    process.exit(1);
  }
  if (!BORRAR_OT) {
    console.log('   → el comprobante va a existir, pero la hoja SIGUE apareciendo como pendiente de cotizar.');
  }

  if (!EJECUTAR) {
    console.log('\n(SIMULACION — no se escribio nada. Agrega --ejecutar para aplicarlo.)');
    return;
  }

  // Respaldo previo, siempre, antes de cualquier escritura.
  fs.mkdirSync(RESPALDOS, { recursive: true });
  const dest = path.join(RESPALDOS, 'respaldo-OT-' + numero + '-antes-de-migrar-a-baja.json');
  fs.writeFileSync(dest, JSON.stringify({ ot: doc, cotizaciones: cots, generado: hoy.toISOString() }, null, 2));
  console.log('\nRespaldo escrito en: ' + dest);

  const ok = await preguntar('\nEscribe MIGRAR para confirmar (es produccion): ');
  if (ok.trim() !== 'MIGRAR') { console.log('Cancelado, no se escribio nada.'); return; }

  const idBaja = 'baja_migrada_' + id;
  const rc = await fetch(BASE + '/bajas?documentId=' + idBaja + '&key=' + API_KEY, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: aCampos(baja) })
  });
  if (!rc.ok) { console.error('No se pudo crear la baja: ' + rc.status + ' ' + (await rc.text()).slice(0, 300)); process.exit(1); }
  console.log('✅ Baja creada: bajas/' + idBaja);

  if (BORRAR_OT) {
    const rd = await fetch(BASE + '/ordenes/' + id + '?key=' + API_KEY, { method: 'DELETE' });
    if (!rd.ok) { console.error('No se pudo borrar la OT: ' + rd.status); process.exit(1); }
    console.log('✅ OT #' + numero + ' borrada de `ordenes` (el respaldo permite restaurarla).');
  }
  console.log('\nListo. Revisa la carpeta "Bajas de activo" en la app.');
  console.log('OJO: la hoja nace SIN PDF. Abrila en la app y toca "Generar PDF" para que el');
  console.log('archivo exista y se pueda enviar o compartir.');
})();
