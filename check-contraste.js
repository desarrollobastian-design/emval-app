#!/usr/bin/env node
/**
 * check-contraste.js — Contraste WCAG AA de EMVAL. Sin dependencias.
 *
 *   node check-contraste.js
 *
 * CUATRO PARTES. Cada una nacio de que la anterior no bastaba.
 *
 *  1. PARES CURADOS: los que ni el escaneo ni la herencia pueden emparejar solos (el color
 *     de texto viene de una utilidad, del inline de un boton construido en JS, o de un
 *     export a Excel). Es una LISTA, y se declara como tal. Ver el aviso de abajo.
 *
 *  2. ESCANEO POR REGLA: cualquier `background: X; color: Y` DENTRO de una misma regla,
 *     atributo style= o fragmento JS. Sin lista.
 *
 *  3. HERENCIA POR SELECTOR: el padre pinta el fondo y el hijo el color, en reglas distintas
 *     (`.lista-error` + `.lista-error-titulo`). Sin lista.
 *
 *  4. SC 1.4.11 — NON-TEXT CONTRAST: el limite visual de un control o de un indicador de
 *     estado necesita 3:1 contra lo que lo rodea. Sin lista.
 *
 * POR QUE EXISTE LA PARTE 2:
 * Durante semanas este script salio en verde con 22 pares curados... y habia TRES fallos
 * reales fuera de esa lista, porque los pares que fallaban usaban hexes sueltos, no tokens:
 *   · blanco sobre #E74C3C (3.82:1) — el boton "No" del toggle preventivo del tecnico
 *   · #6B7280 sobre #E8ECF5 (4.09:1) — ese mismo toggle, sin responder
 *   · blanco sobre #27A06B (3.32:1) — la fila "Total ano" del Excel que lee el administrador
 *
 * POR QUE EXISTEN LAS PARTES 3 Y 4:
 * La cabecera de este archivo afirmaba, sobre los pares curados:
 *
 *     "pares que solo se ven leyendo el CSS por clases. Un escaner NO LOS PUEDE EMPAREJAR."
 *
 * Era FALSO, y esa falsedad sostuvo una lista de 22 entradas durante semanas. Un escaner si
 * puede: parsea las reglas, resuelve los selectores descendientes, y empareja. La parte 3
 * hace exactamente eso en 40 lineas, y encuentra 6 pares. Uno de ellos, `.lista-error`, se
 * escribio para ARREGLAR un bug y nadie lo estaba midiendo.
 *
 * Y la parte 4 cubre un criterio WCAG entero que este repo no miraba: el borde de todos los
 * controles estaba entre 1.05:1 y 1.55:1 contra la superficie que los rodea. Los puntos
 * vacios del PIN, la caja de fotos, el recuadro de firma, todos los inputs. La app se usa
 * bajo sol directo (DESIGN.md §1): el tecnico no podia ver donde estaba el control.
 *
 * > No es que la lista estuviera desactualizada. Es que se escribio una lista y se justifico
 * > con una imposibilidad que no era cierta. Antes de curar una lista, intenta la regla.
 *
 * Sale con codigo 1 si algun par baja de su minimo.
 * Los `tolerado` se reportan pero no rompen (decisiones de marca justificadas por escrito).
 */
const fs = require('fs');
const path = require('path');

const ARCHIVO = path.join(__dirname, 'index.html');

// --- WCAG 2.1 ---
//   normal  = texto por debajo de 24px, o de 18.66px en negrita
//   grande  = >= 24px, o >= 18.66px en negrita
//   grafico = iconos, bordes y controles (SC 1.4.11)
const MINIMOS = { normal: 4.5, grande: 3.0, grafico: 3.0 };

