# Registre de bugs i funcionalitats

Projecte **FAST >>> PASS** - versio **2.9.5 (LIPO-PRO)** - cataleg actualitzat: 2026-10-16

Aquest fitxer es genera automaticament des del cataleg viu del projecte (`features.json`).
Total: 114 entrades - **108 resoltes/tancades** - 6 en curs o pendents.

---

## 1. Funcionalitats actives

| ID | Nom | Estat | Prioritat | Que fa |
|----|-----|-------|-----------|--------|
| `NEW_PROJECT` | Creación de Proyecto (NOU) | active | critical | Abre plantilla .prproj, importa MP4 cleanFeed con trim de precisión, Wotts (CHY), SRT y portadas. Montaje automático en timeline. |
| `ESCALETA_JSON` | Integración de Escaleta JSON | active | critical | Lectura de snapshots JSON desde NAS. Cálculo IN/OUT con handles 20s. Mapeo bloque↔líneas via 'agrupacio'. 9 módulos en js/core/escaleta_*.js. |
| `PRECISION_TRIM` | Trim de Precisión (Tier0/Tier1/Tier2) | active | critical | Sistema 3-tier para IN/OUT del MP4. Tier0: video anterior (mismo agrupacio). Tier1: items estructurales OnAir. Tier2: siguiente video OnAir. Filtro por agrupacio. |
| `RIBBON_EDITING` | Edición Rápida de Vídeo | active | high | IN (Ripple Trim), OUT (cierre con limpieza de pistas), navegación ◀/▶ entre clips, Slider posición X para reframing 9:16. |
| `WOTT_PLACEMENT` | Colocación de Rètols (Wotts) | active | high | Parseo de .mov en CHYRONS: [PROGRAMA]_[DATA]_[BLOC]_[ID]_[TIPUS]_[TEXT]. Colocación por timestamp: V4 (Nomcarrec/Firma/Tema-Titol), V6 (LlocData). Snap a cortes. |
| `SUBTITLES` | Gestión de Subtítulos (SRT) | active | high | Editor SRT (visor + waveform + marcadors). CARREGAR ⬇️: blocs de 15 min i, si no n'hi ha, FALLBACK al .SRT de la carpeta de verticalització (Scan.srtFallback, relaxació de filtres per nivells). Ctrl+clic = fallback direc [...] |
| `RENDER` | Render y Exportación | active | high | VÍDEO: exportAsMediaDirect DIRECTAMENT a la carpeta de publicació `rutas.render1` (EXPORTS PROVISIONALS del NAS public.ad-ccrtv.local) amb el preset VERTIKAL .epr; en acabar, `_publishVideo` COPIA el MP4 a `rutas.render2 [...] |
| `CONTEXT_SYSTEM` | Sistema de Contexto (Semáforos) | active | high | Síntesis de estado: NEW/UPDATE/GO/LOAD. 4 semáforos visuales (JSON, MP4, Rètols, Subtítols). Inspectors: SourceAssets, App, Session. |
| `KEYFRAMES` | Motor de Keyframes e Interpolación | active | medium | Auto-reframe inteligente 16:9→9:16. Interpolación: LINEAR, BEZIER, HOLD. Escala base 47%, offset vertical automático. |
| `FFMPEG` | Integración FFmpeg | active | medium | Procesamiento de vídeo externo vía FFmpeg. Render limpio, clean-swap de clips. |
| `NNEWS` | Integración Natural News (NNews) | planned | low | Clean-Swap workflow: sustituir clips con gráficos quemados por versiones limpias desde NNews. Análisis de formato .nnp/.nzp/.xml. |
| `TITOLET-DETECT` | Detección TITOLET al cleanFeed (color + OCR) | implemented_pending_premiere_test | high | Detección del rótulo TITOLET en el vídeo quemado (máscara #F25F13 ±25 + OCR vía bin/ocr.ps1) para decidir si la tarjeta de la cadena conserva la cadencia o se RECORTA (onAir > 5 s → cadencia; ≤ 5 s → recorte; sin detecci [...] |
| `BURNED_GRAF_TYPES` | Grafismes cremats — disparo del rastreig per ETIQUETA literal de wott (27 etiquetes, coincidència exacta) | implemented_pending_premiere_test | high | DISPARO PER ETIQUETA LITERAL (2a passada 2026-10-08; la 1a era per prefix i quedava massa lax). El rastreig del grafisme cremat (màscara de color + OCR) segueix sense fer-se MAI per sistema: només si l'ítem (marcador) po [...] |
| `TITOLET_ROI_PER_ROL` | Rètol cremat — ROI per ETIQUETA (roiPerRole/roiDefault) + TC del nom (7a passada) | implemented_pending_premiere_test | high | 7a passada (2026-10-08, ZERO JSX nou). Mesura real (TNM V3, 13:39): els 6 PREGUNTA d'un ítem → 0 intervals, perquè el rètol d'aquella família NO viu a la banda mesurada del TITOLET (roiY 0,60-0,85) i el detector només te [...] |
| `TITOLET_MULTICOLOR` | Rètol cremat — MULTI-COLOR per etiqueta (facets: color + zona + llindars) i gris clar #DCDCDC mesurat (8a passada) | implemented_pending_premiere_test | high | 8a passada (2026-10-09, ZERO JSX nou). Petició d'usuari: «poder detectar més d'un color per tipus de grafisme; cal definir per a cada tipus quins colors i en quina zona». (a) MESURA: el gris clar de referència del vídeo  [...] |
| `RESET_GENERAL` | Reset General del bloc (botó 🔄) | resolt | high | Botó 🔄 a la cantonada superior esquerra de la secció INICI (sobre l'etiqueta, a l'esquerra del semàfor ESC; marge 6px, 22×22px). Un clic: (1) tanca el projecte del bloc seleccionat si està obert; (2) esborra la carpeta  [...] |

## 2. Bugs resolts (detall)

Ordre cronologic pel numero d incident. 105 entrades.

### #8 - resolt (2026-05-28)

**SIMPTOMA**: CRASH F2: JSON.parse de respuesta 'ERR:...' del JSX → SyntaxError

**CAUSA ARREL**: callJSX() envuelve JSX en try/catch. Si JSX falla, retorna 'ERR:...' y JSON.parse('ERR:...') lanza excepción.

**SOLUCIO**: Nuevo helper _safePlaceByPrefixes con try/catch, maneja respuestas ERR:, strings vacíos y JSON malformado. 7 call sites reemplazados.

**FITXERS**: `js/workflows/flow_assembly.js`

### #9 - resolt (2026-05-28)

**SIMPTOMA**: Color de marcadores perdido al hacer delete+create en placeByPrefixes

**CAUSA ARREL**: _setMarkerColor() llamaba a setColorByIndex() (API Premiere) que NO persiste .color. Al leer existing.color después, devolvía -1 → marcador verde.

**SOLUCIO**: _setMarkerColor ahora siempre asigna markerObj.color = colorIdx ANTES de setColorByIndex(). Guard p.colorIdx >= 0 en placeByPrefixes.

**FITXERS**: `jsx/modules/8_Markers.jsx`

### #10 - resolt (2026-05-28)

**SIMPTOMA**: Marcador rojo inesperado: lógica de color 'agrupacio ? 6 : 1' no distinguía rojo/amarillo

**CAUSA ARREL**: La lógica no implementaba la especificación completa de MARKER_COLORS.md: azul (6)=con agrupacio, amarillo (4)=sin agrupacio+durada 0, rojo (1)=sin agrupacio+durada>0.

**SOLUCIO**: Nuevo helper _getColorIdx con parsing inline de durada. 6 puntos actualizados: 3 estructurales + 3 UNGROUPED.

**FITXERS**: `js/workflows/flow_assembly.js`

### #11 - resolt (2026-05-28)

**SIMPTOMA**: OUT del MP4 incorrecto por duradaOnAir inconsistente (TNC V2: OUT recortado a 54s en vez de extenderse 78s)

**CAUSA ARREL**: horaEntradaOnAir del siguiente ítem es un hecho duro del playout. duradaOnAir es dato derivado que puede ser incorrecto. El cap de block.out machacaba el valor correcto.

**SOLUCIO**: Tres capas: (1) getItemSortidaSec: nivel 3 compite con nivel 1/2, gana MAX. (2) Tier2 OUT siempre compite con Tier1. (3) Cap de block.out solo en fallback (OutTier<=0).

**FITXERS**: `js/core/escaleta_items.js`, `js/core/escaleta_bounds.js`

### #12 - resolt (2026-05-28)

**SIMPTOMA**: Ítems gráficos (TE, GI, etc.) colocados como estructurales por el codepath UNGROUPED

**CAUSA ARREL**: _detectFirstUngroupedItem encontraba items con agrupacio:null sin verificar si eran gráficos. _classifyItems sí los clasificaba pero era ignorado en UNGROUPED.

**SOLUCIO**: Set compartido _GRAPHIC_SUFFIXES + helper _isGraphicByNum. Los 3 bloques UNGROUPED ahora filtran con !this._isGraphicByNum().

**FITXERS**: `js/workflows/flow_assembly.js`

### #13 - resolt (2026-05-28)

**SIMPTOMA**: _deduceOnAirSortida y Tier 2 cruzan fronteras de agrupacio → OUT extendido 104s (TNV V1)

**CAUSA ARREL**: El fix de BUG #11 (competencia con siguiente OnAir) no filtraba por agrupacio. Competía con ítems de otros bloques y totems (agrupacio null).

**SOLUCIO**: _deduceOnAirSortida: filtrar por mismo agrupacio. Tier2 Estrategia A: mismo filtro. Estrategia B: solo bloques sin agrupacio. Regresión BUG #11 verificada.

**FITXERS**: `js/core/escaleta_items.js`, `js/core/escaleta_bounds.js`

### #14 - resolt (2026-05-29)

**SIMPTOMA**: F3.5/F4/F5 cambian el color de los marcadores a verde al hacer snap

**CAUSA ARREL**: Marcadores legacy tienen .color = -1. Al construir placements, cmk.color >= 0 falla → pasa null → placeByPrefixes no llama _setMarkerColor → marcador verde.

**SOLUCIO**: Fallback _getColorIdx(prefixToItem[prefix]) cuando cmk.color < 0 en F3.5, F4, F5. Así los marcadores heredan el color correcto de su item.

**FITXERS**: `js/workflows/flow_assembly.js`

### #15 - resolt (2026-05-29)

**SIMPTOMA**: Marcador F2·Deducido '01i' no se coloca en 00:00 (TNC: colocado a 3.72s)

**CAUSA ARREL**: El primer item estructural usa _deduceOnAirEntrada que da anchorEfectiva=deduced → idealPosSec = anchorEfTimelineSec + 0 = 3.72s en vez de 00:00.

**SOLUCIO**: Si Math.abs(deduced - anchorEfectiva) < 0.01 (el item ES el anchor), forzar idealPosSec = 0.

**FITXERS**: `js/workflows/flow_assembly.js`

### #16 - resolt (2026-05-29)

**SIMPTOMA**: MP4 IN asigna worldBlockStartSec del item anterior (cross-agrupacio contamination)

**CAUSA ARREL**: Dos bugs: (B1) _deduceOnAirEntrada no filtraba por agrupacio → items de otros bloques contaminaban la deducción. (B2) Tier0-IN usaba prevVideoData.endSec sin filtrar por agrupacio → video de totem contaminaba V1.

**SOLUCIO**: B1: filtro item.agrupacio && prevItem.agrupacio !== item.agrupacio → continue. B2: filtro blockAgrupacio_IN && vid.item.agrupacio !== blockAgrupacio_IN → continue.

**FITXERS**: `js/core/escaleta_items.js`, `js/core/escaleta_bounds.js`

### #17 - resolt (2026-05-28)

**SIMPTOMA**: TNV V3: OUT del MP4 extendido ~41s — posible inconsistencia de datos en la escaleta

**FITXERS**: `js/core/escaleta_items.js`, `js/core/escaleta_bounds.js`

**NOTA**: Pausado por el usuario. Posible inconsistencia en los datos de playout. No implementar fix hasta confirmar.

### #55 - resolt (2026-09-24)

**SIMPTOMA**: Clip MP4 del bloc col·locat SENCER al timeline: tot el material ~12s a la dreta (12,04s = 10s de clipInOffset + 2,04s de desfase del fitxer extret)

**CAUSA ARREL**: Clips.trimBounds no existeix al global JSX: jsx/main.jsx mapeja els mètodes un a un i trimBounds no hi és -> «ERR:Clips.trimBounds is not a function». El recorte fallava en silenci i el clip entrava amb inPoint=0/outPoint=224.92 mentre els corchetes de seqüència es posaven segons el pla (10/134).

**SOLUCIO**: js/logic/3_Project_Logic.js: Clips.retrim (àtom exposat) + TRIM-CHECK (verificació de l'inPoint real) + composició Clips.inPoint/start/end com a pla B + corchetes derivats del clip real (clipInDelta) com a blindatge.

**FITXERS**: `js/logic/3_Project_Logic.js`

### #56 - resolt (2026-09-24)

**SIMPTOMA**: Desfase de 10s entre àudio i vídeo del clip del bloc

**CAUSA ARREL**: El recorte del clip de vídeo no mou el clip d'àudio (clips desenllaçats en aquesta inserció): A1 conservava el seu inPoint original mentre el vídeo saltava a l'inPoint del pla.

**SOLUCIO**: js/logic/3_Project_Logic.js: mateix in/out a A1 amb Clips.retrim + AUDIO-TRIM-CHECK i composició inPoint/start/end amb type='audio'. Auto-corrector si els clips vinguessin enllaçats.

**FITXERS**: `js/logic/3_Project_Logic.js`

### #57 - resolt (2026-09-24)

**SIMPTOMA**: Ancoratge de marcadors: el delta de correlació s'aplicava DUES vegades (F3 i F3.5) -> el marcador quedava 1,8s ABANS del seu corte

**CAUSA ARREL**: placeScheduledMarkers (F3) i correlationSnapMarkers (F3.5) criden tots dos _correlationSnap i apliquen el mateix Δ: -1,16s + -1,16s = -2,32s sobre el pla (07: 14.00 -> 12.84 -> 11.68 amb el tall real a 13.48).

**SOLUCIO**: flow_markers.js: F3 només INFORMA el Δ (snapDelta = 0) i l'aplica F3.5·CorrelationSnap, que és la fase dedicada.

**FITXERS**: `js/workflows/flow_markers.js`

### #58 - resolt (2026-09-24)

**SIMPTOMA**: F4·Faro no clavava el marcador al corte tot i que el fix B ja era al codi (ventana ±1,5s)

**CAUSA ARREL**: El valor efectiu de snapWindowFaroSec el posa Profile.json ("snapWindowFaroSec": 1.0) i sobreescriu els defaults del codi -> el Δ de 1,80s quedava fora de la finestra.

**SOLUCIO**: Profile.json (1.0 -> 2.5) + 11_Configuracio.js (2.5) + flow_markers.js (_snapWindowFaro 2,5) i log de les dues finestres a F4.

**FITXERS**: `Profile.json`, `js/core/11_Configuracio.js`, `js/workflows/flow_markers.js`

### #59 - resolt (2026-09-24)

**SIMPTOMA**: Marcador del vídeo desviat uns frames del seu corte per F6·Ordre

**CAUSA ARREL**: enforceMarkerOrder aplicava clamps de ±0,5s quan detectava una inversió d'ordre i pisava el corte al qual F4 acabava de clavar el marcador.

**SOLUCIO**: flow_markers.js: nou _isOnCut(t, clips) (±0,15s) i guarda a les 3 rames de F6 -> «⏭️ ja està en un tall (X.XXs) → NO es mou».

**FITXERS**: `js/workflows/flow_markers.js`

### #60 - resolt (2026-09-24)

**SIMPTOMA**: Marcadors VERMELLS (ítems no agrupats) col·locats al final del bloc

**CAUSA ARREL**: F7·Cobertura creava marcador per a QUALSEVOL ítem sense marcador (t = prev.time + 0.5 al final, next.time − 0.5 a l'inici). Els vermells també apareixien des de F1/F2/F5.

**SOLUCIO**: flow_markers.js: filtre global dins _safePlaceByPrefixes (punt comú de totes les fases): un marcador color 1 només es col·loca si queda ENTRE marcadors d'un altre color (lote + timeline); si el filtre deixaria el bloc sense marcadors es manté la llista. F7 porta la mateixa regla.

**FITXERS**: `js/workflows/flow_markers.js`

### #61 - resolt (2026-09-24)

**SIMPTOMA**: Creant el V1 del 23/09: el panel agafava l'escaleta V2 (més recent) i el guarda «escaleta d'un altre bloc» avortava la creació

**CAUSA ARREL**: findLatest s'ordenava per timestamp descendent i agafava el primer JSON VÀLID del programa IGNORANT el blockId (V1 14:16 quedava darrere de V2 14:25 i V3 14:40). A més, la copia local de l'escaleta s'escrivia FORA de la carpeta del bloc per un separador de ruta mal compost (fitxers «V1<json>» i «V2<json>» a la carpeta del dia).

**SOLUCIO**: escaleta_io.js: prioritat al bloc demanat (V2 queda com a 2a opció) + separador robust (replace(/[\/]+$/,'') + '\\' + name) en 4 punts (escaleta_io 344/715, flow_mainButton 68/89). Basura eliminada del NAS.

**FITXERS**: `js/core/escaleta_io.js`, `js/workflows/flow_mainButton.js`

### #62 - resolt (2026-09-24)

**SIMPTOMA**: Ruta de treball única per BLOC: <prog>_PROJECTES/<data>/<V*> (abans tots els blocs barrejats a la carpeta del dia)

**CAUSA ARREL**: Les 17 composicions de ruta (9 fitxers) feien servir destinoBase + directorio + dateDir, sense el bloc -> impossible saber a quin bloc pertanyia cada fitxer.

**SOLUCIO**: utils.workFolder(ctx) com a font única + substitució als 9 fitxers (projecte, clip, manifest, escaleta local, SRT, renders, anàlisi) + assemblatge del context des del path del projecte (ctx.bloque i seqüència del bloc).

**FITXERS**: `js/core/utils.js`, `js/logic/3_Project_Logic.js`, `js/logic/16_Analysis_Logic.js`, `js/workflows/flow_mainButton.js`, `js/workflows/flow_render.js`, `js/core/4_Context.js`, `js/core/assembly_context.js`, `js/core/session_manifest.js`, `js/main.js`

### #93 - resolt (2026-09-25)

**SIMPTOMA**: ffmpeg -ss NO és el 0 del fitxer extret: el tall arrenca al KEYFRAME ANTERIOR (pre-roll) → 0,81 s d'error sistemàtic a tots els marcadors

**CAUSA ARREL**: `ffmpeg -ss X -i src -c copy` no pot tallar fora de keyframe i, amb -c copy, el pre-roll es conserva. MESURAT a TNC V3 2026-09-25 (cleanfeed Dalet, GOP 1 s, keyframes 782.24/783.24): -ss 783 → el fitxer arrenca a 782.187 s (verificat creuant dues juntes de silenci idèntiques font/clip). El manifest creia base-fitxer=50283 i la real era 50282.19.

**SOLUCIO**: 15_FFmpeg_Logic.js: nou keyframeAtOrBefore(src, sec) (ffprobe -read_intervals 'sec-6%+12', només paquets K, fallback segur) + flow_mainButton: -ss = keyframe, -t = dur + preRoll (mateix final al source), base-fitxer = wsms + -ss efectiu, clipExpandedInPoint = handle + preRoll, mp4SweetInPointRaw = handle + preRoll. Log '🔑 [keyframe]'.

**FITXERS**: `js/logic/15_FFmpeg_Logic.js`, `js/workflows/flow_mainButton.js`

### #94 - resolt (2026-09-25)

**SIMPTOMA**: Crash 'zonaInOffset is not defined' JUST després del trim: corchetes de seqüència sense fixar i ref del manifest sense finalitzar

**CAUSA ARREL**: 3_Project_Logic.js:375 usava el BARE `zonaInOffset`, declarat només dins la branca MODE NORMAL (línia 224) → ReferenceError a la fase de sweet points. Log TNC V3 2026-09-25 15:20:35: '[PISTES·DESPRES-INSERT] V1=1' → 'Error crític a runNew: zonaInOffset is not defined' (el corchete i tot el que ve després no s'executava mai).

**SOLUCIO**: S'usa `zonaInAdj` (ja definit a línia 367, val 0 en mode fallback). A més: eliminada la declaració muerta `_deltaIn`.

**FITXERS**: `js/logic/3_Project_Logic.js`

### #95 - resolt (2026-09-25)

**SIMPTOMA**: IN·FLOOR incloïa ítems del MATEIX bloc → bloc buit (IN>=OUT) → IN/OUT-GUARD baixava l'IN minuts enrere

**CAUSA ARREL**: El piso del final de l'ítem anterior recorria TOTS els vídeos amb OnAir, incloent els del bloc actual. TNC V3 2026-09-25: l'ítem '05' (dins del bloc, OnAir 14:00:02 + 1:50 = 50512) arrossegava l'IN de 50383 → 50512; com que l'OUT també era 50512, el guard [IN/OUT-GUARD] aplicava IN = block.in − durada(intro) = 50303 → el clip s'extreia amb 129 s del tema anterior a la capçalera.

**SOLUCIO**: escaleta_bounds.js (IN·FLOOR): es descarten els ítems del bloc actual (_blockIdxSet des de blockLines/allLines.indexOf → skip per _pv.idx).

**FITXERS**: `js/core/escaleta_bounds.js`

### #96 - resolt (2026-09-25)

**SIMPTOMA**: Ancoratge: l'offset de conversió fitxer→timeline usava la ref del manifest (FIX-A/B) en lloc del clip.inPoint REAL → biaix igual a clipInOffset/zonaInOffset (10 s a TNC)

**CAUSA ARREL**: flow_markers._calcTemporalAnchors substituïa l'inPoint real del clip pel manifest.ref.tlBlockInPointSec quan el clip era l'extret, i a més hi enganxava l'ajust _wsmsAdjust (FIX-C) dins la mateixa branca. Amb el manifest ja en base del fitxer, afegir refBloc desplaçava l'ancoratge ~20 s i el biaix pla↔recorte (10 s) entrava sencer.

**SOLUCIO**: FIX D: offsetAnchor = SEMPRE el clip.inPoint real del clip més antic de V1 (timelinePos = mediaSec − (wsms + clip.inPoint)). FIX-C mogut a la GUARDA d'invariant (només si wsms ≠ àncora−refBloc, és a dir manifest en coords d'ORIGEN). Logs FIX-D i FIX-C explícits.

**FITXERS**: `js/workflows/flow_markers.js`

### #97 - resolt (2026-09-25)

**SIMPTOMA**: _rebuildManifestFromLocal reescrivia la ref en coords d'ORIGEN després de l'extracció (3r escriptor del manifest)

**CAUSA ARREL**: MANIFEST MESURAT (TNC V1 2026-09-25): ref final wsms=49500 + tlBlockInPointSec=1978 (source) mentre extractedClip.extractedWorldSecMediaStart=50760 → l'ancoratge depenia del pedaç FIX-C.

**SOLUCIO**: flow_mainButton._rebuildManifestFromLocal: si el manifest ja ve del clip extret (extractedClip.isExtracted + ref completa) es CONSERVA la ref i només s'actualitzen blockBounds/escaletaItems (log '🧭 [Manifest] Ref del CLIP EXTRET conservada').

**FITXERS**: `js/workflows/flow_mainButton.js`

### #98 - resolt (2026-09-25)

**SIMPTOMA**: Clips.trimAudioA2 no està exposat pel bridge JSX: ERROR vermell a cada execució (no-op)

**CAUSA ARREL**: jsx/modules/6_Clips.jsx defineix trimAudioA2, però jsx/main.jsx no el mapeja → 'ERR:Clips.trimAudioA2 is not a function' (log TNC V3 2026-09-25).

**SOLUCIO**: 3_Project_Logic.js: eliminada la crida (JSX està tancat). Si mai cal A2, caldrà exposar l'àtom al bridge.

**FITXERS**: `js/logic/3_Project_Logic.js`

### #99 - resolt (2026-09-25)

**SIMPTOMA**: REPARTIR (traduccions/chyrons) només omplia el PRIMER clip de V1 quan les traduccions del tram queien a cavall de 2 clips seleccionats

**CAUSA ARREL**: flow_chyrons.repartirChyronTraduccio agafava com a referencia NOMES el clip de V1 sota la PRIMERA traduccio del tram (_clipAtInstant) -> tots els slots es distribuïen dins d'aquell clip; amb 2 clips seleccionats el segon quedava buit. A mes, el limit de l'ultim slot podia ser un marcador INTERN (el tall entre els 2 clips) i truncava encara mes el repartiment.

**SOLUCIO**: La referencia del tram passa a ser la UNIO dels clips V1 seleccionats que INTERSECTEN el span temporal del tram (IN del primer -> OUT de l'ultim). Amb 2+ clips no s'aplica el limit per marcador (mana la seleccio de l'operador); amb 1 clip es mante el comportament anterior. Slots uniformes (slotDur = (limit - bStart)/M) = durades iguals. Log amb refN i avis si hi ha forat >0,5s.

**FITXERS**: `js/workflows/flow_chyrons.js`

### #100 - resolt (2026-09-25)

**SIMPTOMA**: REPARTIR destrossava el clip veí de la dreta de la pista (rètol Llocdata) en col·locar-hi les traduccions

**CAUSA ARREL**: MESURAT (log 2026-09-28 09:06, TNV V2): el repartiment va bé (ref V1 [28.64-47.44] amb 2 clips, 5 slots de 3.76s fins a 47.44s) i el rètol Llocdata era JUST a la dreta: V8 @ [47.84-52.94]. No va quedar dins cap slot: el va TRENCAR l'insert (Clips.insert = targetTrack.overwriteClip amb la durada COMPLETA del PNG, no el slot) -> el log mostra '🩹 … tocat per un insert [49.68-52.94] → restaurat a [47.84-52.94]'. _repararClipsV7 el tornava a lloc, PERÒ amb Clips.insert: crea una INSTÀNCIA NOVA del clip → es perden els efectes/paràmetres/animació que l'operador hi havia aplicat (i el clip queda 'estropat' encara que start/end siguin correctes).

**SOLUCIO**: Protocol de protecció de veïns (3 passos) a repartirChyronTraduccio: (1) el límit del repartiment s'atura a l'entrada del proper clip existent de la pista (en aquest cas 47.44 < 47.84 → el repartiment NO canvia); (2) els clips veïns de la zona de perill (rang + 30 s pel sobrepassament de l'overwrite del PNG) es MOUEN fora de la pista amb Clips.moveToRange — reassigna start/end, NO sobreescriu i sobretot NO re-crea el clip → efectes i animacions intactes — i (3) es TORNEN exactament a la seva posició original al final. Logs 🛡️ (apartat) i ↩️ (tornat); _repararClipsV7 queda com a xarxa de seguretat per a altres casos.

**FITXERS**: `js/workflows/flow_chyrons.js`

### #101 - resolt (2026-09-28)

**SIMPTOMA**: El placement inicial de traduccions (per TC) col·locava les últimes traduccions FORA del seu clip de referència de V1 (TC=01.10: 2 clips @ 70.00s dur=10.00s quan el clip és [69.68-77.48])

**CAUSA ARREL**: MESURAT (log TNV V2 28/09 09:18): _snapToNearestCut rebutja per DISSENY els talls ANTERIORS a l'ideal ('si el tall més proper és anterior al marcador → usar el marcador'): TC=01.10 → ideal 70.00s amb el tall real a 69.68s → retorna 70.00s (que NO és un tall). Després, la cerca del clip de referència exigia coincidència EXACTA (|cl.start − clipStart| < 0.05) → cap clip de V1 comença a 70.00s → no es trobava la referència i quedava el fallback `clipEnd = clipStart + 10` (10 s fixos!) → 2 slots de 5s = 70→80s, travessant el tall de 77.48s i envaint el clip següent. Senyal al log: 'dur=10.00s' amb N clips = referència NO trobada.

**SOLUCIO**: placeChyronTraduccio: la referència passa a ser el clip de V1 que CONTÉ el punt ideal (i, si no n'hi ha cap, el més proper), i el repartiment comença al SEU IN (refStart) → les N traduccions omplen exactament el clip (69.68-77.48 → 2×3.90s). El fallback de 10 s es manté només si no hi ha cap clip (amb WARN). Log ampliat amb la referència ('← clip V1 [a-b]s'). Extra: l'insert inicial ja no passa endSec (quirk de l'API: l'aplicava al DARRER clip de la pista i el retallava) → Clips.endAt per temps, i el log diu la pista real (V8) en lloc de 'V7'.

**FITXERS**: `js/workflows/flow_chyrons.js`

### #102 - resolt (2026-09-28)

**SIMPTOMA**: El chyron del CONDUCTOR no es col·locava (TNV V3 28/09) i el log deia '✅ col·locat' igualment

**CAUSA ARREL**: MESURAT (logs 28/09 09:32 i 10:54, projecte TNV V3): el conductor NO és mai al projecte. El desplegable #conductor llista els .mov de la biblioteca del NAS (cfg.rutas.conductors, via Context.syncConductorUI), NO ítems del projecte: en un projecte nou ningú no importa el conductor, així que Clips.insert('Conduct_*.mov') tornava sempre 'ERR_ITEM_NOT_FOUND' (log 10:54:43: 'Cap fitxer Conduct_*.mov al projecte'). El desplegable duia el conductor de TNM perquè el selector de programa del panell estava desincronitzat, però amb qualsevol conductor passaria el mateix. A més placeChyronConductor no comprovava insertRes → registrava '✅ col·locat' i status 'exito' (fals positiu).

**SOLUCIO**: Nou _ensureConductorInProject() (substitueix _resolveConductorFile): (1) si el conductor TRIAT ja és al projecte (nom exacte o sense extensió) s'usa el nom REAL de l'ítem; (2) si no, s'IMPORTA del NAS amb la pauta canònica de Project/Assembly (cfg.rutas.conductors + nom del desplegable, ruta amb '/' + Utils.importList → 'root') i es reintenta la lectura; (3) últim recurs: qualsevol 'Conduct_*.mov' ja al projecte (WARN, pot no ser el triat); (4) si no, ERROR i s'omet el conductor. El fitxer triat al desplegable mana SEMPRE (ja no es substitueix pel titular del programa). A placeChyronConductor es comprova insertRes: si comença per ERR → ❌ + status warn (mai més un ✅ fals). SEGONA CAUSA MESURADA (log 11:19:20 del mateix dia i projecte): la ruta rutas.conductors del FALLBACK (11_Configuracio.js L25) apuntava a una altra carpeta del NAS on el nom del desplegable NO existeix; la carpeta correcta és la de Profile.json (.../PROJECTE 9x16 PREMIERE 2/CHYRONS CONDUCTORS/) i, a més, Profile.json no el carrega ningú (a js/ només se'l menciona en comentaris) → la config viva és sempre el fallback. proj.importFiles és ASÍNCRON i NO llança mai: amb una ruta inexistent el projecte queda sense ítem i Utils.importList retorna sense error (per això el delay de 500 ms era inútil). FIX v47: (a) ruta del fallback alineada amb Profile.json; (b) _ensureConductorInProject resol el nom REAL dins de cfg.rutas.conductors abans d'importar (clau normalitzada: sense Conduct_, sense token de programa, sense accents ni extensió → lliga noms antics i moderns en les dues direccions, preferint el del programa actiu) i valida amb cep.fs.stat/readdir (❌ explícit si el fitxer no existeix, mai més un silenci); (c) SONDEIG del projecte cada 500 ms fins a 20 s (⏳ cada 5 s); (d) runAutoPlacement ja no passa el valor cru del desplegable. Validat amb un unit test que EXECUTA la funció REAL extreta del fitxer: 17/17 PASS (C:/temp/fp_cond_test.html).

**FITXERS**: `js/workflows/flow_chyrons.js`

### #103 - resolt (2026-09-28)

**SIMPTOMA**: REPARTIR només tenia en compte el PRIMER clip seleccionat de V1 (2 clips seleccionats → 1 usat)

**CAUSA ARREL**: MESURAT (log 28/09 11:35:08 i 11:35:19, TNV V2): '🎯 [Repartir] V1: 2, Trad (V8): 5' però '📐 [Repartir] Tram 1/1: ... ref V1 [28.44-34.84] (1 clip(s): 28.44-34.84)' → els 5 slots s'apretaven en 6.40s (1.28s cadascun) i el 2n clip seleccionat quedava buit. El fix #99 calculava la referència del tram per INTERSECCIÓ amb el span temporal de les traduccions (spanClips = selectedV1.filter(c => c.end > gFirst && c.start < gLast)); el fix #101 de COLOCAR fa que el repartiment inicial arrenqui a l'IN del clip de referència → les 5 traduccions de TC=00.29 queden ENCERRADES dins del clip [28.44-34.84] → cap altre clip 'toca' el tram → refN=1 i el 2n clip s'ignorava. ABANS 'funcionava' per accident: el fallback clipEnd = clipStart + 10 del COLOCAR vell desbordava les traduccions fora del clip i el span arribava al clip veí.

**SOLUCIO**: repartirChyronTraduccio: la referència del tram es calcula per POSICIÓ dins la SELECCIÓ de V1 (l'operador marca l'extensió amb Ctrl+clic), no per intersecció temporal: selOrd = selectedV1 ordenat per start; idx0 = primer clip amb end > gFirst (o el darrer si cap el conté); idx1 = darrer clip seleccionat, o el clip ANTERIOR al que conté l'inici del tram SEGÜENT (gNextFirst = min(start) del grup següent) → es manté l'esperit del #99 (cada tram dins del SEU material: el bloc 2 no envaeix el bloc 1) i amb 1 sol clip el comportament és idèntic a l'anterior. Test unitari que EXECUTA el bloc real extret del fitxer de producció: 13/13 PASS (C:/temp/fp_rep_test.html).

**FITXERS**: `js/workflows/flow_chyrons.js`

### #104 - resolt (2026-09-28)

**SIMPTOMA**: L'IN del bloc arrencava DINS del sumari anterior (TNM V1 27/09 'DIRECTE PUERTA DEL SOL': el corchete IN queia a 14:30:52 en lloc de 14:32:16 → 84 s de tema aliè a la capçalera del clip; el directe entrava a ~2:15-2:47 del clip en lloc de ~0:10)

**CAUSA ARREL**: MESURAT (log ...PROVES/FASTPASS.log 28/09 13:54:38 + manifest TNM_V1.fastpass.json + repro headless amb el JSON real d'escaleta): 'Tier1-COMPETE: primer estructural 03dp entrada=52252.00s < Tier0-IN=52336.00s. Guanya Tier1 (més aviat)' → worldBlockStartSec=52252 (14:30:52) i mp4ExpandedInPoint=212 s. El candidat sortia de getItemEntradaSec('03dp') via _deduceOnAirEntrada SENSE ignoreAgrupacio: en recórrer la llista cap enrere, els ítems de l'ALTRA agrupació sense OnAir (SM4, SM5, SM6, SM7, CARETA, '01', '02' — agrupacio null) es descartaven amb un continue que NO acumulava la seva durada → l'àncora quedava clavada al darrer ítem del sumari amb OnAir ('SM3': OnAir 14:30:37 + duradaOnAir 0:15 = 14:30:52) i s'ignoraven els 91 s restants del sumari (45 s SM4-SM7 + 13 s CARETA corregida + 33 s '01') que la ruta ignoreAgrupacio=true SÍ calcula (52343 s). La salvaguarda BUG #21 no ho protegeix perquè només adopta la Prevista quan és ANTERIOR al resultat deduït (aquí Prevista 52336 > 52252) i la COMPETÈNCIA Tier0/Tier1 premia el candidat MÉS AVIAT.

**SOLUCIO**: _deduceOnAirEntrada (js/core/escaleta_items.js): el continue de frontera d'agrupació ara ACUMULA la durada de l'ítem saltat (isItemEstructural + _getCorrectedDuration per a caretes) en lloc de descartar-lo → les dues rutes (amb i sense ignoreAgrupacio) donen el mateix i la deducció avança per la cadena real d'emissió. Repro headless amb el JSON real (C:/temp/fp_in_test.html + fp_in_test.ps1, stubs d'Utils/Config): ABANS _deduceOnAirEntrada('03dp')=52252 s i calcPrecisionTrimBounds V1 mp4In=212 s (idèntic al log real); DESPRÉS =52336 s (14:32:16, = Prevista del 03dp) i mp4In=296 s amb mp4Out=558 s intacte, InTier=10 → 84 s de sumari fora del clip i el directe a 51 s (handles 20 s) en lloc de 135 s. BUG #21 segueix limitant la deducció per la Prevista, així que el canvi no pot endarrerir l'IN més enllà d'aquesta. PENDENT DE DECIDIR: si el corchete ha d'ancorar-se al primer ítem del bloc (03dp, 14:32:16) o al DIRECTE (03dir, 14:32:47 = OnAir del IPD '03' 14:33:47 − durada 1:00).

**FITXERS**: `js/core/escaleta_items.js`

### #105 - resolt (2026-09-28)

**SIMPTOMA**: L'IN del bloc arrencava DINS d'un VÍDEO ALIÈ encara en emissió (TNM V1 28/09 'DIRECTE PUERTA DEL SOL': amb el #104 el corchete ja no cau dins del sumari, però cau a 14:32:16, 26 s DINS del BV '01' que s'emetia 14:32:09→14:32:42 → el clip arrenca amb un tema aliè a la capçalera; l'usuari el veu com un 'vídeo BV de 33 s' abans del directe)

**CAUSA ARREL**: MESURAT (escaleta real TNM 28/09 + repro headless C:/temp/fp_in_test.html): l'IN calculat = 52336 (14:32:16 = Prevista del donapas '03dp', primer ítem del bloc v1) però l'ítem ANTERIOR és '01 | CRONOLOGIA DE L'ACAMPADA PER L'HABITATGE' (teVideo=true, font=BV, durada 0:33, horaEntradaPrevista 14:32:09, prevOut 14:32:42, SENSE horaEntradaOnAir, agrupacio null) → el vídeo s'està emetent quan comença el bloc. L'IN·FLOOR de calcPrecisionTrimBounds només recorre allOnAirVideos (ítems teVideo && horaEntradaOnAir), així que un vídeo sense OnAir és invisible i no pot fer de piso; i el SOSTRE del piso ('només ítems que acabin abans del bloc', _pvEnd <= ref+15 s) també l'hauria exclòs (acaba 26 s després de l'inici del bloc).

**SOLUCIO**: js/core/escaleta_bounds.js: nou piso _applyForeignVideoFloor(data, worldBlockStartSec, blockLines, 600), invocat DESPRÉS de _applyBaseColumnFloor (última paraula sobre l'IN). Per a cada ítem FORA del bloc amb teVideo===true, SENSE OnAir vàlid i amb horaEntradaPrevista: si end = prevista + getItemDuradaSec > IN (+1 s) i el salt és < 600 s i l'ítem no és posterior al bloc (start <= ref + 15 s, amb ref = hora del primer ítem del bloc), l'IN passa al seu final; s'itera fins a punt fix (vídeos aliens encadenats) i worldBlockAnchorSec segueix el piso. Els ítems amb OnAir NO es toquen (ja els cobreix l'IN·FLOOR) i els del bloc tampoc (el seu inici el defineix el bloc). Log '🚧 [ER:Bounds] PISO vídeo aliè'.

**FITXERS**: `js/core/escaleta_bounds.js`

### #106 - resolt (2026-09-29)

**SIMPTOMA**: El chyron de CONDUCTOR s'inseria en un bloc que no té cap ítem de presentació (TNV V1 'LEAD DIAGONAL TALLADA' 29/09: conductor a 0.40s sobre un bloc que obre amb un lead + un marcador de chyron del GF)

**CAUSA ARREL**: MESURAT (C:/temp/FASTPASS_2909.log + MARCADORS_2026-09-29_0939.txt del bloc \\DSMEDIA07\...\PROVES\04_TN VESPRE_PROJECTES\2026_09_28\V1): el bloc té 4 marcadors (01lead@0.00, 01 GF-@5.40, 01chy@12.68, 01 GF-1@18.52) i cap ítem de plató, però DUES causes feien col·locar el conductor: (a) _isPresenterLine comptava el sufix 'lead' com a plató → l'ítem 01lead (entradilla amb el seu Tema-Títol, sense presentadora en càmera) passava per plató; (b) el respatller 'else if (itemPlato)' de placeChyronConductor, quan l'ítem de plató de l'escaleta NO té marcador propi al timeline, l'inseria igualment a l'inici del bloc (log 09:40:19: 'Cap marcador de plató; l'ítem 01lead no en té i no hi ha res marcat abans → OBRE el bloc (inici 0.00s)' i 'CasB Marge insuficient (3.08s < 11.04s): Conductor @ 0.40s' → Clips.insert OK a V7).

**SOLUCIO**: flow_chyrons.js: (1) _isPresenterLine ja no accepta el sufix 'lead' (només i, dp, dir, f, off + els tokens de títol OFF/DONAPAS/CONN/INTRO...); (2) el respatller de placeChyronConductor desapareix: sense MARCADOR de l'ítem de plató al timeline → ⏭️ log + status warn + return (regla de l'usuari 29/09: 'el conductor només va en un ítem de presentació; si no hi ha ítem/marcador, no es col·loca'). Amb el fix, el mateix bloc: 'Cap ítem de plató (intro/donapas/off/directe...) ni als marcadors ni a l'escaleta. Ometent conductor.' i 0 insercions a V7.

**FITXERS**: `js/workflows/flow_chyrons.js`

### #107 - resolt (2026-09-29)

**SIMPTOMA**: El Tema-Títol GRAN s'ancorava al marcador d'un ALTRE ítem (un chyron de grafisme) i el titulillo d'entrada quedava 11s abans: TNV V1 'LEAD DIAGONAL TALLADA' 29/09, gran a 12.68s (= marcador 01chy) en lloc de l'inici del bloc, amb el titulillo entrant a 0.40→1.42s

**CAUSA ARREL**: MESURAT: el filtre de marcadors estructurals de placeChyronTitol era /^\d+[a-z]{0,3}\s*-\s*.+$/i → el sufíx 'lead' té 4 lletres i el marcador '01lead - LEAD DIAGONAL TALLADA' (@0.00) quedava EXCLÒS (log: '1 marcadors estructurals; ids: [1CHY]'). Sense el marcador propi de l'ítem, markerTimeFor('01lead') queia al respatller markersByBase['1'] = 12.68 (el marcador del 01chy del GF) i el gran s'hi ancorava ('→ 12.68s (marcador 1 (base))'); el titulillo (Titol·Petit) d'entrada s'inseria a 0.40s perquè _blockStartTime tornava CasB (conductor a V7) → 11s de separació entre el titullet i el gran. El revers del titulillo (_fillTitulilloGaps::markerTimeForItem) patia el mateix ancoratge ('SORTINT → 11.68s→12.68s').

**SOLUCIO**: flow_chyrons.js: (a) STRUCTURAL_RE/STRUCT_RE de placeChyronTitol i _fillTitulilloGaps passen a [a-z]{0,5} → el marcador propi d'un ítem '01lead' torna a comptar com a estructural; (b) guarda baseTakenByOther a markerTimeFor/markerTimeForItem: el respatller per BASE no s'usa si un ALTRE ítem de la mateixa base té marcador amb sufíx ('01chy' vs '01lead') → l'ítem sense marcador propi va a l'inici del bloc. Resultat al mateix bloc: gran a 0.40s (inici del bloc · CasA), sense conductor i sense titulillo; escenaris de regressió: 02lead@30 amb 02chy@45 → 30.00s; base lliure (marcador '03' sense sufíx) → 40.00s.

**FITXERS**: `js/workflows/flow_chyrons.js`

### #108 - resolt (2026-09-29)

**SIMPTOMA**: Marcadors que queden VERDS (color per defecte de Premiere): TNV_V2 'NEGOCIACIONS HABITATGE' 29/09 — el marcador `01dir` sortia verd després de la fase F4·ASIG

**CAUSA ARREL**: MESURAT (FASTPASS_audit.log 2026-09-29 10:59:07): `Markers.placeByPrefixes('[{"prefix":"01dir","timeSec":75.68,"comment":"01dir - CONNEXIÓ DIRECTE SOL"}]')` — SENSE colorIdx. El JSX fa DELETE+CREATE de cada marcador i només aplica color si el placement porta colorIdx; si no, intenta heretar `savedColor` (= existing.color) però `Markers.get()` retorna SEMPRE color:-1 (no és llegible en PPro 23) → el marcador recreat queda amb el color per defecte = VERD. Les 3 fases que emetien placements sense colorIdx: `_ordenarISeparar` (2 pushes), `_asignarAnclasPorDuracion` (1 push, la del cas real) i `snapOrphanMarkers` (forçava 6 perquè la condició `foundMk.color >= 0` mai es complia).

**SOLUCIO**: flow_markers.js: (1) nou helper `_colorByNumFromManifest(manifest)` que recalcula num→colorIdx des de l'escaleta (_getColorIdx); (2) `_ordenarISeparar` i `_asignarAnclasPorDuracion` afegeixen colorIdx a TOTS els seus placements; (3) XARXA DE SEGURETAT a `_safePlaceByPrefixes`: qualsevol placement amb colorIdx absent/negatiu passa a 6 (BLAU) amb WARN — cap marcador pot tornar a quedar verd per accident.

**FITXERS**: `js/workflows/flow_markers.js`

### #109 - resolt (2026-09-29)

**SIMPTOMA**: L'ítem NO agrupat `02dir` ('LIN DIRECTE PUERTA DEL SOL', agrupacio:null) no rebia cap marcador vermell al bloc TNV_V2 29/09

**CAUSA ARREL**: MESURAT (TNV_V2.fastpass.json: seq=42 num=02dir agrupacio=null flotant=false prevista=21:05:34; bloc V2 = 75739..76043s). `_detectUngroupedItems` (assembly_context.js) descartava l'ÚLTIM candidat no agrupat si no tenia OnAir (`if (it === last && !lastOnAir) continue;`), amb la idea que era 'el final trimeat per l'usuari'. Amb el V2, l'últim candidat per temps era `02dir` (21:05:34) → s'excloïa; el log del pipeline només llistava `[Ungrouped] 3 item(s) ... 01 GF-2, 01 GF-3, 01 GF-4`.

**SOLUCIO**: assembly_context.js `_detectUngroupedItems`: l'últim candidat només s'exclou si cau DESPRÉS de l'última línia orgànica del bloc (comparació amb `lines[lines.length-1]`), que sí que és la cua trimeada. Amb el V2 real: es conserven 4 no agrupats (01 GF-2/3/4 + 02dir).

**FITXERS**: `js/core/assembly_context.js`

### #110 - resolt (2026-09-29)

**SIMPTOMA**: Els marcadors VERMELLS (ítems no del bloc) no es col·locaven MAI en el flux automàtic OUT&GO, i els no agrupats sense OnAir tampoc mai (cas `02dir`)

**CAUSA ARREL**: MESURAT: els vermells només es creaven dins de `placeOnAirMarkers` (F1) i (a) l'array `phases` de `runFullPipelineOut` (js/main.js) NO incloïa cap fase F1 — tot i que el seu docstring deia 'OnAir (F1)' (els marcadors OnAir els acaba creant F3·Coinc); (b) el bucle de no agrupats de F1 exigeix OnAir (`if (!_ugHasOnAir) continue;`) → `02dir` (prevista 21:05:34, sense OnAir) quedava fora per segona vegada. Resultat: 0 vermells al bloc V2 tot i haver-hi 2dir + 3 gràfics no agrupats.

**SOLUCIO**: flow_markers.js: nou mètode JS `placeUngroupedMarkers()` (tier work-flow, zero JSX nou) que col·loca tots els `ungroupedItems` en color 1 usant OnAir i, si no n'hi ha, `horaEntradaPrevista`; js/main.js: nova fase 'Vermells (no agrupats)' al final de `runFullPipelineOut`; flow_assembly.js: alias Assembly.placeUngroupedMarkers. Amb les dades reals: `02dir` → 193.12s colorIdx=1 (els 01 GF-2/3/4 cauen a -1.88s i s'ometen per seguretat).

**FITXERS**: `js/workflows/flow_markers.js`, `js/main.js`, `js/workflows/flow_assembly.js`

**NOTA**: (2026-09-30 · TNC V2) Fase VALIDADA en execució real (s'executa i col·loca), però el seu filtre de vermells queda NEUTRALITZAT per la vàlvula de seguretat de `_safePlaceByPrefixes` → veure #116 (el lot només conté vermells, així que `mantinguts.length === 0` sempre). (2026-09-30 · TNC V3, 10:29:01: la fase acaba en 'Cap ítem no agrupat dins del bloc' → 0 vermells al bloc, filtre no exercitat.)

### #112 - resolt (2026-09-29)

**SIMPTOMA**: IPD+: el clip de transparència de subtítols (pista V2) canvia de POSICIÓ a més de canviar de pista

**CAUSA ARREL**: NO MESURAT (reportat per l'usuari 29/09). Sospita: a `Graphics.runIpdPlus`, `_ipdPlusAplicar` fa servir `moveToRange`/`insertClipFrom` per deixar 1 sol clip a SRC (PARK=3) i el clip mogut deixa d'estar alineat amb el punt d'origen (o el `position` del Motion es desplaça).

**SOLUCIO**: PENDENT — mesurar amb el log + `Clips.get()` abans/després de `Graphics.runIpdPlus` (pista V2 de subtítols)

### #114 - resolt (2026-09-30)

**SIMPTOMA**: NETEJA DEL REPO (P0→P5): 6.487 ficheros → 165 útiles, 87 .md → 22, bin/ 38 → 24 scripts, docs/SAMPLES (19 MB) fuera del git y higiene anti-contaminación para el agente

**SOLUCIO**: P0: C:\temp\fp\ + helpers bin\find.ps1 (búsqueda → fichero), bin\sizes.ps1, bin\rep.ps1, bin\merge_md.ps1. P1: 2.235 `._*` borrados + `git rm --cached` de los 70 versionados + fuera el directorio basura `-p/` + .gitignore ampliado. P2: 17 scripts muertos de bin/ borrados. P3: 65 .md fusionados en docs/archive/{AUDITORIAS,DEBUG,PLANS_CLOSED,SESSIONS}.md. P4: docs/SAMPLES → C:\temp\fp\docs_SAMPLES + docs/reference/SAMPLES_ADOBE.md. P5: sección HIGIENE DEL ENTORNO en .clinerules + README.md y .clinerules-debug actualizados.

### #115 - resolt (2026-10-02)

**SIMPTOMA**: CÓDIGO MUERTO en js/ y jsx/: 28 de los 72 .js NO los carga index.html y al menos uno (`js/core/escaleta_trim.js`) ni compila. NETeJA EXECUTADA el 2026-10-02 (OK explícit de l'usuari): 1 + 38 fitxers esborrats (242 KB) i cap fitxer no carregat pendent.

**CAUSA ARREL**: Probablemente restos del refactor de nomenclatura (español → inglés/numerado nuevo). NO demostrado todavía EN EL MOMENT DE MESURAR-LO; demostrat el 2026-10-02 (vegeu `fix` (4) i `validation`). Nota metodològica: el test de referències per subcadena dona falsos positius (noms prefixats) → cal declarar com a FONTS els fitxers vius i comparar ruta relativa + nom de fitxer. Mecanismo real confirmado: index.html es la autoridad para js/ (no hay cargador dinámico) y jsx/main.jsx carga los .jsx con load("X.jsx") explícitos.

**SOLUCIO**: PENDIENTE — sesión dedicada: (1) cruzar candidatos con la lista de loaders, (2) comprobar con palabra completa si el código cargado usa su API, (3) validar en Premiere (1 arranque + 1 NEW + 1 CUT) y solo después borrar. escaleta_trim.js es el caso más claro. (3-bis) 2026-10-02: `js/core/escaleta_trim.js` ESBORRAT amb l'OK de l'usuari (era truncat, 0 referències, no llistat a index.html i les seves funcions viuen a escaleta_bounds.js) → `bin/check_js_v8.ps1`: TOTAL 95 | OK 95 | FAIL 0. Els altres .js NO carregats per index.html van quedar resolts a l'apartat (4) d'aquest mateix camp. (4) 2026-10-02 · NETeJA COMPLETA (OK explícit de l'usuari, «Elimina el codigo muerto»): esborrats 38 fitxers (242 KB) en 3 grups — (a) 27 `.js` no llistats a `index.html`: `js/core/10_Eines.js`, `12_Estat.js`, `13_Registre.js`, `14_Sintesi.js`, `escaleta_onair.js`, `escaleta_overrides.js`, `logger.js`, `nnews_parser.js`; `js/inspectors/20_Sessio.js`, `21_Aplicacio.js`; `js/logic/11_NNews_Logic.js`, `22_Escaneig.js`, `23_Analisi.js`, `31_Pistes.js`, `32_Segments.js`, `33_Animacio.js`, `34_Exportacio.js`, `35_Subtitols.js`, `36_Projecte.js`, `37_Muntatge.js`; `js/workflows/flux_animacio.js`, `flux_exportacio.js`, `flux_muntatge.js`, `flux_principal.js`, `flux_retols.js`, `flux_subtitols.js`, `flux_tall.js`; (b) `js/workflows/flow_retols.js` — aquest SÍ que era a `index.html`, però era inabastable: els 4 hooks de `main.js` hi eren comentats i cap botó de `index.html` cridava `Retols` → fora el fitxer, el `<script>` i el bloc de hooks comentats (:687-712, cap d'aquells ids existeix a `index.html`); (c) 10 `.jsx` no carregats pel bootstrap de `jsx/main.jsx` (només fa `load()` explícits de 12 mòduls): `10_Sistema.jsx`, `11_Entorn.jsx`, `12_Arxiu.jsx`, `19_Diagnosi.jsx`, `20_Projecte.jsx`, `30_Cronologia.jsx`, `31_Pistes.jsx`, `32_Segments.jsx`, `33_Animacio.jsx`, `34_Exportacio.jsx`. Són els restes del refactor de nomenclatura castellà → anglès/numerat (Eines→Utils, Segments→Clips, Cronologia→Timeline, Pistes→Tracks, Animacio→Anim, Exportacio→Render, flux_*→flow_*, 2x/3x_*→*_Logic). Edicions acompanyants: `index.html` (fora el `<script>` de `flow_retols.js`; `js/main.js?v=75 → v76`) i `js/main.js` (fora el bloc de hooks comentats de botons ocults).

**VALIDACIO**: CRITERIS DE DEMOSTRACIÓ (2026-10-02, 4 comprovacions automàtiques sobre el repo real): (1) CÀRREGA — `index.html` és l'única autoritat per a `js/` (no hi ha `createElement('script')`/`loadScript`/`src=` dinàmic en tot el repo) i `jsx/main.jsx` carrega amb `load()` explícits (els 12 mòduls del bootstrap) → cap dels 38 fitxers té loader; (2) REFERÈNCIES — declarant com a FONTS tots els fitxers vius (js/jsx/html/xml) i comprovant contenció de la ruta relativa I del nom de fitxer, cap dels 38 apareix esmentat i NO queda cap orfe de segona ordre (els únics segons ordes eren `js/logic/31-34`, referenciats NOMÉS pels `.jsx` morts, i també s'han esborrat); (3) APIs — cap API seva s'usa des de codi viu: `FASTPASS_UI.Eines` → 0 usos vius (el viu és `Utils`); 0 crides vives del tipus `callJSX('Segments./Pistes./Animacio./Exportacio./Cronologia./Entorn.')` (les 114 existents són TOTES d'aquests fitxers morts); `FASTPASS.{Segments,Pistes,Animacio,Exportacio,Cronologia,Sistema,Arxiu,Projecte,Diagnosi}` → 0 usos vius (el viu només usa `FASTPASS.{Clips,IO,Project}`); `Logic.{Pistes,Segments,Sub,Projecte,NNews}`, `Logger`, `Registry`, `NNewsParser`, `getOverridenDuration`, `Logic.Parse.meta` → 0 usos vius; (4) DUPLICATS VIUS — tot espai de noms que sí que viu té el seu duplicat VIU i carregat (`Logic.Anim` → `js/logic/7_KF_Logic.js`, `Logic.Render` → `9_Render_Logic.js`, `Logic.Scan` → `Scanner.js`, `Logic.Parse` → `13_Parse.js`, `Logic.Assembly` → `14_Assembly_Logic.js`, `Inspectors.App/Session/SourceAssets` → `2_App.js`/`3_Session.js`/`1_SourceAssets.js`, `Core.Context` → `4_Context.js`, `State` → `state.js`, `Registry` → `project_registry.js`, `EscaletaReader.calcClipBounds/getOnAirVideoItems/getNeighbourOnAirTimes/ITEM_DURATION_OVERRIDES` → `escaleta_bounds.js`/`escaleta_config.js`) i cap mòdul `.jsx` viu en depèn. `bin/check_js_v8.ps1` després de la neteja: TOTAL 57 | OK 57 | FAIL 0 (abans: 95 = 72 .js + 23 .jsx; ara 57 = 44 .js + 13 .jsx). Resta pendent NOMÉS l'arrencada real a Premiere.

### #118 - resolt (2026-09-30)

**SIMPTOMA**: BOUNDS TNM V1 (29/09): l'IN del bloc s'enfonsa de 14:31:53 a 14:29:58 (inici del sumari) i la fase de Vermells omple la capçalera del clip amb 10 marcadors vermells (S1..S7, CARETA, 01 TE-1/TD-1); cap OnAir mentider: el culpable és el sostre del piso (_refFloorSec/refSec) DESACTIVAT perquè blockLines[0] ('01dp') no té hora a l'escaleta en memòria

**CAUSA ARREL**: Els guards 'posterior al bloc' dels dos pisos es calculen a partir de blockLines[0] (escaleta_bounds.js:1049-1061 _refFloorSec i :778-786 refSec). Al bloc v1 (seq 25-30) el primer ítem és '01dp' (DONA PAS, sense OnAir) i a l'escaleta EN MEMÒRIA no té hora → _refFloorSec = null → el guard no s'aplica i els dos pisos miren TOTA l'escaleta. Prova: el TNM_V1.fastpass.json (escrit 10:42:57 amb el MATEIX objecte en memòria) porta '01dp' amb horaEntradaPrevista=null i horaSortidaPrevista='14:31:56' (i '01dir' null/'14:32:46' = l'OnAir del 01), mentre '01 TE-1'/'01 TD-1' (mateixa hora 14:32:14) la conserven; el fitxer del NAS sí porta '01dp prev=14:32:14' → hi ha una normalització/reescriptura d'hores dels ítems del bloc sense OnAir encara no localitzada (cap assignació a horaEntradaPrevista/horaSortidaPrevista fora del sanejat :650 i l'escaleta en memòria es va carregar ABANS de la rotació del log de 10:42:08). Sense el guard, l'IN·FLOOR (:1062-1077) pren el primer vídeo FORA del bloc amb final > IN: '04' (seq 34, +++IPD PASSADISSOS CONGRÉS, OnAir 14:35:35 + dOA 0:57 = 52592), que és 3:20 DESPRÉS de l'OUT del bloc (52519) — els candidats previs queden descartats per 'end <= IN+0.5' (S2 52246, S4 52276) i els 01/100/02/200 pel _blockIdxSet → guanya el pitjor candidat possible. Després _applyForeignVideoFloor (:790-813) recorre la resta del programa; a més, per als ítems de piso amb durada 0:00 (07 P5-1, 10 P4-1, 12 P4-1, 13…) endSec = prevista + 0 → el piso arrossega l'IN a l'INICI d'un ítem posterior, no al seu final. VALIDACIÓ HEADLESS (C:\temp\fp\tnm_in_sim.ps1, mateixa escaleta): amb refSec=null reprodueix exactament 52313 → 52592 (item '04') i la cascada; amb refSec=52334 (la prevista del FITXER) no hi ha cap candidat → l'IN es queda a 52313.

**SOLUCIO**: PENDENT (acord 30/09: NOMÉS NOTA). (1) El sostre del piso no pot dependre d'un sol ítem: referència robusta = primera hora REAL del bloc (OnAir del 01 = 52366) i, si no n'hi ha, block.in; i si no hi ha cap referència → no aplicar el piso (o només permetre'l cap enrere) + WARN al log (ara és silenciós). (2) Els pisos no han de considerar ítems POSTERIORS a l'últim ítem del bloc (per índex, no només per hora). (3) Un ítem amb durada 0:00 no pot fer de piso (no hi ha res emetent-se). (4) L'usuari validarà recreant el bloc tallant l'IN amb el botó: al log ha de sortir start≈14:31:53 (no 14:29:58) i la fase Vermells SENSE S1..S7/CARETA (quedaran 'fora del clip → Saltant'); únic vermell possible '01 TE-1'/'01 TD-1' (14:32:14, agrupació null, cartells de la intro) → decisió de producte, com al #116.

### #119 - resolt (2026-09-30)

**SIMPTOMA**: El marcador d'INICI del bloc (00:00) desapareix: F5·Inferits mou l'ítem que el sosté (TNM V1 30/09, '01dp'). El bloc tallat correctament per l'usuari acaba sense cap marcador a 0 i amb '01dp'/'01dir' xocats a 5,84 s.

**CAUSA ARREL**: Dos ingredients. (1) '01dp' i '01dir' entren a classData.unplacedItems (no tenen OnAir ni prevista — efecte col·lateral de #118) i F5 (placeInferredItems, flow_markers.js:2173-2297) els ha de deduir: per a '01dp' no hi ha veí ANTERIOR amb marcador → lo = clips[0].start (0) i hi = 01@19.64 (:2232-2243); _pickInferredByDensity tria la ruptura LOW→HIGH a 5,84 s. (2) _safePlaceByPrefixes → Markers.placeByPrefixes fa DELETE+CREATE per PREFIX (documentat a flow_markers.js:204-207): col·locar '01dp'@5,84 BORRA el marcador de 00:00 que havia posat F2 i el recrea a 5,84. El forat: F5 és l'ÚNICA fase sense guarda del marcador d'inici — F2 la té (hasStartMarker, :1028-1041), F3 també (:1207-1220), F3.5 també (:1336-1337 'cmkTime < 0.01 → no rep Δ'), F4 també (:2114 'markerTime < 0.01 → continue // el marcador d'inici no es toca') i F6/ASIG/Ordre també (:1585 esInici, :1718 IMMUTABLE). F5 ni mira si l'ítem que dedueix és el que sosté el 00:00. Símptoma secundari del mateix pass: posByPrefix es construeix ABANS del bucle (:2188-2200) i no s'actualitza amb les pròpies col·locacions → '01dir' calcula la seva finestra amb la posició VELLA de '01dp' (0.00) i cau a la mateixa ruptura (5,84 s): els dos marcadors se superposen i es trenca la regla documentada 'MAI a menys de 0,5 s d'un marcador veí' (:2171).

**SOLUCIO**: PENDENT (acord 30/09: NOMÉS NOTA, no implementat). (1) placeInferredItems: saltar qualsevol ítem el prefix del qual ja sosté el marcador d'inici (marcador existent a < 0,15 s) o que sigui el prefix d'inici (_iniciPrefix / 1r estructural que fa servir F2) → no entra ni a placements ni a la finestra dels altres. (2) Defensa GLOBAL a _safePlaceByPrefixes: descartar (continue + WARN) qualsevol placement amb timeSec < 0,15 tret que el caller ho autoritzi explícitament (allowStart:true, només F2 i capa0) → cap fase (ni les futures) pot tornar a esborrar el 00:00. (3) Actualitzar posByPrefix després de cada placement acceptat (o usar un mapa local del propi pass) per no fer col·lisionar dos ítems de la mateixa finestra. (4) Validació al run següent: L294/L303 iguals ('01dp' a 0.00 s) i F5 SENSE '01dp' entre els Moguts.

### #120 - resolt (2026-09-30)

**SIMPTOMA**: El projecte NOU es crea SENSE clip (V1 buida) quan el bloc no és dins del cleanFeed: la guarda 'cleanFeed encara en ingesta' (skipVideoIngesta) descarta també el FALLBACK del MP4 individual del bloc, que existeix i és COMPLET (TNM V4 del 29/09)

**CAUSA ARREL**: (a) Guarda `flow_mainButton.js:436-451`: `stopIng = tcToSeconds(cleanFeed.mediaStop) = 54040 s` < `outIng = tcToSeconds(getBlock(jsonData,'V4').out) = 54352 s` → `skipVideoIngesta = true` → `assets.media.mp4 = null`. (b) `_runNew` (:1124) → `skipVideoIngesta ? null : cleanFeedData` → `Project.create` rep NULL → `3_Project_Logic.js:462-465` no entra a l'insert (només logueja '❌ No hi ha dades…') i el projecte es guarda amb V1 buida → `Clips.get(1,0,'video')` = null (:1143) i ref incomplert (:1188). (c) El fallback `useBlockMedia` (:526-586) JA havia trobat el MP4 del bloc i construït `cleanFeedData` (:630-651) amb aquella ruta → es llença. La guarda protegeix del cleanFeed TRUNCAT, però el MP4 del bloc és un fitxer INDEPENDENT i complet (249,015 s). (d) Arrel de fons: per al V4 només existeix l'escaleta de les 15:00:57 i el seu cleanFeed (fi 15:00:40) no inclou el bloc (15:01:43→15:05:52) → cap re-run amb aquest JSON passarà mai la guarda (ACTUALITZAR tampoc); en canvi V1/V2/V3 sí que passen (mediaStop 14:45:10 / 15:05:30 / 15:10:00 > final de cada bloc) → per això ells sí que van importar.

**SOLUCIO**: PENDENT (proposat, no implementat). (1) No llençar el fallback: passar `cleanFeedData` quan el MP4 del bloc s'ha trobat (`useBlockMedia`) — avui aquest flag viu dins del `if (bounds)` i cal elevar-lo a l'abast de `_runNew`: `(skipVideoIngesta && !useBlockMedia) ? null : cleanFeedData`. (2) Millor: decidir la guarda pel que s'IMPORTARÀ: si `Scan.mediaAssets(ctx)` troba el MP4 del bloc a `rutas.verticalitzacio`, la guarda no aplica (el contingut no depèn de la ingesta del cleanFeed). (3) Estat/UI diferenciat: 'MP4 del bloc importat (el cleanFeed no el cobreix)' vs 'sense vídeo: cleanFeed encara en ingesta'. (4) Reubicar la guarda DESPRÉS de `_setLogPath` (:473) perquè el seu WARN quedi al log del projecte. Validació esperada: `phases.mp4Imported:true`, `TNM_V4_CLIP.mp4` a la carpeta i V1 amb clip 0→149 s + `📐 ref establert: offsetSec=…`.

### #121 - resolt (2026-09-30)

**SIMPTOMA**: S'importa material ALIÈ a V1 quan el bloc s'emet MÉS ENLLÀ del final del SNAPSHOT de l'escaleta: la guarda 'cleanFeed en ingesta' i el límit [OUT-MARGIN] es calculen amb `cleanFeed.mediaStop` del JSON (fotografia del moment de publicació: fins on havia arribat la ingesta ALEES), no amb la durada real del MP4. El bloc queda 'fora de rang' → fallback al MP4 del bloc, que pot ser un render PREMATUR amb el material del bloc ANTERIOR. El clip s'insereix a la timeline amb material que no correspon als ítems del bloc (les marques no hi quadren).

**CAUSA ARREL**: (1) `cleanFeed.mediaStop` / `mediaDuration` del JSON és un SNAPSHOT de publicació, no la durada del fitxer: en crear el projecte més tard (o en diferit) el MP4 ja conté molt més material i el snapshot queda curt. TOTS els consumidors d'aquest valor estan afectats: la guarda d'ingesta (`stopIng = tcToSeconds(jsonData.cleanFeed.mediaStop) < out`), el clamp 'No passar mai del final del MP4 cleanFeed' d'`escaleta_bounds.js:1282-1289` (que va truncar l'OUT de 2292 s a 2020 s) i `isBoundsOutOfCleanFeedRange` (`escaleta_fallback.js:37-71`). (2) L'única via de MESURAR la durada (`Logic.FFmpeg.checkSourceDuration`, 15_FFmpeg_Logic.js) estava trencada i per això es va documentar com a 'poc fiable per IO.executeShell amb pipes': fa servir `waitForFile`, que espera que `IO.readTxt` retorni literalment 'OK' — i el fitxer de sortida de ffprobe conté '4080.02' → ERR_TIMEOUT de 5 s a cada crida i retorn del 'fallback suficient' cec. (3) El fallback al MP4 del bloc acceptava qualsevol fitxer amb el nom del bloc, sense validar-ne ni la data d'escriptura ni la durada → un render prematur del bloc anterior passava com a bo.

**SOLUCIO**: IMPLEMENTAT 2026-09-30 (pendent de test a Premiere). (a) `js/logic/15_FFmpeg_Logic.js`: NOVA `getMediaDuration(sourcePath)` — durada real per ffprobe amb el patró que SÍ funciona (`keyframeAtOrBefore`: `IO.executeShell` + redirect a fitxer temp + polling del CONTINGUT fins estabilitzar-se; només accepta una línia que sigui exactament un número, perquè un 'No such file' amb dígits al nom donaria una falsa durada). `checkSourceDuration` queda marcada com a DEPRECADA per mesurar durades. (b) `js/workflows/flow_mainButton.js`: abans de la guarda d'ingesta es mesura la durada REAL del cleanFeed i, si el fitxer arriba més enllà del snapshot, es fixa `cleanFeedMediaStopEff` (TC efectiu) que s'usa a la guarda, a `calcPrecisionTrimBounds` i a `isBoundsOutOfCleanFeedRange` → amb la durada real (4080 s) el bloc (2292 s) és DINS del fitxer: no hi ha guarda, no hi ha clamp i NO hi ha fallback. (c) El fallback al MP4 del bloc queda VALIDAT per `_validateBlockMedia` (durada real vs durada del bloc + mtime del fitxer: ha de ser posterior a l'inici del bloc − 60 s): si no passa, el fitxer es DESCARTA, es loga `⛔ [FALLBACK] MP4 del bloc DESCARTAT (…) → no s'importa material d'un altre bloc` i el projecte queda sense vídeo (ACTUALITZAR quan la ingesta arribi) — mai més material aliè a la timeline.

### #122 - resolt (2026-09-30)

**SIMPTOMA**: Gràfics del TNV (GF/P2) tractats com a ESTRUCTURALS: el marcador OnAir '01' queda 1,32 s ABANS del seu corte real, els GF es pinten VERMELLS i s'apilen a l'inici del bloc (1,32s → 0,00s) en comptes d'anar dins de la intro, i apareix un marcador ROIG espuri a la cua de la timeline (162,32 s) amb '02 GF-1'/'02 GF-2'.

**CAUSA ARREL**: `_GRAPHIC_SUFFIXES` conté el sufix NET ('gf', 'gf1', 'p21', …) però l'escaleta del TNV escriu el número amb ESPAI i GUIONET ('01 GF', '01 GF-1', '02 GF-2', '25 P2-1'). `_isGraphicByNum` comparava el sufix CRU contra la llista → mai casava → GF/P2 es tractaven com a ESTRUCTURALS, i això encadenava els tres símptomes alhora: (1) `F2·Deduced` els col·locava com a ítems propis (1,32 s) i el Δ de correlació (F3/F3.5) es tancava amb el seu offset d'ancoratge → Δ=-1,32 s i el marcador '01' a 46,00 s en comptes de 47,32 s; (2) `F4·Faro` els donava per bons ('1 ja correctes') perquè corre ABANS de `F6·Gràfics`, que és qui els ha d'ancorar al pare (D13); (3) `_getColorIdx` i `assembly_context._detectUngroupedItems` no els reconeixien com a gràfics → color 1 (VERMELL) i, sense pare dins del bloc, cua de la timeline a 162,32 s. El Δ real és 0,00 s (clip i manifest coincideixen a 47,32 s) i el tall real del bloc és a 48,84 s (ruptura DP+DIR).

**SOLUCIO**: IMPLEMENTAT 2026-09-30 (pendent de test a Premiere) · `js/workflows/flow_markers.js` (5 punts, una sola arrel): (1) nous helpers `_normSuffix` (:77) i `_graphicSuffixesNorm` (:85) — normalitzen traient espais/guions/baixos ('01 GF-1' → 'gf1'); `_isGraphicByNum` (:96) passa a ser l'ÚNIC punt de veritat i tots els camins hi passen; (2) `_getColorIdx` (:223) — el check de GRÀFIC va ABANS del d'`agrupacio` → GF/P2 SEMPRE groc (4); (3) `_correlationSnap` (:649) — els gràfics NO voten el Δ (log '🔬 [CorrelationSnap] Excloent gràfic …') + `skippedGraphics35` a F3.5 (:1357); (4) `F4·Faro` (:2169) — els gràfics es salten (`alreadyOk++`) perquè F6·Gràfics els ha d'ancorar al pare; (5) `F6·Gràfics` (:2955) — gràfic SENSE pare dins del bloc que cau a la CUA → es descarta. `index.html`: cache-bust `flow_markers.js?v=61` → `?v=62`. Sintaxi `bin/check_js_v8.ps1`: TOTAL 96 | OK 95 | FAIL 1 (només `core/escaleta_trim.js`, preexistent i aliè).

### #123 - resolt (2026-09-30)

**SIMPTOMA**: Els marcadors DEDUÏTS dels parells DP+DIR del TNV V2 (`16dp` i `16dir`) queden a 7,00 s i 30,80 s del seu corte real (ruptures de densitat 23,36 s = 00:00:23:09 i 48,80 s = 00:00:48:20): ASIG els arrossega a 15,00/18,00 s, SEP regressa `16dp` i el snap de F4 (±2,5 s) ja no els pot recuperar. A més, F5·Orphans (només Ctrl+clic) forçava `mkColor = 6` → pintava de BLAU tot marcador que movia.

**CAUSA ARREL**: (a) `_asignarAnclasPorDuracion` (abans :1781-1786) triava la PRIMERA ancla lliure en ordre d'escaleta (`for (var a2 = idxA; a2 < ancles.length; a2++) { … triat = ancles[a2]; break; }`), no la MÉS PROPERA: `16dir` (41,60 s) saltava a 18,00 s. (b) El snap dels deduïts a F4 té finestra ±2,5 s (`_snapWindowDeduced`) → un cop ASIG/SEP han portat `16dp` a 15,00 s, la ruptura real de 23,36 s queda fora d'abast i s'ancora al tall d'obertura (16,36 s). (c) SEP tanca el cercle: regressa `16dp` a 15,00 s perquè `16dir` ja ocupa 18,00 s. (d) F5·Orphans: `mkColor = (foundMk.color >= 0) ? foundMk.color : 6` — `Markers.get()` retorna SEMPRE color:-1 (PPro 23) → sempre 6 (BLAU); tampoc saltava els gràfics (els trauria del pare).

**SOLUCIO**: IMPLEMENTAT 2026-09-30 (pendent de test a Premiere) · `js/workflows/flow_markers.js`: **(A)** NOU helper `_preAssignDeducedToBreaks` (:2091-2136) — assignació 1:1 entre RUPTURES DE DENSITAT LLIURES i ítems DEDUÏTS dins de cada tram entre faros consecutius; només si la cardinalitat quadra EXACTAMENT (conservador: si no, no toca res); el 🔒 marcador d'inici (≤0,15 s) compta com a frontera però mai es mou; els gràfics queden fora (`_isGraphicByNum`). Cridat a F4·Faro (:2233-2243, log `🟠 [F4·Faro] Pair ruptures↔deduïts (1:1): {…}`) i consumit a :2274-2278 (mana sobre el snap de ±2,5 s). **(B)** ASIG (:1780-1801): s'escull l'ancla de cost mínim `abs(Δ) + 2,0 si tipus = 'corte·medi'`, amb xarxa de seguretat `MAX_NEAR = 15 s` (si la millor queda més lluny, es manté el comportament antic) i log amb Δ. **(C)** F5·Orphans (:2816-2831, :2849-2853, :2886-2888): color des de l'escaleta (`_getColorIdx(lineByNum[prefix])`) en lloc del 6 fix, i els gràfics se salten (igual que F4 a #122). Validació: `bin/check_js_v8.ps1` → TOTAL 96 | OK 95 | FAIL 1 (només `core/escaleta_trim.js`, aliè) + TEST FUNCIONAL REAL amb el V8 del CEP (Edge headless carregant el flow_markers.js real, C:\temp\fp\fp_pair_test.html) amb l'estat de F4 del run V2: `{15@0, 16 GF-1@9,96, 16 GF-2@13,16, 16dp@15,00, 16dir@18,00, 16@61,60}` + ruptures [23,36 · 48,80 · 61,60] → `{"16dp":23.36,"16dir":48.8}` ✓; 3 deduïts al mateix tram (2 ruptures) → `{}` ✓; sense deduïts → `{}` ✓.

### #124 - resolt (2026-09-30)

**SIMPTOMA**: El PNG de la PORTADA (workflow RENDER · runPortada) es componia sobre un frame DIFERENT del que es veu a la timeline: la còpia del clip de V1 es fa amb Clips.insertClipFrom, que crea una INSTÀNCIA NOVA des de l'ítem del projecte i Premiere li aplica el Motion PER DEFECTE (centrat, escala 100, sense retalls). El Motion del clip real (IPD 144% + pos [-94.5, 562] px, retalls de la DF…) viu a la instància de PISTA i NO s'hereta → la foto de la portada no era la del cabezal. Queixa de l'usuari: «cuando se hace la copia del clip para ponerle encima el png, no se le aplica la posicion del clip original».

**CAUSA ARREL**: Clips.insertClipFrom (jsx/modules/6_Clips.jsx:1526) fa tgtTrack.insertClip(clip.projectItem, timeSec): el trackItem nou neix amb el Motion per defecte, perquè els efectes/transform viuen a la instància de pista i no a l'ítem del projecte. La captura (Render.snapshot a la zona neta) era, doncs, el frame SENSE el transform del clip original.

**SOLUCIO**: IMPLEMENTAT 2026-09-30 (pendent de test a Premiere) · js/workflows/flow_render.js runPortada: (1b, :363-384) just després de resoldre el clip de V1 sota el cabezal — amb el CTI encara al cabezal, valor del frame que es vol capturar — es llegeixen els valors amb Anim.getMotionValues(1, <src.index>); (4b, :444-466) després de Clips.moveToRange (inPoint i durada ja fixats) s'apliquen a la CÒPIA amb Anim.setMotionValues(1, <idxCopy>). Es transfereixen position, scale, scaleWidth i cropLeft/Top/Right/Bottom, ometent les claus null. Mateixos àtoms get/set → mateixes unitats (get torna PÍXELS i set els normalitza ell mateix dividint per frameSize). Camins d'error: get ERR*, JSON il·legible o set ERR → avís WARN i el flux CONTINUA (la portada es genera igual). ZERO JSX nou (composició amb àtoms existents). index.html: cache-bust flow_render.js?v=23 → ?v=24. Validació: bin/check_js_v8.ps1 → TOTAL 96 | OK 95 | FAIL 1 (només core/escaleta_trim.js, aliè) + TEST FUNCIONAL REAL amb el V8 del CEP (Edge headless, C:/temp/fp/fp_portada_motion_test.html) que extreu els DOS blocs REALS del fitxer i el utils.escape real i els executa amb un callJSX simulat → 23/23 PASS (traça get(original V1[3]) → set(còpia V1[7]) → comprovació; payload JSON vàlid amb negatius/decimals [-94.5, 562.25]; claus null omeses; i els 3 camins d'error sense excepció i sense escriure).

### #125 - resolt (2026-09-30)

**SIMPTOMA**: TNV_V1 del 29/09: el marcador de grafisme '01 GF-3' surt BLAU (hauria de ser GROC, com els altres tres GF) i col·locat a 58,52 s — dins del vídeo del discurs — en comptes d'anar amb GF / GF-1 / GF-2 a +10/+15/+20 s dins de la intro.

**CAUSA ARREL**: `_GRAPHIC_SUFFIXES` (:51) tenia 'gf', 'gf1' i 'gf2' però NO 'gf3': `_normSuffix('01 GF-3')` → 'gf3' no casava amb cap entrada del whitelist, així que la família GF es trencava a partir del TERCER gràfic. Amb GF-3 classificat com a ESTRUCTURAL (el fix #122 el va fer caure al check d'agrupacio de `_getColorIdx`, :224 → 6 BLAU) tot el pipeline el va arrossegar com un ítem del bloc: F2 el va deduir a 1,20 s, F3.5 li va aplicar Δ i el va reescriure amb name='definitiu' (color 6), F4·ASIG el va llançar a l'àncora més propera (58,52 s, un tall real DINS del discurs) i `_classifyItems` només va veure 3 gràfics → F6·Gràfics (que sempre força colorIdx 4) ni el va col·locar ni el va pintar groc. El mateix forat afecta 'p40'/'p41'/'p42' (germanes de les 'p51'/'p52' que ja hi eren): l'escaleta del dia fa servir '10 P4-1', '31 P4-0' i '12 P4-1'.

**SOLUCIO**: IMPLEMENTAT 2026-09-30 (pendent de test a Premiere) · `js/workflows/flow_markers.js`, 3 punts i ZERO línies de JSX: (1) guard genèric `if (/^gf\d+$/.test(suf)) return true;` a `_isGraphicByNum` (:103) — la família GF és OVERTA a l'escaleta (GF-1…GF-N) i no pot ser una llista tancada; (2) entrades explícites 'gf3','gf4','gf5' (:57) i 'p40','p41','p42' (:59) al whitelist; (3) cap altre camí tocat (tots passen per `_isGraphicByNum`, que ja és l'únic punt de veritat des de #122). index.html: cache-bust `flow_markers.js?v=62` → `?v=63`. Validació feta sense Premiere: `bin/check_js_v8.ps1` → TOTAL 96 | OK 95 | FAIL 1 (només core/escaleta_trim.js, preexistent i aliè) + TEST FUNCIONAL REAL amb el motor V8 del CEP (Edge headless, `C:/temp/fp/fp_gf3_test.html`) sobre l'escaleta REAL del bloc V1 → 41/41 PASS: `_isGraphicByNum('01 GF-3')=true` (i GF-4/GF-12/les famílies ja existents) amb controls negatius intactes ('51ft', '53 tp', '22L', '01dp', '01i'), `_getColorIdx('01 GF-3', agrupacio=v1)=4 GROC`, `_colorByNumFromManifest` → els 4 GF = 4 i 01i/01 = 6, `_classifyItems` → graphicItems = els 4 GF i structuralItems = 01i+01, i D13 amb 4 gràfics → 10 / 15 / 20 / 25 s.

### #126 - resolt (2026-10-01)

**SIMPTOMA**: REVISIÓ DE LA MÀSCARA DE PISTA: cap procediment del panell la protegeix. (a) IPD+ té les pistes HARDCODEJADES `SRC:2` (V2 = pista de la MÀSCARA al mapa 2026-09-22, «V2 Màscara (PROTEGIT) sense clau a Profile.json»), `PARK:3` i `BASE:1`; si la màscara viu a V2, IPD+ se l'emporta a V3, la retalla a l'interval i deixa V2 ocupada per una còpia de V1, i al REVERTIR només restaura el Motion de V1 (mai el de V2). (b) La Doble Finestra escriu a V4 (`video1`) — que és exactament on el propi codi diu que l'operador col·loca la màscara a mà (`flow_graphics.js:908-911`) — amb insert+ripple (PAS1) i Motion scale 68/position/crops (PAS4:1127-1164): si la màscara és allà, se li desplacen el clip i les propietats. (c) L'únic punt que encara anomena MASCARA és un diagnòstic OBSOLET: `flow_graphics.js:1031-1033` llegeix el clip de V5 (T_V3 = video2) i avisa «V3 conté la MASCARA».

**SOLUCIO**: DECISIÓ DE L'USUARI (2026-10-01): la màscara viu a **V2** i «**V4 ja NO és zona de màscara**» → es descarta protegir V4 i la vigilància es concentra a V2 (IPD+ SRC:2/PARK:3 i les còpies de V1). IMPLEMENTAT 2026-10-01 (vegeu el camp 'impl'): feta la combinació de les opcions 1 i 2 amb ZERO JSX nou; l'opció 3 queda PENDENT. Opcions que hi havia sobre la taula: (1) afegir `v_mascara`/`v_mosa` a Profile.json + `Config.get()` i fer que IPD+ llegeixi SRC/PARK/BASE de la config (mateix esperit que l'entrada legacy DF_MAPA_A_CONFIG); (2) excloure de l'interval els clips amb nom MASCARA* (avís + salt); (3) desar i restaurar l'estat de Motion de TOTS els clips de SRC, no només del primer (`flow_graphics.js:727-731` només guarda `src[0]`). CONFIRMAT per l'usuari el 2026-10-01: la màscara viu a V2. Detall complet: `plans/HANDOFF_2026-10-01.md` → secció «Màscara de pista».

**VALIDACIO**: Estructural: Profile.json parseja i mostra v_mascara=2 a les 4 estructures; cap BOM i CRLF intactes. bin/check_js_v8.ps1: TOTAL 96 | OK 95 | FAIL 1 (només core/escaleta_trim.js, preexistent i aliè). TEST FUNCIONAL REAL amb el motor V8 del CEP (Edge headless, C:/temp/fp/fp_mascara_test.html) que EXTREU els 4 mètodes del flow_graphics.js real i executa el 11_Configuracio.js real amb new Function('window', src): 48/48 PASS (config + àlies + fallback + els 4 blocs, Profile.json, cache-bust d'index.html, _mascaraTrack amb config i amb fallback, _mascaraClips amb pista/tipus de la config, majúscules i accent, MASCARILLA que NO casa i filtre d'interval, _avisMascara WARN/DEBUG i pista il·legible sense excepció, i l'ordre real de les crides a runIpdPlus i _dpPaso0).

### #127 - resolt (2026-09-30)

**SIMPTOMA**: MECANISME DE SEGURETAT — si el panell no pot importar un MP4 vàlid, tota la lògica ha de funcionar igual amb el clip que l'operador hagi col·locat a V1: IN el retalla des del principi, OUT&GO el retalla i el trosseja, i els chyrons/grafismes es col·loquen comptant els SEUS clips.

**SOLUCIO**: PLA ESCRIT (no implementat): `docs/plans/PLAN_FALLBACK_CLIP_USUARI.md`. Idea: un únic RESOLVEDOR D'ANCLA en JS (`getV1Anchor()` → `{source:'EXT'|'USER', clip, bounds, mediaOffsetSec}`) + un `cleanFeedData` SINTÈTIC construït des del clip real (inPoint/outPoint com a mp4ExpandedIn*) + guardes d'UI que no s'aturen si V1 té un clip, + `phases.v1Anchor`. Zero línies de JSX noves.

### #128 - resolt (2026-10-01)

**SIMPTOMA**: TITULILLO (flow_chyrons): dos defectes al titulillo de sortida detectats per l'usuari testejant el 2026-10-01 — (a) el PRIMER clip col·locat queda 1 FRAME massa llarg (sobrepassa el final de l'interval definit pels marcadors) i (b) el clip de CONGELAT (el titol invertit, de l'entrada a la sortida) NO es col·loca. La resta de clips del titulillo si que entren.

**CAUSA ARREL**: DIAGNOSTICAT 2026-10-01 (lectura del codi + aritmetica dels logs) · El clip CONDUCTOR de V6 arrossega ~15 frames (0,60 s) de CUA BUIDA al final: l'animacio ja ha acabat pero el clip encara dura. El Tema-Titol gran en CasB s'ancorava a `condEnd` (= `firstV6.end`, el FINAL del clip) -> entrava aquests 15 frames TARD, i el revers del titulillo (`Math.ceil((target - durP) / REV_FRAME)`) i el congelat s'hi ancoraven tambe. Aixo explica (a) que l'OUT del 1r clip sobrepasses l'interval (tota la zona anava desplacada 15 frames) i (b) que el CONGELAT no sortis: la ruta ACTIVA es `_placeTemaTitolTransicions` (no `_fillTitulilloGaps`), i alla no hi havia cap crida de congelat; a `_fillTitulilloGaps` §2 el buit es calculava com a 0 perque el revers JA era al timeline (`gapStart` arriba al revers ja col·locat) -> `(zoneEnd - freezeStart) > 0.40` era fals i es descartava en silenci.

**SOLUCIO**: IMPLEMENTAT 2026-10-01 (pendent de test a Premiere) · `js/workflows/flow_chyrons.js` (ZERO JSX nou, nomes atoms existents): (1) NOVA constant `CONDUCTOR_TAIL = 15 * REV_FRAME` (0,60 s) (:31); (2) `_blockStartTime` CasB: `placeTime = condEnd - CONDUCTOR_TAIL` (:1249) -> el Tema-Titol gran avanca 15 frames i el revers/congelat el segueixen; (3) ENTRANT: `entrantOut = entrantIn + durP - REV_FRAME` (:1341) -> OUT 1 frame mes curt; (4) NOU helper `_freezeTitulilloStill(petit, track, startSec, endSec, label)` (:1396), extret de `_fillTitulilloGaps` §2 (insert a TEMP_TC=600 + `Render.snapshot` + `IO.importFiles` a CHY + insert estirat a la pista); (5) `_placeTemaTitolTransicions` CasB crida el congelat entre ENTRANT i SORTINT (:1352) si `revStart > entrantOut + 0.20`; (6) `_fillTitulilloGaps` §2 delega al mateix helper (:1573) i s'esborra `escapedPetit` (ja no s'usa) -> zero duplicacio. `index.html`: `flow_chyrons.js?v=49` -> `?v=50`. Proves: `bin/check_js_v8.ps1` -> TOTAL 96 | OK 95 | FAIL 1 (nomes `core/escaleta_trim.js`, preexistent i alie; `flow_chyrons.js` OK). PENDENT: test a Premiere (15 frames abans, OUT 1 frame mes curt, CONGELAT present).

### #129 - resolt (2026-10-01)

**SIMPTOMA**: IPD+ (toggle V2->V3): el clip que es puja a PARK (V3) i el que es re-insereix a SRC (V2) al REVERTIR neixen amb el Motion PER DEFECTE, aixi que el clip que duu la MASCARA posicionada/escalada queda DESCOL·LOCAT. Report de l'usuari (test 2026-10-01): «cuando se duplica el clip de V2 en V3, no se respetan sus propiedades de posicion y escala; eso hace que se mueva la mascara fuera de lugar». MATEIX root cause que #124 (portada).

**CAUSA ARREL**: Doble: (a) l'insert per project item no porta el Motion (limitacio de l'API de Premiere, no un bug propi); (b) el flux d'IPD+ no el transferia enlloc — l'estat desat nomes guardava name/inPoint/outPoint/start/end de SRC (:727-731).

**SOLUCIO**: IMPLEMENTAT 2026-10-01 (pendent de test a Premiere; ZERO JSX nou): js/workflows/flow_graphics.js — dos metodes d'orquestracio nous (:598-645): _ipdPlusLlegirMotion (Anim.getMotionValues -> objecte o null + WARN) i _ipdPlusHeredarMotion (Anim.setMotionValues amb NOMES les claus que s'han pogut llegir; les null s'ometen; si peta, WARN i el flux CONTINUA). Cablejat: (1) a _ipdPlusAplicar el Motion de SRC es llegeix ABANS de moure'l (:732, amb el clip original encara intacte a la pista), es desa a _ipdPlusStates['src'].motion (:738) i s'hereta al clip de PARK tot just despres del put.ok (:748); (2) a _ipdPlusRevertir s'hereta al clip restaurat a V2 (:902-905). index.html: flow_graphics.js?v=22 -> ?v=23. Validacio: bin/check_js_v8.ps1 -> TOTAL 96 | OK 95 | FAIL 1 (nomes core/escaleta_trim.js, preexistent) + TEST FUNCIONAL REAL amb el V8 del CEP (Edge headless, C:/temp/fp/fp_ipdplus_motion_test.html) que EXTREU els dos metodes del fitxer real i els executa amb un callJSX simulat -> 29/29 PASS (payload complet, claus null omeses, escape aplicat, ERR i JSON trencat sense excepcio, i comprovacio de l'ordre de les crides al codi real).

### #130 - resolt (2026-10-01)

**SIMPTOMA**: REGRESSIÓ VIVA DEL #131 (report de l'usuari al test a Premiere del 2026-10-01, panell amb flow_chyrons.js?v=53): «ha aparegut el mateix problema amb els tematítol i titulillo» i, a més, «donava la sensació que els clips hi eren i no hi eren: apareixien a vegades» (comportament INTERMITENT entre runs). O sigui: el fix del #131 (zones temporals lliures via _v6FreeTC + muntatge d'esquerra a dreta) NO ha tancat la pèrdua de clips a V6 en el run real.

**CAUSA ARREL**: PENDENT DE DIAGNÒSTIC amb log real. L'«hi eren i no hi eren» apunta a no determinisme entre execucions. Fonts candidates: (a) `_v6FreeTC` (js/workflows/flow_chyrons.js:321-349) tria la zona temporal segons el material QUE HI HA A V6 en aquell moment → dos runs amb el mateix input poden triar TC diferents (600/610/620/630 o zona morta després de l'últim clip) i, si la zona triada cau dins del PNG estirat del tema anterior, l'overwriteClip torna a esborrar material; (b) el material de V6 present a l'inici de cada fase varia segons l'ordre de les fases del run de chyrons; (c) `Clips.insert` continua sent overwriteClip: qualsevol insert dins del rang del PNG estirat esborra el que cobreix; (d) l'espai lliure calculat pot quedar-se curt si la durada real del PNG estirat no és la del manifest.

**SOLUCIO**: PENDENT. Primer pas (sense tocar codi): capturar el log sencer d'un run de chyrons amb Tema-Títol i titulillo i buscar els blocs `🧭[_v6FreeTC]` (zona temporal triada), `🧊[_freeze]` (TC de congelació) i `🗑️[_freeze]` / `🧊[Titol·Petit] CONGELAT` (esborrats), per veure si alguna inserció cau dins del rang del material existent de V6.

### #131 - resolt (2026-10-01)

**SIMPTOMA**: TITULILLO (flow_chyrons): el TEMA-TÍTOL GRAN quedava RETALLAT PEL PRINCIPI (li falta la part esquerra) després del #128. La seva posició relativa era correcta; només li faltava el cap.

**CAUSA ARREL**: DIAGNOSTICAT 2026-10-01 (lectura del codi): el CONGELAT de la transició CasB (novetat del #128, a _placeTemaTitolTransicions) és un PNG: un STILL, i el projecte li assigna la seva durada per defecte (~5 s). `Clips.insert` fa un overwriteClip de [start, start+5s) → com que el congelat és a l'ESQUERRA del gran (que ja és a la pista: es col·loca a §5 ABANS de les transicions), l'insert li ESBORRAVA la part esquerra. A més, l'`endSec` de `Clips.insert` reassigna `track.clips[numItems-1].end`, és a dir el clip MÉS A LA DRETA de la pista (el gran) → li clavava un end ANTERIOR al seu propi start. Conclusió: els inserts de Premiere NO són inofensius, esborren el material que cobreixen (mateix motiu pel qual existeix _repararClipsV7 i el comentari de _fillTitulilloGaps). AMPLIAT 2026-10-01 (report de l'usuari: «has vuelto a eliminar los clips de V6, menos el primero»): la CAUSA REAL de PERDRE CLIPS A V6 eren les ZONES TEMPORALS amb TC FIX (TEMP_TC = 600 i TEMP_PNG = 610 a _freezeTemaTitol i _freezeTitulilloStill). El Tema-Títol gran estira el seu PNG fins al final del bloc, o sigui que V6 a partir del 2n tema està OCUPADA al TC 600 → l'insert temporal de cada tema (i el del titulillo/congelat) queia damunt del PNG estirat i l'overwriteClip se l'enduia (trossos esborrats = clips perduts: només en quedava el primer). Addicionalment, els `Clips.insert(..., endSec)` de _freezeTemaTitol (animació i PNG) deixaven anar el mateix `clips[numItems-1].end` sobre el darrer clip de V6.

**SOLUCIO**: IMPLEMENTAT 2026-10-01 (pendent de test a Premiere; ZERO JSX nou) a js/workflows/flow_chyrons.js: (1) `_placeTemaTitolTransicions` passa a DUES FASES — FASE 1 calcula TOT el pla (entrant + congelat + reversos) sense tocar la timeline (nou helper `revStartFor(target)`), s'ordena pel IN i la FASE 2 l'aplica d'ESQUERRA A DRETA; així cap inserció pot trepitjar un clip ja col·locat a la dreta. (2) `_freezeTitulilloStill` ja NO inserta el PNG a la seva posició final: s'insereix en una zona temporal pròpia (`TEMP_PNG = 610`) i es duu al rang exacte amb `Clips.moveToRange` (reassigna start/end, NO fa overwriteClip — mateixa tècnica que _repararClipsV7). Fallbacks: si no es troba l'índex del PNG temporal o moveToRange falla → WARN + s'esborra el temporal. index.html: flow_chyrons.js?v=50 -> ?v=51. (3) [2026-10-01, directriu de l'usuari: «calcular les posicions, enviar a ffmpeg si cal i muntar d'esquerra a dreta»] NOVA FASE 0 a _placeTemaTitolTransicions: es decideix si cal revers, s'inverteix UNA vegada amb ffmpeg I es MESUREN les durades REALS (ffprobe via Logic.FFmpeg.getMediaDuration, alineades a la rejilla de frames amb ceil) ABANS de tocar la timeline; el pla (FASE 1) es calcula amb les durades REALS (1,00 s = 25 frames, no l'estimacio del manifest de 1,02 s = 25,5 frames) i la FASE 2 aplica d'esquerra a dreta. Mateix patro a _fillTitulilloGaps (preparacio del buit ABANS de col·locar el titulillo). Aixi l'OUT de l'ENTRANT i el IN del revers son exactes (19.00 en lloc de 18.96) i l'overwrite de cada insert no pot arribar mes enlla del pla. index.html: flow_chyrons.js?v=51 -> ?v=52. Validacio: bin/check_js_v8.ps1 -> TOTAL 96 | OK 95 | FAIL 1 (nomes core/escaleta_trim.js, preexistent, no tocat) + TEST FUNCIONAL REAL amb el V8 del CEP (Edge headless, C:/temp/fp/fp_129_titol_test.html) que EXTREU els 2 metodes REALS del fitxer i els executa contra un SIMULADOR de la semantica destructiva de Premiere (Clips.insert = overwriteClip + clips[numItems-1].end = endSec, tal com esta a jsx/modules/6_Clips.jsx) -> 49/49 PASS (6 comprovacions noves de FASE 0: la inversio i les 2 mesures ffprobe ABANS del primer insert, SORTINT exacte al gran, ordre real): pla ordenat (entrant|congelat|revers), ordre REAL de col·locacio ascendent amb durades REALS (10.40 < 11.40 < 19.00), el PNG s'inserta a TC 610 i es duu amb moveToRange, el GRAN INTACTE als 2 escenaris (20 s i 15 s), cap resta als TC temporals, inversio PEREZOSA intacta, i CONTROL DE REGRESSIO amb l'ordre antic (#128) que demostra que SI que el retallava. (4) [2026-10-01 · SEGONA VOLTA, directriu de l'usuari: «primero piensa donde va cada cosa y luego colocalo de izquierda a derecha SOLO PARA EL TRACK V6»] ZONES TEMPORALS LLIURES: nou helper `_v6FreeTC(track, needSec)` que llegeix els clips de la pista i retorna el primer TC clàssic (600/610/620/630) SENSE cap clip a sobre; si tots estan ocupats, retorna una zona morta DARRERE del darrer clip de la pista. `_freezeTemaTitol` (TEMP_TC) i `_freezeTitulilloStill` (TEMP_TC i TEMP_PNG) l'usen → l'insert temporal ja MAI pot esborrar material existent. A MÉS: tots els `Clips.insert` sobre la pista de Tema-Títol (V6) van SENSE endSec (l'endSec aplicava l'end al DARRER clip de la pista) i el final es fixa amb `Clips.endAt` (cerca pel start) → _freezeTemaTitol (animació + PNG), placeChyronTitol (slot) i _freezeTitulilloStill. Els temporals s'esborren amb `Clips.removeAt(track, tc)` (cerca pel start, no per índex) → immunitzat a renumeracions. index.html: flow_chyrons.js?v=52 -> ?v=53. Validació: bin/check_js_v8.ps1 -> TOTAL 96 | OK 95 | FAIL 1 (només core/escaleta_trim.js, preexistent) + test funcional real amb el V8 del CEP (Edge headless, C:/temp/fp/fp_129_titol_test.html) -> 58/58 PASS amb el TEST NOU 11 (regressió del report: V6 amb un PNG estirat [23.06 → 900 s] → queda INTACTE, cap comandament temporal dins del seu rang, i la zona temporal s'agafa >900 s).

### #132 - resolt (2026-10-02)

**SIMPTOMA**: EDITOR DE SUBTÍTOLS · FINESTRA MASSA AMPLA (report de l'usuari, 2026-10-01): «al editar los subtítulos, la ampliación del timeline (de subtítulos) era demasiado amplia. Habría que ceñirla a la selección In-Out una vez se haya hecho».

**CAUSA ARREL**: PENDENT DE DIAGNÒSTIC. La finestra de càrrega per blocs de 15 min es calcula a js/editor/srt_editor.js:431-453 (`winStart = worldStart`, `winEnd = worldEnd + max(handles, srtEmergencyTailSec = 120)`), i l'eix del timeline de l'editor és `_axisOrigin` → `_maxSec` (:46, :297-304, :1233, :1359-1393): tots dos creixen amb el MATERIAL carregat, no amb el rang de la peça. Cal decidir amb l'usuari si el cenyiment a In-Out s'aplica (a) a la finestra de càrrega (`winStart`/`winEnd` → OUT de la seqüència si n'hi ha), (b) a l'eix de l'editor (`_maxSec`) o (c) a l'exportació (`exportToPremiere`, :2046-2078, que avui exporta TOTES les entrades amb `endSec > 0`).

**SOLUCIO**: IMPLEMENTAT 2026-10-02 (pendent de test a Premiere; ZERO JSX: tot és JS de l'editor) a js/editor/srt_editor.js: nova FINESTRA D'EDICIÓ (`_editWinStart`/`_editWinEnd`, temps de MEDIA) + helpers `_viewOrigin()`/`_viewEnd()` (origen/final de l'eix VISIBLE) i `_setEditWindow()`/`_clearEditWindow()`. `_setEditWindow()` fixa l'eix a [primer inici − 1 s, últim final + 4 s] (marges configurables amb `srtEditMarginLeftSec`/`srtEditMarginRightSec`) i es crida des dels botons IN i OUT (:2044, :2069); `loadSrt` i `reset` l'alliberen. Consumidors de l'eix passats a la finestra: `_secToX`/`_xToSec`, `render` (amplada del canvas), `_drawRuler`, el `totalTl` de la barra de zoom inferior i la clau de caché de la waveform. L'EXPORTACIÓ NO CANVIA: `exportToPremiere` continua restant `_axisOrigin` (posició real dins el clip) → els subtítols segueixen anant al lloc correcte. index.html: srt_editor.js?v=71 → ?v=72.

**VALIDACIO**: `bin/check_js_v8.ps1`: TOTAL 95 | OK 95 | FAIL 0. TEST FUNCIONAL REAL amb el V8 del CEP (Edge headless, C:/temp/fp/fp_132_test.html, carrega el srt_editor.js REAL): 13/13 PASS → sense finestra l'eix és el clip sencer (2378→2652) i x=0 = inici del clip; després de `_setEditWindow()` amb el cas real del TNM V4 (peça 2479,4→2612,0 dins un clip 2378→2652) la finestra és [2478,40 → 2616,00], x=0 passa a ser l'inici de la peça i l'eix útil baixa de 274 s a 137,6 s; clip de 95 min amb peça de 100 s → eix útil 105 s (guany de zoom 54x); `_clearEditWindow()` torna a l'eix sencer; i l'exportació segueix convertint amb `_axisOrigin`.

### #133 - resolt (2026-10-02)

**SIMPTOMA**: CHYRONS DUPLICATS A LA TIMELINE (report d'usuari 2026-10-02, TNM V1 del 01/10): «cuando hay el mismo chyron generado varias veces, con el mismo TC, se colocan todos… han aparecido en diferentes capas, el mismo chyron». Regla demanada: col·locar NOMÉS l'últim (l'últim generat és el correcte).

**CAUSA ARREL**: `Scan.wotts` (js/logic/22_Escaneig.js:83-86) filtra per programa+bloc i NO dedueix res; `Parse.files`/`Parse.assign` (js/logic/13_Parse.js:47-52, :260-276) posen TOTES les còpies a `entry.chyrons`; `_placeChyronsByType` (js/workflows/flow_chyrons.js) només tenia dedupe per a TITOLET (`opts.dedupeTitolet`). Com que el tc del nom és IDÈNTIC entre re-generacions, l'instant ideal és el mateix → `_chooseSlot` trobava la pista preferent ocupada i col·locava la 2a/3a còpia a la següent pista lliure de la seva llista ([llocdata,lloc,chyrons] / [chyrons,lloc]) → el mateix rètol en CAPES diferents. Addicional: `_dedupeTitolet` comparava `_wottIdNum` (part 6 = wottId), IDÈNTIC entre re-generacions → podia quedar-se la versió VELLA.

**SOLUCIO**: IMPLEMENTAT 2026-10-02 (pendent de test a Premiere; ZERO JSX nou) a js/workflows/flow_chyrons.js: (1) nou `_regenSeq(name)` = número de generació (sufix `.NNNNNNN` abans de l'extensió, `…00618565.mov` → 618565; 0 si no en porta); (2) nou `_regenKey(name)` = nom sense aquest sufix, en minúscules (identitat del rètol); (3) nou `_dedupeRegenerations(list, label)` = una sola còpia per `_regenKey`, la de `_regenSeq` MÉS ALTA (l'última generada); cridat a `_placeChyronsByType` just abans del `sort`, DESPRÉS d'incorporar els rètols de connexió → cobreix Lloc/Nom/Resto/Conductor (totes les fases que passen per aquest mètode) i també els `vinguts` de connexió; (4) `_dedupeTitolet` passa a ordenar per `_regenSeq` (wottId només com a desempat). Log nou: `♻️ [<label>] N còpia(es) de re-generació descartada(es) (mateix rètol i tc): es queda la versió més nova`. index.html: flow_chyrons.js?v=53 → ?v=54. DECISIÓ D'ABAST (import vs col·locació, consultada per l'usuari): es dedueix a la COL·LOCACIÓ i no a l'escaneig perquè `pickTemaTitols`/`pickTemaTitolPetit` (js/logic/3_Project_Logic.js:1031-1120) distingeixen Tema-Títol gran/petit per DURADA i una re-generació pot canviar la durada → filtrar a l'escaneig podria eliminar la versió que el flux de Tema-Títol necessita.

**VALIDACIO**: `bin/check_js_v8.ps1`: TOTAL 96 | OK 95 | FAIL 1 en el moment del fix (l'únic FAIL era el preexistent i aliè `core/escaleta_trim.js`, ESBORRAT després el mateix dia → ara TOTAL 95 | OK 95 | FAIL 0, vegeu #115; `flow_chyrons.js` OK). TEST FUNCIONAL REAL amb el V8 del CEP (Edge headless, C:/temp/fp/fp_133_134_test.html, carrega el flow_chyrons.js REAL): 14/14 PASS amb els 9 noms REALS del NAS del 01/10 → 3 versions del Tema-Titol → 1 (la 00618565), 3 del Nomcarrec → 1 (la 00618569), 2 Llocdata amb wottId diferent → es conserven les 2 (no es fusiona el que no toca), nom sense número de generació → intacte, `_regenSeq` 618565/0, i TITOLET amb 3 re-generacions → queda la generació NOVA (618560).

### #135 - resolt (2026-10-02)

**SIMPTOMA**: IN DEL BLOC ANÒMAL (TNM V4, run del 02/10 sobre l'escaleta del 01/10): el motor va ancorar l'inici del bloc V4 a 15:06:58 (0:20 dins el clip extret) quan l'escaleta diu que la peça arrenca a 15:08:19 (ítem 36i) / 15:08:40 (ítem 36, OnAir). L'OUT sí que va quedar ancorat a l'escaleta (15:10:42) → l'extracte arrenca 80 s abans del que hauria.

**CAUSA ARREL**: HIPÒTESI (pendent de confirmar al codi): la regla del «PISO de vídeo aliè» (evitar tallar un vídeo d'un altre bloc a mitges) està MOVENT L'ÀNCORA D'ENTRADA en lloc de limitar l'OUT o el límit inferior, i l'empeny 25 min enllà (15:33:52). El guard IN/OUT ho detecta i, enlloc de recuperar el Tier0/Tier1 correcte (54501 = 15:08:21), cau a `block.in − durada(36i)` — un valor del cleanFeed amb handles que està 80 s ABANS de les hores reals de l'escaleta. Incongruència observable: IN fora de l'escaleta i OUT dins. VERIFICAT 2026-10-02 amb 80 escaletes reals (4.804 ítems únics): INTROS (…i) i DONAPAS no tenen MAI OnAir (0/287), els grafismes TE/P2/GF gairebé mai (4/378) → no s'hi pot ancorar res; el vídeo ANTERIOR sí que porta OnAir+duradaOnAir i el Tier0 ja el fa servir (35 EL CADELL: 15:06:30 + 0:01:51 = 54501.00s EXACTE) → el problema NO és el càlcul sinó que el guard descarta aquest valor. Regles documentades a docs/specs/ITEM_CLASSIFICATION.md §10.

**SOLUCIO**: IMPLEMENTAT 2026-10-02 (pendent de test a Premiere; ZERO JSX) a js/core/escaleta_bounds.js: (1) es desa el IN deduït pels TIERS (`var _tierInSec = worldBlockStartSec;`, just abans dels PISO); (2) l'`IN·FLOOR` i el `PISO de vídeo aliè` fan servir aquest valor com a REFERÈNCIA quan el bloc NO té hores pròpies (`_refFloorSec`/`refSec` = null perquè el sanejador va anul·lar la prevista de la intro) → el sostre «posterior al bloc» torna a funcionar i un ítem del bloc SEGÜENT ja no pot fer de piso; (3) el `IN/OUT-GUARD` recupera el IN dels tiers (si és < OUT) ABANS de caure a `block.in − durada(intro)`. index.html: escaleta_bounds.js?v=19 → ?v=20.

**VALIDACIO**: `bin/check_js_v8.ps1`: TOTAL 95 | OK 95 | FAIL 0. TEST FUNCIONAL REAL (Edge headless, C:/temp/fp/fp_135_test.html: carrega els 5 mòduls REALS d'escaleta i executa `calcPrecisionTrimBounds` sobre les 4 escaletes REALS del TNM del 01/10): **V4 (el cas del report) passa de `start=15:06:58 (InTier=2)` a `start=15:08:22 (InTier=10 = Tier0)`** — l'IN cau al començament de la peça (intro `36i`) i l'extracte s'escurça de 264 s a 180 s; **regressió ZERO: V1=14:33:52 (52432), V2=14:41:48 (52908) i V3=14:53:50 (53630) surten IDÈNTICS als valors guardats als manifests del 01/10**. Traça del V4 amb el fix: `🕵️ [IN·FLOOR] El bloc no té hores pròpies → referència = IN dels tiers (54501.00s)` i CAP línia `PISO vídeo aliè` (abans n'hi havia 12 en cadena fins a 15:33:52).

### #136 - resolt (2026-10-02)

**SIMPTOMA**: TRADUCCIONS DUPLICADES A LA TIMELINE (report d'usuari 2026-10-02, TNM bloc 36): «con las traducciones también hay que introducir un filtro que solo coloque la última versión de cada traducción. Se han colocado 6 traducciones cuando en realidad solo hay 3». MATEIXA causa que el #133 (el generador REGENERA el mateix rètol i deixa TOTES les versions al NAS), però al camí de col·locació de TRADUCCIÓ, que no passava pel dedupe.

**CAUSA ARREL**: `placeChyronTraduccio` (js/workflows/flow_chyrons.js:2309) és un flux PROPI (botó TRAD i fase Traducció del botó COLOCAR) que construeix la seva llista amb `entry.chyrons.filter(…TRADUCCIO…)` i NO cridava `_dedupeRegenerations` — el filtre del #133 només s'aplica a `_placeChyronsByType` (Lloc/Nom/Resto/Conductor), i les traduccions en queden excloses a propòsit (`!isTraduccio`). Com que el tc del nom és IDÈNTIC entre re-generacions, els 6 fitxers queien al mateix grup (`groups.set(tc, …)`) → N=6 → 6 slots (clipDur/6 ≈ 1,3 s) en lloc de 3 (≈ 2,6 s).

**SOLUCIO**: IMPLEMENTAT 2026-10-02 (pendent de test a Premiere; ZERO JSX nou) a js/workflows/flow_chyrons.js: el resultat del filtre passa a `traduccionsRaw` i s'aplica `const traduccions = this._dedupeRegenerations(traduccionsRaw, \"Traducció\")` (una sola crida per ítem) ABANS d'agrupar per tc i de col·locar. Surt el log ja existent `♻️ [Traducció] N còpia(es) de re-generació descartada(es) (mateix rètol i tc): es queda la versió més nova`. index.html: flow_chyrons.js?v=54 → ?v=55. NOTA: `js/workflows/flow_retols.js` (i `flux_retols.js`) tenen una còpia vella d'aquest flux amb el mateix defecte, però són codi MORT (tots els hooks de main.js hi són comentats, :695-698) → no s'hi ha tocat res.

**VALIDACIO**: `bin/check_js_v8.ps1`: TOTAL 95 | OK 95 | FAIL 0. TEST FUNCIONAL REAL amb el V8 del CEP (Edge headless, C:/temp/fp/fp_136_trad_test.html, EXTREU els mètodes REALS `_regenSeq`/`_regenKey`/`_dedupeRegenerations` del fitxer i els executa amb el log simulat): 22/22 PASS → amb els 6 noms REALS del NAS en queden 3 i les conservades són les generacions NOVES (.00618621/.00618622/.00618623); ordre invers d'entrada → mateixa tria; log `3 còpia(es) … re-generació`; i SENSE sobre-dedupe (3 traduccions distintes del mateix tc → 3; mateix text en tc diferent → 2; noms sense generació → només el duplicat exacte; .mov/.png de la mateixa generació = mateixa identitat). Comprovacions estructurals sobre el codi REAL: la crida és única per ítem i va ABANS de `const groups = new Map()` i de `Clips.insert(`; `index.html` carrega flow_chyrons.js?v=55.

### #137 - resolt (2026-10-02)

**SIMPTOMA**: MOJIBAKE ALS ACENTS de TOT fitxer llegit pel pont (`IO.readTxt`): el nom del projecte al NAS sortia `Pruebas_TNC_V1_CRANICA VACTOR SORRIBES PLUJA PERSISTENT A L'EBRE.prproj` i l'escaleta es llegia com a `CRÃ'NICA VÃ?CTOR` / `COMENÃ?A LA` (lletres inventades i bytes perduts). Mateix efecte a l'SRT, al manifest de sessió, a l'anàlisi i a l'editor de subtítols.

**CAUSA ARREL**: ASIMETRIA DEL PONT: `IO.readTxt` (jsx/modules/2_IO.jsx) LLEGEIX amb la codificació per defecte d'ExtendScript (ANSI/CP1252) mentre `IO.writeTxt` ESCRIU UTF-8. Qualsevol fitxer UTF-8 (escaletes JSON, .srt, manifests) que passi pel pont queda DOBLE-codificat, i els bytes que CP1252 no defineix (0x81/0x8D/0x8F/0x90/0x9D) es converteixen en U+FFFD: informació PERDUDA de manera irreversible des del costat ExtendScript.

**SOLUCIO**: IMPLEMENTAT 2026-10-02 (pendent de test a Premiere; ZERO JSX nou, cap mètode JSX creat) — DEFENSA EN PROFUNDITAT: (1) js/core/utils.js: `_CP1252_HIGH` (taula inversa CP1252→byte del bloc 0x80-0x9F), `_isMojibake()` i `_fromMojibake(str, where)`, que tornen cada caràcter al seu byte original i descodifiquen el resultat com a UTF-8 de debò (`TextDecoder('utf-8', {fatal:false})`); reparació CONSCIENT DE LA CAPÇALERA (darrere d'un 0xC3 el byte indefinit 0x8D ↔ Í; altrament 0x9D ↔ ”) i retorn de l'ORIGINAL si la tria dona una seqüència UTF-8 invàlida (mai empitjorar); integrat a `sanitizeName()` com a xarxa de seguretat (utils.js:811). (2) Els 6 punts `IO.readTxt` reparats: js/core/session_manifest.js:43 (`manifest`), js/editor/srt_editor.js:345 (`srt_editor`) i :547 (`srt_emergencia`), js/logic/10_Srt_Logic.js:197 (`srt_logic`), js/logic/16_Analysis_Logic.js:37 (`analisi`), js/workflows/flow_srt.js:75 (`flow_srt`). (3) js/core/escaleta_fetch.js: transport BYTE A BYTE de l'API — `child_process` de Node + curl.exe amb `stdout` llegit com a Buffer → `toString('utf8')`, i escriptura al disc pel costat JS (`window.cep.fs.writeFile`), mai pel pont JSX; el respatller ExtendScript (`FASTPASS.IO.curl`) també queda reparat. (4) js/core/escaleta_io.js:851-852: reparació en temps de càrrega, per als JSON que ja són corromputs al disc. (5) index.html cache-bust: utils.js?v=23, escaleta_io.js?v=17, escaleta_fetch.js?v=12, session_manifest.js?v=8, 10_Srt_Logic.js?v=16, 16_Analysis_Logic.js?v=7, flow_srt.js?v=9, srt_editor.js?v=73.

**VALIDACIO**: `bin/check_js_v8.ps1`: TOTAL 57 | OK 57 | FAIL 0 (exit 0). `bin/check_dead.ps1`: 0 orfes / 0 noms vells (exit 0). E2E sobre el FITXER REAL corromput (Edge headless; arnés C:/temp/fp/run_headless.ps1 + fp_mojibake_file_test.html, que carrega el utils.js REAL): TOTAL FAIL 0 (20/20, exit 0) → 90.668 caràcters; `Ã`=74 i U+FFFD=5 ABANS → `Ã`=0 i U+FFFD=0 DESPRÉS; el JSON torna a ser parsejable (escaleta.id=PRO1439, 2 clips); `titol` `CRÃ'NICA VÃ?CTOR…` → `CRÒNICA VÍCTOR SORRIBES PLUJA PERSISTENT A L'EBRE`; els 5 bytes perduts recuperats com a `Í` (…VÍCTOR, …SANT, …LIES, …NIA); nom de projecte `CRANICA VACTOR…` → `CRONICA VICTOR…`; idempotent i sense fals positiu. E2E sintètic (fp_mojibake_test.html: patró de l'API ANSI + `Ã`+byte perdut): TOTAL FAIL 0 (19/19, exit 0), amb text net, ASCII i buit intactes.

### #138 - resolt (2026-10-02)

**SIMPTOMA**: AL RESET ♻️ DELS SUBTÍTOLS ELS MARCADORS ES CONSERVEN (report d'usuari 2026-10-02: «al resetear los subtítulos, se conservan los marcadores. esto es erróneo. Los marcadores se resetean (se borran) junto con todo lo demás»). El botó restaurava la taula i esborrava els clips de subtítols de la seqüència, però els marcadors del pseudotimeline de l'editor (les marques grogues) tornaven a aparèixer tot seguit.

**CAUSA ARREL**: Doble causa encadenada. (1) `SrtEditor.resetToOriginal()` buidava `_markers`/`_originalMarkers` i desava la llista buida, però NOMÉS per al .srt que estava carregat: `_persistMarkers()` escriu a `fastpass_srt_markers_<this._srtName>.json`, i `_srtName` era el del .srt obert (típicament l'EMERGÈNCIA de 15 min: `loadEmergencySrt` carrega un temporal amb aquest nom). (2) Tot seguit `Workflow.Srt.runSrtReset()` (js/workflows/flow_srt.js) TORNA A CARREGAR un altre .srt — el DEL TEMA del bloc (`Scan.mediaAssets(ctx, detectedTheme)` → carpeta de verticalització, o `Scan.srtFallback` del dia) — i `loadSrt` → `_restoreMarkers()` restaurava les marques persistides d'AQUEST fitxer, perquè la restauració només exigeix mateix projecte (`_projectKey`) + mateix nom (`srtName`) + mateixa empremta de contingut (`srtFingerprint`). O sigui: el RESET esborrava els marcadors de memòria i, en recarregar, els tornava a llegir del disc del .srt del tema → l'usuari veia que «es conserven».

**SOLUCIO**: IMPLEMENTAT 2026-10-02 (pendent de test a Premiere; ZERO JSX nou, cap mètode JSX creat) — els marcadors s'esborren «amb la resta», també al disc: (1) js/editor/srt_editor.js: nou `_wipeMarkersFile(srtPathOrName)` que deixa BUIDES les dues còpies del fitxer de marcadors del .srt indicat (la del projecte i el respatller `C:/temp`) acceptant ruta completa o nom (extreu el nom sense carpeta ni `.srt`); `_markersFilePath(srtNameOverride)` accepta el nom com a paràmetre; `resetToOriginal()` ara acaba amb `this._wipeMarkersFile(this._srtName)` (abans `_persistMarkers()`, que deixava la llista buida però amb empremta vàlida → restaurable); `loadSrt(srtPath, opts)` accepta `{ skipMarkerRestore: true }`, que NO crida `_restoreMarkers()` i ho registra al log. (2) js/workflows/flow_srt.js (runSrtReset): `if (ed._wipeMarkersFile) ed._wipeMarkersFile(cand.path)` i `ed.loadSrt(cand.path, { skipMarkerRestore: true })` (el flux de CARREGAR i el d'emergència NO canvien: segueixen restaurant marcadors). (3) index.html: srt_editor.js?v=73 → ?v=74 i flow_srt.js?v=9 → ?v=10.

**VALIDACIO**: `bin/check_js_v8.ps1`: TOTAL 57 | OK 57 | FAIL 0 (exit 0). `bin/check_dead.ps1`: 0 orfes / 0 noms vells (exit 0). E2E amb el V8 real (Edge headless, arnès C:/temp/fp/run_headless.ps1 + fp_138_srtmarkers_test.html, que EXTREU els mètodes REALS `_markersFilePath`/`_wipeMarkersFile`/`_persistMarkers`/`_restoreMarkers`/`loadSrt` del fitxer i els executa amb `window.cep.fs` en memòria): TOTAL 22 | OK 22 | TOTAL FAIL 0 (exit 0). Cobertura: (a) CONTROL del defecte — carregar el .srt del tema restaurava les 7 marques velles del disc; (b) amb el fix, `_wipeMarkersFile` deixa el fitxer del tema i el del .srt obert buits i les restauracions donen 0 marcadors; (c) `loadSrt({skipMarkerRestore:true})` carrega les 2 entrades però NO crida `_restoreMarkers()` (contador a 0) i deixa l'editor sense marcadors, mentre que sense el flag SÍ que restaura (7) → persistència de sessió intacta; (d) el nom/ruta s'extreuen bé d'un path UNC complet; (e) comprovacions estructurals del flux (wipe ABANS de loadSrt a runSrtReset) i cache-busts v74/v10.

### #139 - resolt (2026-10-05)

**SIMPTOMA**: ELS MARCADORS DELS IPDs SURTIEN VERMELLS (report d'usuari 2026-10-05, bloc DONAPAS + DIRECTE): «Los marcadores de los IPDs aparecen en rojo. Eso es correcto si tenemos en cuenta que no son parte del bloque (V1) pero sí lo son porque tapan el directe». El roig no és estètic: és el color dels ítems NO agrupats i té DOS consumidors funcionals que tractaven l'IPD com a material aliè al bloc.

**CAUSA ARREL**: INCONSISTÈNCIA INTERNA DE LA CONVENCIÓ DE COLORS (no una funcionalitat absent): docs/specs/MARKER_COLORS.md reserva el color 1 als ítems no verticalitzables i deixava el 7 (turquesa) com a «sense ús assignat», però el codi ja feia servir el 7 com a color d'IPD — només des d'un únic lloc. Com que _getColorIdx només mirava grafisme/agrupacio/durada, l'IPD no agrupat (interrupció publicitària emesa DINS el bloc) era indistinguible d'un ítem de fora del bloc. SEGON NIVELL, detectat pel test a Premiere (2026-10-05): la decisió de color NO estava centralitzada de debò — F1·OnAir i placeUngroupedMarkers fixaven el color 1 A MÀ (3 punts), o sigui que l'IPD dels ítems no agrupats sortia vermell per construcció, i la fase que ho feia és l'ÚLTIMA del pipeline (upsert per prefix → sobreescrivia qualsevol color calculat abans). docs/specs/MARKER_COLORS.md afirmava que totes les fases passaven per _getColorIdx: la documentació descrivia un invariant que el codi no complia.

**SOLUCIO**: IMPLEMENTAT 2026-10-05 (pendent de test a Premiere; ZERO JSX nou, cap mètode JSX creat) — UNA SOLA FONT DE VERITAT: (1) js/workflows/flow_markers.js: nova funció de MÒDUL `isIpdLine(line)` (/IPD/i sobre `num + ' ' + titol`, mateix criteri que ja feia servir F5) i `_getColorIdx` la consulta EL PRIMER → 7 (TURQUESA) per a qualsevol ítem IPD, en totes les fases de cop. És funció de mòdul (no mètode amb `this`) perquè la regla no ha de dependre del receptor: _getColorIdx rep crides de 12 punts. (2) F5·Inferits: el ternari local `isIpd ? 7 : _getColorIdx(line)` queda reduït a `_getColorIdx(line)` (el flag isIpd es conserva només per etiquetar el log). (3) Cap altre canvi de lògica: el filtre de vermells i F6 només miren el color 1, així que els IPD turquesa ja no es descarten ni s'exclouen → es comporten com a part del bloc. (4) index.html: flow_markers.js?v=63 → ?v=64. (5) docs/specs/MARKER_COLORS.md: fila 7 documentada (IPD dins el bloc), fila 1 restringida a «que NO son IPD» i notes noves (els 2 consumidors del roig i els colors lliures). — FIX 2 (2026-10-05, post-test: continuaven vermells): (6) ELS 3 PUNTS QUE FIXAVEN EL COLOR A MÀ ara passen per _getColorIdx: F1·OnAir (`colorIdx: _ugColor` i `ugColor` pels no agrupats) i placeUngroupedMarkers (`var ugColor = this._getColorIdx(ug)` → `colorIdx: ugColor` + `name: 'color=' + ugColor`). Cap placement pot portar ja un colorIdx literal. (7) index.html: flow_markers.js?v=64 → ?v=65. (8) MARKER_COLORS.md: afegit l'INVARIANT explícit («cap fase no ha de fixar un colorIdx literal») i `_isIpdLine` → `isIpdLine` (residu de nom al doc). Cap canvi de lògica de posicions: només el color.

**VALIDACIO**: `bin/check_js_v8.ps1`: TOTAL 57 | OK 57 | FAIL 0 (exit 0). `bin/check_dead.ps1`: 0 orfes / 0 noms vells (exit 0). E2E amb el V8 real (Edge headless; arnès C:/temp/fp/run_headless.ps1 + fp_139_ipdcolor_test.html, que CARREGA el flow_markers.js REAL i executa _getColorIdx): RESUM TOTAL 27 | OK 27 | TOTAL FAIL 0 (exit 0). Cas de l'usuari: `{num:'35', titol:'IPD HOSPITAL TAULI', agrupacio:null, durada:'0:14'}` → 7 (abans 1); '35 IPD' / '04IPD' / 'IPD_ALBARES_RNE' / '01 IPD' amb durada 0 → 7. Regressions verificades: no agrupat SENSE IPD → 1 (VERMELL intacte), 'LIN DIRECTE PUERTA DEL SOL' → 1 (el directe en si no és IPD), '01 DONAPAS' i '02dp' agrupats → 6, '03 GF-3' → 4 (BUG #125 intacte), durada 0 → 4, `_getColorIdx({})` → 4 sense excepció, i comprovacions estructurals (regla única, cap this._isIpdLine, filtre de vermells i ungroupedSet intactes, cache-bust). El test va caçar un artefacte propi (this._isIpdLine petava amb el receptor perdut) → per això la regla és funció de mòdul. — VALIDACIÓ 2 (2026-10-05, post-test: el harness passa a executar les FASES REALS, no només _getColorIdx, perquè aquest era el forat que va deixar passar el bug): amb un context simulat (AssemblyContext.loadAssemblyContext → lines/ungroupedItems reals; _calcTemporalAnchors ancorat) s'executen placeUngroupedMarkers i placeOnAirMarkers de debò i s'inspecciona el JSON enviat a Markers.placeByPrefixes. RESUM TOTAL 39 | OK 39 | TOTAL FAIL 0 (exit 0): IPD 35 (OnAir) i 36 (només prevista) → colorIdx 7 i `name: 'color=7'`; el DIRECTE 12 → 1 (VERMELL intacte); cap placement d'IPD amb color 1. Contra-prova d'efectivitat: el mateix harness carregant una còpia amb `colorIdx: ugColor`/_ugColor revertits a 1 → 4 FAIL (exit 1), o sigui que el test SÍ detecta el defecte. `bin/check_js_v8.ps1` 57/57 i `bin/check_dead.ps1` 0 orfes (exit 0) després del fix 2. NOTA de mètode: el primer harness era massa fi (només provava _getColorIdx); provar la FASE sencera hauria cazat el bug al primer intent.

### #140 - resolt (2026-10-05)

**SIMPTOMA**: ELS MARCADORS DELS IPD (i dels ítems no agrupats) NO REBIEN L'AJUST AL CORTE MÉS PROPER (observació d'usuari 2026-10-05, després del fix del #139): «Puede ser que a estos markers no se les esté aplicando el ajuste de corte más cercano?». Es veien els marcadors turquesa/vermells del bloc DONAPAS+DIRECTE a la posició IDEAL de l'escaleta (OnAir/prevista crua), no clavats al tall editable.

**CAUSA ARREL**: ASIMETRIA ENTRE FASES: la doctrina del projecte («l'OnAir marca la ZONA, el CORTE la CONCRETA», CAPA1 flow_markers.js:1944-1958) s'aplicava a F4 i a CAPA1, però la fase que corre DESPRÉS de totes (placeUngroupedMarkers, afegida al pipeline amb el BUG #110) es va escriure com un simple upsert de posició ideal + color. Com que placeByPrefixes és un upsert PER PREFIX, no una escriptura nova: (a) movia el marcador a la posició crua (perdent el tall), i (b) per al cas del #139 li repintava el color. Els mateixos marcadors, amb la posició que F4 havia calculat, desapareixien del tall editable en l'últim pas.

**SOLUCIO**: IMPLEMENTAT 2026-10-05 (pendent de test a Premiere; ZERO JSX nou, cap mètode JSX creat, cap fitxer JSX tocat) — (1) js/workflows/flow_markers.js: nou mètode `_imantAlCorte(pos, clips, hasOnAir, label)` que encapsula el MATEIX criteri que F4·Faro: si el marcador ja és a un tall (±0,15 s, `_isOnCut`) no es mou (idempotent); si no, s'aplica `_chooseSnapTarget` amb les ruptures de densitat del bloc (`_calcDensityFootprint(clips).breaks`, dins un try/catch perquè una densitat que peti no tombi la fase) i la finestra que toca: `_snapWindowFaro()` si l'ítem té OnAir, `_snapWindowDeduced()` si només té prevista. (2) placeUngroupedMarkers: `pos = this._imantAlCorte(pos, clips, tcOnAir, 'Ungrouped ' + ug.num)` just després del guard de posició negativa, amb log 🧲 per marcador (posició ideal → tall + motiu + finestra). (3) index.html: flow_markers.js?v=65 → ?v=66. Cap canvi de color, d'ordre ni de filtres: el filtre de vermells i F6 (ungroupedSet) queden intactes.

**VALIDACIO**: `bin/check_js_v8.ps1`: TOTAL 57 | OK 57 | FAIL 0 (exit 0). `bin/check_dead.ps1`: 0 orfes / 0 noms vells (exit 0). E2E amb el V8 real (Edge headless; arnès C:/temp/fp/run_headless.ps1 + fp_140_ipdsnap_test.html, que CARREGA el flow_markers.js REAL i executa els mètodes REALS): RESUM TOTAL 35 | OK 35 | TOTAL FAIL 0 (exit 0). Cobreix: 12 assercions de `_imantAlCorte` (faro 400→400,6 tall d'obertura; deduït 480→478,2 amb finestra llarga; el mateix 480 amb finestra de faro NO es mou → la finestra depèn de l'OnAir; idempotència 400,6 i tolerància 400,62; sense clips/undefined/clips buits; prioritat de la ruptura de densitat 480→478,9 igual que F4; densitat que peta → segueix el snap genèric), 9 comprovacions estructurals del codi font (mètode únic, ús de _chooseSnapTarget i de les 2 finestres, crida des de placeUngroupedMarkers, filtre de vermells i ungroupedSet intactes, invariants del pipeline «Vermells és l'última fase», cache-bust v66 present i v65 absent) i 10 E2E de la fase real amb context simulat (IPD 35 OnAir → 400,6 turquesa; IPD 36 que ja era a un tall → no es mou; IPD 37 fora de material → es manté la ideal 1300; DIRECTE 12 → 110,6 vermell). CONTRA-PROVA al mateix arnès: amb `_imantAlCorte` neutralitzat en calent, l'IPD 35 torna a 400 i el 12 a 110 → el test detecta de debò el defecte (no passa per casualitat).

### #141 - resolt (2026-10-05)

**SIMPTOMA**: 📷 FOTO: «No s'ha pogut desar» tot i que l'API SÍ que tenia l'escaleta (TNC V1 2026-10-05, 14:03:55). El botó FOTO ha de funcionar SEMPRE, fins i tot ABANS de cap execució NOU del dia.

**CAUSA ARREL**: `ER._writeEscaleta` (js/core/escaleta_fetch.js) compon la ruta amb `Utils.workFolder(ctx)` i crida `window.cep.fs.writeFile` directament. `Utils.workFolder()` NOMÉS COMPONA la ruta (js/core/utils.js); qui crea l'arbre és `Utils.ensureFolders()`. La via FOTO (botó 📷 i l'auto-foto `_photoEscaleta`) no cridava `ensureFolders` enlloc — només el flux NOU ho feia. Amb la carpeta destí inexistent, `cep.fs.writeFile` retorna `err=3` (ERR_NOT_FOUND) → la foto es perdia, i sense Node no hi havia pla B. No era cap problema de l'API ni del NAS.

**SOLUCIO**: IMPLEMENTAT 2026-10-05 (pendent de test a Premiere; ZERO JSX nou, cap mètode JSX creat) — js/core/escaleta_fetch.js, `ER._writeEscaleta`: guarda de carpeta desconeguda/buida + `window.FASTPASS_UI.Utils.ensureFolders(folderPath)` (dins try/catch amb log ⚠️ si peta) ABANS de compondre la ruta i escriure-hi. Cobreix els DOS invocadors del mètode (botó 📷 FOTO i l'auto-foto del NOU `_photoEscaleta`). Compliment de la regla UNC Path Safety del projecte: assegurar l'arbre de directoris des de JS abans d'escriure al NAS.

**VALIDACIO**: `bin/check_js_v8.ps1`: TOTAL 57 | OK 57 | FAIL 0. Test a Premiere PENDENT: dia nou (carpeta del bloc encara sense crear) → prémer 📷 FOTO ABANS de cap NOU → s'ha de crear `...\<YYYY_MM_DD>\<V*>\` i escriure-hi `escaleta_on_demand_*.json` sense cap `err=3`.

**NOTA**: Conclusió corregida: la fallada de la FOTO de les 14:03 NO era externa (l'API ja tenia l'escaleta: `escaletaId resolt: PRO1439`); amb aquest fix hauria funcionat. El que SÍ que era extern és el NOU de les 14:03: el snapshot V1 es va publicar al NAS a les 14:10:42 (finestra històrica V1 14:10-14:11) → cal reintentar el NOU després de les 14:11. El treball del dia no es va veure afectat: el NOU de les 14:18 va anar amb la còpia del NAS i va acabar en MP4 a les 14:47:23. PENDENTS NO BLOQUEJANTS del mateix log: (a) `❌ API: resposta sense escaleta/cleanFeed` a la 2a crida d'una URL IDÈNTICA (costat API; la FOTO ja reintenta amb `FOTO_TIMEOUT_MS = 180000`); (b) `[FS] Llistat parcial` amb recompte discordant (JSX=156 vs CEP=162).

### #142 - resolt (2026-10-06)

**SIMPTOMA**: CAP PNG I RES COL·LOCAT a la cadena de chyrons (report d'usuari 2026-10-06). Tots els congelats (Tema-Títol, titulillo, TITOLET, mapa, Portada) depenien de `Render.frame` (= `seq.exportFrame`), que NO existeix al DOM de Premiere → sense PNG, sense importació al bin CHY i sense res a la timeline.

**CAUSA ARREL**: El 2026-10-05 es va donar per morta la via QE `Render.snapshot` creient que no existia i es va passar tot a `Render.frame`. La deducció era FALSA: `$.global.Render.snapshot` (jsx/main.jsx:669) → `FASTPASS.Render.exportFrameQE` (jsx/modules/9_Render.jsx:57) → `qeSeq.exportFramePNG(tc, fsName)` és exactament el mètode que funcionava (commit 6d6cb54, 2026-07-10 «fix:freeze-funciona-importa-CHY-estira-final»). `Render.frame`, en canvi, crida `seq.exportFrame(t, path)` (9_Render.jsx:107), que NO és cap funció del Sequence del DOM de Premiere.

**SOLUCIO**: IMPLEMENTAT 2026-10-06 (ZERO JSX nou, cap mètode JSX creat) — ordre de vies invertit a TOTS els punts de captura: (1) js/workflows/flow_chyrons.js `_capturePng` (serveix Tema-Títol, titulillos, cadena TITOLET i mapa): primer `Render.snapshot(base, tc)` (QE, ruta SENSE extensió) i només si el PNG no apareix, `Render.frame(path, tc)`; es comprova el fitxer amb les dues variants de nom (amb i sense `.png`) i el log diu la via emprada (`via QE | API`). (2) js/workflows/flow_render.js (Portada): mateixa inversió. (3) Els dos alias locals `const callJSX` passen a `(s, o)` i les captures criden amb `{ rawError: true }` → el `ERR:` real ja NO es converteix en `[]` (aquest emmascarament va ser el que va retardar el diagnòstic). (4) index.html: flow_chyrons.js?v=58→59 i flow_render.js?v=25→26.

**VALIDACIO**: `bin/check_js_v8.ps1`: TOTAL 57 | OK 57 | FAIL 0 · `bin/check_dead.ps1`: exit 0 (cap fitxer mort). VALIDAT per l'usuari a Premiere (2026-10-06): la cadena TITOLET ja captura el PNG i col·loca les targetes — `📸 [_capture] PNG a …Snapshots/freeze_*.png (… KB, via QE, OK_EXEC)`, carpeta `Snapshots/` poblada i `🎯 Cadena TITOLET → V8 [a→b] · N targetes · congelat Xs`; cap `seq.exportFrame is not a function`.

**NOTA**: El `Render.frame` que quedava a js/logic/9_Render_Logic.js:29 (`FASTPASS_UI.Logic.Render.capture`) ha quedat ESBORRAT el 2026-10-06 (mòdul orfe, 0 cridadors). Lliçó: usar `{ rawError: true }` a QUALSEVOL captura nova — el `[]` per defecte amaga la causa real.

### #143 - tancat (2026-10-06)

**SIMPTOMA**: TITOLET: la targeta col·locada a la timeline durava 5 frames MÉS que el rètol cremat a l'aire (petició d'usuari 2026-10-06).

**CAUSA ARREL**: La cadena prenia com a durada de la part viva la durada del MÈDIA del wott i, al cas detectat, `detEnd` sense cap descompte: totes dues 5 frames llargues respecte del que es veu a l'aire.

**SOLUCIO**: IMPLEMENTAT 2026-10-06 — js/workflows/flow_chyrons.js `_placeTitoletChain`: nou `TRIM = REV_FRAME * cfg.titolet.cardTrimFrames`. Els frames es retallen del FINAL de la durada TOTAL i de la part VIVA (`liveWant = max(0,5, cardDur − TRIM)`; al cas detectat `want = max(liveWant, detEnd − tStart − TRIM)`), de manera que el congelat entra aquests 5 frames ABANS i la seva LLARGADA no canvia → l'enllaç vídeo viu → congelat queda SENSE buit. Aplica a les branques detectada i encadenada, i el log del pla mostra la traça («viu Xs = clip Ys − 5 frames»). js/core/11_Configuracio.js: `TITOLET_DEFAULTS.cardTrimFrames = 5` (0 = comportament antic). index.html: flow_chyrons ?v=63 · 11_Configuracio ?v=25.

**VALIDACIO**: `bin/check_js_v8.ps1`: TOTAL 57 | OK 57 | FAIL 0 · `bin/check_dead.ps1`: exit 0 (0 orfes). ✅ VALIDAT per l'usuari a Premiere (2026-10-07): la targeta del TITOLET ja s'acaba al final real del retol cremat (sense 5 frames de mes) i el congelat entra sense buit a l'enllac viu→congelat.

### #144 - tancat (2026-10-07)

**SIMPTOMA**: TEMA-TÍTOL · SORTIDA/transicions: el titulillo es tancava invertint el wott petit amb ffmpeg (`_REV.mov`). El Wott del Tema-Títol JA porta la seva pròpia animació de DESAPARICIÓ al final (~10:00→10:10) → el revers és redundant. A més, l'import del revers fallava en silenci (`Project.bin is not a function`) i el ffprobe no mesurava la seva durada (ruta amb accents corrompuda) → sortida poc fiable.

**CAUSA ARREL**: La SORTINT s'obtenia per inversió ffmpeg del wott petit: calia generar `_REV.mov`, IMPORTAR-lo al bin CHY i mesurar-ne la durada amb ffprobe. Tot el camí era fràgil: (a) l'import del revers el feia `_importResult` amb `Project.bin(...)` SENSE el prefix `FASTPASS.` → `ERR:Project.bin is not a function`, el bin no es creava i l'import anava al bin arrel, tot i reportar èxit; (b) `getMediaDuration` (ffprobe) no mesurava el revers ni el wott (rutes amb accents) → durada per estimació. I tot plegat era INNECESSARI: el Wott del Tema-Títol ja conté la desaparició final (10:00→10:10).

**SOLUCIO**: IMPLEMENTAT 2026-10-07 (ZERO JSX nou). (1) js/core/11_Configuracio.js: bloc `TEMATTOL_EXIT_DEFAULTS` + `get().temaTitolExit` → `{enabled:true, atSec:10.0, durSec:0.40, useReverseFallback:true}`. (2) js/workflows/flow_chyrons.js: nous `_temaTitolExitCfg()` i `_insertTemaTitolExit(name,track,start,end,atSec)` — retall NO destructiu del PROPI ítem (`Clips.insertWithBounds` en un TC lliure llunyà + `Clips.moveToRange` al rang exacte, mateixa tècnica que el congelat). (3) `placeChyronTitol` guarda el `name` del gran a `ttPlaced`; `_placeTemaTitolTransicions` i `_fillTitulilloGaps` planifiquen la SORTINT com a peça de desaparició [target−0,40, target] i l'apliquen amb `_insertTemaTitolExit`; el revers ffmpeg (`_ensureReversedTitolPetit`) queda només com a xarxa de seguretat si la peça no es pot col·locar. (4) js/logic/15_FFmpeg_Logic.js `_importResult`: `Project.bin` → `FASTPASS.Project.bin` + `{rawError:true}` i log si falla. (5) index.html: flow_chyrons ?v=63→65, 11_Configuracio ?v=25→26, 15_FFmpeg_Logic ?v=11→12. (6) FINAL 2026-10-07 — SORTIDA de 6 frames i insert NO destructiu: `TEMATTOL_EXIT_DEFAULTS.durSec` 0,40→0,24 (10:00→10:06 = 6 frames @25fps; fallback de `_temaTitolExitCfg` idem); `_insertTemaTitolExit` REESCRIT sense `insertWithBounds` → `Clips.insert` (mèdia sencer en un TC lliure llunyà; guarda anti-fantasma PER NOM del `projectItem`, mai esborra àudio de programa) + `Clips.trimBounds` (fixa inPoint/outPoint) + `Clips.moveToRange` (reassigna start/end, NO sobreescriu) + log de verificació post-`moveToRange`; l'ENTRANT del titulillo s'escurça 1 frame a les DUES rutes (CasB: `entrantOut = entrantIn + petitDur − REV_FRAME`; gap: `entrantOut = gapStart + petitDur − FRAME`) perquè el congelat absorbeixi el frame.

**VALIDACIO**: `bin/check_js_v8.ps1`: TOTAL 57 | OK 57 | FAIL 0 · `bin/check_dead.ps1`: exit 0 (0 orfes) · harness headless `C:\temp\fp\fp_sortida_test.html` (Edge --headless=new, stubs de FASTPASS_UI/Clips): **RESULTAT: OK** (11/11 passos, `errors consola: 0`) — defaults/override de config, `insertWithBounds` al TC 600, `moveToRange` a [4,40, 4,80], el gran INTACTE a [4,80, 12,80], i camí de fallada → false. PENDENT el test a Premiere (cal RECARREGAR el panell per als cache-bust v64/v26/v12). (2026-10-07) EXIT ROBUST: la peca de sortida NO es trobava ([Titol Sortida] peca temporal no trobada a 600.00s, log real 10:25:29) perque es localitzava pel TC exacte (tolerancia 0.5s) i a Premiere la peca temporal NO sempre queda EXACTAMENT a TEMP -> l'exit mai s'aplicava I removeAt(TEMP) tampoc trobava la peca -> clip ORFE a V6 (596,64->597,04). FIX: _insertTemaTitolExit fa snapshot previ de V6, localitza la peca per DIFERENCIA (clip NOU dins TEMP +/-5s), escombra qualsevol clip nou a la finestra temporal (evita orfes), aboca el mapa V6 al log si falla i usa la posicio REAL (tempStart) al removeAt de la branca moveToRange. FINAL 2026-10-07 — ✅ VALIDAT per l'usuari a Premiere: la SORTIDA ocupa 6 frames (mèdia 10:00→10:06), l'àudio de programa d'A1 queda INTACTE (no esborrat), sense orfes a V6, i l'entrant del titulillo ja no queda 1 frame curt.

**NOTA**: OPEN (no tocat aquí): el desajust clip↔manifest del run 07/10 — `[ANCORATGE·FIX-D] clipInPoint=43.960s vs manifest tlBlockInPointSec=20.000s (Δ=23,96s)` → `anchorEfTL=-23.96s` → el marcador deduït 09 col·lapsava a 0:00 i `08lead` queia `fora del clip (-23.96s)` i se saltava. Causa: el clip importat tenia inPoint 10,00s (no 20) i el Ripple-IN manual de 33,96s el va deixar a 43,96s mentre manifest/bounds deien 20,00. No és cap OnAir mentider: el bloc NO porta OnAir (`nums amb OnAir: 0 · sense OnAir (deduïts): 3`) i l'IN va sortir de Tier0-IN cross-agrupació.

### #145 - tancat (2026-10-07)

**SIMPTOMA**: AUDIO FANTASMA a `Clips.insert` (l'àudio enllaçat d'un ítem amb so cau en una PISTA NOVA) + A1 truncat a 9,76 s pel TRIM-TAILS + Wott orfe a V6 596,64→597,04.

**CAUSA ARREL**: (a) FANTASMA: `6_Clips.jsx::insert` feia `overwriteClip` i la vella neteja (L355-371) només mirava A1 amb `remove(true,true)` (RIPPLE) → no trobava l'àudio enllaçat (que cau en una pista NOVA) i, si el trobava, desincronitzava. (b) A1=9,76: `TRIM-TAILS` (`3_Project_Logic.js`) cridava `rippleAllOut(clipEnd = Clips.get(1,0).end, TOTES les pistes)`; amb el programa ja tallat en escenes V1[0] acaba a 9,76 s i `rippleOut` RETALLA tot clip que creua el target → el clip d'A1 (0→122,88) quedava 0→9,76. (c) ORFE: `Clips.removeAt` usa `remove(true,true)` (ripple) amb tolerància 0,05 s → si el TC de col·locació deriva o queda una resta de 0,4 s, l'esborrat falla.

**SOLUCIO**: IMPLEMENTAT 2026-10-07 (ZERO JSX nou). (1) `jsx/modules/6_Clips.jsx::insert` → paràmetre `keepAudio` (def. false) + sweep de TOTES les pistes d'àudio amb `remove(false,false)` (LIFT, sense ripple) de clips que iniciïn a ±0,1 s de tStart; firma `insert(itemName, trackIdx, startSec, endSec, type, keepAudio)`. (2) `jsx/main.jsx` (~L472) propaga el paràmetre `ka`. (3) `js/logic/3_Project_Logic.js` via fallback passa `keepAudio=true` (el seu bloc MP4 porta so de programa). (4) `3_Project_Logic.js::TRIM-TAILS` → `clipEnd` = MÀXIM `end` de tots els clips de V1 (abans `Clips.get(1,0)` = primer clip).

**FITXERS**: `jsx/modules/6_Clips.jsx`, `jsx/main.jsx`, `js/logic/3_Project_Logic.js`

**VALIDACIO**: `bin/check_js_v8.ps1`: 57 OK | 0 FAIL · `bin/check_dead.ps1`: 0 orfes · En viu: `GUARDED[V6 800] AUDIO@800=CAP` (sense fantasma) i `KEEPAUDIO[V6 900] AUDIO@900=A6` (so preservat). ✅ VALIDAT per l'usuari a Premiere (2026-10-07): A1 ja NO queda a 9,76 s (àudio de programa intacte) i no apareix cap clip d'àudio fantasma.

**NOTA**: PENDENT D'INVESTIGAR (causes separades): Wott orfe a V6 596,64→597,04 i chyron gran col·locat a 5,40 en lloc de 4,80.

### #146 - resolt (2026-10-08)

**SIMPTOMA**: Botó 🎨 MAPA (2 parts, report d'usuari 2026-10-08): (1) el grafisme es col·locava al TC del MARCADOR de l'ítem i no al CABEZAL — amb el cabezal a 38,84 s el grafisme apareixia a 27,84 s i quedava retallat a l'espai del clip d'aquell marcador (3,24 s); (2) el clip col·locat NO es podia estirar («no es pot estirar més enllà de la inserció feta»).

**CAUSA ARREL**: (1) PUNT D'ENTRADA: js/workflows/flow_mapa.js::_flow feia `mkRef = _itemAtCti(CTI)` i `refSec = mkRef.time` (feature GRAFISMES_PER_MARCADOR, 2026-09-23): el TC del marcador ANTERIOR al cabezal passava a ser el PUNT D'ENTRADA del grafisme i el clip de V1 d'aquell TC, l'espai hàbil — encara que el cabezal estigués 11 s més endavant, dins d'un altre clip. (2) NO ESTIRABLE: el retall a l'espai hàbil es feia amb `Clips.endAt`, que només mou `clip.end` → el final del TIMELINE quedava curt però l'outPoint del SOURCE restava al final del mèdia → Premiere considerava el material esgotat i no deixava allargar el clip.

**SOLUCIO**: IMPLEMENTAT 2026-10-08 (zero JSX nou). `_flow`: `ref = _resolveRefClip(CTI)` (1r el clip SELECCIONAT a la pista MP4, 2n el clip de V1 que conté el cabezal, 3r qualsevol altra selecció de vídeo) i `refSec = CTI`, amb guarda: si el cabezal cau FORA del clip de referència (forat o clip seleccionat en una altra posició) s'ancora a l'IN del clip. El MARCADOR només s'usa per triar l'ÍTEM d'escaleta (`_itemAtCti(refSec)`) per a la coincidència de nom. `_placeClips` segueix retallant a l'espai hàbil (final del clip de referència) i hi afegeix el congelat de 3 s si hi cap. (2) RETALL ESTIRABLE: el retall passa de `Clips.endAt` a `Clips.trimBounds(t, inPoint, inPoint+(endLimit−t), TRACK_GRAF, 'video')` (àtom existent, mateix patró que flow_chyrons.js:2277) + nou helper JS `_clipBoundsAt(track, idx)` que llegeix in/out del clip inserit via `Clips.get` (així es preserva l'entrada del source si el ProjectItem porta marques al bin). El congelat de `_freezeGrafEnd` també feia servir `Clips.insert(..., endSec)` + `Clips.endAt` → ara `Clips.trimBounds(grafEnd, 0, dur, …)`. index.html: tooltip del 🎨 + `flow_mapa.js?v=21→23`.

**FITXERS**: `js/workflows/flow_mapa.js`, `index.html`

**VALIDACIO**: bin/check_js_v8.ps1: TOTAL 57 | OK 57 | FAIL 0 (08/10) · bin/check_dead.ps1: 0 orfes. COMPROVAT EN VIU per CDP (port 8907, cdp_eval.ps1 a C:/temp/fp) sobre un clip temporal a V3@900 s: A) acabat d'inserir → end=950.6 dur=50.6 outPoint=50.6 (coherent); B) `Clips.endAt(3,900,902)` → end=902 dur=2 però outPoint=50.6 (INCOHERENT = no estirable); C) `Clips.trimBounds(900,0,2,3,'video')` → end=902 dur=2 outPoint=2 (coherent = estirable). El clip de l'usuari ja col·locat es va REPARAR en viu amb `Clips.trimBounds(38.84, 0, 11.28, 3, 'video')` (outPoint 50.6 → 11.28). PENDENT DE VALIDAR per l'usuari a Premiere (cal RECARREGAR el panell pel cache-bust v23). ✅ VALIDAT per l'usuari a Premiere (2026-10-08) amb el panell recarregat (v23): (1) el grafisme s'ancora al CABEZAL i (2) el clip col·locat JA s'estira.

### #147 - resolt (2026-10-08)

**SIMPTOMA**: El CONGELAT (freeze) d'un rètol portava la imatge del PROGRAMA (V1) en lloc del grafisme: PNG de 524 KB en comptes de ~35 KB (TNM V3, passada real del 2026-10-08)

**CAUSA ARREL**: Per capturar el frame, `_freezeTemaTitol` (js/workflows/flow_chyrons.js) insereix el wott en una zona temporal LLIURE (`TEMP_TC`) i captura allà. Aquell `Clips.insert` podia FALLAR i tornar «ERR: …» i el codi continuava igualment, com si el clip hi fos. Dues peces: (1) el nom del wott del cas real portava un `%` literal («…Crèdits al 0% d'int…») i el JSX fa `decodeURIComponent(itemName)` (jsx/modules/6_Clips.jsx) → «Bad or invalid URI» → inserció fallida i IGNORADA; (2) sense clip temporal, el TC de captura `TEMP_TC + (tmpDur − REV_FRAME)` queia damunt del PROGRAMA (V1) → el PNG sortia amb el vídeo de V1 (524 KB) i l'esborrat posterior del temporal peta («ERR_CLIP_NOT_FOUND_AT_119.12»).

**SOLUCIO**: IMPLEMENTAT 2026-10-08 (zero JSX nou). (1) `js/core/utils.js` → helper nou `jsxName()`: escapa el `%` literal → `%25` abans de creuar el pont (l'ExtendScript fa `decodeURIComponent`); usat a `_freezeTemaTitol` i a la col·locació del rètol (`escapedWott` / `escapedName`). (2) `_freezeTemaTitol`: guarda `isErrRes` sobre cada `Clips.insert` (abans es cridava a cegues); la inserció temporal es REINTENTA 3× i es VERIFICA amb `getClipsLogic().getTrackClips()` (cal un clip dins de ±0,5 s de `TEMP_TC` → `tmpClip`); SENSE clip temporal verificat NO es captura res → es col·loca només el clip viu (sense congelat) en lloc d'un congelat FALS amb imatge del programa; `tmpDur` es deriva del final REAL del clip verificat (`tmpClip.end`, limitat a `CUT_OFFSET`); la inserció final d'animació també comprova `ERR` (retorna `{success:false}`). (3) `index.html`: `utils.js?v=24→25`, `flow_chyrons.js?v=68→69`.

**FITXERS**: `js/core/utils.js`, `js/workflows/flow_chyrons.js`, `index.html`

**VALIDACIO**: Test headless amb el motor V8 del CEP (C:/temp/fp/test_dedupe.html, que fa fetch dels fitxers REALS del repo i n'extreu les funcions): 9/9 OK — `jsxName`: `0%` → `0%25` i `decodeURIComponent` torna el nom original byte a byte; noms sense `%` intactes. `bin/check_js_v8.ps1` 57 OK / 0 FAIL · `bin/check_dead.ps1` 0 orfes.

### #148 - resolt (2026-10-08)

**SIMPTOMA**: La MATEIXA firma col·locada DUES vegades en dues capes diferents (V7 i V8) al mateix tc (TNM V3, passada real del 2026-10-08)

**CAUSA ARREL**: `_regenKey`/`_regenSeq` només detecten re-generacions del MATEIX wottId (part 6 del nom) → no fusionaven les dues variants. El motor provava de col·locar-les TOTES DUES i, en trobar la pista ocupada, la segona anava a una ALTRA capa (V7 ↔ V8).

**SOLUCIO**: IMPLEMENTAT 2026-10-08 (zero JSX nou). `js/workflows/flow_chyrons.js`: nous `_sameChyronKey` (identitat d'un rètol per a la SEVA posició: `_regenKey` + fora el wottId + `_burnedGrafNorm` → ignora generació, wottId, accents, caixa i separadors) i `_dedupeSameChyron` (deixa NOMÉS un rètol per POSICIÓ: ítem + tc + text + rol; mana la versió més NOVA — generació i, si empaten, wottId més alt). Cablejat al bucle COMÚ de fases (Conduct/Titol/Lloc/Nom/Resto) just després de `_dedupeRegenerations`, així val per a totes les fases. La família de GRAFISME CREMAT (TITOLET, PREGUNTA, DADA…) es SALTA (el `tc` del seu nom no és la seva posició real: la CADENA en col·loca còpies al seu instant detectat) i els noms buits o no parsejables NO es dedueixen (mai fusionar el que no s'entén). `index.html`: `flow_chyrons.js?v=68→69`.

**FITXERS**: `js/workflows/flow_chyrons.js`, `index.html`

**VALIDACIO**: Test headless (C:/temp/fp/test_dedupe.html) 9/9 OK: T1/T2/T3 — els dos noms reals de la firma (630083 «Ivan» / 630175 «Iván») donen la MATEIXA clau → dedupe = 1 i GUANYA la 630175 (i l'ordre invers dona el mateix resultat); T4 — rètols DIFERENTS que comparteixen posició → NO es fusionen (2); T5/T6 — `jsxName`; T7 — família cremada (PREGUNTA) intacta (2 còpies); T8 — noms buits intactes; T9 — regeneracions del mateix rètol → 1, amb la generació nova. `bin/check_js_v8.ps1` 57 OK / 0 FAIL · `bin/check_dead.ps1` 0 orfes.

### #149 - resolt (2026-10-12)

**SIMPTOMA**: TRADUCCIÓ (TRAD/COLOCAR i REPARTIR): quan l'espai assignat a una traducció és més LLARG que la durada del seu mèdia, els clips s'estiraven amb `Clips.endAt` més enllà del mèdia i la cua quedava BUIDA (clip al timeline sense imatge real). Petició d'usuari 2026-10-12: «si esos clips hay que estirarlos, se haga con el metodo de congelado que empleamos con Tema-Titol … congelando un clip que nos hayamos llevado al final del timeline y reinsertándolo».

**CAUSA ARREL**: El flux de traducció no consultava MAI la durada real del mèdia del rètol: decidia només a partir de l'espai (clip de V1 / nombre de traduccions) i forçava el final amb `Clips.endAt`, que allarga el clip encara que el mèdia s'hagi esgotat → cua sense imatge.

**SOLUCIO**: IMPLEMENTAT 2026-10-12 (ZERO JSX NOU: es COMPOSA el congelat ja validat del Tema-Títol). `js/workflows/flow_chyrons.js`: (1) nous `_isStillMedia` (PNG/JPG… = mèdia FIX: s'estira sense límit) i `_tradMediaDur(chy, wottIdx)` (durada EXACTA: DOM del bin CHY via `_resolveWottDur` amb `src` 'bin*' → `Logic.Project.getDuration`; les estimacions per mida es REBUTGEN); (2) nou `_placeTradSlot({chy, track, start, end, mediaDur, tempTC, label})`: si el mèdia cobreix el slot fa el camí de sempre (`insert` + `endAt`); si `mèdia < slot − freezeMinSec` col·loca el clip SENCER (mai estirat) i omple la cua amb el CONGELAT del frame del propi clip via `_freezeTemaTitol({track, animSec: mèdia, tempTC, freezeSec, frameMid: true, grabFrac})`; si el congelat falla → xarxa: clip estirat + WARN; (3) `_freezeTemaTitol` accepta `opts.grabFrac` (additiu: sense el paràmetre mana la clau del TITOLET); (4) el TC temporal surt d'`_emptyProgramTC` (PROGRAMA BUID a totes les pistes) perquè el PNG conservi l'ALPHA del rètol; (5) `_repararClipsV7` accepta `tag` (4t paràmetre, per defecte 'Repartir') i el flux TRAD també l'usa (instantània prèvia de la pista + reparació NOMÉS si hi ha hagut congelat); (6) `js/core/11_Configuracio.js`: bloc nou `traduccio` (`freezeTail`, `freezeMinSec: 0.12`, `freezeGrabFrac: 0.6`) exposat per `Config.get()`. `index.html`: `flow_chyrons.js?v=69→70` · `11_Configuracio.js?v=33→34`.

**FITXERS**: `js/workflows/flow_chyrons.js`, `js/core/11_Configuracio.js`, `index.html`

**VALIDACIO**: `bin/check_js_v8.ps1`: TOTAL 90 | OK 90 | FAIL 0. TEST FUNCIONAL headless amb el motor V8 real (Edge `--dump-dom`; `C:/temp/fp/fp_trad_freeze_test.html` + `run_trad_test.ps1`: XHR del fitxer REAL del repo i crida dels seus mètodes amb stubs de Clips/cep.fs): 45/45 PASS — SEQÜÈNCIA EXACTA del congelat (`insert` temporal a la zona lliure → `Timeline.set` al 60 % → `Render.snapshot` → `removeAt` → `insert` del clip viu → `endAt` a la durada del mèdia → `IO.importFiles` al bin CHY → `insert` del PNG → `endAt` fins al final del slot), els DOS punts d'entrada reals (`placeChyronTraduccio` i `repartirChyronTraduccio` amb 2 slots de 10 s i mèdia de 5 s → 4 clips: 2 vius [a,a+5] + 2 congelats [a+5,a+10]), rebuig de les estimacions per mida, mèdia FIX (PNG), nom amb `%` → `%25`, xarxa quan la captura falla i `freezeTail: false`.

### #150 - resolt (2026-10-12)

**SIMPTOMA**: Marge massa gran al PRIMER subtítol en col·locar/importar l'SRT a l'editor de subtítols (boto IN): el primer clip de subtítols començava 0,4 s (10 frames a 25 fps) MES ENLLA de l'IN del clip, i l'usuari el veia massa tard respecte a l'IN del timeline general. Petició d'usuari 2026-10-12: reduir-lo perque el primer subtitol quedi alineat amb l'IN.

**CAUSA ARREL**: El pad d'IN era una CONSTANT fixa de 10 frames (0,4 s) heretada del requisit antic «el primer subtitol no pot començar a 00:00; ha de començar a 00:00:00:10». Amb el pipeline actual (subtitols importats al punt d'IN del bloc) aquest marge es PERCEBUT com un desalineament: el text apareix abans del tall.

**SOLUCIO**: IMPLEMENTAT 2026-10-12 (zero JSX nou, cap metode nou). `js/editor/srt_editor.js`: el pad passa a 5 frames (0,2 s) i es llegeix de la configuracio — `cfg.srtPadStartSec` amb defecte 0,2 i guarda (`!isFinite || < 0` → 0,2) — aixi es pot ajustar (fins i tot a 0 = exactament a l'IN) des del Profile.json sense tocar codi. El filtre de marcadors deixa de tenir el literal `0.39` i usa `PAD_START_SEC - 0.01` (la invariant real: es descarta el marcador que queda abans de l'origen del clip, invariant respecte al pad). `js/core/11_Configuracio.js`: `general.srtPadStartSec: 0.2` + exposicio a `Config.get()` amb override. `js/workflows/flow_srt.js`: ruta IN legacy (`runSrtIn`) alineada de 0,4 → 0,2 (docblocks actualitzats: «mou primera al frame 5 (0,2 s)»). `index.html`: `srt_editor.js?v=74→75` · `flow_srt.js?v=10→11` · `11_Configuracio.js?v=34→35`.

**FITXERS**: `js/editor/srt_editor.js`, `js/core/11_Configuracio.js`, `index.html`

**VALIDACIO**: `bin/check_js_v8.ps1`: TOTAL 90 | OK 90 | FAIL 0. TEST FUNCIONAL headless amb motor V8 real (Edge `--headless=new --dump-dom`; harness `C:/temp/fp/fp_srtpad_test.html` + `run_srtpad_test.ps1`, que fa XHR dels fitxers REALS 10_Srt_Logic.js i srt_editor.js i crida `applyIn` amb stubs d'Utils/Config): 24/24 PASS — amb IN del clip a 20 s i CTI dins l'entrada #3: primer subtitol a 20,20 s (abans 20,40 s), final 21,40 s (durada del target conservada), entrades anteriors eliminades i renumerades, resta d'entrades desplacades -0,40 s, marcador ancorat al primer clip, `_setEditWindow` (#132) cridat 1 cop, log `padding 0.20s` i status `IN: N entrades`; OVERRIDE `srtPadStartSec: 0.4` → 20,40 s (comportament antic reproduible) i filtrat de marcadors invariant (0,80/1,80/2,80/20,40); OVERRIDE `0` → 20,00 s (exactament a l'IN); valors invalids (`'abc'`, `-5`) → cauen al defecte 0,20 s; `applyOut` intacte; i comprovacio sobre els fitxers reals de la clau de configuracio i dels cache-bust.

### #151 - resolt (2026-10-13)

**SIMPTOMA**: TRADUCCIONS (test d'usuari 2026-10-13, TNM V3): (a) REPARTIR repartia les traduccions només dins del clip que CONTÉ la 1a traducció — la selecció de V1 només marcava el límit SUPERIOR; (b) el congelat de la cua (#149) no s'activava mai: el log deia «durada del mèdia NO resolta → col·locat estirat» a tots els slots.

**CAUSA ARREL**: (a) `repartirChyronTraduccio` calculava `idx0 = selOrd.findIndex(c => c.end > gFirst + 0.05)`: el límit INFERIOR s'ancorava al clip que CONTÉ la 1a traducció (34.64s, on les havia deixat COLOCAR) mentre `idx1` sí que era l'últim clip seleccionat → asimetria (el fix del 2026-09-28 només va estendre el límit superior; el log del mateix 28/09 ja mostrava «(1 clip(s): 28.44-34.84)»). (b) `_tradMediaDur` rebutjava per disseny les estimacions per mida i depenia de `projectItem.duration` (que en aquests projectes dóna 0 per a TOTS els ítems del bin, 0/19) i de `Project.itemDuration`; a més l'índex del bin (`getWottIndex`, cache per nom de projecte, sense `forceReload`) s'indexava ABANS d'importar les traduccions (la fase Traducció corre després de Titol/Lloc/Nom) → sense entrada al bin no hi havia ni durada ni mida per estimar-la → `wantFreeze=false` → clip estirat (i, amb un slot més llarg que el mèdia, cua BUIDA: el bug que #149 havia de resoldre).

**SOLUCIO**: IMPLEMENTAT 2026-10-13 (ZERO JSX nou) a `js/workflows/flow_chyrons.js`: (1) el TRAM 1 de REPARTIR arrenca al PRIMER clip seleccionat (`let idx0 = (gi === 0) ? 0 : selOrd.findIndex(...)`) i els trams següents mantenen l'ancoratge al clip que conté el SEU inici → sense solapament (el tram k−1 ja s'atura al clip previ del començament del k); (2) `_tradMediaDur` recarrega l'índex del bin UNA vegada per run (`this._tradIdxReloaded`, reiniciat a l'entrada de `placeChyronTraduccio` i `repartirChyronTraduccio`) quan el nom no hi és, i accepta l'estimació per mida com a ÚLTIM RECURS amb correcció mesurada `× 0,9548 × 0,995` (el 0,9548 = 43,5/45,56 MB/s; el 0,995 fa que el congelat comenci 1-3 frames ABANS del final real del clip viu → se solapa amb el mateix rètol, MAI deixa forat) + WARN `📏 durada ESTIMADA per mida de fitxer`; (3) el label del log `Trad (V7)` passa a `Trad (V${T_TRAD})` (era V8: `cfg.tracks.video.lloc`). `index.html`: `flow_chyrons.js?v=70→71`.

**FITXERS**: `js/workflows/flow_chyrons.js`, `index.html`

**VALIDACIO**: `bin/check_js_v8.ps1`: TOTAL 90 | OK 90 | FAIL 0 (exit 0). `bin/check_dead.ps1`: 33 orfes + 24 noms vells = residu de pendrive PREEXISTENT (no d'aquest canvi). TEST FUNCIONAL headless amb el motor V8 real (Edge `--headless=new --dump-dom --allow-file-access-from-files`; harness `C:/temp/fp/fp_tradrepartir_test.html` + `run_tradrepartir_test.ps1`, que CARREGA el `flow_chyrons.js` REAL i li injecta un timeline mock amb semàntica de Premiere: `insert` = overwriteClip amb la durada COMPLETA del mèdia i `endAt` que CLAMPA al final del mèdia, més `Utils` i `Logic.Project` mockats): 32/32 OK — T1 el cas de l'usuari (5 clips de V1 [24.12→51.00] + 5 trad. de 6 s amb el DOM a 0 durades) → `ref V1 [24.12-51.00] (5 clip(s)`, `slotDur=5.38s`, 5 slots 24.12/29.50/34.87/40.25/45.62→51.00, clip real de 5.376 s (retallat, no estirat), cap congelat, veí de V8 restaurat [53.72-55.44] i JA NO surt el WARN «durada NO resolta»; T2 el test pendent (3 trad. sobre el mateix tram → `slotDur=8.96s` > mèdia) → 3 congelats amb `viu 5.97s + congelat 2.99s` i CAP forat entre clip viu i PNG; T3 dos trams → el tram 1 arrenca a 24.12 i el tram 2 s'ancora al seu clip (84.24) sense solapar; C1-C8 unitaris de `_tradMediaDur` (DOM 'bin' → exacte; índex VELL → recàrrega i el troba; DOM sense durades → estimació 5,97 s; PNG → 0; sense dades → 0; recàrrega que peta → cau a l'ítem del projecte; UNA sola recàrrega per run; estimació absurda >600 s → 0).

### #154 - resolt (2026-10-13)

**SIMPTOMA**: El PNG de portada no sempre es diu com l'MP4 exportat: el DESTÍ és correcte (AAA_PORTADES), el NOM no està garantit. Cal garantir la coincidència del nom base PNG ↔ MP4 i, si no hi ha homònim, no inventar l'hora.

**CAUSA ARREL**: buildRenderName() afegeix SEMPRE _HH_MM, però la majoria d'MP4 del NAS es diuen com la SEQÜÈNCIA (amb _1/_2 de duplicats de Windows) → eixos renders NO surten de runVideo. La portada llavors copia el nom de l'MP4 que troba (_resolvePortadaName, rama publicacio) o, amb el panell recarregat (State buit) i el llistat del NAS fallant, INVENTA l'hora (rama hora, WARN). Fragilitats: refPrefix derivat de la seqüència ACTIVA en el moment de la portada i CAP comprovació posterior que existeixi l'MP4 homònim.

**FITXERS**: `js/workflows/flow_render.js`, `js/workflows/flow_mp4.js`, `js/core/session_manifest.js`

### #155 - resolt (2026-10-13)

**SIMPTOMA**: 4a reaparició de la familia de CODI MORT (restauració d'un arbre antic del pendrive dins l'extensió) + PORTA pre-commit que impedeix tornar-la a commitejar mai més.

**SOLUCIO**: (1) ESBORRATS els 33 orfes (js/ i jsx/) llegint la llista del propi informe de la guardia (cap nom escrit a mà = cap errata); (2) ESBORRADA INFO/ (29 fitxers); (3) PORTA NOVA: bin/hooks/pre-commit (versionat) + bin/install_hooks.ps1 -> BLOQUEJA el commit si existeix INFO/ o si check_dead.ps1 surt amb codi 1. Abans NO hi havia cap barrera (.git/hooks/ només tenia els .sample). NO tocats: bin/build_graph.ps1 (2026-10-06) i docs/graph/DEPENDENCIES.html (2026-10-07) = eina de mapa de dependencies, treball recent.

**FITXERS**: `bin/hooks/pre-commit`, `bin/install_hooks.ps1`, `.clinerules`

**VALIDACIO**: ABANS: ESBORRATS 33 + 'CODI MUERT: 0 orfes | nomenclatura vella: 0 | OK: cap fitxer de js/ o jsx/ sense carregador' (EXIT=0). Hook: sintaxi OK (sh -n exit 0); TEST FUNCIONAL en viu amb INFO/ encara present -> 'COMMIT BLOQUEJAT: hi ha la carpeta INFO/ (restes de l'arbre antic del pendrive)' amb HOOK_EXIT=1; instal.lat a .git/hooks/pre-commit (hash identic al versionat); INFO/ esborrada (29 fitxers) i hook verificat amb EXIT=0.

### #156 - resolt (2026-10-14)

**SIMPTOMA**: Falta el marcador de l'ítem d'entrada del bloc TNV V1 del 13/10: 022f 'off' es va calcular amb una escaleta OBSOLETA (snapshot 21:15:24 amb agrupacio null) en comptes de les V3/V4 (21:25:36 / 21:30:50) on el realitzador ja l'havia agrupat a v1.

**CAUSA ARREL**: manifest.escaletaItems es congela en muntar el bloc i no es refresca mai (només un FOTO/ACTUALITZAR nou porta l'escaleta viva). Amb agrupacio null, assembly_context.js:129 el deixa fora de lines -> _classifyItems no el veu (ni el FORCED_STRUCTURAL_SUFFIXES 'f') i placeUngroupedMarkers el descarta per pos<0.

**SOLUCIO**: PENDENT DE DECISIÓ: (a) relançar amb escaleta fresca (predicció verificada: 022f -> structural/aproximat -> F2·Deduced clampa -1.00s a 0 -> marcador blau a 00:00, refF1 intacte perquè _calcTemporalAnchors:539-550 agafa el 1r ítem amb OnAir REAL); (b) xarxa de seguretat a placeUngroupedMarkers clampant pos<0 a 0, com ja fan F2 (l.1215) i jsx/modules/8_Markers.jsx:201-203.

**FITXERS**: `js/core/assembly_context.js`, `js/workflows/flow_markers.js`, `jsx/modules/8_Markers.jsx`, `js/core/4_Context.js`, `js/main.js`

**VALIDACIO**: PENDENT DE TEST A PREMIERE. (1) Obrir el projecte de PROVES/04_TN VESPRE_PROJECTES/2026_10_13/V1, clic a FOTO sense Ctrl → log esperat: '📍 [Fetch] Re-ancorant la data de treball a la del PROJECTE OBERT: ... → 2026_10_13' + '✅ [Fetch] Nova escaleta guardada'. (2) Relançar OUT&GO → log esperat '🔧 [Ungrouped] 022f: cau fora del clip (-1.00s) però és capçalera del bloc → clamp a 0' i marcador 022f 'off' a 00:00. Sintaxi: check_js_v8.ps1 57/57 OK (14/10).

### #156b - resolt (2026-10-14)

**SIMPTOMA**: MARC P D'INICI (00:00) I SEPARACIÓ DE MARCADORS (report d'usuari 2026-10-14, TNV V1): el marcador d'inici s'assignava amb `isItemEstructural` (durada > 0) → queia sobre '022' (EMILIO DELGADO, OnAir 21:02:24 = 12,00s) i `placeByPrefixes` (UPSERT per prefix) MOVIA el marcador d'aquest ítem a 00:00; l'off '022f' (durada 0:00, capçalera d'escaleta) es quedava amb un marcador groc aliè al mateix TC → dos marcadors a 0:00 i fora d'ordre d'escaleta.

**CAUSA ARREL**: Tres regles divergents de «quin ítem és l'inici»: F2 usava `isItemEstructural` (durada>0), F3 blindava qualsevol prefix amb marcador heretat a ≤0,15s i CAPA0 tenia la seva pròpia llista de gràfics. A més, F5 (`placeInferredItems`) era l'ÚNICA fase sense guarda del marcador d'inici (forat documentat a l'acord del 30/09).

**SOLUCIO**: REGLA ÚNICA `_pickStartItem(structuralItems, ungroupedItems, horaRefSec, graphicItems)`: 1r ítem ESTRUCTURAL en ordre d'escaleta segons `_classifyItems` (NO durada>0 → la capçalera 'off' 0:00 pot ser l'inici), MAI un gràfic (P2/GF/MAPA); capçalera encara no agrupada al manifest acceptada només si és estructural forçada ('f','i','dir','dp','lead') i la seva hora és ≤ l'inici calculat. Consumida per F2 (l.1274), F3 (l.1459) i CAPA0 (l.2280). F2 SEMPRE upserta el marcador d'inici (idempotent a 00:00, refresca color 6) i publica `_iniciPrefix`. F3 protegeix NOMÉS el prefix d'inici: qualsevol altre ítem amb marcador heretat a 00:00 es re-col·loca a la seva hora real. F5 no pot tocar el 00:00 (prefix d'inici, marcador a ≤0,15s o `_frozen`) i el terra de la seva finestra passa a ser l'inici + marge 0,5s. `_horaRefSec(item, reader)` centralitza l'hora de referència (OnAir real, si no prevista) perquè F2/F3/CAPA0 mesurin igual.

**FITXERS**: `js/workflows/flow_markers.js`

**VALIDACIO**: `bin/check_js_v8.ps1`: TOTAL 57 | OK 57 | FAIL 0 (14/10). PENDENT DE TEST A PREMIERE: (1) TNV V1 → marcador '022f - off' a 00:00 i '022' a 12,00s (mai dos marcadors a 0:00); (2) cap ítem sense OnAir clavat a 0,00s; (3) 'dir'/'dp' AMB durada segueix vermell (BUG #110) i el pur numèric estructural no es veu afectat; (4) els gràfics (GF) segueixen podent coincidir a 00:00.

**NOTA**: NO s'ha implementat la 'defensa global' a `_safePlaceByPrefixes` (descartar tot placement <0,15s) que es va barrinar a l'acord del 30/09: F1 pot col·locar legítimament el vídeo que OBRE el bloc a 0,00s (OnAir == ancoratge EF) i CAPA1 també → bloquejar-ho globalment trencaria fluxos vàlids. La protecció es fa per fase (F2 propietari, F3/F5 amb guarda, SEP amb `esInici`) i CAPA1 ja afegeix `_iniciPrefix` a `_frozen`.

### #157 - resolt (2026-10-14)

**SIMPTOMA**: El botó FOTO demanava l'escaleta del dia EQUIVOCAT: amb el projecte del 13/10 obert (carpeta PROVES/04_TN VESPRE_PROJECTES/2026_10_13/V1) va consultar digition amb data 2026-10-14 → 'API: Error - No s'ha localitzat cap clean feed amb títol [TN VESPRE [senyal net]] per la data/hora [2026-10-14 21:00:00]' → fetchNewEscaleta = null → CAP fitxer escrit al projecte (0 canvis en disc, cap error visible a la UI més enllà del toast del log).

**CAUSA ARREL**: Dos forats a l'ancoratge de la data: (1) js/main.js:1534-1538 (poll de 60 s) esborrava State.projectDateDir amb UNA sola lectura buida de Registry.activeProjectName i SENSE cap log; (2) js/core/4_Context.js:185 restaura workTarget='today' en acabar el mode correcció (Ctrl+clic a MAIN) sense restaurar projectDateDir. Amb els dos valors perduts, _targetDateDir() (js/core/4_Context.js:52-66) cau al punt 2 → data del SISTEMA → dia equivocat.

**SOLUCIO**: (1) NOU helper Core.Context._resolveProjectDateDir() (js/core/4_Context.js): deriva la data REAL del .prproj amb l'àtom JSX ja existent FASTPASS.Project.path() + regex YYYY_MM_DD sobre les parts de la ruta, validant que el projecte sigui dins config.rutas.destinoBase (mateix criteri que assembly_context.js:74-109). (2) El handler FOTO (js/main.js:875-904) l'aplica com a PRIORITAT 0 quan el clic NO és Ctrl+FOTO i re-ancora State.projectDateDir amb log WARN '📍 [Fetch]'. (3) El poll (js/main.js:1569-1588) ja NO desancora amb una lectura buida: calen 2 cicles seguits (~2 min) i el desancoratge queda REGISTRAT (WARN).

**FITXERS**: `js/main.js`, `js/core/4_Context.js`

**NOTA**: Residual conscient (NO tocat): checkContext() segueix datant amb _targetDateDir(); si l'ancoratge es perd abans de prémer FOTO, el botó MAIN pot oferir NOU del dia d'avui amb un projecte d'AHIR obert. Es tanca de fet perquè la FOTO re-ancora i perquè el camí normal (LOAD) sempre fixa projectDateDir. Si reapareix, la solució és re-resoldre la data a checkContext només quan el projecte obert pertany al programa+bloc seleccionats.

### #158 - resolt (2026-10-14)

**SIMPTOMA**: TITOLET col·locats per CADÈNCIA al TNC V1 del 2026-10-14 (report d'usuari: «s'han col·locat al timeline però no al seu temps»). Els 6 TITOLET de l'ítem 04 (rol TITOLET, «QUÈ DEMANEN ELS PAGESOS») van sortir encadenats cada ~9,1 s (24,60/33,69/42,82/51,93/61,02/70,12 s del timeline) amb el log «SENSE detecció → encadenat»; la detecció va donar 0 intervals i 0/6 wotts.

**CAUSA ARREL**: NO va ser ffmpeg: l'escaneig va fer 214 mostres 160x45 en 3 trams a 2 fps. La culpa és de la RECEPTA de l'etiqueta TITOLET (titolet.roiPerRole['TITOLET'], mesurada amb TN Migdia el 2026-10-05), que buscava el taronja NOMÉS a y[0.60,0.85]: al TN COMARQUES el rètol viu a la banda MITJANA (MESURAT al TNC_V1_CLIP.mp4 del 14/10: y 0,367-0,578, x 0-0,5, color #F85818; 6 rètols a t 56,7/75,7/91,7/108,7/122,7/136,2 s del clip). Dins la banda mesurada l'únic taronja era el d'IMATGE de l'inici del bloc (una lona a y 0,356-0,722, 8,13 % del frame) i la guarda de vora edgeAxes:'y' el descartava perquè toca la vora superior de la ROI → 0 intervals. Una sola ROI ampla y[0.30,0.85] tampoc no serveix: la lona queda DINS i sense tocar les vores → 1 interval FALS (mesurat: 7 en comptes de 6).

**SOLUCIO**: CONFIG-ONLY (zero JSX, zero codi JS nou). 11_Configuracio.js:113 — titolet.roiPerRole['TITOLET'] passa a DUES facetes del MATEIX color #F25F13 ±25: la de sempre (sense roiY propi → hereva y[0.60,0.85], TNM/TNV) MÉS una de nova per a la banda mitjana (roiY [0.32,0.62], TNC). `_recipeOf` calcula la ROI mare com el hull de les zones (y 0,32-0,85) → UNA sola passada d'ffmpeg, i cada faceta conserva la SEVA zona i la SEVA guarda de vora (el taronja d'imatge travessa les dues zones de dalt a baix i les descarten totes dues). Cache-bust index.html:225 11_Configuracio.js?v=36. La caché del pla s'invalida sola perquè `facets` entra a la clau (_planCachePath, 17_TitoletDetect_Logic.js:1128).

**FITXERS**: `js/core/11_Configuracio.js`, `index.html`

**VALIDACIO**: Mesura headless amb el clip REAL (replicant _analyzeRect + _facetRect + groupIntervals: 2 fps, 160x45, hull 0,32-0,85): recepta VELLA → 0 intervals (reprodueix el bug); recepta NOVA → 6/6 rètols (56,72-63,22 · 75,72-83,22 · 91,72-99,22 · 108,72-116,22 · 122,72-130,22 · 136,22-142,72) i 0 falsos. Regressió TNM_V1 (12/10) i TNV_V1 (13/10): 954 mostres, la faceta mitjana fa 0 ON (no aporta falsos). bin/check_js_v8.ps1 TOTAL 57 | OK 57 | FAIL 0 · bin/check_dead.ps1 0 orfes. PENDENT DE TEST A PREMIERE: relançar l'ítem 04 del TNC V1 → 6 TITOLET a ~35,2/54,2/70,2/87,2/101,2/114,7 s del timeline i al log «🎨 [titolet] … «TITOLET» colors 2: …».

### #159 - resolt (2026-10-14)

**SIMPTOMA**: La part VIVA de les targetes de GRAFISME CREMAT (TITOLET i tota la família de `titolet.detectRoles`: PREGUNTA, CARTELL, DADA-GRAN…) s'inseria amb una durada MÉS LLARGA que el mèdia real del wott → el clip s'acaba ABANS de l'instant previst i queda un BUIT entre el final del clip i el congelat (el rètol desapareix un moment i torna congelat). Petició d'usuari (14/10): «assegurar que l'insertat no és més llarg que la mèdia real».

**CAUSA ARREL**: `_placeTitoletChain` calculava la part viva com `cardDur − TRIM` (cardDur = durada resolta del wott) i `_freezeTemaTitol` fixava el final del clip amb `Clips.endAt(placeTime, cutTime)`. `Clips.endAt` NO allarga un clip més enllà del seu mèdia: si `cardDur` és una ESTIMACIÓ LLARGA (mida del fitxer ÷ bitrate, perquè el bin no té la durada del DOM — log real 14/10: «Bin CHY: 9 fitxers, 0 amb durada del DOM»), el clip s'acaba abans de `cutTime` i el congelat, que comença a `cutTime`, deixa el forat. Mesurat al log del run TNC V1 (14/10 14:08): «viu 5,09s = clip 5,29s − 5 frames» per als 6 TITOLET (5,29 s = estimació).

**SOLUCIO**: `titolet.liveHoldBackSec` = 1.0 (clau nova de TITOLET_DEFAULTS, 11_Configuracio.js): la part viva es retalla SEMPRE 1 s del FINAL (`liveWant = cardDur − TRIM − marge`) → el congelat hi entra 1 s ABANS i la cadena queda CONTÍNUA (el congelat és un PNG estirat, elàstic: no té límit de mèdia). Guarda proporcional: `liveHold = min(liveHoldBackSec, cardDur × 0,25)` perquè en wotts curts (1-2 s) el marge no es mengi l'animació d'ENTRADA (el grafisme no arribaria format a l'aire). S'aplica als DOS camins de `_placeTitoletChain` (targeta detectada i targeta encadenada) → cobreix tota la família amb un sol punt de codi. Diagnòstic nou: cada targeta logueja la FONT de la seva durada (`[bin]` exacta del DOM · `[mida]`/`[mida~est]` estimada · `[assumit]` ANIM 5 s) i el marge aplicat. Descartada l'alternativa «comprovar el mèdia abans d'inserir» (ffprobe/bin DOM): lenta i innecessària perquè el marge ja absorbeix l'error d'estimació. La LLARGADA TOTAL de la targeta NO canvia: el marge només mou la frontera viu → congelat (el congelat creix el mateix que s'escurça la part viva) → la cadència de la cadena i el lloc dels rètols queden idèntics; amb final detectat (`detEnd`) mana la detecció. #159b (test d'usuari del MATEIX dia: «queda 1 frame de separació entre el grafisme i el seu congelat»): el marge deixava el final de la part viva FORA de la graella de frames (5,29 − 0,20 − 1,00 = 4,09 s = frame 102,25) i `Clips.endAt` (final del clip viu) i `Clips.insert` (inici del PNG) arrodoneixen CADA instant a la graella PER SEPARAT i en sentits oposats (mesurat: clip viu fins al frame 982 = 39,28 s, PNG inserit al 983 = 39,32 s) → 1 frame de forat. Remei: `_freezeTemaTitol` (JS:630) llegeix el FINAL REAL del clip acabat d'inserir amb `Clips.at(track, placeTime + 0,02)` → `.end` (mateix patró de verificació que `Repartir`, JS:4328) i hi ancora el PNG (`cutReal`, fallback `cutTime` si la lectura falla): el congelat arrenca EXACTAMENT on acaba el recorte (mai abans → no retalla el grafisme; mai després → no deixa forat). `stretchEnd` NO es toca → la llargada de la targeta és la mateixa i el congelat creix el que s'ha escurçat la part viva (≤ 1 frame). Logs nous: `🧷 Congelat ancorat al FINAL REAL del grafisme: Xs→Ys (±N frame/s)` i verificació del junt `🔗 Junt clip viu → congelat OK: … (0 frames)` amb WARN `⚠️ FORAT de N s` si no s'enganxen. Cache-bust index.html: flow_chyrons v73 + 11_Configuracio v37.

**FITXERS**: `js/core/11_Configuracio.js`, `js/workflows/flow_chyrons.js`, `index.html`

**VALIDACIO**: bin/check_js_v8.ps1 TOTAL 57 | OK 57 | FAIL 0 · bin/check_dead.ps1 0 orfes · test headless (C:\temp\fp\ver_livehold_159.ps1 → ver_livehold_159.txt): 40 OK / 0 FAIL (wiring de #159 i #159b, 5 casos d'aritmetica, invariant «part viva <= media», llargada de la targeta intacta, aritmetica de la graella: part viva 4,09 s a 35,20 s -> clip fins al frame 982 (39,28 s) + PNG al 983 (39,32 s) = 1 frame de forat, i amb cutReal -> 0 frames; coixi: absorbeix errors d'estimacio fins a 1,2 s = 23% sobre 5,29 s; per sobre caldria pujar liveHoldBackSec). PENDENT DE TEST A PREMIERE (TNC V1, ítem 04): al log «🧲/⛓️ … viu X s = clip Y s [mida] − 5 frames − marge 1.00s + congelat …», «🧷 [_freeze] Congelat ancorat al FINAL REAL del grafisme: 39,29s→39,28s (−1 frame/s)» i «🔗 [_freeze] Junt clip viu → congelat OK … (0 frames)» (CAP WARN de FORAT).

**NOTA**: Fora d'abast (NO tocat): el bucle genèric de rètols (`_placeChyronsByType`, JS:2196) ja acota el rang amb `durOwn` (durada resolta del wott), però si aquesta és una estimació llarga té el mateix risc de cua buida — pendent de decidir amb l'usuari si s'hi estén el marge.

### #160 - resolt (2026-10-14)

**SIMPTOMA**: EXPORTACIÓ DE LA PORTADA (PNG) TRENCADA (report d'usuari 14/10): (a) el PNG anava a AAA_PORTADES en comptes de la CARPETA DEL PROJECTE; (b) el PNG sortia NEGRE.

**CAUSA ARREL**: (a) El destí era `config.rutas.portadas`; l'usuari el vol JUNT amb el projecte i amb el MATEIX nom base que el MP4 (`State.lastRenderName`). (b) CAPTURA AL PRIMER FRAME DEL CLIP: la còpia s'inseria amb `Clips.insertClipFrom` a `tempTC` i `inPoint = mediaIn` deixava el frame del cabezal EXACTAMENT al borde del clip; amb l'arrodoniment a frame de Premiere el TC capturat queia FORA del clip (zona neta buida) → QE `exportFramePNG` escrivia un frame NEGRE. El codi antic també calculava la captura amb el `tempTC` teòric (no amb els valors REALS del clip) i alineava la portada amb `endAt`.

**SOLUCIO**: BLOC `runPortada` REESCRIT (zero JSX nou): (1) DESTÍ = carpeta del PROJECTE (`Context.folder()` → `workFolder(State)` → `destinoBase`) amb el nom base del render. (2) PRE-ROLL `PORTADA_GUARD` = 0,08 s: la còpia es mou a `tStart = tempTC − 0,08` amb `inPoint = mediaIn − 0,08` → el frame del cabezal queda 2 frames DINS del clip. (3) TC REAL: `tcCap = copyStart + (mediaIn − inPointReal)` llegit amb `Clips.get` després de `moveToRange` (`FRAME_TOL` = 0,04 s; fallback al 1r frame vàlid si no cau dins). (4) Portada alineada al rang REAL de la còpia (`moveToRange(copyStart, copyEndSec)`). (5) VERIFICACIÓ amb `Clips.at` a `tcCap` abans de capturar. (6) OUT ampliat a `tEnd + 1` i verificat amb `Timeline.getOut()`. (7) NETEJA amb els temps REALS + audio fantasma provant `cleanTC` i `tempTC`.

**FITXERS**: `js/workflows/flow_render.js`, `js/workflows/flow_chyrons.js`

**VALIDACIO**: bin/check_js_v8.ps1: TOTAL 57 | OK 57 | FAIL 0 (14/10). PENDENT DE TEST A PREMIERE (panell recarregat; cache-bust flow_render v29 + flow_chyrons v74): (1) PNG a la CARPETA DEL PROJECTE amb el nom base del MP4; (2) línies `[Portada]` noves al `FASTPASS.log` (finestra tStart→tEnd, `tcCap`, «Out point ampliat ... real=», «🔎 Frame ... V1/V2», neteja); (3) `png_probe.ps1`/`png_cmp.ps1` (C:/temp/fp) per confirmar que NO és negre.

**NOTA**: `flow_chyrons.js` (`_capture`) rep la mateixa verificació real de l'Out point (WARN si `Timeline.out` no l'amplia). Patró pre-roll/marge aplicable a qualsevol altra captura QE de frame.

### #161 - resolt (2026-10-14)

**SIMPTOMA**: ÀTOMS FANTASMA AL BRIDGE (mateix llinatge que els `flux_*.js`): `Timeline.setWorkArea()` i `Timeline.getWorkAreaIn()/getWorkAreaOut()` NO EXISTEIXEN a `jsx/main.jsx` → les crides no donaven error visible: es perdien en SILENCI.

**CAUSA ARREL**: Els tres mètodes es van escriure suposant un bridge que no els exposava (cap dels tres apareix a `main.jsx`; els reals són `Timeline.range`, `Timeline.getIn/getOut` i `Timeline.zoomToSelection`). Conseqüències: (1) `flow_graphics.js` (Cocinado) intentava aplicar l'ÀREA DE TREBALL amb `setWorkArea` → mai s'aplicava (el 'corxet' de l'OUT no es movia); (2) `flow_mp4.js` (fase `crudo`) llegia `getWorkAreaIn/Out()` → tornava `[]` → `parseFloat` = `NaN` i el `NaN` s'escrivia al JSON de la fase, contaminant el Cocinado.

**SOLUCIO**: `flow_graphics.js` (Cocinado): `Timeline.setWorkArea(a,b)` → `Timeline.range(a,b)` + `Timeline.zoomToSelection()` (sincronitza l'ÀREA DE TREBALL amb IN/OUT i porta el cabezal a l'inici del rang) amb log de les dues respostes. `flow_mp4.js` (fase `crudo`): `getWorkAreaIn/Out()` → `Timeline.getIn()/getOut()`, i el resultat passat per `numOr(v, d)` perquè cap `NaN` arribi al JSON. `flow_graphics.js` (Cocinado) hi aplica el mateix `numOr` als valors llegits de la fase `crudo`.

**FITXERS**: `js/workflows/flow_graphics.js`, `js/workflows/flow_mp4.js`

**VALIDACIO**: bin/check_js_v8.ps1: TOTAL 57 | OK 57 | FAIL 0 (14/10). PENDENT DE TEST A PREMIERE (panell recarregat; cache-bust flow_graphics v25 + flow_mp4 v6): (1) Cocinado → log «« [INOUT Cocinado] WorkArea aplicat (range + zoomToSelection): OK... » i l'ÀREA DE TREBALL ha de quedar marcada entre IN i OUT; (2) `mp4` → la fase `crudo` del manifest ha de portar `workAreaIn/workAreaOut` NUMÈRICS (no `null`/`NaN`).

**NOTA**: Regla reforçada: ABANS d'afegir una crida `callJSX(...)` nova a JS, comprovar que l'àtom existeix a `jsx/main.jsx` (una crida a un àtom inexistent NO dona error: `callJSX` rep un `undefined is not a function` que en alguns camins es descarta i el flux continua amb dades falses).

### #162 - resolt (2026-10-15)

**SIMPTOMA**: ÀUDIO ORFE A LA ZONA NETA de la PORTADA (report d'usuari 2026-10-15): després de capturar el PNG quedava un clip d'ÀUDIO FANTASMA a A1 @ 151.00 s (zona morta), amb el MEDIA SENCER del clip font.

**CAUSA ARREL**: L'`insertClipFrom` amb RIPPLE col·loca l'àudio del clip copiat en un TC IMPREDICTIBLE (mesurat: 2,00 s ABANS del TC demanat, 153.00 → 151.00) i SENSE `Link` amb el vídeo. La neteja anterior era només per TEMPS (`removeAt(cleanTC)` + `removeAt(tempTC)`) → l'orfe no hi era i sobrevivia. Mesura al `.prproj` (gzip XML, TPS 254016000000): ObjectID 1540 @ 151.00 s amb el MATEIX `Name` que el clip font (ObjectID 1129) i cap `Link`.

**SOLUCIO**: `runPortada` reescrit (ZERO JSX nou; àtoms existents `Clips.debugTracks('audio')` + `Clips.removeAt`): `_snapAudio()` fa una FOTO de l'àudio (track, start, nom) ABANS d'inserir la còpia, i la neteja aplica 3 regles IDEMPOTENTS: (1) TEMPS (`removeAt(cleanTC)` / `removeAt(tempTC)`); (2) DIFERÈNCIA contra la foto prèvia; (3) ORFE = mateix nom que el clip font I `start` més enllà del final real del projecte (amb `FRAME_TOL`) → mata també els orfes d'execucions anteriors. Guarda `maxEnd > 0` per NO tocar mai l'àudio del programa. `index.html`: flow_render v29→30.

**FITXERS**: `js/workflows/flow_render.js`, `index.html`

**VALIDACIO**: bin/check_js_v8.ps1: TOTAL 57 | OK 57 | FAIL 0 · bin/check_dead.ps1: 0 orfes (exit 0). TEST A PREMIERE (usuari, 15/10): VALIDAT — l'orfe desapareix i el log diu «Neteja d'àudio orfe: A1@151.00(orfe)→OK».

**NOTA**: L'orfe el GENERA l'insert amb ripple; l'ideal seria no generar-lo, però la regla 3 el mata de manera idempotent (també en re-execucions). NO esborrar mai res per ZONA: A1 comparteix espai amb l'àudio del programa.

### #163 - resolt (2026-10-15)

**SIMPTOMA**: DESTÍ DEL PNG DE PORTADA (report d'usuari 2026-10-15): el PNG anava a la CARPETA DEL PROJECTE i ha d'anar a `AAA_PORTADES` — es REVERTEIX el canvi del 14/10 (#160a).

**CAUSA ARREL**: El 14/10 (#160a) el destí es va passar de `config.rutas.portadas` a la carpeta del projecte (`Context.folder()` → `workFolder(State)` → `destinoBase`). Decisió revertida per l'usuari.

**SOLUCIO**: `pngDir = config.rutas.portadas` (carpeta AAA_PORTADES del NAS VERTICALITZACIO_INFORMATIUS); els fallbacks (carpeta del projecte → `workFolder(State)` → `destinoBase` → carpeta temporal) NOMÉS s'usen si la config no porta la ruta, amb WARN al log. `utils.ensureFolders(pngDir)` crea l'arbre UNC i l'exportació QE (`Render.snapshot`) escriu DIRECTAMENT al destí final. El NOM del PNG no canvia. `index.html`: flow_render v30→31.

**FITXERS**: `js/workflows/flow_render.js`, `index.html`

**VALIDACIO**: bin/check_js_v8.ps1: TOTAL 57 | OK 57 | FAIL 0. TEST A PREMIERE (usuari, 15/10): VALIDAT — el PNG cau a AAA_PORTADES amb el nom del render.

**NOTA**: El #154 (que el nom base PNG ↔ MP4 quedi GARANTIT) segueix pendent: sense homònim a EXPORTS PROVISIONALS el nom es resol amb `buildRenderName(seqActiva)` + hora (amb WARN), no s'inventa res més.

### #164 - resolt (2026-10-16)

**SIMPTOMA**: TNC V3 (bloc 14 «FAUNA ALIADA PER L'AGRICULTURA», 15/10): una **TRADUCCIÓ** acabava a **V7**, duplicada damunt del nom-càrrec legítim («…_644349_TRADUCCIO [2-3] Només n'existei…» → V7 59.72→64.60, la mateixa que V8) i el nom-càrrec es perdia.

**CAUSA ARREL**: El filtre de la fase NOM (`placeChyronNom`) era `c.name.indexOf('Nom')` sobre el nom SENCER del fitxer, que **inclou el TEXT del rètol**: el text «Només n'existei…» feia casar la traducció amb la família NOM.

**SOLUCIO**: nou predicat accent-safe `_isTraduccioWott` (accepta «TRADUCCIO»/«TRADUCCIÓ», al rol o com a token) + guarda a les fases LLOC/NOM/RESTO + invariant a `_placeChyronsByType` (una traducció només pot quedar-se a la fase TRADUCCIÓ). Eina nova `bin/analyze_prproj_tracks.py` per llegir les pistes del `.prproj`.

**FITXERS**: `js/workflows/flow_chyrons.js`, `bin/analyze_prproj_tracks.py`

**VALIDACIO**: smoke `bin/smoke/fp_smoke_build.ps1`: PASS (secció `14-chyrons-families`: filtre NOM, filtre LLOC i fase TRADUCCIÓ).

**NOTA**: Registrat des del CHANGELOG del 16/10 (sessió de TNC V3); el detall del cas viu als comentaris de la secció §14 de l'smoke.

### #165 - resolt (2026-10-16)

**SIMPTOMA**: TN MEDIODIA V1 (bloc «PG Intro / PENSIONS ENTREN EN PRECAMPANYA», emissió 15/10; mesurat al V6 auto-desat de les 09:52): el **Tema-Títol GRAN** entrava **32 s tard** (32.32 s, sobre l'altre ítem) i el **CONDUCTOR** no es col·locava enlloc.

**CAUSA ARREL**: El 1r marcador del bloc és l'ítem de PLATÓ que obre el bloc —«01 PGi - PG Intro» (color -1 al .prproj; `colorIdx:6` només en el moment de col·locar)— i porta un **ESPAI** entre el número i el sufix d'ítem. La regex que decidia si un comentari de marcador és ESTRUCTURAL (`/^\d+[a-z]{0,5}\s*-\s*.+$/`, i `{0,3}` en dues fases més) **no acceptava aquell espai**: «01 PGi - PG Intro» queia FORA de `structuralMarkers` mentre que «01 - PENSIONS …» (base «1») hi entrava. Conseqüències: (a) el gran de l'ítem «01 PGi» baixava al respatller per BASE i s'ancorava al marcador de l'ALTRE ítem («01» @32.32 s) → 32 s tard; (b) `_isPresenterTitle` mirava el títol del marcador («PG Intro») i cap token de plató casava (el prefix de plató «PG » no es despullava) → cap marcador de plató ⇒ **Conductor omès**.

**SOLUCIO**: (1) `js/workflows/flow_chyrons.js` — nou filtre ÚNIC de mòdul `isStructuralMarkerComment(comment)` = `/^\d+\s*[a-z]{0,5}\s*-\s*.+$/i`, que substitueix les **6** còpies inline («01 PGi» ara és estructural a totes les fases: marcador, F2, F3.5, F4·Faro, Titol…) + `Chyrons._isStructuralMarkerComment` per a l'smoke. (2) `_isPresenterTitle` accepta el títol **sense el prefix de plató** (PG/PLA/PLATO/ESTUDI) → «PG Intro» → «INTRO» casa amb el token de presentadora ⇒ el Conductor torna. (3) `js/workflows/flow_markers.js` — el tram IPD (`runAplicarIpdDesdeMarkers`) feia servir la seva pròpia regex `/^\d+[a-z]?\s*-\s*.+$/i` + `color === 6`; com que el marcador acaba amb **color -1**, l'ítem de plató quedava fora ⇒ ara delega al filtre únic (`isStructuralMarkerComment`, consultat a `Chyrons` en temps de crida amb xarxa idèntica) i exposa `Markers._isStructuralMarkerComment`. (4) `index.html`: `flow_markers.js?v=66→67` i `flow_chyrons.js?v=73→74`.

**FITXERS**: `js/workflows/flow_chyrons.js`, `js/workflows/flow_markers.js`, `index.html`

**VALIDACIO**: `bin/check_js_v8.ps1`: TOTAL 58 | OK 58 | FAIL 0 · smoke `bin/smoke/fp_smoke_build.ps1`: **PASS 118 FAIL 0** (secció nova `15-tnm-marcador-pgi`: filtre amb espai al sufix, no-estructurals, «PG Intro»/`_isPresenterLine` i delegació de `flow_markers`) · **pendent el test a Premiere** amb el projecte del bloc.

**NOTA**: El cas va arribar amb els TRES símptomes alhora (gran tard + Conductor omès + sortida tapada, BUG #166) perquè l'ítem de plató que obre el bloc no era reconegut com a estructural.

### #166 - resolt (2026-10-16)

**SIMPTOMA**: TN MEDIODIA V1 (15/10, V6): la **peça de SORTIDA** del titulillo (desaparició del Tema-Títol gran) no es veia a pantalla — quedava «mig amagada» per la cua del congelat.

**CAUSA ARREL**: A la cobertura del buit (`_fillTitulilloGaps`) el **CONGELAT** s'estirava fins a `zoneEnd` (IN del gran) i la **SORTIDA** es col·locava DESPRÉS, a `[reverseStart, endZone]` (6 frames ABANS d'on acabava el congelat). Com que totes dues peces entren amb `Clips.moveToRange` (NO destructiu, **sense** `overwriteClip`), el congelat no retallava res i les dues quedaven **ENCAVALCADES** a la pista. Mesura: congelat `1.36→32.32` + sortida `32.08→32.32` = **6 frames de solapament**.

**SOLUCIO**: `js/workflows/flow_chyrons.js` — (1) nou `Chyrons._coberturaFreezeEnd(zoneEnd, reverseStart, exitPlaced)` = `min(zoneEnd, reverseStart)` quan la sortida s'ha col·locat **de veritat** (peça del gran o revers ffmpeg) i `zoneEnd` si no (perquè el forat no quedi descobert); (2) a `_fillTitulilloGaps` es **REORDENA**: primer la SORTIDA i després el CONGELAT, que ara acaba a l'IN de la sortida → `1.36→32.08` + `32.08→32.32` **encadenats** (mateixa mecànica que el CasB de `_placeTemaTitolTransicions`); (3) la SORTIDA s'**ancora a `zoneEnd`** (= `max(marcador, IN del gran)`, el veritable final de la zona) i ja no a `endZone` (= marcador si n'hi ha): si el marcador va ABANS del gran, l'ancoratge vell deixava la sortida 6 frames abans del gran i, amb el congelat ja encadenat, hauria obert un **forat** davant del gran (fins a `CONDUCTOR_TAIL`); (4) `index.html`: `flow_chyrons.js?v=74` → `?v=75`.

**FITXERS**: `js/workflows/flow_chyrons.js`

**VALIDACIO**: `bin/check_js_v8.ps1`: TOTAL 58 | OK 58 | FAIL 0 · smoke: **PASS 118 FAIL 0** (secció `15-tnm-marcador-pgi`: `_coberturaFreezeEnd` amb sortida col·locada / sense / amb `reverseStart` no finit + `cadena congelat→sortida→gran` amb l'ancoratge real a `zoneEnd`) · **pendent el test a Premiere**.

**NOTA**: No s'ha tocat cap crida a `Clips.*`: el problema era l'**ORDRE** de col·locació i el **FINAL** de les dues peces, no l'API.

### #167 - resolt (2026-10-16)

**SIMPTOMA**: TN MEDIODIA V2 (bloc «VIMBODÍ I POBLET», emissió 15/10): el rètol de **LOCALITZACIÓ DEL DIRECTE** («…_644353_Directe_PRESENCIAL_Vimbodí i P.») sortia a **0.40 s**, o sigui **34 s ABANS** que el lloc fos a pantalla — el directe del bloc arrenca a l'IPD («05 - +++IPD POBLET VISITA» @34.36 s).

**CAUSA ARREL**: el generador de ròtols emet aquest wott amb el lineID de l'**ÍTEM D'INTRO del DIFERIT** («04i - intro DIFERIT (VIMBODÍ I POBLET)» @0 s), no amb el de l'IPD. Com que `_baseTimeForChyron` ancora cada rètol al marcador del **SEU** ítem (+0.40 s de tc), el rètol del lloc queia a l'inici del bloc. L'ancoratge a la connexió (`_connexioMarkerTime`) només resolia el cas dels ENVIAT: el marcador de l'IPD no conté «CONNEXIÓ» ni acaba en «dir» i el wott de localització no hi arribava mai.

**SOLUCIO**: `js/workflows/flow_chyrons.js` — (1) predicats nous `_isDirecteSenyalWott` (família DIRECTE/PRESENCIAL pel **CAMP** `rol` = `parts[7]` de `13_Parse.meta`, o pel **TOKEN exacte** del nom — MAI pel text lliure), `_isIpdDirecteMarker` (IPD/«+++»/id·`DIR`/«DIRECTE» al títol/sufix `dir` del bloc) i `_firstIpdDirecteAfter` (primer IPD/directe **ESTRICTAMENT** posterior); (2) `Chyrons._ipdAnchorPlan(markersFull, structureById, filterFn, label)` → `{de, per, moved}`: per a cada rètol d'aquesta família, a **QUIN** marcador IPD/directe va; (3) `markersFull` ara porta `label` (el comentari **SENCER** del marcador), que és el que permet detectar l'IPD (abans només s'hi desava el número d'ítem i el títol «+++IPD …» es perdia); (4) a `_placeChyronsByType` el rètol es treu del seu ítem i s'afegeix a l'ítem IPD/directe, amb el **MATEIX patró** que el bloc de CONNEXIÓ (i el seu log «📍 … LOCALITZACIÓ: … penja de l'ítem X → va a l'ítem IPD/directe Y»); (5) `index.html`: `flow_chyrons.js?v=75→76`.

**FITXERS**: `js/workflows/flow_chyrons.js`, `index.html`, `bin/smoke/fp_probe_ipd_chyron.js`

**VALIDACIO**: `bin/check_js_v8.ps1`: TOTAL 58 | OK 58 | FAIL 0 · smoke `bin/smoke/fp_smoke_build.ps1`: **PASS 138 FAIL 0** (secció nova `15-ipd-chyron`, amb les dades REALS del run TNM V2: família, detecció d'IPD/directe, primer IPD posterior, el pla amb **1 sol moviment** cap a 34.36 s — 34.76 s de col·locació—, l'ENVIAT i el nom-càrrec intactes, i les guardes d'ítem propi / filtre de fase / bloc sense IPD) · **pendent el test a Premiere**.

**NOTA**: Guardes de l'ancoratge: (a) només la família DIRECTE/PRESENCIAL i passant el filtre de la fase que crida (els ENVIAT tenen la seva regla; els nom-càrrec, Tema-Títol, Lloc/Data i traduccions no es toquen mai aquí); (b) si el rètol **JA** penja d'un ítem IPD/directe es queda on és (convenció d'usuari del 2026-09-21); (c) només es mou cap **ENDAVANT**.

### #168 - resolt (2026-10-16)

**SIMPTOMA**: TN MEDIODIA V2 (bloc «VIMBODÍ I POBLET», emissió 15/10): a l'entrega hi havia **dues** còpies del rètol de localització (`…_644353_Directe_PRESENCIAL_Vimbodí i P.`) —una a **0.40 s** (ítem d'intro `04i`, romanent del run de les 08:52) i una a **34.76 s** (IPD `05`, del #167)— i el rètol d'ENVIAT (`…_644409_Enviat_No_Laura Catalan Asenjo`) es quedava clavat a **0.40 s**. Petició d'usuari: «si apareix un rètol de PRESENCIAL i/o ENVIAT en una intro, s'ha de moure al SEGÜENT ítem DIRECTE o DIFERIT». (El manifest del run de les 09:35 ho confirma: el PRESENCIAL es va col·locar a 34.76 s però l'ENVIAT s'hi va quedar a 0.40 s.)

**CAUSA ARREL**: (1) l'ENVIAT només sabia anar al **punt de connexió** (`_connexioMarkerTime`); en aquest bloc no hi ha cap marcador de connexió → es quedava al marcador del SEU ítem, la intro (0.40 s); (2) el destí del pla #167 era NOMÉS IPD/directe → als blocs on la peça que arrenca és un **DIFERIT** no hi havia destinació possible, encara que el rètol parli justament d'aquell ítem («04 - DIFERIT LAURA CATALAN» ↔ «Enviat_No_Laura Catalan Asenjo»).

**SOLUCIO**: `js/workflows/flow_chyrons.js` — (1) predicats nous `_isIntroMarker` (sufix `i`/`intro` de `13_Parse`, `type === 'intro'`, id acabat en «I» —`04i`, `01 PGi`— o títol INTRO/PG Intro) i `_isDiferitMarker` (sufix `dif` o títol «DIFERIT/DIFERIDO»); (2) `_sigTokens` (mots de 5+ lletres del nom del wott, fora les capçaleres del format: WOTT/INTRO/DIFERIT/DIRECTE/PRESENCIAL/ENVIAT…) i `_pickDirecteDiferitAfter(markersFull, structureById, fromTime, name)` → `{time, marker, kind}`: candidats = marcadors ESTRICTAMENT posteriors que obren un ítem **DIRECTE** o **DIFERIT** (la intro no compta mai); **AFINITAT** de títol primer (mana el candidat que comparteix un mot significatiu amb el rètol) i, sense afinitat, mana el DIRECTE amb el DIFERIT com a **pla B** (convenció #167); `_firstDirecteDiferitAfter` és l'embolcall de temps; (3) `_ipdAnchorPlan` — **condició nova**: l'ENVIAT entra al pla **només si penja d'una INTRO** (la família DIRECTE/PRESENCIAL segueix entrant sempre) i la guarda «el seu ítem ja és el destí» ara cobreix IPD/directe **i DIFERIT**, però **no** la intro (que és l'origen normal); (4) `_placeChyronsByType`: el pla es calcula **ABANS** del bloc de CONNEXIÓ → un ENVIAT d'intro **sense** punt de connexió mana per la regla nova (log `🔌 … mana l'ítem DIRECTE/DIFERIT @ Xs`) i un ENVIAT **amb** punt de connexió real es treu del pla i es queda a la connexió (com sempre); (5) `index.html`: `flow_chyrons.js?v=76→77`.

**FITXERS**: `js/workflows/flow_chyrons.js`, `index.html`, `bin/smoke/fp_probe_ipd_chyron.js`

**VALIDACIO**: `bin/check_js_v8.ps1`: TOTAL 58 | OK 58 | FAIL 0 · smoke `bin/smoke/fp_smoke_build.ps1`: **PASS 152 FAIL 0** (secció nova `16-intro-directe-diferit`, amb les dades REALS del TNM V2: 14 assercions —intro i DIFERIT, tokens del nom del wott, destí de l'ENVIAT de Laura a 18.36 s, destí del PRESENCIAL de Vimbodí a 34.36 s, `null` sense cap DIRECTE/DIFERIT posterior, les 2 guardes i el log) · **pendent el test a Premiere**.

**NOTA**: Amb el cas real, el PRESENCIAL de Vimbodí va a l'IPD `05` @34.36 s (34.76 s de col·locació, com al #167) i l'ENVIAT de Laura va al DIFERIT `04` @18.36 s. Aquesta entrada **substitueix** el punt del #167 que deia que «l'ENVIAT es queda intacte» (i la seva asserció d'1 sol moviment, ara 2). ⚠️ Cap run no esborra clips de runs ANTERIORS: la còpia de 0.40 s del run de les 08:52 s'ha d'esborrar a mà (o recol·locar sobre pista neta), perquè el fix evita el mal lloc però no neteja el timeline.





**SIMPTOMA**: Grafismos/rótulos colocaban su audio enlazado (A1, o A2+ según targeting)

**SOLUCIO**: Nuevo Logic.Clips.insertNoAudio: Clips.insert + Clips.at + Clips.removeLinkedAudio (átomo existente) + red de seguridad por NOMBRE (nunca toca el audio del programa). Usado en flow_mapa.js (_placeClips) y flow_retols.js (_placeChyronsByType, traducciones x2).

**FITXERS**: `js/logic/6_Clips_Logic.js`, `js/workflows/flow_mapa.js`, `js/workflows/flow_retols.js`

### BOTO_MAIN_CUADRAT - resolt (2026-09-22)

**SIMPTOMA**: El botón MAIN cambiaba de forma (se ajustaba al texto) al arrancar el panel y en cada cambio de estado

**SOLUCIO**: style.css: regla #btnMainAction/btn-big-sq con width/height/min/max + !important, flex:0 0 auto, box-sizing:border-box y texto ajustado dentro (2 líneas). 4_Context.js: eliminadas las 5 asignaciones className='square-large'/'btn-new' (clase INEXISTENTE: el botón perdía btn-big-sq) y los estilos inline width:100%/minHeight:60px; se limpia el borde rojo del estado LOCKED al cambiar de estado. Validado headless (Edge + style.css real): 60x60 con todos los textos, incluso con width:100% inline o sin la clase.

**FITXERS**: `style.css`, `js/core/4_Context.js`, `index.html`

### CONDUCTOR_BLOC_AMB_GRAFISMES - resolt (2026-09-23)

**SIMPTOMA**: El chyron de conductor se omitía porque el bloque abre con grafismos (P2 foto, P2 MAPA) y el ítem de plató (01i) es el 3º en la ESCALETA (aunque es el 1º del TIMELINE)

**SOLUCIO**: flow_chyrons.js::placeChyronConductor: nueva regla (usuario): el conductor va al PRIMER MARCADOR DEL TIMELINE cuyo ítem sea de plató (intro/donapas/off/directe/conexión). Se leen los marcadores estructurales (resultado de F1-F7) y se decide 'es de plató' por el prefijo del marcador → ítem de la escaleta (lineByNum + _isPresenterLine) y, si no está, por el título del marcador (_isPresenterTitle). Eliminados el criterio 'plató = 1er ítem de la escaleta' y la ventana de 3 ítems del FIX 33. Respaldo: plató de la escaleta sin marcador propio (inicio del bloque). isFirstItem se mantiene (no hay marcador antes) para el CasA/CasB del Tema-Títol. Log: '🎙️ [Conductor] 1r marcador de PLATÓ al timeline: 01i @ Xs (OBRE el bloc) · plató de l'escaleta: 01i'. Repercusión indirecta: _blockStartTime lee el primer clip de V7 (conductor) → si está al inicio puede pasar a CasB (Tema-Títol tras el rótulo + titulillo con entrante a clipStart+0.40).

**FITXERS**: `js/workflows/flow_chyrons.js`, `index.html`

### DF_MAPA_A_CONFIG - resolt (2026-09-22)

**SIMPTOMA**: Doble Finestra/Mapa usaban números de pista fijos (V1/V2/V3) en lugar de la config

**SOLUCIO**: flow_graphics.js: PAS0/PAS1/PAS2/PAS3/PAS4, _dpUnlockTracks y runMapa leen tracks.video (mp4/video1/video2/fondos). _colocarFonsMapa recibe la pista fondos. Preset DF con claves 'v'+pista; 7_KF.jsx acepta V4/V5. flow_mapa.js: GRAF/grafismos = graficos (V3) y congelado = tematitol (V6).

**FITXERS**: `js/workflows/flow_graphics.js`, `jsx/modules/7_KF.jsx`, `js/workflows/flow_mapa.js`

### ESCAPE_BARRES_INJECTIO_JSX - resolt (2026-09-23)

**SIMPTOMA**: Error d'escapada a la ingesta de fitxers: utils.importList només escapava les cometes simples, així que les barres invertides de la ruta es perdien dins del literal ExtendScript (\P, \Z, \S → P, Z, S) → importFiles fallava (ERR:MOVE_FAILED) i després ERR_ITEM_NOT_FOUND en col·locar el grafisme

**SOLUCIO**: js/core/utils.js::importList: el payload passa a fer DOBLE escapada, `this.escape(JSON.stringify(rawPaths))` (JSON + escape), la mateixa tècnica que _freezeTemaTitol (flow_chyrons.js) i _freezeGrafEnd (flow_mapa.js). Compatible amb rutes amb '/' i amb '\\'. El flux de Project no es veia afectat perquè allà les rutes es passen amb '/' i escape() no toca les barres normals. Diagnòstic fet amb PROVES\FASTPASS_audit.log (comparant la crida trencada amb la que funciona). Cache-buster: utils.js?v=16.

**FITXERS**: `js/core/utils.js`, `index.html`

### ESPAI_FOCUS_BOTONS - resolt (2026-09-22)

**SIMPTOMA**: Al pulsar ESPACIO con el foco en un botón del panel (p. ej. ▶ tras usar el slider) se saltaba al clip siguiente en lugar de hacer PLAY/PAUSA

**SOLUCIO**: main.js (sección 7): handler global keydown en captura. ESPACIO/ENTER sobre BUTTON/A/input-button → preventDefault + stopPropagation + blur (mata el click fantasma y el foco pegajoso). ESPACIO (fuera de campos de texto, incluido el <input type=range> del slider) → SrtEditor.togglePlay(), que hace el play/stop REAL de Premiere con el QE DOM (app.enableQE(); qe.project.getActiveSequence().play()/.stop()) y, si el visor tiene vídeo, lo alinea; NO exige que el visor tenga vídeo cargado (si no lo tiene, el ESPACIO ya no queda inhábil). Los INPUT de texto/TEXTAREA/SELECT/contenteditable se excluyen. Validado headless (C:\temp\fp_space_test.html): ▶ clicks=0, foco→BODY, plays=1/2/3 en los tres escenarios (botón, slider y sin foco), text no interceptado.

**FITXERS**: `js/main.js`, `index.html`

### GRAF_REF_CLIP_V1 - resolt (2026-09-22)

**SIMPTOMA**: El GRAF tomaba como referencia el cabezal (CTI) y no el clip a sustituir

**SOLUCIO**: flow_mapa.js: _resolveRefClip (V1 seleccionado → V1 bajo el CTI → otra selección); el material se inserta en el IN del clip y el espacio hábil es su rango [start,end]; congelado alineado al IN; _itemAtCti/_freezeUnderCti reciben la posición de referencia.

**FITXERS**: `js/workflows/flow_mapa.js`

### GRAFISMES_PER_MARCADOR - resolt (2026-09-23)

**SIMPTOMA**: Automatitzar el botó 🎨 (MAPA) guiat pels marcadors grocs: (1) la referència del punt d'entrada passa del clip seleccionat al MARCADOR; (2) congelat de 3 s (o fins al següent clip de V1) al final del grafisme perquè l'usuari el pugui estirar; (3) al final de COLOCAR, repassar els marcadors GROCS (color 4) amb paraula clau (MAPA), col·locar el grafisme associat i, si no hi ha coincidència, obrir el navegador de fitxers

**SOLUCIO**: flow_mapa.js: _flow fa mkRef=_itemAtCti(CTI) → refSec=mkRef.time (TC del marcador) + _refClipAt(refSec) per a l'espai hàbil (fallback al clip seleccionat si no hi ha marcadors). Nous mètodes: _refClipAt(sec), _applyTrackConfig(), _freezeGrafEnd(gName, grafEnd, endLimit) [mecànica de _freezeTemaTitol: grafisme temporal a TC 10:00 + Render.snapshot de l'últim frame + treure el temporal + IO.importFiles al bin GRAF amb emparellament del nom real + Clips.insert/endAt a V3 amb dur=min(3s, endLimit−grafEnd)], GRAF_KEYWORDS=['MAPA'] (ampliable), _keywordOf() (normalitzat), _grafCandidates() (color===4 + paraula clau), runFromMarkers() + _runCandidates() (_match per nom → _askFiles si no hi ha coincidència → _import → _refClipAt/_freezeUnderCti → _placeClips al TC del marcador). main.js::runPlaceAllChyrons afegeix la fase final Mapa.runFromMarkers() (després dels chyrons i de l'IPD). index.html: tooltip del 🎨 actualitzat. FIX 37 (post-validació): el COLOR dels marcadors NO és llegible en aquesta versió de Premiere (Markers.get() retorna color=-1 a tots, verificat al snapshot MARCADORS_*.json), així que el filtre real és la PARAULA CLAU i el color només s'informa; només es descarta si el color és conegut i ≠ 4. Comprovat amb el bloc V1 del TNC: 01p22@15.00s + fitxer 'APP P2 MAPA CENTRES DE DADES.mov' a ZZZ_GRAFISME\22 SETEMBRE → match automàtic. FIX 39: _freezeGrafEnd desa el cabezal (Timeline.get()) i el restaura en un bloc finally (Timeline.set) perquè el snapshot l'havia de moure al TC temporal; cache flow_mapa.js?v=18.

**FITXERS**: `js/workflows/flow_mapa.js`, `js/main.js`, `index.html`

### INVERSIO_PEREZOSA_TITULILLO - resolt (2026-09-22)

**SIMPTOMA**: El titulillo se enviaba a invertir (ffmpeg) siempre, aunque el reverso no se fuera a colocar en el timeline

**SOLUCIO**: flow_chyrons.js: inversión PEREZOSA con caché por fase (getRev()). _placeTemaTitolTransicions solo invierte dentro del bucle de reversos a colocar (cas B / varios TTs grandes); _fillTitulilloGaps solo invierte en la sección 3 si reverseStart > gapStart + 0.20. El log de cobertura ya no lee rev.ok (informa '[sense espai per al revers]'). El congelado no depende del reverso.

**FITXERS**: `js/workflows/flow_chyrons.js`

### IPD_PLUS_DOBLE_FINESTRA_VERTICAL - resolt (2026-09-23)

**SIMPTOMA**: Botó IPD+ = TOGGLE per INTERVAL: talla el clip de V2 a l'interval seleccionat i el mou a V3, duplica V1 → V2, i aplica els atributs de capa inferior a V1 ([1058,812] 110%) i de capa superior a V2 ([161,812] 50%), SENSE recortes ni fons PNG. Si es torna a clicar amb un interval ja tractat, reverteix (esborra V2, V3 → V2, treu atributs de V1). Inclou la reorganització del grup GRÀFICS en 2 files de 3 (IPD·IPD+·🪟🪟 / Grafic·Mapa·Tòtem)

**SOLUCIO**: flow_graphics.js: config única `IPDPLUS` (SRC=2 pista del clip transformat, PARK=3 on s'aparca l'original i fa de fons, BASE=1 material que es copia a SRC, INFERIOR {position:[1058,812],scale:110}, SUPERIOR {position:[161,812],scale:50}). `runIpdPlus` = toggle (si hi ha clips a PARK dins l'interval → revertir). `_ipdPlusRango` (interval = unió dels clips SELECCIONATS de qualsevol pista via l'àtom JSX nou Clips.getSelection(); sense selecció → clip de BASE/V1 sota el cabezal), `_ipdPlusClipsEnRango`, `_ipdPlusMotion` (aplica i desa estat previ per pista:start), `_ipdPlusAplicar` (moveToRange+removeAt per deixar 1 sol clip a SRC → move a PARK → insertClipFrom BASE→SRC clip a clip + moveToRange → Motion), `_ipdPlusRevertir` (removeAt SRC → move PARK→SRC → BASE a estat previ/normal). Àtom JSX nou Clips.getSelection() a 6_Clips.jsx + alias a main.jsx (justificat: cap àtom retornava la selecció múltiple). La Doble Finestra 🪟🪟 queda igual (revertida la parametrització de perfils del FIX 40). index.html: 2 files de 3 + btnGrafIpdPlus. main.js: binding Graphics.runIpdPlus. FIX 42 (post-validació): (a) l'interval ja no s'agafa del clip de V2 sota el cabezal (podia durar tot el bloc: cas real 200,28 s → 28 clips) i la selecció es pren de qualsevol pista; (b) Clips.duplicate fallava (ERR_CLIP_NOT_FOUND_AFTER_DUP) → es fa servir Clips.insertClipFrom + moveToRange. PRECISIÓ DE L'USUARI: la SELECCIÓ és sempre de la pista BASE (V1) i el tall de V2 (SRC) es fa respecte a aquest interval → _ipdPlusRango filtra per BASE i ignora la resta de pistes. NOTA: `position` va en px del frame de la seqüència (el JSX normalitza dividint per frameSize) → si els valors venen d'un frame 1920×1080 i la seqüència és 608×1080 caldrà escalar-los.

**FITXERS**: `js/workflows/flow_graphics.js`, `js/main.js`, `index.html`, `jsx/modules/6_Clips.jsx`, `jsx/main.jsx`

### MARCADORS_GRAFICS_F6_DESCONNECTAT - resolt (2026-09-23)

**SIMPTOMA**: Los marcadores amarillos/grocs (color 4) de los ítems gráficos (P2 foto, P2 MAPA, GF, TE…) nunca se generaban: F6·Gràfics (Workflows.Markers.placeGraphicMarkers) no se invocaba desde ningún sitio

**SOLUCIO**: Diagnóstico verificado: el único productor de colorIdx:4 es flow_markers.js:1892 (placeGraphicMarkers); el botón 🎨 (btnMarksF6) fue reasignado el 2026-09-18 a Mapa.run y el grupo MARCADORS (TEST) solo llegaba a F5; el pipeline runFullPipelineOut (OUT&GO) incluía F1→F5 + Ordre(F6) pero NO Gràfics; flow_assembly.js solo tiene el alias. Con la escaleta real del TNC V1 (01p21/01p22 con horaEntradaPrevista 13:56:28, sufijos p21/p22 en _GRAPHIC_SUFFIXES) los ítems SÍ se clasifican como gráficos: solo faltaba ejecutar la fase. Fix: (1) nueva 10ª fase ['Gràfics (F6·GF)'] en runFullPipelineOut, DESPUÉS de 'Ordre (F6)' y antes del snapshot; (2) botón nuevo btnMarksF6GF 'GF' en el grupo MARCADORS (test-only) → Markers.placeGraphicMarkers; (3) title del 🎨 corregido (hace el MAPA) sin cambiar su función. Los grocs se anclan al marcador padre 01i con el criterio D13 (+10s / +15s). Colateral NO tocado: la fase/botón Correl (F3.5) llama a Assembly.correlationSnapMarkers, método INEXISTENTE (redundante: F3 ya ejecuta _correlationSnap internamente).

**FITXERS**: `js/main.js`, `index.html`

### OUTGO_TOTES_LES_PISTES - resolt (2026-09-23)

**SIMPTOMA**: OUT&GO no recortaba en V9 (Mosa): las pistas a limpiar eran listas FIJAS [2..8] y [A1,A2]

**SOLUCIO**: flow_cut.js::runCutOut: las listas se calculan de las pistas reales de la secuencia (Tracks.count('video')/('audio')): vídeo 2..N (V1 se recorta antes con rippleOut) y audio 1..N. rippleOut ya recortaba el clip en curso y borraba los posteriores; solo faltaba pedírselo a V9. Log: 'Limpiando pistas secundarias: video [2,…,9] (de 9), audio [1,2] (de 2)'.

**FITXERS**: `js/workflows/flow_cut.js`, `index.html`

### PLAY_PANELL_FOCUS_HOST - resolt (2026-09-22)

**SIMPTOMA**: El ESPACIO no hacía PLAY/PAUSA: el play del panel NUNCA ha funcionado porque qe.project.getActiveSequence().play() NO EXISTE en esta versión de Premiere (log: 'ERR:qe...play is not a function')

**SOLUCIO**: Diagnóstico en el log: app.setAppFocus y app.bringToFront NO EXISTEN en esta versión de Premiere (is not a function) y el QE no tiene play(). Solución final: bin/send_space.vbs (WMI → PID de 'Adobe Premiere Pro.exe' → AppActivate → SendKeys ' ') lanzado con File.execute() vía callJSX (wscript: sin consola ni parpadeo; NO se usa IO.executeShell para no abrir un .bat). Solo se envía si el panel tiene el foco (document.hasFocus) y no es un eco propio (anti-bucle 1,5 s). comprobarApisPlay() elige la vía (QE → setAppFocus → bringToFront → VBS) y avisa en el log; devolverFocoHost ya no repite APIs inexistentes. Validado: cscript detecta el PID 15928 ✔.

**FITXERS**: `js/main.js`, `bin/send_space.vbs`, `index.html`

### REGLA_TEMPS_FINAL - resolt (2026-10-02)

**SIMPTOMA**: REGLA «TEMPS FINAL» (petició d'usuari 2026-10-02): en repassar els ítems de l'escaleta, el primer que conté el text «TEMPS FINAL» marca el FINAL de l'escaleta útil → el procés s'hi ha d'aturar (l'ítem del marcatge inclòs no compta). Objectiu: evitar que ítems de prova/flotants posteriors al marcatge tornin a provocar errors com el del 01/10 (un ítem de V1 solt al final del bloc → tall massa llarg + marcadors vermells).

**CAUSA ARREL**: Els ítems posteriors a «TEMPS FINAL» no pertanyen a cap bloc (`agrupacio: null`), però SÍ que entren a les deduccions que recorren TOTES les línies (`_deduceOnAirEntrada`/`_deduceOnAirSortida` cross-agrupació de js/core/escaleta_items.js), al final de bloc calculat (`ER._getBlockLastItemEndSec`, escaleta_io.js:387-419), al semàfor (`getStatus` → `wottsExpected` + `isBlockFullyEmitted`) i al manifest `escaletaItems` bolcat per flow_mainButton.js (:767, :1154, :1812) → podien inflar durades/avançar estats amb material que el playout NO emet.

**SOLUCIO**: IMPLEMENTAT 2026-10-02 (pendent de test a Premiere; ZERO JSX nou) a js/core/escaleta_io.js: nou `ER.truncateAtTempsFinal(data)` (recorre `data.escaleta.liniesEscaleta`; al primer ítem amb `titol`/`titular`/`nom` que contingui «TEMPS FINAL» en MAJÚSCULES retalla l'array amb `slice(0, i)` i retorna `{cut, dropped, titol}`; `null` si no hi és) cridat DINS `ER.load` just ABANS de cachejar (després de `applyDurationOverrides` i `_sanitizeOnAirLies`, :878-892) → un sol punt deixa nets TOTS els consumidors (bounds, marcadors, manifest, semàfors) sense repetir la regla a cada flux. Log nou: `🛑 [ER:IO] "TEMPS FINAL" a l'ítem #N ("TEMPS FINAL TNV") → M ítem(s) descartat(s) de l'escaleta` (+ WARN si llança). index.html: escaleta_io.js?v=15 → ?v=16.

**VALIDACIO**: `bin/check_js_v8.ps1`: TOTAL 96 | OK 95 | FAIL 1 en el moment del fix (l'únic FAIL era el preexistent i aliè `core/escaleta_trim.js`, ESBORRAT després el mateix dia → ara TOTAL 95 | OK 95 | FAIL 0, vegeu #115; `escaleta_io.js` OK). TEST FUNCIONAL REAL amb el V8 del CEP (Edge headless, C:/temp/fp/fp_133_134_test.html) sobre un fixture de l'escaleta REAL del 01/10 (C:/temp/fp/esc_tf.json, idx 190-198 amb el marcatge a l'índex 3): 7/7 PASS → tall=3 · 6 descartats · últim ítem retingut «tort CLAIM 3CATINFO» · minúscules («temps final tnc») també talla · sense marcatge → null i array intacte · entrades buides (`null`, `{}`) → null sense excepció.

### REVERS_TITULILLO_FRAME - resolt (2026-09-22)

**SIMPTOMA**: El reverso del titulillo (la animación invertida delante del Tema-Títol) quedaba 1 frame a la izquierda

**SOLUCIO**: flow_chyrons.js: el IN del reverso se alinea a la rejilla de frames (Math.ceil((endZone-durP)/FRAME)) porque durP es ESTIMADA (1,02 s = 25,5 frames; el _REV.mov real son 25 frames = 1,00 s) y endZone-durP caía en medio frame (80,66 s = frame 2016,5). Constante REV_FRAME = 0.04. En la fase 6, insertTitol() acepta endSec y ancla el reverso al gran.

**FITXERS**: `js/workflows/flow_chyrons.js`

### SLIDER_NO_ES_MOU_AMB_ESPAI - resolt (2026-09-22)

**SIMPTOMA**: Al pulsar ESPACIO (play), el slider de reencuadre se iba al centro / perdía su posición

**SOLUCIO**: main.js: (1) el tick ya no apaga el reencuadre con UNA pérdida momentánea de foco — necesita 2 ticks (~1 s) sin focus (_reframeNoFocusTicks), porque el AppActivate del VBS del ESPACIO hacía perder el foco un instante; (2) _applySliderRange ya NO reposiciona el thumb con la X del clip objetivo (solo aplica el rango y recorta si queda fuera): era el 'cur=333' que recentraba el slider al reactivar el reencuadre; (3) al enviar la tecla ya no se hace devolverFocoHost (blur) porque el VBS ya trae el foco a Premiere. Log: '🎚️ Slider límits(px): … cur=712 (clip=333) …'.

**FITXERS**: `js/main.js`, `index.html`

### SRT_NOMES_DEL_DIA - resolt (2026-09-22)

**SIMPTOMA**: El fallback de SRT cargaba subtítulos de OTRO día (TNC V1 del 22/09 cargó el .SRT del 21/09 'EMPRESES DE LLEURE... CERDANYA')

**SOLUCIO**: Scanner.srtFallback: todos los niveles exigen la fecha de trabajo (N1 = prefijo+data, N2 = cualquier .SRT del día). Eliminados 'prefix (qualsevol data)' y 'qualsevol .SRT de la carpeta'; sin dateDir no carga nada; aviso explícito en log y panel. El mecanismo principal (bloques de 15 min) ya filtraba por fecha.

**FITXERS**: `js/logic/Scanner.js`, `js/workflows/flow_srt.js`

### SRT_RESET_REBUSCA - resolt (2026-09-22)

**SIMPTOMA**: El botón RESET (♻️) de subtítulos solo restauraba el SRT ya cargado; ahora vuelve a BUSCAR los .SRT del tema del bloque

**SOLUCIO**: Nuevo Workflow.Srt.runSrtReset(): 1) SrtEditor.resetToOriginal() (restaura tabla/marcadores y limpia los clips de subtítulos de la secuencia); 2) vuelve a buscar el .SRT del tema con Scan.mediaAssets(ctx, State.detectedTheme) (carpeta de verticalización, prefijo {archivo}_{bloque}_ + fecha de trabajo) y, si no, Scan.srtFallback (día de trabajo) → SrtEditor.loadSrt(path). main.js: el botón ahora llama callWorkflow('Srt','runSrtReset').

**FITXERS**: `js/workflows/flow_srt.js`, `js/main.js`, `index.html`

### TITULILLO_SALIDA_MARCADOR - resolt (2026-09-22)

**SIMPTOMA**: Titulillo de cobertura: el reverso acababa en la posición calculada del Tema-Títol grande, no en el TC del marcador del ítem

**SOLUCIO**: _fillTitulilloGaps (flow_chyrons.js): endZone = TC del marcador del ítem (Markers.get + prefijo) → el reverso termina ahí; el congelado estira hasta el grande (zoneEnd) para no dejar hueco.

**FITXERS**: `js/workflows/flow_chyrons.js`

### TT_AL_MARCADOR - resolt (2026-09-22)

**SIMPTOMA**: El Tema-Títol grande entraba 1 s (25 frames) después del marcador (se le sumaba el tc del nombre del wott)

**SOLUCIO**: flow_chyrons.js: ttPos.time = TC del marcador (sin + tc). Conductor: ttPlaceTime = targetTime (sin tc) → marcador + 6.24. El titulillo de salida y las transiciones se alinean solos.

**FITXERS**: `js/workflows/flow_chyrons.js`

### #171 - resolt (2026-10-16)

**SIMPTOMA**: Petició d'usuari 2026-10-16: «en general quan s'insereixen els chyrons, es col·loquen al timeline de manera que després NO es poden estirar amb el ratolí; necessitaria que es col·loquen sempre amb la possibilitat d'editar-ne la durada». Passava amb qualsevol rètol col·locat pel panell (chyrons, Tema-Títol, congelats, traduccions…): el clip hi era, però l'eina de retall del ratolí no deixava allargar-lo.

**CAUSA ARREL**: el final de cada col·locació es tancava amb `Clips.endAt`, que NOMÉS mou `clip.end` del TIMELINE: l'`outPoint` del SOURCE quedava al final del mèdia i l'estat del clip era INCOHERENT (`end − start ≠ outPoint − inPoint`). Premiere, amb eixa incoherència, considera el material ESGOTAT i no deixa estirar el clip («no es pot estirar més enllà de la inserció feta»). És EXACTAMENT el defecte que es va mesurar en viu el 2026-10-08 al MAPA (#146: `Clips.endAt(3,900,902)` → end=902 dur=2 però outPoint=50.6 = INCOHERENT; `Clips.trimBounds(900,0,2,…)` → outPoint=2 = coherent = estirable), que allà es va resoldre i ací havia quedat estès per TOTES les col·locacions de rètols i pels `Clips.moveToRange` que només reassignen start/end (congelat del titulillo i peça de sortida del Tema-Títol).

**SOLUCIO**: IMPLEMENTAT 2026-10-16 (ZERO JSX NOU: es COMPOSEN àtoms existents). (1) `js/logic/6_Clips_Logic.js` — `Clips.endCoherent(trackIdx, startSec, endSec, type, tag)`: llig el clip real (`_clipAtTime`: àtom `Clips.at` i, si el resultat no arrenca on toca, escombratge `Clips.count`/`Clips.get`, mateix patró que `flow_chyrons::_repararClipsV7`), comprova l'estat i, si és incoherent, fa el retall COHERENT amb `Clips.retrim` (inPoint → outPoint → end, amb verificació de 3 intents): `outPoint = inPoint + (end − start)` → `end − start == outPoint − inPoint` = ESTIRABLE amb el ratolí. Si el clip JA és coherent no crida res (idempotent); si el mèdia NO dóna per a la durada demanada (Premiere limita l'`outPoint`), RE-FIXA el final amb `Clips.endAt` = comportament de sempre + WARN; si no troba el clip → `ERR_NO_CLIP`. NO toca l'àudio d'A1 (a diferència de `Clips.trimBounds`, que també retalla el clip d'àudio que arrenca al mateix instant). (2) `js/workflows/flow_chyrons.js` — totes les col·locacions hi passen: `_freezeTemaTitol` (les 3 rutes del clip d'animació + el PNG estirat del congelat), `_placeChyronsByType` (el final de cada rètol), `_placeTradSlot::insertLive`, `_placeTemaTitolTransicions::insertTitol`, `_fillTitulilloGaps::insEnd`, `_repararClipsV7` (re-inserció i restauració) i, DESPRÉS dels `moveToRange`, `_insertTemaTitolExit` i `_freezeTitulilloStill` (un `moveToRange` mou start/end i deixava l'in/out del source descompensat → el clip no s'estirava). (3) `index.html`: `6_Clips_Logic.js?v=6→7` i `flow_chyrons.js?v=78→79`. (4) `bin/smoke/fp_smoke_build.ps1`: el mòdul real `js/logic/6_Clips_Logic.js` entra al bundle headless.

**FITXERS**: `js/logic/6_Clips_Logic.js`, `js/workflows/flow_chyrons.js`, `index.html`, `bin/smoke/fp_probe_estirable.js` (nou), `bin/smoke/fp_smoke_build.ps1`

**VALIDACIO**: `bin/check_js_v8.ps1`: TOTAL 58 | OK 58 | FAIL 0 · `bin/smoke/fp_smoke_build.ps1`: **PASS 202 FAIL 0** (secció nova `18-estirable`, 17 assercions amb el MOTOR REAL carregat i un MODEL de Premiere al pont JSX: estat incoherent → coherent amb el final intacte i mèdia romanent per estirar; idempotència; mèdia esgotat → `endAt` de reserva amb el final volgut intacte; imatge FIXA (PNG de `moveToRange`); xarxa de lectura `count/get`; sense clip → `ERR_NO_CLIP`; i la INTEGRACIÓ REAL de `_placeTradSlot` i `_freezeTemaTitol`, que acaben amb clips coherents) · **pendent el test a Premiere** (cal RECARREGAR el panell pel cache-bust v7/v79).

**NOTA**: El retall COHERENT no canvia res del que es veu: la durada al timeline mana i només se sincronitza el rang del source amb ella. Per a un mèdia que s'usa SENCER (un wott animat col·locat amb tota la seua durada) el clip queda coherent i es pot ESCURÇAR/estirar fins al final del mèdia; allargar-lo MÉS enllà del mèdia és impossible en qualsevol editor (Premiere no té més imatge) — quan la targeta és més llarga que el mèdia, el flux ja hi posa el CONGELAT (#149), que és una imatge fixa i s'estira sense límit.

### #172 - resolt (2026-10-16)

**SIMPTOMA**: PORTADA — el PNG que es publicava NO era el frame demanat: la portada eixia amb el fotograma d'un altre moment de la timeline, i com que la captura sencera (còpia a la zona neta + `Render.snapshot`/QE + neteja) dura 10-30 s el botó no donava cap senyal de treball (un segon clic muntava una segona composició).

**CAUSA ARREL**: (1) **BRETXA DE PONT** (mateixa classe que el #173): per ampliar temporalment el corxet OUT abans de capturar, el flux cridava `Timeline.outPoint(...)`, un àtom que NO existeix al pont —`jsx/main.jsx` exposa `out` → `FASTPASS.Timeline.outPoint`— i `callJSX` empassa l'`EvalScript error` com a `'ERR:...'`; l'Out es quedava CURT i `Render.snapshot` (→ `Render.exportFrameQE(tcSec, path)` → `qeSeq.exportFramePNG(tc, path)`) rebia un timecode FORA del rang de la seqüència: QE NO falla, exporta el frame que pot → portada d'un altre moment. (2) L'ÀREA DE TREBALL (el rang amb què exporta QE si està activada) NOMÉS se sincronitza amb IN/OUT via `Timeline.zoomToSelection()` (`setWorkAreaIn/OutPoint`): amb `Timeline.out` sol el TC de captura podia quedar fora de l'àrea de treball. (3) Amb la seqüència sense Out (`out0 = 0`) el `finally` cridava `Timeline.out(0)`, que FIXA el corxet a 0 (pitjor que no tocar-lo), i la guarda d'ampliació (`out0 > 0 && out0 < needOut`) NO cobria el cas `0`/`NaN`. (4) `waitFile` només mirava l'EXISTÈNCIA del PNG → un fitxer VELL del mateix nom passava la comprovació i es publicava com si fóra la portada nova.

**SOLUCIO**: (1) `js/workflows/flow_render.js` (`runPortada`) — àtoms del pont corregits (`Timeline.in`/`Timeline.out`); `in0` (`Timeline.getIn()`) i `outRestore` (0 = la seqüència no tenia Out) guardats ABANS de tocar res; guarda d'ampliació reescrita (`!(out0 >= needOut - 0.02)`) amb comprovació del valor REAL de l'Out (`Timeline.getOut()`); `Timeline.zoomToSelection()` SEMPRE abans de capturar (marca `waSynced`, mou el CTI a l'IN i la captura el torna a fixar a 6a amb `seekCti` verificat); GUARDA DE RANG a 6a — si la lectura PROVA que l'Out no cobreix `tcCap` el flux s'atura amb error, i si la lectura no és concloent (0/NaN) avisa i continua, perquè deixar l'usuari sense portada quan no hi ha cap prova de fallada seria pitjor; `finally` amb RESTAURACIÓ VERIFICADA (`Timeline.out(outRestore)` + `Timeline.range(in0, outRestore)` + `zoomToSelection()`, amb avís si l'Out no torna al valor original) i, si `outRestore === 0`, es deixa el rang a `[in0, maxEnd]` enlloc de fixar l'Out a 0; el PNG anterior del mateix nom s'ESBORRA abans d'exportar (`cep.fs.stat` + `utils.deleteFile` amb reintent) i si no es pot esborrar el flux s'atura. (2) `js/workflows/flow_chyrons.js` — el congelat de cobertura amplia amb `Timeline.out` i MAI es deixa l'Out a 0 (`outRestore === 0` → no es crida `Timeline.out(0)`); `flow_cut.js` i `flow_graphics.js` amb els mateixos àtoms. (3) `js/main.js` + `style.css` — estat OCUPAT del botó de portada: `markBtnBusy(btn,'⏳')`/`clearBtnBusy(btn)` (desactivat + `.btn-busy` amb `@keyframes fpBtnBusyPulse`, etiqueta original al `dataset` i restaurada al `finally`). (4) `index.html` — cache-busts `flow_render.js?v=33`, `flow_chyrons.js?v=80`, `flow_cut.js?v=19`, `flow_graphics.js?v=26`, `main.js?v=82`, `style.css?v=61`. (5) `jsx/main.jsx` — exposat l'àtom que faltava al pont (`Render.exportRange`, vegeu #173).

**FITXERS**: `js/workflows/flow_render.js`, `js/workflows/flow_chyrons.js`, `js/workflows/flow_cut.js`, `js/workflows/flow_graphics.js`, `jsx/main.jsx`, `js/main.js`, `style.css`, `index.html`, `bin/smoke/fp_probe_portada.js` (nou), `bin/smoke/fp_smoke_build.ps1`, `bin/smoke/fp_smoke_runner.js`

**VALIDACIO**: `bin/check_js_v8.ps1`: TOTAL 58 | OK 58 | FAIL 0 · `bin/check_dead.ps1`: CODI MUERT 0 orfes (i cap fitxer de `js/` o `jsx/` sense carregador) · `bin/smoke/fp_smoke_build.ps1`: **PASS 224 FAIL 0** (secció nova `19-portada`, 22 assercions: contracte del pont sobre els fitxers REALS del repo —60/60 lectures, 12 espais i 540 crides `callJSX` revisades— i MOTOR REAL `Chyrons._capturePng` amb un MODEL de la seqüència al pont: ampliació amb `Timeline.out`, TC de captura EXACTE via QE, restauració de l'Out i cas Out ABSENT) · **pendent el test a Premiere** (cal RECARREGAR el panell pel cache-bust v33/v80/v26/v19/v82/v61).

**NOTA**: El símptoma «portada d'un altre frame» tenia QUATRE causes sumables i cap d'elles donava error visible: l'`EvalScript error` empassat pel pont, l'àrea de treball sense sincronitzar, l'Out fixat a 0 al `finally` i el PNG vell que passava la comprovació d'existència. La guarda de rang NO ha d'impedir la captura quan la lectura no és concloent: el mal resultat ha de ser sempre preferible a no tindre portada.

### #173 - resolt (2026-10-16)

**SIMPTOMA**: `Render` de vídeo — `flow_render.runVideo` retallava el timeline SEMPRE a l'Out de la seqüència: amb una ÀREA DE TREBALL marcada (i sense IN/OUT) l'exportació ignorava l'àrea de treball.

**CAUSA ARREL**: BRETXA DE PONT — `Render.exportRange()` està implementat a `jsx/modules/9_Render.jsx` (l'ÚNIC àtom que llig l'àrea de treball, amb `getWorkAreaOutPointAsTime`) però NO estava exposat a `$.global.Espai` de `jsx/main.jsx` → `EvalScript error` empassat per `callJSX` com a `'ERR:...'` → el `try` del flux queia SEMPRE al fallback `Timeline.getOut()`. Mateixa classe de defecte que el `Timeline.outPoint` del #172: la funció existeix al MÒDUL i NO al PONT, i el pont no avisa.

**SOLUCIO**: (1) `jsx/main.jsx` — àtom nou `exportRange` (`FASTPASS.Render.exportRange()`, amb el comentari del perquè). (2) AUDITORIA del contracte: es revisen les 540 crides `callJSX` de `js/` contra la taula del pont; l'única bretxa era aquesta (`Clips.placeSrtOnExistingSubtitleTrack` va eixir com a FALS POSITIU: es crida directament amb `FASTPASS.Clips.*`, sense pont). (3) GUARDA NOVA: `bin/smoke/fp_probe_portada.js` part A escaneja els fitxers REALS de `js/` (llegits amb `fetch('file:///…')`, el build afig `--allow-file-access-from-files`) i comprova cada `Espai.metode(` escrit dins d'una crida `callJSX` contra el bloc `$.global.Espai` de `main.jsx`; `bin/smoke/fp_smoke_build.ps1` injecta el manifest `window.__TEXT_FILES` + `window.__REPO` (js/ + jsx/ + `index.html` + `style.css`) i `bin/smoke/fp_smoke_runner.js` puja el timeout a 20 s (el bundle amb els fitxers del repo dins és més gran).

**FITXERS**: `jsx/main.jsx`, `bin/smoke/fp_probe_portada.js` (nou), `bin/smoke/fp_smoke_build.ps1`, `bin/smoke/fp_smoke_runner.js`

**VALIDACIO**: `bin/smoke/fp_smoke_build.ps1`: **PASS 224 FAIL 0** — assercions «cap crida `callJSX` a un mètode INEXISTENT del pont (540 crides revisades)» i «el pont exposa els àtoms que el #172 necessitava (`Timeline.out` + `Render.exportRange`)» · pendent el test a Premiere.

**NOTA**: Aquesta prova (part A) hauria caçat els DOS defectes el primer dia. Regla per al futur: si s'afig un mètode nou a un mòdul `jsx/`, cal exposar-lo també a `main.jsx`, o la crida fallarà EN SILENCI (`callJSX` retorna `'ERR:...'` i el flux cau al seu fallback com si el mètode no existira).

## 3. Bugs en curs / pendents



| ID | Estat | Data | Simptoma |
|----|-------|------|----------|
| `#111` | investigating | 2026-09-29 | Els ítems d'escaleta FLOTANTS (`flotant:true`) no reben cap marcador; segons la regla de l'usuari haurien de portar marcador VERMELL (cas real `03` «+++ IPD MEDIACIÓ MARI [...] |
| `#113` | fet_parcial | 2026-09-30 | ARRENCADA LENTA (14,1 s) a la primera obertura del dia: el 99% del temps és NAS fred dins de checkContext, amb treball duplicat i un scan innecessari |
| `#116` | notejada_pendent | 2026-09-30 | MARCADOR VERMELL DE CUA (TNC V2, 131,64 s · 2a passada 131,52 s) que no hauria d'existir: el filtre de vermells el descarta correctament i tot seguit la vàlvula de segure [...] |
| `#117` | notejada_pendent | 2026-09-30 | SEMÀFORS del cas SENSE projecte trencats per un ReferenceError: 'mediaN is not defined' a checkContext → quan l'escaleta porta mediaStop+blockOut es perden els semàfors S [...] |
| `#152` | implementat_pendent_test | 2026-10-13 | El JSON d'anàlisi del bloc (analisis_estructura/DD_MM_PROG_BLOC.json: ítems del bloc + ítems de CONTEXT prevVideoItem/nextVideoItem + trimBounds + fases crudo/cocinado/us [...] |
| `#153` | pendent_implementacio | 2026-10-13 | Unificar el JSON d'anàlisi del bloc (analisis_estructura/DD_MM_PROG_BLOC.json) en una sola peça amb 4 blocs: (1) BLOC — prog/bloc/data/escaletaFile/seqName/projectFile +  [...] |

