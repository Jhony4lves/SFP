# Auditoria técnica — SFP QA Lab v1

## Escopo e arquitetura

O aplicativo é um WebView Android que serve um HTML monolítico por `WebViewAssetLoader`. O pacote de produção permanece `com.jhony.sfp`; debug usa o sufixo existente `.debug`. A ponte Java expõe somente versão e gravação de arquivos. A persistência principal é IndexedDB (`SFP_JHONY_STABLE`, store `state`, chave `main`) com fallback local.

## Achados

1. **Crítico, corrigido:** a ausência de um marcador em `localStorage` fazia `load()` substituir uma base IndexedDB válida pelo seed. IndexedDB agora sempre tem precedência.
2. **Alto, pendente:** o seed de produção contém datas, saldos e descrições específicas. Removê-lo exige uma migração de produto deliberada para não afetar instalações novas ou expectativas atuais.
3. **Alto, pendente:** `normalize()` grava diretamente `schemaVersion=11`, enquanto `migrateSchema()` documenta passos somente até 5. Cada futura mudança estrutural deve ganhar migração incremental e fixture de regressão.
4. **Médio, corrigido:** os seletores de fatura iniciavam sempre em setembro de 2026. Agora derivam o mês pelo fechamento do primeiro cartão e pela data corrente.
5. **Médio:** há muitos `innerHTML` com valores de usuário (descrições, nomes, categorias e buscas). `sfpEsc()` protege alguns componentes novos, mas os renderizadores antigos continuam sendo superfície de XSS local/importado.
6. **Médio:** o HTML concentra interface, persistência e motor financeiro em mais de quatro mil linhas. A extração futura deve ser incremental, mantendo os mesmos contratos de dados.
7. **Verificado:** não havia IDs nem declarações de função duplicadas. O teste estático passa a impedir regressão e marcadores de conflito/patch.
8. **Verificado:** pagamentos de fatura só afetam caixa quando `balanceImpact=true`; parcelas entram no total da fatura/competência separadamente. Transações pendentes não alteram saldo bancário.
9. **Android:** acesso a arquivos está desabilitado no WebView e assets usam origem HTTPS controlada. Permanecem APIs de navegação/resultado depreciadas, sem falha funcional observada.
10. **CI:** o workflow de release misturava debug e release. O QA Lab foi criado separadamente e não acessa keystore ou segredos.

## Cobertura da fase 1

- Testes determinísticos: parcelas/estornos, fatura versus caixa e transações pagas versus compromissos.
- Testes Playwright: navegação sem duplicação de menu e preservação da IndexedDB sem marcador local.
- Verificação estática: IDs, funções, marcadores de patches e contrato IndexedDB.
- Esqueleto UI Automator compilável para iniciar o APK debug; execução requer emulador/dispositivo.
- Relatórios HTML, traces e screenshots de falha são publicados como artifacts.

## Próxima fase proposta

Extrair primeiro um módulo financeiro puro (sem alterar fórmulas), criar fixtures versionadas para schemas 1–11, adicionar testes de propriedades para arredondamento e calendário, substituir `innerHTML` de dados importados por construção segura de DOM e executar UI Automator em emulator-runner. Qualquer remoção do seed deve ser tratada como migração separada, revisada e com backup/restauração testados.
