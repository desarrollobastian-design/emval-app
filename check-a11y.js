#!/usr/bin/env node
/**
 * check-a11y.js — Accesibilidad verificable de EMVAL. Sin dependencias.
 *
 *   node check-a11y.js
 *
 * POR QUE EXISTE, y por que se escribio ANTES de los arreglos:
 * En este proyecto, cuatro veces seguidas, el arreglo recorrio una lista y la verificacion
 * uso esa misma lista. Asi sobrevivieron emojis, radios hardcodeados y tildes. La unica
 * defensa que funciono fue medir por REGLA (rango unicode, escaneo del :root) en vez de por
 * lista. Este script se escribio antes de tocar una sola linea, y fallo con 5 categorias.
 *
 * ALCANCE: solo index.html.
 *
 * LAS 20 REGLAS  (el numero de esta linea llego a decir 12 teniendo 17: si una cabecera no
 *  se puede verificar, envejece. Cuando anadas una regla, corrige este numero.)
 *  1. El viewport no puede desactivar el zoom (WCAG 2.1 SC 1.4.4, nivel AA).
 *     La app la usan tecnicos de tercera edad bajo sol directo. Ver DESIGN.md §1.
 *  2. Ningun control de formulario baja de 16px. Bajo 16px, iOS hace zoom al enfocar,
 *     y bajo el sol nadie lee 12px. Pedro usa el panel de admin TAMBIEN en su telefono.
 *  3. Cero dialogos nativos (confirm/prompt/alert). No se pueden estilar, bloquean el hilo,
 *     y prompt() NO puede enmascarar una contrasena: la de Pedro se veia en pantalla.
 *  4. Todo modal declara role="dialog" y aria-modal="true", o no es un modal: es un div
 *     encima de una pantalla que sigue siendo tabulable por detras.
 * 4b. Todo overlay scrollea y todo dialogo declara max-height, o con el teclado abierto
 *     el boton de confirmar queda fuera de la pantalla.
 *  5. Existe manejo de Escape. Un modal sin Escape es una trampa de teclado.
 *  6. El toast no puede truncarse: es el unico canal de feedback de la app.
 *     Con white-space:nowrap y sin max-width, 6 de sus 99 mensajes se cortaban a 360px.
 *  7. Toda accion que CREA un documento y cuelga de un onclick debe deshabilitar su boton
 *     mientras escribe. Sin eso, un doble toque con mala senal duplica el documento.
 *
 * ── Reglas nacidas de la critica del 2026-07-09 (madrugada) ──
 *  8. Toda funcion que bloquea un boton (_bloquear/_tomar) pasa sus escrituras a Firestore
 *     por _conTimeout(). El SDK, offline, deja el add()/set() colgado SIN resolver ni
 *     rechazar: el `finally` no corre y el boton se queda apagado para siempre.
 *  9. _bloquear() y _tomar() tienen un guardia de tiempo propio. La regla 8 es una lista de
 *     sitios; esta es la red que atrapa el sitio que nadie visito. Pase lo que pase, el
 *     boton vuelve.
 * 10. Quien lee Firestore y se traga el error, FIRMA el silencio. Una lista vacia por falta de
 *     red se ve IDENTICA a una lista sin datos, y el admin concluye que no tiene tecnicos.
 *     La regla exigia ademas "pintar una lista" (innerHTML|appendChild) y esa exclusion
 *     escondia nueve funciones. Ahora: avisar, relanzar, o escribir `SILENCIO-FIRMADO: razon`.
 * 11. La duracion del toast se calcula con el largo del mensaje, el toast se puede cerrar,
 *     y no se posa encima de una barra de estado tappable.
 *     2500ms fijos para mensajes de 6 a 73 caracteres: 43 de 117 no se alcanzaban a leer.
 * 12. Todo estado vacio pasa por _vacio(). Habia cinco maneras de decir "no hay OTs".
 *
 * ── Reglas nacidas de la critica del 2026-07-09 (manana) ──
 * 13. Maximo UN boton de peso primario visible a la vez por pantalla (DESIGN.md §4). La
 *     pantalla que cierra la OT tenia dos verdes identicos: "Confirmar firma" (un paso) y
 *     "Cerrar y generar OT" (irreversible). Los paneles de pestana son excluyentes entre si;
 *     los modales viven en su propio contexto.
 * 14. Todo cargador muestra que esta trabajando. Nueve de quince pintaban un panel en blanco:
 *     Pedro no sabia si cargaba, si estaba vacio, o si la app se habia colgado. Y todo
 *     _cargando() tiene su _cargado(): un aria-busy pegado miente para siempre.
 *
 * ── Reglas nacidas de la critica del 2026-07-09 (mediodia) ──
 * 15. _cargando() NO borra contenido existente. Doce sitios llaman a los cargadores DESPUES
 *     de guardar o borrar: un skeleton encima de datos correctos no es un estado de carga,
 *     es un parpadeo. Arreglar "el panel en blanco" creo "el panel que titila".
 * 16. Ningun toast() concatena e.message. Seis le mostraban al tecnico el string interno que
 *     Firebase le devolvio al SDK. Y todo error visible pasa por _error(accion, e, queHacer):
 *     21 de 29 mensajes no decian que hacer, y varios empezaban por "Error" a secas.
 * 17. Lo que se escribe en el DOM tambien se anuncia. #toast era la UNICA region aria-live de
 *     la app: un administrador con lector de pantalla tocaba "Personal", fallaba la red, y no
 *     oia nada. Hacer el error visible no basta; hay que hacerlo perceptible.
 *
 * ── Reglas nacidas de la critica del 2026-07-09 (tarde) ──
 * 18. Esperar a Firebase tiene un final. Cinco pantallas reintentaban cada 800ms sin tope y sin
 *     decir nada: si Firebase no inicializa nunca, el panel queda en blanco para siempre.
 *     Todas pasan ahora por _esperandoFirebase(), que cuenta y luego dice la verdad.
 *
 * ── Reglas nacidas de la critica del 2026-07-10 ──
 * 19. Todo control de formulario tiene nombre accesible (label for / aria-label / envuelto).
 *     33 controles y cero con nombre: un lector de pantalla oia el placeholder, no la etiqueta.
 * 20. Un modal se abre por _modalMostrar, la puerta que instala foco+trampa+Escape. modal-reasignar
 *     tenia una segunda puerta cruda: aria-modal prometia inercia que esa puerta no cableaba.
 *
 * DOCTRINA DE LAS EXCLUSIONES (2026-07-09). Este archivo tenia dos, y las dos escondian bugs
 * reales, y las dos venian con un comentario largo justificandolas. La regla 10 exigia pintar
 * una lista; el `.some()` de sus catches dejaba pasar a la funcion que avisa una vez y se calla
 * tres — que es exactamente lo que hacia cargarOTsTecnicos mientras mentia con "Aun no hay OTs".
 *
 * Un comentario que defiende una exclusion no es evidencia de que la exclusion sea correcta.
 * Es prosa. Cuando escribas una exclusion, pregunta cual es su UNIDAD (la linea? la funcion?
 * el catch?) y corre la regla una vez SIN ella, para ver que estabas decidiendo no mirar.
 */
