/* Prueba de regresion — las planillas de cobranza no mezclan clientes.

   Pedido de Pedro el 21-08-2026, el mismo dia que empezo a cargar trabajos en las bodegas de
   Entel: "no quiero que los trabajos de Entel u otras cadenas se mezclen con la planilla que
   hacemos por Unimarc, Mayorista, Super 10 (...) si es Papa Johns, que sea una planilla aparte".

   Lo que se vigila son los DOS lados del pedido, porque romper cualquiera lo incumple:

     · de mas — una cotizacion de Entel dentro del paquete que se le manda a SMU. Es el caso
       real: Megacentro Hualpen, $420.000, creada esa misma manana.
     · de menos — Unimarc, Alvi, S10 y M10 son cuatro CADENAS y UN cliente. Separarlas partiria
       en cuatro la planilla que Pedro usa hoy, que es lo contrario de lo que pidio.

   Y las tres formas conocidas de que un documento termine en la planilla equivocada:

     · "Megacentro Hualpen" no dice "Entel" por ningun lado: solo el catalogo sabe de quien es
     · 2 locales reales no resuelven contra el catalogo (UNIMARC LOS PIONEROS, UNIMARC HUALPEN)
       y arrastran $740.000 de SMU: sin el rescate por el nombre, esa plata se sale de la planilla
     · el campo `cadena` del documento lo traen 10 de 133 cotizaciones: usarlo como criterio
       unico es el mismo error que ya costo caro con `estadoCot` en _esCobrable()

   Uso:  node tests/planillas-no-mezclan-clientes.js index.html

   Sale 0 si todas pasan; 1 si alguna falla. */

const fs = require('fs');
const vm = require('vm');
const ARCHIVO = process.argv[2] || 'index.html';
const src = fs.readFileSync(ARCHIVO, 'utf8');

function extraer(desde, hasta) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('No se encontro: ' + desde);
  const j = src.indexOf(hasta, i);
  if (j < 0) throw new Error('No se encontro el fin de: ' + desde);
  return src.slice(i, j);
}

// El codigo REAL de la app, no una copia. Si alguien renombra una de estas funciones el test se
// cae con "No se encontro" — a proposito: avisa que el reparto por cliente hay que revalidarlo.
const codigo = [
  extraer('function _normTipo(tipo)', '\n// Texto normalizado para comparar'),
  extraer('function _normTexto(s) {', '\n// =========== LOGIN ==========='),
  extraer('const OCULTOS_TECNICOS', '\n// Escapa texto para meterlo seguro'),
  extraer('window.ALIAS_LOCALES = window.ALIAS_LOCALES', '\n// Indexa las cadenas por local'),
  extraer('function _indexarCadenas(docs)', '\n// Identidad de una OT para detectar duplicados'),
  extraer('var PL_TARIFA_TRANSPALETA = 37000;', '\nfunction planillaTab('),
  extraer('function _plDatosPreventivos()', '\nfunction _plRenderPreventivos('),
  extraer('function _plDatosCorrectivos()', '\nfunction _plGuardarCampo('),
  extraer('function _plSlugCliente(c)', '\nfunction _plTituloHoja(')
].join('\n');

const sandbox = { window: {}, console: { log() {}, warn() {}, error() {} }, _plCache: null, _plAnio: 2026 };
vm.createContext(sandbox);
vm.runInContext(codigo, sandbox, { filename: 'index.html (extraido)' });

let fallos = 0, pasadas = 0;
function ok(cond, etiqueta, detalle) {
  if (cond) { pasadas++; console.log('  PASA   ' + etiqueta); }
  else { fallos++; console.log('  FALLA  ' + etiqueta + (detalle ? '\n           -> ' + detalle : '')); }
}
function igual(real, esperado, etiqueta) {
  ok(real === esperado, etiqueta, 'esperado ' + JSON.stringify(esperado) + ', obtenido ' + JSON.stringify(real));
}

