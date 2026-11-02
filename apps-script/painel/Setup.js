/**
 * Pulso v3 — preparação da planilha. Rodar manualmente pelo editor, pela conta
 * dona da planilha, UMA vez (é idempotente: rodar de novo não duplica nada).
 *
 * Cria apenas as abas novas. As abas Segunda-feira e Sexta-feira não são
 * abertas para escrita: a função confere o tamanho delas antes e depois.
 */

function configurarPulsoV3() {
  var ss = planilha_();
  var antes = tamanhoAbasV2_(ss);
  var cab = cabecalhos_();

  Object.keys(cab).forEach(function (nome) {
    var sh = ss.getSheetByName(nome) || ss.insertSheet(nome);
    var colunas = cab[nome];
    if (sh.getLastRow() === 0) {
      var topo = sh.getRange(1, 1, 1, colunas.length);
      topo.setNumberFormat('@');
      topo.setValues([colunas]);
      sh.setFrozenRows(1);
    }
    // Formato explícito por coluna para as próximas 2000 linhas.
    FORMATOS[nome].forEach(function (fmt, i) {
      sh.getRange(2, i + 1, 2000, 1).setNumberFormat(fmt);
    });
  });

  var config = ss.getSheetByName(ABAS.config);
  var existentes = config.getLastRow() >= 2
    ? config.getRange(2, 1, config.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); })
    : [];
  [['NMIN', '5'],
    ['CANAL_GRAVE', CONFIG_PADRAO.CANAL_GRAVE],
    ['CANAL_GRAVE_ROTULO', CONFIG_PADRAO.CANAL_GRAVE_ROTULO],
    ['LINK_QUIZ', CONFIG_PADRAO.LINK_QUIZ],
    ['LINK_FLASH', CONFIG_PADRAO.LINK_FLASH],
    ['ALERTA_EMAIL', CONFIG_PADRAO.ALERTA_EMAIL],
    ['LINK_PAINEL', '']
  ].forEach(function (kv) {
    if (existentes.indexOf(kv[0]) < 0) gravarLinha_(ABAS.config, kv, 'fim');
  });

  var depois = tamanhoAbasV2_(ss);
  if (JSON.stringify(antes) !== JSON.stringify(depois)) {
    throw new Error('As abas históricas mudaram durante o setup. Pare e verifique: ' +
      JSON.stringify(antes) + ' -> ' + JSON.stringify(depois));
  }
  console.log('Pulso v3 configurado. Abas históricas intactas: ' + JSON.stringify(depois));
}

function tamanhoAbasV2_(ss) {
  return [ABAS.v2seg, ABAS.v2sex].map(function (nome) {
    var sh = ss.getSheetByName(nome);
    return sh ? nome + ':' + sh.getLastRow() + 'x' + sh.getLastColumn() : nome + ':ausente';
  });
}

/* Lê as abas antigas (somente leitura) e devolve o histórico agregado. */
function historicoV2_() {
  var ss = planilha_();
  function ler(nome) {
    var sh = ss.getSheetByName(nome);
    if (!sh || sh.getLastRow() < 2) return [];
    return sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  }
  return agregarHistoricoV2(ler(ABAS.v2seg), ler(ABAS.v2sex), hojeSP_());
}

/*
 * Conferência com os valores de referência (Comida e Empresa).
 * Imprime só a tabela agregada no log de execução, nunca linhas individuais.
 * Para comparar com a referência calculada até 19/10, usa só dados até essa data.
 */
function conferirHistoricoV2() {
  var ss = planilha_();
  function ler(nome) {
    var sh = ss.getSheetByName(nome);
    if (!sh || sh.getLastRow() < 2) return [];
    return sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues().filter(function (r) {
      var d = parseDataV2(r[0]);
      return d && (d.y * 10000 + d.m * 100 + d.d) <= 20261019;
    });
  }
  var h = agregarHistoricoV2(ler(ABAS.v2seg), ler(ABAS.v2sex), '2026-10-19');
  var referencia = {
    'Comida / Refeição do staff': ['2,90 (101)', '3,12 (76)', '3,53 (53)', '3,56 (16)'],
    'Empresa / Trabalhar aqui': ['3,92 (101)', '3,78 (76)', '3,68 (53)', '4,12 (16)']
  };
  var linhasTexto = ['Período: ' + h.periodos.map(function (p) { return p.rotulo; }).join(' | ')];
  var tudoOk = true;
  h.linhas.forEach(function (l) {
    var obtido = l.valores.map(formatarHist);
    var ref = referencia[l.dimensao];
    var status = '';
    if (ref) {
      var igual = JSON.stringify(obtido) === JSON.stringify(ref);
      tudoOk = tudoOk && igual;
      status = igual ? '  [CONFERE]' : '  [DIVERGE da referência: ' + ref.join(' | ') + ']';
    }
    linhasTexto.push(l.dimensao + ': ' + obtido.join(' | ') + status);
  });
  linhasTexto.push(tudoOk ? 'Resultado: confere com a referência.' : 'Resultado: há divergência.');
  console.log(linhasTexto.join('\n'));
  return { ok: tudoOk, tabela: linhasTexto };
}
