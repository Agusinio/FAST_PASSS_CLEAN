# 🧭 MASTER · Funcionalitats i propietats — FAST >>> PASS (v2.9.5)

> **Document MASTER** (font de veritat de la BOTONERA). Substituïx el contingut de
> [`GUIA_BOTONERA.md`](GUIA_BOTONERA.md), que queda com a resum derivat.
> Última revisió: **2026-10-23** (retirada de VERTICALITZACIÓ + rutes d'exportació amb `{project}`).
>
> Com es llig cada fitxa: **QUÈ FA** · **REQUISITS** · **EFECTES** · **DRECERES** ·
> **CODI** (on viu, per a qui ha de mantindre-ho). Tot el que ací es descriu està
> verificat contra el codi (`index.html`, `js/main.js`, `js/workflows/*`, `js/editor/srt_editor.js`).

---

## 0. Conceptes que travessen tota la botonera

| Concepte | Què és exactament |
| :--- | :--- |
| **Projecte** | Un `.prproj` per **PROGRAMA + BLOC + DIA**. Es clona de la plantilla del canal i es renombra. |
| **Bloc** | `V1..V5` del selector `#bloc`. És el material que s'edita (no confondre amb la pista V1). |
| **Dia de treball** | `YYYY_MM_DD`. Per defecte **AVUI**; `Ctrl+clic` a MAIN o `Ctrl+FOTO` = **AHIR** (mode correcció). |
| **`{project}`** | Token de ruta = `{archivo}_{bloque}_{autor}_{MMYYYY}_{tema}`. Només es resol si hi ha **tema**; si no, el token cau i el log avisa. |
| **`autor`** | Camp **“Nom de l'Editor (Nick)”** del Setup (`general.autor`, per defecte `AGUS`). Identifica el `.lock` del projecte i alimenta `{autor}` i `{project}`. |
| **Layout TEST / TREBALL** | `🧪`/`👤`. **TREBALL** amaga els botons `test-only` i fa que `OUT & GO` execute el **pipeline de marcadors**. Es recorda entre sessions (`localStorage.fastpass_v1_layout`). |
| **Semàfors** | `ESC` `MP4` `WOT` `SRT`. Verd fix = llest · **Verd intermitent** = material disponible per importar · Groc = pendent (en emissió) · Roig = falta/error · Gris = sense dades. |
| **Lock** | `<projecte>.prproj.lock` amb l'`autor`. Si el lock és d'un altre, MAIN mostra `BLOQUEJAT: <autor>` i el clic força l'obertura (`forceOverride`). |

---

## 1. Secció INICI (context i arrencada)

### 1.1 `🔄` RESET GENERAL (`#btnReset`)

**QUÈ FA.** Esborra **tota la carpeta del bloc** (`<destino_base>/<data>/<Vn>`) i torna a crear el projecte de zero.
Ordre real (`Workflows.MainButton.runReset`):
1. Resol el context de treball (`_setupContext`), el mateix que CREA/ACTUALITZAR.
2. Si el projecte obert és d'eixe PROGRAMA+BLOC, reseteja **la seua carpeta** (encara que siga d'una altra data).
3. **Guarda de seguretat**: la ruta ha d'estar dins de `destino_base` i l'últim tram ha de ser el bloc. Si no, avorta.
4. Tanca el projecte i espera que Windows allibere el `.prproj` i l'Auto-Save.
5. **Esborrat absolut i verificat** entrada per entrada (`Logic.FsWipe`). Si queda **qualsevol** resta: **NO crea res** i avisa (“Tanca Premiere i torna-ho a provar”).
6. Buida les còpies de marcadors SRT que viuen **fora** de la carpeta (`C:/temp/fastpass_srt_markers_*.json`).
7. `State.reset()` preservant HOY/AHIR, reseteja l'editor SRT i llança el flux **NOU**.

**REQUISITS.** Motor JSX a punt (`isJsxReady`) i PROG+BLOC triats.
**EFECTES.** Projecte, escaleta local, MP4 extret, manifest, snapshots, anàlisi, subtítols, marcadors i logs del bloc **desapareixen**.
**DRECERES.** Cap: és destructiu per disseny i no demana confirmació (l'etiqueta i el tooltip ho diuen).
**CODI.** `js/workflows/flow_mainButton.js → runReset` · `js/logic/19_Fs_Wipe.js`.

### 1.2 Semàfors (`sem-esc`, `sem-mp4`, `sem-wot`, `sem-srt`)

| Llum | Què mira | Groc | Roig | Intermitent |
| :--- | :--- | :--- | :--- | :--- |
| **ESC** | Escaleta del bloc al **directori del projecte** (còpia o FOTO) | Escaleta trobada però bloc en emissió / encara no hi ha escaleta | — | — |
| **MP4** | Pista V1 del projecte obert + ingesta (`mediaStop` vs `blockOut`) | La ingesta encara no ha arribat al final del bloc | V1 buida (projecte sense vídeo) | CleanFeed **llest per importar** (sense projecte obert) |
| **WOT** | Rètols del **Bin CHY** vs ítems esperats de l'escaleta | Falten rètols (`n/esperats`) | Cap rètol al Bin CHY | Tots importats / llestos |
| **SRT** | Pista de subtítols del **projecte obert** | — | — | — |

> `SRT`: des del 2026-10-23 **només** compta la pista del projecte obert; no es mira cap `.srt` del NAS.
> El tooltip de cada llum porta el detall (`updateLights`).
> **CODI.** `js/core/4_Context.js → updateLights / checkContext`.

### 1.3 `📷 FOTO` (`#btnFetchEscaleta`)

**QUÈ FA.** Demana una **foto actualitzada de l'escaleta** a l'API de digition i la desa al directori del projecte com `escaleta_on_demand_*`.
**REQUISITS.** PROG i BLOC triats (si falta, avisa i no fa res). Botó ocupat (`⏳ FOTO...`, deshabilitat) mentre dura, amb guarda de temps perquè no quede penjat.
**EFECTES.** Escaleta local del dia; després es força `checkContext({force:true})` perquè el semàfor i el botó MAIN es repinten **en el mateix instant**. Permet **CREAR amb el bloc encara en emissió** (projecte provisional, es completa amb ACTUAL.).
**DRECERES.**
- `Ctrl+clic` = foto d'**AHIR** (per comparar/corregir el dia anterior); en eixe cas **no** es re-ancora la foto a la data del projecte obert.
- Sense `Ctrl`, si el mode de treball és **AHIR** (perquè el panell ve d'un projecte d'ahir), la foto es re-data a la data del projecte obert per no barrejar dies.

**CODI.** `js/main.js` (handler) → `js/core/escaleta_reader.js → fetchNewEscaleta`.

### 1.4 `PROG` / `BLOC` / `COND`

| Camp | Funció | Efecte |
| :--- | :--- | :--- |
| `PROG` (`#programa`) | Programa (`NOM → archivo/wott/dir/escaletaId` a `Profile.json`) | Filtra material, decidix carpeta (`dir`), tokens de ruta i el conductor per defecte. |
| `BLOC` (`#bloc`) | `V1..V5` | Nom del projecte/seqüència, carpeta del bloc i abast de l'escaleta. |
| `COND` (`#conductor`) | Conductor/a opcional | Si es tria, 🎯 COL·LOCAR l'inserix a l'inici del bloc. Si no, s'usa el `conductor` del programa. |

**Canviar qualsevol d'ells** → `Config.saveSelection` + `Context.checkContext()` (repintat d'estat i semàfors).
**CODI.** `js/main.js → handleSelectionChange` · `js/core/11_Configuracio.js`.

