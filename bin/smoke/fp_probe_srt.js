/* ============================================================================
 * PROVA SRT · F3 (2026-10-21) - editor de subtitols
 * ----------------------------------------------------------------------------
 * QUE ES PROVA
 *  A) PARSER PUR (`10_Srt_Logic.js`): findGaps / mergeSyntheticGaps /
 *     removeEntryAt. Son les funcions que decideixen QUE s'afegeix al reomplir
 *     buits; si fallen, el timeline acaba amb subtitols duplicats o solapats.
 *  B) GUARDES dels fitxers REALS: seleccio i esborrat a l'editor (_selIndex,
 *     deleteSelected, Supr), colors SINT/MOD, exportacio per pista (S1/S2),
 *     Ctrl+clic a CARREGAR = sintetics, boto 🧩, boto 🗑 (RETIRAT el 2026-10-23:
 *     Supr/Backspace fan el mateix), cache-busts i el parametre srtSyntheticGapTolSec.
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
                near(res.entries[2].startSec, 4.12) && near(res.entries[3].startSec, 10),
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

            // (BUG #224 · 2026-11-06) Un sintetic que NOMÉS toca el buit (0,1 s) no
            // és dins: va damunt d'un subtitol existent → no s'hi posa.
            var touch = P.mergeSyntheticGaps(base, [E(3.9, 4.1, 'toca')], { tolSec: 0.2, minDurSec: 0.4 });
            ok('#F3/10 solapament: un sintetic que només TOCA el buit (< tol) no s\'hi posa',
                touch.added.length === 0 && touch.rejected.length === 1 &&
                touch.rejected[0].reason === 'solapa',
                touch.added.length + '/' + touch.rejected.length + ':' + (touch.rejected[0] || {}).reason);

            // (BUG #224 · 2026-11-06) ENCAIX: el sintetic que sobreïx el buit entra
            // igual — s'ESTIRA/ARRANGONA fins a omplir el buit amb la separació de
            // 3 frames dels oficials, començant a vora+0,12 s.
            var fit = P.mergeSyntheticGaps(base, [E(3.6, 5.2, 'sobreïx')], { tolSec: 0.2, minDurSec: 0.4 });
            ok('#F3/49 encaix: el sintetic que sobreïx el buit s\'hi col·loca començant a la vora + separació',
                fit.added.length === 1 && fit.added[0].reason === 'buit-ajustada' &&
                near(fit.added[0].startSec, 4.12) && near(fit.added[0].endSec, 7.32) &&
                near(fit.added[0].factor, 2, 0.001) && fit.trimmed === 1 &&
                near(fit.entries[2].startSec, 4.12) && fit.entries[2].sint === true,
                JSON.stringify(fit.added.map(function (a) { return a.startSec + '-' + a.endSec + ':' + a.reason + ':x' + a.factor; })));

            // (BUG #224) Dos sintetics al MATEIX buit: es col·loquen en ORDRE, sense
            // solapar-se, amb la separació de 3 frames i estirats per omplir-lo.
            var two = P.mergeSyntheticGaps(base, [E(3.6, 5.2, 'a'), E(5.6, 6.6, 'b')],
                { tolSec: 0.2, minDurSec: 0.4 });
            ok('#F3/52 encaix: dos sintetics al mateix buit → en ordre, amb 3 frames i sense solapar',
                two.added.length === 2 && near(two.added[0].startSec, 4.12) &&
                near(two.added[0].endSec, 7.32) && near(two.added[1].startSec, 7.44) &&
                near(two.added[1].startSec - two.added[0].endSec, 0.12, 0.001) &&
                two.trimmed === 2 && two.entries.length === 5 &&
                two.entries.filter(function (e) { return e.sint === true; }).length === 2,
                JSON.stringify(two.added.map(function (a) { return a.startSec + '-' + a.endSec + ':' + a.reason; })) +
                ' * n=' + two.entries.length + ' * trimmed=' + two.trimmed);

            // (BUG #224) Una frase MOLT més llarga que el buit ja no es descarta: es
            // comprimix dins del buit (era el cas «no-cab» de BUG #188).
            var noCab = P.mergeSyntheticGaps(base, [E(2.5, 8, 'massa-llarg')], { tolSec: 0.2, minDurSec: 0.4 });
            ok('#F3/50 encaix: la frase més llarga que el buit s\'hi comprimix (ja no es descarta)',
                noCab.added.length === 1 && near(noCab.added[0].startSec, 4.12) &&
                near(noCab.added[0].endSec, 9.88) && noCab.added[0].factor < 1.5,
                JSON.stringify(noCab.added.map(function (a) { return a.startSec + '-' + a.endSec + ':x' + a.factor; })));

            ok('#F3/11 fusio: sense SRT normal o sense SINT no fa res',
                P.mergeSyntheticGaps([], [E(1, 2)], {}).added.length === 0 &&
                P.mergeSyntheticGaps(base, [], {}).added.length === 0);

            var rem = P.removeEntryAt(base, 1);
            ok('#F3/12 removeEntryAt: lleva l\'entrada, reindexa i no muta l\'original',
                rem.length === 2 && near(rem[0].startSec, 0) && near(rem[1].startSec, 10) &&
                rem[1].index === 2 && base.length === 3 && near(base[1].startSec, 2),
                JSON.stringify(rem.map(function (e) { return e.index + '@' + e.startSec; })));

            // (BUG #189 · 2026-10-23) EIX DEL SINT: els .srt sintetics no comencen al
            // media 0 del clip (mesurat en viu el 22/10: -16,97 s al TN V3 i -39,55 s
            // al TN V1), aixi que fusionar-los tal qual col·locava cada subtitol eixa
            // diferencia ABANS del lloc. El desfasament es MESURA amb les frases en
            // comu (mediana) i es desplaça la taula SINT; mai s'endevina una constant.
            var baseAx = [E(100, 102, 'Hola món'), E(110, 112, 'Adéu'), E(120, 122, 'Bon dia')];
            var sintAx = [E(60, 62, 'hola mon'), E(70, 72, 'adeu'), E(78, 80, 'bon dia')];
            var estAx = P.estimateOffsetSec(baseAx, sintAx);
            ok('#F3/53 estimateOffsetSec: mesura el desfasament del SINT (40 s abans) amb les frases en comú',
                near(estAx.offsetSec, 40, 0.001) && estAx.pairs === 3 && estAx.used === 3 &&
                estAx.method === 'text' && near(estAx.spreadSec, 2, 0.001),
                JSON.stringify(estAx));

            var shAx = P.shiftEntries([E(2, 3, 'a'), E(10, 12, 'b')], -5);
            ok('#F3/54 shiftEntries: desplaça la taula (sense mutar) i descarta el que cau abans del 0',
                shAx.length === 1 && near(shAx[0].startSec, 5) && near(shAx[0].endSec, 7) &&
                shAx[0].index === 1,
                JSON.stringify(shAx.map(function (e) { return e.index + '@' + e.startSec + '-' + e.endSec; })));

            var shClamp = P.shiftEntries([E(1, 2, 'x')], -1.5);
            ok('#F3/55 shiftEntries: el que creua el 0 es RETALLA a 0 (cap temps negatiu al .srt)',
                shClamp.length === 1 && near(shClamp[0].startSec, 0) && near(shClamp[0].endSec, 0.5),
                JSON.stringify(shClamp.map(function (e) { return e.startSec + '-' + e.endSec; })));

            // De dos buits, el SINT ha de caure al CORRECTE un colp desplaçat; sense
            // l'ajust cauria al buit d'abans (era el símptoma: «el subtitol es d'un
            // moment anterior»).
            var baseAx2 = [E(0, 2, 'a'), E(10, 12, 'b'), E(20, 22, 'c')];
            var sintAx2 = [E(-10, -8, 'a'), E(0, 2, 'b'), E(10, 12, 'c'), E(5, 6, 'NOU')];
            var estAx2 = P.estimateOffsetSec(baseAx2, sintAx2);
            var aligned = P.mergeSyntheticGaps(baseAx2, P.shiftEntries(sintAx2, estAx2.offsetSec), { tolSec: 0.2 });
            var rawFus = P.mergeSyntheticGaps(baseAx2, sintAx2, { tolSec: 0.2 });
            ok("#F3/56 ajust+fusió: desplaçat cau al BUIT correcte (sense ajust, al d'abans)",
                near(estAx2.offsetSec, 10, 0.001) &&
                aligned.added.length === 1 && near(aligned.added[0].startSec, 12.12) &&
                rawFus.added.length === 1 && near(rawFus.added[0].startSec, 2.12),
                'Δ=' + estAx2.offsetSec + ' * alineat=' + JSON.stringify(aligned.added.map(function (a) { return a.startSec; })) +
                ' * sense-ajust=' + JSON.stringify(rawFus.added.map(function (a) { return a.startSec; })));

            var noPair = P.estimateOffsetSec([E(0, 1, 'res')], [E(0, 1, 'una altra cosa')]);
            ok("#F3/57 estimateOffsetSec: sense frases en comú no s'inventa cap desfasament",
                noPair.offsetSec === 0 && noPair.pairs === 0 && noPair.method === 'cap',
                JSON.stringify(noPair));

            // ── BUG #224 (2026-11-06) · ENCAIX AL BUIT I SELECCIO DEL SINT ──────
            // Els SRT oficials del NAS porten SEMPRE 3 frames (0,12 s) entre dos
            // clips seguits (mesurat: 63/68, 62/79 i 51/64 a tres blocs). El 🧩 ha
            // de deixar eixa separació i ESTIRAR el text per a omplir el buit.
            var fg1 = P.fitClipsToGap([{ startSec: 2, endSec: 4 }, { startSec: 5, endSec: 7 }, { startSec: 8, endSec: 10 }], 1, 11);
            ok('#F3/62 fitClipsToGap: ompli el buit de vora a vora amb 3 frames de separació',
                fg1.clips.length === 3 && near(fg1.clips[0].startSec, 1.12) &&
                near(fg1.clips[2].endSec, 10.88) &&
                near(fg1.clips[1].startSec - fg1.clips[0].endSec, 0.12, 0.001) &&
                near(fg1.clips[2].startSec - fg1.clips[1].endSec, 0.12, 0.001) &&
                near(fg1.factor, 1.5867, 0.002) && fg1.reason === 'buit' && fg1.dropped === 0,
                JSON.stringify(fg1));

            var fg2 = P.fitClipsToGap([{ startSec: 2, endSec: 3 }], 1, 31, { maxStretch: 2 });
            ok('#F3/63 fitClipsToGap: no estira més de maxStretch (deixa la cua del buit buida)',
                fg2.clips.length === 1 && near(fg2.factor, 2, 0.001) &&
                near(fg2.clips[0].startSec, 1.12) && near(fg2.clips[0].endSec, 3.12) &&
                fg2.reason === 'no-omplit',
                JSON.stringify(fg2));

            var fg3 = P.fitClipsToGap([{ startSec: 0, endSec: 1 }], 0, 0.5);
            ok('#F3/64 fitClipsToGap: un buit massa curt (no cap ni un clip) → «massa-curt»',
                fg3.clips.length === 0 && fg3.reason === 'massa-curt' && fg3.dropped === 1,
                JSON.stringify(fg3));

            // El buit ha de quedar PLE (sense forats a dins) amb les frases que hi cauen.
            // (3 clips de 2 s en un buit de 10 s → factor 1,59: s'estiren per omplir-lo.)
            var fillBase = [E(0, 1, 'a'), E(11, 12, 'b')];
            var fillSint = [E(2, 4, 's1'), E(5, 7, 's2'), E(8, 10, 's3')];
            var filled = P.mergeSyntheticGaps(fillBase, fillSint, { tolSec: 0.2 });
            var fillGaps = P.findGaps(filled.entries);
            var innerGaps = fillGaps.gaps.filter(function (g) { return g.durSec > 0.13; });
            ok('#F3/65 fusio: el buit queda PLE (cap forat a dins) i les existents no es toquen',
                filled.added.length === 3 && filled.filledGaps === 1 && innerGaps.length === 0 &&
                near(filled.added[0].startSec, 1.12) &&
                near(filled.added[2].endSec, 10.88) &&
                near(filled.added[0].factor, 1.5867, 0.002) &&
                near(filled.entries[0].endSec, 1) && near(filled.entries[filled.entries.length - 1].startSec, 11) &&
                near(filled.gapSec, 0.12) && near(filled.maxStretchSec, 2),
                'afegides=' + filled.added.length + ' · forats>0.13s=' + innerGaps.length +
                ' · ' + JSON.stringify(fillGaps.gaps));

            // SELECCIO: si el SINT no compartix CAP frase amb el SRT no es pot saber
            // que siga d'eixos buits → el 🧩 no ha de col·locar res.
            var credNo = P.alignmentCredible({ pairs: 0, used: 0, method: 'cap' }, 3);
            var credOk = P.alignmentCredible({ pairs: 4, used: 3, spreadSec: 1, method: 'text' }, 3);
            var credFar = P.alignmentCredible({ pairs: 10, used: 10, method: 'fora-de-rang' }, 3);
            var credFew = P.alignmentCredible({ pairs: 2, used: 2, method: 'text-febol' }, 3);
            ok('#F3/66 alignmentCredible: exigix frases en comú (0 → NO; 3 → SÍ; fora de rang → NO)',
                credNo.ok === false && credNo.reason === 'cap-frase' &&
                credOk.ok === true && credFar.ok === false && credFar.reason === 'fora-de-rang' &&
                credFew.ok === false && credFew.reason === 'poques-frases' &&
                P.alignmentCredible(null, 3).ok === false,
                JSON.stringify([credNo, credOk, credFar, credFew]));

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
                /ce>from&&cs<to/.test(ed) && /netejat a S" \+ \(trackIdx \+ 1\)/.test(ed));
            ok('#F3/17 editor: loadSrt amb kind SINT + vistes (_stashCurrentView/switchView/hasView)',
                /var kind = \(opts && opts\.kind\)/.test(ed) && /_stashCurrentView:\s*function/.test(ed) &&
                /switchView:\s*function/.test(ed) && /hasView:\s*function/.test(ed));
            ok('#F3/18 editor: mergeSyntheticGaps llig la tolerància de la config',
                /mergeSyntheticGaps:\s*async function/.test(ed) && /srtSyntheticGapTolSec/.test(ed));
            // (BUG #188 · 2026-10-23 · BUG #224 2026-11-06) El 🧩 NOMÉS ompli la
            // taula: la fusió llig la config (durada mínima, separació de 3 frames i
            // estirament màxim), les entrades encaixades es pinten amb un to propi
            // (`e.sint`) i l'exportació al timeline ja no penja del 🧩.
            if (ed.indexOf('exportGapClips') !== -1) {
                ok('#F3/51 editor: fusió amb encaix al buit (minDur/gapSec/maxStretch) + pintat SINT', false, 'exportGapClips encara hi és');
            } else {
                ok('#F3/51 editor: fusió amb encaix al buit (minDur/gapSec/maxStretch) + pintat SINT',
                    /srtSyntheticMinDurSec/.test(ed) && /srtSyntheticGapSec/.test(ed) &&
                    /srtSyntheticMaxStretch/.test(ed) &&
                    /minDurSec: minDur/.test(ed) && /gapSec: gapSec/.test(ed) &&
                    /maxStretchSec: maxStretch/.test(ed) &&
                    /fillSint/.test(ed) && /e\.sint/.test(ed));
            }
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
            ok('#F3/21 flux: runSrtFillGaps → SrtEditor.mergeSyntheticGaps amb els candidats mesurables',
                /runSrtFillGaps:\s*async function/.test(flow) &&
                /ed\.mergeSyntheticGaps\(\{\s*candidates:\s*lista\s*\}\)/.test(flow) &&
                /cand\.all/.test(flow));

            var sc = noComments(await readRepo('js/logic/Scanner.js'));
            ok('#F3/22 Scanner.srtSynthetic: ruta de sintetics, filtre de data i prefix programa_bloc',
                /srtSynthetic:\s*async function/.test(sc) && /subtitulosSinteticos/.test(sc) &&
                /_fileDateYYYYMMDD/.test(sc) && /pBoth/.test(sc) && /pProg/.test(sc));
            // (2026-10-23 · BUG #185) `readFolder` torna NOMS solts: el path ha de
            // portar el separador. Amb `dir + pick.name` quedava
            // "...\SRT_SINTETICSMATINS_V5_..._Subtitles.srt" → readTxt fallava.
            ok('#F3/39 Scanner.srtSynthetic: el PATH porta separador (bug carpeta+nom enganxats)',
                sc.indexOf('path: dir + pick.name') === -1 &&
                /path:\s*String\(dir\)\.replace/.test(sc) && /pick\.name/.test(sc));

            var main = noComments(await readRepo('js/main.js'));
            ok('#F3/23 main: CARREGAR (blocs 15 min) · Ctrl+clic → SINT · Alt+clic RETIRAT · 🗑 RETIRAT · 🧩 cablejat',
                /runSrtLoadSynthetic/.test(main) && /e\.ctrlKey/.test(main) &&
                main.indexOf('e.altKey') === -1 && main.indexOf('forceFb') === -1 &&
                /callWorkflow\('Srt', 'runSrtLoad'\)/.test(main) &&
                main.indexOf('btnSrtDel') === -1 &&
                /btnSrtFill/.test(main) && /runSrtFillGaps/.test(main) &&
                /exportToPremiere\(toS2 \? \{ track: 1, onlyMissing: true, colorLabel: col \} : undefined\)/.test(main));

            var html = await readRepo('index.html');
            ok('#F3/24 index: 🧩 a la fila SUBTÍTOLS i 🗑 RETIRAT (Supr ho fa)',
                html.indexOf('btnSrtDel') === -1 && /id="btnSrtFill"/.test(html) &&
                /Ctrl\+clic = SUBTÍTOLS SINTÈTICS/.test(html));
            ok('#F3/25 index: cache-busts F3 (srt_editor 90, flow_srt 19, main ' +
                '109, Scanner 27, Srt_Logic 23, Config 45)',
                /srt_editor\.js\?v=90/.test(html) && /flow_srt\.js\?v=19/.test(html) &&
                /main\.js\?v=109/.test(html) && /Scanner\.js\?v=27/.test(html) &&
                /10_Srt_Logic\.js\?v=23/.test(html) && /11_Configuracio\.js\?v=45/.test(html));

            var cfg = noComments(await readRepo('js/core/11_Configuracio.js'));
            ok('#F3/26 config: srtSyntheticGapTolSec (default 0,2 s + getter)',
                /srtSyntheticGapTolSec:\s*0\.2/.test(cfg) &&
                /srtSyntheticGapTolSec:\s*\(cfg\.general\.srtSyntheticGapTolSec != null\)/.test(cfg));

            var jsx = noComments(await readRepo('jsx/modules/6_Clips.jsx'));
            ok('#F3/27 JSX: placeSrtOnExistingSubtitleTrack(item, start, trackIdx)',
                /placeSrtOnExistingSubtitleTrack:\s*function\(itemName, startSec, trackIdx\)/.test(jsx) &&
                /tracks\[idx\]/.test(jsx) && /"OK_S"/.test(jsx));

            // (2026-10-23 · BUG #184) El botó ⬇️ CARREGAR quedava MUT (cap traça al
            // FASTPASS.log) si `window.SrtEditor` no existia. Ara el clic sempre deixa
            // traça i el dispatch/init SRT també s'escriuen al fitxer.
            ok('#F3/31 main: traça SRT incondicional + fallback editor + DISPATCH/SRT-INIT al log',
                /forceLog\("\[SRT_CARREGAR\] CLIC/.test(main) &&
                /FASTPASS_UI\.Editor\.SrtEditor/.test(main) &&
                /\[DISPATCH\] Workflow inexistent/.test(main) &&
                /\[SRT-INIT\]/.test(main));

            // (2026-10-23 · BUG #185) Un .srt il·legible o un manifest SENSE rang de
            // bloc deixaven el log mut just després de "Carregant ..." / "iniciant
            // càrrega": era impossible saber per què no es carregava res.
            var edt = noComments(await readRepo('js/editor/srt_editor.js'));
            ok('#F3/40 SRT_EDIT/SRT_EMERGENCIA: cada eixida deixa el MOTIU al FASTPASS.log',
                /SRT_EDIT: NO s'ha pogut llegir/.test(edt) &&
                /el manifest NO té rang de bloc/.test(edt) &&
                /carpeta de blocs inaccessible o buida/.test(edt) &&
                /cap \.srt del bloc/.test(edt) &&
                /cap entrada dins la finestra/.test(edt));
            ok('#F3/41 flux: si loadSrt del SINT falla, el path queda al log',
                /SRT_SINT: loadSrt ha fallat amb/.test(flow));
            // (2026-10-23 · BUG #185b) En mode correcció (projecte d'ahir obert hui) el
            // manifest de la DATA DE TREBALL pot ser un stub (`ref` a null) i el
            // carregador no trobava res. Ara reintenta amb la data/bloc del projecte
            // obert, que és el que té el rang.
            ok('#F3/42 SRT_EMERGENCIA: reintent amb el manifest del PROJECTE OBERT (data/bloc de la carpeta)',
                /_projectCtxFromPath: function/.test(edt) &&
                /\^\\d\{4\}_\\d\{2\}_\\d\{2\}\$/.test(edt) &&
                /provant el del PROJECTE OBERT/.test(edt) &&
                /manifest del projecte obert/.test(edt) &&
                /\(ctx\.dateDir \|\| ''\)\.replace/.test(edt));

            // (2026-10-23 · BUG #186) L'SRT s'ancorava amb
            // `worldSecMediaStart + mp4ExpandedInPoint`; la segona xifra és una
            // coordenada DINS del MP4, NO un desplaçament de món → tot el bloc eixia
            // eixos segons ABANS del clip ("els subtítols ixen molt del principi").
            // (2026-11-06 · BUG #223) I si eixe manifest no quadra amb el clip que hi
            // ha al timeline, la base es reancora al clip real (vegeu #F3/70).
            ok('#F3/43 SRT_EMERGENCIA: base de temps = worldSecMediaStart (sense sumar mp4ExpandedInPoint)',
                /(?:const|var) refStartSec = baseMediaStart;/.test(edt) &&
                edt.indexOf('baseMediaStart + ((isFinite(theExIn)') === -1 &&
                /tlBlockInPointSec/.test(edt) &&
                /NO se suma: és coordenada de media/.test(edt));

            // (2026-11-06 · BUG #223, 2a part: BUIT AL CAP) El primer subtítol eixia
            // uns segons després de l'inici de la WF perquè (a) l'eix x=0 de l'editor
            // era el MÍNIM inPoint dels clips del MP4 —una peça residual del mateix
            // MP4 col·locada més endavant el baixa— i (b) la referència venia del
            // manifest (`worldSecMediaStart`) i no del clip que ocupa el TL 0.
            ok('#F3/70 editor: eix = media que cau al TL 0 (segs[0].m − segs[0].s) + reancoratge amb traça SRT_SYNC',
                /axisTl0 = segs\.length \? \(segs\[0\]\.m - segs\[0\]\.s\) : NaN/.test(edt) &&
                /worldStart - mediaTl0/.test(edt) &&
                /Math\.abs\(refTl - baseMediaStart\) > 0\.25/.test(edt) &&
                /🔗 SRT_SYNC/.test(edt) &&
                /_refreshWaveformSegments\(\)\) === true/.test(edt) &&
                /return true;\s*\} catch\(e\) \{ return false; \}/.test(edt),
                'tl0=' + /axisTl0 = segs\.length/.test(edt) + ' * reanc=' + /Math\.abs\(refTl/.test(edt) +
                ' * log=' + /🔗 SRT_SYNC/.test(edt) + ' * fresc=' + /=== true/.test(edt));

            // (2026-10-23 · BUG #186) EXPORTACIÓ NO DESTRUCTIVA: abans s'esborraven TOTS
            // els clips de la pista de destí ("ha eliminat els clips que hi havia");
            // ara només els que SOLAPEN amb el tram que s'escriu.
            ok('#F3/44 editor: exportar només substituïx els clips del TRAM escrit (no tota la pista)',
                /_entriesToTimeline: function \(entries\)/.test(edt) &&
                /ce>from&&cs<to/.test(edt) && /_kept_/.test(edt) &&
                edt.indexOf('nets subtítols antics de') === -1);

            // (2026-10-23 · F3.6) `onlyMissing` + lectura dels clips ja col·locats: el
            // 💾+Ctrl deixa a S2 només el que NO té clip (BUG #188: el 🧩 ja no exporta).
            ok('#F3/45 editor: `onlyMissing` (només el que falta) + lectura dels clips ja col·locats',
                /_existingSubRanges: async function/.test(edt) &&
                /onlyMissing/.test(edt) && /NOMÉS BUITS/.test(edt) &&
                /setItemColorLabel/.test(edt));
            // (F3.6) `srtGapColorLabel`: els clips SINT dels buits es poden pintar amb
            // una ALTRA etiqueta de color (💾+Ctrl → S2). (BUG #188) El 🧩 ja NO
            // exporta res: `exportGapClips` s'ha eliminat i el flux no l'ha de cridar.
            ok('#F3/46 jsx/config/flux: etiqueta de color pròpia per als clips SINT (BUG #188: el 🧩 no exporta)',
                /setItemColorLabel:\s*function\(itemName, label\)/.test(jsx) &&
                /setColorLabel/.test(jsx) &&
                /srtGapColorLabel:\s*7/.test(cfg) &&
                /srtSyntheticMinDurSec/.test(cfg) && /srtSyntheticMaxTrimSec/.test(cfg) &&
                /colorLabel:\s*col/.test(main) &&
                edt.indexOf('exportGapClips') === -1 &&
                flow.indexOf('exportGapClips') === -1 &&
                /el timeline no s'ha tocat/.test(flow));

            // (2026-10-23 · BUG #187) MATEIX PROGRAMA, SEMPRE. El nivell N3 «qualsevol
            // .srt de la data» va fer carregar `MATINS_V5_GUIO_LA_PLOMA_…` en el bloc
            // TN_COMARQUES V3 (0/68 frases en comú) i el 🧩 va col·locar al timeline
            // subtítols d'un altre programa. Ara el nom ha de començar pel codi del
            // programa (`archivo` o `wott`, amb `YYYYMMDD_` davant opcional).
            var ScanP = UI.Logic && UI.Logic.Scan;
            var progTNC = { archivo: 'TN_COMARQUES', wott: 'TNC' };
            ok('#F3/47 Scanner.srtSynthetic: el SINT ha de ser del MATEIX PROGRAMA (mai un altre)',
                !!ScanP && typeof ScanP._sintNameMatchesProg === 'function' &&
                ScanP._sintNameMatchesProg('TN_COMARQUES_V3_PEREJAUME_Subtitles.srt', progTNC) === 'TN_COMARQUES' &&
                ScanP._sintNameMatchesProg('TNC_V3_PEREJAUME_Subtitles.srt', progTNC) === 'TNC' &&
                ScanP._sintNameMatchesProg('20261022_TN_COMARQUES_V3_x_Subtitles.srt', progTNC) === 'TN_COMARQUES' &&
                ScanP._sintNameMatchesProg('MATINS_V5_GUIO_LA_PLOMA_Subtitles.srt', progTNC) === null &&
                ScanP._sintNameMatchesProg('TN_MIGDIA_V3_x_Subtitles.srt', progTNC) === null &&
                /_sintProgTokens:\s*function/.test(sc) && /delProg/.test(sc) &&
                sc.indexOf('qualsevol sintetic de la data') === -1 &&
                /mai subtitols d'un altre programa/.test(sc),
                'TNC=' + (ScanP ? ScanP._sintNameMatchesProg('TN_COMARQUES_V3_x.srt', progTNC) : '?') +
                ' MATINS=' + (ScanP ? ScanP._sintNameMatchesProg('MATINS_V5_x.srt', progTNC) : '?'));

            // (2026-10-23 · BUG #187) La data del SINT mana el PROJECTE OBERT, no el
            // rellotge: `State.dateDir` és «avui» i editant el projecte d'ahir es
            // buscaven sintètics del dia equivocat.
            ok('#F3/48 flux SINT: data del PROJECTE OBERT + descart del SINT d\'un altre programa',
                /_srtCtx:\s*async function/.test(flow) &&
                /_resolveProjectDateDir/.test(flow) && /projecte obert/.test(flow) &&
                /_sintBelongsTo:\s*function/.test(flow) && /_sintNameMatchesProg/.test(flow) &&
                /const ctx = await this\._srtCtx\(\)/.test(flow) &&
                /_sintInMemoryPath:\s*function/.test(flow) &&
                flow.indexOf('const ctx = this._srtCtx();') === -1);

            // (2026-10-23 · F3.5) COMPARACIÓ PER **TC I TEXT** en reomplir buits: el .srt
            // sintètic i el normal no surten del mateix motor, així que la mateixa frase
            // pot caure amb el TC desquadrat. Mirar només el TC duplicava subtítols.
            var baseTxt = [E(10, 12, 'Hola, món!'), E(70, 72, 'Adéu')];
            var dupTxt = P.mergeSyntheticGaps(baseTxt, [E(13.5, 14.5, 'hola mon')], { tolSec: 0.2 });
            ok('#F3/32 fusio: mateix TEXT a prop (TC desquadrat) → NO es duplica',
                dupTxt.added.length === 0 && dupTxt.rejected.length === 1 &&
                dupTxt.rejected[0].reason === 'duplicat-text',
                JSON.stringify(dupTxt.rejected.map(function (r) { return r.texts[0] + ':' + r.reason; })));

            var farTxt = P.mergeSyntheticGaps(baseTxt, [E(40, 42, 'hola mon')], { tolSec: 0.2 });
            ok("#F3/33 encaix: el mateix TEXT MOLT lluny (±10 s) SÍ que s'afegeix (repetició legítima)",
                farTxt.added.length === 1 && near(farTxt.added[0].startSec, 12.12) &&
                farTxt.added[0].reason === 'buit-ajustada',
                JSON.stringify(farTxt.added.map(function (a) { return a.startSec + ':' + a.reason; })));

            var edSrc = noComments(await readRepo('js/editor/srt_editor.js'));
            ok('#F3/34 editor: el clip del canvas NO pinta el text (només el número)',
                /ctx\.fillText\(String\(i \+ 1\), x \+ 3, by \+ bh - 4\)/.test(edSrc) &&
                edSrc.indexOf('e.texts[0]).substring(0, 22)') === -1);

            // (BUG #224 · 2026-11-06) El 🧩 ja NO es queda amb el primer .srt de la
            // carpeta: envia TOTS els candidats del programa/data i el reomplit mesura
            // cada un contra el SRT carregat (`_pickSintForFill`).
            ok('#F3/35 flux: 🧩 autocarrega els SINT si no estan en memòria (un sol clic)',
                /srtSynthetic\(ctx\)/.test(flow) && /candidates:\s*lista/.test(flow) &&
                /_pickSintForFill/.test(edSrc) && /alignmentCredible/.test(edSrc) &&
                /const lista = \(cand && cand\.all/.test(flow));

            ok('#F3/36 Scanner: llista els altres sintètics (del programa) i els descartats per programa',
                /altres del programa/.test(sc) && /descartats per programa/.test(sc));

            // (BUG #224 · 2026-11-06) El Scanner torna TOTS els candidats del programa
            // i de la data (`all`), el del BLOC primer: el 🧩 els mesura contra el SRT
            // i tria el que hi quadra. Abans només en tornava un (N1 o, si el bloc no
            // en tenia, el PRIMER de la carpeta → frases d'un altre bloc).
            ok('#F3/67 Scanner.srtSynthetic: torna TOTS els candidats (`all`), el del bloc primer',
                /all:\s*allList/.test(sc) && /var allList = delProg/.test(sc) &&
                /level: hasBoth\(f\) \? 1 : 2/.test(sc) &&
                /el 🧩 mesura els/.test(sc));

            // (2026-10-23) GUARDA DE PERTINENÇA: el SINT triat pot ser d'un altre bloc.
            var ov = P.textOverlap([E(0, 1, 'a b'), E(2, 3, 'c d')], [E(50, 51, 'A, B!'), E(60, 61, 'zzz')]);
            ok('#F3/37 textOverlap: mesura la pertinència del SINT al bloc (frases compartides, sense TC)',
                ov.hits === 1 && ov.total === 2 && ov.pct === 50, JSON.stringify(ov));
            // (BUG #224 · 2026-11-06) La guarda tova del 20 % s'ha substituït per una
            // de DURA: si el SINT no quadra amb el SRT (frases en comú) no es
            // col·loca res. Allà on hi havia l'avís hi ha ara la cancel·lació.
            ok('#F3/38 editor: sense frases en comú NO es reomple (guarda dura, abans només avís)',
                /alignmentCredible\(/.test(edSrc) && /srtSyntheticMinPairs/.test(edSrc) &&
                /cap sintètic que quadre/.test(edSrc) &&
                /REOMLIR cancel·lat/.test(edSrc) &&
                edSrc.indexOf('pot ser d\'un ALTRE bloc') === -1);

            // (BUG #189 · 2026-10-23) El SINT es desplaça a l'eix de MEDIA del NORMAL
            // ABANS de fusionar (i tambe en carregar-lo o en restaurar els marcadors).
            var mergeSrc = edSrc.split('mergeSyntheticGaps: async function')[1] || '';
            ok("#F3/58 editor: alinea el SINT a l'eix del NORMAL abans de fusionar (BUG #189)",
                /_applySintAlignment:\s*function/.test(edSrc) &&
                /estimateOffsetSec/.test(edSrc) && /shiftEntries\(holder\.entries, d\)/.test(edSrc) &&
                /this\._applySintAlignment\(\);/.test(mergeSrc) &&
                /_sintShiftSec/.test(edSrc) && /marcadors SINT desplaçats/.test(edSrc));
            // (BUG #189) Els marcadors es desen a disc en l'eix DEL FITXER (es desfà
            // `_sintShiftSec`), perque en restaurar-los se'ls aplica el desplaçament:
            // si es desessin desplaçats, cada recàrrega els tornaria a moure.
            ok("#F3/59 editor: marcadors SINT desats a l'eix del FITXER (no es desplacen dos voltes)",
                /_markersPayload:\s*function/.test(edSrc) &&
                /markers:\s*toFile\(this\._markers\)/.test(edSrc) &&
                /originalMarkers:\s*toFile\(this\._originalMarkers\)/.test(edSrc) &&
                /var sh = Number\(this\._sintShiftSec\) \|\| 0;/.test(edSrc) &&
                /Number\(m\) - sh/.test(edSrc) &&
                /var data = this\._markersPayload\(\);/.test(edSrc));
            // El desplaçament viatja amb la instantania de la vista (NORMAL↔SINT) i
            // s'acumula si una segona fusió corregeix un residual.
            ok('#F3/60 editor: el desplaçament SINT viatja amb la vista i s\'acumula',
                /sintShiftSec:\s*Number\(this\._sintShiftSec\) \|\| 0/.test(edSrc) &&
                /this\._sintShiftSec = Number\(v\.sintShiftSec\) \|\| 0;/.test(edSrc) &&
                /var shNow = shPrev \+ d;/.test(edSrc) &&
                /this\._sintShiftSec = shNow; else holder\.sintShiftSec = shNow;/.test(edSrc));
            // (BUG #190 · 2026-10-23) Quan 🧩/Ctrl+clic no troben SINT, el motiu REAL ha
            // d'arribar a la barra d'estat: abans deia «revisa rutas.subtitulosSinteticos»
            // i pareixia que el botó no responia (la carpeta estava bé; eixe dia només hi
            // havia sintetics d'un ALTRE programa i la guarda del #187 els descarta).
            ok('#F3/61 SINT absent: el motiu concret al panell (Scanner._sintMiss + _sintMissText)',
                /_sintMiss = null;/.test(sc) &&
                /reason: 'altres-programes'/.test(sc) && /reason: 'cap-del-dia'/.test(sc) &&
                /reason: 'carpeta'/.test(sc) &&
                /_sintMissText:\s*function \(ctx\)/.test(flow) &&
                /this\._sintMissText\(ctx\)/.test(flow) &&
                flow.indexOf('revisa rutas.subtitulosSinteticos') === -1 &&
                /eixe dia només n'hi ha de/.test(flow));
            // ═══ (BUG #223 · 05/11) FORMA D'ONA: MÀXIM PER GRUP I ORIGEN DEL .bin ══
            // (A) Reduir a la densitat de peaks ha de ser el MÀXIM del grup en volum
            //     (|b-128|), no la primera mostra ni la mitjana: si no, les pauses
            //     s'escurcen i els pics desapareixen de la silueta.
            // (B) El `.bin` (AUDIO_REF) es genera amb ffmpeg des del PRIMER BYTE del
            //     MP4 extret (`-i <CLIP>.mp4`, sense `-ss`), així que el seu índex 0
            //     és el MEDIA 0 del clip (handle inclòs) i NO l'IN del clip: indexar
            //     descomptant `_wfMediaStart` desplaçava tota la WF ~20 s.
            try {
                var WG = UI.Logic && UI.Logic.WaveformGenerator;
                ok('#F3/62 Logic.WaveformGenerator carregat (10_Srt_Logic.js)', !!WG && !!WG.loadPeaksFromBin);

                // WAV u8 480 Hz sintètic de 6 mostres: [128,200,128,128,100,128]
                //   maxAbs = |200-128| = 72  →  200 = 1 · 100 = 28/72 = 0,3889
                var samples223 = [128, 200, 128, 128, 100, 128];
                function u32223(v) { return String.fromCharCode(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255); }
                function u16223(v) { return String.fromCharCode(v & 255, (v >> 8) & 255); }
                var body223 = '';
                for (var s223 = 0; s223 < samples223.length; s223++) body223 += String.fromCharCode(samples223[s223]);
                var wav223 = 'RIFF' + u32223(36 + body223.length) + 'WAVE' +
                    'fmt ' + u32223(16) + u16223(1) + u16223(1) + u32223(480) + u32223(480) + u16223(1) + u16223(8) +
                    'data' + u32223(body223.length) + body223;

                var cepPrev223 = window.cep;
                var mem223 = { 'MEM://wf223a.bin': wav223, 'MEM://wf223b.bin': wav223, 'MEM://wf223c.bin': wav223 };
                window.cep = {
                    encoding: { Base64: 'Base64' },
                    fs: { readFile: function (p) { return mem223[p] ? { err: 0, data: mem223[p] } : { err: 9, data: '' }; } }
                };
                if (WG) WG._peaksCache = {};

                var full223 = WG ? await WG.loadPeaksFromBin('MEM://wf223a.bin', 480) : null;
                ok('#F3/63 .bin 480 Hz: peaks 1:1 (`|b-128|` normalitzat pel màxim del fitxer)',
                    !!full223 && full223.peaksPerSec === 480 && full223.peaks.length === 6 &&
                    near(full223.peaks[1], 1) && near(full223.peaks[4], 28 / 72) && near(full223.durSec, 6 / 480),
                    JSON.stringify(full223 && full223.peaks));

                var half223 = WG ? await WG.loadPeaksFromBin('MEM://wf223b.bin', 240) : null;
                ok('#F3/64 reducció 480→240 (step 2): MÀXIM del grup, no la 1a mostra ni la mitjana',
                    !!half223 && half223.peaksPerSec === 240 && half223.peaks.length === 3 &&
                    near(half223.peaks[0], 1) && near(half223.peaks[1], 0) && near(half223.peaks[2], 28 / 72),
                    JSON.stringify(half223 && half223.peaks));

                var third223 = WG ? await WG.loadPeaksFromBin('MEM://wf223c.bin', 160) : null;   // step 3
                ok('#F3/65 reducció 480→160 (step 3): el pic del grup sobreviu (màxim)',
                    !!third223 && third223.peaksPerSec === 160 && third223.peaks.length === 2 &&
                    near(third223.peaks[0], 1) && near(third223.peaks[1], 28 / 72),
                    JSON.stringify(third223 && third223.peaks));

                if (cepPrev223 === undefined) delete window.cep; else window.cep = cepPrev223;
                if (WG) WG._peaksCache = {};
                // ── (B) Mapa px → peaks de la WF de l'editor ──────────────────
                var SE = UI.Editor && UI.Editor.SrtEditor;
                ok('#F3/66 Editor.SrtEditor carregat (js/editor/srt_editor.js al bundle)',
                    !!SE && !!SE._computeWaveformPixels);
                var utilsPrev223 = UI.Utils;
                UI.Utils = { log: function () { }, callJSX: function () { return Promise.resolve(''); } };

                // mkEd223: peaks sintètics amb UN sol pic a `markerBinSec` (índex del
                // BIN), pps 480 i 100 px/s. El rang de MEDIA del clip és [start,end].
                function mkEd223(o) {
                    var e = Object.create(SE);
                    var n = Math.round(o.lenSec * 480);
                    var pk = new Array(n);
                    for (var i0 = 0; i0 < n; i0++) pk[i0] = 0;
                    pk[Math.round(o.markerBinSec * 480)] = 1;
                    e._waveformPeaks = pk;
                    e._waveformPPS = 480;
                    e._wfMediaStart = o.start;
                    e._wfMediaEnd = o.end;
                    e._axisOrigin = o.origin;
                    e._editWinStart = (o.winStart != null) ? o.winStart : null;
                    e._editWinEnd = null;
                    e._pixelsPerSec = 100;      // 1 px = 10 ms
                    e._canvas = { width: 400 };
                    e._computeWaveformPixels();
                    return e;
                }

                // .bin del clip SENCER (285,3 s) amb el bloc a partir de media 20,2 s:
                // el pic del bin a 22,0 s és media 22,0 → px (22−20,2)*100 = 180.
                var e223a = mkEd223({ lenSec: 285, markerBinSec: 22, start: 20.2, end: 245.2, origin: 20.2 });
                ok('#F3/67 WF: el .bin comença al MEDIA 0 (pic a 22,0 s → px 180, sense desfasament)',
                    e223a._wfPixelHeights.length === 400 &&
                    near(e223a._wfPixelHeights[180], 1) &&
                    near(e223a._wfPixelHeights[179], 0) && near(e223a._wfPixelHeights[181], 0),
                    'h[179]=' + e223a._wfPixelHeights[179] + ' h[180]=' + e223a._wfPixelHeights[180] +
                    ' h[181]=' + e223a._wfPixelHeights[181]);

                // .bin CURT (retallat a l'IN del clip, 20 s): es conserva el descompte
                // de `_wfMediaStart`, així que el pic del bin a 1,8 s és media 22,0 → px 180.
                var e223b = mkEd223({ lenSec: 20, markerBinSec: 1.8, start: 20.2, end: 40.2, origin: 20.2 });
                ok("#F3/68 WF: .bin antic retallat a l'IN → sí es descompta _wfMediaStart (px 180)",
                    e223b._wfPixelHeights.length === 400 && near(e223b._wfPixelHeights[180], 1),
                    'h[180]=' + e223b._wfPixelHeights[180]);

                // Finestra d'edició (#132): x=0 és `_editWinStart`, no l'origen de l'eix.
                var e223c = mkEd223({ lenSec: 285, markerBinSec: 22, start: 20.2, end: 245.2, origin: 20.2, winStart: 21 });
                ok("#F3/69 WF amb finestra d'edició: x=0 és _editWinStart (pic a 22,0 s → px 100)",
                    near(e223c._wfPixelHeights[100], 1), 'h[100]=' + e223c._wfPixelHeights[100]);

                if (utilsPrev223 === undefined) delete UI.Utils; else UI.Utils = utilsPrev223;
            } catch (eWf) {
                ok('#F3/62-69 forma d\'ona (#223): sense excepció', false, eWf && (eWf.message + ' | ' + eWf.stack));
            }


        } catch (eC) {
            ok('#F3 guardes del flux/UI/config: sense excepció', false, eC && (eC.message + ' | ' + eC.stack));
        }
    };
})();
