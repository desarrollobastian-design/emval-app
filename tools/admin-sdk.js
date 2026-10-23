/* Conexion al Admin SDK de Firebase para las herramientas de tools/ (cuentas-auth, estado-telefonos).

   Tres modos, en este orden:
   1. EMULADOR: si existen FIRESTORE_EMULATOR_HOST o FIREBASE_AUTH_EMULATOR_HOST (pruebas de
      tests/reglas). No usa credenciales y nunca toca produccion.
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

function iniciarAdmin(args) {
  const { initializeApp, cert, applicationDefault } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  const { getAuth } = require('firebase-admin/auth');
  const emulador = !!(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);
  const adc = (args || []).includes('--adc') || process.env.EMVAL_ADC === '1';
  let modo;
  if (emulador) {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-emval' });
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
  return { db: getFirestore(), auth: getAuth(), modo, emulador, PROYECTO };
}

module.exports = { iniciarAdmin, PROYECTO };
