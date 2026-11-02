'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../apps-script/src/Core.js');

const notasOk = { disposicao: 3, escala: 2, comida: 4, lideranca: 5, empresa: 1 };

test('validarEnvio aceita envio mínimo válido', () => {
  const r = C.validarEnvio({ notas: notasOk });
  assert.equal(r.ok, true);
  assert.deepEqual(r.dados.notas, notasOk);
  assert.equal(r.dados.area, '');
  assert.equal(r.dados.teste, false);
  assert.deepEqual(r.dados.textos, { elogio: '', melhora: '', sugestao: '' });
});

test('validarEnvio exige as 5 notas', () => {
  const r = C.validarEnvio({ notas: { disposicao: 3, escala: 2 } });
  assert.equal(r.ok, false);
  assert.match(r.erro, /faltam 3/);
});

test('validarEnvio rejeita nota fora de 1–5, decimal ou texto', () => {
  for (const v of [0, 6, 2.5, '3', -1, NaN, Infinity, true]) {
    const r = C.validarEnvio({ notas: { ...notasOk, comida: v } });
    assert.equal(r.ok, false, 'valor ' + String(v));
  }
});

test('validarEnvio valida área e tamanho dos textos', () => {
  assert.equal(C.validarEnvio({ notas: notasOk, area: 'Cozinha' }).ok, false);
  assert.equal(C.validarEnvio({ notas: notasOk, area: 'CPD' }).dados.area, 'CPD');
  assert.equal(C.validarEnvio({ notas: notasOk, textos: { elogio: 'x'.repeat(600) } }).ok, true);
  assert.equal(C.validarEnvio({ notas: notasOk, textos: { elogio: 'x'.repeat(601) } }).ok, false);
  assert.equal(C.validarEnvio({ notas: notasOk, textos: { elogio: 42 } }).ok, false);
  assert.equal(C.validarEnvio({ notas: notasOk, textos: [] }).ok, false);
  assert.equal(C.validarEnvio(null).ok, false);
  assert.equal(C.validarEnvio([]).ok, false);
});

test('validarEnvio só aceita teste===true', () => {
  assert.equal(C.validarEnvio({ notas: notasOk, teste: 'true' }).dados.teste, false);
  assert.equal(C.validarEnvio({ notas: notasOk, teste: true }).dados.teste, true);
});

test('protegerCelula evita injeção de fórmula', () => {
  assert.equal(C.protegerCelula('=HYPERLINK("x")'), '\'=HYPERLINK("x")');
  assert.equal(C.protegerCelula('+1'), "'+1");
  assert.equal(C.protegerCelula('-1'), "'-1");
  assert.equal(C.protegerCelula('@x'), "'@x");
  assert.equal(C.protegerCelula('normal'), 'normal');
});

test('temOfensa: detecta termos, plural e acento; não marca palavras inocentes', () => {
  for (const s of ['que merda', 'PORRA!', 'vagabundos', 'seu cu', 'Desgraça', 'filho da puta', 'que bosta de escala']) {
    assert.equal(C.temOfensa(s), true, s);
  }
  for (const s of ['disputa de praça', 'pedido desviado', 'reputação', 'lixo da cozinha acumulado',
    'computador travou', 'escala saiu cedo', 'curso de bar', '']) {
    assert.equal(C.temOfensa(s), false, s);
  }
});

test('temNome: sinaliza provável nome, ignora início de frase e termos da casa', () => {
  assert.equal(C.temNome('o Rodolfo gritou com a equipe'), true);
  assert.equal(C.temNome('Falta talher no aparador'), false);
  assert.equal(C.temNome('A escala do Front saiu tarde. Melhorou no sábado.'), false);
  assert.equal(C.temNome('fala com a Maria'), true);
  assert.equal(C.temNome('a refeição de Sábado estava boa'), false);
});

test('semanaIso segue a ISO 8601, inclusive na virada do ano', () => {
  assert.equal(C.semanaIso('2026-11-02'), '2026-W45');
  assert.equal(C.semanaIso('2026-11-08'), '2026-W45'); // domingo
  assert.equal(C.semanaIso('2026-11-09'), '2026-W46');
  assert.equal(C.semanaIso('2026-01-01'), '2026-W01');
  assert.equal(C.semanaIso('2025-12-29'), '2026-W01');
  assert.equal(C.semanaIso('2027-01-01'), '2026-W53');
  assert.equal(C.semanaIso('2027-01-04'), '2027-W01');
  assert.throws(() => C.semanaIso('02/11/2026'));
});

test('semanasJanela devolve N semanas da atual para trás', () => {
  assert.deepEqual(C.semanasJanela('2026-11-02', 4), ['2026-W45', '2026-W44', '2026-W43', '2026-W42']);
  assert.equal(C.semanasJanela('2026-11-02', 8).length, 8);
});

