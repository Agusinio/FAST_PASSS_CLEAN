/**
 * ============================================================================
 * FASTPASS_UI.EscaletaReader: Sub-mòdul FALLBACK
 * ============================================================================
 * Detecció de fora de rang del cleanFeed MP4 (bounds que excedeixen la
 * duració del fitxer). (2026-10-23) Ja no hi ha cap "MP4 individual del bloc":
 * si el bloc cau fora del cleanFeed, el projecte es crea sense vídeo.
 *
 * Depèn de: escaleta_timecode.js (tcToSeconds)
 *
 * Prefix de log: [ER:Fallback]
 * ============================================================================
 */

(function () {
    var FASTPASS_UI = window.FASTPASS_UI || {};
    var ER = FASTPASS_UI.EscaletaReader || {};
    var log = function (m) { FASTPASS_UI.Utils && FASTPASS_UI.Utils.log && FASTPASS_UI.Utils.log('[ER:Fallback] ' + m); };

    // ----------------------------------------------------------------
    // 8. DETECCIÓ DE FALLBACK (Bounds fora del rang del cleanFeed MP4)
    // ----------------------------------------------------------------

    /**
     * isBoundsOutOfCleanFeedRange: Determina si els bounds calculats
     * excedeixen la duració real del MP4 cleanFeed.
     *
     * Quan un bloc s'emet fora de l'horari habitual (ex: TNM V2 a les
     * 15:44 quan el cleanFeed acaba a les 15:29), els bounds relatius
     * al MP4 excedeixen la seva duració: no hi ha material i el projecte
     * es crea SENSE VÍDEO (es completa amb ACTUALITZAR quan la ingesta arribe).
     *
     * @param {Object} bounds      - Resultat de calcPrecisionTrimBounds()
     * @param {string} mediaStart  - TC d'inici del cleanFeed ("14:27:00:00")
     * @param {string} mediaStop   - TC de fi del cleanFeed ("15:29:40:00")
     * @returns {{ outOfRange: boolean, mp4MaxDuration: number, reason: string|null }}
     */
    ER.isBoundsOutOfCleanFeedRange = function (bounds, mediaStart, mediaStop) {
        if (!bounds || !mediaStart || !mediaStop) {
            return { outOfRange: false, mp4MaxDuration: 0, reason: null };
        }

        var worldSecMediaStart = this.tcToSeconds(mediaStart);
        var worldSecMediaStop  = this.tcToSeconds(mediaStop);
        var mp4MaxDuration = worldSecMediaStop - worldSecMediaStart;

        if (mp4MaxDuration <= 0) {
            return { outOfRange: false, mp4MaxDuration: 0, reason: null };
        }

        var inPoint  = bounds.mp4ExpandedInPoint  || 0;
        var outPoint = bounds.mp4ExpandedOutPoint || 0;

        // Detectar si l'inPoint o l'outPoint excedeixen la duració del MP4
        if (inPoint >= mp4MaxDuration) {
            return {
                outOfRange: true,
                mp4MaxDuration: mp4MaxDuration,
                reason: 'mp4ExpandedInPoint (' + inPoint.toFixed(1) + 's) >= duració cleanFeed (' + mp4MaxDuration.toFixed(1) + 's)'
            };
        }

        if (outPoint > mp4MaxDuration) {
            return {
                outOfRange: true,
                mp4MaxDuration: mp4MaxDuration,
                reason: 'mp4ExpandedOutPoint (' + outPoint.toFixed(1) + 's) > duració cleanFeed (' + mp4MaxDuration.toFixed(1) + 's)'
            };
        }

        return { outOfRange: false, mp4MaxDuration: mp4MaxDuration, reason: null };
    };

    // (2026-10-23) RETIRAT `calcFallbackBoundsForBlockMedia`: nomes servia per al MP4
    // individual del bloc de la carpeta de VERTICALITZACIO, que ja no existeix al flux.

    // Persistir al namespace
    FASTPASS_UI.EscaletaReader = ER;
    window.FASTPASS_UI = FASTPASS_UI;

    log('Sub-modul inicialitzat (1 metode)');
})();
