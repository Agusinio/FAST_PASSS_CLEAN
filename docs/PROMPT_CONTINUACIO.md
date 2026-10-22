# PROMPT PER A LA PRÒXIMA CONVERSACIÓ

> **Com s'usa:** obri una **tasca nova** de Cline, copia **un** bloc (A, B, C o D) i envia'l.
> No cal pegar res més: `.clinerules` (arrel) ja injecta les normes (validació amb
> `bin\check_all.ps1`, `jsx/**` **intocable** sense permís, estalvi de context).
> Estat complet i detall de cada pendent: `docs/HANDOFF_2026-10-22.md`.

---

## A · Curt — qualsevol tasca (recomanat)

```text
Projecte: FAST >>> PASS — extensió CEP per a Premiere, a
c:\Users\gonz_agu\AppData\Roaming\Adobe\CEP\extensions\FAST_PASSS_CLEAN
Normes: `.clinerules` — valida amb `bin\check_all.ps1` (selectiu) i NO toques `jsx/**` sense el meu permís.
Estat i pendents: `docs/HANDOFF_2026-10-22.md` §1 i §2.

Tasca d'avui: <escriu ací què vols fer, en una línia>.
```

---

## B · Tancar el BUG #178b (prova en viu a Premiere)

```text
Projecte: FAST >>> PASS. Normes: `.clinerules` (`bin\check_all.ps1`; `jsx/**` intocable sense permís).
Context: `docs/HANDOFF_2026-10-22.md` §2.2 — BUG #178b, botó 📁 → diàleg MODERN de carpetes.

He provat a Premiere i el resultat és:
- Accés ràpid / Ús recent a l'esquerra: <OK / KO: què ix>
- Enganxar ruta UNC a la barra + Enter: <OK / KO: què ix>
- Cancel·lar: <el camp no canvia / KO: ...>
- El diàleg queda al davant de Premiere: <sí / no>
- Log de l'extensió: <enganxa ací només les línies [setup] explorador → ... o «diàleg modern KO (n)»>

Si tot OK: marca #178b com a fet a `docs/CHANGELOG.md` i tanca el #178. Si alguna cosa falla,
digues-m'ho abans de tocar res i proposa el canvi mínim (recorda: `setup.html` i `scripts/pick_folder.ps1`,
NO `jsx/`).
```

---

## C · Bug nou (amb log)

```text
Projecte: FAST >>> PASS. Normes: `.clinerules` (`bin\check_all.ps1`; `jsx/**` intocable sense permís).
Context general: `docs/HANDOFF_2026-10-22.md` §1.

Símptoma: <què fa i què hauria de fer, en 2-3 línies>
Quan passa: <acció exacta: botó, tecles, fitxer obert...>
Log (només les línies rellevants, màx. 20): <enganxa ací>
On crec que és: <opcional: fitxer/funció>

Vull: diagnòstic primer, sense canviar codi. Després el canvi mínim + validació amb
`bin\check_all.ps1` (`-Only js,smoke` si toque `js/**`) i entrada a `docs\BUGS_FIXED.md` amb número nou.
```

---

## D · Seguir amb el codi (sense Premiere)

```text
Projecte: FAST >>> PASS. Normes: `.clinerules` (`bin\check_all.ps1`; `jsx/**` intocable sense permís).
Context: `docs/HANDOFF_2026-10-22.md` §2.7 — invariant «cap parell de marcadors pot compartir TC».

Vull implementar-lo. Punts de creació ja llistats a §2.7 (`flow_markers.js` i `8_Markers.jsx`).
Abans de res: digues-me quina política proposes (rebutjar el segon amb ERR o desplaçar-lo 1 frame)
i on aniria el helper únic. No escrigues codi fins que t'ho aprove.
```

---

## Què adjuntar i què no

| Sí (barat i útil) | No (car i sorollós) |
|---|---|
| 5-20 línies de log rellevants | el log sencer (milers de línies) |
| 1 captura del timeline/diàleg | captures de tota la pantalla |
| la línia verda de `check_all` | la sortida sencera dels 4 controls |
| el número de bug i el fitxer sospitós | `docs/BUGS_FIXED.md` (234 KB ≈ 60k tokens) |

## Recordatoris

- **`jsx/` intocable.** Si el prompt acaba tocant `.jsx`, la resposta correcta és *«demana permís»*.
- **Un objectiu per conversació.** Canviar de tema a mitat de sessió multiplica el context.
- **Si alguna cosa ix roja:** envia només la línia `FAIL | …` de `check_all.ps1` i el bloc
  corresponent de `%TEMP%\fp_check_all\<control>.txt`.
