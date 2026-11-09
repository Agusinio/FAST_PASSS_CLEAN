/* ============================================================================
 * PROVA BUG #246 (2026-11-06) - TRADUCCIÓ QUE NO ARRIBA AL TIMELINE
 * ----------------------------------------------------------------------------
 * CAS REAL (TNV V2 06/11, ítem 17 «VAGA GENERAL A FRANÇA»): dels 3 rètols de
 * traducció del grup TC=00.58 ([1-3], [2-3], [3-3]) només se'n van col·locar
 * 2. El tercer (.00681932) era al bin i al NAS (nom IDÈNTIC, `Ç` inclosa: no
 * era cap problema d'accents) i el projecte va quedar amb un forat EXACTE al
 * 3r slot (69.40→70.12→70.84→[forat]→71.56). Què va passar:
 *   1) L'insert (`Clips.insert`) va tornar un «ERR:…» i `Utils.callJSX` el va
 *      convertir en «[]» (només `rawError: true` el deixa passar) → l'error
 *      real de Premiere s'empassava i el fracàs només s'endevinava pel
 *      `ERR_NO_CLIP` del retall posterior: sense cap pista de la causa.
 *   2) `_markPlaced` reservava el clip ABANS de l'insert: si l'insert fallava,
 *      la reserva quedava òrfena i qualsevol reintent de la mateixa traducció
 *      eixia per «dup» («ja és al timeline») sense haver-lo col·locat mai.
 *   3) El log retallava el nom a 34 caràcters, i les germanes comparteixen els
 *      primers 60 («Wott_TNV_v2_17_00.58_VAGA GENERAL A FRANÇA_681601_TRADUCCIO [»)
 *      → era impossible saber quina de les N faltava.
 * S'encadena DESPRÉS de l'última prova (mateix patró: embolcalla __runTests).
 * ==========================================================================*/
