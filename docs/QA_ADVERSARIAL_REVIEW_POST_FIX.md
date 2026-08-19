# Revisão adversarial pós-correção — QA Lab

## Escopo e veredito

Esta rodada corrige somente os bloqueadores registrados em `1ffd19d`: persistência, bootstrap, reconciliação de parcelas, pagamento de fatura, testes e verificação estática. Não altera package Android, nomes de IndexedDB, schema, seed, assinatura, XSS global ou arquitetura.

- **Seguro para abrir PR:** sim, condicionado à execução do workflow no GitHub e revisão humana.
- **Seguro para merge imediato em `main`:** não; abrir PR não substitui CI e revisão.
- **Merge realizado:** não.

## Ordem formal das fontes de estado

1. **IndexedDB válida** (`SFP_JHONY_STABLE` / `state` / `main`).
2. **Fallback válido** (`sfp_final_fallback`) se a IndexedDB estiver vazia, corrompida ou indisponível.
3. **Seed**, exclusivamente quando a leitura da IndexedDB terminou como `empty` e a leitura do fallback terminou como `empty`.

Estados `unavailable` e `corrupt` não equivalem a `empty`. Sem uma fonte válida alternativa, o bootstrap falha de forma explícita e não grava seed. Um fallback válido é promovido para uma IndexedDB comprovadamente vazia, mas uma IndexedDB corrompida não é sobrescrita automaticamente.

## Bloqueadores resolvidos

### Persistência

`dbGet()` agora retorna estados discriminados (`ok`, `empty`, `corrupt`, `unavailable`). `fallbackGet()` faz a mesma distinção para o fallback. `dbSet()` informa se gravou na IndexedDB ou usou fallback, recusa estados inválidos e lança erro se ambas as gravações falharem, evitando falha silenciosa. A validação rejeita valores não estruturais e tipos incompatíveis sem executar migração destrutiva.

A matriz automatizada cobre IndexedDB sem marcador, fallback com IndexedDB indisponível com e sem marcador, IndexedDB vazia com fallback, ambas vazias, fallback corrompido, IndexedDB corrompida com fallback e indisponibilidade sem fallback. Os testes também verificam DOM restaurado, reload real, `pageerror`, `console.error` e preservação byte-lógica do fallback.

### Bootstrap

`statusLabel` e `kindLabel` eram referências ausentes, não problema de ordem. Foram definidas uma única vez antes do bootstrap. O diagnóstico hardcoded da carga inicial agora só roda quando o estado tem a assinatura da carga inicial; fixtures ou dados legítimos diferentes não geram `console.error` falso.

### Parcelamento e estornos

O cálculo passa a operar em centavos inteiros. A regra determinística é: dividir pelo piso e distribuir um centavo adicional para as primeiras parcelas até consumir o resto. Assim, R$ 100,00 / 3 resulta em R$ 33,34, R$ 33,33 e R$ 33,33. Estornos são convertidos para centavos e a obrigação da parcela nunca fica negativa.

Foram cobertos 100/3, 10/6, valor pequeno, uma parcela, muitas parcelas, estorno parcial, integral e superior à parcela. A soma independente em centavos precisa ser igual ao total original.

### Pagamento de fatura e extrato

A conciliação agora reconhece um débito bancário como candidato de `invoice.payments` somente quando a descrição indica cartão/fatura, conta e valor em centavos coincidem, a data está na janela de três dias e existe uma única correspondência. A importação anexa `statementKey` ao pagamento existente e não cria uma segunda transação. Os identificadores de extrato de pagamentos também entram na detecção de importação repetida. Nenhum registro histórico é apagado ou reclassificado automaticamente.

### Testes e static check

As fixtures financeiras são pequenas e explícitas e não clonam o seed. Os invariantes verificam total das parcelas, caixa pago, competência sem pagamento duplicado, compromisso aberto, pagamento parcial, estorno e reconciliação das três visões.

O static check separa IDs do HTML estático e amplia detecção para `function`, declarações `const`/`let` de topo, atribuições `window.nome` e marcadores reais de conflito (`<<<<<<<`/`>>>>>>>`). Ele continua deliberadamente simples e não se apresenta como parser JavaScript completo.

## Reexecução dos cenários anteriores

- IndexedDB válida sem marcador: preservada e renderizada.
- Fallback válido com IndexedDB indisponível, com e sem marcador: preservado, sem seed.
- IndexedDB vazia + fallback: fallback promovido.
- Nenhuma fonte válida comprovadamente existente: seed criado.
- Fonte corrompida sem alternativa: bootstrap interrompido sem sobrescrita.
- 100/3: soma exata de R$ 100,00.
- Compra atravessando meses: parcelas determinadas por `firstMonth` e índice.
- Estornos parcial, total e superior: obrigação correta e nunca negativa.
- Fatura parcial: caixa contém apenas pago e compromisso contém somente restante.
- Pagamento de fatura seguido de extrato: uma única saída de caixa.
- Bootstrap: DOM completo, sem `pageerror` ou `console.error` nos fluxos válidos.

## Riscos remanescentes fora desta correção

- Duplicatas históricas e correspondências ambíguas não são alteradas ou reconciliadas automaticamente; permanecem para revisão manual e exigem ferramenta auditável futura.
- UI Automator continua compilado, mas sua execução depende de emulador/dispositivo.
- XSS global, migrações schema 1–11, remoção do seed, redesign e refatoração do motor permanecem fora do escopo.

## Gate final da PR

O ambiente local não possui remote Git nem credenciais GitHub, e a API pública retorna `404` para o repositório. Portanto, não foi possível afirmar um status remoto de CI nem consultar logs da PR; esse é um limite de verificação, não um job aprovado. Localmente, os mesmos comandos do workflow foram executados do zero.

O matching de fatura foi tornado conservador: exige débito, descrição explícita de cartão/fatura, mesma conta, igualdade exata em centavos, janela máxima de três dias e uma única correspondência. Casos sem descrição financeira ou com mais de uma correspondência não são ligados a `invoice.payments`. O vínculo continua passando pela tela de revisão do extrato e não altera transações históricas.

Os artifacts do QA não publicam APK, screenshot ou trace. O relatório web usa fixture sintética por padrão; o artifact Android contém apenas hashes SHA-256 dos APKs compilados. O workflow de release original não foi modificado e permanece independente.

**Veredito local:** `SAFE_TO_MERGE_WITH_KNOWN_NON_BLOCKING_RISKS`, condicionado ao CI remoto verde antes do merge. Os riscos não bloqueantes são: UI Automator apenas compilado (limitação da fase 1), dívida técnica preexistente de duplicatas históricas não migradas e impossibilidade local de consultar o status da PR.
