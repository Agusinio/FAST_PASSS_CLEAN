# BUGS — catàleg únic

> **Únic lloc** on viu l'estat dels bugs. Actualitzat: **2026-10-29**.
> Les funcionalitats i implementacions viuen a [`FEATURES.md`](FEATURES.md).
>
> El text llarg de cada bug resolt (símptoma complet, causa arrel, solució i fitxers tocats)
> es va retirar el 27/10 per orde de l'usuari: queda a l'historial de git
> (`git log -p ce18186 -- docs/BUGS_FIXED.md`). Ací hi ha el resum operatiu de tots.

**Resum**: 19 pendents · 134 resolts/tancats.

---

## 1 · PENDENTS (19)

| Nº | Estat | Què passa |
|---|---|---|
| **#208** | **Corregit** (29/10) · pendent de validar en viu · 100% JS (`jsx/` intacte) | **La finestra del Ctrl+clic a la DIANA no ensenyava els tuit que s'exporten A MÀ**: al clip del tuit de Salvador Illa la llista no tenia ni `wott x salvador illa.00666202.mov` ni `wott x salvador illa1.00666204.mov` (tampoc `wott_v3 x pedro.00666211.mov` pel clip de Pedro Sánchez), tot i ser a `rutas.chyrons`. Causa arrel: `esXarxes` (D13) només reconeix el rol `XARXES`, la marca `LUCYS` o el bloc a seques `_V_00_00.00_`; la família `wott x <nom>` no encaixa enlloc → `_dayMovies` la descartava **abans de datar-la** i la llista eixia sense eixos fitxers. SOLUCIÓ (D22/D23 de [`docs/specs/TWITTS_OCR.md`](docs/specs/TWITTS_OCR.md)): (a) `esXarxes` accepta `^wott(_vN)? x <nom>` (els ròtols corrents `Wott_MAT_v2_105…`/`Wott_TNM_V4_082…` segueixen fora); (b) la finestra **s'ordena per semblança amb el text OCR del clip** (`rankPick`/`semNombre`/`nomNet`: «Salvador Illa» → `wott x salvador illa…` al cap, amb ★punts) i desempata pel **número d'export** (`fileSuffix`, equivalent a l'hora de creació); (c) **cercador** `#tw-pick-q` que filtra en viu pel nom (+ comptador, ↑/↓ i ⏎); (d) `_dayMovies` guarda a `other` el que cau en un altre dia o sense data i l'emergència n'afig els 20 exports més recents (etiqueta «altre dia»), perquè un tuit exportat a les 00:30 no desaparega. Validat: **ALL GREEN \| js 64/64 \| smoke 665/665 \| jsx intacte** (casos nous `#TW/55`-`#TW/64`). |
| **#207** | **Corregit** (D21) · pendent de validar en viu (29/10) | **Els tuits es col·locaven 2 clips ABANS del que toca**: Feijóo i Nogueras van anar a `33:13`/`36:22` quan els seus clips són `40:07`/`43:08`. Causa: la mostra (D19) s'extraia del MEDIA amb `srcTime` i el frame del clip `36:22` eixia del **contingut del `43:08`** (mapa TC→segon del fitxer no fiable en la V1). Solució: `samplePng` torna a capturar de la **TIMELINE** amb QE (`Render.snapshot` = `exportFrameQE`), ffmpeg només de reserva (spec `docs/specs/TWITTS_OCR.md` §D21) |
| **#193** | R1+R2+R4+R6 **aplicats**; pendent validar R6 en viu + R3/R5 (27/10) | **Inici del bloc i finestres degenerades**: `01dir` havia d'anar a `34,50 s` i va quedar a `0,00 s` amb altres tres marcadors. Causa arrel (6 baules), retocs R1-R6 i rollback a [`docs/specs/FIX_INICI_BLOC.md`](docs/specs/FIX_INICI_BLOC.md) |
| **#191** | Pendent de validar en viu (26/10) | Els wotts amb el bloc **a seques** (`Wott_TNM_V_…`, els `XARXES-TEXT`) ja s'importen, però **no es col·loquen** |
| **#113** | **Reobert** (28/10) · el panell NO és el coll d'ampolla | **Arrencada en fred lenta**: 92,7 s el 22/10 (el 99% era NAS fred dins `checkContext`). **MESURA EN FRED DEL 28/10** (logs del host + `_boot_timing.log`): Premiere (NGL `09:24:57`) → PlugPlug/CEP (`09:25:02,9`) → extensió carregada (`09:25:09,1`) → navegació del panell (`09:25:11`, −548 ms al log) → **ARRENCADA COMPLETA +335 ms**. És a dir: **~14 s entre obrir Premiere i tindre el panell llest, dels quals només ~0,9 s són del panell** (navegació 548 ms + 335 ms); la resta és **arrancada del host CEP/Premiere**, que cap JS del panell pot mesurar (el WebView encara no existix). El sensor de la marca del `<head>` (27/10) ha fet la seua faena: ha demostrat que el temps no es perd al codi. PENDENT: (a) **conservar l'històric** d'arrancades (hui `_boot_timing.log` es REESCRIU a cada arrancada → si el panell es reobri, la mesura en fred es perd) i (b) marcar `primer pintat` — **FET el 28/10**: `_boot_timing_hist.log` (una línia per arrencada amb `arrencada`, `total` fins al primer pintat, `nav→main`, `DCL` i marca `1R DEL DIA`, finestra de 40, a la carpeta de l'extensió i a `C:\temp`) i marca `primer pintat` per `rAF`×2. RESTA OBERT només el tram **host CEP → WebView** (~12 s), que no és instrumentable des del panell: s'ha de creuar a mà amb `%LOCALAPPDATA%\Temp\CEP12-PPRO.log` i els `NGLClient_PremierePro*.log` |
| **#111** | Investigació oberta (29/09) | Els ítems d'escaleta **FLOTANTS** (`flotant:true`) no reben cap marcador; segons la regla de l'usuari n'haurien de portar un de **VERMELL** |
| **#116** | Nota pendent de decisió (30/09) | **Marcador VERMELL DE CUA** que no hauria d'existir: el filtre el descarta bé i la vàlvula de seguretat de `_safePlaceByPrefixes` el torna a afegir |
| **#117** | Nota pendent de decisió (30/09) | **Semàfors trencats sense projecte** per `ReferenceError: mediaN is not defined` a `checkContext` → es perden els semàfors SRT i WOTTS |
| **#196** | **TANCAT** (28/10, validat en viu per l'usuari) | **La finestra de GRÀFICS obri la carpeta del DIA SEGÜENT al del projecte**: ha d'arrancar al directori del dia del bloc (el de l'escaleta). CAUSA ARREL (no era la carpeta inexistent, com es va suposar): `flow_mapa._resolveDateDir()` confiava en `State.projectDateDir`, però el poll d'estat el **desancora a null** al segon cicle sense `Registry.activeProjectName` (evidència al `FASTPASS.log` del 27/10 14:53:35: «🔓 [dateDir] Desancorant projectDateDir=2026_10_27» amb el `.prproj` obert); a partir d'ací la data queia al **RELLOTGE**, i de nit (després de mitjanit) això és el dia següent al del projecte. SOLUCIÓ: `_resolveDateDir` és **async** i la font de veritat passa a ser la **ruta real del `.prproj` obert** (`Context._resolveProjectDateDir`, el mateix criteri del BUG #156/#187 a `flow_srt.js`), amb orde: .prproj → `State.projectDateDir` → manifest (només si **no** és ambigu, un sol dia al cache) → `workTarget='yesterday'` → rellotge amb avís `WARN`; els dos cridadors l'esperen amb `await`. Complement (defensa en profunditat): `_folderExists` (via `IO.exists`) + `_dialogFolder` (carpeta del dia → arrel de `rutas.grafismos` → null amb avís) i `_askFiles` obri amb `_dialogFolder(folder)`, així que mai es passa al diàleg una ruta inexistent |
| **#197** | **Corregit** (27/10) · pendent de validar en viu | **El grafisme no s'inserix al timeline en tota la seua longitud**: un **corte a V1** afecta el seu **Out** (el gràfic s'encongeix). Regla d'usuari: la inserció ocupa la **durada sencera** del gràfic i el tall de V1 **no** és frontera; només el **marcador següent** el pot retallar. Causa arrel: `ci.end` (final del clip de V1) s'usava com a sostre de l'Out i el `Math.min(end2, ci2.end)` el re-aplicava a cada reposicionament. Solució: predicat pur **`_limiteOutChyron({durOwn, placeStart, mkTime, marcadorSeg, clipEnd})`** a `js/workflows/flow_chyrons.js` amb prioritat **marcador següent > durada pròpia > final del clip (últim recurs)**; el `ci2.end` només queda com a fallback si la durada no s'ha pogut resoldre |
| **#198** | **TANCAT** (28/10, validat en viu per l'usuari) | **Tancar el projecte amb el botó verd ha de BUIDAR l'editor de subtítols**: si hi ha un `.srt` carregat, en eixir el panell (i el projecte) ha de quedar net. Solució: `Render._resetSrtForClose(quan)` a `js/workflows/flow_render.js` (idempotent, amb traça al log) cridat **després** de tancar dins `runClose`, que a més ara comprova `res.ok` i avisa si el tancament ha fallat; i `SrtEditor.reset()` reescrit **a prova d'excepcions** (blocs `pas(...)`: si un peta, la resta es neteja igual i el panell SEMPRE acaba ocult) |
| **#199** | Nou (27/10) · en anàlisi | **El botó EXPORT no respecta la posició del clip original de V1**: en inserir els clips nous al final, han d'anar a la posició del clip de V1 original, no al final de la seqüència. **Descartat** (log en viu 14:54) que siga la **Portada**: `runPortada` ja hereta el Motion de l'original (posició `[483,540]` idèntica a la còpia) |
| **#201** | **Corregit** (28/10) · pendent de validar en viu · **derivada de #197** | **Els rètols de NOM-CÀRREC es col·locaven en CADENA i no al seu corte**: a TNC V2 (bloc del 27/10) el rètol de *Miguel Domingo* ocupava tota la seua longitud, però el de *Josep Forés* entrava **al final de l'anterior** en lloc del seu corte (~1:05:01) i havia d'acabar amb el seu **clip de referència** (~1:08:07); a remolc, el de *Lourdes Massip* també entrava tard. CAUSA: el fix de **#197** va fer que `_limiteOutChyron` descartara SEMPRE el final del clip de V1 («marcador següent → durada pròpia del wott»); per als rètols de text això contradiu la regla del 16/09 («entra a +10 frames del clip de referència **i ACABA quan acaba eixe clip**») → el rètol s'allargava i `_chooseSlot` → `_firstFreeStart` desplaçava el següent al final de l'anterior (efecte dòmino). SOLUCIÓ (tot JS, `jsx/` intacte): (a) predicat pur **`_esRetolAcotat`** — s'acoten **NOM-CÀRREC** i les **CONNEXIONS** (Enviat / Directe / Presencial); **LLOC/DATA i FIRMA queden FORA** (decisió d'usuari 28/10 · mantenen la durada pròpia de #197); (b) `_limiteOutChyron` rep **`acotat`**: si és cert mana el **FINAL DEL CLIP de referència** (orde: marcador següent → clip → durada pròpia → final del clip); (c) predicat pur **`_esPrimerClipTimeline`**: el **decalatge de 10 frames** només s'aplica si el clip de referència **obri el timeline** (00:00) — en la resta l'entrada és exacta (l'usuari el veia innecessari); el log `📐` diu els frames reals. 🐞 **Trampa caçada per la prova**: `indexOf('NC_')` feia FALS POSITIU amb «WOTT_**NC_**V2» (codi de programa) i hauria acotat LLOC/DATA i FIRMA → ara és token exacte (`split('_')`). Cache-buster: `flow_chyrons.js?v=86`. Inventari a `docs/specs/CHYRON_OUT_POLICY.md`. VALIDACIÓ: **ALL GREEN | js 61/61 | smoke 533/533 | jsx intacte**. |
| **#200** | **TANCAT** (28/10, validat en viu per l'usuari) · **sense tocar `jsx/`** | **La còpia de la Portada no hereta l'Anchor Point ni la Rotation**: `Anim.get/setMotionValues` (`jsx/`) només exposen posició, escala, escala X i retalls, però **`callJSX()` accepta scripts inline** (mateix patró que `srt_editor.js::_clearSubtitleTracks`) → el pont NO cal tocar-lo. Solució: `_framingJsx`/`_framingProbe`/`_framingApply` a `js/workflows/flow_render.js` busquen el component Motion **pel nom** (`ANCHOR/ANCLAJE/ANCORATGE`, `ROTAT/ROTACI`) amb **fallback als índexs reals** (5 = Anchor Point, 4 = Rotation; el comentari de `_getMotionProps` que diu «2 = Anchor Point» és erroni: l'índex 2 és Scale Width), llig l'enquadrament de l'original al cabezal i l'escriu a la còpia **després** de `setMotionValues`, amb comprovació `Δanchor`/`Δrot` al log |
| **#202** | **Corregit** (28/10) · pendent de validar en viu · **derivada de #197** | **La MÀSCARA quedava TAPADA pel grafisme**: provant en viu `app google tots sant gervasi esvoranc.mov` (paleta 🎨 del 27/10), el grafisme eixia a V3 i deixava la màscara de l'ítem davall. La detecció de zona grisa deia la veritat — foto a SANG: **3,1 %** de `#D9D9D9` (mesurat frame a frame, 1 s: 0,2 % a 1-3 s i 3,1 % de 5 a 15 s; cap franja grisa en tot el clip) → la 1a implementació el deixava a V3. DECISIÓ D'USUARI (28/10): **sempre** s'ha de cortar el troç de màscara de l'ítem i pujar-lo a V3, i el grafisme va a V2 (la mesura del gris passa a ser només INFO al log). SOLUCIÓ (`js/workflows/flow_mapa.js::_placeClips`, tot JS): (a) el moviment de la màscara ja NO depén de `hasGrey`; (b) **neteja prèvia** de les restes del bloc A LES DOS pistes (V2 i V3) abans de moure la màscara, perquè un intent anterior no bloquege amb `DESTI_OCUPAT` ni es confonga amb la màscara; (c) fallbacks intactes: sense rang d'ítem / sense màscara a V2 / V3 ocupada → col·locació de sempre a V3. `jsx/` intacte. **3a volta** (28/10, 2n provat en viu: la màscara ja puja i el grafisme va a V2, però el tall es feia entre **SUB-ÍTEMS**): `_itemRangeAt` passa a acceptar com a frontera només els números de **LÍNIA** d'escaleta (`01i`, `01`, `01dir`, `02dp`, `19C`) i no els sub-ítems (`01p21`, `01p22`…), així que el tall és **de MARCADOR a MARCADOR** (a la seqüència provada: `01i - intro` → `01 - ELS VEÏNS…`, el rang sencer de l'ítem, en lloc de `01p22` → `01p23`); si no hi ha cap marcador de línia es cau a qualsevol número (no es queda sense rang). A més, `_mascaraAParking` desa la **cobertura efectiva** (`cov`) i avisa al log si la màscara de V2 no cobrix tot l'ítem |
| **#203** | **Corregit** (28/10) · pendent de validar en viu · **derivada de #202** | **El grafisme s'inseria al CABEZAL o al MARCADOR SELECCIONAT i no al marcador del seu ítem, i el tall de la màscara quedava 1-2 frames curt del marcador següent**: provant en viu (28/10), amb un altre marcador seleccionat al panell, l'insert eixia a eixa posició; a més el troç de V3 «quasi» arribava al marcador (Premiere arredoniX al frame el `end` de `Clips.retrim`). SOLUCIÓ (`js/workflows/flow_mapa.js`, tot JS, `jsx/` intacte): (a) **`_anchorMarker(picked, cti)`** tria el marcador per **coincidència RELATIVA de nom** entre el fitxer triat i els comentaris numerats («NN… - Nom», sub-ítems inclosos); `_scoreNombre` mesura quina part del nom del marcador es reconeix al del fitxer amb **Dice per bigrames** i **`_normFon`** (B→V, Y→I, C+E/I→S, QU→K, plural -S), així que «app google tots sant gervasi esvoranc.mov» casa amb «01p22 - P2 PAS 1 GOOGLE tots SANT GERVASI ESVORANC» (**0,91**) sense ser exacte; guanya el millor score i, en empat, el més pròxim al cabezal; per davall de **`MATCH_MIN`=0,60** o si el marcador no té clip de V1 es manté el cabezal de sempre; (b) l'àncora és l'**inici de la LÍNIA** del marcador coincident (**`ANCHOR_LINE`**), així el grafisme i el rang de la màscara parlen del mateix ítem (`01i`, no `01p22`); (c) **`_ajustarFiAlMarcador(track, idx, e, b)`** llig el `end` **REAL** amb `Clips.get` i, si no arriba al marcador, reintenta `Clips.retrim` allargant el troç (fins a 3 intents, +0,06 s per cobrir el frame del TC); si el mèdia no en dóna més (`WARN_INVALID`) **restaura** el clip com estava i diu quants segons falten — mai deixa un clip trencat. Cache-buster `flow_mapa.js?v=31`. VALIDACIÓ: **ALL GREEN | js 62/62 | smoke 598/598 | jsx intacte** (casos `#203` nous a `bin/smoke/fp_probe_grafzona.js`, amb `mediaDur` al `retrim` simulat) |
| **#204** | **Corregit** (29/10) · 2 capes · pendent de validar en fred | **El `_boot_timing.log` no mesurava l'espera real i el semàfor WOT es quedava 103 s en verd intermitent («ja importable») sense cap senyal d'activitat**: a l'arrencada en fred del 29/10 (`_keyframe_trace.log`) l'`ARRENCADA COMPLETA` va ser a **+330 ms**, però entre `[SCAN] Analitzant context i materials` (09:02:50) i `[SCAN:wotts] Filtre per data` (09:04:33) van passar **103 s sense una sola línia al `_boot_timing.log`** (i després 7 s de portades i 3 s de `ffprobe`). CAUSA: (a) `_bootClosed = true` a l'ARRENCADA COMPLETA descartava **totes** les `_bmark`/`[SCAN]` del darrere i `_fullScan` no marcava res; (b) eixa espera és `Utils.readFolder` de la carpeta de rètols **UNC via JSX** (`File.created` de 1281 fitxers) → crida síncrona que **bloqueja el fil del WebView**: només l'animació CSS seguia viva, i el WOT estava en `blink` (verd intermitent = «ja importable»). SOLUCIÓ (tot JS/CSS, `jsx/` intacte): (a) **finestra post-arrencada** a `js/main.js` (`_bootPostMs` 3 min · `_bootPostSlowMs` 400 ms): després de l'ARRENCADA COMPLETA només es desen les marques **lentes**, amb prefix `[post]`, i la **primera** deixa línia a `_boot_timing_hist.log` («1a espera post-arrencada») → el rècord ja no pot dir 330 ms si el panell no és lliure fins a 2 min després (`Boot.setPostWindow()` ho ajusta o ho apaga); (b) marques `force` a `_fullScan` (wotts · portades · carpeta del projecte · TOTAL) i a `Scanner.wotts` (carpeta de rètols i filtre per data, amb nº de fitxers); (c) **estat `busy`** del semàfor (`4_Context.setSemaforOcupat`/`setSemaforLliure`, classe `.light.busy` = blau lategant): `_fullScan` el pinta a `sem-wot` abans de tocar el NAS i el restaura al `finally`, amb tooltip «Analitzant els rètols del NAS…». Cache-busters: `main.js?v=95`, `4_Context.js?v=32`, `Scanner.js?v=25`, `flow_mainButton.js?v=39`, `style.css?v=62`. VALIDACIÓ: **js 62/62 · smoke 601/601 · jsx intacte** (casos nous `#BOOT/20`, `#WOTT/55` i `#WOTT/56`). CAPA 2 (29/10) · per què costava 103 s: **no era el NAS**. Mesurat des de .NET (la via nativa que usa CEP, sense Node): `GetFiles` de la carpeta = **1281 fitxers en 2 ms**, `FileInfo` amb `created`+`mtime`+`size` = **3 ms**, 50 `stat` individuals = **7 ms**. El cost estava en **com** es preguntava: `IO.scanDirectory` (JSX) llig `length`, `modified` i `created` de CADA fitxer (cada getter és una consulta SMB dins del motor d'ExtendScript) i, si `length` ve 0 (habitual en .mov per UNC), **obri el fitxer** per traure'n `eof` → milers d'operacions síncrones per a unes dades que només calien per a ~20 candidats. SOLUCIÓ CAPA 2 (tot JS, `jsx/` intacte, **sense Node**): `Scanner._listNamesNative` (`cep.fs.readdir` = només noms, fallback a `Utils.readFolder`), `Scanner._dateCandidates` (data NOMÉS dels candidats: caché persistent `fp_wott_dates_v1` → `cep.fs.stat` natiu → `IO.fileInfo` per als pocs que fallen) i `Scanner.wotts` reordenat (llistat natiu → filtre per nom → datació → `filterByWorkDate`, que no canvia). Salvaguarda: si cap candidat no és datable es rellig la carpeta via JSX com abans. PENDENT: comprovar en fred que el log llista `[post] _fullScan · wotts del NAS (Xs)`, `wotts · llistat natiu (Xs, N noms)` en mil·lisegons i que el semàfor passa a blau |
| **#205** | **Corregit** (29/10) · pendent de validar en viu · 100% JS (`jsx/` intacte) | **La passada TWITTS acabava sempre en «0 col·locat(s) · 0 pendent(s)»**: `FASTPASS.log` del projecte confirmava que `runAuto` es disparava i que `scanClips` mirava **11 clips**, però cap arribava a l'OCR. Causa arrel: el frame de mostra es demanava amb `Render.frame` (= `seq.exportFrame`), API **que no existix al DOM de Premiere 25** → cada crida tornava error i `samplePng` eixia **sense escriure res al log** (el `return` era abans del `log` d'`ocrClip`), així que el fracàs era invisible. SOLUCIÓ (D19 de [`docs/specs/TWITTS_OCR.md`](docs/specs/TWITTS_OCR.md)): (a) **via ràpida** = `FFmpeg.extractFramePng` sobre el **MEDIA del clip** (mateix àtom del OCR de títols, 0,25-0,33 s/frame, no toca la timeline i el frame no porta chyrons al damunt); el segon dins del fitxer el dóna `srcTime(clip,t)` = `inPoint + offset` escalat per `(outPoint−inPoint)/(end−start)`; (b) `flotants()` publica `paths` (nom→ruta del media) i `pathOf` resol el nom amb tolerància (majúscules/extensió); (c) **reserva** = `Render.snapshot` (QE `exportFramePNG`) ampliant i restaurant l'Out point, per a anidades/multicam/sense ruta; (d) **mai més en silenci**: `⚠️ [TWITTS] <tc> «<clip>» sense mostra per a l'OCR: <motiu>` i la via (`ffmpeg`/`QE`) al log bo. Validat: **ALL GREEN \| js 64/64 \| smoke 650/650 \| jsx intacte** (casos nous `#TW/46`-`#TW/49`). |
| **#206** | **Corregit** (29/10) · pendent de validar en viu · 100% JS (`jsx/` intacte) | **La passada TWITTS col·locava el tuit al lloc equivocat i tapava el tuit bo**: amb la captura ja arreglada (BUG #205), el `FASTPASS.log` del projecte (29/10 13:47) deia exactament el que tocava (`00:00:36:22 «TNM_V3_CLIP.mp4» · TUIT · @miriamnoguerasm · 165` → `✅ col·locat «…Miriam Nogueras…» 00:00:36:22 → 00:00:40:07`) i el PNG de mostra (`C:\temp\fp_twitts_5.png`) era eixe mateix tuit: **ni l'OCR ni el TC estaven malament**. Causa arrel: **`Clips.insert` (JSX, `6_Clips.jsx:313-320`) ajusta la duració amb `clips[numItems-1]`**, és a dir l'**ÚLTIM** clip de la pista i **no el que acaba d'inserir`**. Com que la passada va DESPRÉS de COLOCAR, V3 ja té chyrons i el tuit (que entra ENMIG) es quedava amb la **duració sencera del mèdia** (~20 s) → tapava els clips de V1 següents (amb el tuit bo inclòs) i, a més, **retallava el chyron més tardà**. Per això eixia igual moguent el cabezal: l'ancoratge sempre va ser `clip.start`/`clip.end` del clip on l'OCR ha casat (D15) i el que fallava era el FINAL, no el principi. SOLUCIÓ (D20, `jsx/` intacte): `_place` llig la pista de grafismes **ABANS** de l'insert (`before`) i, **DESPRÉS**, crida `_fixPlacement` (`js/workflows/flow_twitts.js`) → (a) localitza el clip per **NOM + `start`** (mai per instant: un chyron pot arrencar al mateix TC), (b) el retalla **coherent** `inPoint → outPoint → end` amb `Clips.retrim` (reserva `Clips.endAt` si el mèdia no dóna), (c) **restaura** els clips preexistents que hagen canviat de final i (d) **verifica el resultat REAL**: si el clip no hi és o el final no quadra, la col·locació **NO compta** (`❌ … inserit però NO verificat`) i el log bo diu el clip de V1 objectiu (`sobre el clip de V1 <tc>→<tc> «nom»`). Validat: **ALL GREEN \| js 64/64 \| smoke 655/655 \| jsx intacte** (casos nous `#TW/50`-`#TW/54`). |




