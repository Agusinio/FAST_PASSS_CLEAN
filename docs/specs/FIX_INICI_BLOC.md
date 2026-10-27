# #193 · Inici del bloc i finestres degenerades (TNM_V1 26/10)

> **Estat**: **R1, R2, R4 i R6 APLICATS** (2026-10-27 · `ALL GREEN | js 61/61 | smoke 477/477`) ·
> **R3 i R5 pendents de decisió** (R3 només si el log mostra un `IMMUTABLE` equivocat; R5 és capa d'IN/OUT).
> **R6** (hora fora del material) va eixir de la **validació en viu del 27/10 12:52**:
> `01dir` va quedar a `00:00:03:00` perquè F2 la clavava a `00:00` (clamp) i F8 la separava 3 s.
> **Bug**: [`BUGS.md`](../../BUGS.md) #193 · **Fases**: F2 · F3.5 · F4 · F5 · F7 · F8
> **Fitxers a tocar**: `js/workflows/flow_markers.js` i `js/core/escaleta_bounds.js`
> (`jsx/` INTACTE: cap canvi al motor ExtendScript).
> **Xarxa de seguretat**: [`docs/rollback/2026-10-27_FIX_INICI_BLOC/`](../rollback/2026-10-27_FIX_INICI_BLOC/RESTAURAR.md)
> (instantànies `.orig` + `SHA256SUMS.txt` + com restaurar-les).
> **Línies citades**: estat del 27/10 (hashes a `SHA256SUMS.txt`). Si el fitxer canvia,
> busca el **text** citat ací, no el número de línia.

---

## 1 · Símptoma

Al `.prproj` de `TNM_V1` del 26/10, el bloc `01` va quedar amb **quatre marcadors al
`0,00 s`** i `01dir` —que segons l'escaleta i el material va a **00:00:34:12**— no
apareixia ni a prop.

| Ítem | `sequencia` | Què ÉS (manifest/`16_Analysis_Logic`) | On havia d'anar | On va anar (log 11:23) |
|---|---|---|---|---|
| `01 TE-1` | 25 | `classe = GRAFIC` (grafisme de títol) | sense marcador estructural | `0,00 s` |
| `01 TD-1` | 26 | `classe = GRAFIC` | sense marcador estructural | `0,00 s` |
| `01BT` | 27 | **capçalera del bloc** («bona tarda…») | `0,00 s` | `0,00 s` (per casualitat) |
| `01dir` | 28 | **vídeo** (`01dir`) | `34,50 s` = `00:00:34:12` | `0,00 s` |
| `02` | 29 | vídeo | `41,56 s` | `41,56 s` (F3.5 el va corregir) |

Les proves externes (ffmpeg `select='gt(scene,…)'` sobre el `cleanFeed`) donen tall de
escena a **34,50 s** per a `01dir` i a **41,60 s** per a `02`: la referència és bona, el
que falla és **el motor de marcadors**.

## 2 · Cadena de causa arrel (verificada, no suposada)

Les cinc baules, en l'orde en què es van produir:

| # | On | Què passa | Evidència al log |
|---|---|---|---|
| **C1** | `escaleta_bounds.js` § `_sanitizeOnAir` (prevista, ~L636-660) | La **PREVISTA** d'un ítem es dona per mentidera si és anterior al `highWater` d'OnAir, **sense cap tolerància**. `01 TE-1`/`01 TD-1`/`01BT` (`14:31:41` = 52 301 s < 52 323 s = `14:32:13`) perden la seua hora | `🕵️ [ER:Bounds] PREVISTA MENTIDERA neutralitzada: "01 TE-1" @ 14:31:41 (encadenat a una hora mentidera…)` ×3 |
| **C2** | `escaleta_bounds.js` § IN/OUT del bloc (~L879-882) | Sense cap hora pròpia enlloc del bloc, `blockRefSec = null` → el bloc cau al **Tier0-IN cross-agrupació** = `14:32:13` | `[ER:Bounds] … blockRef(agr 01)=null → Tier0-IN cross` |
| **C3** | `flow_markers.js` § `_classifyItems` (L446-455, abans del test de gràfic de L461) | `01 TE-1`/`01 TD-1` **són gràfics pel sufix** (`TE`, `TD`) però **no tenen hora** → cauen a `unplacedItems` **abans** que ningú mire si són gràfics. Resultat: `3 estructurals, 0 gràfics, 3 sense hora` | `📋 Items: 3 estructurals, 0 gràfics, 3 sense hora (a deduir a F5)` |
| **C4** | `flow_markers.js` § `_pickStartItem` (L1230-1250) | Només mira `structuralItems`; `01BT` (la capçalera, sense hora) viu a `unplacedItems` → **no és candidat**. El primer estructural és `01dir` (seq 28) → s'enduia el 🔒 d'inici | `🟢 [F2·Deduced] 01dir … a 00:00` |
| **C5** | `flow_markers.js` L2043 (`if (tk <= 0.15) → IMMUTABLE`), L1911 (`esInici = time<=0.15 ‖ prefix==inici`), L2202 (`_frozen[inici]=true`) | La immunitat «faro de faros» es dona **per POSICIÓ**, no per identitat: qualsevol marcador a `0,00 s` queda congelat encara que F2 l'haja triat malament. F3.5 veu `Δ = 1,360 s` però no el pot aplicar; F4/F5 tampoc (L2729 `_frozen`) | `⏭️ [ASIG] 01dir: marcador d'inici a 00:00 → IMMUTABLE (faro de faros)` |
| **C6** | `flow_markers.js` § `placeInferredItems` F5 (L2736-2757) | Per als tres ítems sense hora, el veí «anterior» i el «següent» **són el mateix marcador** (`01dir@0`): finestra `[0,00 → 0,00]` → `hi - lo < 1,0` → `continue`. F7·Cobertura els apila a `max(0, next − 0,5)` = **0** | `🔎 [F5·Inferits] 01dir: finestra [01dir@0.00s → 01dir@0.00s]` → `⚠️ finestra massa estreta` |

**Conclusió**: F8·Separació (ja implementada, `#192`) és només el pedaç que evita que
quatre marcadors compartisquen el mateix fotograma; **la causa** és C1-C6. Arreglar F8 sol
no posa `01dir` al seu lloc: el deixa «separat però en el lloc equivocat».

---

## 3 · Els retocs, un a un

Orde d'aplicació obligatori (cada un depén de l'anterior): **R1 → R2 → R3 → R4 → (R5 opcional)**.
Cada retoc és **independent i reversible** (vegeu §6.3).

