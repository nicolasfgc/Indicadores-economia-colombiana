"""
Tasas y dólar.

  - TRM (Tasa Representativa del Mercado), diaria desde 1991. Fuente: Superintendencia
    Financiera, vía datos.gov.co (conjunto 32sa-8pi3).

  - Tasa de política monetaria, IBR, tasa interbancaria, CDT, DTF y UVR. Fuente: Banco de la
    República, servidor de estadísticas (suameca).

Salida:
  datos/tasas/series.csv
  datos/tasas/datos.csv           fecha (mes) | id_serie | medida | valor
  datos/tasas/trm_diaria.csv      fecha | trm   (un valor por cada día calendario)
  datos/tasas/tasas_diarias.csv   fecha | id_serie | valor   (series diarias del Banrep)

Como las fuentes traen toda la historia en una sola consulta, siempre se reconstruye completo.

Nota sobre certificados: el servidor del Banrep no envía completa su cadena de certificados
(le falta el intermedio "GeoTrust EV RSA CA G2", de DigiCert). En vez de desactivar la
verificación, se agrega ese certificado público, guardado en scripts/certs/.

Uso:  python scripts/tasas.py
"""
import io
import json
import ssl
import sys
import time
import urllib.parse
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ipc import bajar  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
SALIDA = RAIZ / "datos" / "tasas"
SODA = "https://www.datos.gov.co/resource"
BANREP = "https://suameca.banrep.gov.co/estadisticas-economicas-back/rest/estadisticaEconomicaRestService"
CERT_BANREP = Path(__file__).resolve().parent / "certs" / "geotrust-ev-rsa-ca-g2.pem"

# id en el Banrep -> (id_serie, nombre, unidad)
SERIES_BANREP = {
    59: ("TPM", "Tasa de política monetaria", "% efectivo anual"),
    241: ("IBR_ON", "IBR (Indicador Bancario de Referencia) a un día, nominal", "% nominal anual"),
    242: ("IBR_1M", "IBR a 1 mes, nominal", "% nominal anual"),
    243: ("IBR_3M", "IBR a 3 meses, nominal", "% nominal anual"),
    89: ("TIB", "Tasa interbancaria (TIB)", "% efectivo anual"),
    238: ("CDT_90", "Tasa de CDT a 90 días", "% efectivo anual"),
    70: ("DTF_90", "DTF a 90 días (promedio mensual)", "% efectivo anual"),
    850: ("UVR", "Unidad de Valor Real (UVR)", "pesos"),
}


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


def banrep():
    ctx = ssl.create_default_context()
    ctx.load_verify_locations(cafile=str(CERT_BANREP))
    hoy = pd.Timestamp.today().normalize()
    mes_actual = hoy.to_period("M").to_timestamp()
    largos, series, diarias = [], [], []
    for id_br, (sid, nombre, unidad) in SERIES_BANREP.items():
        info = json.loads(bajar(f"{BANREP}/consultaInformacionSerie?idSerie={id_br}", timeout=120, contexto=ctx))[0]
        puntos = info["data"] if isinstance(info["data"], list) else json.loads(info["data"])
        if len(puntos) < 50:
            raise RuntimeError(f"Banrep {id_br} ({sid}): muy pocos datos ({len(puntos)})")
        s = pd.DataFrame(puntos, columns=["ms", "valor"]).dropna()
        s["fecha"] = pd.to_datetime(s.ms, unit="ms", utc=True).dt.tz_convert("America/Bogota").dt.tz_localize(None).dt.normalize()
        s = s.drop_duplicates("fecha", keep="last").sort_values("fecha")
        periodicidad = info.get("descripcionPeriodicidad", "")
        s["mes"] = s.fecha.dt.to_period("M").dt.to_timestamp()
        if periodicidad == "Mensual":
            m = s.set_index("mes")[["valor"]].rename(columns={"valor": "promedio"})
        else:
            s = s[s.mes < mes_actual]  # el mes en curso solo cuenta cuando termina
            g = s.groupby("mes").valor
            m = pd.DataFrame({"promedio": g.mean(), "fin_mes": g.last()})
            diarias.append(s.assign(id_serie=sid)[["fecha", "id_serie", "valor"]])
        largo = m.reset_index().rename(columns={"mes": "fecha"}).melt(id_vars="fecha", var_name="medida", value_name="valor").dropna()
        largo["id_serie"] = sid
        largos.append(largo)
        series.append(dict(id_serie=sid, indicador="Tasas de interés", categoria=nombre, nombre=nombre,
                           unidad=unidad, frecuencia_origen=periodicidad,
                           nota="Promedio y cierre del mes calculados sobre los días con dato" if periodicidad != "Mensual" else "Valor mensual publicado",
                           fuente=f"Banco de la República (serie {id_br})"))
        time.sleep(1)
    largo = pd.concat(largos)
    largo["fecha"] = largo.fecha.dt.strftime("%Y-%m-%d")
    diaria = pd.concat(diarias)
    diaria["fecha"] = diaria.fecha.dt.strftime("%Y-%m-%d")
    return largo, series, diaria


def main():
    l_trm, s_trm, diaria = trm()
    l_br, s_br, diaria_br = banrep()
    datos = pd.concat([l_trm, l_br])[["fecha", "id_serie", "medida", "valor"]].copy()
    datos["valor"] = datos.valor.astype(float).round(4)
    datos = datos.sort_values(["fecha", "id_serie", "medida"]).reset_index(drop=True)
    assert not datos.duplicated(["fecha", "id_serie", "medida"]).any()
    series = pd.DataFrame(s_trm + s_br)

    SALIDA.mkdir(parents=True, exist_ok=True)
    series.to_csv(SALIDA / "series.csv", index=False, encoding="utf-8")
    datos.to_csv(SALIDA / "datos.csv", index=False, encoding="utf-8")
    diaria.to_csv(SALIDA / "trm_diaria.csv", index=False, encoding="utf-8")
    diaria_br.sort_values(["fecha", "id_serie"]).to_csv(SALIDA / "tasas_diarias.csv", index=False, encoding="utf-8")
    print(f"series.csv: {len(series)} | datos.csv: {len(datos)} filas | trm_diaria.csv: {len(diaria)} días "
          f"(último {diaria.fecha.iloc[-1]}: {diaria.trm.iloc[-1]:,.2f}) | tasas_diarias.csv: {len(diaria_br)} filas")


if __name__ == "__main__":
    main()
