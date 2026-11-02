'use strict';
/*
 * Servidor de SIMULAÇÃO local do Pulso v3.
 *   node tools/sim/server.js [porta]
 *
 * Roda o código real de apps-script/publico e apps-script/painel sobre os
 * serviços simulados de fake-google.js, com dados SINTÉTICOS (nenhum dado
 * real da planilha). Serve também index.html e dashboard.html como no Pages.
 *
 *   /index.html, /dashboard.html      páginas públicas
 *   /exec                         implantação pública simulada (GET/POST)
 *   /painel?como=<email>          painel interno, simulando a sessão Google
 *   /__sim/aba?nome=<aba>         (só simulação) leitura da aba para os testes
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { carregarProjeto, novoEstado } = require('./fake-google');

const raiz = path.join(__dirname, '..', '..');
const ALLOWLIST = 'jeanbrito@cajupar.com, jbrito.49@gmail.com, jdossantos.49@gmail.com';

function criar() {
  const estado = novoEstado();
  estado.props.ALLOWLIST = ALLOWLIST;
  const publico = carregarProjeto(path.join(raiz, 'apps-script', 'publico'), estado);
  const painel = carregarProjeto(path.join(raiz, 'apps-script', 'painel'), estado);
  semear(estado, publico);
  return { estado, publico, painel };
}

/* Gerador determinístico. */
function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function semear(estado, publico) {
  const ss = estado.ss;
  // Abas v2 sintéticas (mesmo layout da planilha real: Data, Horario, 3 notas, Media, Comentario).
  const r = rng(11);
  const seg = [['Data', 'Horario', 'Chegada (1-5)', 'Disposicao (1-5)', 'Engajamento (1-5)', 'Media', 'Comentario']];
  const sex = [['Data', 'Horario', 'Comida (1-5)', 'Lideranca (1-5)', 'Empresa (1-5)', 'Media', 'Comentario']];
  for (let m = 4; m <= 10; m++) {
    for (let i = 0; i < 12; i++) {
      const d = String(1 + Math.floor(r() * 27)).padStart(2, '0') + '/' + String(m).padStart(2, '0') + '/2026';
      const n = () => 1 + Math.floor(r() * 5);
      seg.push([d, '10:00', n(), n(), n(), new Date(2026, 2, 7), '']);
      sex.push([d, '18:00', n(), n(), n(), new Date(2026, 2, 7), '']);
    }
  }
  ss.insertSheet('Segunda-feira').rows = seg;
  ss.insertSheet('Sexta-feira').rows = sex;

  publico.configurarPulsoV3();

  // Respostas v3 sintéticas nas últimas 8 semanas, gravadas pelo mesmo caminho de formato.
  const hoje = publico.hojeSP_();
  const areas = ['Front', 'Front', 'Back', 'Back', '', 'CPD'];
  let k = 0;
  for (let w = 0; w < 8; w++) {
    const dia = publico.somarDias(hoje, -7 * w);
    const n = [9, 7, 8, 6, 7, 5, 8, 6][w];
    for (let i = 0; i < n; i++) {
      const area = w < 4 && areas[i % areas.length] === 'CPD' && k++ > 1 ? '' : areas[i % areas.length];
      const nota = () => Math.max(1, Math.min(5, Math.round(3 + (r() - 0.5) * 3.5)));
      publico.gravarLinha_('Respostas_v3', ['S' + w + '_' + i, dia, publico.semanaIso(dia), 'v3', area, nota(), nota(), nota(), nota(), nota(), 'FALSE'], 'fim');
    }
  }
}

