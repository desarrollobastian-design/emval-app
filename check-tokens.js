#!/usr/bin/env node
/**
 * check-tokens.js — Verifica que la capa de design tokens sea REAL y no decorativa.
 * Sin dependencias.
 *
 *   node check-tokens.js
 *
 * POR QUE EXISTE:
 * DESIGN.md §4 decia "✅ Normalizado: hoy el codigo solo usa 8/14/18/99px". Era medio cierto,
 * y la mitad falsa era la que costaba plata: los VALORES colapsaron a 4, pero los TOKENS no se
 * adoptaron. Habia 163 `border-radius` hardcodeados contra 20 via `var()`. `--radio-lg` y
 * `--radio-pill` estaban definidos y no los usaba NADIE. La abstraccion existia y no abstraia.
 *
 * Tambien vigila los TOKENS FANTASMA: `var(--gris)` cuando el token real es `--gris2`. Un token
 * inexistente invalida el shorthand `border` entero y el borde simplemente no se dibuja. Eso ya
 * paso 15 veces en esta app (ver DESIGN.md, pasada del 2026-07-08) y el arreglo fue manual.
 *
 * FALLA (exit 1) ante: token fantasma, token muerto, radio hardcodeado.
 * INFORMA (exit 0) sobre: deriva tipografica — colapsarla es una migracion oportunista,
 * no un big-bang; el script mide para que la deriva no CREZCA. Ver DESIGN.md.
 *
 * ALCANCE (declararlo importa): este script solo lee index.html. La primera vez que corrio
 * marco `--blanco` como token muerto y era cierto PARA LA APP (el CSS usa `white` literal),
 * pero check-contraste.js si lo consumia — borrarlo rompio esa medicion. "Muerto" aqui
 * significa "sin usos en index.html", no "sin usos en el repo". Si algun dia un token existe
 * solo para las herramientas, este check hay que ensancharlo, no silenciarlo.
 */
const fs = require('fs');
const path = require('path');

const ARCHIVO = path.join(__dirname, 'index.html');
const html = fs.readFileSync(ARCHIVO, 'utf8');
const lineas = html.split(/\r?\n/);

// --- 1. Tokens definidos en :root -------------------------------------------------
const rootM = html.match(/:root\s*\{([\s\S]*?)\}/);
if (!rootM) { console.error('No se encontro el bloque :root'); process.exit(1); }
const definidos = new Set();
for (const m of rootM[1].matchAll(/(--[a-z0-9-]+)\s*:/g)) definidos.add(m[1]);

