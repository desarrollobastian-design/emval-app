/* Prueba de regresion — el correo dice QUE version de la cotizacion lleva, y queda registrado.

   Caso (19-08-2026, Pedro): envio la 19082601 el 18, se la pidieron corregida, la corrigio el 19
   (de 1 x $800.000 a 50 x $16.000) y la volvio a enviar. Despues abrio un correo y vio cantidad 1,
   y concluyo que la correccion no habia salido. El PDF corregido SI se genero y SI quedo enlazado
   —verificado bajandolo de Cloudinary: dice 50 x $16.000— pero:

     · el correo manda un ENLACE, no un adjunto;
     · cada version sube un archivo NUEVO a Cloudinary, con nombre distinto;
     · o sea el correo del 18 sigue mostrando, hoy y siempre, la version vieja.

   Dos correos casi iguales en la bandeja y ninguna forma de distinguirlos sin abrirlos. Y del lado
   de EMVAL tampoco habia como responder "¿el correo del martes llevaba la version corregida?",
   porque no se guardaba QUE se mandaba, solo A QUIEN.

   Lo que vigila:
   1. La primera vez no dice nada. Un aviso de reemision en una cotizacion que sale por primera vez
      es ruido, y el ruido se deja de leer.
   2. Una reemision con documento nuevo dice CORREGIDA y con que fecha reemplaza a cual.
   3. Un reenvio del MISMO documento NO dice "corregida" — decirselo a algo que no cambio confunde
      igual que no decir nada.
   4. Una cotizacion anterior a este registro (sin `pdfEnviadoGen`) avisa igual: no se puede saber
      que version viajo, y un aviso de mas se lee, un PDF viejo confundido se firma.
   5. El envio queda registrado (`pdfUrlEnviado`, `pdfEnviadoGen`, `enviadoEn`) y viaja en el `post`,
      para que tambien se registre si el correo sale desde la cola manana.
   6. El bloque nuevo es HTML de correo: literales, nunca var(--...). Zona CSS-EXPORTADO.

   Uso:  node tests/cotizacion-dice-que-version-va.js index.html */

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const fallos = [];
const chequear = (ok, d) => { if (!ok) fallos.push('  ✗ ' + d); };

function cuerpo(nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  let prof = 0, fin = -1;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (prof === 0) { fin = k + 1; break; } }
  }
  return fin < 0 ? null : src.slice(i, fin);
}

const faltan = ['_fechaCortaCot', '_estadoReemisionCot', '_procesarEnvioCotizaciones', '_ejecutarPostCorreo']
  .filter(n => !cuerpo(n));
if (faltan.length) {
  console.error('No se encontro en index.html: ' + faltan.join(', '));
  console.error('Si las renombraste, revisa que el aviso de version siga en pie.');
  process.exit(1);
}
const api = new Function(cuerpo('_fechaCortaCot') + '\n' + cuerpo('_estadoReemisionCot') +
  '\nreturn { fecha: _fechaCortaCot, estado: _estadoReemisionCot };')();

// 1 · la primera vez no dice nada -----------------------------------------------------------------
{
  const r = api.estado({ pdfGeneradoEn: 1000, enviado: false });
  chequear(!r.reemision, 'una cotizacion que sale por primera vez no puede anunciarse como reemision');
  chequear(!api.estado(null).reemision, 'sin cotizacion no puede reventar');
}

// 2 · reemision con documento nuevo ----------------------------------------------------------------
{
  const r = api.estado({ enviado: true, pdfGeneradoEn: 2000, pdfEnviadoGen: 1000, enviadoEn: 500 });
  chequear(r.reemision && r.corregida, 'un PDF regenerado despues del ultimo envio es una correccion');
  chequear(r.antes === 500, 'tiene que decir cuando se envio la version anterior');
}

// 3 · reenvio del mismo documento ------------------------------------------------------------------
{
  const r = api.estado({ enviado: true, pdfGeneradoEn: 1000, pdfEnviadoGen: 1000, enviadoEn: 1200 });
  chequear(r.reemision && !r.corregida, 'reenviar el MISMO PDF no puede anunciarse como "corregida"');
}

