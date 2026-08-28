# SFP Definitivo — Roadmap de produto

> Direção técnica a partir da `main` pós-PR #53.
>
> Objetivo: chegar a um SFP **feature-complete**, local-first, explicável, resiliente e confiável para uso financeiro diário. Depois desse marco, novas versões devem ser principalmente manutenção, compatibilidade externa e melhorias opcionais — não correção de lacunas essenciais do produto.

## Princípios que não serão negociados

1. **Integridade financeira acima de conveniência.** Nenhum insight, importador ou automação pode alterar saldos/economia sem regra explícita e auditável.
2. **Local-first.** O núcleo financeiro, projeções, conciliações e insights essenciais funcionam sem LLM e sem internet.
3. **Uma única verdade matemática.** Telas, Sophy, relatórios e simuladores consomem o mesmo Local Financial Core; não mantemos calculadoras paralelas divergentes.
4. **Explicabilidade.** Toda recomendação material deve carregar evidências, fórmula/regra e origem dos dados.
5. **Reversibilidade.** Operações destrutivas ou automáticas precisam ser confirmáveis, auditáveis e, quando aplicável, reversíveis.
6. **Compatibilidade de dados.** Migrações de schema, backups e restores são tratados como contratos de longo prazo.
7. **QA antes de merge.** Feature/regressão automatizada + Web QA + Android QA/build são portões de integração.
8. **Validação física concentrada.** A Issue #32 continuará como checkpoint de R1 física; a rodada manual final cobrirá o produto consolidado.

## Estado de referência

A PR #53 introduziu o `SFPFinancialIntelligence` v1: motor determinístico, read-only e reutilizável pela Sophy. A partir daqui, o trabalho deixa de ser majoritariamente infraestrutura e passa a transformar a infraestrutura existente em experiência de produto, previsão e automação assistida.

Estimativa qualitativa no início desta roadmap: **~60% do SFP feature-complete**.

---

## Fase A — Inteligência visível e acionável

### A1. Painel de Insights na tela Hoje
- “O que merece atenção” com severidade e evidências.
- Risco de caixa, compromissos próximos, desvio de categoria, duplicatas e taxa de poupança.
- Ação contextual para abrir a área relevante.
- “Perguntar à Sophy” usando exatamente o insight determinístico.
- Estado vazio saudável: ausência de alerta não deve parecer erro.

### A2. Linha do tempo de projeção e “quanto posso gastar”
- Trajetória de saldo projetado, não apenas número final.
- Menor saldo e data de maior pressão.
- Disponível seguro até a próxima entrada.
- Separação explícita entre saldo atual, reservado e livre.
- Sensibilidade a obrigações conhecidas e entradas previstas.

### A3. Sophy proativa e explicável
- Priorização dos insights mais importantes.
- Respostas baseadas no Local Financial Core e no motor de insights.
- Referência explícita às evidências usadas.
- Sugestões sem mutação automática do estado.

---

## Fase B — Planejamento e cenários

### B1. Motor “E se?”
Cenários read-only para responder perguntas como:
- “E se eu gastar R$ X hoje?”
- “E se eu guardar R$ X por mês?”
- “E se eu antecipar R$ X da dívida?”
- “E se eu parcelar/antecipar uma compra?”

O cenário nunca altera o estado real até o usuário escolher explicitamente aplicar uma ação suportada.

### B2. Otimização de dívidas
- Comparar amortização extraordinária.
- Price/manual quando aplicável.
- Economia estimada de juros.
- Tempo economizado.
- Estratégias bola de neve/avalanche como simulação, sem imposição.

### B3. Metas e alocação
- Ritmo necessário por meta.
- Probabilidade determinística de atraso com base no plano atual.
- Impacto de novos gastos nas metas.
- Priorização configurável entre objetivos.

### B4. Longo prazo
- Reserva de emergência.
- Planejamento anual.
- Patrimônio projetado.
- Cenários de aposentadoria com premissas transparentes e editáveis.

---

## Fase C — Importação e conciliação quase automáticas

