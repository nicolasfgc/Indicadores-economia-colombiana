// Utilidades y componentes compartidos por todas las pestañas del explorador.
const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const MESES_L = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
// Gobiernos: [nombre, fecha de posesión]
const GOBIERNOS = [["Pastrana", "1998-08-07"], ["Uribe I", "2002-08-07"], ["Uribe II", "2006-08-07"], ["Santos I", "2010-08-07"],
                   ["Santos II", "2014-08-07"], ["Duque", "2018-08-07"], ["Petro", "2022-08-07"], ["De la Espriella", "2026-08-07"]];

const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
// estilo base de las gráficas: tipografía del sitio, leyenda con puntos y globos de información oscuros
if (window.Chart) {
  Chart.defaults.font.family = "Manrope, system-ui, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.pointStyle = "circle";
  Chart.defaults.plugins.legend.labels.padding = 16;
  const quieto = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  Chart.defaults.animation = quieto ? false : {duration: 650, easing: "easeOutQuart"};
  // solo se animan posiciones y tamaños; animar colores o estilos de línea rompe Chart.js al actualizar en su sitio
  Chart.defaults.animations.colors = false;
  Chart.defaults.animations.numbers = {type: "number", properties: ["x", "y", "base", "width", "height"]};
  Chart.defaults.elements.line.tension = 0.35;
  Chart.defaults.scale.border = {display: false};   // sin línea de eje: más limpio
  Chart.defaults.elements.line.borderCapStyle = "round";
  Chart.defaults.elements.line.borderJoinStyle = "round";
  Object.assign(Chart.defaults.plugins.tooltip, {backgroundColor: "rgba(36,20,34,.94)", padding: 11, cornerRadius: 10, titleFont: {weight: "700"}, boxPadding: 4, usePointStyle: true});
}
const PALETA = () => ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8", "--s9", "--s10"].map(css);
// Para comparar varias categorías: la paleta del proyecto en orden (chicle, naranja, orquídea, lima, limón, rosa)
const DISTINTOS = () => ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6"].map(css);
const fmt = (v, d = 2) => v == null || isNaN(v) ? "–" : Number(v).toLocaleString("es-CO", {minimumFractionDigits: d, maximumFractionDigits: d});
const etqMes = f => { if (!f) return ""; if (f.length === 4) return f; const [y, m] = f.split("-"); return `${MESES[+m - 1]} ${y}`; };
const etqMesLargo = f => { const [y, m] = f.split("-"); return `${MESES_L[+m - 1]} de ${y}`; };
const titulo = s => s ? s.toLowerCase().replace(/(^|[\s,(\/-])([a-záéíóúñü])/g, (a, b, c) => b + c.toUpperCase()).replace(/\b(De|Del|La|Las|Los|Y|E|En|Para|Por|A|El|Al|Con|Sin)\b/g, w => w.toLowerCase()) : s;
const $ = id => document.getElementById(id);
const clsSigno = v => v == null ? "" : v > 0 ? "pos" : v < 0 ? "neg" : "";
const gobiernoDe = f => { const d = f.length === 4 ? f + "-07" : f.slice(0, 7); let g = null; for (const x of GOBIERNOS) if (d >= x[1].slice(0, 7)) g = x[0]; return g; };

// Plata en millones de pesos -> texto corto
function plata(millones, d = 1) {
  if (millones == null || isNaN(millones)) return "–";
  const a = Math.abs(millones), s = millones < 0 ? "−" : "";
  if (a >= 1e6) return `${s}$${fmt(a / 1e6, d)} billones`;
  if (a >= 1e3) return `${s}$${fmt(a / 1e3, a >= 1e5 ? 0 : d)} mil millones`;
  return `${s}$${fmt(a, 0)} millones`;
}

const cache = {};
// los datos cambian cuando el robot los actualiza: los JSON se piden confirmando con el servidor (no-cache) y los CSV con una marca por hora
const fresco = url => url + (url.includes("?") ? "&" : "?") + "h=" + new Date().toISOString().slice(0, 13);
function json(url) {
  if (!cache[url]) cache[url] = fetch(url, {cache: "no-cache"}).then(r => { if (!r.ok) throw new Error(url + ": " + r.status); return r.json(); });
  return cache[url];
}
function csv(url) {
  if (!cache[url]) cache[url] = new Promise((ok, err) => Papa.parse(fresco(url), {download: true, header: true, skipEmptyLines: true, complete: r => ok(r.data), error: err}));
  return cache[url];
}

// ------------------------------------------------------------ controles
function seg(id, alCambiar) {
  const el = $(id);
  el.querySelectorAll("button").forEach(b => b.onclick = () => {
    el.querySelectorAll("button").forEach(x => x.classList.remove("on"));
    b.classList.add("on");
    alCambiar(b.dataset.v);
  });
}
function marcarSeg(id, v) { $(id).querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.v === v)); }
function opciones(sel, items, actual) {
  sel.innerHTML = items.map(([v, t]) => `<option value="${v}"${v == actual ? " selected" : ""}>${t}</option>`).join("");
}

// Selector de periodo: primero el año y luego el mes
function periodo(contId, fechas, actual, alCambiar) {
  const c = $(contId);
  c.classList.add("periodo");
  c.innerHTML = `<label class="lbl">Año</label><select class="p-anio"></select><label class="lbl">Mes</label><select class="p-mes"></select>`;
  const sa = c.querySelector(".p-anio"), sm = c.querySelector(".p-mes");
  const anios = [...new Set(fechas.map(f => f.slice(0, 4)))].sort().reverse();
  let f = actual;
  function llenarMeses() {
    const ms = fechas.filter(x => x.startsWith(sa.value));
    if (!ms.includes(f)) f = ms.find(x => x.slice(5, 7) === f.slice(5, 7)) || ms.at(-1);
    opciones(sm, ms.map(x => [x, MESES_L[+x.slice(5, 7) - 1]]), f);
  }
  opciones(sa, anios.map(a => [a, a]), f.slice(0, 4));
  llenarMeses();
  sa.onchange = () => { llenarMeses(); alCambiar(f); };
  sm.onchange = () => { f = sm.value; alCambiar(f); };
  return {set(x) { f = x; sa.value = x.slice(0, 4); llenarMeses(); }};
}

