/**
 * Pulso v3 — implantação PÚBLICA.
 * Executar como: eu (dona da planilha). Quem pode acessar: qualquer pessoa.
 *
 * Rotas:
 *   GET  ?acao=mural   -> JSON do Mural (só Mural_Publicado, médias agregadas com n >= NMIN e Config)
 *   GET  ?acao=config  -> JSON com canal reservado e NMIN (usado pelo formulário)
 *   GET  ?acao=ping    -> {ok:true}
 *   POST {acao:'enviar', notas, area, textos, teste, confirmarOfensa, site}
 *   POST {acao:'apoiar', id}
 *
 * Nenhuma rota devolve respostas individuais nem comentários. Nada que
 * identifique quem respondeu é registrado: sem IP, user agent, e-mail ou horário.
 */

var LIMITE_ENVIOS_POR_MINUTO = 40;
var LIMITE_APOIOS_POR_MINUTO = 120;

function doGet(e) {
  var acao = (e && e.parameter && e.parameter.acao) || '';
  return responder_(function () {
    if (acao === 'mural') return rotaMural_();
    if (acao === 'config') return rotaConfig_();
    if (acao === 'ping') return { ok: true };
    return { ok: false, erro: 'Rota inexistente.' };
  });
}

function doPost(e) {
  return responder_(function () {
    var corpo = e && e.postData ? String(e.postData.contents || '') : '';
    if (!corpo) return { ok: false, erro: 'Envio vazio.' };
    if (corpo.length > LIMITE_PAYLOAD) return { ok: false, erro: 'Envio grande demais.' };
    var p;
    try {
      p = JSON.parse(corpo);
    } catch (err) {
      return { ok: false, erro: 'Envio em formato inválido.' };
    }
    if (!p || typeof p !== 'object') return { ok: false, erro: 'Envio inválido.' };
    if (p.acao === 'apoiar') return apoiar_(p.id);
    if (p.acao === undefined || p.acao === 'enviar') return enviar_(p);
    return { ok: false, erro: 'Ação desconhecida.' };
  });
}

function responder_(fn) {
  var saida;
  try {
    saida = fn();
  } catch (err) {
    if (err && err.usuario) {
      saida = { ok: false, erro: err.message };
    } else {
      console.error(err && err.stack ? err.stack : err);
      saida = { ok: false, erro: 'Erro no servidor. Nada foi gravado. Tente de novo.' };
    }
  }
  return ContentService.createTextOutput(JSON.stringify(saida))
    .setMimeType(ContentService.MimeType.JSON);
}

/* Limite global por minuto, sem identificar ninguém. */
function dentroDoLimite_(chave, limite) {
  var cache = CacheService.getScriptCache();
  var k = chave + ':' + Utilities.formatDate(new Date(), FUSO, 'yyyyMMddHHmm');
  var atual = Number(cache.get(k) || 0);
  if (atual >= limite) return false;
  cache.put(k, String(atual + 1), 120);
  return true;
}

function enviar_(p) {
  // Honeypot: campo invisível que pessoas não preenchem. Robô recebe "ok" e nada é gravado.
  if (typeof p.site === 'string' && p.site.trim() !== '') return { ok: true, id: 'ok' };

  var v = validarEnvio(p);
  if (!v.ok) return v;
  var d = v.dados;

  var tiposPreenchidos = TIPOS_COMENTARIO.filter(function (t) { return d.textos[t]; });
  var ofensa = tiposPreenchidos.some(function (t) { return temOfensa(d.textos[t]); });
  if (ofensa && !d.confirmarOfensa) {
    // Nada é gravado: o formulário mostra o aviso e a pessoa decide.
    return { ok: false, ofensa: true, erro: 'Seu comentário tem palavras ofensivas.' };
  }

  if (!dentroDoLimite_('envio', LIMITE_ENVIOS_POR_MINUTO)) {
    return { ok: false, erro: 'Muitos envios neste minuto. Tente de novo em instantes.' };
  }

  return comLock_(function () {
    var hoje = hojeSP_();
    var semana = semanaIso(hoje);
    var id = novoId_('R');
    gravarLinha_(ABAS.respostas, [
      id, hoje, semana, PULSO_VERSAO, d.area,
      d.notas.disposicao, d.notas.escala, d.notas.comida, d.notas.lideranca, d.notas.empresa,
      d.teste ? 'TRUE' : 'FALSE'
    ], 'fim');

    tiposPreenchidos.forEach(function (t) {
      var texto = d.textos[t];
      gravarLinha_(ABAS.comentarios, [
        novoId_('C'), hoje, semana, t, protegerCelula(texto),
        temOfensa(texto) ? 'TRUE' : 'FALSE',
        temNome(texto) ? 'TRUE' : 'FALSE',
        'novo', '', d.teste ? 'TRUE' : 'FALSE'
      ], 'aleatoria');
    });
    return { ok: true, id: id };
  });
}

function apoiar_(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(id)) {
    return { ok: false, erro: 'Sugestão inválida.' };
  }
  if (!dentroDoLimite_('apoio', LIMITE_APOIOS_POR_MINUTO)) {
    return { ok: false, erro: 'Muitos apoios neste minuto. Tente de novo em instantes.' };
  }
  return comLock_(function () {
    var achado = acharLinha_(ABAS.mural, id);
    if (!achado) return { ok: false, erro: 'Sugestão não encontrada.' };
    var item = linhaParaMural(achado.valores);
    if (item.tipo !== 'sugestao' || !item.ativo) return { ok: false, erro: 'Sugestão não encontrada.' };
    var novo = item.apoios + 1;
    definirCelula_(ABAS.mural, achado.linha, COL_MURAL.apoios, novo, '0');
    return { ok: true, apoios: novo };
  });
}

function rotaMural_() {
  var config = configAtual_();
  var semanas = semanasJanela(hojeSP_(), 4);
  var pulso = agregarMuralPulso(respostas_(), semanas, config.NMIN);
  var itens = linhas_(ABAS.mural).map(linhaParaMural);
  return montarMural(itens, pulso, config);
}

function rotaConfig_() {
  var c = configAtual_();
  return {
    ok: true,
    canal_grave: c.CANAL_GRAVE,
    canal_grave_rotulo: c.CANAL_GRAVE_ROTULO || '',
    nmin: c.NMIN
  };
}
