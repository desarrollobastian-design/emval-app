/* Prueba de regresion — un correo mal escrito no puede detener la cola de avisos.

   Caso OT #271080 (24-09-2026, S10 Concepcion, preventivo de Lucas). La sucursal elegida era la
   ficha de relleno sin correo, asi que Lucas escribio a mano el del local: "admin095mayorista10.cl",
   SIN la @. EmailJS contesto `422 The recipients address is corrupted` y `_clasificarErrorCorreo`
   lo tomo por un problema de la CUENTA: detuvo TODA la cola del telefono, sin reintento
   automatico. La copia a administracion (cotizaciones.emval@gmail.com), que estaba bien, quedo
   atascada detras. "Reintentar" volvia a chocar con el correo malo, que iba primero: la alerta
   del dispositivo registro 3 rechazos. Y el mensaje mandaba a revisar el panel de EmailJS, que
   estaba sano. Desde ese momento, NINGUN aviso de ese telefono iba a salir.

   Extrae la cola TAL CUAL esta en index.html y le reproduce el estado exacto del telefono de
   Lucas (los dos avisos y el bloqueo guardado), mas los caminos vecinos: envio directo, rechazo
   del servidor a una direccion que parece buena, reintento manual, y que un problema REAL de la
   cuenta siga deteniendo la cola.

   Uso:  node tests/correo-mal-escrito-no-detiene-la-cola.js index.html   (desde la raiz del repo)
   Sale 0 si el correo malo se rinde solo y el resto sale; 1 si vuelve a detener la cola.
   Trae linea de control: contra el codigo anterior faltan funciones enteras, y un guion que muere
   a medias se parece demasiado a uno que aprueba. */

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

function extraer(desde, hasta) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('No se encontro: ' + desde);
  const j = src.indexOf(hasta, i);
  if (j < 0) throw new Error('No se encontro el fin de: ' + desde);
  return src.slice(i, j);
}

const codCola = extraer('const _CORREOS_KEY =', '// Reintento manual desde la barra');
const codReintento = extraer('// Reintento manual desde la barra', '// Contencion: vaciar una cola envenenada');

class EmailJSResponseStatus { constructor(status, text) { this.status = status; this.text = text; } }
// El error REAL que devolvio EmailJS en el telefono de Lucas (captura de Pedro, 24-09 16:17).
const ERR_CORRUPTA = new EmailJSResponseStatus(422, 'The recipients address is corrupted');
const ERR_VACIA    = new EmailJSResponseStatus(422, 'The recipients address is empty');
const ERR_CUENTA   = new EmailJSResponseStatus(403, 'Forbidden');

const MALA  = 'admin095mayorista10.cl';            // tal cual la escribio Lucas
const BUENA = 'admin095@mayoristas10.cl';          // la de M10 CONCEPCION en el catalogo
const ADMIN = 'cotizaciones.emval@gmail.com';      // PEDRO_NOTIF_EMAIL

// `servidor(params)` decide que contesta EmailJS a cada envio: null = sale, o un error (o una
// promesa, para meter trabajo en medio del POST). `opts`: { offline, sinSdk }.
function montar(servidor, opts) {
  opts = opts || {};
  let AHORA = Date.parse('2026-09-24T19:18:14Z');
  const store = {};
  const despachos = [];     // cada request que llego al servidor: { a, ok }
  const toasts = [];

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
    navigator: { onLine: !opts.offline },
    emailjs: opts.sinSdk ? undefined : {
      async send(service, template, params) {
        let e = servidor ? servidor(params || {}) : null;
        if (e && typeof e.then === 'function') e = await e;
        despachos.push({ a: String((params || {}).email_admin || ''), ok: !e });
        if (e) throw e;
        return { status: 200, text: 'OK' };
      }
    },
    console: { log(){}, warn(){}, error(){} },
    toast: m => { toasts.push(String(m)); },
    actualizarIndicadorPendientes(){},
    _reportarEstadoCorreos(){},
    _tecnicoActual: () => 'Lucas Fernández',
    window: { _firebaseReady: false }
  };

  const nombres = Object.keys(sandbox);
  // typeof en cada funcion nueva: contra el codigo anterior el guion tiene que CORRER y fallar
  // por comportamiento, no morir por un ReferenceError al armar el objeto.
  const api = new Function(...nombres, codCola + codReintento + `
    return {
      encolar: _encolarCorreo,
      enviarDetalle: _enviarCorreoConDetalle,
      sincronizar: sincronizarCorreosPendientes,
      reintentar: reintentarCorreosAhora,
      cola: _cargarCorreosPendientes,
      guardarCola: _guardarCorreosPendientes,
      bloqueoVigente: _bloqueoCorreosVigente,
      guardarBloqueo: _guardarBloqueoCorreos,
      clasificar: _clasificarErrorCorreo,
      problema: typeof _problemaDireccionCorreo === 'function' ? _problemaDireccionCorreo : null,
      BLOQUEO_KEY: _CORREOS_BLOQUEO_KEY
    };
  `)(...nombres.map(n => sandbox[n]));

  return {
    api, store, toasts,
    despachos: () => despachos,
    reqs: () => despachos.length,
    reqsA: dir => despachos.filter(d => d.a === dir).length,
    salieronA: dir => despachos.filter(d => d.a === dir && d.ok).length,
    avanzar: ms => { AHORA += ms; },
    ahora: () => AHORA
  };
}

