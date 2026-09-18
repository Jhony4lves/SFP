# Higiene do repositório SFP

Este documento define o ciclo de vida esperado de branches, Pull Requests, workflows e artefatos do SFP. O objetivo é evitar que ferramentas temporárias e linhas de desenvolvimento já encerradas voltem a se acumular.

## Fonte de verdade

- `main` é a branch principal e deve representar a linha estável integrada.
- Versões Android são definidas em `gradle.properties`.
- O QA oficial é `.github/workflows/qa.yml`.
- O build/release Android oficial é `.github/workflows/build-apk.yml`.
- Releases estáveis publicadas e suas tags são pontos de rollback e não devem ser removidas como limpeza rotineira.

## Branches

Crie branches para trabalho ativo e mantenha nomes que indiquem a intenção (`feat/`, `fix/`, `qa/`, `chore/`, `release/`).

Depois que o trabalho for incorporado ou comprovadamente substituído:

1. confirme que não existem commits exclusivos necessários;
2. confirme que a branch não é base de outra PR ativa;
3. confirme que não é um checkpoint deliberado de rollback;
4. remova a branch remota.

Branches `tmp-*`, diagnósticas, de build pontual e RC antigas não devem permanecer indefinidamente.

## Pull Requests e issues

- PRs temporárias ou de diagnóstico devem declarar isso no corpo e ser fechadas quando cumprirem o objetivo.
- Se uma PR substituir outra, registre a relação antes de fechar a anterior.
- Não mantenha PRs concorrentes para a mesma correção quando uma implementação posterior já contém toda a cobertura necessária.
- Antes de abrir uma issue, pesquise se já existe uma equivalente.
- Roadmaps superseded devem apontar para o roadmap vigente antes de serem fechados.

## GitHub Actions

Workflows permanentes devem ser poucos e previsíveis. A estrutura oficial é composta pelo QA e pelo build/release Android, além de gates específicos que tenham uso recorrente comprovado.

Workflows usados uma única vez devem:

1. ter nome terminado em `-once.yml`;
2. limitar o gatilho à branch necessária;
3. validar a alteração focada;
4. remover a si próprios e quaisquer scripts temporários ao concluir com sucesso.

Um workflow one-shot que permaneceu no repositório depois de cumprir sua função é resíduo técnico e deve ser investigado para remoção.

## QA

- Não remova um teste apenas por estar falhando.
- Primeiro determine se a falha está no produto, no teste ou no ambiente.
- Testes de regressão que protegem integridade financeira, persistência, importação, Open Finance ou navegação devem ser preservados enquanto o comportamento continuar válido.
- Evite executar a mesma suíte duas vezes no mesmo gate sem benefício explícito.
- Testes específicos podem ser usados para feedback rápido, mas integração/release deve continuar passando pelo gate completo apropriado.

## Artefatos e arquivos gerados

APKs, AABs, relatórios Playwright, caches, logs, dumps, backups locais e arquivos temporários não pertencem ao código-fonte. Use artifacts do GitHub Actions para saídas efêmeras e releases para distribuições permanentes.

Se um script temporário se tornar recorrente, transforme-o em ferramenta oficial com nome estável, documentação e testes. Caso contrário, remova-o depois do uso.

## Releases

Preserve releases estáveis e marcos necessários para rollback. Builds Debug, QA e experimentais são descartáveis por padrão e não devem ser tratados como releases permanentes.

## Regra de segurança

Antiguidade, nome feio ou falha atual não são evidência suficiente para exclusão. Antes de remover qualquer item relevante, confirme referências, dependências, histórico exclusivo e uso por branches/PRs/workflows ativos.
