# GRAF_ZONA_GRIS — Paleta amb peu gris (grafisme a V2 + màscara a V3)

> Estat: **implementat · pendent de validar en viu** (2026-10-28).
> **2a volta (28/10, petició d'usuari):** la màscara puja a V3 i el grafisme va a V2
> **SEMPRE**, tinga zona grisa o no (provat en viu amb un grafisme a sang que tapava la
> màscara). La detecció de gris queda com a **INFO al log** (3 mostres t=2/3/4 s + mediana).
> Codi: `js/logic/21_GrafZonaGris_Logic.js` (detecció) · `js/workflows/flow_mapa.js`
> (decisió i moviment de la màscara). **Cap fitxer `jsx/` tocat** (zero JSX nou).
> Prova: `bin/smoke/fp_probe_grafzona.js` (fase `25-graf-zona-gris`).

## 1 · Problema

A `ZZZ_GRAFISME\<DD MES>` conviuen dos tipus de grafisme de la Paleta (botó 🎨):

1. **Grafisme ple** (o amb fons opac): va a la pista de grafismes → **V3**, damunt de tot.
2. **Grafisme amb zona grisa al peu** (una franja grisa a la part de baix del disseny):
   la franja ha de quedar **per davall de la MÀSCARA** de Reels, que viu a **V2**.

Fins ara tots dos s'enviaven a V3, de manera que la màscara (V2) quedava **per davall** i el
grafisme tapava la composició vertical.

**2a volta (28/10):** la prova en viu amb `app google tots sant gervasi esvoranc.mov` (foto a
sang; **3,1 %** de gris → «sense zona grisa») va mostrar que eixe grafisme eixia a **V3** i
també tapava la màscara → la regla passa a ser per a **TOT** el grafisme (D1), i la detecció
del peu gris queda com a **informació** al log.

**3a volta (28/10):** el segon provat en viu va ensenyar que la màscara ja pujava i el grafisme
anava a V2, però el tall es feia entre **sub-ítems** de l'ítem (`01p22` → `01p23`, 5,88 s → 11,08 s)
i no de marcador a marcador → el troç de V3 no ocupava l'ítem. La frontera passa a ser el número de
**LÍNIA** d'escaleta (`01i`, `01`, `01dir`, `02dp`…), mai els sub-ítems (`01p21`, `01p22`…).

## 2 · Decisions (usuari, 28/10/2026)

| # | Decisió |
|---|---|
| D1 | **SEMPRE** (2a volta, 28/10): el troç de màscara de l'ítem **puja a V3** i el grafisme va a la pista de la màscara (**V2**), per davall. (1a volta, 28/10: només amb zona grisa; provat en viu amb un grafisme a sang el pie del qual no és gris — 3,1 % —, eixia a V3 i tapava la màscara → l'usuari va demanar que siga sempre.) |
| D2 | El rang on la màscara va per damunt és el de l'**ítem d'escaleta**, **de MARCADOR a MARCADOR**: del marcador de la seua **LÍNIA** (el darrer número de línia a o abans del cabezal) al **següent número de línia** (`01i - intro` → `01 - ELS VEÏNS…`). Els **sub-ítems** (`01p21`, `01p22`…) són comentaris interns de la línia i **no** fan de frontera (3a volta, 28/10). |
| D3 | **Tot el grafisme va al mateix track** en tots dos casos, encara que tinga diversos trams (quan arribe el mode multipas). |
| D4 | Es mou **només el troç de màscara que coincidix amb els marcadors de l'ítem**; la col·locació automàtica del grafisme és un punt de partida i l'usuari l'ajustarà. |
| D5 | **Primer es corta i es mou la màscara i després es col·loca el grafisme**: si es fera al revés, l'insert del grafisme passaria per damunt del troç de màscara. |
| D6 | Detecció (**només INFO al log** des de la 2a volta): franja inferior, `#D9D9D9 ±25`, si la cobertura ≥ 30 % → «té zona grisa». Es mesura amb **3 mostres (t=2/3/4 s)** i decidix la **mediana** (2026-10-28, després del cas `APP GOOGLE`: un sol frame a t=3 s caïa en un fundit a blanc). |
| D7 | De moment només a la **Paleta 🎨** (`Mapa.run`); `runFromMarkers` i OUT&GO no canvien. |
| D8 | **Caché sí**, i ha de **distingir versions**: un fitxer reexportat amb el mateix nom es detecta per la **data de creació**. |
| D9 | Es manté el retall a l'**espai hàbil** (final del clip de referència) i el **congelat de 3 s** (que, amb zona grisa, va a la mateixa pista V2). |
| D10 | El moviment de la màscara **no ha de moure** cap altre clip de V2 ni de V3. |

