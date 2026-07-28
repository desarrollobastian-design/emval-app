# EMVAL — Brief del sistema para Soporte (08)

**Para quién:** el chat de Soporte que atiende a Pedro Arce. **No es documentación técnica**: es el
mapa que hay que tener en la cabeza **antes** de diagnosticar o de darle una orden al chat del proyecto.

**Fecha:** 28-jul-2026 · **Estado del código:** producción, Service Worker **v29**
**Se lee por ruta desde cualquier chat:** `05_Operaciones_Servicios/Proyectos_activos/emval-app/BRIEF-SISTEMA-PARA-SOPORTE.md`

> **Por qué existe.** El 27-jul Soporte diagnosticó tres causas que los datos refutaron, y se
> concluyó que 3 hojas eran irrecuperables cuando estaban en Cloudinary. El cliente supo antes que
> nosotros dónde estaba el dato. Eso se corrige teniendo el mapa, no leyendo código en caliente.

---

# 1. Qué es y qué hace

**EMVAL es una empresa de mantención de transpaletas** (las grúas manuales de bodega) que atiende
supermercados. Su cliente es **SMU** — las cadenas Unimarc, Alvi, M10, S10 y Papa Johns.

**La app reemplaza el papel.** Antes el técnico llenaba una hoja a mano en el local, la firmaba el
administrador y había que digitalizarla y mandarla. Ahora el técnico hace todo en el teléfono: marca
los servicios, saca fotos antes y después, el administrador firma en la pantalla, y **la app genera
el PDF y lo manda sola**.

Es una **PWA**: se abre como una web pero funciona **sin señal**, que es lo normal en bodega.

## Quiénes la usan

| Rol | Quién | Qué hace |
|---|---|---|
| **Técnico** | Lucas Fernández, José Quiroz | Ejecuta la visita en terreno, en el teléfono. Es quien sufre la mala señal. |
| **Supervisor / Admin** | Pedro Arce (dueño de EMVAL) | Ve todas las OT, arma cotizaciones, envía las hojas a SMU, administra locales y técnicos. |
| **Cliente final** | Administrador del local + supervisor de SMU | **No entra a la app.** Solo firma en el teléfono del técnico y recibe correos. |

⚠️ **Los supervisores de SMU son 4** y cada local tiene el suyo asignado:
`A. Espinoza` · `C. Zapata` · `P. Blake` · `R. Abedrapo` (todos `@smu.cl`).
Es a ellos a quienes Pedro les manda las hojas.

## El flujo completo de una visita

```
1. El técnico elige local y tipo de trabajo    → PREVENTIVO o CORRECTIVO
2. Describe el problema, saca FOTOS ANTES
3. Ejecuta:
     · preventivo → responde la PAUTA de 11 servicios (Sí/No) + Nº de equipos
     · correctivo → escribe qué reparó
4. FOTOS DESPUÉS
5. El administrador del local FIRMA en la pantalla + foto del TIMBRE del local
6. El técnico cierra la OT
      ↓  (todo lo de abajo pasa solo)
7. Se guarda en Firestore · las fotos van a Cloudinary
8. Se genera el PDF y se sube a Cloudinary
9. Salen DOS correos automáticos:
      · al ADMINISTRADOR DEL LOCAL (SMU) con el enlace al PDF
      · a cotizaciones.emval@gmail.com (la copia de respaldo de EMVAL)
10. Después, cuando quiere, PEDRO entra a la app y:
      · manda las HOJAS DE PREVENTIVO al supervisor de SMU (agrupadas por mes)
      · arma y manda COTIZACIONES por lo que haya que reparar
```

### 🔑 Lo más importante de entender: **una visita deja DOS OT, y está bien**

En la misma visita el técnico normalmente guarda **dos** órdenes con 20–60 segundos de diferencia:

1. una **preventiva** — la pauta de 11 servicios (el trabajo contratado del mes), y
2. una **correctiva** — las reparaciones que encontró de paso (cambió ruedas, sellos, etc.).

**Eso NO es un duplicado y no hay que "arreglarlo".** Es la razón de que haya ~90 correctivas para
~60 preventivas. Ambas arrastran la descripción *"Mantención transpaletas."*, así que **ese texto no
sirve para saber de qué tipo es**.

