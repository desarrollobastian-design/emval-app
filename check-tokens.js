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
 * FALLA (exit 1) ante: token fantasma, token muerto, radio hardcodeado, hex identico a un
 * token sin firmar, var() dentro de una zona exportada, transition:all, loop sin razon.
 * INFORMA (exit 0) sobre: deriva tipografica y colores de marca sin token. Colapsarlos es una
 * migracion oportunista, no un big-bang; el script mide para que la deriva no CREZCA.
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

// --- 3c. El hex que ES un token, escrito a mano ------------------------------------
// Durante semanas la linea de abajo decia:
//
//     if (valoresToken.has(hex)) continue;      // "ES un token"
//
// Es decir: este script prohibia el hex PARECIDO a un token y permitia el IDENTICO. Escribir
// `background: #1B3A6B` donde toca `var(--azul)` pasaba en silencio, en el unico archivo cuya
// cabecera afirma "la abstraccion es real". La regla que existe para probarlo era la que lo
// permitia. Habia 35 hexes asi.
//
// Y esos 35 no eran todos errores: ~23 estaban en sitios donde una custom property NO RESUELVE.
// La app conocia ese concepto en UN solo sitio (la zona CSS-EXPORTADO, levantada despues de que
// un sed global rompiera el correo de cotizaciones) y lo practicaba en SEIS:
//
//     documento exportado (correo, Excel, ventana de impresion)   -> zona CSS-EXPORTADO
//     canvas 2D           (ctx.strokeStyle)                       -> el contexto no lee CSS
//     Chart.js            (grid.color)                            -> es config JS, no CSS
//     atributo de SVG     (stroke="…", fill="…")                  -> presentacional, no CSS
//     <meta name="theme-color">                                   -> no admite var()
//     un VALOR de dato    (paleta de avatares, color de cadena)   -> no es estilo, es dato
//
// La reja se habia levantado alrededor del unico campo que ya se habia quemado. Ahora la
// excepcion se FIRMA en el sitio, igual que los silencios de check-a11y.js:
//
//     /* LITERAL-FIRMADO: <por que el token no llega aqui> */
//
// La firma va junto al hex, no en una lista dentro de este script: una lista aqui envejece
// sin que nadie lo note, y esa es exactamente la clase de fallo que llevamos diez formas
// persiguiendo. Escribir la razon cuesta; ese coste es el punto.
// Ojo con `\s*`: saltaria el salto de linea y una firma vacia quedaria validada por el texto
// de la linea siguiente. Tiene que haber razon EN LA MISMA linea que la firma.
// Y ojo con `\S`: en  /* LITERAL-FIRMADO: */  el propio cierre del comentario es un caracter
// no-blanco y valida la firma vacia. Lo encontro un mutante. Exigimos letra o digito.
const FIRMA_LITERAL = /LITERAL-FIRMADO:[ 	]*[\wÀ-ÿ]/;
const esComentario = (t) => t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
const enRoot = (ln) => {
  const a = html.slice(0, rootM.index).split('\n').length;
  return ln >= a && ln <= a + rootM[0].split('\n').length - 1;
};

// La firma vale en la misma linea o mas arriba, hasta la primera linea en blanco (max 8).
// No puede ser "la linea de arriba" a secas: un atributo HTML (`value="#1B3A6B"`) no admite un
// /* */ dentro, un comentario de bloque ocupa cuatro lineas, y una paleta de seis elementos se
// firma una vez, encima de todos. La linea en blanco es el final del alcance de la firma.
function firmado(i) {
  if (FIRMA_LITERAL.test(lineas[i] || '')) return true;
  for (let j = i - 1; j >= 0 && i - j <= 8; j--) {
    if (!lineas[j].trim()) return false;          // una linea en blanco cierra el alcance
    if (FIRMA_LITERAL.test(lineas[j])) return true;
  }
  return false;
}

