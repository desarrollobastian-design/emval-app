# Prueba de cierre de OT sin señal (Playwright)

Cierra una OT **completa por la interfaz** en un teléfono emulado (Pixel 7) y le corta la señal
justo antes de cerrar. Es la única prueba del proyecto que ejecuta el flujo real de punta a punta;
el resto de `tests/` son pruebas de regresión sueltas en Node.

> ⚠️ **Va aparte, en esta subcarpeta, a propósito.** Los tests de `tests/*.js` corren sin
> dependencias con `node tests/x.js index.html`. Este necesita Playwright y un servidor, así que
> si viviera junto a ellos rompería cualquier barrido que los corra todos.

## Por qué existe

El 13-08-2026 se descubrió que `guardarYEnviarPDF` llamaba a Firestore sin `_conTimeout`. Sin señal
el SDK **no falla: se cuelga** — ni resuelve ni rechaza. El cierre moría en el `add()` a `pdfs` y
**nunca corrían el correo al local ni el aviso a administración**, que ni siquiera alcanzaban a
entrar en su cola de reintento. La hoja se veía cerrada en el teléfono y administración no se
enteraba. Ningún test de lectura de código detecta eso: hay que ejecutarlo.

## Qué es real y qué no

Real: el navegador, la app entera, jsPDF, el canvas de la firma, IndexedDB, localStorage, el
teclado y la pantalla del teléfono emulado.

Sustituido: **Firestore y EmailJS** son espías (el SDK ni se carga, así que tocar producción es
imposible aunque el código lo intente, y no se gasta cuota del plan de 200 correos/mes), y
**Cloudinary** se intercepta con `page.route` (no se sube nada a la cuenta real). Lo único del flujo
que se omite es el selector de archivos del sistema, que no existe en headless: se fija
`estado.fotoActual*` igual que `tomarFoto()` y se entrega el archivo al mismo input de la galería.

🔑 **El stub tiene que COLGARSE, no rechazar.** Un stub que devuelve `Promise.reject` no reproduce
nada: da un error limpio que los `try/catch` manejan. Sin señal el SDK deja la promesa sin asentar,
y eso es lo que mata la función. Por eso el espía devuelve `new Promise(function(){})`.

## Cómo se corre

Necesita Playwright (está global: `npm i -g playwright`). En Windows, con `NODE_PATH` apuntando a
los módulos globales:

```bash
export NODE_PATH="C:/Users/corex/AppData/Roaming/npm/node_modules"

# 1. Armar el sitio. El ref de git es la CONTRAPRUEBA: una versión ANTERIOR al fix.
node tests/offline/preparar.js 0da0415

# 2. Servirlo (deja esta terminal abierta)
cd tests/offline/sitio && python -m http.server 8765

# 3. Correr los escenarios (otra terminal)
node tests/offline/prueba-offline.js index.html A    # sin señal          → 2 correos a los ~26 s
node tests/offline/prueba-offline.js index.html B    # señal intermitente → enlace encolado y aplicado
node tests/offline/prueba-offline.js index.html C    # OT aún no existe   → not-found, sin fantasma
node tests/offline/prueba-offline.js prefix.html A   # CONTRAPRUEBA       → 0 correos a los 130 s
```

**La contraprueba no es opcional.** Si el guion pasa igual contra el código de antes del fix, no
está midiendo lo que dice medir. Usa un commit anterior al 13-08-2026; `0da0415` sirve.

Cada escenario tarda entre 30 s y 2,5 min: los timeouts reales son de 25 s y se encadenan.

## Cuándo repetirla

Ante **cualquier** cambio en el cierre de la OT, en las colas de reintento, o en cómo se sube y se
enlaza el PDF. Es el escenario que perdió las hojas de julio.

---

# `prueba-nombre-pdf.js` — el nombre con que el archivo cae en la carpeta

Segundo guion del mismo arnés, otro flujo: **el administrador descargando una cotización**.

```bash
node tests/offline/preparar.js            # (o con un ref, para tener también la contraprueba)
cd tests/offline/sitio && python -m http.server 8765
node tests/offline/prueba-nombre-pdf.js index.html    # ~25 s
node tests/offline/prueba-nombre-pdf.js prefix.html   # CONTRAPRUEBA: tiene que FALLAR
```

Hace el login real con contraseña, entra al panel, abre Cotizaciones y aprieta **Ver PDF**. Lo que
mide es el `suggestedFilename()` de la descarga que dispara el navegador — el nombre real del
archivo, no lo que devuelve una función.

🔑 **Cloudinary aquí es el de verdad, y tiene que serlo.** El nombre lo pone el servidor en el
`Content-Disposition` que produce `fl_attachment`; interceptarlo sería probar el mock. Son dos
`GET` a PDF que ya existen: lectura pública, no sube ni borra nada y no gasta cuota de ningún plan.
Las **subidas** (`api.cloudinary.com`) sí se cortan con `page.route`, por si algún camino
intentara escribir.

Cubre los dos casos que definió Pedro (con N° de OT, y **previa sin `HS`**) y los dos caminos del
nombre del local: uno con `localCorto` guardado en el documento y otro sin él, que tiene que
resolverse contra el catálogo de cadenas.

📍 Medido el 14-08-2026: `01082604 HS 301143 Correctivo transpaletas Chillan.pdf` y
`01082605 Cambio de lamas Chillan 2.pdf`. Contra `prefix.html` (commit `f0b4c2b`, anterior al
cambio) bajan `Cotizacion_Alvi_Chillan_…` y el guion falla, que es lo que lo valida.

**Cuándo repetirla:** ante cualquier cambio en `_nombrePDFCot`, en el `public_id` con que se sube
la cotización, o en los campos que `cargarCarpetas()` copia al armar cada tarjeta — ahí fue donde
`localCorto` se quedó fuera y el campo no llegaba al botón.
