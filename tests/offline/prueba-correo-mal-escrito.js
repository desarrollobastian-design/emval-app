/* PRUEBA REAL — un correo mal escrito no detiene la cola. Chromium, telefono emulado, app entera.

   node tests/offline/prueba-correo-mal-escrito.js <index.html|prefix.html> <A|B|C> [puerto]

   Caso OT #271080 (24-09-2026, S10 Concepcion, Lucas). El tecnico escribio a mano el correo del
   local en "Email del administrador" SIN la @: "admin095mayorista10.cl". EmailJS contesto
   `422 The recipients address is corrupted`, la version anterior lo clasifico como problema de
   la CUENTA y detuvo TODA la cola del telefono sin reintento automatico: la copia a
   administracion (cotizaciones.emval@gmail.com) quedo atascada detras, y "Reintentar ahora"
   volvia a chocar con el correo malo, que iba primero en la fila.

   Escenario A — EL TELEFONO DE LUCAS TAL COMO QUEDO. Antes de abrir la app se siembra en su
   localStorage la cola y el bloqueo que dejo la version anterior (aviso al local con la
   direccion sin @, esperando 1 h; copia a administracion detras; bloqueo 'cuenta' sin
   reintento). Se abre la app y se deja correr la sincronizacion por su gatillo real (el
   arranque: setTimeout de 4 s). Despues se abre el modal tocando la barra y se aprieta
   "Reintentar ahora", que es lo que re-bloqueaba la cola.
     Con el fix: sale 1 correo a administracion, 0 POST a la direccion mala, el bloqueo se borra,
     queda 1 aviso rendido con motivoFallo 'destinatario' y la barra dice "dirección mal escrita".
   Escenario B — EL CIERRE POR LA INTERFAZ. Un preventivo completo en una sucursal SIN correo en
     el catalogo (como la ficha "S10 Concepcion"), escribiendo la direccion mala a mano en
     #email-admin. Se mide el aviso rojo mientras se escribe, la copia a administracion (tiene
     que SALIR y avisar la direccion mala), la cola, el bloqueo y los toasts.
   Escenario C — EL SERVIDOR RECHAZA UNA DIRECCION CON @. La verificacion local solo atrapa lo
     que no tiene @; lo demas llega a EmailJS. Se siembra un aviso a "admin095@@mayorista10.cl"
     que el espia rechaza con el mismo 422, delante de la copia a administracion. Ejercita la
     clase 'destinatario' de _clasificarErrorCorreo en el navegador, no solo en Node.

   CONTRAPRUEBA OBLIGATORIA contra `prefix.html` armado desde origin/main: A y C tienen que
   FALLAR (0 correos a administracion, bloqueo vigente). Si el guion pasa contra las dos
   versiones, no esta midiendo nada.

   Firestore y EmailJS son los espias de gen-arnes.js: tocar produccion es imposible y no se
   gasta cuota. Encima de eso, este guion corta a nivel de red todo lo que no sea el sitio local
   o los CDN de librerias (EmailJS, Firestore, Cloudinary) y cuenta si algo lo intento: esos
   contadores tienen que dar 0 salvo las subidas a Cloudinary, que se contestan falsas.

   Variables: CAPTURAS=<carpeta> para las capturas de pantalla (por defecto, el temporal del
   sistema). El puerto por defecto es 8765, igual que el resto del arnes. */

const { chromium, devices } = require('playwright');
const path = require('path');
const os = require('os');

const ARCHIVO = process.argv[2] || 'index.html';
const ESC = (process.argv[3] || 'A').toUpperCase();
const PUERTO = Number(process.argv[4] || process.env.PUERTO || 8765);
const BASE = 'http://localhost:' + PUERTO + '/';
const CAPTURAS = process.env.CAPTURAS || os.tmpdir();

const ADMIN = 'cotizaciones.emval@gmail.com';        // window.PEDRO_NOTIF_EMAIL
const MALO = 'admin095mayorista10.cl';                // el de la OT #271080, sin @
const MALO_CON_ARROBA = 'admin095@@mayorista10.cl';   // escenario C: pasa el chequeo local
const TEXTO_422 = 'The recipients address is corrupted';

