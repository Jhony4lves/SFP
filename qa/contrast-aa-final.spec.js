const { test, expect }=require('@playwright/test');
const { fixture, expectBootComplete, writeIndexedDB }=require('./helpers');

function rgb(value){const m=String(value).match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/i);return m?[+m[1],+m[2],+m[3]]:null}
function lum(c){const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2])}
function contrast(a,b){const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
async function boot(page,theme){
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof state !== 'undefined' && state && typeof lastSavedState !== 'undefined' && lastSavedState);
  await writeIndexedDB(page,fixture('Fixture QA'));
  await page.reload();
  await expectBootComplete(page,expect,'Fixture QA');
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.body.dataset.theme=theme},theme);
}
async function expectAgainstParent(page,selector,min=4.5){
  const style=await page.locator(selector).evaluate(el=>({fg:getComputedStyle(el).color,bg:getComputedStyle(el.parentElement).backgroundColor}));
  const fg=rgb(style.fg),bg=rgb(style.bg);
  expect(fg,`${selector} fg ${style.fg}`).toBeTruthy();expect(bg,`${selector} bg ${style.bg}`).toBeTruthy();
  expect(contrast(fg,bg),`${selector}: ${style.fg} contra ${style.bg}`).toBeGreaterThanOrEqual(min);
}

for(const theme of ['dark','light']) test(`${theme}: textos secundários críticos mantêm AA na superfície real`,async({page})=>{
  await boot(page,theme);
  await page.evaluate(()=>{
    const host=document.createElement('section');host.id='aaSecondaryHost';host.style.background='var(--color-surface-elevated)';
    host.innerHTML='<span class="safe-spend-eyebrow">Margem segura</span><span class="safe-spend-event-date">02/09</span><span class="financial-insight-severity">Atenção</span><span class="sophy-msg-time">13:25</span><span class="field-help">Ajuda funcional</span><span class="cal-count">3 eventos</span>';
    document.body.appendChild(host);
  });
  for(const selector of ['.safe-spend-eyebrow','.safe-spend-event-date','.financial-insight-severity','.sophy-msg-time','.field-help','.cal-count']) await expectAgainstParent(page,`#aaSecondaryHost ${selector}`);
});

test('light: semântica financeira citada pela auditoria usa tons AA',async({page})=>{
  await boot(page,'light');
  await page.evaluate(()=>{
    const host=document.createElement('section');host.id='aaSemanticHost';host.style.background='var(--color-surface-1)';
    host.innerHTML=`<div class="safe-spend-event" data-type="expense"><span class="safe-spend-event-desc">− R$ 12,00</span></div>
      <span class="origin-chip origin-real">Real</span><span class="cal-flow inc">+ R$ 100,00</span><span class="cal-flow exp">− R$ 20,00</span>
      <div id="auditoria"><span class="positive">Íntegro</span><span class="warning">Atenção</span><span class="negative">Crítico</span></div>
      <div id="dashboard"><span class="warning">Alerta</span></div>`;
    for(const child of host.children) if(child.tagName!=='DIV'||child.classList.contains('safe-spend-event')) child.style.background='var(--color-surface-1)';
    host.querySelector('.safe-spend-event').style.background='var(--color-surface-1)';
    host.querySelector('#auditoria').style.background='var(--color-surface-1)';host.querySelector('#dashboard').style.background='var(--color-surface-1)';
    document.body.appendChild(host);
  });
  for(const selector of ['.safe-spend-event-desc','.origin-real','.cal-flow.inc','.cal-flow.exp','#auditoria .positive','#auditoria .warning','#auditoria .negative','#dashboard .warning']) await expectAgainstParent(page,`#aaSemanticHost ${selector}`);
});
