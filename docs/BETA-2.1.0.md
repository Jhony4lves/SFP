# SFP 2.1.0 Beta

## Objetivo desta fase

Transformar a base estabilizada após a rodada funcional da Issue #32 em um canal de distribuição Android previsível e atualizável, sem ampliar o escopo funcional do SFP.

## Beta 1

Versão planejada: `2.1.0-beta.1`

Esta Beta introduz infraestrutura de distribuição, não novas funções financeiras:

- versão Android centralizada;
- `versionCode` monotônico;
- APK Release assinado pela chave estável já configurada no GitHub Actions;
- AAB Release;
- verificação da assinatura do APK;
- checksum SHA-256 dos artefatos;
- metadados do build;
- publicação de GitHub Release a partir de tag compatível;
- documentação explícita da separação entre os canais Debug e Release.

## Estado da estabilização funcional

A Issue #32 permanece aberta e a R1 física fica adiada, não descartada. Esta fase de Release Engineering não deve ser interpretada como certificação de ausência de bugs funcionais.

## Próxima etapa depois da Beta 1

Depois de validar o pipeline e o APK Release assinado, o desenvolvimento pode seguir para a próxima rodada funcional/produto. A R1 física pode ser retomada posteriormente usando uma build Release versionada em vez de builds debug avulsas.
