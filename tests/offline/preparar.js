/* Arma el sitio de prueba: la app con Firebase y EmailJS sustituidos por espias.

   node tests/offline/preparar.js [<git-ref-sin-el-fix>]

   Sin argumentos deja solo `index.html` (la app actual). Con un ref de git deja ademas
   `prefix.html`, que es esa version pasada por el mismo arnes — la CONTRAPRUEBA: si el guion
   pasa contra las dos, no esta midiendo nada.

   Escribe todo en tests/offline/sitio/, que esta en .gitignore: son 900 KB por copia. */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const AQUI = __dirname;
const RAIZ = path.resolve(AQUI, '..', '..');
const SITIO = path.join(AQUI, 'sitio');
const generar = require(path.join(AQUI, 'gen-arnes.js')).generar;

fs.mkdirSync(SITIO, { recursive: true });

generar(path.join(RAIZ, 'index.html'), path.join(SITIO, 'index.html'));

const ref = process.argv[2];
if (ref) {
  const crudo = path.join(SITIO, '_' + ref.replace(/[^\w.-]/g, '_') + '.html');
  fs.writeFileSync(crudo, execFileSync('git', ['show', ref + ':index.html'], { cwd: RAIZ, maxBuffer: 64 * 1024 * 1024 }));
  generar(crudo, path.join(SITIO, 'prefix.html'));
  fs.unlinkSync(crudo);
  console.log('contraprueba lista desde ' + ref + ' → prefix.html');
}

// La app carga estos con ruta relativa.
for (const f of ['manifest.json', 'icon.png']) {
  try { fs.copyFileSync(path.join(RAIZ, f), path.join(SITIO, f)); } catch (e) {}
}
try {
  fs.mkdirSync(path.join(SITIO, 'vendor'), { recursive: true });
  for (const f of fs.readdirSync(path.join(RAIZ, 'vendor'))) {
    fs.copyFileSync(path.join(RAIZ, 'vendor', f), path.join(SITIO, 'vendor', f));
  }
} catch (e) {}

console.log('\nAhora, en dos terminales:');
console.log('  1) cd tests/offline/sitio && python -m http.server 8765');
console.log('  2) node tests/offline/prueba-offline.js index.html A');
