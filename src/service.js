// Servico central de gravacao de reportes. Botao e formulario passam por aqui,
// para que os portoes e o upsert vivam num unico lugar (e nao divirjam).
import { getStore } from './store/index.js';
import { kickoffGate, valueCapGate, totalStake } from './gates.js';
import { config } from './config.js';
import { VERSION } from './version.js';

// Grava o clique de um botao simples: 'taken' (peguei) ou 'declined' (nao peguei).
// Para 'taken', a perna herda a stake (unidades) e a odd DA TIP — o cliente pegou
// como divulgado. O tipster pode ajustar depois no dashboard.
export function recordButton({ betKey, clientId, clientName, status, actionTs, now = Date.now() }) {
  if (status !== 'taken' && status !== 'declined') {
    throw new Error(`status invalido para botao: ${status}`);
  }
  const store = getStore();
  const tip = store.getTip(betKey);

  // Portao do apito vale para os dois botoes: nada de registrar apos o jogo.
  const ko = kickoffGate(tip, { now, strict: config.strictGates });
  if (!ko.ok) return { ok: false, ...ko };

  // 'taken' vira uma perna com a stake/odd da tip (o que o cliente pegou "como esta").
  const legs = status === 'taken'
    ? [{ stakeUnits: tip?.stakeUnits ?? null, odd: tip?.odd ?? null }]
    : null;

  const res = store.upsertReport({
    betKey,
    clientId,
    clientName,
    status,
    odd: status === 'taken' ? (tip?.odd ?? null) : null,
    stakes: legs,
    source: 'button',
    actionTs: actionTs || new Date(now).toISOString(),
    version: VERSION,
  });

  const msg = status === 'taken'
    ? 'Registrado: voce PEGOU (como divulgado). Se entrou com valor ou odd diferente, use "Peguei diferente".'
    : 'Registrado: voce NAO pegou esta. Nada sera cobrado por ela.';

  return { ok: true, applied: res.applied, message: msg, record: res.record };
}

// Grava o formulario (Mini App): 'different', com uma ou mais pernas.
// stakes: [{ stakeUnits, odd, house? }] — tudo em UNIDADES.
export function recordForm({ betKey, clientId, clientName, stakes, line = '', actionTs, now = Date.now() }) {
  const store = getStore();
  const tip = store.getTip(betKey);

  const ko = kickoffGate(tip, { now, strict: config.strictGates });
  if (!ko.ok) return { ok: false, ...ko };

  const legs = (Array.isArray(stakes) ? stakes : [])
    .map((s) => ({ house: String(s.house || '').trim(), stakeUnits: Number(s.stakeUnits), odd: Number(s.odd) }))
    .filter((l) => !Number.isNaN(l.stakeUnits) && l.stakeUnits > 0);

  if (legs.length === 0) {
    return { ok: false, code: 'VALOR_INVALIDO', message: 'Informe pelo menos uma entrada com stake (em unidades) maior que zero.' };
  }

  const total = totalStake(legs);
  const cap = valueCapGate(tip, total, { now, strict: config.strictGates });
  if (!cap.ok) return { ok: false, ...cap };

  // odd "principal" = a da perna de maior stake, so para exibicao rapida.
  const principal = [...legs].sort((a, b) => b.stakeUnits - a.stakeUnits)[0];

  const res = store.upsertReport({
    betKey,
    clientId,
    clientName,
    status: 'different',
    odd: principal?.odd ?? null,
    stakes: legs,
    line: line ? String(line).trim() : null,
    source: 'form',
    actionTs: actionTs || new Date(now).toISOString(),
    version: VERSION,
  });

  return {
    ok: true,
    applied: res.applied,
    message: res.applied
      ? `Registrado: ${total}u em ${legs.length} entrada(s).`
      : 'Ja havia um registro mais recente para esta aposta; o mais novo foi mantido.',
    record: res.record,
  };
}
