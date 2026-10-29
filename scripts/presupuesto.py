"""
Presupuesto General de la Nación (PGN) - ejecución de gastos.

Fuente: Ministerio de Hacienda, "Información de Gastos del Presupuesto General de la Nación"
en datos.gov.co (conjunto 5phs-yqfw). Cada mes es una foto acumulada del año: apropiación
inicial, adiciones, reducciones, apropiación vigente, compromisos, obligaciones y pagos, por
entidad y rubro presupuestal (hasta 5 niveles), fuente, situación de fondos y recurso. Desde 2019.

Para que pese poco, se guarda normalizado:
  datos/presupuesto/gastos_<año>.csv   los valores (en pesos), con códigos
  datos/presupuesto/rubros.csv         qué es cada rubro (id_rubro -> entidad, tipo de gasto y niveles)
  datos/presupuesto/entidades.csv      código de entidad -> nombre y sector
  datos/presupuesto/recursos.csv       código de recurso -> nombre
  datos/presupuesto/resumen.csv        totales por mes, sector, entidad, tipo de gasto y vigencia

Cada corrida vuelve a descargar el año en curso y el anterior (el MinHacienda los ajusta);
los años cerrados se conservan. Con --completo se descarga todo de nuevo.
Si a datos.gov.co le falta un mes, se completa con el reporte del SIIF guardado en fuentes/minhacienda/siif/.

Uso:  python scripts/presupuesto.py [--completo]
"""
import io
import json
import sys
import time
import urllib.parse
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ipc import bajar  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
SALIDA = RAIZ / "datos" / "presupuesto"
DATASET = "https://www.datos.gov.co/resource/5phs-yqfw"
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre"]
VALORES = ["apropiacioninicial", "adiciones", "reducciones", "apropiacionvigente",
           "compromisos", "obligaciones", "pagos"]
NOMBRES_VALORES = {"apropiacioninicial": "apropiacion_inicial", "apropiacionvigente": "apropiacion_vigente"}
CODIGOS = ["codigotipogasto", "codigodetallegasto", "codigonivelrubrogasto", "codigocuartonivel", "codigoquintonivel"]
NOMBRES = ["nombretipogasto", "nombredetallegasto", "nombrenivelrubrogasto", "nombrecuartonivel", "nombrequintonivel"]
VIGENCIAS = {"VigenciaActual": "Vigencia actual", "Reservas Presupuestales": "Reservas presupuestales",
             "Cuentas por Pagar": "Cuentas por pagar"}


def consulta(formato="json", **params):
    q = urllib.parse.urlencode({f"${k}": v for k, v in params.items()})
    return bajar(f"{DATASET}.{formato}?{q}", timeout=600, intentos=4)


def anios_disponibles():
    r = json.loads(consulta(select="anio, count(*) as n", group="anio", order="anio"))
    return [int(x["anio"]) for x in r if int(x["n"]) > 0]


def bajar_anio(anio):
    crudo = consulta("csv", where=f"anio='{anio}'", limit=2000000, order=":id")
    d = pd.read_csv(io.BytesIO(crudo), dtype=str).fillna("")
    for v in VALORES:
        d[v] = pd.to_numeric(d[v], errors="coerce").fillna(0)
    d["mes"] = d.nombremes.str.strip().str.lower().map(lambda m: MESES.index(m) + 1 if m in MESES else None)
    if d.mes.isna().any():
        raise RuntimeError(f"Meses no reconocidos en {anio}: {d[d.mes.isna()].nombremes.unique()}")
    d["fecha"] = d.anio + "-" + d.mes.astype(int).map("{:02d}".format) + "-01"
    return d


# ---------------------------------------------------------------- meses que faltan en datos.gov.co
# El MinHacienda a veces no publica un mes en datos abiertos, pero sí publica el mismo reporte del SIIF en el
# Portal de Transparencia Económica ("03. Reporte de SIIF Ejecución Agregada Vigencia actual, Reservas presupuestal, CxP").
# Ese portal bloquea robots, así que esos archivos se bajan a mano y se guardan como fuentes/minhacienda/siif/AAAA-MM.xlsx.
# Solo se usan para los meses que datos.gov.co no trae: si el Ministerio publica el mes después, manda datos.gov.co.
SIIF = RAIZ / "fuentes" / "minhacienda" / "siif"
HOJAS_SIIF = {"Actual": "VigenciaActual", "Reservas": "Reservas Presupuestales", "CxP": "Cuentas por Pagar"}
COLUMNAS_SIIF = {"APR. INICIAL": "apropiacioninicial", "APR. ADICIONADA": "adiciones", "APR. REDUCIDA": "reducciones",
                 "APR. VIGENTE": "apropiacionvigente", "COMPROMISO": "compromisos", "OBLIGACION": "obligaciones", "PAGOS": "pagos"}


