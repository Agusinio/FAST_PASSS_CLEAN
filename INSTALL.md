# INSTALL — FAST >>> PASS (paquet de distribució)

Extensió CEP **sense instal·lador**: CEP carrega qualsevol carpeta que hi hagi dins de
`%APPDATA%\Adobe\CEP\extensions\`. Només cal copiar-la i habilitar el mode de desenvolupament.

---

## 1. Requisits

| Requisit | Detall |
|----------|--------|
| Sistema | Windows 10 / 11 (les rutes del projecte són UNC de xarxa Windows). |
| Adobe Premiere Pro | Versió **14.0 o superior** (el manifest declara `PPRO [14.0, 99.0]`). |
| Xarxa | Accés als recursos NAS del projecte (rètols, subtítols de 15 min, exports, portades, projectes PROVES…). |
| (Opcional) ffmpeg | Per als talls de precisió i conversions — vegeu §5. |

---

## 2. Copiar l'extensió

1. Copieu **la carpeta sencera** d'aquest paquet a:

   ```
   %APPDATA%\Adobe\CEP\extensions\FAST_PASSS
   ```

   És a dir: `C:\Users\<el vostre usuari>\AppData\Roaming\Adobe\CEP\extensions\FAST_PASSS`.

   > `%APPDATA%` = escriviu-ho a la barra d'adreces de l'Explorador i prémer Enter.
   > Si la carpeta `extensions` no existeix, creeu-la.

2. Manteniu el nom de la carpeta **sense espais**. No cal instal·lar res més.

---

## 3. Habilitar extensions sense signar (PlayerDebugMode)

Aquesta extensió no està firmada per Adobe, així que cal activar el mode de proves de CEP.
Executeu-ho **una vegada** (PowerShell o cmd, sense permisos d'administrador):

```
reg add HKCU\Software\Adobe\CSXS.9  /v PlayerDebugMode /t REG_SZ /d 1 /f
reg add HKCU\Software\Adobe\CSXS.10 /v PlayerDebugMode /t REG_SZ /d 1 /f
reg add HKCU\Software\Adobe\CSXS.11 /v PlayerDebugMode /t REG_SZ /d 1 /f
reg add HKCU\Software\Adobe\CSXS.12 /v PlayerDebugMode /t REG_SZ /d 1 /f
```

La clau que fa servir cada equip depèn de la versió de Premiere/CEP instal·lada
(les versions noves utilitzen `CSXS.11`/`CSXS.12`). Aplicar-les totes és inofensiu.

---

## 4. Activar el panell

1. **Reinicieu Premiere Pro** (les extensions es llegeixen en arrancar).
2. `Finestra` / `Window` → `Extensions` → **FAST >>> PASS**.

> Aquest paquet porta l'ID `com.fastpass` i el port `8908`. Si instal·leu una altra còpia al
> mateix equip, doneu-li un altre ID i un altre port (`<Host Port>` al manifest) perquè **les
> dues puguin conviure** sense xocar.
> Si preferiu un altre nom al menú, editeu `<Menu>` a `CSXS\manifest.xml`.

---

## 5. ffmpeg / ffprobe (opcional però recomanat)

El codi els busca, en aquest ordre:

1. `bin\ffmpeg\bin\ffmpeg.exe` **dins de la carpeta de l'extensió** (els binaris **no** vénen al paquet
   per pes: si els necessiteu, copieu-los aquí),
2. `C:\Program Files\Dalet\DaletPlus.409526\bin\ffmpeg.exe` (equips d'edició amb Dalet),
3. `E:\ffmpeg\bin\ffmpeg.exe`,
4. `C:\Program Files (x86)\OpenVideoDownloader\open-video-downloader\ffmpeg.exe`.

Si als vostres equips no hi ha cap d'aquests camins, instal·leu ffmpeg i deixeu-lo a
`...\extensions\FAST_PASSS\bin\ffmpeg\bin\`.

---

## 6. Comprovar que funciona

- El panell mostra l'estat del projecte (semàfors de JSON / MP4 / Rètols / Subtítols).
- El registre d'execució s'escriu a la carpeta del projecte (o a la carpeta `PROVES` del NAS):
  **`FASTPASS.log`** (es reinicia a cada projecte) i **`FASTPASS_audit.log`** (crides JSX).
- Per validar la sintaxi del codi que tingueu instal·lat:

  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File ".\bin\check_js_v8.ps1"
  ```

---

## 7. Configuració inicial (rutes de xarxa)

`Profile.json` ja porta les rutes de la casa; si algun recurs canvia de lloc, reviseu-les a
`setup.html` (*GUARDAR CONFIG*) i, si el comportament no canvia, a `js/core/11_Configuracio.js`
(és el fitxer amb els valors actius del codi).

---

## 8. Problemes freqüents

| Símptoma | Causa probable | Solució |
|----------|----------------|---------|
| El panell no apareix al menú d'extensions | `PlayerDebugMode` no activat, o Premiere no reiniciat | Repetiu §3 i reinicieu Premiere. |
| Error «duplicate extension» o el panell es buida | Una altra còpia amb el **mateix** ID instal·lada | Deixeu IDs diferents (aquest paquet: `com.fastpass`). |
| Un flux s'atura dient que no troba un executable | ffmpeg/ffprobe absents als camins de §5 | Instal·leu ffmpeg a `bin\ffmpeg\bin\`. |
| No llegeix l'escaleta o no desa el projecte | Rutes NAS sense accés (VPN/xarxa corporativa) | Comproveu les rutes de `Profile.json`. |
| El panell va amb codi vell després d'actualitzar-lo | CEP cacheja per ID d'extensió | Reinicieu Premiere; els `.js` porten *cache-bust* (`?v=NN`) a `index.html`. |

---

## 9. Desinstal·lar

1. Tanqueu Premiere.
2. Esborreu la carpeta `%APPDATA%\Adobe\CEP\extensions\FAST_PASSS`.
3. (Opcional) Desactiveu `PlayerDebugMode` posant `0` a les claus de §3.
