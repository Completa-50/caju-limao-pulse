'use strict';
/*
 * Gera apps-script/publico e apps-script/painel a partir de apps-script/src.
 * Cada pasta é um projeto Apps Script independente (para clasp ou para colar
 * no editor). Rode: npm run build
 */
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
const src = path.join(raiz, 'apps-script', 'src');

const comum = ['Core.js', 'Dados.js', 'Setup.js'];
const projetos = {
  publico: {
    arquivos: [...comum, 'Publico.js'],
    manifesto: {
      timeZone: 'America/Sao_Paulo',
      runtimeVersion: 'V8',
      exceptionLogging: 'STACKDRIVER',
      oauthScopes: ['https://www.googleapis.com/auth/spreadsheets'],
      webapp: { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' }
    }
  },
  painel: {
    arquivos: [...comum, 'Painel.js', 'Painel.html', 'Negado.html'],
    estilo: true,
    manifesto: {
      timeZone: 'America/Sao_Paulo',
      runtimeVersion: 'V8',
      exceptionLogging: 'STACKDRIVER',
      oauthScopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/userinfo.email'
      ],
      webapp: { executeAs: 'USER_ACCESSING', access: 'ANYONE' }
    }
  }
};

for (const [nome, cfg] of Object.entries(projetos)) {
  const destino = path.join(raiz, 'apps-script', nome);
  fs.rmSync(destino, { recursive: true, force: true });
  fs.mkdirSync(destino, { recursive: true });
  for (const f of cfg.arquivos) fs.copyFileSync(path.join(src, f), path.join(destino, f));
  if (cfg.estilo) {
    const css = fs.readFileSync(path.join(raiz, 'pulso.css'), 'utf8');
    fs.writeFileSync(path.join(destino, 'Estilo.html'), '<style>\n' + css + '\n</style>\n');
  }
  fs.writeFileSync(path.join(destino, 'appsscript.json'), JSON.stringify(cfg.manifesto, null, 2) + '\n');
  fs.writeFileSync(path.join(destino, 'LEIA-ME.txt'),
    'Arquivo gerado por tools/build.js. Não edite aqui: edite apps-script/src e rode npm run build.\n');
  console.log('gerado: apps-script/' + nome + ' (' + fs.readdirSync(destino).length + ' arquivos)');
}
