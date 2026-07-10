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
 * (toast(), textContent=, placeholder=, encodeURIComponent para WhatsApp, _vacio()).
 * NO revisa console.* (nadie los lee) ni claves de datos.
 *
 * OJO CON LA UNIDAD DE LA EXCLUSION. Durante dias este script reporto CERO teniendo un
 * hallazgo real, porque descartaba la LINEA entera al ver un console.*. Y el patron de error
 * mas comun del archivo mete el console y el toast en la misma linea. Ahora se vacia la
 * EXPRESION (parentesis balanceados, comillas respetadas) y se sigue mirando el resto.
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
  /_error\('([^']*)'/g,                              // error: la accion ("cargar la facturación")
  /_error\([^;]*?,\s*'([^']*)'\s*\)/g,               // error: la salida ("Inténtalo de nuevo.")
  /_anunciar\('([^']*)'/g,                           // lo que oye un lector de pantalla
];

/* SE EXCLUYE LA EXPRESION, NO LA LINEA.
   La version anterior hacia `if (/console\.(log|warn|error)/.test(linea)) return;` y reportaba
   CERO durante dias. En este codebase el patron dominante de error cabe en una sola linea:

       } catch(e) { console.error(e); toast('Error cargando facturacion'); }

   El toast VISIBLE se iba al cubo junto con el console.error. 98 lineas del archivo tienen un
   console.*; seis de ellas llevan ademas texto que el usuario lee. Ese era el agujero.

   check-a11y.js declara la doctrina de este repo: "un falso negativo silencioso es el peor
   resultado posible; errar hacia el falso positivo, nunca hacia el falso negativo". Este script
   hacia justo lo contrario. Y los 41 mutantes no lo vieron porque todos inyectaban el defecto
   en lineas SIN console: un mutante prueba que la regla funciona DONDE EL CHECK MIRA.

   Leccion, novena forma: el punto ciego no estaba en lo que el check incluia, sino en lo que
   excluia. Al escribir una exclusion, pregunta cual es su unidad. Casi nunca es la linea. */
function sinConsole(l) {
  const re = /console\.(log|warn|error|info|debug)\s*\(/g;
  let out = '', last = 0, m;
  while ((m = re.exec(l))) {
    out += l.slice(last, m.index);
    let j = m.index + m[0].length, prof = 1, comilla = null;
    for (; j < l.length; j++) {
      const c = l[j];
      if (comilla) {
        if (c === '\\') { j++; continue; }
        if (c === comilla) comilla = null;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') { comilla = c; continue; }
      if (c === '(') prof++;
      else if (c === ')') { prof--; if (!prof) break; }
    }
    last = Math.min(j + 1, l.length);
    re.lastIndex = last;
  }
  return out + l.slice(last);
}

// Los DATOS de Firestore tampoco son "la linea": son el literal. Se vacia el literal y se sigue
// mirando el resto de la linea, que puede llevar un toast perfectamente visible.
function sinIntocables(l) {
  return l.replace(/(['"])Tecnico en terreno\1/g, '$1$1');
}

const hits = [];
L.forEach((linea_, i) => {
  const linea = sinIntocables(sinConsole(linea_));
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