function canal(v) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminancia(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map(function (c) { return c + c; }).join('') : h;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}
function contraste(a, b) {
  const la = luminancia(a), lb = luminancia(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// --- Tokens desde :root ---
function leerTokens(html) {
  const m = html.match(/:root\s*\{([\s\S]*?)\}/);
  if (!m) { console.error('No se encontro el bloque :root en index.html'); process.exit(2); }
  const tokens = {};
  const re = /(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;/g;
  let t;
  while ((t = re.exec(m[1]))) tokens[t[1]] = t[2];
  return tokens;
}

// --- Los pares que la app usa. Cada uno apunta a donde vive en el codigo. ---
// Regla del sistema: `X` = color de ESTADO (relleno/icono, sin texto encima).
//                    `X-btn` = color de ACCION (siempre lleva texto encima).
// El texto terciario se mide contra --fondo, que es la superficie mas oscura donde aparece
// (y por lo tanto el peor caso). Medir solo contra blanco deja pasar colores que fallan.
const PARES = [
  // --- Botones y barras (texto blanco encima) ---
  { nombre: 'Boton primario',       texto: '#FFFFFF',  fondo: '--azul',       tam: 'normal',  donde: '.btn-primary' },
  { nombre: 'Boton verde',          texto: '#FFFFFF',  fondo: '--verde-btn',  tam: 'normal',  donde: '.btn-verde / .top-action-verde' },
  { nombre: 'Boton naranja',        texto: '#FFFFFF',  fondo: '--naranja-btn',tam: 'normal',  donde: 'Continuar OT / Editar OT / Aceptar' },
  { nombre: 'Boton destructivo',    texto: '#FFFFFF',  fondo: '--rojo',       tam: 'normal',  donde: 'botones Eliminar' },
  { nombre: 'Boton secundario',     texto: '--texto',  fondo: '--gris2',      tam: 'normal',  donde: '.btn-secondary' },
  { nombre: 'Barra pendientes',     texto: '#FFFFFF',  fondo: '--naranja-btn',tam: 'normal',  donde: '#pending-bar / #correos-bar / badge EN PAUSA' },
  { nombre: 'Barra offline/error',  texto: '#FFFFFF',  fondo: '--rojo',       tam: 'normal',  donde: '#offline-bar' },
  { nombre: 'Hero de exito (sub)',  texto: '#FFFFFF',  fondo: '--verde-btn',  tam: 'normal',  donde: '.success-hero, subtitulo 13px' },
  // Etiquetas sobre foto: DEBEN ser solidas. Con rgba() el contraste lo decide la foto del
  // tecnico (DESPUES caia a 2.41:1 sobre una pared blanca) y el peor caso no es testeable.
  { nombre: 'Etiqueta ANTES',       texto: '#FFFFFF',  fondo: '--azul',       tam: 'normal',  donde: 'comparacion antes/despues (solida sobre la foto)' },
  { nombre: 'Etiqueta DESPUES',     texto: '#FFFFFF',  fondo: '--verde-btn',  tam: 'normal',  donde: 'comparacion antes/despues (solida sobre la foto)' },
  { nombre: 'Boton WhatsApp',       texto: '#FFFFFF',  fondo: '#25D366',      tam: 'normal',  donde: '.btn-whatsapp',
    tolerado: 'verde corporativo de WhatsApp; impuesto por un tercero, no es nuestra decision' },

  // --- Badges: texto de 11px sobre fondo tenido. Hexes literales, no tokens. ---
  { nombre: 'Badge preventivo',     texto: '#1A7A3C',  fondo: '#E6F4EA',      tam: 'normal',  donde: '.badge-prev (11px/600)' },
  { nombre: 'Badge correctivo',     texto: '#B45309',  fondo: '#FEF0E6',      tam: 'normal',  donde: '.badge-corr (11px/600)' },
  { nombre: 'Badge conteo pausadas',texto: '#92400E',  fondo: '#FEF3C7',      tam: 'normal',  donde: '#sup-pausadas-count (11px/700)' },

  // --- Texto sobre superficies claras (--fondo es el peor caso) ---
  { nombre: 'Texto primario',       texto: '--texto',  fondo: '--fondo',      tam: 'normal',  donde: 'body' },
  { nombre: 'Texto secundario',     texto: '--texto2', fondo: '--fondo',      tam: 'normal',  donde: 'labels, .stat-label' },
  { nombre: 'Texto terciario',      texto: '--texto3', fondo: '--fondo',      tam: 'normal',  donde: 'metadatos' },
  { nombre: 'Verde como texto',     texto: '--verde-btn',  fondo: '--fondo',  tam: 'normal',  donde: 'montos, totales, Firma: Si' },
  { nombre: 'Naranja como texto',   texto: '--naranja-btn',fondo: '--fondo',  tam: 'normal',  donde: 'contador de pendientes por grupo' },
  { nombre: 'Rojo como texto',      texto: '--rojo',   fondo: '--fondo',      tam: 'normal',  donde: 'mensajes de error' },

  // --- Graficos (SC 1.4.11, min 3:1). No se cambian sin decidir el lenguaje visual. ---
  // La superficie de card es `white` literal en el CSS: nunca existio un `var(--blanco)`.
  // Este script era el UNICO consumidor del token, asi que check-tokens.js lo dio por muerto
  // (solo escanea index.html) y al borrarlo rompio esta medicion. Se mide contra lo que el
  // CSS realmente pinta, no contra un token que la app ignoraba.
  { nombre: 'Icono preventivo',     texto: '--verde-btn', fondo: '#FFFFFF',   tam: 'grafico', donde: '.ot-icon (SVG)' },
  { nombre: 'Icono correctivo',     texto: '--naranja',   fondo: '#FFFFFF',   tam: 'grafico', donde: '.tipo-card .icon (SVG naranja sobre card blanca)',
    tolerado: 'decorativo: el label "Correctivo" debajo carga el significado. Revisar si alguna vez queda sin label' },
];

// ─── PARTE 2: escaneo por regla ──────────────────────────────────────────────────
// Cualquier `background: X ... color: Y` en el archivo, venga de CSS, de un atributo
// style= o de un fragmento de estilo construido en JS.
//
// Tolerados del escaneo: pares que fallan a proposito, cada uno con su razon.
const TOLERADOS_ESCANEO = {
  '#FFFFFF|#25D366': 'verde corporativo de WhatsApp; impuesto por un tercero',
};

const NOMBRADOS = { white: '#FFFFFF', black: '#000000' };
const COLOR = "(#[0-9a-fA-F]{3,6}|var\\(--[a-z0-9-]+\\)|white|black)";
// Sin cruzar llaves ni comillas: una regla CSS, un atributo style, o un fragmento JS.
const VENTANA = "[^{}'\"]{0,200}?";

function normalizar(v, tokens) {
  if (!v) return null;
  v = v.trim();
  if (NOMBRADOS[v.toLowerCase()]) return NOMBRADOS[v.toLowerCase()];
  const t = v.match(/^var\((--[a-z0-9-]+)\)$/);
  if (t) return tokens[t[1]] || null;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return ('#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toUpperCase();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toUpperCase();
  return null;   // rgba(), transparent, gradientes: no medibles aqui
}

function escanear(html, tokens) {
  const hallados = new Map();
  const patrones = [
    new RegExp('background(?:-color)?:\\s*' + COLOR + VENTANA + '(?:^|[;\\s])color:\\s*' + COLOR, 'gi'),
    new RegExp('(?:^|[;\\s"\'])color:\\s*' + COLOR + VENTANA + 'background(?:-color)?:\\s*' + COLOR, 'gi'),
  ];
  patrones.forEach(function (re, i) {
    let m;
    while ((m = re.exec(html))) {
      const bg = normalizar(i === 0 ? m[1] : m[2], tokens);
      const fg = normalizar(i === 0 ? m[2] : m[1], tokens);
      if (!bg || !fg || bg === fg) continue;
      const ventana = m[0];
      const fz = parseFloat((ventana.match(/font-size:\s*([\d.]+)px/) || [])[1] || 14);
      const fw = parseInt((ventana.match(/font-weight:\s*(\d+|bold)/) || [])[1] || 400, 10) || 700;
      const ln = html.slice(0, m.index).split('\n').length;
      const clave = fg + '|' + bg + '|' + fz;
      if (!hallados.has(clave)) hallados.set(clave, { fg: fg, bg: bg, fz: fz, fw: fw, ln: ln });
    }
  });
  return [...hallados.values()];
}

// ─── PARTE 3 y 4: parseo del CSS ────────────────────────────────────────────────
// Las superficies reales sobre las que la app dibuja. Un color debe pasar en LA PEOR de
// las tres, no solo sobre blanco: medir contra blanco aprobo una vez a `#6B7488`, que
// fallaba sobre --fondo. Misma leccion que llevo a oscurecer --texto3.
const SUPERFICIES = ['#FFFFFF', '--gris1', '--fondo'];

function reglasCSS(html, tokens) {
  const css = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/i) || [])[1] || '';
  const fuera = [];
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selRaw = m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/\s+/g, ' ');
    if (!selRaw || selRaw.startsWith('@') || selRaw.startsWith(':root')) continue;
    const cuerpo = m[2];
    // Un degradado no es medible; se toma su primer color como relleno aproximado.
    const bgRaw = (cuerpo.match(/(?:^|;)\s*background(?:-color|-image)?:\s*([^;]+)/) || [])[1];
    const bg = normalizar(bgRaw, tokens) || (bgRaw ? normalizar((bgRaw.match(/#[0-9a-fA-F]{6}|var\(--[a-z0-9-]+\)/) || [])[0], tokens) : null);
    const color = normalizar((cuerpo.match(/(?:^|;)\s*color:\s*([^;]+)/) || [])[1], tokens);
    const bordeRaw = (cuerpo.match(/(?:^|;)\s*border(?:-color)?:\s*([^;]+)/) || [])[1];
    const borde = bordeRaw ? normalizar((bordeRaw.match(/#[0-9a-fA-F]{6}|var\(--[a-z0-9-]+\)|white|black/) || [])[0], tokens) : null;
    const fz = parseFloat((cuerpo.match(/font-size:\s*([\d.]+)px/) || [])[1] || 0);
    const fw = parseInt((cuerpo.match(/font-weight:\s*(\d+)/) || [])[1] || 400, 10);
    for (const sel of selRaw.split(',')) fuera.push({ sel: sel.trim(), cuerpo, bg, color, borde, fz, fw });
  }
  return fuera;
}

const esEstado = (s) => /:hover|:active|:focus|::/.test(s);

// PARTE 3 — el padre pinta el fondo, el hijo pinta el color.
function paresPorHerencia(reglas) {
  const pares = [];
  const vistos = new Set();
  for (const p of reglas) {
    if (!p.bg || esEstado(p.sel)) continue;
    for (const h of reglas) {
      if (!h.color || h === p || esEstado(h.sel)) continue;
      if (h.bg) continue;                                  // el hijo repinta su fondo: no hereda
      if (!(h.sel.startsWith(p.sel + ' ') || h.sel.startsWith(p.sel + ' > '))) continue;
      const clave = p.sel + '>' + h.sel;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      // Un <svg> hijo es un grafico (min 3.0), no texto.
      const grafico = /\bsvg\b/.test(h.sel);
      const grande = h.fz >= 24 || (h.fz >= 18.66 && h.fw >= 700);
      pares.push({
        nombre: p.sel + ' > ' + h.sel.slice(p.sel.length).trim(),
        fg: h.color, bg: p.bg,
        tam: grafico ? 'grafico' : (grande ? 'grande' : 'normal'),
      });
    }
  }
  return pares;
}

// PARTE 4 — SC 1.4.11. Que es un "control" o un "indicador de estado", sin listas:
//   a) su regla declara `cursor: pointer`, o su selector nombra input/select/textarea/button;
//   b) o el CSS declara `.X` Y ADEMAS `.X.<modificador>` — eso es un indicador con dos
//      estados (`.pin-dot` / `.pin-dot.filled`), y la forma VACIA es la que hay que ver.
//   c) o es un elemento del markup con un manejador on* y un `border` inline.
// El borde se mide contra su propio relleno Y contra las superficies de la app: si no
// contrasta con ninguna, no se ve. Errar hacia el falso positivo, nunca hacia el negativo.
const TOLERADOS_BORDE = {
  // clave: selector
};

function controles(html, reglas, tokens) {
  const superficies = SUPERFICIES.map((s) => (s[0] === '#' ? s : tokens[s]));
  const conModificador = new Set();
  for (const r of reglas) {
    const m = r.sel.match(/^(\.[a-z0-9-]+)\.[a-z0-9-]+$/i);
    if (m) conModificador.add(m[1]);
  }
  const fuera = [];
  const medir = (sel, limite, propioBg) => {
    const vecinos = superficies.slice();
    if (propioBg && propioBg !== limite) vecinos.push(propioBg);
    const peor = vecinos.filter((v) => v && v !== limite)
      .map((v) => ({ v, ratio: contraste(limite, v) }))
      .sort((a, b) => a.ratio - b.ratio)[0];
    if (peor) fuera.push({ sel, limite, contra: peor.v, ratio: peor.ratio, tolerado: TOLERADOS_BORDE[sel] });
  };

  for (const r of reglas) {
    if (esEstado(r.sel)) continue;
    const esControl = /cursor:\s*pointer/.test(r.cuerpo) || /(^|[\s,>])(input|select|textarea|button)\b/.test(r.sel);
    const esIndicador = conModificador.has(r.sel);
    if (!esControl && !esIndicador) continue;
    // Un control se mide por su BORDE. Si no declara borde, se identifica por su contenido
    // (texto, chevron, sombra) y 1.4.11 no exige un limite: una fila de lista no es un input.
    // Un INDICADOR DE ESTADO sin borde tambien se mide, pero SOLO si es pequeno: en un punto
    // de 8px el relleno ES toda la informacion. En una card, no: la identifica su texto.
    // (Sin este corte, la regla acusaba a `.ot-card` y `.pin-btn`, que se ven perfectamente.)
    const ancho = parseFloat((r.cuerpo.match(/(?:^|;)\s*width:\s*(\d+)px/) || [])[1] || 0);
    if (r.borde) medir(r.sel, r.borde, r.bg);
    else if (esIndicador && r.bg && ancho && ancho <= 28) medir(r.sel, r.bg, null);
  }

  const desdeEstilo = (estilo, sel) => {
    const b = (estilo.match(/border(?:-color)?:\s*([^;]+)/) || [])[1];
    if (!b) return;
    const limite = normalizar((b.match(/#[0-9a-fA-F]{6}|var\(--[a-z0-9-]+\)/) || [])[0], tokens);
    if (!limite) return;
    const propio = normalizar((estilo.match(/background(?:-color)?:\s*([^;]+)/) || [])[1], tokens);
    medir(sel, limite, propio);
  };

  // markup e innerHTML: <input|select|textarea|button ... style="...">
  // (cubre tambien los que el JS arma como string, p.ej. #num-equipos)
  for (const m of html.matchAll(/<(input|select|textarea|button)\b[^>]*style="([^"]*)"[^>]*>/gi)) {
    const id = (m[0].match(/id="([^"]+)"/) || [])[1];
    const ln = html.slice(0, m.index).split('\n').length;
    desdeEstilo(m[2], id ? '#' + id : '<' + m[1].toLowerCase() + '> index.html:' + ln);
  }

  // JS: document.createElement('input'|...) seguido de <var>.style.cssText = '...'
  // Sin esto, once controles construidos en JS quedaban fuera de la medicion. Es el mismo
  // punto ciego que hizo falta la parte 2: mirar solo donde ya sabias mirar.
  for (const m of html.matchAll(/(?:const|let|var)?\s*([A-Za-z_$][\w$]*)\s*=\s*document\.createElement\(['"](input|select|textarea|button)['"]\)/g)) {
    const cerca = html.slice(m.index, m.index + 900);
    const est = cerca.match(new RegExp('\\b' + m[1] + '\\.style\\.cssText\\s*=\\s*[\'"]([^\'"]*)'));
    if (!est) continue;
    const ln = html.slice(0, m.index).split('\n').length;
    desdeEstilo(est[1], '<' + m[2] + '> JS index.html:' + ln);
  }

  // El color al que un control VUELVE al perder el foco tambien es su limite.
  // Dos `onblur` restauraban var(--gris2) despues de que todo lo demas ya usaba --gris3:
  // el campo se veia... hasta que lo tocabas y lo soltabas. Ningun escaneo de `border:`
  // lo habria visto, porque aqui la propiedad se llama `borderColor`.
  for (const m of html.matchAll(/borderColor\s*=\s*['"](var\(--[a-z0-9-]+\)|#[0-9a-fA-F]{6})['"]/g)) {
    const limite = normalizar(m[1], tokens);
    if (!limite) continue;
    if (limite === tokens['--azul']) continue;   // el borde de :focus, ya medido aparte
    const ln = html.slice(0, m.index).split('\n').length;
    medir('borderColor= index.html:' + ln, limite, null);
  }
  const vistos = new Set();
  return fuera.filter((f) => (vistos.has(f.sel) ? false : vistos.add(f.sel)));
}

// --- Correr ---
const html = fs.readFileSync(ARCHIVO, 'utf8');
const tokens = leerTokens(html);
const resolver = function (v) { return v.indexOf('--') === 0 ? (tokens[v] || null) : v; };

let fallos = 0, tolerados = 0;
const filas = [];

PARES.forEach(function (p) {
  const fg = resolver(p.texto), bg = resolver(p.fondo);
  if (!fg || !bg) {
    console.error('  token ausente en :root -> ' + (!fg ? p.texto : p.fondo) + '  (' + p.nombre + ')');
    fallos++;
    return;
  }
  const ratio = contraste(fg, bg);
  const min = MINIMOS[p.tam];
  const pasa = ratio >= min;
  if (!pasa) { if (p.tolerado) tolerados++; else fallos++; }
  filas.push({ p: p, ratio: ratio, min: min, pasa: pasa });
});

const w = function (s, n) { return String(s).padEnd(n); };
console.log('\n  Contraste WCAG AA — EMVAL\n');
console.log('  ' + w('PAR', 22) + w('RATIO', 10) + w('MIN', 7) + w('ESTADO', 14) + 'DONDE');
console.log('  ' + '-'.repeat(98));
filas.forEach(function (f) {
  const estado = f.pasa ? 'PASA' : (f.p.tolerado ? 'FALLA (tolerado)' : 'FALLA');
  console.log('  ' + w(f.p.nombre, 22) + w(f.ratio.toFixed(2) + ':1', 10) + w(f.min.toFixed(1), 7) + w(estado, 14) + f.p.donde);
});
console.log('');
filas.filter(function (f) { return !f.pasa && f.p.tolerado; }).forEach(function (f) {
  console.log('  tolerado — ' + f.p.nombre + ': ' + f.p.tolerado);
});
console.log('\n  Parte 1 (curados): ' + filas.length + ' pares · ' + fallos + ' fallo(s) · ' + tolerados + ' tolerado(s)');

// ─── Parte 2: lo que el escaneo encuentra por su cuenta ───────────────────────────
const encontrados = escanear(html, tokens);
let fallos2 = 0, tolerados2 = 0;
const malos = [];
encontrados.forEach(function (p) {
  const ratio = contraste(p.fg, p.bg);
  const grande = p.fz >= 24 || (p.fz >= 18.66 && p.fw >= 700);
  const min = grande ? MINIMOS.grande : MINIMOS.normal;
  if (ratio >= min) return;
  const razon = TOLERADOS_ESCANEO[p.fg + '|' + p.bg];
  if (razon) { tolerados2++; return; }
  fallos2++;
  malos.push({ p: p, ratio: ratio, min: min });
});

console.log('  Parte 2 (escaneo):  ' + encontrados.length + ' pares · ' + fallos2 + ' fallo(s) · ' + tolerados2 + ' tolerado(s)\n');

if (malos.length) {
  console.log('  PARES QUE FALLAN AA, hallados por escaneo (ninguno estaba en la lista curada):\n');
  console.log('  ' + w('RATIO', 10) + w('MIN', 6) + w('TEXTO', 10) + w('FONDO', 10) + w('TAM', 7) + 'DONDE');
  malos.sort(function (a, b) { return a.ratio - b.ratio; }).forEach(function (f) {
    console.log('  ' + w(f.ratio.toFixed(2) + ':1', 10) + w(f.min.toFixed(1), 6) + w(f.p.fg, 10) + w(f.p.bg, 10) + w(f.p.fz + 'px', 7) + 'index.html:' + f.p.ln);
  });
  console.log('\n  Usa un token que pase AA, o agrega el par a TOLERADOS_ESCANEO con una razon escrita.\n');
}

// ─── Parte 3: herencia por selector ──────────────────────────────────────────────
const reglas = reglasCSS(html, tokens);
const heredados = paresPorHerencia(reglas);
let fallos3 = 0;
const malos3 = [];
heredados.forEach(function (p) {
  const ratio = contraste(p.fg, p.bg);
  const min = MINIMOS[p.tam];
  if (ratio >= min) return;
  fallos3++;
  malos3.push({ p: p, ratio: ratio, min: min });
});
console.log('  Parte 3 (herencia): ' + heredados.length + ' pares · ' + fallos3 + ' fallo(s)');

// ─── Parte 4: SC 1.4.11 ──────────────────────────────────────────────────────────
const limites = controles(html, reglas, tokens);
let fallos4 = 0, tolerados4 = 0;
const malos4 = [];
limites.forEach(function (c) {
  if (c.ratio >= MINIMOS.grafico) return;
  if (c.tolerado) { tolerados4++; return; }
  fallos4++;
  malos4.push(c);
});
console.log('  Parte 4 (SC 1.4.11): ' + limites.length + ' controles · ' + fallos4 + ' fallo(s) · ' + tolerados4 + ' tolerado(s)\n');

if (malos3.length) {
  console.log('  PARES QUE FALLAN, hallados por HERENCIA (el padre pinta el fondo, el hijo el color):\n');
  console.log('  ' + w('RATIO', 10) + w('MIN', 6) + w('TEXTO', 10) + w('FONDO', 10) + 'SELECTOR');
  malos3.sort(function (a, b) { return a.ratio - b.ratio; }).forEach(function (f) {
    console.log('  ' + w(f.ratio.toFixed(2) + ':1', 10) + w(f.min.toFixed(1), 6) + w(f.p.fg, 10) + w(f.p.bg, 10) + f.p.nombre);
  });
  console.log('');
}

if (malos4.length) {
  console.log('  CONTROLES CUYO LIMITE NO SE VE (SC 1.4.11, min 3:1 contra lo que lo rodea):\n');
  console.log('  ' + w('RATIO', 10) + w('LIMITE', 10) + w('CONTRA', 10) + 'SELECTOR');
  malos4.sort(function (a, b) { return a.ratio - b.ratio; }).forEach(function (c) {
    console.log('  ' + w(c.ratio.toFixed(2) + ':1', 10) + w(c.limite, 10) + w(c.contra, 10) + c.sel);
  });
  console.log('\n  Un tecnico bajo sol directo no ve donde empieza el control. DESIGN.md §1.');
  console.log('  Oscurece el borde, o agrega el selector a TOLERADOS_BORDE con una razon escrita.\n');
}

const total = fallos + fallos2 + fallos3 + fallos4;
console.log('  ' + (total ? total + ' fallo(s) real(es) en total.' : 'Todos los pares y limites pasan AA.') + '\n');
process.exit(total ? 1 : 0);
