# Design System: EMVAL — Órdenes de Trabajo

> **Source of truth de diseño del proyecto.** Documenta las decisiones aprobadas y
> canónicas. Los comandos `/critique`, `/polish` y `/normalize` validan el código
> contra este archivo. Cuando el código y este documento difieran, **este documento gana** —
> el código debe alinearse, no al revés.
>
> Extraído del sistema implícito en `index.html` (`:root`, líneas 16-34) y consolidado
> tras la crítica de diseño del 2026-07-08. Las secciones marcadas con
> **⚠ Deriva actual** señalan dónde el código todavía no cumple la decisión canónica.

---

## 1. Visual Theme & Atmosphere

EMVAL es una **herramienta de trabajo de campo**, no un producto de marketing. La usan
**tres** técnicos de mantención (electricidad, cañerías, baños, correctivos y preventivos) en
**condiciones variables y no controladas**: interiores oscuros, exteriores con sol directo,
con una sola mano libre — **sin guantes** (confirmado por Pedro, 2026-07-09). Algunos son de
**tercera edad**, y eso manda: el login es un PIN de 4 dígitos simple, no una contraseña. Y la usa
un administrador desde un entorno de escritorio (monitor + laptop + teléfono).

La atmósfera es **utilitaria, sólida y confiable** — la sensación de un instrumento de
trabajo bien hecho, no de una app "bonita". Cada decisión visual se subordina a una
pregunta: *¿un técnico apurado, con mala luz, entiende esto en dos segundos?*

**Key Characteristics:**
- **Claridad sobre estilo.** Contraste alto, jerarquía obvia, cero ambigüedad.
- **Azul institucional como ancla** — transmite oficio y confianza, no tendencia.
- **Feedback de estado honesto** — offline, éxito, error y advertencia siempre visibles con color semántico.
- **Mobile-first, wizard-driven** — el técnico avanza por pasos; el admin gestiona en listas densas.
- **Densidad media** (`VISUAL_DENSITY: 5`) — información suficiente por pantalla sin saturar el pulgar.

---

## 2. Color Palette & Roles

### Primary Foundation
- **Azul Institucional** (`#1B3A6B`) — Color de marca y acción primaria. Topbar, botones primarios, foco. Ancla toda la app; transmite confianza sin caer en modas.
- **Azul Medio** (`#2D5AA0`) — `theme_color` del PWA y segundo tono de marca. Usado en degradados de marca y acentos.

### Accent & Interactive
- **Verde Éxito** (`#27A06B`) — Confirmaciones, estados completados (`foto-box.filled`, firma confirmada), botón de acción positiva.
- **Verde WhatsApp** (`#25D366`) — **Reservado exclusivamente** para el botón "Enviar por WhatsApp". No usar para nada más.
- **Naranja Advertencia** (`#EF9F27`) — Estados pausados, offline, atención requerida.

### Typography & Text Hierarchy
- **Tinta Profunda** (`#1A2035`) — Texto primario. (No es negro puro — tintado hacia el azul de marca.)
- **Gris Pizarra** (`#5A6478`) — Texto secundario, labels de campo.
- **Gris Neblina** (`#9AA3B2`) — Texto terciario, metadatos, placeholders.
- **Gris Borde** (`#C8D0E0`) — Bordes de inputs sin foco, dividers, dashed de foto-box.

### Surfaces
- **Fondo App** (`#F4F6FB`) — Fondo general (blanco tintado hacia azul).
- **Blanco Card** (`#FFFFFF`) — Superficie de cards, inputs, `background_color` del PWA.
- **Gris Superficie 1** (`#F8F9FC`) — Superficies sutilmente elevadas / resúmenes.
- **Gris Superficie 2** (`#EEF1F7`) — Botones secundarios, bordes suaves, fondos de estado neutro.

### Functional States
- **Success:** Verde Éxito (`#27A06B`)
- **Error:** Rojo (`#E53E3E`)
- **Warning:** Naranja Advertencia (`#EF9F27`)
- **Info:** Azul Institucional (`#1B3A6B`)

> **Regla:** Neutrales tintados hacia el azul de marca (ya cumplido). NO usar negro puro
> (`#000`) ni blanco puro en texto. Los fondos de estado seleccionado (ej. `#EEF2FA` en
> `tipo-card.selected`, `#F0FAF5` en `foto-box.filled`) deben **derivarse** de su color de
> marca con `color-mix(in oklch, var(--azul) 8%, white)` en vez de hardcodearse.

---

## 3. Typography Rules

**Primary Font:** DM Sans — geométrica, humanista, altamente legible a tamaños pequeños en
pantalla móvil. Pesos disponibles: 400 / 500 / 600.

**Numeric/Code Font:** DM Mono (400 / 500) — **uso restringido** a datos que se benefician
de alineación tabular: números de OT, CECO, badges de código, montos de cotización,
**teclado numérico del PIN** y **cronómetro de la nota de voz** (2026-07-09: el código ya los
usaba y el documento no los contemplaba; son numéricos tabulares, así que la regla se amplía).
**Prohibido** en métricas de dashboard o texto general (ver Anti-Slop §7).

### Hierarchy & Weights (escala canónica)
- **Título de Pantalla (H1):** DM Sans 700 · 22px · el elemento dominante de cada pantalla
- **Section Headers (H2):** DM Sans 600 · 16px
- **Subsección / Card title (H3):** DM Sans 600 · 15px
- **Body:** DM Sans 400 · 15px · line-height 1.5
- **Small / Meta:** DM Sans 500 · 12px
- **Micro / Badge:** DM Sans 500 · 11px
- **CTA Buttons:** DM Sans 600 · 15px

> **✅ Estructura corregida (2026-07-09):** el título del topbar es ahora `<h1>` (antes `<h2>`, y el
> documento no tenía **ningún** `h1`). Sigue a **15px** y eso es correcto: el topbar **es** el título
> de la pantalla. La regla anterior pedía además *"un título de contenido a 22px"* — **se descarta**:
> sería un segundo título repitiendo la misma palabra, el anti-patrón "headers redundantes". La
> jerarquía la dan la posición y la barra azul, no el tamaño.
>
> **⚠ Deriva viva:** 15 tamaños distintos en 335 declaraciones (7 roles arriba → **5 tamaños
> distintos**: 11/12/15/16/22). Los 3 más usados (13/12/11px) son 228 declaraciones. **Vigilada por
> `check-tokens.js`**, que la reporta sin fallar: se migra por pantalla, no de una vez.

### Spacing Principles
- Labels de campo: `text-transform: uppercase` + `letter-spacing: 0.5px` (ya en uso, mantener).
- Line-height body 1.5; headings 1.2.
- Sin `letter-spacing` en body ni botones.

---

## 4. Component Stylings

### Radius Scale (canónica — 4 valores, sin excepciones)
- `--radio-sm: 8px` — inputs, botones pequeños, badges, chips
- `--radio: 14px` — botones, cards, contenedores estándar
- `--radio-lg: 18px` — cards destacadas (ej. orden pausada), superficies grandes
- `--radio-pill: 99px` — pills / tags redondeados
- `50%` — solo para elementos circulares (avatares, dots, checks)

> **✅ Normalizado de verdad (2026-07-09) · vigilado por `check-tokens.js`:** los **187** radios
> pasan por `var(--radio*)`. **0 literales** (salvo `50%`, que es geometría, no marca).
>
> La versión anterior de esta nota decía *"✅ Normalizado"* desde el 2026-07-08 y era **medio
> cierta**: los *valores* habían colapsado a 4, pero había **163 `border-radius` hardcodeados**
> contra 20 vía token, y `--radio-lg` / `--radio-pill` no los usaba **nadie**. La capa de
> abstracción existía y no abstraía nada. *Si una fila no tiene un script que la verifique, asume
> que está desactualizada* — otra vez.

### Buttons
- **Shape:** Esquinas redondeadas medias (14px); variante `btn-sm` a 8px.
- **Primary CTA:** Azul Institucional (`#1B3A6B`) + texto blanco + padding 14px + full-width.
- **Verde (acción positiva):** Verde Éxito (`#27A06B`) + texto blanco.
- **Secondary:** Gris Superficie 2 (`#EEF1F7`) + Tinta Profunda.
- **WhatsApp:** Verde WhatsApp (`#25D366`) + texto blanco (solo compartir OT).
- **Press feedback:** `transform: scale(0.98)` en `:active` (ya en uso).
- **Hover:** Solo bajo `@media (hover: hover)` — elevación sutil (`translateY(-2px)`) + `--sombra-hover`. **NUNCA glows saturados** (`rgba(...,0.5)`). Debe vivir en clases CSS, no en handlers `onmouseover` inline.
- **Regla de jerarquía:** máximo **un** botón primario por pantalla. Todo lo demás secundario, ghost o text-link.

### Cards & Containers
- **Corners:** 14px estándar (`--radio`), 18px para destacadas.
- **Background:** Blanco (`#FFFFFF`); resúmenes sobre Gris Superficie 1.
- **Shadow:** Susurro difuso tintado hacia azul — `--sombra: 0 2px 12px rgba(27,58,107,0.10)`; elevada `--sombra-lg: 0 8px 32px rgba(27,58,107,0.16)`.
- **No anidar cards dentro de cards.** Aplanar la jerarquía.

