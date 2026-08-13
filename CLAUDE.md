# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> 📚 **¿Vienes de Soporte (08) o no conoces el sistema?** Lee primero
> **[BRIEF-SISTEMA-PARA-SOPORTE.md](BRIEF-SISTEMA-PARA-SOPORTE.md)** — qué hace la app, quién la usa,
> dónde vive cada dato, qué documentos salen al cliente y qué bugs ya están cerrados. Este archivo es
> el detalle técnico; ese es el mapa.

## Project Overview

EMVAL is a Progressive Web App (PWA) for managing work orders (Órdenes de Trabajo) in Spanish. It's a single-page application built with vanilla HTML/CSS/JavaScript and Firebase.

**Key Technologies:**
- Firebase Firestore (database)
- Firebase Storage (image/photo storage)
- PWA (offline support via Service Worker)
- Cloudinary (image optimization/hosting)

## Architecture

### Single-File Structure

All code is in `index.html`. The file is organized as:

1. **HTML Structure** (head, meta tags, screens)
2. **CSS Styles** (custom properties, layout classes, component styles)
3. **JavaScript** (split into logical sections)

### State Management

Global state object `estado` tracks:
- User info (`usuario`, `cargo` = role)
- Current OT data (`otNumero`, `tipo`, `direccion`, `ceco`)
- Form data (`fotosAntes`, `fotosDespues`, `serviciosPreventivo`, etc.)
- UI state (`firmada` = signature confirmed)

### Screen Navigation

Screens are div elements with `class="screen"`. Navigation via `go(screenId)` function:
- `s-usuarios` — Login screen
- `s-solicitar` — Create new work order
- `s-ejecutar` — Execute/complete work order
- `s-admin` — Admin panel (cadenas, técnicos, locales, cotizaciones, preventivos)
- `s-supervisor` — Supervisor dashboard
- `s-tecnico` — Technician dashboard
- `s-planillas` — Planillas de cobranza (solo rol Administrador). Ver abajo.

### Data Flow

**Typical workflow for loading a screen:**

1. User navigates via `go(screenId)`
2. Screen's `cargar*` async function is called (e.g., `cargarAdmin()`)
3. Function queries Firestore collections
4. Results render into the screen's DOM
5. Event handlers attached to buttons for CRUD operations

**Collections in Firestore:**
- `cadenas` — Companies/chains (Unimarc, Entel, etc.)
- `tecnicos` — Technician accounts
- `locales` — Store locations
- `cotizaciones` — Quotations/estimates
- `preventivos` — Preventive maintenance orders
- `ordenes` — Work orders
- `usuarios` — App users
- `supervisores` — Supervisor accounts
- `facturacion` — Billing data
- `ventas` — Sales data
- `contadores` — Correlativos atómicos (`cot_<ddmmaa>` para el folio de cotización)

### Key Functions

**Navigation & Auth:**
- `go(screenId)` — Switch active screen
- `verificarPasswordAdmin()` — Admin login
- `cerrarSesion()` — Logout
- `seleccionarUsuario(nombre, cargo, letra)` — Login as technician/supervisor

**Screen Loaders (Firestore queries):**
- `cargarCadenasAdmin()` — Admin: manage companies
- `cargarTecnicosAdmin()` — Admin: manage technicians
- `cargarLocalesAdmin()` — Admin: manage store locations
- `cargarOTsTecnicos()` — Technician: list assigned work orders
- `cargarOTsSupervisor()` — Supervisor: oversee all work orders
- `cargarCarpetas()` — Load quotation folders
- `cargarEjecucionScreen()` — Load execution form with services

**Work Order Operations:**
- `nuevaOT()` — Initialize new work order
- `cerrarOT()` — Save completed order to Firestore
- `responderServicio(idx, respuesta)` — Mark service as done/no-apply
- `notificarSupervisor()` — Send notification to supervisor
- `enviarWhatsApp()` — Send WhatsApp message with order summary

**Planillas de cobranza** (`cargarPlanillas`, `_plDatos*`, `descargarExcelPlanilla`):
- Dos planillas distintas, **no una con filtro**: preventivos = matriz local × bimestre con monto
  calculado (`PL_TARIFA_TRANSPALETA` × `numEquipos`); correctivos = lista con el `total` de cada
  cotización + las columnas manuales `solped/oc/hes/factura` (mismo campo que usa *Facturar*).
