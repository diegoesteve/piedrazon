// Piedrazón como app (PWA): cuatro pestañas, Hoy, Mapa, El Cuis y Ajustes.
// Es una página estática: lee docs/data/*.json, que actualizan los workflows de GitHub Actions. Córdoba usa
// docs/data/ (la más detallada); el resto del país, docs/data/prov/<provincia>/, con los mismos archivos, y
// docs/data/provincias.json es el índice de localidades de todo el país para el buscador y la ubicación.
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sinTildes = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const LETRA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const CENTRO = [-32.0, -63.9];
const COLOR_RIESGO = { alto: '#C0362C', moderado: '#F2C230', bajo: '#1F7A4D' };
const CLASE_RIESGO = { alto: 'n-rojo', moderado: 'n-amarillo', bajo: 'n-verde' };
const COLOR_RADAR = { 'granizo probable': '#FF2A98', 'posible granizo': '#FF2A0C' };
const NIVEL = ['bajo', 'moderado', 'alto'];
const ORDEN = { mascota: -1, tranqui: 0, atento: 1, enojado: 2, furioso: 3 };
const TITULO = { tranqui: 'Hoy no se espera piedra', atento: 'Puede haber tormenta', enojado: 'Puede caer piedra', furioso: '¡Granizo cerca!', mascota: 'Todavía sin datos frescos' };
const TZ = 'America/Argentina/Cordoba';
const fmtHora = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
const claveHora = (d = new Date()) => fmtHora.format(d).slice(0, 13);   // «2026-10-23 13», en hora de Córdoba
const hoyISO = () => claveHora().slice(0, 10);
const fechaDe = d => new Date(d + 'T12:00:00');
const plural = (n, s, p = s + 's') => `${n} ${n === 1 ? s : p}`;
const TACTIL = window.matchMedia('(pointer: coarse)').matches;

