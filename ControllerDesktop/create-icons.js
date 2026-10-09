// create-icons.js - Erstellt einfache PNG-Icons fuer die App
const fs = require('fs');
const path = require('path');

// Gueltiges 1x1 lila Pixel PNG als Fallback-Icon (Base64)
const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const iconsDir = path.join(__dirname, 'src', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

fs.writeFileSync(path.join(iconsDir, 'icon.png'), png1x1);
fs.writeFileSync(path.join(iconsDir, 'tray.png'), png1x1);

console.log('Icons erstellt:', iconsDir);