- **Reglas que no se pueden relajar** (salen de los informes de Soporte del 01 y 02-ago-2026):
  `tipoCot === 'previa'` **no suma** y va en bloque aparte · se pasa `_dedupeOTs` antes de sumar
  (un local no se cobra dos veces) · `_plVisible` deja fuera las cuentas de prueba · un trabajo sin
  cotizar se lista **sin monto**, jamás con uno estimado.
- Una hoja es preventiva por `tipo` **o** por traer la pauta de 11 servicios: las que el bug del
  estado global guardó como `correctivo` son cobrables igual (`_plEsPreventiva`).
- Cada columna cubre su **bimestre completo** — una hoja de agosto pertenece al ciclo de julio.
- Cubierto por `tests/planillas-cobranza.js`.

**Cola de correos** (`_enviarCorreo`, `sincronizarCorreosPendientes`, `_clasificarErrorCorreo`):
- Todo aviso que no logra salir se **encola en el `localStorage` del dispositivo** y se reintenta.
  El invariante es que **el código nunca borra un aviso**: o se envía, o sigue pendiente, o queda
  `fallido` y visible. Vaciarla es una decisión humana (`purgarColaCorreos`, con respaldo previo).
- **Reintentar tiene costo**: cada intento gasta una request de la cuota de EmailJS (plan de
  **200 correos/mes**). Por eso hay **backoff exponencial por aviso** (1→60 min) y la cola **se
  detiene** si el error no es de red — un `429` de cuota o un `403` de credencial no se arreglan
  insistiendo. Ver el bloque de comentarios sobre el 03-08-2026 en `index.html`.
- 🔄 **Las cotizaciones y las hojas de trabajo SÍ pasan por la cola** desde el commit `9e7801f`
  (antes iban con `emailjs.send` directo y se perdían con un toast). Lo que sale directo hoy: nada
  de esos dos flujos. Comparten la cuenta con el resto: si la cola quema la cuota, mueren también.
- Lo que hay que escribir en la base **cuando el correo sale de verdad** viaja en `opts.post` y lo
  ejecuta `_ejecutarPostCorreo`, no el momento en que se apretó el botón. Si se agrega un dato
  nuevo al envío, va ahí — si no, sale desde la cola mañana y no queda registrado.
- El atasco se reporta a **Firestore (`alertas`)** y se ve en el panel de supervisor
  (`cargarAlertaCorreos`). Avisar por correo que el correo no sale no sirve.
- Cubierto por `tests/cola-correos-no-quema-cuota.js`.

**Comentario del administrador al enviar una cotización** (`_prepararComentarioCot`,
`_escaparHtmlCorreo`, `_procesarEnvioCotizaciones`):
- Campo de texto libre en el modal de envío. Va en el cuerpo del correo **arriba** de las
  cotizaciones y queda guardado en la cotización (`comentarioEnvio` + `comentarioEnvioEn`).
- **Se escapa siempre** aunque lo escriba el administrador: el texto viaja dentro del HTML del
  correo y un `<` sin escapar rompe el cuerpo en la bandeja del supervisor de SMU.
- El modal **es el mismo** que el de las hojas de trabajo (`_envioModo`), que NO llevan comentario:
  ahí el campo se oculta. Un campo visible que no viaja a ningún lado es peor que no tenerlo.
- El bloque HTML vive en la zona **CSS-EXPORTADO**: literales, nunca `var(--…)`.
- Cubierto por `tests/comentario-en-correo-cotizacion.js`.

**Compartir por WhatsApp / correo / lo que tenga el teléfono** (`compartirDocumentos`,
`compartirPDF`, `_esPDFCompartible`, `compartirCotizacion`, `compartirHoja`, `compartirOT`):
- Botón **Compartir** en cotizaciones, hojas de preventivo y OT terminadas. Usa la **Web Share
  API** (`navigator.share`): abre el menú del sistema con el **PDF adjunto de verdad**, no un link
  suelto. Pedido de Pedro el 12-08-2026.
