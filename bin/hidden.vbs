' ============================================================================
' hidden.vbs - Llancador OCULT de comandes de sistema per a FAST >>> PASS
' ----------------------------------------------------------------------------
' PER QUE EXISTEIX
'   Fins ara tota tasca externa (ffprobe, ffmpeg, OCR) s'engegava amb
'   IO.executeShell (jsx/modules/2_IO.jsx): un .bat + File.execute() dins del
'   motor ExtendScript, que SEMPRE obri una finestra de CMD a la cara de
'   l'usuari. Amb 30 clips aixo son 30 finestres que tapen el panell i el
'   Premiere.
'
' PER QUE wscript I NO powershell
'   wscript.exe es una aplicacio GUI: no crea consola. cmd.exe s'engega amb
'   sh.Run(cmd, 0, True) -> finestra 0 (oculta) i a mes RETORNA el codi
'   d'eixida. Mesurat en aquest equip (5 llancades, comanda buida):
'     wscript + hidden.vbs ...... ~250 ms   (aquest fitxer)
'     powershell -WindowStyle Hidden -EncodedCommand ... ~800 ms
'   La segona opcio (#180) tambe oculta la finestra, pero triplica el cost per
'   cada crida (i l'OCR en fa 33+).
'
' CONTRACTE
'   wscript.exe //nologo //B "<...>\bin\hidden.vbs" "<cmd.txt>" "<exit.txt>"
'     <cmd.txt>  fitxer UTF-8 (l'escriu Utils.execHidden amb cep.fs.writeFile)
'                amb la comanda tal com aniria dins del .bat
'     <exit.txt> fitxer on es deixa el CODI D'EIXIDA de cmd.exe; -1 = el
'                llancador no ha pogut executar res
'   La comanda s'executa amb `cmd.exe /d /s /c ""..."": /d evita l'AutoRun del
'   registre i /s fa que cmd lleve NOMES la primera i l'ultima cometa, aixi la
'   comanda arriba intacta encara que comence per cometa (p. ex.
'   "C:\Program Files\...\ffmpeg.exe"). Els accents viatgen en UTF-8 dins del
'   .txt, no per la linia de comandes (que aniria en la codepage del sistema).
'
' NOTES
'   - //B (batch) = cap dialeg d'error ni prompt: si alguna cosa peta, ix en
'     silenci amb el codi -1 (un dialeg seria una altra finestra).
'   - Este fitxer NO depen de res del panell: es pot provar a ma.
' ============================================================================
Option Explicit

Dim sCmdFile, sExitFile, sCmd, nCode, sh, fso, f

nCode = -1
On Error Resume Next

If WScript.Arguments.Count >= 2 Then
    sCmdFile = WScript.Arguments(0)
    sExitFile = WScript.Arguments(1)
End If

If Len(sCmdFile) > 0 Then
    sCmd = TrimCmd(ReadUtf8(sCmdFile))
    If Len(sCmd) > 0 Then
        Set sh = CreateObject("WScript.Shell")
        ' 0 = finestra oculta · True = espera · retorna el codi d'eixida
        nCode = sh.Run("cmd.exe /d /s /c """ & sCmd & """", 0, True)
    End If
End If

If Len(sExitFile) > 0 Then
    Set fso = CreateObject("Scripting.FileSystemObject")
    Set f = fso.CreateTextFile(sExitFile, True)
    If Err.Number = 0 Then
        f.Write CStr(nCode)
        f.Close
    End If
End If

WScript.Quit 0

' Llig un fitxer UTF-8 (cep.fs.writeFile escriu UTF-8) com a text.
Function ReadUtf8(sPath)
    Dim st
    ReadUtf8 = ""
    Set st = CreateObject("ADODB.Stream")
    st.Type = 2
    st.Charset = "utf-8"
    st.Open
    st.LoadFromFile sPath
    ReadUtf8 = st.ReadText(-1)
    st.Close
End Function

' Lleva BOM (65279), CR, LF, espais i tabuladors de principi i fi.
Function TrimCmd(s)
    Dim c
    TrimCmd = s
    Do While Len(TrimCmd) > 0
        c = AscW(Left(TrimCmd, 1))
        If c = 65279 Or c = 13 Or c = 10 Or c = 32 Or c = 9 Then
            TrimCmd = Mid(TrimCmd, 2)
        Else
            Exit Do
        End If
    Loop
    Do While Len(TrimCmd) > 0
        c = AscW(Right(TrimCmd, 1))
        If c = 13 Or c = 10 Or c = 32 Or c = 9 Then
            TrimCmd = Left(TrimCmd, Len(TrimCmd) - 1)
        Else
            Exit Do
        End If
    Loop
End Function
