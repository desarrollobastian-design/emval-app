/* Conexion al Admin SDK de Firebase para las herramientas de tools/ (cuentas-auth, estado-telefonos).

   Tres modos, en este orden:
   1. EMULADOR: si existe FIRESTORE_EMULATOR_HOST o FIREBASE_AUTH_EMULATOR_HOST (pruebas de
      tests/reglas). Exige LAS DOS, locales, y un proyecto demo-... (ver revisarEmulador). No usa
      credenciales y nunca toca produccion.
   2. CUENTA DE SERVICIO: EMVAL_SA = ruta al .json descargado de la consola (paso 2 de Bastian). La
      clave se guarda en Bitwarden; la copia en disco se borra al terminar.
   3. CREDENCIALES DE BASTIAN (--adc o EMVAL_ADC=1), sin .json en disco: usa las "Application Default
      Credentials" de su propia sesion de gcloud. Una vez, en PowerShell:
        gcloud auth application-default login
        gcloud auth application-default set-quota-project emval-app
      ⬜ NO PROBADO contra produccion (23-10-2026: probarlo seria tocar Firebase de produccion). Si
      falla por permisos o cuota (Identity Toolkit pide el quota project), se vuelve al modo 2.
   Si no se da ninguno, la herramienta se detiene antes de conectarse a nada. */

const path = require('path');

const PROYECTO = 'emval-app';

// MODO EMULADOR, a prueba de mezclas (Codex P2-10, 23-10-2026). Basta UNA variable de emulador para
// entrar en este modo, pero para correr se exigen LAS DOS (Firestore y Auth), las dos apuntando a
// esta maquina, y un proyecto de pruebas (`demo-...`). Con una sola, el otro servicio iria al real.
// Devuelve null si no es modo emulador; un texto con el problema si es un modo emulador incompleto.
function revisarEmulador(env) {
  env = env || process.env;
  const fs = env.FIRESTORE_EMULATOR_HOST || '', au = env.FIREBASE_AUTH_EMULATOR_HOST || '';
  if (!fs && !au) return null;
  const local = h => /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(h);
  if (!fs || !au) return 'modo emulador incompleto: faltan ' + (!fs ? 'FIRESTORE_EMULATOR_HOST' : 'FIREBASE_AUTH_EMULATOR_HOST') + ' (el otro servicio iria a produccion)';
  if (!local(fs) || !local(au)) return 'modo emulador con un host que no es de esta maquina (' + (!local(fs) ? fs : au) + ')';
  const proyecto = env.GCLOUD_PROJECT || 'demo-emval';
  if (!/^demo-/.test(proyecto)) return 'modo emulador con un proyecto que no es de pruebas (' + proyecto + '): tiene que empezar con demo-';
  return '';
}

function iniciarAdmin(args) {
  const { initializeApp, cert, applicationDefault } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  const { getAuth } = require('firebase-admin/auth');
  const problema = revisarEmulador();
  if (problema) { console.error('Se detiene antes de conectarse: ' + problema + '. Ver tools/admin-sdk.js.'); process.exit(1); }
  const emulador = problema === '';
  const adc = (args || []).includes('--adc') || process.env.EMVAL_ADC === '1';
  let modo, proyecto = PROYECTO;
  if (emulador) {
    proyecto = process.env.GCLOUD_PROJECT || 'demo-emval';
    initializeApp({ projectId: proyecto });
    modo = 'EMULADOR';
  } else if (process.env.EMVAL_SA) {
    initializeApp({ credential: cert(require(path.resolve(process.env.EMVAL_SA))), projectId: PROYECTO });
    modo = 'PRODUCCION (' + PROYECTO + ', cuenta de servicio)';
  } else if (adc) {
    initializeApp({ credential: applicationDefault(), projectId: PROYECTO });
    modo = 'PRODUCCION (' + PROYECTO + ', credenciales de gcloud de quien la corre)';
  } else {
    console.error('Falta la credencial: EMVAL_SA (ruta al .json de la cuenta de servicio) o --adc ' +
      '(sesion de gcloud de Bastian). Ver la cabecera de tools/admin-sdk.js.');
    process.exit(1);
  }
  // `proyecto`: el proyecto al que de verdad se conecto (lo usa --deshacer para no aplicar un respaldo
  // de otro proyecto; Codex, revision final del PR #64).
  return { db: getFirestore(), auth: getAuth(), modo, emulador, PROYECTO, proyecto };
}

module.exports = { iniciarAdmin, revisarEmulador, PROYECTO };
