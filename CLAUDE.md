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
- 🔀 **Cada planilla es de UN cliente** y se elige en la barra de arriba — ver el bloque siguiente.
- Cubierto por `tests/planillas-cobranza.js`.

**Un cliente, una planilla** (`PL_CADENAS_SMU`, `_plClienteDe`, `_plDelCliente`, `_plTarifaPreventiva`):
- Pedido de Pedro el **21-08-2026**, el día que empezó a cargar trabajos en las bodegas de Entel:
  *"no quiero que los trabajos de Entel u otras cadenas se mezclen con la planilla que hacemos por
  Unimarc, Mayorista, Súper 10 (…) si es Papa John's, que sea una planilla aparte"*. Hasta ese día
  la pantalla bajaba **todo** y lo sumaba junto: su cotización de Megacentro Hualpén ($420.000,
  creada esa misma mañana) iba a entrar en el paquete que se le manda a SMU.
- 🔑 **CLIENTE ≠ CADENA, y confundirlos rompe el pedido en las dos direcciones.** Unimarc, Alvi,
  S10 y M10 son **cuatro cadenas y un solo cliente** (SMU): separarlas partiría en cuatro la
  planilla que Pedro usa hoy. Entel es otro cliente, Papa John's otro. Confirmado por escrito el
  21-08: *"Así es"*.
- 🔴 **El default es SEPARAR, no agrupar.** `PL_CADENAS_SMU` es una lista explícita de cuatro y todo
  lo demás sale con planilla propia sin tocar código. Al revés —una lista de "los que van aparte"—
  cada cliente nuevo caería dentro de SMU en silencio, que es el bug que se estaba arreglando. Si
  SMU suma un formato nuevo hay que agregarlo ahí; mientras tanto el error es **una planilla de más
  a la vista, no un cobro mezclado**.
- **La cadena se resuelve en cascada**, y los tres pasos hacen falta:
  1. **el catálogo `cadenas`** — es el maestro, y el único que sabe que *"Megacentro Hualpén"* es de
     Entel: su nombre no lo dice por ningún lado, así que cualquier separación que mire el texto del
     local lo manda al cliente equivocado.
  2. **el campo `cadena` del documento** — respaldo. **No alcanza solo:** lo traen **10 de 133**
     cotizaciones y **4 de 201** OT (medido el 21-08). Es el mismo error que ya costó caro con
     `estadoCot` en `_esCobrable()`.
  3. **el nombre del local** (`PL_RE_SMU`), que solo rescata SMU. Tampoco es opcional: **2 locales
     reales no resuelven contra el catálogo** —`UNIMARC LOS PIONEROS` y `UNIMARC HUALPEN`, que ahí
     figuran como *"UNIMARC Pioneros"* y *"UNIMARC HUALPEN Bulgaria"*— y arrastran **$740.000** en
     cotizaciones. Sin este paso esa plata sale de la planilla de SMU.
- ⚠️ **Lo que no se puede atribuir va a "Sin clasificar", visible y en ámbar** — nunca repartido a
  ojo. Su vista explica cómo cerrarlo (agregar la sucursal al catálogo). Adivinarle el cliente a un
  documento de cobranza es peor que dejar el hueco a la vista.
- 🔴 **`PL_TARIFA_TRANSPALETA` es del contrato EMVAL-SMU y de nadie más.** Pedro confirmó el 21-08
  que Entel lleva *"solo trabajos correctivos"*. Un cliente sin tarifa lista sus hojas **sin monto**;
  aplicarle la de SMU sería inventarle un precio a otro contrato. Es la regla *"ningún monto se
  estima"* aplicada al cliente. Los tiles *Tarifa* y *Ciclo* también dicen "sin contrato": el ciclo
  bimestral tampoco es de todos.
- ⚠️ **La pestaña de preventivos NO se esconde para esos clientes.** Si algún día se cierra una hoja
  preventiva de Entel, tiene que verse — esconder una lista por lo que se espera que traiga es como
  desapareció el trabajo de las OT con `tipo` null.
- **El choque de N° de OT se avisa solo dentro del mismo cliente**: dos paquetes que van a empresas
  distintas pueden repetir un número sin que nadie vea el mismo cobro dos veces.
- **El Excel lleva el cliente en el nombre** (`EMVAL_Planilla_Correctivos_Entel_2026.xlsx`), sin
  tildes ni espacios. ⚠️ La **fila de título interna se agrega solo cuando el cliente no es SMU**: la
  de SMU es la que ya está en uso y la que SMU recibe, y correrle la tabla una fila es cambiarle el
  documento a alguien que no lo pidió.
