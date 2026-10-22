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
#   4) (2026-10-22 · BUG #178b) La guarda 2e/2f comprova que el botó 📁 crida
#      `scripts/pick_folder.ps1` (IFileOpenDialog) i que el C# COMPILA; les
#      guardes 2g/2h, que la traça de la tria va al log del panell
#      (`FASTPASS_UI.Utils.forceLog`, sense Node) i que existix el transport
#      `cep.process` (API nativa de CEP, SENSE Node) amb `-OutFile` al .ps1; el
#      bloc DOM comprova que el diàleg modern s'invoca ABANS que el de CEP, que
#      amb `cep.process` arranca el .ps1 amb la ruta inicial i `-OutFile`
#      (`#SETUP/14c`), que sense Node/`cep.process` cau al de CEP i que el
#      selector HTML seguix existint com a última xarxa.
#   5) (2026-10-22 · BUG #179) En DESAR, el dashboard s'ha de TANCAR: `setup.html`
#      feia `new CSXSEvent(...)` sense guarda (eixa class no existix en el
#      `CSInterface.js` carregat) → ReferenceError → la finestra es quedava
#      oberta. Les guardes 2i (estàtica: guarda + cascada) i 18 (DOM: `S closed`
#      amb `CSXSEvent` INEXISTENT, com en el CEP de debò) el cacen.
#
# Us: powershell -NoProfile -ExecutionPolicy Bypass -File .\bin\smoke\fp_probe_setup_ui.ps1
#     ... -FailOnly   # nomes els FAIL + el TOTAL (el fa servir bin\check_all.ps1
#                     # per a no llençar 29 linies de context a cada validacio)
#     (exit code 0 = tot OK, 1 = algun FAIL)
# ============================================================================
param(
    [switch]$FailOnly
)

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tmp  = if ($env:TEMP) { $env:TEMP } else { 'c:\Users\gonz_agu\AppData\Local\Temp' }
$browser = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'

