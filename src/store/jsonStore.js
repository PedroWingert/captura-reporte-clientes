// Armazenamento local em JSON, atras de uma interface pequena.
// Nao e um banco de verdade — e o "local" do briefing, com escrita atomica.
// Trocavel por um banco na nuvem sem mudar quem chama (ver store/index.js).
import fs from 'node:fs';
import path from 'node:path';

function nowIso() {
  return new Date().toISOString();
}

function emptyDb() {
  // reports: mapa "<betKey>:<clientId>" -> registro
  // tips:    mapa "<betKey>" -> metadados da tip (kickoff, cap, result, etc.)
  // seenAuth: mapa "<hash>" -> auth_date, para barrar replay do initData
  // clients: mapa "<clientId>" -> { name, unitValue } (cadastro para o acerto)
  return { reports: {}, tips: {}, seenAuth: {}, clients: {} };
}

export class JsonStore {
  constructor(file) {
    this.file = file;
    this.db = emptyDb();
    this._load();
  }

  _load() {
    try {
      const text = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(text);
      this.db = { ...emptyDb(), ...parsed };
    } catch {
      this.db = emptyDb();
    }
  }

  _flush() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    fs.renameSync(tmp, this.file); // escrita atomica: nunca deixa arquivo pela metade
  }

  // ---- tips ----
  putTip(betKey, meta) {
    this.db.tips[betKey] = { betKey, ...meta, updatedTs: nowIso() };
    this._flush();
    return this.db.tips[betKey];
  }

  getTip(betKey) {
    return this.db.tips[betKey] || null;
  }

  listTips() {
    return Object.values(this.db.tips);
  }

  // ---- reports ----
  _rk(betKey, clientId) {
    return `${betKey}:${clientId}`;
  }

  getReport(betKey, clientId) {
    return this.db.reports[this._rk(betKey, clientId)] || null;
  }

  // Upsert por (betKey, clientId) com precedencia por actionTs.
  // Armadilha 7: entrega atrasada NAO herda prioridade de acao recente.
  // Retorna { applied, record } — applied=false quando foi ignorado por ser mais velho.
  upsertReport(record) {
    if (!record.betKey || !record.clientId) {
      throw new Error('upsertReport exige betKey e clientId');
    }
    const key = this._rk(record.betKey, record.clientId);
    const prev = this.db.reports[key];
    const incomingTs = record.actionTs || nowIso();
    const merged = {
      betKey: record.betKey,
      clientId: record.clientId,
      clientName: record.clientName ?? prev?.clientName ?? null,
      status: record.status, // 'taken' | 'declined' | 'different'
      odd: record.odd ?? null,
      stakes: record.stakes ?? null, // array de pernas {house, stakeUnits, odd}
      line: record.line ?? prev?.line ?? null, // linha diferente informada pelo cliente
      source: record.source, // 'button' | 'form'
      actionTs: incomingTs,
      receivedTs: nowIso(),
      version: record.version ?? null,
    };

    if (prev) {
      // Compara o carimbo de acao, sempre.
      if (new Date(incomingTs).getTime() < new Date(prev.actionTs).getTime()) {
        return { applied: false, record: prev, reason: 'mais-antigo-que-o-atual' };
      }
      // Idempotencia: mesma acao reenviada (mesmo status/ts) nao muda nada relevante.
      if (
        new Date(incomingTs).getTime() === new Date(prev.actionTs).getTime() &&
        prev.status === merged.status
      ) {
        return { applied: false, record: prev, reason: 'idempotente' };
      }
    }

    this.db.reports[key] = merged;
    this._flush();
    return { applied: true, record: merged };
  }

  reportsForTip(betKey) {
    return Object.values(this.db.reports).filter((r) => r.betKey === betKey);
  }

  allReports() {
    return Object.values(this.db.reports);
  }

  // ---- resultado da tip (green | red | void | null) ----
  setTipResult(betKey, result) {
    const tip = this.db.tips[betKey];
    if (!tip) return null;
    tip.result = result; // 'green' | 'red' | 'void' | null
    tip.resultTs = new Date().toISOString();
    this._flush();
    return tip;
  }

  // ---- edicao das pernas de uma entrada (stake/odd) pelo dashboard ----
  setEntryLegs(betKey, clientId, legs) {
    const key = this._rk(betKey, clientId);
    const r = this.db.reports[key];
    if (!r) return null;
    r.stakes = legs;
    r.editedTs = new Date().toISOString();
    this._flush();
    return r;
  }

  // ---- resultado individual de um cliente numa aposta (override do resultado da tip) ----
  // Usado quando o cliente pegou linha diferente e o resultado dele diverge dos outros.
  setEntryResult(betKey, clientId, result) {
    const key = this._rk(betKey, clientId);
    const r = this.db.reports[key];
    if (!r) return null;
    r.resultOverride = result; // 'green' | 'red' | 'void' | null (null = segue a tip)
    this._flush();
    return r;
  }

  // ---- lancamento manual de uma entrada pelo dashboard (acerto de contas) ----
  // Cria OU atualiza a entrada de um cliente numa aposta, incluindo quem ficou
  // "sem resposta". Diferente do upsertReport, este NAO passa pela precedencia por
  // actionTs: e uma acao explicita do tipster, entao sempre vale. Aceita legs, linha
  // e resultado individual (override) de uma vez. Campos ausentes (undefined) sao
  // preservados do registro anterior.
  adminSetEntry(betKey, clientId, { legs, line, result, clientName } = {}) {
    const key = this._rk(betKey, clientId);
    const prev = this.db.reports[key] || null;
    const now = new Date().toISOString();
    const nextLine = line !== undefined ? (line ? String(line).trim() : null) : (prev ? prev.line : null);
    const nextStakes = legs !== undefined ? legs : (prev ? prev.stakes : null);
    const rec = {
      betKey,
      clientId: String(clientId),
      clientName: clientName != null ? clientName : (prev ? prev.clientName : null),
      // linha informada => "different"; senao "taken" (pegou como divulgado).
      status: nextLine ? 'different' : 'taken',
      odd: prev ? prev.odd : null,
      stakes: nextStakes,
      line: nextLine,
      resultOverride: result !== undefined ? (result || null) : (prev ? prev.resultOverride : null),
      source: prev ? prev.source : 'admin',
      actionTs: prev ? prev.actionTs : now,
      receivedTs: prev ? prev.receivedTs : now,
      editedTs: now,
      version: prev ? prev.version : null,
    };
    this.db.reports[key] = rec;
    this._flush();
    return rec;
  }

  // ---- cadastro de clientes (nome amigavel + valor da unidade em R$) ----
  getClients() {
    return this.db.clients;
  }

  upsertClient(clientId, patch) {
    const id = String(clientId);
    const prev = this.db.clients[id] || {};
    this.db.clients[id] = { ...prev, ...patch };
    this._flush();
    return this.db.clients[id];
  }

  // Remove um cliente de vez: apaga o cadastro E todos os reportes dele (em todas
  // as apostas). Usado para descartar usuarios de teste. Retorna o que foi removido.
  deleteClient(clientId) {
    const id = String(clientId);
    const hadClient = Object.prototype.hasOwnProperty.call(this.db.clients, id);
    delete this.db.clients[id];
    let removedReports = 0;
    for (const key of Object.keys(this.db.reports)) {
      if (String(this.db.reports[key].clientId) === id) { delete this.db.reports[key]; removedReports++; }
    }
    this._flush();
    return { clientId: id, removedClient: hadClient, removedReports };
  }

  // ---- replay do initData ----
  // Retorna true se o hash ja foi visto (replay). Registra na primeira vez.
  markAuthSeen(hash, authDate) {
    if (this.db.seenAuth[hash]) return true;
    this.db.seenAuth[hash] = authDate;
    this._flush();
    return false;
  }

  // ---- limpeza (armadilha 9) ----
  // Remove tudo que aponta para uma aposta. Retorna o que foi/seria removido.
  purgeBet(betKey, { dryRun = true } = {}) {
    const tip = this.db.tips[betKey] || null;
    const reports = this.reportsForTip(betKey);
    if (!dryRun) {
      delete this.db.tips[betKey];
      for (const r of reports) delete this.db.reports[this._rk(r.betKey, r.clientId)];
      this._flush();
    }
    return { betKey, tip, reports, removedTips: tip ? 1 : 0, removedReports: reports.length };
  }
}
