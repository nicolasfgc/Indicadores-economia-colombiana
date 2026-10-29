"""
Comercio exterior de Colombia - DANE (con datos de la DIAN).

Qué se descarga (todo mensual salvo que se diga otra cosa; valores en millones de dólares):
  - Balanza comercial mensual (2007 en adelante): exportaciones FOB, importaciones FOB y balanza.
  - Exportaciones por tipo (1992 en adelante): café, carbón, petróleo y derivados, ferroníquel,
    tradicionales y no tradicionales, en dólares FOB y toneladas.
  - Exportaciones por capítulo del arancel (2008 en adelante), en dólares FOB.
  - Exportaciones por principales destinos (2008 en adelante), en dólares FOB.
  - Importaciones por capítulo del arancel y por principales países de origen (2007 en adelante), en dólares CIF.
  - Importaciones según uso o destino económico (CUODE: consumo, materias primas, bienes de capital),
    en dólares CIF. Mes a mes desde 2022, armado con los anexos mensuales del DANE (cada anexo trae el mes
    y el mismo mes del año anterior); anual desde 1999.
  - Balanza comercial anual por grupos de países y principales países (1995 en adelante).

Salida en datos/comercio/:
  series.csv   qué es cada serie (tema, nombre, nivel, padre, unidad)
  datos.csv    fecha | id_serie | medida | valor   (medida: usd = millones de dólares; toneladas)
  anual.csv    anio | id_serie | valor              (CUODE y balanza por país, millones de dólares)

Uso:  python scripts/comercio.py [--completo]   (--completo vuelve a bajar todos los anexos mensuales de CUODE)
"""
import io
import re
import sys
import time
import unicodedata
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ipc import bajar  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
SALIDA = RAIZ / "datos" / "comercio"
DANE = "https://www.dane.gov.co"
PAGINAS = {
    "EXPO": "/index.php/estadisticas-por-tema/comercio-internacional/exportaciones",
    "IMPO": "/index.php/estadisticas-por-tema/comercio-internacional/importaciones",
    "BCOM": "/index.php/estadisticas-por-tema/comercio-internacional/balanza-comercial",
    "IMPO_HIST": "/index.php/estadisticas-por-tema/comercio-internacional/importaciones/importaciones-historicos",
}
MES = {"ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6, "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12}
MES_LARGO = {"enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
             "septiembre": 9, "setiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12}


def slug(s):
    s = unicodedata.normalize("NFD", str(s)).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_").upper()


def limpio(s):
    return " ".join(str(s).replace("\n", " ").split())


def enlaces(clave):
    html = bajar(DANE + PAGINAS[clave]).decode("utf-8", "ignore")
    return [h if h.startswith("http") else DANE + h for h in re.findall(r'href="([^"]+\.xlsx?)"', html)]


def ultimo(lista, patron):
    """El anexo más reciente cuyo nombre empieza por `patron` (p. ej. 'anex-IMP-OrigenImpo-')."""
    cands = []
    for u in lista:
        m = re.search(re.escape(patron) + r"([a-z]{3})(20\d{2})\.xlsx?$", u.rsplit("/", 1)[-1])
        if m and m.group(1) in MES:
            cands.append(((int(m.group(2)), MES[m.group(1)]), u))
    if not cands:
        raise RuntimeError(f"No se encontró el anexo {patron} en la página del DANE")
    return max(cands)


def leer(url):
    time.sleep(3)  # el DANE limita la frecuencia de descargas
    return pd.read_excel(io.BytesIO(bajar(url, timeout=180)), sheet_name=None, header=None)


def fecha(v):
    try:
        f = pd.Timestamp(v)
        return f.strftime("%Y-%m-01") if 1950 < f.year < 2100 else None
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------- lectores de cada anexo
def balanza_mensual(hojas):
    d = next(iter(hojas.values()))
    filas = []
    for r in d.itertuples(index=False):
        f = fecha(r[0])
        if f and pd.notna(r[1]):
            filas += [(f, "BAL_EXPO", "usd", float(r[1])), (f, "BAL_IMPO", "usd", float(r[2])), (f, "BAL_BALANZA", "usd", float(r[3]))]
    series = [dict(id_serie="BAL_EXPO", tema="balanza", nombre="Exportaciones", nivel="total", padre="", unidad="Millones de dólares FOB"),
              dict(id_serie="BAL_IMPO", tema="balanza", nombre="Importaciones", nivel="total", padre="", unidad="Millones de dólares FOB"),
              dict(id_serie="BAL_BALANZA", tema="balanza", nombre="Balanza comercial (exportaciones − importaciones)", nivel="total", padre="", unidad="Millones de dólares FOB")]
    return filas, series


def expo_tipo(hojas):
    d = next(iter(hojas.values()))
    # fila de productos y fila de unidades
    fp = next(i for i in range(25) if any("Café" in str(x) for x in d.iloc[i]))
    nombres = {"Café": ("CAFE", "Café"), "Carbón": ("CARBON", "Carbón"), "Petróleo": ("PETROLEO", "Petróleo y sus derivados"),
               "Ferroníquel": ("FERRONIQUEL", "Ferroníquel"), "Total Exportaciones Tradicionales": ("TRADICIONALES", "Tradicionales (café, carbón, petróleo y ferroníquel)")}
    cols = {}
    for j in range(d.shape[1]):
        p = limpio(d.iat[fp, j]) if pd.notna(d.iat[fp, j]) else ""
        for k, v in nombres.items():
            if p.startswith(k):
                cols[v] = j
    # no tradicionales y total están en la fila de arriba
    for j in range(d.shape[1]):
        p = limpio(d.iat[fp - 1, j]) if pd.notna(d.iat[fp - 1, j]) else ""
        if p.startswith("Exportaciones no tradicionales"):
            cols[("NOTRADICIONALES", "No tradicionales (industria, flores, banano, otros)")] = j
        elif p.startswith("Total exportaciones"):
            cols[("TOTAL", "Total exportaciones")] = j
    if len(cols) != 7:
        raise RuntimeError(f"Exportaciones por tipo: columnas inesperadas {cols}")
    filas = []
    for r in d.itertuples(index=False):
        f = fecha(r[0])
        if not f:
            continue
        for (k, _), j in cols.items():
            v = r[j]
            if pd.notna(v):
                filas.append((f, f"EXP_TIPO_{k}", "usd", float(v) / 1000))
            t = r[j + 1] if j + 1 < len(r) else None
            if k in ("CAFE", "CARBON", "PETROLEO", "FERRONIQUEL") and pd.notna(t):
                filas.append((f, f"EXP_TIPO_{k}", "toneladas", float(t)))
    series = [dict(id_serie=f"EXP_TIPO_{k}", tema="expo_tipo", nombre=n, nivel="total" if k == "TOTAL" else "grupo" if k in ("TRADICIONALES", "NOTRADICIONALES") else "producto",
                   padre="" if k == "TOTAL" else "EXP_TIPO_TOTAL" if k in ("TRADICIONALES", "NOTRADICIONALES") else "EXP_TIPO_TRADICIONALES", unidad="Millones de dólares FOB")
              for (k, n) in cols]
    return filas, series


def expo_capitulos(hojas):
    d = next(iter(hojas.values()))
    fc = next(i for i in range(20) if str(d.iat[i, 0]).strip() == "Mes")
    filas, series = [], []
    cols = {}
    for j in range(1, d.shape[1]):
        cod, nom = d.iat[fc, j], d.iat[fc + 1, j]
        if pd.notna(cod) and str(cod).strip().isdigit():
            sid = f"EXP_CAP_{int(cod):02d}"
            cols[sid] = j
            series.append(dict(id_serie=sid, tema="expo_capitulo", nombre=limpio(nom), nivel="capitulo", padre="EXP_TIPO_TOTAL", unidad="Millones de dólares FOB", codigo=f"{int(cod):02d}"))
    for r in d.itertuples(index=False):
        f = fecha(r[0])
        if f:
            filas += [(f, sid, "usd", float(r[j]) / 1000) for sid, j in cols.items() if pd.notna(r[j])]
    return filas, series


def expo_destinos(hojas):
    d = next(iter(hojas.values()))
    fg = next(i for i in range(20) if str(d.iat[i, 0]).strip() == "Mes")
    grupo, cols, series = "", {}, []
    for j in range(1, d.shape[1]):
        g, p = d.iat[fg, j], d.iat[fg + 1, j]
        if pd.notna(g):
            grupo = limpio(g)
        if pd.isna(g) and pd.isna(p):
            continue
        nombre = limpio(p) if pd.notna(p) else grupo
        if nombre.lower().startswith("total"):
            continue
        sid = "EXP_DEST_" + slug(nombre)
        cols[sid] = j
        series.append(dict(id_serie=sid, tema="expo_destino", nombre=nombre.replace("Resto de paises", "Resto de países"), nivel="pais",
                           padre=grupo if pd.notna(p) and grupo != nombre else "", unidad="Millones de dólares FOB"))
    filas = []
    for r in d.itertuples(index=False):
        f = fecha(r[0])
        if f:
            filas += [(f, sid, "usd", float(r[j]) / 1000) for sid, j in cols.items() if pd.notna(r[j])]
    return filas, series


def impo_bloques(hojas, prefijo, tema, nivel):
    """Anexos de importaciones con un bloque por capítulo o país: filas de meses y columnas de años."""
    d = next(iter(hojas.values()))
    fa = next(i for i in range(15) if sum(str(x).strip().rstrip("*").replace(".0", "").isdigit() for x in d.iloc[i]) >= 5)
    anios = {j: int(float(str(d.iat[fa, j]).rstrip("*"))) for j in range(2, d.shape[1]) if str(d.iat[fa, j]).strip().rstrip("*").replace(".0", "").isdigit()}
    filas, series, actual = [], [], None
    for r in d.iloc[fa + 1:].itertuples(index=False):
        nom = limpio(r[0]) if pd.notna(r[0]) else ""
        if nom and not nom.startswith("Total") and not nom.startswith("Fuente") and str(r[1]).strip().lower() in MES_LARGO:
            actual = nom
            series.append(dict(id_serie=f"{prefijo}_{slug(nom)}", tema=tema, nombre=nom, nivel=nivel, padre="", unidad="Millones de dólares CIF"))
        mes = MES_LARGO.get(str(r[1]).strip().lower())
        if actual and mes:
            for j, a in anios.items():
                v = r[j]
                if pd.notna(v) and float(v) != 0:
                    filas.append((f"{a}-{mes:02d}-01", f"{prefijo}_{slug(actual)}", "usd", float(v) / 1000))
    # el año en curso trae ceros en los meses que aún no se publican: se descartaron arriba
    return filas, series


CUODE_GRUPOS = {"1": "Bienes de consumo no duradero", "2": "Bienes de consumo duradero", "3": "Combustibles, lubricantes y conexos",
                "4": "Materias primas para la agricultura", "5": "Materias primas para la industria", "6": "Materiales de construcción",
                "7": "Bienes de capital para la agricultura", "8": "Bienes de capital para la industria", "9": "Equipo de transporte"}
CUODE_CATEGORIAS = {"C": ("Bienes de consumo", "12"), "M": ("Materias primas y productos intermedios", "345"),
                    "K": ("Bienes de capital y materiales de construcción", "6789")}


def cuode_series():
    s = [dict(id_serie="IMP_CUODE_TOTAL", tema="impo_cuode", nombre="Total importaciones", nivel="total", padre="", unidad="Millones de dólares CIF")]
    for k, (n, gs) in CUODE_CATEGORIAS.items():
        s.append(dict(id_serie=f"IMP_CUODE_{k}", tema="impo_cuode", nombre=n, nivel="categoria", padre="IMP_CUODE_TOTAL", unidad="Millones de dólares CIF"))
        for g in gs:
            s.append(dict(id_serie=f"IMP_CUODE_{g}", tema="impo_cuode", nombre=CUODE_GRUPOS[g], nivel="grupo", padre=f"IMP_CUODE_{k}", unidad="Millones de dólares CIF"))
    return s


def cuode_mensual(hojas):
    """Cuadro A13 del anexo mensual de importaciones: el mes del año y el mismo mes del año anterior."""
    d = next(v for k, v in hojas.items() if k.strip() == "Cuadro A13")
    titulo = next(limpio(x) for x in d[0] if isinstance(x, str) and re.match(r"^[A-Za-z]+ \(\d{4} - \d{4}\)", limpio(x)))
    m = re.match(r"^([A-Za-z]+) \((\d{4}) - (\d{4})\)", titulo)
    mes = MES_LARGO[m.group(1).lower()]
    # columnas con año (p. ej. "2025p"): las dos últimas son el mes del año anterior y el actual
    fy = next(i for i in range(6, 15) if sum(bool(re.fullmatch(r"\d{4}p?", str(x).strip())) for x in d.iloc[i]) >= 2)   # en enero solo hay dos
    cy = [j for j in range(d.shape[1]) if re.fullmatch(r"\d{4}p?", str(d.iat[fy, j]).strip())]
    (j_ant, j_act) = cy[-2], cy[-1]
    a_ant, a_act = int(str(d.iat[fy, j_ant])[:4]), int(str(d.iat[fy, j_act])[:4])
    filas, pendiente, subs = [], None, []
    def guardar(sid, r):
        for j, a in ((j_ant, a_ant), (j_act, a_act)):
            if pd.notna(r[j]):
                filas.append((f"{a}-{mes:02d}-01", sid, "usd", float(r[j]) / 1000))
    for r in d.iloc[fy + 1:].itertuples(index=False):
        cod = str(r[0]).strip().replace(".0", "") if pd.notna(r[0]) else ""
        n1 = limpio(r[1]) if pd.notna(r[1]) else ""
        n3 = limpio(r[3]) if len(r) > 3 and pd.notna(r[3]) else ""
        if n1 == "Total importaciones":
            guardar("IMP_CUODE_TOTAL", r)
        elif n1 and not cod:
            k = next((k for k, (n, _) in CUODE_CATEGORIAS.items() if n1.lower().startswith(n[:20].lower())), None)
            if k:
                guardar(f"IMP_CUODE_{k}", r)
        elif re.fullmatch(r"\d", cod):
            if pd.notna(r[j_act]) or pd.notna(r[j_ant]):
                guardar(f"IMP_CUODE_{cod}", r)
            else:
                pendiente = cod   # los valores vienen en la fila siguiente
        elif pendiente and not cod and (pd.notna(r[j_act]) or pd.notna(r[j_ant])):
            guardar(f"IMP_CUODE_{pendiente}", r)
            pendiente = None
        elif re.fullmatch(r"\d\d", cod) and n3:
            sid = f"IMP_CUODE_{cod}"
            subs.append(dict(id_serie=sid, tema="impo_cuode", nombre=n3, nivel="subgrupo", padre=f"IMP_CUODE_{cod[0]}", unidad="Millones de dólares CIF"))
            guardar(sid, r)
    return filas, subs, (a_act, mes)


def cuode_anual(hojas):
    d = next(iter(hojas.values()))
    fa = next(i for i in range(15) if str(d.iat[i, 0]).strip() == "Sector")
    cols = {j: int(str(d.iat[fa, j]).rstrip("*").split(".")[0]) for j in range(1, d.shape[1]) if re.fullmatch(r"\d{4}(\.0)?\*?", str(d.iat[fa, j]).strip())}
    mapa = {"total importaciones": "TOTAL", "bienes de consumo": "C", "consumo no duradero": "1", "consumo duradero": "2",
            "materias primas y productos intermedios": "M", "combustibles, lubricantes y conexos": "3", "mat. prim. y prod. int. para agricu": "4",
            "mat prim. y prod. int. para industria": "5", "bienes de capital y materiales de co": "K", "materiales de construcción": "6",
            "bienes de capital para la agricultura": "7", "bienes de capital para la industria": "8", "equipo de transporte": "9"}
    filas = []
    for r in d.iloc[fa + 1:].itertuples(index=False):
        n = limpio(r[0]).lower() if pd.notna(r[0]) else ""
        k = next((v for kk, v in mapa.items() if n.startswith(kk)), None)
        if k:
            filas += [(a, f"IMP_CUODE_{k}", float(r[j])) for j, a in cols.items() if pd.notna(r[j])]
    return filas


def balanza_paises(hojas):
    d = next(iter(hojas.values()))
    fa = next(i for i in range(15) if str(d.iat[i, 0]).strip() == "Origen")
    cols = {j: int(float(str(d.iat[fa, j]).rstrip("*"))) for j in range(1, d.shape[1]) if re.fullmatch(r"\d{4}(\.0)?\*?", str(d.iat[fa, j]).strip())}
    filas, series = [], []
    for r in d.iloc[fa + 1:].itertuples(index=False):
        n = limpio(r[0]) if pd.notna(r[0]) else ""
        if not n or n in ("Grupos comerciales", "Principales países") or n.startswith(("Fuente", "Nota", "1/", "p ", "*", "Actualizado")) or pd.isna(r[1]):
            continue
        nombre = "Total" if n.lower().startswith("total") else n
        sid = "BAL_PAIS_" + slug(nombre)
        series.append(dict(id_serie=sid, tema="balanza_pais", nombre=nombre, nivel="total" if nombre == "Total" else "pais", padre="", unidad="Millones de dólares FOB"))
        filas += [(a, sid, float(r[j])) for j, a in cols.items() if pd.notna(r[j])]
    return filas, series


# ---------------------------------------------------------------- principal
def main():
    completo = "--completo" in sys.argv
    SALIDA.mkdir(parents=True, exist_ok=True)
    expo, impo, bcom = enlaces("EXPO"), enlaces("IMPO"), enlaces("BCOM")
    time.sleep(2)
    hist = enlaces("IMPO_HIST")

    filas, series, anual = [], [], []
    (per, u) = ultimo(bcom, "anex-BCOM-Mensual-")
    print(f"Último mes publicado: {per[1]:02d}/{per[0]}")
    # si ya está ese mes, no hay nada nuevo que bajar (el DANE publica una vez al mes)
    if (SALIDA / "datos.csv").exists() and not completo:
        ya = pd.read_csv(SALIDA / "datos.csv", usecols=["fecha", "id_serie"])
        if ((ya.id_serie == "BAL_EXPO") & (ya.fecha == f"{per[0]}-{per[1]:02d}-01")).any():
            print("Sin datos nuevos.")
            return
    for fn in (lambda: balanza_mensual(leer(u)),
               lambda: expo_tipo(leer(ultimo(expo, "anex-EXPORTACIONES-SerieCafeCarbonPetroleoNotradicionales-")[1])),
               lambda: expo_capitulos(leer(ultimo(expo, "anex-EXPORTACIONES-SerieSegunCapitulosArancel-")[1])),
               lambda: expo_destinos(leer(ultimo(expo, "anex-EXPORTACIONES-SeriePrincipalesDestinos-")[1])),
               lambda: impo_bloques(leer(ultimo(impo, "anex-IMP-MensCapiArancel-")[1]), "IMP_CAP", "impo_capitulo", "capitulo"),
               lambda: impo_bloques(leer(ultimo(impo, "anex-IMP-MensPrincPaisesOrigen-")[1]), "IMP_ORIG", "impo_origen", "pais")):
        f, s = fn()
        filas += f
        series += s
        print(f"  {s[0]['tema']}: {len(s)} series, {len(f):,} datos")
    f, s = balanza_paises(leer(ultimo(bcom, "anex-BCOM-GrupEconoPrinPaises-")[1]))
    anual += f
    series += s
    anual += cuode_anual(leer(ultimo(impo, "anex-IMP-ImpoClasiCUODE-")[1]))

    # CUODE mensual: se reutiliza lo ya guardado y solo se bajan los anexos de meses nuevos (más el último, que revisa el anterior)
    previo = pd.read_csv(SALIDA / "datos.csv") if (SALIDA / "datos.csv").exists() and not completo else pd.DataFrame(columns=["fecha", "id_serie", "medida", "valor"])
    cu_prev = previo[previo.id_serie.str.startswith("IMP_CUODE_")]
    hechos = set(cu_prev.fecha)
    mensuales = {}
    for url in set(impo + hist):
        m = re.search(r"anex-IMP-([a-z]{3})(20\d{2})\.xls$", url)
        if m and m.group(1) in MES:
            mensuales[(int(m.group(2)), MES[m.group(1)])] = url
    pendientes = sorted(k for k in mensuales if f"{k[0]}-{k[1]:02d}-01" not in hechos or k == max(mensuales))
    cuode = {(r.fecha, r.id_serie): r.valor for r in cu_prev.itertuples()}
    subs = {}
    if (SALIDA / "series.csv").exists() and not completo:
        for r in pd.read_csv(SALIDA / "series.csv", dtype=str).fillna("").to_dict("records"):
            if r["nivel"] == "subgrupo":
                subs[r["id_serie"]] = {k: r[k] for k in ("id_serie", "tema", "nombre", "nivel", "padre", "unidad")}
    for k in pendientes:
        f, s, _ = cuode_mensual(leer(mensuales[k]))
        for x in f:   # se procesan en orden: lo más reciente (revisado) queda encima
            cuode[(x[0], x[1])] = x[3]
        for x in s:
            subs[x["id_serie"]] = x
        print(f"  CUODE {k[1]:02d}/{k[0]}: {len(f)} datos")
    filas += [(fe, sid, "usd", v) for (fe, sid), v in cuode.items()]
    series += cuode_series() + sorted(subs.values(), key=lambda x: x["id_serie"])

    datos = pd.DataFrame(filas, columns=["fecha", "id_serie", "medida", "valor"]).drop_duplicates(["fecha", "id_serie", "medida"], keep="last")
    datos["valor"] = datos.valor.round(4)
    datos = datos.sort_values(["fecha", "id_serie", "medida"])
    ser = pd.DataFrame(series).drop_duplicates("id_serie", keep="last").fillna("")
    faltan = set(datos.id_serie) - set(ser.id_serie)
    if faltan:
        raise RuntimeError(f"Series sin descripción: {sorted(faltan)[:5]}")
    an = pd.DataFrame(anual, columns=["anio", "id_serie", "valor"]).drop_duplicates(["anio", "id_serie"], keep="last").sort_values(["anio", "id_serie"])
    an["valor"] = an.valor.round(4)

    # controles: la balanza es exportaciones menos importaciones y los tipos de exportación suman el total
    b = datos[datos.id_serie.str.startswith("BAL_")].pivot(index="fecha", columns="id_serie", values="valor")
    assert (b.BAL_EXPO - b.BAL_IMPO - b.BAL_BALANZA).abs().max() < 0.01, "balanza no cuadra"
    t = datos[(datos.medida == "usd") & datos.id_serie.isin(["EXP_TIPO_TRADICIONALES", "EXP_TIPO_NOTRADICIONALES", "EXP_TIPO_TOTAL"])].pivot(index="fecha", columns="id_serie", values="valor")
    assert (t.EXP_TIPO_TRADICIONALES + t.EXP_TIPO_NOTRADICIONALES - t.EXP_TIPO_TOTAL).abs().max() < 0.5, "tipos de exportación no suman el total"
    c = datos[datos.id_serie.str.fullmatch(r"IMP_CUODE_[CMK]")].groupby("fecha").valor.sum()
    tot = datos[datos.id_serie == "IMP_CUODE_TOTAL"].set_index("fecha").valor
    assert ((tot - c).abs() / tot).max() < 0.01, "CUODE: las categorías no suman el total"

    ser.to_csv(SALIDA / "series.csv", index=False, encoding="utf-8")
    datos.to_csv(SALIDA / "datos.csv", index=False, encoding="utf-8")
    an.to_csv(SALIDA / "anual.csv", index=False, encoding="utf-8")
    print(f"series.csv: {len(ser)} | datos.csv: {len(datos):,} filas ({datos.fecha.min()} a {datos.fecha.max()}) | anual.csv: {len(an):,} filas")


if __name__ == "__main__":
    main()
