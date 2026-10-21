# ============================================================================
# fp_probe_setup_ui.ps1 · Prova de la FINESTRA DE CONFIG (setup.html)
# ----------------------------------------------------------------------------
# (2026-10-21) Neix del BUG #176: `setup.html` carregava `./lib/CSInterface.js`
# (carpeta inexistent) en lloc de `js/lib/CSInterface.js` i la finestra eixia
# completament BUIDA sense cap error visible.
#
# Que fa:
#   1) GUARDA ESTATICA: tots els `<script src>` de setup.html/index.html han
#      d'existir al disc (un 404 deixa el panell mort i silencios).
#   2) GUARDA ESTATICA: la targeta de programes te la columna CARPETA (`dir`) i
#      `addProg` crea el programa amb `dir`.
#   3) DOM REAL: copia setup.html a %TEMP%, li injecta els stubs de CEP
#      (`__adobe_cep__` amb `evalScript` que torna el Profile.json real, i
#      `FASTPASS_UI`) i el passa per Edge headless (`--dump-dom`). Comprova files
#      de la targeta, capcalera, 6 columnes (id/archivo/dir/wott/conductor/
#      esborrar), valor de `dir` de TNs i de MATINS i que no desbordi.
#
# Us: powershell -NoProfile -ExecutionPolicy Bypass -File .\bin\smoke\fp_probe_setup_ui.ps1
#     (exit code 0 = tot OK, 1 = algun FAIL)
# ============================================================================
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tmp  = if ($env:TEMP) { $env:TEMP } else { 'c:\Users\gonz_agu\AppData\Local\Temp' }
$browser = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'

$script:ok = 0
$script:fail = 0
function ok([string]$name, [bool]$cond, [string]$detail) {
    if ($cond) { $script:ok++; Write-Host ("OK   {0}" -f $name) }
    else { $script:fail++; Write-Host ("FAIL {0}   -> {1}" -f $name, $detail) }
}

$setupPath = Join-Path $repo 'setup.html'
$setup = [System.IO.File]::ReadAllText($setupPath, [System.Text.Encoding]::UTF8)

# ── 1. GUARDA ESTATICA: rutes dels <script src> ────────────────────────────
foreach ($page in @('setup.html', 'index.html')) {
    $txt = [System.IO.File]::ReadAllText((Join-Path $repo $page), [System.Text.Encoding]::UTF8)
    $missing = @()
    foreach ($m in [regex]::Matches($txt, '<script[^>]+src="([^"]+)"')) {
        $src = $m.Groups[1].Value
        if ($src -match '^(https?:|file:|//)') { continue }
        $rel = ($src -replace '\?.*$', '') -replace '/', '\'
        if (-not (Test-Path (Join-Path $repo $rel))) { $missing += $src }
    }
    ok ("#SETUP/1 {0}: tots els <script src> existeixen" -f $page) ($missing.Count -eq 0) ($missing -join ', ')
}

# ── 2. GUARDA ESTATICA: columna `dir` a la targeta ────────────────────────
ok '#SETUP/2 setup.html: columna CARPETA (dir) + addProg amb dir' `
    (([regex]::IsMatch($setup, 'CARPETA \(dir\)')) -and ([regex]::IsMatch($setup, "'dir', this\.value")) -and ([regex]::IsMatch($setup, 'dir: ""'))) `
    'falta capçalera, input o valor per defecte'