### R1 · `_isGraphicByNum` mana ABANS que «sense hora»

* `js/workflows/flow_markers.js` · `_classifyItems` (bucle L440-473). **CAUSA C3.**

**ABANS** (L446-455; el test de gràfic és MÉS AVALL, a L461):

```js
const horaRef = line.horaEntradaOnAir || line.horaEntradaPrevista;
if (!horaRef || horaRef === "00:00:00") {
    if (line.agrupacio && line.flotant !== true) {
        unplacedItems.push(line);
        log(`   🔎 [SENSE-HORA] ${line.num}: sense OnAir ni Prevista → es deduirà la posició (agrupació ${line.agrupacio})`);
    } else { /* skip */ }
    continue;                      // ← eixida: mai s'arriba al test de gràfic
}
```

**DESPRÉS** (el test de gràfic puja davant de tot, amb el mateix text de `log` per a no
trencar les proves que busquen `[D9b·GRAFIC]`):

```js
const horaRef = line.horaEntradaOnAir || line.horaEntradaPrevista;
// (2026-10-27 · #193) El SUFIX mana: TE/TD/P2/GF/ft sense hora són GRÀFICS igualment.
if (isGraphicByNum(line.num)) {
    graphicItems.push(line);
    log(`   📌 [D9b·GRAFIC] ${line.num}: sufix gràfic → Fase 3` +
        ((!horaRef || horaRef === "00:00:00") ? ' (sense hora)' : ''));
    continue;
}
if (!horaRef || horaRef === "00:00:00") { /* … igual que abans … */ }
```

* **Per què és segur**: `_isGraphicByNum` ja reconeix `te`,`te1`…,`td`,`td1`… (set del mòdul)
  i el manifest ja els dona `classe = GRAFIC`. Només canvia **on** es classifiquen; no toca
  cap càlcul de temps.
* **Verificació al log**: `📋 Items: 2 estructurals, 2 gràfics, 1 sense hora (a deduir a F5)`
  i `📌 [D9b·GRAFIC] 01 TE-1: sufix gràfic → Fase 3 (sense hora)`.
* **Risc**: si en un altre programa un `TE`/`TD` fóra realment un vídeo, deixaria de rebre
  marcador estructural. Es comprova amb `check_all` + un projecte real; es reverteix sol
  (§6.3).

