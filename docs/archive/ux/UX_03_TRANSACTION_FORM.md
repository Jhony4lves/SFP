# UX-03 — formulário transacional

## Diagnóstico anterior

O formulário preservava todos os fluxos (gasto, conta, cartão, receita e transferência), mas os campos apareciam em uma sequência quase uniforme. Valor e descrição tinham o mesmo peso, status e vencimento não tinham contexto, e criação e edição usavam o mesmo título. Os cinco tipos eram compactos demais no celular e “Mais opções” tinha um alvo e uma legenda pequenos.

## Padrão adotado

A composição reutilizável combina `form-section`, cabeçalho de seção, `field-group`, helper text e `section-actions`. Formulários transacionais posteriores podem reutilizar a ordem conceitual **Essencial → Quando → Origem/destino → Classificação → Status → Detalhes**, mantendo somente os grupos aplicáveis.

- **Essencial:** descrição e valor em superfície de destaque.
- **Quando:** data e, para contas, vencimento/status já existentes.
- **Origem/destino:** conta, cartão/parcelas/fatura ou contas da transferência.
- **Classificação:** categoria nos tipos em que já era usada.
- **Status:** recebimento e recorrência de receita; regras existentes foram mantidas.
- **Mais detalhes:** observação, tags e criação de recorrência em um `details` nativo.

O padrão é indicado para Contas, Cartões, Dívidas, Recorrências, Metas e Orçamento: títulos persistentes, explicação curta, uma seção por decisão e ação primária ao final, sem footer fixo.

## Auditoria mobile e acessibilidade

A composição parte de uma coluna, aumenta para duas apenas acima de 650 px e reserva espaço inferior para teclado/scroll no WebView. O valor mantém `type=number`, `step=0.01`, `min=0.01` e ganhou `inputmode=decimal`; dias e parcelas usam teclado numérico. Tipos têm grupo nomeado, estado `aria-pressed`, texto e ícone, portanto não dependem apenas de cor. O modo Editando é anunciado no título e badge, e detalhes existentes abrem automaticamente.

Nenhuma regra financeira, schema, migração ou seed foi alterado. A edição agora compõe os campos editáveis sobre o objeto existente para preservar metadados opacos.
