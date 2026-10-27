/* ============================================================================
 * PROVA #171 (2026-10-16) · CHYRONS ESTIRABLES AMB EL RATOLÍ a la timeline
 * ----------------------------------------------------------------------------
 * SIMPTOMA (report d'usuari 2026-10-16): els rètols que insereix el panell
 * (chyrons, tema-títol, congelats, traduccions…) NO es podien estirar amb el
 * ratolí: es col·locaven i "quedaven clavats".
 *
 * CAUSA ARREL (mesurada en viu el 2026-10-08 · BUGS.md #146): el final
 * es tancava amb `Clips.endAt`, que NOMÉS mou `clip.end` del TIMELINE → l'`outPoint`
 * del SOURCE queda al final del mèdia i l'estat és INCOHERENT
 * (`end − start ≠ outPoint − inPoint`) → Premiere considera el material ESGOTAT i
 * no deixa allargar el clip.
 *
 * SOLUCIÓ: `Clips.endCoherent` (js/logic/6_Clips_Logic.js) fa el retall COHERENT amb
 * `Clips.retrim` (inPoint → outPoint → end) i, si el mèdia no dóna per a la durada
 * demanada, manté el final de sempre amb `endAt` (WARN) per no canviar el resultat.
 *
 * Aquesta prova carrega el MOTOR REAL (6_Clips_Logic.js) i substitueix el pont JSX
 * per un MODEL de Premiere (start/end/inPoint/outPoint/mèdia) per verificar:
 *   · l'estat incoherent → coherent, amb el FINAL intacte i material per estirar,
 *   · idempotència (si ja és coherent, no crida res),
 *   · mèdia esgotat → `endAt` de reserva (el final volgut NO es perd mai),
 *   · imatges FIXES (PNG) i la xarxa de lectura de `_clipAtTime`,
 *   · la CONNEXIÓ REAL dels fluxos de flow_chyrons (`_placeTradSlot`,
 *     `_freezeTemaTitol`) i l'absència d'`endAt` a les col·locacions.
 * ==========================================================================*/
