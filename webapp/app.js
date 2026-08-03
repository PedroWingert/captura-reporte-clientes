// Mini App (frontend). Roda dentro do Telegram. Toda decisao de negocio fica no
// servidor; aqui so montamos o formulario e mostramos a resposta ja pronta.
(function () {
  'use strict';

  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { tg.ready(); tg.expand(); }

  // initData assinado: e o que prova quem e o cliente e de qual tip se trata.
  const initData = (tg && tg.initData) || '';

  const el = (id) => document.getElementById(id);
  const housesBox = el('houses');
  const tipLine = el('tip-line');
  const formArea = el('form-area');
  const messageArea = el('message-area');
  const messageEl = el('message');
  const retryBtn = el('retry');
  const totalEl = el('total');
  const capNote = el('cap-note');
  const versionEl = el('version');

  let capValue = null;

  function houseRow() {
    const div = document.createElement('div');
    div.className = 'house';
    div.innerHTML =
      '<div class="full"><label>Casa (opcional)</label><input class="h-house" placeholder="Ex.: Bet365" /></div>' +
      '<div><label>Stake (unidades)</label><input class="h-stake" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0,75" /></div>' +
      '<div><label>Odd</label><input class="h-odd" type="number" inputmode="decimal" min="1" step="0.01" placeholder="0,00" /></div>' +
      '<button type="button" class="remove-house">remover</button>';
    div.querySelector('.remove-house').addEventListener('click', () => {
      if (housesBox.children.length > 1) { div.remove(); recomputeTotal(); }
    });
    div.querySelectorAll('input').forEach((i) => i.addEventListener('input', recomputeTotal));
    return div;
  }

  function recomputeTotal() {
    let total = 0;
    housesBox.querySelectorAll('.house').forEach((h) => {
      total += Number(h.querySelector('.h-stake').value || 0);
    });
    totalEl.textContent = (Math.round(total * 100) / 100) + 'u';
    if (capValue != null) {
      const over = total > capValue;
      capNote.textContent = `de ${capValue}u permitido`;
      capNote.style.color = over ? '#c0392b' : '';
    }
    return total;
  }

  function collectStakes() {
    const stakes = [];
    housesBox.querySelectorAll('.house').forEach((h) => {
      const house = h.querySelector('.h-house').value.trim();
      const stakeUnits = Number(h.querySelector('.h-stake').value || 0);
      const odd = Number(h.querySelector('.h-odd').value || 0);
      if (stakeUnits > 0) stakes.push({ house, stakeUnits, odd });
    });
    return stakes;
  }

  function showMessage(text, ok) {
    formArea.hidden = true;
    messageArea.hidden = false;
    messageEl.textContent = text;
    messageEl.className = ok ? 'ok' : 'err';
    retryBtn.hidden = ok; // em erro, deixa tentar de novo
  }

  async function api(path, payload) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, ...payload }),
    });
    return res.json();
  }

  async function loadTip() {
    try {
      const data = await api('/api/tip', {});
      versionEl.textContent = 'v' + (data.version || '?');
      if (!data.ok) { showMessage(data.message || 'Nao foi possivel carregar a tip.', false); return; }
      const t = data.tip;
      tipLine.textContent = `${t.home} x ${t.away} — ${t.market} ${t.side} ${t.line || ''}`.trim();
      capValue = data.tip.hasCap ? Number(data.tip.capValue) : null;
      formArea.hidden = false;
      housesBox.appendChild(houseRow());
      recomputeTotal();
    } catch (e) {
      showMessage('Falha de conexao ao carregar a tip. Verifique a internet e reabra pelo botao da tip.', false);
    }
  }

  async function submit() {
    const submitBtn = el('submit');
    const stakes = collectStakes();
    if (stakes.length === 0) {
      showMessage('Informe pelo menos uma entrada com valor maior que zero. Toque em "Tentar de novo".', false);
      return;
    }
    submitBtn.disabled = true;
    try {
      const out = await api('/api/report', { stakes });
      showMessage(out.message || (out.ok ? 'Registrado.' : 'Nao foi possivel registrar.'), !!out.ok);
      if (out.ok && tg && tg.HapticFeedback && tg.HapticFeedback.notificationOccurred) tg.HapticFeedback.notificationOccurred('success');
    } catch (e) {
      showMessage('Falha de conexao ao enviar. Toque em "Tentar de novo".', false);
    } finally {
      submitBtn.disabled = false;
    }
  }

  el('add-house').addEventListener('click', () => { housesBox.appendChild(houseRow()); });
  el('submit').addEventListener('click', submit);
  retryBtn.addEventListener('click', () => { messageArea.hidden = true; formArea.hidden = false; });

  loadTip();
})();
