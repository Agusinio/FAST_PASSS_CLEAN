/* ============================================================================
 * PROVA BUG #216 + TÒTEM TE (2026-11-02) - WOTTS TE -> MARCADOR GROC DEL SEU TÍTOL
 * ----------------------------------------------------------------------------
 * Cas real (TNM V3, 02/11 12:48): l'ítem de tòtem `25TE-2` tenia el marcador
 * «25TE-2 - TE tort DADES CÀMPINGS OBERTS» @10,00 s i el wott
 *   Wott_TNM_v3_25TE-2_00.00_TE tort DADES CÀMPINGS OBERTS_672605_GRAFICA_CIRCULAR_…
 * NO es va col·locar enlloc. Dues causes:
 *   1) BUG #216 · el codi feia `split("-")[0]` sobre el comentari → fullId «25TE»
 *      i `structureById['25TE']` no existia (l'ítem és «25TE-2») → els wotts de
 *      l'ítem no s'avaluaven mai, ni eixien al log.
 *   2) El mecanisme que vol l'usuari és un altre: els wotts TE van AL MARCADOR
 *      GROC el TÍTOL del qual coincidix (o s'assembla molt) amb el TÍTOL del wott,
 *      a la pista V3 i amb la durada pròpia — ni cadena ni rastreig de color.
 *      Un marcador groc tot sol NO dispara res; un wott TE sense marcador
 *      semblant NO es col·loca.
 * S'encadena DESPRÉS de `fp_probe_twitts.js` (mateix patró: embolcalla __runTests).
 * ==========================================================================*/
