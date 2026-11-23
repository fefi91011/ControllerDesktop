; installer.nsh – kleine Anpassungen am NSIS-Installer
; Wird von electron-builder über nsis.include eingebunden.

; Beim Update die laufende App vorher beenden, damit Dateien ersetzt werden können
!macro customInit
  nsExec::Exec 'taskkill /f /im "ControllerDesktop.exe"'
!macroend

; Nach der Installation optional direkt starten (electron-builder macht das bereits,
; hier nur der Hinweis auf die Update-Quelle in der Registry)
!macro customInstall
  WriteRegStr HKCU "Software\ControllerDesktop" "UpdateChannel" "github"
!macroend

; Beim Deinstallieren die Update-Markierung entfernen
!macro customUnInstall
  DeleteRegKey HKCU "Software\ControllerDesktop"
!macroend
