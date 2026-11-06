# HANDOFF · FAST >>> PASS

> **Foto de traspàs, no font de veritat.** L'estat de cada bug i de cada implementació viu
> **només** a [`BUGS.md`](../BUGS.md) i [`FEATURES.md`](../FEATURES.md), i els canvis de codi a
> [`docs/CHANGELOG.md`](CHANGELOG.md). Este fitxer es **reescriu** en cada traspàs: si algo no
> coincidix amb els catàlegs, manen els catàlegs.
>
> **Un sol handoff.** Prohibit tornar a crear diaris a `.roo/`, `plans/HANDOFF_*` o llistes de
> pendents a `INFO/` (històric fusionat a [`docs/archive/`](archive/), 2026-11-06).

**Últim traspàs:** 2026-11-06 · **Versió del codi:** 0.9.8 · **Branca:** `main` neta (= `origin/main`, sense ahead/behind)

---

## 1 · Estat del codi (no de les tasques)

| Què | Valor |
|---|---|
| Versió de l'extensió | **0.9.8** a `CSXS/manifest.xml` (bundle + panell), títol d'`index.html`, `package.json` |
| Validació vigent | `ALL GREEN \| setup 35/35 \| js 65/65 \| smoke 974/974 \| dead 0 \| jsx intacte` |
| `.jsx` | **0 fitxers tocats** en esta tanda (segell de `check_all` intacte) |
| Branca | `main` net, sense ahead/behind |
| Git | `E:\PortableGit\bin\git.exe` (**no** està al `PATH`) |

## 2 · Què s'ha fet en este traspàs

1. **#224 · 🧩 REOMLIR** — `Scanner.srtSynthetic`, `mergeSyntheticGaps` / `fitClipsToGap` /
   `alignmentCredible` (`js/logic/10_Srt_Logic.js`), `srt_editor`, `flow_srt`, config de
   `11_Configuracio`: cada SRT es **mesura** i el sintètic es repartix dins del **seu** forat
   (3 frames = 0,12 s + estirament). Proves noves al smoke. **Pendent de validar en viu.**
2. **#226 · 🔀 Conductor ↔ Tema-Títol** — **TANCAT per decisió de l'usuari, 0 línies de codi**:
   no és agnòstic (`CAS_MARGEN_INICIO` 0,40 s, `CAS_DUR_TEMA_TITOL` 6,24 s, tokens `BONATARD*`)
   i només ha de servir els blocs d'esta casa. Diagnòstic guardat a `BUGS.md` §2 per si es reobri.
3. **Versió unificada a 0.9.8** (abans 9.2.0 / 8.5.0 / 8.0.0 / títol v2.9.5 TACTICAL).
   `FASTPASS.version()` **no** es toca: torna `app.version` de **Premiere**, no la de l'extensió.
4. **Catàlegs quadrats**: `BUGS.md` = **20 pendents · 146 resolts/tancats** (contadors = files
   reals); `FEATURES.md` = 40 / 9 / 7 / 3.
