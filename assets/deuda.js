// Pestaña: Deuda del Gobierno Nacional Central (Ministerio de Hacienda, vía Banco de la República)
registrar("deuda", (() => {
  let D = null;
  const st = {vista: "total", unidad: "pib"};
  const bill = (x, d = 1) => x == null ? "–" : `${x < 0 ? "−" : ""}$${fmt(Math.abs(x), d)} billones`;
  const suma = (arr, i0, i1) => arr.slice(i0, i1 + 1).reduce((a, b) => a + (b || 0), 0);
  const mesesTxt = (i0, i1) => `${etqMesLargo(D.fechas[i0])} y ${etqMesLargo(D.fechas[i1])}`;

  async function iniciar() {
    D = await json("web/deuda.json");
    seg("deu-vista", x => { st.vista = x; nueva(); });
    seg("deu-unidad", x => { st.unidad = x; saldo(); });
  }

  // --- 1. deuda nueva neta, mes a mes
  function nueva() {
    const F = D.fechas;
    const series = st.vista === "total"
      ? [{label: "Deuda nueva neta (total)", data: D.total, tipo: "bar", color: css("--grafica")}]
      : [{label: "Interna (en pesos, sobre todo bonos TES)", data: D.interno, tipo: "bar", color: css("--s1")},
         {label: "Externa (en dólares y otras monedas)", data: D.externo, tipo: "bar", color: css("--s3")},
         {label: "Total", data: D.total, color: css("--ink"), ancho: 2}];
    $("deu-nueva-h").textContent = st.vista === "total"
      ? "Cada barra es lo que el Gobierno pidió prestado en el mes menos lo que pagó de deudas anteriores. Una barra hacia abajo quiere decir que ese mes pagó más de lo que pidió. Cifras en billones de pesos (un billón son un millón de millones)."
      : "La deuda interna es la que se toma en Colombia y en pesos (sobre todo bonos llamados TES); la externa, la que se toma afuera, en dólares u otras monedas (bonos en el exterior y créditos de entidades como el BID o el Banco Mundial). La línea negra es el total (en la vista por año, la barra negra).";
    serie("deu-nueva", F, series, {agregar: "suma", fmtValor: x => bill(x), eje0: true, despues: (i0, i1) => {
      const t = suma(D.total, i0, i1), it = suma(D.interno, i0, i1), ex = suma(D.externo, i0, i1), n = i1 - i0 + 1;
      let txt = `Entre ${mesesTxt(i0, i1)} el Gobierno tomó <strong>${bill(t)} de deuda nueva neta</strong>` +
        (n > 1 ? `, unos ${bill(t / n)} por mes en promedio` : "") + `. `;
      // mismo periodo un año antes
      if (n <= 12 && i0 - 12 >= 0) {
        const t0 = suma(D.total, i0 - 12, i1 - 12);
        txt += `En los mismos meses del año anterior habían sido ${bill(t0)}: ` +
          (Math.abs(t - t0) < 0.05 * Math.abs(t0) ? "<strong>casi lo mismo</strong>. " : `<strong>${t > t0 ? "se endeudó más" : "se endeudó menos"}</strong>. `);
      }
      const parte = (x, nombre, donde) => x >= 0 ? `${bill(x)} fueron deuda ${nombre}` : `la deuda ${nombre} bajó ${bill(-x)} (pagó más de lo que pidió ${donde})`;
      txt += `Por partes: ${parte(it, "interna", "en el país")} y ${parte(ex, "externa", "afuera")}. `;
      // meses en que una parte compensa casi del todo a la otra: canje de unas deudas por otras
      const canjes = [];
      for (let i = i0; i <= i1; i++) {
        const a = D.interno[i], b = D.externo[i], menor = Math.min(Math.abs(a), Math.abs(b));
        if (menor > 15 && Math.sign(a) !== Math.sign(b) && Math.abs(a + b) < 0.35 * Math.max(Math.abs(a), Math.abs(b))) canjes.push([i, menor]);
      }
      if (canjes.length) {
        const i = canjes.reduce((x, y) => y[1] > x[1] ? y : x)[0], subeInt = D.interno[i] > 0;
        txt += `Ojo con ${etqMesLargo(F[i])}: la deuda ${subeInt ? "interna" : "externa"} subió ${bill(Math.abs(subeInt ? D.interno[i] : D.externo[i]))} y la ${subeInt ? "externa" : "interna"} bajó ${bill(Math.abs(subeInt ? D.externo[i] : D.interno[i]))}. ` +
          `No es que se haya endeudado ni pagado tanto: cambió unas deudas por otras (pidió prestado ${subeInt ? "en pesos" : "afuera"} para pagar deudas ${subeInt ? "externas" : "internas"}), y en el total casi no pesa. ` +
          (canjes.length > 1 ? `En el periodo elegido pasa algo parecido en ${canjes.length === 2 ? "otro mes" : `otros ${canjes.length - 1} meses`}. ` : "");
      }
      txt += `Esta deuda nueva sirve para cubrir el hueco entre lo que el Gobierno gasta y lo que recibe en impuestos (el déficit).`;
      $("deu-nueva-txt").innerHTML = txt;
    }});
  }

  // --- 2. el saldo total de la deuda, año a año
  function saldo() {
    const A = D.anios.map(String), pib = st.unidad === "pib";
    const v = pib ? D.pct_pib : D.saldo;
    const f = pib ? (x => x == null ? "–" : fmt(x, 1) + "% del PIB") : (x => bill(x, 0));
    $("deu-saldo-h").textContent = pib
      ? "Toda la deuda que el Gobierno tenía al final de cada año, comparada con el tamaño de la economía (el PIB, todo lo que el país produce en un año). Es la forma más usada de medirla porque permite comparar años y países."
      : "Toda la deuda que el Gobierno tenía al final de cada año, en billones de pesos de cada año. Es un cálculo aproximado (el porcentaje del PIB por el PIB del año) y no descuenta la inflación, así que crece casi siempre.";
    serie("deu-saldo", A, [{label: pib ? "Deuda del Gobierno (% del PIB)" : "Deuda del Gobierno (billones de pesos)", data: v, color: css("--grafica"), ancho: 3, puntos: true}],
      {fmtValor: f, eje0: true, despues: (i0, i1) => {
        const u = i1, p = D.pct_pib;
        if (!pib) {
          const S = D.saldo, k10 = Math.max(i0, u - 10);
          $("deu-saldo-txt").innerHTML = `Al cierre de <strong>${A[u]}</strong> el Gobierno debía unos <strong>${bill(S[u], 0)}</strong>` + (u >= 1 ? `, ${bill(S[u] - S[u - 1], 0)} más que un año antes` : "") + `. ` +
            (k10 < u ? `En ${A[k10]} debía ${bill(S[k10], 0)}: en ${u - k10} años la deuda se multiplicó por ${fmt(S[u] / S[k10], 1)}. ` : "") +
            `Pero en pesos casi siempre crece, porque los precios y la economía también crecen. Para saber si de verdad pesa más, mírala como % del PIB: hoy es ${fmt(p[u], 1)}%, frente a ${fmt(p[k10], 1)}% en ${A[k10]}.`;
          return;
        }
        let txt = `Al cierre de <strong>${A[u]}</strong> la deuda del Gobierno era <strong>${fmt(p[u], 1)}% del PIB</strong>, unos ${bill(D.saldo[u], 0)}: ` +
          `por cada 100 pesos que produce el país en un año, el Gobierno debe unos ${fmt(p[u], 0)}. `;
        if (u >= 1) { const d = p[u] - p[u - 1]; txt += Math.abs(d) < 0.5 ? `Casi igual que en ${A[u - 1]}. ` : `En ${A[u - 1]} era ${fmt(p[u - 1], 1)}%: <strong>${d > 0 ? "subió" : "bajó"} ${fmt(Math.abs(d), 1)} puntos</strong> en un año. `; }
        if (u - i0 >= 5) txt += `Al comienzo del periodo elegido (${A[i0]}) era ${fmt(p[i0], 1)}% del PIB. `;
        const k20 = A.indexOf("2020");
        if (k20 > i0 && k20 <= u) txt += `El salto más fuerte fue en 2020, con la pandemia: pasó de ${fmt(p[k20 - 1], 1)}% a ${fmt(p[k20], 1)}% del PIB, porque el Gobierno se endeudó para pagar ayudas mientras la economía caía. `;
        const tramo = p.slice(i0, u + 1), mx = Math.max(...tramo), kmx = i0 + tramo.indexOf(mx);
        txt += kmx === u ? `<strong>${A[u]} es el nivel más alto</strong> del periodo elegido.` : `El nivel más alto del periodo elegido fue ${fmt(mx, 1)}% en ${A[kmx]}.`;
        $("deu-saldo-txt").innerHTML = txt;
      }});
  }

  function render() {
    const F = D.fechas, n = F.length - 1, fu = F[n], y = fu.slice(0, 4), m = +fu.slice(5, 7);
    const corrido = (arr, yy) => F.reduce((a, f, i) => a + (f.slice(0, 4) === String(yy) && +f.slice(5, 7) <= m ? arr[i] || 0 : 0), 0);
    const u = D.anios.length - 1, p = D.pct_pib;
    const tramo = m === 12 ? `todo ${y}` : `ene–${MESES[m - 1]} ${y}`;
    $("deu-ultima").textContent = `Deuda nueva: hasta ${etqMesLargo(fu)} · Deuda total: cierre de ${D.anios[u]}`;
    $("deu-k1").textContent = fmt(p[u], 1) + "% del PIB";
    $("deu-k1d").innerHTML = `<span class="${clsSigno(p[u] - p[u - 1])}">${p[u] >= p[u - 1] ? "▲" : "▼"} ${fmt(Math.abs(p[u] - p[u - 1]), 1)} pts</span> vs ${D.anios[u - 1]}`;
    $("deu-k2").textContent = bill(D.saldo[u], 0);
    $("deu-k2d").textContent = `aproximado, al cierre de ${D.anios[u]}`;
    const c = corrido(D.total, y), c0 = corrido(D.total, +y - 1);
    $("deu-k3").textContent = bill(c);
    $("deu-k3d").textContent = `${tramo} · un año antes: ${bill(c0)}`;
    const ii = corrido(D.intereses, y), i0 = corrido(D.intereses, +y - 1);
    $("deu-k4").textContent = bill(ii);
    $("deu-k4d").textContent = `${tramo} · un año antes: ${bill(i0)}`;
    nueva(); saldo();
  }
  return {iniciar, render};
})());
