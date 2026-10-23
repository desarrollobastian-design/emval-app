# tests/reglas — Firebase Auth contra el emulador

Aquí viven las reglas de Firestore de la **etapa 2** de Firebase Auth y las pruebas que necesitan el
emulador de Firebase:
- las reglas (`firestore.rules`);
- las cuentas (`tools/cuentas-auth.js`);
- el estado de los teléfonos (`tools/estado-telefonos.js`).

Nada de esto toca producción. El proyecto `demo-emval` solo existe en el emulador. Pages no publica
`tests/`.

> ⛔ **`firestore.rules` NO está publicado.** Se publica solo cuando `node tools/estado-telefonos.js`
> diga que todos los teléfonos activos están LISTOS: versión con Auth, sesión de Firebase y nada en
> cola. Si se publica antes, el trabajo que quedó en un teléfono viejo no puede subir. Lo publica
> Bastián: consola de Firebase → Firestore Database → Reglas → pegar el archivo → Publicar.

## Requisitos (una vez)
- **Java 21** en el `PATH`. En este equipo está en `C:\Users\corex\Herramientas\jdk-21` (Temurin JRE,
  checksum de Adoptium verificado el 23-10-2026).
- **Las dependencias:**
  ```
  cd tests/reglas && npm install
  npm --prefix ../../tools install
  ```
  - `tests/reglas`: `firebase-tools@15.32.1`, `@firebase/rules-unit-testing@6.0.0` y `firebase@13.0.0`.
  - `tools`: `firebase-admin@14.4.0`.
  - `node_modules/` no se versiona.

## Correr (desde `tests/reglas`)
En Git Bash: `export PATH="/c/Users/corex/Herramientas/jdk-21/bin:$PATH"`. En PowerShell:
`$env:PATH = "C:\Users\corex\Herramientas\jdk-21\bin;" + $env:PATH`.

| Qué | Comando | Tiene que dar |
|---|---|---|
| Reglas por rol (49 casos) | `npm run reglas` | `OK`, exit 0 |
| **Contraprueba**: las mismas pruebas con las reglas de hoy (`capa1-referencia.rules`, reconstrucción) | `npm run reglas-capa1` | `FALLA`, exit 1 |
| Herramienta de cuentas | `npm run cuentas` | `OK`, exit 0 |
| Estado de los teléfonos | `npm run estado` | `OK`, exit 0 |

## Qué mide cada una
- **`reglas.test.js`**: cada rol puede justo lo que la app le pide y nada más.
  - Sin sesión: solo el directorio y un PDF por su id (el visor `?pdf=`).
  - Una cuenta de Firebase sin ficha en `directorio` no es nadie y no puede darse una ficha.
  - Un técnico desactivado no es nadie.
  - El técnico borra pausadas, no hojas firmadas.
  - `tecnicos`, `cadenas` y `directorio` los escribe solo el Administrador.
  - La matriz y el porqué de cada fila están en `progress/2026-10-22_2100_chat-proyecto_emval-auth-diseno.md` (D).
- **`cuentas-auth.test.js`**:
  - Simular no escribe.
  - Cada técnico entra con la clave que sale de **su PIN de siempre**.
  - El Administrador conserva **su clave**: se importa su hash, o la escribe él con `--clave-admin`.
  - El Administrador con la clave quemada y el técnico sin PIN no reciben cuenta.
  - No hay secretos en el directorio, el respaldo ni la salida.
  - Correrla dos veces no rompe nada.
  - 🔬 El emulador de Auth **no verifica hashes SHA-256 importados** (23-10-2026). Por eso aquí la
    autoprueba de la herramienta falla siempre y se prueba el camino seguro. En producción, la que
    decide es la autoprueba.
- **`estado-telefonos.test.js`**:
  - Asigna bien cada estado: LISTO, VERSIÓN VIEJA, SIN SESIÓN, CON COLA, SIN NOTICIAS y OLVIDADO.
  - Con uno no listo dice «todavía NO» (exit 2); con todos listos da luz verde (exit 0).
  - Nunca escribe.

`firestore-debug.log` lo deja el emulador y git lo ignora.
