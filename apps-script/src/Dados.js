/**
 * Pulso v3 — acesso à planilha. Compartilhado pelos projetos público e painel.
 *
 * A planilha é aberta por ID (Script Property PLANILHA_ID). Na homologação,
 * PLANILHA_ID aponta para uma planilha de teste; em produção, para a planilha
 * real. As abas antigas (Segunda-feira, Sexta-feira) são apenas lidas.
 */

var FUSO = 'America/Sao_Paulo';
var PLANILHA_ID_PADRAO = '1RJxUPC_bPwy6HogjoEzBi6YntZBChClz9hirctY6U_M';

var ABAS = {
  respostas: 'Respostas_v3',
  comentarios: 'Comentarios_v3',
  mural: 'Mural_Publicado',
  log: 'Log_Moderacao',
  config: 'Config',
  v2seg: 'Segunda-feira',
  v2sex: 'Sexta-feira'
};

/* Função (e não variável global) para não depender da ordem de carga dos arquivos. */
function cabecalhos_() {
  return {
    Respostas_v3: COLS_RESPOSTAS,
    Comentarios_v3: ['id', 'data', 'semana_iso', 'tipo', 'texto', 'flag_ofensa', 'flag_nome',
      'status', 'decidido_em', 'teste'],
    Mural_Publicado: COLS_MURAL,
    Log_Moderacao: ['quando', 'quem', 'acao', 'item_id', 'detalhe'],
    Config: ['chave', 'valor']
  };
}

/* Formatos por coluna: '@' = texto puro (impede o Sheets de converter em data),
 * '0' = número inteiro. É isso que evita o defeito da coluna Media da v2. */
var FORMATOS = {
  Respostas_v3: ['@', '@', '@', '@', '@', '0', '0', '0', '0', '0', '@'],
  Comentarios_v3: ['@', '@', '@', '@', '@', '@', '@', '@', '@', '@'],
  Mural_Publicado: ['@', '@', '@', '@', '@', '@', '@', '@', '@', '0', '@', '@'],
  Log_Moderacao: ['@', '@', '@', '@', '@'],
  Config: ['@', '@']
};

var COL_COMENT = { id: 1, status: 8, decidido_em: 9 };
var COL_MURAL = { id: 1, tipo: 2, status_acao: 8, apoios: 10, ativo: 12 };

function planilha_() {
  var id = PropertiesService.getScriptProperties().getProperty('PLANILHA_ID') || PLANILHA_ID_PADRAO;
  return SpreadsheetApp.openById(id);
}

function aba_(nome) {
  var sh = planilha_().getSheetByName(nome);
  if (!sh) throw new Error('Aba ausente: ' + nome + '. Rode configurarPulsoV3().');
  return sh;
}

function hojeSP_() {
  return Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd');
}

function agoraSP_() {
  return Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd HH:mm');
}

/* ID aleatório curto, sem relação com ordem de chegada. */
function novoId_(prefixo) {
  return prefixo + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
}

/* Linhas de dados (sem cabeçalho). */
function linhas_(nomeAba) {
  var sh = aba_(nomeAba);
  var ultima = sh.getLastRow();
  if (ultima < 2) return [];
  var cab = cabecalhos_()[nomeAba];
  var ncol = cab ? cab.length : sh.getLastColumn();
  return sh.getRange(2, 1, ultima - 1, ncol).getValues();
}

/*
 * Grava uma linha com formato explícito por coluna.
 * posicao: 'fim' ou 'aleatoria'. A posição aleatória é usada nos comentários
 * para que a ordem das linhas não permita casar um comentário com a resposta
 * gravada no mesmo instante em Respostas_v3.
 */
function gravarLinha_(nomeAba, valores, posicao) {
  var sh = aba_(nomeAba);
  var ultima = Math.max(sh.getLastRow(), 1);
  var linha = ultima + 1;
  if (posicao === 'aleatoria' && ultima >= 2) {
    linha = 2 + Math.floor(Math.random() * ultima); // 2 .. ultima+1
    if (linha <= ultima) sh.insertRowBefore(linha);
  }
  var rng = sh.getRange(linha, 1, 1, valores.length);
  rng.setNumberFormats([FORMATOS[nomeAba].slice(0, valores.length)]);
  rng.setValues([valores]);
  return linha;
}

/* Procura a linha (número na planilha) de um id na coluna 1. */
function acharLinha_(nomeAba, id) {
  var dados = linhas_(nomeAba);
  for (var i = 0; i < dados.length; i++) {
    if (String(dados[i][0]) === String(id)) return { linha: i + 2, valores: dados[i] };
  }
  return null;
}

function definirCelula_(nomeAba, linha, coluna, valor, formato) {
  var c = aba_(nomeAba).getRange(linha, coluna);
  if (formato) c.setNumberFormat(formato);
  c.setValue(valor);
}

function configAtual_() {
  var sh = planilha_().getSheetByName(ABAS.config);
  return lerConfig(sh && sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues() : []);
}

function respostas_() {
  return linhas_(ABAS.respostas).map(linhaParaResposta);
}

function comLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new ErroUsuario_('Servidor ocupado. Tente de novo em instantes.');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/* Erro com mensagem que pode ser mostrada a quem usa. */
function ErroUsuario_(msg) {
  this.message = msg;
  this.usuario = true;
}
ErroUsuario_.prototype = Object.create(Error.prototype);

function registrarLog_(quem, acao, itemId, detalhe) {
  gravarLinha_(ABAS.log, [agoraSP_(), quem, acao, itemId || '', protegerCelula(detalhe || '')], 'fim');
}
