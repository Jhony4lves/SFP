const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const { fixture, monitor, expectBootComplete, writeIndexedDB } = require('./helpers');

const PORTRAIT={width:390,height:844};
const LANDSCAPE={width:844,height:390};
async function boot(page){await page.setViewportSize({width:1280,height:720});await page.goto('/index.html');await expect(page.locator('#pageTitle')).toHaveText('Hoje');}
async function go(page,id){await page.evaluate(p=>setPage(p),id);await expect(page.locator(`#${id}`)).toHaveClass(/active/);}
async function back(page){return page.evaluate(()=>window.handleAndroidBack());}

test.describe('Preservação de Estado e Navegação em Mudança de Orientação',()=>{
  test.beforeEach(async({page})=>{await page.setViewportSize({width:1280,height:720});});

  test('1. Rotação Portrait/Landscape preserva página ativa e dados do formulário',async({page})=>{
    const errors=monitor(page);await page.setViewportSize(PORTRAIT);await boot(page);await go(page,'lancamentos');
    await page.locator('#txDesc').fill('Compra de Teste Rotação');await page.locator('#txAmount').fill('150.00');
    await page.setViewportSize(LANDSCAPE);await expect(page.locator('#lancamentos')).toHaveClass(/active/);await expect(page.locator('#pageTitle')).toHaveText('Lançamentos');await expect(page.locator('#txDesc')).toHaveValue('Compra de Teste Rotação');await expect(page.locator('#txAmount')).toHaveValue('150.00');
    await page.setViewportSize(PORTRAIT);await expect(page.locator('#lancamentos')).toHaveClass(/active/);await expect(page.locator('#txDesc')).toHaveValue('Compra de Teste Rotação');await expect(page.locator('#txAmount')).toHaveValue('150.00');expect(errors).toEqual([]);
  });

  test('2. Rotação preserva histórico de navegação linear e botão Voltar',async({page})=>{
    const errors=monitor(page);await page.setViewportSize(PORTRAIT);await boot(page);await go(page,'contas');await go(page,'cartoes');expect(await page.evaluate(()=>sfpNavigation.getStack())).toEqual(['hoje','contas','cartoes']);
    await page.setViewportSize(LANDSCAPE);await expect(page.locator('#cartoes')).toHaveClass(/active/);expect(await page.evaluate(()=>sfpNavigation.getStack())).toEqual(['hoje','contas','cartoes']);
    expect(await back(page)).toBe(true);await expect(page.locator('#contas')).toHaveClass(/active/);expect(await page.evaluate(()=>sfpNavigation.getStack())).toEqual(['hoje','contas']);
    await page.setViewportSize(PORTRAIT);expect(await back(page)).toBe(true);await expect(page.locator('#hoje')).toHaveClass(/active/);expect(await back(page)).toBe(false);expect(errors).toEqual([]);
  });

  test('3. Rotações repetidas não causam perda de página nem erros',async({page})=>{
    const errors=monitor(page);await page.setViewportSize(PORTRAIT);await boot(page);await go(page,'calendario');
    for(let i=0;i<5;i++){await page.setViewportSize(i%2===0?LANDSCAPE:PORTRAIT);await expect(page.locator('#calendario')).toHaveClass(/active/);expect(await page.evaluate(()=>sfpNavigation.getStack())).toEqual(['hoje','calendario']);}expect(errors).toEqual([]);
  });

  test('4. Rotação com modal aberto mantém modal e página correta ao fechar',async({page})=>{
    const errors=monitor(page);await page.setViewportSize(PORTRAIT);await boot(page);await go(page,'contas');await page.evaluate(()=>openManagementAction('contas'));await expect(page.locator('#modalRoot')).not.toHaveClass(/hidden/);
    await page.setViewportSize(LANDSCAPE);await expect(page.locator('#modalRoot')).not.toHaveClass(/hidden/);expect(await back(page)).toBe(true);await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);await expect(page.locator('#contas')).toHaveClass(/active/);
    await page.setViewportSize(PORTRAIT);expect(await back(page)).toBe(true);await expect(page.locator('#hoje')).toHaveClass(/active/);expect(errors).toEqual([]);
  });

  test('5. Dados financeiros em memória e IndexedDB permanecem intactos após rotações',async({page})=>{
    const fix=fixture('Rotação QA');fix.accounts.push({id:2,name:'Investimentos',type:'Investimento',initial:5000,balanceMode:'snapshot',balanceDate:'2026-01-01'});fix.transactions.push({id:10,kind:'expense',desc:'Mercado',amount:250,date:'2026-01-15',category:'Alimentação',accountId:1,status:'paid',balanceImpact:true,createdAt:Date.now()});
    await boot(page);await writeIndexedDB(page,fix);await page.evaluate(state=>{localStorage.clear();localStorage.setItem('sfp_auto_backups',JSON.stringify([{at:new Date().toISOString(),state}]));},fix);await page.reload();await expectBootComplete(page,expect,'Rotação QA');const errors=monitor(page);await page.setViewportSize(PORTRAIT);await go(page,'contas');
    for(const vp of [LANDSCAPE,PORTRAIT,LANDSCAPE,PORTRAIT])await page.setViewportSize(vp);
    const currState=await page.evaluate(()=>state);expect(currState.accounts.length).toBe(2);expect(currState.transactions.length).toBe(1);expect(currState.transactions[0].desc).toBe('Mercado');expect(currState.settings.name).toBe('Rotação QA');const idbState=await page.evaluate(async()=>(await dbGet()).value);expect(idbState.accounts.length).toBe(2);expect(idbState.transactions.length).toBe(1);expect(errors).toEqual([]);
  });

  test('6. Contrato Android preserva orientação sem restaurar DOM/cache de APK antigo',async()=>{
    const manifest=fs.readFileSync('app/src/main/AndroidManifest.xml','utf8');expect(manifest).toContain('android:configChanges="orientation|screenSize|screenLayout|smallestScreenSize|keyboardHidden|density"');
    const java=fs.readFileSync('app/src/main/java/com/jhony/sfp/MainActivity.java','utf8');expect(java).toContain('settings.setCacheMode(WebSettings.LOAD_NO_CACHE)');expect(java).toContain('webView.loadUrl("https://appassets.androidplatform.net/assets/www/index.html")');expect(java).not.toContain('webView.saveState(outState)');expect(java).not.toContain('webView.restoreState(savedInstanceState)');
  });
});
