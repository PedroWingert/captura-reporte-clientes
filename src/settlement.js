// Calculo de resultado (acerto de contas), tudo em UNIDADES.
//
// Cada aposta de um cliente e uma lista de "pernas" (legs): { stakeUnits, odd }.
// Um cliente pode ter varias pernas (ex.: dividiu em casas com odds diferentes),
// e cada cliente pode ter pego odd/valor diferente dos outros na mesma tip.
//
// Resultado da tip: 'green' (bateu), 'red' (deu), 'void' (anulada) ou null (pendente).
//   green -> lucro = stake * (odd - 1)
//   red   -> prejuizo = -stake
//   void  -> 0 (stake devolvida)
//   null  -> 0 (ainda nao resolvida)

export function legPnlUnits(stakeUnits, odd, result) {
  const s = Number(stakeUnits);
  const o = Number(odd);
  if (Number.isNaN(s)) return 0;
  if (result === 'green') {
    if (Number.isNaN(o)) return 0; // sem odd nao da pra calcular o lucro
    return s * (o - 1);
  }
  if (result === 'red') return -s;
  return 0; // void ou pendente
}

// Resultado efetivo de UMA perna: a perna pode ter resultado proprio
// (quando o cliente pegou linhas diferentes em cada entrada); senao segue o
// resultado da aposta (override do cliente ou da tip).
function legResult(leg, fallback) {
  const own = leg && leg.result;
  return own === 'green' || own === 'red' || own === 'void' ? own : fallback;
}

// Soma o P/L (em unidades) de uma aposta (varias pernas) dado o resultado da tip.
// Cada perna pode carregar seu proprio resultado (leg.result); quando ausente,
// usa o resultado passado (override do cliente ou da tip).
export function entryPnlUnits(legs, result) {
  if (!Array.isArray(legs)) return 0;
  return legs.reduce((acc, l) => acc + legPnlUnits(l.stakeUnits, l.odd, legResult(l, result)), 0);
}

// Stake total (unidades) de uma aposta.
export function entryStakeUnits(legs) {
  if (!Array.isArray(legs)) return 0;
  return legs.reduce((acc, l) => acc + (Number(l.stakeUnits) || 0), 0);
}

// True se alguma perna com resultado 'green' tem stake sem odd (precisa o tipster
// completar no dashboard). Considera o resultado proprio da perna, quando houver.
export function entryFaltaOdd(legs, result) {
  return (legs || []).some((l) => legResult(l, result) === 'green'
    && (Number(l.stakeUnits) || 0) > 0 && Number.isNaN(Number(l.odd)));
}

// True se a aposta tem pelo menos uma perna com resultado definido (proprio ou
// herdado). Usado para saber se a stake ja entra na base do ROI.
export function entryResolved(legs, result) {
  if (result === 'green' || result === 'red' || result === 'void') return true;
  return (legs || []).some((l) => l && (l.result === 'green' || l.result === 'red' || l.result === 'void'));
}

// Converte unidades em reais para um cliente (unitValue = R$ por unidade).
// Sem valor de unidade cadastrado (null/''/undefined), nao da para converter.
export function unitsToBRL(units, unitValue) {
  if (unitValue === null || unitValue === undefined || unitValue === '') return null;
  const v = Number(unitValue);
  if (Number.isNaN(v)) return null;
  return units * v;
}