test('estatisticas: média, distribuição e percentuais', () => {
  const s = C.estatisticas([1, 2, 2, 4, 5, 5, null, 7, 2.5]);
  assert.equal(s.n, 6);
  assert.equal(s.media, 3.17);
  assert.deepEqual(s.distribuicao, [1, 2, 0, 1, 2]);
  assert.equal(s.p12, 50);
  assert.equal(s.p45, 50);
  assert.equal(C.estatisticas([]).media, null);
});

function resp(semana, area, nota, teste = false) {
  return { semana_iso: semana, area, teste, disposicao: nota, escala: nota, comida: nota, lideranca: nota, empresa: nota };
}

test('agregarVisao suprime n < NMIN, inclusive por área, e exclui teste', () => {
  const semanas = ['2026-W45', '2026-W44', '2026-W43', '2026-W42'];
  const rows = [
    ...Array.from({ length: 6 }, () => resp('2026-W45', 'Front', 4)),
    ...Array.from({ length: 3 }, () => resp('2026-W44', 'Back', 2)),
    ...Array.from({ length: 10 }, () => resp('2026-W45', 'Back', 1, true)), // teste
    resp('2026-W30', 'Front', 5) // fora da janela
  ];
  const todas = C.agregarVisao(rows, { semanas, area: 'Todas', nmin: 5 });
  assert.equal(todas.n, 9);
  assert.equal(todas.dimensoes[0].suficiente, true);
  assert.equal(todas.dimensoes[0].media, 3.33);
  assert.equal(todas.volume.find(v => v.semana === '2026-W45').n, 6);
  const back = C.agregarVisao(rows, { semanas, area: 'Back', nmin: 5 });
  assert.equal(back.n, 3);
  assert.equal(back.dimensoes.every(d => d.suficiente === false && d.media === undefined), true);
  assert.equal('mediaGeral' in todas, false);
});

test('agregarMuralPulso: nada abaixo de NMIN, sem distribuição nem área', () => {
  const semanas = ['2026-W45', '2026-W44', '2026-W43', '2026-W42'];
  assert.deepEqual(C.agregarMuralPulso([resp('2026-W45', 'Front', 3)], semanas, 5), { suficiente: false });
  const rows = Array.from({ length: 5 }, (_, i) => resp('2026-W45', 'Front', i + 1));
  rows.push(resp('2026-W45', 'Back', 5, true));
  const m = C.agregarMuralPulso(rows, semanas, 5);
  assert.equal(m.suficiente, true);
  assert.equal(m.n, 5);
  assert.equal(m.dimensoes[0].media, 3);
  assert.equal(JSON.stringify(m).includes('Front'), false);
  assert.equal(JSON.stringify(m).includes('distribuicao'), false);
});

test('montarMural só leva itens ativos e campos públicos', () => {
  const linhas = [
    ['a1', 'acao', 'Refeição do staff', 'relatos', 'cardápio fixo', 'Gerência de CPD', '30/11', 'and', '', 0, '2026-11-01', true],
    ['s1', 'sugestao', '', '', 'lanche', '', '', '', '', 2, '2026-10-30', true],
    ['s2', 'sugestao', '', '', 'outra', '', '', '', '', 9, '2026-10-29', true],
    ['x1', 'elogio', '', '', 'inativo', '', '', '', '', 0, '2026-10-29', 'FALSE']
  ].map(C.linhaParaMural);
  const m = C.montarMural(linhas, { suficiente: false }, C.lerConfig([]));
  assert.equal(m.acoes.length, 1);
  assert.equal(m.acoes[0].acao, 'cardápio fixo');
  assert.deepEqual(m.sugestoes.map(s => s.id), ['s2', 's1']);
  assert.equal(m.elogios.length, 0);
  assert.equal(m.config.link_quiz, C.CONFIG_PADRAO.LINK_QUIZ);
});

test('lerConfig aplica padrão, NMIN numérico e só aceita https', () => {
  const c = C.lerConfig([['NMIN', '7'], ['LINK_QUIZ', 'javascript:alert(1)'], ['CANAL_GRAVE', 'https://wa.me/5561999999999']]);
  assert.equal(c.NMIN, 7);
  assert.equal(c.LINK_QUIZ, C.CONFIG_PADRAO.LINK_QUIZ);
  assert.equal(c.CANAL_GRAVE, 'https://wa.me/5561999999999');
  assert.equal(C.lerConfig([['NMIN', 'abc']]).NMIN, 5);
});

