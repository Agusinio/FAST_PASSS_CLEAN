# ESPECIFICACIÓ: `.fastpass.json` v2.0 — Manifest de sessió (FONT ÚNICA DE VERITAT)
> Última actualización: 2026-10-16 | Estado: **IMPLEMENTADO ✅** (F1/F2/F6) · **EN MIGRACIÓ** (F3/F4/F5, vegeu §11)

---

## 1. Contexto y objetivo

Hasta la v1.0 el proyecto repartía las datos de cada bloque (programa) en ficheros
sueltos: la escaleta, el `MARCADORS_*.txt/.json`, el `analisis_estructura/DD_MM_PROG_BLOC.json`,
los logs de muntatge… Cada pantalla releía el fichero que le interesaba y las
fuentes podían quedar desincronizadas.

La v2.0 **centraliza todas las datos de análisis del proyecto en un único
manifiesto JSON**, con secciones independientes:

| Sección | Contenido | Fase |
|---|---|---|
| `program` | identidad del proyecto y del bloque | F0 |
| `ref` / `blockBounds` / `cleanFeed` | referencia de TC y límites temporales del bloque | F0 |
| `hierarchy` | mapa `lineID → data` (Fase 4) | F0 |
| `escaletaItems` | escaleta del bloque (**MASTER**, la guarda «Muntar») | F1 |
| `clips` | registro de clips insertados (log de muntatge) | F1 |
| `analysis` | **MIRALL** del JSON de análisis (4 fases) | F1 |
| `markers` | marcadores de la secuencia con su TC | **F2** |
| `media.clipsV1` | clips de la pista V1 (verdad física de la secuencia) | **F3** |
| `chyrons` | rótulos importados al bin + rótulos colocados | **F4** |
| `graphics` | grafismos colocados (TITOLET, Tema-Títol, fondos…) | **F5** |
| `structure` | **VISTA** por ítem: TC, clip(s), rótulos, grafismos, marks | **F6** |
| `phases` | banderas de fases completadas | F0 |

**Regla de oro:** los ficheros derivados (`MARCADORS_*.txt/.json`,
`analisis_estructura/*.json`) **se siguen escribiendo como MIRALLS legibles para
humanos**, pero ya **NO son la fuente de las datos**. Quien necesite análisis lo
lee del manifiesto.

---

## 2. Ubicación y nombre

- Misma carpeta que el `.prproj` del bloque → `SessionManifest.getPath(ctx)`.
- `progData.titol` + `_` + `ctx.bloque` + `.fastpass.json`
  (ej.: `TNV_V1.fastpass.json`).
- **Pretty-print** (`JSON.stringify(m, null, 2)` + `\n`): el fichero debe poder
  leerse y diffarse.

### Escritura / lectura

| Vía | Cuándo | Notas |
|---|---|---|
| `window.cep.fs.writeFile` / `readFile` | **preferida** | UTF-8 crudo, sin límites de tamaño ni escapados; tolera BOM |
| `IO.writeTxt` + `IO.appendTxt` | respaldo ExtendScript | trozos de `CHUNK` (24 000) caracteres ASCII vía `Utils.escape` (\uXXXX): ningún trozo parte un carácter |
| `IO.readTxt` + `Utils._fromMojibake` | respaldo de lectura | `IO.readTxt` lee ANSI → títulos con acentos volvían corruptos y al re-guardarse quedaban fijados |

- **Cache en memoria** (`_cache[path]`): leer el JSON del NAS tarda ~20-25 s y
  bloquea ExtendScript (causa de cuelgues). Se reutiliza hasta `forceReload`.
- **Cola de escritura SÉRIE** (`_writeChain`): secciones distintas se guardan
  desde flujos distintos (marcadores, rótulos, análisis) y dos escrituras no
  pueden pisarse. **Una escritura = una foto entera del manifiesto** (siempre la
  más nueva en memoria).

---

## 3. Esquema v2.0

