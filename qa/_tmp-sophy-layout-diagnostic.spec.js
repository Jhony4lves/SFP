const { test } = require('@playwright/test');
const { expectBootComplete } = require('./helpers');
const { expect } = require('@playwright/test');

test('diagnostic Sophy short landscape geometry', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 360 });
  await page.goto('/index.html');
  await expectBootComplete(page, expect, 'Fixture QA');
  await page.evaluate(() => window.setPage('sophy', { mode: 'replace' }));
  await page.waitForTimeout(100);
  const data = await page.evaluate(() => {
    const selectors = ['body','main','main > .top','.top','#sophy','.sophy-container','.sophy-header-card','#sophyProactiveBrief','.sophy-chat-card','.sophy-messages','#sophyChatForm'];
    const result = { viewport: { w: innerWidth, h: innerHeight }, bodyPage: document.body.dataset.page };
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el) { result[selector] = null; continue; }
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      result[selector] = {
        rect: { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height },
        display:cs.display, position:cs.position, height:cs.height, minHeight:cs.minHeight, maxHeight:cs.maxHeight,
        flex:cs.flex, flexGrow:cs.flexGrow, flexShrink:cs.flexShrink, flexBasis:cs.flexBasis,
        overflow:cs.overflow, overflowY:cs.overflowY,
        paddingTop:cs.paddingTop, paddingBottom:cs.paddingBottom, marginTop:cs.marginTop, marginBottom:cs.marginBottom
      };
    }
    return result;
  });
  console.log('SOPHY_LAYOUT_DIAGNOSTIC=' + JSON.stringify(data));
});