// --- 2. Tokens usados via var() ---------------------------------------------------
const usados = new Map(); // token -> primera linea
lineas.forEach((l, i) => {
  for (const m of l.matchAll(/var\((--[a-z0-9-]+)/g)) {
    if (!usados.has(m[1])) usados.set(m[1], i + 1);
  }
});

const fantasma = [...usados.keys()].filter(t => !definidos.has(t));
const muertos = [...definidos].filter(t => !usados.has(t));

// --- 2b. Zonas de CSS EXPORTADO ---------------------------------------------------
// Marcadas con  "CSS-EXPORTADO: INICIO"  ...  "CSS-EXPORTADO: FIN"  en index.html.
// Ese HTML viaja fuera del documento vivo (clientes de correo via EmailJS). Alli el :root
// no existe y una custom property sin fallback invalida la declaracion entera -> radio 0.
// La regla se INVIERTE: dentro, los literales son obligatorios y una custom property es error.
// (Este escaneo es textual: no distingue codigo de comentario. No escribas una custom property
//  de ejemplo dentro de la zona marcada, ni siquiera comentada.)
// Existe porque un sed global de radios rompio el correo de cotizaciones sin que nadie lo viera:
// los 3 checks seguian en verde, porque ninguno miraba lo que sale del documento.
const zonasExport = [];
let ini = null;
lineas.forEach((l, i) => {
  if (/CSS-EXPORTADO:\s*INICIO/.test(l)) ini = i + 1;
  else if (/CSS-EXPORTADO:\s*FIN/.test(l) && ini !== null) { zonasExport.push([ini, i + 1]); ini = null; }
});
if (ini !== null) { console.error('  Zona CSS-EXPORTADO abierta en linea ' + ini + ' y nunca cerrada.'); process.exit(1); }
const esExport = (ln) => zonasExport.some(([a, b]) => ln >= a && ln <= b);

// --- 3. Radios hardcodeados -------------------------------------------------------
// La escala canonica de DESIGN.md §4: 8/14/18/99px + 50% para circulos.
// `50%` se permite: es geometria (avatares, dots), no un valor de marca.
const radios = [];
const varsEnExport = [];
lineas.forEach((l, i) => {
  const ln = i + 1;
  if (esExport(ln)) {
    // Dentro de la zona exportada la regla es la contraria.
    for (const m of l.matchAll(/var\((--[a-z0-9-]+)\)/g)) varsEnExport.push({ ln, t: m[1] });
    return;
  }
  for (const m of l.matchAll(/border-radius:\s*([^;"']+)/g)) {
    const v = m[1].trim();
    if (v === '50%' || v.startsWith('var(')) continue;
    radios.push({ ln, v });
  }
});

// --- 4. Deriva tipografica (solo informa) -----------------------------------------
const ESCALA = [11, 12, 15, 16, 22]; // §3: micro, small, body/h3/cta, h2, h1
const tam = {};
for (const m of html.matchAll(/font-size:\s*(\d+)px/g)) {
  const n = +m[1];
  tam[n] = (tam[n] || 0) + 1;
}
const total = Object.values(tam).reduce((a, b) => a + b, 0);
const fuera = Object.entries(tam).filter(([n]) => !ESCALA.includes(+n));
const nFuera = fuera.reduce((a, [, n]) => a + n, 0);

// --- Reporte ----------------------------------------------------------------------
console.log('\n  Design tokens — EMVAL\n');

let fallos = 0;

if (fantasma.length) {
  fallos += fantasma.length;
  console.log('  TOKENS FANTASMA (usados via var(), NO definidos en :root):');
  console.log('  Un var(--x) inexistente invalida el shorthand entero: el borde no se dibuja.\n');
  fantasma.forEach(t => console.log('    index.html:' + String(usados.get(t)).padEnd(6) + t));
  console.log('');
}

if (muertos.length) {
  fallos += muertos.length;
  console.log('  TOKENS MUERTOS (definidos en :root, 0 usos):');
  console.log('  Un token que nadie usa no es abstraccion, es deuda. Usalo o borralo.\n');
  muertos.forEach(t => console.log('    ' + t));
  console.log('');
}

if (varsEnExport.length) {
  fallos += varsEnExport.length;
  console.log('  ' + varsEnExport.length + ' var() DENTRO DE CSS EXPORTADO — no resuelven fuera del documento:\n');
  varsEnExport.forEach(v => console.log('    index.html:' + String(v.ln).padEnd(6) + 'var(' + v.t + ')'));
  console.log('\n  Ese HTML se envia por correo. El :root de la app no viaja con el.');
  console.log('  Usa el literal (8px, #1B3A6B). Es la unica zona donde un hardcode es correcto.\n');
}

if (radios.length) {
  fallos += radios.length;
  console.log('  ' + radios.length + ' RADIO(S) HARDCODEADO(S) — deben usar var(--radio*):\n');
  const porValor = {};
  radios.forEach(r => (porValor[r.v] = porValor[r.v] || []).push(r.ln));
  Object.entries(porValor).forEach(([v, lns]) => {
    console.log('    ' + v.padEnd(14) + lns.length + ' uso(s)   primera: index.html:' + lns[0]);
  });
  console.log('\n  Escala canonica: 8px=--radio-sm  14px=--radio  18px=--radio-lg  99px=--radio-pill\n');
}

if (!fallos) {
  console.log('  ' + definidos.size + ' tokens definidos, ' + definidos.size + ' en uso. 0 fantasmas, 0 muertos.');
  console.log('  Los ' + (html.match(/border-radius:\s*var\(/g) || []).length + ' radios pasan por token. La abstraccion es real.');
  console.log('  ' + zonasExport.length + ' zona(s) de CSS exportado, 0 var() dentro (correcto: el correo no lleva :root).\n');
}

// Informativo: no falla. La escala tipografica se migra por pantalla, no de una vez.
console.log('  ── Deriva tipografica (informativo, no falla) ──');
console.log('  ' + Object.keys(tam).length + ' tamanos distintos en ' + total + ' declaraciones. La escala §3 tiene ' + ESCALA.length + ' pasos.');
if (nFuera) {
  const top = fuera.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, c]) => n + 'px×' + c);
  console.log('  ' + nFuera + ' fuera de escala. Mas usados: ' + top.join('  '));
  console.log('  Estrategia: migrar cuando se toque la pantalla. No un big-bang. (DESIGN.md)');
}
console.log('');

if (fallos) {
  console.log('  ' + fallos + ' problema(s) de tokens.\n');
  process.exit(1);
}
process.exit(0);
