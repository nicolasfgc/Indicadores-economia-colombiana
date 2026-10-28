// Pestaña: Presupuesto General de la Nación — panorama e historia primero, detalle después
registrar("presupuesto", (() => {
  // filas de entidades.json: [fecha, entidad, tipo, aprop, comp, oblig, pagos, Δaprop, Δcomp, Δoblig, Δpagos] (millones de pesos)
  const A = 3, C = 4, O = 5, P = 6, DA = 7, DC = 8;
  const LETRA = {F: 0, I: 1, S: 2};
  const st = {d: null, h: null, porFecha: {}, mes: null, tipo: "todos", medida: "pct_oblig", nodo: {nivel: "total"},
              hSector: null, hTipo: "Total sin deuda", hPrecios: "constantes"};
  const MED = {
    pct_oblig: {t: "% ejecutado (obligaciones / apropiación)", f: s => s[A] ? s[O] / s[A] * 100 : null},
    pct_comp: {t: "% comprometido (compromisos / apropiación)", f: s => s[A] ? s[C] / s[A] * 100 : null},
    comp_mes: {t: "Comprometido en el mes", f: s => s[DC], plata: true},
    aprop: {t: "Apropiación vigente", f: s => s[A], plata: true}};
  const vacio = () => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  function sumar(dst, f, off = 0) { for (let k = A; k <= 10; k++) dst[k] += f[k + off]; return dst; }
  const tipoOk = t => st.tipo === "todos" || +st.tipo === t;
  const sectorDe = ei => st.d.entidades[ei][2];
  const nombreEnt = ei => st.d.entidades[ei][1];
  const rubros = anio => json(`web/presupuesto/rubros_${anio}.json`);
  const anios = () => [...new Set(st.d.fechas.map(f => f.slice(0, 4)))].sort();

  async function iniciar() {
    [st.d, st.h] = await Promise.all([json("web/presupuesto/entidades.json"), json("web/presupuesto/historico.json")]);
    for (const f of st.d.filas) (st.porFecha[st.d.fechas[f[0]]] ??= []).push(f);
    st.mes = st.d.fechas.at(-1);
    periodo("pre-periodo", st.d.fechas, st.mes, f => { st.mes = f; render(); });
    seg("pre-tipo", x => { st.tipo = x; render(); });
    seg("pre-medida", x => { st.medida = x; detalle(); });
    $("pre-ultima").textContent = "Último dato: " + etqMesLargo(st.d.fechas.at(-1));
    const secs = Object.keys(st.h.sectores).filter(s => s !== "TOTAL").sort();
    selectorCategoria("preh-cat", [{items: secs.map(s => [s, titulo(s)])}], id => { st.hSector = id; historico(); }, {total: "Todo el PGN", otra: "Un sector"});
    seg("preh-tipo", x => { st.hTipo = x; historico(); });
    seg("preh-precios", x => { st.hPrecios = x; historico(); });
  }

  // ---------------------------------------------------------- agregaciones
  // hijos del nodo en una fecha: [{id, n, s}]
  async function hijos(fecha, nodo = st.nodo) {
    const grupos = new Map();
    const add = (k, n, f, off = 0) => { if (!grupos.has(k)) grupos.set(k, {id: k, n, s: vacio()}); sumar(grupos.get(k).s, f, off); };
    const filas = (st.porFecha[fecha] || []).filter(f => tipoOk(f[2]));
    if (nodo.nivel === "total") filas.forEach(f => add(sectorDe(f[1]), titulo(sectorDe(f[1])), f));
    else if (nodo.nivel === "sector") filas.filter(f => sectorDe(f[1]) === nodo.sector).forEach(f => add(f[1], titulo(nombreEnt(f[1])), f));
    else {
      const R = await rubros(fecha.slice(0, 4)), mi = R.fechas.indexOf(fecha);
      for (const r of R.filas) {
        if (r[0] !== mi) continue;
        const info = R.rubros[r[1]]; if (!info || info[0] !== nodo.ent || !tipoOk(LETRA[info[1]])) continue;
        if (nodo.nivel === "entidad") add(info[2], titulo(info[2]), r, -1);
        else if (info[2] === nodo.prog) add("r" + r[1], titulo(info[4]) + (info[5] && info[5] !== info[4] ? " · " + titulo(info[5]) : ""), r, -1);
      }
    }
    return [...grupos.values()];
  }
  const total = lista => lista.reduce((acc, g) => sumar(acc, g.s), vacio());
  // totales del nodo actual para todos los meses (para las series de tiempo)
  async function totalesNodo(nodo = st.nodo) {
    const out = {};
    if (nodo.nivel === "total" || nodo.nivel === "sector") {
      for (const f of st.d.fechas) {
        const s = vacio();
        for (const r of st.porFecha[f] || []) if (tipoOk(r[2]) && (nodo.nivel === "total" || sectorDe(r[1]) === nodo.sector)) sumar(s, r);
        out[f] = s;
      }
      return out;
    }
    for (const a of anios()) {
      const R = await rubros(a);
      R.fechas.forEach(f => out[f] = vacio());
      for (const r of R.filas) {
        const info = R.rubros[r[1]]; if (!info || info[0] !== nodo.ent || !tipoOk(LETRA[info[1]])) continue;
        if (nodo.nivel === "programa" && info[2] !== nodo.prog) continue;
        sumar(out[R.fechas[r[0]]], r, -1);
      }
    }
    return out;
  }
  function nombreNodo(n = st.nodo) {
    if (n.nivel === "total") return "todo el PGN";
    if (n.nivel === "sector") return titulo(n.sector);
    if (n.nivel === "entidad") return titulo(nombreEnt(n.ent));
    return titulo(n.prog);
  }
  function pasosNodo() {
    const n = st.nodo, p = [{t: "Todo el PGN", nodo: {nivel: "total"}}];
    if (n.sector) p.push({t: titulo(n.sector), nodo: {nivel: "sector", sector: n.sector}});
    if (n.ent != null) p.push({t: titulo(nombreEnt(n.ent)), nodo: {nivel: "entidad", sector: n.sector, ent: n.ent}});
    if (n.prog) p.push({t: titulo(n.prog), nodo: n});
    return p;
  }
  function bajar(g) {
    const n = st.nodo;
    if (n.nivel === "total") st.nodo = {nivel: "sector", sector: g.id};
    else if (n.nivel === "sector") st.nodo = {nivel: "entidad", sector: n.sector, ent: g.id};
    else if (n.nivel === "entidad") st.nodo = {nivel: "programa", sector: n.sector, ent: n.ent, prog: g.id};
    else return;
    render(); irA("pre-paso1");
  }

  // ---------------------------------------------------------- secciones
  async function render() {
    const f = st.mes, s = total(await hijos(f));
    migas("pre-migas", pasosNodo(), p => { st.nodo = p.nodo; render(); });
    migas("pre-migas2", pasosNodo(), p => { st.nodo = p.nodo; render(); });
    $("pre-paso1-t").textContent = `Cómo va ${nombreNodo()} a ${etqMesLargo(f)}`;
    const mesAnt = st.d.fechas[st.d.fechas.indexOf(f) - 1];
    $("pre-k1").textContent = plata(s[A]);
    $("pre-k1d").innerHTML = s[DA] ? `${s[DA] > 0 ? "+" : ""}${plata(s[DA])} frente al mes anterior` : "sin cambios en el mes";
    $("pre-k2").textContent = s[A] ? fmt(s[C] / s[A] * 100, 1) + "%" : "–";
    $("pre-k2d").textContent = `${plata(s[C])} comprometidos`;
    $("pre-k3").textContent = s[A] ? fmt(s[O] / s[A] * 100, 1) + "%" : "–";
    $("pre-k3d").textContent = `${plata(s[O])} obligados · ${plata(s[P])} pagados`;
    $("pre-k4").textContent = plata(s[DC]);
    $("pre-k4d").textContent = !mesAnt || mesAnt.slice(0, 4) !== f.slice(0, 4) ? "comprometido en enero" : `comprometido entre ${etqMes(mesAnt)} y ${etqMes(f)}`;
    historico();
    await evolucion();
    await detalle();
  }

  function historico() {
    const H = st.h, sec = H.sectores[st.hSector || "TOTAL"], datos = sec && sec[st.hTipo];
    if (!datos) { $("preh-txt").textContent = "Este sector no tiene datos para ese tipo de gasto."; return; }
    // el último año del archivo histórico va solo hasta septiembre: se deja por fuera (el año en curso está más abajo, mes a mes)
    const n = st.d.fechas.at(-1).slice(0, 4) === String(H.anios.at(-1)) ? H.anios.length - 1 : H.anios.length;
    const an = H.anios.slice(0, n).map(String);
    const ser = m => (datos[m]?.[st.hPrecios] || []).slice(0, n).map(v => v == null ? null : v * 1000);
    const ap = ser("apropiacion"), co = ser("compromisos"), ob = ser("obligaciones");
    const pct = ap.map((a, i) => a && ob[i] != null ? ob[i] / a * 100 : null);
    const nom = st.hSector ? titulo(st.hSector) : "todo el PGN (sin deuda)";
    $("preh-t").textContent = `El presupuesto de ${nom} desde el año 2000`;
    serie("preh-montos", an, [{label: "Apropiación", data: ap, color: css("--muted")}, {label: "Compromisos", data: co, color: css("--s3")}, {label: "Obligaciones (ejecutado)", data: ob, color: css("--accent"), ancho: 2.5}],
      {fmtValor: x => plata(x, 1), despues: (i0, i1) => {
        const a0 = ap[i0], a1 = ap[i1], cr = (Math.pow(a1 / a0, 1 / Math.max(1, i1 - i0)) - 1) * 100;
        const tramo = pct.slice(i0, i1 + 1), prom = tramo.filter(x => x != null).reduce((a, b) => a + b, 0) / tramo.filter(x => x != null).length;
        const peor = an[i0 + tramo.indexOf(Math.min(...tramo.filter(x => x != null)))];
        $("preh-txt").innerHTML = `Entre <strong>${an[i0]}</strong> y <strong>${an[i1]}</strong> la apropiación de ${nom} pasó de ${plata(a0)} a <strong>${plata(a1)}</strong>` +
          ` (${st.hPrecios === "constantes" ? "sin inflación, " : ""}${fmt(cr, 1)}% promedio al año). En promedio se ejecutó el <strong>${fmt(prom, 1)}%</strong> de lo apropiado; el año más bajo fue ${peor} (gobierno ${gobiernoDe(peor)}).` +
          ` El año en curso no aparece porque todavía no termina: está abajo, mes a mes.`;
      }});
    serie("preh-pct", an, [{label: "% ejecutado (obligaciones / apropiación)", data: pct, color: css("--accent"), ancho: 2.5}], {fmtValor: x => fmt(x, 1) + "%"});
  }

  async function evolucion() {
    const tot = await totalesNodo(), F = st.d.fechas;
    const pctE = F.map(f => tot[f] && tot[f][A] ? tot[f][O] / tot[f][A] * 100 : null);
    const comp = F.map(f => tot[f] ? tot[f][DC] : null);
    $("pre-evo-t").textContent = `Mes a mes: ${nombreNodo()}`;
    serie("pre-evo", F, [{label: "% ejecutado acumulado del año", data: pctE, color: css("--accent"), ancho: 2.5},
                         {label: "Comprometido en el mes", data: comp, tipo: "bar", eje: "y2", color: css("--s3"), colores: comp.map(x => x < 0 ? css("--up") : css("--s3"))}],
      {fmtValor: x => fmt(x, 1) + "%", fmtValor2: x => plata(x), inicio: F.length, eje0: true, atajos: [["1 año", 12], ["3 años", 36], ["Todo", 0]]});
    // curva del año frente al anterior
    const anio = st.mes.slice(0, 4), ant = String(+anio - 1);
    const curva = a => MESES.map((m, i) => { const f = `${a}-${String(i + 1).padStart(2, "0")}-01`; return tot[f] && tot[f][A] ? tot[f][O] / tot[f][A] * 100 : null; });
    const ds = [{label: anio, data: curva(anio), color: css("--accent"), ancho: 2.5}];
    if (F.some(x => x.startsWith(ant))) ds.unshift({label: ant, data: curva(ant), color: css("--muted"), dash: [4, 3]});
    dibujar("pre-curva", {type: "line", data: {labels: MESES, datasets: ds.map(d => ({label: d.label, data: d.data, borderColor: d.color, borderDash: d.dash || [], borderWidth: d.ancho || 2, pointRadius: 2, tension: .2, spanGaps: true}))},
      options: {responsive: true, maintainAspectRatio: false, interaction: {mode: "index", intersect: false}, plugins: {legend: {labels: {color: css("--ink")}}, gobiernos: {activo: false},
        tooltip: {callbacks: {label: c => `${c.dataset.label}: ${fmt(c.raw, 1)}%`}}},
        scales: {x: {grid: {display: false}, ticks: {color: css("--muted")}}, y: {beginAtZero: true, grid: {color: css("--line")}, ticks: {color: css("--muted"), callback: v => v + "%"}}}}});
    const mi = +st.mes.slice(5, 7) - 1, a1 = curva(anio)[mi], a0 = curva(ant)[mi];
    $("pre-curva-txt").innerHTML = a1 == null ? "" : `A ${MESES_L[mi]} de ${anio}, ${nombreNodo()} lleva <strong>${fmt(a1, 1)}%</strong> ejecutado` +
      (a0 != null ? `; a la misma altura de ${ant} llevaba ${fmt(a0, 1)}%: <strong>${a1 >= a0 ? "va más rápido" : "va más lento"}</strong> (${fmt(Math.abs(a1 - a0), 1)} puntos de diferencia).` : ".");
  }

  async function detalle() {
    const f = st.mes, n = st.nodo, lista = await hijos(f);
    const nivelSig = {total: "sector", sector: "entidad", entidad: "programa o cuenta", programa: "rubro"}[n.nivel];
    const M = MED[st.medida];
    $("pre-bar-t").textContent = `${M.t} por ${nivelSig} · ${etqMesLargo(f)}`;
    const items = lista.map(g => ({id: g.id, n: g.n, v: M.f(g.s)})).filter(x => x.v != null && (st.medida.startsWith("pct") || x.v !== 0)).sort((a, b) => b.v - a.v);
    barras("pre-bar", items.slice(0, 60), {etiqueta: M.t, alClic: n.nivel === "programa" ? null : bajar, fmtValor: M.plata ? (x => plata(x)) : (x => fmt(x, 1) + "%"),
      colores: x => x.v < 0 ? css("--up") : css("--accent")});
    $("pre-bar-nota").textContent = items.length > 60 ? `Se muestran los 60 más grandes de ${items.length}. La tabla tiene todos.` : "";
    const filas = lista.slice().sort((a, b) => b.s[A] - a.s[A]);
    const pct = (x, y) => y ? fmt(x / y * 100, 1) + "%" : "–";
    $("pre-tabla").innerHTML = `<thead><tr><th>${titulo(nivelSig)}</th><th>Apropiación</th><th>Comprometido</th><th>%</th><th>Obligado</th><th>%</th><th>Pagado</th><th>Comprometido en el mes</th><th></th></tr></thead><tbody>` +
      filas.map((g, i) => `<tr><td>${g.n}</td><td>${plata(g.s[A])}</td><td>${plata(g.s[C])}</td><td>${pct(g.s[C], g.s[A])}</td><td>${plata(g.s[O])}</td><td>${pct(g.s[O], g.s[A])}</td><td>${plata(g.s[P])}</td>
        <td class="${g.s[DC] < 0 ? "pos" : ""}">${plata(g.s[DC])}</td><td class="acciones">${n.nivel === "programa" ? "" : `<button class="ver" data-i="${i}">Ver detalle ›</button>`}</td></tr>`).join("") + "</tbody>";
    $("pre-tabla").querySelectorAll("button.ver").forEach(b => b.onclick = () => bajar(filas[+b.dataset.i]));
  }
  return {iniciar, render};
})());
