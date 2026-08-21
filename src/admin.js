// Camada do dashboard de acerto de contas. Monta os dados (entradas por cliente,
// P/L em unidades, totais do mes) e aplica as mutacoes (resultado da tip, edicao
// de perna, cadastro de cliente). Tudo em UNIDADES; R$ = unidades x valor da unidade.
import { getStore } from './store/index.js';
import { entryPnlUnits, entryStakeUnits, entryFaltaOdd, unitsToBRL } from './settlement.js';
import { betKey, assertBetComplete } from './betkey.js';
import { VERSION } from './version.js';

// Roster = cadastro de clientes juntado com os clientIds ja vistos nos reports.
export function buildRoster() {
  const store = getStore();
  const clients = store.getClients();
  const seen = new Map();
  for (const r of store.allReports()) {
    if (!seen.has(String(r.clientId))) seen.set(String(r.clientId), r.clientName);
  }
  const ids = new Set([...Object.keys(clients), ...seen.keys()]);
  const roster = [...ids]
    .filter((id) => !(clients[id] && clients[id].hidden)) // clientes ocultos saem do acerto
    .map((id) => {
      const meta = clients[id] || {};
      return { id, name: meta.name || seen.get(id) || id, unitValue: meta.unitValue ?? null };
    });
  roster.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return roster;
}

