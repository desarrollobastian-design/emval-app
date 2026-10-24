# tests/reglas — Firebase Auth contra el emulador

Aquí vive lo que necesita el emulador de Firebase:
- las reglas de Firestore de la **etapa 2** (`firestore.rules`);
- la **transición** que habilita la etapa 1 (`transicion-etapa1.rules`, el paso 1b de Bastián);
- las pruebas de las dos herramientas de `tools/`: `cuentas-auth.js` y `estado-telefonos.js`.

Nada de esto toca producción. El proyecto `demo-emval` solo existe en el emulador, y las herramientas
se niegan a correr con un modo emulador a medias. Pages no publica `tests/`.

> ⛔ **`firestore.rules` NO está publicado.** Se publica solo cuando `node tools/estado-telefonos.js`
> diga que todos los teléfonos activos están LISTOS: versión con Auth, sesión de Firebase y todas sus
> colas en 0, según su propio reporte y con su propia fecha. Si se publica antes, el trabajo que quedó
> en un teléfono viejo no puede subir. Lo publica Bastián: consola de Firebase → Firestore Database →
> Reglas → pegar el archivo → Publicar.
>
> 🔑 **Antes de fusionar el PR de la etapa 1, Bastián hace el paso 1b: los dos cambios de
> `transicion-etapa1.rules`, juntos, sobre las reglas de HOY** (decidido por él el 23-10-2026):
> 1. **Agregar** el bloque `directorio`: se lee sin sesión y no lo escribe nadie. Sin eso, un teléfono sin
>    caché no tiene lista de entrada.
> 2. **Cambiar** la regla general: sacar `tecnicos` de las listas de crear, modificar y borrar. La
>    lectura sigue abierta.
> - **Costo aceptado:** en un teléfono con la versión vieja (v72 o menos), Pedro ya no puede agregar,
>   editar ni eliminar técnicos, ni cambiar su clave desde el panel. La versión nueva ya no los escribe.
> - El archivo es una reconstrucción para probar: los cambios se hacen sobre las reglas reales. La guía
>   clic a clic está en el diseño (`progress/2026-10-22_2100_chat-proyecto_emval-auth-diseno.md`).

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
| Reglas de la etapa 2 (76 casos, con los ataques de las dos revisiones de Codex) | `npm run reglas` | `OK`, exit 0 |
| **Contraprueba**: las mismas pruebas con las reglas de hoy (`capa1-referencia.rules`, reconstrucción) | `npm run reglas-capa1` | `FALLA`, exit 1 |
| Transición de la etapa 1, paso 1b (10 casos, con su contraprueba adentro) | `npm run transicion` | `OK`, exit 0 |
| Herramienta de cuentas (tramos 1 a 8, con 2b, 2c, 3b, 4b y 6a a 6c) | `npm run cuentas` | `OK`, exit 0 |
| Estado de los teléfonos (13 teléfonos, 7 tramos) | `npm run estado` | `OK`, exit 0 |

## Qué mide cada una
- **`reglas.test.js`**: cada rol puede justo lo que la app le pide y nada más.
  - Sin sesión: solo el directorio y un PDF por su id.
  - Una cuenta de Firebase sin ficha no es nadie.
  - **Nadie desfirma una hoja.** Un técnico no cambia el técnico ni el contenido de una hoja firmada:
    solo el enlace de su PDF y la fecha de subida, que es lo que reescribe la cola.
  - Un técnico solo marca una cotización «Realizada», con los campos que manda la app.
  - Revisión final de Codex (24-10-2026), por autoría y transición:
    - en una hoja firmada, un técnico **rellena** el PDF vacío; no lo reemplaza, no sube la generación y
      no toca la hoja que subió otra sesión (`subidoPor`);
    - `subidoPor` solo puede ser la sesión que escribe;
    - «Realizada» va una sola vez, sin cambiar el vínculo, y solo con una hoja firmada que declara esa
      cotización y que subió la sesión que escribe (o cuyo técnico es quien escribe).
  - `directorio` y `tecnicos` no los escribe nadie desde la app: solo el Admin SDK.
- **`transicion.test.js`** (paso 1b, 10 casos):
  - El directorio se lee sin sesión y nadie lo escribe.
  - La versión vieja de la app sigue funcionando: lee y crea órdenes, y lee `tecnicos` para entrar.
  - `tecnicos` no se crea, no se cambia ni se borra desde afuera, ni sin sesión ni con una cuenta.
  - Contraprueba: con las reglas de hoy, el directorio no se lee y `tecnicos` sí se escribe sin sesión.
    Con la transición anterior, que solo traía el bloque del directorio, fallan los 4 casos de `tecnicos`.
- **`cuentas-auth.test.js`**:
  - Simular no escribe.
  - El técnico nuevo entra con **su PIN de siempre**.
  - **Una cuenta que ya existe no se toca**: sigue deshabilitada si lo estaba, con sus datos y su clave.
  - Administrador y Supervisor solo se crean con `--autorizar <uid>`. El de la clave quemada, nunca.
  - La ficha queda solo con los campos permitidos. El respaldo nombra los campos que se quitaron y no
    guarda sus valores.
  - Código de salida 2 si alguien quedó pendiente (sin cuenta o sin ficha) o hay una ficha huérfana.
  - Revisión final de Codex (24-10-2026):
    - **2b:** una cuenta que ya existe no recibe en `directorio` el cargo de Administrador o Supervisor
      que dice `tecnicos` sin `--autorizar`; con `--autorizar`, sí;
    - **2c:** una cuenta existente con otro correo no se toca, no se le publica ficha, se informa sin
      imprimir su correo y sale con 2;
    - **3b:** las fichas de personas omitidas y las huérfanas también quedan solo con los campos
      permitidos; la huérfana se informa.
  - `--deshacer` (**6a a 6c**):
    - se niega con un respaldo de otro proyecto o de formato viejo;
    - revierte SOLO lo que esa corrida cambió (su diario) y no pisa lo que cambió después;
    - repetido después de que la herramienta vuelve a crear la cuenta, no la borra ni le pisa la ficha.
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
  - Revisión final de Codex (24-10-2026):
    - un reporte de formato viejo (solo `otsPendientes`) es VERSIÓN VIEJA;
    - `colas: {}`, o sin alguna de las seis, es REPORTE INCOMPLETO; ninguno da LISTO;
    - un teléfono con correos de hoy no queda OLVIDADO por tener viejo el reporte principal.
  - Con uno no listo dice «todavía NO» (exit 2); con todos listos da luz verde (exit 0).
  - Nunca escribe.

`firestore-debug.log` y `hs_err_pid*.log` los deja el emulador o Java; no se versionan.
