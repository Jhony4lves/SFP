const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('global select enhancer does not observe class churn on document.body', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www', 'financial-insights-ui.js'), 'utf8');
  expect(source).not.toContain("attributeFilter:['class','disabled']");
  expect(source).toContain("attributeFilter:['disabled']");
  expect(source).toContain("childList:true,subtree:true");
});
