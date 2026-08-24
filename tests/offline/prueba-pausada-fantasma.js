/* Reproduce la pantalla que le saco la foto Pedro el 23-08-2026 y comprueba el arreglo.

   Los tres trabajos "pausados" que el veia en su Panel Supervisor son los 3 documentos REALES de
   produccion (leidos por REST el 23-08 y sembrados aca; el SDK de Firebase ni se carga, asi que
   tocar produccion es imposible). Con ellos se verifica:

     1. La fecha dice los dias de verdad. Antes las TRES tarjetas decian "hace 19949 día(s)":
        habia dos funciones _haceCuanto y la de mas abajo pisaba a la de las tarjetas.
     2. La tarjeta de ALVI CAÑETE #862089 dice YA CERRADA — porque su OT cerrada y firmada existe.
     3. Las de UNIMARC SAN CARLOS 2 y LAS VIOLETAS dicen YA COTIZADA y avisan que la cotizacion
        apunta a esa misma hoja (era justo lo que Pedro temia perder al borrar).
     4. El boton Eliminar funciona de punta a punta: confirma → pide la contraseña de
        administrador → borra. Y el cuadro de confirmacion dice que pasa con la cotizacion.

   Uso:
     node tests/offline/preparar.js
     cd tests/offline/sitio && python -m http.server 8765     (o cualquier servidor estatico)
     node tests/offline/prueba-pausada-fantasma.js [http://127.0.0.1:8765/index.html]

   CONTRAPRUEBA: `node tests/offline/preparar.js <ref-anterior-al-fix>` y correrla contra
   prefix.html — ahi salen los "hace 19949 día(s)" y ninguna tarjeta dice si el trabajo ya
   esta hecho. */

const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://127.0.0.1:8765/index.html';
const fallos = [];
const P = (...a) => console.log(...a);
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); }

// sha256('Pedro123') — la contraseña temporal que la propia app asigna al Administrador.
const HASH_PEDRO = 'cefdf4148cc0bdd9b6b4e6f125a65088e5340d9cf15d58000015b254bcf5168d';

