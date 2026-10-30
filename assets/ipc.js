// Pestaña: Inflación (IPC) — primero el panorama, luego qué la explica
registrar("ipc", (() => {
  const st = {serie: {}, meta: {}, hijos: {}, fechas: [], mes: null, medida: "contrib_anual", nodo: "IPC_TOTAL", cats: [], H: null};
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
    // árbol de categorías: división (lo más general) › grupo › subclase (lo más específico)
    const nodo = (id, nivel) => ({id, t: nombre(id), nivel, hijos: (st.hijos[id] || []).map(h => nodo(h, nivel === "división" ? "grupo" : "subclase"))});
    const arbol = st.hijos.IPC_TOTAL.map(d => nodo(d, "división"));
    selCat = selectorVarias("ipc-cat", arbol, ids => { delete rangos["ipc-hist"]; st.cats = ids; historia(); }, {total: "Inflación total", otra: "Comparar categorías (desde 2019)",
      ayuda: "Van de lo general a lo específico: <strong>división</strong> (por ejemplo, Alimentos) › <strong>grupo</strong> (Pan y cereales) › <strong>subclase</strong> (Arroz). Toca ▸ para ver lo que contiene y el nombre para agregarla."});
  }

  // con categorías solo hay datos desde 2019: la gráfica arranca ahí y muestra el total como referencia
  function historia() {
    const H = st.H, c = st.cats, F = c.length ? H.fechas.filter(f => f >= "2019-01-01") : H.fechas;
    const total = F.map(f => H.var_anual[H.fechas.indexOf(f)]);
    const ds = [{label: "Inflación total (anual)", data: total, color: c.length ? css("--muted") : css("--grafica"), ancho: c.length ? 1.6 : 2.5, dash: c.length ? [4, 3] : []}];
    c.forEach((id, k) => ds.push({label: nombre(id), data: F.map(f => val(id, "var_anual", f) ?? null), color: DISTINTOS()[k], ancho: 2.5}));
    serie("ipc-hist", F, ds, {agregar: "fin", unidad: "%", referencias: [{y: 3, t: "Meta 3%"}, {y: 4, t: "4%"}, {y: 2, t: "2%"}],
      despues: (i0, i1) => interpretar(F, ds, i0, i1)});
  }
  function interpretar(F, ds, i0, i1) {
    const resumen = d => {
      const tramo = d.data.slice(i0, i1 + 1).map((v, k) => [v, F[i0 + k]]).filter(x => x[0] != null);
      if (!tramo.length) return null;
      const prom = tramo.reduce((a, b) => a + b[0], 0) / tramo.length;
      const max = tramo.reduce((a, b) => b[0] > a[0] ? b : a), min = tramo.reduce((a, b) => b[0] < a[0] ? b : a);
      const dentro = tramo.filter(x => x[0] >= 2 && x[0] <= 4).length / tramo.length * 100;
      return {prom, max, min, dentro, ult: tramo.at(-1)};
    };
    const periodo = `Entre <strong>${etqMes(F[i0])}</strong> y <strong>${etqMes(F[i1])}</strong>`;
    if (!st.cats.length) {
      const r = resumen(ds[0]); if (!r) return;
      $("ipc-hist-txt").innerHTML = `${periodo} la inflación promedió <strong>${fmt(r.prom)}%</strong>. ` +
        `Lo más alto fue ${fmt(r.max[0])}% (${etqMes(r.max[1])}, gobierno ${gobiernoDe(r.max[1])}) y lo más bajo ${fmt(r.min[0])}% (${etqMes(r.min[1])}). ` +
        `Estuvo dentro del rango que busca el Banco de la República (entre 2% y 4%) en el ${fmt(r.dentro, 0)}% de los meses.`;
      return;
    }
    const t = resumen(ds[0]);
    const filas = ds.slice(1).map(d => [d.label, resumen(d)]).filter(x => x[1]);
    $("ipc-hist-txt").innerHTML = `${periodo} la inflación total promedió <strong>${fmt(t.prom)}%</strong>. En las categorías elegidas:<br>` +
      filas.map(([n, r]) => `• <strong>${n}</strong>: promedió ${fmt(r.prom)}% ${r.prom > t.prom + 0.05 ? "(por encima del total)" : r.prom < t.prom - 0.05 ? "(por debajo del total)" : "(igual que el total)"}; ` +
        `lo más alto fue ${fmt(r.max[0])}% (${etqMes(r.max[1])}) y en ${etqMes(r.ult[1])} va en ${fmt(r.ult[0])}%.`).join("<br>");
  }

  const ir = id => { st.nodo = id; detalle(); irA("ipc-paso2"); };
  // "En el tiempo": la categoría frente al total, dentro de esta misma sección
  function verEnTiempo(id) {
    const H = st.H, F = H.fechas.filter(f => f >= "2019-01-01"), d = F.map(f => val(id, "var_anual", f) ?? null), t = F.map(f => H.var_anual[H.fechas.indexOf(f)]);
    enElTiempo("ipc-tiempo", `${nombre(id)}: inflación anual frente al total`, F,
      [{label: "Inflación total", data: t, color: css("--muted"), ancho: 1.6}, {label: nombre(id), data: d, color: css("--grafica"), ancho: 2.5}],
      {unidad: "%", nota: "Variación anual de los precios de esta categoría desde 2019 (antes el DANE no publica este detalle). Toca otra barra o fila para cambiarla.",
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
