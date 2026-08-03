// Servidor: serve a pagina do Mini App e expoe a API (a "funcao serverless" do
// briefing, aqui embutida no mesmo processo para rodar local sem infra).
//
// Regras de seguranca aplicadas aqui:
//  - A identidade do cliente vem do initData ASSINADO (nao do corpo da requisicao).
//  - A chave da aposta vem do start_param, que tambem esta dentro do initData assinado.
//    Assim o cliente nao consegue reportar no lugar de outro nem apontar para outra tip.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { validateInitData } from './telegram/initData.js';
import { getStore } from './store/index.js';
import { recordForm } from './service.js';
import { buildDashboard, setResult, setEntry, setClient, deleteTip, buildClientView, setEntryResult } from './admin.js';
import { VERSION, BOOTED_AT } from './version.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEBAPP = path.resolve(HERE, '..', 'webapp');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function send(res, status, body, headers = {}) {
  const base = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  res.writeHead(status, { ...base, ...headers });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function serveStatic(res, file) {
  const full = path.join(WEBAPP, file);
  // Impede escapar da pasta webapp.
  if (!full.startsWith(WEBAPP)) return send(res, 403, { error: 'proibido' });
  fs.readFile(full, (err, data) => {
    if (err) return send(res, 404, { error: 'nao encontrado' });
    const ext = path.extname(full).toLowerCase();
    send(res, 200, data, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  });
}

function readJsonBody(req, limitBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) { reject(new Error('corpo grande demais')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(new Error('json invalido')); }
    });
    req.on('error', reject);
  });
}

function clientNameFrom(user) {
  if (!user) return null;
  const nome = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return nome || user.username || String(user.id);
}

// Valida initData e devolve { clientId, clientName, betKey } ou lanca objeto de erro.
function authFrom(body) {
  const v = validateInitData(body.initData, {
    botToken: config.botToken,
    maxAgeSeconds: config.initDataMaxAgeSeconds,
    store: getStore(),
  });
  if (!v.ok) throw { status: 401, payload: { ok: false, code: 'AUTH', message: `Sessao invalida: ${v.error}. Feche e reabra pelo botao da tip no canal.` } };
  const clientId = String(v.user?.id || '');
  if (!clientId) throw { status: 401, payload: { ok: false, code: 'SEM_USUARIO', message: 'Nao identifiquei seu usuario do Telegram. Reabra pelo botao da tip.' } };
  const betKey = v.startParam;
  if (!betKey) throw { status: 400, payload: { ok: false, code: 'SEM_TIP', message: 'Abra o formulario pelo botao "Peguei diferente" da tip, para eu saber de qual aposta se trata.' } };
  return { clientId, clientName: clientNameFrom(v.user), betKey };
}

