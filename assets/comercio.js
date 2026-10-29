// Pestaña: Comercio exterior — primero el panorama (cuánto vendemos y compramos), luego qué, con quién y el detalle del mes
registrar("comercio", (() => {
  let D = null;
  const st = {mes: null, ult: null, tipoMed: "usd", anioPais: null, vDesg: "cap", vMed: "valor", cDesg: "uso", cMed: "valor", nodo: "IMP_CUODE_TOTAL"};
  const S = id => D.series[id] || ["", "", "", ""];
  const nombre = id => S(id)[0];
  const serieDe = id => D.usd[id] || [];
  const V = (id, f) => { const i = D.fechas.indexOf(f); return i < 0 ? null : (D.usd[id] || [])[i] ?? null; };
  const hace = (f, n) => D.fechas[D.fechas.indexOf(f) - n];
  const pct = (a, b) => a != null && b ? (a / b - 1) * 100 : null;
  // dinero en millones de dólares -> texto
  const dol = (x, d = 0) => x == null ? "–" : `${x < 0 ? "−" : ""}US$${Math.abs(x) >= 1000 ? fmt(Math.abs(x) / 1000, 1) + " mil millones" : fmt(Math.abs(x), d) + " millones"}`;
  const dolCorto = x => x == null ? "–" : `${x < 0 ? "−" : ""}$${fmt(Math.abs(x), 0)}`;
  const cambioTxt = c => c == null ? "" : `${c >= 0 ? "▲" : "▼"} ${fmt(Math.abs(c), 1)}%`;
  const hijos = padre => Object.keys(D.series).filter(id => S(id)[3] === padre && S(id)[1] === "impo_cuode");
  const deTema = tema => Object.keys(D.series).filter(id => S(id)[1] === tema);
  const colPos = () => css("--s4"), colNeg = () => css("--up");
  const listaY = a => a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " y " + a.at(-1);
  const deCada100 = (p, que) => `${fmt(p, 0)} ${Math.round(p) === 1 ? "fue" : "fueron"} ${que}`;

  async function iniciar() {
    D = await json("web/comercio.json");
    let u = D.fechas.length - 1; while (V("BAL_EXPO", D.fechas[u]) == null) u--;
    st.ult = st.mes = D.fechas[u];
    $("com-ultima").textContent = "Último dato: " + etqMesLargo(st.ult);
    const meses = D.fechas.filter(f => f >= "2008-01-01" && f <= st.ult);
    periodo("com-periodo", meses, st.mes, f => { st.mes = f; vendido(); comprado(); });
    seg("com-tipo-med", x => { st.tipoMed = x; tipos(); });
    seg("com-v-desg", x => { st.vDesg = x; $("com-v-tiempo").hidden = true; vendido(); });
    seg("com-v-med", x => { st.vMed = x; vendido(); });
    seg("com-c-desg", x => { st.cDesg = x; st.nodo = "IMP_CUODE_TOTAL"; $("com-c-tiempo").hidden = true; comprado(); });
    seg("com-c-med", x => { st.cMed = x; comprado(); });
    // años para la balanza por país: el último año completo y el año en curso
    const anios = D.anios.filter(a => D.anual.BAL_PAIS_TOTAL?.[D.anios.indexOf(a)] != null);
    const ua = anios.at(-1), parcial = +st.ult.slice(5, 7) < 12 && String(ua) === st.ult.slice(0, 4);
    const opciones = parcial ? [[ua - 1, String(ua - 1)], [ua, `${ua} (ene–${MESES[+st.ult.slice(5, 7) - 1]})`]] : [[ua, String(ua)]];
    st.anioPais = opciones[0][0];
    $("com-paises-anio").innerHTML = opciones.map(([a, t], k) => `<button data-v="${a}"${k === 0 ? ' class="on"' : ""}>${t}</button>`).join("");
    st.parcial = parcial ? ua : null;
    seg("com-paises-anio", x => { st.anioPais = +x; paises(); });
  }

  // ---------------------------------------------------------- arriba: el último mes
  function kpis() {
    const f = st.ult, f12 = hace(f, 12), y = f.slice(0, 4);
    const e = V("BAL_EXPO", f), i = V("IMP_CUODE_TOTAL", f) ?? V("BAL_IMPO", f), b = V("BAL_BALANZA", f);
    $("com-k1").textContent = dol(e);
    $("com-k1d").textContent = `${cambioTxt(pct(e, V("BAL_EXPO", f12)))} frente a ${etqMes(f12)}`;
    $("com-k2").textContent = dol(i);
    $("com-k2d").textContent = `${cambioTxt(pct(i, V("IMP_CUODE_TOTAL", f12) ?? V("BAL_IMPO", f12)))} frente a ${etqMes(f12)} (CIF)`;
    $("com-k3").textContent = dol(b);
    $("com-k3d").textContent = b < 0 ? "déficit: se compró más de lo que se vendió" : "superávit: se vendió más de lo que se compró";
    const corr = a => D.fechas.filter(x => x.startsWith(a) && x <= `${a}${f.slice(4)}`).reduce((s, x) => s + (V("BAL_BALANZA", x) || 0), 0);
    const c1 = corr(y), c0 = corr(String(+y - 1));
    $("com-k4").textContent = dol(c1);
    $("com-k4d").textContent = `ene–${MESES[+f.slice(5, 7) - 1]} ${y}. Un año antes: ${dol(c0)}`;
  }

  // ---------------------------------------------------------- 1 · panorama
  function panorama() {
    const F = D.fechas.filter(f => f >= "2007-01-01" && f <= st.ult);
    const e = F.map(f => V("BAL_EXPO", f)), im = F.map(f => V("BAL_IMPO", f)), b = F.map(f => V("BAL_BALANZA", f));
    serie("com-pan", F, [
      {label: "Exportaciones", data: e, color: css("--accent"), ancho: 2.5},
      {label: "Importaciones", data: im, color: css("--naranja"), ancho: 2.5},
      {label: "Balanza comercial", data: b, tipo: "bar", colores: b.map(x => x < 0 ? colNeg() : colPos())}],
      {fmtValor: x => dolCorto(x) + " M", eje0: true, referencias: [{y: 0, t: ""}], despues: (i0, i1) => {
        const sum = a => a.slice(i0, i1 + 1).reduce((s, x) => s + (x || 0), 0);
        const se = sum(e), si = sum(im), sb = sum(b), n = i1 - i0 + 1, def = b.slice(i0, i1 + 1).filter(x => x < 0).length;
        const peor = b.slice(i0, i1 + 1).reduce((m, x, k) => x < m[0] ? [x, F[i0 + k]] : m, [Infinity, ""]);
        $("com-pan-txt").innerHTML = `Entre <strong>${etqMes(F[i0])}</strong> y <strong>${etqMes(F[i1])}</strong> Colombia exportó <strong>${dol(se)}</strong> e importó ${dol(si)} (sin flete ni seguro). ` +
          `La balanza fue ${sb < 0 ? "un <strong>déficit</strong>" : "un <strong>superávit</strong>"} de ${dol(Math.abs(sb))}: el país compró más de lo que vendió en ${def} de ${n} ${n === 1 ? "mes" : "meses"}. ` +
          (peor[1] ? `El mayor déficit mensual fue en ${etqMes(peor[1])} (${dol(Math.abs(peor[0]))}, gobierno ${gobiernoDe(peor[1])}). ` : "") +
          `Un déficit no es malo en sí mismo: puede reflejar que se están comprando máquinas e insumos para producir, pero hay que financiarlo con dólares que entren por otro lado (inversión extranjera, remesas, deuda).`;
      }});
  }

  // ---------------------------------------------------------- 2 · qué vendemos
  const TIPOS = ["EXP_TIPO_PETROLEO", "EXP_TIPO_CARBON", "EXP_TIPO_CAFE", "EXP_TIPO_FERRONIQUEL", "EXP_TIPO_NOTRADICIONALES"];
  function tipos() {
    const ton = st.tipoMed === "toneladas";
    const ids = ton ? TIPOS.slice(0, 4) : TIPOS;
    const F = D.fechas.filter(f => f <= st.ult && V("EXP_TIPO_TOTAL", f) != null);
    const dat = id => F.map(f => ton ? (D.toneladas[id] || [])[D.fechas.indexOf(f)] ?? null : V(id, f));
    const ds = ids.map((id, k) => ({label: id === "EXP_TIPO_NOTRADICIONALES" ? "No tradicionales" : nombre(id), data: dat(id), color: DISTINTOS()[k], ancho: 2.2}));
    serie("com-tipo", F, ds, {fmtValor: ton ? (x => fmt(x / 1000, 0) + " mil t") : (x => dolCorto(x) + " M"), despues: (i0, i1) => {
      const sum = id => F.slice(i0, i1 + 1).reduce((s, f) => s + (V(id, f) || 0), 0), tot = sum("EXP_TIPO_TOTAL");
      const part = TIPOS.map(id => [id, sum(id) / tot * 100]);
      const nom = id => id === "EXP_TIPO_NOTRADICIONALES" ? "no tradicionales" : nombre(id).toLowerCase();
      const minero = part.filter(p => ["EXP_TIPO_PETROLEO", "EXP_TIPO_CARBON"].includes(p[0])).reduce((s, p) => s + p[1], 0);
      const f1 = F[i1], f0 = hace(f1, 12);
      const cambios = TIPOS.map(id => [id, pct(V(id, f1), V(id, f0)), ton ? null : null]).filter(x => x[1] != null);
      let txt = `Entre <strong>${etqMes(F[i0])}</strong> y <strong>${etqMes(F[i1])}</strong>, de cada 100 dólares exportados ` +
        listaY(part.map(([id, p]) => deCada100(p, nom(id)))) + ". " +
        `Petróleo y carbón juntos pesaron <strong>${fmt(minero, 0)}%</strong>: por eso las exportaciones dependen tanto de los precios internacionales de la energía. `;
      if (f0) txt += `En ${etqMes(f1)}, frente a ${etqMes(f0)}: ` + listaY(cambios.map(([id, c]) => `${nom(id)} ${c >= 0 ? "subió" : "bajó"} ${fmt(Math.abs(c), 1)}%`)) + ` (en dólares).`;
      if (ton) {
        const tc = TIPOS.slice(0, 4).map(id => [id, pct((D.toneladas[id] || [])[D.fechas.indexOf(f1)], (D.toneladas[id] || [])[D.fechas.indexOf(f0)])]).filter(x => x[1] != null);
        txt += ` En volumen: ` + listaY(tc.map(([id, c]) => `${nom(id)} ${c >= 0 ? "subió" : "bajó"} ${fmt(Math.abs(c), 1)}%`)) + `.`;
      }
      $("com-tipo-txt").innerHTML = txt;
    }});
  }

  // ---------------------------------------------------------- 3 · qué compramos
  const USOS = ["IMP_CUODE_C", "IMP_CUODE_M", "IMP_CUODE_K"];
  function usos() {
    const F = D.fechas.filter(f => f <= st.ult && V("IMP_CUODE_TOTAL", f) != null);
    serie("com-uso", F, USOS.map((id, k) => ({label: nombre(id), data: F.map(f => V(id, f)), color: DISTINTOS()[k], ancho: 2.5})),
      {fmtValor: x => dolCorto(x) + " M", despues: (i0, i1) => {
        const sum = id => F.slice(i0, i1 + 1).reduce((s, f) => s + (V(id, f) || 0), 0), tot = sum("IMP_CUODE_TOTAL");
        const f1 = F[i1], f0 = hace(f1, 12);
        let txt = `Entre <strong>${etqMes(F[i0])}</strong> y <strong>${etqMes(f1)}</strong>, de cada 100 dólares importados ` +
          listaY(USOS.map(id => deCada100(sum(id) / tot * 100, nombre(id).toLowerCase()))) + ". ";
        if (V("IMP_CUODE_TOTAL", f0) != null) {
          const ck = pct(V("IMP_CUODE_K", f1), V("IMP_CUODE_K", f0)), cc = pct(V("IMP_CUODE_C", f1), V("IMP_CUODE_C", f0)), cm = pct(V("IMP_CUODE_M", f1), V("IMP_CUODE_M", f0));
          txt += `En ${etqMes(f1)}, frente a un año antes, los bienes de consumo ${cc >= 0 ? "subieron" : "bajaron"} ${fmt(Math.abs(cc), 1)}%, las materias primas ${cm >= 0 ? "subieron" : "bajaron"} ${fmt(Math.abs(cm), 1)}% ` +
            `y los bienes de capital ${ck >= 0 ? "subieron" : "bajaron"} ${fmt(Math.abs(ck), 1)}%. ` +
            (ck > 5 ? "Que crezcan los bienes de capital es buena señal: las empresas están comprando maquinaria y equipo para producir más." :
             ck < -5 ? "La caída de los bienes de capital es una señal de alerta: las empresas están invirtiendo menos en maquinaria y equipo." :
             "Los bienes de capital, que muestran la inversión de las empresas, se mantienen relativamente estables.");
        }
        $("com-uso-txt").innerHTML = txt;
      }});
  }

  // ---------------------------------------------------------- 4 · con quién
  function paises() {
    const ia = D.anios.indexOf(st.anioPais), val = id => D.anual[id]?.[ia] ?? null;
    const ids = deTema("balanza_pais").filter(id => id !== "BAL_PAIS_TOTAL" && !["BAL_PAIS_ALADI", "BAL_PAIS_COMUNIDAD_ANDINA", "BAL_PAIS_MERCOSUR", "BAL_PAIS_RESTO_DE_PAISES"].includes(id));
    const items = ids.map(id => ({id, n: nombre(id), v: val(id)})).filter(x => x.v != null).sort((a, b) => b.v - a.v);
    const etq = st.anioPais === st.parcial ? `${st.anioPais} (enero a ${MESES_L[+st.ult.slice(5, 7) - 1]})` : String(st.anioPais);
    $("com-paises-t").textContent = `Balanza comercial por país, ${etq}`;
    barras("com-paises", items, {etiqueta: "Millones de dólares FOB", fmtValor: x => dol(x), colores: x => x.v < 0 ? colNeg() : colPos(), alClic: x => paisTiempo(x.id)});
    const peor = items.at(-1), mejor = items[0], tot = val("BAL_PAIS_TOTAL");
    const bloques = ["BAL_PAIS_COMUNIDAD_ANDINA", "BAL_PAIS_MERCOSUR", "BAL_PAIS_ALADI"].map(id => [nombre(id), val(id)]).filter(x => x[1] != null);
    $("com-paises-txt").innerHTML = `En ${etq} la balanza total fue ${tot < 0 ? "un déficit" : "un superávit"} de <strong>${dol(Math.abs(tot))}</strong>. ` +
      `El mayor déficit fue con <strong>${peor.n}</strong> (${dol(Math.abs(peor.v))}): le compramos mucho más de lo que le vendemos. ` +
      `El mayor superávit fue con <strong>${mejor.n}</strong> (${dol(mejor.v)}). ` +
      (bloques.length ? `Por bloques: ` + bloques.map(([n, v]) => `${n} ${v < 0 ? "déficit" : "superávit"} de ${dol(Math.abs(v))}`).join("; ") + "." : "");
  }
  function paisTiempo(id) {
    const A = D.anios.map(String), d = D.anual[id] || [];
    enElTiempo("com-pais-tiempo", `Balanza comercial con ${nombre(id)}, cada año`, A,
      [{label: "Balanza comercial", data: d, tipo: "bar", colores: d.map(x => x < 0 ? colNeg() : colPos())}],
      {fmtValor: x => dol(x), eje0: true, nota: `Millones de dólares FOB.${String(D.anios.at(-1)) === String(st.parcial) ? ` ${st.parcial} va hasta ${MESES_L[+st.ult.slice(5, 7) - 1]}.` : ""} Toca otra barra para cambiar de país.`,
       texto: (i0, i1) => { const t = d.slice(i0, i1 + 1).filter(x => x != null), neg = t.filter(x => x < 0).length;
         return `Entre ${A[i0]} y ${A[i1]} Colombia tuvo déficit con ${nombre(id)} en ${neg} de ${t.length} años.`; }});
  }

  // ---------------------------------------------------------- detalle del mes: barras y "en el tiempo"
  function barrasMes(pref, ids, med, alClic, notaDesde) {
    const f = st.mes, f0 = hace(f, 12);
    let items = ids.map(id => ({id, n: nombre(id), val: V(id, f), ant: f0 ? V(id, f0) : null})).filter(x => x.val != null && x.val > 0);
    items.sort((a, b) => b.val - a.val);
    const tot = items.reduce((s, x) => s + x.val, 0);
    const top = items.slice(0, 25);
    let lista;
    if (med === "valor") lista = top.map(x => ({...x, v: x.val}));
    else lista = top.map(x => ({...x, v: pct(x.val, x.ant)})).filter(x => x.v != null).sort((a, b) => b.v - a.v);
    barras(`${pref}-bar`, lista, {etiqueta: med === "valor" ? "Millones de dólares" : "Cambio frente al mismo mes del año anterior (%)",
      fmtValor: med === "valor" ? (x => dol(x, 1)) : (x => `${x >= 0 ? "+" : ""}${fmt(x, 1)}%`),
      colores: med === "valor" ? (() => css("--accent")) : (x => x.v < 0 ? colNeg() : colPos()), alClic});
    return {items, tot, top, f, f0, nota: items.length > 25 ? ` Se muestran los 25 más grandes de ${items.length}.` : ""};
  }
  function textoMes(r, verbo, minus = true) {
    const nm = x => minus ? x.n.toLowerCase() : x.n;
    const {items, tot, f, f0} = r;
    if (!items.length) return "";
    const top3 = items.slice(0, 3).map(x => `${nm(x)} (${dol(x.val, 1)}, ${fmt(x.val / tot * 100, 0)}% del total)`);
    const conAnt = items.filter(x => x.ant != null && x.ant > 0 && x.val > tot * 0.01);   // solo los que pesan algo, para no destacar ruido
    // solo se nombra "lo que más subió" si algo subió y "lo que más cayó" si algo cayó
    const sube = conAnt.filter(x => x.val > x.ant).sort((a, b) => (b.val - b.ant) - (a.val - a.ant))[0];
    const baja = conAnt.filter(x => x.val < x.ant).sort((a, b) => (a.val - a.ant) - (b.val - b.ant))[0];
    let t = `En <strong>${etqMesLargo(f)}</strong> ${verbo} sobre todo ${listaY(top3)}. `;
    if (f0 && (sube || baja)) t += `Frente a ${etqMes(f0)}, ` +
      (sube ? `lo que más aumentó en dólares fue ${nm(sube)} (${dol(sube.val - sube.ant, 1)} más)` : "nada de lo principal aumentó") +
      (baja ? ` y lo que más cayó fue ${nm(baja)} (${dol(baja.ant - baja.val, 1)} menos).` : `; ninguno de los principales cayó.`);
    return t;
  }
  function tiempoDe(boxId, id, titulo) {
    const F = D.fechas.filter(f => f <= st.ult && V(id, f) != null), d = F.map(f => V(id, f));
    enElTiempo(boxId, titulo, F, [{label: nombre(id), data: d, color: css("--accent"), ancho: 2.5}],
      {fmtValor: x => dol(x, 1), texto: (i0, i1) => {
        const f1 = F[i1], f0 = hace(f1, 12), a = V(id, f1), b = f0 ? V(id, f0) : null, c = pct(a, b);
        const prom = d.slice(i0, i1 + 1).reduce((s, x) => s + (x || 0), 0) / (i1 - i0 + 1);
        return `En ${etqMesLargo(f1)}: ${dol(a, 1)}` + (c != null ? `, ${c >= 0 ? "un aumento" : "una caída"} de ${fmt(Math.abs(c), 1)}% frente a ${etqMes(f0)}` : "") +
          `. En el periodo elegido promedió ${dol(prom, 1)} al mes.`; }});
  }

  // ---------------------------------------------------------- 5 · lo que se vendió
  function vendido() {
    const porCap = st.vDesg === "cap";
    const ids = porCap ? deTema("expo_capitulo") : deTema("expo_destino").filter(id => id !== "EXP_DEST_RESTO_DE_PAISES");
    $("com-v-t").textContent = `${porCap ? "Qué productos" : "A qué países"} se exportó en ${etqMesLargo(st.mes)}`;
    const r = barrasMes("com-v", ids, st.vMed, x => tiempoDe("com-v-tiempo", x.id, `Exportaciones de ${x.n.toLowerCase()} en el tiempo`));
    $("com-v-h").textContent = (porCap ? "Productos agrupados en los capítulos del arancel de aduanas." : "Principales países y bloques de destino (el resto de países no aparece por separado).") +
      (st.vMed === "cambio" ? " Cambio de los más grandes frente al mismo mes del año anterior." : "") + r.nota + " Toca una barra para verla en el tiempo.";
    $("com-v-txt").innerHTML = textoMes(r, porCap ? "se exportó" : "se le vendió a", porCap);
  }

  // ---------------------------------------------------------- 6 · lo que se compró
  function caminoUso(id) { const out = []; let x = id; while (x) { out.unshift(x); x = S(x)[3]; } return out; }
  function comprado() {
    const f = st.mes;
    let ids, alClic;
    const box = $("com-c-migas");
    if (st.cDesg === "uso") {
      if (V("IMP_CUODE_TOTAL", f) == null) {
        box.innerHTML = "";
        $("com-c-t").textContent = `Para qué se importó en ${etqMesLargo(f)}`;
        $("com-c-h").textContent = "El detalle por uso empieza en abril de 2022. Escoge un mes posterior, o mira por producto o por origen.";
        barras("com-c-bar", [], {}); $("com-c-txt").innerHTML = ""; return;
      }
      const hs = hijos(st.nodo);
      if (!hs.length) st.nodo = S(st.nodo)[3] || "IMP_CUODE_TOTAL";
      ids = hijos(st.nodo);
      migas("com-c-migas", caminoUso(st.nodo).map(id => ({t: id === "IMP_CUODE_TOTAL" ? "Todas las importaciones" : nombre(id), id})), p => { st.nodo = p.id; comprado(); });
      if (st.nodo !== "IMP_CUODE_TOTAL") box.insertAdjacentHTML("beforeend", `<button class="ver sec" id="com-c-nodo-t">Ver “${nombre(st.nodo)}” en el tiempo</button>`);
      $("com-c-nodo-t")?.addEventListener("click", () => tiempoDe("com-c-tiempo", st.nodo, `Importaciones de ${nombre(st.nodo).toLowerCase()} en el tiempo`));
      alClic = x => hijos(x.id).length ? (st.nodo = x.id, comprado(), irA("com-c")) : tiempoDe("com-c-tiempo", x.id, `Importaciones de ${x.n.toLowerCase()} en el tiempo`);
      $("com-c-t").textContent = `Para qué se importó en ${etqMesLargo(f)}`;
    } else {
      box.innerHTML = "";
      ids = deTema(st.cDesg === "cap" ? "impo_capitulo" : "impo_origen");
      alClic = x => tiempoDe("com-c-tiempo", x.id, `Importaciones ${st.cDesg === "cap" ? "de " + x.n.toLowerCase() : "desde " + x.n} en el tiempo`);
      $("com-c-t").textContent = `${st.cDesg === "cap" ? "Qué productos" : "De qué países"} se importó en ${etqMesLargo(f)}`;
    }
    const r = barrasMes("com-c", ids, st.cMed, alClic);
    $("com-c-h").textContent = (st.cDesg === "uso" ? "De lo general a lo específico: toca una barra para ver qué contiene; en el último nivel, para verla en el tiempo." :
      st.cDesg === "cap" ? "Productos agrupados en los capítulos del arancel de aduanas. Toca una barra para verla en el tiempo." :
      "Principales países de origen (no suman el total: el resto de países no aparece por separado). Toca una barra para verla en el tiempo.") +
      (st.cMed === "cambio" ? " Cambio de los más grandes frente al mismo mes del año anterior." : "") + r.nota + " Valores CIF.";
    $("com-c-txt").innerHTML = textoMes(r, st.cDesg === "orig" ? "se le compró a" : "se importó", st.cDesg !== "orig");
  }

  function render() { kpis(); panorama(); tipos(); usos(); paises(); vendido(); comprado(); }
  return {iniciar, render};
})());