```json
{
  "_version": "2.0",
  "_generated": "2026-10-15T09:12:30.114Z",
  "_lastUpdated": "2026-10-15T11:32:09.881Z",

  "program": {
    "progId": "TNV", "blockId": "V1",
    "projectFile": "TNV_V1.prproj", "projectFolder": "\\\\NAS\\...\\TNV_V1",
    "escaletaFile": "TN_COMARQUES_V1_..._20260608_141037.json"
  },

  "cleanFeed": { "assetId": "PRO51050904", "mediaPath": "\\\\DSMEDIA01\\...MP4", "mediaStart": "14:29:54:04" },
  "blockBounds": { "inTc": "14:31:14:00", "outTc": "14:35:18:00" },

  "ref": {
    "worldSecMediaStart": 0, "mp4ExpandedInPoint": 0,
    "tlBlockInPointSec": 59.84, "tlClipStartSec": 0,
    "offsetSec": null, "blockInSec": null,
    "worldBlockStartSec": 72000, "worldBlockEndSec": 72270,
    "InTier": null, "fps": 25
  },

  "hierarchy": { "lineID_3f9a": { "titol": "…", "agrupacio": "v1" } },
  "footprintVerification": null,

  "escaletaItems": [ { "num": "00", "titol": "INICI", "durada": "0:10", "agrupacio": null,
                       "horaEntradaOnAir": "20:00:00:00", "horaSortidaOnAir": "20:00:10:00" } ],
  "clips": [ { "name": "00_INICI", "track": 1, "startSec": 72000, "endSec": 72018 } ],

  "media": {
    "updatedAt": "…", "source": "Clips.getTrackClips", "track": 1, "fps": 25,
    "clipCount": 4, "firstStartSec": 72000, "lastEndSec": 72278,
    "clipsV1": [ { "index": 0, "name": "00_INICI", "track": 1,
                   "startSec": 72000, "endSec": 72018, "durSec": 18, "inPointSec": 0 } ]
  },

  "markers": {
    "updatedAt": "…", "source": "Markers.get (snapshot)", "count": 2,
    "list": [ { "index": 0, "timeSec": 72000, "tc": "20:00:00:00", "color": 4,
                "comment": "00 INICI", "name": "", "num": "00", "numDigits": "00" } ]
  },

  "chyrons": {
    "updatedAt": "…", "bin": "CHY", "countImported": 2, "countPlaced": 2,
    "imported": [ { "name": "00_INICI_01", "bin": "CHY", "nasPath": "\\\\NAS\\…", "ok": true, "at": "…" } ],
    "placed":   [ { "num": "00", "name": "00_INICI_01", "track": 3,
                    "startSec": 72010, "endSec": 72018, "durSec": 8, "tipus": "CHY", "at": "…" } ]
  },

  "graphics": {
    "updatedAt": "…", "count": 2,
    "list": [ { "num": "02DP", "name": "TITOLET_02DP", "tipus": "TITOLET", "track": 4,
                "startSec": 1200, "endSec": 1220, "durSec": 20, "at": "…" } ]
  },

  "analysis": {
    "updatedAt": "…", "file": "\\…\\analisis_estructura\\15_10_TNV_V1.json",
    "meta":   { "lastUpdatedAt": "…", "phases": { "escaleta": true, "crudo": true } },
    "escaleta": { "itemsBloc": [ /* ← escaleta MARE (fase 1) */ ], "contextItems": {}, "trimBounds": {} },
    "crudo":    { "inout": { }, "marks": { "list": [] } },
    "cocinado": { "inout": { }, "marks": { "list": [] } },
    "usuario":  null
  },

  "structure": {
    "updatedAt": "…", "reason": "chyrons", "count": 4, "fps": 25,
    "source": { "escaletaItems": 4, "itemsFrom": "master", "markers": 2,
                "clipsV1": 4, "chyronsPlaced": 2, "graphics": 2 },
    "items": [ /* vegeu §6 */ ]
  },

  "phases": {
    "boundsCalculated": false, "mp4Imported": false, "tcRefEstablished": false,
    "trossejaDone": false, "markersPlaced": true, "chyronsPlaced": false
  }
}
```

### Secciones y campos

| Sección | Clave | Descripción |
|---|---|---|
| `program` | `progId`, `blockId`, `projectFile`, `projectFolder`, `escaletaFile` | identidad del proyecto y del bloque |
| `ref` | `worldSecMediaStart`, `mp4ExpandedInPoint`, `tlBlockInPointSec`, `tlClipStartSec`, `offsetSec`, `blockInSec`, `worldBlockStartSec`, `worldBlockEndSec`, `InTier`, `fps` | referencia de TC del bloque dentro del «mundo» del MP4 |
| `media` | `updatedAt`, `source`, `track`, `fps`, `clipCount`, `firstStartSec`, `lastEndSec`, **`clipsV1[]`** | verdad física de la pista V1 |
| `markers` | `updatedAt`, `source`, `count`, **`list[]`** | snapshot CRUDO de marcadores: `index`, `timeSec`, `tc`, `color`, `comment`, `name`, `num`, `numDigits` |
| `chyrons` | `bin`, `countImported`, `countPlaced`, `imported[]`, **`placed[]`** | `imported`: `{name, bin, nasPath, ok, at}` · `placed`: `{num, name, track, startSec, endSec, durSec, tipus, at}` |
| `graphics` | `count`, **`list[]`** | igual que `chyrons.placed` + `tipus` (`TITOLET`, `TEMATITOL`, `FONS`…) |
| `analysis` | `file`, `meta`, `escaleta`, `crudo`, `cocinado`, `usuario` | MIRALL del JSON de análisis (4 fases) |
| `structure` | `updatedAt`, `reason`, `count`, `fps`, `source`, **`items[]`** | VISTA derivada por ítem (§6) |
| `phases` | `boundsCalculated`, `mp4Imported`, `tcRefEstablished`, `trossejaDone`, `markersPlaced`, `chyronsPlaced`… | banderas de fases |

