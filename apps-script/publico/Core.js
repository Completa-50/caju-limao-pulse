/**
 * Pulso v3 — núcleo de funções puras.
 *
 * Este arquivo roda igual no Google Apps Script (V8) e no Node (testes).
 * Não usa nenhum serviço do Google: só recebe valores e devolve valores.
 * Fonte única: apps-script/src/Core.js. O build copia para publico/ e painel/.
 */

var PULSO_VERSAO = 'v3';

var PERGUNTAS = [
  { k: 'disposicao', rotulo: 'Disposição' },
  { k: 'escala', rotulo: 'Escala e intervalos' },
  { k: 'comida', rotulo: 'Refeição do staff' },
  { k: 'lideranca', rotulo: 'Liderança (ouvir e resolver)' },
  { k: 'empresa', rotulo: 'Trabalhar aqui' }
];
var CHAVES_NOTAS = PERGUNTAS.map(function (q) { return q.k; });
var AREAS = ['Front', 'Back', 'CPD'];
var TIPOS_COMENTARIO = ['elogio', 'melhora', 'sugestao'];
var LIMITE_TEXTO = 600;
var LIMITE_PAYLOAD = 6000; // caracteres do corpo bruto do POST

/* ------------------------------------------------------------------ */
/* Linguagem ofensiva e nomes próprios (heurísticas; só sinalizam)     */
/* ------------------------------------------------------------------ */

/*
 * Lista de termos. Fica só no servidor (este arquivo nunca é servido ao
 * navegador). Termos com até 3 letras precisam bater com a palavra inteira;
 * os demais batem com o INÍCIO de uma palavra (radical), para pegar plurais e
 * variações sem marcar palavras inocentes como "disputa" ou "desviado".
 * Diferença em relação ao protótipo: "lixo" saiu da lista, porque é palavra
 * comum em relato operacional ("lixo da cozinha") e impediria a publicação.
 */
var TERMOS_OFENSIVOS = [
  'porra', 'caralho', 'merda', 'bosta', 'puta', 'fdp', 'foda', 'fuder', 'foder',
  'cu', 'otario', 'otaria', 'idiota', 'imbecil', 'desgraca', 'arrombad',
  'vagabund', 'babaca', 'escroto', 'escrota', 'viado', 'piranha', 'cuzao',
  'vsf', 'pqp', 'krl', 'caralh', 'filho da puta'
];

