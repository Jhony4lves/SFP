# Auditoria global de UX e navegação

## Escopo e critério

A auditoria percorreu as 17 visões registradas em `PAGE_TITLES` e os componentes que cada uma renderiza. O critério aplicado foi **resumo → detalhe → ação**, sem alterar o estado persistido, os cálculos ou o schema IndexedDB.

| Visão | Conteúdo encontrado | Decisão de hierarquia |
|---|---|---|
| Hoje | KPIs, próximos eventos, resumo, contas e cartões | Mantida como resumo operacional; cartões conduzem aos seus domínios. |
| Visão Geral | patrimônio, KPIs, três visões, gráficos, categorias, quinzenas e compromissos | Mantida como resumo analítico; KPIs e categorias já abrem drill-down sob demanda. |
| Lançamentos | formulário e lista mensal | Domínio de ação explícita; mantido para preservar o fluxo rápido e edição contextual. |
| Extratos | importador, revisão, histórico, conciliação e regras | Fluxo especializado e progressivo: revisão só aparece após selecionar arquivo. |
| Contas | resumo, lista, criação/edição e conciliação | Formulário removido da visão principal; card abre detalhe com movimentações e ações. |
| Cartões | resumo, cards extensos, formulário, fatura, importação e histórico | Cards compactados; fatura subordinada ao detalhe; formulário e fatura abrem sob demanda. A lista responsiva da fatura é a representação canônica no respectivo viewport. |
| Recorrências | editor e regras | Ferramenta especializada; formulário é sua ação principal. |
| Orçamento | indicadores, configuração e categorias | Configuração é o propósito da visão; sem entidade subordinada útil. |
| Dívidas | resumo, contratos, formulário e ações | Formulário removido; contrato abre condições, histórico, pagamento, amortização e edição. |
| Metas | resumo, cards, formulário e aportes | Formulário removido; empty state abre criação; detalhe concentra planejamento e histórico. |
| Patrimônio | KPIs, ativos e evolução | Mantida como resumo patrimonial; edição de ativo continua ação explícita. |
| Calendário | grade e eventos | Mantida como visão temporal; FAB cria lançamento sem formulário permanente. |
| Relatórios | fechamentos, evolução e resumo anual | Visão analítica dedicada; não duplicada no dashboard. |
| Simuladores | cenários de dívida e meta | Ferramenta deliberadamente orientada a ação, sem persistência financeira. |
| Central de Dados | saúde, backup, importação e integridade | Administração isolada do uso cotidiano. |
| Auditoria | diagnósticos e reparos | Administração avançada isolada, nunca carregada como detalhe financeiro. |
| Configurações | preferências, segurança, backup, lixeira e reset | Administração isolada; ações destrutivas mantêm confirmação. |

## Dependências preservadas

Os formulários continuam sendo os mesmos nós DOM e os mesmos handlers; eles são movidos temporariamente para o diálogo e restaurados ao fechar. Assim, IDs, listeners, validação, serialização, IndexedDB, histórico, undo e regras financeiras não foram duplicados. A fatura também reutiliza o renderizador existente, inclusive importação, pagamentos, fechamento e ajustes.

## Navegação e mobile

O FAB agora deriva da aba ativa e evita competir com `+ Novo` no mobile. Diálogos usam `role=dialog`, foco inicial, toque fora para voltar e integração com `handleAndroidBack`. O retorno fecha primeiro ação/detalhe, depois percorre a pilha de abas e só então permite a saída no estado Hoje.
