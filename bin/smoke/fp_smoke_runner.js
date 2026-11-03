/* Runner del harness: executa els tests i bolca el resultat dins <pre id="out">. */
(function () {
    var done = false;

    // (2026-11-03 · BUG #231) Un error DEL HARNESS no pot eixir VERD. Abans, si la
    // cadena petava, es bolcava «HARNESS ASYNC ERROR» pero `__FAIL` quedava a 0 i el
    // resum del cos («PASS n FAIL 0», fet nomes de les proves que sí van correr) es
    // llegia com a verd: `check_all` reportava ALL GREEN amb 1/6 de les proves.
    // Ara qualsevol bolcament d'error passa per ací: puja el comptador (el titol ix
    // FAIL) i deixa la marca que `check_all` vigila.
    function harnessFail() {
        try { window.__FAIL = (Number(window.__FAIL) || 0) + 1; } catch (e) { /* noop */ }
        try { window.__HARNESS_FAIL = (Number(window.__HARNESS_FAIL) || 0) + 1; } catch (e) { /* noop */ }
    }

    function show(t) {
        if (done) { return; }
        done = true;
        try {
            document.getElementById('out').textContent = t;
            document.title = window.__FAIL === 0 ? 'FASTPASS SMOKE: PASS' : 'FASTPASS SMOKE: FAIL';
        } catch (e) { /* noop */ }
    }
    function dump(prefix) {
        harnessFail();
        var body;
        try { body = (typeof window.__dump === 'function') ? window.__dump() : '(sense __dump)'; }
        catch (e) { body = '(dump ha petat: ' + (e && e.message) + ')'; }
        return prefix + '\n' + body + '\nHARNESS FAIL (' + (window.__HARNESS_FAIL || 0) + ')\nERR: ' + (window.__ERR || []).join(' // ');
    }

    // Xarxa de seguretat: si la cadena de promeses es penja, bolca l'estat parcial.
    // (2026-10-16 · BUG #172) 8 s → 20 s: la prova 19-portada llig els fitxers REALS del
    // repo per `fetch('file:///…')` abans de les assercions.
    setTimeout(function () { if (!done) { show(dump('HARNESS TIMEOUT (fase: ' + (window.__PHASE || '-') + ')')); } }, 20000);

    try {
        document.getElementById('out').textContent = 'RUNNER START (' + (typeof window.__runTests) + ')';
        window.__runTests().then(
            function () { show(window.__dump()); },
            function (e) { show(dump('HARNESS ASYNC ERROR: ' + (e && e.message) + '\n' + (e && e.stack))); }
        );
    } catch (e) {
        show(dump('HARNESS SYNC ERROR: ' + (e && e.message) + '\n' + (e && e.stack)));
    }
})();