👉 **La anomalía no es "2 OT el mismo día". Es "2 OT correctivas el mismo día y ninguna preventiva"**
— ahí falta la hoja. Así se detectaron los 3 casos de julio.

---

# 2. Dónde vive cada dato — el mapa de fuentes

## 2.1 Firestore (la base de datos)

| Colección | Qué guarda | Ojo |
|---|---|---|
| **`ordenes`** | **Todas las OT**, preventivas y correctivas | Es la colección principal. El tipo lo dice el campo `tipo`. |
| `cadenas` | Las cadenas **y dentro de cada una, sus sucursales** | ⚠️ **Los locales viven acá**, en un array `sucursales`. La colección `locales` está vacía/en desuso. |
| `cotizaciones` | Las cotizaciones que arma Pedro | |
| `pdfs` | Índice de PDF generados | Respaldo del enlace, por si la OT perdió el suyo |
| `tecnicos`, `usuarios`, `supervisores` | Cuentas | |
| `contadores` | Correlativo del folio de cotización | Nuevo, 27-jul |
| `facturacion`, `ventas`, `preventivos` | Poco o nada usadas | No asumir que tienen datos |

**Cada sucursal trae:** `nombre`, `centro` (**el CECO**), `supervisor`, `email` (del administrador del
local), `direccion`. ⚠️ El CECO está en el campo **`centro`**, no en `ceco`.

## 2.2 Cloudinary (los archivos)

Guarda **fotos y PDF**. Es una fuente **independiente** de Firestore, y ahí está la clave:

> 🔴 **El PDF se sube ANTES de que se termine de escribir el documento de la OT.**
> Por eso puede existir un PDF perfecto que Firestore nunca enlazó — invisible para la app y para
> cualquier consulta a la base. **Le pasó a 6 hojas en julio.**

**La URL se puede construir sola**, sin buscar en ningún lado:
```
https://res.cloudinary.com/dcrf29tna/raw/upload/emval/pdfs/<nombre del archivo>
```
Y el nombre del archivo sigue una convención fija (ver punto 3). Eso permite **barrer todo el
almacenamiento** en minutos en vez de revisar correos uno por uno.

## 2.3 `cotizaciones.emval@gmail.com` — el registro paralelo

**A esa casilla llega una copia automática de CADA OT completada**, con el enlace a su PDF. No es un
buzón: es **un registro del sistema que sobrevive cuando Firestore pierde el dato**.
También es la casilla desde la que salen los correos a SMU. Bastián tiene acceso.

⚠️ **El TEXTO de esos correos puede mentir** (ver punto 3.3). El adjunto/enlace, no.

## 2.4 El dispositivo del técnico

| Qué | Dónde | Cuándo se va |
|---|---|---|
| **Cola offline** (OT cerradas sin señal, con fotos y firma) | IndexedDB `emval_offline` → `ots_pendientes` | Se sube sola al recuperar señal |
| OT pausadas (trabajo a medias) | `localStorage: emval_ots_pausadas` | |
| Historial local, último usuario, cachés | `localStorage: emval_ots`, `emval_ultimo_usuario`, `emval_cadenas_cache`, `emval_users_cache` | |

🔴 **Esto vive SOLO en ese teléfono.** Si el técnico cambia de equipo o borra la app antes de
sincronizar, **el trabajo se pierde de verdad** — no hay copia en ninguna otra parte. Ya pasó con
Nelson (celular con poca memoria) y hubo que rehacer una OT.

## 2.5 📊 Tabla de supervivencia — dónde vive cada cosa

| Dato | Firestore | Cloudinary | Correo | Teléfono | Si falla Firestore… |
|---|---|---|---|---|---|
| **Registro de la OT** (tipo, pauta, local) | ✅ | ❌ | parcial (texto) | ✅ hasta sincronizar | se reconstruye del PDF |
| **PDF de la hoja** | solo el enlace | ✅ **el archivo** | ✅ enlace | temporal | **sobrevive en Cloudinary** |
| **Fotos** antes/después | solo URLs | ✅ | ❌ | ✅ hasta sincronizar | sobreviven en Cloudinary |
| **Firma** del administrador | ✅ (dentro del doc) | dentro del PDF | dentro del PDF | ✅ | sobrevive dentro del PDF |
| **Cotización** | ✅ | ✅ el PDF | ✅ enlace | ❌ | sobrevive en Cloudinary |
| **A quién se le envió algo** | ❌ | ❌ | ✅ **solo aquí** | ❌ | **solo el correo lo sabe** |

