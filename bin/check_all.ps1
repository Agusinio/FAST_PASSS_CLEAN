# ============================================================================
# check_all.ps1 - TOTA la bateria en UNA linia (NORMA 2026-10-22)
# ----------------------------------------------------------------------------
# Per que existeix: cada validacio costava 3 ordres i ~2 KB de sortida; en una
# sessio llarga aixo s'emporta mes context que el codi que es toca. Aqui els
# controls s'executen en proces fill, el detall queda a %TEMP%\fp_check_all\
# i per consola ix UNA linia (mes els FAIL, si n'hi ha).
#
# Controls:
#   setup  bin\smoke\fp_probe_setup_ui.ps1  finestra de config (Edge headless)
#   js     bin\check_js_v8.ps1              sintaxi real V8 de .js/.jsx
#   smoke  bin\smoke\fp_smoke_build.ps1     harness del manifest
#   dead   bin\check_dead.ps1               codi mort a js/ i jsx/
#   jsx    guarda ExtendScript (SEMPRE): SHA256 de jsx\**\*.jsx contra
#          bin\jsx_baseline.json
#
# NORMA - EXTENDSCRIPT INTOCABLE (README sec.4, regla 3)
#   jsx\main.jsx i jsx\modules\*.jsx son el "muscle" del DOM de Premiere i el
#   seu contracte el comparteixen moltes funcions JS. NO es toquen mai "de
#   passada": cal DEMANAR PERMIS EXPRES abans de qualsevol canvi i nomes si es
#   absolutament necessari; han de ser atomics i un a un. Aquesta guarda ho fa
#   visible: si un .jsx canvia sense re-sellar, la linia ix "jsx MODIFICAT".
#   Despres d'un canvi AUTORITZAT: .\bin\check_all.ps1 -AcceptJsx
#
# Us:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\bin\check_all.ps1
#   ... -File .\bin\check_all.ps1 -Only setup        # nomes la finestra
#   ... -File .\bin\check_all.ps1 -Only js,smoke     # validacio selectiva
#   ... -File .\bin\check_all.ps1 -Full              # detall per consola
#   ... -File .\bin\check_all.ps1 -AcceptJsx         # re-sella el baseline jsx
#
# Sortida: ALL GREEN | setup 29/29 | js 61/61 | smoke 369/369 | dead 0 | jsx intacte
# Exit:    0 = tot OK - 1 = algun FAIL - 2 = error d'entorn
# ============================================================================
param(
    [string[]]$Only = @('setup', 'js', 'smoke', 'dead'),
    [switch]$Full,
    [switch]$AcceptJsx
)

$ErrorActionPreference = 'Stop'

