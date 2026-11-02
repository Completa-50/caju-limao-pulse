'use strict';
/*
 * Testes de ponta a ponta do Pulso v3 contra a SIMULAÇÃO LOCAL (tools/sim).
 * Executa o código real do Apps Script sobre serviços simulados e dados
 * sintéticos. O mesmo roteiro deve ser repetido na implantação de teste real
 * (ver docs/HOMOLOGACAO.md) antes do go-live.
 *
 *   node tests/e2e/run.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { iniciar } = require('../../tools/sim/server');

const PORTA = 8799;
const BASE = 'http://localhost:' + PORTA;
const EVID = path.join(__dirname, '..', '..', 'evidencias');
const JEAN = 'jeanbrito@cajupar.com';
fs.mkdirSync(EVID, { recursive: true });

let servidor, browser;
const dialogos = [];

async function aba(nome) { return (await (await fetch(BASE + '/__sim/aba?nome=' + nome)).json()).rows; }
async function mural() { return (await fetch(BASE + '/exec?acao=mural')).json(); }
async function post(obj) { return (await fetch(BASE + '/exec', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(obj) })).json(); }
const NOTAS = { disposicao: 4, escala: 3, comida: 4, lideranca: 2, empresa: 5 };

async function novaPagina(largura = 1280) {
  const ctx = await browser.newContext({ viewport: { width: largura, height: 900 } });
  const page = await ctx.newPage();
  page.on('dialog', d => { dialogos.push(d.message()); d.dismiss(); });
  page.on('pageerror', e => { throw e; });
  return page;
}

async function responderNotas(page, notas = NOTAS) {
  const grupos = page.locator('.scale');
  const ordem = ['disposicao', 'escala', 'comida', 'lideranca', 'empresa'];
  for (let i = 0; i < 5; i++) await grupos.nth(i).locator('button').nth(notas[ordem[i]] - 1).click();
}

async function semRolagemHorizontal(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

test.before(async () => {
  servidor = await iniciar(PORTA);
  browser = await chromium.launch();
});
test.after(async () => {
  await browser.close();
  servidor.close();
});

test('formulário: envio válido grava e só então mostra "Recebido"', async () => {
  const antes = (await aba('Respostas_v3')).length;
  const page = await novaPagina(390);
  await page.goto(BASE + '/index.html');
  await page.screenshot({ path: path.join(EVID, 'form-390.png'), fullPage: true });
  await responderNotas(page);
  await page.click('#area button[data-v="Back"]');
  await page.fill('#t-elogio', 'A refeição de sábado estava ótima, com duas proteínas.');
  await page.click('#send');
  await page.waitForSelector('#thanks', { state: 'visible' });
  assert.equal(await page.textContent('#thanks h1'), 'Recebido. Obrigado!');
  const rows = await aba('Respostas_v3');
  assert.equal(rows.length, antes + 1);
  const r = rows[rows.length - 1];
  assert.match(r[1], /^\d{4}-\d{2}-\d{2}$/, 'data gravada como texto aaaa-mm-dd, não como data');
  assert.match(r[2], /^\d{4}-W\d{2}$/);
  assert.equal(r[3], 'v3');
  assert.equal(r[4], 'Back');
  assert.deepEqual(r.slice(5, 10), [4, 3, 4, 2, 5], 'notas como números inteiros');
  assert.equal(r[10], 'FALSE');
  assert.equal(r.length, 11, 'sem coluna de média nem horário');
  const com = await aba('Comentarios_v3');
  assert.ok(com.some(c => c[4] === 'A refeição de sábado estava ótima, com duas proteínas.' && c[3] === 'elogio'));
  assert.ok(com.every(c => c.length === 10), 'comentário sem vínculo com a resposta');
  await page.screenshot({ path: path.join(EVID, 'form-recebido-390.png'), fullPage: true });
  await page.context().close();
});

test('formulário: erro do servidor aparece, nada some e dá para reenviar', async () => {
  const page = await novaPagina();
  await page.goto(BASE + '/index.html');
  await responderNotas(page);
  // 1) payload adulterado: servidor rejeita com mensagem clara
  await page.route('**/exec', async (route, req) => {
    if (req.method() !== 'POST') return route.continue();
    const p = JSON.parse(req.postData());
    p.notas.comida = 9;
    await route.continue({ postData: JSON.stringify(p) });
  });
  await page.click('#send');
  await page.waitForFunction(() => document.querySelector('#ferr').textContent.length > 0);
  assert.match(await page.textContent('#ferr'), /Nota inválida em "comida"/);
  assert.equal(await page.isVisible('#thanks'), false);
  await page.unroute('**/exec');
  // 2) servidor fora do ar
  await page.route('**/exec', route => route.request().method() === 'POST' ? route.abort() : route.continue());
  await page.click('#send');
  await page.waitForFunction(() => /sem conexão/.test(document.querySelector('#ferr').textContent));
  assert.equal(await page.isVisible('#thanks'), false);
  await page.unroute('**/exec');
  // 3) reenviar funciona
  await page.click('#send');
  await page.waitForSelector('#thanks', { state: 'visible' });
  await page.context().close();
});

