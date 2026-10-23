/* Crea las cuentas de Firebase Authentication de EMVAL y el directorio publico — etapa 1 de Auth.

   QUE HACE. Lee `tecnicos` y, por cada persona:
     - Tecnico / Supervisor: crea o actualiza su cuenta con la clave que sale de SU PIN DE SIEMPRE
       (_claveFirebaseDePin, la misma funcion que usa la app). No se le cambia el PIN a nadie.
     - Administrador: importa su `passwordHash` (SHA-256 de su clave) para que siga entrando con LA
       MISMA clave. Antes hace una autoprueba con una cuenta desechable: si Firebase no acepta el
       formato, NO toca la cuenta del administrador y lo dice (ver mas abajo).
     - Escribe `directorio/{uid}` = { nombre, cargo, letra, correo, activo }: sin PIN ni hash.
   El uid de cada cuenta es el id de su documento en `tecnicos`. No toca `tecnicos` ni nada mas.

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
     node tools/cuentas-auth.js --ejecutar --clave-admin      # solo si la autoprueba fallo: el
                                                              # administrador escribe SU MISMA clave
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
const EMULADOR = !!(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);

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

async function principal() {
  // Credencial: emulador, EMVAL_SA (cuenta de servicio) o --adc (gcloud de Bastian): tools/admin-sdk.js.
  const { db, auth, modo } = require('./admin-sdk').iniciarAdmin(args);

  console.log('cuentas-auth · ' + modo + ' · ' + (EJECUTAR ? 'EJECUTAR' : 'SIMULACION (no escribe)'));

  const snap = await db.collection('tecnicos').get();
  const quemado = hashDeLaClaveQuemada();
  if (!quemado) console.log('⚠ No se pudo sacar la clave quemada del historial (' + COMMIT_CON_CLAVE_QUEMADA + '): no se importara ningun Administrador.');

  const plan = [];
  for (const d of snap.docs) {
    const t = d.data() || {};
    const uid = d.id, cargo = t.cargo || 'Tecnico en terreno', nombre = t.nombre || '';
    const p = { uid, nombre, cargo, letra: t.letra || (nombre.charAt(0) || '?').toUpperCase(), correo: _correoDeCuenta(uid) };
    let existe = false;
    try { await auth.getUser(uid); existe = true; } catch (e) { if (e.code !== 'auth/user-not-found') throw e; }
    p.existe = existe;
    if (!nombre) { p.accion = 'omitir'; p.motivo = 'sin nombre'; }
    else if (cargo === 'Administrador') {
      const h = String(t.passwordHash || '').toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(h)) { p.accion = 'omitir'; p.motivo = 'Administrador sin clave en tecnicos: que CorexOn le active el acceso'; }
      else if (!quemado) { p.accion = 'omitir'; p.motivo = 'no se pudo comprobar la clave quemada'; }
      else if (h === quemado) { p.accion = 'omitir'; p.motivo = '⚠ TIENE LA CLAVE QUEMADA: no se importa; hay que cambiarle la clave'; p.quemada = true; }
      else { p.accion = 'importar-hash'; p.hash = h; }
    } else {
      const pin = String(t.pin == null ? '' : t.pin);
      if (!PIN_VALIDO.test(pin)) { p.accion = 'omitir'; p.motivo = 'sin PIN valido de 4 digitos'; }
      else { p.accion = existe ? 'actualizar' : 'crear'; p.pin = pin; }
    }
    plan.push(p);
  }

  console.log('');
  plan.forEach(p => console.log('  ' + (p.accion === 'omitir' ? '·' : '→') + ' ' + p.nombre.padEnd(22) + ' ' + p.cargo.padEnd(19) +
    ' cuenta ' + (p.existe ? 'existe ' : 'nueva  ') + ' ' + p.accion + (p.motivo ? ' (' + p.motivo + ')' : '')));
  const conCuenta = plan.filter(p => p.accion !== 'omitir');
  console.log('\n' + plan.length + ' personas en tecnicos · ' + conCuenta.length + ' con cuenta · directorio: ' + conCuenta.length + ' fichas');
  if (plan.some(p => p.quemada)) console.log('⚠ Hay un Administrador con la clave quemada en tecnicos: avisar a Bastian antes de seguir.');

  if (!EJECUTAR) { console.log('\nSimulacion: no se escribio nada. Para escribir: --ejecutar'); process.exit(0); }

  // ── Respaldo de lo que se va a tocar (sin secretos) ────────────────────────────────────────
  const antes = { creado: new Date().toISOString(), proyecto: EMULADOR ? 'emulador' : PROYECTO, cuentas: [], directorio: [] };
  for (const p of plan) {
    try { const u = await auth.getUser(p.uid); antes.cuentas.push({ uid: u.uid, email: u.email, disabled: u.disabled, displayName: u.displayName || '' }); } catch (e) {}
  }
  (await db.collection('directorio').get()).docs.forEach(d => antes.directorio.push({ id: d.id, ...d.data() }));
  const dirResp = path.join(__dirname, 'respaldos');
  fs.mkdirSync(dirResp, { recursive: true });
  const archivo = path.join(dirResp, 'cuentas-auth-antes-' + antes.creado.replace(/[:.]/g, '-') + '.json');
  fs.writeFileSync(archivo, JSON.stringify(antes, null, 2));
  console.log('\nRespaldo: ' + archivo + ' (' + antes.cuentas.length + ' cuentas, ' + antes.directorio.length + ' fichas)');

  const confirmar = process.env.EMVAL_CONFIRMAR_CUENTAS || await preguntar('Escribe CREAR CUENTAS para seguir: ');
  if (confirmar.trim() !== 'CREAR CUENTAS') { console.log('Cancelado: no se escribio nada.'); process.exit(1); }

  // ── Autoprueba del formato de importacion (antes de tocar a un administrador) ──────────────
  let importOk = false;
  if (plan.some(p => p.accion === 'importar-hash')) {
    const uidPrueba = 'autoprueba-sha256-' + crypto.randomBytes(6).toString('hex');
    const clavePrueba = crypto.randomBytes(18).toString('base64url');
    try {
      const r = await auth.importUsers([{ uid: uidPrueba, email: _correoDeCuenta(uidPrueba),
        passwordHash: Buffer.from(sha256hex(clavePrueba), 'hex') }], { hash: { algorithm: 'SHA256', rounds: 1 } });
      importOk = r.failureCount === 0 && await puedeEntrar(_correoDeCuenta(uidPrueba), clavePrueba);
    } catch (e) { importOk = false; }
    try { await auth.deleteUser(uidPrueba); } catch (e) {}
    console.log('Autoprueba de importacion SHA-256: ' + (importOk ? 'OK, Firebase acepta el hash tal cual' : 'FALLO'));
  }

  const hechos = [];
  let pendientes = 0;
  for (const p of plan) {
    if (p.accion === 'omitir') continue;
    if (p.accion === 'importar-hash') {
      if (importOk) {
        const r = await auth.importUsers([{ uid: p.uid, email: p.correo, displayName: p.nombre,
          passwordHash: Buffer.from(p.hash, 'hex') }], { hash: { algorithm: 'SHA256', rounds: 1 } });
        if (r.failureCount) { console.log('  ✗ ' + p.nombre + ': Firebase rechazo la importacion'); continue; }
      } else if (CLAVE_ADMIN) {
        // La escribe el propio administrador; se comprueba contra SU hash y no se guarda en ningun lado.
        // Solo contra el EMULADOR la prueba puede pasarla por variable; en produccion se teclea siempre.
        const clave = (EMULADOR && process.env.EMVAL_CLAVE_ADMIN_PRUEBA) || await preguntar('Clave de ' + p.nombre + ' (la misma de siempre, no se muestra): ', true);
        if (sha256hex(clave) !== p.hash) { console.log('  ✗ ' + p.nombre + ': esa no es su clave. No se toco su cuenta.'); pendientes++; continue; }
        if (p.existe) await auth.updateUser(p.uid, { email: p.correo, password: clave, displayName: p.nombre, disabled: false });
        else await auth.createUser({ uid: p.uid, email: p.correo, password: clave, displayName: p.nombre });
      } else {
        console.log('  ⛔ ' + p.nombre + ': no se pudo conservar su clave importando el hash. NO se toco su cuenta.' +
          ' Alternativa: --clave-admin (la escribe el mismo administrador) o parar y preguntar.');
        pendientes++;
        continue;
      }
    } else if (p.accion === 'crear') {
      await auth.createUser({ uid: p.uid, email: p.correo, password: _claveFirebaseDePin(p.pin), displayName: p.nombre });
    } else {
      await auth.updateUser(p.uid, { email: p.correo, password: _claveFirebaseDePin(p.pin), displayName: p.nombre, disabled: false });
    }
    const ref = db.collection('directorio').doc(p.uid);
    const previo = await ref.get();
    await ref.set(Object.assign({ nombre: p.nombre, cargo: p.cargo, letra: p.letra, correo: p.correo,
      actualizadoEn: new Date().toISOString() }, previo.exists ? {} : { activo: true }), { merge: true });
    hechos.push(p.nombre);
    console.log('  ✓ ' + p.nombre + ' (' + p.cargo + ')');
  }
  console.log('\nListo: ' + hechos.length + ' cuentas y fichas.' + (pendientes ? ' ⚠ ' + pendientes + ' administrador(es) SIN cuenta: ver arriba.' : '') +
    ' Siguiente: probar la entrada en la app antes de fusionar el PR.');
  process.exit(pendientes ? 2 : 0);   // 2 = termino, pero dejo a alguien sin cuenta
}

module.exports = { _claveFirebaseDePin, _correoDeCuenta, hashDeLaClaveQuemada, DOMINIO_CORREO };
if (require.main === module) principal().catch(e => { console.error('FALLA: ' + (e && (e.code || e.message))); process.exit(1); });