// ---------------------------------------------------------------- preferencias (solo en este navegador)
const PREF = {
  get(k, def) { try { const v = localStorage.getItem('pz.' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem('pz.' + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
};

function aplicarApariencia() {
  const raiz = document.documentElement;
  const tema = PREF.get('tema', 'auto');
  if (tema === 'auto') delete raiz.dataset.theme; else raiz.dataset.theme = tema;
  if (PREF.get('letra', false)) raiz.dataset.letra = 'grande'; else delete raiz.dataset.letra;
}
aplicarApariencia();

// ---------------------------------------------------------------- datos
const CORTO = { 'Ciudad Autónoma de Buenos Aires': 'Ciudad de Buenos Aires', 'Tierra del Fuego, Antártida e Islas del Atlántico Sur': 'Tierra del Fuego' };
const corta = p => CORTO[p] || p;
// Nombre con que se guarda la suscripción de avisos (igual que comun.clave_aviso): en Córdoba, la localidad; en el
// resto, «Localidad · Provincia», porque hay nombres repetidos entre provincias
const claveAviso = (nombre, prov) => prov === 'Córdoba' ? nombre : `${nombre} · ${prov}`;
const baseDe = p => p === 'cordoba' ? 'data/' : `data/prov/${p}/`;
let PROV = PREF.get('provincia', 'cordoba'), PROV_NOMBRE = 'Córdoba';   // la provincia que se está mirando
async function leer(nombre, base = baseDe(PROV)) {
  try {
    const r = await fetch(`${base}${nombre}?t=${Date.now()}`);
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}
// Índice de todo el país (se baja solo al buscar una localidad o usar la ubicación)
let INDICE = null, INDICE_LISTO = null;
function cargarIndice() {
  if (!INDICE) INDICE = fetch('data/provincias.json').then(r => r.ok ? r.json() : null).then(d => {
    if (!d) throw new Error('sin índice');
    const todas = [];
    for (const p of d.provincias) for (const [localidad, lat, lon] of p.localidades) todas.push({ localidad, lat, lon, prov: p.slug, provNombre: p.nombre });
    INDICE_LISTO = todas;
    return { provincias: d.provincias, todas };
  }).catch(() => { INDICE = null; return null; });
  return INDICE;
}
function edad(fechaHora) {
  if (!fechaHora) return null;
  return Math.round((Date.now() - new Date(fechaHora.replace(' ', 'T') + ':00-03:00')) / 60000);
}

let AHORA = null, PRON = null, SMN = null, HORAS = null, LOCS = [], CARGADO = 0, REPORTES = [];
// Reportes de vecinos de las últimas 3 horas, del servicio de avisos (worker/avisos.js)
async function cargarReportes() {
  if (!AVISOS.url) return;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000);
  try {
    const r = await fetch(AVISOS.url.replace(/\/$/, '') + '/reportes', { signal: ctl.signal });
    if (r.ok) REPORTES = (await r.json()).reportes || [];
  } catch (e) { /* sin reportes */ } finally { clearTimeout(t); }
}
const VIGENCIA_REPORTE_MIN = 60;
// los «sí, cae piedra» de la última hora de una localidad, del más nuevo al más viejo
const confirmaciones = f => !f ? [] : REPORTES.filter(r => r.cae && r.loc === claveAviso(f.localidad, f.provNombre || 'Córdoba') &&
  Date.now() - new Date(r.t) <= VIGENCIA_REPORTE_MIN * 60000).sort((a, b) => (a.t < b.t ? 1 : -1));
const TAMANO = { chico: 'Chica, como un garbanzo', mediano: 'Mediana, como una nuez', grande: 'Grande, como una pelota de golf o más' };
const COMO = { chico: 'de un garbanzo', mediano: 'de una nuez', grande: 'de una pelota de golf o más' };
const fmtHM = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hourCycle: 'h23' });
const horaCorta = t => `${fmtHM.format(new Date(t))} h`;
function textoConfirmaciones(f, cs) {
  const tam = cs.map(c => c.tam).filter(Boolean).sort((a, b) => Object.keys(TAMANO).indexOf(b) - Object.keys(TAMANO).indexOf(a))[0];
  return `${cs.length === 1 ? 'Un vecino confirma' : `${cs.length} vecinos confirman`} que está cayendo piedra en ${esc(f.localidad)}` +
    `${tam ? `, del tamaño ${COMO[tam]}` : ''} (${cs.length === 1 ? '' : 'el último, '}${horaCorta(cs[0].t)}).`;
}
const ARCHIVOS = ['granizo_ahora.json', 'granizo_pronostico.json', 'localidades.json', 'smn.json', 'granizo_horas.json', 'granizo_reciente.json'];
// Datos de una localidad de otra provincia, solo para contestar en el chat sin cambiar lo que se está mirando
async function localidadDe(nombre, prov) {
  if (prov === PROV) return porNombre(nombre);
  const base = baseDe(prov);
  const [a, p, l, s, , r] = await Promise.all(ARCHIVOS.map(n => n === 'granizo_horas.json' ? null : leer(n, base)));
  const f = ((l && l.localidades) || []).find(x => x.localidad === nombre);
  if (!f) return null;
  const radarFresco = a && edad(a.consultado) <= 60;
  return { ...f, prov, provNombre: corta((l && l.provincia) || 'Córdoba'), smn: s || { alertas: [], localidades: {} }, dias: (p && p.localidades[nombre]) || [],
    radar: radarFresco ? (a.localidades || {})[nombre] || null : null, reciente: ((r && r.localidades) || {})[nombre] || [] };
}
async function cargar() {
  const reportes = cargarReportes();   // en paralelo con los archivos (máximo 5 segundos)
  let [a, p, l, s, h, r] = await Promise.all(ARCHIVOS.map(n => leer(n)));
  if (!l && PROV !== 'cordoba') {   // una provincia sin datos: se vuelve a Córdoba
    PROV = 'cordoba';
    [a, p, l, s, h, r] = await Promise.all(ARCHIVOS.map(n => leer(n)));
  }
  PROV_NOMBRE = corta((l && l.provincia) || 'Córdoba');
  // Del SMN, las alertas naranjas y rojas suben el nivel de Piedrazón; las amarillas son muy generales y solo se muestran
  // como información (Piedrazón pone cara de duda, pero no cambia el nivel ni manda avisos)
  AHORA = a; PRON = p; SMN = s; HORAS = h && h.horas && h.horas.length ? h : null;
  const radarFresco = a && edad(a.consultado) <= 60;
  LOCS = ((l && l.localidades) || []).map(f => ({ ...f, prov: PROV, provNombre: PROV_NOMBRE, dias: (p && p.localidades[f.localidad]) || [], radar: radarFresco ? (a.localidades || {})[f.localidad] || null : null,
    reciente: ((r && r.localidades) || {})[f.localidad] || [] }));
  if (HORAS) {
    // conteo por hora: [moderado, alto]
    HORAS.conteo = HORAS.horas.map((_, i) => {
      let m = 0, al = 0;
      for (const v of Object.values(HORAS.localidades)) { const r = v[i]; if (r === '1') m++; else if (r === '2') al++; }
      return [m, al];
    });
    HORAS.dias = [...new Set(HORAS.horas.map(x => x.slice(0, 10)))];
  }
  await reportes;
  CARGADO = Date.now();
}
const porNombre = n => LOCS.find(x => x.localidad === n) || null;
// tu localidad, si es de la provincia que se está mirando
const miLocalidad = () => PREF.get('provincia', 'cordoba') === PROV ? porNombre(PREF.get('localidad', null)) : null;
const esMia = f => !!f && PREF.get('localidad', null) === f.localidad && PREF.get('provincia', 'cordoba') === f.prov;
const todaLa = () => PROV === 'cordoba' ? 'Toda la provincia' : PROV === 'ciudad-de-buenos-aires' ? 'Toda la ciudad' : `Toda la provincia (${PROV_NOMBRE})`;
const conProv = f => f.prov && f.prov !== 'cordoba' && !f.localidad.includes(f.provNombre) ? `${f.localidad} (${f.provNombre})` : f.localidad;
const enlace = f => `?localidad=${encodeURIComponent(f.localidad)}${f.prov && f.prov !== 'cordoba' ? `&provincia=${f.prov}` : ''}`;

// ---------------------------------------------------------------- niveles de Piedrazón
const ORDEN_SMN = { amarillo: 1, naranja: 2, rojo: 3 };
function alertasDe(f) {
  const S = f.smn || SMN;
  const ids = (S && S.localidades && S.localidades[f.localidad]) || [];
  return S ? S.alertas.filter(a => ids.includes(a.id)) : [];
}
const smnDe = f => Math.max(0, ...alertasDe(f).map(a => ORDEN_SMN[a.nivel] || 0));
const fuertes = alertas => alertas.filter(a => (ORDEN_SMN[a.nivel] || 0) >= 2);
const amarillas = alertas => alertas.filter(a => a.nivel === 'amarillo');

// «a las 7:44 h», la hora de la pasada del radar
const horaRadar = v => v && v.visto ? `${Number(v.visto.slice(11, 13)) === 1 ? 'a la' : 'a las'} ${Number(v.visto.slice(11, 13))}:${v.visto.slice(14, 16)} h` : '';
function nivelLocalidad(f) {
  const h = horaRadar(f.radar);
  if (f.radar && f.radar.nivel === 'granizo probable') return ['furioso', `¡Granizo probable a ${km1(f.radar.km)} km de ${esc(f.localidad)}${h ? ` (radar ${h})` : ''}! No salgas y alejate de las ventanas.`];
  if (f.radar) return ['enojado', `${h ? `El radar, ${h}, ve` : 'El radar ve'} una tormenta fuerte a ${km1(f.radar.km)} km de ${esc(f.localidad)}. Guardá el auto y quedate bajo techo.`];
  const s = Math.min(smnDe(f), 3);
  if (s >= 2) return ['enojado', `El SMN tiene alerta ${s === 3 ? 'roja' : 'naranja'} por tormentas en ${esc(f.localidad)}. Guardá el auto y quedate bajo techo.`];
  const hoy = f.dias[0] && f.dias[0].riesgo;
  if (hoy === 'alto' || hoy === 'moderado')
    return ['atento', `Hoy hay condiciones para tormenta en ${esc(f.localidad)}${hoy && hoy !== 'bajo' && f.dias[0].hora ? `, sobre todo cerca de las ${esc(f.dias[0].hora)} h` : ''}. Mirá el cielo y seguí el pronóstico.`];
  return ['tranqui', `En ${esc(f.localidad)} está tranqui: el radar no ve granizo y hoy no hay condiciones para tormenta.`];
}
function nivelGeneral() {
  const e = AHORA ? edad(AHORA.consultado) : null;
  const locs = n => plural(n, 'localidad', 'localidades');
  if (e == null || e > 60) return ['mascota', 'Todavía no tengo datos frescos del radar. Volvé en un rato.'];
  const afect = LOCS.filter(f => f.radar), prob = afect.filter(f => f.radar.nivel === 'granizo probable');
  const ultima = afect.map(f => f.radar).filter(v => v.visto).sort((x, y) => (y.visto > x.visto ? 1 : -1))[0], h = horaRadar(ultima);
  if (prob.length) return ['furioso', `¡Granizo probable cerca de ${locs(prob.length)}${h ? ` (radar ${h})` : ''}! Si estás ahí, no salgas y alejate de las ventanas.`];
  if (afect.length) return ['enojado', `${h ? `El radar, ${h}, ve` : 'El radar ve'} tormentas fuertes cerca de ${locs(afect.length)}. Si estás ahí, guardá el auto y quedate bajo techo.`];
  const smn = Math.max(0, ...fuertes((SMN && SMN.alertas) || []).map(a => ORDEN_SMN[a.nivel] || 0));
  const conSMN = LOCS.filter(f => smnDe(f) >= Math.max(smn, 2)).length;
  const color = { 1: 'amarilla', 2: 'naranja', 3: 'roja' }[smn];
  if (smn >= 2) return ['enojado', `El SMN dio alerta ${color} por tormentas en ${locs(conSMN)}. Los radares todavía no ven granizo, pero guardá el auto y estate atento. Elegí tu localidad para ver si te toca.`];
  const hoy = LOCS.filter(f => f.dias[0] && f.dias[0].riesgo !== 'bajo').length;
  if (hoy) return ['atento', `Hoy hay condiciones para tormenta en ${locs(hoy)}, aunque los radares todavía no ven granizo. Elegí la tuya y seguí el pronóstico.`];
  return ['tranqui', 'Cielo tranquilo: los radares no ven granizo y hoy no hay condiciones para tormenta.'];
}
function estado(f = miLocalidad()) {
  let [nivel, texto0] = f ? nivelLocalidad(f) : nivelGeneral();
  let titulo = TITULO[nivel];
  // reportes de vecinos: con alerta del radar, confirman el granizo (sube al máximo); sin alerta, solo se cuentan
  if (f) {
    const cs = confirmaciones(f);
    if (cs.length && f.radar) { nivel = 'furioso'; titulo = '¡Está cayendo granizo!'; texto0 = `${textoConfirmaciones(f, cs)} ${texto0}`; }
    else if (cs.length) texto0 = `${texto0} Ojo: ${textoConfirmaciones(f, cs).replace(/^U/, 'u')} El radar no lo ve en este momento.`;
  } else if (nivel === 'furioso' || nivel === 'enojado') {
    const conf = LOCS.filter(x => x.radar && confirmaciones(x).length);
    if (conf.length) { nivel = 'furioso'; titulo = '¡Está cayendo granizo!'; texto0 = `Vecinos confirman que está cayendo piedra en ${conf.slice(0, 4).map(x => esc(x.localidad)).join(', ')}${conf.length > 4 ? ` y ${conf.length - 4} más` : ''}. ${texto0}`; }
  }
  // alerta amarilla del SMN: no cambia el nivel, pero si está tranqui Piedrazón pone cara de duda y lo cuenta
  const am = agruparSMN(amarillas(f ? alertasDe(f) : (SMN ? SMN.alertas : [])))[0];
  const duda = !!am && nivel === 'tranqui';
  const texto = am && (nivel === 'tranqui' || nivel === 'atento')
    ? `${texto0} Ojo: el SMN tiene alerta amarilla por ${esc(String(am.titulo || 'tormentas').toLowerCase())} ${f ? 'acá' : 'en parte de la provincia'}, ${hastaSMN(am)}. No quiere decir que caiga granizo.`
    : texto0;
  return { f, nivel, titulo, texto, duda, lugar: f ? f.localidad : 'la provincia' };
}

// riesgo 0, 1 o 2 en la hora i del pronóstico, para una localidad o el peor de la provincia
function riesgoHora(f, i) {
  if (!HORAS) return 0;
  if (f) return Number((HORAS.localidades[f.localidad] || '')[i] || 0);
  const [m, a] = HORAS.conteo[i];
  return a ? 2 : m ? 1 : 0;
}
function indiceAhora() { return HORAS ? HORAS.horas.findIndex(h => h >= claveHora()) : -1; }
function riesgoDia(f, i) {
  if (f) return (f.dias[i] || {}).riesgo || null;
  const rs = LOCS.map(x => (x.dias[i] || {}).riesgo).filter(Boolean);
  return rs.includes('alto') ? 'alto' : rs.includes('moderado') ? 'moderado' : rs.length ? 'bajo' : null;
}
function nombreDia(fecha, i) {
  const d = fechaDe(fecha);
  return i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : `${DIAS[d.getDay()][0].toUpperCase()}${DIAS[d.getDay()].slice(1, 3)} ${d.getDate()}`;
}
// Tramos de horas seguidas con condiciones para granizo, desde ahora y hasta `cuantas` horas
function tramos(f, cuantas = 72) {
  const i0 = indiceAhora();
  if (i0 < 0) return [];
  const out = [];
  for (let i = i0; i < Math.min(HORAS.horas.length, i0 + cuantas); i++) {
    const r = riesgoHora(f, i);
    if (!r) continue;
    const h = HORAS.horas[i], ult = out[out.length - 1];
    if (ult && ult.fin === i - 1 && ult.dia === h.slice(0, 10)) { ult.fin = i; ult.max = Math.max(ult.max, r); }
    else out.push({ dia: h.slice(0, 10), ini: i, fin: i, max: r });
  }
  return out.map(t => ({ ...t, desde: Number(HORAS.horas[t.ini].slice(11, 13)), hasta: Number(HORAS.horas[t.fin].slice(11, 13)) + 1 }));
}
function textoTramo(t) {
  const i = (PRON && PRON.dias.indexOf(t.dia)) ?? -1;
  const dia = i === 0 ? 'hoy' : i === 1 ? 'mañana' : `el ${DIAS[fechaDe(t.dia).getDay()]} ${fechaDe(t.dia).getDate()}`;
  return `${dia} de ${t.desde} a ${t.hasta} h (riesgo ${NIVEL[t.max]})`;
}

// ---------------------------------------------------------------- lo que vio el radar en las últimas 24 horas
// granizo_reciente.json: por localidad, cada pasada del radar con granizo [hora, nivel, km, dBZ, tope]. Las pasadas
// seguidas (menos de 40 minutos entre una y otra) son la misma tormenta: se juntan y se muestra lo más fuerte.
const ORDEN_RADAR = { 'posible granizo': 1, 'granizo probable': 2 };
function episodios(lista) {
  const out = [];
  for (const [hora, nivel, km, dbz, tope] of lista || []) {
    const t = new Date(hora.replace(' ', 'T') + ':00-03:00'), e = { nivel, km, dbz, tope }, ult = out[out.length - 1];
    if (ult && t - ult.t <= 40 * 60000) {
      ult.fin = hora; ult.t = t;
      if (ORDEN_RADAR[nivel] > ORDEN_RADAR[ult.peor.nivel] || (nivel === ult.peor.nivel && km < ult.peor.km)) ult.peor = e;
    } else out.push({ ini: hora, fin: hora, t, peor: e });
  }
  return out.reverse();   // lo más reciente primero
}
function cuandoFue(hora) {
  const [d, hm] = hora.split(' '), h = Number(hm.slice(0, 2));
  const ayer = claveHora(new Date(Date.now() - 864e5)).slice(0, 10);
  return { dia: d === hoyISO() ? 'hoy' : d === ayer ? 'ayer' : `el ${Number(d.slice(8))}/${Number(d.slice(5, 7))}`, hhmm: `${h}:${hm.slice(3)}`, art: h === 1 ? 'a la' : 'a las' };
}
// «hoy a la 1:30 h» o «hoy de 1:13 a 1:30 h»
function cuandoEpisodio(ep) {
  const a = cuandoFue(ep.ini), b = cuandoFue(ep.fin);
  if (ep.ini === ep.fin) return `${a.dia} ${a.art} ${a.hhmm} h`;
  return a.dia === b.dia ? `${a.dia} de ${a.hhmm} a ${b.hhmm} h` : `${a.dia} ${a.art} ${a.hhmm} h hasta ${b.dia} ${b.art} ${b.hhmm} h`;
}
const km1 = x => String(x).replace('.', ',');
const mayus = t => t.charAt(0).toUpperCase() + t.slice(1);
function textoEpisodio(ep, lugar) {
  return `${mayus(cuandoEpisodio(ep))}: <b>${esc(ep.peor.nivel)}</b> a ${km1(ep.peor.km)} km${lugar ? ` de ${esc(lugar)}` : ''}` +
    `<span class="tecnico nota"> (${ep.peor.dbz} dBZ${ep.peor.tope ? `, tope ${km1(ep.peor.tope)} km` : ''})</span>`;
}
// Tormentas que ya pasaron: sin la que el radar ve ahora, que ya se muestra arriba
const pasados = f => episodios(f.reciente).filter(ep => !(f.radar && f.radar.visto && ep.fin === f.radar.visto));
// Para una localidad: lista de tormentas; para la provincia: las localidades, de la más reciente a la más vieja
function htmlReciente(f) {
  if (f) {
    const eps = pasados(f);
    return eps.length ? `<ul class="lista-reciente">${eps.slice(0, 4).map(ep => `<li><span class="punto" style="--c:${COLOR_RADAR[ep.peor.nivel]}"></span><span>${textoEpisodio(ep)}</span></li>`).join('')}</ul>` : '';
  }
  const conAlgo = LOCS.map(x => [x, pasados(x)[0]]).filter(([, ep]) => ep).sort((x, y) => y[1].t - x[1].t);
  if (!conAlgo.length) return '';
  return `<p class="nota">Más temprano (últimas 24 horas), el radar vio granizo cerca de ${plural(conAlgo.length, 'localidad', 'localidades')}. Ya pasó:</p><div class="lugares-recientes">` +
    conAlgo.slice(0, 12).map(([x, ep]) => `<a href="${enlace(x)}#mapa" data-ver="${esc(x.localidad)}"><span class="punto" style="--c:${COLOR_RADAR[ep.peor.nivel]}"></span>${esc(x.localidad)} <span class="nota">${esc(cuandoFue(ep.fin).dia === 'hoy' ? cuandoFue(ep.fin).hhmm + ' h' : cuandoFue(ep.fin).dia)}</span></a>`).join('') +
    (conAlgo.length > 12 ? `<span class="nota">y ${conAlgo.length - 12} más</span>` : '') + '</div>';
}

// ---------------------------------------------------------------- utilidades de interfaz
const chip = r => r ? `<span class="chip ${CLASE_RIESGO[r]}"><span class="punto"></span>${esc(r)}</span>` : '<span class="nota">sin dato</span>';
function urlDe(f) { return location.origin + location.pathname + (f ? enlace(f) : PROV !== 'cordoba' ? `?provincia=${PROV}` : ''); }
async function compartir(f = miLocalidad()) {
  const e = estado(f);
  const texto = `Piedrazón: ${TITULO[e.nivel]} en ${e.lugar}.`;
  const url = urlDe(f);
  if (navigator.share) {
    try { await navigator.share({ title: 'Piedrazón', text: texto, url }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(`${texto} ${url}`)}`, '_blank', 'noopener');
}
function saltar(el) { el.classList.remove('salta'); void el.offsetWidth; el.classList.add('salta'); }

// Buscador de localidades con sugerencias, que se usa en el mapa y al elegir tu localidad
// `candidatas()` da la lista donde buscar: las localidades de la provincia que se mira, o las de todo el país
function buscador(input, lista, alElegir, candidatas = () => LOCS) {
  let sug = [], marcada = -1;
  const cerrar = () => { lista.hidden = true; input.setAttribute('aria-expanded', 'false'); marcada = -1; };
  const pintar = () => {
    const q = sinTildes(input.value.trim());
    if (!q) return cerrar();
    const rango = f => { const n = sinTildes(f.localidad); return n.startsWith(q) ? 0 : (' ' + n).includes(' ' + q) ? 1 : 2; };
    const aca = f => f.prov === PROV ? 0 : 1;
    sug = candidatas().filter(f => sinTildes(f.localidad).includes(q)).sort((a, b) => rango(a) - rango(b) || aca(a) - aca(b) || a.localidad.localeCompare(b.localidad)).slice(0, 8);
    lista.innerHTML = sug.length
      ? sug.map((f, i) => {
        const g = f.dias ? f : f.prov === PROV ? porNombre(f.localidad) : null;   // con pronóstico, si es de la provincia que se mira
        const prov = f.provNombre && f.provNombre !== 'Córdoba' && !f.localidad.includes(f.provNombre) ? ` <span class="nota">· ${esc(f.provNombre)}</span>` : '';
        return `<li role="option" id="${lista.id}-${i}" data-i="${i}" aria-selected="${i === marcada}"><span>${esc(f.localidad)}${prov}</span>${g && g.dias[0] ? chip(g.dias[0].riesgo) : ''}</li>`;
      }).join('')
      : '<li class="vacio">No hay localidades con ese nombre.</li>';
    lista.hidden = false; input.setAttribute('aria-expanded', 'true');
    if (marcada >= 0) input.setAttribute('aria-activedescendant', `${lista.id}-${marcada}`); else input.removeAttribute('aria-activedescendant');
  };
  const tomar = i => { if (!sug[i]) return; input.value = ''; cerrar(); alElegir(sug[i]); };
  input.addEventListener('input', () => { marcada = -1; pintar(); });
  input.addEventListener('pintar', pintar);   // cuando llega el índice del país, se rehacen las sugerencias
  input.addEventListener('keydown', e => {
    if (lista.hidden) return;
    if (e.key === 'ArrowDown') { marcada = Math.min(marcada + 1, sug.length - 1); pintar(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { marcada = Math.max(marcada - 1, 0); pintar(); e.preventDefault(); }
    else if (e.key === 'Enter') { tomar(marcada >= 0 ? marcada : 0); e.preventDefault(); }
    else if (e.key === 'Escape') { cerrar(); e.stopPropagation(); }
  });
  lista.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); tomar(Number(li.dataset.i)); } });
  input.addEventListener('blur', () => setTimeout(cerrar, 150));
}

// ---------------------------------------------------------------- mi localidad
// Cambia la provincia que se mira: baja sus datos y centra el mapa
async function irAProvincia(prov) {
  if (prov === PROV) return;
  PROV = prov;
  fichaNombre = null; $('#ficha').hidden = true;
  await cargar();
  centrarMapa();
}
// f: una localidad de LOCS o del índice del país (con .prov); null = toda la provincia que se mira
async function ponerLocalidad(f) {
  if (f && f.prov && f.prov !== PROV) await irAProvincia(f.prov);
  PREF.set('localidad', f ? f.localidad : null);
  PREF.set('provincia', PROV);
  pintarTodo();
  sincronizarAvisos();
  // elegida desde el chat, se vuelve a Hoy para ver cómo está esa localidad
  if (pestana === 'cuis') location.hash = 'hoy';
}
const dlg = $('#dlg-lugar');
let modoLugar = 'mia';   // 'mia': cambia tu localidad · 'consulta': el Cuis cuenta cómo está otra, sin cambiar la tuya
function abrirElegirLugar(modo = 'mia') {
  modoLugar = modo === 'consulta' ? 'consulta' : 'mia';
  $('#t-lugar').textContent = modoLugar === 'consulta' ? '¿Qué localidad querés ver?' : '¿Dónde estás?';
  $$('#dlg-lugar [data-ubicacion], #dlg-lugar .ubicacion-estado').forEach(el => { el.hidden = modoLugar === 'consulta'; });
  $$('.ubicacion-estado').forEach(p => { p.textContent = ''; });
  $('[data-provincia]').textContent = 'Ver ' + todaLa().replace(/^T/, 't');
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  setTimeout(() => $('#buscar-lugar').focus(), 50);
  cargarIndice().then(() => $('#buscar-lugar').dispatchEvent(new Event('pintar')));
}
function cerrarElegirLugar() { if (dlg.open) dlg.close(); }
async function lugarElegido(f) {
  cerrarElegirLugar();
  if (modoLugar !== 'consulta') return ponerLocalidad(f);
  digo(f ? f.localidad : todaLa());
  const g = f && (f.dias ? f : await localidadDe(f.localidad, f.prov));
  decir(!f ? RESPUESTAS.hoy(null) : g ? RESPUESTAS.localidad(g) : 'Uy, no pude traer los datos de esa localidad. Probá de nuevo en un rato.');
}
buscador($('#buscar-lugar'), $('#sug-lugar'), lugarElegido, () => INDICE_LISTO || LOCS);
$('[data-provincia]').addEventListener('click', () => lugarElegido(null));
$$('[data-elegir-lugar]').forEach(b => b.addEventListener('click', () => abrirElegirLugar()));
// «Usar mi ubicación»: primero se pregunta a GeoRef (datos.gob.ar, de donde salen las localidades) en qué provincia y
// municipio cae el punto; si no contesta, la localidad más cercana, contando que las ciudades grandes ocupan más que
// su centro (desde muchos barrios de Córdoba capital, el centro de Saldán o de Villa Allende queda más cerca que el de
// Córdoba). Busca en el índice de todo el país.
const RADIO_KM = { 'Córdoba': 12, 'Río Cuarto': 6, 'Villa María': 5, 'Villa Carlos Paz': 4, 'San Francisco': 4 };
const nombreBase = n => sinTildes(n).replace(/ \(.*\)$/, '');
async function municipioDe(la, lo, todas) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(`https://apis.datos.gob.ar/georef/api/ubicacion?lat=${la}&lon=${lo}`, { signal: ctl.signal });
    if (!r.ok) return null;
    const u = (await r.json()).ubicacion || {};
    if (!u.provincia || !u.provincia.nombre) return null;
    const prov = corta(u.provincia.nombre), deProv = todas.filter(f => f.provNombre === prov);
    if (!u.municipio || !u.municipio.nombre) return masCercana(la, lo, deProv);
    const n = sinTildes(u.municipio.nombre), dpto = u.departamento && sinTildes(u.departamento.nombre);
    // los nombres repetidos llevan el departamento o la provincia: «Los Chañaritos (dpto. Cruz del Eje)»
    const mismas = deProv.filter(f => nombreBase(f.localidad) === n);
    return mismas.find(f => sinTildes(f.localidad) === n) || mismas.find(f => dpto && sinTildes(f.localidad).includes(`dpto. ${dpto}`)) ||
      (mismas.length ? masCercana(la, lo, mismas) : masCercana(la, lo, deProv));
  } catch (e) { return null; } finally { clearTimeout(t); }
}
function masCercana(la, lo, lista) {
  const k = Math.cos(la * Math.PI / 180);
  let mejor = null, dmin = Infinity, km = Infinity;
  for (const f of lista) {
    const d = Math.hypot(f.lat - la, (f.lon - lo) * k) * 111;
    const efectiva = Math.max(0, d - ((f.prov === 'cordoba' && RADIO_KM[f.localidad]) || 0));
    if (efectiva < dmin) { dmin = efectiva; mejor = f; km = d; }
  }
  return km > 60 ? null : mejor;
}
$$('[data-ubicacion]').forEach(b => b.addEventListener('click', () => {
  const avisar = t => $$('.ubicacion-estado').forEach(p => { p.textContent = t; });
  if (!navigator.geolocation) return avisar('Este navegador no puede darnos tu ubicación. Elegí la localidad a mano.');
  avisar('Buscando dónde estás…');
  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude: la, longitude: lo } = pos.coords;
    const indice = await cargarIndice();
    const todas = indice ? indice.todas : LOCS;
    const f = (indice && await municipioDe(la, lo, todas)) || masCercana(la, lo, todas);
    if (!f) return avisar('No encontré ninguna localidad cerca de donde estás. Elegí la localidad a mano.');
    avisar(`Te ubiqué en ${f.localidad}${f.provNombre && f.provNombre !== 'Córdoba' && !f.localidad.includes(f.provNombre) ? ` (${f.provNombre})` : ''}. Si no es tu localidad, buscala acá abajo.`);
    ponerLocalidad(f);
    setTimeout(cerrarElegirLugar, 1200);
  }, () => avisar('No pudimos usar tu ubicación. Revisá el permiso o elegí la localidad a mano.'), { enableHighAccuracy: true, timeout: 12000, maximumAge: 600000 });
}));
$$('[data-compartir]').forEach(b => b.addEventListener('click', () => compartir()));