(function () {
    var orig = window.__runTests;
    window.__runTests = async function () {
        await orig();

        var ok = window.__ok;
        var UI = window.FASTPASS_UI;
        var CHY = UI.Workflows.Chyrons;
        var CL = UI.Logic.Clips;
        window.__PHASE = '18-estirable';

        function near(a, b, eps) { return Math.abs(Number(a) - Number(b)) <= (eps === undefined ? 1e-6 : eps); }

        ok('#171 motor: Clips.endCoherent + Clips._clipAtTime carregats al panell',
            !!(CL && typeof CL.endCoherent === 'function' && typeof CL._clipAtTime === 'function'),
            'Clips=' + typeof CL + ' endCoherent=' + typeof (CL && CL.endCoherent));
        if (!CL || typeof CL.endCoherent !== 'function') { return; }

        // ── MODEL DE PREMIERE + PONT JSX ────────────────────────────────────────
        var TL = {};                          // TL[track] = [clip]
        var MEDIA = {};                       // MEDIA[nom] = durada del mèdia (o INF = fixa)
        var CALLS = [];                       // crides JSX vistes
        var AT_NULL = false;                  // força que `Clips.at` no trobe res (xarxa)
        var INF = Number.POSITIVE_INFINITY;   // imatge FIXA: s'estira sense límit

        function trackOf(t) { return TL[t] || (TL[t] = []); }
        function put(t, name, start, dur, media, inPt) {
            var c = {
                name: name, start: start, end: start + dur,
                inPoint: (inPt || 0), outPoint: (inPt || 0) + dur,
                media: (media === undefined ? 5 : media)
            };
            trackOf(t).push(c);
            return c;
        }
        function coherent(c) { return near((c.end - c.start), (c.outPoint - c.inPoint), 0.04); }
        // `putRaw`: estat EXACTE (per reproduir el que deixava `Clips.insert` + `Clips.endAt`:
        // el mèdia sencer a l'outPoint però el final del timeline ja mogut).
        function putRaw(t, name, start, end, inPt, outPt, media) {
            var c = { name: name, start: start, end: end, inPoint: inPt, outPoint: outPt, media: (media === undefined ? outPt : media) };
            trackOf(t).push(c);
            return c;
        }
        function jclip(t, i) {
            var c = trackOf(t)[i];
            if (!c) return 'null';
            return JSON.stringify({
                index: i, name: c.name, start: c.start, end: c.end,
                inPoint: c.inPoint, outPoint: c.outPoint,
                duration: c.end - c.start, selected: false
            });
        }
        function num(v) { return Number(v); }

        var savedCallJSX = UI.Utils.callJSX;
        var savedConfigGet = UI.Config.get;

        function installModel() {
            CALLS = [];
            AT_NULL = false;
            UI.Utils.callJSX = async function (expr) {
                var s = String(expr);
                CALLS.push(s);
                var m;
                if ((m = /^Clips\.at\((-?\d+), (-?[\d.]+), '(\w+)'\)$/.exec(s))) {
                    if (AT_NULL) return 'null';
                    var tr = trackOf(num(m[1])), tt = num(m[2]);
                    for (var i = 0; i < tr.length; i++) {
                        if (tr[i].start <= tt && tr[i].end > tt) return jclip(num(m[1]), i);
                    }
                    return 'null';
                }
                if ((m = /^Clips\.count\((-?\d+), '(\w+)'\)$/.exec(s))) {
                    return String(trackOf(num(m[1])).length);
                }
                if ((m = /^Clips\.get\((-?\d+), (\d+), '(\w+)'\)$/.exec(s))) {
                    return jclip(num(m[1]), num(m[2]));
                }
                if ((m = /^Clips\.retrim\((-?\d+), (\d+), (-?[\d.]+), (-?[\d.]+), (-?[\d.]+), '(\w+)'\)$/.exec(s))) {
                    var c = trackOf(num(m[1]))[num(m[2])];
                    if (!c) return 'ERR_NO_CLIP';
                    var inPt = num(m[3]), outPt = num(m[4]), wantEnd = num(m[5]);
                    if (outPt > c.media + 1e-6) {
                        // PREMIERE limita l'outPoint al final del mèdia I arrodoneix el final.
                        c.inPoint = inPt; c.outPoint = c.media; c.end = c.start + (c.media - inPt);
                        return 'WARN_INVALID:in=' + c.inPoint.toFixed(3) + ',out=' + c.outPoint.toFixed(3) + ',end=' + c.end.toFixed(3);
                    }
                    c.inPoint = inPt; c.outPoint = outPt; c.end = wantEnd;
                    return 'OK:in=' + c.inPoint.toFixed(3) + ',out=' + c.outPoint.toFixed(3) + ',end=' + c.end.toFixed(3);
                }
                if ((m = /^Clips\.endAt\((-?\d+), (-?[\d.]+), (-?[\d.]+), '(\w+)'\)$/.exec(s))) {
                    var c2 = null, tr2 = trackOf(num(m[1])), st = num(m[2]);
                    for (var j = 0; j < tr2.length; j++) { if (Math.abs(tr2[j].start - st) < 0.05) { c2 = tr2[j]; break; } }
                    if (!c2) return 'ERR_CLIP_NOT_FOUND_AT_' + st;
                    c2.end = num(m[3]);          // NOMÉS el final del TIMELINE (outPoint intacte)
                    return 'OK';
                }
                if ((m = /^Clips\.insert\('([^']*)', (-?\d+), (-?[\d.]+), (null|-?[\d.]+), '(\w+)'\)$/.exec(s))) {
                    var nm = m[1], media = (MEDIA[nm] === undefined) ? 5 : MEDIA[nm];
                    put(num(m[2]), nm, num(m[3]), media, media);
                    return 'OK';
                }
                return 'OK';
            };
            UI.Config.get = function () {
                return {
                    tracks: { video: { tematitol: 6, chyrons: 7, lloc: 7, mp4: 1 } },
                    traduccio: { freezeTail: false, freezeMinSec: 0.12 }
                };
            };
        }

        function retrims() { return CALLS.filter(function (c) { return /^Clips\.retrim\(/.test(c); }); }
        function endAts() { return CALLS.filter(function (c) { return /^Clips\.endAt\(/.test(c); }); }
        function reset() { TL = {}; MEDIA = {}; installModel(); }

        try {
            // ══ 1. ESTAT INCOHERENT (el que deixava `Clips.endAt`) → COHERENT ══════
            reset();
            MEDIA['Wott_TITOL.mov'] = 50.6;
            var c1 = putRaw(6, 'Wott_TITOL.mov', 10.00, 12.00, 0, 50.6, 50.6);   // insert + endAt
            ok('#171 model: el clip arrenca INCOHERENT (end−start ≠ outPoint−inPoint)',
                !coherent(c1), 'end−start=' + (c1.end - c1.start) + ' · out−in=' + (c1.outPoint - c1.inPoint));
            var r1 = await CL.endCoherent(6, 10.00, 12.00, 'video', 'T1');
            ok('#171 endCoherent: retall COHERENT amb `Clips.retrim` (1 crida, cap `endAt`)',
                /^OK:coherent/.test(r1) && retrims().length === 1 && endAts().length === 0,
                r1 + ' | retrim=' + retrims().length + ' endAt=' + endAts().length);
            ok('#171 endCoherent: el FINAL no es mou (12,000 s)',
                near(c1.end, 12.00), String(c1.end));
            ok('#171 endCoherent: clip ESTIRABLE (end−start == outPoint−inPoint == 2 s)',
                coherent(c1) && near(c1.end - c1.start, 2.00) && near(c1.outPoint - c1.inPoint, 2.00),
                'end=' + c1.end + ' · in=' + c1.inPoint + ' · out=' + c1.outPoint);
            ok('#171 endCoherent: QUEDA MÈDIA per estirar (outPoint 2 s «de» 50,6 s)',
                c1.outPoint < c1.media - 1, 'outPoint=' + c1.outPoint + ' · mèdia=' + c1.media);

            installModel();      // 2a passada: el clip JA és coherent
            var r1b = await CL.endCoherent(6, 10.00, 12.00, 'video', 'T1b');
            ok('#171 endCoherent: IDEMPOTENT (si ja és coherent no crida res)',
                /^OK:ja-coherent/.test(r1b) && retrims().length === 0 && endAts().length === 0, r1b);

            // ══ 2. MÈDIA ESGOTAT → reserva `endAt` (el final no es perd) ═══════════
            reset();
            MEDIA['Wott_LLARG.mov'] = 4.0;
            var c2 = putRaw(6, 'Wott_LLARG.mov', 30.00, 36.00, 0, 4.0, 4.0);   // end 36 s però mèdia 4 s
            var r2 = await CL.endCoherent(6, 30.00, 36.00, 'video', 'T2');
            ok('#171 mèdia ESGOTAT: avís WARN_MEDIA + final refet amb `endAt`',
                /^WARN_MEDIA/.test(r2) && retrims().length === 1 && endAts().length === 1, r2);
            ok('#171 mèdia ESGOTAT: el FINAL volgut (36 s) NO es perd mai',
                near(c2.end, 36.00), String(c2.end));

            // ══ 3. IMATGE FIXA (PNG): estat de `moveToRange` → coherent ════════════
            reset();
            var c3 = put(7, 'freeze_titulillo_1.png', 40.00, 5.00, INF);   // still de 5 s
            c3.end = 43.00;      // COM EL DEIXAVA `Clips.moveToRange` (start/end moguts, in/out intactes)
            var r3 = await CL.endCoherent(7, 40.00, 43.00, 'video', 'T3');
            ok('#171 imatge FIXA (PNG): moveToRange incoherent → coherent i estirable',
                /^OK:coherent/.test(r3) && coherent(c3) && near(c3.outPoint, 3.00) && /FIXA/.test(r3), r3);

            // ══ 4. XARXA de lectura (`Clips.at` no troba res → count/get) ══════════
            reset();
            var c4 = put(6, 'Wott_NOM.mov', 50.00, 2.00, 20.0);
            AT_NULL = true;
            var r4 = await CL.endCoherent(6, 50.00, 52.00, 'video', 'T4');
            ok('#171 _clipAtTime: xarxa count/get quan `Clips.at` no troba el clip',
                /^OK:/.test(r4) && coherent(c4) && near(c4.end, 52.00), r4);

            // ══ 5. Sense clip a eixe instant ═══════════════════════════════════════
            reset();
            var r5 = await CL.endCoherent(6, 500.00, 505.00, 'video', 'T5');
            ok('#171 sense clip a eixe instant → ERR_NO_CLIP (sense excepció)',
                /^ERR_NO_CLIP/.test(r5), r5);

            // ══ 6. INTEGRACIÓ REAL: _placeTradSlot (slot sencer, sense congelat) ═══
            reset();
            MEDIA['Trad_X.png'] = INF;
            var res6 = await CHY._placeTradSlot({ chy: { name: 'Trad_X.png' }, track: 7, start: 60.00, end: 65.00, mediaDur: 0, label: 'Traducció' });
            var c6 = trackOf(7)[0];
            ok('#171 _placeTradSlot: el clip col·locat queda COHERENT (estirable) i acaba al final del slot',
                !!c6 && !!res6 && res6.ok === true && res6.mode === 'live' && coherent(c6) &&
                near(c6.end, 65.00) && near(c6.outPoint - c6.inPoint, 5.00),
                JSON.stringify(res6) + ' · clip=' + JSON.stringify(c6));

            // ══ 7. INTEGRACIÓ REAL: _freezeTemaTitol sense congelat ════════════════
            reset();
            MEDIA['Wott_TITOL.mov'] = 50.6;
            var fr7 = await CHY._freezeTemaTitol('Wott_TITOL.mov', 70.00, null, 'T7', { tempTC: 600, freezeSec: 0 });
            var c7 = trackOf(6)[0];
            ok('#171 _freezeTemaTitol (sense congelat): animació COHERENT fins a placeTime + CUT_OFFSET (8 s)',
                !!c7 && !!fr7 && fr7.success === true && coherent(c7) &&
                near(c7.start, 70.00) && near(c7.end, 78.00),
                JSON.stringify(fr7) + ' · clip=' + JSON.stringify(c7));

            // ══ 8. CONNEXIÓ dels fluxos: cap col·locació tanca amb `Clips.endAt` ═══
            var fns = [
                ['_placeTradSlot', CHY._placeTradSlot],
                ['_placeChyronsByType', CHY._placeChyronsByType],
                ['_repararClipsV7', CHY._repararClipsV7],
                ['_freezeTemaTitol', CHY._freezeTemaTitol],
                ['_freezeTitulilloStill', CHY._freezeTitulilloStill],
                ['_fillTitulilloGaps', CHY._fillTitulilloGaps],
                ['_placeTemaTitolTransicions', CHY._placeTemaTitolTransicions],
                ['_insertTemaTitolExit', CHY._insertTemaTitolExit]
            ];
            var ambEndAt = [], senseCoherent = [];
            for (var k = 0; k < fns.length; k++) {
                var src = String(fns[k][1] || '');
                if (/Clips\.endAt\(/.test(src)) ambEndAt.push(fns[k][0]);
                if (!/endCoherent/.test(src)) senseCoherent.push(fns[k][0]);
            }
            ok('#171 cap col·locació de rètol tanca el final amb `Clips.endAt` (estat incoherent)',
                ambEndAt.length === 0, 'encara amb endAt: ' + ambEndAt.join(', '));
            ok('#171 totes les col·locacions passen per `Clips.endCoherent`',
                senseCoherent.length === 0, 'sense endCoherent: ' + senseCoherent.join(', '));
            ok('#171 `Clips.endCoherent`: retall amb `Clips.retrim` + reserva amb `Clips.endAt`',
                /Clips\.retrim\(/.test(String(CL.endCoherent)) && /Clips\.endAt\(/.test(String(CL.endCoherent)));
        } catch (e171) {
            ok('#171 la prova no ha llançat cap excepció', false, e171 && (e171.message + ' | ' + e171.stack));
        } finally {
            // El pont JSX ha de quedar EXACTAMENT com estava (altres fases del harness).
            UI.Utils.callJSX = savedCallJSX;
            if (savedConfigGet === undefined) { delete UI.Config.get; } else { UI.Config.get = savedConfigGet; }
        }
    };
})();