### R2 · El marcador d'inici és el PRIMER ESTRUCTURAL **en orde d'escaleta**, tinga hora o no

* `js/workflows/flow_markers.js` · `_pickStartItem` (L1230-1250) i les **3 crides**
  (L1325 F2, L1510 F3, L2331 CAPA0). **CAUSA C4.**

**ABANS**: només itera `structuralItems` (els ítems amb hora). `01BT` (capçalera, sense
hora) viu a `unplacedItems` i no és mai candidat.

**DESPRÉS**: firma amb un 5é paràmetre `unplacedItems`, fusió i orde per `sequencia`:

```js
_pickStartItem: function (structuralItems, ungroupedItems, horaRefSec, graphicItems, unplacedItems) {
    /* … grafNums igual … */
    // (2026-10-27 · #193) Candidats = estructurals AMB hora + estructurals SENSE hora,
    // en ORDE D'ESCALETA (`sequencia`), no en l'orde de `lines`.
    var cands = [], vist = {};
    var afegir = function (it) {
        if (!it || !it.num) return;
        var k = String(it.num).trim().toLowerCase();
        if (vist[k]) return;
        vist[k] = true; cands.push(it);
    };
    for (var a1 = 0; a1 < ((structuralItems || []).length); a1++) afegir(structuralItems[a1]);
    for (var a2 = 0; a2 < ((unplacedItems || []).length); a2++) afegir(unplacedItems[a2]);
    cands.sort(function (x, y) {
        var sx = (x.sequencia != null && isFinite(Number(x.sequencia))) ? Number(x.sequencia) : Number.MAX_SAFE_INTEGER;
        var sy = (y.sequencia != null && isFinite(Number(y.sequencia))) ? Number(y.sequencia) : Number.MAX_SAFE_INTEGER;
        return (sx === sy) ? 0 : (sx - sy);
    });
    for (var si = 0; si < cands.length; si++) { /* … cos actual (grafNums / P2) … */ }
```

I les crides passen el 5é argument:
`this._pickStartItem(structuralItems, ungroupedItems, _horaRefF2, classData.graphicItems, classData.unplacedItems)`.

* **Resultat esperat**: `[Inici] 01BT` (seq 27) i `_iniciPrefix = '01bt'`.
* **Risc**: **mitjà**. És la peça que decidix qui porta el `00:00`. La guarda que queda
  intacta és que `unplacedItems` només conté ítems **de l'agrupació del bloc**
  (`line.agrupacio && flotant !== true`) i, amb R1, ja no hi ha gràfics dins.
* **Verificació**: `🟢 [F2·Deduced]` deixa d'assignar `01dir` a `00:00`.

### R3 · La immunitat del `00:00` és per **identitat**, no per posició

* `js/workflows/flow_markers.js` · `L2043` (F4·ASIG, «faro de faros»), `L1911` (`esInici`,
  passada de separació) i, de retruc, `L2202` (`_frozen[_iniciPrefix]`). **CAUSA C5.**

**ABANS**:

```js
if (tk <= 0.15) {                                    // L2043 — qualsevol marcador a 0
    log('   ⏭️ [ASIG] ' + pfx + ': marcador d\'inici a 00:00 → IMMUTABLE (faro de faros)');
    continue;
}
/* … */
var esInici = (cur.time <= 0.15) || (cur.prefix === this._iniciPrefix) ||   // L1911
    (this._frozen && this._frozen[String(cur.prefix).toLowerCase()] === true);
```

**DESPRÉS**:

```js
// (2026-10-27 · #193) Només és intocable l'inici TRIAT (per identitat). Si F2 s'ha
// equivocat d'ítem, el 🔒 viatja amb `_iniciPrefix` i l'antic es pot re-ancorar.
var _esIniciTriat = !!(this._iniciPrefix &&
    String(pfx).toLowerCase() === String(this._iniciPrefix).toLowerCase());
if (tk <= 0.15 && _esIniciTriat) { /* … IMMUTABLE (faro de faros) … continue; */ }
/* … */
var esInici = (cur.prefix === this._iniciPrefix) ||
              (this._frozen && this._frozen[String(cur.prefix).toLowerCase()] === true);
```

* **Per què funciona amb R2**: amb l'inici a `01bt`, `_frozen = { '01bt': true }` i `01dir`
  deixa d'estar congelat → **F3.5 pot aplicar el seu `Δ`** i F4/F5 el poden col·locar.
