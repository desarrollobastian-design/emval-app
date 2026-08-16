/* Prueba de regresion — un aviso de OT no se manda dos veces.

   EL CASO (OT #614727, 14 y 15-08-2026). Pedro recibio DOS correos "OT #614727 completada" con
   un dia de diferencia y creyo que se habia duplicado el trabajo. No se duplico: en `ordenes`
   hay UNA sola OT 614727 y no se toco despues de las 17:38 del 14-08. Lo que se mando dos veces
   fue el AVISO.

   Al cerrar la hoja en UNIMARC QUILLON —local de señal pesima— el POST a EmailJS LLEGO al
   servidor y el correo SALIO, pero la respuesta no volvio al telefono. El `await` rechazo con un
   TypeError sin `.status`, que se clasificaba 'red' = "no salio, reintentalo", y el aviso se
   encolo. Al dia siguiente la cola lo despacho. Quedo fechado al minuto: el doc
   `alertas/correos_dev_i352ho73w3rz` reporto `pendientes: 0` a las 16:59:12 del 15-08.

   Lo que se prueba aca es el invariante que faltaba: la cola garantizaba "ningun aviso se
   pierde" y nunca prometio "ninguno se manda dos veces".

   🔴 El duplicado NO se elimina del todo, y eso es a proposito: distinguir "el POST no salio" de
   "salio y no supe" es imposible desde el cliente y EmailJS no acepta clave de idempotencia. La
   politica es ANTE LA DUDA SE MANDA, PERO MARCADO — un aviso perdido es un trabajo que no se
   factura; un duplicado marcado es un susto que ya no ocurre.

   Extrae la cola TAL CUAL esta en index.html y la corre con reloj y temporizadores falsos.

   Uso:  node tests/aviso-no-sale-dos-veces.js index.html   (desde la raiz del repo)
   Sale 0 si el aviso no se duplica y sigue sin perderse; 1 si alguna garantia se cayo. */

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

function extraer(desde, hasta) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('No se encontro: ' + desde);
  const j = src.indexOf(hasta, i);
  if (j < 0) throw new Error('No se encontro el fin de: ' + desde);
  return src.slice(i, j);
}

// Hasta `purgarColaCorreos` para que entre tambien `reintentarCorreosAhora`, que es donde una
// persona puede reabrir la ventana de reintento a mano.
const codCola = extraer('const _CORREOS_KEY =', '// Contencion: vaciar una cola envenenada');

const mIntervalo = src.match(/setInterval\(sincronizarCorreosPendientes,\s*(\d+)\)/);
if (!mIntervalo) throw new Error('No se encontro el setInterval de sincronizarCorreosPendientes');
const INTERVALO_MS = parseInt(mIntervalo[1], 10);

class EmailJSResponseStatus { constructor(status, text) { this.status = status; this.text = text; } }
const ERR_CUOTA = new EmailJSResponseStatus(429, 'Too Many Requests');

/* `guion` decide que hace cada request:
     {tipo:'ok'}                    → responde 200 al instante
     {tipo:'falla', ms}             → avanza el reloj `ms` y rechaza con TypeError sin .status.
                                      ms=0 es "la conexion nunca se establecio" (no salio);
                                      ms alto es "el servidor pudo haberlo despachado".
     {tipo:'cuelga'}                → NUNCA resuelve. Es la señal muerta de verdad: el unico
                                      caso donde la guardia de tiempo tiene que actuar.
     {tipo:'error', err}            → rechaza con un error del servidor (trae .status) */
