/* Prueba de regresion — no hay clave por defecto y el telefono no guarda secretos.

   Origen (PR #63, 22-10-2026): al cargar la lista de usuarios, a todo Administrador sin passwordHash
   la app le calculaba el hash de una clave temporal ESCRITA EN index.html y lo guardaba en
   Firestore. El repo es publico: cualquiera podia leer esa clave. Desde la etapa 1 de Firebase Auth
   (23-10-2026) la clave la verifica Firebase, y esta prueba vigila que eso no se deshaga:

   1. En el codigo no hay ningun sha256('<texto fijo>'): una clave fija en un repo publico no es clave.
   2. La entrada ya no usa `pin` ni `passwordHash`: la lista sale de `directorio`, no de `tecnicos`.
   3. Un Administrador sin cuenta en Firebase no entra con NADA (ni vacio, ni cualquier texto, ni la
      clave quemada del historial: se saca de git al correr y nunca se imprime), y entrar no escribe
      en Firestore.
   4. La clave vacia ni siquiera se le pregunta a Firebase.
   5. El cache de la lista no guarda PIN ni hash aunque le lleguen, y el cache viejo se borra.
   6. La carrera de los 200 ms (Codex, PR #63, 23-10-2026): elegir a un Administrador mientras se
      valida el PIN de otra persona no lo hace entrar, y un Administrador nunca entra con un PIN. La
      guardia corta ANTES de preguntarle a Firebase (que igual lo rechazaria: asi se mide la guardia).

   Uso:  node tests/admin-sin-clave-no-entra.js index.html
   Sale 0 si no hay clave por defecto ni secretos; 1 si los hay. */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); return !!ok; }

function extraerFuncion(nombre) {
  const m = src.match(new RegExp('(async\\s+)?function\\s+' + nombre + '\\s*\\('));
  if (!m) { chequear(false, 'no se encontro ' + nombre + ' (¿se renombro?)'); return null; }
  let i = src.indexOf('{', m.index), prof = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++; }
    else if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); }
    else if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 1; }
    else if (c === '{') prof++;
    else if (c === '}' && --prof === 0) return src.slice(m.index, i + 1);
  }
  return null;
}

