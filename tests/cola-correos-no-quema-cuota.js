/* Prueba de regresion — la cola de correos no puede quemar la cuota de EmailJS.

   El 03-08-2026 la app dejo de mandar correos: ni avisos de OT ni cotizaciones. La causa no fue
   una regresion de codigo sino el DISEÑO de la cola — reintentaba todos los pendientes cada 90 s,
   sin backoff y sin mirar que error era. Son 40 intentos por aviso por hora contra un plan de
   200 correos AL MES: unos pocos avisos atascados queman la cuota mensual en menos de una hora,
   y desde ahi muere todo el correo de la app.

   Extrae la cola TAL CUAL esta en index.html (constantes incluidas, y el intervalo real del
   setInterval) y le corre una hora simulada con un reloj falso.

   Uso:  node tests/cola-correos-no-quema-cuota.js index.html   (desde la raiz del repo)
   Sale 0 si la cola se contiene y no pierde avisos; 1 si vuelve a martillar. */

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

function extraer(desde, hasta) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('No se encontro: ' + desde);
  const j = src.indexOf(hasta, i);
  if (j < 0) throw new Error('No se encontro el fin de: ' + desde);
  return src.slice(i, j);
}

// Toda la cola: constantes, backoff, clasificacion de error, bloqueo, encolar, enviar, sincronizar.
const codCola = extraer('const _CORREOS_KEY =', '// Reintento manual desde la barra');

// El intervalo sale del propio index.html: si alguien lo baja a 30 s, la prueba lo refleja.
const mIntervalo = src.match(/setInterval\(sincronizarCorreosPendientes,\s*(\d+)\)/);
if (!mIntervalo) throw new Error('No se encontro el setInterval de sincronizarCorreosPendientes');
const INTERVALO_MS = parseInt(mIntervalo[1], 10);

// EmailJS v4: un fallo HTTP rechaza con EmailJSResponseStatus{status,text}; un fallo de red deja
// que `fetch` rechace con TypeError, SIN .status. Esa diferencia es la que decide todo.
class EmailJSResponseStatus { constructor(status, text) { this.status = status; this.text = text; } }
const ERR_RED       = new TypeError('Failed to fetch');
const ERR_CUOTA     = new EmailJSResponseStatus(429, 'Too Many Requests');
const ERR_CUENTA    = new EmailJSResponseStatus(403, 'Forbidden');
const ERR_PROVEEDOR = new EmailJSResponseStatus(503, 'Service Unavailable');

function montar(errorDelServidor) {
  let AHORA = Date.parse('2026-08-03T12:00:00Z');
  const store = {};
  let requests = 0;

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
    emailjs: {
      async send() {
        requests++;
        const e = typeof errorDelServidor === 'function' ? errorDelServidor(requests) : errorDelServidor;
        if (e) throw e;
        return { status: 200, text: 'OK' };
      }
    },
    console: { log(){}, warn(){}, error(){} },
    toast(){},
    actualizarIndicadorPendientes(){},
    _reportarEstadoCorreos(){},
    _tecnicoActual: () => 'Jose Quiroz',
    window: { _firebaseReady: false }
  };

  const nombres = Object.keys(sandbox);
  const api = new Function(...nombres, codCola + `
    return {
      encolar: _encolarCorreo,
      enviar: _enviarCorreo,
      sincronizar: sincronizarCorreosPendientes,
      cola: _cargarCorreosPendientes,
      bloqueo: _cargarBloqueoCorreos,
      bloqueoVigente: _bloqueoCorreosVigente,
      clasificar: _clasificarErrorCorreo,
      backoff: _backoffCorreo
    };
  `)(...nombres.map(n => sandbox[n]));

  return {
    api,
    reqs: () => requests,
    reset: () => { requests = 0; },
    avanzar: ms => { AHORA += ms; },
    ahora: () => AHORA
  };
}

// Corre `minutos` de reloj lanzando la sincronizacion cada INTERVALO_MS, como el setInterval real.
async function correrReloj(ctx, minutos) {
  const pasadas = Math.floor((minutos * 60000) / INTERVALO_MS);
  for (let p = 0; p < pasadas; p++) {
    await ctx.api.sincronizar();
    ctx.avanzar(INTERVALO_MS);
  }
  return pasadas;
}

function encolarTres(ctx) {
  for (let i = 1; i <= 3; i++) {
    ctx.api.encolar({ email_admin: 'admin' + i + '@smu.cl', ot_numero: 90000 + i, local: 'UNIMARC ' + i });
  }
}

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); }

