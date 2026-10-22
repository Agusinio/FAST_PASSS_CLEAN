# FAST >>> PASS — Extensió CEP per a Adobe Premiere Pro

**Versió:** 2.9.5 (LIPO-PRO) · **Paquet de distribució** (codi net + documentació, sense eines internes)
**Estat:** estable · en producció interna

---

## 1. Què és

**FAST >>> PASS** és una extensió CEP per a Adobe Premiere Pro que automatitza el flux d'edició
dels informatius (TN COMARQUES · TN MIGDIA · TN VESPRE) i la **verticalització 9:16**:

- **NOU** — crea el projecte des de plantilla `.prproj`, importa el cleanFeed amb *trim* de precisió,
  els rètols (wotts), els SRT i les portades, i munta el bloc a la timeline.
- **VÍDEO** — edició ràpida (IN/OUT amb ripple, navegació entre clips, reframing X, keyframes).
- **RÈTOLS / GRAFISMES / TRADUCCIONS / SUBTÍTOLS** — col·locació automàtica de wotts, grafismes cremats,
  traducció i editor SRT amb waveform.
- **MAPA / MARCADORS** — marcadors d'ítem de l'escaleta sobre la timeline.
- **EXPORTAR** — MP4 a la carpeta de publicació (preset `presets/*.epr`) i **portada PNG** a la
  carpeta de portades publicades. La portada és el PNG amb el literal **`PORTADA`** al nom i es treu
  de l'**ítem ja importat** (bin `PORTADES`); només s'escaneja el NAS si el projecte encara no en té
  cap (abans: 1.028 fitxers → 93 s per clic).

El botó principal, quan encara no hi ha projecte del dia, només pot estar en un d'aquests tres estats
(es repinta sol cada 15 s):

