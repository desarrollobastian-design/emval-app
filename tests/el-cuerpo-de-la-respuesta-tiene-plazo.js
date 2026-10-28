/* Prueba de regresion — `_fetchConTimeout` tambien pone plazo a la LECTURA DEL CUERPO (revision de Codex,
   ronda 5 del PR #64, 24-10-2026).

   Antes, el temporizador se cortaba apenas llegaban las cabeceras y `resp.json()` podia quedar esperando
   para siempre si el cuerpo no terminaba de llegar (mala señal). Con las colas de una sola corrida
   (`sincronizarOTsPendientes`, `sincronizarEnlacesPDFPendientes`), eso dejaba la cola de esa pestaña
   trabada hasta recargar. Ejecuta la funcion REAL de index.html con un `fetch` falso. Que se exige:
   1. Un cuerpo que nunca termina: `json()` y `text()` fallan dentro del plazo, no quedan colgados.
   2. Una respuesta normal se lee igual que siempre.
   3. Las cabeceras que no llegan: el `fetch` falla dentro del plazo (como antes).

   Uso:  node tests/el-cuerpo-de-la-respuesta-tiene-plazo.js index.html
   Sale 0 si todo se cumple; 1 si no. */

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8').replace(/\r\n/g, '\n');
const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); return !!ok; }

const m = src.match(/function _fetchConTimeout\(url, opts, ms\) \{[\s\S]*?\n\}/);
chequear(!!m, 'no se encontro _fetchConTimeout (¿se renombro?)');

const abortado = () => Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
// fetch falso. modo 'cuelga-cuerpo': las cabeceras llegan, el cuerpo nunca termina (salvo que aborten);
// 'normal': responde {ok:1}; 'cuelga-cabeceras': ni siquiera llegan las cabeceras.
function fetchFalso(modo) {
  return function(url, opts) {
    const senal = opts && opts.signal;
    const alAbortar = (rej) => { if (senal) senal.addEventListener('abort', () => rej(abortado())); };
    if (modo === 'cuelga-cabeceras') return new Promise((res, rej) => alAbortar(rej));
    const cuerpo = modo === 'normal'
      ? () => Promise.resolve({ ok: 1 })
      : () => new Promise((res, rej) => alAbortar(rej));
    return Promise.resolve({ ok: true, status: 200, json: cuerpo, text: () => cuerpo().then(x => JSON.stringify(x)) });
  };
}
function cargar(modo) {
  return new Function('fetch', 'AbortController', 'setTimeout', 'clearTimeout', m[0] + '\nreturn _fetchConTimeout;')(
    fetchFalso(modo), AbortController, setTimeout, clearTimeout);
}
// Resuelve con lo que paso: 'ok', 'fallo' o 'COLGADO' si no termino en `ms`.
function aTiempo(p, ms) {
  return Promise.race([p.then(() => 'ok', () => 'fallo'), new Promise(r => setTimeout(() => r('COLGADO'), ms))]);
}

(async () => {
  console.log('El cuerpo de una respuesta tambien tiene plazo (_fetchConTimeout)\n');
  if (!m) return terminar();

  const f1 = cargar('cuelga-cuerpo');
  const r1 = await aTiempo(f1('https://x/y', {}, 60).then(r => r.json()), 600);
  const r1b = await aTiempo(cargar('cuelga-cuerpo')('https://x/y', {}, 60).then(r => r.text()), 600);
  console.log('1) Cuerpo que nunca termina → json(): ' + (r1 === 'fallo' ? 'falla a tiempo ✓' : r1 + ' ✗') + ' · text(): ' + (r1b === 'fallo' ? 'falla a tiempo ✓' : r1b + ' ✗'));
  chequear(r1 === 'fallo' && r1b === 'fallo', 'con un cuerpo que nunca termina, la lectura queda colgada sin plazo (la cola de una sola corrida se traba) (Codex, ronda 5)');

  const f2 = cargar('normal');
  let v2 = null;
  const r2 = await aTiempo(f2('https://x/y', {}, 60).then(r => r.json()).then(v => { v2 = v; }), 600);
  console.log('2) Respuesta normal         → ' + (r2 === 'ok' && v2 && v2.ok === 1 ? 'se lee igual ✓' : r2 + ' ✗'));
  chequear(r2 === 'ok' && v2 && v2.ok === 1, 'una respuesta normal ya no se lee bien');

  const r3 = await aTiempo(cargar('cuelga-cabeceras')('https://x/y', {}, 60), 600);
  console.log('3) Sin cabeceras            → ' + (r3 === 'fallo' ? 'falla a tiempo ✓' : r3 + ' ✗'));
  chequear(r3 === 'fallo', 'sin cabeceras, el fetch no falla dentro del plazo');

  terminar();
})().catch(e => { console.error('FALLA — la prueba se cayo:', e && e.message); process.exit(1); });

function terminar() {
  console.log('');
  if (fallos.length) { console.log('FALLA (' + fallos.length + '):'); fallos.forEach(f => console.log(f)); process.exit(1); }
  console.log('OK — ni las cabeceras ni el cuerpo pueden dejar una llamada colgada sin plazo.');
  process.exit(0);
}