### 1.1 · ✅ Validats en viu · **CODI SENSIBLE: NO TOCAR**

> Ordre explícita de l'usuari (27/10). Estes funcions **queden congelades**: no es refactoritzen, no
> es retoquen i no s'hi afegeixen casos «de passada». Si mai cal tocar-les, és bug nou amb el seu
> número i validació en viu pròpia.

- **#194** · marcadors GROCS fora del directe. En viu: `01BT@0,00` · `01 TE-1@10,00` ·
  `01 TD-1@15,00` · `01dir@32,28` · `02@39,36` · `03@65,72`, cap groc dins de la connexió.
  **Congelat**: `Markers._resolveGraphicParents` (`js/workflows/flow_markers.js`).
- **#195** · els rètols del plató no cauen dins del directe: el conductor
  (`…_661940_Directe_PRESENCIAL_Ciutat de la Justícia…`) es queda a la capçalera `01BT` (0,40 s) i la
  connexió `01dir` es respecta. **Congelat**: `_isCapcaleraPlato`, `_debeQuedarseEnPlato`,
  `_isPresenterLine` (sufixos `bt`/`pg`), `_isPresenterTitle` (tokens `BONATARD*`/`BONANIT`) i la
  guarda `🏠 PLATÓ` dins `_ipdAnchorPlan` (`js/workflows/flow_chyrons.js`).