### Inputs & Forms
- **Stroke:** borde 1.5px Gris Borde (`#C8D0E0`).
- **Background:** Blanco.
- **Focus:** borde Azul Institucional, sin glow.
- **Label:** 12px, uppercase, letter-spacing 0.5px, Gris Pizarra.
- **Error:** borde Rojo + mensaje debajo (no solo color, para daltónicos).
- **Rechazo de validación:** nunca solo un toast. Usar `_rechazar(msg, idCampo)` — hace scroll al
  campo, le pone `.campo-error` (halo rojo) y lo limpia al tocarlo. Un toast dice *qué* faltó; no
  dice *dónde*.
- **Campos numéricos:** `type="text" inputmode="numeric"`, **nunca `type="number"`** cuando importe
  la longitud: `maxlength` **no aplica** a `type="number"` (spec HTML) y el navegador lo ignora en
  silencio.
- **PIN:** exactamente **4 dígitos**, `/^\d{4}$/`, validado en el formulario que lo escribe **y** en
  el teclado que lo lee. Nunca "al menos 4".

> **Regla:** si un formulario escribe un dato y otra pantalla lo lee, **ambos comparten la regla de
> validación**. El bug del PIN existió porque el escritor aceptaba lo que el lector no podía leer.

### Iconografía
- **Set único de iconos SVG inline** (recomendado: Phosphor o Lucide) que heredan `currentColor`.
- **⚠ Deriva actual:** hay cientos de emojis usados como iconos (`tipo-card .icon`, botones `✓ ▶ → +`, `local-icon`). Renderizan distinto por SO/dispositivo y no se tiñen con la marca. Migrar a SVG — es **crítico** para una herramienta de campo B2B.

### Estados de Progreso
- **Step indicator:** dots de 8px que crecen a 24px en activo (Azul) y verde en completado. Patrón excelente — mantener.
- **Offline bar:** franja ámbar con dot pulsante. Patrón de estado honesto — mantener.

---

## 5. Layout Principles

### Grid & Structure
- **Contexto primario:** móvil en modo `portrait` (definido en manifest). Layout de columna única.
- **Contexto admin:** escritorio — listas densas con filtros.
- **Screens:** `min-height: 100dvh` (no `100vh` — evita que la barra del navegador móvil corte contenido).

### Whitespace Strategy
- **Escala de espaciado (base 8, múltiplos):** `4 · 6 · 8 · 10 · 12 · 14 · 16 · 20 · 24px`.
- **Gap estándar entre elementos:** 8px (tight), 16px (secciones).
- **Edge padding:** 16px horizontal, 20px vertical (`.content`).

### Alignment
- **Texto:** left-aligned por defecto. Centrado solo para estados vacíos, confirmaciones y el step-indicator.
- **Touch targets** (*incertidumbre resuelta el 2026-07-09: Pedro confirmó que los técnicos **no usan guantes** al operar la app*):
  - **44×44px** en el flujo del técnico — pulgar, una sola mano (WCAG 2.5.5 / Apple HIG).
  - **32×32px** en los controles densos del admin, que se usan con mouse.
  - **24×24px es el piso absoluto.** WCAG 2.2 SC 2.5.8, nivel **AA**. Ningún botón puede bajar de ahí.
  > La versión anterior de esta regla decía 48px "dimensionado para el peor caso: guantes + sol directo". Se dimensionó para una hipótesis que resultó falsa — y el código nunca la cumplió igual: `.btn-sm` medía **37px** (e incluye "Confirmar firma") y varios botones del admin, **22-30px**. Una regla que nadie verifica no protege a nadie.

---

## 6. Motion & Animation

`MOTION_INTENSITY: 4` — motion funcional y sobrio, al servicio del feedback, no de la decoración.

### Philosophy
El motion confirma acciones (tap, cambio de estado, avance de paso) y nada más. Una herramienta
de campo debe sentirse **rápida y sólida**, no juguetona. Sin reveals coreografiados.

### Timing & Easing
- **Micro-interactions (tap, foco):** 150ms
- **Transiciones de estado (cards, pasos):** 200-250ms
- **Easing estándar:** `cubic-bezier(0.4, 0, 0.2, 1)` (ya el easing dominante — canonizarlo como `--ease`).

### Rules
- Solo animar `transform` y `opacity` (60fps). No animar `width/height/padding/margin`.
- Respetar `prefers-reduced-motion: reduce` → desactivar transiciones no esenciales.
- **Sin bounce ni elastic easing.**
- La `pulse` de la offline-dot es la única animación en loop permitida (comunica estado).

---

## 7. Anti-AI-Slop Markers

### Patrones Prohibidos (específicos de EMVAL)
- [ ] NO emojis como iconos — set SVG único que hereda `currentColor`.
- [ ] NO monospace (DM Mono) en métricas ni texto general — solo en números de OT/CECO/montos.
- [ ] NO el template hero-metric: 4 stat-cards idénticas centradas con número gigante. Diferenciar por peso (una métrica principal + apoyo).
- [ ] NO gradientes decorativos gratuitos. Los degradados se **reservan a superficies que significan estado** (ej. card de orden pausada = ámbar). Fondo sólido tintado por defecto.
- [ ] NO glows de hover saturados (`rgba(...,0.5)`). Sombra sutil tokenizada.
- [ ] NO `display:none` inline como loading state — usar skeleton/empty state real.
- [ ] NO handlers `onmouseover`/`onmouseout` inline — todo hover en CSS bajo `@media (hover: hover)`.

### El Test
> Si le mostraras esta interfaz a alguien y dijeras "la hizo una IA", ¿te creerían
> inmediatamente? El objetivo de EMVAL es que un técnico piense "esto es una herramienta
> seria de mi empresa", no "esto es una demo genérica".

### Diferenciador Visual
El **azul institucional profundo** aplicado con disciplina + el **wizard de OT con
step-indicator que crece** + el **feedback de estado siempre honesto** (offline, foto lista,
firma confirmada). El usuario recuerda que la app *nunca lo deja con dudas sobre qué pasó*.

---

## 8. Design System Notes for Generation

### Lenguaje Descriptivo
- **Atmósfera:** "Instrumento de trabajo de campo — sólido, claro, confiable. Un técnico apurado lo entiende en dos segundos."
- **Buttons:** "Rectángulos de esquinas medias, full-width, color de marca sólido; presión que hunde levemente el botón."
- **Shadows:** "Susurro difuso tintado hacia el azul de marca — presente pero nunca dramático."
- **Spacing:** "Ritmo cómodo de base 8; agrupaciones apretadas dentro de una card, separaciones generosas entre secciones."

### Color References
- Primary CTA: "Azul Institucional (#1B3A6B)"
- Positive action: "Verde Éxito (#27A06B)"
- Background: "Fondo App tintado (#F4F6FB)"
- Surface: "Blanco Card (#FFFFFF)"
- Text: "Tinta Profunda (#1A2035)"

### Component Prompts
- **Botón:** "Botón full-width, esquinas de 14px, fondo azul institucional sólido, texto blanco 600, padding 14px; hover con elevación sutil solo en desktop."
- **Card:** "Card blanca de esquinas 14px, sombra susurro tintada de azul, padding 14px, sin bordes; nunca anidar cards."
- **Navegación:** "Topbar azul institucional sticky, botón de retroceso 32px translúcido, título 15px, badge de OT en monospace."
- **Input:** "Campo blanco, borde 1.5px gris, esquinas 8px; foco cambia el borde a azul sin glow; label uppercase 12px encima."

---

## Deuda de Diseño Pendiente (post-crítica 2026-07-08)

| Estado | Prioridad | Issue | Comando |
|--------|-----------|-------|---------|
| ✅ Hecho | 🔴 Alta | Colapsar 8+ radios a la escala de 4 tokens | `/normalize` |
| ✅ Hecho | 🟢 Baja | `100vh` → `100dvh` | `/polish` |
| ✅ Hecho | 🟢 Baja | `prefers-reduced-motion` + tokens `--ease`/`--sombra-hover` | `/polish` |
| ✅ Hecho | 🔴 Alta | Migrar emojis → set SVG único · **vigilado por `check-emojis.js`** | `/normalize` |
| ✅ Hecho | 🟡 Media | Hover-glows inline → clases CSS `@media (hover: hover)` (0 handlers inline) | `/polish` |
| ✅ Hecho | 🔴 Alta | Contraste WCAG AA · **vigilado por `check-contraste.js`** | `/normalize` |
| ✅ Hecho | 🔴 Alta | Objetivos táctiles (44/32px) y foco de teclado (`:focus-visible`) | `/polish` |
| ✅ Hecho | 🟡 Media | Stat-cards: romper el template hero-metric | `/polish` |
| ✅ Hecho | 🔴 Alta | PIN de exactamente 4 dígitos · fallback de login **falla cerrado** | bug |
| ✅ Hecho | 🔴 Alta | Validación que apunta al campo (`_rechazar`) + `toast` con `aria-live` | `/polish` |
| ✅ Hecho | 🟡 Media | Radios → tokens (187, 0 literales) · **vigilado por `check-tokens.js`** | `/normalize` |
| ✅ Hecho | 🟡 Media | Estructura de encabezados: 16 `h2` de topbar → `h1` | `/normalize` |
| ✅ Hecho | 🟡 Media | `aria-label` en los 18 botones sin nombre accesible | `/polish` |
| ⏳ Pendiente | 🟡 Media | **Escala tipográfica**: 15 tamaños en 335 declaraciones → 5 · **medida por `check-tokens.js`** | `/normalize` |
| ⏳ Pendiente | 🟡 Media | **Modales in-app**: 19 diálogos nativos (`confirm`×11, `prompt`×6, `alert`×2) | feature |
| ⏳ Pendiente | 🟢 Baja | Skeleton real de carga en stat-cards | `/polish` |
| ⏳ Pendiente | 🟢 Baja | Colores de estado seleccionado con `color-mix` | `/polish` |

