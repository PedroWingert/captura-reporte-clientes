import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestTags, cleanTags, textMentionsTeam } from '../src/tags.js';

test('extrator: handicap de cartoes de um time (com truncamento do nome)', () => {
  const t = suggestTags({ home: 'Austin', away: 'Philadelphia', market: 'Handicap de cartões - Phi', line: '-1.5' });
  assert.equal(t.tipo, 'handicap');
  assert.equal(t.unidade, 'cartoes');
  assert.equal(t.escopo, 'time');
  assert.equal(t.time, 'Philadelphia');
  assert.equal(t.linha, -1.5);
  assert.equal(t.liga, null); // liga nunca vem do texto
});

test('extrator: under de jogo (total de cartoes)', () => {
  const t = suggestTags({ home: 'A', away: 'B', market: 'Under 5.5 cartões', line: '' });
  assert.equal(t.tipo, 'under');
  assert.equal(t.unidade, 'cartoes');
  assert.equal(t.escopo, 'jogo');
  assert.equal(t.time, null);
  assert.equal(t.linha, 5.5);
});

test('extrator: over sem unidade nao inventa; com "gols" detecta', () => {
  const semUni = suggestTags({ home: 'Real', away: 'Bayern', market: 'Over 2.5', line: '' });
  assert.equal(semUni.tipo, 'over');
  assert.equal(semUni.linha, 2.5);
  assert.equal(semUni.unidade, null); // "Over 2.5" nao diz a unidade -> nao assume

  const comGols = suggestTags({ home: 'Real', away: 'Bayern', market: 'Over 2.5 gols', line: '' });
  assert.equal(comGols.unidade, 'gols');
});

test('textMentionsTeam tolera truncamento e casa exato', () => {
  assert.equal(textMentionsTeam('Handicap - Phi', 'Philadelphia'), true);
  assert.equal(textMentionsTeam('Escanteios Santos', 'Santos'), true);
  assert.equal(textMentionsTeam('Under 5.5 cartões', 'Palmeiras'), false);
});

test('cleanTags rejeita valores invalidos e normaliza a linha', () => {
  const c = cleanTags({ escopo: 'time', tipo: 'xx', unidade: 'cartoes', linha: '4,5', time: ' Santos ', liga: '' });
  assert.equal(c.escopo, 'time');
  assert.equal(c.tipo, null); // 'xx' nao e valido
  assert.equal(c.unidade, 'cartoes');
  assert.equal(c.linha, 4.5);
  assert.equal(c.time, 'Santos');
  assert.equal(c.liga, null);
});
