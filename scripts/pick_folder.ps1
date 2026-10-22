# ============================================================================
# pick_folder.ps1 · Dialog MODERN de carpeta de l'Explorador de Windows
# ----------------------------------------------------------------------------
# PER QUE EXISTIX (BUG #178b, 2026-10-22):
#   `cep.fs.showOpenDialog(..., chooseDirectory = true)` de CEP obri el dialog
#   ANTIC (SHBrowseForFolder): un arbre de discs sense barra d'adreces, sense
#   l'Acces rapid ni els favorits de l'Explorador, i sense poder enganxar una
#   ruta UNC. Les rutes de xarxa que NO estan MAPEJADES no s'hi poden triar.
#
#   Aci s'obri el MATEIX dialog que l'Explorador de Windows («Selecciona una
#   carpeta»): IFileOpenDialog amb FOS_PICKFOLDERS -> Acces rapid, Equip,
#   Xarxa, barra d'adreces (per enganxar \\servidor\share) i «Crea una carpeta».
#
# US (des de setup.html):
#   A) Amb child_process de Node (si el manifest té --enable-nodejs):
#      $env:FP_PICK_TITLE = 'Tria una carpeta'
#      $env:FP_PICK_INITIAL = '\\srv\share'
#      powershell -NoProfile -STA -ExecutionPolicy Bypass -File pick_folder.ps1
#      -> el resultat ix per stdout.
#   B) Amb `cep.process` (API nativa de CEP, SENSE Node) · BUG #178b 3a volta:
#      powershell -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass ^
#          -File pick_folder.ps1 -Title "Tria una carpeta" -Initial "\\srv\share" ^
#          -OutFile "<ext>\_pick_result.tmp"
#      -> `cep.process` no dona stdout ni codi d'eixida: el resultat va al -OutFile
#         en UNA linia:  `OK <base64-utf8>` | `CANCEL` | `ERR <base64-utf8>`
#         (base64 perque el fitxer no depene de la codificacio amb que es lligca).
#
#   Per consola tambe val passar-ho per parametre:
#   powershell -NoProfile -STA -File .\scripts\pick_folder.ps1 `
#       -Title "Tria una carpeta" -Initial "\\srv\share"
#
# EIXIDA (stdout en UTF-8, UNA sola linia):
#   exit 0 + ruta   -> l'usuari ha triat eixa carpeta
#   exit 3          -> cancel-lat (no s'escriu res)
#   exit 4          -> error (detalls per stderr)
#   -CompileOnly    -> nomes compila el tipus C# i escriu COMPILE_OK (smoke)
# ============================================================================

param(
    [string]$Title   = $env:FP_PICK_TITLE,
    [string]$Initial = $env:FP_PICK_INITIAL,
    [string]$OutFile = $env:FP_PICK_OUT,
    [switch]$CompileOnly
)

$ErrorActionPreference = 'Stop'

# La ruta pot portar accents (VERTICALITZACIO, PROJECTES...): stdout en UTF-8.
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }

$csSource = @'
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;