> **Esta tabla estuvo mintiendo durante días**: marcaba como ⏳ Pendiente la migración de emojis y los hover-glows, que llevaban hecho una semana. El source of truth no sabía su propio estado. Si una fila no tiene un script que la verifique, **asume que está desactualizada**.

> **Los pendientes requieren verificación visual en navegador** (tocan tamaños de texto,
> iconos y estados de hover en cientos de sitios). Deben ejecutarse con la app corriendo
> para validar cada cambio, no a ciegas sobre un archivo de producción.

### Pasada `/polish` sobre pantalla de login (2026-07-08)

Post-crítica con render real. Aplicado:
- ✅ **`.content` contenida** a `max-width: 640px` centrada — arregla el estiramiento full-width en desktop.
- ✅ **Contraste del rol** `--texto3` → `--texto2` (cumple WCAG AA).
- ✅ **Color de avatar por rol**: técnicos comparten verde (`#27A06B`), admin azul, supervisor navy. El hash aleatorio `_colorPorNombre` queda solo como fallback.
- ✅ **Ortografía de display** ("Técnico en terreno", "Órdenes") vía helper `_cargoLabel` — **sin tocar el valor de datos** `'Tecnico en terreno'` que sigue siendo la key en Firestore.
- ✅ **Chevron `›` de affordance** en filas clickeables: se corrigió un bug sistémico (`createElement('svg')` no renderiza SVG → 7 sitios) migrando a `div.usuario-arrow` con SVG inline `currentColor`.
- ✅ **Hover** en `.usuario-item` bajo `@media (hover: hover)` con `--sombra-hover`.

> **Nota:** el `max-width: 640px` también contiene las pantallas de admin (tablas densas). Verificar
> que no introduzca scroll horizontal incómodo; si el admin necesita más ancho, es el "layout aparte"
> mencionado en §5, no este.

### Pasada `/polish` sobre stat-cards del panel supervisor (2026-07-08)

- ✅ **Rota la plantilla hero-metric**: de 4 cards idénticas centradas a jerarquía de 3 — una **primaria full-width** ("OTs totales", número 40px) + dos de apoyo ("Correctivos", "Preventivos"). Left-aligned (§5).
- ✅ **`.stat-num` deja el monospace** (DM Mono → DM Sans) — anti-slop §7: mono solo para códigos/OT, no métricas.
- ✅ **`.stat-label`** contraste `--texto3` → `--texto2`.
- 🐛 **Métricas falsas eliminadas** (corrección de datos, no cosmético): "Esta semana" mostraba un `3` hardcodeado que la JS **nunca actualizaba**, y "OTs este mes" mostraba el total real (`snap.size`), no el mes. Se quitaron ambas etiquetas engañosas; los índices de `statNums[]` se recablearon a `[0][1][2]`.

> **Feature pendiente (no polish):** si el supervisor quiere métricas temporales reales ("este mes",
> "esta semana"), requiere un campo de fecha confiable en las OTs + lógica de rango. Es una feature,
> no un ajuste visual — no se implementó a ciegas.

### Pasada `/normalize` + `/polish` sobre el flujo del técnico (2026-07-08)

- ✅ **Botones a sólido** (decisión de marca: sólido, no gradiente). Los 7 botones del flujo (fotos-antes, ejecución) pasaron de gradiente inline + hover duplicado a clases `.btn-primary/.btn-verde/.btn-secondary`. Jerarquía: acción positiva verde sólido, secundarias (Agregar foto, Limpiar, Pausar, Ver antes) en gris.
- ✅ **`.btn:hover` tokenizado** bajo `@media (hover: hover)` con `--sombra-hover`. Eliminados los `onmouseover`/`onmouseout` inline: de ~10+ a **1** en todo el archivo; `linear-gradient` de 15 a **6** (los restantes son superficies de estado legítimas, ej. card de orden pausada).
- 🐛 **13 placeholders rotos corregidos** — un tool había convertido emojis en texto literal: `[mic]`→`●`, `[stop]`→`■`, `[ok]`→`✓`. Se veían literalmente en firma, notas de voz, toasts y mensajes de WhatsApp.
- ✅ **Ortografía visible**: "COMPARACIÓN/DESPUÉS", "Fotografía", "Pídele", "se envía automáticamente", "Facturación".

> **Pendiente:** queda **1** botón con `onmouseover` inline fuera del flujo y botones con gradiente en
> otras pantallas (admin, cotización, cadenas). Mismo patrón, se limpian en una pasada futura con QA visual.
> La migración emoji→SVG (📷 🔧 ⚠️ ⏸ etc.) sigue pendiente como su propio trabajo.

### Pasada `/normalize` + `/polish` sobre el mundo del admin (2026-07-08)

- 🐛 **3 tokens fantasma corregidos** (bug de affordance, no cosmético). Barrido `var(--x)` vs `:root`:
  - `var(--gris)` ×12 → `var(--gris2)` — bordes de inputs de búsqueda/filtro que no renderizaban (token inexistente invalidaba el shorthand `border`).
  - `var(--gris-claro)` ×2 → `var(--gris1)` — fondo de paneles de filtro.
  - `var(--texto1)` ×1 → `var(--texto)` — color de nombre de servicio.
- ✅ **Tabs admin → segmented-control con clases** `.seg-tabs`/`.seg-tab`/`.seg-tab.active` + `:focus-visible` (navegable por teclado). `adminTab()` ahora togglea clase, no estilo inline.
- ✅ **Emoji 🔍 quitado** de 5 placeholders de búsqueda.
- ✅ **Último `onmouseover` eliminado** (toggle de pausadas). **Hito: 0 handlers de hover inline en toda la app.**
- ✅ Ortografía: "PIN (4 números)".

> **Aprendizaje:** los tokens fantasma son deuda invisible — "casi funciona" oculta el bug. Un barrido
> `var(--x)` vs `:root` debería correrse periódicamente (o en un hook pre-commit).

### Nota de robustez — el manejo de errores es INTENCIONAL (no tocar) (2026-07-08)

Una auditoría de estados/errores marcó como bugs varios `catch` "silenciosos". **Falso positivo — verificado leyendo el código.** El patrón es deliberado y correcto:
- **`cerrarOT` → `guardarEnFirebase`** hace **write-ahead a IndexedDB ANTES de tocar la nube** (escritura idempotente por `clientId`, timeout contra el SDK colgado). La OT terminada **no se pierde jamás**; se encola y sincroniza sola. Por eso navegar a "Servicio completado" tras el guardado es correcto.
- El `catch(e){}` vacío en `cerrarOT` (localStorage) es solo **caché de display best-effort** — no el guardado. **No agregar un toast ahí** (sería falsa alarma).
- `procesarFoto` y `guardarCotizacion` **sí** avisan al usuario en fallo (toast tras el `catch`); el `console.*` es logging adicional.

> **Lección:** contar "catches que solo hacen `console.*`" NO es un proxy válido de "falla silenciosa".
> En esta app los catches silenciosos son best-effort legítimos (caché, compresión con fallback, PDF en
> background). Verificar la ruta real antes de "arreglar".

### Pasada tras QA visual del flujo del técnico (2026-07-08)

Con screenshots reales del flujo correctivo. Aplicado:
- ✅ **Ortografía "Después"** en etiquetas visibles (foto-box "Después N", label comparación "DESPUÉS"). **Sin tocar** el identificador de datos `fotosDespues` ni el key `'despues'` — solo display.
- ✅ **Tipo-cards emoji→SVG**: 🔧→llave (SVG `var(--azul)`, preventivo=programado), ⚠️→triángulo (SVG `var(--naranja)`, correctivo=emergencia). Color semántico (§8).

**Migración emoji→SVG — clasificación para el trabajo restante:** los emojis del flujo (📷 🖼️ ⏸ ▶) se dividen en dos contextos, y la distinción es CRÍTICA:
- **Markup estático / `innerHTML`** → seguro inyectar SVG directo. Ej: botones "Agregar foto", "Pausar", "Hacer otra OT".
- **`textContent`** → un SVG se vería como **texto literal** (el bug `[mic]`). Requiere convertir `textContent`→`innerHTML` primero. Sitios: action-sheet ("📷 Tomar foto", "🖼️ Elegir de galería"), badges/botones dinámicos de OT pausada ("⏸ En Pausa", "▶ Continuar OT").

