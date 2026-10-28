// Pestaña: Actividad económica (ISE)
registrar("ise", (() => {
  const st = {d: null, version: "9", mes: null, medida: "var_anual_original", nodo: null};
  const ETQ = {var_anual_original: "Crecimiento anual, serie original (%)", var_anual_desest: "Crecimiento anual, serie desestacionalizada (%)", var_mensual_desest: "Crecimiento frente al mes anterior, desestacionalizado (%)"};
  const EXPL = {
    var_anual_original: "Cuánto creció cada actividad frente al mismo mes del año anterior, tal como se midió.",
    var_anual_desest: "Lo mismo, pero quitando efectos de temporada y de días hábiles: compara meses con el mismo número de días laborales.",
    var_mensual_desest: "Cuánto creció frente al mes inmediatamente anterior, sin efectos de temporada. Es la señal más rápida de un cambio de rumbo."};
  const meta = id => st.d.series.find(s => s.id_serie === id);
  const v = (id, med, f) => { const a = st.d.valores[id]?.[med]; return a ? a[st.d.fechas.indexOf(f)] : null; };
  const total = () => `ISE${st.version}_TOTAL`;
  const hijos = id => st.d.series.filter(s => s.padre === id).map(s => s.id_serie);
  const ultimoMes = () => { const t = st.d.valores[total()].var_anual_original; for (let i = t.length - 1; i >= 0; i--) if (t[i] != null) return st.d.fechas[i]; };
  function camino(id) { const out = []; let s = meta(id); while (s) { out.unshift(s.id_serie); s = s.padre ? meta(s.padre) : null; } return out; }

  async function iniciar() {
    st.d = await json("web/ise.json");
    seg("ise-version", x => { st.version = x; st.nodo = total(); llenarMeses(); render(); });
    seg("ise-medida", x => { st.medida = x; render(); });
    $("ise-mes").onchange = e => { st.mes = e.target.value; render(); };
    st.nodo = total(); llenarMeses();
  }
  function llenarMeses() {
    const u = ultimoMes();
    const fs = st.d.fechas.filter(f => f <= u).reverse();
    if (!st.mes || st.mes > u) st.mes = u;
    opciones($("ise-mes"), fs.map(f => [f, etqMesLargo(f)]), st.mes);
    $("ise-ultima").textContent = `Último dato (${st.version} agrupaciones): ${etqMesLargo(u)}`;
  }

  function render() {
    const f = st.mes, T = total();
    const va = v(T, "var_anual_original", f), vd = v(T, "var_mensual_desest", f), ac = v(T, "var_ano_corrido_original", f);
    $("ise-k1").textContent = fmt(va) + "%"; $("ise-k1").className = "v " + clsSigno(va);
    $("ise-k1d").textContent = `frente a ${etqMes(st.d.fechas[st.d.fechas.indexOf(f) - 12] || f)}`;
    $("ise-k2").textContent = fmt(vd) + "%"; $("ise-k2").className = "v " + clsSigno(vd);
    $("ise-k3").textContent = fmt(ac) + "%";
    const ag = st.d.series.filter(s => s.version.startsWith(st.version) && s.nivel === "agrupacion").map(s => [s, v(s.id_serie, "var_anual_original", f)]).filter(x => x[1] != null).sort((a, b) => a[1] - b[1]);
    $("ise-k4").textContent = ag.length ? ag[0][0].nombre_corto : "–";
    $("ise-k4d").textContent = ag.length ? `${fmt(ag[0][1])}% anual` : "";

    const c = camino(st.nodo);
    $("ise-crumbs").innerHTML = c.map((id, k) => k === c.length - 1 ? `<strong>${meta(id).nombre_corto}</strong>` : `<a data-id="${id}">${meta(id).nombre_corto}</a><span class="sep">›</span>`).join(" ");
    $("ise-crumbs").querySelectorAll("a").forEach(x => x.onclick = () => { st.nodo = x.dataset.id; render(); });
    $("ise-explica").textContent = EXPL[st.medida];
    let lista = hijos(st.nodo);
    if (!lista.length) lista = hijos(meta(st.nodo).padre);
    // en el nivel total se muestran grandes ramas y agrupaciones juntas para ver todo de una
    if (st.nodo === T) lista = st.d.series.filter(s => s.version.startsWith(st.version) && s.nivel === "agrupacion").map(s => s.id_serie);
    const items = lista.map(id => ({id, n: meta(id).nombre_corto, v: v(id, st.medida, f), resaltar: id === st.nodo})).filter(x => x.v != null).sort((a, b) => b.v - a.v);
    barras("ise-bar", items, {unidad: "%", etiqueta: ETQ[st.medida], alClic: x => { st.nodo = x.id; render(); }});

    const fs = st.d.fechas.filter(x => x <= ultimoMes());
    const sel = st.nodo === T ? null : st.nodo;
    const ds = [{label: "ISE total", data: fs.map(x => v(T, "var_anual_original", x)), color: css("--muted")}];
    if (sel) ds.push({label: meta(sel).nombre_corto, data: fs.map(x => v(sel, "var_anual_original", x)), color: css("--accent"), ancho: 2.5});
    else ds.push({label: "ISE total desestacionalizado", data: fs.map(x => v(T, "var_anual_desest", x)), color: css("--accent"), ancho: 2.5});
    $("ise-hist-t").textContent = sel ? `${meta(sel).nombre_corto} frente al total` : "Crecimiento anual de la economía";
    lineas("ise-linea", fs, ds, {unidad: "%"});

    const idx = (id, med) => fs.map(x => v(id, med, x));
    lineas("ise-indice", fs, [{label: "Original", data: idx(sel || T, "indice_original"), color: css("--muted")},
                              {label: "Desestacionalizada", data: idx(sel || T, "indice_desest"), color: css("--accent"), ancho: 2.5}], {fmtValor: x => fmt(x, 1)});
    $("ise-indice-t").textContent = `Nivel de actividad: ${meta(sel || T).nombre_corto} (2015 = 100)`;
  }
  return {iniciar, render};
})());