// El telefono de Lucas como quedo: el aviso al local primero (el malo) y la copia a
// administracion detras, encolada con el texto del bloqueo sin haberse intentado nunca. El malo
// espera 1 h por el corte (`proximoIntento`), y el bloqueo de 'cuenta' no tiene reintento.
function telefonoDeLucas(ctx) {
  const ahora = ctx.ahora();
  const base = { ot_numero: '271080', local: 'S10 Concepcion', fecha: '24-09-2026',
                 tecnico: 'Lucas Fernández', tipo: 'Preventivo',
                 pdf_url: 'https://res.cloudinary.com/dcrf29tna/raw/upload/emval/pdfs/x_03wt921.pdf' };
  ctx.api.guardarCola([
    { clave: MALA + '|271080', intentos: 1, creadoEn: ahora, fallido: false, proximoIntento: ahora + 60 * 60 * 1000,
      ultimoError: '422 The recipients address is corrupted',
      params: Object.assign({ email_admin: MALA, trabajo: '' }, base),
      service: '', template: '', post: null, despacho: 'ot_ot_muftutz1_03wt921__local', posibleEnvio: false, intentadoEn: 0 },
    { clave: ADMIN + '|271080', intentos: 0, creadoEn: ahora, fallido: false, proximoIntento: 0,
      ultimoError: 'el servicio de correo rechazó la cuenta (422 The recipients address is corrupted). Hay que revisarlo en el panel de EmailJS.',
      params: Object.assign({ email_admin: ADMIN, trabajo: '' }, base),
      service: '', template: '', post: null, despacho: 'ot_ot_muftutz1_03wt921__admin', posibleEnvio: false, intentadoEn: 0 }
  ]);
  ctx.api.guardarBloqueo({ clase: 'cuenta', status: 422, texto: 'The recipients address is corrupted',
                           desde: ahora, reintentarDespues: 0 });
}

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); }
let llegoAlFinal = false;

