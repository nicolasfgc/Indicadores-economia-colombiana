"""
Presupuesto General de la Nación: ejecución histórica por sector, 2000 en adelante (anual).

Fuente: Ministerio de Hacienda, Portal de Transparencia Económica, "Cifras Presupuestales
Históricas" (https://www.minhacienda.gov.co/web/pte/cifras-presupuestales):
  - 2.1.A Ejecución PGN 2000-2026 Precios Corrientes
  - 2.1.B Ejecución PGN 2000-2026 Precios Constantes
  - 2.2 Pérdidas de Apropiación PGN
  - 2.3 Rezago Presupuestal PGN

Ese sitio tiene un filtro anti-robots, así que los archivos se descargan a mano y se dejan en
fuentes/minhacienda/ dentro del repositorio; este script los lee de ahí. Basta con volver a
descargarlos cuando Hacienda los actualice (los años cerrados no cambian).

Las cifras de los cuadros vienen en miles de millones de pesos (aunque el encabezado diga
"millones"); se verificó contra la base detallada 2019+ (total 2019: 250,4 billones).

Salida (datos/presupuesto_historico/):
  sectores.csv    anio | sector | sector_comparable | tipo_gasto | fuente | medida | precios | valor
  conceptos.csv   anio | grupo | subgrupo | concepto | fuente | medida | precios | valor
  perdidas_apropiacion.csv, rezago.csv   por sector y año

Uso:  python scripts/presupuesto_historico.py
"""
import re
import unicodedata
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parents[1]
FUENTES = RAIZ / "fuentes" / "minhacienda"
SALIDA = RAIZ / "datos" / "presupuesto_historico"

MEDIDAS = {"apropiacion": "apropiacion", "compromiso": "compromisos", "obligacion": "obligaciones", "pago": "pagos"}
# hoja (prefijo) -> (tipo de gasto, fuente)
HOJAS_SECTOR = {"C8": ("Total sin deuda", "Total"), "C9": ("Total sin deuda", "Nación"), "C10": ("Total sin deuda", "Propios"),
                "C11": ("Funcionamiento", "Total"), "C12": ("Funcionamiento", "Nación"), "C13": ("Funcionamiento", "Propios"),
                "C14": ("Inversión", "Total"), "C15": ("Inversión", "Nación"), "C16": ("Inversión", "Propios")}
HOJAS_CONCEPTO = {"C2": "Total", "C3": "Nación", "C4": "Propios", "C5": "Total", "C6": "Nación", "C7": "Propios"}
# sectores que se separaron después de 2018: se agrupan para poder comparar toda la serie
COMPARABLE = {"SALUD Y PROTECCION SOCIAL": "SALUD, PROTECCIÓN SOCIAL Y TRABAJO",
              "TRABAJO": "SALUD, PROTECCIÓN SOCIAL Y TRABAJO",
              "INTERIOR": "INTERIOR Y JUSTICIA", "JUSTICIA Y DEL DERECHO": "INTERIOR Y JUSTICIA"}


def norm(s):
    s = unicodedata.normalize("NFKD", str(s))
    return " ".join("".join(c for c in s if not unicodedata.combining(c)).upper().split())


def archivo(patron):
    c = sorted(FUENTES.glob(patron))
    if not c:
        raise FileNotFoundError(f"Falta el archivo {patron} en {FUENTES}")
    return c[-1]


def textos(fila):
    return [str(v).strip() for v in fila if isinstance(v, str) and str(v).strip()]