(async () => {
  console.log('Cola de correos — contencion de cuota (intervalo real: ' + (INTERVALO_MS / 1000) + ' s)\n');

  // ── 1. Sin señal: se reintenta, pero con backoff ────────────────────────────────────────────
  {
    const ctx = montar(ERR_RED);
    encolarTres(ctx);
    const pasadas = await correrReloj(ctx, 60);
    const sinBackoff = pasadas * 3;
    console.log('1) 3 avisos, 1 hora sin señal');
    console.log('   requests: ' + ctx.reqs() + '   (sin backoff serian ' + sinBackoff + ')');
    chequear(ctx.reqs() <= 25, 'la cola sigue martillando: ' + ctx.reqs() + ' requests en 1 h (tope 25)');
    chequear(ctx.api.cola().length === 3, 'se perdio un aviso: quedan ' + ctx.api.cola().length + ' de 3');
    chequear(!ctx.api.bloqueoVigente(), 'un error de RED no debe detener la cola (se destraba solo al volver la señal)');
  }

  // ── 2. Cuota agotada: la cola se DETIENE ────────────────────────────────────────────────────
  {
    const ctx = montar(ERR_CUOTA);
    encolarTres(ctx);
    const pasadas = await correrReloj(ctx, 60);
    console.log('2) 3 avisos, 1 hora con la cuota agotada (429)');
    console.log('   requests: ' + ctx.reqs() + '   (antes del fix: ' + (pasadas * 3) + ')');
    chequear(ctx.reqs() <= 2, 'un 429 tiene que cortar la cola de inmediato; hubo ' + ctx.reqs() + ' requests');
    chequear(!!ctx.api.bloqueoVigente(), 'la cola quedo sin bloqueo despues de un 429');
    chequear(ctx.api.cola().length === 3, 'se perdio un aviso al cortar: quedan ' + ctx.api.cola().length + ' de 3');
    // Un envio nuevo con la cola detenida tampoco puede gastar cuota.
    ctx.reset();
    const ok = await ctx.api.enviar({ email_admin: 'nuevo@smu.cl', ot_numero: 99999 });
    chequear(ok === false && ctx.reqs() === 0, 'con la cola detenida, un envio nuevo NO debe pegarle al servidor');
    chequear(ctx.api.cola().length === 4, 'el aviso nuevo tiene que quedar guardado igual (invariante: nunca se pierde)');
  }

  // ── 3. La pausa por cuota se levanta sola; la de cuenta NO ───────────────────────────────────
  {
    const ctx = montar(ERR_CUOTA);
    encolarTres(ctx);
    await ctx.api.sincronizar();
    ctx.reset();
    ctx.avanzar(3 * 60 * 60 * 1000);          // +3 h
    await ctx.api.sincronizar();
    chequear(ctx.reqs() === 0, 'a las 3 h del 429 todavia no debe reintentar (hubo ' + ctx.reqs() + ')');
    ctx.avanzar(4 * 60 * 60 * 1000);          // +7 h en total
    await ctx.api.sincronizar();
    console.log('3) Pausa por cuota: 0 requests a las 3 h, ' + ctx.reqs() + ' a las 7 h');
    chequear(ctx.reqs() > 0, 'pasada la pausa de 6 h la cola tiene que volver a intentar sola');
  }
  {
    const ctx = montar(ERR_CUENTA);
    encolarTres(ctx);
    await ctx.api.sincronizar();
    ctx.reset();
    ctx.avanzar(24 * 60 * 60 * 1000);         // +24 h
    await ctx.api.sincronizar();
    console.log('4) Credencial rechazada (403): ' + ctx.reqs() + ' requests en las 24 h siguientes');
    chequear(ctx.reqs() === 0, 'un problema de cuenta no se arregla solo: no debe reintentar (hubo ' + ctx.reqs() + ')');
    chequear(ctx.api.cola().length === 3, 'se perdio un aviso: quedan ' + ctx.api.cola().length + ' de 3');
  }

  // ── 5. Cuando el correo vuelve, la cola se vacia ─────────────────────────────────────────────
  {
    const ctx = montar(req => (req <= 3 ? ERR_RED : null));   // falla 3 veces y despues anda
    encolarTres(ctx);
    await correrReloj(ctx, 30);
    console.log('5) Falla y se recupera: quedan ' + ctx.api.cola().length + ' avisos en cola');
    chequear(ctx.api.cola().length === 0, 'al volver el servicio la cola tiene que vaciarse sola');
  }

  // ── 6. Clasificacion del error — es lo que decide reintentar o cortar ────────────────────────
  {
    const ctx = montar(null);
    const casos = [
      [ERR_RED,       'red',       'fetch rechazado (sin señal)'],
      [ERR_CUOTA,     'cuota',     '429 Too Many Requests'],
      [ERR_CUENTA,    'cuenta',    '403 Forbidden'],
      [ERR_PROVEEDOR, 'proveedor', '503 del proveedor'],
      [new EmailJSResponseStatus(400, 'You have exceeded the monthly limit'), 'cuota', '400 con texto de limite'],
      [new EmailJSResponseStatus(400, 'The Public Key is invalid'),           'cuenta', '400 de credencial'],
      [new EmailJSResponseStatus(451, 'Unavailable For Headless Browser'),    'cuenta', '451 headless'],
    ];
    let linea = '6) Clasificacion: ';
    casos.forEach(function(c) {
      const got = ctx.api.clasificar(c[0]).clase;
      chequear(got === c[1], c[2] + ' se clasifico como "' + got + '" (esperado "' + c[1] + '")');
      linea += (got === c[1] ? '✓' : '✗');
    });
    console.log(linea + '  (' + casos.length + ' casos)');
  }

  // ── 7. El backoff crece y tiene tope ─────────────────────────────────────────────────────────
  {
    const ctx = montar(null);
    const b = n => ctx.api.backoff(n) / 60000;
    chequear(b(1) === 1 && b(2) === 2 && b(3) === 4, 'el backoff no duplica: ' + [b(1), b(2), b(3)].join(', ') + ' min');
    chequear(b(50) === b(7) && b(50) <= 60, 'el backoff no tiene tope o desborda: ' + b(50) + ' min al intento 50');
    console.log('7) Backoff: ' + [1,2,3,4,5,6,7,8].map(b).join(', ') + ' min (tope ' + b(50) + ')');
  }

  console.log('');
  if (fallos.length) { console.log('❌ FALLA'); fallos.forEach(f => console.log(f)); }
  else console.log('✅ OK — la cola se contiene, corta ante cuota/credencial y no pierde ningun aviso');
  console.log('');
  process.exit(fallos.length ? 1 : 0);
})();
