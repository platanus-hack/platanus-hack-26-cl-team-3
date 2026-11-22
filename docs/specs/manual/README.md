# Manual del Outback para el chat

Las herramientas `buscar_manual` y `leer_manual` (`api/src/tools/`) dejan que los agentes del chat consulten el manual
del propietario y respondan citando la página. Es la parte de búsqueda de la fase G del [plan](../../plan.md).

## Qué manual es

| | |
|---|---|
| Documento | Manual del propietario Subaru Legacy / Outback 2016, edición Norteamérica (EE. UU.), en inglés |
| Tamaño | 566 páginas, PDF con texto, generado en octubre de 2015 |
| Dónde se bajó | [StartMyCar](https://www.startmycar.com/subaru/outback/info/manuals/2016), que lo sirve desde `manuals.opinautos.com` |
| Identidad | sha256 `5ef448a3…a0cc` (el script lo comprueba) |
| Motores | cubre 2.5 L y 3.6 L; muchas páginas son «& 2.5 L models» o «& 3.6 L models». Ejemplo: 11-9 es el 2.5 L y 11-10 el 3.6 L |

**Es una copia de terceros** (regla 6 del README). El PDF oficial de Subaru está repartido en unos 50 archivos en su
plataforma técnica (`techinfo.subaru.com`) y el visor de Joomag solo entrega imágenes. No sabemos si es idéntico al
manual de la guantera de un auto chileno ni se confirmó su licencia, así que **ni el PDF ni el texto extraído van al
repo** (regla 7): cada máquina arma su índice.

## Prepararlo en una máquina

```bash
sudo apt-get install poppler-utils        # pdftotext
(cd api && npm ci)
scripts/manual/preparar-manual.sh         # deja api/.manual/outback-2016.json (git lo ignora)
```

En el servidor, `docker-compose.yml` monta `${MANUAL_DIR:-./api/.manual}` en `/app/.manual` y le pasa al `api`
`MANUAL_INDEX=/app/.manual/outback-2016.json`. Sin el archivo el chat sigue funcionando: las herramientas responden que el
manual no está cargado y el modelo dice que no puede consultarlo. Hay que **recrear el contenedor** `api` si se agrega
el índice con él ya corriendo.

## Qué ven los agentes

- `buscar_manual { query, limit? }`: las páginas más relevantes (4 por defecto, 5 como máximo). La consulta va en inglés;
  si llega en español se traducen 162 palabras y 33 expresiones del auto (`api/src/manual/glossary.ts`: sapito, varilla, ampolleta, «luz de reserva»…).
- `leer_manual { page, count? }`: desde una página y hasta 2 siguientes. `page` es la numeración impresa («11-9»); las
  portadas, el índice y la contratapa no la traen y se piden como `pdf:566`.
- Each returned page is a citation-enabled `search_result` with its manual URI and printed page title.
  A separate application source follows the pages with the edition, third-party provenance and engine guidance.
- `api/src/chat/system-prompt.ts` les pide buscar en inglés, usar solo lo marcado 3.6 L o común, citar la página impresa
  y confirmar los datos críticos con el manual físico.

## Cómo se busca

Léxico, sin dependencias: BM25 por página, con el título de la sección pesando el triple, un quitaplurales sencillo y la
traducción de las palabras del auto. Carga en unos 50 ms y cada consulta tarda menos de 2 ms.

## Dónde vive el índice: memoria, SQLite o Postgres (medido con el glosario original)

`MANUAL_INDEX` decide el formato por la extensión: `.json` se carga a memoria (BM25 propio) y `.sqlite` se abre como base
con FTS5, que trae BM25 integrado y usa `node:sqlite`, que el `api` ya usa para los vehículos. Para generar el segundo,
`tsx scripts/manual/construir-indice.ts … salida.sqlite` (el script de preparación lo hace con `MANUAL_FORMATO=sqlite`).

Se midió con `scripts/manual/evaluar.ts` y 28 preguntas de conductor (`eval/manual/preguntas.json`). Cada una trae un dato que
debe aparecer en la página devuelta (por ejemplo «3.6 L models: 6.9 US qt»), así que no se juzga a ojo. Cada pregunta se
probó en español, como la escribe la persona, y en inglés, como la escribe el modelo.

| Índice | Idioma | Top-1 | Top-4 | MRR | Consulta p50 / p95 | Carga | Tamaño |
|---|---|---|---|---|---|---|---|
| Memoria (JSON) | es | 18 % | 57 % | 0,33 | | | |
| | en | 71 % | 89 % | 0,78 | | | |
| | todo | 45 % | 73 % | 0,56 | 0,10 / 0,17 ms | 53 ms | 0,99 MB |
| SQLite FTS5 | es | 14 % | 57 % | 0,31 | | | |
| | en | 68 % | 93 % | 0,76 | | | |
| | todo | 41 % | 75 % | 0,54 | 0,22 / 0,37 ms | 1 ms | 1,78 MB |
| Postgres FTS (`ts_rank`) | es | 36 % | 54 % | 0,42 | | | |
| | en | 57 % | 89 % | 0,70 | | | |
| | todo | 46 % | 71 % | 0,56 | 2,1 / 7,1 ms | | 1,96 MB |

Postgres 17 en un contenedor local, una conexión por localhost, con la configuración `english` y el título pesando más.
Otras dos formas de ordenar en Postgres salieron peor (`ts_rank` con normalización 1: 66 % en Top-4; `ts_rank_cd`: 66 % y
24 ms de mediana). La búsqueda de texto de Postgres **no es BM25**; BM25 de verdad pide una extensión (por ejemplo ParadeDB).

**Lo que dicen los números:**

- Los tres motores quedan empatados en calidad. Son 56 consultas, así que una diferencia de pocos puntos es una o dos
  preguntas y no se puede leer como ventaja.
- La velocidad no decide nada: todo está bajo 10 ms. En memoria es lo más rápido, SQLite carga al instante y Postgres suma
  el viaje a la base.
- **El punto débil es el español:** 57 % entre las 4 primeras páginas, contra 89–93 % en inglés. Mejorar la búsqueda
  pasa por el glosario y la forma de preguntar, no por el motor. En el chat el modelo escribe la consulta en inglés, así que
  lo que se vive se parece más a las filas «en».
- Postgres tendría sentido por otras razones (varios manuales en un servicio compartido, historial, búsqueda híbrida con
  embeddings), no por la búsqueda de este manual.

**Límites de la medición:** 28 preguntas escritas por una sola fuente (el asistente de IA que armó esto) a partir de datos que existen una vez en el
manual; un solo manual; las preguntas en español se escribieron antes de saber en cuáles fallaba el glosario, y no se
ajustó el glosario a ellas para no sesgar el resultado.

## Mejora del español

La medición anterior mostró que el punto débil era el español, no el motor. El glosario se reescribió recorriendo los
**títulos de sección del propio manual** (140), con palabras de uso común, plurales, expresiones de varias palabras
(«luz de reserva», «freno de mano») y las palabras vacías del español, y no a partir de las preguntas con que se mide.

| Entre las 4 primeras páginas | Antes | Después |
|---|---|---|
| Ajuste (28 preguntas), español | 57 % | **86 %** |
| Ajuste, inglés | 89 % | 89 % |
| **Validación** (19 preguntas), español | 37 % | **89 %** |
| Validación, inglés | 95 % | 95 % |

El conjunto de **validación** (`eval/manual/preguntas-validacion.json`) se escribió antes de tocar el glosario y el glosario
se ajustó solo mirando el de ajuste. La evaluación acepta `--preguntas archivo.json` y `--sin-detalle` (no lista cuáles
fallaron, para no ajustar a la validación).

Dos defectos que salieron en el camino y se corrigieron con una regla general: **no se expande lo que el manual ya dice
igual**. «control» (palabra inglesa común) se convertía en «remote», y «ABS» agregaba «anti-lock brake system» a una consulta
que ya venía en inglés y la diluía. El script de evaluación lista las palabras del glosario que también están en el manual.

**Límites:**

- La validación se midió tres veces (línea base, glosario nuevo y tras corregir esos defectos). Solo 19 preguntas: cada una
  vale 5 puntos.
- **No es independiente del todo:** los temas de las preguntas coinciden con títulos de sección del manual, que alimentaron
  el glosario, y las escribió la misma fuente que el glosario. Con palabras que no se parezcan a un título de sección el
  resultado puede ser peor.
- Ambos índices (memoria y SQLite) dieron lo mismo con el glosario nuevo.

## Límites conocidos

- **Es búsqueda por palabras:** no entiende sinónimos que no estén en el glosario. Si un tema falla, agregar la palabra
  allí es lo más barato. Con el glosario nuevo, la respuesta en español está entre las 4 primeras páginas en 86–89 % de las preguntas medidas.
- **Los diagramas no están:** solo el texto. Las tablas salen como texto corrido y pueden perder el orden de las celdas.
- **El símbolo de grado** sale del PDF como un «8» (`10.48F`). `fixDegrees` lo corrige junto a F o C; no se revisaron otros
  símbolos, y `cm²` pierde el cuadrado.
- **Las dos columnas** se leen en el orden que entrega `pdftotext`; en algunas páginas densas puede mezclar renglones.
- **51 de 563 páginas no tienen numeración impresa** (portada, índice, portadas de capítulo, contratapa) y se citan como
  «hoja PDF N».
- **No se probó contra el manual físico del auto.** Para datos críticos (presiones, capacidades, fusibles, batería) el
  chat debe pedir confirmarlos allí.

## Probarlo

```bash
cd api && npm test                         # no necesita el manual: usa uno de mentira
```

Con el índice real, una pregunta como «¿cómo reviso el aceite?» debería traer las páginas 11-11 a 11-13, y
«no sale agua del limpiaparabrisas» la 11-32 junto a las de wiper and washer (3-51 y 3-54).
