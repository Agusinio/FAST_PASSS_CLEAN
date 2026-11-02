# 🛠️ GUIA DE DESENVOLUPAMENT - FAST >>> PASS

Aquest document detalla el flux de treball, els estàndards de codificació i el sistema de versionat per al projecte FAST >>> PASS.

---

## 🚀 FLUX DE TREBALL (GIT WORKFLOW)

El projecte segueix un model de **Feature Branches** per garantir l'estabilitat de la rama `main`.

### 1. Sistema de Rama
- **Rama Principal**: `main`. Sempre ha de contenir codi estable i llest per a producció.
- **Rames de Fix/Feature**: `fix/[NUMERO]-[descripcio]` o `feat/[NUMERO]-[descripcio]`.

### 2. Procés de Commit
S'ha de seguir una estructura de missatges clara:
```text
Fix #[NUMERO]: [Títol del problema]

[Descripció detallada del canvi]

Canvis:
- [Canvi 1]
- [Canvi 2]

Arxius modificats:
- [fitxer1.js]
```

### 3. Comandes Freqüents
```bash
# Crear nova rama de treball
git checkout -b fix/047-descripcio-del-bug

# Guardar canvis
git add .
git commit -m "Fix #047: Títol descriptiu"

# Integrar a main
git checkout main
git merge fix/047-descripcio-del-bug
```

### 4. ⚠️ Git en esta màquina (27/10/2026)

- **`git` NO està al `PATH`.** L'executable és el portable:
  `E:\PortableGit\cmd\git.exe` (git 2.49 · abans vivia a `%LOCALAPPDATA%\PortableGit`, ara a `E:`).
- El repo viu a `…\Adobe\CEP\extensions\FAST_PASSS` i **no** és del mateix usuari que executa
  l'agent → cal passar-hi `-c safe.directory=*` (si no: `dubious ownership`).
- **Credential helper = `wincred`** (la credencial `git:https://Agusinio@github.com` ja està al
  Administrador de credencials de Windows). El `CredentialHelperSelector` de PortableGit s'obri si
  el system config diu `helper = helper-selector` → ja corregit a
  `E:\PortableGit\etc\gitconfig`.
- El repo té **proxy** a `.git/config` (`http://172.20.0.152:8088`); si el push es penja, eixe és el
  primer sospitós (provar `-c http.proxy=`).
- Ordre tipus (1 línia, sense pager):

```powershell
$git='E:\PortableGit\cmd\git.exe'; $env:GIT_PAGER='cat'; $env:GIT_TERMINAL_PROMPT='0'
& $git -c safe.directory=* add -A
& $git -c safe.directory=* -c i18n.commitEncoding=UTF-8 commit -F <missatge.txt>
& $git -c safe.directory=* -c credential.helper= -c credential.helper=wincred push origin main
```

---

## 📏 ESTÀNDARDS DE CODIFICACIÓ

### 1. Nomenclatura (Naming Conventions)
- **Idiomes**: 
    - **Codi (JS/JSX)**: Anglès per a funcions i variables globals (`getWorkSequence`, `createFolder`).
    - **UI/Metadades**: Català per a etiquetes, logs de consola i valors de negoci (`nomTema`, `conductor`).
- **Estil**: `camelCase` per a funcions i variables. `UPPER_CASE` per a constants.

### 2. Arquitectura de Control d'Errors
- Totes les crides de bridge (JS -> JSX) han de retornar un prefix `ERR:` en cas de fallada.
- La funció `FASTPASS_UI.Utils.callJSX` gestiona automàticament aquests prefixos per llançar excepcions controlades.

