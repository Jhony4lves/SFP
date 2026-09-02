const { test, expect } = require('@playwright/test');
const { expectBootComplete } = require('./helpers');

async function boot(page,width=390,height=844){
  await page.setViewportSize({width,height});
  await page.goto('/index.html');
  await expectBootComplete(page,expect,'Fixture QA');
}

test('custom select: native control leaves Tab order and label redirects to visible control',async({page})=>{
  await boot(page);
  await page.evaluate(()=>{window.setPage('contas',{mode:'replace'});window.openManagementAction('contas');});
  const native=page.locator('#accountType');
  const button=page.locator('.sfp-select[data-for-select="accountType"] .sfp-select-button');
  await expect(native).toHaveAttribute('aria-hidden','true');
  expect(await native.evaluate(el=>el.tabIndex)).toBe(-1);
  await page.evaluate(()=>{
    const select=document.getElementById('accountType');
    const label=select?.labels?.[0]||document.querySelector('label[for="accountType"]');
    label?.click();
  });
  await expect(button).toBeFocused();
  const name=await button.getAttribute('aria-label');
  expect(name).toMatch(/tipo|conta|corrente|poupança|carteira/i);
});

test('sfpConfirm: Cancelar + Enter cancela, Tab fica preso e foco retorna ao chamador',async({page})=>{
  await boot(page);
  await page.locator('#privacyToggle').focus();
  const result=page.evaluate(()=>window.sfpConfirm({title:'Excluir?',message:'Teste de teclado',danger:true}));
  await expect(page.locator('#dialogConfirmBtn')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#dialogCloseBtn')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#dialogConfirmBtn')).toBeFocused();
  await page.locator('#dialogCancelBtn').focus();
  await page.keyboard.press('Enter');
  expect(await result).toBe(false);
  await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);
  await page.waitForTimeout(30);
  await expect(page.locator('#privacyToggle')).toBeFocused();
});

test('sfpPrompt: Cancelar + Enter retorna null, mas Enter no input confirma',async({page})=>{
  await boot(page);
  let result=page.evaluate(()=>window.sfpPrompt({title:'Valor',message:'Informe',defaultValue:'123'}));
  await page.locator('#dialogCancelBtn').focus();
  await page.keyboard.press('Enter');
  expect(await result).toBeNull();

  result=page.evaluate(()=>window.sfpPrompt({title:'Valor',message:'Informe',defaultValue:'123'}));
  const input=page.locator('#dialogPromptInput');
  await expect(input).toBeFocused();
  await input.fill('456');
  await page.keyboard.press('Enter');
  expect(await result).toBe('456');
});

test('confirmação aninhada preserva modal pai quando é cancelada',async({page})=>{
  await boot(page);
  await page.evaluate(()=>{
    const root=document.getElementById('modalRoot');
    root.className='modalback';
    root.innerHTML='<div class="modal" id="parentModal"><h2>Detalhe pai</h2><button id="parentAction">Excluir</button></div>';
    document.getElementById('parentAction').focus();
  });
  const result=page.evaluate(()=>window.sfpConfirm({title:'Confirmar exclusão',message:'Deseja excluir?',danger:true}));
  await expect(page.locator('.sfp-nested-dialog-layer')).toBeVisible();
  await expect(page.locator('#parentModal')).toBeVisible();
  await page.locator('.sfp-nested-dialog-layer #dialogCancelBtn').click();
  expect(await result).toBe(false);
  await expect(page.locator('.sfp-nested-dialog-layer')).toHaveCount(0);
  await expect(page.locator('#parentModal')).toBeVisible();
  await expect(page.locator('#parentModal')).toContainText('Detalhe pai');
  await page.waitForTimeout(30);
  await expect(page.locator('#parentAction')).toBeFocused();
});

test('Android back contract consome modal e navegação SPA antes de permitir saída',async({page})=>{
  await boot(page);
  expect(await page.evaluate(()=>typeof window.handleAndroidBack)).toBe('function');

  await page.evaluate(()=>window.setPage('dashboard'));
  await expect(page.locator('#pageTitle')).toHaveText('Dashboard');
  expect(await page.evaluate(()=>window.handleAndroidBack())).toBe(true);
  await expect(page.locator('#pageTitle')).toHaveText('Hoje');

  await page.evaluate(()=>showTrash());
  await expect(page.locator('#modalRoot')).not.toHaveClass(/hidden/);
  expect(await page.evaluate(()=>window.handleAndroidBack())).toBe(true);
  await expect(page.locator('#modalRoot')).toHaveClass(/hidden/);

  expect(await page.evaluate(()=>window.handleAndroidBack())).toBe(false);
});
