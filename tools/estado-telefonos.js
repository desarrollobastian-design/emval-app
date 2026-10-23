/* ¿Se pueden publicar ya las reglas de la etapa 2 de Firebase Auth? — SOLO LECTURA.

   Las reglas nuevas (tests/reglas/firestore.rules) piden sesion de Firebase para leer y escribir. Si
   se publican mientras un telefono tiene la version vieja, o no tiene sesion, o tiene trabajo en su
   cola, ese trabajo queda trabado en el telefono (no se pierde: no sube). Por eso cada telefono, desde
   la etapa 1, reporta en `alertas`:
     - pausadas_<dispositivo>: `auth` { etapa, sesion, uid }, `otsPendientes` (cola de OT cerradas sin
       subir) y sus pausadas (`items`, con `pendienteSync`);
     - correos_<dispositivo>: `pendientes` (avisos sin salir).
   Esta herramienta los junta y dice, telefono por telefono, si esta listo:
     LISTO          version con Auth + sesion de Firebase + nada en cola.
     VERSION VIEJA  el reporte no trae `auth`: ese telefono no abrio la app nueva.
     SIN SESION     version nueva, pero nadie entro con señal todavia en ese telefono.
     CON COLA       OT, pausadas o correos sin subir.
     SIN NOTICIAS   no reporta hace mas de --dias (3 por defecto): no se sabe; hay que pedirle a ese
                    tecnico que abra la app con señal.
   Un telefono que no reporta hace mas de --olvidar (30) dias se lista aparte: decide Bastian.

   NUNCA ESCRIBE. Sale 0 si TODOS los telefonos activos estan LISTOS; 2 si no; 1 si no pudo leer.

   Uso (PowerShell, desde la raiz del repo; la credencial es la de tools/admin-sdk.js):
     $env:EMVAL_SA = "C:\Users\corex\Secretos\emval-admin-sdk.json"     # o --adc
     node tools/estado-telefonos.js
     node tools/estado-telefonos.js --dias 2 --olvidar 45 */

const args = process.argv.slice(2);
function numArg(nombre, def) {
  const i = args.indexOf(nombre);
  const v = i >= 0 ? Number(args[i + 1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : def;
}
const DIAS = numArg('--dias', 3);
const OLVIDAR = numArg('--olvidar', 30);
const DIA = 86400000;

function ms(v) {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
}
function fecha(t) { return t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') : '—'; }

// Junta los dos reportes de cada telefono y decide. Exportada para la prueba.
function evaluar(docs, ahora) {
  const tel = {};
  for (const d of docs) {
    const x = d.data || {};
    const m = /^(pausadas|correos)_(.+)$/.exec(d.id);
    if (!m) continue;
    const t = tel[m[2]] = tel[m[2]] || { dispositivo: m[2], usuario: '', ultimo: 0 };
    t.ultimo = Math.max(t.ultimo, ms(x.actualizadoEn));
    if (x.usuario) t.usuario = x.usuario;
    if (m[1] === 'pausadas') {
      t.conReporte = true;
      t.auth = x.auth || null;
      t.otsPendientes = typeof x.otsPendientes === 'number' ? x.otsPendientes : null;
      t.pausadasSinSubir = (x.items || []).filter(i => i && i.pendienteSync === true).length;
    } else {
      t.correos = typeof x.pendientes === 'number' ? x.pendientes : 0;
    }
  }
  const activos = [], olvidados = [];
  for (const t of Object.values(tel)) {
    const edad = ahora - t.ultimo;
    if (t.ultimo && edad > OLVIDAR * DIA) { t.estado = 'OLVIDADO'; olvidados.push(t); continue; }
    const cola = (t.otsPendientes || 0) + (t.pausadasSinSubir || 0) + (t.correos || 0);
    if (!t.ultimo || edad > DIAS * DIA) t.estado = 'SIN NOTICIAS';
    else if (!t.conReporte || !t.auth || !(t.auth.etapa >= 1)) t.estado = 'VERSION VIEJA';
    else if (!t.auth.sesion) t.estado = 'SIN SESION';
    else if (t.otsPendientes === null) t.estado = 'VERSION VIEJA';
    else if (cola > 0) t.estado = 'CON COLA';
    else t.estado = 'LISTO';
    t.cola = cola;
    activos.push(t);
  }
  const listo = activos.length > 0 && activos.every(t => t.estado === 'LISTO');
  return { activos, olvidados, listo };
}

async function principal() {
  const { db, modo } = require('./admin-sdk').iniciarAdmin(args);
  console.log('estado-telefonos · ' + modo + ' · SOLO LECTURA · sin noticias si no reporta en ' + DIAS + ' dias\n');
  const snap = await db.collection('alertas').get();
  const docs = snap.docs.filter(d => /^(pausadas|correos)_/.test(d.id)).map(d => ({ id: d.id, data: d.data() }));
  const r = evaluar(docs, Date.now());
  const fila = t => '  ' + t.estado.padEnd(14) + ' ' + String(t.usuario || '(sin usuario)').padEnd(22) +
    ' tel ' + String(t.dispositivo).slice(0, 14).padEnd(14) + ' ultimo ' + fecha(t.ultimo) +
    (t.auth ? ' · sesion ' + (t.auth.sesion ? 'si' : 'no') : '') +
    (t.cola ? ' · en cola: ' + [t.otsPendientes ? t.otsPendientes + ' OT' : '', t.pausadasSinSubir ? t.pausadasSinSubir + ' pausadas' : '', t.correos ? t.correos + ' correos' : ''].filter(Boolean).join(', ') : '');
  r.activos.sort((a, b) => a.estado.localeCompare(b.estado)).forEach(t => console.log(fila(t)));
  if (r.olvidados.length) {
    console.log('\nSin reportar hace mas de ' + OLVIDAR + ' dias (no cuentan; confirmar con Bastian si ese telefono sigue en uso):');
    r.olvidados.forEach(t => console.log(fila(t)));
  }
  console.log('\n' + (r.listo
    ? '✅ Todos los telefonos activos estan LISTOS: se pueden publicar las reglas de la etapa 2.'
    : '⛔ Todavia NO: ' + r.activos.filter(t => t.estado !== 'LISTO').length + ' de ' + r.activos.length +
      ' telefonos activos no estan listos (ver arriba). Las reglas siguen sin publicar.'));
  process.exit(r.listo ? 0 : 2);
}

module.exports = { evaluar };
if (require.main === module) principal().catch(e => { console.error('FALLA: ' + (e && (e.code || e.message))); process.exit(1); });