test('formulário: validação no cliente pede as 5 notas', async () => {
  const page = await novaPagina();
  await page.goto(BASE + '/index.html');
  await page.locator('.scale').nth(0).locator('button').nth(2).click();
  await page.click('#send');
  assert.match(await page.textContent('#ferr'), /faltam 4/);
  await page.context().close();
});

test('servidor rejeita payload inválido e aplica honeypot e limite de tamanho', async () => {
  assert.equal((await post({ notas: { ...NOTAS, escala: 2.5 } })).ok, false);
  assert.equal((await post({ notas: NOTAS, area: 'Cozinha' })).ok, false);
  assert.equal((await post({ notas: NOTAS, textos: { melhora: 'x'.repeat(601) } })).ok, false);
  const grande = await (await fetch(BASE + '/exec', { method: 'POST', body: 'x'.repeat(7000) })).json();
  assert.match(grande.erro, /grande demais/);
  const lixo = await (await fetch(BASE + '/exec', { method: 'POST', body: '{nao é json' })).json();
  assert.equal(lixo.ok, false);
  const antes = (await aba('Respostas_v3')).length;
  const hp = await post({ notas: NOTAS, site: 'http://spam' });
  assert.equal(hp.ok, true);
  assert.equal((await aba('Respostas_v3')).length, antes, 'honeypot não grava');
});

test('aviso de linguagem ofensiva: reescrever não grava; enviar assim mesmo grava com flag', async () => {
  const page = await novaPagina();
  await page.goto(BASE + '/index.html');
  await responderNotas(page);
  await page.fill('#t-melhora', 'essa escala é uma merda');
  const antes = (await aba('Comentarios_v3')).length;
  await page.click('#send');
  await page.waitForSelector('#modal.on');
  await page.click('#mFix');
  assert.equal((await aba('Comentarios_v3')).length, antes, 'Reescrever não grava nada');
  await page.click('#send');
  await page.waitForSelector('#modal.on');
  await page.click('#mSend');
  await page.waitForSelector('#thanks', { state: 'visible' });
  const com = await aba('Comentarios_v3');
  const c = com.find(x => x[4] === 'essa escala é uma merda');
  assert.ok(c);
  assert.equal(c[5], 'TRUE');
  await page.context().close();
});

