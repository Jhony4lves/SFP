# SFP 2.2.0

Release estável promovida em 02/09/2026 a partir da RC14 fisicamente validada no Galaxy S24.

## Destaques

- Sophy A3 proativa, explicável, determinística e compatível com modo de privacidade;
- motor read-only de planejamento “E se?” com comparação entre cenário atual e simulado;
- revisão mobile de importações financeiras;
- importação local de extratos CSV, OFX e PDF textual;
- parser que diferencia valor da movimentação de saldo acumulado;
- classificação automática com aprendizado local e importação idempotente;
- correção de transferências históricas para preservar saldos atuais;
- importação de faturas CSV/OFX/PDF com validação por total, vencimento e ciclo;
- desbloqueio local de PDFs bancários protegidos por senha;
- leitura de faturas por imagens JPG/JPEG/PNG/WebP com OCR local no Android;
- interpretação do carrossel mensal do Itaú sem transformar totais em lançamentos;
- associação correta de compras, datas e parcelas na captura aberta do Itaú;
- preservação do cartão e mês da fatura durante pagamento e re-renderização;
- reconciliação do resumo `Pago` a partir do ledger e neutralização segura de pagamentos manuais repetidos acima do total oficial.

## Validação física final

RC14 instalada por cima da RC13 sem limpar dados:

- Itaú Click / Agosto de 2026 permaneceu selecionado corretamente;
- fatura de agosto reconhecida como paga;
- `Pago` reconciliado em R$ 74,25;
- pagamentos manuais repetidos não triplicaram o impacto no caixa;
- estado permaneceu correto após fechar e abrir o aplicativo;
- nenhum dado antigo foi perdido no teste físico.

## Qualidade

A árvore fisicamente validada foi novamente submetida ao SFP QA Lab antes da integração em `main`, com Web QA e Android QA aprovados. A promoção para 2.2.0 altera apenas versionamento e documentação, sem mudança funcional.
