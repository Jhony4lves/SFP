const fs = require('node:fs');

const target = 'app/src/main/assets/www/financial-insights-ui.js';
let source = fs.readFileSync(target, 'utf8');
let changed = false;

const landscapeMarker = '.grid3,.field-group--three,.three{grid-template-columns:repeat(3,minmax(0,1fr))!important}.transaction-form{padding-bottom:var(--space-4)!important}';
const landscapeReplacement = '.grid3,.field-group--three,.three{grid-template-columns:repeat(3,minmax(0,1fr))!important}.sfp-view-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}.sfp-view-card{min-width:0!important}.sfp-view-card span{min-width:0;overflow-wrap:anywhere}.transaction-form{padding-bottom:var(--space-4)!important}';

if (!source.includes(landscapeReplacement)) {
  if (!source.includes(landscapeMarker)) throw new Error('Expected landscape visual-polish marker was not found; refusing a blind patch.');
  source = source.replace(landscapeMarker, landscapeReplacement);
  changed = true;
}

const tabletFix = '@media(min-width:651px){.sfp-view-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}.sfp-view-card,.sfp-view-card>*{min-width:0}.sfp-view-card span{overflow-wrap:anywhere}}';
const tabletAnchor = '@media(max-width:720px){.sfp-select-menu{padding:8px;border-radius:16px}';

if (!source.includes(tabletFix)) {
  if (!source.includes(tabletAnchor)) throw new Error('Expected product-polish media anchor was not found; refusing a blind patch.');
  source = source.replace(tabletAnchor, `${tabletFix}\n    ${tabletAnchor}`);
  changed = true;
}

if (changed) {
  fs.writeFileSync(target, source);
  console.log('Applied overview grid containment for intermediate widths without overriding portrait mobile layout.');
} else {
  console.log('Overview grid fixes already applied.');
}
