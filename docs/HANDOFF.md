# HANDOFF · FAST >>> PASS

> **Foto de traspàs, no font de veritat.** L'estat de cada bug i de cada implementació viu
> **només** a [`BUGS.md`](../BUGS.md) i [`FEATURES.md`](../FEATURES.md), i els canvis de codi a
> [`docs/CHANGELOG.md`](CHANGELOG.md). Este fitxer es **reescriu** en cada traspàs: si algo no
> coincidix amb els catàlegs, manen els catàlegs.
>
> **Un sol handoff.** Prohibit tornar a crear diaris a `.roo/`, `plans/HANDOFF_*` o llistes de
> pendents a `INFO/` (històric fusionat a [`docs/archive/`](archive/), 2026-11-06).

**Últim traspàs:** 2026-11-10 · **Versió del codi:** 0.9.8 · **Branca:** `main` (commits locals `b282ac9` + `42ebb97` (#258) + `3763848` (#259) + `3738404` (#260) + `7e7dd63` + `0bc166a` (#261) + `3755f13` (tancament del bloc SINT) + `4f034a4` (tancament del #257), **pujats a `origin` el 10/11** amb `E:\PortableGit\bin\git.exe` (`6b6b8c3..3755f13 main -> main`); el `git-remote-https` del PATH fallava amb 128, el de PortableGit **sí que puja**)

---

## 1 · Estat del codi (no de les tasques)

| Què | Valor |
|---|---|
| Versió de l'extensió | **0.9.8** a `CSXS/manifest.xml` (bundle + panell), títol d'`index.html`, `package.json` |
| Validació vigent | `ALL GREEN \| setup 35/35 \| js 65/65 \| smoke 1043/1043 \| dead 0 \| jsx intacte` |
| `.jsx` | **0 fitxers tocats** en esta tanda (segell de `check_all` intacte) |
| Branca | `main` net, sense ahead/behind |
| Git | `E:\PortableGit\bin\git.exe` (**no** està al `PATH`) |

## 2 · Què s'ha fet en este traspàs

> **Última entrada (2026-11-10 g · BUG #262: l'eix de l'editor ven del clip del MP4 a V1).**
> Report de l'usuari: «en tallar o trimear V1 a mitjan edició, els subtítols i la WF es desplacen i
> ja no quadren amb el habla, encara que recarregue el SRT». L'eix (`_axisOrigin` = media que cau al
> TL 0) eixia de `segs[0]`, i amb el tag del MP4 sense coincidir (`mode='v1'`) `segs` porta **tots**
> els clips de V1: el primer podia ser un rètol o un altre material —i quin clip ocupa primer la
> pista canvia quan es talla—, així que la WF i els subtítols (en media del MP4) es desplaçaven
> respecte del clip. ARA: si el tag no ha filtrat, es tria el **material de referència** de tot el
> mapa (el nom que suma més durada: el MP4) i després la pista —V1 si el material hi és—, i al final
> el clip **que ocupa el TL 0** (`s <= 0,02`). L'eix seguix sent
> `m − s`. Proves noves: `#F3/107`–`#F3/110`; smoke 1039 → **1043**. Pendent de **validar en viu**.
>
> **Entrada anterior (2026-11-10 f · BUG #257 TANCAT per decisió de l'usuari).** Ordre rebuda:
> «Cierra 257». **No hi ha canvi de codi**: el 09/11 ja es va mesurar amb els fitxers reals i el codi
> real que l'editor **no perd cap clip** en importar el SINT (85 entrades → 85 clips) i que la pèrdua
> de text que es veia («acaba en punt i el següent comença en minúscula») és dins de l'ASR, fora de
> l'abast del panell. Es queda el blindatge d'eixe dia: la vista SINT no restaura marcadors de
> l'oficial, no aplica `_applyAllMarkers()`, no en desa al disc i el clic dret no crea ni esborra
> marcadors. Catàlegs al dia: **21 pendents · 159 resolts/tancats**.
>
> **Entrada anterior (2026-11-10 d · BUG #261): els clips del VORE del buit ja no es perden.**
> Report de l'usuari: «después de borrar clips y rellenar con SINT, falta uno al principio y uno
> al final», amb la seua proposta textual: «buscar específicamente el último que tenemos (antes
> del hueco) … y colocar el resto de clips SINT, hasta añadir el último, que debería coincidir
> con el primer clip (después del hueco)». CAUSA: `mergeSyntheticGaps` triava els sintetics per
> **solapament temporal** amb el buit; el clip del vore que el mapa d'eixos deixava just fora (o
> que només hi queia a un 25 %, que és el que descartava `minOverlapRatio`) eixia com a «solapa»,
> i `fitClipsToGap` **retallava la cua** si no hi cabien amb la durada mínima. SOLUCIÓ: (1)
> **àncores de vora** (`opts.anchorEdges`, per defecte sí) — per a cada buit es busca al SINT la
> frase que coincidix amb el clip oficial ANTERIOR i amb el SEGÜENT (`_sintIdxByText`, amb
> tolerància `textNearSec` perquè una repetició llunyana no es confonga amb l'àncora) i s'**unix**
> al criteri temporal el RANG d'entrades ENTRE les dos (exclusiu), caiguen on caiguen en el temps;
> si falta una àncora, eixa vora es tanca per temps (`edgeGraceSec` 2 s); si el SINT no compartix
> CAP frase amb el normal (`anyAnchor`) no s'inventa res. (2) `fitClipsToGap` accepta
> `squeezeDurSec` (l'editor passa 0,12 s): s'apreten tots abans de retallar-ne cap. Política
> acordada: **preferim sobrar un clip (traure'l és fàcil) que quedar-se sense ell**; això revisa
> #224-b (el clip que només toca la vora ara SÍ que entra si el SINT el té entre les dos àncores).
> Proves noves `#F3/103`–`#F3/106` (i `#F3/72` reescrit). `index.html` passa a
> `10_Srt_Logic.js?v=27` i `srt_editor.js?v=97`. **TANCAT EN VIU el 10/11** («Ahora hace
> exactamente lo que quería»): amb eixa prova queden tancats **#261** (validat en viu) i, en
> cascada per decisió de l'usuari, **#224**, **#224-b**, **#224-c**, **#259** i **#260**.
> Catàleg: **22 pendents · 158 resolts/tancats**; `FEATURES.md` passa el reompliment a §1.1
> (`SRT_SINT_FILL`, `resolt`) i deixa **9** pendents de validar. **Següent**: #256, #257 i #258
> (altres fluxos del SINT/editor, sense prova en viu encara).
>
> **Entrada anterior (2026-11-10 c · BUG #260): el clip SINT conserva el ROIG en editar-lo.**
> Report de l'usuari: «cuando ya se han colocado [los SINT], si intentas editarlos cambian de
> color de rojo a verde, como los normales … quiero que quede claro cuál es su origen».
> CAUSA: totes les reconstruccions de la taula creaven entrades **NOVES sense la marca `sint`**
> —`SrtParser.scaleSegmentWithGaps` (el warp de marcadors), `applyTrimIn`/`applyTrimOut`/
> `applyTimeAdjust` (botons IN/OUT/AJUSTAR) i les còpies de `_applyAllMarkers`/IN/OUT/AJUSTAR de
> `js/editor/srt_editor.js`—: el clip perdia el color d'origen i, de passada, deixava de comptar
> com a sintètic a `_baseForMeasure`. A més, en **seleccionar-lo** es pintava amb el vel de la
> vista (`st.sel`). SOLUCIÓ: la marca `sint` viatja amb l'entrada (helper `_entryCopy` a l'editor
> + `if (x.sint) y.sint = true` a la lògica pura) i el SINT té vel de selecció **roig** propi
> (`selSint: rgba(255,64,64,0.42)`): el roig és estable sense editar, editat i seleccionat.
> Decidit amb l'usuari: **roig sempre** (els normals de la vista MOD continuen verds). Proves
> `#F3/98`–`#F3/102`. `index.html` passa a `10_Srt_Logic.js?v=26` i `srt_editor.js?v=96`.
>
> **Anterior (2026-11-10 b · BUG #259): els clips SINT ja no es perden «un sí, un no».**
> L'usuari: «necesito que encuentres donde desaparecen los clips de subtítulos de los SINT…
> Parece que se colocan en el timeline del editor de subtítulos, uno sí, uno no». **No era ni el
> parser ni el warp** (el #257 ja va mesurar 85→85): era el filtre anti-duplicat de
> `SrtParser.mergeSyntheticGaps` (`js/logic/10_Srt_Logic.js`), que preguntava
> `_overlaps(cand, prev, tol)` amb **`tol` = 0,2 s** i `_overlaps` compta com a solapament el
> **simple contacte**. Els subtítols consecutius d'un SINT van pegats o a 3 frames (0,12 s) →
> dins d'un buit la meitat es declaraven «duplicat». **Mesurat amb el SINT real del 09/11**
> (`…\SRT_SINTETICS\TN_MIGDIA_V3_intro__QUI_ES_LATACANT…_Subtitles.srt`): 85 entrades,
> **0** parells realment solapats i **70 dels 84** parells consecutius dins de la tolerància.
> Reproducció amb el codi real (proves `#F3/96`/`#F3/97`): 6 frases seguides dins d'un buit →
> **3 de 6** vell vs **6 de 6** nou. Ara només és duplicat si se solapen de debò
> (`ovSel > 0` i ≥ 50 % de la durada del més curt) o si el text és el mateix.
> `index.html` passa a `10_Srt_Logic.js?v=25`.

1. **#252 · El MAIN tornava a «recordar» la data d'ahir després del RESET** — report de
   l'usuari: «cuando reseteamos un proyecto de ayer, la selección del botón MAIN parece
   recordar esa fecha … si no hay Ctrl, el botón MAIN siempre es de fecha de hoy». Era una
   **regressió de #251**: el RESET desava `workTarget='yesterday'` + `workTargetDay` perquè
   MAIN recreara a la carpeta d'ahir. Ara `runReset` deixa el panell en **HOY**
   (`dateDir`/`projectDateDir` a `null`, `workTarget='today'`, `workTargetDay=null`),
   `checkContext` recalcula amb `_targetDateDir()` i el botó MAIN és el bloc d'avui; si el
   bloc esborrat era d'un altre dia, el log diu que es recrea amb **Ctrl+clic**. Guard `#RESET/5`.
2. **#253 · RESET lent (2 voltes)** — reports de l'usuari: «reset tarda muchísimo para ser un
   simple borrado de un directorio» i, en la 2a, «el reset es lentísimo! mira el log actual».
   (a) `Utils._rmTreeProc` (`js/core/utils.js`) feia **dos recorreguts sencers de l'arbre al NAS**
   per RESET (`attrib -R -S -H /S /D` i desprès `Remove-Item -Recurse -Force`, que a més va peça
   a peça pel proveïdor de PowerShell): ara la via ràpida és **`[IO.Directory]::Delete($p,$true)`**
   (natiu, un sol recorregut) i `attrib`/`Remove-Item` queden **de recanç**. (b) El log del 09/11
   (`Tancament 863 ms · esborrat 60 166 ms`) va mostrar que els 60 s **no eren el borrat**: era
   `_waitGone` mirant el disc **sense reintentar** (el guió només feia un reintent de 400 ms); ara
   el guió reintenta DINS del mateix procés (12 × 600 ms; `attrib` als intents 2 i 6; `Remove-Item`
   com a últim recurs), ix així que la carpeta desapareix, deixa rastre a `_wipe_trace.log` (bufat
   al log amb `_logWipeTrace`: diu **QUIN fitxer bloqueja** i amb quin error) i el marge de fora
   baixa a **30 s** (només compta si el borrat falla de debò). `delay` post-`close()` 700 → 400 ms.
   Log: `⏱️ [RESET] Tancament X ms · esborrat Y ms (motor proc)`. Laboratori: 41 fitxers + 1
   bloquejat 4 s → **3,8 s en local i 3,9 s al mateix NAS**. Guards `#RESET/6` i `#RESET/7`.
   Cache-busts: `utils.js?v=34`, `flow_mainButton.js?v=51`.
3. **#251 · 🔄 RESET = TANCAR I ESBORRAR (ja NO recrea)** — decisió de l'usuari: «Vamos a
   olvidarnos de recrear con el boton reset. Que solo cierre el proyecto y borre el directorio.
   Que el usuario recree el proyecto con el boton MAIN». `runReset`
   (`js/workflows/flow_mainButton.js`) tanca el projecte, esborra la carpeta (`wipeFolder` +
   `wipeMarkersForProject`) i comprova amb `_projOnDisk` que no hi queda cap `.prproj` ni
   `.prproj.lock`; el panell diu «RESET fet: carpeta buida. Prem MAIN…». Codis morts
   retirats: `_countPrproj`, `_waitProjectCreated`.
4. **#250 TANCAT** (validat en viu per l'usuari, 09/11: «Bug 250 CIERRALO. Todo OK»): un ítem
   aliè al bloc ja no es clava al 00:00 (`_potOcuparElZero`) i `F8·Separació` té nivell `inici`.
5. **Icones SRT 📥/➡️ tancades** per l'usuari («Los iconos son perfectos. Cierra el caso»).
6. **Lentitud del RESET**: el gruix era `_runNew` (FOTO 180 s + `_fullScan` del NAS), fora amb
   #251; el doble I/O al NAS, fora amb #253(a); i els **60 s d'espera sense reintentar** (el que
   es veia al log: `esborrat 60 166 ms`), fora amb #253(b).
7. **#254 · Les traduccions PISAVEN els clips del costat (TNM V3 08/11)** — report de
   l'usuari: «se colocan un montón de traducciones … en el proceso pisa clips que se han
   colocado con anterioridad, justo en el siguiente corte y en el mismo track». Causa:
   `Clips.insert` és un `overwriteClip` de la **durada completa del mèdia**; el
   `Clips.endCoherent` posterior retalla el clip al slot, però el material de davall ja
   s'ha esborrat → quan el mèdia passava del slot (o no s'havia resolt i l'insert escrivia
   els ~5 s per defecte del still) s'enduia el **cap del clip del següent tall de V7**.
   Solució (`flow_chyrons.js` `?v=102`): (a) **prevenció** amb `_apartarVeinsTrad` /
   `_tornarVeinsTrad` (el veí es mou a una zona morta abans de l'insert i torna exacte amb
   `moveToRange` invers, `try/finally`, contingut intacte); (b) **xarxa**:
   `_repararClipsV7` ara sempre al final i els slots propis marcats `ours: true`.
8. **Catàlegs quadrats**: `BUGS.md` = **22 pendents · 152 resolts/tancats** (contadors = files
   reals); `FEATURES.md` = 40 / 9 / 7 / 3. `smoke 984 → 1000` (6 asserts `#254`, 6 `#255` i 4
   `#256`), i `.clinerules` + `bin/check_all.ps1` actualitzats. Cache-bust `flow_chyrons.js?v=104`.
9. **#254 TANCAT** (validat en viu per l'usuari, 09/11: «Cierra el BUG 254, va perfecto»): les
   traduccions ja no pisen ni retallen els clips del següent tall de V7.
10. **#255 TANCAT** (validat en viu per l'usuari, 09/11: «Cierra el 255, es perfecto»): la DIANA
   ja no importa el conductor del NAS si és al bin «Conductors». Causa: `_ensureConductorInProject`
   (`flow_chyrons.js`) resolia el nom amb `FASTPASS.Project.items('')`, que **només llig l'ARREL**
   (l'àtom de `jsx/modules/3_Project.jsx` no és recursiu) → els `.mov` del bin **«Conductors»** no
   es trobaven mai i cada passada llanceva `utils.importList` (~200 MB per xarxa + fins a 20 s de
   sonda). Solució 100% JS: ARREL (camí ràpid) → **bins de 1r nivell** amb l'àtom existent
   `Logic.TwittsOcr.binsDe` («Conduct*» primer, s'atura al primer encert) → i només si no hi és
   enlloc, el recés del NAS de sempre. El recurs «qualsevol Conduct*» usa el **pool** arrel+bins
   i `namesOf` descarta `type === 2` (un bin no és media insertable). Guard: 6 asserts `#255`.
11. **#256 · El congelat del titulillo es capturava DOS voltes per bloc** — report de l'usuari:
   «veo que hacemos 2 veces el congelado del título pequeño … con 2 Tema-Títol … son exactamente
   el mismo … podríamos ahorrarnos el segundo freeze». `_fillTitulilloGaps` cridava
   `_freezeTitulilloStill` per cada buit i eixa funció **sempre** feia insert temporal + captura
   QE + `IO.importFiles` → 2 PNG duplicats del MATEIX frame al bin CHY. Solució 100% JS
   (`flow_chyrons.js` `?v=104`): cache `_stillCache` (clau = mèdia del titulillo) que reutilitza
   el PNG ja importat, col·locació NO destructiva extreta a l'àtom nou **`_placeStillAt`** (la
   comparteixen el camí de captura i el de reutilització) i **autocorrecció** (si l'entrada del
   cache no es pot col·locar, s'oblida i es re-captura). Log `♻️ … CONGELAT ja estava capturat`.
   Guard: 4 asserts dinàmics `#WOTT/75-78` + `#171` adaptat a la delegació. **Pendent de la prova
   en viu**: amb 2 Tema-Títol al bloc, el segon congelat ha de nàixer sense captura (`♻️` al log).

12. **#224-c · El 🧩 «resucitava» els clips esborrats** — report de l'usuari: «he eliminado unos
   cuantos clips de los subtitulos (en el editor) y al clicar en el puzzle … han aparecido algunos
   clips que habia eliminado». **No era error seu**: `mergeSyntheticGaps` llegia la base de
   `_views['NORMAL']` (instantània que només es desa al canviar de vista) i `deleteSelected` només
   edita la taula VIVA → la fusió partia d'una còpia vella i tornava els clips esborrats (i perdia
   les edicions fetes a la vista MOD). Ara **`_baseForFill()`** mana la taula viva (NORMAL o MOD) i
   **`_baseForMeasure()`** mesura (frases en comú, Δ i mapa per ancles) contra l'oficial **sense**
   les entrades `sint` —una sintètica no pot fer d'àncora contra si mateixa—, i `deleteSelected`
   refresca la instantània de la vista viva. De pas (UI que va demanar l'usuari): la **forma d'ona
   passa a BLAU** (`#2f9bff` sobre `#0b1e2e`) perquè era verda com els clips de la vista MOD
   (`_trackStyle`) i no es distingia la silueta d'un clip. Proves `#F3/76`, `#F3/77` i `#F3/78`
   (funcional sobre `Editor.SrtEditor`), `srt_editor.js?v=92`. **Pendent de la prova en viu**:
   esborrar 2-3 clips, prémer 🧩 i comprovar que NO tornen.
13. **#257 · El SINT «perdia» clips a l'editor: NO és l'editor, el sintètic ja ve així** — report de
   l'usuari: «parece que se come 1 de cada 2 clips … el clip anterior acababa en un punto y el
   siguiente no comenzaba con mayúscula … ¿puedes comprobar si ocurre en el srt original del tramo
   que he importado al editor?». MESURAT amb el codi REAL (probe headless d'Edge: `10_Srt_Logic.js`
   + `srt_editor.js`; en este equip no hi ha `node`): el SINT `TN_MIGDIA_V3_…_Subtitles.srt` té
   **85 entrades** i `_applyAllMarkers()` en deixa **85/85** en quatre escenaris de marcadors (cap,
   els 10 de l'oficial, els 5 guardats amb nom de SINT i el mixt) → **cap clip perdut**. El contingut
   tampoc no falta: **106 % de les paraules** de l'oficial del mateix trampa (326 vs 309) i el patró
   «punt + minúscula» és **més freqüent als SRT oficials** (38-48 %) que als SINT (32-36 %). La
   pèrdua real és **de paraules de l'ASR** dins d'algun clip (generador extern, fora del panell).
   BLINDATGE: en vista SINT **no es restauren** els marcadors del SRT oficial ni s'aplica
   `_applyAllMarkers` (`sintView`), `_persistMarkers` no desa res i el clic dret no crea/esborra
   marcadors (`#F3/79`–`#F3/81`). **UI**: WF més fosca i menys amplificada (`#071320` / `#1f6fb5`,
   `_waveformGain` 2,8 → **1,8**) i clips SINT **en ROIG** (`#F3/82`, `#F3/15` i `#F3/76`
   actualitzats), `srt_editor.js?v=94` · **smoke 1021/1021**.
   **2a part (09/11, demanada per l'usuari: «cuando se cierra un proyecto o se resetea unos
   subtítulos, los marcadores deberían borrarse (el archivo)»)** — els `fastpass_srt_markers_*.json`
   ja **no es buiden: S'ESBORREN** (`SrtEditor._deleteFiles` → `cep.fs.deleteFile`), i
   `wipeMarkersForProject` neteja **també els de DINS de la carpeta del projecte** (abans només
   `C:/temp`: per això el `.json` del SINT seguia al V3). El ♻️ RESET crida
   `wipeMarkersForProject(ed._projectKey)` i en carregar un SINT s'esborra el seu propi `.json`.
   `srt_editor.js?v=94`, `flow_srt.js?v=21` · proves `#F3/83`–`#F3/88` (una d'elles funcional amb
   `cep.fs` simulat) · **smoke 1021/1021**. Pendent de validar en viu: prémer ♻️ RESET amb un SINT
   obert i comprovar que a la carpeta del projecte no hi queda cap `fastpass_srt_markers_*`.
14. **#258 · Els marcadors s'anclen al CLIP ORIGINAL** — report de l'usuari: «los marcadores se
    referencian solo al timeline … deberían ir referenciados al clip en el fichero original».
    El marcador era només un número en segons i el pareo original→actual es feia **per orde**
    (`k = min(O,C)`), així que un marcador creat enmig d'un clip desplaçava totes les anelles
    següents (error acumulatiu). Ara cada marcador és `{num, clip ancla, edge in/out, orig}` a
    **`_markerAnchors`** (alineat 1:1 amb `_markers`/`_originalMarkers`):
    `_nearestClipEdge` (l'extrem del clip, no el TC del clic), `_addMarker`, `_sortMarkers`
    (ordena les tres llistes alhora), `_removeMarkerAt`, `_remapAnchorsAfterDelete` (esborrar un
    clip reindexa les ancles) i `_refreshOriginalFromAnchors`, que `_applyAllMarkers` crida abans
    de cada warp → **idempotent**. `_markersPayload`/`_restoreMarkers` guarden i tornen `anchors`
    + `nextNum` (un JSON vell sense `anchors` es tracta com a marcadors lliures). També adaptats
    `applyIn`/`applyOut`/`applyAdjust`, `mergeSyntheticGaps`, la instantània de vista i el RESET.
    `srt_editor.js?v=95` · proves `#F3/89`–`#F3/94` · **smoke 1027/1027**.


## 3 · Com es treballa ací (resum operatiu)

Llig **[`.clinerules`](../.clinerules)** sencer abans de tocar res. Els quatre punts que més es
incomplixen:

- **Validar amb UNA ordre**: `bin\check_all.ps1` (selectiva: `-Only js,smoke`, `-Only setup`,
  `-Only dead`). Redirigix a `%TEMP%` i llig només `ALL GREEN` / `FAIL` / `exit=`.
- **`jsx/**` és intocable** sense permís explícit de l'usuari, i mai «de passada».
- **UTF-8 sense BOM** sempre. I atenció: un `.ps1` **sense** BOM, PS 5.1 el llig com a ANSI →
  qualsevol literal accentuat eixirà **mojibake** al fitxer que escriga (bug real, vore §5).
- **Bug nou → `BUGS.md`** (número + una línia); **implementació → `FEATURES.md`**; **codi →
  `docs/CHANGELOG.md`**. Cap més llista de pendents.

## 4 · On està cada cosa (índex, no estat)

| On | Què hi ha | Quantes |
|---|---|---|
| `BUGS.md` **§1.1** | Bugs **amb codi o diagnòstic**, pendents de validar en viu | 20 |
| `BUGS.md` **§1.2** | Noves sense diagnòstic ni codi | 0 |
| `BUGS.md` **§1.3** | Decisions pendents de l'usuari | 2 (`#116`, `#242`) |
| `BUGS.md` **§2** | Resolts i tancats (orde cronològic) | 159 |
| `FEATURES.md` **§1** | Implementacions validades | 41 |
| `FEATURES.md` **§2** | Implementades, **pendents de validar en viu** | 9 |
| `FEATURES.md` **§3** | En cua / per implementar | 7 |
| `FEATURES.md` **§4** | Descartades per decisió | 3 |

Els 20 de `BUGS.md` §1.1 (per número): `#262`, `#258`, `#256`, `#212`, `#210`, `#209`, `#206`, `#205`,
`#197`, `#202`, `#232`, `#233`, `#237`, `#235`, `#236`, `#239`, `#241`, `#245`, `#249`, `#234`.
Els 7 de `FEATURES.md` §3: `XARXES_TC00`, `NNEWS`, `MARKERS_INVARIANT`, `SRT_GUARD`,
`JSON_DIETA`, `AUDIO_IA_DEREVERB`, `OCR_FRAME_CABEZAL`.

## 5 · Trampes conegudes (per no perdre una hora)

1. **Mojibake fantasma**: la consola és CP850; `Get-Content` i `Select-String` sense
   `-Encoding UTF8` mosseguen accents. Comprova sempre amb
   `[System.IO.File]::ReadAllText($p,(New-Object System.Text.UTF8Encoding($false)))` i busca
   `Ã` / `Â§` / `U+FFFD`. Un `.ps1` generador sense BOM *sí* corromp el que escriu.
2. **`FASTPASS.version()`** (`jsx/main.jsx:64`) → `app.version` de Premiere. **No** és la versió
   de l'extensió: no la canvies per a «pujar la versió».
3. **`?v=NN`** de l'`index.html` són **cache-busters** de càrrega (cal apujar-los quan es canvia
   un `js/**`), no versions.
4. **Primera línia d'un fitxer de text de Premiere**: respectar BOM/CRLF originals; mai
   «normalitzar» un `.jsx`.
5. **Git**: `E:\PortableGit\bin\git.exe`. Missatges de commit **en ASCII** (l'àmbit del repo és
   UTF-8, però el commit des de PowerShell 5.1 trenca accents).
6. **`check_all` diu `jsx MODIFICAT (n)`** → atura't i pregunta; no hi ha re-sell sense validar.

## 6 · Prompt per a la següent conversació

Copia-ho tal qual en obrir el fil nou (substituïx `<TASCA>`):

```
Projecte: FAST >>> PASS (extensió CEP per a Premiere Pro)
Ruta: c:\Users\gonz_agu\AppData\Roaming\Adobe\CEP\extensions\FAST_PASSS
Llig PRIMER, en este orde: .clinerules, docs/HANDOFF.md, i després BUGS.md / FEATURES.md per rangs (no els llisques sencers).
Regles que no es poden trencar:
 (1) BUGS.md i FEATURES.md són l'ÚNICA font de veritat de l'estat: no crees cap altra llista de pendents ni cap HANDOFF/SESSION nou (el traspàs viu només a docs/HANDOFF.md);
 (2) jsx/** és intocable sense el meu permís explícit, i mai "de passada";
 (3) valida sempre amb bin\check_all.ps1 (o -Only js,smoke / setup / dead), mai les 4 proves per separat, i digues-me només la línia ALL GREEN;
 (4) codi i documentació en català, parla'm en espanyol; UTF-8 sense BOM;
 (5) git està a E:\PortableGit\bin\git.exe; missatges de commit en ASCII.
Estat conegut: versió 0.9.8, branca main neta (= origin/main), ALL GREEN (setup 35/35 · js 65/65 · smoke 1015/1015 · dead 0 · jsx intacte).
Cua: 20 bugs per validar en viu (BUGS.md §1.1), 10 implementacions per validar (FEATURES.md §2), 7 per implementar (FEATURES.md §3), 2 decisions meues pendents (BUGS.md §1.3).
TASCA D'ARA: <TASCA>
No toques res fins que et confirme què has entés del handoff i quin és el primer pas.
```

## 7 · Historial de traspassos

| Data | Què es va tancar | Commits |
|---|---|---|
| 2026-11-09 (5) | **#257, 2a part**: els fitxers de marcadors **s'esborren de debò** en resetejar o plegar (`_deleteFiles` → `cep.fs.deleteFile`; abans es deixaven BUITS dins del projecte) i `wipeMarkersForProject` neteja també els de DINS de la carpeta del projecte — el ♻️ RESET els esborra tots i en carregar un SINT s'esborra el seu propi `.json` · proves `#F3/83`–`#F3/88` · `srt_editor.js?v=94`, `flow_srt.js?v=21` · smoke 1021/1021 | — |
| 2026-11-09 | #253 **tancat i validat en viu** («Ya va perfecto»: RESET ràpid amb `[IO.Directory]::Delete` + reintents DINS del procés i rastre `_wipe_trace.log`) · **#254** obert i corregit (les traduccions ja no pisen el clip del següent tall de V7: `_apartarVeinsTrad` / `_tornarVeinsTrad` + `_repararClipsV7` sempre amb `ours`) · #252 (el MAIN ja no recorda la data d'ahir després del RESET: panell en HOY) · #251 **tancat** (el 🔄 RESET ja NO recrea: tanca i esborra; la recreació passa al botó MAIN) · #250 i les icones SRT **tancats per l'usuari** · **#254 i #255 tancats** (validats en viu) · **#256** corregit (el congelat del titulillo es captura una sola volta) · smoke 1000 | (sense commit encara) |
| 2026-11-09 (2) | **#224-b** corregit (pendent de validar en viu): el `.srt` del projecte només el fixa el NORMAL (`_viewPath`/`_viewName` per al fitxer que es veu) i el 🧩 col·loca amb **mapa per ANCLES** (`SrtParser.mapAnchors`, interpolat, sense extrapolar) en compte d'un Δ constant → `_applySintAlignment` ja no desplaça el SINT i `srtSyntheticGapSec` s'ha suprimit · **smoke 1008** (`#F3/68`–`#F3/75` nous; `_pickSintForFill` accepta per ancles; `?v=` pujats + 4 proves de cache-busts actualitzades) | (sense commit encara) |
| 2026-11-09 (4) | **#257 diagnosticat** (no és l'editor): probe headless amb el codi real → el SINT `TN_MIGDIA_V3_…` carrega **85/85** entrades i porta el **106 % de les paraules** de l'oficial del mateix trampa; el patró «punt + minúscula» és més freqüent als SRT oficials (38-48 %) que als SINT (32-36 %) → la pèrdua és de paraules de l'ASR del generador extern. Blindatge: la vista SINT no restaura/desa marcadors del SRT oficial ni aplica el warp (`sintView`, `_persistMarkers`, clic dret) · proves `#F3/79`–`#F3/81`. **UI**: WF més fosca i menys amplificada (`#071320`/`#1f6fb5`, gain 2,8 → 1,8) i clips SINT **en roig** (`#F3/82`, `#F3/15`, `#F3/76`). `srt_editor.js?v=93` · smoke 1015/1015 | — |
| 2026-11-09 (3) | **#224-c** corregit (pendent de validar en viu): el 🧩 ja no resucita els clips esborrats — la base de la fusió és la taula VIVA (`_baseForFill`) i la mesura descarta les entrades `sint` (`_baseForMeasure`), i `deleteSelected` refresca la instantània de la vista. De pas, la **WF passa a blau** (`#2f9bff` sobre `#0b1e2e`) perquè es confonia amb els clips MOD verds. Proves `#F3/76`–`#F3/78` · `srt_editor.js?v=92` · smoke 1011/1011 | — |
| 2026-11-06 | #224 (REOMLIR) implementat · #226 descartat · versió 0.9.8 · catàlegs quadrats · handoffs fusionats a `docs/archive/` | `16b29fa` · `26af9d3` · `70e9828` · `125ca54` |

