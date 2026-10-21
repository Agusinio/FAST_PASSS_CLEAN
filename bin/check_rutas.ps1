# ============================================================================
# check_rutas.ps1 - GUARDA F2: cap ruta UNC "viva" dins del codi
# ----------------------------------------------------------------------------
# Per que existeix (2026-10-21)
#   F2 demana que CAP ruta de treball viva al codi: totes han de vindre de la
#   configuracio de l'usuari (Profile.json -> Config.get().rutas). Aquesta guarda
#   detecta literals UNC escrits dins d'una cadena JS (`'\\\\servidor\...`) a
#   `js/` i `jsx/`, que son exactament les que es deixaven de poder configurar.
#
#   NOMES s'ignora `js/core/11_Configuracio.js`: aci viuen els valors PER DEFECTE,
#   que son la xarxa de seguretat quan no hi ha Profile.json (i l'unic lloc on
#   poden estar).
#
#   La deteccio mira el TEXT de les cadenes: en JS una UNC s'escriu amb 4 barres
#   invertides (`'\\\\srv\\share'`), aixi que `'`/`"` seguit de 4+ barres es una
#   ruta UNC. Els comentaris que documenten una ruta (`\\srv\share`) NO porten
#   cometes davant i no es toquen.
#
# Us:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\bin\check_rutas.ps1
#   ... -File .\bin\check_rutas.ps1 -ListAll    # llista tambe els fitxers nets
#
# Exit code: 0 = net · 1 = hi ha rutes hardcoded · 2 = error d'entorn
# ============================================================================
param(
    [string]$BaseDir = (Split-Path -Parent $PSScriptRoot),
    [switch]$ListAll
)

$ErrorActionPreference = 'Stop'

$allow = @('js/core/11_Configuracio.js')
# Una UNC de veritat es `'\\\\srv\\recurs'`: cometes + 4 barres + NOM DE SERVIDOR +
# 2 barres. El nom de servidor es el que descarta els falsos positius del codi que
# NOMES escapa barres (`'\\\\'`, `"\\\\\\\\"`, `'\\\\b'`, `.replace(/\\\\/g, ...)`).
$re = [regex]"['""]\\{4,}[A-Za-z0-9_.-]+\\{2}"

$files = @()
foreach ($dir in @('js', 'jsx')) {
    $root = Join-Path $BaseDir $dir
    if (!(Test-Path -LiteralPath $root)) { Write-Host ("FALTA: " + $root); exit 2 }
    $files += (Get-ChildItem -LiteralPath $root -Recurse -File |
        Where-Object { $_.Extension -in @('.js', '.jsx') })
}
if ($files.Count -eq 0) { Write-Host 'CAP FITXER a revisar.'; exit 2 }

$hits = @()
$clean = 0
foreach ($f in $files) {
    $rel = ($f.FullName.Substring($BaseDir.Length + 1)) -replace '\\', '/'
    if ($allow -contains $rel) { continue }
    $lineNo = 0
    foreach ($line in [System.IO.File]::ReadAllLines($f.FullName, [System.Text.Encoding]::UTF8)) {
        $lineNo++
        $m = $re.Match($line)
        if ($m.Success) {
            $snippet = $line.Trim()
            if ($snippet.Length -gt 110) { $snippet = $snippet.Substring(0, 110) + '...' }
            $hits += ("RUTA  {0}:{1}: {2}" -f $rel, $lineNo, $snippet)
        }
    }
    $clean++
}

Write-Host ('FITXERS: ' + $clean + ' revisats (ignorat: ' + ($allow -join ', ') + ')')
foreach ($h in $hits) { Write-Host $h }
if ($ListAll -and $hits.Count -eq 0) {
    $files | ForEach-Object { Write-Host ('OK    ' + (($_.FullName.Substring($BaseDir.Length + 1)) -replace '\\', '/')) }
}
Write-Host ('RUTES HARDCODED: ' + $hits.Count)
if ($hits.Count -gt 0) {
    Write-Host '⚠️ Una ruta UNC dins d''una cadena no es pot configurar: porta-la a Profile.json (rutas) i llig-la de Config.get().rutas.'
    exit 1
}
Write-Host 'OK: cap ruta UNC dins de cadenes a js/ ni jsx/ (fora dels defaults de 11_Configuracio.js).'
exit 0
