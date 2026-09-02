const { test, expect } = require('@playwright/test');
const { fixture, expectBootComplete, writeIndexedDB } = require('./helpers');

async function boot(page,width=390,height=844){
  await page.setViewportSize({width,height});
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof state !== 'undefined' && state && typeof lastSavedState !== 'undefined' && lastSavedState);
  await writeIndexedDB(page,fixture('Fixture QA'));
  await page.reload();
  await expectBootComplete(page,expect,'Fixture QA');
}

async function expectFocusInsideModal(page){
  const modal=page.locator('#modalRoot .modal');
  await expect(modal).toBeVisible();
  await expect(modal).toHaveAttribute('role','dialog');
  await expect(modal).toHaveAttribute('aria-modal','true');
  await expect.poll(()=>page.evaluate(()=>{
    const modal=document.querySelector('#modalRoot .modal');
    return !!modal && modal.contains(document.activeElement);
  })).toBe(true);
}

test('detalhe de conta move foco, prende Tab, Escape fecha e restaura chamador',async({page})=>{
  await boot(page);
  await page.evaluate(()=>window.setPage('contas',{mode:'replace'}));
  const card=page.locator('#accountsGrid .management-card').first();
  await card.focus();
  await page.keyboard.press('Enter');
  await expectFocusInsideModal(page);

  for(let i=0;i<8;i++){
    await page.keyboard.press('Tab');
    expect(await page.evaluate(()=>document.querySelector('#modalRoot .modal')?.contains(document.activeElement))).toBe(true);
  }
  for(let i=0;i<4;i++){
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(()=>document.querySelector('#modalRoot .modal')?.contains(document.activeElement))).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);
  await expect(card).toBeFocused();
});

test('Sophy Memórias e Settings seguem o mesmo contrato de modal',async({page})=>{
  await boot(page,360,800);
  await page.evaluate(()=>window.setPage('sophy',{mode:'replace'}));

  const memories=page.locator('#sophyOpenMemoriesBtn');
  await memories.focus();
  await memories.click();
  await expectFocusInsideModal(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);
  await expect(memories).toBeFocused();

  const settings=page.locator('#sophySettingsBtn');
  await settings.focus();
  await settings.click();
  await expectFocusInsideModal(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);
  await expect(settings).toBeFocused();
});

test('progressive panel e Lixeira não deixam foco atrás do overlay',async({page})=>{
  await boot(page);
  await page.evaluate(()=>window.setPage('contas',{mode:'replace'}));
  const opener=page.locator('#accountsGrid .management-card').first();
  await opener.focus();
  await page.evaluate(()=>window.openManagementAction('contas'));
  await expectFocusInsideModal(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);

  await page.evaluate(()=>window.setPage('config',{mode:'replace'}));
  const trash=page.locator('#trashBtn');
  await trash.focus();
  await trash.click();
  await expectFocusInsideModal(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);
  await expect(trash).toBeFocused();
});
