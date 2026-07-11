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
- **Gris Borde** (`#7F899E`, era `#C8D0E0`) — Bordes de inputs sin foco, dividers, dashed de foto-box,
  puntos del PIN, dots del step-indicator. **Es el límite visual de los controles**, y WCAG 2.1
  **SC 1.4.11 (Non-text Contrast, AA)** le exige **3:1** contra lo que lo rodea. `#C8D0E0` daba
  **1,43:1**. Es el gris tintado hacia el azul de marca **más claro** que pasa 3:1 contra la peor
  superficie (`--fondo`, 3,25:1); `#8A93A6` se queda en 2,85. **Vigilado por `check-contraste.js`
  (parte 4).**

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
> (`#000`) ni blanco puro en texto.

### La segunda paleta (documentada el 2026-07-09)

Fuera de `:root` viven **60 hexes**. No son deuda: son tres familias con razón de ser. Lo que las
protege no es un token, es el **escaneo de contraste** de `check-contraste.js`, que mide cualquier
par `background`/`color` que aparezca en el código.

1. **Avatares por técnico** (`colores[]`, `COLORES_SUP`) — Pedro pidió un color propio por persona y
   el hash debe ser estable. **No se tocan.**
2. **Marcas de terceros** — `#F7941D` (cadena S10), `#25D366` (WhatsApp). No son decisión nuestra.
3. **Tintes de estado** — pares fondo-pálido / texto-oscuro que ningún token cubría:
   `#E6F4EA`+`#1A7A3C` (preventivo), `#FEF0E6`+`#B45309` (correctivo), `#FEF3C7`+`#78350F` (pausada),
   `#DBEAFE`+`#1E40AF` (aceptada), `#FEE2E2`+`#B91C1C` (destructivo suave). Todos pasan AA.

> **Lo que sí está prohibido:** un hex a distancia ≤ 6 de un token **neutro**. A esa distancia es el
> mismo color escrito dos veces. Había 13 (`#EEF2FA`, `#EDF0F5`, `#F8F9FB`, `#F5F5F5`, `#F1F5F9`).
> **Vigilado por `check-tokens.js`.** En zonas exportadas (Excel, correo) se usa el **hex exacto** del
> token, porque el `:root` no viaja fuera del documento.

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
- **Regla de jerarquía:** máximo **un** botón de peso primario **visible a la vez** por pantalla
  (`btn-primary`, `btn-verde`, `btn-peligro`, `btn-whatsapp`). Todo lo demás secundario, ghost o
  text-link. Los paneles de pestaña (`#panel-*`) son mutuamente excluyentes y los modales viven en
  su propio contexto: no cuentan entre sí. **Vigilada por `check-a11y.js` (regla 13)** desde el
  2026-07-09, cuando se descubrió que la pantalla que cierra la OT tenía **dos verdes idénticos**.

### Cards & Containers
- **Corners:** 14px estándar (`--radio`), 18px para destacadas.
- **Background:** Blanco (`#FFFFFF`); resúmenes sobre Gris Superficie 1.
- **Shadow:** Susurro difuso tintado hacia azul — `--sombra: 0 2px 12px rgba(27,58,107,0.10)`; elevada `--sombra-lg: 0 8px 32px rgba(27,58,107,0.16)`.
- **No anidar cards dentro de cards.** Aplanar la jerarquía.

### Inputs & Forms
- **Stroke:** borde 1.5px Gris Borde (`--gris3`, `#7F899E`). **El código usaba `--gris2`
  (`#EEF1F7`, 1,05:1 contra la página): alguien aclaró el borde documentado y no lo anotó.
  Corregido el 2026-07-09; vigilado por `check-contraste.js` (parte 4).**
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
- **Nunca `transition: all`.** Anima también lo que hoy no existe y mañana sí. Lista explícita
  de propiedades, como hace `.btn`. Había **7** reglas con `all`. **Vigilado por `check-tokens.js`.**
- Animar `transform` y `opacity` (60fps). **Una sola excepción declarada**, con su razón:
  `.step` interpola su `width` de 8px a 24px — son 8px en un elemento de 8px, no hay reflow
  relevante, y es el step-indicator que §4 manda conservar.
- Respetar `prefers-reduced-motion: reduce` → desactivar transiciones no esenciales.
- **Sin bounce ni elastic easing.**
- **Animaciones en loop: exactamente tres, cada una comunica un estado.** Toda otra falla.

| Animación | Dónde | Qué comunica |
|---|---|---|
| `pulse` | dot de `#offline-bar` | sin señal |
| `grabar-pulse` | botón de nota de voz | grabando |
| `shimmer` | skeleton de `_cargando()` | estoy trabajando |

> **Esta sección decía dos cosas y las dos eran falsas** (corregido el 2026-07-09). Afirmaba
> *"solo transform y opacity"* con 7 `transition: all` en el código, y *"la `pulse` es la única
> animación en loop permitida"* habiendo tres. Peor: **§4 llama al step-indicator "patrón
> excelente — mantener" mientras §6 prohibía animar su `width`.** Una regla que el diseño
> contradice a propósito no es una regla: es ruido, y hace que las demás pesen menos.
> Ahora las excepciones están escritas, y `check-tokens.js` falla ante cualquier otra.

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
| ✅ Hecho | 🔴 Alta | **Zoom permitido** (WCAG 1.4.4) + controles ≥16px · **vigilado por `check-a11y.js`** | `/polish` |
| ✅ Hecho | 🔴 Alta | **Contraseña de admin enmascarada** (era un `prompt()` en texto plano) | seguridad |
| ✅ Hecho | 🔴 Alta | **Modal in-app único**: 19 diálogos nativos → **0** (4 estaban en código muerto) | feature |
| ✅ Hecho | 🟡 Media | Guardas de doble toque en las 5 acciones que crean documentos | `/polish` |
| ✅ Hecho | 🟡 Media | Toast que no se trunca (6 de 99 mensajes se cortaban) | `/polish` |
| ✅ Hecho | 🟡 Media | `role="dialog"` + `aria-modal` + Escape + foco atrapado en los 3 modales propios | feature |
| ⏳ Pendiente | 🟡 Media | **Estilos inline**: 251 de 315 `font-size` fuera de la hoja · 228 `.style.cssText` · **medido** | `/normalize` |
| ⏳ Pendiente | 🟢 Baja | Escala tipográfica **en el `<style>`**: 27 de 56 fuera de escala (esto sí es diseño) | `/normalize` |
| ⏳ Pendiente | 🟢 Baja | Par de badge del contador de pausadas (`#FEF3C7`/`#92400E`) sin token | `/normalize` |
| ⏳ Pendiente | 🟠 Alta | `_obtenerCentroSucursal` devuelve `''`: la cotización sale **sin CECO**, sin avisar | decisión de Pedro |
| ✅ Hecho | 🟡 Media | **`locales` era un cementerio**, no una feature a medio cablear. 7 funciones borradas | borrar |
| ✅ Hecho | 🔴 Alta | **Contraste por escaneo, no por lista** · 3 fallos reales corregidos | `/normalize` |
| ✅ Hecho | 🔴 Alta | El diálogo scrollea con el teclado abierto (`max-height` + overlay) | `/polish` |
| ✅ Hecho | 🟡 Media | 13 grises casi-idénticos → tokens · **vigilado por `check-tokens.js`** | `/normalize` |
| ✅ Hecho | 🟡 Media | `alt` en las 19 imágenes · `go()` mueve el foco al `h1` | `/polish` |
| ✅ Hecho | 🔴 Alta | **`_bloquear()` podía dejar 4 botones muertos para siempre** (regresión propia) | bug |
| ✅ Hecho | 🔴 Alta | **Toast de duración proporcional**, descartable · 43 de 117 mensajes no se leían | `/polish` |
| ✅ Hecho | 🟠 Alta | **5 cargadores mudos**: una lista vacía por falta de red mentía | bug |
| ✅ Hecho | 🟡 Media | **Una sola voz para los 14 estados vacíos** (`_vacio`) · antes 5 formas de decir "no hay OTs" | `/polish` |
| ✅ Hecho | 🟡 Media | **Icono de fuente sin su hoja** (`<i class="ti">`): no podía dibujarse jamás | bug |
| ✅ Hecho | 🔴 Alta | **SC 1.4.11**: ningún control tenía un límite visible (1,05–1,55:1) | `/normalize` |
| ✅ Hecho | 🔴 Alta | **`check-contraste.js` no cubría 1.4.11** y su cabecera afirmaba algo falso | bug |
| ✅ Hecho | 🟠 Alta | El toast tapaba `#pending-bar`, que es tappable (regresión propia) | bug |
| ✅ Hecho | 🟠 Alta | **Dos botones verdes idénticos** en la pantalla que cierra la OT | `/polish` |
| ✅ Hecho | 🟡 Media | **Skeleton de carga en las 11 listas** (`_cargando`) · antes 9 de 15 en blanco | `/polish` |
| ✅ Hecho | 🔴 Alta | **`check-tildes.js` tenía un falso negativo**: excluía la línea, no la expresión | bug |
| ✅ Hecho | 🔴 Alta | El skeleton parpadeaba sobre datos correctos en 12 refrescos (regresión propia) | bug |
| ✅ Hecho | 🟠 Alta | **Una sola voz para los 29 errores** (`_error`) · 6 filtraban el `e.message` del SDK | `/polish` |
| ✅ Hecho | 🟠 Alta | **Región `#anuncios`**: el error era visible pero no perceptible | `/polish` |
| ✅ Hecho | 🟡 Media | §6 era falso: 7 `transition: all` y 3 loops · **vigilado por `check-tokens.js`** | `/normalize` |
| ⏳ Pendiente | 🟢 Baja | Skeleton real en las **stat-cards** del supervisor (números, no listas) | `/polish` |

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

