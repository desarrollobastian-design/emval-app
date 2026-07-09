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
técnicos de mantención (electricidad, cañerías, baños, correctivos y preventivos) en
**condiciones variables y no controladas**: interiores oscuros, exteriores con sol directo,
posiblemente con guantes o con una sola mano libre. Y la usa un administrador desde un
entorno de escritorio.

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
de alineación tabular: números de OT, CECO, badges de código, montos de cotización.
**Prohibido** en métricas de dashboard o texto general (ver Anti-Slop §7).

### Hierarchy & Weights (escala canónica)
- **Título de Pantalla (H1):** DM Sans 700 · 22px · el elemento dominante de cada pantalla
- **Section Headers (H2):** DM Sans 600 · 16px
- **Subsección / Card title (H3):** DM Sans 600 · 15px
- **Body:** DM Sans 400 · 15px · line-height 1.5
- **Small / Meta:** DM Sans 500 · 12px
- **Micro / Badge:** DM Sans 500 · 11px
- **CTA Buttons:** DM Sans 600 · 15px

> **⚠ Deriva actual:** el código usa ~19 tamaños distintos (10-32px) y el `h2` del topbar es
> solo 15px (sin H1 dominante). Colapsar a la escala de 7 pasos de arriba. El topbar mantiene
> su título compacto a 15px por ser barra de navegación, pero cada pantalla debe tener un
> **título de contenido a 22px** que ancle la vista.

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

> **✅ Normalizado (2026-07-08):** los 12 radios hardcodeados se consolidaron a la escala de
> 4 valores. Hoy el código solo usa `8 / 14 / 18 / 99px` (+ `50%` para círculos). Tokens
> `--radio-lg` y `--radio-pill` agregados a `:root`.

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
- **Touch targets:** **mínimo 48×48px** (superior al estándar de 44px). Decisión bajo incertidumbre: no se pudo confirmar si los técnicos usan guantes ni en qué condiciones de luz trabajan, así que se dimensiona para el peor caso — guantes + sol directo + una sola mano.

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
| ⏳ Pendiente | 🔴 Alta | Migrar emojis → set SVG único (76 sitios, requiere QA visual) | `/normalize` |
| ⏳ Pendiente | 🟡 Media | Hover-glows inline → clases CSS `@media (hover: hover)` | `/polish` |
| ⏳ Pendiente | 🟡 Media | Escala tipográfica de 7 pasos + H1 22px por pantalla | `/polish` |
| ⏳ Pendiente | 🟡 Media | Stat-cards: romper el template hero-metric + skeleton real | `/polish` |
| ⏳ Pendiente | 🟢 Baja | Colores de estado seleccionado con `color-mix` | `/polish` |

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

---

*Documenta el sistema real de EMVAL. Alinear el código a este documento, no al revés.*
