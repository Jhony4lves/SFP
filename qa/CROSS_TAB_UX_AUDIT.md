# SFP — Auditoria cruzada de UX / recorrência dos ERR-001…ERR-029

Data: 2026-08-27
Base auditada: `main` em `cbd75c1d3f245e60eaad378ae792ce253aaef536` (PR #43)

## Escopo

A auditoria percorre as 19 abas do produto em viewport mobile (390x844), nos temas escuro e claro, com dados longos/realistas para estressar layout. Além do scanner observacional, foram revisados fluxos de persistência, semântica dos formulários, importação, simuladores e configurações.

Abas: Hoje, Sophy, Dashboard, Visão Geral, Lançamentos, Extratos, Contas, Cartões, Recorrências, Orçamento, Dívidas, Metas, Patrimônio, Calendário, Relatórios, Simuladores, Central de Dados, Auditoria e Preferências.

O teste executável está em `qa/cross-tab-ux-audit.spec.js`.

## Achados confirmados

### 1. ERR-020 — regra de salário precisa ser configurável (reaberto)

A regra de data útil está embutida no núcleo: recorrências reconhecidas como salário são normalizadas para `business-day-before-anchor`, inclusive por inferência textual da descrição. O formulário de recorrência não oferece qualquer controle de regra de data.

Correção esperada: cada recorrência deve expor explicitamente a regra de data. Proposta inicial:

- `No dia escolhido`;
- `No dia; se cair no fim de semana, antecipar`;
- `Sempre no dia útil anterior`.

Registros legados devem preservar a regra atual até o usuário alterá-la. Enquanto não houver calendário de feriados, a UI não deve prometer tratamento de feriados; a implementação atual conhece fins de semana.

### 2. Padrão ERR-007 / ERR-012 / ERR-019 se repete em Cartões, Metas e Patrimônio

O teste reproduziu que, após salvar via fluxo progressivo, o painel/modal continua aberto em:

- Cartões;
- Metas;
- Patrimônio.

Além disso, esses handlers limpam/resetam o formulário antes de `await save(...)`, ao contrário dos fluxos já corrigidos de Conta, Dívida e Recorrência. Em uma falha de persistência, o estado financeiro é revertido pelo `save`, mas o usuário pode perder os valores digitados no formulário.

Correção esperada: persistir primeiro; somente depois de sucesso resetar o formulário e fechar o fluxo progressivo. Em falha, manter dados digitados e ação disponível para retry.

### 3. ERR-013 / ERR-016 — semântica contextual e controles sem efeito reaparecem em Lançamentos

- Compra no cartão mantém o campo genérico `Conta` visível, embora o branch de persistência de cartão ignore `txAccount`.
- `Criar regra recorrente mensal` pode ficar visível em tipos cujo submit não cria recorrência (cartão/transferência), criando controle aparentemente funcional sem efeito.
- No tipo `Conta a pagar`, o CTA usa `Adicionar conta`, expressão que pode ser confundida com criação de conta bancária.
- Labels de conta continuam genéricos em vez de origem/destino/conta de recebimento conforme o tipo.

Correção esperada: cada tipo deve mostrar apenas campos usados pelo seu submit, com linguagem contextual.

### 4. ERR-018 — Extratos contradiz a arquitetura híbrida de validação

A aba de Extratos exibe badge `offline` e o texto `Nada sai do aparelho.`. Porém, quando Groq + internet estão disponíveis, `analyzeImportDocument()` pode enviar uma amostra sanitizada (data, descrição sanitizada e valor) ao validador Groq.

A arquitetura continua privacy-first e não envia o arquivo cru/FITID, mas a mensagem da UI é factualmente absoluta demais.

Correção esperada: informar claramente que o parsing é local e que, se a validação por IA estiver habilitada/disponível, uma amostra sanitizada pode ser enviada. Idealmente permitir ao usuário desabilitar IA para a importação.

### 5. ERR-009 / ERR-018 — prévia mobile de Extratos ainda usa tabela densa

A prévia de fatura já tem cards mobile, mas a revisão de extrato continua com uma tabela de 8 colunas dentro de scroll horizontal (Data, Descrição, Valor, Ação, Categoria, Transferir p/, Aprender?, Conciliação).

Não é overflow global, pois o container é rolável, mas repete o problema de usabilidade móvel que motivou a correção da prévia de fatura.

Correção esperada: cards mobile com hierarquia vertical e ações por item; tabela preservada em desktop.

### 6. ERR-011 — Simuladores não acompanha a periodicidade de juros das Dívidas

O cadastro de Dívida aceita taxa diária/mensal/anual, mas o simulador `Amortização de dívida` aceita apenas `Juros a.m. %` e calcula diretamente como taxa mensal.

Correção esperada: mesma seleção de periodicidade do cadastro de dívida ou conversão explícita, sem exigir cálculo mental do usuário.

### 7. ERR-017 — Dashboard ainda tem exploração limitada

O gráfico temporal usa `<title>` em pontos SVG como detalhe, solução fraca em touch. O ranking de categorias navega para Lançamentos, mas não aplica a categoria tocada como filtro. O usuário chega à tela certa, porém perde o contexto do drill-down.

Correção esperada: tooltip/tap explícito e navegação já filtrada para a categoria/período selecionados. Relatórios/Visão possuem camadas interativas mais avançadas e devem servir de referência.

### 8. ERR-022 — hierarquia de Orçamento permanece ambígua

`Modelo de orçamento` (preset e percentuais) e `Orçamento por categoria` aparecem como blocos pares. A UI não explica qual regra prevalece nem como limites por categoria se relacionam ao 50/30/20 ou ao modelo personalizado.

A soma dos percentuais globais é validada quando o preset não é `none`, mas isso não resolve a hierarquia conceitual.

### 9. ERR-025 — Central de Dados ainda dá peso visual alto a detalhes técnicos

`Banco de dados: IndexedDB` e `Estrutura: v11` aparecem na mesma grade de destaque que Saúde dos dados e Último backup.

Correção esperada: saúde/backup/ações primeiro; detalhes técnicos em seção avançada/diagnóstico.

### 10. ERR-028 — Preferências continuam vagas

A tela mantém `Nome do sistema`, `Dia principal 1` e `Dia principal 2` sem explicar impacto. A regra salarial não deve depender de nomenclatura global obscura; deve ficar explícita na recorrência correspondente.

### 11. Alvos de toque pequenos em ações secundárias

O scanner encontrou controles abaixo de 40px em vários contextos, principalmente ações `tiny`/chips. Os casos a revisar incluem Sophy, Lançamentos, Recorrências, Orçamento, Patrimônio, Relatórios e Preferências.

Os testes existentes garantem >=44px para vários controles primários, mas não cobrem todas as ações secundárias. A revisão deve priorizar ações frequentes/destrutivas (Editar, Excluir, Pausar, Registrar mês etc.).

### 12. ERR-014 / Privacidade — saldo em seletor de transferência

A PR #47 adiciona saldo no seletor de origem/destino, mas review do Codex encontrou que o texto do `<option>` pode revelar valores com Modo Privacidade ativo. Não deve ser mergeada antes de mascarar/reconstruir os labels conforme privacidade e adicionar regressão.

## Alertas automáticos classificados como intencionais (não bugs por si só)

- Dashboard usa carrossel horizontal de métricas em mobile.
- Sophy usa barra horizontal rolável de sugestões/quick actions.

O scanner acusou elementos internos desses scrollers como fora do viewport, mas a revisão do CSS/contratos existentes mostra que o scroll horizontal é intencional. Eles só devem virar bug se houver clipping sem possibilidade de rolagem ou alvo inacessível.

## Abas sem repetição crítica nova detectada nesta rodada

Hoje, Contas e Dívidas não apresentaram repetição crítica nova dos padrões acima no cenário auditado. Calendário também passou os contratos gerais de viewport e navegação, mas o ERR-024 específico do espaçamento do badge `Previsto` continua aberto até reteste focal. Auditoria possui correções pendentes na PR #44 e não deve ser avaliada apenas pela `main` antiga.

## Regra de encerramento atualizada

Um ERR não deve ser considerado fechado apenas porque a tela originalmente citada passou. Para os padrões reutilizáveis, o encerramento passa a exigir uma matriz `ERR × abas afetadas` e regressões nas instâncias repetidas encontradas nesta auditoria.
