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
 * LAS 6 REGLAS
 *  1. El viewport no puede desactivar el zoom (WCAG 2.1 SC 1.4.4, nivel AA).
 *     La app la usan tecnicos de tercera edad bajo sol directo. Ver DESIGN.md §1.
 *  2. Ningun control de formulario baja de 16px. Bajo 16px, iOS hace zoom al enfocar,
 *     y bajo el sol nadie lee 12px. Pedro usa el panel de admin TAMBIEN en su telefono.
 *  3. Cero dialogos nativos (confirm/prompt/alert). No se pueden estilar, bloquean el hilo,
 *     y prompt() NO puede enmascarar una contrasena: la de Pedro se veia en pantalla.
 *  4. Todo modal declara role="dialog" y aria-modal="true", o no es un modal: es un div
 *     encima de una pantalla que sigue siendo tabulable por detras.
 *  5. Existe manejo de Escape. Un modal sin Escape es una trampa de teclado.
 *  6. El toast no puede truncarse: es el unico canal de feedback de la app.
 *     Con white-space:nowrap y sin max-width, 6 de sus 99 mensajes se cortaban a 360px.
 *  7. Toda accion que CREA un documento y cuelga de un onclick debe deshabilitar su boton
 *     mientras escribe. Sin eso, un doble toque con mala senal duplica el documento.
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

// ─── Reporte ────────────────────────────────────────────────────────────────────
console.log('\n  Accesibilidad verificable — EMVAL\n');

if (!fallos.length) {
  console.log('  Viewport permite zoom · controles >= 16px · 0 dialogos nativos');
  console.log('  modales con role/aria-modal/Escape · toast que no se trunca · acciones sin doble envio\n');
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
