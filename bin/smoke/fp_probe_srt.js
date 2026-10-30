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

            // (BUG #188 · 2026-10-23) RETALL: ja no es descarta el sintetic que toca
            // un subtitol existent — s'ENCOGEIX fins a la vora del buit. Però si del
            // buit només en queda un tros inservible (< minDurSec) s'ha de descartar.
            var touch = P.mergeSyntheticGaps(base, [E(3.9, 4.1, 'toca')], { tolSec: 0.2, minDurSec: 0.4 });
            ok('#F3/10 retall: un sintetic del qual només cap un tros < minDur → fora («massa-curt»)',
                touch.added.length === 0 && touch.rejected.length === 1 &&
                touch.rejected[0].reason === 'massa-curt',
                touch.added.length + '/' + touch.rejected.length + ':' + (touch.rejected[0] || {}).reason);

            // (BUG #188) Si hi cap gairebé tot, s'encongeix i s'accepta amb els temps
            // del BUIT (era el cas real: el SINT passava 0,4 s del buit i es perdia).
            var fit = P.mergeSyntheticGaps(base, [E(3.6, 5.2, 'sobreïx')], { tolSec: 0.2, minDurSec: 0.4, maxTrimSec: 0.8 });
            ok('#F3/49 retall: el sintetic que sobreïx el buit entra ENCOGIT fins a la vora',
                fit.added.length === 1 && fit.added[0].reason === 'buit-ajustada' &&
                near(fit.added[0].startSec, 4) && near(fit.added[0].endSec, 5.2) &&
                near(fit.added[0].trimSec, 0.4, 0.001) && fit.trimmed === 1 &&
                near(fit.entries[2].startSec, 4) && fit.entries[2].sint === true,
                JSON.stringify(fit.added.map(function (a) { return a.startSec + '-' + a.endSec + ':' + a.reason + ':trim' + a.trimSec; })));

            // (BUG #188b) Dos sintetics al MATEIX buit: el buit s'ha d'anar partint amb
            // el que es col·loca (índex del buit TRIAT, no el darrer del bucle) i les
            // entrades afegides no es poden solapar entre elles.
            var two = P.mergeSyntheticGaps(base, [E(3.6, 5.2, 'a'), E(5.6, 6.6, 'b')],
                { tolSec: 0.2, minDurSec: 0.4, maxTrimSec: 0.8 });
            ok('#F3/52 retall: dos sintetics al mateix buit → es col·loquen en ordre i no se solapen',
                two.added.length === 2 && near(two.added[0].endSec, 5.2) &&
                near(two.added[1].startSec, 5.6) && two.added[1].startSec >= two.added[0].endSec &&
                two.trimmed === 1 && two.entries.length === 5 &&
                two.entries.filter(function (e) { return e.sint === true; }).length === 2,
                JSON.stringify(two.added.map(function (a) { return a.startSec + '-' + a.endSec + ':' + a.reason; })) +
                ' * n=' + two.entries.length + ' * trimmed=' + two.trimmed);

            // (BUG #188) Massa llarg per al buit: retallar-lo el deixaria sense sentit.
            var noCab = P.mergeSyntheticGaps(base, [E(2.5, 8, 'massa-llarg')], { tolSec: 0.2, minDurSec: 0.4, maxTrimSec: 0.8 });
            ok('#F3/50 retall: si cal retallar més de maxTrimSec → NO s\'afegeix («no-cab»)',
                noCab.added.length === 0 && noCab.rejected.length === 1 &&
                noCab.rejected[0].reason === 'no-cab' && near(noCab.rejected[0].trimSec, 1.5, 0.001),
                (noCab.rejected[0] || {}).reason + ':trim' + (noCab.rejected[0] || {}).trimSec);

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
                aligned.added.length === 1 && near(aligned.added[0].startSec, 15) &&
                rawFus.added.length === 1 && near(rawFus.added[0].startSec, 5),
                'Δ=' + estAx2.offsetSec + ' * alineat=' + JSON.stringify(aligned.added.map(function (a) { return a.startSec; })) +
                ' * sense-ajust=' + JSON.stringify(rawFus.added.map(function (a) { return a.startSec; })));

            var noPair = P.estimateOffsetSec([E(0, 1, 'res')], [E(0, 1, 'una altra cosa')]);
            ok("#F3/57 estimateOffsetSec: sense frases en comú no s'inventa cap desfasament",
                noPair.offsetSec === 0 && noPair.pairs === 0 && noPair.method === 'cap',
                JSON.stringify(noPair));

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
            // (BUG #188 · 2026-10-23) El 🧩 NOMÉS ompli la taula: la fusió llig els
            // marges de RETALL de la config, les entrades encaixades es pinten amb un
            // to propi (`e.sint`) i l'exportació al timeline ja no penja del 🧩.
            if (ed.indexOf('exportGapClips') !== -1) {
                ok('#F3/51 editor: fusió amb RETALL (minDur/maxTrim) + pintat de les SINT (sense exportGapClips)', false, 'exportGapClips encara hi és');
            } else {
                ok('#F3/51 editor: fusió amb RETALL (minDur/maxTrim) + pintat de les SINT (sense exportGapClips)',
                    /srtSyntheticMinDurSec/.test(ed) && /srtSyntheticMaxTrimSec/.test(ed) &&
                    /minDurSec: minDur/.test(ed) && /maxTrimSec: maxTrim/.test(ed) &&
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
            ok('#F3/21 flux: runSrtFillGaps → SrtEditor.mergeSyntheticGaps',
                /runSrtFillGaps:\s*async function/.test(flow) && /ed\.mergeSyntheticGaps\(\)/.test(flow));

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
            ok('#F3/25 index: cache-busts F3 (srt_editor 87, flow_srt 19, main 98, Scanner 26, Srt_Logic 22, Config 44)',
                /srt_editor\.js\?v=87/.test(html) && /flow_srt\.js\?v=19/.test(html) &&
                /main\.js\?v=98/.test(html) && /Scanner\.js\?v=26/.test(html) &&
                /10_Srt_Logic\.js\?v=22/.test(html) && /11_Configuracio\.js\?v=44/.test(html));

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
            ok('#F3/43 SRT_EMERGENCIA: base de temps = worldSecMediaStart (sense sumar mp4ExpandedInPoint)',
                /const refStartSec = baseMediaStart;/.test(edt) &&
                edt.indexOf('baseMediaStart + ((isFinite(theExIn)') === -1 &&
                /tlBlockInPointSec/.test(edt) &&
                /NO se suma: és coordenada de media/.test(edt));

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
            ok("#F3/33 fusio: el mateix TEXT MOLT lluny (±10 s) SÍ s'afegeix (repetició legítima)",
                farTxt.added.length === 1 && farTxt.added[0].reason === 'buit',
                JSON.stringify(farTxt.added.map(function (a) { return a.startSec + ':' + a.reason; })));

            var edSrc = noComments(await readRepo('js/editor/srt_editor.js'));
            ok('#F3/34 editor: el clip del canvas NO pinta el text (només el número)',
                /ctx\.fillText\(String\(i \+ 1\), x \+ 3, by \+ bh - 4\)/.test(edSrc) &&
                edSrc.indexOf('e.texts[0]).substring(0, 22)') === -1);

            ok('#F3/35 flux: 🧩 autocarrega els SINT si no estan en memòria (un sol clic)',
                /hasSint/.test(flow) && /await this\.runSrtLoadSynthetic\(\)/.test(flow));

            ok('#F3/36 Scanner: llista els altres sintètics (del programa) i els descartats per programa',
                /altres del programa/.test(sc) && /descartats per programa/.test(sc));

            // (2026-10-23) GUARDA DE PERTINENÇA: el SINT triat pot ser d'un altre bloc.
            var ov = P.textOverlap([E(0, 1, 'a b'), E(2, 3, 'c d')], [E(50, 51, 'A, B!'), E(60, 61, 'zzz')]);
            ok('#F3/37 textOverlap: mesura la pertinència del SINT al bloc (frases compartides, sense TC)',
                ov.hits === 1 && ov.total === 2 && ov.pct === 50, JSON.stringify(ov));
            ok('#F3/38 editor: avisa si el SINT no coincidix amb el SRT normal (<20%)',
                /P\.textOverlap\(base, sint\)/.test(edSrc) && /ovl\.pct < 20/.test(edSrc) &&
                /pot ser d'un ALTRE bloc/.test(edSrc));

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
        } catch (eC) {
            ok('#F3 guardes del flux/UI/config: sense excepció', false, eC && (eC.message + ' | ' + eC.stack));
        }
    };
})();