// ── El catalogo, con la forma real: las sucursales viven DENTRO de cada cadena ────────────────
const CADENAS = [
  { nombre: 'Unimarc',    sucursales: [{ nombre: 'UNIMARC Pioneros', centro: '740', supervisor: 'A. Espinoza' },
                                       { nombre: 'UNIMARC PENCO',    centro: '71',  supervisor: 'C. Zapata' }] },
  { nombre: 'Alvi',       sucursales: [{ nombre: 'Alvi Chillan',     centro: '3091', supervisor: 'A. Espinoza' }] },
  { nombre: 'S10',        sucursales: [{ nombre: 'S10 TOME',         centro: '3578', supervisor: 'C. Zapata' }] },
  { nombre: 'M10',        sucursales: [{ nombre: 'M10 CONCEPCION',   centro: '3164', supervisor: 'R. Abedrapo' }] },
  // Ojo: la cadena se llama "entel" en minuscula y su sucursal NO dice "Entel" en el nombre.
  { nombre: 'entel',      sucursales: [{ nombre: 'Megacentro Hualpen', centro: '', supervisor: 'K. Jamett' }] },
  { nombre: 'Papa Johns', sucursales: [{ nombre: 'Papa Johns Chillan' }] }
];
const idx = sandbox._indexarCadenas(CADENAS);
const cli = (doc) => sandbox._plClienteDe(doc, idx);

const PAUTA = new Array(11).fill('si');

// ── 1. El pedido de Pedro, en sus dos direcciones ────────────────────────────────────────────
console.log('\n  Un cliente, una planilla');
igual(cli({ local: 'UNIMARC PENCO' }), 'SMU', 'Unimarc es SMU');
igual(cli({ local: 'Alvi Chillan' }), 'SMU', 'Alvi es SMU');
igual(cli({ local: 'S10 TOME' }), 'SMU', 'Super 10 es SMU');
igual(cli({ local: 'M10 CONCEPCION' }), 'SMU', 'Mayorista 10 es SMU');
ok(['UNIMARC PENCO', 'Alvi Chillan', 'S10 TOME', 'M10 CONCEPCION']
     .every(l => cli({ local: l }) === 'SMU'),
   'las CUATRO cadenas de SMU caen en UNA sola planilla  (separarlas parte en cuatro la que Pedro usa hoy)');

igual(cli({ local: 'Megacentro Hualpen' }), 'Entel',
   'Megacentro Hualpen es de Entel  (su nombre no lo dice: solo el catalogo lo sabe)');
igual(cli({ local: 'Papa Johns Chillan' }), 'Papa Johns', 'Papa Johns va por su cuenta');

// ── 2. El default es SEPARAR, no agrupar ─────────────────────────────────────────────────────
console.log('\n  Lo que no se sabe no se le cobra a nadie');
igual(cli({ local: 'Bodega Copec Rancagua' }), 'Sin clasificar',
   'un local desconocido NO cae en SMU  (agruparlo por defecto es el bug que se esta arreglando)');
igual(cli({ local: '' }), 'Sin clasificar', 'una OT sin local tampoco se le cobra a nadie');
igual(cli({}), 'Sin clasificar', 'ni un documento sin datos');

// Una cadena nueva sale con planilla propia sin tocar una linea de codigo.
const idx2 = sandbox._indexarCadenas(CADENAS.concat([
  { nombre: 'Copec', sucursales: [{ nombre: 'Copec Talca', centro: '5001' }] }
]));
igual(sandbox._plClienteDe({ local: 'Copec Talca' }, idx2), 'Copec',
   'una cadena nueva aparece sola con su planilla, sin tocar codigo');

// ── 3. El rescate por el nombre: los 2 locales reales fuera del catalogo ──────────────────────
console.log('\n  Los locales que no estan en el catalogo');
igual(cli({ local: 'UNIMARC LOS PIONEROS' }), 'SMU',
   'UNIMARC LOS PIONEROS se rescata por el nombre  (en el catalogo esta como "UNIMARC Pioneros")');
igual(cli({ local: 'UNIMARC HUALPEN' }), 'SMU',
   'UNIMARC HUALPEN se rescata por el nombre  (en el catalogo esta como "UNIMARC HUALPEN Bulgaria")');
igual(cli({ local: 'ALVI COLON HUALPEN' }), 'SMU', 'y cualquier ALVI fuera del catalogo tambien');
igual(cli({ local: 'Super 10 Chillan' }), 'SMU', 'incluido "Super 10" escrito con espacio');
igual(cli({ local: 'Superfabrica del Sur' }), 'Sin clasificar',
   'pero "Superfabrica" NO es Super 10  (el prefijo se corta en palabra entera, no a medias)');

