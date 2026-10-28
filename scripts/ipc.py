"""
IPC (Índice de Precios al Consumidor) - DANE.

Descarga todos los anexos mensuales del IPC desde enero de 2019 (base dic 2018 = 100,
nomenclatura COICOP) y construye:

  datos/ipc/series.csv   una fila por serie (total, división, grupo, subclase)
  datos/ipc/datos.csv    fecha | id_serie | medida | valor

Cada corrida descarga solo los meses nuevos (y vuelve a leer el último guardado,
por si el DANE lo corrigió). Con --completo reconstruye toda la serie desde 2019.

Uso:  python scripts/ipc.py [carpeta_cache] [--completo]
"""
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

RAIZ = Path(__file__).resolve().parents[1]
SALIDA = RAIZ / "datos" / "ipc"
DANE = "https://www.dane.gov.co"
PAGINAS = [
    "/index.php/estadisticas-por-tema/precios-y-costos/indice-de-precios-al-consumidor-ipc/ipc-historico",
    "/index.php/estadisticas-por-tema/precios-y-costos/indice-de-precios-al-consumidor-ipc/ipc-informacion-tecnica",
    "/index.php/estadisticas-por-tema/precios-y-costos/indice-de-precios-al-consumidor-ipc",
]
MESES = {"ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6,
         "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12}
MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
                "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
UA = {"User-Agent": "Mozilla/5.0 (indicadores-economia-colombiana)"}


# ---------------------------------------------------------------- descarga
def bajar(url, destino=None, intentos=6, timeout=120, contexto=None):
    """Descarga con reintentos. Si el servidor pide esperar (error 429), espera lo que indique.
    `contexto` permite pasar una configuración de certificados propia (ver scripts/tasas.py)."""
    for i in range(intentos):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout, context=contexto) as r:
                data = r.read()
            if destino:
                Path(destino).write_bytes(data)
            return data
        except Exception as e:  # noqa: BLE001
            if i == intentos - 1:
                raise RuntimeError(f"No se pudo descargar {url}: {e}") from e
            espera = 10 * (i + 1)
            if isinstance(e, urllib.error.HTTPError) and e.code == 429:
                try:
                    espera = max(int(e.headers.get("Retry-After", 0)), 30 * (i + 1))
                except ValueError:
                    espera = 30 * (i + 1)
            print(f"  reintento {i + 1} en {espera}s ({e})")
            time.sleep(espera)


def periodo_de(nombre):
    m = re.search(r"_([a-z]{3})(\d{2})\.xlsx$", nombre) or re.search(r"-([a-z]{3})(20\d{2})\.xlsx$", nombre)
    if not m or m.group(1) not in MESES:
        return None
    y = int(m.group(2))
    return (y + 2000 if y < 100 else y), MESES[m.group(1)]


def listar_anexos():
    """Devuelve {(año, mes): url} de los anexos mensuales desde 2019 y la url del anexo de índices."""
    anexos, indices = {}, {}
    for p in PAGINAS:
        html = bajar(DANE + p).decode("utf-8", "ignore")
        for href in re.findall(r'href="([^"]+\.xlsx?)"', html):
            nombre = href.rsplit("/", 1)[-1]
            if re.fullmatch(r"anexo_ipc_[a-z]{3}\d{2}\.xlsx|anex-IPC-[a-z]{3}20\d{2}\.xlsx", nombre):
                per = periodo_de(nombre)
                if per and per[0] >= 2019:
                    anexos[per] = href if href.startswith("http") else DANE + href
            m = re.fullmatch(r"anex-IPC-Indices-([a-z]{3})(20\d{2})\.xlsx", nombre)
            if m:
                indices[(int(m.group(2)), MESES[m.group(1)])] = href if href.startswith("http") else DANE + href
    if not anexos or not indices:
        raise RuntimeError("No se encontraron anexos del IPC en las páginas del DANE")
    return dict(sorted(anexos.items())), indices[max(indices)]


# ---------------------------------------------------------------- lectura
def _txt(v):
    return str(v).strip().lower() if v is not None and str(v) != "nan" else ""


def _codigo(v):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    s = str(v).strip()
    if re.fullmatch(r"\d+(\.0)?", s):
        s = s.split(".")[0]
        if 6 <= len(s) <= 8:
            return s.zfill(8)
    return None


def _num(v):
    try:
        f = float(str(v).replace(",", "."))
        return None if np.isnan(f) else f
    except (TypeError, ValueError):
        return None