const hexTokenLiteral = [];
lineas.forEach((l, i) => {
  const ln = i + 1;
  if (esComentario(l.trim()) || enRoot(ln) || esExport(ln) || firmado(i)) return;
  for (const m of l.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
    const hex = m[0].toUpperCase();
    const tk = Object.keys(hexToken).find((t) => hexToken[t] === hex);
    if (tk) hexTokenLiteral.push({ ln, hex, tk });
  }
});

const grisesDup = [];
lineas.forEach((l, i) => {
  const t = l.trim();
  // Linea a linea: un comentario que MENCIONA un hex no es un uso.
  // (Estripar /* */ con un regex es peor: accept="image/*" abre un comentario falso.)
  if (esComentario(t)) return;
  for (const m of l.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
    const hex = m[0].toUpperCase();
    if (valoresToken.has(hex)) continue;           // ES un token: lo mira la regla 3c
    for (const tk of NEUTROS) {
      if (!hexToken[tk]) continue;
      const d = distancia(hex, hexToken[tk]);
      if (d > 0 && d <= 6) grisesDup.push({ ln: i + 1, hex, tk, d });
    }
  }
});
// --- 3d. Colores de marca sin token (informativo) ----------------------------------
// La regla 3c solo ve el hex que YA ES un token. Un hex de marca repetido veinte veces y sin
// token es igual de invisible que lo era #1A7A3C. Esto no falla: mide, para que la deriva no
// crezca sin que nadie lo sepa. Las paletas de avatar y los colores de terceros estan firmadas
// con LITERAL-FIRMADO y no cuentan; la firma es justamente lo que las saca del recuento.
const sinToken = {};
lineas.forEach((l, i) => {
  const ln = i + 1;
  if (esComentario(l.trim()) || enRoot(ln) || esExport(ln) || firmado(i)) return;
  for (const m of l.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
    const hex = m[0].toUpperCase();
    if (valoresToken.has(hex)) continue;
    (sinToken[hex] = sinToken[hex] || []).push(ln);
  }
});
const sinTokenTop = Object.entries(sinToken).filter(([, l]) => l.length >= 3).sort((a, b) => b[1].length - a[1].length);

// --- 3e. Deriva tipografica (informativo) ------------------------------------------
// El numero de antes ("132 fuera de escala") mezclaba dos deudas que no se pagan igual, y por
// eso llevaba semanas sin moverse: la tarea, tal como estaba escrita, no tenia un primer paso.
//
//   en el <style>   -> son REGLAS CSS. Colapsarlas a la escala es un acto de diseno.
//   inline (markup y strings de JS) -> son NODOS. Reescribir 251 `font-size:13px` a
//   `var(--txt-body)` no crea un sistema de diseno: crea la misma deriva con nombres largos.
//
// El 82% de los font-size no esta en la hoja de estilos. La deuda real no es la escala: son los
// 228 `.style.cssText`. Las 121 clases del <style> describen un sistema que el JS no usa.
const ESCALA = [11, 12, 15, 16, 22]; // §3: micro, small, body/h3/cta, h2, h1
const estIni = html.slice(0, html.search(/<style[^>]*>/i)).split('\n').length;
const estFin = html.slice(0, html.search(/<\/style>/i)).split('\n').length;
const origen = { hoja: {}, inline: {}, exportado: {} };
lineas.forEach((l, i) => {
  const ln = i + 1;
  for (const m of l.matchAll(/font-size:\s*(\d+)px/g)) {
    const n = +m[1];
    const d = esExport(ln) ? origen.exportado : (ln >= estIni && ln <= estFin) ? origen.hoja : origen.inline;
    d[n] = (d[n] || 0) + 1;
  }
});
const suma = (d) => Object.values(d).reduce((a, b) => a + b, 0);
const fueraDe = (d) => Object.entries(d).filter(([n]) => !ESCALA.includes(+n)).reduce((a, [, c]) => a + c, 0);
const tam = {};
for (const d of [origen.hoja, origen.inline, origen.exportado]) for (const [n, c] of Object.entries(d)) tam[n] = (tam[n] || 0) + c;
const total = suma(tam);
const fuera = Object.entries(tam).filter(([n]) => !ESCALA.includes(+n));
const nFuera = fuera.reduce((a, [, n]) => a + n, 0);
const nCssText = (html.match(/\.style\.cssText/g) || []).length;

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

