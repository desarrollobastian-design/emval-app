/* Prueba de regresion — un Administrador sin passwordHash NO entra con ninguna clave.

   Hasta el 22-10-2026, al cargar la lista de usuarios, a todo Administrador sin passwordHash la
   app le calculaba el hash de una clave temporal ESCRITA EN index.html y lo guardaba en Firestore
   («Migracion primera vez»). El repo es publico: cualquiera podia leer esa clave, y todo
   administrador nuevo quedaba con ella. Pedro ya tenia su hash; el agujero era para el siguiente.

   Lo que se exige ahora:
   1. Cargar la lista no inventa hashes ni escribe en Firestore.
   2. En el codigo no hay ningun sha256('<literal>'): una clave fija en un repo publico no es clave.
   3. validarPassword: sin hash no entra con NADA (ni vacio, ni cualquier texto, ni la clave que el
      codigo viejo usaba: esta prueba la captura en memoria al correr el render y nunca la imprime)
      y dice por que. Con hash, entra con su clave y no con otra.
   4. verificarPasswordAdmin (confirmar acciones): sin hash dice por que y ni siquiera pide clave.
   5. seleccionarUsuario avisa al entrar a la pantalla, antes de que escriba.
   6. La carrera de los 200 ms (Codex, 23-10-2026): elegir a un Administrador mientras se valida el
      PIN de otra persona no lo hace entrar, y un Administrador nunca entra con un PIN.

   Uso:  node tests/admin-sin-clave-no-entra.js index.html
   Sale 0 si no hay clave por defecto; 1 si un administrador sin hash puede entrar o se escribe algo. */

const fs = require('fs');
const crypto = require('crypto');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); return !!ok; }
const sha = t => crypto.createHash('sha256').update(t).digest('hex');

// Extrae una funcion COMPLETA de index.html contando llaves (saltando strings y comentarios). No se
// reimplementa nada: si la funcion cambia, este test corre el codigo nuevo.
function extraerFuncion(nombre) {
  const m = src.match(new RegExp('(async\\s+)?function\\s+' + nombre + '\\s*\\('));
  if (!m) { chequear(false, 'no se encontro ' + nombre + ' (¿se renombro?)'); return null; }
  const ini = m.index;
  let i = src.indexOf('{', ini), prof = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
    } else if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); }
    else if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 1; }
    else if (c === '{') prof++;
    else if (c === '}' && --prof === 0) return src.slice(ini, i + 1);
  }
  chequear(false, 'no se encontro el final de ' + nombre);
  return null;
}
function el() {
  return { style: {}, value: '', textContent: '', innerHTML: '', hijos: [],
    appendChild(h) { this.hijos.push(h); }, focus() {} };
}
function docFalso() {
  const mapa = {};
  return { mapa, getElementById(id) { return mapa[id] || (mapa[id] = el()); }, createElement: el };
}

