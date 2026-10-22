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
        var realNodeFs = UI.Utils._nodeFs;
        var realReadFolder = UI.Utils.readFolder;
        var realCep = window.cep;

        UI.Utils._nodeFs = function () {
            return {
                promises: {
                    readdir: function () {
                        readdirCalls++;
                        if (failMode) return Promise.reject(new Error('SMB KO'));
                        return Promise.resolve(Object.keys(files));
                    },
                    stat: function (p) {
                        statCalls++;
                        var name = String(p).split(BS).pop();
                        if (!(name in files)) return Promise.reject(new Error('ENOENT'));
                        return Promise.resolve({ birthtime: new Date(files[name]), mtimeMs: files[name], size: 1 });
                    }
                }
            };
        };
        UI.Utils.readFolder = function () { return Promise.resolve(null); };
        try { window.cep = undefined; } catch (eCep) { }

        function localMs(y, m, d, h) { return new Date(y, m - 1, d, h || 12, 0, 0).getTime(); }
        function reset(dates) {
            Scan._wottDateCache = dates ? {} : null;
            Scan._wottProbeCache = null;
            Scan._mp4ProbeCache = null;      // (2026-10-21 · #177) MP4 origen del bloc
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
                    r1.ok && r1.found && r1.count === 2 && r1.via === 'node',
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
                ctxSrc.indexOf('runMainAction(actA, dataA)') > iYest,
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

            // ── J. MP4 ORIGEN: la segona sonda dels 3 estats (2026-10-21 · #177) ──
            // MASSA D'HORA (ni MP4 ni wotts) ≠ ESPERA (MP4 sí, wotts no) ≠ CREA.
            // `mp4Today` ha de ser BARAT: noms per Node i stat NOMÉS dels candidats
            // que no porten data al nom.
            ok('#WOTT/14 Scanner.mp4Today carregat (sonda del MP4 origen, sense escaneig ExtendScript)',
                !!(Scan && typeof Scan.mp4Today === 'function'), 'mp4Today=' + !!(Scan && Scan.mp4Today));
            if (Scan && typeof Scan.mp4Today === 'function') {
                var MV = 'Y:' + BS + 'VERT' + BS;
                var ctxM = {
                    config: { rutas: { verticalitzacio: MV } },
                    progData: { archivo: 'TN_VESPRE', wott: 'TNV' },
                    bloque: 'V1',
                    dateDir: '2026_10_21'
                };
                var M_AVUI   = 'TN_VESPRE_V1_20261021_1200.mp4';
                var M_AHIR   = 'TN_VESPRE_V1_20261020_1200.mp4';
                var M_SENSE  = 'TN_VESPRE_V1_INGESTA.mp4';     // sense data al nom → birthtime
                var M_ALTRE  = 'TN_MIGDIA_V1_20261021_1200.mp4'; // altre bloc → fora

                files = {};
                files[M_AVUI]  = localMs(2026, 10, 21, 12);
                files[M_AHIR]  = localMs(2026, 10, 20, 12);
                files[M_SENSE] = localMs(2026, 10, 21, 13);
                files[M_ALTRE] = localMs(2026, 10, 21, 12);
                reset(true);
                var m1 = await Scan.mp4Today(ctxM);
                ok('#WOTT/15 mp4Today: 2 MP4 del bloc+dia (nom amb data i nom sense data per birthtime)',
                    m1.ok && m1.found && m1.via === 'node' && statCalls === 1,
                    'ok=' + m1.ok + ' found=' + m1.found + ' via=' + m1.via + ' stats=' + statCalls);
                var m2 = await Scan.mp4Today(ctxM);
                ok('#WOTT/16 mp4Today: segona crida de memòria curta (0 readdir, 0 stats)',
                    m2.found && readdirCalls === 1 && statCalls === 1,
                    'readdir=' + readdirCalls + ' stats=' + statCalls);

                files = {};
                files[M_AHIR] = localMs(2026, 10, 20, 12);
                reset(true);
                var m3 = await Scan.mp4Today(ctxM);
                ok('#WOTT/17 mp4Today: l MP4 d ahir no compta (ok però found=false → MASSA D\'HORA)',
                    m3.ok === true && m3.found === false && !m3.name,
                    'ok=' + m3.ok + ' found=' + m3.found);

                files = {};
                files[M_AVUI] = localMs(2026, 10, 21, 12);
                reset(true);
                failMode = true;
                var m4 = await Scan.mp4Today(ctxM);
                ok('#WOTT/18 mp4Today: si no es pot llistar → ok=false (no es pot afirmar MASSA D\'HORA)',
                    m4.ok === false && m4.found === false, 'ok=' + m4.ok + ' via=' + (m4.via || '-'));
                failMode = false;
            }

            // ── K. ARRENCADA SENSE Ctrl = AVUI + 3 ESTATS (2026-10-21 · #177) ──
            // Sense Ctrl NO es pot carregar el projecte d'AHIR ni que el panell haja
            // quedat obert de la nit abans amb eixe projecte: `projectDateDir` només
            // mana en el mode correcció (després del retorn de la data d'avui).
            var iStrict = ctxSrc.indexOf('if (!useYesterday) return todayYmd;');
            var iProj = ctxSrc.indexOf('St.projectDateDir && St.projectDateDir !== todayYmd');
            ok('#WOTT/19 _targetDateDir: sense Ctrl la data és AVUI (projectDateDir només amb Ctrl)',
                iStrict > 0 && iProj > iStrict, 'strict=' + iStrict + ' projectDate=' + iProj);
            ok('#WOTT/20 checkContext: ESPERA quan hi ha MP4 origen i encara no wotts (sonda _mediaToday)',
                ctxSrc.indexOf('_mediaToday') > 0 && ctxSrc.indexOf("earlyState = 'ESPERANT'") > 0 &&
                /else if \(mp4\.found\)/.test(ctxSrc),
                'media=' + (ctxSrc.indexOf('_mediaToday') > 0) +
                ' esperant=' + (ctxSrc.indexOf("earlyState = 'ESPERANT'") > 0));
            ok('#WOTT/21 checkContext: MASSA D\'HORA només si el llistat diu que NO hi ha MP4 (mp4.ok)',
                /else if \(mp4\.ok\)/.test(ctxSrc) && ctxSrc.indexOf("earlyState = 'MASSA'") > 0);
            ok('#WOTT/22 botó MAIN: etiquetes CREA / ESPERA (i cap rastre del vell "CREAR permès")',
                ctxSrc.indexOf('btn.innerText = "CREA"') > 0 &&
                ctxSrc.indexOf('btn.innerText = "ESPERA"') > 0 &&
                ctxSrc.indexOf('CREAR permès') === -1);
            var chySrc = await readRepo('js/workflows/flow_chyrons.js');
            ok('#WOTT/23 flow_chyrons: la DURADA del wott descompta 1 frame abans d\'inserir-lo',
                /if \(placeEnd !== null && \(placeEnd - slot\.start\) > REV_FRAME \+ 0\.001\) \{/.test(chySrc) &&
                /placeEnd = gridDown\(placeEnd - REV_FRAME\);/.test(chySrc));
            var idxW = await readRepo('index.html');
            ok('#WOTT/24 cache-bust del #177 (4_Context 28, flow_chyrons 82, Scanner 16)',
                /4_Context\.js\?v=28/.test(idxW) && /flow_chyrons\.js\?v=82/.test(idxW) &&
                /Scanner\.js\?v=16/.test(idxW),
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
            var fastFs = UI.Utils._nodeFs;
            UI.Utils._nodeFs = function () {
                return {
                    promises: {
                        readdir: function () {
                            readdirCalls++;
                            return new Promise(function (res) {
                                setTimeout(function () { res(Object.keys(files)); }, 25);
                            });
                        },
                        stat: function (p) {
                            statCalls++;
                            var n = String(p).split(BS).pop();
                            return Promise.resolve({ birthtime: new Date(files[n] || 0) });
                        }
                    }
                };
            };
            var tri = await Promise.all([Scan.wottsToday(ctxBase), Scan.wottsToday(ctxBase), Scan.wottsToday(ctxBase)]);
            UI.Utils._nodeFs = fastFs;
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
            ok('#WOTT/28 sondes del NAS: espera limitada (PROBE_TIMEOUT_MS) i en PARAL·LEL',
                /PROBE_TIMEOUT_MS: 8000/.test(ctxSrc) &&
                /this\._withTimeout\(sc\.wottsToday\(ctx\), this\.PROBE_TIMEOUT_MS/.test(ctxSrc) &&
                /this\._withTimeout\(sc\.mp4Today\(ctx\), this\.PROBE_TIMEOUT_MS/.test(ctxSrc) &&
                /Promise\.all\(\[this\._wottsToday\(ctx\), this\._mediaToday\(ctx\)\]\)/.test(ctxSrc) &&
                ctxSrc.indexOf('const mp4 = await this._mediaToday(ctx)') === -1);
            var scanSrc = await readRepo('js/logic/Scanner.js');
            ok('#WOTT/29 Scanner: dedupe (_probeInflight/_probeKey) i marques [SCAN] a l arrencada',
                /_probeKey: function \(ctx, kind\)/.test(scanSrc) &&
                /_probeInflight\[key\] = p;/.test(scanSrc) &&
                scanSrc.indexOf("_bm('wotts · llistat (") > 0 &&
                scanSrc.indexOf("_bm('MP4 · datació (") > 0 &&
                scanSrc.indexOf("_bm('wotts · datació (") > 0);
        } finally {
            UI.Utils._nodeFs = realNodeFs;
            UI.Utils.readFolder = realReadFolder;
            try { window.cep = realCep; } catch (eRc) { }
        }
    };
})();
