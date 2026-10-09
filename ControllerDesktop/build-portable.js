// build-portable.js - Erstellt ein komplettes portables Build-Paket
// Dieses Skript automatisiert den gesamten Build-Prozess fuer Plug & Play
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const ROOT = __dirname;
const RELEASE_DIR = path.join(ROOT, 'Release');
const TEMP_DIR = path.join(ROOT, 'TempBuild');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

async function createZip(sourceDir, outputZip) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputZip);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve());
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

async function main() {
  console.log('=== ControllerDesktop Portable Build ===\n');

  // 1. Icons erstellen
  console.log('[1/5] Erstelle Icons...');
  try { execSync('node create-icons.js', { stdio: 'inherit' }); } catch {}

  // 2. Abhaengigkeiten installieren
  console.log('\n[2/5] Installiere Abhaengigkeiten...');
  execSync('npm install --production=false', { stdio: 'inherit', cwd: ROOT });

  // 3. Electron-Ordner bauen
  console.log('\n[3/5] Baue Electron-App...');
  cleanDir(TEMP_DIR);
  ensureDir(TEMP_DIR);

  const electronSrc = path.join(ROOT, 'node_modules', 'electron', 'dist');
  if (fs.existsSync(electronSrc)) {
    // Kopiere Electron-Runtime
    const electronDest = path.join(TEMP_DIR, 'electron-runtime');
    fs.cpSync(electronSrc, electronDest, { recursive: true });
    console.log('  Electron-Runtime kopiert');
  }

  // Kopiere App-Dateien
  const appFiles = ['main.js', 'preload.js'];
  for (const f of appFiles) {
    fs.copyFileSync(path.join(ROOT, f), path.join(TEMP_DIR, f));
  }
  fs.cpSync(path.join(ROOT, 'src'), path.join(TEMP_DIR, 'src'), { recursive: true });

  // Kopiere nut-js (native Abhaengigkeit)
  const nutJsSrc = path.join(ROOT, 'node_modules', '@nut-tree');
  if (fs.existsSync(nutJsSrc)) {
    fs.cpSync(nutJsSrc, path.join(TEMP_DIR, 'node_modules', '@nut-tree'), { recursive: true });
  }

  // 4. Launcher erstellen
  console.log('\n[4/5] Erstelle Launcher...');
  const launcherBat = `@echo off
cd /d "%~dp0"
start "" "%~dp0electron-runtime\\electron.exe" "%~dp0main.js" %*
`;
  fs.writeFileSync(path.join(TEMP_DIR, 'ControllerDesktop.bat'), launcherBat);

  const launcherVbs = `' ControllerDesktop - Portable Launcher
' Versteckt das Konsolenfenster
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """" & WScript.ScriptFullName & "\\..\\ControllerDesktop.bat"" """, 0, False
`;
  fs.writeFileSync(path.join(TEMP_DIR, 'ControllerDesktop-Silent.vbs'), launcherVbs);

  // 5. EXE-Datei erstellen (mit Electron)
  console.log('\n[5/5] Erstelle portable EXE...');

  // Erstelle eine package.json fuer den Build
  const buildPkg = {
    name: 'controllerdesktop-portable',
    version: '1.0.0',
    main: 'main.js',
    dependencies: {}
  };
  fs.writeFileSync(path.join(TEMP_DIR, 'package.json'), JSON.stringify(buildPkg, null, 2));

  // Kopiere electron.exe als App-EXE
  const electronExe = path.join(TEMP_DIR, 'electron-runtime', 'electron.exe');
  const appExe = path.join(TEMP_DIR, 'ControllerDesktop.exe');
  if (fs.existsSync(electronExe)) {
    fs.copyFileSync(electronExe, appExe);

    // Ressourcen mit electron-icon-builder oder einfach als Nebenlage
    console.log('  ControllerDesktop.exe erstellt');
  }

  // 6. ZIP erstellen
  console.log('\nErstelle ZIP-Archiv...');
  ensureDir(RELEASE_DIR);
  const zipPath = path.join(RELEASE_DIR, 'ControllerDesktop-Portable.zip');
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  await createZip(TEMP_DIR, zipPath);
  console.log('  ZIP erstellt:', zipPath);

  // 7. Kopiere Release-Dateien
  cleanDir(RELEASE_DIR);
  fs.cpSync(TEMP_DIR, RELEASE_DIR, { recursive: true });

  // Aufräumen
  cleanDir(TEMP_DIR);

  console.log('\n=== Build abgeschlossen ===');
  console.log('Release-Ordner:', RELEASE_DIR);
  console.log('Starte ControllerDesktop.exe oder ControllerDesktop-Silent.vbs');
}

main().catch(err => {
  console.error('Build fehlgeschlagen:', err);
  process.exit(1);
});
