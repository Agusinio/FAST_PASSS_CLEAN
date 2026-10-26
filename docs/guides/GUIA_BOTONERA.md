# 🕹️ Guia de Funcionalitats (RESUM DERIVAT)

> ⚠️ **Document derivat.** La font de veritat botó a botó (requisits, efectes, dreceres i
> referències de codi) és [`MASTER_FUNCIONALITATS.md`](MASTER_FUNCIONALITATS.md).
> Última revisió d'este resum: **2026-10-23**.

## Taula ràpida per seccions

| Secció | Controls | Idea en una línia |
| :--- | :--- | :--- |
| **INICI** | `🔄` RESET · semàfors `ESC/MP4/WOT/SRT` · `📷 FOTO` · `PROG`/`BLOC`/`COND` · **MAIN** · `⚙️` · `🧪` | RESET esborra la carpeta del bloc i recrea; FOTO baixa l'escaleta del dia; MAIN canvia d'etiqueta segons material (`MASSA D'HORA`→`ESPERA`→`CREA`→`ACTUAL.`), `Ctrl` = AHIR. |
| **VÍDEO** | `IN` · `TROSSEJA` (TEST) · `OUT & GO` · `KEYFRAME` · `◀ ▶` · slider PAN | `IN` retalla capçalera i recol·loca marcadors; `OUT & GO` tanca + (TREBALL) OUT + TROSSEJA + 8 fases de marcadors; el slider actua sobre el **clip seleccionat** i cal **armar-lo**. |
| **CHYRONS** | `🎯` · `↔️` · `🔀` · `COND/TITOL/LLOC/NOM/RESTO/TRAD` (TEST) | `🎯` col·loca totes les famílies + IPD automàtic + grafismes MAPA; `↔️` repartix traduccions; `🔀` alterna intro LLARGA/CURTA (`Ctrl` = AUTO). |
| **GRÀFICS** | `IPD` · `IPD+` · `🪟🪟` · `🎨` · `🗺️` · `🗿` | IPD 144 % (toggle, `Ctrl` = repassar marcadors); IPD+ vertical per interval; DF horitzontal (V4/V5 + fons V3, `Ctrl` = reset); 🎨 importa el grafisme del dia; 🗺️ mapa zoom; 🗿 tòtem 126 % d'amplada. |
| **SUBTÍTOLS** | `⬇️` · `💾` · `♻️` · `🧩` · `IN` · `OUT` + editor | Es treballa sobre una **taula**: `⬇️` carrega (15 min; `Ctrl` = SINT), `💾` exporta a S1/S2, `♻️` reinicia, `🧩` carrega els SINT si cal i cobreix buits (TC **i** text), marcadors = acordió. |
| **RENDER** | `📹` · `🖼️` · `✅` | Render directe amb preset; portada PNG del frame del cabezal amb el mateix nom; `✅` guarda, tanca i lleva el lock. |
| **MARCADORS** (TEST) | `1·SIL` · `2·C0` · `3·C1` · `F2`…`F6 GF` | Fases per provar el pipeline d'OUT & GO per separat. |

## Dreceres imprescindibles

`Ctrl`+**MAIN** = AHIR · `Ctrl`+**FOTO** = foto d'AHIR · `Ctrl`+**🔀** = AUTO ·
`Ctrl`+**IPD** = repassar marcadors IPD · `Ctrl`+**IPD+**/**🪟🪟** = reset ·
`Ctrl`+**⬇️** = SINT ⇄ NORMAL · `Ctrl`+**💾** = forçar S2.

© 2026 FAST >>> PASS Development Team