const mAviso = src.match(/const ADMIN_SIN_ACCESO = (['"])(.*?)\1;/);
const AVISO = mAviso ? mAviso[2] : null;
const PEDRO = 'Pedro Arce', NUEVO = 'Admin Nuevo';
const CLAVE_PEDRO = 'clave-solo-de-prueba';

(async () => {
  console.log('Administrador sin passwordHash: sin clave por defecto\n');
  chequear(!!AVISO && /CorexOn/.test(AVISO), 'no hay aviso ADMIN_SIN_ACCESO que le diga al administrador a quien pedir el acceso');

  // Lo que el codigo pasa a sha256 se guarda SOLO en memoria: si el render viejo hashea su clave
  // temporal, aca queda capturada para probarla en el paso 3. Jamas se imprime.
  const fSha = extraerFuncion('sha256');
  const shaReal = fSha ? new Function(fSha + '; return sha256;')() : (async t => sha(t));
  const entradas = [];
  const sha256 = async t => { entradas.push(t); return shaReal(t); };

  // ── 1. Cargar la lista: no inventa hashes ni escribe ─────────────────────────────────────────
  const ADMIN_HASHES = {}, PINS = {};
  const escrituras = [];
  const window = { firebase: { firestore() { return { collection(c) { return { doc(id) { return {
    update(d) { escrituras.push(c + '/' + id + ' ' + Object.keys(d).join(',')); return Promise.resolve(); },
    set(d) { escrituras.push(c + '/' + id + ' set ' + Object.keys(d).join(',')); return Promise.resolve(); }
  }; } }; } }; } } };
  const fRender = extraerFuncion('_renderListaUsuarios');
  if (fRender) {
    const render = new Function('document', 'window', 'ADMIN_HASHES', 'PINS', 'sha256', '_ocultoTecnico',
      '_colorPorNombre', '_crearUsuarioItem', fRender + '; return _renderListaUsuarios;')(
      docFalso(), window, ADMIN_HASHES, PINS, sha256, () => false, () => '#000', () => el());
    render([
      { _id: 'u_nuevo', nombre: NUEVO, cargo: 'Administrador', letra: 'A' },
      { _id: 'u_pedro', nombre: PEDRO, cargo: 'Administrador', letra: 'P', passwordHash: sha(CLAVE_PEDRO) },
      { _id: 'u_lucas', nombre: 'Lucas', cargo: 'Tecnico en terreno', letra: 'L', pin: '2222' }
    ]);
    await new Promise(r => setTimeout(r, 50));   // la migracion vieja era asincrona
    const sinHash = ADMIN_HASHES[NUEVO] === undefined;
    console.log('1) Lista       → admin sin hash: ' + (sinHash ? 'sin clave ✓' : 'LE INVENTO UNA ✗') +
      ', escrituras a Firestore: ' + escrituras.length + (escrituras.length ? ' ✗' : ' ✓') +
      ', Pedro: ' + (ADMIN_HASHES[PEDRO] === sha(CLAVE_PEDRO) ? 'su hash ✓' : 'SIN SU HASH ✗'));
    chequear(sinHash, 'al cargar la lista, el administrador sin passwordHash quedo con un hash que nadie le asigno');
    chequear(escrituras.length === 0, 'cargar la lista escribio en Firestore: ' + escrituras.join(' | '));
    chequear(ADMIN_HASHES[PEDRO] === sha(CLAVE_PEDRO), 'el administrador CON passwordHash no quedo con el suyo');
  }

  // ── 2. Ninguna clave fija en el codigo ───────────────────────────────────────────────────────
  const fijas = (src.match(/sha256\(\s*(['"`])[^'"`]+\1\s*\)/g) || []).length;
  console.log('2) Codigo      → sha256 con texto fijo: ' + fijas + (fijas ? ' ✗' : ' ✓'));
  chequear(fijas === 0, 'index.html calcula sha256 de un texto fijo: es una clave publicada en un repo publico');

  // ── 3. validarPassword ───────────────────────────────────────────────────────────────────────
  const fVal = extraerFuncion('validarPassword');
  if (fVal) {
    const intentar = async (usuario, clave) => {
      const doc = docFalso();
      doc.getElementById('admin-pass-input').value = clave;
      let entro = false;
      const validar = new Function('document', 'estado', 'ADMIN_HASHES', 'sha256', 'loginExitoso', 'ADMIN_SIN_ACCESO',
        fVal + '; return validarPassword;')(doc, { usuario }, ADMIN_HASHES, shaReal, () => { entro = true; }, AVISO);
      await validar();
      return { entro, msg: doc.getElementById('admin-pass-error').textContent };
    };
    // Lo que el render paso a sha256 (en el codigo viejo, su clave temporal) + claves cualquiera.
    const candidatas = ['', 'cualquier-cosa', '1234', CLAVE_PEDRO].concat(entradas);
    let entroSin = 0, avisos = 0;
    for (const c of candidatas) {
      const r = await intentar(NUEVO, c);
      if (r.entro) entroSin++;
      if (AVISO && r.msg === AVISO) avisos++;
    }
    const ok = await intentar(PEDRO, CLAVE_PEDRO);
    const mal = await intentar(PEDRO, 'otra-clave');
    console.log('3) Login       → sin hash entro ' + entroSin + ' de ' + candidatas.length + ' intentos' +
      (entroSin ? ' ✗' : ' ✓') + ' (aviso en ' + avisos + '); Pedro con su clave ' + (ok.entro ? 'entra ✓' : 'NO ENTRA ✗') +
      ', con otra ' + (mal.entro ? 'ENTRA ✗' : 'no ✓'));
    chequear(entroSin === 0, 'un administrador sin passwordHash entro con una clave que nadie le asigno (' + entroSin + ' de ' + candidatas.length + ')');
    chequear(avisos === candidatas.length, 'sin passwordHash no siempre se dice por que (aviso en ' + avisos + ' de ' + candidatas.length + ' intentos)');
    chequear(ok.entro, 'Pedro, con passwordHash, no entra con su clave');
    chequear(!mal.entro, 'Pedro entra con una clave que no es la suya');
  }

  // ── 4. verificarPasswordAdmin (confirmar acciones de administrador) ───────────────────────────
  const fVer = extraerFuncion('verificarPasswordAdmin');
  if (fVer) {
    const confirmar = async (usuario, clave) => {
      const toasts = []; let pidio = 0;
      const ver = new Function('estado', 'ADMIN_HASHES', 'sha256', '_pedirTexto', 'toast', 'ADMIN_SIN_ACCESO',
        fVer + '; return verificarPasswordAdmin;')(
        { usuario }, ADMIN_HASHES, shaReal, async () => { pidio++; return clave; }, m => toasts.push(m), AVISO);
      return { ok: await ver(), toasts, pidio };
    };
    const sin = await confirmar(NUEVO, entradas[0] || 'cualquier-cosa');
    const con = await confirmar(PEDRO, CLAVE_PEDRO);
    console.log('4) Confirmar   → sin hash ' + (sin.ok ? 'CONFIRMA ✗' : 'no ✓') + (sin.pidio ? ', pidio clave' : ', no pide clave') +
      '; Pedro ' + (con.ok ? 'confirma ✓' : 'NO CONFIRMA ✗'));
    chequear(!sin.ok, 'verificarPasswordAdmin acepta a un administrador sin passwordHash');
    chequear(sin.pidio === 0 && !!AVISO && sin.toasts.includes(AVISO), 'sin passwordHash se le pide clave en vez de decirle por que no puede');
    chequear(con.ok, 'Pedro no puede confirmar acciones con su clave');
  }

  // ── 5. seleccionarUsuario avisa al entrar ────────────────────────────────────────────────────
  const fSel = extraerFuncion('seleccionarUsuario');
  if (fSel) {
    const pantalla = (nombre) => {
      const doc = docFalso();
      new Function('document', 'estado', 'ADMIN_HASHES', 'localStorage', '_colorPorNombre', 'actualizarDots', 'go',
        'setTimeout', 'ADMIN_SIN_ACCESO', 'var pinActual = "", _pinTimer = null;\n' + fSel + '; return seleccionarUsuario;')(
        doc, {}, ADMIN_HASHES, { setItem() {} }, () => '#000', () => {}, () => {}, () => {}, AVISO)(nombre, 'Administrador', 'A');
      const e = doc.getElementById('admin-pass-error');
      return { visible: e.style.display === 'block', texto: e.textContent };
    };
    const sin = pantalla(NUEVO), con = pantalla(PEDRO);
    const avisa = sin.visible && !!AVISO && sin.texto === AVISO;
    console.log('5) Pantalla    → sin hash ' + (avisa ? 'avisa al entrar ✓' : 'NO AVISA ✗') + '; Pedro ' + (con.visible ? 'VE UN ERROR ✗' : 'sin aviso ✓'));
    chequear(avisa, 'la pantalla de contrasena no le avisa al administrador sin acceso antes de que escriba');
    chequear(!con.visible, 'a Pedro, que tiene su clave, le aparece un error al entrar');
  }

  // ── 6. La carrera de los 200 ms (Codex, 23-10-2026) ──────────────────────────────────────────
  // pinInput validaba 200 ms despues del cuarto digito, con el usuario de ESE momento: eligiendo a
  // un Administrador en ese intervalo se entraba como el con un PIN, sin su contraseña. Se corre el
  // flujo real (lista → elegir → teclear → cambiar de persona → vencer el temporizador).
  const fPin = extraerFuncion('pinInput'), fValPin = extraerFuncion('validarPin'), fDots = extraerFuncion('actualizarDots');
  if (fRender && fSel && fPin && fValPin && fDots) {
    const PIN_ANA = '4821', PIN_PEDRO = '5555';   // valores SOLO de prueba
    const correr = (pasos) => {
      const doc = docFalso();
      const clases = {};
      const conClases = id => { const e = doc.getElementById(id); e.classList = e.classList || {
        add: c => { (clases[id] = clases[id] || {})[c] = true; }, remove: c => { if (clases[id]) delete clases[id][c]; },
        contains: c => !!(clases[id] && clases[id][c]), toggle: () => {} }; return e; };
      ['s-pin', 's-usuarios', 'dot0', 'dot1', 'dot2', 'dot3'].forEach(conClases);
      const go = id => { ['s-pin', 's-usuarios'].forEach(s => conClases(s).classList.remove('active')); conClases(id).classList.add('active'); };
      const cola = [];
      const setT = (fn, ms) => { cola.push(fn); return cola.length; };
      const entradas = [];
      const estado = { usuario: null, cargo: null };
      const api = new Function('document', 'window', 'estado', 'ADMIN_HASHES', 'PINS', 'sha256', '_ocultoTecnico', '_colorPorNombre',
        '_crearUsuarioItem', 'localStorage', 'go', 'setTimeout', 'clearTimeout', 'toast', 'loginExitoso', 'ADMIN_SIN_ACCESO',
        'var pinActual = "", _pinTimer = null;\n' + fRender + '\n' + fSel + '\n' + fPin + '\n' + fValPin + '\n' + fDots +
        '\nreturn { render: _renderListaUsuarios, elegir: seleccionarUsuario, tecla: pinInput };')(
        doc, { firebase: { firestore() { return { collection() { return { doc() { return { update() { return Promise.resolve(); } }; } }; } }; } } },
        estado, {}, {}, async t => sha(t), () => false, () => '#000', () => el(), { setItem() {} }, go, setT,
        id => { if (id) cola[id - 1] = null; }, () => {}, () => entradas.push(estado.usuario + '|' + estado.cargo), AVISO);
      api.render([
        { _id: 'u_ana', nombre: 'Ana Prueba', cargo: 'Tecnico en terreno', letra: 'A', pin: PIN_ANA },
        { _id: 'u_pedro', nombre: PEDRO, cargo: 'Administrador', letra: 'P', pin: PIN_PEDRO, passwordHash: sha(CLAVE_PEDRO) }
      ]);
      go('s-usuarios');
      pasos(api, go);
      cola.splice(0).forEach(f => { if (f) f(); });   // vence todo lo agendado
      return entradas;
    };
    // El ataque: se elige a Ana, se teclea el PIN de Pedro y, antes de los 200 ms, se elige a Pedro.
    const ataque = correr((api) => { api.elegir('Ana Prueba', 'Tecnico en terreno', 'A'); PIN_PEDRO.split('').forEach(api.tecla); api.elegir(PEDRO, 'Administrador', 'P'); });
    // Igual, con el PIN de la propia Ana (no puede entrar como Pedro ni quedar adentro como Ana).
    const ataque2 = correr((api) => { api.elegir('Ana Prueba', 'Tecnico en terreno', 'A'); PIN_ANA.split('').forEach(api.tecla); api.elegir(PEDRO, 'Administrador', 'P'); });
    // El PIN de Pedro tecleado con Pedro elegido (el teclado esta oculto, pero la funcion existe).
    const porPin = correr((api) => { api.elegir(PEDRO, 'Administrador', 'P'); PIN_PEDRO.split('').forEach(api.tecla); });
    // Linea de control: Ana con su PIN entra (si esto falla, la prueba no mide nada).
    const control = correr((api) => { api.elegir('Ana Prueba', 'Tecnico en terreno', 'A'); PIN_ANA.split('').forEach(api.tecla); });
    const comoAdmin = l => l.some(x => /\|Administrador$/.test(x));
    console.log('6) Carrera     → cambiar a Pedro en los 200 ms: ' + (comoAdmin(ataque) || comoAdmin(ataque2) || ataque2.length ? 'ENTRA ✗' : 'no entra ✓') +
      '; Pedro por PIN: ' + (comoAdmin(porPin) ? 'ENTRA ✗' : 'no ✓') + '; control (Ana con su PIN): ' + (control.join() === 'Ana Prueba|Tecnico en terreno' ? 'entra ✓' : 'NO ENTRA ✗'));
    chequear(!comoAdmin(ataque), 'eligiendo a un Administrador en los 200 ms se entra como el con un PIN, sin su contraseña');
    chequear(!comoAdmin(ataque2) && ataque2.length === 0, 'al cambiar de persona en los 200 ms se entra igual (como uno u otro)');
    chequear(!comoAdmin(porPin), 'un Administrador entra con un PIN en vez de su contraseña');
    chequear(control.join() === 'Ana Prueba|Tecnico en terreno', 'LINEA DE CONTROL: un tecnico con su PIN no entra: la prueba no mide nada');
  }

  console.log('');
  if (fallos.length) {
    console.log('FALLA (' + fallos.length + '):');
    fallos.forEach(f => console.log(f));
    process.exit(1);
  }
  console.log('OK — sin passwordHash no se entra con ninguna clave, y Pedro entra con la suya.');
})().catch(e => { console.error('FALLA — la prueba se cayo:', e && e.message); process.exit(1); });