- ✅ **PROBADO en Chromium contra los 334 documentos reales de producción** (leídos por REST y
  sembrados en el arnés; Firestore y EmailJS espiados, cero escrituras y cero cuota): la barra sale
  **SMU 330 · Entel 1**, la deuda de SMU queda en $26.578.580 **sin** los $420.000 de Entel, la
  vista de Entel los muestra en su bloque de previas, y los cuatro Excel bajan con su nombre
  correcto. **Contraprueba por mutación** (4 regresiones simuladas — sin rescate por nombre, sin
  filtro, lista negra en vez de blanca, tarifa de SMU para todos): el test las detecta las 4.
- ⚠️ **Lo que este cambio NO hace:** *Facturar*, la vista de facturación y el Excel al supervisor
  (líneas ~11157, ~11588, ~11812) **siguen sumando todos los clientes juntos**. Hoy la fuga real ahí
  es $0 —la única cotización no-SMU es una `previa` y `_esCobrable` la excluye— pero se materializa
  cuando pase a `Realizada`. Decisión de Bastián el 21-08: este cambio cubre solo las Planillas.
- Cubierto por `tests/planillas-no-mezclan-clientes.js`.

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

**El aviso que llegó dos veces** (`_emailjsSend`, `_idDespacho`, `_yaDespachado`, `_paramsReenvio`,
`posibleEnvio`):
- Caso **OT #614727** (14 y 15-08-2026): Pedro recibió dos veces *"OT #614727 completada — UNIMARC
  QUILLÓN"* y creyó que se había duplicado el trabajo. **No se duplicó**: en `ordenes` hay UNA sola
  OT 614727 y su `updateTime` quedó congelado en el minuto del cierre. Se duplicó el **aviso**.
- **Causa:** el POST a EmailJS llegó al servidor y el correo salió, pero la respuesta no volvió al
  teléfono. El `await` rechazó con un `TypeError` sin `.status`, que se clasificaba `red` =
  *"no salió, reintentalo"*, y el aviso se encoló. Al día siguiente la cola lo despachó.
  📍 Fechado al minuto: `alertas/correos_dev_i352ho73w3rz` reportó `pendientes: 0` a las **16:59:12
  del 15-08** — y ese reporte solo puede venir de un ciclo que tenía avisos y los despachó, porque
  `sincronizarCorreosPendientes` hace `return` antes de reportar si la cola está vacía.
- 🔑 **El diagnóstico de fondo:** la cola garantizaba *"ningún aviso se pierde"* y **nunca prometió
  *"ninguno se manda dos veces"***. Son dos invariantes distintos y faltaba el segundo.
- 🔴 **`clase` y `ambiguo` responden preguntas distintas, y confundirlas fue el bug.** `clase`
  decide *si se reintenta o se corta la cola* (no cambió: es la regla que salvó la cuota el
  03-08). `ambiguo` decide *si el POST alcanzó a llegar* — y por tanto si el reenvío va marcado.
- **`_emailjsSend` ahora tiene guardia de tiempo** y mide cuánto tardó en morir: un rechazo casi
  instantáneo es *"la conexión nunca se estableció"*; uno lento es *"pudo haber salido"*. Era la
  **única llamada de red de la app sin guardia**, contra la regla que el propio proyecto ya tenía
  escrita. El `then` que engancha el envío lento **no es adorno**: sin él, la guardia recién
  agregada *fabricaría* dudas que se resuelven gratis cuando el POST contesta 200 tarde.
- **Libro de despachos** (`localStorage`, 30 días): qué avisos ya salieron desde este teléfono.
  Sobrevive a que el ítem salga de la cola, que es donde la memoria se perdía — la dedupe por
  `clave` solo existe mientras el aviso está encolado. Cierra además el **otro** camino al
  duplicado: `guardarYEnviarPDF` y `sincronizarOTsPendientes` notifican los dos, y ahora comparten
  identidad por el `clientId` de la OT (`sello`), no por el número, que puede venir vacío.
