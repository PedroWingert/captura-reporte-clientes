import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTipCommand } from '../src/telegram/commands.js';

test('parseTipCommand: tip completa vira bet valido', () => {
  const txt = [
    '/tip',
    'times: Sao Paulo x Palmeiras',
    'mercado: Over 2.5 gols',
    'odd: 1,95',
    'apito: 21:30',
    'cap: 500',
    'data: 2026-08-03',
    'obs: ambos marcam',
  ].join('\n');
  const r = parseTipCommand(txt);
  assert.equal(r.ok, true);
  assert.equal(r.bet.home, 'Sao Paulo');
  assert.equal(r.bet.away, 'Palmeiras');
  assert.equal(r.bet.market, 'Over 2.5 gols');
  assert.equal(r.bet.odd, 1.95); // aceita virgula decimal
  assert.equal(r.bet.capValue, 500);
  assert.match(r.bet.kickoff, /^2026-08-03T21:30:00-03:00$/);
  assert.equal(r.bet.note, 'ambos marcam');
});

test('parseTipCommand: sem apito falha (falha fechado)', () => {
  const r = parseTipCommand('/tip\ntimes: A x B\nmercado: 1x2\nodd: 2\ncap: 100');
  assert.equal(r.ok, false);
  assert.match(r.error, /apito/);
});

test('parseTipCommand: sem cap falha (falha fechado)', () => {
  const r = parseTipCommand('/tip\ntimes: A x B\nmercado: 1x2\nodd: 2\napito: 20:00');
  assert.equal(r.ok, false);
  assert.match(r.error, /cap/);
});

test('parseTipCommand: odd invalida falha', () => {
  const r = parseTipCommand('/tip\ntimes: A x B\nmercado: 1x2\nodd: 0.9\napito: 20:00\ncap: 100');
  assert.equal(r.ok, false);
  assert.match(r.error, /odd/);
});

test('parseTipCommand: times mal formado falha', () => {
  const r = parseTipCommand('/tip\ntimes: So Paulo\nmercado: 1x2\nodd: 2\napito: 20:00\ncap: 100');
  assert.equal(r.ok, false);
  assert.match(r.error, /times/);
});

test('parseTipCommand: aceita chaves com acento e caixa alta', () => {
  const r = parseTipCommand('/tip\nJOGO: A x B\nMercado: Under\nOdd: 1.8\nHorário: 19:00\nTeto: 200');
  assert.equal(r.ok, true);
  assert.equal(r.bet.market, 'Under');
  assert.match(r.bet.kickoff, /T19:00:00-03:00$/);
});