// ---------------------------------------------------------------- pestaña Hoy
const TAREAS = {
  mascota: ['Elegí tu localidad para ver cómo viene tu zona', 'Instalá Piedrazón en el celular, desde Ajustes', 'Volvé en un rato: los datos se actualizan cada 15 minutos'],
  tranqui: ['Fijate dónde podrías guardar el auto si hace falta', 'Instalá Piedrazón en el celular, desde Ajustes', 'Compartí Piedrazón con tu familia'],
  atento: ['Si podés, dejá el auto bajo techo antes de la tarde', 'Tené a mano dónde guardar plantas y cosas del patio', 'Cargá el celular por si se corta la luz'],
  enojado: ['Guardá el auto bajo techo', 'Entrá plantas, bicis y lo que se pueda romper', 'Cargá el celular por si se corta la luz'],
  furioso: ['Quedate adentro y alejate de las ventanas', 'No te refugies bajo árboles, carteles ni cables', 'Emergencias: 103 (Defensa Civil) o 911'],
};
let heroFrases = [], heroI = 0;
$('#hero-pz').addEventListener('click', () => {
  if (heroFrases.length > 1) { heroI = (heroI + 1) % heroFrases.length; $('#hero-texto').innerHTML = heroFrases[heroI]; }
  saltar($('#hero-pz'));
});