## 3 · Detecció (`js/logic/21_GrafZonaGris_Logic.js`)

```
1 crida ffmpeg:  -ss 2 · -t 2,5 · fps=1  →  3 frames (t = 2, 3 i 4 s)
                 crop=iw:ih*0,40:0:ih*0,60  →  scale=64:64  →  rgb24 cru
per a cada frame: cobertura = % de píxels amb |R-217|<=25 · |G-217|<=25 · |B-217|<=25
veredicte:        mediana de les 3 cobertures  >=  30 %  →  hasGrey
```

* L'extracció fa servir l'àtom existent `FFmpeg.extractRoiSeries` (zero ffmpeg nou);
  les tres mostres vénen en **una sola crida** (un `.raw` amb 3 frames encadenats).
* `analyseSeries` mesura **cada frame** per separat (els bytes que no completen un frame
  queden fora: mai es mesura mig frame) i `decideSeries` decidix per la **mediana**
  (amb un nombre parell de mostres es pren la **baixa**: mai no inventa una zona grisa).
* El recompte fa servir `TitoletDetect.analyzeRect` (mateixa semàntica de tolerància; si el
  mòdul no estiguera carregat, hi ha un comptador propi idèntic).
* **Per què 3 mostres i no un sol frame** (2026-10-28, mesurat amb ffmpeg): un frame fix a
  3 s va bé amb els dissenys estables (`ATUR EPA CATALUNYA.mov` i `Vertical_Condicions ús
  whatsapp i telegram.mp4`: y 660→1080 = 39 % de baix amb `#D9D9D9` uniforme al **100 %** a
  1/2/3/4/6/10 s), però és **fràgil**: `APP GOOGLE tots SANT GERVASI ESVORANC.mov` té un
  **fundit a blanc just a t=3 s** (97,3 % blanc, mitjana 251) i el disseny real només es veu
  a t≥4 s. Amb la mediana, un frame de transició no canvia el veredicte.
* L'alpha del `.mov` no molesta: en rgb24 la part transparent eix en **negre** (0,0,0),
  fora de la finestra del gris.
