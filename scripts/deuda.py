"""
Deuda del Gobierno Nacional Central (GNC).

Fuente: Banco de la República, servidor de estadísticas (suameca), que publica las cifras
oficiales del Ministerio de Hacienda. (La página de Hacienda bloquea las descargas
automáticas, por eso se usa el Banrep.)

  - Saldo de la deuda bruta del GNC como % del PIB, anual desde 1995 (serie 15328).
  - PIB nominal anual del DANE (serie 15291), para pasar ese porcentaje a pesos (aproximado).
  - Financiamiento interno y externo del GNC, metodología de caja, mensual desde 2004
    (series 16726 y 16727): lo que el Gobierno se endeudó en el mes menos lo que pagó de
    deudas anteriores (deuda nueva neta). La suma de los dos es igual al déficit del mes.
  - Déficit e intereses del GNC, mensual (series 16725 y 16724), como referencia.

Salida:
  datos/deuda/series.csv
  datos/deuda/mensual.csv   fecha (mes) | id_serie | valor   (miles de millones de pesos)
  datos/deuda/anual.csv     anio | id_serie | valor

Siempre se reconstruye completo (la fuente trae toda la historia en una sola consulta).

Uso:  python scripts/deuda.py
"""
import json
import ssl
import sys
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ipc import bajar  # noqa: E402
from tasas import BANREP, CERT_BANREP  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
SALIDA = RAIZ / "datos" / "deuda"

# id en el Banrep -> (id_serie, nombre, unidad, frecuencia)
SERIES = {
    15328: ("DEUDA_PIB", "Deuda bruta del Gobierno Nacional Central", "% del PIB", "anual"),
    15291: ("PIB_NOMINAL", "PIB nominal (DANE, base 2015)", "miles de millones de pesos", "anual"),
    16726: ("FIN_INTERNO", "Financiamiento interno neto del GNC (caja)", "miles de millones de pesos", "mensual"),
    16727: ("FIN_EXTERNO", "Financiamiento externo neto del GNC (caja)", "miles de millones de pesos", "mensual"),
    16725: ("BALANCE", "Déficit (−) o superávit (+) del GNC (caja)", "miles de millones de pesos", "mensual"),
    16724: ("INTERESES", "Intereses pagados por el GNC (caja)", "miles de millones de pesos", "mensual"),
}


def main():
    ctx = ssl.create_default_context()
    ctx.load_verify_locations(cafile=str(CERT_BANREP))
    mensual, anual, meta = [], [], []
    for id_br, (sid, nombre, unidad, frec) in SERIES.items():
        info = json.loads(bajar(f"{BANREP}/consultaInformacionSerie?idSerie={id_br}", timeout=120, contexto=ctx))[0]
        puntos = info["data"] if isinstance(info["data"], list) else json.loads(info["data"])
        minimo = 25 if frec == "anual" else 200
        if len(puntos) < minimo:
            raise RuntimeError(f"Banrep {id_br} ({sid}): muy pocos datos ({len(puntos)})")
        s = pd.DataFrame(puntos, columns=["ms", "valor"]).dropna()
        s["fecha"] = pd.to_datetime(s.ms, unit="ms", utc=True).dt.tz_convert("America/Bogota").dt.tz_localize(None)
        if frec == "anual":
            s["anio"] = s.fecha.dt.year
            anual.append(s.drop_duplicates("anio", keep="last").assign(id_serie=sid)[["anio", "id_serie", "valor"]])
        else:
            s["fecha"] = s.fecha.dt.to_period("M").dt.to_timestamp().dt.strftime("%Y-%m-%d")
            mensual.append(s.drop_duplicates("fecha", keep="last").assign(id_serie=sid)[["fecha", "id_serie", "valor"]])
        meta.append(dict(id_serie=sid, nombre=nombre, unidad=unidad, frecuencia=frec,
                         fuente=f"{info.get('fuente') or 'Ministerio de Hacienda'}, vía Banco de la República (serie {id_br})",
                         ultimo_cargue=info.get("fechaUltimoCargue", "")))
        time.sleep(1)

    SALIDA.mkdir(parents=True, exist_ok=True)
    m = pd.concat(mensual).sort_values(["id_serie", "fecha"])
    a = pd.concat(anual).sort_values(["id_serie", "anio"])
    # chequeo: el financiamiento total debe cuadrar con el déficit (si no, algo cambió en la fuente)
    p = m.pivot(index="fecha", columns="id_serie", values="valor").dropna()
    dif = (p.FIN_INTERNO + p.FIN_EXTERNO + p.BALANCE).abs().max()
    if dif > 50:
        print(f"  ojo: financiamiento y déficit no cuadran (diferencia máxima {dif:,.0f} mil millones)")
    m.round(2).to_csv(SALIDA / "mensual.csv", index=False)
    a.round(2).to_csv(SALIDA / "anual.csv", index=False)
    pd.DataFrame(meta).to_csv(SALIDA / "series.csv", index=False)
    print(f"Deuda: mensual hasta {m.fecha.max()}, anual hasta {a[a.id_serie == 'DEUDA_PIB'].anio.max()}")


if __name__ == "__main__":
    main()
