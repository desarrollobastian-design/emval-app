# ALCANCE DE TRABAJO — Flujo "Baja de activo" (EMVAL)

**Cliente:** Servicios Emval Ltda. — Pedro Arce, administrador
**Lo pidió:** Pedro Arce, 5 audios de WhatsApp del **27-ago-2026**
**Estado:** ⬜ **alcance cerrado, SIN construir** — esperando precio de Productos (06)
**Precio:** lo fija Productos (06). **Acá no va ninguna cifra.**

> 🔴 **Es al menos el SÉPTIMO alcance nuevo desde el 12-ago y ninguno se ha cobrado.**
> El último etiquetado en memoria es el sexto (planillas por cliente, 21-ago); después vino la
> firma del técnico en la HS (25-ago). **Este no se construye antes de que 06 le ponga precio al
> paquete completo** — no a este pedido suelto.

---

## El caso real que lo motiva — verificado en producción

🔬 **OT #586729** · Alvi Concepción (CECO 3089) · Lucas Fernández · **21-jul-2026**
> *"Se da de baja 1 transpaleta marca Stax (Nº1) (NºSerie 26215-39), ya que presenta trizaduras en
> su estructura (No Reparable) por lo cual es un peligro hacer uso de esta."*

Está guardada como **correctivo**, **sin cotización**, y por eso lleva **37 días** apareciendo en la
lista de pendientes de cotizar de Pedro. Es literalmente la hoja del audio 2: *"hay una hoja
pendiente de cotizar (…) y esa hoja no debería llevar cotización ni nada"*.

