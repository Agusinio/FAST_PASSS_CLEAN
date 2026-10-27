# Marcadores de Estructura — Referencia de Colores

## Mapa `setColorByIndex` de Premiere Pro (verificado visualmente)

| Índice | Color visual | Uso en FAST_PASS |
|--------|-------------|------------------|
| 0 | Verde Caqui | — |
| **1** | 🔴 **Rojo** | Items no verticalizables (`agrupacio==null` y `durada>"0:00"`) **que NO son IPD** |
| 2 | Malva (Rosa) | — |
| 3 | Naranja | — |
| **4** | 🟡 **Amarillo** | Grafismos / títulos superpuestos (`agrupacio==null` y `durada=="0:00"`) |
| 5 | Blanco | — |
| **6** | 🔵 **Azul** | Items generales / verticalizados (`agrupacio!=null`) |
| **7** | 🔷 **Turquesa** | **IPDs** (`/IPD/i` en `num` o `titol`): interrupción publicitaria **DENTRO** del bloque (tapa el directe) |

## Lógica de asignación (flow_assembly.js)

> **Desde 2026-10-05 (BUG #139) la fuente ÚNICA de verdad es `_getColorIdx`**
> (`js/workflows/flow_markers.js`), que consulta `isIpdLine` **antes** que nada.
> Todas las fases de marcadores (F1, F1·Ungrouped, F2…F7, `_colorByNumFromManifest`,
> `placeUngroupedMarkers`) pasan por ahí, así que el color es el mismo en cualquier capa.
>
> ⚠️ **Invariante**: ninguna fase debe fijar un `colorIdx` literal. `F1·Ungrouped` y
> `placeUngroupedMarkers` lo hacían con `colorIdx: 1` (hasta 2026-10-05) y eso repintaba
> de ROJO cualquier IPD no agrupado — el color de `placeUngroupedMarkers` además es el
> ÚLTIMO del pipeline OUT&GO, así que borraba el color que F2/F3/F5 ya habían calculado.

```javascript
if (/IPD/i.test(line.num + ' ' + line.titol)) {
    colorIdx = 7; // TURQUESA — IPD dentro del bloque (tapa el directe)
} else if (line.agrupacio) {
    colorIdx = 6; // AZUL
} else {
    const dStr = line.durada || line.duradaOnAir || "0:00";
    const dSec = parseDurada(dStr);
    colorIdx = dSec === 0 ? 4 : 1; // 4=AMARILLO, 1=ROJO
}
```

## Notas

- La función `setColorByIndex(index)` acepta valores 0–7.
- Valores fuera de rango se clampan: `Math.max(0, Math.min(7, index))`.
- El mapa del enum `MarkerColor` (RED=1, GREEN=0, etc.) **NO coincide** con los índices de `setColorByIndex`. Usar siempre `setColorByIndex` con los índices de esta tabla.
- Verificado en Premiere Pro 23.0 (Abril 2026).
- **El color 1 (ROJO) tiene DOS consumidores funcionales** — no es decorativo:
  1. `_safePlaceByPrefixes` (`flow_markers.js`, filtro de vermells): **descarta** todo
     marcador rojo que no quede *entre* dos marcadores de otro color.
  2. `F6·Ordre` (`ungroupedSet`): **excluye** los ítems no agrupados de la guarda de orden.
  → Por eso un IPD (que SÍ es un ítem emitido dentro del bloque) no puede pintarse de rojo.
- **Colores libres**: 0 (verde caqui), 2 (malva), 3 (naranja), 5 (blanco). El turquesa (7)
  está reservado a los IPDs desde 2026-10-05 (antes sólo lo usaba F5·Inferits).
- `Markers.get()` devuelve siempre `color: -1` (limitación de PPro): **no existe un color
  "puesto a mano" que sobreviva**. Cada fase hace delete+create y recalcula el color desde
  la escaleta con `_getColorIdx`, así que un recolor manual se pierde en la siguiente pasada
  (por eso la regla vive en el código, no en un fichero de estado).

## Regla imperativa: cap marcador superposat (2026-10-27 · BUG #192)

> **Ordre de l'usuari**: «els marcadors no poden quedar mai superposats. Sempre que això
> passe, cal separar-los uns segons i deixar-los en el seu ordre d'escaleta.»

La garantia viu a **`F8 · Separació`** (`separateOverlappingMarkers`, `flow_markers.js`), que
és l'**última fase** del pipeline de marcadors d'OUT&GO (`js/main.js`), després de
`F6·Ordre` + `F7·Cobertura`, de `F6·GF` i dels VERMELLS (totes poden afegir marcadors al
`00:00`).

| Aspecte | Valor |
|---|---|
| Detecció | dos marcadors amb `\|Δt\| ≤ 0,20 s` formen un **clúster** |
| Separació | `_GAP_SEPARACIO` = **3,0 s** (el mínim que va demanar l'usuari); es reduïx només si el clúster següent és a prop (marge de 0,5 s, mínim 0,20 s) |
| Ordre | `sequencia` de l'escaleta: el **primer** es queda a la posició del clúster i la resta van darrere |
| OnAir | `pinned`: **no es mou mai** (el seu imant al tall és sagrat); si un altre li cau damunt, es mou l'altre |
| Abast | només marcadors amb prefix d'escaleta (`num - títol`); els rètols MOGRT (comentaris sense `num - …`) no s'hi toquen |

Cas real que la va motivar (`TNM_V1` 2026-10-26): `F2` va fer `01dir` marcador d'inici a
`00:00` i `F7` hi va afegir `01 TE-1`, `01 TD-1` i `01BT` al **mateix** `0,00 s` → quatre
marcadors superposats i, a més, amb l'ordre d'escaleta invertit (`01dir` és el 4t del bloc:
`seq 28`, darrere de `25/26/27`). Amb F8 queden `01 TE-1@0 · 01 TD-1@3 · 01BT@6 · 01dir@9`.
