/* Prueba de regresion — la app y tools/cuentas-auth.js derivan IGUAL la cuenta de cada persona.

   La herramienta crea la cuenta de Firebase de cada tecnico con la clave que sale de su PIN de
   siempre (`_claveFirebaseDePin`) y un correo que sale de su uid (`_correoDeCuenta`); la app inicia
   sesion derivando lo mismo. Si una de las dos cambia y la otra no, NADIE ENTRA con señal — y el
   tecnico, que escribio bien su PIN, ve "PIN incorrecto". Esta prueba ejecuta las dos copias reales
   (extraidas de index.html y requeridas de tools/) y exige el mismo resultado.

   Ademas: el PIN que escribe el tecnico es el de siempre (4 digitos) y la clave derivada cumple el
   minimo de Firebase (6 caracteres).

   Uso:  node tests/la-clave-de-firebase-sale-del-pin.js index.html
   Sale 0 si coinciden; 1 si no. */

const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); return !!ok; }

console.log('La clave de Firebase sale del PIN: app y herramienta derivan igual\n');

function linea(re, que) {
  const m = src.match(re);
  chequear(!!m, 'no se encontro ' + que + ' en index.html (¿se renombro?)');
  return m ? m[0] : '';
}
const codigo = [
  linea(/const DOMINIO_CORREO_CUENTA = '[^']*';/, 'DOMINIO_CORREO_CUENTA'),
  linea(/function _claveFirebaseDePin\(pin\) \{[^\n]*\}/, '_claveFirebaseDePin'),
  linea(/function _correoDeCuenta\(uid\) \{[^\n]*\}/, '_correoDeCuenta')
].join('\n');

let app = null;
try { app = new Function(codigo + '; return { clave: _claveFirebaseDePin, correo: _correoDeCuenta };')(); }
catch (e) { chequear(false, 'el codigo de la app no corre: ' + e.message); }

let herr = null;
try {
  // La herramienta no carga firebase-admin al requerirla: solo exporta sus funciones.
  herr = require(path.resolve(__dirname, '..', 'tools', 'cuentas-auth.js'));
} catch (e) { chequear(false, 'no se pudo cargar tools/cuentas-auth.js: ' + e.message); }

if (app && herr) {
  const pins = ['0000', '1234', '4821', '9999', '0071'];
  const uids = ['tecA0000000000000001', 'XyZ9aBcDeFgHiJkLmNoP', 'u_pedro'];
  const difClave = pins.filter(p => app.clave(p) !== herr._claveFirebaseDePin(p));
  const difCorreo = uids.filter(u => app.correo(u) !== herr._correoDeCuenta(u));
  const cortas = pins.filter(p => app.clave(p).length < 6);
  const conPin = pins.every(p => app.clave(p).endsWith(p));
  console.log('1) Clave       → ' + (difClave.length ? difClave.length + ' PIN derivan distinto ✗' : 'app = herramienta en ' + pins.length + ' PIN ✓') +
    ', largo ≥ 6: ' + (cortas.length ? 'NO ✗' : 'si ✓') + ', sale del PIN de siempre: ' + (conPin ? 'si ✓' : 'NO ✗'));
  console.log('2) Correo      → ' + (difCorreo.length ? difCorreo.length + ' uid derivan distinto ✗' : 'app = herramienta en ' + uids.length + ' uid ✓') +
    ', dominio ' + (app.correo('x').split('@')[1] === herr.DOMINIO_CORREO ? 'igual ✓' : 'DISTINTO ✗'));
  chequear(difClave.length === 0, 'la clave que deriva la app no es la que crea la herramienta: nadie entraria con señal');
  chequear(cortas.length === 0, 'la clave derivada tiene menos de 6 caracteres: Firebase no la acepta');
  chequear(conPin, 'la clave derivada no sale del PIN de siempre (no se le cambia el PIN a nadie)');
  chequear(difCorreo.length === 0, 'el correo que deriva la app no es el de la cuenta creada por la herramienta');
  chequear(app.correo('x').split('@')[1] === herr.DOMINIO_CORREO, 'el dominio del correo difiere entre app y herramienta');
  chequear(app.correo('AbC') === app.correo('abc'), 'el correo depende de mayusculas: Firebase los guarda en minuscula');
}

// El teclado sigue pidiendo 4 digitos: el PIN que escribe el tecnico no cambia.
// (Desde el arreglo de la carrera de los 200 ms la validacion va con quien tecleo: validarPin(quien).)
const mPin = src.match(/function pinInput\(d\) \{[\s\S]*?\n\}/);
const teclado = !!mPin && /if \(pinActual\.length === 4\)/.test(mPin[0]) && /validarPin\(/.test(mPin[0]) &&
  /if \(pinActual\.length >= 4\) return;/.test(mPin[0]);
console.log('3) Teclado     → ' + (teclado ? 'sigue en 4 digitos ✓' : 'CAMBIO ✗'));
chequear(teclado, 'el teclado del PIN ya no valida al cuarto digito');

console.log('');
if (fallos.length) {
  console.log('FALLA (' + fallos.length + '):');
  fallos.forEach(f => console.log(f));
  process.exit(1);
}
console.log('OK — la app inicia sesion con la misma cuenta que crea la herramienta, desde el PIN de siempre.');
