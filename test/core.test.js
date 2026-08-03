import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { betKey } from '../src/betkey.js';
import { validateInitData } from '../src/telegram/initData.js';
import { kickoffGate, valueCapGate, totalStake } from '../src/gates.js';
import { JsonStore } from '../src/store/jsonStore.js';
import { buildTipReport } from '../src/report.js';
import { makeInitData } from './helpers.js';

const BOT = '123456:TEST_TOKEN_ABC';

function tmpStore() {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'crc-')), 'store.json');
  return new JsonStore(f);
}

test('chave da aposta e deterministica e normaliza', () => {
  const a = betKey({ date: '2026-08-01', home: 'São Paulo ', away: 'palmeiras', market: '1x2', side: 'HOME', line: '' });
  const b = betKey({ date: '2026-08-01', home: 'sao paulo', away: 'Palmeiras', market: '1x2', side: 'home', line: '' });
  assert.equal(a, b);
  const c = betKey({ date: '2026-08-01', home: 'São Paulo', away: 'palmeiras', market: '1x2', side: 'away', line: '' });
  assert.notEqual(a, c);
});

test('initData: assinatura valida passa', () => {
  const now = 1_800_000_000_000;
  const authDate = Math.floor(now / 1000) - 10;
  const id = makeInitData({ botToken: BOT, user: { id: 42, first_name: 'Ana' }, authDate, startParam: 'abc123' });
  const v = validateInitData(id, { botToken: BOT, now });
  assert.equal(v.ok, true);
  assert.equal(v.user.id, 42);
  assert.equal(v.startParam, 'abc123');
});

test('initData: assinatura adulterada falha', () => {
  const now = 1_800_000_000_000;
  const authDate = Math.floor(now / 1000) - 10;
  let id = makeInitData({ botToken: BOT, user: { id: 42 }, authDate });
  id = id.replace('id%22%3A42', 'id%22%3A99'); // troca o id do usuario sem re-assinar
  const v = validateInitData(id, { botToken: BOT, now });
  assert.equal(v.ok, false);
});

test('initData: expirado falha', () => {
  const now = 1_800_000_000_000;
  const authDate = Math.floor(now / 1000) - 100000;
  const id = makeInitData({ botToken: BOT, user: { id: 42 }, authDate });
  const v = validateInitData(id, { botToken: BOT, now, maxAgeSeconds: 3600 });
  assert.equal(v.ok, false);
  assert.match(v.error, /expirado/);
});

test('initData: replay barrado no segundo uso', () => {
  const store = tmpStore();
  const now = 1_800_000_000_000;
  const authDate = Math.floor(now / 1000) - 10;
  const id = makeInitData({ botToken: BOT, user: { id: 42 }, authDate });
  const v1 = validateInitData(id, { botToken: BOT, now, store });
  assert.equal(v1.ok, true);
  const v2 = validateInitData(id, { botToken: BOT, now, store });
  assert.equal(v2.ok, false);
  assert.match(v2.error, /replay/);
});

test('portao do apito: sem horario nao trava no modo padrao, trava no estrito', () => {
  assert.equal(kickoffGate({ kickoff: null }).ok, true); // padrao: nao gateia
  assert.equal(kickoffGate({ kickoff: null }, { strict: true }).ok, false); // estrito: falha fechado
  assert.equal(kickoffGate(null).ok, false); // tip inexistente sempre bloqueia
});

test('portao do apito bloqueia apos o inicio (quando ha horario)', () => {
  const now = Date.parse('2026-08-01T22:00:00-03:00');
  assert.equal(kickoffGate({ kickoff: '2026-08-01T21:30:00-03:00' }, { now }).ok, false);
  assert.equal(kickoffGate({ kickoff: '2026-08-01T22:30:00-03:00' }, { now }).ok, true);
});

