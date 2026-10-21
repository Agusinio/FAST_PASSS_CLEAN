/* ============================================================================
 * PROVA SRT · F3 (2026-10-21) - editor de subtitols
 * ----------------------------------------------------------------------------
 * QUE ES PROVA
 *  A) PARSER PUR (`10_Srt_Logic.js`): findGaps / mergeSyntheticGaps /
 *     removeEntryAt. Son les funcions que decideixen QUE s'afegeix al reomplir
 *     buits; si fallen, el timeline acaba amb subtitols duplicats o solapats.
 *  B) GUARDES dels fitxers REALS: seleccio i esborrat a l'editor (_selIndex,
 *     deleteSelected, Supr), colors SINT/MOD, exportacio per pista (S1/S2),
 *     Ctrl+clic a CARREGAR = sintetics, boto 🧩, boto 🗑, cache-busts i el
 *     parametre srtSyntheticGapTolSec de la config.
 *
 * CRITERI QUE ES VERIFICA (pla F3.3):
 *   - mai se sobreescriu ni es toca una entrada existent;
 *   - no s'introdueixen intervals solapats ni duplicats;
 *   - una entrada sintetica que toca un subtitol existent (dins de la
 *     tolerancia) NO s'hi afegeix.
 * ==========================================================================*/
(function () {
    var orig = window.__runTests;
    window.__runTests = async function () {
        await orig();

        var ok = window.__ok;
        var UI = window.FASTPASS_UI;
        window.__PHASE = '24-srt';

        var REPO = window.__REPO || '';
        function noComments(src) {
            return String(src).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
        }
        async function readRepo(rel) {
            var r = await fetch('file:///' + REPO + '/' + rel);
            return await r.text();
        }
        function near(a, b, tol) { return Math.abs(Number(a) - Number(b)) <= (tol == null ? 0.0001 : tol); }
        function E(s, e, t) { return { index: 0, timeStr: '', texts: [t || ('t' + s)], startSec: s, endSec: e }; }

        var P = UI.Logic && UI.Logic.SrtParser;
        ok('#F3/1 `Logic.SrtParser` carregat (10_Srt_Logic.js al bundle)', !!P, 'P=' + !!P);
        if (!P) return;

        try {
            // ── A. BUITS ─────────────────────────────────────────────────────
            var base = [E(0, 2), E(2, 4), E(10, 12)];
            var g = P.findGaps(base);
            ok('#F3/2 findGaps: nomes els buits REALS entre entrades',
                g.gaps.length === 1 && near(g.gaps[0].startSec, 4) && near(g.gaps[0].endSec, 10) &&
                near(g.gaps[0].durSec, 6),
                JSON.stringify(g.gaps));
            ok('#F3/3 findGaps: firstSec/lastSec',
                near(g.firstSec, 0) && near(g.lastSec, 12), g.firstSec + '/' + g.lastSec);

            // ── B. FUSIO ─────────────────────────────────────────────────────
            var sint = [E(1, 1.5, 'dins-existent'), E(5, 6.5, 'buit'), E(10.05, 11, 'solapa'), E(20, 21, 'fora')];
            var res = P.mergeSyntheticGaps(base, sint, { tolSec: 0.2 });
            ok('#F3/4 fusio: nomes entra la sintetica del buit',
                res.added.length === 1 && res.added[0].texts[0] === 'buit',
                'added=' + res.added.length + ' ' + JSON.stringify(res.added.map(function (a) { return a.texts[0] + ':' + a.reason; })));
            ok('#F3/5 fusio: descarta solapament, existent i fora del tram',
                res.rejected.length === 3 &&
                res.rejected.filter(function (r) { return r.reason === 'solapa'; }).length === 2 &&
                res.rejected.filter(function (r) { return r.reason === 'fora-del-tram'; }).length === 1,
                JSON.stringify(res.rejected.map(function (r) { return r.texts[0] + ':' + r.reason; })));
            ok('#F3/6 fusio: resultat ordenat i reindexat 1..n',
                res.entries.length === 4 &&
                res.entries[0].index === 1 && res.entries[3].index === 4 &&
                near(res.entries[2].startSec, 5) && near(res.entries[3].startSec, 10),
                JSON.stringify(res.entries.map(function (e) { return e.index + '@' + e.startSec; })));
            ok('#F3/7 fusio: les existents queden IDENTIQUES (sols s\'hi afegeix)',
                near(res.entries[0].startSec, 0) && near(res.entries[0].endSec, 2) &&
                near(res.entries[1].startSec, 2) && near(res.entries[1].endSec, 4) &&
                near(res.entries[3].startSec, 10) && near(res.entries[3].endSec, 12) &&
                res.entries[1].texts[0] === 't2' && res.entries[3].texts[0] === 't10',
                JSON.stringify(res.entries));
            var solapat = false;
            for (var i = 1; i < res.entries.length; i++) {
                if (res.entries[i].startSec < res.entries[i - 1].endSec - 0.0001) solapat = true;
            }
            ok('#F3/8 fusio: cap solapament al resultat', solapat === false);

            var dup = P.mergeSyntheticGaps(base, [E(5, 6, 'a'), E(5.5, 7, 'b')], { tolSec: 0.2 });
            ok('#F3/9 fusio: dos sintetics que se solapen → 1 afegit i 1 descartat (duplicat)',
                dup.added.length === 1 && dup.rejected.length === 1 && dup.rejected[0].reason === 'duplicat',
                dup.added.length + '/' + dup.rejected.length + ':' + (dup.rejected[0] || {}).reason);

            var touch = P.mergeSyntheticGaps(base, [E(3.9, 4.1, 'toca')], { tolSec: 0.2 });
            ok('#F3/10 tolerancia: una sintetica que toca un subtitol existent NO s\'hi afegeix',
                touch.added.length === 0 && touch.rejected.length === 1,
                touch.added.length + '/' + touch.rejected.length);

            ok('#F3/11 fusio: sense SRT normal o sense SINT no fa res',
                P.mergeSyntheticGaps([], [E(1, 2)], {}).added.length === 0 &&
                P.mergeSyntheticGaps(base, [], {}).added.length === 0);

            var rem = P.removeEntryAt(base, 1);
            ok('#F3/12 removeEntryAt: lleva l\'entrada, reindexa i no muta l\'original',
                rem.length === 2 && near(rem[0].startSec, 0) && near(rem[1].startSec, 10) &&
                rem[1].index === 2 && base.length === 3 && near(base[1].startSec, 2),
                JSON.stringify(rem.map(function (e) { return e.index + '@' + e.startSec; })));
        } catch (eA) {
            ok('#F3 parser: la prova no ha llancat cap excepcio', false, eA && (eA.message + ' | ' + eA.stack));
        }

        // ── C. GUARDES DELS FITXERS REALS ────────────────────────────────
        try {
            var ed = noComments(await readRepo('js/editor/srt_editor.js'));
            ok('#F3/13 editor: _selIndex + deleteSelected + tecles Supr/Backspace',
                /_selIndex:\s*-1/.test(ed) && /deleteSelected:\s*async function/.test(ed) &&
                /Delete/.test(ed) && /Backspace/.test(ed) && /_initKeys:\s*function/.test(ed));
            var drawTrack = ed.split('_drawTrack: function')[1] || '';
            ok('#F3/14 editor: selecció al canvas (_selectAtSec) i ressaltat a _drawTrack',
                /_selectAtSec:\s*function/.test(ed) && /_clipAtSec:\s*function/.test(ed) &&
                /_trackStyle:\s*function/.test(ed) && /_selIndex/.test(drawTrack));
            // (F3.4, 2026-10-21) SELECCIO MULTIPLE: Ctrl/Shift+clic damunt el centre
            // d'un clip + Supr esborra TOTS els seleccionats (una sola confirmacio
            // de timeline i esborrat descendent de _entries/_originalEntries).
            ok('#F3/28 editor: selecció MÚLTIPLE (Ctrl/Shift+clic) amb _selIndices',
                /_selIndices:\s*\[\]/.test(ed) && /_toggleSelectionAt:\s*function/.test(ed) &&
                /_clipHitAtPx:\s*function/.test(ed) && /_selectedIndices:\s*function/.test(ed) &&
                /ctrlKey/.test(ed) && /shiftKey/.test(ed) && /_CLIP_EDGE_PX/.test(ed) &&
                /this\._selectedIndices\(\)/.test(drawTrack));
            ok('#F3/29 editor: Supr esborra els N clips (descendent + 1 confirmacio)',
                /withSub\.length/.test(ed) && /withSub\.push/.test(ed) &&
                /idxs\.slice\(\)\.sort/.test(ed) && /removeEntryAt\(this\._originalEntries, kd\)/.test(ed));
            ok('#F3/30 editor: el cursor NOMÉS es mou clicant la REGLA',
                /this\._canvas\.addEventListener\('click', function \(e\) \{[\s\S]{0,200}?_inRulerZone\(e\)\) return;/.test(ed) &&
                /_clipHitAtEvent\(e\)/.test(ed));
            ok('#F3/15 editor: colors propis SINT (taronja) i MOD (verd)',
                /'SINT'/.test(ed) && /'MOD'/.test(ed) &&
                /212,\s*120,\s*32/.test(ed) && /32,\s*160,\s*120/.test(ed));
            ok('#F3/16 editor: exportToPremiere(opts) amb pista i neteja NOMES la de destí',
                /exportToPremiere:\s*async function \(opts\)/.test(ed) &&
                /o\.track != null/.test(ed) && /trackIdx/.test(ed) &&
                /placeSrtOnExistingSubtitleTrack\('" \+ encModName \+ "', 0, " \+ trackIdx/.test(ed) &&
                /nets subt/.test(ed) && /de S" \+ \(trackIdx \+ 1\)/.test(ed));
            ok('#F3/17 editor: loadSrt amb kind SINT + vistes (_stashCurrentView/switchView/hasView)',
                /var kind = \(opts && opts\.kind\)/.test(ed) && /_stashCurrentView:\s*function/.test(ed) &&
                /switchView:\s*function/.test(ed) && /hasView:\s*function/.test(ed));
            ok('#F3/18 editor: mergeSyntheticGaps llig la tolerància de la config',
                /mergeSyntheticGaps:\s*async function/.test(ed) && /srtSyntheticGapTolSec/.test(ed));
            ok('#F3/19 editor: esborrar del timeline NOMES clips de subtítol (sense ripple)',
                /_removeTimelineSubAt:\s*async function/.test(ed) && /subtitleTracks/.test(ed) &&
                /remove\(false,false\)/.test(ed) && /_timelineSubs/.test(ed));
        } catch (eB) {
            ok('#F3 guardes de l\'editor: sense excepció', false, eB && (eB.message + ' | ' + eB.stack));
        }

        // ── D. GUARDES DEL FLUX, DE LA UI I DE LA CONFIG ─────────────────
        try {
            var flow = noComments(await readRepo('js/workflows/flow_srt.js'));
            ok('#F3/20 flux: runSrtLoadSynthetic (Scanner.srtSynthetic + kind SINT + alternar)',
                /runSrtLoadSynthetic:\s*async function/.test(flow) && /srtSynthetic\(ctx\)/.test(flow) &&
                /\{ kind: 'SINT' \}/.test(flow) && /switchView\('NORMAL'\)/.test(flow));
            ok('#F3/21 flux: runSrtFillGaps → SrtEditor.mergeSyntheticGaps',
                /runSrtFillGaps:\s*async function/.test(flow) && /ed\.mergeSyntheticGaps\(\)/.test(flow));

            var sc = noComments(await readRepo('js/logic/Scanner.js'));
            ok('#F3/22 Scanner.srtSynthetic: ruta de sintetics, filtre de data i prefix programa_bloc',
                /srtSynthetic:\s*async function/.test(sc) && /subtitulosSinteticos/.test(sc) &&
                /_fileDateYYYYMMDD/.test(sc) && /pBoth/.test(sc) && /pProg/.test(sc));

            var main = noComments(await readRepo('js/main.js'));
            ok('#F3/23 main: Ctrl+clic → SINT, Alt+clic → fallback, 🗑 i 🧩 cablejats',
                /runSrtLoadSynthetic/.test(main) && /e\.altKey/.test(main) &&
                /btnSrtDel/.test(main) && /deleteSelected/.test(main) &&
                /btnSrtFill/.test(main) && /runSrtFillGaps/.test(main) &&
                /exportToPremiere\(toS2 \? \{ track: 1 \} : undefined\)/.test(main));

            var html = await readRepo('index.html');
            ok('#F3/24 index: botons 🗑 i 🧩 a la fila SUBTÍTOLS',
                /id="btnSrtDel"/.test(html) && /id="btnSrtFill"/.test(html) &&
                /Ctrl\+clic = SUBTÍTOLS SINTÈTICS/.test(html));
            ok('#F3/25 index: cache-busts F3 (srt_editor 79, flow_srt 12, main 86, Scanner 15, Srt_Logic 17, Config 40)',
                /srt_editor\.js\?v=79/.test(html) && /flow_srt\.js\?v=12/.test(html) &&
                /main\.js\?v=86/.test(html) && /Scanner\.js\?v=15/.test(html) &&
                /10_Srt_Logic\.js\?v=17/.test(html) && /11_Configuracio\.js\?v=40/.test(html));

            var cfg = noComments(await readRepo('js/core/11_Configuracio.js'));
            ok('#F3/26 config: srtSyntheticGapTolSec (default 0,2 s + getter)',
                /srtSyntheticGapTolSec:\s*0\.2/.test(cfg) &&
                /srtSyntheticGapTolSec:\s*\(cfg\.general\.srtSyntheticGapTolSec != null\)/.test(cfg));

            var jsx = noComments(await readRepo('jsx/modules/6_Clips.jsx'));
            ok('#F3/27 JSX: placeSrtOnExistingSubtitleTrack(item, start, trackIdx)',
                /placeSrtOnExistingSubtitleTrack:\s*function\(itemName, startSec, trackIdx\)/.test(jsx) &&
                /tracks\[idx\]/.test(jsx) && /"OK_S"/.test(jsx));
        } catch (eC) {
            ok('#F3 guardes del flux/UI/config: sense excepció', false, eC && (eC.message + ' | ' + eC.stack));
        }
    };
})();
