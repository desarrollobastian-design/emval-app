/* ¿Se pueden publicar ya las reglas de la etapa 2 de Firebase Auth? — SOLO LECTURA.

   Las reglas nuevas (tests/reglas/firestore.rules) piden sesion de Firebase para leer y escribir. Si
   se publican mientras un telefono tiene la version vieja, o no tiene sesion, o tiene trabajo en su
   cola, ese trabajo queda trabado en el telefono (no se pierde: no sube). Por eso cada telefono, desde
   la etapa 1, reporta en `alertas/pausadas_<dispositivo>`: `auth` { etapa, sesion, uid } y `colas`
   { ots, pausadas, correos, enlaces, cierres, bajas } (lo que tiene sin subir, cola por cola).
   La decision sale de ESE reporte y de SU fecha (Codex P2-7). `alertas/correos_<dispositivo>` solo
   suma cola si es reciente; nunca hace pasar por fresco un reporte viejo.
   Telefono por telefono:
     LISTO          version con Auth + sesion de Firebase + las SEIS colas en 0.
     VERSION VIEJA  el reporte no trae `auth` ni `colas` (o es del formato de la primera version de la
                    etapa 1, que solo traia `otsPendientes`): no dice todas sus colas.
     REPORTE INCOMPLETO  trae `colas`, pero le falta alguna de las seis (o viene vacio): no se sabe.
     SIN SESION     version nueva, pero nadie entro con señal todavia en ese telefono.
     CON COLA       algo sin subir, o una cola que el telefono no pudo contar.
     SIN NOTICIAS   su reporte tiene mas de --dias (3 por defecto): no se sabe; hay que pedirle a ese
                    tecnico que abra la app con señal.
   Un telefono SIN NINGUN reporte (ni el principal ni el de correos) en mas de --olvidar (30) dias se
   lista aparte: decide Bastian. Con cualquier actividad reciente, sigue contando (revision final de
   Codex del PR #64, 24-10-2026).

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

// Decide telefono por telefono. Exportada para la prueba.
// La decision sale de UN reporte: pausadas_<dispositivo>, que el telefono escribe con su sesion y trae
// `auth` y TODAS sus colas (`colas`: ots, pausadas, correos, enlaces, cierres y bajas). Su fecha es la
// que cuenta: antes se tomaba la mas reciente entre ese reporte y el de correos, y un correo de hoy
// "refrescaba" una sesion y una cola de hace diez dias (Codex P2-7, 23-10-2026). El reporte de correos
// solo puede AGREGAR cola (si es reciente y dice que hay pendientes); nunca da por fresco a un telefono.
const NOMBRES_COLA = { ots: 'OT', pausadas: 'pausadas', correos: 'correos', enlaces: 'enlaces de PDF', cierres: 'cierres', bajas: 'bajas' };
const SEIS_COLAS = Object.keys(NOMBRES_COLA);
function evaluar(docs, ahora) {
  const tel = {};
  for (const d of docs) {
    const x = d.data || {};
    const m = /^(pausadas|correos)_(.+)$/.exec(d.id);
    if (!m) continue;
    const t = tel[m[2]] = tel[m[2]] || { dispositivo: m[2], usuario: '', ultimo: 0 };
    if (x.usuario) t.usuario = x.usuario;
    if (m[1] === 'pausadas') {
      t.conReporte = true;
      t.ultimo = ms(x.actualizadoEn);
      t.auth = x.auth || null;
      // Solo `colas` cuenta. Un reporte de la primera version de la etapa 1 (solo `otsPendientes`) no
      // dice sus seis colas: queda como VERSION VIEJA, nunca LISTO (revision final de Codex, nuevo 5).
      t.colas = x.colas && typeof x.colas === 'object' && !Array.isArray(x.colas) ? Object.assign({}, x.colas) : null;
    } else {
      t.correosReporte = { pendientes: typeof x.pendientes === 'number' ? x.pendientes : 0, en: ms(x.actualizadoEn) };
    }
  }
  const activos = [], olvidados = [];
  for (const t of Object.values(tel)) {
    const edad = ahora - t.ultimo;
    // OLVIDADO solo si NINGUN reporte suyo es reciente: un telefono que hoy reporto correos sigue en
    // uso aunque su reporte principal sea viejo (revision final de Codex, nuevo 5).
    const ultimaSenal = Math.max(t.ultimo || 0, (t.correosReporte && t.correosReporte.en) || 0);
    if (ultimaSenal && ahora - ultimaSenal > OLVIDAR * DIA) { t.estado = 'OLVIDADO'; olvidados.push(t); continue; }
    const colas = t.colas ? Object.assign({}, t.colas) : null;
    const faltan = colas ? SEIS_COLAS.filter(k => !(k in colas)) : SEIS_COLAS;
    // Un reporte de correos RECIENTE con pendientes suma cola (es otra señal, no reemplaza a la principal).
    if (colas && t.correosReporte && t.correosReporte.pendientes > 0 && ahora - t.correosReporte.en <= DIAS * DIA) {
      colas.correos = Math.max(colas.correos || 0, t.correosReporte.pendientes);
    }
    const valores = colas ? Object.keys(colas).map(k => colas[k]) : [];
    const noSe = valores.some(v => v === null || typeof v !== 'number');
    t.detalleCola = colas ? Object.keys(colas).filter(k => colas[k] === null || colas[k] > 0)
      .map(k => (colas[k] === null ? '¿?' : colas[k]) + ' ' + (NOMBRES_COLA[k] || k)).join(', ') : '';
    if (!t.conReporte || !t.ultimo || edad > DIAS * DIA) t.estado = 'SIN NOTICIAS';
    else if (!t.auth || !(t.auth.etapa >= 1) || !colas) t.estado = 'VERSION VIEJA';
    else if (faltan.length) { t.estado = 'REPORTE INCOMPLETO'; t.detalleCola = 'faltan: ' + faltan.map(k => NOMBRES_COLA[k]).join(', '); }
    else if (!t.auth.sesion) t.estado = 'SIN SESION';
    else if (noSe || valores.some(v => v > 0)) t.estado = 'CON COLA';
    else t.estado = 'LISTO';
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
    (t.detalleCola ? ' · en cola: ' + t.detalleCola : '');
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
