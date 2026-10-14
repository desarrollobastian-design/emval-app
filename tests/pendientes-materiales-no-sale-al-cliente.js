/* Prueba de regresion — "Pendientes y materiales" es interno: no sale en la hoja ni en el correo.

   Pedido de Lucas (tecnico) via Pedro, 13-08-2026. El tecnico anota en terreno lo que quedo
   pendiente ("faltaron 2 neumaticos") y eso lo lee SOLO Pedro desde administracion.

   El invariante que protege este test es de negocio, no de codigo: si este texto se filtra a la
   hoja de trabajo, EMVAL le esta avisando a SMU por escrito que el trabajo quedo incompleto.
   Es exactamente lo contrario de para lo que se pidio el campo.

   Por que el riesgo es real y no teorico:
   - En preventivos el campo de ARRIBA se llama "Observaciones" y SI se imprime. El nuevo esta
     pegado debajo. Cualquiera que agregue "una observacion mas al PDF" puede tomar el equivocado.
   - `descripcionTrabajo` viaja al PDF, al correo, al Excel de planillas y a la busqueda. El campo
     nuevo se guarda al lado suyo en el MISMO documento de Firestore.

   Uso:  node tests/pendientes-materiales-no-sale-al-cliente.js index.html
   Sale 0 si el campo se queda adentro; 1 si se filtro al cliente o se perdio por el camino. */

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); }

const CAMPO = 'pendientesMateriales';

// DOM falso minimo: solo lo que tocan los bloques que se extraen del archivo.
function elemento() {
  return {
    style: {}, value: '', textContent: '', hijos: [],
    appendChild(h) { this.hijos.push(h); }
  };
}
function docFalso(mapa) {
  return {
    getElementById(id) { return Object.prototype.hasOwnProperty.call(mapa, id) ? mapa[id] : null; },
    createElement() { return elemento(); }
  };
}

// Extrae un trozo LITERAL de index.html y lo ejecuta. No se reimplementa nada: si el bloque
// cambia, este test corre el codigo nuevo.
function extraer(desde, hasta, nombre) {
  const i = src.indexOf(desde);
  if (i < 0) { chequear(false, 'no se encontro el bloque de ' + nombre + ' (¿se renombro?)'); return null; }
  const j = src.indexOf(hasta, i);
  if (j < 0) { chequear(false, 'no se encontro el final del bloque de ' + nombre); return null; }
  return src.slice(i, j + hasta.length);
}

console.log('Pendientes y materiales: interno de EMVAL\n');

// ── 1. Solo preventivos: en correctivo se oculta Y SE VACIA ──────────────────────────────────
{
  const bloque = extraer(
    "const pendWrap = document.getElementById('pend-materiales-wrap');",
    "if (pendTA) pendTA.value = esPrev ? (estado.pendientesMateriales || '') : '';",
    'cargarEjecucionScreen'
  );
  if (bloque) {
    const correr = (tipo, textoPrevio) => {
      const wrap = elemento(), ta = elemento();
      const estado = { tipo: tipo, pendientesMateriales: textoPrevio };
      const doc = docFalso({ 'pend-materiales-wrap': wrap, 'pend-materiales': ta });
      new Function('document', 'estado', bloque)(doc, estado);
      return { display: wrap.style.display, valor: ta.value, enEstado: estado.pendientesMateriales };
    };

    const prev = correr('preventivo', 'Faltaron 2 neumaticos');
    console.log('1) Preventivo   → campo ' + (prev.display === 'block' ? 'visible ✓' : 'OCULTO ✗') +
                ', texto ' + (prev.valor ? 'restaurado ✓' : 'PERDIDO ✗'));
    chequear(prev.display === 'block', 'en un preventivo el campo no se muestra');
    chequear(prev.valor === 'Faltaron 2 neumaticos', 'al retomar una OT pausada el texto no se restaura en el textarea');

    // El tecnico empezo como preventivo, escribio un pendiente y despues cambio el tipo: ese
    // texto NO puede quedar colgado dentro de una OT correctiva.
    const corr = correr('correctivo', 'Faltaron 2 neumaticos');
    console.log('2) Correctivo   → campo ' + (corr.display === 'none' ? 'oculto ✓' : 'VISIBLE ✗') +
                ', estado ' + (corr.enEstado === '' ? 'limpio ✓' : 'ARRASTRA TEXTO ✗'));
    chequear(corr.display === 'none', 'el campo aparece en correctivos (solo va en preventivos)');
    chequear(corr.enEstado === '', 'el texto sobrevive al cambio de tipo y se cuela en una OT correctiva');
    chequear(corr.valor === '', 'el textarea sigue mostrando el pendiente de un preventivo anterior');
  }
}

