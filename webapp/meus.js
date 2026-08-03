// Area do cliente (Mini App). Mostra SO os dados do proprio cliente, em unidades.
(function () {
  'use strict';
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { tg.ready(); tg.expand(); }
  const initData = (tg && tg.initData) || '';

  const $ = (id) => document.getElementById(id);
  const r2 = (n) => Math.round(n * 100) / 100;
  const fmt = (n) => (n > 0 ? '+' : '') + r2(n);
  const cls = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const RESULT_LABEL = { green: 'Green', red: 'Red', void: 'Void' };

  let data = null;
  let currentMonth = null;
  const COLOR = '#3987e5';

  function tipsDoMes() {
    return data.tips
      .filter((t) => !currentMonth || t.month === currentMonth)
      .slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  }

  function showMsg(text) {
    $('content').hidden = true;
    const m = $('msg'); m.textContent = text; m.hidden = false;
  }

  async function load() {
    try {
      const res = await fetch('/api/cliente/resultados', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      });
      const d = await res.json();
      if (!d.ok) { showMsg(d.message || 'Não foi possível carregar seus resultados.'); return; }
      data = d;
      $('version').textContent = 'v' + (window.__v || '');
      $('hello').textContent = 'Olá, ' + (d.client.name || 'cliente');
      currentMonth = (d.meses && d.meses[0]) || null;
      renderMesSelect();
      render();
      $('msg').hidden = true;
      $('content').hidden = false;
    } catch (e) {
      showMsg('Falha de conexão. Feche e reabra pelo botão no Telegram.');
    }
  }

  function renderMesSelect() {
    const sel = $('mes-select'); sel.innerHTML = '';
    const optAll = document.createElement('option'); optAll.value = ''; optAll.textContent = 'Todos os meses'; sel.appendChild(optAll);
    for (const m of (data.meses || [])) {
      const o = document.createElement('option'); o.value = m; o.textContent = m;
      if (m === currentMonth) o.selected = true; sel.appendChild(o);
    }
    if (!currentMonth) sel.value = '';
    sel.onchange = (e) => { currentMonth = e.target.value || null; render(); };
  }

  function render() {
    const tips = tipsDoMes();
    $('period').textContent = currentMonth ? ('Período: ' + currentMonth) : 'Todos os meses';

    // stats (so apostas que o cliente participou)
    const minhas = tips.filter((t) => t.estado !== 'sem_resposta' && t.estado !== 'declined');
    let units = 0, greens = 0, reds = 0;
    for (const t of minhas) {
      units += Number(t.pnlUnits || 0);
      if (t.result === 'green') greens++; else if (t.result === 'red') reds++;
    }
    units = r2(units);
    const decididas = greens + reds;
    const winrate = decididas ? Math.round((greens / decididas) * 100) : null;
    const tiles = [
      { k: 'Resultado', v: fmt(units) + 'u', c: cls(units) },
      { k: 'Greens', v: greens, c: 'zero' },
      { k: 'Reds', v: reds, c: 'zero' },
      { k: 'Aproveitamento', v: winrate == null ? '—' : winrate + '%', c: 'zero' },
    ];
    $('tiles').innerHTML = tiles.map((t) => `<div class="tile"><div class="k">${t.k}</div><div class="v ${t.c}">${t.v}</div></div>`).join('');

    // grafico (serie unica, acumulado por data)
    const temResultado = tips.some((t) => t.result);
    $('chart-empty').hidden = tips.length > 0 && temResultado;
    const chartBox = $('chart');
    if (tips.length && temResultado) {
      let cum = 0;
      const values = tips.map((t) => { cum += Number(t.pnlUnits || 0); return r2(cum); });
      const dates = tips.map((t) => new Date((t.date || '') + 'T12:00:00').getTime());
      chartBox.style.display = '';
      window.Charts.equityChart(chartBox, { dates, series: [{ name: data.client.name || 'Você', color: COLOR, values }] });
    } else {
      chartBox.innerHTML = ''; chartBox.style.display = 'none';
    }

    // lista de apostas (mais recentes primeiro)
    const list = minhas.slice().reverse();
    $('bets-empty').hidden = list.length > 0;
    $('bets').innerHTML = list.map((t) => {
      const badge = t.result ? `<span class="badge ${t.result}">${RESULT_LABEL[t.result]}</span>` : '<span class="badge void">pendente</span>';
      const linha = [t.market, t.line].filter(Boolean).join(' ');
      const pnl = t.result ? `<div class="p ${cls(t.pnlUnits)}">${fmt(t.pnlUnits)}u</div>` : '<div class="p zero">—</div>';
      const det = [t.stakeUnits != null ? t.stakeUnits + 'u' : '', t.odd ? '@' + t.odd : '', t.clientLine ? 'linha ' + t.clientLine : ''].filter(Boolean).join(' ');
      return `<div class="bet-item">
        <div class="bet-main"><div class="t">${esc(t.home)} x ${esc(t.away)} ${badge}</div><div class="m">${esc(linha)}${det ? ' · ' + esc(det) : ''}</div></div>
        <div class="bet-right">${pnl}<div class="d">${esc(t.date || '')}</div></div>
      </div>`;
    }).join('');
  }

  load();
})();
