#!/usr/bin/env node
/**
 * check-contraste.js — Verifica los ratios de contraste WCAG de los pares de color
 * que EMVAL usa de verdad. Sin dependencias. Lee los tokens desde el :root de index.html.
 *
 *   node check-contraste.js
 *
 * Sale con codigo 1 si algun par de texto baja del minimo AA.
 * Los pares con `tolerado` se reportan pero no rompen (decisiones de marca justificadas).
 *
 * Por que existe: DESIGN.md afirmaba cosas sobre contraste que nadie verificaba.
 * El bug del verde (3.3:1 en botones) sobrevivio a cuatro criticas de diseno porque
 * "se ve bien" no es un test. Esto lo convierte en un hecho medible.
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
  { nombre: 'Icono preventivo',     texto: '--verde-btn', fondo: '--blanco',  tam: 'grafico', donde: '.ot-icon (SVG)' },
  { nombre: 'Icono correctivo',     texto: '--naranja',   fondo: '--blanco',  tam: 'grafico', donde: '.tipo-card .icon (SVG naranja sobre card blanca)',
    tolerado: 'decorativo: el label "Correctivo" debajo carga el significado. Revisar si alguna vez queda sin label' },
];

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
console.log('\n  ' + filas.length + ' pares · ' + fallos + ' fallo(s) real(es) · ' + tolerados + ' tolerado(s)\n');
process.exit(fallos ? 1 : 0);
