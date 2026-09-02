const { test, expect } = require('@playwright/test');
const { expectBootComplete } = require('./helpers');

function parseRgb(value){
  const match=String(value).match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/i);
  return match?[+match[1],+match[2],+match[3]]:null;
}
function luminance(rgb){
  const channel=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};
  return .2126*channel(rgb[0])+.7152*channel(rgb[1])+.0722*channel(rgb[2]);
}
function ratio(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}

async function boot(page){
  await page.setViewportSize({width:390,height:844});
  await page.goto('/index.html');
  await expectBootComplete(page,expect,'Fixture QA');
  await page.evaluate(()=>{
    document.documentElement.dataset.theme='light';
    document.body.dataset.theme='light';
  });
}

async function expectReadable(page,selector,min=4.5){
  const css=await page.locator(selector).evaluate(el=>({fg:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor}));
  const fg=parseRgb(css.fg),bg=parseRgb(css.bg);
  expect(fg,`${selector}: foreground inválido ${css.fg}`).toBeTruthy();
  expect(bg,`${selector}: background inválido ${css.bg}`).toBeTruthy();
  expect(ratio(fg,bg),`${selector}: contraste ${css.fg} / ${css.bg}`).toBeGreaterThanOrEqual(min);
}

test('tema claro: Fatura V2 e dialog usam superfícies legíveis',async({page})=>{
  await boot(page);
  await page.evaluate(()=>{
    const host=document.createElement('section');host.id='themeContractHost';
    host.innerHTML='<article class="sfp-invoice-item">Item da fatura</article><div class="sfp-invoice-piece">Composição da fatura</div><div class="modal sfp-dialog">Conteúdo do diálogo</div>';
    document.body.appendChild(host);
  });
  await expectReadable(page,'#themeContractHost .sfp-invoice-item');
  await expectReadable(page,'#themeContractHost .sfp-invoice-piece');
  await expectReadable(page,'#themeContractHost .modal.sfp-dialog');
});

test('tema claro: toast base e variantes mantêm contraste',async({page})=>{
  await boot(page);
  await page.evaluate(()=>{
    const host=document.createElement('section');host.id='toastContractHost';
    host.innerHTML='<div class="toast show">Informação</div><div class="toast toast-success show">Sucesso</div><div class="toast toast-error show">Erro</div><div class="toast toast-warning show">Atenção</div>';
    document.body.appendChild(host);
  });
  for(const selector of ['#toastContractHost .toast:not(.toast-success):not(.toast-error):not(.toast-warning)','#toastContractHost .toast-success','#toastContractHost .toast-error','#toastContractHost .toast-warning']){
    await expectReadable(page,selector);
  }
});