// Nota: o replay (uso unico do initData) e checado dentro de validateInitData.
// Como /api/tip e /api/report validam separadamente, o Mini App envia o initData
// so uma vez para /api/report; /api/tip usa um caminho que NAO consome replay.
function authForRead(body) {
  const v = validateInitData(body.initData, {
    botToken: config.botToken,
    maxAgeSeconds: config.initDataMaxAgeSeconds,
    store: null, // leitura nao consome o uso unico
  });
  if (!v.ok) throw { status: 401, payload: { ok: false, code: 'AUTH', message: `Sessao invalida: ${v.error}. Feche e reabra pelo botao da tip.` } };
  return { clientId: String(v.user?.id || ''), clientName: clientNameFrom(v.user), betKey: v.startParam };
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/version' && req.method === 'GET') {
    return send(res, 200, { version: VERSION, bootedAt: BOOTED_AT });
  }

  if (url.pathname === '/api/tip' && req.method === 'POST') {
    let body;
    try { body = await readJsonBody(req); } catch (e) { return send(res, 400, { ok: false, message: e.message }); }
    let auth;
    try { auth = authForRead(body); } catch (e) { return send(res, e.status || 500, e.payload || { ok: false }); }
    const tip = getStore().getTip(auth.betKey);
    if (!tip) return send(res, 404, { ok: false, code: 'TIP_DESCONHECIDA', message: 'Esta tip nao foi encontrada. Volte ao canal e abra pelo botao da mensagem da tip.' });
    // So expoe o necessario para o formulario exibir.
    return send(res, 200, {
      ok: true,
      version: VERSION,
      client: { id: auth.clientId, name: auth.clientName },
      tip: {
        betKey: tip.betKey, home: tip.home, away: tip.away, market: tip.market,
        side: tip.side, line: tip.line, odd: tip.odd, kickoff: tip.kickoff,
        hasCap: tip.capValue !== undefined && tip.capValue !== null,
        capValue: tip.capValue ?? null,
      },
    });
  }

  if (url.pathname === '/api/report' && req.method === 'POST') {
    let body;
    try { body = await readJsonBody(req); } catch (e) { return send(res, 400, { ok: false, message: e.message }); }
    let auth;
    try { auth = authFrom(body); } catch (e) { return send(res, e.status || 500, e.payload || { ok: false }); }

    const stakes = Array.isArray(body.stakes) ? body.stakes : [];
    const out = recordForm({
      betKey: auth.betKey,
      clientId: auth.clientId,
      clientName: auth.clientName,
      stakes,
      line: typeof body.line === 'string' ? body.line.trim() : '',
    });
    // Recusa de portao tambem responde 200 com ok:false e a mensagem-guia (armadilha 5).
    return send(res, 200, out);
  }

  // ---- API do dashboard de acerto de contas (protegida por senha) ----
  if (url.pathname.startsWith('/api/admin/')) {
    if (!config.adminDashToken) {
      return send(res, 503, { ok: false, message: 'Dashboard desativado: defina ADMIN_DASH_TOKEN no servidor.' });
    }
    let body;
    try { body = await readJsonBody(req); } catch (e) { return send(res, 400, { ok: false, message: e.message }); }
    // Confere a senha em tempo ~constante.
    const a = Buffer.from(String(body.token || ''));
    const b = Buffer.from(config.adminDashToken);
    const okToken = a.length === b.length && (await import('node:crypto')).timingSafeEqual(a, b);
    if (!okToken) return send(res, 401, { ok: false, message: 'Senha do dashboard incorreta.' });

    if (url.pathname === '/api/admin/dashboard') {
      return send(res, 200, { ok: true, ...buildDashboard({ month: body.month || null }) });
    }
    if (url.pathname === '/api/admin/result') {
      const tip = setResult(body.betKey, body.result ?? null);
      if (!tip) return send(res, 404, { ok: false, message: 'Tip nao encontrada.' });
      return send(res, 200, { ok: true, ...buildDashboard({ month: body.month || null }) });
    }
    if (url.pathname === '/api/admin/entry') {
      const r = setEntry(body.betKey, body.clientId, body.legs || []);
      if (!r) return send(res, 404, { ok: false, message: 'Entrada nao encontrada (cliente nao respondeu esta tip).' });
      return send(res, 200, { ok: true, ...buildDashboard({ month: body.month || null }) });
    }
    if (url.pathname === '/api/admin/client') {
      setClient(body.clientId, { name: body.name, unitValue: body.unitValue });
      return send(res, 200, { ok: true, ...buildDashboard({ month: body.month || null }) });
    }
    if (url.pathname === '/api/admin/delete-tip') {
      const out = deleteTip(body.betKey);
      return send(res, 200, { ok: true, removed: out.removedReports, ...buildDashboard({ month: body.month || null }) });
    }
    if (url.pathname === '/api/admin/entry-result') {
      const r = setEntryResult(body.betKey, body.clientId, body.result ?? null);
      if (!r) return send(res, 404, { ok: false, message: 'Entrada nao encontrada.' });
      return send(res, 200, { ok: true, ...buildDashboard({ month: body.month || null }) });
    }
    return send(res, 404, { ok: false, error: 'rota admin desconhecida' });
  }

  // ---- Area do cliente (Mini App): so os dados do proprio cliente ----
  if (url.pathname === '/api/cliente/resultados' && req.method === 'POST') {
    let body;
    try { body = await readJsonBody(req); } catch (e) { return send(res, 400, { ok: false, message: e.message }); }
    const v = validateInitData(body.initData, { botToken: config.botToken, maxAgeSeconds: config.initDataMaxAgeSeconds, store: null });
    if (!v.ok) return send(res, 401, { ok: false, message: `Sessao invalida: ${v.error}. Reabra pelo botao no Telegram.` });
    const clientId = String(v.user?.id || '');
    if (!clientId) return send(res, 401, { ok: false, message: 'Nao identifiquei seu usuario do Telegram.' });
    return send(res, 200, { ok: true, ...buildClientView(clientId) });
  }

  return send(res, 404, { ok: false, error: 'rota desconhecida' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, config.publicUrl);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname === '/' || url.pathname === '/index.html') return serveStatic(res, 'index.html');
    if (url.pathname === '/app.js') return serveStatic(res, 'app.js');
    if (url.pathname === '/styles.css') return serveStatic(res, 'styles.css');
    if (url.pathname === '/admin' || url.pathname === '/admin.html') return serveStatic(res, 'admin.html');
    if (url.pathname === '/admin.js') return serveStatic(res, 'admin.js');
    if (url.pathname === '/admin.css') return serveStatic(res, 'admin.css');
    if (url.pathname === '/charts.js') return serveStatic(res, 'charts.js');
    if (url.pathname === '/meus' || url.pathname === '/meus.html') return serveStatic(res, 'meus.html');
    if (url.pathname === '/meus.js') return serveStatic(res, 'meus.js');
    if (url.pathname === '/meus.css') return serveStatic(res, 'meus.css');
    return send(res, 404, { error: 'nao encontrado' });
  } catch (err) {
    console.error('[server] erro nao tratado:', err);
    return send(res, 500, { ok: false, message: 'erro interno' });
  }
});

server.listen(config.port, () => {
  console.log(`[server] v${VERSION} ouvindo em ${config.publicUrl} (porta ${config.port})`);
  console.log(`[server] Mini App: ${config.publicUrl}/  |  build ${BOOTED_AT}`);
});

export { server };