// 4 · cotizacion anterior a este registro ----------------------------------------------------------
{
  const r = api.estado({ enviado: true, pdfGeneradoEn: 1000 });      // sin pdfEnviadoGen
  chequear(r.reemision && r.corregida, 'sin saber que version viajo hay que avisar igual');
}

// 5 · la fecha se lee, y la basura no rompe --------------------------------------------------------
{
  const f = api.fecha(new Date(2026, 7, 19, 9, 40).getTime());
  chequear(/^19-08-2026 09:40$/.test(f), 'formato de fecha inesperado: "' + f + '"');
  chequear(api.fecha(0) === '' && api.fecha(null) === '' && api.fecha('x') === '',
    'una fecha vacia o invalida tiene que dar texto vacio, no "NaN" en el correo del cliente');
}

// 6 · el correo lo muestra --------------------------------------------------------------------------
{
  const c = cuerpo('_procesarEnvioCotizaciones');
  chequear(c.indexOf('avisoVersion') > 0 && c.indexOf('_estadoReemisionCot') > 0,
    'el correo no arma el aviso de version');
  chequear(/Total: ' \+ total \+ '<\/div>' \+[\s\S]{0,40}avisoVersion/.test(c),
    'el aviso tiene que ir dentro de la tarjeta de la cotizacion, junto al total y al enlace');
  chequear(c.indexOf("_ver ? ' (v. '") > 0,
    'el enlace no lleva la version: es lo unico que queda si el correo se reenvia a otra persona');
  chequear(c.indexOf('COTIZACIÓN CORREGIDA') > 0 && c.indexOf('REENVÍO DEL MISMO DOCUMENTO') > 0,
    'faltan los dos textos del aviso');
}

// 7 · queda registrado QUE se mando ------------------------------------------------------------------
{
  const c = cuerpo('_procesarEnvioCotizaciones');
  chequear(c.indexOf('_loQueViaja') > 0 && /viaja: _loQueViaja/.test(c),
    'el `post` no lleva que documento viajo: si el correo sale de la cola manana, no se registra nada');
  chequear(/const _envioEn = Date\.now\(\);[\s\S]*?for \(var k = 0/.test(c),
    'la marca de tiempo del envio se calcula dentro del bucle de destinatarios: cada correo del mismo ' +
    'envio quedaria como un envio distinto');
  const p = cuerpo('_ejecutarPostCorreo');
  ['pdfUrlEnviado', 'pdfEnviadoGen', 'enviadoEn'].forEach(function (campo) {
    chequear(p.indexOf(campo) > 0, 'no se guarda ' + campo + ': vuelve a ser imposible saber que se envio');
  });
  chequear(p.indexOf('post.envioEn') > 0,
    'la fecha registrada tiene que ser la del envio que viaja en el post, no la del momento de escribir');
}

// 8 · HTML de correo: literales, nunca custom properties ---------------------------------------------
{
  const c = cuerpo('_procesarEnvioCotizaciones');
  const bloque = c.slice(c.indexOf('const avisoVersion'), c.indexOf('const verPdf'));
  chequear(bloque.indexOf('var(--') < 0,
    'el aviso usa una custom property: en el cliente de correo el :root de la app no existe y el ' +
    'estilo se cae entero (zona CSS-EXPORTADO)');
  chequear(bloque.indexOf('#EF9F27') > 0 || bloque.indexOf('#FFF4E5') > 0,
    'el aviso tiene que traer sus colores literales');
}

if (fallos.length) {
  console.error('\n✗ EL CORREO NO DICE QUE VERSION LLEVA:\n');
  console.error(fallos.join('\n'));
  console.error('\n' + fallos.length + ' fallo(s).');
  process.exit(1);
}
console.log('✓ el correo dice que version lleva, distingue correccion de reenvio, y queda registrado');
process.exit(0);
