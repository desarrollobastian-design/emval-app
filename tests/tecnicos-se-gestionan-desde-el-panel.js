/* Prueba de regresion — Pedro (Administrador) agrega, cambia el PIN, da de baja y reactiva TECNICOS EN
   TERRENO desde el panel (14-11-2026). Antes (D1-B, etapa 1 de Auth) el panel solo decia "lo hace CorexOn".

   Corre las funciones REALES extraidas de index.html contra un Firebase falso (Auth con cuentas, Firestore
   en memoria, una instancia aparte por operacion). Exige:
   1. Alta: crea la cuenta con la clave que sale del PIN (_claveFirebaseDePin) en una instancia APARTE, y
      escribe `tecnicos/{uid}` y `directorio/{uid}` con el uid de ESA cuenta y su correo (la entrada exige
      que coincidan). El directorio, solo con sus campos de siempre. La sesion de Pedro no se toca.
   2. No se crea nada con un nombre repetido (mayusculas, tildes, espacios), un PIN que no es de 4
      digitos, o si quien lo pide no es Administrador.
   3. Un timeout es no saber (regla 3): sin respuesta al guardar la ficha, el mensaje dice que puede haber
      quedado; sin respuesta al crear la cuenta, que no se guardo nada (y no queda ficha). Un rechazo de
      las reglas dice que falta el permiso.
   4. Cambiar el PIN: entra como el tecnico en la instancia aparte, cambia la clave y anota el PIN. Si un
      cambio anterior quedo a medias (clave ya cambiada, ficha no), el siguiente prueba `pinNuevo` y sale.
   5. Baja y reactivacion: `activo` en las dos colecciones. A un Supervisor o Administrador, nada.
   6. El formulario se lee antes del primer await (regla 2) y el panel tiene el boton para agregar.

   Uso:  node tests/tecnicos-se-gestionan-desde-el-panel.js index.html
   Sale 0 si todo se cumple; 1 si no. */

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8').replace(/\r\n/g, '\n');

const fallos = [];
function chequear(ok, detalle) { if (!ok) fallos.push('  ✗ ' + detalle); return !!ok; }
console.log('Pedro gestiona tecnicos en terreno desde el panel\n');

function funcion(nombre) {
  const re = new RegExp('\\n((?:async )?function ' + nombre + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\})');
  const m = src.match(re);
  chequear(!!m, 'no se encontro la funcion ' + nombre + ' en index.html (¿se renombro?)');
  return m ? m[1] : '';
}
function linea(re, que) {
  const m = src.match(re);
  chequear(!!m, 'no se encontro ' + que + ' en index.html (¿se renombro?)');
  return m ? m[0] : '';
}

const codigo = [
  linea(/const DOMINIO_CORREO_CUENTA = '[^']*';/, 'DOMINIO_CORREO_CUENTA'),
  linea(/function _claveFirebaseDePin\(pin\) \{[^\n]*\}/, '_claveFirebaseDePin'),
  linea(/function _correoDeCuenta\(uid\) \{[^\n]*\}/, '_correoDeCuenta'),
  linea(/const _AUTH_SIN_CONFIGURAR = \[[^\]]*\];/, '_AUTH_SIN_CONFIGURAR'),
  linea(/const CARGO_TECNICO = '[^']*';/, 'CARGO_TECNICO'),
  // Plazos cortos para la prueba (en la app, 8 s por paso).
  linea(/const GESTION_MS = \d+;/, 'GESTION_MS').replace(/\d+/, '60'),
  linea(/const SOLO_TECNICOS = '[^']*';/, 'SOLO_TECNICOS'),
  funcion('_conTimeout'), funcion('_esTimeout'), funcion('_authFirebase'),
  funcion('_normNombre'), funcion('_ahoraISO'), funcion('_authAparte'), funcion('_msgGestion'),
  funcion('_tecnicoGestionable'), funcion('_altaTecnico'), funcion('_cambiarPinTecnico'), funcion('_activarTecnico')
].join('\n');