// La clave quemada, del historial (commit anterior al PR #63). Solo en memoria; nunca se imprime.
function claveQuemada() {
  try {
    const viejo = execFileSync('git', ['show', 'bdeea89:index.html'], { cwd: path.resolve(__dirname, '..'),
      maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8');
    const lits = Array.from(new Set((viejo.match(/sha256\('([^']+)'\)/g) || []).map(m => m.slice(8, -2))));
    return lits.length === 1 ? lits[0] : null;
  } catch (e) { return null; }
}

(async () => {
  console.log('Sin clave por defecto y sin secretos en el telefono\n');

  // ── 1. Ninguna clave fija ────────────────────────────────────────────────────────────────────
  const fijas = (src.match(/sha256\(\s*(['"`])[^'"`]+\1\s*\)/g) || []).length;
  console.log('1) Codigo      → sha256 con texto fijo: ' + fijas + (fijas ? ' ✗' : ' ✓'));
  chequear(fijas === 0, 'index.html calcula sha256 de un texto fijo: es una clave publicada en un repo publico');

  // ── 2. La entrada no usa pin ni passwordHash ─────────────────────────────────────────────────
  const fRender = extraerFuncion('_renderListaUsuarios') || '';
  const fCargar = extraerFuncion('cargarUsuariosApp') || '';
  const usaSecretos = /\.pin\b|passwordHash/.test(fRender) || /\.pin\b|passwordHash/.test(fCargar);
  const leeTecnicos = /collection\('tecnicos'\)/.test(fCargar);
  const leeDirectorio = /collection\('directorio'\)/.test(fCargar);
  console.log('2) Lista       → ' + (leeDirectorio && !leeTecnicos ? 'sale de directorio ✓' : 'NO sale de directorio ✗') + ', usa PIN o hash: ' + (usaSecretos ? 'SI ✗' : 'no ✓'));
  chequear(leeDirectorio && !leeTecnicos, 'la pantalla de entrada sigue leyendo `tecnicos` (PIN y hash) en vez de `directorio`');
  chequear(!usaSecretos, 'la lista de entrada usa `pin` o `passwordHash`: el secreto se volveria a verificar en el navegador');

  // ── 3 y 4. Un Administrador sin cuenta no entra con nada; vacio ni se pregunta ──────────────
  const i0 = src.indexOf('const AUTH_ETAPA = 1;'), i1 = src.indexOf('// =========== NAVEGACION', i0);
  const mTimeout = src.match(/function _conTimeout\(promise, ms, etiqueta\) \{[\s\S]*?\n\}/);
  const fVal = extraerFuncion('validarPassword');
  chequear(i0 >= 0 && i1 > i0 && !!mTimeout && !!fVal, 'no se encontro el bloque de Firebase Auth o validarPassword');
  if (i0 >= 0 && i1 > i0 && mTimeout && fVal) {
    const intentos = [], escrituras = [];
    const auth = { currentUser: null, onAuthStateChanged() {},
      signInWithEmailAndPassword(c) { intentos.push(c); return Promise.reject(Object.assign(new Error('x'), { code: 'auth/invalid-credential' })); } };
    const firestore = () => ({ collection: () => ({ doc: () => ({
      set() { escrituras.push('set'); return Promise.resolve(); }, update() { escrituras.push('update'); return Promise.resolve(); } }),
      add() { escrituras.push('add'); return Promise.resolve({}); } }) });
    const mem = {};
    const doc = { mapa: {}, getElementById(id) { return this.mapa[id] || (this.mapa[id] = { value: '', textContent: '', style: {}, focus() {} }); } };
    let entro = 0;
    const api = new Function('window', 'localStorage', 'toast', '_pedirTexto', 'estado', 'document', 'loginExitoso',
      mTimeout[0] + '\n' + src.slice(i0, i1) + '\nlet _entrando = false;\n' + fVal +
      '\nreturn { validarPassword, FICHAS: _FICHAS, correo: _correoDeCuenta };')(
      { firebase: { auth: () => auth, firestore } },
      { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } },
      () => {}, async () => null, { usuario: 'Admin Nuevo' }, doc, () => { entro++; });
    api.FICHAS['Admin Nuevo'] = { uid: 'u_nuevo', correo: api.correo('u_nuevo'), cargo: 'Administrador' };
    const quemada = claveQuemada();
    const candidatas = ['cualquier-cosa', '1234', 'admin123'].concat(quemada ? [quemada] : []);
    for (const c of candidatas) { doc.getElementById('admin-pass-input').value = c; await api.validarPassword(); }
    const preguntadas = intentos.length;
    doc.getElementById('admin-pass-input').value = '';
    await api.validarPassword();
    const vacioPregunto = intentos.length > preguntadas;
    const secretoGuardado = Object.values(mem).join('|');
    console.log('3) Sin cuenta  → entro ' + entro + ' de ' + candidatas.length + ' intentos' + (entro ? ' ✗' : ' ✓') +
      (quemada ? ' (incluida la clave quemada, sin imprimirla)' : ' (sin git: la clave quemada no se probo)') +
      ', escrituras a Firestore: ' + escrituras.length + (escrituras.length ? ' ✗' : ' ✓'));
    console.log('4) Clave vacia → ' + (vacioPregunto ? 'SE LE PREGUNTO A FIREBASE ✗' : 'ni se pregunta ✓'));
    chequear(entro === 0, 'un Administrador sin cuenta en Firebase entro con una clave (' + entro + ' de ' + candidatas.length + ')');
    chequear(escrituras.length === 0, 'intentar entrar escribio en Firestore');
    chequear(!vacioPregunto, 'la clave vacia se le pregunta a Firebase');
    chequear(!candidatas.some(c => secretoGuardado.includes(c)), 'un intento fallido dejo la clave guardada en el telefono');
  }

  // ── 5. El cache de la lista no guarda secretos ───────────────────────────────────────────────
  const mCache = src.match(/var _CAMPOS_FICHA = [^\n]*\n[\s\S]*?function _cacheUsuarios\(docs\) \{[\s\S]*?\n\}/);
  chequear(!!mCache, 'no se encontro _cacheUsuarios con su lista de campos');
  if (mCache) {
    const mem = {};
    new Function('localStorage', mCache[0] + '\n_cacheUsuarios([{ _id: "u1", nombre: "Ana", cargo: "Tecnico en terreno", letra: "A", pin: "4821", passwordHash: "abc123" }]);')(
      { setItem: (k, v) => { mem[k] = v; } });
    const guardado = Object.values(mem).join('|');
    const limpio = guardado.includes('Ana') && !guardado.includes('4821') && !guardado.includes('abc123') && !/pin|passwordHash/.test(guardado);
    const borraViejo = /localStorage\.removeItem\('emval_users_cache'\)/.test(src);
    const escribeViejo = /localStorage\.setItem\('emval_users_cache'/.test(src);
    console.log('5) Cache       → ' + (limpio ? 'solo nombre, cargo, letra y correo ✓' : 'GUARDA SECRETOS ✗') + ', cache viejo con PIN: ' + (borraViejo && !escribeViejo ? 'se borra ✓' : 'SIGUE ✗'));
    chequear(limpio, 'el cache de la pantalla de entrada guarda PIN o hash');
    chequear(borraViejo && !escribeViejo, 'el cache viejo `emval_users_cache` (PIN y hash) no se borra o se sigue escribiendo');
  }

  // ── 6. La carrera de los 200 ms ──────────────────────────────────────────────────────────────
  const fSel = extraerFuncion('seleccionarUsuario'), fPin = extraerFuncion('pinInput');
  const fValPin = extraerFuncion('validarPin'), fDots = extraerFuncion('actualizarDots');
  if (i0 >= 0 && i1 > i0 && mTimeout && fRender && fSel && fPin && fValPin && fDots) {
    const PIN_ANA = '4821', CLAVE_PEDRO = 'clave-solo-de-prueba-admin';   // valores SOLO de prueba
    const correr = async (pasos) => {
      const clases = {};
      const el = id => ({ id, value: '', textContent: '', style: {}, innerHTML: '', focus() {}, appendChild() {},
        classList: { add: c => { (clases[id] = clases[id] || {})[c] = true; }, remove: c => { if (clases[id]) delete clases[id][c]; },
          contains: c => !!(clases[id] && clases[id][c]), toggle() {} } });
      const els = {};
      const document = { getElementById: id => els[id] || (els[id] = el(id)), createElement: () => el('x') };
      const go = id => { ['s-pin', 's-usuarios'].forEach(s => document.getElementById(s).classList.remove('active')); document.getElementById(id).classList.add('active'); };
      const cola = [];
      const intentos = [], entradas = [];
      const estado = { usuario: null, cargo: null };
      let api;
      const auth = { currentUser: null, onAuthStateChanged() {},
        signInWithEmailAndPassword(correo, clave) {
          intentos.push(correo);
          const ok = (correo === api.correo('u_ana') && clave === api.clavePin(PIN_ANA)) || (correo === api.correo('u_pedro') && clave === CLAVE_PEDRO);
          return ok ? Promise.resolve({ user: { uid: correo } }) : Promise.reject(Object.assign(new Error('x'), { code: 'auth/invalid-credential' }));
        } };
      const mem = {};
      api = new Function('window', 'localStorage', 'toast', '_pedirTexto', 'estado', 'document', 'loginExitoso', 'go', 'setTimeout',
        'clearTimeout', '_ocultoTecnico', '_colorPorNombre', '_crearUsuarioItem',
        mTimeout[0].replace(/setTimeout/g, '__realSetTimeout').replace(/clearTimeout/g, '__realClearTimeout') + '\n' +
        'var __realSetTimeout = globalThis.setTimeout, __realClearTimeout = globalThis.clearTimeout;\n' +
        src.slice(i0, i1) + '\nlet _entrando = false;\n' + fRender + '\n' + fSel + '\n' + fPin + '\n' + fValPin + '\n' + fDots +
        '\nreturn { render: _renderListaUsuarios, elegir: seleccionarUsuario, tecla: pinInput, correo: _correoDeCuenta, clavePin: _claveFirebaseDePin };')(
        { firebase: { auth: () => auth } },
        { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } },
        () => {}, async () => null, estado, document, () => entradas.push(estado.usuario + '|' + estado.cargo), go,
        (fn) => { cola.push(fn); return cola.length; }, id => { if (id) cola[id - 1] = null; }, () => false, () => '#000', () => el('item'));
      api.render([
        { _id: 'u_ana', nombre: 'Ana Prueba', cargo: 'Tecnico en terreno', letra: 'A' },
        { _id: 'u_pedro', nombre: 'Pedro Prueba', cargo: 'Administrador', letra: 'P' }
      ]);
      go('s-usuarios');
      pasos(api);
      cola.splice(0).forEach(f => { if (f) f(); });          // vence todo lo agendado
      for (let t = 0; t < 60 && !entradas.length; t++) await new Promise(r => setTimeout(r, 50));   // PBKDF2 tarda
      return { entradas, aPedro: intentos.filter(c => c === api.correo('u_pedro')).length };
    };
    const ataque = await correr(api => { api.elegir('Ana Prueba', 'Tecnico en terreno', 'A'); '5555'.split('').forEach(api.tecla); api.elegir('Pedro Prueba', 'Administrador', 'P'); });
    const porPin = await correr(api => { api.elegir('Pedro Prueba', 'Administrador', 'P'); '5555'.split('').forEach(api.tecla); });
    const control = await correr(api => { api.elegir('Ana Prueba', 'Tecnico en terreno', 'A'); PIN_ANA.split('').forEach(api.tecla); });
    const comoAdmin = r => r.entradas.some(x => /\|Administrador$/.test(x));
    console.log('6) Carrera     → cambiar a Pedro en los 200 ms: ' + (comoAdmin(ataque) || ataque.entradas.length ? 'ENTRA ✗' : 'no entra ✓') +
      (ataque.aPedro ? ' (pero le pregunto a Firebase por Pedro con un PIN ✗)' : ' (ni le pregunta a Firebase ✓)') +
      '; Pedro por PIN: ' + (comoAdmin(porPin) || porPin.aPedro ? 'LO INTENTA ✗' : 'no ✓') +
      '; control (Ana con su PIN): ' + (control.entradas.join() === 'Ana Prueba|Tecnico en terreno' ? 'entra ✓' : 'NO ENTRA ✗'));
    chequear(!comoAdmin(ataque) && ataque.entradas.length === 0, 'eligiendo a un Administrador en los 200 ms se entra (como el o como el anterior)');
    chequear(ataque.aPedro === 0, 'la validacion pendiente le pregunto a Firebase por el Administrador con un PIN: la guardia no corto');
    chequear(!comoAdmin(porPin) && porPin.aPedro === 0, 'un Administrador intenta entrar con un PIN en vez de su contraseña');
    chequear(control.entradas.join() === 'Ana Prueba|Tecnico en terreno', 'LINEA DE CONTROL: un tecnico con su PIN no entra: la prueba no mide nada');
  } else {
    chequear(false, 'no se encontraron las funciones del login para probar la carrera de los 200 ms');
  }

  console.log('');
  if (fallos.length) { console.log('FALLA (' + fallos.length + '):'); fallos.forEach(f => console.log(f)); process.exit(1); }
  console.log('OK — sin clave por defecto: el secreto lo verifica Firebase y el telefono no lo guarda.');
})().catch(e => { console.error('FALLA — la prueba se cayo:', e && e.message); process.exit(1); });
