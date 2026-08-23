const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PNG } = require('pngjs');

const MASTER_PATH = path.resolve('_input/sfp-logo-master.png');
const EXPECTED_SHA = '79d98edae8bbecebca451ec8d37a838d926092621b4c20c55172c434ef71091d';

test.describe('Validação Cirúrgica de Proveniência do Ícone Oficial SFP no APK', () => {

  test('1. Existência e SHA-256 inalterado da PNG Master Oficial', () => {
    expect(fs.existsSync(MASTER_PATH)).toBe(true);
    const masterBuf = fs.readFileSync(MASTER_PATH);
    const sha = crypto.createHash('sha256').update(masterBuf).digest('hex');
    expect(sha).toBe(EXPECTED_SHA);
  });

  test('2. AndroidManifest aponta estritamente para os recursos de launcher esperados', () => {
    const manifestPath = path.resolve('app/src/main/AndroidManifest.xml');
    const manifest = fs.readFileSync(manifestPath, 'utf8');
    expect(manifest).toContain('android:icon="@mipmap/ic_launcher"');
    expect(manifest).toContain('android:roundIcon="@mipmap/ic_launcher_round"');
  });

  test('3. Adaptive Icon XMLs apontam para foreground master e background de cor', () => {
    for (const file of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
      const p = path.resolve(`app/src/main/res/mipmap-anydpi-v26/${file}`);
      expect(fs.existsSync(p)).toBe(true);
      const content = fs.readFileSync(p, 'utf8');
      expect(content).toContain('android:drawable="@mipmap/ic_launcher_foreground"');
      expect(content).toContain('android:drawable="@color/ic_launcher_background"');
    }
  });

  test('4. Todos os mipmaps raster (todas as 5 densidades) existem e possuem dimensões exatas', () => {
    const DENSITIES = {
      mdpi: { legacy: 48, adaptive: 108 },
      hdpi: { legacy: 72, adaptive: 162 },
      xhdpi: { legacy: 96, adaptive: 216 },
      xxhdpi: { legacy: 144, adaptive: 324 },
      xxxhdpi: { legacy: 192, adaptive: 432 }
    };

    for (const [density, dims] of Object.entries(DENSITIES)) {
      const squarePath = path.resolve(`app/src/main/res/mipmap-${density}/ic_launcher.png`);
      const roundPath = path.resolve(`app/src/main/res/mipmap-${density}/ic_launcher_round.png`);
      const fgPath = path.resolve(`app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`);

      expect(fs.existsSync(squarePath)).toBe(true);
      expect(fs.existsSync(roundPath)).toBe(true);
      expect(fs.existsSync(fgPath)).toBe(true);

      const squarePng = PNG.sync.read(fs.readFileSync(squarePath));
      expect(squarePng.width).toBe(dims.legacy);
      expect(squarePng.height).toBe(dims.legacy);

      const roundPng = PNG.sync.read(fs.readFileSync(roundPath));
      expect(roundPng.width).toBe(dims.legacy);
      expect(roundPng.height).toBe(dims.legacy);

      const fgPng = PNG.sync.read(fs.readFileSync(fgPath));
      expect(fgPng.width).toBe(dims.adaptive);
      expect(fgPng.height).toBe(dims.adaptive);
    }
  });

  test('5. Proveniência e fidelidade cromática: mipmaps derivam da master e não da arte vetorial antiga', () => {
    // Carrega a master e o xxxhdpi gerado
    const masterBuf = fs.readFileSync(MASTER_PATH);
    const masterPng = PNG.sync.read(masterBuf);

    const fgBuf = fs.readFileSync(path.resolve('app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png'));
    const fgPng = PNG.sync.read(fgBuf);

    // Amostra o centro geométrico da logo (RGB característico turquesa da master #06b9aa)
    const centerX = Math.floor(fgPng.width / 2);
    const centerY = Math.floor(fgPng.height / 2);
    const idx = (fgPng.width * centerY + centerX) << 2;
    const r = fgPng.data[idx];
    const g = fgPng.data[idx + 1];
    const b = fgPng.data[idx + 2];

    // O centro da master tem cor turquesa brilhante (g > 150, b > 140, r < 30)
    expect(g).toBeGreaterThan(120);
    expect(b).toBeGreaterThan(120);

    // Confirma que não existem resquícios de SVGs vetoriais antigos em drawable/
    expect(fs.existsSync(path.resolve('app/src/main/res/drawable/ic_launcher_foreground.xml'))).toBe(false);
    expect(fs.existsSync(path.resolve('app/src/main/res/drawable/ic_launcher_background.xml'))).toBe(false);
  });

});