def leer_anexo(path, anio, mes):
    """Lee divisiones, grupos y subclases (variaciones y contribuciones) y el total."""
    filas, total = [], None
    x = pd.ExcelFile(path)
    for hoja in x.sheet_names:
        df = x.parse(hoja, header=None, dtype=object)
        if hoja.strip() == "1":  # total nacional: fila del año en curso
            for _, r in df.iterrows():
                if _num(r.iloc[0]) == anio:
                    total = dict(var_mensual=_num(r.iloc[1]), var_ano_corrido=_num(r.iloc[2]), var_anual=_num(r.iloc[3]))
                    break
            continue
        if df.shape[0] < 5:
            continue
        h = next((i for i in range(min(25, len(df))) if any(_txt(v) == "mensual" for v in df.iloc[i])), None)
        if h is None:
            continue
        enc = [_txt(v) for v in df.iloc[h]]
        pos_m = [j for j, v in enumerate(enc) if v == "mensual"]
        arriba = [_txt(v) for v in df.iloc[h - 1]]
        c_ind = next((j for j, v in enumerate(arriba) if v.startswith(("índice", "indice"))), None)
        c_ciu = next((j for j, v in enumerate(arriba) if "ciudad" in v), None)
        cuerpo = df.iloc[h + 1:]
        c_cod = next((j for j in range(df.shape[1]) if sum(_codigo(v) is not None for v in cuerpo.iloc[:, j]) >= 5), None)
        if c_cod is None:
            continue
        for _, r in cuerpo.iterrows():
            cod = _codigo(r.iloc[c_cod])
            if not cod:
                continue
            if c_ciu is not None and _txt(r.iloc[c_ciu]) not in ("nacional", "total nacional", "total ipc"):
                continue
            f = dict(anio=anio, mes=mes, codigo=cod, nombre=" ".join(str(r.iloc[c_cod + 1]).split()))
            f["indice"] = _num(r.iloc[c_ind]) if c_ind is not None else None
            v = pos_m[0]
            f["var_mensual"], f["var_ano_corrido"], f["var_anual"] = (_num(r.iloc[v + k]) for k in range(3))
            if len(pos_m) > 1:
                c = pos_m[1]
                f["contrib_mensual"], f["contrib_ano_corrido"], f["contrib_anual"] = (_num(r.iloc[c + k]) for k in range(3))
            filas.append(f)
    return filas, total


def leer_indice_total(path):
    ix = pd.read_excel(path, header=None, dtype=object)
    h = next(i for i in range(len(ix)) if _txt(ix.iloc[i, 0]) == "mes")
    anios = [int(_num(v)) if _num(v) else None for v in ix.iloc[h]]
    out = {}
    for i in range(h + 1, h + 13):
        mes = MESES_LARGOS.index(_txt(ix.iloc[i, 0])) + 1
        for j, a in enumerate(anios):
            if a and _num(ix.iloc[i, j]) is not None:
                out[(a, mes)] = _num(ix.iloc[i, j])
    return out


def nivel(cod):
    if cod[2:] == "000000":
        return "division"
    if cod[3:] == "00000":
        return "grupo"
    if cod[4:] == "0000":
        return "clase"
    return "subclase"


def limpia(s):
    s = " ".join(str(s).split())
    return s[:1].upper() + s[1:].lower()