- 🔴 **El duplicado NO se elimina del todo, y es a propósito.** Distinguir *"no salió"* de *"salió y
  no supe"* es imposible desde el cliente y EmailJS **no acepta clave de idempotencia** (revisado
  el payload del vendor). La política es **ante la duda se manda, pero MARCADO**: un aviso perdido
  es un trabajo ejecutado que administración no ve ni factura (julio, 59 locales); un duplicado es
  1 request de 200 y un susto. **Lo que se elimina no es el duplicado: es el "creo que se duplicó
  el trabajo".**
- **La marca va en `ot_numero`**, que es el campo que el template pone en el **asunto**: se ve en
  la lista de la bandeja *sin abrir el correo*, que es exactamente donde Pedro se confundió. El
  número completo se conserva, así que buscar `614727` en Gmail sigue encontrando los dos.
  Se eligió no depender de editar la plantilla en el panel de EmailJS: un fix que solo funciona si
  alguien entra a un panel externo es un fix a medias.
- **Sin señal declarada (`navigator.onLine === false`) ya no se intenta el POST**: se encola
  directo. Saca del conjunto dudoso el fracaso más frecuente —así la mayoría de los reenvíos salen
  limpios, sin marca— y de paso no gasta cuota contra una red que se sabe caída.
- **Cerrojo de reentrada** en `sincronizarCorreosPendientes`: son **cinco** gatillos (`online`,
  primer plano, arranque, intervalo de 90 s y el botón) y cualquiera puede entrar mientras otro
  está parado en un POST colgado. Y la cola **se relee y se fusiona** al guardar, no se pisa con la
  copia rancia del ciclo: pisarla resucitaba avisos ya despachados.
- ⚠️ **El reintento manual NO borra la duda.** Quien aprieta *Reintentar* pide otra ventana de
  7 días, no declara que el aviso jamás salió: eso no lo sabe nadie.
- ⚠️ **La barra dice "pueden haber salido", no "no se enviaron".** Rojo + *"no se enviaron"* es una
  orden implícita de reenviar, y el técnico la obedece — fabricando el duplicado a mano.
- ✅ **PROBADO de punta a punta en Chromium (Pixel 7), 16-08-2026** con
  `tests/offline/prueba-duplicado.js`: se cerró una OT completa por la interfaz con el correo
  configurado para *salir y fallar*, se **recargó la página** (el técnico cerró la app) y al volver
  salieron exactamente 2 reenvíos, los dos marcados `"893937 (REENVIO)"`; un tercer ciclo mandó 0.
  **Contraprueba contra `e8519a5`:** el reenvío sale `"260218"` idéntico al original — el correo
  del 15-08 16:59 — y el guion falla.
- 📌 **Lo que queda abierto:** `_CORREOS_MS_CONEXION` (1500 ms) se eligió a ojo. Por eso la alerta
  ahora reporta `msFallos` y `ambiguos`: **calibrarlo con la red real de los técnicos en 2 semanas**
  (≈ 30-08-2026). Equivocarse solo pone o saca una marca; nunca pierde un aviso.
- Cubierto por `tests/aviso-no-sale-dos-veces.js` (unitario, 11 casos) y
  `tests/offline/prueba-duplicado.js` (flujo real).

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

**Nombre del PDF de la cotización** (`_nombrePDFCot`, `_localSinCadena`, `_slugPDFCot`,
`_urlDescargaCot`):
- Formato pedido por Pedro el 14-08-2026, el mismo con que archiva a mano desde antes de la app:
  `<N° cotización> HS <N° OT> <servicio> <local>.pdf` → `31082601 HS 9464 Cambio de lamas Chillan 2.pdf`.
  El nombre viejo empezaba con `Cotizacion_` en las 103, así que ordenar la carpeta no servía.
- 🔴 **Sin N° de OT se omite el bloque `HS …` entero**, no se deja vacío. Una **previa** se emite
  antes de que exista la OT (`otNumero: ''`, puesto a propósito al guardar): un `HS` suelto se lee
  como un dato que se perdió. El `0` se descarta igual que el vacío — `otNumero` llega de Firestore
  como número y un `0` pasaría el filtro de string.
- **El folio se copia, nunca se rearma.** Es `ddmmaa` + correlativo **del día** y **global**
  (`contadores/cot_<ddmmaa>`, transacción) — no es por supervisor ni por local. Rearmarlo fue el
  bug del `'01'` hardcodeado. Sin folio el nombre dice `SIN-NUMERO`: el hueco se ve y se corrige
  antes de enviar.
