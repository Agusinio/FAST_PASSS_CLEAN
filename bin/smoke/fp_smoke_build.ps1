# ============================================================================
# fp_smoke_build.ps1 · Construeix i executa el harness headless del manifest
# ----------------------------------------------------------------------------
# Embolcalla (inline) el bootstrap + stubs/tests + els fitxers REALS del repo
# (analysis_center.js, session_manifest.js, 16_Analysis_Logic.js) dins un HTML
# i el passa per Edge headless amb --dump-dom.
# El bootstrap (fp_smoke_boot.js) va PRIMER perque captura els SyntaxError dels
# altres blocs i els deixa escrits dins <pre id="out">.
# NOTA: en aquest equip Chrome te la politica HKLM UserDataDir fixada (per aixo
#       no es pot usar en headless); Edge si que accepta --user-data-dir.
# Ús:  powershell -NoProfile -ExecutionPolicy Bypass -File .\bin\smoke\fp_smoke_build.ps1
#
# (2026-10-15) VERSIONAT AL REPO: l'original vivia només a %TEMP%. Ara `$repo` es
# dedueix de la ubicació de l'script (<repo>\bin\smoke\…) i els fitxers del
# harness (boot/ac/runner/probe) es busquen PRIMER al costat de l'script i, si no
# hi són, a $env:TEMP (còpia històrica de treball). Els artefactes (HTML, DOM,
# resultat) segueixen escrivint-se a $env:TEMP.
# ============================================================================
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tmp  = if ($env:TEMP) { $env:TEMP } else { 'c:\Users\gonz_agu\AppData\Local\Temp' }

# Fitxers del harness: al costat de l'script (repo) → si no, a %TEMP%.
function Resolve-Harness([string]$name) {
    $local = Join-Path $PSScriptRoot $name
    if (Test-Path $local) { return $local }
    return (Join-Path $tmp $name)
}

