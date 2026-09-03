# Financial Context Engine

`financialContextSnapshot()` é uma derivação determinística e local do estado. Valores monetários do contrato são expressos em centavos. Nenhuma previsão materializa transações nem altera caixa, competência ou patrimônio.

## Semântica de liquidez v2

- **TOTAL_ACCOUNT**: soma patrimonial dos saldos de todas as contas.
- **PROTECTED**: saldo de contas marcadas como protegidas; `Reserva` e `Investimento` são protegidas por padrão, salvo configuração explícita.
- **AVAILABLE / OPERATIONAL_AVAILABLE**: saldo realizado das contas que participam do dinheiro operacional. Movimento com data futura não vira saldo realizado apenas por estar marcado como confirmado/pago.
- **COMMITTED**: obrigações conhecidas e ainda não pagas na janela avaliada, incluindo backlog vencido.
- **PROJECTED**: OPERATIONAL_AVAILABLE mais entradas e menos saídas conhecidas em ordem temporal determinística. Em empate de data sem horário de liquidação, saídas são processadas antes de entradas para análise conservadora de liquidez.
- **SAFE_TO_SPEND / FREE**: maior valor que pode sair agora sem tornar negativo o menor saldo operacional conhecido dentro da janela de 365 dias. Na prática, equivale ao mínimo entre o saldo operacional atual e o menor saldo projetado, limitado a zero.
- **PRESERVE / RESERVED**: parcela do saldo operacional que precisa permanecer disponível agora para sustentar a trajetória conhecida. As superfícies legadas que mostram “livre” devem consumir o mesmo contrato.

A projeção também preserva risco por conta. Pode existir cobertura global suficiente e, ainda assim, faltar saldo na conta efetivamente vinculada ao pagamento; nesse caso o SFP deve alertar a transferência necessária, sem materializá-la automaticamente.

## Regras temporais

Obrigações vencidas e ainda abertas não desaparecem quando o dia vira: entram no backlog e são tratadas antes dos eventos futuros, mantendo o vencimento original para auditoria. Receitas futuras, despesas futuras e transferências futuras permanecem projetadas até sua data; a data civil e o status determinam se o movimento já pertence ao saldo realizado.

## Folha de pagamento

A relação entre salário e consignado é explícita em `settings.payrollIncomeBasis`:

- `net-after-payroll`: a receita salarial informada representa o valor líquido que cai na conta; o consignado continua existindo como passivo/histórico, mas não é debitado novamente da projeção bancária.
- `gross-before-payroll`: a receita representa valor anterior aos descontos; parcelas `payroll` participam da projeção de caixa.

A configuração padrão é `net-after-payroll`, coerente com o cadastro de recebimentos efetivamente creditados em conta, e pode ser alterada na área de Liquidez e folha.

## Crédito e patrimônio

Limite não utilizado continua fora do saldo e do patrimônio. Se uma linha de crédito possui `used > 0` sem dívida vinculada, esse valor passa a ser tratado como passivo e como obrigação conservadora até que exista cronograma/reconciliação. Isso impede que dinheiro tomado emprestado aumente artificialmente o patrimônio líquido ou seja tratado como livre sem contrapartida.

O histórico patrimonial continua usando snapshots de fechamento; projeções não são retroativas.

## Fronteira de IA

Camadas de interpretação podem consumir fatos, previsões e recomendações tipadas, mas não recalculam nem substituem fatos. **A IA pode brincar com o usuário. Ela nunca brinca com a matemática.** Os números permanecem determinísticos, verificáveis e locais.