---

## 4. API de `FASTPASS_UI.SessionManifest` (v2.0)

| Método | Devuelve | Notas |
|---|---|---|
| `getPath(ctx)` | `string` | ruta del manifiesto (carpeta del `.prproj`) |
| `load(ctx, forceReload?)` | `Promise<Object>` | lee del disco (o cache); migra a 2.0; si no existe, `_empty(ctx)` |
| `save(ctx, patch)` | `Promise<Object>` | **deep merge** del patch + reconstruye `structure` si el patch trae `escaletaItems` + escribe (cola serie, sin esperar) + sincroniza `State.ref` / `State.hierarchy` |
| `update(ctx, fn)` | `Promise<Object>` | carga (cache) y deja mutar **en memoria**; **NO escribe** |
| `flush(ctx)` | `Promise<'OK'\|'ERR:…'\|'NORES'>` | escribe AHORA el manifiesto en memoria (espera la cola anterior) |
| `saveSection(ctx, section, value, opts?)` | `Promise<Object>` | fusiona UNA sección (`opts`: `{rebuild:true, reason, write:true}`); **un array SUSTITUYE la sección, nunca se fusiona** |
| `getSection(ctx, name)` | `Promise<*>` | `await load(ctx)` + `m[name]` |
| `getItems(manifest)` | `Array` | ítems del bloque con forma de escaleta (§4.1) |
| `getEscaletaItems(manifest)` | `Array` | **solo la MARE**: `escaletaItems` → `getItems()` |
| `getItemsSource(manifest)` | `'master'\|'mirall-analisi'\|'structure'\|'cap'` | aigües amunt real del escaleta |
| `prettify(manifest)` | `string` | texto tal como queda en disco (indent 2 + `\n`) |
| `_deepMerge(dst, patch)` | `Object` | fusión profunda (los arrays se sustituyen) |
| `_rebuild(manifest, reason)` | – | hook: llama a `AnalysisCenter.rebuild()` (SÍNCRONO) |

`SECTION_KEYS`: `program, ref, cleanFeed, blockBounds, hierarchy, media,
escaletaItems, clips, analysis, markers, structure, chyrons, graphics, phases`.

### 4.1 Precedencia de `getItems()` (¡importante!)

```
structure.items[].escaleta     ← VISTA v2.0 (misma escaleta + TC/clips/rótulos/grafismos)
      ↓ si vacía
escaletaItems                  ← MASTER (lo guarda «Muntar»)
      ↓ si vacía
analysis.escaleta.itemsBloc    ← MIRALL de la FASE 1 (pre-Muntar)
      ↓ si vacía
[]                             ← vacío
```

- `getItems()` **prefiere la VISTA**. Por eso `AnalysisCenter.composeStructure`
  usa `getEscaletaItems()`: si la vista se derivase de sí misma, se quedaría
  clavada con las horas/clips viejos al repulsar «Muntar» o al guardar el
  espejo de análisis.
- **Los consumidores reciben las MISMAS identidades de objeto**, nunca clones:
  `structure.items[].escaleta` es el objeto del array maestro. Código que use
  `indexOf` / comparación por referencia (p. ej.
  `flow_markers._deduceOnAirEntrada`) depende de ello.

---

## 5. API de escritura por secciones (`FASTPASS_UI.Core.AnalysisCenter`)

Toda la escritura de secciones pasa por aquí (nunca `cep.fs` ni `IO.writeTxt`
directos): un pedazo = **una** reconstrucción de `structure` + **una** escritura
completa del manifiesto.

| Método | Sección que toca | Deduplicación |
|---|---|---|
| `record(name, track, startSec, endSec?, extra?)` | – | construye `{name, track, startSec, endSec, durSec, …extra}` |
| `writeMany(ctx, patch, opts?)` | cualquiera | `opts`: `{rebuild:false, write:false, reason}` |
| `writeMedia(ctx, clips, opts?)` | `media.clipsV1` | reemplaza (es una foto) |
| `writeMarkers(ctx, list, opts?)` | `markers.list` | reemplaza (snapshot) |
| `writeChyronsPlaced(ctx, records, opts?)` | `chyrons.placed` | `key` \| si falta: `num\|name\|track` (recolocar **actualiza**) |
| `writeChyronsImported(ctx, records, opts?)` | `chyrons.imported` | `name` |
| `writeGraphics(ctx, records, opts?)` | `graphics.list` | `key` \| si falta: `num\|name\|track` |
| `writeAnalysis(ctx, data, opts?)` | `analysis.*` | por clave (mirall de fases) |
| `markPhase(ctx, key, value?, opts?)` | `phases.<key>` | – |
| `rebuild(manifest, opts?)` | `structure` | hook de `SessionManifest._rebuild` |