// ── 4. Que fuente manda ──────────────────────────────────────────────────────────────────────
console.log('\n  De donde sale la cadena de un documento');
igual(sandbox._plClienteDe({ local: 'Megacentro Hualpen', cadena: 'Unimarc' }, idx), 'Entel',
   'el catalogo le gana al campo `cadena` del documento  (el catalogo es el maestro)');
igual(sandbox._plClienteDe({ local: 'Bodega nueva sin catalogo', cadena: 'entel' }, idx), 'Entel',
   'y el campo `cadena` sirve de respaldo cuando el local no esta en el catalogo');
igual(sandbox._plClienteDe({ local: 'Bodega nueva', cadena: 'Unimarc' }, idx), 'SMU',
   'un `cadena: Unimarc` de respaldo tambien cae en SMU');

console.log('\n  Como se escribe el nombre del cliente');
igual(sandbox._plNombreCliente('entel'), 'Entel', '"entel" se capitaliza: en una planilla se lee como error de la app');
igual(sandbox._plNombreCliente('Papa Johns'), 'Papa Johns', 'pero "Papa Johns" no se toca');
igual(sandbox._plNombreCliente('M10'), 'M10', 'ni "M10", que no es una palabra');
igual(sandbox._plNombreCliente('S10'), 'S10', 'ni "S10"');

// ── 5. El escenario completo: SMU y Entel conviviendo en la misma base ────────────────────────
const ORDENES = [
  { id: 'o1', numero: 101, local: 'UNIMARC PENCO',   ceco: '71',  tipo: 'preventivo', tecnico: 'Lucas Fernandez',
    fecha: '10-07-2026', numEquipos: '3', serviciosPreventivo: PAUTA },
  { id: 'o2', numero: 102, local: 'Alvi Chillan',    ceco: '3091', tipo: 'preventivo', tecnico: 'Nelson Herrera',
    fecha: '12-07-2026', numEquipos: '2', serviciosPreventivo: PAUTA },
  { id: 'o3', numero: 103, local: 'UNIMARC LOS PIONEROS', ceco: '740', tipo: 'correctivo', tecnico: 'Lucas Fernandez',
    fecha: '18-08-2026', descripcionTrabajo: 'Cambio de lamas' },
  // El trabajo de Entel: correctivo, que es lo unico que Pedro le hace (confirmado el 21-08).
  { id: 'o4', numero: 104, local: 'Megacentro Hualpen', ceco: '', tipo: 'correctivo', tecnico: 'Lucas Fernandez',
    fecha: '21-08-2026', descripcionTrabajo: 'Reparacion porton bodega' },
  /* Una hoja PREVENTIVA de Entel: no deberia existir segun el contrato, pero si alguien la
     cierra tiene que verse igual — sin monto. Esconder una lista por lo que se espera que traiga
     es como desaparecio el trabajo de las OT con tipo null. */
  { id: 'o5', numero: 105, local: 'Megacentro Hualpen', ceco: '', tipo: 'preventivo', tecnico: 'Nelson Herrera',
    fecha: '20-08-2026', numEquipos: '4', serviciosPreventivo: PAUTA }
];
const COTIZACIONES = [
  { id: 'c1', local: 'UNIMARC PENCO', centro: '71', nombreServicio: 'Piso pasillo', numeroCotizacion: '18082601',
    otNumero: 201, total: 800000, fecha: '18-08-2026', enviado: true },
  { id: 'c2', local: 'UNIMARC LOS PIONEROS', centro: '740', nombreServicio: 'Cambio de lamas', numeroCotizacion: '18082602',
    otNumero: 103, total: 370000, fecha: '18-08-2026', enviado: true },
  // El caso real que gatillo todo: $420.000 de Entel, previa y pendiente.
  { id: 'c3', local: 'Megacentro Hualpen', localCorto: 'Megacentro Hualpen', cadena: 'entel',
    nombreServicio: 'Reparacion porton', numeroCotizacion: '21082601', otNumero: '', total: 420000,
    fecha: '21-08-2026', tipoCot: 'previa', estadoCot: 'Pendiente' },
  { id: 'c4', local: 'Papa Johns Chillan', centro: '', nombreServicio: 'Mantencion camara',
    numeroCotizacion: '21082602', otNumero: 301, total: 150000, fecha: '21-08-2026', enviado: false }
];

