/* ============================================================================
 * PROVA RUTES (2026-10-21) - F2: rutes i variables d'usuari
 * ----------------------------------------------------------------------------
 * SIMPTOMA (report d'usuari): la finestra de configuracio deixava canviar les
 * rutes, pero allo no servia de res.
 *
 * CAUSA ARREL: `Profile.json` NOMES s'escrivia. `11_Configuracio.js` tornava
 * sempre un objecte FIX (`_activeConfig`), aixi que canviar una ruta a setup.html
 * no tenia cap efecte (calia editar el .js). A mes, tres rutes de treball vivien
 * al codi: `ESCALETES_PATH` (escaleta_config.js), `GRAF_ROOT` (flow_mapa.js) i
 * `SRT_MP4_PER_TEMPS_15MINUTS` (srt_editor.js).
 *
 * Aquesta prova fa tres treballs:
 *  A) RESOLUTOR PUR (`FASTPASS_UI.Logic.Rutas`): tokens, {fecha}, normalize,
 *     join, missing/unknown, tokensIn.
 *  B) FUSIO DEL PERFIL: merge dels defaults amb el perfil (arrays reemplacats,
 *     defaults intactes) i rutes DERIVADES per a perfils vells.
 *  C) GUARDES sobre els fitxers REALS: la config llig Profile.json i recarrega
 *     en desar; els tres consumidors ja no tenen la ruta dins; Profile.json i
 *     setup.html porten les claus/camps nous; i CAP literal UNC a js/ ni jsx/
 *     (fora dels defaults de 11_Configuracio.js).
 * ==========================================================================*/
