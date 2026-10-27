# RESTAURAR · xarxa de seguretat de #193 (27/10)

Instantànies **exactes** dels fitxers que tocarà l'arreglament del marcador d'inici del bloc
(`docs/specs/FIX_INICI_BLOC.md`). Servix per a tornar arrere en qualsevol moment.

| Fitxer d'ací | Origen | Estat que guarda |
|---|---|---|
| `flow_markers.js.orig` | `js/workflows/flow_markers.js` | **abans** de R1-R4 (#193) |
| `escaleta_bounds.js.orig` | `js/core/escaleta_bounds.js` | **abans** de R5 (#193) |
| `main.js.orig` | `js/main.js` | 27/10 — ja inclou F8·Separació (#192) |
| `fp_smoke_ac.js.orig` | `bin/smoke/fp_smoke_ac.js` | 27/10 — ja inclou les proves de F8 |
| `SHA256SUMS.txt` | — | hash de cada `.orig` |

## Restauració total

```powershell
Set-Location 'C:\Users\gonz_agu\AppData\Roaming\Adobe\CEP\extensions\FAST_PASSS'
$snap = '.\docs\rollback\2026-10-27_FIX_INICI_BLOC'
Copy-Item -LiteralPath "$snap\flow_markers.js.orig"    -Destination '.\js\workflows\flow_markers.js' -Force
Copy-Item -LiteralPath "$snap\escaleta_bounds.js.orig" -Destination '.\js\core\escaleta_bounds.js' -Force
```

**Després, recarrega el panell de l'extensió** (o reinicia Premiere): el JavaScript viu en
memòria i no es rellegix del disc.

## Verificació

```powershell
(Get-FileHash -LiteralPath '.\js\workflows\flow_markers.js' -Algorithm SHA256).Hash.ToLower()
# 1b68d687b05678d4327093ac34ed170e7bff1de11631ce77639d8619c4475548
(Get-FileHash -LiteralPath '.\js\core\escaleta_bounds.js' -Algorithm SHA256).Hash.ToLower()
# 44b9850c95d0a1e3c07a73445ece5eaa37a4cfd90d13a2b098bc287070190a96
& .\bin\check_all.ps1
```

Si els dos hashes coincidixen i `check_all` dona `ALL GREEN`, el codi és exactament el
d'abans dels retocs.

## Reversió parcial

`FIX_INICI_BLOC.md` §6.3 explica qué desfer si només falla un dels cinc retocs (R1-R5) i
quina és la regla d'or: **R5 (`escaleta_bounds`) no es toca fins que R1-R4 estiguen verdes
en viu**, perquè és l'única que pot moure l'IN/OUT del bloc.

## Què no cobrix

* No desfà F8·Separació (#192): `main.js.orig` i `fp_smoke_ac.js.orig` ja la inclouen.
* No cobrix `Profile.json` ni cap projecte de Premiere.
* No cobrix `jsx/`: no s'ha tocat ni s'ha de tocar.
