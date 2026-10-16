/* Runner del harness: executa els tests i bolca el resultat dins <pre id="out">. */
(function () {
    var done = false;
    function show(t) {
        if (done) { return; }
        done = true;
        try {
            document.getElementById('out').textContent = t;
            document.title = window.__FAIL === 0 ? 'FASTPASS SMOKE: PASS' : 'FASTPASS SMOKE: FAIL';
        } catch (e) { /* noop */ }
    }
    function dump(prefix) {
        var body;
        try { body = (typeof window.__dump === 'function') ? window.__dump() : '(sense __dump)'; }
        catch (e) { body = '(dump ha petat: ' + (e && e.message) + ')'; }
        return prefix + '\n' + body + '\nERR: ' + (window.__ERR || []).join(' // ');
    }

    // Xarxa de seguretat: si la cadena de promeses es penja, bolca l'estat parcial.
    setTimeout(function () { if (!done) { show(dump('HARNESS TIMEOUT (fase: ' + (window.__PHASE || '-') + ')')); } }, 8000);

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
