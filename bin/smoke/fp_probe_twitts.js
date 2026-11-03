/* ============================================================================
 * PROVA 26 (2026-10-29) · TWITTS: tuit cremat → movie del tuit (OCR d'1 frame)
 * ----------------------------------------------------------------------------
 * Spec: `docs/specs/TWITTS_OCR.md` (D1-D17).
 *
 * QUÈ ES PROVA (tot PUR: sense CEP, sense ffmpeg, sense timeline)
 *   A) `js/logic/22_TwittsOcr_Logic.js`:
 *      · `handleOf`/`handlesOf` = el text darrere d'un `@` (D6), normalitzat;
 *      · `wottFields` = Nom/Partit/@handle del NOM del movie (que ve TRUNCAT);
 *      · `scoreCandidat` = handle per PREFIX + nom del titular (D5);
 *      · `isTuit`, `esXarxes`/`pendents` (D12: candidats = els movies que ha
 *        portat la IMPORTACIÓ, descomptant els que ja són al timeline);
 *      · `sampleTime` = frame 35 des de l'in del clip (D2);
 *      · caché de la tria manual (D9) amb invalidació per mida/data.
 *   B) `js/workflows/flow_twitts.js`: les dos entrades hi són
 *      (`runAuto` = automàtica al final de COLOCAR · `runEmergency` = Ctrl+clic
 *      a la diana 🎯), `_isPlaced`/`_covered` (idempotència: no col·locar dos
 *      voltes el mateix movie ni damunt d'un altre grafisme).
 * ==========================================================================*/