> **Regla:** nunca reemplazar un emoji por SVG sin verificar si el sitio usa `textContent` o `innerHTML`.

**Migración completada (flujo del técnico):** 📷→cámara, 🖼️→imagen, ⏸→pausa, ▶→play, 🔧→llave, ⚠️→triángulo.
- Iconos **inline** (botones, spans, action-sheet, badges dinámicos): SVG `width="1em"` + `currentColor` → se tiñen con el contexto y escalan con la fuente.
- Iconos **badge** (ot-icon 44px, link preventivos): SVG 22px con color propio (correctivo=`#D97706`, preventivo=`#1E8052`, link verde=blanco).
- 6 sitios `textContent` convertidos a `innerHTML` (action-sheet, badges/botones de OT pausada) — verificado que ningún SVG quedó dentro de un `textContent`.

**Cierre de la migración (2026-07-08):** ✅ y ⏳ también migrados.
- `✅` del success-hero (cierre) → **check SVG blanco** 32px.
- `✅` en toasts (`textContent`) → **`✓` tipográfico** (ya usado 15× en la app; seguro en texto, no requiere SVG).
- `⏳` ("En espera", barra de pendientes) → **reloj SVG** inline; el badge de 'En espera' se convirtió `textContent`→`innerHTML`.

**Resultado: 0 emojis a color en el flujo del técnico.** Los símbolos tipográficos ✓ → ← ✕ se **conservan** (monocromos, renderizan igual en todo dispositivo).

### Pasada sobre el mundo del admin — QA visual desktop (2026-07-09)

Con screenshots del panel supervisor/admin en desktop. Aplicado:
- ✅ **Ortografía**: "+ Cotización", "+ Generar cotización", "Técnico" (resumen cot + lista personal), "Editar técnico", "eliminar este técnico". La lista de personal y el detalle de OTs por técnico ahora usan `_cargoLabel` (display), sin tocar el dato `'Tecnico en terreno'`.
- ✅ **Emojis admin → SVG**: 🔒 candado, ✏️ lápiz, 🗑 papelera, 👤 persona, ↔ flechas. 5 sitios `textContent` convertidos a `innerHTML`. **0 emojis a color en toda la app** (flujo + admin).
- ✅ **Color de avatar estable por nombre** (APROBADO por el cliente): se quitó el verde-por-rol de los técnicos; ahora cada técnico tiene su **color propio (hash por nombre), igual en login Y en "OTs por técnico"**. Admin/Supervisor siguen fijos (azul). **Decisión de negocio**: Pedro (cliente/admin) pidió explícitamente que cada técnico tenga su color propio — NO revertir al verde uniforme.
- 🟡 **Layout desktop (parcial)**: las pantallas de lista/dashboard (supervisor, OTs por técnico, preventivos, carpetas, ventas, facturación) ahora usan hasta **980px** en desktop. Las **form-heavy** (s-admin, s-cotizacion) quedan en 640px.

> **Pendiente (feature, no polish):**
> 1. **Layout 2-columnas del admin** — el ensanche solo reduce el margen; el fix real es grid de 2 columnas en las listas + formularios contenidos + tabla de sucursales ancha. Requiere iteración por pantalla con QA visual. `s-admin` (145 sucursales) es el que más lo necesita.
> 2. **Modales in-app para acciones destructivas** — hoy borrar personal usa `confirm()`/`prompt()` nativos (imposibles de estilar). Reemplazar por modal on-brand. Toca lógica destructiva → pasada dedicada con testing.

### Pasada layout desktop del admin + robustez de pausadas (2026-07-09)

Con las respuestas de Pedro (usa **monitor + laptop + teléfono**) y su análisis del botón "Actualizar".

**Layout responsivo — utility `.card-grid`:**
- Nueva clase `.card-grid` = `grid` con `repeat(auto-fill, minmax(min(340px, 100%), 1fr))`. Colapsa sola: **1 columna en teléfono, 2+ en laptop/monitor**. El `min(340px, 100%)` evita scroll horizontal en móvil (requisito §5). Sin media queries.
- Aplicada a las **listas de cards planas**: personal (`#lista-tecnicos-admin`), pausadas (`#sup-pausadas-lista`) y OTs de hoy del supervisor (nuevo wrapper `#sup-ots-hoy-lista`). El `margin-bottom` de las cards se neutraliza dentro del grid (el `gap` maneja el espaciado).
- **Cadenas se quedan en 1 columna a propósito**: son acordeones con hasta 145 sucursales al expandir; en grid de 2-col, expandir una desbalancearía las columnas. Solo se benefician del contenedor más ancho.

**`s-admin` sale de los 640px:**
- `#s-admin .content` ahora llega a **980px** (antes atrapado en 640 → columna flaca en un mar de blanco).
- Pero los **controles se contienen**: formularios (`#form-tecnico`/`#form-cadena`) y buscadores a `max-width: 480px`; botones "+ Agregar" a `width: auto`. La distinción del critique: *el form angosto, la lista ancha.* Corrige la nota previa que dejaba s-admin en 640 "por form-heavy" — conflacía form con lista.

**Componente `.top-action` (topbar):**
- Los botones hechos a mano de la topbar ("Salir", "Descargar Excel" ×2) pasaron de `style="..."` inline a la clase `.top-action` (+ variante `.top-action-verde`). Un solo lugar define el look de las acciones de topbar. (No usan `.btn` porque esa clase es full-width para CTAs de formulario; la topbar necesita acción compacta — contexto distinto.)

**Migración emoji — cierre real:**
- Sobrevivían **2 `🔄`** (firma "Limpiar", refresh de pausadas) que contradecían el claim "0 emojis". El de firma → **SVG rotar** (`currentColor`); el de pausadas se fue con el botón. **Ahora sí: 0 emojis a color en toda la app.**

**Botón "Actualizar" pausadas: eliminado + los 2 bugs que tapaba (corrección de datos, no cosmética):**
La lista de pausadas es en vivo (`onSnapshot`) — un botón de refresh manual comunicaba lo contrario ("esta lista puede estar vieja"), rompiendo el principio de *estado honesto*. Se eliminó. Pero antes tapaba dos huecos reales, ahora arreglados:
1. **Firebase no listo → lista muerta para siempre.** `cargarPausadasSupervisor` hacía `if (!window._firebaseReady) return;` sin reintento. Ahora `setTimeout(cargarPausadasSupervisor, 800)` — espeja el patrón que ya usaba `cargarOTsSupervisor`.
2. **Listener falla en silencio.** El callback de error solo hacía `console.error` → una lista congelada se veía idéntica a "sin pausadas" (el tipo de "trabajo que desaparece" que venimos cazando). Ahora `_mostrarErrorPausadasSup` muestra un estado honesto ("No se pudo cargar la lista en vivo") con botón **Reintentar** — que solo aparece cuando hay error real, no permanentemente.
- De paso: el fallback stale `var(--gris3, #D0D5DD)` (no coincidía con el token real `#C8D0E0`) se fue con el botón.

**Estado de los pendientes:**
- ✅ **#1 Layout 2-columnas del admin** — hecho (grid responsivo en las 3 listas planas + s-admin ancho con controles contenidos). Falta solo QA visual fino en localhost con Pedro (¿2 o 3 columnas en su monitor grande? hoy 2 por el cap de 980px).
- ⏳ **#2 Modales in-app** para `confirm()`/`prompt()` destructivos — sigue pendiente (pasada dedicada con testing).

### Fixes post-crítica del layout (2026-07-09)

Auditoría del grid recién construido. Corregido:
- 🐛 **Regresión del propio grid**: los estados vacíos y de error caían dentro de `.card-grid` y se encogían a **una sola columna** — el texto "No hay OTs registradas hoy" quedaba centrado en la mitad izquierda, y la card de error de pausadas se veía a media pantalla (el estado que existe para dar confianza transmitía descuido). Nueva regla `.card-grid > p, .card-grid > .grid-full { grid-column: 1 / -1; }` — el mismo patrón que ya usaba `.stat-card-primary`.
- ✅ Ortografía: "**Aún** no hay OTs registradas".
- ✅ Selector `#s-admin #panel-cadenas > .btn-primary` (hijo directo). Antes, sin el `>`, también alcanzaba el botón "Guardar" del formulario. El botón "+ Agregar cadena" se desenvolvió de su `div` para que el selector quede simétrico con el de personal.
- ✅ Borradas 3 `.ot-card` demo muertas (`display:none` **y** eliminadas por JS al cargar) dentro de `#sup-ots-hoy-lista`.
- ✅ El badge de conteo de pausadas ya **no inventa un `!`** en estado de error: se oculta, y reaparece con el conteo real al recuperarse.

