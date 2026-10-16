/* ============================================================================
 * PROVA BUG #167/#168 (2026-10-16) - RETOL DE LOCALITZACIO DEL DIRECTE -> ITEM IPD
 * ----------------------------------------------------------------------------
 * Bug: el retol de localitzacio ve penjat de l'ITEM D'INTRO del DIFERIT (el
 * generador de rotols l'emet amb aquell lineID:
 *   Wott_TNM_v2_04i_00.00_intro DIFERIT (VIMBODI I POBLE_644353_Directe_PRESENCIAL_Vimbodi i P.
 * ) pero el lloc nomes es a pantalla quan ARRENCA el directe del bloc, que aqui
 * obre l'IPD. Amb el marcador de la intro a 0 s el retol sortia a 0.40 s: 34 s abans.
 *
 * Fixtures = dades REALS del run TN MEDIODIA V2 (15/10) [TNM_V2.fastpass.json]:
 *   markers.list: 04i@0 · "04 P4-1"@10 · 04@18.36 · "05 - +++IPD POBLET VISITA"@34.36 · 06@69.52
 *   chyrons de l'item 04i: Directe_PRESENCIAL_Vimbodi i P. (col.locat a 0.40 s, MALAMENT)
 *                          Enviat_No_Laura Catalan Asenjo (a 0.40 s, MALAMENT des del 16/10)
 * Resultat esperat: el de Directe_PRESENCIAL va a l'item 05 (34.36 s -> 34.76 s de
 * col.locacio) i, des del BUG #168 (peticio d'usuari), l'ENVIAT de la intro TAMBE es mou:
 * al SEGUENT item DIRECTE o DIFERIT -> «04 - DIFERIT LAURA CATALAN» @18.36 s (que es
 * l'item que parla de Laura Catalan, la persona del retol).
 *
 * S'encadena DESPRES de fp_probe_f45.js (mateix patro: embolcalla __runTests).
 * ==========================================================================*/