test('teto: sem cap nao limita no padrao, falha fechado no estrito, barra acima quando ha cap', () => {
  assert.equal(valueCapGate({ capValue: null }, 100).ok, true); // padrao: nao limita
  assert.equal(valueCapGate({ capValue: null }, 100, { strict: true }).ok, false); // estrito
  assert.equal(valueCapGate({ capValue: 500 }, 600).ok, false); // acima do teto
  assert.equal(valueCapGate({ capValue: 500 }, 500).ok, true);
  assert.equal(valueCapGate({ capValue: 500 }, 0).ok, false); // valor invalido
});

test('total das stakes soma varias casas', () => {
  assert.equal(totalStake([{ stake: 100 }, { stake: 50.5 }]), 150.5);
});

test('upsert: precedencia por actionTs, entrega atrasada nao vence', () => {
  const store = tmpStore();
  const base = { betKey: 'k1', clientId: 'c1', clientName: 'C1' };
  // acao recente pelo botao
  const r1 = store.upsertReport({ ...base, status: 'taken', source: 'button', actionTs: '2026-08-01T20:00:00Z' });
  assert.equal(r1.applied, true);
  // entrega atrasada (sync) com acao MAIS ANTIGA nao pode sobrescrever
  const r2 = store.upsertReport({ ...base, status: 'different', source: 'form', actionTs: '2026-08-01T19:00:00Z' });
  assert.equal(r2.applied, false);
  assert.equal(store.getReport('k1', 'c1').status, 'taken');
  // acao mais nova vence
  const r3 = store.upsertReport({ ...base, status: 'declined', source: 'button', actionTs: '2026-08-01T21:00:00Z' });
  assert.equal(r3.applied, true);
  assert.equal(store.getReport('k1', 'c1').status, 'declined');
});

test('upsert: clique duplo e idempotente', () => {
  const store = tmpStore();
  const rec = { betKey: 'k2', clientId: 'c1', status: 'taken', source: 'button', actionTs: '2026-08-01T20:00:00Z' };
  assert.equal(store.upsertReport(rec).applied, true);
  assert.equal(store.upsertReport(rec).applied, false); // segundo clique nao cria nova linha
  assert.equal(store.reportsForTip('k2').length, 1);
});

test('relatorio distingue nao-peguei de nao-respondeu', () => {
  const store = tmpStore();
  store.putTip('k3', { home: 'A', away: 'B', market: '1x2', side: 'home' });
  store.upsertReport({ betKey: 'k3', clientId: 'c1', clientName: 'Um', status: 'taken', source: 'button', actionTs: '2026-08-01T20:00:00Z' });
  store.upsertReport({ betKey: 'k3', clientId: 'c2', clientName: 'Dois', status: 'declined', source: 'button', actionTs: '2026-08-01T20:00:00Z' });
  const roster = [{ id: 'c1', name: 'Um' }, { id: 'c2', name: 'Dois' }, { id: 'c3', name: 'Tres' }];
  const rep = buildTipReport(store, 'k3', roster);
  assert.equal(rep.resumo.taken, 1);
  assert.equal(rep.resumo.declined, 1);
  assert.equal(rep.resumo.semResposta, 1);
  const tres = rep.linhas.find((l) => l.clientId === 'c3');
  assert.equal(tres.estado, 'SEM_RESPOSTA');
});

test('purge remove tip e reportes juntos, com preview nao destrutivo', () => {
  const store = tmpStore();
  store.putTip('k4', { home: 'A', away: 'B' });
  store.upsertReport({ betKey: 'k4', clientId: 'c1', status: 'taken', source: 'button', actionTs: '2026-08-01T20:00:00Z' });
  const preview = store.purgeBet('k4', { dryRun: true });
  assert.equal(preview.removedReports, 1);
  assert.equal(store.getTip('k4') !== null, true); // preview nao apagou
  const done = store.purgeBet('k4', { dryRun: false });
  assert.equal(done.removedReports, 1);
  assert.equal(store.getTip('k4'), null);
});