### 1.5 `MAIN` (`#btnMainAction`) — el botó que canvia de paper

No és un botó fix: el text **és** l'estat (`4_Context.updateButton`).

| Etiqueta | Estat intern | Significat | Què fa el clic |
| :--- | :--- | :--- | :--- |
| **CREA** | `NEW` | Hi ha **wotts del bloc** o **escaleta local (FOTO)** del dia | Crea el projecte (flux `NEW`) |
| **ACTUAL.** | `UPDATE` / `GO` / `LOAD` | Projecte obert i actiu / obert sense focus / tancat en disc | Sincronitza material, marcadors i bounds |
| **ESPERA** | `ESPERANT` | Hi ha el MP4 origen però encara no els wotts | “Pull”: força un repintat immediat |
| **MASSA D'HORA** | `MASSA` | Ni MP4 origen ni wotts (el bloc no s'ha emés) | “Pull”: força un repintat immediat |
| **BLOQUEJAT: <autor>** | `LOCKED` | Un altre editor té el `.lock` | Obre igualment amb `forceOverride` |
| *(text lliure)* | `WAITING` | Error de xarxa/permisos | Reintenta el context |

**DRECERES.** `Ctrl+clic` (o `⌘`) = **AHIR** en qualsevol estat: recalcula el context amb la data d'ahir i executa l'acció equivalent (`_correctionAction`). Amb el cursor damunt, el botó mostra `AHIR` mentre Control està premut.
**Poll.** Cada **15 s** es repinta sol: `MASSA D'HORA → ESPERA → CREA` sense tocar res.
**CODI.** `js/core/4_Context.js → updateButton / _onMainClick / _correctionAction` · `js/workflows/flow_mainButton.js → runMainAction`.

### 1.6 `⚙️` Configuració (`#btnSetup`) i `🧪` Layout (`#btnMode`)

- `⚙️` obri l'**overlay** `setup.html` (iframe). `GUARDAR CONFIG` escriu `Profile.json`; `TANCAR SENSE DESAR` ix. `Esc` tanca.
- `🧪` alterna **TEST** ↔ **TREBALL** (icona `👤`). En TREBALL desapareixen els botons `test-only` (TROSSEJA, COND/TITOL/LLOC/NOM/RESTO/TRAD, MARCADORS) i `OUT & GO` passa a executar el pipeline complet.

**CODI.** `js/workflows/flow_config.js → toggleSetup/closeSetup` · `js/main.js → applyLayoutMode`.

---

## 2. Secció VÍDEO

### 2.1 `IN` (`#btnIn`) — retall de capçalera

**QUÈ FA.** Ripple-trim **de la capçalera** del clip de la pista MP4 (V1) fins al cabezal, i desplaça tot el bloc a zero:
1. Llig el CTI (`Timeline.get()`). Si és ≤ 0,04 s, no fa res.
2. Guarda els marcadors i l'**OUT de seqüència**.
3. Mou el corxet OUT **abans** de tallar (`newOut = refOut − diff`), perquè Premiere no el col·loque al final del clip ja retallat.
4. `Clips.rippleIn` (vídeo + àudio enllaçat) i desplaça el clip a `0`.
5. Re-aplica `Timeline.range(0,newOut)` (amb reintent si l'OUT no qualla).
6. **Recol·loca els marcadors** desplaçats (`mk.time − cutTime`, descartant els negatius).
7. CTI a 0.

**REQUISITS.** Sequència trobada pels tokens `wott`+`bloc` i CTI damunt del clip.
**AVÍS.** Si es retallen **més de 30 s** de capçalera ho diu ben fort al log i a la barra d'estat… però **no bloqueja** (l'operador mana). Si t'has equivocat: `Ctrl+Z` i mou el cabezal.
**CODI.** `js/workflows/flow_cut.js → runCutIn`.

### 2.2 `TROSSEJA` (`#btnScene`, **només TEST**)

**QUÈ FA.** Fase 2 del pipeline: `Cut.runScene` → `Clips.scenes(V1)` dividix el clip als talls de contingut i bolca al log el diagnòstic de clips (`FLASH`, `LLARG`, `TALL·CURT`). Guarda el projecte.
**REQUISITS.** V1 amb clips i seqüència activa.
**CODI.** `js/workflows/flow_cut.js → runScene`.

### 2.3 `OUT & GO` (`#btnOut`)

| Layout | Què executa |
| :--- | :--- |
| **TEST** | Només `Cut.runCutOut` (tancament), amb avís al log. Servix per provar les fases per separat. |
| **TREBALL** | **Pipeline complet** (`runFullPipelineOut`) |

**Pipeline TREBALL** (en orde, amb 350 ms entre fases):
1. `OUT · retall i neteja` (`Cut.runCutOut`).
2. `TROSSEJA` (`Cut.runScene`).
3. `Dedu (F2)` → `Markers.placeDeducedOnAirMarkers`.
4. `Prev (F3)` → `Markers.placeScheduledMarkers`.
5. `Correl (F3.5)` → `Assembly.correlationSnapMarkers`.
6. `Density (F4)` → `Assembly.snapFaroMarkers`.
7. `Inferits (F5)` → `Markers.placeInferredItems`.
8. `Ordre (F6)` → `Markers.enforceMarkerOrder`.
9. `Gràfics (F6·GF)` → `Markers.placeGraphicMarkers` (marcadors grocs).
10. `Vermells (no agrupats)` → `Markers.placeUngroupedMarkers`.
+ **Snapshot** dels marcadors (`MARCADORS_<data>_<hora>.txt/.json` a la carpeta del projecte).

