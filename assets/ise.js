// Pestaña: Actividad económica (ISE) — primero cómo va la economía, luego qué sectores la mueven
registrar("ise", (() => {
  const st = {d: null, version: "9", mes: null, medida: "var_anual_original", cats: [], orden: "grupo"};
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
  // Explicación en lenguaje sencillo de los tres grandes grupos del DANE
  const GRUPO = {PRI: {t: "Actividades primarias", d: "sacan recursos directamente de la naturaleza: campo y minería"},
                 SEC: {t: "Actividades secundarias", d: "transforman materias primas en productos o construyen: industria y construcción"},
                 TER: {t: "Actividades terciarias", d: "prestan servicios: comercio, transporte, bancos, gobierno, educación, salud y también electricidad, gas y agua"}};
  const claveGrupo = id => id.split("_")[1];
  const grupoDe = id => { const s = meta(id); return s.nivel === "gran_rama" ? claveGrupo(id) : claveGrupo(s.padre); };
  // gran rama seguida de sus sectores, en el orden primarias → secundarias → terciarias
  const agrupados = () => ["PRI", "SEC", "TER"].map(k => ({k, rama: `ISE${st.version}_${k}`, hijos: deVersion("agrupacion").filter(x => x.padre === `ISE${st.version}_${k}`)}));
  let per = null, selCat = null;

  async function iniciar() {
    st.d = await json("web/ise.json");
    seg("ise-version", x => { st.version = x; st.cats = []; armar(); render(); });
    seg("ise-orden", x => { st.orden = x; detalle(); });
    seg("ise-medida", x => { st.medida = x; detalle(); });
    armar();
  }
  function armar() {
    if ($("ise-tiempo")) $("ise-tiempo").hidden = true;
    const u = ultimoMes(), fs = st.d.fechas.filter(f => f <= u && v(T(), "var_anual_original", f) != null);
    if (!st.mes || st.mes > u) st.mes = u;
    per = periodo("ise-periodo", fs, st.mes, f => { st.mes = f; detalle(); });
    $("ise-ultima").textContent = `Último dato (${st.version} actividades): ${etqMesLargo(u)}`;
    const arbol = agrupados().map(g => ({id: g.rama, t: GRUPO[g.k].t, nivel: GRUPO[g.k].d.split(":")[1].trim(),
      hijos: g.hijos.map(h => ({id: h.id_serie, t: h.nombre_corto}))}));
    selCat = selectorVarias("ise-cat", arbol, ids => { st.cats = ids; historia(); }, {total: "Toda la economía", otra: "Comparar sectores",
      ayuda: "Primero están los tres grandes grupos; toca ▸ para ver sus sectores. Puedes agregar un grupo completo o un sector."});
  }

  const nombreSel = id => meta(id).nivel === "gran_rama" ? meta(id).nombre_corto : `${meta(id).nombre_corto} (${GRUPO[grupoDe(id)].t.split(" ")[1]})`;
  function historia() {
    const fs = st.d.fechas.filter(f => f <= ultimoMes()), t = T(), c = st.cats;
    const ds = c.length ? [{label: "Toda la economía", data: fs.map(f => v(t, "var_anual_original", f)), color: css("--muted"), ancho: 1.6, dash: [4, 3]},
                           ...c.map((id, k) => ({label: nombreSel(id), data: fs.map(f => v(id, "var_anual_original", f)), color: DISTINTOS()[k], ancho: 2.5}))]
                        : [{label: "Crecimiento anual", data: fs.map(f => v(t, "var_anual_original", f)), color: css("--muted"), ancho: 1.6},
                           {label: "Sin estacionalidad", data: fs.map(f => v(t, "var_anual_desest", f)), color: css("--accent"), ancho: 2.5}];
    $("ise-hist-t").textContent = c.length ? "Los sectores elegidos frente a toda la economía" : "La economía en el tiempo";
    serie("ise-hist", fs, ds, {unidad: "%", referencias: [{y: 0, t: ""}], despues: (i0, i1) => interpretar(fs, ds, i0, i1)});
    // nivel de actividad: el total o los sectores elegidos (sin estacionalidad, 2015 = 100)
    $("ise-nivel-t").textContent = c.length ? "Nivel de actividad de los sectores elegidos" : "Nivel de actividad: toda la economía";
    const dn = c.length ? c.map((id, k) => ({label: nombreSel(id), data: fs.map(f => v(id, "indice_desest", f)), color: DISTINTOS()[k], ancho: 2.5}))
      : [{label: "Original", data: fs.map(f => v(t, "indice_original", f)), color: css("--muted"), ancho: 1.4},
         {label: "Sin estacionalidad", data: fs.map(f => v(t, "indice_desest", f)), color: css("--accent"), ancho: 2.5}];
    serie("ise-nivel", fs, dn, {fmtValor: x => fmt(x, 1), referencias: c.length ? [{y: 100, t: "Nivel de 2015"}] : []});
  }
  function interpretar(fs, ds, i0, i1) {
    const res = d => { const tr = d.data.slice(i0, i1 + 1).map((x, k) => [x, fs[i0 + k]]).filter(x => x[0] != null); if (!tr.length) return null;
      return {prom: tr.reduce((a, b) => a + b[0], 0) / tr.length, min: tr.reduce((a, b) => b[0] < a[0] ? b : a), max: tr.reduce((a, b) => b[0] > a[0] ? b : a),
              neg: tr.filter(x => x[0] < 0).length, ult: tr.at(-1)}; };
    const per = `Entre <strong>${etqMes(fs[i0])}</strong> y <strong>${etqMes(fs[i1])}</strong>`;
    if (!st.cats.length) {
      const r = res(ds[0]); if (!r) return;
      $("ise-hist-txt").innerHTML = `${per} la economía creció en promedio <strong>${fmt(r.prom)}%</strong> anual. ` +
        `El peor mes fue ${etqMes(r.min[1])} (${fmt(r.min[0])}%, gobierno ${gobiernoDe(r.min[1])}) y el mejor ${etqMes(r.max[1])} (${fmt(r.max[0])}%). ` +
        `Hubo ${r.neg} ${r.neg === 1 ? "mes" : "meses"} de caída frente al año anterior.`;
      return;
    }
    const t = res(ds[0]);
    $("ise-hist-txt").innerHTML = `${per} toda la economía creció en promedio <strong>${fmt(t.prom)}%</strong> al año. En los sectores elegidos:<br>` +
      ds.slice(1).map(d => [d.label, res(d)]).filter(x => x[1]).map(([n, r]) =>
        `• <strong>${n}</strong>: ${r.prom >= 0 ? "creció" : "cayó"} en promedio ${fmt(Math.abs(r.prom))}% ${r.prom > t.prom + 0.05 ? "(más que la economía)" : r.prom < t.prom - 0.05 ? "(menos que la economía)" : "(igual que la economía)"}; ` +
        `tuvo ${r.neg} ${r.neg === 1 ? "mes" : "meses"} de caída y en ${etqMes(r.ult[1])} ${r.ult[0] >= 0 ? "creció" : "cayó"} ${fmt(Math.abs(r.ult[0]))}%.`).join("<br>");
  }

  // "En el tiempo": el sector frente a toda la economía, dentro de esta misma sección
  function verEnTiempo(id) {
    const F = st.d.fechas.filter(f => f <= ultimoMes()), t = T(), d = F.map(f => v(id, "var_anual_original", f)), tt = F.map(f => v(t, "var_anual_original", f));
    const nom = meta(id).nombre_corto;
    enElTiempo("ise-tiempo", `${nom}: crecimiento anual frente a toda la economía`, F,
      [{label: "Toda la economía", data: tt, color: css("--muted"), ancho: 1.6}, {label: nom, data: d, color: css("--accent"), ancho: 2.5}],
      {unidad: "%", referencias: [{y: 0, t: ""}], inicio: 60, texto: (i0, i1) => { const tr = d.slice(i0, i1 + 1).filter(x => x != null); if (!tr.length) return "";
        const prom = tr.reduce((a, b) => a + b, 0) / tr.length, neg = tr.filter(x => x < 0).length;
        return `Entre ${etqMes(F[i0])} y ${etqMes(F[i1])}, ${nom.toLowerCase()} creció en promedio <strong>${fmt(prom)}%</strong> al año y tuvo ${neg} ${neg === 1 ? "mes" : "meses"} de caída. En ${etqMesLargo(F[i1])} ${d[i1] >= 0 ? "creció" : "cayó"} ${fmt(Math.abs(d[i1]))}%, frente a ${fmt(tt[i1])}% de toda la economía.`; }});
  }

  function render() {
    const f = ultimoMes(), t = T();   // los datos de arriba son siempre los del último mes publicado
    const va = v(t, "var_anual_original", f), vd = v(t, "var_mensual_desest", f), ac = v(t, "var_ano_corrido_original", f);
    $("ise-k1").textContent = fmt(va) + "%"; $("ise-k1").className = "v " + (va < 0 ? "pos" : "");
    $("ise-k1d").textContent = `frente a ${etqMes(st.d.fechas[st.d.fechas.indexOf(f) - 12] || f)}`;
    $("ise-k2").textContent = fmt(vd) + "%"; $("ise-k2").className = "v " + (vd < 0 ? "pos" : "");
    $("ise-k3").textContent = fmt(ac) + "%";
    const ag = deVersion("agrupacion").map(s => [s, v(s.id_serie, "var_anual_original", f)]).filter(x => x[1] != null).sort((a, b) => a[1] - b[1]);
    $("ise-k4").textContent = ag.length ? ag[0][0].nombre_corto : "–";
    $("ise-k4d").textContent = ag.length ? `${fmt(ag[0][1])}% anual` : "";
    historia();
    detalle();
  }
  function detalle() {
    const f = st.mes;
    $("ise-paso2-t").textContent = `¿Qué sectores jalaron y cuáles frenaron en ${etqMesLargo(f)}?`;
    $("ise-explica").textContent = EXPL[st.medida];
    let items;
    if (st.orden === "grupo") items = agrupados().flatMap(g => [{id: g.rama, n: GRUPO[g.k].t.toUpperCase(), v: v(g.rama, st.medida, f), rama: true},
      ...g.hijos.map(h => ({id: h.id_serie, n: "   " + h.nombre_corto, v: v(h.id_serie, st.medida, f)})).sort((a, b) => (b.v ?? -1e9) - (a.v ?? -1e9))]).filter(x => x.v != null);
    else items = deVersion("agrupacion").map(s => ({id: s.id_serie, n: `${s.nombre_corto} (${GRUPO[grupoDe(s.id_serie)].t.split(" ")[1]})`, v: v(s.id_serie, st.medida, f)})).filter(x => x.v != null).sort((a, b) => b.v - a.v);
    barras("ise-bar", items, {unidad: "%", etiqueta: ETQ[st.medida], alClic: x => verEnTiempo(x.id),
      colores: colorCrec});
    const cl = x => x == null ? "" : x < 0 ? "pos" : "";
    const fila = (s, rama) => { const a = v(s.id_serie, "var_anual_original", f), b = v(s.id_serie, "var_anual_desest", f), c = v(s.id_serie, "var_mensual_desest", f);
      return `<tr${rama ? ' class="rama"' : ""}><td>${rama ? `<strong>${s.nombre_corto}</strong><span class="sub2">${GRUPO[claveGrupo(s.id_serie)].d.replace(/^./, x => x.toUpperCase())}</span>` : "&nbsp;&nbsp;&nbsp;" + s.nombre_corto}</td>` +
        `<td class="${cl(a)}">${fmt(a)}</td><td class="${cl(b)}">${fmt(b)}</td><td class="${cl(c)}">${fmt(c)}</td><td class="acciones"><button class="ver sec" data-id="${s.id_serie}">En el tiempo</button></td></tr>`; };
    $("ise-tabla").innerHTML = `<thead><tr><th>Sector</th><th>Anual %</th><th>Anual sin estacionalidad %</th><th>Frente al mes anterior %</th><th></th></tr></thead><tbody>` +
      agrupados().map(g => fila(meta(g.rama), true) + g.hijos.map(h => fila(h, false)).join("")).join("") + "</tbody>";
    $("ise-tabla").querySelectorAll("button.ver").forEach(b => b.onclick = () => verEnTiempo(b.dataset.id));
  }
  return {iniciar, render};
})());
