const fs=require('fs');

function read(path){return fs.readFileSync(path,'utf8')}
function write(path,text){fs.writeFileSync(path,text)}
function replaceOne(text,from,to,label){
  const count=text.split(from).length-1;
  if(count!==1) throw new Error(`${label}: expected exactly 1 match, got ${count}`);
  return text.replace(from,to);
}

// 1) Custom select positioning: desktop sidebar is not a mobile bottom navigation.
{
  const path='app/src/main/assets/www/financial-insights-ui.js';
  let text=read(path);
  text=replaceOne(text,
    "nav=document.querySelector('.sidebar .nav'),navRect=nav?.getBoundingClientRect(),usableBottom=navRect&&navRect.top>0&&navRect.top<vh?navRect.top:vh;",
    "nav=document.querySelector('.sidebar .nav'),navRect=nav?.getBoundingClientRect(),usesBottomNav=global.matchMedia?.('(max-width:650px)').matches===true,usableBottom=usesBottomNav&&navRect&&navRect.top>0&&navRect.top<vh?navRect.top:vh;",
    'desktop custom-select usableBottom');
  text=replaceOne(text,
    "function animatePlacementChange(menu,fromTop,toTop,fromPlacement,toPlacement){if(fromPlacement===toPlacement||!Number.isFinite(fromTop)||!Number.isFinite(toTop))return;const delta=fromTop-toTop;if(Math.abs(delta)<4||global.matchMedia?.('(prefers-reduced-motion: reduce)').matches||typeof menu.animate!=='function')return;menu.__sfpPlacementAnimation?.cancel?.();const animation=menu.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:Math.min(260,Math.max(170,Math.abs(delta)*.75)),easing:'cubic-bezier(.22,1,.36,1)'});",
    "function animatePlacementChange(menu,fromTop,toTop,fromPlacement,toPlacement){if(fromPlacement===toPlacement||!Number.isFinite(fromTop)||!Number.isFinite(toTop))return;const delta=fromTop-toTop;if(global.matchMedia?.('(prefers-reduced-motion: reduce)').matches||typeof menu.animate!=='function')return;const motionDelta=Math.abs(delta)<4?(fromPlacement==='above'?-8:8):delta;menu.__sfpPlacementAnimation?.cancel?.();const animation=menu.animate([{transform:`translateY(${motionDelta}px)`},{transform:'translateY(0)'}],{duration:Math.min(260,Math.max(170,Math.abs(motionDelta)*.75)),easing:'cubic-bezier(.22,1,.36,1)'});",
    'dropdown placement animation');
  write(path,text);
}

// 2) CSS: real AA contrast wins over later component styles; Sophy brief yields to composer in short landscape.
{
  const path='app/src/main/assets/www/ui-hardening.css';
  let text=read(path);
  text=replaceOne(text,
`.safe-spend-eyebrow,
.safe-spend-equation small,
.safe-spend-event-date,
.financial-insight-severity,
.sophy-msg-time,
.field-help,
.cal-count {
  color: var(--color-text-secondary);
}`,
`body .safe-spend-eyebrow,
body .safe-spend-equation small,
body .safe-spend-event-date,
body .financial-insight-severity,
body .sophy-msg-time,
body .field-help,
body .cal-count {
  color: var(--color-text-secondary);
}`,
    'AA secondary selector specificity');
  text=replaceOne(text,
`  body .sophy-proactive-brief {
    display: grid;
    padding: 4px 7px;
    gap: 3px;
    max-height: 64px;
    overflow: auto;
  }`,
`  body[data-page="sophy"] .sophy-proactive-brief {
    display: none;
  }`,
    'Sophy short-landscape brief');
  write(path,text);
}

// 3) Editing a recurring rule must actually expose its form in the progressive UX.
{
  const path='app/src/main/assets/www/index.html';
  let text=read(path);
  text=replaceOne(text,
    ";$('recEnd').value=r.end||'';setPage('recorrencias')}",
    ";$('recEnd').value=r.end||'';setPage('recorrencias');showProgressivePanel($('recForm').closest('.management-form-panel'),'Editar recorrência')}",
    'edit recurring opens progressive panel');
  write(path,text);
}

// 4) Android contract: validate the actual Java regex source instead of a malformed JS regex.
{
  const path='qa/android-bug-zero-contract.spec.js';
  let text=read(path);
  text=replaceOne(text,
    "  expect(bridge).toMatch(/\\\\d\\{1,3\\}.*\\\\\\.\\\\d\\{3\\}.*\\\\,\\\\d\\{2\\}/s);",
    "  const redaction = bridge.match(/static String redactFinancialValues[\\s\\S]*?\\n    }/i)?.[0] || '';\n  expect(redaction).toContain('\\\\\\\\d{1,3}(?:\\\\\\\\.\\\\\\\\d{3})+');\n  expect(redaction).toContain('(?:,\\\\\\\\d{2})?');",
    'Android BRL redaction assertion');
  write(path,text);
}

