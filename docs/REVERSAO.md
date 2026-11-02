# Pulso v3 — reversão em menos de 10 minutos

A v3 não apaga nem altera nada da v2. A implantação antiga do Apps Script continua ativa e grava nas abas `Segunda-feira` e `Sexta-feira`, como antes. Voltar é só apontar o site de novo para o formulário antigo.

## Passos

1. No GitHub, abra o repositório `Completa-50/caju-limao-pulse` e restaure o `index.html` e o `dashboard.html` da tag `v2-final`. Pela linha de comando:
   ```bash
   git checkout main && git pull
   ```
   ```bash
   git checkout v2-final -- index.html dashboard.html && git commit -m "Reverte para o formulário v2" && git push
   ```
   Pelo site, é o mesmo resultado: abra o arquivo na tag `v2-final`, copie o conteúdo e edite o arquivo no `main`.
2. O GitHub Pages publica em 1 a 2 minutos. Abra https://completa-50.github.io/caju-limao-pulse/ e confira que o formulário de segunda/sexta voltou.
3. O formulário v2 envia para a implantação antiga (`AKfycbzzzwL0...`), que não foi alterada. Envie uma resposta de teste para confirmar.

## O que NÃO precisa ser desfeito

- As abas v3 podem ficar onde estão. Elas não interferem na v2.
- Os projetos v3 do Apps Script podem continuar implantados. Sem o site apontando para eles, não recebem nada.
- As respostas recebidas pela v3 continuam em `Respostas_v3` e `Comentarios_v3`. Nenhum dado se perde.

## Atenção sobre o link público

O `dashboard.html` antigo só funciona com a planilha aberta para "qualquer pessoa com o link". Reabrir esse acesso volta a expor respostas e comentários brutos. Por isso a recomendação é reverter só o formulário e deixar a planilha restrita. O painel da v3 continua servindo para leitura.
