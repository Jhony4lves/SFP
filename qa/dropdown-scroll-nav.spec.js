const { test, expect } = require('@playwright/test');
const { expectBootComplete } = require('./helpers');

async function boot(page){
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
}

test('open portrait dropdown never enters bottom nav while the page scrolls',async({page})=>{
  await boot(page);
  await page.evaluate(()=>{
    const main=document.querySelector('main');
    const wrap=document.createElement('div');
    wrap.id='qaScrollDropdownProbe';
    wrap.style.cssText='margin-top:900px;padding-bottom:500px';
    const select=document.createElement('select');
    select.id='qaScrollDropdownSelect';
    for(const label of ['Todos','Receitas','Despesas','Transferências']){
      const option=document.createElement('option');
      option.value=label;
      option.textContent=label;
      select.appendChild(option);
    }
    wrap.appendChild(select);
    main.appendChild(wrap);
  });

  const button=page.locator('#qaScrollDropdownSelect + .sfp-select .sfp-select-button');
  await expect(button).toBeVisible();
  await button.scrollIntoViewIfNeeded();
  await page.evaluate(()=>window.scrollBy(0,80));
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await button.click();

  const menu=page.locator('#qaScrollDropdownSelect + .sfp-select .sfp-select-menu:not([hidden])');
  await expect(menu).toBeVisible();

  const assertClear=async()=>{
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const geometry=await page.evaluate(()=>{
      const menu=document.querySelector('#qaScrollDropdownSelect + .sfp-select .sfp-select-menu:not([hidden])');
      const nav=document.querySelector('.sidebar .nav');
      const m=menu?.getBoundingClientRect(),n=nav?.getBoundingClientRect();
      return m&&n?{menuBottom:m.bottom,menuTop:m.top,navTop:n.top}:null;
    });
    expect(geometry).not.toBeNull();
    expect(geometry.menuTop).toBeGreaterThanOrEqual(7);
    expect(geometry.menuBottom).toBeLessThanOrEqual(geometry.navTop-3);
  };

  await assertClear();
  await page.evaluate(()=>window.scrollBy(0,110));
  await expect(menu).toBeVisible();
  await assertClear();
  await page.evaluate(()=>window.scrollBy(0,-90));
  await expect(menu).toBeVisible();
  await assertClear();
});


test('portrait dropdown placement change is stable, motionless and resists threshold thrash',async({page})=>{
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

  const hasMotion=await menu.evaluate(el=>el.getAnimations().some(animation=>Number(animation.effect?.getTiming?.().duration||0)>0));
  expect(hasMotion).toBe(false);

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