(function () {
    var orig = window.__runTests;
    window.__runTests = async function () {
        await orig();

        var ok = window.__ok;
        var UI = window.FASTPASS_UI;
        var T = UI.Logic && UI.Logic.TwittsOcr;
        window.__PHASE = '26-twitts';

        // Noms REALS de la carpeta de chyrons (28/10/2026). Fixa't que el nom ve
        // TRUNCAT a ~93 caràcters: el handle pot quedar en `@K` o `@junqu`.
        var N1 = 'Wott_TNM_V_00_00.00_LUCYS VERTICALITZACIÓ_665892_XARXES-TEXT_tp_Oriol Junqueras_ERC_@junqu.00665945.mov';
        var N2 = 'Wott_TNM_V_00_00.00_LUCYS VERTICALITZACIÓ_652616_XARXES-TEXT_tp_Carles Puigdemont_Junts_@K_00652665.mov';
        var N3 = 'Wott_TNM_V_00_00.00_LUCYS VERTICALITZACIÓ_658211_XARXES-TEXT_tp_Pedro Sánchez_president de_00658364.mov';
        var OCR1 = 'Oriol Junqueras\n@junqueras\nAhir vam parlar dels pressupostos i del que ha de passar';

        ok('#TW/1 mòdul 22_TwittsOcr_Logic carregat (Logic.TwittsOcr)',
            !!(T && typeof T.handleOf === 'function' && typeof T.scoreCandidat === 'function' &&
                typeof T.scanClips === 'function' && typeof T.learn === 'function'),
            'TwittsOcr=' + typeof T);
        if (!T) { return; }

        // ── A1. handleOf / handlesOf (D6) ────────────────────────────────────
        ok('#TW/2 handleOf: el text darrere del @ (@junqueras)',
            T.handleOf(OCR1) === 'junqueras', T.handleOf(OCR1));
        ok('#TW/3 handleOf: fora guions baixos i punts (@Nunez_Feijoo → nunezfeijoo)',
            T.handleOf('diu @Nunez_Feijoo que no') === 'nunezfeijoo', T.handleOf('diu @Nunez_Feijoo que no'));
        ok('#TW/4 handleOf: sense @ → cadena buida (no s\'inventa res)',
            T.handleOf('Oriol Junqueras sense arrova') === '', T.handleOf('Oriol Junqueras'));
        ok('#TW/5 handlesOf: del més llarg al més curt i sense repetits',
            JSON.stringify(T.handlesOf('@a i @junqueras i @junqueras')) ===
            JSON.stringify(['junqueras', 'a']), JSON.stringify(T.handlesOf('@a i @junqueras')));

        // ── A2. wottFields: Nom / Partit / @handle del NOM del movie ─────────
        var f1 = T.wottFields(N1);
        ok('#TW/6 wottFields: «Oriol Junqueras» / «ERC» / @junqu / rol XARXES-TEXT',
            f1.nom === 'Oriol Junqueras' && f1.partit === 'ERC' && f1.handle === 'junqu' &&
            f1.rol === 'XARXES-TEXT', JSON.stringify(f1));
        ok('#TW/7 wottFields: handle d\'1 lletra (@K_00652665 → k, no k_00652665)',
            T.wottFields(N2).handle === 'k', JSON.stringify(T.wottFields(N2)));
        ok('#TW/8 wottFields: sense handle (Pedro Sánchez_president de → handle buit)',
            T.wottFields(N3).handle === '' && T.wottFields(N3).nom === 'Pedro Sánchez',
            JSON.stringify(T.wottFields(N3)));

        // ── A3. scoreCandidat / rankCandidates (D5 + D6) ─────────────────────
        var s1 = T.scoreCandidat(OCR1, N1);
        ok('#TW/9 @handle que coincidix + titular sencer → 150 punts (100 + 50)',
            s1.score === 150 && s1.handle === 'junqu' && s1.titular === 1, JSON.stringify(s1));
        ok('#TW/10 un movie d\'un altre titular → 0 punts (no es confon)',
            T.scoreCandidat(OCR1, N2).score === 0, JSON.stringify(T.scoreCandidat(OCR1, N2)));
        var s3 = T.scoreCandidat('Carles Puigdemont\n@KRLS\nEl que ha dit el president', N2);
        ok('#TW/11 handle TRUNCAT (@K) + titular sencer → 90 punts (40 + 50)',
            s3.score === 90 && s3.handle === 'k', JSON.stringify(s3));
        var rk = T.rankCandidates(OCR1, [
            { name: N2, created: 200 }, { name: N1, created: 100 }, { name: N3, created: 300 }
        ]);
        ok('#TW/12 rankCandidates: el que coincidix primer (@junqueras → Oriol Junqueras)',
            rk[0].name === N1 && rk[0].score === 150 && rk.length === 3, rk[0].name);
        ok('#TW/13 rankCandidates: a igualtat de punts (0), la data MÉS RECENT primer',
            rk[1].name === N3 && rk[2].name === N2, rk[1].name);

        // ── A4. isTuit ───────────────────────────────────────────────────────
        ok('#TW/14 isTuit: un @handle al text ja és tuit',
            T.isTuit(OCR1, [], {}) === true);
        ok('#TW/15 isTuit: sense @ ni candidat vàlid NO és tuit (no es pregunta)',
            T.isTuit('Bon dia i bona hora', [{ score: 0 }], {}) === false);

        // ── A5. Candidats: els que ha portat la IMPORTACIÓ (D12) ─────────────
        ok('#TW/16 esXarxes: un XARXES-TEXT del projecte és movie de tuit',
            T.esXarxes(N1) === true && T.esXarxes(N3) === true);
        ok('#TW/17 esXarxes: el bloc A SEQUES (_V_00_) també (mateix criteri que Parse._esFlotant)',
            T.esXarxes('Wott_TNM_V_00_00.00_ALGUNA COSA_123_MAPA_tp_.mov') === true);
        ok('#TW/18 esXarxes: un wott normal del bloc o un conductor NO ho són',
            T.esXarxes('Wott_TNM_V1_05_00.01_PENSIONS_TITOL_0900.mov') === false &&
            T.esXarxes('Conductor_Joan.mov') === false && T.esXarxes('') === false);
        var FF = [{ name: N1 }, { name: N2 }, { name: N3 }];
        var pend1 = T.pendents(FF, [N2]);
        ok('#TW/19 pendents: els movies que JA són al timeline queden fora',
            pend1.length === 2 && pend1[0].name === N1 && pend1[1].name === N3,
            pend1.map(function (x) { return x.name.substring(60); }).join(' · '));
        ok('#TW/20 pendents: sense res col·locat tornen tots (i els buits no compten)',
            T.pendents(FF, []).length === 3 && T.pendents(FF, null).length === 3 &&
            T.pendents([null, { name: '' }, { name: N1 }], []).length === 1);

        // ── A6. Mostra: frame 35 des de l'in (D1/D2) ─────────────────────────
        ok('#TW/21 sampleTime: clip.start + 35 × 0,04 s = +1,40 s (MAI el primer frame)',
            Math.abs(T.sampleTime({ start: 10 }, {}) - 11.4) < 1e-9 &&
            Math.abs(T.sampleTime({ start: 0 }, {}) - 1.4) < 1e-9,
            T.sampleTime({ start: 10 }, {}) + '');
        ok('#TW/22 sampleTime: respecta una recepta pròpia (frame 10 a 50 fps → +0,20 s)',
            Math.abs(T.sampleTime({ start: 5 }, { sampleFrame: 10, frameSec: 0.02 }) - 5.2) < 1e-9);
        ok('#TW/23 tcStr: 72,44 s → 00:01:12:11 (25 fps, per als logs i la finestra)',
            T.tcStr(72.44) === '00:01:12:11', T.tcStr(72.44));
        ok('#TW/24 tcStr: valors rars no peten (negatiu → 00:00:00:00)',
            T.tcStr(-5) === '00:00:00:00' && T.tcStr(NaN) === '00:00:00:00');

        // ── A7. Caché de la tria manual (D9) ─────────────────────────────────
        ok('#TW/25 cacheKeyOf: la clau és el @handle (estable entre execucions)',
            T.cacheKeyOf(OCR1) === 'h:junqueras' && T.cacheKeyOf('res de res') === 't:RES DE RES',
            T.cacheKeyOf(OCR1) + ' · ' + T.cacheKeyOf('res de res'));
        var cand = { name: N1, full: 'X:\\' + N1, created: 1000, size: 555 };
        var txtCache = T.cachePut({}, OCR1, cand);
        var mapCache = T.cacheRead(txtCache);
        ok('#TW/26 cachePut/cacheRead: es desa el fitxer triat amb la seua mida i data',
            mapCache['h:junqueras'] && mapCache['h:junqueras'].file === N1 &&
            mapCache['h:junqueras'].size === 555 && mapCache['|VER'] === T.VER,
            JSON.stringify(mapCache['h:junqueras']));
        ok('#TW/27 cacheLookup: la tria apresa es torna a trobar (la 2a volta casa sola)',
            !!T.cacheLookup(mapCache, OCR1, [{ name: N1, size: 555 }]));
        ok('#TW/28 cacheLookup: si el movie s\'ha REEXPORTAT (altra mida) → no val (es pregunta)',
            T.cacheLookup(mapCache, OCR1, [{ name: N1, size: 999 }]) === null);
        ok('#TW/29 cacheLookup: si el fitxer ja no hi és → null',
            T.cacheLookup(mapCache, OCR1, []) === null);
        ok('#TW/30 cacheRead: un JSON trencat es tracta com a caché buida (no peta)',
            T.cacheRead('{això no és json').length === undefined &&
            Object.keys(T.cacheRead('')).length === 1);

        // ── B. FLUX: les dos entrades + idempotència ─────────────────────────
        var W = UI.Workflows && UI.Workflows.Twitts;
        ok('#TW/31 Workflows.Twitts: AUTOMÀTICA (runAuto) + EMERGÈNCIA (Ctrl+🎯 runEmergency)',
            !!(W && typeof W.runAuto === 'function' && typeof W.runEmergency === 'function' &&
                typeof W._place === 'function' && typeof W._dialog === 'function' &&
                typeof W._covered === 'function'),
            'Twitts=' + typeof W);
        if (!W) { return; }

        var graf = [{ name: N1, start: 10, end: 20 }];
        ok('#TW/32 _isPlaced: el mateix movie cobrint el clip de V1 → ja hi és (no es duplica)',
            W._isPlaced(graf, N1, 10, 20) === true);
        ok('#TW/33 _isPlaced: un altre movie → no hi és',
            W._isPlaced(graf, N2, 10, 20) === false);
        ok('#TW/34 _isPlaced: el mateix movie en un ALTRE tram (solapament < 50 %) → no hi és',
            W._isPlaced(graf, N1, 18, 28) === false);
        ok('#TW/35 _isPlaced: sense nom (cap candidat) → no hi és',
            W._isPlaced(graf, '', 10, 20) === false);
        ok('#TW/36 _covered: un CHYRON damunt del clip NO compta (el tuit hi conviu)',
            W._covered([{ name: 'CHY_Titol_bloc.mov', start: 11, end: 19 }], { start: 10, end: 20 }) === false &&
            W._covered([{ name: N1, start: 11, end: 19 }], { start: 10, end: 20 }) === true);
        ok('#TW/37 _covered: un tuit en un altre tram (solapament < 50 %) → el clip és lliure',
            W._covered([{ name: N1, start: 18, end: 28 }], { start: 10, end: 20 }) === false &&
            W._covered([], { start: 10, end: 20 }) === false);

        // ── C. ARREL + BINS del projecte (per què la passada no es disparava) ──
        // La importació deixa els movies a l'arrel i els MOU al bin CHY; si només
        // es llig l'arrel (`Project.items('')`, no recursiu) no es veu cap XARXES.
        ok('#TW/38 binsDe: trau els bins del root (type 2) i no confon clips (type 1)',
            JSON.stringify(T.binsDe([
                { name: 'CHY', type: 2 }, { name: N1, type: 1 }, { name: 'GRAF', type: 2 }
            ])) === JSON.stringify(['CHY', 'GRAF']) &&
            T.binsDe([]).length === 0 && T.binsDe(null).length === 0);
        ok('#TW/39 uniqItems: root + bin amb el mateix item no es duplica',
            T.uniqItems([{ name: N1, mediaPath: 'X:\\' + N1 }, { name: N2, mediaPath: 'X:\\' + N2 },
                { name: N1, mediaPath: 'X:\\' + N1 }]).length === 2 &&
            T.uniqItems([null, { name: '' }]).length === 0);
        ok('#TW/40 unió root+bin: els XARXES del bin CHY es detecten igual que els de l\'arrel',
            T.uniqItems([{ name: N1, type: 1 }, { name: N2, type: 1 }])
                .filter(function (x) { return T.esXarxes(x.name); }).length === 2);

        // ── D. EMERGÈNCIA (Ctrl+🎯): match primer, si no llista del DIA ──────
        ok('#TW/41 l\'emergència té els àtoms: _dayDir, _dayMovies, _mergeList, _pick',
            typeof W._dayDir === 'function' && typeof W._dayMovies === 'function' &&
            typeof W._mergeList === 'function' && typeof W._pick === 'function');
        var merge = W._mergeList(
            [{ name: N1, full: 'C:\\a\\' + N1 }, { name: N1.toUpperCase(), full: 'C:\\dup\\' + N1 }],
            [{ name: N2, full: 'C:\\b\\' + N2 }, { name: N1.toLowerCase(), full: 'C:\\dup2\\' + N1 }]);
        ok('#TW/42 _mergeList: pendents del projecte primer, del dia darrere, sense repetits',
            merge.length === 2 &&
            merge[0].tag === 'al projecte' && merge[0].name === N1 && merge[0].full === 'C:\\a\\' + N1 &&
            merge[1].tag === 'del dia' && merge[1].name === N2);
        ok('#TW/43 _mergeList: entrades buides o nul·les es descarten (no peta)',
            W._mergeList(null, null).length === 0 &&
            W._mergeList([null, { name: '' }, {}], []).length === 0 &&
            W._mergeList([], [{ name: N1, full: 'C:\\x\\' + N1 }])[0].tag === 'del dia');
        var dm0 = await W._dayMovies('');
        ok('#TW/44 _dayMovies: sense data del projecte → ok:false amb motiu i sense fitxers',
            !!dm0 && dm0.ok === false && dm0.files.length === 0 &&
            typeof dm0.why === 'string' && dm0.why.length > 0);
        var dia = await W._dayDir();
        ok('#TW/45 _dayDir: torna YYYY_MM_DD (del .prproj si es pot, si no del rellotge)',
            dia === null || dia === '' || /^\d{4}_\d{2}_\d{2}$/.test(String(dia)) ||
            /^\d{4}_\d{2}_\d{2}$/.test(String(dia).replace(/-/g, '_')),
            'dia=' + String(dia));

        // ── E. FRAME DE MOSTRA (D19): ffmpeg sobre el MEDIA del clip ─────────
        // BUG #205: `Render.frame` no existix al DOM de PPro 25 i la passada
        // acabava en «0 col·locat(s)» sense dir res. Ara el frame ix del fitxer
        // del clip; cal mapear TC de timeline → TC del material.
        ok('#TW/46 srcTime: clip normal (inPoint 5, offset 5) → 10 s del fitxer',
            T.srcTime({ start: 10, end: 20, inPoint: 5, outPoint: 15 }, 15) === 10 &&
            Math.abs(T.srcTime({ start: 10, end: 20, inPoint: 5, outPoint: 15 }, 11.4) - 6.4) < 1e-9);
        ok('#TW/47 srcTime: sense inPoint/outPoint (dades antigues) → offset pur, mai negatiu',
            T.srcTime({ start: 10, end: 20 }, 15) === 5 &&
            T.srcTime({ start: 10, end: 20 }, 9) === 0 &&
            T.srcTime(null, 3) === 0);
        ok('#TW/48 srcTime: clip re-timed (timeline 10 s / material 20 s) → l\'offset es DOBLA',
            T.srcTime({ start: 10, end: 20, inPoint: 0, outPoint: 20 }, 15) === 10 &&
            T.srcTime({ start: 10, end: 20, inPoint: 0, outPoint: 20 }, 12) === 4);

        ok('#TW/49 pathOf: exacte, majúscules i sense extensió (i buit si no hi és)',
            T.pathOf({ 'a.mov': 'X:\\a.mov' }, 'a.mov') === 'X:\\a.mov' &&
            T.pathOf({ 'A.MOV': 'X:\\A.MOV' }, 'a.mov') === 'X:\\A.MOV' &&
            T.pathOf({ 'c.mov': 'X:\\c.mov' }, 'c') === 'X:\\c.mov' &&
            T.pathOf({ 'c.mov': 'X:\\c.mov' }, 'z.mov') === '' &&
            T.pathOf(null, 'a.mov') === '' && T.pathOf({ 'a.mov': 'X:\\a.mov' }, '') === '');

        // ── F. REPARACIÓ DE LA COL·LOCACIÓ (BUG #206) ─────────────────────────
        // `Clips.insert` (JSX) ajusta la duració amb `clips[numItems-1]`: l'ÚLTIM
        // clip de la pista, no el que acaba d'inserir. Amb chyrons a V3, el tuit
        // es quedava amb la duració SENCERA del mèdia (tapant els clips de V1
        // següents, tuit bo inclòs) i el chyron més tardà es retallava.
        // `_fixPlacement` ho repara amb `Clips.retrim` + verificació; ací es prova
        // amb una pista V3 SIMULADA (mateix patró que la prova d'#171).
        var W = UI.Workflows && UI.Workflows.Twitts;
        ok('#TW/50 _fixPlacement carregat (workflow TWITTS)',
            !!(W && typeof W._fixPlacement === 'function'), 'Twitts=' + typeof W);
        if (W && typeof W._fixPlacement === 'function') {
            var savedCJS = UI.Utils.callJSX;
            var savedGet = UI.Config.get;
            var CALLS = [];
            var T3 = [];
            var find = function (i) {
                for (var k = 0; k < T3.length; k++) { if (T3[k].index === i) return T3[k]; }
                return null;
            };
            try {
                UI.Config.get = function () { return { tracks: { video: { graficos: 3, mp4: 1 } } }; };
                UI.Utils.callJSX = async function (expr) {
                    var s = String(expr); CALLS.push(s);
                    var m;
                    if (/^Clips\.count\(/.test(s)) return String(T3.length);
                    if ((m = s.match(/^Clips\.get\(\d+,\s*(\d+),/))) {
                        var c = find(parseInt(m[1], 10));
                        return c ? JSON.stringify({ index: c.index, name: c.name, start: c.start, end: c.end, inPoint: c.inPoint, outPoint: c.outPoint }) : 'null';
                    }
                    if ((m = s.match(/^Clips\.retrim\(\d+,\s*(\d+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),/))) {
                        var c2 = find(parseInt(m[1], 10));
                        if (!c2) return 'ERR_CLIP';
                        c2.inPoint = Number(m[2]); c2.outPoint = Number(m[3]); c2.end = Number(m[4]);
                        return 'OK';
                    }
                    if ((m = s.match(/^Clips\.endAt\(\d+,\s*([\d.]+),\s*([\d.]+),/))) {
                        var st = Number(m[1]);
                        for (var k = 0; k < T3.length; k++) {
                            if (Math.abs(T3[k].start - st) < 0.06) { T3[k].end = Number(m[2]); return 'OK'; }
                        }
                        return 'ERR_CLIP';
                    }
                    return 'ERR_UNKNOWN:' + s;
                };

                // El tuit ha quedat amb la duració sencera del mèdia (20 s) i el
                // chyron de darrere ha sigut retallat (de 65 s a 60,2 s).
                T3 = [
                    { index: 0, name: 'Tuit_A.mov', start: 40, end: 60, inPoint: 0, outPoint: 20 },
                    { index: 1, name: 'Chyron_1.mov', start: 60, end: 60.2, inPoint: 0, outPoint: 5.2 }
                ];
                var before = [{ name: 'Chyron_1.mov', start: 60, end: 65, inPoint: 0, outPoint: 5 }];
                var r = await W._fixPlacement('Tuit_A.mov', 40, 43.4, before);
                ok('#TW/51 _fixPlacement: el tuit acaba al FINAL del clip de V1 (no a la fi del mèdia)',
                    r.ok && Math.abs(r.end - 43.4) < 0.07 && Math.abs(find(0).end - 43.4) < 0.07,
                    JSON.stringify(r) + ' end=' + find(0).end);
                ok('#TW/52 _fixPlacement: retall COHERENT (inPoint→outPoint→end) del tuit',
                    CALLS.some(function (c) { return /^Clips\.retrim\(3,/.test(c); }) &&
                    Math.abs((find(0).outPoint - find(0).inPoint) - (find(0).end - 40)) < 0.07,
                    'out=' + find(0).outPoint);
                ok('#TW/53 _fixPlacement: el clip que el JSX havia retallat es RESTAURA',
                    Math.abs(find(1).end - 65) < 0.07, 'chyron end=' + find(1).end);
                var r2 = await W._fixPlacement('No_hi_es.mov', 40, 43.4, []);
                ok('#TW/54 _fixPlacement: si el movie NO ha quedat a la pista → ok:false (no compta)',
                    r2.ok === false && /no apareix/.test(String(r2.why)), String(r2.why));
            } finally {
                UI.Utils.callJSX = savedCJS;
                if (savedGet === undefined) { delete UI.Config.get; } else { UI.Config.get = savedGet; }
            }
        }

        // ── G. FAMÍLIA «wott x <nom>» (BUG #208 · D22/D23) ────────────────────
        // Els tuit que s'exporten A MÀ (`wott x salvador illa.00666202.mov`)
        // no porten XARXES/LUCYS/_V_00_: fins ara l'emergència no els ensenyava.
        var N_ILLA = 'wott x salvador illa.00666202.mov';
        var N_ILLA1 = 'wott x salvador illa1.00666204.mov';
        var N_PEDRO = 'wott_v3 x pedro.00666211.mov';
        var N_TUR = "Wott_MAT_v2_105_00.01_DÚPLEX JORDI TURULL_652267_Tema-Titol_Llei d'amnistia_Junqueras, Tur_00654180.mov";
        var N_SANZ = 'Wott_TNM_V4_082_00.35_INSERTS PP I VOX I SÁNCHEZ_662526_Nomcarrec_Pedro Sánchez_president.00662579.mov';
        ok('#TW/55 esXarxes: «wott x salvador illa» ÉS un tuit (BUG #208)',
            T.esXarxes(N_ILLA) === true && T.esXarxes(N_ILLA1) === true,
            'illa=' + T.esXarxes(N_ILLA) + ' illa1=' + T.esXarxes(N_ILLA1));
        ok("#TW/56 esXarxes: «wott_v3 x pedro» també (la versió va pegada amb _v3)",
            T.esXarxes(N_PEDRO) === true);
        ok('#TW/57 esXarxes: els ròtols corrents («Wott_MAT_v2_105…», «Wott_TNM_V4_082…») NO són tuit',
            T.esXarxes(N_TUR) === false && T.esXarxes(N_SANZ) === false);
        ok('#TW/58 nomNet: el nom del titular, el tros de darrere la `x`',
            T.nomNet(N_ILLA) === 'salvador illa' && T.nomNet(N_ILLA1) === 'salvador illa1' &&
            T.nomNet(N_PEDRO) === 'pedro',
            T.nomNet(N_ILLA) + ' | ' + T.nomNet(N_PEDRO));
        ok("#TW/59 fileSuffix: el número d'export del nom (per a ordenar per hora)",
            T.fileSuffix(N_ILLA) === 666202 && T.fileSuffix(N_PEDRO) === 666211 &&
            T.fileSuffix('sense-numero.mov') === 0);
        var OCR_ILLA = 'El president de la Generalitat, Salvador Illa, ha dit que el PSC ' +
            'guanyara les eleccions i que no hi haura referèndum.';
        ok('#TW/60 semNombre: el text OCR del clip fa pujar els movies d\'Illa (també «illa1») i no el de Turull',
            T.semNombre(N_ILLA, OCR_ILLA) >= 5 && T.semNombre(N_ILLA1, OCR_ILLA) >= 5 &&
            T.semNombre(N_TUR, OCR_ILLA) === 0,
            'illa=' + T.semNombre(N_ILLA, OCR_ILLA) + ' illa1=' + T.semNombre(N_ILLA1, OCR_ILLA) +
            ' turull=' + T.semNombre(N_TUR, OCR_ILLA));
        var rk = T.rankPick([
            { name: N_TUR, full: 'X:\\' + N_TUR, tag: 'del dia' },
            { name: N_ILLA, full: 'X:\\' + N_ILLA, tag: 'del dia' },
            { name: N_PEDRO, full: 'X:\\' + N_PEDRO, tag: 'al projecte' }
        ], OCR_ILLA);
        ok("#TW/61 rankPick: el que s'assembla al text OCR va primer i no es perd cap ítem",
            rk.length === 3 && rk[0].name === N_ILLA && rk[0].pts >= 5,
            (rk[0] && rk[0].name) + ' pts=' + (rk[0] && rk[0].pts));
        ok("#TW/62 rankPick: sense text OCR desempata l'export MÉS RECENT",
            T.rankPick([{ name: N_ILLA }, { name: N_PEDRO }, { name: N_ILLA1 }], '')[0].name === N_PEDRO);
        var rec = W._recentOf([{ name: N_ILLA }, { name: N_PEDRO }, { name: N_ILLA1 }], 2);
        ok('#TW/63 _recentOf: la cua d\'altres dies = els 2 exports més recents, etiquetats',
            rec.length === 2 && rec[0].name === N_PEDRO && rec[0].tag === 'altre dia',
            JSON.stringify(rec.map(function (x) { return x.name; })));
        ok("#TW/64 _dayMovies: la resposta porta `other` (cua d'altres dies) encara que vaja buida",
            Array.isArray(dm0.other) && dm0.other.length === 0);

        // ── H. ÀRBRE DEL 🎯 (D24/D25 · 30/10/2026) ──────────────────────────
        // Petició d'usuari: només CONVERSA i XARXES-TEXT es col·loquen buscant-los
        // a la imatge; el criteri és el BLOC i el TC del nom (TC de fiar excepte
        // si és 00:00) i, quan no hi ha bloc («és V»), el rastreig de GRIS.
        var N_BLOC_TC = 'Wott_TNM_V3_045_12.10_LUCYS VERTICALITZACIÓ_660001_XARXES-TEXT_tp_Anna Simó_ERC_@annasimo.00660001.mov';
        var N_CONVERSA = 'Wott_TNM_V3_046_03.20_LUCYS VERTICALITZACIÓ_660002_CONVERSA_tp_Pere Aragonès_ERC_@perearagones.00660002.mov';
        var N_LUCY_TEMA = 'Wott_TNM_V_00_00.01_LUCYS VERTICALITZACIÓ_659602_Tema-Titol_Protestes a Europa_Itàlia_00659602.mov';
        var gf1 = T.grafFields(N_BLOC_TC);
        ok('#TW/65 grafFields: bloc V3, línia 045, TC 12.10, rol XARXES-TEXT, amb bloc',
            gf1.bloc === 'V3' && gf1.lini === '045' && gf1.tc === '12.10' &&
            gf1.rol === 'XARXES-TEXT' && gf1.teBloc === true && gf1.flotant === false,
            JSON.stringify(gf1));
        var gf2 = T.grafFields(N_LUCY_TEMA);
        ok('#TW/66 grafFields: `_V_00_` = FLOTANT (és V), sense bloc',
            gf2.bloc === 'V' && gf2.lini === '00' && gf2.flotant === true && gf2.teBloc === false,
            JSON.stringify(gf2));
        ok('#TW/67 tcFiable: TC bo si no és 00:00; 00.00 i 00.00.00 no són de fiar',
            T.tcFiable('00.35') === true && T.tcFiable('12.10') === true &&
            T.tcFiable('00.00') === false && T.tcFiable('00.00.00') === false &&
            T.tcFiable('') === false,
            '00.35=' + T.tcFiable('00.35') + ' 00.00=' + T.tcFiable('00.00'));
        ok('#TW/68 tcToSec: 00.35 → 35 s · 01.02.15 → 3735 s · 00.00 → 0',
            T.tcToSec('00.35') === 35 && T.tcToSec('01.02.15') === 3735 &&
            T.tcToSec('00.00') === 0,
            T.tcToSec('00.35') + ' | ' + T.tcToSec('01.02.15'));
        ok('#TW/69 esOcrItem: XARXES-TEXT i CONVERSA sí; `LUCYS … Tema-Titol` NO',
            T.esOcrItem(N_BLOC_TC) === true && T.esOcrItem(N_CONVERSA) === true &&
            T.esOcrItem(N_LUCY_TEMA) === false && T.esOcrItem(N_SANZ) === false,
            'xarxes=' + T.esOcrItem(N_BLOC_TC) + ' conversa=' + T.esOcrItem(N_CONVERSA) +
            ' tema=' + T.esOcrItem(N_LUCY_TEMA));
        ok("#TW/70 esOcrItem: l'export manual «wott x <nom>» continua entrant (D22)",
            T.esOcrItem(N_ILLA) === true && T.esOcrItem(N_PEDRO) === true);
        ok('#TW/71 mateixNom: el nom TRUNCAT de Premiere (~90) casa amb el sencer',
            T.mateixNom(N_BLOC_TC, N_BLOC_TC.substring(0, 90)) === true &&
            T.mateixNom(N_BLOC_TC, N_CONVERSA) === false,
            N_BLOC_TC.substring(0, 90));
        ok('#TW/72 pendents: un ítem amb el nom truncat al timeline NO compta com a pendent',
            T.pendents([{ name: N_BLOC_TC }, { name: N_CONVERSA }],
                [N_BLOC_TC.substring(0, 90)]).length === 1,
            JSON.stringify(T.pendents([{ name: N_BLOC_TC }], [N_BLOC_TC.substring(0, 90)])));
        ok('#TW/73 el flux té les portes de l\'arbre: ocrItems + runGris + _rastreigBloc + _placeByTc',
            typeof T.ocrItems === 'function' && typeof W.runGris === 'function' &&
            typeof W._rastreigBloc === 'function' && typeof W._placeByTc === 'function' &&
            typeof W._scanTimeline === 'function' && typeof W._clipsLliures === 'function',
            'ocrItems=' + typeof T.ocrItems + ' runGris=' + typeof W.runGris);
        var M2 = W.Mapa;
        var kw = '';
        if (M2 && M2.GRAF_KEYWORDS) kw = M2.GRAF_KEYWORDS.join(',');
        if (!kw) {
            // `Workflows.Mapa` pot no estar carregat en el smoke: es llig la
            // CONSTANT directament del font del repo (fetch de file:///).
            try {
                var rep = String(window.__REPO || '');
                if (rep && !/^file:/i.test(rep)) rep = 'file:///' + rep.replace(/^\/+/, '');
                var urlMapa = rep.replace(/\/+$/, '') + '/js/workflows/flow_mapa.js';
                var resMapa = await fetch(urlMapa);
                var srcMapa = await resMapa.text();
                var mKw = /GRAF_KEYWORDS:\s*\[([^\]]*)\]/.exec(String(srcMapa || ''));
                kw = mKw ? mKw[1] : '';
            } catch (eRead) { kw = ''; }
        }
        ok('#TW/74 MAPA o GOOGLE: la paraula clau dels marcadors inclou GOOGLE',
            kw.indexOf('MAPA') !== -1 && kw.indexOf('GOOGLE') !== -1, '[' + kw + ']');

        // ── A3-b. BUG #210-b (30/10): el handle del tuit derivat del NOM ─────
        // Cas real TNV V1 30/10: el movie NO duu `@handle`
        // (`…_XARXES-TEXT_tp_Gabriel Rufián_ERC_.00668981.mov`), el tuit es va
        // DETECTAR a la imatge (`TUIT @gabrielrufian`, 00:01:36:19) i el millor
        // candidat es va quedar en 50 punts (només el titular) → sota l'umbral de
        // 80 → «SENSE movie clar» → PENDENT. El handle és el nom PEGAT.
        var N4 = 'Wott_TNV_V1_10_00.00_CAMPANYA ELECTORAL ACCIDENT_668645_XARXES-TEXT_tp_Gabriel Rufián_ERC_.00668981.mov';
        var OCR4 = 'Gabriel Rufián\n@gabrielrufian\nEl que ha dit el portaveu';
        var s4 = T.scoreCandidat(OCR4, N4);
        ok('#TW/75 🐞 #210-b: sense @handle al movie, el NOM PEGAT casa («Gabriel Rufián» ↔ @gabrielrufian) → 150',
            T.wottFields(N4).handle === '' && s4.score === 150 &&
            s4.handle === 'gabrielrufian' && s4.titular === 1, JSON.stringify(s4));
        var N5 = 'Wott_TNV_V1_10_01.00_CAMPANYA_1_XARXES-TEXT_tp_Ana_ERC_.00660001.mov';
        var s5 = T.scoreCandidat('@anabelcardenas\ntext del tuit', N5);
        ok('#TW/76 el nom PEGAT curt no fa casar un altre handle (@anabel… vs «Ana») → sense punts d\'handle',
            s5.score === 20 && s5.handle === '', JSON.stringify(s5));
        ok('#TW/77 rankCandidates fa pujar el candidat pel nom PEGAT (150 davant d\'un altre titular)',
            (function () {
                var r = T.rankCandidates(OCR4, [
                    { name: 'Wott_TNV_V1_10_00.00_CAMPANYA_2_XARXES-TEXT_tp_Marta Rovira_Junts_.00660002.mov', created: 2 },
                    { name: N4, created: 1 }
                ]);
                return r[0].name === N4 && r[0].score === 150;
            })(), 'ok');

        // ── A3-c. 30/10: congelat de la cua i gris ABANS de l'OCR ────────────
        // Petició d'usuari: (1) si el clip de V1 és més llarg que el movie, el
        // tuit s'ha de col·locar a la seua durada REAL i CONGELAR el darrer frame
        // fins al final del clip; (2) abans d'exportar 1 PNG per clip, mesurar la
        // placa grisa amb ffmpeg (1 crida per clip, sense PNG).
        ok('#TW/78 _cobert: part viva + congelat cobrixen el clip sencer (3s + 2s → 100 %)',
            (function () {
                var cob = W._cobert([
                    { name: N4, start: 10, end: 13 },
                    { name: N4, start: 13, end: 15 }
                ], N4, 10, 15);
                return Math.abs(cob - 1) < 0.001;
            })(), 'cobert=' + (typeof W._cobert === 'function' ? 'fn' : 'NO'));
        ok('#TW/79 _cobert: sense clips → 0 i amb mig clip → 50 %',
            W._cobert([], N4, 10, 15) === 0 &&
            Math.abs(W._cobert([{ name: N4, start: 10, end: 12.5 }], N4, 10, 15) - 0.5) < 0.001,
            'ok');
        ok('#TW/80 el flux té el congelat (_placeAmbCongelat + _mediaDur, amb reparació #206) i el gris abans de l\'OCR (_rastreigBloc amb fallback)',
            typeof W._placeAmbCongelat === 'function' && typeof W._mediaDur === 'function' &&
            typeof W._restaura === 'function' &&
            typeof W._rastreigBloc === 'function' && W._rastreigBloc.length === 5,
            '_placeAmbCongelat=' + typeof W._placeAmbCongelat +
            ' _mediaDur=' + typeof W._mediaDur + ' _restaura=' + typeof W._restaura +
            ' _rastreigBloc.length=' + (W._rastreigBloc ? W._rastreigBloc.length : '-'));

        // ── A3-d. 30/10: durada EXACTA del movi (ffprobe) ─────────────────────
        // En viu (30/10) la part viva del tuit va quedar 16 frames MÉS LLARGA que
        // el movie: la durada venia de l'estimació per MIDA de fitxer, calibrada
        // per als ProRes 422 HQ OPACS (45,56 MB/s) i els movies de tuit són ProRes
        // amb ALPHA (~9 % més de bitrate). Ara mana ffprobe del FICHERO.
        ok('#TW/81 _snapDur: alinea a la rejilla de frames (25 fps) al frame més pròxim',
            typeof W._snapDur === 'function' &&
            Math.abs(W._snapDur(6.03) - 6.04) < 1e-6 &&
            Math.abs(W._snapDur(6.019) - 6.0) < 1e-6 &&
            Math.abs(W._snapDur(2) - 2.0) < 1e-6 &&
            Math.abs(W._snapDur(0) - 0.04) < 1e-6,
            'snap(6.03)=' + (W._snapDur ? W._snapDur(6.03) : '-') +
            ' snap(6.019)=' + (W._snapDur ? W._snapDur(6.019) : '-') +
            ' snap(0)=' + (W._snapDur ? W._snapDur(0) : '-'));
        var srcTW = '';
        try {
            var repTW = String(window.__REPO || '');
            if (repTW && !/^file:/i.test(repTW)) repTW = 'file:///' + repTW.replace(/^\/+/, '');
            var resTW = await fetch(repTW.replace(/\/+$/, '') + '/js/workflows/flow_twitts.js');
            srcTW = String(await resTW.text());
        } catch (eReadTW) { srcTW = ''; }
        ok('#TW/82 _mediaDur mesura el FICHER amb ffprobe (getMediaDuration) i _place li passa la ruta (cand.full)',
            /_mediaDur:\s*async\s+function\s*\(\s*name\s*,\s*full\s*\)/.test(srcTW) &&
            /getMediaDuration\(path\)/.test(srcTW) &&
            /_mediaDur\(name,\s*cand\.full\)/.test(srcTW),
            srcTW ? ('font ' + srcTW.length + ' B') : 'font NO llegida');

        // ── A3-e. 02/11: RELLOTGE D'ARENA A LA DIANA 🎯 (#219) ──────────────────
        // Petició d'usuari: el rastreig de gris amb ffmpeg (`GrafZonaGris.detect`,
        // 1 crida per clip) pot dur desenes de segons i el panell callava. El clic
        // normal del 🎯 no passava per `callWorkflow` i, per tant, no rebia mai
        // `markBtnBusy`. Ara el handler embolcalla `runPlaceAllChyrons` amb el
        // rellotge (try/finally) i `_rastreigBloc` anuncia què està fent.
        var srcMAIN = '';
        try {
            var repM = String(window.__REPO || '');
            if (repM && !/^file:/i.test(repM)) repM = 'file:///' + repM.replace(/^\/+/, '');
            var resM = await fetch(repM.replace(/\/+$/, '') + '/js/main.js');
            srcMAIN = String(await resM.text());
        } catch (eReadM) { srcMAIN = ''; }
        ok('#TW/83 main.js: el 🎯 embolcalla `runPlaceAllChyrons` amb rellotge d\'arena (markBtnBusy + finally → clearBtnBusy)',
            /btnChyronColocar\.addEventListener\('click',\s*async\s*\(e\)\s*=>\s*\{/.test(srcMAIN) &&
            /markBtnBusy\(btnChyronColocar\)/.test(srcMAIN) &&
            /await runPlaceAllChyrons\(\)/.test(srcMAIN) &&
            /finally\s*\{\s*clearBtnBusy\(btnChyronColocar\);\s*\}/.test(srcMAIN),
            srcMAIN ? ('font ' + srcMAIN.length + ' B') : 'font NO llegida');
        ok('#TW/84 flow_twitts: `_rastreigBloc` anuncia el rastreig de gris (⏳ al log INFO + status) abans del bucle de ffmpeg',
            /⏳ \[XARXES\] rastreig de gris amb ffmpeg: ' \+ lliures\.length/.test(srcTW) &&
            /status\('XARXES: rastrejant el gris \(' \+ lliures\.length/.test(srcTW) &&
            /for \(var i = 0; i < lliures\.length; i\+\+\)/.test(srcTW),
            'log=' + /⏳ \[XARXES\] rastreig de gris/.test(srcTW) +
            ' status=' + /rastrejant el gris/.test(srcTW));
        var srcHTML = '';
        try {
            var repH = String(window.__REPO || '');
            if (repH && !/^file:/i.test(repH)) repH = 'file:///' + repH.replace(/^\/+/, '');
            var resH = await fetch(repH.replace(/\/+$/, '') + '/index.html');
            srcHTML = String(await resH.text());
        } catch (eReadH) { srcHTML = ''; }
        var verTW = function (rel) {
            var m = new RegExp(rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\?v=(\\d+)').exec(srcHTML);
            return m ? parseInt(m[1], 10) : -1;
        };
        ok('#TW/85 index.html: cache-bust del #219 (main ' + verTW('js/main.js') +
            ', flow_twitts ' + verTW('js/workflows/flow_twitts.js') + ')',
            verTW('js/main.js') >= 104 && verTW('js/workflows/flow_twitts.js') >= 11);

        // ── A3-e. 30/10: cap PNG temporal que es quede al disc ─────────────────
        // En viu (TNV V1 30/10, 12:47) `C:\temp` tenia **14 `fp_twitts_<n>.png`**
        // (0,5-0,9 MB cada un, ≈8 MB) per a un sol bloc i un sol tuit: el nom del
        // PNG portava l'ÍNDEX del clip i només es borrava el propi ABANS de
        // capturar-lo, així que cada clip deixava el seu per sempre.
        var srcOcr = '';
        try {
            var repOcr = String(window.__REPO || '');
            if (repOcr && !/^file:/i.test(repOcr)) repOcr = 'file:///' + repOcr.replace(/^\/+/, '');
            var resOcr = await fetch(repOcr.replace(/\/+$/, '') + '/js/logic/22_TwittsOcr_Logic.js');
            srcOcr = String(await resOcr.text());
        } catch (eReadOcr) { srcOcr = ''; }
        ok('#TW/83 pngPathOf: UN fitxer temporal per a tots els clips i _netejaPng el suprimix després de l\'OCR',
            typeof T.pngPathOf === 'function' &&
            T.pngPathOf(1) === T.pngPathOf(14) &&
            /fp_twitts\.png/.test(String(T.pngPathOf(1))) &&
            !/fp_twitts_'\s*\+/.test(srcOcr) &&
            /async function _netejaPng\(/.test(srcOcr) &&
            /await _netejaPng\(sp\.png\);/.test(srcOcr),
            'png=' + (T.pngPathOf ? String(T.pngPathOf(1)) : '-') +
            ' font=' + (srcOcr ? srcOcr.length + ' B' : 'NO llegida'));

        // ── A3-f. 03/11 · BUG #232: la finestra del Ctrl+🎯 ha de ser ─────────
        // CONGRUENT amb la data de la capçalera. Dos defectes vistos en viu:
        // (a) la data de cada movie es decidia NOMÉS pel stat del fitxer (no pel
        // NOM, com fa `filterByWorkDate` a tota l'extensió) i (b) la cua de
        // reserva era «els 20 exports més recents de la carpeta SENCERA»
        // (qualsevol dia) → un projecte d'ahir ensenyava movies de hui.
        ok('#TW/86 _diesEntre: dies entre dos YYYYMMDD (simètric, null si no és data)',
            W._diesEntre('20261101', '20261102') === 1 &&
            W._diesEntre('20261102', '20261101') === -1 &&
            W._diesEntre('20261030', '20261102') === 3 &&
            W._diesEntre('20261102', '20261102') === 0 &&
            W._diesEntre('', '20261102') === null &&
            W._diesEntre('20261232', '20261102') === null,
            'dif=' + W._diesEntre('20261030', '20261102'));
        ok('#TW/87 _dayMovies: data pel NOM (criteri de filterByWorkDate) i cua només de dies veïns',
            /_fileDateYYYYMMDD\(\{\s*name:\s*movs\[j\]\s*\}\)/.test(srcTW) &&
            /_diesEntre\(d8,\s*target\)/.test(srcTW) &&
            /Math\.abs\(dif\)\s*<=\s*1/.test(srcTW) &&
            /out\.far\+\+/.test(srcTW) &&
            typeof dm0.far === 'number',
            'far=' + dm0.far + ' font=' + (srcTW ? srcTW.length + ' B' : 'NO llegida'));
        ok('#TW/88 runEmergency: el recompte visible diu del dia / al projecte / dies veïns',
            /de dies veïns/.test(srcTW) &&
            /movie\(s\):/.test(srcTW) &&
            /Cap \.mov de tuit datat el /.test(srcTW),
            'sub=' + /movie\(s\):/.test(srcTW));

    };
})();