DESDE_SIIF = []  # meses completados en esta corrida


def complementar_siif(d, anio):
    archivos = [p for p in sorted(SIIF.glob(f"{anio}-*.xlsx")) if int(p.stem[5:7]) not in set(d.mes)]
    if not archivos:
        return d
    ruta = lambda df: df[CODIGOS].apply(lambda r: "-".join(c for c in r if c and c != "CD"), axis=1)
    d = d.copy()
    d["_ruta"], d["_rec"] = ruta(d), d.recursospresupuestales.str.split(" - ").str[0].str.strip()
    orden = d.sort_values("mes")
    llave = ["codigoentidad", "_ruta", "vigencia", "fuente", "situacion", "_rec"]
    ref = orden.drop_duplicates(llave, keep="last").set_index(llave, drop=False)          # misma combinación ya vista en el año
    ref_rubro = orden.drop_duplicates(["codigoentidad", "_ruta"], keep="last").set_index(["codigoentidad", "_ruta"], drop=False)
    nombre_rec = dict(zip(d._rec, d.recursospresupuestales))
    fijos = ["anio", "sector", "codigoentidad", "nombreentidad", "detalleprogramas"] + CODIGOS + NOMBRES
    nuevas = []
    for p in archivos:
        mes = int(p.stem[5:7])
        for hoja, vig in HOJAS_SIIF.items():
            enc = pd.read_excel(p, sheet_name=hoja, header=None, nrows=3, dtype=str)
            periodo = str(enc.iloc[2, 1]).strip().lower()
            if not periodo.endswith(MESES[mes - 1]) or str(enc.iloc[0, 1]).strip() != str(anio):
                raise RuntimeError(f"{p.name} ({hoja}): dice '{enc.iloc[0, 1]} {periodo}', se esperaba {MESES[mes - 1]} de {anio}")
            x = pd.read_excel(p, sheet_name=hoja, header=3, dtype=str).dropna(subset=["UEJ", "RUBRO"])
            x.columns = [" ".join(str(c).split()) for c in x.columns]
            x = x.apply(lambda col: col.str.strip())   # todo se leyó como texto
            for col, v in COLUMNAS_SIIF.items():
                x[v] = pd.to_numeric(x[col], errors="coerce").fillna(0) if col in x.columns else 0.0
            for r in x.itertuples(index=False):
                ent, rut, fue, sit, rec = r.UEJ, r.RUBRO, r.FUENTE, r.SIT, str(r.REC)
                k = (ent, rut, vig, fue, sit, rec)
                base = ref.loc[k] if k in ref.index else ref_rubro.loc[(ent, rut)] if (ent, rut) in ref_rubro.index else None
                if base is None:
                    raise RuntimeError(f"{p.name}: rubro {ent} {rut} no aparece en datos.gov.co para {anio}")
                fila = {c: base[c] for c in fijos}
                fila.update(fuente=fue, situacion=sit, vigencia=vig, recursospresupuestales=nombre_rec.get(rec, rec + " - "),
                            nombremes=MESES[mes - 1].capitalize(), mes=mes, fecha=f"{anio}-{mes:02d}-01",
                            **{v: getattr(r, v) for v in COLUMNAS_SIIF.values()})
                nuevas.append(fila)
        print(f"  {anio}: {MESES[mes - 1]} tomado del reporte SIIF del Portal de Transparencia ({p.name})")
        DESDE_SIIF.append(f"{anio}-{mes:02d}-01")
    n = pd.DataFrame(nuevas)
    n = n.groupby([c for c in n.columns if c not in VALORES], as_index=False, dropna=False)[VALORES].sum()
    return pd.concat([d.drop(columns=["_ruta", "_rec"]), n], ignore_index=True)


