import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legPnlUnits, entryPnlUnits, entryStakeUnits, entryFaltaOdd, entryResolved, unitsToBRL } from '../src/settlement.js';

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

test('resultado por perna: cada perna pode ter seu proprio green/red', () => {
  // cliente "Diferente": 1u bateu (green) e 0.5u deu (red), em linhas diferentes.
  const legs = [
    { stakeUnits: 1, odd: 1.62, result: 'green' },
    { stakeUnits: 0.5, odd: 2, result: 'red' },
  ];
  // resultado da tip = null: cada perna vale pelo seu proprio resultado.
  assert.ok(Math.abs(entryPnlUnits(legs, null) - (1 * 0.62 - 0.5)) < 1e-9); // +0.12
  // perna sem resultado proprio segue o fallback (resultado da tip/override).
  const mix = [{ stakeUnits: 1, odd: 2, result: 'red' }, { stakeUnits: 1, odd: 2 }];
  assert.equal(entryPnlUnits(mix, 'green'), -1 + 1); // 1a red (proprio), 2a green (fallback) => 0
});

test('falta odd olha o resultado proprio da perna', () => {
  const legs = [{ stakeUnits: 1, odd: NaN, result: 'green' }, { stakeUnits: 1, odd: 2, result: 'red' }];
  assert.equal(entryFaltaOdd(legs, null), true); // a perna green sem odd sinaliza
  assert.equal(entryFaltaOdd([{ stakeUnits: 1, odd: NaN, result: 'red' }], 'green'), false);
});

test('entryResolved: perna com resultado ja resolve a entrada', () => {
  assert.equal(entryResolved([{ stakeUnits: 1, odd: 2 }], null), false);
  assert.equal(entryResolved([{ stakeUnits: 1, odd: 2, result: 'red' }], null), true);
  assert.equal(entryResolved([{ stakeUnits: 1, odd: 2 }], 'green'), true);
});

test('unidades para reais usa o valor da unidade do cliente', () => {
  assert.equal(unitsToBRL(0.8, 100), 80);
  assert.equal(unitsToBRL(-1.5, 50), -75);
  assert.equal(unitsToBRL(1, null), null);
});