👉 **Ningún dato importante vive en un solo lugar, salvo dos:** lo que aún no sincronizó del teléfono,
y el registro de envíos, que solo existe en la casilla de correo.

## 2.6 🚨 El procedimiento — las 4 fuentes, siempre en este orden

Ante cualquier *"falta un dato / se perdió un registro"*:

1. **Firestore** — ¿existe el documento? ¿qué campos tiene?
   ⚠️ **Mirar SIEMPRE las dos colecciones:** `ordenes` **y `pdfs`**. `pdfs` es el **índice de
   enlaces** y muchas veces tiene la URL de Cloudinary que a la OT le falta. Buscar ahí por
   `otClientId` **y** por `otNumero` — en los registros viejos el `otClientId` viene vacío.
2. **Cloudinary** — construir la URL y probarla. **Un PDF puede existir sin estar enlazado.**
   ⚠️ **Hay DOS convenciones de nombre** y hay que probar las dos:
   `…_<7 últimos del id>.pdf` (rutas nuevas) y **sin ese sufijo** (rutas viejas).
3. **Correo de respaldo** — mirar **la URL del enlace**, nunca el texto.
4. **El teléfono del técnico** — si nunca sincronizó, está solo ahí.

**Nunca decir "no existe" habiendo mirado una sola.** Decir **"no está en Firestore"**, que es lo
que efectivamente se comprobó. Y **nunca mandar a alguien a rehacer trabajo en terreno sin haber
barrido las 4** — el 27-jul se estuvo a punto.

---

# 3. Los documentos que salen al cliente final

## 3.1 Los tres tipos, y cómo distinguirlos

| Documento | Se reconoce por | Nombre del archivo | Cuándo sale |
|---|---|---|---|
| **Hoja de preventivo** | Título **"MANTENIMIENTO PREVENTIVO"**, FOLIO, Nº EQ. SUSCRITOS y **la tabla de 11 servicios con SI/NO** | `<CECO>-HS <N°>-MP Transpaletas <Mes> <Año>.pdf` | Al cerrar una OT preventiva |
| **Orden de trabajo** (correctivo) | Título **"ORDEN DE TRABAJO"**, casillas PREVENTIVO/CORRECTIVO, "TRABAJOS EJECUTADOS" | `Recepcion_Obra_OT<N°>.pdf` | Al cerrar una OT correctiva |
| **Cotización** | Título **"Cotización"**, N° en un recuadro, detalle y total | `<N°cot> OT <N°ot> <servicio> <local>.pdf` | Cuando Pedro la arma y la manda |

> 🔑 **El nombre del archivo es el único indicio confiable del tipo real de una OT.**
> Si el nombre empieza con un número y dice `-HS ... -MP Transpaletas`, **es preventivo**, aunque el
> correo diga otra cosa y aunque en la app aparezca como correctivo.

## 3.2 Los correos que manda la app

| # | Cuándo | A quién | Qué lleva | Automático |
|---|---|---|---|---|
| 1 | Al cerrar cualquier OT | **Administrador del local (SMU)** | Asunto tipo *"OT #NNN"*, datos y **enlace al PDF** | ✅ sí |
| 2 | Al cerrar cualquier OT | `cotizaciones.emval@gmail.com` | Copia de respaldo con el enlace | ✅ sí |
| 3 | Al sincronizar una OT que estaba offline | Administrador del local | Igual que el 1 | ✅ sí |
| 4 | Cuando **Pedro** manda las hojas | **Supervisor de SMU** (`@smu.cl`) | Varias hojas de preventivo juntas | ❌ manual |
| 5 | Cuando **Pedro** manda cotizaciones | Supervisor y/o local | La(s) cotización(es) | ❌ manual |

⚠️ Los correos 1 y 3 **salen solos y le llegan al cliente de EMVAL**. Es la imagen de la empresa: un
correo mal armado lo ve SMU, no nosotros.

## 3.3 🔴 Qué textos pueden mentir — y por qué

