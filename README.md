# Indicadores de la economía colombiana

Un lugar abierto y gratuito para ver **cómo va la economía colombiana y por qué**, con las cifras oficiales y todo su detalle.

👉 **Explorador:** https://nicolasfgc.github.io/Indicadores-economia-colombiana/

La idea es poder ir de lo general a lo particular: si la inflación sube, ver qué parte de la canasta la está empujando; si la economía se frena, ver qué sector cayó; y así hasta el último nivel que publica la fuente oficial.

## Qué hay hoy

| Indicador | Detalle | Desde | Fuente |
|---|---|---|---|
| Inflación (IPC) | Total, 12 divisiones, 42 grupos y 188 subclases. Variaciones y aportes (contribuciones) | Enero 2019 | DANE |
| Actividad económica (ISE) | Total, 3 grandes ramas y 9 agrupaciones cada mes; 12 agrupaciones cada trimestre. Serie original, desestacionalizada y tendencia | Enero 2005 | DANE |

Próximamente: mercado laboral, tasas de interés, dólar y presupuesto. El listado completo está en [`datos/catalogo.csv`](datos/catalogo.csv).

## Cómo usar los datos

Todo está en la carpeta [`datos/`](datos/), en archivos CSV que se abren con Excel, Google Sheets, Tableau, Power BI, R o Python.

Cada indicador tiene dos archivos:

- **`series.csv`**: qué es cada serie (su nombre, a qué categoría pertenece, la base y la metodología).
- **`datos.csv`**: los números, en cuatro columnas: `fecha | id_serie | medida | valor`.

Se unen por la columna `id_serie`.

### Medidas del IPC

| medida | Qué significa |
|---|---|
| `indice` | Nivel del índice (diciembre 2018 = 100) |
| `var_mensual` | Variación frente al mes anterior (%) |
| `var_ano_corrido` | Variación desde diciembre del año anterior (%) |
| `var_anual` | Variación frente al mismo mes del año anterior (%) — la "inflación" |
| `contrib_mensual`, `contrib_ano_corrido`, `contrib_anual` | Aporte de cada categoría a la variación total, en puntos porcentuales. Los aportes de las divisiones suman el total |

### Medidas del ISE

Cada medida termina en el tipo de serie: `_original` (tal como se mide), `_desest` (sin efectos de temporada ni de días hábiles: la que se usa para comparar un mes con el anterior) o `_tendencia` (la tendencia de fondo, sin ruido).

| medida | Qué significa |
|---|---|
| `indice_*` | Nivel del índice (2015 = 100) |
| `var_anual_*` | Crecimiento frente al mismo mes del año anterior (%) |
| `var_mensual_desest`, `var_mensual_tendencia` | Crecimiento frente al mes anterior (%) |
| `var_ano_corrido_*` | Crecimiento acumulado en lo corrido del año (%) |

El ISE tiene dos versiones (columna `version` en `series.csv`): **9 agrupaciones**, que sale cada mes, y **12 agrupaciones**, con más detalle (separa agro de minería e industria de construcción) pero que sale cada trimestre junto con el PIB. Los identificadores empiezan por `ISE9_` o `ISE12_`.

## De dónde salen y cada cuánto se actualizan

Los datos se descargan directamente de las publicaciones oficiales (anexos del DANE) mediante los programas de la carpeta [`scripts/`](scripts/). Una tarea automática de GitHub los vuelve a descargar cada mes cuando hay publicación nueva, así que el explorador siempre muestra lo último.

Cada actualización descarga solo lo nuevo (con pausas, para no saturar los servidores de la fuente) y vuelve a revisar el último mes publicado por si hubo correcciones. El ISE se descarga completo cada vez, porque el DANE lo revisa hacia atrás en cada publicación. El historial del proyecto muestra qué cambió y cuándo.

## Notas metodológicas

- **IPC:** desde enero de 2019 el DANE usa una canasta nueva (base diciembre 2018 = 100) organizada en 12 divisiones según la clasificación internacional COICOP. Antes se usaban 9 grupos de gasto, así que las categorías no son directamente comparables con años anteriores. Los aportes anuales de 2019 casi no están disponibles porque el DANE no los publicó durante el año de transición.
- **ISE:** índices de volumen con año de referencia 2015, clasificados por secciones CIIU Rev. 4. Las cifras de los meses más recientes son preliminares y cambian cuando el DANE incorpora nueva información. El ISE no se publica con más detalle que las 12 agrupaciones; para ir más abajo (por ejemplo, ramas de la industria o del comercio) se usarán las encuestas sectoriales del DANE. La variación anual de la serie desestacionalizada (`var_anual_desest`) se calcula a partir del índice, porque el anexo no la trae.

## Fuentes

- DANE, [Índice de Precios al Consumidor](https://www.dane.gov.co/index.php/estadisticas-por-tema/precios-y-costos/indice-de-precios-al-consumidor-ipc)
- DANE, [Indicador de Seguimiento a la Economía](https://www.dane.gov.co/index.php/estadisticas-por-tema/cuentas-nacionales/indicador-de-seguimiento-a-la-economia-ise)

Los datos son de las entidades que los publican. Este proyecto solo los organiza y los hace más fáciles de consultar.