function normalizarTexto(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function palavrasDe(s) {
  return normalizarTexto(s).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}

function temOfensa(s) {
  var palavras = palavrasDe(s);
  if (!palavras.length) return false;
  var juntas = ' ' + palavras.join(' ') + ' ';
  for (var i = 0; i < TERMOS_OFENSIVOS.length; i++) {
    var termo = normalizarTexto(TERMOS_OFENSIVOS[i]);
    if (termo.indexOf(' ') >= 0) {
      if (juntas.indexOf(' ' + termo + ' ') >= 0) return true;
      continue;
    }
    for (var j = 0; j < palavras.length; j++) {
      var p = palavras[j];
      if (termo.length <= 3 ? p === termo : p.indexOf(termo) === 0) return true;
    }
  }
  return false;
}

/* Palavras com inicial maiúscula que não são nomes de pessoas. */
var NAO_NOMES = [
  'front', 'back', 'cpd', 'caju', 'limao', 'boteco', 'cajupar', 'flash', 'quiz',
  'pulso', 'mural', 'rh', 'asa', 'norte', 'brasilia', 'pix', 'whatsapp', 'deus',
  'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo',
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro', 'kds', 'colibri', 'chefao',
  'sults', 'parrilla', 'apv', 'gerencia', 'gerente', 'chefe', 'lideranca'
];

/*
 * Provável nome próprio: palavra com inicial maiúscula seguida de minúsculas
 * que não está no início de frase e não está na lista acima. É uma heurística
 * para pedir confirmação ao moderador, não um detector confiável.
 */
function temNome(s) {
  var t = String(s == null ? '' : s);
  var re = /[A-Za-zÀ-ÿ]+/g;
  var m;
  while ((m = re.exec(t)) !== null) {
    var w = m[0];
    if (!/^[A-ZÀ-Ý][a-zà-ÿ]{2,}$/.test(w)) continue;
    var antes = t.slice(0, m.index).replace(/\s+$/, '');
    var inicioFrase = antes === '' || /[.!?:\n]$/.test(antes) || /^[-•*]$/.test(antes.slice(-1));
    if (inicioFrase) continue;
    if (NAO_NOMES.indexOf(normalizarTexto(w)) >= 0) continue;
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Validação do envio                                                   */
/* ------------------------------------------------------------------ */

function validarEnvio(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) {
    return { ok: false, erro: 'Envio inválido.' };
  }
  var notas = p.notas;
  if (!notas || typeof notas !== 'object') {
    return { ok: false, erro: 'Responda as 5 perguntas de 1 a 5.' };
  }
  var dados = { notas: {}, area: '', textos: {}, teste: false, confirmarOfensa: false };
  var faltam = 0;
  for (var i = 0; i < CHAVES_NOTAS.length; i++) {
    var k = CHAVES_NOTAS[i];
    var v = notas[k];
    if (v === undefined || v === null || v === '') { faltam++; continue; }
    if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v || v < 1 || v > 5) {
      return { ok: false, erro: 'Nota inválida em "' + k + '": use um número inteiro de 1 a 5.' };
    }
    dados.notas[k] = v;
  }
  if (faltam) {
    return { ok: false, erro: 'Responda as 5 perguntas de 1 a 5 (faltam ' + faltam + ').' };
  }
  if (p.area !== undefined && p.area !== null && p.area !== '') {
    if (AREAS.indexOf(p.area) < 0) return { ok: false, erro: 'Área inválida.' };
    dados.area = p.area;
  }
  var textos = p.textos || {};
  if (typeof textos !== 'object' || Array.isArray(textos)) {
    return { ok: false, erro: 'Comentários em formato inválido.' };
  }
  for (var j = 0; j < TIPOS_COMENTARIO.length; j++) {
    var t = TIPOS_COMENTARIO[j];
    var x = textos[t];
    if (x === undefined || x === null) { dados.textos[t] = ''; continue; }
    if (typeof x !== 'string') return { ok: false, erro: 'Comentário em formato inválido.' };
    x = x.replace(/\r\n?/g, '\n').trim();
    if (x.length > LIMITE_TEXTO) {
      return { ok: false, erro: 'Cada comentário pode ter até ' + LIMITE_TEXTO + ' caracteres.' };
    }
    dados.textos[t] = x;
  }
  dados.teste = p.teste === true;
  dados.confirmarOfensa = p.confirmarOfensa === true;
  return { ok: true, dados: dados };
}

/* Impede que o texto vire fórmula ao ser gravado na planilha. */
function protegerCelula(s) {
  var t = String(s == null ? '' : s);
  return /^[=+\-@\t\r]/.test(t) ? "'" + t : t;
}

/* ------------------------------------------------------------------ */
/* Datas e semanas (sempre a partir de 'aaaa-mm-dd' já no fuso de SP)  */
/* ------------------------------------------------------------------ */

function partesYmd(ymd) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd));
  if (!m) throw new Error('Data inválida: ' + ymd);
  return { y: +m[1], m: +m[2], d: +m[3] };
}

function ymdDeUTC(dt) {
  function z(n) { return (n < 10 ? '0' : '') + n; }
  return dt.getUTCFullYear() + '-' + z(dt.getUTCMonth() + 1) + '-' + z(dt.getUTCDate());
}

function somarDias(ymd, dias) {
  var p = partesYmd(ymd);
  return ymdDeUTC(new Date(Date.UTC(p.y, p.m - 1, p.d + dias)));
}

