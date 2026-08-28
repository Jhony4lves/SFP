# SFP — processo de release Android

## Fonte de versão

A versão Android é definida somente em `gradle.properties`:

- `SFP_VERSION_CODE`: inteiro estritamente crescente para cada distribuição instalável.
- `SFP_VERSION_NAME`: versão legível, seguindo SemVer/pré-release quando aplicável.

O `app/build.gradle` consome essas propriedades. O app não deve manter uma segunda versão hardcoded.

## Canais

### Debug

- application id: `com.jhony.sfp.debug`
- uso: QA e desenvolvimento
- pode coexistir com a instalação Release
- os dados locais não são compartilhados automaticamente com Release

### Release

- application id: `com.jhony.sfp`
- uso: Beta/produção
- assinado pela keystore estável armazenada exclusivamente nos GitHub Actions secrets
- futuras atualizações precisam manter o mesmo application id, a mesma chave de assinatura e um `versionCode` maior

## Build no GitHub Actions

O workflow `.github/workflows/build-apk.yml` gera:

- APK Release assinado
- Android App Bundle (AAB) assinado
- `SHA256SUMS.txt`
- `SIGNING-CERT.txt` com informações públicas do certificado usado para assinatura
- `RELEASE-METADATA.txt` com versão, commit, ref e workflow run

Nenhuma keystore ou senha deve ser adicionada ao repositório.

## Publicação por tag

Para publicar uma versão, o commit da versão deve estar integrado à branch principal e a tag deve corresponder exatamente ao `SFP_VERSION_NAME`:

```text
SFP_VERSION_NAME=2.1.0-beta.1
Tag: v2.1.0-beta.1
```

Ao receber uma tag `v*`, o workflow valida a correspondência, recompila e assina os artefatos e cria/atualiza a GitHub Release. Versões cujo nome contém `-` são publicadas como prerelease.

## Regra de atualização

Antes de cada nova distribuição:

1. incrementar `SFP_VERSION_CODE`;
2. atualizar `SFP_VERSION_NAME`;
3. executar QA/CI;
4. confirmar assinatura do APK;
5. confirmar hashes dos artefatos;
6. somente então criar a tag correspondente.

## Migração Debug → Release

Debug e Release possuem application ids diferentes. Portanto uma instalação Release não substitui a Debug e não herda automaticamente o IndexedDB/WebView da Debug. Enquanto o app for local-first, a passagem entre canais deve ser feita por backup/exportação e restauração, nunca presumindo compartilhamento automático dos dados.