| Estat | Quan | Què fa |
| --- | --- | --- |
| **MASSA D'HORA** | ni MP4 origen ni wotts del bloc | semàfors en roig; espera |
| **ESPERA** | MP4 origen sí, wotts encara no | espera (el bloc s'està emetent/ingestant) |
| **CREA** | wotts del bloc (ja s'ha emés) | crea el projecte del dia |

Un clic **sense Ctrl treballa SEMPRE amb la data d'avui** (encara que el panell vinga d'una sessió amb
el projecte d'ahir obert). Per a un projecte d'ahir cal **Ctrl+clic** (mode correcció) — obligatori.

Els fluxos els dirigeix el **botó principal**, que canvia d'estat segons el context
(`NOU` → `OBRIR` → `ANAR-HI` → `ACTUALITZAR`). Detall a [`docs/guides/USER_GUIDE.md`](docs/guides/USER_GUIDE.md)
i [`docs/guides/GUIA_BOTONERA.md`](docs/guides/GUIA_BOTONERA.md).

---

## 2. Contingut del paquet

| Ruta | Què hi ha |
|------|-----------|
| `index.html`, `style.css` | Interfície del panell (UI). |
| `setup.html` | Pàgina de configuració física (llegeix i desa `Profile.json`). |
| `Profile.json` | Configuració: autor, rutes de xarxa (NAS), tracks i programes. |
| `CSXS/manifest.xml` | Manifest CEP (ID d'extensió, versió de PPRO, port). |
| `js/` | **JavaScript (el cervell)**: workflows, lògica, inspectors, core, editors. |
| `jsx/` | **ExtendScript (el múscul)**: àtoms per al DOM de Premiere (`jsx/main.jsx`). |
| `presets/` | Presets d'exportació `.epr` (H264 vertical 2 passades). |
| `bin/` | Scripts de suport (validació de sintaxi, anàlisi d'escaletes, OCR, utilitats). |
| `docs/guides/` | Arquitectura, propietat del codi, guia d'usuari, botonera, desenvolupament, Git. |
| `docs/specs/` | Especificacions: escaleta JSON, classificació d'ítems, colors de marcador, NNEWS. |
| `docs/reference/` | Material de referència: keyframes, parser, temps OnAir, TITOLET, mostres Adobe. |
| `docs/BUGS_FIXED.md` | **Registre de bugs** (resolts amb causa arrel i solució + pendents). |
| `docs/CHANGELOG.md` | Historial de commits del repositori. |

---

## 3. Instal·lació

Vegeu **[INSTALL.md](INSTALL.md)** (copiar la carpeta, habilitar extensions sense signar i comprovar el panell).

---

## 4. Arquitectura: 5 capes (*Brain vs Muscle*)

| Capa | Directori | Responsabilitat |
|------|-----------|-----------------|
| **1. WORKFLOW** | `js/workflows/` | Orquestració del flux de negoci (`flow_*.js`): NOU, CUT, SRT, RENDER, MP4… |
| **2. ACTION LOGIC** | `js/logic/` | Transformacions pures: parseig de metadades, escaneig del NAS, càlcul de timeline. |
| **3. INSPECTORS** | `js/inspectors/` | Lectura de l'entorn de Premiere (app, seqüència activa, recursos origen). |
| **4. CORE** | `js/core/` | Estat global, configuració (`11_Configuracio.js`), utilitats, escaleta. |
| **5. SYSTEM (JSX)** | `jsx/` | Àtoms ExtendScript per al DOM de Premiere. **Cap lògica de negoci.** |

Regles d'or del projecte:

1. **JavaScript = cervell** (CEP/Chromium: `window.cep.fs`, strings, validació de rutes UNC).
2. **ExtendScript = múscul** (només DOM de Premiere; funcions atòmiques via `callJSX`).
3. **La capa JSX està TANCADA i és INTOCABLE** ⛔ — per afegir funcionalitat, compondre crides JSX
   **existents** des de JavaScript; no crear mètodes JSX nous (tret d'una interacció realment nova
   amb el DOM). `jsx/main.jsx` i `jsx/modules/*.jsx` són el *múscul* de Premiere i el seu contracte
   el comparteixen moltes funcions JS, així que **abans de canviar-hi res cal permís exprés** i
   només si és **absolutament necessari**; el canvi ha de ser **atòmic** (una funció, un motiu) i
   mai "aprofitant que hi sóc" ni un refactor. `bin/check_all.ps1` guarda un baseline SHA256 a
   `bin/jsx_baseline.json` i crida **`jsx MODIFICAT`** si un `.jsx` canvia de bytes; després d'un
   canvi autoritzat i validat es re-sella amb `-AcceptJsx`.
4. **Rutes UNC**: crear l'arbre de directoris amb `getUtils().ensureFolders(...)` **abans** de
   `saveAs`/`import` (Premiere és fràgil amb xarxa; JS no).
5. **Sanititzar** els textos dinàmics amb `getUtils().sanitizeName()` abans de passar-los a JSX.
6. **Logging** amb `getUtils().log(msg, level)` (`"high"`, `"normal"`, `"low"`).

Detall: [`docs/guides/ARCHITECTURE_MAP.md`](docs/guides/ARCHITECTURE_MAP.md) i
[`docs/guides/CODE_OWNERSHIP.md`](docs/guides/CODE_OWNERSHIP.md).

---

## 5. Configuració

- **`Profile.json`** — configuració física (autor, rutes NAS, tracks per estructura, programes).
  S'edita amb **`setup.html`** (*GUARDAR CONFIG*), que llegeix i escriu el fitxer amb els àtoms
  `IO.readTxt` / `IO.writeTxt`.
  ⚠️ El codi de runtime porta els **valors per defecte i actius** a `js/core/11_Configuracio.js`
  (hi ha comentaris que adverteixen que `Profile.json` no es llegeix en alguns camins): abans de
  canviar una ruta o un track, **reviseu primer `11_Configuracio.js`**.
- **`CSXS/manifest.xml`** — ID d'extensió i port. Aquest paquet fa servir `com.fastpass.dist` i el
  port `8908` per poder conviure amb una altra còpia instal·lada al mateix equip.

---

## 6. Dependències externes (no incloses al paquet)

| Dependència | Ús | Com la troba el codi |
|-------------|----|----------------------|
| **ffmpeg / ffprobe** | Talls de precisió, extracció de clips, conversió | `js/logic/15_FFmpeg_Logic.js` cerca, en aquest ordre: `bin\ffmpeg\bin\ffmpeg.exe` (dins de l'extensió), `C:\Program Files\Dalet\DaletPlus.409526\bin\ffmpeg.exe`, `E:\ffmpeg\bin\ffmpeg.exe`, `C:\Program Files (x86)\OpenVideoDownloader\...\ffmpeg.exe` |
| **PowerShell 5.1** | Scripts de suport de `bin/` (OCR, escaletes, anàlisi de `.prproj`) | Crides des de JS |
| **NAS corporatiu** | Escaletes, material, exports, portades | Rutes de `Profile.json` / `11_Configuracio.js` |
| **Plantilla `.prproj`** | Base dels projectes nous | Ruta `rutas.plantilla` |

> Els binaris d'ffmpeg **no s'inclouen** (pes). Si el vostre equip no en té cap dels candidats,
> copieu-los a `bin\ffmpeg\bin\`.

---

## 7. Validar el codi abans de tocar res

**Norma (2026-10-22) — la validació és d'UNA línia.** `bin/check_all.ps1` executa tots els
controls en un procés fill, deixa el detall a `%TEMP%\fp_check_all\` i per consola només trau el
resum (més els `FAIL`, si n'hi ha). No cal llançar quatre ordres ni llegir 400 línies:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\bin\check_all.ps1"
# ALL GREEN | setup 29/29 | js 61/61 | smoke 369/369 | dead 0 | jsx intacte     (exit 0)
```

| Control | Script | Què comprova |
|---|---|---|
| `setup` | `bin\smoke\fp_probe_setup_ui.ps1` | Finestra de config: `<script src>` existents, taula de programes, DOM real (Edge headless) i diàleg modern de carpetes |
| `js` | `bin\check_js_v8.ps1` | Sintaxi **real** de tots els `.js`/`.jsx` amb V8 (`new Function`) |
| `smoke` | `bin\smoke\fp_smoke_build.ps1` | Harness del manifest (AnalysisCenter, SessionManifest, lògica, workflows) |
| `dead` | `bin\check_dead.ps1` | Codi mort a `js/` i `jsx/` (fitxers sense carregador) |
| `jsx` | (intern) | SHA256 de `jsx/**/*.jsx` contra `bin/jsx_baseline.json` — **norma ExtendScript** |

**Què cal passar segons què es toca** (estalvia temps i soroll):

| Toc… | Valida |
|---|---|
| Només `docs/**` o comentaris | res (o `-Only dead` si s'han afegit/esborrat fitxers) |
| `js/**` | `-Only js,smoke` |
| `setup.html`, `setup.css`, `scripts\pick_folder.ps1` | `-Only setup` |
| `bin/**` (scripts de suport) | `-Only dead` + el control afectat |
| `jsx/**` | ⛔ **permís previ obligatori** (regla 3 de §4); després `-Only js,smoke` |

Opcions: `-Only setup,js` · `-Full` (detall per consola) · `-AcceptJsx` (re-sella el baseline
després d'un canvi autoritzat). El detall complet queda sempre a `%TEMP%\fp_check_all\<control>.txt`.

Cada control també es pot executar sol: `check_js_v8.ps1` (`-ShowOk`), `check_dead.ps1` (`-ListAll`)
i `fp_probe_setup_ui.ps1` (`-FailOnly`, només els `FAIL` + el `TOTAL`).

---

## 8. Documentació

| Vull saber… | Fitxer |
|-------------|--------|
| Arquitectura i capes | [`docs/guides/ARCHITECTURE_MAP.md`](docs/guides/ARCHITECTURE_MAP.md) |
| Qui fa què a cada mòdul | [`docs/guides/CODE_OWNERSHIP.md`](docs/guides/CODE_OWNERSHIP.md) |
| Com s'usa el panell | [`docs/guides/USER_GUIDE.md`](docs/guides/USER_GUIDE.md) |
| Què fa cada botó | [`docs/guides/GUIA_BOTONERA.md`](docs/guides/GUIA_BOTONERA.md) |
| Convencions de desenvolupament | [`docs/guides/DEVELOPMENT.md`](docs/guides/DEVELOPMENT.md) |
| Flux de Git | [`docs/guides/GIT_WORKFLOW.md`](docs/guides/GIT_WORKFLOW.md) |
| Bugs arreglats i pendents | [`docs/BUGS_FIXED.md`](docs/BUGS_FIXED.md) |
| Historial de canvis | [`docs/CHANGELOG.md`](docs/CHANGELOG.md) |
| Especificacions tècniques | [`docs/specs/`](docs/specs/) |
| Referències (keyframes, parser, TITOLET…) | [`docs/reference/`](docs/reference/) |

> ⚠️ Els documents de `docs/guides/` es van escriure per al repositori de desenvolupament: poden
> esmentar eines internes (`plans/`, `.roo/`, scripts de `bin/`) que **no formen part d'aquest paquet**.
> Si un enllaç no resol, busqueu el tema a `docs/BUGS_FIXED.md` o a `docs/CHANGELOG.md`.

---

## 9. Què **no** inclou aquest paquet (i per què)

| Exclòs | Motiu |
|--------|-------|
| `.git/`, `docs/graph/` (graf de dependències), `bin/ffmpeg/` | Pes innecessari: es poden regenerar o descarregar. |
| `.roo/`, `plans/`, `docs/archive/`, `docs/plans/` | Registre intern de sessions i plans de treball (no és codi ni documentació d'ús). |
| `.env` | Conté una clau d'API privada. |
| `.clinerules`, `.debug`, `bin/hooks/` | Configuració d'eines internes de desenvolupament. |
| Logs (`*.log`) i fitxers de sistema (`._*`, `Thumbs.db`) | Brossa d'execució. |

---

## 10. Llicència

Ús intern. © 2026 FAST >>> PASS — Tots els drets reservats.