# ---------------------------------------------------------------- principal
def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    completo = "--completo" in sys.argv
    cache = Path(args[0]) if args else RAIZ / ".cache" / "ipc"
    cache.mkdir(parents=True, exist_ok=True)
    anexos, url_indices = listar_anexos()
    print(f"{len(anexos)} anexos publicados: {min(anexos)} a {max(anexos)}")

    # Solo se descarga lo que falta. El histórico ya está guardado en datos/ipc.
    previo, series_prev = None, None
    if not completo and (SALIDA / "datos.csv").exists() and (SALIDA / "series.csv").exists():
        previo = pd.read_csv(SALIDA / "datos.csv", dtype={"fecha": str})
        series_prev = pd.read_csv(SALIDA / "series.csv", dtype=str).fillna("")
        tiene = set(previo.loc[(previo.id_serie == "IPC_TOTAL") & (previo.medida == "var_anual"), "fecha"])
        nuevos = [p for p in anexos if f"{p[0]}-{p[1]:02d}-01" not in tiene]
        if not nuevos:
            print("Sin datos nuevos del DANE.")
            return
        # se vuelve a leer también el último mes guardado, por si el DANE lo corrigió
        ultimo = max(p for p in anexos if f"{p[0]}-{p[1]:02d}-01" in tiene) if tiene else None
        objetivo = sorted(set(nuevos) | ({ultimo} if ultimo else set()))
    else:
        objetivo = sorted(anexos)
    print(f"Se procesan {len(objetivo)} meses: {objetivo[0]} a {objetivo[-1]}")

    filas, totales = [], {}
    for (a, m) in objetivo:
        url = anexos[(a, m)]
        destino = cache / url.rsplit("/", 1)[-1]
        if not destino.exists() or (a, m) in objetivo[-2:]:
            bajar(url, destino)
            time.sleep(3)  # pausa para no saturar al DANE
        f, t = leer_anexo(destino, a, m)
        filas += f
        totales[(a, m)] = t
    ruta_ind = cache / url_indices.rsplit("/", 1)[-1]
    bajar(url_indices, ruta_ind)
    ind_total = leer_indice_total(ruta_ind)

    df = pd.DataFrame(filas)
    df = df[df.codigo.map(nivel) != "clase"]
    df["nivel"] = df.codigo.map(nivel)
    df = df.drop_duplicates(["anio", "mes", "codigo"], keep="first")

    # chequeos de completitud
    faltan = [p for p in objetivo if totales.get(p) is None]
    if faltan:
        raise RuntimeError(f"Sin total nacional para {faltan}")
    cuenta = df.groupby(["anio", "mes"]).codigo.nunique()
    referencia = len(series_prev) - 1 if series_prev is not None else cuenta.max()
    if cuenta.min() < 0.95 * referencia:
        raise RuntimeError(f"Meses incompletos (se esperaban ~{referencia} series):\n{cuenta}")

    # ---- series.csv (nombres guardados + los más recientes del DANE)
    ord_ = df.anio * 100 + df.mes
    nombres = {}
    if series_prev is not None:
        nombres = dict(zip(series_prev.codigo_dane, series_prev.nombre))
        nombres.pop("", None)
    nombres.update(df.assign(o=ord_).sort_values("o").groupby("codigo").nombre.last().map(limpia).to_dict())
    nombres = pd.Series(nombres).sort_index()
    div = {c[:2]: n for c, n in nombres.items() if nivel(c) == "division"}
    gru = {c[:3]: n for c, n in nombres.items() if nivel(c) == "grupo"}
    series = [dict(id_serie="IPC_TOTAL", nivel="total", codigo_dane="", division="Total", grupo="Total",
                   subclase="Total", nombre="IPC total nacional")]
    for c, n in nombres.items():
        nv = nivel(c)
        prefijo = {"division": f"IPC_DIV_{c[:2]}", "grupo": f"IPC_GRU_{c[:3]}", "subclase": f"IPC_SUB_{c}"}[nv]
        series.append(dict(id_serie=prefijo, nivel=nv, codigo_dane=c, division=div[c[:2]],
                           grupo=gru[c[:3]] if nv != "division" else "Total",
                           subclase=n if nv == "subclase" else "Total", nombre=n))
    series = pd.DataFrame(series)
    series["indicador"] = "IPC"
    series["base"] = "Dic 2018 = 100"
    series["metodologia"] = "IPC base 2018 (COICOP), desde ene 2019"
    series["fuente"] = "DANE"
    series = series[["id_serie", "indicador", "nivel", "codigo_dane", "division", "grupo", "subclase",
                     "nombre", "base", "metodologia", "fuente"]]

    # ---- datos.csv
    ids = dict(zip(series.codigo_dane, series.id_serie))
    medidas = ["indice", "var_mensual", "var_ano_corrido", "var_anual",
               "contrib_mensual", "contrib_ano_corrido", "contrib_anual"]
    df["fecha"] = pd.to_datetime(dict(year=df.anio, month=df.mes, day=1)).dt.strftime("%Y-%m-%d")
    df["id_serie"] = df.codigo.map(ids)
    largo = df.melt(id_vars=["fecha", "id_serie"], value_vars=[m for m in medidas if m in df], var_name="medida", value_name="valor")
    tot = []
    for (a, m), t in totales.items():
        fecha = f"{a}-{m:02d}-01"
        if (a, m) in ind_total:
            tot.append((fecha, "IPC_TOTAL", "indice", ind_total[(a, m)]))
        for k, v in t.items():
            tot.append((fecha, "IPC_TOTAL", k, v))
    largo = pd.concat([largo, pd.DataFrame(tot, columns=largo.columns)])
    largo = largo.dropna(subset=["valor"])
    largo["valor"] = largo.valor.astype(float).round(2)
    if previo is not None:  # se reemplazan solo los meses procesados
        procesados = {f"{a}-{m:02d}-01" for a, m in objetivo}
        largo = pd.concat([previo[~previo.fecha.isin(procesados)], largo])
    largo = largo.sort_values(["fecha", "id_serie", "medida"]).reset_index(drop=True)
    assert not largo.duplicated(["fecha", "id_serie", "medida"]).any()

    SALIDA.mkdir(parents=True, exist_ok=True)
    series.to_csv(SALIDA / "series.csv", index=False, encoding="utf-8")
    largo.to_csv(SALIDA / "datos.csv", index=False, encoding="utf-8")
    print(f"series.csv: {len(series)} series | datos.csv: {len(largo)} filas | último mes {largo.fecha.max()}")


if __name__ == "__main__":
    main()