Tiene su par preventivo del mismo día (**#305239**, misma visita, mismo local) que también menciona
la baja — el patrón conocido de *dos OT por visita*.

📊 **Son las 2 únicas** de las 206 OT de producción que registran una baja (barrido por REST,
27-ago). No es un flujo de alto volumen: es un flujo **atascado**.

---

## Descripción general

Hoy la app solo conoce **dos** tipos de trabajo: preventivo y correctivo. Cuando un técnico da de
baja un activo (una transpaleta inutilizable), no tiene dónde registrarlo: lo escribe dentro de una
hoja correctiva, que arrastra todo el flujo de cotización detrás.

Se agrega un **tercer documento independiente — la "Hoja de Baja de Activo"** — con su propia
carpeta, como las de Preventivo y Correctivo. Es un **comprobante**, no un trabajo cobrable: no
genera cotización, no genera planilla, no entra en la cobranza a SMU.

---

## ✅ Incluido

| # | Qué |
|---|---|
| 1 | **Carpeta propia "Bajas de activo"**, al mismo nivel que Preventivos y Cotizaciones, con búsqueda y contador |
| 2 | **Formulario nuevo**: el técnico elige cadena y local (reusa el catálogo `cadenas` que ya existe) |
| 3 | **PDF de una página**: título *BAJA DE ACTIVO*, fecha, CECO y nombre del local en el encabezado |
| 4 | **Líneas en blanco** para escribir a mano — y un campo de texto libre para llenarlo desde el teléfono |
| 5 | **Firma y nombre del técnico** al pie, reusando `FIRMAS_TECNICOS` (ya embebido, 25-ago) |
| 6 | **Firma y timbre de EMVAL** (administrador), reusando `FIRMA_EMVAL` (ya embebido, 13-ago) |
| 7 | Se guarda en Firestore y sube su PDF a Cloudinary, **con las mismas guardias de tiempo** (`_conTimeout`, cola de enlaces) que el resto |
| 8 | **Envío por correo al local**, por la cola de correos existente (nunca `emailjs.send` directo) |
| 9 | **Envío al supervisor** desde la carpeta, con selección múltiple, igual que las hojas de preventivo |
| 10 | **Botón Compartir** (Web Share API), igual que cotizaciones y hojas |
| 11 | **Prueba de regresión** que falla si una baja entra en una planilla de cobranza o genera cotización |

---

## ❌ Explícitamente NO incluido

- **No genera cotización.** Ni previa, ni al cerrar, ni al enviarla. Es el punto central del pedido.
- **No genera orden de compra, SOLPED, OC, HES ni factura.** Pedro lo dijo textual.
- **No entra en ninguna planilla de cobranza** — ni la de preventivos ni la de correctivos.
- **No aparece en "Ver OTs por técnico"** junto a preventivos y correctivos. Carpeta aparte.
- **No lleva fotos antes/después, ni pauta de 11 servicios, ni firma del receptor** (el local).
  Si SMU exige la firma del local en este documento, es alcance adicional.
- **No hay inventario de activos.** La app no sabe qué transpaletas existen ni cuáles están de baja;
  no lleva número de serie estructurado, ni estado del parque, ni descuenta equipos del preventivo.
  El técnico escribe el detalle en texto libre. *(Ver "Fase 2".)*
- **No modifica las 2 hojas ya existentes** (#586729 y #305239). Eso es una decisión de datos aparte,
  y la autoriza Pedro.
- **No corrige el N° de equipos suscritos** del contrato SMU cuando un equipo se da de baja.

---

## 🔴 Decisión de arquitectura — y por qué importa la plata

**Se construye como colección aparte (`bajas`), NO como un tercer valor de `tipo` en `ordenes`.**

La razón está en el código, verificada hoy (`index.html:2040`):

```js
function _normTipo(tipo) { return tipo === 'preventivo' ? 'preventivo' : 'correctivo'; }
```

Esa función es **binaria a propósito**: nació del caso de las 7 OT de Chillán Viejo que
desaparecieron de todas las listas por tener `tipo` nulo. Su regla es *"todo lo que no es preventivo
es correctivo, así nada se pierde"*.

**Consecuencia:** una OT con `tipo: 'baja'` sería tratada como **correctivo** por todo el sistema —
entraría en la planilla de correctivos que se le cobra a SMU, aparecería como pendiente de cotizar
(exactamente el bug que se está arreglando) y su PDF saldría como `Recepcion_Obra_OT…`.

Hay **51 comparaciones directas** contra `'preventivo'`/`'correctivo'` en `index.html`. Tocar
`_normTipo` para admitir un tercer tipo obliga a revisar las 51, y un error ahí **saca trabajo real
de la cobranza** o mete un documento no cobrable dentro del paquete de SMU.

👉 La colección aparte no toca `ordenes`, no toca `_normTipo` y **no puede contaminar la planilla**.
Es además lo que Pedro describió: *"una carpeta como la que tenías de preventivo y correctivo"*.

---

## ⚠️ Lo que falta confirmar con Pedro antes de construir

1. **¿SMU tiene un formato propio de baja de activo?** El audio 1 dice *"esa planilla es de baja de
   activo y se manda como comprobante"* — si SMU ya tiene su formulario, la hoja debe **calzar con
   ese**, no inventar uno. Es la misma lección de la HS: una hoja con el formato equivocado la
   rechazan. **Pedir la planilla de SMU antes de dibujar el PDF.**
2. **¿La firma del administrador va siempre o es opcional?** El audio 5 dice *"que dé para poner la
   firma y timbre del administrador"*. Default propuesto: **va siempre**, igual que en la cotización.
3. **¿Quién puede crear una baja?** Default propuesto: **el técnico en terreno**, como todo lo demás.
4. **¿Necesita número de folio propio?** Default propuesto: **sí**, correlativo diario como las
   cotizaciones (`contadores/`), para que el comprobante sea identificable ante SMU.

---

## Fase 2 — anotado, NO cotizado ni construido

- Inventario de activos por local (qué transpaletas hay, cuáles de baja, número de serie).
- Ajuste automático del N° de equipos suscritos del preventivo al dar de baja uno.
- Historial de bajas por local para negociar la renovación del contrato con SMU.

---

## Términos

- **Cambios de alcance:** orden de cambio escrita, cotizada aparte.
- **Precio y forma de pago:** los fija **Productos (06)**. Este documento no los contiene.
- **Antes de construir:** confirmación de Pedro por escrito de los 4 puntos de arriba.

## Aprobación

Cliente (Pedro Arce): ____________________   Fecha: ______
CorexOn SpA (Bastián Baeza): ____________________   Fecha: ______
