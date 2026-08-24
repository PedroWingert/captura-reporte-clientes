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
  let apostasFilter = 'all'; // 'all' | 'pending' (aguardando resposta de alguem)

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
  // Aposta "aguardando resposta" = algum cliente (nao oculto) ficou sem responder.
  function tipHasPending(tip) {
    return tip.entries.some((e) => e.estado === 'sem_resposta');
  }
  function renderApostasFiltros() {
    const box = $('apostas-filtros'); box.innerHTML = '';
    const total = state.tips.length;
    const pend = state.tips.filter(tipHasPending).length;
    const mk = (key, label) => {
      const b = document.createElement('button');
      b.className = 'fchip' + (apostasFilter === key ? ' active' : '');
      b.textContent = label;
      b.addEventListener('click', () => { apostasFilter = key; renderApostas(); });
      box.appendChild(b);
    };
    mk('all', `Todas (${total})`);
    mk('pending', `Sem resposta (${pend})`);
  }
  function renderApostas() {
    renderApostasFiltros();
    const box = $('tips'); box.innerHTML = '';
    const tips = apostasFilter === 'pending' ? state.tips.filter(tipHasPending) : state.tips;
    const empty = $('tips-empty');
    empty.hidden = tips.length > 0;
    empty.textContent = apostasFilter === 'pending'
      ? 'Nenhuma aposta aguardando resposta. 🎉'
      : 'Nenhuma tip publicada ainda.';
    for (const tip of tips) box.appendChild(tipCard(tip));
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
      const actions = document.createElement('div'); actions.style.gridColumn = '1 / -1';
      const openBtn = document.createElement('button');
      openBtn.className = 'addleg'; openBtn.textContent = '＋ lançar na mão';
      openBtn.addEventListener('click', () => { openBtn.remove(); row.appendChild(manualEntryForm(tip, en)); });
      actions.appendChild(openBtn);
      row.appendChild(actions);
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

  // Editor "na mao" para quem ficou SEM RESPOSTA (ou nao pegou): linha + stake/odd
  // + resultado individual, tudo num salvar so.
  function manualEntryForm(tip, en) {
    const wrap = document.createElement('div');
    wrap.className = 'manual-entry'; wrap.style.gridColumn = '1 / -1';

    const lineRow = document.createElement('div'); lineRow.className = 'me-line';
    lineRow.innerHTML = `<span class="muted">linha</span><input class="me-line-inp" type="text" placeholder="ex.: +0.25 (opcional)" value="${en.line ? esc(en.line) : ''}" />`;

    const legsBox = document.createElement('div'); legsBox.className = 'legs';
    const addLegRow = (leg) => {
      const l = document.createElement('div'); l.className = 'leg';
      l.innerHTML =
        `<input class="l-stake" type="number" step="0.01" placeholder="stake u" value="${leg.stakeUnits != null ? leg.stakeUnits : ''}" />` +
        `<span class="muted">@</span>` +
        `<input class="l-odd" type="number" step="0.01" placeholder="odd" value="${leg.odd != null ? leg.odd : ''}" />` +
        `<button class="rem">remover</button>`;
      l.querySelector('.rem').addEventListener('click', () => l.remove());
      legsBox.appendChild(l);
    };
    addLegRow({ stakeUnits: tip.stakeUnits != null ? tip.stakeUnits : '', odd: tip.odd != null ? tip.odd : '' });

    let chosen = null; // null = segue o resultado da tip
    const resBox = document.createElement('div'); resBox.className = 'override';
    const opts = [['green', 'G'], ['red', 'R'], ['void', 'V']];
    resBox.innerHTML = `<span class="ov-label">Resultado dele:</span>` +
      opts.map(([r, l]) => `<button type="button" class="ovbtn ${r}" data-r="${r}">${l}</button>`).join('') +
      `<button type="button" class="ovbtn eq on" data-r="">= tip</button>`;
    resBox.querySelectorAll('.ovbtn').forEach((b) => b.addEventListener('click', () => {
      chosen = b.dataset.r || null;
      resBox.querySelectorAll('.ovbtn').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
    }));

    const foot = document.createElement('div'); foot.className = 'me-foot';
    const addBtn = document.createElement('button'); addBtn.className = 'addleg'; addBtn.textContent = '+ perna';
    addBtn.addEventListener('click', () => addLegRow({ stakeUnits: '', odd: '' }));
    const saveBtn = document.createElement('button'); saveBtn.className = 'save'; saveBtn.textContent = 'salvar';
    const cancelBtn = document.createElement('button'); cancelBtn.className = 'addleg'; cancelBtn.textContent = 'cancelar';
    foot.append(addBtn, saveBtn, cancelBtn);

    saveBtn.addEventListener('click', async () => {
      const legs = [...legsBox.querySelectorAll('.leg')].map((l) => ({
        stakeUnits: Number(l.querySelector('.l-stake').value || 0),
        odd: Number(l.querySelector('.l-odd').value || 0),
      })).filter((x) => x.stakeUnits > 0);
      if (!legs.length) { alert('Informe a stake (em unidades) da pessoa.'); return; }
      const line = lineRow.querySelector('.me-line-inp').value.trim();
      try { render(await api('/api/admin/entry', { betKey: tip.betKey, clientId: en.clientId, legs, line, result: chosen })); }
      catch (e) { alert('Erro: ' + e.message); }
    });
    cancelBtn.addEventListener('click', () => reload());

    wrap.append(lineRow, legsBox, resBox, foot);
    return wrap;
  }

  // ===== APOSTA NA MAO (cria uma tip do zero + entradas dos clientes) =====
  function renderManualForm() {
    const box = $('manual-form');
    const today = new Date().toISOString().slice(0, 10);
    const rm = rosterMap();
    let tipResult = null;
    box.innerHTML =
      `<div class="card manual-card">
        <h2>Aposta na mão</h2>
        <p class="sub">Para apostas que não vieram do grupo. Escolha os clientes e a stake de cada um; ela entra no acerto e no portal deles.</p>
        <div class="mf-grid">
          <label>Data<input id="mf-date" type="date" value="${today}" /></label>
          <label>Casa<input id="mf-home" type="text" placeholder="Time da casa" /></label>
          <label>Fora<input id="mf-away" type="text" placeholder="Time visitante" /></label>
          <label>Mercado<input id="mf-market" type="text" placeholder="ex.: Over 2.5" /></label>
          <label>Lado<input id="mf-side" type="text" placeholder="opcional" /></label>
          <label>Linha<input id="mf-line" type="text" placeholder="opcional" /></label>
          <label>Stake tip (u)<input id="mf-stake" type="number" step="0.01" placeholder="opcional" /></label>
          <label>Odd divulgada<input id="mf-odd" type="number" step="0.01" placeholder="opcional" /></label>
        </div>
        <div class="mf-res override">
          <span class="ov-label">Resultado da aposta:</span>
          <button type="button" class="ovbtn green" data-r="green">G</button>
          <button type="button" class="ovbtn red" data-r="red">R</button>
          <button type="button" class="ovbtn void" data-r="void">V</button>
          <button type="button" class="ovbtn eq on" data-r="">pendente</button>
        </div>
        <h3 class="mf-cli-title">Clientes nesta aposta</h3>
        <div id="mf-clients" class="mf-clients"></div>
        <div class="me-foot">
          <button id="mf-save" class="save">Criar aposta</button>
          <button id="mf-cancel" class="addleg">cancelar</button>
        </div>
      </div>`;

    box.querySelectorAll('.mf-res .ovbtn').forEach((b) => b.addEventListener('click', () => {
      tipResult = b.dataset.r || null;
      box.querySelectorAll('.mf-res .ovbtn').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
    }));

    const cbox = box.querySelector('#mf-clients');
    for (const cl of state.roster) {
      const id = String(cl.id); const color = rm.get(id).color;
      const row = document.createElement('div'); row.className = 'mf-client';
      row.innerHTML =
        `<label class="mf-chk"><input type="checkbox" class="mf-on" /><span class="dot" style="background:${color}"></span>${esc(cl.name)}</label>` +
        `<div class="mf-inps" hidden>` +
          `<input class="mf-c-stake" type="number" step="0.01" placeholder="stake u" />` +
          `<span class="muted">@</span>` +
          `<input class="mf-c-odd" type="number" step="0.01" placeholder="odd" />` +
          `<input class="mf-c-line" type="text" placeholder="linha (opc)" /></div>`;
      row.dataset.id = id;
      const chk = row.querySelector('.mf-on'); const inps = row.querySelector('.mf-inps');
      chk.addEventListener('change', () => {
        inps.hidden = !chk.checked;
        if (chk.checked) {
          const s = box.querySelector('#mf-stake').value; const o = box.querySelector('#mf-odd').value;
          const cs = row.querySelector('.mf-c-stake'); const co = row.querySelector('.mf-c-odd');
          if (!cs.value && s) cs.value = s;
          if (!co.value && o) co.value = o;
        }
      });
      cbox.appendChild(row);
    }

    const close = () => { box.hidden = true; box.innerHTML = ''; };
    box.querySelector('#mf-cancel').addEventListener('click', close);
    box.querySelector('#mf-save').addEventListener('click', async () => {
      const g = (id) => box.querySelector(id).value.trim();
      const bet = {
        date: g('#mf-date'), home: g('#mf-home'), away: g('#mf-away'), market: g('#mf-market'),
        side: g('#mf-side'), line: g('#mf-line'),
        stakeUnits: box.querySelector('#mf-stake').value, odd: box.querySelector('#mf-odd').value,
        result: tipResult,
      };
      if (!bet.date || !bet.home || !bet.away || !bet.market) { alert('Preencha data, casa, fora e mercado.'); return; }
      const entries = [];
      for (const row of cbox.querySelectorAll('.mf-client')) {
        if (!row.querySelector('.mf-on').checked) continue;
        const stake = Number(row.querySelector('.mf-c-stake').value || 0);
        if (!(stake > 0)) continue;
        entries.push({
          clientId: row.dataset.id,
          legs: [{ stakeUnits: stake, odd: Number(row.querySelector('.mf-c-odd').value || 0) }],
          line: row.querySelector('.mf-c-line').value.trim(),
        });
      }
      if (!entries.length) { alert('Marque pelo menos um cliente com stake maior que zero.'); return; }
      try { const d = await api('/api/admin/add-tip', { bet, entries }); close(); render(d); }
      catch (e) { alert('Erro: ' + e.message); }
    });
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
        `<td class="num ${cls(units)}">${brl != null ? 'R$ ' + fmt(brl) : '—'}</td>` +
        `<td class="acao"><button class="ocultar" data-id="${esc(id)}" data-name="${esc(cl.name)}" title="Ocultar do acerto">ocultar</button>` +
        `<button class="excluir" data-id="${esc(id)}" data-name="${esc(cl.name)}" title="Excluir de vez (apaga os dados)">excluir</button></td>`;
      tb.appendChild(tr);
    }
    tb.querySelectorAll('.uv').forEach((inp) => inp.addEventListener('change', async () => {
      try { render(await api('/api/admin/client', { clientId: inp.dataset.id, unitValue: inp.value === '' ? null : Number(inp.value) })); }
      catch (e) { alert('Erro: ' + e.message); }
    }));
    tb.querySelectorAll('.ocultar').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm(`Ocultar "${b.dataset.name}" do acerto? Ele some das telas e do filtro, mas os dados ficam guardados — dá pra mostrar de novo.`)) return;
      try { render(await api('/api/admin/client', { clientId: b.dataset.id, hidden: true })); }
      catch (e) { alert('Erro: ' + e.message); }
    }));
    tb.querySelectorAll('.excluir').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm(`EXCLUIR "${b.dataset.name}" de vez? Isso apaga o cadastro e TODAS as apostas/registros dele. Não dá pra desfazer.`)) return;
      try { render(await api('/api/admin/delete-client', { clientId: b.dataset.id })); }
      catch (e) { alert('Erro: ' + e.message); }
    }));

    // Clientes ocultos: linha para reexibir.
    const hbox = $('hidden-clients');
    const hidden = state.hiddenClients || [];
    hbox.hidden = hidden.length === 0;
    hbox.innerHTML = hidden.length
      ? `<span class="hc-label">Ocultos:</span>` + hidden.map((c) =>
          `<button class="hc-chip" data-id="${esc(c.id)}" title="Mostrar de novo no acerto">${esc(c.name)} <span class="hc-x">✕</span></button>`).join('')
      : '';
    hbox.querySelectorAll('.hc-chip').forEach((b) => b.addEventListener('click', async () => {
      try { render(await api('/api/admin/client', { clientId: b.dataset.id, hidden: false })); }
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
  $('add-manual').addEventListener('click', () => {
    const box = $('manual-form');
    if (!box.hidden) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false; renderManualForm();
  });
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
