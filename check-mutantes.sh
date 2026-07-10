#!/usr/bin/env bash
#
# check-mutantes.sh — Verifica a los verificadores.
#
#   bash check-mutantes.sh
#
# POR QUE EXISTE:
# Un check que nunca has visto fallar no es un check: es una decoracion que dice "verde".
# Esto no es hipotetico. En este repo paso tres veces:
#   1. check-a11y.js contaba 13 "dialogos nativos" que eran las palabras dentro de sus propios
#      comentarios. Y al limpiarlos con un regex, el atributo  accept="image/*"  abrio un
#      comentario de bloque falso que se comio 337.000 caracteres: el script encontro CERO
#      problemas y dijo que todo estaba bien.
#   2. check-tildes.js era una lista de ~20 palabras. `accion` no estaba, asi que
#      "Esta accion no se puede deshacer" paso limpio dos veces. Un mutante lo destapo.
#   3. check-tokens.js dio por muerto a `--blanco`, que si usaba check-contraste.js.
#
# Cada linea de aqui abajo inyecta un defecto REAL y exige que el check correspondiente falle.
# Si un mutante sobrevive, el check tiene un punto ciego y hay que arreglar el CHECK, no el sed.
set -u

REPO="$(cd "$(dirname "$0")" && pwd)"
MUT="$(mktemp -d)"
trap 'rm -rf "$MUT"' EXIT
cp "$REPO"/check-*.js "$MUT/"

ok=0; mal=0

probar() {   # nombre, script, exit_esperado, comando_sed ("CONTROL" = sin mutar)
  local nombre="$1" script="$2" esperado="$3" sedcmd="$4"
  if [ "$sedcmd" = "CONTROL" ]; then
    cp "$REPO/index.html" "$MUT/index.html"
  else
    sed "$sedcmd" "$REPO/index.html" > "$MUT/index.html"
    if cmp -s "$MUT/index.html" "$REPO/index.html"; then
      printf "  %-52s SED NO APLICO — mutante invalido\n" "$nombre"
      mal=$((mal+1)); return
    fi
  fi
  ( cd "$MUT" && node "$script" >/dev/null 2>&1 )
  local e=$?
  if [ "$e" = "$esperado" ]; then
    printf "  %-52s exit=%s  ok\n" "$nombre" "$e"; ok=$((ok+1))
  else
    printf "  %-52s exit=%s  ESPERADO %s  <-- PUNTO CIEGO\n" "$nombre" "$e" "$esperado"; mal=$((mal+1))
  fi
}

echo ""
echo "  ── check-a11y.js ──"
probar "viewport con user-scalable=no"          check-a11y.js 1 's|content="width=device-width, initial-scale=1, viewport-fit=cover"|content="width=device-width, initial-scale=1, user-scalable=no"|'
probar "un input a 13px"                        check-a11y.js 1 's|id="personal-buscar" placeholder="Buscar personal..." style="width:100%;padding:8px 12px;border:1px solid var(--gris3);border-radius:var(--radio-sm);font-size:16px|id="personal-buscar" placeholder="Buscar personal..." style="width:100%;padding:8px 12px;border:1px solid var(--gris3);border-radius:var(--radio-sm);font-size:13px|'
probar "reintroducir un confirm() nativo"       check-a11y.js 1 "s|if (!await _confirmar('El técnico dejará|if (!confirm('El tecnico dejara|"
probar "quitar aria-modal de un modal"          check-a11y.js 1 's|role="dialog" aria-modal="true" aria-labelledby="modal-reasignar-titulo"|role="dialog" aria-labelledby="modal-reasignar-titulo"|'
probar "toast con white-space: nowrap"          check-a11y.js 1 's|max-width: calc(100vw - 32px); white-space: normal|max-width: calc(100vw - 32px); white-space: nowrap|'
probar "quitar la guarda de guardarTecnico"     check-a11y.js 1 "s|const soltar = _bloquear(document.getElementById('btn-guardar-tecnico'));||"
probar "dialogo sin max-height"                 check-a11y.js 1 's|max-width: 420px; max-height: calc(100dvh - 48px); overflow-y: auto; margin: auto;|max-width: 420px;|'
probar "overlay del dialogo sin scroll"         check-a11y.js 1 's|padding: 24px 16px; overflow-y: auto; overscroll-behavior: contain;|padding: 24px 16px;|'