- 🔴 **Sin tildes ni ñ, y no es cosmética.** El nombre viaja dentro de la URL como
  `fl_attachment:<nombre>` y un carácter fuera de ASCII hace que Cloudinary responda **400**: la
  descarga se rompe, no sale fea. Medido con `HEAD` contra producción (14-08-2026): *"Destape baño"*
  daba `400 / inline`; normalizado da `200` con el nombre puesto.
- **El nombre que se ve y el `public_id` son dos cosas distintas.** El `public_id` va sin espacios
  y con sufijo único (regenerar un PDF no puede pisar el anterior: el preset no garantiza
  sobrescritura); el nombre bonito se pega en la descarga con `fl_attachment`, que **no vuelve a
  subir nada**. Efecto colateral bueno: **los PDF viejos también se descargan con el nombre nuevo**.
- `localCorto` se **denormaliza al guardar** la cotización. Recortar la cadena depende de
  `window._cadenasMapaCot`, que solo se puebla al abrir la pantalla de cotizaciones: sin
  denormalizar, el mismo documento salía con dos nombres según por dónde se abriera. **Sin catálogo
  se devuelve el nombre completo**, jamás uno cortado a medias.
- ⚠️ **El camino "Ver PDF" de una cotización sin PDF subido u obsoleta abre un blob y no lleva
  nombre.** Se dejó así: el botón dice *Ver*, y pasarlo a descarga es cambiarle el comportamiento a
  Pedro sin que lo pidiera. Al enviarla o compartirla se sube y ahí sale con el nombre bueno.
- ⚠️ **`cargarCarpetas()` arma cada tarjeta campo por campo**, así que lo que no se copie ahí no
  existe para el botón. `localCorto` se quedó fuera en el primer intento y el campo guardado no
  llegaba nunca. Apareció al **preparar** la prueba en navegador —trazando la ruta real hasta el
  botón—, no al correrla y tampoco en el test unitario, que le pasaba el campo a mano.
- ✅ **PROBADO en Chromium, 14-08-2026** (`tests/offline/prueba-nombre-pdf.js`): login real como
  Administrador, panel, Cotizaciones y click en **Ver PDF**; se mide el nombre del archivo que
  descarga el navegador. Salen `01082604 HS 301143 Correctivo transpaletas Chillan.pdf` y
  `01082605 Cambio de lamas Chillan 2.pdf`. **Contraprueba contra `f0b4c2b`** (anterior al cambio):
  bajan los `Cotizacion_Alvi_Chillan_…` de siempre y el guion falla.
- ✅ **PROBADO además contra las 103 cotizaciones reales** (lectura por REST + `HEAD` a Cloudinary):
  0 nombres inválidos, 0 repetidos entre documentos distintos, y el `Content-Disposition` vuelve
  con el nombre exacto.
- Cubierto por `tests/nombre-pdf-cotizacion.js` (unitario) y `tests/offline/prueba-nombre-pdf.js`
  (flujo real).

**El texto del ítem se imprime completo** (`_colsCot`, `_lineasItemCot`, `_altoFilaCot`,
`_dibujarTablaItemsCot`):
- Caso **cotización 19082601** (19-08-2026, UNIMARC Pioneros): a SMU le llegó *"Reparación de piso
  en pasillo central y venta asistida **50**"* — sin el *"palmetas de 50x50cm."*— y en el ítem de al
  lado se comió la cantidad entera. La tabla dibujaba `splitTextToSize(...)` y de ahí **solo la**
  **`[0]`**: la fila medía 7 mm fijos y no cabía una segunda línea. **jsPDF no avisa: dibuja la
  primera y calla**, igual que recorta la firma en silencio.
- 📊 **No era un caso aislado:** al barrer las 132 cotizaciones de producción, **11 tenían al menos
  un ítem cortado** (14 ítems; 13 de 2 líneas y 1 de 3).
- 🔴 **El técnico no tiene cómo notarlo.** La vista previa de la app es HTML y ahí el texto **sí**
  se ve completo (`vistaPreviaCotizacion` hace salto de línea solo). Lo que se corta es el PDF, que
  es justo lo único que ve el cliente. Por eso el invariante se vigila en el PDF, no en la pantalla.
- **Fila de alto variable**, como la tabla de servicios del preventivo: se dibujan todas las líneas
  y la fila crece (2 líneas → 9,8 mm). El texto que no cabe **nunca se recorta**; si los ítems no
  caben en la hoja se abre una **hoja de continuación**.
