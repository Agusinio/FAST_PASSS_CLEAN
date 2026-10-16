/* ============================================================================
 * PROVA BUG #169/#170 (2026-10-16)
 * ----------------------------------------------------------------------------
 * #169 · APP MAPA REVOLTES DUPLICAT (V3 + V6) i V6 TALLAT
 *   `flow_mapa._freezeUnderCti` acceptava com a «congelat» QUALSEVOL clip de la
 *   pista de grafismes que hi haguera sota el cabezal (també un grafisme .mov
 *   acabat d'inserir) i `_placeClips` el replicava a V6 ESTIRAT fins al final del
 *   gràfic → el gràfic sortia DUES vegades (V3+V6) i de pas tallava el tema-títol
 *   que hi haguera a V6. Ara NOMÉS s'accepta (i es replica) una IMATGE FIXA.
 *
 * #170 · BOTÓ 🔀 DE LA FILA CHY (ESTAT de la intro del bloc)
 *   Toggle d'ESTAT entre intro LLARGA (CasA: l'inici del bloc l'obre el
 *   Tema-Títol i el Conductor va després del gran) i intro CURTA (CasB: l'obre el
 *   Conductor i el gran entra quan acaba la seua animació). L'estat és PERSISTENT
 *   (el consumeixen `_blockStartTime` i `placeChyronConductor` → totes les
 *   col·locacions següents de l'inici del bloc ixen amb eixe cas) i el botó, a
 *   més, re-col·loca l'escena: retira el clúster de l'inici del bloc amb
 *   `Clips.removeAt(..., ripple=false)` (NO ha de desplaçar la resta de la pista)
 *   i torna a passar Conductor + Tema-Títol ancorats a l'inici sota el cabezal.
 *
 * S'encadena DESPRES de fp_probe_ipd_chyron.js (mateix patró: embolcalla __runTests).
 * ==========================================================================*/