### ~~Dos~~ **Tres** verdes + contraste verificable (2026-07-09 · corregido el 2026-07-10)

**Decisión aprobada: `--verde` se divide por semántica.**

| Token | Valor | Rol | Sobre qué fondo vive |
|-------|-------|-----|----------------------|
| `--verde` | `#27A06B` | **Verde de ESTADO** — `foto-box.filled`, `step.done`, `success-hero`, íconos, bordes | relleno, sin texto encima |
| `--verde-btn` | `#1E8052` | **Verde de ACCIÓN** — fondo de botón con texto blanco; verde como texto | blanco |
| `--verde-badge` | `#1A7A3C` | **Verde de BADGE** — "Preventivo", "Enviado", "Vendida", "Facturado" | `--verde-badge-fondo` |
| `--verde-badge-fondo` | `#E6F4EA` | fondo del badge verde | — |

Blanco sobre `--verde` da **3.3:1** (falla AA). Sobre `--verde-btn`, **4.92:1** (pasa). El `#1E8052` no es un color nuevo: ya estaba en la paleta como trazo del ícono de preventivo.

> **⚠ Esta sección decía "dos verdes" y había tres.** `#1A7A3C` era el verde **más usado de la app**
> — 14 sitios, más que `--verde` (5) y `--verde-btn` (3) juntos — y no era un token. Ni este
> documento ni `check-tokens.js` sabían que existía: la regla de grises solo compara contra los
> siete tokens **neutros**, y un verde queda fuera de su alcance por construcción. El único archivo
> del repo que lo conocía era la **lista curada** de `check-contraste.js`, con el hex tecleado a mano.
>
> Y no es redundante con `--verde-btn`. Se midió **antes** de crear el token:
>
> ```
> #1A7A3C sobre --verde-badge-fondo  ->  4.75:1   PASA
> #1E8052 sobre --verde-badge-fondo  ->  4.34:1   FALLA
> ```
>
> El botón es verde sobre **blanco**; el badge es verde sobre **verde pálido**, y ese fondo se come
> contraste. Por eso el badge tiene que ser más oscuro que el botón. **Quien eligió ese hex acertó
> y no dejó escrito por qué.** Ahora está escrito, y `check-contraste.js` guarda el contraejemplo
> (`Badge con --verde-btn`, tolerado, que *debe* seguir fallando) para que nadie los "simplifique".

**El mismo par, en naranja y en ámbar.** `--naranja-badge-fondo` (`#FEF0E6`) con `--naranja-btn` de
texto — **4.50:1, justo en el límite: no aclarar ese fondo ni un punto**. Y `--ambar-fondo` /
`--ambar-borde` para `.lista-error`.

**Sigue sin token** el par del contador de pausadas (`#FEF3C7` / `#92400E`). `check-tokens.js` ahora
lo **reporta** en su sección "colores de marca sin token, usados 3+ veces", sin fallar.

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

### Los 19 diálogos nativos — cerrado el 2026-07-09

Eran `confirm()`×11, `prompt()`×6, `alert()`×2. **Cuatro vivían en código muerto.** Los 15 restantes
se reemplazaron por un componente único. Ver la crítica de la noche del 2026-07-09, más abajo.

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

## Crítica del 2026-07-09 (noche) — el zoom, la contraseña y el check escrito primero

Esta vez **el verificador se escribió antes que los arreglos**, a propósito. `check-a11y.js` nació en
rojo con **7 categorías**, y el trabajo terminó cuando se puso verde. Es la primera vez en este
proyecto que la medición precede al fix, y encontró cosas que ninguna revisión manual vio.

### 🔴 1. La app le prohibía hacer zoom a técnicos de tercera edad

```html
<meta name="viewport" content="... maximum-scale=1.0, user-scalable=no">
```

Fallo de **WCAG 2.1 SC 1.4.4 (Resize Text, AA)**. Android Chrome lo respeta: no hay pinch-zoom.
(Safari lo ignora desde iOS 10, así que el daño era sobre todo en Android.)

§1 de este documento dice que la app se usa **bajo sol directo**, y que **algunos técnicos son de
tercera edad** — la misma frase que justificó el PIN de 4 dígitos. El HTML desactivaba la única
herramienta que el usuario tenía para leer.

**La huella del problema:** de 20 controles con `font-size` explícito, **exactamente dos** estaban a
16px (`admin-pass-input` y `search-sucursales`). iOS hace zoom automático al enfocar un campo bajo
16px. Alguien lo notó **dos veces** y lo arregló **dos veces**, donde le molestó. Los otros 18
seguían entre 12px y 15px, incluido todo el flujo del técnico.

**Regla nueva:** ningún control de formulario baja de **16px**. Sin allowlist para el admin: Pedro
usa el panel también en su teléfono.

### 🔒 2. La contraseña del administrador se escribía en texto plano, a la vista

Tres `prompt()` pedían contraseñas. **Un `prompt()` no puede enmascarar la entrada.** La contraseña
de Pedro aparecía en pantalla, en un local comercial, delante de quien pasara.

Lo irónico: la app **ya tenía** la solución. El login usa `<input type="password">` con un botón de
ojo. El flujo de confirmación destructiva lo ignoraba.

Esto **reencuadra** la deuda "19 diálogos nativos": no era una tarea cosmética, era de seguridad.

### 🐛 3. `disabled` no aparecía ni una vez en 9.300 líneas

`guardarTecnico()` hacía `await collection('tecnicos').add(data)` con el formulario **vivo**. Un
segundo toque con mala señal creaba **dos técnicos con el mismo nombre**, y en `PINS[nombre]` el
segundo pisaba al primero.

**Pero `cerrarOT()` NO tenía el bug**, ni `confirmarEnviarCot()`. El primero memoiza
`estado.otClientId` y escribe con `doc(clientId).set({merge:true})`; el segundo cierra el modal antes
de disparar el envío. **Medir antes de acusar.** El check señala a la función que *escribe*, no al
handler que la invoca — y tiene una lista de rutas de background con su razón escrita.

### 🐛 4. El único canal de feedback de la app se cortaba en un teléfono

`#toast` tenía `white-space: nowrap` y ningún `max-width`. Centrado con `translateX(-50%)`, **6 de
sus 99 mensajes** se cortaban por **ambos lados** a 360px. Entre ellos:

- *"✓ OT guardada. Se subirá sola al mejorar la señal."* — el mensaje que sostiene toda la
  confianza offline de la app.
- *"Este usuario no tiene PIN. Pídele al administrador que lo configure."* — que **escribí yo, hoy**,
  en el mismo commit donde presumí de feedback honesto.

### 🐛 5. Los tres modales propios no eran modales

`role="dialog"`: 0. `aria-modal`: 0. `Escape`: 0. Foco atrapado: 0. El Tab se iba **detrás** del
modal, a la pantalla que seguía en `display:flex`.

**El fix real no era "reemplazar `confirm()` por un modal bonito"**: los modales que ya existían
tampoco funcionaban. Ahora hay **un solo componente** (`_confirmar` / `_pedirTexto` / `_avisar`) con
`role="dialog"`, `aria-modal`, Escape, foco atrapado y **devolución del foco** al botón que lo abrió;
y los 3 modales viejos comparten `_modalMostrar` / `_modalOcultar`.

> **Invariante:** el valor de cancelación **no es el mismo** en los tres: `false` / `null` /
> `undefined`. `prompt()` devolvía `null` y más de un sitio lo confundía con `''`.

### 🧹 Seis funciones muertas

`restaurarBorradorPendienteTecnico`, `enviarCotizacion`, `enviarCotGuardadaData` y
`enviarCotGuardada` — emisores legacy vía `mailto:` (`%0A` en el cuerpo), reemplazados por el flujo
de EmailJS. Entre las cuatro contenían **4 de los 19 diálogos**. Borradas: la cuenta bajó a 15 sin
tocar una sola línea viva.

> ⚠️ ~~**Dos más, NO borradas:** `guardarLocal` y `mostrarFormLocal` tienen **0 llamadas**. El markup
> `#form-local` existe en el HTML pero **nada lo abre**: el admin puede listar y borrar locales, no
> crearlos ni editarlos. Es una feature a medio cablear, no basura. **Decisión de Pedro**, no mía.~~
>
> **Corregido el 2026-07-09 (madrugada): esto era falso.** El admin **tampoco** podía listarlas ni
> borrarlas. `#form-local` y `#lista-locales-admin` viven dentro de un `<div style="display:none;">`
> rotulado por su propio autor *"Campos ocultos para compatibilidad con locales"*. `editarLocal` y
> `eliminarLocal` solo existen en botones que crea `cargarLocalesAdmin`, y a `cargarLocalesAdmin`
> solo la llaman `guardarLocal` (muerta) y `eliminarLocal`: **un ciclo cerrado sin puerta de
> entrada.** No había ninguna decisión que tomar. Las **7 funciones** se borraron (~97 líneas).
> Ver la crítica de la madrugada, más abajo.

---

### 🔍 Tres puntos ciegos de mis propios verificadores, y cómo aparecieron

**a) El comentario que explicaba la regla la violaba.** `check-a11y.js` contó **13 "diálogos
nativos"** que eran las palabras `confirm()` / `prompt()` / `alert()` **dentro de los comentarios que
documentan su reemplazo**. Es la segunda vez hoy: a `check-tokens.js` le pasó con una custom property
de ejemplo. Los scripts escanean texto, no AST.

**b) Y limpiar los comentarios con un regex fue peor.** El atributo `accept="image/*"` abre un
comentario de bloque **falso** que se come **337.000 caracteres**. El script encontró **cero
problemas** y dijo que todo estaba bien.

