 @echo off
chcp 65001 >nul 2>&1
echo ========================================
echo  ControllerDesktop - Portable
echo ========================================
echo.
cd /d "%~dp0"

REM Pruefe ob Release-Ordner existiert
if not exist "Release\ControllerDesktop.exe" (
  echo Release-Ordner nicht gefunden...
  echo Erstelle Build...
  echo.
  call npm install
  if errorlevel 1 (
    echo FEHLER: npm install fehlgeschlagen
    echo Bitte Node.js installieren: https://nodejs.org
    pause
    exit /b 1
  )
  call node create-icons.js
  call node build-portable.js
  if errorlevel 1 (
    echo FEHLER: Build fehlgeschlagen
    pause
    exit /b 1
  )
)

echo Starte ControllerDesktop...
echo Tipp: ControllerDesktop-Silent.vbs startet ohne Konsolenfenster
echo.

REM Starte die EXE (kopiert aus electron-runtime)
if exist "Release\ControllerDesktop.exe" (
  start "" "Release\ControllerDesktop.exe"
) else if exist "Release\ControllerDesktop.bat" (
  start "" "Release\ControllerDesktop.bat"
) else (
  echo FEHLER: Keine Startdatei gefunden
  pause
  exit /b 1
)

echo ControllerDesktop gestartet.
timeout /t 3 >nul
exit /b 0