function pintarHoy() {
  const e = estado();
  $$('.lugar-texto').forEach(s => { s.textContent = e.f ? e.f.localidad : todaLa(); });
  const d = fechaDe(hoyISO());
  $('#fecha-hoy').textContent = `${DIAS[d.getDay()][0].toUpperCase()}${DIAS[d.getDay()].slice(1)} ${d.getDate()} de ${MESES[d.getMonth()]}`;

  const hero = $('#hero');
  const cara = e.duda ? 'atento' : e.nivel;   // con alerta amarilla del SMN, cara de duda sin cambiar el color ni el nivel
  if (hero.dataset.nivel !== e.nivel || hero.dataset.cara !== cara) { $('#hero-pz').innerHTML = Piedrazon.svg(cara); hero.dataset.nivel = e.nivel; hero.dataset.cara = cara; saltar($('#hero-pz')); }
  $('#hero-etiqueta').textContent = `${Piedrazon.ETIQUETA[e.nivel] || 'Hola'} · ahora`;
  $('#hero-titulo').textContent = e.titulo;
  pintarReportar(e);
  heroFrases = [e.texto, ...Piedrazon.MENSAJES[e.nivel].filter(m => m !== e.texto)]; heroI = 0;
  $('#hero-texto').innerHTML = heroFrases[0];
  const afect = e.f ? [] : LOCS.filter(x => x.radar);
  const lugares = $('#hero-lugares');
  lugares.hidden = !afect.length;
  lugares.innerHTML = afect.slice(0, 12).map(x => `<a href="${enlace(x)}#mapa" data-ver="${esc(x.localidad)}">${esc(x.localidad)}</a>`).join('') +
    (afect.length > 12 ? `<span>y ${afect.length - 12} más</span>` : '');
  lugares.querySelectorAll('[data-ver]').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); verEnMapa(a.dataset.ver); }));

  // alertas oficiales
  const alertas = agruparSMN(e.f ? alertasDe(e.f) : (SMN ? SMN.alertas : []));
  const caja = $('#smn-hoy');
  caja.hidden = !alertas.length;
  caja.innerHTML = alertas.map(a => {
    const n = e.f || !SMN.localidades ? null : Object.values(SMN.localidades).filter(v => v.some(i => a.ids.includes(i))).length;
    return `<div class="smn-alerta n-smn-${esc(a.nivel)}"><p><span class="punto"></span><b>${a.tipo === 'aviso a corto plazo' ? 'Aviso a corto plazo' : 'Alerta'} oficial del SMN</b>: ` +
      `${esc(a.titulo)}, nivel ${esc(a.nivel)}, ${hastaSMN(a)}${n ? ` · ${plural(n, 'localidad', 'localidades')}` : ''}.</p>` +
      (a.nivel === 'amarillo' ? '<p class="nota">Es por tormentas en general, no un aviso de granizo: no cambia el nivel de Piedrazón.</p>' : '') +
      (a.instruccion ? `<details><summary>Qué recomienda el SMN</summary><p>${esc(a.instruccion)}</p></details>` : '') + '</div>';
  }).join('');

  // últimas 24 horas
  const rec = e.f ? htmlReciente(e.f) : '', cajaRec = $('#reciente-hoy');
  cajaRec.hidden = !rec;
  $('#reciente-lista').innerHTML = rec;
  $$('#reciente-lista [data-ver]').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); verEnMapa(a.dataset.ver); }));

  // próximas horas
  const i0 = indiceAhora(), horas = $('#horas'), nota = $('#horas-nota');
  if (i0 < 0) {
    horas.innerHTML = ''; nota.hidden = false; nota.textContent = 'Todavía no hay pronóstico hora por hora.';
  } else {
    const radarAhora = e.f ? !!e.f.radar : LOCS.some(x => x.radar);
    horas.innerHTML = HORAS.horas.slice(i0, i0 + 6).map((h, k) => {
      let r = riesgoHora(e.f, i0 + k);
      if (k === 0 && radarAhora) r = 2;
      const nombre = ['Bajo', 'Medio', 'Alto'][r];
      return `<div class="hora ${k === 0 ? 'actual' : ''}" role="group" aria-label="${k === 0 ? 'Ahora' : `${Number(h.slice(11, 13))} h`}: riesgo ${NIVEL[r]}">` +
        `<span class="h">${k === 0 ? 'Ahora' : `${Number(h.slice(11, 13))} h`}</span><span class="punto ${CLASE_RIESGO[NIVEL[r]]}"></span><span class="r">${nombre}</span></div>`;
    }).join('');
    nota.hidden = e.f != null;
    nota.textContent = e.f ? '' : 'Es el peor riesgo de toda la provincia en cada hora. Elegí tu localidad para ver la tuya.';
  }

  // próximos días
  $('#dias').innerHTML = PRON && PRON.dias.length ? PRON.dias.slice(0, 3).map((dia, i) => {
    const r = riesgoDia(e.f, i), hora = e.f && r && r !== 'bajo' && e.f.dias[i].hora;
    return `<div class="dia"><b>${esc(nombreDia(dia, i))}</b>${chip(r)}${hora ? `<span class="nota">cerca de las ${esc(hora)} h</span>` : ''}</div>`;
  }).join('') : '<p class="nota">Todavía no hay pronóstico.</p>';

  pintarTareas(e.nivel);

  const partes = [];
  if (AHORA && AHORA.consultado) { const m = edad(AHORA.consultado); partes.push(`Radar: hace ${m} min`); }
  if (PRON) partes.push(`pronóstico: ${esc(PRON.generado)}`);
  if (PROV !== 'cordoba') partes.push('fuera de Córdoba, Piedrazón está en prueba');
  $('#actualizado').innerHTML = partes.join(' · ');
}

function pintarTareas(nivel) {
  const lista = TAREAS[nivel] || TAREAS.mascota;
  const clave = `${hoyISO()}|${nivel}`;
  let guardado = PREF.get('tareas', null);
  if (!guardado || guardado.clave !== clave) guardado = { clave, hechas: [] };
  $('#tareas-titulo').textContent = nivel === 'tranqui' ? 'Para estar preparado' : nivel === 'mascota' ? 'Para empezar' : 'Qué hacer ahora';
  const cuenta = () => { $('#tareas-cuenta').textContent = `${guardado.hechas.length} de ${lista.length} listo`; };
  $('#tareas').innerHTML = lista.map((t, i) => `<label class="tarea"><input type="checkbox" data-i="${i}" ${guardado.hechas.includes(i) ? 'checked' : ''}> <span>${esc(t)}</span></label>`).join('');
  $$('#tareas input').forEach(c => c.addEventListener('change', () => {
    const i = Number(c.dataset.i);
    guardado.hechas = c.checked ? [...new Set([...guardado.hechas, i])] : guardado.hechas.filter(x => x !== i);
    PREF.set('tareas', guardado); cuenta();
  }));
  cuenta();
}

// «¿Está cayendo piedra?»: con alerta del radar, una tarjeta destacada; si no, un botón discreto
let pasoReporte = null;   // null · 'tamano' · 'gracias'
function pintarReportar(e) {
  const caja = $('#reportar'), f = e.f;
  caja.hidden = !f;
  if (!f) return;
  const alerta = !!f.radar, previo = PREF.get('reporte', null);
  const reciente = previo && previo.loc === f.localidad && previo.prov === f.prov && Date.now() - previo.t < 30 * 60000;
  caja.className = 'reportar' + (alerta ? ' destacado' : '');
  if (pasoReporte === 'tamano') {
    caja.innerHTML = `<p><b>¿De qué tamaño?</b></p><div class="fila-botones">${Object.entries(TAMANO).map(([k, v]) => `<button type="button" class="rapida" data-tam="${k}">${esc(v)}</button>`).join('')}` +
      '<button type="button" class="rapida" data-tam="">No sé</button></div>';
  } else if (pasoReporte === 'gracias' || reciente) {
    caja.innerHTML = `<p>${previo && previo.cae ? '¡Gracias! Tu reporte ya lo ven los vecinos' : '¡Gracias por avisar!'} <span class="nota">(${esc(horaCorta(previo ? previo.t : Date.now()))})</span></p>` +
      '<button type="button" class="enlace" data-otra-vez>Cambiar mi reporte</button>';
  } else if (alerta) {
    caja.innerHTML = `<p><b>¿Está cayendo piedra en ${esc(f.localidad)}?</b> <span class="nota">Si la ves, avisá: ayuda a los vecinos.</span></p>` +
      '<div class="fila-botones"><button type="button" class="boton-sec" data-cae="si">Sí, está cayendo</button><button type="button" class="boton-sec" data-cae="no">No</button></div>';
  } else {
    caja.innerHTML = '<button type="button" class="enlace" data-cae="si">¿Está cayendo piedra donde estás? Avisá</button>';
  }
  caja.querySelectorAll('[data-cae]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.cae === 'si') { pasoReporte = 'tamano'; pintarReportar(e); } else enviarReporte(f, false, null);
  }));
  caja.querySelectorAll('[data-tam]').forEach(b => b.addEventListener('click', () => enviarReporte(f, true, b.dataset.tam || null)));
  const otra = caja.querySelector('[data-otra-vez]');
  if (otra) otra.addEventListener('click', () => { PREF.set('reporte', null); pasoReporte = null; pintarReportar(e); });
}
async function enviarReporte(f, cae, tamano) {
  let id = PREF.get('id_reporte', null);
  if (!id) { id = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join(''); PREF.set('id_reporte', id); }
  const caja = $('#reportar');
  caja.innerHTML = '<p class="nota">Enviando…</p>';
  try {
    await alServicio('/reporte', { id, localidad: claveAviso(f.localidad, f.provNombre || 'Córdoba'), cae, tamano });
    PREF.set('reporte', { loc: f.localidad, prov: f.prov, cae, t: Date.now() });
    pasoReporte = 'gracias';
    await cargarReportes();
    pintarHoy();
  } catch (err) {
    pasoReporte = null;
    caja.innerHTML = '<p>No pudimos mandar el reporte. Revisá la conexión y probá de nuevo.</p><button type="button" class="enlace" data-otra-vez>Volver a intentar</button>';
    caja.querySelector('[data-otra-vez]').addEventListener('click', () => pintarHoy());
  }
}

// «hasta las 14:59 h» si termina hoy, «hasta el 24/10 a las 14:59 h» si no
function hastaSMN(a) {
  const [fecha, hora] = String(a.hasta_local || '').split(' ');
  if (!hora) return `hasta ${esc(a.hasta_local)}`;
  const [d, m] = fecha.split('/'), hoy = hoyISO();
  return Number(d) === Number(hoy.slice(8, 10)) && Number(m) === Number(hoy.slice(5, 7)) ? `hasta las ${esc(hora)} h` : `hasta el ${esc(fecha)} a las ${esc(hora)} h`;
}

