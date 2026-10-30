# FEATURES — catàleg únic d'implementacions

> **Únic lloc** on viu l'estat de les funcionalitats i implementacions. Actualitzat: **2026-10-30**.
> Els bugs viuen a [`BUGS.md`](BUGS.md).
>
> Tres estats possibles: **validada** (provada en viu a Premiere),
> **pendent de validar** (codi fet, falta la prova en viu),
> **en cua** (dissenyada o apuntada, sense codi).

**Resum**: 19 validades · 13 pendents de validar · 6 en cua.

---

## 1 · Conseguides i validades (19)

### 1.1 Funcionalitats de producte

| Codi | Nom | Estat | Què fa |
|---|---|---|---|
| `NEW_PROJECT` | Creación de Proyecto (NOU) | active | Abre plantilla .prproj, importa MP4 cleanFeed con trim de precisión, Wotts (CHY), SRT y portadas. Montaje automático en timeline. |
| `ESCALETA_JSON` | Integración de Escaleta JSON | active | Lectura de snapshots JSON desde NAS. Cálculo IN/OUT con handles 20s. Mapeo bloque↔líneas via 'agrupacio'. 9 módulos en js/core/escaleta_.js. |
| `PRECISION_TRIM` | Trim de Precisión (Tier0/Tier1/Tier2) | active | Sistema 3-tier para IN/OUT del MP4. Tier0: video anterior (mismo agrupacio). Tier1: items estructurales OnAir. Tier2: siguiente video OnAir. Filtro… |
| `RIBBON_EDITING` | Edición Rápida de Vídeo | active | IN (Ripple Trim), OUT (cierre con limpieza de pistas), navegación ◀/▶ entre clips, Slider posición X para reframing 9:16. |
| `WOTT_PLACEMENT` | Colocación de Rètols (Wotts) | active | Parseo de .mov en CHYRONS: [PROGRAMA]_[DATA]_[BLOC]_[ID]_[TIPUS]_[TEXT]. Colocación por timestamp: V4 (Nomcarrec/Firma/Tema-Titol), V6 (LlocData), V7/V8 (Enviat/Directe). Regla de plató (2026-10-27, #195): la capçalera `01BT`/`01PG` (sufijo `bt`/`pg` o título `PG bona tarda/bona nit`) es plató → el rètol del conductor se queda al inicio del bloque (0,40 s) y no cae al directe/conexión posterior. |
| `SUBTITLES` | Gestión de Subtítulos (SRT) | active | Editor SRT (visor + waveform + marcadors). CARREGAR ⬇️: blocs de 15 min i, si no n'hi ha, FALLBACK al .SRT de la carpeta de verticalització… |
| `RENDER` | Render y Exportación | active | VÍDEO: exportAsMediaDirect DIRECTAMENT a la carpeta de publicació rutas.render1 (EXPORTS PROVISIONALS del NAS public.ad-ccrtv.local) amb el preset… |
| `CONTEXT_SYSTEM` | Sistema de Contexto (Semáforos) | active | Síntesis de estado: NEW/UPDATE/GO/LOAD. 4 semáforos visuales (JSON, MP4, Rètols, Subtítols). Inspectors: SourceAssets, App, Session. |
| `KEYFRAMES` | Motor de Keyframes e Interpolación | active | Auto-reframe inteligente 16:9→9:16. Interpolación: LINEAR, BEZIER, HOLD. Escala base 47%, offset vertical automático. |
| `FFMPEG` | Integración FFmpeg | active | Procesamiento de vídeo externo vía FFmpeg. Render limpio, clean-swap de clips. |
| `RESET_GENERAL` | Reset General del bloc (botó 🔄) | resolt | Botó 🔄 a la cantonada superior esquerra de la secció INICI (sobre l'etiqueta, a l'esquerra del semàfor ESC; marge 6px, 22×22px). Un clic: (1) tanca… |
| `TITOLET-DETECT` | Detección TITOLET al cleanFeed (color + OCR) | implemented_pending_premiere_test | Detección del rótulo TITOLET en el vídeo quemado (máscara #F25F13 ±25 + OCR vía bin/ocr.ps1) para decidir si la tarjeta de la cadena conserva la… |
| `BURNED_GRAF_TYPES` | Grafismes cremats — disparo del rastreig per ETIQUETA… | implemented_pending_premiere_test | DISPARO PER ETIQUETA LITERAL (2a passada 2026-10-08; la 1a era per prefix i quedava massa lax). El rastreig del grafisme cremat (màscara de color +… |
| `TITOLET_ROI_PER_ROL` | Rètol cremat — ROI per ETIQUETA (roiPerRole/roiDefault) +… | implemented_pending_premiere_test | 7a passada (2026-10-08, ZERO JSX nou). Mesura real (TNM V3, 13:39): els 6 PREGUNTA d'un ítem → 0 intervals, perquè el rètol d'aquella família NO viu… |
| `TITOLET_MULTICOLOR` | Rètol cremat — MULTI-COLOR per etiqueta (facets: color +… | implemented_pending_premiere_test | 8a passada (2026-10-09, ZERO JSX nou). Petició d'usuari: «poder detectar més d'un color per tipus de grafisme; cal definir per a cada tipus quins… |
| `NNEWS` | Integración Natural News (NNews) | planned | Clean-Swap workflow: sustituir clips con gráficos quemados por versiones limpias desde NNews. Análisis de formato .nnp/.nzp/.xml. |

### 1.2 Implementacions tancades el 27/10 (validades per l'usuari)

| Codi | Què és | On |
|---|---|---|
| **#177a** | Desar CONFIG GRAL sense `EvalScript error` (el pont escrivia `Profile.json` a mitges) | `setup.html`, `jsx/modules/*` |
| **#177b** | Selector de rutes 📁 amb el diàleg modern de carpetes del Windows | `scripts/pick_folder.ps1` |
| **#177c** | Rutes de subtítols sintètics aplicades des de CONFIG | `Profile.json`, `js/logic/10_Srt_Logic.js` |
| **#178** | DASHBOARD `setup.html` a la mida de la finestra principal (13px, sense escales) | `setup.css` |
| **F2.3** | Semàfors `MASSA D'HORA` / `ESPERA` / `CREA` + `Scanner.mp4Today` | `js/core/4_Context.js`, `js/logic/Scanner.js`, `js/workflows/flow_mainButton.js` |
| **F3** | Editor de subtítols: selecció, esborrat, SINT, reomplir | `js/editor/srt_editor.js`, `js/workflows/flow_srt.js`, `js/logic/10_Srt_Logic.js` |
| **INICI** | Botó `INICI` **sense** `Ctrl` = treballa **AVUI** (`Ctrl` = ahir/correcció) | `js/core/4_Context.js` (`_targetDateDir`), `js/main.js` (FOTO) |
| **TEXT CLIP** | Text del clip al sub-editor de subtítols (lectura i escriptura del text del clip seleccionat) | `js/editor/srt_editor.js`, `js/logic/10_Srt_Logic.js` |

---

## 2 · Pendents de validar (13)

Codi fet, **només** falta la prova en viu a Premiere. Les quatre de rètol cremat TITOLET es
proven amb un cleanFeed real (`2026_10_25/V3/TNM_V3`, bloc vertical); referència tècnica:
[`docs/reference/TITOLET_DETECT.md`](docs/reference/TITOLET_DETECT.md).

| Codi | Què ha de fer | Com es valida |
|---|---|---|
| `TITOLET-DETECT` | Detectar el rètol TITOLET al cleanFeed (color + OCR) i marcar-lo | El detector ha de trobar el TITOLET i **no** confondre'l amb el titullet ni el Tema-Títol |
| `BURNED_GRAF_TYPES` | Disparar el rastreig de grafismes cremats **per ETIQUETA** | Cada etiqueta (`GF`, `P2`, `TITOLET`…) amb el seu tipus; cap gràfic tractat com a estructural |
| `TITOLET_ROI_PER_ROL` | ROI del rètol cremat **per etiqueta** (`roiPerRole` / `roiDefault`) | La ROI de cada etiqueta encerta el rètol a la imatge (7a passada) |
| `TITOLET_MULTICOLOR` | MULTI-COLOR per etiqueta (facets: color + posició) | Un mateix rètol amb dos colors/posicions distintes es detecta sencer (8a passada) |

| `F8_SEPARACIO` | `#192` · **cap marcador superposat**: separació per orde d'escaleta (gap 3 s, OnAir ancorat) | OUT&GO sobre un bloc: cap parell de marcadors a <0,20 s i orde d'escaleta respectat (cas de referència antic `01 TE-1@0 · 01 TD-1@3 · 01BT@6 · 01dir@9`; **des de R1/R2 mana `01BT@0`** i els gràfics van per F6·GF) |

| `FIX_INICI_BLOC` | `#193` · inici del bloc = primer estructural **en orde d'escaleta**; F5 amb **cadena de durades**, finestra degenerada oberta i **hora fora del material descartada** (R1+R2+R4+R6) · `#194` **els gràfics mai s'ancoren a un directe** | `01BT @ 0,00` · `01dir @ 34,52` · `02 @ 41,08` · `01 TE-1 @ 10,00` i `01 TD-1 @ 15,00` (grocs, dins del DonaPas `01BT`, cap a dins de la connexió `01dir`) |

| `BOOT_FAST` | **`#113` · arrencada sense el llistat JSX de portades** (17,9 s de 18) ni el d'`ingestAssets`: la carpeta de rètols es llista amb `cep.fs.readdir` (noms, caché 30 s) i es daten només els candidats (`_dateCandidates`). També: el poll de 15 s ja no escriu a `_boot_timing.log` (`Boot.mark(label, lvl, durMs)`) | Reiniciar en fred amb el panell net: `_boot_timing.log` ha de mostrar `_fullScan · portades` en **mil·lisegons** (no 17,9 s), cap línia `[post] … readFolder NAS` repetida i cap espera llarga després d'`ARRENCADA COMPLETA`; després fer un CREAR i comprovar que `[INGEST] Datació selectiva` ix en poques desenes de ms |
| `BOOT_HIST` | `#113` · **històric d'arrencades** (`_boot_timing_hist.log`, una línia per sessió amb `arrencada`, `total` fins al **primer pintat**, `nav→main`, `DCL` i marca **`1R DEL DIA`**) + marca `primer pintat` per `rAF`×2 | Reiniciar el PC, obrir Premiere i mirar que `_boot_timing_hist.log` tinga **una** línia nova amb `1R DEL DIA`; reobrir el panell i comprovar que la mesura anterior **no** s'ha perdut |

| `CHYRON_OUT_POLICY` | `#201` · **NomCàrrec i connexions (Enviat/Directe/Presencial) acaben amb el seu clip de referència**; LLOC/DATA, FIRMA i grafismes conserven la durada pròpia (#197). El **decalatge de 10 frames** només al primer clip del timeline. Predicats purs `_esRetolAcotat` i `_esPrimerClipTimeline` | TNC V2 amb tres nom-càrrec seguits: cada rètol entra **al seu corte** (no al final de l'anterior) i acaba amb el seu clip (`📐 … (acurtat per final del clip de referència)`); els de Lloc/Data i Firma segueixen amb durada pròpia; només el primer rètol del timeline entra `+10f` |

| `GRAF_ANCLA_MARCADOR` | `#203` · **El grafisme va al MARCADOR del seu ítem, no al cabezal ni al marcador seleccionat**: `_anchorMarker` puntua el nom de cada fitxer triat contra els marcadors numerats (`_scoreNombre` = Dice per bigrames + `_normFon`: B→V, Y→I, C+E/I→S, QU→K, plural -S) i ancora a l'**inici de la LÍNIA** del millor (`ANCHOR_LINE`), amb llindar `MATCH_MIN`=0,60 i desempat pel més pròxim al cabezal; sense coincidència es manté el cabezal de sempre. Complement: `_ajustarFiAlMarcador` verifica el `end` **REAL** del troç de la màscara i l'allarga fins al marcador si el `retrim` s'ha quedat curt (amb restauració si el mèdia no en dóna més) | Triar a la paleta 🎨 un grafisme el nom del qual **no és igual** al del marcador (B/V, accents, paraules de més) i tindre **un altre marcador seleccionat** al panell: l'insert ha d'anar al marcador del fitxer (log `🗺️ [MAPA] Entrada MOVIDA al marcador …`), el troç de V3 ha d'acabar exactament al marcador següent (log `🗺️ [MAPA·gris] Tall AJUSTAT al marcador`) i V2 ha de començar just ahí (sense forat ni solape) |
| `GRAF_ZONA_GRIS` | **Paleta 🎨 amb la MÀSCARA SEMPRE PER DAMUNT**: tot el grafisme va a la pista de la **MÀSCARA** (V2) i el troç de màscara de l'**ítem d'escaleta** (Intro / Donapàs / Off) **puja a V3** perquè quede per damunt del grafisme (2a volta del 28/10: abans només es feia quan el grafisme tenia **zona grisa al peu**, i un grafisme a sang sense gris tapava la màscara). La zona grisa (`#D9D9D9 ±25`, franja inferior) es mesura amb **3 mostres (t=2/3/4 s, una sola crida ffmpeg)** sobre el **fitxer original** (`FFmpeg.extractRoiSeries`, ROI y 0,60→1,00, graella 64×64) amb **mediana** i es **cau a caché** per `ruta|mida|data de CREACIÓ|VER` (una reexportació amb el mateix nom es torna a mesurar) — però **només informació al log**: ja no decidix la pista. La màscara es **corta i es mou ABANS** de col·locar el grafisme (mai al revés) i el forat queda net; el rang que puja és el de l'**ítem sencer**, **de marcador de LÍNIA a marcador de LÍNIA** (`01i - intro` → `01 - ELS VEÏNS…`): els **sub-ítems** de la línia (`01p21`, `01p22`…) **no** fan de frontera (3a volta, 28/10); si V3 està ocupada a l'ítem o no hi ha màscara, no es toca res i es col·loca com sempre. El grafisme **s'acota al final de l'ítem** (marcador següent) perquè la màscara torna a V2 ahí i l'insert seria una sobreescriptura (el retall deixa el clip estirable) | Bloc de prova amb màscara MASCARA a V2 i un grafisme amb peu gris (`ATUR EPA CATALUNYA.mov`): la màscara queda **per damunt** del grafisme durant l'ítem, el grafisme va a **V2** i cap clip posterior de V2/V3 es mou ni desapareix; qualsevol grafisme (amb peu gris o sense) va a **V2** amb la màscara per damunt. Log `🎨 [GRAF·gris]` + `🎨 [MAPA·gris]` · **3a volta (28/10)**: amb el cabezal en un sub-ítem (`01p22`) el log ha de dir `Ítem d'escaleta: "01i - intro"` i el troç de V3 ha d'anar de `01i` al marcador de la **línia** següent (`01 - ELS VEÏNS…`), no de `01p22` a `01p23` |

| `IO_CEP_ONLY` | **Tota l'I/O del panell va per `cep.fs` (síncron, natiu) o pel pont ExtendScript**: fora els ramals morts de Node (`_nodeFs`, `_nodeReq`, `_execFileBuffer`, `_curlExe`, `_listViaNode`, `fpNodeReq`, `fpPickViaNode`, `_fsKind`), perquè el manifest **no** declara `--enable-nodejs` i eixos camins no s'executaven mai | Log/audit escrits a disc, esborrat de la carpeta del bloc (RESET), llistat del directori del projecte (assistents `node_names`/`stat`), FOTO de l'escaleta, portada (mida del PNG), rastreig de rètols del NAS i selector de carpeta 📁 del CONFIG, tot amb el panell sense errors i `cep.fs` com a únic motor |
| `TWITTS_OCR` | **Grafismes de tuit (XARXES) col·locats AUTOMÀTICAMENT amb OCR d'1 frame per clip** (petició 27/10 + precisions 29/10): **cap botó nou** — la passada s'executa en acabar la col·locació automàtica de chyrons (`runPlaceAllChyrons`) i **només si** la importació ha deixat movies de tuit sense inserir al timeline. Es miren els clips de V1 **sense cap TUIT damunt (≥50 %; un chyron no compta) i de ≥3 s**, amb **un sol frame per clip, el 35 des de l'`in`**, capturat **de la TIMELINE** amb `Render.snapshot` (QE `exportFramePNG`, D21: és el clip per construcció; abans s'extreia del MEDIA amb `srcTime` = `inPoint` + offset, D19, i el frame podia ser el d'un altre clip → BUG #207) i, només de reserva, **ffmpeg del MEDIA del clip** (`FFmpeg.extractFramePng`) → `bin\ocr.ps1`. (`Render.frame` no existix al DOM de PPro 25: era el motiu que la passada no trobara res, BUG #205.) Dos pistes: **el text darrere del `@`** (handle; el nom del fitxer ve truncat a ~93 caràcters → es compara per PREFIX) i el **nom del titular de la franja naranja**. Candidats = **els `.mov` de tuit que ha portat la IMPORTACIÓ** (`Project.items` de l'**arrel + cada bin** — la importació els mou al bin `CHY` — + `esXarxes`), **descomptant els que ja són al timeline** (`pendents`, totes les pistes de vídeo) → mai una carpeta ni una data. ≥80 punts → col·loca **cobrint el clip** (la passada no pregunta res); el que no casa queda PENDENT i la passada s'atura quan no queden movies. La tria que funciona es **memoritza** a `C:\temp\fp_twitts_cache.json` (s'invalida si el movie canvia de mida/data). **Únic mecanisme manual: Ctrl+clic a la DIANA 🎯** → primer **prova OCR** del clip del cabezal contra els tuit pendents (si casa, es col·loca sol); si no, **llista curta** (`#twitts-pick`) amb els `.mov` XARXES del **dia del projecte** (no del rellotge: `_dayDir`) + els pendents que ja hi són + una cua d'exports d'**altres dies** (D23), **ordenada per semblança amb el text OCR del clip** (`rankPick`, amb ★punts), amb **cercador** que filtra pel nom i ↑/↓+⏎; i «Buscar al disc…» per al navegador natiu. També són tuit els exports a mà **`wott x <nom>` / `wott_v3 x pedro`** (D22: ni `XARXES`, ni `LUCYS`, ni `_V_00_`; abans quedaven fora de la llista, BUG #208). Spec: `docs/specs/TWITTS_OCR.md` (D20: `_fixPlacement` repara verificat el final de la col·locació i restaura els chyrons que `Clips.insert` retallava, BUG #206) | `implemented_pending_premiere_test` |


> Les quatre de TITOLET no tenen entrada de bug: si alguna falla en la prova, s'obri un bug
> nou a [`BUGS.md`](BUGS.md).

---

## 3 · En cua d'implementació (6)

| Codi | Què és | Estat |
|---|---|---|
| `NNEWS` | **Natural News**: *clean-swap* — substituir clips amb gràfics cremats per versions netes | `planned` (disseny fet, sense codi) |
| `MARKERS_INVARIANT` | Invariant «un marcador per ítem, sense duplicats» verificat en acabar el placement (toca `jsx/`) | Apuntat (requereix permís per tocar `jsx/`) |
| `SRT_GUARD` | Guarda al motor SRT: rebutjar un `.srt` sense cap bloc vàlid abans de carregar-lo | Apuntat |
| `JSON_DIETA` | **Neteja del JSON** que agrupa tota la informació (escaleta + wotts + …): que només continga els ítems que necessiten els processos del bloc | `planned` (petició 27/10) |
| `ECHO_OFF_UI` | **Echo off** de les finestres de sistema (`ffmpeg` i altres) i **rellotge d'arena al botó MAIN** mentre hi ha processos en marxa, perquè l'usuari ho sàpia | `planned` (petició 27/10) |
| `AUDIO_IA_DEREVERB` | **Neteja de l'àudio inicial** (cua de reverb del molinet anterior) amb IA que separe la veu | `planned` (petició 27/10) |

---

## 4 · Descartat per decisió (2026-10-27)

| Codi | Què era | Decisió |
|---|---|---|
| `JSON_UNIFICAT` | Unificar el JSON d'anàlisi del bloc en una sola peça de 4 blocs (era el bug `#153`) | **Descartat**: el JSON actual ja servix |
| `QUARANTINE_JSX` | Quarantena dels 10 `.jsx` vells restaurats (`10_Sistema`, `11_Entorn`, …) | **Esborrats** (l'usuari confirma que eren brossa); el motor ExtendScript torna a avaluar només l'arbre bo |

---

## 5 · Com s'actualitza este fitxer

1. Implementació nova → fila a §2 (**pendent de validar**) el mateix dia que es desa el codi.
2. Quan l'usuari la valida en viu → passa a §1 (o a §1.2 si és un tancament per decisió).
3. Si falla → bug nou a [`BUGS.md`](BUGS.md); la fila es queda a §2 amb la nota «falla: #NNN».
4. `docs/CHANGELOG.md` recull el canvi de codi; **l'estat viu ací**.