const log = (...a) => console.log(...a);
const fallos = [];
const chequear = (ok, detalle) => { log('  ' + (ok ? '✓' : '✗') + ' ' + detalle); if (!ok) fallos.push('  ✗ ' + detalle); };
const captura = (nombre) => path.join(CAPTURAS, 'correo-mal-escrito-' + ARCHIVO.replace('.html', '') + '-' + ESC + '-' + nombre + '.png');

(async () => {
  if (!['A', 'B', 'C'].includes(ESC)) { log('Escenario desconocido: ' + ESC); process.exit(2); }
  const browser = await chromium.launch();
  const ctx = await browser.newContext(Object.assign({}, devices['Pixel 7']));

  // ── Red: solo sale lo que no puede tocar nada. Todo lo demas se corta y se CUENTA ────────────
  const red = { emailjs: 0, firebase: 0, cloudinarySubida: 0, cloudinaryLectura: 0 };
  await ctx.route('**/*', (route) => {
    let h = '';
    try { h = new URL(route.request().url()).hostname; } catch (e) {}
    if (h === 'localhost' || h === '127.0.0.1') return route.continue();
    if (h === 'api.emailjs.com') { red.emailjs++; return route.abort(); }
    if (/(^|\.)firestore\.googleapis\.com$|firebasestorage|identitytoolkit|securetoken|firebaseio\.com$/.test(h) ||
        (h === 'www.gstatic.com' && /firebasejs/.test(route.request().url()))) { red.firebase++; return route.abort(); }
    if (h === 'api.cloudinary.com') {
      red.cloudinarySubida++;
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ secure_url: 'https://res.cloudinary.com/dcrf29tna/raw/upload/emval/pdfs/PRUEBA_ARNES.pdf' }) });
    }
    if (h === 'res.cloudinary.com') { red.cloudinaryLectura++; return route.fulfill({ status: 404, body: '' }); }
    return route.continue();   // cdnjs (jsPDF, xlsx) y fuentes: lectura publica de librerias
  });

  /* ── Antes de CUALQUIER script de la pagina ──────────────────────────────────────────────────
     1. EmailJS: el arnes de gen-arnes.js acepta todo. Aca se le pone delante un "servidor" que
        contesta lo que contesto EmailJS el 24-09: 422 a toda direccion sin @ (y, en C, a la
        direccion con @@). Se engancha con un setter sobre window.emailjs, asi que envuelve al
        espia en el mismo instante en que el arnes lo instala — no hay carrera con el arranque.
        `__INTENTOS` es todo POST que llego al "servidor", salga o no.
     2. El estado de localStorage con que ARRANCO la app, para la linea de control.
     3. Los toasts: el elemento es uno solo y cada toast pisa al anterior, asi que se registran
        todos con su hora para saber cuanto alcanzo a verse cada uno.
     4. En B, una sucursal sin correo en el catalogo, como la ficha "S10 Concepcion". Si la
        sucursal trae correo, `snap.email` usa ESE y lo escrito a mano ni se manda. */
  await ctx.addInitScript(({ esc, rechazadosConArroba, texto422 }) => {
    window.__INTENTOS = [];
    window.__TOASTS = [];
    try {
      window.__LS_INICIAL = {
        cola: localStorage.getItem('emval_correos_pendientes'),
        bloqueo: localStorage.getItem('emval_correos_bloqueo')
      };
    } catch (e) { window.__LS_INICIAL = { error: String(e) }; }

    let actual;
    const envolver = (v) => {
      if (!v || typeof v.send !== 'function' || v.__envuelto) return v;
      const orig = v.send;
      v.send = function (servicio, plantilla, params) {
        const dest = String((params && params.email_admin) || '');
        const rechaza = dest.indexOf('@') < 0 || rechazadosConArroba.indexOf(dest) >= 0;
        window.__INTENTOS.push({ a: dest, ot: String((params && params.ot_numero) || ''),
          ms: Math.round(performance.now()), rechazado: rechaza,
          trabajo: String((params && params.trabajo) || '') });
        if (rechaza) return Promise.reject({ status: 422, text: texto422 });
        return orig.apply(this, arguments);
      };
      v.__envuelto = true;
      return v;
    };
    Object.defineProperty(window, 'emailjs', { configurable: true, enumerable: true,
      get() { return actual; }, set(v) { actual = envolver(v); } });

    if (esc === 'B') {
      let semilla;
      Object.defineProperty(window, '__SEMILLA', { configurable: true, enumerable: true,
        get() { return semilla; },
        set(v) {
          semilla = v;
          if (v && Array.isArray(v.cadenas) && !v.cadenas.some((c) => c.nombre === 'S10')) {
            v.cadenas.push({ _id: 'cad_s10', nombre: 'S10', color: '#F7941D', logo: '', letra: 'S', orden: 1,
              sucursales: [{ nombre: 'S10 Concepcion', centro: '', direccion: 'Concepcion', email: '', emailSupervisor: '' }] });
          }
        } });
    }

    document.addEventListener('DOMContentLoaded', () => {
      const t = document.getElementById('toast');
      if (!t) return;
      new MutationObserver(() => {
        window.__TOASTS.push({ en: Date.now(), txt: t.textContent, ms: t._ms || 0 });
      }).observe(t, { childList: true, characterData: true, subtree: true });
    });
  }, { esc: ESC, rechazadosConArroba: ESC === 'C' ? [MALO_CON_ARROBA] : [], texto422: TEXTO_422 });

  const page = await ctx.newPage();
  const erroresJS = [];
  page.on('pageerror', (e) => erroresJS.push(e.message.slice(0, 160)));

  log('\n══ ' + ARCHIVO + ' · escenario ' + ESC + ' · puerto ' + PUERTO + ' ══');

  // Las claves se leen del archivo servido, no se asumen: si alguien las renombra, la siembra
  // caeria en una clave que la app no mira y el guion "pasaria" sin medir nada.
  const html = await (await page.request.get(BASE + ARCHIVO)).text();
  const k = (re) => { const m = html.match(re); return m ? m[1] : null; };
  const COLA_KEY = k(/const _CORREOS_KEY\s*=\s*'([^']+)'/);
  const BLOQUEO_KEY = k(/const _CORREOS_BLOQUEO_KEY\s*=\s*'([^']+)'/);
  const NOTIF = k(/window\.PEDRO_NOTIF_EMAIL\s*=\s*'([^']+)'/);
  log('claves leidas de ' + ARCHIVO + ': cola="' + COLA_KEY + '" bloqueo="' + BLOQUEO_KEY + '" notif="' + NOTIF + '"');
  if (COLA_KEY !== 'emval_correos_pendientes' || BLOQUEO_KEY !== 'emval_correos_bloqueo' || NOTIF !== ADMIN) {
    log('✗ las constantes no son las que este guion siembra/lee; se aborta'); await browser.close(); process.exit(2);
  }

  const estadoCola = () => page.evaluate(([ck, bk]) => {
    const cola = JSON.parse(localStorage.getItem(ck) || '[]') || [];
    const bar = document.getElementById('correos-bar');
    return {
      cola: cola.map((c) => ({ a: (c.params || {}).email_admin, ot: (c.params || {}).ot_numero, fallido: !!c.fallido,
        motivoFallo: c.motivoFallo || '', intentos: c.intentos || 0, ultimoError: String(c.ultimoError || '').slice(0, 160) })),
      bloqueo: JSON.parse(localStorage.getItem(bk) || 'null'),
      barraVisible: !!(bar && bar.offsetHeight),
      barraTexto: ((document.getElementById('correos-texto') || {}).textContent || ''),
      barraColor: bar ? getComputedStyle(bar).backgroundColor : '',
      intentos: window.__INTENTOS.map((x) => ({ a: x.a, ot: x.ot, ms: x.ms, rechazado: x.rechazado })),
      aceptados: window.__CORREOS.map((c) => ({ a: (c.params || {}).email_admin, ot: String((c.params || {}).ot_numero || ''),
        trabajo: String((c.params || {}).trabajo || '') })),
      alertas: window.__ESCRITURAS.filter((e) => e.coleccion === 'alertas').map((e) => e.datos)
    };
  }, [COLA_KEY, BLOQUEO_KEY]);
  const porDestino = (lista, a) => lista.filter((x) => x.a === a).length;

  // ═══════════════════════════════ ESCENARIOS A y C: COLA SEMBRADA ═════════════════════════════
  if (ESC === 'A' || ESC === 'C') {
    // Mismo origen que la app, pero sin la app: se siembra el telefono antes de abrirla.
    await page.goto(BASE + 'manifest.json');
    await page.evaluate(([ck, bk, esc, malo, maloArroba, admin, texto422]) => {
      localStorage.clear();
      const ahora = Date.now();
      const base = { ot_numero: '271080', local: 'S10 Concepcion', fecha: '24-09-2026', tecnico: 'LUCAS PRUEBA',
        tipo: 'Preventivo', pdf_url: 'https://res.cloudinary.com/dcrf29tna/raw/upload/emval/pdfs/PRUEBA_ARNES.pdf' };
      const local = esc === 'A' ? malo : maloArroba;
      const cola = [
        { clave: local + '|271080', intentos: esc === 'A' ? 1 : 0, creadoEn: ahora - 5 * 60000, fallido: false,
          proximoIntento: esc === 'A' ? ahora + 3600000 : 0,
          ultimoError: esc === 'A' ? '422 ' + texto422 : '',
          params: Object.assign({ email_admin: local, trabajo: 'Mantencion preventiva (PRUEBA ARNES)' }, base),
          service: '', template: '', post: null, despacho: 'ot_arnes271080__local', posibleEnvio: false, intentadoEn: 0 },
        { clave: admin + '|271080', intentos: 0, creadoEn: ahora - 5 * 60000, fallido: false, proximoIntento: 0,
          ultimoError: esc === 'A' ? 'el servicio de correo rechazó la cuenta (422 ' + texto422 + '). Hay que revisarlo en el panel de EmailJS.' : '',
          params: Object.assign({ email_admin: admin, trabajo: '' }, base),
          service: '', template: '', post: null, despacho: 'ot_arnes271080__admin', posibleEnvio: false, intentadoEn: 0 }
      ];
      localStorage.setItem(ck, JSON.stringify(cola));
      if (esc === 'A') {
        localStorage.setItem(bk, JSON.stringify({ clase: 'cuenta', status: 422, texto: texto422, desde: ahora, reintentarDespues: 0 }));
      }
    }, [COLA_KEY, BLOQUEO_KEY, ESC, MALO, MALO_CON_ARROBA, ADMIN, TEXTO_422]);

    const tCarga = Date.now();
    await page.goto(BASE + ARCHIVO);

    // LINEA DE CONTROL: la app arranco con la siembra puesta, con el espia de EmailJS envuelto
    // y con la cola que se quiere medir. Sin esto, "0 correos" no distingue el bug de un guion roto.
    const control = await page.evaluate(() => ({
      inicial: window.__LS_INICIAL,
      envuelto: !!(window.emailjs && window.emailjs.__envuelto),
      espiaDelArnes: Array.isArray(window.__CORREOS),
      sync: typeof sincronizarCorreosPendientes === 'function',
      onLine: navigator.onLine
    }));
    const colaInicial = JSON.parse((control.inicial && control.inicial.cola) || '[]');
    log('\nLINEA DE CONTROL');
    chequear(colaInicial.length === 2, 'la app arranco con los 2 avisos sembrados en la cola (tenia ' + colaInicial.length + ')');
    if (ESC === 'A') chequear(!!(control.inicial && control.inicial.bloqueo), 'la app arranco con el bloqueo "cuenta" sembrado');
    chequear(control.envuelto && control.espiaDelArnes, 'EmailJS es el espia del arnes, envuelto con el rechazo 422');
    chequear(control.sync && control.onLine, 'la cola existe y el telefono esta con señal (navigator.onLine)');

    // Se deja correr la app sola: el gatillo de arranque de la cola es setTimeout(…, 4000).
    // Ningun otro gatillo corre en esta ventana: no se dispara 'online', la pagina no cambia de
    // visibilidad y el intervalo es de 90 s.
    let ultimo = '';
    while (Date.now() - tCarga < 12000) {
      const s = await estadoCola();
      const linea = 'POST=' + JSON.stringify(s.intentos.map((x) => x.a + (x.rechazado ? '(422)' : ''))) +
        ' cola=' + s.cola.length + ' bloqueo=' + (s.bloqueo ? s.bloqueo.clase : 'no') + ' barra="' + s.barraTexto + '"';
      if (linea !== ultimo) { log('  [' + ((Date.now() - tCarga) / 1000).toFixed(1) + 's] ' + linea); ultimo = linea; }
      await page.waitForTimeout(400);
    }

    const s1 = await estadoCola();
    log('\nTRAMO 1 — la app se abre y la cola corre por su gatillo de arranque');
    log('  POST al servidor: ' + JSON.stringify(s1.intentos));
    log('  cola final: ' + JSON.stringify(s1.cola));
    log('  bloqueo final: ' + JSON.stringify(s1.bloqueo));
    log('  barra: visible=' + s1.barraVisible + ' color=' + s1.barraColor + ' texto="' + s1.barraTexto + '"');
    log('  alerta que se reporta a Firestore (espia): ' + JSON.stringify((s1.alertas.slice(-1)[0]) || null));
    const malo = ESC === 'A' ? MALO : MALO_CON_ARROBA;
    const postAdmin = s1.intentos.filter((x) => x.a === ADMIN);
    if (postAdmin.length) log('  el POST a administracion salio a los ' + postAdmin[0].ms + ' ms de cargada la pagina (gatillo de arranque: 4000 ms)');

    chequear(porDestino(s1.aceptados, ADMIN) === 1,
      'sale 1 correo a administracion (' + ADMIN + '): salieron ' + porDestino(s1.aceptados, ADMIN));
    if (ESC === 'A') chequear(porDestino(s1.intentos, MALO) === 0,
      '0 POST a la direccion sin @ (se rinde antes de gastar una request): hubo ' + porDestino(s1.intentos, MALO));
    else chequear(porDestino(s1.intentos, MALO_CON_ARROBA) === 1,
      'la direccion con @ llega UNA vez al servidor y se rechaza con 422: hubo ' + porDestino(s1.intentos, MALO_CON_ARROBA));
    chequear(s1.bloqueo === null, 'no queda bloqueo de la cola en localStorage (quedo ' + JSON.stringify(s1.bloqueo) + ')');
    chequear(s1.cola.length === 1 && s1.cola[0].a === malo && s1.cola[0].fallido && s1.cola[0].motivoFallo === 'destinatario',
      'queda 1 aviso en la cola, el de ' + malo + ', rendido con motivoFallo "destinatario"');
    chequear(s1.barraVisible && /(direcci[oó]n|correo) mal escrit[ao]/i.test(s1.barraTexto),
      'la barra dice "dirección mal escrita" (dice "' + s1.barraTexto + '")');
    chequear(!/problema de la cuenta/i.test(s1.barraTexto), 'la barra NO dice "problema de la cuenta"');

    // Informativo, no se evalua: la barra es `white-space:nowrap` y los textos largos (tambien los
    // de antes de este fix) quedan mas anchos que un telefono de 360-412 px.
    const rect = await page.evaluate(() => {
      const r = document.getElementById('correos-bar').getBoundingClientRect();
      return { izq: Math.round(r.left), der: Math.round(r.right), vw: innerWidth };
    });
    log('  (info) ancho de la barra: [' + rect.izq + ', ' + rect.der + '] en una pantalla de ' + rect.vw + ' px' +
      (rect.izq < 0 || rect.der > rect.vw ? ' → se corta en los bordes' : ' → cabe'));
    await page.screenshot({ path: captura('1-barra') });

    // ── El modal, abierto como lo abre una persona: tocando la barra ──────────────────────────
    if (s1.barraVisible) {
      await page.locator('#correos-bar').click();
      await page.waitForTimeout(600);
      const modal = await page.evaluate(() => ({
        visible: getComputedStyle(document.getElementById('modal-correos')).display !== 'none',
        sub: (document.getElementById('modal-correos-sub') || {}).textContent || '',
        estado: (document.getElementById('modal-correos-estado') || {}).innerText || '',
        lista: (document.getElementById('modal-correos-lista') || {}).innerText || ''
      }));
      log('\n  MODAL (tocando la barra): visible=' + modal.visible);
      log('    sub: ' + modal.sub);
      log('    estado: ' + JSON.stringify(modal.estado));
      log('    lista: ' + JSON.stringify(modal.lista));
      await page.screenshot({ path: captura('2-modal') });
      chequear(/no se va a enviar: la direcci[oó]n .*est[aá] mal escrita/i.test(modal.lista) && modal.lista.indexOf(malo) >= 0,
        'el modal dice a quien no le llego y que no se va a enviar');
      chequear(!/detenidos/i.test(modal.estado), 'el modal NO dice "Los envíos están detenidos"');

      // ── TRAMO 2: "Reintentar ahora" — era lo que volvia a chocar con el correo malo ──────────
      const antes = (await estadoCola()).intentos.length;
      await page.locator('#modal-correos button', { hasText: 'Reintentar ahora' }).click();
      await page.waitForTimeout(3500);
      const s2 = await estadoCola();
      const nuevos = s2.intentos.slice(antes);
      log('\nTRAMO 2 — se aprieta "Reintentar ahora" en el modal');
      log('  POST nuevos: ' + JSON.stringify(nuevos));
      log('  cola: ' + JSON.stringify(s2.cola));
      log('  bloqueo: ' + JSON.stringify(s2.bloqueo));
      log('  barra: "' + s2.barraTexto + '"');
      await page.screenshot({ path: captura('3-tras-reintentar') });
      if (ESC === 'A') chequear(porDestino(nuevos, MALO) === 0,
        'Reintentar NO le pega al servidor con la direccion sin @ (POST nuevos a ella: ' + porDestino(nuevos, MALO) + ')');
      else chequear(porDestino(nuevos, MALO_CON_ARROBA) <= 1,
        'Reintentar gasta a lo sumo 1 request con la direccion rechazada (hubo ' + porDestino(nuevos, MALO_CON_ARROBA) + ')');
      chequear(s2.bloqueo === null, 'Reintentar no vuelve a detener la cola (bloqueo: ' + JSON.stringify(s2.bloqueo) + ')');
      chequear(porDestino(s2.aceptados, ADMIN) === 1,
        'tras Reintentar, la copia a administracion salio exactamente 1 vez — ni 0 ni duplicada (salieron ' + porDestino(s2.aceptados, ADMIN) + ')');
      chequear(s2.cola.length === 1 && s2.cola[0].motivoFallo === 'destinatario', 'el aviso malo sigue guardado y rendido: ningun aviso se pierde');
    }
  }

  // ═══════════════════════════════ ESCENARIO B: CIERRE POR LA INTERFAZ ═════════════════════════
  if (ESC === 'B') {
    await page.goto(BASE + ARCHIVO);
    await page.waitForTimeout(2500);

    await page.locator('.usuario-item').first().click();
    await page.waitForTimeout(500);
    for (const d of '1111') await page.locator('button.pin-btn', { hasText: new RegExp('^' + d + '$') }).first().click();
    await page.waitForTimeout(1200);
    await page.locator('.cadena-nombre', { hasText: /^S10$/ }).first().click();
    await page.waitForTimeout(800);
    await page.locator('[data-sucursal-nombre="S10 Concepcion"]').first().click();
    await page.waitForTimeout(900);
    await page.locator('#t-prev').click();
    await page.locator('#desc-problema').fill('Mantencion preventiva transpaletas (PRUEBA ARNES)');
    await page.locator('button.btn', { hasText: 'Continuar' }).first().click();
    await page.waitForTimeout(800);
    await page.evaluate(() => { estado.fotoActualId = 'foto-antes-0'; estado.fotoActualTipo = 'antes'; estado.fotoActualIdx = 0; });
    await page.locator('#input-foto-galeria').setInputFiles(path.join(__dirname, 'foto-prueba.png'));
    await page.waitForTimeout(1800);
    await page.locator('button.btn', { hasText: 'Iniciar trabajo' }).first().click();
    await page.waitForTimeout(900);

    // La pauta de 11 servicios, por sus botones.
    await page.locator('#num-equipos').fill('2');
    const nSvc = await page.locator('[id^="svc-si-"]').count();
    for (let i = 0; i < nSvc; i++) await page.locator('#svc-si-' + i).click();
    await page.locator('#desc-trabajo').fill('Mantencion realizada sin novedad (PRUEBA ARNES)');

    // El correo del local, tecleado letra por letra como en el telefono.
    const aviso = () => page.evaluate(() => {
      const el = document.getElementById('email-admin-error');
      return el ? { existe: true, visible: !!el.offsetHeight, texto: el.textContent } : { existe: false, visible: false, texto: '' };
    });
    // El aviso se ENCIENDE al salir del campo (blur) y se APAGA mientras se escribe en cuanto la
    // direccion sirve: encenderlo letra por letra marcaba en rojo toda direccion buena hasta la @
    // (revision adversarial del 24-09).
    const campo = page.locator('#email-admin');
    await campo.click();
    await campo.pressSequentially('jefe', { delay: 25 });
    const aTecleando = await aviso();                    // "jefe" a medio escribir: nada en rojo
    await campo.fill('');
    await campo.pressSequentially('admin095mayorista10.cl', { delay: 25 });
    await campo.blur();
    const aMalo = await aviso();
    await campo.click();
    await campo.fill('');
    await campo.pressSequentially('admin095@mayorista10.cl', { delay: 25 });
    const aBueno = await aviso();
    await campo.fill('');
    await campo.pressSequentially(MALO, { delay: 25 });
    await campo.blur();
    const aFinal = await aviso();
    log('\nAVISO BAJO #email-admin');
    log('  tecleando "jefe": ' + JSON.stringify(aTecleando));
    log('  "' + MALO + '" y salir del campo: ' + JSON.stringify(aMalo));
    log('  con "admin095@mayorista10.cl": ' + JSON.stringify(aBueno));
    await campo.scrollIntoViewIfNeeded();
    await page.screenshot({ path: captura('1-aviso-rojo') });
    chequear(aTecleando.existe && !aTecleando.visible, 'el aviso rojo sale letra por letra antes de llegar a la @');
    chequear(aMalo.existe && aMalo.visible && /falta la @/.test(aMalo.texto),
      'aparece el aviso rojo #email-admin-error con la direccion sin @ al salir del campo ("' + aMalo.texto + '")');
    chequear(aBueno.existe && !aBueno.visible, 'con una direccion con @ el aviso rojo se va');
    chequear(aFinal.visible, 'al volver a escribir la mala, el aviso vuelve');

    for (const [tipo, idx] of [['despues', 0], ['timbre', 0]]) {
      await page.evaluate(([t, i]) => {
        estado.fotoActualId = 'foto-' + t + '-' + i; estado.fotoActualTipo = t; estado.fotoActualIdx = i;
      }, [tipo, idx]);
      await page.locator('#input-foto-galeria').setInputFiles(path.join(__dirname, 'foto-prueba.png'));
      await page.waitForTimeout(1600);
    }
    const c = page.locator('#firma-canvas');
    await c.scrollIntoViewIfNeeded();
    const b = await c.boundingBox();
    await page.mouse.move(b.x + 20, b.y + b.height * 0.6);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.3, { steps: 10 });
    await page.mouse.move(b.x + b.width - 25, b.y + b.height * 0.7, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    await page.locator('button.btn', { hasText: 'Confirmar firma' }).click();
    await page.waitForTimeout(600);

    const listo = await page.evaluate(() => ({ firmada: estado.firmada, num: estado.otNumero, tipo: estado.tipo,
      local: estado.local, emailSucursal: estado.emailSucursal, pauta: (estado.serviciosPreventivo || []).filter((s) => s.respuesta).length }));
    log('\nOT lista para cerrar: ' + JSON.stringify(listo));
    if (!listo.firmada || listo.tipo !== 'preventivo' || listo.pauta !== 11) {
      log('✗ la OT no quedo lista (firma/tipo/pauta); se aborta'); await browser.close(); process.exit(2);
    }

    await page.evaluate(() => { window.__TOASTS.length = 0; });
    const t0 = Date.now();
    await page.locator('#btn-cerrar-ot').click();
    while (Date.now() - t0 < 60000) {
      const n = await page.evaluate((a) => window.__INTENTOS.filter((x) => x.a === a).length +
        (JSON.parse(localStorage.getItem('emval_correos_pendientes') || '[]') || []).filter((c) => (c.params || {}).email_admin === a).length, ADMIN);
      if (n >= 1) break;
      await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(4000);

    const s = await estadoCola();
    const toasts = await page.evaluate(() => window.__TOASTS.slice());
    const t00 = toasts.length ? toasts[0].en : 0;
    const conVida = toasts.map((t, i) => {
      const hasta = Math.min(t.en + (t.ms || 0), i + 1 < toasts.length ? toasts[i + 1].en : Infinity);
      return { t: ((t.en - t00) / 1000).toFixed(2) + 's', visibleMs: hasta - t.en, txt: t.txt };
    });
    log('\nRESULTADO (' + Math.round((Date.now() - t0) / 1000) + 's despues de "Cerrar y generar OT")');
    log('  POST al servidor: ' + JSON.stringify(s.intentos));
    s.aceptados.forEach((a) => log('  salio → ' + a.a + ' ot="' + a.ot + '" trabajo=' + JSON.stringify(a.trabajo)));
    log('  cola: ' + JSON.stringify(s.cola));
    log('  bloqueo: ' + JSON.stringify(s.bloqueo));
    log('  barra: visible=' + s.barraVisible + ' texto="' + s.barraTexto + '"');
    log('  toasts (en orden, con cuanto alcanzo a verse cada uno antes de que lo pisara el siguiente):');
    conVida.forEach((t) => log('    [' + t.t + '] ' + t.visibleMs + ' ms · ' + t.txt));
    await page.screenshot({ path: captura('2-tras-cerrar') });

    const admin = s.aceptados.filter((a) => a.a === ADMIN);
    chequear(porDestino(s.intentos, MALO) === 0, '0 POST a la direccion sin @ (hubo ' + porDestino(s.intentos, MALO) + ')');
    chequear(admin.length === 1, 'la copia a administracion SALE (salieron ' + admin.length + ')');
    chequear(admin.length === 1 && /ATENCION/.test(admin[0].trabajo) && admin[0].trabajo.indexOf(MALO) >= 0,
      'la copia a administracion avisa que el correo del local esta mal escrito y dice cual');
    chequear(admin.length === 1 && admin[0].ot === String(listo.num), 'la copia lleva el N° de la OT cerrada (' + listo.num + ')');
    chequear(s.bloqueo === null, 'no queda bloqueo de la cola (quedo ' + JSON.stringify(s.bloqueo) + ')');
    chequear(s.cola.length === 1 && s.cola[0].a === MALO && s.cola[0].fallido && s.cola[0].motivoFallo === 'destinatario',
      'el aviso al local queda guardado en la cola, rendido con motivoFallo "destinatario"');
    // Va en un DIALOGO y no en un toast: sin señal, "Aviso a administración pendiente…" pisaba el
    // toast al milisegundo y el tecnico nunca lo veia (revision adversarial del 24-09).
    const dlg = await page.evaluate(() => {
      const ov = document.getElementById('dlg-overlay');
      return { visible: !!(ov && ov.offsetHeight), titulo: (document.getElementById('dlg-titulo') || {}).textContent || '',
               msg: (document.getElementById('dlg-msg') || {}).textContent || '' };
    });
    log('  dialogo: ' + JSON.stringify(dlg));
    chequear(dlg.visible && /mal escrito/.test(dlg.titulo + ' ' + dlg.msg) && dlg.msg.indexOf(MALO) >= 0,
      'el tecnico ve un dialogo que dice que el correo del local esta mal escrito y cual es');
    chequear(/(direcci[oó]n|correo) mal escrit[ao]/i.test(s.barraTexto), 'la barra queda diciendo "dirección mal escrita" ("' + s.barraTexto + '")');
  }

  log('\n  red externa intentada: ' + JSON.stringify(red));
  chequear(red.emailjs === 0 && red.firebase === 0, 'ninguna llamada llego a EmailJS ni a Firebase reales');
  if (erroresJS.length) log('  errores JS de la pagina: ' + erroresJS.slice(0, 5).join(' | '));
  await browser.close();

  log('');
  if (fallos.length) {
    log('❌ FALLA — ' + ARCHIVO + ' escenario ' + ESC + ':');
    log(fallos.join('\n'));
    process.exit(1);
  }
  log('✅ OK — ' + ARCHIVO + ' escenario ' + ESC + ': el correo mal escrito se rinde solo y la cola sigue saliendo');
})().catch((e) => { console.error('ERROR DEL GUION: ' + (e && e.stack || e)); process.exit(2); });
