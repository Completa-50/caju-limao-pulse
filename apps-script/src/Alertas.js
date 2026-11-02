/**
 * Pulso v3 — alerta semanal por e-mail (projeto PÚBLICO, executa como a dona).
 *
 * Toda segunda às 9h avalia a semana ISO que acabou de fechar. Se alguma
 * pergunta ficar abaixo dos cortes (crítico < 2,5; atenção < 3,2) com 5 ou mais
 * respostas, manda um e-mail para Config.ALERTA_EMAIL só com números agregados.
 * Sem comentários, sem área, sem respostas individuais. Não envia nada à equipe.
 *
 * Instalação: rodar instalarAlertaSemanal() uma vez pelo editor.
 */

function verificarAlertas() {
  var config = configAtual_();
  var semana = semanaIso(somarDias(hojeSP_(), -7));
  var av = avaliarAlertas(respostas_(), semana, config.NMIN);
  if (!av.suficiente || !av.alertas.length) {
    console.log('Alerta Pulso ' + semana + ': nada a enviar (n=' + av.n + ').');
    return av;
  }
  var pior = av.alertas.some(function (a) { return a.nivel === 'crítico'; }) ? 'crítico' : 'atenção';
  MailApp.sendEmail({
    to: config.ALERTA_EMAIL,
    subject: 'Pulso CJ AN · alerta de ' + pior + ' · semana ' + semana,
    body: textoAlerta(av, config.LINK_PAINEL)
  });
  console.log('Alerta Pulso ' + semana + ' enviado para ' + config.ALERTA_EMAIL + '.');
  return av;
}

function instalarAlertaSemanal() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'verificarAlertas') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('verificarAlertas').timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).inTimezone(FUSO).create();
  console.log('Alerta semanal instalado: segundas, 9h (America/Sao_Paulo).');
}