// ── Firebase falso ──────────────────────────────────────────────────────────
const DOM = 'emval-app.firebaseapp.com';
function crearMundo() {
  const M = { cuentas: {}, col: { tecnicos: {}, directorio: {} }, apps: [], borradas: 0, principal: [],
    fallar: {}, colgar: {} };
  let n = 0;
  const err = (code) => { const e = new Error(code); e.code = code; return e; };
  const nunca = () => new Promise(() => {});
  const DEL = { __borrar: true };
  function aplicar(nombreCol, id, datos, merge) {
    const c = M.col[nombreCol] || (M.col[nombreCol] = {});
    const base = merge ? Object.assign({}, c[id] || {}) : {};
    Object.keys(datos).forEach(k => { if (datos[k] === DEL) delete base[k]; else base[k] = datos[k]; });
    c[id] = base;
  }
  function docRef(nombreCol, id) {
    return {
      id,
      get: async () => { const d = (M.col[nombreCol] || {})[id]; return { exists: !!d, id, data: () => d ? JSON.parse(JSON.stringify(d)) : undefined }; },
      update: async (datos) => {
        if (M.colgar.update) return nunca();
        if (M.fallar.update) throw err(M.fallar.update);
        if (!(M.col[nombreCol] || {})[id]) throw err('not-found');
        aplicar(nombreCol, id, datos, true);
      }
    };
  }
  const firestore = () => ({
    collection: (nombreCol) => ({
      get: async () => ({ docs: Object.keys(M.col[nombreCol] || {}).map(id => ({ id, data: () => M.col[nombreCol][id] })) }),
      doc: (id) => docRef(nombreCol, id || ('auto' + (++n) + 'XyZ'))
    }),
    batch: () => {
      const ops = [];
      return {
        set: (ref, datos) => ops.push(['set', ref, datos]),
        update: (ref, datos) => ops.push(['update', ref, datos]),
        commit: async () => {
          if (M.colgar.commit) return nunca();
          if (M.fallar.commit) throw err(M.fallar.commit);
          ops.forEach(([op, ref, datos]) => {
            const nombreCol = Object.keys(M.refs).find(k => M.refs[k].has(ref)) || '';
            aplicar(nombreCol, ref.id, datos, op === 'update');
          });
        }
      };
    }
  });
  firestore.FieldValue = { delete: () => DEL };
  // Para el lote: de que coleccion es cada ref.
  M.refs = { tecnicos: new Set(), directorio: new Set() };
  const fsBase = firestore;
  const firestoreConRefs = () => {
    const f = fsBase();
    const col = f.collection;
    f.collection = (nombreCol) => { const c = col(nombreCol); const d = c.doc; c.doc = (id) => { const r = d(id); (M.refs[nombreCol] || (M.refs[nombreCol] = new Set())).add(r); return r; }; return c; };
    return f;
  };
  firestoreConRefs.FieldValue = firestore.FieldValue;

  function authFalso(esPrincipal) {
    const a = {
      currentUser: null,
      setPersistence: async () => {},
      createUserWithEmailAndPassword: async (correo, clave) => {
        if (esPrincipal) M.principal.push('create');
        if (M.colgar.crear) return nunca();
        if (M.fallar.crear) throw err(M.fallar.crear);
        if (M.cuentas[correo]) throw err('auth/email-already-in-use');
        const uid = 'UID' + (++n) + 'aBc';
        M.cuentas[correo] = { uid, clave };
        a.currentUser = usuario(correo);
        return { user: a.currentUser };
      },
      signInWithEmailAndPassword: async (correo, clave) => {
        if (esPrincipal) M.principal.push('signIn');
        const c = M.cuentas[correo];
        if (!c) throw err('auth/user-not-found');
        if (c.clave !== clave) throw err('auth/invalid-credential');
        a.currentUser = usuario(correo);
        return { user: a.currentUser };
      },
      signOut: async () => { if (esPrincipal) M.principal.push('signOut'); a.currentUser = null; }
    };
    return a;
  }
  function usuario(correo) {
    return { uid: M.cuentas[correo].uid, email: correo,
      updatePassword: async (clave) => {
        if (M.colgarClaveTrasAplicar) { M.cuentas[correo].clave = clave; return nunca(); }
        if (M.colgar.clave) return nunca();
        M.cuentas[correo].clave = clave;
      } };
  }
  const principal = authFalso(true);
  const fb = {
    firestore: firestoreConRefs,
    auth: Object.assign(() => principal, { Auth: { Persistence: { NONE: 'none' } } }),
    app: () => ({ options: { projectId: 'demo' } }),
    initializeApp: (opts, nombre) => {
      const aut = authFalso(false);
      const app = { name: nombre, auth: () => aut, delete: async () => { M.borradas++; } };
      M.apps.push(app);
      return app;
    }
  };
  M.fb = fb;
  M.crearCuenta = (uid, correo, pin) => { M.cuentas[correo] = { uid, clave: 'emval-pin-' + pin }; };
  M.clave = (correo) => (M.cuentas[correo] || {}).clave;
  return M;
}

