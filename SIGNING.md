# Assinatura de Produção — IMPORTANTE

Para o SFP receber atualizações por cima da instalação existente, todas as versões de produção precisam ser assinadas pela mesma chave.

Não incluí uma chave privada neste projeto de propósito.

Quando formos gerar o primeiro APK definitivo:
1. crie uma keystore única;
2. escolha uma senha forte;
3. faça pelo menos duas cópias da keystore;
4. não publique a keystore nem a senha;
5. configure a mesma chave em todos os builds futuros.

Se você perder a chave, o Android não permitirá atualizar o APK instalado com outra assinatura.