* **Potser innecessari després de R2**: si `01dir` ja no és l'inici, F2 no el col·loca a `0` i
  la immunitat per posició no s'arriba a activar. Per això **R3 es prova DESPRÉS de R2**: si
  al log no apareix cap `IMMUTABLE (faro de faros)` per a un ítem equivocat, R3 no s'aplica.
* **Risc**: **mitjà-alt**. Toca la regla demanada l'24/09 («el marcador d'inici no es mou
  mai»). La regla es conserva per a l'inici **de veritat**; el que canvia és que un inici
  **deduït** (sense OnAir) ja no és intangible.
* **Verificació**: `⏭️ [ASIG] 01BT: … IMMUTABLE` (i **no** `01dir`), i al `.prproj`
  `01dir` a `34,50 s`.

### R4 · F5: si la finestra degenera (`[x → x]`), deduir per **cadena de durades** d'escaleta

* `js/workflows/flow_markers.js` · `placeInferredItems` (L2736-2779). **CAUSA C6.**

**ABANS**: quan `prev` i `next` són el mateix marcador, `hi - lo = 0 < 1,0` → `continue`
(i F7 apila a `max(0, next − 0,5)`).

**DESPRÉS** (dos canvis xicotets, en este orde):

1. **Finestra degenerada** (`_hiFinestraInferida`, abans de `placeInferredItems`): si
   «anterior» i «següent» resolen al **MATEIX** marcador, `hi` passa a
   `clips[clips.length-1].end` i `nextNum = null` (la finestra s'obri fins al final del bloc).
2. **Criteri D** (`_cadenaDuradesSec`, funció pura): predir la posició amb la **cadena de
   durades** d'escaleta. S'executa **després del criteri B i abans de C** (primer el senyal
   del material; l'escaleta és el penúltim recurs abans del punt mig):

```js
if (tCand === null) {
    var _cadD = this._cadenaDuradesSec(ordered, orderIdx, prevNum, idx, prevTime, classData.getEffectiveDuradaSec);
    if (_cadD && _cadD.time > uLo - 2.5 && _cadD.time < uHi + 2.5) {
        tCand = _cadD.time;
        why = 'cadena de durades d\'escaleta (+' + _cadD.acum.toFixed(2) + 's des de ' + prevNum + ')';
    }
}
```

3. Després, l'**imant de corts** que ja existix (F4/F6 busquen `clips[i].start|end` a
   `±2,5 s`) arredonix `33,00 s → 34,50 s` si el material té el tall ahí.

* **Resultat esperat per a `01dir`**: `01BT@0` + `durada(01BT) = 33 s` → imant → `34,50 s`.
* **Risc**: **baix-mitjà**. Només s'activa quan hui no hi ha cap criteri millor (B/C donen
  estimacions pitjors) i sempre queda dins de `[uLo, uHi]`.
* **Verificació**: `🔎 [F5·Inferits] 01dir: finestra [01BT@0.00s → 02@41.56s]` i
  `why = cadena de durades d'escaleta`.

### R5 · (OPCIONAL, RISC ALT) `escaleta_bounds`: tolerància a la PREVISTA

* `js/core/escaleta_bounds.js` · `_sanitizeOnAir` (L636-660) i `blockRefSec` (L879-882).
  **CAUSA C1/C2.** **NO s'aplica sense decisió explícita**: és la capa que calcula IN/OUT.

**ABANS**: `else if (highWater != null && pvSec < highWater) { pvMentider = true; … }` →
qualsevol prevista anterior a l'últim OnAir fiable mor, sense cap marge.

**DESPRÉS (proposta, no aprovada)**:

```js
var _TOL_PREVISTA_S = 60;   // constant del mòdul, al costat de les altres
} else if (highWater != null && (highWater - pvSec) > _TOL_PREVISTA_S) {
    pvMentider = true; pvMotiu = 'encadenat a una hora mentidera (>' + _TOL_PREVISTA_S + 's)';
}
```

* **Per què és perillós**: `blockRefSec` alimenta el **Tier0/Tier1-IN**. Tornar-li
  `14:31:41` en lloc de `14:32:13` mou **32 s** el punt d'entrada del bloc sencer (el
  `[ANCORATGE·FIX-D] Δ=10,80 s` del log és d'esta família). No hi ha cap prova que eixe
  `-32 s` siga correcte.