test('?teste=1 grava como teste e não entra em nenhum indicador', async () => {
  const muralAntes = await mural();
  const painelAntes = await (await fetch(BASE + '/painel/run', { method: 'POST', body: JSON.stringify({ fn: 'painelVisao', args: [4, 'Todas'], como: JEAN }) })).json();
  const page = await novaPagina();
  await page.goto(BASE + '/index.html?teste=1');
  assert.equal(await page.isVisible('#testeBanner'), true);
  await responderNotas(page, { disposicao: 1, escala: 1, comida: 1, lideranca: 1, empresa: 1 });
  await page.fill('#t-sug', 'comentário de teste da homologação');
  await page.click('#send');
  await page.waitForSelector('#thanks', { state: 'visible' });
  const rows = await aba('Respostas_v3');
  assert.equal(rows[rows.length - 1][10], 'TRUE');
  const muralDepois = await mural();
  assert.deepEqual(muralDepois.pulso, muralAntes.pulso);
  const painelDepois = await (await fetch(BASE + '/painel/run', { method: 'POST', body: JSON.stringify({ fn: 'painelVisao', args: [4, 'Todas'], como: JEAN }) })).json();
  assert.equal(painelDepois.n, painelAntes.n);
  // e o comentário de teste não pode ir para o Mural
  const com = (await aba('Comentarios_v3')).find(c => c[4] === 'comentário de teste da homologação');
  assert.equal(com[9], 'TRUE');
  const pub = await (await fetch(BASE + '/painel/run', { method: 'POST', body: JSON.stringify({ fn: 'painelPublicar', args: [com[0], 'sug', 'versão editada do teste', false], como: JEAN }) })).json();
  assert.equal(pub.ok, false);
  assert.match(pub.erro, /teste não vai para o Mural/);
  await page.context().close();
});

test('painel: conta fora da allowlist recebe acesso negado sem dados', async () => {
  const page = await novaPagina(390);
  await page.goto(BASE + '/painel?como=intruso@gmail.com');
  assert.equal(await page.textContent('h1'), 'Acesso negado');
  const html = await page.content();
  assert.equal(/Respostas|Comentarios|elogio|Disposição|n = /.test(html), false);
  await page.screenshot({ path: path.join(EVID, 'painel-negado-390.png'), fullPage: true });
  for (const fn of ['painelVisao', 'painelFila', 'painelHistorico', 'painelListas', 'painelArquivar']) {
    const r = await (await fetch(BASE + '/painel/run', { method: 'POST', body: JSON.stringify({ fn, args: ['todos'], como: 'intruso@gmail.com' }) })).json();
    assert.equal(r.__erro, 'Acesso negado.', fn);
  }
  const semSessao = await (await fetch(BASE + '/painel/run', { method: 'POST', body: JSON.stringify({ fn: 'painelFila', args: ['todos'], como: '' }) })).json();
  assert.equal(semSessao.__erro, 'Acesso negado.');
  await page.context().close();
});

test('painel: visão geral com supressão por NMIN, sem média geral', async () => {
  const page = await novaPagina(1280);
  await page.goto(BASE + '/painel?como=' + JEAN);
  assert.match(await page.textContent('#quem'), /jeanbrito@cajupar\.com/);
  await page.waitForSelector('#kpis .card');
  assert.equal(await page.locator('#kpis .card').count(), 5);
  assert.equal(/média geral/i.test(await page.textContent('#p-visao .grid')), false);
  await page.screenshot({ path: path.join(EVID, 'painel-visao-1280.png'), fullPage: true });
  await page.selectOption('#fArea', 'CPD');
  await page.waitForFunction(() => document.querySelectorAll('#kpis .card').length === 5 && /Dados insuficientes/.test(document.querySelector('#kpis').textContent));
  assert.equal(await page.locator('#kpis .card .dist').count(), 0, 'sem distribuição quando n < NMIN');
  await page.selectOption('#win', '8');
  await page.selectOption('#fArea', 'Todas');
  await page.waitForFunction(() => document.querySelectorAll('#vol tr').length === 8);
  await page.context().close();
});

