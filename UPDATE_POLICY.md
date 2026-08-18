# Política de Atualizações do SFP

Objetivo: atualizar constantemente sem perder dados e continuar funcionando offline.

## App
Package fixo: `com.jhony.sfp`

## Dados
- Persistem no WebView/IndexedDB do pacote Android.
- Atualizações NÃO limpam os dados.
- Mudanças de estrutura devem usar `schemaVersion`.
- Antes de migrações grandes, o SFP deve criar snapshot automático.

## Atualização
Inicialmente: baixar o APK novo e instalar por cima.
Futuro: adicionar verificação opcional de uma `version.json` hospedada. Se não houver internet, nada muda; o app continua abrindo a versão local.

## Falha de atualização
A interface local nunca depende de CDN, API ou servidor para abrir.
Se uma checagem de versão falhar, o SFP ignora o erro e continua funcionando.

## Regra de ouro
Código pode ser atualizado; banco do usuário é preservado.