/* Semana ISO 8601 no formato '2026-W45'. */
function semanaIso(ymd) {
  var p = partesYmd(ymd);
  var dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  var dow = dt.getUTCDay() || 7; // segunda=1 … domingo=7
  dt.setUTCDate(dt.getUTCDate() + 4 - dow); // quinta-feira da mesma semana
  var ano = dt.getUTCFullYear();
  var inicio = new Date(Date.UTC(ano, 0, 1));
  var semana = Math.ceil(((dt - inicio) / 86400000 + 1) / 7);
  return ano + '-W' + (semana < 10 ? '0' : '') + semana;
}

/* As N semanas ISO mais recentes, da atual para trás. */
function semanasJanela(ymdHoje, n) {
  var out = [];
  for (var i = 0; i < n; i++) out.push(semanaIso(somarDias(ymdHoje, -7 * i)));
  return out;
}

/* ------------------------------------------------------------------ */
/* Estatística                                                          */
/* ------------------------------------------------------------------ */

/*
 * Média soma/n com 2 casas, arredondando empates para o par (4,125 -> 4,12),
 * mesma convenção usada nos valores de referência do histórico v2.
 * Feita com inteiros para não depender de ponto flutuante.
 */
function arredondarMedia(soma, n) {
  var x = soma * 100;
  var q = Math.floor(x / n);
  var r2 = 2 * (x - q * n);
  if (r2 > n || (r2 === n && q % 2 === 1)) q++;
  return q / 100;
}

function estatisticas(valores) {
  var c = [0, 0, 0, 0, 0];
  var soma = 0;
  var n = 0;
  for (var i = 0; i < valores.length; i++) {
    var v = valores[i];
    if (typeof v !== 'number' || v < 1 || v > 5 || Math.floor(v) !== v) continue;
    c[v - 1]++;
    soma += v;
    n++;
  }
  return {
    n: n,
    soma: soma,
    media: n ? arredondarMedia(soma, n) : null,
    distribuicao: c,
    p12: n ? (c[0] + c[1]) / n * 100 : null,
    p45: n ? (c[3] + c[4]) / n * 100 : null
  };
}

/*
 * Converte uma linha de Respostas_v3 em objeto. Ordem das colunas:
 * id, data, semana_iso, versao, area, disposicao, escala, comida, lideranca,
 * empresa, teste
 */
var COLS_RESPOSTAS = ['id', 'data', 'semana_iso', 'versao', 'area', 'disposicao',
  'escala', 'comida', 'lideranca', 'empresa', 'teste'];

function linhaParaResposta(row) {
  var o = {};
  for (var i = 0; i < COLS_RESPOSTAS.length; i++) o[COLS_RESPOSTAS[i]] = row[i];
  for (var j = 0; j < CHAVES_NOTAS.length; j++) {
    var v = Number(o[CHAVES_NOTAS[j]]);
    o[CHAVES_NOTAS[j]] = isFinite(v) ? v : null;
  }
  o.teste = o.teste === true || String(o.teste).toUpperCase() === 'TRUE';
  o.semana_iso = String(o.semana_iso || '');
  o.area = String(o.area || '');
  return o;
}

/*
 * Visão geral do painel interno.
 * opts: { semanas: ['2026-W45', ...], area: 'Todas'|'Front'|'Back'|'CPD', nmin }
 * Registros de teste são sempre excluídos.
 * Nada aqui compara perguntas diferentes nem calcula média geral das 5.
 */