- **Solo se comparte un PDF real.** `ot.pdfUrl` guarda el link a la **app** (`…/?pdf=<id>`), que a
  quien lo recibe por fuera le da 404 — caso #597587. `_esPDFCompartible()` lo rechaza, y donde no
  hay PDF **el botón no se dibuja**. Mismo invariante que `tests/link-pdf-es-compartible.js`.
- **Pasa por la misma regeneración que el correo** (`_asegurarPDFCotizacion` → `_pdfCotObsoleto`):
  compartir es una salida al cliente igual que el envío, y un PDF viejo es igual de malo por
  WhatsApp que por correo.
- ⚠️ **No toca EmailJS ni la cola: no gasta de los 200 correos/mes.** Si alguna vez hace falta que
  compartir mande un correo, va por `mailto:` (lo abre el cliente del equipo), nunca por EmailJS.
- **Sin monto en el texto, a propósito:** una cifra suelta en WhatsApp no dice si es neta o c/IVA.
  El texto identifica el documento; los números los pone el PDF.
- Degrada en orden: **archivo adjunto → enlace → menú propio** (`modal-compartir`, para PC de
  escritorio y para cuando iOS invalida el gesto tras bajar el PDF). Cerrar el menú (`AbortError`)
  no es un error y no muestra nada.
- Cubierto por `tests/compartir-manda-el-pdf.js`.

**Firma y timbre de EMVAL en la cotización** (`FIRMA_EMVAL`, `_dibujarFirmaEmval`,
`tools/embeber-firma-emval.js`):
- Toda cotización sale impresa con la firma y el timbre de EMVAL. Pedido de Pedro el 13-08-2026.
- ⚠️ **No confundir con el timbre que ya existía.** `estado.fotoTimbre` y `otData.firmaImagen` son
  del **RECEPTOR** — el local de SMU que recibe el trabajo, fotografiado y firmado en cada visita.
  Este es el de **EMVAL como emisor**: imagen fija, la misma siempre, y no la captura nadie.
- **Va en base64 dentro de `index.html`**, no como archivo aparte: el PDF se genera en el teléfono
  del técnico y muchas veces sin señal, así que algo que haya que ir a buscar por red saldría en
  blanco justo en terreno. 🔒 **Consecuencia: la firma es públicamente extraíble** del código
  fuente de la app. Es inevitable si el PDF debe funcionar offline, pero es decisión del cliente.
- **Se dibuja en dos generadores** (`generarPDFCotizacionGuardada` y `generarPDFCotizacion`).
  ⚠️ **La segunda no la llama nadie** — es un duplicado huérfano (verificado 13-08-2026: su única
  aparición en el archivo es su propia definición). Se firma igual para que, si alguien la
  reconecta, no reaparezca una cotización sin firma que nadie asocie a este cambio.
- **El alto lo calcula `_altoFirmaCot(totY)`, no es fijo.** La descripción del trabajo es texto
  libre y empuja la tabla hacia abajo: con 8+ líneas, una firma de alto fijo terminaría fuera de
  la A4 y **jsPDF no avisa — recorta en silencio**. La función topa la firma en los 281 mm y bajo
  8 mm devuelve 0 (mejor sin firma que una mancha ilegible). La nota de validez sigue a la firma
  (`totY + 8 + altoFirma`) y **sin firma vuelve a `totY + 30`**, el layout de siempre.
- **Medido con pdf.js sobre PDF reales** (13-08-2026): descripción normal → firma de 38 mm, nota
  en 274 mm; descripción larga → 38 mm, nota en 284; descripción extrema → la firma **se achica
  sola** a 28 mm y la nota queda en 289, con 8 mm de margen al borde. A los 23 mm iniciales el
  timbre no se alcanzaba a leer, y el pie de la hoja tenía 29-39 mm sin usar.
- **Nunca bota el PDF.** Sin imagen cargada no dibuja nada (la cotización sale como antes, sin un
  recuadro vacío que parezca error de impresión); si `addImage` falla, se emite igual sin firma.
- 🔴 **`addImage` va con alias y compresión `'FAST'` — no es opcional.** Sin eso jsPDF incrusta el
  PNG en crudo y la cotización pasa de **26 KB a 1,24 MB** (medido 13-08-2026). Ese PDF lo sube el
  técnico desde el teléfono y muchas veces con mala señal: con compresión queda en **102 KB**.
