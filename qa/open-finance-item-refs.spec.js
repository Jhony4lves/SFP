const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { fixture, expectBootComplete, writeIndexedDB } = require('./helpers');

const ITEM_1='11111111-1111-4111-8111-111111111111';
const ITEM_2='22222222-2222-4222-8222-222222222222';

async function boot(page){
  await page.addInitScript(()=>{
    let refs=[];
    Object.defineProperty(window,'PluggyBridge',{configurable:true,value:{
      getCredentialStatus:()=>JSON.stringify({ok:true,configured:true,clientIdMasked:'11111111…1111',itemReferenceCount:refs.length}),
      saveCredentials:()=>JSON.stringify({ok:true,configured:true}),
      saveItemIds(raw){
        refs=String(raw||'').trim().split(/[\s,;]+/).filter(Boolean);
        window.__savedPluggyRefs=[...refs];
        return JSON.stringify({ok:true,itemReferenceCount:refs.length});
      },
      previewData:()=>JSON.stringify({ok:false,code:'ITEM_REFERENCES_REQUIRED',message:'refs'}),
      clearCredentials:()=>true
    }});
  });
  await page.goto('/');
  await page.evaluate(()=>localStorage.clear());
  const value=fixture('Item refs QA');
  await writeIndexedDB(page,value);
  await page.reload();
  await expectBootComplete(page,expect,value.settings.name);
  await expect(page.locator('#openFinanceItemRefsBox')).toBeVisible();
}

test('OPEN-FINANCE-REF-01 Item IDs são enviados à bridge e removidos do DOM após salvar',async({page})=>{
  await boot(page);
  await page.locator('#openFinanceItemRefs').fill(`${ITEM_1}\n${ITEM_2}`);
  await page.locator('#openFinanceItemRefsSaveBtn').click();
  await expect(page.locator('#openFinanceItemRefs')).toHaveValue('');
  await expect(page.locator('#openFinanceItemRefsHint')).toContainText('2 Item ID(s) salvo(s)');
  expect(await page.evaluate(()=>window.__savedPluggyRefs)).toEqual([ITEM_1,ITEM_2]);
});

test('OPEN-FINANCE-REF-02 bridge não trata 403 da listagem opt-in como credencial inválida',async()=>{
  const bridge=fs.readFileSync('app/src/main/java/com/jhony/sfp/PluggyBridge.java','utf8');
  expect(bridge).toContain('"/v2/items".equals(path)');
  expect(bridge).toContain('if (response.status == 403 || response.status == 404) return null;');
  expect(bridge).toContain('"/items/" + itemId');
  expect(bridge).toContain('saveItemIds(String raw)');
  expect(bridge).toContain('ITEM_REFERENCES_REQUIRED');
  expect(bridge).not.toContain('request("GET", "/items", null, null, key)');
});