- 🔑 **El cuerpo conserva sus 98 mm** (los 14 × 7 mm de siempre) quitando filas vacías de relleno,
  y el sobrante de menos de media fila se lo come la última fila con contenido. Así **el TOTAL**
  **NETO, la firma y la nota de validez no se mueven** ni medio milímetro — medido en el PDF real:
  TOTAL NETO en 233 mm y nota en 279 mm, idénticos antes y después del cambio.
- **Las columnas ahora suman los 180 mm** de ancho útil. Sumaban 172: la última celda quedaba coja
  y por eso el título *Total* y los montos salían corridos de su columna. Los 12 mm que le sobraban
  a *Real* —una columna que solo dice "cu"— pasaron a *Detalle*, que es donde faltaban: con eso 6
  de los 14 textos largos de producción dejan de partirse en dos.
- ⚠️ **La medición va antes de dibujar y con la fuente ya fijada.** `splitTextToSize` mide con la
  fuente activa, y en negrita el mismo texto ocupa más: medir con una y dibujar con otra es como no
  medir.
- **Un solo sitio para los dos generadores.** El bug estaba duplicado porque la tabla estaba copiada
  en `generarPDFCotizacionGuardada` y en la huérfana `generarPDFCotizacion`. Ahora las dos llaman a
  `_dibujarTablaItemsCot`, y el test exige que ninguna vuelva a tocar `item.desc` por su cuenta.
- ✅ **PROBADO de punta a punta en Chromium, 19-08-2026** con `tests/offline/prueba-texto-cotizacion.js`:
  se genera el PDF con el jsPDF real y se **abre el archivo** para leer qué quedó escrito y en qué
  coordenada. Salen las 4 líneas completas, dentro de la columna Detalle.
  **Contraprueba contra `7845adf`:** salen 2 líneas, cortadas exactamente donde muestra la foto de
  Pedro, y el guion falla.
- ⚠️ **Queda pendiente, y NO se tocó:** el nombre del local se sigue cortando a 16 caracteres en las
  hojas (`substring(0,16)` — 25 de los 50 locales, y `UNIMARC CHILLAN 1/2/4/VIEJO` salen los cuatro
  como `"UNIMARC CHILLAN "`), y en la página 2 del PDF de cotización el campo *Dirección* imprime el
  local otra vez. Decisión de Bastián el 19-08: este arreglo cubre solo la tabla de la cotización.
- 🔴 **Un PDF ya subido NO se arregla solo, y por poco eso deja el arreglo inservible.** Pedro volvió
  a abrir su cotización con el fix ya desplegado y le seguía saliendo cortada: el PDF estaba en
  Cloudinary desde antes del despliegue, y un PDF es un archivo estático. Peor, al reenviarla
  tampoco se regeneraba — `_pdfCotObsoleto` solo miraba si había cambiado el **contenido**, y lo que
  cambió fue el **formato**. Por eso existe `_PDF_COT_FORMATO`: al subir ese número, todo PDF
  anterior queda obsoleto y el próximo *Ver PDF* / envío / compartir lo vuelve a dibujar.
  👉 **Al cambiar cómo se dibuja el PDF hay que subir `_PDF_COT_FORMATO`**, o el cliente no ve el
  cambio por ningún camino. Los tres sitios que guardan un `pdfUrl` escriben el sello vía
  `_camposPDFCot()`; el que se olvide deja un PDF sin versión, que se regeneraría en cada envío.
  ⚠️ Esto le agregó a `_pdfCotObsoleto` una **segunda razón para caducar**, y por eso hubo que
  actualizar los casos de `tests/pdf-cotizacion-no-queda-viejo.js`: sus fixtures no traían sello y
  el test exigía justamente que NO se regenerara el PDF que le salía cortado a Pedro.
- Cubierto por `tests/texto-cotizacion-no-se-corta.js` (unitario, con las métricas reales de
  Helvetica) y `tests/offline/prueba-texto-cotizacion.js` (PDF real).

**Qué versión de la cotización llegó al cliente** (`_fechaCortaCot`, `_estadoReemisionCot`,
`pdfUrlEnviado`, `pdfEnviadoGen`, `enviadoEn`, `enviosCot`):
- Caso **19082601** (19-08-2026): Pedro envió la cotización el 18, se la pidieron corregida, la
  corrigió el 19 (de `1 × $800.000` a `50 × $16.000`) y la reenvió. Después abrió un correo, vio
  *cantidad 1* y concluyó que la corrección no había salido.
