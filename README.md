# Pesquisa Pulso — Boteco Caju Limão Asa Norte

Pesquisa semanal de clima, exclusiva do CJ AN (Grupo CAJUPAR).

| Peça | Onde | Quem acessa |
|---|---|---|
| Formulário (`index.html`) | GitHub Pages | Equipe, sem login |
| Mural da equipe (`mural.html`) | GitHub Pages | Equipe, sem login; só conteúdo revisado |
| API pública (`apps-script/publico`) | Apps Script, executa como dona da planilha | Recebe envios e entrega o Mural; nunca devolve respostas ou comentários |
| Painel interno (`apps-script/painel`) | Apps Script `HtmlService`, executa como quem acessa | Só e-mails da `ALLOWLIST` (Script Properties) |

O código-fonte do Apps Script fica em `apps-script/src`. Rode `npm run build` para gerar as duas pastas implantáveis.

```bash
npm test
```

```bash
npm run e2e
```

```bash
node tools/sim/server.js 8787
```

O último comando sobe a simulação local com dados sintéticos. O painel fica em `/painel?como=jeanbrito@cajupar.com`.

Documentos: `CHANGELOG.md`, `docs/IMPLANTACAO.md`, `docs/HOMOLOGACAO.md`, `docs/REVERSAO.md`.
