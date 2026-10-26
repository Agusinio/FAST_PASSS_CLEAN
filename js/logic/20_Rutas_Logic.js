/**
 * ============================================================================
 * 20_Rutas_Logic.js - RESOLUTOR DE RUTES amb variables (F2)
 * ============================================================================
 * PER QUE EXISTEIX (2026-10-21)
 *   F2 demana que CAP ruta de treball viva al codi: totes han de vindre de la
 *   configuracio de l'usuari (Profile.json -> Config.get().rutas) i, quan porten
 *   variables, s'han de poder resoldre amb el context del bloc.
 *
 *   Aci viu la part PURA (sense DOM, sense CEP, sense IO):
 *     - resolve / resolveDetailed: substitueix {tokens} pel context.
 *     - mergeProfile: fong el Profile.json damunt dels valors per defecte.
 *     - normalizeRutas: alies i rutes DERIVADES (perfils desplegats vells).
 *   El prova bin/smoke/fp_probe_rutas.js.
 *
 * TOKENS
 *   {autor} {prog} {archivo} {wott} {bloque} {fecha} {tema} {base} {project}
 *   - {fecha} accepta YYYY_MM_DD, YYYY-MM-DD i DD_MM_YYYY -> YYYY_MM_DD
 *   - {base} es la carpeta arrel dels projectes (rutas.projectes/destino_base)
 *   - {prog} es l'ID del programa (TNV), {archivo} el nom d'arxiu (TN_VESPRE),
 *     {wott} el prefix de wott (TNV), {tema} el tema ja sanejat
 *   - {project} es el NOM DEL PROJECTE (.prproj) tal com el genera
 *     Config.getProjectName: <archivo>_<bloque>_<autor>_<MMYYYY>_<tema>
 *     (s'usa a les rutes d'exportacio: {base}\{project}, render1/render2...)
 *
 * CRITERI
 *   `resolve()` (produccio) NO deixa mai un {token} dins d'una ruta: si no hi ha
 *   valor, el lleva i la ruta queda tan neta com siga possible.
 *   `resolveDetailed()` conserva el token literal i diu quin falta, perque la
 *   finestra de configuracio puga avisar («falta {tema}»).
 * ============================================================================
 */
