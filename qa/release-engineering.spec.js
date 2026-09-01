const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test.describe('Android release engineering', () => {
  test('versão tem fonte única e monotônica no Gradle', () => {
    const props = read('gradle.properties');
    const build = read('app/build.gradle');

    expect(props).toMatch(/^SFP_VERSION_CODE=\d+$/m);
    expect(props).toMatch(/^SFP_VERSION_NAME=\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/m);
    expect(build).toContain('providers.gradleProperty("SFP_VERSION_CODE")');
    expect(build).toContain('providers.gradleProperty("SFP_VERSION_NAME")');
    expect(build).not.toMatch(/versionName\s+["'][0-9]/);
  });

  test('bridge Android usa a versão gerada pelo BuildConfig', () => {
    const build = read('app/build.gradle');
    const bridge = read('app/src/main/java/com/jhony/sfp/AndroidBridge.java');

    expect(build).toMatch(/buildFeatures\s*\{[\s\S]*?buildConfig\s+true[\s\S]*?\}/);
    expect(bridge).toContain('return BuildConfig.VERSION_NAME;');
    expect(bridge).not.toContain('return "2.0.2";');
    expect(bridge).toContain('"SmartFinancialPlanner/" + BuildConfig.VERSION_NAME + " Sophy/3.0"');
  });

  test('bridge Android desbloqueia PDF protegido sem persistir a senha', () => {
    const bridge = read('app/src/main/java/com/jhony/sfp/AndroidBridge.java');

    expect(bridge).toContain('extractPdfTextWithPassword(String base64Pdf, String password)');
    expect(bridge).toContain('PDDocument.load(bytes, transientPassword)');
    expect(bridge).toContain('catch (InvalidPasswordException e)');
    expect(bridge).toContain('"passwordRequired"');
    expect(bridge).toContain('"invalid_password"');
    expect(bridge).not.toMatch(/putString\([^\n]*password/i);
    expect(bridge).not.toMatch(/Log\.[a-z]+\([^\n]*password/i);
  });

  test('pipeline produz e verifica APK/AAB versionados', () => {
    const workflow = read('.github/workflows/build-apk.yml');

    expect(workflow).toContain('gradle :app:assembleRelease :app:bundleRelease');
    expect(workflow).toContain('apksigner');
    expect(workflow).toContain('jarsigner -verify');
    expect(workflow).toContain('SHA256SUMS.txt');
    expect(workflow).toContain('SIGNING-CERT.txt');
    expect(workflow).toContain('RELEASE-METADATA.txt');
    expect(workflow).toContain('gh release create');
    expect(workflow).toContain('EXPECTED_TAG="v${VERSION_NAME}"');
  });

  test('keystore e artefatos locais estão ignorados pelo Git', () => {
    const ignore = read('.gitignore');

    expect(ignore).toContain('*.jks');
    expect(ignore).toContain('*.keystore');
    expect(ignore).toContain('*.p12');
    expect(ignore).toContain('dist/');
  });
});