$files = @(
    (Resolve-Harness 'fp_smoke_boot.js'),
    (Resolve-Harness 'fp_smoke_ac.js'),
    (Join-Path $repo 'js\core\escaleta_timecode.js'),
    # (2026-10-23) DEPENDÈNCIA REAL de `escaleta_io.load`: sense este fitxer
    # `applyDurationOverrides` no existix i `load` tornava null en silenci
    # (el harness només ho veia quan `load` havia de llegir de disc).
    (Join-Path $repo 'js\core\escaleta_config.js'),
    # (2026-10-21) LLISTAT D'ESCALETES: l'arrencada en fred es menjava 5,2 s en
    # aquest llistat (motor ExtendScript). El prova la prova 22-arrancada.
    (Join-Path $repo 'js\core\escaleta_io.js'),
    (Join-Path $repo 'js\core\analysis_center.js'),
    (Join-Path $repo 'js\core\session_manifest.js'),
    (Join-Path $repo 'js\core\assembly_context.js'),
    # (2026-11-03 · BUG #230) CONFIG REAL al harness: `flow_chyrons._burnedGrafRoles` llegix
    # `Config.get().titolet.detectRoles` (les 27 etiquetes de la família cremada). Sense este
    # fitxer, `Config.get` no era funció i el harness petava a mitjan passada (el smoke es
    # quedava en 120 asertos i «HARNESS ASYNC ERROR» sortia com a verd). És un mòdul PUR de
    # definició: `init()`/`saveSelection` (les que toquen DOM/localStorage) no s'executen.
    (Join-Path $repo 'js\core\11_Configuracio.js'),
    (Join-Path $repo 'js\logic\16_Analysis_Logic.js'),
    (Join-Path $repo 'js\workflows\flow_markers.js'),
    (Join-Path $repo 'js\workflows\flow_mainButton.js'),
    # (2026-10-15) Prova F4/F5: productors que el harness no carregava.
    (Join-Path $repo 'js\workflows\flow_chyrons.js'),
    (Join-Path $repo 'js\workflows\flow_graphics.js'),
    # (2026-10-16 · BUG #169) Guarda d'IMATGE FIXA del congelat que es replica a V6.
    (Join-Path $repo 'js\workflows\flow_mapa.js'),
    # (2026-10-16 · BUG #171) Motor de Clips (JS): `endCoherent` → retall coherent
    # (in/out ↔ end) perquè els rètols col·locats es puguen ESTIRAR amb el ratolí.
    (Join-Path $repo 'js\logic\6_Clips_Logic.js'),
    # (2026-10-21) DURADES DE WOTT: `_resolveWottDur`/`_frameSnapDur` alineen les
    # durades a la graella de frames (abans, les estimades per mida feien que
    # Premiere allargara el clip 1 frame). El prova la prova 23-wotts.
    (Join-Path $repo 'js\logic\3_Project_Logic.js'),
    # (2026-10-21 · BUG #174) PORTADA: finestra de captura (pre-roll + cua). Càlcul PUR
    # que MAI mou el frame triat; el prova la part E de la prova 19-portada.
    (Join-Path $repo 'js\logic\18_Portada_Window.js'),
    # (2026-10-21 · RESET absolut) Esborrat d'arbres entrada per entrada amb
    # verificacio i reintents; el prova la prova 20-reset amb un disc SIMULAT.
    (Join-Path $repo 'js\logic\19_Fs_Wipe.js'),
    # (2026-10-21 - F2) Resolutor de rutes PUR (tokens, fusio del Profile.json,
    # rutes derivades). El prova la prova 21-rutas.
    (Join-Path $repo 'js\logic\20_Rutas_Logic.js'),
    # (2026-10-28 · ZONA GRISA) Paleta 🎨: deteccio del peu gris del grafisme
    # (frame a 3 s, franja inferior #D9D9D9 ±25, cache per ruta+mida+CREACIO).
    # El prova la prova 25-graf-zona-gris (fp_probe_grafzona.js).
    (Join-Path $repo 'js\logic\21_GrafZonaGris_Logic.js'),
# (2026-10-29 - TWITTS) OCR d'1 frame per clip del timeline (el 35 des de l'in):
# pistes @handle + nom del titular, filtre per data i cache de la tria manual.
# El prova la prova 26-twitts (fp_probe_twitts.js). Spec: docs/specs/TWITTS_OCR.md
(Join-Path $repo 'js\logic\22_TwittsOcr_Logic.js'),
(Join-Path $repo 'js\workflows\flow_twitts.js'),
    # (2026-10-21 · F3) SUBTITOLS: parser PUR dels buits i de la fusio amb els
    # sintetics (findGaps / mergeSyntheticGaps / removeEntryAt). El prova la
    # prova 24-srt (fp_probe_srt.js).
    (Join-Path $repo 'js\logic\10_Srt_Logic.js'),
    # (2026-11-05 · BUG #223) EDITOR DE SRT: el mapa px -> peaks de la forma
    # d'ona (`_computeWaveformPixels`) i l'origen del `.bin` (media 0 del clip,
    # NO l'IN). Es nomes una definicio d'objecte (IIFE), no toca el DOM en
    # carregar-se. El prova `fp_probe_srt.js` (#F3/62-#F3/69).
    (Join-Path $repo 'js\editor\srt_editor.js'),
    # (2026-10-21) WOTTS DEL DIA: el desbloqueig del CREAR passa a ser un fet
    # físic (wotts del bloc d'avui, datats per birthtime amb Node). El prova la
    # prova 23-wotts.
    (Join-Path $repo 'js\logic\Scanner.js'),
    # (2026-10-26 · BUG #191) WOTTS FLOTANTS: `13_Parse.files` no ha de crear el
    # bloc fantasma «00» amb els `XARXES-TEXT` (bloc a seques). El prova la prova
    # 23-wotts (#WOTT/54). Modul pur: nomes definix objectes, no toca el DOM.
    (Join-Path $repo 'js\logic\13_Parse.js'),
    (Resolve-Harness 'fp_probe_f45.js'),
    # (2026-10-16 · BUG #167) Rètol de localització del directe → ítem IPD/directe.
    (Resolve-Harness 'fp_probe_ipd_chyron.js'),
    # (2026-10-16 · BUG #170) ESTAT de la intro del bloc (botó 🔀) + neteja sense ripple.
    (Resolve-Harness 'fp_probe_cas_intro.js'),
    # (2026-10-16 · BUG #171) CHYRONS ESTIRABLES amb el ratolí (`Clips.endCoherent`).
    (Resolve-Harness 'fp_probe_estirable.js'),
    # (2026-10-16 · BUG #172) PORTADA: el frame capturat ha de ser el DEMANAT (Out/àrea de
    # treball) + CONTRACTE DEL PONT (`callJSX('Espai.metode()')` → jsx/main.jsx).
    (Resolve-Harness 'fp_probe_portada.js'),
    # (2026-10-21 · RESET absolut) Motor FsWipe (disc simulat: fitxer nomes lectura,
    # bloquejat i lock transitori) + guardes de runReset i cache-busts.
    (Resolve-Harness 'fp_probe_reset.js'),
    # (2026-10-21 - F2) Rutes i variables d'usuari: resolutor pur, fusio del
    # perfil i guardes (cap literal UNC fora dels defaults).
    (Resolve-Harness 'fp_probe_rutas.js'),
    # (2026-10-21) ARRENCADA: llistat d'escaletes natiu (Node -> CEP -> JSX),
    # memoria curta, deduplicacio, respatllers, separadors de `load` i fallback
    # de findLatestValid sense rellegir el JSON.
    (Resolve-Harness 'fp_probe_arrancada.js'),
    # (2026-10-21) WOTTS DEL DIA: desbloqueig del CREAR per birthtime (Node) en
    # lloc de getStatus sobre el repositori central + guardes del poll de 15 s.
    (Resolve-Harness 'fp_probe_wotts.js'),
    # (2026-10-21 · F3) SUBTITOLS: seleccio/esborrat (Supr + 🗑), sintetics
    # (Ctrl+clic a CARREGAR → S2) i reompliment de buits (🐛 parser pur + guardes
    # de l'editor, del flux, de la UI i de la config).
    (Resolve-Harness 'fp_probe_srt.js'),
    # (2026-10-28 · ZONA GRISA) Paleta 🎨: grafisme amb peu gris → V2 + mascara a V3.
    (Resolve-Harness 'fp_probe_grafzona.js'),
# (2026-10-29 - TWITTS) Tuites cremats: pistes @handle/titular, filtre per data,
# cache de la tria manual i col·locacio cobrint el clip de V1.
(Resolve-Harness 'fp_probe_twitts.js'),
    # (2026-11-02 - BUG #216 + TOTEM TE) Wotts TE (totem) -> marcador GROC del seu
    # titol a V3 (ni cadena ni rastreig) + ID de marcador amb guionet intern
    # («25TE-2 - ...» no es pot partir en «25TE»).
    (Resolve-Harness 'fp_probe_te_totem.js'),
    # (2026-11-02 - BUG #220) DATA DE SESSIO: el ctx dels escriptors del manifest
    # (marcadors, grafics, retols), la portada, les rutes d'exportacio i OBRIR/GO
    # s'ancora al .prproj obert en lloc de la data d'AVUI de checkContext (que
    # creava un directori del dia amb un .fastpass.json fantastic dins).
    (Resolve-Harness 'fp_probe_datedir.js'),
    # (2026-11-02 - BUG #221) INGESTA DE WOTTS: la finestra modal «Import Files»
    # de Premiere es queda quieta i nomes s'hi pot dir que cal «Cancel·lar» (avis
    # proactive + watchdog de 20 s); si el motor torna a contestar i els retols
    # ja han entrat, el flux continua en lloc d'avortar.
    (Resolve-Harness 'fp_probe_ingest.js'),
    # (2026-11-04 - F1 A1) ECHO-OFF: el cleanFeed arrossega la musica de la
    # careta/molinet damunt de la veu al primer clip d'A1. La decisio es per
    # CORRELACIO (no pel nom) i la resta amb `anlms` nomes al tram de musica.
    # El prova la prova 28-a1clean (fp_probe_a1clean.js).
    (Join-Path $repo 'js\logic\23_A1_Clean_Logic.js'),
    (Resolve-Harness 'fp_probe_a1clean.js'),
    # (2026-11-06 - A1_ITEM_PLANTILLA) MAPA MESURAT item d'escaleta -> plantilla
    # d'Audios\ (`EscaletaReader.ITEM_PLANTILLES` / `plantillaDeTitol`): quin WAV
    # sona en cada careta/molinet/anada/tornada. El prova 30-plantilles
    # (fp_probe_plantilles.js), amb els numeros reals del TNV V4.
    (Resolve-Harness 'fp_probe_plantilles.js'),
    # (2026-11-06 - BUG #246) TRADUCCIO QUE NO ARRIBA AL TIMELINE: l'insert que
    # falla es reintenta, l'error real de Premiere arriba al log (`rawError`) i la
    # reserva NO-DUPLICAR nomes es fa si el clip ha entrat de veritat.
    # El prova la prova 29-trad-retry (fp_probe_trad.js).
    (Resolve-Harness 'fp_probe_trad.js'),
    (Resolve-Harness 'fp_smoke_runner.js')
)