CAMBIOS = ["apropiacion_vigente", "compromisos", "obligaciones", "pagos"]


def agregar_cambios(df, claves):
    """Agrega el cambio frente al mes anterior (las cifras son acumuladas en el año).
    cambio_mes_<medida> = valor de este mes - valor del mes anterior disponible del mismo año.
    En el primer mes del año (o la primera vez que aparece un rubro) el cambio es el valor completo,
    salvo la apropiación vigente, que se compara contra la apropiación inicial (= adiciones - reducciones).
    mes_anterior dice contra qué mes se comparó (importa cuando la fuente se salta meses)."""
    df = df.sort_values("fecha").copy()
    df["_anio"] = df.fecha.str[:4]
    g = df.groupby(claves + ["_anio"], sort=False)
    df["mes_anterior"] = g.fecha.shift(1).fillna("")
    for m in CAMBIOS:
        previo = g[m].shift(1)
        base = df["apropiacion_inicial"] if m == "apropiacion_vigente" else 0
        df[f"cambio_mes_{m}"] = (df[m] - previo.where(previo.notna(), base)).round(2)
    return df.drop(columns="_anio")


def main():
    completo = "--completo" in sys.argv
    SALIDA.mkdir(parents=True, exist_ok=True)
    anios = anios_disponibles()
    print(f"Años disponibles: {anios}")
    ya = {int(p.stem.split("_")[1]) for p in SALIDA.glob("gastos_*.csv")}
    rehacer = [a for a in anios if completo or a not in ya or a >= max(anios) - 1]

    rubros_prev = pd.read_csv(SALIDA / "rubros.csv", dtype=str).fillna("") if (SALIDA / "rubros.csv").exists() and not completo else None
    claves = {}  # (entidad + códigos) -> id_rubro, estable entre corridas
    if rubros_prev is not None:
        for r in rubros_prev.itertuples():
            claves[(r.codigo_entidad,) + tuple(getattr(r, f"codigo_{i}") for i in range(1, 6)) + (r.nombre_4.upper(),)] = int(r.id_rubro)
    nombres_rubro, entidades, recursos = {}, {}, {}
    if rubros_prev is not None:
        for r in rubros_prev.drop(columns=["tipo_gasto"], errors="ignore").to_dict("records"):
            r["id_rubro"] = int(r["id_rubro"])
            nombres_rubro[r["id_rubro"]] = r
    if (SALIDA / "entidades.csv").exists() and not completo:
        entidades = {r.codigo_entidad: (r.entidad, r.sector) for r in pd.read_csv(SALIDA / "entidades.csv", dtype=str).itertuples()}
    if (SALIDA / "recursos.csv").exists() and not completo:
        recursos = dict(pd.read_csv(SALIDA / "recursos.csv", dtype=str).values)

    for anio in rehacer:
        d = complementar_siif(bajar_anio(anio), anio)
        # id de rubro: entidad + los 5 códigos + nombre del 4.º nivel (en inversión es el proyecto; algunos proyectos
        # viejos de reservas comparten códigos genéricos). Del 5.º nivel se guarda el nombre más reciente.
        d["nombre4_norm"] = d.nombrecuartonivel.map(lambda x: " ".join(x.split()).upper())
        d["clave"] = list(zip(d.codigoentidad, *[d[c] for c in CODIGOS], d.nombre4_norm))
        for k in d.clave.unique():
            if k not in claves:
                claves[k] = len(claves) + 1
        d["id_rubro"] = d.clave.map(claves)
        ultimo = d.sort_values("mes").groupby("id_rubro").last()
        for idr, r in ultimo.iterrows():
            nombres_rubro[idr] = dict(id_rubro=idr, codigo_entidad=r.codigoentidad,
                                      **{f"codigo_{i}": r[CODIGOS[i - 1]] for i in range(1, 6)},
                                      **{f"nombre_{i}": " ".join(r[NOMBRES[i - 1]].split()) for i in range(1, 6)})
        for r in d.sort_values("mes").drop_duplicates("codigoentidad", keep="last").itertuples():
            entidades[r.codigoentidad] = (" ".join(r.nombreentidad.split()), r.sector.strip())
        rec = d.recursospresupuestales.str.split(" - ", n=1, expand=True)
        d["recurso"] = rec[0].str.strip()
        for c, n in zip(rec[0], rec[1].fillna("")):
            recursos[c.strip()] = n.strip()
        d["vigencia"] = d.vigencia.map(VIGENCIAS).fillna(d.vigencia)
        hechos = d[["fecha", "vigencia", "fuente", "situacion", "recurso", "id_rubro"] + VALORES].rename(columns=NOMBRES_VALORES)
        hechos = hechos.sort_values(["fecha", "id_rubro", "vigencia", "fuente", "situacion", "recurso"])
        clave_grano = ["fecha", "vigencia", "fuente", "situacion", "recurso", "id_rubro"]
        if hechos.duplicated(clave_grano).any():
            raise RuntimeError(f"{anio}: filas duplicadas en el grano esperado")
        for v in hechos.columns[6:]:
            hechos[v] = hechos[v].round(2)
        hechos = agregar_cambios(hechos, ["vigencia", "fuente", "situacion", "recurso", "id_rubro"])
        hechos = hechos.sort_values(clave_grano)
        hechos.to_csv(SALIDA / f"gastos_{anio}.csv", index=False, encoding="utf-8", float_format="%.15g")
        print(f"  {anio}: {len(hechos):,} filas, meses {sorted(d.mes.unique().astype(int).tolist())}")
        time.sleep(2)

    # registro de los meses que vienen del reporte SIIF (la página lo avisa); se conservan los de años no recalculados
    reg = SALIDA / "meses_siif.csv"
    previos = pd.read_csv(reg, dtype=str).fecha.tolist() if reg.exists() else []
    previos = [f for f in previos if int(f[:4]) not in rehacer]
    pd.DataFrame({"fecha": sorted(set(previos + DESDE_SIIF))}).to_csv(reg, index=False)

    rubros = pd.DataFrame(list(nombres_rubro.values())).sort_values("id_rubro")
    rubros["tipo_gasto"] = rubros.nombre_1
    rubros.to_csv(SALIDA / "rubros.csv", index=False, encoding="utf-8")
    pd.DataFrame([(k, n, s) for k, (n, s) in sorted(entidades.items())],
                 columns=["codigo_entidad", "entidad", "sector"]).to_csv(SALIDA / "entidades.csv", index=False, encoding="utf-8")
    pd.DataFrame(sorted(recursos.items()), columns=["recurso", "nombre_recurso"]).to_csv(SALIDA / "recursos.csv", index=False, encoding="utf-8")

    # resumen liviano para el explorador y para quien solo quiere el panorama
    ent = pd.read_csv(SALIDA / "entidades.csv", dtype=str)
    rub = rubros[["id_rubro", "codigo_entidad", "tipo_gasto"]].astype({"id_rubro": int})
    partes = []
    for p in sorted(SALIDA.glob("gastos_*.csv")):
        h = pd.read_csv(p, dtype={"id_rubro": int, "recurso": str})
        if "cambio_mes_compromisos" not in h.columns:  # archivos de años cerrados escritos antes de agregar los cambios
            h = agregar_cambios(h, ["vigencia", "fuente", "situacion", "recurso", "id_rubro"])
            h.sort_values(["fecha", "id_rubro", "vigencia", "fuente", "situacion", "recurso"]).to_csv(
                p, index=False, encoding="utf-8", float_format="%.15g")
        h = h.merge(rub, on="id_rubro").merge(ent, on="codigo_entidad")
        partes.append(h.groupby(["fecha", "vigencia", "sector", "codigo_entidad", "entidad", "tipo_gasto"], as_index=False)
                      [["apropiacion_inicial", "apropiacion_vigente", "compromisos", "obligaciones", "pagos"]].sum())
    resumen = agregar_cambios(pd.concat(partes), ["vigencia", "codigo_entidad", "tipo_gasto"])
    resumen = resumen.sort_values(["fecha", "vigencia", "sector", "codigo_entidad", "tipo_gasto"])
    resumen.round(2).to_csv(SALIDA / "resumen.csv", index=False, encoding="utf-8", float_format="%.15g")
    print(f"rubros: {len(rubros):,} | entidades: {len(ent)} | resumen: {len(resumen):,} filas")


if __name__ == "__main__":
    main()