El **asunto, el cuerpo y el texto del enlace** de los correos automáticos se arman con el estado de
la app **en el momento del envío**. Si para entonces el técnico ya empezó otra OT, **esos textos
traen datos de la otra**.

Hubo correos que decían:
> *"OT #null completada · Tipo: Correctivo · Descargar PDF de Recepción de Obra"*

…y el archivo enlazado era **una hoja de preventivo completa, con los 11 servicios respondidos.**

**El PDF se genera antes del pisado, por eso está bien; el texto se arma después, por eso miente.**

👉 **Regla para Soporte: fiarse del archivo, nunca del texto del correo.** Abrir el enlace y mirar el
nombre y el encabezado del PDF antes de sacar cualquier conclusión.

---

# 4. Los números del negocio

## 4.1 El universo de locales

| Cadena | Sucursales | ¿Lleva preventivo? |
|---|---|---|
| Unimarc | 49 | sí |
| Alvi | 7 | sí (salvo Camino a Coronel) |
| M10 | 2 | sí |
| S10 | 2 | sí |
| Papa Johns | 2 | **no** — nunca se les ha hecho una OT |
| Entel Talcahuano | 1 | **no** — es un local de **prueba** (supervisor "Bastian Prueba") |
| **Total cargado** | **63** | |

**El número que importa: 59 locales llevan preventivo.** Lo fijó Pedro el 27-jul:
*"son 60 locales en total pero solo a 59 se le realiza preventivo"* — sus 60 son los 63 menos el de
prueba y los dos Papa Johns; el que no lleva es **ALVI CAMINO A CORONEL**.

⚠️ **Al contar hojas, el objetivo es 59, no 63.** Y ojo con el local de prueba: infla los conteos.

**Ciclo:** el preventivo es **bimestral** — ene · mar · may · jul · sep · nov *(dato de negocio
aportado por Soporte; en el sistema hay datos de jun-jul-2026)*. Cada ciclo debería producir **una
hoja por cada uno de los 59 locales**.

## 4.2 Qué significa que una hoja esté "LISTA" — las 4 condiciones

Una hoja se puede entregar solo si cumple **las cuatro**. En lenguaje para el cliente:

| Condición técnica | En castellano |
|---|---|
| `firmada === true` | **El administrador del local firmó** en el teléfono |
| `pausa !== true` | El técnico **no la dejó a medias** |
| `estado !== 'En Pausa'` | Lo mismo, por otra vía |
| **tiene PDF** | **El documento existe** y se puede abrir |

👉 **Casi siempre falla solo la cuarta.** Eso significa: **el trabajo se hizo y está firmado en
terreno; lo único que falta es el archivo.** No hay que mandar a nadie de vuelta — se regenera desde
la app, o se busca en Cloudinary (ver 2.6).

**Cómo explicárselo a Pedro:** *"la hoja está hecha y firmada; lo que falta es el PDF, y eso lo
resolvemos nosotros sin molestar al técnico."*

## 4.3 Cómo se numeran las cosas — y qué NO garantiza

| | Cómo se arma | Qué garantiza |
|---|---|---|
| **N° de OT** | Un número **al azar** entre 100.000 y 999.999 | ⚠️ **Nada.** Es solo una etiqueta visible. Puede repetirse entre dos teléfonos. |
| **N° de cotización** | `día+mes+año` + correlativo del día (ej. `13072603`) | ✅ Único **desde el 27-jul-2026**. Antes no. |

🔴 **El N° de OT no identifica nada.** La identidad real de una OT es su id interno. Consecuencias
prácticas para Soporte:
- **El número del correo puede no coincidir con el de la app** para el mismo trabajo. No es un error
  nuevo: es esta debilidad. **Buscar por local + fecha, no por número.**
