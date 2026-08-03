// Dashboard de acerto de contas. Toda a conta e feita no servidor; aqui so
// renderizamos e mandamos as acoes (marcar resultado, editar perna, valor da unidade).
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const LS_KEY = 'crc_admin_token';
  let token = localStorage.getItem(LS_KEY) || '';
  let currentMonth = null;
  let state = null;

  const fmt = (n) => (n > 0 ? '+' : '') + (Math.round(n * 100) / 100);
  const cls = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  async function api(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, month: currentMonth, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('401');
    if (!data.ok) throw new Error(data.message || 'erro');
    return data;
  }

  // ---- login ----
  function showLogin(msg) {
    $('app').hidden = true;
    $('login').hidden = false;
    const e = $('login-error');
    if (msg) { e.textContent = msg; e.hidden = false; } else e.hidden = true;
  }
  async function tryEnter() {
    token = $('token').value.trim();
    if (!token) return;
    try {
      const data = await api('/api/admin/dashboard', {});
      localStorage.setItem(LS_KEY, token);
      $('login').hidden = true;
      $('app').hidden = false;
      render(data);
    } catch (err) {
      showLogin(err.message === '401' ? 'Senha incorreta.' : 'Falha: ' + err.message);
    }
  }

  // ---- render ----
  function render(data) {
    state = data;
    $('version').textContent = 'clientes: ' + data.roster.length;
    renderMeses(data);
    renderApostas(data);
    renderMes(data);
  }

  function renderMeses(data) {
    const sel = $('mes-select');
    const meses = data.meses || [];
    if (!currentMonth && meses.length) currentMonth = meses[0];
    sel.innerHTML = '';
    const optTodos = document.createElement('option');
    optTodos.value = ''; optTodos.textContent = 'Todos os meses';
    sel.appendChild(optTodos);
    for (const m of meses) {
      const o = document.createElement('option');
      o.value = m; o.textContent = m;
      if (m === currentMonth) o.selected = true;
      sel.appendChild(o);
    }
    if (!currentMonth) sel.value = '';
  }

  // Visualizacao 1: apostas
  function renderApostas(data) {
    const box = $('tips');
    box.innerHTML = '';
    $('tips-empty').hidden = data.tips.length > 0;
    for (const tip of data.tips) box.appendChild(tipCard(tip));
  }

  function tipCard(tip) {
    const card = document.createElement('div');
    card.className = 'tip-card';
    const linha = [tip.market, tip.line].filter(Boolean).join(' ');
    const meta = [tip.date || '', tip.stakeUnits != null ? `stake ${tip.stakeUnits}u` : '', tip.odd != null ? `@${tip.odd}` : '']
      .filter(Boolean).join('  ·  ');
    card.innerHTML =
      `<div class="tip-head"><h3>${esc(tip.home)} x ${esc(tip.away)}</h3><span class="tip-meta">${esc(linha)}</span></div>` +
      `<div class="tip-meta">${esc(meta)}</div>` +
      `<div class="result-buttons">
         <button class="rbtn green ${tip.result === 'green' ? 'on' : ''}" data-r="green">✅ Green</button>
         <button class="rbtn red ${tip.result === 'red' ? 'on' : ''}" data-r="red">❌ Red</button>
         <button class="rbtn void ${tip.result === 'void' ? 'on' : ''}" data-r="void">⚪ Void</button>
       </div>`;
    card.querySelectorAll('.rbtn').forEach((b) => b.addEventListener('click', async () => {
      const r = b.dataset.r === tip.result ? null : b.dataset.r; // clicar de novo desmarca
      try { render(await api('/api/admin/result', { betKey: tip.betKey, result: r })); }
      catch (e) { alert('Erro: ' + e.message); }
    }));
    for (const en of tip.entries) card.appendChild(entryRow(tip, en));
    return card;
  }

  function entryRow(tip, en) {
    const row = document.createElement('div');
    row.className = 'entry ' + en.estado;
    const tag = { taken: 'Peguei', different: 'Diferente', declined: 'Não pegou', sem_resposta: 'Sem resposta' }[en.estado] || '';
    const who = `<div class="who">${esc(en.clientName)}<span class="tag">${tag}</span></div>`;

    if (en.estado === 'declined' || en.estado === 'sem_resposta') {
      row.innerHTML = who + `<div class="pnl zero">—</div>`;
      return row;
    }

    const pnl = `<div class="pnl ${cls(en.pnlUnits)}">${tip.result ? fmt(en.pnlUnits) + 'u' : '—'}</div>`;
    const legsBox = document.createElement('div');
    legsBox.className = 'legs';

    const legs = en.legs && en.legs.length ? en.legs : [{ stakeUnits: en.stakeUnits || '', odd: '' }];
    function addLegRow(leg) {
      const l = document.createElement('div');
      l.className = 'leg';
      l.innerHTML =
        `<input class="l-stake" type="number" step="0.01" placeholder="stake u" value="${leg.stakeUnits != null ? leg.stakeUnits : ''}" />` +
        `<span class="muted">@</span>` +
        `<input class="l-odd" type="number" step="0.01" placeholder="odd" value="${Number.isNaN(Number(leg.odd)) ? '' : (leg.odd != null ? leg.odd : '')}" />` +
        `<button class="rem" title="remover">remover</button>`;
      l.querySelector('.rem').addEventListener('click', () => { l.remove(); });
      legsBox.appendChild(l);
    }
    legs.forEach(addLegRow);

    const addBtn = document.createElement('button');
    addBtn.className = 'addleg';
    addBtn.textContent = '+ perna';
    addBtn.addEventListener('click', () => addLegRow({ stakeUnits: '', odd: '' }));

    const saveBtn = document.createElement('button');
    saveBtn.className = 'save';
    saveBtn.textContent = 'salvar';
    saveBtn.addEventListener('click', async () => {
      const newLegs = [...legsBox.querySelectorAll('.leg')].map((l) => ({
        stakeUnits: Number(l.querySelector('.l-stake').value || 0),
        odd: Number(l.querySelector('.l-odd').value || 0),
      })).filter((x) => x.stakeUnits > 0);
      try { render(await api('/api/admin/entry', { betKey: tip.betKey, clientId: en.clientId, legs: newLegs })); }
      catch (e) { alert('Erro: ' + e.message); }
    });

    row.innerHTML = who;
    row.appendChild(pnlNode(tip, en));
    row.appendChild(legsBox);
    const actions = document.createElement('div');
    actions.style.gridColumn = '1 / -1';
    actions.append(addBtn, saveBtn);
    if (en.faltaOdd) { const w = document.createElement('span'); w.className = 'warn'; w.textContent = '  ⚠ falta a odd pra calcular o green'; actions.appendChild(w); }
    row.appendChild(actions);
    return row;
  }

  function pnlNode(tip, en) {
    const d = document.createElement('div');
    d.className = 'pnl ' + cls(en.pnlUnits);
    d.textContent = tip.result ? fmt(en.pnlUnits) + 'u' : '—';
    return d;
  }

  // Visualizacao 2: acerto do mes
  function renderMes(data) {
    const tb = $('mes-table').querySelector('tbody');
    tb.innerHTML = '';
    for (const t of data.totals) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td>${esc(t.name)}</td>` +
        `<td><input class="uv" type="number" step="0.01" placeholder="R$/u" value="${t.unitValue != null ? t.unitValue : ''}" data-id="${esc(t.clientId)}" /></td>` +
        `<td class="u ${cls(t.units)}">${fmt(t.units)}u</td>` +
        `<td class="brl ${cls(t.units)}">${t.brl != null ? 'R$ ' + fmt(t.brl) : '—'}</td>`;
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
    $('view-mes').hidden = t.dataset.view !== 'mes';
  }));
  $('mes-select').addEventListener('change', async (e) => {
    currentMonth = e.target.value || null;
    try { render(await api('/api/admin/dashboard', {})); } catch (err) { alert('Erro: ' + err.message); }
  });
  $('enter').addEventListener('click', tryEnter);
  $('token').addEventListener('keydown', (e) => { if (e.key === 'Enter') tryEnter(); });
  $('logout').addEventListener('click', () => { localStorage.removeItem(LS_KEY); token = ''; showLogin(); });

  // Recarrega os dados sem precisar sair/entrar.
  async function reload() {
    try { render(await api('/api/admin/dashboard', {})); }
    catch (e) { if (e.message === '401') showLogin('Sessão expirada, entre de novo.'); }
  }
  $('refresh').addEventListener('click', reload);
  // Ao voltar para a aba/janela, atualiza sozinho (pega tips publicadas nesse meio-tempo).
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('app').hidden && token) reload(); });

  // auto-login se ja tem token salvo
  if (token) {
    api('/api/admin/dashboard', {}).then((d) => { $('login').hidden = true; $('app').hidden = false; render(d); }).catch(() => showLogin());
  } else {
    showLogin();
  }
})();
