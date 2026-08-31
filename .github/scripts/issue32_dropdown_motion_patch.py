from pathlib import Path

ui = Path('app/src/main/assets/www/financial-insights-ui.js')
original = ui.read_text()
text = original
lines = text.splitlines()
index = next((i for i,line in enumerate(lines) if 'function positionMenu(host){' in line), None)
if index is None:
    raise SystemExit('positionMenu not found')

replacement = r"""  function resetPlacementState(menu){if(!menu)return;menu.__sfpPlacementAnimation?.cancel?.();menu.__sfpPlacementAnimation=null;delete menu.dataset.sfpPlacement;delete menu.dataset.sfpTargetTop;delete menu.dataset.sfpButtonTop;}
  function animatePlacementChange(menu,fromTop,toTop,fromPlacement,toPlacement){if(fromPlacement===toPlacement||!Number.isFinite(fromTop)||!Number.isFinite(toTop))return;const delta=fromTop-toTop;if(Math.abs(delta)<4||global.matchMedia?.('(prefers-reduced-motion: reduce)').matches||typeof menu.animate!=='function')return;menu.__sfpPlacementAnimation?.cancel?.();const animation=menu.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:Math.min(260,Math.max(170,Math.abs(delta)*.75)),easing:'cubic-bezier(.22,1,.36,1)'});menu.__sfpPlacementAnimation=animation;const clear=()=>{if(menu.__sfpPlacementAnimation===animation)menu.__sfpPlacementAnimation=null;};animation.addEventListener?.('finish',clear,{once:true});animation.addEventListener?.('cancel',clear,{once:true});}
  function positionMenu(host){const button=host?.querySelector('.sfp-select-button'),menu=host?.querySelector('.sfp-select-menu');if(!button||!menu||menu.hidden)return;const rect=button.getBoundingClientRect(),margin=8,gap=6,vw=document.documentElement.clientWidth,vh=global.innerHeight||document.documentElement.clientHeight,nav=document.querySelector('.sidebar .nav'),navRect=nav?.getBoundingClientRect(),usableBottom=navRect&&navRect.top>0&&navRect.top<vh?navRect.top:vh;if(rect.bottom<0||rect.top>usableBottom||rect.right<0||rect.left>vw){menu.hidden=true;button.setAttribute('aria-expanded','false');resetPlacementState(menu);return;}const left=Math.max(margin,Math.min(rect.left,vw-margin-Math.max(rect.width,180))),width=Math.min(Math.max(rect.width,180),vw-margin*2);menu.style.left=`${left}px`;menu.style.width=`${width}px`;menu.style.right='auto';menu.style.bottom='auto';const computed=global.getComputedStyle(menu),chrome=(parseFloat(computed.paddingTop)||0)+(parseFloat(computed.paddingBottom)||0)+(parseFloat(computed.borderTopWidth)||0)+(parseFloat(computed.borderBottomWidth)||0),desired=Math.min(menu.scrollHeight||330,330,Math.max(120,vh*.58)),below=Math.max(0,usableBottom-rect.bottom-gap-margin),above=Math.max(0,rect.top-gap-margin),previousPlacement=menu.dataset.sfpPlacement,previousTargetTop=Number.parseFloat(menu.dataset.sfpTargetTop),previousButtonTop=Number.parseFloat(menu.dataset.sfpButtonTop),predictedPreviousTop=Number.isFinite(previousTargetTop)&&Number.isFinite(previousButtonTop)?previousTargetTop+(rect.top-previousButtonTop):Number.NaN,hysteresis=52,minUseful=Math.min(desired,112);let placement=previousPlacement;if(placement!=='above'&&placement!=='below'){placement=below>=desired?'below':above>=desired?'above':below>=above?'below':'above';}else if(placement==='below'){const shortage=desired-below;if((shortage>32&&above>below+32)||(below<minUseful&&above>below))placement='above';}else if((below>=desired+hysteresis)||(above<minUseful&&below>above+32)){placement='below';}const available=Math.max(1,placement==='below'?below:above),contentMax=Math.max(1,Math.min(Math.max(1,desired-chrome),Math.max(1,available-chrome)));menu.style.maxHeight=`${contentMax}px`;const measured=menu.getBoundingClientRect().height;let top=placement==='below'?rect.bottom+gap:rect.top-gap-measured;top=Math.max(margin,Math.min(top,usableBottom-margin-measured));menu.style.top=`${top}px`;menu.dataset.sfpPlacement=placement;menu.dataset.sfpTargetTop=String(top);menu.dataset.sfpButtonTop=String(rect.top);animatePlacementChange(menu,predictedPreviousTop,top,previousPlacement,placement); }"""

