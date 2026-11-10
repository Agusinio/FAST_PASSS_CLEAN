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

            // ═══ (BUG #224-b · 09/11) MAPA PER ANCLES: el desfasament NO és constant ══
            // Mesurat al NAS (11 parells SINT↔oficial, 126 mostres): dins d'un mateix
            // parell el Δ va de -135 s a +799 s segons el tram. El que sí que es
            // conserva és l'ORDRE de les frases → mapa per trams amb les frases que
            // els dos tenen iguals com a ancles.
            var ancBase = [E(10, 12, 'a'), E(100, 102, 'b'), E(200, 202, 'c')];
            var ancSint = [E(0, 2, 'a'), E(50, 52, 'b'), E(120, 122, 'c')];
            var anc = P.mapAnchors(ancBase, ancSint);
            ok('#F3/68 mapAnchors: emparella en ordre i INTERPOLA el Δ entre ancles (no extrapola)',
                anc.used === 3 && anc.pairs === 3 && anc.method === 'ancles' &&
                near(anc.deltaMin, 10, 0.001) && near(anc.deltaMax, 80, 0.001) &&
                near(anc.map(0), 10, 0.001) &&          // ancla
                near(anc.map(50), 100, 0.001) &&        // ancla
                near(anc.map(25), 55, 0.001) &&         // mig tram: Δ interpolat 10→50
                near(anc.map(-10), 0, 0.001) &&         // abans del 1r ancla: Δ de l'extrem
                near(anc.map(200), 280, 0.001),         // més enllà: Δ de l'últim
                JSON.stringify({ used: anc.used, d: [anc.deltaMin, anc.deltaMax], m25: anc.map(25) }));

            // Monotonia: una frase REPETIDA al SINT no pot generar ancles creuats.
            var ancRep = P.mapAnchors([E(10, 11, 'hola'), E(20, 21, 'adeu'), E(30, 31, 'hola')],
                [E(0, 1, 'hola'), E(10, 11, 'hola'), E(20, 21, 'adeu'), E(30, 31, 'hola')]);
            var ancMono = true;
            for (var ai = 1; ai < ancRep.anchors.length; ai++) {
                if (!(ancRep.anchors[ai].sSec > ancRep.anchors[ai - 1].sSec)) ancMono = false;
            }
            ok('#F3/69 mapAnchors: els ancles són ESTRICTAMENT creixents (text repetit inclòs)',
                ancMono && ancRep.used >= 3, JSON.stringify(ancRep.anchors));

            var ancNo = P.mapAnchors([E(0, 1, 'res')], [E(0, 1, 'una altra cosa')]);
            var ancFew = P.mapAnchors([E(10, 11, 'a'), E(20, 21, 'b')], [E(0, 1, 'a'), E(10, 11, 'b')]);
            ok("#F3/70 mapAnchors: sense frases en comú és la IDENTITAT ('cap'); amb 1-2 ancles, 'ancles-febol'",
                ancNo.method === 'cap' && ancNo.used === 0 && near(ancNo.map(7), 7, 0.001) &&
                ancFew.method === 'ancles-febol' && ancFew.used === 2 &&
                near(ancFew.map(5), 15, 0.001) &&
                P.mapAnchors([], [], {}).method === 'cap',
                JSON.stringify([ancNo.method, ancFew.method]));

            // La fusio ha de col·locar on diu el MAPA: sense ell, la mateixa frase
            // cauria fora del tram (l'eix SINT no és l'eix del NORMAL).
            var mapBase = [E(0, 2, 'A'), E(30, 32, 'B'), E(60, 62, 'C')];
            var mapSint = [E(-40, -38, 'A'), E(-20, -18, 'B'), E(0, 2, 'C'), E(-10, -8, 'NOU')];
            var mapAnc = P.mapAnchors(mapBase, mapSint);
            var conMapa = P.mergeSyntheticGaps(mapBase, mapSint, { tolSec: 0.2, anchorMap: mapAnc });
            var senseMapa = P.mergeSyntheticGaps(mapBase, mapSint, { tolSec: 0.2 });
            ok('#F3/71 fusió amb anchorMap: la frase SINT va al buit de l\'eix NORMAL (sense mapa, fora del tram)',
                mapAnc.used === 3 && conMapa.mapped === true && conMapa.anchorUsed === 3 &&
                conMapa.added.length === 1 && near(conMapa.added[0].startSec, 32.12) &&
                conMapa.added[0].texts[0] === 'NOU' &&
                conMapa.added[0].endSec > conMapa.added[0].startSec &&
                conMapa.added[0].endSec <= 59.88 &&
                senseMapa.added.length === 0,
                'ancles=' + mapAnc.used + ' · amb-mapa=' + JSON.stringify(conMapa.added.map(function (a) { return a.startSec + '-' + a.endSec; })) +
                ' · sense-mapa=' + JSON.stringify(senseMapa.rejected.map(function (r) { return r.texts[0] + ':' + r.reason; })));

            // Amb mapa, la frase que només TOCA la vora del buit també hi entra si
            // el SINT la té ENTRE les dos ancles (BUG #261): el rang entre el clip
            // que ja hi ha abans i el que ja hi ha després és el que falta, caiga on
            // caiga en el temps. (Abans, BUG #224-b, es descartava perquè només hi
            //queia a un 25 %; es preferix SOBRAR un clip —traure'l és fàcil— que
            // quedar-se sense ell.)
            var ovBase = [E(0, 2, 'A'), E(10, 12, 'B')];
            var ovSint = [E(0, 2, 'A'), E(10, 12, 'B'), E(0.5, 2.5, 'vora'), E(4, 5, 'dins')];
            var ovMap = P.mergeSyntheticGaps(ovBase, ovSint, { tolSec: 0.2, anchorMap: P.mapAnchors(ovBase, ovSint) });
            ok('#F3/72 fusió amb mapa: tot el que el SINT té ENTRE les dos ancles entra al buit (també la de la vora)',
                ovMap.added.length === 2 &&
                ovMap.added.map(function (a) { return a.texts[0]; }).join(',') === 'vora,dins' &&
                near(ovMap.added[0].startSec, 2.12),
                JSON.stringify(ovMap.added.map(function (a) { return a.texts[0] + '@' + a.startSec; })));
            // (BUG #224-b) PER QUE LA CREDIBILITAT ES MIRA TAMBÉ AMB ANCLES: la finestra
            // de `alignmentCredible` (+-2,5 s al voltant de la MEDIANA) es buida quan el
            // text es repetix (l'index per text pren la 1a aparicio i el Delta eixix
            // dispers) → el SINT CORRECTE es descartava i el 🧩 no reomplia res. El
            // mapa per ancles, que respecta l'ORDRE, el reconeix.
            var credBase = [E(0, 1, 'A'), E(10, 11, 'B'), E(20, 21, 'A'),
                E(30, 31, 'B'), E(40, 41, 'A'), E(50, 51, 'B')];
            var credSint = credBase.map(function (x) { return E(x.startSec, x.endSec, x.texts[0]); });
            var credEst = P.estimateOffsetSec(credBase, credSint);
            var credCr = P.alignmentCredible(credEst, 3);
            var credAnc = P.mapAnchors(credBase, credSint);
            ok('#F3/74 credibilitat: text repetit → `alignmentCredible` diu NO però el mapa per ancles diu SÍ',
                credEst.pairs === 6 && credCr.ok === false && credCr.reason === 'poques-frases' &&
                credAnc.method === 'ancles' && credAnc.used === 6 &&
                credAnc.used >= 3 && near(credAnc.map(25), 25, 0.001),
                'pairs=' + credEst.pairs + ' used=' + credEst.used + ' cr=' + credCr.reason +
                ' · ancles=' + credAnc.used + '/' + credAnc.method);
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
            ok('#F3/15 editor: colors propis SINT (ROIG) i MOD (verd)',
                /'SINT'/.test(ed) && /'MOD'/.test(ed) &&
                /206,\s*38,\s*46/.test(ed) && /32,\s*160,\s*120/.test(ed));
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
                ok('#F3/51 editor: fusió amb encaix al buit (minDur/gap/maxStretch) + pintat SINT', false, 'exportGapClips encara hi és');
            } else {
                // (BUG #224-b) La separació de 3 frames (0,12 s) ja no ve de la config
                // (`srtSyntheticGapSec` suprimida): viu al parser com a `GAP` i el que
                // el 🧩 passa a la fusió és el MAPA PER ANCLES (`anchorMap`).
                ok('#F3/51 editor: fusió amb encaix al buit (minDur/GAP/maxStretch) + pintat SINT',
                    /srtSyntheticMinDurSec/.test(ed) && /srtSyntheticMaxStretch/.test(ed) &&
                    /minDurSec: minDur/.test(ed) && /maxStretchSec: maxStretch/.test(ed) &&
                    /anchorMap: anch/.test(ed) && /mapAnchors/.test(ed) &&
                    ed.indexOf('srtSyntheticGapSec') === -1 &&
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
            ok('#F3/25 index: cache-busts F3 (srt_editor 96, flow_srt 21, main ' +
                '109, Scanner 27, Srt_Logic 26, Config 46)',
                /srt_editor\.js\?v=97/.test(html) && /flow_srt\.js\?v=21/.test(html) &&
                /main\.js\?v=109/.test(html) && /Scanner\.js\?v=27/.test(html) &&
                /10_Srt_Logic\.js\?v=27/.test(html) && /11_Configuracio\.js\?v=46/.test(html));

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

            // (BUG #189 · 2026-10-23 · reescrit al #224-b 2026-11-09) L'eix del SINT es
            // creua amb un MAPA PER ANCLES. `_applySintAlignment` només MESURA i ho diu
            // al log: desplaçar la taula SINT era el que feia que cada reintent partira
            // d'un eix distint (el «desfasament inestable» del #224).
            // (BUG #224-c) la mesura es fa contra la taula oficial SENSE les entrades
            // `sint` (`measBase`), no contra la de fusió.
            ok("#F3/58 editor: el SINT es creua amb el mapa per ANCLES (no es desplaça la taula)",
                /_applySintAlignment:\s*function/.test(edSrc) &&
                /var anch = P\.mapAnchors\(base, holder\.entries\);/.test(edSrc) &&
                /var anch = P\.mapAnchors\(measBase, sint\);/.test(edSrc) &&
                /anchorMap: anch/.test(edSrc) &&
                edSrc.indexOf('shiftEntries(holder.entries') === -1);
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
            // (BUG #224-b · 2026-11-09) IDENTITAT DEL PROJECTE: el .srt de treball, el
            // nom i l'empremta només els fixa el NORMAL. Si el SINT els deixava
            // ficats, el RESET ♻️ recarregava el sintètic com a SRT del bloc i els
            // marcadors es desaven/restauraven contra eixe eix.
            ok('#F3/60 editor: el SINT no sobreescriu la identitat del projecte (RESET ♻️)',
                /this\._viewPath = srtPath;/.test(edSrc) &&
                /if \(kind === 'NORMAL'\) \{/.test(edSrc) &&
                /this\._viewPath = v\.path \|\| '';/.test(edSrc) &&
                /String\(v\.kind \|\| ''\)\.toUpperCase\(\) === 'NORMAL'/.test(edSrc) &&
                /path: this\._viewPath \|\| this\._srtPath/.test(edSrc) &&
                /name: this\._viewName \|\| this\._srtName/.test(edSrc));
            // (BUG #224-b) El RESET ♻️ recarrega SEMPRE el NORMAL (encara que s'estiga
            // veient el SINT o la MOD): si recarregara el sintètic, la base de mesura
            // quedaria contaminada i el desfasament eixiria distint a cada reintent.
            ok("#F3/73 flux: el RESET ♻️ recarrega el SRT NORMAL (kind explícit)",
                /loadSrt\(cur, \{ kind: 'NORMAL', skipMarkerRestore: true \}\)/.test(flow));
            // (BUG #224-b) La TRIERA de candidats també ha de mirar el mapa per ancles:
            // si només es mira `alignmentCredible` (finestra de +-2,5 s al voltant de la
            // mediana) un SINT correcte de Delta variable es descarta i el 🧩 no fa res.
            ok('#F3/75 editor: _pickSintForFill accepta el SINT per ANCLES (no només per la mediana)',
                /var credible = function \(ents\)/.test(edSrc) &&
                /P\.mapAnchors\(base, ents\)/.test(edSrc) &&
                /anch\.method === 'ancles' && anch\.used >= minPairs/.test(edSrc) &&
                /ok-ancles/.test(edSrc) &&
                /Math\.max\(Number\(est\.used\) \|\| 0, nAnch\)/.test(edSrc));

            // (2026-11-09 · BUG #224-c · UI) FORMA D'ONA EN BLAU: la WF es pintava
            // verda (#22cc66 damunt #0d2818) i els clips de la vista MOD també són
            // verds (`_trackStyle`), així que no es distingia la silueta d'un clip.
            // El blau no el fa servir cap taula (NORMAL lila · SINT taronja · MOD verd).
            var wfBlk = (edSrc.split('_drawWaveform: function')[1] || '')
                .split('_computeWaveformPixels: function')[0];
            ok('#F3/76 editor: la WF es pinta en BLAU FOSC (fons #071320 · pics #1f6fb5), no verda',
                /fillStyle = '#071320'/.test(wfBlk) && /fillStyle = '#1f6fb5'/.test(wfBlk) &&
                wfBlk.indexOf('#22cc66') === -1 && wfBlk.indexOf('#0d2818') === -1,
                'blau=' + /#1f6fb5/.test(wfBlk) + ' * verd=' + /#22cc66/.test(wfBlk));

            // (2026-11-09 · BUG #224-c) ELS CLIPS ESBORRATS TORNAVEN: `mergeSyntheticGaps`
            // llegia SEMPRE `_views['NORMAL']` (instantania que només canvia al canviar de
            // vista) i `deleteSelected` edita només la taula VIVA → el 🧩 partia d'una
            // copia vella i tornava a col·locar el que l'usuari havia esborrat. Ara la base
            // ix de `_baseForFill()` (viva si es veu NORMAL o MOD) i la MESURA descarta les
            // entrades `sint` (`_baseForMeasure`) per a no confirmar-se amb si mateixa.
            ok('#F3/77 editor: el 🧩 partix de la taula VIVA (no de la instantania) i mesura sense les `sint`',
                /_baseForFill:\s*function/.test(edSrc) && /_baseForMeasure:\s*function/.test(edSrc) &&
                /var fbase = this\._baseForFill\(\);/.test(edSrc) &&
                /var measBase = this\._baseForMeasure\(fbase\);/.test(edSrc) &&
                /P\.mapAnchors\(measBase, sint\)/.test(edSrc) &&
                /P\.mergeSyntheticGaps\(base, sint/.test(edSrc) &&
                /P\.estimateOffsetSec\(measBase, sint\)/.test(edSrc) &&
                /_pickSintForFill\(measBase,/.test(edSrc) &&
                /if \(!cands\[c\]\[i\]\.sint\) out\.push/.test(edSrc) &&
                /if \(this\._views && this\._views\[this\._kind\]\) this\._stashCurrentView\(\)/.test(edSrc) &&
                edSrc.indexOf('var base = baseView ? baseView.entries') === -1,
                'fill=' + /_baseForFill:\s*function/.test(edSrc) +
                ' * meas=' + /_baseForMeasure:\s*function/.test(edSrc) +
                ' * vella=' + (edSrc.indexOf('var base = baseView ? baseView.entries') >= 0));

            // (2026-11-09 · BUG #224-c) PROVA FUNCIONAL del helper (no només regex): amb
            // una vista NORMAL viva de 2 clips i una instantania vella de 3, la base del
            // 🧩 ha de ser la VIVA (el clip esborrat NO torna) i la MESURA ha de descartar
            // les entrades `sint` que ja va encaixar una fusio anterior.
            var SE = UI.Editor && UI.Editor.SrtEditor;
            if (SE && SE._baseForFill && SE._baseForMeasure) {
                var viva = [E(0, 2, 'A'), E(10, 12, 'B')];              // l'usuari ha esborrat el del mig
                var vella = { entries: [E(0, 2, 'A'), E(4, 6, 'C'), E(10, 12, 'B')], markers: [] };
                var fN = SE._baseForFill.call({ _kind: 'NORMAL', _entries: viva, _views: { NORMAL: vella } });
                var fM = SE._baseForFill.call({ _kind: 'MOD', _entries: viva, _views: { NORMAL: vella } });
                var fS = SE._baseForFill.call({ _kind: 'SINT', _entries: [E(0, 1, 'S')], _views: { NORMAL: vella } });
                // Taula viva BUIDA: la instantania NO ha de fer tornar els clips.
                var fB = SE._baseForFill.call({ _kind: 'NORMAL', _entries: [], _views: { NORMAL: vella } });
                var mixta = viva.concat([{ index: 0, timeStr: '', texts: ['X'], startSec: 20, endSec: 21, sint: true }]);
                var mida = SE._baseForMeasure.call({ _views: { NORMAL: vella } }, { entries: mixta });
                var sintMes = 0;
                for (var iM = 0; iM < mida.length; iM++) { if (mida[iM].sint) sintMes++; }
                ok('#F3/78 funcional: el 🧩 usa la taula VIVA (no la instantania) i mesura sense les `sint`',
                    fN.entries === viva && fN.live === true && fN.view === null &&
                    fM.entries === viva && fM.live === true &&
                    fS.entries === vella.entries && fS.view === vella && fS.live === false &&
                    fB.live === true && fB.entries.length === 0 &&
                    mida.length === 3 && mida[2].texts[0] === 'B' && sintMes === 0,
                    'N=' + fN.entries.length + ' M=' + fM.entries.length +
                    ' S=' + (fS.entries ? fS.entries.length : -1) +
                    ' mesura=' + mida.length + ' sint=' + sintMes);
            } else {
                ok('#F3/78 funcional: el 🧩 usa la taula VIVA (no la instantania) i mesura sense les `sint`', false,
                    'SrtEditor=' + !!SE + ' fill=' + !!(SE && SE._baseForFill) +
                    ' meas=' + !!(SE && SE._baseForMeasure));
            }

            // ═══ (BUG #257 · 2026-11-09) EL SINT NO ES RETALLA EN CARREGAR-SE ═══════
            // El fitxer de marcadors va lligat al NOM i a l'EMPREMTA del SRT oficial,
            // però eixa empremta no canvia en carregar un SINT (#224-b) → es
            // restauraven els marcadors del SRT OFICIAL i `_applyAllMarkers()` muntava
            // la taula SINT amb els eixos d'un altre fitxer: clips sencers
            // desapareixien (l'usuari ho veu com «falta la primera part de la frase i
            // el clip anterior acaba en punt»). En vista SINT no es restaura res.
            var loadBlk = (edSrc.split('loadSrt: async function')[1] || '').split('loadEmergencySrt:')[0];
            ok("#F3/79 editor: en vista SINT no es restauren marcadors ni s'aplica el warp (#257)",
                /var sintView = \(kind === 'SINT'\);/.test(loadBlk) &&
                /if \(sintView\) \{[\s\S]{0,400}?log\(/.test(loadBlk) &&
                /else if \(skipMarkerRestore\) log\(/.test(loadBlk) &&
                /if \(!sintView\) this\._applyAllMarkers\(\);/.test(loadBlk) &&
                !/^ {12}this\._applyAllMarkers\(\);$/m.test(loadBlk),
                'sintView=' + /var sintView = \(kind === 'SINT'\);/.test(loadBlk) +
                ' guard=' + /if \(!sintView\) this\._applyAllMarkers\(\);/.test(loadBlk) +
                ' senseGuarda=' + /^ {12}this\._applyAllMarkers\(\);$/m.test(loadBlk));
            ok('#F3/80 editor: en vista SINT no es desen marcadors (no esborra els del SRT oficial)',
                /_persistMarkers: function \(\) \{[\s\S]{0,700}?=== 'SINT'\)[\s\S]{0,300}?return;/.test(edSrc) &&
                /clic dret ignorat en vista SINT/.test(edSrc));
            // PROVA FUNCIONAL: sense marcadors la taula SINT es copia SENCERA; amb
            // marcadors d'un altre eix (el cas del bug) en perden. El detall del test
            // deixa el número al log perquè quede clar per què cal el guard.
            if (SE && SE._applyAllMarkers) {
                function sintTaula() {
                    return [E(0.0, 1.8, 'A'), E(2.0, 3.9, 'B'), E(4.1, 5.7, 'C'), E(6.0, 8.2, 'D')];
                }
                var edNet = Object.create(SE);
                edNet._originalEntries = sintTaula();
                edNet._originalMarkers = [];
                edNet._markers = [];
                edNet._applyAllMarkers();
                var edAli = Object.create(SE);
                edAli._originalEntries = sintTaula();
                edAli._originalMarkers = [40, 80];   // eix del SRT oficial (90 s)
                edAli._markers = [40, 80];
                edAli._applyAllMarkers();
                ok('#F3/81 funcional: sense marcadors el SINT es conserva sencer (amb marcadors aliens es perd)',
                    edNet._entries.length === 4 && edNet._entries[3].texts[0] === 'D',
                    'nete=' + edNet._entries.length + '/4 · amb marcadors aliens=' + edAli._entries.length + '/4');
            } else {
                ok('#F3/81 funcional: sense marcadors el SINT es conserva sencer (amb marcadors aliens es perd)', false,
                    'SrtEditor=' + !!SE + ' warp=' + !!(SE && SE._applyAllMarkers));
            }
            // (2026-11-09) ROIG per al SINT (abans taronja) i WF menys amplificada.
            var stBlk = (edSrc.split('_trackStyle: function')[1] || '').split('_clipAtSec:')[0];
            ok('#F3/82 editor: els clips SINT en ROIG (no taronja) i la WF menys amplificada (gain 1.8)',
                /fillSint: 'rgba\(206,38,46/.test(stBlk) &&
                /strokeSint: 'rgba\(255,138,138/.test(stBlk) &&
                /fill: 'rgba\(176,30,38/.test(stBlk) &&
                stBlk.indexOf('212,120,32') === -1 &&
                /_waveformGain: 1\.8,/.test(edSrc),
                'roig=' + /rgba\(206,38,46/.test(stBlk) +
                ' * taronja=' + (stBlk.indexOf('212,120,32') >= 0) +
                ' * gain=' + /_waveformGain: 1\.8,/.test(edSrc));

            // ═══ (BUG #257 · 2026-11-09) ELS FITXERS DE MARCADORS S'ESBORREN ═══════
            // Un `fastpass_srt_markers_*.json` orfe no ha de sobreviure ni al RESET ni
            // al tancament del projecte: el V3 tenia el del SINT (creat pel bug) dins
            // la carpeta del projecte i podia re-infectar la vista. ABANS es BUIDAVA
            // (`writeFile(path,'')`) i el .json buit es quedava al costat del manifest.
            var wipeBlk = (edSrc.split('_wipeMarkersFile: function')[1] || '').split('wipeMarkersForProject')[0];
            ok("#F3/83 editor: `_wipeMarkersFile` ESBORRA el .json (deleteFile, no writeFile buit)",
                /_deleteFiles\(\[full\]\)/.test(wipeBlk) &&
                /_deleteFiles: function \(paths\)/.test(edSrc) &&
                /fs\.deleteFile\(p\)/.test(edSrc) &&
                !/writeFile\(full, ''\)/.test(wipeBlk) &&
                !/writeFile\(full, ""\)/.test(wipeBlk),
                'del=' + /_deleteFiles\(\[full\]\)/.test(wipeBlk) +
                ' api=' + /fs\.deleteFile\(p\)/.test(edSrc) +
                ' * buit=' + (/writeFile\(full, ''\)/.test(wipeBlk) || /writeFile\(full, ""\)/.test(wipeBlk)));
            var wfpBlk = (edSrc.split('wipeMarkersForProject: function')[1] || '').split('_persistMarkers')[0];
            ok('#F3/84 editor: `wipeMarkersForProject` esborra els marcadors de DINS del projecte (SINT inclòs)',
                /readdir\(rawF\.replace/.test(wfpBlk) &&
                /baseP \+ '\/' \+ nmA/.test(wfpBlk) &&
                /_deleteFiles\(\[full\]\)/.test(wfpBlk) &&
                !/writeFile\(full, ''\)/.test(wfpBlk),
                'readdir=' + /readdir\(rawF\.replace/.test(wfpBlk) +
                ' del=' + /_deleteFiles\(\[full\]\)/.test(wfpBlk) +
                ' * buit=' + /writeFile\(full, ''\)/.test(wfpBlk));
            var resetBlk = (flow.split('runSrtReset: async function')[1] || '').split('runSrtLoad:')[0];
            ok('#F3/85 flux: el RESET ♻️ esborra TOTS els fitxers de marcadors del projecte',
                /ed\._wipeMarkersFile\(cur\)/.test(resetBlk) &&
                /ed\.wipeMarkersForProject\(ed\._projectKey\)/.test(resetBlk),
                'wipe=' + /ed\._wipeMarkersFile\(cur\)/.test(resetBlk) +
                ' projecte=' + /ed\.wipeMarkersForProject\(ed\._projectKey\)/.test(resetBlk));
            ok("#F3/86 editor: en carregar el SINT s'esborra el seu fitxer de marcadors (restes del #257)",
                /if \(sintView\) \{[\s\S]{0,400}?this\._wipeMarkersFile\(this\._viewName \|\| this\._srtName\);/.test(loadBlk),
                'wipeSint=' + /this\._wipeMarkersFile\(this\._viewName \|\| this\._srtName\);/.test(loadBlk));

            // PROVA FUNCIONAL amb un `cep.fs` simulat (memòria): esborra DE DEBÒ (no
            // deixa fitxers buits), treu el del projecte i el del SINT, i respecta el
            // manifest i els marcadors d'un ALTRE projecte.
            if (SE && SE._deleteFiles && SE.wipeMarkersForProject && SE._wipeMarkersFile) {
                var cepPrev257 = window.cep;
                function n257(p) { return String(p).replace(/\\/g, '/'); }
                var files257 = {};
                files257['C:/proj257/fastpass_srt_markers_emergencia_EMERGENCIA.json'] = '{"projectKey":"C:\\\\proj257","markers":[1]}';
                files257['C:/proj257/fastpass_srt_markers_TN_SINT.json'] = '{"projectKey":"C:\\\\proj257","markers":[2]}';
                files257['C:/proj257/manifest.fastpass.json'] = '{}';
                files257['C:/temp/fastpass_srt_markers_emergencia_EMERGENCIA.json'] = '{"projectKey":"C:\\\\proj257","markers":[1]}';
                files257['C:/temp/fastpass_srt_markers_daltre.json'] = '{"projectKey":"C:\\\\ALTRE","markers":[3]}';
                function ls257(dir) {
                    var d = n257(dir).replace(/\/+$/, '') + '/';
                    var out = [];
                    for (var k in files257) {
                        if (!Object.prototype.hasOwnProperty.call(files257, k)) continue;
                        if (k.indexOf(d) !== 0) continue;
                        if (k.slice(d.length).indexOf('/') !== -1) continue;
                        out.push(k.slice(d.length));
                    }
                    return { err: 0, data: out };
                }
                window.cep = {
                    fs: {
                        deleteFile: function (p) {
                            var q = n257(p);
                            if (!Object.prototype.hasOwnProperty.call(files257, q)) return { err: 9 };
                            delete files257[q]; return { err: 0 };
                        },
                        writeFile: function (p, d) { files257[n257(p)] = d; return { err: 0 }; },
                        readFile: function (p) {
                            var q = n257(p);
                            return Object.prototype.hasOwnProperty.call(files257, q) ? { err: 0, data: files257[q] } : { err: 9, data: '' };
                        },
                        readdir: function (d) { return ls257(d); }
                    }
                };
                var edW257 = Object.create(SE);
                edW257._projectKey = 'C:\\proj257';
                edW257._srtName = 'emergencia_EMERGENCIA';
                var nDel257 = edW257.wipeMarkersForProject('C:\\proj257');
                var qued257 = Object.keys(files257).sort().join(',');
                ok('#F3/87 funcional: el RESET esborra el .json del projecte i el del SINT (respecta manifest i altres projectes)',
                    nDel257 === 3 && qued257 === 'C:/proj257/manifest.fastpass.json,C:/temp/fastpass_srt_markers_daltre.json',
                    'n=' + nDel257 + ' queden=[' + qued257 + ']');
                var nWipe257 = edW257._wipeMarkersFile('emergencia_EMERGENCIA.srt');
                var buits257 = Object.keys(files257).filter(function (k) { return files257[k] === ''; }).length;
                ok('#F3/88 funcional: `_wipeMarkersFile` esborra (no deixa cap .json buit)',
                    !Object.prototype.hasOwnProperty.call(files257, 'C:/proj257/fastpass_srt_markers_emergencia_EMERGENCIA.json') && buits257 === 0,
                    'n=' + nWipe257 + ' buits=' + buits257);
                if (cepPrev257 === undefined) delete window.cep; else window.cep = cepPrev257;
            } else {
                ok('#F3/87 funcional: el RESET esborra el .json del projecte i el del SINT (respecta manifest i altres projectes)', false,
                    'SrtEditor=' + !!SE + ' del=' + !!(SE && SE._deleteFiles) + ' wipe=' + !!(SE && SE.wipeMarkersForProject));
                ok('#F3/88 funcional: `_wipeMarkersFile` esborra (no deixa cap .json buit)', false,
                    'SrtEditor=' + !!SE + ' wipe=' + !!(SE && SE._wipeMarkersFile));
            }

            // ═══ (BUG #258 · 2026-11-10) EL MARCADOR S'ANCLA AL CLIP ORIGINAL ═══════
            // Report de l'usuari: «així com la posició dels clips es calcula sempre
            // respecte del original per a evitar errors acumulatius, els marcadors es
            // referencien només al timeline … haurien d'anar referenciats al clip en
            // el fitxer original». Un marcador passa a ser un REGISTRE
            // `{num, clip ancla, extrem (in/out), TC destí}`: el punt de referència
            // del warp es re-deriva SEMPRE del clip original, mai d'una posició.
            ok('#F3/89 editor: el marcador porta identitat (núm + clip ancla + extrem + TC destí)',
                /_markerAnchors:\s*\[\]/.test(edSrc) && /_nextMarkerNum:\s*1/.test(edSrc) &&
                /_nearestClipEdge:\s*function/.test(edSrc) &&
                /_refreshOriginalFromAnchors:\s*function/.test(edSrc) &&
                /_sortMarkers:\s*function/.test(edSrc) &&
                /_addMarker:\s*function/.test(edSrc) &&
                /_removeMarkerAt:\s*function/.test(edSrc) &&
                /_remapAnchorsAfterDelete:\s*function/.test(edSrc) &&
                /_shiftAnchors:\s*function/.test(edSrc) &&
                /anchors:\s*anchors/.test(edSrc) &&
                /nextNum:\s*this\._nextMarkerNum/.test(edSrc) &&
                /_applyAllMarkers: function \(\) \{[\s\S]{0,1200}?_refreshOriginalFromAnchors\(\)/.test(edSrc) &&
                // Les ancles viatgen amb la instantània de vista (switchView NORMAL↔SINT)
                /markerAnchors: \(this\._markerAnchors \|\| \[\]\)\.map/.test(edSrc) &&
                /this\._markerAnchors = \(v\.markerAnchors \|\| \[\]\)\.map/.test(edSrc),
                'ancles=' + /_markerAnchors:\s*\[\]/.test(edSrc) +
                ' refresh=' + /_refreshOriginalFromAnchors:\s*function/.test(edSrc) +
                ' payload=' + /anchors:\s*anchors/.test(edSrc) +
                ' vista=' + /markerAnchors: \(this\._markerAnchors \|\| \[\]\)\.map/.test(edSrc));

            var SE2 = UI.Editor && UI.Editor.SrtEditor;
            if (SE2 && SE2._addMarker && SE2._nearestClipEdge && SE2._applyAllMarkers) {
                // Taula ORIGINAL de 3 clips; el marcador ha d'apuntar a l'EXTREM del
                // clip (inici/final), no al segon on s'ha deixat anar.
                function newEd258() {
                    var ed = Object.create(SE2);
                    ed._originalEntries = [E(0, 2), E(4, 6), E(10, 14)];
                    ed._entries = [E(0, 2), E(4, 6), E(10, 14)];
                    ed._markers = []; ed._originalMarkers = [];
                    ed._markerAnchors = []; ed._nextMarkerNum = 1;
                    return ed;
                }
                var edA = newEd258();
                var nearA = SE2._nearestClipEdge.call(edA, 5.9);
                var ancA = edA._addMarker(5.9);     // cau vora el FINAL del clip 2 (6 s)
                var ancB = edA._addMarker(11.9);    // cau vora l'INICI del clip 3 (10 s)
                ok('#F3/90 funcional: `_nearestClipEdge`/`_addMarker` anclen a l\'EXTREM del clip (no al TC del clic)',
                    nearA && nearA.clip === 1 && nearA.edge === 'out' && near(nearA.time, 6) &&
                    ancA && ancA.clip === 1 && ancA.edge === 'out' && near(ancA.orig, 6) &&
                    ancB && ancB.clip === 2 && ancB.edge === 'in' && near(ancB.orig, 10) &&
                    near(edA._markers[0], 6) && near(edA._markers[1], 10) &&
                    near(edA._originalMarkers[0], 6) && near(edA._originalMarkers[1], 10),
                    'near=' + JSON.stringify(nearA) + ' A=' + JSON.stringify(ancA) + ' B=' + JSON.stringify(ancB) +
                    ' dest=' + JSON.stringify(edA._markers) + ' orig=' + JSON.stringify(edA._originalMarkers));
            } else {
                ok('#F3/90 funcional: `_nearestClipEdge`/`_addMarker` anclen a l\'EXTREM del clip (no al TC del clic)', false,
                    'SrtEditor=' + !!SE2 + ' add=' + !!(SE2 && SE2._addMarker));
            }

            // (BUG #258) PROVA FUNCIONAL del warp: el marcador arrossegat canvia el
            // DESTÍ, però el punt de referència ix del CLIP original → dos
            // aplicacions seguides donen exactament el mateix (cap error acumulatiu).
            if (SE2 && SE2._addMarker && SE2._applyAllMarkers && SE2._markersPayload) {
                var edW = Object.create(SE2);
                edW._originalEntries = [E(0, 2), E(4, 6), E(10, 14)];
                edW._entries = [E(0, 2), E(4, 6), E(10, 14)];
                edW._markers = []; edW._originalMarkers = [];
                edW._markerAnchors = []; edW._nextMarkerNum = 1;
                var aW1 = edW._addMarker(1.9);    // ancla clip 1/final (2 s)
                var aW2 = edW._addMarker(11.9);   // ancla clip 3/inici (10 s)
                edW._markers[0] = 1.0;            // l'usuari ARROSSEGA el 1r marcador a 1 s
                edW._applyAllMarkers();
                var sigW = function () {
                    return edW._entries.map(function (x) {
                        return Number(x.startSec).toFixed(3) + '-' + Number(x.endSec).toFixed(3);
                    }).join('|');
                };
                var tW1 = sigW();
                edW._applyAllMarkers();
                var tW2 = sigW();
                ok('#F3/91 funcional: el warp partix del CLIP ORIGINAL (no del TC) i és idempotent',
                    aW1 && aW1.clip === 0 && aW1.edge === 'out' &&
                    aW2 && aW2.clip === 2 && aW2.edge === 'in' &&
                    near(edW._originalMarkers[0], 2) && near(edW._originalMarkers[1], 10) &&
                    edW._entries.length === 3 && tW1 === tW2,
                    'anc1=' + JSON.stringify(aW1) + ' anc2=' + JSON.stringify(aW2) +
                    ' orig=' + JSON.stringify(edW._originalMarkers) + ' t1=' + tW1 + ' t2=' + tW2);

                // Esborrar un CLIP ha de reindexar les ancles (són índexs, no TCs).
                edW._remapAnchorsAfterDelete(0);
                ok('#F3/92 funcional: esborrar un clip REINDEXA les ancles (no apunten a un altre clip)',
                    aW1.clip === -1 && aW1.edge === null &&
                    aW2.clip === 1 && aW2.edge === 'in' &&
                    near(aW1.orig, edW._originalMarkers[0]),
                    'anc1=' + JSON.stringify(aW1) + ' anc2=' + JSON.stringify(aW2));

                // El TC de destí i la identitat viatgen junts al fitxer de marcadors.
                var jW = JSON.parse(edW._markersPayload());
                ok('#F3/93 funcional: `_markersPayload` desa {num, clip, edge} + TC destí de cada marcador',
                    jW && Array.isArray(jW.anchors) && jW.anchors.length === edW._markers.length &&
                    jW.anchors.length === jW.markers.length &&
                    jW.anchors[1] && jW.anchors[1].clip === 1 && jW.anchors[1].edge === 'in' &&
                    jW.nextNum === edW._nextMarkerNum,
                    'anchors=' + JSON.stringify(jW.anchors) + ' markers=' + JSON.stringify(jW.markers) +
                    ' next=' + jW.nextNum);

                // Borrar un marcador trau les TRES llistes (mai queden desalineades).
                var nBefore = edW._markers.length;
                edW._removeMarkerAt(0);
                ok('#F3/94 funcional: `_removeMarkerAt` manté alineades les tres llistes',
                    edW._markers.length === nBefore - 1 &&
                    edW._markerAnchors.length === edW._markers.length &&
                    edW._originalMarkers.length === edW._markers.length,
                    'm=' + edW._markers.length + ' a=' + edW._markerAnchors.length + ' o=' + edW._originalMarkers.length);

                // Un IN/OUT que trau clips ha de DESPLAÇAR les ancles (són índexs).
                var edS = Object.create(SE2);
                edS._markers = [5, 20]; edS._originalMarkers = [5, 20];
                edS._markerAnchors = [
                    { num: 1, clip: 0, edge: 'in', orig: 5 },
                    { num: 2, clip: 3, edge: 'in', orig: 20 }
                ];
                edS._nextMarkerNum = 3;
                edS._shiftAnchors(2, -1);          // un IN trau els 2 primers clips
                var inOk = edS._markerAnchors[0].clip === -1 && edS._markerAnchors[1].clip === 1;
                var edS2 = Object.create(SE2);
                edS2._markers = [5]; edS2._originalMarkers = [5];
                edS2._markerAnchors = [{ num: 1, clip: 3, edge: 'out', orig: 5 }];
                edS2._nextMarkerNum = 2;
                edS2._shiftAnchors(0, 3);          // un OUT deixa la taula en 3 clips
                ok('#F3/95 funcional: `_shiftAnchors` remapea les ancles quan IN/OUT trauen clips',
                    inOk && edS2._markerAnchors[0].clip === -1 && edS2._markerAnchors[0].edge === null,
                    'IN=' + JSON.stringify(edS._markerAnchors) + ' OUT=' + JSON.stringify(edS2._markerAnchors));
            } else {
                ok('#F3/91 funcional: el warp partix del CLIP ORIGINAL (no del TC) i és idempotent', false,
                    'SrtEditor=' + !!SE2 + ' apply=' + !!(SE2 && SE2._applyAllMarkers));
                ok('#F3/92 funcional: esborrar un clip REINDEXA les ancles (no apunten a un altre clip)', false,
                    'remap=' + !!(SE2 && SE2._remapAnchorsAfterDelete));
                ok('#F3/93 funcional: `_markersPayload` desa {num, clip, edge} + TC destí de cada marcador', false,
                    'payload=' + !!(SE2 && SE2._markersPayload));
                ok('#F3/94 funcional: `_removeMarkerAt` manté alineades les tres llistes', false,
                    'remove=' + !!(SE2 && SE2._removeMarkerAt));
                ok('#F3/95 funcional: `_shiftAnchors` remapea les ancles quan IN/OUT trauen clips', false,
                    'shift=' + !!(SE2 && SE2._shiftAnchors));
            }

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


            // ═══ (BUG #259 · 10/11) SINT: es perdia UN CLIP DE CADA DOS ═════════
            // `mergeSyntheticGaps` descartava com a «duplicat» dos subtítols
            // CONSECUTIUS del SINT (van pegats o a 3 frames = 0,12 s) perquè el
            // filtre preguntava amb `_overlaps(..., tol)`, i `tol`=0,2 s compta com
            // a solapament el SIMPLE CONTACTE. Dins d'un buit es quedava un sí i un
            // no. Es prova amb el codi REAL: 6 frases seguides dins d'un buit.
            try {
                var base259 = [
                    { index: 1, timeStr: '', texts: ['inici'], startSec: 0, endSec: 2 },
                    { index: 2, timeStr: '', texts: ['final'], startSec: 30, endSec: 32 }
                ];
                var sint259 = [];
                for (var q259 = 0; q259 < 6; q259++) {
                    sint259.push({
                        index: q259 + 1, timeStr: '', texts: ['frase ' + (q259 + 1)],
                        startSec: 4 + q259 * 2, endSec: 6 + q259 * 2   // PEGADES
                    });
                }
                var r259 = P.mergeSyntheticGaps(base259, sint259, {});
                var raz259 = (r259.rejected || []).map(function (x) { return x.reason; }).join(',');
                ok('#F3/96 funcional: un SINT amb frases CONSECUTIVES ompli el buit SENCER (no 1 de cada 2)',
                    r259.added.length === 6 && r259.entries.length === 8,
                    'added=' + r259.added.length + ' entries=' + r259.entries.length + ' rejected=' + raz259);

                // …i dos sintetics REALMENT solapats (el mateix instant) sí que són
                // la mateixa frase: es queda un (l'anti-duplicat no s'ha perdut).
                var sint259b = [
                    { index: 1, timeStr: '', texts: ['una'], startSec: 10, endSec: 13 },
                    { index: 2, timeStr: '', texts: ['altra'], startSec: 10.1, endSec: 12.9 }
                ];
                var r259b = P.mergeSyntheticGaps(base259, sint259b, {});
                ok('#F3/97 funcional: dos SINT solapats DE DEBÒ continuen comptant com un (anti-duplicat intacte)',
                    r259b.added.length === 1,
                    'added=' + r259b.added.length + ' rejected=' +
                    (r259b.rejected || []).map(function (x) { return x.reason; }).join(','));
            } catch (e259) {
                ok('#F3/96-97 sintetics consecutius (#259): sense excepcio', false, e259 && (e259.message + ' | ' + e259.stack));
            }

            // ═══ (BUG #261 · 10/11) SINT: ES PERDIA EL CLIP DE CADA VORE ═══════
            // En omplir un buit, el PRIMER i l'ÚLTIM clip del SINT podien quedar-se
            // fora del buit (el mapa d'eixos els mou unes decimes i el filtre de
            // solapament els descartava): l'usuari veia «en falta un al principi i un
            // al final». Ara el que falta és el RANG de frases que el SINT té ENTRE
            // el clip que ja hi ha abans i el que ja hi ha després (exclusiu).
            try {
                var base261 = [E(0, 2, 'a'), E(2, 4, 'b'), E(10, 12, 'e'), E(12, 14, 'f')];
                var sint261 = [E(0, 2, 'a'), E(2, 4, 'b'), E(3.2, 4.6, 'c1'),
                    E(4.8, 6.2, 'c2'), E(6.4, 7.8, 'c3'), E(8.0, 9.4, 'c4'),
                    E(10, 12, 'e'), E(12, 14, 'f')];
                var map261 = P.mapAnchors(base261, sint261);
                var r261 = P.mergeSyntheticGaps(base261, sint261,
                    { tolSec: 0.2, anchorMap: map261, squeezeDurSec: 0.12 });
                var txt261 = r261.added.map(function (a) { return a.texts[0]; }).join(',');
                ok('#F3/103 vores ancorades: entra el clip del PRINCIPI encara que el mapa el deixe fora del buit',
                    map261.used >= 3 && r261.added.length === 4 && txt261 === 'c1,c2,c3,c4',
                    'ancles=' + map261.used + ' added=' + txt261);
                var r261v = P.mergeSyntheticGaps(base261, sint261,
                    { tolSec: 0.2, anchorMap: map261, anchorEdges: false });
                ok('#F3/104 `anchorEdges:false` torna el criteri temporal (el clip del vore es perd)',
                    r261v.added.length === 3 && r261v.added[0].texts[0] === 'c2',
                    'added=' + r261v.added.map(function (a) { return a.texts[0]; }).join(','));

                // Sense ancla a la DRETA (el veí no és al SINT): la vora es tanca per
                // temps amb `edgeGraceSec` i el clip que s'endinsa en el veí hi entra.
                var base261b = [E(0, 2, 'a'), E(2, 4, 'b'), E(10, 12, 'e')];
                var sint261b = [E(0, 2, 'a'), E(2, 4, 'b'), E(4.8, 6.2, 'c1'),
                    E(6.4, 7.8, 'c2'), E(8.0, 9.4, 'c3'), E(9.6, 11.2, 'c4')];
                var r261b = P.mergeSyntheticGaps(base261b, sint261b, { tolSec: 0.2 });
                ok('#F3/105 sense ancla a la dreta, el clip que s\'endinsa en el veí SÍ que entra (vora per temps)',
                    r261b.added.length === 4 &&
                    r261b.added[3].texts[0] === 'c4' && near(r261b.added[3].endSec, 9.88),
                    'added=' + r261b.added.map(function (a) { return a.texts[0] + '@' + a.startSec + '-' + a.endSec; }).join(' '));

                // `squeezeDurSec`: si no hi caben amb la durada mínima, s'apreten tots
                // (mai es descarta la cua: perdre un clip és pitjor que vore'l just).
                var five261 = [];
                for (var q261 = 0; q261 < 5; q261++) {
                    five261.push({ startSec: 2 + q261 * 0.6, endSec: 2.5 + q261 * 0.6 });
                }
                var fgSq = P.fitClipsToGap(five261, 1, 3, { minDurSec: 0.4, squeezeDurSec: 0.12 });
                var fgNo = P.fitClipsToGap(five261, 1, 3, { minDurSec: 0.4 });
                ok('#F3/106 squeezeDurSec: si no caben amb la durada mínima s\'apreten tots (no es retalla la cua)',
                    fgSq.clips.length === 5 && fgSq.dropped === 0 &&
                    fgNo.clips.length === 3 && fgNo.dropped === 2,
                    'amb-squeeze=' + fgSq.clips.length + '/drop' + fgSq.dropped +
                    ' · sense=' + fgNo.clips.length + '/drop' + fgNo.dropped);
            } catch (e261) {
                ok('#F3/103-106 vores ancorades (#261): sense excepcio', false, e261 && (e261.message + ' | ' + e261.stack));
            }

            // ═══ (BUG #260 · 10/11) EL CLIP SINT CONSERVA EL ROIG EN EDITAR ════
            // En editar (warp de marcadors, IN/OUT, AJUSTAR) la taula es
            // reconstruïa amb objectes NOUS sense `sint` → el clip sintètic passava
            // a pintar-se verd («com els normals») i deixava de comptar com a SINT.
            try {
                var mix260 = [
                    { index: 1, timeStr: '', texts: ['oficial'], startSec: 0, endSec: 2 },
                    { index: 2, timeStr: '', texts: ['sintetic'], startSec: 2.12, endSec: 4, sint: true }
                ];
                var sc260 = P.scaleSegmentWithGaps(mix260, [0, 0.12, 0], 0, 10);
                ok('#F3/98 funcional: `scaleSegmentWithGaps` (warp de marcadors) conserva la marca `sint`',
                    sc260.length === 2 && !sc260[0].sint && sc260[1].sint === true,
                    JSON.stringify(sc260.map(function (e) { return [e.startSec, e.endSec, !!e.sint]; })));
                // Rang degenerat (newEnd <= newStart): tampoc no ha de perdre la marca.
                var dg260 = P.scaleSegmentWithGaps(mix260, [0, 0.12, 0], 5, 5);
                ok('#F3/99 funcional: `scaleSegmentWithGaps` amb rang degenerat conserva `sint`',
                    dg260.length === 2 && dg260[1].sint === true && !dg260[0].sint,
                    JSON.stringify(dg260.map(function (e) { return !!e.sint; })));
                // IN/OUT/AJUSTAR (funcions pures que criden l'editor i el flux).
                var ti260 = P.applyTrimIn(mix260, 0, 0.4);
                var to260 = P.applyTrimOut(mix260, 1);
                var ta260 = P.applyTimeAdjust(mix260, 20, 0.04);
                ok('#F3/100 funcional: `applyTrimIn`/`applyTrimOut`/`applyTimeAdjust` conserven `sint`',
                    ti260[1].sint === true && to260[1].sint === true && ta260[1].sint === true &&
                    !ti260[0].sint && !to260[0].sint && !ta260[0].sint,
                    'in=' + !!ti260[1].sint + ' out=' + !!to260[1].sint + ' ajustar=' + !!ta260[1].sint);
            } catch (e260) {
                ok('#F3/98-100 marca sint (#260): sense excepcio', false, e260 && (e260.message + ' | ' + e260.stack));
            }

            // (BUG #260) L'EDITOR: les reconstruccions de taula passen per
            // `_entryCopy` (que conserva `sint`) i el clip SINT seleccionat es
            // pinta amb el vel ROIG propi (`selSint`), no amb el de la vista.
            try {
                var ed260 = noComments(await readRepo('js/editor/srt_editor.js'));
                var fnIn260 = (ed260.split('applyIn: function')[1] || '').split('applyOut: function')[0];
                var fnOut260 = (ed260.split('applyOut: function')[1] || '').split('applyAdjust: function')[0];
                var fnAdj260 = (ed260.split('applyAdjust: function')[1] || '').split('_entriesToTimeline: function')[0];
                var fnWarp260 = (ed260.split('_applyAllMarkers: function')[1] || '').split('_applyMarkerDrag: function')[0];
                ok('#F3/101 estàtic: `_entryCopy` conserva `sint` i el fan servir warp/IN/OUT/AJUSTAR',
                    /_entryCopy: function \(e, deltaSec\)/.test(ed260) &&
                    /if \(e\.sint\) c\.sint = true;/.test(ed260) &&
                    (ed260.match(/this\._entryCopy\(/g) || []).length >= 5 &&
                    !/return \{ index: /.test(fnIn260) && !/return \{ index: /.test(fnOut260) &&
                    !/return \{ index: /.test(fnAdj260) &&
                    !/result\.push\(\{ index: /.test(fnWarp260),
                    'usos=' + (ed260.match(/this\._entryCopy\(/g) || []).length);
                ok('#F3/102 estàtic: el clip SINT SELECCIONAT es pinta amb `selSint` (roig) i no amb el de la vista',
                    /selSint: 'rgba\(255,64,64,0\.42\)'/.test(ed260) &&
                    (ed260.match(/selSint: SINTF\.selSint/g) || []).length === 3 &&
                    /fromSint \? st\.selSint : st\.sel/.test(ed260));
            } catch (e260b) {
                ok('#F3/101-102 editor (#260): sense excepcio', false, e260b && (e260b.message + ' | ' + e260b.stack));
            }

        } catch (eC) {
            ok('#F3 guardes del flux/UI/config: sense excepció', false, eC && (eC.message + ' | ' + eC.stack));
        }
    };
})();