$repo   = Split-Path -Parent $PSScriptRoot
$tmp    = if ($env:TEMP) { $env:TEMP } else { 'c:\Users\gonz_agu\AppData\Local\Temp' }
$logDir = Join-Path $tmp 'fp_check_all'
if (-not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

$valid = @('setup', 'js', 'smoke', 'dead')
# PS 5.1 amb -File entrega "-Only js,smoke" com UN sol string (no array): cal dividir.
$steps = @($Only |
    ForEach-Object { "$_" -split ',' } |
    ForEach-Object { $_.Trim().ToLower() } |
    Where-Object { $_ -ne '' })
$wrong = @($steps | Where-Object { $valid -notcontains $_ })
if ($wrong.Count -gt 0) {
    Write-Host ('-Only invalid: ' + ($wrong -join ', ') + ' (valids: ' + ($valid -join ', ') + ')')
    exit 2
}
# Orde canonic + sense duplicats.
$steps = @($valid | Where-Object { $steps -contains $_ })

$defs = @{
    setup = @{ Script = (Join-Path $repo 'bin\smoke\fp_probe_setup_ui.ps1'); Extra = @('-FailOnly'); Kind = 'total' }
    js    = @{ Script = (Join-Path $repo 'bin\check_js_v8.ps1');             Extra = @();           Kind = 'total' }
    smoke = @{ Script = (Join-Path $repo 'bin\smoke\fp_smoke_build.ps1');    Extra = @();           Kind = 'smoke' }
    dead  = @{ Script = (Join-Path $repo 'bin\check_dead.ps1');              Extra = @();           Kind = 'dead'  }
}

# Cada control te el seu format de resum; ací es normalitza a "ok/total".
function Get-Summary([string]$Kind, [string]$Text) {
    # (2026-11-03 · BUG #231) Un error DEL HARNESS no es pot llegir com a verd: si la
    # cadena de proves peta (sincrona/asincrona) o venç el TIMEOUT, el runner bolca
    # l'estat parcial i el cos encara pot dur un resum "PASS n FAIL 0" (les proves
    # que no van correr no compten). Eixe senyal mana sobre el resum.
    if ($Kind -eq 'smoke' -and $Text -match 'HARNESS\s+(?:(?:ASYNC|SYNC)\s+)?ERROR|HARNESS\s+TIMEOUT') {
        return [pscustomobject]@{ Text = 'harness-error'; Fail = 1; Found = $true }
    }
    if ($Kind -eq 'total') {
        $m = [regex]::Match($Text, 'TOTAL\s+(\d+)\s*\|\s*OK\s+(\d+)\s*\|\s*FAIL\s+(\d+)')
        if ($m.Success) {
            return [pscustomobject]@{ Text = ($m.Groups[2].Value + '/' + $m.Groups[1].Value); Fail = [int]$m.Groups[3].Value; Found = $true }
        }
    }
    elseif ($Kind -eq 'smoke') {
        $m = [regex]::Match($Text, 'PASS\s+(\d+)\s+FAIL\s+(\d+)')
        if ($m.Success) {
            $ok = [int]$m.Groups[1].Value
            $bad = [int]$m.Groups[2].Value
            return [pscustomobject]@{ Text = ($ok.ToString() + '/' + ($ok + $bad).ToString()); Fail = $bad; Found = $true }
        }
    }
    elseif ($Kind -eq 'dead') {
        $m = [regex]::Match($Text, 'CODI MUERT:\s*(\d+)\s*orfes')
        if ($m.Success) {
            return [pscustomobject]@{ Text = $m.Groups[1].Value; Fail = [int]$m.Groups[1].Value; Found = $true }
        }
    }
    return [pscustomobject]@{ Text = '?'; Fail = 1; Found = $false }
}

# Executa un control en proces fill i es queda la seua sortida (no la imprimeix).
function Invoke-Step {
    param([string]$Id, [string]$Script, [string[]]$Extra = @())

    if (-not (Test-Path -LiteralPath $Script)) {
        return [pscustomobject]@{ Id = $Id; Code = 2; Lines = @('FALTA el script: ' + $Script); Log = ''; Secs = 0.0 }
    }
    $log  = Join-Path $logDir ($Id + '.txt')
    $argv = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $Script + '"')) + $Extra
    $sw   = [System.Diagnostics.Stopwatch]::StartNew()
    # Un stderr del fill (p. ex. un WARN d'Edge) NO ha d'aturar la bateria: en PS 5.1
    # `2>&1` d'un proces natiu crea ErrorRecords i amb ErrorActionPreference=Stop
    # llança NativeCommandError. Ací es captura i es tracta com a fallada del control.
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $lines = & powershell @argv 2>&1 | ForEach-Object { "$_" }
        $code  = $LASTEXITCODE
    }
    catch {
        $lines = @('EXCEPCIO en invocar el control: ' + $_.Exception.Message)
        $code  = 2
    }
    finally {
        $ErrorActionPreference = $prev
    }
    $sw.Stop()
    $lines = @($lines)
    $foot  = '# exit=' + $code + ' secs=' + ([math]::Round($sw.Elapsed.TotalSeconds, 1))
    [System.IO.File]::WriteAllLines($log, ($lines + $foot), (New-Object System.Text.UTF8Encoding($false)))
    return [pscustomobject]@{ Id = $Id; Code = $code; Lines = $lines; Log = $log; Secs = [math]::Round($sw.Elapsed.TotalSeconds, 1) }
}

# ── GUARDA EXTENDSCRIPT (norma: jsx/ es INTOCABLE) ─────────────────────────
# Sense git a l'equip, l'unica memoria fiable de "com estava jsx/" es un baseline
# de hashes dins del repo. Si canvia un sol byte i no s'ha re-sellat, ix.
function Test-JsxGuard {
    param([switch]$Accept)

    $basePath = Join-Path $repo 'bin\jsx_baseline.json'
    $jsxDir   = Join-Path $repo 'jsx'

    $cur = [ordered]@{}
    if (Test-Path -LiteralPath $jsxDir) {
        Get-ChildItem -LiteralPath $jsxDir -Recurse -File -Filter '*.jsx' |
            Sort-Object FullName |
            ForEach-Object {
                $rel = $_.FullName.Substring($repo.Length + 1) -replace '\\', '/'
                $cur[$rel] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
            }
    }

    $old  = @{}
    $seen = $false
    if (Test-Path -LiteralPath $basePath) {
        try {
            $raw  = [System.IO.File]::ReadAllText($basePath, [System.Text.Encoding]::UTF8)
            $json = ConvertFrom-Json $raw
            foreach ($p in $json.files.PSObject.Properties) { $old[$p.Name] = $p.Value }
            $seen = $true
        } catch { $seen = $false }
    }

    $changed = New-Object System.Collections.Generic.List[string]
    if ($seen) {
        foreach ($k in $cur.Keys) {
            if (-not $old.ContainsKey($k)) { $changed.Add($k + ' (nou)') }
            elseif ($old[$k] -ne $cur[$k]) { $changed.Add($k) }
        }
        foreach ($k in $old.Keys) {
            if (-not $cur.Contains($k)) { $changed.Add($k + ' (esborrat)') }
        }
    }

    $state = if (-not $seen) { 'new' } elseif ($changed.Count -eq 0) { 'ok' } else { 'mod' }
    if ($state -eq 'mod' -and $Accept) { $state = 'accepted' }

    if ($state -eq 'new' -or $state -eq 'accepted') {
        $obj = [ordered]@{
            generat = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
            nota    = 'NORMA: jsx/ es INTOCABLE. Re-sellat nomes despres de permis expres i canvi validat.'
            files   = $cur
        }
        [System.IO.File]::WriteAllText($basePath, (ConvertTo-Json $obj -Depth 4), (New-Object System.Text.UTF8Encoding($false)))
    }

    return [pscustomobject]@{ State = $state; Changed = @($changed); Baseline = $basePath }
}