| Método de lectura | Descripción |
|---|---|
| `classifyItem(item)` | clase/color/duraciones de una línea (`ITEM_CLASSIFICATION.md`, `MARKER_COLORS.md`) |
| `getStructure(manifest)` | sección `structure` |
| `findItem(manifest, num)` | ítem de la vista por `num` (tolera `02` / `02DP` / `2`) |
| `numParts(raw)` | `"02DP"` → `{num, digits, digitsKey, suffix}` (`digitsKey` = sin ceros, clave de COMPARACIÓN) |
| `secToTc(sec, fps)` / `tcToSec(tc)` / `parseDur(str)` / `fpsOf(manifest)` | utilidades de tiempo |
| `mirrorMarkersTxt` / `mirrorAllTxt` / `mirrorStructureTxt` | textos legibles (miralls) |

### 5.1 Identidad de un registro (`key`)

`_key(rec)` = `rec.key` si el registro trae una `key` **explícita**; si no,
`num|name|track`. El default es el de los rótulos: un rótulo se coloca una vez por
ítem, así que recolocarlo **actualiza** el registro (nunca lo duplica) — hay test
(`PASS chyrons.placed deduplicat per num|name|track`).

Los **grafismos** sí pueden repetir el mismo fichero en la misma pista a horas
distintas (`flow_graphics._recordGraphics`), y la vista asigna cada registro al ítem
por `startSec` (§6): sin identidad con tiempo, la segunda colocación **pisaría** la
primera. Por eso `_recordGraphics` añade `key = tipus|track|startSec.toFixed(2)`.

### 5.2 Contexto (`ctx`) de lectura/escritura — la ruta del manifiesto

`SessionManifest.getPath(ctx)` resuelve la carpeta con `Utils.workFolder(ctx)`, que
encadena `config.rutas.destinoBase` + `progData.directorio` + **`ctx.dateDir`** +
`ctx.bloque`. Por tanto un `ctx` **incompleto no falla al escribir**: apunta a OTRO
fichero (manifiesto fantasma) y el registro se pierde en silencio.

⚠️ Caso medido (2026-10-15): `flow_chyrons._wfCtx()` devuelve `FASTPASS_UI.State`, y
`State.dateDir` es `null` casi todo el flujo (solo `main.js` al cargar proyecto y el
RESET lo llenan; `4_Context.checkContext` lo vuelve a poner a `null` al cambiar de
programa/bloque). Con `State` la ruta caía en `<base><prog>/` (sin día) mientras el
resto de escritores usan `<base><prog>/<dateDir>/<bloc>`: **`chyrons.placed` se
escribía en un manifiesto que nadie lee** (defecto detectado por la sonda del
harness, §11).

Regla: usar SIEMPRE el mismo resolutor que el resto del panel:
`flow_chyrons._manifestCtx()` ⇒ `MainButton._setupContext()` (`config`, `progData`,
`programa`, `bloque`, `dateDir`); si el panel aún no está listo, `_wfCtx()` con
`dateDir` completado desde `Core.Context._targetDateDir()`. Lo usan todas las
escrituras de `flow_chyrons`: `_recordPlacedChyrons`, `_placeChyronsByType` (lectura
de la vista + paso del ctx a la cadena de grafismo), `_titoletAnchor` y
`runGuidedAssembly` (`phases.clipAnalysisDone`). Hay test de la invariante
(`_manifestCtx()` ⇒ misma ruta que el ctx de sesión).

---

## 6. Vista `structure` — un ítem por línea de escaleta

`structure` es **DERIVADA**: no se edita, se recompone (`AnalysisCenter.rebuild`)
después de cada escritura de sección y siempre a partir de la escaleta **MARE**.
Es la sección que consumen las pantallas (la línea de tiempo de la UI, colores de
marcadores, placement de rótulos…).

```json
{
  "index": 1, "lineId": "…", "sequencia": 12,
  "num": "01", "numDigits": "01", "titol": "CRÒNICA…",
  "agrupacio": "v1", "flotant": false,
  "classe": "ESTRUCTURAL", "isIpd": false, "ungrouped": false,
  "teVideo": true, "colorIdx": 4,
  "durada": "3:00", "duradaOnAir": null,

  "window":  { "inSec": 72060, "outSec": 72240, "source": "prevista",
               "inTc": "00:20:01:00", "outTc": "00:20:04:00" },
  "times":   { "entradaPrevistaSec": 72060, "sortidaPrevistaSec": 72240,
               "entradaOnAirSec": null, "sortidaOnAirSec": null,
               "duradaSec": 180, "duradaOnAirSec": null, "duradaEfectivaSec": 180 },

  "itemTimeSec": 72060, "tc": "00:20:01:00",
  "marker":        { "timeSec": 72000, "tc": "00:20:00:00", "color": 4,
                     "comment": "01 CRÒNICA", "source": "timeline" },
  "markerPrevist": { "timeSec": 72060, "tc": "00:20:01:00", "colorIdx": 4,
                     "comment": "01 CRÒNICA" },

  "clips":    [ /* _clipsInWindow(media.clipsV1, in, out) */ ],
  "chyrons":  [ /* chyrons.placed dentro de la ventana (o ligados por NUM) */ ],
  "graphics": [ /* graphics.list dentro de la ventana (o ligados por NUM) */ ],
  "marks":    { "crudo": {…}, "cocinado": {…}, "usuario": {…} },
  "escaleta": { /* la MISMA referencia del array maestro */ }
}
```

