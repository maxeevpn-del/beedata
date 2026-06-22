Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
electron = currentDir + "\node_modules\electron\dist\electron.exe"
If fso.FileExists(electron) Then
    WshShell.Run """" & electron & """ .", 1, False
Else
    MsgBox "Electron not found:" & vbCrLf & electron, 16, "蜜蜂数据 Error"
End If