(function () {
    var orig = window.__runTests;
    window.__runTests = async function () {
        await orig();

        var ok = window.__ok;
        var CHY = window.FASTPASS_UI.Workflows.Chyrons;
        var MAPA = window.FASTPASS_UI.Workflows.Mapa;
        window.__PHASE = '27-te-totem';

        ok('flow_chyrons exposat amb la passada de tòtem (placeTeWotts) i els helpers #216',
            !!(CHY && typeof CHY.placeTeWotts === 'function' &&
                typeof CHY._markerItemId === 'function' &&
                typeof CHY._isTeItemId === 'function' &&
                typeof CHY._isTeWott === 'function' &&
                typeof CHY._teWottTitle === 'function'));
        if (!CHY || typeof CHY._isTeItemId !== 'function') return;

        // ── #216 · ID del marcador sense trencar el guionet intern ────────────
        ok('#216 _markerItemId: «25TE-2 - TE tort DADES CÀMPINGS OBERTS» → «25TE-2»',
            CHY._markerItemId('25TE-2 - TE tort DADES C\u00c0MPINGS OBERTS') === '25TE-2');
        ok('#216 _markerItemId: els IDs de sempre NO canvien (01i · 01 PGi · 25)',
            CHY._markerItemId('01i - LEAD PENSIONS') === '01i' &&
            CHY._markerItemId('01 PGi - PG Intro') === '01 PGi' &&
            CHY._markerItemId('25 - CAMPINGS PLENS') === '25');
        ok('#216 _markerItemId: sense « - » amb espais cau al tall antic',
            CHY._markerItemId('25TE-2-TE tort DADES') === '25TE' &&
            CHY._markerItemId('') === '');

        // ── Família TE (tòtem) ───────────────────────────────────────────────
        ok('_isTeItemId: «25TE»/«25TE-2»/«12TE3» són TE · «25»/«25P2-1»/«25TELEFON» no',
            CHY._isTeItemId('25TE') === true && CHY._isTeItemId('25TE-2') === true &&
            CHY._isTeItemId('12TE3') === true && CHY._isTeItemId('25') === false &&
            CHY._isTeItemId('25P2-1') === false && CHY._isTeItemId('25TELEFON') === false &&
            CHY._isTeItemId('') === false && CHY._isTeItemId(null) === false);

        var W_TE = 'Wott_TNM_v3_25TE-2_00.00_TE tort DADES C\u00c0MPINGS OBERTS_672605_GRAFICA_CIRCULAR_VERTICAL_9x16.mov';
        var W_TITOL = 'Wott_TNM_v3_25_00.01_CAMPINGS PLENS PER HALLOWEEN_672628_Tema-Titol_Tots Sants.00672629.mov';
        ok('_isTeWott: el wott de l\'ítem 25TE-2 ho és; el Tema-Títol de l\'ítem 25 no',
            CHY._isTeWott({ name: W_TE }) === true &&
            CHY._isTeWott({ name: W_TITOL }) === false &&
            CHY._isTeWott({ name: 'x', lineaID: '25TE-2' }) === true);
        ok('_teWottTitle: el títol del wott és la part que es compara (part 6 del nom)',
            CHY._teWottTitle(W_TE) === 'TE tort DADES C\u00c0MPINGS OBERTS',
            CHY._teWottTitle(W_TE));

        // ── Semblança amb el títol del marcador GROC (el comparador del MAPA) ─
        var T = CHY._teWottTitle(W_TE);
        ok('semblança: títol del wott == títol del marcador → 1,00 (dispara)',
            !!(MAPA && MAPA._scoreNombre(T, 'TE tort DADES C\u00c0MPINGS OBERTS') === 1));
        ok('semblança: tolera accents (CAMPINGS/CÀMPINGS) → segueix disparant',
            !!(MAPA && MAPA._scoreNombre(T, 'TE tort DADES CAMPINGS OBERTS') === 1));
        ok('semblança: un marcador d\'un ALTRE assumpte NO dispara (< 0,60)',
            !!(MAPA && MAPA._scoreNombre(T, 'CAMPINGS PLENS PER HALLOWEEN') < 0.60 &&
               MAPA._scoreNombre(T, 'DONA PAS CIUTAT JUSTICIA') < 0.60));
        ok('llindar: MATCH_MIN del MAPA és 0,60 (el mateix que fa servir el tòtem)',
            !!(MAPA && MAPA.MATCH_MIN === 0.60), MAPA && String(MAPA.MATCH_MIN));

        // ── Cablejat: el tòtem va DESPRÉS dels wotts genèrics i fora del bucle ─
        var src = String(CHY.placeChyronResto);
        ok('#Resto: la passada genèrica EXCLOU els wotts TE («!isTe(c)»)',
            src.indexOf('!isTe(c)') !== -1 && src.indexOf('_isTeWott') !== -1);
        ok('#Resto: placeTeWotts es crida DESPRÉS de _placeChyronsByType (ordre del flux)',
            src.indexOf('await this._placeChyronsByType(') !== -1 &&
            src.indexOf('await this.placeTeWotts()') !== -1 &&
            src.indexOf('await this._placeChyronsByType(') < src.indexOf('await this.placeTeWotts()'));
        ok('placeTeWotts: pista de GRAFISMES (V3) i sense cap rastreig ni cadena',
            String(CHY.placeTeWotts).indexOf('tracks.video.graficos') !== -1 &&
            String(CHY.placeTeWotts).indexOf('_placeTitoletChain') === -1 &&
            String(CHY.placeTeWotts).indexOf('titolet') === -1);

        // ── Un marcador groc TOT SOL no dispara res (ni tan sols llig marcadors) ─
        var St = window.FASTPASS_UI.State;
        var abans = St ? St.structure : undefined;
        try {
            if (St) St.structure = [];
            var n = await CHY.placeTeWotts();
            ok('sense cap wott TE a l\'escaleta, placeTeWotts no fa res (retorna 0)',
                n === 0, String(n));
            ok('el log ho diu explícitament (cap wott de tòtem → res a fer)',
                (window.__LOG || []).some(function (l) {
                    return l.indexOf('[TE]') !== -1 && l.indexOf('t\u00f2tem') !== -1;
                }));
        } finally {
            if (St) St.structure = abans;
        }
    };
})();
