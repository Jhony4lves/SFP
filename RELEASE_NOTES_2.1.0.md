# SFP 2.1.0

Primeira release estável do ciclo 2.1 após a rodada extensa de estabilização e validação física da Issue #32.

## Destaques

- navegação mobile revisada e validada fisicamente;
- dropdowns customizados do SFP em fluxos estáticos e dinâmicos;
- dropdowns respeitando viewport e bottom navigation durante scroll;
- transição suave com histerese ao trocar o posicionamento acima/abaixo;
- categorias de Receita/Despesa coerentes nos fluxos cobertos;
- revisão de classificação exibindo descrição, valor e data;
- Sophy protegida contra datas ISO interpretadas como aritmética;
- Sophy contextual para alertas financeiros concretos;
- endurecimento da persistência da configuração Groq/Android Keystore;
- melhorias de clipping, labels, responsividade e densidade dos formulários mobile;
- preservação dos contratos financeiros, IndexedDB e dados existentes.

## Validação

- Issue #32 encerrada como concluída após testes físicos no Galaxy S24;
- RC4 (`2.1.0-rc.4`, versionCode 8) aprovada fisicamente;
- Build SFP Android #95 na `main` aprovado em debug e release assinada;
- nenhuma regressão P0/P1 conhecida no momento da promoção.

## Android

- `versionName`: `2.1.0`
- `versionCode`: `9`
- package release: `com.jhony.sfp`
- assinatura: mesma identidade do canal release anterior, permitindo atualização por cima.

## Política pós-release

Achados após esta versão devem ser abertos como Issues independentes. A release 2.1.0 não reabre a rodada monolítica da Issue #32.