# (2026-10-16 · BUG #172) CONTRACTE DEL PONT: la prova 19-portada llig els fitxers REALS
# del repo (js/**, jsx/**, index.html, style.css) per `fetch('file:///…')` per comprovar
# que cap crida `callJSX('Espai.metode(…)')` use un mètode que no estiga declarat al pont
# de jsx/main.jsx (això va ser el #172: `Timeline.outPoint` inexistent → 'ERR:…' empassat).
# Cal passar la ruta del repo i la llista de fitxers a la pàgina + el permís de lectura
# file:/// al navegador (mateix truc que bin/check_js_v8.ps1).
$repoUrl = ($repo -replace '\\', '/')
$textFiles = New-Object System.Collections.Generic.List[string]
foreach ($dir in @('js', 'jsx')) {
    $root = Join-Path $repo $dir
    Get-ChildItem -Path $root -Recurse -File | Where-Object { $_.Extension -in @('.js', '.jsx') } |
        Sort-Object FullName | ForEach-Object {
            $textFiles.Add($dir + '/' + (($_.FullName.Substring($root.Length + 1)) -replace '\\', '/'))
        }
}
foreach ($extra in @('index.html', 'style.css')) { $textFiles.Add($extra) }
$manifest = '[' + (($textFiles | ForEach-Object { '"' + $_ + '"' }) -join ', ') + ']'
Write-Host "Manifest del repo (prova #172): $($textFiles.Count) fitxers"