const fs = require('fs');
const path = require('path');

const ARCHIVO = path.join(__dirname, 'index.html');
const html = fs.readFileSync(ARCHIVO, 'utf8');
const lineas = html.split(/\r?\n/);
const css = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/i) || [])[1] || '';

const fallos = [];
const linea = (idx) => html.slice(0, idx).split('\n').length;

// Los comentarios que EXPLICAN una regla contienen el patron que la regla prohibe: este script
// conto 13 "dialogos nativos" que eran las palabras dentro de los comentarios que documentan su
// reemplazo. (Le paso lo mismo a check-tokens.js con una custom property de ejemplo.)
//
// Y limpiarlos con un regex simple fue peor: el atributo  accept="image/*"  abre un comentario
// de bloque falso que se come 337.000 caracteres, y entonces el script encuentra CERO problemas
// y dice que todo esta bien. Un falso negativo silencioso es el peor resultado posible.
//
// Por eso hay un escaner que respeta comillas, y un guardian que verifica al escaner.
function sinComentarios(src) {
  let out = '', i = 0, modo = 'codigo';
  while (i < src.length) {
    const c = src[i], dos = src.substr(i, 2);
    if (modo === 'codigo') {
      if (src.substr(i, 4) === '<!--') { modo = 'html'; out += '    '; i += 4; continue; }
      if (dos === '/*') { modo = 'bloque'; out += '  '; i += 2; continue; }
      if (dos === '//') { modo = 'linea'; out += '  '; i += 2; continue; }
      if (c === '"') modo = 'd';
      else if (c === "'") modo = 's';
      else if (c === '`') modo = 't';
      out += c; i++; continue;
    }
    if (modo === 'd' || modo === 's' || modo === 't') {
      if (c === '\\') { out += src.substr(i, 2); i += 2; continue; }
      if ((modo === 'd' && c === '"') || (modo === 's' && c === "'") || (modo === 't' && c === '`')) modo = 'codigo';
      out += c; i++; continue;
    }
    if (modo === 'bloque' && dos === '*/') { modo = 'codigo'; out += '  '; i += 2; continue; }
    if (modo === 'html' && src.substr(i, 3) === '-->') { modo = 'codigo'; out += '   '; i += 3; continue; }
    if (modo === 'linea' && c === '\n') { modo = 'codigo'; out += '\n'; i++; continue; }
    out += c === '\n' ? '\n' : ' ';
    i++;
  }
  return out;
}

let codigo = sinComentarios(html);
// Guardian del guardian: si el escaner se comio el archivo, no confiamos en el.
const vivos = (s) => s.replace(/\s/g, '').length;
const perdido = 1 - vivos(codigo) / vivos(html);
if (perdido > 0.30 || !/function\s+cerrarOT\s*\(/.test(codigo)) {
  console.error('  AVISO: el limpiador de comentarios perdio el ' + Math.round(perdido * 100) + '% del archivo.');
  console.error('  Se analiza el texto crudo. Puede haber falsos positivos, nunca falsos negativos.\n');
  codigo = html;
}

// ─── 1. Viewport ────────────────────────────────────────────────────────────────
const vp = html.match(/<meta\s+name="viewport"[^>]*>/i);
if (!vp) fallos.push({ regla: 'viewport', msg: 'No hay <meta name="viewport">' });
else {
  const c = vp[0];
  if (/user-scalable\s*=\s*no/i.test(c) || /maximum-scale/i.test(c)) {
    fallos.push({
      regla: 'viewport',
      ln: linea(vp.index),
      msg: 'El viewport desactiva el zoom (WCAG 1.4.4 AA). Quita user-scalable y maximum-scale.',
      detalle: c,
    });
  }
}

// ─── 2. Controles de formulario bajo 16px ───────────────────────────────────────
// Sin allowlist a proposito: Pedro usa el panel de admin en su telefono.
const controles = [];
for (const m of html.matchAll(/<(input|textarea|select)\b[^>]*>/gi)) {
  const fsPx = (m[0].match(/font-size:\s*(\d+)px/) || [])[1];
  if (fsPx && +fsPx < 16) {
    const id = (m[0].match(/id="([^"]+)"/) || [])[1] || '(sin id)';
    controles.push({ ln: linea(m.index), px: +fsPx, id });
  }
}
// Reglas CSS que dan font-size a controles
for (const r of css.match(/[^{}]+\{[^}]*\}/g) || []) {
  const sel = r.split('{')[0].trim().replace(/\s+/g, ' ');
  if (!/\b(input|textarea|select)\b/.test(sel)) continue;
  const fsPx = (r.match(/font-size:\s*(\d+)px/) || [])[1];
  if (fsPx && +fsPx < 16) controles.push({ ln: linea(html.indexOf(r)), px: +fsPx, id: 'CSS: ' + sel });
}
if (controles.length) {
  fallos.push({
    regla: 'controles<16px',
    msg: controles.length + ' control(es) bajo 16px: iOS hace zoom al enfocar y bajo el sol no se leen.',
    items: controles.map((c) => 'index.html:' + String(c.ln).padEnd(6) + String(c.px + 'px').padEnd(6) + c.id),
  });
}

// ─── 3. Dialogos nativos ────────────────────────────────────────────────────────
// `confirm(` no matchea `_confirmar(` ni `confirmarReasignar(`: exigimos "(" pegado.
const nativos = [];
for (const m of codigo.matchAll(/(?<![\w$.])(confirm|prompt|alert)\s*\(/g)) {
  nativos.push({ ln: linea(m.index), tipo: m[1] });
}
if (nativos.length) {
  const porTipo = {};
  nativos.forEach((n) => (porTipo[n.tipo] = (porTipo[n.tipo] || 0) + 1));
  fallos.push({
    regla: 'dialogos-nativos',
    msg: nativos.length + ' dialogo(s) nativo(s). prompt() no puede enmascarar una contrasena.',
    items: nativos.map((n) => 'index.html:' + String(n.ln).padEnd(6) + n.tipo + '()'),
    resumen: Object.entries(porTipo).map(([k, v]) => k + '×' + v).join('  '),
  });
}

// ─── 4. Modales sin role="dialog" / aria-modal ──────────────────────────────────
// Un overlay se detecta por FORMA, no por una lista de ids: una lista se queda vieja en
// cuanto alguien agrega un modal. Cuenta como overlay si trae position:fixed + inset:0
// inline, o si su clase contiene "overlay" (el dialogo nuevo lo hace desde CSS).
const overlays = [];
for (const m of html.matchAll(/<div\s+([^>]*id="([^"]+)"[^>]*)>/g)) {
  const attrs = m[1];
  const fijoInline = /position:\s*fixed/.test(attrs) && /inset:\s*0/.test(attrs);
  const claseOverlay = /class="[^"]*overlay/.test(attrs);
  if (!fijoInline && !claseOverlay) continue;
  const id = m[2];
  if (id === 'toast') continue;
  // ¿Hay role="dialog" + aria-modal dentro de los siguientes 600 chars?
  const cerca = html.slice(m.index, m.index + 600);
  const tieneRole = /role="dialog"/.test(cerca);
  const tieneModal = /aria-modal="true"/.test(cerca);
  if (!tieneRole || !tieneModal) {
    overlays.push({ ln: linea(m.index), id, falta: [!tieneRole && 'role="dialog"', !tieneModal && 'aria-modal'].filter(Boolean).join(' + ') });
  }
}
if (overlays.length) {
  fallos.push({
    regla: 'modales',
    msg: overlays.length + ' overlay(s) que no se anuncian como modal. El Tab se va por detras.',
    items: overlays.map((o) => 'index.html:' + String(o.ln).padEnd(6) + o.id.padEnd(22) + 'falta ' + o.falta),
  });
}

