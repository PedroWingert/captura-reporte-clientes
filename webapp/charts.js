// Graficos SVG feitos a mao (sem biblioteca). Paleta validada para daltonismo.
// Contrato: as series compartilham o mesmo eixo X (mesmas datas), o que deixa o
// crosshair do hover limpo. Tudo em unidades.
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const INK = '#ffffff', INK2 = '#c3c2b7', MUTED = '#898781', GRID = '#2c2c2a', BASE = '#383835';

  const el = (name, attrs, parent) => {
    const n = document.createElementNS(NS, name);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const fmtU = (n) => (n > 0 ? '+' : '') + (Math.round(n * 100) / 100) + 'u';
  const fmtDate = (ts) => { const d = new Date(ts); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };

  // "nice" ticks para o eixo Y
  function niceTicks(min, max, count) {
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    const step0 = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag;
    const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
    return ticks;
  }

  // container: elemento DOM. data: { dates:[ts], series:[{name,color,values:[y]}] }
  function equityChart(container, data) {
    container.innerHTML = '';
    container.style.position = 'relative';
    const W = container.clientWidth || 640;
    const H = 300;
    const P = { top: 18, right: 84, bottom: 30, left: 44 };
    const iw = W - P.left - P.right, ih = H - P.top - P.bottom;

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, style: 'display:block' }, container);

    const dates = data.dates;
    const n = dates.length;
    const allY = [0];
    for (const s of data.series) for (const v of s.values) allY.push(v);
    let ymin = Math.min(...allY), ymax = Math.max(...allY);
    const ticks = niceTicks(ymin, ymax, 4);
    ymin = Math.min(ymin, ticks[0]); ymax = Math.max(ymax, ticks[ticks.length - 1]);

    const xAt = (i) => n <= 1 ? P.left + iw / 2 : P.left + (iw * i) / (n - 1);
    const yAt = (v) => P.top + ih * (1 - (v - ymin) / (ymax - ymin || 1));

    // gridlines + rotulos Y
    for (const t of ticks) {
      const y = yAt(t);
      el('line', { x1: P.left, y1: y, x2: P.left + iw, y2: y, stroke: t === 0 ? BASE : GRID, 'stroke-width': t === 0 ? 1.5 : 1 }, svg);
      const lbl = el('text', { x: P.left - 8, y: y + 3.5, 'text-anchor': 'end', fill: MUTED, 'font-size': 11 }, svg);
      lbl.textContent = (Math.round(t * 100) / 100);
    }

    // rotulos X (datas) — no maximo ~6
    const stepX = Math.max(1, Math.ceil(n / 6));
    for (let i = 0; i < n; i += stepX) {
      const x = xAt(i);
      const t = el('text', { x, y: H - 10, 'text-anchor': 'middle', fill: MUTED, 'font-size': 11 }, svg);
      t.textContent = fmtDate(dates[i]);
    }

    // linhas + area (area so quando 1 serie)
    const single = data.series.length === 1;
    const ends = [];
    data.series.forEach((s) => {
      if (!n) return;
      const pts = s.values.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ');
      if (single) {
        const areaPts = `${xAt(0)},${yAt(0)} ${pts} ${xAt(n - 1)},${yAt(0)}`;
        const grad = el('linearGradient', { id: 'g_' + s.color.slice(1), x1: 0, y1: 0, x2: 0, y2: 1 }, svg);
        el('stop', { offset: '0%', 'stop-color': s.color, 'stop-opacity': 0.28 }, grad);
        el('stop', { offset: '100%', 'stop-color': s.color, 'stop-opacity': 0 }, grad);
        el('polygon', { points: areaPts, fill: `url(#g_${s.color.slice(1)})` }, svg);
      }
      el('polyline', { points: pts, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      s.values.forEach((v, i) => el('circle', { cx: xAt(i), cy: yAt(v), r: 3, fill: s.color }, svg));
      // guarda a posicao do rotulo do fim (so o primeiro nome, curto)
      ends.push({ y: yAt(s.values[n - 1]), name: String(s.name).split(' ')[0], color: s.color });
    });

    // Rotulos no fim das linhas, empurrados pra nao colidir.
    if (n && ends.length) {
      const gap = 13;
      ends.sort((a, b) => a.y - b.y);
      for (let i = 1; i < ends.length; i++) if (ends[i].y < ends[i - 1].y + gap) ends[i].y = ends[i - 1].y + gap;
      // se estourou embaixo, empurra o conjunto pra cima
      const overflow = ends[ends.length - 1].y - (P.top + ih);
      if (overflow > 0) for (const e of ends) e.y -= overflow;
      const lx = xAt(n - 1) + 8;
      for (const e of ends) {
        el('circle', { cx: lx + 3, cy: e.y, r: 3.5, fill: e.color }, svg);
        const tx = el('text', { x: lx + 10, y: e.y + 3.5, fill: INK2, 'font-size': 11 }, svg);
        tx.textContent = e.name;
      }
    }

    // camada de hover: crosshair + tooltip
    const cross = el('line', { y1: P.top, y2: P.top + ih, stroke: MUTED, 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0 }, svg);
    const tip = document.createElement('div');
    tip.className = 'chart-tip'; tip.style.display = 'none';
    container.appendChild(tip);
    const overlay = el('rect', { x: P.left, y: P.top, width: iw, height: ih, fill: 'transparent' }, svg);
    overlay.style.cursor = 'crosshair';
    function move(ev) {
      if (!n) return;
      const rect = svg.getBoundingClientRect();
      const px = (ev.clientX - rect.left) * (W / rect.width);
      let i = n <= 1 ? 0 : Math.round(((px - P.left) / iw) * (n - 1));
      i = Math.max(0, Math.min(n - 1, i));
      cross.setAttribute('x1', xAt(i)); cross.setAttribute('x2', xAt(i)); cross.setAttribute('opacity', 1);
      let html = `<div class="ct-date">${new Date(dates[i]).toLocaleDateString('pt-BR')}</div>`;
      data.series.forEach((s) => {
        html += `<div class="ct-row"><span class="ct-dot" style="background:${s.color}"></span>${s.name}<b>${fmtU(s.values[i])}</b></div>`;
      });
      tip.innerHTML = html; tip.style.display = 'block';
      const tx = xAt(i) * (rect.width / W);
      tip.style.left = Math.min(rect.width - 150, Math.max(0, tx + 12)) + 'px';
      tip.style.top = '8px';
    }
    overlay.addEventListener('mousemove', move);
    overlay.addEventListener('mouseleave', () => { cross.setAttribute('opacity', 0); tip.style.display = 'none'; });
  }

  window.Charts = { equityChart, fmtU };
})();