$results = @()
foreach ($s in $steps) {
    $d   = $defs[$s]
    $r   = Invoke-Step $s $d.Script $d.Extra
    $sum = Get-Summary $d.Kind ($r.Lines -join "`n")
    $results += [pscustomobject]@{
        Id    = $s
        Code  = $r.Code
        Secs  = $r.Secs
        Log   = $r.Log
        Sum   = $sum
        Lines = $r.Lines
        Ok    = ($sum.Found -and $r.Code -eq 0 -and $sum.Fail -eq 0)
    }
}

$jsx     = Test-JsxGuard -Accept:$AcceptJsx
$jsxFail = ($jsx.State -eq 'mod')
$failed  = @($results | Where-Object { -not $_.Ok })
$allOk   = ($failed.Count -eq 0 -and -not $jsxFail)

$jsxTxt = switch ($jsx.State) {
    'ok'       { 'jsx intacte' }
    'new'      { 'jsx baseline creat' }
    'accepted' { 'jsx re-sellat (' + $jsx.Changed.Count + ')' }
    default    { 'jsx MODIFICAT (' + $jsx.Changed.Count + ')' }
}

$parts = @($results | ForEach-Object { '{0} {1}' -f $_.Id, $_.Sum.Text })
$line  = (($(if ($allOk) { 'ALL GREEN' } else { 'FAIL' })) + ' | ' + (($parts + $jsxTxt) -join ' | '))

if ($allOk) {
    Write-Host $line -ForegroundColor Green
    if ($Full) {
        foreach ($r in $results) {
            Write-Host ''
            Write-Host ('# ' + $r.Id + ' (' + $r.Secs + 's) ' + $r.Log)
            Write-Host ($r.Lines -join "`n")
        }
    }
    exit 0
}

Write-Host $line -ForegroundColor Red
foreach ($r in $results) {
    $bad = @($r.Lines | Where-Object { $_ -match '^(FAIL|FETCHFAIL|MANIFEST-FAIL|ORFEN|VELL)' })
    if (-not $r.Sum.Found) { $bad = @('(sense resum, exit=' + $r.Code + ')') + $bad }
    if ($bad.Count -gt 0) {
        Write-Host ('  [' + $r.Id + '] ' + $r.Log)
        $bad | Select-Object -First 8 | ForEach-Object { Write-Host ('    ' + $_) }
        if ($bad.Count -gt 8) { Write-Host ('    ... (+' + ($bad.Count - 8) + ' mes al log)') }
    }
}
if ($jsxFail) {
    Write-Host '  [jsx] ExtendScript modificat respecte bin\jsx_baseline.json:' -ForegroundColor Yellow
    $jsx.Changed | Select-Object -First 6 | ForEach-Object { Write-Host ('    ' + $_) -ForegroundColor Yellow }
    if ($jsx.Changed.Count -gt 6) { Write-Host ('    ... (+' + ($jsx.Changed.Count - 6) + ' mes)') -ForegroundColor Yellow }
    Write-Host '    NORMA: jsx/ es INTOCABLE. Si el canvi no estava autoritzat, revertiu-lo.' -ForegroundColor Yellow
    Write-Host '           Si estava autoritzat i validat: -AcceptJsx (i documentar-ho a BUGS.md/CHANGELOG).' -ForegroundColor Yellow
}
if ($Full) {
    foreach ($r in $results) {
        Write-Host ''
        Write-Host ('# ' + $r.Id + ' (' + $r.Secs + 's) ' + $r.Log)
        Write-Host ($r.Lines -join "`n")
    }
}
Write-Host ('Detall complet: ' + $logDir)
exit 1
