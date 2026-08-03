// Camada do dashboard de acerto de contas. Monta os dados (entradas por cliente,
// P/L em unidades, totais do mes) e aplica as mutacoes (resultado da tip, edicao
// de perna, cadastro de cliente). Tudo em UNIDADES; R$ = unidades x valor da unidade.
import { getStore } from './store/index.js';
import { entryPnlUnits, entryStakeUnits, entryFaltaOdd, unitsToBRL } from './settlement.js';

// Roster = cadastro de clientes juntado com os clientIds ja vistos nos reports.
export function buildRoster() {
  const store = getStore();
  const clients = store.getClients();
  const seen = new Map();
  for (const r of store.allReports()) {
    if (!seen.has(String(r.clientId))) seen.set(String(r.clientId), r.clientName);
  }
  const ids = new Set([...Object.keys(clients), ...seen.keys()]);
  const roster = [...ids].map((id) => {
    const meta = clients[id] || {};
    return { id, name: meta.name || seen.get(id) || id, unitValue: meta.unitValue ?? null };
  });
  roster.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return roster;
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
      if (r) {
        estado = r.status; // taken | declined | different
        if (r.status !== 'declined') {
          legs = r.stakes || [];
          stake = entryStakeUnits(legs);
          pnl = entryPnlUnits(legs, tip.result || null);
          faltaOdd = entryFaltaOdd(legs, tip.result || null);
        }
      }
      if ((!month || tipMonth === month)) totals.set(c.id, (totals.get(c.id) || 0) + pnl);
      return { clientId: c.id, clientName: c.name, estado, legs, stakeUnits: round2(stake), pnlUnits: round2(pnl), faltaOdd };
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

  return { roster, tips: tipViews, totals: totais, month: month || null, meses };
}

// ---- mutacoes ----
export function setResult(betKey, result) {
  const ok = ['green', 'red', 'void', null].includes(result);
  if (!ok) throw new Error('resultado invalido');
  return getStore().setTipResult(betKey, result);
}

export function setEntry(betKey, clientId, legs) {
  const clean = (Array.isArray(legs) ? legs : [])
    .map((l) => ({ house: String(l.house || '').trim(), stakeUnits: Number(l.stakeUnits), odd: Number(l.odd) }))
    .filter((l) => !Number.isNaN(l.stakeUnits));
  return getStore().setEntryLegs(betKey, clientId, clean);
}

export function setClient(clientId, { name, unitValue }) {
  const patch = {};
  if (name !== undefined) patch.name = String(name);
  if (unitValue !== undefined) patch.unitValue = unitValue === null || unitValue === '' ? null : Number(unitValue);
  return getStore().upsertClient(clientId, patch);
}