* **Alternativa segura (recomanada)**: **no tocar el sanejat**; guardar `it._prevRaw` com a
  *pista* (`_prevHint=true`) i fer-la servir només per a **ordenar** i per al criteri D de
  R4, mai per a calcular IN/OUT.
* **Verificació si s'aplica**: l'IN/OUT del bloc `01` ha de quedar **idèntic** a l'actual;
  si l'IN es mou, revertir immediatament (§6.3).

---

### R6 · Una hora FORA del material no pot situar cap marcador (APLICAT 27/10)

* `js/workflows/flow_markers.js` · `_matBoundsSec` (nou), `_classifyItems(lines, opts)` i
  F5 (`placeInferredItems`). **CAUSA C2-bis.**

**Símptoma mesurat** (TNM_V1 27/10 12:52, `MARCADORS_2026-10-27_1252.txt`):
`01BT@0,00` ✓ · **`01dir@3,00`** ✗ · `01 TE-1@10,00` · `01 TD-1@15,00` · `02@41,08` · `03@67,44`.
El `00:00:03:00` **no era cap corte**: era el GAP de F8 (`_GAP_SEPARACIO = 3,0`) aplicat sobre dos
marcadors que havien quedat tots dos a `0,00` (`01BT` i `01dir`).

**Aritmètica exacta** (treta del `structure` del manifest, no suposada):

| Magnitud | Valor |
|---|---|
| `01dir` Prevista | `14:32:14` = **52334 s** |
| Àncora efectiva (1r ítem amb OnAir = `02`) | `14:33:04` = **52384 s** |
| `anchorEfTimelineSec` | **41,08 s** |
| `idealPosSec = 41,08 + (52334 − 52384)` | **−8,92 s** → clamp a `0` (F2) |
| F8: `01BT` (seq 27) es queda a 0 · `01dir` (seq 28) → `0 + 3,0` | **3,00 s** |

