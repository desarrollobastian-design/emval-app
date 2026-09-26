/* Nube falsa COMPARTIDA entre varios teléfonos emulados (Playwright).

   El arnés base (gen-arnes.js) sirve para un solo teléfono: sus consultas where() responden
   vacías y su base vive dentro de la página, así que se pierde al recargar. Eso no alcanza para
   probar un flujo que cruza dos dispositivos, como el de las pausadas que solo existen en el
   teléfono del técnico: el teléfono de Lucas reporta → el panel de Pedro las muestra → Pedro
   elimina → el teléfono de Lucas las quita al volver a abrir la app.

   Aquí la base vive en NODE y cada página habla con ella por un binding (`window.__nube`). Así:
     · dos contextos de navegador (dos teléfonos, cada uno con su localStorage) ven la MISMA nube;
     · la nube sobrevive a una recarga de la página (el técnico cierra y abre la app);
     · where('campo','==',valor) filtra de verdad y onSnapshot se vuelve a disparar cuando
       cualquier teléfono escribe en esa colección, como el listener en vivo del panel.

   Sigue sin cargarse el SDK real: tocar producción es imposible aunque el código lo intente.

   Uso:
     const { crearNube, STUB_NUBE } = require('./nube-compartida');
     const nube = crearNube({ ordenes: [...], tecnicos: [...] });
     await nube.conectar(context);                 // una vez por contexto (por teléfono)
     await page.goto(url); await page.evaluate(STUB_NUBE);   // después de cada carga */

