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

const baseMarker = ':root{--sfp-mobile-control-height:46px}\n    @media(max-width:650px) and (orientation:portrait){';
const baseReplacement = ':root{--sfp-mobile-control-height:46px}\n    .sfp-view-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}\n    .sfp-view-card,.sfp-view-card>*{min-width:0}\n    .sfp-view-card span{overflow-wrap:anywhere}\n    @media(max-width:650px) and (orientation:portrait){';

if (!source.includes(baseReplacement)) {
  if (!source.includes(baseMarker)) throw new Error('Expected base visual-polish marker was not found; refusing a blind patch.');
  source = source.replace(baseMarker, baseReplacement);
  changed = true;
}

if (changed) {
  fs.writeFileSync(target, source);
  console.log('Applied overview grid containment across intermediate and landscape widths.');
} else {
  console.log('Overview grid fixes already applied.');
}
