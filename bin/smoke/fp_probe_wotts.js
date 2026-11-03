/* ============================================================================
 * PROVA WOTTS DEL DIA (2026-10-21) · DESBLOQUEIG FÍSIC DEL BOTÓ
 * ----------------------------------------------------------------------------
 * El botó deixa d'esperar l'escaleta del repositori central (getStatus, 5,2 s
 * d'arrencada) i es desbloqueja amb un fet FÍSIC: hi ha wotts del bloc i del
 * dia de treball? Els wotts es generen just en acabar l'emissió del bloc.
 *
 * TRAMPA QUE FIXA AQUESTA PROVA: els noms dels wotts NO porten data i el mtime
 * està contaminat pel procés nocturn (creat 16/10 19:17 UTC, modificat 17/10
 * 00:32 UTC) → l'única data fiable és `birthtime`, que només dóna Node
 * (cep.fs.stat no l'exposa en UNC; IO.scanDirectory triga ~4 s amb 963 fitxers).
 *
 * A) `Scan.wottsToday` data els wotts per birthtime, amb CACHÉ per nom (cada
 *    fitxer es data una sola vegada) i MEMÒRIA CURTA del veredicte.
 * B) Filtra per programa+bloc i pel dia de treball.
 * C) Si no es pot llistar → `ok:false` i NO es canvia d'estat (mai CREAR per error).
 * D) Guardes a la resta del codi: cap `getStatus` a l'arrencada, poll de 15 s i
 *    `_runNew` amb còpia NOMÉS local (la FOTO crea l'escaleta).
 * ==========================================================================*/
