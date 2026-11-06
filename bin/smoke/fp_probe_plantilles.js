/* ============================================================================
 * PROVA 30 · MAPA MESURAT ITEM D'ESCALETA -> PLANTILLA (2026-11-06)
 * ----------------------------------------------------------------------------
 * QUÈ PROVA: `EscaletaReader.ITEM_PLANTILLES` i `plantillaDeTitol()` — la
 * taula que diu QUIN WAV d'`Audios\` sona en cada família d'ítem (careta /
 * molinet / anada / tornada de publi), mesurada amb `bin\map_plantilles.ps1`
 * sobre el cleanFeed sencer del 05/11 (no endevinada pel nom).
 *
 * PER QUÈ: si la taula s'ordena malament (claus genèriques abans de les
 * específiques) o es retoca a mà sense mesurar, l'A1 restaria la plantilla
 * equivocada: `anada_publi` i `tornada_publi_` donen r=0,985 entre elles
 * (mateix llit musical) i només les separa la cancel·lació (25,6 contra 15,0
 * dB). Els números que es fixen ací són els MESURATS al TNV V4.
 * ==========================================================================*/
(function () {
    var orig = window.__runTests;
    window.__runTests = async function () {
        await orig();

        var ok = window.__ok;
        var ER = window.FASTPASS_UI && window.FASTPASS_UI.EscaletaReader;
        window.__PHASE = '30-plantilles';

        var mapa = (ER && ER.ITEM_PLANTILLES) ? ER.ITEM_PLANTILLES : null;
        ok('#PLT/1 `EscaletaReader.ITEM_PLANTILLES` carregat amb el mapa mesurat',
            !!mapa && mapa.length >= 5 && typeof ER.plantillaDeTitol === 'function',
            'mapa=' + (mapa ? mapa.length : '-'));
        if (!mapa || typeof ER.plantillaDeTitol !== 'function') return;

        function wav(t) {
            var m = ER.plantillaDeTitol(t);
            return m ? m.wav : null;
        }

        ok('#PLT/2 TORNADA PUBLI -> `tornada_publi` (mesurat r=0,999 · 25,6 dB)',
            wav('MOLINET TORNADA PUBLI 1') === '3CatInfo_TN_tornada_publi_.WAV',
            'wav=' + wav('MOLINET TORNADA PUBLI 1'));

        ok('#PLT/3 ANADA PUBLI, en les dos formes de l\'escaleta -> `anada_publi`',
            wav('MOLINET ANADA A PUBLI 2') === '3CatInfo_TN_anada_publi.WAV' &&
            wav('MOLINET ANADA PUBLI 3') === '3CatInfo_TN_anada_publi.WAV',
            'A=' + wav('MOLINET ANADA A PUBLI 2') + ' B=' + wav('MOLINET ANADA PUBLI 3'));

        ok('#PLT/4 MOLINET 1 i MOLINET 1B -> `molinet_01`, no la de tornada',
            wav('MOLINET 1') === '3CatInfo_TN_molinet_01.WAV' &&
            wav('MOLINET 1B') === '3CatInfo_TN_molinet_01.WAV',
            '1=' + wav('MOLINET 1') + ' 1B=' + wav('MOLINET 1B'));

        // L'orde de la taula és el contracte: TORNADA abans que MOLINET.
        ok('#PLT/5 les claus ESPECÍFIQUES guanyen (TORNADA/ANADA abans que MOLINET)',
            wav('MOLINET TORNADA PUBLI 1') !== '3CatInfo_TN_molinet_01.WAV' &&
            mapa[0].titol.indexOf('TORNADA') !== -1,
            'primer=' + mapa[0].titol);

        ok('#PLT/6 títol buit, desconegut o sense plantilla -> null (no s\'inventa res)',
            ER.plantillaDeTitol('') === null && ER.plantillaDeTitol(null) === null &&
            ER.plantillaDeTitol('CARETA ESPORTS') === null &&
            ER.plantillaDeTitol('MOLINET ANADA PUBLI 3') !== null,
            'careta=' + ER.plantillaDeTitol('CARETA ESPORTS'));
    };
})();