(async () => {
  console.log('Un correo mal escrito no detiene la cola — caso OT #271080\n');

  // ── 1. El telefono de Lucas, al abrir la version nueva ──────────────────────────────────────
  {
    // EmailJS de verdad: rechaza lo que no tiene @, acepta el resto.
    const ctx = montar(p => String(p.email_admin).indexOf('@') < 0 ? ERR_CORRUPTA : null);
    telefonoDeLucas(ctx);
    await ctx.api.sincronizar();
    const cola = ctx.api.cola();
    const mala = cola.filter(c => c.params.email_admin === MALA)[0];
    console.log('1) Telefono de Lucas: salio la copia a administracion ' + ctx.salieronA(ADMIN) + ' vez · ' +
                'requests al correo malo: ' + ctx.reqsA(MALA) + ' · quedan ' + cola.length + ' en cola');
    chequear(ctx.salieronA(ADMIN) === 1, 'la copia a administracion NO salio: la cola sigue detenida por el correo malo');
    chequear(ctx.reqsA(MALA) === 0, 'se le volvio a pegar al servidor con una direccion sin @ (' + ctx.reqsA(MALA) + ' requests)');
    chequear(!ctx.api.bloqueoVigente(), 'el bloqueo viejo por destinatario sigue vigente: no se levanta solo');
    chequear(!(ctx.api.BLOQUEO_KEY in ctx.store), 'el bloqueo viejo sigue escrito en el telefono');
    chequear(!!mala, 'el aviso al correo malo desaparecio: el invariante es que ninguno se pierde');
    chequear(cola.length === 1, 'quedan ' + cola.length + ' avisos en cola: solo deberia quedar el del correo malo');
    chequear(!!mala && mala.fallido === true, 'el aviso al correo malo no quedo rendido: se seguiria reintentando');
    chequear(!!mala && mala.motivoFallo === 'destinatario', 'el aviso rendido no dice que fue por la direccion');
    chequear(!!mala && /falta la @/.test(mala.ultimoError) && mala.ultimoError.indexOf(MALA) >= 0,
      'el error guardado no dice que direccion ni que le falta: "' + (mala && mala.ultimoError) + '"');
    chequear(ctx.toasts.some(t => t.indexOf(MALA) >= 0 && /mal escrita/.test(t)), 'nadie le dice al tecnico que direccion quedo sin enviar');
    chequear(!ctx.toasts.some(t => /panel de EmailJS/.test(t)), 'se sigue mandando a revisar el panel de EmailJS, que esta sano');

    // Ciclos siguientes (el intervalo de 90 s): el rendido no vuelve al servidor ni al toast.
    const antes = ctx.reqs(), toastsAntes = ctx.toasts.length;
    ctx.avanzar(2 * 60 * 60 * 1000);
    await ctx.api.sincronizar();
    chequear(ctx.reqs() === antes, 'un aviso rendido por direccion volvio a gastar cuota en el ciclo siguiente');
    chequear(ctx.toasts.length === toastsAntes, 'el aviso de "direccion mal escrita" se repite en cada ciclo');
  }

  // ── 2. Cierre de una OT nueva con el correo mal escrito ─────────────────────────────────────
  {
    const ctx = montar(p => String(p.email_admin).indexOf('@') < 0 ? ERR_CORRUPTA : null);
    const r1 = await ctx.api.enviarDetalle({ email_admin: MALA, ot_numero: '271080', local: 'S10 Concepcion' },
                                           { sello: 'ot_x__local' });
    const r2 = await ctx.api.enviarDetalle({ email_admin: ADMIN, ot_numero: '271080', local: 'S10 Concepcion' },
                                           { sello: 'ot_x__admin' });
    console.log('2) Cierre con correo malo: local ' + (r1.ok ? 'salio' : (r1.err && r1.err.clase)) +
                ' · administracion ' + (r2.ok ? 'salio' : 'NO salio') + ' · requests ' + ctx.reqs());
    chequear(!r1.ok && r1.err && r1.err.clase === 'destinatario', 'el envio al correo malo no se reporta como problema de direccion');
    chequear(!r1.bloqueo && !ctx.api.bloqueoVigente(), 'un correo mal escrito detuvo la cola');
    chequear(r2.ok === true, 'la copia a administracion no salio despues del correo malo');
    chequear(ctx.reqsA(MALA) === 0, 'se gasto una request en una direccion sin @');
    const c = ctx.api.cola();
    chequear(c.length === 1 && c[0].fallido && c[0].motivoFallo === 'destinatario',
      'el aviso al correo malo no quedo guardado y rendido (invariante: nunca se pierde, nunca martilla)');
  }

  // ── 2b. El cierre TIPICO en terreno: sin señal, sin SDK, o con la cola ya detenida ──────────
  // La direccion se revisa ANTES que la señal y que el bloqueo. Si se revisara despues, el aviso
  // malo quedaria como "pendiente que sale solo" y la copia a administracion saldria sin la nota
  // de que el local no recibio su OT (mutantes M23/M24 de la revision del 24-09).
  {
    const estados = [
      ['sin señal', montar(null, { offline: true })],
      ['sin el SDK de EmailJS', montar(null, { sinSdk: true })],
      ['con la cola detenida por cuota', (function(){ const x = montar(null);
        x.api.guardarBloqueo({ clase: 'cuota', status: 426, texto: 'Monthly request quota exceeded',
                               desde: x.ahora(), reintentarDespues: x.ahora() + 6 * 3600 * 1000 }); return x; })()]
    ];
    let linea = '2b) Cierre con correo malo ';
    for (const [nombre, ctx] of estados) {
      const r = await ctx.api.enviarDetalle({ email_admin: MALA, ot_numero: '271080' }, { sello: 'ot_y__local' });
      const c = ctx.api.cola();
      const ok = !r.ok && r.err && r.err.clase === 'destinatario' && ctx.reqs() === 0 &&
                 c.length === 1 && c[0].fallido === true && c[0].motivoFallo === 'destinatario';
      chequear(ok, nombre + ': el correo malo no se rindio en el acto (err=' + (r.err && r.err.clase) +
        ', reqs=' + ctx.reqs() + ', cola=' + JSON.stringify(c.map(x => [x.fallido, x.motivoFallo])) + ')');
      linea += (ok ? '✓' : '✗');
    }
    console.log(linea + ' (sin señal · sin SDK · con cuota detenida)');
  }

  // ── 3. El servidor rechaza una direccion que PARECE buena ───────────────────────────────────
  // La validacion local es conservadora (solo marca la falta de @). Lo demas lo decide EmailJS, y
  // su 422 tiene que tratarse igual: se rinde ese aviso, el resto sale.
  {
    const RARA = 'admin095@mayoristas10';
    const ctx = montar(p => p.email_admin === RARA ? ERR_CORRUPTA : null);
    // Ya estaba encolado "sin conexion" (el cierre offline) cuando el otro productor lo manda y
    // recibe el 422: la rama "ya encolado" tiene que rendirlo igual (mutantes M13/M14).
    ctx.api.encolar({ email_admin: RARA, ot_numero: '1' }, 'sin conexión', { sello: 'ot_r__local' });
    const r = await ctx.api.enviarDetalle({ email_admin: RARA, ot_numero: '1' }, { sello: 'ot_r__local' });
    chequear(!r.ok && r.err && r.err.clase === 'destinatario', '422 del servidor sobre la direccion no se clasifico como destinatario');
    chequear(!ctx.api.bloqueoVigente(), 'el 422 del servidor detuvo la cola');
    const c0 = ctx.api.cola();
    chequear(c0.length === 1 && c0[0].fallido === true && c0[0].motivoFallo === 'destinatario',
      'el aviso ya encolado y despues rechazado no quedo rendido por direccion: ' + JSON.stringify(c0.map(x => [x.fallido, x.motivoFallo])));
    const antes0 = ctx.reqs();
    await ctx.api.sincronizar();
    chequear(ctx.reqs() === antes0, 'el aviso rechazado se volvio a mandar en el ciclo siguiente');

    // Y desde la cola: tres avisos, el rechazado primero.
    ctx.api.encolar({ email_admin: 'admin3020@mayoristas10.cl', ot_numero: '2' });
    ctx.api.encolar({ email_admin: ADMIN, ot_numero: '3' });
    const colaRara = ctx.api.cola();
    colaRara[0].fallido = false; colaRara[0].motivoFallo = '';    // como si viniera de antes del fix
    ctx.api.guardarCola(colaRara);
    const antes = ctx.reqs();
    await ctx.api.sincronizar();
    const salieron = ctx.salieronA('admin3020@mayoristas10.cl') + ctx.salieronA(ADMIN);
    console.log('3) 422 del servidor en una direccion con @: salieron ' + salieron + ' de 2 · ' +
                'requests del ciclo ' + (ctx.reqs() - antes));
    chequear(salieron === 2, 'despues del 422 de una direccion, los demas avisos no salieron');
    chequear(!ctx.api.bloqueoVigente(), 'el 422 dentro de la cola la detuvo');
    chequear(ctx.toasts.some(t => t.indexOf(RARA) >= 0 && /mal escrita/.test(t)),
      'el rechazo del servidor dentro del ciclo no le dice al tecnico a que direccion no le llego');
    const quedan = ctx.api.cola();
    chequear(quedan.length === 1 && quedan[0].params.email_admin === RARA && quedan[0].fallido &&
             quedan[0].motivoFallo === 'destinatario', 'el rechazado no quedo rendido y visible');
    const antes2 = ctx.reqs();
    await ctx.api.sincronizar();
    chequear(ctx.reqs() === antes2, 'el rechazado se vuelve a mandar solo en el ciclo siguiente');
  }

  // ── 4. Un problema REAL de la cuenta sigue deteniendo la cola ───────────────────────────────
  {
    const ctx = montar(() => ERR_CUENTA);
    const r = await ctx.api.enviarDetalle({ email_admin: ADMIN, ot_numero: '9' }, { sello: 'ot_c__admin' });
    const b = ctx.api.bloqueoVigente();
    console.log('4) 403 de credencial: ' + (b ? 'la cola se detiene (bien)' : 'la cola NO se detuvo'));
    chequear(!r.ok && !!b && b.clase === 'cuenta', 'un 403 de la cuenta dejo de detener la cola');
    ctx.avanzar(24 * 60 * 60 * 1000);
    chequear(!!ctx.api.bloqueoVigente(), 'la migracion levanto un bloqueo de cuenta que NO era de destinatario');
    // Y un 422 que no habla del destinatario sigue siendo de la cuenta.
    chequear(ctx.api.clasificar(new EmailJSResponseStatus(422, 'The template ID is invalid')).clase === 'cuenta',
      'un 422 que no habla del destinatario dejo de detener la cola');
  }
  {
    // Un bloqueo GUARDADO por un 422 de la cuenta no lo levanta la migracion: la migracion mira
    // el TEXTO, no el status (mutante M09 — "simplificar" a status 422 quemaba cuota cada hora).
    const ctx = montar(() => new EmailJSResponseStatus(422, 'The template ID is invalid'));
    ctx.api.encolar({ email_admin: ADMIN, ot_numero: '10' });
    ctx.api.guardarBloqueo({ clase: 'cuenta', status: 422, texto: 'The template ID is invalid', desde: ctx.ahora(), reintentarDespues: 0 });
    await ctx.api.sincronizar();
    ctx.avanzar(3 * 60 * 60 * 1000);
    await ctx.api.sincronizar();
    chequear(!!ctx.api.bloqueoVigente() && (ctx.api.BLOQUEO_KEY in ctx.store) && ctx.reqs() === 0,
      'la migracion levanto un bloqueo 422 que era de la cuenta (' + ctx.reqs() + ' requests)');
  }
  {
    // Plantilla rota: el servidor dice "recipients address is EMPTY" a TODO, con direcciones
    // bien escritas. Es de la cuenta: tiene que detener la cola al primer rechazo, no rendir cada
    // aviso bueno como "mal escrito" (hallazgo CONFIRMADO de la revision del 24-09).
    const ctx = montar(() => ERR_VACIA);
    ['local.bien@unimarc.cl', ADMIN, 'otro.local@unimarc.cl'].forEach((d, i) => ctx.api.encolar({ email_admin: d, ot_numero: String(20 + i) }));
    await ctx.api.sincronizar();
    const rendidos = ctx.api.cola().filter(c => c.motivoFallo === 'destinatario').length;
    console.log('4b) Plantilla rota ("empty" a todo): ' + ctx.reqs() + ' request(s), ' + (ctx.api.bloqueoVigente() ? 'cola detenida' : 'cola SIN detener'));
    chequear(ctx.reqs() === 1 && !!ctx.api.bloqueoVigente(), 'con la plantilla rota la cola no se detuvo: ' + ctx.reqs() + ' requests');
    chequear(rendidos === 0, rendidos + ' aviso(s) bueno(s) quedaron como "direccion mal escrita" por un problema de la plantilla');
    chequear(!ctx.toasts.some(t => /mal escrita/.test(t)), 'con la plantilla rota se le dice al tecnico que las direcciones estan mal escritas');
  }

  // ── 5. Reintentar a mano no le pega al servidor con la direccion sin @ ──────────────────────
  {
    const ctx = montar(p => String(p.email_admin).indexOf('@') < 0 ? ERR_CORRUPTA : null);
    telefonoDeLucas(ctx);
    await ctx.api.sincronizar();
    const antes = ctx.reqs();
    await ctx.api.reintentar();
    const c = ctx.api.cola();
    console.log('5) Reintentar ahora: requests al correo malo ' + ctx.reqsA(MALA) + ' · sigue rendido: ' + (c[0] && c[0].fallido));
    chequear(ctx.reqsA(MALA) === 0 && ctx.reqs() === antes, 'Reintentar mando la direccion sin @ al servidor');
    chequear(c.length === 1 && c[0].fallido && c[0].motivoFallo === 'destinatario', 'Reintentar perdio o destrabo en falso el aviso malo');
    chequear(!ctx.api.bloqueoVigente(), 'Reintentar volvio a detener la cola');
  }

  // ── 6. Clasificacion y validacion — sin falsos positivos sobre direcciones reales ───────────
  {
    const ctx = montar(null);
    const cls = e => ctx.api.clasificar(e).clase;
    chequear(cls(ERR_CORRUPTA) === 'destinatario', '422 "recipients address is corrupted" no es destinatario: es ' + cls(ERR_CORRUPTA));
    chequear(cls(ERR_VACIA) === 'cuenta', '422 "recipients address is empty" (la plantilla no lee el destinatario) tiene que ser de la cuenta: es ' + cls(ERR_VACIA));
    chequear(ctx.api.clasificar(ERR_CORRUPTA).ambiguo === false, 'un 422 no puede marcarse como "pudo haber salido"');
    chequear(cls(new EmailJSResponseStatus(426, 'Monthly request quota exceeded')) === 'cuota', 'la cuota dejo de ser cuota');
    chequear(cls(new EmailJSResponseStatus(400, 'The Public Key is invalid')) === 'cuenta', 'la credencial dejo de ser cuenta');

    const p = ctx.api.problema;
    chequear(typeof p === 'function', 'no existe _problemaDireccionCorreo');
    if (typeof p === 'function') {
      // Con la FORMA de las del catalogo de produccion (cadenas.sucursales, 24-09-2026; las personales
      // van anonimizadas: este repo es publico) y los formatos de lista que acepta EmailJS: NINGUNA
      // puede quedar marcada.
      const buenas = ['admin3020@mayoristas10.cl', BUENA, 'supervisor.zona@smu.cl', 'admin3089@alvi.cl',
                      'jefe.zona@smu.cl', 'admin3027@mayoristas10.cl', ADMIN,
                      'a@b.cl, c@d.cl', 'a@b.cl;c@d.cl', '  admin@unimarc.cl  ', 'a@b.cl,'];
      buenas.forEach(d => chequear(p(d) === '', 'falso positivo: "' + d + '" se marco como mal escrita (' + p(d) + ')'));
      const malas = [[MALA, /@/], ['', /direcci/], ['   ', /direcci/], ['a@b.cl, sinarroba.cl', /@/], ['admin', /@/]];
      malas.forEach(m => chequear(m[1].test(p(m[0])), '"' + m[0] + '" deberia marcarse y dijo "' + p(m[0]) + '"'));
      console.log('6) Clasificacion y validacion: ' + buenas.length + ' direcciones reales aceptadas, ' + malas.length + ' malas marcadas');
    }
  }

  // ── 7. La copia a administracion dice que el local no recibio su OT ─────────────────────────
  {
    const i = src.indexOf('function _notaDireccionLocalMala');
    chequear(i >= 0, 'no existe _notaDireccionLocalMala: administracion no se entera de que el local no recibio la OT');
    if (i >= 0) {
      const nota = new Function(extraer('function _notaDireccionLocalMala', '\n}\n') + '\n}\nreturn _notaDireccionLocalMala;')();
      const t = nota('S10 Concepcion', MALA);
      chequear(t.indexOf(MALA) >= 0 && t.indexOf('S10 Concepcion') >= 0 && /ATENCION/.test(t),
        'la nota a administracion no nombra el local y la direccion: "' + t + '"');
      chequear(nota('S10 Concepcion', '') === '', 'con la direccion buena la nota tiene que ir vacia');
    }
    // Los DOS productores del aviso a administracion (cierre y cola offline) pasan la nota. Se
    // ancla la FORMA exacta de la deteccion: una condicion invertida (`if (enviado && …)`, M20),
    // la linea borrada (M19) o volver a `_enviarCorreo`, que devuelve un booleano sin la clase
    // (M39), dejaban la copia a administracion sin la nota y este test en verde.
    const g = extraer('async function guardarYEnviarPDF', '\nasync function ');
    const s = extraer('async function sincronizarOTsPendientes', '\nwindow.addEventListener(');
    chequear(/const _rLocal = await _enviarCorreoConDetalle\(/.test(g), 'el cierre manda el correo al local sin saber POR QUE fallo');
    chequear(/const enviado = _rLocal\.ok;\s*\n\s*if \(!enviado && _rLocal\.err && _rLocal\.err\.clase === 'destinatario'\) _dirLocalMala = email;/.test(g),
      'el cierre no detecta (o detecta al reves) el rechazo por direccion');
    chequear(/_notaDireccionLocalMala\(snap\.local,\s*_dirLocalMala\)/.test(g), 'el cierre de la OT no avisa a administracion del correo mal escrito');
    chequear(/const _rLocalSync = await _enviarCorreoConDetalle\(/.test(s), 'la cola offline manda el correo al local sin saber POR QUE fallo');
    chequear(/if \(!_rLocalSync\.ok && _rLocalSync\.err && _rLocalSync\.err\.clase === 'destinatario'\) _dirLocalMalaSync = ot\.emailLocal;/.test(s),
      'la subida desde la cola offline no detecta (o detecta al reves) el rechazo por direccion');
    chequear(/_notaDireccionLocalMala\(ot\.local,\s*_dirLocalMalaSync\)/.test(s), 'la subida desde la cola offline no avisa a administracion del correo mal escrito');
    // Sin señal el toast lo pisaba "Aviso a administración pendiente…": va en un dialogo.
    chequear(/if \(_dirLocalMala\) \{\s*\n\s*_avisar\(/.test(g), 'el aviso de "correo del local mal escrito" en el cierre no va en un dialogo (el toast lo pisa sin señal)');

    // Envios multiples (hojas y cotizaciones): una direccion rechazada NO corta a los demas y el
    // resumen no promete "se reenvía solo" para ella (mutantes M37/M38/M41).
    const h = extraer('async function _procesarEnvioHojas', '\n}\n');
    const k = extraer('async function _procesarEnvioCotizaciones', '\n}\n');
    [['hojas', h], ['cotizaciones', k]].forEach(([n, cod]) => {
      chequear(/if \(r\.err && r\.err\.clase === 'destinatario'\) malos\.push\(emails\[k\]\);/.test(cod), n + ': la direccion rechazada no se junta aparte');
      chequear(/if \(r\.bloqueo \|\| \(r\.err && \(r\.err\.clase === 'cuota' \|\| r\.err\.clase === 'cuenta'\)\)\)/.test(cod) && !/clase === 'destinatario' \|\|/.test(cod),
        n + ': una direccion rechazada corta el envio a los demas destinatarios');
      chequear(/\} else if \(malos\.length\) \{\s*\n\s*_avisar\('No se envi/.test(cod), n + ': el resumen no dice a que direccion no se envio');
    });

    // Bajas de activo: tampoco prometen "sale solo" para un aviso rendido. S10 TOME tiene
    // emailSupervisor "admin" en el catalogo real.
    const bj = extraer('async function guardarYEnviarBaja', '\nasync function ');
    const bs = extraer('async function enviarBajasSeleccionadas', '\n}\n');
    chequear(/_enviarCorreoConDetalle\(_paramsCorreoBaja\(snap, snap\.emailLocal\)/.test(bj) && /clase === 'destinatario'\)\s*\n\s*\? 'Hoja guardada, pero el correo del local est/.test(bj),
      'la baja promete "el correo sale solo" con la direccion mal escrita');
    chequear(/else if \(r\.err && r\.err\.clase === 'destinatario'\)/.test(bs) && /malos\.length \?/.test(bs),
      'el envio de bajas al supervisor cuenta la direccion mal escrita como "pendiente que sale sola"');

    // El correo tecleado es de ESA OT: nuevaOT limpia campo y aviso, y retomar una pausada no
    // arrastra el correo de sucursal de la OT anterior.
    const nv = extraer('function nuevaOT()', '\n}\n');
    chequear(/estado\.emailSucursal = '';/.test(nv) && /_emAdm\.value = '';/.test(nv) && /_avisarEmailAdminMalo\(''\);/.test(nv),
      'nuevaOT deja el correo de la OT anterior en el campo (y cerrarOT lo relee del DOM)');
    const cg = extraer('function _cargarEstadoDesdeOTGuardada', '\n}\n');
    chequear(/estado\.emailAdmin = ot\.emailAdmin \|\| '';\s*\n(\s*\/\/[^\n]*\n)*\s*estado\.emailSucursal = '';/.test(cg),
      'retomar una pausada deja el correo de sucursal de la OT anterior, que le gana al de la pausada');

    // El aviso del campo, ejecutado: no sale letra por letra, sale al salir del campo, y calla si
    // el cierre va a usar el correo del catalogo.
    const el = { textContent: '', style: { display: 'none' } };
    const fnAviso = new Function('document', 'estado',
      extraer('function _problemaDireccionCorreo', '\n}\n') + '\n}\n' +
      extraer('function _avisarEmailAdminMalo', '\n}\n') + '\n}\nreturn _avisarEmailAdminMalo;');
    const est = { emailSucursal: '' };
    const avisar = fnAviso({ getElementById: id => id === 'email-admin-error' ? el : null }, est);
    avisar('jefe', true);
    chequear(el.style.display === 'none', 'el aviso rojo sale mientras se teclea una direccion todavia sin @');
    avisar(MALA);
    chequear(el.style.display === 'block' && /falta la @/.test(el.textContent), 'al salir del campo con la direccion sin @ no aparece el aviso');
    avisar('jefe@unimarc.cl', true);
    chequear(el.style.display === 'none', 'el aviso no se apaga al escribir una direccion con @');
    est.emailSucursal = 'admin132@unimarc.cl';
    avisar(MALA);
    chequear(el.style.display === 'none', 'el aviso dice "no le llega al local" cuando el cierre va a usar el correo del catalogo');
    chequear(/id="email-admin"[^>]*oninput="[^"]*_avisarEmailAdminMalo\(this\.value, true\)[^"]*"[^>]*onblur="_avisarEmailAdminMalo\(this\.value\)"/.test(src),
      'el campo no llama al aviso al escribir y al salir');
    console.log('7) Aviso a administracion, al tecnico y al supervisor: cierre, cola offline, envios multiples, bajas, campo');
  }

  // ── 8. Un motivo viejo no sobrevive a Reintentar ─────────────────────────────────────────────
  {
    const RARA = 'admin095@mayoristas10';
    let n = 0;
    const ctx = montar(() => (++n === 1 ? ERR_CORRUPTA : new TypeError('Failed to fetch')));
    await ctx.api.enviarDetalle({ email_admin: RARA, ot_numero: '30' }, { sello: 'ot_m__local' });
    await ctx.api.reintentar();                       // 2do intento: la red cae
    for (let d = 0; d < 9; d++) { ctx.avanzar(24 * 3600 * 1000); await ctx.api.sincronizar(); }
    const c = ctx.api.cola()[0] || {};
    console.log('8) Rendido por direccion → Reintentar → muere por la red: motivo "' + (c.motivoFallo || '') + '"');
    chequear(c.fallido === true && c.motivoFallo !== 'destinatario',
      'un aviso que murio por la señal sigue diciendo "direccion mal escrita" (motivo rancio de antes del Reintentar)');
  }

  // ── 9. La fusion del ciclo no des-rinde lo que el otro productor rindio en el medio ─────────
  {
    const RARA = 'admin095@mayoristas10';
    let gancho = null;
    const ctx = montar(p => {
      if (p.email_admin === RARA) return ERR_CORRUPTA;
      if (p.email_admin === ADMIN && gancho) { const g2 = gancho; gancho = null; return g2().then(() => null); }
      return null;
    });
    // RARA espera su backoff en la cola; ADMIN sale en este ciclo, y mientras su POST esta en
    // vuelo el otro productor manda RARA y recibe el 422.
    ctx.api.encolar({ email_admin: RARA, ot_numero: '40' }, 'sin conexión', { sello: 'ot_f__local' });
    const cola0 = ctx.api.cola(); cola0[0].proximoIntento = ctx.ahora() + 30 * 60 * 1000; ctx.api.guardarCola(cola0);
    ctx.api.encolar({ email_admin: ADMIN, ot_numero: '40' });
    gancho = () => ctx.api.enviarDetalle({ email_admin: RARA, ot_numero: '40' }, { sello: 'ot_f__local' });
    await ctx.api.sincronizar();
    const x = ctx.api.cola().filter(c => c.params.email_admin === RARA)[0] || {};
    console.log('9) Rendido en medio del ciclo: tras la fusion fallido=' + x.fallido + ' motivo="' + (x.motivoFallo || '') + '"');
    chequear(x.fallido === true && x.motivoFallo === 'destinatario', 'la fusion del ciclo piso el "rendido" que escribio el otro productor');
    const antes = ctx.reqsA(RARA);
    ctx.avanzar(2 * 60 * 60 * 1000);
    await ctx.api.sincronizar();
    chequear(ctx.reqsA(RARA) === antes, 'por la fusion, el ciclo siguiente le volvio a pegar al servidor con la direccion rechazada');
  }

  llegoAlFinal = true;
})().catch(e => {
  fallos.push('  ✗ el guion murio: ' + (e && e.message));
}).finally(() => {
  if (!llegoAlFinal) fallos.push('  ✗ linea de control: el guion no llego al final');
  console.log('');
  if (fallos.length) { console.log('❌ FALLA'); fallos.forEach(f => console.log(f)); }
  else console.log('✅ OK — el correo mal escrito se rinde solo, sin detener la cola; el resto sale y todos se enteran');
  console.log('');
  process.exit(fallos.length ? 1 : 0);
});