# ── 3. GUARDA ESTATICA: cache-bust de l'iframe ────────────────────────────
$fc = [System.IO.File]::ReadAllText((Join-Path $repo 'js\workflows\flow_config.js'), [System.Text.Encoding]::UTF8)
ok '#SETUP/2b flow_config carrega setup.html amb cache-bust (?v=)' `
    ([regex]::IsMatch($fc, "setup\.html\?v=\d+")) 'sense ?v= CEF pot servir una copia vella de setup.html'

# ── 3b. GUARDA ESTATICA: full d'estils compacte (2026-10-21) ──────────────
# El dashboard tenia el CSS incrustat amb lletra de 13px, targetes de 15px de
# padding i 20px entre blocs: es veia GRAN i espaiat al costat del panell. Ara
# la metrica (11px, #151515/#222/#333/#007acc) ve de setup.css.
$cssPath = Join-Path $repo 'setup.css'
$css = if (Test-Path $cssPath) { [System.IO.File]::ReadAllText($cssPath, [System.Text.Encoding]::UTF8) } else { '' }
ok '#SETUP/2c setup.html carrega setup.css i el fitxer existeix' `
    (([regex]::IsMatch($setup, '<link[^>]+href="setup\.css\?v=\d+"')) -and $css.Length -gt 0) `
    'sense <link setup.css?v=> o sense el fitxer'
$mainCss = [System.IO.File]::ReadAllText((Join-Path $repo 'style.css'), [System.Text.Encoding]::UTF8)
ok '#SETUP/2d lletra base 11px igual que la vista principal' `
    (([regex]::IsMatch($css, '--fs:\s*11px')) -and ([regex]::IsMatch($css, 'font-size:\s*var\(--fs\)')) -and `
     ([regex]::IsMatch($mainCss, '(?m)^\s*font-size:\s*11px;')) -and -not ([regex]::IsMatch($setup, 'font-size:\s*13px'))) `
    'setup.css no fixa 11px (o setup.html encara te estils grans incrustats)'

$profileRaw = [System.IO.File]::ReadAllText((Join-Path $repo 'Profile.json'), [System.Text.Encoding]::UTF8)
$profileJs  = ConvertTo-Json $profileRaw -Compress
$libUrl = 'file:///' + ($repo -replace '\\', '/') + '/js/lib/CSInterface.js'
$html = $setup.Replace('src="js/lib/CSInterface.js"', 'src="' + $libUrl + '"')
# (2026-10-21) Els estils ja NO viuen dins de setup.html: estan a `setup.css`.
# En la copia de %TEMP% el <link> relatiu no resol, així que l'apuntem al fitxer
# REAL del repo — així la prova mesura graella, lletra i desbordament amb el CSS
# de debò (si no, `getComputedStyle` tornaria els valors per defecte).
$cssUrl = 'file:///' + ($repo -replace '\\', '/') + '/setup.css'
$html = [regex]::Replace($html, '<link[^>]+href="setup\.css[^"]*"[^>]*>', '<link rel="stylesheet" href="' + $cssUrl + '">')

$stub = @'
<script>
window.__PROFILE_JS__ = __PROFILE__;
window.__writes = [];
window.__evals = [];
window.__alerts = [];
window.__adobe_cep__ = {
  getHostEnvironment: function(){ return JSON.stringify({ appName: 'PPRO', appVersion: '25.0', appLocale: 'ca_ES', appUILocale: 'ca_ES' }); },
  getSystemPath: function(p){ return (p === 'myDocuments') ? 'C:\\Users\\probe\\Documents' : 'C:\\FAKE_EXT'; },
  evalScript: function(js, cb){ window.__evals.push(String(js)); if (cb) { cb(window.__PROFILE_JS__ || 'ERR'); } },
  addEventListener: function(){}, removeEventListener: function(){}, dispatchEvent: function(){},
  getExtensions: function(){ return '[]'; }, getExtensionId: function(){ return 'com.fastpass.panel'; },
  getScaleFactor: function(){ return 1; }, getMonitorScaleFactor: function(){ return 1; },
  getCurrentApiVersion: function(){ return '9.0'; }, getHostCapabilities: function(){ return '{}'; },
  invokeSync: function(){ return '{}'; }, invokeAsync: function(){}, resizeContent: function(){},
  initResourceBundle: function(){}, registerKeyEventsInterest: function(){},
  setScaleFactorChangedHandler: function(){}, requestOpenExtension: function(){}, dumpInstallationInfo: function(){}
};
// (2026-10-21) `cep.fs` de mentida: el dashboard llig i escriu el perfil SENSE
// passar per l'evalScript (era la causa de l'«EvalScript error» en desar).
window.cep = {
  fs: {
    readFile: function(){ var w = window.__writes || []; return { err: 0, data: w.length ? w[w.length - 1].data : window.__PROFILE_JS__ }; },
    writeFile: function(p, d){ window.__writes.push({ path: p, data: String(d) }); return { err: 0 }; },
    readdir: function(p){
      var T = {
        'C:\\Users\\probe\\Documents': ['Projectes', 'notes.txt'],
        'C:\\Users\\probe\\Documents\\Projectes': ['BLOC1', 'BLOC2'],
        'C:\\': ['Users', 'Windows'],
        '\\\\srv\\share\\rutes': ['2026_10_21', 'llegeix-me.txt'],
        '\\\\srv\\share\\rutes\\2026_10_21': ['TN_MIGDIA']
      };
      var keys = Object.keys(T);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].toLowerCase() === String(p).toLowerCase()) return { err: 0, data: T[keys[i]] };
      }
      return { err: 1, data: [] };
    },
    showOpenDialog: function(multi, chooseDir, title, initial){
      window.__openDlg = window.__openDlg || [];
      window.__openDlg.push({ chooseDir: !!chooseDir, initial: String(initial == null ? '' : initial) });
      return { err: 0, data: ['\\\\srv\\share\\rutes'] };
    }
  }
};
window.alert = function(m){ window.__alerts.push(String(m)); };
window.confirm = function(){ return true; };
window.FASTPASS_UI = {
  Config: { get: function(){ return { rutas: { escaletes: 'X', destinoBase: 'Y' }, mapeoProgramas: {} }; } },
  Workflows: { Config: { toggleSetup: function(){ window.__closedBySave = true; } } },
  Logic: {}, Core: {}, Utils: {}
};
window.CSXSEvent = function(n, s){ this.type = n; this.scope = s; };
</script>
'@
$stub = $stub.Replace('__PROFILE__', $profileJs)
$html = $html.Replace('<script src="' + $libUrl + '"></script>', '<script src="' + $libUrl + '"></script>' + $stub)


