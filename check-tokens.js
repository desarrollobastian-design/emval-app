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

// --- 3b. Grises casi identicos a un token neutro ----------------------------------
// Habia 13 usos de #EEF2FA / #EDF0F5 / #F8F9FB / #F5F5F5 / #F1F5F9: a distancia 1-6 de
// --gris1 / --gris2 / --fondo. Ojo humano: el mismo color. Sistema de diseno: cinco grises.
//
// Se comparan SOLO contra los tokens neutros y con umbral <= 6. Mas arriba, la distancia RGB
// deja de significar nada: #E6F4EA (verde palido) queda "cerca" de --gris2 sin serlo, y una
// regla que forzara todos los hexes a tokens romperia cosas que DESIGN.md manda conservar:
// la paleta de avatares (Pedro pidio un color propio por tecnico) y los colores de marca de
// terceros (#F7941D es de la cadena S10, #25D366 de WhatsApp).
//
// Distancia 0 se permite: ese hex ES el valor del token, y en las zonas exportadas (Excel,
// correo) el literal es obligatorio porque el :root no viaja.
const NEUTROS = ['--fondo', '--gris1', '--gris2', '--gris3', '--texto', '--texto2', '--texto3'];
const rgbDe = (x) => [1, 3, 5].map((i) => parseInt(x.substr(i, 2), 16));
const distancia = (a, b) => {
  const A = rgbDe(a), B = rgbDe(b);
  return Math.round(Math.sqrt((A[0]-B[0])**2 + (A[1]-B[1])**2 + (A[2]-B[2])**2));
};
const valoresToken = new Set();
for (const m of rootM[1].matchAll(/--[\w-]+\s*:\s*(#[0-9a-fA-F]{6})/g)) valoresToken.add(m[1].toUpperCase());
const hexToken = {};
for (const m of rootM[1].matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) hexToken[m[1]] = m[2].toUpperCase();

const grisesDup = [];
lineas.forEach((l, i) => {
  const t = l.trim();
  // Linea a linea: un comentario que MENCIONA un hex no es un uso.
  // (Estripar /* */ con un regex es peor: accept="image/*" abre un comentario falso.)
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
  for (const m of l.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
    const hex = m[0].toUpperCase();
    if (valoresToken.has(hex)) continue;           // ES un token
    for (const tk of NEUTROS) {
      if (!hexToken[tk]) continue;
      const d = distancia(hex, hexToken[tk]);
      if (d > 0 && d <= 6) grisesDup.push({ ln: i + 1, hex, tk, d });
    }
  }
});
const ESCALA = [11, 12, 15, 16, 22]; // §3: micro, small, body/h3/cta, h2, h1
const tam = {};
for (const m of html.matchAll(/font-size:\s*(\d+)px/g)) {
  const n = +m[1];
  tam[n] = (tam[n] || 0) + 1;
}
const total = Object.values(tam).reduce((a, b) => a + b, 0);
const fuera = Object.entries(tam).filter(([n]) => !ESCALA.includes(+n));
const nFuera = fuera.reduce((a, [, n]) => a + n, 0);

// --- 4. Motion (DESIGN.md §6) ------------------------------------------------------
// §6 decia dos cosas y las dos eran falsas, y nadie las verificaba:
//   "Solo animar transform y opacity"       -> habia 7 reglas con `transition: all`.
//   "La pulse es la unica animacion en loop" -> habia tres (pulse, grabar-pulse, shimmer).
// Peor: el propio §4 llama al step-indicator "patron excelente" mientras §6 prohibe animar
// su `width`. Una regla que el diseno contradice a proposito no es una regla, es ruido.
//
// Ahora la regla es explicita y las excepciones estan escritas:
//  · `transition: all` prohibido siempre (anima lo que hoy no existe y manana si).
//  · animar layout: solo lo declarado abajo, con su razon.
//  · animacion en loop: solo la declarada abajo, con su razon.
const cssBloque = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/i) || [])[1] || '';

const LAYOUT_TOLERADO = {
  '.step': 'width 8px->24px en un elemento de 8px: no hay reflow relevante y es el indicador de paso que DESIGN.md §4 manda conservar',
  '.pin-btn.del': 'font-size del glifo de borrar; el boton mide 60px y no cambia de caja',
};
const LOOPS_TOLERADOS = {
  pulse: 'dot de la barra offline: comunica "sin senal" de forma continua',
  'grabar-pulse': 'boton de grabar nota de voz: comunica "grabando"',
  shimmer: 'skeleton de carga: comunica "estoy trabajando"',
};

const PROP_LAYOUT = /^(width|height|padding|margin|top|left|right|bottom|max-height|min-height|font-size|flex|border-width)$/;
const motion = [];
for (const m of cssBloque.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
  const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/\s+/g, ' ');
  if (!sel || sel.startsWith('@')) continue;
  const tr = (m[2].match(/(?:^|;)\s*transition:\s*([^;]+)/) || [])[1];
  if (!tr) continue;
  const props = tr.split(',').map((p) => p.trim().split(/\s+/)[0]);
  for (const p of props) {
    if (p === 'all') { motion.push({ sel, p, por: '`transition: all` anima tambien lo que hoy no existe' }); continue; }
    if (!PROP_LAYOUT.test(p)) continue;
    if (LAYOUT_TOLERADO[sel]) continue;
    motion.push({ sel, p, por: 'anima una propiedad de layout (no es 60fps)' });
  }
}
const loops = [];
for (const m of cssBloque.matchAll(/animation:\s*([\w-]+)[^;]*infinite/g)) {
  if (!LOOPS_TOLERADOS[m[1]]) loops.push(m[1]);
}

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

if (grisesDup.length) {
  fallos += grisesDup.length;
  console.log('  ' + grisesDup.length + ' hex(es) visualmente IDENTICOS a un token neutro:\n');
  grisesDup.slice(0, 12).forEach(g => console.log('    index.html:' + String(g.ln).padEnd(6) + g.hex + '  ≈  ' + g.tk + ' (' + hexToken[g.tk] + ')   distancia ' + g.d));
  console.log('\n  Usa var(' + grisesDup[0].tk + '). Si es una zona exportada (Excel/correo), usa el hex EXACTO del token.\n');
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

if (motion.length) {
  fallos += motion.length;
  console.log('  ' + motion.length + ' TRANSICION(ES) QUE NO CUMPLEN §6 (solo transform y opacity):\n');
  motion.forEach(m => console.log('    ' + m.sel.padEnd(24) + m.p.padEnd(12) + m.por));
  console.log('\n  Sustituye `transition: all` por la lista explicita de propiedades (como hace .btn).');
  console.log('  Si la excepcion es intencional, declarala en LAYOUT_TOLERADO con su razon.\n');
}

if (loops.length) {
  fallos += loops.length;
  console.log('  ' + loops.length + ' ANIMACION(ES) EN LOOP sin razon escrita: ' + loops.join(', '));
  console.log('  Una animacion infinita compite por la atencion para siempre. Declarala en');
  console.log('  LOOPS_TOLERADOS con lo que comunica, o quitala.\n');
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