function agregarVisao(respostas, opts) {
  var nmin = opts.nmin;
  var semanas = opts.semanas;
  var area = opts.area || 'Todas';
  var noRecorte = respostas.filter(function (r) {
    return !r.teste && semanas.indexOf(r.semana_iso) >= 0 &&
      (area === 'Todas' || r.area === area);
  });
  var dims = PERGUNTAS.map(function (q) {
    var s = estatisticas(noRecorte.map(function (r) { return r[q.k]; }));
    if (s.n < nmin) {
      return { k: q.k, rotulo: q.rotulo, n: s.n, suficiente: false };
    }
    return {
      k: q.k, rotulo: q.rotulo, n: s.n, suficiente: true,
      media: s.media, distribuicao: s.distribuicao, p12: s.p12, p45: s.p45
    };
  });
  var volume = semanas.map(function (w) {
    return {
      semana: w,
      n: noRecorte.filter(function (r) { return r.semana_iso === w; }).length
    };
  });
  return { n: noRecorte.length, nmin: nmin, area: area, dimensoes: dims, volume: volume };
}

/*
 * Bloco "O que ouvimos nas últimas 4 semanas" do Mural. Sem recorte por área,
 * sem distribuição, só a média por pergunta e o total, e só se n >= nmin.
 */
function agregarMuralPulso(respostas, semanas, nmin) {
  var rows = respostas.filter(function (r) {
    return !r.teste && semanas.indexOf(r.semana_iso) >= 0;
  });
  var n = rows.length;
  if (n < nmin) return { suficiente: false };
  return {
    suficiente: true,
    n: n,
    dimensoes: PERGUNTAS.map(function (q) {
      var s = estatisticas(rows.map(function (r) { return r[q.k]; }));
      return { k: q.k, rotulo: q.rotulo, media: s.n >= nmin ? s.media : null };
    })
  };
}

/* ------------------------------------------------------------------ */
/* Alerta semanal por e-mail                                           */
/* ------------------------------------------------------------------ */

/*
 * Regra documentada (mesmos cortes da v2):
 *   média < 2,5  -> "crítico"
 *   média < 3,2  -> "atenção"
 * Avalia cada pergunta sozinha, só na semana indicada, sem registros de teste,
 * sem recorte por área e só se n >= nmin. Nunca inclui comentários.
 */
var ALERTA_CRITICO = 2.5;
var ALERTA_ATENCAO = 3.2;

function avaliarAlertas(respostas, semana, nmin) {
  var rows = respostas.filter(function (r) { return !r.teste && r.semana_iso === semana; });
  if (rows.length < nmin) return { semana: semana, n: rows.length, suficiente: false, alertas: [] };
  var alertas = [];
  PERGUNTAS.forEach(function (q) {
    var s = estatisticas(rows.map(function (r) { return r[q.k]; }));
    if (s.n < nmin) return;
    var nivel = s.media < ALERTA_CRITICO ? 'crítico' : s.media < ALERTA_ATENCAO ? 'atenção' : '';
    if (nivel) alertas.push({ k: q.k, rotulo: q.rotulo, media: s.media, n: s.n, nivel: nivel, p12: s.p12 });
  });
  return { semana: semana, n: rows.length, suficiente: true, alertas: alertas };
}

function textoAlerta(av, linkPainel) {
  var l = ['Pesquisa Pulso · CJ AN · semana ' + av.semana + ' (' + av.n + ' respostas)', ''];
  av.alertas.forEach(function (a) {
    l.push('- ' + a.rotulo + ': média ' + a.media.toFixed(2).replace('.', ',') +
      ' (' + a.nivel + '), ' + Math.round(a.p12) + '% de notas 1–2, n = ' + a.n);
  });
  l.push('');
  l.push('Regra: crítico abaixo de 2,5; atenção abaixo de 3,2. Cada pergunta é avaliada sozinha, só com 5 ou mais respostas na semana, sem respostas de teste.');
  if (linkPainel) l.push('Painel interno: ' + linkPainel);
  l.push('Este e-mail não contém comentários nem dados individuais.');
  return l.join('\n');
}

/* ------------------------------------------------------------------ */
/* Mural_Publicado → JSON público                                      */
/* ------------------------------------------------------------------ */