**Deuda abierta — contraste del verde (NO arreglado, decisión de marca pendiente con Pedro):**
Texto blanco sobre `--verde` (`#27A06B`) da **≈3.3:1**. WCAG AA pide **4.5:1** para texto normal. Afecta `.btn-verde` ("Confirmar firma", "Ventas") y `.top-action-verde` ("Descargar Excel"). Es el peor caso que §1 manda optimizar: técnico con sol directo, en la acción más irreversible del flujo.
- **Recomendación**: conservar `--verde` como color de *estado* (relleno sin texto encima — `foto-box.filled`, hero de éxito) y agregar **`--verde-btn: #1E8052`** (ya está en la paleta: es el trazo del ícono de preventivo) para botones con texto blanco → **≈4.9:1, pasa AA**. Dos verdes con semántica distinta (*estado* vs *acción*), no un color arbitrario de más.

**Nota sobre el Service Worker (corrige una creencia equivocada):**
`sw.js` sirve las navegaciones **network-first** (`sw.js:37-48`): un reload online siempre trae el `index.html` fresco de la red y lo re-cachea. Por lo tanto los bumps de `CACHE_NAME` (`v14 → v15 → v16`) **no son lo que propaga** `index.html` a los usuarios online — sirven para purgar cachés viejos. No hace falta bumpear la versión para que un cambio de HTML llegue.

### Estado honesto de la cola de correos (2026-07-09)

Continuación de `d915a6b`. La app promete *"nunca te deja con dudas sobre qué pasó"* (§7). La cola de correos todavía incumplía esa promesa en cuatro puntos.

**1. Ya no se pierde ningún aviso en silencio.**
- Antes: tras **20 intentos**, el correo se **borraba** con un `console.warn`. Nadie se enteraba jamás.
- Ahora la ventana es de **tiempo (7 días), no de intentos** — con señal intermitente, 20 intentos se quemaban en minutos y el aviso moría.
- **Invariante nueva:** `sincronizarCorreosPendientes` **nunca elimina un ítem**. O se envía, o sigue pendiente, o queda marcado `fallido` esperando reintento manual.

**2. Barra persistente `#correos-bar`** (mismo patrón que `#pending-bar`).
- Un toast se desvanece en 3 s; una barra no. Muestra `N aviso(s) pendiente(s)` en ámbar, o `N aviso(s) no se enviaron` en **rojo** si alguno agotó su ventana. Tap → `reintentarCorreosAhora()`, que le da otra ventana de 7 días.
- Se apila en `bottom: 116px` si la barra de OTs pendientes también está visible; si no, ocupa los `70px` habituales. Se oculta sin señal (ahí manda `#offline-bar`).

**3. Un solo punto de envío — de verdad.**
- El comentario decía *"único punto de envío"* pero había **tres**: `_enviarCorreo`, la cola de reintento, y `enviarEmailAdmin` — cada uno con el `service_id`/`template_id` de EmailJS **duplicado**.
- Ahora todo pasa por **`_emailjsSend(params)`**, la única función que conoce esos ids.
- `enviarEmailAdmin` era **código muerto** (definido, nunca llamado ni desde HTML) y además logueaba direcciones de correo a consola → **borrado**.
- Las cotizaciones usan otro service/template vía `window.EMAILJS_COT_*`; quedan aparte a propósito.

**4. El aviso a Pedro ahora dice la verdad.**
- `_notificarOTCompletada` descartaba el valor de retorno de `_enviarCorreo`: se encolaba, pero nadie lo decía. Ahora es `async`, espera el resultado y avisa — *"Aviso a administración pendiente — se enviará solo al recuperar la señal."* Mismo trato honesto que ya tenía el correo a la sucursal.

**🐛 Bug encontrado de paso — la barra de OTs pendientes quedaba rota tras sincronizar.**
`sincronizarOTsPendientes` hacía `pendingBar.textContent = 'Sincronizando…'`, lo que **destruye el ícono SVG y el `<span id="pending-count">`**. En la siguiente actualización `pendingCount` era `null`, el `TypeError` se lo tragaba un `catch(e) {}` vacío, y la barra quedaba con texto viejo y sin contador **hasta recargar la app**. Se agregó `<span id="pending-label">` y ahora solo se cambia esa etiqueta.

> **Lección:** `textContent` sobre un contenedor con hijos es destructivo. Es el primo del bug `[mic]` (meter SVG dentro de un `textContent`): las dos caras del mismo malentendido.

### Dos verdes + contraste verificable (2026-07-09)

**Decisión aprobada: `--verde` se divide en dos, por semántica.**

| Token | Valor | Rol | Lleva texto encima |
|-------|-------|-----|--------------------|
| `--verde` | `#27A06B` | **Verde de ESTADO** — `foto-box.filled`, `step.done`, `success-hero`, íconos, bordes | No |
| `--verde-btn` | `#1E8052` | **Verde de ACCIÓN** — fondo de botones con texto blanco | Sí |

Blanco sobre `--verde` da **3.3:1** (falla AA). Sobre `--verde-btn`, **4.92:1** (pasa). El `#1E8052` no es un color nuevo: ya estaba en la paleta como trazo del ícono de preventivo.

Migrados 9 sitios con texto blanco: `.btn-verde`, `.top-action-verde`, el botón "Enviar" del modal de cotización, "Elegir de galería", "Agregar sucursal", "PDF", "Generar cotización", y el toggle Sí/No de servicios (que tenía `#27A06B` hardcodeado ×2). **No se tocó** ningún uso de `--verde` como relleno de estado ni como color de ícono.

**Nuevo: `check-contraste.js` — el contraste deja de ser una opinión.**

```
node check-contraste.js
```

Script sin dependencias (~90 líneas) que lee los tokens del `:root` de `index.html`, calcula el ratio WCAG 2.1 de los pares de color que la app usa de verdad, e imprime una tabla. Sale con código `1` si algún par de texto baja del mínimo AA. Existe porque el bug del verde **sobrevivió a cuatro críticas de diseño**: "se ve bien" no es un test.

**Resultado del primer run (2026-07-09): 12 pares · 5 fallos reales · 1 tolerado.**

| Par | Ratio | Estado |
|-----|-------|--------|
| Botón primario (blanco / `--azul`) | 11.27:1 | ✅ |
| **Botón verde de acción** (blanco / `--verde-btn`) | **4.92:1** | ✅ |
| Botón secundario (`--texto` / `--gris2`) | 14.26:1 | ✅ |
| Texto primario / secundario | 16.13:1 · 5.95:1 | ✅ |
| Ícono preventivo (gráfico, mín 3.0) | 4.92:1 | ✅ |
| Botón destructivo (blanco / `--rojo`) | 4.13:1 | ❌ |
| Barra offline / error (blanco / `--rojo`) | 4.13:1 | ❌ |
| Barra pendientes (blanco / `#D97706`) | 3.19:1 | ❌ |
| Verde como **texto** (`--verde` / blanco) | 3.32:1 | ❌ |
| Texto terciario (`--texto3` / blanco) | 2.54:1 | ❌ |
| Botón WhatsApp (blanco / `#25D366`) | 1.98:1 | ⚠️ tolerado |

> **`#25D366` es tolerado**: es el verde corporativo de WhatsApp, impuesto por un tercero. No es una decisión nuestra y cambiarlo rompería el reconocimiento del canal.