// ─── Lado de la página: reemplaza window.firebase.firestore por un cliente de la nube de Node ──
const STUB_NUBE = `(function(){
  if (window.__NUBE_CONECTADA) return;
  window.__NUBE_CONECTADA = true;
  var escuchas = {}, seq = 0;

  // Timestamp con la forma del SDK, incluido su valueOf() para ORDENAR (no es una fecha).
  function ts(ms) {
    var secs = Math.floor(ms / 1000), nanos = (ms % 1000) * 1e6;
    return { seconds: secs, nanoseconds: nanos,
      toDate: function(){ return new Date(ms); }, toMillis: function(){ return ms; },
      valueOf: function(){ return String(secs + 62135596800).padStart(12,'0') + '.' + String(nanos).padStart(9,'0'); } };
  }
  function revivir(v) {
    if (v && typeof v === 'object') {
      if (typeof v.__ts === 'number') return ts(v.__ts);
      if (Array.isArray(v)) return v.map(revivir);
      var o = {}; for (var k in v) o[k] = revivir(v[k]); return o;
    }
    return v;
  }
  function serial(v) {
    if (v && typeof v === 'object') {
      if (v.__sentinela === 'serverTimestamp') return { __sts: true };
      if (v.__sentinela === 'arrayUnion') return { __au: v.valores.map(serial) };
      if (v.__sentinela === 'arrayRemove') return { __ar: v.valores.map(serial) };
      if (v.__sentinela === 'delete') return { __del: true };
      if (typeof v.toDate === 'function') return { __ts: v.toDate().getTime() };
      if (v instanceof Date) return { __ts: v.getTime() };
      if (Array.isArray(v)) return v.map(serial);
      var o = {}; for (var k in v) { if (v[k] !== undefined) o[k] = serial(v[k]); } return o;
    }
    return v;
  }
  function snapDoc(r) {
    return { id: r.id, exists: !!r.datos, ref: { id: r.id },
      data: function(){ return r.datos ? revivir(r.datos) : undefined; } };
  }
  function snapQ(lista) {
    var docs = lista.map(snapDoc);
    return { docs: docs, size: docs.length, empty: docs.length === 0,
      forEach: function(f){ docs.forEach(f); }, metadata: { fromCache: false, hasPendingWrites: false } };
  }
  window.__dispararEscucha = function(id, lista) {
    var f = escuchas[id];
    if (f) { try { f(snapQ(lista)); } catch (e) { console.error('[nube] listener', e); } }
  };
  function consulta(col, filtros) {
    var q = {
      where: function(c, op, v){ return consulta(col, filtros.concat([[c, op, serial(v)]])); },
      orderBy: function(){ return q; }, limit: function(){ return q; },
      get: function(){ return window.__nube({ tipo: 'query', col: col, filtros: filtros }).then(snapQ); },
      onSnapshot: function(cb) {
        var id = 'l' + (++seq);
        escuchas[id] = cb;
        window.__nube({ tipo: 'listen', col: col, filtros: filtros, id: id });
        return function(){ delete escuchas[id]; window.__nube({ tipo: 'unlisten', id: id }); };
      }
    };
    return q;
  }
  function coleccion(col) {
    var c = consulta(col, []);
    c.doc = function(id) {
      id = id || ('auto_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
      return {
        id: id,
        get: function(){ return window.__nube({ tipo: 'get', col: col, id: id }).then(snapDoc); },
        set: function(d, o){ return window.__nube({ tipo: 'set', col: col, id: id, datos: serial(d), merge: !!(o && o.merge) }).then(function(){}); },
        update: function(d) {
          return window.__nube({ tipo: 'update', col: col, id: id, datos: serial(d) }).then(function(r) {
            if (r && r.error) { var e = new Error(r.error); e.code = 'not-found'; throw e; }
          });
        },
        delete: function(){ return window.__nube({ tipo: 'delete', col: col, id: id }).then(function(){}); },
        collection: function(sub){ return coleccion(col + '/' + id + '/' + sub); }
      };
    };
    c.add = function(d){ return window.__nube({ tipo: 'add', col: col, datos: serial(d) }).then(function(r){ return { id: r.id }; }); };
    return c;
  }
  var fs = function() {
    return { collection: coleccion,
      runTransaction: function(){ return Promise.resolve(1); },
      enablePersistence: function(){ return Promise.resolve(); } };
  };
  fs.FieldValue = {
    serverTimestamp: function(){ return { __sentinela: 'serverTimestamp' }; },
    arrayUnion: function(){ return { __sentinela: 'arrayUnion', valores: [].slice.call(arguments) }; },
    arrayRemove: function(){ return { __sentinela: 'arrayRemove', valores: [].slice.call(arguments) }; },
    delete: function(){ return { __sentinela: 'delete' }; }
  };
  fs.Timestamp = { now: function(){ return ts(Date.now()); }, fromDate: function(d){ return ts(d.getTime()); } };
  window.firebase.firestore = fs;
})()`;

