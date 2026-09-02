const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

const root='app/src/main/assets/www';
const index=fs.readFileSync(`${root}/index.html`,'utf8');
const hardening=fs.readFileSync(`${root}/ui-hardening.css`,'utf8');

function matches(text,regex){return [...text.matchAll(regex)].map(m=>m[0]);}

test('UI guardrail: shell não mascara overflow horizontal global',()=>{
  // Only forbid an exact global body/main selector. Scoped containment such as
  // body[data-page="sophy"] main { overflow:hidden } is allowed when it is local
  // to a component/page and does not hide overflow across the application shell.
  const forbidden=[
    /(?:^|})\s*body\s*,\s*main\s*\{[^}]*overflow-x\s*:\s*hidden/gi,
    /(?:^|})\s*body\s*\{[^}]*overflow-x\s*:\s*hidden/gi,
    /(?:^|})\s*main\s*\{[^}]*overflow-x\s*:\s*hidden/gi,
  ];
  const hits=forbidden.flatMap(rx=>matches(index,rx));
  expect(hits,`Não mascarar clipping global:\n${hits.join('\n')}`).toEqual([]);
});

test('UI guardrail: hardening não contém regras financeiras nem seletores globais genéricos',()=>{
  expect(hardening).not.toMatch(/\b(balance|salary|income|expense|debt|budget)\s*[=:]/i);
  const broad=matches(hardening,/(?:^|\})\s*(?:body|main|\.panel|\.head|\.grid2|\.grid3)\s*\{/gm);
  expect(broad,`ui-hardening.css deve ser escopado; seletores amplos encontrados:\n${broad.join('\n')}`).toEqual([]);
});

test('UI guardrail: dívida de !important da camada de hardening não volta a crescer',()=>{
  const importantCount=matches(hardening,/!important\b/g).length;
  expect(importantCount,'ui-hardening.css deve manter no máximo os overrides cuja cascata legada ainda exige !important').toBeLessThanOrEqual(11);
  expect(hardening).not.toMatch(/\.modal\.sfp-dialog\s*\{[^}]*!important/si);
});

test('UI guardrail: módulos novos não redefinem o shell sem escopo',()=>{
  const moduleFiles=['financial-insights-ui.js','safe-spend-ui.js','sophy-proactive-brief.js','what-if-ui.js'];
  const violations=[];
  for(const file of moduleFiles){
    const source=fs.readFileSync(`${root}/${file}`,'utf8');
    for(const hit of matches(source,/(?:^|[\n`])\s*(?:body|main)\s*\{/gm)) violations.push(`${file}: ${hit.trim()}`);
  }
  expect(violations,violations.join('\n')).toEqual([]);
});
