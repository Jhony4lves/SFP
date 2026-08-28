# SFP Android

Este projeto empacota o SFP como um aplicativo Android local-first.

## Roadmap

A direção técnica até o SFP feature-complete está documentada em [`docs/ROADMAP-DEFINITIVO.md`](docs/ROADMAP-DEFINITIVO.md). O roadmap prioriza integridade financeira, Local Financial Core único, inteligência explicável, importação/conciliação, planejamento, automação segura, robustez e uma validação física consolidada no fechamento do ciclo.

## Por que esta arquitetura

- O HTML/CSS/JS do SFP fica dentro do APK.
- O app abre a interface por uma origem HTTPS local do Android (`appassets.androidplatform.net`).
- IndexedDB fica dentro dos dados do pacote `com.jhony.sfp`.
- Uma atualização de APK com o MESMO `applicationId` e a MESMA chave de assinatura preserva os dados.
- Se a internet cair, o SFP continua funcionando.
- Importações usam o seletor de arquivos do Android.
- Backups/exportações são salvos em `Downloads/SFP`.

## Regra mais importante para atualizações

NUNCA alterar:

    applicationId "com.jhony.sfp"

E NUNCA perder a chave usada para assinar a primeira versão de produção.

O Android só aceita instalar uma atualização por cima da anterior se:
1. o package/applicationId for o mesmo;
2. o `versionCode` for maior;
3. a assinatura for a mesma.

## Fluxo de atualização

1. Substituir `app/src/main/assets/www/index.html` pela nova versão do SFP.
2. Incrementar `versionCode` e `versionName` em `app/build.gradle`.
3. Compilar e assinar com a MESMA chave.
4. Instalar o APK novo no celular.
5. O Android substitui o aplicativo e mantém IndexedDB, preferências e arquivos internos.

## Banco de dados

O SFP deve manter um nome estável de IndexedDB e fazer migrações por `schemaVersion`.
Não crie um novo banco a cada versão. Isso foi útil durante os testes HTML, mas NÃO deve ser feito no APK de produção.

## Build sem PC

O arquivo `.github/workflows/build-apk.yml` permite compilar pelo GitHub Actions.
Você pode administrar um repositório privado pelo próprio celular. Para releases permanentes, configure uma chave de assinatura fixa via GitHub Secrets.

## Assinatura de produção

Antes do primeiro APK que será usado a longo prazo, crie UMA chave de assinatura e guarde cópias seguras.
Sem essa chave, futuras versões não conseguem atualizar o aplicativo instalado; exigiriam desinstalação e poderiam perder dados locais.

## Backup

Mesmo com atualização preservando os dados, mantenha backup JSON/criptografado periódico.