(function () {
    var orig = window.__runTests;
    window.__runTests = async function () {
        await orig();

        var ok = window.__ok;
        var UI = window.FASTPASS_UI;
        window.__PHASE = '21-rutas';

        var REPO = window.__REPO || '';
        var FILES = window.__TEXT_FILES || [];
        var BS = String.fromCharCode(92);

        function noComments(src) {
            return String(src).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
        }
        async function readRepo(rel) {
            var r = await fetch('file:///' + REPO + '/' + rel);
            return await r.text();
        }
        function eq(a, b) { return String(a) === String(b); }

        var R = UI.Logic && UI.Logic.Rutas;
        ok('#F2/1 `Logic.Rutas` carregat (js/logic/20_Rutas_Logic.js al bundle)', !!R, 'R=' + !!R);
        if (!R) return;

        // ctx d'exemple (el mateix que fa servir el boto PROVA de setup.html)
        var ctx = {
            autor: 'AGUS',
            progData: { id: 'TNV', archivo: 'TN_VESPRE', wott: 'TNV' },
            bloque: 'V3',
            dateDir: '2026-10-21',
            tema: 'BALENA'
        };

        // ── A. RESOLUTOR ────────────────────────────────────────────────────
        var c1 = { autor: 'AGUS', progData: ctx.progData, bloque: 'V3', dateDir: '2026-10-21', tema: 'BALENA', base: 'C:' + BS + 'P' };
        var out1 = R.resolve('{base}' + BS + '{archivo}_{bloque}_{fecha}_{tema}', c1);
        ok('#F2/2 plantilla amb tots els tokens', eq(out1, 'C:' + BS + 'P' + BS + 'TN_VESPRE_V3_2026_10_21_BALENA'), 'out=' + out1);

        ok('#F2/3 {fecha}: YYYY-MM-DD / DD_MM_YYYY -> YYYY_MM_DD, i res si no es data',
            R.fechaOf('2026-10-21') === '2026_10_21' &&
            R.fechaOf('21_10_2026') === '2026_10_21' &&
            R.fechaOf('2026_10_21') === '2026_10_21' &&
            R.fechaOf('dema') === '',
            R.fechaOf('2026-10-21') + ' | ' + R.fechaOf('21_10_2026') + ' | [' + R.fechaOf('dema') + ']');

        var out4 = R.resolve('{wott}_{archivo}_{prog}_{bloque}', ctx);
        ok('#F2/4 `progData` + `bloque` (`bloc` tambe val)', eq(out4, 'TNV_TN_VESPRE_TNV_V3'), 'out=' + out4);
        ok('#F2/4b `bloc` es el nom alternatiu de `bloque`',
            R.resolve('{bloque}', { bloc: 'V5' }) === 'V5', 'out=' + R.resolve('{bloque}', { bloc: 'V5' }));

        var d1 = R.resolveDetailed('{base}' + BS + '{tema}', {});
        ok('#F2/5 `resolveDetailed`: diu que falta i conserva el {token}',
            d1.missing.indexOf('base') >= 0 && d1.missing.indexOf('tema') >= 0 &&
            d1.out.indexOf('{tema}') >= 0 && d1.out.indexOf('{base}') >= 0,
            'missing=' + d1.missing.join(',') + ' out=' + d1.out);

        var out6 = R.resolve('{base}' + BS + '{tema}', {});
        ok('#F2/6 `resolve` (produccio): cap {token} dins de la ruta', out6.indexOf('{') < 0, 'out=' + out6);

        var d2 = R.resolveDetailed('{foo}' + BS + '{autor}', { autor: 'AGUS' });
        ok('#F2/7 token DESCONEGUT = literal + reportat a `unknown`',
            d2.unknown.length === 1 && d2.unknown[0] === 'foo' && d2.out.indexOf('{foo}') === 0,
            'unknown=' + d2.unknown.join(',') + ' out=' + d2.out);

        var unc = BS + BS + 'srv' + BS + 'share' + BS + 'dia';
        ok('#F2/8 normalize: UNC intacta, barres repetides i barra final fora',
            R.normalize('//srv/share//dia/') === unc &&
            R.normalize('C:/temp/') === 'C:' + BS + 'temp' &&
            R.normalize('') === '',
            'unc=' + R.normalize('//srv/share//dia/') + ' | drive=' + R.normalize('C:/temp/'));

        ok('#F2/9 join: lo relatiu s\'afig, lo absolut guanya',
            R.join('C:' + BS + 'P', 'DIA') === 'C:' + BS + 'P' + BS + 'DIA' &&
            R.join('C:' + BS + 'P', unc) === unc,
            'rel=' + R.join('C:' + BS + 'P', 'DIA') + ' | abs=' + R.join('C:' + BS + 'P', unc));

        ok('#F2/10 tokensIn: sense repetir i en ordre',
            R.tokensIn('{base}{autor}{base}{tema}').join(',') === 'base,autor,tema',
            R.tokensIn('{base}{autor}{base}{tema}').join(','));

        // ── B. FUSIO DEL PERFIL ─────────────────────────────────────────────
        var DEF = {
            general: { autor: 'DEF', debug: false },
            rutas: { vertical: 'C:' + BS + 'V', destino_base: 'C:' + BS + 'P' },
            estructuras: { TNs: { tracks: { v_mp4: 1, v_tema: 6 }, programas: [{ id: 'AAA' }] } }
        };
        var prof = { general: { autor: 'USU' }, estructuras: { TNs: { programas: [{ id: 'BBB' }] } } };
        var m = R.mergeProfile(DEF, prof);
        ok('#F2/11 merge: el perfil guanya i lo absent es conserva',
            m.general.autor === 'USU' && m.general.debug === false && m.estructuras.TNs.tracks.v_tema === 6,
            'autor=' + m.general.autor + ' debug=' + m.general.debug + ' v_tema=' + m.estructuras.TNs.tracks.v_tema);
        ok('#F2/12 merge: els ARRAYS es reemplacen sencers',
            m.estructuras.TNs.programas.length === 1 && m.estructuras.TNs.programas[0].id === 'BBB',
            JSON.stringify(m.estructuras.TNs.programas));
        ok('#F2/13 merge: els DEFAULTS no es muten (recarregar N voltes es net)',
            DEF.general.autor === 'DEF' && DEF.estructuras.TNs.programas[0].id === 'AAA',
            'DEF.autor=' + DEF.general.autor);

        var nr = R.normalizeRutas({ vertical: 'C:' + BS + 'V', destino_base: 'C:' + BS + 'P' });
        ok('#F2/14 normalizeRutas: escaletes/grafismes/subtitols DERIVATS de `vertical`',
            eq(nr.escaletes, 'C:' + BS + 'V' + BS + 'ESCALETES') &&
            eq(nr.grafismos, 'C:' + BS + 'V' + BS + 'ZZZ_GRAFISME') &&
            eq(nr.subtitulos, 'C:' + BS + 'V' + BS + 'SRT_MP4_PER_TEMPS_15MINUTS'),
            'escaletes=' + nr.escaletes + ' | grafismes=' + nr.grafismos);
        ok('#F2/15 normalizeRutas: `projectes` <-> `destino_base` i sintetics derivats',
            eq(nr.projectes, 'C:' + BS + 'P') && eq(nr.destino_base, 'C:' + BS + 'P') &&
            eq(nr.subtitulosSinteticos, nr.subtitulos + BS + 'SINTETICS'),
            'projectes=' + nr.projectes + ' | sintetics=' + nr.subtitulosSinteticos);
        ok('#F2/16 normalizeRutas: una ruta QUE JA VE al perfil no es toca',
            R.normalizeRutas({ vertical: 'C:' + BS + 'V', grafismos: 'C:' + BS + 'MEU' }).grafismos === 'C:' + BS + 'MEU');

        // `14_Assembly_Logic` fa `${rutas.conductors}${fitxer}` i `utils.workFolder`
        // fa `rutas.destinoBase + progDir`: el separador final s'ha de RESPECTAR.
        var nrt = R.normalizeRutas({ vertical: 'C:' + BS + 'V' + BS, destino_base: 'C:' + BS + 'P' + BS, grafismos: 'C:' + BS + 'G' });
        ok('#F2/16b normalizeRutas RESPECTA el separador final de les rutes existents',
            nrt.projectes === 'C:' + BS + 'P' + BS && nrt.destino_base === 'C:' + BS + 'P' + BS &&
            nrt.grafismos === 'C:' + BS + 'G' &&
            nrt.subtitulos === 'C:' + BS + 'V' + BS + 'SRT_MP4_PER_TEMPS_15MINUTS' &&
            nrt.escaletes === 'C:' + BS + 'V' + BS + 'ESCALETES',
            'projectes=[' + nrt.projectes + '] grafismes=[' + nrt.grafismos + '] subtitols=[' + nrt.subtitulos + ']');

        // ── C. GUARDES SOBRE ELS FITXERS REALS ──────────────────────────────
        try {
            var cfg = noComments(await readRepo('js/core/11_Configuracio.js'));
            ok('#F2/17 Config: llig Profile.json (`cep.fs.readFile`) i RECARREGA en desar',
                /function _loadProfile/.test(cfg) &&
                /cep\.fs\.readFile/.test(cfg) &&
                /FASTPASS_CONFIG_UPDATED/.test(cfg) &&
                /mergeProfile/.test(cfg),
                'load=' + /function _loadProfile/.test(cfg) + ' fs=' + /cep\.fs\.readFile/.test(cfg) +
                ' event=' + /FASTPASS_CONFIG_UPDATED/.test(cfg));
            ok('#F2/18 Config: `resolvePath`/`applyProfile` exposats i les rutes noves a `get().rutas`',
                /resolvePath: function/.test(cfg) && /applyProfile: function/.test(cfg) &&
                /escaletesDomini:/.test(cfg) && /grafismos:/.test(cfg) &&
                /subtitulos:/.test(cfg) && /subtitulosSinteticos:/.test(cfg),
                'resolvePath=' + /resolvePath: function/.test(cfg) + ' apply=' + /applyProfile: function/.test(cfg));

            var ed = noComments(await readRepo('js/editor/srt_editor.js'));
            ok('#F2/19 srt_editor: la carpeta dels SRT de 15 min ve de la CONFIGURACIO',
                !/SRT_MP4_PER_TEMPS_15MINUTS/.test(ed) && /_srt15MinDir/.test(ed) &&
                /rutas\.subtitulos/.test(ed),
                'literal=' + /SRT_MP4_PER_TEMPS_15MINUTS/.test(ed) + ' helper=' + /_srt15MinDir/.test(ed));

            var mp = noComments(await readRepo('js/workflows/flow_mapa.js'));
            ok('#F2/20 flow_mapa: la carpeta de grafismes ve de la CONFIGURACIO',
                !/ZZZ_GRAFISME/.test(mp) && /_grafRoot/.test(mp) && /rutas\.grafismos/.test(mp),
                'literal=' + /ZZZ_GRAFISME/.test(mp) + ' helper=' + /_grafRoot/.test(mp));

            var ec = noComments(await readRepo('js/core/escaleta_config.js'));
            ok('#F2/21 escaleta_config: ESCALETES_PATH/DOMAIN son GETTERS de la config',
                !/192\.168\.147\.199/.test(ec) &&
                /defineProperty\(ER, 'ESCALETES_PATH'/.test(ec) &&
                /defineProperty\(ER, 'ESCALETES_PATH_DOMAIN'/.test(ec) &&
                /_rutaConfig\('escaletes'\)/.test(ec),
                'ip=' + /192\.168\.147\.199/.test(ec) + ' getter=' + /defineProperty\(ER, 'ESCALETES_PATH'/.test(ec));

            var pj = null;
            try { pj = JSON.parse(await readRepo('Profile.json')); } catch (ePj) { pj = null; }
            ok('#F2/22 Profile.json: rutes noves (projectes/escaletes/grafismes/subtitols/sintetics)',
                !!pj && !!pj.rutas && !!pj.rutas.projectes && !!pj.rutas.escaletes &&
                !!pj.rutas.escaletes_domini && !!pj.rutas.grafismos && !!pj.rutas.subtitulos &&
                !!pj.rutas.subtitulosSinteticos,
                pj && pj.rutas ? Object.keys(pj.rutas).join(',') : 'JSON invalid');

            var st = await readRepo('setup.html');
            ok('#F2/23 setup.html: camps nous + ajuda de variables + boto PROVA',
                /id="path-grafismos"/.test(st) && /id="path-subtitulos"/.test(st) &&
                /id="path-subtitulosSinteticos"/.test(st) && /id="path-escaletes"/.test(st) &&
                /\{autor\}/.test(st) && /resolvePathDetailed/.test(st) && /provaRuta/.test(st));

            var idx = await readRepo('index.html');
            // (2026-10-21) Sense versio fixa: qualsevol cache-bust (`?v=NN`) val;
            // el que importa es que el modul PUR es carregui ABANS de la config.
            var _iRutas = idx.indexOf('20_Rutas_Logic.js');
            var _iCfg = idx.indexOf('11_Configuracio.js');
            ok('#F2/24 index.html carrega `20_Rutas_Logic.js` ABANS de la config',
                _iRutas >= 0 && _iCfg >= 0 && _iRutas < _iCfg,
                'rutas@' + _iRutas + ' cfg@' + _iCfg);

            // GUARDA: cap literal UNC dins de cadenes a js/ ni jsx/ (excepte els
            // defaults de 11_Configuracio.js). Mateix criteri que bin/check_rutas.ps1:
            // cometes + 4 barres + NOM DE SERVIDOR + 2 barres.
            var UNC_RE = /['"]\\{4,}[A-Za-z0-9_.-]+\\{2}/;
            var offenders = [];
            for (var i = 0; i < FILES.length; i++) {
                var rel = FILES[i];
                if (rel === 'js/core/11_Configuracio.js') continue;
                if (!/\.(js|jsx)$/i.test(rel)) continue;
                var src = '';
                try { src = noComments(await readRepo(rel)); } catch (eF) { continue; }
                if (UNC_RE.test(src)) offenders.push(rel);
            }
            ok('#F2/25 cap ruta UNC hardcoded a js/ ni jsx/ (' + FILES.length + ' fitxers)',
                offenders.length === 0, offenders.join(', '));
        } catch (e) {
            ok('#F2 la prova no ha llancat cap excepcio', false, e && (e.message + ' | ' + e.stack));
        }
    };
})();