$script:ok = 0
$script:fail = 0
function ok([string]$name, [bool]$cond, [string]$detail) {
    if ($cond) {
        $script:ok++
        if (-not $FailOnly) { Write-Host ("OK   {0}" -f $name) }
    }
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

# ── 3c. GUARDA ESTATICA: diàleg modern de l'Explorador (2026-10-22 · #178b) ──
# El botó 📁 ha d'obrir `scripts/pick_folder.ps1` (IFileOpenDialog) i el .ps1 ha
# de COMPILAR: si el C# de l'interop no compila, el diàleg cauria sempre al de CEP.
$pickPs1 = Join-Path $repo 'scripts\pick_folder.ps1'
ok '#SETUP/2e el botó 📁 crida fpPickFolderNative i el .ps1 existix' `
    (([regex]::IsMatch($setup, 'window\.fpPickFolderNative\(id, cur\)')) -and (Test-Path $pickPs1) -and
     ([regex]::IsMatch($setup, 'scripts\\\\pick_folder\.ps1'))) `
    'falta la crida a fpPickFolderNative o el fitxer scripts\pick_folder.ps1'
if (Test-Path $pickPs1) {
    $cmp = & powershell -NoProfile -ExecutionPolicy Bypass -File $pickPs1 -CompileOnly 2>&1 | Out-String
    ok '#SETUP/2f scripts\pick_folder.ps1: el tipus C# (IFileOpenDialog) COMPILA' `
        ($cmp -match 'COMPILE_OK') ('eixida: ' + $cmp.Trim())
}

# ── 3d. GUARDA ESTATICA: observabilitat + transport SENSE Node (3a volta) ───
# (2026-10-22) La 2a volta va fallar en viu perque el manifest NO te
# `--enable-nodejs`: Node no existix dins de CEP, la traça (fs.appendFileSync) i
# el sondeig del .ps1 (fs.existsSync) no s'executaven i tot queia al dialeg vell
# SENSE cap rastre. Ara la traça ha d'anar al log del panell i hi ha d'haver un
# transport que no depenga de Node (`cep.process`).
$pickPs1Src = ''
if (Test-Path $pickPs1) { $pickPs1Src = [System.IO.File]::ReadAllText($pickPs1, [System.Text.Encoding]::UTF8) }
ok '#SETUP/2g la tria de carpetes deixa traça al log del panell (forceLog, sense Node)' `
    (([regex]::IsMatch($setup, 'function fpDiag')) -and ([regex]::IsMatch($setup, 'U\.forceLog\(line\)')) -and
     (-not [regex]::IsMatch($setup, 'appendFileSync'))) `
    'fpDiag no arriba a Utils.forceLog o la traça torna a dependre de fs de Node'
ok '#SETUP/2h transport sense Node: cep.process a setup.html i -OutFile al .ps1' `
    (([regex]::IsMatch($setup, '\.process\.createProcess\(')) -and ([regex]::IsMatch($setup, 'function fpCepProc')) -and
     ([regex]::IsMatch($pickPs1Src, '\[string\]\$OutFile'))) `
    'falta el transport cep.process/createProcess o el .ps1 no accepta -OutFile'

# ── 3e. GUARDA ESTATICA: DESAR TANCA EL DASHBOARD (2026-10-22 · #179) ──────
# El desat ja anava bé, però la finestra es quedava oberta: `setup.html` feia
# `new CSXSEvent(...)` SENSE guarda i eixa class no existix en el
# `CSInterface.js` que carrega → ReferenceError → el tancament no s'executava.
$guardaIdx = $setup.IndexOf("typeof CSXSEvent === 'function'")
$newEvtIdx = $setup.IndexOf("new CSXSEvent('FASTPASS_CONFIG_UPDATED'")
ok '#SETUP/2i el desat tanca el dashboard: CSXSEvent protegit + closeSetup en cascada' `
    (([regex]::IsMatch($setup, 'function notifyConfigUpdated')) -and
     ([regex]::IsMatch($setup, 'function closeSetup')) -and
     ([regex]::IsMatch($setup, 'typeof C\.closeSetup === ''function''')) -and
     ([regex]::IsMatch($setup, "getElementById\('setup-overlay'\)")) -and
     ([regex]::Matches($setup, 'closeSetup\(\)').Count -ge 2) -and
     $guardaIdx -ge 0 -and $newEvtIdx -gt $guardaIdx -and
     ([regex]::Matches($setup, "new CSXSEvent\('FASTPASS_CONFIG_UPDATED'").Count -eq 1)) `
    ('guarda=' + $guardaIdx + ' newCSXSEvent=' + $newEvtIdx + ' tancaments=' + [regex]::Matches($setup, 'closeSetup\(\)').Count)
$idxTxt = [System.IO.File]::ReadAllText((Join-Path $repo 'index.html'), [System.Text.Encoding]::UTF8)
$mSetupV = [regex]::Match($fc, 'setup\.html\?v=(\d+)')
$mFlowV  = [regex]::Match($idxTxt, 'flow_config\.js\?v=(\d+)')
ok '#SETUP/2j cache-bust de la finestra de configuracio pujat (setup ?v>=10, flow_config ?v>=12)' `
    ($mSetupV.Success -and [int]$mSetupV.Groups[1].Value -ge 10 -and
     $mFlowV.Success -and [int]$mFlowV.Groups[1].Value -ge 12) `
    ('setup=' + $mSetupV.Groups[1].Value + ' flow_config=' + $mFlowV.Groups[1].Value + ' (CEF serviria una copia vella)')

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
    readFile: function(p){ if (String(p).indexOf('_pick_result.tmp') !== -1) return { err: 1, data: '' }; var w = window.__writes || []; return { err: 0, data: w.length ? w[w.length - 1].data : window.__PROFILE_JS__ }; },
    writeFile: function(p, d){ window.__writes.push({ path: p, data: String(d) }); return { err: 0 }; },
    readdir: function(p){
      var T = {
        'C:\\Users\\probe\\Documents': ['Projectes', 'notes.txt'],
        'C:\\Users\\probe\\Documents\\Projectes': ['BLOC1', 'BLOC2'],
        'C:\\': ['Users', 'Windows'],
        'C:\\FAKE_EXT\\scripts': ['pick_folder.ps1', 'limpiar_temporales.ps1'],
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0': ['powershell.exe', 'powershell_ise.exe'],
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
// (2026-10-22 · #178b) `init()` és async: si peta, la promesa es rebutja en
// SILENCI i la finestra es queda buida sense cap error. Ací es caça.
window.__rej = [];
window.addEventListener('unhandledrejection', function (ev) {
  var r = ev && ev.reason;
  window.__rej.push(String((r && r.message) || r));
});
window.__err = [];
window.addEventListener('error', function (ev) {
  window.__err.push(String(ev.message) + ' @L' + ev.lineno);
});
window.FASTPASS_UI = {
  Config: { get: function(){ return { rutas: { escaletes: 'X', destinoBase: 'Y' }, mapeoProgramas: {} }; } },
  Workflows: { Config: { toggleSetup: function(){ window.__closedBySave = true; } } },
  Logic: {}, Core: {}, Utils: {}
};
// (2026-10-22 · #179) ACI NO es definix `CSXSEvent` A POSTA: el
// `js/lib/CSInterface.js` del repo NO el definix (només `dispatchEvent`) i eixa
// era justament la causa que, en desar, el dashboard es quedara obert
// (ReferenceError → mai s'arribava a `toggleSetup(false)`). Amb el stub ací,
// la prova passava i el bug no es veia: `#SETUP/18` i `#SETUP/2i` el cacen.
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
    out.push('REJ=' + ((window.__rej || []).join(' | ') || '(cap)'));
    out.push('ERR=' + ((window.__err || []).join(' | ') || '(cap)'));
    out.push('DIAG perfil=' + (typeof currentProfile) +
        ' keys=' + (currentProfile ? Object.keys(currentProfile).join(',') : '-') +
        ' autor=' + (currentProfile && currentProfile.general ? currentProfile.general.autor : '-'));

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
    // ── 1. BOTÓ 📁: 1r el diàleg MODERN de l'Explorador (BUG #178b) ──
    var odBefore = (window.__openDlg || []).length;
    var realPick = window.fpPickFolderNative;
    window.__modernDlg = [];
    // Stub: simula que l'Explorador s'ha obert i l'usuari ha triat una carpeta.
    window.fpPickFolderNative = function (id, initial) {
      window.__modernDlg.push({ id: id, initial: String(initial == null ? '' : initial) });
      document.getElementById(id).value = '\\\\srv\\share\\rutes\\2026_10_21';
      return true;
    };
    window.browseFolder('path-destino_base');
    o.push('P modern=' + window.__modernDlg.length);
    o.push('P modernInit=' + (window.__modernDlg[0] ? window.__modernDlg[0].initial : ''));
    o.push('P modernPicked=' + document.getElementById('path-destino_base').value);
    o.push('P modernNoCep=' + ((window.__openDlg || []).length === odBefore));
    o.push('P modernNoHtml=' + !document.getElementById('fp-picker').classList.contains('open'));
    // ── 1b. SENSE Node/script (headless): cau al diàleg de CEP, chooseDir=true ──
    window.fpPickFolderNative = realPick;
    document.getElementById('path-destino_base').value = '';
    window.browseFolder('path-destino_base');
    var od = window.__openDlg || [];
    o.push('P native=' + (od.length - odBefore));
    o.push('P chooseDir=' + (od[od.length - 1] ? od[od.length - 1].chooseDir : '?'));
    o.push('P nativePicked=' + document.getElementById('path-destino_base').value);
    o.push('P nativeOpen=' + document.getElementById('fp-picker').classList.contains('open'));
    // ── 1c. AMB `cep.process` (API nativa de CEP, SENSE Node): arranca el .ps1 ──
    // (2026-10-22 · #178b 3a) Este es el transport que ha de funcionar en el
    // panell de debò: el manifest NO té --enable-nodejs.
    var odBefore2 = (window.__openDlg || []).length;
    window.__proc = [];
    var realProc = window.cep.process;
    window.cep.process = {
      createProcess: function () { window.__proc.push(Array.prototype.slice.call(arguments)); return { data: 4242, err: 0 }; },
      onquit: function () { return { err: 0 }; },
      isRunning: function () { return { data: true, err: 0 }; },
      stdout: function () { }, stderr: function () { }, stdin: function () { }, waitfor: function () { }
    };
    var elBase2 = document.getElementById('path-destino_base');
    var prevBase = elBase2.value;          // 14b hi va deixar la carpeta de la xarxa
    elBase2.value = '';
    var cepOk = window.fpPickFolderNative('path-destino_base', '\\\\srv\\share');
    var argvCep = window.__proc[0] || [];
    o.push('P cepLaunch=' + cepOk);
    o.push('P cepArgs=' + argvCep.join(' | '));
    o.push('P cepNoLegacy=' + ((window.__openDlg || []).length === odBefore2));
    o.push('P cepValue=' + elBase2.value);
    // El resultat del .ps1 viatja en base64 UTF-8 (`OK <b64>`): ací es comprova
    // que `fpFromB64` el deixa amb els accents intactes (Edge = mateix atob que CEF).
    // `QzpcVkVSVElDQUxJVFpBQ0nDk1xQUk9WQQ==` = `C:\VERTICALITZACIÓ\PROVA`
    o.push('P b64=' + fpFromB64('QzpcVkVSVElDQUxJVFpBQ0nDk1xQUk9WQQ=='));
    elBase2.value = prevBase;              // que el selector comence on toca
    if (realProc === undefined) { delete window.cep.process; } else { window.cep.process = realProc; }
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
# (2026-10-22) `-Wait` sense temps màxim podia penjar la prova sencera si Edge
# headless es queda encallat (vist): ara s'espera com a molt 90 s i, si no ha
# eixit, es mata i es lligen igualment les restes del DOM.
$proc = Start-Process -FilePath $browser -ArgumentList @('--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run',
    '--allow-file-access-from-files', ("--user-data-dir=" + $prof), '--virtual-time-budget=20000', '--dump-dom',
    ('file:///' + ($htmlPath -replace '\\', '/'))) -PassThru -RedirectStandardOutput $dom -RedirectStandardError $err
if (-not $proc.WaitForExit(90000)) {
    try { $proc.Kill() } catch { }
    Start-Sleep -Milliseconds 800
}

# (2026-10-22) Edge pot deixar el fitxer de `--dump-dom` bloquejat uns
# mil·lisegons (fills del procés que hereten el handle): es reintenta la
# lectura en lloc de petar la prova sencera amb un IOException.
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if (-not (Test-Path $dom)) { Start-Sleep -Milliseconds 250; continue }
    try { $d = [System.IO.File]::ReadAllText($dom); break }
    catch { Start-Sleep -Milliseconds 250 }
}
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
    ok '#SETUP/13c init() no deixa cap promesa rebutjada' `
        ($V['REJ'] -eq '(cap)') ('REJ=' + $V['REJ'])
    ok '#SETUP/13d cap error JS en carregar la finestra' `
        ($V['ERR'] -eq '(cap)') ('ERR=' + $V['ERR'])
    Write-Host ('     DIAG ' + $V['DIAG perfil'])


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
    ok '#SETUP/14 botó 📁 (1r): obri el diàleg MODERN de l''Explorador i hi passa la ruta actual' `
        ([int]$V2['P modern'] -eq 1 -and [bool]$V2['P modernInit'] -and $V2['P modernPicked'] -eq '\\srv\share\rutes\2026_10_21' -and $V2['P modernNoCep'] -eq 'true' -and $V2['P modernNoHtml'] -eq 'true') `
        ('modern=' + $V2['P modern'] + ' init=' + $V2['P modernInit'] + ' picked=' + $V2['P modernPicked'] + ' noCep=' + $V2['P modernNoCep'] + ' noHtml=' + $V2['P modernNoHtml'])
    ok '#SETUP/14b sense Node/script: cau al diàleg de CEP de carpetes (chooseDir=true)' `
        ([int]$V2['P native'] -eq 1 -and $V2['P chooseDir'] -eq 'true' -and $V2['P nativePicked'] -eq '\\srv\share\rutes' -and $V2['P nativeOpen'] -eq 'false') `
        ('native=' + $V2['P native'] + ' dir=' + $V2['P chooseDir'] + ' picked=' + $V2['P nativePicked'] + ' obert=' + $V2['P nativeOpen'])
    ok '#SETUP/14c amb cep.process (sense Node): arranca el .ps1 amb -OutFile i -Initial, sense diàleg de CEP' `
        ($V2['P cepLaunch'] -eq 'true' -and $V2['P cepArgs'] -match 'powershell\.exe' -and $V2['P cepArgs'] -match '\-OutFile' -and
         $V2['P cepArgs'] -match '\-Initial \| \\\\srv\\share' -and $V2['P cepNoLegacy'] -eq 'true' -and $V2['P cepValue'] -eq '') `
        ('launch=' + $V2['P cepLaunch'] + ' args=' + $V2['P cepArgs'] + ' legacy=' + $V2['P cepNoLegacy'] + ' value=' + $V2['P cepValue'])
    # (NOTA: el .ps1 no té BOM i PS 5.1 el llig com ANSI → cap literal amb accents
    #  ací dins; l'esperat s'obté del mateix base64 amb .NET, que és l'oracle.)
    $expectB64 = 'QzpcVkVSVElDQUxJVFpBQ0nDk1xQUk9WQQ=='
    $expectPath = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($expectB64))
    ok '#SETUP/14d fpFromB64: el resultat del .ps1 (base64 UTF-8) es descodifica amb accents' `
        ($V2['P b64'] -eq $expectPath) `
        ('b64=' + $V2['P b64'] + ' · esperat=' + $expectPath)
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
