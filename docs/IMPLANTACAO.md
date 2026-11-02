# Pulso v3 — roteiro de implantação

Este roteiro serve para quem vai implantar à mão pelo editor do Apps Script. Com `clasp`, os passos são equivalentes (ver o fim). Nada aqui vai para produção até a etapa 6, e cada item marcado com **[aprovação]** só acontece com o "pode seguir" do Jean no chat.

Conta usada: a dona da planilha (`jdossantos.49@gmail.com`), salvo decisão diferente do Jean.

## 1. Backup (antes de tudo)

1. Abra a planilha `Pesquisa pulso - Caju Limao`.
2. Vá em Arquivo → Fazer uma cópia. Use o nome `BACKUP Pesquisa pulso - antes da v3 - AAAA-MM-DD`, desmarque "Compartilhar com as mesmas pessoas" e salve no Drive da conta dona.
3. Cole o link da cópia no `CHANGELOG.md`, seção Backup.

A cópia contém comentários brutos. Ela não deve ser compartilhada com ninguém.

## 2. Planilha de homologação

1. Crie uma planilha nova e vazia: `Pulso v3 - HOMOLOGACAO`.
2. Para testar o histórico v2 sem copiar dados reais, crie nela as abas `Segunda-feira` e `Sexta-feira` com o mesmo cabeçalho da planilha real e umas 10 linhas inventadas.
3. Anote o id da planilha (o trecho entre `/d/` e `/edit` na URL).

## 3. Projeto PÚBLICO (teste)

1. Acesse script.google.com e crie um Novo projeto com o nome `Pulso v3 - Publico`.
2. Para cada arquivo de `apps-script/publico/`, crie um arquivo de script com o mesmo nome e cole o conteúdo: `Core`, `Dados`, `Setup`, `Publico`.
3. Em Configurações do projeto, marque "Mostrar arquivo de manifesto `appsscript.json`" e cole o conteúdo de `apps-script/publico/appsscript.json`.
4. Em Configurações do projeto → Propriedades do script, crie `PLANILHA_ID` com o id da planilha de HOMOLOGAÇÃO.
5. No editor, selecione a função `configurarPulsoV3` e clique em Executar. Autorize o acesso. O log deve terminar com "Abas históricas intactas".
6. Vá em Implantar → Nova implantação → App da Web:
   - Executar como: Eu.
   - Quem pode acessar: Qualquer pessoa.
7. Copie a URL `/exec`. Ela é a **URL pública de teste**.

## 4. Projeto PAINEL (teste)

1. Crie um Novo projeto com o nome `Pulso v3 - Painel`.
2. Cole os arquivos de `apps-script/painel/`. Os scripts são `Core`, `Dados`, `Setup` e `Painel`. Os arquivos HTML são `Painel`, `Negado` e `Estilo`. Cole também o `appsscript.json`.
3. Em Propriedades do script, crie:
   - `PLANILHA_ID`, com o id da planilha de HOMOLOGAÇÃO;
   - `ALLOWLIST`, com `jeanbrito@cajupar.com, jbrito.49@gmail.com, botecocajulimao@gmail.com, jdossantos.49@gmail.com` (ajustar conforme a decisão sobre a conta compartilhada).
4. Vá em Implantar → Nova implantação → App da Web:
   - Executar como: Usuário que acessa o app da Web.
   - Quem pode acessar: Qualquer pessoa com Conta do Google.
5. Copie a URL `/exec`. Ela é a **URL do painel de teste**.
6. **[aprovação]** Compartilhe a planilha de HOMOLOGAÇÃO como Editor com as contas da allowlist. Como o painel executa como quem acessa, sem isso ninguém consegue ler.

## 5. Front-end de teste

O GitHub Pages só publica uma branch. Para não mexer no `main`, a homologação usa um repositório separado e temporário, `caju-limao-pulse-homolog`, com Pages ativo:

1. Copie para ele `index.html`, `mural.html`, `pulso.css` e `pulso-config.js` da branch `v3`.
2. No `pulso-config.js` desse repositório, cole a URL pública de teste.
3. Siga `docs/HOMOLOGACAO.md`.

## 6. Go-live (só com aprovação explícita)

1. **[aprovação]** Faça o backup do passo 1, se ainda não foi feito.
2. Nos dois projetos, troque `PLANILHA_ID` para o id real (ou apague a propriedade, porque o padrão já é o id real).
3. No projeto público, rode `configurarPulsoV3()` contra a planilha real. Ele só cria abas novas e confere que `Segunda-feira` e `Sexta-feira` não mudaram.
4. No projeto painel, rode `conferirHistoricoV2()` e confira no log se Comida e Empresa batem com a referência.
5. Implantar → Gerenciar implantações → Editar → Nova versão, nos dois projetos. As URLs continuam as mesmas.
6. **[aprovação]** Compartilhe a planilha real como Editor com as contas da allowlist.
7. **[aprovação]** No `main` do repositório:
   - crie a tag `v2-final` no commit atual (`2eff181`);
   - cole a URL pública definitiva em `pulso-config.js`;
   - faça o merge da `v3`;
   - para o `dashboard.html`, substitua pelo Mural ou use `docs/dashboard-redirect.html`, conforme a decisão do Jean.
8. **[aprovação]** Na planilha real, vá em Compartilhar → Acesso geral → Restrito. Isso remove o "qualquer pessoa com o link".
9. Confirme o fechamento com uma janela anônima ou `curl`:
   `https://docs.google.com/spreadsheets/d/<id>/gviz/tq?tqx=out:json` não pode devolver dados. Deve redirecionar para o login ou responder erro.
10. Deixe a implantação antiga do Apps Script (`AKfycbzzzwL0...`) ativa por 30 dias, para reversão. Não apague.

## Com clasp (opcional)

```bash
npm i -g @google/clasp
```

```bash
clasp login --no-localhost
```

```bash
cd apps-script/publico && clasp create --type standalone --title "Pulso v3 - Publico" && clasp push
```

```bash
cd apps-script/painel && clasp create --type standalone --title "Pulso v3 - Painel" && clasp push
```

O `.clasp.json` fica fora do Git. Rode `npm run build` antes de cada `clasp push`.