$check = @'
<pre id="out">RUNNING</pre>
<script>
function vals(row) {
  return Array.prototype.map.call(row.querySelectorAll('input'), function (i) { return i.value; }).join(' | ');
}
setTimeout(function () {
  var out = [];
  try {
    var cont = document.getElementById('TNs');
    var rows = cont.querySelectorAll('.program-row');
    out.push('TN rows=' + rows.length);
    out.push('TN head=' + (rows[0] ? rows[0].textContent.replace(/\s+/g, ' ').trim() : '(cap)'));
    if (rows[1]) {
      var ins = rows[1].querySelectorAll('input');
      var cs = getComputedStyle(rows[1]);
      out.push('TN inputs=' + ins.length);
      out.push('TN vals=' + vals(rows[1]));
      out.push('TN cols=' + cs.gridTemplateColumns.split(' ').length);
      out.push('TN overflow=' + (rows[1].scrollWidth > rows[1].clientWidth + 1));
      out.push('TN dir=' + ins[2].value);
      out.push('TN dirTitle=' + (ins[2].title ? 'si' : 'NO'));
    }
    var mr = document.getElementById('Sumari Matins').querySelectorAll('.program-row');
    out.push('MATINS rows=' + mr.length);
    if (mr[1]) { out.push('MATINS vals=' + vals(mr[1])); }
    var f = document.getElementById('val-autor');
    var d = document.getElementById('path-destino_base');
    out.push('camp autor=' + JSON.stringify(f ? f.value : null));
    out.push('camp destino=' + JSON.stringify(d ? d.value : null));
    out.push('FS body=' + getComputedStyle(document.body).fontSize);
    out.push('FS input=' + (f ? getComputedStyle(f).fontSize : '?'));
    out.push('addProg dir=' + /dir: ""/.test(String(window.addProg)));
  } catch (e) { out.push('EXCEPCIO=' + (e && e.message)); }
  document.getElementById('out').textContent = out.join('\n');
}, 700);
</script>
'@
$check2 = @'
<pre id="out2">RUNNING2</pre>
<script>
setTimeout(function () {
  var o = [];
  function paint() { document.getElementById('out2').textContent = o.join('\n'); }
  try {
    // ── 1. BOTÓ 📁: diàleg NATIU del sistema (accessos ràpids de l'Explorador) ──
    window.browseFolder('path-destino_base');
    var od = window.__openDlg || [];
    o.push('P native=' + od.length);
    o.push('P chooseDir=' + (od[0] ? od[0].chooseDir : '?'));
    o.push('P nativePicked=' + document.getElementById('path-destino_base').value);
    o.push('P nativeOpen=' + document.getElementById('fp-picker').classList.contains('open'));
    // ── 2. XARXA DE SEGURETAT: el selector HTML encara respon si algú el crida ──
    pickerOpen('path-destino_base', { mode: 'folder' });
    o.push('P open=' + document.getElementById('fp-picker').classList.contains('open'));
    o.push('P path=' + document.getElementById('fp-picker-path').value);
    o.push('P quick=' + document.querySelectorAll('#fp-picker-quick div').length);
    o.push('P use=' + (document.getElementById('fp-picker-use').textContent || ''));
  } catch (e) { o.push('EXCEPCIO2=' + (e && e.message)); }
  setTimeout(function () {
    try {
      var l1 = Array.prototype.map.call(document.querySelectorAll('#fp-picker-list .fp-picker-item'), function (x) { return x.textContent; });
      o.push('P list1=' + l1.join(' | '));
      // ── 2. RUTA ENGANXADA (UNC que no existix al perfil) ──
      pickerGo('\\\\srv\\share\\rutes');
    } catch (e2) { o.push('EXCEPCIO2=' + (e2 && e2.message)); }
    setTimeout(function () {
      try {
        var l2 = Array.prototype.map.call(document.querySelectorAll('#fp-picker-list .fp-picker-item'), function (x) { return x.textContent; });
        o.push('P list2=' + l2.join(' | '));
        var it = document.querySelectorAll('#fp-picker-list .fp-picker-item');
        if (it.length) it[0].click();
        pickerUse();
        o.push('P picked=' + document.getElementById('path-destino_base').value);
        o.push('P closed=' + !document.getElementById('fp-picker').classList.contains('open'));
        // ── 3. DESAR: cep.fs.writeFile, MAI evalScript ──
        document.getElementById('path-render1').value = 'D:\\EXPORTS';
        salvarTodo();
      } catch (e3) { o.push('EXCEPCIO2=' + (e3 && e3.message)); }
      setTimeout(function () {
        try {
          var w = window.__writes || [];
          var parsed = null;
          try { parsed = w.length ? JSON.parse(w[0].data) : null; } catch (eP) { parsed = null; }
          o.push('S writes=' + w.length);
          o.push('S evals=' + (window.__evals || []).length);
          o.push('S json=' + (parsed ? 'ok' : 'KO'));
          o.push('S render1=' + ((parsed && parsed.rutas && parsed.rutas.render1) || '?'));
          o.push('S sint=' + ((parsed && parsed.rutas && parsed.rutas.subtitulosSinteticos) || '?'));
          o.push('S alert=' + ((window.__alerts || [])[0] || ''));
          o.push('S closed=' + !!window.__closedBySave);
        } catch (e4) { o.push('EXCEPCIO2=' + (e4 && e4.message)); }
        paint();
      }, 250);
    }, 350);
  }, 350);
}, 900);
</script>
'@