var COLS_MURAL = ['id', 'tipo', 'tema', 'ouvimos', 'texto', 'responsavel', 'prazo',
  'status_acao', 'assinatura', 'apoios', 'publicado_em', 'ativo'];

function linhaParaMural(row) {
  var o = {};
  for (var i = 0; i < COLS_MURAL.length; i++) o[COLS_MURAL[i]] = row[i];
  o.ativo = !(o.ativo === false || String(o.ativo).toUpperCase() === 'FALSE');
  o.apoios = Number(o.apoios) || 0;
  ['id', 'tipo', 'tema', 'ouvimos', 'texto', 'responsavel', 'prazo', 'status_acao',
    'assinatura', 'publicado_em'].forEach(function (k) {
    o[k] = o[k] == null ? '' : String(o[k]);
  });
  // A planilha guarda o texto com apóstrofo de proteção; o leitor não vê.
  return o;
}

function porDataDesc(a, b) {
  return a.publicado_em < b.publicado_em ? 1 : a.publicado_em > b.publicado_em ? -1 : 0;
}

/* Monta o JSON do Mural. Só campos necessários, só itens ativos. */
function montarMural(itens, pulso, config) {
  var ativos = itens.filter(function (x) { return x.ativo; });
  function de(tipo) { return ativos.filter(function (x) { return x.tipo === tipo; }); }
  return {
    ok: true,
    acoes: de('acao').sort(porDataDesc).map(function (x) {
      return {
        id: x.id, tema: x.tema, ouvimos: x.ouvimos, acao: x.texto,
        responsavel: x.responsavel, prazo: x.prazo, status: x.status_acao,
        publicado_em: x.publicado_em
      };
    }),
    comunicados: de('comunicado').sort(porDataDesc).map(function (x) {
      return { id: x.id, titulo: x.tema, mensagem: x.texto, assinatura: x.assinatura, publicado_em: x.publicado_em };
    }),
    elogios: de('elogio').sort(porDataDesc).map(function (x) {
      return { id: x.id, texto: x.texto, publicado_em: x.publicado_em };
    }),
    ponderacoes: de('ponderacao').sort(porDataDesc).map(function (x) {
      return { id: x.id, texto: x.texto, publicado_em: x.publicado_em };
    }),
    sugestoes: de('sugestao').sort(function (a, b) {
      return b.apoios - a.apoios || porDataDesc(a, b);
    }).map(function (x) {
      return { id: x.id, texto: x.texto, apoios: x.apoios, publicado_em: x.publicado_em };
    }),
    pulso: pulso,
    config: {
      canal_grave: config.CANAL_GRAVE || '',
      link_quiz: config.LINK_QUIZ || '',
      link_flash: config.LINK_FLASH || ''
    }
  };
}

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

var CONFIG_PADRAO = {
  NMIN: 5,
  CANAL_GRAVE: 'https://wa.me/5561991798883',
  CANAL_GRAVE_ROTULO: '+55 61 99179-8883',
  LINK_QUIZ: 'https://caju-quiz-gadelha.vercel.app/?loja=0683f5',
  LINK_FLASH: 'https://hros.flashapp.com.br/authentication/login',
  ALERTA_EMAIL: 'jeanbrito@cajupar.com',
  LINK_PAINEL: ''
};

function lerConfig(linhas) {
  var c = {};
  for (var k in CONFIG_PADRAO) c[k] = CONFIG_PADRAO[k];
  (linhas || []).forEach(function (r) {
    var chave = String(r[0] || '').trim();
    if (!chave) return;
    c[chave] = r[1] == null ? '' : String(r[1]).trim();
  });
  var n = parseInt(c.NMIN, 10);
  c.NMIN = isFinite(n) && n >= 1 ? n : CONFIG_PADRAO.NMIN;
  ['CANAL_GRAVE', 'LINK_QUIZ', 'LINK_FLASH'].forEach(function (k) {
    if (!/^https:\/\//.test(c[k])) c[k] = CONFIG_PADRAO[k];
  });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.ALERTA_EMAIL)) c.ALERTA_EMAIL = CONFIG_PADRAO.ALERTA_EMAIL;
  if (!/^https:\/\//.test(c.LINK_PAINEL)) c.LINK_PAINEL = '';
  return c;
}

