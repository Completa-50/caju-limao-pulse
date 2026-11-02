# Pulso v3 — checklist de homologação na implantação real

Os testes automatizados (`npm test` e `npm run e2e`) rodam contra uma simulação local. Este checklist repete os mesmos pontos na implantação de teste de verdade, antes do go-live. Para cada item, anote OK ou falha e guarde um print.

| # | Teste | Como | Esperado |
|---|---|---|---|
| 1 | Envio válido | Responda o formulário de teste completo. | "Recebido. Obrigado!", e uma linha nova em `Respostas_v3`, com data `aaaa-mm-dd` em texto e notas numéricas. |
| 2 | Envio inválido | Com o celular em modo avião, clique em Enviar. | A mensagem de erro aparece, as respostas continuam na tela, e o reenvio funciona quando a rede volta. |
| 3 | Ofensa | Escreva um palavrão em "O que precisa melhorar?". | O aviso aparece. "Reescrever" não grava nada. "Enviar assim mesmo" grava com `flag_ofensa=TRUE`. |
| 4 | `?teste=1` | Envie pelo endereço `index.html?teste=1`. | A faixa MODO TESTE aparece, `teste=TRUE`, e o n do painel e do Mural não muda. |
| 5 | Allowlist | Abra a URL do painel com uma conta Google fora da lista. | "Acesso negado", sem nenhum número ou texto da pesquisa. |
| 6 | Painel | Abra com `jeanbrito@cajupar.com`. | "Conectado como jeanbrito@cajupar.com", com 5 cards. Uma área com menos de 5 respostas mostra "Dados insuficientes". |
| 7 | Moderação | Teste publicar (tentando sem editar, depois editando), encaminhar ao RH, arquivar e virar ação. | Cada ação gera uma linha em `Log_Moderacao` com o e-mail de quem fez. |
| 8 | Mural | Abra `mural.html`. | Só aparece o que foi publicado. Nada da fila, do RH ou de testes. |
| 9 | XSS | Envie o comentário `<img src=x onerror=alert(1)>`. | Aparece como texto no painel e não dispara alerta. |
| 10 | 390 px | Abra as três páginas num celular (ou no DevTools a 390 px). | Nada rola na horizontal. |
| 11 | Rota pública | Abra `URL_PUBLICA?acao=mural` e `URL_PUBLICA?acao=respostas`. | A primeira traz só o conteúdo do Mural. A segunda responde `{"ok":false}`. |
| 12 | Apoiar | Apoie uma sugestão e recarregue a página. | O contador sobe 1 e o botão continua "Apoiado". |
| 13 | Histórico | Na planilha real (só leitura), rode `conferirHistoricoV2()`. | Comida e Empresa mostram `[CONFERE]`. |
| 14 | GViz fechado | Depois do go-live, abra o endereço GViz numa janela anônima. | Login ou erro, sem nenhum dado. |
