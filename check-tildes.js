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
 * ALCANCE: solo index.html, en DOS pases sobre todo lo que el usuario lee:
 *   PASE 1 — strings de JS y atributos: toast(), textContent=, placeholder=,
 *            encodeURIComponent (WhatsApp), _vacio(), _error(), _anunciar()...
 *   PASE 2 — NODOS DE TEXTO DEL MARKUP: lo que va entre > y < (botones, headings, labels, divs).
 * NO revisa console.* (nadie los lee) ni claves de datos.
 *
 * El PASE 2 se anadio el 2026-07-10. La cabecera decia "solo los contextos donde el string es
 * VISIBLE (toast, textContent, placeholder, _vacio)" y esa lista se leyo como exhaustiva. Un
 * <button>+ Agregar item</button> es tan visible como un toast, y no estaba: ahi vivian "item"
 * (-> ítem) e "ITEMS A COTIZAR". El alcance declarado excluia la clase de texto mas obvia que hay.
 *
 * OJO CON LA UNIDAD DE LA EXCLUSION. Este script ha tenido DOS puntos ciegos, los dos en lo que
 * su alcance se callaba que no miraba: (1) descartaba la LINEA entera al ver un console.*, cuando
 * el patron de error mete console y toast en la misma linea; (2) no miraba los nodos de texto del
 * markup. La leccion no cambia: una lista de contextos no es la lista de TODOS los contextos.
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
  // item -> ítem: llana terminada en -m. El plural CONSERVA la tilde (ítems), porque termina en
  // -ms (s precedida de consonante), como cómics o bíceps. La logica de plural de abajo le pega
  // la 's' a la forma acentuada, asi que sale bien. Vivia en un <button> del flujo de cotizacion,
  // en un NODO DE TEXTO del markup, que este script no miraba (ver mas abajo).
  item: 'ítem',
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

// LA REGLA, en un solo sitio. Antes vivia dentro del bucle de VISIBLE; al anadir un segundo
// pase (los nodos de texto del markup) habria que duplicarla, y una regla duplicada es dos
// reglas que un dia divergen. Devuelve {malo, bueno} o null.
function revisarPalabra(p) {
  const min = p.toLowerCase();
  // 1) La REGLA: aguda terminada en -ion. Los plurales (-iones) no matchean.
  if (REGLA_ION.test(min) && !EXCEPCIONES_ION.has(min)) return { malo: p, bueno: acentuarIon(p) };
  // 2) Los irregulares, y su PLURAL. Una esdrujula conserva la tilde al pluralizar
  //    (tecnico->tecnicos), al reves que las agudas en -ion, que la pierden (accion->acciones).
  const raiz = IRREGULARES[min] ? min
             : (min.endsWith('s') && IRREGULARES[min.slice(0, -1)]) ? min.slice(0, -1)
             : null;
  if (raiz) {
    let bueno = IRREGULARES[raiz] + (raiz === min ? '' : 's');
    // ITEMS -> ÍTEMS, no "Ítems": si la palabra viene toda en mayusculas, la tilde va igual y
    // el resto tambien (RAE). Si solo empieza en mayuscula, capitalizamos la inicial.
    if (p.length > 1 && p === p.toUpperCase()) bueno = bueno.toUpperCase();
    else if (p[0] === p[0].toUpperCase()) bueno = bueno[0].toUpperCase() + bueno.slice(1);
    return { malo: p, bueno };
  }
  return null;
}
const palabrasDe = (s) => s.split(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/).filter(Boolean);

const hits = [];

// PASE 1: strings de JS y atributos (toast, textContent, placeholder, _vacio, _error...).
L.forEach((linea_, i) => {
  const linea = sinIntocables(sinConsole(linea_));
  VISIBLE.forEach((re) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(linea))) {
      for (const p of palabrasDe(m[1])) {
        const r = revisarPalabra(p);
        if (r) hits.push({ ln: i + 1, txt: m[1], malo: r.malo, bueno: r.bueno });
      }
    }
  });
});

// PASE 2: TEXTO RENDERIZADO —lo que va entre > y <—, venga de donde venga.
//
// Primera version de este pase (misma tarde): vaciaba <script> Y <style> antes de escanear.
// Eso tiro por la borda el HTML GENERADO —`html += '<div>ITEMS</div>'`, `innerHTML = '...'`—,
// que vive dentro de <script> y es donde se construyen las listas, las tarjetas y los badges.
// Habia CUATRO tildes ahi (ITEMS, Descripcion, conexion, cotizacion) que el pase seguia sin ver.
// Arreglar "no miro el markup" creando "no miro el markup generado" es la leccion repitiendose
// dentro de su propia correccion. El texto que el usuario lee no distingue si nacio estatico o
// de un `html +=`: entre > y < hay una palabra, y hay que mirarla.
//
// Ahora solo se vacia <style> (los selectores CSS usan `>` y no son UI). <script> se conserva.
// El riesgo es un falso positivo por un operador JS (`a > palabra < b`): raro, ruidoso y
// corregible — nunca un falso negativo, que es el unico resultado inaceptable (doctrina del repo).
// La clase [^<>{}'"] mantiene cada match dentro de un literal o nodo, sin cruzar comillas.
const preservandoLineas = (s) => s.replace(/[^\n]/g, ' ');
const renderizado = L.join('\n').replace(/<style[\s\S]*?<\/style>/gi, (b) => preservandoLineas(b));
for (const m of renderizado.matchAll(/>([^<>{}'"]+)</g)) {
  const txt = m[1].replace(/\s+/g, ' ').trim();
  if (!txt || !/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(txt)) continue;
  const ln = renderizado.slice(0, m.index).split('\n').length;
  for (const p of palabrasDe(m[1])) {
    const r = revisarPalabra(p);
    if (r) hits.push({ ln, txt, malo: r.malo, bueno: r.bueno });
  }
}

console.log('\n  Tildes faltantes en texto visible — EMVAL\n');
if (!hits.length) {
  console.log('  0 sin tilde: ni en strings de JS, ni en atributos, ni en el texto renderizado\n' +
              '  (markup estatico y HTML generado por `html += \'...\'`).\n');
  process.exit(0);
}
hits.forEach((h) => {
  console.log('  index.html:' + String(h.ln).padEnd(6) + h.malo + ' -> ' + h.bueno);
  console.log('     "' + h.txt.slice(0, 90) + '"');
});
console.log('\n  ' + hits.length + ' hallazgo(s).\n');
process.exit(1);
