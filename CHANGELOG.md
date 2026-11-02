# Changelog — Pesquisa Pulso (Boteco Caju Limão Asa Norte)

## v3 — em homologação (branch `v3`, ainda não publicada)

### Backup
- **Pendente.** Cópia da planilha `Pesquisa pulso - Caju Limao` (id `1RJxUPC_bPwy6HogjoEzBi6YntZBChClz9hirctY6U_M`) ainda não feita. Registrar aqui o link da cópia antes de rodar `configurarPulsoV3()` na planilha real.
  - Link da cópia: _(preencher)_
  - Feita por / em: _(preencher)_

### O que muda
- Formulário único semanal com 5 perguntas (textos do protótipo aprovado em 24/10/2026), área opcional e três campos abertos com até 600 caracteres.
- Envio por `fetch` POST `text/plain`. "Recebido" só aparece com `{ok:true}` do servidor; em erro, a mensagem aparece e as respostas continuam na tela para reenviar. Fim do `no-cors`.
- Fim do `?preview`. `?teste=1` grava com `teste=TRUE`, que fica fora de todo indicador e do Mural.
- Aviso de linguagem ofensiva com "Reescrever" / "Enviar assim mesmo". A lista de termos fica só no servidor; o servidor responde `ofensa:true` sem gravar e o formulário pergunta.
- Validação no servidor (notas inteiras 1–5, área, tipos, tamanhos), honeypot, limite de corpo de 6.000 caracteres, limite global de envios por minuto via `CacheService` e `LockService` nas escritas. Nenhum dado de identificação é usado.
- Abas novas: `Respostas_v3`, `Comentarios_v3`, `Mural_Publicado`, `Log_Moderacao`, `Config`. Formato explícito por coluna (`@` texto, `0` inteiro), o que impede o defeito da coluna `Media` da v2. Sem horário, sem média gravada.
- Comentários gravados em posição aleatória da aba, com id aleatório, para que a ordem das linhas não permita casar comentário e resposta.
- Painel interno em `HtmlService` com allowlist em Script Properties, revalidada em toda chamada do navegador. Visão geral por pergunta (média, distribuição, % 1–2 e 4–5, n), supressão por `NMIN` inclusive por área, volume semanal; sem média geral, sem comparação entre perguntas, sem semáforo.
- Fila de moderação: publicar (exige edição do texto, recusa ofensa, pede confirmação de provável nome), encaminhar ao RH, arquivar, virar ação. Ações com status alterável, comunicados, histórico v2 por bimestre. Toda escrita vai para `Log_Moderacao` com o e-mail de quem fez.
- Mural público (`mural.html`) lendo só `?acao=mural`: ações, comunicados, médias das últimas 4 semanas com n ≥ `NMIN` (sem área), elogios, ponderações e sugestões com "Apoiar". Card do Quiz e seção "Aprenda e cresça" só com a Flash (Universidade Caju removida em 02/11/2026).
- Todo texto vindo de dados entra no DOM por `textContent`.

### Diferenças deliberadas em relação ao prompt/protótipo
- `Comentarios_v3` tem uma 10ª coluna `teste`, para que comentários de `?teste=1` não cheguem ao Mural (o servidor recusa publicá-los).
- `Config` tem a chave extra `CANAL_GRAVE_ROTULO` (texto exibido do número).
- "lixo" saiu da lista de termos ofensivos (palavra comum em relato operacional); termos longos batem por início de palavra, então "disputa", "desviado" e "reputação" não disparam.
- Médias com 2 casas arredondam empate para o par (4,125 → 4,12), mesma convenção dos valores de referência.
- O servidor recusa publicar texto idêntico ao original ("o texto original nunca é publicado").
- O botão "Sair" limpa o painel na aba e oferece sair da conta Google (o Apps Script não encerra sessão Google sozinho).

### Testes
- `npm test`: 23 testes unitários das funções puras.
- `npm run e2e`: 15 testes Playwright contra a simulação local (código real do Apps Script sobre serviços simulados e dados sintéticos). Prints em `evidencias/`.
- Pendente: repetir o roteiro em `docs/HOMOLOGACAO.md` na implantação de teste real e rodar `conferirHistoricoV2()` na planilha real.

## v2 — em produção até o go-live da v3
- `index.html` com formulários de segunda e sexta, `dashboard.html` lendo a planilha pelo GViz público. Commit de referência: `2eff181`.