namespace FPFolderPicker
{
    // CLSID del FileOpenDialog de Vista+ (el mateix que l'Explorador).
    [ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
    internal class FileOpenDialogRCW { }

    [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IShellItem
    {
        [PreserveSig] int BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        [PreserveSig] int GetParent(out IShellItem ppsi);
        [PreserveSig] int GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
        [PreserveSig] int GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
        [PreserveSig] int Compare(IShellItem psi, uint hint, out int piOrder);
    }

    // IFileOpenDialog hereta IModalWindow + IFileDialog: la vtable va APLANADA,
    // per tant cal declarar tots els metodes en l'ordre exacte.
    [ComImport, Guid("d57c7288-d4ad-4768-be02-9d969532d960"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IFileOpenDialog
    {
        [PreserveSig] int Show(IntPtr parent);
        [PreserveSig] int SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
        [PreserveSig] int SetFileTypeIndex(uint iFileType);
        [PreserveSig] int GetFileTypeIndex(out uint piFileType);
        [PreserveSig] int Advise(IntPtr pfde, out uint pdwCookie);
        [PreserveSig] int Unadvise(uint dwCookie);
        [PreserveSig] int SetOptions(uint fos);
        [PreserveSig] int GetOptions(out uint pfos);
        [PreserveSig] int SetDefaultFolder(IShellItem psi);
        [PreserveSig] int SetFolder(IShellItem psi);
        [PreserveSig] int GetFolder(out IShellItem ppsi);
        [PreserveSig] int GetCurrentSelection(out IShellItem ppsi);
        [PreserveSig] int SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        [PreserveSig] int GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
        [PreserveSig] int SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
        [PreserveSig] int SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
        [PreserveSig] int SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
        [PreserveSig] int GetResult(out IShellItem ppsi);
        [PreserveSig] int AddPlace(IShellItem psi, int fdap);
        [PreserveSig] int SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
        [PreserveSig] int Close(int hr);
        [PreserveSig] int SetClientGuid(ref Guid guid);
        [PreserveSig] int ClearClientData();
        [PreserveSig] int SetFilter(IntPtr pFilter);
        [PreserveSig] int GetResults(out IntPtr ppenum);
        [PreserveSig] int GetSelectedItems(out IntPtr ppsai);
    }
    internal static class Shell32
    {
        [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
        internal static extern void SHCreateItemFromParsingName(
            [MarshalAs(UnmanagedType.LPWStr)] string pszPath,
            IntPtr pbc,
            [MarshalAs(UnmanagedType.LPStruct)] Guid riid,
            [MarshalAs(UnmanagedType.Interface)] out IShellItem ppv);
    }

    public static class VistaFolderDialog
    {
        private const uint FOS_NOCHANGEDIR     = 0x00000008;
        private const uint FOS_PICKFOLDERS     = 0x00000020;
        private const uint FOS_FORCEFILESYSTEM = 0x00000040;
        private const uint FOS_PATHMUSTEXIST   = 0x00000800;
        private const uint SIGDN_FILESYSPATH   = 0x80058000;
        private const int  HR_CANCELLED        = unchecked((int)0x800704C7);

        /// <summary>
        /// Obri el dialog de carpeta de l'Explorador.
        /// status: 0 = triada, 1 = cancel-lada, 2 = error.
        /// </summary>
        public static string Pick(string title, string initial, out int status)
        {
            status = 0;
            try
            {
                IFileOpenDialog dlg = (IFileOpenDialog)new FileOpenDialogRCW();

                uint opts;
                if (dlg.GetOptions(out opts) == 0)
                {
                    dlg.SetOptions(opts | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST | FOS_NOCHANGEDIR);
                }
                if (!string.IsNullOrEmpty(title))
                {
                    dlg.SetTitle(title);
                }
                if (!string.IsNullOrEmpty(initial))
                {
                    try
                    {
                        if (Directory.Exists(initial))
                        {
                            Guid iid = typeof(IShellItem).GUID;
                            IShellItem start;
                            Shell32.SHCreateItemFromParsingName(initial, IntPtr.Zero, iid, out start);
                            if (start != null)
                            {
                                dlg.SetFolder(start);
                            }
                        }
                    }
                    catch (Exception)
                    {
                        // Ruta inicial inaccessible (xarxa caiguda, permisos...):
                        // el dialog s'obri igualment en l'ultim lloc recordat.
                    }
                }

                int hr = dlg.Show(HostWindow());
                if (hr == HR_CANCELLED) { status = 1; return null; }
                if (hr != 0) { status = 2; return null; }

                IShellItem item;
                hr = dlg.GetResult(out item);
                if (hr != 0 || item == null) { status = 2; return null; }

                string path;
                hr = item.GetDisplayName(SIGDN_FILESYSPATH, out path);
                if (hr != 0 || string.IsNullOrEmpty(path)) { status = 2; return null; }
                return path;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("PICK_ERROR: " + ex.Message);
                status = 2;
                return null;
            }
        }

        /// <summary>
        /// Finestra de Premiere com a PROPIETARIA del dialog: aixi queda modal i
        /// sempre damunt del panell (si no, pot nàixer darrere l'aplicacio).
        /// </summary>
        private static IntPtr HostWindow()
        {
            try
            {
                string[] names = new string[] { "Adobe Premiere Pro", "Adobe Premiere Pro Beta" };
                for (int i = 0; i < names.Length; i++)
                {
                    Process[] ps = Process.GetProcessesByName(names[i]);
                    for (int j = 0; j < ps.Length; j++)
                    {
                        if (ps[j].MainWindowHandle != IntPtr.Zero) { return ps[j].MainWindowHandle; }
                    }
                }
            }
            catch (Exception) { }
            return IntPtr.Zero;
        }
    }
}
'@

# El tipus C# es compila una primera vegada i es guarda com a DLL a %TEMP%: la
# primera obertura paga la compilacio (~1 s), les seguents nomes Add-Type -Path.
$dll = Join-Path ([System.IO.Path]::GetTempPath()) 'fp_pick_folder_v1.dll'
$typeName = 'FPFolderPicker.VistaFolderDialog'

if (-not ($typeName -as [type])) {
    $loaded = $false
    if (Test-Path $dll) {
        try { Add-Type -Path $dll -ErrorAction Stop; $loaded = $true } catch { $loaded = $false }
    }
    if (-not $loaded) {
        try {
            Add-Type -TypeDefinition $csSource -Language CSharp -OutputAssembly $dll -ErrorAction Stop
            Add-Type -Path $dll -ErrorAction Stop
            $loaded = $true
        } catch {
            # Sense permisos a %TEMP%, csc no disponible o DLL corrupta: en memoria.
            try { Remove-Item $dll -Force -ErrorAction SilentlyContinue } catch { }
            Add-Type -TypeDefinition $csSource -Language CSharp -ErrorAction Stop
            $loaded = $true
        }
    }
}

if ($CompileOnly) {
    if ($typeName -as [type]) { Write-Output 'COMPILE_OK'; exit 0 }
    Write-Output 'COMPILE_FAIL'
    exit 4
}

$status = 0
$path = $null

# ----------------------------------------------------------------------------
# RESULTAT EN FITXER (-OutFile) · BUG #178b, 3a volta (2026-10-22)
# ----------------------------------------------------------------------------
# `setup.html` pot llançar est script amb `cep.process` (API nativa de CEP), que
# NO dona stdout ni codi d'eixida. Per a eixe transport el resultat viatja en un
# fitxer:  `OK <base64-utf8>`  |  `CANCEL`  |  `ERR <base64-utf8>`
# Base64 perque el fitxer no depene de com el lligca el costat JS (accents).
# ----------------------------------------------------------------------------
$writeOut = {
    param([string]$Kind, [string]$Value)
    if (-not $OutFile) { return }
    try {
        $b64 = {
            param([string]$s)
            if ($null -eq $s) { return '' }
            return [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($s))
        }
        switch ($Kind) {
            'OK'     { $txt = 'OK ' + (& $b64 $Value) }
            'CANCEL' { $txt = 'CANCEL' }
            default  { $txt = 'ERR ' + (& $b64 $Value) }
        }
        [System.IO.File]::WriteAllText($OutFile, $txt, (New-Object System.Text.UTF8Encoding($false)))
    } catch { }
}

try {
    $path = [FPFolderPicker.VistaFolderDialog]::Pick($Title, $Initial, [ref]$status)
} catch {
    & $writeOut 'ERR' ([string]$_.Exception.Message)
    try { [Console]::Error.WriteLine('PICK_ERROR: ' + $_.Exception.Message) } catch { }
    exit 4
}

if ($status -eq 0 -and $path) {
    & $writeOut 'OK' ([string]$path)
    Write-Output $path
    exit 0
}
if ($status -eq 1) {
    & $writeOut 'CANCEL' ''
    exit 3
}
& $writeOut 'ERR' ('no s''ha pogut obrir el diàleg (status=' + $status + ')')
exit 4