- Dos OT pueden compartir número. Ya pasó (caso #9530).

🔴 **Los números de cotización viejos están repetidos:** **39 de 45 cotizaciones comparten el
`13072601`** — todas las que Pedro cargó el 13-jul de una sentada — y **ese número llegó a los
supervisores de SMU**. Arreglado hacia adelante; **lo viejo no se renumeró** (es decisión de Pedro,
hay documentos ya enviados).

---

# 5. Lo que ya se rompió y está arreglado

**No rediagnosticar esto.** Todo está cerrado y desplegado.

| Qué pasaba | Causa real | Estado |
|---|---|---|
| **La hoja de preventivo se perdía** con mala señal (aparecía como correctivo y sin pauta) | Al guardar, la app armaba el registro **después** de subir las fotos, leyendo el estado **en vivo**. Con mala señal eso tarda minutos y el técnico ya había empezado la OT siguiente: **se guardaba con los datos de la otra** | ✅ PR #25, SW v28 |
| Hojas **duplicadas** de preventivo | La OT pausada no se borraba al cerrarla (llegaba el técnico vacío) | ✅ PR #24 |
| OT que **desaparecían de todas las listas** | Se guardaban con el tipo en blanco | ✅ PR #21 |
| **Hojas sin destinatario**, en silencio | La cadena S10 se renombró a M10 y 6 OT quedaron con el nombre viejo → sin supervisor, **y sin aviso** | ✅ PR #26, SW v27 |
| Correos **"OT #null"** al administrador de SMU | Un valor vacío se convertía en el texto `"null"` | ✅ PR #25 |
| Hoja preventiva con **los 11 casilleros en blanco** | Una pauta vacía pasaba la validación | ✅ PR #25 — ahora la app lo **impide** |
| **N° de cotización repetido** (39 con el mismo) | Se armaba en 3 lugares con un `'01'` fijo | ✅ PR #27, SW v29 |
| OT con **técnico en blanco** | Se leía la sesión antes de que cargara | ✅ PR #19 |

## 🟡 Abierto o en vigilancia

| Qué | Detalle |
|---|---|
| **3 hojas sin PDF** | #9341 Peñuelas · #9635 Caracol · #9875 S10 Tomé. **No están en Cloudinary** (se probaron 9 variantes): hay que **generarlas a mano** desde la app. |
| **1 hoja sin cerrar** | #9101 Peñuelas (21-jul), pausada y **sin firma**. La tiene que cerrar **el técnico**; no es un problema de datos. |
| **39 cotizaciones con N° repetido** | Ya no se generan más así. Qué hacer con las **ya enviadas a SMU** es **decisión de Pedro**. |
| **La app no registra los envíos** | No se sabe por datos qué hoja/cotización se mandó, a quién ni cuándo. **Solo el correo lo sabe.** Es una **mejora vendible**, cotizable aparte — anotada para el FODA. |
| **El PDF puede salir con el tipo equivocado** | Mismo problema del guardado, en la generación del PDF. Ventana más corta y el PDF se regenera, así que se dejó anotado. |
| **33 correctivas sin PDF** | Repartidas desde el 25-jun. No es nuevo ni urgente; mirar cuando se cierre lo del preventivo. |

---

# 6. Chuleta — antes de mandarle nada al chat del proyecto

1. ❓ **¿Miré las 4 fuentes?** Si no, no concluir. Decir "no está en Firestore".
2. 📄 **¿Abrí el PDF o solo leí el correo?** El texto miente; el archivo no.
3. 🔢 **¿Estoy buscando por número de OT?** Buscar por **local + fecha**.
4. 👥 **¿Son 2 OT el mismo día?** Normal (preventiva + correctiva). La anomalía es **2 correctivas y ninguna preventiva**.
5. 🎯 **¿Estoy contando contra 59** (no 63) y **sin el local de prueba**?
6. 🗣️ **¿El cliente afirmó algo sobre sus datos?** **Comprobarlo antes de descartarlo.** Ya tuvo razón dos veces.
7. 🔧 **¿Es un fix de código?** Va al chat del proyecto, con el síntoma reproducible. Soporte **no toca código**.
8. 💾 **¿Se van a reparar datos de producción?** Requiere **autorización explícita de Pedro** y respaldo previo.

---

## Punteros

- **Detalle técnico y las 4 fuentes** → `CLAUDE.md` (misma carpeta), sección "LAS 4 FUENTES DE VERDAD"
- **El caso completo de julio** → `08_Soporte_Postventa/Tickets/emval_2026-07-28_cruce-preventivos-julio.md`
- **Las cotizaciones repetidas** → `Tickets/emval_2026-07-27_cotizaciones-numero-repetido-listado.txt`
- **Código y despliegue** → repo `desarrollobastian-design/emval-app`, rama `main`
