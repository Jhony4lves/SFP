# Compilar o SFP sem PC

1. Crie um repositório privado no GitHub.
2. Envie o conteúdo desta pasta para a raiz do repositório.
3. Abra **Actions > Build SFP Android > Run workflow**.
4. O job `build-debug` gera um APK para teste.

Para a versão definitiva que atualiza por cima da anterior, configure os quatro secrets descritos em `SIGNING.md` e baixe o artefato `SFP-release-apk`.

O package de produção é sempre `com.jhony.sfp`. Nunca altere esse valor.