// ─── 4b. Modales que no caben con el teclado abierto ────────────────────────────
// Que un modal DECLARE role="dialog" no significa que se pueda USAR. Al enfocar un campo en
// un telefono, el teclado se come ~55% del viewport: si el dialogo no tiene max-height y su
// overlay no scrollea, el boton de confirmar queda fuera de la pantalla y no hay forma de
// llegar a el. Le paso al dialogo de la contrasena de admin, escrito para "arreglar la a11y".
const sinAltura = [];
{
  // Contenedores de dialogo: el elemento con role="dialog" (o .dlg), y su overlay.
  const bloques = [];
  for (const r of css.match(/[^{}]+\{[^}]*\}/g) || []) {
    // El "selector" que captura el regex arrastra los comentarios previos. Fuera.
    const sel = r.split('{')[0].replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/\s+/g, ' ');
    if (/overlay/.test(sel) || /^\.dlg$/.test(sel)) bloques.push({ sel, r });
  }
  const overlayCss = bloques.find((b) => /overlay/.test(b.sel) && !/hidden/.test(b.sel));
  const cajaCss = bloques.find((b) => /^\.dlg$/.test(b.sel));
  if (overlayCss && !/overflow-y:\s*auto|overflow:\s*auto/.test(overlayCss.r)) {
    sinAltura.push(overlayCss.sel + ' no scrollea (falta overflow-y: auto)');
  }
  if (cajaCss && !/max-height/.test(cajaCss.r)) {
    sinAltura.push(cajaCss.sel + ' no limita su altura (falta max-height)');
  }
  // Los modales inline deben declarar max-height ellos mismos.
  for (const m of html.matchAll(/<div\s+[^>]*id="(modal-[^"]+)"[^>]*style="([^"]*)"/g)) {
    const attrs = m[2];
    if (!/position:\s*fixed/.test(attrs)) continue;
    const cerca = html.slice(m.index, m.index + 700);
    if (!/max-height|overflow-y:\s*auto/.test(cerca)) sinAltura.push(m[1] + ' sin max-height ni scroll');
  }
}
if (sinAltura.length) {
  fallos.push({
    regla: 'modal-sin-scroll',
    msg: 'Con el teclado abierto en un telefono, el boton de confirmar queda inalcanzable.',
    items: sinAltura,
  });
}