(function () {
    var orig = window.__runTests;
    window.__runTests = async function () {
        await orig();

        var ok = window.__ok;
        var UI = window.FASTPASS_UI;
        var CHY = UI.Workflows.Chyrons;
        var CL = UI.Logic.Clips;
        window.__PHASE = '29-trad-retry';

        ok('#246 motor: flow_chyrons carregat (_placeTradSlot + placeChyronTraduccio)',
            !!(CHY && typeof CHY._placeTradSlot === 'function' && typeof CHY.placeChyronTraduccio === 'function' &&
               CL && typeof CL.endCoherent === 'function'),
            'Chyrons=' + typeof CHY + ' Clips=' + typeof CL);
        if (!CHY || typeof CHY._placeTradSlot !== 'function') { return; }

        // ── MODEL DE PREMIERE + PONT JSX (mínim per a `_placeTradSlot`) ──────────
        var TL = {};                  // TL[pista] = [clip]
        var MEDIA = {};               // MEDIA[nom] = durada del mèdia
        var CALLS = [];               // crides JSX vistes
        var LAST_OPTS = null;         // opcions de l'última crida (rawError?)
        var INSERT_OPTS = [];         // opcions de CADA `Clips.insert`
        var FAIL_LEFT = 0;            // quants `Clips.insert` han de fallar (-1 = sempre)
        var LOGS = [];                // missatges de log capturats
        // (#255) Model del PROJECTE: PROJ[''] = arrel · PROJ['Conductors'] = el bin.
        // IMPORTS = crides `FASTPASS.IO.importFiles` vistes · NAS_PENDING = el que
        // «arriba» al projecte quan es fa una ingesta (la ingesta de Premiere és
        // asíncrona, així que només apareix al projecte DESPRÉS de la crida).
        var PROJ = {};
        var IMPORTS = [];
        var NAS_PENDING = [];

        function trackOf(t) { return TL[t] || (TL[t] = []); }
        function put(t, name, start, dur, media) {
            var c = { name: name, start: start, end: start + dur, inPoint: 0, outPoint: dur, media: media };
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
        var savedLog = UI.Utils.log;


        function installModel() {
            CALLS = [];
            LOGS = [];
            LAST_OPTS = null;
            INSERT_OPTS = [];
            UI.Utils.log = function (m, lvl) { LOGS.push(String(lvl || '') + ' ' + String(m)); return undefined; };
            UI.Utils.callJSX = async function (expr, opts) {
                var s = String(expr);
                CALLS.push(s);
                LAST_OPTS = opts || null;
                var m;
                if ((m = /^Clips\.insert\('([^']*)', (-?\d+), (-?[\d.]+), (null|-?[\d.]+), '(\w+)'\)$/.exec(s))) {
                    INSERT_OPTS.push(opts || null);
                    if (FAIL_LEFT === -1 || FAIL_LEFT > 0) {
                        if (FAIL_LEFT > 0) { FAIL_LEFT--; }
                        return 'ERR: overwriteClip ha fallat (simulat)';
                    }
                    var nm = m[1], media = (MEDIA[nm] === undefined) ? 5 : MEDIA[nm];
                    put(num(m[2]), nm, num(m[3]), media, media);
                    return 'OK';
                }
                if ((m = /^Clips\.at\((-?\d+), (-?[\d.]+), '(\w+)'\)$/.exec(s))) {
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
                if ((m = /^Clips\.moveToRange\((-?\d+), (\d+), (-?[\d.]+), (-?[\d.]+), '(\w+)'\)$/.exec(s))) {
                    var cv = trackOf(num(m[1]))[num(m[2])];
                    if (!cv) return 'ERR_NO_CLIP';
                    cv.start = num(m[3]); cv.end = num(m[4]);
                    return 'OK:start=' + cv.start.toFixed(3) + ',end=' + cv.end.toFixed(3);
                }
                if ((m = /^Clips\.retrim\((-?\d+), (\d+), (-?[\d.]+), (-?[\d.]+), (-?[\d.]+), '(\w+)'\)$/.exec(s))) {
                    var c = trackOf(num(m[1]))[num(m[2])];
                    if (!c) return 'ERR_NO_CLIP';
                    c.inPoint = num(m[3]); c.outPoint = num(m[4]); c.end = num(m[5]);
                    return 'OK:in=' + c.inPoint.toFixed(3) + ',out=' + c.outPoint.toFixed(3) + ',end=' + c.end.toFixed(3);
                }
                if ((m = /^Clips\.endAt\((-?\d+), (-?[\d.]+), (-?[\d.]+), '(\w+)'\)$/.exec(s))) {
                    var c2 = null, tr2 = trackOf(num(m[1])), st = num(m[2]);
                    for (var j = 0; j < tr2.length; j++) { if (Math.abs(tr2[j].start - st) < 0.05) { c2 = tr2[j]; break; } }
                    if (!c2) return 'ERR_CLIP_NOT_FOUND_AT_' + st;
                    c2.end = num(m[3]);
                    return 'OK';
                }
                if ((m = /^FASTPASS\.Project\.items\((['"])([^'"]*)\1\)$/.exec(s))) {
                    return JSON.stringify(PROJ[m[2]] || []);
                }
                if (s.indexOf('FASTPASS.IO.importFiles(') === 0) {
                    IMPORTS.push(s);
                    // La ingesta deixa l'ítem a l'ARREL (és on importa el flux real).
                    if (NAS_PENDING.length) { PROJ[''] = (PROJ[''] || []).concat(NAS_PENDING.splice(0)); }
                    return 'OK';
                }
                return 'OK';
            };
            UI.Config.get = function () {
                return {
                    tracks: { video: { chyrons: 7, tematitol: 6, lloc: 20, graficos: 3, trad: 20, mp4: 1 } },
                    traduccio: { freezeTail: false, freezeMinSec: 0.12 },
                    // (#255) `_ensureConductorInProject` llig la biblioteca del NAS i el
                    // programa actiu per a desempatar noms de conductor.
                    rutas: { conductors: '\\\\NAS\\CHYRONS CONDUCTORS\\' },
                    mapeoProgramas: {}
                };
            };
        }

        function inserts() { return CALLS.filter(function (c) { return /^Clips\.insert\(/.test(c); }); }
        function reset() {
            TL = {}; MEDIA = {}; FAIL_LEFT = 0;
            CHY._placedGuard = null;      // la guarda es rellegix del timeline (com a cada passada)
            CHY._guardAt = 0;
            CHY._dupSkipped = 0;
            installModel();
        }

        // Els noms REALS del cas TNV V2 (06/11): les germanes només canvien [i-N] i el text.
        var COMMON = 'Wott_TNV_v2_17_00.58_VAGA GENERAL A FRAN\u00c7A_681601_TRADUCCIO ';
        var W13 = COMMON + '[1-3] S\'han imposat disposicio.00681930.mov';
        var W33 = COMMON + '[3-3] de casa, avui, perqu\u00e8 se.00681932.mov';

        try {
            // ══ 1. L'INSERT FALLA UNA VEGADA → ES REINTENTA I QUEDA COL·LOCAT ═════
            reset();
            MEDIA[W33] = 10.80;
            FAIL_LEFT = 1;
            var r1 = await CHY._placeTradSlot({ chy: { name: W33 }, track: 20, start: 70.84, end: 71.56, mediaDur: 10.80, label: 'Traducci\u00f3' });
            var c1 = trackOf(20)[0];
            ok('#246 un insert FALLIT es reintenta i la traducci\u00f3 ACABA COL\u00b7LOCADA (2 intents)',
                !!r1 && r1.ok === true && !!c1 && Math.abs(c1.start - 70.84) < 1e-6 && inserts().length === 2,
                JSON.stringify(r1) + ' \u00b7 inserts=' + inserts().length + ' \u00b7 clips=' + trackOf(20).length);

            // ══ 2. El pont s'invoca amb `rawError` (l'error real ha d'eixir al log) ═
            ok('#246 l\'insert demana `rawError: true` (si no, callJSX canvia l\'ERR per \u00ab[]\u00bb)',
                INSERT_OPTS.length > 0 && INSERT_OPTS.every(function (o) { return !!o && o.rawError === true; }),
                JSON.stringify(INSERT_OPTS));
            ok('#246 el log diu QUIN insert ha fallat, amb l\'\u00edndex de la germana ([3-3])',
                LOGS.some(function (l) { return l.indexOf('insert FALLIT') !== -1 && l.indexOf('[3-3]') !== -1; }),
                LOGS.filter(function (l) { return /FALLIT/.test(l); }).join(' | '));

            // ══ 3. INSERT QUE FALLA SEMPRE: res de reserva \u00f2rfena (ni \u00abdup\u00bb fals) ═══
            reset();
            MEDIA[W33] = 10.80;
            FAIL_LEFT = -1;
            var r2 = await CHY._placeTradSlot({ chy: { name: W33 }, track: 20, start: 70.84, end: 71.56, mediaDur: 10.80, label: 'Traducci\u00f3' });
            var key = CHY._dupKey(W33);
            var guardia = (CHY._placedGuard || []).filter(function (e) { return e.k === key; });
            ok('#246 insert que falla sempre \u2192 ok:false i l\'error de Premiere ARRIBA al resultat',
                !!r2 && r2.ok === false && /ERR/i.test(String(r2.err || '')), JSON.stringify(r2));
            ok('#246 un insert fallit NO deixa reserva NO-DUPLICAR (abans bloquejava el reintent com a dup)',
                guardia.length === 0 && trackOf(20).length === 0,
                'guardia=' + guardia.length + ' \u00b7 clips=' + trackOf(20).length);

            // ══ 4. SEGONA PASSADA (el pont ja va b\u00e9): es col\u00b7loca de veritat ═══════════
            // És exactament el cas TNV V2: la [3-3] no va entrar i, en tornar a passar
            // 🎬 TRADUCCIÓ, eixe slot s'havia de poder col\u00b7locar en lloc d'eixir per dup.
            FAIL_LEFT = 0;
            CALLS = [];
            var r3 = await CHY._placeTradSlot({ chy: { name: W33 }, track: 20, start: 70.84, end: 71.56, mediaDur: 10.80, label: 'Traducci\u00f3' });
            ok('#246 reintent posterior: la traducci\u00f3 que havia fallat es col\u00b7loca (no \u00abdup\u00bb)',
                !!r3 && r3.ok === true && r3.mode === 'live' && !r3.skipped &&
                trackOf(20).length === 1 && Math.abs(trackOf(20)[0].start - 70.84) < 1e-6,
                JSON.stringify(r3) + ' \u00b7 clips=' + trackOf(20).length);

            // ══ 5. Les germanes NO es confonen al log ═══════════════════════════════
            reset();
            MEDIA[W13] = 10.80;
            FAIL_LEFT = 1;
            await CHY._placeTradSlot({ chy: { name: W13 }, track: 20, start: 69.40, end: 70.12, mediaDur: 10.80, label: 'Traducci\u00f3' });
            ok('#246 el log identifica la germana correcta ([1-3] vs [3-3]), no el prefix com\u00fa',
                LOGS.some(function (l) { return l.indexOf('[1-3]') !== -1; }) &&
                !LOGS.some(function (l) { return l.indexOf('[3-3]') !== -1; }),
                LOGS.filter(function (l) { return /FALLIT|NO inserit/.test(l); }).join(' | '));

            // ══ 6. CABLEJAT (est\u00e0tic) ═══════════════════════════════════════════════
            var srcSlot = String(CHY._placeTradSlot);
            ok('#246 `_markPlaced` va DESPR\u00c9S de `Clips.insert` (la reserva nom\u00e9s val si el clip hi \u00e9s)',
                srcSlot.indexOf('Clips.insert(') !== -1 &&
                srcSlot.indexOf('Clips.insert(') < srcSlot.indexOf('this._markPlaced('));
            ok('#246 `_placeTradSlot` reintenta l\'insert (bucle de 2 intents)',
                /for \(let att = 0; att < 2; att\+\+\)/.test(srcSlot));
            var srcTrad = String(CHY.placeChyronTraduccio);
            ok('#246 `placeChyronTraduccio` resum\u00edx les traduccions NO col\u00b7locades amb el NOM SENCER',
                /tradMissing\.push\(/.test(srcTrad) && /NO col\u00b7locada\(es\)/.test(srcTrad));
            // ══ 7. REFINAMENT #247: traducció partida pel tall (OUT al següent cort) ══
            // (2026-11-06) Si el clip de referència és molt curt i cada rètol quedaria
            // per sota del mínim (2 s per defecte), l'OUT del grup passa al SEGÜENT
            // cort de V1: detecció casolana del cas «la traducció anava a 2 clips».
            var V1C = [
                { start: 10.00, end: 11.00 },   // referència CURTA (1 s)
                { start: 11.00, end: 14.00 },   // el tall intermedi
                { start: 14.00, end: 20.00 }
            ];
            ok('#247 _tradRefSpan: slot < mínim → OUT al SEGÜENT cort (2 rètols en 1 s → 2 s)',
                (function () {
                    var r = CHY._tradRefSpan({ refStart: 10, refEnd: 11, clips: V1C, refIdx: 0, N: 2 });
                    return r.extes === true && r.jumps.length === 1 &&
                        Math.abs(r.refEnd - 14) < 1e-6 && Math.abs(r.baseEnd - 11) < 1e-6 &&
                        Math.abs(r.slotDur - 2) < 1e-6 && Math.abs(r.baseSlot - 0.5) < 1e-6;
                })());
            ok('#247 _tradRefSpan: si un cort no basta, afig el SEGÜENT (3 germanes, cas TNV V2)',
                (function () {
                    var c = [{ start: 69.68, end: 70.40 }, { start: 70.40, end: 71.12 }, { start: 71.12, end: 77.48 }];
                    var r = CHY._tradRefSpan({ refStart: 69.68, refEnd: 70.40, clips: c, refIdx: 0, N: 3 });
                    return r.extes === true && r.jumps.length === 2 &&
                        Math.abs(r.jumps[0] - 71.12) < 1e-6 && Math.abs(r.refEnd - 77.48) < 1e-6 &&
                        Math.abs(r.slotDur - (77.48 - 69.68) / 3) < 1e-6;
                })());
            ok('#247 _tradRefSpan: si el clip de referència és l\'ÚLTIM de V1 no hi ha cort → no s\'estira',
                (function () {
                    var r = CHY._tradRefSpan({ refStart: 10, refEnd: 10.5, clips: [{ start: 10, end: 10.5 }], refIdx: 0, N: 2 });
                    return r.extes === false && r.jumps.length === 0 && Math.abs(r.refEnd - 10.5) < 1e-6;
                })());
            ok('#247 _tradRefSpan: els FLASH (< 0,5 s) es salten (mateix criteri que el càlcul original)',
                (function () {
                    var c = [{ start: 10, end: 10.5 }, { start: 10.5, end: 10.8 }, { start: 10.8, end: 16 }];
                    var r = CHY._tradRefSpan({ refStart: 10, refEnd: 10.5, clips: c, refIdx: 0, N: 2 });
                    return r.jumps.length === 1 && Math.abs(r.refEnd - 16) < 1e-6;
                })());
            ok('#247 _tradRefSpan: amb un HUECO a continuació continua fins al mínim (no passa del darrer cort)',
                (function () {
                    var c = [{ start: 10, end: 11 }, { start: 11, end: 13 }, { start: 15, end: 20 }];
                    var r = CHY._tradRefSpan({ refStart: 10, refEnd: 11, clips: c, refIdx: 0, N: 2 });
                    return r.jumps.length === 2 && Math.abs(r.jumps[0] - 13) < 1e-6 &&
                        Math.abs(r.refEnd - 20) < 1e-6 && Math.abs(r.slotDur - 5) < 1e-6;
                })());
            ok('#247 _tradRefSpan: topall de 5 salts (mai es menja el programa sencer)',
                (function () {
                    var c = [];
                    for (var k = 0; k < 20; k++) c.push({ start: k, end: k + 1 });
                    var r = CHY._tradRefSpan({ refStart: 0, refEnd: 1, clips: c, refIdx: 0, N: 10 });
                    return r.jumps.length === 5 && Math.abs(r.refEnd - 6) < 1e-6 &&
                        Math.abs(r.slotDur - 0.6) < 1e-6;
                })());
            ok('#247 _tradRefSpan: `minSlotSec: 0` = comportament antic (mai estendre) i refIdx<0 tampoc',
                (function () {
                    var r0 = CHY._tradRefSpan({ refStart: 10, refEnd: 11, clips: V1C, refIdx: 0, N: 2, minSlotSec: 0 });
                    var r1 = CHY._tradRefSpan({ refStart: 10, refEnd: 11, clips: V1C, refIdx: -1, N: 2 });
                    return r0.extes === false && r1.extes === false &&
                        Math.abs(r0.refEnd - 11) < 1e-6 && Math.abs(r1.refEnd - 11) < 1e-6;
                })());
            ok('#247 _tradRefSpan: si el slot ja arriba al mínim no toca res',
                (function () {
                    var r = CHY._tradRefSpan({ refStart: 10, refEnd: 20, clips: V1C, refIdx: 0, N: 2 });
                    return r.extes === false && r.jumps.length === 0 &&
                        Math.abs(r.refEnd - 20) < 1e-6 && Math.abs(r.slotDur - 5) < 1e-6;
                })());
            ok('#247 `placeChyronTraduccio` crida `_tradRefSpan` amb el mínim de Config i ho deixa al log',
                /_tradRefSpan\(\{/.test(srcTrad) && /minSlotSec/.test(srcTrad) &&
                /OUT est.s al seg/.test(srcTrad));

            // ══ 8. BUG #254: L'INSERT NO HA DE PISAR ELS CLIPS VEÏNS ════════════════════
            // `Clips.insert` és un overwriteClip de la durada COMPLETA del mèdia: si el mèdia
            // és més llarg que el slot, la ratlla del slot i es menja el CAP del clip del
            // SEGÜENT tall de la mateixa pista (TNM V3 08/11: traduccions ja col·locades que
            // eixien pisades i retallades). Ara el veí s'aparta abans de l'insert i torna
            // EXACTAMENT al seu lloc tot seguit (moveToRange invers, sense overwriteClip).
            reset();
            put(20, 'Trad_VEINA.png', 71.60, 4.00, 4.00);   // el clip del SEGÜENT tall
            put(20, 'Trad_DINS.png', 70.50, 0.50, 0.50);    // duplicat dins del nostre slot
            var model254 = [
                { name: 'Trad_VEINA.png', start: 71.60, end: 75.60 },
                { name: 'Trad_DINS.png', start: 70.50, end: 71.00 }
            ];
            var zona254 = { next: 900 };
            var apartats = await CHY._apartarVeinsTrad({
                track: 20, slotStart: 70.00, slotEnd: 71.00, dangerEnd: 70.00 + 10.80 + 0.10,
                model: model254, zone: zona254, label: 'Traducció'
            });
            ok('#254 el veí del SEGÜENT tall s\'aparta abans de l\'insert (el mèdia passa del slot)',
                apartats.length === 1 && apartats[0].name === 'Trad_VEINA.png' &&
                Math.abs(trackOf(20)[0].start - 900) < 1e-6 && Math.abs(trackOf(20)[0].end - 904) < 1e-6,
                JSON.stringify(apartats));
            ok('#254 el clip que comença DINS del nostre slot NO s\'aparta (l\'insert l\'ha de substituir)',
                !apartats.some(function (v) { return v.name === 'Trad_DINS.png'; }) &&
                Math.abs(trackOf(20)[1].start - 70.50) < 1e-6,
                JSON.stringify(trackOf(20)));
            var tornats254 = await CHY._tornarVeinsTrad(20, apartats, 'Traducció');
            ok('#254 el veí torna EXACTAMENT al seu rang original (moveToRange invers)',
                tornats254 === 1 && Math.abs(trackOf(20)[0].start - 71.60) < 1e-6 &&
                Math.abs(trackOf(20)[0].end - 75.60) < 1e-6,
                'tornats=' + tornats254 + ' · clips=' + JSON.stringify(trackOf(20)));
            var cap254 = await CHY._apartarVeinsTrad({
                track: 20, slotStart: 70.00, slotEnd: 71.00, dangerEnd: 71.00,
                model: model254, zone: { next: 900 }, label: 'Traducció'
            });
            ok('#254 si el mèdia NO passa del slot no s\'aparta ningú (cap moviment de més)',
                cap254.length === 0 && Math.abs(trackOf(20)[0].start - 71.60) < 1e-6,
                'apartats=' + cap254.length);
            var srcTrad3 = String(CHY.placeChyronTraduccio);
            ok('#254 `placeChyronTraduccio`: aparta els veïns ABANS de l\'insert i els torna DESPRÉS',
                srcTrad3.indexOf('_apartarVeinsTrad') !== -1 &&
                srcTrad3.indexOf('_apartarVeinsTrad') < srcTrad3.indexOf('this._placeTradSlot(') &&
                srcTrad3.indexOf('_tornarVeinsTrad') > srcTrad3.indexOf('this._placeTradSlot('),
                'apartar@' + srcTrad3.indexOf('_apartarVeinsTrad') + ' · slot@' + srcTrad3.indexOf('this._placeTradSlot(') +
                ' · tornar@' + srcTrad3.indexOf('_tornarVeinsTrad'));
            ok('#254 la reparació final ja NO depèn del congelat i no descarta els slots propis (`ours`)',
                /await this\._repararClipsV7\(T_TRAD, snapTrad/.test(srcTrad3) &&
                /ours: true/.test(srcTrad3) && /!s0\.ours/.test(String(CHY._repararClipsV7)),
                'reparar=' + /await this\._repararClipsV7\(T_TRAD, snapTrad/.test(srcTrad3) +
                ' · ours=' + /ours: true/.test(srcTrad3) + ' · guarda=' + /!s0\.ours/.test(String(CHY._repararClipsV7)));
            // ══ 9. BUG #255: EL CONDUCTOR JA ÉS AL BIN «Conductors» ════════════════════
            // `FASTPASS.Project.items('')` llig NOMÉS l'ARREL (no és recursiu) i els
            // conductors viuen al seu bin: `_ensureConductorInProject` no els trobava i
            // cada clic a la DIANA tornava a importar el .mov del NAS (~200 MB per
            // xarxa) encara que ja estiguera al projecte.
            reset();
            PROJ = {
                '': [{ name: 'Conductors', type: 2 },
                     { name: 'CHY', type: 2 },
                     { name: 'seq_01', type: 4 }],
                'CHY': [{ name: 'Chyron_TemaTitol.mov', type: 1 }],
                'Conductors': [{ name: 'Conduct_TNV_Toni Cruanyes.mov', type: 1 },
                                { name: 'Conduct_TNM_Raquel Sans Duran.mov', type: 1 }]
            };
            IMPORTS = [];
            NAS_PENDING = [{ name: 'Conduct_Nuria Sole Perez.mov', type: 1 }];
            var cond255 = await CHY._ensureConductorInProject('Conduct_Toni Cruanyes.mov');
            ok('#255 el conductor que ja és al BIN «Conductors» es troba (nom antic → ítem real)',
                cond255 === 'Conduct_TNV_Toni Cruanyes.mov',
                'retorn=' + cond255);
            ok('#255 … i NO s\'importa res del NAS (abans: un .mov de ~200 MB per xarxa)',
                IMPORTS.length === 0,
                'imports=' + IMPORTS.length + ' ' + IMPORTS.join(' | '));
            ok('#255 es consulta el BIN (`Project.items` no és recursiu) i el log ho diu',
                CALLS.some(function (e) { return /^FASTPASS\.Project\.items\(["']Conductors["']\)$/.test(e); }) &&
                LOGS.some(function (l) { return l.indexOf('ja és al projecte (bin «Conductors»)') !== -1; }),
                LOGS.filter(function (l) { return l.indexOf('[Conductor]') !== -1; }).join(' | '));
            // El camí ràpid (ítem a l'arrel) no ha de pagar cap viatge als bins.
            PROJ = { '': [{ name: 'Conduct_Xavi Coral Trullas.mov', type: 1 }, { name: 'Conductors', type: 2 }],
                     'Conductors': [{ name: 'Conduct_TNV_Toni Cruanyes.mov', type: 1 }] };
            CALLS = [];
            var cond255r = await CHY._ensureConductorInProject('Conduct_Xavi Coral Trullas.mov');
            ok('#255 si el conductor ja és a l\'ARREL es retorna sense mirar cap bin (camí ràpid)',
                cond255r === 'Conduct_Xavi Coral Trullas.mov' &&
                !CALLS.some(function (e) { return /^FASTPASS\.Project\.items\(["']Conductors["']\)$/.test(e); }),
                'retorn=' + cond255r + ' · calls=' + CALLS.length);
            // Recés intacte: si no hi és ENLLOC, es importa del NAS com sempre.
            // (El harness SUBSTITUEÏX `Utils` per un stub sense `importList` ni
            //  `_decodeName` — vegeu `bin/smoke/fp_smoke_ac.js` — així que s'injecten.)
            PROJ = { '': [{ name: 'Conductors', type: 2 }], 'Conductors': [] };
            IMPORTS = [];
            NAS_PENDING = [{ name: 'Conduct_Ariadna Oltra.mov', type: 1 }];
            var savedCep = window.cep;
            var savedImportList = UI.Utils.importList;
            var savedDecode = UI.Utils._decodeName;
            window.cep = { fs: {
                readdir: function () { return { err: 0, data: ['Conduct_Ariadna Oltra.mov'] }; },
                stat: function () { return { err: 0 }; }
            } };
            UI.Utils._decodeName = function (n) { return String(n); };
            UI.Utils.importList = async function (paths, bin) {
                IMPORTS.push(String(bin) + ':' + paths.join(','));
                PROJ[''] = (PROJ[''] || []).concat(NAS_PENDING.splice(0));
                return { ok: true, sent: paths.length, chunks: 1, failed: 0, timeout: false, blocked: false };
            };
            var cond255n = await CHY._ensureConductorInProject('Conduct_Ariadna Oltra.mov');
            window.cep = savedCep;
            UI.Utils._decodeName = savedDecode;
            UI.Utils.importList = savedImportList;
            ok('#255 si el conductor NO és al projecte es manté el recés: s\'importa del NAS i es retorna',
                cond255n === 'Conduct_Ariadna Oltra.mov' && IMPORTS.length === 1,
                'retorn=' + cond255n + ' · imports=' + IMPORTS.length + ' · ' +
                LOGS.filter(function (l) { return l.indexOf('[Conductor]') !== -1 || /INGEST/i.test(l); }).join(' | '));
            var srcEns = String(CHY._ensureConductorInProject);
            ok('#255 cablejat: mira els BINS (binsDe) ABANS d\'importar del NAS, i el recurs final usa el pool',
                srcEns.indexOf('binsDe') !== -1 &&
                srcEns.indexOf('binsDe') < srcEns.indexOf('utils.importList') &&
                /pool\.find/.test(srcEns),
                'binsDe@' + srcEns.indexOf('binsDe') + ' · import@' + srcEns.indexOf('utils.importList') +
                ' · pool=' + /pool\.find/.test(srcEns));
        } finally {
            UI.Utils.callJSX = savedCallJSX;
            UI.Config.get = savedConfigGet;
            UI.Utils.log = savedLog;
            CHY._placedGuard = null;
            CHY._guardAt = 0;
        }
    };
})();

