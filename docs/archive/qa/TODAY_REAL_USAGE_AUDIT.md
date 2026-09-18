# Auditoria restrita à tela Hoje — uso real v1

## Semântica adotada

- **Saldo em contas:** saldo realizado das contas, composto pelo saldo-base e movimentações com impacto de caixa já efetivado.
- **Comprometido até a próxima entrada:** despesas ainda abertas entre hoje e a próxima receita pendente; não representa competência mensal.
- **Livre projetado:** saldo em contas menos os compromissos abertos considerados acima.
- **Próximo recebimento:** primeira receita ainda pendente a partir de hoje.
- **Reserva:** saldo positivo de contas classificadas como Reserva ou Investimento.
- **Próximos 7 dias:** eventos ainda pendentes entre hoje e D+7, inclusive, que exigem ou representam movimentação futura.
- **Contas:** saldo realizado individual de cada conta.
- **Cartões:** limite, fatura selecionada, parcelas e compromissos do cartão, sem transformar pagamento da fatura em nova competência.

## Bugs claros corrigidos

1. A conciliação permitia reenvios durante a persistência, não apresentava feedback inequívoco e criava ajuste sem `balanceImpact`, fazendo o saldo calculado continuar divergente. A correção bloqueia somente enquanto a mesma conta está em processamento, desabilita o botão, persiste um único ajuste com impacto de caixa, atualiza a tela e apresenta feedback. Em falha, restaura o estado em memória, reativa a ação e não altera ajustes históricos.
2. Próximos 7 dias usava eventos realizados e filtrava apenas pelo limite superior da data. A correção define uma janela inclusiva hoje–D+7, exige status ainda aberto e deduplica por identidade da origem. Pagos, recebidos, ajustes realizados e transferências concluídas ficam fora; fatura parcial entra apenas pelo restante.

## Inconsistências observadas e não alteradas

- Dívidas com desconto em folha são excluídas de `commitmentUntilNextIncome()`. Isso pode ser correto para saldo bancário livre, mas depende de como o salário líquido é registrado; alterar agora seria uma mudança de regra financeira de maior risco.
- O texto “Total nas metas/reservas” é mais amplo que o cálculo atual de Reserva, que considera contas do tipo Reserva/Investimento. Foi documentado, mas não alterado para evitar mudança visual ou conceitual fora dos dois bugs.
- Os cartões dependem da fatura selecionada e dos totais oficiais existentes. A separação caixa/competência permanece conforme os testes do QA Lab e não foi reescrita.

## Revisão adversarial das correções

- A trava é por conta e existe apenas durante a operação; depois de sucesso, cancelamento ou erro, um novo ajuste consciente continua permitido.
- O rollback ocorre somente no estado em memória da tentativa que falhou; nenhum lançamento histórico é removido ou migrado.
- A janela D+7 é inclusiva e D+8 é excluído, inclusive em virada de mês.
- A deduplicação usa `source` e `sourceId`; duas obrigações legítimas com IDs diferentes não são colapsadas.
- Fatura parcial usa `invoiceRemaining()` e fatura paga não gera evento.
- Transferências não entram em `dueEvents()`, portanto transferências concluídas permanecem fora da lista.
