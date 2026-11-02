/**
 * Pulso v3 — implantação do PAINEL INTERNO.
 * Executar como: usuário que acessa. Quem pode acessar: qualquer pessoa com conta Google.
 *
 * O acesso é decidido aqui no servidor, comparando o e-mail da sessão Google
 * com a Script Property ALLOWLIST (e-mails separados por vírgula). A lista
 * nunca vai para o HTML. Toda função chamada pelo navegador revalida o acesso,
 * porque google.script.run fica disponível em qualquer página deste projeto,
 * inclusive na de acesso negado.
 */

function doGet() {
  var email = emailSessao_();
  if (!autorizado(email, allowlist_())) {
    var negado = HtmlService.createTemplateFromFile('Negado');
    negado.email = email;
    return negado.evaluate()
      .setTitle('Pulso · acesso negado')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  var t = HtmlService.createTemplateFromFile('Painel');
  t.email = email;
  return t.evaluate()
    .setTitle('Pulso · Painel interno')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* CSS compartilhado (gerado pelo build a partir de pulso.css). */
function incluirEstilo_() {
  return HtmlService.createHtmlOutputFromFile('Estilo').getContent();
}

function emailSessao_() {
  return String(Session.getActiveUser().getEmail() || '').toLowerCase();
}

function allowlist_() {
  return lerAllowlist(PropertiesService.getScriptProperties().getProperty('ALLOWLIST'));
}

function exigirAcesso_() {
  var email = emailSessao_();
  if (!autorizado(email, allowlist_())) throw new Error('Acesso negado.');
  return email;
}

/* Envelopa as chamadas do navegador: valida acesso e padroniza erros. */
function chamada_(fn) {
  var quem = exigirAcesso_();
  try {
    return fn(quem);
  } catch (err) {
    if (err && err.usuario) return { ok: false, erro: err.message };
    console.error(err && err.stack ? err.stack : err);
    return { ok: false, erro: 'Erro no servidor. Nada foi alterado.' };
  }
}

/* ---------------- leitura ---------------- */

function painelVisao(janela, area) {
  return chamada_(function () {
    var w = Number(janela) === 8 ? 8 : 4;
    var a = ['Todas'].concat(AREAS).indexOf(area) >= 0 ? area : 'Todas';
    var config = configAtual_();
    var r = agregarVisao(respostas_(), { semanas: semanasJanela(hojeSP_(), w), area: a, nmin: config.NMIN });
    r.ok = true;
    return r;
  });
}

function painelFila(filtro) {
  return chamada_(function () {
    var todos = linhas_(ABAS.comentarios).map(function (r) {
      return {
        id: String(r[0]), data: String(r[1]), tipo: String(r[3]), texto: String(r[4]),
        flagOfensa: String(r[5]).toUpperCase() === 'TRUE',
        flagNome: String(r[6]).toUpperCase() === 'TRUE',
        status: String(r[7] || 'novo'), decidido_em: String(r[8] || ''),
        teste: String(r[9]).toUpperCase() === 'TRUE'
      };
    });
    var novos = todos.filter(function (x) { return x.status === 'novo'; }).length;
    var itens = filtro === 'todos' ? todos : todos.filter(function (x) { return x.status === 'novo'; });
    // Mais recentes primeiro; dentro do mesmo dia, a ordem da aba já é aleatória.
    itens.sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : 0; });
    return { ok: true, novos: novos, itens: itens, log: logRecente_(60) };
  });
}

function logRecente_(n) {
  var l = linhas_(ABAS.log);
  return l.slice(Math.max(0, l.length - n)).reverse().map(function (r) {
    return { quando: String(r[0]), quem: String(r[1]), acao: String(r[2]), item: String(r[3]), detalhe: String(r[4]) };
  });
}

function painelListas() {
  return chamada_(function () {
    var itens = linhas_(ABAS.mural).map(linhaParaMural).filter(function (x) { return x.ativo; });
    var m = montarMural(itens, { suficiente: false }, configAtual_());
    return { ok: true, acoes: m.acoes, comunicados: m.comunicados };
  });
}

function painelHistorico() {
  return chamada_(function () {
    var h = historicoV2_();
    return {
      ok: true,
      periodos: h.periodos.map(function (p) { return p.rotulo; }),
      linhas: h.linhas.map(function (l) {
        return { dimensao: l.dimensao, v3: l.v3, valores: l.valores.map(formatarHist) };
      })
    };
  });
}

/* ---------------- moderação ---------------- */

var NOMES_TIPO_PUB = { elogio: 'elogio', ponderacao: 'ponderação', sugestao: 'sugestão' };

function comentarioNovo_(id) {
  var achado = acharLinha_(ABAS.comentarios, id);
  if (!achado) throw new ErroUsuario_('Item não encontrado.');
  if (String(achado.valores[7]) !== 'novo') throw new ErroUsuario_('Este item já foi decidido por outra pessoa. Atualize a fila.');
  return achado;
}

