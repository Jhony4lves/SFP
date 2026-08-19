# Revisão adversarial do commit `a9f4c0f`

## Veredito

- **Seguro para abrir PR:** **não**, enquanto a descrição afirmar preservação completa e o teste de persistência não cobrir o fallback e falhas da IndexedDB.
- **Seguro para merge em `main`:** **não**.
- Esta revisão não altera o motor, a persistência nem a interface. Ela registra limites encontrados na fase 1 antes de qualquer nova implementação.

## Achados

### CRÍTICO — fallback persistido pode ser sobrescrito pelo seed

`dbSet()` grava em `sfp_final_fallback` quando a IndexedDB falha, mas `load()` nunca lê essa chave. Em teste adversarial, com um estado real apenas no fallback e a IndexedDB indisponível, tanto com quanto sem `sfp_jhony_stable_seed_202`, o app carregou o seed e substituiu o próprio fallback pelo seed. Uma indisponibilidade transitória da IndexedDB também é indistinguível de banco ausente porque `dbGet()` converte qualquer erro em `null`.

A correção de `a9f4c0f` protege o cenário específico “IndexedDB válida + marcador apagado”, mas não justifica a afirmação geral de que instalações existentes estão preservadas em todos os cenários.

### ALTO — teste de persistência observa estado interno, não a UI funcional

O teste Playwright inicialmente verificava `#cfgName`, mas foi alterado para consultar apenas `state.settings.name`. A página atualmente lança `ReferenceError: statusLabel is not defined` durante `renderAll()`, deixa `#cfgName` vazio e ainda assim o teste passa. Portanto, ele comprova leitura da IndexedDB, mas mascara falha de renderização e não comprova restauração utilizável pela interface.

### ALTO — arredondamento de parcelamento não conserva o total

Cada parcela usa o mesmo valor arredondado. Uma compra de R$ 100,00 em três parcelas produz 3 × R$ 33,33 = R$ 99,99. O teste incluído valida uma parcela isolada e não valida o invariante de que a soma das parcelas deve ser igual ao total da compra.

### ALTO — cobertura financeira é insuficiente e parcialmente tautológica

Os testes executam diretamente as funções internas atuais no browser e comparam poucos resultados escolhidos. Eles não usam um oráculo independente, fixtures versionadas ou fluxos reais de formulário/persistência. Não cobrem compra anterior atravessando ano, fechamento e vencimento, estorno total, fatura parcial, compromissos, nem reconciliação de pagamento de fatura. Assim, podem congelar uma fórmula incorreta em vez de detectar uma regressão financeira.

### ALTO — risco de dupla contagem ao importar pagamento de fatura

O motor separa corretamente pagamentos registrados em `invoice.payments` da competência das parcelas. Porém, a conciliação de extrato procura candidatos apenas entre transações e recorrências, não entre pagamentos de fatura. Um débito bancário de pagamento já registrado pode ser importado como nova despesa e aparecer novamente no caixa. Esse risco é anterior ao commit, mas não está coberto pela fase 1.

### MÉDIO — totais oficiais e calculados produzem visões inconsistentes

`monthCalc()` soma `invoiceTotal()` (que prefere `officialTotal`), enquanto `accrualView()` soma parcelas calculadas. Estornos posteriores e divergências entre total oficial e parcelas podem, portanto, gerar números diferentes em componentes que alegam representar competência. Pagamentos parciais, isoladamente, geraram saldo remanescente e compromisso corretos no teste adversarial.

### MÉDIO — estornos e arredondamento têm limites não testados

Um estorno igual à parcela reduz a parcela a zero e um estorno parcial reduz apenas o mês indicado. Valor acima da parcela é truncado; não há transporte do excedente. A UI limita o estorno pelo valor não arredondado `total/installments`, enquanto o cálculo usa parcela arredondada, criando diferenças de centavos possíveis.

### MÉDIO — `static-check.mjs` tem falsos negativos relevantes

A expressão regular detecta apenas declarações `function nome(...)`. Ela não detecta duplicatas em arrow functions, atribuições (`window.x = ...`), listeners, handlers `onclick`, elementos criados em runtime ou menus renderizados repetidamente. A simples presença textual do contrato IndexedDB também pode passar mesmo se o código efetivo usar outro contrato.

### BAIXO — `static-check.mjs` pode gerar falsos positivos

IDs presentes em templates mutuamente exclusivos ou marcadores como `=======` em conteúdo legítimo falhariam. Alterações apenas de espaçamento/aspas no contrato IndexedDB também falhariam sem mudança semântica.

### MÉDIO — workflow não executa UI Automator

O job Android compila `assembleDebug` e `assembleDebugAndroidTest`, mas não inicia emulador nem executa `connectedDebugAndroidTest`. O teste aponta coerentemente para o application ID debug `com.jhony.sfp.debug` e a classe no namespace `com.jhony.sfp`, porém o CI somente comprova compilação.

### BAIXO — workflow, dependências e ignores

`npm ci`, instalação do Chromium, testes estáticos, Playwright e builds Android funcionaram do zero localmente com Java 17/SDK 35. A única dependência npm direta é `@playwright/test`, adequada ao escopo. O `.gitignore` cobre `.gradle`, qualquer diretório `build`, `local.properties`, `node_modules` e os diretórios padrão do Playwright; os relatórios configurados sob `build/reports` já são cobertos por `**/build/`.

### BAIXO — cálculo do mês padrão

Os testes adversariais confirmaram virada dezembro/janeiro, ano bissexto e cartão com fechamento no dia 31 em fevereiro. `currentInvoiceMonth()` usa `>`: no próprio dia de fechamento mantém o mês corrente e avança apenas no dia seguinte. Isso preserva a regra já existente, mas a regra de negócio do “dia de fechamento” deve ser explicitada antes de tratá-la como verdade contábil. A alteração muda apenas os dois inputs iniciais antes hardcoded; não altera compras ou faturas persistidas.

## Matriz executada

- IndexedDB válida com marcador removido: estado interno preservado.
- Fallback válido com IndexedDB indisponível, com e sem marcador: fallback perdido e sobrescrito pelo seed.
- Compra iniciada em dezembro e parcelada em janeiro/fevereiro: meses corretos, soma com diferença de R$ 0,01.
- Estorno integral e parcial: zero e redução no mês indicado.
- Fatura parcialmente paga: status `partial`, caixa apenas pelo pagamento e compromisso apenas pelo restante.
- Virada de mês/ano, fevereiro bissexto e fechamento 31: cálculo de mês sem data inválida.
- Renderização após reload: estado carregado, mas renderização interrompida por `statusLabel` ausente.

## Condições mínimas antes de reconsiderar o PR

1. Definir uma ordem de recuperação que leia o fallback e diferencie “sem dado” de “erro de IndexedDB”, sem gravar seed diante de erro transitório.
2. Criar testes destrutivos isolados para IndexedDB, fallback, marcador ausente/presente e falhas de abertura/leitura/escrita.
3. Fazer o teste de persistência validar estado e UI, sem mascarar erro de renderização.
4. Adicionar invariantes independentes para soma de parcelas, estornos, parcial, caixa/competência/compromissos e conciliação de fatura.
5. Corrigir ou caracterizar `statusLabel` antes de alegar que os fluxos Playwright principais passam funcionalmente.
