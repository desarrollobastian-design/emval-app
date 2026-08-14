/* Genera la copia de prueba de EMVAL: misma logica, Firebase y EmailJS sustituidos por espias.
   Sin el SDK cargado, tocar produccion es imposible aunque el codigo lo intente.

   Lo importante de este arnes: el stub de Firestore IMITA EL COMPORTAMIENTO OFFLINE REAL del SDK
   —"deja el add()/set() colgado sin resolver ni rechazar"— devolviendo una promesa que nunca se
   asienta mientras window.__OFFLINE sea true. Es la condicion exacta que colgaba el cierre.

   Se usa desde preparar.js; tambien sirve suelto:
     node gen-arnes.js <index.html origen> <destino.html>  */
const fs = require('fs');

function generar(origen, destino) {
let html = fs.readFileSync(origen, 'utf8');

// 1. Fuera el SDK de Firebase: sin el, ninguna escritura puede llegar a produccion.
html = html.replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"><\/script>\s*/g, '');

// 2. El Service Worker solo mete ruido de cache en la prueba.
html = html.replace("navigator.serviceWorker.register('./sw.js')", "Promise.resolve()");

const STUB = `
<script>
/* ===== ESPIAS DEL ARNES (no forman parte de la app) ===== */
window.__OFFLINE = false;          // true = la nube no responde, como el SDK real sin señal
window.__ESCRITURAS = [];          // todo lo que la app INTENTO escribir
window.__CORREOS = [];             // todo lo que la app INTENTO enviar
window.__COLGADAS = [];            // llamadas que quedaron sin resolver (el sintoma del bug)
window.__DOCS = {};                // documentos que "existen" en la base falsa

// Semilla: lo que la app baja al abrir CON señal, antes de que el tecnico llegue al local.
window.__SEMILLA = {
  tecnicos: [{ _id: 'tec1', nombre: 'NELSON PRUEBA', cargo: 'Tecnico', pin: '1111', letra: 'N' }],
  cadenas: [{ _id: 'cad1', nombre: 'UNIMARC', color: '#1B3A6B', logo: '', letra: 'U', orden: 0,
    sucursales: [{ nombre: 'PRUEBA ARNES 1', centro: '999', direccion: 'Calle Falsa 123',
                   email: 'local.prueba@ejemplo.cl', emailSupervisor: 'sup.prueba@ejemplo.cl' }] }]
};
function __docsDe(nombre) {
  return (window.__SEMILLA[nombre] || []).map(function(d) {
    return { id: d._id || 'x', data: function(){ return d; }, exists: true };
  });
}

function __promesaNube(etiqueta, valor) {
  window.__ESCRITURAS.push({ etiqueta: etiqueta, en: Date.now(), offline: window.__OFFLINE });
  if (window.__OFFLINE) {
    // EXACTAMENTE lo que hace el SDK real sin señal: ni resuelve ni rechaza. Nunca.
    window.__COLGADAS.push(etiqueta);
    return new Promise(function(){});
  }
  return Promise.resolve(valor);
}

function __snap(docs) {
  return { docs: docs, size: docs.length, empty: docs.length === 0,
           forEach: function(f){ docs.forEach(f); } };
}

var __idSeq = 0;
function __coleccion(nombre) {
  return {
    add: function(d) {
      var id = 'doc_' + (++__idSeq);
      window.__ESCRITURAS.push({ op: 'add', coleccion: nombre, datos: d, offline: window.__OFFLINE });
      return __promesaNube('add:' + nombre, { id: id }).then(function(r){ window.__DOCS[nombre + '/' + id] = d; return r; });
    },
    doc: function(id) {
      return {
        id: id,
        get: function() {
          var d = window.__DOCS[nombre + '/' + id];
          return __promesaNube('get:' + nombre, { exists: !!d, id: id, data: function(){ return d || {}; } });
        },
        set: function(d, opts) {
          window.__ESCRITURAS.push({ op: 'set', coleccion: nombre, docId: id, datos: d, opts: opts, offline: window.__OFFLINE });
          return __promesaNube('set:' + nombre).then(function(){
            window.__DOCS[nombre + '/' + id] = Object.assign({}, window.__DOCS[nombre + '/' + id] || {}, d);
          });
        },
        update: function(d) {
          window.__ESCRITURAS.push({ op: 'update', coleccion: nombre, docId: id, datos: d, offline: window.__OFFLINE });
          // update() sobre un doc inexistente FALLA — igual que Firestore de verdad.
          if (!window.__OFFLINE && !window.__DOCS[nombre + '/' + id]) {
            window.__ESCRITURAS.push({ op: 'update-not-found', coleccion: nombre, docId: id });
            return Promise.reject(Object.assign(new Error('no entity to update'), { code: 'not-found' }));
          }
          return __promesaNube('update:' + nombre).then(function(){
            window.__DOCS[nombre + '/' + id] = Object.assign({}, window.__DOCS[nombre + '/' + id] || {}, d);
          });
        },
        delete: function() { return __promesaNube('delete:' + nombre); },
        collection: __coleccion
      };
    },
    where: function() { return { get: function(){ return __promesaNube('query:' + nombre, __snap([])); }, where: function(){ return this; }, orderBy: function(){ return this; } }; },
    orderBy: function() { return this; },
    get: function() { return __promesaNube('get-all:' + nombre, __snap(__docsDe(nombre))); },
    onSnapshot: function(cb) { try { cb(__snap(__docsDe(nombre))); } catch(e){} return function(){}; }
  };
}

var __firestore = function() {
  return {
    collection: __coleccion,
    runTransaction: function(fn) { return __promesaNube('transaction', 1); },
    enablePersistence: function(){ return Promise.resolve(); }
  };
};
__firestore.FieldValue = { serverTimestamp: function(){ return 'ts_falso'; }, delete: function(){ return null; } };

window.firebase = {
  initializeApp: function(){ return {}; },
  firestore: __firestore,
  storage: function() {
    return { ref: function(){ return { put: function(){ return __promesaNube('storage.put', { ref: {} }); }, getDownloadURL: function(){ return __promesaNube('storage.url', 'https://falso/imagen.jpg'); } }; } };
  }
};

// EmailJS: se captura, nunca sale un correo ni se gasta cuota del plan de 200/mes.
window.emailjs = {
  init: function(){},
  send: function(servicio, plantilla, params) {
    window.__CORREOS.push({ servicio: servicio, plantilla: plantilla, params: params, en: Date.now(), offline: window.__OFFLINE });
    if (window.__OFFLINE) return Promise.reject(new Error('Network Error'));   // como EmailJS sin red
    return Promise.resolve({ status: 200, text: 'OK' });
  }
};
</script>
`;

// 3. El stub entra justo antes del initializeApp de la app.
const ancla = html.indexOf('firebase.initializeApp({');
const aperturaScript = html.lastIndexOf('<script>', ancla);
html = html.slice(0, aperturaScript) + STUB + html.slice(aperturaScript);

fs.writeFileSync(destino, html);
console.log('arnes escrito: ' + destino + ' (' + Math.round(html.length / 1024) + ' KB)');
}

module.exports = { generar };

// Uso suelto desde la linea de comandos.
if (require.main === module) generar(process.argv[2], process.argv[3]);