**Deuda abierta — 4 decisiones para Pedro (NO tocadas):**
1. **Rojo `--rojo` (#E53E3E) con blanco: 4.13:1.** Afecta botones "Eliminar" y la barra de offline/error. Un `#C7302F` lo llevaría sobre 4.5:1.
2. **Ámbar `#D97706` con blanco: 3.19:1.** Es la barra de pendientes y la de correos — justo el feedback de estado que la app promete que nunca falle. Texto oscuro sobre ámbar, o un ámbar más oscuro.
3. **`--verde` como color de texto: 3.32:1.** Montos, totales, "Firma: Sí". Probablemente deba usar `--verde-btn` también.
4. **`--texto3` (#9AA3B2) sobre blanco: 2.54:1.** El más grave. Es todo el texto de metadatos. Ya se corrigió en dos lugares puntuales (`--texto3` → `--texto2`); el token entero necesita oscurecerse o restringirse a decoración.

> Mientras existan estos 5 fallos, `check-contraste.js` sale con código 1 — **a propósito**. No se "arregla" el script bajando el estándar: se arreglan los colores, o se marcan como tolerados con una razón escrita.

### Sistema de color accesible: ESTADO vs ACCIÓN (2026-07-09)

Cerradas las 4 decisiones que quedaban abiertas arriba. El sistema tiene ahora **una regla**:

> **`X`** = color de **estado** → relleno, borde o ícono. **No lleva texto encima.**
> **`X-btn`** = color de **acción** → cualquier superficie que **lleva texto encima**.

| Token | Valor | Rol | Ratio |
|-------|-------|-----|-------|
| `--verde` | `#27A06B` | Estado: foto lista, paso completado, check, bordes | — |
| `--verde-btn` | `#1E8052` | Acción: botones, texto verde, hero de éxito | **4.92:1** |
| `--naranja` | `#EF9F27` | Estado: dot de offline, ícono de correctivo | — |
| `--naranja-btn` | `#B45309` | Acción: barras de pendientes/correos, badge EN PAUSA, Continuar/Editar OT | **5.02:1** |
| `--rojo` | `#D32F2F` (era `#E53E3E`) | Funcional: botones, errores, barra offline | **4.98:1** |
| `--texto3` | `#666F82` (era `#9AA3B2`) | Metadatos | **4.67:1** |

**Por qué así:**
- **`--rojo` no se parte en dos.** Todos sus usos son funcionales (botones, texto de error, barra offline); no existe una superficie roja de estado cuyo tono emocional haya que preservar. Se oscurece en el lugar.
- **`--texto3` era 2.35:1** sobre el fondo de la app — ilegible bajo sol directo, que es el peor caso que §1 manda optimizar. Se eligió el hex **más claro** que pasa AA sobre blanco, `--gris1` **y** `--fondo`. Medir solo contra blanco habría aprobado `#6B7488` (4.69 en blanco, pero **4.34 en `--fondo`**). *Por eso el script mide contra la superficie real, no contra blanco.*
- **`--naranja-btn` (#B45309) no es un color nuevo**: ya se usaba en los íconos de OT.
- Los **avatares de técnico** (`colores[]`, `COLORES_SUP`) conservan sus hexes: Pedro pidió color propio por técnico y el hash debe ser estable. Cambiarlos rompería la identidad visual de cada persona.

**Correcciones a decisiones previas (para que nadie las repita):**
- El comentario del token `--verde-btn` afirmaba que el hero de éxito *"no lleva texto encima"*. **Sí lleva.** El título (20px/700) pasa como *texto grande* (3.3:1 ≥ 3.0), pero el subtítulo de 13px con `opacity: 0.8` daba **~2.6:1**. El hero pasó a `--verde-btn` y el subtítulo perdió la `opacity`.
- **Sobre un fondo oscuro, el blanco puro es el máximo contraste posible.** No se puede "atenuar" un subtítulo con `opacity` y seguir pasando AA. La jerarquía la dan **tamaño y peso**, no la transparencia. Es el mismo principio que justificó oscurecer `--texto3`.

**Tolerados — fallan a propósito, con razón escrita en el script:**
1. **Botón WhatsApp** (`#25D366`, 1.98:1) — verde corporativo de un tercero. Cambiarlo rompería el reconocimiento del canal.
2. **Ícono correctivo** (`--naranja` sobre card blanca, 2.17:1) — decorativo: el label "Correctivo" debajo carga el significado. **Si alguna vez queda sin label, hay que oscurecerlo.**

**Estado actual:**

```
node check-contraste.js   →   17 pares · 0 fallos reales · 2 tolerados · exit 0
```

Ya se puede enganchar a un hook de pre-commit sin que rompa el flujo. La regla se mantiene: **no se baja el estándar para que el script pase** — se arregla el color, o se marca tolerado con una razón que alguien pueda discutir.

### QA visual del cierre de OT + cierre real de la iconografía (2026-07-09)

Con screenshots reales de la pantalla "Servicio completado" tras un correctivo.

**🐛 Etiquetas sobre foto: un fondo translúcido hereda el contraste de la foto.**
`ANTES` y `DESPUÉS` usaban `rgba(...,0.75)` encima de la fotografía del técnico:

| Etiqueta | Foto oscura | Foto clara |
|----------|-------------|------------|
| `ANTES` (azul .75) | 14.00:1 | 5.39:1 ✅ |
| `DESPUÉS` (verde .75) | 5.45:1 | **2.41:1** ❌ |

Con las fotos de prueba (oscuras) se veía perfecto. Sobre una pared blanca o un azulejo, la palabra "DESPUÉS" **desaparece**. Ahora son sólidas: `--azul` y `--verde-btn`, independientes del contenido.

> **Regla:** si el fondo de un texto es contenido del usuario, el peor caso **no se puede testear** — hay que eliminar la dependencia. Nada de `rgba()` bajo texto sobre fotos. Ambos pares están ahora en `check-contraste.js` (19 pares, 0 fallos).

**Cierre real de la migración emoji → SVG.** Quedaban dos residuos del bug `[mic]`:
- `<label>● Nota de voz</label>` y el ícono de cada nota guardada usaban un **bullet genérico** donde el tool había destruido el emoji de micrófono. Ahora son SVG de micrófono (`currentColor`).
- **El `●` del botón de grabar se queda**, y no es una omisión: el punto es el símbolo universal de "grabar" (y `■` de detener), es monocromo, y vive en `textContent` — meter un SVG ahí lo renderizaría como texto literal. Es la misma trampa de siempre.

**Iconografía semántica.** "Hacer otra OT" usaba un **triángulo de play**. *Play* significa "reproducir", no "crear otra" — y era el botón más prominente de la pantalla final. Ahora es un `+`.

**🐛 El separador `·` que el código se contradecía a sí mismo.**
El placeholder estático del hero (`index.html:860`) dice `OT #--- · ---` con punto medio. Pero el JS que **realmente** lo rellena (`:2394`) escribía `' . '` con un punto normal. Lo mismo en la duración de las notas de voz (`:2919`). Otro rastro del tool que mangó los caracteres unicode. Restaurados ambos a `·`.

> **Lección:** los placeholders estáticos son un test involuntario. Cuando el markup y el JS que lo reemplaza no coinciden en tipografía, uno de los dos está mal — y casi siempre es el que nadie mira.

### Cuerpo, foco e iconografía verificable (2026-07-09)

Auditoría **medida**, no opinada. Tres hallazgos, uno de ellos sobre el propio proceso de auditoría.

**1. Los botones eran más chicos que el mínimo que este documento exigía.**
`.btn-sm` medía **~37px** — y es la clase de **"Confirmar firma"**, la acción irreversible del flujo. Los botones "Eliminar" del admin, **~26px**. Con la incertidumbre de los guantes resuelta (no los usan), la regla nueva de §5 es 44/32/24px, y ahora existe: `.btn-sm { min-height: 44px }` y un piso global `button { min-height: 32px }`.

**2. El foco de teclado no existía en 9 sitios.** (WCAG 2.4.7)
Nueve `outline: none` sin nada en su lugar — buscadores, el `select` de rol, los ítems de cotización. Cuatro de ellos no tenían **ningún** indicador. Ahora hay una regla global `:focus-visible { outline: 2px solid var(--azul) }` y cero `outline:none`.
> Corrección honesta: la auditoría empezó acusando a los **botones**. Falso — ninguno mataba su outline, así que conservaban el anillo del navegador. Eran los **inputs**. Medir antes de acusar.

**3. 🐛 El botón de ver contraseña era mudo.**
`togglePassVis()` cambiaba `input.type` pero **nunca el ícono**: mostraba el mismo ojo estuviera la contraseña visible u oculta. Ahora alterna ojo ↔ ojo-tachado y actualiza su `aria-label`.

---

### 🔍 La lección del día: un check no puede heredar el punto ciego del fix

`DESIGN.md` afirmaba **"0 emojis a color en toda la app"**. Era **falso**, y lo escribí yo, y lo comiteé **dos veces**.

La causa no fue descuido. La migración emoji→SVG recorrió una **lista** (📷 🖼 ⏸ ▶ 🔧 ⚠ 🔒 ✏ 🗑 👤 ✅ ⏳ 🔄)… y la verificación usó **esa misma lista**. Un check construido con el mismo mapa que el fix **no puede encontrar el territorio que el fix no visitó**. Sobrevivieron `👁`, `⚙️`×5 y `📤`.

Solo aparecieron al medir por **rango Unicode** en vez de por lista. Y al hacerlo, el nuevo script encontró **dos más que nadie había visto**: `⌫` (borrar del PIN) y `▼` (chevron de pausadas) — monocromos, pero símbolos-como-icono que `DM Sans` no incluye, así que caían a una fuente de respaldo distinta en cada dispositivo.

**Nuevo: `check-emojis.js`.**

```
node check-emojis.js   →   0 emojis a color. La iconografia es un set SVG unico.
```

Escanea **todo el espacio de símbolos** y **resta** una allowlist explícita, cada entrada con su razón escrita (`✓` `✕` `●` `■` `←` `→` `›`). Falla por defecto ante cualquier símbolo nuevo. **Es lo contrario de una lista.**

> **Regla:** cuando escribas un check, pregúntate qué comparte con el fix que verifica. Si comparten la fuente de verdad, el check es una repetición, no una verificación.

---

### Recomendación sobre la escala tipográfica (pendiente, NO ejecutado)

Medido: **16 tamaños distintos en 336 declaraciones** de `font-size`. La escala canónica de §3 tiene 7 pasos. Tres usos de 10px (bajo el piso de 11px) **ya fueron corregidos**.

**Recomendación: no hacer el big-bang.** Colapsar 336 sitios de una vez es una refactorización grande, riesgosa, de valor invisible para el técnico, y que exige QA pantalla por pantalla. El costo real de la deriva no es visual — es de *velocidad futura*: cada pantalla nueva reinventa sus tamaños.

Estrategia propuesta, la misma que funcionó con el contraste:
1. **Congelar la deriva con una medición.** Un `check-tipografia.js` que reporte cuántos tamaños hay fuera de la escala. No falla; informa.
2. **Definir los 7 pasos como tokens** en `:root` y documentarlos.
3. **Migrar oportunistamente**: cada vez que se toque una pantalla, sus tamaños se mueven a la escala. Nunca una pasada dedicada.

Los 3 tamaños más usados (**11/12/13px = 225 de 336 declaraciones**) son la capa de metadatos y body. Ahí está el 67% del beneficio.

### Pendiente que sigue esperando su propia pasada

**19 diálogos nativos** — `confirm()`×11, `prompt()`×6, **`alert()`×2** (estos últimos ni figuraban en la deuda declarada). Es una feature que toca lógica **destructiva** (borrar personal, borrar OTs, contraseña de admin). Necesita su propia pasada con testing, no un `/polish`.

---

## Crítica del 2026-07-09 (tarde) — el PIN, la validación muda y los tokens decorativos

Auditoría **medida**. Cinco hallazgos, de los cuales **dos de mi propio reporte resultaron falsos**
al ir a leer el código. Se documentan igual: un reporte sin sus errores enseña la mitad.

### 🐛 1. Un PIN de 5 dígitos dejaba al técnico fuera de la app, en silencio

Tres líneas que se contradecían:

| Sitio | Decía |
|---|---|
| `index.html:968` | `<input type="number" maxlength="4">` — **`maxlength` no existe para `type="number"`** (spec HTML: solo text/search/url/tel/email/password). El navegador lo ignoraba sin avisar. |
| `guardarTecnico()` | `if (!pin \|\| pin.length < 4)` — solo un **mínimo**. Un PIN de 6 dígitos se guardaba sin queja. |
| `pinInput()` | `if (pinActual.length >= 4) return;` — tope **duro** de 4, y auto-valida al llegar ahí. |

**Consecuencia:** el administrador crea un técnico con PIN `123456`. El técnico llega a terreno,
marca `1234`, y la app dice *"PIN incorrecto"*. **Ninguna combinación de teclas lo deja entrar**, y
nada en pantalla lo explica. Es el patrón de *"trabajo que desaparece"* que este proyecto lleva
semanas cazando — pero la que desaparecía era la persona.

**Contexto de negocio (Pedro, 2026-07-09):** los 4 dígitos son una **decisión de accesibilidad**,
no una limitación técnica. Son 3 técnicos en terreno, algunos de tercera edad, y Pedro eligió PINs
simples (`1234`) con opción de cambiarlos. **La regla canónica es: exactamente 4 dígitos.** Nunca
"al menos".

**Fix:** `type="text" inputmode="numeric" pattern="[0-9]{4}" maxlength="4"` + filtro `oninput` que
descarta no-dígitos, y validación `/^\d{4}$/` al guardar. `type="text"` + `inputmode` da el teclado
numérico en móvil **y** respeta `maxlength`; `type="number"` no hacía ninguna de las dos.

> **Regla:** cuando un formulario escribe un dato y otra pantalla lo lee, **ambos lados deben
> compartir la regla de validación**. Aquí el escritor aceptaba lo que el lector no podía leer.

### 🔒 2. `PINS[d.nombre] = d.pin || '1234'` — el fallback concedía acceso

Un técnico sin `pin` en Firestore recibía **1234** en silencio. La pantalla de login **lista a todos
los técnicos por nombre**, y el sitio es **público** (GitHub Pages). El fallback abría la puerta en
vez de cerrarla.

Ahora **falla cerrado**: un PIN ausente o mal formado (`/^\d{4}$/`) guarda `null`, y `validarPin`
dice *"Este usuario no tiene PIN. Pídele al administrador que lo configure."* — en vez de
*"PIN incorrecto"*, que mandaría al técnico a probar combinaciones para siempre por un problema
que solo el administrador puede resolver.

> ⚠️ **Verificar antes de mergear:** los 3 técnicos deben tener el campo `pin` en Firestore.
> Si alguno no lo tiene, hoy entraba con `1234` y ahora no entrará. Es el comportamiento correcto,
> pero hay que confirmarlo con datos reales, no asumirlo.

### 🐛 3. La app validaba, pero no llevaba a nadie a ninguna parte

`cerrarOT()` tiene **5 puntos de rechazo**. Los cinco hacían `toast(...)` y `return`. Y `toast()`
muestra un div **2,5 segundos**, abajo al centro — justo donde el pulgar tapa la pantalla — y no
hace scroll al campo, no lo resalta, no mueve el foco, no deja rastro.

El técnico, al final de un formulario largo y al sol, tenía que **adivinar** cuál de las cinco
condiciones falló. El documento promete que la app *"nunca te deja con dudas sobre qué pasó"* (§7).
Aquí sí lo hacía.

**Fix:** `_rechazar(msg, idCampo)` hace scroll al campo culpable, le pone un halo rojo persistente
(`.campo-error`) y lo limpia cuando el técnico lo toca. Los 5 rechazos lo usan.

**Bonus a11y:** `<div id="toast">` no tenía `role="status"` ni `aria-live` — siendo el **único canal
de feedback de toda la app**. Además `toast()` escribía el texto **antes** de quitar el
`display:none`: un `aria-live` oculto está fuera del árbol de accesibilidad, así que el lector de
pantalla nunca veía el cambio. Ahora se muestra primero y se escribe después.

### ✅ 4. Los tokens de radio eran decoración — ahora `check-tokens.js` los vigila

Medido: **163 `border-radius` hardcodeados** contra 20 vía `var()`. `--radio-lg` y `--radio-pill`
estaban definidos en `:root` y **no los usaba nadie**. §4 decía *"✅ Normalizado"*: era **medio
cierto, y la mitad falsa era la que costaba plata**. Los *valores* sí habían colapsado a 4; los
*tokens* no se habían adoptado. Cambiar el radio de las cards significaba editar 126 sitios.

Hoy: **187 radios, todos por token. 0 literales** (salvo `50%`, que es geometría, no marca).

**Nuevo `check-tokens.js`** — falla ante:
- **tokens fantasma** (`var(--x)` no definido → invalida el shorthand `border` entero y el borde
  simplemente no se dibuja; ya pasó 15 veces en esta app),
- **tokens muertos** (definidos, 0 usos),
- **radios hardcodeados**.

E **informa** (sin fallar) sobre la deriva tipográfica, que se migra por pantalla, no de una vez.

```
node check-tokens.js  →  22 tokens definidos, 22 en uso. 0 fantasmas, 0 muertos.
                         Los 187 radios pasan por token. La abstraccion es real.
```

### 🔤 5. El documento no tenía `<h1>`, y pedir uno de 22px habría sido un error

`<h1>` aparecía **0 veces** en 9.300 líneas. Había **16 `<h2>`, todos en el topbar**, uno por
pantalla. Un documento con `h2` y sin `h1` no tiene estructura para un lector de pantalla.

§3 exigía *"un título de contenido a 22px que ancle la vista"*. **Se descarta esa regla.** El topbar
**ya es** el título de la pantalla: agregar un segundo título de 22px repetiría la misma palabra dos
veces — justo el anti-patrón *"headers redundantes"* del skill impeccable. La jerarquía la dan la
posición y la barra azul, no el tamaño.

**Fix:** los 16 `<h2>` del topbar pasan a `<h1>`, **sin cambio visual** (siguen a 15px). §3 se
corrige: el topbar es el H1, y no hace falta un H1 de contenido.

---

### 🔍 Dos errores de mi propia crítica, y por qué importan

**a) "11 botones solo-ícono, 2 con nombre" era falso.**
El grep `<button[^>]*>\s*<svg` matcheaba botones que **sí tienen texto** ("Agregar foto", "Filtros",
"Pausar", "Hacer otra OT"). Botones realmente solo-ícono hay **2**, y ambos ya tenían `aria-label`.
Al medir bien — *contenido sin SVG ni tags, ¿queda vacío?* — aparecieron los verdaderos: **18
botones sin nombre accesible**, y ninguno era de los que acusé. Eran **15 botones "volver" (`←`)**,
un cerrar (`✕`), el de grabar (`●`) y un quitar-ítem (`x`).

*(Y hasta ese recuento lo di mal la primera vez: dije 14 "volver" y 17 en total. Son 15 y 18.
Los conté a ojo desde una lista impresa en vez de contarlos con código. Tercera vez en esta
sesión que una cifra dicha de memoria resulta falsa; la cuarta será igual si no la mido.)*

> El primer grep contaba *"botones que contienen un SVG"*. La pregunta era *"botones sin texto"*.
> Casi la misma frase, poblaciones distintas.

**b) "Token fantasma en la línea 3533" era falso.** `--gris3` **sí** está definido en `:root`.
Verificado antes de "arreglarlo".

**c) El doble-envío de `cerrarOT()` no existe.** Fui a buscarlo y encontré `estado.otClientId`
memoizado + `doc(clientId).set(..., {merge:true})`. Es idempotente. Alguien ya lo había pensado.