$html = $html.Replace('</body>', $check + $check2 + '</body>')

$htmlPath = Join-Path $tmp 'fp_setup_probe.html'
[System.IO.File]::WriteAllText($htmlPath, $html, (New-Object System.Text.UTF8Encoding($false)))
$prof = Join-Path $tmp ('fp_setup_prof_' + (Get-Date -Format 'HHmmss'))
$dom  = Join-Path $tmp 'fp_setup_dom.txt'
$err  = Join-Path $tmp 'fp_setup_err.txt'
Remove-Item $dom, $err -ErrorAction SilentlyContinue
Start-Process -FilePath $browser -ArgumentList @('--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run',
    '--allow-file-access-from-files', ("--user-data-dir=" + $prof), '--virtual-time-budget=20000', '--dump-dom',
    ('file:///' + ($htmlPath -replace '\\', '/'))) -Wait -RedirectStandardOutput $dom -RedirectStandardError $err

$d = [System.IO.File]::ReadAllText($dom)
$mOut = [regex]::Match($d, '(?s)<pre id="out">(.*?)</pre>')
if (-not $mOut.Success) {
    ok '#SETUP/3 Edge headless torna el bloc de resultats' $false 'sense <pre id="out"> (mira fp_setup_err.txt)'
} else {
    $lines = [System.Net.WebUtility]::HtmlDecode($mOut.Groups[1].Value) -split "`r?`n"
    $V = @{}
    foreach ($ln in $lines) {
        $i = $ln.IndexOf('=')
        if ($i -gt 0) { $V[$ln.Substring(0, $i).Trim()] = $ln.Substring($i + 1).Trim() }
    }
    $tnVals = if ($V['TN vals']) { $V['TN vals'] -split '\s*\|\s*' } else { @() }
    $mtVals = if ($V['MATINS vals']) { $V['MATINS vals'] -split '\s*\|\s*' } else { @() }

    ok '#SETUP/3 Edge headless executa la finestra i torna el bloc de resultats' $true ''
    ok '#SETUP/4 TNs: capcalera + 3 programes' ($V['TN rows'] -eq '4') ('rows=' + $V['TN rows'])
    ok '#SETUP/5 TNs: 5 camps per fila (id/archivo/dir/wott/conductor)' ($V['TN inputs'] -eq '5') ('inputs=' + $V['TN inputs'])
    ok '#SETUP/6 capcalera amb CARPETA (dir)' ($V['TN head'] -match 'CARPETA \(dir\)') $V['TN head']
    ok '#SETUP/7 graella de 6 columnes' ($V['TN cols'] -eq '6') ('cols=' + $V['TN cols'])
    ok '#SETUP/8 la fila no desborda la targeta' ($V['TN overflow'] -eq 'False') ('overflow=' + $V['TN overflow'])
    ok '#SETUP/9 TN Comarques: dir=02_COMARQUES_PROJECTES' ($tnVals.Count -ge 3 -and $tnVals[2] -eq '02_COMARQUES_PROJECTES') ($tnVals -join ' | ')
    ok '#SETUP/10 MATINS: dir=01_MATINS_PROJECTES' ($mtVals.Count -ge 3 -and $mtVals[2] -eq '01_MATINS_PROJECTES') ($mtVals -join ' | ')
    ok '#SETUP/11 la finestra RENDERITZA (autor i destino_base plens)' `
        ($V['camp autor'] -match '\w' -and $V['camp destino'] -match '\\\\') ('autor=' + $V['camp autor'] + ' destino=' + $V['camp destino'])
    ok '#SETUP/12 addProg crea el programa amb dir' ($V['addProg dir'] -eq 'true') ('addProg dir=' + $V['addProg dir'])
    ok '#SETUP/13 cap excepcio dins la finestra' (-not ($lines | Where-Object { $_ -match '^EXCEPCIO=' })) `
        (($lines | Where-Object { $_ -match '^EXCEPCIO=' }) -join ' | ')
    ok '#SETUP/13b lletra del dashboard = 11px (com el panell)' `
        ($V['FS body'] -eq '11px' -and $V['FS input'] -eq '11px') `
        ('body=' + $V['FS body'] + ' input=' + $V['FS input'])
}