function montar(guion) {
  let AHORA = Date.parse('2026-08-14T21:38:00Z');
  const store = {};
  let requests = 0;           // se resetea para medir un tramo
  let total = 0;              // NO se resetea: es el que alimenta el guion
  const enviados = [];        // params de cada request que SI se despacho
  const colgadas = [];        // resolvers de los envios que quedaron en el aire
  let temporizadores = [];
  let seq = 0;

  class DateFalso extends Date {
    constructor(...a) { if (!a.length) super(AHORA); else super(...a); }
    static now() { return AHORA; }
  }

  const sandbox = {
    Date: DateFalso,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    navigator: { onLine: true },
    // Temporizadores atados al reloj falso: sin esto la guardia de tiempo de _emailjsSend no se
    // puede probar (el setTimeout real de Node no sabe nada de este reloj).
    setTimeout: (fn, ms) => { const id = ++seq; temporizadores.push({ id, en: AHORA + (ms || 0), fn }); return id; },
    clearTimeout: id => { temporizadores = temporizadores.filter(t => t.id !== id); },
    emailjs: {
      send(service, template, params) {
        requests++; total++;
        const paso = typeof guion === 'function' ? guion(total) : guion;
        if (paso && paso.tipo === 'cuelga') {
          return new Promise(res => colgadas.push(() => { enviados.push(params); res({ status: 200, text: 'OK' }); }));
        }
        if (paso && paso.tipo === 'falla') {
          AHORA += (paso.ms || 0);
          return Promise.reject(new TypeError('Failed to fetch'));
        }
        if (paso && paso.tipo === 'error') return Promise.reject(paso.err);
        enviados.push(params);
        return Promise.resolve({ status: 200, text: 'OK' });
      }
    },
    console: { log(){}, warn(){}, error(){} },
    toast(){},
    actualizarIndicadorPendientes(){},
    _reportarEstadoCorreos(){},
    _tecnicoActual: () => 'Jose Quiroz',
    _confirmar: async () => true,
    window: {
      _firebaseReady: true,
      _updates: [],
      firebase: {
        firestore: Object.assign(function() {
          return { collection: col => ({ doc: id => ({ update: async data => { sandbox.window._updates.push({ col, id, data }); } }) }) };
        }, { FieldValue: { arrayUnion: function() { return { arrayUnion: Array.from(arguments) }; } } })
      }
    }
  };

  const nombres = Object.keys(sandbox);
  // Las piezas nuevas se toman con `typeof` A PROPOSITO: asi el guion tambien CORRE contra el
  // codigo anterior al fix y falla en los asertos —"salieron 2 correos"— en vez de reventar con
  // "_idDespacho no existe". La contraprueba tiene que demostrar que mide el duplicado, no la
  // ausencia de una funcion.
  const api = new Function(...nombres, codCola + `
    const _falta = function(){ return ''; };
    return {
      encolar: _encolarCorreo, enviar: _enviarCorreo, detalle: _enviarCorreoConDetalle,
      sincronizar: sincronizarCorreosPendientes, cola: _cargarCorreosPendientes,
      clasificar: _clasificarErrorCorreo, desencolar: _desencolarCorreo, clave: _claveCorreo,
      reintentarAhora: reintentarCorreosAhora, guardar: _guardarCorreosPendientes,
      idDespacho: typeof _idDespacho === 'function' ? _idDespacho : _falta,
      yaDespachado: typeof _yaDespachado === 'function' ? _yaDespachado : function(){ return false; },
      marcarDespachado: typeof _marcarDespachado === 'function' ? _marcarDespachado : function(){},
      paramsReenvio: typeof _paramsReenvio === 'function' ? _paramsReenvio : function(p){ return p; }
    };
  `)(...nombres.map(n => sandbox[n]));

  // Avanza el reloj disparando los temporizadores que vencen en el camino.
  async function avanzar(ms) {
    const meta = AHORA + ms;
    for (;;) {
      const t = temporizadores.filter(x => x.en <= meta).sort((a, b) => a.en - b.en)[0];
      if (!t) break;
      temporizadores = temporizadores.filter(x => x.id !== t.id);
      AHORA = Math.max(AHORA, t.en);
      t.fn();
      await new Promise(r => setImmediate(r));
    }
    AHORA = meta;
    await new Promise(r => setImmediate(r));
  }

  return {
    api, avanzar,
    reqs: () => requests,
    enviados: () => enviados,
    reset: () => { requests = 0; enviados.length = 0; },
    // Deja que un envio colgado conteste 200, tarde. Es "llego, pero despues del timeout".
    confirmarColgadas: async () => { colgadas.splice(0).forEach(f => f()); await new Promise(r => setImmediate(r)); },
    store,
    onLine: v => { sandbox.navigator.onLine = v; },
    ahora: () => AHORA
  };
}

// Corre `minutos` de reloj lanzando la sincronizacion cada INTERVALO_MS, como el setInterval real.
async function correrReloj(ctx, minutos) {
  const pasadas = Math.floor((minutos * 60000) / INTERVALO_MS);
  for (let p = 0; p < pasadas; p++) {
    await ctx.api.sincronizar();
    await ctx.avanzar(INTERVALO_MS);
  }
}

const AVISO = {
  email_admin: 'cotizaciones.emval@gmail.com', ot_numero: 614727,
  local: 'UNIMARC QUILLON', fecha: '14-08-2026', tecnico: 'Jose Quiroz',
  tipo: 'Correctivo', trabajo: 'Asistencia emergencia por reparacion cielo de baño', pdf_url: 'x'
};
const SELLO = { sello: 'ot_ot_mstgymy8_gk598hu__admin' };

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); }