> **Un falso negativo silencioso es el peor resultado posible.** Ahora hay un escáner que respeta las
> comillas, **y un guardián que verifica al escáner**: si pierde más del 30% del archivo, avisa y
> analiza el texto crudo. Errar hacia el falso positivo, nunca hacia el falso negativo.

**c) `check-tildes.js` era una LISTA, y las listas se pudren.** Pasó su propio control con `0`
hallazgos… y un mutante demostró que no veía `'Esta accion no se puede deshacer'`, **porque `accion`
no estaba en la lista**. Es literalmente el mismo fallo que la migración de emojis y la de radios,
por quinta vez.

Reescrito como **regla**: en español, toda palabra aguda terminada en `-ion` lleva tilde
(`accion→acción`, `camion→camión`); el plural la pierde (`acciones`). La lista queda solo para
irregulares (`tecnico`, `numero`, `aqui`…), y hay un `EXCEPCIONES_ION` para los monosílabos que la
RAE escribe sin tilde desde 2010 (`guion`, `ion`).

Al correrla, la regla encontró **dos** que la lista jamás habría visto: `recepcion` y `DISTRIBUCION`
(en mayúsculas la tilde también se escribe).

---

### `check-mutantes.sh` — el verificador de los verificadores

```
bash check-mutantes.sh   →   17 mutantes · 0 puntos ciegos
```

Inyecta un defecto real y exige que el check correspondiente **falle**. Si un mutante sobrevive, el
punto ciego está en el check, y **se arregla el check, no el mutante**.

| Mutante | Check | exit |
|---|---|---|
| `user-scalable=no` en el viewport | a11y | 1 ✅ |
| un input a 13px | a11y | 1 ✅ |
| reintroducir un `confirm()` nativo | a11y | 1 ✅ |
| quitar `aria-modal` de un modal | a11y | 1 ✅ |
| `white-space: nowrap` en el toast | a11y | 1 ✅ |
| quitar la guarda de `guardarTecnico` | a11y | 1 ✅ |
| mensaje de diálogo sin tilde | tildes | 1 ✅ |
| palabra `-ion` que ninguna lista tendría | tildes | 1 ✅ |
| `var()` dentro del correo exportado | tokens | 1 ✅ |
| radio hardcodeado / token fantasma | tokens | 1 ✅ |
| emoji a color reintroducido | emojis | 1 ✅ |
| **controles sin mutar** | los 4 | **0** ✅ |

### Los 6 verificadores del repo

| Script | Vigila | Nació de |
|---|---|---|
| `check-contraste.js` | WCAG AA sobre la superficie real | el verde que pasó 4 críticas |
| `check-emojis.js` | iconografía SVG única (por rango unicode) | emojis que la migración no visitó |
| `check-tokens.js` | tokens reales + zona de CSS exportado | radios que el doc daba por normalizados |
| `check-tildes.js` | ortografía visible (por **regla**, no lista) | 16 tildes que 4 pasadas no vieron |
| `check-a11y.js` | zoom · 16px · 0 diálogos · modales · toast · doble envío | **se escribió antes del fix** |
| `check-mutantes.sh` | **a los otros cinco** | 3 checks que mintieron en verde |

### Verificación

```
node check-contraste.js  →  22 pares · 0 fallos · 2 tolerados        exit 0
node check-emojis.js     →  0 emojis a color                         exit 0
node check-tokens.js     →  185 radios por token · 1 zona exportada  exit 0
node check-tildes.js     →  0 palabras sin tilde                     exit 0
node check-a11y.js       →  las 6 reglas en verde                    exit 0
bash check-mutantes.sh   →  17 mutantes · 0 puntos ciegos            exit 0
sintaxis                 →  0 errores en los 3 bloques <script>
```

> **La lección, ya en su sexta forma:** *lo que revisas a ojo es lo que ya sabías mirar.* Y su
> corolario nuevo: **un check también revisa a ojo, si su fuente de verdad es una lista.** La única
> defensa es una regla, y la única prueba de que la regla funciona es verla fallar.

---

## El último check que recitaba una lista (2026-07-09, madrugada)

`check-contraste.js` salía **exit 0** durante semanas. Y había **tres fallos de contraste reales**
en el código. No era un bug del script: era su **diseño**. Enumeraba **22 pares de tokens**, y los
fallos vivían en los **hexes que no son tokens**.

### 🔴 Los tres fallos que la lista no podía ver

| Ratio | Mín | Dónde |
|---|---|---|
| **3.82:1** | 4.5 | blanco sobre `#E74C3C` — botón **"No"** del toggle preventivo |
| **4.09:1** | 4.5 | `#6B7280` sobre `#E8ECF5` — ese mismo toggle, **sin responder** |
| **3.32:1** | 4.5 | blanco sobre `#27A06B` — fila **"Total año"** del Excel que lee el administrador |

Los dos primeros están en la pantalla donde el técnico marca **cada servicio Sí o No**, al sol, con
una mano. El estado "sin responder" es justo el que tiene que leer para saber qué le falta.

Y la línea que lo explica todo:

```js
const siSt = svc.respuesta === 'si' ? 'background:var(--verde-btn);color:white;' : '...';
const noSt = svc.respuesta === 'no' ? 'background:#E74C3C;color:white;'         : '...';
```

**El "Sí" estaba migrado a token. El "No" no.** En la misma línea, con la misma forma. No fue
descuido: **la tarea era "migrar los verdes"**, y la lista de verdes no incluía al rojo.

`#E74C3C` era además un **quinto rojo** que ningún documento mencionaba (`--rojo` es `#D32F2F`).

### ✅ `check-contraste.js` ahora tiene dos partes

1. **Pares curados** (22): los que solo se ven leyendo el CSS por clases — `.btn-primary` define su
   fondo, el blanco viene de otra regla. Un escáner no los puede emparejar.
2. **Escaneo por regla**: busca **cualquier** `background: X; color: Y` en todo el archivo —CSS,
   atributo `style=`, fragmento construido en JS, plantilla de Excel— resuelve `var()` y mide.

```
node check-contraste.js  →  Parte 1: 22 pares · 0 fallos · 2 tolerados
                            Parte 2: 26 pares · 0 fallos · 1 tolerado
```

> Era el último de los cinco que recitaba. `check-emojis` pasó de lista a **rango unicode**,
> `check-tokens` a **escaneo del `:root`**, `check-tildes` a la **regla del `-ion`**. Cada conversión
> encontró algo que la lista no veía: `⌫`, `▼`, `recepcion`, `DISTRIBUCION`. Ésta encontró tres.

### 🐛 El diálogo que escribí para "arreglar la accesibilidad" se rompía con el teclado

`.dlg` no tenía `max-height`. `.dlg-overlay` no tenía `overflow-y`. Los **tres modales viejos** sí:
`max-height: 80vh / 84vh / 86vh` con scroll interno.

En un teléfono, al enfocar el campo de contraseña, el teclado se come ~55% del viewport. El diálogo
está centrado y **no scrollea**: el botón **"Confirmar"** queda fuera de la pantalla, inalcanzable.

Es el diálogo de la **contraseña de administrador**. Lo escribí ayer, en el commit donde arreglé la
accesibilidad. Introduje el único bug que los modales viejos no tenían.

> **Y `check-a11y.js` no lo vio**, porque la regla que escribí verificaba que el modal *tuviera*
> `role="dialog"` — no que se pudiera **usar**. Regla nueva: *todo overlay scrollea y todo diálogo
> declara `max-height`*.

### 🎨 La segunda paleta: mi propia propuesta era demasiado burda

En la crítica escribí: *"extender `check-tokens.js`: todo hex fuera de `:root` es un fallo"*.
**Estaba equivocado.** Al medir los 60 hexes sueltos aparecieron tres categorías **legítimas**:

- **La paleta de avatares** (`colores[]`, `COLORES_SUP`). Este documento ya dice que **no se toca**:
  Pedro pidió un color propio por técnico y el hash debe ser estable.
- **Colores de marca de terceros**: `#F7941D` es de la cadena **S10**, `#25D366` de WhatsApp.
- **Tintes de estado** (`#E6F4EA` + `#1A7A3C`, `#FEF3C7` + `#78350F`…): pares fondo-pálido/texto-oscuro
  que **pasan AA** y cumplen un rol que ningún token cubría.

Forzarlos a tokens habría roto identidades que el cliente pidió. La distancia RGB tampoco sirve como
regla general: `#E6F4EA` (verde pálido) queda "cerca" de `--gris2` sin serlo.

**Lo que sí era un accidente**: **13 usos** de grises a distancia **1-6** de un token neutro —
`#EEF2FA`, `#EDF0F5`, `#F8F9FB`, `#F5F5F5`, `#F1F5F9`. A esa distancia no hay ambigüedad de tono: es
el mismo color, escrito dos veces. Migrados. Los del Excel usan ahora el **hex exacto** del token,
porque ahí el `:root` no viaja.

**Regla nueva en `check-tokens.js`:** hex a distancia `0 < d ≤ 6` de un token **neutro** → error.
Distancia 0 se permite (ese hex *es* el token). Nada de listas.

### ♿ Fotos, foco y una regla duplicada

- **17 imágenes sin `alt`.** *(Mi crítica dijo 19: dos ya lo tenían, y mi grep buscaba `alt=` en HTML
  sin ver `img.alt =` en JS. Medí lo que no era.)* Las fotos del trabajo llevan alt descriptivo
  (*"Foto del estado inicial 2"*); los logos de cadena llevan `alt=""` porque son decorativos —
  el nombre de la cadena va siempre al lado.
