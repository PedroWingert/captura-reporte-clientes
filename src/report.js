// Relatorio: o que cada cliente reportou por tip.
//
// Armadilha 6: "nao peguei" e "nao respondeu" precisam ser distinguiveis.
// - declined  = existe registro com status 'declined' (o cliente disse que nao entrou)
// - taken     = existe registro com status 'taken'
// - different = existe registro com status 'different' (via formulario)
// - SEM_RESPOSTA = nao existe registro para (tip, cliente)
// O que nao foi registrado nao se recupera; por isso a ausencia e um estado explicito
// no relatorio, nunca confundido com recusa.

import { totalStake } from './gates.js';

const LABEL = {
  taken: 'Peguei',
  declined: 'Nao peguei',
  different: 'Peguei diferente',
};

// roster: lista opcional de clientes esperados [{ id, name }].
// Sem roster, o relatorio so mostra quem respondeu (nao da para inferir ausencia).
export function buildTipReport(store, betKey, roster = null) {
  const tip = store.getTip(betKey);
  const reports = store.reportsForTip(betKey);
  const byClient = new Map(reports.map((r) => [String(r.clientId), r]));

  const linhas = [];
  const universo = roster
    ? roster.map((c) => ({ id: String(c.id), name: c.name }))
    : reports.map((r) => ({ id: String(r.clientId), name: r.clientName }));

  for (const cli of universo) {
    const r = byClient.get(String(cli.id));
    if (!r) {
      linhas.push({
        clientId: cli.id,
        clientName: cli.name || null,
        estado: 'SEM_RESPOSTA',
        rotulo: 'Nao respondeu',
        odd: null,
        total: null,
        source: null,
        actionTs: null,
      });
      continue;
    }
    const total = r.status === 'different' ? totalStake(r.stakes) : (r.stakes ? totalStake(r.stakes) : null);
    linhas.push({
      clientId: cli.id,
      clientName: r.clientName || cli.name || null,
      estado: r.status,
      rotulo: LABEL[r.status] || r.status,
      odd: r.odd ?? null,
      total: Number.isNaN(total) ? null : total,
      stakes: r.stakes ?? null,
      source: r.source,
      actionTs: r.actionTs,
    });
  }

  const resumo = {
    taken: linhas.filter((l) => l.estado === 'taken').length,
    different: linhas.filter((l) => l.estado === 'different').length,
    declined: linhas.filter((l) => l.estado === 'declined').length,
    semResposta: linhas.filter((l) => l.estado === 'SEM_RESPOSTA').length,
    total: linhas.length,
  };

  return { betKey, tip, linhas, resumo };
}

// Formata o relatorio como texto simples para o console/CLI.
export function formatTipReport(rep) {
  const t = rep.tip;
  const cab = t
    ? `${t.home ?? '?'} x ${t.away ?? '?'}  |  ${t.market ?? '?'} ${t.side ?? ''} ${t.line ?? ''}`.trim()
    : '(tip sem metadados)';
  const linhas = rep.linhas.map((l) => {
    const nome = l.clientName || l.clientId;
    let det = l.rotulo;
    if (l.estado === 'taken') det += l.odd ? ` @${l.odd}` : '';
    if (l.estado === 'different') det += `${l.odd ? ` @${l.odd}` : ''}${l.total != null ? ` (total ${l.total})` : ''}`;
    const via = l.source ? ` [${l.source}]` : '';
    return `  - ${nome}: ${det}${via}`;
  });
  const r = rep.resumo;
  return [
    `Tip ${rep.betKey}: ${cab}`,
    ...linhas,
    `  Resumo: peguei=${r.taken} diferente=${r.different} nao-peguei=${r.declined} sem-resposta=${r.semResposta} (de ${r.total})`,
  ].join('\n');
}
