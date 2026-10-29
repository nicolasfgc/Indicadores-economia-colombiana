// Pestaña: Mercado laboral (GEIH) — primero el panorama, luego brechas, sectores y ciudades
registrar("empleo", (() => {
  const st = {d: null, mes: null, ind: "td", cat: null, desg: "ramas", rama: null, indSexo: "td"};
  const IND = {td: "Tasa de desempleo", to: "Tasa de ocupación", tgp: "Tasa global de participación"};
  const IND_EXPL = {td: "De cada 100 personas que buscan trabajo, cuántas no lo encuentran.",
    to: "De cada 100 personas en edad de trabajar, cuántas tienen trabajo.",
    tgp: "De cada 100 personas en edad de trabajar, cuántas trabajan o buscan trabajo."};
  const g = (dominio, ajuste = "original") => st.d.general.find(x => x.dominio.toLowerCase() === dominio.toLowerCase() && x.ajuste === ajuste);
  const at = (arr, f) => arr ? arr[st.d.fechas.indexOf(f)] : null;
  const hace = (f, n) => st.d.fechas[st.d.fechas.indexOf(f) - n];
  const serieDe = id => { if (!id) return g("Total Nacional"); return st.d.general.find(x => x.id === id) || st.d.ciudades.find(x => x.id === id); };
  const nombreDe = id => { const s = serieDe(id); return s.dominio || s.nombre; };
  let selCat = null;

  async function iniciar() {
    st.d = await json("web/empleo.json");
    const nac = g("Total Nacional").v.td;
    let u = st.d.fechas.length - 1; while (nac[u] == null) u--;
    st.mes = st.d.fechas[u];
    st.ult = st.mes;
    periodo("emp-periodo", st.d.fechas.slice(0, u + 1).filter((f, i) => nac[i] != null), st.mes, f => { st.mes = f; sectores(); ciudades(); });
    $("emp-ultima").textContent = "Último dato: " + etqMesLargo(st.mes);
    seg("emp-ind", x => { st.ind = x; historia(); });
    seg("emp-indsexo", x => { st.indSexo = x; sexo(); });
    seg("emp-desg", x => { st.desg = x; st.rama = null; sectores(); });
    const zonas = [["EMP_TOTAL_13_CIUDADES_Y_AREAS_METROPOLITANAS_M", "13 ciudades y áreas metropolitanas"], ["EMP_TOTAL_CABECERAS_M", "Cabeceras (zonas urbanas)"]].filter(z => serieDe(z[0]));
    const ciudades = st.d.ciudades.filter(c => !/^total/i.test(c.nombre)).sort((a, b) => a.nombre.localeCompare(b.nombre)).map(c => [c.id, c.nombre + " (trimestre móvil)"]);
    selCat = selectorCategoria("emp-cat", [{g: "Zonas", items: zonas}, {g: "Ciudades", items: ciudades}], id => { st.cat = id; historia(); }, {total: "Total nacional", otra: "Una zona o ciudad"});
  }

  function historia() {
    const F = st.d.fechas, nac = g("Total Nacional"), des = g("Total Nacional", "desestacionalizada");
    const ds = st.cat ? [{label: "Total nacional", data: nac.v[st.ind], color: css("--muted"), ancho: 1.6}, {label: nombreDe(st.cat), data: serieDe(st.cat).v[st.ind] || [], color: css("--grafica"), ancho: 2.5}]
                      : [{label: "Total nacional", data: nac.v[st.ind], color: css("--muted"), ancho: 1.6}, {label: "Sin estacionalidad", data: des.v[st.ind], color: css("--grafica"), ancho: 2.5}];
    $("emp-hist-t").textContent = `${IND[st.ind]} en el tiempo`;
    $("emp-hist-h").textContent = IND_EXPL[st.ind];
    serie("emp-hist", F, ds, {unidad: "%", fmtValor: x => fmt(x, 1) + "%", despues: (i0, i1) => {
      const s = st.cat ? serieDe(st.cat).v[st.ind] : nac.v[st.ind]; if (!s) return;
      const tramo = s.slice(i0, i1 + 1).map((x, k) => [x, F[i0 + k]]).filter(x => x[0] != null); if (!tramo.length) return;
      const prom = tramo.reduce((a, b) => a + b[0], 0) / tramo.length, min = tramo.reduce((a, b) => b[0] < a[0] ? b : a), max = tramo.reduce((a, b) => b[0] > a[0] ? b : a);
      $("emp-hist-txt").innerHTML = `Entre <strong>${etqMes(tramo[0][1])}</strong> y <strong>${etqMes(tramo.at(-1)[1])}</strong> la ${IND[st.ind].toLowerCase()} ${st.cat ? "en " + nombreDe(st.cat) : "nacional"} promedió <strong>${fmt(prom, 1)}%</strong>. ` +
        `Lo más alto: ${fmt(max[0], 1)}% (${etqMes(max[1])}, gobierno ${gobiernoDe(max[1])}). Lo más bajo: ${fmt(min[0], 1)}% (${etqMes(min[1])}, gobierno ${gobiernoDe(min[1])}).`;
    }});
  }

  function sexo() {
    const F = st.d.fechas, h = g("Total Nacional Hombres").v[st.indSexo], m = g("Total Nacional Mujeres").v[st.indSexo];
    const brecha = F.map((f, i) => h[i] != null && m[i] != null ? +(m[i] - h[i]).toFixed(2) : null);
    $("emp-sexo-t").textContent = `${IND[st.indSexo]}: mujeres y hombres`;
    serie("emp-sexo", F, [{label: "Mujeres", data: m, color: css("--s2"), ancho: 2.5}, {label: "Hombres", data: h, color: css("--s1"), ancho: 2.5}],
          {unidad: "%", fmtValor: x => fmt(x, 1) + "%"});
    const pos = css("--s2"), neg = css("--s1");
    serie("emp-brecha", F, [{label: "Brecha: mujeres − hombres (puntos)", data: brecha, tipo: "bar", colores: brecha.map(b => b == null ? null : b >= 0 ? pos : neg)}],
          {fmtValor: x => (x > 0 ? "+" : "") + fmt(x, 1) + " pts", eje0: true, despues: (i0, i1) => {
      let k = i1; while (k > i0 && (h[k] == null || m[k] == null)) k--;
      const f = F[k], hi = h[k], mi = m[k], b = mi - hi;
      const tramo = brecha.slice(i0, i1 + 1).filter(x => x != null), prom = tramo.reduce((a, c) => a + c, 0) / (tramo.length || 1);
      const sentido = {td: b > 0 ? "más alta para las mujeres: proporcionalmente, más mujeres que hombres buscan trabajo y no lo encuentran" : "más alta para los hombres",
                       to: b < 0 ? "más baja para las mujeres: proporcionalmente, menos mujeres que hombres tienen trabajo" : "más alta para las mujeres",
                       tgp: b < 0 ? "más baja para las mujeres: menos mujeres que hombres trabajan o buscan trabajo; muchas están por fuera del mercado laboral, por ejemplo en oficios del hogar" : "más alta para las mujeres"}[st.indSexo];
      $("emp-sexo-txt").innerHTML = `En <strong>${etqMesLargo(f)}</strong> la ${IND[st.indSexo].toLowerCase()} fue <strong>${fmt(mi, 1)}% para las mujeres</strong> y <strong>${fmt(hi, 1)}% para los hombres</strong>: ` +
        `una diferencia de ${fmt(Math.abs(b), 1)} puntos, ${sentido}. ` +
        `Las barras muestran esa diferencia mes a mes: hacia arriba, en el color de las mujeres, su tasa es mayor; hacia abajo, en el color de los hombres, es mayor la de ellos. En el periodo elegido la brecha promedió ${fmt(prom, 1)} puntos.`;
    }});
  }

  function sectores() {
    const f = st.mes, f12 = hace(f, 12);
    const lista = st.d[st.desg].filter(x => x.nombre !== "Total" && !/no informa/i.test(x.nombre));
    const items = lista.map(x => ({id: x.id, n: x.nombre, v: at(x.v, f) != null && at(x.v, f12) != null ? at(x.v, f) - at(x.v, f12) : null})).filter(x => x.v != null).sort((a, b) => b.v - a.v);
    $("emp-paso3-t").textContent = `¿Dónde se ganó o se perdió empleo? ${etqMes(f12)} a ${etqMes(f)}`;
    barras("emp-bar", items, {etiqueta: "Cambio en personas ocupadas (miles)", fmtValor: x => `${x >= 0 ? "+" : ""}${fmt(x, 0)} mil personas`,
      colores: x => x.v >= 0 ? css("--verde") : css("--rojo"), alClic: x => { st.rama = x.id; ramaTiempo(); irA("emp-rama-box", "center"); }});
    ramaTiempo();
  }
  function ramaTiempo() {
    const F = st.d.fechas, lista = st.d[st.desg];
    const total = lista.find(x => x.nombre === "Total") || {v: g("Total Nacional").v.ocupados};
    const sel = st.rama ? lista.find(x => x.id === st.rama) : null;
    $("emp-rama-t").textContent = sel ? `Personas ocupadas en ${sel.nombre.toLowerCase()}` : "Personas ocupadas en total";
    $("emp-rama-h").textContent = sel ? "Toca otra barra para cambiar de actividad. Miles de personas." : "Toca una barra de arriba para ver una actividad en el tiempo. Miles de personas.";
    serie("emp-rama", F, [{label: sel ? sel.nombre : "Total de ocupados", data: (sel || total).v, color: css("--grafica"), ancho: 2.5}], {fmtValor: x => fmt(x, 0) + " mil"});
  }
  function ciudades() {
    const f = st.mes;
    const cs = st.d.ciudades.map(c => ({id: c.id, n: c.nombre, v: at(c.v.td, f), resaltar: /^total/i.test(c.nombre)})).filter(x => x.v != null).sort((a, b) => b.v - a.v);
    $("emp-ciud-t").textContent = `Desempleo por ciudad, trimestre ${etqMes(hace(f, 2) || f)} a ${etqMes(f)}`;
    barras("emp-ciud", cs, {etiqueta: "Tasa de desempleo (%)", alto: 22, fmtValor: x => fmt(x, 1) + "%", colores: x => x.resaltar ? css("--muted") : css("--grafica"),
      alClic: x => { if (!x.resaltar) ciudadTiempo(x.id); }});
  }
  // la ciudad en el tiempo, dentro de esta misma sección
  function ciudadTiempo(id) {
    const F = st.d.fechas, c = st.d.ciudades.find(x => x.id === id), tot = st.d.ciudades.find(x => /^total/i.test(x.nombre));
    const series = [{label: c.nombre, data: c.v.td, color: css("--grafica"), ancho: 2.5}];
    if (tot) series.unshift({label: tot.nombre, data: tot.v.td, color: css("--muted"), ancho: 1.6});
    enElTiempo("emp-ciud-tiempo", `Desempleo en ${c.nombre}`, F, series, {unidad: "%", fmtValor: x => fmt(x, 1) + "%",
      nota: "Trimestre móvil terminado en cada mes. Toca otra ciudad para cambiarla.",
      texto: (i0, i1) => { const tr = c.v.td.slice(i0, i1 + 1).map((x, k) => [x, F[i0 + k]]).filter(x => x[0] != null); if (!tr.length) return "";
        const mn = tr.reduce((a, b) => b[0] < a[0] ? b : a), mx = tr.reduce((a, b) => b[0] > a[0] ? b : a), ul = tr.at(-1);
        return `En el trimestre terminado en <strong>${etqMesLargo(ul[1])}</strong> el desempleo en ${c.nombre} fue <strong>${fmt(ul[0], 1)}%</strong>. En el periodo elegido, lo más alto fue ${fmt(mx[0], 1)}% (${etqMes(mx[1])}) y lo más bajo ${fmt(mn[0], 1)}% (${etqMes(mn[1])}).`; }});
  }

  function render() {
    const f = st.ult, f12 = hace(f, 12);   // los datos de arriba son siempre los del último mes publicado
    const nac = g("Total Nacional"), c13 = g("Total 13 ciudades y áreas metropolitanas"), des = g("Total Nacional", "desestacionalizada");
    const td = at(nac.v.td, f), td12 = at(nac.v.td, f12);
    $("emp-k1").textContent = fmt(td, 1) + "%";
    $("emp-k1d").innerHTML = td12 == null ? "" : `<span class="${clsSigno(td - td12)}">${td >= td12 ? "▲" : "▼"} ${fmt(Math.abs(td - td12), 1)} pts</span> vs ${etqMes(f12)}`;
    const t13 = at(c13.v.td, f), t1312 = at(c13.v.td, f12);
    $("emp-k2").textContent = fmt(t13, 1) + "%";
    $("emp-k2d").innerHTML = t1312 == null ? "" : `${etqMes(f12)}: ${fmt(t1312, 1)}%`;
    $("emp-k3").textContent = fmt(at(des.v.td, f), 1) + "%";
    const oc = at(nac.v.ocupados, f), oc12 = at(nac.v.ocupados, f12);
    $("emp-k4").textContent = fmt(oc / 1000, 1) + " M";
    $("emp-k4d").innerHTML = oc12 == null ? "" : `<span class="${oc >= oc12 ? "" : "pos"}">${oc >= oc12 ? "+" : "−"}${fmt(Math.abs(oc - oc12), 0)} mil</span> en un año`;
    historia(); sexo(); sectores(); ciudades();
  }
  return {iniciar, render};
})());