// ─── Lado de Node: la base de datos compartida ────────────────────────────────────────────────
function crearNube(semilla) {
  const cols = {};            // colección → Map(id → datos serializados)
  const escuchas = new Map(); // id → { page, col, filtros }
  const log = [];             // todo lo que escribió cada teléfono, para las comprobaciones
  let seq = 0;

  function col(nombre) { if (!cols[nombre]) cols[nombre] = new Map(); return cols[nombre]; }
  const ahora = () => Date.now();

  function iguales(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function valorEn(d, ruta) { return ruta.split('.').reduce((o, k) => (o == null ? undefined : o[k]), d); }
  function coincide(d, filtros) {
    return filtros.every(([c, op, v]) => {
      const x = valorEn(d, c);
      if (op === '==') return iguales(x, v);
      if (op === '!=') return !iguales(x, v);
      if (op === 'in') return (v || []).some(w => iguales(x, w));
      if (op === 'array-contains') return Array.isArray(x) && x.some(w => iguales(w, v));
      if (op === '>=') return x >= v;
      if (op === '<=') return x <= v;
      if (op === '>') return x > v;
      if (op === '<') return x < v;
      return true;
    });
  }
  function consultar(nombre, filtros) {
    const lista = [];
    for (const [id, datos] of col(nombre)) if (coincide(datos, filtros || [])) lista.push({ id, datos });
    return lista;
  }
  // Resuelve serverTimestamp / arrayUnion / arrayRemove / delete contra el documento previo.
  function aplicar(previo, nuevos) {
    const r = Object.assign({}, previo || {});
    for (const k of Object.keys(nuevos || {})) {
      const v = nuevos[k];
      if (v && typeof v === 'object' && v.__sts) r[k] = { __ts: ahora() };
      else if (v && typeof v === 'object' && v.__del) delete r[k];
      else if (v && typeof v === 'object' && Array.isArray(v.__au)) {
        const base = Array.isArray(r[k]) ? r[k].slice() : [];
        v.__au.forEach(w => { if (!base.some(x => iguales(x, w))) base.push(w); });
        r[k] = base;
      } else if (v && typeof v === 'object' && Array.isArray(v.__ar)) {
        r[k] = (Array.isArray(r[k]) ? r[k] : []).filter(x => !v.__ar.some(w => iguales(x, w)));
      } else r[k] = v;
    }
    return r;
  }
  async function notificar(nombre) {
    for (const [id, l] of escuchas) {
      if (l.col !== nombre) continue;
      const lista = consultar(nombre, l.filtros);
      try { await l.page.evaluate(([i, li]) => window.__dispararEscucha && window.__dispararEscucha(i, li), [id, lista]); }
      catch (e) { escuchas.delete(id); }   // la página se recargó o se cerró
    }
  }

  async function manejar(page, op) {
    const c = col(op.col);
    switch (op.tipo) {
      case 'get':    return { id: op.id, datos: c.has(op.id) ? c.get(op.id) : null };
      case 'query':  return consultar(op.col, op.filtros);
      case 'add': {
        const id = 'doc_' + (++seq);
        c.set(id, aplicar(null, op.datos));
        log.push({ op: 'add', col: op.col, id, datos: c.get(id) });
        notificar(op.col);
        return { id };
      }
      case 'set': {
        c.set(op.id, aplicar(op.merge ? c.get(op.id) : null, op.datos));
        log.push({ op: 'set', col: op.col, id: op.id, datos: c.get(op.id) });
        notificar(op.col);
        return {};
      }
      case 'update': {
        if (!c.has(op.id)) return { error: 'no entity to update: ' + op.col + '/' + op.id };
        c.set(op.id, aplicar(c.get(op.id), op.datos));
        log.push({ op: 'update', col: op.col, id: op.id, datos: c.get(op.id) });
        notificar(op.col);
        return {};
      }
      case 'delete': {
        const existia = c.delete(op.id);
        log.push({ op: 'delete', col: op.col, id: op.id, existia });
        notificar(op.col);
        return {};
      }
      case 'listen': {
        escuchas.set(op.id, { page, col: op.col, filtros: op.filtros });
        const lista = consultar(op.col, op.filtros);
        setTimeout(() => {
          page.evaluate(([i, li]) => window.__dispararEscucha && window.__dispararEscucha(i, li), [op.id, lista]).catch(() => {});
        }, 5);
        return {};
      }
      case 'unlisten': escuchas.delete(op.id); return {};
    }
    return {};
  }

  // Semilla: { coleccion: [ { _id, ...campos } ] }. Las fechas se pasan como { __ts: ms }.
  for (const nombre of Object.keys(semilla || {})) {
    for (const d of semilla[nombre]) {
      const { _id, ...resto } = d;
      col(nombre).set(_id || ('seed_' + (++seq)), resto);
    }
  }

  return {
    manejar, consultar, log,
    doc: (nombre, id) => col(nombre).get(id),
    docs: (nombre) => [...col(nombre)].map(([id, datos]) => ({ id, datos })),
    async conectar(context) { await context.exposeBinding('__nube', ({ page }, op) => manejar(page, op)); }
  };
}

module.exports = { crearNube, STUB_NUBE };
