import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PNG } from 'pngjs';

const MASTER_PATH = '_input/sfp-logo-master.png';
const EXPECTED_SHA = '79d98edae8bbecebca451ec8d37a838d926092621b4c20c55172c434ef71091d';

if (!fs.existsSync(MASTER_PATH)) {
  console.error(`ERRO: Master logo não encontrada em ${MASTER_PATH}`);
  process.exit(1);
}

const masterBuf = fs.readFileSync(MASTER_PATH);
const masterSha = crypto.createHash('sha256').update(masterBuf).digest('hex');
if (masterSha !== EXPECTED_SHA) {
  console.error(`ERRO: SHA-256 divergente da master! Esperado: ${EXPECTED_SHA}, Encontrado: ${masterSha}`);
  process.exit(1);
}

console.log('✓ SHA-256 da master verificado com sucesso:', masterSha);

const masterPng = PNG.sync.read(masterBuf);

// High-precision Area-Averaging Resampling for perfect downsampling quality
function areaAverageResize(srcPng, targetW, targetH) {
  const dst = new PNG({ width: targetW, height: targetH });
  const scaleX = srcPng.width / targetW;
  const scaleY = srcPng.height / targetH;

  for (let dy = 0; dy < targetH; dy++) {
    const sy0 = dy * scaleY;
    const sy1 = (dy + 1) * scaleY;
    const iy0 = Math.floor(sy0);
    const iy1 = Math.min(srcPng.height - 1, Math.floor(sy1));

    for (let dx = 0; dx < targetW; dx++) {
      const sx0 = dx * scaleX;
      const sx1 = (dx + 1) * scaleX;
      const ix0 = Math.floor(sx0);
      const ix1 = Math.min(srcPng.width - 1, Math.floor(sx1));

      let rSum = 0, gSum = 0, bSum = 0, aSum = 0, weightSum = 0;

      for (let sy = iy0; sy <= iy1; sy++) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        if (wy <= 0) continue;

        for (let sx = ix0; sx <= ix1; sx++) {
          const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          if (wx <= 0) continue;

          const weight = wx * wy;
          const sIdx = (srcPng.width * sy + sx) << 2;
          rSum += srcPng.data[sIdx] * weight;
          gSum += srcPng.data[sIdx + 1] * weight;
          bSum += srcPng.data[sIdx + 2] * weight;
          aSum += srcPng.data[sIdx + 3] * weight;
          weightSum += weight;
        }
      }

      const dIdx = (targetW * dy + dx) << 2;
      dst.data[dIdx] = Math.round(rSum / weightSum);
      dst.data[dIdx + 1] = Math.round(gSum / weightSum);
      dst.data[dIdx + 2] = Math.round(bSum / weightSum);
      dst.data[dIdx + 3] = Math.round(aSum / weightSum);
    }
  }
  return dst;
}

// Generates Adaptive Icon Foreground (108dp canvas with artwork scaled safely inside the safe zone)
function createAdaptiveForeground(srcPng, canvasSize, safeRatio = 68 / 108) {
  const fg = new PNG({ width: canvasSize, height: canvasSize });
  // Transparent canvas
  for (let i = 0; i < fg.data.length; i += 4) {
    fg.data[i] = 0;
    fg.data[i+1] = 0;
    fg.data[i+2] = 0;
    fg.data[i+3] = 0;
  }

  const innerSize = Math.round(canvasSize * safeRatio);
  const offsetX = Math.floor((canvasSize - innerSize) / 2);
  const offsetY = Math.floor((canvasSize - innerSize) / 2);

  const innerPng = areaAverageResize(srcPng, innerSize, innerSize);

  for (let y = 0; y < innerSize; y++) {
    for (let x = 0; x < innerSize; x++) {
      const sIdx = (innerSize * y + x) << 2;
      const dIdx = (canvasSize * (y + offsetY) + (x + offsetX)) << 2;
      fg.data[dIdx] = innerPng.data[sIdx];
      fg.data[dIdx + 1] = innerPng.data[sIdx + 1];
      fg.data[dIdx + 2] = innerPng.data[sIdx + 2];
      fg.data[dIdx + 3] = innerPng.data[sIdx + 3];
    }
  }
  return fg;
}

// Generates Legacy Round Icon (circular anti-aliased mask)
function createRoundLegacyIcon(srcPng, size) {
  const square = areaAverageResize(srcPng, size, size);
  const round = new PNG({ width: size, height: size });
  const radius = size / 2;
  const cx = radius - 0.5;
  const cy = radius - 0.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      const dist = Math.hypot(x - cx, y - cy);

      round.data[idx] = square.data[idx];
      round.data[idx + 1] = square.data[idx + 1];
      round.data[idx + 2] = square.data[idx + 2];

      if (dist <= radius - 0.75) {
        round.data[idx + 3] = square.data[idx + 3];
      } else if (dist >= radius + 0.75) {
        round.data[idx + 3] = 0;
      } else {
        // Anti-aliased edge
        const alphaFraction = (radius + 0.75 - dist) / 1.5;
        round.data[idx + 3] = Math.round(square.data[idx + 3] * alphaFraction);
      }
    }
  }
  return round;
}

const DENSITIES = {
  mdpi: { legacy: 48, adaptive: 108 },
  hdpi: { legacy: 72, adaptive: 162 },
  xhdpi: { legacy: 96, adaptive: 216 },
  xxhdpi: { legacy: 144, adaptive: 324 },
  xxxhdpi: { legacy: 192, adaptive: 432 }
};

for (const [density, dims] of Object.entries(DENSITIES)) {
  const dir = path.resolve(`app/src/main/res/mipmap-${density}`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // 1. Legacy Square Launcher Icon
  const legacySquare = areaAverageResize(masterPng, dims.legacy, dims.legacy);
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), PNG.sync.write(legacySquare));

  // 2. Legacy Round Launcher Icon
  const legacyRound = createRoundLegacyIcon(masterPng, dims.legacy);
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), PNG.sync.write(legacyRound));

  // 3. Adaptive Icon Foreground Layer
  const adaptiveFg = createAdaptiveForeground(masterPng, dims.adaptive, 68 / 108);
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), PNG.sync.write(adaptiveFg));

  console.log(`✓ mipmap-${density}: ic_launcher.png (${dims.legacy}x${dims.legacy}), ic_launcher_round.png (${dims.legacy}x${dims.legacy}), ic_launcher_foreground.png (${dims.adaptive}x${dims.adaptive})`);
}

console.log('\nTodos os recursos de launcher foram gerados diretamente da PNG master com sucesso.');
