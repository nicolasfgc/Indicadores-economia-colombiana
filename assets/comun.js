// Utilidades compartidas por todas las pestañas del explorador.
const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const MESES_L = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const PALETA = () => ["--s1","--s2","--s3","--s4","--s5","--s6"].map(css);
const fmt = (v, d = 2) => v == null || isNaN(v) ? "–" : Number(v).toLocaleString("es-CO", {minimumFractionDigits: d, maximumFractionDigits: d});
const etqMes = f => { const [y, m] = f.split("-"); return `${MESES[+m - 1]} ${y}`; };
const etqMesLargo = f => { const [y, m] = f.split("-"); return `${MESES_L[+m - 1]} ${y}`; };
const titulo = s => s ? s.toLowerCase().replace(/(^|[\s,(\/-])([a-záéíóúñü])/g, (a, b, c) => b + c.toUpperCase()).replace(/\b(De|Del|La|Las|Los|Y|E|En|Para|Por|A|El|Al|Con|Sin)\b/g, w => w.toLowerCase()) : s;
const $ = id => document.getElementById(id);
const clsSigno = v => v == null ? "" : v > 0 ? "pos" : v < 0 ? "neg" : "";

// Plata en millones de pesos -> texto corto
function plata(millones, d = 1) {
  if (millones == null || isNaN(millones)) return "–";
  const a = Math.abs(millones), s = millones < 0 ? "−" : "";
  if (a >= 1e6) return `${s}$${fmt(a / 1e6, d)} billones`;
  if (a >= 1e3) return `${s}$${fmt(a / 1e3, a >= 1e5 ? 0 : d)} mil millones`;
  return `${s}$${fmt(a, 0)} millones`;
}

const cache = {};
async function json(url) {
  if (!cache[url]) cache[url] = fetch(url).then(r => { if (!r.ok) throw new Error(url + ": " + r.status); return r.json(); });
  return cache[url];
}
function csv(url) {
  if (!cache[url]) cache[url] = new Promise((ok, err) => Papa.parse(url, {download: true, header: true, skipEmptyLines: true, complete: r => ok(r.data), error: err}));
  return cache[url];
}

// Botones segmentados: <div class="seg" id=...><button data-v=...>
function seg(id, alCambiar) {
  const el = $(id);
  el.querySelectorAll("button").forEach(b => b.onclick = () => {
    el.querySelectorAll("button").forEach(x => x.classList.remove("on"));
    b.classList.add("on");
    alCambiar(b.dataset.v);
  });
}
function opciones(sel, items, actual) {
  sel.innerHTML = items.map(([v, t]) => `<option value="${v}"${v == actual ? " selected" : ""}>${t}</option>`).join("");
}

// ------------------------------------------------------------ gráficos
const graficos = {};
function dibujar(canvasId, config) {
  if (graficos[canvasId]) graficos[canvasId].destroy();
  graficos[canvasId] = new Chart($(canvasId), config);
  return graficos[canvasId];
}

// Barras horizontales ordenadas; items = [{id, n, v, resaltar}]
function barras(canvasId, items, {unidad = "", alClic = null, etiqueta = "", fmtValor = null, alto = 26} = {}) {
  const box = $(canvasId).parentElement;
  box.style.height = Math.max(160, items.length * alto + 50) + "px";
  const up = css("--up"), down = css("--down"), acc = css("--accent");
  const f = fmtValor || (v => `${fmt(v)}${unidad}`);
  return dibujar(canvasId, {
    type: "bar",
    data: {labels: items.map(x => x.n), datasets: [{data: items.map(x => x.v), backgroundColor: items.map(x => x.resaltar ? acc : (x.v >= 0 ? up : down)), borderRadius: 4, barThickness: Math.min(18, alto - 8)}]},
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false, animation: {duration: 250},
      plugins: {legend: {display: false}, tooltip: {callbacks: {label: c => f(c.raw)}}},
      scales: {
        x: {grid: {color: css("--line")}, ticks: {color: css("--muted")}, title: {display: !!etiqueta, text: etiqueta, color: css("--muted")}},
        y: {grid: {display: false}, ticks: {color: css("--ink"), autoSkip: false, callback(v) { const t = this.getLabelForValue(v); return t.length > 40 ? t.slice(0, 38) + "…" : t; }}}
      },
      onClick: (e, el) => { if (el.length && alClic) alClic(items[el[0].index]); },
      onHover: (e, el) => { e.native.target.style.cursor = el.length && alClic ? "pointer" : "default"; }
    }
  });
}

// Líneas; series = [{label, data, color, dash, ancho}]; etiquetasX = fechas o años
function lineas(canvasId, etiquetasX, series, {unidad = "", fmtX = etqMes, marcas = [], fmtValor = null, eje0 = false} = {}) {
  const pal = PALETA();
  const f = fmtValor || (v => `${fmt(v)}${unidad}`);
  return dibujar(canvasId, {
    type: "line",
    data: {labels: etiquetasX, datasets: series.map((s, i) => ({label: s.label, data: s.data, borderColor: s.color || pal[i % pal.length], backgroundColor: "transparent",
      borderWidth: s.ancho || 2, borderDash: s.dash || [], pointRadius: 0, tension: .2, spanGaps: true}))},
    options: {
      responsive: true, maintainAspectRatio: false, animation: {duration: 250}, interaction: {mode: "index", intersect: false},
      plugins: {legend: {display: series.length > 1, labels: {color: css("--ink"), boxWidth: 14}},
        tooltip: {callbacks: {title: c => fmtX(etiquetasX[c[0].dataIndex]), label: c => `${c.dataset.label}: ${f(c.raw)}`}}},
      scales: {x: {grid: {display: false}, ticks: {color: css("--muted"), maxTicksLimit: 10, callback: (v, i) => fmtX(etiquetasX[i])}},
               y: {beginAtZero: eje0, grid: {color: css("--line")}, ticks: {color: css("--muted"), callback: v => f(v)}}}
    },
    plugins: [{id: "marcas", afterDatasetsDraw(chart) {   // líneas verticales con etiqueta (p. ej. cambios de gobierno)
      if (!marcas.length) return;
      const {ctx, chartArea: a, scales: {x}} = chart;
      ctx.save(); ctx.strokeStyle = css("--muted"); ctx.fillStyle = css("--muted"); ctx.setLineDash([3, 3]); ctx.font = "11px Inter, sans-serif";
      marcas.forEach(m => { const i = etiquetasX.indexOf(m.x); if (i < 0) return; const px = x.getPixelForValue(i);
        ctx.beginPath(); ctx.moveTo(px, a.top); ctx.lineTo(px, a.bottom); ctx.stroke(); ctx.fillText(m.t, px + 3, a.top + 10); });
      ctx.restore();
    }}]
  });
}

// ------------------------------------------------------------ pestañas
const PESTANAS = {};
function registrar(id, modulo) { PESTANAS[id] = modulo; }
let actual = null;
async function mostrar(id) {
  if (!PESTANAS[id]) id = "ipc";
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
document.addEventListener("DOMContentLoaded", () => mostrar(location.hash.slice(1) || "ipc"));
