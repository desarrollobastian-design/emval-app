/* Prueba de la DECISION del reparador (tools/reparar-pdf-cruzados.js).

   El dry-run contra produccion solo ejercita el camino feliz: los 3 registros que hoy calzan.
   Lo que puede costar caro es lo contrario — que repare algo que NO deberia, o que pise un enlace
   que ya estaba bien. Esos casos no existen en los datos de hoy, asi que se construyen aca.

   Uso:  node tests/reparar-pdf-cruzados.test.js     (desde la raiz del repo)
   Sale 0 si la decision es la esperada en los 8 casos; 1 si no. */

const { identidadDelArchivo, planificar } = require('../tools/reparar-pdf-cruzados.js');

const CLOUD = 'https://res.cloudinary.com/dcrf29tna/raw/upload/emval/pdfs/';
const doc = (col, id, campos) => {
  const fields = {};
  for (const [k, v] of Object.entries(campos)) {
    fields[k] = v === null ? { nullValue: null }
      : typeof v === 'number' ? { integerValue: String(v) }
      : { stringValue: String(v) };
  }
  return { name: `projects/emval-app/databases/(default)/documents/${col}/${id}`, fields };
};
const pdf = (id, c) => doc('pdfs', id, c);
const ot = (id, c) => doc('ordenes', id, c);

let fallos = 0;
const chequear = (nombre, cond, detalle) => {
  if (cond) { console.log('  ✅ ' + nombre); }
  else { console.log('  ❌ ' + nombre + (detalle ? '\n       ' + detalle : '')); fallos++; }
};

// ── 1. Leer la identidad desde el nombre del archivo ──────────────────────────────────────────
console.log('\nIdentidad leida del nombre del archivo');
{
  const a = identidadDelArchivo(CLOUD + 'Recepcion_Obra_OT673113_sgf2bhl.pdf');
  chequear('correctivo: numero + sufijo + tipo',
    a && a.numero === '673113' && a.sufijo === 'sgf2bhl' && a.tipo === 'correctivo', JSON.stringify(a));

  const b = identidadDelArchivo(CLOUD + '716-HS%20394984-MP%20Transpaletas%20Julio%202026_dkcwj8s.pdf');
  chequear('preventivo con el nombre URL-encoded',
    b && b.numero === '394984' && b.sufijo === 'dkcwj8s' && b.tipo === 'preventivo', JSON.stringify(b));

  chequear('nombre viejo SIN sufijo → no reparable (null)',
    identidadDelArchivo(CLOUD + 'Recepcion_Obra_OT9530.pdf') === null);
  chequear('sin URL → null', identidadDelArchivo(null) === null && identidadDelArchivo('') === null);
}

// ── 2. Lo que NO se debe tocar ────────────────────────────────────────────────────────────────
console.log('\nCasos que NO se deben reparar');
{
  // Registro sano: numero y clientId ya coinciden con el archivo.
  const r1 = planificar(
    [pdf('p1', { otNumero: '673113', otClientId: 'ot_ms7ua516_sgf2bhl', pdfUrlCloudinary: CLOUD + 'Recepcion_Obra_OT673113_sgf2bhl.pdf' })],
    [ot('ot_ms7ua516_sgf2bhl', { numero: 673113, local: 'CABRERO', tipo: 'correctivo' })]
  );
  chequear('registro sano → ni plan ni revision', r1.plan.length === 0 && r1.revisarAMano.length === 0);

  // El numero calza pero el sufijo NO: es OTRA orden que comparte numero (colision vieja).
  const r2 = planificar(
    [pdf('p2', { otNumero: '999999', otClientId: '', pdfUrlCloudinary: CLOUD + 'Recepcion_Obra_OT9530_aaaaaaa.pdf' })],
    [ot('ot_otracosa_zzzzzzz', { numero: 9530, local: 'ALVI CHILLAN', tipo: 'correctivo' })]
  );
  chequear('numero calza pero sufijo NO → no se repara, va a revision',
    r2.plan.length === 0 && r2.revisarAMano.length === 1, JSON.stringify(r2.plan));

  // El sufijo calza pero el numero NO: el archivo pertenece a otra hoja.
  const r3 = planificar(
    [pdf('p3', { otNumero: '', otClientId: '', pdfUrlCloudinary: CLOUD + 'Recepcion_Obra_OT111111_sgf2bhl.pdf' })],
    [ot('ot_ms7ua516_sgf2bhl', { numero: 673113, local: 'CABRERO', tipo: 'correctivo' })]
  );
  chequear('sufijo calza pero numero NO → no se repara',
    r3.plan.length === 0 && r3.revisarAMano.length === 1);

  // Dos ordenes calzan por numero Y sufijo → ambiguo, nadie decide por adivinanza.
  const r4 = planificar(
    [pdf('p4', { otNumero: '', otClientId: '', pdfUrlCloudinary: CLOUD + 'Recepcion_Obra_OT673113_sgf2bhl.pdf' })],
    [ot('ot_uno_sgf2bhl', { numero: 673113, local: 'CABRERO', tipo: 'correctivo' }),
     ot('ot_dos_sgf2bhl', { numero: 673113, local: 'CABRERO', tipo: 'correctivo' })]
  );
  chequear('dos ordenes calzan → ambiguo, va a revision',
    r4.plan.length === 0 && r4.revisarAMano.length === 1 && /ambiguo/.test(r4.revisarAMano[0].motivo));
}