/* LINEA DE CONTROL. Sin esto la contraprueba contra el codigo anterior salia con exit 0: alla
   `_emailjsSend` no tiene guardia de tiempo, el envio colgado no resuelve NUNCA, el `await` se
   queda esperando y Node se apaga sin ejecutar nada mas — un guion que muere en silencio parece
   uno que aprueba. (Es la misma leccion del PDF vacio del 13-08: un espia sin linea de control
   da falsos negativos.)
   El guion arranca declarado en falla y solo se declara aprobado si llega al final. */
let TERMINO = false;
process.exitCode = 1;
process.on('beforeExit', () => {
  if (TERMINO) return;
  console.log('\n❌ FALLA — el guion no llego al final: un envio quedo colgado para siempre.');
  console.log('   Eso YA es el defecto: sin guardia de tiempo el cierre de la OT se para ahi.');
  process.exitCode = 1;
});

// Limite en tiempo REAL de Node (no el reloj falso): si una promesa no se resuelve, se reporta
// como fallo en vez de colgar el guion entero.
const setTimeoutReal = setTimeout;
function conLimite(promesa, etiqueta) {
  return Promise.race([
    promesa,
    new Promise((_, rechazar) => setTimeoutReal(() => rechazar(new Error('colgado: ' + etiqueta)), 2000))
  ]);
}

