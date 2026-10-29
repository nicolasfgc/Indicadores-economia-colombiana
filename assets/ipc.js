// Pestaña: Inflación (IPC) — primero el panorama, luego qué la explica
registrar("ipc", (() => {
  const st = {serie: {}, meta: {}, hijos: {}, fechas: [], mes: null, medida: "contrib_anual", nodo: "IPC_TOTAL", cat: null, H: null};
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
  let selCat = null;

  async function iniciar() {
    const [series, datos, H] = await Promise.all([csv("datos/ipc/series.csv"), csv("datos/ipc/datos.csv"), json("web/ipc_historico.json")]);
    st.H = H;
    const fechas = new Set();
    for (const r of datos) { (st.serie[r.id_serie + "|" + r.medida] ??= {})[r.fecha] = +r.valor; fechas.add(r.fecha); }
    st.fechas = [...fechas].sort();
    for (const s of series) { st.meta[s.id_serie] = s; const p = padre(s); if (p) (st.hijos[p] ??= []).push(s.id_serie); }
    st.mes = st.fechas.at(-1);
    periodo("ipc-periodo", st.fechas, st.mes, f => { st.mes = f; detalle(); });
    seg("ipc-medida", v => { st.medida = v; detalle(); });
    $("ipc-ultima").textContent = "Último dato: " + etqMesLargo(st.fechas.at(-1));
    // categorías para ver en el tiempo: divisiones, y dentro de cada una sus grupos y subclases
    const grupos = st.hijos.IPC_TOTAL.map(d => ({g: nombre(d), items: [[d, nombre(d) + " (división)"], ...(st.hijos[d] || []).flatMap(g => [[g, "  " + nombre(g)], ...(st.hijos[g] || []).map(s => [s, "      · " + nombre(s)])])]}));
    selCat = selectorCategoria("ipc-cat", grupos, id => { st.cat = id; historia(); }, {total: "Inflación total", otra: "Una categoría (desde 2019)"});
  }

  function historia() {
    const H = st.H;
    const ds = [{label: "Inflación total (anual)", data: H.var_anual, color: st.cat ? css("--muted") : css("--accent"), ancho: st.cat ? 1.6 : 2.5}];
    if (st.cat) ds.push({label: nombre(st.cat), data: H.fechas.map(f => val(st.cat, "var_anual", f) ?? null), color: css("--accent"), ancho: 2.5});
    serie("ipc-hist", H.fechas, ds, {unidad: "%", referencias: [{y: 3, t: "Meta 3%"}, {y: 4, t: "4%"}, {y: 2, t: "2%"}], inicio: 12 * 23, despues: interpretar});
  }
  function interpretar(i0, i1) {
    const H = st.H;
    const datos = st.cat ? H.fechas.map(f => val(st.cat, "var_anual", f) ?? null) : H.var_anual;
    const quien = st.cat ? `la inflación de ${nombre(st.cat).toLowerCase()}` : "la inflación";
    const tramo = datos.slice(i0, i1 + 1).map((v, k) => [v, H.fechas[i0 + k]]).filter(x => x[0] != null);
    if (tramo.length) {
      const prom = tramo.reduce((a, b) => a + b[0], 0) / tramo.length;
      const max = tramo.reduce((a, b) => b[0] > a[0] ? b : a), min = tramo.reduce((a, b) => b[0] < a[0] ? b : a);
      const dentro = tramo.filter(x => x[0] >= 2 && x[0] <= 4).length / tramo.length * 100;
      $("ipc-hist-txt").innerHTML = `Entre <strong>${etqMes(tramo[0][1])}</strong> y <strong>${etqMes(tramo.at(-1)[1])}</strong> ${quien} promedió <strong>${fmt(prom)}%</strong>. ` +
        `Lo más alto fue ${fmt(max[0])}% (${etqMes(max[1])}, gobierno ${gobiernoDe(max[1])}) y lo más bajo ${fmt(min[0])}% (${etqMes(min[1])}). ` +
        `Estuvo dentro del rango que busca el Banco de la República (entre 2% y 4%) en el ${fmt(dentro, 0)}% de los meses.`;
    }
  }

  const ir = id => { st.nodo = id; detalle(); irA("ipc-paso2"); };
  // "En el tiempo": la categoría frente al total, dentro de esta misma sección
  function verEnTiempo(id) {
    const H = st.H, F = H.fechas.filter(f => f >= "2019-01-01"), d = F.map(f => val(id, "var_anual", f) ?? null), t = F.map(f => H.var_anual[H.fechas.indexOf(f)]);
    enElTiempo("ipc-tiempo", `${nombre(id)}: inflación anual frente al total`, F,
      [{label: "Inflación total", data: t, color: css("--muted"), ancho: 1.6}, {label: nombre(id), data: d, color: css("--accent"), ancho: 2.5}],
      {unidad: "%", inicio: F.length, nota: "Variación anual de los precios de esta categoría desde 2019 (antes el DANE no publica este detalle). Toca otra barra o fila para cambiarla.",
       texto: (i0, i1) => { const a = d[i1], b = t[i1]; if (a == null) return "";
         return `En <strong>${etqMesLargo(F[i1])}</strong> los precios de ${nombre(id).toLowerCase()} subieron <strong>${fmt(a)}%</strong> en un año, ` +
           `${Math.abs(a - b) < 0.1 ? "lo mismo que" : a > b ? `${fmt(a - b)} puntos más que` : `${fmt(b - a)} puntos menos que`} la inflación total (${fmt(b)}%).`; }});
  }

  function render() {
    // los datos de arriba son siempre los del último mes publicado
    const f = st.fechas.at(-1), i = st.fechas.length - 1, prev = st.fechas[i - 1];
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
    historia();
    tasaVsInflacion("ipc-vs", "ipc-vs-txt");
    detalle();
  }

  // paso 3: qué la explica, para el mes escogido
  function detalle() {
    const f = st.mes;
    $("ipc-paso2-t").textContent = `¿Qué explica la inflación de ${etqMesLargo(f)}?`;
    const c = camino(st.nodo);
    migas("ipc-migas", c.map(id => ({t: nombre(id) === "Total" ? "Toda la canasta" : nombre(id), id})), p => { st.nodo = p.id; detalle(); });
    $("ipc-explica").textContent = EXPL[st.medida];
    const items = hijosDe(st.nodo).map(id => ({id, n: nombre(id), v: val(id, st.medida, f), resaltar: id === st.nodo})).filter(x => x.v != null).sort((x, y) => y.v - x.v);
    const conHijos = id => !!st.hijos[id];
    barras("ipc-bar", items, {unidad: st.medida.startsWith("contrib") ? " pp" : "%", etiqueta: ETQ[st.medida], alClic: x => conHijos(x.id) ? ir(x.id) : verEnTiempo(x.id)});

    const rows = hijosDe(st.nodo).map(id => ({id, n: nombre(id), vm: val(id, "var_mensual", f), va: val(id, "var_anual", f), cm: val(id, "contrib_mensual", f), ca: val(id, "contrib_anual", f)}));
    const k = {contrib_anual: "ca", var_anual: "va", contrib_mensual: "cm", var_mensual: "vm"}[st.medida];
    rows.sort((x, y) => (y[k] ?? -1e9) - (x[k] ?? -1e9));
    const t = $("ipc-tabla");
    t.innerHTML = `<thead><tr><th>Categoría</th><th>Var. mes %</th><th>Var. anual %</th><th>Aporte mes pp</th><th>Aporte anual pp</th><th></th></tr></thead><tbody>` +
      rows.map(r => `<tr><td>${r.id === st.nodo ? "<strong>" + r.n + "</strong>" : r.n}</td>${["vm", "va", "cm", "ca"].map(c => `<td class="${clsSigno(r[c])}">${fmt(r[c])}</td>`).join("")}
        <td class="acciones">${conHijos(r.id) && r.id !== st.nodo ? `<button class="ver" data-a="bajar" data-id="${r.id}">Ver detalle ›</button>` : ""}<button class="ver sec" data-a="tiempo" data-id="${r.id}">En el tiempo</button></td></tr>`).join("") + "</tbody>";
    t.querySelectorAll("button.ver").forEach(b => b.onclick = () => b.dataset.a === "bajar" ? ir(b.dataset.id) : verEnTiempo(b.dataset.id));
  }
  return {iniciar, render};
})());
