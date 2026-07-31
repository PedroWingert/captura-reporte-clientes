// Servico central de gravacao de reportes. Botao e formulario passam por aqui,
// para que os portoes e o upsert vivam num unico lugar (e nao divirjam).
import { getStore } from './store/index.js';
import { kickoffGate, valueCapGate, totalStake } from './gates.js';
import { VERSION } from './version.js';

// Grava o clique de um botao simples: 'taken' (peguei) ou 'declined' (nao peguei).
// odd e opcional (odd divulgada, para 'taken').
export function recordButton({ betKey, clientId, clientName, status, odd = null, actionTs, now = Date.now() }) {
  if (status !== 'taken' && status !== 'declined') {
    throw new Error(`status invalido para botao: ${status}`);
  }
  const store = getStore();
  const tip = store.getTip(betKey);

  // Portao do apito vale para os dois botoes: nada de registrar apos o jogo.
  const ko = kickoffGate(tip, { now });
  if (!ko.ok) return { ok: false, ...ko };

  const res = store.upsertReport({
    betKey,
    clientId,
    clientName,
    status,
    odd: status === 'taken' ? odd : null,
    stakes: null,
    source: 'button',
    actionTs: actionTs || new Date(now).toISOString(),
    version: VERSION,
  });

  const msg = status === 'taken'
    ? `Registrado: voce PEGOU${odd ? ` @${odd}` : ''}. Se entrou com valor ou odd diferente, use "Peguei diferente".`
    : 'Registrado: voce NAO pegou esta. Nada sera cobrado por ela.';

  return { ok: true, applied: res.applied, message: msg, record: res.record };
}

// Grava o formulario (Mini App): 'different', possivelmente dividido em varias casas.
// stakes: [{ house, stake, odd }]. Passa pelo portao do apito e pelo teto de valor.
export function recordForm({ betKey, clientId, clientName, stakes, actionTs, now = Date.now() }) {
  const store = getStore();
  const tip = store.getTip(betKey);

  const ko = kickoffGate(tip, { now });
  if (!ko.ok) return { ok: false, ...ko };

  if (!Array.isArray(stakes) || stakes.length === 0) {
    return { ok: false, code: 'VALOR_INVALIDO', message: 'Informe pelo menos uma entrada (casa, valor e odd).' };
  }

  const total = totalStake(stakes);
  const cap = valueCapGate(tip, total, { now });
  if (!cap.ok) return { ok: false, ...cap };

  // odd "principal" = a de maior stake, so para exibicao rapida no relatorio.
  const principal = [...stakes].sort((a, b) => Number(b.stake) - Number(a.stake))[0];

  const res = store.upsertReport({
    betKey,
    clientId,
    clientName,
    status: 'different',
    odd: principal?.odd ?? null,
    stakes: stakes.map((s) => ({ house: String(s.house || '').trim(), stake: Number(s.stake), odd: Number(s.odd) })),
    source: 'form',
    actionTs: actionTs || new Date(now).toISOString(),
    version: VERSION,
  });

  return {
    ok: true,
    applied: res.applied,
    message: res.applied
      ? `Registrado: entrada de ${total} em ${stakes.length} casa(s).`
      : 'Ja havia um registro mais recente para esta aposta; o mais novo foi mantido.',
    record: res.record,
  };
}