function cargar(M, cargo) {
  const ctx = { window: { firebase: M.fb }, estado: { cargo: cargo || 'Administrador' }, _uidEnLaApp: 'u_admin',
    _cargarSdkAuth: async () => false, console: { error() {}, warn() {}, log() {} } };
  const f = new Function('window', 'estado', '_uidEnLaApp', '_cargarSdkAuth', 'console',
    codigo + '\nreturn { _altaTecnico, _cambiarPinTecnico, _activarTecnico, _claveFirebaseDePin };');
  return f(ctx.window, ctx.estado, ctx._uidEnLaApp, ctx._cargarSdkAuth, ctx.console);
}

const CAMPOS_DIR = ['nombre', 'cargo', 'letra', 'correo', 'activo', 'actualizadoEn'];
function sembrar(M) {
  M.col.tecnicos.u_admin = { nombre: 'Pedro Arce', cargo: 'Administrador', passwordHash: 'x' };
  M.col.directorio.u_admin = { nombre: 'Pedro Arce', cargo: 'Administrador', letra: 'P', activo: true };
  M.col.tecnicos.u_sup = { nombre: 'Sara Sup', cargo: 'Supervisor', pin: '1111' };
  M.col.directorio.u_sup = { nombre: 'Sara Sup', cargo: 'Supervisor', letra: 'S', activo: true };
  M.col.tecnicos.u_tec = { nombre: 'José Pérez', cargo: 'Tecnico en terreno', pin: '2222', letra: 'J' };
  M.col.directorio.u_tec = { nombre: 'José Pérez', cargo: 'Tecnico en terreno', letra: 'J', activo: true, correo: 'u_tec@' + DOM };
  M.crearCuenta('u_tec', 'u_tec@' + DOM, '2222');
}