function lerAllowlist(texto) {
  return String(texto || '').split(/[\s,;]+/).map(function (e) {
    return e.trim().toLowerCase();
  }).filter(function (e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); });
}

function autorizado(email, lista) {
  var e = String(email || '').trim().toLowerCase();
  return !!e && lista.indexOf(e) >= 0;
}

/* ------------------------------------------------------------------ */
/* Validação das escritas do painel                                    */
/* ------------------------------------------------------------------ */

var TEMAS_ACAO = ['Refeição do staff', 'Escala e intervalos', 'Liderança e comunicação',
  'Estrutura e manutenção', 'Pagamentos e benefícios', 'Outro'];
var STATUS_ACAO = { and: 'Em andamento', feito: 'Feito', nao: 'Não vamos fazer' };
var TIPOS_PUBLICACAO = { elogio: 'elogio', pond: 'ponderacao', sug: 'sugestao' };

function limpar(s, max) {
  var t = String(s == null ? '' : s).replace(/\r\n?/g, '\n').trim();
  return t.length > max ? null : t;
}

function validarPublicacao(p) {
  var tipo = TIPOS_PUBLICACAO[p && p.tipo];
  if (!tipo) return { ok: false, erro: 'Tipo inválido.' };
  var t = limpar(p.texto, LIMITE_TEXTO);
  if (t === null) return { ok: false, erro: 'Texto acima de ' + LIMITE_TEXTO + ' caracteres.' };
  if (!t) return { ok: false, erro: 'Texto vazio.' };
  if (temOfensa(t)) return { ok: false, erro: 'Ainda há linguagem ofensiva. Reescreva antes de publicar.' };
  if (temNome(t) && p.confirmarNome !== true) {
    return { ok: false, pedeConfirmacao: true, erro: 'Parece haver um nome próprio. Confira e clique em Publicar de novo para confirmar.' };
  }
  return { ok: true, dados: { tipo: tipo, texto: t } };
}

