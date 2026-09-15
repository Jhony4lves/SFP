# Open Finance no SFP

## Regra de produto

O SFP usa a Pluggy como fonte externa para consultar dados de Open Finance. As conexões pessoais atuais foram criadas/gerenciadas pelo **MeuPluggy**.

Validação física no Galaxy S24 com `2.2.0-openfinance.21 / versionCode 40` confirmou que esses Items são legíveis pelo SFP, porém **não aceitam atualização manual iniciada pelo SFP**. O endpoint de atualização retorna HTTP 400 com a mensagem `MeuPluggy item cant be updated`.

Essa resposta é uma limitação conhecida do modelo MeuPluggy, e não deve ser apresentada como erro de rede, credencial ou falha genérica do SFP.

## O que o SFP consegue fazer

- autenticar na Pluggy;
- descobrir os Items MeuPluggy vinculados;
- consultar contas, cartões, transações e faturas disponíveis no snapshot da Pluggy;
- importar/conciliar dados confirmados sem duplicação;
- atualizar o estado local quando a Pluggy disponibilizar dados mais recentes;
- tentar refresh explícito apenas em conexões futuras que suportem essa operação.

## O que o SFP não consegue fazer com Items MeuPluggy

O SFP **não consegue obrigar o MeuPluggy a consultar o banco naquele instante**. Portanto, o botão manual e a atualização automática não devem prometer tempo real quando a conexão é gerenciada pelo MeuPluggy.

Para esses Items, `atualizar` significa **reler e importar o snapshot mais recente que a Pluggy já possui**.

## Política de atualização do aplicativo

Para manter o estado local o mais recente possível:

1. ao abrir o SFP, se a Pluggy estiver configurada, o app relê automaticamente o snapshot disponível;
2. enquanto o app estiver aberto e visível, repete essa releitura a cada **15 minutos**;
3. ao voltar do background, se já tiverem passado 15 minutos desde a última leitura da sessão, sincroniza novamente;
4. a atualização automática nunca dispara repetidamente `PATCH /items/{id}` para Items MeuPluggy;
5. o refresh real manual permanece disponível para conexões que aceitem atualização explícita;
6. re-sync precisa permanecer idempotente: nenhuma transação, transferência, compra ou fatura pode ser duplicada.

## UX

A sincronização Open Finance é função principal do SFP e não deve ficar escondida em Configurações.

- existe uma aba própria de sincronização/Open Finance na navegação;
- ela deve ser acessível também na barra inferior mobile;
- o botão principal usa a nomenclatura **Atualizar dados agora**;
- a interface informa que o MeuPluggy controla a coleta bancária e que o SFP mantém o estado local alinhado ao snapshot mais recente disponível.

## Trabalho relacionado

- #225 — substituir refresh impossível de Items MeuPluggy por conexão controlada pelo SFP quando viável;
- #226 — sincronização ao abrir, a cada 15 min e promoção da área Open Finance na navegação;
- #217 — empréstimos/dívidas contratuais via Open Finance.
