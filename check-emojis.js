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

console.log('\n  Emojis a color — EMVAL\n');

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