- Para cargar o reemplazar la imagen: `node tools/embeber-firma-emval.js <archivo.png>` (simula) y
  `--ejecutar` para escribir. Mide el archivo y guarda el `ratio` para no deformar la firma.
  Acepta PNG y JPEG; la limpia (recorte + fondo blanco) se hace aparte, ver abajo.
- **Cómo se preparó la imagen** (13-08-2026): la foto de WhatsApp venía 900×1600 con el papel de
  fondo, trazos ajenos arriba y un hueco grande entre firma y timbre — sin tratar habría salido a
  12,9 × 23 mm, ilegible. Se recortaron firma y timbre por separado, se juntaron con 45 px de
  separación (el bloque pasa a ser más ancho que alto, y eso lo agranda en el PDF) y se blanqueó
  el papel con umbral de luminancia **135** — medido, no adivinado: el papel estaba en 145-185 y
  la tinta bajo 110. Resultado: 580×526, ratio 1,1027.
- 🔒 **Los archivos fuente (`firma-emval.jpeg`, `firma-emval-limpia.png`) están en `.gitignore`.**
  La firma ya viaja pública dentro de `index.html` y eso es inevitable, pero un PNG suelto en el
  repo es una descarga directa. Viven en el disco de Bastián.
- Cubierto por `tests/cotizacion-lleva-firma-emval.js`.

**Pendientes y materiales — nota interna del técnico** (`pend-materiales`, `estado.pendientesMateriales`):
- Campo de texto libre **solo en preventivos**, debajo de "Observaciones". Lo escribe el técnico en
  terreno (*"faltaron 2 neumáticos"*) y lo lee **solo el rol Administrador** en el detalle de la OT.
  Pedido de Lucas vía Pedro el 13-08-2026.
- 🔴 **El invariante es que NO sale al cliente**: ni en el PDF de la hoja, ni en el correo al
  supervisor de SMU, ni en la copia a `cotizaciones.emval@gmail.com`. Si se filtra, EMVAL le está
  avisando por escrito a SMU que el trabajo quedó incompleto — lo contrario de para lo que se pidió.
- ⚠️ **No se llama "Observaciones técnicas" a propósito.** En preventivos el campo de ARRIBA se
  llama *"Observaciones"* y **ese sí se imprime**. Dos nombres casi iguales, uno público y otro
  interno, es cómo un pendiente termina en la hoja del cliente. El nombre no comparte ninguna
  palabra con el de arriba, y el aviso amarillo junto al campo no es decoración: es lo único que le
  dice al técnico, mientras escribe, que esto no lo lee el local.
- **Es opcional**: nunca bloquea el cierre de la OT. Un técnico sin señal no puede quedar atrapado.
- Se lee del DOM **dentro de la instantánea de `guardarEnFirebase`**, antes del primer `await` —
  misma regla que todo lo demás (ver `estado-global-pisado-por-la-ot-siguiente`).
- **Si el tipo no es preventivo se vacía**, no solo se oculta: si el técnico escribió un pendiente y
  después cambió el tipo, ese texto no puede quedar colgado dentro de una OT correctiva.
- Viaja por los 5 eslabones donde una OT sobrevive: pausa, retomar, cola offline (write-ahead),
  escritura en Firestore y subida diferida desde la cola.
- 🔒 **"Privado" es privado en la interfaz, no un secreto**: Firestore se lee sin autenticación.
- **Es de TODOS los técnicos**, no solo de quien lo pidió: se muestra por `estado.tipo`, sin ninguna
  condición de usuario.
- ✅ **PROBADO de punta a punta el 13-08-2026** con el arnés de `probar-emval-sin-tocar-produccion`
  (Playwright + Firebase/EmailJS stubeados): se cerró un preventivo completo y el pendiente quedó en
  el `set` de `ordenes`, **no** en las 56 líneas que jsPDF dibujó en la hoja, **no** en el registro
  de `pdfs`, y **no** en ninguno de los 2 correos.
  ⚠️ **Al medir el PDF, comprobar primero que el PDF se generó** (que aparezcan la pauta y el
  encabezado): en el primer intento el espía rompió `doc.text` y el PDF salió vacío — "el campo no
  aparece" era cierto y no probaba nada. Un espía sin línea de control da falsos negativos.