// ── 3. Al guardar se lee del DOM dentro de la INSTANTANEA y solo si es preventivo ─────────────
{
  const bloque = extraer(
    "const _pendEl = document.getElementById('pend-materiales');",
    "const pendientesMateriales = (_tipoActual() === 'preventivo' && _pendEl) ? (_pendEl.value || '').trim() : '';",
    'guardarEnFirebase'
  );
  if (bloque) {
    const correr = (tipo, texto) => {
      const ta = elemento(); ta.value = texto;
      const doc = docFalso({ 'pend-materiales': ta });
      return new Function('document', '_tipoActual', bloque + '; return pendientesMateriales;')(doc, () => tipo);
    };
    const guardadoPrev = correr('preventivo', '  Faltaron 2 neumaticos  ');
    const guardadoCorr = correr('correctivo', 'Faltaron 2 neumaticos');
    console.log('3) Al guardar   → preventivo ' + (guardadoPrev === 'Faltaron 2 neumaticos' ? 'guarda ✓' : 'NO guarda ✗') +
                ', correctivo ' + (guardadoCorr === '' ? 'vacio ✓' : 'GUARDA ✗'));
    chequear(guardadoPrev === 'Faltaron 2 neumaticos', 'no guarda el pendiente de un preventivo (o no recorta espacios)');
    chequear(guardadoCorr === '', 'guarda el pendiente en una OT que no es preventiva');
  }

  // La lectura tiene que ocurrir ANTES del primer await. `estado` es global y con mala senal
  // cambia bajo los pies: es la causa raiz de las hojas de preventivo perdidas de julio.
  const iFn = src.indexOf('async function guardarEnFirebase');
  const iLectura = src.indexOf("const _pendEl = document.getElementById('pend-materiales');", iFn);
  const iAwait = src.indexOf('await ', iFn);
  console.log('4) Instantanea  → ' + (iLectura > 0 && iLectura < iAwait ? 'se lee antes del primer await ✓' : 'SE LEE DESPUES DE UN AWAIT ✗'));
  chequear(iLectura > 0 && iLectura < iAwait,
    'el campo se lee despues de un await: con mala senal ya puede ser el de otra OT (bug de julio)');
}