// alertas del SMN agrupadas (una por tipo, título, nivel y hora de fin)
function agruparSMN(alertas) {
  const g = new Map();
  for (const a of alertas) {
    const k = [a.tipo, a.titulo, a.nivel, a.hasta_local].join('|');
    if (!g.has(k)) g.set(k, { ...a, ids: [] });
    g.get(k).ids.push(a.id);
  }
  return [...g.values()].sort((x, y) => (ORDEN_SMN[y.nivel] || 0) - (ORDEN_SMN[x.nivel] || 0));
}

// ---------------------------------------------------------------- pestaña Mapa
// La rueda sola sigue bajando la página; con Ctrl (o Cmd en Mac, o pellizcando el trackpad) acerca y aleja el mapa.
function zoomConCtrl(m) {
  const cont = m.getContainer();
  const aviso = L.DomUtil.create('div', 'aviso-zoom', cont);
  const textoRueda = /Mac|iPhone|iPad/.test(navigator.platform) ? 'Usá ⌘ + rueda para acercar o alejar el mapa' : 'Usá Ctrl + rueda para acercar o alejar el mapa';
  let acumulado = 0, ultimo = 0, temporizador;
  const mostrar = texto => {
    aviso.dataset.texto = texto;
    aviso.classList.add('visible');
    clearTimeout(temporizador);
    temporizador = setTimeout(() => aviso.classList.remove('visible'), 1200);
  };
  if (TACTIL) return;   // en el celular el mapa se mueve con un dedo y se acerca pellizcando
  cont.addEventListener('wheel', e => {
    if (!(e.ctrlKey || e.metaKey)) { mostrar(textoRueda); return; }
    e.preventDefault();
    aviso.classList.remove('visible');
    acumulado += e.deltaY * (e.deltaMode === 1 ? 33 : 1);
    const ahora = Date.now();
    if (Math.abs(acumulado) < 60 || ahora - ultimo < 120) return;
    const paso = acumulado < 0 ? 1 : -1;
    acumulado = 0; ultimo = ahora;
    m.setZoomAround(m.mouseEventToContainerPoint(e), m.getZoom() + paso);
  }, { passive: false });
}

let mapa = null, marcaElegida = null, capaHora = null, capaRadar = null, capaLocRadar = null, diaSel = null, horaSel = null, fichaNombre = null;
buscador($('#buscar-mapa'), $('#sug-mapa'), f => elegir(f.localidad));

function abrirMapa() {
  if (typeof L === 'undefined') {
    // sin Leaflet igual se muestran el estado del radar y el gráfico por hora
    if (!$('#mapa').childElementCount) { $('#mapa').innerHTML = '<p class="nota centro">No se pudo cargar el mapa. Revisá la conexión.</p>'; pintarMapa(); }
    return;
  }
  if (!mapa) {
    mapa = L.map('mapa', { scrollWheelZoom: false });
    centrarMapa();
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '&copy; OpenStreetMap' }).addTo(mapa);
    zoomConCtrl(mapa);
    pintarMapa();
  }
  setTimeout(() => mapa.invalidateSize(), 0);
}

function centrarMapa() {
  if (!mapa) return;
  if (PROV === 'cordoba' || !LOCS.length) return mapa.setView(CENTRO, 7);
  mapa.fitBounds(L.latLngBounds(LOCS.map(f => [f.lat, f.lon])), { padding: [20, 20], maxZoom: 10 });
}

function pintarMapa() {
  const e = AHORA ? edad(AHORA.consultado) : null;
  const afect = LOCS.filter(f => f.radar);
  $('#radar-estado').innerHTML = e == null ? 'Todavía no hay datos del radar.'
    : e > 60 ? `El último dato del radar es de hace más de una hora (${esc(AHORA.consultado)}).`
    : afect.length ? `<span class="punto n-rojo"></span><b>${afect.some(f => f.radar.nivel === 'granizo probable') ? 'Granizo probable' : 'Posible granizo'}</b> cerca de ${plural(afect.length, 'localidad', 'localidades')} · radar hace ${e} min`
    : `<span class="punto n-verde"></span>Los radares no ven granizo sobre la provincia · hace ${e} min`;
  const rec = htmlReciente(null), cajaRec = $('#reciente-mapa');
  cajaRec.hidden = !rec;
  cajaRec.innerHTML = rec;
  cajaRec.querySelectorAll('[data-ver]').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); elegir(a.dataset.ver); }));
  if (capaRadar) capaRadar.remove();
  capaRadar = mapa && AHORA && e <= 60 ? L.layerGroup(AHORA.nucleos.map(n => L.circleMarker([n.lat, n.lon], {
    radius: n.nivel ? 9 : 5, color: '#16201C', weight: 1, dashArray: '2 2', fillColor: COLOR_RADAR[n.nivel] || '#f7a600', fillOpacity: .8,
  }).bindPopup(`<b>${esc(n.nivel || 'Tormenta')}</b><br>${n.max_dbz} dBZ${n.tope_km ? `<br>Tope: ${n.tope_km} km` : ''}<br>Radar ${esc(n.radar)} (OHMC), en este momento`))) : null;
  armarGrafico();
  const i0 = Math.max(0, indiceAhora());
  if (HORAS) elegirHora(horaSel != null && horaSel >= i0 ? horaSel : i0);
  if (fichaNombre) pintarFicha(porNombre(fichaNombre));
}

function armarGrafico() {
  const caja = $('#dias-mapa');
  if (!HORAS) { caja.innerHTML = '<p class="nota">Todavía no hay pronóstico hora por hora.</p>'; return; }
  caja.innerHTML = `<div class="tira-dias" role="tablist" aria-label="Día del pronóstico">${HORAS.dias.map(d => {
      const f = fechaDe(d), alto = HORAS.horas.some((h, i) => h.startsWith(d) && HORAS.conteo[i][1]), mod = HORAS.horas.some((h, i) => h.startsWith(d) && HORAS.conteo[i][0]);
      return `<button type="button" role="tab" data-dia="${d}" aria-label="${DIAS[f.getDay()]} ${f.getDate()}"><span class="letra">${LETRA[f.getDay()]}</span><span class="num">${f.getDate()}</span>` +
        `<span class="marca-dia" style="--c:${alto ? COLOR_RIESGO.alto : mod ? COLOR_RIESGO.moderado : 'transparent'}"></span></button>`;
    }).join('')}</div>
    <div id="dia-texto" class="dia-texto"></div>
    <div class="grafico-caja"><svg id="grafico" class="grafico" viewBox="0 0 480 150" preserveAspectRatio="none" role="img"></svg>
      <div class="eje-horas"><span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>24 h</span></div></div>
    <div class="hora-elegida"><b id="hora-texto"></b> <span id="hora-resumen" class="nota"></span></div>`;
  caja.querySelectorAll('[data-dia]').forEach(b => b.addEventListener('click', () => elegirDia(b.dataset.dia)));
  const svg = $('#grafico');
  const tomar = ev => {
    const r = svg.getBoundingClientRect(), x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
    const hora = Math.max(0, Math.min(23, Math.floor(x / r.width * 24)));
    const i = HORAS.horas.indexOf(`${diaSel} ${String(hora).padStart(2, '0')}`);
    if (i >= 0) elegirHora(i);
  };
  let arrastrando = false;
  svg.addEventListener('pointerdown', ev => { arrastrando = true; svg.setPointerCapture(ev.pointerId); tomar(ev); });
  svg.addEventListener('pointermove', ev => { if (arrastrando) tomar(ev); });
  svg.addEventListener('pointerup', () => { arrastrando = false; });
}

function elegirDia(d) {
  const primera = HORAS.horas.findIndex(h => h.startsWith(d));
  // al cambiar de día se mantiene la hora si existe; si no, la primera del día
  const misma = horaSel != null ? HORAS.horas.indexOf(`${d} ${HORAS.horas[horaSel].slice(11, 13)}`) : -1;
  elegirHora(misma >= 0 ? misma : primera);
}

function elegirHora(i) {
  horaSel = i;
  const h = HORAS.horas[i], d = h.slice(0, 10), f = fechaDe(d);
  diaSel = d;
  $$('.tira-dias [data-dia]').forEach(b => b.setAttribute('aria-selected', b.dataset.dia === d));
  const lejos = HORAS.dias.indexOf(d) >= 3;
  $('#dia-texto').innerHTML = `${esc(DIAS[f.getDay()][0].toUpperCase() + DIAS[f.getDay()].slice(1))}, ${f.getDate()} de ${MESES[f.getMonth()]}` +
    (lejos ? ' <span class="nota">(más de 3 días: solo una tendencia)</span>' : '');
  dibujarGrafico();
  if (!mapa) return;
  if (capaHora) capaHora.remove();
  const con = LOCS.map(x => [x, Number((HORAS.localidades[x.localidad] || '')[i] || 0)]).filter(([, r]) => r > 0);
  capaHora = L.layerGroup(con.map(([x, r]) => L.circleMarker([x.lat, x.lon], { radius: r === 2 ? 8 : 6, color: '#fff', weight: 1.5,
    fillColor: COLOR_RIESGO[NIVEL[r]], fillOpacity: .9 }).bindPopup(`<b>${esc(x.localidad)}</b> ${chip(NIVEL[r])}<br>${esc(h.slice(11, 13))} h`)
    .on('click', () => pintarFicha(x)))).addTo(mapa);
  const esAhora = i === indiceAhora();
  if (capaRadar) esAhora ? capaRadar.addTo(mapa) : capaRadar.remove();
  // En la hora actual también se marcan las localidades con granizo que ve el radar (el pronóstico puede no tenerlas)
  if (capaLocRadar) capaLocRadar.remove();
  capaLocRadar = null;
  if (esAhora) {
    capaLocRadar = L.layerGroup(LOCS.filter(x => x.radar).map(x => L.circleMarker([x.lat, x.lon], { radius: 10, color: COLOR_RADAR[x.radar.nivel],
      weight: 4, fillColor: '#fff', fillOpacity: .9 }).bindPopup(`<b>${esc(x.localidad)}</b><br>En este momento: ${esc(x.radar.nivel)} a ${km1(x.radar.km)} km ` +
      `(${x.radar.max_dbz} dBZ${x.radar.tope_km ? `, tope ${km1(x.radar.tope_km)} km` : ''}), según el radar`).bindTooltip(esc(x.localidad), { direction: 'top', offset: [0, -8] })
      .on('click', () => pintarFicha(x)))).addTo(mapa);
  }
  const [m, a] = HORAS.conteo[i];
  $('#hora-texto').textContent = `${h.slice(11, 13)} h${esAhora ? ' (ahora)' : ''}`;
  $('#hora-resumen').textContent = (m + a ? `riesgo alto en ${a}, moderado en ${plural(m, 'localidad', 'localidades')}` : 'sin condiciones para granizo') +
    (esAhora && LOCS.some(x => x.radar) ? ` · radar ahora: ${plural(LOCS.filter(x => x.radar).length, 'localidad', 'localidades')} con posible granizo (círculo con borde)` : '');
}

