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
    d = d[d.fecha >= "2015-01-01"]
    fechas = sorted(d.fecha.unique())
    medidas = ["indice_original", "var_anual_original", "indice_desest", "var_mensual_desest", "var_anual_desest", "var_ano_corrido_original"]
    meta = s[["id_serie", "version", "nivel", "padre", "nombre_corto", "codigo_ciiu"]].to_dict("records")
    guardar("ise.json", {"fechas": fechas, "series": meta, "valores": series_alineadas(d, s.id_serie, medidas, fechas)})


# ---------------------------------------------------------------- empleo
def empleo():
    d = pd.read_csv(DATOS / "empleo" / "datos.csv")
    s = pd.read_csv(DATOS / "empleo" / "series.csv", dtype=str).fillna("")
    d = d[d.fecha >= "2010-01-01"]
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
def tasas():
    d = pd.read_csv(DATOS / "tasas" / "datos.csv")
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
                           "valores": series_alineadas(d, s.id_serie, medidas, fechas, 4), "ultimos": ultimos,
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
    guardar("presupuesto/entidades.json", {"fechas": fechas, "tipos": ["Funcionamiento", "Inversión", "Deuda"],
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


def main():
    print("Preparando datos para la web:")
    ise()
    empleo()
    tasas()
    presupuesto()
    presupuesto_historico()


if __name__ == "__main__":
    main()