* `ok:false` (no s'ha pogut mesurar) **no** bloqueja res: la màscara puja igual i el
  grafisme va a V2 (la mesura només servix per al log).

### Caché

`C:\temp\fp_graf_zona_cache.json`, una entrada per clau:

```
<ruta en minúscules>|<mida>|<data de CREACIÓ o, si no n'hi ha, mtime>|<VER>
```

* La data de creació es llig per `IO.fileInfo` → `File.created` (l'únic fiable en UNC; el
  mtime del NAS pot estar desplaçat per processos nocturns).
* Si el grafisme es reexporta amb el **mateix nom**, canvia la data de creació → **clau
  nova** → es torna a mesurar.
* `VER` (avui `v2`) invalida tota la caché si canvien la recepta o les mostres.
* Es desa `hasGrey`, `cov` (la mediana), `covs` (les cobertures de cada mostra) i `n`.
* Màxim 400 entrades; en passar-ne, es buida i queda l'última.

## 4 · Flux (`flow_mapa.js`)

```
_placeClips(items, refSec, freeze, ref, ctx)
 ├─ 0. neteja prèvia de les restes del BLOC a V2 **i** V3 (per nom de media)
 ├─ 0b. _zonaGris(items, ctx)            ← mesura el FITXER original · NOMÉS INFO al log
 ├─ 0c. (03/11 · #233) FORA del flux manual: mana el CABEZAL (l'àtom _anchorMarker es queda)
 ├─ 0d. _itemRangeAt(refSec)             ← [marcador de l'ítem, següent marcador]
 │        └─ _mascaraAParking(rng, TRACK_MASCARA, TRACK_GRAF)
 │              ok  → tGraf = TRACK_MASCARA (V2)   ← SEMPRE que es puga (2a volta)
 │              ko  → WARN + tGraf = TRACK_GRAF (V3, com sempre)
 ├─ 1. espai hàbil (final del clip de referència)
 ├─ 2. neteja (tGraf) + congelat
 ├─ 3. inserció del grafisme a tGraf (retall a l'espai hàbil si no hi cap)
 ├─ 4. rèplica del congelat del tema-títol a TRACK_FREEZE
 └─ 5. congelat final del grafisme a tGraf
```

`_itemRangeAt` accepta qualsevol ítem (intro, donapàs, off): només mira els **marcadors de
LÍNIA** d'escaleta. El número és el **primer testimoni** del comentari (tall per espai, «·» o
«-», la mateixa convenció que `numParts` d'`analysis_center`) i només val si és dígits +
lletres (`01`, `01i`, `01dir`, `02dp`, `19C`): els **sub-ítems** amb dígits després de lletres
(`01p21`, `01p22`…) no són frontera. S'agafa el darrer de línia a o abans del cabezal i el
**següent de línia**; si no n'hi ha cap més, fa servir el corxet **OUT** i, si no està posat,
el final del programa. Si la seqüència no té cap marcador de línia reconeixible es fa servir
qualsevol número (i s'avisa al log).

### 4.1 · On va el grafisme: el CABEZAL (03/11 · #233 anul·la l'ancoratge de #203)

**Decisió vigent (2026-11-03, petició d'usuari)**: el flux manual de la paleta col·loca el
grafisme **ON ÉS EL CABEZAL** (`refSec`). `_anchorMarker` ja **no** es crida des de `_flow`:
l'àtom queda per al marcatge per marcadors (`runFromMarkers`) i per a les proves. El text de
davall és l'ancoratge que es va provar el 28/10 (#203), conservat com a documentació de per què
l'àtom existix.

~~El punt d'entrada **no** és el cabezal ni el marcador seleccionat al panell: és el **marcador
de l'ítem del fitxer triat**.~~ Un cop triats els fitxers, `_anchorMarker(picked, cti)` llig
`Markers.get()` i puntua **cada fitxer contra cada marcador numerat** (sub-ítems inclosos):

* `_normFon` — normalització fonètica suau damunt de la de sempre: **B→V**, **Y→I**,
  **QU→K**, **C+E/I→S**, **SS→S** i fora la **-S final** de les paraules llargues (plural).
  És el que fa casar `ESBORANC`/`ESVORANC`, `VEÏNS`/`VEINS`, `GERVASY`/`GERVASI`.
* `_scoreNombre` — **cobertura relativa**: cada token del marcador es compara amb el **millor**
  token del fitxer (`_dice`, bigrames) i es pondera per la llargada. El fitxer pot dur
  paraules de més (client, data, `app`, `google`) sense baixar el resultat.
  Exemple viu: `app google tots sant gervasi esvoranc.mov` vs
  `01p22 - P2 PAS 1 GOOGLE tots SANT GERVASI ESVORANC` → **0,91**.
* Guanya el millor `score`; en **empat** mana el marcador més **pròxim al cabezal**.
* Per davall de **`MATCH_MIN` = 0,60**, o si el marcador no té cap clip a V1
  (`_refClipAt`), es retorna `null` i **es fa el de sempre** (cabezal): res canvia.
* **`ANCHOR_LINE` = true**: si el guanyador és un **sub-ítem** (`01p22`), l'àncora passa a
  l'**inici de la seua LÍNIA** (`01i`), perquè el grafisme i el rang de la màscara parlen del
  **mateix ítem**. El log diu sempre quina de les dos coses ha passat (`🗺️ [MAPA·àncora]`).

## 5 · Moviment de la màscara (`_mascaraAParking`)

Per a cada clip de `tMasc` que solapa `[a, b]` (de dreta a esquerra, perquè els índexs de
l'esquerra no canvien):

1. **Guarda**: la pista de dalt ha d'estar **lliure** a `[a, b]`. Si hi ha clips (grafismes
   d'altres ítems) → `DESTI_OCUPAT`, no es toca res i es col·loca com sempre.
2. Llig el **Motion** del clip original (`Graphics._ipdPlusLlegirMotion`).
3. Puja el troç `[s, e]` a V3 amb `Graphics._ipdPlusPoner` (insertClipFrom + retrim, amb
   guardat i devolució de la cua) i li **hereta el Motion** (`_ipdPlusHeredarMotion`): el
   Motion viu a la **instància de pista** i no viatja amb l'insert.
3b. **`_ajustarFiAlMarcador(tPark, put.idx, e, b)`** (#203): llig el `end` **REAL** del clip
   acabat d'insertar (`Clips.get`) i, si no arriba al marcador `b`, reintenta `Clips.retrim`
   allargant el troç (fins a 3 intents, +0,06 s per cobrir el frame del TC). Si el mèdia no en
   dóna més (`WARN_INVALID`) **restaura** el clip com estava i diu quants segons falten: el
   tall no es pot inventar, però tampoc es deixa un clip trencat.
4. Si la màscara continua després de `e`, la **coa** `[e, fi]` es reposa a V2 (també amb
   `_ipdPlusPoner` + Motion).
5. L'original es queda **només** amb el troç anterior (`Clips.retrim`) o s'esborra
   (`Clips.removeAt … , false`, sense ripple).

Resultat: V3 té el troç de màscara de l'ítem i V2 té un **forat net** `[a, b]` on va el
grafisme. Cap altre clip de V2 ni de V3 es mou (la cua es guarda i es torna).

El troç que puja **ocupa tot l'ítem** (`[a, b]`, marcador→marcador). Si la màscara de V2 és més
curta que l'ítem, el troç de V3 és el que hi ha i el log ho diu (`cov` desat al resultat): no
s'inventa mitja que no existisca.

## 6 · Casos límit

| Cas | Resultat |
|---|---|
| Sense màscara a l'ítem | `CAP_MASCARA` → WARN, grafisme a V3 (com sempre) |
| V3 ocupada a l'ítem | `DESTI_OCUPAT` (+ llista de clips) → WARN, grafisme a V3 |
| Sense cap marcador amb número | `_itemRangeAt` → null → grafisme a V3 |
| Cabezal abans del 1r marcador | null → grafisme a V3 |
| El cabezal cau en un **sub-ítem** de la línia (`01p22`) | el rang és el de la **línia sencera** (`01i - intro` → `01 - ELS VEÏNS…`), no `01p22` → `01p23` |
| La seqüència no té cap marcador de **LÍNIA** reconeixible | es fa servir qualsevol número (avís al log) |
| La màscara de V2 és més curta que l'ítem | el troç de V3 cobrix el que hi ha + avís `cov` al log |
| No es pot mesurar el fitxer | WARN al log; **la màscara puja igualment** i el grafisme va a V2 |
| Mòdul `GrafZonaGris` no carregat | WARN al log; **la màscara puja igualment** i el grafisme va a V2 |
| Diversos items a la tongada | tots es col·loquen igual, a V2, i la màscara puja una volta (D3) |
| Restes d'un intent anterior del mateix bloc | es netegen de V2 **i** de V3 abans de moure la màscara |
| El troç de màscara ja es va pujar en un intent anterior | la cua/original de V2 ja no existixen → V3 és ocupada → `DESTI_OCUPAT` (cal desfer el canvi abans de repetir) |
| Una mostra cau en una transició (fundit, cortineta) | la **mediana** de les 3 mostres no canvia el veredicte |
| El grafisme és més curt que la finestra | es mesuren les mostres que hi ha (1 o 2) i mana la mediana; amb 2 es pren la baixa |
| Hi ha **un altre marcador seleccionat** al panell | no compta: mana el **cabezal** (#233) |
| El nom del fitxer no coincidix amb cap marcador | no passa res: el grafisme va al **cabezal** (#233) |
| La carpeta del dia té un nom humà («01 NOVEMBRE», «3 DE NOVEMBRE») | `_dayFolder` prova variants, coincidència tolerant i, si cal, la **data de creació** (#233) |
| (només si es crida l'àtom) el millor marcador és un **sub-ítem** (`01p22`) | l'àncora passa a l'**inici de la LÍNIA** (`01i`) amb `ANCHOR_LINE` |
| El marcador triat no té clip a V1 | es descarta l'àncora i es manté el cabezal (avís al log) |
| El `retrim` deixa el troç 1-2 frames curt del marcador | `_ajustarFiAlMarcador` l'allarga fins al marcador |
| El mèdia de la màscara s'acaba abans del marcador | no s'allarga: es **restaura** i s'avisa dels segons que falten |

## 7 · Què **no** fa (encara)

* El grafisme **s'acota al final de l'ítem** (marcador següent): la màscara torna a V2 ahí
  i l'insert del grafisme és una **sobreescriptura**, així que si es deixara més llarg la
  pisaria. El retall deixa el clip **estirable** i l'usuari el pot allargar després (D4: la
  col·locació automàtica és un punt de partida).
* No toca `runFromMarkers` (MAPA per marcadors) ni OUT&GO (D7).
* **No mira la imatge** per a decidir l'ítem: l'àncora és el **nom** (marcador ↔ fitxer) (#203).
  Si el nom no diu res (per davall de 0,60) es queda al **cabezal**. Detectar **passos** dins
  d'un ítem (canvis de grafisme) i fer **OCR** per a creuar el text de la imatge amb l'escaleta
  és una altra feina: vegeu `FEATURES.md` §3 (`TWITTS_OCR`, `BURNED_GRAF_TYPES`).
* No fa el mode multipas del grafisme (D3 ho deixa preparat: tots els trams al mateix track).