ORDENES.forEach(o => { o._cliente = cli(o); });
COTIZACIONES.forEach(c => { c._cliente = cli(c); });
const SUCURSALES = [];
CADENAS.forEach(c => (c.sucursales || []).forEach(s => SUCURSALES.push({
  formato: c.nombre, nombre: s.nombre, centro: s.centro || '', supervisor: s.supervisor || '',
  _cliente: sandbox._plClienteDe({ cadena: c.nombre }, null)
})));
sandbox._plCache = { ordenes: ORDENES, cotizaciones: COTIZACIONES, sucursales: SUCURSALES };

function planillaDe(cliente) {
  sandbox._plCliente = cliente;
  return { prev: sandbox._plDatosPreventivos(), corr: sandbox._plDatosCorrectivos() };
}

console.log('\n  La planilla de SMU');
const SMU = planillaDe('SMU');
ok(SMU.corr.cobrables.concat(SMU.corr.previas).every(c => c._cliente === 'SMU'),
   'ninguna cotizacion de otro cliente se colo en el paquete que va a SMU',
   'colados: ' + JSON.stringify(SMU.corr.cobrables.concat(SMU.corr.previas).filter(c => c._cliente !== 'SMU').map(c => c.local)));
igual(SMU.corr.total, 800000 + 370000, 'la deuda de SMU no incluye los $420.000 de Entel ni los $150.000 de Papa Johns');
ok(!SMU.corr.cobrables.some(c => c.id === 'c3') && !SMU.corr.previas.some(c => c.id === 'c3'),
   'la cotizacion de Megacentro Hualpen no aparece en NINGUN bloque de la planilla de SMU');
ok(!SMU.corr.sinCotizar.some(o => o.local === 'Megacentro Hualpen'),
   'ni el trabajo de Entel aparece como "ejecutado sin cotizar" de SMU');
igual(SMU.prev.total, (3 + 2) * 37000, 'los preventivos de SMU se cobran a $37.000 por transpaleta, como siempre');
igual(SMU.prev.hojas, 2, 'y son solo las 2 hojas de SMU  (la de Megacentro Hualpen es de otro cliente)');
ok(!SMU.prev.filas.some(f => f.nombre === 'Megacentro Hualpen'),
   'la matriz de SMU no tiene ni la FILA de un local de Entel');
ok(!SMU.prev.filas.some(f => f.nombre === 'Papa Johns Chillan'),
   'ni la de Papa Johns  (las filas vacias del catalogo tambien se separan por cliente)');

console.log('\n  La planilla de Entel');
const ENTEL = planillaDe('Entel');
igual(ENTEL.corr.totalPrevias, 420000, 'los $420.000 estan, en la planilla de Entel');
igual(ENTEL.corr.total, 0, 'y siguen sin sumar a la deuda: es una previa sin ejecutar  (la regla no cambia por cliente)');
ok(ENTEL.corr.sinCotizar.some(o => o.numero === 104),
   'el correctivo de Entel sin cotizar se lista en SU planilla');
igual(ENTEL.prev.tarifa, 0, 'Entel no tiene tarifa de preventivo  (Pedro: "solo trabajos correctivos")');
igual(ENTEL.prev.hojas, 1, 'pero la hoja preventiva que existe NO se esconde');
igual(ENTEL.prev.total, 0, 'y va SIN monto: aplicarle la tarifa de SMU seria inventarle un precio a otro contrato');
ok(ENTEL.prev.filas.some(f => f.nombre === 'Megacentro Hualpen'),
   'con su local a la vista en la matriz');

console.log('\n  Nadie se pierde en el camino');
const clientes = {};
ORDENES.concat(COTIZACIONES).forEach(d => { clientes[d._cliente] = true; });
let sumaCot = 0;
Object.keys(clientes).forEach(c => {
  const p = planillaDe(c);
  sumaCot += p.corr.cobrables.length + p.corr.previas.length;
});
igual(sumaCot, COTIZACIONES.length,
   'sumando TODAS las planillas vuelven las ' + COTIZACIONES.length + ' cotizaciones: separar no pierde ninguna');

