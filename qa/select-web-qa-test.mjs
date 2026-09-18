import assert from 'node:assert/strict';
import { selectWebQa } from './select-web-qa.mjs';

const specs = [
  'qa/a11y-controls-matrix.spec.js',
  'qa/account-integrity.spec.js',
  'qa/card-integrity.spec.js',
  'qa/contrast-aa-final.spec.js',
  'qa/debt-integrity.spec.js',
  'qa/financial.spec.js',
  'qa/financial-intelligence.spec.js',
  'qa/invoice-future-installments.spec.js',
  'qa/manual-invoice-reconciliation.spec.js',
  'qa/open-finance-bills.spec.js',
  'qa/open-finance-sync.spec.js',
  'qa/safe-spend-projection.spec.js',
  'qa/sophy-v3.spec.js',
  'qa/transaction-form-ux.spec.js',
  'qa/ui-hardening.spec.js',
  'qa/visual-bug-sweep.spec.js',
  'qa/what-if-engine.spec.js'
];

function plan(files) {
  return selectWebQa(files, specs);
}

assert.equal(plan(['docs/RELEASE.md']).mode, 'none');
assert.equal(plan(['README.md', '.gitignore']).mode, 'none');
assert.equal(plan(['app/src/main/java/com/jhony/sfp/MainActivity.java']).mode, 'none');

{
  const p = plan(['qa/card-integrity.spec.js']);
  assert.equal(p.mode, 'impacted');
  assert.deepEqual(p.tests, ['qa/card-integrity.spec.js']);
}

{
  const p = plan(['docs/README.md', 'qa/card-integrity.spec.js']);
  assert.equal(p.mode, 'impacted');
  assert.deepEqual(p.tests, ['qa/card-integrity.spec.js']);
}

assert.equal(plan(['app/src/main/assets/www/index.html']).mode, 'full');
assert.equal(plan(['qa/helpers.js']).mode, 'full');
assert.equal(plan(['package.json']).mode, 'full');
assert.equal(plan(['app/src/main/assets/www/unknown-module.js']).mode, 'full');
assert.equal(plan(['some-new-root-file.txt']).mode, 'full');

{
  const p = plan(['app/src/main/assets/www/open-finance-sync.js']);
  assert.equal(p.mode, 'impacted');
  assert.equal(p.staticCheck, true);
  assert.deepEqual(p.tests, ['qa/open-finance-bills.spec.js', 'qa/open-finance-sync.spec.js']);
}

{
  const p = selectWebQa(['app/src/main/assets/www/open-finance-sync.js'], []);
  assert.equal(p.mode, 'full');
  assert.equal(p.browserRequired, true);
}

{
  const p = plan(['app/src/main/assets/www/invoice-pdf-engine.js']);
  assert.equal(p.mode, 'impacted');
  assert.equal(p.invoicePdf, true);
  assert.deepEqual(p.tests, ['qa/invoice-future-installments.spec.js', 'qa/manual-invoice-reconciliation.spec.js']);
}

{
  const p = plan(['app/src/main/assets/www/sophy-proactive-brief.js']);
  assert.equal(p.mode, 'impacted');
  assert.equal(p.sophyArch, true);
  assert.equal(p.sophyBenchmark, true);
  assert.deepEqual(p.tests, ['qa/sophy-v3.spec.js']);
}

{
  const p = plan(['app/src/main/assets/www/ui-hardening.css']);
  assert.equal(p.mode, 'impacted');
  assert.equal(p.staticCheck, true);
  assert.ok(p.tests.includes('qa/a11y-controls-matrix.spec.js'));
  assert.ok(p.tests.includes('qa/contrast-aa-final.spec.js'));
  assert.ok(p.tests.includes('qa/transaction-form-ux.spec.js'));
  assert.ok(p.tests.includes('qa/ui-hardening.spec.js'));
  assert.ok(p.tests.includes('qa/visual-bug-sweep.spec.js'));
}

{
  const p = plan(['qa/select-web-qa.mjs', 'qa/select-web-qa-test.mjs']);
  assert.equal(p.mode, 'none');
}

console.log('QA impact selector: all scenarios passed.');
