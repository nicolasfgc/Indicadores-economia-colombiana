"""
Tasas y dólar.

  - TRM (Tasa Representativa del Mercado), diaria desde 1991. Fuente: Superintendencia
    Financiera, vía datos.gov.co (conjunto 32sa-8pi3).

  Pendiente: tasa de política monetaria, IBR, DTF y tasas de colocación (Banco de la República).

Salida:
  datos/tasas/series.csv
  datos/tasas/datos.csv        fecha (mes) | id_serie | medida | valor
  datos/tasas/trm_diaria.csv   fecha | trm   (un valor por cada día calendario)

Como la fuente trae toda la historia en una sola consulta, siempre se reconstruye completo.

Uso:  python scripts/tasas.py
"""
import io
import sys
import urllib.parse
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ipc import bajar  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
SALIDA = RAIZ / "datos" / "tasas"
SODA = "https://www.datos.gov.co/resource"


def soql(dataset, formato="json", **params):
    q = urllib.parse.urlencode({f"${k}": v for k, v in params.items()})
    return bajar(f"{SODA}/{dataset}.{formato}?{q}", timeout=300, intentos=4)


def trm():
    crudo = pd.read_csv(io.BytesIO(soql("32sa-8pi3", "csv", select="valor,vigenciadesde,vigenciahasta", limit=100000)))
    crudo["desde"] = pd.to_datetime(crudo.vigenciadesde).dt.normalize()
    crudo["hasta"] = pd.to_datetime(crudo.vigenciahasta).dt.normalize()
    # cada TRM rige desde una fecha hasta otra (fines de semana y festivos rige la del último día hábil)
    dias = []
    for r in crudo.itertuples():
        for d in pd.date_range(r.desde, max(r.desde, r.hasta), freq="D"):
            dias.append((d, float(r.valor)))
    diaria = pd.DataFrame(dias, columns=["fecha", "trm"]).drop_duplicates("fecha", keep="last").sort_values("fecha")
    hoy = pd.Timestamp.today().normalize()
    diaria = diaria[diaria.fecha <= hoy]
    if len(diaria) < 10000:
        raise RuntimeError(f"TRM incompleta: {len(diaria)} días")

    diaria["mes"] = diaria.fecha.dt.to_period("M").dt.to_timestamp()
    g = diaria.groupby("mes").trm
    mensual = pd.DataFrame({"trm_promedio": g.mean(), "trm_fin_mes": g.last()})
    if mensual.index[-1] == hoy.to_period("M").to_timestamp():  # el mes en curso solo cuenta cuando termina
        mensual = mensual.iloc[:-1]
    mensual["var_mensual_promedio"] = mensual.trm_promedio.pct_change() * 100
    mensual["var_anual_promedio"] = mensual.trm_promedio.pct_change(12) * 100
    mensual["var_anual_fin_mes"] = mensual.trm_fin_mes.pct_change(12) * 100
    largo = (mensual.reset_index().rename(columns={"mes": "fecha"})
             .melt(id_vars="fecha", var_name="medida", value_name="valor").dropna())
    largo["id_serie"] = "TRM"
    largo["fecha"] = largo.fecha.dt.strftime("%Y-%m-%d")
    serie = dict(id_serie="TRM", indicador="TRM", categoria="Total",
                 nombre="Tasa Representativa del Mercado (pesos por dólar)",
                 unidad="Pesos por dólar (variaciones en %)", frecuencia_origen="Diaria",
                 nota="Promedio y cierre del mes calculados sobre todos los días calendario",
                 fuente="Superintendencia Financiera (datos.gov.co)")
    diaria = diaria[["fecha", "trm"]].assign(fecha=lambda x: x.fecha.dt.strftime("%Y-%m-%d"))
    return largo, [serie], diaria


def main():
    l_trm, s_trm, diaria = trm()
    datos = l_trm[["fecha", "id_serie", "medida", "valor"]].copy()
    datos["valor"] = datos.valor.astype(float).round(4)
    datos = datos.sort_values(["fecha", "id_serie", "medida"]).reset_index(drop=True)
    assert not datos.duplicated(["fecha", "id_serie", "medida"]).any()
    series = pd.DataFrame(s_trm)

    SALIDA.mkdir(parents=True, exist_ok=True)
    series.to_csv(SALIDA / "series.csv", index=False, encoding="utf-8")
    datos.to_csv(SALIDA / "datos.csv", index=False, encoding="utf-8")
    diaria.to_csv(SALIDA / "trm_diaria.csv", index=False, encoding="utf-8")
    print(f"series.csv: {len(series)} | datos.csv: {len(datos)} filas | trm_diaria.csv: {len(diaria)} días "
          f"(último {diaria.fecha.iloc[-1]}: {diaria.trm.iloc[-1]:,.2f})")


if __name__ == "__main__":
    main()
