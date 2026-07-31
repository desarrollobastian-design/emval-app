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
  `numero-ot-no-se-cruza.js` — el N° de OT no se cruza entre dos hojas cerradas seguidas
