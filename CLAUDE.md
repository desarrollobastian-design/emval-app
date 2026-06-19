# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

- No automated tests in repo. Test manually in browser.
- Open DevTools → Application → Service Worker to check offline status
- Firebase Console to inspect/edit Firestore documents
- Test on mobile: Use `ng serve` or `python -m http.server` to serve locally, then open on phone via local IP

## File Manifest

- `index.html` — Entire application (HTML + CSS + JS)
- `manifest.json` — PWA metadata (app name, icons, display mode)
- `sw.js` — Service Worker (offline caching strategy)
- `icon.png` — App icon
- `CLAUDE.md` — This file