const SEMILLA = `(function(){
  function ts(iso) {
    var ms = Date.parse(iso), secs = Math.floor(ms/1000), nanos = (ms%1000)*1e6;
    return { seconds: secs, nanoseconds: nanos,
      toDate: function(){ return new Date(ms); },
      /* El valueOf() REAL del firebase-js-sdk: segundos desplazados al año 1, como string para
         ordenar. Es lo que convertia la resta en 19949 dias. Sin esto la prueba no mide nada. */
      valueOf: function(){ return String(secs + 62135596800).padStart(12,'0') + '.' + String(nanos).padStart(9,'0'); } };
  }
  var HOY = Date.now();
  window.__PAUSADAS = [
    { _id:'YHKcCX22vhc0MNVaiSEO', numero:862089, local:'ALVI CANETE', ceco:'3235', tecnico:'Nelson Herrera',
      tipo:'correctivo', pausa:true, estado:'En Pausa', firmada:false, enEspera:false, fecha:'21-08-2026',
      descripcion:'- Vaciado de estanque de agua potable limpieza y sanitizacion..',
      creadoEn: ts(new Date(HOY - 4*86400000).toISOString()) },
    { _id:'ot_mrxmielj_3m13j5b', numero:142079, local:'UNIMARC LAS VIOLETAS', ceco:'716', tecnico:'Lucas Fernández',
      tipo:'correctivo', pausa:true, estado:'En Pausa', firmada:false, enEspera:false, fecha:'23-07-2026',
      descripcion:'- Se realiza el cambio de 4 ruedas de carga (70x80) a 1 transpaleta Kr..',
      creadoEn: ts(new Date(HOY - 31*86400000).toISOString()) },
    { _id:'ot_mrtlqu8y_81y5t73', numero:853260, local:'UNIMARC SAN CARLOS 2', ceco:'712', tecnico:'Lucas Fernández',
      tipo:'correctivo', pausa:true, estado:'En Pausa', firmada:false, enEspera:false, fecha:'21-07-2026',
      descripcion:'- Se realiza el cambio de 2 ruedas motrices (160x50) a 1 transpaleta K..',
      creadoEn: ts(new Date(HOY - 34*86400000).toISOString()) }
  ];
  // La OT que SI se cerro: mismo numero y mismo local que la pausada de ALVI CAÑETE.
  window.__SEMILLA.ordenes = window.__PAUSADAS.concat([
    { _id:'ot_mt0blg4u_e2f0bkd', numero:862089, local:'ALVI CANETE', tecnico:'Nelson Herrera',
      tipo:'correctivo', pausa:false, estado:'Terminada', firmada:true, fecha:'19-08-2026',
      creadoEn: ts(new Date(HOY - 2*86400000).toISOString()) }
  ]);
  // Las dos cotizaciones reales: su otId apunta al documento PAUSADO.
  window.__SEMILLA.cotizaciones = [
    { _id:'cot1', numeroCotizacion:'01082608', otId:'ot_mrtlqu8y_81y5t73', otNumero:853260,
      local:'UNIMARC SAN CARLOS 2', total:99800, enviado:true, fecha:'21-07-2026' },
    { _id:'cot2', numeroCotizacion:'01082611', otId:'ot_mrxmielj_3m13j5b', otNumero:142079,
      local:'UNIMARC LAS VIOLETAS', total:116600, enviado:true, fecha:'23-07-2026' }
  ];
  window.__SEMILLA.tecnicos = [
    { _id:'u_pedro', nombre:'Pedro Arce', cargo:'Administrador', letra:'P', passwordHash:'${HASH_PEDRO}' },
    { _id:'u_nelson', nombre:'Nelson Herrera', cargo:'Tecnico en terreno', pin:'1111', letra:'N' },
    { _id:'u_lucas',  nombre:'Lucas Fernández', cargo:'Tecnico en terreno', pin:'2222', letra:'L' }
  ];

  // El arnes base no tiene where().onSnapshot() ni delete() observable: se agregan aca.
  window.__DELETES = [];
  var base = window.firebase.firestore;
  function docDe(d) { return { id: d._id, exists: true, data: function(){ return d; } }; }
  function snapPausadas() {
    var docs = window.__PAUSADAS.map(docDe);
    return { docs: docs, size: docs.length, empty: docs.length === 0, forEach: function(f){ docs.forEach(f); } };
  }
  window.firebase.firestore = function() {
    var db = base(), colBase = db.collection;
    db.collection = function(nombre) {
      var c = colBase(nombre);
      if (nombre !== 'ordenes') return c;
      c.where = function() {
        return { where: function(){ return this; }, orderBy: function(){ return this; },
          get: function(){ return Promise.resolve(snapPausadas()); },
          onSnapshot: function(cb){ setTimeout(function(){ cb(snapPausadas()); }, 10); return function(){}; } };
      };
      var docBase = c.doc;
      c.doc = function(id) {
        var d = docBase(id);
        d.delete = function() {
          window.__DELETES.push(id);
          window.__PAUSADAS = window.__PAUSADAS.filter(function(p){ return p._id !== id; });
          return Promise.resolve();
        };
        return d;
      };
      return c;
    };
    return db;
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  page.on('pageerror', e => P('  [error de la pagina]', String(e).slice(0, 200)));

  await page.goto(URL);
  await page.waitForTimeout(1200);
  await page.evaluate(SEMILLA);
  await page.evaluate(() => cargarUsuariosApp());
  await page.waitForTimeout(800);

  await page.click('text=Pedro Arce');
  await page.waitForTimeout(500);
  await page.fill('#admin-pass-input', 'Pedro123');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  const quien = await page.evaluate(() => estado.usuario + ' / ' + estado.cargo);
  chequear(/Administrador/.test(quien), 'no entro como Administrador, entro como: ' + quien);
  P('Entro como ' + quien);

  // cargarOTsSupervisor puebla las fichas y despues dibuja los trabajos pausados.
  await page.evaluate(() => cargarOTsSupervisor());
  await page.waitForTimeout(2000);

  const tarjetas = await page.$$eval('#sup-pausadas-lista .ot-card', els => els.map(e => e.innerText));
  chequear(tarjetas.length === 3, 'se dibujaron ' + tarjetas.length + ' tarjetas en vez de 3');
  P('\nTarjetas dibujadas: ' + tarjetas.length);
  tarjetas.forEach(t => P('  · ' + t.replace(/\n/g, ' | ').slice(0, 150)));

  const todo = tarjetas.join('\n');

  // 1. La fecha
  chequear(!/199\d\d/.test(todo), 'volvio el "hace 19949 día(s)": la fecha sigue calculada sobre el Timestamp crudo');
  chequear(/Hace 4 días/.test(todo) && /Hace 31 días/.test(todo) && /Hace 34 días/.test(todo),
    'las fechas no son las reales (se esperaban 4, 31 y 34 días distintos, no el mismo numero en las tres)');
  P('\n1) Fechas reales y distintas en cada tarjeta: ' + (/Hace 4 días/.test(todo) && /Hace 34 días/.test(todo) ? 'ok ✓' : 'roto ✗'));

  // 2 y 3. Los avisos
  const alvi = tarjetas.find(t => /ALVI CANETE/.test(t)) || '';
  const sc2  = tarjetas.find(t => /SAN CARLOS 2/.test(t)) || '';
  const viol = tarjetas.find(t => /LAS VIOLETAS/.test(t)) || '';
  chequear(/YA CERRADA/.test(alvi), 'la hoja de ALVI CAÑETE no avisa que su OT ya esta cerrada y firmada');
  chequear(/YA COTIZADA/.test(sc2) && /01082608/.test(sc2), 'la hoja de SAN CARLOS 2 no nombra su cotizacion');
  chequear(/YA COTIZADA/.test(viol) && /01082611/.test(viol), 'la hoja de LAS VIOLETAS no nombra su cotizacion');
  chequear(/apunta a/.test(sc2), 'no avisa que la cotizacion apunta a esa misma hoja');
  P('2) ALVI CAÑETE dice YA CERRADA: ' + (/YA CERRADA/.test(alvi) ? 'ok ✓' : 'roto ✗'));
  P('3) Las dos cotizadas se nombran con su folio y avisan del vinculo: ' + (/01082608/.test(sc2) && /apunta a/.test(sc2) ? 'ok ✓' : 'roto ✗'));

  await page.screenshot({ path: 'tests/offline/pausadas-con-aviso.png' });

  // 4. El borrado, por la interfaz
  const btn = await page.$('#sup-pausadas-lista .ot-card:has-text("ALVI CANETE") button:has-text("Eliminar")');
  chequear(!!btn, 'el Administrador no ve el boton Eliminar');
  if (btn) {
    await btn.click();
    await page.waitForTimeout(400);
    const dlg = await page.evaluate(() => ({
      visible: !document.getElementById('dlg-overlay').hidden,
      msg: (document.getElementById('dlg-msg') || {}).textContent || ''
    }));
    chequear(dlg.visible, 'el boton Eliminar no abre ninguna confirmacion');
    chequear(/ya está cerrado/i.test(dlg.msg),
      'el cuadro no explica que el trabajo ya esta cerrado. Decia: "' + dlg.msg.replace(/\n/g, ' ') + '"');
    P('4) El cuadro dice: "' + dlg.msg.replace(/\n/g, ' ').slice(0, 120) + '…"');

    await page.click('#dlg-ok');
    await page.waitForTimeout(500);
    const pidePass = await page.evaluate(() => !document.getElementById('dlg-campo').hidden);
    chequear(pidePass, 'no pidio la contraseña de administrador');
    await page.fill('#dlg-input', 'Pedro123');
    await page.click('#dlg-ok');
    await page.waitForTimeout(1200);

    const borrados = await page.evaluate(() => window.__DELETES);
    chequear(borrados.length === 1 && borrados[0] === 'YHKcCX22vhc0MNVaiSEO',
      'el borrado toco ' + JSON.stringify(borrados) + ' en vez de solo el registro pausado');
    const quedan = await page.$$eval('#sup-pausadas-lista .ot-card', e => e.length);
    chequear(quedan === 2, 'quedaron ' + quedan + ' tarjetas en pantalla en vez de 2');
    P('   se borro ' + JSON.stringify(borrados) + ' y quedan ' + quedan + ' tarjetas ✓');
  }

  await page.screenshot({ path: 'tests/offline/pausadas-despues-borrar.png' });
  await browser.close();

  if (fallos.length) {
    console.log('\nFALLA — ' + fallos.length + ' problema(s):');
    fallos.forEach(f => console.log(f));
    process.exit(1);
  }
  console.log('\nOK — la pantalla dice cuales ya estan hechas, con la fecha real, y el borrado funciona.');
})().catch(e => { console.error('\nFALLA — el guion se cayo:', e); process.exit(1); });