### C1. Inteligência de classificação
- Aprendizado local de categoria por descrição/estabelecimento.
- Reconhecimento de salário e outras receitas recorrentes.
- Pagamento de cartão, estorno, tarifa e transferência.
- Confiança + motivo da classificação.

### C2. Reconciliation Center 2.0
Ao importar, resumir algo como:
- reconhecidas automaticamente;
- conciliadas com lançamentos existentes;
- transferências entre contas;
- pagamentos de fatura;
- possíveis duplicatas;
- linhas que realmente precisam de decisão humana.

### C3. Idempotência e proveniência
- Toda linha importada deve ter origem rastreável.
- Reimportar o mesmo arquivo não duplica economia.
- Correções manuais preservam a evidência original.

---

## Fase D — Automação financeira segura

### D1. Rotinas e recorrências avançadas
- Regras condicionais e calendário de recorrências.
- Exceções, feriados, dias úteis e adiamentos.
- Prévia antes de gerar lançamentos em lote.

### D2. Fechamento mensal assistido
- Checklist de contas, cartões, recorrências, importações e conciliações.
- Diferenças entre previsto x realizado.
- Pendências de classificação/conciliação.
- Snapshot de fechamento verificável.

### D3. Alertas locais relevantes
- Vencimentos.
- Risco de saldo negativo.
- Fatura fora do padrão.
- Meta em risco.
- Duplicata provável.
- Alertas deduplicados e com prioridade — sem spam.

---

## Fase E — Relatórios e compreensão histórica

- Comparação mensal/anual.
- Tendências por categoria e estabelecimento.
- Fluxo de caixa e patrimônio.
- Dívidas e metas ao longo do tempo.
- Drill-down: todo número agregado deve chegar aos lançamentos que o compõem.
- Exportações úteis e legíveis.

---

## Fase F — Robustez de produto

### F1. Integridade e migrações
- Migrações de schema testadas de versões antigas até a atual.
- Auditoria de órfãos, referências e inconsistências.
- Recuperação segura de estados parcialmente corrompidos quando possível.

### F2. Backup e disaster recovery
- Backup verificável.
- Restore com prévia e validação de schema.
- Histórico de backups automáticos locais.
- Procedimento de recuperação documentado e testado.

### F3. Performance e escala
- Base grande de lançamentos sem degradação severa.
- Renderizações incrementais onde fizer sentido.
- Índices/estruturas de consulta quando necessários.
- Limites claros para operações custosas.

### F4. UX e acessibilidade
- Fluxos mobile-first.
- Estados vazios, loading, erro e confirmação consistentes.
- Navegação por teclado quando aplicável ao Web QA.
- Contraste, foco, semântica e alvos de toque.
- Privacidade de valores aplicada também às novas superfícies.

---

## Fase G — Fechamento feature-complete

1. Congelamento de features.
2. Auditoria automatizada completa.
3. QA Web + Android limpa.
4. Build release assinada.
5. **R1 física consolidada / Issue #32**, cobrindo o produto inteiro de uma vez.
6. Correção de qualquer P0/P1 e regressões descobertas.
7. Segunda rodada física focada nas correções, se necessária.
8. Release estável feature-complete.

## Definição de “pronto”

O SFP será considerado feature-complete quando:
- registrar, importar, conciliar, planejar e analisar a vida financeira sem lacuna funcional importante;
- nenhuma função essencial depender de IA remota;
- Sophy consumir dados determinísticos e explicar sua origem;
- cenários não contaminarem o estado real;
- backups/restores/migrações forem confiáveis;
- QA automatizada e rodada física consolidada estiverem verdes;
- novos ciclos puderem ser tratados como manutenção, compatibilidade ou evolução opcional.

## O que fica deliberadamente fora da definição de “necessário”

- integração bancária que exija armazenar credenciais sensíveis do usuário;
- automações irreversíveis sem confirmação;
- dependência obrigatória de cloud/LLM;
- recursos sociais/gamificação que não melhorem a decisão financeira;
- complexidade só para aumentar a quantidade de features.