(function () {
    var orig = window.__runTests;
    window.__runTests = async function () {
        await orig();

        var ok = window.__ok;
        var UI = window.FASTPASS_UI;
        window.__PHASE = '23-wotts';

        var Scan = UI && UI.Logic && UI.Logic.Scan;
        ok('#WOTT/1 Scanner carregat amb wottsToday (js/logic/Scanner.js al bundle)',
            !!(Scan && typeof Scan.wottsToday === 'function'), 'Scan=' + !!Scan);

        // ── STUBS DE PLATAFORMA ──────────────────────────────────────────────
        var BS = String.fromCharCode(92);
        var FOLDER = 'Z:' + BS + 'CHYRONS' + BS;
        var files = {};            // nom → ms de birthtime
        var readdirCalls = 0;
        var statCalls = 0;
        var failMode = false;

        UI.Utils = UI.Utils || {};
        var realReadFolder = UI.Utils.readFolder;
        var realCep = window.cep;

        // (2026-10-29) El motor real és `cep.fs`: el manifest no declara
        // `--enable-nodejs`, així que el que cal simular és el CEP natiu
        // (`readdir` de noms + `stat` de creationTime/mtime), no `cep_node`.
        function installCepFs() {
            window.cep = {
                fs: {
                    readdir: function () {
                        readdirCalls++;
                        if (failMode) return { err: 9, data: null };
                        return { err: 0, data: Object.keys(files) };
                    },
                    stat: function (p) {
                        statCalls++;
                        var name = String(p).split(BS).pop();
                        if (!(name in files)) return { err: 2, data: null };
                        return { err: 0, data: { creationTime: files[name], mtime: files[name], size: 1 } };
                    }
                }
            };
        }
        installCepFs();
        UI.Utils.readFolder = function () { return Promise.resolve(null); };

        function localMs(y, m, d, h) { return new Date(y, m - 1, d, h || 12, 0, 0).getTime(); }
        function reset(dates) {
            Scan._wottDateCache = dates ? {} : null;
            Scan._wottProbeCache = null;
            readdirCalls = 0;
            statCalls = 0;
            failMode = false;
        }
        var ctxBase = {
            config: { rutas: { chyrons: FOLDER } },
            progData: { archivo: 'TN_VESPRE', wott: 'TNV' },
            bloque: 'V1',
            dateDir: '2026_10_21'
        };
        var F_TODAY1 = 'Wott_TNV_v1_10_00.01_TEMA A_111_Tema-Titol_a.00000001.mov';
        var F_TODAY2 = 'Wott_TNV_v1_10_05.00_TEMA B_222_Tema-Titol_b.00000002.mov';
        var F_AHIR   = 'Wott_TNV_v1_09_00.00_TEMA AHIR_333_Tema-Titol_c.00000003.mov';
        var F_V2     = 'Wott_TNV_v2_10_00.00_ALTRE BLOC_444_Tema-Titol_d.00000004.mov';
        var F_TNC    = 'Wott_TNC_v1_10_00.00_ALTRE PROG_555_Tema-Titol_e.00000005.mov';

        try {
            if (Scan && typeof Scan.wottsToday === 'function') {
                // ── A. DETECCIÓ I FILTRES ────────────────────────────────────
                files = {};
                files[F_TODAY1] = localMs(2026, 10, 21, 12);
                files[F_TODAY2] = localMs(2026, 10, 21, 13);
                files[F_AHIR]   = localMs(2026, 10, 20, 12);
                files[F_V2]     = localMs(2026, 10, 21, 12);
                files[F_TNC]    = localMs(2026, 10, 21, 12);
                reset(true);
                var r1 = await Scan.wottsToday(ctxBase);
                ok('#WOTT/2 2 wotts del bloc+día (descarta altre día, altre bloc i altre programa)',
                    r1.ok && r1.found && r1.count === 2 && r1.via === 'cep',
                    'ok=' + r1.ok + ' found=' + r1.found + ' count=' + r1.count + ' via=' + r1.via);
                ok('#WOTT/3 només data els candidats del bloc (3 TNV_V1, no els 5)',
                    statCalls === 3 && readdirCalls === 1, 'stats=' + statCalls + ' readdir=' + readdirCalls);

                // ── B. MEMÒRIA CURTA (poll de 15 s) ─────────────────────────
                var r2 = await Scan.wottsToday(ctxBase);
                ok('#WOTT/4 segona crida surt de memòria (0 readdir, 0 stats)',
                    r2.count === 2 && readdirCalls === 1 && statCalls === 3,
                    'readdir=' + readdirCalls + ' stats=' + statCalls);

                // ── C. CACHÉ PER NOM (només els nous) ───────────────────────
                Scan._wottProbeCache = null;    // força llistat nou, no pas redatació
                var F_TODAY3 = 'Wott_TNV_v1_10_09.00_TEMA C_333_Tema-Titol_f.00000006.mov';
                files[F_TODAY3] = localMs(2026, 10, 21, 13);
                var r3 = await Scan.wottsToday(ctxBase);
                ok('#WOTT/5 un wott nou = 1 stat (la resta ja estaven datats) i compta',
                    r3.count === 3 && statCalls === 4,
                    'count=' + r3.count + ' stats=' + statCalls);

                // ── D. SENSE WOTTS DEL DIA ──────────────────────────────────
                files = {};
                files[F_AHIR] = localMs(2026, 10, 20, 12);
                files[F_V2]   = localMs(2026, 10, 21, 12);
                reset(true);
                var r4 = await Scan.wottsToday(ctxBase);
                ok('#WOTT/6 wotts d ahir o d un altre bloc NO desbloquegen (ok però found=false)',
                    r4.ok === true && r4.found === false && r4.count === 0,
                    'ok=' + r4.ok + ' found=' + r4.found);

                // ── E. BIRTHTIME NO DATABLE (mai un fals positiu) ───────────
                files = {};
                files[F_TODAY1] = 0;    // epoch 1970 (SMB sense birthtime)
                reset(true);
                var r5 = await Scan.wottsToday(ctxBase);
                ok('#WOTT/7 birthtime 0/1970 no compta com a avui',
                    r5.ok === true && r5.found === false && Scan._localDate(0) === null,
                    'found=' + r5.found + ' localDate(0)=' + String(Scan._localDate(0)));

                // ── F. LLISTAT IMPOSSIBLE → ok:false (no es canvia d estat) ──
                files = {};
                files[F_TODAY1] = localMs(2026, 10, 21, 12);
                reset(true);
                failMode = true;
                var r6 = await Scan.wottsToday(ctxBase);
                ok('#WOTT/8 si no es pot llistar → ok=false (es conserva l estat anterior)',
                    r6.ok === false && r6.found === false,
                    'ok=' + r6.ok + ' via=' + (r6.via || '-'));
            }

            // ── G. GUARDES A LA RESTA DEL CODI ──────────────────────────────
            var REPO = window.__REPO || '';
            async function readRepo(rel) {
                var r = await fetch('file:///' + REPO + '/' + rel);
                return await r.text();
            }
            var ctxSrc = await readRepo('js/core/4_Context.js');
            var mainSrc = await readRepo('js/main.js');
            var fmSrc = await readRepo('js/workflows/flow_mainButton.js');
            ok('#WOTT/9 arrencada sense getStatus (i sense la sonda vella media+wotts)',
                ctxSrc.indexOf('getStatus(') === -1 && ctxSrc.indexOf('_quickProbeNoEscaleta') === -1 &&
                ctxSrc.indexOf('lookupLocalStatus') > 0 && ctxSrc.indexOf('_wottsToday') > 0,
                'getStatus=' + (ctxSrc.indexOf('getStatus(') !== -1) +
                ' sonda=' + (ctxSrc.indexOf('_quickProbeNoEscaleta') !== -1));
            ok('#WOTT/10 poll de 15 s + CREAR amb còpia NOMÉS local (sense blocs posteriors)',
                mainSrc.indexOf('_ctxRefreshPollMs = 15000') > 0 &&
                (fmSrc.match(/localOnly: true/g) || []).length === 2 &&
                fmSrc.indexOf('_escaletaFromLaterBlock') === -1,
                'poll=' + (mainSrc.indexOf('_ctxRefreshPollMs = 15000') > 0) +
                ' localOnly=' + ((fmSrc.match(/localOnly: true/g) || []).length) +
                ' later=' + (fmSrc.indexOf('_escaletaFromLaterBlock') !== -1));
            // ── H. AHIR (Ctrl+clic): MATEIX mecanisme, data canviada ─────────
            // `ctx.dateDir` mana a tot el flux (gate de wotts, escaleta local, FOTO,
            // `_runNew`). El que no pot passar és quedar-se ancorat en 'yesterday'.
            var iYest = ctxSrc.indexOf("St.workTarget = 'yesterday'");
            var iToday = ctxSrc.indexOf("St.workTarget = 'today'");
            var iFin = ctxSrc.indexOf('} finally {', iYest);
            ok('#WOTT/11 Ctrl+clic (AHIR): mateix camí amb dateDir i retorn a HOY dins de finally',
                iYest > 0 && iToday > iYest && iFin > iYest && iFin < iToday &&
                ctxSrc.indexOf('runMainAction(plan.action, dataA)') > iYest,
                'yest=' + iYest + ' finally=' + iFin + ' today=' + iToday);
            // ── I. DURADES DE WOTT ALINEADES A FRAMES (2026-10-21) ───────────
            // Les durades que no cauen a la graella (les estimades per mida) feien
            // que Premiere arrodonira el final cap AMUNT → clip 1 FRAME més llarg
            // que el mèdia. `_resolveWottDur` les alinea amb `_frameSnapDur`.
            var PL = UI.Logic && UI.Logic.Project;
            var idxDom = { byName: { 'W_A.mov': 1.02 }, byNorm: {}, byId: {}, items: [], bytesPerSec: 0 };
            var idxEst = {
                byName: {}, byNorm: {}, byId: {},
                items: [{ name: 'W_B.mov', dur: 0, size: 43500000 * 6.1873, id: '' }],
                bytesPerSec: 43500000
            };
            var rDom = PL ? PL._resolveWottDur(idxDom, { name: 'W_A.mov' }) : null;
            var rEst = PL ? PL._resolveWottDur(idxEst, { name: 'W_B.mov' }) : null;
            var enGraella = function (d) {
                var n = Number(d) * 25;
                return isFinite(n) && Math.abs(n - Math.round(n)) < 1e-6;
            };
            ok('#WOTT/12 _frameSnapDur alinea a la graella (1,02→1,00 · 6,1873→6,20 · 0→0)',
                !!PL && typeof PL._frameSnapDur === 'function' &&
                Math.abs(PL._frameSnapDur(1.02) - 1.00) < 1e-6 &&
                Math.abs(PL._frameSnapDur(6.1873) - 6.20) < 1e-6 &&
                PL._frameSnapDur(0) === 0,
                'snap1.02=' + (PL && PL._frameSnapDur ? PL._frameSnapDur(1.02) : '-') +
                ' snap6.1873=' + (PL && PL._frameSnapDur ? PL._frameSnapDur(6.1873) : '-'));
            ok('#WOTT/13 _resolveWottDur (DOM i estimació per mida) ja retorna durades a la graella',
                !!PL && !!rDom && !!rEst && enGraella(rDom.dur) && enGraella(rEst.dur) &&
                Math.abs(rDom.dur - 1.00) < 1e-6 && Math.abs(rEst.dur - 6.20) < 1e-6,
                'dom=' + (rDom && rDom.dur) + ' est=' + (rEst && rEst.dur));

            // ── J. SONDES DEL NAS RETIRADES (2026-10-23) ──────────────────────
            // El vídeo del projecte ix NOMÉS de la captura del cleanFeed i els
            // subtítols, del .srt que viu al costat del .prproj. Han desaparegut
            // de Scanner: `mediaAssets` (MP4/SRT del bloc), `srtFallback` (SRT de
            // recanvi) i `mp4Today` (estat del MP4 origen del bloc).
            ok('#WOTT/14 Scanner: fora les sondes del NAS (mediaAssets/srtFallback/mp4Today)',
                Scan && Scan.mediaAssets === undefined && Scan.srtFallback === undefined &&
                Scan.mp4Today === undefined && Scan._filterMediaByDate === undefined,
                'mediaAssets=' + !!(Scan && Scan.mediaAssets) +
                ' srtFallback=' + !!(Scan && Scan.srtFallback) +
                ' mp4Today=' + !!(Scan && Scan.mp4Today));

            // ── K. ARRENCADA SENSE Ctrl = AVUI + 3 ESTATS (2026-10-21 · #177) ──
            // Sense Ctrl NO es pot carregar el projecte d'AHIR ni que el panell haja
            // quedat obert de la nit abans amb eixe projecte: `projectDateDir` només
            // mana en el mode correcció (després del retorn de la data d'avui).
            var iStrict = ctxSrc.indexOf('if (!useYesterday) return todayYmd;');
            var iProj = ctxSrc.indexOf('St.projectDateDir && St.projectDateDir !== todayYmd');
            ok('#WOTT/19 _targetDateDir: sense Ctrl la data és AVUI (projectDateDir només amb Ctrl)',
                iStrict > 0 && iProj > iStrict, 'strict=' + iStrict + ' projectDate=' + iProj);
            ok('#WOTT/20 checkContext: la sonda de wotts és l ÚNICA (s ha retirat _mediaToday)',
                ctxSrc.indexOf('_mediaToday') === -1 &&
                ctxSrc.indexOf('const wots = await this._wottsToday(ctx)') > 0,
                'media=' + (ctxSrc.indexOf('_mediaToday') > 0) +
                ' wots=' + (ctxSrc.indexOf('this._wottsToday(ctx)') > 0));
            ok('#WOTT/21 checkContext: MASSA D\'HORA només si la sonda diu que NO hi ha wotts',
                ctxSrc.indexOf("earlyState = 'MASSA'") > 0 && ctxSrc.indexOf('else if (!wots.ok)') > 0 &&
                ctxSrc.indexOf('mp4.found') === -1 && ctxSrc.indexOf('mp4.ok') === -1,
                'massa=' + (ctxSrc.indexOf("earlyState = 'MASSA'") > 0) +
                ' ko=' + (ctxSrc.indexOf('else if (!wots.ok)') > 0));
            ok('#WOTT/22 botó MAIN: etiquetes CREA / ESPERA (i cap rastre del vell "CREAR permès")',
                ctxSrc.indexOf('btn.innerText = "CREA"') > 0 &&
                ctxSrc.indexOf('btn.innerText = "ESPERA"') > 0 &&
                ctxSrc.indexOf('CREAR permès') === -1);
            var chySrc = await readRepo('js/workflows/flow_chyrons.js');
            ok('#WOTT/23 flow_chyrons: la DURADA del wott descompta 1 frame abans d\'inserir-lo',
                /if \(placeEnd !== null && \(placeEnd - slot\.start\) > REV_FRAME \+ 0\.001\) \{/.test(chySrc) &&
                /placeEnd = gridDown\(placeEnd - REV_FRAME\);/.test(chySrc));
            var idxW = await readRepo('index.html');
            ok('#WOTT/24 cache-bust al dia (4_Context, flow_chyrons, Scanner)',
                /4_Context\.js\?v=33/.test(idxW) && /flow_chyrons\.js\?v=95/.test(idxW) &&
                /Scanner\.js\?v=26/.test(idxW),
                (idxW.match(/4_Context\.js\?v=\d+/) || '') + ' ' +
                (idxW.match(/flow_chyrons\.js\?v=\d+/) || '') + ' ' +
                (idxW.match(/Scanner\.js\?v=\d+/) || ''));
            // ── L. ARRENCADA EN FRED (2026-10-22 · #113, reobert) ──────────────
            // Log real de l'ordinador engegat en fred (22/10 08:57): 92,7 s, amb
            // TRES `readFolder NAS` (72,1 s / 69,1 s) perquè `checkContext` es va
            // executar tres vegades alhora i cada còpia tornava a llegir el NAS.
            // Ara: una sola execució (single-flight) + una sola sonda per clau +
            // espera limitada + caché de dates persistida.
            files = {};
            files[F_TODAY1] = localMs(2026, 10, 21, 12);
            files[F_TODAY2] = localMs(2026, 10, 21, 13);
            reset(true);
            // (2026-10-29) El `cep.fs` del stub és SÍNCRON (com el real): encara
            // així, la sonda en curs es reaprofita (`_probeInflight`) i les tres
            // crides comparteixen UN sol `readdir`.
            var tri = await Promise.all([Scan.wottsToday(ctxBase), Scan.wottsToday(ctxBase), Scan.wottsToday(ctxBase)]);
            ok('#WOTT/25 tres sondes simultànies comparteixen UNA lectura del NAS (#113)',
                tri[0].found === true && tri[1].found === true && tri[2].found === true && readdirCalls === 1 && statCalls === 2,
                'readdir=' + readdirCalls + ' stats=' + statCalls +
                ' found=' + tri.map(function (r) { return r.found ? 1 : 0; }).join(''));

            // Caché de dates PERSISTENT: `birthtime` no canvia mai, així que es
            // desa a localStorage i una recàrrega del panell no torna a fer stats.
            var store = {};
            var lsOk = false;
            try {
                Object.defineProperty(window, 'localStorage', {
                    configurable: true,
                    value: {
                        getItem: function (k) { return (k in store) ? store[k] : null; },
                        setItem: function (k, v) { store[k] = String(v); },
                        removeItem: function (k) { delete store[k]; }
                    }
                });
                lsOk = true;
            } catch (eLS) { lsOk = false; }
            var savedKey = 'fp_wott_dates_v1';
            reset(true);
            Scan._dateCacheLoaded = false;
            var rSave = await Scan.wottsToday(ctxBase);     // data els 2 wotts i DESA
            var savedRaw = (lsOk && store[savedKey]) ? String(store[savedKey]) : '';
            var savedOk = savedRaw.indexOf('20261021') !== -1;
            // Panell NOU: caché de memòria buida + es recupera del disc.
            reset(false);
            Scan._dateCacheLoaded = false;
            Scan._loadDateCache();
            var recovered = Scan._wottDateCache[String(F_TODAY1).toUpperCase()] === '20261021';
            var rNew = await Scan.wottsToday(ctxBase);      // cap stat: ja està datat
            ok('#WOTT/26 caché de dates persistida a localStorage (#113): si ja està datat, 0 stats',
                savedOk && recovered && rSave.count === 2 && rNew.count === 2 && statCalls === 0,
                'desada=' + savedOk + ' recuperada=' + recovered + ' count=' + rNew.count +
                ' stats=' + statCalls + (lsOk ? '' : ' (localStorage no manipulable en aquest entorn)'));

            // Guardes de codi: single-flight + sondes amb espera limitada.
            ok('#WOTT/27 checkContext: single-flight (_ccInFlight + _runCheckContext)',
                ctxSrc.indexOf('_ccInFlight') > 0 && /async _runCheckContext\(/.test(ctxSrc) &&
                /if \(_ccInFlight\) \{/.test(ctxSrc) &&
                /if \(_opts && _opts\.force\) _ccAgain = true;/.test(ctxSrc) &&
                ctxSrc.indexOf('return await _ccInFlight;') > 0);
            ok('#WOTT/28 sonda de wotts: espera limitada (PROBE_TIMEOUT_MS) i sense sonda d MP4',
                /PROBE_TIMEOUT_MS: 8000/.test(ctxSrc) &&
                /this\._withTimeout\(sc\.wottsToday\(ctx\), this\.PROBE_TIMEOUT_MS/.test(ctxSrc) &&
                ctxSrc.indexOf('_mediaToday') === -1 &&
                ctxSrc.indexOf('mp4Today') === -1);
            var scanSrc = await readRepo('js/logic/Scanner.js');
            ok('#WOTT/29 Scanner: dedupe (_probeInflight/_probeKey) i marques [SCAN] a l arrencada',
                /_probeKey: function \(ctx\)/.test(scanSrc) &&
                /_probeInflight\[key\] = p;/.test(scanSrc) &&
                scanSrc.indexOf("_bm('wotts · llistat (") > 0 &&
                scanSrc.indexOf("_bm('MP4 · ") === -1 &&
                scanSrc.indexOf("_bm('wotts · datació (") > 0);

            // ── M. Ctrl+clic (AHIR) QUE «NO FEIA RES» (2026-10-22 · #181) ────────
            // Log real (22/10 13:05): «Ctrl+clic → mode correcció (AHIR)» i, mig segon
            // després, «Ja hi ha un escaneig en curs: la crida s hi enganxa» → l estat
            // lligut era el de HOY (MASSA) → «AHIR sense material útil» i cap acció.
            ok('#WOTT/30 checkContext: `fresh` espera el torn i llança un escaneig propi',
                /const _fresh = !!\(_opts && _opts\.fresh\)/.test(ctxSrc) &&
                /while \(_ccInFlight && _waits < 8\)/.test(ctxSrc) &&
                ctxSrc.indexOf('checkContext({ force: true, fresh: true })') > 0,
                'fresh=' + /_opts\.fresh/.test(ctxSrc) +
                ' espera=' + /while \(_ccInFlight && _waits < 8\)/.test(ctxSrc));

            /**
             * srcMethods: extreu metodes REALS de 4_Context.js i els avalua aillats
             * (el harness no carrega 4_Context.js: es un modul d estat, amb DOM).
             * `getUtils` queda en el scope de l eval perque els metodes el criden.
             */
            var getUtils = function () { return UI.Utils; };
            function srcMethods(src, names) {
                var out = {};
                for (var i = 0; i < names.length; i++) {
                    var at = src.indexOf('\n        ' + names[i] + ': ');
                    if (at < 0) { continue; }
                    var from = at + 9;
                    var open = src.indexOf('{', from);
                    if (open < 0) { continue; }
                    var depth = 0, end = -1;
                    for (var p = open; p < src.length; p++) {
                        var ch = src.charAt(p);
                        if (ch === '{') { depth++; }
                        else if (ch === '}') { depth--; if (depth === 0) { end = p; break; } }
                    }
                    if (end < 0) { continue; }
                    try {
                        var one = eval('({' + src.substring(from, end + 1) + '})');
                        out[names[i]] = one[names[i]];
                    } catch (eEv) { }
                }
                return out;
            }
            var cM = srcMethods(ctxSrc, ['_correctionAction', '_awaitTargetScan']);

            var cases = [
                ['NEW', true, 'NEW', 'material'],
                ['UPDATE', true, 'UPDATE', 'material'],
                ['GO', true, 'GO', 'material'],
                ['LOAD', true, 'LOAD', 'material'],
                ['MASSA', true, 'NEW', 'sense-material'],
                ['ESPERANT', true, 'NEW', 'sense-material'],
                ['MASSA', false, 'NEW', 'sense-escaneig-del-dia'],
                ['DISABLED', true, null, 'estat-DISABLED']
            ];
            var badCase = '';
            for (var ci = 0; ci < cases.length; ci++) {
                var cs = cases[ci];
                var got = cM._correctionAction ? cM._correctionAction(cs[0], cs[1]) : null;
                if (!got || got.action !== cs[2] || got.reason !== cs[3]) {
                    badCase = cs[0] + '/' + cs[1] + ' -> ' + JSON.stringify(got) +
                        ' (esperat ' + cs[2] + '/' + cs[3] + ')';
                    break;
                }
            }
            ok('#WOTT/31 _correctionAction: AHIR amb MASSA/ESPERA o sense escaneig del dia -> CREA',
                !!cM._correctionAction && badCase === '' &&
                ctxSrc.indexOf('this._correctionAction(stA, scanY.ok)') > 0,
                badCase === '' ? '8 casos OK' : badCase);

            var calls = 0, freshOk = true;
            var fakeCtx = {
                _lastConclusion: null,
                _lastButtonData: null,
                checkContext: async function (o) {
                    calls++;
                    if (!o || o.fresh !== true) freshOk = false;
                    // Dues passades amb la data d AVUI (poll) i la tercera amb AHIR.
                    if (calls < 3) {
                        this._lastConclusion = 'MASSA';
                        this._lastButtonData = { dateDir: '2026_10_22' };
                    } else {
                        this._lastConclusion = 'NEW';
                        this._lastButtonData = { dateDir: '2026_10_21' };
                    }
                }
            };
            var rSc = (cM._awaitTargetScan)
                ? await cM._awaitTargetScan.call(fakeCtx, '2026_10_21', 3)
                : null;
            ok('#WOTT/32 _awaitTargetScan: reintenta fins que l estat es de la data demanada',
                !!rSc && rSc.ok === true && rSc.attempts === 3 && rSc.state === 'NEW' &&
                calls === 3 && freshOk && rSc.data && rSc.data.dateDir === '2026_10_21',
                'ok=' + (rSc && rSc.ok) + ' intents=' + (rSc && rSc.attempts) +
                ' calls=' + calls + ' fresh=' + freshOk);

            var callsKo = 0;
            var fakeKo = {
                _lastConclusion: null,
                _lastButtonData: null,
                checkContext: async function () {
                    callsKo++;
                    this._lastConclusion = 'MASSA';
                    this._lastButtonData = { dateDir: '2026_10_22' };
                }
            };
            var rKo = (cM._awaitTargetScan)
                ? await cM._awaitTargetScan.call(fakeKo, '2026_10_21', 2)
                : null;
            ok('#WOTT/33 _awaitTargetScan: si la data no arriba, ok=false (es crea igualment)',
                !!rKo && rKo.ok === false && rKo.attempts === 2 && callsKo === 2 &&
                ctxSrc.indexOf('sense-escaneig-del-dia') > 0,
                'ok=' + (rKo && rKo.ok) + ' intents=' + (rKo && rKo.attempts) + ' calls=' + callsKo);

            ok('#WOTT/34 _onMainClick: la data del flux es la DEMANADA (St.dateDir abans de crear)',
                ctxSrc.indexOf('const targetY = this._targetDateDir();') > 0 &&
                ctxSrc.indexOf('await this._awaitTargetScan(targetY, 3)') > 0 &&
                /St\.dateDir = targetY;/.test(ctxSrc) &&
                ctxSrc.indexOf('workTarget = _resetTarget') > 0,
                'target=' + (ctxSrc.indexOf('const targetY = this._targetDateDir();') > 0) +
                ' scan=' + (ctxSrc.indexOf('await this._awaitTargetScan(targetY, 3)') > 0) +
                ' date=' + /St\.dateDir = targetY;/.test(ctxSrc) +
                ' reset=' + (ctxSrc.indexOf('workTarget = _resetTarget') > 0));

            // ── N. SENSE NODE I SENSE created (2026-10-22 · #182) ────────────────
            // Equip real (log 22/10 14:02): «[CAP] Node=false» i, en UNC, ni
            // `cep.fs.stat().creationTime` ni `File.created` donen res → la sonda
            // deia «0/43 wotts del dia» tenint els 43 wotts al NAS, i el botó es
            // quedava a MASSA D'HORA amb l'escaleta ja baixada per FOTO.
            // Ara: mtime amb REGLA NOCTURNA com a últim recurs, i una escaleta
            // local completa desbloqueja CREA sense dependre de la sonda.
            var mtAvui = Scan._mtimeDateYYYYMMDD(new Date(2026, 9, 22, 13, 57, 0).getTime());
            var mtNit  = Scan._mtimeDateYYYYMMDD(new Date(2026, 9, 22, 2, 31, 0).getTime());
            var mtZero = Scan._mtimeDateYYYYMMDD(0);
            ok('#WOTT/35 _mtimeDateYYYYMMDD: regla nocturna (13:57→avui · 02:31→ahir · 0→null)',
                mtAvui === '20261022' && mtNit === '20261021' && mtZero === null,
                mtAvui + ' / ' + mtNit + ' / ' + (mtZero === null ? 'null' : mtZero));

            var fdNom = Scan._fileDateYYYYMMDD({ name: 'TN_COMARQUES_V1_20261022_x.MP4', created: 0, mtime: 0 });
            var fdMtm = Scan._fileDateYYYYMMDD({ name: F_TODAY1, created: 0, mtime: new Date(2026, 9, 22, 13, 57, 0).getTime() });
            var fdCre = Scan._fileDateYYYYMMDD({ name: F_TODAY1, created: new Date(2026, 9, 21, 12, 0, 0).getTime(), mtime: new Date(2026, 9, 22, 13, 57, 0).getTime() });
            ok('#WOTT/36 _fileDateYYYYMMDD: nom → created → mtime (created=0 en UNC no tomba el filtre)',
                fdNom === '20261022' && fdMtm === '20261022' && fdCre === '20261021',
                fdNom + ' / ' + fdMtm + ' / ' + fdCre);

            // Sonda completa pel camí REAL de l'equip: sense Node, CEP llista i
            // `stat` només dóna mtime (creationTime=0).
            var cepTimes = {};
            cepTimes[F_TODAY1] = new Date(2026, 9, 21, 13, 57, 0).getTime();
            cepTimes[F_TODAY2] = new Date(2026, 9, 21, 14, 2, 0).getTime();
            cepTimes[F_AHIR]   = new Date(2026, 9, 21, 2, 31, 0).getTime();   // mtime nocturn → 20/10
            // (2026-10-29) Sonda pel camí REAL de l'equip: `cep.fs` llista i el
            // seu `stat` només dóna mtime (creationTime=0 en UNC).
            UI.Utils.readFolder = function () { return Promise.resolve(null); };
            try {
                window.cep = {
                    fs: {
                        readdir: function () { return { err: 0, data: Object.keys(cepTimes) }; },
                        stat: function (p) {
                            var n = String(p).split(BS).pop();
                            if (!(n in cepTimes)) return { err: 2 };
                            return { err: 0, data: { creationTime: 0, mtime: cepTimes[n] } };
                        }
                    }
                };
            } catch (eCep2) { }
            reset(true);
            var rNoNode = await Scan.wottsToday(ctxBase);
            ok('#WOTT/37 creationTime=0: data pel mtime (CEP) → 2 wotts del dia',
                rNoNode.ok === true && rNoNode.found === true && rNoNode.count === 2 &&
                rNoNode.via === 'cep' && rNoNode.dated === 3,
                'ok=' + rNoNode.ok + ' found=' + rNoNode.found + ' count=' + rNoNode.count +
                ' via=' + rNoNode.via + ' datats=' + rNoNode.dated + '/' + rNoNode.pendingDates);
            UI.Utils.readFolder = realReadFolder;
            installCepFs();

            ok('#WOTT/38 checkContext: escaleta local COMPLETA (FOTO) desbloqueja CREA (#182)',
                ctxSrc.indexOf('const escReady = !!(escFound && semaforoData.esc.local && semaforoData.esc.ready);') > 0 &&
                /else if \(escReady\) \{/.test(ctxSrc) &&
                ctxSrc.indexOf('CREA: escaleta local') > 0);

            ok('#WOTT/39 cache-bust del #182 (4_Context 33 · Scanner 26)',
                /4_Context\.js\?v=33/.test(idxW) && /Scanner\.js\?v=26/.test(idxW),
                (idxW.match(/4_Context\.js\?v=\d+/) || '') + ' ' + (idxW.match(/Scanner\.js\?v=\d+/) || ''));

            // (2026-10-22 · #182) TESTIMONI al log: si el stat d'UNC no dóna cap data,
            // volem vore creationTime/mtime en compte de quedar-nos a cegues.
            ok('#WOTT/40 _dateWotts: testimoni del stat quan CEP no data (creationTime/mtime)',
                scanSrc.indexOf("' (creationTime=' + sample.c + ' · mtime=' + sample.m + ')'") > 0 &&
                scanSrc.indexOf('[SCAN:dates] CEP no ha datat ') > 0 &&
                scanSrc.indexOf('sense data fiable (ni created ni mtime)') > 0);

            // ── N. WOTTS SENCERS: 1 FRAME MENYS (2026-10-22 · #182c) ───────────
            // Queixa: «quan es col·loca el clip SENCER ix 1 frame més llarg que el
            // mèdia real». La durada estimada per mida NO és prou fiable (pot errar
            // 2-3 frames): es LLIG el clip que ha deixat l'INSERT i es fixa el final
            // 1 frame abans, amb verificació i 2a passada si `endCoherent` hi torna
            // a afegir el frame inclusiu.
            ok('#WOTT/41 flow_chyrons: el wott SENCER es MESURA al timeline i es retalla la CUA',
                /vaSencer = \(placeEnd === null\)/.test(chySrc) &&
                /getClipsLogic\(\)\._clipAtTime\(slot\.track, st, 'video'\)/.test(chySrc) &&
                /dWant = Math\.max\(REV_FRAME, dIns - WOTT_TAIL_FRAMES \* REV_FRAME\)/.test(chySrc) &&
                /sencerFet = true/.test(chySrc) &&
                /if \(placeEnd !== null && !sencerFet\)/.test(chySrc),
                'vaSencer=' + /vaSencer = \(placeEnd === null\)/.test(chySrc) +
                ' mesura=' + /_clipAtTime\(slot\.track, st, 'video'\)/.test(chySrc) +
                ' guarda=' + /!sencerFet/.test(chySrc));
            var FR = 0.04;
            var gDown = function (v) { return Math.floor(Number(v) / FR + 1e-6) * FR; };
            var fN = function (s) { return Math.round(Number(s) / FR); };
            // Rèplica EXACTA del bloc de flow_chyrons (`afig` = 1 frame que hi afig
            // Premiere en fixar el final: és el pitjor cas, el que abans es colava).
            // (2026-11-03 · #218) La cua és `WOTT_TAIL_FRAMES` = 8 frames (la prova en
            // viu del 03/11 va dir que 20 era massa; 8 és el que es va mesurar de negre).
            var TAIL_F = 8;
            var retallSencer = function (start, dIns, afig) {
                if (!(dIns > 2 * FR)) return null;
                var dWant = Math.max(FR, dIns - TAIL_F * FR), dFin = dIns;
                for (var pas = 0; pas < 2 && dFin > dWant + 0.5 * FR; pas++) {
                    var wantE = gDown(start + dWant - pas * FR);
                    if (!(wantE > start + 0.5 * FR)) break;
                    dFin = (wantE - start) + (afig ? FR : 0);
                }
                return (dFin > 0 && dFin < dIns - 0.5 * FR) ? dFin : null;
            };
            var rA = retallSencer(100.00, 156 * FR, false);
            var rB = retallSencer(100.00, 156 * FR, true);
            ok('#WOTT/42 retall del clip sencer: 156 → 148 frames (8 de cua, amb i sense el frame inclusiu)',
                rA !== null && fN(rA) === 148 && rB !== null && fN(rB) === 148,
                'sense=' + (rA === null ? 'n/d' : fN(rA)) + ' amb=' + (rB === null ? 'n/d' : fN(rB)));
            var rC = retallSencer(100.00, 2 * FR, false);
            var rD = retallSencer(100.00, 3 * FR, false);
            ok('#WOTT/43 retall del clip sencer: 3 → 1 frame i un de 2 frames NO es toca (mai <1)',
                rC === null && rD !== null && fN(rD) === 1,
                '2f=' + (rC === null ? 'intacte' : fN(rC)) + ' 3f=' + (rD === null ? 'n/d' : fN(rD)));
            ok('#WOTT/44 el retall del sencer deixa traça (✂️ CLIP SENCER) i cache-bust flow_chyrons 95',
                chySrc.indexOf('✂️ [') > 0 && chySrc.indexOf('CLIP SENCER') > 0 &&
                /flow_chyrons\.js\?v=95/.test(idxW),
                (idxW.match(/flow_chyrons\.js\?v=\d+/) || ''));

            // ── N2. CUA DE SEGURETAT DE TOTS ELS WOTTS (2026-11-02 · #218, 03/11) ──
            // Queixa: «el wott que s'inserix és 8 frames més llarg que la imatge
            // real» → l'últim tros del mèdia és NEGRE. Petició d'usuari: la solució
            // MÉS SIMPLE — retallar SEMPRE una cua fixa de tots els wotts
            // (`WOTT_TAIL_FRAMES`) en els punts on es fixa el final; res d'endevinar
            // la longitud real de cada mèdia. La xifra final és 8 (la del 02/11, 20,
            // «era demasiado») i la durada genèrica de referència d'un chyron és 4 s.
            ok('#WOTT/63 flow_chyrons: constant WOTT_TAIL_FRAMES = 8 i helper _wottTailEnd',
                /const WOTT_TAIL_FRAMES = 8;/.test(chySrc) &&
                /_wottTailEnd: function \(startSec, endSec\)/.test(chySrc) &&
                /Math\.floor\(\(en - WOTT_TAIL_FRAMES \* REV_FRAME\) \/ REV_FRAME \+ 1e-6\) \* REV_FRAME/.test(chySrc) &&
                /return Math\.max\(st \+ REV_FRAME, cut\);/.test(chySrc),
                'const=' + /const WOTT_TAIL_FRAMES = 8;/.test(chySrc) +
                ' helper=' + /_wottTailEnd: function/.test(chySrc));
            ok('#WOTT/66 flow_chyrons: WOTT_DUR_REF = 4 s (durada genèrica d\'un chyron)',
                /const WOTT_DUR_REF = 4\.0;/.test(chySrc) &&
                /let wantDur = \(durOwn !== null\) \? durOwn : WOTT_DUR_REF;/.test(chySrc),
                'const=' + /const WOTT_DUR_REF = 4\.0;/.test(chySrc) +
                ' us=' + /: WOTT_DUR_REF;/.test(chySrc));
            ok('#WOTT/64 la cua es descompta en els DOS camins: rètol/grafisme i tòtem (TE)',
                /const endCut = this\._wottTailEnd\(slot\.start, placeEnd\);/.test(chySrc) &&
                /endCoherent\(slot\.track, slot\.start, endCut, 'video', label\)/.test(chySrc) &&
                /end = this\._wottTailEnd\(start, end\);/.test(chySrc),
                'generic=' + /_wottTailEnd\(slot\.start, placeEnd\)/.test(chySrc) +
                ' te=' + /_wottTailEnd\(start, end\)/.test(chySrc));
            // Rèplica de la funció: 8 frames de cua, graella cap avall, mai <1 frame.
            var tail = function (st, en) {
                if (!isFinite(st) || !isFinite(en)) return en;
                var cut = gDown(en - TAIL_F * FR);
                return Math.max(st + FR, cut);
            };
            ok("#WOTT/65 _wottTailEnd: 6,24s de mèdia → 5,92s de clip i mai per davall d'un frame",
                Math.abs((tail(100, 100 + 6.24) - 100) - 5.92) < 1e-6 &&
                Math.abs((tail(100, 100.2) - 100) - 0.04) < 1e-6,
                'viu=' + (tail(100, 106.24) - 100).toFixed(2) +
                ' curt=' + (tail(100, 100.2) - 100).toFixed(2));

            // ── O. CONGELAT DEL TITOLET: MAI CAPTURAR SOBRE EL VÍDEO (2026-10-22 · #183) ──
            // Queixa: «el congelat del titullet ha congelat el clip de V1». El PNG del
            // congelat s'exporta del PROGRAMA COMPOST: si el TC de captura té vídeo a sota,
            // el PNG és opac, se n'endú el clip i tapa el programa. El defecte venia de
            // `_emptyProgramTC`, que quan NO podia llegir les pistes tornava **600 s** (dins
            // del bloc) com si fóra una zona buida.
            var CHY = UI.Workflows.Chyrons;
            ok('#WOTT/45 motor: Chyrons._freezeZone existeix i _emptyProgramTC hi delega',
                !!(CHY && typeof CHY._freezeZone === 'function') &&
                /_emptyProgramTC: async function \(needSec\) \{\s*const z = await this\._freezeZone/.test(chySrc),
                'CHY=' + !!CHY + ' freezeZone=' + typeof (CHY && CHY._freezeZone));

            if (!CHY || typeof CHY._freezeZone !== 'function') { return; }
            var TLZ = {};            // pista → [{start,end}]
            var CNT_ERR = {};        // pista → error de Clips.count
            var NTR = 0;             // nombre de pistes de vídeo que "existeixen"
            var TRK_ERR = false;
            var savedCJZ = UI.Utils.callJSX;
            UI.Utils.callJSX = async function (expr) {
                var s = String(expr), m;
                if (/^Tracks\.count\('video'\)$/.test(s)) return TRK_ERR ? 'ERR:boom' : String(NTR);
                if ((m = /^Clips\.count\((\d+), 'video'\)$/.exec(s))) {
                    var t = Number(m[1]);
                    if (CNT_ERR[t]) return CNT_ERR[t];
                    return String((TLZ[t] || []).length);
                }
                if ((m = /^Clips\.get\((\d+), (\d+), 'video'\)$/.exec(s))) {
                    var arr = TLZ[Number(m[1])] || [], c = arr[Number(m[2])];
                    return c ? JSON.stringify({ index: Number(m[2]), name: 'x', start: c.start, end: c.end }) : 'null';
                }
                return 'OK';
            };
            try {
                // 45 · pistas il·legibles → NO es pot garantir cap zona (mai 600 a cegues)
                TLZ = {}; CNT_ERR = {}; NTR = 0; TRK_ERR = true;
                var z45 = await CHY._freezeZone(12);
                TRK_ERR = false;
                TLZ = { 1: [{ start: 0, end: 100 }] }; CNT_ERR = { 6: 'ERR:boom' }; NTR = 6;
                var z45b = await CHY._freezeZone(12, 3000);
                ok('#WOTT/45 _freezeZone: sense llegir les pistes NO torna 600 (ok:false) — ni amb un TC preferit',
                    z45.ok === false && z45.tc === 0 && z45.via === 'illegible' &&
                    z45b.ok === false && z45b.tc === 0,
                    'Tracks KO=' + JSON.stringify(z45) + ' · pista KO=' + JSON.stringify(z45b));

                // 46 · V1 ple fins a 2700 s: el 600 del titullet és dins del vídeo → es recalcula
                TLZ = { 1: [{ start: 0, end: 2700 }] }; CNT_ERR = {}; NTR = 1;
                var z46 = await CHY._freezeZone(12, 600);
                var z46b = await CHY._freezeZone(12);
                ok('#WOTT/46 _freezeZone: un TC preferit damunt de V1 es REBUTJA i la zona passa darrere del vídeo (2705 s)',
                    z46.ok === true && z46.via === 'recalculat' && Math.abs(z46.tc - 2705) < 0.05 &&
                    z46b.ok === true && Math.abs(z46b.tc - 2705) < 0.05,
                    'pref=' + JSON.stringify(z46) + ' · lliure=' + JSON.stringify(z46b));

                // 47 · zona preferida lliure de veritat → s'accepta sense recalcular
                TLZ = { 1: [{ start: 0, end: 100 }], 6: [] }; CNT_ERR = {}; NTR = 6;
                var z47 = await CHY._freezeZone(12, 3000);
                ok('#WOTT/47 _freezeZone: si el TC preferit PROVA que és buit, es reutilitza (via preferit)',
                    z47.ok === true && z47.via === 'preferit' && Math.abs(z47.tc - 3000) < 0.001,
                    JSON.stringify(z47));

                // 48 · el congelat no pot capturar-se si el clip temporal no cobrix l'instant
                ok('#WOTT/48 _freezeTemaTitol: guarda de COBERTURA abans de capturar (covOk/readCover) i abandonament net',
                    /const covOk = \(c\)/.test(chySrc) &&
                    /Number\(c\.end\) > snapTC \+ 0\.005/.test(chySrc) &&
                    /cov = await readCover\(snapTC\)/.test(chySrc) &&
                    /Cap clip temporal cobrint l'instant de captura/.test(chySrc) &&
                    chySrc.indexOf('Cap clip temporal cobrint') < chySrc.indexOf('_capturePng(snapPath') &&
                    /alpha: true,\s*zoneOk: true/.test(chySrc) &&
                    /alpha: true, zoneOk: zone\.ok/.test(chySrc),
                    'guarda=' + /const covOk = \(c\)/.test(chySrc) +
                    ' alpha=' + /alpha: true/.test(chySrc));

                // 49 · el TITULET amb ALPHA no pot capturar-se amb `_v6FreeTC` (només mira la
                // pista destí). Mesurat al TNC V3 del 22/10: el PNG del titullet pesava
                // 1.077.396 B (un frame del programa) contra 21.229 B del congelat bo.
                var iStill = chySrc.indexOf('_freezeTitulilloStill: async function');
                var stillSrc = (iStill >= 0) ? chySrc.slice(iStill, iStill + 8000) : '';
                ok('#WOTT/49 _freezeTitulilloStill: zona VALIDADA amb _freezeZone (no _v6FreeTC), cobertura i descart pel TAMANY del PNG',
                    stillSrc.length > 0 &&
                    /const z = \(zone && typeof zone === 'object'\) \? zone : await this\._freezeZone\(needZone\)/.test(stillSrc) &&
                    /const TEMP_TC = z\.tc/.test(stillSrc) &&
                    stillSrc.indexOf('const TEMP_TC = await this._v6FreeTC') === -1 &&
                    stillSrc.indexOf('_freezeZone(needZone)') < stillSrc.indexOf('_capturePng(capBase') &&
                    /cap clip temporal cobrint l'instant de captura a V\$\{track\}/.test(stillSrc) &&
                    /const LIMIT_PROGRAMA = 400 \* 1024/.test(stillSrc) &&
                    /const pngSospitos = cap\.ok && Number\(cap\.bytes\) > LIMIT_PROGRAMA/.test(stillSrc) &&
                    /if \(cap\.ok && !pngSospitos\)/.test(stillSrc) &&
                    /flow_chyrons\.js\?v=95/.test(idxW),
                    'still=' + stillSrc.length +
                    ' zoneAvansCaptura=' + (stillSrc.indexOf('_freezeZone(needZone)') > -1 && stillSrc.indexOf('_freezeZone(needZone)') < stillSrc.indexOf('_capturePng(capBase')) +
                    ' v6=' + (stillSrc.indexOf('const TEMP_TC = await this._v6FreeTC') === -1 ? 'fora' : 'DINS') +
                    ' v95=' + /flow_chyrons\.js\?v=95/.test(idxW));
            } finally {
                UI.Utils.callJSX = savedCJZ;
            }
        // ── K. WOTTS FLOTANTS (2026-10-26) ──────────────────────────────
        // Wotts amb el bloc A SEQUES (`Wott_TNM_V_...`): el generador no els lliga a
        // cap ítem de l'esquema (XARXES-TEXT) i fins hui ni tan sols s'importaven.
        // Ara: `V` (flotant) i `V03` (zero davant) compten com a bloc, el filtre per
        // data s'aplica a tots, i el TEMA només pot eixir dels wotts DEL BLOC.
        if (Scan && typeof Scan.wotts === 'function') {
            // (2026-10-29) Ací es prova el camí de RESPATLLER (readFolder/JSX):
            // sense `cep.fs` disponible, com quan el llistat natiu falla.
            try { window.cep = undefined; } catch (eCepK) { }
            var fB1 = 'Wott_TNV_V1_10_00.01_TEMA A_111_Tema-Titol_a.00000001.MOV';
            var fB03 = 'Wott_TNV_V03_10_02.00_TEMA C_333_Tema-Titol_c.00000003.MOV';
            var fF1 = 'Wott_TNV_V_00_00.00_LUCYS VERTICALITZACIÓ_660688_XARXES-TEXT_tp_SILVIA ORRIOLS_Aliança Cat_k_00660901.mov';
            var fF2 = 'Wott_TNV_V_00_00.00_LUCYS VERTICALITZACIÓ_660688_XARXES-TEXT_tp_JORDI TURULL_PSC_k_00660902.mov';
            var fV2 = 'Wott_TNV_V2_00_00.00_ALTRE BLOC_444_XARXES-TEXT_tp_X_Y_k_00660903.mov';
            var fTC = 'Wott_TNC_V_00_00.00_ALTRE PROG_555_XARXES-TEXT_tp_X_Y_k_00660904.mov';
            var fAhir = 'Wott_TNV_V_00_00.00_AHIR_556_XARXES-TEXT_tp_X_Y_k_00660905.mov';
            var mkW = function (n, d) {
                return { name: n, created: localMs(2026, 10, d || 21, 12), mtime: localMs(2026, 10, d || 21, 12) };
            };
            var setWotts = function (arr) {
                Scan._readCache = {};
                UI.Utils.readFolder = function () { return Promise.resolve(arr); };
            };
            var ctxW = function (bloc) {
                return {
                    config: { rutas: { chyrons: FOLDER } }, progData: { archivo: 'TN_VESPRE', wott: 'TNV' },
                    bloque: bloc, dateDir: '2026_10_21'
                };
            };
            setWotts([mkW(fB1), mkW(fB03), mkW(fF1), mkW(fF2), mkW(fV2), mkW(fTC), mkW(fAhir, 20)]);
            var w50 = await Scan.wotts(ctxW('V3'));
            ok('#WOTT/50 wotts: el bloc V3 accepta V3 i V03 i, a més, els FLOTANTS «V» del dia (fora V1, V2, altre programa i ahir)',
                w50.list.length === 3 &&
                w50.list.some(x => x.name === fB03) &&
                w50.list.some(x => x.name === fF1) && w50.list.some(x => x.name === fF2) &&
                !w50.list.some(x => x.name === fB1 || x.name === fV2 || x.name === fTC || x.name === fAhir),
                'n=' + w50.list.length + ' [' + w50.list.map(x => x.name.split('_').slice(1, 3).join('_')).join(', ') + ']');

            ok('#WOTT/51 wotts: el TEMA ix NOMÉS del bloc (un XARXES-TEXT flotant no pot batejar el projecte)',
                w50.tema === 'TEMA C', 'tema=' + w50.tema);

            var w52 = await Scan.wotts(ctxW('V1'));
            ok('#WOTT/52 wotts: el bloc V1 també rep els flotants del dia (V1 + 2 flotants = 3)',
                w52.list.length === 3 && w52.list.some(x => x.name === fB1) &&
                w52.list.some(x => x.name === fF1) && !w52.list.some(x => x.name === fB03),
                'n=' + w52.list.length);

            setWotts([mkW(fF1), mkW(fF2)]);
            var w53 = await Scan.wotts(ctxW('V3'));
            ok('#WOTT/53 wotts: només flotants (cap wott de bloc) → PENDENT i cap import (sense TEMA no hi ha projecte)',
                w53.tema === 'PENDENT' && w53.list.length === 0,
                'tema=' + w53.tema + ' n=' + w53.list.length);

            // (2026-10-26 · BUG #191) Els FLOTANTS no tenen ÍTEM: `Parse.files` no els
            // pot convertir en un bloc fantasma «00» (que, amb un ítem «00» a l'escaleta,
            // els col·locaria damunt d'eixe ítem). Han d'arribar al bin, no a l'estructura.
            var ParseAPI = UI.Logic && UI.Logic.Parse;
            var st54 = (ParseAPI && typeof ParseAPI.files === 'function')
                ? ParseAPI.files([{ name: fF1, path: 'x' }, { name: fB03, path: 'y' }], 'TNM', 'V3')
                : [];
            ok('#WOTT/54 Parse.files: els FLOTANTS (bloc a seques) no creen cap bloc «00» ni entren a l\'estructura',
                !!ParseAPI && typeof ParseAPI._esFlotant === 'function' &&
                ParseAPI._esFlotant(fF1) === true && ParseAPI._esFlotant(fB03) === false &&
                ParseAPI._esFlotant('Wott_TN_COMARQUES_V1_10_00.01_TEMA_1_Tema-Titol_a.00000001.MOV') === false &&
                st54.length === 1 && st54[0].id === '10' && st54[0].chyrons.length === 1,
                'Parse=' + !!ParseAPI + ' ids=' + st54.map(function (b) { return b.id + ':' + b.chyrons.length; }).join(',') +
                ' flotF1=' + (ParseAPI ? ParseAPI._esFlotant(fF1) : '-'));
        }
            // #WOTT/55 · SEMÀFOR «OCUPAT» (2026-10-29 · BUG #204) · COMPORTAMENT REAL
            // Què passava: mentres `_fullScan` llegia la carpeta de rètols del NAS
            // (103 s en fred), el WOT es quedava en `blink` (verd intermitent, que
            // significa «ja importable»). L'usuari només veia parpadejar un llum
            // sense cap senyal d'activitat. Ara hi ha un estat `busy` (blau) que es
            // pinta abans de tocar el NAS i es restaura en acabar.
            try {
                var srcCtx2 = await readRepo('js/core/4_Context.js');
                var iBusy = srcCtx2.indexOf('setSemaforOcupat(id, title) {');
                var iUpd = srcCtx2.indexOf('updateLights(prog, bloc, theme, active, semaforoData) {');
                var srcBusy = (iBusy > 0 && iUpd > iBusy)
                    ? '{' + srcCtx2.substring(iBusy, iUpd) + '}'
                    : '';
                var elW = { className: 'light blink', parentElement: { title: 'Tots importats' } };
                var fakeDoc = { getElementById: function (id) { return id === 'sem-wot' ? elW : null; } };
                var apiBusy = new Function('document', 'return ' + srcBusy + ';')(fakeDoc);
                var pintat = apiBusy.setSemaforOcupat('sem-wot', 'Analitzant els rètols del NAS…');
                var clsBusy = elW.className;
                var titleBusy = elW.parentElement.title;
                apiBusy.setSemaforLliure('sem-wot');
                var cssSrc = await readRepo('style.css');
                var fmbSrc = await readRepo('js/workflows/flow_mainButton.js');
                ok('#WOTT/55 semàfor «busy» (blau): es pinta mentres escaneja el NAS i es restaura en acabar',
                    pintat === true && clsBusy === 'light busy' && /NAS/.test(titleBusy) &&
                    elW.className === 'light blink' && elW.parentElement.title === 'Tots importats' &&
                    /else if \(state === 'busy'\) className = "light busy";/.test(srcCtx2) &&
                    /\.light\.busy\s*\{/.test(cssSrc) &&
                    /setSemaforOcupat\('sem-wot'/.test(fmbSrc) &&
                    /setSemaforLliure\('sem-wot'\)/.test(fmbSrc) &&
                    /_fullScan TOTAL/.test(fmbSrc),
                    'pintat=' + pintat + ' cls=' + clsBusy + ' torna=' + elW.className +
                    ' css=' + /\.light\.busy\s*\{/.test(cssSrc));
            } catch (eBusy) {
                ok('#WOTT/55 semàfor «busy» (blau) mentres escaneja el NAS', false, String(eBusy && eBusy.message));
            }
            // #WOTT/56 · RASTREIG NATIU DEL NAS (2026-10-29 · BUG #204) · COMPORTAMENT REAL
            // `Scan.wotts` llistava la carpeta de rètols amb `Utils.readFolder` (JSX):
            // `length`, `modified` i `created` de CADA fitxer i, si `length` venia 0,
            // obertura del .mov per traure'n `eof`. Amb 1281 fitxers = 103 s en fred
            // (mesurat 29/10) i el fil del panell bloquejat. Ara es fa tot en JS:
            // `cep.fs.readdir` (noms) → filtre per nom → `cep.fs.stat` NOMÉS dels
            // candidats del bloc. Ací es comprova el repartiment de faena i que la
            // llista resultant és la mateixa que abans.
            if (Scan && typeof Scan.wotts === 'function' && typeof Scan._listNamesNative === 'function') {
                var savedCep56 = window.cep;
                var savedCache56 = Scan._wottDateCache;
                var savedLoaded56 = Scan._dateCacheLoaded;
                var savedRf56 = UI.Utils.readFolder;
                try {
                    var n1 = 'Wott_TNV_V3_20_00.00_TEMA Z_777_Tema-Titol_z.00000777.MOV';
                    var n2 = 'Wott_TNV_V03_20_02.00_TEMA Y_778_Tema-Titol_y.00000778.MOV';
                    var n3 = 'Wott_TNV_V_00_00.00_LUCYS VERTICALITZACIÓ_660688_XARXES-TEXT_tp_TEST_Y_k_00660999.mov';
                    var n4 = 'Wott_TNV_V1_20_10.00_FORA BLOC_779_Tema-Titol_w.00000779.MOV';
                    var n5 = 'Wott_TNC_V_00_00.00_ALTRE PROG_780_XARXES-TEXT_tp_X_Y_k_00660980.MOV';
                    var n6 = 'Wott_TNV_V3_19_00.00_AHIR_781_Tema-Titol_v.00000781.MOV';
                    var dia = {};
                    dia[n1] = localMs(2026, 10, 21, 12); dia[n2] = localMs(2026, 10, 21, 12);
                    dia[n3] = localMs(2026, 10, 21, 12); dia[n4] = localMs(2026, 10, 21, 12);
                    dia[n5] = localMs(2026, 10, 21, 12); dia[n6] = localMs(2026, 10, 20, 12);
                    var nReaddir = 0, statNames = [], nReadFolder = 0;
                    window.cep = {
                        fs: {
                            readdir: function () { nReaddir++; return { err: 0, data: [n1, n2, n3, n4, n5, n6] }; },
                            stat: function (p) {
                                var nm = String(p).split('\\').pop();
                                statNames.push(nm);
                                return { err: 0, data: { creationTime: dia[nm] || 0, mtime: dia[nm] || 0 } };
                            }
                        }
                    };
                    Scan._wottDateCache = {};       // cap data vinguda de tests anteriors
                    Scan._dateCacheLoaded = true;   // no rellegir localStorage
                    Scan._readCache = {};           // ni la caché de 30 s
                    UI.Utils.readFolder = function () { nReadFolder++; return Promise.resolve(null); };
                    var w56 = await Scan.wotts({
                        config: { rutas: { chyrons: FOLDER } }, progData: { archivo: 'TN_VESPRE', wott: 'TNV' },
                        bloque: 'V3', dateDir: '2026_10_21'
                    });
                    ok('#WOTT/56 wotts: 1 readdir natiu + stat NOMÉS dels candidats (0 readFolder/JSX) i mateixa llista',
                        nReaddir === 1 && nReadFolder === 0 &&
                        statNames.length === 4 &&
                        statNames.indexOf(n1) > -1 && statNames.indexOf(n2) > -1 &&
                        statNames.indexOf(n3) > -1 && statNames.indexOf(n6) > -1 &&
                        statNames.indexOf(n4) === -1 && statNames.indexOf(n5) === -1 &&
                        w56.list.length === 3 && w56.list.some(function (x) { return x.name === n1; }) &&
                        w56.list.some(function (x) { return x.name === n2; }) &&
                        !w56.list.some(function (x) { return x.name === n6; }),
                        'readdir=' + nReaddir + ' stat=' + statNames.length + ' readFolder=' + nReadFolder +
                        ' n=' + w56.list.length);
                } catch (eN56) {
                    ok('#WOTT/56 wotts: rastreig natiu del NAS', false, String(eN56 && eN56.message));
                } finally {
                    Scan._wottDateCache = savedCache56;
                    Scan._dateCacheLoaded = savedLoaded56;
                    Scan._readCache = {};
                    UI.Utils.readFolder = savedRf56;
                    try { window.cep = savedCep56; } catch (eR56) { }
                }
            }

        // ── P. NO DUPLICATS (2026-10-30 · petició d'usuari) ────────────────────────
        // «Sempre ha de verificar que el chyron/grafisme no estiga ja al timeline: si no
        // hi ha res, ho col·loca tot; si n'hi ha, només el que falta.» És una REGLA
        // PERMANENT: no hi ha mode ni interruptor que activar/desactivar.
        var chyMod = UI.Workflows.Chyrons;
        var chySrcP = await readRepo('js/workflows/flow_chyrons.js');
        var mainSrcP = await readRepo('js/main.js');
        var idxP = await readRepo('index.html');
        ok('#WOTT/57 Chyrons: NO-DUPLICAR permanent (_ensurePlacedGuard · _isAlreadyPlaced amb instant · _insertIfMissing) a totes les portes',
            !!chyMod &&
            typeof chyMod._refreshPlacedGuard === 'function' &&
            typeof chyMod._invalidatePlacedGuard === 'function' &&
            typeof chyMod._ensurePlacedGuard === 'function' &&
            typeof chyMod._isAlreadyPlaced === 'function' &&
            typeof chyMod._markPlaced === 'function' &&
            typeof chyMod._sameWottKey === 'function' &&
            typeof chyMod._insertIfMissing === 'function' &&
            typeof chyMod.resetDupSkipped === 'function' &&
            typeof chyMod.getDupSkipped === 'function' &&
            typeof chyMod.setNoDupMode === 'undefined' && chyMod._noDup === undefined &&
            chySrcP.indexOf('_isAlreadyPlaced: function (name, at)') !== -1 &&
            chySrcP.indexOf('this._isAlreadyPlaced(c.name, win)') !== -1 &&               // Lloc / Nom / Resto
            chySrcP.indexOf('if (this._isAlreadyPlaced(name, { lo: start - 0.5') !== -1 &&  // Traducció
            chySrcP.indexOf('if (this._isAlreadyPlaced(conductorFile, conductTime))') !== -1 && // Conductor
            chySrcP.indexOf('if (this._isAlreadyPlaced(wottName, placeTime))') !== -1 &&    // Tema-Títol / titullet
            chySrcP.indexOf('if (this._isAlreadyPlaced(conductorFile, targetTime))') !== -1 && // Magic/conductor
            /const faltants = ttFinal\.filter/.test(chySrcP) &&                            // Titol: quant en falta
            /this\._insertIfMissing\(chyron\.name/.test(chySrcP),                          // Magic chyrons
            'CHY=' + !!chyMod + ' setNoDupMode=' + (chyMod && typeof chyMod.setNoDupMode) +
            ' isAlready=' + (chyMod && typeof chyMod._isAlreadyPlaced) +
            ' insIf=' + (chyMod && typeof chyMod._insertIfMissing) +
            ' noDupProp=' + (chyMod && typeof chyMod._noDup));

        ok('#WOTT/58 🎯: no hi ha cap mode a activar (main.js només reseteja i llig el comptador) i el title ho diu',
            !/setNoDupMode/.test(mainSrcP) &&
            /resetDupSkipped/.test(mainSrcP) && /getDupSkipped/.test(mainSrcP) &&
            /NO DUPLICA/.test(idxP),
            'main reset=' + /resetDupSkipped/.test(mainSrcP) + ' get=' + /getDupSkipped/.test(mainSrcP));

        ok('#WOTT/59 Chyrons._dupKey: dues generacions del MATEIX rètol compten com U (i un altre text, no)',
            !!chyMod &&
            chyMod._dupKey('Wott_TNV_V1_10_00.01_TEMA A_111_Nom-Carrec_a.00000001.mov') ===
            chyMod._dupKey('Wott_TNV_V1_10_00.01_TEMA A_111_Nom-Carrec_a.00000009.mov') &&
            chyMod._dupKey('Wott_TNV_V1_10_00.01_TEMA A_111_Nom-Carrec_a.00000001.mov') !==
            chyMod._dupKey('Wott_TNV_V1_11_00.01_TEMA A_111_Nom-Carrec_b.00000001.mov') &&
            chyMod._dupKey('Wott_X.00000001.mov') === chyMod._dupKey('Wott_X.mov'),
            chyMod ? chyMod._dupKey('Wott_TNV_V1_10_00.01_TEMA A_111_Nom_a.00000001.mov') : 'sense mòdul');

        ok('#WOTT/60 Chyrons._isAlreadyPlaced: mana el par (nom + instant) · el MATEIX wott en un altre instant SÍ que entra',
            (function () {
                if (!chyMod) return false;
                var res = [];
                // 1. mateix wott (una altra generació) al mateix instant → ja hi és
                chyMod._placedGuard = [{ k: chyMod._dupKey('Wott_A.00000001.mov'), start: 10.0, end: 14.0 }];
                res.push(chyMod._isAlreadyPlaced('Wott_A.00000009.mov', 10.1) === true);
                // 2. el MATEIX wott 30 s més enllà (un altre bloc/ítem) → NO hi és
                res.push(chyMod._isAlreadyPlaced('Wott_A.00000009.mov', 40.0) === false);
                // 3. sense `at` la pregunta és «és en algun lloc?»
                res.push(chyMod._isAlreadyPlaced('Wott_A.mov') === true);
                // 4. dins del clip existent (encara que el seu inici siga 3 s abans) → ja hi és
                res.push(chyMod._isAlreadyPlaced('Wott_A.mov', 12.0) === true);
                // 5. un altre wott al mateix instant → NO hi és
                chyMod._placedGuard = [{ k: chyMod._dupKey('Altre.00000001.mov'), start: 3, end: 5 }];
                res.push(chyMod._isAlreadyPlaced('Wott_Que_No_Hi_Es.00000001.mov', 3) === false);
                // 6. nom TRUNCAT de Premiere (prefix >90) al mateix instant → ja hi és
                var llarg = 'Wott_TNV_V1_10_00.00_CAMPANYA ELECTORAL ACCIDENT_668645_XARXES-TEXT_tp_Gabriel Rufián_ERC_k_ABCDEF';
                chyMod._placedGuard = [{ k: chyMod._dupKey(llarg.substring(0, 93) + '.00068991.mov'), start: 20, end: 26 }];
                res.push(chyMod._isAlreadyPlaced(llarg + 'k_00668981.mov', 21) === true);
                // 7. reserva `_markPlaced` → bloqueja al mateix instant i no a un altre
                chyMod._placedGuard = [];
                chyMod._markPlaced('Wott_B.00000001.mov', 20);
                res.push(chyMod._isAlreadyPlaced('Wott_B.00000002.mov', 20) === true);
                res.push(chyMod._isAlreadyPlaced('Wott_B.00000002.mov', 60) === false);
                // 8. `_markPlaced` sense instant no reserva res (no pot blocar altres blocs)
                chyMod._placedGuard = [];
                chyMod._markPlaced('Wott_C.mov');
                res.push(chyMod._isAlreadyPlaced('Wott_C.mov') === false);
                chyMod._placedGuard = null;
                chyMod._dupSkipped = 0;
                return res.indexOf(false) === -1;
            })(),
            'guarda permanent nom + instant');

        // ── P2. BUG #211 (2026-10-30): la finestra de l'ÍTEM arriba al seu FINAL ────
        // Log real del 30/10 (PROVES\FASTPASS.log, 11:50 vs 11:51): l'últim ítem (marcador
        // 10@16.40 s, sense marcador següent) té rètols fins a 118.84 s. La finestra es
        // tancava a `16.40 + 60 = 76.40 s` → el nom-càrrec 668945/668946/668947 i la firma
        // 668949 es tornaven a col·locar a la 2a passada de 🎯 (la firma acabava a V8).
        var FIRMA_211 = 'Wott_TNV_V1_10_01.43_CAMPANYA ELECTORAL ACCIDENT_668949_Firma_Eva Pelegrí Bobet_Marta Vila.00668992.mov';
        ok('#WOTT/61 🐞 #211: la finestra NO-DUP de l\'ítem arriba al FINAL de l\'ítem (no a marcador+60 s)', 
            (function () {
                if (!chyMod) return false;
                var res = [];
                chyMod._placedGuard = [{
                    k: chyMod._dupKey(FIRMA_211), start: 118.84, end: 123.80
                }];
                // 1. finestra ANTIGA (marcador 16.40 + 60 → 76.40 s) → el rètol quedava FORA (el bug)
                res.push(chyMod._isAlreadyPlaced(FIRMA_211, { lo: 15.4, hi: 76.4 }) === false);
                // 2. finestra NOVA (final de l'ítem, 131.68 s) → ja hi és → no es duplica
                res.push(chyMod._isAlreadyPlaced(FIRMA_211, { lo: 15.4, hi: 131.68 }) === true);
                // 3. sense final conegut la finestra és oberta (`Infinity`) → tampoc no es duplica
                res.push(chyMod._isAlreadyPlaced(FIRMA_211, { lo: 15.4, hi: Infinity }) === true);
                // 4. SOLAPAMENT: el clip existent comença ABANS de la finestra però la trepitja
                chyMod._placedGuard = [{ k: chyMod._dupKey(FIRMA_211), start: 80.0, end: 85.0 }];
                res.push(chyMod._isAlreadyPlaced(FIRMA_211, { lo: 84.0, hi: 90.0 }) === true);
                // 5. el codi ja no tanca la finestra amb `mk.time + 60` i sí que pregunta el final
                res.push(chySrcP.indexOf('mk.time + 60') === -1);
                res.push(/hiWin = \(nm !== null\)/.test(chySrcP) &&
                    chySrcP.indexOf('await this._itemEndTime(mk, markersFull)') !== -1);
                chyMod._placedGuard = null;
                chyMod._dupSkipped = 0;
                return res.indexOf(false) === -1;
            })(),
            'finestra ' + (chyMod ? JSON.stringify(chyMod._placedGuard) : 'sense mòdul') +
            ' +60=' + (chySrcP.indexOf('mk.time + 60') !== -1) +
            ' itemEnd=' + (chySrcP.indexOf('await this._itemEndTime(mk, markersFull)') !== -1));

        // ── P3. BUG #210 (2026-10-30): CONVERSA / XARXES-TEXT NO van al marcador ──
        // El tuit va CREMAT dins del clip de V1: el TC del nom (`00.00`) i el marcador
        // de l'ítem no diuen on va. Cas real TNV V1 29/10 i 30/10: el `[Resto]` el
        // col·locava a l'inici de l'ítem (V7) i la passada de XARXES el comptava com
        // a «ja col·locat» → mai no es rastrejava a la imatge.
        var XARXES_210 = 'Wott_TNV_V1_10_00.00_CAMPANYA ELECTORAL ACCIDENT_668645_XARXES-TEXT_tp_Gabriel Rufián_ERC_.00668981.mov';
        var CONVERSA_210 = 'Wott_TNV_V1_10_00.12_CAMPANYA_668650_CONVERSA_Oriol Junqueras.00668990.mov';
        var NOM_210 = 'Wott_TNV_V1_10_00.23_CAMPANYA ELECTORAL ACCIDENT_668937_Nomcarrec_Pedro Sánchez_president.00668984.mov';
        var FIRMA_210 = 'Wott_TNV_V1_10_01.43_CAMPANYA ELECTORAL ACCIDENT_668949_Firma_Eva Pelegrí Bobet_Marta Vila.00668992.mov';
        ok('#WOTT/62 🐞 #210: CONVERSA/XARXES-TEXT fora del bucle genèric (els rastreja XARXES) i un NomCarrec/Firma NO',
            !!chyMod && typeof chyMod._isOcrItemWott === 'function' &&
            chyMod._isOcrItemWott({ name: XARXES_210 }) === true &&
            chyMod._isOcrItemWott({ name: CONVERSA_210 }) === true &&
            chyMod._isOcrItemWott({ name: 'wott x salvador illa.00666202.mov' }) === true &&
            chyMod._isOcrItemWott({ name: NOM_210 }) === false &&
            chyMod._isOcrItemWott({ name: FIRMA_210 }) === false &&
            chyMod._isOcrItemWott({ name: 'Wott_MAT_v5_513_00.01_dona pas Barcelona_631037_Lloc_Elisabet Viladomiu.mov' }) === false &&
            chyMod._isOcrItemWott(null) === false &&
            chySrcP.indexOf('_isOcrItemWott: function (chy)') !== -1 &&
            chySrcP.indexOf('this._isOcrItemWott(c)') !== -1 &&
            chySrcP.indexOf('A LA IMATGE (CONVERSA/XARXES-TEXT) fora del bucle') !== -1,
            'ocr=' + (chyMod && typeof chyMod._isOcrItemWott) +
            ' xarxes=' + (chyMod && chyMod._isOcrItemWott({ name: XARXES_210 })) +
            ' nom=' + (chyMod && chyMod._isOcrItemWott({ name: NOM_210 })));

        } finally {
            UI.Utils.readFolder = realReadFolder;
            try { window.cep = realCep; } catch (eRc) { }
        }
    };
})();
