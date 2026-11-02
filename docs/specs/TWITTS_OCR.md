# TWITTS_OCR — Col·locació dels grafismes de tuit (XARXES) amb OCR d'1 frame per clip

> **Estat:** implementat (2026-10-29) · `implemented_pending_premiere_test` · **cap `.jsx` nou**
> Codi: `js/logic/22_TwittsOcr_Logic.js` + `js/workflows/flow_twitts.js` +
> enganxament a `runPlaceAllChyrons` i Ctrl+clic 🎯 (`js/main.js`).
> Petició: usuari 27/10 (`FEATURES.md` §2 `TWITTS_OCR`) + precisions 29/10.
> Germà de `docs/specs/GRAF_ZONA_GRIS.md` (mateixa família de problemes: grafisme
> ja cremat a la imatge que cal substituir pel movie bo).

## 1 · Problema

1. Els movies de tuit arriben amb el **bloc a seques** i la **línia `00`**:

   ```
   Wott_TNM_V_00_00.00_LUCYS VERTICALITZACIÓ_665892_XARXES-TEXT_tp_Oriol Junqueras_ERC_@junqu.00665945.mov
   Wott_TNM_V_00_00.00_LUCYS VERTICALITZACIÓ_665915_XARXES-TEXT_tp_Alberto Núñez Feijóo_PP_@N.00665949.mov
   Wott_TNM_V_00_00.00_LUCYS VERTICALITZACIÓ_652616_XARXES-TEXT_tp_Carles Puigdemont_Junts_@K_00652665.mov
   ```

   `Parse._esFlotant` (BUG #191, `js/logic/13_Parse.js:37`) els detecta com a
   **FLOTANTS**: `Scanner.wotts` els importa al bin però `Parse.assign` no els troba
   cap línia d'escaleta → **no es col·loquen mai** (`Scanner.js:486-496`).

2. L'edició vertical ja porta el tuit **CREMAT** dins del clip: és un **grafisme propi**
   amb fons **gris clar** i el text del tuit, més una **franja naranja amb el nom del
   titular**. Per tant la imatge sí que diu *quin* tuit és, però no a *quin fitxer* correspon.

3. Resultat: el bloc acaba amb els tuits cremats i la pista de grafismes buida.

## 2 · Decisions (usuari, 27-29/10/2026)

| # | Decisió |
|---|---|
| D1 | **UN sol frame per clip** del timeline (estalvi de processat): res de sèries ni de rastreig continu. |
| D2 | Eixe frame **no pot ser el primer** (el grafisme encara s'està muntant) → **frame 35 des de l'`in`** del clip: `clip.start + 35 × frameSec` (1,40 s a 25 fps). |
| D3 | `Config.rutas.chyrons` (`js/core/11_Configuracio.js:321`) **no** és la font de candidats: només és la carpeta on arranca el diàleg **d'emergència**. |
| D4 | El **gris clar** i la **franja naranja** són la firma visual del tuit. Es reconeixen **pel contingut** (el text del tuit i el nom del titular que l'OCR trau d'eixe frame), no amb una passada de color pròpia: no cal descodificar el PNG ni gastar una crida més de ffmpeg per clip. |
| D5 | La **franja naranja** porta el **nom del titular del tuit** → segona pista d'OCR. |
| D6 | Clau d'emparellament: **el text darrere d'un `@`** (handle), reforçada pel nom del titular (D5). |
| **D7** | **El disparador és la col·locació automàtica de chyrons** (🎯 COLOCAR, `js/main.js` → `runPlaceAllChyrons`): si al final hi ha movies de tuit **sense inserir al timeline**, s'executa la passada. Si no en falta cap, no es fa res. |
| D8 | **Cap finestra pròpia ni cap botó nou** (l'antic `#twitts-overlay` i el botó 🐦 s'han retirat): la passada automàtica no pregunta res. L'**únic** mecanisme manual és l'emergència de D9 (el seu overlay `#twitts-pick` només apareix si el match OCR no decidix). |
| D9 | **Emergència = Ctrl+clic a la DIANA 🎯 de CHYRONS** (reescrit 29/10): primer **match OCR** amb 1 frame del clip del cabezal contra els tuit **pendents** (mateix criteri que D7/D10); si no casa, **llista curta** (overlay `#twitts-pick`) amb els `.mov` XARXES del **dia del projecte** (D18) + els pendents que ja són al projecte, i **«Buscar al disc…»** obri el navegador natiu a `rutas.chyrons`. Mai la carpeta sencera com a primera opció. |
| D10 | La tria que ha funcionat es **memoritza** (caché) → si el tuit torna a eixir amb l'OCR igual, casa sense tornar a puntuar. |
| D11 | **Zero JSX nou**: `Render.snapshot` (QE) / `FFmpeg.extractFramePng` + `bin\ocr.ps1` (via `TitoletDetect.ocrText`) + `Clips.insert` + `IO.importFiles` + `FASTPASS.Project.items`. |
| D12 | Si no hi ha cap pista (ni `@` ni coincidència de nom), el clip queda **PENDENT** i es resumix al final; **no bloqueja** la resta del bloc ni el flux de chyrons. |
| **D13** | **Els candidats són els `.mov` que ha portat la IMPORTACIÓ** (`FASTPASS.Project.items('')` filtrat per `esXarxes`: rol `XARXES`, marca `LUCYS` o bloc a seques `_V_00_`), **descomptant els que ja són al timeline** (`pendents`, mirant totes les pistes de vídeo). Mai una carpeta, mai una data. |
| **D14** | Només es miren els clips de V1 **lliures** (cap grafisme damunt en ≥50 % del seu tram) i de **≥ 3 s**; sostre de seguretat de **80 OCR** per passada (`maxClips`). |
| D15 | **La col·locació cobrix TOTALMENT el clip de V1** (`Clips.insert` de `clip.start` a `clip.end`), a la pista de grafismes de la CONFIG. Si el movie és més curt que el clip, s'avisa i es col·loca igualment (sense inventar congelats). |
| D16 | *(substituïda per D19 i D21 el 2026-10-29)* El frame de mostra s'exportava de la **timeline** amb `Render.frame`. ❌ `Render.frame` (= `seq.exportFrame`) **no existix al DOM de Premiere 25** («`seq.exportFrame is not a function`»): cada clip fallava en silenci i la passada acabava en «0 col·locat(s) · 0 pendent(s)» (BUG #205). |
| **D17** | **Aturada primerenca**: quan ja no queda cap movie per col·locar, la passada s'atura encara que queden clips per mirar (no es gasta cap OCR més). |
| **D18** | **La data de l'emergència mana del `.prproj` obert**, no del rellotge (`_dayDir`): `Mapa._resolveDateDir` → `Context._resolveProjectDateDir` → `State.projectDateDir` → `State.dateDir` → rellotge (mateix orde que BUG #187/#196). Els `.mov` del dia es daten amb la **caché del Scanner** (`_listNamesNative` + `_dateWotts`, `fp_wott_dates_v1`); un fitxer que **no es pot datar NO entra** a la llista (anti-contaminació). |
| **D19** | **El frame de mostra s'extrau del MEDIA del clip amb ffmpeg** (2026-10-29, substituïx D16; **des de D21 només és la RESERVA**): `flotants()` publica `paths` (nom d'ítem → ruta del media) i `samplePng` crida `FFmpeg.extractFramePng(ruta, srcTime(clip, t), png, {roiY:[0,1]})` — el **mateix àtom** del OCR de títols, **0,25-0,33 s** per frame i **sense tocar la timeline** (ni Out point ni cabezal). A més el frame no porta cap chyró al damunt, així que l'OCR llig el tuit més net. El segon dins del fitxer el dóna `srcTime` (`inPoint + offset`, escalat si el clip està re-timed). **Reserva** (anidada/multicam/sense ruta o ffmpeg KO): `Render.snapshot` (QE `exportFramePNG`), que amplia l'Out point si cal i el restaura. Tot fracàs de captura **es registra** al `FASTPASS.log` (`⚠️ [TWITTS] … sense mostra per a l'OCR: <motiu>`, BUG #205). |
| **D20** | **La colocació es REPARA i es VERIFICA després de l'insert** (2026-10-29, BUG #206): `Clips.insert` (JSX) ajusta la duració amb `clips[numItems-1]` (l'**últim** clip de la pista, no el inserit), així que amb chyrons a V3 el tuit es quedava amb la **duració sencera del mèdia** i retallava el chyron del darrere. `_place` llig la pista ABANS (`before`) i després `_fixPlacement`: localitza el clip per **NOM + `start`** (mai per instant), el retalla coherent amb `Clips.retrim` (`Clips.endAt` de reserva), **restaura** els preexistents i **verifica** el resultat; si no quadra, la colocació **no compta** (`❌ … inserit però NO verificat`). El log bo diu el clip de V1 objectiu. |
| **D21** | **La mostra torna a eixir de la TIMELINE (QE) i el mèdia queda de reserva** (2026-10-29, BUG #207): amb D19 el frame es llegia del fitxer en `srcTime(...)`, i eixe mapeig **no és fiable** en les V1 d'esta cadena — el 29/10 el frame del clip de `36:22` eixia del **contingut del clip de `43:08`** (i el de `33:13`, del de `40:07`), així que dos tuits (Feijóo i Nogueras) es van col·locar **2 clips abans** del que tocava. `samplePng` torna a capturar amb **`Render.snapshot`** (`Render.exportFrameQE` → `qeSeq.exportFramePNG`, el mateix mecanisme de `flow_chyrons._capturePng`, en producció des de fa setmanes): el frame de `sampleTime` és, **per construcció**, el d'eixe clip. ffmpeg + `srcTime` (D19) queda **només** de reserva si el QE no dóna cap frame. El log de cada clip diu la via (`· QE` / `· ffmpeg`). |
| **D22** | **També SÓN tuit els exports a mà `wott x <nom>`** (2026-10-29, BUG #208): el redactor exporta alguns tuits com `wott x salvador illa.00666202.mov`, `wott x salvador illa1.00666204.mov` o `wott_v3 x pedro.00666211.mov`. No porten ni el rol `XARXES`, ni la marca `LUCYS`, ni el bloc a seques `_V_00_`, així que `esXarxes` els descartava **abans de datar-los** i l'emergència no els ensenyava mai. `esXarxes` accepta ara `^wott(?:[_ ]v\d+)?\s+x\s+\S` (la `x` ha d'anar **separada**: els ròtols corrents `Wott_MAT_v2_105_00.01_…` i `Wott_TNM_V4_082_00.35_…` continuen fora). Sense `_tp_`, el nom del titular s'extrau de darrere la `x` amb `nomNet` i es mostra tal qual a la finestra. |
| **D23** | **La llista de l'emergència s'ordena per SEMBLANÇA amb el text del clip i es pot filtrar** (2026-10-29, BUG #208): `rankPick(items, textOcr)` puntua cada movie amb `semNombre` — +3 si el nom del titular (sense dígits ni espais) ix dins del text OCR, +1 per paraula del nom que hi ix (+0,5 si només n'ix un tros), +2 si un `@handle` del text ix dins del nom — i suma **+2** als que ja són al projecte; desempata pel **número d'export** del nom (`fileSuffix`: `…00666211.mov` > `…00666204.mov`, equivalent a l'hora de creació i **sense cap `stat` al NAS**). La finestra ensenya els punts (`★n`), té un **cercador** (`#tw-pick-q`, filtra en viu pel nom normalitzat) i es navega amb ↑/↓ + ⏎. A més, `_dayMovies` guarda a `other` el que cau en un altre dia o no es pot datar i `_recentOf` n'afig els **20 exports més recents** amb l'etiqueta «altre dia»: un tuit exportat a les 00:30 cau al dia anterior (regla nocturna) i seria invisible. Seguix sense ensenyar-se la carpeta sencera (1.300 fitxers). |
| **D24** | **El criteri és el ROL i el TC del nom, no la família (2026-10-30 · petició d'usuari).** Només es col·loquen buscant-los a la imatge els ítems amb rol **`CONVERSA`** o **`XARXES-TEXT`** (`esOcrItem`; s'accepten sufixos com `XARXES-TEXT+FOTO`, i es manté la família d'export manual `wott x <nom>` de D22). Fora queden `LUCYS … Tema-Titol`, `… Directe`, `… Enviat`, `… Nomcarrec`… que `esXarxes` acceptava. **El TC és DE FIAR sempre EXCEPTE si és `00.00`** (`tcFiable`): un ítem **amb bloc i TC bo** es col·loca pel TC, **igual que qualsevol wott** (`_placeByTc`), sense OCR. `esXarxes` es queda només per a la idempotència (`_covered` / `_isPlaced`). |
| **D25** | **Arbre de decisió (2026-10-30).** `runAuto`, al final de 🎯: (1) **hi ha cap CONVERSA/XARXES-TEXT al BIN?** Si no, no es fa res. (2) Per a cada ítem que no és al timeline: **amb bloc i TC de fiar → pel TC**; **amb bloc sense TC → OCR dels clips del timeline** (`_scanTimeline`); **sense bloc (és V) → rastreig de GRIS del bloc** (`_rastreigBloc`). El pòsit (`ocrItems`) llig **l'arrel + tots els bins** i descompta el que ja és al timeline amb `mateixNom` (tolerància al nom truncat de ~90 caràcters). |
| **D26** | **Rastreig de GRIS i Ctrl+clic 🎯 (2026-10-30).** Un ítem «és V» no té TC ni línia d'escaleta: l'única manera de localitzar-lo és buscar la **firma visual del tuit cremat** (la placa grisa de la franja inferior) al **media de cada clip de V1 lliure**, amb `Logic.GrafZonaGris.detect` (ROI y 0,60→1,00, `#D9D9D9 ±25`, mediana de 2 mostres/s, `force: true` perquè la caché de GrafZonaGris no inclou el `tStart`). Els que la tenen passen a l'**OCR d'1 frame** i s'emparellen **pel nom** amb els movies del BIN; si no hi ha coincidència, l'ítem queda pendent. **`Ctrl+clic` a la DIANA 🎯 = `Twitts.runGris`**: fa eixe rastreig i, si el clip del cabezal continua sense grafisme, obri la **finestra de selecció del grafisme a importar** (`#twitts-pick`, la de D9) i el col·loca damunt d'eixe clip. |



## 3 · Recorregut (automàtic, sense preguntar res)

Disparador: el final de `runPlaceAllChyrons` (`js/main.js`), després dels grafismes
de MAPA i abans de restaurar el focus a V1. Es crida `Workflows.Twitts.runAuto()`.

```
1. movies     →  Project.items('') + Project.items(<cada bin>)     (D13)
                 →  esXarxes(nom)?                                 (D13)
                 menos placedNames() (clips de TOTES les pistes)  (D13)
                 └─ si no en falta cap  →  FI (no es fa res)      (D7)
2. clips      →  V1 sense TUIT damunt (≥50 %) i ≥ 3 s             (D14)
3. per clip   →  Render.snapshot (QE) del frame de la TIMELINE     (D1/D2/D21)
                 (reserva si el QE falla: ffmpeg del MEDIA, −ss srcTime)  (D19)
                 →  ocrText → handleOf + rankCandidates           (D5/D6)
                 →  score ≥ 80 (o caché) → Clips.insert cobrint   (D10/D15)
                    i el movie ix del pòsit
4. aturada    →  pòsit buit? → FI                                  (D17)
5. resum      →  «N col·locat(s) · M pendent(s) · K movie(s) sense ús»
                 els pendents s'assenyalen amb l'emergència (D9)
```

Cost mesurat de referència (dades del repo, no noves): `ocr.ps1` ≈ **1,9 s** per
crida (`17_TitoletDetect_Logic.js:837`) + la captura del frame (**QE** ≈ 1-3 s;
ffmpeg del mèdia 0,25-0,33 s, D19, mesurat el 2026-10-06) → **≈ 2,5-5 s per clip**.
Per això només s'arranca quan hi ha tuits sense col·locar i s'atura quan el pòsit
queda buit (D7/D17).

## 4 · Extracció de pistes (`js/logic/22_TwittsOcr_Logic.js`, funcions PURES)

### 4.1 · `handleOf(text)` / `handlesOf(text)` — la pista forta (D6)

- Regex sobre el text OCR: `@[A-Za-z0-9_.]{2,}` (es guarden tots els que hi haja i
  puntua el millor).
- Normalitza: minúscules i fora `_` i `.` (`@nunez_feijoo` → `nunezfeijoo`).
- **El nom del fitxer ve TRUNCAT a ~93 caràcters**, així que el handle del movie pot
  arribar mutilat (`@K`, `@N`, `@junqu`). Per això l'emparellament és **per PREFIX en
  les dos direccions** (`@junqu` ⊂ `@junqueras`) i, si el prefix és d'1-2 caràcters,
  **no decidix sol**: passa el pes al nom del titular.

### 4.2 · `wottFields(name)` — Nom / Partit / `@handle` del NOM del movie

- `tp_<Nom Cognoms>_<Partit>_@<handle>.<id>.mov` → `{ nom, partit, handle, rol }`.
- El camp numèric de `_tp_` no es pren per handle si no té cap lletra (el nom ve
  partit per la llargada màxima del NAS).

### 4.3 · `scoreCandidat(textOcr, wottName)` — suma ponderada

| Senyal | Punts |
|---|---|
| `@handle` coincident amb prefix ≥ 3 caràcters | **+100** |
| `@handle` coincident amb prefix 1-2 caràcters | +40 |
| Nom del titular (similitud ≥ 0,60) | **+50** |
| Nom del titular (similitud 0,40-0,59) | +20 |
| Partit present al text | +15 |

`umbral` = **80** → col·loca sol · per davall → **PENDENT** (D12: la passada
automàtica no pregunta; el que no casa es queda per a l'emergència).

### 4.4 · `esXarxes(name)` / `pendents(files, placed)` — qui entra al pòsit (D13)

- `esXarxes`: cert si el nom porta `XARXES` o `LUCYS`, si és un **bloc a seques**
  (`Wott_<PROG>_<LLETRA>_00_00.00_…`, mateix criteri que `Parse._esFlotant`) o si és
  un **export a mà** `wott x <nom>` / `wott_v3 x pedro` (D22; la `x` ha d'anar
  separada, així que `Wott_MAT_v2_105_00.01_…` no hi entra).
- `pendents`: trau de la llista els noms que ja apareixen **a qualsevol pista de
  vídeo** (clips de la timeline). És la idempotència de D13: una segona passada no
  duplica res.
- **On es busquen (D13, corregit 29/10)**: `Project.items('')` llig **només l'arrel**
  (no és recursiu) i la importació deixa els movies a l'arrel i tot seguit els **mou
  al bin `CHY`** (`3_Project_Logic.js:572`). Per això es llig l'arrel **i cada bin de
  primer nivell** (`binsDe` → `type: 2`), i es deduplica amb `uniqItems`. Sense això
  el pòsit quedava buit i la passada automàtica no feia cap OCR.
- Un **chyron** col·locat damunt del clip **no compta** com a tuit (`_covered` mira
  `esXarxes`): el tuit va cremat a la imatge i conviu amb el ròtol.

## 5 · Emergència: Ctrl+clic a la DIANA 🎯 (D9)

```
Ctrl+clic 🎯
  1. clip de V1 davall del cabezal (Clips.at)          → si no n'hi ha, s'atura
  2. DATA DEL PROJECTE (_dayDir, D18)
  3. MATCH primer: 1 frame de la TIMELINE (D21; reserva D19) + OCR vs. els tuit PENDENTS
     → si algun casa (≥ umbral) es col·loca i s'aprén (D10). FI.
  4. si no casa: LLISTA CURTA (_pick, overlay #twitts-pick)
     = pendents del projecte [al projecte] + .mov XARXES del dia [del dia]
       + els 20 exports més recents d'altres dies [altre dia]   (D23)
     ORDENADA per semblança amb el text OCR del clip (★punts)    (D23)
     + cercador #tw-pick-q (filtra en viu) · ↑/↓ + ⏎ per triar
  5. «Buscar al disc…» → navegador NATIU a Config.rutas.chyrons
  6. el triat es col·loca cobrint el clip (Clips.insert; si no és al projecte, s'importa)
     + s'aprén el text OCR contra el fitxer triat (D10)
```

Per què el match va primer: el 90 % de les vegades el tuit del cabezal **sí** que
és al pòsit (la passada automàtica es va aturar perquè el clip ja tenia un
grafisme damunt o perquè va tocar el sostre d'OCR); preguntar-li a l'operador el
que el panell pot decidir tot sol és temps perdut.

Per què la llista és del **dia del projecte** i no de la carpeta sencera: la
carpeta de chyrons té mesos de feina i el navegador natiu de Windows **no pot
filtrar** ni per data ni per patró; una llista de 1.300 fitxers no és una tria.
La data ix del `.prproj` obert (D18), no del rellotge: si s'edita el bloc d'ahir
el matí següent, els movies que es volen són els d'ahir. El navegador natiu queda
com a **eixida** per als casos rars (movie d'un altre dia, reexportat…), mai com
a primera opció.

Per què la llista va **ordenada per semblança** i no per orde alfabètic (D23): hi
ha famílies de tuit que no duen cap camp útil al nom (`wott x salvador illa.00666202.mov`,
`wott_v3 x pedro.00666211.mov`, D22): el nom del titular hi és, però sense
`_tp_` ni `@handle`. Amb l'OCR del clip a la mà, `rankPick` els fa pujar sols
(«Salvador Illa» al text → `wott x salvador illa…` al cap de la llista, amb els
punts al costat), i el **número d'export** del nom (`…00666211.mov` és més nou que
`…00666204.mov`) desempata com ho faria l'hora de creació, però sense cap `stat`
al NAS. Si la semblança no decidix, el **cercador** de la finestra filtra en viu
pel nom (n'hi ha prou amb «illa» o «pedro») i ↑/↓ + ⏎ col·loquen sense ratolí.


## 6 · Caché (D10)

`C:\temp\fp_twitts_cache.json` (mateix patró que `GRAF_ZONA_GRIS`):

```json
{ "|VER": "v1",
  "h:junqueras": { "file": "Wott_…_@junqu.00665945.mov", "size": 4718592, "created": 1761... } }
```

- La clau és el `@handle` (`h:<handle>`); si no n'hi ha, el començament del text
  (`t:<text normalitzat>`).
- L'entrada es descarta si el fitxer canvia de `size`/`created` (movie reexportat
  amb el mateix nom) o si ja no és a la llista de candidats.
- S'hi escriu **quan una col·locació automàtica ha funcionat**: si el mateix tuit
  torna a eixir amb el mateix text d'OCR, casa sense tornar a puntuar.

## 7 · Col·locació

- **Pista:** la de grafismes de la CONFIG (`Config.get().tracks.video.graficos`), com
  fa MAPA (`flow_mapa.js:259-260`).
- **Ancoratge:** `clip.start` → `clip.end` del clip de V1 (D15), és a dir el clip on
  l'OCR ha casat — **mai** el cabezal ni el clip seleccionat.
- **Durada:** la natural del movie. Si el movie acaba abans del final del clip, es
  col·loca igualment i s'avisa al log (sense congelat).
- **Reparació i verificació (D20, BUG #206):** `Clips.insert` ajusta la duració amb
  `clips[numItems-1]` (l'últim clip de la pista), així que el tuit podia quedar-se amb
  la duració sencera del mèdia i retallar el chyron del darrere. `_fixPlacement` ho
  arregla (retall coherent + restauració dels preexistents) i **comprova** el resultat:
  si el final no quadra, la col·locació no compta i ix un `❌`.
- Idempotència per nom + solapament ≥50 % a la pista de grafismes (`_isPlaced`).

## 8 · Casos límit

| Cas | Resultat |
|---|---|
| No hi ha cap movie XARXES al projecte | La passada no fa res (ni un OCR) |
| Tots els movies de tuit ja són al timeline | `➖ … ja són al timeline` i FI (D13) |
| El clip ja té un altre grafisme damunt | Es descarta abans de l'OCR (D14) |
| El clip no té cap tuit | L'OCR no dóna `@` ni cap candidat ≥ 40 → es descarta (D4) |
| El tuit no arranca a l'`in` del clip (frame 35 cau abans o després) | **Risc conegut de D2.** Xarxa de seguretat proposada: si el clip no ha donat cap pista, **rescaneig a 3 punts (25 %, 50 %, 75 %)**, màxim 3 OCR més |
| OCR sense `@` (Windows OCR no té ca-ES i trenca `_` i accents) | Es tira del nom del titular (D5) i del partit |
| Dos movies amb el mateix `@handle` (rexut del mateix tuit) | Guanya el de `created` més recent; es diu al log |
| El tuit queda PENDENT | Resum al log + `status` groc; es resol amb Ctrl+clic 🎯 (D9) |
| Sostre de 80 OCR assolit | `⚠️ aturat al sostre de 80 clips` i resum |

## 9 · Implementació (FET el 29/10 · `check_all` en verd)

| Fitxer | Què hi va |
|---|---|
| `js/logic/22_TwittsOcr_Logic.js` | **NOU** · pures (`handleOf/handlesOf`, `wottFields`, `nomNet`, `fileSuffix`, `similitud`, `semNombre`, `rankPick`, `scoreCandidat`, `rankCandidates`, `isTuit`, `esXarxes`, `pendents`, `sampleTime`, `srcTime`, `pathOf`, `tcStr`, caché) + orquestració (`flotants`, `placedNames`, `samplePng`, `ocrClip`, `scanClips`, `learn`) — 100 % compatible `check_js_v8.ps1` |
| `js/workflows/flow_twitts.js` | **NOU** · TIMELINE: `runAuto` (D7) + `runEmergency` (D9) + `_place`/`_isPlaced`/`_covered`/`_dialog` + `_dayDir`/`_dayMovies`/`_mergeList`/`_pick` (D18) |
| `index.html` + `style.css` | **sense** botó nou: el títol de la DIANA 🎯 explica les dos vies; **overlay `#twitts-pick`** per a la llista curta de l'emergència (D9) |
| `js/main.js` | enganxament automàtic a `runPlaceAllChyrons` i Ctrl+clic 🎯 → `runEmergency` |
| `index.html` | **sense** botó nou: el títol de la DIANA 🎯 explica les dos vies |
| `bin/smoke/fp_probe_twitts.js` | **NOU** · 37 proves pures (#TW/1-37): handles, `wottFields`, puntuació, `isTuit`, `esXarxes`/`pendents`, `sampleTime`, caché, `_isPlaced`/`_covered` |
| `bin/smoke/fp_smoke_build.ps1` | registre dels dos fitxers JS nous + el probe |

Validació: `bin\check_all.ps1 -Only js,smoke`. **`jsx/` intacte.**

## 10 · Revisió 30/10/2026: arbre de decisió (D24-D26)

El pòsit deixa de ser «tuit genèric» i passa a ser el que s'ha de localitzar a la
imatge. `Twitts.runAuto` (final del 🎯) fa exactament este arbre:

```
   Hi ha cap CONVERSA o XARXES-TEXT al BIN?   (ocrItems: arrel + tots els bins)
        |
        NO ──> res a fer
        |
        SI ──> per a cada ítem que NO és al timeline (mateixNom, nom truncat)
                 |
                 +-- TÉ BLOC i TC de fiar (no 00.00)?  ──> _placeByTc: es col·loca
                 |                                        PEL TC, com qualsevol wott
                 |
                 +-- TÉ BLOC i TC 00.00?              ──> _scanTimeline: OCR d'1 frame
                 |    (rastreig dels clips de l'ítem)      per clip → emparellar pel nom
                 |
                 +-- NO TÉ BLOC («és V»)              ──> _rastreigBloc:
                          Gris amb ffmpeg (GrafZonaGris, 2 mostres/s al media)
                          → clip amb placa grisa?
                              SI → OCR → emparellar pel NOM amb el BIN
                                     SI → es col·loca damunt d'eixe clip
                                     NO → queda PENDENT (finestra de selecció amb Ctrl+🎯)
                              NO → res
```

**Ctrl+clic a la DIANA 🎯 (`Twitts.runGris`)**

1. Rastreja el gris del bloc (igual que el pas «és V»).
2. Si el clip del cabezal **continua sense grafisme** → obri la **finestra de
   selecció del grafisme** (`#twitts-pick`, la de D9) i col·loca el triat damunt
   d'eixe clip (importa el movie si no és al projecte).

**Peces noves a `22_TwittsOcr_Logic.js`** (pures, provades a `#TW/65`-`#TW/74`):
`grafFields` (bloc/línia/TC/rol), `tcFiable`, `tcToSec`, `esOcrItem`,
`mateixNom`; i l'orquestració `ocrItems` (substituïx `flotants` al flux, que es
manté per compatibilitat).

**Fora de l'abast d'este canvi:** el wott XARXES amb `V1_10_00.00` continua
entrant a `_placeChyronsByType` com un rètol més (BUG **#210**, `XARXES_TC00`
part 2): el filtre del marcador és el pròxim pas.


## 11 · Revisió 30/10/2026 (2): gris ABANS de l'OCR i congelat de la cua (D27-D28)

**D27 · El gris va ABANS de l'OCR, sempre.** Els ítems **amb bloc sense TC** anaven
directes a `_scanTimeline` (un `Render.snapshot` + un OCR **per cada clip lliure** de
V1: 17 clips = 17 PNG per a un sol tuit, mesurat al TNV V1 del 30/10). Ara `runAuto`
passa **`ambBloc.concat(esV)`** a `_rastreigBloc(..., fallback = true)`: la placa grisa
es mesura amb **ffmpeg** (`GrafZonaGris.detect`: 1 crida per clip, 3 frames de 64x64 de
la franja inferior, **cap PNG**) i només s'exporta el frame dels clips que **tenen**
placa → **1 PNG**. Xarxa de seguretat (`fallback`): si cap clip té placa, o si els
clips amb placa no resolen cap tuit, es fa l'OCR de reserva de la resta (comportament
antic). El 🎯 (`runGris`) **no** passa `fallback`: allà el gris és el criteri.

**D28 · Si el clip de V1 és més llarg que el movie, CONGELAT del darrer frame.**
`_mediaDur` resol la durada real amb la xarxa de la TRADUCCIÓ
(`Chyrons._tradMediaDur`: DOM del bin CHY → `Project.itemDuration` → estimació per
MIDA amb la correcció dels ProRes del canal) perquè `Project.itemDuration` pot tornar
0. Amb `dur − mediaDur ≥ 0,12 s`, `_placeAmbCongelat` crida
`Chyrons._freezeZone` (zona de programa BUIDA, per a l'ALPHA del grafisme) +
`Chyrons._freezeTemaTitol` (clip temporal → captura → PNG al bin CHY estirat) amb
`animSec = mediaDur` i `freezeSec = dur − mediaDur`. Es verifica amb `_cobert` ≥ 95 %
(part viva + congelat) i es restauren els finals dels clips que el JSX haja retallat
(`_restaura`, BUG #206). Si no hi ha zona garantible o el clip viu no s'inserix →
**estirat** com abans + WARN (mai un congelat amb el vídeo de sota a dins).

## 12 · Revisió 30/10/2026 (3): durada EXACTA i cap PNG de brossa (D29-D30)

**D29 · La durada del movie la diu el FICHERO (ffprobe), no una estimació.**
En la 2a prova en viu del TNV V1 (30/10) el clip viu va acabar **±16 frames** després
del final real del movie (≈9 % de més en un movie de 7 s). `_mediaDur` només podia
estimar per MIDA (`Chyrons._tradMediaDur` × 0,9548 × 0,995), calibrada amb els ProRes
422 HQ **opacs** del canal (45,56 MB/s), i els movies de tuit són ProRes **amb ALPHA**
(ProRes 4444), amb més bitrate → estimació llarga → `Clips.endCoherent` allargava el
clip viu. Ara l'ordre és **1) `Logic.FFmpeg.getMediaDuration(path)`** (ffprobe del
fitxer; el mateix àtom que `Titol·Petit` per al revers) → 2) `Project.itemDuration` →
3) estimació per mida (a últim recurs, **avisant al log**). El resultat es porta a la
rejilla de frames amb `_snapDur` (25 fps, frame més pròxim) perquè Premiere col·loca
en frames sencers. `_placeAmbCongelat` **mesura** a la pista on acaba la part viva i
ho diu al log (`🧷 … exacta`, `±N frame/s`); no retalla res.

**D30 · Un sol PNG temporal i se suprimix tot seguit.** `C:\temp` tenia **17
`fp_twitts_<n>.png` (10,3 MB)** per a un sol tuit i un sol bloc, perquè el nom portava
l'índex del clip i només es borrava el propi ABANS de capturar-lo. Ara `pngPathOf`
dóna **un sol fitxer** (`C:\temp\fp_twitts.png`, segur perquè `scanClips` va clip a
clip amb `await`) i `ocrClip` el suprimix **després** de llegir-lo (`_netejaPng`, amb i
sense `.png`) → residu 0. Els `freeze_*.png` de `Snapshots\` **no** es toquen: són el
media del clip del congelat dins del timeline.

