// Pestaña: Actividad económica (ISE) — primero cómo va la economía, luego qué sectores la mueven
registrar("ise", (() => {
  const st = {d: null, version: "9", mes: null, medida: "var_anual_original", cat: null};
  const ETQ = {var_anual_original: "Crecimiento anual (%)", var_anual_desest: "Crecimiento anual sin estacionalidad (%)", var_mensual_desest: "Crecimiento frente al mes anterior (%)"};
  const EXPL = {
    var_anual_original: "Cuánto creció cada actividad frente al mismo mes del año anterior, tal como se midió.",
    var_anual_desest: "Lo mismo, quitando efectos de temporada y de días hábiles.",
    var_mensual_desest: "Cuánto creció frente al mes inmediatamente anterior, sin efectos de temporada: la señal más rápida de un cambio de rumbo."};
  const meta = id => st.d.series.find(s => s.id_serie === id);
  const v = (id, med, f) => { const a = st.d.valores[id]?.[med]; return a ? a[st.d.fechas.indexOf(f)] : null; };
  const T = () => `ISE${st.version}_TOTAL`;
  const deVersion = nivel => st.d.series.filter(s => s.version.startsWith(st.version + " ") && s.nivel === nivel);
  const ultimoMes = () => { const t = st.d.valores[T()].var_anual_original; for (let i = t.length - 1; i >= 0; i--) if (t[i] != null) return st.d.fechas[i]; };
  const colorCrec = x => x.v >= 0 ? css("--down") : css("--up");
  let per = null, selCat = null;

  async function iniciar() {
    st.d = await json("web/ise.json");
    seg("ise-version", x => { st.version = x; st.cat = null; armar(); render(); });
    seg("ise-medida", x => { st.medida = x; render(); });
    armar();
  }
  function armar() {
    const u = ultimoMes(), fs = st.d.fechas.filter(f => f <= u && v(T(), "var_anual_original", f) != null);
    if (!st.mes || st.mes > u) st.mes = u;
    per = periodo("ise-periodo", fs, st.mes, f => { st.mes = f; render(); });
    $("ise-ultima").textContent = `Último dato (${st.version} actividades): ${etqMesLargo(u)}`;
    const items = [...deVersion("gran_rama"), ...deVersion("agrupacion")].map(s => [s.id_serie, (s.nivel === "gran_rama" ? "" : "  · ") + s.nombre_corto]);
    selCat = selectorCategoria("ise-cat", [{items}], id => { st.cat = id; historia(); }, {total: "Toda la economía", otra: "Un sector"});
  }

  function historia() {
    const fs = st.d.fechas.filter(f => f <= ultimoMes()), t = T(), c = st.cat;
    const ds = c ? [{label: "Toda la economía", data: fs.map(f => v(t, "var_anual_original", f)), color: css("--muted"), ancho: 1.6},
                    {label: meta(c).nombre_corto, data: fs.map(f => v(c, "var_anual_original", f)), color: css("--accent"), ancho: 2.5}]
                 : [{label: "Crecimiento anual", data: fs.map(f => v(t, "var_anual_original", f)), color: css("--muted"), ancho: 1.6},
                    {label: "Sin estacionalidad", data: fs.map(f => v(t, "var_anual_desest", f)), color: css("--accent"), ancho: 2.5}];
    $("ise-hist-t").textContent = c ? `${meta(c).nombre_corto} frente a toda la economía` : "La economía en el tiempo";
    serie("ise-hist", fs, ds, {unidad: "%", referencias: [{y: 0, t: ""}], despues: (i0, i1) => interpretar(fs, i0, i1)});
    const id = c || t;
    $("ise-nivel-t").textContent = `Nivel de actividad: ${meta(id).nombre_corto}`;
    serie("ise-nivel", fs, [{label: "Original", data: fs.map(f => v(id, "indice_original", f)), color: css("--muted"), ancho: 1.4},
                            {label: "Sin estacionalidad", data: fs.map(f => v(id, "indice_desest", f)), color: css("--accent"), ancho: 2.5}], {fmtValor: x => fmt(x, 1)});
  }
  function interpretar(fs, i0, i1) {
    const id = st.cat || T(), nom = st.cat ? meta(st.cat).nombre_corto.toLowerCase() : "la economía";
    const tramo = fs.slice(i0, i1 + 1).map(f => [v(id, "var_anual_original", f), f]).filter(x => x[0] != null);
    if (!tramo.length) return;
    const prom = tramo.reduce((a, b) => a + b[0], 0) / tramo.length;
    const min = tramo.reduce((a, b) => b[0] < a[0] ? b : a), max = tramo.reduce((a, b) => b[0] > a[0] ? b : a);
    const neg = tramo.filter(x => x[0] < 0).length;
    $("ise-hist-txt").innerHTML = `Entre <strong>${etqMes(tramo[0][1])}</strong> y <strong>${etqMes(tramo.at(-1)[1])}</strong> ${nom} creció en promedio <strong>${fmt(prom)}%</strong> anual. ` +
      `El peor mes fue ${etqMes(min[1])} (${fmt(min[0])}%, gobierno ${gobiernoDe(min[1])}) y el mejor ${etqMes(max[1])} (${fmt(max[0])}%). ` +
      `Hubo ${neg} ${neg === 1 ? "mes" : "meses"} de caída frente al año anterior.`;
  }

  const verEnTiempo = id => { selCat.set(id); irA("ise-paso1b"); };

  function render() {
    const f = st.mes, t = T();
    const va = v(t, "var_anual_original", f), vd = v(t, "var_mensual_desest", f), ac = v(t, "var_ano_corrido_original", f);
    $("ise-k1").textContent = fmt(va) + "%"; $("ise-k1").className = "v " + (va < 0 ? "pos" : "");
    $("ise-k1d").textContent = `frente a ${etqMes(st.d.fechas[st.d.fechas.indexOf(f) - 12] || f)}`;
    $("ise-k2").textContent = fmt(vd) + "%"; $("ise-k2").className = "v " + (vd < 0 ? "pos" : "");
    $("ise-k3").textContent = fmt(ac) + "%";
    const ag = deVersion("agrupacion").map(s => [s, v(s.id_serie, "var_anual_original", f)]).filter(x => x[1] != null).sort((a, b) => a[1] - b[1]);
    $("ise-k4").textContent = ag.length ? ag[0][0].nombre_corto : "–";
    $("ise-k4d").textContent = ag.length ? `${fmt(ag[0][1])}% anual` : "";
    historia();

    $("ise-paso2-t").textContent = `¿Qué sectores jalaron y cuáles frenaron en ${etqMesLargo(f)}?`;
    $("ise-explica").textContent = EXPL[st.medida];
    const items = deVersion("agrupacion").map(s => ({id: s.id_serie, n: s.nombre_corto, v: v(s.id_serie, st.medida, f)})).filter(x => x.v != null).sort((a, b) => b.v - a.v);
    barras("ise-bar", items, {unidad: "%", etiqueta: ETQ[st.medida], alClic: x => verEnTiempo(x.id), colores: colorCrec});
    const filas = [...deVersion("gran_rama"), ...deVersion("agrupacion")];
    $("ise-tabla").innerHTML = `<thead><tr><th>Sector</th><th>Anual %</th><th>Anual sin estacionalidad %</th><th>Frente al mes anterior %</th><th></th></tr></thead><tbody>` +
      filas.map(s => { const a = v(s.id_serie, "var_anual_original", f), b = v(s.id_serie, "var_anual_desest", f), c = v(s.id_serie, "var_mensual_desest", f);
        const cl = x => x == null ? "" : x < 0 ? "pos" : "";
        return `<tr><td>${s.nivel === "gran_rama" ? "<strong>" + s.nombre_corto + "</strong>" : s.nombre_corto}</td><td class="${cl(a)}">${fmt(a)}</td><td class="${cl(b)}">${fmt(b)}</td><td class="${cl(c)}">${fmt(c)}</td>
          <td class="acciones"><button class="ver sec" data-id="${s.id_serie}">En el tiempo</button></td></tr>`; }).join("") + "</tbody>";
    $("ise-tabla").querySelectorAll("button.ver").forEach(b => b.onclick = () => verEnTiempo(b.dataset.id));
  }
  return {iniciar, render};
})());