# ── 4. SELECTOR DE CARPETES + DESAR SENSE evalScript (2026-10-21) ──────────
$mOut2 = [regex]::Match($d, '(?s)<pre id="out2">(.*?)</pre>')
if (-not $mOut2.Success) {
    ok '#SETUP/14 el selector de carpetes respon' $false 'sense <pre id="out2"> (mira fp_setup_err.txt)'
} else {
    $lines2 = [System.Net.WebUtility]::HtmlDecode($mOut2.Groups[1].Value) -split "`r?`n"
    $V2 = @{}
    foreach ($ln in $lines2) {
        $i = $ln.IndexOf('=')
        if ($i -gt 0) { $V2[$ln.Substring(0, $i).Trim()] = $ln.Substring($i + 1).Trim() }
    }
    ok '#SETUP/14 botó 📁: obri el diàleg NATIU de carpetes i posa la ruta triada al camp' `
        ([int]$V2['P native'] -eq 1 -and $V2['P chooseDir'] -eq 'true' -and $V2['P nativePicked'] -eq '\\srv\share\rutes' -and $V2['P nativeOpen'] -eq 'false') `
        ('native=' + $V2['P native'] + ' dir=' + $V2['P chooseDir'] + ' picked=' + $V2['P nativePicked'] + ' obert=' + $V2['P nativeOpen'])
    ok '#SETUP/15 selector (xarxa de seguretat): llista la carpeta actual i navega a una ruta ENGANXADA' `
        ($V2['P open'] -eq 'true' -and [int]$V2['P quick'] -ge 2 -and $V2['P use'] -match 'CARPETA' -and $V2['P list1'] -match '2026_10_21' -and $V2['P list2'] -match '2026_10_21' -and $V2['P list2'] -notmatch 'llegeix-me') `
        ('open=' + $V2['P open'] + ' quick=' + $V2['P quick'] + ' use=' + $V2['P use'] + ' list1=' + $V2['P list1'] + ' list2=' + $V2['P list2'])
    ok '#SETUP/16 selector: USAR posa la carpeta triada al camp i tanca' `
        ($V2['P picked'] -eq '\\srv\share\rutes\2026_10_21' -and $V2['P closed'] -eq 'true') `
        ('picked=' + $V2['P picked'] + ' closed=' + $V2['P closed'])
    ok '#SETUP/17 DESAR: cep.fs.writeFile (1 escriptura) i CAP evalScript' `
        ([int]$V2['S writes'] -eq 1 -and [int]$V2['S evals'] -eq 0 -and $V2['S json'] -eq 'ok') `
        ('writes=' + $V2['S writes'] + ' evals=' + $V2['S evals'] + ' json=' + $V2['S json'])
    ok '#SETUP/18 el perfil desat porta les rutes editades i la de SINT' `
        ($V2['S render1'] -eq 'D:\EXPORTS' -and $V2['S sint'] -match 'SRT_SINTETICS' -and $V2['S alert'] -match 'desada' -and $V2['S closed'] -eq 'true') `
        ('render1=' + $V2['S render1'] + ' sint=' + $V2['S sint'] + ' alert=' + $V2['S alert'])
    ok '#SETUP/19 cap excepcio al selector ni al desat' (-not ($lines2 | Where-Object { $_ -match '^EXCEPCIO2=' })) `
        (($lines2 | Where-Object { $_ -match '^EXCEPCIO2=' }) -join ' | ')
}

Write-Host ''
Write-Host ("TOTAL {0} | OK {1} | FAIL {2}" -f ($script:ok + $script:fail), $script:ok, $script:fail)
if ($script:fail -gt 0) { exit 1 }