function dibujarGrafico() {
  const svg = $('#grafico');
  const idx = HORAS.horas.map((h, i) => [h, i]).filter(([h]) => h.startsWith(diaSel));
  const max = Math.max(5, ...HORAS.conteo.map(([m, a]) => m + a));
  const W = 480, H = 150, bw = W / 24, alto = v => v / max * (H - 10);
  let barras = '';
  for (let hora = 0; hora < 24; hora++) {
    const par = idx.find(([h]) => Number(h.slice(11, 13)) === hora);
    const x = hora * bw + 2, w = bw - 4;
    barras += `<rect x="${x}" y="${H - 2}" width="${w}" height="2" fill="var(--borde)"/>`;
    if (!par) continue;
    const [m, a] = HORAS.conteo[par[1]];
    const ha = alto(a), hm = alto(m);
    barras += (m ? `<rect x="${x}" y="${H - ha - hm}" width="${w}" height="${hm}" rx="2" fill="${COLOR_RIESGO.moderado}"/>` : '') +
      (a ? `<rect x="${x}" y="${H - ha}" width="${w}" height="${ha}" rx="2" fill="${COLOR_RIESGO.alto}"/>` : '');
    if (par[1] === horaSel) barras += `<rect x="${hora * bw}" y="0" width="${bw}" height="${H}" fill="var(--acento)" opacity=".18"/>` +
      `<line x1="${hora * bw + bw / 2}" x2="${hora * bw + bw / 2}" y1="0" y2="${H}" stroke="var(--acento)" stroke-width="2"/>`;
  }
  for (const g of [6, 12, 18]) barras += `<line x1="${g * bw}" x2="${g * bw}" y1="0" y2="${H}" stroke="var(--borde)" stroke-dasharray="3 3"/>`;
  svg.innerHTML = barras;
  svg.setAttribute('aria-label', `Localidades con condiciones para granizo hora por hora, ${diaSel}`);
}

function elegir(nombre) {
  const f = porNombre(nombre);
  if (!f) return;
  if (mapa) mapa.setView([f.lat, f.lon], 10);
  pintarFicha(f);
  $('#mapa').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function verEnMapa(nombre) { location.hash = 'mapa'; setTimeout(() => elegir(nombre), 60); }

function pintarFicha(f) {
  if (!f) return;
  fichaNombre = f.localidad;
  if (mapa) {
    if (marcaElegida) marcaElegida.remove();
    marcaElegida = L.circleMarker([f.lat, f.lon], { radius: 14, color: '#1E6FA8', weight: 3, fill: false })
      .bindTooltip(esc(f.localidad), { permanent: true, direction: 'top', offset: [0, -12] }).addTo(mapa);
  }
  const caja = $('#ficha');
  const dias = (f.dias || []).slice(0, 3).map((d, i) => `<li><b>${esc(nombreDia(d.fecha, i))}</b> ${chip(d.riesgo)}${d.riesgo !== 'bajo' && d.hora ? ` <span class="nota">peor momento cerca de las ${esc(d.hora)} h</span>` : ''}` +
    `<span class="tecnico nota">Energía para tormentas ${d.cape ?? '–'} J/kg · inestabilidad ${d.li ?? '–'} · viento en altura ${d.cizalladura ?? '–'} m/s · 0 °C a ${d.isoterma0_m ?? '–'} m · lluvia ${d.prob_lluvia ?? '–'} %</span></li>`).join('');
  const mia = esMia(f);
  caja.hidden = false;
  caja.innerHTML = `<h2>${esc(f.localidad)}</h2>
    <div class="pz-ficha"></div>
    ${agruparSMN(alertasDe(f)).map(a => `<div class="smn-alerta n-smn-${esc(a.nivel)}"><p><span class="punto"></span><b>Alerta oficial del SMN</b>: ${esc(a.titulo)}, nivel ${esc(a.nivel)}, ${hastaSMN(a)}.</p>` +
      (a.instruccion ? `<details><summary>Qué recomienda el SMN</summary><p>${esc(a.instruccion)}</p></details>` : '') + '</div>').join('')}
    ${confirmaciones(f).length ? `<p class="confirmado">${textoConfirmaciones(f, confirmaciones(f))}</p>` : ''}
    <p>${f.radar ? `<span class="lluvia-fuerte">En este momento: ${esc(f.radar.nivel)} a ${km1(f.radar.km)} km</span><span class="tecnico nota"> (${f.radar.max_dbz} dBZ${f.radar.tope_km ? `, tope ${km1(f.radar.tope_km)} km` : ''})</span>.` : '<b>En este momento</b>: el radar no ve granizo cerca.'}</p>
    ${f.reciente && f.reciente.length ? `<div><b>Últimas 24 horas</b>${htmlReciente(f)}</div>` : ''}
    <div><b>Próximos 3 días</b>${dias ? `<ul class="lista-dias">${dias}</ul>` : ' sin pronóstico por ahora.'}</div>
    <div class="fila-botones">
      <button type="button" class="boton-sec" data-mia ${mia ? 'disabled' : ''}>${mia ? 'Es tu localidad' : 'Hacerla mi localidad'}</button>
      <button type="button" class="boton-sec" data-compartir-ficha>Compartir</button>
    </div>`;
  { const e = estado(f); Piedrazon.crear(caja.querySelector('.pz-ficha'), { chico: true }).poner(e.nivel, e.texto); }
  caja.querySelector('[data-mia]').addEventListener('click', () => ponerLocalidad(f));
  caja.querySelector('[data-compartir-ficha]').addEventListener('click', () => compartir(f));
}

// ---------------------------------------------------------------- pestaña El Cuis
// Un chat con preguntas en botones: el Cuis contesta con los mismos datos que el resto de la app. Para otra localidad
// se elige con el mismo buscador que en el resto de la app, así nunca hay preguntas que no entienda.
const PREGUNTAS = [
  { id: 'hoy', boton: '¿Cae piedra hoy?' },
  { id: 'cuando', boton: '¿Cuándo es lo peor?' },
  { id: 'auto', boton: '¿Guardo el auto?' },
  { id: 'empieza', boton: '¿Qué hago si empieza?' },
  { id: 'otra', boton: '¿Y en otra localidad?' },
  { id: 'oficial', boton: '¿Esto es oficial?' },
  { id: 'datos', boton: '¿Cómo sabés?' },
  { id: 'lugar', boton: 'Cambiar mi localidad' },
];
let chatIniciado = false, colaChat = Promise.resolve();

function avatarCuis(nivel) { return `<span class="avatar chico">${Cuis.svg(nivel)}</span>`; }
function decir(html, { demora = 500 } = {}) {
  colaChat = colaChat.then(() => new Promise(fin => {
    const lista = $('#chat-lista');
    const li = document.createElement('li');
    li.className = 'msg cuis escribiendo';
    li.innerHTML = `${avatarCuis(estado().nivel)}<div class="globo" aria-label="El Cuis está escribiendo"><span></span><span></span><span></span></div>`;
    lista.append(li); li.scrollIntoView({ block: 'end', behavior: 'smooth' });
    setTimeout(() => {
      li.classList.remove('escribiendo');
      li.querySelector('.globo').removeAttribute('aria-label');
      li.querySelector('.globo').innerHTML = html;
      li.querySelectorAll('[data-ver]').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); verEnMapa(a.dataset.ver); }));
      li.querySelectorAll('[data-mia-chat]').forEach(b => b.addEventListener('click', () => { ponerLocalidad({ localidad: b.dataset.miaChat, prov: b.dataset.prov }); b.disabled = true; b.textContent = 'Listo, es tu localidad'; }));
      li.querySelectorAll('[data-elegir-lugar]').forEach(b => b.addEventListener('click', () => abrirElegirLugar()));
      $('#chat-rapidas').scrollIntoView({ block: 'end', behavior: 'smooth' });
      fin();
    }, demora);
  }));
}
function digo(texto) {
  const li = document.createElement('li');
  li.className = 'msg yo';
  li.innerHTML = `<div class="globo">${esc(texto)}</div>`;
  $('#chat-lista').append(li);
  li.scrollIntoView({ block: 'end', behavior: 'smooth' });
}

function tarjetaEstado(f) {
  const e = estado(f);
  const otra = e.f && e.f.prov !== PROV;   // de otra provincia: el mapa muestra la que se está mirando
  return `<div class="mini-tarjeta"><b>${esc(e.titulo)}</b><span>${e.f ? esc(conProv(e.f)) : esc(todaLa())}</span>` +
    (otra ? '' : e.f ? `<a href="${enlace(e.f)}#mapa" data-ver="${esc(e.f.localidad)}">Ver en el mapa →</a>` : '<a href="#mapa">Ver el mapa →</a>') + '</div>';
}

const RESPUESTAS = {
  hoy(f) {
    const e = estado(f);
    const dias = PRON ? PRON.dias.slice(0, 3).map((d, i) => `${nombreDia(d, i).toLowerCase()} ${riesgoDia(e.f, i) || 'sin dato'}`).join(', ') : '';
    const smn = agruparSMN(e.f ? alertasDe(e.f) : (SMN ? SMN.alertas : []))[0];
    const aclaracion = smn ? `<br><br>Ojo: la alerta ${({ amarillo: 'amarilla', naranja: 'naranja', rojo: 'roja' })[smn.nivel] || esc(smn.nivel)} es del SMN, por ${esc(String(smn.titulo || 'tormentas').toLowerCase())} en general, ${hastaSMN(smn)}. No quiere decir que vaya a caer granizo.` : '';
    const ep = e.f && pasados(e.f)[0];
    const antes = ep && !e.f.radar ? `<br><br>Ahora no, pero ${cuandoEpisodio(ep)} el radar vio ${esc(ep.peor.nivel)} a ${km1(ep.peor.km)} km.` : '';
    return `${e.texto}${antes}${aclaracion}${dias ? `<br><br>Riesgo de granizo para los próximos días: ${esc(dias)}.` : ''}${tarjetaEstado(e.f)}`;
  },
  cuando(f) {
    const e = estado(f);
    const pre = e.f && e.f.radar ? `Ahora mismo el radar ve una tormenta fuerte a ${km1(e.f.radar.km)} km. ` : '';
    if (!HORAS) return `${pre}Todavía no tengo el pronóstico hora por hora.`;
    const ts = tramos(e.f).slice(0, 3);
    if (!ts.length) return `${pre}En ${esc(e.lugar)} no veo horas con condiciones para granizo en los próximos tres días. Igual miro el radar cada 15 minutos.`;
    return `${pre}En ${esc(e.lugar)}, las horas con condiciones para granizo son: ${ts.map(textoTramo).join('; ')}.` +
      (e.f ? '' : '<br><br>Es para toda la provincia. Elegí tu localidad y te digo la tuya.');
  },
  auto(f) {
    const n = estado(f).nivel;
    if (n === 'furioso') return 'Si ya está cayendo, <b>no salgas a taparlo</b>: una piedra grande lastima. Si todavía no empezó y lo tenés a mano, metelo bajo techo.';
    if (n === 'enojado') return 'Sí, guardalo ya si podés. Si no tenés cochera, una manta gruesa o cartón sobre el techo y los vidrios ayuda bastante. Evitá dejarlo bajo árboles.';
    if (n === 'atento') return 'Por las dudas, sí: si podés, dejalo bajo techo antes de la tarde, que es cuando suelen armarse las tormentas.';
    return 'Por ahora no hace falta. Si cambia, lo vas a ver en la pantalla de Hoy.';
  },
  empieza() {
    return 'Si empieza a caer piedra:<ul><li>Quedate adentro y alejate de las ventanas.</li><li>Si estás en la calle, metete en un edificio o en el auto, nunca debajo de árboles, carteles ni cables.</li>' +
      '<li>No salgas a tapar el auto ni a juntar cosas.</li><li>Si hay una emergencia: <b>103</b> (Defensa Civil) o <b>911</b>.</li></ul>';
  },
  oficial() {
    const n = SMN ? fuertes(SMN.alertas).length : 0;
    return 'No, Piedrazón es un monitor experimental hecho por vecinos, sin fines comerciales. Mira los radares del OHMC y los modelos de pronóstico, pero <b>no reemplaza los avisos del SMN ni de Defensa Civil</b>.' +
      (n ? `<br><br>Ahora mismo el SMN tiene ${plural(n, 'alerta naranja o roja', 'alertas naranjas o rojas')} para la zona: las ves en la pantalla de Hoy.` : '<br><br>Ahora mismo el SMN no tiene alertas naranjas ni rojas para la provincia.');
  },
  datos() {
    const m = AHORA ? edad(AHORA.consultado) : null;
    return (PROV === 'cordoba'
      ? 'Miro tres cosas: los <b>radares del OHMC</b> (Córdoba, Alejandro Roca y Villa Reynolds) cada 15 minutos, los <b>modelos de pronóstico</b> de Open-Meteo cada 6 horas y las <b>alertas del SMN</b>.'
      : 'Miro tres cosas: los <b>radares de la red nacional</b> que publica el OHMC cada 15 minutos, los <b>modelos de pronóstico</b> de Open-Meteo dos veces por día y las <b>alertas del SMN</b>. Fuera de Córdoba estoy en prueba.') +
      (m != null ? ` El último dato del radar es de hace ${m} min.` : '') + ' En Ajustes tenés cómo se calcula cada nivel.';
  },
  localidad(f) {
    return `${RESPUESTAS.hoy(f)}${esMia(f) ? '' : `<button type="button" class="boton-sec" data-mia-chat="${esc(f.localidad)}" data-prov="${esc(f.prov)}">Hacerla mi localidad</button>`}`;
  },
};

