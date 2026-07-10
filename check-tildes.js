#!/usr/bin/env node
/**
 * check-tildes.js — Palabras que llevan tilde, escritas sin ella, en texto que el usuario VE.
 * Sin dependencias.
 *
 *   node check-tildes.js
 *
 * POR QUE EXISTE:
 * La ortografia se venia arreglando A OJO, pantalla por pantalla, cada vez que una captura
 * mostraba un error. Asi se corrigieron "Despues", "Fotografia", "Facturacion"... y sobrevivieron
 * "Nuevo tecnico", "Ver cotizacion" x3, placeholder="Descripcion" y ocho toasts. Revisar a ojo
 * encuentra lo que miras; no encuentra lo que no abriste.
 *
 * ALCANCE: solo index.html, y solo los contextos donde el string es VISIBLE
 * (toast(), textContent=, placeholder=, encodeURIComponent para WhatsApp).
 * NO revisa console.* (nadie los lee) ni claves de datos.
 *
 * CUIDADO — la distincion critica de este proyecto:
 * 'Tecnico en terreno' es el VALOR guardado en Firestore, no un texto de pantalla. Ponerle tilde
 * romperia las comparaciones (cargo === 'Tecnico en terreno') y la lectura de documentos ya
 * guardados. El display se hace via _cargoLabel(). Ver DESIGN.md. Por eso hay DATOS_INTOCABLES.
 *
 * Y el plural mueve la tilde: "cotizacion" la lleva, "cotizaciones" NO.
 * Nunca formes el plural con  + 'es'  sobre una palabra acentuada.
 */
const fs = require('fs');
const L = fs.readFileSync(process.argv[2] || 'index.html', 'utf8').split(/\r?\n/);

/* REGLA, no lista.
 * La primera version de este script era un diccionario de ~20 palabras. Fallo exactamente como
 * fallaron la migracion de emojis y la de radios: `accion` no estaba en la lista, asi que
 * "Esta accion no se puede deshacer" paso limpio dos veces. Un mutante lo destapo.
 *
 * En espanol, TODA palabra aguda terminada en -ion lleva tilde: accion->acción, camion->camión,
 * region->región. El plural la pierde: acciones, camiones. Eso es una regla, y no envejece.
 *
 * La lista queda solo para los irregulares que ninguna regla simple cubre. */
const REGLA_ION = /^[a-zñáéíóú]{2,}[ct]?ion$/i;   // termina en -ion (singular)

// Monosilabos: la RAE los escribe SIN tilde desde 2010. La regla no aplica.
const EXCEPCIONES_ION = new Set(['ion', 'guion', 'pion', 'muon']);

// Irregulares: palabras que llevan tilde y no terminan en -ion.
const IRREGULARES = {
  tecnico: 'técnico',
  numero: 'número',
  fotografia: 'fotografía',
  aqui: 'aquí',
  mas: 'más',
  despues: 'después',
  telefono: 'teléfono',
  codigo: 'código',
  ultima: 'última', ultimo: 'último',
  pagina: 'página',
  sesion: 'sesión',   // termina en -ion, pero lo dejamos explicito por claridad
};

// Sugiere la forma correcta. En MAYUSCULAS la tilde tambien se escribe (RAE): DISTRIBUCIÓN.
const acentuarIon = (p) => p.slice(0, -3) + (p === p.toUpperCase() ? 'IÓN' : 'ión');

// El VALOR de datos que NO se traduce (documentado en DESIGN.md).
const DATOS_INTOCABLES = [/'Tecnico en terreno'/, /"Tecnico en terreno"/, /cargo === 'Tecnico/];

// Contextos donde el string es VISIBLE.
// Los tres ultimos entraron cuando confirm()/prompt()/alert() se reemplazaron por el dialogo
// propio: sus textos pasaron a ser visibles y este script no los miraba. Ahi vivian, entre
// otros, "Esta accion no se puede deshacer" x2 y "Eliminar N cotizacion".
//
// REGLA: cada vez que nace una superficie de texto visible, este array crece con ella.
// _vacio() nacio el 2026-07-09 y se llevo 14 estados vacios fuera de `textContent =`.
// Sin las dos ultimas lineas, este script habria seguido diciendo "0 sin tilde" mientras
// dejaba de mirar catorce mensajes. Un check que no declara donde busca no se puede evaluar.
const VISIBLE = [
  /toast\('([^']*)'\)/g,
  /textContent\s*=\s*'([^']*)'/g,
  /placeholder="([^"]*)"/g,
  /encodeURIComponent\('([^']*)'/g,
  /_(?:confirmar|pedirTexto|avisar)\('([^']*)'/g,   // el mensaje
  /titulo:\s*'([^']*)'/g,                            // el titulo del dialogo
  /okTexto:\s*'([^']*)'/g,                           // la etiqueta del boton
  /_vacio\('([^']*)'/g,                              // estado vacio: lo que constata
  /_vacio\('[^']*',\s*'([^']*)'/g,                   // estado vacio: lo que enseña
];

const hits = [];
L.forEach((linea, i) => {
  if (DATOS_INTOCABLES.some((r) => r.test(linea))) return;
  if (/console\.(log|warn|error)/.test(linea)) return; // logs: no los ve el usuario
  VISIBLE.forEach((re) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(linea))) {
      // Tokenizar en palabras. \b no respeta acentos, asi que partimos por lo que NO es letra.
      const palabras = m[1].split(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/).filter(Boolean);
      for (const p of palabras) {
        const min = p.toLowerCase();
        // 1) La REGLA: aguda terminada en -ion. Los plurales (-iones) no matchean.
        if (REGLA_ION.test(min) && !EXCEPCIONES_ION.has(min)) {
          hits.push({ ln: i + 1, txt: m[1], malo: p, bueno: acentuarIon(p) });
          continue;
        }
        // 2) Los irregulares, y su PLURAL. Una esdrujula conserva la tilde al pluralizar
        //    (tecnico->tecnicos, numero->numeros), al reves que las agudas en -ion, que la
        //    pierden (accion->acciones). El diccionario guardaba solo el singular: "No hay
        //    tecnicos registrados" pasaba limpio. Otra lista con el borde mal dibujado.
        const raiz = IRREGULARES[min] ? min
                   : (min.endsWith('s') && IRREGULARES[min.slice(0, -1)]) ? min.slice(0, -1)
                   : null;
        if (raiz) {
          let bueno = IRREGULARES[raiz] + (raiz === min ? '' : 's');
          if (p[0] === p[0].toUpperCase()) bueno = bueno[0].toUpperCase() + bueno.slice(1);
          hits.push({ ln: i + 1, txt: m[1], malo: p, bueno });
        }
      }
    }
  });
});

console.log('\n  Tildes faltantes en texto visible — EMVAL\n');
if (!hits.length) {
  console.log('  0 palabras sin tilde en toasts, textContent, placeholders y mensajes de WhatsApp.\n');
  process.exit(0);
}
hits.forEach((h) => {
  console.log('  index.html:' + String(h.ln).padEnd(6) + h.malo + ' -> ' + h.bueno);
  console.log('     "' + h.txt.slice(0, 90) + '"');
});
console.log('\n  ' + hits.length + ' hallazgo(s).\n');
process.exit(1);