function painelPublicar(id, tipo, texto, confirmarNome) {
  return chamada_(function (quem) {
    var v = validarPublicacao({ tipo: tipo, texto: texto, confirmarNome: confirmarNome === true });
    if (!v.ok) return v;
    return comLock_(function () {
      var achado = comentarioNovo_(id);
      if (mesmoTexto(achado.valores[4], v.dados.texto)) {
        return { ok: false, erro: 'Edite o texto antes de publicar: o original nunca vai para o Mural.' };
      }
      if (String(achado.valores[9]).toUpperCase() === 'TRUE') {
        return { ok: false, erro: 'Comentário de teste não vai para o Mural. Arquive.' };
      }
      var hoje = hojeSP_();
      var mid = novoId_('M');
      gravarLinha_(ABAS.mural, [mid, v.dados.tipo, '', '', protegerCelula(v.dados.texto), '', '', '', '', 0, hoje, 'TRUE'], 'fim');
      definirCelula_(ABAS.comentarios, achado.linha, COL_COMENT.status, 'publicado');
      definirCelula_(ABAS.comentarios, achado.linha, COL_COMENT.decidido_em, hoje);
      registrarLog_(quem, 'publicar', id, 'Publicado no Mural como ' + NOMES_TIPO_PUB[v.dados.tipo] + ' (versão editada) · ' + mid);
      return { ok: true, muralId: mid };
    });
  });
}

function decidir_(quem, id, status, acao, detalhe) {
  return comLock_(function () {
    var achado = comentarioNovo_(id);
    definirCelula_(ABAS.comentarios, achado.linha, COL_COMENT.status, status);
    definirCelula_(ABAS.comentarios, achado.linha, COL_COMENT.decidido_em, hojeSP_());
    registrarLog_(quem, acao, id, detalhe);
    return { ok: true };
  });
}

function painelEncaminharRH(id) {
  return chamada_(function (quem) {
    return decidir_(quem, id, 'rh', 'encaminhar_rh', 'Encaminhado ao RH (sai da fila do moderador)');
  });
}

function painelArquivar(id) {
  return chamada_(function (quem) {
    return decidir_(quem, id, 'arquivado', 'arquivar', 'Arquivado');
  });
}

function painelVirarAcao(id) {
  return chamada_(function (quem) {
    var r = decidir_(quem, id, 'arquivado', 'virar_acao', 'Usado como base de ação (texto original não vai para o Mural)');
    r.ref = id;
    return r;
  });
}

/* ---------------- ações e comunicados ---------------- */

function painelCriarAcao(dados) {
  return chamada_(function (quem) {
    var v = validarAcao(dados);
    if (!v.ok) return v;
    var o = v.dados;
    return comLock_(function () {
      var mid = novoId_('A');
      gravarLinha_(ABAS.mural, [mid, 'acao', o.tema, protegerCelula(o.ouvimos), protegerCelula(o.acao),
        protegerCelula(o.responsavel), protegerCelula(o.prazo), o.status, '', 0, hojeSP_(), 'TRUE'], 'fim');
      registrarLog_(quem, 'criar_acao', mid, 'Ação publicada: ' + o.acao + (o.ref ? ' · base: item ' + o.ref : ''));
      return { ok: true, id: mid };
    });
  });
}

function painelStatusAcao(id, status) {
  return chamada_(function (quem) {
    if (!STATUS_ACAO[status]) return { ok: false, erro: 'Status inválido.' };
    return comLock_(function () {
      var achado = acharLinha_(ABAS.mural, id);
      if (!achado || String(achado.valores[1]) !== 'acao') return { ok: false, erro: 'Ação não encontrada.' };
      var anterior = String(achado.valores[7]);
      definirCelula_(ABAS.mural, achado.linha, COL_MURAL.status_acao, status);
      registrarLog_(quem, 'status_acao', id, 'Status: ' + (STATUS_ACAO[anterior] || anterior) + ' → ' + STATUS_ACAO[status]);
      return { ok: true };
    });
  });
}

function painelCriarComunicado(dados) {
  return chamada_(function (quem) {
    var v = validarComunicado(dados);
    if (!v.ok) return v;
    var o = v.dados;
    return comLock_(function () {
      var mid = novoId_('K');
      gravarLinha_(ABAS.mural, [mid, 'comunicado', protegerCelula(o.titulo), '', protegerCelula(o.mensagem),
        '', '', '', protegerCelula(o.assinatura), 0, hojeSP_(), 'TRUE'], 'fim');
      registrarLog_(quem, 'criar_comunicado', mid, 'Comunicado publicado: ' + o.titulo);
      return { ok: true, id: mid };
    });
  });
}