console.log('\n  El choque de N de OT se avisa dentro del paquete que viaja junto');
sandbox._plCache.ordenes = ORDENES.concat([{
  id: 'o6', numero: 999, local: 'UNIMARC PENCO', ceco: '71', tipo: 'preventivo', tecnico: 'Lucas Fernandez',
  fecha: '11-07-2026', numEquipos: '1', serviciosPreventivo: PAUTA, _cliente: 'SMU'
}]);
sandbox._plCache.cotizaciones = COTIZACIONES.concat([{
  id: 'c5', local: 'UNIMARC PENCO', centro: '71', nombreServicio: 'Otro trabajo', numeroCotizacion: '18082603',
  otNumero: 999, total: 90000, fecha: '18-08-2026', enviado: false, _cliente: 'SMU'
}, {
  id: 'c6', local: 'Megacentro Hualpen', centro: '', nombreServicio: 'Trabajo Entel', numeroCotizacion: '21082603',
  otNumero: 999, total: 60000, fecha: '21-08-2026', enviado: false, _cliente: 'Entel'
}]);
const CHOQUE = planillaDe('SMU');
igual(CHOQUE.corr.chocanConPreventivos.length, 1, 'el N repetido DENTRO de SMU se avisa');
ok(CHOQUE.corr.chocanConPreventivos[0].correctivos.every(l => l !== 'Megacentro Hualpen'),
   'y el de Entel no se cuenta como choque: van en paquetes distintos, nadie ve el numero dos veces');

/* Este bloque mira el CODIGO del render, no sus datos, porque el bug era de dibujo: los datos
   estaban perfectos y la pantalla igual salia vacia. Lo encontro el demo del 21-08, no un test.
   La planilla de Entel decia "Aún no hay correctivos cotizados" con los $420.000 adentro: el
   early-return miraba solo `cobrables` y se llevaba por delante los bloques de previas y de
   trabajo ejecutado sin cotizar. Un cliente que abre su planilla y la ve vacia concluye que su
   trabajo se perdio — y con una sola planilla esto nunca se noto, porque SMU siempre tuvo
   cobrables. Separar por cliente es lo que lo dejo a la vista. */
console.log('\n  La planilla no se dibuja vacia teniendo algo que mostrar');
const _render = extraer('function _plRenderCorrectivos()', '\n/* ── EXCEL');
const _corte = (_render.match(/if \(![^]{0,500}?return;/) || [''])[0];
ok(/cobrables\.length/.test(_corte) && /previas\.length/.test(_corte) && /sinCotizar\.length/.test(_corte),
   'el "no hay nada" exige que NO haya cobrables NI previas NI trabajos sin cotizar',
   'el corte encontrado fue: ' + JSON.stringify(_corte.slice(0, 200)));
ok(/if \(d\.cobrables\.length\) cont\.appendChild\(scroll\)/.test(_render),
   'y la tabla de cobrables solo se dibuja cuando hay cobrables');
// Ojo: 'd.previas.length' aparece tambien DENTRO de la condicion del corte, asi que se busca
// el bloque que lo DIBUJA, no la primera mencion.
const _finCorte = _render.indexOf(_corte) + _corte.length;
ok(_render.indexOf('if (d.previas.length) {') > _finCorte,
   'el bloque de previas se dibuja DESPUES del corte, no antes de el');

console.log('\n  El nombre del archivo Excel');
igual(sandbox._plSlugCliente('SMU'), 'SMU', 'SMU');
igual(sandbox._plSlugCliente('Entel'), 'Entel', 'Entel');
igual(sandbox._plSlugCliente('Papa Johns'), 'Papa_Johns', 'el espacio de "Papa Johns" pasa a guion bajo');
igual(sandbox._plSlugCliente('Sin clasificar'), 'Sin_clasificar', 'igual que el de "Sin clasificar"');
igual(sandbox._plSlugCliente('Almacén Ñuñoa'), 'Almacen_Nunoa', 'las tildes y la ñ se normalizan');
igual(sandbox._plSlugCliente(''), 'Cliente', 'y nunca queda un nombre de archivo vacio');

console.log('\n  ' + pasadas + ' pasaron, ' + fallos + ' fallaron');
process.exit(fallos ? 1 : 0);