- 🔬 **El PDF corregido SÍ se generó y SÍ quedó enlazado** — bajado de Cloudinary y leído: dice
  `50 × $16.000`, subido a las 09:40:49, con el correo saliendo a las 09:41:27. Lo que Pedro
  miró fue el correo del día anterior.
- 🔑 **Y eso no es un descuido suyo, es del diseño:** el correo manda un **enlace**, no un adjunto,
  y cada regeneración sube un archivo **nuevo** a Cloudinary (sufijo único, ver el nombre del PDF).
  El correo del 18 seguirá mostrando la versión vieja **para siempre**. Dos correos casi idénticos
  en la bandeja del supervisor de SMU y ninguna forma de distinguirlos sin abrirlos.
- **La tarjeta del correo ahora declara su versión**: el enlace dice `Ver / Descargar PDF (v.
  19-08-2026 09:40)` y, si la cotización ya había salido antes, un aviso naranja arriba del botón:
  *COTIZACIÓN CORREGIDA · versión del … — reemplaza la enviada el …*.
- ⚠️ **Distingue corregir de reenviar.** Se compara contra `pdfEnviadoGen` —la versión que
  efectivamente viajó— y no contra la fecha del envío: mandarle el mismo PDF a otro supervisor
  dice *REENVÍO DEL MISMO DOCUMENTO*. Decir "corregida" de algo que no cambió confunde igual que
  no decir nada, y un aviso que miente se deja de leer.
- 🔴 **Ahora queda registrado QUÉ se envió, no solo a quién.** `pdfUrlEnviado` + `pdfEnviadoGen` +
  `totalEnviado` + el historial `enviosCot`. Sin eso no había forma de responder *"¿el correo del
  martes llevaba la versión corregida?"* — y esa pregunta ya se hizo.
- **Viaja en el `post`**, con la fecha del envío calculada **una sola vez** fuera del bucle de
  destinatarios: si el correo sale desde la cola mañana, se registra igual y los dos correos del
  mismo envío no quedan como dos envíos distintos.
- El bloque HTML vive en la zona **CSS-EXPORTADO**: literales, nunca `var(--…)`.
- ⚠️ **Lo que este cambio NO hace:** el PDF viejo sigue existiendo y accesible. Se decidió así el
  19-08 — el histórico de qué se envió cada día es la prueba ante SMU. La alternativa (un nombre
  fijo por cotización, que el enlace viejo muestre siempre la última versión) se descartó.
- Cubierto por `tests/cotizacion-dice-que-version-va.js`.

**Cerrar sin señal: guardias de tiempo y el enlace del PDF** (`_conTimeout`, `_fetchConTimeout`,
`_encolarEnlacePDF`, `sincronizarEnlacesPDFPendientes`):
- 🔴 **Toda llamada a Firestore va envuelta en `_conTimeout`, sin excepción.** No es estilo: con
  mala señal el SDK **no resuelve ni rechaza** — se queda colgado. Un `await` sin guardia mata
  todo lo que viene después en esa función, en silencio y sin error en consola.
- 📍 Eso fue exactamente lo que pasó en `guardarYEnviarPDF` hasta el 13-08-2026: el `add()` a
  `pdfs` colgaba el cierre y **nunca corrían el correo al local ni `_notificarOTCompletada`** —
  ni siquiera llegaban a entrar en su cola de reintento, que existe justo para eso. La hoja se
  veía cerrada en el teléfono y administración no se enteraba. La regla estaba escrita desde
  antes (ver el comentario de `_conTimeout`); ese sitio simplemente se quedó fuera de la lista.
- **Cloudinary va con `_fetchConTimeout`**, nunca `fetch` pelado: con la señal *muerta* (que no es
  lo mismo que sin señal — `navigator.onLine` sigue en `true`) un `fetch` no se rinde nunca.
- **El enlace del PDF que no se logra escribir se encola en el dispositivo** y se reintenta en el
  mismo ciclo que las otras colas. Cubre el caso que la cola de OT no cubre: la OT **sí** se
  guardó (había señal) y la señal se cayó después, durante el PDF — nadie reintentaba y el PDF
  quedaba en Cloudinary sin que Firestore lo apuntara (`pdf-en-cloudinary-fuente-paralela`).