/* Compara ignorando espaços, maiúsculas, acentos e o apóstrofo de proteção. */
function mesmoTexto(a, b) {
  function n(x) { return normalizarTexto(String(x == null ? '' : x).replace(/^'/, '')).replace(/\s+/g, ' ').trim(); }
  return n(a) === n(b);
}

function validarAcao(p) {
  p = p || {};
  var o = {
    tema: TEMAS_ACAO.indexOf(p.tema) >= 0 ? p.tema : null,
    ouvimos: limpar(p.ouvimos, 300),
    acao: limpar(p.acao, 300),
    responsavel: limpar(p.responsavel, 80),
    prazo: limpar(p.prazo, 40),
    status: STATUS_ACAO[p.status] ? p.status : null,
    ref: p.ref ? String(p.ref).slice(0, 20) : ''
  };
  if (!o.tema) return { ok: false, erro: 'Tema inválido.' };
  if (!o.status) return { ok: false, erro: 'Status inválido.' };
  if (o.ouvimos === null || o.acao === null || o.responsavel === null || o.prazo === null) {
    return { ok: false, erro: 'Algum campo passou do tamanho máximo.' };
  }
  if (!o.ouvimos || !o.acao || !o.responsavel) {
    return { ok: false, erro: 'Preencha o que ouvimos, a ação e o responsável.' };
  }
  if (temNome(o.ouvimos)) return { ok: false, erro: 'Evite nomes em "o que ouvimos". Descreva como tema.' };
  if (temOfensa(o.ouvimos + ' ' + o.acao)) {
    return { ok: false, erro: 'Há linguagem ofensiva no texto. Reescreva antes de publicar.' };
  }
  return { ok: true, dados: o };
}

function validarComunicado(p) {
  p = p || {};
  var o = { titulo: limpar(p.titulo, 120), mensagem: limpar(p.mensagem, 1500), assinatura: limpar(p.assinatura, 80) };
  if (o.titulo === null || o.mensagem === null || o.assinatura === null) {
    return { ok: false, erro: 'Algum campo passou do tamanho máximo.' };
  }
  if (!o.titulo || !o.mensagem) return { ok: false, erro: 'Título e mensagem são obrigatórios.' };
  if (!o.assinatura) o.assinatura = 'Liderança';
  if (temOfensa(o.titulo + ' ' + o.mensagem)) {
    return { ok: false, erro: 'Há linguagem ofensiva no texto. Reescreva antes de publicar.' };
  }
  return { ok: true, dados: o };
}

/* ------------------------------------------------------------------ */
/* Histórico v2 (abas Segunda-feira e Sexta-feira, só leitura)         */
/* ------------------------------------------------------------------ */

/*
 * Converte o valor da coluna A (Data) das abas antigas em {y,m,d}.
 * Aceita objeto Date (como o Apps Script entrega), 'dd/mm/aaaa',
 * 'Date(2026,4,11)' (formato GViz, mês começando em 0) e 'aaaa-mm-dd'.
 */
function parseDataV2(v) {
  if (v == null || v === '') return null;
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return null;
    return { y: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate() };
  }
  var s = String(v).trim();
  var m;
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s))) return { y: +m[3], m: +m[2], d: +m[1] };
  if ((m = /^Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})/.exec(s))) return { y: +m[1], m: +m[2] + 1, d: +m[3] };
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return { y: +m[1], m: +m[2], d: +m[3] };
  return null;
}

var MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/* Bimestres fixos: jan, fev–mar, abr–mai, jun–jul, ago–set, out–nov, dez. */
function bimestreDe(dt) {
  var inicio = dt.m % 2 === 0 ? dt.m : dt.m - 1;
  if (inicio === 0) inicio = 1; // janeiro fica sozinho
  var fim = inicio === 12 || inicio === 1 ? inicio : inicio + 1;
  return { chave: dt.y * 100 + inicio, inicio: inicio, fim: fim, y: dt.y };
}

function notaV2(v) {
  var n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return isFinite(n) && Math.floor(n) === n && n >= 1 && n <= 5 ? n : null;
}

var HIST_DIMENSOES = [
  { aba: 'sex', col: 0, nome: 'Comida / Refeição do staff', v3: 'Mantida (comparável)' },
  { aba: 'sex', col: 2, nome: 'Empresa / Trabalhar aqui', v3: 'Mantida (comparável)' },
  { aba: 'sex', col: 1, nome: 'Liderança', v3: 'Reescrita (nova série)' },
  { aba: 'seg', col: 1, nome: 'Disposição', v3: 'Texto ajustado (nova série)' },
  { aba: 'seg', col: 0, nome: 'Chegada', v3: 'Removida' },
  { aba: 'seg', col: 2, nome: 'Engajamento', v3: 'Removida' }
];

/*
 * linhasSeg / linhasSex: linhas brutas das abas antigas (a partir da linha 2),
 * colunas A..G. Usa A (data) e C, D, E (notas). Ignora F (Media) e G.
 * hojeYmd (opcional) marca o último bimestre como parcial se ainda estiver aberto.
 */
