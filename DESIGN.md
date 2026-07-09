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

---

*Documenta el sistema real de EMVAL. Alinear el código a este documento, no al revés.*
