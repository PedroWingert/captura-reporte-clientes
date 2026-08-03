// Dashboard de acerto de contas. Conta feita no servidor (pnl por entrada);
// aqui montamos a visao: apostas (marcar resultado), tiles, grafico e acerto do mes.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const LS_KEY = 'crc_admin_token';
  let token = localStorage.getItem(LS_KEY) || '';
  let state = null;
  let currentMonth = null;
  let currentClient = null; // null = todos

  const CLIENT_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500'];
  const clientColor = (i) => CLIENT_COLORS[i] != null ? CLIENT_COLORS[i] : '#898781';

  const r2 = (n) => Math.round(n * 100) / 100;
  const fmt = (n) => (n > 0 ? '+' : '') + r2(n);
  const cls = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  async function api(path, body) {
    const res = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, month: currentMonth, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('401');
    if (!data.ok) throw new Error(data.message || 'erro');
    return data;
  }

  // ---- login ----
  function showLogin(msg) {
    $('app').hidden = true; $('login').hidden = false;
    const e = $('login-error');
    if (msg) { e.textContent = msg; e.hidden = false; } else e.hidden = true;
  }
  async function tryEnter() {
    token = $('token').value.trim();
    if (!token) return;
    try {
      const data = await api('/api/admin/dashboard', {});
      localStorage.setItem(LS_KEY, token);
      const loginEl = $('login');
      loginEl.classList.add('saindo');
      setTimeout(() => {
        loginEl.hidden = true; loginEl.classList.remove('saindo');
        $('app').hidden = false; window.scrollTo(0, 0); render(data);
      }, 220);
    } catch (err) {
      showLogin(err.message === '401' ? 'Senha incorreta.' : 'Falha: ' + err.message);
    }
  }
  async function reload() {
    try { render(await api('/api/admin/dashboard', {})); }
    catch (e) { if (e.message === '401') showLogin('Sessão expirada, entre de novo.'); }
  }

  // ---- helpers de dados ----
  function rosterMap() {
    const m = new Map();
    state.roster.forEach((c, i) => m.set(String(c.id), { ...c, idx: i, color: clientColor(i) }));
    return m;
  }
  function entryOf(tip, clientId) {
    return tip.entries.find((e) => String(e.clientId) === String(clientId)) || null;
  }
  function tipsDoMes() {
    const ts = state.tips.filter((t) => !currentMonth || t.month === currentMonth);
    return ts.slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  }

  // ---- render raiz ----
  function render(data) {
    state = data;
    const meses = data.meses || [];
    if (currentMonth == null && meses.length) currentMonth = meses[0];
    if (currentMonth && !meses.includes(currentMonth)) currentMonth = meses.length ? meses[0] : null;
    $('version').textContent = `${data.roster.length} cliente(s)` + (currentMonth ? ` · ${currentMonth}` : '');
    renderApostas();
    renderMesSelect();
    renderChips();
    renderResultados();
  }

  // ===== APOSTAS =====
  function renderApostas() {
    const box = $('tips'); box.innerHTML = '';
    $('tips-empty').hidden = state.tips.length > 0;
    for (const tip of state.tips) box.appendChild(tipCard(tip));
  }
  function tipCard(tip) {
    const card = document.createElement('div');
    card.className = 'tip-card';
    const linha = [tip.market, tip.line].filter(Boolean).join(' ');
    const meta = [tip.date || '', tip.stakeUnits != null ? `stake ${tip.stakeUnits}u` : '', tip.odd != null ? `@${tip.odd}` : ''].filter(Boolean).join('  ·  ');
    const badge = tip.result ? `<span class="badge ${tip.result}">${{ green: 'GREEN', red: 'RED', void: 'VOID' }[tip.result]}</span>` : '';
    card.innerHTML =
      `<div class="tip-head"><h3>${esc(tip.home)} x ${esc(tip.away)}</h3>${badge}<span class="tip-meta">${esc(linha)}</span><span class="spacer"></span><button class="del" title="Apagar aposta">🗑 apagar</button></div>` +
      `<div class="tip-meta">${esc(meta)}</div>` +
      `<div class="result-buttons">
         <button class="rbtn green ${tip.result === 'green' ? 'on' : ''}" data-r="green">✅ Green</button>
         <button class="rbtn red ${tip.result === 'red' ? 'on' : ''}" data-r="red">❌ Red</button>
         <button class="rbtn void ${tip.result === 'void' ? 'on' : ''}" data-r="void">⚪ Void</button>
       </div>`;
    card.querySelectorAll('.rbtn').forEach((b) => b.addEventListener('click', async () => {
      const r = b.dataset.r === tip.result ? null : b.dataset.r;
      try { render(await api('/api/admin/result', { betKey: tip.betKey, result: r })); }
      catch (e) { alert('Erro: ' + e.message); }
    }));
    card.querySelector('.del').addEventListener('click', async () => {
      if (!confirm(`Apagar a aposta "${tip.home} x ${tip.away}"? Isso remove a tip e todos os cliques dela. Não dá pra desfazer.`)) return;
      try { render(await api('/api/admin/delete-tip', { betKey: tip.betKey })); }
      catch (e) { alert('Erro: ' + e.message); }
    });
    for (const en of tip.entries) card.appendChild(entryRow(tip, en));
    return card;
  }
  function entryRow(tip, en) {
    const row = document.createElement('div');
    row.className = 'entry ' + en.estado;
    const tag = { taken: 'Peguei', different: 'Diferente', declined: 'Não pegou', sem_resposta: 'Sem resposta' }[en.estado] || '';
    const linhaTag = en.line ? `<span class="tag" style="color:#fab219">linha ${esc(en.line)}</span>` : '';
    const whoHtml = `<div class="who">${esc(en.clientName)}<span class="tag">${tag}</span>${linhaTag}</div>`;
    if (en.estado === 'declined' || en.estado === 'sem_resposta') {
      row.innerHTML = whoHtml + `<div class="pnl zero">—</div>`;
      return row;
    }
    const legsBox = document.createElement('div');
    legsBox.className = 'legs';
    const legs = en.legs && en.legs.length ? en.legs : [{ stakeUnits: en.stakeUnits || '', odd: '' }];
    const addLegRow = (leg) => {
      const l = document.createElement('div'); l.className = 'leg';
      l.innerHTML =
        `<input class="l-stake" type="number" step="0.01" placeholder="stake u" value="${leg.stakeUnits != null ? leg.stakeUnits : ''}" />` +
        `<span class="muted">@</span>` +
        `<input class="l-odd" type="number" step="0.01" placeholder="odd" value="${Number.isNaN(Number(leg.odd)) ? '' : (leg.odd != null ? leg.odd : '')}" />` +
        `<button class="rem">remover</button>`;
      l.querySelector('.rem').addEventListener('click', () => l.remove());
      legsBox.appendChild(l);
    };
    legs.forEach(addLegRow);

    const addBtn = document.createElement('button'); addBtn.className = 'addleg'; addBtn.textContent = '+ perna';
    addBtn.addEventListener('click', () => addLegRow({ stakeUnits: '', odd: '' }));
    const saveBtn = document.createElement('button'); saveBtn.className = 'save'; saveBtn.textContent = 'salvar';
    saveBtn.addEventListener('click', async () => {
      const newLegs = [...legsBox.querySelectorAll('.leg')].map((l) => ({
        stakeUnits: Number(l.querySelector('.l-stake').value || 0),
        odd: Number(l.querySelector('.l-odd').value || 0),
      })).filter((x) => x.stakeUnits > 0);
      try { render(await api('/api/admin/entry', { betKey: tip.betKey, clientId: en.clientId, legs: newLegs })); }
      catch (e) { alert('Erro: ' + e.message); }
    });

    const effResult = en.resultOverride || tip.result;
    const pnl = document.createElement('div');
    pnl.className = 'pnl ' + cls(en.pnlUnits);
    pnl.textContent = effResult ? fmt(en.pnlUnits) + 'u' : '—';

    row.innerHTML = whoHtml;
    row.appendChild(pnl);
    row.appendChild(legsBox);
    const actions = document.createElement('div'); actions.style.gridColumn = '1 / -1';
    actions.append(addBtn, saveBtn);
    if (en.faltaOdd) { const w = document.createElement('span'); w.className = 'warn'; w.textContent = '  ⚠ falta a odd pra calcular o green'; actions.appendChild(w); }
    row.appendChild(actions);

    // Resultado individual — so aparece quando o cliente pegou linha diferente.
    if (en.line) {
      const ov = document.createElement('div');
      ov.className = 'override'; ov.style.gridColumn = '1 / -1';
      const opts = [['green', 'G'], ['red', 'R'], ['void', 'V']];
      ov.innerHTML = `<span class="ov-label">Resultado dele (linha ${esc(en.line)}):</span>` +
        opts.map(([r, l]) => `<button class="ovbtn ${r} ${en.resultOverride === r ? 'on' : ''}" data-r="${r}">${l}</button>`).join('') +
        `<button class="ovbtn eq ${!en.resultOverride ? 'on' : ''}" data-r="">= tip</button>`;
      ov.querySelectorAll('.ovbtn').forEach((b) => b.addEventListener('click', async () => {
        try { render(await api('/api/admin/entry-result', { betKey: tip.betKey, clientId: en.clientId, result: b.dataset.r || null })); }
        catch (e) { alert('Erro: ' + e.message); }
      }));
      row.appendChild(ov);
    }
    return row;
  }

  // ===== RESULTADOS =====
  function renderMesSelect() {
    const sel = $('mes-select'); sel.innerHTML = '';
    const optAll = document.createElement('option'); optAll.value = ''; optAll.textContent = 'Todos os meses'; sel.appendChild(optAll);
    for (const m of (state.meses || [])) {
      const o = document.createElement('option'); o.value = m; o.textContent = m;
      if (m === currentMonth) o.selected = true; sel.appendChild(o);
    }
    if (!currentMonth) sel.value = '';
  }
  function renderChips() {
    const box = $('cli-chips'); box.innerHTML = '';
    const mk = (id, name, color) => {
      const c = document.createElement('button');
      c.className = 'chip' + ((currentClient === id) ? ' active' : '');
      c.innerHTML = (color ? `<span class="dot" style="background:${color}"></span>` : '') + esc(name);
      c.addEventListener('click', () => { currentClient = id; renderChips(); renderResultados(); });
      box.appendChild(c);
    };
    mk(null, 'Todos');
    const rm = rosterMap();
    state.roster.forEach((cl) => mk(String(cl.id), cl.name, rm.get(String(cl.id)).color));
  }

  function computeStats(scopeClientId) {
    const tips = tipsDoMes();
    let units = 0, greens = 0, reds = 0, voids = 0;
    for (const tip of tips) {
      if (scopeClientId == null) {
        if (tip.result === 'green') greens++; else if (tip.result === 'red') reds++; else if (tip.result === 'void') voids++;
        for (const e of tip.entries) units += Number(e.pnlUnits || 0);
      } else {
        const e = entryOf(tip, scopeClientId);
        if (!e || e.estado === 'declined' || e.estado === 'sem_resposta') continue;
        units += Number(e.pnlUnits || 0);
        if (tip.result === 'green') greens++; else if (tip.result === 'red') reds++; else if (tip.result === 'void') voids++;
      }
    }
    const decididas = greens + reds;
    const winrate = decididas ? Math.round((greens / decididas) * 100) : null;
    return { units: r2(units), greens, reds, voids, winrate };
  }

  function buildSeries() {
    const tips = tipsDoMes();
    const dates = tips.map((t) => new Date((t.date || '') + 'T12:00:00').getTime());
    const rm = rosterMap();
    const clientsInScope = currentClient == null
      ? state.roster.map((c) => ({ id: String(c.id), name: c.name, color: rm.get(String(c.id)).color }))
      : [{ id: currentClient, name: (rm.get(currentClient) || {}).name || currentClient, color: (rm.get(currentClient) || {}).color || '#898781' }];

    const series = clientsInScope.map((c) => {
      let cum = 0;
      const values = tips.map((tip) => {
        const e = entryOf(tip, c.id);
        cum += e ? Number(e.pnlUnits || 0) : 0;
        return r2(cum);
      });
      return { name: c.name, color: c.color, values };
    });
    return { dates, series };
  }

  function renderResultados() {
    // tiles
    const st = computeStats(currentClient);
    const tiles = [
      { k: 'Resultado', v: fmt(st.units) + 'u', c: cls(st.units) },
      { k: 'Greens', v: st.greens, c: 'zero' },
      { k: 'Reds', v: st.reds, c: 'zero' },
      { k: 'Aproveitamento', v: st.winrate == null ? '—' : st.winrate + '%', c: 'zero' },
    ];
    $('tiles').innerHTML = tiles.map((t) => `<div class="tile"><div class="k">${t.k}</div><div class="v ${t.c}">${t.v}</div></div>`).join('');

    // grafico
    const data = buildSeries();
    const temResultado = state.tips.some((t) => t.result);
    $('chart-empty').hidden = data.dates.length > 0 && temResultado;
    const chartBox = $('chart'); const legendBox = $('legend');
    if (data.dates.length && temResultado) {
      chartBox.style.display = '';
      window.Charts.equityChart(chartBox, data);
      legendBox.innerHTML = data.series.length >= 2
        ? data.series.map((s) => `<span><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</span>`).join('')
        : '';
    } else {
      chartBox.innerHTML = ''; chartBox.style.display = 'none'; legendBox.innerHTML = '';
    }

    // tabela acerto do mes
    renderMesTable();
  }

  function renderMesTable() {
    const tb = $('mes-table').querySelector('tbody'); tb.innerHTML = '';
    const tips = tipsDoMes(); const rm = rosterMap();
    for (const cl of state.roster) {
      const id = String(cl.id); const color = rm.get(id).color;
      let units = 0;
      for (const tip of tips) { const e = entryOf(tip, id); if (e) units += Number(e.pnlUnits || 0); }
      units = r2(units);
      const uv = cl.unitValue;
      const brl = uv != null && uv !== '' ? r2(units * Number(uv)) : null;
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td><span class="cli"><span class="dot" style="background:${color}"></span>${esc(cl.name)}</span></td>` +
        `<td><input class="uv" type="number" step="0.01" placeholder="R$/u" value="${uv != null ? uv : ''}" data-id="${esc(id)}" /></td>` +
        `<td class="num ${cls(units)}">${fmt(units)}u</td>` +
        `<td class="num ${cls(units)}">${brl != null ? 'R$ ' + fmt(brl) : '—'}</td>`;
      tb.appendChild(tr);
    }
    tb.querySelectorAll('.uv').forEach((inp) => inp.addEventListener('change', async () => {
      try { render(await api('/api/admin/client', { clientId: inp.dataset.id, unitValue: inp.value === '' ? null : Number(inp.value) })); }
      catch (e) { alert('Erro: ' + e.message); }
    }));
  }

  // ---- navegacao ----
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    $('view-apostas').hidden = t.dataset.view !== 'apostas';
    $('view-resultados').hidden = t.dataset.view !== 'resultados';
    if (t.dataset.view === 'resultados' && state) renderResultados();
  }));
  $('mes-select').addEventListener('change', (e) => { currentMonth = e.target.value || null; if (state) { $('version').textContent = `${state.roster.length} cliente(s)` + (currentMonth ? ` · ${currentMonth}` : ''); renderResultados(); } });
  $('enter').addEventListener('click', tryEnter);
  $('token').addEventListener('keydown', (e) => { if (e.key === 'Enter') tryEnter(); });
  $('logout').addEventListener('click', () => { localStorage.removeItem(LS_KEY); token = ''; showLogin(); });
  $('refresh').addEventListener('click', reload);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('app').hidden && token) reload(); });

  if (token) {
    api('/api/admin/dashboard', {}).then((d) => { $('login').hidden = true; $('app').hidden = false; window.scrollTo(0, 0); render(d); }).catch(() => showLogin());
  } else {
    showLogin();
  }
})();
