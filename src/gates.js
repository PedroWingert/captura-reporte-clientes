// Portoes de negocio. Ambos FALHAM FECHADO: na duvida, recusam.
//
// Cada recusa devolve { ok:false, code, message } com a mensagem ja pronta para
// o cliente ler — e cada mensagem diz o proximo passo concreto (armadilha 5).
// "Nao foi possivel" nunca aparece sozinho.

// Armadilha 3: feche a porta no apito, e falhe fechando.
// Depois que o jogo comeca, o cliente nao pode mais registrar. E se o horario do
// jogo nao for conhecido, RECUSA — nao libera.
export function kickoffGate(tip, { now = Date.now() } = {}) {
  if (!tip) {
    return { ok: false, code: 'TIP_DESCONHECIDA', message: 'Esta tip nao foi encontrada. Volte ao canal e abra pelo botao da mensagem da tip.' };
  }
  const koRaw = tip.kickoff;
  const ko = koRaw ? new Date(koRaw).getTime() : NaN;
  if (!koRaw || Number.isNaN(ko)) {
    // Sem horario -> falha fechado.
    return {
      ok: false,
      code: 'APITO_DESCONHECIDO',
      message: 'Nao consegui confirmar o horario do jogo, entao o registro esta bloqueado por seguranca. Fale com quem envia as tips para liberar manualmente.',
    };
  }
  if (now >= ko) {
    return {
      ok: false,
      code: 'JOGO_COMECOU',
      message: 'O jogo ja comecou e o registro foi encerrado. Para tips futuras, responda antes do apito.',
    };
  }
  return { ok: true };
}

// Armadilha 4: teto no valor, tambem falhando fechado.
// O cliente nao pode reportar mais do que a stake da tip permite para a banca dele.
// Se algum dado para calcular o teto faltar, RECUSA.
//
// tip.capValue e o teto absoluto (na moeda do cliente) para este cliente nesta tip.
// Quem monta a tip calcula esse teto (ex.: unidades da tip x valor da unidade do
// cliente). Aqui apenas exigimos que ele exista e conferimos o total reportado.
export function valueCapGate(tip, totalReported, { now = Date.now() } = {}) {
  if (!tip) {
    return { ok: false, code: 'TIP_DESCONHECIDA', message: 'Esta tip nao foi encontrada. Abra pelo botao da mensagem da tip no canal.' };
  }
  const cap = tip.capValue;
  if (cap === undefined || cap === null || Number.isNaN(Number(cap))) {
    return {
      ok: false,
      code: 'TETO_DESCONHECIDO',
      message: 'Nao consegui conferir o teto de valor desta tip, entao o registro esta bloqueado por seguranca. Fale com quem envia as tips.',
    };
  }
  const total = Number(totalReported);
  if (Number.isNaN(total) || total <= 0) {
    return {
      ok: false,
      code: 'VALOR_INVALIDO',
      message: 'Informe um valor de entrada maior que zero. Digite quanto entrou em cada casa.',
    };
  }
  if (total > Number(cap)) {
    return {
      ok: false,
      code: 'ACIMA_DO_TETO',
      message: `O total informado (${total}) passa do teto desta tip (${cap}). Ajuste os valores para caber no limite e envie de novo.`,
    };
  }
  return { ok: true };
}

// Soma o total reportado a partir das stakes (uma ou varias casas).
export function totalStake(stakes) {
  if (!Array.isArray(stakes)) return NaN;
  return stakes.reduce((acc, s) => acc + Number(s.stake || 0), 0);
}
