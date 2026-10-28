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
        d = bajar_anio(anio)
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
        hechos.to_csv(SALIDA / f"gastos_{anio}.csv", index=False, encoding="utf-8", float_format="%.15g")
        print(f"  {anio}: {len(hechos):,} filas, meses {sorted(d.mes.unique().astype(int).tolist())}")
        time.sleep(2)

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
        h = h.merge(rub, on="id_rubro").merge(ent, on="codigo_entidad")
        partes.append(h.groupby(["fecha", "vigencia", "sector", "codigo_entidad", "entidad", "tipo_gasto"], as_index=False)
                      [["apropiacion_inicial", "apropiacion_vigente", "compromisos", "obligaciones", "pagos"]].sum())
    resumen = pd.concat(partes)
    resumen.round(2).to_csv(SALIDA / "resumen.csv", index=False, encoding="utf-8", float_format="%.15g")
    print(f"rubros: {len(rubros):,} | entidades: {len(ent)} | resumen: {len(resumen):,} filas")


if __name__ == "__main__":
    main()
