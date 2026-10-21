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

$profileRaw = [System.IO.File]::ReadAllText((Join-Path $repo 'Profile.json'), [System.Text.Encoding]::UTF8)
$profileJs  = ConvertTo-Json $profileRaw -Compress
$libUrl = 'file:///' + ($repo -replace '\\', '/') + '/js/lib/CSInterface.js'
$html = $setup.Replace('src="js/lib/CSInterface.js"', 'src="' + $libUrl + '"')

$stub = @'
<script>
window.__PROFILE_JS__ = __PROFILE__;
window.__adobe_cep__ = {
  getHostEnvironment: function(){ return JSON.stringify({ appName: 'PPRO', appVersion: '25.0', appLocale: 'ca_ES', appUILocale: 'ca_ES' }); },
  getSystemPath: function(){ return 'C:/FAKE_EXT'; },
  evalScript: function(js, cb){ if (cb) { cb(window.__PROFILE_JS__ || 'ERR'); } },
  addEventListener: function(){}, removeEventListener: function(){}, dispatchEvent: function(){},
  getExtensions: function(){ return '[]'; }, getExtensionId: function(){ return 'com.fastpass.panel'; },
  getScaleFactor: function(){ return 1; }, getMonitorScaleFactor: function(){ return 1; },
  getCurrentApiVersion: function(){ return '9.0'; }, getHostCapabilities: function(){ return '{}'; },
  invokeSync: function(){ return '{}'; }, invokeAsync: function(){}, resizeContent: function(){},
  initResourceBundle: function(){}, registerKeyEventsInterest: function(){},
  setScaleFactorChangedHandler: function(){}, requestOpenExtension: function(){}, dumpInstallationInfo: function(){}
};
window.FASTPASS_UI = {
  Config: { get: function(){ return { rutas: { escaletes: 'X', destinoBase: 'Y' }, mapeoProgramas: {} }; } },
  Workflows: { Config: { toggleSetup: function(){} } },
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
    out.push('addProg dir=' + /dir: ""/.test(String(window.addProg)));
  } catch (e) { out.push('EXCEPCIO=' + (e && e.message)); }
  document.getElementById('out').textContent = out.join('\n');
}, 700);
</script>
'@
$html = $html.Replace('</body>', $check + '</body>')

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
}

Write-Host ''
Write-Host ("TOTAL {0} | OK {1} | FAIL {2}" -f ($script:ok + $script:fail), $script:ok, $script:fail)
if ($script:fail -gt 0) { exit 1 }
