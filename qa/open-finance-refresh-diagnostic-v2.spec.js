const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

const read = file => fs.readFileSync(file, 'utf8');

test.describe('Open Finance refresh diagnostic v2', () => {
  test('diagnóstico preserva causa sanitizada sem expor identificadores', () => {
    const source = read('app/src/main/assets/www/open-finance-real-refresh.js');

    expect(source).toContain("schema:'sfp-refresh-diagnostic-v2'");
    expect(source).toContain('status:safeStatus(result.status)');
    expect(source).toContain('message:safeText(result.message)');
    expect(source).toContain('stage:code(result.stage)');
    expect(source).toContain('credentials:false');
    expect(source).toContain('itemIds:false');
    expect(source).toContain('accountIds:false');
    expect(source).not.toContain('row.id,');
  });

  test('ponte nativa classifica transporte por etapa e nunca repete PATCH', () => {
    const source = read('app/src/main/java/com/jhony/sfp/PluggyRefreshBridge.java');

    expect(source).toContain('UnknownHostException');
    expect(source).toContain('SocketTimeoutException');
    expect(source).toContain('SSLException');
    expect(source).toContain('stage = "ITEM_DISCOVERY"');
    expect(source).toContain('stage = "ITEM_REFRESH"');
    expect(source).toContain('if ("PATCH".equals(method)) throw firstFailure;');
    expect(source).toContain('REFRESH_" + stage + "_" + kind');
  });
});