- ✅ **PROBADO en teléfono Android emulado** (Pixel 7, 412×839, DPR 2.625, touch; y Galaxy S5 de
  360 px): se escribe con el teclado del teléfono sin desbordar la pantalla, y **se cerró la hoja
  SIN SEÑAL** — el pendiente quedó en la cola del dispositivo (IndexedDB) y subió completo al
  recuperar señal. Es el escenario que perdió las hojas de julio, así que es el que hay que repetir
  ante cualquier cambio en este campo. Script: `scratchpad/prueba-telefono.js` de la sesión.
  📌 Hallazgo colateral, **preexistente y ajeno a este campo**: cerrando sin señal, la app igual
  intenta escribir el registro de `pdfs` y el `pdfUrl` de la orden — en producción esas dos
  escrituras fallan calladas. Encaja con `pdf-en-cloudinary-fuente-paralela`. No se tocó.
- Cubierto por `tests/pendientes-materiales-no-sale-al-cliente.js`.

**Photo/Signature Handling:**
- `tomarFoto(id, tipo, idx)` — Capture photo (before/after/seal)
- `procesarFoto(e)` — Process captured photo, compress, upload
- `confirmarFirma()` — Capture technician signature
- `limpiarFirma()` — Clear signature canvas

### Client-Side Filtering

Many screens implement real-time search/filter with `querySelectorAll()` and `data-*` attributes:

```javascript
// Search input triggers filter
searchInput.oninput = function() {
  const term = searchInput.value.toLowerCase();
  const rows = container.querySelectorAll('[data-search-field]');
  rows.forEach(row => {
    row.style.display = row.getAttribute('data-search-field').includes(term) ? 'block' : 'none';
  });
};
```

Applied in: sucursal search, cotizaciones search, enviadas (sent quotes), búsqueda general.

### Collapsible Forms

Forms that toggle visibility use `display: none/block` pattern:

```javascript
// Button toggles form visibility
btnAdd.onclick = function() {
  const abierto = form.style.display !== 'none';
  form.style.display = abierto ? 'none' : 'block';
  btnAdd.textContent = abierto ? '+ Agregar' : '- Ocultar formulario';
};
```

Example: "Agregar sucursal" (add branch) form in admin panel.

### Photo Upload Pipeline

1. `tomarFoto()` opens camera
2. `procesarFoto()` compresses image (max 800x600px, 70% quality)
3. Uploaded to Firebase Storage at `fotos/[folder]/[timestamp].jpg`
4. Also uploaded to Cloudinary for optimization
5. URLs stored in Firestore document

---

## 🔴 LAS 4 FUENTES DE VERDAD — leer antes de decir "no existe"

**Firestore NO es la única fuente.** Un trabajo ejecutado deja rastro en cuatro lugares distintos,
y con mala señal el dato se pierde en unos y sobrevive en otros. **Nunca concluir que algo no
existe habiendo mirado uno solo.** El orden del barrido:

| # | Fuente | Qué guarda | Cómo se consulta |
|---|---|---|---|
| 1 | **Firestore** | El registro de la OT | REST con la API key del cliente (ver abajo) |
| 2 | **Cloudinary** | **El PDF, aunque Firestore no lo enlace** | URL derivable del id del doc (ver abajo) |
| 3 | **`cotizaciones.emval@gmail.com`** | Copia automática de **cada OT completada**, con enlace al PDF | Bastián tiene acceso |
| 4 | **El dispositivo del técnico** | Cola offline (IndexedDB) + `localStorage` | Solo desde ese teléfono — ver `cola-pendientes-vive-en-el-dispositivo` |

### La casilla `cotizaciones.emval@gmail.com` es parte del sistema, no un buzón
A esa casilla llega una **copia automática de cada OT completada** con el enlace a su PDF. Es
respaldo y confirmación de que el trabajo se ejecutó, y **sobrevive cuando Firestore pierde el
dato**. Es lo que permitió recuperar 6 hojas de preventivo el 27-jul-2026.