test('moderação: publicar exige edição, pede confirmação de nome e gera log', async () => {
  const id = (await aba('Comentarios_v3')).find(c => c[4] === 'A refeição de sábado estava ótima, com duas proteínas.')[0];
  const page = await novaPagina(1280);
  await page.goto(BASE + '/painel?como=' + JEAN);
  await page.click('[data-p="p-fila"]');
  const item = page.locator('.qitem', { hasText: 'A refeição de sábado estava ótima' });
  await item.getByRole('button', { name: 'Editar e publicar', exact: true }).click();
  await page.click('#pubOk');
  await page.waitForFunction(() => /Edite o texto/.test(document.querySelector('#perr').textContent));
  await page.fill('#pubTxt', 'A refeição de sábado agradou, com Rodolfo no comando.');
  await page.click('#pubOk');
  await page.waitForFunction(() => /nome próprio/.test(document.querySelector('#perr').textContent));
  await page.click('#pubOk'); // confirma
  await page.waitForSelector('#pubModal', { state: 'hidden' });
  await page.waitForFunction(() => /publicado no Mural como elogio/i.test(document.querySelector('#log').textContent));
  assert.match(await page.textContent('#log'), /jeanbrito@cajupar\.com/);
  const com = (await aba('Comentarios_v3')).find(c => c[0] === id);
  assert.equal(com[7], 'publicado');
  assert.match(com[8], /^\d{4}-\d{2}-\d{2}$/);
  const m = await mural();
  assert.equal(m.elogios[0].texto, 'A refeição de sábado agradou, com Rodolfo no comando.');
  assert.equal(JSON.stringify(m).includes('A refeição de sábado estava ótima'), false, 'original nunca vai ao Mural');
  await page.context().close();
});

test('moderação: encaminhar ao RH, arquivar e virar ação; ação vai ao Mural', async () => {
  for (const t of ['relato para RH', 'relato para arquivar', 'falta talher no aparador no pico']) {
    assert.equal((await post({ notas: NOTAS, textos: { melhora: t } })).ok, true);
  }
  const page = await novaPagina(1280);
  await page.goto(BASE + '/painel?como=' + JEAN);
  await page.click('[data-p="p-fila"]');
  await page.locator('.qitem', { hasText: 'relato para RH' }).getByRole('button', { name: 'Encaminhar ao RH', exact: true }).click();
  await page.waitForFunction(() => !/relato para RH/.test(document.querySelector('#queue').textContent));
  await page.locator('.qitem', { hasText: 'relato para arquivar' }).getByRole('button', { name: 'Arquivar', exact: true }).click();
  await page.waitForFunction(() => !/relato para arquivar/.test(document.querySelector('#queue').textContent));
  await page.locator('.qitem', { hasText: 'falta talher' }).getByRole('button', { name: 'Virar ação', exact: true }).click();
  await page.waitForSelector('#p-acoes.on');
  assert.equal(await page.inputValue('#aOuv'), '', '"o que ouvimos" começa vazio');
  assert.match(await page.textContent('#aBase'), /Base: item C/);
  // recusa nome em "o que ouvimos"
  await page.fill('#aOuv', 'a Marcela não repõe talher');
  await page.fill('#aAcao', 'Reposição de talheres a cada 30 min no pico');
  await page.fill('#aResp', 'Gerência de Front');
  await page.click('#addAcao');
  await page.waitForFunction(() => /Evite nomes/.test(document.querySelector('#aerr').textContent));
  await page.fill('#aOuv', 'relatos de falta de talher no aparador em horário de pico');
  await page.fill('#aPrazo', '30/11');
  await page.click('#addAcao');
  await page.waitForFunction(() => /Reposição de talheres/.test(document.querySelector('#acList').textContent));
  // alterar status
  await page.locator('#acList select').first().selectOption('feito');
  await page.waitForFunction(() => /Feito/.test(document.querySelector('#acList .chip:nth-child(2)').textContent));
  // comunicado
  await page.click('[data-p="p-com"]');
  await page.fill('#cTit', 'Nova regra de intervalos');
  await page.fill('#cMsg', 'A partir de segunda, intervalos fixos por escala.');
  await page.click('#addCom');
  await page.waitForFunction(() => /Nova regra de intervalos/.test(document.querySelector('#comList').textContent));
  await page.click('[data-p="p-fila"]');
  await page.selectOption('#qf', 'todos');
  await page.waitForFunction(() => /Encaminhado ao RH/.test(document.querySelector('#queue').textContent));
  const log = await aba('Log_Moderacao');
  const acoes = log.slice(1).map(l => l[2]);
  for (const a of ['publicar', 'encaminhar_rh', 'arquivar', 'virar_acao', 'criar_acao', 'status_acao', 'criar_comunicado']) {
    assert.ok(acoes.includes(a), 'log de ' + a);
  }
  assert.ok(log.slice(1).every(l => l[1] === JEAN), 'log com e-mail de quem fez');
  const m = await mural();
  assert.equal(m.acoes[0].acao, 'Reposição de talheres a cada 30 min no pico');
  assert.equal(m.acoes[0].status, 'feito');
  assert.equal(m.comunicados[0].titulo, 'Nova regra de intervalos');
  await page.screenshot({ path: path.join(EVID, 'painel-fila-1280.png'), fullPage: true });
  await page.context().close();
});