### 🔍 Y un error al arreglar: borré un token que no estaba muerto

`check-tokens.js` marcó `--blanco` como token muerto. Cierto **para la app** (el CSS usa `white`
literal, nunca `var(--blanco)`). Lo borré. Y **`check-contraste.js` se puso rojo**: era su único
consumidor, lo usaba como superficie de card.

El script hizo exactamente su trabajo — atrapó una regresión que yo introduje. Pero revela que
**`check-tokens.js` solo lee `index.html`**: su "muerto" significa *"sin usos en index.html"*, no
*"sin usos en el repo"*. El alcance ahora está **escrito en la cabecera del script**.

Se resolvió midiendo contra `#FFFFFF` literal en `check-contraste.js`, que es **lo que el CSS
realmente pinta**. El token estaba muerto de verdad; el que tenía el mapa incompleto era yo.

> **Regla (extensión de la lección del emoji):** un check debe **declarar su alcance**. "0 usos"
> sin decir *dónde buscó* es una afirmación que no se puede evaluar. La versión anterior de esta
> lección decía que un check no puede compartir la fuente de verdad con el fix. Ésta añade: tampoco
> puede callar cuál es su fuente de verdad.

### 🐛 6. El `sed` de radios rompió el correo de cotizaciones — y los 3 checks siguieron en verde