⚠️ **Pero el texto del correo miente.** El asunto, el cuerpo y el texto del enlace se arman con el
estado global de la app, que para cuando se envía **ya puede ser el de otra OT**. Hubo correos que
decían *"OT #null completada · Tipo: Correctivo · Descargar PDF de Recepción de Obra"* cuyo adjunto
era una **hoja preventiva completa**. El PDF se genera antes del pisado, por eso está bien.
👉 **Fiarse del archivo, nunca del texto.** El nombre del PDF es el único indicio confiable del tipo:

- `<ceco>-HS <numero>-MP Transpaletas <Mes> <Año>.pdf` → **preventivo**
- `Recepcion_Obra_OT<numero>.pdf` → **correctivo**

(lo decide `_nombreArchivoPDF()`, buscar esa función en `index.html`)

### Barrer Cloudinary completo sin depender del correo
La URL se **deriva** y **funciona sin el segmento de versión** (`/v1784665781/`), que es lo que la
hace construible. El `public_id` es el nombre de arriba + `'_' + docId.slice(-7)`:

```
https://res.cloudinary.com/dcrf29tna/raw/upload/emval/pdfs/<public_id>
```

El `<ceco>` sale del campo **`centro`** de la sucursal (ojo: `centro`, no `ceco`), y el mes es el de
generación del PDF (≈ `creadoEn` de la OT). Con eso se prueban las ~150 OT con un `HEAD` por URL en
un par de minutos: convierte una revisión manual de correos en un **barrido exhaustivo**. Así
aparecieron las 3 hojas que se creían irrecuperables **y 3 más que nadie estaba buscando**.

### Leer/escribir Firestore por REST
```
https://firestore.googleapis.com/v1/projects/emval-app/databases/(default)/documents
```
API key del cliente, en `index.html` (buscar `apiKey:`). Las reglas permiten lectura y escritura sin
autenticación. Usar `select.fields` / `mask.fieldPaths` para no traer los base64 pesados
(`firmaImagen`, `pdfData`, fotos). **Para escribir: respaldo previo + `updateMask` siempre**, y
autorización explícita del cliente — es producción.

### Por qué esta sección existe
El 27-jul-2026 se concluyó dos veces que 3 hojas de preventivo "no se podían reconstruir por dato".
Era cierto mirando Firestore y **falso mirando el sistema completo**: los PDF estaban en Cloudinary.
**El cliente lo dijo en su primer mensaje** — *"está en el correo como correctivo pero al descargar
es preventivo"* — y se descartó dos veces antes de comprobarlo. Se estuvo a punto de mandar al
técnico a rehacer trabajo ya hecho. **La fuente la tenemos que conocer nosotros, no el cliente.**

## Procedimiento: "falta un dato / se perdió un registro"

Es el caso más frecuente de este proyecto. **Recorrer las 4 fuentes antes de concluir nada:**

1. **Firestore** — ¿existe el documento? ¿qué campos tiene realmente? (REST, sin abrir la app)
2. **Cloudinary** — construir la URL derivada y hacerle `HEAD`. **Un PDF puede existir sin estar
   enlazado.** Probar la variante preventiva *y* la correctiva: el nombre revela el tipo real.
3. **Correo de respaldo** (`cotizaciones.emval@gmail.com`) — copia de cada OT completada. Mirar
   **la URL del enlace**, nunca el texto, que puede venir del estado de otra OT.
4. **El dispositivo del técnico** — si nunca sincronizó, el trabajo está solo ahí.

**Reglas que salieron de casos reales:**
- ❌ Nunca decir "no existe" habiendo mirado una sola fuente. Decir **"no está en Firestore"**, que
  es lo que efectivamente se comprobó.
- ❌ Nunca mandar a alguien a rehacer trabajo en terreno sin haber barrido las 4.
- ✅ Cuando el cliente afirma algo sobre sus propios datos, **comprobarlo antes de descartarlo**.
  Él ve el sistema desde fuera y a veces desde ahí se ve mejor.
- ✅ Un dato que "se perdió" casi nunca se perdió: se guardó **pisado por otra OT**. Ver la memoria
  `estado-global-pisado-por-la-ot-siguiente` — con mala señal, `estado` cambia bajo los pies de un
  guardado en vuelo.