- ⚠️ **El reintento usa `update()`, jamás `set({merge})`.** La OT puede no existir todavía en
  Firestore (sigue en la cola del teléfono) y un merge la **crearía** con dos campos sueltos: una
  orden fantasma, sin número ni tipo, colándose en las listas. `update()` falla con `not-found` y
  el enlace espera a que la OT suba.
- ⚠️ **El reintento escribe solo los campos con valor.** Un enlace encolado puede traer una sola
  de las dos URLs; escribir la otra como `''` pisaría un enlace bueno y dejaría la OT **peor** que
  antes de reintentar.
- Invariante, igual que en la cola de correos: **el código nunca borra un enlace que no se aplicó.**
- ✅ **PROBADO en Chromium con un teléfono emulado (Pixel 7), 13-08-2026**, cerrando una OT
  correctiva completa por la interfaz (foto, firma en el canvas, timbre) con Firestore y EmailJS
  espiados y Cloudinary interceptado — cero riesgo para producción y cero cuota gastada:
  - **Sin señal:** a los 25 s el timeout corta el cuelgue y **salen los 2 correos** (local +
    administración) con el número correcto. **Contraprueba contra el código de antes del fix: a
    los 130 s seguían 0 correos**, colgado para siempre en `add:pdfs`.
  - **Señal intermitente** (Cloudinary sube, Firestore cae): el enlace queda encolado y al volver
    la señal se aplica con **solo** `pdfUrlCloudinary`, sin pisar nada con `''`.
  - **Enlace reintentado antes de que la OT exista:** `update()` lo rechaza con `not-found`, el
    enlace **sigue pendiente** y **no se crea ninguna orden fantasma**.
