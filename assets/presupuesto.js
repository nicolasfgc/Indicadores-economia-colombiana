// Pestaña: Presupuesto General de la Nación
registrar("presupuesto", (() => {
  // campos de cada fila: [fecha, entidad, tipo, aprop, comp, oblig, pagos, Δaprop, Δcomp, Δoblig, Δpagos] (millones de pesos)
  const A = 3, C = 4, O = 5, P = 6, DA = 7, DC = 8, DO = 9, DP = 10;
  const LETRA = {F: 0, I: 1, S: 2};
  const st = {d: null, h: null, porFecha: {}, anio: null, mes: null, tipo: "todos", medida: "pct_oblig",
              nodo: {nivel: "total"}, hSector: "TOTAL", hTipo: "Total sin deuda", hPrecios: "constantes"};
  const MED = {
    pct_oblig: {t: "% ejecutado (obligaciones / apropiación)", f: s => s[A] ? s[O] / s[A] * 100 : null, u: "%"},
    pct_comp: {t: "% comprometido (compromisos / apropiación)", f: s => s[A] ? s[C] / s[A] * 100 : null, u: "%"},
    comp_mes: {t: "Comprometido en el mes", f: s => s[DC], plata: true},
    oblig_mes: {t: "Obligado en el mes", f: s => s[DO], plata: true},
    aprop: {t: "Apropiación vigente", f: s => s[A], plata: true}};
  const GOBIERNOS = [{x: 2002, t: "Uribe I"}, {x: 2006, t: "Uribe II"}, {x: 2010, t: "Santos I"}, {x: 2014, t: "Santos II"}, {x: 2018, t: "Duque"}, {x: 2022, t: "Petro"}];

  const vacio = () => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  function sumar(dst, f, off = 0) { for (let k = A; k <= DP; k++) dst[k] += f[k + off]; return dst; }
  const tipoOk = t => st.tipo === "todos" || +st.tipo === t;
  const sectorDe = ei => st.d.entidades[ei][2];
  const nombreEnt = ei => st.d.entidades[ei][1];

  async function rubros(anio) { return json(`web/presupuesto/rubros_${anio}.json`); }

  async function iniciar() {
    [st.d, st.h] = await Promise.all([json("web/presupuesto/entidades.json"), json("web/presupuesto/historico.json")]);
    for (const f of st.d.filas) (st.porFecha[st.d.fechas[f[0]]] ??= []).push(f);
    const anios = [...new Set(st.d.fechas.map(f => f.slice(0, 4)))].sort().reverse();
    st.anio = anios[0];
    opciones($("pre-anio"), anios.map(a => [a, a]), st.anio);
    $("pre-anio").onchange = e => { st.anio = e.target.value; st.mes = null; llenarMeses(); render(); };
    $("pre-mes").onchange = e => { st.mes = e.target.value; render(); };
    seg("pre-tipo", x => { st.tipo = x; render(); });
    seg("pre-medida", x => { st.medida = x; render(); });
    llenarMeses();
    $("pre-ultima").textContent = "Último dato: " + etqMesLargo(st.d.fechas.at(-1));
    // histórico
    const secs = Object.keys(st.h.sectores).sort((a, b) => a === "TOTAL" ? -1 : b === "TOTAL" ? 1 : a.localeCompare(b));
    opciones($("preh-sector"), secs.map(s => [s, s === "TOTAL" ? "Todo el PGN (sin deuda)" : titulo(s)]), st.hSector);
    $("preh-sector").onchange = e => { st.hSector = e.target.value; renderHistorico(); };
    seg("preh-tipo", x => { st.hTipo = x; renderHistorico(); });
    seg("preh-precios", x => { st.hPrecios = x; renderHistorico(); });
  }
  function llenarMeses() {
    const ms = st.d.fechas.filter(f => f.startsWith(st.anio));
    if (!st.mes || !ms.includes(st.mes)) st.mes = ms.at(-1);
    opciones($("pre-mes"), ms.slice().reverse().map(f => [f, MESES_L[+f.slice(5, 7) - 1]]), st.mes);
  }

  // ---------------------------------------------------------- hijos del nodo actual
  async function hijos(fecha, nodo = st.nodo) {
    const filas = (st.porFecha[fecha] || []).filter(f => tipoOk(f[2]));
    const grupos = new Map();
    const add = (k, n, f, off = 0) => { if (!grupos.has(k)) grupos.set(k, {id: k, n, s: vacio()}); sumar(grupos.get(k).s, f, off); };
    if (nodo.nivel === "total") filas.forEach(f => add(sectorDe(f[1]), titulo(sectorDe(f[1])), f));
    else if (nodo.nivel === "sector") filas.filter(f => sectorDe(f[1]) === nodo.sector).forEach(f => add(f[1], titulo(nombreEnt(f[1])), f));
    else {
      const R = await rubros(fecha.slice(0, 4)); const mi = R.fechas.indexOf(fecha);
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
  function bajar(g) {
    const n = st.nodo;
    if (n.nivel === "total") st.nodo = {nivel: "sector", sector: g.id};
    else if (n.nivel === "sector") st.nodo = {nivel: "entidad", sector: n.sector, ent: g.id};
    else if (n.nivel === "entidad") st.nodo = {nivel: "programa", sector: n.sector, ent: n.ent, prog: g.id};
    else return;
    render();
  }

  async function render() {
    const f = st.mes, n = st.nodo;
    const lista = await hijos(f);
    const s = total(lista);
    // migas
    const migas = [["Todo el PGN", {nivel: "total"}]];
    if (n.sector) migas.push([titulo(n.sector), {nivel: "sector", sector: n.sector}]);
    if (n.ent != null) migas.push([titulo(nombreEnt(n.ent)), {nivel: "entidad", sector: n.sector, ent: n.ent}]);
    if (n.prog) migas.push([titulo(n.prog), n]);
    $("pre-crumbs").innerHTML = migas.map(([t], k) => k === migas.length - 1 ? `<strong>${t}</strong>` : `<a data-k="${k}">${t}</a><span class="sep">›</span>`).join(" ");
    $("pre-crumbs").querySelectorAll("a").forEach(a => a.onclick = () => { st.nodo = migas[+a.dataset.k][1]; render(); });
    // indicadores
    const mesAnt = st.d.fechas[st.d.fechas.indexOf(f) - 1];
    $("pre-k1").textContent = plata(s[A]);
    $("pre-k1d").innerHTML = s[DA] ? `${s[DA] > 0 ? "+" : ""}${plata(s[DA])} frente al mes anterior` : "sin cambios en el mes";
    $("pre-k2").textContent = s[A] ? fmt(s[C] / s[A] * 100, 1) + "%" : "–";
    $("pre-k2d").textContent = `${plata(s[C])} comprometidos`;
    $("pre-k3").textContent = s[A] ? fmt(s[O] / s[A] * 100, 1) + "%" : "–";
    $("pre-k3d").textContent = `${plata(s[O])} obligados · ${plata(s[P])} pagados`;
    $("pre-k4").textContent = plata(s[DC]);
    $("pre-k4d").textContent = f.endsWith("-01-01") || !mesAnt || mesAnt.slice(0, 4) !== f.slice(0, 4) ? "comprometido en enero" :
      `comprometido entre ${etqMes(mesAnt)} y ${etqMes(f)}`;
    // barras
    const M = MED[st.medida];
    const items = lista.map(g => ({id: g.id, n: g.n, v: M.f(g.s)})).filter(x => x.v != null && (st.medida.startsWith("pct") ? true : x.v !== 0)).sort((a, b) => b.v - a.v);
    const nivelSig = {total: "sector", sector: "entidad", entidad: "programa o cuenta", programa: "rubro"}[n.nivel];
    $("pre-bar-t").textContent = `${M.t} por ${nivelSig}`;
    barras("pre-bar", items.slice(0, 60), {etiqueta: M.t, alClic: n.nivel === "programa" ? null : bajar,
      fmtValor: M.plata ? (x => plata(x)) : (x => fmt(x, 1) + "%")});
    graficos["pre-bar"].data.datasets[0].backgroundColor = items.map(x => x.v < 0 ? css("--up") : css("--accent")); graficos["pre-bar"].update();
    $("pre-bar-nota").textContent = items.length > 60 ? `Se muestran los 60 más grandes de ${items.length}. La tabla tiene todos.` : "";
    // tabla
    const filas = lista.slice().sort((a, b) => b.s[A] - a.s[A]);
    const pct = (x, y) => y ? fmt(x / y * 100, 1) + "%" : "–";
    $("pre-tabla").innerHTML = `<thead><tr><th>${titulo(nivelSig)}</th><th>Apropiación</th><th>Comprometido</th><th>%</th><th>Obligado</th><th>%</th><th>Pagado</th><th>Comprometido en el mes</th></tr></thead><tbody>` +
      filas.map((g, i) => `<tr class="${n.nivel === "programa" ? "" : "click"}" data-i="${i}"><td>${g.n}</td><td>${plata(g.s[A])}</td><td>${plata(g.s[C])}</td><td>${pct(g.s[C], g.s[A])}</td><td>${plata(g.s[O])}</td><td>${pct(g.s[O], g.s[A])}</td><td>${plata(g.s[P])}</td><td class="${clsSigno(-g.s[DC])}">${plata(g.s[DC])}</td></tr>`).join("") + "</tbody>";
    if (n.nivel !== "programa") $("pre-tabla").querySelectorAll("tr.click").forEach(tr => tr.onclick = () => bajar(filas[+tr.dataset.i]));
    await curva();
    renderHistorico();
  }

  // curva de ejecución acumulada del año frente al año anterior
  async function curva() {
    const serie = async anio => {
      const out = Array(12).fill(null);
      for (const f of st.d.fechas.filter(x => x.startsWith(anio))) {
        const s = total(await hijos(f));
        out[+f.slice(5, 7) - 1] = s[A] ? s[O] / s[A] * 100 : null;
      }
      return out;
    };
    const anio = st.anio, ant = String(+anio - 1);
    const tieneAnt = st.d.fechas.some(x => x.startsWith(ant));
    const ds = [{label: `${anio}`, data: await serie(anio), color: css("--accent"), ancho: 2.5}];
    if (tieneAnt) ds.unshift({label: `${ant}`, data: await serie(ant), color: css("--muted"), dash: [4, 3]});
    const meses = MESES.map((m, i) => String(i + 1));
    lineas("pre-curva", meses, ds, {fmtX: x => MESES[+x - 1], fmtValor: x => fmt(x, 1) + "%", eje0: true});
  }

  function renderHistorico() {
    const H = st.h, sec = H.sectores[st.hSector];
    const datos = sec && sec[st.hTipo];
    if (!datos) { $("preh-nota").textContent = "Este sector no tiene datos para ese tipo de gasto."; return; }
    $("preh-nota").textContent = st.hPrecios === "constantes" ? "Precios constantes: descuenta la inflación para comparar años distintos (deflactores de Hacienda)." : "Precios corrientes: pesos de cada año, sin ajustar por inflación.";
    const anios = H.anios.map(String);
    const serie = m => (datos[m]?.[st.hPrecios] || []).map(v => v == null ? null : v * 1000);  // miles de millones -> millones
    lineas("preh-montos", anios, [{label: "Apropiación", data: serie("apropiacion"), color: css("--muted")},
      {label: "Compromisos", data: serie("compromisos"), color: css("--s3")}, {label: "Obligaciones", data: serie("obligaciones"), color: css("--accent"), ancho: 2.5}],
      {fmtX: x => x, fmtValor: x => plata(x, 1), marcas: GOBIERNOS.map(g => ({x: String(g.x), t: g.t}))});
    const ap = serie("apropiacion"), ob = serie("obligaciones");
    lineas("preh-pct", anios, [{label: "% ejecutado (obligaciones / apropiación)", data: ap.map((a, i) => a && ob[i] != null ? ob[i] / a * 100 : null), color: css("--accent"), ancho: 2.5}],
      {fmtX: x => x, fmtValor: x => fmt(x, 1) + "%", marcas: GOBIERNOS.map(g => ({x: String(g.x), t: g.t}))});
  }
  return {iniciar, render};
})());
