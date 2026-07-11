#!/usr/bin/env node
/**
 * check-emojis.js — Verifica que no queden emojis a color usados como iconos.
 * Sin dependencias.
 *
 *   node check-emojis.js
 *
 * POR QUE EXISTE, y por que escanea por RANGO y no por lista:
 * La migracion emoji->SVG recorrio una lista fija de emojis. La verificacion uso
 * ESA MISMA LISTA. Un check que hereda el punto ciego del fix no puede encontrar
 * lo que el fix omitio: sobrevivieron 👁, ⚙️ y 📤 durante semanas, y DESIGN.md
 * llego a afirmar "0 emojis a color" — dos veces, y era falso.
 *
 * Aqui se escanea todo el espacio de simbolos y se RESTA una allowlist explicita.
 * Si aparece un simbolo nuevo, falla por defecto. Es lo contrario de una lista.
 *
 * SEGUNDA REGLA (2026-07-09): un icono que no puede dibujarse.
 * Este script verificaba "no hay emojis". No verificaba "todo icono se dibuja". Sobrevivio
 * un  <i class="ti ti-store">  —Tabler Icons por fuente— cuya hoja de estilos NO se carga
 * en ninguna parte del documento. Ese glifo era una caja de 40x40 vacia, para siempre.
 * La regla no es "prohibido Tabler": es que una fuente de iconos sin su hoja cargada no
 * puede renderizar nada, y la iconografia de esta app es SVG inline con currentColor.
 */
const fs = require('fs');
const path = require('path');

const ARCHIVO = path.join(__dirname, 'index.html');

// Simbolos tipograficos monocromos que SI queremos. Cada uno con su razon.
// Renderizan igual en todo dispositivo y no dependen de la fuente de emojis del SO.
const PERMITIDOS = {
  '✓': 'check tipografico (✓) — confirmaciones y estados completados',
  '✕': 'cruz tipografica (✕) — cerrar, quitar item',
  '●': 'circulo (●) — simbolo universal de grabar; vive en textContent',
  '■': 'cuadrado (■) — simbolo universal de detener; vive en textContent',
  '←': 'flecha izquierda (←) — navegacion hacia atras',
  '→': 'flecha derecha (→) — navegacion hacia adelante',
  '›': 'chevron (›) — affordance de fila clickeable',
};

// Rangos donde viven emojis y pictogramas. Amplio a proposito.
const RANGOS = [
  [0x2190, 0x21FF], // flechas
  [0x2300, 0x23FF], // tecnicos (⌚ ⏸ ⏳ ...)
  [0x2460, 0x24FF], // alfanumericos encerrados
  [0x25A0, 0x25FF], // formas geometricas
  [0x2600, 0x27BF], // misc symbols + dingbats (☀ ⚙ ✅ ✂ ...)
  [0x2B00, 0x2BFF], // flechas y simbolos misc
  [0x1F000, 0x1FAFF], // bloques de emoji modernos
];

const enRango = (cp) => RANGOS.some(([a, b]) => cp >= a && cp <= b);

const html = fs.readFileSync(ARCHIVO, 'utf8');
const lineas = html.split(/\r?\n/);

const violaciones = [];
const permitidosVistos = {};

lineas.forEach((linea, i) => {
  for (const ch of linea) {
    const cp = ch.codePointAt(0);
    // El selector de variacion U+FE0F fuerza presentacion a COLOR. Es la firma de un emoji.
    if (cp === 0xFE0F) {
      violaciones.push({ ln: i + 1, ch: 'U+FE0F', motivo: 'selector de variacion: fuerza render a color' });
      continue;
    }
    if (!enRango(cp)) continue;
    if (PERMITIDOS[ch]) { permitidosVistos[ch] = (permitidosVistos[ch] || 0) + 1; continue; }
    violaciones.push({
      ln: i + 1,
      ch: ch + '  U+' + cp.toString(16).toUpperCase().padStart(4, '0'),
      motivo: 'simbolo/emoji fuera de la allowlist',
    });
  }
});

// ─── Iconos por fuente ───────────────────────────────────────────────────────────
// Se declaran las familias conocidas y como se carga cada una. Si el prefijo de clase
// aparece y ningun <link> trae su hoja, el icono no puede dibujarse NUNCA.
// Ademas: la iconografia de esta app es SVG inline. Un <i> es el portador canonico de
// un icono de fuente, y aqui no hay ni una cursiva legitima.
const FAMILIAS = [
  { nombre: 'Tabler Icons',    clase: /class="[^"]*\bti\b[\s"]|class="ti /, hoja: /tabler/i },
  { nombre: 'Font Awesome',    clase: /class="[^"]*\bfa[srlbd]?\b[^"]*\bfa-/, hoja: /font-?awesome/i },
  { nombre: 'Bootstrap Icons', clase: /class="[^"]*\bbi-/,                    hoja: /bootstrap-icons/i },
  { nombre: 'Material Icons',  clase: /class="[^"]*material-icons/,           hoja: /material/i },
];
const hojas = [...html.matchAll(/<link[^>]+href="([^"]+)"/gi)].map((m) => m[1]).join(' ');
const iconosRotos = [];

for (const fam of FAMILIAS) {
  if (!fam.clase.test(html)) continue;
  if (fam.hoja.test(hojas)) continue;
  const ln = lineas.findIndex((l) => fam.clase.test(l)) + 1;
  iconosRotos.push({ ln, msg: fam.nombre + ' usado sin que ningun <link> cargue su hoja: el glifo no se dibuja jamas.' });
}
for (let i = 0; i < lineas.length; i++) {
  if (/<i\s+class=|<i>/.test(lineas[i])) {
    iconosRotos.push({ ln: i + 1, msg: 'Elemento <i> como icono. La iconografia es SVG inline con currentColor.' });
  }
}

console.log('\n  Emojis a color — EMVAL\n');

if (iconosRotos.length) {
  console.log('  ' + iconosRotos.length + ' ICONO(S) QUE NO PUEDEN DIBUJARSE:\n');
  iconosRotos.forEach((v) => console.log('    index.html:' + String(v.ln).padEnd(6) + v.msg));
  console.log('');
  if (!violaciones.length) {
    console.log('  0 emojis a color, pero la iconografia no esta completa.\n');
    process.exit(1);
  }
}

if (Object.keys(permitidosVistos).length) {
  console.log('  Simbolos tipograficos permitidos (monocromos, intencionales):');
  Object.entries(permitidosVistos).forEach(([ch, n]) => {
    console.log('    ' + ch + '  ' + String(n).padStart(3) + ' usos   ' + PERMITIDOS[ch]);
  });
  console.log('');
}

if (!violaciones.length) {
  console.log('  0 emojis a color. La iconografia es un set SVG unico.\n');
  process.exit(0);
}

console.log('  ' + violaciones.length + ' VIOLACION(ES):\n');
violaciones.forEach(v => {
  console.log('    index.html:' + String(v.ln).padEnd(6) + v.ch.padEnd(16) + v.motivo);
});
console.log('\n  Migralos a SVG inline con currentColor, o agregalos a PERMITIDOS con una razon escrita.');
console.log('  OJO: si el sitio usa textContent, un SVG se renderiza como texto literal. Convertir a innerHTML primero.\n');
process.exit(1);
