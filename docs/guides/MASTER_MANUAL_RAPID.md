# ⚡ MASTER · Manual ràpid d'operació — FAST >>> PASS (v2.9.5)

> **Document MASTER** (procediment d'ús diari). Substituïx el contingut de
> [`USER_GUIDE.md`](USER_GUIDE.md), que queda com a resum derivat.
> Referència exhaustiva de cada botó: [`MASTER_FUNCIONALITATS.md`](MASTER_FUNCIONALITATS.md).
> Última revisió: **2026-10-23**.

---

## 0. Abans de començar (una sola volta)

1. **Setup (⚙️) → Config Gral**
   - **Nom de l'Editor (Nick)**: el teu identificador (`autor`). Servix per a:
     - el `.lock` del projecte (**treball duplicat**),
     - el token `{autor}` i el nom amb `{project}`,
     - el nom de la seqüència i exportacions.
   - **Rutes d'infraestructura (7)**: plantilla del canal, motor de rètols, biblioteca de conductors, projectes (`destino_base`), grafismes del dia, SRT de 15 min, SRT sintètics.
   - **Destins d'exportació (3)**: publicació 1, publicació 2 i portades. Admeten `{project}` (p. ex. `...\{project}`) per a una carpeta per projecte.
2. **Tabs de programa** (`TNs`, `Sumari`, `Fotomató`, `User Dev`): mapa de **pistes** i **programes** (`id`, `archivo`, `wott`, `dir`, `conductor`, `escaletaId`).
3. **`presets\`**: hi ha d'haver un `.epr` vertical vàlid (> 1 KB). Si el render diu «Falta el preset» o «preset massa petit», és això.
4. Comprova que el **motor JSX** ha carregat (si no, el botó MAIN queda en `ERROR`).

> Els 🧪 **PROVA** de cada ruta i el **PROVA** de plantilles de `setup.html` resolen la ruta amb un context d'exemple: servix per descartar errades de xarxa abans de culpar el flux.

---

## 1. Flux canònic d'un bloc (10 passos)

> Mode **TREBALL** (`👤`) per a producció. El `🧪` TEST només per provar fases soltes.

| # | Acció | Com saber que va bé |
| :-- | :--- | :--- |
| 1 | **PROG + BLOC** | Els semàfors `ESC/MP4/WOT` comencen a informar |
| 2 | **`📷 FOTO`** (quan el bloc s'està emetent/acaba) | `ESC` verd (o groc si encara en emissió) i log `[ER:Fetch] … estimat avui: PROxxxx` |
| 3 | Espera el **MAIN** | El botó passa de `MASSA D'HORA` → `ESPERA` → **`CREA`** (sol, cada 15 s) |
| 4 | **`CREA`** | Projecte obert, rètols al Bin `CHY`, portada al Bin `PORTADES`, clip a V1 a 00:00 |
| 5 | Verifica **bounds** al timeline | El clip comença on ha d'arrancar el bloc; si el bloc cau **fora del cleanFeed**, V1 estarà **buit** (es completa amb `ACTUAL.`) |
| 6 | **`IN`** i **`OUT & GO`** | `IN` deixa el contingut a 0; `OUT & GO` tanca la peça i col·loca marcadors |
| 7 | Verifica **marcadors** | Cada ítem de l'escaleta té el seu marcador (ordre i colors) |
| 8 | **`🎯 COL·LOCAR`** | Conductor, Tema-Títol (+ transicions del titulillo), Lloc/Nom, Resto, traduccions, IPD automàtic i grafismes MAPA |
| 9 | Retocs | Slider PAN, KEYFRAME, IPD / IPD+ / 🪟🪟, 🎨 / 🗺️ / 🗿, ↔️ traduccions, 🔀 intro |
| 10 | **Subtítols → 📹 VÍDEO → 🖼️ PORTADA → ✅** | SRT a S1/S2, MP4 a `render1`+`render2`, PNG a `portades`, projecte guardat i tancat |

### 1.1 Detall dels passos crítics

**2 · FOTO.**
- Sense PROG/BLOC no fa res (avisa).
- Si el bloc ja s'ha emés, la foto és l'escaleta definitiva. Si encara s'emet, permet **CREAR provisional** i completar després amb `ACTUAL.`.
- `Ctrl+FOTO` = foto d'**AHIR** (correcció).

**3-4 · Espera i CREA.**
- `ESPERA` = ja hi ha el MP4 origen però falten wotts.
- `MASSA D'HORA` = no hi ha ni MP4 ni wotts. **Clic = repintat immediat** (no cal esperar els 15 s).
- `BLOQUEJAT: <autor>` = un company té el projecte obert. Coordina-ho o força (el clic obri igualment, amb `forceOverride`).
- El **CREAR** fa: bounds del bloc → extracció del clip del cleanFeed (FFmpeg) → obertura de plantilla → ingesta de **rètols** + **portada** → clonatge i renombratge de la seqüència → inserció del clip a V1 (start=0) → manifest/sessió.
- **Sense tema** (paraula reservada: INTRO, TE, P2…) no es pot resoldre `{project}`: revisa l'escaleta.

**6 · IN + OUT & GO (TREBALL).**
- `IN`: retalla la capçalera fins al cabezal, OUT desplaçat, marcadors recol·locats, CTI a 0.
- `OUT & GO`: OUT → TROSSEJA → Dedu → Prev → Correl → Density → Inferits → Ordre → Gràfics → Vermells + **snapshot** de marcadors.
- Si V1 ja té ≥ 2 clips, OUT i TROSSEJA s'ometen (només refà marcadors).

**8 · COL·LOCAR.**
- Si detecta marcadors **IPD**, aplica zoom+posició al tram.
- Si hi ha marcadors **grocs amb `MAPA`** al títol, col·loca el grafisme del dia; si no troba fitxer, obri el navegador.
- Els grafismes **cremats** (TITOLET, PREGUNTA, CARTELL…) es rastregen al clip per color+OCR **només** si l'ítem porta eixa etiqueta i el wott no porta `tc`.

**10 · Sortida.**
- `💾 GUARDAR` (SRT) exporta a **S1** (SINT → **S2**; `Ctrl` força S2).
- `📹 VÍDEO` renderitza directe amb el preset i publica a `render1` + còpia a `render2`, amb nom `PROG_TEMA_HH_MM`.
- `🖼️ PORTADA` genera el PNG **amb el mateix nom** a `portades` (10–30 s; el botó es bloqueja).
- `✅` guarda, tanca i elimina el `.lock`.

---

## 2. Subtítols (mini-flux)

1. **`⬇️` CARREGAR** → obri a l'editor el `.srt` del **bloc de 15 min**.
   - `Ctrl+clic` = **SINT** del dia; un segon `Ctrl+clic` torna al normal.
2. **`IN` / `OUT`** al panell de subtítols: retallen la taula pel cabezal (IN deixa 0,4 s de coixí al davant).
3. **Edició a l'editor**:
   - clic a la **regla** = moure el cabezal; clic al **centre d'un clip** = seleccionar;
   - `Ctrl+clic` = multi-selecció, `Shift+clic` = rang, `Supr` = esborrar;
   - **clic dret** = crear/levar marcador (snap al límit del subtítol);
   - **arrossegar un marcador** = acordió (estira/encongeix el tram i mou la cua);
   - barra inferior = zoom/desplaçament.
4. **`🧩` REOMLIR** (opcional): afig els SINT que cauen dins d'un buit (vista MOD; no modifica el SRT original).
5. **`💾 GUARDAR`** → exporta la taula al timeline (S1; SINT a S2; `Ctrl` força S2).
6. **`♻️ RESET`** si t'has embolicat: buida marcadors (memòria i disc), trau els subtítols de la seqüència i recarrega el mateix `.srt`.
7. **`Supr`** (o `Backspace`) per a esborrar una entrada concreta: sel·lecciona-la al canvas i prem la tecla (pregunta si també l'ha d'esborrar del timeline). *El botó `🗑️` es va retirar el 2026-10-23: feia el mateix.*

> El que edites viu a la **taula**. Al timeline no arriba res fins a `💾 GUARDAR`.

---

## 3. Checklist ràpid (imprimible)

- [ ] `autor` correcte al Setup (no treballar amb el d'un company).
- [ ] PROG + BLOC triats; semàfors coherents.
- [ ] `FOTO` feta **del dia** correcte (Ctrl = ahir).
- [ ] MAIN en `CREA` (o `ACTUAL.` si ja existia).
- [ ] Bounds verificats; si V1 buit → `ACTUAL.` quan arribe la ingesta.
- [ ] `IN` i `OUT & GO`; marcadors verificats (ordre/colors).
- [ ] `🎯 COL·LOCAR`; repassar conductor, tema-títol i titulillo.
- [ ] Retocs visuals (slider/KF/IPD/DF/grafismes).
- [ ] Subtítols: carregar → editar → exportar.
- [ ] `📹 VÍDEO` + `🖼️ PORTADA` (noms coincidents).
- [ ] `✅` (guarda + tanca + lleva el lock).

---

## 4. Què fer si… (troubleshooting ràpid)

| Símptoma | Causa més probable | Què fer |
| :--- | :--- | :--- |
| MAIN en **MASSA D'HORA** i no canvia | El bloc no s'ha emés (ni MP4 ni wotts) | Clic per forçar repintat; espera; comprova PROG/BLOC; `Ctrl` per a AHIR si toca |
| MAIN en **ESPERA** | Hi ha MP4 però falten wotts | Espera (passa sol a CREA) |
| **BLOQUEJAT: <altre>** | `.lock` d'un altre editor | Coordina; si és un lock mort, `✅`/RESET al seu equip o força el clic |
| `CREA` no fa res / error d'escaleta | Escaleta no trobada o de bloc/dia equivocat | Torna a fer `FOTO` (mira el motiu de l'API al log) |
| Projecte creat **sense V1** | Bloc fora del rang del cleanFeed / ingesta curta | Espera la ingesta i prem **`ACTUAL.`** |
| `IN` retalla massa | Cabezal massa avant | `Ctrl+Z` i mou el cabezal; el log diu quants segons s'han tallat |
| `OUT & GO` no col·loca marcadors | Estàs en **TEST** | Passa a **TREBALL** (`👤`) |
| Marcadors desordenats | Fases antigues o material estrany | `F6 Ordre`; si cal, `3·C1` (TEST) |
| Chyrons a llocs rars | Marcadors no verificats / cas d'intro equivocat | Verifica marcadors; prova `🔀` (A/B o `Ctrl` = AUTO) |
| Els grafismes no apareixen | No hi ha fitxer amb eixe nom a la carpeta del dia | Revisa `rutas.grafismos\{fecha}`; 🎨 obri el navegador si no coincidix |
| IPD no es desfà | Estat guardat d'una sessió anterior | Torna a clicar `IPD` (toggle) o aplica Motion a mà |
| DF/IPD+ fallen | CTI fora del clip / pistes bloquejades / V3 ocupada | CTI damunt del clip, pistes desbloquejades, revisa el log del PAS que falla |
| ⬇️ no carrega SRT | No hi ha SRT del bloc de 15 min del dia | Comprova `rutas.subtitulos` i el dia de treball; `Ctrl` per a SINT |
| Els subtítols no apareixen al timeline | Faltava `💾 GUARDAR` | Exporta; revisa que estigues a S1/S2 |
| El SRT exportat ix desplaçat | S'ha exportat amb un IN distint | Refés `IN` de subtítols i torna a exportar |
| **Portada** ix amb rètols o d'un altre frame | No s'ha pogut fixar el cabezal / zona no neta | Torna-ho a provar (el flux avorta si el CTI no qualla); revisa el log de `[Portada]` |
| Render fallit | Preset inexistent/buit o OUT no definit | Revisa `presets\` i l'OUT de la seqüència |
| Render sense carpeta pròpia | `{project}` no resol (falta tema) | Comprova el tema de l'escaleta; el log avisa del token caigut |

---

## 5. Regles d'or

1. **No canviïs de projecte obert** a mitges: el panell treballa sobre el projecte obert i la seua carpeta.
2. **Un bloc = un projecte = un dia.** Si dubtes, `🔄 RESET` (destructiu) abans de barrejar material.
3. **No faces `IN`/`OUT` sense mirar el cabezal.** `IN` no demana confirmació.
4. **Verifica marcadors abans de 🎯**: els chyrons pengen d'ells.
5. **El SRT s'edita a l'editor i s'exporta amb 💾**; res arriba al timeline sol.
6. **No tanques Premiere a mà** mentre el panell treballa: usa `✅`.
7. **Si una ruta falla**, primer el 🧪 del Setup; després mira el log (`FASTPASS.log`).
8. **ExtendScript (`jsx/`) no es toca** sense coordinació (vegeu `bin\check_all.ps1` i `docs/guides/CODE_OWNERSHIP.md`).

---

## 6. Mini-glossari

- **CleanFeed**: senyal neta del programa; el clip del bloc s'extrau d'ací amb FFmpeg.
- **Bounds**: punts d'entrada/sortida del bloc dins del cleanFeed (amb *handles*).
- **Marcador faro / estructural**: marcador que obri un ítem de l'escaleta i a què es pengen la resta.
- **Dedu / Prev / Correl / Density / Inferits / Ordre**: fases de col·locació de marcadors.
- **SINT**: subtítols sintètics (vegades generats automàticament); viuen a `S2`.
- **MOD**: vista de fusió SRT normal + SINT en buits.
- **Zona neta (portada)**: còpia temporal del clip en una pista lliure per capturar el frame sense capes.

---

© 2026 FAST >>> PASS · Manual ràpid MASTER (v2.9.5)