- **`go()` no movía el foco.** Las 16 pantallas viven en el mismo DOM: al cambiar, el botón que
  tocaste desaparece y el foco cae al `<body>`. Ahora enfoca el `<h1>` del topbar con `tabindex="-1"`
  (foco programático → no dispara `:focus-visible`, así que no aparece ningún anillo).
- **Mi regla `@media (prefers-reduced-motion) { .campo-error { animation: none } }` era redundante:**
  ya existía una regla global `*` con `animation-duration: 0.01ms !important`. La escribí sin
  comprobar lo que había.

### Lo que fui a buscar y NO era un problema

- **Objetivos táctiles.** 46 botones creados en JS. La regla global `button { min-height: 32px }` los
  rescata a todos, y los tres del flujo del técnico miden **51/51/46px**. Medí antes de acusar.
- **`prefers-reduced-motion`.** 5 `@keyframes`, todos cubiertos por la regla global.
- **El verde de `index.html:794`.** Es el relleno de un ícono de 42×42 **sin texto encima**:
  `--verde` de estado es correcto ahí.

### Verificación

```
node check-contraste.js  →  48 pares (22 curados + 26 escaneados) · 0 fallos   exit 0
node check-emojis.js     →  0 emojis a color                                   exit 0
node check-tokens.js     →  0 fantasmas · 0 muertos · 0 grises duplicados      exit 0
node check-tildes.js     →  0 palabras sin tilde                               exit 0
node check-a11y.js       →  7 reglas en verde (zoom, 16px, dialogos, modales,
                            scroll de modal, toast, doble envio)               exit 0
bash check-mutantes.sh   →  24 mutantes · 0 puntos ciegos                      exit 0
sintaxis                 →  0 errores en los 3 bloques <script>
```

---

### La lección, en su forma final

Seis veces seguidas, en este proyecto, el mismo error tomó una forma nueva:

| Qué se arregló | Con qué mapa | Qué sobrevivió |
|---|---|---|
| Emojis → SVG | una lista de emojis | `👁` `⚙️` `📤` `⌫` `▼` |
| Radios → tokens | "los valores ya son 4" | 163 literales sin token |
| Ortografía | pantalla por pantalla | 16 tildes |
| `check-tildes` | un diccionario de 20 palabras | `accion`, `recepcion`, `DISTRIBUCION` |
| Colores → tokens | **la lista de verdes** | el rojo del "No", en la misma línea |
| `check-contraste` | 22 pares curados | los 3 fallos que no eran tokens |

> **Un check con una lista no verifica: repite.** Y su punto ciego es siempre el mismo que el del
> fix que lo acompañó, porque los dos se escribieron mirando el mismo mapa.
>
> La única salida es una **regla** — un rango unicode, un escaneo del `:root`, la terminación `-ion`,
> `background` junto a `color`. Y la única prueba de que la regla funciona es **verla fallar**:
> `check-mutantes.sh`.

---

## Crítica del 2026-07-09 (madrugada) — el botón que maté al arreglarlo

El hallazgo más grave de esta pasada **lo introduje yo**, la noche anterior, en el commit
`00815d3`, que arreglaba la accesibilidad. No llegó a ningún técnico: se encontró antes del push.

### 🔴 1. `_bloquear()` cambió un bug ruidoso por uno silencioso

La guarda de doble toque apagaba el botón, corría el `await`, y lo reactivaba en un `finally`.
Pero si la promesa **nunca se resuelve**, el `finally` no corre. Y esa promesa no se resuelve
offline — lo decía el comentario de `_conTimeout`, escrito **antes** que mi guarda:

> *"el SDK de Firestore, con mala señal y sin persistencia, deja el `add()`/`set()` colgado sin
> resolver ni rechazar"*

`_conTimeout` existía. Se aplicaba a `ordenes` (25 s). **No se aplicaba a `tecnicos`, `cadenas`
ni `cotizaciones`.** Pedro tocaba "Guardar" en su teléfono, el botón se atenuaba al 55%, y se
quedaba así hasta recargar la app. Sin toast, sin error, sin reintento.

| Sitio | Guarda | Síntoma |
|---|---|---|
| `guardarTecnico` | `#btn-guardar-tecnico` | botón atenuado para siempre |
| `guardarCadenaEdicion` | `#btn-guardar-cadena` | ídem |
| `guardarCotizacion` | `#btn-guardar-cot` | ídem |
| `confirmarAceptarCotizacion` | `_ocupado('aceptar-cot')` | **peor: el botón se veía normal y no hacía nada** |

**Antes de mi commit, el bug era un duplicado. Después, un botón muerto.** Un fallo ruidoso por
uno silencioso, que es la dirección equivocada.

**El fix tiene dos capas, y solo una es una regla:**
1. `_conTimeout(…, 25000)` en las 12 escrituras. Eso es recorrer una **lista de sitios**.
2. Un **guardia de tiempo dentro de `_bloquear()` y `_tomar()`** (30 s). Pase lo que pase —un
   `await` nuevo que nadie envolvió, un cargador colgado— el botón vuelve y el usuario se entera.
   Eso es la **regla**, y es la que atrapa el sitio que nadie visitó.

Los 25 s del `_conTimeout` van *por debajo* de los 30 s del guardia a propósito: el camino normal
de error gana, y el guardia es la red.

### 🔴 2. Un timeout no es un fallo: es no saber

Envolver los `await` en `_conTimeout` abre un agujero nuevo. Firestore **encola** la escritura y
la manda al reconectar. Decirle a Pedro *"Error guardando técnico"* tras un timeout haría que
volviera a tocar Guardar — y crearía **el duplicado que la guarda existía para evitar**.

`_esTimeout(e)` distingue los dos casos. El mensaje honesto es:

> *"Sin respuesta del servidor. Revisa la lista antes de volver a guardar: el técnico puede
> haberse creado igual."*

> **Regla:** un arreglo que produce un mensaje falso no está terminado. El mensaje es parte del fix.

### 🔴 3. El toast: 2.500 ms fijos para mensajes de 6 a 73 caracteres

Un solo `setTimeout(…, 2500)` servía a **117 mensajes distintos**, y es el **único canal de
feedback de la app**. Medido a 15 car/s (tercera edad, pantalla al sol) + 800 ms para *notar* que
algo apareció abajo: **43 de 117 no alcanzaban a leerse.** El peor necesitaba **2,3×** su tiempo.

Entre ellos, la frase sobre la que descansa toda la confianza offline de la app:

> *"✓ OT guardada. Se subirá sola al mejorar la señal."* — 50 car, necesita 4.133 ms, tenía 2.500.

**Esa misma frase ya había fallado una vez**, por ancho (`white-space: nowrap` sin `max-width`).
Las dos veces por la misma causa: **una constante elegida sin mirar el contenido que iba a
contener.**

También es un fallo de **WCAG 2.2.1 (Timing Adjustable, nivel A)** — más severo que los AA ya
corregidos: el contenido impone un límite de tiempo que el usuario no puede ajustar, y la
información no está en ningún otro lado.

**Fix:** `_toastDuracion(msg) = clamp(2500, 800 + largo/15 × 1000, 9000)`. Se cierra al tocarlo.
Se pausa bajo el puntero — **solo donde hay puntero**: en un teléfono `mouseenter` se emula al
tocar pero `mouseleave` puede no llegar nunca, y el toast se quedaría en pantalla con su
temporizador ya cancelado. Misma razón por la que los hovers viven bajo `@media (hover: hover)`.

> `Math.ceil`, no `Math.round`: redondear hacia abajo deja el mensaje 0,3 ms corto. Da igual en la
> práctica, pero **un piso que a veces está por debajo del piso no es un piso.**

### 🟠 4. Cinco cargadores mentían cuando Firestore fallaba

Una lista vacía por falta de red se ve **idéntica** a una lista vacía porque no hay datos. Pedro
concluye que no tiene técnicos.

**Y este bug ya se había arreglado.** Este documento lo cuenta con orgullo: `cargarPausadasSupervisor`
pasó de `console.error` a `_mostrarErrorPausadasSup(...)` con botón **Reintentar**, precisamente
porque *"una lista congelada se veía idéntica a 'sin pausadas'"*. **El arreglo visitó una función.**

| Función | Qué veía el usuario |
|---|---|
| `cargarTecnicosAdmin` | pestaña **Personal** vacía |
| `cargarCadenasAdmin` | pestaña **Cadenas** vacía |
| `cargarOTsSupervisor` | la **lista principal del supervisor**, vacía |
| `_renderPausadasEnCadena` | **la sección de trabajo pausado DESAPARECÍA** (`display:none` en el `catch`) |
| `verOTsTecnico` | la pantalla se quedaba en *"Cargando…"* **para siempre** |

Los dos últimos **no los encontró la crítica: los encontró la regla nueva**. `verOTsTecnico` tenía
dos `await db.collection(…).get()` **fuera de todo `try`**: si la red fallaba, la promesa se
rechazaba, nadie la atrapaba, y el técnico se quedaba mirando "Cargando…".

**Fix:** helper `_listaConError(contenedor, alReintentar)` + una regla en `check-a11y.js`.

### 🟡 5. La app llamaba a la misma cosa de cinco maneras

Cinco formas de decir lo mismo: `"No hay OTs registradas"`, `"Sin OTs registradas"`, `"Aún no hay
OTs registradas"`, `"No hay OTs registradas hoy"`, `"No hay OTs preventivas registradas"`. Dos para
sucursales. Y de ~15 estados vacíos, **2 enseñaban qué hacer**.

**Y este fix también había visitado una lista.** El documento dice que *"los 6 estados vacíos de
cotizaciones, que decían la misma cosa de 4 formas distintas"*, se unificaron. Se unificaron **los
de cotizaciones**.