(async () => {
  if (fallos.length) return terminar();

  // 1. Alta
  {
    const M = crearMundo(); sembrar(M); const A = cargar(M);
    const r = await A._altaTecnico('  Nuevo   Tecnico ', '4321');
    const uid = r.uid || '';
    const t = M.col.tecnicos[uid] || {}, d = M.col.directorio[uid] || {};
    const cuenta = Object.keys(M.cuentas).find(c => M.cuentas[c].uid === uid);
    const okCuenta = !!cuenta && M.clave(cuenta) === 'emval-pin-4321' && cuenta.endsWith('@' + DOM);
    const okFichas = t.nombre === 'Nuevo Tecnico' && t.cargo === 'Tecnico en terreno' && t.pin === '4321' && t.correo === cuenta && t.activo === true &&
      d.nombre === 'Nuevo Tecnico' && d.cargo === 'Tecnico en terreno' && d.correo === cuenta && d.activo === true;
    const soloCampos = Object.keys(d).every(k => CAMPOS_DIR.indexOf(k) >= 0);
    const aparte = M.apps.length === 1 && M.borradas === 1 && M.principal.length === 0;
    console.log('1) Alta          → ' + (r.ok ? 'ok ✓' : 'NO (' + r.msg + ') ✗') + ' · cuenta con la clave del PIN: ' + (okCuenta ? '✓' : '✗') +
      ' · tecnicos y directorio con el uid y el correo de la cuenta: ' + (okFichas ? '✓' : '✗') + ' · directorio sin campos de mas: ' + (soloCampos ? '✓' : '✗') +
      ' · instancia aparte cerrada, sesion de Pedro intacta: ' + (aparte ? '✓' : '✗'));
    chequear(r.ok, 'el alta de un tecnico no funciona: ' + r.msg);
    chequear(okCuenta, 'la cuenta no se creo con la clave que sale del PIN (el tecnico no podria entrar)');
    chequear(okFichas, 'las fichas no llevan el uid y el correo de la cuenta creada (la entrada daria "otra-cuenta")');
    chequear(soloCampos, 'el directorio publico lleva campos de mas: ' + Object.keys(d).join(','));
    chequear(aparte, 'la cuenta se creo en la sesion de Pedro, o la instancia aparte no se cerro');
  }

  // 2. Lo que no se crea
  {
    const M = crearMundo(); sembrar(M); const A = cargar(M);
    const rep = await A._altaTecnico('jose  PEREZ', '9999');
    const pin3 = await A._altaTecnico('Otro Nombre', '123');
    const pin5 = await A._altaTecnico('Otro Nombre', '12345');
    const vacio = await A._altaTecnico('   ', '1234');
    const S = cargar(M, 'Supervisor');
    const sup = await S._altaTecnico('Otro Nombre', '1234');
    const nada = Object.keys(M.cuentas).length === 1 && Object.keys(M.col.tecnicos).length === 3;
    console.log('2) No se crea    → nombre repetido (tildes/mayusculas): ' + (!rep.ok ? 'no ✓' : 'SI ✗') + ' · PIN de 3 o 5: ' + (!pin3.ok && !pin5.ok ? 'no ✓' : 'SI ✗') +
      ' · sin nombre: ' + (!vacio.ok ? 'no ✓' : 'SI ✗') + ' · pedido por un Supervisor: ' + (!sup.ok ? 'no ✓' : 'SI ✗') + ' · ninguna cuenta ni ficha: ' + (nada ? '✓' : '✗'));
    chequear(!rep.ok && /Ya hay alguien/.test(rep.msg), 'se creo un tecnico con un nombre que ya existe (la entrada busca por nombre)');
    chequear(!pin3.ok && !pin5.ok, 'se acepto un PIN que no es de 4 digitos');
    chequear(!vacio.ok, 'se creo un tecnico sin nombre');
    chequear(!sup.ok, 'un Supervisor pudo agregar un tecnico');
    chequear(nada, 'quedaron cuentas o fichas de los intentos rechazados');
  }

  // 3. Timeouts y permisos
  {
    const M = crearMundo(); sembrar(M); M.colgar.commit = true; const A = cargar(M);
    const r = await A._altaTecnico('Colgado Ficha', '1234');
    const M2 = crearMundo(); sembrar(M2); M2.colgar.crear = true; const B = cargar(M2);
    const r2 = await B._altaTecnico('Colgado Cuenta', '1234');
    const sinFicha2 = Object.keys(M2.col.tecnicos).length === 3 && M2.borradas === 1;
    const M3 = crearMundo(); sembrar(M3); M3.fallar.commit = 'permission-denied'; const C = cargar(M3);
    const r3 = await C._altaTecnico('Sin Permiso', '1234');
    console.log('3) No saber      → ficha sin respuesta: ' + (/puede haber quedado/.test(r.msg) ? 'dice que puede haber quedado ✓' : '"' + r.msg + '" ✗') +
      ' · cuenta sin respuesta: ' + (/No se guardó nada/.test(r2.msg) && sinFicha2 ? 'no se guardo nada, instancia cerrada ✓' : '"' + r2.msg + '" ✗') +
      ' · reglas: ' + (/falta activar el permiso/.test(r3.msg) ? 'dice que falta el permiso ✓' : '"' + r3.msg + '" ✗'));
    chequear(!r.ok && /puede haber quedado/.test(r.msg), 'un timeout al guardar la ficha se informa como fallo seguro (regla 3)');
    chequear(!r2.ok && /No se guardó nada/.test(r2.msg) && sinFicha2, 'un timeout al crear la cuenta no lo dice, deja ficha o no cierra la instancia');
    chequear(!r3.ok && /falta activar el permiso/.test(r3.msg), 'un rechazo de las reglas no dice que falta el permiso');
  }

  // 4. Cambiar el PIN
  {
    const M = crearMundo(); sembrar(M); const A = cargar(M);
    const r = await A._cambiarPinTecnico('u_tec', '5555');
    const t = M.col.tecnicos.u_tec;
    const ok1 = r.ok && M.clave('u_tec@' + DOM) === 'emval-pin-5555' && t.pin === '5555' && !('pinNuevo' in t) && M.principal.length === 0 && M.borradas === 1;
    // A medias: la clave quedo cambiada (respuesta perdida) y la ficha anoto pinNuevo.
    const M2 = crearMundo(); sembrar(M2); M2.colgarClaveTrasAplicar = true; const B = cargar(M2);
    const rA = await B._cambiarPinTecnico('u_tec', '7777');
    const medio = M2.col.tecnicos.u_tec;
    M2.colgarClaveTrasAplicar = false;
    const rB = await B._cambiarPinTecnico('u_tec', '7777');
    const fin = M2.col.tecnicos.u_tec;
    const ok2 = !rA.ok && medio.pin === '2222' && medio.pinNuevo === '7777' && M2.clave('u_tec@' + DOM) === 'emval-pin-7777' &&
      rB.ok && fin.pin === '7777' && !('pinNuevo' in fin);
    // Y otro cambio despues de uno a medias, a un PIN distinto.
    const M3 = crearMundo(); sembrar(M3); M3.col.tecnicos.u_tec.pinNuevo = '8888'; M3.cuentas['u_tec@' + DOM].clave = 'emval-pin-8888'; const C = cargar(M3);
    const rC = await C._cambiarPinTecnico('u_tec', '9090');
    const ok3 = rC.ok && M3.clave('u_tec@' + DOM) === 'emval-pin-9090' && M3.col.tecnicos.u_tec.pin === '9090';
    const rS = await A._cambiarPinTecnico('u_sup', '0000');
    const rP = await A._cambiarPinTecnico('u_admin', '0000');
    console.log('4) Cambiar PIN   → ' + (ok1 ? 'clave y ficha al nuevo, en instancia aparte ✓' : 'NO (' + r.msg + ') ✗') +
      ' · a medias, se retoma: ' + (ok2 ? '✓' : '✗ (' + rA.msg + ' / ' + rB.msg + ')') + ' · tras uno a medias, a otro PIN: ' + (ok3 ? '✓' : '✗ (' + rC.msg + ')') +
      ' · Supervisor/Administrador: ' + (!rS.ok && !rP.ok ? 'no ✓' : 'SI ✗'));
    chequear(ok1, 'cambiar el PIN no deja la clave de la cuenta y la ficha en el PIN nuevo, o toca la sesion de Pedro: ' + r.msg);
    chequear(ok2, 'un cambio de PIN a medias no se retoma (la ficha y la cuenta quedan distintas)');
    chequear(ok3, 'despues de un cambio a medias no se puede cambiar a otro PIN: ' + rC.msg);
    chequear(!rS.ok && !rP.ok, 'se le cambio el PIN o la clave a un Supervisor o Administrador desde el panel');
  }

  // 5. Baja y reactivacion
  {
    const M = crearMundo(); sembrar(M); const A = cargar(M);
    const b = await A._activarTecnico('u_tec', false);
    const deBaja = M.col.tecnicos.u_tec.activo === false && M.col.directorio.u_tec.activo === false;
    const a = await A._activarTecnico('u_tec', true);
    const activo = M.col.tecnicos.u_tec.activo === true && M.col.directorio.u_tec.activo === true;
    const s = await A._activarTecnico('u_sup', false);
    const supIntacto = M.col.directorio.u_sup.activo === true;
    const cuentaIntacta = M.clave('u_tec@' + DOM) === 'emval-pin-2222';
    console.log('5) Baja/Reactivar→ baja en las dos: ' + (b.ok && deBaja ? '✓' : '✗') + ' · reactivar: ' + (a.ok && activo ? '✓' : '✗') +
      ' · cuenta sin tocar: ' + (cuentaIntacta ? '✓' : '✗') + ' · Supervisor: ' + (!s.ok && supIntacto ? 'no ✓' : 'SI ✗'));
    chequear(b.ok && deBaja, 'la baja no marca activo:false en tecnicos y directorio: ' + b.msg);
    chequear(a.ok && activo, 'reactivar no vuelve a activo:true: ' + a.msg);
    chequear(cuentaIntacta, 'la baja toco la cuenta de Firebase');
    chequear(!s.ok && supIntacto, 'se dio de baja a un Supervisor desde el panel');
  }

  // 6. Formulario y panel
  {
    const g = funcion('guardarTecnico');
    // El primer `await` de codigo (no el de un comentario): `await _x(` o `await nombre(`.
    const antes = g.split(/\bawait\s+[A-Za-z_]/)[0] || '';
    chequear(antes.length < g.length, 'guardarTecnico no tiene ningun await: la prueba de la instantanea no mide nada');
    const instantanea = /tec-nombre/.test(antes) && /tec-pin/.test(antes) && /editandoTecnicoId/.test(antes);
    const boton = /onclick="mostrarFormTecnico\(\)"[^>]*>\+ Agregar técnico</.test(src);
    const sinCargos = !/<option value="Administrador">/.test(src.slice(src.indexOf('id="form-tecnico"'), src.indexOf('id="lista-tecnicos-admin"')));
    console.log('6) Panel         → formulario leido antes del primer await: ' + (instantanea ? '✓' : '✗') + ' · boton + Agregar técnico: ' + (boton ? '✓' : '✗') +
      ' · el formulario no ofrece Administrador/Supervisor: ' + (sinCargos ? '✓' : '✗'));
    chequear(instantanea, 'guardarTecnico lee el formulario despues de un await (regla 2)');
    chequear(boton, 'el panel no tiene el boton + Agregar técnico');
    chequear(sinCargos, 'el formulario ofrece cargos que el panel no puede dar');
  }
  terminar();
})().catch(e => { console.log('FALLA — el guion se cayo: ' + (e && e.stack)); process.exit(1); });

function terminar() {
  console.log('');
  if (fallos.length) { console.log('FALLA (' + fallos.length + '):'); fallos.forEach(f => console.log(f)); process.exit(1); }
  console.log('OK — Pedro agrega, cambia el PIN, da de baja y reactiva tecnicos en terreno, sin tocar su sesion ni a nadie mas.');
  process.exit(0);
}