# ── Mutantes de la critica del 2026-07-09 (madrugada) ──
# El bug: _bloquear() apagaba el boton y lo reactivaba en un `finally` que, con la promesa
# de Firestore colgada offline, NO CORRE NUNCA. Lo introduje yo, en el commit que arreglaba
# la accesibilidad. Estos seis mutantes existen para que no vuelva a entrar.
probar "await a Firestore sin _conTimeout"      check-a11y.js 1 "s|await _conTimeout(db.collection('tecnicos').add(data), 25000, 'add tecnico')|await db.collection('tecnicos').add(data)|"
probar "_bloquear sin guardia de tiempo"        check-a11y.js 1 's|var guardia = setTimeout(function() { liberar(true); }, _MAX_BLOQUEO_MS);|var guardia = 0;|'
probar "_tomar sin guardia de tiempo"           check-a11y.js 1 's|^  }, _MAX_BLOQUEO_MS);$|  }, 0);|'
probar "cargador que falla en silencio"         check-a11y.js 1 "s|_listaConError(document.getElementById('lista-tecnicos-admin'), cargarTecnicosAdmin);||"
probar "toast con duracion constante"           check-a11y.js 1 's|t._ms = _toastDuracion(msg);|t._ms = 2500;|'
probar "toast que no se puede cerrar"           check-a11y.js 1 "s|t.addEventListener('click', ocultar);||"
probar "estado vacio escrito a mano"            check-a11y.js 1 "s|lista.innerHTML = _vacio('Aún no hay cadenas', 'Agrega la primera con el botón + Agregar cadena.');|lista.innerHTML = '<p>No hay cadenas</p>';|"

# ── Mutantes de la critica del 2026-07-09 (manana) ──
probar "toast encima de la barra de pendientes" check-a11y.js 1 's|t.style.bottom = _toastAbajo();|t.style.bottom = "24px";|'
probar "dos primarios en la misma pantalla"     check-a11y.js 1 's|<button class="btn btn-secondary btn-sm" onclick="confirmarFirma()"|<button class="btn btn-verde btn-sm" onclick="confirmarFirma()"|'
probar "cargador sin estado de carga"           check-a11y.js 1 's|^  _cargando(lista, 3);          // el skeleton va ANTES del await, o no se ve nunca$||'
probar "_cargando sin su _cargado"              check-a11y.js 1 's|^    _cargado(lista);$||'

# ── Mutantes de la critica del 2026-07-09 (mediodia) ──
probar "skeleton encima de datos correctos"     check-a11y.js 1 's|^  if (hijos \&\& !soloEstado) return;$||'
probar "toast que expone e.message"             check-a11y.js 1 "s|_error('generar el Excel de ventas', e);|toast('Error: ' + e.message);|"
probar "error que no dice que hacer"            check-a11y.js 1 "s|_error('reasignar la OT', e);|toast('Error al reasignar');|"
probar "error en el DOM sin anunciar"           check-a11y.js 1 "s|  _anunciar('No se pudo cargar la lista. Hay un botón para reintentar.');||"
probar "sin region #anuncios"                   check-a11y.js 1 's|<div id="anuncios" class="solo-lector"|<div id="anuncios-roto" class="solo-lector"|'
probar "CONTROL (sin mutar)"                    check-a11y.js 0 CONTROL

echo ""
echo "  ── check-contraste.js (parte 2: escaneo, no lista) ──"
probar "verde de ESTADO con texto blanco"       check-contraste.js 1 "s|background:var(--verde-btn);color:white;' : 'background:var(--gris2)|background:var(--verde);color:white;' : 'background:var(--gris2)|"
probar "un rojo que no es --rojo, con blanco"   check-contraste.js 1 "s|background:var(--rojo);color:white;|background:#E74C3C;color:white;|"
probar "gris sobre gris (4.09:1)"               check-contraste.js 1 "s|background:var(--gris2);color:var(--texto2);';\$|background:#E8ECF5;color:#6B7280;';|"

# Parte 3 (herencia por selector) y parte 4 (SC 1.4.11). Ambas nacieron de que la cabecera
# afirmaba "un escaner no los puede emparejar" — y era falso.
probar "borde de control invisible (1.4.11)"    check-contraste.js 1 's|--gris3: #7F899E;|--gris3: #C8D0E0;|'
probar "el onblur restaura un borde invisible"  check-contraste.js 1 "s|this.style.borderColor='var(--gris3)'|this.style.borderColor='var(--gris2)'|"
probar "par heredado padre>hijo (icono camara)" check-contraste.js 1 's|.foto-box svg { width: 28px; height: 28px; color: var(--gris3); }|.foto-box svg { width: 28px; height: 28px; color: var(--gris2); }|'
probar "CONTROL (sin mutar)"                    check-contraste.js 0 CONTROL

