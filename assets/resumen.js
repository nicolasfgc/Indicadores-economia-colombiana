// Pestaña: Resumen — el dato clave de cada indicador y qué significa
registrar("resumen", (() => {
  let R = null;
  const ult = o => o.v.length - 1;
  const sube = (a, b, pal = ["subió", "bajó", "se mantuvo"]) => a > b ? pal[0] : a < b ? pal[1] : pal[2];
  const pct = (x, d = 1) => fmt(x, d) + "%";

  function mini(id, fechas, valores, color, desde = 120) {
    const i0 = Math.max(0, fechas.length - desde);
    dibujar(id, {type: "line", data: {labels: fechas.slice(i0), datasets: [{data: valores.slice(i0), borderColor: color || css("--grafica"), borderWidth: 2, pointRadius: 0, tension: .2, fill: false}]},
      options: {responsive: true, maintainAspectRatio: false, animation: false, plugins: {legend: {display: false}, tooltip: {enabled: false}, gobiernos: {activo: false}},
        scales: {x: {display: false}, y: {display: true, grid: {color: css("--line")}, ticks: {color: css("--muted"), maxTicksLimit: 3, font: {size: 10}}}}}});
  }

  async function iniciar() { R = await json("web/resumen.json"); }

  function render() {
    // --- inflación
    const I = R.ipc, ii = ult(I), f = I.fechas[ii], v = I.v[ii], vp = I.v[ii - 1], v12 = I.v[ii - 12];
    const prom = I.v.reduce((a, b) => a + b, 0) / I.v.length;
    const rango = v > 4 ? "por encima" : v < 2 ? "por debajo" : "dentro";
    $("res-ipc-num").textContent = pct(v, 2);
    $("res-ipc-cambio").textContent = `${etqMesLargo(f)} · ${sube(v, vp)} desde ${pct(vp, 2)} en ${MESES_L[+I.fechas[ii - 1].slice(5, 7) - 1]}`;
    $("res-ipc-txt").innerHTML = `Los precios de lo que compran los hogares están <strong>${pct(v, 2)} más altos que hace un año</strong>. Hace doce meses la inflación era ${pct(v12, 2)}. ` +
      `El Banco de la República busca que esté cerca del 3% (entre 2% y 4%): hoy está <strong>${rango} de ese rango</strong>. Desde 2004 el promedio ha sido ${pct(prom)}.`;
    mini("res-ipc-g", I.fechas, I.v, css("--s1"));

    // --- crecimiento
    const E = R.ise, ei = ult(E), fe = E.fechas[ei], ve = E.v[ei], vm = E.mensual_desest[ei];
    const s = E.sectores, arriba = s.slice(0, 2), abajo = s.slice(-2).reverse();
    $("res-ise-num").textContent = pct(ve, 2);
    $("res-ise-cambio").textContent = `${etqMesLargo(fe)} · crecimiento anual`;
    $("res-ise-txt").innerHTML = `La economía <strong>${ve >= 0 ? "creció" : "se contrajo"} ${pct(Math.abs(ve), 2)}</strong> frente al mismo mes del año anterior. ` +
      `Frente al mes anterior, quitando efectos de temporada, ${vm >= 0 ? "creció" : "cayó"} ${pct(Math.abs(vm), 2)}. ` +
      `Lo que más empujó: ${arriba.map(x => `${x[0].toLowerCase()} (${pct(x[1])})`).join(" y ")}. Lo que más frenó: ${abajo.map(x => `${x[0].toLowerCase()} (${pct(x[1])})`).join(" y ")}.`;
    mini("res-ise-g", E.fechas, E.v);

    // --- desempleo
    const D = R.empleo, di = ult(D), fd = D.fechas[di], td = D.v[di], td12 = D.v[di - 12], oc = D.ocupados[di], oc12 = D.ocupados[di - 12];
    $("res-emp-num").textContent = pct(td);
    $("res-emp-cambio").textContent = `${etqMesLargo(fd)} · ${sube(td, td12)} desde ${pct(td12)} hace un año`;
    $("res-emp-txt").innerHTML = `De cada 100 personas que buscan trabajo, <strong>${fmt(td, 0)} no lo encuentran</strong>. ` +
      `Hay ${fmt(oc / 1000, 1)} millones de personas ocupadas, <strong>${oc >= oc12 ? fmt(oc - oc12, 0) + " mil más" : fmt(oc12 - oc, 0) + " mil menos"}</strong> que hace un año. ` +
      `El desempleo es más alto entre las mujeres (${pct(D.mujeres)}) que entre los hombres (${pct(D.hombres)}).`;
    mini("res-emp-g", D.fechas, D.v, css("--s2"));

    // --- dólar
    const T = R.trm, [ft, vt] = T.ultimo, va = T.hace_un_anio, cambio = va ? (vt / va - 1) * 100 : null;
    $("res-trm-num").textContent = "$" + fmt(vt, 0);
    $("res-trm-cambio").textContent = `${ft.split("-").reverse().join("/")} · pesos por dólar`;
    $("res-trm-txt").innerHTML = cambio == null ? "" : `Hace un año el dólar costaba $${fmt(va, 0)}: hoy está <strong>${fmt(Math.abs(cambio), 1)}% más ${cambio < 0 ? "barato" : "caro"}</strong>. ` +
      (cambio < 0 ? "Un dólar más barato abarata lo importado y ayuda a bajar la inflación, pero reduce los ingresos en pesos de exportadores y de quienes reciben remesas."
                  : "Un dólar más caro encarece lo importado y presiona la inflación, pero aumenta los ingresos en pesos de exportadores y de quienes reciben remesas.");
    mini("res-trm-g", T.fechas, T.v, css("--s3"));

    // --- tasa del Banco de la República
    const P = R.tpm, pi = ult(P), [fp, vtpm] = P.ultimo, p12 = P.v[pi - 12], real = vtpm - v;
    $("res-tpm-num").textContent = pct(vtpm, 2);
    $("res-tpm-cambio").textContent = `vigente al ${fp.split("-").reverse().join("/")} · hace un año: ${pct(p12, 2)}`;
    $("res-tpm-txt").innerHTML = `Es la tasa a la que el Banco de la República le presta a los bancos, y de ella depende el costo de los créditos. ` +
      `En el último año <strong>${sube(vtpm, p12, ["subió", "bajó", "no cambió"])}</strong>. Si se le resta la inflación, la tasa real queda en ${pct(real, 1)}: ` +
      (real > 3 ? "es una política restrictiva, que encarece el crédito para frenar el consumo y bajar la inflación." : real > 0 ? "es una política algo restrictiva: el crédito cuesta un poco más de lo que suben los precios." : "es una política expansiva: el crédito sale barato frente a la inflación, lo que impulsa el consumo y la inversión.");
    mini("res-tpm-g", P.fechas, P.v, css("--s4"));

    // --- comercio exterior
    const C = R.comercio;
    if (C) {
      const dol = x => `${x < 0 ? "−" : ""}US$${fmt(Math.abs(x) / 1000, 1)} mil millones`;
      const ce = C.expo_12 ? (C.expo / C.expo_12 - 1) * 100 : null, ci = C.impo_12 ? (C.impo / C.impo_12 - 1) * 100 : null;
      $("res-com-num").textContent = dol(C.balanza);
      $("res-com-cambio").textContent = `${etqMesLargo(C.fecha)} · balanza comercial (${C.balanza < 0 ? "déficit" : "superávit"})`;
      $("res-com-txt").innerHTML = `En ${MESES_L[+C.fecha.slice(5, 7) - 1]} Colombia exportó ${dol(C.expo)}` + (ce != null ? ` (${ce >= 0 ? "+" : "−"}${fmt(Math.abs(ce), 1)}% en un año)` : "") +
        ` e importó ${dol(C.impo)}` + (ci != null ? ` (${ci >= 0 ? "+" : "−"}${fmt(Math.abs(ci), 1)}%)` : "") + `: <strong>${C.balanza < 0 ? "compró más de lo que vendió" : "vendió más de lo que compró"}</strong>. ` +
        `En lo corrido del año la balanza va en ${dol(C.corrido)}; un año antes iba en ${dol(C.corrido_ant)}. ` +
        `Petróleo y carbón son el ${fmt(C.petroleo_carbon, 0)}% de lo exportado, así que el resultado depende mucho de los precios de la energía.`;
      mini("res-com-g", C.fechas, C.v, css("--s2"));
    }

    // --- presupuesto
    const B = R.presupuesto;
    $("res-pre-num").textContent = pct(B.pct);
    $("res-pre-cambio").textContent = `${etqMesLargo(B.fecha)} · ejecutado del presupuesto sin deuda`;
    $("res-pre-txt").innerHTML = `El Gobierno ha ejecutado <strong>${plata(B.obligaciones)}</strong> de ${plata(B.apropiacion)} que tiene para este año (sin contar deuda). ` +
      (B.pct_anio_anterior != null ? `A la misma altura del año pasado iba en ${pct(B.pct_anio_anterior)}: <strong>${B.pct > B.pct_anio_anterior ? "va más rápido" : "va más lento"}</strong>. ` : "") +
      `Los sectores que van más atrasados: ${B.mas_lentos.map(x => `${titulo(x[0])} (${pct(x[1])})`).join(", ")}.`;
    $("res-pre-g").parentElement.hidden = true;
  }
  return {iniciar, render};
})());