def leer_bloques(df):
    """Recorre un cuadro con bloques (Apropiaciones, Compromisos, Obligaciones, Pagos; se omiten los de porcentaje).
    Devuelve filas (medida, etiquetas de la fila, {año: valor})."""
    medida, cols, out = None, {}, []
    for i in range(len(df)):
        fila = df.iloc[i]
        t = textos(fila)
        if not t:
            continue
        primero = norm(t[0])
        if primero.startswith("PORCENTAJE") or primero.startswith("%"):
            medida, cols = None, {}
            continue
        nueva = next((m for k, m in MEDIDAS.items() if primero.startswith(k.upper())), None)
        if nueva and not any(isinstance(v, (int, float)) and not pd.isna(v) for v in fila):
            medida, cols = nueva, {}
            continue
        if medida is None:
            continue
        if any(norm(x) in ("SECTOR", "CONCEPTO") for x in t):
            cols = {}
            for j, v in enumerate(fila):
                m = re.match(r"^(\d{4})", str(v).strip())
                if m and 1990 < int(m.group(1)) < 2100:
                    cols[j] = int(m.group(1))
            continue
        if not cols or primero.startswith(("FUENTE", "*", "NOTA")):
            continue
        primera_col = min(cols)
        etiquetas = [str(v).strip() for v in fila.iloc[:primera_col] if isinstance(v, str) and str(v).strip()]
        valores = {}
        for j, a in cols.items():
            v = fila.iloc[j]
            if isinstance(v, (int, float)) and not pd.isna(v):
                valores[a] = float(v)
        if etiquetas and valores:
            out.append((medida, etiquetas, valores))
    return out


def sectores(path, precios):
    x = pd.ExcelFile(path)
    filas = []
    for hoja in x.sheet_names:
        pref = hoja.split()[0]
        if pref not in HOJAS_SECTOR:
            continue
        tipo, fuente = HOJAS_SECTOR[pref]
        for medida, etq, vals in leer_bloques(x.parse(hoja, header=None, dtype=object)):
            sector = " ".join(etq[-1].split())
            if norm(sector).startswith("TOTAL"):
                sector = "TOTAL"
            for anio, v in vals.items():
                filas.append((anio, sector, tipo, fuente, medida, precios, v))
    d = pd.DataFrame(filas, columns=["anio", "sector", "tipo_gasto", "fuente", "medida", "precios", "valor"])
    return d


def conceptos(path, precios):
    x = pd.ExcelFile(path)
    filas = []
    for hoja in x.sheet_names:
        pref = hoja.split()[0]
        if pref not in HOJAS_CONCEPTO:
            continue
        fuente = HOJAS_CONCEPTO[pref]
        grupo = subgrupo = ""
        for medida, etq, vals in leer_bloques(x.parse(hoja, header=None, dtype=object)):
            romano = len(etq) > 1 and re.fullmatch(r"[IVX]+\.", etq[0])
            concepto = " ".join(etq[-1].split())
            nc = norm(concepto)
            if romano:
                grupo, subgrupo = concepto, ""
                nivel_concepto = concepto
            else:
                if nc.startswith("DEUDA EXTERNA") or nc.startswith("DEUDA INTERNA"):
                    subgrupo = concepto.title()
                nivel_concepto = concepto
            if nc.startswith(("PRESUPUESTO SIN DEUDA", "% ")) or "%" in concepto:
                continue
            for anio, v in vals.items():
                filas.append((anio, grupo if not romano else concepto,
                              subgrupo if not romano and not nc.startswith("DEUDA ") else "",
                              nivel_concepto, fuente, medida, precios, v))
    d = pd.DataFrame(filas, columns=["anio", "grupo", "subgrupo", "concepto", "fuente", "medida", "precios", "valor"])
    return d


