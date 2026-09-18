import fs from 'node:fs';

function qaSpecsFromDisk() {
  return fs.readdirSync('qa')
    .filter(name => name.endsWith('.spec.js'))
    .map(name => `qa/${name}`)
    .sort();
}

function matchesAny(path, patterns) {
  return patterns.some(pattern => pattern.test(path));
}

function addMatching(set, specs, patterns) {
  for (const spec of specs) {
    if (matchesAny(spec, patterns)) set.add(spec);
  }
}

export function selectWebQa(changedFiles, availableSpecs = qaSpecsFromDisk()) {
  const files = [...new Set(changedFiles.filter(Boolean))].sort();
  const tests = new Set();
  let full = false;
  let staticCheck = false;
  let invoicePdf = false;
  let invoiceImage = false;
  let sophyArch = false;
  let sophyBenchmark = false;

  const forceFull = () => {
    full = true;
    staticCheck = true;
    invoicePdf = true;
    invoiceImage = true;
    sophyArch = true;
    sophyBenchmark = true;
  };

  for (const file of files) {
    if (full) break;

    // Documentação, metadados locais e código Android não alteram comportamento web.
    if (
      file === 'README.md' ||
      file === '.gitignore' ||
      file === 'gradle.properties' ||
      file.startsWith('docs/') ||
      file.endsWith('.md') ||
      file.startsWith('app/src/main/java/') ||
      file === 'app/src/main/AndroidManifest.xml' ||
      /(^|\/)build\.gradle(\.kts)?$/.test(file) ||
      file === 'settings.gradle' ||
      file === 'settings.gradle.kts' ||
      file === '.github/workflows/build-apk.yml'
    ) {
      continue;
    }

    // Alterar um teste isolado deve executar exatamente esse teste.
    if (/^qa\/[^/]+\.spec\.js$/.test(file)) {
      if (availableSpecs.includes(file)) tests.add(file);
      continue;
    }

    // O seletor é validado por teste unitário em toda execução do workflow.
    if (file === 'qa/select-web-qa.mjs' || file === 'qa/select-web-qa-test.mjs') {
      continue;
    }

    // Infra compartilhada pode afetar qualquer teste.
    if (
      file === 'playwright.config.js' ||
      file === 'qa/helpers.js' ||
      file === 'qa/helpers.mjs' ||
      file === 'qa/env-setup.js' ||
      file === 'package.json' ||
      file === 'package-lock.json' ||
      file === '.github/workflows/qa.yml'
    ) {
      forceFull();
      continue;
    }

    // Qualquer outro helper/runner de QA é tratado conservadoramente.
    if (/^qa\/.*\.(js|mjs|cjs)$/.test(file)) {
      forceFull();
      continue;
    }

    if (file === 'app/src/main/assets/www/index.html') {
      forceFull();
      continue;
    }

    if (/^app\/src\/main\/assets\/www\/open-finance-.*\.js$/.test(file)) {
      staticCheck = true;
      addMatching(tests, availableSpecs, [/^qa\/open-finance.*\.spec\.js$/]);
      continue;
    }

    if (/^app\/src\/main\/assets\/www\/safe-spend.*\.js$/.test(file)) {
      staticCheck = true;
      addMatching(tests, availableSpecs, [
        /^qa\/safe-spend.*\.spec\.js$/,
        /^qa\/financial\.spec\.js$/
      ]);
      continue;
    }

    if (
      file === 'app/src/main/assets/www/invoice-pdf-engine.js' ||
      file === 'app/src/main/assets/www/invoice-manual-reconciliation.js'
    ) {
      staticCheck = true;
      invoicePdf = true;
      addMatching(tests, availableSpecs, [/^qa\/.*invoice.*\.spec\.js$/]);
      continue;
    }

    if (file === 'app/src/main/assets/www/invoice-image-engine.js') {
      staticCheck = true;
      invoiceImage = true;
      addMatching(tests, availableSpecs, [/^qa\/.*invoice.*\.spec\.js$/]);
      continue;
    }

    if (/^app\/src\/main\/assets\/www\/sophy-.*\.js$/.test(file)) {
      staticCheck = true;
      sophyArch = true;
      sophyBenchmark = true;
      addMatching(tests, availableSpecs, [/^qa\/sophy.*\.spec\.js$/]);
      continue;
    }

    if (
      /^app\/src\/main\/assets\/www\/financial-.*\.js$/.test(file) ||
      file === 'app/src/main/assets/www/what-if-engine.js'
    ) {
      staticCheck = true;
      addMatching(tests, availableSpecs, [
        /^qa\/financial.*\.spec\.js$/,
        /^qa\/account-integrity\.spec\.js$/,
        /^qa\/budget-integrity\.spec\.js$/,
        /^qa\/card-integrity\.spec\.js$/,
        /^qa\/debt.*\.spec\.js$/,
        /^qa\/what-if.*\.spec\.js$/
      ]);
      continue;
    }

    if (file === 'app/src/main/assets/www/audit-hardening.js') {
      staticCheck = true;
      addMatching(tests, availableSpecs, [/^qa\/audit.*\.spec\.js$/]);
      continue;
    }

    if (
      file === 'app/src/main/assets/www/ui-hardening.js' ||
      file === 'app/src/main/assets/www/ui-hardening.css'
    ) {
      staticCheck = true;
      addMatching(tests, availableSpecs, [
        /^qa\/.*ui.*\.spec\.js$/,
        /^qa\/.*ux.*\.spec\.js$/,
        /^qa\/.*a11y.*\.spec\.js$/,
        /^qa\/contrast.*\.spec\.js$/,
        /^qa\/visual.*\.spec\.js$/,
        /^qa\/theme-floating-selects\.spec\.js$/
      ]);
      continue;
    }

    // Arquivo web de produção sem regra explícita: segurança primeiro.
    if (/^app\/src\/main\/assets\/www\/.*\.(js|css|html)$/.test(file)) {
      forceFull();
      continue;
    }

    // Outros workflows não mudam a aplicação web.
    if (file.startsWith('.github/workflows/')) continue;

    // Qualquer arquivo não classificado força o gate completo.
    forceFull();
  }

  if (full) {
    return {
      mode: 'full',
      browserRequired: true,
      tests: [],
      staticCheck: true,
      invoicePdf: true,
      invoiceImage: true,
      sophyArch: true,
      sophyBenchmark: true
    };
  }

  const sortedTests = [...tests].sort();
  const hasWork = sortedTests.length > 0 || staticCheck || invoicePdf || invoiceImage || sophyArch || sophyBenchmark;

  return {
    mode: sortedTests.length > 0 ? 'impacted' : (hasWork ? 'support-only' : 'none'),
    browserRequired: sortedTests.length > 0,
    tests: sortedTests,
    staticCheck,
    invoicePdf,
    invoiceImage,
    sophyArch,
    sophyBenchmark
  };
}

function main() {
  if (process.argv.includes('--full')) {
    console.log(JSON.stringify({
      mode: 'full',
      browserRequired: true,
      tests: [],
      staticCheck: true,
      invoicePdf: true,
      invoiceImage: true,
      sophyArch: true,
      sophyBenchmark: true
    }));
    return;
  }

  const files = process.argv.slice(2);
  console.log(JSON.stringify(selectWebQa(files)));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
