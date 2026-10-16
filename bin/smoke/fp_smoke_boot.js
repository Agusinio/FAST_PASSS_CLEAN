/* Bootstrap: instal·la el capturador d'errors ABANS de carregar els mòduls. */
(function () {
    window.__LOG = [];
    window.__JSX = [];
    window.__FILES = {};
    window.__FOLDERS = [];
    window.__ERR = [];
    window.__R = [];
    window.__PASS = 0;
    window.__FAIL = 0;
    window.__PHASE = 'bootstrap';
    window.FASTPASS_UI = {
        Core: {}, Logic: {}, Workflows: {}, State: {},
        Config: { rutas: { destinoBase: 'C:/TMP/NAS/' } }
    };
    window.onerror = function (m, s, l, c) {
        var f = String(s || '').split('/').pop();
        window.__ERR.push(String(m) + ' @' + f + ':' + l + ':' + c);
        var o = document.getElementById('out');
        if (o) { o.textContent = 'BOOTSTRAP: error capturat\n' + window.__ERR.join('\n'); }
        return false;
    };
})();
