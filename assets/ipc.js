// Pestaña: Inflación (IPC)
registrar("ipc", (() => {
  const st = {serie: {}, meta: {}, hijos: {}, fechas: [], mes: null, medida: "contrib_anual", nodo: "IPC_TOTAL", orden: {col: "v", dir: -1}};
  const ETQ = {contrib_anual: "Aporte a la inflación anual (pp)", var_anual: "Variación anual (%)", contrib_mensual: "Aporte del mes (pp)", var_mensual: "Variación del mes (%)"};
  const EXPL = {
    contrib_anual: "Puntos porcentuales de la inflación anual que explica cada categoría. Suman el total.",
    var_anual: "Cuánto subieron los precios de cada categoría frente al mismo mes del año anterior.",
    contrib_mensual: "Puntos porcentuales de la variación del mes que explica cada categoría.",
    var_mensual: "Cuánto subieron los precios de cada categoría frente al mes anterior."};
  const val = (id, med, f) => { const s = st.serie[id + "|" + med]; return s ? s[f] : undefined; };
  const nombre = id => id === "IPC_TOTAL" ? "Total" : st.meta[id].nombre;
  function padre(s) {
    if (s.nivel === "division") return "IPC_TOTAL";
    if (s.nivel === "grupo") return "IPC_DIV_" + s.codigo_dane.slice(0, 2);
    if (s.nivel === "subclase") return "IPC_GRU_" + s.codigo_dane.slice(0, 3);
    return null;
  }
  function camino(id) { const out = []; let s = st.meta[id]; while (s) { out.unshift(s.id_serie); const p = padre(s); s = p ? st.meta[p] : null; } return out; }
  const hijosDe = id => st.hijos[id] || st.hijos[padre(st.meta[id])];
  const ir = id => { st.nodo = id; render(); };

  async function iniciar() {
    const [series, datos] = await Promise.all([csv("datos/ipc/series.csv"), csv("datos/ipc/datos.csv")]);
    const fechas = new Set();
    for (const r of datos) { (st.serie[r.id_serie + "|" + r.medida] ??= {})[r.fecha] = +r.valor; fechas.add(r.fecha); }
    st.fechas = [...fechas].sort();
    for (const s of series) { st.meta[s.id_serie] = s; const p = padre(s); if (p) (st.hijos[p] ??= []).push(s.id_serie); }
    st.mes = st.fechas.at(-1);
    opciones($("ipc-mes"), st.fechas.slice().reverse().map(f => [f, etqMesLargo(f)]), st.mes);
    $("ipc-mes").onchange = e => { st.mes = e.target.value; render(); };
    seg("ipc-medida", v => { st.medida = v; render(); });
    $("ipc-ultima").textContent = "Último dato: " + etqMesLargo(st.fechas.at(-1));
  }

  function render() {
    const f = st.mes, i = st.fechas.indexOf(f), prev = st.fechas[i - 1];
    const a = val("IPC_TOTAL", "var_anual", f), pa = prev ? val("IPC_TOTAL", "var_anual", prev) : null;
    $("ipc-k1").textContent = fmt(a) + "%";
    $("ipc-k1d").innerHTML = pa == null ? "" : (a >= pa ? `<span class="pos">▲ ${fmt(a - pa)} pp</span>` : `<span class="neg">▼ ${fmt(pa - a)} pp</span>`) + ` vs ${etqMes(prev)}`;
    const m = val("IPC_TOTAL", "var_mensual", f), pm = prev ? val("IPC_TOTAL", "var_mensual", prev) : null;
    $("ipc-k2").textContent = fmt(m) + "%";
    $("ipc-k2d").textContent = pm == null ? "" : `${etqMes(prev)}: ${fmt(pm)}%`;
    $("ipc-k3").textContent = fmt(val("IPC_TOTAL", "var_ano_corrido", f)) + "%";
    const divs = st.hijos.IPC_TOTAL.map(id => [id, val(id, "contrib_anual", f)]).filter(x => x[1] != null).sort((x, y) => y[1] - x[1]);
    $("ipc-k4").textContent = divs.length ? nombre(divs[0][0]) : "–";
    $("ipc-k4d").textContent = divs.length ? `aporta ${fmt(divs[0][1])} pp de ${fmt(a)}%` : "sin dato de aportes este mes";

    const c = camino(st.nodo);
    $("ipc-crumbs").innerHTML = c.map((id, k) => k === c.length - 1 ? `<strong>${nombre(id)}</strong>` : `<a data-id="${id}">${nombre(id)}</a><span class="sep">›</span>`).join(" ");
    $("ipc-crumbs").querySelectorAll("a").forEach(x => x.onclick = () => ir(x.dataset.id));
    $("ipc-explica").textContent = EXPL[st.medida];

    const items = hijosDe(st.nodo).map(id => ({id, n: nombre(id), v: val(id, st.medida, f), resaltar: id === st.nodo})).filter(x => x.v != null).sort((x, y) => y.v - x.v);
    barras("ipc-bar", items, {unidad: st.medida.startsWith("contrib") ? " pp" : "%", etiqueta: ETQ[st.medida], alClic: x => ir(x.id)});

    const ds = [{label: "Total", data: st.fechas.map(x => val("IPC_TOTAL", "var_anual", x) ?? null), color: css("--muted")}];
    if (st.nodo !== "IPC_TOTAL") ds.push({label: nombre(st.nodo), data: st.fechas.map(x => val(st.nodo, "var_anual", x) ?? null), color: css("--accent"), ancho: 2.5});
    $("ipc-hist-t").textContent = st.nodo === "IPC_TOTAL" ? "Inflación anual en el tiempo" : `${nombre(st.nodo)} frente al total`;
    lineas("ipc-linea", st.fechas, ds, {unidad: "%"});

    const cols = [["n", "Categoría"], ["vm", "Var. mes %"], ["va", "Var. anual %"], ["cm", "Aporte mes pp"], ["ca", "Aporte anual pp"]];
    const rows = hijosDe(st.nodo).map(id => ({id, n: nombre(id), vm: val(id, "var_mensual", f), va: val(id, "var_anual", f), cm: val(id, "contrib_mensual", f), ca: val(id, "contrib_anual", f)}));
    const k = st.orden.col === "v" ? {contrib_anual: "ca", var_anual: "va", contrib_mensual: "cm", var_mensual: "vm"}[st.medida] : st.orden.col;
    rows.sort((x, y) => k === "n" ? x.n.localeCompare(y.n) * -st.orden.dir : ((y[k] ?? -1e9) - (x[k] ?? -1e9)) * -st.orden.dir);
    const t = $("ipc-tabla");
    t.innerHTML = `<thead><tr>${cols.map(c => `<th data-c="${c[0]}">${c[1]}</th>`).join("")}</tr></thead><tbody>` +
      rows.map(r => `<tr class="click" data-id="${r.id}"><td>${r.id === st.nodo ? "<strong>" + r.n + "</strong>" : r.n}</td>${["vm", "va", "cm", "ca"].map(c => `<td class="${clsSigno(r[c])}">${fmt(r[c])}</td>`).join("")}</tr>`).join("") + "</tbody>";
    t.querySelectorAll("tr.click").forEach(tr => tr.onclick = () => ir(tr.dataset.id));
    t.querySelectorAll("th").forEach(th => th.onclick = () => { const c = th.dataset.c; st.orden = {col: c, dir: st.orden.col === c ? -st.orden.dir : -1}; render(); });
  }
  return {iniciar, render};
})());