// 5) Goal contribution tests follow the new explicit source-account confirmation contract.
{
  const path='qa/goal-transfer-regression.spec.js';
  let text=read(path);
  text=replaceOne(text,
`  await page.locator('#dialogPromptInput').fill('250');
  await page.locator('#dialogConfirmBtn').click();
  await contribution;

  expect(await page.evaluate(() => ({`,
`  await page.locator('#dialogPromptInput').fill('250');
  await page.locator('#dialogConfirmBtn').click();
  await expect(page.getByRole('heading', { name: 'Confirmar conta de origem' })).toBeVisible();
  await page.locator('#dialogConfirmBtn').click();
  await contribution;

  expect(await page.evaluate(() => ({`,
    'goal source confirmation positive flow');
  text=replaceOne(text,
`  await page.locator('#dialogPromptInput').fill('250');
  await page.locator('#dialogConfirmBtn').click();
  await expect(page.getByRole('heading', { name: 'Saldo Negativo' })).toBeVisible();`,
`  await page.locator('#dialogPromptInput').fill('250');
  await page.locator('#dialogConfirmBtn').click();
  await expect(page.getByRole('heading', { name: 'Confirmar conta de origem' })).toBeVisible();
  await page.locator('#dialogConfirmBtn').click();
  await expect(page.getByRole('heading', { name: 'Saldo Negativo' })).toBeVisible();`,
    'goal source confirmation negative flow');
  write(path,text);
}

// 6) Debt amortization test confirms the selected cash account before awaiting completion.
{
  const path='qa/debt-integrity.spec.js';
  let text=read(path);
  text=replaceOne(text,
`  await page.locator('#dialogPromptInput').fill(String(amount));
  await page.locator('#dialogConfirmBtn').click();
  await page.evaluate(async () => {`,
`  await page.locator('#dialogPromptInput').fill(String(amount));
  await page.locator('#dialogConfirmBtn').click();
  await expect(page.getByRole('heading', { name: 'Conta para amortização' })).toBeVisible();
  await page.locator('#dialogConfirmBtn').click();
  await page.evaluate(async () => {`,
    'debt cash account confirmation');
  write(path,text);
}

// 7) Lixeira lives in a details section; expose the real opener before exercising focus restoration.
{
  const path='qa/modal-a11y-final.spec.js';
  let text=read(path);
  text=replaceOne(text,
`  const trash=page.locator('#trashBtn');
  await trash.focus();
  await trash.click();`,
`  const trash=page.locator('#trashBtn');
  await trash.evaluate(el=>{const details=el.closest('details');if(details)details.open=true;});
  await expect(trash).toBeVisible();
  await trash.focus();
  await trash.click();`,
    'trash details opener');
  write(path,text);
}

// 8) Recurrence audit uses the current offline Sophy core API.
{
  const path='qa/recurrence-integrity-audit.spec.js';
  let text=read(path);
  text=replaceOne(text,
`  const response=await page.evaluate(() => {
    const fn=typeof sophyDeterministicAnswer==='function'?sophyDeterministicAnswer:(typeof localSophyAnswer==='function'?localSophyAnswer:null);
    return fn?fn('despesas fixas e variáveis'):null;
  });`,
`  const response=await page.evaluate(() => {
    const fn=typeof sophyOfflineCore!=='undefined'&&typeof sophyOfflineCore.process==='function'?prompt=>sophyOfflineCore.process(prompt):null;
    return fn?fn('despesas fixas e variáveis'):null;
  });`,
    'current Sophy offline API');
  write(path,text);
}

// 9) Dashboard pseudo-button fixture must be visible before receiving keyboard input.
{
  const path='qa/ui-interaction-hardening.spec.js';
  let text=read(path);
  text=replaceOne(text,
`test('pseudo-botões do Dashboard respondem a Enter e Espaço',async({page})=>{
  await boot(page);
  await page.evaluate(()=>{`,
`test('pseudo-botões do Dashboard respondem a Enter e Espaço',async({page})=>{
  await boot(page);
  await page.evaluate(()=>window.setPage('dashboard',{mode:'replace'}));
  await page.evaluate(()=>{`,
    'dashboard pseudo-button visibility');
  write(path,text);
}

// 10) Large-value fixture follows canonical recurrence boundaries used by Safe Spend.
{
  const path='qa/ui-large-values.spec.js';
  let text=read(path);
  text=replaceOne(text,
    "value.recurring=[{id:7301,desc:'Compromisso recorrente com origem extremamente longa para teste de layout',amount:12345.67,kind:'expense',type:'expense',category:'Casa',day:20,accountId:1,active:true,skippedMonths:[]}];",
    "value.recurring=[{id:7301,desc:'Compromisso recorrente com origem extremamente longa para teste de layout',amount:12345.67,kind:'expense',type:'expense',category:'Casa',day:20,accountId:1,start:'2026-01',end:'',active:true,skips:[]}];",
    'canonical large recurring fixture');
  write(path,text);
}

console.log('Final QA fixes applied successfully.');