// ── 3. Lo que SI se repara, y con que valores exactos ─────────────────────────────────────────
console.log('\nCaso real (CABRERO 30-jul) — que escribe exactamente');
{
  const { plan, revisarAMano } = planificar(
    [pdf('kaUQXC8sYIuXP7dZrV8v', { otNumero: '535219', otClientId: '', local: 'UNIMARC CABRERO',
      pdfUrlCloudinary: CLOUD + 'Recepcion_Obra_OT673113_sgf2bhl.pdf' })],
    [ot('ot_ms7ua516_sgf2bhl', { numero: 673113, local: 'UNIMARC CABRERO', tipo: 'correctivo' })]
  );
  const it = plan[0];
  chequear('lo detecta como reparable', plan.length === 1 && revisarAMano.length === 0);
  chequear('pdfs.otNumero 535219 → 673113 (string, como el resto de la coleccion)',
    it && it.fixPdfs.otNumero && it.fixPdfs.otNumero.stringValue === '673113');
  chequear('pdfs.otClientId "" → el docId real de la orden',
    it && it.fixPdfs.otClientId.stringValue === 'ot_ms7ua516_sgf2bhl');
  chequear('ordenes.pdfUrl apunta al visor con el ID del registro de pdfs',
    it && it.fixOrden.pdfUrl.stringValue.endsWith('?pdf=kaUQXC8sYIuXP7dZrV8v'));
}

console.log('\nEnlace ya correcto en la orden');
{
  // La orden ya apunta al archivo bueno (caso LAS VIOLETAS): NO se pisa pdfUrlCloudinary.
  const { plan } = planificar(
    [pdf('p6', { otNumero: '142079', otClientId: '', pdfUrlCloudinary: CLOUD + '716-HS%20394984-MP%20Transpaletas%20Julio%202026_dkcwj8s.pdf' })],
    [ot('ot_mrxmhsxs_dkcwj8s', { numero: 394984, local: 'LAS VIOLETAS', tipo: 'preventivo',
      pdfUrlCloudinary: CLOUD + 'v1784817910/716-HS%20394984-MP%20Transpaletas%20Julio%202026_dkcwj8s.pdf' })]
  );
  chequear('repara el registro pero NO pisa el pdfUrlCloudinary que ya estaba bien',
    plan.length === 1 && !('pdfUrlCloudinary' in plan[0].fixOrden) && plan[0].fixPdfs.otNumero.stringValue === '394984',
    plan[0] && JSON.stringify(plan[0].fixOrden));
}

console.log(fallos ? `\n❌ ${fallos} fallo(s)\n` : '\n✅ Todo OK — la decision no repara de mas ni pisa lo que ya estaba bien\n');
process.exit(fallos ? 1 : 0);