# Traçabilitat: quins fitxers entren al bundle i d'on surten (repo vs %TEMP%).
Write-Host "REPO: $repo"
foreach ($f in $files) {
    $org = $f
    if ($org.StartsWith($repo)) { $org = '<repo>' + $org.Substring($repo.Length) }
    elseif ($org.StartsWith($tmp)) { $org = '<tmp>' + $org.Substring($tmp.Length) }
    Write-Host ("  · $org")
}

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('<!DOCTYPE html><html lang="ca"><head><meta charset="utf-8"><title>FASTPASS smoke</title></head><body><pre id="out">RUNNING</pre>')
# (2026-10-16 · BUG #172) Globals que necessita la prova 19-portada (contracte del pont).
[void]$sb.AppendLine("<script>window.__REPO = '$repoUrl'; window.__TEXT_FILES = $manifest;</script>")
foreach ($f in $files) {
    if (-not (Test-Path $f)) { throw "no trobat: $f" }
    [void]$sb.AppendLine('<script>')
    [void]$sb.AppendLine((Get-Content -Raw -Encoding UTF8 $f))
    [void]$sb.AppendLine('</script>')
}
[void]$sb.AppendLine('</body></html>')

$html = Join-Path $tmp 'fp_smoke_ac.html'
[System.IO.File]::WriteAllText($html, $sb.ToString(), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "HTML construit: $html ($([Math]::Round((Get-Item $html).Length / 1KB)) KB)"

$browser = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { throw 'msedge.exe no trobat: no es pot validar headless' }
Write-Host "Navegador: $browser"

$stamp = Get-Date -Format 'HHmmss'
$prof  = Join-Path $tmp "fp_edge_profile_$stamp"
New-Item -ItemType Directory -Force -Path $prof | Out-Null
$raw = Join-Path $tmp 'fp_smoke_ac_dom.txt'
$err = Join-Path $tmp 'fp_smoke_ac_err.txt'
$url = 'file:///' + ($html -replace '\\', '/')

$pargs = @(
    '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run',
    '--no-default-browser-check', "--user-data-dir=$prof",
    # (2026-10-16 · BUG #172) La prova 19-portada llig els fitxers REALS del repo per
    # `fetch('file:///…')` (contracte del pont): sense aquest permís, fetch hi falla.
    '--allow-file-access-from-files',
    '--dump-dom', '--virtual-time-budget=30000', $url
)
$proc = Start-Process -FilePath $browser -ArgumentList $pargs -RedirectStandardOutput $raw -RedirectStandardError $err -Wait -PassThru -NoNewWindow
Write-Host "exit=$($proc.ExitCode) dom=$((Get-Item $raw).Length) bytes"

$dom = Get-Content -Raw $raw
$m = [regex]::Match($dom, '(?s)<pre id="out">(.*?)</pre>')
if (-not $m.Success) {
    Write-Host '--- stderr ---'
    Write-Host (Get-Content -Raw $err)
    throw 'no s''ha pogut extreure <pre id="out"> del DOM'
}
$txt = $m.Groups[1].Value
$txt = $txt -replace '&lt;', '<' -replace '&gt;', '>' -replace '&quot;', '"' -replace '&#39;', "'" -replace '&amp;', '&'
$txt = $txt -replace "`r`n", "`n"

$out = Join-Path $tmp 'fp_smoke_ac_result.txt'
[System.IO.File]::WriteAllText($out, $txt, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "RESULTAT: $out"
Write-Host ''
Write-Host $txt
