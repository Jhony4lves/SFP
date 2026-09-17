# SFP Android

O SFP é um aplicativo Android local-first para finanças pessoais. A interface web (HTML/CSS/JS) é empacotada dentro do APK e os dados do usuário permanecem no dispositivo.

## Fontes de verdade do repositório

- Branch principal: `main`.
- Versão Android: `SFP_VERSION_CODE` e `SFP_VERSION_NAME` em `gradle.properties`.
- QA oficial: `.github/workflows/qa.yml`.
- Build/release Android: `.github/workflows/build-apk.yml`.
- Processo de release: [`docs/RELEASE.md`](docs/RELEASE.md).
- Roadmap técnico: [`docs/ROADMAP-DEFINITIVO.md`](docs/ROADMAP-DEFINITIVO.md).

Evite criar versões paralelas dessas configurações. Workflows ou scripts temporários usados para uma correção pontual devem ser removidos ao terminar a tarefa ou transformados em ferramentas oficiais documentadas.

## Por que esta arquitetura

- O HTML/CSS/JS do SFP fica dentro do APK.
- O app abre a interface por uma origem HTTPS local do Android (`appassets.androidplatform.net`).
- IndexedDB fica dentro dos dados do pacote `com.jhony.sfp`.
- Uma atualização Release com o mesmo `applicationId`, a mesma chave de assinatura e `versionCode` maior preserva os dados.
- Se a internet cair, o núcleo local do SFP continua funcionando.
- Importações usam o seletor de arquivos do Android.
- Backups/exportações são salvos em `Downloads/SFP`.

## Regra mais importante para atualizações

Nunca alterar o application id da versão Release:

```text
com.jhony.sfp
```

E nunca perder a chave estável usada para assinar as versões Release.

O Android só aceita instalar uma atualização por cima da anterior quando:

1. o package/applicationId é o mesmo;
2. o `versionCode` é maior;
3. a assinatura é a mesma.

Debug e Release usam application ids diferentes e podem coexistir. A migração de dados entre esses canais deve ser feita por backup/exportação e restauração; consulte `docs/RELEASE.md`.

## Fluxo de desenvolvimento

1. Alterar somente os arquivos necessários em `app/src/main/assets/www/` e/ou no código Android.
2. Executar os testes afetados.
3. Executar a suíte completa antes de integração/release.
4. Abrir PR para `main` ou para a branch de integração explicitamente ativa.
5. Só incrementar a versão quando houver uma distribuição instalável a ser publicada.

A versão não é definida diretamente em `app/build.gradle`. O Gradle consome as propriedades de `gradle.properties`.

## QA

Instalação das dependências web:

```bash
npm ci
npx playwright install chromium
```

Suíte Playwright completa:

```bash
npm run test:qa
```

Os gates estáticos, importadores, arquitetura e benchmarks adicionais estão definidos em `package.json` e no workflow `.github/workflows/qa.yml`.

## Build Android

Build local de Debug:

```bash
gradle :app:assembleDebug
```

O workflow `.github/workflows/build-apk.yml` também permite build pelo GitHub Actions. Pushes em `main` e execução manual geram o APK Debug; tags `v*` válidas acionam a etapa Release assinada e a publicação dos artefatos.

## Release

Antes de uma distribuição:

1. incrementar `SFP_VERSION_CODE` em `gradle.properties`;
2. atualizar `SFP_VERSION_NAME`;
3. concluir QA/CI;
4. integrar o commit na `main`;
5. criar a tag correspondente (`v<SFP_VERSION_NAME>`).

O fluxo completo, incluindo assinatura, hashes e AAB, está documentado em [`docs/RELEASE.md`](docs/RELEASE.md).

## Banco de dados

O SFP deve manter um nome estável de IndexedDB e fazer migrações por `schemaVersion`.
Não crie um novo banco a cada versão.

## Backup

Mesmo com atualização preservando os dados, mantenha backup JSON/criptografado periódico.

## Assinatura

Material de assinatura e segredos nunca devem ser versionados. A configuração de produção fica nos GitHub Actions secrets; consulte [`SIGNING.md`](SIGNING.md).
