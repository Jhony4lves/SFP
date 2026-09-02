const fs=require('fs');

function read(path){return fs.readFileSync(path,'utf8')}
function write(path,content){fs.writeFileSync(path,content)}
function replaceOnce(source,needle,replacement,label){
  const count=source.split(needle).length-1;
  if(count!==1) throw new Error(`${label}: expected exactly 1 match, got ${count}`);
  return source.replace(needle,replacement);
}
function replaceRegex(source,regex,replacement,label){
  const matches=source.match(regex);
  if(!matches) throw new Error(`${label}: pattern not found`);
  return source.replace(regex,replacement);
}

// #143 — preserve Groq key across in-place upgrades even if Keystore migration fails once.
{
  const path='app/src/main/java/com/jhony/sfp/AndroidBridge.java';
  let s=read(path);
  s=replaceOnce(s,
`                boolean persisted = context.getSharedPreferences(PREF_SECURE_VAULT, Context.MODE_PRIVATE)
                        .edit()
                        .putString(KEY_CIPHERTEXT, ciphertextB64)
                        .putString(KEY_IV, ivB64)
                        .putString(KEY_VERSION, "v3-keystore-gcm")
                        .remove(LEGACY_KEY_GROQ_SECRET)
                        .commit();
                if (!persisted) return false;

                String verified = getDecryptedApiKeyInternal(false);
                boolean ok = trimmed.equals(verified);
                verified = null;
                return ok;`,
`                SharedPreferences vaultPrefs = context.getSharedPreferences(PREF_SECURE_VAULT, Context.MODE_PRIVATE);
                boolean persisted = vaultPrefs.edit()
                        .putString(KEY_CIPHERTEXT, ciphertextB64)
                        .putString(KEY_IV, ivB64)
                        .putString(KEY_VERSION, "v3-keystore-gcm")
                        .commit();
                if (!persisted) return false;

                String verified = getDecryptedApiKeyInternal(false);
                boolean ok = trimmed.equals(verified);
                verified = null;
                if (ok) {
                    // Remove the recoverable legacy copy only after the new vault was verified.
                    vaultPrefs.edit().remove(LEGACY_KEY_GROQ_SECRET).commit();
                }
                return ok;`, 'Groq verified persistence');

  s=replaceRegex(s,
/    private void migrateLegacyKeyIfNeeded\(SharedPreferences prefs\) \{[\s\S]*?\n    \}\n\n    private String getDecryptedApiKeyInternal\(\) \{/,
`    private void migrateLegacyKeyIfNeeded(SharedPreferences prefs) {
        String legacyKey = prefs.getString(LEGACY_KEY_GROQ_SECRET, null);
        if (legacyKey == null) return;
        String trimmed = legacyKey.trim();
        if (trimmed.isEmpty()) {
            prefs.edit().remove(LEGACY_KEY_GROQ_SECRET).commit();
            return;
        }

        // If an already-encrypted value is healthy, the legacy copy is no longer needed.
        String existing = getDecryptedApiKeyInternal(false);
        if (existing != null && !existing.trim().isEmpty()) {
            existing = null;
            prefs.edit().remove(LEGACY_KEY_GROQ_SECRET).commit();
            return;
        }
        existing = null;

        // Failure is recoverable: keep the app-private legacy copy and retry on next access/boot.
        // It is never exported to the SFP state/backups and Auto Backup is disabled by policy.
        if (encryptAndSaveApiKey(trimmed)) {
            prefs.edit().remove(LEGACY_KEY_GROQ_SECRET).commit();
        }
    }

    private boolean stageLegacyApiKeyForRetry(String rawKey) {
        if (rawKey == null || rawKey.trim().isEmpty()) return false;
        return context.getSharedPreferences(PREF_SECURE_VAULT, Context.MODE_PRIVATE)
                .edit()
                .putString(LEGACY_KEY_GROQ_SECRET, rawKey.trim())
                .commit();
    }

    private String getDecryptedApiKeyInternal() {`, 'Groq migration method');

  s=replaceOnce(s,
`    @JavascriptInterface
    public boolean setSophyApiKey(String key) {
        return encryptAndSaveApiKey(key);
    }`,
`    @JavascriptInterface
    public boolean setSophyApiKey(String key) {
        if (encryptAndSaveApiKey(key)) return true;
        // During an upgrade a transient/invalidated Keystore can fail once. Preserve a private
        // recovery copy so the next boot can retry instead of silently losing the user's key.
        stageLegacyApiKeyForRetry(key);
        return false;
    }`, 'Groq setter staging');
  write(path,s);
}

// #144 — Samsung My Files often reports OFX/CSV with generic/unknown MIME. Mixed financial
// pickers must not rely on EXTRA_MIME_TYPES or valid extensions are greyed out.
{
  const path='app/src/main/java/com/jhony/sfp/MainActivity.java';
  let s=read(path);
  s=replaceOnce(s,
`                String[] acceptedMimeTypes = resolveAcceptMimeTypes(fileChooserParams);
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                if (acceptedMimeTypes.length == 1) {
                    intent.setType(acceptedMimeTypes[0]);
                } else {
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, acceptedMimeTypes);
                }`,
`                String[] acceptedMimeTypes = resolveAcceptMimeTypes(fileChooserParams);
                boolean broadFinancialPicker = requiresBroadFinancialPicker(fileChooserParams);
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                if (broadFinancialPicker) {
                    // Samsung/Android providers commonly expose OFX/QFX/CSV as application/octet-stream
                    // or with no reliable MIME. MIME filtering would grey out perfectly valid files.
                    intent.setType("*/*");
                } else if (acceptedMimeTypes.length == 1) {
                    intent.setType(acceptedMimeTypes[0]);
                } else {
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, acceptedMimeTypes);
                }`, 'Android mixed file chooser');

  s=replaceOnce(s,
`    static String[] resolveAcceptMimeTypes(@Nullable WebChromeClient.FileChooserParams params) {`,
`    static boolean requiresBroadFinancialPicker(@Nullable WebChromeClient.FileChooserParams params) {
        if (params == null || params.getAcceptTypes() == null) return false;
        for (String rawGroup : params.getAcceptTypes()) {
            if (rawGroup == null) continue;
            for (String raw : rawGroup.split(",")) {
                String type = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
                if (type.equals(".ofx") || type.equals(".qfx") || type.equals(".csv") || type.equals(".sfp") ||
                        type.contains("/ofx") || type.contains("csv") || type.equals("application/octet-stream")) {
                    return true;
                }
            }
        }
        return false;
    }

    static String[] resolveAcceptMimeTypes(@Nullable WebChromeClient.FileChooserParams params) {`, 'Android broad picker helper');
  write(path,s);
}

// #145/#146 — mobile visual hierarchy + stable custom-select focus/placement.
{
  const path='app/src/main/assets/www/financial-insights-ui.js';
  let s=read(path);
  s=replaceOnce(s,
`  function animatePlacementChange(menu,fromTop,toTop,fromPlacement,toPlacement){if(fromPlacement===toPlacement||!Number.isFinite(fromTop)||!Number.isFinite(toTop))return;const delta=fromTop-toTop;if(global.matchMedia?.('(prefers-reduced-motion: reduce)').matches||typeof menu.animate!=='function')return;`,
`  function animatePlacementChange(menu,fromTop,toTop,fromPlacement,toPlacement){if(fromPlacement===toPlacement||!Number.isFinite(fromTop)||!Number.isFinite(toTop))return;if(global.matchMedia?.('(max-width:650px)').matches)return;const delta=fromTop-toTop;if(global.matchMedia?.('(prefers-reduced-motion: reduce)').matches||typeof menu.animate!=='function')return;`, 'Disable mobile FLIP motion');
  s=replaceOnce(s,
`  function focusOption(menu,direction){const options=Array.from(menu.querySelectorAll('.sfp-select-option:not([aria-disabled="true"])'));if(!options.length)return;const current=document.activeElement,index=options.indexOf(current),next=index<0?(direction>0?0:options.length-1):(index+direction+options.length)%options.length;options[next].focus();}`,
`  function focusOption(menu,direction){const options=Array.from(menu.querySelectorAll('.sfp-select-option:not([aria-disabled="true"])'));if(!options.length)return;const current=document.activeElement,index=options.indexOf(current),next=index<0?(direction>0?0:options.length-1):(index+direction+options.length)%options.length;options[next].focus({preventScroll:true});}`, 'Prevent option focus scroll');
  s=s.replace(/button\?\.focus\(\);/g,"button?.focus({preventScroll:true});");
  s=s.replace(/menu\.querySelector\('\[aria-selected=\\\"true\\\"\]'\)\?\.focus\(\);/g,"menu.querySelector('[aria-selected=\"true\"]')?.focus({preventScroll:true});");
  write(path,s);
}

// Remove the second, competing dropdown positioner from Safe Spend. The canonical positionMenu
// in financial-insights-ui already follows scroll/resize and accounts for the bottom nav.
{
  const path='app/src/main/assets/www/safe-spend-ui.js';
  let s=read(path);
  s=replaceRegex(s,
/\n  function clampOpenSelectMenus\(\)\{[\s\S]*?\n  \}\n\n  function installNavigation\(\)\{/,
`\n  function installNavigation(){`, 'Remove duplicate select clamp');
  s=replaceRegex(s,
/    if\(!document\.documentElement\.dataset\.sfpSelectClamp\)\{[\s\S]*?\n    \}\n  \}/,
`  }`, 'Remove duplicate clamp listeners');
  write(path,s);
}

// Strong, scoped mobile containment for the exact physical layouts.
{
  const path='app/src/main/assets/www/ui-hardening.css';
  let s=read(path);
  const marker='/* PHYSICAL_REGRESSION_2026_09_02 */';
  if(!s.includes(marker)) s += `\n\n${marker}\n@media (max-width: 650px) {\n  #dashboard .sfp-view-card {\n    display: grid;\n    grid-template-columns: minmax(0,1fr);\n    grid-template-areas: "label" "value" "summary";\n    align-items: start;\n    gap: 4px;\n    text-align: left;\n  }\n  #dashboard .sfp-view-card > small { grid-area: label; min-width:0; }\n  #dashboard .sfp-view-card > strong {\n    grid-area: value;\n    min-width: 0;\n    margin: 2px 0;\n    font-size: clamp(24px,7vw,32px);\n    line-height: 1.12;\n    white-space: nowrap;\n    overflow-wrap: normal;\n    word-break: normal;\n  }\n  #dashboard .sfp-view-card > span {\n    grid-area: summary;\n    min-width: 0;\n    white-space: normal;\n    overflow-wrap: anywhere;\n  }\n  .sfp-select-menu { transition: none !important; }\n}\n\n#modalRoot .invoice-focus,\n#modalRoot .progressive-panel,\n#modalRoot .sfp-invoice-v2 {\n  min-width: 0;\n  max-width: 100%;\n  overflow-x: clip;\n  overscroll-behavior-x: none;\n  touch-action: pan-y;\n}\n#modalRoot .invoice-focus > *,\n#modalRoot .progressive-panel > *,\n#modalRoot .sfp-invoice-v2 > * {\n  min-width: 0;\n  max-width: 100%;\n}\n`;
  write(path,s);
}

// Update Keystore architecture contracts: recoverability on transient migration failure without
// allowing secrets into exported SFP state/backups.
{
  const path='qa/sophy-v3-architecture-test.mjs';
  let s=read(path);
  s=replaceRegex(s,
/    \/\/ Contract L: Legacy Plaintext Migration Failure[\s\S]*?assert\(!mockVaultLResultCipher, 'Contract L: Em falha de migração, nenhum ciphertext inválido deve ser considerado'\);/,
`    // Contract L: Legacy migration failure is recoverable; private pending copy survives for retry.
    let mockVaultL = { sophy_groq_api_key: 'gsk_legacy_plain_key_failure_999' };
    let mockVaultLResultCipher = null;
    const migrateFnLFailure = () => {
      const legacyKey = mockVaultL.sophy_groq_api_key;
      if (!legacyKey) return;
      try {
        throw new Error('Simulated Keystore Exception on encrypt');
      } catch (ignored) {
        // Keep only the app-private pending migration copy; state/backups remain sanitized.
      }
    };
    migrateFnLFailure();
    assert.equal(mockVaultL.sophy_groq_api_key, 'gsk_legacy_plain_key_failure_999', 'Contract L: falha transitória não pode destruir a única cópia recuperável');
    assert(!mockVaultLResultCipher, 'Contract L: Em falha de migração, nenhum ciphertext inválido deve ser considerado');`, 'Architecture Contract L');
  s=replaceRegex(s,
/    \/\/ Contract N: Nenhum caminho deixa plaintext persistido[\s\S]*?assert\(!\('sophy_groq_api_key' in mockVaultN\), 'Contract N: Plaintext nunca é mantido no vault após acesso'\);/,
`    // Contract N: a pending private copy is removed immediately after a successful retry.
    let mockVaultN = { sophy_groq_api_key: 'gsk_temporary_unmigrated_key' };
    const simulatedRetryMigration = (vault) => {
      const legacy = vault.sophy_groq_api_key;
      if (!legacy) return mockKeystore.decrypt();
      mockKeystore.encrypt(legacy);
      delete vault.sophy_groq_api_key;
      return mockKeystore.decrypt();
    };
    assert.equal(simulatedRetryMigration(mockVaultN), 'gsk_temporary_unmigrated_key', 'Contract N: retry deve recuperar a chave exata');
    assert(!('sophy_groq_api_key' in mockVaultN), 'Contract N: cópia pendente deve ser purgada após migração verificada');`, 'Architecture Contract N');
  s=replaceRegex(s,
/    \/\/ 2\. Zero gravação de plaintext e purga incondicional[\s\S]*?assert\(bridgeJava\.includes\('prefs\.edit\(\)\.remove\(LEGACY_KEY_GROQ_SECRET\)\.apply\(\)'\), 'AndroidBridge deve purgar chave legada incondicionalmente'\);/,
`    // 2. Pending migration is app-private/recoverable and is purged only after verified encryption.
    assert(bridgeJava.includes('stageLegacyApiKeyForRetry'), 'AndroidBridge deve preservar migração pendente quando Keystore falhar');
    assert(bridgeJava.includes('.putString(LEGACY_KEY_GROQ_SECRET, rawKey.trim())'), 'Cópia pendente deve ficar apenas no SharedPreferences privado do vault');
    assert(bridgeJava.includes('if (encryptAndSaveApiKey(trimmed))'), 'Migração deve verificar sucesso antes de purgar a cópia pendente');
    assert(bridgeJava.includes('vaultPrefs.edit().remove(LEGACY_KEY_GROQ_SECRET).commit()'), 'Cópia pendente deve ser purgada após verificação');`, 'Architecture native migration assertions');
  write(path,s);
}

// Existing dropdown QA must no longer require motion on phones; it must require stability.
{
  const path='qa/dropdown-scroll-nav.spec.js';
  let s=read(path);
  s=replaceOnce(s,
`test('portrait dropdown placement change is animated and resists threshold thrash',async({page})=>{`,
`test('portrait dropdown placement change is stable, motionless and resists threshold thrash',async({page})=>{`, 'Dropdown QA title');
  s=replaceOnce(s,
`  const hasMotion=await menu.evaluate(el=>el.getAnimations().some(animation=>Number(animation.effect?.getTiming?.().duration||0)>=160));
  expect(hasMotion).toBe(true);`,
`  const hasMotion=await menu.evaluate(el=>el.getAnimations().some(animation=>Number(animation.effect?.getTiming?.().duration||0)>0));
  expect(hasMotion).toBe(false);`, 'Dropdown mobile motion assertion');
  write(path,s);
}

// New physical-device regression suite.
{
  const path='qa/physical-device-regressions.spec.js';
  const content=`const { test, expect }=require('@playwright/test');
const fs=require('fs');
const { fixture, expectBootComplete }=require('./helpers');

async function boot(page,width=390,height=844){
  await page.setViewportSize({width,height});
  await page.goto('/index.html');
  await expectBootComplete(page,expect,'Fixture QA');
}

test('PHYS-143 Groq: migração falha sem destruir cópia recuperável',()=>{
  const bridge=fs.readFileSync('app/src/main/java/com/jhony/sfp/AndroidBridge.java','utf8');
  expect(bridge).toContain('stageLegacyApiKeyForRetry');
  expect(bridge).toContain('.putString(LEGACY_KEY_GROQ_SECRET, rawKey.trim())');
  expect(bridge).toContain('if (encryptAndSaveApiKey(trimmed))');
  expect(bridge).toContain('vaultPrefs.edit().remove(LEGACY_KEY_GROQ_SECRET).commit()');
});

test('PHYS-144 Android picker: OFX/CSV usam seletor amplo sem filtro MIME destrutivo',()=>{
  const activity=fs.readFileSync('app/src/main/java/com/jhony/sfp/MainActivity.java','utf8');
  expect(activity).toContain('requiresBroadFinancialPicker');
  expect(activity).toContain('type.equals(".ofx")');
  expect(activity).toContain('type.equals(".csv")');
  expect(activity).toMatch(/if \(broadFinancialPicker\) \{[\\s\\S]*?intent\.setType\("\\*\\/\\*"\);[\\s\\S]*?\} else if/);
});

test('PHYS-145 Três visões: rótulo, moeda e resumo não colidem no Galaxy S24',async({page})=>{
  await boot(page);
  await page.evaluate(()=>{
    setPage('dashboard',{mode:'replace'});
    document.querySelector('#dashCashNet').textContent='R$ 90,51';
    document.querySelector('#dashCashSummary').textContent='Entradas R$ 178,26 · Saídas R$ 87,75';
    document.querySelector('#dashAccrualNet').textContent='-R$ 356,72';
    document.querySelector('#dashAccrualSummary').textContent='Receitas R$ 178,26 · Gastos R$ 534,98';
    document.querySelector('#dashCommitView').textContent='R$ 447,29';
    document.querySelector('#dashCommitViewSub').textContent='2 itens ainda exigem pagamento';
  });
  for(const card of await page.locator('#dashboard .sfp-view-card').all()){
    const info=await card.evaluate(el=>{
      const label=el.querySelector('small').getBoundingClientRect();
      const value=el.querySelector('strong').getBoundingClientRect();
      const summary=el.querySelector('span').getBoundingClientRect();
      const cs=getComputedStyle(el.querySelector('strong'));
      return {labelBottom:label.bottom,valueTop:value.top,valueBottom:value.bottom,summaryTop:summary.top,nowrap:cs.whiteSpace,left:value.left,right:value.right,vw:innerWidth};
    });
    expect(info.valueTop).toBeGreaterThanOrEqual(info.labelBottom-1);
    expect(info.summaryTop).toBeGreaterThanOrEqual(info.valueBottom-1);
    expect(info.nowrap).toBe('nowrap');
    expect(info.left).toBeGreaterThanOrEqual(-1);
    expect(info.right).toBeLessThanOrEqual(info.vw+1);
  }
});

test('PHYS-146 abrir select não altera scroll e não anima menu no mobile',async({page})=>{
  await boot(page);
  await page.evaluate(()=>setPage('lancamentos',{mode:'replace'}));
  const button=page.locator('.sfp-select[data-for-select="txCategory"] .sfp-select-button');
  await button.scrollIntoViewIfNeeded();
  await page.evaluate(()=>window.scrollBy(0,-80));
  const before=await page.evaluate(()=>scrollY);
  await button.click();
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const after=await page.evaluate(()=>scrollY);
  expect(Math.abs(after-before)).toBeLessThanOrEqual(1);
  const menu=page.locator('.sfp-select[data-for-select="txCategory"] .sfp-select-menu:not([hidden])');
  await expect(menu).toBeVisible();
  expect(await menu.evaluate(el=>el.getAnimations().length)).toBe(0);
});

test('PHYS-146 fatura contém gesto horizontal e não cria largura rolável',async({page})=>{
  await boot(page);
  const value=fixture('Fatura física');
  value.mesAtual='2026-09';
  value.ui.invoiceMonthByCard={1:'2026-09'};
  value.purchases=[{id:9001,cardId:1,desc:'Compra QA física com descrição comprida',total:252.48,installments:1,firstMonth:'2026-09',purchaseDate:'2026-09-01',category:'Outros',status:'active',refunds:[]}];
  await page.evaluate(v=>{state=v;normalize();lastSavedState=clone(state);renderAll();setPage('cartoes',{mode:'replace'});openInvoiceDetail(1);},value);
  const focus=page.locator('#modalRoot .invoice-focus');
  await expect(focus).toBeVisible();
  const geometry=await focus.evaluate(el=>({scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,overflowX:getComputedStyle(el).overflowX,touchAction:getComputedStyle(el).touchAction,doc:document.documentElement.scrollWidth,vw:innerWidth}));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth+1);
  expect(geometry.doc).toBeLessThanOrEqual(geometry.vw+2);
  expect(geometry.touchAction).toContain('pan-y');
  expect(['clip','hidden']).toContain(geometry.overflowX);
});
`;
  write(path,content);
}

console.log('Physical regressions #143-#146 applied.');