### 3. Gestió de Rutes UNC (NAS)
- **Capa JS**: Responsable de la sanitització de noms i creació recursiva de carpetes (`ensureFolders`).
- **Capa JSX**: Responsable de l'execució atòmica (`saveAs`, `import`) utilitzant objectes `File` natis de Premiere.
- **Rastreig (2026-10-29 · BUG #204)**: **mai** llistar una carpeta UNC amb `Utils.readFolder` si
  només calen els noms o la data d'uns pocs fitxers. `IO.scanDirectory` demana `length`, `modified`
  i `created` de **cada** fitxer (cada getter és una consulta SMB des del motor d'ExtendScript) i
  **obri el fitxer** quan `length` ve 0 (habitual en `.mov` per UNC): 103 s amb 1281 fitxers en fred.
  Mesurat des de .NET el mateix dia: 1281 noms en **2 ms** i 1281 `FileInfo` amb `created` en **3 ms**.
  Patró: `cep.fs.readdir` (noms) → filtre per nom → `cep.fs.stat` **només dels candidats** → caché
  persistent (`fp_wott_dates_v1`). Implementació de referència: `Scanner._listNamesNative` +
  `Scanner._dateCandidates` (`js/logic/Scanner.js`). **Node no està disponible en este equip i no
  s'ha d'usar mai com a requisit**: `cep.fs` + fallback a JSX cobreix tot el que cal.

---

## 🎯 PROTOCOL DE VALIDACIÓ (NORMA · 2026-10-22)

**Una ordre, una línia.** `bin/check_all.ps1` és l'única porta d'entrada de la validació:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\bin\check_all.ps1"
# ALL GREEN | setup 29/29 | js 61/61 | smoke 369/369 | dead 0 | jsx intacte     (exit 0)
```

- El detall queda a `%TEMP%\fp_check_all\<control>.txt`; per consola només ixen els `FAIL`
  (màxim 8 per control). **No cal llegir la sortida sencera de cada prova.**
- **Validació selectiva** — no passar-ho tot cada volta:

| Toc… | Opció |
|---|---|
| `docs/**` o comentaris | (res; `-Only dead` si s'afigen/esborren fitxers) |
| `js/**` | `-Only js,smoke` |
| `setup.html`, `setup.css`, `scripts\pick_folder.ps1` | `-Only setup` |
| `bin/**` | `-Only dead` + el control afectat |

Cada control també es pot llançar sol (`check_js_v8.ps1`, `check_dead.ps1 -ListAll`,
`fp_probe_setup_ui.ps1 -FailOnly`), però **`check_all` és el que es documenta i s'usa**.

### ⛔ EXTENDSCRIPT INTOCABLE (`jsx/`)

`jsx\main.jsx` i `jsx\modules\*.jsx` són el *múscul*: el DOM de Premiere. Moltes funcions JS
depenen del seu **contracte exacte** i un canvi "de passada" trenca funcionalitats senceres.

1. **Permís exprés abans de tocar-hi.** No s'edita cap `.jsx` sense autorització explícita.
2. **Només si és absolutament necessari.** Si es pot compondre amb àtoms **existents** des de JS,
   es fa en JS.
3. **Atòmic.** Una funció, un motiu, un canvi; mai refactors ni retocs cosmètics.
4. **Traçabilitat.** `check_all.ps1` compara el SHA256 de cada `.jsx` amb `bin\jsx_baseline.json`:
   si canvia sense re-sellar, la línia ix **`jsx MODIFICAT (n)`** i el procés acaba en **exit 1**.
   Després d'un canvi autoritzat i validat: `.\bin\check_all.ps1 -AcceptJsx`.

Detall: `README.md` §4 (regla 3) i `BUGS.md` §3 (com s'actualitza el catàleg).

---


## ⏱️ DIAGNÒSTIC D'ARRENCADA LENTA (2026-09-29)

La càrrega inicial del panell (`Context.init` → `checkContext`) pot trigar molt. Per
saber **on** es va el temps hi ha un log de fites: `_boot_timing.log`.

| Què | Com |
|-----|-----|
| Fitxer (carpeta de l'extensió) | `<extensió>\_boot_timing.log` |
| Còpia de seguretat | `C:\temp\_boot_timing.log` |
| Ruta des de JS | `FASTPASS_UI.Boot.logPath()` |
| Obrir el log | `FASTPASS_UI.Boot.openLog()` (ShellExecute; fallback Notepad via `IO.executeShell`) |
| Marcar una fita nova | `FASTPASS_UI.Boot.mark('[ElMeuModul] fase X')` |
| Marcar una fita **lenta** (post-arrencada) | `FASTPASS_UI.Boot.mark('[ElMeuModul] fase X', null, <ms del tram>)` — sense el 3r paràmetre el filtre compara el `Δ` entre marques, i un cicle de fons de 15 s hi entra sempre encara que duràs 3 ms (2026-10-30) |

**Format**: `+<ms des de l'inici> ms  (Δ<ms des de la marca anterior>)  <etiqueta>`.
`Δ` gran = la fase anterior és la culpable.

**Auto-obertura**: si l'arrencada supera el llindar (per defecte 15 s) el log s'obre
tot sol en acabar (una sola vegada per sessió). Es canvia amb:

```js
FASTPASS_UI.Boot.setAutoOpen(0)      // desactivat
FASTPASS_UI.Boot.setAutoOpen(30000)  // només si passa de 30 s (es guarda a localStorage)
```

**Esperes DESPRÉS de l'arrencada** (2026-10-29 · BUG #204): el log es tancava a
`ARRENCADA COMPLETA` (~330 ms) i tot el que passava després —l'escaneig del NAS, que en
fred bloqueja el panell 1-2 min— no quedava enlloc. Ara hi ha una **finestra
post-arrencada** (3 min) en què només es desen les marques **lentes** (Δ ≥ 400 ms), amb
el prefix `[post]`; la primera deixa rastre a `_boot_timing_hist.log`
(«1a espera post-arrencada»), així el rècord no pot dir 330 ms si el panell no és lliure
fins a dos minuts després:

```js
FASTPASS_UI.Boot.postWindow()                 // { ms, slowMs, until }
FASTPASS_UI.Boot.setPostWindow(180000, 400)   // 3 min · només marques > 400 ms
FASTPASS_UI.Boot.setPostWindow(0)             // desactivat
```

Mentre dura una d'eixes operacions el semàfor corresponent es pot pintar en **blau**
(«treballant», `.light.busy` a `style.css`) i restaurar en acabar:

```js
FASTPASS_UI.Core.Context.setSemaforOcupat('sem-wot', 'Analitzant els rètols del NAS…');
// … operació llarga (readFolder UNC via JSX) …
FASTPASS_UI.Core.Context.setSemaforLliure('sem-wot');
```

⚠️ El fil del WebView queda **bloquejat** dins d'eixa crida: només l'animació CSS seguix
viva. Per això el semàfor ha de canviar **abans** de tocar el NAS.

**Fites ja instrumentades** (`4_Context.js`): `init · selectors`, `readFolder NAS`,
`escaleta getStatus`, `escaleta local/FOTO`, `scan media+wotts`, `projecte obert+lock (JSX)`,
`semàfor assets (4 crides)`, `semàfor NEW`, `TOTAL`, `syncConductorUI · NAS conductors`.

> Un cop escrit `ARRENCADA COMPLETA`, les marques posteriors (auto-refresc de 60 s) ja no
> s'escriuen al fitxer per no embrutar-lo; només a consola.

**Test de humo** (V8/Edge headless, executa el bloc real amb stubs):
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\temp\fp_boot_test.ps1
```

---

## 📊 BASELINE I VERSIONS
- **V7.0.1 (Jan 2026)**: Establiment del baseline de seguretat (Fixes crítics de debugger, JSON i rutes).
- **V9.0.0 (Jan 2026)**: Estabilització de la base de producció.
- **V2.9.5 (Current)**: Edició Tàctica (Tactical Overhaul) amb interfície optimitzada i "The Magic" Assembly.

---
© 2026 FAST >>> PASS | Development Guide v1.0