if (hexTokenLiteral.length) {
  fallos += hexTokenLiteral.length;
  console.log('  ' + hexTokenLiteral.length + ' HEX(ES) que SON el valor de un token, escritos a mano:\n');
  hexTokenLiteral.forEach(h => console.log('    index.html:' + String(h.ln).padEnd(6) + h.hex + '  ->  var(' + h.tk + ')'));
  console.log('\n  Usa var(--x). Si el token NO LLEGA a ese sitio (canvas, Chart.js, atributo SVG,');
  console.log('  <meta>, o un valor de dato como la paleta de avatares), firma la excepcion:\n');
  console.log('      /* LITERAL-FIRMADO: el contexto 2D de canvas no resuelve custom properties */\n');
  console.log('  Si es un documento que sale del DOM (correo, Excel, ventana de impresion),');
  console.log('  envuelvelo en una zona  CSS-EXPORTADO: INICIO / FIN.\n');
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

// Informativo: no falla. Mide para que la deriva no crezca sin que nadie lo sepa.
if (sinTokenTop.length) {
  console.log('  ── Colores de marca SIN token, usados 3+ veces (informativo, no falla) ──');
  sinTokenTop.slice(0, 8).forEach(([hex, lns]) =>
    console.log('  ' + hex + '  ×' + String(lns.length).padEnd(3) + ' primera: index.html:' + lns[0]));
  console.log('  La regla 3c solo ve el hex que YA es un token. Asi vivio #1A7A3C, catorce veces,');
  console.log('  sin que ningun check supiera que existia. Si uno de estos tiene un rol propio, dale');
  console.log('  su token; si no, colapsalo. Lo que no puede es seguir sin dueno.\n');
}

console.log('  ── Deriva tipografica (informativo, no falla) ──');
console.log('  ' + Object.keys(tam).length + ' tamanos distintos en ' + total + ' declaraciones (escala §3: ' + ESCALA.length + ' pasos).\n');
console.log('    origen              decl   fuera de escala   como se paga');
console.log('    <style> (reglas)  ' + String(suma(origen.hoja)).padStart(5) + String(fueraDe(origen.hoja)).padStart(15) +
            '   colapsar a la escala: es diseno');
console.log('    inline (nodos)    ' + String(suma(origen.inline)).padStart(5) + String(fueraDe(origen.inline)).padStart(15) +
            '   extraer a clases; renombrar no arregla nada');
console.log('    exportado         ' + String(suma(origen.exportado)).padStart(5) + String(fueraDe(origen.exportado)).padStart(15) +
            '   no se toca: el :root no viaja');
const pctInline = Math.round((suma(origen.inline) / total) * 100);
console.log('\n  El ' + pctInline + '% no esta en la hoja de estilos. La deuda real no es la escala: son los ' +
            nCssText + ' `.style.cssText`.');
console.log('  Las ' + ((cssBloque.match(/^\s*\.[a-zA-Z][\w-]*/gm) || []).length ? 'clases del <style>' : 'clases') +
            ' describen un sistema que el JS no usa. Primer paso: una clase, no un token.');
if (nFuera) {
  const top = fuera.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, c]) => n + 'px×' + c);
  console.log('  Mas usados fuera de escala: ' + top.join('  ') + '   (DESIGN.md: por pantalla, no big-bang)');
}
console.log('');

if (fallos) {
  console.log('  ' + fallos + ' problema(s) de tokens.\n');
  process.exit(1);
}
process.exit(0);