(function () {
    var orig = window.__runTests;
    window.__runTests = async function () {
        await orig();

        var ok = window.__ok;
        var CHY = window.FASTPASS_UI.Workflows.Chyrons;
        window.__PHASE = '15-ipd-chyron';

        ok('flow_chyrons amb els helpers d\'IPD (BUG #167) i d\'INTRO/DIFERIT (BUG #168)',
            !!(CHY && CHY._isDirecteSenyalWott && CHY._isIpdDirecteMarker &&
                CHY._firstIpdDirecteAfter && CHY._ipdAnchorPlan &&
                CHY._isIntroMarker && CHY._isDiferitMarker && CHY._sigTokens &&
                CHY._pickDirecteDiferitAfter && CHY._firstDirecteDiferitAfter));
        if (!CHY || !CHY._ipdAnchorPlan) { return; }

        // ── Fixtures: el bloc v2 REAL (TN MEDIODIA 15/10) ───────────────────
        var C_DIR = 'Wott_TNM_v2_04i_00.00_intro DIFERIT (VIMBOD\u00cd I POBLE_644353_Directe_PRESENCIAL_Vimbod\u00ed i P.00645014.mov';
        var C_ENV = 'Wott_TNM_v2_04i_00.01_intro DIFERIT (VIMBOD\u00cd I POBLE_644409_Enviat_No_Laura Catalan Asenjo.00645015.mov';
        var C_NOM = 'Wott_TNM_v2_06_00.01_INSERTS POBLET_644341_Nomcarrec_Felip VI_rei d\'Espanya.00645025.mov';

        function chy(name, rol, tc) { return { name: name, rol: rol || '', tc: tc || '00.00' }; }
        var cDir = chy(C_DIR, 'Directe');
        var cEnv = chy(C_ENV, 'Enviat', '00.01');
        var cNom = chy(C_NOM, 'Nomcarrec', '00.01');

        var MK = [
            { fullId: '04i', blockNum: '04', time: 0, label: '04i - intro DIFERIT (VIMBOD\u00cd I POBLET)' },
            { fullId: '04 P4-1', blockNum: '04', time: 10, label: '04 P4-1 - P4 FOTO OFICIAL' },
            { fullId: '04', blockNum: '04', time: 18.36, label: '04 - DIFERIT LAURA CATALAN' },
            { fullId: '05', blockNum: '05', time: 34.36, label: '05 - +++IPD POBLET VISITA' },
            { fullId: '06', blockNum: '06', time: 69.52, label: '06 - INSERTS POBLET' }
        ];
        // `structureById` amb les mateixes claus que `entry.id` (13_Parse) i el mateix
        // `chyrons` que porta cada item.
        function structOf(pairs) {
            var s = {};
            pairs.forEach(function (p) { s[p[0]] = { id: p[0], suffix: p[1], chyrons: p[2] }; });
            return s;
        }
        var STRUCT = structOf([
            ['04i', 'i', [cDir, cEnv]],
            ['04 P4-1', '', []],
            ['04', '', []],
            ['05', '', []],
            ['06', '', [cNom]]
        ]);

        // Filtre RESTA (mirall de `placeChyronResto`): el retol del directe no pertany a cap
        // de les families JSON. Nomes cal que el cas real PASSI pel filtre, com al flux.
        var filterResto = function (c) {
            var rol = (c.rol || '').toUpperCase();
            if (CHY._isTraduccioWott(c)) return false;
            if (rol === 'NOMCARREC' || rol === 'LLOCDATA' || rol === 'CONDUCTOR') return false;
            if (rol === 'TEMA-TITOL' || (c.name || '').indexOf('Tema-Titol') !== -1) return false;
            if ((c.name || '').indexOf('Lloc') !== -1 || (c.name || '').indexOf('Data') !== -1) return false;
            if ((c.name || '').indexOf('Nom') !== -1 || (c.name || '').indexOf('Carrec') !== -1) return false;
            return true;
        };

        // ── 1. Familia: NOMES DIRECTE/PRESENCIAL (pel ROL, no pel text lliure) ──
        ok('#167 _isDirecteSenyalWott: el retol REAL de Vimbodi es de la familia',
            CHY._isDirecteSenyalWott(cDir) === true, String(cDir.rol));
        ok('#167 _isDirecteSenyalWott: el d\'Enviat NO hi entra (te la seva regla)',
            CHY._isDirecteSenyalWott(cEnv) === false, String(cEnv.rol));
        ok('#167 _isDirecteSenyalWott: nom-carrec / Tema-Titol / Lloc-Data NO hi entren',
            CHY._isDirecteSenyalWott(cNom) === false &&
            CHY._isDirecteSenyalWott(chy('Wott_x_01_00.00_text_644349_TEMA-TITOL_Tema.mov', 'TEMA-TITOL')) === false &&
            CHY._isDirecteSenyalWott(chy('Wott_x_01_00.00-A_644348_Lloc_Data_Barcelona.mov', 'LLOCDATA')) === false);
        ok('#167 _isDirecteSenyalWott: variants de rol (PRESENCIAL, Directe_PRESENCIAL)',
            CHY._isDirecteSenyalWott(chy('Wott_x_01_00.00-A_644350_PRESENCIAL_Berlin.mov', 'PRESENCIAL')) === true &&
            CHY._isDirecteSenyalWott(chy('Wott_x_01_00.00-A_644351_Directe_PRESENCIAL_Berlin.mov', 'Directe_PRESENCIAL')) === true);
        ok('#167 _isDirecteSenyalWott: el TEXT lliure amb la paraula directe no canvia de familia',
            CHY._isDirecteSenyalWott(chy('Wott_x_01_00.00_text_644352_Nomcarrec_directe a les 21h.mov', 'Nomcarrec')) === false);

        // ── 2. Que compta com a IPD/directe ─────────────────────────────────
        ok('#167 _isIpdDirecteMarker: el marcador REAL de l\'IPD (+++IPD)',
            CHY._isIpdDirecteMarker(MK[3], STRUCT['05']) === true, MK[3].label);
        ok('#167 _isIpdDirecteMarker: un item de DIRECTE (01dir - CONNEXIO DIRECTE)',
            CHY._isIpdDirecteMarker({ fullId: '01dir', time: 5, label: '01dir - CONNEXIO DIRECTE ILLA' }, {}) === true &&
            CHY._isIpdDirecteMarker({ fullId: '07', time: 5, label: '07 - DIRECTE DES DE TARRAGONA' }, {}) === true);
        ok('#167 _isIpdDirecteMarker: la intro, el DIFERIT i els INSERTS NO son IPD',
            CHY._isIpdDirecteMarker(MK[0], STRUCT['04i']) === false &&
            CHY._isIpdDirecteMarker(MK[2], STRUCT['04']) === false &&
            CHY._isIpdDirecteMarker(MK[4], STRUCT['06']) === false);
        ok('#167 _isIpdDirecteMarker: el sufix de bloc `dir` tambe compta',
            CHY._isIpdDirecteMarker({ fullId: '08', time: 70, label: '08 - reprotes' },
                { id: '08', suffix: 'dir', chyrons: [] }) === true);

        // ── 3. Quin es el primer IPD/directe POSTERIOR ──────────────────────
        ok('#167 _firstIpdDirecteAfter: des de la intro (0 s) -> l\'IPD de 34.36 s',
            CHY._firstIpdDirecteAfter(MK, STRUCT, 0) === 34.36);
        ok('#167 _firstIpdDirecteAfter: des de qualsevol item del bloc -> el MATEIX IPD',
            CHY._firstIpdDirecteAfter(MK, STRUCT, 10) === 34.36 &&
            CHY._firstIpdDirecteAfter(MK, STRUCT, 18.36) === 34.36);
        ok('#167 _firstIpdDirecteAfter: des del PROPI IPD (o mes enlla) -> cap',
            CHY._firstIpdDirecteAfter(MK, STRUCT, 34.36) === null &&
            CHY._firstIpdDirecteAfter(MK, STRUCT, 69.52) === null);

        // ── 4. El PLA (el que fa servir `_placeChyronsByType`) ──────────────
        var plan = CHY._ipdAnchorPlan(MK, STRUCT, filterResto, 'Resto');
        ok('#167 PLA: el retol de Vimbodi es mou al marcador de l\'IPD (34.36 s)',
            plan.de[C_DIR] === 34.36,
            'moved=' + plan.moved + ' de=' + JSON.stringify(plan.de));
        ok('#167 PLA: arriba al marcador 05 @ 34.36 s (col.locacio 34.76 s amb +0.40 s)',
            (plan.per['34.36'] || []).length === 1 && plan.per['34.36'][0] === cDir,
            Object.keys(plan.per).join(','));
        ok('#167 PLA: el nom-carrec NO es toca i mai hi ha cap desti a 0 s',
            plan.de[C_NOM] === undefined && plan.per['0.00'] === undefined,
            JSON.stringify(Object.keys(plan.de)));
        // (2026-10-16 · BUG #168) L'ENVIAT penjat de la MATEIXA intro TAMBE es mou: abans es
        // quedava a 0.40 s perque no tenia punt de connexio. Els detalls, al bloc 6.
        ok('#168 PLA: 2 moviments — el PRESENCIAL (34.36 s) i l\'ENVIAT de la intro (18.36 s)',
            plan.moved === 2, 'moved=' + plan.moved + ' de=' + JSON.stringify(plan.de));
        ok('#167 PLA: el log diu d\'on ve i on va (diagnostic per l\'usuari)',
            window.__LOG.some(function (l) {
                return l.indexOf('LOCALITZACI\u00d3') !== -1 && l.indexOf('04i') !== -1 &&
                    l.indexOf('05') !== -1 && l.indexOf('34.36') !== -1;
            }));

        // ── 5. Guardes ──────────────────────────────────────────────────────
        // (b) si el retol JA penja de l'item IPD/directe, es queda on es (convencio d'usuari).
        var STRUCT2 = structOf([['05', '', [cDir, cEnv]], ['06', '', []]]);
        var plan2 = CHY._ipdAnchorPlan(MK, STRUCT2, filterResto, 'Resto');
        ok('#167 GUARDA: retol que ja penja del seu item IPD/directe -> no es mou',
            plan2.moved === 0 && plan2.de[C_DIR] === undefined, 'moved=' + plan2.moved);

        // El filtre de la FASE mana: si la fase no reclama aquest retol, el pla no el toca.
        var plan3 = CHY._ipdAnchorPlan(MK, STRUCT, function (c) { return c.name.indexOf('Lloc') !== -1; }, 'Lloc');
        ok('#167 GUARDA: filtre de fase que no reclama el retol -> pla buit',
            plan3.moved === 0 && Object.keys(plan3.de).length === 0, 'moved=' + plan3.moved);

        // Sense cap IPD/directe al bloc, no hi ha res a fer (ni errors).
        var MK_NOIPD = [MK[0], MK[1], MK[4]];
        var plan4 = CHY._ipdAnchorPlan(MK_NOIPD, STRUCT, filterResto, 'Resto');
        ok('#167 GUARDA: bloc sense IPD/directe -> cap moviment i cap error',
            plan4.moved === 0 && Object.keys(plan4.per).length === 0, 'moved=' + plan4.moved);

        // ── 6. BUG #168 (2026-10-16): retol de PRESENCIAL/ENVIAT penjat d'una INTRO ──
        // Peticio d'usuari: «si apareix un retol de PRESENCIAL i/o ENVIAT en una intro, s'ha de
        // moure al SEGUENT item DIRECTE o DIFERIT». (El PRESENCIAL ja ho feia cap a l'IPD; ara
        // tambe hi entren els ENVIAT d'intro i els blocs on el que arrenca es un DIFERIT.)
        window.__PHASE = '16-intro-directe-diferit';

        ok('#168 _isIntroMarker: la intro REAL del cas (04i) ho es',
            CHY._isIntroMarker(MK[0], STRUCT['04i']) === true);
        ok('#168 _isIntroMarker: el DIFERIT, els inserts i l\'IPD NO son intro',
            CHY._isIntroMarker(MK[2], STRUCT['04']) === false &&
            CHY._isIntroMarker(MK[4], STRUCT['06']) === false &&
            CHY._isIntroMarker(MK[3], STRUCT['05']) === false);
        ok('#168 _isIntroMarker: variants (01 PGi - PG Intro · «08 - INTRO ILLA» · sufix i)',
            CHY._isIntroMarker({ fullId: '01 PGi', time: 0, label: '01 PGi - PG Intro' }, {}) === true &&
            CHY._isIntroMarker({ fullId: '08', time: 0, label: '08 - INTRO ILLA' }, {}) === true &&
            CHY._isIntroMarker({ fullId: '09', time: 0, label: '09 - res' }, { id: '09', suffix: 'i', chyrons: [] }) === true);
        ok('#168 _isDiferitMarker: el DIFERIT REAL ho es i els inserts NO',
            CHY._isDiferitMarker(MK[2], STRUCT['04']) === true &&
            CHY._isDiferitMarker(MK[4], STRUCT['06']) === false);
        ok('#168 _sigTokens: fora capcaleres del format, dins el TEXT del retol',
            JSON.stringify(CHY._sigTokens(C_DIR)) === JSON.stringify(['VIMBODI', 'POBLE']) &&
            CHY._sigTokens(C_ENV).indexOf('LAURA') !== -1 &&
            CHY._sigTokens(C_ENV).indexOf('CATALAN') !== -1);
        ok('#168 DESTI: l\'ENVIAT de Laura -> el DIFERIT «04 - DIFERIT LAURA CATALAN» (18.36 s)',
            CHY._firstDirecteDiferitAfter(MK, STRUCT, 0, C_ENV) === 18.36);
        ok('#168 DESTI: el PRESENCIAL de Vimbodi -> l\'IPD (34.36 s, convencio del #167)',
            CHY._firstDirecteDiferitAfter(MK, STRUCT, 0, C_DIR) === 34.36);
        ok('#168 DESTI: del PROPI DIFERIT en endavant ja no hi ha desti abans de l\'IPD',
            CHY._firstDirecteDiferitAfter(MK, STRUCT, 18.36, C_ENV) === 34.36);
        ok('#168 DESTI: sense cap DIRECTE/DIFERIT posterior -> null',
            CHY._firstDirecteDiferitAfter([MK[0], MK[1], MK[4]], STRUCT, 0, C_DIR) === null);
        ok('#168 PLA: l\'ENVIAT penjat d\'una INTRO SI que es mou (condicio NOVA)',
            plan.de[C_ENV] === 18.36 && (plan.per['18.36'] || []).length === 1 &&
            plan.per['18.36'][0] === cEnv, 'de=' + JSON.stringify(plan.de));
        ok('#168 GUARDA: un ENVIAT que NO penja d\'una intro no el toca aquesta regla',
            (function () {
                var s = structOf([['04i', 'i', []], ['04', '', [cEnv]], ['05', '', []]]);
                return CHY._ipdAnchorPlan(MK, s, filterResto, 'Resto').de[C_ENV] === undefined;
            })());
        ok('#168 GUARDA: un nom-carrec a la intro tampoc (nomes PRESENCIAL/ENVIAT)',
            (function () {
                var s = structOf([['04i', 'i', [cNom]], ['04', '', []], ['05', '', []]]);
                return CHY._ipdAnchorPlan(MK, s, filterResto, 'Resto').moved === 0;
            })());
        ok('#168 LOG: diu el tipus de desti (DIRECTE o DIFERIT) i els dos instants',
            window.__LOG.some(function (l) {
                return l.indexOf('LOCALITZACI\u00d3 (intro)') !== -1 && l.indexOf('DIFERIT 04') !== -1 &&
                    l.indexOf('18.36') !== -1;
            }));
    };
})();
