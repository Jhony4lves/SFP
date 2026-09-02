# UI style ownership

Este documento define onde cada tipo de regra visual do SFP deve morar. O objetivo é reduzir colisões entre o CSS histórico do `index.html`, estilos injetados pelos módulos e correções responsivas globais.

## 1. Tokens e regras globais

Pertencem ao núcleo global:

- tokens `--color-*`, `--space-*`, `--radius-*`, `--safe-*` e alturas estruturais;
- reset e tipografia base;
- shell (`main`, `.sidebar`, `.top`, bottom navigation);
- controles realmente compartilhados (`button`, `input`, diálogos e custom select);
- contratos mínimos de acessibilidade, como área de toque e safe areas.

Regra: novos componentes não devem criar uma segunda definição global de tokens ou de shell.

## 2. Módulos

Estilos específicos devem permanecer junto do módulo proprietário:

- `financial-insights-ui.js`: `.financial-insight*`;
- `safe-spend-ui.js`: `.safe-spend*`;
- `sophy-proactive-brief.js`: `.sophy-brief*` e `.sophy-proactive-brief`;
- `what-if-ui.js`: componentes de simulação;
- `index.html`: telas históricas ainda não extraídas.

Um módulo não deve alterar seletores genéricos como `body`, `main`, `.panel`, `.head`, `.grid2`, `.btn` ou `.ghost` sem escopo explícito do módulo.

## 3. `ui-hardening.css`

Esta folha é uma camada pequena de contratos transversais comprovados por QA, não um novo depósito de overrides.

Pode conter:

- correções de tema que cruzam módulos;
- regras de safe area;
- breakpoints de integração entre shell e módulo;
- fallback de acessibilidade compartilhado.

Não pode conter:

- cálculos financeiros;
- estilos que pertencem a um único módulo quando é possível corrigi-los na fonte;
- correções baseadas apenas em esconder overflow ou conteúdo.

## 4. Uso de `!important`

Evitar por padrão. É aceitável apenas quando uma regra histórica com `!important` precisa ser neutralizada antes de uma refatoração da origem, ou em utilitários cujo contrato exige prioridade explícita.

Quando uma correção toca um `!important` histórico, preferir remover/reduzir a declaração na fonte em vez de adicionar outra declaração ainda mais específica.

### Marco da auditoria 2026-09-02

A etapa de hardening começou com 14 declarações `!important` na folha transversal. Três overrides redundantes dos diálogos em tema claro foram removidos, deixando o teto em **11**. `qa/ui-style-guardrails.spec.js` transforma esse teto em contrato: novos patches não podem fazer a dívida voltar a crescer sem primeiro reduzir ou justificar uma regra existente.

Os `!important` restantes neutralizam regras legadas cuja prioridade ainda é necessária para preservar o comportamento comprovado nos breakpoints/temas cobertos. Eles devem ser removidos nas extrações graduais do módulo proprietário, e não substituídos por seletores globais mais agressivos.

## 5. Responsividade

Breakpoints obrigatórios de regressão visual:

- 320 px;
- 360 px;
- 384/390 px;
- 412 px;
- landscape baixo (740×360 e 844×390);
- 768 px;
- desktop 1280 px.

Overflow horizontal global não é solução de layout. Elementos horizontalmente roláveis devem declarar `overflow-x:auto` no contêiner que possui essa interação.

## 6. Critérios para novas telas/componentes

Antes de mergear:

1. não criar overflow global nos breakpoints cobertos;
2. controles principais móveis com área mínima de 44×44 px;
3. texto funcional não depender de fontes microscópicas;
4. tema claro e escuro devem usar tokens ou overrides tematizados;
5. campos precisam de nome acessível (`label`, `aria-label` ou `aria-labelledby`);
6. texto longo deve quebrar, rolar explicitamente ou oferecer o valor completo por semântica apropriada;
7. não esconder conteúdo essencial apenas para caber em landscape.

## 7. Migração gradual

A refatoração do CSS histórico deve ocorrer por módulo, com QA verde a cada etapa. Não fazer uma reescrita única do `index.html`: o risco de regressão supera o ganho. Cada extração deve remover as regras antigas equivalentes no mesmo PR, evitando manter duas fontes de verdade.

## 8. Higiene do candidato bug-zero

Workflows/scripts usados apenas para aplicar patches de auditoria são descartáveis e não fazem parte do produto. Antes da validação final, eles devem ser removidos; o candidato deve depender somente dos workflows permanentes de build/QA e dos testes de regressão que documentam o comportamento corrigido.