**Fix:** helper `_vacio(mensaje, ayuda)` — el título constata, la ayuda enseña qué hacer o **qué
esperar** cuando no hay nada que hacer (*"Aparecerán aquí cuando un técnico cierre la primera"*).
14 sitios migrados. Tamaños 15px/12px: los pasos *body* y *small* de §3, migración oportunista.

> **Y aquí me equivoqué en la crítica.** Escribí que *"la misma entidad tiene dos nombres: la
> pestaña dice **Personal** y el modal dice **técnicos**"*, y propuse elegir uno. Al ir a leer el
> código: `cargarTecnicosAdmin` **no filtra** (lista técnicos + supervisor + administrador), y
> `_cargarListaTecnicosEnModal` **sí filtra** a técnicos. **Son dos conjuntos distintos y los dos
> nombres son correctos.** Unificarlos habría sido una regresión. *Medir antes de acusar*, otra vez.

### 🟡 6. Un icono que no podía dibujarse jamás

La única línea `<i>` del archivo:

```js
iconEl.innerHTML = '<i class="ti ti-' + (iconosTipo[d.tipo]||'map-pin') + '" …></i>';
```

Eso es **Tabler Icons por fuente**. Los únicos `<link>` del documento son el manifest, el
`apple-touch-icon` y Google Fonts. **La hoja de Tabler no se carga en ninguna parte**, y no existe
regla `.ti` en el `<style>`. Una caja de 40×40 vacía, para siempre.

`check-emojis.js` no lo veía, y no era descuido: verificaba *"no hay emojis"*, **no *"todo icono se
dibuja"***. Ahora declara las familias de icon-fonts conocidas y falla si el prefijo de clase
aparece sin que ningún `<link>` cargue su hoja. Y falla ante cualquier `<i>`: la iconografía de
esta app es SVG inline con `currentColor`, y no hay ni una cursiva legítima.

### 🧹 7. `locales` era un cementerio, no una feature a medio cablear

Ver la corrección arriba. **7 funciones borradas, ~97 líneas.** Se conserva `seleccionarLocal`
(la usa la lista de sucursales) y las clases `.local-item/.local-info/.local-name/.local-addr`
(idem). Murió `.local-icon`, que solo servía al `<i>` que no dibujaba.

Nota: `mostrarFormLocal()` referenciaba `#form-local-titulo`, **que no existe en el markup**.
Habría lanzado un `TypeError` si alguien la hubiera llamado. Era la prueba de que nadie lo hacía.

---

### 🔍 Tres puntos ciegos de mis propias sondas, en una sola sesión

Cada uno corregido midiendo, y cada uno más instructivo que el hallazgo:

1. **`[^;]*` se cortó en el `;` de `color:var(--rojo);`**, dentro de un atributo `style`. Marcó como
   mudos a `cargarVentas` y al modal de técnicos, que **sí** avisan.
2. **El regex de "guía" matcheaba `registra` dentro de `registradas`** — un participio, no un
   imperativo. Contó 9 estados vacíos guiando cuando eran 2.
3. **El tokenizador de estados vacíos usó `[^'"]`** y se rompió con las comillas de `style="…"`.
   Perdió *"Sin trabajos pausados. Pausa una OT…"*, uno de los dos buenos.

Y **acusé a `cargarUsuariosApp` de ser muda**: es la función mejor escrita del archivo (cache-first,
sin confiar en `navigator.onLine`). También fui a buscar un bug en el `catch` de
`_renderPausadasEnCadena` por su `display='none'`; su llamada a Firestore tiene un `.catch` propio
que **igual pinta las pausadas desde localStorage**. El `display='none'` sí era un bug, pero por
localStorage corrupto, no por red.

> La regla `cargador-mudo` empezó marcando `editarSucursal`, que **no carga una lista**: construye
> un modal cuyo botón de guardar escribe más tarde, dentro de su propio handler con su propio
> `catch`. La solución **no fue una allowlist**: fue definir "cargador" por su **forma** —una función
> que lee Firestore *en su propio cuerpo*, no dentro de un callback. Una allowlist es una lista, y
> las listas se pudren.

### 🔡 `check-tildes.js` no veía los plurales

El diccionario de irregulares guardaba `tecnico`. `"No hay tecnicos registrados"` pasaba limpio.
En español una **esdrújula conserva la tilde al pluralizar** (`técnico→técnicos`), al revés que las
agudas en `-ion`, que la pierden (`acción→acciones`). Otra lista con el borde mal dibujado.

Y al nacer `_vacio()`, **14 mensajes visibles salieron de `textContent =`**. Sin añadir dos patrones
a `VISIBLE`, el script habría seguido diciendo *"0 sin tilde"* mientras dejaba de mirarlos.

> **Regla:** cada vez que nace una superficie de texto visible, el check que la vigila crece con
> ella. Un check que no declara **dónde busca** no se puede evaluar.

---

### Los 6 verificadores, hoy

| Script | Vigila | Nació de |
|---|---|---|
| `check-contraste.js` | WCAG AA sobre la superficie real (22 pares + escaneo) | el verde que pasó 4 críticas |
| `check-emojis.js` | iconografía SVG única · **y que todo icono pueda dibujarse** | emojis, y un `<i>` sin su fuente |
| `check-tokens.js` | tokens reales + zona de CSS exportado | radios que el doc daba por normalizados |
| `check-tildes.js` | ortografía visible (regla `-ion` + irregulares **y sus plurales**) | 16 tildes que 4 pasadas no vieron |
| `check-a11y.js` | **12 reglas** (ver cabecera) | se escribió antes del fix |
| `check-mutantes.sh` | **a los otros cinco** | 3 checks que mintieron en verde |

### Verificación

```
node check-contraste.js  →  48 pares · 0 fallos · 2 tolerados             exit 0
node check-emojis.js     →  0 emojis · 0 iconos que no puedan dibujarse   exit 0
node check-tokens.js     →  0 fantasmas · 0 muertos · 0 grises duplicados exit 0
node check-tildes.js     →  0 palabras sin tilde (incluidos plurales)     exit 0
node check-a11y.js       →  12 reglas en verde                            exit 0
bash check-mutantes.sh   →  34 mutantes · 0 puntos ciegos                 exit 0
sintaxis                 →  0 errores en los 3 bloques <script>
```

---

### La lección, séptima forma: el fix que introduce el bug

Las seis formas anteriores eran todas la misma: *el arreglo recorrió una lista, y la verificación
usó esa misma lista.* Ésta añade una vuelta más.

| Qué se arregló | Qué se introdujo |
|---|---|
| `confirm()`/`prompt()` → diálogo propio | el diálogo no tenía `max-height`: inalcanzable con el teclado |
| doble toque → `_bloquear()` | el botón podía quedarse apagado **para siempre** |
| `await` colgado → `_conTimeout()` | un timeout que dice *"Error"* provoca el duplicado que evitaba |
| toast truncado → `max-width` | seguía truncado, **en el tiempo** |

> **Un arreglo es un cambio, y todo cambio necesita su propio check.** Los tres primeros los
> encontró una regla escrita *después*. El cuarto lo encontró medir el contenido en vez de mirarlo.
>
> Y el corolario, que es el que duele: **los seis verificadores estaban en verde mientras el botón
> de Pedro se moría.** Un check no vigila lo que no se le pidió vigilar. La pregunta al terminar un
> fix no es *"¿pasan los checks?"* sino **"¿qué acabo de hacer posible que antes era imposible?"**

---

## Crítica del 2026-07-09 (mañana) — los bordes que nadie miraba

### 🔴 1. Ningún control que toca el técnico tenía un límite visible

WCAG 2.1 **SC 1.4.11 (Non-text Contrast, nivel AA)** exige **3:1** para el límite visual de un
control. Medido:

| Control | Borde | Contraste |
|---|---|---|
| `.pin-dot` — los 4 puntos del PIN | `--gris3` | **1,55:1** |
| `.foto-box` — la caja de fotos | `--gris3` punteado | **1,43:1** |
| `.firma-container` — el recuadro de firma | `--gris3` punteado | **1,43:1** |
| `.field input / select / textarea` | `--gris2` | **1,05:1** |
| `.tipo-card` — Preventivo/Correctivo | `--gris2` | **1,05:1** |
| `.paused-order-card` | `#FCD34D` sobre su ámbar | **1,29:1** |

Y el icono de cámara dentro de la caja de fotos, a **1,47:1**. Lo único legible ahí era la
etiqueta *"Antes 1"*.

**Lo que eso significa en el login:** los puntos **vacíos** del PIN estaban a 1,55:1; los **llenos**
son azul institucional a 11,27:1. Un técnico mayor, al sol, veía **cuántos dígitos llevaba
escritos, pero no cuántos le faltaban.** Los tres puntos vacíos, sencillamente, no estaban.

**Y el código se desviaba de este documento.** §4 mandaba `#C8D0E0` para el borde de los inputs;
el código usaba `--gris2` (`#EEF1F7`), **más claro todavía**. Alguien aclaró el borde documentado y
no lo anotó. Ninguna de las dos versiones pasaba.

**Fix:** `--gris3` de `#C8D0E0` a **`#7F899E`** — el gris tintado hacia el azul de marca **más
claro** que pasa 3:1 contra la peor superficie. Y los 28 bordes de control que usaban `--gris2`
pasan a `--gris3`. La card de OT pausada usa **`--naranja-btn`** (`#B45309`, 4,51:1), que ya
existía: **no se inventó ni un color**.

> Efecto colateral bienvenido: los chevrons de `.usuario-arrow` pasaron de 1,55:1 a **3,52:1**, y
> los dots inactivos del step-indicator, igual. Eran affordances invisibles.