test('allowlist: normaliza e compara sem diferenciar maiúsculas', () => {
  const l = C.lerAllowlist('JeanBrito@cajupar.com, jbrito.49@gmail.com;lixo  x@y.z');
  assert.deepEqual(l, ['jeanbrito@cajupar.com', 'jbrito.49@gmail.com', 'x@y.z']);
  assert.equal(C.autorizado('jeanbrito@CAJUPAR.com', l), true);
  assert.equal(C.autorizado('', l), false);
  assert.equal(C.autorizado('outro@gmail.com', l), false);
});

test('validarPublicacao recusa ofensa e pede confirmação para nome', () => {
  assert.equal(C.validarPublicacao({ tipo: 'elogio', texto: 'que merda' }).ok, false);
  const n = C.validarPublicacao({ tipo: 'pond', texto: 'o Rodolfo atrasou a escala' });
  assert.equal(n.ok, false);
  assert.equal(n.pedeConfirmacao, true);
  const ok = C.validarPublicacao({ tipo: 'pond', texto: 'o Rodolfo atrasou a escala', confirmarNome: true });
  assert.equal(ok.ok, true);
  assert.equal(ok.dados.tipo, 'ponderacao');
  assert.equal(C.validarPublicacao({ tipo: 'outro', texto: 'x' }).ok, false);
  assert.equal(C.validarPublicacao({ tipo: 'sug', texto: '  ' }).ok, false);
});

test('validarAcao recusa nome e ofensa em "o que ouvimos"', () => {
  const base = { tema: 'Refeição do staff', ouvimos: 'relatos de comida repetida', acao: 'cardápio fixo', responsavel: 'Gerência de CPD', prazo: '30/11', status: 'and' };
  assert.equal(C.validarAcao(base).ok, true);
  assert.equal(C.validarAcao({ ...base, ouvimos: 'a Marcela não ouve' }).ok, false);
  assert.equal(C.validarAcao({ ...base, ouvimos: 'comida uma merda' }).ok, false);
  assert.equal(C.validarAcao({ ...base, status: 'x' }).ok, false);
  assert.equal(C.validarAcao({ ...base, tema: 'x' }).ok, false);
  assert.equal(C.validarAcao({ ...base, responsavel: '' }).ok, false);
});

test('validarComunicado exige título e mensagem', () => {
  assert.equal(C.validarComunicado({ titulo: 'x', mensagem: '' }).ok, false);
  assert.equal(C.validarComunicado({ titulo: 'Nova regra', mensagem: 'texto' }).dados.assinatura, 'Liderança');
});

test('parseDataV2 entende Date, dd/mm/aaaa, Date(…) do GViz e ISO', () => {
  assert.deepEqual(C.parseDataV2('11/05/2026'), { y: 2026, m: 5, d: 11 });
  assert.deepEqual(C.parseDataV2('Date(2026,4,11)'), { y: 2026, m: 5, d: 11 });
  assert.deepEqual(C.parseDataV2('2026-05-11'), { y: 2026, m: 5, d: 11 });
  assert.deepEqual(C.parseDataV2(new Date(2026, 4, 11)), { y: 2026, m: 5, d: 11 });
  assert.equal(C.parseDataV2(''), null);
  assert.equal(C.parseDataV2('lixo'), null);
});

/*
 * Histórico v2: base sintética construída para reproduzir exatamente as médias e
 * os n de referência de Comida e Empresa (2,90/101, 3,12/76, 3,53/53, 3,56/16 e
 * 3,92/101, 3,78/76, 3,68/53, 4,12/16). A coluna F (Media) vem como Date, imitando
 * o defeito da planilha real, e precisa ser ignorada.
 * A conferência com os dados reais roda no Apps Script (conferirHistoricoV2).
 */
function gerarLinhas(qtd, alvoSoma, mes, ano = 2026) {
  // qtd notas inteiras 1–5 cuja soma é alvoSoma
  const base = Math.floor(alvoSoma / qtd);
  let resto = alvoSoma - base * qtd;
  const out = [];
  for (let i = 0; i < qtd; i++) {
    let v = base;
    if (resto > 0) { v++; resto--; }
    const m = mes === 10 ? 10 : mes + (i % 2); // bimestre completo, exceto outubro (parcial)
    out.push({ v, data: `${String((i % 27) + 1).padStart(2, '0')}/${String(m).padStart(2, '0')}/${ano}` });
  }
  return out;
}