echo ""
echo "  ── check-tildes.js ──"
probar "mensaje de _confirmar sin tilde"        check-tildes.js 1 "s|'Esta acción no se puede deshacer.'|'Esta accion no se puede deshacer.'|"
probar "titulo de dialogo sin tilde"            check-tildes.js 1 "s|titulo: 'Eliminar técnico'|titulo: 'Eliminar tecnico'|"
probar "palabra -ion que ninguna lista tendria" check-tildes.js 1 "s|toast('Foto guardada')|toast('Revisa la conexion y la presion')|"
# El diccionario guardaba solo el singular: "No hay tecnicos registrados" pasaba limpio.
# Una esdrujula conserva la tilde al pluralizar; una aguda en -ion la pierde.
probar "irregular en PLURAL (tecnicos)"         check-tildes.js 1 "s|_vacio('Aún no hay técnicos'|_vacio('Aun no hay tecnicos'|"
# El 2o argumento de _vacio() tambien es texto visible. Si el check no lo mira, no lo vigila.
probar "la ayuda de _vacio() sin tilde"         check-tildes.js 1 "s|'Agrégalos en Administración → Personal.'|'Agregalos en Administracion → Personal.'|"
# EL MUTANTE QUE FALTABA. Los 41 anteriores inyectaban el defecto en lineas SIN console.*, y
# el check descartaba la LINEA entera al ver un console. Reporto CERO durante dias teniendo un
# hallazgo real ("Error cargando facturacion"). Un mutante prueba que la regla funciona donde
# el check mira; este prueba que el check mira donde debe.
probar "tilde escondida tras un console.error"  check-tildes.js 1 "s|} catch(e) { _error('cargar la facturación', e); }|} catch(e) { console.error(e); toast('Error cargando facturacion'); }|"
probar "la accion de _error() sin tilde"        check-tildes.js 1 "s|_error('cargar la facturación', e)|_error('cargar la facturacion', e)|"
probar "el DATO 'Tecnico en terreno' no se toca" check-tildes.js 0 CONTROL

echo ""
echo "  ── check-tokens.js ──"
probar "radio hardcodeado fuera de zona"        check-tokens.js 1 's|\.stat-card { background: white; border-radius: var(--radio)|.stat-card { background: white; border-radius: 14px|'
probar "var() dentro del correo exportado"      check-tokens.js 1 's|border:1px solid #e0e0e0;border-radius:8px;padding:14px 16px|border:1px solid #e0e0e0;border-radius:var(--radio-sm);padding:14px 16px|'
probar "token fantasma"                         check-tokens.js 1 's|var(--texto3)|var(--noexiste)|'
probar "gris casi identico a --gris2"           check-tokens.js 1 's|\.badge-pend { background: var(--gris2)|.badge-pend { background: #EEF2FA|'
# §6 decia "solo transform y opacity" y "la pulse es la unica animacion en loop". Las dos eran
# falsas y nadie las verificaba: 7 `transition: all` y tres loops.
probar "transition: all reintroducida"          check-tokens.js 1 's|transition: width 0.3s, background-color 0.3s;|transition: all 0.3s;|'
probar "animacion en loop sin razon escrita"    check-tokens.js 1 's|animation: pulse 2s infinite|animation: parpadeo 2s infinite|'
probar "CONTROL (sin mutar)"                    check-tokens.js 0 CONTROL

echo ""
echo "  ── check-emojis.js ──"
probar "emoji a color reintroducido"            check-emojis.js 1 "s|toast('Foto guardada')|toast('Foto guardada 📷')|"
# El script verificaba "no hay emojis". No verificaba "todo icono se dibuja". Sobrevivio un
# <i class=\"ti ti-store\"> cuya hoja de estilos no se carga en ninguna parte: una caja vacia.
probar "icono de fuente sin su hoja cargada"    check-emojis.js 1 's|<div id="lista-sucursales"></div>|<div id="lista-sucursales"><i class="ti ti-store"></i></div>|'
probar "CONTROL (sin mutar)"                    check-emojis.js 0 CONTROL

echo ""
echo "  ─────────────────────────────────"
printf "  %d ok, %d con punto ciego\n\n" "$ok" "$mal"
[ "$mal" -eq 0 ]