### #193 · Inici del bloc i finestres degenerades (`01dir` a `0,00 s`)

**Símptoma** (`TNM_V1` 26/10): `01dir` havia d'anar a `00:00:34:12` (`34,50 s`, tall d'escena
confirmat amb `ffmpeg`) i va quedar a `0,00 s` junt amb `01 TE-1`, `01 TD-1` i `01BT`.

**Causa arrel** (cinc baules, verificades al log de l'11:23):

1. `escaleta_bounds._sanitizeOnAir` anul·la la PREVISTA dels tres ítems de capçalera
   (`14:31:41` < highWater `14:32:13`) sense tolerància → el bloc perd la seua hora
   (`blockRefSec = null` → Tier0-IN cross-agrupació).
2. `_classifyItems` manda els ítems **sense hora** a `unplacedItems` **abans** de mirar si són
   gràfics → `01 TE-1`/`01 TD-1` (que el manifest dona `classe = GRAFIC`) entren al joc
   estructural.
3. `_pickStartItem` només mira `structuralItems` → `01BT` (capçalera sense hora) no és
   candidat → el 🔒 d'inici cau en `01dir` (`sequencia` 28).
4. La immunitat «faro de faros» es dona per **posició** (`tk <= 0,15`) i per `_frozen` → F3.5
   veu `Δ = 1,360 s` i no el pot aplicar, i F4/F5 queden bloquejats.
5. F5 ix amb la finestra `[01dir@0 → 01dir@0]` → `continue`; F7 apila a `max(0, next − 0,5)`.

**Fet**: disseny complet i document únic
[`docs/specs/FIX_INICI_BLOC.md`](docs/specs/FIX_INICI_BLOC.md) (R1 gràfics primer · R2 inici
per orde d'escaleta · R3 immunitat per identitat · R4 cadena de durades a F5 · R5 opcional a
`escaleta_bounds`) + xarxa de seguretat `docs/rollback/2026-10-27_FIX_INICI_BLOC/`
(instantànies `.orig`, `SHA256SUMS.txt` i `RESTAURAR.md`). F8·Separació (`#192`) queda com a
xarxa de seguretat, **no** com a solució.

**Què falta**: decidir si cal **R3** (immunitat del `00:00` per identitat; només si al log apareix
un `IMMUTABLE (faro de faros)` en un ítem equivocat) i **R5** (tolerància de la PREVISTA a
`escaleta_bounds`; pot moure l'IN/OUT). **I tornar a provar en viu després de R6** (la passada de
les 12:52 encara queia a `3,00 s`).

**Aplicat el 27/10** (`js/workflows/flow_markers.js`, decisió d'usuari): **R1** gràfics pel
sufix abans del test «sense hora» · **R2** `_pickStartItem` amb `unplacedItems` i orde per
`sequencia` (3 crides) · **R4** `_hiFinestraInferida` + `_cadenaDuradesSec` a F5. Smoke §12c
amb 19 assercions → `ALL GREEN | js 61/61 | smoke 471/471 | jsx intacte`. `jsx/` intacte.

**Validació en viu 27/10 12:52** (`MARCADORS_2026-10-27_1252.txt`): `01BT@0,00` ✓ ·
`01 TE-1@10,00`/`01 TD-1@15,00` (ara ixen com a gràfics, no com a estructura) ✓ · `02@41,08` ✓ ·
`03@67,44` ✓ · **`01dir@3,00` ✗**. El `00:00:03:00` **no era cap corte**: F2 clavava `01dir` a `0`
(`idealPosSec = 41,08 + (52334 − 52384) = −8,92 s`, clamp cec) i F8 la separava amb el GAP de
`3,0 s`. Causa: la seua Prevista (`14:32:14`) cau **8,92 s ABANS de l'inici del clip** — el clip
comença a `52342,92` (14:32:22,9), no al `worldBlockAnchorSec` (`52333`) → **baula 6** → **R6**.

**R6 aplicat el 27/10**: `_matBoundsSec(anchors, clips)` + `_classifyItems(lines, opts)` (una hora
fora del material → `unplacedItems` amb `_foraMaterial`, log `🚫 [FORA-MATERIAL]`) + F5 amb la
**cadena de durades prioritària**, **imant al corte** i la guarda del `0,00` oberta només per a
`_foraMaterial` (l'`OnAir` i el 🔒 d'inici, intocables). Corts reals de `TNM_V1_CLIP.mp4`
(`ffmpeg`, 188,88 s): `65,32` i `72,40` del fitxer = **`34,52`** i `41,60` de timeline (menys
30,8 s d'in-point) → `01dir` ha d'anar a **`34,52`**. Smoke §12c 19→25 → `ALL GREEN | 477/477`.

### #194 · Un directe no porta gràfics mai (marcadors grocs dins de la connexió)

**Símptoma** (`TNM_V1` 26/10, `MARCADORS_2026-10-27_1330.txt`): els marcadors **GROCS** de
`01 TE-1` i `01 TD-1` (F6·GF, `colorIdx 4`) van quedar a `35,82 s` i `37,59 s`, **dins de la
connexió en directe** (`01dir@32,28`). Un directe és plató pur: **no hi ha mai cap element gràfic**;
els grafismes van a la **Intro**, l'**off** o el **DonaPas**.

**Causa arrel**: `placeGraphicMarkers` ancorava els gràfics a un marcador "pare" del mateix número
base amb `PRIORITY_SUFFIXES = ['i', 'dp', 'dir']` — és a dir, **`dir` era pare vàlid**. En este bloc
no hi ha `01i`/`01dp`, així que el pare de `01` va ser `01dir@32,28`; el pare correcte és la
capçalera de plató `01BT@0,00`. Les posicions quadren exactes amb el motor: `nextMarker=39,36`,
`totalDur=7,08`, `segmentDur=1,77` → `32,28 + 2×1,77 = 35,82` i `+1,77 = 37,59`.

**Fet** (27/10, tot JS, `jsx/` intacte): la resolució eix a una funció **pura** i testable,
`Markers._resolveGraphicParents(markers)`, i el directe queda **exclòs com a pare**
(`DIRECT_SUFFIXES = ['dir','directe','especial']`). Ordre nou: (1) intro → donapas → off
(`i`,`dp`,`f`,`off`), (2) vídeo propi (prefix exacte), (3) estructural del mateix número (mai
directe), (4) **capçalera/plataforma** del mateix número (`01BT`, `01PG`…) que no siga directe ni
gràfic. Si l'únic marcador del número és un directe → **no s'ancora** (log `⏭️`), i decidix el
fallback per Prevista. Smoke §12d: **7 assercions** noves → `ALL GREEN | js 61/61 | smoke 484/484`.

**✅ VALIDAT EN VIU** (27/10, 14:00 · `MARCADORS_2026-10-27_1400.txt`): `01BT@0,000` ·
**`01 TE-1@10,000`** · **`01 TD-1@15,000`** · `01dir@32,280` · `02@39,360` · `03@65,720`. Cap groc
dins de la connexió. **NO TOCAR** (decisió d'usuari, 27/10): la resolució de pares
(`Markers._resolveGraphicParents`) queda congelada.

### #195 · Els rètols del plató cauen dins del marcador del directe

**Símptoma** (`TNM_V1` 26/10, `CHYRONS_2026-10-27_1400.txt`): els dos rètols del bloc queden
**dins de la connexió** i **cap a l'inici** (ni a `0,40 s` sobre `01BT@0,00`):

| Rètol (nom real) | rol | col·locat |
|---|---|---|
| `Wott_TNM_v1_01BT_00.00_…_661940_Directe_PRESENCIAL_Ciutat de…` | `Directe` | V8 · **`32,68 → 37,76 s`** |
| `Wott_TNM_v1_01BT_00.01_…_661951_Enviat_Sí_Marta Martorell_Chu…` | `Enviat` | V7 · **`37,68 → 39,32 s`** |

**Causa arrel** (dos mecanismes, tots dos per disseny antic; el `structure` diu que **els dos
rètols pengen de `01BT`**, no de `01dir`):

1. Rètol `Directe`/`PRESENCIAL` → `_isDirecteSenyalWott` = `true` → **`_ipdAnchorPlan`** (BUG #167)
   → `_pickDirecteDiferitAfter` tria el primer DIRECTE/DIFERIT **posterior** (`01dir@32,28`) →
   `32,28 + 0,40` (`CHYRON_OFFSET_SEC`) = **`32,68`**.
2. Rètol `Enviat` → `_isEnviatWott` = `true` i `_connexioMarkerTime(0,00)` = `01dir@32,28` → va al
   punt de connexió; busca el primer buit de la pista → **`37,68`**.

L'agreujant: **`01BT` no es reconeix com a ítem de plató** — `_isPresenterLine` mira els sufixos
`i|dp|dir|f|off` i `bt` no hi és; `_isPresenterTitle` mira tokens al **començament** del títol i
`PGBONATARDAIDONAPAS…` no comença per cap (`DONAPAS` no és al principi; `BONATARDA` no és a la
llista). Per això `placeChyronConductor`, `_blockStartTime` i `_casForceTimes` també prenen
`01dir@32,28` com "el plató del bloc".

**Fet** (27/10, tot JS, `jsx/` intacte · `js/workflows/flow_chyrons.js`). Regla d'usuari: «si hi ha
un ítem intro/off al principi, va amb el conductor; si no n'hi ha, no s'hi posa» → cal mirar **el
sufix I el NOM de l'ítem**:

1. `_isPresenterTitle` accepta `BONATARDA`/`BONATARDE`/`BONATARDES`/`BONANIT` (el «PG bona tarda i
   DONA PAS…» ja es reconeix: `PG` es lleva com a prefix i queda `BONATARDA…` al principi).
2. `_isPresenterLine` accepta els sufixos **`bt`** i **`pg`** (capçalera/plataforma de plató) →
   `placeChyronConductor`/`_blockStartTime`/`_casForceTimes` ancoraran a `01BT@0,00` → `0,40 s`.
3. Nous predicats **purs**: `_normTitol`, `_isCapcaleraPlato(m, entry)` (sufix `bt|pg|plato|estudi`,
   id `01BT`/`01 PG`, o títol `PG|PLA|PLATO|ESTUDI` + `BONATARD*|BONANIT|DONAPAS|SALUTACIO`; les
   INTRO queden fora) i `_debeQuedarseEnPlato(m, entry, markersFull)` (només si eixa capçalera
   **obri el bloc**, marge `0,05 s`).
4. `_ipdAnchorPlan` consulta la guarda **abans** de moure res → el rètol PRESENCIAL es queda al
   plató (log `🏠 … es QUEDA al plató`).

**Intactes**: regla #168 (`04i - intro DIFERIT…` seguix movent-se), `dp` (convenció 2026-09-21) i
ENVIAT (punt de connexió). PROVES: `bin/smoke/fp_smoke_ac.js` §14b
(`ph('14b-bug195-conductor-plato')`), **7 assercions** → `ALL GREEN | js 61/61 | smoke 491/491 |
jsx intacte`. **✅ VALIDAT EN VIU el 27/10 · NO TOCAR · CODI SENSIBLE**: `_isCapcaleraPlato`,
`_debeQuedarseEnPlato`, els sufixos `bt`/`pg` de `_isPresenterLine`, els tokens `BONATARD*` de
`_isPresenterTitle` i la guarda `🏠 PLATÓ` d'`_ipdAnchorPlan` queden **congelats**. Qualsevol canvi
posterior és un bug nou amb número propi i validació en viu.

### #191 · Wotts amb el bloc a seques (XARXES-TEXT) no es col·loquen

**Símptoma**: el generador deixa wotts amb el bloc **a seques** (`Wott_TNM_V_00_00.00_…`).
El filtre del `Scanner` exigia el prefix literal `PROG_BLOC_` (`TNM_V3_`) i `TNM_V_` no hi
encaixava, així que **no s'importaven mai** al projecte: els 3 wotts flotants del
`2026_10_25/V3/TNM_V3` es veien al NAS però el panell no els baixava.
**Fet**: `Scanner.wotts()` separa bloc (`V3`≡`V03`) de flotants i torna `bloc + flotants`;
`Parse._esFlotant` evita el bloc fantasma `00` a `State.structure`
(`Scanner.js?v=23`, `13_Parse.js?v=6`).
**Què falta validar**:
1. Recarregar el panell i reescanejar `2026_10_25/V3/TNM_V3` → al log hi ha d'eixir
   `🪁 [SCAN:wotts] 3 wott(s) FLOTANT(S)` i els **3 `XARXES-TEXT`** al bin.
2. **Decidir la regla de col·locació** (detector per ROI/text com `flow_graphics` /
   `17_TitoletDetect`, o deixar-los al bin per a col·locar-los a mà): `flow_chyrons.js`
   hui no té cap fase que busque wotts sense ítem.

### #113 · Arrencada en fred lenta

**Símptoma**: amb l'ordinador tot just engegat, `ARRENCADA COMPLETA` a **92,7 s**
(`_boot_timing.log` 22/10 08:57:33) i el log s'obre tot sol (llindar 15 s). El 99% del
temps era **NAS fred** dins `checkContext`, amb treball duplicat i un scan innecessari.
**Fet** (22/10): single-flight + *timeouts* a `js/core/4_Context.js`; dedupe de sondes
(`_probeInflight`/`_probeKey`) i **caché de dates persistent** (`localStorage`
`fp_wott_dates_v1`) a `js/logic/Scanner.js`; marques `[SCAN]` i `[Context] … sonda` al
`_boot_timing.log`; `Scanner.js?v=16`, `4_Context.js?v=28`. El 27/10 s'hi afegí la
**marca al `<head>`** (`index.html` + `Boot.page()`/`pageLoad()` a `js/main.js`) que ara
mesura també el tram de navegació + càrrega dels 48 mòduls.
**Què falta validar** (només val en **fred**, després de reiniciar l'equip):
- `ARRENCADA COMPLETA` **≤ ~10 s** i el log **no** s'obre tot sol.
- **Una sola** línia `checkContext · readFolder NAS`; `sonda wotts`/`sonda MP4` amb valor
  (o `TIMEOUT/ERROR (8 s)` → el botó queda en `ESPERA` i el poll de 15 s ho reintenta).
- Llegir les 2 línies noves del `_boot_timing.log`: la **negativa**
  (`pàgina: navegació → main.js`) i la de `load`. Si la negativa és ~11 s el temps és
  baixada/parseig dels 48 mòduls; si és ~0,3 s, els 11 s són arrencada del motor CEP.
- Comparativa: (a) sense projecte, (b) amb el projecte de sempre, (c) amb el *Customer
  Improvement Program* desactivat.
**Fitxers**: `js/core/4_Context.js`, `js/logic/Scanner.js`, `index.html`, `js/main.js`.

### #204 · El timing no mesurava l'espera real (i el semàfor en verd mentia)

**Símptoma**: en arrencada en fred el panell es quedava **molt de rato** amb el semàfor
dels WOTTS en **verd intermitent** i el `_boot_timing.log` deia que l'arrencada havia
durat **330 ms**. Al `_keyframe_trace.log` del 29/10 es veu l'espera de veritat:

| hora | què |
|---|---|
| 09:02:32 | `ARRENCADA COMPLETA` (330 ms de panell) |
| 09:02:50 | `[SCAN] Analitzant context i materials...` |
| **09:04:33** | `[SCAN:wotts] Filtre per data projecte 20261028 …` (**+103 s**) |
| 09:04:40 | `[SCAN:portades]` (+7 s) |
| 09:04:43 | `[duration] ffprobe … → 6480.02s` (+3 s) |

**Causa arrel** (2 baules):
1. `js/main.js` tancava el log a l'ARRENCADA COMPLETA (`_bootClosed = true`) i
   `_bootMark` descartava tot el que no fóra `'force'` → **cap** de les marques del
   darrere (`[SCAN]`, `[Context]`) arribava al fitxer. A més `_fullScan` no tenia cap
   marca pròpia.
2. Eixa espera no és càlcul: és `Utils.readFolder` sobre la carpeta de **rètols UNC**,
   que va **via JSX** (`File.created` de **1281 fitxers**) → crida síncrona que
   **bloqueja el fil del WebView**. L'única cosa que seguix viva és l'**animació CSS**
   del semàfor, que estava en `blink` = verd intermitent = «ja importable». D'ací la
   sensació de «parpadeja i no fa res».

**Solució** (tot JS/CSS, `jsx/` intacte):
- `js/main.js`: **finestra post-arrencada** (`_bootPostMs` = 3 min, `_bootPostSlowMs` =
  400 ms). Passada l'ARRENCADA COMPLETA només es desen les marques **lentes**, amb
  prefix `[post]`; la primera deixa una línia a `_boot_timing_hist.log`
  («1a espera post-arrencada: …»). `FASTPASS_UI.Boot.setPostWindow(ms, slowMs)` ho
  ajusta (o ho apaga amb `0`); `Boot.postWindow()` ho consulta.
- `js/workflows/flow_mainButton.js::_fullScan`: marques `force`
  (`_fullScan · wotts del NAS`, `· portades`, `· carpeta del projecte`, `TOTAL`) dins
  d'un `try/finally`.
- `js/logic/Scanner.js::wotts`: marques a la **lectura de la carpeta de rètols** (nº de
  fitxers) i al **filtre per data**.
- `js/core/4_Context.js`: `setSemaforOcupat(id, title)` / `setSemaforLliure(id)` i estat
  `busy` a `updateLights` (`style.css` → `.light.busy`, blau lategant). `_fullScan` el
  pinta a `sem-wot` abans de tocar el NAS i el restaura al `finally`.

**Capa 2 (29/10) · per què eixa espera costava 103 s**: **no era el NAS**. Mesurat el
mateix dia des de .NET (la via nativa que usa CEP, **sense Node**):

| operació | fitxers | temps |
|---|---|---|
| `GetFiles` (només noms, 1 passada) | 1281 | **2 ms** |
| `FileInfo` (nom + `created` + mtime + size, 1 passada) | 1281 | **3 ms** |
| 50 `stat` individuals de `created` | 50 | **7 ms** |

El cost estava en **com** es preguntava: `IO.scanDirectory` (JSX) llig `length`,
`modified` i `created` de **cada** fitxer (cada getter és una consulta SMB feta des
del motor d'ExtendScript) i, si `length` ve 0 (habitual en `.mov` per UNC), **obri el
fitxer** per traure'n `eof`. Amb 1281 fitxers són milers d'operacions síncrones per a
unes dades que només calien per a ~20 candidats — i per això el fil del WebView es
bloquejava sencer.

**Solució capa 2** (tot JS, `jsx/` intacte, **sense Node**):
- `Scanner._listNamesNative(folder)`: `cep.fs.readdir` → **només noms** (fallback a
  `Utils.readFolder` si la via nativa no hi és).
- `Scanner._dateCandidates(folder, files)`: posa `created`/`mtime` **només als
  candidats** (bloc + flotants), en tres passades de cost creixent: caché persistent
  `fp_wott_dates_v1` (cost 0) → `cep.fs.stat` natiu → `IO.fileInfo` via JSX per als
  pocs que fallen. Si l'origen ja portava la data, no es fa res.
- `Scanner.wotts`: llistat natiu → filtre per nom → `_dateCandidates` →
  `filterByWorkDate` (mecanisme únic, intacte). **Salvaguarda**: si cap candidat no
  és datable, es rellig la carpeta via JSX (`File.created`) com abans (evita repetir
  el desastre del 2026-09-22, «69 → 0, NO datables»).

**Què falta validar** (només val en **fred**, equip tot just engegat):
- `_boot_timing.log` amb una línia `[post] [SCAN] _fullScan · wotts del NAS (Xs)` i
  `[post] [SCAN] _fullScan TOTAL (Xs)`.
- `_boot_timing_hist.log` amb la línia «1a espera post-arrencada».
- El WOT en **blau** mentres escaneja i el tooltip «Analitzant els rètols del NAS…».
- Que `wotts · llistat natiu (Xs, N noms)` ixca en **mil·lisegons** (no en desenes de
  segons) i `wotts · datació de candidats` amb poques desenes, no 1281.

**Fitxers**: `js/main.js`, `js/core/4_Context.js`, `js/logic/Scanner.js`,
`js/workflows/flow_mainButton.js`, `style.css`, `index.html`,
`bin/smoke/fp_probe_arrancada.js` (`#BOOT/20`), `bin/smoke/fp_probe_wotts.js`
(`#WOTT/55`, `#WOTT/56`), `bin/smoke/fp_probe_srt.js` (`#F3/25`).

### #111 / #116 / #117 · Notes antigues de markers i semàfors

Cap d'elles té codi aplicat ni entrada detallada: s'han de **decidir** abans d'implementar.

- **#111**: els ítems `flotant:true` no reben marcador (cas real `03`
  «+++ IPD MEDIACIÓ MARICARMEN +++», bloc V2 del `TN_VESPRE` 28/09). Cal decidir si el
  marcador ha de ser **vermell** i amb quin criteri.
- **#116**: marcador **vermell de cua** (TNC V2, 131,64 s · 2a passada 131,52 s) que no
  hauria d'existir; el filtre el descarta i `_safePlaceByPrefixes` el torna a afegir
  (acaba amb `Nous: 1`). Cal decidir: excepció al filtre o a la vàlvula.
- **#117**: `ReferenceError: mediaN is not defined` a `checkContext` quan l'escaleta porta
  `mediaStop`+`blockOut` → es perden els semàfors SRT i WOTTS i s'escriu un ⚠️ fals.

---

## 2 · RESOLTS I TANCATS (126)

Ordre cronològic d'incident. La data és la del tancament; **els tancats el 2026-10-27**
(`#152`, `#153`, `#178b`, `#183`, `#189`, `#190`) ho foren **per decisió de l'usuari,
sense prova en viu**.

| Nº | Data | Descripció |
|---|---|---|
| **#8** | 2026-05-28 | CRASH F2: JSON.parse de respuesta 'ERR:...' del JSX → SyntaxError |
| **#9** | 2026-05-28 | Color de marcadores perdido al hacer delete+create en placeByPrefixes |
| **#10** | 2026-05-28 | Marcador rojo inesperado: lógica de color 'agrupacio ? 6 : 1' no distinguía rojo/amarillo |
| **#11** | 2026-05-28 | OUT del MP4 incorrecto por duradaOnAir inconsistente (TNC V2: OUT recortado a 54s en vez de extenderse 78s) |
| **#12** | 2026-05-28 | Ítems gráficos (TE, GI, etc.) colocados como estructurales por el codepath UNGROUPED |
| **#13** | 2026-05-28 | _deduceOnAirSortida y Tier 2 cruzan fronteras de agrupacio → OUT extendido 104s (TNV V1) |
| **#14** | 2026-05-29 | F3.5/F4/F5 cambian el color de los marcadores a verde al hacer snap |
| **#15** | 2026-05-29 | Marcador F2·Deducido '01i' no se coloca en 00:00 (TNC: colocado a 3.72s) |
| **#16** | 2026-05-29 | MP4 IN asigna worldBlockStartSec del item anterior (cross-agrupacio contamination) |
| **#17** | 2026-05-28 | TNV V3: OUT del MP4 extendido ~41s — posible inconsistencia de datos en la escaleta |
| **#55** | 2026-09-24 | Clip MP4 del bloc col·locat SENCER al timeline: tot el material ~12s a la dreta (12,04s = 10s de clipInOffset + 2,04s de desfase del fitxer extret) |
| **#56** | 2026-09-24 | Desfase de 10s entre àudio i vídeo del clip del bloc |
| **#57** | 2026-09-24 | Ancoratge de marcadors: el delta de correlació s'aplicava DUES vegades (F3 i F3.5) -> el marcador quedava 1,8s ABANS del seu corte |
| **#58** | 2026-09-24 | F4·Faro no clavava el marcador al corte tot i que el fix B ja era al codi (ventana ±1,5s) |
| **#59** | 2026-09-24 | Marcador del vídeo desviat uns frames del seu corte per F6·Ordre |
| **#60** | 2026-09-24 | Marcadors VERMELLS (ítems no agrupats) col·locats al final del bloc |
| **#61** | 2026-09-24 | Creant el V1 del 23/09: el panel agafava l'escaleta V2 (més recent) i el guarda «escaleta d'un altre bloc» avortava la creació |
| **#62** | 2026-09-24 | Ruta de treball única per BLOC: <prog>_PROJECTES/<data>/<V> (abans tots els blocs barrejats a la carpeta del dia) |
| **#93** | 2026-09-25 | ffmpeg -ss NO és el 0 del fitxer extret: el tall arrenca al KEYFRAME ANTERIOR (pre-roll) → 0,81 s d'error sistemàtic a tots els marcadors |
| **#94** | 2026-09-25 | Crash 'zonaInOffset is not defined' JUST després del trim: corchetes de seqüència sense fixar i ref del manifest sense finalitzar |
| **#95** | 2026-09-25 | IN·FLOOR incloïa ítems del MATEIX bloc → bloc buit (IN>=OUT) → IN/OUT-GUARD baixava l'IN minuts enrere |
| **#96** | 2026-09-25 | Ancoratge: l'offset de conversió fitxer→timeline usava la ref del manifest (FIX-A/B) en lloc del clip.inPoint REAL → biaix igual a clipInOffset/zonaInOffset (10 s a… |
| **#97** | 2026-09-25 | _rebuildManifestFromLocal reescrivia la ref en coords d'ORIGEN després de l'extracció (3r escriptor del manifest) |
| **#98** | 2026-09-25 | Clips.trimAudioA2 no està exposat pel bridge JSX: ERROR vermell a cada execució (no-op) |
| **#99** | 2026-09-25 | REPARTIR (traduccions/chyrons) només omplia el PRIMER clip de V1 quan les traduccions del tram queien a cavall de 2 clips seleccionats |
| **#100** | 2026-09-25 | REPARTIR destrossava el clip veí de la dreta de la pista (rètol Llocdata) en col·locar-hi les traduccions |
| **#101** | 2026-09-28 | El placement inicial de traduccions (per TC) col·locava les últimes traduccions FORA del seu clip de referència de V1 (TC=01.10: 2 clips @ 70.00s dur=10.00s quan el… |
| **#102** | 2026-09-28 | El chyron del CONDUCTOR no es col·locava (TNV V3 28/09) i el log deia '✅ col·locat' igualment |
| **#103** | 2026-09-28 | REPARTIR només tenia en compte el PRIMER clip seleccionat de V1 (2 clips seleccionats → 1 usat) |
| **#104** | 2026-09-28 | L'IN del bloc arrencava DINS del sumari anterior (TNM V1 27/09 'DIRECTE PUERTA DEL SOL': el corchete IN queia a 14:30:52 en lloc de 14:32:16 → 84 s de tema aliè a… |
| **#105** | 2026-09-28 | L'IN del bloc arrencava DINS d'un VÍDEO ALIÈ encara en emissió (TNM V1 28/09 'DIRECTE PUERTA DEL SOL': amb el #104 el corchete ja no cau dins del sumari, però cau a… |
| **#106** | 2026-09-29 | El chyron de CONDUCTOR s'inseria en un bloc que no té cap ítem de presentació (TNV V1 'LEAD DIAGONAL TALLADA' 29/09: conductor a 0.40s sobre un bloc que obre amb un… |
| **#107** | 2026-09-29 | El Tema-Títol GRAN s'ancorava al marcador d'un ALTRE ítem (un chyron de grafisme) i el titulillo d'entrada quedava 11s abans: TNV V1 'LEAD DIAGONAL TALLADA' 29/09… |
| **#108** | 2026-09-29 | Marcadors que queden VERDS (color per defecte de Premiere): TNV_V2 'NEGOCIACIONS HABITATGE' 29/09 — el marcador 01dir sortia verd després de la fase F4·ASIG |
| **#109** | 2026-09-29 | L'ítem NO agrupat 02dir ('LIN DIRECTE PUERTA DEL SOL', agrupacio:null) no rebia cap marcador vermell al bloc TNV_V2 29/09 |
| **#110** | 2026-09-29 | Els marcadors VERMELLS (ítems no del bloc) no es col·locaven MAI en el flux automàtic OUT&GO, i els no agrupats sense OnAir tampoc mai (cas 02dir) |
| **#112** | 2026-09-29 | IPD+: el clip de transparència de subtítols (pista V2) canvia de POSICIÓ a més de canviar de pista |
| **#114** | 2026-09-30 | NETEJA DEL REPO (P0→P5): 6.487 ficheros → 165 útiles, 87 .md → 22, bin/ 38 → 24 scripts, docs/SAMPLES (19 MB) fuera del git y higiene anti-contaminación para el… |
| **#115** | 2026-10-02 | CÓDIGO MUERTO en js/ y jsx/: 28 de los 72 .js NO los carga index.html y al menos uno (js/core/escaleta_trim.js) ni compila. NETeJA EXECUTADA el 2026-10-02 (OK… |
| **#118** | 2026-09-30 | BOUNDS TNM V1 (29/09): l'IN del bloc s'enfonsa de 14:31:53 a 14:29:58 (inici del sumari) i la fase de Vermells omple la capçalera del clip amb 10 marcadors vermells… |
| **#119** | 2026-09-30 | El marcador d'INICI del bloc (00:00) desapareix: F5·Inferits mou l'ítem que el sosté (TNM V1 30/09, '01dp'). El bloc tallat correctament per l'usuari acaba sense… |
| **#120** | 2026-09-30 | El projecte NOU es crea SENSE clip (V1 buida) quan el bloc no és dins del cleanFeed: la guarda 'cleanFeed encara en ingesta' (skipVideoIngesta) descarta també el… |
| **#121** | 2026-09-30 | S'importa material ALIÈ a V1 quan el bloc s'emet MÉS ENLLÀ del final del SNAPSHOT de l'escaleta: la guarda 'cleanFeed en ingesta' i el límit [OUT-MARGIN] es… |
| **#122** | 2026-09-30 | Gràfics del TNV (GF/P2) tractats com a ESTRUCTURALS: el marcador OnAir '01' queda 1,32 s ABANS del seu corte real, els GF es pinten VERMELLS i s'apilen a l'inici… |
| **#123** | 2026-09-30 | Els marcadors DEDUÏTS dels parells DP+DIR del TNV V2 (16dp i 16dir) queden a 7,00 s i 30,80 s del seu corte real (ruptures de densitat 23,36 s = 00:00:23:09 i 48,80… |
| **#124** | 2026-09-30 | El PNG de la PORTADA (workflow RENDER · runPortada) es componia sobre un frame DIFERENT del que es veu a la timeline: la còpia del clip de V1 es fa amb… |
| **#125** | 2026-09-30 | TNV_V1 del 29/09: el marcador de grafisme '01 GF-3' surt BLAU (hauria de ser GROC, com els altres tres GF) i col·locat a 58,52 s — dins del vídeo del discurs — en… |
| **#126** | 2026-10-01 | REVISIÓ DE LA MÀSCARA DE PISTA: cap procediment del panell la protegeix. (a) IPD+ té les pistes HARDCODEJADES SRC:2 (V2 = pista de la MÀSCARA al mapa 2026-09-22… |
| **#127** | 2026-09-30 | MECANISME DE SEGURETAT — si el panell no pot importar un MP4 vàlid, tota la lògica ha de funcionar igual amb el clip que l'operador hagi col·locat a V1: IN el… |
| **#128** | 2026-10-01 | TITULILLO (flow_chyrons): dos defectes al titulillo de sortida detectats per l'usuari testejant el 2026-10-01 — (a) el PRIMER clip col·locat queda 1 FRAME massa… |
| **#129** | 2026-10-01 | IPD+ (toggle V2->V3): el clip que es puja a PARK (V3) i el que es re-insereix a SRC (V2) al REVERTIR neixen amb el Motion PER DEFECTE, aixi que el clip que duu la… |
| **#130** | 2026-10-01 | REGRESSIÓ VIVA DEL #131 (report de l'usuari al test a Premiere del 2026-10-01, panell amb flow_chyrons.js?v=53): «ha aparegut el mateix problema amb els tematítol i… |
| **#131** | 2026-10-01 | TITULILLO (flow_chyrons): el TEMA-TÍTOL GRAN quedava RETALLAT PEL PRINCIPI (li falta la part esquerra) després del #128. La seva posició relativa era correcta… |
| **#132** | 2026-10-02 | EDITOR DE SUBTÍTOLS · FINESTRA MASSA AMPLA (report de l'usuari, 2026-10-01): «al editar los subtítulos, la ampliación del timeline (de subtítulos) era demasiado… |
| **#133** | 2026-10-02 | CHYRONS DUPLICATS A LA TIMELINE (report d'usuari 2026-10-02, TNM V1 del 01/10): «cuando hay el mismo chyron generado varias veces, con el mismo TC, se colocan… |
| **#135** | 2026-10-02 | IN DEL BLOC ANÒMAL (TNM V4, run del 02/10 sobre l'escaleta del 01/10): el motor va ancorar l'inici del bloc V4 a 15:06:58 (0:20 dins el clip extret) quan l'escaleta… |
| **#136** | 2026-10-02 | TRADUCCIONS DUPLICADES A LA TIMELINE (report d'usuari 2026-10-02, TNM bloc 36): «con las traducciones también hay que introducir un filtro que solo coloque la… |
| **#137** | 2026-10-02 | MOJIBAKE ALS ACENTS de TOT fitxer llegit pel pont (IO.readTxt): el nom del projecte al NAS sortia Pruebas_TNC_V1_CRANICA VACTOR SORRIBES PLUJA PERSISTENT A… |
| **#138** | 2026-10-02 | AL RESET ♻️ DELS SUBTÍTOLS ELS MARCADORS ES CONSERVEN (report d'usuari 2026-10-02: «al resetear los subtítulos, se conservan los marcadores. esto es erróneo. Los… |
| **#139** | 2026-10-05 | ELS MARCADORS DELS IPDs SURTIEN VERMELLS (report d'usuari 2026-10-05, bloc DONAPAS + DIRECTE): «Los marcadores de los IPDs aparecen en rojo. Eso es correcto si… |
| **#140** | 2026-10-05 | ELS MARCADORS DELS IPD (i dels ítems no agrupats) NO REBIEN L'AJUST AL CORTE MÉS PROPER (observació d'usuari 2026-10-05, després del fix del #139): «Puede ser que a… |
| **#141** | 2026-10-05 | 📷 FOTO: «No s'ha pogut desar» tot i que l'API SÍ que tenia l'escaleta (TNC V1 2026-10-05, 14:03:55). El botó FOTO ha de funcionar SEMPRE, fins i tot ABANS de cap… |
| **#142** | 2026-10-06 | CAP PNG I RES COL·LOCAT a la cadena de chyrons (report d'usuari 2026-10-06). Tots els congelats (Tema-Títol, titulillo, TITOLET, mapa, Portada) depenien de… |
| **#143** | 2026-10-06 | TITOLET: la targeta col·locada a la timeline durava 5 frames MÉS que el rètol cremat a l'aire (petició d'usuari 2026-10-06). |
| **#144** | 2026-10-07 | TEMA-TÍTOL · SORTIDA/transicions: el titulillo es tancava invertint el wott petit amb ffmpeg (_REV.mov). El Wott del Tema-Títol JA porta la seva pròpia animació de… |
| **#145** | 2026-10-07 | AUDIO FANTASMA a Clips.insert (l'àudio enllaçat d'un ítem amb so cau en una PISTA NOVA) + A1 truncat a 9,76 s pel TRIM-TAILS + Wott orfe a V6 596,64→597,04. |
| **#146** | 2026-10-08 | Botó 🎨 MAPA (2 parts, report d'usuari 2026-10-08): (1) el grafisme es col·locava al TC del MARCADOR de l'ítem i no al CABEZAL — amb el cabezal a 38,84 s el… |
| **#147** | 2026-10-08 | El CONGELAT (freeze) d'un rètol portava la imatge del PROGRAMA (V1) en lloc del grafisme: PNG de 524 KB en comptes de ~35 KB (TNM V3, passada real del 2026-10-08) |
| **#148** | 2026-10-08 | La MATEIXA firma col·locada DUES vegades en dues capes diferents (V7 i V8) al mateix tc (TNM V3, passada real del 2026-10-08) |
| **#149** | 2026-10-12 | TRADUCCIÓ (TRAD/COLOCAR i REPARTIR): quan l'espai assignat a una traducció és més LLARG que la durada del seu mèdia, els clips s'estiraven amb Clips.endAt més enllà… |
| **#150** | 2026-10-12 | Marge massa gran al PRIMER subtítol en col·locar/importar l'SRT a l'editor de subtítols (boto IN): el primer clip de subtítols començava 0,4 s (10 frames a 25 fps)… |
| **#151** | 2026-10-13 | TRADUCCIONS (test d'usuari 2026-10-13, TNM V3): (a) REPARTIR repartia les traduccions només dins del clip que CONTÉ la 1a traducció — la selecció de V1 només… |
| **#154** | 2026-10-13 | El PNG de portada no sempre es diu com l'MP4 exportat: el DESTÍ és correcte (AAA_PORTADES), el NOM no està garantit. Cal garantir la coincidència del nom base PNG ↔… |
| **#155** | 2026-10-13 | 4a reaparició de la familia de CODI MORT (restauració d'un arbre antic del pendrive dins l'extensió) + PORTA pre-commit que impedeix tornar-la a commitejar mai més. |
| **#156** | 2026-10-14 | Falta el marcador de l'ítem d'entrada del bloc TNV V1 del 13/10: 022f 'off' es va calcular amb una escaleta OBSOLETA (snapshot 21:15:24 amb agrupacio null) en… |
| **#156b** | 2026-10-14 | MARC P D'INICI (00:00) I SEPARACIÓ DE MARCADORS (report d'usuari 2026-10-14, TNV V1): el marcador d'inici s'assignava amb isItemEstructural (durada > 0) → queia… |
| **#157** | 2026-10-14 | El botó FOTO demanava l'escaleta del dia EQUIVOCAT: amb el projecte del 13/10 obert (carpeta PROVES/04_TN VESPRE_PROJECTES/2026_10_13/V1) va consultar digition amb… |
| **#158** | 2026-10-14 | TITOLET col·locats per CADÈNCIA al TNC V1 del 2026-10-14 (report d'usuari: «s'han col·locat al timeline però no al seu temps»). Els 6 TITOLET de l'ítem 04 (rol… |
| **#159** | 2026-10-14 | La part VIVA de les targetes de GRAFISME CREMAT (TITOLET i tota la família de titolet.detectRoles: PREGUNTA, CARTELL, DADA-GRAN…) s'inseria amb una durada MÉS… |
| **#160** | 2026-10-14 | EXPORTACIÓ DE LA PORTADA (PNG) TRENCADA (report d'usuari 14/10): (a) el PNG anava a AAA_PORTADES en comptes de la CARPETA DEL PROJECTE; (b) el PNG sortia NEGRE. |
| **#161** | 2026-10-14 | ÀTOMS FANTASMA AL BRIDGE (mateix llinatge que els flux_.js): Timeline.setWorkArea() i Timeline.getWorkAreaIn()/getWorkAreaOut() NO EXISTEIXEN a jsx/main.jsx → les… |
| **#162** | 2026-10-15 | ÀUDIO ORFE A LA ZONA NETA de la PORTADA (report d'usuari 2026-10-15): després de capturar el PNG quedava un clip d'ÀUDIO FANTASMA a A1 @ 151.00 s (zona morta), amb… |
| **#163** | 2026-10-15 | DESTÍ DEL PNG DE PORTADA (report d'usuari 2026-10-15): el PNG anava a la CARPETA DEL PROJECTE i ha d'anar a AAA_PORTADES — es REVERTEIX el canvi del 14/10 (#160a). |
| **#164** | 2026-10-16 | TNC V3 (bloc 14 «FAUNA ALIADA PER L'AGRICULTURA», 15/10): una TRADUCCIÓ acabava a V7, duplicada damunt del nom-càrrec legítim («…_644349_TRADUCCIO [2-3] Només… |
| **#165** | 2026-10-16 | TN MEDIODIA V1 (bloc «PG Intro / PENSIONS ENTREN EN PRECAMPANYA», emissió 15/10; mesurat al V6 auto-desat de les 09:52): el Tema-Títol GRAN entrava 32 s tard (32.32… |
| **#166** | 2026-10-16 | TN MEDIODIA V1 (15/10, V6): la peça de SORTIDA del titulillo (desaparició del Tema-Títol gran) no es veia a pantalla — quedava «mig amagada» per la cua del congelat. |
| **#167** | 2026-10-16 | TN MEDIODIA V2 (bloc «VIMBODÍ I POBLET», emissió 15/10): el rètol de LOCALITZACIÓ DEL DIRECTE («…_644353_Directe_PRESENCIAL_Vimbodí i P.») sortia a 0.40 s, o sigui… |
| **#168** | 2026-10-16 | TN MEDIODIA V2 (bloc «VIMBODÍ I POBLET», emissió 15/10): a l'entrega hi havia dues còpies del rètol de localització (…_644353_Directe_PRESENCIAL_Vimbodí i P.) —una… |
| **BOTO_MAIN_CUADRAT** | 2026-09-22 | El botón MAIN cambiaba de forma (se ajustaba al texto) al arrancar el panel y en cada cambio de estado |
| **CONDUCTOR_BLOC_AMB_GRAFISMES** | 2026-09-23 | El chyron de conductor se omitía porque el bloque abre con grafismos (P2 foto, P2 MAPA) y el ítem de plató (01i) es el 3º en la ESCALETA (aunque es el 1º del… |
| **DF_MAPA_A_CONFIG** | 2026-09-22 | Doble Finestra/Mapa usaban números de pista fijos (V1/V2/V3) en lugar de la config |
| **ESCAPE_BARRES_INJECTIO_JSX** | 2026-09-23 | Error d'escapada a la ingesta de fitxers: utils.importList només escapava les cometes simples, així que les barres invertides de la ruta es perdien dins del literal… |
| **ESPAI_FOCUS_BOTONS** | 2026-09-22 | Al pulsar ESPACIO con el foco en un botón del panel (p. ej. ▶ tras usar el slider) se saltaba al clip siguiente en lugar de hacer PLAY/PAUSA |
| **GRAF_REF_CLIP_V1** | 2026-09-22 | El GRAF tomaba como referencia el cabezal (CTI) y no el clip a sustituir |
| **GRAFISMES_PER_MARCADOR** | 2026-09-23 | Automatitzar el botó 🎨 (MAPA) guiat pels marcadors grocs: (1) la referència del punt d'entrada passa del clip seleccionat al MARCADOR; (2) congelat de 3 s (o fins… |
| **INVERSIO_PEREZOSA_TITULILLO** | 2026-09-22 | El titulillo se enviaba a invertir (ffmpeg) siempre, aunque el reverso no se fuera a colocar en el timeline |
| **IPD_PLUS_DOBLE_FINESTRA_VERTICAL** | 2026-09-23 | Botó IPD+ = TOGGLE per INTERVAL: talla el clip de V2 a l'interval seleccionat i el mou a V3, duplica V1 → V2, i aplica els atributs de capa inferior a V1… |
| **MARCADORS_GRAFICS_F6_DESCONNECTAT** | 2026-09-23 | Los marcadores amarillos/grocs (color 4) de los ítems gráficos (P2 foto, P2 MAPA, GF, TE…) nunca se generaban: F6·Gràfics (Workflows.Markers.placeGraphicMarkers) no… |
| **OUTGO_TOTES_LES_PISTES** | 2026-09-23 | OUT&GO no recortaba en V9 (Mosa): las pistas a limpiar eran listas FIJAS [2..8] y [A1,A2] |
| **PLAY_PANELL_FOCUS_HOST** | 2026-09-22 | El ESPACIO no hacía PLAY/PAUSA: el play del panel NUNCA ha funcionado porque qe.project.getActiveSequence().play() NO EXISTE en esta versión de Premiere (log… |
| **REGLA_TEMPS_FINAL** | 2026-10-02 | REGLA «TEMPS FINAL» (petició d'usuari 2026-10-02): en repassar els ítems de l'escaleta, el primer que conté el text «TEMPS FINAL» marca el FINAL de l'escaleta útil… |
| **REVERS_TITULILLO_FRAME** | 2026-09-22 | El reverso del titulillo (la animación invertida delante del Tema-Títol) quedaba 1 frame a la izquierda |
| **SLIDER_NO_ES_MOU_AMB_ESPAI** | 2026-09-22 | Al pulsar ESPACIO (play), el slider de reencuadre se iba al centro / perdía su posición |
| **SRT_NOMES_DEL_DIA** | 2026-09-22 | El fallback de SRT cargaba subtítulos de OTRO día (TNC V1 del 22/09 cargó el .SRT del 21/09 'EMPRESES DE LLEURE... CERDANYA') |
| **SRT_RESET_REBUSCA** | 2026-09-22 | El botón RESET (♻️) de subtítulos solo restauraba el SRT ya cargado; ahora vuelve a BUSCAR los .SRT del tema del bloque |
| **TITULILLO_SALIDA_MARCADOR** | 2026-09-22 | Titulillo de cobertura: el reverso acababa en la posición calculada del Tema-Títol grande, no en el TC del marcador del ítem |
| **TT_AL_MARCADOR** | 2026-09-22 | El Tema-Títol grande entraba 1 s (25 frames) después del marcador (se le sumaba el tc del nombre del wott) |
| **#171** | 2026-10-16 | Petició d'usuari 2026-10-16: «en general quan s'insereixen els chyrons, es col·loquen al timeline de manera que després NO es poden estirar amb el ratolí… |
| **#172** | 2026-10-16 | PORTADA — el PNG que es publicava NO era el frame demanat: la portada eixia amb el fotograma d'un altre moment de la timeline, i com que la captura sencera (còpia a… |
| **#173** | 2026-10-16 | Render de vídeo — flow_render.runVideo retallava el timeline SEMPRE a l'Out de la seqüència: amb una ÀREA DE TREBALL marcada (i sense IN/OUT) l'exportació ignorava… |
| **#174** | 2026-10-21 | PORTADA — en ocasions el PNG exportat NO és el frame triat: amb un clip LLARG i el cabezal CAP AL FINAL del clip, el PNG conté un frame d'uns 25 frames ABANS del… |
| **#175** | 2026-10-21 | El botó RESET GENERAL (🔄 d'INICI) no deixava la carpeta del projecte completament buida: hi quedaven fitxers (projecte .prproj, escaleta local, manifest...) i el… |
| **#176** | 2026-10-21 | En obrir CONFIG GRAL la finestra eixia BUIDA: cap camp omplert (ni AUTOR ni rutes), les pestanyes d'estructures sense cap targeta i cap desplegable de programa… |
| **#177** | 2026-10-21 | Tres defectes vistos provant F2/F3 a Premiere: (a) en desar CONFIG GRAL eixia «EvalScript error» i la configuració NO es desava; (b) el selector de rutes (📁) obria… |
| **#178** | 2026-10-21 | El DASHBOARD CONFIG (setup.html) es veia MÉS GRAN i molt més espaiat que la finestra principal: lletra de 13px, títol de 18px, targetes amb 15px de padding, 15-20px… |
| **#152** | 2026-10-27 | El JSON d'anàlisi del bloc (`analisis_estructura/DD_MM_PROG_BLOC.json`) no s'escrivia MAI: les carpetes existien buides (29/09→13/10, V1..V4) i no hi havia traça d'ítems de context ni de trimBounds | 
| **#153** | 2026-10-27 | Proposta d'unificar eixe JSON en una sola peça de 4 blocs (BLOC / MARCADORS / escaleta amb `elements` / context 3+3) — **descartada** per decisió de l'usuari: el JSON actual ja fa la faena |
| **#178b** | 2026-10-27 | El botó 📁 de CONFIG (RUTES DE XARXA) obria el diàleg ANTIC de carpetes del Windows: arbre de discs a l'esquerra, sense Accés ràpid/favorits, sense Ús recent i amb… |
| **#179** | 2026-10-22 | en clicar GUARDAR CONFIG [Profile.json] al dashboard de configuració, el perfil es desava (i eixia l'avís «Configuració desada a Profile.json»), però la finestra… |
| **#180** | 2026-10-22 | el botó RESET (reciclatge de la cantonada INICI) no tancava el projecte a Premiere ni esborrava el seu directori. El log real del NAS (PROVES\FASTPASS.log, 22/10… |
| **#181** | 2026-10-22 | Ctrl+clic al botó MAIN (mode correcció) per crear/reprendre el projecte del dia anterior «no feia res»: ni projecte, ni missatge clar, ni cap canvi al panell… |
| **#182c** | 2026-10-22 | Quan el wott es col·loca SENCER (no l'acurta cap pla de V1 ni el final del seu ítem) el clip del timeline ix 1 FRAME més llarg que el mèdia real. Peticio de… |
| **#183** | 2026-10-27 | en un TNC V3 del 22/10, el congelat del titullet (la targeta que va just abans del Tema-Títol, a V6) en compte de congelar el titullet va congelar el CLIP de V1: al… |
| **#189** | 2026-10-27 | en fusionar els SINT amb 🧩 (o en carregar-los, Ctrl+clic), cada subtítol sintètic eixia ~40 s ABANS del lloc on tocava — l'usuari ho descrivia com «el subtítol és… |
| **#190** | 2026-10-27 | al clicar 🧩 (REOMLIR) no passava res: cap avís clar al panell. Al FASTPASS.log del projecte hi havia ⚠️ SRT_SINT: cap sintetic del programa TN_COMARQUES per a… |
| **#192** | 2026-10-27 | **Marcadors SUPERPOSATS al 00:00** (TNM_V1 26/10): `01 TE-1`, `01 TD-1`, `01BT` i `01dir` tots quatre a `0,00 s`, perquè F2 va fer `01dir` (4t de l'escaleta) «marcador d'inici» i F7·Cobertura va afegir-hi els altres tres amb la mateixa posició (la finestra de F5 eixia `[0,00 → 0,00]`); a més l'orde d'escaleta quedava invertit. **Fet**: fase pròpia **F8·Separació** (`flow_markers.separateOverlappingMarkers`) com a ÚLTIMA passa del pipeline d'OUT&GO (`main.js`), amb `_calcSeparacioSuperposats` (càlcul pur) — separa els clústers (≤0,20 s) amb GAP de 3 s en ordre de `sequencia`, no mou mai els OnAir (pinned) i respecta el clúster següent; 9 assercions noves a `bin/smoke/fp_smoke_ac.js` |

---

## 3 · Com s'actualitza este fitxer

1. **Bug nou** → fila nova a §1 amb número correlatiu (`#192`, `#193`…), estat i una línia
   de símptoma. Quan es tanca, la fila passa a §2 amb la data.
2. Un bug **no** es tanca mai «perquè sí»: o s'ha validat en viu, o es tanca per decisió
   explícita de l'usuari (i es fa constar).
3. `docs/CHANGELOG.md` només recull canvis de codi; **l'estat dels bugs viu ací**.