(function () {
    var orig = window.__runTests;
    window.__runTests = async function () {
        await orig();

        var ok = window.__ok;
        var UI = window.FASTPASS_UI;
        var CHY = UI.Workflows.Chyrons;
        var MAP = UI.Workflows.Mapa;
        window.__PHASE = '17-cas-intro';

        function near(a, b, eps) { return Math.abs(Number(a) - Number(b)) <= (eps === undefined ? 1e-6 : eps); }

        ok('flow_chyrons amb l\'ESTAT del cas (BUG #170) i flow_mapa amb la guarda d\'imatge fixa (BUG #169)',
            !!(CHY && typeof CHY._casForceTimes === 'function' && typeof CHY.getTitolCaseMode === 'function' &&
                typeof CHY.setTitolCaseMode === 'function' && typeof CHY.switchTitolConductorCase === 'function' &&
                typeof CHY._titolCasoActual === 'function' && typeof CHY._cleanCasoBloc === 'function') &&
            !!(MAP && typeof MAP._isStill === 'function' && typeof MAP._freezeUnderCti === 'function'),
            'CHY=' + typeof CHY + ' MAPA=' + typeof MAP);
        if (!CHY || typeof CHY._casForceTimes !== 'function') { return; }

        // ══ 1. _casForceTimes: PLA PUR de l'inici del bloc per a cada ESTAT ══
        // (constants del mòdul: marge d'inici 0,40 s · durada del gran 6,24 s · cua del
        //  conductor 15 frames = 0,60 s)
        var CS = 10.00, base = CS + 0.40;                      // bloc @10.00 → obre @10.40
        var a = CHY._casForceTimes('A', CS, null, null);
        ok('#170 ESTAT CasA: el Tema-Títol OBRE el bloc @ 10.40 s', a.cas === 'A' && near(a.titol, base), String(a.titol));
        ok('#170 ESTAT CasA: el Conductor va DESPRÉS del gran (+6.24 s → 16.64 s)', near(a.conductor, base + 6.24), String(a.conductor));
        ok('#170 ESTAT CasA: el motiu diu «intro LLARGA»', /LLARGA/.test(a.motiu), a.motiu);
        var a2 = CHY._casForceTimes('A', CS, null, 2.00);
        ok('#170 ESTAT CasA amb Tema-Títol REAL (marcador a 2 s): ancoratge al gran (2.00 → 8.24)',
            near(a2.titol, 2.00) && near(a2.conductor, 2.00 + 6.24), [a2.titol, a2.conductor].join('|'));
        var b = CHY._casForceTimes('B', CS, 8.00, null);
        ok('#170 ESTAT CasB: el Conductor OBRE el bloc @ 10.40 s', b.cas === 'B' && near(b.conductor, base), String(b.conductor));
        ok('#170 ESTAT CasB amb fi de conductor (8.00 s): el gran entra 15 frames abans (7.40 s)',
            near(b.titol, 8.00 - 0.60), String(b.titol));
        var b2 = CHY._casForceTimes('B', CS, null, null);
        ok('#170 ESTAT CasB sense fi llegible: marge clàssic 0.40+4.40 (14.80 s) i motiu «intro CURTA»',
            near(b2.titol, base + 4.40) && /CURTA/.test(b2.motiu), [b2.titol, b2.motiu].join('|'));
        ok('#170 _casForceTimes: cas desconegut → es tracta com a CasA (sense excepció)',
            CHY._casForceTimes('Z', CS, null, null).cas === 'A');

        // ══ 2. ESTAT: get/set, valors vàlids i el que CONSUMEIXEN els fluxos ══
        var origStatus = UI.Utils.status;
        var hadStatus = (typeof origStatus === 'function');
        if (!hadStatus) { UI.Utils.status = function () { }; }
        try {
            CHY.setTitolCaseMode(null);
            ok('#170 estat per DEFECTE = AUTO (auto-detecció, com sempre)',
                CHY.getTitolCaseMode() === 'AUTO' && CHY._titolCaseMode === null, String(CHY._titolCaseMode));
            ok('#170 setTitolCaseMode(\'A\') → l\'estat queda FIXAT a A',
                CHY.setTitolCaseMode('A') === 'A' && CHY.getTitolCaseMode() === 'A');
            ok('#170 setTitolCaseMode(\'b\') en minúscula NO fixa res (AUTO)', CHY.setTitolCaseMode('b') === 'AUTO');
            ok('#170 setTitolCaseMode(\'B\') → B i persisteix a la memòria del mòdul',
                CHY.setTitolCaseMode('B') === 'B' && CHY._titolCaseMode === 'B');
            ok('#170 els fluxos d\'inici de bloc consulten l\'ESTAT (_titolCaseMode)',
                /_titolCaseMode/.test(CHY._blockStartTime.toString()) &&
                /_titolCaseMode/.test(CHY.placeChyronConductor.toString()));
            ok('#170 el 🔀 re-col·loca el bloc ancorat a l\'inici sota el cabezal (_blockStartForce)',
                /_blockStartForce/.test(CHY.placeChyronTitol.toString()) &&
                /_blockStartForce/.test(CHY.placeChyronConductor.toString()) &&
                /_blockStartForce/.test(CHY.switchTitolConductorCase.toString()));
            ok('#170 el 🔀 fixa l\'estat i re-col·loca (neteja + Conductor + Tema-Títol)',
                /setTitolCaseMode/.test(CHY.switchTitolConductorCase.toString()) &&
                /_cleanCasoBloc/.test(CHY.switchTitolConductorCase.toString()) &&
                /placeChyronTitol/.test(CHY.switchTitolConductorCase.toString()));
            CHY.setTitolCaseMode('A');
            var jsxBefore = window.__JSX.length;
            var resAuto = await CHY.switchTitolConductorCase('AUTO');
            ok('#170 Ctrl+clic al 🔀 (AUTO): desfixa l\'estat i NO toca el timeline',
                resAuto === 'AUTO' && CHY.getTitolCaseMode() === 'AUTO' &&
                CHY._titolCaseMode === null && window.__JSX.length === jsxBefore,
                [resAuto, CHY._titolCaseMode, window.__JSX.length - jsxBefore].join('|'));
        } finally {
            CHY.setTitolCaseMode(null);
            if (!hadStatus) { delete UI.Utils.status; } else { UI.Utils.status = origStatus; }
        }

        // ══ 3. _titolCasoActual: quin ESTAT hi ha AL TIMELINE (posició del conductor) ══
        var CFG = { tracks: { video: { mp4: 1, tematitol: 6, chyrons: 7 } } };
        var savedClips = UI.Logic.Clips;
        var chyClips = [];
        UI.Logic.Clips = { getTrackClips: async function (t) { return (t === 7) ? chyClips.slice() : []; } };
        try {
            chyClips = [{ name: 'CHY_CONDUCTOR_V1_TNM.mov', start: 10.40, end: 14.19 }];
            var curB = await CHY._titolCasoActual(CFG, CS);
            ok('#170 _titolCasoActual: conductor al MARGE d\'inici (10.40) → CasB',
                curB.cas === 'B' && near(curB.condEnd, 14.19), JSON.stringify(curB));
            chyClips = [{ name: 'CHY_CONDUCTOR_V1_TNM.mov', start: 16.64, end: 20.43 }];
            ok('#170 _titolCasoActual: conductor DESPRÉS del gran (16.64) → CasA',
                (await CHY._titolCasoActual(CFG, CS)).cas === 'A');
            chyClips = [{ name: 'Lloc_Barcelona.mov', start: 10.40, end: 14.00 }];
            CHY._lastTitolCase = 'B';
            ok('#170 _titolCasoActual: sense conductor → cas de l\'última col·locació',
                (await CHY._titolCasoActual(CFG, CS)).cas === 'B');
            chyClips = [
                { name: 'CHY_CONDUCTOR_item40.mov', start: 40.40, end: 44.19 },
                { name: 'CHY_CONDUCTOR_bloc.mov', start: 10.40, end: 14.19 }
            ];
            ok('#170 _titolCasoActual: amb 2 conductors pren el PRIMER (el del bloc)',
                (await CHY._titolCasoActual(CFG, CS)).cas === 'B');
        } finally {
            if (savedClips === undefined) { delete UI.Logic.Clips; } else { UI.Logic.Clips = savedClips; }
        }

        // == 4. _cleanCasoBloc: esborrat SENSE RIPPLE (la resta de la pista no es mou) ==
        var calls = [];
        var origCall = UI.Utils.callJSX;
        UI.Utils.callJSX = async function (expr) { calls.push(String(expr)); return 'OK'; };
        UI.Logic.Clips = {
            getTrackClips: async function (t) {
                var byTrack = {
                    7: [{ name: 'CHY_CONDUCTOR_bloc.mov', start: 10.40, end: 14.19 },
                        { name: 'Lloc_Barcelona.mov', start: 50.00, end: 54.00 }],
                    6: [{ name: 'Tema-Titol gran v1.png', start: 10.40, end: 16.64 },
                        { name: 'Titulillo v1.png', start: 16.64, end: 17.20 },
                        { name: 'Tema-Titol item40.png', start: 60.00, end: 70.00 }]
                };
                return (byTrack[t] || []).slice();
            }
        };
        try {
            var cl = await CHY._cleanCasoBloc(CFG, CS, 16);
            ok('#170 _cleanCasoBloc: retira el conductor + les peces del Tema-Titol de l\'inici (3)',
                cl.removed === 3 && cl.failed === 0, [cl.removed, cl.failed].join('|'));
            ok('#170 _cleanCasoBloc: esborra amb Clips.removeAt(..., false) -> SENSE ripple',
                calls.length === 3 && calls.every(function (c) {
                    return /^Clips\.removeAt\(\d+, \d+\.\d+, 'video', false\)$/.test(c);
                }), calls.join(' | '));
            ok('#170 _cleanCasoBloc: NO toca cap clip fora de la finestra del bloc',
                !calls.some(function (c) { return /50\.0000|60\.0000/.test(c); }), calls.join(' | '));
            ok('#170 _cleanCasoBloc: torna la INSTANTANIA dels veinats (per a _repararClipsV7)',
                cl.snap.config.length === 1 && cl.snap.tema.length === 1 &&
                cl.snap.tema[0].start === 60.00 && cl.snap.config[0].start === 50.00,
                JSON.stringify(cl.snap));
            ok('#170 _cleanCasoBloc: V7 (conductor) 1 peça i V6 (tema-titol) 2 peces',
                calls.filter(function (c) { return /^Clips\.removeAt\(7, /.test(c); }).length === 1 &&
                calls.filter(function (c) { return /^Clips\.removeAt\(6, /.test(c); }).length === 2,
                calls.join(' | '));
        } finally {
            if (savedClips === undefined) { delete UI.Logic.Clips; } else { UI.Logic.Clips = savedClips; }
            UI.Utils.callJSX = origCall;
            CHY._lastTitolCase = null;
        }

        // == 5. BUG #169: a V6 nomes s'hi replica una IMATGE FIXA ==
        if (MAP && typeof MAP._isStill === 'function') {
            ok('#169 _isStill: el congelat del tema-titol (PNG/JPG/TIFF) si que es imatge fixa',
                MAP._isStill('Tema-Titol gran v1.png') === true && MAP._isStill('frame.JPG') === true &&
                MAP._isStill('captura.tiff') === true);
            ok('#169 _isStill: el grafisme de VIDEO (mov/mp4/mxf) NO es cap congelat',
                MAP._isStill('CHY_MAPA_REVOLTES.mov') === false &&
                MAP._isStill('APP MAPA REVOLTES.MP4') === false &&
                MAP._isStill('grafisme.mxf') === false);
            ok('#169 _isStill: nom buit o null -> false (sense excepcio)',
                MAP._isStill('') === false && MAP._isStill(null) === false);

            var savedMapClips = UI.Logic.Clips;
            UI.Logic.Clips = { getTrackClips: async function () { return [{ name: 'CHY_MAPA_REVOLTES.mov', start: 30.00, end: 44.00 }]; } };
            try {
                var fzGraf = await MAP._freezeUnderCti(35.00);
                ok('#169 _freezeUnderCti: el grafisme APP MAPA REVOLTES -> null (NO es replica a V6)',
                    fzGraf === null, JSON.stringify(fzGraf));
            } finally {
                if (savedMapClips === undefined) { delete UI.Logic.Clips; } else { UI.Logic.Clips = savedMapClips; }
            }

            UI.Logic.Clips = { getTrackClips: async function () { return [{ name: 'Tema-Titol gran v1.png', start: 30.00, end: 44.00 }]; } };
            try {
                var fzPng = await MAP._freezeUnderCti(35.00);
                ok('#169 _freezeUnderCti: el PNG del tema-titol SI que es replica (com sempre)',
                    !!fzPng && fzPng.name === 'Tema-Titol gran v1.png' && near(fzPng.start, 30.00), JSON.stringify(fzPng));
            } finally {
                if (savedMapClips === undefined) { delete UI.Logic.Clips; } else { UI.Logic.Clips = savedMapClips; }
            }

            ok('#169 la REPLICACIO a V6 (_placeClips) esta darrere de la guarda d\'imatge fixa',
                /_isStill\(freeze\.name\)/.test(MAP._placeClips.toString()));
            ok('#169 _placeClips: un congelat que no siga imatge fixa te branca d\'avis (no passi silencios)',
                /no es una imatge fixa|NO es cap|no és una imatge fixa/.test(MAP._placeClips.toString()));
        }
    };
})();
