const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Android desativa Auto Backup para dados financeiros locais', async () => {
  const manifest = read('app/src/main/AndroidManifest.xml');
  expect(manifest).toContain('android:allowBackup="false"');
  expect(manifest).toContain('android:fullBackupContent="false"');
});

test('notificação usa ícone próprio, permissão contextual e redação BRL completa', async () => {
  const bridge = read('app/src/main/java/com/jhony/sfp/AndroidBridge.java');
  const main = read('app/src/main/java/com/jhony/sfp/MainActivity.java');
  expect(bridge).toContain('.setSmallIcon(R.drawable.ic_notification_small)');
  expect(bridge).toContain('ensureNotificationPermissionForContextualAlert()');
  expect(main).toContain('Manifest.permission.POST_NOTIFICATIONS');
  expect(main).toContain('NOTIFICATION_PERMISSION_REQUEST');
  const redaction = bridge.match(/static String redactFinancialValues[\s\S]*?\n    }/i)?.[0] || '';
  expect(redaction).toContain('\\\\d{1,3}(?:\\\\.\\\\d{3})+');
  expect(redaction).toContain('(?:,\\\\d{2})?');
  expect(bridge).toContain('safeTitle = redactFinancialValues(safeTitle)');
  expect(bridge).toContain('safeMessage = redactFinancialValues(safeMessage)');
});

test('file picker respeita extensões financeiras, documentos e imagens', async () => {
  const main = read('app/src/main/java/com/jhony/sfp/MainActivity.java');
  for (const [ext, mime] of [
    ['csv', 'text/csv'], ['ofx', 'application/x-ofx'], ['qfx', 'application/x-ofx'],
    ['json', 'application/json'], ['pdf', 'application/pdf'], ['jpg', 'image/jpeg'],
    ['png', 'image/png'], ['webp', 'image/webp'], ['sfp', 'application/octet-stream']
  ]) {
    expect(main).toContain(`case "${ext}"`);
    expect(main).toContain(`return "${mime}"`);
  }
  expect(main).toContain('Intent.EXTRA_MIME_TYPES');
  expect(main).toContain('Intent.EXTRA_ALLOW_MULTIPLE');
});

test('exportação Android distingue Downloads público de armazenamento privado legado', async () => {
  const bridge = read('app/src/main/java/com/jhony/sfp/AndroidBridge.java');
  expect(bridge).toContain('MediaStore.Downloads.EXTERNAL_CONTENT_URI');
  expect(bridge).toContain('publicDownloads = true');
  expect(bridge).toContain('getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)');
  expect(bridge).toContain('publicDownloads = false');
  expect(bridge).toContain('result.put("ok", true)');
  expect(bridge).toContain('result.put("location", location)');
});