function iniciar(porta) {
  let app = criar();
  const tipos = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let corpo = '';
    req.on('data', c => { corpo += c; });
    req.on('end', () => {
      try {
        if (url.pathname === '/exec') {
          app.estado.email = ''; // implantação pública: nunca há sessão do usuário
          const parameter = Object.fromEntries(url.searchParams);
          const out = req.method === 'POST'
            ? app.publico.doPost({ parameter, postData: { contents: corpo, type: req.headers['content-type'] } })
            : app.publico.doGet({ parameter });
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          return res.end(out.content);
        }
        if (url.pathname === '/painel') {
          app.estado.email = (url.searchParams.get('como') || '').toLowerCase();
          let html = app.painel.doGet().getContent();
          const como = JSON.stringify(app.estado.email);
          const shim = '<script>(function(){var COMO=' + como + ';function novo(){var ok=function(){},falha=function(){};var p=new Proxy({},{get:function(t,fn){if(fn==="withSuccessHandler")return function(f){ok=f;return p;};if(fn==="withFailureHandler")return function(f){falha=f;return p;};return function(){var args=Array.prototype.slice.call(arguments);fetch("/painel/run",{method:"POST",body:JSON.stringify({fn:fn,args:args,como:COMO})}).then(function(r){return r.json();}).then(function(r){if(r&&r.__erro)falha(new Error(r.__erro));else ok(r);}).catch(falha);};}});return p;}window.google={script:{get run(){return novo();}}};})();</script>';
          html = html.replace('</head>', shim + '</head>');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(html);
        }
        if (url.pathname === '/painel/run' && req.method === 'POST') {
          const p = JSON.parse(corpo);
          app.estado.email = String(p.como || '').toLowerCase();
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          // Como no Apps Script: funções terminadas em _ não podem ser chamadas pelo navegador.
          if (typeof p.fn !== 'string' || p.fn.endsWith('_') || typeof app.painel[p.fn] !== 'function' || !/^painel/.test(p.fn)) {
            return res.end(JSON.stringify({ __erro: 'Função indisponível: ' + p.fn }));
          }
          try {
            return res.end(JSON.stringify(app.painel[p.fn].apply(null, p.args || [])));
          } catch (e) {
            return res.end(JSON.stringify({ __erro: e.message }));
          }
        }
        if (url.pathname === '/__sim/aba') {
          const sh = app.estado.ss.getSheetByName(url.searchParams.get('nome'));
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify(sh ? { rows: sh.rows, escritas: sh.escritas } : null));
        }
        if (url.pathname === '/__sim/alerta') {
          // Semeia uma semana anterior ruim (dados sintéticos) e roda o alerta.
          const semanaPassada = app.publico.somarDias(app.publico.hojeSP_(), -7);
          for (let i = 0; i < 6; i++) app.publico.gravarLinha_('Respostas_v3', ['AL' + i, semanaPassada, app.publico.semanaIso(semanaPassada), 'v3', '', 1, 2, 2, 3, 4, 'FALSE'], 'fim');
          app.publico.instalarAlertaSemanal();
          app.publico.instalarAlertaSemanal(); // idempotente
          const av = app.publico.verificarAlertas();
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ av, emails: app.estado.emails || [], gatilhos: app.estado.gatilhos || [] }));
        }
        if (url.pathname === '/__sim/reiniciar') {
          app = criar();
          res.writeHead(200);
          return res.end('ok');
        }
        if (url.pathname === '/pulso-config.js') {
          res.writeHead(200, { 'Content-Type': tipos['.js'] });
          return res.end('window.PULSO_API = location.origin + "/exec";\n');
        }
        const arquivo = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        if (!['index.html', 'dashboard.html', 'pulso.css'].includes(arquivo)) {
          res.writeHead(404);
          return res.end('não encontrado');
        }
        res.writeHead(200, { 'Content-Type': tipos[path.extname(arquivo)] });
        return res.end(fs.readFileSync(path.join(raiz, arquivo)));
      } catch (e) {
        console.error(e);
        res.writeHead(500);
        res.end('erro na simulação: ' + e.message);
      }
    });
  });
  return new Promise(ok => servidor.listen(porta, () => ok(servidor)));
}

module.exports = { iniciar };

if (require.main === module) {
  const porta = Number(process.argv[2] || 8787);
  iniciar(porta).then(() => console.log('Simulação local em http://localhost:' + porta + '  (painel: /painel?como=jeanbrito@cajupar.com)'));
}