lines[index:index+1] = replacement.splitlines()
text = '\n'.join(lines) + ('\n' if original.endswith('\n') else '')
old = "button.onclick=()=>{if(select.disabled)return;const opening=menu.hidden;closeOtherMenus(menu);"
new = "button.onclick=()=>{if(select.disabled)return;const opening=menu.hidden;if(opening)resetPlacementState(menu);closeOtherMenus(menu);"
if old not in text:
    raise SystemExit('enhanceSelect opening contract not found')
text = text.replace(old, new, 1)
ui.write_text(text)

qa = Path('qa/dropdown-scroll-nav.spec.js')
qa_text = qa.read_text()
marker = "placement change is animated and resists threshold thrash"
if marker not in qa_text:
    qa_text += r"""

test('portrait dropdown placement change is animated and resists threshold thrash',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  await boot(page);
  await page.evaluate(()=>{
    const main=document.querySelector('main');
    const wrap=document.createElement('div');
    wrap.id='qaMotionDropdownProbe';
    wrap.style.cssText='margin-top:1100px;padding-bottom:1200px';
    const select=document.createElement('select');
    select.id='qaMotionDropdownSelect';
    for(const label of ['Todos','Receitas','Despesas','Transferências','Essencial','Alimentação','Transporte','Faculdade']){
      const option=document.createElement('option');
      option.value=label;
      option.textContent=label;
      select.appendChild(option);
    }
    wrap.appendChild(select);
    main.appendChild(wrap);
  });

  const button=page.locator('#qaMotionDropdownSelect + .sfp-select .sfp-select-button');
  await expect(button).toBeVisible();
  await button.scrollIntoViewIfNeeded();
  await page.evaluate(()=>{
    const button=document.querySelector('#qaMotionDropdownSelect + .sfp-select .sfp-select-button');
    if(button) window.scrollBy(0,button.getBoundingClientRect().top-500);
  });
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await button.click();

  const menu=page.locator('#qaMotionDropdownSelect + .sfp-select .sfp-select-menu:not([hidden])');
  await expect(menu).toBeVisible();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const initial=await menu.getAttribute('data-sfp-placement');
  expect(['above','below']).toContain(initial);

  const direction=initial==='above'?1:-1;
  let changed=initial;
  for(let i=0;i<24&&changed===initial;i++){
    await page.evaluate(step=>window.scrollBy(0,step),direction*24);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    changed=await menu.getAttribute('data-sfp-placement');
  }
  expect(changed).not.toBe(initial);

  const hasMotion=await menu.evaluate(el=>el.getAnimations().some(animation=>Number(animation.effect?.getTiming?.().duration||0)>=160));
  expect(hasMotion).toBe(true);

  await page.evaluate(step=>window.scrollBy(0,step),-direction*16);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expect(await menu.getAttribute('data-sfp-placement')).toBe(changed);

  const geometry=await page.evaluate(()=>{
    const menu=document.querySelector('#qaMotionDropdownSelect + .sfp-select .sfp-select-menu:not([hidden])');
    const nav=document.querySelector('.sidebar .nav');
    const m=menu?.getBoundingClientRect(),n=nav?.getBoundingClientRect();
    return m&&n?{menuTop:m.top,menuBottom:m.bottom,navTop:n.top}:null;
  });
  expect(geometry).not.toBeNull();
  expect(geometry.menuTop).toBeGreaterThanOrEqual(7);
  expect(geometry.menuBottom).toBeLessThanOrEqual(geometry.navTop-3);
});
"""
    qa.write_text(qa_text)

gradle = Path('gradle.properties')
gp = gradle.read_text()
if 'SFP_VERSION_CODE=7' not in gp or 'SFP_VERSION_NAME=2.1.0-rc.3' not in gp:
    raise SystemExit('RC3 version markers not found')
gp = gp.replace('SFP_VERSION_CODE=7','SFP_VERSION_CODE=8')
gp = gp.replace('SFP_VERSION_NAME=2.1.0-rc.3','SFP_VERSION_NAME=2.1.0-rc.4')
gp = gp.replace('gate físico RC3','gate físico RC4')
gradle.write_text(gp)