- ✅ Al reparar datos: respaldo previo a `08_Soporte_Postventa/Tickets/`, `updateMask`, y **no
  inventar**. Si la pauta no está en ninguna fuente, la hoja NO se marca como completa.

## Common Development Tasks

### Add a New Field to a Form

1. Create input element in form section (search for existing form)
2. Add to `estado` object if needed for saving
3. In save function, read from input: `inpFieldName.value`
4. Save to Firestore doc: `doc.update({ fieldName: value })`

### Implement Search/Filter on a Screen

1. Create search input and button in screen
2. Add `data-search-field="..."` attribute to rows you want to filter
3. Create filter function using `querySelectorAll('[data-search-field]')`
4. Attach to `oninput` or button `onclick`

Example implemented in: cotizaciones, sucursales, enviadas folders.

### Add a New Admin Feature

1. Create a button/link in admin screen (around line 3000+)
2. Create a `cargarXxxAdmin()` async function
3. Query Firestore: `db.collection('xxx').onSnapshot(snapshot => ...)`
4. Render results into container div
5. Attach edit/delete handlers to buttons

### Upload Photo to Firebase Storage

```javascript
const compressedBlob = await comprimeBlob(file);
const path = `fotos/ots/${Date.now()}.jpg`;
const ref = firebase.storage().ref(path);
await ref.put(compressedBlob);
const url = await ref.getDownloadURL();
// Save url to Firestore
```

Function `procesarFoto()` (line ~1106) handles full pipeline.

## Important Notes

- **No build step** — The app runs directly from HTML in browser. No bundling, no npm.
- **Firebase Config** — Hardcoded in HTML around line 835. Change for different Firebase projects.
- **Offline Mode** — Service Worker (`sw.js`) enables offline use. Sync occurs when back online.
- **Cloudinary** — Used for image optimization. URL pattern: `https://res.cloudinary.com/...`
- **Single file size** — index.html is large (~6500 lines). Use Ctrl+F to navigate. Consider splitting if adding major features.
- **DOM creation** — Heavy use of `document.createElement()` for dynamic UI (no framework). Be consistent with inline styles.
- **Error handling** — Minimal in current code. Firebase queries wrapped in try/catch, but UI errors not explicitly handled.

## Color Variables (CSS Custom Properties)

```css
--azul: #1B3A6B          /* Primary blue */
--azul-claro: #2D5AA0    /* Light blue */
--verde: #27A06B         /* Green (success) */
--rojo: #E53E3E          /* Red (error/delete) */
--naranja: #EF9F27       /* Orange (warning) */
--fondo: #F4F6FB         /* Background */
--texto: #1A2035         /* Primary text */
--texto2: #5A6478        /* Secondary text */
--texto3: #9AA3B2        /* Tertiary text (muted) */
```

## Recent Improvements (Last 5 Commits)

These changes are useful context for understanding current state:

1. **Collapsible "Agregar sucursal"** — Form now hides by default, shows on button click
2. **Interactive filters** — Search screens (cotizaciones, sucursales, enviadas) now have filter type selection + input
3. **Logo & quotation metadata** — Cotización cards display chain logo, CECO number, quotation number for better searchability
4. **Demo data hiding** — Stat cards no longer flash with old data; hidden until real Firestore data loads
5. **Button positioning** — "+ Agregar sucursal" moved to top of list for better UX

## Testing & Verification

- **No hay suite de tests, pero sí pruebas de regresión sueltas en `tests/`.** Se corren a mano con
  Node, sin dependencias: extraen la función real de `index.html` por texto y la ejecutan con stubs.
  ```
  node tests/numero-ot-no-se-cruza.js index.html
  node tests/reparar-pdf-cruzados.test.js
  node tests/planillas-cobranza.js index.html            # offline
  node tests/planillas-cobranza.js index.html --prod     # ademas cuadra contra produccion
  node tests/cola-correos-no-quema-cuota.js index.html
  node tests/comentario-en-correo-cotizacion.js index.html
  node tests/compartir-manda-el-pdf.js index.html
  node tests/link-pdf-es-compartible.js index.html
  node tests/pdf-cotizacion-no-queda-viejo.js index.html
  node tests/cotizacion-lleva-firma-emval.js index.html
  node tests/pendientes-materiales-no-sale-al-cliente.js index.html
  ```
  ⚠️ **Al renombrar una función que un test extrae, el test se cae con "No se encontro"** — es a
  propósito: avisa que el fix hay que revalidarlo, no que el test esté malo.