// ── 5. NO viaja al PDF ────────────────────────────────────────────────────────────────────────
{
  // Las dos hojas que recibe el cliente imprimen su bloque OBSERVACIONES desde descripcionTrabajo.
  // Se revisa la vecindad de cada uno: ahi es donde se agregaria "una observacion mas".
  let limpio = true, dondeFallo = '';
  let k = -1;
  while ((k = src.indexOf("doc.text('OBSERVACIONES:'", k + 1)) > 0) {
    const vecindad = src.slice(k - 500, k + 2500);
    if (vecindad.includes(CAMPO)) { limpio = false; dondeFallo = 'cerca del indice ' + k; }
  }
  console.log('5) PDF          → ' + (limpio ? 'ningun bloque OBSERVACIONES lo imprime ✓' : 'SE IMPRIME ✗'));
  chequear(limpio, 'el pendiente se esta imprimiendo en la hoja que recibe SMU ' + dondeFallo);

  // Ninguna funcion de PDF puede nombrarlo, se llame como se llame.
  const enFuncionesPDF = [];
  let p = -1;
  while ((p = src.indexOf(CAMPO, p + 1)) > 0) {
    const antes = src.slice(0, p);
    const m = antes.match(/function\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{(?![\s\S]*function\s+[A-Za-z0-9_]+\s*\()/);
    const nombre = m ? m[1] : '';
    if (/pdf/i.test(nombre)) enFuncionesPDF.push(nombre);
  }
  console.log('6) Generadores  → ' + (enFuncionesPDF.length === 0 ? 'ninguno lo menciona ✓' : 'aparece en ' + enFuncionesPDF.join(', ') + ' ✗'));
  chequear(enFuncionesPDF.length === 0, 'una funcion de PDF menciona el campo: ' + enFuncionesPDF.join(', '));
}

// ── 7. NO viaja al correo ─────────────────────────────────────────────────────────────────────
{
  // El aviso de respaldo de cada OT completada. Su payload manda `trabajo:` — no debe crecer.
  const i = src.indexOf('trabajo: String(ot.descripcionTrabajo');
  chequear(i > 0, 'no se encontro el payload del correo de respaldo de la OT');
  if (i > 0) {
    const payload = src.slice(i - 700, i + 300);
    const filtrado = !payload.includes(CAMPO);
    console.log('7) Correo       → ' + (filtrado ? 'el aviso no lo lleva ✓' : 'VIAJA EN EL CORREO ✗'));
    chequear(filtrado, 'el pendiente viaja en el correo de respaldo (llega a la casilla y al supervisor)');
  }
}

// ── 8. Se ve SOLO para el Administrador ───────────────────────────────────────────────────────
{
  // Se corta en el return y se cierra la llave aca: el archivo usa CRLF y buscar el "}" con un
  // salto de linea literal no calza.
  const cuerpo = extraer(
    'function _bloquePendientesMateriales(ot) {',
    'return pendDiv;',
    '_bloquePendientesMateriales'
  );
  const bloque = cuerpo ? cuerpo + '\n}' : null;
  if (bloque) {
    const correr = (cargo) => {
      const fn = new Function('document', 'estado', bloque + '; return _bloquePendientesMateriales;')(
        docFalso({}), { cargo: cargo }
      );
      return fn({ pendientesMateriales: 'Faltaron 2 neumaticos' }) ? 1 : 0;
    };
    const admin = correr('Administrador'), sup = correr('Supervisor'), tec = correr('Tecnico en terreno');
    console.log('8) Quien lo ve  → admin ' + (admin === 1 ? 'si ✓' : 'NO ✗') +
                ', supervisor ' + (sup === 0 ? 'no ✓' : 'SI ✗') +
                ', tecnico ' + (tec === 0 ? 'no ✓' : 'SI ✗'));
    chequear(admin === 1, 'el administrador no ve el pendiente: el campo no le sirve a nadie');
    chequear(sup === 0, 'el rol Supervisor ve el pendiente (decision de Pedro: solo el administrador)');
    chequear(tec === 0, 'el tecnico ve el pendiente de vuelta en la lista');
  }

  // textContent, no innerHTML: lo escribe un tecnico en terreno.
  const usaInner = /pendTxt\.innerHTML/.test(src);
  chequear(!usaInner, 'el pendiente se pinta con innerHTML: un "<" del tecnico rompe la tarjeta');
}

// ── 9. El dato no se pierde por el camino ─────────────────────────────────────────────────────
{
  // Cada eslabon donde una OT sobrevive: pausa, retomar, cola offline y subida diferida.
  const eslabones = [
    ['pausar la OT (borrador local)',      'descripcionTrabajo: estado.descripcion'],
    ['retomar una OT guardada',            'estado.descripcion = ot.descripcionTrabajo'],
    ['cola offline (write-ahead)',         'descripcionTrabajo: desc, ceco: snap.ceco'],
    ['escritura en Firestore',             'ceco: snap.ceco, descripcionTrabajo: desc'],
    ['subida diferida desde la cola',      "ceco: ot.ceco || '', descripcionTrabajo: ot.descripcionTrabajo"]
  ];
  const rotos = eslabones.filter(function(e) {
    const i = src.indexOf(e[1]);
    return i < 0 || !src.slice(i, i + 400).includes(CAMPO);
  }).map(function(e){ return e[0]; });
  console.log('9) Persistencia → ' + (rotos.length === 0 ? 'los 5 eslabones lo llevan ✓' : 'se pierde en: ' + rotos.join(', ') + ' ✗'));
  chequear(rotos.length === 0, 'el pendiente se pierde en: ' + rotos.join(', '));
}

// ── 10. El nombre no se parece al campo que SI se imprime ─────────────────────────────────────
{
  const etiqueta = src.match(/<label for="pend-materiales">([^<]*)<\/label>/);
  const texto = etiqueta ? etiqueta[1] : '';
  const chocaConElDeArriba = /observaci/i.test(texto);
  console.log('10) Etiqueta    → "' + texto + '"' + (chocaConElDeArriba ? ' ✗' : ' ✓'));
  chequear(!!texto, 'el campo perdio su etiqueta');
  chequear(!chocaConElDeArriba,
    'la etiqueta volvio a decir "Observaciones": en preventivos el campo de ARRIBA se llama asi y ESE se imprime. ' +
    'Dos nombres casi iguales es como un pendiente termina en la hoja del cliente.');

  // El aviso de que es interno tiene que estar donde el tecnico escribe, no en la documentacion.
  const iWrap = src.indexOf('id="pend-materiales-wrap"');
  const avisa = iWrap > 0 && /No sale en la hoja de trabajo/i.test(src.slice(iWrap, iWrap + 1200));
  console.log('11) Aviso       → ' + (avisa ? 'visible junto al campo ✓' : 'NO ESTA ✗'));
  chequear(avisa, 'se cayo el aviso "solo lo ve EMVAL": el tecnico no tiene como saber que esto no lo lee el local');
}

// ── 12. Pedro lo ALCANZA: el recuadro esta en la pantalla donde viven los preventivos ──────────
// Del 13-08 al 13-10-2026 el bloque vivio solo en verOTsTecnico, que filtra los preventivos: el
// §8 pasaba (corre el bloque suelto) y Pedro nunca vio un pendiente. Esto mira el camino entero.
{
  const i = src.indexOf('async function cargarPreventivos()');
  const j = i < 0 ? -1 : src.indexOf("_error('cargar las OTs preventivas'", i);
  const cuerpo = (i >= 0 && j > i) ? src.slice(i, j) : '';
  chequear(!!cuerpo, 'no se encontro cargarPreventivos (¿se renombro?)');
  const pinta = /_bloquePendientesMateriales\(ot\)/.test(cuerpo) && /card\.appendChild\(pendDivP\)/.test(cuerpo);
  console.log('12) Alcanzable  → ' + (pinta ? 'la tarjeta del preventivo lo pinta ✓' : 'NINGUNA PANTALLA DE PREVENTIVOS LO MUESTRA ✗'));
  chequear(pinta, 'cargarPreventivos no pinta el pendiente: Pedro no tiene donde verlo (la lista por tecnico excluye preventivos)');

  // _todosPreventivos alimenta "Enviar hojas" y "Compartir" hacia SMU: el pendiente no viaja ahi.
  const k = cuerpo.indexOf('window._todosPreventivos[ot.id] = {');
  const lit = k < 0 ? '' : cuerpo.slice(k, cuerpo.indexOf('};', k));
  chequear(!!lit, 'no se encontro el registro de _todosPreventivos');
  const fuga = lit.includes(CAMPO);
  console.log('13) Envio a SMU → ' + (fuga ? 'el registro de envio LLEVA el pendiente ✗' : 'el registro de envio no lo lleva ✓'));
  chequear(!fuga, '_todosPreventivos lleva el pendiente: viajaria en "Enviar hojas" / "Compartir" al supervisor de SMU');
}

// ── 14. El Excel de pendientes: solo el administrador, completo y marcado como interno ─────────
{
  const cuerpo = extraer(
    'function descargarExcelPendientes() {',
    "_error('generar el Excel de pendientes', e); }",
    'descargarExcelPendientes'
  );
  if (cuerpo) {
    const LARGO = 'Faltaron 2 neumaticos para la transpaleta N°2; ' + 'x'.repeat(900) + ' FIN';
    const pend = [
      { fecha: '15-09-2026', tecnico: 'Lucas', local: 'UNIMARC PENCO', ceco: '720', numero: '111', texto: LARGO },
      { fecha: '31-08-2026', tecnico: 'José', local: 'S10 TOME', ceco: '', numero: '222', texto: 'Cambiar rueda' }
    ];
    const correr = (cargo) => {
      const r = { toasts: [], escrito: null, hoja: null, errores: [] };
      const XLSX = {
        utils: {
          aoa_to_sheet(aoa) { r.hoja = { aoa: aoa }; return r.hoja; },
          encode_range() { return 'A3:G5'; },
          book_new() { return { hojas: [] }; },
          book_append_sheet(wb, ws, n) { wb.hojas.push(n); }
        },
        writeFile(wb, nombre) { r.escrito = nombre; }
      };
      new Function('estado', 'window', 'toast', 'XLSX', '_error', cuerpo + '\n}; descargarExcelPendientes();')(
        { cargo: cargo }, { _prevPendientes: pend },
        (m) => r.toasts.push(m), XLSX, (q, e) => r.errores.push(String(e))
      );
      return r;
    };
    const sup = correr('Supervisor');
    const adm = correr('Administrador');
    const aoa = adm.hoja ? adm.hoja.aoa : [];
    const enc = aoa[2] || [];
    const datos = aoa.slice(3);
    const ok = {
      soloAdmin: sup.escrito === null,
      descarga: !!adm.escrito && /^EMVAL_Pendientes_y_Materiales_\d{4}-\d{2}-\d{2}\.xlsx$/.test(adm.escrito),
      interno: /USO INTERNO/.test(String((aoa[0] || [])[0])),
      columnas: enc.length === 7 && enc[6] === 'Pendientes y materiales' && enc[4] === 'CECO',
      filas: datos.length === 2,
      completo: datos[0] && datos[0][6] === LARGO,
      mes: datos[0] && datos[0][0] === 'Septiembre 2026' && datos[1][0] === 'Agosto 2026',
      sinCeco: datos[1] && datos[1][4] === ''
    };
    console.log('14) Excel       → supervisor ' + (ok.soloAdmin ? 'no descarga ✓' : 'DESCARGA ✗') +
                ', admin ' + (ok.descarga ? adm.escrito + ' ✓' : 'NO DESCARGA ✗') +
                ', ' + (ok.filas ? '2 filas ✓' : datos.length + ' filas ✗') +
                ', texto ' + (ok.completo ? 'completo ✓' : 'CORTADO ✗'));
    chequear(adm.errores.length === 0, 'el Excel fallo: ' + adm.errores.join(' | '));
    chequear(ok.soloAdmin, 'un rol que no es Administrador descarga los pendientes');
    chequear(ok.descarga, 'el administrador no obtiene el archivo (o el nombre cambio)');
    chequear(ok.interno, 'el Excel no dice en su primera fila que es de uso interno: se puede reenviar a SMU sin darse cuenta');
    chequear(ok.columnas, 'el encabezado cambio: ' + JSON.stringify(enc));
    chequear(ok.filas, 'el Excel no tiene una fila por pendiente');
    chequear(ok.completo, 'el texto del pendiente se corto en el Excel');
    chequear(ok.mes, 'la columna Mes no corresponde a la fecha de la hoja');
    chequear(ok.sinCeco, 'un CECO desconocido salio con un valor: se adivino');
  }
}

console.log('');
if (fallos.length) {
  console.log('FALLA (' + fallos.length + '):');
  fallos.forEach(function(f){ console.log(f); });
  process.exit(1);
}
console.log('OK — el pendiente se queda adentro y llega completo a Pedro.');