(function () {
    var FASTPASS_UI = window.FASTPASS_UI || {};
    FASTPASS_UI.Logic = FASTPASS_UI.Logic || {};

    var BS = String.fromCharCode(92);          // barra invertida
    var BS2 = BS + BS;                         // prefix UNC (\\servidor\recurs)

    var TOKENS = ['autor', 'prog', 'archivo', 'wott', 'bloque', 'fecha', 'tema', 'base', 'project'];

    function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
    function pad2(n) { n = parseInt(n, 10); return ((n < 10) ? '0' : '') + n; }
    function str(v) { return (v == null) ? '' : String(v); }
    function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

    /**
     * normalize: ruta en forma Windows canonica.
     *  - '/' i '\' -> '\'
     *  - separadors repetits -> un (RESPECTANT el prefix UNC \\servidor)
     *  - sense separador final (excepte 'C:\', que es arrel)
     */
    function normalize(p) {
        var t = str(p).replace(/\//g, BS);
        if (!t) return '';
        var unc = (t.indexOf(BS2) === 0);
        if (unc) t = t.slice(2);
        t = t.replace(/\\{2,}/g, BS);
        t = t.replace(/\\+$/, '');
        if (/^[A-Za-z]:$/.test(t)) t += BS;
        return unc ? (BS2 + t) : t;
    }

    /**
     * join: concatena dos trossos de ruta. Si `b` es absoluta (UNC o 'C:...'),
     * guanya `b` (evita el '/'+absolut de path.join, que seria un error silencios).
     */
    function join(a, b) {
        var A = normalize(a);
        var B = normalize(b);
        if (!B) return A;
        if (B.charAt(0) === BS || /^[A-Za-z]:/.test(B)) return B;
        if (!A) return B;
        return normalize(A + BS + B);
    }

    /**
     * fechaOf: data en format de CARPETA (YYYY_MM_DD).
     * Accepta 'YYYY_MM_DD', 'YYYY-MM-DD', 'YYYY/MM/DD' i 'DD_MM_YYYY'.
     * Retorna '' si no es una data reconeixible (no inventa res).
     */
    function fechaOf(v) {
        var t = str(v).trim();
        if (!t) return '';
        var m = t.match(/^(\d{4})[_\/\-](\d{1,2})[_\/\-](\d{1,2})$/);
        if (m) return m[1] + '_' + pad2(m[2]) + '_' + pad2(m[3]);
        m = t.match(/^(\d{1,2})[_\/\-](\d{1,2})[_\/\-](\d{4})$/);
        if (m) return m[3] + '_' + pad2(m[2]) + '_' + pad2(m[1]);
        return '';
    }

    /** tokensIn: tokens {x} que apareixen a la plantilla (sense repetir, en ordre). */
    function tokensIn(tpl) {
        var t = str(tpl), out = [], re = /\{([A-Za-z_]+)\}/g, m;
        while ((m = re.exec(t))) {
            if (out.indexOf(m[1]) < 0) out.push(m[1]);
        }
        return out;
    }

    /**
     * projectOf: NOM DEL PROJECTE (.prproj) derivat del context. Formula IDENTICA
     * a Config.getProjectName: <archivo>_<bloque>_<autor>_<MMYYYY>_<tema>.
     * Si falta el tema no s'inventa res (el token queda sense valor i
     * resolveDetailed ho diu): una ruta d'exportacio no ha d'acabar en una
     * carpeta compartida per tots els temes.
     * @param {Object} v - valors ja resolts de valuesOf
     * @returns {string}
     */
    function projectOf(v) {
        var tema = str(v.tema).trim();
        if (!tema) return '';
        var parts = [str(v.archivo), str(v.bloque), (str(v.autor).trim() || 'USER')];
        var f = str(v.fecha).split('_');
        if (f.length === 3) parts.push(f[1] + f[0]);      // MMYYYY (com getProjectName)
        parts.push(tema);
        return parts.join('_');
    }

    /**
     * valuesOf: valors dels tokens a partir del context.
     * El context pot vindre de dos llocs i accepta els dos noms de cada camp:
     *   - ctx.progData = {id, archivo, wott} (el mateix objecte de 4_Context)
     *   - ctx.bloque o ctx.bloc
     *   - ctx.fecha o ctx.dateDir ('2026_10_21')
     *   - ctx.tema o ctx.sanitizedTema
     *   - ctx.base o ctx.destinoBase (Config.resolvePath hi posa el de la config)
     * `project` es DERIVAT dels altres (no ve del context).
     */
    function valuesOf(ctx) {
        var c = ctx || {};
        var prog = c.progData || {};
        var vals = {
            autor: str(c.autor),
            prog: (c.prog != null ? str(c.prog) : str(prog.id)),
            archivo: (c.archivo != null ? str(c.archivo) : str(prog.archivo)),
            wott: (c.wott != null ? str(c.wott) : str(prog.wott)),
            bloque: str(c.bloque != null ? c.bloque : c.bloc),
            fecha: fechaOf(c.fecha != null ? c.fecha : c.dateDir),
            tema: str(c.tema != null ? c.tema : c.sanitizedTema),
            base: str(c.base != null ? c.base : c.destinoBase)
        };
        vals.project = projectOf(vals);
        return vals;
    }

    /**
     * resolveDetailed: resol la plantilla i RETORNA tambe el diagnostic.
     * @returns {{out:string, missing:string[], unknown:string[], tokens:string[]}}
     *   - missing: tokens coneguts sense valor al context (es queden literals)
     *   - unknown: tokens que no existeixen (es queden literals)
     */
    function resolveDetailed(tpl, ctx) {
        var tplS = str(tpl);
        var vals = valuesOf(ctx);
        var missing = [], unknown = [];
        var out = tplS.replace(/\{([A-Za-z_]+)\}/g, function (tot, key) {
            if (TOKENS.indexOf(key) < 0) {
                if (unknown.indexOf(key) < 0) unknown.push(key);
                return tot;
            }
            var v = str(vals[key]);
            if (!v) {
                if (missing.indexOf(key) < 0) missing.push(key);
                return tot;
            }
            return v;
        });
        return { out: normalize(out), missing: missing, unknown: unknown, tokens: tokensIn(tplS) };
    }

    /** resolve: versio de PRODUCCIO (cap token dins de la ruta final). */
    function resolve(tpl, ctx) {
        var d = resolveDetailed(tpl, ctx);
        if (!d.missing.length && !d.unknown.length) return d.out;
        var out = d.out;
        d.missing.concat(d.unknown).forEach(function (k) {
            out = out.split('{' + k + '}').join('');
        });
        return normalize(out);
    }

    // ── FUSIO DEL PERFIL (Profile.json damunt dels defaults) ────────────────
    function clone(v) {
        if (Array.isArray(v)) {
            var a = [];
            for (var i = 0; i < v.length; i++) a.push(clone(v[i]));
            return a;
        }
        if (isObj(v)) {
            var o = {};
            for (var k in v) { if (own(v, k)) o[k] = clone(v[k]); }
            return o;
        }
        return v;
    }

    function mergeDeep(dst, src) {
        if (!isObj(src)) return dst;
        for (var k in src) {
            if (!own(src, k)) continue;
            var v = src[k];
            if (isObj(v)) {
                if (!isObj(dst[k])) dst[k] = {};
                mergeDeep(dst[k], v);
            } else if (v !== undefined) {
                // Els ARRAYS es REEMPLACEN sencers (una llista de programes del
                // perfil no s'ha de barrejar amb la de codi: ordre i baixes compten).
                dst[k] = clone(v);
            }
        }
        return dst;
    }

    /**
     * mergeProfile: objecte NOU = defaults clonats + perfil fongut.
     * No toca `defaults` (aixo permet recarregar el perfil N voltes i que llevar
     * una clau del Profile.json torne al valor de fabrica).
     */
    function mergeProfile(defaults, profile) {
        var base = clone(isObj(defaults) ? defaults : {});
        return mergeDeep(base, isObj(profile) ? profile : {});
    }

    function firstNonEmpty() {
        for (var i = 0; i < arguments.length; i++) {
            var v = str(arguments[i]).trim();
            if (v) return v;
        }
        return '';
    }

    /**
     * normalizeRutas: alies i rutes DERIVADES.
     * (2026-10-23) `destino_base` es l'AUTORITATIVA (es la clau que desa la
     * finestra de configuracio) i es reflecteix a `projectes`, que es el nom
     * historic amb que la llig la resta del codi.
     * S'han RETIRAT les rutes derivades de la carpeta antiga de media i les
     * carpetes d'escaletes del NAS: cap consumidor les fa servir.
     */
    function normalizeRutas(rutas) {
        var r = isObj(rutas) ? rutas : {};
        var out = {};
        for (var k in r) { if (own(r, k)) out[k] = r[k]; }

        // 0) Claus mortes: un Profile.json vell no les ha de reintroduir.
        delete out.vertical;
        delete out.escaletes;
        delete out.escaletes_domini;

        // 1) destino_base <-> projectes (son la MATEIXA ruta, dos noms)
        out.destino_base = firstNonEmpty(out.destino_base, out.projectes);
        out.projectes = firstNonEmpty(out.destino_base, out.projectes);

        // 2) subtitulosSinteticos: es deriva de subtitulos (mai de vertical)
        if (!str(out.subtitulosSinteticos).trim() && str(out.subtitulos).trim()) {
            out.subtitulosSinteticos = join(out.subtitulos, 'SINTETICS');
        }

        // 3) forma canonica de TOTES les rutes. IMPORTANT: es RESPECTA el
        //    separador final si ja hi era. Mig modul concatena amb `+` sense
        //    posar separador (`${rutas.conductors}${fitxer}` a 14_Assembly_Logic,
        //    `rutas.destinoBase + progDir` a utils.workFolder): llevar-lo
        //    trencaria les rutes en silenci.
        for (var key in out) {
            if (!own(out, key) || typeof out[key] !== 'string') continue;
            var orig = out[key];
            var keepTrail = /[\\\/]$/.test(orig);
            out[key] = normalize(orig);
            if (keepTrail && out[key] && out[key].charAt(out[key].length - 1) !== BS) out[key] += BS;
        }
        return out;
    }

    FASTPASS_UI.Logic.Rutas = {
        TOKENS: TOKENS,
        BS: BS,
        normalize: normalize,
        join: join,
        fechaOf: fechaOf,
        tokensIn: tokensIn,
        valuesOf: valuesOf,
        resolveDetailed: resolveDetailed,
        resolve: resolve,
        clone: clone,
        mergeProfile: mergeProfile,
        normalizeRutas: normalizeRutas
    };

    window.FASTPASS_UI = FASTPASS_UI;
})();