### 🔴 2. `check-contraste.js` no cubría 1.4.11 — y su cabecera afirmaba algo falso

El script decía, sobre sus 22 pares curados:

> *"pares que solo se ven leyendo el CSS por clases. **Un escáner no los puede emparejar.**"*

**Era falso.** Un escáner sí puede: parsea las reglas, resuelve los selectores descendientes, y
empareja. La nueva **parte 3** lo hace en 40 líneas y encuentra **6 pares**. Uno de ellos,
`.lista-error`, se escribió **anoche, para arreglar un bug**, y nadie lo estaba midiendo.

Y la **parte 4** cubre el criterio entero que faltaba: **52 controles**, de los cuales **47
fallaban**. Ninguna de las dos partes es una lista.

> **No es que la lista estuviera desactualizada. Es que se escribió una lista y se justificó con
> una imposibilidad que no era cierta.** Antes de curar una lista, intenta la regla.

**Tres puntos ciegos más, encontrados al escribir la parte 4:**
- Once controles se construyen en JS con `style.cssText` — el escaneo de markup no los veía.
- Dos `onblur` restauraban `var(--gris2)` **después** de que todo lo demás usara `--gris3`: el
  campo se veía… hasta que lo tocabas y lo soltabas. Ningún escaneo de `border:` lo habría
  encontrado, porque ahí la propiedad se llama `borderColor`.
- La primera versión de la regla acusó a `.ot-card` y `.pin-btn`, que se ven perfectamente. La
  solución **no fue una allowlist**: fue distinguir por forma. Un control se mide por su **borde**;
  un indicador de estado sin borde (`.step`, 8px) se mide por su **relleno**, porque el relleno es
  toda su información. Una card se identifica por su texto.

### 🟠 3. El toast que arreglé anoche tapaba la barra de pendientes

`#toast` en `bottom:24px`, `z-index:9999`. `#pending-bar` en `bottom:70px`, `z-index:8888`. Un
toast de dos líneas llega a 84px. **Al hacer la duración proporcional (hasta 8,3 s) tripliqué el
tiempo que pasa encima.**

El caso concreto: el técnico cierra una OT sin señal, sale *"OT guardada. Se subirá sola…"* (4,1 s)
justo encima de *"N OTs pendientes"*, que es **tappable** y es lo que iba a tocar. El toast se
comía el toque.

**Fix:** `_toastAbajo()` mide la geometría real de las tres barras y posa el toast encima de la más
alta. No fija constantes: las barras cambian de altura con el texto.

### 🟠 4. Dos botones verdes idénticos en la pantalla que cierra la OT

```
✓ Confirmar firma          ← un paso, dentro de la card de firma
✓ Cerrar y generar OT →    ← terminal, irreversible, dispara PDF y correos
```

§4 lo prohibía desde siempre y **nadie lo verificaba**. También `#panel-personal` tenía dos
`btn-primary` visibles. Ahora "Confirmar firma" y los dos "+ Agregar" son secundarios, y la
**regla 13** de `check-a11y.js` lo vigila — distinguiendo paneles de pestaña (excluyentes) y
modales (contexto propio), porque sin esas dos distinciones acusaba a quien no debía.

### 🟡 5. Nueve de quince cargadores no decían que estaban trabajando

Una lista tiene **tres** estados y solo dos tenían helper: `_vacio()` y `_listaConError()`. El
tercero faltaba. El panel "Personal" y la lista principal del supervisor se quedaban **en blanco**:
Pedro no sabía si cargaba, si estaba vacío, o si la app se había colgado.

El skeleton **ya existía y era bueno** (`.usuario-skeleton`). Solo lo usaba el login. Renombrado a
`.sk-fila` y servido por **`_cargando(contenedor, filas)`**, con `aria-busy` y su `_cargado()`
obligatorio — *un `aria-busy` pegado anunciaría "cargando" para siempre*. **Regla 14.**

Tres exentos, con razón escrita: `cargarUsuariosApp` (cache-first, parpadearía sobre datos ya
pintados), `_renderPausadasEnCadena` (pinta desde localStorage) y `descargarExcelVentas` (exporta
un archivo, no pinta una lista).

---

### Los 6 verificadores, hoy

| Script | Vigila | Nació de |
|---|---|---|
| `check-contraste.js` | **4 partes**: curados · escaneo · herencia por selector · **SC 1.4.11** | el verde que pasó 4 críticas, y una cabecera que mentía |
| `check-emojis.js` | iconografía SVG única · y que todo icono **pueda dibujarse** | emojis, y un `<i>` sin su fuente |
| `check-tokens.js` | tokens reales + zona de CSS exportado | radios que el doc daba por normalizados |
| `check-tildes.js` | ortografía visible (regla `-ion` + irregulares y sus plurales) | 16 tildes que 4 pasadas no vieron |
| `check-a11y.js` | **14 reglas** (ver cabecera) | se escribió antes del fix |
| `check-mutantes.sh` | **a los otros cinco** | 3 checks que mintieron en verde |

```
node check-contraste.js  →  22 curados + 26 escaneados + 6 heredados + 52 limites   exit 0
node check-emojis.js     →  0 emojis · 0 iconos que no puedan dibujarse             exit 0
node check-tokens.js     →  0 fantasmas · 0 muertos · 0 grises duplicados           exit 0
node check-tildes.js     →  0 palabras sin tilde (incluidos plurales)               exit 0
node check-a11y.js       →  14 reglas en verde                                      exit 0
bash check-mutantes.sh   →  41 mutantes · 0 puntos ciegos                           exit 0
```

---

### La lección, octava forma: la imposibilidad que nadie comprobó

Las siete anteriores decían: *el arreglo recorrió una lista, y la verificación usó esa misma lista.*
Ésta es peor, porque venía con una **justificación escrita**:

> *"Un escáner no los puede emparejar."*

Esa frase, en la cabecera del propio verificador, sostuvo una lista de 22 entradas y un criterio
WCAG entero sin cobertura. Nadie la comprobó — **yo tampoco, durante dos críticas** — porque venía
en el archivo que se supone que sabe.

> **Cuando un comentario explica por qué algo no se puede hacer, ese comentario es una hipótesis.**
> Y las hipótesis se miden. Ésta tardó veinte minutos en caerse, y debajo había el borde invisible
> de todos los controles que un técnico de tercera edad toca bajo el sol.

---

## Crítica del 2026-07-09 (mediodía) — el check que decía cero teniendo uno

### 🔴 1. `check-tildes.js` tenía un falso negativo. La unidad de la exclusión era la línea.

```js
if (/console\.(log|warn|error)/.test(linea)) return; // logs: no los ve el usuario
```

El comentario es correcto: nadie lee los `console.*`. Pero **la línea no es la unidad**. El patrón
de manejo de errores dominante del archivo cabe entero en una:

```js
} catch(e) { console.error(e); toast('Error cargando facturacion'); }
```

El `toast()` **visible** se iba al cubo junto con el `console.error`. **98 líneas** del archivo
tienen un `console.*`; **seis** llevan además texto que el usuario lee. Reportaba `0` teniendo `1`.

**Y `check-a11y.js` declara, en su propia cabecera, la doctrina de este repo:**

> *"Un falso negativo silencioso es el peor resultado posible. Errar hacia el falso positivo,
> nunca hacia el falso negativo."*

**Los 41 mutantes no lo vieron**, porque todos inyectaban el defecto en líneas **sin** `console`.
Un mutante prueba que la regla funciona *donde el check mira*. No prueba dónde deja de mirar.

**Fix:** se vacía la **expresión** (paréntesis balanceados, comillas respetadas), no la línea.
Lo mismo con `DATOS_INTOCABLES`, que también excluía la línea entera. Y un mutante nuevo:
*"tilde escondida tras un `console.error`"*.

> **Regla:** al escribir una exclusión, pregunta cuál es su unidad. Casi nunca es la línea.

### 🔴 2. El skeleton que añadí por la mañana parpadeaba sobre datos correctos

`_cargando()` reemplazaba **siempre** el contenido. Pero estos cargadores no solo se llaman al
entrar a una pantalla: se llaman **después de cada mutación**, para refrescar. `cargarCadenasAdmin`
cinco veces, `cargarCarpetas` cuatro, `cargarTecnicosAdmin` tras guardar y tras borrar,
`cargarOTsSupervisor` tras guardar una cotización. **Doce sitios.**

Pedro guardaba un técnico, la lista **se borraba**, aparecían tres esqueletos grises, y volvía.
Arreglé *"el panel en blanco"* y creé *"el panel que titila"*.

**Fix:** el skeleton solo se pinta si no hay nada que preservar, o si lo único que hay es un
estado vacío o de error (ahí sí es la respuesta correcta a un *"Reintentar"*).

> Y **la regla que escribí para vigilarlo tenía el mismo defecto que el código**: comprobaba que
> las palabras `children.length` y `estado-vacio` estuvieran *escritas*, no que el `return`
> hiciera algo. Un mutante que borraba solo el `return` sobrevivió. Ahora la regla exige el
> **orden**: `children.length` … `return` … `innerHTML`.

### 🟠 3. Veintiuno de veintinueve errores no decían qué hacer, y seis filtraban el SDK

```
"Error"                        "Error: "                    "Error eliminando"
"Error al pausar"              "Error cargando facturacion"
```

Y seis mostraban el string interno que Firebase le devolvió al SDK:
`toast('Error: ' + e.message)`.

§7 promete que la app *"nunca te deja con dudas sobre qué pasó"*. Un toast que dice **"Error"**
hace exactamente lo contrario, y encima suena a culpa. Los ocho buenos eran los ocho que se
habían escrito dos días antes para el timeout: **se arregló el bug, no la voz.**

