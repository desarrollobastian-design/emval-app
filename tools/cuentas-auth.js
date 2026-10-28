/* Crea las cuentas de Firebase Authentication de EMVAL y el directorio publico — etapa 1 de Auth.

   QUE HACE. Lee `tecnicos` y, por cada persona:
     - Tecnico / Supervisor: crea o actualiza su cuenta con la clave que sale de SU PIN DE SIEMPRE
       (_claveFirebaseDePin, la misma funcion que usa la app). No se le cambia el PIN a nadie.
     - Administrador: importa su `passwordHash` (SHA-256 de su clave) para que siga entrando con LA
       MISMA clave. Antes hace una autoprueba con una cuenta desechable: si Firebase no acepta el
       formato, NO toca la cuenta del administrador y lo dice (ver mas abajo).
     - Escribe `directorio/{uid}` = { nombre, cargo, letra, correo, activo }: sin PIN ni hash. Solo
       la reescribe si cambia algo.
   El uid de cada cuenta es el id de su documento en `tecnicos`. No toca `tecnicos` ni nada mas.

   LO QUE NO HACE SOLA (revision final de Codex del PR #64, 24-10-2026):
     - No publica un cargo de Administrador o Supervisor tomado de `tecnicos` sin --autorizar <uid>,
       tampoco si la cuenta ya existe. Solo lo deja si la ficha ya tenia ese mismo cargo.
     - No toca una cuenta existente cuyo correo no es el que usa la app, ni le publica la ficha: lo
       informa y sale con 2.
     - Limpia de campos de mas TODAS las fichas de `directorio`, tambien las de personas omitidas y las
       huerfanas (sin documento en `tecnicos`). Las huerfanas se informan (exit 2).

   NUNCA imprime un PIN, una clave ni un hash. Tampoco los escribe en el respaldo.

   LA CLAVE QUEMADA. La clave temporal de administrador que estuvo en index.html hasta el PR #63 sigue
   en el historial publico. Esta herramienta la saca de ese historial al correr (git), compara su hash
   con el de cada Administrador y SE NIEGA a importar uno que coincida: esa cuenta se abriria con una
   clave publica. Si no puede hacer la comparacion, no importa ningun administrador.

   SOLO SIMULA POR DEFECTO: lista que haria y no escribe nada. Con --ejecutar respalda (cuentas y
   directorio de antes, sin secretos) en tools/respaldos/ y pide una confirmacion tecleada.

   Uso (PowerShell, desde la raiz del repo):
     npm --prefix tools install                               # una vez
     $env:EMVAL_SA = "C:\Users\corex\Secretos\emval-admin-sdk.json"
     node tools/cuentas-auth.js                               # simula
     node tools/cuentas-auth.js --ejecutar                    # escribe (pide confirmacion)
     node tools/cuentas-auth.js --ejecutar --autorizar <uid>  # Administrador/Supervisor: solo los
                                                              # uid que Bastian autoriza (ver simulacion)
     node tools/cuentas-auth.js --ejecutar --autorizar <uid> --clave-admin
                                                              # solo si la autoprueba fallo: el
                                                              # administrador escribe SU MISMA clave
     node tools/cuentas-auth.js --deshacer <respaldo.json>    # revierte esa corrida: solo lo que ESA
                                                              # corrida cambio, en el mismo proyecto, y
                                                              # nada que haya cambiado despues
   Una cuenta que YA existe no se toca (ni clave, ni datos, ni si esta deshabilitada). Sale con 2 si
   alguien quedo pendiente (sin cuenta o sin ficha) o hay una ficha huerfana; con 0 solo si todo quedo.
   Sin .json en disco (⬜ no probado en produccion): --adc con la sesion de gcloud de Bastian, ver
   tools/admin-sdk.js. Contra el emulador (pruebas): FIRESTORE_EMULATOR_HOST y
   FIREBASE_AUTH_EMULATOR_HOST, sin credencial.

   ⛔ Es PRODUCCION: lo ejecuta Bastian (Regla 4). La clave de la cuenta de servicio no va al repo. */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { execFileSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const PROYECTO = 'emval-app';
const DOMINIO_CORREO = 'emval-app.firebaseapp.com';
// Commit de main donde la clave quemada todavia estaba en index.html (antes del PR #63).
const COMMIT_CON_CLAVE_QUEMADA = 'bdeea89';

const args = process.argv.slice(2);
const EJECUTAR = args.includes('--ejecutar');
const CLAVE_ADMIN = args.includes('--clave-admin');
// Modo emulador solo si es completo (los dos hosts locales y un proyecto demo-): tools/admin-sdk.js.
const EMULADOR = require('./admin-sdk').revisarEmulador() === '';

// ── Las mismas reglas que la app (index.html). tests/la-clave-de-firebase-sale-del-pin.js vigila
//    que sigan siendo identicas: si difieren, nadie entra. ─────────────────────────────────────
function _claveFirebaseDePin(pin) { return 'emval-pin-' + String(pin); }
function _correoDeCuenta(uid) { return String(uid).toLowerCase() + '@' + DOMINIO_CORREO; }
const PIN_VALIDO = /^\d{4}$/;
const sha256hex = t => crypto.createHash('sha256').update(String(t)).digest('hex');

// Hash de la clave quemada, sacado del historial al correr. Nunca se imprime.
function hashDeLaClaveQuemada() {
  try {
    const viejo = execFileSync('git', ['show', COMMIT_CON_CLAVE_QUEMADA + ':index.html'],
      { cwd: RAIZ, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8');
    const lits = Array.from(new Set((viejo.match(/sha256\('([^']+)'\)/g) || []).map(m => m.slice(8, -2))));
    if (lits.length !== 1) return null;
    return sha256hex(lits[0]);
  } catch (e) { return null; }
}

function apiKeyWeb() {
  if (EMULADOR) return 'clave-emulador';
  const m = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8').match(/apiKey:\s*["']([^"']+)["']/);
  return m ? m[1] : null;
}
// Inicio de sesion por REST, como lo haria la app. Devuelve true/false; nunca imprime la clave.
async function puedeEntrar(correo, clave) {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const base = host ? 'http://' + host + '/identitytoolkit.googleapis.com' : 'https://identitytoolkit.googleapis.com';
  const r = await fetch(base + '/v1/accounts:signInWithPassword?key=' + encodeURIComponent(apiKeyWeb()), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: 'https://desarrollobastian-design.github.io/' },
    body: JSON.stringify({ email: correo, password: clave, returnSecureToken: true })
  });
  return r.ok;
}

function preguntar(texto, oculto) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (oculto) rl._writeToOutput = function(s) { if (s.startsWith(texto)) rl.output.write(texto); };
    rl.question(texto, r => { rl.close(); if (oculto) process.stdout.write('\n'); resolve(r); });
  });
}

// Banderas de la revision de Codex del PR #64 (23-10-2026).
//  --autorizar <uid[,uid]>  Administrador y Supervisor SOLO se crean si Bastian los autoriza por uid:
//                           `tecnicos` se pudo escribir sin sesion hasta las reglas nuevas, asi que un
//                           "Administrador" que aparezca ahi no es de fiar por si solo (Codex P1-5).
//  --deshacer <respaldo>    revierte lo que ESA corrida cambio (su diario), en el mismo proyecto y sin
//                           pisar lo que cambio despues (ver deshacer()).
function listaArg(nombre) {
  const out = [];
  args.forEach(function(a, i) { if (a === nombre && args[i + 1]) out.push.apply(out, args[i + 1].split(',')); });
  return out.map(function(s) { return s.trim(); }).filter(Boolean);
}
const AUTORIZADOS = listaArg('--autorizar');
const DESHACER = (function() { const i = args.indexOf('--deshacer'); return i >= 0 ? args[i + 1] : null; })();
const CAMPOS_FICHA = ['nombre', 'cargo', 'letra', 'correo', 'activo', 'actualizadoEn'];
function fichaPermitida(x) {
  const f = {};
  CAMPOS_FICHA.forEach(function(k) { if (x && x[k] !== undefined) f[k] = x[k]; });
  return f;
}
function esPrivilegiado(cargo) { return cargo === 'Administrador' || cargo === 'Supervisor'; }
// Cuenta de Firebase para el respaldo: todo lo que sirve para reconocerla y restaurarla, menos el
// hash y la sal de su clave (que no van a ningun archivo).
function cuentaParaRespaldo(u) {
  const j = typeof u.toJSON === 'function' ? u.toJSON() : Object.assign({}, u);
  delete j.passwordHash; delete j.passwordSalt;
  return j;
}

// Dos fichas son "la misma" si tienen los mismos campos permitidos con los mismos valores. `conFecha`
// compara tambien `actualizadoEn` (para saber si alguien la escribio despues de una corrida).
function canon(x, conFecha) {
  if (!x) return 'null';
  const f = fichaPermitida(x);
  if (!conFecha) delete f.actualizadoEn;
  return JSON.stringify(Object.keys(f).sort().map(function(k) { return [k, f[k]]; }));
}
const camposDeMas = x => Object.keys(x || {}).filter(k => CAMPOS_FICHA.indexOf(k) < 0);
// Lo que se puede cambiar de una cuenta despues de creada (sin secretos): --deshacer no borra una que
// cambio (revision de Codex, ronda 3: p. ej. alguien la deshabilito).
function estadoCuenta(u) {
  return JSON.stringify({ disabled: !!u.disabled, displayName: u.displayName || '', email: String(u.email || '').toLowerCase(),
    claims: u.customClaims || {} });
}

async function principal() {
  // Credencial: emulador, EMVAL_SA (cuenta de servicio) o --adc (gcloud de Bastian): tools/admin-sdk.js.
  const { db, auth, modo, proyecto } = require('./admin-sdk').iniciarAdmin(args);
  if (DESHACER) return deshacer(db, auth, modo, proyecto);

  console.log('cuentas-auth · ' + modo + ' · ' + (EJECUTAR ? 'EJECUTAR' : 'SIMULACION (no escribe)'));

  const snap = await db.collection('tecnicos').get();
  const fichas = {};
  (await db.collection('directorio').get()).docs.forEach(function(d) { fichas[d.id] = d.data() || {}; });
  const quemado = hashDeLaClaveQuemada();
  if (!quemado) console.log('⚠ No se pudo sacar la clave quemada del historial (' + COMMIT_CON_CLAVE_QUEMADA + '): no se importara ningun Administrador.');

  const plan = [];
  for (const d of snap.docs) {
    const t = d.data() || {};
    const uid = d.id, cargo = t.cargo || 'Tecnico en terreno', nombre = t.nombre || '';
    const p = { uid, nombre, cargo, letra: t.letra || (nombre.charAt(0) || '?').toUpperCase(), correo: _correoDeCuenta(uid) };
    const ficha = fichas[uid] || null;
    let usuario = null;
    try { usuario = await auth.getUser(uid); } catch (e) { if (e.code !== 'auth/user-not-found') throw e; }
    p.existe = !!usuario;
    p.deshabilitada = !!(usuario && usuario.disabled);
    const autorizado = AUTORIZADOS.indexOf(uid) >= 0;
    if (!nombre) { p.accion = 'omitir'; p.motivo = 'sin nombre'; }
    else if (usuario) {
      // Codex P1-4: una cuenta que ya existe NO se reimporta ni se actualiza ni se reactiva.
      if (String(usuario.email || '').toLowerCase() !== p.correo) {
        // Codex, revision final (nuevo 6): con otro correo, la app no podria entrar con esa ficha. La
        // cuenta no se cambia en silencio y la ficha no se publica. El correo real no se imprime.
        p.accion = 'omitir'; p.motivo = '⚠ la cuenta ya existe con OTRO correo: no se toca ni se publica su ficha; revisarla a mano';
      } else if (esPrivilegiado(cargo) && !autorizado && !(ficha && ficha.cargo === cargo)) {
        // Codex, revision final (P1 nuevo 1): conceder el cargo es lo que se autoriza, exista o no la
        // cuenta. Sin --autorizar, solo se deja un cargo privilegiado que la ficha YA tenia.
        p.accion = 'omitir'; p.motivo = cargo + ' en tecnicos: la cuenta existe, pero ese cargo no se publica sin --autorizar ' + uid;
      } else {
        p.accion = 'existe';
        p.motivo = 'la cuenta ya existe: no se toca' + (p.deshabilitada ? ' (deshabilitada: sigue deshabilitada)' : '');
      }
    }
    // La clave quemada se avisa SIEMPRE, este o no autorizado ese Administrador.
    else if (cargo === 'Administrador' && quemado && String(t.passwordHash || '').toLowerCase() === quemado) {
      p.accion = 'omitir'; p.motivo = '⚠ TIENE LA CLAVE QUEMADA: no se importa; hay que cambiarle la clave'; p.quemada = true;
    }
    else if (esPrivilegiado(cargo) && !autorizado) {
      p.accion = 'omitir'; p.motivo = cargo + ': falta autorizarlo con --autorizar ' + uid;
    }
    else if (cargo === 'Administrador') {
      const h = String(t.passwordHash || '').toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(h)) { p.accion = 'omitir'; p.motivo = 'Administrador sin clave en tecnicos: que CorexOn le active el acceso'; }
      else if (!quemado) { p.accion = 'omitir'; p.motivo = 'no se pudo comprobar la clave quemada'; }
      else { p.accion = 'importar-hash'; p.hash = h; }
    } else {
      const pin = String(t.pin == null ? '' : t.pin);
      if (!PIN_VALIDO.test(pin)) { p.accion = 'omitir'; p.motivo = 'sin PIN valido de 4 digitos'; }
      else { p.accion = 'crear'; p.pin = pin; }
    }
    plan.push(p);
  }
  const enTecnicos = new Set(plan.map(p => p.uid));
  const huerfanas = Object.keys(fichas).filter(id => !enTecnicos.has(id));

  console.log('');
  plan.forEach(p => console.log('  ' + (p.accion === 'omitir' ? '·' : '→') + ' ' + p.nombre.padEnd(22) + ' ' + p.cargo.padEnd(19) +
    ' ' + p.uid.padEnd(22) + ' ' + p.accion + (p.motivo ? ' (' + p.motivo + ')' : '')));
  huerfanas.forEach(id => console.log('  · ' + '(sin documento en tecnicos)'.padEnd(42) + ' ' + id.padEnd(22) + ' ficha HUERFANA en directorio: se limpia de campos de mas; revisar si se da de baja'));
  const omitidos = plan.filter(p => p.accion === 'omitir');
  const conCamposDeMas = Object.keys(fichas).filter(id => camposDeMas(fichas[id]).length);
  console.log('\n' + plan.length + ' personas en tecnicos · ' + plan.filter(p => p.accion === 'crear' || p.accion === 'importar-hash').length +
    ' cuentas nuevas · ' + plan.filter(p => p.accion === 'existe').length + ' ya existen · ' + omitidos.length + ' pendientes (sin cuenta o sin ficha)' +
    (huerfanas.length ? ' · ' + huerfanas.length + ' fichas huerfanas' : '') +
    (conCamposDeMas.length ? ' · ' + conCamposDeMas.length + ' fichas con campos de mas (se limpian)' : ''));
  if (plan.some(p => p.quemada)) console.log('⚠ Hay un Administrador con la clave quemada en tecnicos: avisar a Bastian antes de seguir.');

  // Codex P2-9: el codigo de salida dice si quedo algo pendiente (2) o si todo quedo (0).
  if (!EJECUTAR) {
    const pend = omitidos.length + huerfanas.length;
    console.log('\nSimulacion: no se escribio nada. Para escribir: --ejecutar' + (pend ? ' · ⚠ ' + pend + ' pendientes (exit 2)' : ''));
    process.exit(pend ? 2 : 0);
  }

  // ── Respaldo (sin secretos) y DIARIO de cada cambio de esta corrida, con su antes y su despues ──
  // --deshacer usa SOLO el diario: revierte lo que esta corrida cambio y nada mas (Codex, revision final).
  // Formato 3 (revisor, ronda 4): el diario guarda el estado de cada cuenta creada. Un respaldo de
  // formato 2 no lo trae y --deshacer lo rechaza: no adivina.
  const resp = { formato: 3, creado: new Date().toISOString(), proyecto: proyecto, modo: modo,
    cuentas: [], directorio: [], diario: [] };
  for (const p of plan) {
    try { resp.cuentas.push(cuentaParaRespaldo(await auth.getUser(p.uid))); } catch (e) {}
  }
  Object.keys(fichas).forEach(function(id) {
    const quitados = camposDeMas(fichas[id]);
    resp.directorio.push(Object.assign({ id: id }, fichaPermitida(fichas[id]), quitados.length ? { camposQuitados: quitados } : {}));
  });
  const dirResp = path.join(__dirname, 'respaldos');
  fs.mkdirSync(dirResp, { recursive: true });
  const archivo = path.join(dirResp, 'cuentas-auth-antes-' + resp.creado.replace(/[:.]/g, '-') + '.json');
  const anotar = () => fs.writeFileSync(archivo, JSON.stringify(resp, null, 2));
  anotar();
  console.log('\nRespaldo: ' + archivo + ' (' + resp.cuentas.length + ' cuentas, ' + resp.directorio.length + ' fichas).' +
    ' Para deshacer esta corrida: node tools/cuentas-auth.js --deshacer "' + archivo + '"');

  const confirmar = process.env.EMVAL_CONFIRMAR_CUENTAS || await preguntar('Escribe CREAR CUENTAS para seguir: ');
  if (confirmar.trim() !== 'CREAR CUENTAS') { console.log('Cancelado: no se escribio nada.'); process.exit(1); }

  // ── Autoprueba del formato de importacion (antes de tocar a un administrador) ──────────────
  // SOLO CON EL EMULADOR, la prueba puede forzar el camino de la importacion, que el emulador no deja
  // recorrer (no verifica hashes SHA-256): EMVAL_PRUEBA_IMPORTACION = 'autoprueba-ok' (la autoprueba
  // se da por buena) o 'rechazar' (ademas Firebase rechaza la importacion de la persona). En
  // produccion la variable se ignora (EMULADOR exige hosts locales y un proyecto demo-).
  const PRUEBA_IMPORT = EMULADOR ? (process.env.EMVAL_PRUEBA_IMPORTACION || '') : '';
  let importOk = false;
  if (plan.some(p => p.accion === 'importar-hash')) {
    if (PRUEBA_IMPORT) importOk = true;
    else {
      const uidPrueba = 'autoprueba-sha256-' + crypto.randomBytes(6).toString('hex');
      const clavePrueba = crypto.randomBytes(18).toString('base64url');
      try {
        const r = await auth.importUsers([{ uid: uidPrueba, email: _correoDeCuenta(uidPrueba),
          passwordHash: Buffer.from(sha256hex(clavePrueba), 'hex') }], { hash: { algorithm: 'SHA256', rounds: 1 } });
        importOk = r.failureCount === 0 && await puedeEntrar(_correoDeCuenta(uidPrueba), clavePrueba);
      } catch (e) { importOk = false; }
      try { await auth.deleteUser(uidPrueba); } catch (e) {}
    }
    console.log('Autoprueba de importacion SHA-256: ' + (importOk ? 'OK, Firebase acepta el hash tal cual' : 'FALLO') +
      (PRUEBA_IMPORT ? ' (forzada por la prueba, emulador)' : ''));
  }

  // Anota en el diario la cuenta que esta corrida acaba de crear: --deshacer la borra solo si sigue
  // siendo ESA (mismo creationTime y correo), no una que se haya vuelto a crear despues.
  async function anotarCuentaCreada(p) {
    let creada = null, estado = null;
    try { const u = await auth.getUser(p.uid); creada = u.metadata.creationTime; estado = estadoCuenta(u); } catch (e) {}
    resp.diario.push({ tipo: 'cuenta', uid: p.uid, email: p.correo, creada: creada, estado: estado }); anotar();
  }
  // Escribe una ficha solo si cambia, y deja en el diario su antes (campos permitidos) y su despues.
  const escritas = new Set();
  async function escribirFicha(id, nueva) {
    const actual = fichas[id] || null;
    escritas.add(id);
    if (actual && canon(actual) === canon(nueva) && !camposDeMas(actual).length) return false;
    const despues = Object.assign({}, nueva, { actualizadoEn: new Date().toISOString() });
    await db.collection('directorio').doc(id).set(despues);
    const quitados = camposDeMas(actual);
    resp.diario.push(Object.assign({ tipo: 'ficha', id: id, antes: actual ? fichaPermitida(actual) : null, despues: despues },
      quitados.length ? { camposQuitados: quitados } : {}));
    anotar();
    return true;
  }

  const hechos = [];
  let pendientes = omitidos.length;
  for (const p of plan) {
    if (p.accion === 'omitir') continue;
    try {
      if (p.accion === 'importar-hash') {
        if (importOk) {
          const r = PRUEBA_IMPORT === 'rechazar' ? { failureCount: 1 }
            : await auth.importUsers([{ uid: p.uid, email: p.correo, displayName: p.nombre,
              passwordHash: Buffer.from(p.hash, 'hex') }], { hash: { algorithm: 'SHA256', rounds: 1 } });
          // Revisor del PR #64 (punto 1): un rechazo deja a esa persona SIN cuenta y se cuenta (exit 2).
          if (r.failureCount) { console.log('  ✗ ' + p.nombre + ': Firebase rechazo la importacion. NO tiene cuenta.'); pendientes++; continue; }
        } else if (CLAVE_ADMIN) {
          // La escribe el propio administrador; se comprueba contra SU hash y no se guarda en ningun lado.
          // Solo contra el EMULADOR la prueba puede pasarla por variable; en produccion se teclea siempre.
          const clave = (EMULADOR && process.env.EMVAL_CLAVE_ADMIN_PRUEBA) || await preguntar('Clave de ' + p.nombre + ' (la misma de siempre, no se muestra): ', true);
          if (sha256hex(clave) !== p.hash) { console.log('  ✗ ' + p.nombre + ': esa no es su clave. No se creo su cuenta.'); pendientes++; continue; }
          await auth.createUser({ uid: p.uid, email: p.correo, password: clave, displayName: p.nombre });
        } else {
          console.log('  ⛔ ' + p.nombre + ': no se pudo conservar su clave importando el hash. NO se creo su cuenta.' +
            ' Alternativa: --clave-admin (la escribe el mismo administrador) o parar y preguntar.');
          pendientes++;
          continue;
        }
        await anotarCuentaCreada(p);
      } else if (p.accion === 'crear') {
        await auth.createUser({ uid: p.uid, email: p.correo, password: _claveFirebaseDePin(p.pin), displayName: p.nombre });
        await anotarCuentaCreada(p);
      }
      // Ficha con SOLO los campos permitidos (sin merge: lo que sobre en una ficha vieja se va; Codex
      // P2-8). `activo` se respeta si ya estaba; si no, sale de la cuenta (deshabilitada = inactiva).
      const previo = fichas[p.uid];
      const activoPrevio = previo && typeof previo.activo === 'boolean' ? previo.activo : null;
      const cambio = await escribirFicha(p.uid, { nombre: p.nombre, cargo: p.cargo, letra: p.letra, correo: p.correo,
        activo: activoPrevio !== null ? activoPrevio : !p.deshabilitada });
      hechos.push(p.nombre);
      console.log('  ✓ ' + p.nombre + ' (' + p.cargo + ')' + (p.accion === 'existe' ? ' — cuenta existente, sin tocar' : '') +
        (cambio ? '' : ' — ficha al dia'));
    } catch (e) {
      pendientes++;
      console.log('  ✗ ' + p.nombre + ': fallo (' + (e && (e.code || e.message)) + ')');
    }
  }
  // Codex P2-8 (revision final): las fichas que esta corrida no escribio —de personas omitidas o
  // huerfanas— tambien quedan SOLO con los campos permitidos. Sus demas valores no cambian.
  let limpiadas = 0;
  for (const id of Object.keys(fichas)) {
    if (escritas.has(id) || !camposDeMas(fichas[id]).length) continue;
    try {
      await escribirFicha(id, fichaPermitida(fichas[id]));
      limpiadas++;
    } catch (e) { pendientes++; console.log('  ✗ ficha ' + id + ': no se pudo limpiar (' + (e && (e.code || e.message)) + ')'); }
  }
  if (limpiadas) console.log('  ✓ ' + limpiadas + ' fichas de personas omitidas o huerfanas: limpiadas de campos de mas');
  pendientes += huerfanas.length;
  console.log('\nListo: ' + hechos.length + ' con cuenta y ficha.' + (pendientes ? ' ⚠ ' + pendientes + ' PENDIENTES (sin cuenta, sin ficha o huerfanas): ver arriba (exit 2).' : '') +
    ' Siguiente: probar la entrada en la app antes de fusionar el PR.');
  process.exit(pendientes ? 2 : 0);   // 2 = termino, pero algo quedo pendiente
}

// Deshace una corrida con su respaldo (Codex, revision final del PR #64):
//  - solo un respaldo de formato 3 (diario con el estado de cada cuenta) y del MISMO proyecto al que esta
//    conectada; uno de otro formato se rechaza explicitamente;
//  - revierte cada cambio del diario solo si sigue como lo dejo esa corrida; si cambio despues, NO lo
//    pisa: lo informa y sale con 2;
//  - por persona, ficha y cuenta se deciden JUNTAS: si cualquiera cambio despues (la cuenta se volvio a
//    crear, se deshabilito, cambio de nombre o marcas), no se toca ninguna de las dos;
//  - correrlo otra vez no vuelve a aplicar nada: lo ya deshecho se reconoce y se deja.
async function deshacer(db, auth, modo, proyecto) {
  const r = JSON.parse(fs.readFileSync(path.resolve(DESHACER), 'utf8'));
  console.log('cuentas-auth · ' + modo + ' · DESHACER ' + DESHACER);
  if (r.formato !== 3 || !Array.isArray(r.diario)) {
    console.log('⛔ Respaldo de ' + (r.formato ? 'formato ' + r.formato + ', de una version anterior de esta herramienta' : 'formato viejo, sin diario') +
      ': no se deshace solo (no trae lo que hace falta para no pisar cambios). Revisarlo a mano. No se cambio nada.');
    process.exit(2);
  }
  if (r.proyecto !== proyecto) {
    console.log('⛔ El respaldo es del proyecto «' + r.proyecto + '» y esta conexion es a «' + proyecto + '». No se cambio nada.');
    process.exit(2);
  }
  console.log('  cambios en el diario de esa corrida: ' + r.diario.length + ' (' +
    r.diario.filter(e => e.tipo === 'cuenta').length + ' cuentas creadas, ' + r.diario.filter(e => e.tipo === 'ficha').length + ' fichas escritas)');
  const confirmar = process.env.EMVAL_CONFIRMAR_CUENTAS || await preguntar('Escribe DESHACER para seguir: ');
  if (confirmar.trim() !== 'DESHACER') { console.log('Cancelado: no se cambio nada.'); process.exit(1); }
  let deshechos = 0, yaEstaban = 0, fallas = 0;
  const conflictos = [];
  // Por PERSONA: su ficha y su cuenta se miran juntas ANTES de tocar nada, y se decide para las dos
  // (revision de Codex, ronda 4): si cualquiera cambio despues, no se toca ninguna. Antes la ficha se
  // borraba y recien despues se veia que la cuenta habia cambiado: quedaba una cuenta sin ficha, y esa
  // persona sin entrada en la app.
  const porId = {};
  r.diario.forEach(function(e) {
    const id = e.tipo === 'ficha' ? e.id : e.uid;
    (porId[id] = porId[id] || {})[e.tipo] = e;
  });
  for (const id of Object.keys(porId)) {
    const ef = porId[id].ficha, ec = porId[id].cuenta;
    try {
      let revertirFicha = false, borrarCuenta = false, conflicto = '';
      const ref = db.collection('directorio').doc(id);
      if (ef) {
        const s = await ref.get();
        const actual = s.exists ? (s.data() || {}) : null;
        if (canon(actual, true) === canon(ef.antes, true) && !camposDeMas(actual).length) yaEstaban++;
        else if (canon(actual, true) !== canon(ef.despues, true) || camposDeMas(actual).length) conflicto = 'su ficha cambio despues de esa corrida';
        else revertirFicha = true;
      }
      if (ec) {
        let u = null;
        try { u = await auth.getUser(ec.uid); } catch (x) { if (x.code !== 'auth/user-not-found') throw x; }
        if (!u) yaEstaban++;
        else if (!ec.creada || u.metadata.creationTime !== ec.creada || String(u.email || '').toLowerCase() !== ec.email) conflicto = conflicto || 'su cuenta no es la que creo esa corrida (se volvio a crear)';
        else if (!ec.estado || estadoCuenta(u) !== ec.estado) conflicto = conflicto || 'su cuenta cambio despues de esa corrida (p. ej., se deshabilito o cambio el nombre)';
        else borrarCuenta = true;
      }
      if (conflicto) { conflictos.push(id + ': ' + conflicto + ': no se toca ni la ficha ni la cuenta'); continue; }
      if (revertirFicha) { if (ef.antes) await ref.set(fichaPermitida(ef.antes)); else await ref.delete(); deshechos++; }
      if (borrarCuenta) { await auth.deleteUser(ec.uid); deshechos++; }
    } catch (x) { fallas++; console.log('  ✗ ' + id + ': fallo (' + (x && (x.code || x.message)) + ')'); }
  }
  conflictos.forEach(c => console.log('  ⚠ ' + c));
  console.log('Deshechos: ' + deshechos + ' · ya estaban deshechos: ' + yaEstaban + ' · cambiaron despues (no se tocan): ' + conflictos.length +
    (fallas ? ' · fallaron: ' + fallas : ''));
  console.log(conflictos.length || fallas ? '⚠ Quedo algo sin deshacer: ver arriba (exit 2).' : 'Listo: la corrida quedo deshecha.');
  process.exit(conflictos.length || fallas ? 2 : 0);
}

module.exports = { _claveFirebaseDePin, _correoDeCuenta, hashDeLaClaveQuemada, DOMINIO_CORREO, fichaPermitida, CAMPOS_FICHA };
if (require.main === module) principal().catch(e => { console.error('FALLA: ' + (e && (e.code || e.message))); process.exit(1); });
