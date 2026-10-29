// Utilidades y componentes compartidos por todas las pestañas del explorador.
const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const MESES_L = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
// Gobiernos: [nombre, fecha de posesión]
const GOBIERNOS = [["Pastrana", "1998-08-07"], ["Uribe I", "2002-08-07"], ["Uribe II", "2006-08-07"], ["Santos I", "2010-08-07"],
                   ["Santos II", "2014-08-07"], ["Duque", "2018-08-07"], ["Petro", "2022-08-07"], ["De la Espriella", "2026-08-07"]];

const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const PALETA = () => ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8", "--s9", "--s10"].map(css);
// Para comparar varias categorías: solo colores que no se confunden entre sí (sin índigo ni violeta, parecidos al morado)
const DISTINTOS = () => ["--s1", "--s2", "--s4", "--s6", "--s5", "--s9"].map(css);
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
function selectorVarias(contId, arbol, alCambiar, {total = "Total", otra = "Comparar categorías", max = 6, ayuda = "", colorDe = k => DISTINTOS()[k]} = {}) {
  const c = $(contId);
  c.classList.add("selcat");
  const info = {};   // id -> {t, ruta}
  (function indexar(nodos, ruta) { for (const n of nodos) { if (n.id) info[n.id] = {t: n.t, ruta}; if (n.hijos) indexar(n.hijos, n.id || n.t ? [...ruta, n.t] : ruta); } })(arbol, []);
  const primero = (function buscar(ns) { for (const n of ns) { if (n.id) return n.id; const x = n.hijos && buscar(n.hijos); if (x) return x; } })(arbol);
  c.innerHTML = `<div class="seg"><button data-v="total" class="on">${total}</button><button data-v="cat">${otra}</button></div>
    <div class="varias" hidden>
      <div class="agregar"><button class="abrir" type="button">+ Agregar una categoría <span>▾</span></button>
        <div class="panel" hidden>
          ${ayuda ? `<p class="hint">${ayuda}</p>` : ""}
          <input type="search" placeholder="Buscar por nombre (por ejemplo: arroz, arriendo, gasolina)…">
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
      cont.innerHTML = res.length ? `<ul>${res.map(([id, v]) => `<li style="--p:0"><div class="fila"><span class="flecha"></span><button class="nombre${ids.includes(id) ? " ya" : ""}" data-id="${id}" ${ids.includes(id) ? "disabled" : ""}>${ids.includes(id) ? "✓ " : ""}${esc(v.t)}</button>` +
        `${v.ruta.length ? `<span class="cuenta">en ${esc(v.ruta.join(" › "))}</span>` : ""}</div></li>`).join("")}</ul>` : `<p class="hint">No hay categorías con ese nombre.</p>`;
    } else cont.innerHTML = `<ul>${arbol.map(n => nodoHTML(n, 0)).join("")}</ul>`;
    cont.querySelectorAll("[data-k]").forEach(b => b.onclick = () => { const k = b.dataset.k; abiertos.has(k) ? abiertos.delete(k) : abiertos.add(k); dibujarArbol(); });
    cont.querySelectorAll(".nombre[data-id]").forEach(b => b.onclick = () => agregar(b.dataset.id, true));
  }
  const cerrar = () => { panel.hidden = true; abrir.classList.remove("on"); };
  abrir.onclick = () => { if (ids.length >= max) return; panel.hidden = !panel.hidden; abrir.classList.toggle("on", !panel.hidden); if (!panel.hidden) { buscador.value = ""; dibujarArbol(); buscador.focus({preventScroll: true}); } };
  panel.querySelector(".cerrar").onclick = cerrar;
  buscador.oninput = dibujarArbol;
  document.addEventListener("click", e => { if (!panel.hidden && !caja.querySelector(".agregar").contains(e.target)) cerrar(); });
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
  const pos = css("--s4"), neg = css("--up");
  serie(canvasId, F, [
    {label: "Tasa del Banco de la República", data: t, color: css("--accent"), ancho: 2.5},
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
const graficos = {};
function dibujar(canvasId, config) {
  if (graficos[canvasId]) graficos[canvasId].destroy();
  graficos[canvasId] = new Chart($(canvasId), config);
  return graficos[canvasId];
}

// Barras horizontales ordenadas; items = [{id, n, v, resaltar, color}]
function barras(canvasId, items, {unidad = "", alClic = null, etiqueta = "", fmtValor = null, alto = 26, colores = null} = {}) {
  const box = $(canvasId).parentElement;
  box.style.height = Math.max(160, items.length * alto + 50) + "px";
  const up = css("--up"), down = css("--down"), acc = css("--accent");
  const f = fmtValor || (v => `${fmt(v)}${unidad}`);
  const col = colores || (x => x.resaltar ? acc : (x.v >= 0 ? up : down));
  return dibujar(canvasId, {
    type: "bar",
    data: {labels: items.map(x => x.n), datasets: [{data: items.map(x => x.v), backgroundColor: items.map(col), borderRadius: 4, barThickness: Math.min(18, alto - 8)}]},
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false, animation: {duration: 250},
      plugins: {legend: {display: false}, tooltip: {callbacks: {label: c => f(c.raw), footer: () => alClic ? "Toca para ver el detalle" : ""}}},
      scales: {
        x: {grid: {color: css("--line")}, ticks: {color: css("--muted")}, title: {display: !!etiqueta, text: etiqueta, color: css("--muted")}},
        y: {grid: {display: false}, ticks: {color: css("--ink"), autoSkip: false, callback(v) { const t = this.getLabelForValue(v); return t.length > 42 ? t.slice(0, 40) + "…" : t; }}}
      },
      onClick: (e, el) => { if (el.length && alClic) alClic(items[el[0].index]); },
      onHover: (e, el) => { e.native.target.style.cursor = el.length && alClic ? "pointer" : "default"; }
    }
  });
}

// Franjas de gobiernos detrás de las series
let verGobiernos = true;
const pluginGobiernos = {id: "gobiernos", beforeDatasetsDraw(chart, a, opts) {
  if (!verGobiernos || !opts || !opts.activo) return;
  const etq = chart.data.labels, {ctx, chartArea: area, scales: {x}} = chart;
  if (!etq.length) return;
  const paso = etq.length > 1 ? x.getPixelForValue(1) - x.getPixelForValue(0) : 20;
  let ini = 0;
  ctx.save(); ctx.font = "11px Inter, sans-serif"; ctx.textBaseline = "top";
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
// Líneas horizontales de referencia (p. ej. la meta de inflación)
const pluginReferencias = {id: "referencias", afterDatasetsDraw(chart, a, opts) {
  if (!opts || !opts.lineas || !opts.lineas.length) return;
  const {ctx, chartArea: area, scales: {y}} = chart;
  ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = css("--naranja"); ctx.fillStyle = css("--naranja"); ctx.font = "11px Inter, sans-serif";
  for (const r of opts.lineas) { const py = y.getPixelForValue(r.y); if (py < area.top || py > area.bottom) continue;
    ctx.beginPath(); ctx.moveTo(area.left, py); ctx.lineTo(area.right, py); ctx.stroke(); if (r.t) ctx.fillText(r.t, area.right - ctx.measureText(r.t).width - 4, py - 4); }
  ctx.restore();
}};

// Serie de tiempo con barra de rango y franjas de gobiernos.
// series = [{label, data, color, dash, ancho, tipo: "bar"}]; etiquetas = "AAAA-MM-01" (mensual) o "AAAA" (anual)
const rangos = {}, ultimosArgs = {};
function serie(canvasId, etiquetas, series, opts = {}) {
  ultimosArgs[canvasId] = [etiquetas, series, opts];
  const anual = etiquetas.length && etiquetas[0].length === 4;
  const n = etiquetas.length;
  let r = rangos[canvasId];
  if (!r || etiquetas.indexOf(r.d) < 0 || etiquetas.indexOf(r.h) < 0) {
    const hasta = n - 1, pasos = opts.inicio != null ? opts.inicio : (anual ? n : 120);
    r = rangos[canvasId] = {d: etiquetas[Math.max(0, hasta - pasos + 1)], h: etiquetas[hasta]};
  }
  const i0 = etiquetas.indexOf(r.d), i1 = etiquetas.indexOf(r.h);
  controlRango(canvasId, etiquetas, i0, i1, anual, opts.atajos);
  const et = etiquetas.slice(i0, i1 + 1);
  const pal = PALETA();
  const f = opts.fmtValor || (v => `${fmt(v)}${opts.unidad || ""}`);
  const fx = opts.fmtX || etqMes;
  if (opts.despues) setTimeout(() => opts.despues(i0, i1), 0);   // p. ej. actualizar el texto que interpreta el periodo visible
  return dibujar(canvasId, {
    type: "line",
    data: {labels: et, datasets: series.map((s, i) => {
      const c = s.color || pal[i % pal.length];
      const base = {label: s.label, data: s.data.slice(i0, i1 + 1), borderColor: c, order: s.tipo === "bar" ? 2 : 1};
      return s.tipo === "bar" ? {...base, type: "bar", backgroundColor: s.colores ? s.colores.slice(i0, i1 + 1) : c, borderWidth: 0, borderRadius: 2, yAxisID: s.eje || "y"}
        : {...base, backgroundColor: "transparent", borderWidth: s.ancho || 2, borderDash: s.dash || [], pointRadius: 0, tension: .2, spanGaps: true, yAxisID: s.eje || "y"};
    })},
    options: {
      responsive: true, maintainAspectRatio: false, animation: {duration: 200}, interaction: {mode: "index", intersect: false},
      plugins: {legend: {display: series.length > 1, labels: {color: css("--ink"), boxWidth: 14}},
        tooltip: {callbacks: {title: c => { const e = et[c[0].dataIndex]; const g = gobiernoDe(e); return fx(e) + (g ? ` · ${g}` : ""); },
                              label: c => `${c.dataset.label}: ${(c.dataset.yAxisID === "y2" && opts.fmtValor2 ? opts.fmtValor2 : f)(c.raw)}`}},
        gobiernos: {activo: opts.gobiernos !== false}, referencias: {lineas: opts.referencias || []}},
      scales: {x: {grid: {display: false}, ticks: {color: css("--muted"), maxTicksLimit: 10, callback: (v, i) => fx(et[i])}},
               y: {beginAtZero: !!opts.eje0, grid: {color: css("--line")}, ticks: {color: css("--muted"), callback: v => f(v)}},
               ...(series.some(s => s.eje === "y2") ? {y2: {position: "right", grid: {display: false}, ticks: {color: css("--muted"), callback: v => (opts.fmtValor2 || f)(v)}}} : {})}
    },
    plugins: [pluginGobiernos, pluginReferencias]
  });
}
function redibujar(canvasId) { const a = ultimosArgs[canvasId]; if (a) serie(canvasId, ...a); }

// Barra para escoger desde qué mes hasta qué mes (dos manijas) y atajos
function controlRango(canvasId, etiquetas, i0, i1, anual, atajosPropios) {
  let c = $(canvasId + "-rango");
  const n = etiquetas.length;
  if (!c) {
    c = document.createElement("div"); c.className = "rango"; c.id = canvasId + "-rango";
    $(canvasId).parentElement.after(c);
    const atajos = atajosPropios || (anual ? [["10 años", 10], ["20 años", 20], ["Todo", 0]] : [["1 año", 12], ["5 años", 60], ["10 años", 120], ["Todo", 0]]);
    c.innerHTML = `<div class="rango-top"><span class="rango-txt"></span><span class="rango-atajos">${atajos.map(([t, k]) => `<button data-k="${k}">${t}</button>`).join("")}</span></div>
      <div class="dual"><div class="pista"><div class="relleno"></div></div><input type="range" class="r0" min="0" step="1"><input type="range" class="r1" min="0" step="1"></div>`;
    const a = c.querySelector(".r0"), b = c.querySelector(".r1");
    const aplicar = () => {
      const et = ultimosArgs[canvasId][0];
      let x = +a.value, y = +b.value; if (x > y) [x, y] = [y, x];
      rangos[canvasId] = {d: et[x], h: et[y]}; redibujar(canvasId);
    };
    let pendiente = null;
    const alMover = () => { pintar(c, ultimosArgs[canvasId][0], +a.value, +b.value); if (!pendiente) pendiente = requestAnimationFrame(() => { pendiente = null; aplicar(); }); };
    a.oninput = alMover; b.oninput = alMover;
    c.querySelectorAll(".rango-atajos button").forEach(btn => btn.onclick = () => {
      const et = ultimosArgs[canvasId][0], k = +btn.dataset.k, h = et.length - 1;
      rangos[canvasId] = {d: et[k ? Math.max(0, h - k + 1) : 0], h: et[h]}; redibujar(canvasId);
    });
  }
  const a = c.querySelector(".r0"), b = c.querySelector(".r1");
  a.max = b.max = n - 1; a.value = i0; b.value = i1;
  pintar(c, etiquetas, i0, i1);
}
function pintar(c, et, x, y) {
  if (x > y) [x, y] = [y, x];
  const n = Math.max(1, et.length - 1);
  c.querySelector(".relleno").style.left = (x / n * 100) + "%";
  c.querySelector(".relleno").style.width = ((y - x) / n * 100) + "%";
  c.querySelector(".rango-txt").innerHTML = `Mostrando <strong>${etqMes(et[x])}</strong> a <strong>${etqMes(et[y])}</strong> · mueve las manijas para cambiar el periodo`;
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
  const g = $("ver-gobiernos");
  if (g) g.onchange = () => { verGobiernos = g.checked; Object.keys(ultimosArgs).forEach(id => { if ($(id)?.offsetParent) redibujar(id); }); };
  mostrar(location.hash.slice(1) || "resumen");
});
