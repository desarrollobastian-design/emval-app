// App Check (02-10-2026): Firestore tiene que recibir un token de reCAPTCHA Enterprise desde
// la app de produccion, y la app NUNCA puede caerse por App Check.
//
// Por que existe: las reglas de Firestore no distinguen a la app de un tercero (no hay inicio
// de sesion de Firebase y la apiKey es publica). App Check es la capa que si lo hace. Pero un
// tecnico en terreno abre la app sin señal: si el script de App Check no carga, o activate()
// lanza, la OT tiene que poder cerrarse igual.
//
// Uso: node tests/app-check-no-bota-la-app.js index.html
// Extrae el bloque real de inicializacion de index.html y lo corre con stubs. Sin dependencias.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RUTA = process.argv[2] || 'index.html';
const html = fs.readFileSync(RUTA, 'utf8');
let fallos = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) fallos++; };

// 1) El bloque de inicializacion: desde initializeApp hasta _firebaseReady.
const ini = html.indexOf('firebase.initializeApp({');
const fin = html.indexOf('window._firebaseReady = true;', ini);
if (ini < 0 || fin < 0) { console.log('FALLA No se encontro el bloque de inicializacion de Firebase'); process.exit(1); }
const bloque = html.slice(ini, fin + 'window._firebaseReady = true;'.length);

function correr(hostname, appCheck) {
  const llamadas = [];
  const firebase = { initializeApp() {} };
  if (appCheck === 'ok' || appCheck === 'lanza') {
    const fn = function () {
      return { activate(prov, refresco) {
        if (appCheck === 'lanza') throw new Error('reCAPTCHA no disponible');
        llamadas.push({ prov, refresco });
      } };
    };
    fn.ReCaptchaEnterpriseProvider = function (clave) { this.clave = clave; };
    firebase.appCheck = fn;
  }
  const avisos = [];
  const window = {};
  const ctx = { firebase, window, location: { hostname }, console: { warn: (...a) => avisos.push(a.join(' ')), log() {} } };
  vm.createContext(ctx);
  let error = null;
  try { vm.runInContext(bloque, ctx); } catch (e) { error = e; }
  return { llamadas, avisos, error, window };
}

const PROD = 'desarrollobastian-design.github.io';

// 2) Produccion con el SDK cargado: se activa una vez, con reCAPTCHA Enterprise y la clave.
let r = correr(PROD, 'ok');
ok(!r.error, 'produccion: la inicializacion no lanza');
ok(r.llamadas.length === 1, 'produccion: activate() se llama exactamente una vez');
ok(r.llamadas[0] && r.llamadas[0].prov && r.llamadas[0].prov.clave === r.window.APP_CHECK_SITE_KEY && /^6L/.test(r.window.APP_CHECK_SITE_KEY),
  'produccion: el proveedor es ReCaptchaEnterpriseProvider con la clave del sitio');
ok(r.llamadas[0] && r.llamadas[0].refresco === true, 'produccion: el token se renueva solo');
ok(r.window._appCheckActivo === true && r.window._firebaseReady === true, 'produccion: _appCheckActivo y _firebaseReady quedan en true');

// 3) Sin señal en frio: el script de App Check no cargo. La app sigue.
r = correr(PROD, 'falta');
ok(!r.error && r.window._firebaseReady === true, 'sin el script de App Check: la app arranca igual');
ok(r.window._appCheckActivo === false && r.avisos.length === 1, 'sin el script de App Check: queda inactivo y lo avisa en consola');

// 4) activate() lanza (reCAPTCHA bloqueado, navegador raro): la app sigue.
r = correr(PROD, 'lanza');
ok(!r.error && r.window._firebaseReady === true, 'activate() que lanza: la app arranca igual');
ok(r.window._appCheckActivo === false, 'activate() que lanza: queda inactivo');

// 5) Fuera del dominio de produccion (localhost, arneses de tests/): no pide tokens.
for (const host of ['localhost', '127.0.0.1', 'desarrollobastian-design.github.io.evil.com']) {
  r = correr(host, 'ok');
  ok(!r.error && r.llamadas.length === 0 && r.window._appCheckActivo === false, 'en ' + host + ': App Check no se activa');
}

// 6) Orden en el HTML: el SDK de App Check se carga despues del de app y antes de inicializar,
//    y la activacion ocurre antes del primer uso de Firestore.
const posApp = html.indexOf('firebase-app-compat.js');
const posAC = html.indexOf('firebase-app-check-compat.js');
const posActivate = html.indexOf('.activate(', ini);
const posFirestore = html.indexOf('firebase.firestore()');
ok(posApp > 0 && posAC > posApp && posAC < ini, 'el <script> de App Check va despues de firebase-app y antes de initializeApp');
ok(posActivate > ini && posActivate < fin && (posFirestore < 0 || posActivate < posFirestore), 'activate() corre antes del primer firebase.firestore()');
ok(/firebasejs\/9\.23\.0\/firebase-app-check-compat\.js/.test(html), 'App Check usa la misma version del SDK (9.23.0) que el resto');

// 7) Service worker: no congela el script de reCAPTCHA en la cache.
const sw = path.join(path.dirname(path.resolve(RUTA)), 'sw.js');
if (fs.existsSync(sw)) {
  const t = fs.readFileSync(sw, 'utf8');
  const filtro = t.slice(t.indexOf("self.addEventListener('fetch'"), t.indexOf("e.request.mode === 'navigate'"));
  ok(filtro.includes("google.com/recaptcha") && filtro.includes('recaptcha.net'), 'sw.js deja pasar reCAPTCHA sin cachearlo');
} else {
  console.log('AVISO no hay sw.js junto a ' + RUTA + ': el filtro de reCAPTCHA no se midio');
}

console.log(fallos ? '\n' + fallos + ' FALLA(S)' : '\nTodo OK');
process.exit(fallos ? 1 : 0);