- Cubierto por `tests/enlace-pdf-no-se-pierde-sin-senal.js`.

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
  node tests/enlace-pdf-no-se-pierde-sin-senal.js index.html
  node tests/nombre-pdf-cotizacion.js index.html
  node tests/aviso-no-sale-dos-veces.js index.html
  node tests/texto-cotizacion-no-se-corta.js index.html
  node tests/cotizacion-dice-que-version-va.js index.html
  node tests/pdf-cotizacion-con-formato-viejo-se-regenera.js index.html
  node tests/planillas-no-mezclan-clientes.js index.html
  ```
  ⚠️ **Al renombrar una función que un test extrae, el test se cae con "No se encontro"** — es a
  propósito: avisa que el fix hay que revalidarlo, no que el test esté malo.
- **`tests/offline/` — la única prueba que ejecuta el flujo real** (Playwright + Chromium, teléfono
  emulado): cierra una OT completa por la interfaz y le corta la señal justo antes de cerrar.
  Firebase/EmailJS espiados y Cloudinary interceptado: no toca producción ni gasta cuota.
  Ver `tests/offline/README.md`. **Repetirla ante cualquier cambio en el cierre de la OT, en las
  colas de reintento o en la subida/enlace del PDF.**
  ⚠️ **Va en subcarpeta a propósito:** necesita dependencias, así que no puede quedar junto a los
  `tests/*.js`, que corren sueltos con Node.
  🔑 **La contraprueba (`prefix.html`, generada de un commit anterior al fix) no es opcional:** si
  el guion pasa igual contra el código viejo, no está midiendo lo que dice medir.
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
  `planillas-no-mezclan-clientes.js` — cada planilla es de un cliente: la cotización de Entel no
  entra en el paquete de SMU, pero las CUATRO cadenas de SMU siguen en UNA sola planilla; un local
  desconocido no cae en SMU por defecto; el catálogo le gana al campo `cadena` del documento y el
  nombre del local rescata los 2 locales de SMU que el catálogo no resuelve; un cliente sin tarifa
  lista sus preventivos sin monto y su pestaña no se esconde; el choque de N° de OT solo se avisa
  dentro del mismo paquete; y sumando todas las planillas vuelven todas las cotizaciones ·
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
  persistencia, y la etiqueta no puede volver a decir "Observaciones" ·
  `enlace-pdf-no-se-pierde-sin-senal.js` — ninguna llamada a la nube dentro de `guardarYEnviarPDF`
  queda sin guardia de tiempo (el cuelgue que mataba el correo al local y el aviso a
  administración), el enlace que no se pudo escribir se encola en vez de perderse, el reintento
  usa `update()` y no crea órdenes fantasma, no pisa con vacío un enlace bueno, y lo que no se
  aplica sigue pendiente ·
  `aviso-no-sale-dos-veces.js` — el aviso de OT no se manda dos veces: el envío que pudo haber
  salido se reenvía **una** vez y **marcado**, el que nunca salió se reenvía limpio, el que
  confirma tarde se desencola solo, los dos productores (cierre y cola offline) mandan uno solo,
  dos ciclos solapados gastan una request, un aviso desencolado no resucita, los encolados por la
  versión anterior salen sin marca, dos avisos sin número no se tapan, el reintento manual conserva
  la marca y el corte por cuota sigue intacto. **Trae línea de control**: si el guion no llega al
  final se declara en falla, porque contra el código anterior el envío se cuelga para siempre y un
  guion que muere en silencio parece uno que aprueba ·
  `pdf-cotizacion-con-formato-viejo-se-regenera.js` — un PDF dibujado por una versión anterior de la
  app se regenera solo: sin `pdfFormato` está obsoleto, con el formato vigente no se regenera de
  gratis (cada regeneración es una subida desde el teléfono del técnico), y los tres sitios que
  guardan un `pdfUrl` escriben el sello ·
  `cotizacion-dice-que-version-va.js` — el correo dice qué versión de la cotización lleva: la
  primera vez no avisa nada, una reemisión con documento nuevo dice CORREGIDA y a cuál reemplaza,
  un reenvío del mismo PDF no se anuncia como corrección, una cotización anterior al registro avisa
  igual, el envío queda guardado (qué PDF y de cuándo) y viaja en el `post` para que también se
  registre si sale desde la cola ·
  `texto-cotizacion-no-se-corta.js` — el texto de un ítem se imprime COMPLETO en la cotización: no
  se pierde ninguna línea, cada una cabe en su columna (se mide con las métricas reales de
  Helvetica, no se asume), las columnas suman el ancho útil de la hoja, una fila de una línea
  sigue midiendo 7 mm con su texto en y+5, el cuerpo conserva sus 98 mm para que el TOTAL NETO y
  la firma no se muevan, con 30 ítems se abre hoja nueva en vez de recortar, y los dos
  generadores dibujan por la misma función ·
  `nombre-pdf-cotizacion.js` — el PDF de la cotización sale con el nombre con que Pedro archiva:
  el folio va primero y se copia tal cual (no se rearma), una **previa sin OT no dice `HS`** en
  ninguna parte, sin folio el hueco se ve, las tildes y la ñ se normalizan (fuera de ASCII la
  descarga devuelve 400), la descripción larga se corta por palabra entera, recortar la cadena
  nunca se come el local, el nombre no cambia según qué pantalla se haya abierto antes, y
  `_urlDescargaCot` no toca el link a la app
- `tests/offline/` — arnés Playwright con la app real (`preparar.js` arma el sitio con los espías).
  `prueba-offline.js` corre los escenarios A/B/C del cierre sin señal ·
  `prueba-nombre-pdf.js` baja una cotización como Administrador y mide el nombre del archivo que
  descarga el navegador (Cloudinary de verdad: son 2 GET públicos, no gastan cuota) ·
  `prueba-duplicado.js` reproduce el caso 614727 — el cierre FUNCIONA y lo único que se rompe es la
  confirmación del correo (`__CORREO_MODO = 'sale-y-falla'`), con una **recarga de página** en el
  medio que simula el día que pasó entre un correo y el otro.
  `prueba-texto-cotizacion.js` genera el PDF de la cotización 19082601 con el jsPDF real, lo abre
  y lee qué texto quedó y en qué coordenada — mide además que el TOTAL NETO y la nota de validez
  no se movieron, comparando contra la versión anterior ·
  Su `sitio/` no se versiona.
- `vendor/` — dependencias servidas desde el repo, no desde un CDN.
  `emailjs-browser-4.min.js` (@emailjs/browser 4.4.1). Actualizar con:
  `curl -o vendor/emailjs-browser-4.min.js https://unpkg.com/@emailjs/browser@4/dist/email.min.js`
- `tools/` — Scripts de mantención de datos de producción. **Todos simulan por defecto y solo
  escriben con `--ejecutar`, respaldo previo y confirmación tecleada.**
  `reparar-pdf-cruzados.js` — re-enlaza los PDF que quedaron con el número de OT cruzado antes del
  fix del 31-jul. **Escribir requiere autorización de Pedro: es producción.**
  `embeber-firma-emval.js` — mete la firma y timbre de EMVAL en `index.html` como base64, midiendo
  el archivo para no deformarla. No toca producción: escribe un archivo del repo, con respaldo.
