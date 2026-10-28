// Pestaña: Tasas de interés y dólar
registrar("tasas", (() => {
  const st = {d: null, rTrm: "10", rTasas: "10"};
  const NOMBRES = {TPM: "Política monetaria", IBR_ON: "IBR a un día", IBR_3M: "IBR a 3 meses", TIB: "Interbancaria (TIB)", DTF_90: "DTF 90 días", CDT_90: "CDT 90 días"};
  const desde = (anios) => anios === "todo" ? "0000" : `${new Date().getFullYear() - +anios}-01-01`;
  const fechaLarga = f => { const [y, m, d] = f.split("-"); return `${+d} de ${MESES_L[+m - 1]} de ${y}`; };

  async function iniciar() {
    st.d = await json("web/tasas.json");
    seg("tas-rtrm", x => { st.rTrm = x; render(); });
    seg("tas-rtasas", x => { st.rTasas = x; render(); });
  }

  function render() {
    const u = st.d.ultimos, V = st.d.valores, F = st.d.fechas;
    $("tas-k1").textContent = "$" + fmt(u.TRM[1], 2); $("tas-k1d").textContent = fechaLarga(u.TRM[0]);
    $("tas-k2").textContent = fmt(u.TPM[1], 2) + "%"; $("tas-k2d").textContent = "vigente al " + fechaLarga(u.TPM[0]);
    $("tas-k3").textContent = fmt(u.IBR_ON[1], 2) + "%"; $("tas-k3d").textContent = fechaLarga(u.IBR_ON[0]);
    $("tas-k4").textContent = "$" + fmt(u.UVR[1], 4); $("tas-k4d").textContent = fechaLarga(u.UVR[0]);

    // TRM: promedio mensual
    const ft = F.filter(f => f >= desde(st.rTrm) && V.TRM.trm_promedio[F.indexOf(f)] != null);
    lineas("tas-trm", ft, [{label: "TRM promedio del mes", data: ft.map(f => V.TRM.trm_promedio[F.indexOf(f)]), color: css("--accent"), ancho: 2.5}],
           {fmtValor: x => "$" + fmt(x, 0)});
    const dd = st.d.trm_diaria;
    lineas("tas-trmd", dd.fechas, [{label: "TRM diaria", data: dd.valores, color: css("--accent")}],
           {fmtX: f => { const [y, m, d] = f.split("-"); return `${+d} ${MESES[+m - 1]} ${y.slice(2)}`; }, fmtValor: x => "$" + fmt(x, 0)});

    // tasas de interés: cierre de cada mes
    const ids = ["TPM", "IBR_ON", "IBR_3M", "TIB", "DTF_90"];
    const fr = F.filter(f => f >= desde(st.rTasas) && f >= "2008-01-01");
    lineas("tas-tasas", fr, ids.map((id, i) => ({label: NOMBRES[id], data: fr.map(f => (V[id].fin_mes || V[id].promedio)[F.indexOf(f)]),
      ancho: id === "TPM" ? 3 : 1.6, dash: id === "DTF_90" ? [4, 3] : []})), {unidad: "%"});

    const fu = F.filter(f => f >= desde(st.rTasas) && V.UVR.fin_mes[F.indexOf(f)] != null);
    lineas("tas-uvr", fu, [{label: "UVR fin de mes", data: fu.map(f => V.UVR.fin_mes[F.indexOf(f)]), color: css("--s2"), ancho: 2.5}], {fmtValor: x => "$" + fmt(x, 2)});
  }
  return {iniciar, render};
})());
