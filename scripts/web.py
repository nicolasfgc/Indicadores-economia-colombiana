"""
Prepara versiones livianas de los datos para el explorador web (carpeta web/).

Los CSV de datos/ son la fuente completa para quien quiera descargar; estos JSON solo
tienen lo que la página muestra, en el formato más compacto posible, para que cargue rápido.
Se regenera en cada corrida de la tarea automática.

Uso:  python scripts/web.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

RAIZ = Path(__file__).resolve().parents[1]
DATOS = RAIZ / "datos"
WEB = RAIZ / "web"


def guardar(nombre, obj):
    p = WEB / nombre
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    print(f"  {nombre}: {p.stat().st_size / 1024:,.0f} KB")


def limpiar(v, dec=2):
    return None if v is None or (isinstance(v, float) and np.isnan(v)) else round(float(v), dec)


def series_alineadas(datos, ids, medidas, fechas, dec=2):
    out = {}
    for sid in ids:
        sub = datos[datos.id_serie == sid]
        out[sid] = {}
        for m in medidas:
            s = sub[sub.medida == m].set_index("fecha").valor
            if len(s):
                out[sid][m] = [limpiar(s.get(f), dec) for f in fechas]
    return out


# ---------------------------------------------------------------- ISE
def ise():
    d = pd.read_csv(DATOS / "ise" / "datos.csv")
    s = pd.read_csv(DATOS / "ise" / "series.csv", dtype=str).fillna("")
    d = d[d.fecha >= "2005-01-01"]
    fechas = sorted(d.fecha.unique())
    medidas = ["indice_original", "var_anual_original", "indice_desest", "var_mensual_desest", "var_anual_desest", "var_ano_corrido_original"]
    meta = s[["id_serie", "version", "nivel", "padre", "nombre_corto", "codigo_ciiu"]].to_dict("records")
    guardar("ise.json", {"fechas": fechas, "series": meta, "valores": series_alineadas(d, s.id_serie, medidas, fechas)})


# ---------------------------------------------------------------- empleo
def empleo():
    d = pd.read_csv(DATOS / "empleo" / "datos.csv")
    s = pd.read_csv(DATOS / "empleo" / "series.csv", dtype=str).fillna("")
    fechas = sorted(d.fecha.unique())
    gen = s[s.desagregacion.isin(["general", "sexo"])]
    out = {"fechas": fechas, "general": [], "ramas": [], "posiciones": [], "ciudades": []}
    vals = series_alineadas(d, gen.id_serie, ["td", "to", "tgp", "ocupados", "desocupados"], fechas)
    for r in gen.itertuples():
        out["general"].append({"id": r.id_serie, "dominio": r.dominio, "ajuste": r.ajuste, "v": vals[r.id_serie]})
    for tipo, clave in (("rama", "ramas"), ("posicion", "posiciones")):
        sub = s[(s.desagregacion == tipo) & s.dominio.str.contains("nacional", case=False)]
        v = series_alineadas(d, sub.id_serie, ["ocupados"], fechas, 1)
        for r in sub.itertuples():
            if v[r.id_serie]:
                out[clave].append({"id": r.id_serie, "nombre": r.categoria, "v": v[r.id_serie]["ocupados"]})
    sub = s[s.desagregacion == "ciudad"]
    v = series_alineadas(d, sub.id_serie, ["td", "to"], fechas)
    for r in sub.itertuples():
        out["ciudades"].append({"id": r.id_serie, "nombre": r.dominio, "v": v[r.id_serie]})
    guardar("empleo.json", out)


# ---------------------------------------------------------------- tasas y dólar
def mes_en_curso():
    """Promedio y último valor del mes que va corriendo, a partir de los datos diarios.
    En datos/ solo quedan los meses cerrados; la página sí muestra el mes en curso (marcado como tal)
    para que las gráficas no se queden atrás cuando, por ejemplo, el Banco cambia su tasa a comienzos de mes."""
    trm = pd.read_csv(DATOS / "tasas" / "trm_diaria.csv")
    dd = pd.read_csv(DATOS / "tasas" / "tasas_diarias.csv")
    ultimo = max(trm.fecha.max(), dd.fecha.max())
    mes = ultimo[:7] + "-01"
    filas = []
    t = trm[trm.fecha >= mes]
    if len(t):
        filas += [(mes, "TRM", "trm_promedio", t.trm.mean()), (mes, "TRM", "trm_fin_mes", t.trm.iloc[-1])]
    for sid, g in dd[dd.fecha >= mes].sort_values("fecha").groupby("id_serie"):
        filas += [(mes, sid, "promedio", g.valor.mean()), (mes, sid, "fin_mes", g.valor.iloc[-1])]
    return mes, ultimo, pd.DataFrame(filas, columns=["fecha", "id_serie", "medida", "valor"])


def tasas():
    d = pd.read_csv(DATOS / "tasas" / "datos.csv")
    mes, ultimo, extra = mes_en_curso()
    en_curso = None
    if mes > d.fecha.max():
        d = pd.concat([d, extra], ignore_index=True)
        en_curso = [mes, ultimo]
    s = pd.read_csv(DATOS / "tasas" / "series.csv", dtype=str).fillna("")
    fechas = sorted(d.fecha.unique())
    medidas = ["trm_promedio", "trm_fin_mes", "var_anual_promedio", "promedio", "fin_mes"]
    trm = pd.read_csv(DATOS / "tasas" / "trm_diaria.csv")
    diarias = pd.read_csv(DATOS / "tasas" / "tasas_diarias.csv")
    ultimos = {"TRM": [trm.fecha.iloc[-1], float(trm.trm.iloc[-1])]}
    for sid, g in diarias.groupby("id_serie"):
        g = g.sort_values("fecha")
        ultimos[sid] = [g.fecha.iloc[-1], float(g.valor.iloc[-1])]
    reciente = trm[trm.fecha >= (pd.Timestamp(trm.fecha.iloc[-1]) - pd.Timedelta(days=400)).strftime("%Y-%m-%d")]
    guardar("tasas.json", {"fechas": fechas, "series": s[["id_serie", "nombre", "unidad"]].to_dict("records"),
                           "valores": series_alineadas(d, s.id_serie, medidas, fechas, 4), "ultimos": ultimos, "mes_en_curso": en_curso,
                           "trm_diaria": {"fechas": reciente.fecha.tolist(), "valores": reciente.trm.round(2).tolist()}})


# ---------------------------------------------------------------- presupuesto
VAL = ["apropiacion_vigente", "compromisos", "obligaciones", "pagos",
       "cambio_mes_apropiacion_vigente", "cambio_mes_compromisos", "cambio_mes_obligaciones", "cambio_mes_pagos"]


def presupuesto():
    carpeta = DATOS / "presupuesto"
    ent = pd.read_csv(carpeta / "entidades.csv", dtype=str)
    rub = pd.read_csv(carpeta / "rubros.csv", dtype=str).fillna("")
    rub["id_rubro"] = rub.id_rubro.astype(int)
    tipos = ["FUNCIONAMIENTO", "INVERSION", "SERVICIO DE LA DEUDA PÚBLICA"]
    r = pd.read_csv(carpeta / "resumen.csv", dtype={"codigo_entidad": str})
    r = r[r.vigencia == "Vigencia actual"]
    fechas = sorted(r.fecha.unique())
    lista_ent = ent.sort_values(["sector", "entidad"]).reset_index(drop=True)
    idx_ent = {c: i for i, c in enumerate(lista_ent.codigo_entidad)}
    idx_tipo = {t: i for i, t in enumerate(tipos)}
    filas = []
    for x in r.itertuples():
        if x.codigo_entidad not in idx_ent or x.tipo_gasto not in idx_tipo:
            continue
        filas.append([fechas.index(x.fecha), idx_ent[x.codigo_entidad], idx_tipo[x.tipo_gasto]] +
                     [int(round(getattr(x, v) / 1e6)) for v in VAL])  # millones de pesos
    # meses que MinHacienda no publicó (huecos entre el primero y el último): la página avisa de ellos
    todos = pd.date_range(fechas[0], fechas[-1], freq="MS").strftime("%Y-%m-%d").tolist()
    faltantes = [f for f in todos if f not in fechas]
    reg = carpeta / "meses_siif.csv"
    desde_siif = [f for f in pd.read_csv(reg, dtype=str).fecha if f in fechas] if reg.exists() else []
    guardar("presupuesto/entidades.json", {"fechas": fechas, "faltantes": faltantes, "desde_siif": desde_siif, "tipos": ["Funcionamiento", "Inversión", "Deuda"],
                                           "entidades": lista_ent[["codigo_entidad", "entidad", "sector"]].values.tolist(),
                                           "campos": VAL, "filas": filas})
    # detalle por rubro, un archivo por año (solo vigencia actual, sumando fuentes y recursos)
    for p in sorted(carpeta.glob("gastos_*.csv")):
        anio = p.stem.split("_")[1]
        h = pd.read_csv(p, dtype={"recurso": str})
        h = h[h.vigencia == "Vigencia actual"]
        g = h.groupby(["fecha", "id_rubro"], as_index=False)[VAL].sum()
        meses = sorted(g.fecha.unique())
        ids = sorted(g.id_rubro.unique())
        info = rub.set_index("id_rubro").loc[ids]
        filas = [[meses.index(x.fecha), int(x.id_rubro)] + [int(round(getattr(x, v) / 1e6)) for v in VAL] for x in g.itertuples()]
        rubros = {int(i): [idx_ent.get(z.codigo_entidad, -1), z.nombre_1[:1], z.nombre_2, z.nombre_3, z.nombre_4, z.nombre_5]
                  for i, z in info.iterrows()}
        guardar(f"presupuesto/rubros_{anio}.json", {"fechas": meses, "campos": VAL, "rubros": rubros, "filas": filas})


def presupuesto_historico():
    s = pd.read_csv(DATOS / "presupuesto_historico" / "sectores.csv")
    s = s[s.fuente == "Total"]
    anios = sorted(s.anio.unique().tolist())
    out = {"anios": anios, "sectores": {}}
    g = s.groupby(["sector_comparable", "tipo_gasto", "medida", "precios", "anio"]).valor.sum()
    for (sec, tipo, med, pr), serie in g.groupby(level=[0, 1, 2, 3]):
        serie = serie.droplevel([0, 1, 2, 3])
        out["sectores"].setdefault(sec, {}).setdefault(tipo, {}).setdefault(med, {})[pr] = [limpiar(serie.get(a), 1) for a in anios]
    guardar("presupuesto/historico.json", out)


def ipc_historico():
    h = pd.read_csv(DATOS / "ipc" / "total_historico.csv")
    guardar("ipc_historico.json", {"fechas": h.fecha.tolist(), "var_anual": [limpiar(x) for x in h.var_anual],
                                   "var_mensual": [limpiar(x) for x in h.var_mensual]})


def resumen():
    """Datos clave de cada indicador para la pestaña de resumen (la interpretación se arma en la página)."""
    out = {}
    h = pd.read_csv(DATOS / "ipc" / "total_historico.csv").dropna(subset=["var_anual"])
    out["ipc"] = {"fechas": h.fecha.tolist(), "v": h.var_anual.round(2).tolist(), "mensual": h.var_mensual.round(2).tolist()}
    d = pd.read_csv(DATOS / "ise" / "datos.csv")
    t = d[(d.id_serie == "ISE9_TOTAL")].pivot(index="fecha", columns="medida", values="valor").dropna(subset=["var_anual_original"])
    out["ise"] = {"fechas": t.index.tolist(), "v": t.var_anual_original.round(2).tolist(), "mensual_desest": t.var_mensual_desest.round(2).tolist()}
    ag = d[d.id_serie.str.match(r"ISE9_(AB|CF|DE|GHI|J|K|L|MN|OPQRST)$") & (d.medida == "var_anual_original") & (d.fecha == t.index[-1])]
    s9 = pd.read_csv(DATOS / "ise" / "series.csv", dtype=str).set_index("id_serie").nombre_corto
    out["ise"]["sectores"] = sorted([[s9[r.id_serie], round(r.valor, 2)] for r in ag.itertuples()], key=lambda x: -x[1])
    e = pd.read_csv(DATOS / "empleo" / "datos.csv")
    n = e[e.id_serie == "EMP_TOTAL_NACIONAL_M"].pivot(index="fecha", columns="medida", values="valor").dropna(subset=["td"])
    out["empleo"] = {"fechas": n.index.tolist(), "v": n.td.round(2).tolist(), "ocupados": n.ocupados.round(1).tolist()}
    sx = {k: e[(e.id_serie == f"EMP_TOTAL_NACIONAL_{k}_M") & (e.medida == "td")].set_index("fecha").valor for k in ("HOMBRES", "MUJERES")}
    out["empleo"]["hombres"], out["empleo"]["mujeres"] = round(sx["HOMBRES"].iloc[-1], 2), round(sx["MUJERES"].iloc[-1], 2)
    ta = pd.read_csv(DATOS / "tasas" / "datos.csv")
    mes, _, extra = mes_en_curso()
    if mes > ta.fecha.max():
        ta = pd.concat([ta, extra], ignore_index=True)
    trm = ta[(ta.id_serie == "TRM") & (ta.medida == "trm_promedio")].set_index("fecha").valor
    tpm = ta[(ta.id_serie == "TPM") & (ta.medida == "fin_mes")].set_index("fecha").valor
    dia = pd.read_csv(DATOS / "tasas" / "trm_diaria.csv")
    dd = pd.read_csv(DATOS / "tasas" / "tasas_diarias.csv")
    tpm_d = dd[dd.id_serie == "TPM"].sort_values("fecha")
    out["trm"] = {"fechas": trm.index.tolist(), "v": trm.round(2).tolist(), "ultimo": [dia.fecha.iloc[-1], float(dia.trm.iloc[-1])],
                  "hace_un_anio": float(dia.trm.iloc[-366]) if len(dia) > 366 else None}
    out["tpm"] = {"fechas": tpm.index.tolist(), "v": tpm.round(2).tolist(), "ultimo": [tpm_d.fecha.iloc[-1], float(tpm_d.valor.iloc[-1])]}
    r = pd.read_csv(DATOS / "presupuesto" / "resumen.csv")
    r = r[(r.vigencia == "Vigencia actual") & (r.tipo_gasto != "SERVICIO DE LA DEUDA PÚBLICA")]
    g = r.groupby("fecha")[["apropiacion_vigente", "compromisos", "obligaciones"]].sum()
    ult = g.index[-1]
    mismo_mes_ant = f"{int(ult[:4]) - 1}{ult[4:]}"
    sec = r[r.fecha == ult].groupby("sector")[["apropiacion_vigente", "obligaciones"]].sum()
    sec = sec[sec.apropiacion_vigente > 5e11]
    sec["pct"] = sec.obligaciones / sec.apropiacion_vigente * 100
    out["presupuesto"] = {"fecha": ult, "apropiacion": float(g.loc[ult, "apropiacion_vigente"] / 1e6), "obligaciones": float(g.loc[ult, "obligaciones"] / 1e6),
                          "pct": float(g.loc[ult, "obligaciones"] / g.loc[ult, "apropiacion_vigente"] * 100),
                          "pct_anio_anterior": float(g.loc[mismo_mes_ant, "obligaciones"] / g.loc[mismo_mes_ant, "apropiacion_vigente"] * 100) if mismo_mes_ant in g.index else None,
                          "mas_lentos": [[s, round(p, 1)] for s, p in sec.pct.sort_values().head(3).items()],
                          "mas_rapidos": [[s, round(p, 1)] for s, p in sec.pct.sort_values().tail(3).items()]}
    guardar("resumen.json", out)


# ---------------------------------------------------------------- comercio exterior
def comercio():
    d = pd.read_csv(DATOS / "comercio" / "datos.csv")
    s = pd.read_csv(DATOS / "comercio" / "series.csv", dtype=str).fillna("")
    a = pd.read_csv(DATOS / "comercio" / "anual.csv")
    fechas = sorted(d.fecha.unique())
    usd = d[d.medida == "usd"].pivot(index="fecha", columns="id_serie", values="valor").reindex(fechas)
    ton = d[d.medida == "toneladas"].pivot(index="fecha", columns="id_serie", values="valor").reindex(fechas)
    serie = lambda col, dec: [limpiar(x, dec) for x in col]
    anios = sorted(a.anio.unique().tolist())
    an = a.pivot(index="anio", columns="id_serie", values="valor").reindex(anios)
    guardar("comercio.json", {
        "fechas": fechas,
        "series": {r.id_serie: [r.nombre, r.tema, r.nivel, r.padre] for r in s.itertuples()},
        "usd": {c: serie(usd[c], 2) for c in usd.columns},
        "toneladas": {c: serie(ton[c], 0) for c in ton.columns},
        "anios": [int(x) for x in anios],
        "anual": {c: serie(an[c], 1) for c in an.columns},
    })


def main():
    print("Preparando datos para la web:")
    resumen()
    ipc_historico()
    ise()
    empleo()
    tasas()
    presupuesto()
    presupuesto_historico()
    comercio()


if __name__ == "__main__":
    main()
