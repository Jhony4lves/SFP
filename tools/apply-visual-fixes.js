const fs = require('node:fs');

const target = 'app/src/main/assets/www/financial-insights-ui.js';
let source = fs.readFileSync(target, 'utf8');

const marker = '.grid3,.field-group--three,.three{grid-template-columns:repeat(3,minmax(0,1fr))!important}.transaction-form{padding-bottom:var(--space-4)!important}';
const replacement = '.grid3,.field-group--three,.three{grid-template-columns:repeat(3,minmax(0,1fr))!important}.sfp-view-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}.sfp-view-card{min-width:0!important}.sfp-view-card span{min-width:0;overflow-wrap:anywhere}.transaction-form{padding-bottom:var(--space-4)!important}';

if (source.includes(replacement)) {
  console.log('Landscape overview fix already applied.');
} else if (source.includes(marker)) {
  source = source.replace(marker, replacement);
  fs.writeFileSync(target, source);
  console.log('Applied landscape overview containment fix.');
} else {
  throw new Error('Expected visual-polish marker was not found; refusing a blind patch.');
}