function responder(id, f) {
  if (id === 'otra') return abrirElegirLugar('consulta');
  if (id === 'lugar') return abrirElegirLugar('mia');
  decir(RESPUESTAS[id](f));
}

function pintarRapidas() {
  $('#chat-rapidas').innerHTML = PREGUNTAS.map(p => `<button type="button" class="rapida" data-q="${p.id}">${esc(p.boton)}</button>`).join('');
  $$('#chat-rapidas [data-q]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.q !== 'otra' && b.dataset.q !== 'lugar') digo(b.textContent);
    responder(b.dataset.q);
  }));
}
function pintarCabeceraCuis() {
  const e = estado();
  $('#cuis-avatar').innerHTML = Cuis.svg(e.nivel, 'El Cuis');
}
function abrirCuis() {
  pintarCabeceraCuis();
  if (chatIniciado) return;
  chatIniciado = true;
  pintarRapidas();
  decir('¡Hola! Soy el Cuis, el compañero de Piedrazón. Vivo en las sierras y los pastizales de Córdoba, así que de tormentas sé un poco.', { demora: 300 });
  decir(RESPUESTAS.hoy());
  if (!miLocalidad()) decir('Elegí tu localidad y te cuento cómo viene ahí. <button type="button" class="boton-sec" data-elegir-lugar>Elegir mi localidad</button>');
  decir('Tocá una pregunta de abajo y te contesto.', { demora: 300 });
}

// ---------------------------------------------------------------- pestaña Ajustes
function pintarAjustes() {
  $('#aj-letra').checked = PREF.get('letra', false);
  const tema = PREF.get('tema', 'auto');
  $$('#aj-tema input').forEach(r => { r.checked = r.value === tema; });
  const umbral = PREF.get('umbral', 'enojado');
  $$('#aj-umbral input').forEach(r => { r.checked = r.value === umbral; });
  pintarAvisos();
  if (AHORA && AHORA.consultado) $('#act-radar').textContent = `Último dato: ${AHORA.consultado}.`;
  if (PRON) $('#act-pronostico').textContent = `Último pronóstico: ${PRON.generado}.`;
}
$('#aj-letra').addEventListener('change', ev => { PREF.set('letra', ev.target.checked); aplicarApariencia(); });
$$('#aj-tema input').forEach(r => r.addEventListener('change', () => { PREF.set('tema', r.value); aplicarApariencia(); }));
$$('#aj-umbral input').forEach(r => r.addEventListener('change', () => { PREF.set('umbral', r.value); pintarAjustes(); sincronizarAvisos(); }));

// ---------------------------------------------------------------- avisos al celular (web push)
const enIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const instalada = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// La suscripción del navegador se guarda en el servicio de worker/avisos.js (repo del código). Cada 15 minutos,
// scripts/notificar.py manda el aviso a las localidades que subieron de nivel, aunque la app esté cerrada.
const AVISOS = {
  url: 'https://piedrazon-avisos.predinun.workers.dev',   // dirección del servicio de avisos; vacía = el bloque no se muestra
  clave: 'BBM77Qa6Tgc4JkqqKM4pPobW34_W4_DwOrYRXpxnI3ZTu12EQDAic8ETYQoSHoEne89qZFc-2pxLSkzptzSTcdU',   // clave pública VAPID (la privada está en los secretos de GitHub)
};
const avisosPosibles = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const bytesDeClave = b64 => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b64.length % 4) % 4)), c => c.charCodeAt(0));
async function alServicio(ruta, cuerpo) {
  const r = await fetch(AVISOS.url.replace(/\/$/, '') + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  if (!r.ok) throw new Error(`servicio: HTTP ${r.status}`);
}
async function activarAvisos() {
  const f = miLocalidad();
  if (!f) throw new Error('sin-localidad');
  if (await Notification.requestPermission() !== 'granted') throw new Error('permiso');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesDeClave(AVISOS.clave) });
  const umbral = PREF.get('umbral', 'enojado');
  const clave = claveAviso(f.localidad, PROV_NOMBRE);
  const b = miBarrio();
  await alServicio('/suscribir', { subscription: sub.toJSON(), localidad: clave, umbral, ...(b ? { punto: { lat: b.lat, lon: b.lon, nombre: b.nombre } } : {}) });
  PREF.set('push', { localidad: clave, nombre: f.localidad, umbral, barrio: b ? marcaBarrio(b) : null });
}
async function apagarAvisos() {
  PREF.set('push', null);
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  try { await alServicio('/desuscribir', { endpoint: sub.endpoint }); } catch (e) { /* sin conexión: el servicio la borra cuando venza */ }
  await sub.unsubscribe();
}
// Con los avisos prendidos, si cambió la localidad, el nivel o se perdió la suscripción, se vuelve a mandar
async function sincronizarAvisos() {
  const p = PREF.get('push', null);
  if (!p || !AVISOS.url || !avisosPosibles()) return;
  if (Notification.permission !== 'granted') { PREF.set('push', null); return pintarAjustes(); }
  if (PREF.get('provincia', 'cordoba') !== PROV) return;   // se está mirando otra provincia: no se toca
  const f = miLocalidad();
  if (!f) { await apagarAvisos(); return pintarAjustes(); }
  const reg = await navigator.serviceWorker.ready;
  const b = miBarrio();
  if (p.localidad === claveAviso(f.localidad, PROV_NOMBRE) && p.umbral === PREF.get('umbral', 'enojado') && (p.barrio || null) === (b ? marcaBarrio(b) : null)
      && await reg.pushManager.getSubscription()) return;
  try { await activarAvisos(); } catch (e) { /* se reintenta en la próxima apertura */ }
  pintarAjustes();
}
// ---- barrio (opcional): en ciudades grandes, el radar se mide desde el barrio y no desde el centro de la localidad.
// Se guarda redondeado a 0,01° (~1 km). Los barrios son los lugares (place=neighbourhood, suburb o quarter) de
// OpenStreetMap a menos de BARRIO_MAX_KM del centro de la localidad: los mismos nombres que se ven en el mapa. Se bajan
// una vez por localidad desde Overpass y se filtran acá mientras se escribe.
const BARRIO_MAX_KM = 25;   // igual que MARGEN_KM de scripts/notificar.py
const redondo = x => Math.round(x * 100) / 100;
const marcaBarrio = b => `${b.lat},${b.lon},${b.nombre}`;
function miBarrio() {
  const b = PREF.get('barrio', null), f = miLocalidad();
  return b && f && b.localidad === claveAviso(f.localidad, PROV_NOMBRE) ? b : null;
}
const kmEntre = (la1, lo1, la2, lo2) => Math.hypot(la1 - la2, (lo1 - lo2) * Math.cos(la1 * Math.PI / 180)) * 111.3;
let BARRIOS = null;   // { localidad, lista: Promise<[{ nombre, lat, lon }]> }
function barriosDe(f) {
  const clave = claveAviso(f.localidad, f.provNombre || PROV_NOMBRE);
  if (BARRIOS && BARRIOS.localidad === clave) return BARRIOS.lista;
  const d = 0.25, caja = [f.lat - d, f.lon - d, f.lat + d, f.lon + d].map(x => x.toFixed(4)).join(',');
  const consulta = `[out:json][timeout:25];nwr[place~"^(neighbourhood|suburb|quarter)$"][name](${caja});out center tags;`;
  const lista = (async () => {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
    try {
      const r = await fetch('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(consulta), { signal: ctl.signal });
      if (!r.ok) throw new Error(`overpass: HTTP ${r.status}`);
      const vistos = new Set(), salida = [];
      for (const e of (await r.json()).elements || []) {
        const la = e.lat ?? (e.center && e.center.lat), lo = e.lon ?? (e.center && e.center.lon), nombre = (e.tags.name || '').trim();
        if (la == null || !nombre || sinTildes(nombre) === sinTildes(f.localidad) || vistos.has(sinTildes(nombre))) continue;
        if (kmEntre(f.lat, f.lon, la, lo) > BARRIO_MAX_KM) continue;
        vistos.add(sinTildes(nombre));
        salida.push({ nombre, lat: la, lon: lo });
      }
      return salida.sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
    } catch (e) { BARRIOS = null; return null; } finally { clearTimeout(t); }
  })();
  BARRIOS = { localidad: clave, lista };
  return lista;
}
function guardarBarrio(nombre, la, lo) {
  const f = miLocalidad();
  if (!f) return 'Primero elegí tu localidad, acá arriba.';
  if (kmEntre(f.lat, f.lon, la, lo) > BARRIO_MAX_KM) return `Ese punto queda lejos de ${f.localidad}. Si te mudaste, cambiá primero la localidad.`;
  PREF.set('barrio', { localidad: claveAviso(f.localidad, PROV_NOMBRE), nombre, lat: redondo(la), lon: redondo(lo) });
  pintarAjustes();
  sincronizarAvisos();
  return null;
}
function pintarBarrio() {
  const f = miLocalidad(), b = miBarrio(), estado = $('#barrio-estado');
  $('#aj-barrio').hidden = !f;
  if (!f) return;
  $('#btn-barrio-quitar').hidden = !b;
  estado.textContent = b ? `Avisamos por ${b.nombre}: el radar se mide desde ahí.`
    : `Ahora el radar se mide desde el centro de ${f.localidad}. En una ciudad grande, elegí tu barrio para que el aviso sea por tu zona.`;
}
let barrioSug = [];
async function pintarSugBarrio() {
  const f = miLocalidad(), lista = $('#sug-barrio'), q = sinTildes($('#buscar-barrio').value.trim());
  if (!f || q.length < 2) { lista.hidden = true; return; }
  lista.hidden = false;
  if (!BARRIOS) lista.innerHTML = '<li class="vacio">Buscando los barrios…</li>';
  const todos = await barriosDe(f);
  if (sinTildes($('#buscar-barrio').value.trim()) !== q) return;   // se siguió escribiendo
  if (!todos) { lista.innerHTML = '<li class="vacio">No pude traer los barrios ahora. Probá de nuevo en un rato o usá tu ubicación.</li>'; return; }
  const rango = x => { const n = sinTildes(x.nombre); return n.startsWith(q) ? 0 : (' ' + n).includes(' ' + q) ? 1 : 2; };
  barrioSug = todos.filter(x => sinTildes(x.nombre).includes(q)).sort((x, y) => rango(x) - rango(y)).slice(0, 8);
  lista.innerHTML = barrioSug.length
    ? barrioSug.map((x, i) => `<li role="option" data-i="${i}"><span>${esc(x.nombre)}</span></li>`).join('')
    : `<li class="vacio">No encontré «${esc($('#buscar-barrio').value.trim())}» entre los barrios de ${esc(f.localidad)}. Probá con otra parte del nombre o usá tu ubicación.</li>`;
}
$('#buscar-barrio').addEventListener('input', pintarSugBarrio);
$('#buscar-barrio').addEventListener('focus', () => { const f = miLocalidad(); if (f) barriosDe(f); });   // se bajan mientras se escribe
$('#form-barrio').addEventListener('submit', ev => { ev.preventDefault(); if (barrioSug[0] && !$('#sug-barrio').hidden) elegirBarrio(barrioSug[0]); else pintarSugBarrio(); });
function elegirBarrio(x) {
  $('#sug-barrio').hidden = true; $('#buscar-barrio').value = ''; $('#buscar-barrio').blur();
  const error = guardarBarrio(x.nombre, x.lat, x.lon);
  if (error) $('#barrio-estado').textContent = error;
}
$('#sug-barrio').addEventListener('click', ev => { const li = ev.target.closest('li[data-i]'); if (li) elegirBarrio(barrioSug[Number(li.dataset.i)]); });
$('#btn-barrio-ubicacion').addEventListener('click', () => {
  const estado = $('#barrio-estado'), f = miLocalidad();
  if (!f) return;
  if (!navigator.geolocation) { estado.textContent = 'Este navegador no puede darnos tu ubicación. Buscá tu barrio por nombre.'; return; }
  estado.textContent = 'Buscando dónde estás…';
  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude: la, longitude: lo } = pos.coords;
    // el nombre: el barrio de OpenStreetMap más cercano (a menos de 3 km); si no hay, «tu zona»
    const todos = (await barriosDe(f)) || [];
    let cerca = null, dmin = 3;
    for (const x of todos) { const d = kmEntre(la, lo, x.lat, x.lon); if (d < dmin) { dmin = d; cerca = x; } }
    const error = guardarBarrio(cerca ? cerca.nombre : 'tu zona', la, lo);
    if (error) estado.textContent = error;
  }, () => { estado.textContent = 'No pudimos usar tu ubicación. Revisá el permiso o buscá tu barrio por nombre.'; },
  { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
});
$('#btn-barrio-quitar').addEventListener('click', () => { PREF.set('barrio', null); pintarAjustes(); sincronizarAvisos(); });