def tabla_sectorial_simple(path, prefijos, nombre_medida):
    """Pérdidas de apropiación y rezago: cuadros por sector y año (miles de millones)."""
    x = pd.ExcelFile(path)
    filas = []
    for hoja in x.sheet_names:
        if not any(hoja.replace(" ", "").upper().startswith(p) for p in prefijos):
            continue
        df = x.parse(hoja, header=None, dtype=object)
        cols, bloque = {}, ""
        for i in range(len(df)):
            fila = df.iloc[i]
            anios = {j: int(re.match(r"^(\d{4})", str(v).strip()).group(1)) for j, v in enumerate(fila)
                     if re.match(r"^(19|20)\d{2}(\.0)?\*?$", str(v).strip())}
            if len(anios) >= 3:
                cols = anios
                continue
            t = textos(fila)
            if not t:
                continue
            nums = [v for v in fila if isinstance(v, (int, float)) and not pd.isna(v)]
            if not nums and len(t) == 1 and not norm(t[0]).startswith(("FUENTE", "VALORES", "CUADRO")):
                bloque = t[0]
                continue
            if not cols or norm(t[0]).startswith(("FUENTE", "*", "NOTA")):
                continue
            etq = [str(v).strip() for v in fila.iloc[:min(cols)] if isinstance(v, str) and str(v).strip()]
            if not etq:
                continue
            for j, a in cols.items():
                v = fila.iloc[j]
                if isinstance(v, (int, float)) and not pd.isna(v):
                    filas.append((a, hoja.strip(), " ".join(bloque.split()), " ".join(etq[-1].split()), nombre_medida, float(v)))
    return pd.DataFrame(filas, columns=["anio", "cuadro", "bloque", "sector_o_concepto", "medida", "valor"])


def main():
    SALIDA.mkdir(parents=True, exist_ok=True)
    corr, const = archivo("2.1.A*.xlsx"), archivo("2.1.B*.xlsx")
    s = pd.concat([sectores(corr, "corrientes"), sectores(const, "constantes")])
    s["sector_comparable"] = s.sector.map(lambda x: COMPARABLE.get(norm(x), x))
    s = s.drop_duplicates(["anio", "sector", "tipo_gasto", "fuente", "medida", "precios"], keep="last")
    s = s[["anio", "sector", "sector_comparable", "tipo_gasto", "fuente", "medida", "precios", "valor"]]
    s = s.sort_values(["precios", "anio", "tipo_gasto", "fuente", "sector", "medida"])
    s["valor"] = s.valor.round(3)
    c = pd.concat([conceptos(corr, "corrientes"), conceptos(const, "constantes")])
    c = c.drop_duplicates(["anio", "grupo", "subgrupo", "concepto", "fuente", "medida", "precios"], keep="last")
    c["valor"] = c.valor.round(3)

    # chequeo: la suma de los sectores debe dar el total publicado
    t = s[(s.precios == "corrientes") & (s.tipo_gasto == "Total sin deuda") & (s.fuente == "Total") & (s.medida == "apropiacion")]
    tot = t[t.sector == "TOTAL"].set_index("anio").valor
    suma = t[t.sector != "TOTAL"].groupby("anio").valor.sum()
    dif = ((suma - tot).abs() / tot).max()
    if dif > 0.005:
        raise RuntimeError(f"Los sectores no suman el total (diferencia máxima {dif:.2%})")
    print(f"Sectores suman el total: diferencia máxima {dif:.4%}")

    s.to_csv(SALIDA / "sectores.csv", index=False, encoding="utf-8")
    c.to_csv(SALIDA / "conceptos.csv", index=False, encoding="utf-8")
    p = tabla_sectorial_simple(archivo("2.2*.xlsx"), ["C.9", "C.10", "C9", "C10", "C.1", "C.2", "C1", "C2"], "perdida_apropiacion")
    r = tabla_sectorial_simple(archivo("2.3*.xlsx"), ["C1.", "C2.", "C3.", "C4.", "C5.", "C6.", "C11.", "C12.", "C13.", "C14.", "C15.", "C16."], "rezago")
    r["medida"] = r.cuadro.map(lambda c: "reserva_presupuestal" if "RESERV" in norm(c) else
                               "cuentas_por_pagar" if ("CXP" in norm(c) or "CUENTAS" in norm(c)) else "rezago_total")
    p.to_csv(SALIDA / "perdidas_apropiacion.csv", index=False, encoding="utf-8")
    r.to_csv(SALIDA / "rezago.csv", index=False, encoding="utf-8")
    print(f"sectores.csv: {len(s):,} filas ({s.anio.min()}-{s.anio.max()}, {s.sector.nunique()} sectores) | "
          f"conceptos.csv: {len(c):,} | perdidas: {len(p):,} | rezago: {len(r):,}")


if __name__ == "__main__":
    main()