### Reglas de la vista

| Campo | Regla |
|---|---|
| `window` | **OnAir > Prevista > deducida** (encadenada con el final del ítem anterior); `source` = `onAir` \| `prevista` \| `deduida` \| `cap` |
| `window.outSec` | si no consta, `inSec + duradaEfectivaSec` |
| `times.duradaEfectivaSec` | `durada` si > 0, si no `duradaOnAir` |
| `tc` | hora del **marcador** de timeline; si no hay, `itemTimeSec` = OnAir → Prevista → `null` (TC vacío) |
| `marker` | marcador de timeline ligado por `num` (entero **o** `digitsKey`): `'00'`/`'0'`/`'#0'` ligan |
| `markerPrevist` | solo si **no** hay marcador y hay hora: marcador *previsto* (para comparar dónde debería caer) |
| `clips` | vacío si no hay ventana válida (`out > in`) |
| `chyrons` / `graphics` | registros dentro de la ventana; si la ventana no es útil (ancho 0) se ligan **por NUM** |
| `marks` | `_marksOf(manifest, num)` → normaliza `crudo` / `cocinado` / `usuario` y acepta forma `{list:[]}` |
| `escaleta` | **misma identidad de objeto** que la línea madre |
| `structure.source` | auditoría: `escaletaItems`, `itemsFrom` (`getItemsSource`), `markers`, `clipsV1`, `chyronsPlaced`, `graphics` |

---

## 7. Miralls (ficheros legibles para humanos)

| Mirall | Quién lo escribe | Origen |
|---|---|---|
| `analisis_estructura/DD_MM_PROG_BLOC.json` | `16_Analysis_Logic._mirror` | sección `analysis` del manifiesto (copia pretty-print) |
| `MARCADORS_*.txt` / `*.json` | `flow_markers` | `markers.list` + la vista por ítem (`mirrorMarkersTxt` / `mirrorAllTxt`) |

- **Nunca se leen** como fuente: `16_Analysis_Logic._load(ctx)` lee el manifiesto.
  Solo el modo heredado `_load(path)` (string) lee el `.json` del disco.
- Ruta del mirall de análisis: `<carpeta del BLOC>/analisis_estructura/[DD_MM]_[PROG]_[BLOC].json`
  (ABSOLUTA: antes era relativa y el fichero podía acabar en cualquier directorio
  de trabajo de Premiere).
- `IO.writeTxt` recibe el payload **dentro** de un literal de cadena JSX: los
  saltos de línea del pretty-print hay que escaparlos o el fichero **no se escribe
  nunca** (incidencia 2026-09-29 → 2026-10-13: todas las carpetas
  `analisis_estructura` del NAS creadas y vacías). Misma receta en
  `flow_markers.js` y `Utils.escape`.

---

## 8. Migración v1.0 → v2.0 (`_migrate`)

`load()` pasa **siempre** el JSON parseado por `_migrate(obj, ctx)`:

1. Recorre las claves de `_empty(ctx)`. Si falta una sección (o una subclave de
   una sección objeto) la crea con su esqueleto vacío y la apunta en el log.
2. Nunca descarta contenido existente: **no se pierde información del fichero**.
3. Actualiza `_version` a `2.0` y registra
   `🧬 [SessionManifest] esquema migrat 1.0 → 2.0 (seccions noves: …)`.
4. La migración es **en memoria**: el fichero se reescribe con el esquema nuevo
   en la primera escritura (cualquier `save` / `saveSection` / `flush`).

Correspondencia de claves v1.0 → v2.0:

| v1.0 | v2.0 |
|---|---|
| `escaleta` (array) | `escaletaItems` |
| `escaleta` dentro del JSON de análisis | `analysis.escaleta.itemsBloc` (MIRALL) |
| — (no existía) | `structure` (§6), `markers`, `media.clipsV1`, `chyrons`, `graphics` |

---

## 9. Consumidores (inventario)

