"""
Mercado laboral (GEIH, Gran Encuesta Integrada de Hogares) - DANE.

Usa dos anexos que el DANE publica cada mes con la serie completa:
  - anex-GEIH-<mes>.xlsx: total nacional, cabeceras, 13 ciudades, por sexo, ocupados por rama
    de actividad y por posición ocupacional, población fuera de la fuerza de trabajo y las
    23 ciudades en trimestre móvil.
  - anex-GEIH-Desestacionalizado-<mes>.xlsx: series sin efecto de temporada.

Como cada anexo trae la historia completa, siempre se reconstruye todo (son dos archivos).

Salida:
  datos/empleo/series.csv   una fila por serie (dominio + categoría + tipo de serie)
  datos/empleo/datos.csv    fecha | id_serie | medida | valor
  En empleo la "medida" es el concepto: td (tasa de desocupación), to, tgp, ocupados, etc.

Uso:  python scripts/empleo.py [carpeta_cache]
"""
import re
import sys
import time
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ipc import bajar  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
SALIDA = RAIZ / "datos" / "empleo"
DANE = "https://www.dane.gov.co"
PAGINA = "/index.php/estadisticas-por-tema/mercado-laboral/empleo-y-desempleo"
MESES = {"ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6,
         "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12}

# hoja -> (tipo de desagregación, periodicidad, ajuste)
HOJAS = {
    "principal": {
        "Total nacional": ("general", "mensual", "original"),
        "Total 13 ciudades A.M.": ("general", "mensual", "original"),
        "Total_nacional_IML_Sexo": ("sexo", "mensual", "original"),
        "Ocupados TN_T13_rama": ("rama", "mensual", "original"),
        "Ocupados TN_posición": ("posicion", "mensual", "original"),
        "Pob_fuera_fuerza_trabajo_TN": ("fuera_ft", "mensual", "original"),
        "Total 23 ciudades A.M. Trim": ("ciudad", "trimestre movil", "original"),
    },
    "desest": {
        "Total nacional": ("general", "mensual", "desestacionalizada"),
        "Total 13 ciudades A.M.": ("general", "mensual", "desestacionalizada"),
    },
}

# concepto (texto del DANE, sin tildes y en minúscula) -> (medida, unidad, nombre corto)
CONCEPTOS = [
    ("% poblacion en edad de trabajar", "pct_pet", "%", "% población en edad de trabajar"),
    ("tasa global de participacion", "tgp", "%", "Tasa global de participación"),
    ("tasa de ocupacion", "to", "%", "Tasa de ocupación"),
    ("tasa de desocupacion", "td", "%", "Tasa de desocupación (desempleo)"),
    ("tasa de subocupacion", "ts", "%", "Tasa de subocupación"),
    ("tcsd", "tcsd", "%", "Tasa combinada de subutilización (desocupación + subocupación)"),
    ("tcdftp", "tcdftp", "%", "Tasa combinada de desocupación y fuerza de trabajo potencial"),
    ("mcsft", "mcsft", "%", "Medida compuesta de subutilización de la fuerza de trabajo"),
    ("poblacion total", "poblacion_total", "miles de personas", "Población total"),
    ("poblacion en edad de trabajar", "pet", "miles de personas", "Población en edad de trabajar"),
    ("fuerza de trabajo potencial", "ftp", "miles de personas", "Fuerza de trabajo potencial"),
    ("poblacion fuera de la fuerza de trabajo", "fuera_ft", "miles de personas", "Población fuera de la fuerza de trabajo"),
    ("fuerza de trabajo", "fuerza_trabajo", "miles de personas", "Fuerza de trabajo"),
    ("poblacion ocupada", "ocupados", "miles de personas", "Población ocupada"),
    ("poblacion desocupada", "desocupados", "miles de personas", "Población desocupada"),
    ("poblacion subocupada", "subocupados", "miles de personas", "Población subocupada"),
]
NUEVAS_2021 = {"tcdftp", "mcsft", "ftp"}  # indicadores que solo existen desde la GEIH rediseñada


def sin_tildes(s):
    s = unicodedata.normalize("NFKD", str(s))
    return " ".join("".join(c for c in s if not unicodedata.combining(c)).lower().split())


def slug(s, n=40):
    s = re.sub(r"[^a-z0-9]+", "_", sin_tildes(s)).strip("_").upper()
    return s[:n].rstrip("_")


def concepto(texto):
    t = sin_tildes(texto).replace("desestacionalizado", "").replace("desestacionalizada", "").strip(" ^*")
    for patron, med, uni, corto in CONCEPTOS:
        if t.startswith(patron):
            return med, uni, corto
    return None


def listar():
    html = bajar(DANE + PAGINA).decode("utf-8", "ignore")
    out = {}
    for tipo, patron in (("principal", r"anex-GEIH-([a-z]{3})(20\d{2})\.xlsx"),
                         ("desest", r"anex-GEIH-Desestacionalizado-([a-z]{3})(20\d{2})\.xlsx")):
        cand = {}
        for href in re.findall(r'href="([^"]+\.xlsx)"', html):
            m = re.search(patron + "$", href)
            if m and m.group(1) in MESES:
                cand[(int(m.group(2)), MESES[m.group(1)])] = href if href.startswith("http") else DANE + href
        if not cand:
            raise RuntimeError(f"No se encontró el anexo GEIH ({tipo}) en la página del DANE")
        out[tipo] = (max(cand), cand[max(cand)])
    return out


def _num(v):
    try:
        f = float(v)
        return None if np.isnan(f) else f
    except (TypeError, ValueError):
        return None


def fechas_columnas(df, i_anios, i_meses):
    """Asigna una fecha a cada columna. En trimestre móvil se usa el último mes del trimestre."""
    cols, anio = {}, None
    for j in range(1, df.shape[1]):
        a = df.iloc[i_anios, j]
        m = re.match(r"(\d{4})", str(a).strip()) if a is not None and str(a) != "nan" else None
        if m:
            anio = int(m.group(1))
        etq = df.iloc[i_meses, j]
        if not isinstance(etq, str) or anio is None:
            continue
        # "Ago", "Jun - Ago" o "Nov 25 - Ene 26": se toma el último mes; si trae año explícito, se usa ese
        ultimo = sin_tildes(etq.split("-")[-1])
        m = re.match(r"([a-z]{3})\w*\s*(\d{2,4})?", ultimo)
        if not m or m.group(1) not in MESES:
            continue
        fin = MESES[m.group(1)]
        y = anio
        if m.group(2):
            y = int(m.group(2)) + (2000 if len(m.group(2)) == 2 else 0)
        cols[j] = f"{y}-{fin:02d}-01"
    return cols


def leer_hoja(df, tipo, periodicidad, ajuste):
    filas = []
    for i in range(len(df)):
        if not (isinstance(df.iloc[i, 0], str) and sin_tildes(df.iloc[i, 0]) == "concepto"):
            continue
        # nombre del bloque: la fila anterior a "Serie mensual/trimestral ..." o, si no hay, la anterior a "Concepto"
        previas = [(k, str(df.iloc[k, 0]).strip()) for k in range(max(0, i - 4), i) if isinstance(df.iloc[k, 0], str)]
        idx_serie = [n for n, (_, t) in enumerate(previas) if sin_tildes(t).startswith("serie ")]
        dominio = previas[idx_serie[-1] - 1][1] if idx_serie and idx_serie[-1] > 0 else previas[-1][1]
        dominio = re.sub(r"\s*desestacionalizad[oa]\s*$", "", dominio, flags=re.I).strip()
        cols = fechas_columnas(df, i, i + 1)
        k = i + 2
        while k < len(df):
            etq = df.iloc[k, 0]
            if isinstance(etq, str) and sin_tildes(etq) == "concepto":
                break
            vals = {f: _num(df.iloc[k, j]) for j, f in cols.items()}
            if isinstance(etq, str) and any(v is not None for v in vals.values()):
                texto = " ".join(etq.split()).strip(" ^*")
                filas.append((tipo, periodicidad, ajuste, dominio, texto, vals))
            k += 1
    return filas


def main():
    cache = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ / ".cache" / "empleo"
    cache.mkdir(parents=True, exist_ok=True)
    anexos = listar()
    crudo = []
    for clave_anexo, (periodo, url) in anexos.items():
        print(f"GEIH {clave_anexo}: anexo de {periodo[1]:02d}/{periodo[0]}")
        destino = cache / url.rsplit("/", 1)[-1]
        bajar(url, destino)
        time.sleep(2)
        x = pd.ExcelFile(destino)
        for hoja, (tipo, per, aj) in HOJAS[clave_anexo].items():
            if hoja not in x.sheet_names:
                raise RuntimeError(f"El anexo {clave_anexo} ya no tiene la hoja {hoja!r}")
            crudo += leer_hoja(x.parse(hoja, header=None, dtype=object), tipo, per, aj)

    series, registros = {}, []
    sufijo = {("mensual", "original"): "M", ("mensual", "desestacionalizada"): "M_DESEST",
              ("trimestre movil", "original"): "TM"}
    for tipo, per, aj, dominio, texto, vals in crudo:
        c = concepto(texto)
        if tipo in ("general", "sexo", "ciudad"):
            if c is None:
                continue
            medida, unidad, corto = c
            categoria = "Total"
            sid = f"EMP_{slug(dominio)}_{sufijo[(per, aj)]}"
        else:
            # rama, posición, fuera de la fuerza de trabajo: cada fila es una categoría
            es_total = c is not None or sin_tildes(texto).startswith(("poblacion ocupada", "total"))
            categoria = "Total" if es_total else texto
            medida = "fuera_ft" if tipo == "fuera_ft" else "ocupados"
            unidad, corto = "miles de personas", ("Población fuera de la fuerza de trabajo" if tipo == "fuera_ft" else "Población ocupada")
            sid = f"EMP_{slug(dominio)}_{tipo.upper()}_{slug(categoria, 30)}_{sufijo[(per, aj)]}"
        series.setdefault(sid, dict(id_serie=sid, indicador="Mercado laboral", dominio=dominio,
                                    desagregacion=tipo, categoria=categoria, periodicidad=per,
                                    ajuste=aj, fuente="DANE - GEIH"))
        for f, v in vals.items():
            if v is None or (v == 0 and medida in NUEVAS_2021):
                continue
            registros.append((f, sid, medida, v, unidad, corto))

    df = pd.DataFrame(registros, columns=["fecha", "id_serie", "medida", "valor", "unidad", "nombre_medida"])
    df = df.drop_duplicates(["fecha", "id_serie", "medida"], keep="first")
    medidas = df[["medida", "unidad", "nombre_medida"]].drop_duplicates("medida").sort_values("medida")
    df = df[["fecha", "id_serie", "medida", "valor"]]
    df["valor"] = df.valor.round(4)
    df = df.sort_values(["fecha", "id_serie", "medida"]).reset_index(drop=True)
    series = pd.DataFrame(series.values()).sort_values("id_serie")

    # chequeos mínimos
    nac = df[(df.id_serie == "EMP_TOTAL_NACIONAL_M") & (df.medida == "td")]
    if nac.empty or nac.fecha.min() > "2001-12-01":
        raise RuntimeError("No se encontró la tasa de desocupación nacional mensual desde 2001")
    ciudades = series[series.desagregacion == "ciudad"].dominio.nunique()
    if ciudades < 20:
        raise RuntimeError(f"Se esperaban al menos 20 ciudades y se encontraron {ciudades}")

    SALIDA.mkdir(parents=True, exist_ok=True)
    series.to_csv(SALIDA / "series.csv", index=False, encoding="utf-8")
    medidas.to_csv(SALIDA / "medidas.csv", index=False, encoding="utf-8")
    df.to_csv(SALIDA / "datos.csv", index=False, encoding="utf-8")
    print(f"series.csv: {len(series)} series | datos.csv: {len(df)} filas | último mes {df.fecha.max()}")


if __name__ == "__main__":
    main()
