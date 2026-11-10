/**
 * ============================================================================
 * 11_Configuracio.js — Motor de Configuració Dinàmica (CONSOLIDAT v3.0.0)
 * ============================================================================
 * Fusió de config.js + 11_Configuracio.js.
 * Tracks per defecte alineats amb Profile.json.
 * IDs de programa = NOM VISIBLE del desplegable (2026-10-21: "TN Comarques",
 * "TN Migdia", "TN Vespre"). L'`id` es la clau de `mapeoProgramas` i el
 * `textContent` de cada opcio; `archivo`/`wott`/`dir` son els que fan noms de
 * carpeta i crides (NO tocar-los per canviar l'etiqueta).
 * init() usa Utils.callJSX (disponible abans de carregar Eines).
 * ============================================================================
 */

(function () {
    var FASTPASS_UI = window.FASTPASS_UI || {};

    // Per defecte, si no hi ha Profile.json, usem aquests fallbacks
    // Tracks alineats amb Profile.json (2026-09-22, remapatge per evitar col·lisions):
    //   v_mp4:1 · v_mascara:2 (MÀSCARA · PROTEGIDA · #126) · v_fondos:3 · v_graf:4
    //   · v_graficos:5 · v_tema:6 · v_chyrons:7 · v_lloc:8
    // 🎯 TITOLET (2026-10-06 · 3a passada) — detecció del grafisme cremat (rètol mosquit)
    // al MP4 cleanFeed. Receta: màscara de color #F25F13 ±25 sobre una ROI a la part
    // baixa del frame, cobertura mínima, agrupació d'intervals per gap, ESCANEIG
    // ENDAVANT per trams i OCR (bin\ocr.ps1 → Windows.Media.Ocr, tots els idiomes en
    // una execució) per saber QUIN wott és a cada interval, amb match difús contra el
    // nom del wott. NO és cap traça de Profile.json (Profile.json no es llegeix enlloc):
    // `Config.get()` ho exposa amb aquests valors.
    //
    // 🔴 Valors RE-MESURATS al log real (TNM V1 2026-10-05, ítem 16, 12 TITOLET):
    //   · seek d'entrada a ffmpeg: 2,66→0,33 s (t=27,76) i 12,93→0,25 s (t=160,76) amb
    //     el MATEIX frame (md5 idèntic) → 33 captures: 311 s → ~10 s.
    //   · 1 captura per interval (al frame de més cobertura) + reintents ≤3 cap endavant.
    //   · minOff/gapMergeSec baixats: amb 1,0 + 2,0 dos rètols CONSECUTIUS es fusionaven
    //     (Ceuta + Maricarmen en un interval de 9 s → un wott sense detecció).
    const TITOLET_DEFAULTS = {
        enabled: true,
        dryRun: false,         // ✅ APLICAR (2026-10-06, 2a passada). Per posar-lo en dry-run
                               //    sense tocar codi: FASTPASS_UI.State.titoletDryRun = true
                               //    a la consola del panell.
        // 🎯 CONDICIÓ DE DISPARO del rastreig (2026-10-08 · TNM V3 + TOTS els grafismes cremats)
        // Rols de wott que fan saltar la DETECCIÓ del grafisme cremat (màscara de color +
        // OCR) i la col·locació al SEU instant real. El rastreig NO es fa mai «per si de cas»:
        // només quan l'ítem porta wotts d'algun d'aquests rols.
        //
        // 🔴 27 ETIQUETES del sistema de ròtols, LITERALS (el sistema les genera
        //    automàticament al nom: `..._<wottId>_<ETIQUETA>_...`). El matx és d'IGUALTAT,
        //    no de prefix: `DADA` a seques NO dispara res, cal l'etiqueta sencera
        //    (`DADA-GRAN`). Única tolerància: majúscules/minúscules i l'estil del separador
        //    (`DADA-GRAN` ≡ `Dada_Gran` ≡ `DADA GRAN`), perquè el sistema no l'escriu sempre
        //    igual (`Tema-Titol`, `Nomcarrec`, `Enviat_Sí`, `Directe_PRESENCIAL`…).
        //      TITOLET · TITOLET GRAN · PREGUNTA · CARTELL · CIS_CEO · CIS_CEO_COMPARADA ·
        //      CRONOLOGIA · CRONOLOGIA-TITOLS · DADA_COMPARADA · DADA-DIFERENCIAL · DADA-GRAN ·
        //      DADA-GRAN-DIVISA · DADA-ITEM · DESTACAT · CLASSI-CHAMPIONS · CLASSIFICACIO ·
        //      CLASSI-MUNDIAL · CLASSI-PRIMERA · CLASSI-SEGONA · GRAFICA-BARRES ·
        //      GRAFICA_CIRCULAR · IMATGE-CAPTURA · LLISTA · LLISTA-DADES · NOTA · PROGRAMACIO ·
        //      RANQUING
        //    Afegir un tipus nou = afegir-ne l'etiqueta aquí (1 línia, cap JSX nou).
        //
        // ⚠️ El matx es fa NOMÉS contra el ROL: `chy.rol` i els trossos de ROL del nom
        //    (`name.split('_')` des de l'índex 7, la part que llegeix `13_Parse.meta`; MAI la
        //    part del TEXT, índex 5) — si no, un rètol que digués «LES DADES DEL PARO»
        //    dispararia la família DADA. Com que hi ha etiquetes amb `_` a dins, el nom les
        //    parteix en trossos i `_burnedGrafTokens` en reuneix fins a 3 per reconstruir-les.
        //    Noms reals: Wott_TNM_V1_16_00.00_SÁNCHEZ ELS NOMS D'UNA LEGISL_625359_TITOLET_in_setembre 2024_Pablo.00625919.mov
        //                Wott_MAT_v5_513_00.01_dona pas Barcelona_631037_Nomcarrec_Elisabet Viladomiu_directora Fun.00631331.mov
        detectRoles: [
            'TITOLET', 'TITOLET GRAN', 'PREGUNTA', 'CARTELL',
            'CIS_CEO', 'CIS_CEO_COMPARADA', 'CRONOLOGIA', 'CRONOLOGIA-TITOLS',
            'DADA_COMPARADA', 'DADA-DIFERENCIAL', 'DADA-GRAN', 'DADA-GRAN-DIVISA', 'DADA-ITEM',
            'DESTACAT', 'CLASSI-CHAMPIONS', 'CLASSIFICACIO', 'CLASSI-MUNDIAL',
            'CLASSI-PRIMERA', 'CLASSI-SEGONA', 'GRAFICA-BARRES', 'GRAFICA_CIRCULAR',
            'IMATGE-CAPTURA', 'LLISTA', 'LLISTA-DADES', 'NOTA', 'PROGRAMACIO', 'RANQUING'
        ],
        roiY: [0.60, 0.85],    // ROI vertical (fracció de l'alçada); X = tot l'ample
        ocrRoiX: [0, 0.45],    // ROI X només per a la CAPTURA d'OCR: el rètol viu a l'esquerra
                               //    i a la dreta hi ha grafisme aliè (MESURAT: l'OCR llegia
                               //    «338 TELEMÁTICOS: 12» del panell de votacions del fons)
        color: '#F25F13',      // taronja del rètol TITOLET
        tol: 25,               // tolerància per canal RGB (0-255)
        minCov: 2.0,           // cobertura mínima del ROI (%) per dir «rètol visible»
        maxCov: 60,            // cobertura (%) a partir de la qual el ROI és FONS, no text
        edgeAxes: 'y',         // quines vores desqualifiquen: 'y' (dalt/baix) · 'xy' · 'none'
        minEdgeFrac: 0.04,     // marge (fracció del ROI) per dir «toca la vora»
        // 🎯 ROI PER ETIQUETA (2026-10-08, 7a passada) — el cas: els 6 PREGUNTA de TNM V3 no
        // es van detectar (0 intervals: el rètol no viu a la banda mesurada del TITOLET).
        // `roiPerRole` dóna a CADA etiqueta la SEVA zona de rastreig; `roiDefault` és el
        // comodí de les que encara no s'han mesurat (avui 26 de 27).
        //   · Un ítem es rastreja amb la recepta de les seves etiquetes. Si en porta de
        //     receptes DIFERENTS, es fa UNA passada d'ffmpeg per recepta i cada interval
        //     només pot assignar-se els wotts del SEU grup (`roleGroups` + `ivGroups`).
        //   · Claus vàlides per recepta: roiX · roiY · edgeAxes · color · tol · minCov ·
        //     maxCov · minEdgeFrac · ocrRoiX · roiW · roiH (les que no hi siguin manen del
        //     nivell base; `roiW`/`roiH` són la graella de mostreig del ROI — 160×45 per
        //     defecte, pensada per a la banda del TITOLET: una ROI gairebé quadrada amb
        //     aquesta graella s'aixafaria i el color es desdibuixaria amb el fons).
        //   · `roiX: null` = tot l'ample (com abans). `roiY`/`roiX` en fracció de la imatge.
        //   · ⚠️ `edgeAxes` i els llindars de cobertura es refereixen a la ROI: si s'eixampla
        //     la zona, la MATEIXA xinxeta baixa de cobertura (l'àrea creix) i la vora perd
        //     valor de filtre → cada recepta ampla porta els seus llindars.
        roiPerRole: {
            // TITOLET: MESURAT (2026-10-06, roi_real.raw): xinxeta taronja a la banda baixa
            // de l'esquerra, ancorada a x=0 → la vora X no pot desqualificar (només la Y).
            // 🎨 (2026-10-14) DUES ZONES, MATEIX COLOR: el rètol TITOLET NO viu sempre a la
            // banda baixa. MESURAT al TNC V1 del 2026-10-14 (TNC_V1_CLIP.mp4, 1920x1080,
            // 6 TITOLET): la xinxeta de TN COMARQUES està a y 0,367-0,578 (banda MITJANA,
            // x 0-0,5) → amb la ROI [0.60,0.85] donava 0 intervals i la cadena queia al
            // fallback de cadència (6 targetes encadenades a ~9 s en comptes del seu instant).
            // Una sola ROI ampla NO serveix: amb y[0.30,0.85] el taronja d'imatge del mateix
            // clip (una lona a y 0,356-0,722, 8,13 % del frame) queda DINS la ROI i no en
            // toca les vores → 1 interval FALS (mesurat: 7 en comptes de 6). Amb DUES facetes
            // cada zona té LA SEVA guarda de vora i el taronja d'imatge el descarten les dues
            // (la lona travessa les dues zones de dalt a baix).
            // MESURAT amb el clip real (2 fps, 160x45, hull y 0,32-0,85, guarda 'y'):
            // 6/6 rètols detectats (56,7/75,7/91,7/108,7/122,7/136,2 s del clip) i 0 falsos.
            'TITOLET': { roiX: null, roiY: [0.60, 0.85], edgeAxes: 'y',
                facets: [
                    { color: '#F25F13', tol: 25 },                    // baixa: TNM/TNV (mesurat 2026-10-05)
                    { color: '#F25F13', tol: 25, roiY: [0.32, 0.62] } // mitjana: TNC (mesurat 2026-10-14)
                ] },

            // ── DETECTORS PER FAMÍLIA (2026-10-09) ──────────────────────────────────────
            // MESURAT als PNG de `...\PROVES\GRAFISMES INTEGRATS` i al clip TNM_V3 (235
            // mostres @1 fps). Taules completes: C:\temp\fp\GRAFISMES_ANALISI.md
            //  · Color CREMAT al vídeo (≠ PNG per la correcció d'espai de color, 1-3
            //    unitats/canal): taronja #F35E13 · cos de files #393939 · text #FCFCFC.
            //    Els PNG porten #F46115 / #3A3A3A. ±25 cobreix tots dos.
            //  · GRIS CLAR de referència (plaques de fons) = #DCDCDC. MESURAT al vídeo el
            //    2026-10-09 (TNM_V2 t=67 s, placa plana al 100,00 % —un sol color, 460.800 px—
            //    i ESTABLE a t=66,5/67/67,5/68). Als PNG és #DBDADA → ±25 cobreix tots dos.
            //  · 🎨 MULTI-COLOR per etiqueta (2026-10-09): una recepta pot declarar `facets`
            //    = LLISTA de colors, CADA UN amb la seva ZONA (`roiX`/`roiY` propis en fracció
            //    de frame; si no en declara, la de la recepta) i els seus llindars. Un frame és
            //    ON si ALGUNA faceta hi passa. L'escaneig és UNA sola passada: s'extreu el
            //    rectangle que engloba totes les zones i cada color només compta dins la seva.
            //    Vegeu `17_TitoletDetect_Logic._frameSummary` / `_facetRect`.
            //  · 🔴 El color sol NO discrimina: una manifestació (banderes UGT/CCOO, xalecos,
            //    pancarta) dona 13-16 % de taronja a la banda esquerra — MÉS que un grafisme
            //    real (DADA-DIFERENCIAL 0,7 %). Baixar la tolerància a ±4 no ho arregla.
            //    El filtre que salva és la GUARDA DE VORA (`edgeAxes:'y'`): el taronja de
            //    vídeo omple la banda de dalt a baix (y1=1,000) i es descarta. MESURAT:
            //    edge 'y' + minCov 1,2-3,0 → 7 intervals ON i 0 falsos en 235 frames;
            //    edge 'none' → 3-4 intervals falsos. NO posar 'none' en una capsa ampla.
            //  · `roiY` = capsa on viu la taronja (bbox del PNG + marge) i NO ha de tocar
            //    les vores (minEdgeFrac 0,04): el CARTELL (taronja y 0,214-0,884) necessita
            //    y[0.15,0.95] o el detector el prendria per fons.
            //  · `roiW`/`roiH` = graella de mostreig ≈ 10 px per cel·la a 1080p (una cel·la
            //    més grossa que el detall el dilueix amb el fons i surt de tolerància).
            //
            // LLISTA / LLISTA-DADES (placa de files; la fila ACTIVA és la taronja)
            //   alpha x[0,0.358] / [0,0.400] · y[0.248,0.764] · taronja y[0.695,0.764] →
            //   2,12 % / 2,61 % de frame = 9,6 % / 11,8 % de la capsa (minCov 2,5 → 3,8×/4,7×)
            //   🎨 2 COLORS: la fila taronja (com fins ara) O la PLACA gris clar. La placa
            //   ocupa TOTA la capsa → la faceta no hi declara zona pròpia (hereta la de la
            //   recepta). `edgeAxes:'none'` perquè la placa SÍ que toca les vores de la capsa
            //   (amb 'y' es descartaria ella mateixa) i `maxCov 97` perquè una placa porta
            //   files i text a dins (no és plana al 100 %) mentre que un fons de gris que
            //   ompli la capsa sencera SÍ que ho és.
            //   ⚠️ `minCov 30` és PROVISIONAL: MESURAT en un pla SENSE grafisme (TNM_V2
            //   t=67 s) el gris de fons arriba a 5,1 % aquí (13,5 % a la ROI comodí) → 30 hi
            //   deixa ~6× de marge, però PENDENT DE VALIDAR amb un clip amb LLISTA real.
            'LLISTA': { roiX: [0, 0.41], roiY: [0.24, 0.78], edgeAxes: 'y',
                color: '#F35E13', tol: 25, minCov: 2.5, maxCov: 45, roiW: 79, roiH: 58,
                facets: [
                    { color: '#F35E13', tol: 25 },
                    { color: '#DCDCDC', tol: 25, minCov: 30, maxCov: 97, edgeAxes: 'none' }
                ] },
            'LLISTA-DADES': { roiX: [0, 0.41], roiY: [0.24, 0.78], edgeAxes: 'y',
                color: '#F35E13', tol: 25, minCov: 2.5, maxCov: 45, roiW: 79, roiH: 58,
                facets: [
                    { color: '#F35E13', tol: 25 },
                    { color: '#DCDCDC', tol: 25, minCov: 30, maxCov: 97, edgeAxes: 'none' }
                ] },
            // RANQUING (la 1a fila és la taronja) · alpha x[0,0.461] y[0.317,0.693] ·
            //   taronja x[0,0.460] y[0.409,0.477] → 2,94 % de frame = 16,0 % de la capsa (6,4×)
            //   🎨 2 COLORS: fila taronja O placa gris clar (mateixos criteris que LLISTA;
            //   el gris de fons mesurat aquí és 8,6 % → 30 deixa 3,5× de marge).
            'RANQUING': { roiX: [0, 0.47], roiY: [0.31, 0.70], edgeAxes: 'y',
                color: '#F35E13', tol: 25, minCov: 2.5, maxCov: 45, roiW: 90, roiH: 42,
                facets: [
                    { color: '#F35E13', tol: 25 },
                    { color: '#DCDCDC', tol: 25, minCov: 30, maxCov: 97, edgeAxes: 'none' }
                ] },
            // DADA-ITEM (la fila taronja va al mig, entre la capçalera i la fila fosca) ·
            //   alpha x[0,0.334] y[0.374,0.723] · taronja x[0,0.333] y[0.473,0.598] →
            //   3,74 % de frame = 28,2 % de la capsa (9,4×)
            //   🎨 2 COLORS: fila taronja O placa gris clar (gris de fons mesurat aquí: 5,3 %).
            'DADA-ITEM': { roiX: [0, 0.35], roiY: [0.36, 0.74], edgeAxes: 'y',
                color: '#F35E13', tol: 25, minCov: 3.0, maxCov: 45, roiW: 67, roiH: 41,
                facets: [
                    { color: '#F35E13', tol: 25 },
                    { color: '#DCDCDC', tol: 25, minCov: 30, maxCov: 97, edgeAxes: 'none' }
                ] }
        },
        // Comodí per a les etiquetes sense mesurar: MITJA IMATGE ESQUERRA, que és on apunta
        // ja la finestra d'OCR (`ocrRoiX`) i on viuen els rètols d'aquest sistema. La franja
        // de dalt (mosquit de cadena/sumari) queda FORA; la vora no filtra res (en una ROI
        // gran tota taca toca la vora) i els llindars s'ajusten a l'àrea nova: una xinxeta
        // que omplia el 17-27% de la banda del TITOLET aquí baixa a ~9-14% (l'àrea es
        // multiplica per ~1,8), així que `minCov` baixa per no perdre res i `maxCov` puja
        // perquè un cartell a pantalla completa no es prengui per fons.
        roiDefault: {
            roiX: [0, 0.5], roiY: [0.10, 0.98], edgeAxes: 'none', minCov: 1.2, maxCov: 90,
            // Graella de mostreig adaptada a la ROI: és gairebé quadrada (0,5 × 0,88 de la
            // imatge ≈ 960×950 px a 1080p). Amb la graella del TITOLET (160×45) el `crop`+
            // `scale` (flags=area) l'aixafaria 21× en vertical i el color de la xinxeta es
            // desdibuixaria amb el fons → fora de tolerància. 96×96 ≈ 10×10 px per cel·la.
            roiW: 96, roiH: 96
        },
        // TC DEL NOM (2026-10-08): ABANS d'escanejar el MP4, mira si el nom del wott ja porta
        // l'instant d'emissió (`13_Parse.meta` → `parts[4]`, format MM.SS o HH.MM).
        // ⚠️ Als rètols d'aquesta família el camp sol ser `00.00` (inservible: mesurat al nom
        // real `Wott_TNM_V3_18_00.00_COM QUEDA EL DECRET D'HABITATG_630060_PREGUNTA_in_…`),
        // així que el pre-chequeig és CONSERVADOR: només l'accepta si ≥ `tcMinSec`, cau dins
        // de l'ítem i no és el MATEIX valor a tots els wott. Si no, es detecta com sempre.
        // Vegeu `flow_chyrons._titoletTcFromName`.
        tcFromName: true,
        tcMinSec: 0.5,         // segon mínim creïble d'un TC del nom (0.00 → descartat)
        scanFps: 2,            // 🔴 2 mostres/s (abans 1): a 1 fps la durada tenia ±1 s d'error
        fps: 25,               // fps del material (frames ↔ segons)
        minOn: 0.4,            // durada mínima d'un interval (s)
        minFrames: 2,          // mostres ON mínimes per acceptar un interval (1 = soroll)
        minOff: 0.3,           // 🔴 buit mínim per separar intervals (abans 1,0)
        gapMergeSec: 0.6,      // 🔴 fusiona buits < això (abans 2,0: fusionava rètols seguits)
        scanChunkSec: 45,      // 🔴 trams de l'escaneig endavant (el cursor només avança)
        longOnSec: 5.0,        // onAir > 5 s (= durada de la targeta) → cadència actual
        minTailSec: 0.5,       // (LEGACY · 2026-10-06 5a passada) JA NO s'usa a la cadena
                               //    TITOLET: la part viva és el clip SENCER i el congelat
                               //    només cobreix fins al final detectat. Es conserva la clau
                               //    per no invalidar configs desades.
        ocr: true,             // WHICH per OCR (els accents poden fallar: match difús)
        ocrLangs: ['es-ES', 'en-US'],   // tots en UNA execució de bin\ocr.ps1 (-Langs)
        ocrTries: 3,           // intents d'OCR per interval (1r = frame de més cobertura)
        ocrRetryStepSec: 0.75, // pas cap ENDAVANT entre intents (mai enrere)
        ocrFuzz: 0.55,         // similitud mínima text OCR ↔ nom del wott (0-1)
        cache: true,           // desa el pla a C:\temp\titolet_plan_<hash>.json
        snapTolSec: 1.0,       // col·locació: si l'instant detectat cau a ≤ això del TALL
                               //    anterior de V1, el TITOLET entra EXACTAMENT a l'inici
                               //    d'aquell clip (l'«imant»). 🔴 (5a passada, 2026-10-06)
                               //    Abans s'hi sumaven 10 frames (OFF = 0,40 s) → la targeta
                               //    entrava 0,4 s tard i l'«imant» no s'hi veia.
        ocrWeak: 0.7,          // match FEBLE: per sota d'això, si el text de l'interval ja és
                               //    (millor) d'un ALTRE wott, la parella es REBUTJA. Cas real
                               //    (TNM V1 ítem 16, 06/10): l'interval de relIn 111 s deia
                               //    «jung 2025 LEIRE DÍEZ» (d'un altre wott, score 0,889) i el
                               //    wott orfe «maig 2026 José Luis» (ZAPATERO) s'hi va
                               //    emparellar amb 0,556 → col·locat 10,5 s abans del seu lloc.
        refineEntry: true,     // refina l'ENTRADA de cada interval USAT amb un escaneig FI al
                               //    voltant de `tIn` → ±3 frames en comptes de fins a 12
                               //    (l'escaneig general va a 2 mostres/s = pas 0,5 s, i el 1r
                               //    mostreig ON sempre va tard: «uns frames de retraso»)
        refineFps: 8,          // mostres/s de l'escaneig fi de l'entrada (pas 0,125 s)
        freezeGrabFrac: 0.6,   // instant del frame congelat = 60 % del clip quan la part viva
                               //    és el clip SENCER: al final hi ha l'animació de sortida i
                               //    el PNG quedaria buit (congelat invisible)
        cardTrimFrames: 5,     // 🔴 (2026-10-06, 6a passada · MESURAT per l'usuari) La targeta
                               //    TITOLET deia 5 frames MÉS que el rètol cremat a l'aire: aquests
                               //    5 frames es retallen del FINAL (total i part viva) i el
                               //    congelat hi entra 5 frames ABANS → l'enllaç vídeo viu →
                               //    congelat queda SENSE buit. 0 = comportament antic.
        freezeMaxSec: 15,      // topall del congelat (seguretat): mai més de 15 s de frame
                               //    congelat, encara que la detecció digui que va durar més
        liveHoldBackSec: 1.0,  // 🔴 (2026-10-14 · petició d'usuari) La part VIVA de la targeta
                               //    (l'inserit del wott) MAI pot ser més llarga que el mèdia
                               //    real. La durada del wott pot ser una ESTIMACIÓ (mida de
                               //    fitxer ÷ bitrate quan el bin no en té la durada del DOM) i
                               //    si s'estira més enllà del mèdia, `Clips.endAt` no allarga
                               //    res: el clip s'acaba ABANS i queda un BUIT fins al congelat.
                               //    Marge de seguretat = 1 s: es retalla del FINAL de la part
                               //    viva (el congelat, que és un PNG elàstic, hi entra abans →
                               //    l'enllaç queda SENSE buit). Grafisme complet a l'aire fins
                               //    al final detectat, només s'estalvia l'últim segon
                               //    d'animació (el frame congelat ja és el grafisme format:
                               //    `freezeGrabFrac` = 60 % del clip). 0 = comportament antic.
        // ♻️ (2026-11-10 · BUG #256, 2a i 3a part) CONGELAT REUTILITZAT. El frame que es congela
        // és el MATEIX a tot el bloc i entre blocs del mateix programa, però abans cada
        // congelat feia el seu export (QE) + import (un PNG duplicat al bin CHY): «congelamos
        // dos archivos diferentes pero el contenido es el mismo exactamente … que se
        // reaproveche el png importado»; i, al dia següent, «Se han generado 3 congelados. Y
        // los 3 son iguales … El freeze del Tema-Titol es lo mismo que el freeze titulillo».
        // Amb `true`, el PNG s'exporta i s'importa UNA sola volta i el reaprofiten les DOS
        // vies (`_freezeTitulilloStill` i `_freezeTemaTitol`), en memòria o del bin CHY d'una
        // corrida anterior (la clau és el CONTINGUT del grafisme, `Wott_<PROG>_<vN>_…`).
        // `false` = capturar sempre.
        reuseFreeze: true,
    };

    // 🎬 TEMA-TÍTOL · SORTIDA i TRANSICIONS (2026-10-07)
    // El Wott del Tema-Títol ja porta al FINAL del seu mèdia la seva pròpia animació de
    // sortida («desaparició del títol petit»), MESURADA per l'usuari: 10:00→10:06 (6 frames
    // @25fps). És exactament el que abans es fabricava invertint el titulillo amb ffmpeg
    // (`_REV.mov`). Ara s'aprofita AQUELLA peça: es retalla el mateix ítem (JA al projecte) i es
    // col·loca on toca → zero ffmpeg, zero import, zero _REV.mov.
    const TEMATTOL_EXIT_DEFAULTS = {
        enabled: true,          // false → comportament antic (revers ffmpeg del titulillo)
        atSec: 10.0,            // IN del mèdia on arrenca la desaparició (10:00)
        durSec: 0.24,           // durada de la peça (10:06 − 10:00 = 6 frames @25fps)
        useReverseFallback: true // si la peça no es pot col·locar → revers ffmpeg (xarxa)
    };

    // 🗣️ TRADUCCIÓ (2026-10-12) — col·locació dels rètols de traducció (TRAD/COLOCAR i
    // REPARTIR). L'espai assignat a una traducció (el seu «slot») pot ser MÉS LLARG que la
    // durada del seu mèdia: col·locar-la sencera amb `Clips.endAt` l'estirava més enllà del
    // mèdia i la cua quedava BUIDA (clip al timeline, sense imatge). Ara la cua s'omple amb
    // el CONGELAT del darrer frame del propi clip — la MATEIXA mecànica del Tema-Títol
    // (`_freezeTemaTitol`: clip temporal a la zona lliure del final del timeline + captura +
    // PNG estirat). Zero JSX nou.
    const TRADUCCIO_DEFAULTS = {
        freezeTail: true,      // false → comportament antic (estirar el clip més enllà del mèdia)
        freezeMinSec: 0.12,    // cua mínima (s) que val la pena congelar: per sota d'això es deixa
                               //    estirat (3 frames a 25 fps: inapreciable)
        freezeGrabFrac: 0.6,   // instant del frame congelat (fracció del clip): amb el clip SENCER
                               //    com a part viva, el darrer frame pot ser l'animació de sortida
                               //    (congelat invisible) → 60 % = estat estable del rètol
        // (2026-11-06) Durada MÍNIMA per traducció col·locada. Si el clip de V1 de
        // referència és tan curt que el repartiment deixa cada rètol per sota d'això,
        // l'OUT del grup passa al SEGÜENT cort de V1 (i al següent, si encara no hi
        // cap): detecció casolana del cas «la traducció anava a 2 clips de referència
        // i el tall intermedi la partia». 0 = comportament antic (mai estendre).
        minSlotSec: 2
    };

    let _activeConfig = {
        general: { autor: "AGUS", guarda: 22, debug: false, handles: 20, tcOffset: 0, clipInOffset: 10, zonaInOffset: 10, srtEmergencyTailSec: 120, snapWindowDeducedSec: 2.5, snapWindowFaroSec: 2.5, clipOutMarginSec: 0, clipExtraTailSec: 60, srtEditMarginLeftSec: 0.4, srtSyntheticGapTolSec: 0.2, srtSyntheticMinDurSec: 0.4, srtSyntheticMaxTrimSec: 0.8, srtSyntheticMaxStretch: 2, srtSyntheticMinPairs: 3, srtGapColorLabel: 7 },
        // Hora d'inici d'emissió de cada programa (font ÚNICA per a tota l'extensió:
        // guardes de temps, peticions a l'API d'escaletes i OFFSET del MP4).
        programStartHours: { TNV: 21.0, TNM: 14.5, TNC: 13.8333, MAT: 7.9167 },
        // 🎯 TITOLET: paràmetres de detecció del grafisme cremat (vegeu TITOLET_DEFAULTS).
        titolet: TITOLET_DEFAULTS,
        // 🎬 TEMA-TÍTOL: peça de desaparició del propi Wott (vegeu TEMATTOL_EXIT_DEFAULTS).
        temaTitolExit: TEMATTOL_EXIT_DEFAULTS,
        // 🗣️ TRADUCCIÓ: congelat de la cua quan el slot és més llarg que el mèdia
        // (vegeu TRADUCCIO_DEFAULTS).
        traduccio: TRADUCCIO_DEFAULTS,
        rutas: {
            plantilla: "\\\\nas1.ad-ccrtv.local\\informatius\\001 RECURSOS\\XXX Recursos AGUS - NO TOCAR!!!!\\PROJECTE 3CatInfo_NET.prproj",
            conductors: "\\\\DSMEDIA07\\portal324\\PROJECTE 9x16 PREMIERE 2\\CHYRONS CONDUCTORS\\",
            chyrons: "\\\\192.168.147.199\\public\\00_CHYRONS AUTOMATICS\\3CatInfo\\VERTICALITZACIO\\",
            destino_base: "\\\\DSMEDIA07\\portal324\\PROJECTE 9x16 PREMIERE 2\\AAA_PROJECTES PREMIERE VERTICALITZACIO\\PROVES\\",
            portadas: "\\\\public.ad-ccrtv.local\\Public\\VERTICALITZACIO_INFORMATIUS\\AAA_PORTADES",   // 🖼️ (2026-10-09) destí del PNG de portada publicat
            render1: "\\\\public.ad-ccrtv.local\\Public\\VERTICALITZACIO_INFORMATIUS\\EXPORTS PROVISIONALS",   // 📤 (2026-10-09) DESTÍ DIRECTE del render (EXPORTS PROVISIONALS); després es copia a render2
            render2: "\\\\svftpccma\\videos\\MP4_3CATINFO_VERTICAL\\CONVERTITS_1080-1920\\608-1080",
            // (2026-10-21 · F2) RUTES DE TREBALL configurables. Fins ara vivien al
            // codi: `grafismos` a flow_mapa.js i `subtitulos` a srt_editor.js.
            // `projectes` es l'alies de `destino_base` (el garantix normalizeRutas)
            // i `subtitulosSinteticos` es deriva de `subtitulos` si falta.
            // (2026-10-23) FORA les rutes de la carpeta de VERTICALITZACIÓ i les de les
            // escaletes del NAS: ja no es fan servir enlloc.
            projectes: "",            // alies de destino_base (arrel dels blocs)
            grafismos: "",            // ZZZ_GRAFISME (MAPA / grafismes del dia)
            subtitulos: "",           // SRT_MP4_PER_TEMPS_15MINUTS (SRT d'emergencia)
            subtitulosSinteticos: "", // F3.2: SRT sintetics (abans no existia)
            nnews_root_1: "",
            nnews_root_2: ""
        },
        estructuras: {
            "TNs": {
                tracks: {
                    v_mp4:    1,
                    v_mascara: 2,    // (2026-10-01 · #126) V2 = MÀSCARA (zona PROTEGIDA)
                    v_fondos: 3,
                    v_graf:   3,
                    v_graficos: 3,
                    v_tema:   6,
                    v_chyrons: 7,
                    v_lloc:   8,
                    v_trad:   4,
                    v_video1: 4,
                    v_video2: 5,
                    s_s1: 1,
                    s_s2: 2
                },
                programas: [
                    // (2026-10-21) `id` = text del desplegable PROGRAMA. Es lliure
                    // (pot portar espais): nomes ha de ser UNIC dins de `mapeoProgramas`.
                    // Els noms de carpeta surten de `dir` + `archivo` (utils.workFolder).
                    { id: "TN Comarques", archivo: "TN_COMARQUES", wott: "TNC", dir: "02_COMARQUES_PROJECTES", conductor: "Conduct_Nuria Sole Perez.mov" },
                    { id: "TN Migdia",    archivo: "TN_MIGDIA",    wott: "TNM", dir: "03_TN MIGDIA_PROJECTES",  conductor: "Conduct_Xavi Coral Trullas.mov" },
                    { id: "TN Vespre",    archivo: "TN_VESPRE",    wott: "TNV", dir: "04_TN VESPRE_PROJECTES",   conductor: "Conduct_Toni Cruanyes.mov" }
                ]
            },
            "Sumari Matins": {
                tracks: {
                    v_mp4: 1, v_mascara: 2, v_fondos: 3, v_graf: 3, v_graficos: 3, v_tema: 6, v_chyrons: 7, v_lloc: 8, v_video1: 4, v_video2: 5, v_trad: 4,
                    s_s1: 1, s_s2: 2
                },
                programas: [
                    { id: "MATINS", archivo: "MATINS", wott: "MAT", dir: "01_MATINS_PROJECTES", conductor: "Conduct_Ariadna Oltra.mov",
                      // digition crea un rundown per dia feiner: l'ID puja +1/dia
                      // (lun PRO1374 · mar PRO1376 · mie PRO1377). Darrer conegut:
                      // jue 2026-09-17 -> PRO1378. Si l'API diu "no existeix", la
                      // FOTO prova l'estimat i els veins (+1/-1/+2...) automaticament.
                      escaletaId: "PRO1378" }
                ]
            },
            "Fotomató": {
                tracks: {
                    v_mp4: 1, v_mascara: 2, v_fondos: 3, v_graf: 3, v_graficos: 3, v_tema: 6, v_chyrons: 7, v_lloc: 8, v_video1: 4, v_video2: 5, v_trad: 4,
                    s_s1: 1, s_s2: 2
                },
                programas: []
            },
            "User Defined": {
                tracks: {
                    v_mp4: 1, v_mascara: 2, v_fondos: 3, v_graf: 3, v_graficos: 3, v_tema: 6, v_chyrons: 7, v_lloc: 8, v_video1: 4, v_video2: 5, v_trad: 4,
                    s_s1: 1, s_s2: 2
                },
                programas: []
            }
        }
    };

    // ══════════════════════════════════════════════════════════════════════════
    // F2 (2026-10-21) · CARREGA DE Profile.json
    // --------------------------------------------------------------------------
    // FINS ARA `Profile.json` NOMES S'ESCRIVIA (setup.html): `Config.get()`
    // tornava sempre aquest objecte fix, aixi que canviar una ruta a la finestra
    // de configuracio NO tenia CAP efecte (calia editar el .js). Ara:
    //   1) `_defaults` guarda aquest objecte INTACTE (xarxa de seguretat).
    //   2) `_applyProfile(obj)` fong el perfil damunt d'una COPIA dels defaults i
    //      normalitza les rutes (`Logic.Rutas.mergeProfile` / `normalizeRutas`).
    //   3) `_loadProfile()` llig Profile.json amb `cep.fs.readFile` (SINCRON i
    //      sense dependre del motor JSX, que en arrencar encara no hi es) i
    //      l'aplica. S'executa en carregar aquest fitxer i cada volta que
    //      setup.html desa (event FASTPASS_CONFIG_UPDATED).
    // ══════════════════════════════════════════════════════════════════════════
    var _defaults = _activeConfig;
    var _lastProfile = { ok: false, reason: 'not-loaded' };

    function _rutasLogic() {
        try { return (window.FASTPASS_UI.Logic || {}).Rutas || null; } catch (e) { return null; }
    }

    /** _extensionRoot: carpeta de la extensio (sense separador final) o ''. */
    function _extensionRoot() {
        try {
            var U = window.FASTPASS_UI.Utils;
            if (U && U.csInterface && typeof SystemPath !== 'undefined' && SystemPath.EXTENSION) {
                var p1 = U.csInterface.getSystemPath(SystemPath.EXTENSION);
                if (p1) return String(p1).replace(/[\\/]+$/, '');
            }
        } catch (e1) { }
        try {
            if (window.__adobe_cep__ && window.__adobe_cep__.getSystemPath) {
                var p2 = window.__adobe_cep__.getSystemPath('extension');
                if (p2) return String(p2).replace(/[\\/]+$/, '');
            }
        } catch (e2) { }
        return '';
    }

    function _profilePath() {
        var root = _extensionRoot();
        return root ? (root + '\\Profile.json') : '';
    }

    /** _readProfileText: UTF-8 de debò (IO.readTxt llig ANSI → trencaria accents). */
    function _readProfileText(path) {
        try {
            if (window.cep && window.cep.fs && window.cep.fs.readFile) {
                var r = window.cep.fs.readFile(path);
                if (r && r.err === 0 && r.data != null) return String(r.data);
            }
        } catch (e) { }
        return null;
    }

    /**
     * _applyProfile: aplica un objecte de perfil (el de Profile.json o un de
     * prova). SEMPRE parteix dels defaults: llevar una clau del perfil torna al
     * valor de fabrica, i recarregar N voltes no acumula res.
     */
    function _applyProfile(obj) {
        var R = _rutasLogic();
        if (!R) { return (_lastProfile = { ok: false, reason: 'logic-missing' }); }
        try {
            var merged = R.mergeProfile(_defaults, obj || {});
            merged.rutas = R.normalizeRutas(merged.rutas || {});
            _activeConfig = merged;
            return (_lastProfile = { ok: true, rutas: merged.rutas });
        } catch (e) {
            return (_lastProfile = { ok: false, reason: 'merge-error: ' + (e && e.message) });
        }
    }

    function _loadProfile() {
        var path = _profilePath();
        if (!path) return (_lastProfile = { ok: false, reason: 'no-extension-root' });
        var raw = _readProfileText(path);
        if (raw == null) return (_lastProfile = { ok: false, reason: 'unreadable', path: path });
        raw = raw.replace(/^\uFEFF/, '');
        var obj;
        try { obj = JSON.parse(raw); }
        catch (eJ) { return (_lastProfile = { ok: false, reason: 'bad-json', path: path }); }
        var res = _applyProfile(obj);
        res.path = path;
        return res;
    }

    /** _ctxWithDefaults: context de resolucio amb `base` i `autor` de la config. */
    function _ctxWithDefaults(ctx) {
        var c = {};
        var src = ctx || {};
        for (var k in src) { if (Object.prototype.hasOwnProperty.call(src, k)) c[k] = src[k]; }
        if (c.base == null || c.base === '') {
            c.base = _activeConfig.rutas.projectes || _activeConfig.rutas.destino_base || '';
        }
        if (c.autor == null || c.autor === '') c.autor = _activeConfig.general.autor || '';
        return c;
    }

    // Carrega ARA, abans que cap modul use Config.get().
    // (F2) Els DEFAULTS tambe es normalitzen: si Profile.json no es pot llegir, les
    // rutes derivades (escaletes/grafismes/subtitols) existeixen igualment.
    var _R0 = _rutasLogic();
    if (_R0) { _defaults.rutas = _R0.normalizeRutas(_defaults.rutas || {}); }

    var _bootProfile = _loadProfile();
    try {
        console.log('⚙️ [CONFIG] Profile.json: ' + (_bootProfile.ok ? 'carregat' : ('NO (' + _bootProfile.reason + ')')) +
            ' · grafismes=' + (_activeConfig.rutas.grafismos || '-') +
            ' · subtitols=' + (_activeConfig.rutas.subtitulos || '-'));
    } catch (eCfgLog) { }

    // Recarrega en desar la configuracio (setup.html fa dispatchEvent).
    try {
        if (window.__adobe_cep__ && window.__adobe_cep__.addEventListener) {
            window.__adobe_cep__.addEventListener('FASTPASS_CONFIG_UPDATED', function () {
                var r = _loadProfile();
                try {
                    if (window.FASTPASS_UI.Utils && window.FASTPASS_UI.Utils.log) {
                        window.FASTPASS_UI.Utils.log('⚙️ [CONFIG] Configuracio recarregada' +
                            (r.ok ? ' (Profile.json)' : ': ' + r.reason), r.ok ? 'INFO' : 'WARN');
                    } else {
                        console.log('⚙️ [CONFIG] Configuracio recarregada' + (r.ok ? '' : ': ' + r.reason));
                    }
                } catch (eL) { }
            });
        }
    } catch (eEv) { }

    FASTPASS_UI.Config = {

        /**
         * get: Retorna la configuració activa (Carregada o Fallback).
         */
        get: function () {
            const cfg = _activeConfig;

            // Tracks de vídeo amb aliases per compatibilitat
            const raw = cfg.estructuras["TNs"].tracks;
            const vTracks = {
                mp4:       raw.v_mp4,
                main:      raw.v_mp4,    // alias per flow_cut.js i flow_assembly.js
                // (2026-10-01 · #126) MÀSCARA DE PISTA: V2 = «Màscara (PROTEGIT)». Decisió de
                // l'usuari: la màscara viu aquí i «V4 ja NO és zona de màscara» → els fluxos
                // que escriuen en aquesta pista (IPD+ SRC:2) hi fan VIGILÀNCIA amb avís
                // (flow_graphics.js → `_avisMascara`).
                mascara:   (raw.v_mascara !== undefined) ? raw.v_mascara : 2,
                fondos:    raw.v_fondos,
                graf:      raw.v_graf,
                // (2026-09-22) GRAFISMOS: clau pròpia (v_graficos) perquè vagin a la seva pista
                // (V5 al nou Profile.json) i no col·lideixin amb els chyrons (V7). Si no hi és,
                // es manté el comportament antic (v_graf).
                graficos:  (raw.v_graficos !== undefined) ? raw.v_graficos : raw.v_graf,
                tema:      raw.v_tema,
                tematitol: raw.v_tema,   // alias
                chyrons:   raw.v_chyrons,
                lloc:      raw.v_lloc,
                llocdata:  raw.v_lloc,   // alias
                // (2026-09-22) Doble Finestra / Mapa: dues copies de video a les seves pistes.
                video1:    (raw.v_video1 !== undefined) ? raw.v_video1 : raw.v_fondos,
                video2:    (raw.v_video2 !== undefined) ? raw.v_video2 : raw.v_chyrons,
                trad:      raw.v_trad    // V10 als TNs (no solapar amb els chyrons V7)
            };

            if (cfg.general.debug) {
                console.log("🛠️ [CONFIG] Video Tracks:", vTracks);
            }

            return {
                tracks: {
                    video: vTracks,
                    subtitle: { s1: raw.s_s1, s2: raw.s_s2 }
                },
                guarda: cfg.general.guarda,
                autor:  cfg.general.autor,
                rutas: {
                    plantilla_net:   cfg.rutas.plantilla,
                    conductors:      cfg.rutas.conductors,
                    chyrons:         cfg.rutas.chyrons,
                    // (2026-10-23) `destino_base` es l'AUTORITATIVA (la clau que
                    // desa la finestra de configuracio) i `projectes` es l'alies
                    // historic amb que la llig la resta del codi. Les dos apunten
                    // a la MATEIXA carpeta arrel (ho garantix normalizeRutas).
                    destinoBase:     cfg.rutas.destino_base,
                    projectes:       cfg.rutas.projectes || cfg.rutas.destino_base,
                    portadas:        cfg.rutas.portadas,
                    render1:         cfg.rutas.render1,
                    render2:         cfg.rutas.render2,
                    // (2026-10-21 · F2) Rutes que ABANS vivien al codi i ara es
                    // lligen de la configuracio: cap literal UNC a js/.
                    grafismos:       cfg.rutas.grafismos,
                    subtitulos:      cfg.rutas.subtitulos,
                    subtitulosSinteticos: cfg.rutas.subtitulosSinteticos
                },
                mapeoProgramas: this._getLegacyMapping(cfg),
                export: {
                    video1:  cfg.rutas.render1,
                    video2:  cfg.rutas.render2,
                    portada: cfg.rutas.portadas
                },
                naming: {
                    getProjectName: (ctx, sanitizedTema) => {
                        const prog = ctx.progData.archivo;
                        const bloq = ctx.bloque;
                        const d = ctx.dateDir.split('_');
                        const mmdd = d[1] + d[0];
                        const user = cfg.general.autor || "USER";
                        return `${prog}_${bloq}_${user}_${mmdd}_${sanitizedTema}`;
                    },
                    getSequenceName: (ctx, sanitizedTema) => {
                        const shortToken = (ctx.progData && ctx.progData.wott) ? ctx.progData.wott : "TMP";
                        return shortToken + "_" + sanitizedTema;
                    }
                },
                debug:    cfg.general.debug,
                handles:  cfg.general.handles  || 0,
                // clipOutMarginSec: marge de SORTIDA del clip (segons) que ha de quedar
                // DESPRÉS de l'inici del següent item amb OnAir (i per sobre dels
                // handles), per poder estirar el clip a la timeline si cal.
                // Cas real 2026-09-16: el clip acabava massa aviat i no cobria l'IPD.
                clipOutMarginSec: (cfg.general.clipOutMarginSec != null) ? cfg.general.clipOutMarginSec : 0,
                // clipExtraTailSec: COLA EXTRA (segons) del clip extret amb ffmpeg. El
                // clip del timeline es munta igual, però el fitxer té aquest material de
                // més al final per poder estirar-lo (connexions/directes que s'allarguen).
                clipExtraTailSec: (cfg.general.clipExtraTailSec != null) ? cfg.general.clipExtraTailSec : 60,
                // Hores d'inici d'emissió per programa (TNC 13:50, TNM 14:30, TNV 21:00).
                programStartHours: cfg.general.programStartHours || { TNV: 21.0, TNM: 14.5, TNC: 13.8333, MAT: 7.9167 },
                tcOffset: cfg.general.tcOffset || 0,
                // 🎛️ [IN-OFFSET 2026-09-04] Ajustos del flujo NOU/Main (create):
                // - clipInOffset: segons a RESTAR a l'IN (media origen) del clip inserit
                //   (el punt real del bloc està ~8-10s abans del calculat → més marge).
                // - zonaInOffset: segons a RESTAR al sweetSeqIn (corchete IN de la zona)
                //   perquè quedi més a prop de l'inici real del bloc.
                // Només s'apliquen a create() MODE NORMAL (3_Project_Logic.js).
                clipInOffset: cfg.general.clipInOffset || 0,
                zonaInOffset: cfg.general.zonaInOffset || 0,
                // 🌊 Ajustos de l'editor SRT / marcadors (Profile.json → general):
                // - srtEmergencyTailSec: segons de cua més enllà del final del bloc al
                //   SRT d'emergència (per defecte 120 s: cobreix el clip estirat amb
                //   clipExtraTailSec).
                // - snapWindowDeducedSec: finestra de snap (F4) per als marcadors DEDUÏTS
                //   (ítems sense OnAir, tipus "02i - Intro") — per defecte 2,5 s.
                // - snapWindowFaroSec (2026-09-24, FIX B): finestra de snap per als marcadors
                //   FARO (ítems amb OnAir real). Pujada d'1,5 → 2,5 s: amb el clip extret
                //   l'error residual d'ancoratge pot arribar a ~2 s i amb 1,5 s el faro no
                //   saltava mai al tall d'obertura de la seva peça (TNC: 12,96s vs tall 15,12s).
                srtEmergencyTailSec: (cfg.general.srtEmergencyTailSec != null) ? cfg.general.srtEmergencyTailSec : 120,
                // - srtEditMarginLeftSec: marge ESQUERRE (segons) de la finestra d'edició de
                //   l'editor SRT: quant de marge es veu ABANS del primer clip de subtítols.
                //   Defecte 0,4 s (= el pad d'IN de 10 frames) → el borde esquerre del canvas
                //   queda a l'IN del clip; amb 0 el primer clip queda EXACTAMENT al borde.
                srtEditMarginLeftSec: (cfg.general.srtEditMarginLeftSec != null) ? cfg.general.srtEditMarginLeftSec : 0.4,
                // - srtSyntheticGapTolSec (F3.3, 2026-10-21): tolerancia (segons) per
                //   decidir si una entrada SINTETICA cau dins d'un BUIT del SRT normal.
                srtSyntheticGapTolSec: (cfg.general.srtSyntheticGapTolSec != null) ? cfg.general.srtSyntheticGapTolSec : 0.2,
                // - srtSyntheticMinDurSec (BUG #188, 2026-10-23): durada MINIMA (segons)
                //   que ha de conservar una entrada SINT despres d'encongir-la per
                //   encabir-la al buit. Per davall d'aixo es descarta («massa-curt»).
                srtSyntheticMinDurSec: (cfg.general.srtSyntheticMinDurSec != null) ? cfg.general.srtSyntheticMinDurSec : 0.4,
                // - srtSyntheticMaxTrimSec (BUG #188, 2026-10-23): retall MAXIM (segons)
                //   que se li pot llevar a un SINT per encabir-lo al buit. Si en cal més,
                //   es descarta («no-cab»). OBSOLET des del BUG #224: ara el segment
                //   SINT s'ESTIRA fins al buit (`srtSyntheticMaxStretch`) en lloc de
                //   retallar-lo; el valor es conserva només per compatibilitat.
                srtSyntheticMaxTrimSec: (cfg.general.srtSyntheticMaxTrimSec != null) ? cfg.general.srtSyntheticMaxTrimSec : 0.8,
                // - srtSyntheticMaxStretch (BUG #224, 2026-11-06): factor MAXIM
                //   d'estirament del segment SINT per a omplir el buit (1 = no estirar).
                //   Si el buit és molt més llarg que el text, es deixa la cua buida en
                //   compte d'inflar un subtitol 4× (defecte 2).
                srtSyntheticMaxStretch: (cfg.general.srtSyntheticMaxStretch != null) ? cfg.general.srtSyntheticMaxStretch : 2,
                // - srtSyntheticMinPairs (BUG #224, 2026-11-06 · #224-b 2026-11-09):
                //   frases en comú / ANCLES MÍNIMS entre el SINT i el SRT per a acceptar
                //   que el sintètic és d'eixe bloc. Per davall d'això el 🧩 no col·loca
                //   res (abans omplia els buits amb el primer .srt del programa encara
                //   que no hi tocara: 0/74 en comú). #224-b: el desfasament no es pren
                //   d'una constant sinó del mapa per ancles (`SrtParser.mapAnchors`).
                srtSyntheticMinPairs: (cfg.general.srtSyntheticMinPairs != null) ? cfg.general.srtSyntheticMinPairs : 3,
                // - srtSyntheticTrimDup (2026-11-10 · reompliment 🧩): lleva el TEXT
                //   repetit a les FRONTERES del buit. Els `.srt` sintetics es generen
                //   amb handles d'àudio, així que el PRIMER clip que entra al buit sol
                //   repetir la cua del subtítol anterior i l'ÚLTIM la capçalera del
                //   següent. Només s'edita el text de l'entrada SINT: ni el temps ni
                //   les entrades del SRT normal es toquen.
                srtSyntheticTrimDup: (cfg.general.srtSyntheticTrimDup != null) ? !!cfg.general.srtSyntheticTrimDup : true,
                // - srtSyntheticTrimDupMinWords (2026-11-10): mínim de PARAULES en comú
                //   a la frontera per a considerar-ho text duplicat. Amb 1 una
                //   coincidència casual («i», «de», un nom propi) retallaria frases
                //   legítimes.
                srtSyntheticTrimDupMinWords: (cfg.general.srtSyntheticTrimDupMinWords != null) ? cfg.general.srtSyntheticTrimDupMinWords : 2,
                // - srtGapColorLabel (F3.6, 2026-10-23): índex de l'etiqueta de COLOR de
                //   Premiere (0-15) amb què es pinten els clips SINT col·locats als BUITS
                //   (pista S2). Defecte 7 = Mango (taronja): es distingix a simple vista
                //   del SRT base, que conserva la seua etiqueta.
                srtGapColorLabel: (cfg.general.srtGapColorLabel != null) ? cfg.general.srtGapColorLabel : 7,
                snapWindowDeducedSec: (cfg.general.snapWindowDeducedSec != null) ? cfg.general.snapWindowDeducedSec : 2.5,
                snapWindowFaroSec: (cfg.general.snapWindowFaroSec != null) ? cfg.general.snapWindowFaroSec : 2.5,
                // 🎯 TITOLET (2026-10-06): paràmetres de detecció del grafisme cremat.
                // Còpia fresca (defaults + override) perquè ningú els pugui mutar de retruc.
                titolet: Object.assign({}, TITOLET_DEFAULTS, cfg.titolet || {}),
                // 🎬 TEMA-TÍTOL (2026-10-07): peça de desaparició del propi Wott (sortida/
                // transicions). Còpia fresca (defaults + override) com el titolet.
                temaTitolExit: Object.assign({}, TEMATTOL_EXIT_DEFAULTS, cfg.temaTitolExit || {}),
                // 🗣️ TRADUCCIÓ (2026-10-12): congelat de la cua dels rètols de traducció.
                // Còpia fresca (defaults + override) com el titolet.
                traduccio: Object.assign({}, TRADUCCIO_DEFAULTS, cfg.traduccio || {})
            };
        },

        /**
         * resolvePath (F2): resol una PLANTILLA de ruta amb les variables
         * d'usuari/projecte. PUR (delega a Logic.Rutas).
         * @param {string} tpl  p.ex. '{base}\\{archivo}_{bloque}_{fecha}'
         * @param {Object} ctx  {progData|prog|archivo|wott|bloque|dateDir|
         *                       fecha|tema|sanitizedTema|base|autor}
         * @returns {string} ruta Windows normalitzada, SENSE cap {token}
         */
        resolvePath: function (tpl, ctx) {
            var R = _rutasLogic();
            if (!R) return String(tpl == null ? '' : tpl);
            return R.resolve(tpl, _ctxWithDefaults(ctx));
        },

        /**
         * resolvePathDetailed (F2): com resolvePath pero diu que falta.
         * @returns {{out:string, missing:string[], unknown:string[], tokens:string[]}}
         *   `out` conserva el {token} literal: es el que fa servir el boto
         *   «Prova» de setup.html per avisar («falta {tema}»).
         */
        resolvePathDetailed: function (tpl, ctx) {
            var R = _rutasLogic();
            if (!R) return { out: String(tpl == null ? '' : tpl), missing: [], unknown: [], tokens: [] };
            return R.resolveDetailed(tpl, _ctxWithDefaults(ctx));
        },

        /** loadProfile (F2): rellegeix Profile.json del disc i l'aplica. */
        loadProfile: function () { return _loadProfile(); },

        /** applyProfile (F2): aplica un objecte de perfil (proves / migracions). */
        applyProfile: function (obj) { return _applyProfile(obj || {}); },

        /** profilePath (F2): ruta absoluta del Profile.json ('' si no se sap). */
        profilePath: function () { return _profilePath(); },

        /** profileStatus (F2): estat de la ultima carrega {ok, reason, path?}. */
        profileStatus: function () { return _lastProfile; },

        /**
         * _getLegacyMapping: Mapa de programas per compatibilitat amb codi existent.
         */
        _getLegacyMapping: function(cfg) {
            const map = {};
            for (let k in cfg.estructuras) {
                const est = cfg.estructuras[k];
                est.programas.forEach(p => {
                    // (2026-10-21) `dir` = subcarpeta de projectes (p.ex.
                    // "01_MATINS_PROJECTES"). `utils.workFolder` fa
                    // `destinoBase + dir + data + bloc`, aixi que si falta el
                    // projecte cauria a l'ARREL. Es normalitza a '' (mai
                    // `undefined` a la ruta) i s'avisa al log per diagnostigar.
                    var dirProg = (p.dir == null ? '' : String(p.dir));
                    if (!dirProg.trim()) {
                        try { console.warn('[CONFIG] Programa sense CARPETA (dir): ' + k + ' / ' + p.id); } catch (eD) { }
                    }
                    map[p.id] = {
                        archivo:      p.archivo,
                        directorio:   dirProg,
                        wott:         p.wott,
                        archivo_wott: p.wott,
                        conductors:   { titular: p.conductor, substituts: [] },
                        escaletaId:   p.escaletaId || null
                    };
                });
            }
            return map;
        },

        /**
         * getNNewsPaths: Rutes de cerca de projectes NNews.
         */
        getNNewsPaths: function() {
            const cfg = _activeConfig.rutas;
            const paths = [];
            if (cfg.nnews_root_1) paths.push(cfg.nnews_root_1);
            if (cfg.nnews_root_2) paths.push(cfg.nnews_root_2);
            return paths;
        },

        saveSelection: function (el) {
            if (el && el.id) {
                localStorage.setItem('fastpass_v1_' + el.id, el.value);
            }
        },

        loadSelection: function () {
            try {
                var p = document.getElementById('programa');
                var b = document.getElementById('bloc');
                // (2026-10-21) L'`id` del programa es TAMBE el text del desplegable,
                // aixi que es pot renombrar ("TNM" -> "TN Migdia"). Si el valor desat
                // a localStorage ja no existeix, `p.value = <vell>` deixaria el select
                // BUIT (selectedIndex -1) i el boto principal desactivat fins que
                // l'usuari triara un programa. Nomes s'aplica si l'opcio existeix.
                var _teOpcio = function (sel, val) {
                    if (!sel || !val) return false;
                    for (var i = 0; i < sel.options.length; i++) {
                        if (sel.options[i].value === val) return true;
                    }
                    return false;
                };
                if (p) {
                    var vp = localStorage.getItem('fastpass_v1_programa');
                    if (vp == null) {
                        p.value = "";                                   // sense valor desat
                    } else if (_teOpcio(p, vp)) {
                        p.value = vp;
                    } else if (p.options.length > 0) {
                        p.selectedIndex = 0;                            // desat invalid -> 1a opcio
                    } else {
                        p.value = "";
                    }
                }
                if (b) b.value = localStorage.getItem('fastpass_v1_bloc') || "";
            } catch (e) { console.error("❌ Error carregant selecció:", e); }
        }
    };

    window.FASTPASS_UI = FASTPASS_UI;
})();