Encontrado por una **revisión adversarial** del diff, no por los verificadores.

El `sed` global convirtió `border-radius:8px` → `var(--radio-sm)` en **163 sitios**. Dos de ellos
(`index.html:7524` y `:7527`) están dentro de `cuerpoHtml`, el HTML que **EmailJS envía a Pedro**.
Las líneas vecinas usaban hex hardcodeados (`#1B3A6B`, `#e0e0e0`, `#444`) **a propósito**, porque en
un cliente de correo el `:root` de la app no existe. Yo metí dos `var()` justo en medio.

Una custom property sin fallback **invalida la declaración entera**: el navegador computa el valor
inicial y `border-radius` se vuelve `0`. El correo llegaba con las esquinas cuadradas.

**Yo mismo busqué este bug y no lo encontré.** Revisé los exports a Excel (limpios, 0 radios) y di
el tema por cerrado. Nunca miré las plantillas de EmailJS. La revisión adversarial sí.

**Fix + guardián:** la región se marca con centinelas `CSS-EXPORTADO: INICIO` / `FIN`, y
`check-tokens.js` **invierte su regla** dentro: allí el literal es obligatorio y una custom property
es un error. Es la única zona del código donde un hardcode es lo correcto, y ahora está vigilada.

> **Y el comentario que escribí para advertir del peligro contenía el peligro.** Puse `var(--x)` como
> texto de ejemplo dentro de la zona vigilada, y el script — que escanea texto, no AST — lo marcó.
> El comentario se delató a sí mismo. Quedó anotado en el propio comentario.

### Verificación

```
node check-contraste.js  →  22 pares · 0 fallos reales · 2 tolerados   exit 0
node check-emojis.js     →  0 emojis a color                           exit 0
node check-tokens.js     →  0 fantasmas · 0 muertos · 0 radios sueltos
                            1 zona de CSS exportado, 0 var() dentro     exit 0
sintaxis                 →  0 errores en los 3 bloques <script>
```

**`check-tokens.js` se validó con mutantes**, no solo corriéndolo:

| Mutante inyectado | exit esperado | exit real |
|---|---|---|
| `var()` dentro de la zona de correo | 1 | **1** ✅ |
| radio hardcodeado fuera de la zona | 1 | **1** ✅ |
| token fantasma (`var(--noexiste)`) | 1 | **1** ✅ |
| control (copia intacta) | 0 | **0** ✅ |

> **Regla:** un check que nunca has visto fallar no es un check, es una decoración que dice "verde".
> Rómpelo a propósito antes de confiar en él.

### 🔍 La revisión adversarial dijo "0 confirmados". Estaba equivocada.

La revisión corrió 6 dimensiones × 3 escépticos. Su veredicto final fue **0 hallazgos confirmados,
3 refutados**. Si lo hubiera creído, el bug del correo se habría mergeado.

Lo que el veredicto escondía:
- **2 de los 15 agentes murieron** con error. En un hallazgo, la votación quedó 1-de-2 en vez de
  1-de-3, y un solo escéptico bastó para matarlo (la mayoría se calcula sobre los votos emitidos).
- **Un refutador devolvió literalmente la palabra `"test"`** como razón. Ese voto contaba igual.
- Los escépticos que sí razonaron **confirmaron los hechos** (*"El código es real: git diff confirma
  que 7524 y 7527 pasaron a `var(--radio-sm)`… en el cliente de correo queda indefinido"*) y lo
  refutaron por ser **"solo estético"**. Pero el brief decía *"nada de estilo"* para excluir opiniones
  de gusto, no para excluir **regresiones que yo introduje**.

El bug estaba en el reporte, bien descrito, marcado como refutado. **La señal existía; el agregado la
borró.**

> **Regla:** un veredicto agregado (`0 confirmados`) es un resumen, no una conclusión. Antes de
> creerle, mira cuántos votantes murieron, si algún voto es basura, y si el criterio de refutación es
> el que pediste. Un pipeline de verificación con votos corruptos **produce falsos negativos con
> total confianza** — exactamente el fallo que este documento lleva tres sesiones persiguiendo.

### QA visual del 2026-07-09 → `check-tildes.js`

Los 5 puntos del guion pasaron (PIN, halo `.campo-error` + scroll, radios, buscador de sucursales,
nota de voz). Pero las **capturas** mostraron *"Nuevo tecnico"* y *"1 cotizacion | $0"*.

Este documento lleva **cuatro pasadas** arreglando ortografía a ojo: "Después", "Fotografía",
"Facturación", "Pídele", "PIN (4 números)"... y seguían vivos **16 errores**: `Nuevo tecnico`,
`Ver cotizacion` ×3, `placeholder="Descripcion"`, y 11 toasts.

> **Revisar a ojo encuentra lo que miras. No encuentra lo que no abriste.** Es la misma lección
> del emoji, la cuarta vez que aparece: el arreglo manual recorre una lista, y la verificación
> recorre esa misma lista.

**Nuevo `check-tildes.js`.** Escanea los contextos donde el string es visible (`toast()`,
`textContent=`, `placeholder=`, `encodeURIComponent` de WhatsApp) buscando palabras que llevan tilde
escritas sin ella. Ignora `console.*` (nadie los lee) y respeta `DATOS_INTOCABLES`.

**Dos trampas que el script codifica:**
1. **`'Tecnico en terreno'` es un VALOR de Firestore, no un texto de pantalla.** Ponerle tilde
   rompería `cargo === 'Tecnico en terreno'` y la lectura de los documentos ya guardados. El display
   va por `_cargoLabel()`. El script tiene una lista explícita de intocables, y se verificó con un
   mutante que **no** lo reporta.
2. **El plural mueve la tilde.** El código hacía `' cotizacion' + (n !== 1 ? 'es' : '')`, que con
   tilde daría `cotizaciónes`. Y `' enviadas'` estaba fijo en plural: con una sola decía
   *"1 cotización enviadas"*. **Nunca formes el plural con `+ 'es'` sobre una palabra acentuada.**

**Y un placeholder que se contradecía con su JS, otra vez:** el markup estático del formulario decía
`Nuevo personal`; el JS que lo reemplaza escribe `Nuevo técnico`. Mismo patrón que el separador `·`.

```
node check-tildes.js  →  0 palabras sin tilde en texto visible   exit 0
```

Validado con mutantes: reintroducir `Nuevo tecnico` → falla ✅ · un toast nuevo sin tilde → falla ✅ ·
el dato `Tecnico en terreno` → **no** lo reporta ✅

### Los 5 verificadores del repo

| Script | Vigila | Falla ante |
|---|---|---|
| `check-contraste.js` | WCAG AA sobre la superficie real | par de texto bajo 4.5:1 |
| `check-emojis.js` | iconografía SVG única | símbolo fuera de la allowlist (escanea por rango) |
| `check-tokens.js` | la capa de tokens es real | fantasma · muerto · radio suelto · `var()` en CSS exportado |
| `check-tildes.js` | ortografía del texto visible | palabra sin tilde en `toast`/`textContent`/`placeholder` |
| *(syntax-check)* | los 3 bloques `<script>` | error de parseo |

> Cada uno nació de un bug que **sobrevivió a una revisión manual**. Ninguno se escribió por
> disciplina abstracta.

**De paso:** murió el último `#D0D5DD` hardcodeado (`index.html:563-564`), un color stale que este
documento ya había dado por eliminado y seguía vivo en el buscador de sucursales. El token real es
`--gris3` (`#C8D0E0`). Y los 6 estados vacíos de cotizaciones, que decían la misma cosa de 4 formas
distintas, ahora distinguen **lista vacía** ("Aún no hay cotizaciones guardadas") de **acción sin
datos** ("No hay cotizaciones para exportar") — que no son el mismo mensaje.

---

*Documenta el sistema real de EMVAL. Alinear el código a este documento, no al revés.*
