# tests/reglas — Firebase Auth contra el emulador

Aquí vive lo que necesita el emulador de Firebase:
- las reglas de Firestore de la **etapa 2** (`firestore.rules`);
- la **transición** que habilita la etapa 1 (`transicion-etapa1*.rules`);
- las pruebas de las dos herramientas de `tools/`: `cuentas-auth.js` y `estado-telefonos.js`.

Nada de esto toca producción. El proyecto `demo-emval` solo existe en el emulador, y las herramientas
se niegan a correr con un modo emulador a medias. Pages no publica `tests/`.

> ⛔ **`firestore.rules` NO está publicado.** Se publica solo cuando `node tools/estado-telefonos.js`
> diga que todos los teléfonos activos están LISTOS: versión con Auth, sesión de Firebase y todas sus
> colas en 0, según su propio reporte y con su propia fecha. Si se publica antes, el trabajo que quedó
> en un teléfono viejo no puede subir. Lo publica Bastián: consola de Firebase → Firestore Database →
> Reglas → pegar el archivo → Publicar.
>
> 🔑 **Antes de fusionar el PR de la etapa 1, Bastián agrega a las reglas de HOY el bloque (1) de
> `transicion-etapa1.rules`:** `directorio` se lee sin sesión y no lo escribe nadie. Sin eso, un teléfono
> sin caché no tiene lista de entrada.
> - Es agregar un bloque, no reemplazar las reglas.
> - El cambio (2) de `transicion-etapa1-recomendada.rules`, que cierra la escritura de `tecnicos`, es
>   opcional y lo decide él. El archivo explica el costo.

## Requisitos (una vez)
- **Java 21** en el `PATH`. En este equipo está en `C:\Users\corex\Herramientas\jdk-21` (Temurin JRE,
  checksum de Adoptium verificado el 23-10-2026). Con poca memoria libre en el equipo, Java no arranca
  («insufficient memory»). Se corre con `JAVA_TOOL_OPTIONS="-Xmx384m -Xms32m -XX:+UseSerialGC"`.
- **Las dependencias:**
  ```
  cd tests/reglas && npm ci
  npm --prefix ../../tools install
  ```
  - `tests/reglas`: `firebase-tools@15.32.1`, `@firebase/rules-unit-testing@6.0.0` y `firebase@13.0.0`.
    `npm ci` instala exactamente lo del lock y no lo cambia.
  - Para regenerar el lock: `rm -rf node_modules package-lock.json && npm install && npm prune`.
    🔬 Con npm 11.6.2, `npm install` solo deja un `google-logging-utils` marcado `extraneous`, y
    `npm prune` lo saca (23-10-2026, observación del revisor del PR #64).
  - `tools`: `firebase-admin@14.4.0`.

## Correr (desde `tests/reglas`)
En Git Bash: `export PATH="/c/Users/corex/Herramientas/jdk-21/bin:$PATH"`. En PowerShell:
`$env:PATH = "C:\Users\corex\Herramientas\jdk-21\bin;" + $env:PATH`.

| Qué | Comando | Tiene que dar |
|---|---|---|
| Reglas de la etapa 2 (63 casos, con los ataques de la revisión de Codex) | `npm run reglas` | `OK`, exit 0 |
| **Contraprueba**: las mismas pruebas con las reglas de hoy (`capa1-referencia.rules`, reconstrucción) | `npm run reglas-capa1` | `FALLA`, exit 1 |
| Transición de la etapa 1 (con su contraprueba adentro) | `npm run transicion` | `OK`, exit 0 |
| Herramienta de cuentas (8 tramos y el 4b) | `npm run cuentas` | `OK`, exit 0 |
| Estado de los teléfonos (6 tramos) | `npm run estado` | `OK`, exit 0 |

## Qué mide cada una
- **`reglas.test.js`**: cada rol puede justo lo que la app le pide y nada más.
  - Sin sesión: solo el directorio y un PDF por su id.
  - Una cuenta de Firebase sin ficha no es nadie.
  - **Nadie desfirma una hoja.** Un técnico no cambia el técnico ni el contenido de una hoja firmada:
    solo el enlace de su PDF y la fecha de subida, que es lo que reescribe la cola.
  - Un técnico solo marca una cotización «Realizada», con los campos que manda la app.
  - `directorio` y `tecnicos` no los escribe nadie desde la app: solo el Admin SDK.
- **`transicion.test.js`**:
  - Con la transición, el directorio se lee sin sesión y nadie lo escribe.
  - La versión vieja de la app sigue funcionando.
  - La recomendada además niega crear o cambiar `tecnicos` sin sesión.
  - Contraprueba: con las reglas de hoy, el directorio no se lee.
- **`cuentas-auth.test.js`**:
  - Simular no escribe.
  - El técnico nuevo entra con **su PIN de siempre**.
  - **Una cuenta que ya existe no se toca**: sigue deshabilitada si lo estaba, con sus datos y su clave.
  - Administrador y Supervisor solo se crean con `--autorizar <uid>`. El de la clave quemada, nunca.
  - La ficha queda solo con los campos permitidos. El respaldo nombra los campos que se quitaron y no
    guarda sus valores.
  - Código de salida 2 si alguien quedó sin cuenta.
  - `--deshacer` revierte una corrida.
  - Con un modo emulador a medias, la herramienta se detiene.
  - 🔬 El emulador de Auth **no verifica hashes SHA-256 importados**. Por eso aquí se prueba
    `--clave-admin`; en producción decide la autoprueba.
  - El camino de la **importación** se recorre forzándolo con `EMVAL_PRUEBA_IMPORTACION`
    (`autoprueba-ok` o `rechazar`), que **solo vale con el emulador**: contra un proyecto real la
    herramienta lo ignora. Tramo 4b:
    - si Firebase rechaza la importación, esa persona cuenta como «sin cuenta», no le queda ni cuenta ni
      ficha y la herramienta sale con 2;
    - si la acepta, crea la cuenta;
    - una segunda corrida no la reimporta.
- **`estado-telefonos.test.js`**:
  - Asigna bien cada estado.
  - **Un reporte del teléfono de hace 10 días no se da por bueno aunque haya un reporte de correos de
    hoy** (el caso que reprodujo Codex).
  - Un reporte de correos reciente con pendientes suma cola.
  - Con uno no listo dice «todavía NO» (exit 2); con todos listos da luz verde (exit 0).
  - Nunca escribe.

`firestore-debug.log` y `hs_err_pid*.log` los deja el emulador o Java; no se versionan.