// Clientes marcados como ocultos (nao entram no acerto, mas podem ser reexibidos).
export function listHiddenClients() {
  const store = getStore();
  const clients = store.getClients();
  const seen = new Map();
  for (const r of store.allReports()) {
    if (!seen.has(String(r.clientId))) seen.set(String(r.clientId), r.clientName);
  }
  return Object.keys(clients)
    .filter((id) => clients[id] && clients[id].hidden)
    .map((id) => ({ id, name: clients[id].name || seen.get(id) || id }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function ym(dateIso) {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const round2 = (n) => Math.round(n * 100) / 100;

// Monta todo o dado do dashboard. `month` ('YYYY-MM') filtra os totais por mes.
export function buildDashboard({ month = null } = {}) {
  const store = getStore();
  const roster = buildRoster();
  const tips = store.listTips().sort((a, b) => new Date(b.date || b.updatedTs) - new Date(a.date || a.updatedTs));

  const totals = new Map(roster.map((c) => [c.id, 0]));
  const tipViews = [];

  for (const tip of tips) {
    const tipMonth = ym(tip.date || tip.updatedTs);
    const byClient = new Map(store.reportsForTip(tip.betKey).map((r) => [String(r.clientId), r]));

    const entries = roster.map((c) => {
      const r = byClient.get(c.id);
      let estado = 'sem_resposta';
      let legs = [];
      let stake = 0;
      let pnl = 0;
      let faltaOdd = false;
      let resultOverride = null;
      if (r) {
        estado = r.status; // taken | declined | different
        resultOverride = r.resultOverride || null;
        if (r.status !== 'declined') {
          legs = r.stakes || [];
          stake = entryStakeUnits(legs);
          const effResult = resultOverride || tip.result || null; // individual vence a tip
          pnl = entryPnlUnits(legs, effResult);
          faltaOdd = entryFaltaOdd(legs, effResult);
        }
      }
      if ((!month || tipMonth === month)) totals.set(c.id, (totals.get(c.id) || 0) + pnl);
      return { clientId: c.id, clientName: c.name, estado, legs, stakeUnits: round2(stake), pnlUnits: round2(pnl), faltaOdd, line: r ? (r.line || null) : null, resultOverride };
    });

    tipViews.push({
      betKey: tip.betKey,
      date: tip.date || null,
      month: tipMonth,
      home: tip.home, away: tip.away, market: tip.market, line: tip.line || '',
      stakeUnits: tip.stakeUnits ?? null, odd: tip.odd ?? null,
      result: tip.result || null,
      entries,
    });
  }

  const totais = roster.map((c) => {
    const units = round2(totals.get(c.id) || 0);
    const brl = c.unitValue != null ? unitsToBRL(units, c.unitValue) : null;
    return { clientId: c.id, name: c.name, unitValue: c.unitValue ?? null, units, brl: brl != null ? round2(brl) : null };
  });

  // Meses disponiveis (para o seletor).
  const meses = [...new Set(tipViews.map((t) => t.month).filter(Boolean))].sort().reverse();

  return { roster, tips: tipViews, totals: totais, month: month || null, meses, hiddenClients: listHiddenClients() };
}

// ---- mutacoes ----
export function setResult(betKey, result) {
  const ok = ['green', 'red', 'void', null].includes(result);
  if (!ok) throw new Error('resultado invalido');
  return getStore().setTipResult(betKey, result);
}

// Nome amigavel do cliente (do roster), para gravar em registros criados na mao.
function rosterNameFor(clientId) {
  const c = buildRoster().find((x) => String(x.id) === String(clientId));
  return c ? c.name : String(clientId);
}

// Limpa uma lista de pernas vindas do dashboard: descarta stake invalida.
function cleanLegs(legs, { exigeStake = false } = {}) {
  return (Array.isArray(legs) ? legs : [])
    .map((l) => ({ house: String(l.house || '').trim(), stakeUnits: Number(l.stakeUnits), odd: Number(l.odd) }))
    .filter((l) => !Number.isNaN(l.stakeUnits) && (!exigeStake || l.stakeUnits > 0));
}

// Lanca/edita a entrada de um cliente pelo dashboard. Cria o registro quando o
// cliente ficou "sem resposta" (nao clicou nada), aceitando legs, linha e
// resultado individual de uma vez. Campos ausentes (undefined) sao preservados.
export function saveEntry(betKey, clientId, { legs, line, result } = {}) {
  const store = getStore();
  if (!store.getTip(betKey)) return null; // a aposta precisa existir
  const clean = legs !== undefined ? cleanLegs(legs) : undefined;
  return store.adminSetEntry(betKey, clientId, { legs: clean, line, result, clientName: rosterNameFor(clientId) });
}

// Cria uma aposta "na mao" (nao veio da captura do grupo) e ja lanca as entradas
// dos clientes escolhidos. bet: { date, home, away, market, side?, line?, stakeUnits?, odd?, result? }
// entries: [{ clientId, legs:[{stakeUnits,odd}], line?, result? }] — so entra quem tem stake.
export function addManualTip(bet, entries) {
  const store = getStore();
  const meta = {
    date: String(bet.date || '').trim(),
    home: String(bet.home || '').trim(),
    away: String(bet.away || '').trim(),
    market: String(bet.market || '').trim(),
    side: bet.side ? String(bet.side).trim() : '',
    line: bet.line ? String(bet.line).trim() : '',
  };
  assertBetComplete(meta); // exige date, home, away, market
  const key = betKey(meta);
  store.putTip(key, {
    ...meta,
    odd: bet.odd != null && bet.odd !== '' ? Number(bet.odd) : null,
    stakeUnits: bet.stakeUnits != null && bet.stakeUnits !== '' ? Number(bet.stakeUnits) : null,
    result: ['green', 'red', 'void'].includes(bet.result) ? bet.result : null,
    houses: null, kickoff: null, capValue: null,
    note: 'Lancada na mao pelo tipster.',
    manual: true,
    version: VERSION,
  });
  let lancadas = 0;
  for (const e of (Array.isArray(entries) ? entries : [])) {
    const clean = cleanLegs(e.legs, { exigeStake: true });
    if (!clean.length) continue; // sem stake valida => nao registra a entrada
    store.adminSetEntry(key, String(e.clientId), {
      legs: clean, line: e.line, result: e.result, clientName: rosterNameFor(e.clientId),
    });
    lancadas++;
  }
  return { betKey: key, entries: lancadas };
}

export function setClient(clientId, { name, unitValue, hidden }) {
  const patch = {};
  if (name !== undefined) patch.name = String(name);
  if (unitValue !== undefined) patch.unitValue = unitValue === null || unitValue === '' ? null : Number(unitValue);
  if (hidden !== undefined) patch.hidden = !!hidden; // oculta/reexibe o cliente no acerto
  return getStore().upsertClient(clientId, patch);
}

// Apaga a aposta e todos os reportes dela (tip + cliques), de uma vez.
export function deleteTip(betKey) {
  return getStore().purgeBet(betKey, { dryRun: false });
}

// Resultado individual de um cliente numa aposta (override). null = segue a tip.
export function setEntryResult(betKey, clientId, result) {
  if (!['green', 'red', 'void', null].includes(result)) throw new Error('resultado invalido');
  return getStore().setEntryResult(betKey, clientId, result);
}

// Visao de UM cliente (para a area do cliente no Telegram): so os dados dele.
export function buildClientView(clientId) {
  const dash = buildDashboard({});
  const id = String(clientId);
  const rosterEntry = dash.roster.find((c) => String(c.id) === id);
  const tips = dash.tips.map((t) => {
    const e = t.entries.find((x) => String(x.clientId) === id) || null;
    return {
      betKey: t.betKey, date: t.date, month: t.month,
      home: t.home, away: t.away, market: t.market, line: t.line,
      result: e && e.resultOverride ? e.resultOverride : t.result, // resultado efetivo do cliente
      estado: e ? e.estado : 'sem_resposta',
      pnlUnits: e ? e.pnlUnits : 0,
      stakeUnits: e ? e.stakeUnits : null,
      odd: e && e.legs && e.legs[0] ? e.legs[0].odd : null,
      clientLine: e ? (e.line || null) : null,
    };
  });
  return { client: { id, name: rosterEntry ? rosterEntry.name : id }, tips, meses: dash.meses };
}