**Fix:** `_error(accion, e, queHacer)`. Una sola forma: *"No se pudo {acción}. {qué hacer}."*
El `e.message` va a la **consola**, nunca a la pantalla. 30 sitios migrados, 11 `console.error`
duplicados eliminados (el helper ya loguea).

```
toast que empiezan por "Error":  0
toast con e.message:             0
```

### 🟠 4. El error era visible, pero no perceptible

`#toast` era la **única** región `aria-live` de toda la app. `_listaConError()`, `_vacio()`,
`_cargando()` y `_mostrarErrorPausadasSup()` escriben en el DOM y **no anunciaban nada**. Un
administrador con lector de pantalla tocaba "Personal", fallaba la red, y oía **silencio**: la app
pintaba un recuadro ámbar con un botón "Reintentar" que él no sabía que existía.

**Fix:** región `#anuncios` (`.solo-lector`, `aria-live="polite"`, `aria-atomic`) y `_anunciar()`,
llamado por los dos componentes de error. **Los estados vacíos no se anuncian a propósito**: viven
en el flujo del documento y el lector los encuentra al navegar; anunciarlos sería ruido.

> No se usa `display:none` para ocultarla: un `aria-live` oculto así está **fuera del árbol de
> accesibilidad**. Es exactamente la trampa que ya tuvo `toast()`. Se oculta visualmente
> (`clip: rect(0 0 0 0)`), no semánticamente.

### 🟡 5. §6 era falso en sus dos afirmaciones

Ver §6, reescrito. Siete `transition: all` sustituidas por su lista explícita; las tres
animaciones en loop declaradas con lo que comunican; la `width` del step-indicator declarada como
la única excepción de layout, con su razón. **`check-tokens.js` falla ante cualquier otra.**

---

### 🔍 El helper nuevo que cegó a la regla vieja

Al migrar los `catch` de `toast('Error…')` a `_error(accion, e)`, la **regla 10** (`cargador-mudo`)
se puso roja de golpe en **seis cargadores que sí avisaban**. Su expresión `AVISA` conocía
`toast(`, `_listaConError(`, `_avisar(` — y no `_error(`, que acababa de nacer.

**Que se pusiera roja es la prueba de que la regla sirve.** Si hubiera seguido verde, no habríamos
sabido que dejó de mirar.

> **Regla:** cada helper nuevo que produce una salida de usuario es una superficie nueva. Búscala
> en todos los checks que la vigilaban bajo otro nombre. `check-tildes` lo aprendió con `_vacio()`;
> `check-a11y` lo aprendió hoy con `_error()`.

---

### Los 6 verificadores, hoy

| Script | Vigila | Nació de |
|---|---|---|
| `check-contraste.js` | 4 partes: curados · escaneo · herencia · **SC 1.4.11** | el verde que pasó 4 críticas, y una cabecera que mentía |
| `check-emojis.js` | iconografía SVG única · y que todo icono **pueda dibujarse** | emojis, y un `<i>` sin su fuente |
| `check-tokens.js` | tokens · CSS exportado · **motion (§6)** | radios que el doc daba por normalizados |
| `check-tildes.js` | ortografía visible · **excluye la expresión, no la línea** | 16 tildes que 4 pasadas no vieron, y una que él mismo escondía |
| `check-a11y.js` | **17 reglas** (ver cabecera) | se escribió antes del fix |
| `check-mutantes.sh` | **a los otros cinco** | 3 checks que mintieron en verde |

```
node check-contraste.js  →  22 + 26 + 6 pares · 52 limites · 0 fallos     exit 0
node check-emojis.js     →  0 emojis · 0 iconos que no puedan dibujarse   exit 0
node check-tokens.js     →  0 fantasmas · 0 transition:all · 3 loops      exit 0
node check-tildes.js     →  0 palabras sin tilde (por expresion)          exit 0
node check-a11y.js       →  17 reglas en verde                           exit 0
bash check-mutantes.sh   →  50 mutantes · 0 puntos ciegos                exit 0
```

---

### La lección, novena forma: el punto ciego estaba en la exclusión

Las ocho anteriores estaban en lo que el check **incluía**: una lista de emojis, una lista de
verdes, un diccionario de veinte palabras, una lista de 22 pares. Ésta estaba en lo que **excluía**.

| Qué se verificaba | Qué se excluía | Qué se escondía ahí |
|---|---|---|
| ortografía visible | la **línea** con `console.*` | `"Error cargando facturacion"` |
| doble envío | funciones con razón escrita | *(nada — la allowlist era correcta)* |
| contraste | pares "que un escáner no puede emparejar" | 52 controles sin borde visible |

> Una regla se lee entera: lo que afirma **y** lo que se calla. Y los mutantes solo prueban la
> primera mitad — todos los nuestros inyectaban el defecto donde el check ya estaba mirando.
>
> **La pregunta que ningún `check-mutantes.sh` responde solo:** *¿dónde decidí no mirar, y por qué
> creí que ahí no había nada?*

---

## Crítica del 2026-07-09 (tarde) — el verde que nadie había nombrado, y dos exclusiones

Auditoría **medida**. Cinco hallazgos. **Cuatro estaban en los verificadores, no en la app** —
y uno de ellos estaba escrito, con su hex, en el comentario que explicaba por qué no hacía falta
mirarlo.

### 🎨 1. El tercer verde

Ver la sección *"Tres verdes"* más arriba. `#1A7A3C`, 14 usos, el más frecuente de la app,
sin token, invisible para `check-tokens.js`, conocido solo por una lista curada.

### 🔒 2. `check-tokens.js` prohibía el hex *parecido* a un token y permitía el *idéntico*

```js
if (valoresToken.has(hex)) continue;   // "ES un token"
```

Escribir `background: #1B3A6B` donde toca `var(--azul)` pasaba en silencio. Había **35** así,
en el único archivo cuya cabecera afirma *"la abstracción es real"*. La regla que existe para
probarlo era la que lo permitía.

De esos 35, unos 12 eran hardcodes; los otros ~23 estaban en sitios donde **una custom property
no resuelve**. Todos legítimos, todos por la misma razón, y ninguno declarado.

### 🧱 3. "El token no viaja aquí" existía una vez y ocurría seis veces

La zona `CSS-EXPORTADO` nació cuando un `sed` global de radios rompió el correo de cotizaciones
sin que ningún check lo viera. **La reja se levantó alrededor del único campo que ya se había
quemado.** Cuatro funciones construyen documentos que salen del DOM; solo una estaba dentro.

| Contexto | Por qué el token no llega | Ahora |
|---|---|---|
| Correo (EmailJS) | el `:root` no viaja | zona `CSS-EXPORTADO` |
| **Excel** ×2 | ídem | **zona declarada** |
| **Ventana de impresión** (`document.write`) | ídem | **zona declarada** |
| **Canvas 2D** (`ctx.strokeStyle`) | el contexto 2D no lee CSS | `LITERAL-FIRMADO` |
| **Chart.js** (`grid.color`) | es config JS, no CSS | `LITERAL-FIRMADO` |
| **Atributo SVG** (`stroke="…"`) | presentacional, no CSS | `LITERAL-FIRMADO` |
| **`<meta theme-color>`** | no admite `var()` | `LITERAL-FIRMADO` |
| **Valor de dato** (paleta de avatares) | no es estilo | `LITERAL-FIRMADO` |

La excepción se **firma en el sitio**, no en una lista dentro del checker. Una lista allí
envejece sin que nadie lo note — que es exactamente la clase de fallo que llevamos diez formas
persiguiendo. Escribir la razón cuesta; **ese coste es el punto**.

### 🐛 4. La regla 10 excluía por forma, y su exclusión escondía nueve funciones

```js
if (!/innerHTML|appendChild/.test(cuerpo)) continue;   // exigía PINTAR una lista
```

Nueve funciones leían Firestore en su propio cuerpo y no le decían nada al usuario. **Las nueve
eran invisibles.** Y el `.some()` sobre sus `catch` daba por buena a la función que **avisa una
vez y se calla tres**.

Ahí estaba el bug de terreno. En `cargarOTsTecnicos`, el `catch` **interno** se tragaba el fallo
de red y doce líneas después la pantalla pintaba:

> *"Aún no hay OTs — Aparecerán aquí cuando un técnico cierre la primera."*

El admin veía "no hay OTs" cuando lo que hubo fue un fallo de red. Es **exactamente** el bug para
el que nació la regla 10. El `catch` externo sí avisaba, así que la función pasaba entera.

También: **`verPDFById`** hacía `console.error` y nada más — el técnico tocaba "Ver PDF" sin señal
y la pantalla se quedaba igual. Y **cinco pantallas** reintentaban `setTimeout(…, 800)` para
siempre, en blanco, si Firebase no inicializaba nunca.

Ahora quien lee Firestore y atrapa el error tiene tres salidas, y **callarse por descuido no es
una**: `avisar` · `throw` · `// SILENCIO-FIRMADO: <consecuencia>`.

La firma obliga a escribir la consecuencia. *"El supervisor no verá el PDF"* es una frase que
cuesta teclear. Hay **9 silencios firmados** en la app; cada uno dice qué se pierde.

### 📏 5. La deuda tipográfica estaba mal encuadrada, y por eso llevaba semanas sin moverse

`check-tokens.js` informaba *"132 fuera de escala"*, mezclando dos deudas que no se pagan igual:

| origen | decl | fuera | cómo se paga |
|---|---|---|---|
| `<style>` (reglas CSS) | 56 | 27 | colapsar a la escala: **es diseño** |
| inline (markup + JS) | 251 | 98 | **extraer a clases**; renombrar no arregla nada |
| exportado | 8 | 7 | no se toca |