5. **Neteja d'handoffs**: 9 diaris de `.roo/progress/` (2.808 línies, 236 KB) fusionats a
   [`docs/archive/SESSIONS_2026-09-30_10-12.md`](archive/SESSIONS_2026-09-30_10-12.md) amb
   `bin/merge_md.ps1` i esborrats. `bin/merge_md.ps1` blindat (PS 5.1 el llig com ANSI: res
   d'accents en els seus literals).

Commits: `16b29fa` (codi #224 + 0.9.8 + #226) · `26af9d3` (catàlegs) · `70e9828` (CHANGELOG) ·
`125ca54` (este handoff: neteja dels diaris + arxiu).

## 3 · Com es treballa ací (resum operatiu)

Llig **[`.clinerules`](../.clinerules)** sencer abans de tocar res. Els quatre punts que més es
incomplixen:

- **Validar amb UNA ordre**: `bin\check_all.ps1` (selectiva: `-Only js,smoke`, `-Only setup`,
  `-Only dead`). Redirigix a `%TEMP%` i llig només `ALL GREEN` / `FAIL` / `exit=`.
- **`jsx/**` és intocable** sense permís explícit de l'usuari, i mai «de passada».
- **UTF-8 sense BOM** sempre. I atenció: un `.ps1` **sense** BOM, PS 5.1 el llig com a ANSI →
  qualsevol literal accentuat eixirà **mojibake** al fitxer que escriga (bug real, vore §5).
- **Bug nou → `BUGS.md`** (número + una línia); **implementació → `FEATURES.md`**; **codi →
  `docs/CHANGELOG.md`**. Cap més llista de pendents.

## 4 · On està cada cosa (índex, no estat)

| On | Què hi ha | Quantes |
|---|---|---|
| `BUGS.md` **§1.1** | Bugs **amb codi o diagnòstic**, pendents de validar en viu | 18 |
| `BUGS.md` **§1.2** | Noves sense diagnòstic ni codi | 0 |
| `BUGS.md` **§1.3** | Decisions pendents de l'usuari | 2 (`#116`, `#242`) |
| `BUGS.md` **§2** | Resolts i tancats (orde cronològic) | 146 |
| `FEATURES.md` **§1** | Implementacions validades | 40 |
| `FEATURES.md` **§2** | Implementades, **pendents de validar en viu** | 9 |
| `FEATURES.md` **§3** | En cua / per implementar | 7 |
| `FEATURES.md` **§4** | Descartades per decisió | 3 |

Els 18 de `BUGS.md` §1.1 (per número): `#224`, `#212`, `#210`, `#209`, `#206`, `#205`, `#197`,
`#202`, `#232`, `#233`, `#237`, `#235`, `#236`, `#239`, `#241`, `#245`, `#249`, `#234`.
Els 7 de `FEATURES.md` §3: `XARXES_TC00`, `NNEWS`, `MARKERS_INVARIANT`, `SRT_GUARD`,
`JSON_DIETA`, `AUDIO_IA_DEREVERB`, `OCR_FRAME_CABEZAL`.

## 5 · Trampes conegudes (per no perdre una hora)

1. **Mojibake fantasma**: la consola és CP850; `Get-Content` i `Select-String` sense
   `-Encoding UTF8` mosseguen accents. Comprova sempre amb
   `[System.IO.File]::ReadAllText($p,(New-Object System.Text.UTF8Encoding($false)))` i busca
   `Ã` / `Â§` / `U+FFFD`. Un `.ps1` generador sense BOM *sí* corromp el que escriu.
2. **`FASTPASS.version()`** (`jsx/main.jsx:64`) → `app.version` de Premiere. **No** és la versió
   de l'extensió: no la canvies per a «pujar la versió».
3. **`?v=NN`** de l'`index.html` són **cache-busters** de càrrega (cal apujar-los quan es canvia
   un `js/**`), no versions.
4. **Primera línia d'un fitxer de text de Premiere**: respectar BOM/CRLF originals; mai
   «normalitzar» un `.jsx`.
5. **Git**: `E:\PortableGit\bin\git.exe`. Missatges de commit **en ASCII** (l'àmbit del repo és
   UTF-8, però el commit des de PowerShell 5.1 trenca accents).
6. **`check_all` diu `jsx MODIFICAT (n)`** → atura't i pregunta; no hi ha re-sell sense validar.

## 6 · Prompt per a la següent conversació

Copia-ho tal qual en obrir el fil nou (substituïx `<TASCA>`):

```
Projecte: FAST >>> PASS (extensió CEP per a Premiere Pro)
Ruta: c:\Users\gonz_agu\AppData\Roaming\Adobe\CEP\extensions\FAST_PASSS
Llig PRIMER, en este orde: .clinerules, docs/HANDOFF.md, i després BUGS.md / FEATURES.md per rangs (no els llisques sencers).
Regles que no es poden trencar:
 (1) BUGS.md i FEATURES.md són l'ÚNICA font de veritat de l'estat: no crees cap altra llista de pendents ni cap HANDOFF/SESSION nou (el traspàs viu només a docs/HANDOFF.md);
 (2) jsx/** és intocable sense el meu permís explícit, i mai "de passada";
 (3) valida sempre amb bin\check_all.ps1 (o -Only js,smoke / setup / dead), mai les 4 proves per separat, i digues-me només la línia ALL GREEN;
 (4) codi i documentació en català, parla'm en espanyol; UTF-8 sense BOM;
 (5) git està a E:\PortableGit\bin\git.exe; missatges de commit en ASCII.
Estat conegut: versió 0.9.8, branca main neta (= origin/main), ALL GREEN (setup 35/35 · js 65/65 · smoke 974/974 · dead 0 · jsx intacte).
Cua: 18 bugs per validar en viu (BUGS.md §1.1), 9 implementacions per validar (FEATURES.md §2), 7 per implementar (FEATURES.md §3), 2 decisions meues pendents (BUGS.md §1.3).
TASCA D'ARA: <TASCA>
No toques res fins que et confirme què has entés del handoff i quin és el primer pas.
```

## 7 · Historial de traspassos

| Data | Què es va tancar | Commits |
|---|---|---|
| 2026-11-06 | #224 (REOMLIR) implementat · #226 descartat · versió 0.9.8 · catàlegs quadrats · handoffs fusionats a `docs/archive/` | `16b29fa` · `26af9d3` · `70e9828` · `125ca54` |

