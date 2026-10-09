# ControllerDesktop - Portable Gamepad Desktop Steuerung

Eine leichtgewichtige, portable Desktop-App mit der du deinen Controller zum Maerschen, Scrollen, Tippen und Steueren verwenden kannst.

## Plug & Play

1. Repository klonen oder als ZIP herunterladen
2. `npm install` einmalig ausfuehren (installiert Electron und Abhaengigkeiten)
3. `npm run build` ausfuehren
4. `ControllerDesktop/Release/ControllerDesktop-Portable.exe` starten

Die portable EXE enthaelt alle Abhaengigkeiten. Sie kann direkt von einem USB-Stick oder beliebigem Ordner gestartet werden, ohne Installation.

## Features

- **Controller-Eingabe**: Face-Buttons, D-Pad, Sticks, Trigger und Center-Buttons
- **Custom Mappings**: Jede Taste kann einer beliebigen Aktion zugeordnet werden
- **Aktionstypen**: Tastenklick, Modifier-Kombinationen, Mausaktionen, Scrollen, Makros, App-Befehle
- **Bildschirmtastatur**: Vollwertige Tastatur zur Eingabe per Controller
- **Controller-Visual**: Echtzeit-Anzeige aller Tasten und Sticks
- **Profile**: Mehrere Mapping-Profile erstellen, loeschen und wechseln
- **Einstellungen**: Deadzone, Sensitivitaet, Scroll-Geschwindigkeit, Theme
- **Tray**: Läuft im Hintergrund, ein/ausblender per Tastenkombination

## Default Controller Mapping

| Controller Taste | Aktion |
|----------------|--------|
| D-Pad | Pfeiltasten |
| A / Cross | Enter |
| B / Circle | Escape |
| X / Square | Backspace |
| Y / Y / Triangle | Space |
| LB / L1 | Strg (Modifier) |
| RB / R1 | Umschalt (Modifier) |
| LT / L2 | Alt (Modifier) |
| RT / R2 | Meta/Win (Modifier) |
| Select / Back | App minimieren |
| Start / Options | App an/aus |
| L3 | Maus links |
| R3 | Maus rechts |
| Linker Stick | Mausbewegung |
| Rechter Stick | Scrollen |

## Build

```bash
npm install
npm run build
```

Output: `Release/ControllerDesktop-Portable.exe`

## Technologie

- Electron (Portable/EXE)
- @nut-tree/nut-js (Tastatur/Maus-Simulation)
- Vanilla HTML/CSS/JS Renderer
- Gamepad API (Browser-nativ)
