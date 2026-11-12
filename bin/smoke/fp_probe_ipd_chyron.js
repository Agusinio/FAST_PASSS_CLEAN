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
        ok('#168 LOG: diu el tipus de desti (DIFERIT) i els dos instants',
            window.__LOG.some(function (l) {
                return l.indexOf('ENVIAT (intro)') !== -1 && l.indexOf('DIFERIT 04') !== -1 &&
                    l.indexOf('18.36') !== -1;
            }));

        // ── 7. BUG #264 (2026-11-12): ENVIAT -> DIFERIT del SEU bloc · PRESENCIAL -> IPD del SEU bloc ──
        // Cas real TNV V2 (11/11) [TNV_V2.fastpass.json · MARCADORS_2026-11-12_1202.txt]:
        //   08dp@0 «Donapas diferits» · 08@7.88 «DIFERIT MANI TARRAGONA» · 09@18.12 «+++IPD MANI TARRAGONA»
        //   10@49.64 «DIFERIT MANI TORTOSA» · 10Chy@59.64 «chyrons tortosa» (NO hi ha 11/+++IPD de Tortosa)
        //   12@88.48 «DIFERIT MANI LLEIDA» · 12Chy@93.33 · 13@95.76 «+++IPD LLEIDA»
        // Abans: «Enviat_No_Víctor Sorribes» es quedava a 10Chy (59.64) en lloc del DIFERIT (49.64),
        // «Enviat_No_Míriam Gavaldà» es desplaçava dins del 08dp (damunt del Tema-Títol) i
        // «Directe_PRESENCIAL_Tortosa» saltava a 13 («+++IPD LLEIDA», un ALTRE bloc).
        window.__PHASE = '17-seccio-bloc';

        var N_ENV10 = 'Wott_TNV_v2_10Chy_00.01_chyrons tortosa_690422_Enviat_No_V\u00edctor Sorribes_Mart\u00ed Mestres.00690866.mov';
        var N_PRE10 = 'Wott_TNV_v2_10Chy_00.00_chyrons tortosa_690370_Directe_PRESENCIAL_Tortosa.00690863.mov';
        var N_ENV08 = 'Wott_TNV_v2_08dp_00.01_Donapas diferits_690443_Enviat_No_M\u00edriam Gavald\u00e0_Anna Rius Sagrera.00690859.mov';
        var N_PRE12 = 'Wott_TNV_v2_12Chy_00.00_chyrons lleida_690371_Directe_PRESENCIAL_Lleida.00690869.mov';
        var cEnv10 = chy(N_ENV10, 'Enviat', '00.01');
        var cPre10 = chy(N_PRE10, 'Directe_PRESENCIAL', '00.00');
        var cEnv08 = chy(N_ENV08, 'Enviat', '00.01');
        var cPre12 = chy(N_PRE12, 'Directe_PRESENCIAL', '00.00');

        var M264 = [
            { fullId: '08dp', blockNum: '08', time: 0, label: '08dp - Donapas diferits' },
            { fullId: '08', blockNum: '08', time: 7.88, label: '08 - DIFERIT MANI TARRAGONA' },
            { fullId: '09', blockNum: '09', time: 18.12, label: '09 - +++IPD MANI TARRAGONA' },
            { fullId: '10', blockNum: '10', time: 49.64, label: '10 - DIFERIT MANI TORTOSA' },
            { fullId: '10Chy', blockNum: '10', time: 59.64, label: '10Chy - chyrons tortosa' },
            { fullId: '12', blockNum: '12', time: 88.48, label: '12 - DIFERIT MANI LLEIDA' },
            { fullId: '12Chy', blockNum: '12', time: 93.33, label: '12Chy - chyrons lleida' },
            { fullId: '13', blockNum: '13', time: 95.76, label: '13 - +++IPD LLEIDA' }
        ];
        var S264 = structOf([
            ['08dp', '', [cEnv08]],
            ['08', '', []],
            ['09', '', []],
            ['10', '', []],
            ['10Chy', 'chy', [cEnv10, cPre10]],
            ['12', '', []],
            ['12Chy', 'chy', [cPre12]],
            ['13', '', []]
        ]);

        ok('#264 helpers de SECCIO de bloc al flow_chyrons',
            typeof CHY._blockBase === 'function' && typeof CHY._sectionDest === 'function' &&
            typeof CHY._evitaTemaTitol === 'function' && typeof CHY._temaTitolLiveRanges === 'function');
        ok('#264 _blockBase: el numero del lineID («10Chy»->10 · «08dp»->8 · «04i»->4 · sense digit->null)',
            CHY._blockBase({ fullId: '10Chy' }) === 10 && CHY._blockBase({ fullId: '08dp' }) === 8 &&
            CHY._blockBase({ fullId: '04i' }) === 4 && CHY._blockBase({ fullId: 'lead' }) === null);
        ok('#264 _sectionDest ENVIAT: el DIFERIT del MATEIX numero (10Chy->10 · 08dp->08)',
            (CHY._sectionDest(M264, S264, M264[4], 'DIFERIT') || {}).time === 49.64 &&
            (CHY._sectionDest(M264, S264, M264[0], 'DIFERIT') || {}).time === 7.88);
        ok('#264 _sectionDest PRESENCIAL: l\'IPD del numero SEGUENT (12Chy->13) i null si el bloc no en te (10Chy->11 no existeix)',
            (CHY._sectionDest(M264, S264, M264[6], 'IPD') || {}).time === 95.76 &&
            CHY._sectionDest(M264, S264, M264[4], 'IPD') === null);

        var plan264 = CHY._ipdAnchorPlan(M264, S264, filterResto, 'Resto');
        ok('#264 PLA: l\'ENVIAT de 10Chy va al DIFERIT del bloc (49.64), no es queda al Chy (59.64)',
            plan264.de[cEnv10.name] === 49.64 && plan264.per['49.64'] && plan264.per['49.64'][0] === cEnv10,
            'de=' + JSON.stringify(Object.keys(plan264.de)));
        ok('#264 PLA: l\'ENVIAT del donapas 08dp va al DIFERIT 08 (7.88)',
            plan264.de[cEnv08.name] === 7.88, 'de=' + JSON.stringify(Object.keys(plan264.de)));
        ok('#264 PLA: el PRESENCIAL de 12Chy va al +++IPD del seu bloc (95.76)',
            plan264.de[cPre12.name] === 95.76);
        ok('#264 PLA: el PRESENCIAL de 10Chy NO salta a l\'IPD d\'un altre bloc (es queda al seu item)',
            plan264.de[cPre10.name] === undefined && plan264.moved === 3, 'moved=' + plan264.moved);
        ok('#264 LOG: diu ENVIAT i el marcador de desti',
            window.__LOG.some(function (l) {
                return l.indexOf('ENVIAT') !== -1 && l.indexOf('10Chy') !== -1 &&
                    l.indexOf('49.64') !== -1 && l.indexOf('DIFERIT 10') !== -1;
            }));


        // ── 8. BUG #264: el Tema-Títol no pot pisar un Enviat_No_ (part viva = 6,24 s) ──
        // El 1r Tema-Títol del TNV V2 arrenca a 4,80 s (CasB: conductor a 0,40 + 4,40) i la
        // seua part viva acaba a 11,04 s; l'ENVIAT de Míriam hi cau damunt -> ha d'esperar.
        var TT_LIVE = [{ start: 4.80, end: 11.04 }];
        ok('#264 _evitaTemaTitol: un enviar que cau damunt del Tema-Títol espera que acabe',
            CHY._evitaTemaTitol(1.00, 4.70, TT_LIVE, 18.12) === 11.04,
            String(CHY._evitaTemaTitol(1.00, 4.70, TT_LIVE, 18.12)));
        ok('#264 _evitaTemaTitol: si hi cap ABANS del Tema-Títol, no es mou',
            CHY._evitaTemaTitol(0.40, 3.00, TT_LIVE, 18.12) === 0.40);
        ok('#264 _evitaTemaTitol: si ja entra DESPRES de la part viva, no es mou',
            CHY._evitaTemaTitol(11.50, 4.70, TT_LIVE, 18.12) === 11.50);
        ok('#264 _evitaTemaTitol: si no hi cap dins de l\'ITEM, no s\'ix de l\'item (ho decidix _chooseSlot)',
            CHY._evitaTemaTitol(8.00, 4.70, TT_LIVE, 14.00) === 8.00);
        ok('#264 _evitaTemaTitol: dos Tema-Títol encadenats -> espera el segon',
            CHY._evitaTemaTitol(12.00, 4.00, [{ start: 4.80, end: 11.04 }, { start: 13.00, end: 19.24 }], 30) === 19.24);
    };
})();