| Consumidor | Lee | Escribe |
|---|---|---|
| `js/core/assembly_context.js` | `_itemsOf(manifest)` → `SessionManifest.getItems()`; `load(ctx)`; `getPath(ctx)`; `getItemsSource(ctx)` | – |
| `js/workflows/flow_markers.js` | `_itemsOf()` / `getItems()` (`_deduceOnAirEntrada`, orden de escaleta); `SessionManifest.load(ctx)`; `_cache` | `AnalysisCenter.writeMarkers(ctx, list)` + `phases.markersPlaced` |
| `js/logic/16_Analysis_Logic.js` | `_load(ctx)` → `manifest.analysis` (preferente); `_load(path)` solo heredado | `AnalysisCenter.writeAnalysis(ctx, patch)` + `_mirror(ctx)` |
| `js/workflows/flow_mainButton.js` | `SessionManifest.load/save` (escaleta, `ref`, `clips`, `phases`) | `save(ctx, {escaletaItems})`, `phases`, log de clips |
| `js/workflows/flow_chyrons.js` | `SessionManifest.load(wctx)` con **`_manifestCtx()`** (contexto de sesión completo: `_setupContext()` ⇒ `dateDir`); `_titoletAnchor` (anclaje del TITOLET) | `save(ctx, {phases:{clipAnalysisDone:true}})` (también `runGuidedAssembly`, ya con `_manifestCtx()`) + **`chyrons.placed`** (`_recordPlacedChyrons` ← `_placeChyronsByType`, todas las fases) |
| `js/workflows/flow_graphics.js` | – | **`graphics.list`** (`_recordGraphics`: fondos de `runPlaceBackground` / `runPlaceGraph169`, con `key` de tiempo) |
| `js/workflows/flow_mapa.js` | `SessionManifest._cache` (lectura ligera, sin IO) | – |
| `js/workflows/flow_mp4.js` | `SessionManifest.load(ctx)` | – |
| `js/editors/srt_editor.js` (o `js/…`) | `SessionManifest.load(ctx)` | – |

> `flow_mapa.js` lee `_cache` directamente: si el manifiesto aún no está en
> memoria, no lo carga (evita bloquear ExtendScript con una lectura de NAS).

---

## 10. Estado de la migración

| Fase | Contenido | Estado |
|---|---|---|
| **F0** | esquema base, `_empty`, `_migrate`, IO nativo CEP + respaldo, cola serie | ✅ IMPLEMENTADO |
| **F1** | `escaletaItems` (MASTER) + `analysis` (mirall 4 fases) | ✅ IMPLEMENTADO (`flow_mainButton`, `16_Analysis_Logic`) |
| **F2** | `markers.list` + `phases.markersPlaced` | ✅ IMPLEMENTADO (`flow_markers`) |
| **F3** | `media.clipsV1` (`writeMedia`) | ⏳ API lista, **sin productor conectado** (V1 clips) |
| **F4** | `chyrons.imported` / `chyrons.placed` | 🟡 PARCIAL — `chyrons.placed` **CONECTADO Y VALIDADO** (`flow_chyrons._recordPlacedChyrons`, todas las fases de `_placeChyronsByType`; ctx de manifest corregido → `_manifestCtx()`, §5.2); `chyrons.imported` sin productor (import de CHY). ⚠️ **GAP detectado 2026-10-16** (TNC V3): las colocaciones de **TRADUCCIÓN** (`placeChyronTraduccio` → `_placeTradSlot`) **NO pasan** por `_recordPlacedChyrons` → en V8 hay 3 clips y **0 registros** en el manifiesto |
| **F5** | `graphics.list` (`writeGraphics`) | 🟡 PARCIAL — fondos de `flow_graphics` **CONECTADOS Y VALIDADOS** (`_recordGraphics` con `key` de tiempo); falta `17_TitoletDetect` / `_placeTitoletChain` |
| **F6** | vista `structure` + migración de consumidores | ✅ IMPLEMENTADO (F6a `getEscaletaItems`, F6b `_itemsOf`, F6c `toManifestItems`/consumidores) |

Reglas a respetar al conectar F3/F4/F5:

1. **Nunca** escribir el `.fastpass.json` a mano: usar los métodos de §5.
2. Usar `AnalysisCenter.record(...)` para construir los registros.
3. Pasar **siempre** un `ctx` COMPLETO (el contexto del workflow: `config` +
   `progData` + `bloque` + **`dateDir`**). `SessionManifest.getPath` depende de
   `ctx.progData.wott` + `ctx.bloque`, pero la CARPETA la fija `ctx.dateDir` (§5.2):
   sin `dateDir` el manifiesto se escribe en otro sitio y nadie lo lee.
4. `writeMany` ya recompone `structure` y escribe: **no** llamar a `flush()`.
5. Salvo que el flujo lo pida, dejar `opts` por defecto (`rebuild:true`,
   `write:true`).

---

## 11. Validación

