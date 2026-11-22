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
  si llega en español se traducen 58 palabras del auto (`api/src/manual/glossary.ts`: sapito, varilla, ampolleta…).
- `leer_manual { page, count? }`: desde una página y hasta 2 siguientes. `page` es la numeración impresa («11-9»); las
  portadas, el índice y la contratapa no la traen y se piden como `pdf:566`.
- Cada página sale como un `search_result` con cita habilitada: `source` `manual://subaru-outback-2016-us/11-11` y título
  «… — p. 11-11 · Maintenance and service/Engine oil». Antes de las páginas va un aviso con la edición, que es copia de
  terceros y que el auto es 3.6 L (reglas 5 y 6).
- `api/src/chat/system-prompt.ts` les pide buscar en inglés, usar solo lo marcado 3.6 L o común, citar la página impresa
  y confirmar los datos críticos con el manual físico.

## Cómo se busca

Léxico, sin dependencias: BM25 por página, con el título de la sección pesando el triple, un quitaplurales sencillo y la
traducción de las palabras del auto. Carga en unos 50 ms y cada consulta tarda menos de 2 ms.

## Límites conocidos

- **Es búsqueda por palabras:** no entiende sinónimos que no estén en el glosario. Si un tema falla, agregar la palabra
  allí es lo más barato.
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
