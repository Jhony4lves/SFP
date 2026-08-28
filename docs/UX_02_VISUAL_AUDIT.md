# UX-02 — Auditoria visual e fundação do design system

## Escopo

Esta etapa estabelece uma camada visual global, mobile first, sem alterar a ordem dos campos, os tipos HTML, IDs, `name`, handlers, persistência ou regras financeiras. A identidade escura azul/ciano existente foi preservada.

## Diagnóstico encontrado

- Os tokens originais cobriam apenas parte das cores e uma sombra, sem escala explícita de espaços, raios ou alturas de controle.
- Campos, botões, cards e listas repetiam valores próximos, mas não idênticos, em estilos acumulados ao longo das versões.
- `select`, `date` e `month` ainda dependiam em parte da aparência nativa do Android/WebView.
- Labels e textos auxiliares eram pequenos e a separação entre cabeçalho e conteúdo dos painéis era sutil.
- Ações secundárias, ghost e destrutivas tinham áreas de toque e hierarquia inconsistentes fora de alguns breakpoints mobile.
- Formulários extensos utilizavam grades úteis, porém não possuíam primitivas nomeadas para seção, descrição, grupo, ajuda e ações.

## Resolvido globalmente

- Tokens semânticos para backgrounds, superfícies, três níveis de texto, bordas, accent, sucesso, alerta, erro, raios, sombras, espaços e alturas mínimas.
- Aliases retrocompatíveis mantêm todos os módulos atuais usando a nova fonte de verdade sem reescrever lógica ou templates.
- Inputs, selects, textareas, datas, meses, números, checkboxes, placeholders, estados desabilitados/read-only e foco visível receberam tratamento coerente.
- Selects usam indicador CSS consistente; controles de data/mês preservam seus tipos e o seletor nativo, com `color-scheme: dark`.
- Botões primário, secundário, ghost, destrutivo e de ícone têm primitivas e alvo de toque de 44 px; a variante compacta mantém 36 px onde a densidade é necessária.
- Cards, listas, divisores, cabeçalhos, métricas e estados vazios compartilham superfície, borda, raio e espaçamento.
- Foram criadas primitivas reutilizáveis de formulário (`form-section`, `field-group`, `field-label`, `field-help` e `section-actions`) para adoção progressiva.
- O layout mobile evita mínimos rígidos nos controles, permite quebra segura de ações e mantém fonte de 16 px em campos para melhor comportamento de WebView.

## Páginas afetadas pela camada global

Todas as páginas HTML do aplicativo: Hoje, Visão Geral, Lançamentos, Extratos, Contas, Cartões, Recorrências, Orçamento, Dívidas, Metas, Patrimônio, Calendário, Relatórios, Simuladores, Central de Dados, Auditoria e Configurações, além de modais e onboarding.

## Deliberadamente deixado para próximas UXs

- **Hoje e Visão Geral:** priorização específica de métricas e conteúdo ainda exige redesign orientado por tarefas.
- **Lançamentos e formulários financeiros:** agrupamento semântico profundo e divulgação progressiva de opções avançadas devem ser tratados separadamente, após validar o fluxo.
- **Cartões/faturas e Extratos/conciliação:** densidade, tabelas e composição de fatura precisam de estudo próprio; nenhuma interpretação financeira foi tocada.
- **Dívidas, Metas e Orçamento:** hierarquia entre projeção, realizado e ações requer redesign específico.
- **Calendário:** eventos continuam compactos/ocultos no mobile e necessitam uma solução de navegação própria.
- **Relatórios e Patrimônio:** gráficos e comparação de valores precisam de uma etapa dedicada de visualização de dados.
- **Navegação inferior e modal “Mais”:** preservados exatamente como definidos na UX-01.
- O seletor/calendário aberto de `date` e `month`, o seletor de arquivos e diálogos do sistema continuam nativos por acessibilidade e confiabilidade; somente o campo fechado foi harmonizado.

## Risco e validação futura

Como a aplicação é distribuída em Android WebView, a revisão manual final deve cobrir Android físico de referência, escala de fonte aumentada, teclado aberto, orientação paisagem e Samsung DeX. A camada usa enhancement CSS e não introduz componentes JavaScript.
