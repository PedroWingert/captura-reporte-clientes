import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legPnlUnits, entryPnlUnits, entryStakeUnits, entryFaltaOdd, unitsToBRL } from '../src/settlement.js';

test('green: lucro = stake * (odd - 1)', () => {
  assert.equal(legPnlUnits(1, 2, 'green'), 1);
  assert.equal(legPnlUnits(0.75, 1.95, 'green'), 0.75 * 0.95);
});

test('red: perde a stake', () => {
  assert.equal(legPnlUnits(0.75, 1.95, 'red'), -0.75);
});

test('void e pendente zeram', () => {
  assert.equal(legPnlUnits(1, 2, 'void'), 0);
  assert.equal(legPnlUnits(1, 2, null), 0);
});

test('entrada com varias pernas soma o P/L', () => {
  const legs = [{ stakeUnits: 1, odd: 2 }, { stakeUnits: 0.5, odd: 3 }];
  assert.equal(entryPnlUnits(legs, 'green'), 1 * 1 + 0.5 * 2); // 2
  assert.equal(entryPnlUnits(legs, 'red'), -1.5);
  assert.equal(entryStakeUnits(legs), 1.5);
});

test('cada cliente com odd diferente da resultado diferente', () => {
  // mesma stake, odds diferentes, green
  const a = entryPnlUnits([{ stakeUnits: 1, odd: 1.8 }], 'green');
  const b = entryPnlUnits([{ stakeUnits: 1, odd: 2.1 }], 'green');
  assert.equal(a, 0.8);
  assert.ok(Math.abs(b - 1.1) < 1e-9);
  assert.notEqual(a, b);
});

test('falta odd no green e sinalizado', () => {
  assert.equal(entryFaltaOdd([{ stakeUnits: 1, odd: NaN }], 'green'), true);
  assert.equal(entryFaltaOdd([{ stakeUnits: 1, odd: NaN }], 'red'), false); // no red a odd nao importa
  assert.equal(entryFaltaOdd([{ stakeUnits: 1, odd: 2 }], 'green'), false);
});

test('unidades para reais usa o valor da unidade do cliente', () => {
  assert.equal(unitsToBRL(0.8, 100), 80);
  assert.equal(unitsToBRL(-1.5, 50), -75);
  assert.equal(unitsToBRL(1, null), null);
});