- El resto se prueba manualmente en el navegador.
- Open DevTools → Application → Service Worker to check offline status
- Firebase Console to inspect/edit Firestore documents
- Test on mobile: Use `ng serve` or `python -m http.server` to serve locally, then open on phone via local IP

## File Manifest

- `index.html` — Entire application (HTML + CSS + JS)
- `manifest.json` — PWA metadata (app name, icons, display mode)
- `sw.js` — Service Worker (offline caching strategy)
- `icon.png` — App icon
- `CLAUDE.md` — This file
- `BRIEF-SISTEMA-PARA-SOPORTE.md` — Mapa del sistema para Soporte (08): negocio, roles, flujo, fuentes de datos, documentos al cliente, bugs cerrados
- `tests/` — Pruebas de regresión sueltas, en Node sin dependencias (ver "Testing & Verification").
  `numero-ot-no-se-cruza.js` — el N° de OT no se cruza entre dos hojas cerradas seguidas ·
  `reparar-pdf-cruzados.test.js` — la decisión del reparador no toca lo que no debe ·
  `planillas-cobranza.js` — las planillas no cobran de más (previa que no suma, local duplicado,
  cuenta de prueba) ni se comen un trabajo (hoja de agosto, hoja con el tipo cruzado). Con
  `--prod` cuadra los totales contra los datos reales de Firestore ·
  `cola-correos-no-quema-cuota.js` — la cola de correos se contiene (backoff), se DETIENE ante un
  error de cuota o de credencial, y no pierde ningún aviso. Corre una hora simulada con reloj falso ·
  `comentario-en-correo-cotizacion.js` — el comentario que escribe el administrador llega al correo
  escapado (un `<` no abre un tag) y con sus saltos de línea, viaja en el `post` para que la cola
  también lo registre, y no se le ofrece a las hojas de trabajo, que comparten el modal ·
  `compartir-manda-el-pdf.js` — el botón Compartir manda el PDF (nunca el link a la app), regenera
  el que quedó viejo, no gasta cuota de EmailJS, y cerrar el menú no se trata como error ·
  `cotizacion-lleva-firma-emval.js` — la firma de EMVAL se dibuja en **los dos** generadores de
  cotización, cabe en el hueco bajo el TOTAL NETO (lee el hueco del código, no lo asume), no se
  deforma ni se estira, no dibuja nada si no hay imagen cargada, y una imagen corrupta no bota
  el PDF. No mezcla la firma del emisor con la del receptor ·
  `pendientes-materiales-no-sale-al-cliente.js` — la nota interna del técnico no se imprime en la
  hoja ni viaja en el correo, solo aparece en preventivos, solo la ve el Administrador (ni el
  Supervisor ni el técnico), se lee antes del primer `await`, sobrevive los 5 eslabones de
  persistencia, y la etiqueta no puede volver a decir "Observaciones"
- `vendor/` — dependencias servidas desde el repo, no desde un CDN.
  `emailjs-browser-4.min.js` (@emailjs/browser 4.4.1). Actualizar con:
  `curl -o vendor/emailjs-browser-4.min.js https://unpkg.com/@emailjs/browser@4/dist/email.min.js`
- `tools/` — Scripts de mantención de datos de producción. **Todos simulan por defecto y solo
  escriben con `--ejecutar`, respaldo previo y confirmación tecleada.**
  `reparar-pdf-cruzados.js` — re-enlaza los PDF que quedaron con el número de OT cruzado antes del
  fix del 31-jul. **Escribir requiere autorización de Pedro: es producción.**
  `embeber-firma-emval.js` — mete la firma y timbre de EMVAL en `index.html` como base64, midiendo
  el archivo para no deformarla. No toca producción: escribe un archivo del repo, con respaldo.