test('XSS: comentário com <img onerror> aparece como texto no painel e no Mural', async () => {
  const ataque = '<img src=x onerror=alert(1)> teste de segurança';
  const pageF = await novaPagina();
  await pageF.goto(BASE + '/index.html');
  await responderNotas(pageF);
  await pageF.fill('#t-sug', ataque);
  await pageF.click('#send');
  await pageF.waitForSelector('#thanks', { state: 'visible' });
  await pageF.context().close();

  const page = await novaPagina(390);
  await page.goto(BASE + '/painel?como=' + JEAN);
  await page.click('[data-p="p-fila"]');
  const item = page.locator('.qitem', { hasText: '<img src=x onerror=alert(1)>' });
  await item.waitFor();
  assert.equal(await page.locator('#queue img').count(), 0);
  await page.screenshot({ path: path.join(EVID, 'painel-fila-xss-390.png'), fullPage: true });
  await item.getByRole('button', { name: 'Editar e publicar', exact: true }).click();
  await page.fill('#pubTxt', '<img src=y onerror=alert(2)> sugestão editada <b>negrito</b>');
  await page.click('#pubOk');
  await page.waitForSelector('#pubModal', { state: 'hidden' });
  await page.context().close();

  const pm = await novaPagina(390);
  await pm.goto(BASE + '/mural.html');
  await pm.waitForSelector('#mSug .quote');
  assert.match(await pm.textContent('#mSug'), /<img src=y onerror=alert\(2\)> sugestão editada <b>negrito<\/b>/);
  assert.equal(await pm.locator('#mSug img, #mSug b').count(), 0);
  assert.deepEqual(dialogos, [], 'nenhum alert disparado');
  await pm.context().close();
});