(async () => {
  console.log('El aviso de OT no se manda dos veces (intervalo real: ' + (INTERVALO_MS / 1000) + ' s)\n');

  // ── a. EL CASO 614727: el POST salio, la respuesta murio ────────────────────────────────────
  // El primer envio tarda 3 s en morir → "pudo haber salido". Se encola marcado y el reenvio
  // sale UNA vez y avisando que es el mismo trabajo.
  {
    const ctx = montar(r => (r === 1 ? { tipo: 'falla', ms: 3000 } : { tipo: 'ok' }));
    await ctx.api.enviar(AVISO, SELLO);
    const enCola = ctx.api.cola();
    chequear(enCola.length === 1, 'a) el aviso que pudo haber salido tiene que quedar en cola');
    chequear(enCola[0] && enCola[0].posibleEnvio === true,
      'a) un rechazo a los 3 s es "pudo haber salido": posibleEnvio debe ser true (era ' + (enCola[0] && enCola[0].posibleEnvio) + ')');
    ctx.reset();
    await correrReloj(ctx, 60);
    chequear(ctx.reqs() === 1, 'a) en 1 h debe salir UN solo reenvio, no ' + ctx.reqs());
    const rr = ctx.enviados()[0] || {};
    chequear(String(rr.ot_numero).includes('REENVIO'),
      'a) el reenvio va marcado en el ASUNTO (ot_numero), que es donde Pedro lo ve sin abrir: "' + rr.ot_numero + '"');
    chequear(String(rr.ot_numero).includes('614727'),
      'a) el numero completo se conserva para que buscar "614727" en Gmail encuentre los dos');
    chequear(/REENVIO/.test(String(rr.trabajo)), 'a) y tambien en el cuerpo, por si el asunto cambia');
    chequear(ctx.api.cola().length === 0, 'a) despachado el reenvio, la cola queda vacia');
  }
  console.log('a) El caso 614727: el reenvio sale UNA vez y va marcado como reenvio');

  // ── b. REGRESION QUE NO SE PUEDE ROMPER: sin señal se reenvia LIMPIO ─────────────────────────
  // Un rechazo instantaneo es "la conexion nunca se establecio". No hay duda que marcar, y
  // meterle "(REENVIO)" a un aviso que jamas salio seria mentirle a Pedro en la otra direccion.
  {
    const ctx = montar(r => (r === 1 ? { tipo: 'falla', ms: 0 } : { tipo: 'ok' }));
    await ctx.api.enviar(AVISO, SELLO);
    chequear(ctx.api.cola()[0] && ctx.api.cola()[0].posibleEnvio === false,
      'b) un rechazo instantaneo NO es ambiguo: el POST no salio');
    ctx.reset();
    await correrReloj(ctx, 60);
    chequear(ctx.reqs() === 1, 'b) sale 1 vez (backoff intacto), no ' + ctx.reqs());
    chequear(!/REENVIO/.test(String((ctx.enviados()[0] || {}).ot_numero)),
      'b) un aviso que nunca salio se reenvia LIMPIO, sin marca');
  }
  console.log('b) Sin señal: el aviso se reenvia limpio y con el backoff de siempre');

  // ── c. El envio lento que confirma DESPUES de la guardia de tiempo ───────────────────────────
  // La guardia corta a los 20 s, pero el POST estaba vivo y contesta 200 despues. Llego: no hay
  // nada que reenviar. Sin este enganche, la guardia FABRICA dudas que se podian resolver gratis.
  {
    const ctx = montar({ tipo: 'cuelga' });
    const p = ctx.api.enviar(AVISO, SELLO);
    await ctx.avanzar(21000);                       // vence la guardia de tiempo
    // Si acá se cuelga es porque no HAY guardia de tiempo: el cierre de la OT se queda parado
    // en el envío para siempre, que es lo que dejaba a administración sin enterarse.
    try { await conLimite(p, 'el envío no tiene guardia de tiempo'); }
    catch (e) { chequear(false, 'c) ' + e.message + ' — el envío tiene que rendirse solo'); }
    chequear(ctx.api.cola().length === 1, 'c) al vencer la guardia el aviso queda encolado');
    chequear(ctx.api.cola()[0] && ctx.api.cola()[0].posibleEnvio === true, 'c) y queda marcado como "pudo haber salido"');
    await ctx.confirmarColgadas();                  // el POST contesta 200, tarde
    chequear(ctx.api.cola().length === 0, 'c) al confirmar tarde, el aviso sale solo de la cola');
    ctx.reset();
    await correrReloj(ctx, 60);
    chequear(ctx.reqs() === 0, 'c) y NO se reenvia nunca mas: 0 requests, no ' + ctx.reqs());
  }
  console.log('c) El envio que confirma tarde se resuelve solo: 0 reenvios');

  // ── d. LOS DOS PRODUCTORES: el cierre y la cola offline mandan el mismo aviso ────────────────
  // Es el otro camino al duplicado, independiente de la señal: guardarYEnviarPDF y
  // sincronizarOTsPendientes notifican los dos. Sin sello compartido, salen dos correos.
  {
    const ctx = montar({ tipo: 'ok' });
    await ctx.api.enviar(AVISO, SELLO);             // el cierre
    chequear(ctx.reqs() === 1, 'd) el primero sale');
    await ctx.api.enviar(AVISO, SELLO);             // la cola offline, mas tarde
    chequear(ctx.reqs() === 1, 'd) el segundo productor NO debe pegarle al servidor (fue ' + ctx.reqs() + ')');
    chequear(ctx.api.cola().length === 0, 'd) ni encolar nada');
  }
  console.log('d) Los dos productores del mismo aviso mandan UN solo correo');

  // ── e. Cerrojo: cinco gatillos pueden solaparse sobre un POST colgado ────────────────────────
  {
    const ctx = montar({ tipo: 'cuelga' });
    ctx.api.encolar(AVISO, 'x', SELLO, false);
    const a = ctx.api.sincronizar();
    const b = ctx.api.sincronizar();                // otro gatillo entra mientras el primero espera
    await ctx.avanzar(21000);
    try { await conLimite(Promise.all([a, b]), 'el ciclo de la cola no se rinde'); }
    catch (e) { chequear(false, 'e) ' + e.message); }
    chequear(ctx.reqs() === 1, 'e) dos ciclos solapados deben gastar UNA request, no ' + ctx.reqs());
  }
  console.log('e) Dos ciclos solapados no despachan el mismo aviso dos veces');

  // ── f. La escritura rancia resucitaba avisos ya despachados ─────────────────────────────────
  // El ciclo guardaba la copia que tenia al empezar. Si en el medio otro camino desencolaba un
  // aviso que ya salio, la copia rancia lo devolvia a la cola y se mandaba una tercera vez.
  {
    const ctx = montar({ tipo: 'cuelga' });
    ctx.api.encolar(AVISO, 'x', SELLO, false);
    const clave = ctx.api.clave(AVISO, undefined);
    const ciclo = ctx.api.sincronizar();
    ctx.api.desencolar(clave, ctx.api.idDespacho(AVISO, SELLO));   // salio por la otra via
    await ctx.avanzar(21000);
    try { await conLimite(ciclo, 'el ciclo de la cola no se rinde'); }
    catch (e) { chequear(false, 'f) ' + e.message); }
    chequear(ctx.api.cola().length === 0,
      'f) un aviso desencolado durante el ciclo NO puede reaparecer (quedaron ' + ctx.api.cola().length + ')');
  }
  console.log('f) El aviso que salio por otra via no resucita al guardar la cola');

  // ── g. Migracion: los avisos ya encolados en los telefonos salen como hoy ────────────────────
  // El dia del despliegue no puede haber una tanda de correos marcados por avisos viejos.
  {
    const ctx = montar({ tipo: 'ok' });
    ctx.store['emval_correos_pendientes'] = JSON.stringify([{
      clave: 'cotizaciones.emval@gmail.com|614727', intentos: 0, creadoEn: ctx.ahora(),
      fallido: false, proximoIntento: 0, ultimoError: '', params: AVISO,
      service: '', template: '', post: null
      // sin `posibleEnvio` ni `despacho`: encolado por la version anterior
    }]);
    await ctx.api.sincronizar();
    chequear(ctx.reqs() === 1, 'g) el aviso viejo sale');
    chequear(!/REENVIO/.test(String((ctx.enviados()[0] || {}).ot_numero)),
      'g) y sale SIN marca: no se puede inventar una duda que nadie registro');
  }
  console.log('g) Los avisos encolados por la version anterior salen una vez y sin marca');

  // ── h. Identidad incompleta: mejor duplicar que comerse un aviso ────────────────────────────
  // Sin numero de OT y sin sello, todos los avisos al mismo destinatario colapsarian en un id y
  // el segundo se descartaria en silencio. Asi se perdieron CABRERO y LAJA el 24-07-2026.
  {
    const ctx = montar({ tipo: 'ok' });
    const sinNum = Object.assign({}, AVISO, { ot_numero: '' });
    chequear(ctx.api.idDespacho(sinNum, {}) === '',
      'h) sin numero y sin sello, la identidad es vacia y el libro no se consulta');
    await ctx.api.enviar(sinNum, undefined);
    await ctx.api.enviar(Object.assign({}, sinNum, { local: 'UNIMARC LAJA' }), undefined);
    chequear(ctx.reqs() === 2, 'h) dos avisos distintos sin numero NO se comen entre si (salieron ' + ctx.reqs() + ')');
  }
  console.log('h) Dos avisos sin numero no se tapan uno al otro');

  // ── i. El reintento manual no borra la duda ─────────────────────────────────────────────────
  // Quien aprieta "Reintentar" pide otra ventana de 7 dias, no declara que el aviso jamas salio.
  {
    const ctx = montar(r => (r === 1 ? { tipo: 'falla', ms: 4000 } : { tipo: 'ok' }));
    await ctx.api.enviar(AVISO, SELLO);
    ctx.reset();
    await ctx.api.reintentarAhora();
    chequear(ctx.reqs() === 1, 'i) el reintento manual manda 1, no ' + ctx.reqs());
    chequear(/REENVIO/.test(String((ctx.enviados()[0] || {}).ot_numero)),
      'i) y sale MARCADO: el reintento a mano no vuelve inocente a un aviso que pudo salir');
  }
  console.log('i) El reintento manual conserva la marca de reenvio');

  // ── j. La regla que salvo la cuota sigue en pie ─────────────────────────────────────────────
  // El 426/429 tiene que cortar la cola aunque el aviso sea ambiguo. Si "ambiguo" se colara en la
  // decision de reintentar, volveria el destrozo del 03-08-2026.
  {
    const ctx = montar(r => (r === 1 ? { tipo: 'falla', ms: 5000 } : { tipo: 'error', err: ERR_CUOTA }));
    await ctx.api.enviar(AVISO, SELLO);
    chequear(ctx.api.cola()[0].posibleEnvio === true, 'j) el aviso queda ambiguo');
    ctx.reset();
    await correrReloj(ctx, 60);
    chequear(ctx.reqs() === 1, 'j) con la cuota agotada la cola se DETIENE: 1 request en 1 h, no ' + ctx.reqs());
    chequear(ctx.api.cola().length === 1, 'j) y el aviso sigue pendiente, no se pierde');
  }
  console.log('j) Un aviso ambiguo no relaja el corte por cuota');

  // ── k. El invariante viejo sigue vivo: ningun aviso se pierde ───────────────────────────────
  {
    const ctx = montar({ tipo: 'falla', ms: 0 });
    ctx.onLine(false);
    await ctx.api.enviar(AVISO, SELLO);
    chequear(ctx.reqs() === 0, 'k) sin señal declarada no se gasta ni una request');
    chequear(ctx.api.cola().length === 1, 'k) pero el aviso queda guardado, no se pierde');
  }
  console.log('k) Sin conexion: 0 requests y el aviso igual queda guardado');

  console.log('');
  TERMINO = true;
  if (fallos.length) {
    console.log('❌ FALLA — el aviso se puede duplicar o se perdio una garantia:\n' + fallos.join('\n'));
    process.exit(1);
  }
  console.log('✅ OK — el aviso no se duplica, el reenvio dudoso va marcado y nada se pierde');
  process.exitCode = 0;
})();
