@echo off
chcp 65001 >nul 2>&1
echo ========================================
echo  ControllerDesktop - Start
echo ========================================
echo.
cd /d "%~dp0"

if not exist "node_modules" (
  echo Installiere Abhaengigkeiten...
  call npm install
  if errorlevel 1 (
    echo FEHLER: npm install fehlgeschlagen - bitte Node.js 18+ installieren.
    pause
    exit /b 1
  )
)

if not exist "release\win-unpacked\ControllerDesktop.exe" (
  echo Baue App und Installer...
  call npm run build
  if errorlevel 1 (
    echo FEHLER: Build fehlgeschlagen.
    pause
    exit /b 1
  )
)

echo.
echo Installer:  release\ControllerDesktop-Setup-*.exe
echo Portable:   release\ControllerDesktop-Portable-*.exe
echo.
if exist "release\win-unpacked\ControllerDesktop.exe" (
  start "" "release\win-unpacked\ControllerDesktop.exe"
) else (
  echo FEHLER: Keine Startdatei gefunden.
  pause
  exit /b 1
)

timeout /t 3 >nul
exit /b 0
