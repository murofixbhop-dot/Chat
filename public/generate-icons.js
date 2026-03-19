#!/usr/bin/env node
// generate-icons.js
// Запустить: node generate-icons.js
// Создаёт SVG иконки для PWA в папке public/icons/

const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'public', 'icons');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

// SVG icon template
function makeSVG(size) {
  const r = Math.round(size * 0.28); // border radius
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="url(#g)"/>
  <path d="${bubblePath(size)}" fill="white"/>
</svg>`;
}

function bubblePath(s) {
  // Scale the chat bubble from 40x40 viewbox
  const sc = s / 40;
  const p = (x, y) => `${(x * sc).toFixed(1)} ${(y * sc).toFixed(1)}`;
  return `M${p(10,26)} Q${p(10,14)} ${p(20,14)} Q${p(30,14)} ${p(30,20)} Q${p(30,26)} ${p(22,27)} L${p(18,32)} L${p(17,27)} Q${p(10,26)} ${p(10,26)}Z`;
}

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
sizes.forEach(size => {
  const svg = makeSVG(size);
  const file = path.join(dir, `icon-${size}.svg`);
  fs.writeFileSync(file, svg);
  console.log(`✅ Created icon-${size}.svg`);
});

// Also write a simple HTML to convert SVG → PNG if needed
const html = `<!DOCTYPE html>
<html><body>
<p>Open browser console and run: convertIcons()</p>
<script>
async function convertIcons() {
  const sizes = [${sizes.join(',')}];
  for (const s of sizes) {
    const img = new Image();
    img.src = 'icons/icon-' + s + '.svg';
    await new Promise(r => img.onload = r);
    const c = document.createElement('canvas');
    c.width = c.height = s;
    c.getContext('2d').drawImage(img, 0, 0);
    const a = document.createElement('a');
    a.download = 'icon-' + s + '.png';
    a.href = c.toDataURL('image/png');
    a.click();
    await new Promise(r => setTimeout(r, 300));
  }
}
</script></body></html>`;
fs.writeFileSync(path.join(dir, 'convert.html'), html);

console.log('\n📱 Icons generated in public/icons/');
console.log('💡 To convert SVG→PNG: open public/icons/convert.html in browser and run convertIcons()');
console.log('   Or use: npx sharp-cli --input icons/*.svg --output icons/ --format png');
