/* Firebase Authentication FALSO para los arneses offline (gen-arnes.js y nube-compartida.js).

   Desde la etapa 1 de Auth (23-10-2026) la app inicia sesion con firebase.auth() y lista a la gente
   desde `directorio`. Para que las pruebas offline que ya existian sigan entrando con su PIN sin
   reescribirlas, este stub sale de la MISMA semilla de siempre (`tecnicos`):
   - `directorio`: si la semilla no trae uno, se arma desde `tecnicos` (nombre, cargo, letra, correo),
     sin PIN ni hash, igual que lo haria tools/cuentas-auth.js.
   - signInWithEmailAndPassword(correo, clave): busca en `tecnicos` el documento cuyo correo de cuenta
     calza. Tecnico: la clave tiene que ser la que la APP deriva de su PIN (_claveFirebaseDePin de la
     pagina). Con passwordHash: sha256(clave) tiene que ser ese hash (asi el Administrador de prueba
     entra con CLAVE_PRUEBA). Sin red (window.__OFFLINE o navigator.onLine === false o
     window.__AUTH_SIN_RED) rechaza con auth/network-request-failed, como el SDK real.
   - La sesion sobrevive a recargar la pagina (localStorage '__auth_stub_uid'), como la persistencia
     LOCAL del SDK. window.__AUTH_INTENTOS registra cada intento (sin la clave).
   Nunca habla con Firebase de verdad: el SDK ni se carga. */

const STUB_AUTH = `(function(){
  if (!window.firebase || window.__AUTH_STUB) return;
  window.__AUTH_STUB = true;
  window.__AUTH_INTENTOS = window.__AUTH_INTENTOS || [];

  function correoDe(uid) {
    return (typeof _correoDeCuenta === 'function') ? _correoDeCuenta(uid) : String(uid).toLowerCase() + '@emval-app.firebaseapp.com';
  }
  function snapDe(docs) {
    return { docs: docs, size: docs.length, empty: docs.length === 0, forEach: function(f){ docs.forEach(f); } };
  }

  // directorio: el real si la semilla lo trae; si no, el que sale de tecnicos.
  function envolver(fsFn) {
    if (!fsFn || fsFn.__conDirectorio) return fsFn;
    var w = function() {
      var db = fsFn();
      var col0 = db.collection;
      var out = {}; for (var k in db) out[k] = db[k];
      out.collection = function(nombre) {
        if (nombre !== 'directorio') return col0(nombre);
        var real = col0('directorio');
        var derivado = function() {
          return col0('tecnicos').get().then(function(s) {
            var docs = (s && s.docs || []).map(function(d) {
              var t = d.data() || {};
              var f = { nombre: t.nombre, cargo: t.cargo, letra: t.letra, correo: correoDe(d.id), activo: true };
              return { id: d.id, exists: true, ref: { id: d.id }, data: function(){ return f; } };
            });
            return snapDe(docs);
          });
        };
        var c = {}; for (var k2 in real) c[k2] = real[k2];
        c.get = function() { return real.get().then(function(s){ return (s && s.docs && s.docs.length) ? s : derivado(); }); };
        c.orderBy = function() { return c; };
        return c;
      };
      return out;
    };
    for (var k in fsFn) w[k] = fsFn[k];
    w.__conDirectorio = true;
    return w;
  }
  window.__envolverDirectorio = envolver;
  window.firebase.firestore = envolver(window.firebase.firestore);

  async function sha(t) {
    var b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(t)));
    return Array.from(new Uint8Array(b)).map(function(x){ return x.toString(16).padStart(2, '0'); }).join('');
  }
  function sinRed() { return window.__OFFLINE === true || navigator.onLine === false || window.__AUTH_SIN_RED === true; }
  function error(code) { return Object.assign(new Error(code), { code: code }); }

  var actual = null, oyentes = [];
  try { var u = localStorage.getItem('__auth_stub_uid'); if (u) actual = { uid: u, email: correoDe(u) }; } catch (e) {}
  var auth = {
    get currentUser() { return actual; },
    onAuthStateChanged: function(cb) { oyentes.push(cb); setTimeout(function(){ try { cb(actual); } catch (e) {} }, 0); return function(){}; },
    signInWithEmailAndPassword: function(correo, clave) {
      window.__AUTH_INTENTOS.push({ correo: correo, en: Date.now(), sinRed: sinRed() });
      if (sinRed()) return new Promise(function(_, rej){ setTimeout(function(){ rej(error('auth/network-request-failed')); }, 30); });
      return window.firebase.firestore().collection('tecnicos').get().then(async function(s) {
        var d = (s && s.docs || []).find(function(x){ return correoDe(x.id) === String(correo).toLowerCase(); });
        if (!d) throw error('auth/invalid-credential');
        var t = d.data() || {};
        var ok = t.passwordHash ? (await sha(clave)) === String(t.passwordHash).toLowerCase()
          : (/^\\d{4}$/.test(String(t.pin || '')) && typeof _claveFirebaseDePin === 'function' && clave === _claveFirebaseDePin(t.pin));
        if (!ok) throw error('auth/invalid-credential');
        actual = { uid: d.id, email: correoDe(d.id) };
        try { localStorage.setItem('__auth_stub_uid', d.id); } catch (e) {}
        oyentes.forEach(function(cb){ try { cb(actual); } catch (e) {} });
        return { user: actual };
      });
    },
    signOut: function() { actual = null; try { localStorage.removeItem('__auth_stub_uid'); } catch (e) {} return Promise.resolve(); }
  };
  window.firebase.auth = function(){ return auth; };
})();`;

module.exports = { STUB_AUTH };