**El 80 % de los `font-size` no está en la hoja de estilos.** Migrar 251 `font-size:13px` a
`var(--txt-body)` no crea un sistema de diseño: crea la misma deriva con nombres más largos. La
deuda real son los **228 `.style.cssText`** — las 121 clases del `<style>` describen un sistema
que el JS no usa. *Primer paso: una clase, no un token.*

---

### 🔍 La lección del día, DÉCIMA forma: la exclusión se documenta nombrando lo que esconde

Las formas 1–8 estaban en lo que el check **incluía**: una lista de emojis, una lista de verdes,
un diccionario de veinte palabras, veintidós pares curados. La novena, ayer, estaba en lo que
**excluía**: `check-tildes.js` descartaba la línea entera al ver un `console.*`.

Hoy los dos puntos ciegos volvieron a estar en exclusiones. Y esto es lo nuevo:

**Las dos estaban documentadas. Con prosa. Nombrando lo que escondían.**

`check-tokens.js`, justificando su umbral de distancia ≤ 6:

> *"`#E6F4EA` (verde pálido) queda «cerca» de `--gris2` sin serlo"*

`#E6F4EA` es el fondo del badge verde. Está ahí, escrito, en el archivo que existe para probar que
la capa de tokens es real — **archivado como ruido que conviene ignorar**.

`check-a11y.js` tenía tres párrafos explicando por qué un "cargador" debe pintar una lista. Eran
tres párrafos correctos sobre una distinción real. Y detrás vivían nueve funciones mudas.

> **Un comentario que defiende una exclusión no es evidencia de que la exclusión sea correcta.
> Es prosa.** Escribir la justificación se *siente* como haber verificado, y no lo es. Es la misma
> ilusión que "se ve bien", con mejor vocabulario.
>
> Los mutantes no ayudan aquí: prueban que la regla funciona **donde el check ya mira**.
>
> **Lo único que funcionó fue correr cada regla una vez SIN su exclusión, y leer lo que aparecía.**
> Nueve funciones. Treinta y cinco hexes. Cinco reintentos sin final.

Al escribir una exclusión, pregúntate **cuál es su unidad** — ¿la línea? ¿la función? ¿el `catch`?
¿el color? — y luego bórrala una vez y mira. Lo que salga es lo que llevabas semanas sin ver.

*(Y una nota humilde: el comentario que escribí hoy para explicar el reintento infinito citaba el
patrón literal, y se contó a sí mismo como un sexto uso. La trampa que `check-tokens.js` y
`check-a11y.js` ya documentaban. Tres horas después de escribir esta lección.)*

---

## Crítica del 2026-07-10 — lo que el atributo promete y el comportamiento no cumple

Sexta ronda. Por primera vez el hallazgo principal **no estaba en un verificador**: estaba en
la app, y era de **nivel A** — más básico que casi todo lo de las cinco rondas anteriores, que
fueron AA. Se me pasó porque **ningún check lo miraba, y yo miraba lo que los checks señalaban.**

### ✅ Lo que ya estaba bien (medido, no asumido)

- **`prefers-reduced-motion` frena las tres animaciones en bucle.** La regla universal
  (`animation-iteration-count: 1 !important`) cubre `pulse`, `shimmer` y `grabar-pulse`. Hay
  hasta un comentario que documenta haber borrado una regla duplicada porque la universal bastaba.
- **La gestión de foco en modales existe y es correcta.** `_modalMostrar`/`_modalOcultar` guardan
  el foco previo, atrapan el tab, enfocan el primero, y restauran el foco al cerrar.

### 🐛 1. Ningún campo de formulario tenía nombre accesible

**33 controles** (25 input, 5 select, 3 textarea) y **cero** con `for`, `aria-label`, input
envuelto o `title`. Los `<label>` existían —*"PIN (4 números)"*— pero eran texto suelto al lado,
sin relación programática con el campo. Un lector de pantalla enfocaba el PIN y oía el placeholder
*"Ej: 1234"*, no la etiqueta. **WCAG 1.3.1 y 4.1.2, nivel A.**

Lo punzante: la tabla de deuda decía *"✅ aria-label en los 18 botones sin nombre accesible"*.
**Los botones recibieron nombre; los campos nunca.** Y `check-a11y.js` tenía 18 reglas y ninguna
preguntaba *"¿este campo se llama de algo?"*.

Arreglado en tres formas: `<label for>` donde hay etiqueta visible (18), `aria-label` en las
cajas de búsqueda y los file inputs, `aria-labelledby="dlg-titulo"` en el input del diálogo, y
`aria-label` en los tres inputs de la fila de cotización generada por JS. **Regla 19** nueva:
falla si un control no tiene nombre por *ninguna* vía.

### 🐛 2. El modal de asignar técnico tenía dos puertas, y una no instalaba nada

`aria-modal="true"` es una **promesa**: el resto de la página está inerte. `_modalMostrar()` la
cumple (foco + trampa de tab + Escape). Pero `modal-reasignar` se abría por **dos** caminos, y el
segundo —`modal.style.display = 'flex'` crudo en `aceptarCotizacionPrevia`— no instalaba nada.
Con teclado: el Escape no cerraba, el tab se escapaba a la página de detrás. **La promesa, mentira.**

La **regla 4** comprueba que el markup *declare* `role="dialog"` + `aria-modal`. Y lo declara:
verde. No puede ver que una de las dos puertas no cablea el comportamiento. Mismo patrón que la
regla 10: el atributo presente, el comportamiento condicional. **Regla 20** nueva: mira el
cableado — ningún `id` de un `role="dialog"` recibe `.style.display` fuera de `_modalMostrar`.

### 🔍 La lección: el check verifica que la promesa esté ESCRITA, no que se CUMPLA

`role`, `aria-modal`, `aria-label`, `alt` — todos son promesas estáticas. Leer el markup confirma
que la promesa está **escrita**; que se **cumpla** depende del comportamiento en tiempo de
ejecución, que el markup no revela. La regla 4 vio `aria-modal="true"` y dio el modal por bueno;
no podía ver que una puerta dejaba la página de detrás alcanzable.

La única regla del repo que verifica cumplimiento y no promesa es la de los silencios firmados —
y solo porque la firma es texto que hay que teclear a mano, en el sitio del hecho. Esa es la forma
que funciona: **acercar la evidencia al comportamiento, no al atributo.**

65 mutantes, 0 puntos ciegos. Dos de ellos —los que probaban estas reglas— nacieron rotos: sus
`sed` apuntaban a un texto que mis propios arreglos habían cambiado (un `aria-label` metido entre
el `id` y el `placeholder`). Un mutante cuyo objetivo ya no existe no prueba nada. Reanclados.

---

## Crítica del 2026-07-10 (tarde) — el check de tildes miraba strings, no lo que se ve

Séptima ronda. Fui a las dimensiones de diseño que llevaba seis rondas esquivando —microcopy,
terminología, capitalización, carga cognitiva— porque no se *grep*ean fácil. Casi todo salió a
favor: la capitalización de botones es consistente (Sentence case, 39 botones), el flujo del
técnico es un wizard de 4 pasos y no una avalancha. El único hallazgo fueron **tildes**.

### 🔤 `check-tildes.js` escaneaba strings de JS, no el texto que se ve

El verificador miraba `toast()`, `textContent=`, `placeholder=`, `_vacio()`, `_error()`… — y su
cabecera decía *"solo los contextos donde el string es VISIBLE"*. Esa lista se leyó como
exhaustiva y no lo era. Un `<button>+ Agregar item</button>` es tan visible como un toast, y no
estaba. En ese punto ciego vivían `ítem` e `ÍTEMS A COTIZAR`.

### 🔁 Y al taparlo, lo destapé otra vez — en el mismo commit

Añadí un PASE 2 que escanea los nodos de texto del markup… y **vacié `<script>` antes de
escanear.** Con `<script>` se fue todo el **HTML generado** —`html += '<div>ITEMS</div>'`,
`innerHTML = '…'`—, que es donde se construyen las listas, las tarjetas y los badges: la mayor
parte de la UI real. Cuatro tildes más seguían invisibles ahí: `Descripción`, `conexión` (×2),
`cotización`. **Arreglar "no miro el markup" creando "no miro el markup generado"** es la lección
repitiéndose dentro de su propia corrección.

El PASE 2 final ya no distingue origen: el texto que el usuario lee no sabe si nació estático o de
un `html +=`. Escanea `>texto<` sobre todo el archivo (solo vacía `<style>`, cuyos selectores usan
`>`). **Seis tildes** corregidas en total, cero falsos positivos de operadores JS.

### 🔍 La lección, otra forma: una lista de contextos no es la lista de TODOS los contextos

`check-tildes` ha tenido **tres** puntos ciegos, los tres en lo que su alcance declarado se
callaba que no miraba:

1. Descartaba la **línea entera** al ver un `console.*` (el `toast` visible se iba con él).
2. No miraba los **nodos de texto del markup** (`<button>…</button>`).
3. No miraba el **HTML generado** en JS (`html += '…'`) — y este lo abrí yo tapando el 2.

La forma no cambia. Cuando un check declara *dónde* mira con una lista, la pregunta no es si la
lista es correcta, sino **qué clase de sitio no está en ella**. Y "lo obvio" —el texto de un
botón— es justo lo que una lista de casos especiales se salta, porque nadie lo anota como caso.

67 mutantes, 0 puntos ciegos. Dos nuevos: uno mete una tilde faltante en markup estático, otro en
HTML generado. El segundo existe para que, si alguien vuelve a vaciar `<script>`, se entere.

---

*Documenta el sistema real de EMVAL. Alinear el código a este documento, no al revés.*
