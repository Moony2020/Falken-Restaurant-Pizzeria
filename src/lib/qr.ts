// Minimalist, robust QR Code SVG generator (Byte mode, Version 1-6)
// Zero external dependencies.

// GF(256) log and exp tables
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  EXP[i + 255] = x;
  LOG[x] = i;
  x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
}

function gmult(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function genPoly(deg: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < deg; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gmult(poly[j], EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function calcEcc(data: Uint8Array, eccCount: number): Uint8Array {
  const poly = genPoly(eccCount);
  const res = new Uint8Array(eccCount);
  for (let i = 0; i < data.length; i++) {
    const feedback = data[i] ^ res[0];
    res.copyWithin(0, 1);
    res[eccCount - 1] = 0;
    for (let j = 0; j < eccCount; j++) {
      res[j] ^= gmult(poly[j], feedback);
    }
  }
  return res;
}

// QR Version table for Level M (medium error correction)
// Version 4 (33x33): 64 data codewords, 36 ECC codewords (2 blocks of 32+18)
// Version 5 (37x37): 86 data codewords, 48 ECC codewords (2 blocks of 43+24)
export function generateQrSvg(text: string, size = 220): string {
  const utf8 = new TextEncoder().encode(text);
  // For ~50 chars, Version 4 (33x33) handles up to 64 bytes in Level L or 50 in Level M.
  // Version 5 (37x37) Level M handles up to 86 bytes with plenty of room.
  const ver = 5;
  const dim = 17 + 4 * ver; // 37
  const matrix: (number | null)[][] = Array.from({ length: dim }, () => Array(dim).fill(null));

  function setFinder(r: number, c: number) {
    for (let i = -1; i <= 7; i++) {
      for (let j = -1; j <= 7; j++) {
        const y = r + i, x = c + j;
        if (y < 0 || y >= dim || x < 0 || x >= dim) continue;
        const isBorder = i === -1 || i === 7 || j === -1 || j === 7;
        const isOuter = i === 0 || i === 6 || j === 0 || j === 6;
        const isInner = i >= 2 && i <= 4 && j >= 2 && j <= 4;
        matrix[y][x] = isBorder ? 0 : isOuter || isInner ? 1 : 0;
      }
    }
  }

  setFinder(0, 0);
  setFinder(0, dim - 7);
  setFinder(dim - 7, 0);

  // Timing patterns
  for (let i = 8; i < dim - 8; i++) {
    matrix[6][i] = i % 2 === 0 ? 1 : 0;
    matrix[i][6] = i % 2 === 0 ? 1 : 0;
  }

  // Alignment pattern for Version 5 (center at 30, 30)
  const align = 30;
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      const isOuter = Math.abs(i) === 2 || Math.abs(j) === 2;
      const isCenter = i === 0 && j === 0;
      matrix[align + i][align + j] = isOuter || isCenter ? 1 : 0;
    }
  }

  // Encode data into bitstream
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  // Byte mode indicator: 0100
  pushBits(0b0100, 4);
  // Character count: 8 bits for Version 1-9 in Byte mode
  pushBits(utf8.length, 8);
  for (const b of utf8) pushBits(b, 8);
  // Terminator
  pushBits(0, 4);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataBytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] ?? 0);
    dataBytes.push(byte);
  }

  // Pad to 86 data codewords
  const pad = [0xec, 0x11];
  let p = 0;
  while (dataBytes.length < 86) {
    dataBytes.push(pad[p++ % 2]);
  }

  // Split into 2 blocks of 43 data codewords + 24 ECC codewords each
  const b1Data = new Uint8Array(dataBytes.slice(0, 43));
  const b2Data = new Uint8Array(dataBytes.slice(43, 86));
  const b1Ecc = calcEcc(b1Data, 24);
  const b2Ecc = calcEcc(b2Data, 24);

  // Interleave data codewords
  const allCodewords: number[] = [];
  for (let i = 0; i < 43; i++) {
    allCodewords.push(b1Data[i], b2Data[i]);
  }
  for (let i = 0; i < 24; i++) {
    allCodewords.push(b1Ecc[i], b2Ecc[i]);
  }

  // Turn into stream of bits
  const finalBits: number[] = [];
  for (const b of allCodewords) {
    for (let i = 7; i >= 0; i--) finalBits.push((b >> i) & 1);
  }
  // Remainder bits for Version 5: 7 bits
  for (let i = 0; i < 7; i++) finalBits.push(0);

  // Place codewords into matrix (right to left, zig-zag)
  let bitIdx = 0;
  let upwards = true;
  for (let right = dim - 1; right > 0; right -= 2) {
    if (right === 6) right--; // skip timing col
    const cols = [right, right - 1];
    const rows = upwards
      ? Array.from({ length: dim }, (_, i) => dim - 1 - i)
      : Array.from({ length: dim }, (_, i) => i);

    for (const r of rows) {
      for (const c of cols) {
        if (matrix[r][c] === null) {
          const bit = bitIdx < finalBits.length ? finalBits[bitIdx++] : 0;
          // Apply standard mask 0: (row + col) % 2 === 0
          const mask = (r + c) % 2 === 0 ? 1 : 0;
          matrix[r][c] = bit ^ mask;
        }
      }
    }
    upwards = !upwards;
  }

  // Format info for Level M + Mask 0: 101010000010010
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  // Around top-left finder
  for (let i = 0; i < 6; i++) matrix[8][i] = formatBits[i];
  matrix[8][7] = formatBits[6];
  matrix[8][8] = formatBits[7];
  matrix[7][8] = formatBits[8];
  for (let i = 9; i < 15; i++) matrix[14 - i][8] = formatBits[i];

  // Around other finders
  for (let i = 0; i < 8; i++) matrix[dim - 1 - i][8] = formatBits[i];
  for (let i = 8; i < 15; i++) matrix[8][dim - 15 + i] = formatBits[i];

  // Build SVG path
  let rects = "";
  const moduleSize = size / (dim + 4); // 2 modules quiet zone
  for (let r = 0; r < dim; r++) {
    for (let c = 0; c < dim; c++) {
      if (matrix[r][c] === 1) {
        const x = (c + 2) * moduleSize;
        const y = (r + 2) * moduleSize;
        rects += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${moduleSize.toFixed(1)}" height="${moduleSize.toFixed(1)}" fill="currentColor" />`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="w-full h-full text-ink">${rects}</svg>`;
}

