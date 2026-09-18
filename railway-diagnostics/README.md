# SFP Open Finance Diagnostics

Servico isolado de diagnostico para comparar snapshots do provedor com a verdade financeira calculada pelo SFP.

## Seguranca
- nao persiste dados;
- nao aceita nem precisa de credenciais Pluggy;
- campos de segredo sao removidos;
- identificadores sao hashados;
- descricoes, documentos e contrapartes sao removidos;
- payload maximo: 512 KiB.

## Endpoints
- GET /health
- POST /v1/openfinance/diagnostics

## Objetivo inicial
Detectar automaticamente divergencias de:
- saldo de conta;
- limite usado vs. limite disponivel;
- composicao fatura atual + compromissos futuros;
- ciclo do cartao;
- cronograma de emprestimo vs. saldo devedor.

Este servico e diagnostico. Ele nao altera o estado financeiro do SFP nem chama a Pluggy.