function agregarHistoricoV2(linhasSeg, linhasSex, hojeYmd) {
  var buckets = {};
  var mesesVistos = {};
  function acumular(linhas, aba) {
    (linhas || []).forEach(function (r) {
      var dt = parseDataV2(r[0]);
      if (!dt) return;
      var b = bimestreDe(dt);
      buckets[b.chave] = buckets[b.chave] || { b: b, seg: [[], [], []], sex: [[], [], []] };
      mesesVistos[b.chave] = mesesVistos[b.chave] || {};
      mesesVistos[b.chave][dt.m] = true;
      for (var i = 0; i < 3; i++) {
        var n = notaV2(r[2 + i]);
        if (n !== null) buckets[b.chave][aba][i].push(n);
      }
    });
  }
  acumular(linhasSeg, 'seg');
  acumular(linhasSex, 'sex');
  var chaves = Object.keys(buckets).map(Number).sort(function (a, b) { return a - b; });
  var hoje = hojeYmd ? partesYmd(hojeYmd) : null;
  var periodos = chaves.map(function (k) {
    var b = buckets[k].b;
    var meses = Object.keys(mesesVistos[k]).map(Number).sort(function (a, c) { return a - c; });
    var rotulo = MESES_ABREV[meses[0] - 1] + (meses.length > 1 ? '–' + MESES_ABREV[meses[meses.length - 1] - 1] : '');
    var aberto = hoje && hoje.y === b.y && hoje.m >= b.inicio && hoje.m <= b.fim;
    var incompleto = meses.length === 1 && b.inicio !== b.fim;
    return { chave: k, rotulo: rotulo + (aberto || incompleto ? ' (parcial)' : '') };
  });
  var linhas = HIST_DIMENSOES.map(function (d) {
    return {
      dimensao: d.nome,
      v3: d.v3,
      valores: chaves.map(function (k) {
        var s = estatisticas(buckets[k][d.aba][d.col]);
        return s.n ? { media: s.media, n: s.n } : null;
      })
    };
  });
  linhas.push({ dimensao: 'Escala e intervalos', v3: 'Nova', valores: chaves.map(function () { return null; }) });
  return { periodos: periodos, linhas: linhas };
}

/* Formato '2,90 (101)'. */
function formatarHist(v) {
  if (!v) return '—';
  return v.media.toFixed(2).replace('.', ',') + ' (' + v.n + ')';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PULSO_VERSAO: PULSO_VERSAO, PERGUNTAS: PERGUNTAS, CHAVES_NOTAS: CHAVES_NOTAS, AREAS: AREAS,
    TIPOS_COMENTARIO: TIPOS_COMENTARIO, LIMITE_TEXTO: LIMITE_TEXTO, LIMITE_PAYLOAD: LIMITE_PAYLOAD,
    TERMOS_OFENSIVOS: TERMOS_OFENSIVOS, normalizarTexto: normalizarTexto, temOfensa: temOfensa,
    temNome: temNome, validarEnvio: validarEnvio, protegerCelula: protegerCelula,
    partesYmd: partesYmd, somarDias: somarDias, semanaIso: semanaIso, semanasJanela: semanasJanela,
    estatisticas: estatisticas, arredondarMedia: arredondarMedia, COLS_RESPOSTAS: COLS_RESPOSTAS, linhaParaResposta: linhaParaResposta,
    agregarVisao: agregarVisao, agregarMuralPulso: agregarMuralPulso, avaliarAlertas: avaliarAlertas, textoAlerta: textoAlerta, COLS_MURAL: COLS_MURAL,
    linhaParaMural: linhaParaMural, montarMural: montarMural, CONFIG_PADRAO: CONFIG_PADRAO,
    lerConfig: lerConfig, lerAllowlist: lerAllowlist, autorizado: autorizado, TEMAS_ACAO: TEMAS_ACAO,
    STATUS_ACAO: STATUS_ACAO, validarPublicacao: validarPublicacao, mesmoTexto: mesmoTexto, validarAcao: validarAcao,
    validarComunicado: validarComunicado, parseDataV2: parseDataV2, bimestreDe: bimestreDe,
    agregarHistoricoV2: agregarHistoricoV2, formatarHist: formatarHist
  };
}
