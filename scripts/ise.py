"""
ISE (Indicador de Seguimiento a la Economía) - DANE.

El DANE publica dos anexos, ambos con la serie completa desde 2005 (base 2015 = 100):
  - 9 agrupaciones de actividades: cada mes.
  - 12 agrupaciones (más detalle: separa agro de minería e industria de construcción):
    cada trimestre, con el PIB.
Cada uno trae la serie original, la desestacionalizada (ajustada por estacionalidad y
calendario) y la de tendencia-ciclo.

Como el DANE revisa el ISE hacia atrás en cada publicación, siempre se descarga y se
reconstruye la serie completa (son solo dos archivos).

Salida:
  datos/ise/series.csv   una fila por serie
  datos/ise/datos.csv    fecha | id_serie | medida | valor

Uso:  python scripts/ise.py [carpeta_cache]
"""
import re
import sys
import time
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ipc import bajar  # noqa: E402  (misma descarga con reintentos y respeto del límite del DANE)

RAIZ = Path(__file__).resolve().parents[1]
SALIDA = RAIZ / "datos" / "ise"
DANE = "https://www.dane.gov.co"
PAGINAS = [
    "/index.php/estadisticas-por-tema/cuentas-nacionales/indicador-de-seguimiento-a-la-economia-ise",
    "/index.php/estadisticas-por-tema/cuentas-nacionales/indicador-de-seguimiento-a-la-economia-ise/historicos-ise-comunicados-y-boletines",
]
MESES = {"ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6,
         "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12}
MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
                "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
CUADROS = {"Cuadro 1": "original", "Cuadro 2": "desest", "Cuadro 3": "tendencia"}

# clave -> (nombre corto, padre, nivel)
ESTRUCTURA = {
    "TOTAL": ("ISE total", None, "total"),
    "PRI": ("Actividades primarias", "TOTAL", "gran_rama"),
    "SEC": ("Actividades secundarias", "TOTAL", "gran_rama"),
    "TER": ("Actividades terciarias", "TOTAL", "gran_rama"),
    "AB": ("Agro y minería", "PRI", "agrupacion"),
    "A": ("Agropecuario", "PRI", "agrupacion"),
    "B": ("Minería", "PRI", "agrupacion"),
    "CF": ("Industria y construcción", "SEC", "agrupacion"),
    "C": ("Industria manufacturera", "SEC", "agrupacion"),
    "F": ("Construcción", "SEC", "agrupacion"),
    "DE": ("Electricidad, gas y agua", "TER", "agrupacion"),
    "GHI": ("Comercio, transporte, alojamiento y comida", "TER", "agrupacion"),
    "J": ("Información y comunicaciones", "TER", "agrupacion"),
    "K": ("Financieras y seguros", "TER", "agrupacion"),
    "L": ("Inmobiliarias", "TER", "agrupacion"),
    "MN": ("Profesionales, científicas y administrativas", "TER", "agrupacion"),
    "OPQ": ("Administración pública, educación y salud", "TER", "agrupacion"),
    "RST": ("Entretenimiento y otros servicios", "TER", "agrupacion"),
    "OPQRST": ("Administración pública, educación, salud y otros servicios", "TER", "agrupacion"),
}


def sin_tildes(s):
    s = unicodedata.normalize("NFKD", str(s))
    return "".join(c for c in s if not unicodedata.combining(c)).lower().strip()


def clave(codigo, nombre, version):
    """Identifica la serie a partir del código CIIU (12 agrupaciones) o del nombre (9 agrupaciones)."""
    if codigo:
        c = re.sub(r"[^A-Z]", "", codigo.upper())
        if c in ESTRUCTURA:
            return c
    n = sin_tildes(nombre)
    reglas = [
        ("indicador de seguimiento", "TOTAL"), ("actividades primarias", "PRI"),
        ("actividades secundarias", "SEC"), ("actividades terciarias", "TER"),
        ("agricultura", "AB" if version == 9 else "A"), ("explotacion de minas", "B"),
        ("industrias manufactureras", "CF" if version == 9 else "C"), ("construccion", "F"),
        ("suministro de electricidad", "DE"), ("comercio al por mayor", "GHI"),
        ("informacion y comunicaciones", "J"), ("actividades financieras", "K"),
        ("actividades inmobiliarias", "L"), ("actividades profesionales", "MN"),
        ("administracion publica", "OPQRST" if version == 9 else "OPQ"),
        ("actividades artisticas", "RST"),
    ]
    for patron, k in reglas:
        if n.startswith(patron):
            return k
    raise ValueError(f"Actividad del ISE no reconocida: {nombre!r}")


def listar():
    """URL del anexo más reciente de 9 y de 12 agrupaciones."""
    cand = {9: {}, 12: {}}
    for p in PAGINAS:
        html = bajar(DANE + p).decode("utf-8", "ignore")
        for href in re.findall(r'href="([^"]+\.xlsx)"', html):
            m = re.search(r"anex-ISE-(9|12)actividades-([a-z]{3})(20\d{2})\.xlsx$", href)
            if m and m.group(2) in MESES:
                url = href if href.startswith("http") else DANE + href
                cand[int(m.group(1))][(int(m.group(3)), MESES[m.group(2)])] = url
        time.sleep(1)
    if not cand[9] or not cand[12]:
        raise RuntimeError("No se encontraron los anexos del ISE en la página del DANE")
    return {v: (max(c), c[max(c)]) for v, c in cand.items()}


def _num(v):
    try:
        f = float(v)
        return None if np.isnan(f) else f
    except (TypeError, ValueError):
        return None


def leer_cuadro(df, version, tipo):
    """Recorre un cuadro con tres bloques: índices, crecimiento anual y año corrido."""
    filas, medida, columnas = [], None, {}
    for i in range(len(df)):
        fila = df.iloc[i]
        textos = [sin_tildes(v) for v in fila if isinstance(v, str)]
        # el título de cada bloque está en la primera columna (a la derecha hay un menú de navegación)
        titulo = sin_tildes(fila.iloc[0]) if isinstance(fila.iloc[0], str) else ""
        nuevo = None
        if titulo.startswith("indices con ano de referencia"):
            nuevo = "indice"
        elif titulo.startswith("tasas de crecimiento"):
            nuevo = ("var_ano_corrido" if "corrido" in titulo else
                     "var_mensual" if "mensual" in titulo else
                     "var_anual" if "anual" in titulo else None)
        if nuevo:
            medida, columnas = nuevo, {}
            continue
        if any(t == "concepto" for t in textos):
            continue
        if medida is None:
            continue
        # fila de meses: define a qué fecha corresponde cada columna (el año está en la fila anterior)
        if any(t == "enero" for t in textos) and not columnas:
            anio = None
            for j, v in enumerate(fila):
                y = df.iloc[i - 1, j]
                if y is not None and str(y) != "nan":
                    m = re.match(r"(\d{4})", str(y).strip())
                    if m:
                        anio = int(m.group(1))
                if isinstance(v, str) and sin_tildes(v) in MESES_LARGOS and anio:
                    columnas[j] = f"{anio}-{MESES_LARGOS.index(sin_tildes(v)) + 1:02d}-01"
            continue
        if not columnas:
            continue
        primera = min(columnas)
        etiquetas = [str(v).strip() for v in fila.iloc[:primera] if isinstance(v, str) and str(v).strip()]
        if not etiquetas:
            continue
        valores = {f: _num(fila.iloc[j]) for j, f in columnas.items()}
        if not any(v is not None for v in valores.values()):
            continue
        codigo = etiquetas[0] if len(etiquetas) > 1 else ""
        nombre = " ".join(etiquetas[-1].split())
        k = clave(codigo, nombre, version)
        for f, v in valores.items():
            if v is not None:
                filas.append((f, k, f"{medida}_{tipo}", v, nombre, codigo))
    return filas


def main():
    cache = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ / ".cache" / "ise"
    cache.mkdir(parents=True, exist_ok=True)
    anexos = listar()
    registros, nombres = [], {}
    for version, (periodo, url) in sorted(anexos.items()):
        print(f"ISE {version} agrupaciones: anexo de {periodo[1]:02d}/{periodo[0]}")
        destino = cache / url.rsplit("/", 1)[-1]
        bajar(url, destino)
        time.sleep(2)
        x = pd.ExcelFile(destino)
        for hoja, tipo in CUADROS.items():
            for f, k, med, v, nombre, codigo in leer_cuadro(x.parse(hoja, header=None, dtype=object), version, tipo):
                registros.append((f, f"ISE{version}_{k}", med, v))
                nombres[(version, k)] = (nombre, codigo)

    df = pd.DataFrame(registros, columns=["fecha", "id_serie", "medida", "valor"])
    # las grandes ramas primaria y secundaria salen repetidas con su única agrupación en el anexo de 9
    df = df.drop_duplicates(["fecha", "id_serie", "medida"], keep="first")

    # el DANE no publica la variación anual de la serie desestacionalizada en el anexo; se calcula del índice
    des = df[df.medida == "indice_desest"].sort_values("fecha")
    des = des.assign(valor=des.groupby("id_serie").valor.pct_change(12) * 100, medida="var_anual_desest").dropna()
    df = pd.concat([df, des])

    df["valor"] = df.valor.round(4)
    df = df.sort_values(["fecha", "id_serie", "medida"]).reset_index(drop=True)

    # chequeos
    for v in (9, 12):
        n = df[df.id_serie.str.startswith(f"ISE{v}_")].id_serie.nunique()
        esperado = 13 if v == 9 else 16
        if n != esperado:
            raise RuntimeError(f"ISE {v}: se esperaban {esperado} series y se encontraron {n}")
    assert not df.duplicated(["fecha", "id_serie", "medida"]).any()

    filas = []
    for (version, k), (nombre, codigo) in sorted(nombres.items()):
        corto, padre, nivel = ESTRUCTURA[k]
        rama = ESTRUCTURA[padre][0] if nivel == "agrupacion" else (corto if nivel == "gran_rama" else "Total")
        filas.append(dict(
            id_serie=f"ISE{version}_{k}", indicador="ISE",
            version=f"{version} agrupaciones ({'mensual' if version == 9 else 'trimestral, con el PIB'})",
            nivel=nivel, padre=f"ISE{version}_{padre}" if padre else "", codigo_ciiu=codigo,
            gran_rama=rama, agrupacion=corto if nivel == "agrupacion" else "Total",
            nombre_corto=corto, nombre=nombre if nivel != "total" else "Indicador de Seguimiento a la Economía",
            base="2015 = 100", fuente="DANE"))
    series = pd.DataFrame(filas)

    SALIDA.mkdir(parents=True, exist_ok=True)
    series.to_csv(SALIDA / "series.csv", index=False, encoding="utf-8")
    df.to_csv(SALIDA / "datos.csv", index=False, encoding="utf-8")
    print(f"series.csv: {len(series)} series | datos.csv: {len(df)} filas | "
          f"9 agrupaciones hasta {df[df.id_serie.str.startswith('ISE9_')].fecha.max()}, "
          f"12 agrupaciones hasta {df[df.id_serie.str.startswith('ISE12_')].fecha.max()}")


if __name__ == "__main__":
    main()
