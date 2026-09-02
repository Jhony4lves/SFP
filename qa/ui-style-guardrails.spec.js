const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

const root='app/src/main/assets/www';
const index=fs.readFileSync(`${root}/index.html`,'utf8');
const hardening=fs.readFileSync(`${root}/ui-hardening.css`,'utf8');

function matches(text,regex){return [...text.matchAll(regex)].map(m=>m[0]);}

test('UI guardrail: shell não mascara overflow horizontal global',()=>{
  const forbidden=[
    /body\s*,\s*main\s*\{[^}]*overflow-x\s*:\s*hidden/gi,
    /body\s*\{[^}]*overflow-x\s*:\s*hidden/gi,
    /main\s*\{[^}]*overflow-x\s*:\s*hidden/gi,
  ];
  const hits=forbidden.flatMap(rx=>matches(index,rx));
  expect(hits,`Não mascarar clipping global:\n${hits.join('\n')}`).toEqual([]);
});

test('UI guardrail: hardening não contém regras financeiras nem seletores globais genéricos',()=>{
  expect(hardening).not.toMatch(/\b(balance|salary|income|expense|debt|budget)\s*[=:]/i);
  const broad=matches(hardening,/(?:^|\})\s*(?:body|main|\.panel|\.head|\.grid2|\.grid3)\s*\{/gm);
  expect(broad,`ui-hardening.css deve ser escopado; seletores amplos encontrados:\n${broad.join('\n')}`).toEqual([]);
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
