# Financial Context Engine

A UX-05 introduz `financialContextSnapshot()`, uma derivação determinística e local do estado. Valores monetários do contrato são expressos em centavos. Nenhuma previsão materializa transações ou altera caixa, competência ou patrimônio.

## Semântica

- **AVAILABLE**: soma dos saldos de contas após movimentos realizados com impacto.
- **COMMITTED**: obrigações conhecidas e ainda não pagas na janela avaliada.
- **PROJECTED**: AVAILABLE, mais entradas virtuais, menos saídas virtuais em ordem de data.
- **RESERVED**: compromissos conhecidos anteriores à próxima entrada esperada; cada razão preserva origem, data, identificador e valor.
- **FREE**: AVAILABLE menos RESERVED; limites de crédito nunca são dinheiro livre.

O snapshot separa realizado, compromissos e projeções, inclui rastros explicáveis e não mantém estado financeiro próprio. O histórico patrimonial usa somente snapshots de fechamento; valores atuais não são projetados retroativamente.

## Fronteira futura de IA

Uma futura camada de interpretação poderá consumir fatos, previsões e recomendações tipadas, mas não poderá recalcular ou substituir fatos. **A IA pode brincar com o usuário. Ela nunca brinca com a matemática.** Números permanecem determinísticos, verificáveis e locais. Esta entrega não inclui modelo, chatbot, API externa, telemetria ou aprendizado automático.
