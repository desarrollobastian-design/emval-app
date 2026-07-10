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

// palabra_sin_tilde -> con_tilde
const PALABRAS = {
  cotizacion: 'cotización', Cotizacion: 'Cotización',
  tecnico: 'técnico', Tecnico: 'Técnico',
  numero: 'número', Numero: 'Número',
  sesion: 'sesión', Sesion: 'Sesión',
  conexion: 'conexión', Conexion: 'Conexión',
  direccion: 'dirección', Direccion: 'Dirección',
  descripcion: 'descripción', Descripcion: 'Descripción',
  informacion: 'información', Informacion: 'Información',
  administracion: 'administración', Administracion: 'Administración',
  facturacion: 'facturación', Facturacion: 'Facturación',
  comparacion: 'comparación', Comparacion: 'Comparación',
  fotografia: 'fotografía', Fotografia: 'Fotografía',
  aqui: 'aquí', Aqui: 'Aquí',
  mas: 'más',
  despues: 'después', Despues: 'Después',
  telefono: 'teléfono', Telefono: 'Teléfono',
  codigo: 'código', Codigo: 'Código',
  ultima: 'última', Ultima: 'Última', ultimo: 'último', Ultimo: 'Último',
  pagina: 'página', Pagina: 'Página',
};

// El VALOR de datos que NO se traduce (documentado en DESIGN.md).
const DATOS_INTOCABLES = [/'Tecnico en terreno'/, /"Tecnico en terreno"/, /cargo === 'Tecnico/];

// Contextos donde el string es VISIBLE.
const VISIBLE = [
  /toast\('([^']*)'\)/g,
  /textContent\s*=\s*'([^']*)'/g,
  /placeholder="([^"]*)"/g,
  /encodeURIComponent\('([^']*)'/g,
];

const hits = [];
L.forEach((linea, i) => {
  if (DATOS_INTOCABLES.some((r) => r.test(linea))) return;
  if (/console\.(log|warn|error)/.test(linea)) return; // logs: no los ve el usuario
  VISIBLE.forEach((re) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(linea))) {
      const txt = m[1];
      for (const [malo, bueno] of Object.entries(PALABRAS)) {
        // \b no funciona bien con acentos; usamos limites explicitos
        const rx = new RegExp('(^|[^A-Za-zÁÉÍÓÚáéíóúñÑ])' + malo + '($|[^A-Za-zÁÉÍÓÚáéíóúñÑ])');
        if (rx.test(txt)) hits.push({ ln: i + 1, txt, malo, bueno });
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
