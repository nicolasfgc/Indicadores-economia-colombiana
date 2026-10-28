// Pestaña: Mercado laboral (GEIH)
registrar("empleo", (() => {
  const st = {d: null, mes: null, desg: "ramas", linea: "nac", ind: "td"};
  const IND = {td: "Tasa de desempleo", to: "Tasa de ocupación", tgp: "Tasa global de participación"};
  const g = (dominio, ajuste = "original") => st.d.general.find(x => x.dominio.toLowerCase() === dominio.toLowerCase() && x.ajuste === ajuste);
  const at = (arr, f) => arr ? arr[st.d.fechas.indexOf(f)] : null;
  const hace = (f, n) => st.d.fechas[st.d.fechas.indexOf(f) - n];

  async function iniciar() {
    st.d = await json("web/empleo.json");
    const nac = g("Total Nacional").v.td;
    let u = st.d.fechas.length - 1; while (nac[u] == null) u--;
    st.mes = st.d.fechas[u];
    opciones($("emp-mes"), st.d.fechas.slice(0, u + 1).reverse().map(f => [f, etqMesLargo(f)]), st.mes);
    $("emp-mes").onchange = e => { st.mes = e.target.value; render(); };
    $("emp-ultima").textContent = "Último dato: " + etqMesLargo(st.mes);
    seg("emp-desg", x => { st.desg = x; render(); });
    seg("emp-linea", x => { st.linea = x; render(); });
    seg("emp-ind", x => { st.ind = x; render(); });
  }

  function render() {
    const f = st.mes, f12 = hace(f, 12);
    const nac = g("Total Nacional"), c13 = g("Total 13 ciudades y áreas metropolitanas"), des = g("Total Nacional", "desestacionalizada");
    const td = at(nac.v.td, f), td12 = at(nac.v.td, f12);
    $("emp-k1").textContent = fmt(td, 1) + "%";
    $("emp-k1d").innerHTML = td12 == null ? "" : `<span class="${clsSigno(td - td12)}">${td >= td12 ? "▲" : "▼"} ${fmt(Math.abs(td - td12), 1)} pp</span> vs ${etqMes(f12)}`;
    const t13 = at(c13.v.td, f), t1312 = at(c13.v.td, f12);
    $("emp-k2").textContent = fmt(t13, 1) + "%";
    $("emp-k2d").innerHTML = t1312 == null ? "" : `${etqMes(f12)}: ${fmt(t1312, 1)}%`;
    $("emp-k3").textContent = fmt(at(des.v.td, f), 1) + "%";
    const oc = at(nac.v.ocupados, f), oc12 = at(nac.v.ocupados, f12);
    $("emp-k4").textContent = fmt(oc / 1000, 1) + " M";
    $("emp-k4d").innerHTML = oc12 == null ? "" : `<span class="${clsSigno(-(oc - oc12))}">${oc >= oc12 ? "+" : "−"}${fmt(Math.abs(oc - oc12), 0)} mil</span> en un año`;

    // línea del indicador
    const fs = st.d.fechas.filter(x => x <= st.d.fechas.at(-1));
    let ds;
    if (st.linea === "nac") ds = [{label: "Total nacional", data: nac.v[st.ind], color: css("--muted")}, {label: "Desestacionalizada", data: des.v[st.ind], color: css("--accent"), ancho: 2.5}];
    else if (st.linea === "sexo") ds = [{label: "Hombres", data: g("Total Nacional Hombres").v[st.ind]}, {label: "Mujeres", data: g("Total Nacional Mujeres").v[st.ind]}];
    else ds = [{label: "Total nacional", data: nac.v[st.ind], color: css("--muted")}, {label: "13 ciudades", data: c13.v[st.ind], color: css("--accent")}, {label: "Cabeceras", data: (g("Total Cabeceras") || {v: {}}).v[st.ind] || []}];
    $("emp-linea-t").textContent = IND[st.ind];
    lineas("emp-graf", fs, ds, {unidad: "%", fmtValor: x => fmt(x, 1) + "%"});

    // dónde cambió el empleo: variación anual de ocupados por rama o posición
    const lista = st.d[st.desg].filter(x => x.nombre !== "Total" && !/no informa/i.test(x.nombre));
    const items = lista.map(x => ({id: x.id, n: x.nombre, v: at(x.v, f) != null && at(x.v, f12) != null ? at(x.v, f) - at(x.v, f12) : null})).filter(x => x.v != null).sort((a, b) => b.v - a.v);
    const up = css("--up");
    barras("emp-bar", items, {etiqueta: `Cambio en personas ocupadas, ${etqMes(f12)} a ${etqMes(f)} (miles)`, fmtValor: x => `${x >= 0 ? "+" : ""}${fmt(x, 0)} mil personas`});
    // en empleo, crecer es bueno: se invierten los colores
    const gr = graficos["emp-bar"]; gr.data.datasets[0].backgroundColor = items.map(x => x.v >= 0 ? css("--accent") : up); gr.update();

    // ciudades: tasa de desempleo del trimestre móvil que termina en el mes elegido
    const cs = st.d.ciudades.map(c => ({id: c.id, n: c.nombre, v: at(c.v.td, f), resaltar: /^total/i.test(c.nombre)})).filter(x => x.v != null).sort((a, b) => b.v - a.v);
    $("emp-ciud-t").textContent = `Desempleo por ciudad, trimestre ${etqMes(hace(f, 2) || f)} a ${etqMes(f)}`;
    barras("emp-ciud", cs, {unidad: "%", etiqueta: "Tasa de desempleo (%)", alto: 22, fmtValor: x => fmt(x, 1) + "%"});
    const gc = graficos["emp-ciud"]; gc.data.datasets[0].backgroundColor = cs.map(x => x.resaltar ? css("--muted") : css("--up")); gc.update();
  }
  return {iniciar, render};
})());
