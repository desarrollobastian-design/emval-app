/*
  El comentario del administrador llega al correo — y llega intacto.

  Pedro pidio poder escribir un comentario al enviar una cotizacion. El texto lo escribe una
  persona y viaja DENTRO del HTML del cuerpo, asi que hay dos formas de arruinarlo:

    1. No escaparlo: un "<" o un "&" del texto rompen el cuerpo del correo, y un tag pegado desde
       otro lado se ejecuta en el cliente de correo del supervisor de SMU.
    2. Aplanar los saltos de linea: el administrador escribe tres lineas y al supervisor le llega
       un parrafo corrido.

  Este test no reimplementa nada: extrae de index.html la funcion de escape REAL y la expresion
  REAL que arma el bloque. Si alguien las renombra, el test se cae — a proposito.

  Uso:  node tests/comentario-en-correo-cotizacion.js index.html
*/

const fs = require('fs');
const path = require('path');

const archivo = process.argv[2] || path.join(__dirname, '..', 'index.html');
const src = fs.readFileSync(archivo, 'utf8');

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
  if (cond) { pasaron++; console.log('  PASA   ' + nombre); }
  else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? '\n           ' + detalle : '')); }
}

// ── Extraer la funcion de escape real ───────────────────────────────────────────────────────
const mEsc = src.match(/function _escaparHtmlCorreo\(txt\) \{[\s\S]*?\n\}/);
if (!mEsc) { console.error('No se encontro _escaparHtmlCorreo en ' + archivo); process.exit(1); }
const _escaparHtmlCorreo = new Function(mEsc[0] + '; return _escaparHtmlCorreo;')();

// ── Extraer la expresion real que arma el bloque del comentario ─────────────────────────────
const mBloque = src.match(/const comentarioHtml = comentario\s*\?([\s\S]*?)\n    : '';/);
if (!mBloque) { console.error('No se encontro la construccion de comentarioHtml en ' + archivo); process.exit(1); }
const armarBloque = new Function('comentario', '_escaparHtmlCorreo',
  'const comentarioHtml = comentario ?' + mBloque[1] + "\n    : ''; return comentarioHtml;");
const bloque = function(txt) { return armarBloque(txt, _escaparHtmlCorreo); };

console.log('\nComentario del administrador en el correo de cotizaciones\n');

// ── 1. Escape ───────────────────────────────────────────────────────────────────────────────
console.log('  Escape del texto libre');
ok('un < del texto no abre un tag',
  _escaparHtmlCorreo('precio < 100').indexOf('<') === -1,
  'quedo: ' + _escaparHtmlCorreo('precio < 100'));
ok('un script pegado sale como texto, no se ejecuta',
  bloque('<script>alert(1)</script>').indexOf('<script') === -1,
  'quedo: ' + bloque('<script>alert(1)</script>'));
ok('el & de "Ventas & Cobranza" no rompe la entidad',
  _escaparHtmlCorreo('Ventas & Cobranza') === 'Ventas &amp; Cobranza');
ok('las comillas se escapan (el bloque las mete entre atributos)',
  _escaparHtmlCorreo('dijo "ya"').indexOf('&quot;') !== -1);
ok('null / undefined no explotan ni escriben "undefined"',
  _escaparHtmlCorreo(null) === '' && _escaparHtmlCorreo(undefined) === '');

// ── 2. Saltos de linea ──────────────────────────────────────────────────────────────────────
console.log('\n  Formato del texto');
const tresLineas = bloque('Linea uno\nLinea dos\nLinea tres');
ok('tres lineas escritas son tres lineas en el correo',
  (tresLineas.match(/<br>/g) || []).length === 2,
  'br encontrados: ' + (tresLineas.match(/<br>/g) || []).length);
ok('el texto se ve completo en el cuerpo',
  tresLineas.indexOf('Linea uno') !== -1 && tresLineas.indexOf('Linea tres') !== -1);
ok('lleva el rotulo "Comentario" para que el supervisor sepa que es',
  /Comentario/i.test(tresLineas));

// ── 3. Sin comentario no se ensucia el correo ───────────────────────────────────────────────
console.log('\n  Cuando no hay comentario');
ok('vacio => no se agrega nada al cuerpo', bloque('') === '');
ok('undefined => no se agrega nada al cuerpo', bloque(undefined) === '');

// ── 4. La zona CSS-EXPORTADO: literales, no var() ───────────────────────────────────────────
// El bloque viaja a un cliente de correo donde el :root de la app no existe. Una custom property
// sin fallback invalida la declaracion entera. check-tokens.js ya lo vigila; esto lo dice aqui
// tambien, junto al codigo que podria romperlo.
console.log('\n  El bloque sobrevive fuera de la app');
ok('no usa var(--...): el :root no viaja al correo',
  bloque('hola').indexOf('var(--') === -1);

// ── 5. El comentario viaja a la cola y a Firestore ──────────────────────────────────────────
// Si sale desde la cola manana, el cuerpo ya esta armado (viaja en `trabajo`), pero el registro
// en la cotizacion lo escribe _ejecutarPostCorreo desde `post.comentario`.
console.log('\n  Registro del envio');
ok('el post directo lleva el comentario',
  /_post = \{ tipo: 'cotizacion',.*comentario: comentario/.test(src));
ok('el post de los destinatarios que quedan encolados tambien lo lleva',
  /post: \{ tipo: 'cotizacion', ids: _post\.ids[^}]*comentario: comentario/.test(src));
ok('_ejecutarPostCorreo lo guarda en la cotizacion',
  /comentarioEnvio = comentario/.test(src) && /post\.comentario/.test(src));
ok('sin comentario NO pisa el campo con vacio',
  /if \(comentario\) \{ _campos\.comentarioEnvio/.test(src));

// ── 6. El campo solo se ofrece donde sirve ──────────────────────────────────────────────────
// El modal se reutiliza para las hojas de trabajo, que no llevan comentario. Un campo visible
// que no viaja a ninguna parte es peor que no tenerlo.
console.log('\n  El modal es compartido con las hojas de trabajo');
ok('cotizaciones: el campo se muestra', /_prepararComentarioCot\(true\)/.test(src));
ok('hojas de trabajo: el campo se oculta', /_prepararComentarioCot\(false\)/.test(src));
ok('se limpia al abrir (no arrastra el comentario del envio anterior)',
  /function _prepararComentarioCot[\s\S]{0,250}ta\.value = ''/.test(src));

console.log('\n  ' + pasaron + ' pasaron, ' + fallaron + ' fallaron\n');
process.exit(fallaron ? 1 : 0);