> **No col·loca chyrons.** Els chyrons són de 🎯 COL·LOCAR, després de verificar els marcadors.
> Si V1 ja té **≥ 2 clips**, les fases OUT i TROSSEJA **s'ometen** (només es refan marcadors).

**Què fa `runCutOut` exactament.** `rippleOut` de V1 al CTI, **retalla V2 i neteja de V3 en amunt** (V1 no es toca) i **totes** les pistes d'àudio a l'OUT; `Timeline.range(0, out−0,04)`, zoom a la selecció i CTI a 0.

**CODI.** `js/main.js → runOutHandler / runFullPipelineOut` · `js/workflows/flow_cut.js → runCutOut`.

### 2.4 `KEYFRAME` (`#btnKey`)

**QUÈ FA.** Toggle **al clip objectiu** (el seleccionat; si no n'hi ha, V1 sota el CTI) i **a l'instant del CTI**:
- sense key → crea el keyframe i posa el mode en KEYFRAME;
- amb key → l'elimina i el mode passa a SLIDER (segons els keys que queden);
- clip de fons (PNG/JPG) → `OK_IGNORAT`: no s'anima mai.

**DRECERES.** `Ctrl+clic` = **probe** del límit real de `Position` (`Anim.probeRange()`), només diagnòstic (ix al log i en un `alert`).
**CODI.** `js/workflows/flow_KF.js → runAddKF` · `jsx/modules/7_KF.jsx`.

### 2.5 `◀` / `▶` (`#btnPrevClip` / `#btnNextClip`)

**QUÈ FA.** Mou el cabezal **al centre** del clip anterior/posterior de la pista MP4 (V1) i refresca el slider (`Sync.updateSliderFromPremiere`). Si no hi ha clip abans/després, no fa res.
**CODI.** `js/workflows/flow_cut.js → runPrevClip / runNextClip`.

### 2.6 Slider PAN (`#sliderZone` + `#slider-move`)

**QUÈ FA.** Re-encuadre **horitzontal** del clip objectiu: el valor és la **X en píxels** del frame (0..608) i s'envia normalitzat a `Anim.sliderApply`.
**REQUISITS.** Cal **armar** el reencuadre amb un **clic a la zona** (mentre no està armat, el slider està `disabled`). Es **desarma** en clicar qualsevol altre control (excepte `◀`, `▶` i `KEYFRAME`).
**MODE.** El panell seguix el clip seleccionat: sense keyframes → mode **SLIDER**; amb keyframes → mode **KEYFRAME** (els canvis van al key del CTI).
**RENDIMENT.** Els moviments intermedis es coalescen (`requestAnimationFrame`, només l'últim vola) i en deixar anar es fa el **COMMIT** (`isFinal`) perquè Premiere refresque.
**FOCUS.** En deixar anar el slider es torna el focus a Premiere (l'ESPAI torna a funcionar).
**CODI.** `js/main.js → setReframeActive / slSend / slFlush` · `jsx/modules/7_KF.jsx` (`Anim.sliderApply`).

---

## 3. Secció CHYRONS

> Precondició comuna: **marcadors verificats**. Els chyrons es col·loquen a partir del mapa de marcadors (`Markers.get()`), no d'una llista fixa de temps.

### 3.1 `🎯` COL·LOCAR (`#btnChyronColocar`)

**QUÈ FA.** Executa, en orde i amb 350 ms entre fases (`main.js → runPlaceAllChyrons`):
1. `Conduct` → `Chyrons.placeChyronConductor`
2. `Titol` → `placeChyronTitol` (Tema-Títol **gran**, `> temaTitolMinSec`; més les **transicions del titulillo**: entrada en CasB i sortides entre temes)
3. `Lloc` → `placeChyronLloc`
4. `Nom` → `placeChyronNom`
5. `Resto` → `placeChyronResto` (tota la resta de rètols, **exclou** conductor/títol/lloc/nom/traducció; inclou la **cadena de grafismes cremats**)
6. `Traducció` → `placeChyronTraduccio`
7. **IPD automàtic**: si hi ha marcadors IPD (turquesa o títol amb `IPD`) → `Markers.runAplicarIpdDesdeMarkers` (aplica zoom+posició al tram; **no** revertix).
8. **Grafismes per marcador**: `Mapa.runFromMarkers` → per a marcadors grocs amb paraula clau al títol (`GRAF_KEYWORDS = ['MAPA']`) col·loca el fitxer de la carpeta del dia; si no hi ha coincidència, obri el navegador.
9. **Focus final**: `targetOnlyV1` + `focusV1` (el slider/KEYFRAME tornen a apuntar a V1).

**Rastreig de grafismes cremats (color + OCR).** Dins de `Resto`, si un ítem porta wotts amb una de les **27 etiquetes** de `titolet.detectRoles` (TITOLET, PREGUNTA, CARTELL, CRONOLOGIA, GRAFICA-BARRES, RANQUING…), `Logic.TitoletDetect` mesura al clip extret **quan entra i quant dura** cada grafisme (mostreig de color + una captura al frame de més cobertura → `bin\ocr.ps1`) i col·loca cada targeta al seu instant real. **No es rastreja mai «per si de cas»** i, si **tots** els wotts porten un `tc` creïble al nom, **no es toca el vídeo**.

**CODI.** `js/main.js → runPlaceAllChyrons` · `js/workflows/flow_chyrons.js → _placeChyronsByType / _placeTitoletChain` · `js/logic/17_TitoletDetect_Logic.js`.

### 3.2 `↔️` REPARTIR traduccions (`#btnChyronRepartir`)

**QUÈ FA.** Repartix les **traduccions seleccionades** (pista `trad`) sobre els **trams de V1 seleccionats**, en slots d'igual duració.
**REQUISITS.** Selecció múltiple: clips de TRAD **+** clips de V1 (`Ctrl+clic`). Si falta qualsevol dels dos, avisa i no fa res.
**LÍMITS.** Cada tram s'atura a l'entrada del següent clip de referència o al marcador següent; si l'espai no dóna per a tots els slots, salta el tram amb avís.
**CODI.** `js/workflows/flow_chyrons.js → repartirChyronTraduccio`.

### 3.3 `🔀` ESTAT de la intro (`#btnChyronCas`)

**QUÈ FA.** Canvia **com s'inserixen** el Conductor i el Tema-Títol a l'inici del bloc:
- **Cas A (intro LLARGA)**: l'obri el **Tema-Títol**.
- **Cas B (intro CURTA)**: l'obri el **Conductor**.

Un clic alterna A⇄B, **re-col·loca l'inici del bloc** (retira el clúster Conductor + Tema-Títol/titulillo i el torna a posar amb l'altre cas, sense moure la resta de la pista) i des d'eixe moment totes les col·locacions d'inici (🎯, REPARTIR, Conductor solt…) eixen amb eixe cas.
**DRECERES.** `Ctrl+clic` = tornar a **AUTO** (auto-detecció per marge), sense tocar el timeline.
**CODI.** `js/workflows/flow_chyrons.js → switchTitolConductorCase / getTitolCaseMode` · `js/main.js → syncChyronCasButton`.

### 3.4 Botons **només TEST**: `COND` `TITOL` `LLOC` `NOM` `RESTO` `TRAD`

Cadascun col·loca **només** eixa família (`placeChyronConductor|Titol|Lloc|Nom|Resto|Traduccio`). Servixen per aïllar un problema sense repetir tot el 🎯.

---

## 4. Secció GRÀFICS

### 4.0 Pistes per defecte (configurables a Setup → tab del programa)

| Clau `tracks.video` | Pista per defecte | Ús |
| :--- | :--- | :--- |
| `mp4` | **V1** | Clip del bloc (cleanFeed extret) |
| `mascara` | **V2** | Màscara / zona protegida |
| `fondos`, `graf`, `graficos` | **V3** | Fons, grafismes del dia (MAPA) i aparcat d'IPD+ |
| `video1`, `trad` | **V4** | Finestra 1 de la Doble Finestra · traduccions |
| `video2` | **V5** | Finestra 2 de la Doble Finestra |
| `tema` | **V6** | Tema-Títol / congelats |
| `chyrons` | **V7** | Rètols |
| `lloc` | **V8** | Lloc/Data |
| `s_s1` / `s_s2` | **S1 / S2** | Subtítols (normal / sintètics) |

### 4.1 `IPD` (`#btnGrafIpd`) — toggle 144 %

**QUÈ FA.** Sobre el **clip seleccionat**:
- si **no** és IPD → aplica `scale 144 %` + `position [-94.5, 562]` i **guarda** l'estat Motion previ;
- si **ja** és IPD (o hi ha estat guardat) → **revertix** a l'estat previ exacte (o a `scale 100 · [304,540]` si no n'hi ha).

Canvia el color d'etiqueta del clip al timeline en aplicar-lo.
**DRECERES.** `Ctrl+clic` = **repassar** tots els clips dels **marcadors IPD** (`Markers.runAplicarIpdDesdeMarkers`). És idempotent: aplica, mai revertix.
**CODI.** `js/workflows/flow_graphics.js → runIpd / _aplicarMotionAClip` · `js/workflows/flow_markers.js → runAplicarIpdDesdeMarkers`.

### 4.2 `IPD+` (`#btnGrafIpdPlus`) — doble finestra **vertical** (toggle per interval)

**QUÈ FA.** Actua sobre l'**interval** que marques a **V1** (selecció de clips de V1; si no n'hi ha, el clip de V1 sota el CTI; les seleccions d'altres pistes s'ignoren) amb la maquinària `IPDPLUS`:
- **APLICAR** (si a V3 no hi ha res a l'interval): 1) el clip de **V2** es retalla a l'interval i s'aparca a **V3**; 2) **V1 es duplica a V2** dins l'interval; 3) Motion: **V1 = capa INFERIOR** (`[1058,812]`, 110 %) i **V2 = capa SUPERIOR** (`[161,197]`, 50 %, `cropBottom 15,1 %`).
- **REVERTIR** (si a V3 ja hi ha clips a l'interval): esborra V2 a l'interval, torna V3→V2 i V1 a l'estat normal.

> **No posa cap PNG de fons**: el «fons» és el clip original aparcat a V3. Vigila la **màscara de V2** (avís informatiu si cau dins l'interval).
**DRECERES.** `Ctrl+clic` = **reset** de l'estat del flux (com a la DF).
**CODI.** `js/workflows/flow_graphics.js → runIpdPlus / IPDPLUS / _ipdPlusAplicar / _ipdPlusRevertir`.

### 4.3 `🪟🪟` Doble pantalla **horitzontal** (`#btnGrafDoblePantalla`)

**QUÈ FA.** En **un clic** executa el cicle complet PAS0→PAS4:
`PAS0` CTI sobre el clip 16:9 de V1 (si no hi és, avisa) → `PAS1` V1→**V4** → `PAS2` duplica a **V5** → `PAS3` fons a **V3** → `PAS4` Motion de les dues finestres (i gestió d'àudio perquè no es duplique).
**DRECERES.** `Ctrl+clic` = **reset** (`resetDoblePantalla`). Mentre treballa, el botó mostra `DblPant…`; si un pas falla, s'atura i ho diu al log.
**CODI.** `js/workflows/flow_graphics.js → runDoblePantalla / _dpPaso0..4`.

### 4.4 `🎨` Gràfica / MAPA del dia (`#btnMapaImport`)

**QUÈ FA.** Importa el grafisme de la carpeta del dia (`rutas.grafismos\{fecha}`) i el col·loca a la pista de grafismes (**V3**) **des del cabezal**:
1. Referència = clip **seleccionat** o, si no, el clip de la pista MP4 sota el CTI.
2. L'**espai hàbil** és el d'eixe clip (fins al seu final); al final s'hi afig un **congelat de fins a 3 s** (o fins al final del clip).
3. L'ítem d'escaleta (coincidència de **nom**) és el del **marcador anterior** al cabezal → només servix per triar el fitxer, **no mou** el grafisme.
4. Si no hi ha coincidència de nom → **navegador de fitxers** (opció única de disseny, sense finestra prèvia).
5. El congelat PNG que hi haja davall (a V3) es replica a la pista de tema-títol (**V6**) fins al final del clip; només s'accepta **imatge fixa** (un `.mov` no és congelat).

**CODI.** `js/workflows/flow_mapa.js → run / _flow / _freezeUnderCti / _freezeGrafEnd`.

### 4.5 `🗺️` MAPA ZOOM (`#btnGrafMapa`)

**QUÈ FA.** Puja el clip **seleccionat** a **V4** (`video1`) i el posa en mode «mapa»:
- fons genèric (`3CatInfo_VERTICALITZACIO_Fons-per-videos.png`) a **V3**, dins del rang del clip;
- al clip de V4: **escala 48 %** i **Y = 447** (la X no es toca: la pots ajustar amb el slider).

Insert amb **ripple** a V4 per no pisar mapes anteriors i retrim posterior; al final torna el focus a V1.
**CODI.** `js/workflows/flow_graphics.js → runMapa / _colocarFonsMapa`.

### 4.6 `🗿` TÒTEM (`#btnGrafTotem`)

**QUÈ FA.** Només toca l'**escala X** del clip seleccionat: `Scale Width = 126 %` i desactiva *Uniform Scale*. L'escala (Y) i la posició **queden com estaven**.
**CODI.** `js/workflows/flow_graphics.js → runTotem`.

---

## 5. Secció SUBTÍTOLS

> Model mental: **primer es carrega un `.srt` a l'EDITOR** (taula), s'edita allà, i només en **💾 GUARDAR** s'exporta al timeline com a **pista de subtítols** (`S1`/`S2`). Cap botó del panell importa ja un `.srt` directament al timeline.

### 5.1 `⬇️` CARREGAR (`#btnSrtLoad`)

**QUÈ FA.** Carrega el `.srt` del **bloc de 15 min** del dia (`SrtEditor.loadEmergencySrt`) i l'obri a l'editor. És l'**únic** mecanisme de càrrega.
**REQUISITS.** El `manifest` del bloc ha de tindre el **rang** (`ref.worldBlockStartSec` / `worldBlockEndSec`). Sense eixe rang no se sap quins `.srt` de 15 min toquen ni com alinear l'eix, i el carregador **no inventa res**: deixa al `FASTPASS.log` `⚠️ SRT_EMERGENCIA: el manifest NO té rang de bloc (worldStart=null, worldEnd=null) … → executa NOU o FOTO de l'escaleta`. **Mode correcció** (projecte d'ahir obert hui): si el manifest de la *data de treball* no té rang, es reintenta amb la data i el bloc de la **carpeta del projecte obert** (`_projectCtxFromPath`) i el log diu `🔁 … provant el del PROJECTE OBERT` / `✅ … manifest del projecte obert` (BUG #185b). Cada eixida del carregador (programa no seleccionat/sense carpeta, `rutas.subtitulos` buida, carpeta inaccessible, `prefix` del dia sense cap `.srt`, cap entrada dins la finestra, `.srt` il·legible) escriu **el motiu** al log; abans només eixia el genèric «no s'ha carregat cap .srt» i semblava que el botó estiguera trencat (BUG #185).
**EIX DE TEMPS (BUG #186).** La conversió món → media és `media = TC_món − ref.worldSecMediaStart`, i prou: eixa dada **ja** és el TC on comença el media 0 del clip (per als extractes, `extractedClip.extractedWorldSecMediaStart`). `ref.mp4ExpandedInPoint` és una coordenada **dins** del MP4 i **no se suma** (sumar-la desplaçava tot l'SRT eixos segons abans del clip: l'usuari veia els subtítols «molt del principi»). El log ho deixa explícit — `base de temps = món <X>s (media 0) → bloc a <N>s dins del MP4 del clip · manifest: tlBlockInPointSec=… mp4ExpandedInPoint=… (NO se suma…)` — i, si la base calculada no quadra amb `tlBlockInPointSec` (±0,5 s), avisa amb `⚠️ … desviació de Ns`.
**DRECERES.**
- `Ctrl+clic` = **SUBTÍTOLS SINTÈTICS** del dia (`rutas.subtitulosSinteticos`). Un segon `Ctrl+clic` **torna** al SRT normal (les vistes es guarden a memòria i conserven les edicions).
- **MATEIX PROGRAMA, SEMPRE (BUG #187).** El `.srt` sintètic ha de **començar pel codi del programa** (`archivo` o `wott` del perfil: `TN_COMARQUES_…` / `TNC_…`; s'admet un `YYYYMMDD_` davant). El nivell «qualsevol `.srt` de la data» va fer carregar `MATINS_V5_GUIO_LA_PLOMA_…` en el bloc `TN_COMARQUES V3` (0/68 frases en comú). Sense candidat del programa → **no es carrega res** i el log diu `Cap .srt sintetic del programa <X> el <YYYYMMDD> … Descartats N del dia: …`.
- **DATA = LA DEL PROJECTE OBERT (BUG #187).** `_srtCtx` resol la data amb `Context._resolveProjectDateDir` (path real del `.prproj`; després `State.projectDateDir`, `State.dateDir` i el rellotge) i el log diu `📅 SRT_CTX: data de treball = <data> (projecte obert)`. Abans es buscava amb la data del **rellotge** (`State.dateDir`), així que editant el projecte d'ahir es miraven els sintètics d'avui.
- Un SINT d'un altre programa que ja estiga en memòria **es descarta** (`_sintBelongsTo`) en lloc de reutilitzar-se (`⚠️ … NO és del programa <X> → es descarta`).
- ~~`Alt+clic`~~ (fallback a la carpeta de VERTICALITZACIÓ): **retirat** el 2026-10-23.

**CODI.** `js/main.js` (handler) → `js/workflows/flow_srt.js → runSrtLoad / runSrtLoadSynthetic`.

### 5.2 `💾` GUARDAR (`#btnSrtExport`)

**QUÈ FA.** Exporta la taula que es veu al timeline (`SrtEditor.exportToPremiere`):
1. Escriu un `.srt` **únic** a la carpeta del projecte: `<nom>_MOD_<timestamp>.srt` (evita que Premiere retorne la versió antiga).
2. Convertix temps de **MEDIA → TIMELINE** (resta l'origen del clip: `SrtEditor._entriesToTimeline`).
3. Neteja **només els clips del TRAM que escriu** dins de la pista de destí (els que **solapen** amb el rang exportat) i els `_MOD.srt` antics del projecte. Ja **no** buida la pista sencera: abans una exportació esborrava els subtítols que ja hi havia («ha eliminat els clips que hi havia», BUG #186). Al log queda `tram [A → B] netejat a S<n>: OK_removed_<n>_kept_<n>`.
4. Col·loca damunt de la pista **existent** (conserva l'estil); si no n'hi ha, crea una pista nova.

**PISTA PER DEFECTE.** `NORMAL`/`MOD` → **S1** · `SINT` → **S2**.
**DRECERES.** `Ctrl+clic` = **AFEGIR NOMÉS EL QUE FALTA** (`{ track: 1, onlyMissing: true, colorLabel }`): llig els clips de subtítol que ja hi ha a la seqüència (`_existingSubRanges`, totes les pistes) i **descarta** les entrades que ja en tenen un (±0,2 s), escriu a **S2** i pinta el `.srt` nou amb l'etiqueta `general.srtGapColorLabel` (7 = Mango). Log: `NOMÉS BUITS → X/Y entrades … · N clips de subtítol existents`.
**CODI.** `js/editor/srt_editor.js → exportToPremiere / _entriesToTimeline / _existingSubRanges` · `jsx` (`placeSrtOnExistingSubtitleTrack`, `setItemColorLabel`, `createCaptionTrack`).

### 5.3 `♻️` RESET subtítols (`#btnSrtReset`)

**QUÈ FA.** (1) Torna la taula al seu estat inicial, **esborra els marcadors de l'editor** (memòria **i disc**) i **trau els clips de subtítols de la seqüència**; (2) **torna a carregar el mateix `.srt`** que hi havia (amb `skipMarkerRestore`); si no n'hi havia cap, carrega l'emergència de 15 min.
> Ja **no** busca cap `.srt` alternatiu al NAS.
**CODI.** `js/workflows/flow_srt.js → runSrtReset` · `js/editor/srt_editor.js → resetToOriginal / loadSrt`.

### 5.4 `🧩` REOMLIR buits (`#btnSrtFill`)

**QUÈ FA.** Afig al SRT normal **només** les entrades **SINT** que hi **falten**, dins d'un **buit** (tolerància `general.srtSyntheticGapTolSec`, 0,2 s). El resultat és una vista **MOD**: el SRT normal **no es modifica** i el fitxer original no es toca. Després de fusionar, **col·loca els clips nous al timeline** (`SrtEditor.exportGapClips`): només eixos, a la pista **S2** i amb **etiqueta de color pròpia** (`general.srtGapColorLabel`, 7 = Mango) per a distingir-los del SRT base, que es queda intacte (BUG #186). Si no s'afig res, no toca el timeline.
**COM COMPARA.** Per **TC** (solapament ±tolerància) **i per TEXT** (`SrtParser._normText`: minúscules, sense accents ni puntuació): si la mateixa frase ja hi és a ±10 s (`textNearSec`), no es duplica encara que el TC dels dos motors no quadri → `duplicat-text`.
**REQUISITS.** Cap: si els SINT **no** estan en memòria, els **carrega ell** de `rutas.subtitulosSinteticos` (un sol clic). Al log queda `SINT=<fitxer> (N entrades)` i el desglossament dels descartats (`solapa` / `duplicat-text` / `fora-del-tram`). El SINT que es carrega és **sempre del mateix programa** i de la data del **projecte obert** (BUG #187); un SINT d'un altre programa que hi haja en memòria es descarta (`⚠️ SRT_FILL: el SINT en memòria «…» NO és del programa … → es descarta i es rellegeix de la carpeta`).
**GUARDA DE PERTINENÇA.** El filtre de **programa** és dur (BUG #187: mai un `.srt` de MATINS en un bloc de TN_COMARQUES), però dins del programa el Scanner pot caure al **nivell 2** (qualsevol bloc del mateix dia) si no hi ha el bloc exacte al nom. Abans d'aplicar res es mesura `SrtParser.textOverlap(base, sint)`: si coincidixen en **menys del 20 %** de les frases (i el SINT té ≥10 entrades), el log ho marca `⚠️ … pot ser d'un ALTRE bloc/guio` i el panell avisa. La línia `SINT↔NORMAL comparteixen X/Y frases (Z%)` ix sempre.
**CODI.** `js/workflows/flow_srt.js → runSrtFillGaps` · `js/editor/srt_editor.js → mergeSyntheticGaps / exportGapClips` · `jsx → setItemColorLabel` · `js/logic/10_Srt_Logic.js → mergeSyntheticGaps / _normText / textOverlap`.

### 5.5 `🗑️` ESBORRAR (**RETIRAT el 2026-10-23** · abans `#btnSrtDel`)

**PER QUÈ.** Era **redundant**: `Supr` / `Backspace` fan exactament el mateix (`SrtEditor.deleteSelected`) sobre els clips seleccionats al canvas. El botó es va llevar de la fila SUBTÍTOLS (que ara queda 3+3: `⬇️` `💾` `♻️` / `🧩` `IN` `OUT`).
**COM S'ESBORRA ARA.** Clic al clip (o `Ctrl`/`Shift` per a multi-selecció) → **`Supr`**. Si ja estava exportat, **pregunta** si també s'ha d'esborrar del timeline (mai toca altres pistes).
**CODI.** `js/editor/srt_editor.js → deleteSelected` (viu, cridat per `_initKeys`).

### 5.6 `IN` / `OUT` de subtítols (`#btnSrtIn` / `#btnSrtOut`)

No «seleccionen» un clip: **retallen la taula** i deixen marcadors.
- **IN**: elimina les entrades **anteriors** a la que hi ha davall del cabezal i fa començar la peça a **0,4 s** (10 frames a 25 fps) — el primer subtítol no pot nàixer a 00:00. Afig/ancora el **marcador d'inici** i cenyeix la finestra d'edició.
- **OUT**: elimina les entrades **posteriors** a la que hi ha davall del cabezal i afig el **marcador final** al final de l'últim clip.

> Els canvis viuen a la **taula**; al timeline només arriben en **💾 GUARDAR**.
**CODI.** `js/editor/srt_editor.js → applyIn / applyOut` · `Logic.SrtParser.applyTrimIn/applyTrimOut`.

### 5.7 L'EDITOR (canvas + barra de zoom + visor)

| Zona | Acció |
| :--- | :--- |
| **Regla** (part superior) | Clic = mou el **cabezal** (i el de Premiere). És l'ÚNIC lloc que fa *seek*. |
| **Cos d'un clip** | Clic al **centre** = seleccionar/deseleccionar · `Ctrl+clic` = afegir/levar de la selecció · `Shift+clic` = rang |
| **Zona buida** | Buidar la selecció |
| **Clic dret** (zona de treball) | **Crear** marcador (snap al límit del subtítol) · damunt d'un marcador = **esborrar-lo** |
| **Arrossegar un marcador** | Mode **acordió**: escala les entrades del segment (i mou la cua posterior) sense creuar els veïns |
| **`Supr` / `Backspace`** | Esborrar els subtítols seleccionats |
| **Barra de zoom** | Arrossega els extrems per fer zoom; arrossega el centre per desplaçar |
| **Visor + HUD** | Vídeo de referència amb els subtítols creuats i `— · — fps` |

**Vistes.** `NORMAL` (blau) · `SINT` (taronja) · `MOD` (fusió). Canviar de vista **no** relix el fitxer.
**Persistència.** Els marcadors es desen al costat del `.srt` (`fastpass_srt_markers_<srt>.json`) amb **empremta** del contingut, i una còpia a `C:/temp`: si el SRT canvia, no es re-injecten marques velles.
**CODI.** `js/editor/srt_editor.js → init / _initKeys / _initZoomBar / _applyAllMarkers / _persistMarkers`.

---

## 6. Secció RENDER

### 6.1 `📹` VÍDEO (`#btnRenderVideo`)

**QUÈ FA.** Render **directe de Premiere** (no AME) de la seqüència activa:
1. Destí = `rutas.render1` (resolt amb `{tokens}`, inclòs `{project}`); si està buit → carpeta del projecte → `workFolder`. Crea l'arbre de carpetes **abans** d'exportar.
2. Nom = `<PROG>_<TEMA>_<HH_MM>.mp4` (`buildRenderName`; `PROG` i `TEMA` es dedueixen del nom de la seqüència i, si cal, del projecte).
3. Preset: el primer `.epr` vàlid (> 1 KB) de `presets/`, amb preferència `VERTIKAL XXX.epr` i `H264_2Pass_Vertical.epr`. Si falta o pesa 0 → error clar, no exporta.
4. **Retalla la cua a l'OUT** de la seqüència abans d'exportar (`_trimTailAtOut`).
5. Exporta i **publica**: 1 render + còpies a `render2` (els destins iguals a l'origen s'ometen).
6. Desa `State.lastRenderName` / `lastRenderMp4` (la PORTADA agafa d'ací el nom i l'hora exactes).

**CODI.** `js/workflows/flow_render.js → runVideo / _rutaExport / buildRenderName / _publishVideo`.

### 6.2 `🖼️` PORTADA (`#btnRenderPortada`)

**QUÈ FA.** Exporta un **PNG del frame que hi ha davall del cabezal** a `rutas.portadas` (o a la carpeta del projecte si la ruta està buida):
- munten una **zona neta** temporal (còpia del clip en una pista lliure) perquè el PNG no arrossegue rètols/grafismes, capturen amb QE i **restauren** el timeline (IN/OUT, àrea de treball, clips i àudio orfe);
- el nom és el **mateix** que el del vídeo (`PROG_TEMA_HH_MM.png`), agafat del render d'aquesta sessió o del MP4 més recent de la carpeta de publicació.

**REQUISITS.** Cabezal fixat (si no qualla, **llança** abans que donar un PNG d'un altre frame).
**DURADA.** 10–30 s: el botó queda **ocupat** (`⏳`, deshabilitat) i la re-entrada es descarta.
**CODI.** `js/workflows/flow_render.js → runPortada / _runPortadaBody / _resolvePortadaName` · `js/logic/18_Portada_Window.js`.

### 6.3 `✅` VALIDAR / TANCAR (`#btnRenderClose`)

**QUÈ FA.** **Desa** el projecte (`save()`), el **tanca** (`closeDocument`) i **elimina el `.lock`**. Verifica que el projecte ha deixat de ser obert (2 intents). Neteja l'editor SRT (timeline + waveform) perquè no es puga editar sense projecte.
**CODI.** `js/workflows/flow_render.js → runClose` · `js/logic/3_Project_Logic.js → close / _removeLock` · `jsx/modules/3_Project.jsx → close`.

---

## 7. Secció MARCADORS (**només TEST**)

| Botó | Workflow | Què fa |
| :--- | :--- | :--- |
| `1·SIL` | `Markers.sil_dump` | Bolca al log el **mapa de silencis** del `.bin` de referència (480 Hz). Només lectura: **no mou res**. |
| `2·C0` | `Markers.capa0_prep` | **Capa 0**: referència del clip + context d'assembly + classificació d'ítems + **marcador d'inici a 00:00** (immutable). |
| `3·C1` | `Markers.capa1_onAir` | **Capa 1**: densitat de corts + mapa de silencis, resol cada ítem per consens (**SILENCI → CORT a prop → OnAir**), valida contra el material de V1, publica el Δ i **congela** estos marcadors. |
| `F2 Dedu` | `Markers.placeDeducedOnAirMarkers` | Marcadors OnAir **deduïts**. |
| `F3 Prev` | `Markers.placeScheduledMarkers` | Marcadors **previstos** (coincidències d'escaleta). |
| `F3.5 Correl` | `Assembly.correlationSnapMarkers` | *CorrelationSnap* als corts de vídeo. |
| `F4 Dens` | `Assembly.snapFaroMarkers` | *DensitySnap* / faros. |
| `F5 Inferits` | `Markers.placeInferredItems` | Ítems inferits de l'escaleta. `Ctrl+clic` = antic `snapOrphanMarkers` (orfes a corts propers). |
| `F6 Ordre` | `Markers.enforceMarkerOrder` | Garantix l'**ordre** dels ítems estructurals (el faro no es mou; un ítem invertit va al tall anterior). |
| `F6 GF` | `Markers.placeGraphicMarkers` | Marcadors **grocs** dels ítems gràfics de l'escaleta (P2 foto, P2 MAPA, GF, TE…). |

**Colors.** Verd (inici/estructural), groc (gràfic), turquesa (IPD), vermell (no agrupat)… detall a [`docs/specs/MARKER_COLORS.md`](../specs/MARKER_COLORS.md).

---

## 8. Taula de gestos ocults (la chuleta)

| Control | Gest |
| :--- | :--- |
| `MAIN` | **Ctrl** = AHIR (canvia la data de treball i executa) |
| `📷 FOTO` | **Ctrl** = foto d'AHIR |
| `KEYFRAME` | **Ctrl** = probe de `Position` (diagnòstic) |
| `🔀` | **Ctrl** = tornar a **AUTO** |
| `IPD` | **Ctrl** = repassar els clips dels **marcadors IPD** |
| `IPD+` | **Ctrl** = **reset** de l'estat del flux |
| `🪟🪟` | **Ctrl** = **reset** de la Doble Finestra |
| `⬇️` (SRT) | **Ctrl** = SINT ⇄ NORMAL |
| `💾` (SRT) | **Ctrl** = afegir **només el que falta** (a **S2**, amb etiqueta de color) |
| Editor SRT | `Ctrl`+clic = multi-selecció · `Shift`+clic = rang · `Supr` = esborrar · clic dret = marcador |

---

## 9. Diferències respecte de l'esborrany inicial (2026-10-23)

L'esborrany de funcionalitats era correcte en l'esperit, però estos punts **no** coincidien amb el codi i s'han corregit ací:

1. **MAIN** no és «NOU/CREAR/ACTUALITZAR» sinó **CREA · ACTUAL. · ESPERA · MASSA D'HORA · BLOQUEJAT: <autor>**, i el clic en els dos estats d'espera **fa un “pull”** (repintat immediat), no «no fa res».
2. **CREAR no importa els grafismes.** Importa **rètols (Bin CHY)** + **portada (Bin PORTADES)**, extreu/inserta el clip i calcula bounds; els grafismes entren després (🎨, 🗺️, 🗿, DF…).
3. **CREAR pot eixir SENSE V1** si el bloc cau fora del rang del cleanFeed (o la ingesta és curta): el projecte es crea igualment i es completa amb **ACTUAL.**.
4. **`RESET` no només tanca i esborra**: verifica l'esborrat total i **torna a crear** el projecte de zero; si queda una resta, **no crea res**.
5. **`IN`** també **desplaça l'OUT** i **recol·loca els marcadors**, i avisa (sense bloquejar) si retalla > 30 s.
6. **`OUT & GO`** no col·loca chyrons; en TREBALL encadena **10 fases** (OUT, TROSSEJA i 8 de marcadors) i desa un **snapshot**.
7. **El slider** s'ha d'**armar** (clic a la zona), actua sobre el **clip seleccionat** i té mode **SLIDER/KEYFRAME**; no hi ha «doble clic per centrar».
8. **El «botó X»** és **🔀** i no mou posicions lliurement: alterna **Cas A/B** (intro LLARGA/CURTA) i re-col·loca l'inici del bloc.
9. **El rastreig color+OCR** no depén de «clips de grafisme al BIN»: depén de les **27 etiquetes** `titolet.detectRoles` dels wotts de l'ítem, i s'estalvia si el wott porta `tc`.
10. **SRT IN/OUT** no «seleccionen el primer/últim clip»: **retallen la taula** (i deixen marcadors). **CARREGAR** és només 15 min (+ `Ctrl` = SINT); l'`Alt+clic` ja no existix.
11. **PORTADA** no exporta «el frame del cabezal» a seques: munten una zona neta temporal, capturen i **restauren** el timeline, amb el **mateix nom que el vídeo**.
12. **VÍDEO** no va a AME: **render directe de Premiere** amb preset `.epr` + còpia a `render2`.
13. **El «logIn»** del Setup es diu **“Nom de l'Editor (Nick)”** (`general.autor`) i servix per al `.lock`, `{autor}` i `{project}`.

---

## 10. Annex · De botó a codi (per a manteniment)

| id HTML | Handler (main.js) | Workflow |
| :--- | :--- | :--- |
| `btnReset` | `callWorkflow('MainButton','runReset')` | `flow_mainButton.runReset` |
| `btnFetchEscaleta` | inline | `escaleta_reader.fetchNewEscaleta` |
| `btnMainAction` | `Context._onMainClick` | `flow_mainButton.runMainAction` |
| `btnIn` | `callWorkflow('Cut','runCutIn')` | `flow_cut.runCutIn` |
| `btnScene` | `Cut.runScene` | `flow_cut.runScene` |
| `btnOut` | `runOutHandler` | `flow_cut.runCutOut` (+ `runFullPipelineOut`) |
| `btnKey` | `KF.runAddKF` | `flow_KF.runAddKF` |
| `btnPrevClip`/`btnNextClip` | `Cut.runPrevClip/runNextClip` | `flow_cut` |
| `btnChyronColocar` | `runPlaceAllChyrons` | `flow_chyrons` (6 fases) + `flow_mapa.runFromMarkers` |
| `btnChyronRepartir` | `Chyrons.repartirChyronTraduccio` | `flow_chyrons` |
| `btnChyronCas` | `Chyrons.switchTitolConductorCase` | `flow_chyrons` |
| `btnGrafIpd` | `Graphics.runIpd` / `Ctrl`→`Markers.runAplicarIpdDesdeMarkers` | `flow_graphics` / `flow_markers` |
| `btnGrafIpdPlus` | `Graphics.runIpdPlus` | `flow_graphics` |
| `btnGrafDoblePantalla` | `Graphics.runDoblePantalla` | `flow_graphics` |
| `btnMapaImport` | `Mapa.run` | `flow_mapa` |
| `btnGrafMapa` | `Graphics.runMapa` | `flow_graphics` |
| `btnGrafTotem` | `Graphics.runTotem` | `flow_graphics` |
| `btnSrtLoad` | inline | `flow_srt.runSrtLoad` / `runSrtLoadSynthetic` |
| `btnSrtExport` | `SrtEditor.exportToPremiere` | `srt_editor` |
| `btnSrtReset` | `Srt.runSrtReset` | `flow_srt` |
| `btnSrtFill` | `Srt.runSrtFillGaps` | `flow_srt` |
| `btnSrtIn`/`btnSrtOut` | `SrtEditor.applyIn/applyOut` | `srt_editor` |
| `btnRenderVideo` | `Render.runVideo` | `flow_render` |
| `btnRenderPortada` | `Render.runPortada` | `flow_render` |
| `btnRenderClose` | `Render.runClose` | `flow_render` |
| `btnSetup` | `Config.toggleSetup` | `flow_config` |
| `btnMode` | `applyLayoutMode` | `main.js` |