Harness headless **versionado en el repo** (`bin\smoke\fp_smoke_build.ps1` +
`fp_smoke_boot.js` + `fp_smoke_ac.js` (stubs/tests) + `fp_smoke_runner.js` +
`fp_probe_f45.js` + `fp_probe_ipd_chyron.js`): empaqueta el bootstrap, los stubs/tests y los ficheros
**reales** del repo (`escaleta_timecode.js`, `analysis_center.js`,
`session_manifest.js`, `assembly_context.js`, `16_Analysis_Logic.js`,
`flow_markers.js`, `flow_mainButton.js` y, desde el 2026-10-15, también
`flow_chyrons.js` + `flow_graphics.js`) más las sondas (`fp_probe_f45.js` y,
desde el 2026-10-16, `fp_probe_ipd_chyron.js`, §11.2), que se
enganchan al final de los tests, en un HTML (`%TEMP%\fp_smoke_ac.html`) y lo
ejecuta con Edge headless (`--dump-dom --virtual-time-budget=30000`); el
resultado queda en `%TEMP%\fp_smoke_ac_result.txt` (`PASS nn / FAIL 0`). El
script deduce `$repo` de su propia ubicación y resuelve los ficheros del harness
primero **a su lado** (repo) y, si no están, en `%TEMP%` (copia de trabajo
histórica); imprime la lista de ficheros con `<repo>`/`<tmp>` para trazabilidad.
Última ejecución (2026-10-16, script del repo, sondas solo en el repo):
**PASS 138 / FAIL 0**, con el guard en `WARN/ERROR dels mòduls (0)`. El harness
tiene un guard de regresión que falla si algún módulo emite WARN/ERROR durante el
flujo. Los 11 asserts de la fase `14-chyrons-families` (§11.1) usan las cadenas
de nombre REALES del caso TNC V3 y los 17 de la fase `15-ipd-chyron` (§11.2) las
del bloque de TN MEDIODIA V2 (15/10).

La sonda F4/F5 (13 asserts) comprueba: `_manifestCtx()` ⇒ **misma ruta** que el ctx
de sesión aunque `State.dateDir` sea `null`, su camino de reserva sin panel
(`_ctxOk` + `dateDir`), `chyrons.placed` (1 registro, recolocar ACTUALIZA `endSec`,
asignación al ítem 02 por `_insideWindow`) y `graphics.list` (2 colocaciones del
mismo fichero/pista con `key` de tiempo, repartidas a su ítem por `startSec`),
siempre **escritos en el fichero del día** (`<wott>_<bloc>.fastpass.json`).

### 11.1 Famílies de rètols: bug TNC V3 (traducció duplicada a V7) — resolt 2026-10-16

**Símptoma** (TNC V3, bloc 14 «FAUNA ALIADA PER L'AGRICULTURA», run 2026-10-15
09:16): una TRADUCCIÓ apareixia **DUPLICADA** — a **V7** (59.72→64.60, amb la
durada del nom) i a **V8** (59.32→61.08 / 61.08→62.84 / 62.84→64.60) — i el
nom-càrrec legítim («Hobun Ikeya_director», col·locat a V7 a les 09:16:13) havia
**desaparegut** de la timeline.

**Causa arrel**: `placeChyronNom` filtrava amb `c.name.includes("Nom")` sobre el
NOM SENCER del fitxer wott, que inclou el TEXT del rètol. La traducció
«…_644349_TRADUCCIO [2-3] **Nom**és n'existei…» conté "Nom" → la fase NOM se la
quedava i l'escrivia a V7, damunt del nom-càrrec. **No** és un error de càlcul ni
de neteja de col·locació: és un error de **classificació de família** (el mateix
filtre, copiat a 3 llocs, amb `includes` sobre text lliure — el text traduït pot
començar per "Nom", "Lloc", "Data" o "Firma").

**Solució**:
- `flow_chyrons._isTraduccioWott(c)`: predicat ÚNIC i **accent-safe**
  (`/TRADUCCI[OÓ]/` sobre el rol o sobre el TOKEN del nom delimitat per `_`; mai
  el text lliure).
- Guarda `!this._isTraduccioWott(c)` a `placeChyronLloc`, `placeChyronNom` i a
  `isLloc`/`isNom` de `placeChyronResto`. `isTraduccio` i el filtre de
  `placeChyronTraduccio` passen pel predicat únic: abans `.includes("TRADUCCIO")`
  (sense accent) no veia «_TRADUCCIÓ» → les traduccions amb accent no es
  col·locaven enlloc.
