#!/usr/bin/env node
/**
 * check-contraste.js — Contraste WCAG AA de EMVAL. Sin dependencias.
 *
 *   node check-contraste.js
 *
 * DOS PARTES, y la segunda existe porque la primera no bastaba:
 *
 *  1. PARES CURADOS: pares que solo se ven leyendo el CSS por clases (`.btn-primary` define
 *     su fondo, el texto blanco viene de otra regla). Un escaner no los puede emparejar.
 *
 *  2. ESCANEO POR REGLA: busca CUALQUIER `background: X; color: Y` en todo el archivo y lo
 *     mide. Sin lista.
 *
 * POR QUE EXISTE LA PARTE 2:
 * Durante semanas este script salio en verde con 22 pares curados... y habia TRES fallos
 * reales fuera de esa lista, porque los pares que fallaban usaban hexes sueltos, no tokens:
 *   · blanco sobre #E74C3C (3.82:1) — el boton "No" del toggle preventivo del tecnico
 *   · #6B7280 sobre #E8ECF5 (4.09:1) — ese mismo toggle, sin responder
 *   · blanco sobre #27A06B (3.32:1) — la fila "Total ano" del Excel que lee el administrador
 *
 * El "Si" del toggle SI estaba migrado a var(--verde-btn). El "No" no. La migracion habia
 * recorrido una LISTA de verdes. Es la sexta vez que este proyecto tropieza con lo mismo:
 * check-emojis paso de lista a rango, check-tokens a escaneo del :root, check-tildes a la
 * regla del -ion. Este era el ultimo que quedaba recitando.
 *
 * Sale con codigo 1 si algun par de texto baja del minimo AA.
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

const total = fallos + fallos2;
console.log('  ' + (total ? total + ' fallo(s) real(es) en total.' : 'Todos los pares pasan AA.') + '\n');
process.exit(total ? 1 : 0);