// ─── 5. Escape ──────────────────────────────────────────────────────────────────
if (!/['"]Escape['"]/.test(codigo)) {
  fallos.push({ regla: 'escape', msg: 'Ningun manejo de Escape. Un modal sin Escape es una trampa de teclado.' });
}

// ─── 6. El toast no puede truncarse ─────────────────────────────────────────────
const reglaToast = (css.match(/#toast\s*\{[^}]*\}/) || [])[0] || '';
if (!reglaToast) fallos.push({ regla: 'toast', msg: 'No se encontro la regla #toast' });
else {
  const problemas = [];
  if (/white-space:\s*nowrap/.test(reglaToast)) problemas.push('white-space: nowrap');
  if (!/max-width/.test(reglaToast)) problemas.push('sin max-width');
  if (problemas.length) {
    fallos.push({
      regla: 'toast',
      msg: 'El toast se trunca (' + problemas.join(' + ') + '). Es el unico canal de feedback de la app.',
    });
  }
}

// ─── 7. Doble envio en acciones que CREAN ───────────────────────────────────────
// Se senala a la funcion que ESCRIBE, no al handler que la invoca. Dos errores que este
// script cometio la primera vez que corrio, y que quedan aqui escritos para nadie los repita:
//  · `\.add\(` tambien matchea `classList.add(`  -> falsos positivos (go, confirmarFirma).
//  · Seguir un salto desde el onclick arrastra media app -> `cerrarOT` y `nuevaOT`, que no
//    crean nada. La funcion correcta es la MAS INTERNA que contiene el `collection(...).add(`.
const CREA_DOC = /collection\([^)]*\)\s*\.add\(/g;

// Rutas que crean documentos SIN que un boton las dispare. Cada una con su razon.
const SIN_BOTON = {
  _sincronizarPausadaFirebase: 'sincronizacion en segundo plano de una OT pausada; no la dispara un boton',
  cargarCadenasApp: 'migracion de datos al cargar la app; no la dispara un boton',
  sincronizarOTsPendientes: 'cola de reintento; su .add() es solo la ruta legacy de OTs sin clientId',
  guardarYEnviarPDF: 'la llama cerrarOT despues del write-ahead; el boton ya no existe en pantalla',
};

// Mapa de funciones con sus limites, para hallar la mas interna.
const fns = [];
for (const m of html.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
  const abre = html.indexOf('{', m.index);
  if (abre < 0) continue;
  let n = 0, fin = -1;
  for (let j = abre; j < html.length; j++) {
    if (html[j] === '{') n++;
    else if (html[j] === '}') { n--; if (!n) { fin = j; break; } }
  }
  if (fin > 0) fns.push({ nombre: m[1], ini: m.index, fin });
}

const sinGuarda = [];
for (const m of html.matchAll(CREA_DOC)) {
  const cont = fns.filter((f) => m.index > f.ini && m.index < f.fin).sort((a, b) => b.ini - a.ini)[0];
  if (!cont) continue;
  if (SIN_BOTON[cont.nombre]) continue;
  const cuerpo = html.slice(cont.ini, cont.fin);
  // Tres formas validas de guarda: deshabilitar el boton directamente, _bloquear(btn) cuando
  // el boton tiene id estable, o _ocupado()/_tomar() cuando lo creo el JS y no tiene id.
  if (/disabled|_bloquear\(|_ocupado\(/.test(cuerpo)) continue;
  if (!sinGuarda.some((s) => s.nombre === cont.nombre)) sinGuarda.push({ nombre: cont.nombre, ln: linea(m.index) });
}
if (sinGuarda.length) {
  fallos.push({
    regla: 'doble-envio',
    msg: sinGuarda.length + ' funcion(es) que CREAN un documento sin deshabilitar su boton. Doble toque = duplicado.',
    items: sinGuarda.map((s) => 'index.html:' + String(s.ln).padEnd(6) + s.nombre + '()'),
  });
}

// `sinComentarios` preserva la longitud (cada char borrado se sustituye por un espacio),
// asi que los indices de `fns`, calculados sobre `html`, valen tambien sobre `codigo`.
const cuerpoLimpio = (f) => codigo.slice(f.ini, f.fin);

// ─── 8. Escrituras a Firestore sin timeout dentro de una accion que bloquea ─────
// El comentario de _conTimeout, escrito antes que este check, ya lo decia:
//   "el SDK de Firestore, con mala senal y sin persistencia, deja el add()/set()
//    colgado sin resolver ni rechazar"
// Un await que no vuelve nunca deja el `finally` sin correr. Y el `finally` es donde
// vive soltar(). El boton queda deshabilitado hasta que el usuario recargue la app,
// sin un solo mensaje que se lo explique. Es peor que el duplicado que la guarda evita.
const sinTimeout = [];
for (const f of fns) {
  const cuerpo = cuerpoLimpio(f);
  if (!/_bloquear\(|_tomar\(/.test(cuerpo)) continue;
  for (const m of cuerpo.matchAll(/await\s+[^;\n]*?\.collection\(/g)) {
    if (/_conTimeout\(/.test(m[0])) continue;
    sinTimeout.push({ fn: f.nombre, ln: linea(f.ini + m.index), frag: m[0].trim().slice(0, 52) });
  }
}
if (sinTimeout.length) {
  fallos.push({
    regla: 'await-sin-timeout',
    msg: sinTimeout.length + ' escritura(s) a Firestore sin _conTimeout dentro de una accion que bloquea su boton.',
    items: sinTimeout.map((s) => 'index.html:' + String(s.ln).padEnd(6) + s.fn.padEnd(28) + s.frag),
  });
}

// ─── 9. El guardia de las guardas ───────────────────────────────────────────────
// La regla 8 recorre sitios. Esta es la red: aunque alguien agregue manana un await sin
// timeout, el boton se libera solo. "Un check con una lista no verifica: repite."
for (const nombre of ['_bloquear', '_tomar']) {
  const f = fns.find((x) => x.nombre === nombre);
  if (!f) { fallos.push({ regla: 'guardia-bloqueo', msg: 'No existe ' + nombre + '()' }); continue; }
  const cuerpo = cuerpoLimpio(f);
  if (!/setTimeout\(/.test(cuerpo) || !/_MAX_BLOQUEO_MS/.test(cuerpo)) {
    fallos.push({
      regla: 'guardia-bloqueo',
      ln: linea(f.ini),
      msg: nombre + '() no tiene guardia de tiempo. Si el await nunca vuelve, el boton muere para siempre.',
    });
  }
}

// ─── 10. Quien lee Firestore y se calla, firma el silencio ──────────────────────
// Esta regla nacio como "cargador mudo" y tenia una exclusion en su primera linea:
//
//     if (!/innerHTML|appendChild/.test(cuerpo)) continue;   // <- exigia PINTAR una lista
//
// Nueve funciones leen Firestore en su propio cuerpo y no le dicen nada al usuario. Las
// NUEVE eran invisibles para esa exclusion, incluida cargarPausadasSupervisor — que empieza
// por `cargar` y cuyo catch estaba literalmente vacio — porque delega el pintado en un
// helper. Y verPDFById: el tecnico tocaba "Ver PDF" sin senal y no pasaba absolutamente nada.
//
// Leccion, DECIMA forma. La novena decia "el punto ciego esta en lo que el check EXCLUYE".
// Esta regla se escribio el mismo dia que esa frase, y excluia por forma sintactica.
// Peor: la exclusion tenia tres parrafos de comentario justificandola. Un comentario que
// defiende una exclusion no es evidencia de que la exclusion sea correcta. Es solo prosa.
//
// AHORA la regla no excluye: clasifica. Quien lee Firestore en su propio cuerpo y ATRAPA el
// error tiene tres salidas legitimas, y ninguna es callarse por descuido:
//
//   1. AVISAR      — _error(), toast(), _listaConError()...
//   2. RELANZAR    — `throw`: el error sube y lo maneja quien llame (asi trabaja
//                    _fusionarDuplicadosCadenas, que no atrapa nada y hace bien).
//   3. FIRMAR      — un comentario `SILENCIO-FIRMADO: <razon>` DENTRO del catch.
//
// La firma va en el sitio del silencio, no en una lista dentro de este script. Una lista
// aqui se desincronizaria del codigo; un comentario dentro del catch se borra con el catch.
// Y obliga a escribir la consecuencia: "el supervisor no vera el PDF" es una frase que
// cuesta teclear, y ese coste es el punto.
//
// Se mira SOLO el catch del propio cuerpo. Un catch anidado en un callback ("Error
// eliminando OT") no dice nada sobre el fallo de la LECTURA: contarlo dejaba pasar a
// cargarOTsSupervisor, uno de los tres culpables originales.
//
// ALCANCE declarado: esto no prueba que el mensaje sea bueno ni que la razon firmada sea
// cierta. Prueba que alguien tuvo que escribirla.
function cierreDe(s, abre) {
  let n = 0;
  for (let j = abre; j < s.length; j++) {
    if (s[j] === '{') n++;
    else if (s[j] === '}') { n--; if (!n) return j; }
  }
  return -1;
}
// Rangos de las funciones ANIDADAS (callbacks, handlers) dentro de un cuerpo.
function rangosAnidados(cuerpo, abreCuerpo) {
  const rangos = [];
  const re = /(?:function\s*[\w$]*\s*\([^)]*\)|\([^)]*\)\s*=>|[\w$]+\s*=>)\s*\{/g;
  let m;
  while ((m = re.exec(cuerpo))) {
    const abre = m.index + m[0].length - 1;
    if (abre === abreCuerpo) continue;           // es la propia funcion, no un callback
    const fin = cierreDe(cuerpo, abre);
    if (fin > 0) rangos.push([abre, fin]);
  }
  return rangos;
}
const dentroDe = (rangos, i) => rangos.some(([a, b]) => i > a && i < b);

const LEE_FIRESTORE = /\.collection\([^)]*\)[\s\S]{0,300}?\.(get|onSnapshot)\(/g;
// `_error(` entro aqui el dia que nacio: al migrar los catch de `toast('Error…')` a
// `_error(accion, e)`, esta regla se puso roja de golpe en seis cargadores que SI avisaban.
// Un helper nuevo ciega a la regla vieja que no lo conoce. Que se pusiera roja es la prueba
// de que la regla sirve; si hubiera seguido verde, no habriamos sabido que dejo de mirar.
const AVISA = /_listaConError\(|_error\(|toast\(|_avisar\(|innerHTML/;
const RELANZA = /\bthrow\b/;
// `\s*` saltaria el salto de linea y una firma VACIA quedaria validada por el `//` de la
// linea siguiente. La firma tiene que tener texto EN SU PROPIA linea.
// Y `\S` tampoco basta: en  /* SILENCIO-FIRMADO: */  el `*/` valida la firma vacia.
const FIRMA = /SILENCIO-FIRMADO:[ 	]*[\wÀ-ÿ]/;

// `codigo` sale de sinComentarios(), que conserva la LONGITUD: cada comentario se sustituye
// por espacios. Por eso un indice de `codigo` vale igual en `html`, y podemos buscar la firma
// (que es un comentario, y por tanto invisible en `codigo`) en el mismo tramo del texto crudo.
const mudos = [];
const pintaSinRed = [];
for (const f of fns) {
  const cuerpo = cuerpoLimpio(f);
  const abreCuerpo = cuerpo.indexOf('{');
  if (abreCuerpo < 0) continue;
  const anidadas = rangosAnidados(cuerpo, abreCuerpo);

  // ¿lee Firestore en su PROPIO cuerpo?
  let leeAqui = false;
  for (const m of cuerpo.matchAll(LEE_FIRESTORE)) {
    if (!dentroDe(anidadas, m.index)) { leeAqui = true; break; }
  }
  if (!leeAqui) continue;

  // El catch que importa es el que puede TRAGARSE LA LECTURA, no cualquier catch del cuerpo.
  // La primera version culpaba a los siete `try { doc.addImage(...) } catch(e){}` de
  // generarPDFCotizacionGuardada, que no tienen nada que ver con Firestore. Un check que
  // acusa de mas se desactiva; hay que emparejar cada catch con SU try.
  const propios = [];
  for (const m of cuerpo.matchAll(/\btry\s*\{/g)) {
    if (dentroDe(anidadas, m.index)) continue;
    const abreTry = m.index + m[0].length - 1;
    const finTry = cierreDe(cuerpo, abreTry);
    if (finTry < 0) continue;

    let envuelve = false;
    for (const r of cuerpo.slice(abreTry, finTry + 1).matchAll(LEE_FIRESTORE)) {
      if (!dentroDe(anidadas, abreTry + r.index)) { envuelve = true; break; }
    }
    if (!envuelve) continue;

    const cm = cuerpo.slice(finTry + 1).match(/^\s*catch\s*\([^)]*\)\s*\{/);
    if (!cm) continue;                       // try/finally sin catch: el error sube. Correcto.
    const abre = finTry + cm[0].length;      // indice de la '{' del catch
    const fin = cierreDe(cuerpo, abre);
    if (fin > 0) propios.push({
      limpio: cuerpo.slice(abre, fin + 1),
      crudo: html.slice(f.ini + abre, f.ini + fin + 1),
      ln: linea(f.ini + abre),
    });
  }

  // Sin catch: el error SUBE. Eso no es callarse. Pero si ademas pinta la pantalla, un rechazo
  // sin manejar deja el "Cargando…" para siempre y nadie se entera: eso si es mentir.
  if (!propios.length) {
    if (/innerHTML|appendChild/.test(cuerpo)) {
      pintaSinRed.push({ fn: f.nombre, ln: linea(f.ini) });
    }
    continue;
  }

  propios.forEach((c) => {
    if (AVISA.test(c.limpio) || RELANZA.test(c.limpio)) return;
    if (FIRMA.test(c.crudo)) return;
    mudos.push({ fn: f.nombre, ln: c.ln, por: 'el catch se traga el error' });
  });
}
if (mudos.length) {
  fallos.push({
    regla: 'silencio-sin-firma',
    msg: mudos.length + ' catch(es) que leen Firestore, se tragan el error y no firman por que.',
    items: mudos.map((m) => 'index.html:' + String(m.ln).padEnd(6) + m.fn.padEnd(30) + m.por),
    ayuda: 'Avisa (_error), relanza (throw), o escribe dentro del catch:  // SILENCIO-FIRMADO: <consecuencia>',
  });
}
if (pintaSinRed.length) {
  fallos.push({
    regla: 'cargador-sin-catch',
    msg: pintaSinRed.length + ' cargador(es) que pintan la pantalla y leen Firestore sin catch. Un rechazo deja "Cargando…" para siempre.',
    items: pintaSinRed.map((m) => 'index.html:' + String(m.ln).padEnd(6) + m.fn),
  });
}

// ─── 11. El toast: duracion proporcional y descartable ──────────────────────────
// 2500ms fijos para 117 mensajes de 6 a 73 caracteres. La frase que sostiene toda la
// confianza offline de la app, "OT guardada. Se subira sola al mejorar la senal", necesita
// 4133ms para leerse. Ya se habia truncado por ancho una vez. Dos veces la misma causa:
// una constante elegida sin mirar el contenido que iba a contener.
{
  const f = fns.find((x) => x.nombre === 'toast');
  if (!f) fallos.push({ regla: 'toast-tiempo', msg: 'No existe toast()' });
  else {
    const cuerpo = cuerpoLimpio(f);
    const problemas = [];
    if (!/_toastDuracion\(/.test(cuerpo)) problemas.push('la duracion no depende del largo del mensaje');
    if (!/addEventListener\(\s*['"]click['"]/.test(codigo)) problemas.push('no se puede cerrar tocandolo (WCAG 2.2.1)');
    // Al hacer la duracion proporcional (hasta 8,3s) se triplico el tiempo que el toast pasa
    // encima de #pending-bar, que es tappable y esta por debajo en el z-index.
    if (!/_toastAbajo\(/.test(cuerpo)) problemas.push('se posa encima de las barras de estado tappables');
    if (problemas.length) {
      fallos.push({ regla: 'toast-tiempo', ln: linea(f.ini), msg: problemas.join(' · '), });
    }
  }
}

// ─── 12. Una sola voz para los estados vacios ───────────────────────────────────
// Habia cinco maneras de decir "no hay OTs" y dos de decir "no hay sucursales". Para un
// tecnico apurado, dos nombres para una cosa son dos cosas. Y de ~15 estados vacios, solo
// 2 enseñaban que hacer. Todos pasan ahora por _vacio(mensaje, ayuda).
const VACIO_TXT = /(no hay |aún no hay |aun no hay |sin \w+ (aún|aun|registrad))/i;
const vaciosSueltos = [];
codigo.split(/\r?\n/).forEach((l, i) => {
  if (!/(innerHTML|textContent)\s*=/.test(l)) return;
  if (/_vacio\(/.test(l)) return;                 // ya pasa por el helper
  if (!VACIO_TXT.test(l)) return;
  vaciosSueltos.push({ ln: i + 1, frag: l.trim().slice(0, 74) });
});
if (vaciosSueltos.length) {
  fallos.push({
    regla: 'estados-vacios',
    msg: vaciosSueltos.length + ' estado(s) vacio(s) escritos a mano. Deben pasar por _vacio(mensaje, ayuda).',
    items: vaciosSueltos.map((v) => 'index.html:' + String(v.ln).padEnd(6) + v.frag),
  });
}

// ─── 13. Un solo boton de peso primario por pantalla ────────────────────────────
// DESIGN.md §4: "maximo un boton primario por pantalla. Todo lo demas secundario, ghost o
// text-link." Nunca lo verifico nadie. Peso primario = relleno solido saturado + texto blanco.
//
// Dos distinciones que la regla NECESITA para no acusar a quien no debe:
//  · los paneles de pestana (#panel-*) son mutuamente excluyentes: adminTab() muestra uno.
//  · los modales y overlays viven en su propio contexto visual.
// Sin ellas, `s-admin` (un primario por pestana) y `s-cotizacion` (un verde dentro de un
// modal) saldrian marcados, y no lo estan.
const PESO_PRIMARIO = /class="[^"]*\b(btn-primary|btn-verde|btn-peligro|btn-whatsapp)\b/;
function cierraDiv(s, i) {
  let d = 0;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = i;
  let m;
  while ((m = re.exec(s))) {
    if (m[0] === '</div>') { d--; if (d === 0) return m.index; }
    else d++;
  }
  return s.length;
}
const jerarquia = [];
for (const p of html.matchAll(/<div class="screen"[^>]*id="([^"]+)"/g)) {
  const trozo = html.slice(p.index, cierraDiv(html, p.index));
  const excluir = [];
  for (const m of trozo.matchAll(/<div[^>]*(id="modal-[^"]*"|class="[^"]*(overlay|dlg)[^"]*")/g)) {
    excluir.push([m.index, cierraDiv(trozo, m.index)]);
  }
  const paneles = [];
  for (const m of trozo.matchAll(/<div[^>]*id="(panel-[^"]+)"/g)) {
    paneles.push({ id: m[1], ini: m.index, fin: cierraDiv(trozo, m.index) });
  }
  const grupos = { raiz: [] };
  paneles.forEach((x) => (grupos[x.id] = []));
  for (const m of trozo.matchAll(/<button[^>]*>/g)) {
    if (!PESO_PRIMARIO.test(m[0])) continue;
    if (excluir.some(([a, b]) => m.index > a && m.index < b)) continue;
    const pan = paneles.find((x) => m.index > x.ini && m.index < x.fin);
    const et = ((trozo.slice(m.index).match(/<button[^>]*>([^<]*)/) || [])[1] || '').trim().slice(0, 26);
    grupos[pan ? pan.id : 'raiz'].push(et);
  }
  // visibles a la vez = los de la raiz + los del panel mas cargado
  const peor = Object.entries(grupos).filter(([k]) => k !== 'raiz').sort((a, b) => b[1].length - a[1].length)[0];
  const total = grupos.raiz.length + (peor ? peor[1].length : 0);
  if (total > 1) {
    const cuales = grupos.raiz.concat(peor ? peor[1] : []);
    jerarquia.push({ id: p[1], total, cuales: cuales.join('  |  ') });
  }
}
if (jerarquia.length) {
  fallos.push({
    regla: 'jerarquia-botones',
    msg: jerarquia.length + ' pantalla(s) con mas de un boton de peso primario visible a la vez (DESIGN.md §4).',
    items: jerarquia.map((j) => j.id.padEnd(16) + j.total + ' -> ' + j.cuales),
  });
}

// ─── 14. Un cargador dice que esta trabajando ───────────────────────────────────
// Una lista tiene TRES estados. `_vacio()` y `_listaConError()` cubrian dos. El tercero,
// "estoy trabajando", faltaba en nueve de quince cargadores: un panel en blanco no dice si
// carga, si esta vacio, o si la app se colgo.
//
// EXENTOS, cada uno con su razon. No es una lista de conveniencia: son los tres casos donde
// un skeleton seria peor que no ponerlo.
const SIN_SKELETON = {
  cargarUsuariosApp: 'cache-first: pinta la lista real de inmediato y el markup ya trae un skeleton estatico; un _cargando() parpadearia sobre datos ya visibles',
  _renderPausadasEnCadena: 'pinta desde localStorage, es instantaneo; su lectura de Firestore solo trae los logos',
  descargarExcelVentas: 'exporta un archivo, no pinta una lista en pantalla',
  abrirCotizacion: 'rellena un formulario, no una lista',
};
const sinCarga = [];
for (const f of fns) {
  const cuerpo = cuerpoLimpio(f);
  if (!/innerHTML|appendChild/.test(cuerpo)) continue;
  const abreCuerpo = cuerpo.indexOf('{');
  if (abreCuerpo < 0) continue;
  const anidadas = rangosAnidados(cuerpo, abreCuerpo);
  let leeAqui = false;
  for (const m of cuerpo.matchAll(new RegExp(LEE_FIRESTORE.source, 'g'))) {
    if (!dentroDe(anidadas, m.index)) { leeAqui = true; break; }
  }
  if (!leeAqui) continue;
  if (SIN_SKELETON[f.nombre]) continue;
  if (!/_cargando\(/.test(cuerpo)) sinCarga.push({ fn: f.nombre, ln: linea(f.ini), por: 'no muestra estado de carga' });
  else if (!/_cargado\(/.test(cuerpo)) sinCarga.push({ fn: f.nombre, ln: linea(f.ini), por: '_cargando() sin su _cargado(): el aria-busy se queda pegado' });
}
if (sinCarga.length) {
  fallos.push({
    regla: 'sin-estado-de-carga',
    msg: sinCarga.length + ' cargador(es) que no dicen que estan trabajando. Un panel en blanco no es un estado.',
    items: sinCarga.map((s) => 'index.html:' + String(s.ln).padEnd(6) + s.fn.padEnd(30) + s.por),
  });
}

// ─── 15. _cargando() no borra lo que ya estaba ──────────────────────────────────
// `cargarTecnicosAdmin()` se llama despues de guardarTecnico y de eliminarTecnico;
// `cargarCadenasAdmin()` cinco veces mas. Doce sitios en total. Sin esta guarda, cada
// mutacion borraba la lista y pintaba tres esqueletos grises antes de repintarla.
// La primera version de esta regla buscaba las PALABRAS `children.length` y `estado-vacio`
// en el cuerpo. Un mutante que borraba el `return` las dejaba intactas y sobrevivio: la regla
// comprobaba que el guardia estuviera ESCRITO, no que hiciera algo. Ahora se exige el orden:
//     children.length  ...  return  ...  innerHTML
// Si no hay un `return` entre la cuenta de hijos y la escritura, no hay guardia.
{
  const f = fns.find((x) => x.nombre === '_cargando');
  if (!f) fallos.push({ regla: 'skeleton-parpadeo', msg: 'No existe _cargando()' });
  else {
    const cuerpo = cuerpoLimpio(f);
    const iHijos = cuerpo.indexOf('children.length');
    const iEscribe = cuerpo.indexOf('.innerHTML');
    const iVuelve = iHijos < 0 ? -1 : cuerpo.indexOf('return', iHijos);
    const bien = iHijos >= 0 && iEscribe > 0 && iVuelve > iHijos && iVuelve < iEscribe
              && /estado-vacio|lista-error/.test(cuerpo);
    if (!bien) {
      fallos.push({
        regla: 'skeleton-parpadeo',
        ln: linea(f.ini),
        msg: '_cargando() reemplaza contenido existente. Un skeleton sobre datos correctos es un parpadeo, no un estado.',
      });
    }
  }
}

// ─── 16. La voz del error ───────────────────────────────────────────────────────
// `toast('Error: ' + e.message)` le muestra al tecnico el string que Firebase le devolvio al
// SDK. Y `toast('Error')` a secas no dice que paso ni que hacer: DESIGN.md §7 promete que la
// app "nunca te deja con dudas sobre que paso".
const errosFeos = [];
for (const m of codigo.matchAll(/toast\([^;]*e\.message/g)) {
  errosFeos.push({ ln: linea(m.index), frag: m[0].trim().slice(0, 56), por: 'expone el mensaje interno del SDK' });
}
// Un error visible que no pasa por _error() ni ofrece salida.
const RECUPERA = /\b(reintenta|inténtalo|intenta|revisa|verifica|espera|vuelve|pídele|usa|se reintentará)\b/i;
for (const m of codigo.matchAll(/toast\('((?:[^'\\]|\\.)*)'\)/g)) {
  const t = m[1];
  if (!/^(Error|Fall)/i.test(t)) continue;
  if (RECUPERA.test(t)) continue;
  errosFeos.push({ ln: linea(m.index), frag: JSON.stringify(t.slice(0, 44)), por: 'empieza por "Error" y no dice que hacer' });
}
if (errosFeos.length) {
  fallos.push({
    regla: 'voz-del-error',
    msg: errosFeos.length + ' mensaje(s) de error que no ayudan. Usa _error(accion, e, queHacer).',
    items: errosFeos.map((e) => 'index.html:' + String(e.ln).padEnd(6) + e.frag.padEnd(58) + e.por),
  });
}

// ─── 17. Lo que se escribe en el DOM tambien se anuncia ─────────────────────────
// Un administrador con lector de pantalla toca "Personal", falla la red, y no oye nada:
// la app pinta un recuadro ambar con un boton "Reintentar" que el no sabe que existe.
{
  const problemas = [];
  if (!/id="anuncios"/.test(html) || !/id="anuncios"[^>]*aria-live/.test(html)) {
    problemas.push('no existe la region #anuncios con aria-live');
  }
  for (const nombre of ['_listaConError', '_mostrarErrorPausadasSup']) {
    const f = fns.find((x) => x.nombre === nombre);
    if (!f) { problemas.push('no existe ' + nombre + '()'); continue; }
    if (!/_anunciar\(/.test(cuerpoLimpio(f))) problemas.push(nombre + '() escribe un error en el DOM y no lo anuncia');
  }
  if (problemas.length) {
    fallos.push({ regla: 'errores-no-anunciados', msg: 'El error es visible pero no perceptible.', items: problemas });
  }
}

// ─── 18. Esperar a Firebase tiene un final ──────────────────────────────────────
// Cinco pantallas reintentaban asi: si Firebase no esta listo, volver a intentarlo en 800ms.
// Sin limite y sin decir nada. Si Firebase nunca inicializa —arranque en frio sin senal, un
// bloqueador de scripts, el CDN caido— el panel del admin reintenta cada 800ms para siempre,
// en blanco. El tecnico mira una pantalla vacia que por dentro esta muy ocupada.
//
// Un reintento sin limite no es paciencia: es una espera que nadie declaro. Ahora todos pasan
// por _esperandoFirebase(), que cuenta hasta _MAX_ESPERAS_FIREBASE y entonces dice la verdad.
{
  const helper = fns.find((f) => f.nombre === '_esperandoFirebase');
  const problemas = [];
  if (!helper) problemas.push('no existe _esperandoFirebase()');
  else {
    const cuerpo = cuerpoLimpio(helper);
    if (!/_MAX_ESPERAS_FIREBASE/.test(cuerpo)) problemas.push('_esperandoFirebase() no tiene tope de intentos');
    if (!/_error\(|toast\(/.test(cuerpo)) problemas.push('_esperandoFirebase() se rinde sin decir nada');
  }
  // Cualquier reintento crudo, fuera del helper. Se busca en `codigo` (sin comentarios): la
  // nota que EXPLICA el patron viejo no puede contar como un uso. Ya paso una vez.
  for (const m of codigo.matchAll(/_firebaseReady[^\n]*setTimeout/g)) {
    if (helper && m.index > helper.ini && m.index < helper.fin) continue;
    problemas.push('index.html:' + linea(m.index) + '  reintento sin tope: usa _esperandoFirebase(clave, fn)');
  }
  if (problemas.length) {
    fallos.push({
      regla: 'espera-sin-final',
      msg: 'Un reintento sin limite deja al usuario mirando una pantalla en blanco para siempre.',
      items: problemas,
    });
  }
}

// ─── 19. Todo control de formulario tiene nombre accesible ──────────────────────
// 33 controles (25 input, 5 select, 3 textarea) y CERO con nombre asociado: ni <label for>,
// ni input envuelto, ni aria-label, ni title. Los <label> existian —"PIN (4 numeros)",
// "Nombre completo"— pero eran texto suelto al lado, sin relacion programatica con el campo.
//
// Un lector de pantalla (Pedro, en su telefono) enfoca el PIN y oye el placeholder "Ej: 1234",
// no "PIN, 4 numeros". Un placeholder NO es un nombre: desaparece al escribir, tiene bajo
// contraste, y no todos los lectores lo anuncian. WCAG 1.3.1 y 4.1.2, nivel A — mas basico que
// casi todo lo demas de este archivo, y sobrevivio a cinco criticas porque NINGUNA regla lo
// miraba. La tabla de deuda decia "aria-label en los 18 botones": los botones recibieron nombre,
// los campos nunca.
//
// El nombre puede venir por cualquier via valida: <label for>, envolver el control, aria-label,
// aria-labelledby, o title. La regla no exige UNA forma; exige que EXISTA alguna.
{
  const labelsFor = new Set();
  for (const m of html.matchAll(/<label[^>]*\bfor="([^"]*)"/g)) labelsFor.add(m[1]);
  // controles envueltos: <label ...> ... <input ...> ... </label>
  const envueltos = new Set();
  for (const m of html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)) {
    for (const c of m[1].matchAll(/\bid="([^"]*)"/g)) envueltos.add(c[1]);
  }
  const SIN_NOMBRE_OK = /type="(hidden|submit|button|image|reset)"/;
  const sinNombre = [];
  for (const m of html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
    const attrs = m[2];
    if (SIN_NOMBRE_OK.test(attrs)) continue;
    const id = (attrs.match(/\bid="([^"]*)"/) || [])[1] || '';
    const tieneNombre =
      /aria-label(ledby)?="[^"]*\S[^"]*"/.test(attrs) ||   // aria-label / aria-labelledby con contenido
      /\btitle="[^"]*\S[^"]*"/.test(attrs) ||               // title (debil, pero cuenta)
      (id && labelsFor.has(id)) ||                          // <label for="id">
      (id && envueltos.has(id));                            // <label>…<control id>…</label>
    if (!tieneNombre) {
      const ph = (attrs.match(/placeholder="([^"]*)"/) || [])[1] || '';
      sinNombre.push('index.html:' + String(linea(m.index)).padEnd(6) + m[1] +
        (id ? ' #' + id : ' (sin id)') + (ph ? '   placeholder="' + ph + '"' : ''));
    }
  }
  if (sinNombre.length) {
    fallos.push({
      regla: 'campo-sin-nombre',
      msg: sinNombre.length + ' control(es) de formulario sin nombre accesible (WCAG 1.3.1 / 4.1.2, nivel A).',
      items: sinNombre,
      ayuda: 'Anade <label for="id">, o aria-label, o aria-labelledby. Un placeholder no es un nombre.',
    });
  }
}

// ─── 20. Un modal se abre por la puerta que instala su comportamiento ───────────
// aria-modal="true" es una PROMESA al lector de pantalla: el resto de la pagina esta inerte.
// _modalMostrar() la cumple: guarda el foco, atrapa el tab, engancha Escape, enfoca el primero.
// Pero modal-reasignar se abria por DOS puertas —_modalMostrar (bien) y un `modal.style.display
// = 'flex'` crudo en aceptarCotizacionPrevia (mal)— y por la segunda no se instalaba nada: el
// tab se escapaba a la pagina de detras y Escape no cerraba. La promesa del atributo, mentira.
//
// La regla 4 comprueba que el markup DECLARE role="dialog"+aria-modal. Y lo declara: verde. No
// puede ver que UNA de las dos puertas no cablea el comportamiento. Igual que la regla 10: el
// atributo presente, el comportamiento condicional. Esta regla mira el cableado, no el atributo.
{
  // ids de los contenedores con role="dialog" y su overlay (el id del div que se muestra).
  // El overlay es el elemento con id que ENVUELVE al role="dialog" (o el propio, si lo lleva).
  const dialogIds = new Set();
  // overlay pattern: <div id="modal-x" ...> ... <div role="dialog"
  for (const m of html.matchAll(/<div\s+id="([^"]*)"[^>]*>\s*<div[^>]*role="dialog"/g)) dialogIds.add(m[1]);
  // tambien el caso donde el propio elemento con id lleva role="dialog"
  for (const m of html.matchAll(/<div\s+id="([^"]*)"[^>]*role="dialog"/g)) dialogIds.add(m[1]);

  const crudos = [];
  // display de un overlay de dialogo puesto a 'flex'/'block' fuera de _modalMostrar.
  const helper = fns.find((f) => f.nombre === '_modalMostrar');
  for (const m of codigo.matchAll(/getElementById\(['"]([^'"]+)['"]\)[\s\S]{0,40}?\.style\.display\s*=\s*['"](flex|block)['"]/g)) {
    if (!dialogIds.has(m[1])) continue;
    if (helper && m.index > helper.ini && m.index < helper.fin) continue;
    crudos.push('index.html:' + linea(m.index) + '  ' + m[1] + ' abierto a mano: usa _modalMostrar()');
  }
  // tambien: var modal = getElementById('modal-x'); ... modal.style.display = 'flex'
  for (const m of codigo.matchAll(/\b(\w+)\s*=\s*document\.getElementById\(['"]([^'"]+)['"]\)/g)) {
    if (!dialogIds.has(m[2])) continue;
    const varName = m[1];
    const re = new RegExp('\\b' + varName + '\\.style\\.display\\s*=\\s*[\'"](flex|block)[\'"]', 'g');
    let d;
    while ((d = re.exec(codigo))) {
      if (helper && d.index > helper.ini && d.index < helper.fin) continue;
      // evitar doble conteo con el patron directo de arriba
      crudos.push('index.html:' + linea(d.index) + '  ' + m[2] + ' (via ' + varName + ') abierto a mano: usa _modalMostrar()');
    }
  }
  if (crudos.length) {
    fallos.push({
      regla: 'modal-puerta-trasera',
      msg: crudos.length + ' modal(es) abiertos sin _modalMostrar: aria-modal promete inercia que no se instala.',
      items: [...new Set(crudos)],
      ayuda: 'Abre SIEMPRE por _modalMostrar(id, display, cerrar): instala foco, trampa de tab y Escape.',
    });
  }
}

// ─── Reporte ────────────────────────────────────────────────────────────────────
console.log('\n  Accesibilidad verificable — EMVAL\n');

if (!fallos.length) {
  console.log('  Viewport permite zoom · controles >= 16px · 0 dialogos nativos');
  console.log('  modales con role/aria-modal/Escape · toast que no se trunca · acciones sin doble envio');
  console.log('  awaits con timeout · guardas con guardia · cargadores que avisan');
  console.log('  toast proporcional, descartable y que no tapa las barras · una sola voz en los vacios');
  console.log('  un solo boton primario por pantalla · todo cargador dice que trabaja\n');
  process.exit(0);
}

fallos.forEach((f) => {
  console.log('  [' + f.regla + ']  ' + f.msg);
  if (f.resumen) console.log('     ' + f.resumen);
  if (f.detalle) console.log('     ' + f.detalle);
  if (f.items) f.items.slice(0, 22).forEach((i) => console.log('     ' + i));
  if (f.items && f.items.length > 22) console.log('     ... y ' + (f.items.length - 22) + ' mas');
  if (f.ln) console.log('     index.html:' + f.ln);
  console.log('');
});

console.log('  ' + fallos.length + ' categoria(s) con problemas.\n');
process.exit(1);