**Per què la Prevista és inservible**: el clip importat no comença al `worldBlockAnchorSec`
(`52333` = 14:32:13) sinó a **`52342,92`** (14:32:22,9), l'in-point del clip extret (~10 s). És a
dir, `01dir` cauria **8,92 s ABANS de l'inici del clip**: cap hora pot situar-lo.
Comprovat amb el material (`ffmpeg` sobre `TNM_V1_CLIP.mp4`, 188,88 s): corts del fitxer a
`65,32` i `72,40` = **`34,52`** i **`41,60`** de timeline (menys 30,8 s d'in-point) → la connexió
entra a `34,52` i l'IPD `02` a `41,60`.

**DESPRÉS**:

1. `_matBoundsSec(anchors, clips)` → `{ startSec, endSec }` en segons del món:
   `startSec = anchorEfectiva − anchorEfTimelineSec`; `endSec = startSec + (últim.end − primer.start)`.
2. `_classifyItems(lines, { matBoundsSec })`: un ítem **sense OnAir** la hora del qual cau fora
   d'eixos límits (marge 0,5 s) passa a `unplacedItems` amb `_foraMaterial = true` →
   log `🚫 [FORA-MATERIAL]`. L'**OnAir mai no es descarta** (és veritat dura).
3. F5 reclasifica amb eixos límits i, per als `_foraMaterial`: mana la **cadena de durades**
   (R4-b) sobre la densitat, i després s'**imanta al corte** real si n'hi ha un a ≤2,5 s.
4. La guarda de F5 «ja té marcador a ~0,00 → no es toca» s'obri **només** per a `_foraMaterial`
   (eixe 0 és el residu del clamp). El 🔒 d'inici seguix protegit per les guardes d'identitat.

**Resultat esperat per al cas** (predicció, no regla): `01BT@0,00` · `01dir@34,52` ·
`02@41,08` · `03@67,44`.

---

## 4 · Prova de regressió (a `bin/smoke/fp_smoke_ac.js` §12c)

**Implementada** el 2026-10-27 dins del bloc `ph('12c-bug193-inici-bloc')`: el smoke passava de
`452/452` a **`477/477`** (**+25 assercions**).

| # | Asserció implementada | Retoc |
|---|---|---|
| `#193/R1` | `01 TE-1`/`01 TD-1` sense hora → `graphicItems` (no `unplacedItems`); comptes `1 estructural · 2 gràfics · 1 sense hora` | R1 |
| `#193/R2` | `_pickStartItem(..., unplacedItems=[01BT])` → `01BT`; amb candidats desordenats mana `sequencia`; la crida antiga (4 arguments) no trenca | R2 |
| `#193/R4` | `_cadenaDuradesSec`: `01BT@0` + 33 s → `33,00 s`; casos impossibles → `null` | R4 |
| `#193/R4` | `_hiFinestraInferida`: `[x → x]` → final del bloc; finestra normal intacta; sense veí següent → final del bloc | R4 |
| `#193/R6` | `_matBoundsSec`: el `0` del timeline és el segon `52342,92` del món (`52384 − 41,08`); sense anchors → `null` | R6 |
| `#193/R6` | `01dir` amb Prevista `14:32:14` (fora del material) → `unplacedItems` + `_foraMaterial`; **sense** límits → estructural | R6 |
| `#193/R6` | l'`OnAir` no es descarta mai (encara que caiga fora) i una Prevista **dins** del material es queda estructural | R6 |
| `#193/5` | F8 (`#192`) ja la té: cap parell de marcadors amb Δt < 0,20 s | F8 |

A més, al log de cada execució real ha d'eixir:

```
📋 Items: 2 estructurals, 2 gràfics, 1 sense hora (a deduir a F5)
🚫 [FORA-MATERIAL] 01dir: hora 14:32:14 (52334.00s) cau fora del material (52342.92s → …) → hora descartada, es deduirà del material (F5)
🟢 [Inici] 01BT …
🔎 [F5·Inferits] 01dir: finestra [01BT@0.00s → 02@41.08s] … cadena de durades d'escaleta (+33.00s des de 01BT) · hora fora del material
🧲 [F5·Inferits] 01dir: 33.00s → imant al corte 34.52s (hora fora del material)
```

---

## 5 · Com es valida

1. **Cada retoc, un a un** (no tots de colp, per a poder aïllar la culpa):

   ```powershell
   & .\bin\check_all.ps1 -Only js,smoke
   ```

   Verd esperat: `ALL GREEN | js 61/61 | smoke 477/477 | jsx intacte` (477 = 452 + les 25
   assercions de §4). Detall a `%TEMP%\fp_check_all\<control>.txt`.
2. **En viu** (quan hi haja un projecte nou): OUT&GO sobre un bloc de `TNM` i comprovar al
   `.prproj` i al `MARCADORS_<data>.txt`:
   `01 TE-1`/`01 TD-1` **sense** marcador estructural · `01BT @ 0,00` ·
   `01dir @ 34,52` (`00:00:34:13`) · `02 @ 41,08`.
3. Si res d'això falla → §6.

---

## 6 · Com TORNAR ARRERE (rollback)

La xarxa de seguretat viu a **`docs/rollback/2026-10-27_FIX_INICI_BLOC/`**:

| Fitxer | És la còpia exacta de | Conté |
|---|---|---|
| `flow_markers.js.orig` | `js/workflows/flow_markers.js` | estat **abans** de R1-R4 |
| `escaleta_bounds.js.orig` | `js/core/escaleta_bounds.js` | estat **abans** de R5 |
| `main.js.orig` | `js/main.js` | estat del 27/10 (**ja inclou** F8·Separació de #192) |
| `fp_smoke_ac.js.orig` | `bin/smoke/fp_smoke_ac.js` | estat del 27/10 (**ja inclou** les proves de F8) |
| `SHA256SUMS.txt` | — | hash SHA256 de cada `.orig` |

> Git **no està instal·lat en esta màquina** (`git.exe` no hi és), per això la reversió es fa
> amb estos fitxers. Si algun dia hi ha git, `git checkout -- <fitxer>` és equivalent.

### 6.1 Restauració total (2 ordres)

```powershell
Set-Location 'C:\Users\gonz_agu\AppData\Roaming\Adobe\CEP\extensions\FAST_PASSS'
$snap = '.\docs\rollback\2026-10-27_FIX_INICI_BLOC'
Copy-Item -LiteralPath "$snap\flow_markers.js.orig"    -Destination '.\js\workflows\flow_markers.js' -Force
Copy-Item -LiteralPath "$snap\escaleta_bounds.js.orig" -Destination '.\js\core\escaleta_bounds.js' -Force
```

**Després cal recarregar el panell** (o reiniciar Premiere): el `.js` viu en memòria i no es
torna a llegir del disc.

### 6.2 Comprovar que la restauració és exacta

```powershell
(Get-FileHash -LiteralPath '.\js\workflows\flow_markers.js' -Algorithm SHA256).Hash.ToLower()
# esperat (abans dels retocs): 1b68d687b05678d4327093ac34ed170e7bff1de11631ce77639d8619c4475548
(Get-FileHash -LiteralPath '.\js\core\escaleta_bounds.js' -Algorithm SHA256).Hash.ToLower()
# esperat: 44b9850c95d0a1e3c07a73445ece5eaa37a4cfd90d13a2b098bc287070190a96
& .\bin\check_all.ps1
```

### 6.3 Reversió PUNT A PUNT (recomanada si falla només una cosa)

Cada retoc és una modificació **localitzada**; per a desfer-ne només un, es compara el
fitxer actual amb el seu `.orig` i es torna arrere **eixe tros**:

```powershell
# veure exactament què ha canviat (sense git)
Compare-Object (Get-Content '.\docs\rollback\2026-10-27_FIX_INICI_BLOC\flow_markers.js.orig') `
               (Get-Content '.\js\workflows\flow_markers.js') -IncludeEqual:$false | Format-Table -AutoSize
```

| Si falla… | Què revertir | Com |
|---|---|---|
| Els `TE`/`TD` han perdut el marcador que sí volies | **R1** | tornar a pujar el test de gràfic davall del bloc «sense hora» (bloc `ABANS` de §3 R1) |
| El `00:00` ha caigut en un ítem que no toca | **R2** | llevar `unplacedItems` de la fusió de `_pickStartItem` i de les 3 crides |
| Un inici **real** (amb OnAir) s'ha mogut | **R3** | tornar `if (tk <= 0.15)` i el `esInici` de §3 R3 |
| `01dir` ha anat massa lluny / a un lloc sense sentit | **R4** | llevar el «Criteri D» i el filtre de veí següent |
| L'IN/OUT del bloc s'ha desplaçat | **R5** | restaurar `escaleta_bounds.js.orig` sencer (6.1) |

> Regla d'or: **R5 no es toca fins que R1-R4 estiguen verdes en viu**. És l'única que pot
> moure l'IN/OUT; les altres quatre només decidixen **on va cada marcador**.

### 6.4 Què NO cobrix la instantània

* `main.js.orig` i `fp_smoke_ac.js.orig` són **posteriors** a F8·Separació (#192): si es
  restauren, **no** desfan F8 (per a això caldria llevar la crida
  `Markers.separateOverlappingMarkers` de `js/main.js` i les seues proves).
* No cobrix `Profile.json` ni cap dada del projecte de Premiere.
* No cobrix `jsx/` perquè **no s'ha tocat** (i no s'ha de tocar).

---

## 7 · Observacions (fora d'abast, apuntades)

1. **`Δ=10,80 s` d'ancoratge** (`[ANCORATGE·FIX-D]`): `clip.inPoint = 30,8 s` del `.prproj`
   contra els `20 s` del manifest → el marge de mà dreta. `02` va entrar a `40,20 s` i F3.5
   el va corregir a `41,56 s`. Mereix bug propi; **no** s'inclou a #193.
2. **F8·Separació seguix sent necessària**: #193 evita l'apilament d'origen, però si algun
   dia dos ítems de l'escaleta cauen al mateix cort, F8 els separa (regla imperativa de
   l'usuari, `#192`).
3. **El `34,50 s` no ix del `.prproj`**: ve de la detecció d'escena de `ffmpeg` sobre el
   `cleanFeed` (`select='gt(scene,…)'`). L'imant de F4 només pot caure en **corts de V1**
   (`clips[i].start|end`); si el tall real no és cap d'eixos, el resultat quedarà a `33 s`
   (que ja és «ahí»), no a `34,50 s`.
4. **Verificació en viu pendent**: la carpeta del projecte `2026_10_26/V1` es va esborrar el
   27/10, així que l'única prova feta és estàtica (log de l'11:23 + `MARCADORS_*.txt`).

---

## 7b · Abast: QUÈ és genèric i què és del cas TNM_V1 26/10

Els retocs **no** contenen cap número de projecte a la lògica. `01BT`, `01dir`, `01 TE-1` i
`01 TD-1` només apareixen en **comentaris** (documentació del cas que va motivar el canvi,
igual que fa la resta del fitxer: #125, #139, #156b…) i en les **fixtures del smoke**. Una
cerca de codi executable (`Select-String` a `js/**` filtrant comentaris) no en troba cap.

| Retoc | Regla genèrica que aplica | Senyal que fa servir |
|---|---|---|
| R1 | «si el número té **sufix de gràfic**, és gràfic encara que no tinga hora» | `_isGraphicByNum` → `_normSuffix` + conjunt `_graphicSuffixesNorm()` + regex `^gf\d+$` (cap número fix) |
| R2 | «el 🔒 d'inici va al **primer estructural en orde d'escaleta**, tinga hora o no» | fusió `structuralItems + unplacedItems` + `sort` per `sequencia` |
| R4-a | «si anterior i següent són **el mateix** veí, la finestra s'obri fins al final del bloc» | comparació `String(prevNum) === String(nextNum)` + `clips[last].end` |
| R4-b | «la posició és l'últim veí col·locat **+ la suma de durades** intermèdies» | `orderIdx[prevNum]`, `ordered[q]`, `duradaSec(item)` injectada per paràmetre |
| R6 | «una hora que cau **fora del material** no situa res: mana el material (cadena + corte)» | `anchorEfectiva − anchorEfTimelineSec` (el món que correspon al `0` del timeline) + límits dels clips; cap número de projecte |

Per tant, l'efecte descrit a §3 (`01BT @ 0,00 s` i `01dir @ 33-34,5 s`) és una **predicció per a
aquest projecte**, no una regla escrita al codi: en un bloc on la capçalera sí que tinga hora, el
🔒 anirà a aquesta capçalera i `01dir` conservarà la seua Prevista sense passar per F5.

**Supòsits que cal vigilar** (si fallen, no és que el retoc estiga mal fet, és que l'entrada
no complix el contracte):

1. R2 assumeix que la capçalera del bloc és **estructural** (no un gràfic) i que l'escaleta dóna
   `sequencia`; sense `sequencia`, l'orde és el d'arribada de `lines` (sort estable) i pot
   coincidir o no amb el de l'escaleta.
2. R4-b assumeix que `getEffectiveDuradaSec` dóna durades **seqüencials** (OnAir − Prevista). Si
   un ítem té durada `0:00` real (un `off`), aporta 0 s i la cadena queda curta: la guarda
   `> uLo - 2,5 / < uHi + 2,5` el descarta abans de col·locar res.
3. R1 assumeix que el sufix de gràfic és fiable. Ja era el criteri de F3/F6 (`_getColorIdx`);
   l'únic que canvia és que ara es consulta **abans** del test «sense hora».
4. R6 assumeix que `anchorEfectiva`/`anchorEfTimelineSec` són fiables (és el mateix ancoratge que
   fa servir CAPA1). Si l'àncora estiguera desviada, els límits també ho estarien i podria
   descartar una Prevista bona; les guardes són el marge de 0,5 s i que **l'OnAir mai no es
   descarta**. Si passa, al log eixiria un `🚫 [FORA-MATERIAL]` d'un ítem que sí que tenia hora
   útil → mirar `📍 [ANCORATGE·DUAL]` abans de tocar res.

---

## 8 · Historial d'este document

| Data | Què |
|---|---|
| 2026-10-27 | Es crea: causa arrel C1-C6 verificada, retocs R1-R5 documentats, instantànies de seguretat a `docs/rollback/2026-10-27_FIX_INICI_BLOC/`. |
| 2026-10-27 | **R1 + R2 + R4 aplicats** a `js/workflows/flow_markers.js` (decisió d'usuari: R3 i R5 fora d'este pas). Nous helpers purs `_hiFinestraInferida` i `_cadenaDuradesSec`. Smoke §12c amb 19 assercions → `ALL GREEN · js 61/61 · smoke 471/471 · jsx intacte`. |
| 2026-10-27 | Afegit §7b: abast genèric (cap literal de projecte al codi executable; només a comentaris i fixtures) i els 3 supòsits que cal vigilar. |
| 2026-10-27 | **R6 aplicat** després de la validació en viu de les 12:52 (`01dir` a `00:00:03:00`): `_matBoundsSec`, `_classifyItems(lines, opts)` amb hora fora del material → `unplacedItems` + `_foraMaterial`, F5 amb cadena prioritària + imant al corte i la guarda del `0,00` oberta només per a `_foraMaterial`. Smoke §12c 19 → **25 assercions** → `ALL GREEN · js 61/61 · smoke 477/477 · jsx intacte`. |