- Invariant a `_placeChyronsByType`: amb `label !== "Traducció"`, cap wott de
  traducció s'escriu al timeline (avis `🛡️ [<fase>] N traducció(ns) fora de
  família`).
- `14_Assembly_Logic.classifyChyrons`: la traducció es classifica PRIMER i
  accent-safe (abans un text traduït amb "Tema-Titol"/"TITOL" hi queia).

**Verificació**: 11 asserts nous al harness (fase `14-chyrons-families`) amb les
cadenes de nom REALS del cas → **PASS 102 / FAIL 0** i `WARN/ERROR dels mòduls (0)`.

**Eina nova — `bin\analyze_prproj_tracks.py`**: llegeix un `.prproj` descomprimit
(XML pla) i llista els items **pista per pista** (V1..Vn) amb nom de mèdia i
entrada/sortida, més una secció final de **DUPLICATS ENTRE PISTES** (mateix mèdia
a 2+ pistes). Complement de `analyze_prproj_seq.py` (`--list`, `--seq NOM|UUID`,
`--track N`, `--from/--to`, `--max N`). Amb aquesta eina es va confirmar el bug
sobre l'**auto-save** del projecte (`…\Adobe Premiere Pro Auto-Save\…09-21-09.prproj`),
perquè el `.prproj` principal era ANTERIOR al run de les 09:16 (Premiere no desa a
cada acció: per analitzar cal un auto-save posterior o desar el projecte a mà).
Nota d'ús: `analyze_prproj_tracks.py` necessita un intèrpret Python real — en
aquest equip no hi ha `python` al PATH (stub de la Microsoft Store); s'usa
`& 'E:\Python 3.12\python.exe' -X utf8 bin\analyze_prproj_tracks.py …`.


Los módulos que el harness **no** ejecuta (`17_TitoletDetect_Logic.js`, `main.js`…)
se validan con el V8 del navegador sin ejecutarlos:
`bin\check_js_v8.ps1` (compila cada `js/**` + `jsx/**` con `new Function`;
escribe `%TEMP%\fp_manifest.json` + `fp_syntax.html` y lanza Edge headless con
`--allow-file-access-from-files`). Última ejecución (2026-10-15):
**FITXERS: 58 · TOTAL 58 | OK 58 | FAIL 0**.

> Nota: «smoke» aquí significa *prueba de humo* (ejecución completa sin errores),
> no «marcador de humo».

### 11.2 Rètol de localització del DIRECTE: bug TN MEDIODIA V2 — resolt 2026-10-16

**Símptoma** (TN MEDIODIA V2, bloc «VIMBODÍ I POBLET», emissió 15/10; run
`TNM_V2.fastpass.json`): el rètol de **LOCALITZACIÓ DEL DIRECTE**
(«…_644353_Directe_PRESENCIAL_Vimbodí i P.») es col·locava a **0.40 s** — **34 s
abans** que el lloc fos a pantalla (el directe del bloc obre a l'IPD
«05 - +++IPD POBLET VISITA» @34.36 s).

**Causa arrel**: el generador de ròtols emet aquell wott amb el lineID de
l'**ÍTEM D'INTRO del DIFERIT** («04i - intro DIFERIT (VIMBODÍ I POBLET)» @0 s) i
`_baseTimeForChyron` ancora cada rètol al marcador del **SEU** ítem. L'ancoratge a
la connexió (`_connexioMarkerTime`) només resolia el cas dels ENVIAT: el marcador
de l'IPD no conté «CONNEXIÓ» ni acaba en `dir`.

**Solució**: `_isDirecteSenyalWott`, `_isIpdDirecteMarker`, `_firstIpdDirecteAfter` i
`Chyrons._ipdAnchorPlan()` (detall a `BUGS.md` #167), `label` amb el
comentari del marcador dins de `markersFull` i `flow_chyrons.js?v=76`.

**Cobertura** (17 asserts, fase `15-ipd-chyron`, sonda `bin\smoke\fp_probe_ipd_chyron.js`
amb les cadenes de nom i els marcadors REALS del bloc V2): família pel `rol`
(`parts[7]` de `13_Parse.meta`) o pel TOKEN exacte del nom (el text lliure no
compta), detecció d'IPD/directe («+++IPD», `…dir`, títol «DIRECTE», sufix `dir`),
primer IPD **estrictament** posterior, el pla amb **UN** sol moviment cap a 34.36 s
(col·locació 34.76 s amb el +0.40 s del tc) deixant **intactes** l'ENVIAT i el
nom-càrrec, el log `📍 … LOCALITZACIÓ: … penja de l'ítem X → va a l'ítem Y`, i les
guardes: rètol que ja penja del seu ítem IPD/directe (no es mou), filtre de fase
que no el reclama (pla buit) i bloc sense cap IPD/directe (pla buit, sense errors).


### Referencias

- `docs/specs/ITEM_CLASSIFICATION.md` — clases de ítem y `duradaEfectivaSec`
- `docs/specs/MARKER_COLORS.md` — `colorIdx` y prioridad de colores
- `docs/specs/ESCALETA_JSON_SPEC.md` — formato del JSON de escaleta de producción (entrada de F1)