// Selector "Total / una categoría": grupos = [{g: "nombre del grupo", items: [[id, nombre], ...]}]
function selectorCategoria(contId, grupos, alCambiar, {total = "Total", otra = "Una categoría específica"} = {}) {
  const c = $(contId);
  c.classList.add("selcat");
  c.innerHTML = `<div class="seg"><button data-v="total" class="on">${total}</button><button data-v="cat">${otra}</button></div><select hidden></select>`;
  const sel = c.querySelector("select"), botones = c.querySelectorAll("button");
  sel.innerHTML = grupos.map(g => g.g ? `<optgroup label="${g.g}">${g.items.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</optgroup>`
                                      : g.items.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")).join("");
  const modo = m => { botones.forEach(b => b.classList.toggle("on", b.dataset.v === m)); sel.hidden = m === "total"; };
  botones.forEach(b => b.onclick = () => { modo(b.dataset.v); alCambiar(b.dataset.v === "total" ? null : sel.value); });
  sel.onchange = () => alCambiar(sel.value);
  return {set(id) { if (!id) { modo("total"); } else { modo("cat"); sel.value = id; } alCambiar(id); }};
}

// Selector "Total / varias categorías" con un árbol que se va abriendo por niveles y un buscador.
// arbol = [{id, t, nivel, hijos: [...]}] (un nodo sin id es solo un encabezado que agrupa).
// alCambiar(ids) recibe [] cuando se vuelve al total. colorDe(k) da el color de la k-ésima categoría elegida.
function selectorVarias(contId, arbol, alCambiar, {total = "Total", otra = "Comparar categorías", max = 6, ayuda = "", boton = "Agregar una categoría", ejemplos = "arroz, arriendo, gasolina", colorDe = k => DISTINTOS()[k]} = {}) {
  const c = $(contId);
  c.classList.add("selcat");
  const info = {};   // id -> {t, ruta}
  (function indexar(nodos, ruta) { for (const n of nodos) { if (n.id) info[n.id] = {t: n.t, ruta}; if (n.hijos) indexar(n.hijos, n.id || n.t ? [...ruta, n.t] : ruta); } })(arbol, []);
  const primero = (function buscar(ns) { for (const n of ns) { if (n.id) return n.id; const x = n.hijos && buscar(n.hijos); if (x) return x; } })(arbol);
  c.innerHTML = `<div class="seg"><button data-v="total" class="on">${total}</button><button data-v="cat">${otra}</button></div>
    <div class="varias" hidden>
      <div class="agregar"><button class="abrir" type="button">+ ${boton} <span>▾</span></button>
        <div class="panel" hidden>
          ${ayuda ? `<p class="hint">${ayuda}</p>` : ""}
          <input type="search" placeholder="Buscar por nombre (por ejemplo: ${ejemplos})…">
          <div class="arbol"></div>
          <div class="pie"><button class="cerrar" type="button">Cerrar</button></div>
        </div></div>
      <div class="chips"></div></div>`;
  const caja = c.querySelector(".varias"), panel = caja.querySelector(".panel"), abrir = caja.querySelector(".abrir"), buscador = panel.querySelector("input"),
        cont = panel.querySelector(".arbol"), chips = caja.querySelector(".chips"), botones = c.querySelectorAll(".seg button");
  let ids = [];
  const abiertos = new Set();
  const esc = t => t.replace(/[&<>"]/g, x => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[x]));

  function nodoHTML(n, prof) {
    const tiene = n.hijos && n.hijos.length, ab = abiertos.has(n.id || n.t), ya = n.id && ids.includes(n.id);
    const flecha = tiene ? `<button class="flecha" data-k="${esc(n.id || n.t)}" title="${ab ? "Cerrar" : "Ver lo que contiene"}">${ab ? "▾" : "▸"}</button>` : `<span class="flecha"></span>`;
    const nombre = n.id ? `<button class="nombre${ya ? " ya" : ""}" data-id="${n.id}" ${ya ? "disabled" : ""}>${ya ? "✓ " : ""}${esc(n.t)}</button>`
                        : `<button class="nombre grupo" data-k="${esc(n.t)}">${esc(n.t)}</button>`;
    const extra = tiene ? `<span class="cuenta">${n.nivel ? n.nivel + " · " : ""}${n.hijos.length} adentro</span>` : n.nivel ? `<span class="cuenta">${n.nivel}</span>` : "";
    return `<li style="--p:${prof}"><div class="fila">${flecha}${nombre}${extra}</div>${tiene && ab ? `<ul>${n.hijos.map(h => nodoHTML(h, prof + 1)).join("")}</ul>` : ""}</li>`;
  }
  function dibujarArbol() {
    const q = buscador.value.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (q.length >= 2) {
      const res = Object.entries(info).filter(([, v]) => v.t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(q)).slice(0, 40);
      cont.innerHTML = res.length ? `<ul>${res.map(([id, v]) => `<li style="--p:0"><div class="fila res"><span class="flecha"></span><button class="nombre${ids.includes(id) ? " ya" : ""}" data-id="${id}" ${ids.includes(id) ? "disabled" : ""}>${ids.includes(id) ? "✓ " : ""}${esc(v.t)}</button>` +
        `${v.ruta.length ? `<span class="ruta">en ${esc(v.ruta.join(" › "))}</span>` : ""}</div></li>`).join("")}</ul>` : `<p class="hint">No hay nada con ese nombre.</p>`;
    } else cont.innerHTML = `<ul>${arbol.map(n => nodoHTML(n, 0)).join("")}</ul>`;
    cont.querySelectorAll("[data-k]").forEach(b => b.onclick = () => { const k = b.dataset.k; abiertos.has(k) ? abiertos.delete(k) : abiertos.add(k); dibujarArbol(); });
    cont.querySelectorAll(".nombre[data-id]").forEach(b => b.onclick = () => agregar(b.dataset.id, true));
  }
  const cerrar = () => { panel.hidden = true; abrir.classList.remove("on"); };
  abrir.onclick = () => { if (ids.length >= max) return; panel.hidden = !panel.hidden; abrir.classList.toggle("on", !panel.hidden); if (!panel.hidden) { buscador.value = ""; dibujarArbol(); buscador.focus({preventScroll: true}); } };
  panel.querySelector(".cerrar").onclick = cerrar;
  buscador.oninput = dibujarArbol;
  // clic afuera cierra (se mira la ruta del clic porque el árbol se redibuja y el botón tocado ya no está en la página)
  document.addEventListener("click", e => { if (!panel.hidden && !e.composedPath().includes(caja.querySelector(".agregar"))) cerrar(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") cerrar(); });

  const pintar = () => {
    chips.innerHTML = ids.map((id, k) => `<span class="chip" style="border-color:${colorDe(k)}" title="${esc([...info[id].ruta, info[id].t].join(" › "))}"><i style="background:${colorDe(k)}"></i>${esc(info[id].t)}<button data-id="${id}" title="Quitar">✕</button></span>`).join("") +
      (ids.length >= max ? `<span class="hint inline">Máximo ${max} a la vez: quita una para agregar otra.</span>` : "");
    abrir.disabled = ids.length >= max;
    chips.querySelectorAll("button").forEach(b => b.onclick = () => { ids = ids.filter(x => x !== b.dataset.id); if (!ids.length) return modo("total", true); pintar(); alCambiar(ids); });
  };
  function modo(m, avisar) {
    botones.forEach(b => b.classList.toggle("on", b.dataset.v === m));
    caja.hidden = m === "total";
    if (m === "total") { ids = []; cerrar(); }
    else if (!ids.length) ids = [primero];
    pintar();
    if (avisar) alCambiar(ids);
  }
  function agregar(id, desdePanel) {
    if (!info[id]) return;
    if (caja.hidden) modo("cat");
    if (!ids.includes(id)) { if (ids.length >= max) ids.shift(); ids.push(id); }
    if (desdePanel) cerrar();
    pintar(); alCambiar(ids);
  }
  botones.forEach(b => b.onclick = () => modo(b.dataset.v, true));
  return {agregar: id => agregar(id)};
}

// Navegación por niveles: "← Volver" grande y el camino completo
function migas(contId, pasos, ir) {
  const c = $(contId);
  c.classList.add("migas");
  if (pasos.length <= 1) { c.innerHTML = `<span class="aqui">${pasos[0].t}</span><span class="hint inline">Toca una barra o “Ver detalle” para bajar de nivel.</span>`; return; }
  c.innerHTML = `<button class="volver">← Volver a ${pasos.at(-2).t}</button>` +
    pasos.map((p, k) => k === pasos.length - 1 ? `<span class="aqui">${p.t}</span>` : `<a data-k="${k}">${p.t}</a><span class="sep">›</span>`).join("");
  c.querySelector(".volver").onclick = () => ir(pasos.at(-2));
  c.querySelectorAll("a").forEach(a => a.onclick = () => ir(pasos[+a.dataset.k]));
}

// Lleva la vista a un elemento solo si no se está viendo (así tocar algo nunca manda al usuario lejos de donde estaba)
function irA(id, bloque = "start") {
  const el = $(id); if (!el) return;
  const r = el.getBoundingClientRect(), alto = window.innerHeight;
  if (r.top >= 70 && r.top < alto * 0.6) return;
  const barra = document.querySelector("section.tab:not([hidden]) .barra-mes");
  const margen = barra ? barra.offsetHeight + 12 : 12;
  if (bloque === "center") el.scrollIntoView({behavior: "smooth", block: "center"});
  else window.scrollTo({top: window.scrollY + r.top - margen, behavior: "smooth"});
}

// Todos los meses entre la primera y la última fecha (para que los meses sin dato se vean como hueco)
function mesesCompletos(fechas) {
  const out = []; let [y, m] = fechas[0].split("-").map(Number); const [y1, m1] = fechas.at(-1).split("-").map(Number);
  while (y < y1 || (y === y1 && m <= m1)) { out.push(`${y}-${String(m).padStart(2, "0")}-01`); if (++m > 12) { m = 1; y++; } }
  return out;
}
const listaMeses = fs => { const t = fs.map(etqMesLargo); return t.length < 2 ? t.join("") : t.slice(0, -1).join(", ") + " y " + t.at(-1); };

// Gráfica "en el tiempo" que aparece dentro de la misma sección, debajo de lo que se tocó
function enElTiempo(boxId, titulo, etiquetas, series, opts = {}) {
  const box = $(boxId);
  if (!box.dataset.listo) {
    box.classList.add("tiempo-box");
    box.innerHTML = `<div class="row spread"><h3></h3><button class="cerrar">Cerrar ✕</button></div><p class="hint"></p><div class="chartbox" style="height:260px"><canvas id="${boxId}-g"></canvas></div><p class="interp" hidden></p>`;
    box.querySelector(".cerrar").onclick = () => { box.hidden = true; };
    box.dataset.listo = 1;
  }
  box.hidden = false;
  box.querySelector("h3").textContent = titulo;
  box.querySelector(".hint").textContent = opts.nota || "Toca otra barra o fila para cambiar lo que ves aquí.";
  const txt = box.querySelector(".interp");
  serie(boxId + "-g", etiquetas, series, {...opts, despues: opts.texto ? (i0, i1) => { const t = opts.texto(i0, i1); txt.hidden = !t; txt.innerHTML = t || ""; } : null});
  if (!opts.texto) txt.hidden = true;
  irA(boxId, "center");
}

// Inflación frente a la tasa del Banco de la República (se usa en Inflación y en Tasas).
// La tasa llega hasta hoy (mes en curso); la inflación, hasta el último mes que publicó el DANE.
// La tasa real solo se calcula en los meses que tienen las dos cifras.
async function tasaVsInflacion(canvasId, txtId) {
  const [T, H] = await Promise.all([json("web/tasas.json"), json("web/ipc_historico.json")]);
  const tpm = {}; T.fechas.forEach((f, i) => { const v = T.valores.TPM.fin_mes?.[i]; if (v != null) tpm[f] = v; });
  const inf = {}; H.fechas.forEach((f, i) => { if (H.var_anual[i] != null) inf[f] = H.var_anual[i]; });
  const desde = H.fechas.find(f => inf[f] != null && tpm[f] != null);
  const F = T.fechas.filter(f => f >= desde && tpm[f] != null);
  const t = F.map(f => tpm[f]), p = F.map(f => inf[f] ?? null), real = F.map((f, i) => p[i] == null ? null : +(t[i] - p[i]).toFixed(2));
  const mc = T.mes_en_curso, fx = f => etqMes(f) + (mc && f === mc[0] ? ` (hasta el ${+mc[1].slice(8)})` : "");
  const pos = css("--verde"), neg = css("--rojo");
  serie(canvasId, F, [
    {label: "Tasa del Banco de la República", data: t, color: css("--grafica"), ancho: 2.5},
    {label: "Inflación anual", data: p, color: css("--naranja"), ancho: 2.5},
    {label: "Tasa real (tasa − inflación)", data: real, tipo: "bar", colores: real.map(x => x < 0 ? neg : pos)}],
    {unidad: "%", fmtValor: x => x == null ? "sin dato aún" : fmt(x, 1) + "%", fmtX: fx, eje0: true, referencias: [{y: 3, t: "Meta de inflación 3%"}], despues: (i0, i1) => {
      let a = i1; while (a > i0 && real[a] == null) a--;          // último mes con las dos cifras
      const r = real.slice(i0, a + 1).filter(x => x != null); if (!r.length) return;
      const prom = r.reduce((x, y) => x + y, 0) / r.length, negs = r.filter(x => x < 0).length;
      const estado = x => x > 3 ? "muy por encima de la inflación: endeudarse es caro, lo que frena el consumo y el crédito para que los precios bajen"
                   : x > 0 ? "por encima de la inflación: el crédito cuesta algo más de lo que suben los precios"
                   : "por debajo de la inflación: endeudarse sale barato, lo que impulsa el crédito y el consumo";
      let txt = `En <strong>${etqMesLargo(F[a])}</strong>, último mes con dato de inflación, la tasa del Banco de la República cerró en <strong>${fmt(t[a])}%</strong> y la inflación anual fue <strong>${fmt(p[a])}%</strong>. ` +
        `La diferencia entre las dos, llamada <strong>tasa real</strong>, fue de ${fmt(real[a])} puntos. Es decir, la tasa estaba ${estado(real[a])}. `;
      if (i1 > a && t[i1] !== t[a]) {   // la tasa cambió después del último dato de inflación
        const r2 = t[i1] - p[a];
        txt += `<strong>Hoy la tasa está en ${fmt(t[i1])}%</strong>; con la última inflación conocida, la tasa real sería de ${fmt(r2)} puntos. `;
      } else if (i1 > a) txt += `Hoy la tasa sigue en ${fmt(t[i1])}%. `;
      txt += `Entre ${etqMes(F[i0])} y ${etqMes(F[a])} la tasa real promedió ${fmt(prom, 1)} puntos y fue negativa en ${negs} ${negs === 1 ? "mes" : "meses"}. ` +
        `Lo normal es que el Banco suba su tasa cuando la inflación se dispara y la baje cuando cede, casi siempre con algunos meses de retraso.`;
      $(txtId).innerHTML = txt;
    }});
}

// ------------------------------------------------------------ gráficos
// Si la gráfica ya existe y es del mismo tipo, se actualiza en su sitio: Chart.js anima el paso de un estado al otro
// (cambiar de periodo, de categoría o de medida se ve como una transición suave, no como un redibujo de golpe).
const graficos = {};
let arrastrando = false;   // mientras se mueven las manijas del periodo, sin animación para que responda al instante
function dibujar(canvasId, config, {nueva = false} = {}) {
  const g = graficos[canvasId];
  if (!nueva && g && g.config.type === config.type && g.canvas === $(canvasId)) {
    g.stop();   // Chart.js falla si se cambian las opciones con una animación en curso
    g.data.labels = config.data.labels;
    // conserva los objetos de cada serie cuando coinciden por nombre, para que la animación los interpole
    g.data.datasets = config.data.datasets.map(d => { const v = g.data.datasets.find(x => x.label === d.label && x.type === d.type); return v ? Object.assign(v, d) : d; });
    g.options = config.options;
    g.update(arrastrando ? "none" : undefined);
    return g;
  }
  if (g) g.destroy();
  graficos[canvasId] = new Chart($(canvasId), config);
  return graficos[canvasId];
}

// Barras horizontales ordenadas; items = [{id, n, v, resaltar, color}]
function barras(canvasId, items, {unidad = "", alClic = null, etiqueta = "", fmtValor = null, alto = 26, colores = null} = {}) {
  const box = $(canvasId).parentElement;
  box.style.height = Math.max(160, items.length * alto + 50) + "px";
  const up = css("--rojo"), down = css("--verde"), acc = css("--grafica");
  const f = fmtValor || (v => `${fmt(v)}${unidad}`);
  // por defecto sin semáforo: el color principal (y uno secundario para valores negativos); el semáforo se pide con `colores`
  const col = colores || (x => x.resaltar ? css("--s2") : (x.v >= 0 ? acc : css("--s6")));
  return dibujar(canvasId, {
    type: "bar",
    data: {labels: items.map(x => x.n), datasets: [{data: items.map(x => x.v), backgroundColor: items.map(col), borderRadius: 6, barThickness: Math.min(18, alto - 8)}]},
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      plugins: {legend: {display: false}, tooltip: {callbacks: {label: c => f(c.raw), footer: () => alClic ? "Toca para ver el detalle" : ""}}},
      scales: {
        x: {grid: {color: css("--line")}, ticks: {color: css("--muted")}, title: {display: !!etiqueta, text: etiqueta, color: css("--muted")}},
        y: {grid: {display: false}, ticks: {color: css("--ink"), autoSkip: false, callback(v) { const t = this.getLabelForValue(v); return t.length > 42 ? t.slice(0, 40) + "…" : t; }}}
      },
      onClick: (e, el) => { if (el.length && alClic) alClic(items[el[0].index]); },
      onHover: (e, el) => { e.native.target.style.cursor = el.length && alClic ? "pointer" : "default"; }
    }
  }, {nueva: true});
}

// Franjas de gobiernos detrás de las series
let verGobiernos = true;
const pluginGobiernos = {id: "gobiernos", beforeDatasetsDraw(chart, a, opts) {
  if (!verGobiernos || !opts || !opts.activo) return;
  const etq = chart.data.labels, {ctx, chartArea: area, scales: {x}} = chart;
  if (!etq.length) return;
  const paso = etq.length > 1 ? x.getPixelForValue(1) - x.getPixelForValue(0) : 20;
  let ini = 0;
  ctx.save(); ctx.font = "600 11px Manrope, sans-serif"; ctx.textBaseline = "top";
  for (let i = 1; i <= etq.length; i++) {
    const g = gobiernoDe(etq[ini]);
    if (i < etq.length && gobiernoDe(etq[i]) === g) continue;
    const x0 = Math.max(area.left, x.getPixelForValue(ini) - paso / 2), x1 = Math.min(area.right, x.getPixelForValue(i - 1) + paso / 2);
    const k = GOBIERNOS.findIndex(z => z[0] === g);
    if (k % 2 === 0) { ctx.fillStyle = css("--chip"); ctx.globalAlpha = .7; ctx.fillRect(x0, area.top, x1 - x0, area.bottom - area.top); ctx.globalAlpha = 1; }
    ctx.strokeStyle = css("--line"); ctx.beginPath(); ctx.moveTo(x0, area.top); ctx.lineTo(x0, area.bottom); ctx.stroke();
    if (g && x1 - x0 > ctx.measureText(g).width + 6) { ctx.fillStyle = css("--muted"); ctx.fillText(g, x0 + 4, area.top + 3); }
    ini = i;
  }
  ctx.restore();
}};
// Líneas verticales donde empieza cada año (en series mensuales), con el año escrito abajo. Se apagan con "Marcar el inicio de cada año".
let verAnios = true;
const pluginAnios = {id: "anios", afterDatasetsDraw(chart, a, opts) {
  if (!verAnios || !opts || !opts.activo) return;
  const et = chart.data.labels, {ctx, chartArea: area, scales: {x}} = chart;
  if (et.length < 3) return;
  const paso = x.getPixelForValue(1) - x.getPixelForValue(0), pocos = et.length <= 30;
  ctx.save(); ctx.font = "700 11px Manrope, sans-serif"; ctx.textBaseline = "bottom";
  for (let i = 1; i < et.length; i++) {
    if (String(et[i]).slice(0, 4) === String(et[i - 1]).slice(0, 4)) continue;
    const px = x.getPixelForValue(i) - paso / 2;
    if (px < area.left || px > area.right) continue;
    ctx.setLineDash([3, 3]); ctx.strokeStyle = css("--muted"); ctx.globalAlpha = .45;
    ctx.beginPath(); ctx.moveTo(px, area.top); ctx.lineTo(px, area.bottom); ctx.stroke();
    if (pocos) { ctx.globalAlpha = .9; ctx.fillStyle = css("--muted"); ctx.fillText(String(et[i]).slice(0, 4), px + 4, area.bottom - 4); }
  }
  ctx.restore();
}};
// Líneas horizontales de referencia (p. ej. la meta de inflación)
const pluginReferencias = {id: "referencias", afterDatasetsDraw(chart, a, opts) {
  if (!opts || !opts.lineas || !opts.lineas.length) return;
  const {ctx, chartArea: area, scales: {y}} = chart;
  ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = css("--naranja"); ctx.fillStyle = css("--naranja"); ctx.font = "600 11px Manrope, sans-serif";
  for (const r of opts.lineas) { const py = y.getPixelForValue(r.y); if (py < area.top || py > area.bottom) continue;
    ctx.beginPath(); ctx.moveTo(area.left, py); ctx.lineTo(area.right, py); ctx.stroke(); if (r.t) ctx.fillText(r.t, area.right - ctx.measureText(r.t).width - 4, py - 4); }
  ctx.restore();
}};

// Serie de tiempo con barra de rango y franjas de gobiernos.
// series = [{label, data, color, dash, ancho, tipo: "bar"}]; etiquetas = "AAAA-MM-01" (mensual) o "AAAA" (anual)
const rangos = {}, ultimosArgs = {};
// series que la persona ocultó tocando la leyenda: se recuerdan por gráfica para que no reaparezcan al cambiar el periodo
const ocultas = {};
// configuración de leyenda que recuerda lo ocultado (para gráficas armadas a mano, fuera de serie())
function leyendaRecordada(canvasId) {
  return {labels: {color: css("--ink"), boxWidth: 14}, onClick(e, item, legend) {
    Chart.defaults.plugins.legend.onClick.call(this, e, item, legend);
    const set = (ocultas[canvasId] ??= new Set());
    legend.chart.isDatasetVisible(item.datasetIndex) ? set.delete(item.text) : set.add(item.text);
  }};
}
// Vista "por año" de una serie mensual. opts.agregar (o s.agregar por serie) dice cómo se resume cada año:
//   "suma" (homicidios, exportaciones...), "promedio" (desempleo, dólar...) o "fin" (el dato de diciembre, p. ej. la inflación anual).
// El año en curso queda marcado como incompleto (más claro y con la etiqueta "hasta tal mes").
const modoAnual = {};
const aclarar = (c, t = .55) => { const h = String(c).trim().replace("#", ""); if (!/^[0-9a-f]{6}$/i.test(h)) return c;
  const v = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)), w = 255; return `rgb(${v.map(x => Math.round(x + (w - x) * t)).join(",")})`; };
function aAnual(etiquetas, series, opts) {
  const anios = [...new Set(etiquetas.map(e => e.slice(0, 4)))];
  const idx = {}; etiquetas.forEach((e, i) => (idx[e.slice(0, 4)] ??= []).push(i));
  // meses con dato en cada año (según la primera serie con datos), para saber qué años están incompletos
  const base = series.find(s => s.data.some(x => x != null)) || series[0];
  const meses = anios.map(y => idx[y].filter(i => base.data[i] != null));
  const ultMes = anios.map((y, k) => meses[k].length ? +etiquetas[meses[k].at(-1)].slice(5, 7) : 0);
  const parcial = anios.map((y, k) => meses[k].length > 0 && meses[k].length < 12 && (k === anios.length - 1 || k === 0));
  const resumen = (s, y) => { const m = s.agregar || opts.agregar, v = idx[y].map(i => s.data[i]).filter(x => x != null);
    if (!v.length) return null; return m === "suma" ? v.reduce((a, b) => a + b, 0) : m === "promedio" ? v.reduce((a, b) => a + b, 0) / v.length : v.at(-1); };
  const nuevas = series.map(s => {
    const m = s.agregar || opts.agregar, data = anios.map(y => resumen(s, y)), c = s.color;
    // si la serie original se pintaba según el signo (p. ej. la balanza comercial), se conserva: rojo si es negativa
    const colorDe = (v, k) => { const base = s.colores ? (v < 0 ? css("--rojo") : css("--verde")) : (c || css("--grafica")); return parcial[k] ? aclarar(base) : base; };
    return m === "suma" ? {...s, data, tipo: "bar", colores: data.map((v, k) => colorDe(v, k)), eje: s.eje}
      : {...s, data, tipo: "line", puntos: true, parcial: parcial.map((p, k) => p ? k : -1).filter(k => k >= 0)};
  });
  const valores = (s, y, hastaMes) => idx[y].filter(i => +etiquetas[i].slice(5, 7) <= hastaMes).map(i => s.data[i]).filter(x => x != null);
  return {anios, nuevas, parcial, ultMes, resumen, valores, base, originales: series};
}
function textoAnual(A, opts, f) {
  // la serie principal: la que dice "total" o la de línea más gruesa
  const kp = Math.max(0, A.nuevas.findIndex(x => /total/i.test(x.label || "")) >= 0 ? A.nuevas.findIndex(x => /total/i.test(x.label || ""))
    : A.nuevas.reduce((m, x, k, arr) => (x.ancho || 2) > (arr[m].ancho || 2) ? k : m, 0));
  const s = A.nuevas[kp], orig = A.originales[kp], m = orig.agregar || opts.agregar, n = A.anios.length, anual12 = m === "fin" && opts.finEsAnual;
  const completos = A.anios.map((y, k) => !A.parcial[k] && s.data[k] != null ? k : -1).filter(k => k >= 0);
  if (!completos.length) return "";
  const u = completos.at(-1), ant = completos.at(-2);
  const nombre = (orig.label || "").toLowerCase();
  const pct = (x, y) => y ? `${x >= y ? "+" : "−"}${fmt(Math.abs(x / y - 1) * 100, 1)}%` : "";
  let t = m === "suma" ? `En <strong>${A.anios[u]}</strong> el total del año fue <strong>${f(s.data[u])}</strong>` :
          m === "promedio" ? `En <strong>${A.anios[u]}</strong> el promedio del año fue <strong>${f(s.data[u])}</strong>` :
          anual12 ? `En todo <strong>${A.anios[u]}</strong>: <strong>${f(s.data[u])}</strong>` : `En diciembre de <strong>${A.anios[u]}</strong> el dato fue <strong>${f(s.data[u])}</strong>`;
  if (ant != null) t += m === "suma" ? ` (${pct(s.data[u], s.data[ant])} frente a ${A.anios[ant]})` : ` (en ${A.anios[ant]}: ${f(s.data[ant])})`;
  t += nombre && A.nuevas.length > 1 && !/total/i.test(nombre) ? ` en ${nombre}. ` : ". ";
  const k = n - 1;
  if (A.parcial[k]) {
    const hm = A.ultMes[k], mes = MESES_L[hm - 1], y = A.anios[k], yp = String(+y - 1);
    const ahora = A.valores(orig, y, hm), antes = A.valores(orig, yp, hm);
    t += `<strong>${y} todavía no termina</strong> (hay datos hasta ${mes}), así que no se compara con los años completos. `;
    if (m === "suma" && antes.length === ahora.length) { const a1 = ahora.reduce((a, b) => a + b, 0), a0 = antes.reduce((a, b) => a + b, 0);
      t += `De enero a ${mes} lleva ${f(a1)}; en el mismo periodo de ${yp} iba en ${f(a0)} (${pct(a1, a0)}).`; }
    else if (m === "promedio" && ahora.length) t += `En lo que va del año el promedio es ${f(ahora.reduce((a, b) => a + b, 0) / ahora.length)}.`;
    else if (ahora.length) t += anual12 ? `En los 12 meses hasta ${mes}: ${f(ahora.at(-1))}.` : `El último dato, de ${mes}, es ${f(ahora.at(-1))}.`;
  }
  return t;
}
function serie(canvasId, etiquetas, series, opts = {}) {
  ultimosArgs[canvasId] = [etiquetas, series, opts];
  const mensual = etiquetas.length && /^\d{4}-\d{2}-01$/.test(etiquetas[0]) && /^\d{4}-\d{2}-01$/.test(etiquetas.at(-1));
  const porAnio = !!(opts.agregar && mensual && modoAnual[canvasId]);
  let A = null, fxBase = opts.fmtX || etqMes;
  if (porAnio) {   // se pasa a la vista por año y se sigue con el mismo dibujo
    A = aAnual(etiquetas, series, opts);
    const ult = A.anios.length - 1;
    fxBase = e => { const k = A.anios.indexOf(e); return A.parcial[k] ? `${e} (hasta ${MESES[A.ultMes[k] - 1]})` : e; };
    etiquetas = A.anios; series = A.nuevas;
  }
  const clave = porAnio ? canvasId + "|año" : canvasId;
  const anual = etiquetas.length && etiquetas[0].length === 4;
  const n = etiquetas.length;
  let r = rangos[clave];
  if (!r || etiquetas.indexOf(r.d) < 0 || etiquetas.indexOf(r.h) < 0) {
    // por defecto: el último año (las series anuales, completas)
    const k = porAnio ? 0 : opts.inicio != null ? opts.inicio : anual ? 0 : 12;
    r = rangos[clave] = {d: etiquetas[desdeAtajo(etiquetas, k)], h: etiquetas[n - 1], k: String(k)};
  }
  const i0 = etiquetas.indexOf(r.d), i1 = etiquetas.indexOf(r.h);
  controlRango(canvasId, etiquetas, i0, i1, anual, porAnio ? null : opts.atajos, r.k, opts.agregar && mensual ? (porAnio ? "año" : "mes") : null, fxBase);
  const et = etiquetas.slice(i0, i1 + 1);
  const pal = PALETA();
  const f = opts.fmtValor || (v => `${fmt(v)}${opts.unidad || ""}`);
  const fx = fxBase;
  // en series mensuales largas el eje muestra solo los años (en el primer mes de cada año), no "abr 2025, mar 2026..."
  const largo = !anual && et.length > 30 && et.every(e => String(e).endsWith("-01"));
  const cambioAnio = i => i > 0 && String(et[i]).slice(0, 4) !== String(et[i - 1]).slice(0, 4);
  // el texto que interpreta la gráfica: en la vista por año se reemplaza por un resumen anual automático
  const interp = (() => { let el = $(canvasId + "-rango")?.nextElementSibling; while (el && !el.classList.contains("interp") && !el.classList.contains("chartbox") && !el.classList.contains("panel")) el = el.nextElementSibling; return el && el.classList.contains("interp") ? el : null; })();
  if (porAnio) { if (interp) interp.innerHTML = textoAnual(A, opts, x => x == null ? "–" : f(x)); }
  else if (opts.despues) setTimeout(() => opts.despues(i0, i1), 0);   // p. ej. actualizar el texto que interpreta el periodo visible
  const config = {
    type: "line",
    data: {labels: et, datasets: series.map((s, i) => {
      const c = s.color || pal[i % pal.length];
      const base = {label: s.label, data: s.data.slice(i0, i1 + 1), borderColor: c, order: s.tipo === "bar" ? 2 : 1, hidden: !!ocultas[canvasId]?.has(s.label)};
      const parcial = (s.parcial || []).map(k => k - i0);
      return s.tipo === "bar" ? {...base, type: "bar", backgroundColor: s.colores ? s.colores.slice(i0, i1 + 1) : c, borderWidth: 0, borderRadius: porAnio ? 5 : 2, yAxisID: s.eje || "y"}
        : {...base, backgroundColor: c, fill: false, borderWidth: s.ancho || 2, borderDash: s.dash || [], pointRadius: s.puntos ? 3.5 : 0, pointHoverRadius: 5, tension: s.puntos ? .2 : .3, spanGaps: true, yAxisID: s.eje || "y",
           ...(parcial.length ? {segment: {borderDash: ctx => parcial.includes(ctx.p1DataIndex) ? [5, 4] : (s.dash || undefined)},
                                 pointBackgroundColor: base.data.map((v, k) => parcial.includes(k) ? css("--panel") : c)} : {})};
    })},
    options: {
      responsive: true, maintainAspectRatio: false, interaction: {mode: "index", intersect: false},
      plugins: {legend: {display: series.length > 1, labels: {color: css("--ink"), boxWidth: 14},
                 onClick(e, item, legend) {
                   Chart.defaults.plugins.legend.onClick.call(this, e, item, legend);
                   const set = (ocultas[canvasId] ??= new Set());
                   legend.chart.isDatasetVisible(item.datasetIndex) ? set.delete(item.text) : set.add(item.text);
                 }},
        tooltip: {callbacks: {title: c => { const e = et[c[0].dataIndex]; const g = gobiernoDe(e); return fx(e) + (g ? ` · ${g}` : ""); },
                              label: c => `${c.dataset.label}: ${(c.dataset.yAxisID === "y2" && opts.fmtValor2 ? opts.fmtValor2 : f)(c.raw)}`,
                              footer: c => porAnio && A.parcial[A.anios.indexOf(et[c[0].dataIndex])] ? "Año incompleto: no se compara con años completos" : ""}},
        gobiernos: {activo: opts.gobiernos !== false}, referencias: {lineas: opts.referencias || []}, anios: {activo: !anual}},
      scales: {x: {grid: {display: false}, ticks: {color: css("--muted"), autoSkip: !largo, maxRotation: 0, ...(largo ? {} : {maxTicksLimit: 10}),
                   callback: (v, i) => largo ? (i === 0 || cambioAnio(i) ? String(et[i]).slice(0, 4) : null) : fx(et[i])}},
               // el eje siempre incluye las líneas de referencia (meta de inflación, el cero…) aunque el periodo sea corto
               y: {beginAtZero: !!opts.eje0 || porAnio, grid: {color: css("--line")}, ticks: {color: css("--muted"), callback: v => f(v)},
                   ...(opts.referencias?.length ? {suggestedMin: Math.min(...opts.referencias.map(x => x.y)), suggestedMax: Math.max(...opts.referencias.map(x => x.y))} : {})},
               ...(series.some(s => s.eje === "y2") ? {y2: {position: "right", grid: {display: false}, beginAtZero: porAnio, ticks: {color: css("--muted"), callback: v => (opts.fmtValor2 || f)(v)}}} : {})}
    },
    plugins: [pluginGobiernos, pluginReferencias, pluginAnios]
  };
  // al pasar de mes a año (o al revés) cambia todo: se dibuja de nuevo en vez de animar la transición
  const g = graficos[canvasId];
  const ch = dibujar(canvasId, config, {nueva: !!g && g.$modo !== (porAnio ? "año" : "mes")});
  ch.$modo = porAnio ? "año" : "mes";
  return ch;
}
function redibujar(canvasId) { const a = ultimosArgs[canvasId]; if (a) serie(canvasId, ...a); }

// Desde qué posición arranca un atajo: k = cuántos periodos hacia atrás, 0 = todo, "ytd" = desde enero del último año
function desdeAtajo(et, k) {
  const h = et.length - 1;
  if (k === "ytd") { const y = et[h].slice(0, 4), i = et.findIndex(f => f.slice(0, 4) === y); return i < 0 ? 0 : i; }
  k = +k; return k ? Math.max(0, h - k + 1) : 0;
}

// Barra para escoger desde qué mes hasta qué mes (dos manijas) y atajos
function controlRango(canvasId, etiquetas, i0, i1, anual, atajosPropios, activo, modo, fx) {
  let c = $(canvasId + "-rango");
  const n = etiquetas.length;
  if (c && c.dataset.modo !== String(modo) + "|" + String(anual)) { c.remove(); c = null; }   // cambió de mes a año: otros atajos
  if (!c) {
    c = document.createElement("div"); c.className = "rango"; c.id = canvasId + "-rango"; c.dataset.modo = String(modo) + "|" + String(anual);
    $(canvasId).parentElement.after(c);
    const atajos = atajosPropios || (anual ? [["10 años", 10], ["20 años", 20], ["Todo", 0]] : [["Año en curso", "ytd"], ["1 año", 12], ["5 años", 60], ["10 años", 120], ["Todo", 0]]);
    c.innerHTML = `<div class="rango-top"><span class="rango-txt"></span><span class="rango-atajos">${modo ? `<span class="rango-modo"><button data-m="mes"${modo === "mes" ? ' class="on"' : ""}>Mes a mes</button><button data-m="año"${modo === "año" ? ' class="on"' : ""}>Por año</button></span>` : ""}${atajos.map(([t, k]) => `<button data-k="${k}">${t}</button>`).join("")}</span></div>
      <div class="dual"><div class="pista"><div class="relleno"></div></div><input type="range" class="r0" min="0" step="1"><input type="range" class="r1" min="0" step="1"></div>`;
    const a = c.querySelector(".r0"), b = c.querySelector(".r1");
    const clave = () => modoAnual[canvasId] && c.dataset.modo.startsWith("año") ? canvasId + "|año" : canvasId;
    const etActual = () => c._et || ultimosArgs[canvasId][0];
    const aplicar = () => {
      const et = etActual();
      let x = +a.value, y = +b.value; if (x > y) [x, y] = [y, x];
      rangos[clave()] = {d: et[x], h: et[y], k: null}; redibujar(canvasId);
    };
    let pendiente = null;
    const alMover = () => { arrastrando = true; pintar(c, etActual(), +a.value, +b.value); if (!pendiente) pendiente = requestAnimationFrame(() => { pendiente = null; aplicar(); arrastrando = false; }); };
    a.oninput = alMover; b.oninput = alMover;
    c.querySelectorAll(".rango-atajos button[data-k]").forEach(btn => btn.onclick = () => {
      const et = etActual(), k = btn.dataset.k;
      rangos[clave()] = {d: et[desdeAtajo(et, k)], h: et.at(-1), k}; redibujar(canvasId);
    });
    c.querySelectorAll(".rango-modo button").forEach(btn => btn.onclick = () => { modoAnual[canvasId] = btn.dataset.m === "año"; redibujar(canvasId); });
  }
  c._et = etiquetas; c._fx = fx;
  const a = c.querySelector(".r0"), b = c.querySelector(".r1");
  a.max = b.max = n - 1; a.value = i0; b.value = i1;
  c.querySelectorAll(".rango-atajos button[data-k]").forEach(btn => btn.classList.toggle("on", btn.dataset.k === activo));
  pintar(c, etiquetas, i0, i1);
}
function pintar(c, et, x, y) {
  if (x > y) [x, y] = [y, x];
  const n = Math.max(1, et.length - 1);
  c.querySelector(".relleno").style.left = (x / n * 100) + "%";
  c.querySelector(".relleno").style.width = ((y - x) / n * 100) + "%";
  const fx = c._fx || etqMes;
  c.querySelector(".rango-txt").innerHTML = `Mostrando <strong>${fx(et[x])}</strong> a <strong>${fx(et[y])}</strong> · mueve las manijas para cambiar el periodo`;
}

// ------------------------------------------------------------ pestañas
const PESTANAS = {};
function registrar(id, modulo) { PESTANAS[id] = modulo; }
let actual = null;
async function mostrar(id) {
  if (!PESTANAS[id]) id = "resumen";
  document.querySelectorAll("nav.tabs a").forEach(a => a.classList.toggle("on", a.dataset.tab === id));
  document.querySelectorAll("section.tab").forEach(s => s.hidden = s.id !== "tab-" + id);
  actual = id;
  const m = PESTANAS[id];
  if (!m.listo) {
    const sec = $("tab-" + id);
    sec.querySelector(".cargando").hidden = false;
    try { await m.iniciar(); m.listo = true; }
    catch (e) { sec.querySelector(".cargando").textContent = "No se pudieron cargar los datos: " + e; console.error(e); return; }
    sec.querySelector(".cargando").hidden = true;
    sec.querySelector(".contenido").hidden = false;
  }
  m.render();
}
window.addEventListener("hashchange", () => mostrar(location.hash.slice(1)));
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => actual && PESTANAS[actual].listo && PESTANAS[actual].render());
document.addEventListener("DOMContentLoaded", () => {
  const va = $("ver-anios");
  if (va) va.onchange = () => { verAnios = va.checked; Object.keys(ultimosArgs).forEach(id => { if ($(id)?.offsetParent) redibujar(id); }); };
  const g = $("ver-gobiernos");
  if (g) g.onchange = () => { verGobiernos = g.checked; Object.keys(ultimosArgs).forEach(id => { if ($(id)?.offsetParent) redibujar(id); }); };
  mostrar(location.hash.slice(1) || "resumen");
});