test('agregarHistoricoV2 reproduz os valores de referência e ignora a coluna Media', () => {
  const ref = [
    // mes, n, somaComida, somaEmpresa  (médias de referência * n, arredondadas)
    [4, 101, Math.round(2.90 * 101), Math.round(3.92 * 101)],
    [6, 76, Math.round(3.12 * 76), Math.round(3.78 * 76)],
    [8, 53, Math.round(3.53 * 53), Math.round(3.68 * 53)],
    [10, 16, Math.round(3.56 * 16), Math.round(4.12 * 16)]
  ];
  const sex = [];
  for (const [mes, n, sc, se] of ref) {
    const c = gerarLinhas(n, sc, mes);
    const e = gerarLinhas(n, se, mes);
    for (let i = 0; i < n; i++) {
      // A Data, B Horario, C Comida, D Lideranca, E Empresa, F Media (corrompida), G Comentario
      sex.push([c[i].data, '10:00', c[i].v, 3, e[i].v, new Date(2026, 6, 3), '']);
    }
  }
  const h = C.agregarHistoricoV2([], sex, '2026-10-19');
  assert.deepEqual(h.periodos.map(p => p.rotulo), ['abr–mai', 'jun–jul', 'ago–set', 'out (parcial)']);
  const comida = h.linhas.find(l => l.dimensao.startsWith('Comida'));
  const empresa = h.linhas.find(l => l.dimensao.startsWith('Empresa'));
  assert.deepEqual(comida.valores.map(C.formatarHist), ['2,90 (101)', '3,12 (76)', '3,53 (53)', '3,56 (16)']);
  assert.deepEqual(empresa.valores.map(C.formatarHist), ['3,92 (101)', '3,78 (76)', '3,68 (53)', '4,12 (16)']);
  assert.equal(comida.v3, 'Mantida (comparável)');
  assert.equal(h.linhas.find(l => l.dimensao === 'Chegada').v3, 'Removida');
  assert.equal(h.linhas.find(l => l.dimensao === 'Escala e intervalos').v3, 'Nova');
});

test('agregarHistoricoV2 agrupa por bimestre e rotula meses presentes', () => {
  const seg = [['11/05/2026', '', 4, 3, 5, '', ''], ['20/04/2026', '', 2, 3, 1, '', ''], ['Date(2026,5,1)', '', 5, 5, 5, '', '']];
  const h = C.agregarHistoricoV2(seg, [], '2026-11-02');
  assert.deepEqual(h.periodos.map(p => p.rotulo), ['abr–mai', 'jun (parcial)']);
  const chegada = h.linhas.find(l => l.dimensao === 'Chegada');
  assert.deepEqual(chegada.valores, [{ media: 3, n: 2 }, { media: 5, n: 1 }]);
});

test('arredondarMedia: empate vai para o par, demais casos normais', () => {
  assert.equal(C.arredondarMedia(66, 16), 4.12);   // 4,125
  assert.equal(C.arredondarMedia(57, 16), 3.56);   // 3,5625
  assert.equal(C.arredondarMedia(293, 101), 2.9);  // 2,9010
  assert.equal(C.arredondarMedia(10, 8), 1.25);
  assert.equal(C.arredondarMedia(1, 8), 0.12);     // 0,125 -> par
  assert.equal(C.arredondarMedia(3, 8), 0.38);     // 0,375 -> par
});

test('avaliarAlertas: cortes 2,5 e 3,2, só com n >= NMIN, sem teste', () => {
  const sem = '2026-W44';
  const linha = (n) => ({ semana_iso: sem, area: 'Front', teste: false, disposicao: n, escala: 2, comida: 3, lideranca: 4, empresa: 5 });
  const poucas = Array.from({ length: 4 }, () => linha(1));
  assert.equal(C.avaliarAlertas(poucas, sem, 5).suficiente, false);
  assert.deepEqual(C.avaliarAlertas(poucas, sem, 5).alertas, []);
  const rows = [...Array.from({ length: 5 }, () => linha(1)), { ...linha(1), teste: true, escala: 5 }];
  const av = C.avaliarAlertas(rows, sem, 5);
  assert.equal(av.n, 5);
  assert.deepEqual(av.alertas.map(a => [a.k, a.nivel]), [['disposicao', 'crítico'], ['escala', 'crítico'], ['comida', 'atenção']]);
  assert.equal(C.avaliarAlertas(rows, '2026-W45', 5).suficiente, false, 'outra semana não conta');
  const txt = C.textoAlerta(av, '');
  assert.match(txt, /Disposição: média 1,00 \(crítico\)/);
  assert.match(txt, /não contém comentários/);
  assert.equal(/Front/.test(txt), false, 'sem área no e-mail');
});

test('lerConfig: e-mail de alerta válido ou padrão; LINK_PAINEL só https', () => {
  assert.equal(C.lerConfig([]).ALERTA_EMAIL, 'jeanbrito@cajupar.com');
  assert.equal(C.lerConfig([['ALERTA_EMAIL', 'invalido']]).ALERTA_EMAIL, 'jeanbrito@cajupar.com');
  assert.equal(C.lerConfig([['LINK_PAINEL', 'javascript:x']]).LINK_PAINEL, '');
  assert.equal(C.lerConfig([]).CANAL_GRAVE, 'https://wa.me/5561991798883');
});