function pintarAvisos() {
  const grupo = $('#aj-avisos-grupo'), interruptor = $('#aj-avisos'), texto = $('#avisos-estado');
  grupo.hidden = !AVISOS.url;
  if (!AVISOS.url) return;
  pintarBarrio();
  const p = PREF.get('push', null), permiso = 'Notification' in window ? Notification.permission : 'no';
  interruptor.checked = !!p && permiso === 'granted';
  interruptor.disabled = false;
  if (enIOS && !instalada()) {
    interruptor.disabled = true;
    texto.textContent = 'En iPhone los avisos llegan solo con Piedrazón instalado: abajo, en «Instalar en el celular», está cómo. Después abrila desde el ícono y activalos acá.';
  } else if (!avisosPosibles()) {
    interruptor.disabled = true;
    texto.textContent = 'Este navegador no permite avisos. Probá con Chrome o con Piedrazón instalado.';
  } else if (permiso === 'denied') {
    texto.textContent = 'Bloqueaste los avisos para este sitio. Podés habilitarlos desde los ajustes del navegador.';
  } else if (interruptor.checked) {
    const donde = miBarrio() ? `${miBarrio().nombre} (${p.nombre || p.localidad})` : (p.nombre || p.localidad);
    texto.textContent = `Listo: te avisamos cuando ${donde} llegue a «${Piedrazon.ETIQUETA[p.umbral]}» o más, aunque tengas la app cerrada.`;
  } else {
    texto.textContent = miLocalidad() ? `Te avisamos solo por ${miLocalidad().localidad}, una vez por nivel y por día.` : 'Primero elegí tu localidad, acá arriba.';
  }
}
$('#aj-avisos').addEventListener('change', async ev => {
  const t = ev.target, prender = t.checked;
  t.disabled = true;
  $('#avisos-estado').textContent = prender ? 'Activando…' : 'Apagando…';
  let error = null;
  try { if (prender) await activarAvisos(); else await apagarAvisos(); } catch (e) { error = e.message; }
  pintarAjustes();
  if (!error) return;
  $('#aj-avisos').checked = false;
  $('#avisos-estado').textContent = error === 'sin-localidad' ? 'Primero elegí tu localidad, acá arriba.'
    : error === 'permiso' ? 'Sin permiso no podemos avisarte. Si lo bloqueaste, habilitalo desde los ajustes del navegador.'
    : 'No pudimos activar los avisos. Probá de nuevo en un rato.';
  if (error === 'sin-localidad') abrirElegirLugar();
});

// Instalar la app
let pedidoInstalar = null;
function pintarInstalar() {
  const texto = $('#instalar-texto'), boton = $('#btn-instalar');
  if (instalada()) { texto.textContent = 'Ya la tenés instalada. ¡Bien ahí!'; boton.hidden = true; return; }
  if (pedidoInstalar) { texto.textContent = 'Queda como una app más, con su ícono, y abre aunque no tengas buena señal.'; boton.hidden = false; return; }
  texto.textContent = enIOS ? 'En iPhone: tocá el botón Compartir de Safari y después «Agregar a inicio».'
    : 'Desde el menú del navegador, elegí «Instalar app» o «Agregar a la pantalla de inicio».';
  boton.hidden = true;
}
window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); pedidoInstalar = ev; pintarInstalar(); });
window.addEventListener('appinstalled', () => { pedidoInstalar = null; pintarInstalar(); });
$('#btn-instalar').addEventListener('click', async () => {
  if (!pedidoInstalar) return;
  pedidoInstalar.prompt();
  await pedidoInstalar.userChoice;
  pedidoInstalar = null; pintarInstalar();
});

// ---------------------------------------------------------------- pestañas
const PESTANAS = ['hoy', 'mapa', 'cuis', 'ajustes'];
const TITULO_PAGINA = { hoy: 'Piedrazón · ¿Cae piedra hoy?', mapa: 'Mapa · Piedrazón', cuis: 'El Cuis · Piedrazón', ajustes: 'Ajustes · Piedrazón' };
let pestana = null;
function irA(p, { foco = true } = {}) {
  if (!PESTANAS.includes(p)) p = 'hoy';
  const cambio = p !== pestana;
  pestana = p;
  PESTANAS.forEach(x => { $('#p-' + x).hidden = x !== p; });
  $$('.nav [data-pestana]').forEach(a => { if (a.dataset.pestana === p) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  document.body.dataset.pestana = p;
  document.title = TITULO_PAGINA[p];
  if (p === 'mapa') abrirMapa();
  if (p === 'cuis') abrirCuis();
  if (p === 'ajustes') { pintarAjustes(); pintarInstalar(); }
  if (cambio) {
    if (p !== 'cuis') window.scrollTo(0, 0);
    if (foco) $(`#t-${p}`).focus({ preventScroll: true });
  }
}
window.addEventListener('hashchange', () => irA(location.hash.slice(1)));

function pintarTodo() {
  pintarHoy();
  if (mapa || $('#dias-mapa').childElementCount) pintarMapa();
  if (chatIniciado || pestana === 'cuis') pintarCabeceraCuis();
  if (pestana === 'ajustes') pintarAjustes();
}

// Recarga los datos cada 15 minutos mientras la app está abierta, y al volver a ella si pasaron más de 5
async function recargar() {
  await cargar();
  pintarTodo();
}
setInterval(recargar, 15 * 60 * 1000);
setInterval(async () => {
  if (document.visibilityState !== 'visible' || !LOCS.some(x => x.radar)) return;
  await cargarReportes(); pintarTodo();
}, 3 * 60 * 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  avisosLeidos();
  if (Date.now() - CARGADO > 5 * 60 * 1000) recargar();
});

// Al abrir la app, los avisos que llegaron se dan por leídos: se sacan de la lista y del número rojo del ícono
async function avisosLeidos() {
  try {
    if (navigator.clearAppBadge) await navigator.clearAppBadge();
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg) (await reg.getNotifications()).forEach(n => n.close());
  } catch (e) { /* el sistema no lo permite */ }
}

// ---------------------------------------------------------------- arranque
(async () => {
  const param = new URLSearchParams(location.search);
  // un enlace (o un aviso) de otra provincia la muestra, sin cambiar tu localidad
  if (/^[a-z-]+$/.test(param.get('provincia') || '')) PROV = param.get('provincia');
  else if (param.get('localidad')) PROV = 'cordoba';
  await cargar();
  const pedida = param.get('localidad');
  const f = pedida && LOCS.find(x => sinTildes(x.localidad) === sinTildes(pedida));
  pintarHoy();
  if (pedida) { try { history.replaceState(null, '', location.pathname + (f ? '#mapa' : location.hash)); } catch (e) { /* sin historial */ } }
  if (f) { irA('mapa', { foco: false }); elegir(f.localidad); } else irA(location.hash.slice(1), { foco: false });
  sincronizarAvisos();
  avisosLeidos();
  contarInstalacion();
})();

// La primera vez que se abre desde el ícono de la pantalla de inicio, se cuenta una instalación en el servicio de
// avisos: solo un número al azar de este celular, sin ningún otro dato
async function contarInstalacion() {
  if (!AVISOS.url || !instalada() || PREF.get('instalacion_contada', false)) return;
  try {
    let id = PREF.get('id_instalacion', null);
    if (!id) { id = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join(''); PREF.set('id_instalacion', id); }
    await alServicio('/instalada', { id });
    PREF.set('instalacion_contada', true);
  } catch (e) { /* se reintenta la próxima vez */ }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => { /* sin modo sin conexión */ }); });
}
