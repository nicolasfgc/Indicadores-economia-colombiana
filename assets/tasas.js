// Pestaña: Tasas de interés y dólar
registrar("tasas", (() => {
  let D = null;
  const NOMBRES = {TPM: "Tasa del Banco de la República", IBR_ON: "IBR a un día", IBR_3M: "IBR a 3 meses", TIB: "Interbancaria (TIB)", DTF_90: "DTF 90 días", CDT_90: "CDT 90 días"};
  const fechaLarga = f => { const [y, m, d] = f.split("-"); return `${+d} de ${MESES_L[+m - 1]} de ${y}`; };
  const fDia = f => { const [y, m, d] = f.split("-"); return `${+d} ${MESES[+m - 1]} ${y.slice(2)}`; };

  async function iniciar() { D = await json("web/tasas.json"); }

  function render() {
    const u = D.ultimos, V = D.valores, F = D.fechas;
    $("tas-k1").textContent = "$" + fmt(u.TRM[1], 2); $("tas-k1d").textContent = fechaLarga(u.TRM[0]);
    $("tas-k2").textContent = fmt(u.TPM[1], 2) + "%"; $("tas-k2d").textContent = "vigente al " + fechaLarga(u.TPM[0]);
    $("tas-k3").textContent = fmt(u.IBR_ON[1], 2) + "%"; $("tas-k3d").textContent = fechaLarga(u.IBR_ON[0]);
    $("tas-k4").textContent = "$" + fmt(u.UVR[1], 2); $("tas-k4d").textContent = fechaLarga(u.UVR[0]);

    // dólar
    const ft = F.filter((f, i) => V.TRM.trm_promedio[i] != null), it = ft.map(f => F.indexOf(f));
    const trm = it.map(i => V.TRM.trm_promedio[i]);
    serie("tas-trm", ft, [{label: "TRM promedio del mes", data: trm, color: css("--accent"), ancho: 2.5}], {fmtValor: x => "$" + fmt(x, 0), despues: (i0, i1) => {
      const a = trm[i0], b = trm[i1], tr = trm.slice(i0, i1 + 1), mx = Math.max(...tr), mn = Math.min(...tr);
      const c = (b / a - 1) * 100;
      $("tas-trm-txt").innerHTML = `Entre <strong>${etqMes(ft[i0])}</strong> y <strong>${etqMes(ft[i1])}</strong> el dólar pasó de $${fmt(a, 0)} a $${fmt(b, 0)}: <strong>${c >= 0 ? "subió" : "bajó"} ${fmt(Math.abs(c), 1)}%</strong>. ` +
        `El promedio mensual más alto fue $${fmt(mx, 0)} (${etqMes(ft[i0 + tr.indexOf(mx)])}, gobierno ${gobiernoDe(ft[i0 + tr.indexOf(mx)])}) y el más bajo $${fmt(mn, 0)} (${etqMes(ft[i0 + tr.indexOf(mn)])}).`;
    }});
    const dd = D.trm_diaria;
    serie("tas-trmd", dd.fechas, [{label: "TRM diaria", data: dd.valores, color: css("--accent")}], {fmtX: fDia, fmtValor: x => "$" + fmt(x, 0), inicio: dd.fechas.length, atajos: [["1 mes", 31], ["3 meses", 92], ["6 meses", 183], ["Todo", 0]]});

    // tasas de interés (cierre de cada mes)
    const ids = ["TPM", "IBR_ON", "IBR_3M", "TIB", "DTF_90"];
    const fr = F.filter(f => f >= "1998-01-01");
    const datos = id => fr.map(f => (V[id].fin_mes || V[id].promedio)[F.indexOf(f)]);
    const tpm = datos("TPM");
    serie("tas-tasas", fr, ids.map(id => ({label: NOMBRES[id], data: datos(id), ancho: id === "TPM" ? 3 : 1.5, dash: id === "DTF_90" ? [4, 3] : []})), {unidad: "%", despues: (i0, i1) => {
      const tramo = tpm.slice(i0, i1 + 1).map((x, k) => [x, fr[i0 + k]]).filter(x => x[0] != null); if (!tramo.length) return;
      const mx = tramo.reduce((a, b) => b[0] > a[0] ? b : a), mn = tramo.reduce((a, b) => b[0] < a[0] ? b : a);
      let cambios = 0; for (let k = 1; k < tramo.length; k++) if (tramo[k][0] !== tramo[k - 1][0]) cambios++;
      $("tas-tasas-txt").innerHTML = `Entre <strong>${etqMes(tramo[0][1])}</strong> y <strong>${etqMes(tramo.at(-1)[1])}</strong> la tasa del Banco de la República pasó de ${fmt(tramo[0][0])}% a <strong>${fmt(tramo.at(-1)[0])}%</strong>, ` +
        `con ${cambios} meses en que cambió. Llegó a un máximo de ${fmt(mx[0])}% (${etqMes(mx[1])}) y a un mínimo de ${fmt(mn[0])}% (${etqMes(mn[1])}). ` +
        `Cuando el Banco la sube, las demás tasas la siguen y los créditos se encarecen; así busca frenar la inflación.`;
    }});
    const fu = F.filter((f, i) => V.UVR.fin_mes[i] != null);
    serie("tas-uvr", fu, [{label: "UVR fin de mes", data: fu.map(f => V.UVR.fin_mes[F.indexOf(f)]), color: css("--s2"), ancho: 2.5}], {fmtValor: x => "$" + fmt(x, 2)});
  }
  return {iniciar, render};
})());
