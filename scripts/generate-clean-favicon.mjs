import fs from "fs";
import path from "path";
import sharp from "sharp";

// Falcon path exact from src/components/icons.tsx
const FALCON_PATH = "M32 4 C36 10, 48 12, 58 10 C54 18, 46 22, 40 24 C46 28, 54 29, 60 28 C52 35, 42 37, 34 35 C38 41, 46 45, 52 47 C42 50, 32 46, 26 40 C28 46, 30 52, 34 56 C26 54, 20 48, 18 42 C14 48, 10 52, 6 54 C10 46, 14 38, 18 30 C12 28, 6 24, 2 20 C10 20, 18 22, 24 26 C22 18, 24 10, 32 4 Z";

// Crystal clear transparent SVG with vibrant metallic gold gradient & contrast shadow
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffeaa7"/>
      <stop offset="35%" stop-color="#f5cd56"/>
      <stop offset="70%" stop-color="#d4af37"/>
      <stop offset="100%" stop-color="#b88e4d"/>
    </linearGradient>
    <filter id="crispShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="1.2" stdDeviation="1.2" flood-color="#000000" flood-opacity="0.85"/>
      <feDropShadow dx="0" dy="0" stdDeviation="0.6" flood-color="#000000" flood-opacity="0.95"/>
    </filter>
  </defs>
  <g filter="url(#crispShadow)">
    <path d="${FALCON_PATH}" fill="url(#goldGradient)"/>
  </g>
</svg>`;

// Solid luxury badge version for apple touch icon and PWA (rounded dark square with gold emblem)
const svgAppIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="goldGradientLarge" x1="10%" y1="0%" x2="90%" y2="100%">
      <stop offset="0%" stop-color="#ffeaa7"/>
      <stop offset="35%" stop-color="#f5cd56"/>
      <stop offset="70%" stop-color="#d4af37"/>
      <stop offset="100%" stop-color="#b88e4d"/>
    </linearGradient>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e2024"/>
      <stop offset="100%" stop-color="#101114"/>
    </linearGradient>
    <filter id="glowLarge" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#000000" flood-opacity="0.7"/>
    </filter>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)"/>
  <rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="#d4af37" stroke-width="8" stroke-opacity="0.8"/>
  <g transform="translate(256 256) scale(6.2) translate(-32 -32)" filter="url(#glowLarge)">
    <path d="${FALCON_PATH}" fill="url(#goldGradientLarge)"/>
  </g>
</svg>`;

function buildIco(pngBuffers) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // ICO image
  header.writeUInt16LE(pngBuffers.length, 4); // count

  let offset = 6 + pngBuffers.length * 16;
  const directoryEntries = [];
  const imageDatas = [];

  for (const { width, height, buffer } of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(width >= 256 ? 0 : width, 0);
    entry.writeUInt8(height >= 256 ? 0 : height, 1);
    entry.writeUInt8(0, 2); // color palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(buffer.length, 8); // size of image data
    entry.writeUInt32LE(offset, 12); // offset of image data
    directoryEntries.push(entry);
    imageDatas.push(buffer);
    offset += buffer.length;
  }

  return Buffer.concat([header, ...directoryEntries, ...imageDatas]);
}

async function main() {
  console.log("Generating crystal-clear Falken favicon and icons...");

  // 1. Write SVG icons
  fs.writeFileSync(path.resolve("public/icon.svg"), svgIcon, "utf8");
  fs.writeFileSync(path.resolve("src/app/icon.svg"), svgIcon, "utf8");

  // 2. Generate PNGs for ICO (16, 32, 48)
  const sizes = [16, 32, 48];
  const icoPngBuffers = [];
  for (const s of sizes) {
    const buf = await sharp(Buffer.from(svgIcon))
      .resize(s, s)
      .png()
      .toBuffer();
    icoPngBuffers.push({ width: s, height: s, buffer: buf });
  }

  const icoBuffer = buildIco(icoPngBuffers);
  fs.writeFileSync(path.resolve("public/favicon.ico"), icoBuffer);
  fs.writeFileSync(path.resolve("src/app/favicon.ico"), icoBuffer);

  // 3. Generate Apple touch icon & PWA icons
  const appleTouch = await sharp(Buffer.from(svgAppIcon))
    .resize(180, 180)
    .png()
    .toBuffer();
  fs.writeFileSync(path.resolve("public/apple-touch-icon.png"), appleTouch);
  fs.writeFileSync(path.resolve("src/app/apple-icon.png"), appleTouch);

  const icon192 = await sharp(Buffer.from(svgAppIcon))
    .resize(192, 192)
    .png()
    .toBuffer();
  fs.writeFileSync(path.resolve("public/icon-192.png"), icon192);

  const icon512 = await sharp(Buffer.from(svgAppIcon))
    .resize(512, 512)
    .png()
    .toBuffer();
  fs.writeFileSync(path.resolve("public/icon-512.png"), icon512);

  console.log("All favicon and app icon assets successfully generated!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