test('Mural: só o publicado; apoio único por navegador; ordem do protótipo', async () => {
  const page = await novaPagina(390);
  await page.goto(BASE + '/mural.html');
  await page.waitForSelector('#mSug .quote');
  const titulos = await page.locator('main h1, main h2').allTextContents();
  const ordem = ['Mural da equipe', 'Quem conhece a casa, ganha.', 'Aprenda e cresça', 'Treinamentos na plataforma Flash',
    'Ações da liderança', 'Comunicados', 'O que ouvimos nas últimas 4 semanas', 'Elogios da equipe', 'O que a equipe apontou', 'Sugestões da equipe'];
  assert.deepEqual(titulos, ordem);
  const texto = await page.textContent('main');
  for (const naoPublicado of ['relato para RH', 'relato para arquivar', 'falta talher no aparador no pico', 'essa escala é uma merda', 'comentário de teste']) {
    assert.equal(texto.includes(naoPublicado), false, naoPublicado);
  }
  assert.equal(/Universidade Caju|SULTS/i.test(texto), false, 'card da Universidade Caju removido em 02/11');
  for (const a of await page.locator('a[href^="http"]').all()) {
    assert.equal(await a.getAttribute('target'), '_blank');
    assert.equal(await a.getAttribute('rel'), 'noopener');
  }
  assert.equal(await page.locator('input, form').count(), 0, 'Mural não coleta nada');
  const btn = page.locator('#mSug button').first();
  await btn.click();
  await page.waitForFunction(() => /Apoiado · 1/.test(document.querySelector('#mSug button').textContent));
  await page.reload();
  await page.waitForSelector('#mSug button');
  assert.equal(await page.locator('#mSug button').first().isDisabled(), true, 'lembra o apoio no navegador');
  assert.equal((await mural()).sugestoes[0].apoios, 1);
  assert.equal(await semRolagemHorizontal(page), true);
  await page.screenshot({ path: path.join(EVID, 'mural-390.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: path.join(EVID, 'mural-1280.png'), fullPage: true });
  await page.context().close();
});

test('rota pública não expõe respostas individuais nem comentários não publicados', async () => {
  const m = await mural();
  const s = JSON.stringify(m);
  const comentarios = (await aba('Comentarios_v3')).slice(1).filter(c => c[7] !== 'publicado').map(c => c[4]);
  for (const t of comentarios) assert.equal(s.includes(t), false, t);
  assert.deepEqual(Object.keys(m).sort(), ['acoes', 'comunicados', 'config', 'elogios', 'ok', 'ponderacoes', 'pulso', 'sugestoes']);
  assert.equal(/"area"|"semana_iso"|"teste"|"flag_|"distribuicao"|"status":"novo"|@/.test(s), false);
  for (const acao of ['respostas', 'comentarios', 'fila', 'log', '']) {
    const r = await (await fetch(BASE + '/exec?acao=' + acao)).json();
    assert.equal(r.ok, false, 'rota ' + acao);
  }
  const cfg = await (await fetch(BASE + '/exec?acao=config')).json();
  assert.deepEqual(Object.keys(cfg).sort(), ['canal_grave', 'canal_grave_rotulo', 'nmin', 'ok']);
  assert.equal((await post({ acao: 'apoiar', id: 'C_nao_existe' })).ok, false);
  const comId = (await aba('Comentarios_v3'))[1][0];
  assert.equal((await post({ acao: 'apoiar', id: comId })).ok, false, 'não dá para apoiar item fora do Mural');
});

test('abas históricas intactas após todo o fluxo', async () => {
  const seg = await aba('Segunda-feira');
  const sex = await aba('Sexta-feira');
  assert.equal(seg.length, 85);
  assert.equal(sex.length, 85);
  const r = await (await fetch(BASE + '/__sim/aba?nome=Segunda-feira')).json();
  assert.equal(r.escritas, 0, 'nenhuma escrita na aba Segunda-feira');
  const r2 = await (await fetch(BASE + '/__sim/aba?nome=Sexta-feira')).json();
  assert.equal(r2.escritas, 0, 'nenhuma escrita na aba Sexta-feira');
});

test('layout: sem rolagem horizontal em 390 px; prints em 1280 px', async () => {
  for (const [url, nome] of [['/index.html', 'form'], ['/painel?como=' + JEAN, 'painel'], ['/mural.html', 'mural']]) {
    const page = await novaPagina(390);
    await page.goto(BASE + url);
    await page.waitForLoadState('networkidle');
    if (nome === 'painel') {
      for (const p of ['p-visao', 'p-fila', 'p-acoes', 'p-com', 'p-hist']) {
        await page.click('[data-p="' + p + '"]');
        await page.waitForTimeout(150);
        assert.equal(await semRolagemHorizontal(page), true, 'painel ' + p + ' em 390 px');
        if (p === 'p-hist') await page.screenshot({ path: path.join(EVID, 'painel-historico-390.png'), fullPage: true });
        if (p === 'p-visao') await page.screenshot({ path: path.join(EVID, 'painel-visao-390.png'), fullPage: true });
      }
    }
    assert.equal(await semRolagemHorizontal(page), true, nome + ' em 390 px');
    await page.setViewportSize({ width: 1280, height: 900 });
    if (nome === 'form') await page.screenshot({ path: path.join(EVID, 'form-1280.png'), fullPage: true });
    if (nome === 'painel') {
      await page.click('[data-p="p-hist"]');
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(EVID, 'painel-historico-1280.png'), fullPage: true });
    }
    await page.context().close();
  }
});
